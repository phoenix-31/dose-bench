/// <reference lib="webworker" />
import { compileTree } from "@dose-bench/compiler";
import { createEngine } from "@dose-bench/engine";
import { presetById } from "@dose-bench/models";

export interface CompileInput {
  readonly model: string;
  readonly length: number;
}

self.onmessage = async (e: MessageEvent<CompileInput>) => {
  try {
    const engine = createEngine(presetById(e.data.model));
    const tree = await compileTree(engine, {
      length: e.data.length,
      yieldEvery: 64,
      onProgress: (fraction) => self.postMessage({ type: "progress", fraction }),
    });
    self.postMessage({ type: "done", result: tree });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
