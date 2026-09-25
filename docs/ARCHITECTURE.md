# Architecture

## The algorithm

A **model** has parameters θ (e.g. ρ, λ, μ), a finite list of binary **questions**, and one function:
`probA(θ, q)`, the probability that someone with parameters θ picks option A in question q. Utility forms and error models live
inside that function. The presets use a logit rule, `P(A) = 1 / (1 + exp(−μ (V(A) − V(B))))`, as in the paper.

`createEngine(model)` does the only expensive work, once:

1. **Grid.** The Cartesian product of each parameter's grid values: K points, stored column-wise in typed arrays.
2. **Likelihood table.** `L[q·K + k] = P(A | θ_k, q)` for every question and grid point, plus its binary entropy `H`.
   Float32Array, so risk & loss (240 × 3,840) is about 7 MB for both tables together.

Everything afterwards is a pass over a length-K posterior vector `p`:

- **Selection.** For each eligible question, `gain(q) = h(Σ p_k L_qk) − Σ p_k H_qk`, where h is binary entropy. This is the mutual
  information between the answer and θ, which equals the expected KL divergence from prior to posterior (paper eq. 4). The highest gain
  wins; ties go to the lowest index, so selection is deterministic.
- **Update.** `p'_k ∝ p_k · L_qk` if A was chosen, `p_k · (1 − L_qk)` if B. No probability ever reaches zero, which is why a single
  mistake doesn't lock the estimate into the wrong region, unlike staircase or iterative-MPL designs.
- **Summaries.** Mean, SD, median, 90% interval and marginal for each parameter; joint marginals for heatmaps; entropy in bits.

Eligibility = not yet asked AND `model.allowed(q, history)`. Presets use this for the paper's constraints: gain-only opening questions,
no back-to-back top prize.

## Data formats

Both formats are versioned by their `format` field and validated by `@dose-bench/compiler` (`validateTree`, `validateTrace`).
A breaking change gets a new version tag; readers should reject tags they don't know.

### `dose-trace/2`: one participant, one module

```jsonc
{
  "format": "dose-trace/2",
  "model": "risk-loss",
  "length": 10,
  "engine": "0.1.0", // @dose-bench/engine version
  "design": "1c9e0a4f27b3d8", // Engine.design: hash of model id, grids, question space and engine prior
  "prior": "engine", // "custom" if the session was given its own prior
  "sides": "random", // or "fixed" (option A always on the left)
  "seed": 3141592653, // with sides = "random", reproduces which side each question was shown on
  "startedAt": "2026-09-25T02:55:26.101Z",
  "completedAt": null, // set on the last answer
  "resumes": 1, // times the session was rebuilt from this trace, e.g. after a page reload
  "answers": [
    {
      "n": 1,
      "question": "G:10000:5000",
      "choseA": false, // in the model's terms, whatever side A was on
      "swapped": true, // option B was shown on the left
      "rtMs": 2140,
      "tMs": 2210, // ms from startedAt to this answer
      "gainBits": 0.601,
    },
  ],
  "estimate": {
    "rho": { "mean": 0.94, "sd": 0.21 },
    "lambda": { "mean": 0.64, "sd": 0.28 },
    "mu": { "mean": 3.95, "sd": 2.44 },
  },
}
```

`question` is the model's question id, so a trace can be re-fitted later under any model that contains the same ids (`fitTrace`).

A trace is written after every answer, not just the last, so it doubles as the session's saved state:
`DoseSession.resume(engine, trace)` replays the answers and continues. Selection is deterministic, so the replay asks the same
questions; if it doesn't, or `design` differs from the engine's, `resume` throws rather than mix two designs in one record.
`design` cannot see inside `probA`, so a change to a choice rule that keeps the grids and questions shows up only as that replay
failure, or not at all if the change doesn't alter any selection. Bump the model id when you change its maths.

`dose-trace/1` (engine 0.1) has the same `answers` without `swapped` and `tMs`, and none of the provenance fields. The validators
and `fitTrace` still accept it.

### `dose-tree/1`: a compiled module

```jsonc
{
  "format": "dose-tree/1",
  "model": "risk-loss",
  "length": 10,
  "params": ["rho", "lambda", "mu"],
  "questions": [{ "id": "G:10000:5000", "kind": "gain", "win": 10000, "lose": 0, "sure": 5000 }],
  "nodes": [
    { "q": 0, "A": 1, "B": 1024 },            // decision node: ask questions[q], go to A or B
    { "est": { "rho": [0.94, 0.21], ... } }   // leaf: [mean, sd] after `length` answers
  ],
  "meta": { "compiledAt": "…", "compiledMs": 1800, "gridPoints": 3840, "candidateQuestions": 240 }
}
```

Node 0 is the root; nodes are in depth-first pre-order. A tree of length L has 2^L − 1 decision nodes and 2^L leaves. `treeSchema`
checks the whole structure (every leaf at depth L, no shared or dangling children), not just its shape.

Compilation is depth-first so memory is O(L × K), not O(2^L × K). A golden test checks that walking the tree asks exactly the
questions a live `DoseSession` asks for the same answers.

## Adding a model

```ts
import { linspace, logistic, type Model, type Question } from "@dose-bench/engine";

interface WtpQuestion extends Question {
  readonly kind: "wtp";
  readonly price: number;
}

export const wtpModel: Model<"wtp" | "mu", WtpQuestion> = {
  id: "wtp",
  label: "Willingness to pay",
  params: [
    { name: "wtp", label: "WTP ($)", values: linspace(0, 200, 81) },
    { name: "mu", label: "Consistency", values: linspace(0.05, 2, 10) },
  ],
  questions: linspace(5, 195, 39).map((price) => ({ id: `P:${price}`, kind: "wtp" as const, price })),
  probA: (t, q) => logistic(t.mu * (t.wtp - q.price)), // A = "buy at this price"
  describe: (q) => ({ a: `Buy for $${q.price}`, b: "Don't buy" }),
};
```

Checklist:

1. Question ids must be unique and stable. They are stored in traces.
2. `probA` must return a finite number for every grid point. `createEngine` throws otherwise.
3. Keep K × questions under a few million entries for live use; compile bigger designs offline.
4. Add a `defaultDraw` case in `@dose-bench/sim` (or pass `draw`) and a seeded recovery test showing DOSE beats random order.

## Package boundaries

- `engine` has **no dependencies** and no DOM or Node APIs beyond `performance`. It must stay that way: it runs inside survey platforms.
- `compiler` owns file formats; zod is only reached through its root entry. `@dose-bench/compiler/tree` is schema-free for bundles.
- `react` depends only on `engine`. Components are unstyled; `styles.css` is optional plain CSS, so it doesn't fight host pages.
- `apps/*` and `integrations/*` may depend on anything.

## Determinism

Selection is deterministic given the same prior, model and answers. Simulations take a seed (`mulberry32`), so recovery numbers in
tests and docs reproduce exactly on any platform.
