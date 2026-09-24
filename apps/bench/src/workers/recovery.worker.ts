/// <reference lib="webworker" />
import { createEngine } from "@dose-bench/engine";
import { presetById } from "@dose-bench/models";
import { recovery } from "@dose-bench/sim";

export interface RecoveryInput {
  readonly model: string;
  readonly n: number;
  readonly length: number;
  readonly seed: number;
}

self.onmessage = async (e: MessageEvent<RecoveryInput>) => {
  try {
    const { model, n, length, seed } = e.data;
    const result = await recovery(createEngine(presetById(model)), {
      n,
      length,
      seed,
      onProgress: (fraction) => self.postMessage({ type: "progress", fraction }),
    });
    self.postMessage({ type: "done", result });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
