import {
  selectQuestion,
  summarize,
  update,
  type Engine,
  type IndexedAnswer,
  type Posterior,
  type Summary,
} from "./engine.js";
import { mulberry32, now } from "./math.js";
import type { OptionText, Question } from "./types.js";
import { VERSION } from "./version.js";

export interface PendingQuestion<Q extends Question> {
  /** Position in the module, from 1. */
  readonly n: number;
  readonly index: number;
  readonly question: Q;
  /** Expected information gain of this question, in bits. */
  readonly gainBits: number;
  /** Time DOSE took to choose it. */
  readonly selectMs: number;
  readonly text: OptionText | undefined;
  /** Show option B on the left. Always false unless the session randomises sides. */
  readonly swapped: boolean;
}

export interface SessionEntry<Q extends Question> extends IndexedAnswer<Q> {
  readonly n: number;
  readonly gainBits: number;
  /** Entropy actually removed by the answer (can be negative after a surprising answer). */
  readonly realisedBits: number;
  readonly rtMs: number;
  /** Milliseconds from the start of the session to this answer. */
  readonly tMs: number;
  /** Option B was shown on the left. */
  readonly swapped: boolean;
}

/** Which side option A is shown on. "random" flips a seeded coin per question. */
export type SideMode = "fixed" | "random";

export interface SessionOptions {
  readonly length?: number;
  /** Start from this posterior instead of the engine prior (e.g. carry beliefs across modules). */
  readonly prior?: Posterior;
  /** Randomise which side option A appears on, per question. Default "fixed" (A on the left). */
  readonly sides?: SideMode;
  /** Seed for side randomisation, stored in the trace. Defaults to a random 32-bit integer. */
  readonly seed?: number;
}

export type Position = "left" | "right";

/** One answer in a trace. `choseA` is in the model's terms, whatever side A was shown on. */
export interface TraceAnswer {
  readonly n: number;
  readonly question: string;
  readonly choseA: boolean;
  /** Option B was shown on the left. */
  readonly swapped: boolean;
  readonly rtMs: number;
  /** Milliseconds from the start of the session to this answer. */
  readonly tMs: number;
  readonly gainBits: number;
}

/**
 * JSON record of one participant's module. Versioned so data files stay readable.
 *
 * Carries enough provenance to tie the data to the code and design that produced it, and enough state to
 * resume the session after a page reload (`DoseSession.resume`).
 */
export interface Trace {
  readonly format: "dose-trace/2";
  readonly model: string;
  readonly length: number;
  /** @dose-bench/engine version that ran the session. */
  readonly engine: string;
  /** `Engine.design` fingerprint: model id, grids, question space and engine prior. */
  readonly design: string;
  /** "custom" when the session started from its own prior (`SessionOptions.prior`), not the engine's. */
  readonly prior: "engine" | "custom";
  readonly sides: SideMode;
  readonly seed: number;
  /** ISO 8601 timestamps. `completedAt` is null until the last answer. */
  readonly startedAt: string;
  readonly completedAt: string | null;
  /** Times the session was resumed from a stored trace (e.g. after a page reload). */
  readonly resumes: number;
  readonly answers: readonly TraceAnswer[];
  readonly estimate: Readonly<Record<string, { readonly mean: number; readonly sd: number }>>;
}

/** The original trace format, still accepted by `fitTrace` and the validators. */
export interface TraceV1 {
  readonly format: "dose-trace/1";
  readonly model: string;
  readonly length: number;
  readonly answers: readonly {
    readonly n: number;
    readonly question: string;
    readonly choseA: boolean;
    readonly rtMs: number;
    readonly gainBits: number;
  }[];
  readonly estimate: Readonly<Record<string, { readonly mean: number; readonly sd: number }>>;
}

export type AnyTrace = Trace | TraceV1;

const randomSeed = (): number => (Math.random() * 4294967296) >>> 0;

