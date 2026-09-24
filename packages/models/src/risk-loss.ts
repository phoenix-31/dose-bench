import { linspace, logistic, type Model, type Question } from "@dose-bench/engine";

/** YouGov points per dollar in the paper's survey (~$0.001 per point). Utilities are computed in dollars. */
export const POINTS_PER_DOLLAR = 1000;

/** Prospect-theory value with common power curvature in gains and losses (paper eq. 1). `x` in dollars. */
export function ptValue(x: number, rho: number, lambda: number): number {
  return x >= 0 ? Math.pow(x, rho) : -lambda * Math.pow(-x, rho);
}

export interface RiskQuestion extends Question {
  /** "gain": 50% win / 50% zero vs a sure amount. "mixed": 50% win / 50% loss vs zero for sure. */
  readonly kind: "gain" | "mixed";
  readonly win: number;
  readonly lose: number;
  readonly sure: number;
}

export type RiskParam = "rho" | "lambda" | "mu";

export interface RiskLossOptions {
  /** Largest prize in points. Default 10,000. */
  readonly maxPrize?: number;
  /** Prize step in points. Default 1,000. */
  readonly step?: number;
  /** Sure amounts offered against gain lotteries, as fractions of the prize. */
  readonly sureFractions?: readonly number[];
  /** Number of opening questions restricted to gain-only lotteries (paper: 4). */
  readonly firstGainOnly?: number;
  /** Stop the top prize appearing in consecutive questions (paper: yes). */
  readonly noConsecutiveMaxPrize?: boolean;
  readonly grid?: {
    readonly rho?: readonly number[];
    readonly lambda?: readonly number[];
    readonly mu?: readonly number[];
  };
}

const DEFAULT_FRACTIONS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8];

/**
 * Risk and loss module (paper §4.1): ten binary choices between a 50/50 lottery (option A) and a
 * sure amount (option B). Prior ranges follow the paper: rho in [0.2, 1.7], lambda in [0, 4.6],
 * mu in [0, 8]. The question space is a reconstruction; the authors' exact set is available on request.
 */
export function riskLossModel(options: RiskLossOptions = {}): Model<RiskParam, RiskQuestion> {
  const maxPrize = options.maxPrize ?? 10_000;
  const step = options.step ?? 1_000;
  const fractions = options.sureFractions ?? DEFAULT_FRACTIONS;
  const firstGainOnly = options.firstGainOnly ?? 4;
  const noConsecutiveMax = options.noConsecutiveMaxPrize ?? true;

  const prizes: number[] = [];
  for (let x = step; x <= maxPrize + 1e-9; x += step) prizes.push(Math.round(x));

  const questions: RiskQuestion[] = [];
  const seen = new Set<string>();
  for (const win of prizes)
    for (const f of fractions) {
      const sure = Math.round((win * f) / 50) * 50;
      const id = `G:${win}:${sure}`;
      if (sure > 0 && sure < win && !seen.has(id)) {
        seen.add(id);
        questions.push({ id, kind: "gain", win, lose: 0, sure });
      }
    }
  for (const win of prizes)
    for (const lose of prizes) questions.push({ id: `M:${win}:${lose}`, kind: "mixed", win, lose, sure: 0 });

  const fmt = (x: number) => x.toLocaleString("en-US");

  return {
    id: "risk-loss",
    label: "Risk & loss",
    params: [
      { name: "rho", label: "Utility curvature ρ", values: options.grid?.rho ?? linspace(0.2, 1.7, 16) },
      { name: "lambda", label: "Loss aversion λ", values: options.grid?.lambda ?? linspace(0.1, 4.6, 24) },
      { name: "mu", label: "Choice consistency μ", values: options.grid?.mu ?? linspace(0.25, 8, 10) },
    ],
    questions,
    probA(t, q) {
      const d = POINTS_PER_DOLLAR;
      const vA = 0.5 * ptValue(q.win / d, t.rho, t.lambda) + 0.5 * ptValue(-q.lose / d, t.rho, t.lambda);
      const vB = ptValue(q.sure / d, t.rho, t.lambda);
      return logistic(t.mu * (vA - vB));
    },
    allowed(q, history) {
      if (history.length < firstGainOnly && q.kind !== "gain") return false;
      const last = history[history.length - 1];
      if (noConsecutiveMax && last && last.question.win === maxPrize && q.win === maxPrize) return false;
      return true;
    },
    describe(q) {
      return q.kind === "gain"
        ? { a: `50% chance of ${fmt(q.win)} points, 50% chance of 0`, b: `${fmt(q.sure)} points for sure` }
        : {
            a: `50% chance to win ${fmt(q.win)} points, 50% chance to lose ${fmt(q.lose)}`,
            b: "0 points for sure",
          };
    },
  };
}
