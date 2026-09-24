import {
  DoseSession,
  type Engine,
  type PendingQuestion,
  type Question,
  type SessionEntry,
  type Summary,
  type Trace,
} from "@dose-bench/engine";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface UseDoseSessionOptions<P extends string> {
  readonly length?: number;
  /** Called once when the last answer is recorded. */
  readonly onComplete?: (trace: Trace, estimate: Summary<P>) => void;
}

export interface DoseSessionState<P extends string, Q extends Question> {
  /** Question to show now, or null when the module is complete. */
  readonly item: PendingQuestion<Q> | null;
  readonly answer: (choseA: boolean) => void;
  readonly estimate: Summary<P>;
  readonly history: readonly SessionEntry<Q>[];
  readonly done: boolean;
  readonly length: number;
  readonly reset: () => void;
  readonly trace: () => Trace;
  /** The underlying session, for anything the hook doesn't expose. */
  readonly session: DoseSession<P, Q>;
}

/** Run one DOSE module for one participant, entirely in the browser. */
export function useDoseSession<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  options: UseDoseSessionOptions<P> = {},
): DoseSessionState<P, Q> {
  const length = options.length ?? 10;
  const make = useCallback(() => new DoseSession(engine, { length }), [engine, length]);
  const [session, setSession] = useState(make);
  const [, setVersion] = useState(0);
  const onComplete = useRef(options.onComplete);
  onComplete.current = options.onComplete;

  // A new engine or length means a new participant.
  const madeWith = useRef(make);
  useEffect(() => {
    if (madeWith.current === make) return;
    madeWith.current = make;
    setSession(make());
  }, [make]);

  const answer = useCallback(
    (choseA: boolean) => {
      if (session.done) return;
      const est = session.answer(choseA);
      setVersion((v) => v + 1);
      if (session.done) onComplete.current?.(session.trace(), est);
    },
    [session],
  );

  const reset = useCallback(() => setSession(make()), [make]);
  const item = session.done ? null : session.next();

  return {
    item,
    answer,
    estimate: session.estimate(),
    history: session.history,
    done: session.done,
    length,
    reset,
    trace: () => session.trace(),
    session,
  };
}

export type Side = "A" | "B";

export interface ChoiceCardProps<Q extends Question> {
  readonly item: PendingQuestion<Q>;
  readonly onAnswer: (choseA: boolean) => void;
  /** Question text above the options. */
  readonly prompt?: ReactNode;
  /** Render an option's content. Defaults to the model's describe() text. */
  readonly renderOption?: (side: Side, question: Q) => ReactNode;
  /** Show option B on the left (randomise per question to avoid side bias). */
  readonly swap?: boolean;
  /** Answer with the left/right arrow keys or 1/2. Default true. */
  readonly keyboard?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** Two-option choice. Unstyled apart from `dose-*` class names; import "@dose-bench/react/styles.css" for defaults. */
export function ChoiceCard<Q extends Question>({
  item,
  onAnswer,
  prompt = "Which would you rather have?",
  renderOption,
  swap = false,
  keyboard = true,
  disabled = false,
  className,
}: ChoiceCardProps<Q>) {
  const sides: readonly Side[] = swap ? ["B", "A"] : ["A", "B"];
  const content = (side: Side) =>
    renderOption ? renderOption(side, item.question) : side === "A" ? item.text?.a : item.text?.b;

  useEffect(() => {
    if (!keyboard || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowLeft" || e.key === "1") onAnswer(sides[0] === "A");
      if (e.key === "ArrowRight" || e.key === "2") onAnswer(sides[1] === "A");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, disabled, onAnswer, sides]);

  return (
    <div className={["dose-choice", className].filter(Boolean).join(" ")} data-question={item.question.id}>
      {prompt != null && <p className="dose-prompt">{prompt}</p>}
      <div className="dose-options" role="group" aria-label="Options">
        {sides.map((side, i) => (
          <button
            key={side}
            type="button"
            className="dose-option"
            data-side={side}
            data-position={i === 0 ? "left" : "right"}
            disabled={disabled}
            onClick={() => onAnswer(side === "A")}
          >
            {content(side)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DoseProgress({ value, total, className }: { value: number; total: number; className?: string }) {
  return (
    <div
      className={["dose-progress", className].filter(Boolean).join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={value}
      aria-label={`Question ${Math.min(value + 1, total)} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} data-state={i < value ? "done" : i === value ? "current" : "todo"} />
      ))}
    </div>
  );
}

export interface DoseModuleProps<P extends string, Q extends Question>
  extends UseDoseSessionOptions<P>,
    Pick<ChoiceCardProps<Q>, "prompt" | "renderOption" | "keyboard" | "className"> {
  readonly engine: Engine<P, Q>;
  /** Randomise which side option A appears on, per question. Default false. */
  readonly randomiseSides?: boolean;
  /** Shown after the last answer. */
  readonly completed?: ReactNode;
}

/** Drop-in participant module: progress bar, choice card, completion message. */
export function DoseModule<P extends string, Q extends Question>(props: DoseModuleProps<P, Q>) {
  const { engine, randomiseSides = false, completed = "Thank you, that's all for this section." } = props;
  const s = useDoseSession(engine, props);
  const swap = useMemo(
    () => randomiseSides && Math.random() < 0.5,
    [randomiseSides, s.history.length], // new coin flip per question
  );
  return (
    <div className={["dose-module", props.className].filter(Boolean).join(" ")}>
      <DoseProgress value={s.history.length} total={s.length} />
      {s.item ? (
        <ChoiceCard
          item={s.item}
          onAnswer={s.answer}
          swap={swap}
          {...(props.prompt !== undefined ? { prompt: props.prompt } : {})}
          {...(props.renderOption ? { renderOption: props.renderOption } : {})}
          {...(props.keyboard !== undefined ? { keyboard: props.keyboard } : {})}
        />
      ) : (
        <div className="dose-complete">{completed}</div>
      )}
    </div>
  );
}