/**
 * One participant, one module, live.
 *
 * ```ts
 * const s = new DoseSession(engine, { length: 10, sides: "random" });
 * const item = s.next();   // most informative question; item.swapped says which side A goes on
 * s.answer(true);          // participant chose option A (or s.choose("left"))
 * s.estimate();            // posterior summary
 * s.trace();               // JSON record for your data file; save it after every answer
 * DoseSession.resume(engine, saved); // pick up where a reloaded page left off
 * ```
 */
export class DoseSession<P extends string = string, Q extends Question = Question> {
  readonly engine: Engine<P, Q>;
  readonly length: number;
  readonly sides: SideMode;
  readonly seed: number;
  readonly #customPrior: boolean;
  #posterior: Posterior;
  #history: SessionEntry<Q>[] = [];
  #pending: (PendingQuestion<Q> & { shownAt: number }) | null = null;
  #entropy: number;
  #startedAt = Date.now();
  #completedAt: number | null = null;
  #resumes = 0;
  /** History length at which selection last found nothing eligible (-1: not known to be exhausted). */
  #noneLeftAt = -1;

  constructor(engine: Engine<P, Q>, options: SessionOptions = {}) {
    this.engine = engine;
    this.length = options.length ?? 10;
    if (!Number.isInteger(this.length) || this.length < 1)
      throw new RangeError("length must be a positive integer");
    if (options.prior && options.prior.length !== engine.nPoints)
      throw new Error("prior does not match the engine grid");
    this.sides = options.sides ?? "fixed";
    if (this.sides !== "fixed" && this.sides !== "random")
      throw new RangeError(`sides must be "fixed" or "random"`);
    this.seed = (options.seed ?? randomSeed()) >>> 0;
    this.#customPrior = options.prior !== undefined;
    this.#posterior = Float64Array.from(options.prior ?? engine.prior);
    this.#entropy = summarize(engine, this.#posterior).entropyBits;
  }

  /**
   * Rebuild a session from a stored trace by replaying its answers, e.g. after the participant reloads the
   * page. Selection is deterministic, so the replay asks the same questions; if it doesn't (different model
   * code or prior), this throws rather than silently mixing designs. Pass the same `prior` as the original
   * session if it had one.
   */
  static resume<P extends string, Q extends Question>(
    engine: Engine<P, Q>,
    trace: Trace,
    options: { readonly prior?: Posterior } = {},
  ): DoseSession<P, Q> {
    if (trace.format !== "dose-trace/2")
      throw new Error(`DoseSession.resume: can only resume dose-trace/2, got ${String(trace.format)}`);
    if (trace.model !== engine.model.id)
      throw new Error(
        `DoseSession.resume: trace is for model "${trace.model}", engine is "${engine.model.id}"`,
      );
    if (trace.design !== engine.design)
      throw new Error(
        `DoseSession.resume: trace was recorded with design ${trace.design}, this engine is ${engine.design}`,
      );
    if ((trace.prior === "custom") !== (options.prior !== undefined))
      throw new Error(
        trace.prior === "custom"
          ? "DoseSession.resume: trace used a custom prior; pass the same prior"
          : "DoseSession.resume: trace used the engine prior; don't pass one",
      );
    if (trace.answers.length > trace.length)
      throw new Error("DoseSession.resume: trace has more answers than its length");

    const s = new DoseSession(engine, {
      length: trace.length,
      sides: trace.sides,
      seed: trace.seed,
      ...(options.prior ? { prior: options.prior } : {}),
    });
    const started = Date.parse(trace.startedAt);
    if (Number.isFinite(started)) s.#startedAt = started;
    s.#resumes = trace.resumes + 1;
    for (const a of trace.answers) {
      const item = s.next();
      if (!item || item.question.id !== a.question)
        throw new Error(
          `DoseSession.resume: answer ${a.n} was to "${a.question}" but the engine now asks "${item?.question.id ?? "nothing"}"`,
        );
      s.#record(a.choseA, a.rtMs, a.tMs);
    }
    if (s.done) {
      const completed = trace.completedAt ? Date.parse(trace.completedAt) : NaN;
      s.#completedAt = Number.isFinite(completed) ? completed : s.#completedAt;
    }
    return s;
  }

