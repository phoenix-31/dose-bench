import { DoseSession, createEngine, mulberry32, type Answer } from "@dose-bench/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { presetById, presets, ptValue, riskLossModel, timeModel, type RiskQuestion } from "../src/index.js";

describe("ptValue", () => {
  it("is the identity for a risk-neutral, loss-neutral person", () => {
    expect(ptValue(3, 1, 1)).toBe(3);
    expect(ptValue(-3, 1, 1)).toBe(-3);
  });
  it("scales losses by lambda", () => {
    expect(ptValue(-2, 1, 2.5)).toBe(-5);
  });
});

describe("riskLossModel", () => {
  const m = riskLossModel();

  it("has the paper's parameter ranges and a gain + mixed question space", () => {
    const [rho, lambda, mu] = m.params;
    expect([rho!.values[0], rho!.values.at(-1)]).toEqual([0.2, 1.7]);
    expect(lambda!.values.at(-1)).toBeCloseTo(4.6);
    expect(mu!.values.at(-1)).toBe(8);
    expect(m.questions.some((q) => q.kind === "gain")).toBe(true);
    expect(m.questions.filter((q) => q.kind === "mixed")).toHaveLength(100);
    expect(new Set(m.questions.map((q) => q.id)).size).toBe(m.questions.length);
  });

  it("makes mixed gambles less attractive as loss aversion rises", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...m.questions.filter((q) => q.kind === "mixed")),
        fc.double({ min: 0.3, max: 1.5, noNaN: true }),
        fc.double({ min: 0.1, max: 4, noNaN: true }),
        (q, rho, lambda) => {
          const lo = m.probA({ rho, lambda, mu: 3 }, q);
          const hi = m.probA({ rho, lambda: lambda + 0.5, mu: 3 }, q);
          expect(hi).toBeLessThanOrEqual(lo + 1e-12);
        },
      ),
    );
  });

  it("makes gain lotteries less attractive as the sure amount rises", () => {
    const q = (sure: number): RiskQuestion => ({ id: "x", kind: "gain", win: 8000, lose: 0, sure });
    const t = { rho: 0.8, lambda: 1, mu: 4 };
    expect(m.probA(t, q(1000))).toBeGreaterThan(m.probA(t, q(4000)));
  });

  it("restricts the opening questions to gain lotteries and blocks back-to-back top prizes", () => {
    const mixed = m.questions.find((q) => q.kind === "mixed")!;
    const gainTop = m.questions.find((q) => q.kind === "gain" && q.win === 10_000)!;
    const history = (n: number): Answer<RiskQuestion>[] =>
      Array.from({ length: n }, () => ({ question: gainTop, choseA: true }));
    expect(m.allowed!(mixed, history(3))).toBe(false);
    expect(m.allowed!(mixed, history(4))).toBe(mixed.win !== 10_000);
    expect(m.allowed!(gainTop, history(1))).toBe(false);
  });
});

describe("timeModel", () => {
  it("makes waiting more attractive as patience rises", () => {
    const m = timeModel();
    for (const q of m.questions.slice(0, 40)) {
      const impatient = m.probA({ delta: 0.5, beta: 0.8, mu: 3 }, q);
      const patient = m.probA({ delta: 0.95, beta: 0.8, mu: 3 }, q);
      expect(patient).toBeLessThanOrEqual(impatient + 1e-12);
    }
  });

  it("lets present bias flip choices only when the earlier payment is today", () => {
    // Between two future dates beta scales both options, so it can change how sure the
    // choice is (logit is not scale-free) but never which option is preferred.
    const m = timeModel();
    for (const q of m.questions) {
      const a = m.probA({ delta: 0.9, beta: 0.5, mu: 3 }, q) > 0.5;
      const b = m.probA({ delta: 0.9, beta: 1, mu: 3 }, q) > 0.5;
      if (q.tEarly > 0) expect(a).toBe(b);
    }
    const flips = m.questions.filter(
      (q) =>
        q.tEarly === 0 &&
        m.probA({ delta: 0.9, beta: 0.5, mu: 3 }, q) > 0.5 !==
          m.probA({ delta: 0.9, beta: 1, mu: 3 }, q) > 0.5,
    );
    expect(flips.length).toBeGreaterThan(0);
  });

  it("adds a rho dimension in joint mode", () => {
    const joint = timeModel({ rho: "joint" });
    expect(joint.id).toBe("time-joint");
    expect(joint.params.map((p) => p.name)).toEqual(["delta", "beta", "mu", "rho"]);
  });

  it("rejects impossible date pairs", () => {
    expect(() => timeModel({ datePairs: [[30, 30]] })).toThrow();
  });
});

describe("presets", () => {
  it("builds every preset and looks them up by id", () => {
    for (const id of Object.keys(presets)) expect(presetById(id).id).toBe(id);
    expect(() => presetById("nope")).toThrow(/Available/);
  });

  it("recovers a loss-tolerant participant in a 10-question risk module", () => {
    const m = riskLossModel();
    const engine = createEngine(m);
    const truth = { rho: 0.8, lambda: 0.6, mu: 6 };
    const r = mulberry32(3);
    const s = new DoseSession(engine, { length: 10 });
    while (!s.done) s.answer(r() < m.probA(truth, s.next()!.question));
    expect(s.history.slice(0, 4).every((h) => h.question.kind === "gain")).toBe(true);
    expect(s.estimate().params.lambda.mean).toBeLessThan(1);
  });
});

describe("design fingerprints", () => {
  it("differ when preset options change the constraints or a fixed parameter", () => {
    const base = createEngine(riskLossModel()).design;
    expect(createEngine(riskLossModel({ firstGainOnly: 0 })).design).not.toBe(base);
    expect(createEngine(riskLossModel({ noConsecutiveMaxPrize: false })).design).not.toBe(base);
    expect(createEngine(riskLossModel()).design).toBe(base);
    expect(createEngine(timeModel({ rho: 0.8 })).design).not.toBe(createEngine(timeModel()).design);
  });
});
