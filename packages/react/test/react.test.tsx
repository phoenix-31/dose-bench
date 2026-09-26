import { DoseSession, createEngine, linspace, logistic, type Model, type Question } from "@dose-bench/engine";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoiceCard, DoseModule, useDoseSession } from "../src/index.js";

afterEach(cleanup);

interface Q extends Question {
  readonly s: number;
}
const model: Model<"t" | "mu", Q> = {
  id: "toy",
  label: "Toy",
  params: [
    { name: "t", label: "t", values: linspace(0, 10, 21) },
    { name: "mu", label: "mu", values: [1, 4] },
  ],
  questions: linspace(0.5, 9.5, 10).map((s) => ({ id: `s${s}`, kind: "t", s })),
  probA: (th, q) => logistic(th.mu * (th.t - q.s)),
  describe: (q) => ({ a: `A at ${q.s}`, b: `B at ${q.s}` }),
};
const engine = createEngine(model);

describe("useDoseSession", () => {
  it("advances, completes once, and resets", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useDoseSession(engine, { length: 3, onComplete }));
    const first = result.current.item!.question.id;
    act(() => result.current.answer(true));
    expect(result.current.history).toHaveLength(1);
    act(() => result.current.answer(false));
    act(() => result.current.answer(true));
    expect(result.current.done).toBe(true);
    expect(result.current.item).toBeNull();
    act(() => result.current.answer(true)); // ignored after completion
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0].format).toBe("dose-trace/2");
    act(() => result.current.reset());
    expect(result.current.history).toHaveLength(0);
    expect(result.current.item!.question.id).toBe(first);
  });

  it("reports the trace after every answer and resumes from it", () => {
    const saved: unknown[] = [];
    const first = renderHook(() =>
      useDoseSession(engine, { length: 4, sides: "random", seed: 5, onAnswer: (t) => saved.push(t) }),
    );
    act(() => first.result.current.choose("left"));
    act(() => first.result.current.choose("right"));
    expect(saved).toHaveLength(2);
    const pending = first.result.current.item!;

    const onResumeError = vi.fn();
    const again = renderHook(() =>
      useDoseSession(engine, { length: 4, resume: saved.at(-1) as never, onResumeError }),
    );
    expect(onResumeError).not.toHaveBeenCalled();
    expect(again.result.current.history.map((h) => h.choseA)).toEqual(
      first.result.current.history.map((h) => h.choseA),
    );
    expect(again.result.current.item!.question.id).toBe(pending.question.id);
    expect(again.result.current.item!.swapped).toBe(pending.swapped);
  });

  it("reports completion again when resuming a finished module, and uses the trace's length", () => {
    const done = new DoseSession(engine, { length: 3 });
    while (!done.done) done.answer(true);
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useDoseSession(engine, { length: 10, resume: done.trace(), onComplete }),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0]![0].answers).toHaveLength(3);
    expect(result.current.length).toBe(3);
    expect(result.current.item).toBeNull();
  });

  it("starts fresh when a stored trace can't be resumed", () => {
    const onResumeError = vi.fn();
    const bad = { ...new DoseSession(engine).trace(), design: "00000000000000" };
    const { result } = renderHook(() => useDoseSession(engine, { resume: bad, onResumeError }));
    expect(onResumeError).toHaveBeenCalledOnce();
    expect(result.current.history).toHaveLength(0);
  });
});

describe("ChoiceCard", () => {
  it("renders the model's option text and reports which option was picked", () => {
    const onAnswer = vi.fn();
    const { result } = renderHook(() => useDoseSession(engine, { length: 2 }));
    const item = result.current.item!;
    const view = render(<ChoiceCard item={item} onAnswer={onAnswer} swap minRtMs={0} />);
    const [left] = screen.getAllByRole("button");
    expect(left!.dataset.side).toBe("B");
    fireEvent.click(left!);
    act(() => result.current.answer(false));
    view.rerender(<ChoiceCard item={result.current.item!} onAnswer={onAnswer} minRtMs={0} />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(onAnswer.mock.calls).toEqual([[false], [true]]);
  });

  it("keeps its guard when the parent passes a fresh copy of the same item", () => {
    const onAnswer = vi.fn();
    const { result } = renderHook(() => useDoseSession(engine, { length: 2 }));
    const item = result.current.item!;
    const view = render(<ChoiceCard item={item} onAnswer={onAnswer} minRtMs={0} />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    view.rerender(<ChoiceCard item={{ ...item }} onAnswer={onAnswer} minRtMs={0} />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(onAnswer).toHaveBeenCalledOnce();
  });

  it("takes one answer per question and none faster than minRtMs", () => {
    vi.useFakeTimers();
    try {
      const onAnswer = vi.fn();
      const { result } = renderHook(() => useDoseSession(engine, { length: 2 }));
      render(<ChoiceCard item={result.current.item!} onAnswer={onAnswer} minRtMs={200} />);
      const [left, right] = screen.getAllByRole("button");
      fireEvent.click(left!);
      expect(onAnswer).not.toHaveBeenCalled();
      vi.advanceTimersByTime(250);
      fireEvent.click(left!);
      fireEvent.click(right!);
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(onAnswer.mock.calls).toEqual([[true]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("follows item.swapped by default", () => {
    const { result } = renderHook(() => useDoseSession(engine, { length: 2 }));
    render(<ChoiceCard item={{ ...result.current.item!, swapped: true }} onAnswer={() => {}} />);
    expect(screen.getAllByRole("button")[0]!.dataset.side).toBe("B");
  });

  it("answers from the keyboard", () => {
    const onAnswer = vi.fn();
    const { result } = renderHook(() => useDoseSession(engine, { length: 2 }));
    render(<ChoiceCard item={result.current.item!} onAnswer={onAnswer} minRtMs={0} />);
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onAnswer).toHaveBeenCalledWith(false);
  });
});

describe("DoseModule", () => {
  it("runs a whole module and shows the completion message", () => {
    render(<DoseModule engine={engine} length={2} completed="All done" minRtMs={0} />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    fireEvent.click(screen.getAllByRole("button")[1]!);
    expect(screen.getByText("All done")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  });
});
