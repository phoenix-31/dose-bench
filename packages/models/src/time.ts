import { linspace, logistic, type Model, type Question, type Theta } from "@dose-bench/engine";
import { POINTS_PER_DOLLAR } from "./risk-loss.js";

export interface TimeQuestion extends Question {
  readonly kind: "time";
  /** Option A: the smaller, earlier payment. */
  readonly early: number;
  readonly tEarly: number;
  /** Option B: the larger, later payment. Delays in days. */
  readonly late: number;
  readonly tLate: number;
}

export type TimeParam = "delta" | "beta" | "mu";
export type TimeParamJoint = TimeParam | "rho";

interface TimeOptionsBase {
  /** [earlier, later] delays in days. Paper: up to 90 days. */
  readonly datePairs?: readonly (readonly [number, number])[];
  readonly laterAmounts?: readonly number[];
  /** Earlier amount as a fraction of the later amount. */
  readonly ratios?: readonly number[];
  readonly grid?: {
    readonly delta?: readonly number[];
    readonly beta?: readonly number[];
    readonly mu?: readonly number[];
    readonly rho?: readonly number[];
  };
}
export interface TimeOptionsFixed extends TimeOptionsBase {
  /** Utility curvature held fixed, e.g. the posterior mean from the risk module. Default 1. */
  readonly rho?: number;
}
export interface TimeOptionsJoint extends TimeOptionsBase {
  /** Estimate curvature jointly with discounting (larger grid, as in the paper's 20-question sequence). */
  readonly rho: "joint";
}

const DEFAULT_PAIRS: readonly (readonly [number, number])[] = [
  [0, 30],
  [0, 60],
  [0, 90],
  [30, 60],
  [30, 90],
  [60, 90],
];
const DEFAULT_RATIOS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.94, 0.97];

/**
 * Time module (paper eq. 2): smaller-earlier (A) vs larger-later (B) with quasi-hyperbolic
 * discounting, U = beta^[t>0] * delta^(t/30) * x^rho, t in days, delta per month.
 */
export function timeModel(options?: TimeOptionsFixed): Model<TimeParam, TimeQuestion>;
export function timeModel(options: TimeOptionsJoint): Model<TimeParamJoint, TimeQuestion>;
export function timeModel(
  options: TimeOptionsFixed | TimeOptionsJoint = {},
): Model<TimeParam, TimeQuestion> | Model<TimeParamJoint, TimeQuestion> {
  const joint = options.rho === "joint";
  const fixedRho = typeof options.rho === "number" ? options.rho : 1;
  if (!joint && !(fixedRho > 0)) throw new RangeError("timeModel: rho must be positive");

  const questions: TimeQuestion[] = [];
  const seen = new Set<string>();
  for (const [tEarly, tLate] of options.datePairs ?? DEFAULT_PAIRS) {
    if (!(tLate > tEarly)) throw new RangeError("timeModel: later date must be after earlier date");
    for (const late of options.laterAmounts ?? [4_000, 7_000, 10_000])
      for (const r of options.ratios ?? DEFAULT_RATIOS) {
        const early = Math.round((late * r) / 50) * 50;
        const id = `T:${tEarly}:${early}:${tLate}:${late}`;
        if (early > 0 && early < late && !seen.has(id)) {
          seen.add(id);
          questions.push({ id, kind: "time", early, tEarly, late, tLate });
        }
      }
  }

  const params = [
    {
      name: "delta" as const,
      label: "Monthly discount factor δ",
      values: options.grid?.delta ?? linspace(0.2, 1, 17),
    },
    { name: "beta" as const, label: "Present bias β", values: options.grid?.beta ?? linspace(0.4, 1, 13) },
    { name: "mu" as const, label: "Choice consistency μ", values: options.grid?.mu ?? linspace(0.25, 8, 10) },
  ];

  const discount = (t: Theta<TimeParam>, days: number) =>
    days === 0 ? 1 : t.beta * Math.pow(t.delta, days / 30);
  const value = (t: Theta<TimeParam>, rho: number, x: number, days: number) =>
    discount(t, days) * Math.pow(x / POINTS_PER_DOLLAR, rho);
  const fmt = (x: number) => x.toLocaleString("en-US");
  const when = (d: number) => (d === 0 ? "today" : `in ${d} days`);

  const base = {
    label: "Time",
    questions,
    describe: (q: TimeQuestion) => ({
      a: `${fmt(q.early)} points ${when(q.tEarly)}`,
      b: `${fmt(q.late)} points ${when(q.tLate)}`,
    }),
  };

  if (joint) {
    const m: Model<TimeParamJoint, TimeQuestion> = {
      ...base,
      id: "time-joint",
      label: "Time (joint ρ)",
      params: [
        ...params,
        { name: "rho", label: "Utility curvature ρ", values: options.grid?.rho ?? linspace(0.2, 1.7, 8) },
      ],
      probA: (t, q) =>
        logistic(t.mu * (value(t, t.rho, q.early, q.tEarly) - value(t, t.rho, q.late, q.tLate))),
    };
    return m;
  }
  const m: Model<TimeParam, TimeQuestion> = {
    ...base,
    id: "time",
    designKey: JSON.stringify({ rho: fixedRho }),
    params,
    probA: (t, q) =>
      logistic(t.mu * (value(t, fixedRho, q.early, q.tEarly) - value(t, fixedRho, q.late, q.tLate))),
  };
  return m;
}
