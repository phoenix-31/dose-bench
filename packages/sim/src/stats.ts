function ranks(a: readonly number[]): number[] {
  const order = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array<number>(a.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    for (let k = i; k <= j; k++) r[order[k]![1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation with average ranks for ties. Returns 0 when either side is constant. */
export function spearman(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("spearman: arrays differ in length");
  const n = a.length;
  if (n < 2) return 0;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export const mean = (a: readonly number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : Number.NaN);

export interface Accuracy {
  /** Mean absolute error. */
  readonly mae: number;
  /** Mean |estimate - truth| / |truth|: the paper's "inaccuracy". */
  readonly inaccuracy: number;
  readonly spearman: number;
  readonly n: number;
}

export function accuracy(estimates: readonly number[], truths: readonly number[]): Accuracy {
  return {
    mae: mean(estimates.map((e, i) => Math.abs(e - truths[i]!))),
    inaccuracy: mean(estimates.map((e, i) => Math.abs(e - truths[i]!) / Math.abs(truths[i]!))),
    spearman: spearman(estimates, truths),
    n: estimates.length,
  };
}
