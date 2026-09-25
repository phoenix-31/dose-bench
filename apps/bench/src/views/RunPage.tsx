import { jointMarginal, mulberry32, type Trace } from "@dose-bench/engine";
import { ChoiceCard, DoseProgress, useDoseSession } from "@dose-bench/react";
import { Download, Maximize2, Minimize2, RotateCcw, Shuffle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CodeBlock } from "@/components/CodeBlock";
import { OptionBody } from "@/components/OptionBody";
import { Marginal } from "@/components/charts/Marginal";
import { PosteriorHeatmap } from "@/components/charts/PosteriorHeatmap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEFAULT_TRUTH, getEngine, moduleInfo, param, type ModuleId } from "@/lib/modules";
import { cn } from "@/lib/utils";

const LENGTHS = [6, 8, 10, 12, 15, 20] as const;

interface RunSettings {
  readonly length: number;
  readonly sides: "fixed" | "random";
  readonly focus: boolean;
}

/** Settings live in the URL, so a configured run can be shared as a link. */
function useRunSettings(moduleId: ModuleId) {
  const [search, setSearch] = useSearchParams();
  const len = Number(search.get("length"));
  const sides = search.get("sides");
  const settings: RunSettings = {
    length: (LENGTHS as readonly number[]).includes(len) ? len : 10,
    sides: sides === "fixed" || sides === "random" ? sides : moduleInfo(moduleId).sides,
    focus: search.get("focus") === "1",
  };
  const update = (patch: Partial<RunSettings>) => {
    const next = { ...settings, ...patch };
    const params = new URLSearchParams();
    if (next.length !== 10) params.set("length", String(next.length));
    if (next.sides !== moduleInfo(moduleId).sides) params.set("sides", next.sides);
    if (next.focus) params.set("focus", "1");
    setSearch(params);
  };
  return [settings, update] as const;
}

const storageKey = (moduleId: ModuleId) => `dose-bench:run:${moduleId}`;

function loadTrace(moduleId: ModuleId, s: RunSettings): Trace | null {
  try {
    const raw = localStorage.getItem(storageKey(moduleId));
    const t = raw ? (JSON.parse(raw) as Trace) : null;
    // Only resume a session that was started with the settings now in the URL.
    return t?.format === "dose-trace/2" && t.length === s.length && t.sides === s.sides ? t : null;
  } catch {
    return null;
  }
}
function storeTrace(moduleId: ModuleId, trace: Trace | null) {
  try {
    if (trace) localStorage.setItem(storageKey(moduleId), JSON.stringify(trace));
    else localStorage.removeItem(storageKey(moduleId));
  } catch {
    // Storage blocked (private mode): the run still works, it just won't survive a reload.
  }
}

