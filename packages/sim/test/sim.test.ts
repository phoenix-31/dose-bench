import { createEngine, mulberry32 } from "@dose-bench/engine"
import { riskLossModel, timeModel } from "@dose-bench/models"
import { describe, expect, it } from "vitest"
import { accuracy, recovery, simulateDoubleMpl, spearman } from "../src/index.js"

describe("stats", () => {
  it("computes Spearman with ties and degenerate inputs", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1)
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1)
    expect(spearman([1, 1, 1], [1, 2, 3])).toBe(0)
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeGreaterThan(0.9)
  })
  it("reports MAE and the paper's percentage inaccuracy", () => {
    const a = accuracy([1.1, 1.8], [1, 2])
    expect(a.mae).toBeCloseTo(0.15)
    expect(a.inaccuracy).toBeCloseTo(0.1)
  })
})

describe("double MPL baseline", () => {
  it("recovers a near-deterministic participant's parameters roughly", () => {
    const est = simulateDoubleMpl({ rho: 0.8, lambda: 1.5, mu: 200 }, mulberry32(1))
    expect(est.rho).toBeGreaterThan(0.65)
    expect(est.rho).toBeLessThan(0.95)
    expect(est.lambda).not.toBeNull()
    expect(est.lambda!).toBeGreaterThan(1.1)
    expect(est.lambda!).toBeLessThan(2)
  })
})

// Statistical regression tests: seeded, so deterministic. If a change to the engine makes DOSE
// lose to random order or to the MPL, these fail.
describe("parameter recovery", () => {
  it("DOSE beats random order and the double MPL on risk & loss", async () => {
    const r = await recovery(createEngine(riskLossModel()), { n: 60, length: 10, seed: 11 })
    const last = (policy: "dose" | "random", p: "rho" | "lambda") => r.byQuestion[policy][p].at(-1)!
    expect(last("dose", "lambda").mae).toBeLessThan(last("random", "lambda").mae)
    expect(last("dose", "rho").mae).toBeLessThan(last("random", "rho").mae)
    expect(last("dose", "lambda").spearman).toBeGreaterThan(0.8)
    expect(r.mpl).toBeDefined()
    expect(last("dose", "rho").inaccuracy).toBeLessThan(r.mpl!.rho.inaccuracy)
    expect(last("dose", "lambda").inaccuracy).toBeLessThan(r.mpl!.lambda.inaccuracy)
  }, 60_000)

  it("DOSE beats random order on time preferences", async () => {
    const r = await recovery(createEngine(timeModel()), { n: 60, length: 10, seed: 3 })
    expect(r.mpl).toBeUndefined()
    expect(r.byQuestion.dose.delta.at(-1)!.mae).toBeLessThan(r.byQuestion.random.delta.at(-1)!.mae)
    expect(r.byQuestion.dose.beta.at(-1)!.mae).toBeLessThan(r.byQuestion.random.beta.at(-1)!.mae)
  }, 60_000)

  it("is reproducible from its seed", async () => {
    const e = createEngine(timeModel())
    const a = await recovery(e, { n: 8, length: 4, seed: 5 })
    const b = await recovery(e, { n: 8, length: 4, seed: 5 })
    expect(a.byQuestion).toEqual(b.byQuestion)
  })

  it("needs a draw function for unknown models", async () => {
    const e = createEngine({ ...timeModel(), id: "custom" })
    await expect(recovery(e, { n: 2 })).rejects.toThrow(/draw/)
  })
})
