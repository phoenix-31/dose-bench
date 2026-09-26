import fc from "fast-check"
import { describe, expect, it } from "vitest"
import pkg from "../package.json"
import {
  DoseSession,
  createEngine,
  fitAnswers,
  fitTrace,
  infoGains,
  jointMarginal,
  linspace,
  logistic,
  makeGrid,
  mulberry32,
  selectQuestion,
  summarize,
  update,
  type Model,
  type Question,
} from "../src/index.js"

// A one-dimensional threshold model: someone with threshold t prefers A in question s when t > s.
interface ThresholdQ extends Question {
  readonly kind: "threshold" | "noise"
  readonly s: number
}
const toy: Model<"t" | "mu", ThresholdQ> = {
  id: "toy",
  label: "Toy threshold",
  params: [
    { name: "t", label: "threshold", values: linspace(0, 10, 41) },
    { name: "mu", label: "consistency", values: [0.5, 2, 8] },
  ],
  questions: [
    ...linspace(0.25, 9.75, 39).map((s) => ({ id: `s:${s}`, kind: "threshold" as const, s })),
    { id: "noise", kind: "noise", s: 0 },
  ],
  probA: (th, q) => (q.kind === "noise" ? 0.5 : logistic(th.mu * (th.t - q.s))),
  allowed: (q, history) => !(history.length === 0 && q.s > 5),
}

const engine = createEngine(toy)
const sum = (a: ArrayLike<number>) => Array.from(a).reduce((x, y) => x + y, 0)

describe("makeGrid", () => {
  it("builds the Cartesian product column-wise", () => {
    const g = makeGrid([
      { name: "a", label: "", values: [1, 2] },
      { name: "b", label: "", values: [10, 20, 30] },
    ])
    expect(g.size).toBe(6)
    const points = Array.from({ length: 6 }, (_, k) => [g.cols.a[k], g.cols.b[k]])
    expect(points).toEqual([
      [1, 10],
      [1, 20],
      [1, 30],
      [2, 10],
      [2, 20],
      [2, 30],
    ])
    expect(Array.from(g.idx.b)).toEqual([0, 1, 2, 0, 1, 2])
  })

  it("rejects duplicate parameter names", () => {
    expect(() =>
      makeGrid([
        { name: "a", label: "", values: [1] },
        { name: "a", label: "", values: [2] },
      ]),
    ).toThrow()
  })
})

describe("createEngine", () => {
  it("tabulates every question at every grid point", () => {
    expect(engine.nPoints).toBe(41 * 3)
    expect(engine.nQuestions).toBe(40)
    expect(engine.L.length).toBe(engine.nPoints * engine.nQuestions)
    expect(sum(engine.prior)).toBeCloseTo(1, 12)
  })

  it("normalises a supplied prior", () => {
    const e = createEngine(toy, { prior: new Array(engine.nPoints).fill(3) })
    expect(e.prior[0]).toBeCloseTo(1 / engine.nPoints, 12)
  })

  it("fingerprints the design: grid, questions and prior, not the instance", () => {
    expect(createEngine(toy).design).toBe(engine.design)
    expect(engine.design).toMatch(/^[0-9a-f]{14}$/)
    const fewer = { ...toy, questions: toy.questions.slice(1) }
    expect(createEngine(fewer).design).not.toBe(engine.design)
    const tilted = Array.from({ length: engine.nPoints }, (_, k) => 1 + (k % 2))
    expect(createEngine(toy, { prior: tilted }).design).not.toBe(engine.design)
    expect(createEngine({ ...toy, designKey: "strict" }).design).not.toBe(engine.design)
  })

  it("rejects duplicate question ids and bad priors", () => {
    expect(() => createEngine({ ...toy, questions: [toy.questions[0]!, toy.questions[0]!] })).toThrow(
      /duplicate/,
    )
    expect(() => createEngine(toy, { prior: [1, 2] })).toThrow(/prior/)
  })

  it("rejects non-finite probabilities", () => {
    expect(() => createEngine({ ...toy, probA: () => Number.NaN })).toThrow(/probA/)
  })
})

