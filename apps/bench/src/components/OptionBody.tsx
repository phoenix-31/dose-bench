import type { Question } from "@dose-bench/engine"
import type { RiskQuestion, TimeQuestion } from "@dose-bench/models"
import type { Side } from "@dose-bench/react"

const pts = (x: number) => x.toLocaleString("en-US")

function Amount({ value, caption }: { value: number; caption: string }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="font-display text-4xl leading-none font-bold tracking-tight tabular-nums">
        {pts(value)}
      </span>
      <span className="text-muted-foreground text-sm">points</span>
      <span className="text-foreground/80 mt-1.5 text-sm">{caption}</span>
    </span>
  )
}

/** Visual option content for the bundled presets; falls back to nothing for unknown question kinds. */
export function OptionBody({ side, question }: { side: Side; question: Question }) {
  if (question.kind === "time") {
    const q = question as TimeQuestion
    const [amt, d] = side === "A" ? [q.early, q.tEarly] : [q.late, q.tLate]
    return <Amount value={amt} caption={d === 0 ? "today" : `in ${d} days`} />
  }
  const q = question as RiskQuestion
  if (side === "B") return <Amount value={q.sure} caption="for sure" />
  const mixed = q.kind === "mixed"
  return (
    <span className="flex w-full flex-col gap-2">
      <span className="grid grid-cols-2 overflow-hidden rounded-lg border">
        <span
          className="flex flex-col p-2.5 font-display text-xl font-bold tabular-nums"
          style={{ background: "color-mix(in oklab, var(--win) 14%, var(--card))" }}
        >
          <small className="text-muted-foreground mb-1 font-mono text-[11px] font-medium">50%</small>
          {mixed ? "+" : ""}
          {pts(q.win)}
        </span>
        <span
          className={`flex flex-col border-l p-2.5 font-display text-xl font-bold tabular-nums ${mixed ? "text-lose" : "text-muted-foreground"}`}
          style={mixed ? { background: "color-mix(in oklab, var(--lose) 14%, var(--card))" } : undefined}
        >
          <small className="text-muted-foreground mb-1 font-mono text-[11px] font-medium">50%</small>
          {mixed ? `−${pts(q.lose)}` : "0"}
        </span>
      </span>
      <span className="text-foreground/80 text-sm">a coin flip{mixed ? ", can lose points" : ""}</span>
    </span>
  )
}
