/** A binary-choice question. `id` must be unique within a model's question space. */
export interface Question {
  readonly id: string;
  readonly kind: string;
}

/** One parameter of a preference model and the grid of values the prior is defined on. */
export interface ParamSpec<P extends string = string> {
  readonly name: P;
  readonly label: string;
  /** Grid points, ascending. The prior is uniform over the Cartesian product unless one is supplied. */
  readonly values: readonly number[];
}

/** A point in parameter space. */
export type Theta<P extends string> = { readonly [K in P]: number };

/** A question that has been answered. `choseA` is true when the participant picked option A. */
export interface Answer<Q extends Question = Question> {
  readonly question: Q;
  readonly choseA: boolean;
}

export interface OptionText {
  readonly a: string;
  readonly b: string;
}

/**
 * A preference model: parameters, a candidate question space, and a probabilistic choice rule.
 *
 * DOSE only ever needs `probA`, the probability that someone with parameters `theta` picks option A.
 * Everything else (utility form, error model) lives inside that function.
 */
export interface Model<P extends string = string, Q extends Question = Question> {
  readonly id: string;
  readonly label: string;
  /**
   * Anything that changes `probA` or `allowed` but isn't visible in the grids or questions (e.g. constraint
   * options, a fixed parameter). Folded into `Engine.design` so different configurations get different
   * fingerprints.
   */
  readonly designKey?: string;
  readonly params: readonly ParamSpec<P>[];
  readonly questions: readonly Q[];
  probA(theta: Theta<P>, question: Q): number;
  /** Design constraints, e.g. "first four questions gain-only". Asked questions are excluded automatically. */
  allowed?(question: Q, history: readonly Answer<Q>[]): boolean;
  /** Human-readable option text, for UIs and logs. */
  describe?(question: Q): OptionText;
}

/** Parameter names of a model. */
export type ParamsOf<M> = M extends Model<infer P, Question> ? P : never;
/** Question type of a model. */
export type QuestionOf<M> = M extends Model<string, infer Q> ? Q : never;
