import type { RecoveryResult } from "@dose-bench/sim";
import { useEffect, useRef, useState } from "react";
import { RecoveryChart } from "@/components/charts/RecoveryChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { param, type ModuleId } from "@/lib/modules";
import { runWorker, type WorkerTask } from "@/lib/worker-task";
import type { RecoveryInput } from "@/workers/recovery.worker";

type Result = RecoveryResult<string>;
const makeWorker = () => new Worker(new URL("../workers/recovery.worker.ts", import.meta.url), { type: "module" });

export function RecoveryView({ moduleId }: { moduleId: ModuleId }) {
  const [n, setN] = useState(100);
  const [progress, setProgress] = useState<number | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const task = useRef<WorkerTask<Result> | null>(null);

  const run = async (size = n) => {
    task.current?.cancel();
    setError(null);
    setProgress(0);
    const t = runWorker<RecoveryInput, Result>(makeWorker, { model: moduleId, n: size, length: 10, seed: 7 }, setProgress);
    task.current = t;
    try {
      setRes(await t.promise);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (task.current === t) setProgress(null);
    }
  };
  useEffect(() => {
    setRes(null);
    void run();
    return () => task.current?.cancel();
  }, [moduleId]);

  const rows: { label: string; key: "dose" | "random" | "mpl" }[] = [
    { label: "DOSE", key: "dose" },
    { label: "Random order", key: "random" },
    ...(res?.mpl ? [{ label: "Double price list", key: "mpl" as const }] : []),
  ];
  const cell = (key: "dose" | "random" | "mpl", p: string) => {
    if (!res) return undefined;
    if (key === "mpl") return p === "rho" || p === "lambda" ? res.mpl?.[p] : undefined;
    return res.byQuestion[key][p]?.at(-1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parameter recovery: DOSE against random order and a price list</CardTitle>
        <CardDescription>
          Simulated people with known preferences answer through the logit choice rule. DOSE picks each question; the comparison draws questions
          at random from the same space; for risk and loss, a double multiple price list is scored too. This is the paper's §3 check, run in a
          Web Worker in your browser. Seeded, so reruns reproduce exactly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-muted-foreground flex flex-col gap-1 text-sm">
            Simulated people
            <Select value={String(n)} onValueChange={(v) => setN(Number(v))}>
              <SelectTrigger className="w-32" aria-label="Simulated people"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[50, 100, 200, 400, 1000].map((v) => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <Button onClick={() => run()} disabled={progress !== null}>{progress !== null ? "Simulating…" : "Run"}</Button>
        </div>
        {progress !== null && <Progress value={progress * 100} />}
        {error && <p className="text-destructive text-sm">Simulation failed: {error}</p>}
        {res && (
          <>
            <div className="text-foreground/80 flex flex-wrap gap-5 text-sm">
              <span className="inline-flex items-center gap-2"><i className="bg-chart-1 inline-block h-0.5 w-4 rounded" /> DOSE</span>
              <span className="inline-flex items-center gap-2"><i className="bg-chart-2 inline-block h-0.5 w-4 rounded" /> Random order</span>
              {res.mpl && <span className="inline-flex items-center gap-2"><i className="border-chart-3 inline-block w-4 border-t-2 border-dashed" /> Double price list (fixed length)</span>}
            </div>
            <div
              className="grid gap-6 md:grid-cols-2 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
              style={{ "--cols": res.params.length } as React.CSSProperties}
            >
              {res.params.map((p) => (
                <RecoveryChart key={p} name={p} dose={res.byQuestion.dose[p]!} random={res.byQuestion.random[p]!}
                  mpl={p === "rho" || p === "lambda" ? res.mpl?.[p] : undefined} />
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>After {res.length} questions</TableHead>
                  {res.params.map((p) => (
                    <TableHead key={p} colSpan={3} className="text-center">{param(p).sym} {param(p).name}</TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead />
                  {res.params.map((p) => (
                    <FragmentHeads key={p} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    {res.params.map((p) => {
                      const a = cell(r.key, p);
                      return (
                        <FragmentCells key={p} values={a ? [a.mae.toFixed(3), `${(a.inaccuracy * 100).toFixed(0)}%`, a.spearman.toFixed(2)] : ["–", "–", "–"]} />
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-muted-foreground max-w-prose text-sm">
              Inaccuracy is |estimate − truth| / truth, the paper's measure. μ is weakly identified by any 10-question design, as the paper notes.
              {res.mpl && ` The price list could not recover λ for ${res.mpl.failed} of ${res.n} people because their answers imply a dominated choice.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FragmentHeads() {
  return (
    <>
      <TableHead className="text-right">MAE</TableHead>
      <TableHead className="text-right">Inacc.</TableHead>
      <TableHead className="text-right">Rank r</TableHead>
    </>
  );
}
function FragmentCells({ values }: { values: readonly string[] }) {
  return (
    <>
      {values.map((v, i) => (
        <TableCell key={i} className="num text-right">{v}</TableCell>
      ))}
    </>
  );
}
