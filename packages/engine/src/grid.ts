import type { ParamSpec, Theta } from "./types.js"

/**
 * Cartesian product of parameter grids, stored column-wise.
 * Point k has value `cols[name][k]`, which is `params[i].values[idx[name][k]]`.
 */
export interface Grid<P extends string> {
  readonly names: readonly P[]
  readonly params: readonly ParamSpec<P>[]
  readonly size: number
  readonly cols: Readonly<Record<P, Float64Array>>
  readonly idx: Readonly<Record<P, Uint16Array>>
}

export function makeGrid<P extends string>(params: readonly ParamSpec<P>[]): Grid<P> {
  if (params.length === 0) throw new Error("makeGrid: at least one parameter is required")
  const names = params.map((p) => p.name)
  if (new Set(names).size !== names.length) throw new Error("makeGrid: parameter names must be unique")
  for (const p of params) {
    if (p.values.length === 0) throw new Error(`makeGrid: parameter "${p.name}" has no grid values`)
    if (p.values.length > 65535) throw new Error(`makeGrid: parameter "${p.name}" has too many grid values`)
  }
  const sizes = params.map((p) => p.values.length)
  const size = sizes.reduce((a, b) => a * b, 1)
  const cols = {} as Record<P, Float64Array>
  const idx = {} as Record<P, Uint16Array>
  for (const p of params) {
    cols[p.name] = new Float64Array(size)
    idx[p.name] = new Uint16Array(size)
  }
  for (let k = 0; k < size; k++) {
    let r = k
    for (let j = params.length - 1; j >= 0; j--) {
      const spec = params[j]!
      const n = sizes[j]!
      const i = r % n
      r = Math.floor(r / n)
      cols[spec.name][k] = spec.values[i]!
      idx[spec.name][k] = i
    }
  }
  return { names, params, size, cols, idx }
}

/** Read grid point k as a Theta object. */
export function thetaAt<P extends string>(grid: Grid<P>, k: number): Theta<P> {
  const t = {} as Record<P, number>
  for (const n of grid.names) t[n] = grid.cols[n][k]!
  return t
}