function downloadTrace(trace: Trace) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `dose-trace-${trace.model}-${trace.startedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RunPage({ moduleId }: { moduleId: ModuleId }) {
  const [settings, setSettings] = useRunSettings(moduleId);
  // A settings change starts a new participant.
  return (
    <RunSession
      key={`${settings.length}:${settings.sides}`}
      moduleId={moduleId}
      settings={settings}
      setSettings={setSettings}
    />
  );
}

function RunSession({
  moduleId,
  settings,
  setSettings,
}: {
  moduleId: ModuleId;
  settings: RunSettings;
  setSettings: (patch: Partial<RunSettings>) => void;
}) {
  const engine = getEngine(moduleId);
  const info = moduleInfo(moduleId);
  const [resumed] = useState(() => loadTrace(moduleId, settings));
  const [showResumed, setShowResumed] = useState(resumed !== null && resumed.answers.length > 0);
  const s = useDoseSession(engine, {
    length: settings.length,
    sides: settings.sides,
    resume: resumed,
    onResumeError: () => storeTrace(moduleId, null),
    onAnswer: (trace) => storeTrace(moduleId, trace),
  });
  const [mode, setMode] = useState<"self" | "sim">("self");
  const [truth, setTruth] = useState<Record<string, number>>(DEFAULT_TRUTH[moduleId]);
  const rand = useRef(mulberry32(11));
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const joint = useMemo(
    () => jointMarginal(engine, s.session.posterior, info.axes[0], info.axes[1]),
    [engine, s.session, s.history.length, info.axes],
  );
  const trace = s.trace();

  const reset = () => {
    stop.current = true;
    storeTrace(moduleId, null);
    setShowResumed(false);
    s.reset();
  };
  const simulateOne = () => {
    if (s.item) s.answer(rand.current() < engine.model.probA(truth, s.item.question));
  };
  const simulateRest = async () => {
    setRunning(true);
    stop.current = false;
    const session = s.session;
    while (!session.done && !stop.current) {
      const item = session.next();
      if (!item) break;
      s.answer(rand.current() < engine.model.probA(truth, item.question));
      await new Promise((r) => setTimeout(r, 160));
    }
    setRunning(false);
  };

  const participant = (
    <div className="flex flex-col gap-5">
      <DoseProgress
        value={s.history.length}
        total={s.length}
        className="flex gap-1 [&>span]:h-1.5 [&>span]:flex-1 [&>span]:rounded-full [&>span]:bg-border [&>span[data-state=done]]:bg-primary [&>span[data-state=current]]:bg-primary/40"
      />
      {s.item ? (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-3 text-xs font-semibold tracking-wider uppercase">
            Question {s.item.n} of {s.length}
            {!settings.focus && (
              <span className="font-mono font-normal tracking-normal normal-case">
                picked for {s.item.gainBits.toFixed(2)} bits expected · chosen in {s.item.selectMs.toFixed(1)}{" "}
                ms
              </span>
            )}
          </p>
          <ChoiceCard
            item={s.item}
            onAnswer={s.answer}
            disabled={mode === "sim"}
            keyboard={mode === "self"}
            prompt={info.prompt}
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
          {mode === "self" && (
            <p className="text-muted-foreground text-xs">Keyboard: ← and → pick the left and right option.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Module complete
          </p>
          <p className="font-display flex flex-wrap gap-x-6 gap-y-1 text-2xl font-semibold tabular-nums">
            {Object.entries(s.estimate.params)
              .filter(([k]) => k !== "mu")
              .map(([k, v]) => (
                <span key={k}>
                  {param(k).sym} = {v.mean.toFixed(2)}{" "}
                  <span className="text-muted-foreground text-base font-normal">± {v.sd.toFixed(2)}</span>
                </span>
              ))}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>Start a new participant</Button>
            <Button variant="outline" onClick={() => downloadTrace(trace)}>
              <Download /> Download data record
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (settings.focus) {
    return (
      <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 px-4 py-10">
        {participant}
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 border-t pt-4 text-xs">
          <span>Participant mode: this is all a participant sees.</span>
          <Button variant="ghost" size="sm" onClick={() => setSettings({ focus: false })}>
            <Minimize2 /> Back to the bench
          </Button>
          {s.history.length > 0 && s.item && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw /> Start over
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsBar
        settings={settings}
        setSettings={setSettings}
        moduleId={moduleId}
        onReset={reset}
        canReset={s.history.length > 0}
        onDownload={() => downloadTrace(trace)}
      />

      {showResumed && (
        <div
          role="status"
          className="bg-muted/60 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm"
        >
          <span>
            Picked up where you left off: {resumed!.answers.length} answer
            {resumed!.answers.length === 1 ? "" : "s"} restored from this browser. A participant who reloads
            the page mid-module gets the same.
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowResumed(false)}>
              Dismiss
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              Start over
            </Button>
          </span>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Participant view</CardTitle>
            <CardAction>
              <div
                className="bg-muted inline-flex rounded-full p-0.5 text-sm"
                role="radiogroup"
                aria-label="Who answers"
              >
                {(["self", "sim"] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-full px-3 py-1 font-medium",
                      mode === m ? "bg-foreground text-background" : "text-muted-foreground",
                    )}
                  >
                    {m === "self" ? "You answer" : "Simulated person"}
                  </button>
                ))}
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {participant}

            {mode === "sim" && (
              <div className="bg-muted/60 flex flex-col gap-3 rounded-xl border border-dashed p-4">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Simulated person's true preferences
                </p>
                {engine.model.params.map((p) => (
                  <label
                    key={p.name}
                    className="grid grid-cols-[1fr_3rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[11rem_1fr_3rem]"
                  >
                    <span>
                      {param(p.name).sym} <span className="text-muted-foreground">{param(p.name).name}</span>
                    </span>
                    <Slider
                      className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                      min={p.values[0]!}
                      max={p.values[p.values.length - 1]!}
                      step={0.01}
                      value={[truth[p.name] ?? p.values[0]!]}
                      onValueChange={([v]) => setTruth({ ...truth, [p.name]: v! })}
                      aria-label={param(p.name).name}
                    />
                    <output className="num text-right">
                      {(truth[p.name] ?? 0).toFixed(param(p.name).digits)}
                    </output>
                  </label>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={simulateOne} disabled={!s.item || running}>
                    Answer one
                  </Button>
                  <Button onClick={simulateRest} disabled={!s.item || running}>
                    Answer the rest
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm">
                  Answers come from the logit choice rule, so a person with low μ makes visible mistakes.
                  Watch the posterior recover.
                </p>
              </div>
            )}

            {s.history.length > 0 && <AnswerLog s={s} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What the engine believes</CardTitle>
            <CardDescription>{info.note}</CardDescription>
            <CardAction>
              <Badge variant="secondary" className="font-mono">
                {s.estimate.entropyBits.toFixed(1)} bits left
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <PosteriorHeatmap
              joint={joint}
              x={info.axes[0]}
              y={info.axes[1]}
              estimate={s.estimate}
              truth={mode === "sim" ? truth : undefined}
            />
            <div className="flex flex-col gap-4">
              {Object.entries(s.estimate.params).map(([k, v]) => (
                <Marginal key={k} name={k} s={v} truth={mode === "sim" ? truth[k] : undefined} />
              ))}
            </div>
            <details className="group">
              <summary className="text-foreground/80 cursor-pointer text-sm">
                Data record for this participant (dose-trace/2)
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Saved after every answer. <code>design</code> fingerprints the grid, questions and prior;{" "}
                  <code>swapped</code> marks answers where option B was shown on the left; <code>seed</code>{" "}
                  reproduces the side order.
                </p>
                <CodeBlock text={JSON.stringify(trace, null, 2)} />
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsBar({
  settings,
  setSettings,
  moduleId,
  onReset,
  canReset,
  onDownload,
}: {
  settings: RunSettings;
  setSettings: (patch: Partial<RunSettings>) => void;
  moduleId: ModuleId;
  onReset: () => void;
  canReset: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <label className="flex flex-col gap-1 text-xs font-medium">
        <span className="text-muted-foreground">Questions</span>
        <Select value={String(settings.length)} onValueChange={(v) => setSettings({ length: Number(v) })}>
          <SelectTrigger className="w-24" aria-label="Number of questions">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LENGTHS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        <span className="text-muted-foreground">Option sides</span>
        <Select
          value={settings.sides}
          onValueChange={(v) => setSettings({ sides: v as RunSettings["sides"] })}
        >
          <SelectTrigger className="w-56" aria-label="Option sides">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">A always left</SelectItem>
            <SelectItem value="random">Randomised per question</SelectItem>
          </SelectContent>
        </Select>
      </label>
      {settings.sides !== moduleInfo(moduleId).sides && (
        <span className="text-muted-foreground flex items-center gap-1 pb-2 text-xs">
          <Shuffle className="size-3.5" /> differs from the paper's default for this module
        </span>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onReset} disabled={!canReset}>
          <RotateCcw /> New participant
        </Button>
        <Button variant="outline" onClick={onDownload} disabled={!canReset}>
          <Download /> Download trace
        </Button>
        <Button variant="outline" onClick={() => setSettings({ focus: true })}>
          <Maximize2 /> Participant mode
        </Button>
      </div>
    </div>
  );
}

function AnswerLog({ s }: { s: ReturnType<typeof useDoseSession> }) {
  const describe = s.session.engine.model.describe;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Answer log</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Option A</TableHead>
            <TableHead>Option B</TableHead>
            <TableHead>Chose</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Time</TableHead>
            <TableHead className="text-right">Bits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {s.history.map((h) => {
            const d = describe?.(h.question);
            return (
              <TableRow key={h.n}>
                <TableCell className="num">{h.n}</TableCell>
                <TableCell>{d?.a}</TableCell>
                <TableCell>{d?.b}</TableCell>
                <TableCell>
                  <Badge
                    variant={h.choseA ? "secondary" : "outline"}
                    className="font-mono"
                    title={`Shown on the ${h.choseA !== h.swapped ? "left" : "right"}`}
                  >
                    {h.choseA ? "A" : "B"}
                    <span className="text-muted-foreground">{h.choseA !== h.swapped ? "←" : "→"}</span>
                  </Badge>
                </TableCell>
                <TableCell className="num hidden text-right whitespace-nowrap sm:table-cell">
                  {(h.rtMs / 1000).toFixed(1)} s
                </TableCell>
                <TableCell className="num text-right">{h.gainBits.toFixed(2)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-muted-foreground text-xs">
        Arrows show which side the chosen option was on. <Link to="/embed">Deploy it in a study →</Link>
      </p>
    </div>
  );
}
