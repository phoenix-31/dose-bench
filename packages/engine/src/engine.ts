import { makeGrid, type Grid } from "./grid.js";
import { binaryEntropy, clampProb, hash53, now } from "./math.js";
import type { Answer, Model, Question } from "./types.js";

export type Posterior = Float64Array;

/**
 * A model plus everything DOSE precomputes for it.
 *
 * `L[q * nPoints + k]` is P(option A | theta_k, question q) and `H` is its binary entropy.
 * Building these tables is the only expensive step; they are shared by every participant,
 * every node of a compiled tree and every simulated agent.
 */
export interface Engine<P extends string = string, Q extends Question = Question> {
  readonly model: Model<P, Q>;
  readonly grid: Grid<P>;
  readonly nPoints: number;
  readonly nQuestions: number;
  readonly L: Float32Array;
  readonly H: Float32Array;
  readonly prior: Posterior;
  readonly questionIndex: ReadonlyMap<string, number>;
  /**
   * Fingerprint of the design: model id, parameter grids, question space and prior. Two engines with the
   * same fingerprint ask the same questions in the same order for the same answers (given the same choice
   * rule, which cannot be hashed). Stored in traces so data can be matched to the design that produced it.
   */
  readonly design: string;
  readonly initMs: number;
}

export interface EngineOptions {
  /** Prior weights over grid points (normalised for you). Defaults to uniform, as in the paper. */
  readonly prior?: ArrayLike<number>;
}

export function createEngine<P extends string, Q extends Question>(
  model: Model<P, Q>,
  options: EngineOptions = {},
): Engine<P, Q> {
  const t0 = now();
  const grid = makeGrid(model.params);
  const K = grid.size;
  const nQ = model.questions.length;
  if (nQ === 0) throw new Error(`createEngine: model "${model.id}" has no questions`);

  const questionIndex = new Map<string, number>();
  model.questions.forEach((q, i) => {
    if (questionIndex.has(q.id)) throw new Error(`createEngine: duplicate question id "${q.id}"`);
    questionIndex.set(q.id, i);
  });

  const L = new Float32Array(nQ * K);
  const H = new Float32Array(nQ * K);
  const theta = {} as Record<P, number>;
  for (let k = 0; k < K; k++) {
    for (const n of grid.names) theta[n] = grid.cols[n][k]!;
    for (let q = 0; q < nQ; q++) {
      const raw = model.probA(theta, model.questions[q]!);
      if (!Number.isFinite(raw)) {
        throw new Error(`createEngine: probA returned ${raw} for question "${model.questions[q]!.id}"`);
      }
      const p = clampProb(raw);
      L[q * K + k] = p;
      H[q * K + k] = binaryEntropy(p);
    }
  }

  const prior = new Float64Array(K);
  if (options.prior) {
    if (options.prior.length !== K)
      throw new Error(`createEngine: prior has ${options.prior.length} weights, grid has ${K}`);
    let z = 0;
    for (let k = 0; k < K; k++) {
      const w = options.prior[k]!;
      if (!(w >= 0)) throw new Error("createEngine: prior weights must be non-negative");
      prior[k] = w;
      z += w;
    }
    if (!(z > 0)) throw new Error("createEngine: prior weights sum to zero");
    for (let k = 0; k < K; k++) prior[k]! /= z;
  } else {
    prior.fill(1 / K);
  }

  const design = designFingerprint(model, options.prior ? prior : null);
  return { model, grid, nPoints: K, nQuestions: nQ, L, H, prior, questionIndex, design, initMs: now() - t0 };
}

/** Internal history: an answer plus the question's index in the engine. */
export interface IndexedAnswer<Q extends Question = Question> extends Answer<Q> {
  readonly index: number;
}

/** Which questions may be asked next (unasked and allowed by the model's design constraints). */
export function eligible<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  history: readonly IndexedAnswer<Q>[],
): Uint8Array {
  const ok = new Uint8Array(engine.nQuestions).fill(1);
  for (const h of history) ok[h.index] = 0;
  const { allowed } = engine.model;
  if (allowed) {
    for (let q = 0; q < engine.nQuestions; q++) {
      if (ok[q] && !allowed.call(engine.model, engine.model.questions[q]!, history)) ok[q] = 0;
    }
  }
  return ok;
}

/**
 * Expected information gain, in bits, of every question under posterior `p`.
 * This equals the expected KL divergence from prior to posterior (paper eq. 4),
 * i.e. the mutual information between the answer and theta. Ineligible questions get -1.
 */
export function infoGains<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  p: Posterior,
  history: readonly IndexedAnswer<Q>[] = [],
): Float64Array {
  const { nPoints: K, nQuestions, L, H } = engine;
  const ok = eligible(engine, history);
  const gains = new Float64Array(nQuestions).fill(-1);
  for (let q = 0; q < nQuestions; q++) {
    if (!ok[q]) continue;
    const off = q * K;
    let pA = 0;
    let condH = 0;
    for (let k = 0; k < K; k++) {
      const w = p[k]!;
      pA += w * L[off + k]!;
      condH += w * H[off + k]!;
    }
    gains[q] = Math.max(0, binaryEntropy(pA) - condH);
  }
  return gains;
}

