import { DoseSession, createEngine } from "@dose-bench/engine";
import { riskLossModel, timeModel } from "@dose-bench/models";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { compileTree, isLeaf, treeWalker, validateTrace, validateTree, type Tree } from "../src/index.js";

const engine = createEngine(riskLossModel());
let tree: Tree;
beforeAll(async () => {
  tree = await compileTree(engine, { length: 6 });
});

describe("compileTree", () => {
  it("builds a complete binary tree with 2^(L+1) - 1 nodes", () => {
    expect(tree.format).toBe("dose-tree/1");
    expect(tree.nodes).toHaveLength(2 ** 7 - 1);
    expect(tree.nodes.filter(isLeaf)).toHaveLength(2 ** 6);
    expect(tree.questions.length).toBeLessThanOrEqual(engine.nQuestions);
  });

  it("asks exactly what a live session would ask, for any answer sequence (golden test)", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }), (answers) => {
        const live = new DoseSession(engine, { length: 6 });
        const walk = treeWalker(tree);
        for (const a of answers) {
          expect(walk.question?.id).toBe(live.next()!.question.id);
          live.answer(a);
          walk.answer(a);
        }
        expect(walk.done).toBe(true);
        const est = live.estimate().params;
        for (const [name, [mean]] of Object.entries(walk.estimate!)) {
          expect(mean).toBeCloseTo(est[name as keyof typeof est].mean, 2);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("reports progress, validates its own output and round-trips through JSON", async () => {
    const seen: number[] = [];
    const small = await compileTree(engine, { length: 4, onProgress: (f) => seen.push(f), yieldEvery: 2 });
    expect(seen.at(-1)).toBe(1);
    const r = validateTree(JSON.parse(JSON.stringify(small)));
    expect(r.ok).toBe(true);
  });

  it("can be cancelled", async () => {
    const ac = new AbortController();
    const p = compileTree(engine, { length: 8, signal: ac.signal, yieldEvery: 1 });
    ac.abort();
    await expect(p).rejects.toThrow();
  });

  it("handles the larger joint-rho time grid depth-first", async () => {
    const t = await compileTree(createEngine(timeModel({ rho: "joint" })), { length: 3 });
    expect(t.params).toContain("rho");
    expect(validateTree(t).ok).toBe(true);
  });

  it("rejects silly lengths", async () => {
    await expect(compileTree(engine, { length: 0 })).rejects.toThrow(RangeError);
    await expect(compileTree(engine, { length: 40 })).rejects.toThrow(RangeError);
  });
});

describe("validateTree", () => {
  it("catches broken structure", () => {
    const broken = JSON.parse(JSON.stringify(tree));
    broken.nodes[0].A = 0;
    const r = validateTree(broken);
    expect(r.ok).toBe(false);
  });
  it("catches a wrong node count and a wrong format tag", () => {
    expect(validateTree({ ...tree, nodes: tree.nodes.slice(1) }).ok).toBe(false);
    expect(validateTree({ ...tree, format: "dose-tree/2" }).ok).toBe(false);
  });
});

describe("validateTrace", () => {
  it("accepts a real trace and rejects a malformed one", () => {
    const s = new DoseSession(engine, { length: 3 });
    s.answer(true);
    s.answer(false);
    s.answer(true);
    expect(validateTrace(s.trace()).ok).toBe(true);
    const bad = validateTrace({ ...s.trace(), answers: [{ n: 1 }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0);
  });

  it("accepts partial v2 traces and still reads dose-trace/1", () => {
    const s = new DoseSession(engine, { length: 3, sides: "random", seed: 1 });
    s.answer(true);
    expect(validateTrace(s.trace()).ok).toBe(true);
    const v1 = {
      format: "dose-trace/1",
      model: "risk-loss",
      length: 1,
      answers: [{ n: 1, question: "G:10000:5000", choseA: false, rtMs: 2140, gainBits: 0.6 }],
      estimate: { rho: { mean: 0.9, sd: 0.2 } },
    };
    expect(validateTrace(v1).ok).toBe(true);
  });

  it("checks v2 consistency: numbering, sides and completion", () => {
    const s = new DoseSession(engine, { length: 2 });
    s.answer(true);
    const tr = s.trace();
    const errors = (data: unknown) => {
      const v = validateTrace(data);
      return v.ok ? [] : v.errors;
    };
    expect(errors({ ...tr, answers: [{ ...tr.answers[0]!, n: 2 }] }).join()).toMatch(/n = 2/);
    expect(errors({ ...tr, answers: [{ ...tr.answers[0]!, swapped: true }] }).join()).toMatch(/fixed-sides/);
    s.answer(false);
    expect(errors({ ...s.trace(), completedAt: null }).join()).toMatch(/without completedAt/);
    expect(errors({ ...tr, format: "dose-trace/9" })).not.toHaveLength(0);
  });

  it("accepts a module that ended early because no eligible question was left", () => {
    const tiny = createEngine({ ...riskLossModel(), questions: riskLossModel().questions.slice(0, 3) });
    const s = new DoseSession(tiny, { length: 5 });
    while (!s.done) s.answer(true);
    const tr = s.trace();
    expect(tr.answers.length).toBeLessThan(5);
    expect(tr.completedAt).not.toBeNull();
    expect(validateTrace(tr).ok).toBe(true);
  });
});
