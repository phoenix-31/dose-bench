import { createEngine, summarize, update, type Posterior, type Summary } from "./engine.js";
import type { Answer, Model, Question } from "./types.js";

export interface Fit<P extends string> {
  readonly summary: Summary<P>;
  readonly posterior: Posterior;
}

/**
 * Estimate parameters from answers already collected, under any model that can price those questions.
 *
 * This is the paper's ex-post re-estimation: choices selected under one specification can be
 * re-analysed with a different utility form, error model or prior. Only the answered questions are
 * tabulated, so it is cheap even for large grids.
 */
export function fitAnswers<P extends string, Q extends Question>(
  model: Model<P, Q>,
  answers: readonly Answer<Q>[],
  options: { readonly prior?: ArrayLike<number> } = {},
): Fit<P> {
  if (answers.length === 0) throw new Error("fitAnswers: no answers");
  const unique = new Map<string, Q>();
  for (const a of answers) unique.set(a.question.id, a.question);
  const local: Model<P, Q> = { ...model, questions: [...unique.values()] };
  delete (local as { allowed?: unknown }).allowed;
  const engine = createEngine(local, options.prior ? { prior: options.prior } : {});
  let p = engine.prior;
  for (const a of answers) p = update(engine, p, engine.questionIndex.get(a.question.id)!, a.choseA);
  return { summary: summarize(engine, p), posterior: p };
}

/** Re-fit a stored trace by looking its question ids up in `model.questions`. */
export function fitTrace<P extends string, Q extends Question>(
  model: Model<P, Q>,
  trace: { readonly answers: readonly { readonly question: string; readonly choseA: boolean }[] },
  options: { readonly prior?: ArrayLike<number> } = {},
): Fit<P> {
  const byId = new Map(model.questions.map((q) => [q.id, q] as const));
  const answers = trace.answers.map((a) => {
    const question = byId.get(a.question);
    if (!question) throw new Error(`fitTrace: question "${a.question}" is not in model "${model.id}"`);
    return { question, choseA: a.choseA };
  });
  return fitAnswers(model, answers, options);
}
