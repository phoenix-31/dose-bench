import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODULES, getEngine, type ModuleId } from "@/lib/modules";
import { CompileView } from "@/views/CompileView";
import { EmbedView } from "@/views/EmbedView";
import { RecoveryView } from "@/views/RecoveryView";
import { RunLive } from "@/views/RunLive";

const VIEWS = [
  { id: "run", label: "Run live" },
  { id: "compile", label: "Compile tree" },
  { id: "recovery", label: "Recovery test" },
  { id: "embed", label: "Embed" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const initialView = (): View => {
  const h = window.location.hash.slice(1);
  return VIEWS.some((v) => v.id === h) ? (h as View) : "run";
};

export function App() {
  const [moduleId, setModuleId] = useState<ModuleId>("risk-loss");
  const [view, setView] = useState<View>(initialView);
  const engine = getEngine(moduleId);

  useEffect(() => {
    history.replaceState(null, "", `#${view}`);
  }, [view]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-lg" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l3-7 4 14 3-7h4" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl leading-tight font-bold tracking-tight">DOSE Bench</h1>
            <p className="text-muted-foreground text-sm">Bayesian adaptive preference elicitation, running entirely in your browser</p>
          </div>
        </div>
        <Select value={moduleId} onValueChange={(v) => setModuleId(v as ModuleId)}>
          <SelectTrigger className="w-48" aria-label="Module"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODULES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            {VIEWS.map((v) => <TabsTrigger key={v.id} value={v.id}>{v.label}</TabsTrigger>)}
          </TabsList>
          <span className="text-muted-foreground font-mono text-xs">
            {engine.nPoints.toLocaleString()} grid points · {engine.nQuestions} candidate questions · table built in {Math.round(engine.initMs)} ms
          </span>
        </div>
        <TabsContent value="run"><RunLive key={moduleId} moduleId={moduleId} /></TabsContent>
        <TabsContent value="compile"><CompileView key={moduleId} moduleId={moduleId} /></TabsContent>
        <TabsContent value="recovery"><RecoveryView key={moduleId} moduleId={moduleId} /></TabsContent>
        <TabsContent value="embed"><EmbedView /></TabsContent>
      </Tabs>

      <footer className="text-muted-foreground max-w-3xl border-t pt-4 text-xs leading-relaxed">
        Implements the method of Chapman, Snowberg, Wang &amp; Camerer, "Dynamically Optimized Sequential Experimentation (DOSE) for Estimating
        Economic Preference Parameters", NBER WP 33013 (2024). Parameter ranges follow the paper's YouGov implementation; the question space is a
        reconstruction. 1,000 points ≈ $1.
      </footer>
    </div>
  );
}
