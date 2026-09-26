import { z } from "zod"
import type { AnyTrace } from "@dose-bench/engine"
import type { Tree } from "./tree.js"

const questionSchema = z.looseObject({ id: z.string().min(1), kind: z.string().min(1) })

const decisionSchema = z.strictObject({
  q: z.number().int().nonnegative(),
  A: z.number().int().positive(),
  B: z.number().int().positive(),
})
const leafSchema = z.strictObject({
  est: z.record(z.string(), z.tuple([z.number(), z.number().nonnegative()])),
})

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
    const expected = 2 ** (t.length + 1) - 1
    if (t.nodes.length !== expected) {
      ctx.addIssue({
        code: "custom",
        message: `expected ${expected} nodes for length ${t.length}, found ${t.nodes.length}`,
        path: ["nodes"],
      })
      return
    }
    const seen = new Uint8Array(t.nodes.length)
    const stack: [number, number][] = [[0, 0]]
    while (stack.length) {
      const [i, depth] = stack.pop()!
      const n = t.nodes[i]
      if (!n || seen[i]) {
        ctx.addIssue({
          code: "custom",
          message: `node ${i} is missing or reached twice`,
          path: ["nodes", i],
        })
        return
      }
      seen[i] = 1
      if ("est" in n) {
        if (depth !== t.length)
          ctx.addIssue({ code: "custom", message: `leaf ${i} at depth ${depth}`, path: ["nodes", i] })
        const missing = t.params.filter((p) => !(p in n.est))
        if (missing.length)
          ctx.addIssue({
            code: "custom",
            message: `leaf ${i} lacks ${missing.join(", ")}`,
            path: ["nodes", i],
          })
        continue
      }
      if (depth >= t.length) {
        ctx.addIssue({
          code: "custom",
          message: `decision node ${i} below the last question`,
          path: ["nodes", i],
        })
        return
      }
      if (n.q >= t.questions.length)
        ctx.addIssue({ code: "custom", message: `node ${i} references question ${n.q}`, path: ["nodes", i] })
      stack.push([n.A, depth + 1], [n.B, depth + 1])
    }
  })

const estimateSchema = z.record(z.string(), z.object({ mean: z.number(), sd: z.number().nonnegative() }))

/** Schema for dose-trace/1 participant records (written by engine 0.1). */
export const traceV1Schema = z.object({
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
  estimate: estimateSchema,
})

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not an ISO 8601 date")

/** Schema for dose-trace/2 participant records. */
export const traceV2Schema = z
  .object({
    format: z.literal("dose-trace/2"),
    model: z.string().min(1),
    length: z.number().int().positive(),
    engine: z.string().min(1),
    design: z.string().regex(/^[0-9a-f]{14}$/, "not a design fingerprint"),
    prior: z.enum(["engine", "custom"]),
    sides: z.enum(["fixed", "random"]),
    seed: z.number().int().nonnegative().max(4294967295),
    startedAt: isoDate,
    completedAt: isoDate.nullable(),
    resumes: z.number().int().nonnegative(),
    answers: z.array(
      z.object({
        n: z.number().int().positive(),
        question: z.string().min(1),
        choseA: z.boolean(),
        swapped: z.boolean(),
        rtMs: z.number().nonnegative(),
        tMs: z.number().nonnegative(),
        gainBits: z.number(),
      }),
    ),
    estimate: estimateSchema,
  })
  .superRefine((t, ctx) => {
    if (t.answers.length > t.length)
      ctx.addIssue({
        code: "custom",
        message: `${t.answers.length} answers for length ${t.length}`,
        path: ["answers"],
      })
    t.answers.forEach((a, i) => {
      if (a.n !== i + 1)
        ctx.addIssue({ code: "custom", message: `answer ${i} has n = ${a.n}`, path: ["answers", i] })
      if (a.swapped && t.sides === "fixed")
        ctx.addIssue({
          code: "custom",
          message: "swapped answer in a fixed-sides trace",
          path: ["answers", i],
        })
    })
    // A module can also end early when no eligible question is left, so completedAt with fewer answers is fine.
    if (t.completedAt === null && t.answers.length === t.length)
      ctx.addIssue({ code: "custom", message: "complete trace without completedAt", path: ["completedAt"] })
  })

/** Any supported trace format. */
export const traceSchema = z.discriminatedUnion("format", [traceV1Schema, traceV2Schema])

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

const toErrors = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)

export function validateTree(data: unknown): ValidationResult<Tree> {
  const r = treeSchema.safeParse(data)
  return r.success ? { ok: true, value: r.data as unknown as Tree } : { ok: false, errors: toErrors(r.error) }
}

/** Validate a dose-trace/1 or dose-trace/2 record. Check `value.format` before using v2-only fields. */
export function validateTrace(data: unknown): ValidationResult<AnyTrace> {
  const r = traceSchema.safeParse(data)
  return r.success ? { ok: true, value: r.data as AnyTrace } : { ok: false, errors: toErrors(r.error) }
}
