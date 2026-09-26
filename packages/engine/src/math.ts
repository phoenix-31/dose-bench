export type Rng = () => number

/** `n` evenly spaced values from `a` to `b` inclusive. */
export function linspace(a: number, b: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`linspace: n must be a positive integer, got ${n}`)
  if (n === 1) return [a]
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))
}

/** Deterministic PRNG (mulberry32). Same seed, same sequence, on every platform. */
export function mulberry32(seed = 1): Rng {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LN2 = Math.log(2)

/** Binary entropy in bits. 0 at p = 0 or 1. */
export function binaryEntropy(p: number): number {
  if (p <= 1e-12 || p >= 1 - 1e-12) return 0
  return -(p * Math.log(p) + (1 - p) * Math.log(1 - p)) / LN2
}

/** Numerically stable logistic function. */
export function logistic(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z))
  const e = Math.exp(z)
  return e / (1 + e)
}

export const clampProb = (p: number): number => Math.min(1 - 1e-9, Math.max(1e-9, p))

export const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now())

/** 53-bit string hash (cyrb53), as 14 hex digits. Stable across platforms; not cryptographic. */
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}
