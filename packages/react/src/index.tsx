import {
  DoseSession,
  type Engine,
  type PendingQuestion,
  type Question,
  type Position,
  type SessionEntry,
  type SideMode,
  type Summary,
  type Trace,
} from "@dose-bench/engine"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

export interface UseDoseSessionOptions<P extends string> {
  readonly length?: number
  /** Randomise which side option A appears on, per question (seeded, recorded in the trace). Default "fixed". */
  readonly sides?: SideMode
  readonly seed?: number
  /**
   * A stored trace to continue from, e.g. one saved by `onAnswer` before a page reload. Used once, when the
   * hook mounts. If it can't be resumed (different model or design), a fresh session starts and
   * `onResumeError` is called. If it is already complete, `onComplete` is called again after mount.
   * Changing `engine`, `length`, `sides` or `seed` later starts a new participant and discards it, so keep
   * them stable (or key the component on them).
   */
  readonly resume?: Trace | null
  readonly onResumeError?: (error: unknown) => void
  /** Called after every answer with the trace so far. Save it to survive reloads. */
  readonly onAnswer?: (trace: Trace) => void
  /** Called once when the last answer is recorded. */
  readonly onComplete?: (trace: Trace, estimate: Summary<P>) => void
}

export interface DoseSessionState<P extends string, Q extends Question> {
  /** Question to show now, or null when the module is complete. */
  readonly item: PendingQuestion<Q> | null
  readonly answer: (choseA: boolean) => void
  /** Answer by screen position, honouring `item.swapped`. */
  readonly choose: (position: Position) => void
  readonly estimate: Summary<P>
  readonly history: readonly SessionEntry<Q>[]
  readonly done: boolean
  readonly length: number
  readonly reset: () => void
  readonly trace: () => Trace
  /** The underlying session, for anything the hook doesn't expose. */
  readonly session: DoseSession<P, Q>
}

/** Run one DOSE module for one participant, entirely in the browser. */
export function useDoseSession<P extends string, Q extends Question>(
  engine: Engine<P, Q>,
  options: UseDoseSessionOptions<P> = {},
): DoseSessionState<P, Q> {
  const length = options.length ?? 10
  const { sides, seed } = options
  const make = useCallback(
    () =>
      new DoseSession(engine, {
        length,
        ...(sides !== undefined ? { sides } : {}),
        ...(seed !== undefined ? { seed } : {}),
      }),
    [engine, length, sides, seed],
  )
  const callbacks = useRef(options)
  callbacks.current = options
  // Resume once, at mount. Callbacks are side effects, so they run in the effect below, not during render.
  const [initial] = useState(() => {
    const saved = options.resume
    if (!saved) return { session: make(), error: undefined, resumed: false }
    try {
      return { session: DoseSession.resume(engine, saved), error: undefined, resumed: true }
    } catch (error) {
      return { session: make(), error: error ?? new Error("resume failed"), resumed: false }
    }
  })
  const [session, setSession] = useState(initial.session)
  const [, setVersion] = useState(0)

  const reported = useRef(false) // StrictMode runs mount effects twice in development
  useEffect(() => {
    if (reported.current) return
    reported.current = true
    const { onResumeError, onComplete } = callbacks.current
    if (initial.error !== undefined) onResumeError?.(initial.error)
    // A trace saved after the last answer resumes as a finished module: report completion again so the
    // page can move on (the reload may have lost whatever the first onComplete did).
    if (initial.resumed && initial.session.done)
      onComplete?.(initial.session.trace(), initial.session.estimate())
  }, [initial])

  // A new engine or length means a new participant.
  const madeWith = useRef(make)
  useEffect(() => {
    if (madeWith.current === make) return
    madeWith.current = make
    setSession(make())
  }, [make])

  const answer = useCallback(
    (choseA: boolean) => {
      if (session.done) return
      const est = session.answer(choseA)
      setVersion((v) => v + 1)
      const { onAnswer, onComplete } = callbacks.current
      if (onAnswer || (session.done && onComplete)) {
        const trace = session.trace()
        onAnswer?.(trace)
        if (session.done) onComplete?.(trace, est)
      }
    },
    [session],
  )
  const choose = useCallback(
    (position: Position) => {
      const item = session.done ? null : session.next()
      if (item) answer((position === "left") !== item.swapped)
    },
    [session, answer],
  )

  const reset = useCallback(() => setSession(make()), [make])
  const item = session.done ? null : session.next()

  return {
    item,
    answer,
    choose,
    estimate: session.estimate(),
    history: session.history,
    done: session.done,
    length: session.length,
    reset,
    trace: () => session.trace(),
    session,
  }
}

