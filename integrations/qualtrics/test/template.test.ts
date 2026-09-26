// Runs template/question.js against a stand-in for the Qualtrics question API and a minimal DOM,
// with the DOSE global built from this package's source.
import { readFileSync } from "node:fs";
import { validateTrace } from "@dose-bench/compiler";
import type { Trace } from "@dose-bench/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as DOSE from "../src/index.js";

const source = readFileSync(new URL("../template/question.js", import.meta.url), "utf8");

class El {
  textContent = "";
  onclick: (() => void) | null = null;
  click() {
    this.onclick?.();
  }
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    get size() {
      return m.size;
    },
  };
}

/**
 * Load the question once, like Qualtrics does on page load. `module` edits the MODULE setting; `responseId`
 * is what Qualtrics pipes into ${e://Field/ResponseID} (empty in some previews).
 */
function mountQuestion(
  storage: ReturnType<typeof memoryStorage>,
  module = "risk-loss",
  responseId = "R_1a2B3c",
) {
  const els = {
    ".dose-a": new El(),
    ".dose-b": new El(),
    ".dose-count": new El(),
    ".dose-prompt": new El(),
  };
  const embedded: Record<string, unknown> = {};
  let advanced = false;
  const question = {
    getQuestionContainer: () => ({ querySelector: (sel: keyof typeof els) => els[sel] }),
    hideNextButton: () => {},
    showNextButton: () => {},
    clickNextButton: () => void (advanced = true),
  };
  const Qualtrics = {
    SurveyEngine: {
      addOnReady: (fn: () => void) => fn.call(question),
      setEmbeddedData: (k: string, v: unknown) => void (embedded[k] = v),
    },
  };
  const code = source
    .replace('var MODULE = "risk-loss"', `var MODULE = ${JSON.stringify(module)}`)
    .replace("${e://Field/ResponseID}", responseId);
  new Function("Qualtrics", "DOSE", "window", code)(Qualtrics, DOSE, { localStorage: storage });
  const trace = () => JSON.parse(embedded.dose_trace as string) as Trace;
  return {
    left: els[".dose-a"],
    right: els[".dose-b"],
    count: els[".dose-count"],
    prompt: els[".dose-prompt"],
    embedded,
    trace,
    advanced: () => advanced,
  };
}

const wait = (ms = 400) => vi.advanceTimersByTime(ms);

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("Qualtrics question template", () => {
  it("runs a full module and saves a valid trace and every parameter", () => {
    const storage = memoryStorage();
    const q = mountQuestion(storage);
    expect(q.count.textContent).toBe("Question 1 of 10");
    for (let i = 0; i < 10; i++) {
      wait();
      (i % 3 ? q.left : q.right).click();
    }
    expect(q.advanced()).toBe(true);
    const tr = q.trace();
    expect(validateTrace(tr).ok).toBe(true);
    expect(tr.answers).toHaveLength(10);
    expect(tr.completedAt).not.toBeNull();
    for (const p of ["rho", "lambda", "mu"]) expect(q.embedded[`dose_${p}`]).toBe(tr.estimate[p]!.mean);
  });

  it("returning to a finished module (Back button) re-saves the original data instead of starting over", () => {
    const storage = memoryStorage();
    const first = mountQuestion(storage);
    for (let i = 0; i < 10; i++) {
      wait();
      first.left.click();
    }
    const again = mountQuestion(storage);
    expect(again.advanced()).toBe(true);
    expect(again.trace().answers).toEqual(first.trace().answers);
    expect(again.trace().estimate).toEqual(first.trace().estimate);
  });

  it("doesn't persist anything when the response ID is missing", () => {
    const storage = memoryStorage();
    const q = mountQuestion(storage, "risk-loss", "");
    wait();
    q.left.click();
    expect(storage.size).toBe(0);
    expect(mountQuestion(storage, "risk-loss", "").count.textContent).toBe("Question 1 of 10");
  });

  it("ignores double clicks", () => {
    const q = mountQuestion(memoryStorage());
    q.left.click(); // too fast after the question appeared
    expect(q.embedded.dose_trace).toBeUndefined();
    wait();
    q.left.click();
    q.left.click();
    q.right.click();
    expect(q.trace().answers).toHaveLength(1);
    expect(q.count.textContent).toBe("Question 2 of 10");
  });

  it("picks up where it left off after a page reload", () => {
    const storage = memoryStorage();
    const first = mountQuestion(storage);
    for (let i = 0; i < 4; i++) {
      wait();
      first.left.click();
    }
    const before = { a: first.left.textContent, b: first.right.textContent };

    const reloaded = mountQuestion(storage);
    expect(reloaded.count.textContent).toBe("Question 5 of 10");
    expect({ a: reloaded.left.textContent, b: reloaded.right.textContent }).toEqual(before);
    for (let i = 0; i < 6; i++) {
      wait();
      reloaded.right.click();
    }
    const tr = reloaded.trace();
    expect(tr.answers).toHaveLength(10);
    expect(tr.resumes).toBe(1);
  });

  it("randomises sides for time questions and records the choice in the model's terms", () => {
    const q = mountQuestion(memoryStorage(), "time");
    expect(q.prompt.textContent).toMatch(/payment/);
    for (let i = 0; i < 10; i++) {
      wait();
      q.left.click();
    }
    const tr = q.trace();
    expect(tr.sides).toBe("random");
    expect(tr.answers.some((a) => a.swapped)).toBe(true);
    for (const a of tr.answers) expect(a.choseA).toBe(!a.swapped);
  });
});
