export type { Answer, Model, OptionText, ParamSpec, ParamsOf, Question, QuestionOf, Theta } from "./types.js";
export { binaryEntropy, clampProb, linspace, logistic, mulberry32, type Rng } from "./math.js";
export { makeGrid, thetaAt, type Grid } from "./grid.js";
export {
  createEngine,
  eligible,
  infoGains,
  jointMarginal,
  selectQuestion,
  summarize,
  update,
  type Engine,
  type EngineOptions,
  type IndexedAnswer,
  type JointMarginal,
  type ParamSummary,
  type Posterior,
  type Selection,
  type Summary,
} from "./engine.js";
export {
  DoseSession,
  type PendingQuestion,
  type SessionEntry,
  type SessionOptions,
  type Trace,
} from "./session.js";
export { fitAnswers, fitTrace, type Fit } from "./fit.js";