export type Side = "A" | "B"

const clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now())

export interface ChoiceCardProps<Q extends Question> {
  readonly item: PendingQuestion<Q>
  readonly onAnswer: (choseA: boolean) => void
  /** Question text above the options. */
  readonly prompt?: ReactNode
  /** Render an option's content. Defaults to the model's describe() text. */
  readonly renderOption?: (side: Side, question: Q) => ReactNode
  /** Show option B on the left. Defaults to `item.swapped`, set by a session with `sides: "random"`. */
  readonly swap?: boolean
  /** Answer with the left/right arrow keys or 1/2. Default true. */
  readonly keyboard?: boolean
  /**
   * Ignore answers sooner than this after a question appears, and any after the first, so a double click or
   * a held key can't answer the next question by accident. Default 250 ms.
   */
  readonly minRtMs?: number
  readonly disabled?: boolean
  readonly className?: string
}

/** Two-option choice. Unstyled apart from `dose-*` class names; import "@dose-bench/react/styles.css" for defaults. */
export function ChoiceCard<Q extends Question>({
  item,
  onAnswer,
  prompt = "Which would you rather have?",
  renderOption,
  swap = item.swapped,
  keyboard = true,
  minRtMs = 250,
  disabled = false,
  className,
}: ChoiceCardProps<Q>) {
  const sides: readonly Side[] = swap ? ["B", "A"] : ["A", "B"]
  const content = (side: Side) =>
    renderOption ? renderOption(side, item.question) : side === "A" ? item.text?.a : item.text?.b

  // One answer per question, and none in the first `minRtMs`. Keyed by question and position rather than
  // object identity, so a parent passing a fresh copy of the same item each render doesn't reset the clock.
  const key = `${item.n}:${item.question.id}`
  const guard = useRef({ key, shownAt: clock(), answered: false })
  if (guard.current.key !== key) guard.current = { key, shownAt: clock(), answered: false }
  const pick = useRef((_side: Side) => {})
  pick.current = (side: Side) => {
    const g = guard.current
    if (disabled || g.answered || clock() - g.shownAt < minRtMs) return
    g.answered = true
    onAnswer(side === "A")
  }

  useEffect(() => {
    if (!keyboard || disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const t = e.target
      if (t instanceof Element && t.closest("input, textarea, select, [contenteditable='true']")) return
      if (e.key === "ArrowLeft" || e.key === "1") pick.current(sides[0]!)
      if (e.key === "ArrowRight" || e.key === "2") pick.current(sides[1]!)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [keyboard, disabled, sides])

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
            onClick={() => pick.current(side)}
          >
            {content(side)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DoseProgress({
  value,
  total,
  className,
}: {
  value: number
  total: number
  className?: string
}) {
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
  )
}

export interface DoseModuleProps<P extends string, Q extends Question>
  extends
    UseDoseSessionOptions<P>,
    Pick<ChoiceCardProps<Q>, "prompt" | "renderOption" | "keyboard" | "minRtMs" | "className"> {
  readonly engine: Engine<P, Q>
  /** Shown after the last answer. */
  readonly completed?: ReactNode
}

/** Drop-in participant module: progress bar, choice card, completion message. */
export function DoseModule<P extends string, Q extends Question>(props: DoseModuleProps<P, Q>) {
  const { engine, completed = "Thank you, that's all for this section." } = props
  const s = useDoseSession(engine, props)
  return (
    <div className={["dose-module", props.className].filter(Boolean).join(" ")}>
      <DoseProgress value={s.history.length} total={s.length} />
      {s.item ? (
        <ChoiceCard
          item={s.item}
          onAnswer={s.answer}
          {...(props.minRtMs !== undefined ? { minRtMs: props.minRtMs } : {})}
          {...(props.prompt !== undefined ? { prompt: props.prompt } : {})}
          {...(props.renderOption ? { renderOption: props.renderOption } : {})}
          {...(props.keyboard !== undefined ? { keyboard: props.keyboard } : {})}
        />
      ) : (
        <div className="dose-complete">{completed}</div>
      )}
    </div>
  )
}
