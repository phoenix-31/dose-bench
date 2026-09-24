import { z } from "zod";
import type { Trace } from "@dose-bench/engine";
import type { Tree } from "./tree.js";

const questionSchema = z.looseObject({ id: z.string().min(1), kind: z.string().min(1) });

const decisionSchema = z.strictObject({
  q: z.number().int().nonnegative(),
  A: z.number().int().positive(),
  B: z.number().int().positive(),
});
const leafSchema = z.strictObject({
  est: z.record(z.string(), z.tuple([z.number(), z.number().nonnegative()])),
});

/** Schema for dose-tree/1 files, including structural checks (every path has exactly `length` questions). */
export const treeSchema = z
  .object({
    format: z.literal("dose-tree/1"),
    model: z.string().min(1),
    length: z.number().int().min(1).max(16),
    params: z.array(z.string().min(1)).min(1),
    questions: z.array(questionSchema).min(1),
    nodes: z.array(z.union([decisionSchema, leafSchema])).min(3),
    meta: z.looseObject({ compiledAt: z.string(), compiledMs: z.number() }),
  })
  .superRefine((t, ctx) => {
    const expected = 2 ** (t.length + 1) - 1;
    if (t.nodes.length !== expected) {
      ctx.addIssue({
        code: "custom",
        message: `expected ${expected} nodes for length ${t.length}, found ${t.nodes.length}`,
        path: ["nodes"],
      });
      return;
    }
    const seen = new Uint8Array(t.nodes.length);
    const stack: [number, number][] = [[0, 0]];
    while (stack.length) {
      const [i, depth] = stack.pop()!;
      const n = t.nodes[i];
      if (!n || seen[i]) {
        ctx.addIssue({
          code: "custom",
          message: `node ${i} is missing or reached twice`,
          path: ["nodes", i],
        });
        return;
      }
      seen[i] = 1;
      if ("est" in n) {
        if (depth !== t.length)
          ctx.addIssue({ code: "custom", message: `leaf ${i} at depth ${depth}`, path: ["nodes", i] });
        const missing = t.params.filter((p) => !(p in n.est));
        if (missing.length)
          ctx.addIssue({
            code: "custom",
            message: `leaf ${i} lacks ${missing.join(", ")}`,
            path: ["nodes", i],
          });
        continue;
      }
      if (depth >= t.length) {
        ctx.addIssue({
          code: "custom",
          message: `decision node ${i} below the last question`,
          path: ["nodes", i],
        });
        return;
      }
      if (n.q >= t.questions.length)
        ctx.addIssue({ code: "custom", message: `node ${i} references question ${n.q}`, path: ["nodes", i] });
      stack.push([n.A, depth + 1], [n.B, depth + 1]);
    }
  });

/** Schema for dose-trace/1 participant records. */
export const traceSchema = z.object({
  format: z.literal("dose-trace/1"),
  model: z.string().min(1),
  length: z.number().int().positive(),
  answers: z.array(
    z.object({
      n: z.number().int().positive(),
      question: z.string().min(1),
      choseA: z.boolean(),
      rtMs: z.number().nonnegative(),
      gainBits: z.number(),
    }),
  ),
  estimate: z.record(z.string(), z.object({ mean: z.number(), sd: z.number().nonnegative() })),
});

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const toErrors = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);

export function validateTree(data: unknown): ValidationResult<Tree> {
  const r = treeSchema.safeParse(data);
  return r.success
    ? { ok: true, value: r.data as unknown as Tree }
    : { ok: false, errors: toErrors(r.error) };
}

export function validateTrace(data: unknown): ValidationResult<Trace> {
  const r = traceSchema.safeParse(data);
  return r.success ? { ok: true, value: r.data as Trace } : { ok: false, errors: toErrors(r.error) };
}