  /** True once `length` questions are answered or no eligible question is left. */
  get done(): boolean {
    if (this.#history.length >= this.length) return true;
    if (this.#pending) return false;
    if (this.#noneLeftAt !== this.#history.length) {
      const { index } = selectQuestion(this.engine, this.#posterior, this.#history);
      this.#noneLeftAt = index < 0 ? this.#history.length : -1;
    }
    return this.#noneLeftAt === this.#history.length;
  }
  get history(): readonly SessionEntry<Q>[] {
    return this.#history;
  }
  get posterior(): Posterior {
    return this.#posterior;
  }

  /** Deterministic in (seed, n), so a resumed session shows each question on the same side. */
  #swapped(n: number): boolean {
    return this.sides === "random" && mulberry32(this.seed ^ Math.imul(n, 0x9e3779b9))() < 0.5;
  }

  /** The question to show now. Idempotent until `answer` is called. Returns null when the module is complete. */
  next(): PendingQuestion<Q> | null {
    if (this.#pending) return this.#pending;
    if (this.#history.length >= this.length) return null;
    const t0 = now();
    const { index, gainBits } = selectQuestion(this.engine, this.#posterior, this.#history);
    if (index < 0) return null;
    const question = this.engine.model.questions[index]!;
    const n = this.#history.length + 1;
    this.#pending = {
      n,
      index,
      question,
      gainBits,
      selectMs: now() - t0,
      text: this.engine.model.describe?.(question),
      swapped: this.#swapped(n),
      shownAt: now(),
    };
    return this.#pending;
  }

  /** Record the participant's choice for the current question and update beliefs. */
  answer(choseA: boolean): Summary<P> {
    this.next();
    if (!this.#pending) throw new Error("DoseSession: module is complete");
    // Clamped: a clock set backwards between a save and a resume must not produce negative times.
    return this.#record(choseA, now() - this.#pending.shownAt, Math.max(0, Date.now() - this.#startedAt));
  }

  /** Record a choice by screen position, accounting for `swapped`. */
  choose(position: Position): Summary<P> {
    const item = this.next();
    if (!item) throw new Error("DoseSession: module is complete");
    return this.answer((position === "left") !== item.swapped);
  }

  #record(choseA: boolean, rtMs: number, tMs: number): Summary<P> {
    const item = this.#pending!;
    this.#posterior = update(this.engine, this.#posterior, item.index, choseA);
    const summary = summarize(this.engine, this.#posterior);
    this.#history.push({
      n: item.n,
      index: item.index,
      question: item.question,
      choseA,
      gainBits: item.gainBits,
      realisedBits: this.#entropy - summary.entropyBits,
      rtMs,
      tMs,
      swapped: item.swapped,
    });
    this.#entropy = summary.entropyBits;
    this.#pending = null;
    if (this.done && this.#completedAt === null) this.#completedAt = Date.now();
    return summary;
  }

  estimate(): Summary<P> {
    return summarize(this.engine, this.#posterior);
  }

  trace(): Trace {
    const est = this.estimate().params as Record<string, { mean: number; sd: number }>;
    return {
      format: "dose-trace/2",
      model: this.engine.model.id,
      length: this.length,
      engine: VERSION,
      design: this.engine.design,
      prior: this.#customPrior ? "custom" : "engine",
      sides: this.sides,
      seed: this.seed,
      startedAt: new Date(this.#startedAt).toISOString(),
      completedAt: this.#completedAt === null ? null : new Date(this.#completedAt).toISOString(),
      resumes: this.#resumes,
      answers: this.#history.map((h) => ({
        n: h.n,
        question: h.question.id,
        choseA: h.choseA,
        swapped: h.swapped,
        rtMs: Math.round(h.rtMs),
        tMs: Math.round(h.tMs),
        gainBits: round(h.gainBits, 4),
      })),
      estimate: Object.fromEntries(
        Object.entries(est).map(([k, v]) => [k, { mean: round(v.mean, 4), sd: round(v.sd, 4) }]),
      ),
    };
  }
}

const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d;
