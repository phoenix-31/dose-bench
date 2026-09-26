import type { JointMarginal, Summary } from "@dose-bench/engine"
import { useState } from "react"
import { param } from "@/lib/modules"
import { fmtTick, ticks } from "./scale"

interface Props {
  readonly joint: JointMarginal
  readonly x: string
  readonly y: string
  readonly estimate: Summary
  readonly truth?: Readonly<Record<string, number>> | undefined
}

const W = 440
const H = 300
const M = { l: 46, r: 10, t: 10, b: 38 }

/** Posterior over two parameters, others summed out. Cells shade from --seq-lo to --seq-hi. */
export function PosteriorHeatmap({ joint, x, y, estimate, truth }: Props) {
  const { x: xs, y: ys, m } = joint
  const cw = (W - M.l - M.r) / xs.length
  const ch = (H - M.t - M.b) / ys.length
  const max = Math.max(...m.flat(), 1e-12)
  const [hover, setHover] = useState<{ i: number; j: number; v: number } | null>(null)

  const x0 = xs[0]!,
    x1 = xs[xs.length - 1]!,
    y0 = ys[0]!,
    y1 = ys[ys.length - 1]!
  const sx = (v: number) => M.l + cw / 2 + ((v - x0) / (x1 - x0)) * (W - M.l - M.r - cw)
  const sy = (v: number) => H - M.b - ch / 2 - ((v - y0) / (y1 - y0)) * (H - M.t - M.b - ch)
  const px = param(x),
    py = param(y)
  const ex = estimate.params[x]!.mean,
    ey = estimate.params[y]!.mean

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-muted-foreground text-sm">
        Posterior over {px.sym} and {py.sym}, other parameters summed out. Darker cells are more probable.
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={`Heatmap of posterior probability over ${px.name} and ${py.name}`}
          onMouseLeave={() => setHover(null)}
        >
          {m.map((row, j) =>
            row.map((v, i) => (
              <rect
                key={`${i}-${j}`}
                x={M.l + i * cw + 0.5}
                y={H - M.b - (j + 1) * ch + 0.5}
                width={cw - 1}
                height={ch - 1}
                rx={1.5}
                style={{
                  fill: `color-mix(in oklab, var(--seq-hi) ${Math.round((v / max) ** 0.7 * 100)}%, var(--seq-lo))`,
                }}
                onMouseEnter={() => setHover({ i, j, v })}
              />
            )),
          )}
          {ticks(x0, x1, 5).map((t) => (
            <g key={`x${t}`} className="fill-muted-foreground stroke-muted-foreground">
              <line x1={sx(t)} x2={sx(t)} y1={H - M.b} y2={H - M.b + 4} />
              <text
                x={sx(t)}
                y={H - M.b + 16}
                textAnchor="middle"
                className="stroke-none font-mono text-[11px]"
              >
                {fmtTick(t)}
              </text>
            </g>
          ))}
          {ticks(y0, y1, 4).map((t) => (
            <g key={`y${t}`} className="fill-muted-foreground stroke-muted-foreground">
              <line x1={M.l - 4} x2={M.l} y1={sy(t)} y2={sy(t)} />
              <text x={M.l - 7} y={sy(t) + 4} textAnchor="end" className="stroke-none font-mono text-[11px]">
                {fmtTick(t)}
              </text>
            </g>
          ))}
          <text
            x={M.l + (W - M.l - M.r) / 2}
            y={H - 3}
            textAnchor="middle"
            className="fill-foreground/80 text-xs"
          >
            {px.sym} {px.name.toLowerCase()}
          </text>
          <text
            transform={`translate(12 ${M.t + (H - M.t - M.b) / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fill-foreground/80 text-xs"
          >
            {py.sym} {py.name.toLowerCase()}
          </text>
          {x === "lambda" && (
            <g className="stroke-foreground/60 fill-foreground/70">
              <line x1={sx(1)} x2={sx(1)} y1={M.t} y2={H - M.b} strokeDasharray="3 3" />
              <text x={sx(1) + 4} y={M.t + 12} className="stroke-none font-mono text-[11px]">
                λ = 1
              </text>
            </g>
          )}
          <circle cx={sx(ex)} cy={sy(ey)} r={6.5} className="fill-none stroke-card" strokeWidth={5} />
          <circle cx={sx(ex)} cy={sy(ey)} r={6.5} className="stroke-chart-2 fill-none" strokeWidth={2.5} />
          <circle cx={sx(ex)} cy={sy(ey)} r={2} className="fill-chart-2" />
          {truth?.[x] !== undefined && truth[y] !== undefined && (
            <path
              d={`M${sx(truth[x]) - 5} ${sy(truth[y]) - 5} l10 10 M${sx(truth[x]) + 5} ${sy(truth[y]) - 5} l-10 10`}
              className="stroke-foreground fill-none"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          )}
        </svg>
        {hover && (
          <div
            className="bg-foreground text-background pointer-events-none absolute z-10 flex flex-col rounded-md px-2 py-1 font-mono text-xs whitespace-nowrap"
            style={{
              left: `${((M.l + (hover.i + 1) * cw) / W) * 100}%`,
              top: `${((H - M.b - (hover.j + 1) * ch) / H) * 100}%`,
              transform: "translate(6px,-4px)",
            }}
          >
            <b>{(hover.v * 100).toFixed(2)}%</b>
            <span>
              {px.sym} {xs[hover.i]!.toFixed(2)} · {py.sym} {ys[hover.j]!.toFixed(2)}
            </span>
          </div>
        )}
      </div>
      <div className="text-foreground/80 flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <i className="border-chart-2 inline-block size-3 rounded-full border-[2.5px]" /> posterior mean
        </span>
        {truth && (
          <span className="inline-flex items-center gap-1.5">
            <b>×</b> true value
          </span>
        )}
      </div>
    </figure>
  )
}
