import { jointMarginal, mulberry32 } from "@dose-bench/engine";
import { ChoiceCard, DoseProgress, useDoseSession } from "@dose-bench/react";
import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { OptionBody } from "@/components/OptionBody";
import { Marginal } from "@/components/charts/Marginal";
import { PosteriorHeatmap } from "@/components/charts/PosteriorHeatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_TRUTH, getEngine, moduleInfo, param, type ModuleId } from "@/lib/modules";
import { cn } from "@/lib/utils";

const LENGTH = 10;

export function RunLive({ moduleId }: { moduleId: ModuleId }) {
  const engine = getEngine(moduleId);
  const info = moduleInfo(moduleId);
  const s = useDoseSession(engine, { length: LENGTH });
  const [mode, setMode] = useState<"self" | "sim">("self");
  const [truth, setTruth] = useState<Record<string, number>>(DEFAULT_TRUTH[moduleId]);
  const rand = useRef(mulberry32(11));
  const [running, setRunning] = useState(false);

  // Time questions: randomise which side the earlier payment appears on, as in the paper.
  const swap = useMemo(() => moduleId !== "risk-loss" && rand.current() < 0.5, [moduleId, s.history.length]);
  const joint = useMemo(
    () => jointMarginal(engine, s.session.posterior, info.axes[0], info.axes[1]),
    [engine, s.session, s.history.length, info.axes],
  );

  const simulateOne = () => {
    if (s.item) s.answer(rand.current() < engine.model.probA(truth, s.item.question));
  };
  const simulateRest = async () => {
    setRunning(true);
    while (!s.session.done) {
      const item = s.session.next();
      if (!item) break;
      s.answer(rand.current() < engine.model.probA(truth, item.question));
      await new Promise((r) => setTimeout(r, 160));
    }
    setRunning(false);
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Participant view</CardTitle>
          <CardAction>
            <div className="bg-muted inline-flex rounded-full p-0.5 text-sm" role="radiogroup" aria-label="Who answers">
              {(["self", "sim"] as const).map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={cn("rounded-full px-3 py-1 font-medium", mode === m ? "bg-foreground text-background" : "text-muted-foreground")}>
                  {m === "self" ? "You answer" : "Simulated person"}
                </button>
              ))}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <DoseProgress value={s.history.length} total={LENGTH}
            className="flex gap-1 [&>span]:h-1.5 [&>span]:flex-1 [&>span]:rounded-full [&>span]:bg-border [&>span[data-state=done]]:bg-primary [&>span[data-state=current]]:bg-primary/40" />

          {s.item ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 text-xs font-semibold tracking-wider uppercase">
                Question {s.history.length + 1} of {LENGTH}
                <span className="font-mono font-normal tracking-normal normal-case">
                  picked for {s.item.gainBits.toFixed(2)} bits expected · chosen in {s.item.selectMs.toFixed(1)} ms
                </span>
              </p>
              <ChoiceCard
                item={s.item}
                onAnswer={s.answer}
                swap={swap}
                disabled={mode === "sim"}
                keyboard={mode === "self"}
                prompt={s.item.question.kind === "time" ? "Which payment would you rather receive?" : "Which would you rather have?"}
                renderOption={(side, q) => <OptionBody side={side} question={q} />}
                className={cn(
                  "flex flex-col gap-3",
                  "[&_.dose-prompt]:font-display [&_.dose-prompt]:text-xl [&_.dose-prompt]:font-semibold",
                  "[&_.dose-options]:grid [&_.dose-options]:gap-3 sm:[&_.dose-options]:grid-cols-2",
                  "[&_.dose-option]:bg-muted [&_.dose-option]:flex [&_.dose-option]:min-h-36 [&_.dose-option]:items-center [&_.dose-option]:rounded-xl [&_.dose-option]:border-[1.5px] [&_.dose-option]:p-4 [&_.dose-option]:text-left [&_.dose-option]:transition",
                  "[&_.dose-option:not(:disabled)]:cursor-pointer [&_.dose-option:not(:disabled):hover]:border-primary [&_.dose-option:not(:disabled):hover]:-translate-y-px",
                  "[&_.dose-option:focus-visible]:ring-ring/50 [&_.dose-option:focus-visible]:outline-none [&_.dose-option:focus-visible]:ring-[3px]",
                )}
              />
              {mode === "self" && <p className="text-muted-foreground text-xs">Keyboard: ← and → pick the left and right option.</p>}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 py-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Module complete</p>
              <p className="font-display flex flex-wrap gap-x-6 gap-y-1 text-2xl font-semibold tabular-nums">
                {Object.entries(s.estimate.params)
                  .filter(([k]) => k !== "mu")
                  .map(([k, v]) => (
                    <span key={k}>
                      {param(k).sym} = {v.mean.toFixed(2)} <span className="text-muted-foreground text-base font-normal">± {v.sd.toFixed(2)}</span>
                    </span>
                  ))}
              </p>
              <Button onClick={s.reset}>Start a new participant</Button>
            </div>
          )}

          {mode === "sim" && (
            <div className="bg-muted/60 flex flex-col gap-3 rounded-xl border border-dashed p-4">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Simulated person's true preferences</p>
              {engine.model.params.map((p) => (
                <label key={p.name} className="grid grid-cols-[1fr_3rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[11rem_1fr_3rem]">
                  <span>
                    {param(p.name).sym} <span className="text-muted-foreground">{param(p.name).name}</span>
                  </span>
                  <Slider className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" min={p.values[0]!} max={p.values[p.values.length - 1]!} step={0.01}
                    value={[truth[p.name] ?? p.values[0]!]} onValueChange={([v]) => setTruth({ ...truth, [p.name]: v! })} aria-label={param(p.name).name} />
                  <output className="num text-right">{(truth[p.name] ?? 0).toFixed(param(p.name).digits)}</output>
                </label>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={simulateOne} disabled={!s.item || running}>Answer one</Button>
                <Button onClick={simulateRest} disabled={!s.item || running}>Answer the rest</Button>
                <Button variant="ghost" onClick={s.reset} disabled={running}><RotateCcw /> Reset</Button>
              </div>
              <p className="text-muted-foreground text-sm">
                Answers come from the logit choice rule, so a person with low μ makes visible mistakes. Watch the posterior recover.
              </p>
            </div>
          )}
          {mode === "self" && s.history.length > 0 && s.item && (
            <Button variant="ghost" className="self-start" onClick={s.reset}><RotateCcw /> Reset</Button>
          )}

          {s.history.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Answer log</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Option A</TableHead>
                    <TableHead>Option B</TableHead>
                    <TableHead>Chose</TableHead>
                    <TableHead className="text-right">Bits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.history.map((h) => {
                    const d = engine.model.describe?.(h.question);
                    return (
                      <TableRow key={h.n}>
                        <TableCell className="num">{h.n}</TableCell>
                        <TableCell>{d?.a}</TableCell>
                        <TableCell>{d?.b}</TableCell>
                        <TableCell><Badge variant={h.choseA ? "secondary" : "outline"} className="font-mono">{h.choseA ? "A" : "B"}</Badge></TableCell>
                        <TableCell className="num text-right">{h.gainBits.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the engine believes</CardTitle>
          <CardDescription>{info.note}</CardDescription>
          <CardAction>
            <Badge variant="secondary" className="font-mono">{s.estimate.entropyBits.toFixed(1)} bits left</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PosteriorHeatmap joint={joint} x={info.axes[0]} y={info.axes[1]} estimate={s.estimate} truth={mode === "sim" ? truth : undefined} />
          <div className="flex flex-col gap-4">
            {Object.entries(s.estimate.params).map(([k, v]) => (
              <Marginal key={k} name={k} s={v} truth={mode === "sim" ? truth[k] : undefined} />
            ))}
          </div>
          <details className="group">
            <summary className="text-foreground/80 cursor-pointer text-sm">Data record for this participant (dose-trace/1)</summary>
            <div className="mt-2">
              <CodeBlock text={JSON.stringify(s.trace(), null, 2)} />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