describe("information gain", () => {
  it("is within [0, 1] bit for binary questions and exactly 0 for an uninformative one", () => {
    const g = infoGains(engine, engine.prior)
    const noise = engine.questionIndex.get("noise")!
    expect(g[noise]).toBeCloseTo(0, 6)
    for (let q = 0; q < g.length; q++) if (g[q]! >= 0) expect(g[q]).toBeLessThanOrEqual(1 + 1e-9)
  })

  it("marks asked and disallowed questions ineligible", () => {
    const g0 = infoGains(engine, engine.prior, [])
    toy.questions.forEach((q, i) => {
      if (q.s > 5) expect(g0[i]).toBe(-1) // design constraint on question 1
    })
    const first = selectQuestion(engine, engine.prior)
    const g1 = infoGains(engine, engine.prior, [
      { index: first.index, question: toy.questions[first.index]!, choseA: true },
    ])
    expect(g1[first.index]).toBe(-1)
  })
})

describe("Bayes update", () => {
  it("keeps the posterior a probability distribution for any answer sequence", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 39 }), fc.boolean()), { maxLength: 30 }),
        (answers) => {
          let p = engine.prior
          for (const [q, a] of answers) p = update(engine, p, q, a)
          expect(sum(p)).toBeCloseTo(1, 9)
          for (const w of p) expect(w).toBeGreaterThanOrEqual(0)
        },
      ),
    )
  })

  it("leaves beliefs unchanged after an uninformative question", () => {
    const p = update(engine, engine.prior, engine.questionIndex.get("noise")!, true)
    expect(Array.from(p)).toEqual(Array.from(engine.prior).map((v) => expect.closeTo(v, 12)))
  })
})

describe("summaries", () => {
  it("reports the prior mean, a median, a 90% interval and marginals that sum to 1", () => {
    const s = summarize(engine, engine.prior)
    expect(s.params.t.mean).toBeCloseTo(5, 9)
    expect(s.params.t.ci90[0]).toBeLessThan(s.params.t.median)
    expect(s.params.t.ci90[1]).toBeGreaterThan(s.params.t.median)
    expect(sum(s.params.mu.marginal)).toBeCloseTo(1, 12)
    expect(s.entropyBits).toBeCloseTo(Math.log2(engine.nPoints), 9)
    const j = jointMarginal(engine, engine.prior, "t", "mu")
    expect(sum(j.m.flat())).toBeCloseTo(1, 12)
  })
})

