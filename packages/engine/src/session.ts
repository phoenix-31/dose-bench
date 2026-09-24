import {
  selectQuestion,
  summarize,
  update,
  type Engine,
  type IndexedAnswer,
  type Posterior,
  type Summary,
} from "./engine.js";
import { now } from "./math.js";
import type { OptionText, Question } from "./types.js";

export interface PendingQuestion<Q extends Question> {
  readonly index: number;
  readonly question: Q;
  /** Expected information gain of this question, in bits. */
  readonly gainBits: number;
  /** Time DOSE took to choose it. */
  readonly selectMs: number;
  readonly text: OptionText | undefined;
}

export interface SessionEntry<Q extends Question> extends IndexedAnswer<Q> {
  readonly n: number;
  readonly gainBits: number;
  /** Entropy actually removed by the answer (can be negative after a surprising answer). */
  readonly realisedBits: number;
  readonly rtMs: number;
}

export interface SessionOptions {
  readonly length?: number;
  /** Start from this posterior instead of the engine prior (e.g. carry beliefs across modules). */
  readonly prior?: Posterior;
}

/** JSON record of one participant's module. Versioned so data files stay readable. */
export interface Trace {
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

/**
 * One participant, one module, live.
 *
 * ```ts
 * const s = new DoseSession(engine, { length: 10 });
 * const item = s.next();   // most informative question
 * s.answer(true);          // participant chose option A
 * s.estimate();            // posterior summary
 * s.trace();               // JSON record for your data file
 * ```
 */
export class DoseSession<P extends string = string, Q extends Question = Question> {
  readonly engine: Engine<P, Q>;
  readonly length: number;
  #posterior: Posterior;
  #history: SessionEntry<Q>[] = [];
  #pending: (PendingQuestion<Q> & { shownAt: number }) | null = null;
  #entropy: number;

  constructor(engine: Engine<P, Q>, options: SessionOptions = {}) {
    this.engine = engine;
    this.length = options.length ?? 10;
    if (!Number.isInteger(this.length) || this.length < 1)
      throw new RangeError("length must be a positive integer");
    if (options.prior && options.prior.length !== engine.nPoints)
      throw new Error("prior does not match the engine grid");
    this.#posterior = Float64Array.from(options.prior ?? engine.prior);
    this.#entropy = summarize(engine, this.#posterior).entropyBits;
  }

  get done(): boolean {
    return this.#history.length >= this.length || (this.#pending === null && this.#exhausted());
  }
  get history(): readonly SessionEntry<Q>[] {
    return this.#history;
  }
  get posterior(): Posterior {
    return this.#posterior;
  }

  #exhausted(): boolean {
    return this.#history.length >= this.engine.nQuestions;
  }

  /** The question to show now. Idempotent until `answer` is called. Returns null when the module is complete. */
  next(): PendingQuestion<Q> | null {
    if (this.#pending) return this.#pending;
    if (this.#history.length >= this.length) return null;
    const t0 = now();
    const { index, gainBits } = selectQuestion(this.engine, this.#posterior, this.#history);
    if (index < 0) return null;
    const question = this.engine.model.questions[index]!;
    this.#pending = {
      index,
      question,
      gainBits,
      selectMs: now() - t0,
      text: this.engine.model.describe?.(question),
      shownAt: now(),
    };
    return this.#pending;
  }

  /** Record the participant's choice for the current question and update beliefs. */
  answer(choseA: boolean): Summary<P> {
    this.next();
    const item = this.#pending;
    if (!item) throw new Error("DoseSession: module is complete");
    this.#posterior = update(this.engine, this.#posterior, item.index, choseA);
    const summary = summarize(this.engine, this.#posterior);
    this.#history.push({
      n: this.#history.length + 1,
      index: item.index,
      question: item.question,
      choseA,
      gainBits: item.gainBits,
      realisedBits: this.#entropy - summary.entropyBits,
      rtMs: now() - item.shownAt,
    });
    this.#entropy = summary.entropyBits;
    this.#pending = null;
    return summary;
  }

  estimate(): Summary<P> {
    return summarize(this.engine, this.#posterior);
  }

  trace(): Trace {
    const est = this.estimate().params as Record<string, { mean: number; sd: number }>;
    return {
      format: "dose-trace/1",
      model: this.engine.model.id,
      length: this.length,
      answers: this.#history.map((h) => ({
        n: h.n,
        question: h.question.id,
        choseA: h.choseA,
        rtMs: Math.round(h.rtMs),
        gainBits: round(h.gainBits, 4),
      })),
      estimate: Object.fromEntries(
        Object.entries(est).map(([k, v]) => [k, { mean: round(v.mean, 4), sd: round(v.sd, 4) }]),
      ),
    };
  }
}

const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d;
