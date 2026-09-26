import type { ParamSummary } from "@dose-bench/engine"
import { param } from "@/lib/modules"

export function Marginal({ name, s, truth }: { name: string; s: ParamSummary; truth?: number | undefined }) {
  const meta = param(name)
  const lo = s.values[0]!,
    hi = s.values[s.values.length - 1]!
  const max = Math.max(...s.marginal, 1e-12)
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-display w-4 text-lg font-bold">{meta.sym}</span>
        <span className="text-foreground/80 text-sm">{meta.name}</span>
        <span className="num ml-auto text-sm">
          {s.mean.toFixed(meta.digits)}{" "}
          <span className="text-muted-foreground text-xs">± {s.sd.toFixed(2)}</span>
        </span>
      </div>
      <div className="relative mt-3 flex h-8 items-end gap-0.5" aria-hidden="true">
        {s.marginal.map((p, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${Math.max(3, (p / max) * 100)}%`,
              background: "color-mix(in oklab, var(--seq-hi) 55%, var(--seq-lo))",
            }}
          />
        ))}
        <b
          className="bg-chart-2 absolute -top-1 bottom-0 w-0.5 -translate-x-px"
          style={{ left: pos(s.mean) }}
        />
        {truth !== undefined && (
          <b
            className="bg-foreground absolute -top-1 bottom-0 w-0.5 -translate-x-px"
            style={{ left: pos(truth) }}
          >
            <span className="absolute -top-3.5 -left-[3px] text-xs">×</span>
          </b>
        )}
      </div>
      <div className="num text-muted-foreground flex justify-between gap-2 text-[11px]">
        <span>{lo.toFixed(meta.digits)}</span>
        <span className="font-sans">{meta.hint}</span>
        <span>{hi.toFixed(meta.digits)}</span>
      </div>
    </div>
  )
}
