import type { Accuracy } from "@dose-bench/sim";
import { useState } from "react";
import { param } from "@/lib/modules";
import { fmtTick, niceMax, ticks } from "./scale";

interface Props {
  readonly name: string;
  readonly dose: readonly Accuracy[];
  readonly random: readonly Accuracy[];
  /** Price-list baseline: one value, drawn as a dashed reference line. */
  readonly mpl?: Accuracy | undefined;
}

const W = 320;
const H = 190;
const M = { l: 42, r: 12, t: 12, b: 32 };

/** Mean absolute error by questions answered, DOSE vs random order (and MPL reference). */
export function RecoveryChart({ name, dose, random, mpl }: Props) {
  const len = dose.length;
  const values = [...dose, ...random].map((a) => a.mae).concat(mpl ? [mpl.mae] : []);
  const ymax = niceMax(Math.max(...values));
  const sx = (i: number) => M.l + (len > 1 ? (i / (len - 1)) * (W - M.l - M.r) : 0);
  const sy = (v: number) => H - M.b - (v / ymax) * (H - M.t - M.b);
  const path = (a: readonly Accuracy[]) => a.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v.mae).toFixed(1)}`).join(" ");
  const [hi, setHi] = useState<number | null>(null);
  const meta = param(name);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((((e.clientX - r.left) / r.width) * W - M.l) / (W - M.l - M.r)) * (len - 1));
    setHi(i >= 0 && i < len ? i : null);
  };

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-muted-foreground text-sm">
        <b className="text-foreground font-semibold">{meta.sym} {meta.name}</b>: mean absolute error
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" onMouseMove={onMove} onMouseLeave={() => setHi(null)}
          aria-label={`Mean absolute error in ${meta.name} by number of questions, DOSE versus random order`}>
          {ticks(0, ymax, 4).map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} className="stroke-border" />
              <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[11px]">{fmtTick(t)}</text>
            </g>
          ))}
          {[0, Math.floor((len - 1) / 3), Math.floor((2 * (len - 1)) / 3), len - 1].map((i) => (
            <text key={i} x={sx(i)} y={H - M.b + 16} textAnchor="middle" className="fill-muted-foreground font-mono text-[11px]">{i + 1}</text>
          ))}
          <text x={M.l + (W - M.l - M.r) / 2} y={H - 2} textAnchor="middle" className="fill-foreground/80 text-xs">questions answered</text>
          {mpl && (
            <line x1={M.l} x2={W - M.r} y1={sy(mpl.mae)} y2={sy(mpl.mae)} className="stroke-chart-3" strokeWidth={2} strokeDasharray="5 4" />
          )}
          {hi !== null && <line x1={sx(hi)} x2={sx(hi)} y1={M.t} y2={H - M.b} className="stroke-muted-foreground" strokeDasharray="2 3" />}
          <path d={path(random)} className="stroke-chart-2 fill-none" strokeWidth={2} strokeLinejoin="round" />
          <path d={path(dose)} className="stroke-chart-1 fill-none" strokeWidth={2} strokeLinejoin="round" />
          {[hi ?? len - 1].map((i) => (
            <g key={i}>
              <circle cx={sx(i)} cy={sy(random[i]!.mae)} r={4} className="fill-card stroke-chart-2" strokeWidth={2} />
              <circle cx={sx(i)} cy={sy(dose[i]!.mae)} r={4} className="fill-card stroke-chart-1" strokeWidth={2} />
            </g>
          ))}
        </svg>
        {hi !== null && (
          <div className="bg-foreground text-background pointer-events-none absolute top-0 z-10 flex flex-col rounded-md px-2 py-1 font-mono text-xs whitespace-nowrap"
            style={{ left: `${(sx(hi) / W) * 100}%`, transform: hi > len / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)" }}>
            <b>After {hi + 1} questions</b>
            <span>DOSE {dose[hi]!.mae.toFixed(3)}</span>
            <span>Random {random[hi]!.mae.toFixed(3)}</span>
            {mpl && <span>Price list {mpl.mae.toFixed(3)}</span>}
          </div>
        )}
      </div>
    </figure>
  );
}
