import { createEngine, type Engine, type Question } from "@dose-bench/engine"
import { isPresetId, presetById, type PresetId } from "@dose-bench/models"

export type ModuleId = PresetId
export const DEFAULT_MODULE: ModuleId = "risk-loss"
export const isModuleId = isPresetId
export type AnyEngine = Engine<string, Question>

export interface ModuleInfo {
  readonly id: ModuleId
  readonly label: string
  /** Heatmap axes: [x, y]. */
  readonly axes: readonly [string, string]
  readonly note: string
  /** Side randomisation used by default, following the paper: lotteries stay on the left, payment dates swap. */
  readonly sides: "fixed" | "random"
  readonly prompt: string
}

export const MODULES: readonly ModuleInfo[] = [
  {
    id: "risk-loss",
    label: "Risk & loss",
    axes: ["lambda", "rho"],
    note: "Prospect-theory value with common power curvature and logit choice. Questions 1–4 use gain-only lotteries, as in the paper.",
    sides: "fixed",
    prompt: "Which would you rather have?",
  },
  {
    id: "time",
    label: "Time",
    axes: ["delta", "beta"],
    note: "Quasi-hyperbolic discounting with ρ fixed at 1. In a study, carry ρ over from the risk module.",
    sides: "random",
    prompt: "Which payment would you rather receive?",
  },
  {
    id: "time-joint",
    label: "Time, joint ρ",
    axes: ["delta", "rho"],
    note: "Estimates curvature alongside discounting: a 17,680-point grid, still fast enough to run live.",
    sides: "random",
    prompt: "Which payment would you rather receive?",
  },
]

export const moduleInfo = (id: ModuleId): ModuleInfo => MODULES.find((m) => m.id === id)!

const cache = new Map<ModuleId, AnyEngine>()
export function getEngine(id: ModuleId): AnyEngine {
  let e = cache.get(id)
  if (!e) {
    e = createEngine(presetById(id))
    cache.set(id, e)
  }
  return e
}

export interface ParamMeta {
  readonly sym: string
  readonly name: string
  readonly digits: number
  readonly hint: string
}

export const PARAMS: Readonly<Record<string, ParamMeta>> = {
  rho: { sym: "ρ", name: "Utility curvature", digits: 2, hint: "below 1 = risk averse over gains" },
  lambda: {
    sym: "λ",
    name: "Loss aversion",
    digits: 2,
    hint: "above 1 = loss averse, below 1 = loss tolerant",
  },
  mu: { sym: "μ", name: "Choice consistency", digits: 1, hint: "higher = fewer mistakes" },
  delta: { sym: "δ", name: "Monthly discount factor", digits: 2, hint: "1 = perfectly patient" },
  beta: { sym: "β", name: "Present bias", digits: 2, hint: "below 1 = present biased" },
}

export const param = (name: string): ParamMeta => PARAMS[name] ?? { sym: name, name, digits: 2, hint: "" }

export const DEFAULT_TRUTH: Readonly<Record<ModuleId, Record<string, number>>> = {
  "risk-loss": { rho: 0.8, lambda: 0.7, mu: 4 },
  time: { delta: 0.85, beta: 0.75, mu: 4 },
  "time-joint": { delta: 0.85, beta: 0.75, mu: 4, rho: 0.8 },
}
