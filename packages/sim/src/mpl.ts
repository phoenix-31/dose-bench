import { logistic, type Rng, type Theta } from "@dose-bench/engine";
import { POINTS_PER_DOLLAR, ptValue, type RiskParam } from "@dose-bench/models";

/**
 * The double multiple price list the paper benchmarks DOSE against (Andersen et al. 2008 style).
 *
 * MPL 1: 50/50 lottery over 0 and `prize` vs ascending sure amounts -> certainty equivalent -> rho.
 * MPL 2: 50/50 lottery over +prize and -prize vs ascending sure amounts -> certainty equivalent,
 *        combined with rho from MPL 1 -> lambda.
 * Each row is answered with the same logit choice rule DOSE assumes. As in the paper, the first row
 * where the participant takes the sure amount fixes the certainty equivalent (interval midpoint), and
 * estimates are clamped to the DOSE prior's support. Choice patterns that imply a first-order
 * stochastically dominated choice cannot be converted to lambda and are counted as failures.
 */
export interface DoubleMplOptions {
  readonly prize?: number;
  readonly riskRows?: readonly number[];
  readonly lossRows?: readonly number[];
  readonly rhoRange?: readonly [number, number];
  readonly lambdaRange?: readonly [number, number];
}

export interface MplEstimate {
  readonly rho: number;
  /** null when MPL 2's answers cannot be reconciled with MPL 1 (FOSD violation). */
  readonly lambda: number | null;
}

const DEFAULT_RISK_ROWS = [500, 1500, 2500, 3500, 4500, 5500, 6500, 7500, 8500, 9500];
const DEFAULT_LOSS_ROWS = [-4500, -3500, -2500, -1500, -500, 500, 1500, 2500, 3500, 4500];

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** Certainty equivalent (points) from the first row where the sure amount is taken. */
function certaintyEquivalent(rows: readonly number[], takesSure: readonly boolean[], top: number, bottom: number): number {
  const first = takesSure.indexOf(true);
  if (first === -1) return (rows[rows.length - 1]! + top) / 2;
  if (first === 0) return (bottom + rows[0]!) / 2;
  return (rows[first - 1]! + rows[first]!) / 2;
}

export function simulateDoubleMpl(truth: Theta<RiskParam>, rand: Rng, options: DoubleMplOptions = {}): MplEstimate {
  const prize = options.prize ?? 10_000;
  const riskRows = options.riskRows ?? DEFAULT_RISK_ROWS;
  const lossRows = options.lossRows ?? DEFAULT_LOSS_ROWS;
  const rhoRange = options.rhoRange ?? [0.2, 1.7];
  const lambdaRange = options.lambdaRange ?? [0.1, 4.6];
  const d = POINTS_PER_DOLLAR;
  const X = prize / d;
  const v = (x: number) => ptValue(x, truth.rho, truth.lambda);

  // MPL 1
  const vLottery1 = 0.5 * v(X);
  const sure1 = riskRows.map((s) => rand() >= logistic(truth.mu * (vLottery1 - v(s / d))));
  const ce1 = certaintyEquivalent(riskRows, sure1, prize, 0) / d;
  const rho = clamp(Math.log(0.5) / Math.log(ce1 / X), rhoRange);

  // MPL 2
  const vLottery2 = 0.5 * v(X) + 0.5 * v(-X);
  const sure2 = lossRows.map((s) => rand() >= logistic(truth.mu * (vLottery2 - v(s / d))));
  const ce2 = certaintyEquivalent(lossRows, sure2, prize, -prize) / d;

  // Solve 0.5 X^rho - 0.5 lambda X^rho = u(ce2) for lambda, using rho from MPL 1.
  const half = 0.5 * Math.pow(X, rho);
  let lambda: number | null;
  if (ce2 >= 0) {
    const l = 1 - Math.pow(ce2, rho) / half;
    lambda = l > 0 ? l : null;
  } else {
    const denom = half - Math.pow(-ce2, rho);
    lambda = denom > 0 ? half / denom : null;
  }
  return { rho, lambda: lambda === null ? null : clamp(lambda, lambdaRange) };
}
