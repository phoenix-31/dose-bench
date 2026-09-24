import { createEngine, linspace, logistic, type Model, type Question } from "@dose-bench/engine";
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
    expect(onComplete.mock.calls[0]![0].format).toBe("dose-trace/1");
    act(() => result.current.reset());
    expect(result.current.history).toHaveLength(0);
    expect(result.current.item!.question.id).toBe(first);
  });
});

describe("ChoiceCard", () => {
  it("renders the model's option text and reports which option was picked", () => {
    const onAnswer = vi.fn();
    const { result } = renderHook(() => useDoseSession(engine, { length: 2 }));
    render(<ChoiceCard item={result.current.item!} onAnswer={onAnswer} swap />);
    const [left, right] = screen.getAllByRole("button");
    expect(left!.dataset.side).toBe("B");
    fireEvent.click(left!);
    fireEvent.click(right!);
    expect(onAnswer.mock.calls).toEqual([[false], [true]]);
  });

  it("answers from the keyboard", () => {
    const onAnswer = vi.fn();
    const { result } = renderHook(() => useDoseSession(engine, { length: 2 }));
    render(<ChoiceCard item={result.current.item!} onAnswer={onAnswer} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onAnswer).toHaveBeenCalledWith(false);
  });
});

describe("DoseModule", () => {
  it("runs a whole module and shows the completion message", () => {
    render(<DoseModule engine={engine} length={2} completed="All done" />);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    fireEvent.click(screen.getAllByRole("button")[1]!);
    expect(screen.getByText("All done")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
  });
});
