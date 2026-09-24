export type WorkerMessage<T> = { type: "progress"; fraction: number } | { type: "done"; result: T } | { type: "error"; message: string };

export interface WorkerTask<T> {
  readonly promise: Promise<T>;
  cancel(): void;
}

/** Run one job in a fresh worker, reporting progress. Cancelling terminates the worker. */
export function runWorker<I, T>(makeWorker: () => Worker, input: I, onProgress?: (fraction: number) => void): WorkerTask<T> {
  const worker = makeWorker();
  let settle: ((e: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    settle = reject;
    worker.onmessage = (e: MessageEvent<WorkerMessage<T>>) => {
      const m = e.data;
      if (m.type === "progress") onProgress?.(m.fraction);
      else if (m.type === "done") {
        resolve(m.result);
        worker.terminate();
      } else {
        reject(new Error(m.message));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };
    worker.postMessage(input);
  });
  return {
    promise,
    cancel() {
      worker.terminate();
      settle?.(new DOMException("Cancelled", "AbortError"));
    },
  };
}