describe("DoseSession", () => {
  const answerAs = (truth: { t: number; mu: number }, seed: number, length = 10) => {
    const s = new DoseSession(engine, { length })
    const r = mulberry32(seed)
    while (!s.done) {
      const item = s.next()!
      s.answer(r() < toy.probA(truth, item.question))
    }
    return s
  }

  it("never repeats a question and honours design constraints", () => {
    const s = answerAs({ t: 7.1, mu: 8 }, 1)
    const ids = s.history.map((h) => h.question.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(s.history[0]!.question.s).toBeLessThanOrEqual(5)
  })

  it("homes in on a consistent participant's threshold", () => {
    for (const t of [1.3, 4.8, 8.6]) {
      const est = answerAs({ t, mu: 8 }, 42).estimate()
      expect(Math.abs(est.params.t.mean - t)).toBeLessThan(0.6)
    }
  })

  it("next() is idempotent until answered, then returns null when complete", () => {
    const s = new DoseSession(engine, { length: 2 })
    expect(s.next()).toBe(s.next())
    s.answer(true)
    s.answer(false)
    expect(s.done).toBe(true)
    expect(s.next()).toBeNull()
    expect(() => s.answer(true)).toThrow(/complete/)
  })

  it("produces a dose-trace/2 record with provenance", () => {
    const tr = answerAs({ t: 3, mu: 2 }, 5, 4).trace()
    expect(tr.format).toBe("dose-trace/2")
    expect(tr.engine).toBe(pkg.version)
    expect(tr.design).toBe(engine.design)
    expect(tr.prior).toBe("engine")
    expect(tr.resumes).toBe(0)
    expect(Date.parse(tr.startedAt)).not.toBeNaN()
    expect(Date.parse(tr.completedAt!)).toBeGreaterThanOrEqual(Date.parse(tr.startedAt))
    expect(tr.answers).toHaveLength(4)
    expect(tr.answers.every((a) => a.swapped === false && a.tMs >= 0)).toBe(true)
    expect(Object.keys(tr.estimate).sort()).toEqual(["mu", "t"])
    expect(new DoseSession(engine).trace().completedAt).toBeNull()
  })

  it("randomises sides reproducibly from its seed, and choose() maps positions back to options", () => {
    const sidesOf = (seed: number) => {
      const s = new DoseSession(engine, { length: 20, sides: "random", seed })
      const out: boolean[] = []
      while (!s.done) {
        const item = s.next()!
        out.push(item.swapped)
        s.choose("left")
        expect(s.history.at(-1)!.choseA).toBe(!item.swapped)
      }
      return out
    }
    const a = sidesOf(3)
    expect(sidesOf(3)).toEqual(a)
    expect(a.some(Boolean) && !a.every(Boolean)).toBe(true)
    expect(new DoseSession(engine, { seed: 3 }).next()!.swapped).toBe(false)
  })

  it("resumes from a stored trace exactly where it left off", () => {
    const r = mulberry32(4)
    const truth = { t: 5.5, mu: 2 }
    const full = new DoseSession(engine, { length: 8, sides: "random", seed: 99 })
    const partial = new DoseSession(engine, { length: 8, sides: "random", seed: 99 })
    const choices: boolean[] = []
    while (!full.done) {
      const choseA = r() < toy.probA(truth, full.next()!.question)
      choices.push(choseA)
      full.answer(choseA)
    }
    for (const c of choices.slice(0, 5)) partial.answer(c)

    const stored = JSON.parse(JSON.stringify(partial.trace()))
    const resumed = DoseSession.resume(engine, stored)
    expect(resumed.history.map((h) => h.question.id)).toEqual(partial.history.map((h) => h.question.id))
    expect(resumed.next()!.swapped).toBe(partial.next()!.swapped)
    for (const c of choices.slice(5)) resumed.answer(c)

    const a = full.trace()
    const b = resumed.trace()
    expect(b.answers.map((x) => [x.question, x.choseA, x.swapped])).toEqual(
      a.answers.map((x) => [x.question, x.choseA, x.swapped]),
    )
    expect(b.estimate).toEqual(a.estimate)
    expect(b.resumes).toBe(1)
    expect(b.startedAt).toBe(stored.startedAt)
    expect(b.answers.slice(0, 5).map((x) => x.rtMs)).toEqual(
      stored.answers.map((x: { rtMs: number }) => x.rtMs),
    )
  })

  it("never repeats a question once the question space runs out", () => {
    const { allowed: _unconstrained, ...free } = toy
    const tiny = createEngine({ ...free, questions: toy.questions.slice(0, 3) })
    const s = new DoseSession(tiny, { length: 5 })
    const asked: string[] = []
    for (let i = 0; i < 5; i++) {
      const item = s.next()
      if (!item) break
      asked.push(item.question.id)
      s.answer(true)
    }
    expect(asked).toHaveLength(3)
    expect(new Set(asked).size).toBe(3)
    expect(s.done).toBe(true)
    expect(s.trace().completedAt).not.toBeNull()
  })

  it("ends when the design rules out every remaining question", () => {
    const strict = createEngine({ ...toy, allowed: (_q, history) => history.length < 2 })
    const s = new DoseSession(strict, { length: 10 })
    while (!s.done) s.answer(true)
    expect(s.history).toHaveLength(2)
    expect(s.next()).toBeNull()
  })

  it("refuses to resume under a different design, model or prior", () => {
    const tr = answerAs({ t: 3, mu: 2 }, 5, 3).trace()
    expect(() => DoseSession.resume(engine, { ...tr, design: "00000000000000" })).toThrow(/design/)
    expect(() => DoseSession.resume(engine, { ...tr, model: "other" })).toThrow(/model/)
    expect(() => DoseSession.resume(engine, { ...tr, prior: "custom" })).toThrow(/prior/)
    const tampered = { ...tr, answers: [{ ...tr.answers[0]!, question: tr.answers[1]!.question }] }
    expect(() => DoseSession.resume(engine, tampered)).toThrow(/now asks/)
  })

  it("can be re-fitted from its answers or its trace with an identical result", () => {
    const s = answerAs({ t: 6, mu: 2 }, 9)
    const fromAnswers = fitAnswers(toy, s.history).summary.params.t.mean
    const fromTrace = fitTrace(toy, s.trace()).summary.params.t.mean
    expect(fromAnswers).toBeCloseTo(s.estimate().params.t.mean, 9)
    expect(fromTrace).toBeCloseTo(s.estimate().params.t.mean, 9)
  })
})
