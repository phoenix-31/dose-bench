import {
  eligible,
  mulberry32,
  selectQuestion,
  summarize,
  update,
  type Engine,
  type IndexedAnswer,
  type Question,
  type Rng,
  type Theta,
} from "@dose-bench/engine";
import type { RiskParam } from "@dose-bench/models";
import { simulateDoubleMpl } from "./mpl.js";
import { accuracy, type Accuracy } from "./stats.js";

export type Policy = "dose" | "random";

export interface AgentRun<P extends string> {
  /** Posterior mean of each parameter after each question. */
  readonly path: readonly Theta<P>[];
  readonly answers: readonly IndexedAnswer[];
}

/** One simulated participant with known parameters answering `length` questions. */
export function simulateAgent<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  truth: Theta<P>,
  options: { readonly length?: number; readonly policy?: Policy; readonly rand?: Rng } = {},
): AgentRun<P> {
  const length = options.length ?? 10;
  const policy = options.policy ?? "dose";
  const rand = options.rand ?? Math.random;
  const { model } = engine;
  let p = engine.prior;
  const history: IndexedAnswer<Q>[] = [];
  const path: Theta<P>[] = [];
  for (let i = 0; i < length; i++) {
    let index: number;
    if (policy === "dose") {
      index = selectQuestion(engine, p, history).index;
    } else {
      const ok = eligible(engine, history);
      const pool: number[] = [];
      for (let q = 0; q < ok.length; q++) if (ok[q]) pool.push(q);
      index = pool.length ? pool[Math.floor(rand() * pool.length)]! : -1;
    }
    if (index < 0) break;
    const question = model.questions[index]!;
    const choseA = rand() < model.probA(truth, question);
    p = update(engine, p, index, choseA);
    history.push({ index, question, choseA });
    const s = summarize(engine, p);
    const means = {} as Record<P, number>;
    for (const n of engine.grid.names) means[n] = s.params[n].mean;
    path.push(means);
  }
  return { path, answers: history };
}

export interface RecoveryOptions<P extends string> {
  /** Simulated participants. Default 100. */
  readonly n?: number;
  /** Questions per participant. Default 10. */
  readonly length?: number;
  readonly seed?: number;
  /** Distribution of true parameters. Defaults are sensible for the bundled presets. */
  readonly draw?: (rand: Rng) => Theta<P>;
  /** Include the double-MPL baseline (risk & loss models only). Default: true when the model is risk-loss. */
  readonly mpl?: boolean;
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
}

export interface RecoveryResult<P extends string> {
  readonly n: number;
  readonly length: number;
  readonly seed: number;
  readonly params: readonly P[];
  /** accuracy[policy][param][t] is accuracy after t + 1 questions. */
  readonly byQuestion: Readonly<Record<Policy, Readonly<Record<P, readonly Accuracy[]>>>>;
  /** Double multiple price list baseline, when run. `failed` counts participants whose lambda could not be recovered. */
  readonly mpl?: { readonly rho: Accuracy; readonly lambda: Accuracy; readonly failed: number };
}

/** Default true-parameter draws, loosely centred on published estimates. */
export function defaultDraw(modelId: string): ((rand: Rng) => Record<string, number>) | undefined {
  switch (modelId) {
    case "risk-loss":
      return (r) => ({ rho: 0.45 + 0.8 * r(), lambda: 0.3 + 2.7 * r(), mu: 1 + 5 * r() });
    case "time":
      return (r) => ({ delta: 0.55 + 0.45 * r(), beta: 0.6 + 0.4 * r(), mu: 1 + 5 * r() });
    case "time-joint":
      return (r) => ({
        delta: 0.55 + 0.45 * r(),
        beta: 0.6 + 0.4 * r(),
        mu: 1 + 5 * r(),
        rho: 0.45 + 0.8 * r(),
      });
    default:
      return undefined;
  }
}

/**
 * Parameter-recovery exercise (paper §3.2, scaled down): draw people with known parameters and
 * measure how well DOSE, random question order, and (for risk & loss) a double MPL recover them.
 * Seeded: the same options always give the same numbers.
 */
export async function recovery<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  options: RecoveryOptions<P> = {},
): Promise<RecoveryResult<P>> {
  const n = options.n ?? 100;
  const length = options.length ?? 10;
  const seed = options.seed ?? 7;
  const draw = options.draw ?? (defaultDraw(engine.model.id) as ((r: Rng) => Theta<P>) | undefined);
  if (!draw)
    throw new Error(
      `recovery: no default parameter distribution for model "${engine.model.id}"; pass options.draw`,
    );
  const runMpl = options.mpl ?? engine.model.id === "risk-loss";
  const names = engine.grid.names;

  const rand = mulberry32(seed);
  const truths: Theta<P>[] = [];
  const paths: Record<Policy, Theta<P>[][]> = { dose: [], random: [] };
  const mplEst: { rho: number; lambda: number | null }[] = [];

  for (let i = 0; i < n; i++) {
    options.signal?.throwIfAborted();
    const truth = draw(rand);
    truths.push(truth);
    paths.dose.push([...simulateAgent(engine, truth, { length, policy: "dose", rand }).path]);
    paths.random.push([...simulateAgent(engine, truth, { length, policy: "random", rand }).path]);
    if (runMpl) mplEst.push(simulateDoubleMpl(truth as unknown as Theta<RiskParam>, rand));
    if (i % 4 === 3) {
      options.onProgress?.((i + 1) / n);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  options.onProgress?.(1);

  const byQuestion = {} as Record<Policy, Record<P, Accuracy[]>>;
  for (const policy of ["dose", "random"] as const) {
    byQuestion[policy] = {} as Record<P, Accuracy[]>;
    for (const name of names) {
      const series: Accuracy[] = [];
      const steps = Math.min(...paths[policy].map((p) => p.length));
      for (let t = 0; t < steps; t++) {
        series.push(
          accuracy(
            paths[policy].map((p) => p[t]![name]),
            truths.map((x) => x[name]),
          ),
        );
      }
      byQuestion[policy][name] = series;
    }
  }

  const result: RecoveryResult<P> = { n, length, seed, params: names, byQuestion };
  if (!runMpl) return result;

  const t = truths as unknown as Theta<RiskParam>[];
  const ok = mplEst.map((e, i) => [e, i] as const).filter(([e]) => e.lambda !== null);
  return {
    ...result,
    mpl: {
      rho: accuracy(
        mplEst.map((e) => e.rho),
        t.map((x) => x.rho),
      ),
      lambda: accuracy(
        ok.map(([e]) => e.lambda!),
        ok.map(([, i]) => t[i]!.lambda),
      ),
      failed: n - ok.length,
    },
  };
}
