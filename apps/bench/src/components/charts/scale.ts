/** Round tick values covering [a, b] with at most ~n ticks. */
export function ticks(a: number, b: number, n: number): number[] {
  const span = b - a
  if (!(span > 0)) return [a]
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => span / s <= n) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9; v += step) out.push(Number(v.toFixed(6)))
  return out
}

export function niceMax(v: number): number {
  if (!(v > 0)) return 1
  const mag = 10 ** Math.floor(Math.log10(v))
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * mag >= v) return s * mag
  return v
}

export const fmtTick = (v: number): string =>
  Math.abs(v - Math.round(v)) < 1e-9
    ? String(Math.round(v))
    : Math.abs(v * 10 - Math.round(v * 10)) < 1e-9
      ? v.toFixed(1)
      : v.toFixed(2)
