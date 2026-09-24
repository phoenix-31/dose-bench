import type { Model, Question } from "@dose-bench/engine";
import { riskLossModel } from "./risk-loss.js";
import { timeModel } from "./time.js";

export {
  POINTS_PER_DOLLAR,
  ptValue,
  riskLossModel,
  type RiskLossOptions,
  type RiskParam,
  type RiskQuestion,
} from "./risk-loss.js";
export {
  timeModel,
  type TimeOptionsFixed,
  type TimeOptionsJoint,
  type TimeParam,
  type TimeParamJoint,
  type TimeQuestion,
} from "./time.js";

/** Default-configured presets by id, fully typed. */
export const presets = {
  "risk-loss": () => riskLossModel(),
  time: () => timeModel(),
  "time-joint": () => timeModel({ rho: "joint" }),
} as const;

export type PresetId = keyof typeof presets;

export const isPresetId = (id: string): id is PresetId => Object.prototype.hasOwnProperty.call(presets, id);

/** Look a preset up by a runtime string (CLI flags, URL params). Loosely typed by necessity. */
export function presetById(id: string): Model<string, Question> {
  if (!isPresetId(id))
    throw new Error(`Unknown model "${id}". Available: ${Object.keys(presets).join(", ")}`);
  return presets[id]() as unknown as Model<string, Question>;
}