export interface Selection {
  /** Index into `engine.model.questions`, or -1 if nothing is eligible. */
  readonly index: number;
  readonly gainBits: number;
}

/** The most informative eligible question. Ties go to the lowest index, so selection is deterministic. */
export function selectQuestion<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  p: Posterior,
  history: readonly IndexedAnswer<Q>[] = [],
): Selection {
  const g = infoGains(engine, p, history);
  let index = -1;
  let gainBits = -Infinity;
  for (let q = 0; q < g.length; q++) {
    if (g[q]! > gainBits + 1e-12) {
      gainBits = g[q]!;
      index = q;
    }
  }
  return { index, gainBits: index < 0 ? 0 : gainBits };
}

/** Bayes' rule with the logit likelihood. Returns a new array. */
export function update<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  p: Posterior,
  questionIndex: number,
  choseA: boolean,
): Posterior {
  const { nPoints: K, L } = engine;
  if (questionIndex < 0 || questionIndex >= engine.nQuestions) {
    throw new RangeError(`update: question index ${questionIndex} out of range`);
  }
  const off = questionIndex * K;
  const out = new Float64Array(K);
  let z = 0;
  for (let k = 0; k < K; k++) {
    const l = L[off + k]!;
    const v = p[k]! * (choseA ? l : 1 - l);
    out[k] = v;
    z += v;
  }
  for (let k = 0; k < K; k++) out[k]! /= z;
  return out;
}

export interface ParamSummary {
  readonly mean: number;
  readonly sd: number;
  readonly median: number;
  /** 90% credible interval from the marginal. */
  readonly ci90: readonly [number, number];
  readonly values: readonly number[];
  readonly marginal: readonly number[];
}

export interface Summary<P extends string = string> {
  readonly params: Readonly<Record<P, ParamSummary>>;
  /** Entropy of the joint posterior, in bits. Starts at log2(grid size). */
  readonly entropyBits: number;
}

export function summarize<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  p: Posterior,
): Summary<P> {
  const { grid, nPoints: K } = engine;
  const params = {} as Record<P, ParamSummary>;
  for (const spec of grid.params) {
    const col = grid.cols[spec.name];
    const ix = grid.idx[spec.name];
    const marginal = new Array<number>(spec.values.length).fill(0);
    let m = 0;
    let m2 = 0;
    for (let k = 0; k < K; k++) {
      const w = p[k]!;
      const v = col[k]!;
      m += w * v;
      m2 += w * v * v;
      marginal[ix[k]!]! += w;
    }
    params[spec.name] = {
      mean: m,
      sd: Math.sqrt(Math.max(0, m2 - m * m)),
      median: quantile(spec.values, marginal, 0.5),
      ci90: [quantile(spec.values, marginal, 0.05), quantile(spec.values, marginal, 0.95)],
      values: spec.values,
      marginal,
    };
  }
  let e = 0;
  for (let k = 0; k < K; k++) {
    const w = p[k]!;
    if (w > 0) e -= w * Math.log2(w);
  }
  return { params, entropyBits: e };
}

function quantile(values: readonly number[], weights: readonly number[], q: number): number {
  let c = 0;
  for (let i = 0; i < values.length; i++) {
    c += weights[i]!;
    if (c >= q - 1e-12) return values[i]!;
  }
  return values[values.length - 1]!;
}

export interface JointMarginal {
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** m[yIndex][xIndex] */
  readonly m: readonly (readonly number[])[];
}

/** Posterior over two parameters with the rest summed out, e.g. for a heatmap. */
export function jointMarginal<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  p: Posterior,
  xName: P,
  yName: P,
): JointMarginal {
  const { grid, nPoints: K } = engine;
  const xs = grid.params.find((s) => s.name === xName);
  const ys = grid.params.find((s) => s.name === yName);
  if (!xs || !ys) throw new Error(`jointMarginal: unknown parameter`);
  const m = ys.values.map(() => new Array<number>(xs.values.length).fill(0));
  const ix = grid.idx[xName];
  const iy = grid.idx[yName];
  for (let k = 0; k < K; k++) m[iy[k]!]![ix[k]!]! += p[k]!;
  return { x: xs.values, y: ys.values, m };
}

function designFingerprint<P extends string, Q extends Question>(
  model: Model<P, Q>,
  prior: Posterior | null,
): string {
  const parts = [
    model.id,
    JSON.stringify(model.params.map((p) => [p.name, p.values])),
    JSON.stringify(model.questions),
    prior ? Array.from(prior, (w) => w.toPrecision(9)).join(",") : "uniform",
  ];
  return hash53(parts.join("\n"));
}
