import { isLeaf, type Tree } from "@dose-bench/compiler"
import { Download } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { CodeBlock } from "@/components/CodeBlock"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getEngine, param, type ModuleId } from "@/lib/modules"
import { runWorker, type WorkerTask } from "@/lib/worker-task"
import type { CompileInput } from "@/workers/compile.worker"

const makeWorker = () =>
  new Worker(new URL("../workers/compile.worker.ts", import.meta.url), { type: "module" })

export function CompileView({ moduleId }: { moduleId: ModuleId }) {
  const engine = getEngine(moduleId)
  const [length, setLength] = useState(8)
  const [progress, setProgress] = useState<number | null>(null)
  const [tree, setTree] = useState<Tree | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState<boolean[]>([])
  const task = useRef<WorkerTask<Tree> | null>(null)

  const compile = async (len = length) => {
    task.current?.cancel()
    setTree(null)
    setPath([])
    setError(null)
    setProgress(0)
    const t = runWorker<CompileInput, Tree>(makeWorker, { model: moduleId, length: len }, setProgress)
    task.current = t
    try {
      setTree(await t.promise)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message)
    } finally {
      if (task.current === t) setProgress(null)
    }
  }

  useEffect(() => {
    void compile()
    return () => task.current?.cancel()
  }, [moduleId])

  const json = useMemo(() => (tree ? JSON.stringify(tree) : ""), [tree])
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${moduleId}-${tree?.length}.dose-tree.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  let node = 0
  const steps: { text: { a: string; b: string } | undefined; choseA: boolean }[] = []
  if (tree) {
    for (const choseA of path) {
      const n = tree.nodes[node]!
      if (isLeaf(n)) break
      steps.push({ text: engine.model.describe?.(tree.questions[n.q]!), choseA })
      node = choseA ? n.A : n.B
    }
  }
  const current = tree?.nodes[node]

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Compile a static question tree</CardTitle>
          <CardDescription>
            For panels that can't run code mid-survey, the same engine precomputes every path. Each node names
            a question and the next node for each answer. Compilation runs in a Web Worker, so the page stays
            responsive.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-muted-foreground flex flex-col gap-1 text-sm">
              Questions per participant
              <Select
                value={String(length)}
                onValueChange={(v) => {
                  setLength(Number(v))
                  void compile(Number(v))
                }}
              >
                <SelectTrigger className="w-64" aria-label="Questions per participant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[4, 6, 8, 10, 12].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} questions ({(2 ** n - 1).toLocaleString()} decision nodes)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button variant="outline" onClick={download} disabled={!tree}>
              <Download /> Download JSON
            </Button>
          </div>
          {progress !== null && (
            <div className="flex flex-col gap-1">
              <Progress value={progress * 100} />
              <span className="text-muted-foreground font-mono text-xs">
                compiling… {Math.round(progress * 100)}%
              </span>
            </div>
          )}
          {error && <p className="text-destructive text-sm">Compilation failed: {error}</p>}
          {tree && (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Nodes", tree.nodes.length.toLocaleString()],
                  ["Distinct questions", `${tree.questions.length} of ${engine.nQuestions}`],
                  ["JSON size", `${(json.length / 1024).toFixed(0)} KB`],
                  ["Compile time", `${(tree.meta.compiledMs / 1000).toFixed(1)} s`],
                ].map(([k, v]) => (
                  <div key={k} className="border-primary border-l-2 pl-3">
                    <dt className="text-muted-foreground text-xs">{k}</dt>
                    <dd className="num text-lg">{v}</dd>
                  </div>
                ))}
              </dl>
              <CodeBlock
                text={json.length > 4000 ? `${json.slice(0, 4000)} …` : json}
                copyText={json}
                label={`Copy ${(json.length / 1024).toFixed(0)} KB`}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Walk the compiled tree</CardTitle>
          <CardDescription>
            This is all a survey platform does at run time: show a question, follow A or B. No maths.
          </CardDescription>
          {path.length > 0 && (
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => setPath([])}>
                Back to root
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {!tree && <p className="text-muted-foreground text-sm">Compiling…</p>}
          <ol className="flex flex-col">
            {steps.map((st, i) => (
              <li key={i} className="grid grid-cols-[2rem_1fr] gap-2 border-t py-2.5 text-sm">
                <span className="num text-muted-foreground">{i + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span className={st.choseA ? "font-semibold" : "text-muted-foreground"}>
                    {st.choseA && "✓ "}
                    {st.text?.a}
                  </span>
                  <span className="text-muted-foreground text-xs">or</span>
                  <span className={!st.choseA ? "font-semibold" : "text-muted-foreground"}>
                    {!st.choseA && "✓ "}
                    {st.text?.b}
                  </span>
                </span>
              </li>
            ))}
            {tree && current && !isLeaf(current) && (
              <li className="grid grid-cols-[2rem_1fr] gap-2 border-t py-2.5 text-sm">
                <span className="num text-muted-foreground">{steps.length + 1}</span>
                <span className="flex flex-col gap-2">
                  {(["A", "B"] as const).map((side) => (
                    <Button
                      key={side}
                      variant="outline"
                      className="h-auto justify-start py-2 text-left whitespace-normal"
                      onClick={() => setPath([...path, side === "A"])}
                    >
                      <b className="font-mono">{side}</b>{" "}
                      {side === "A"
                        ? engine.model.describe?.(tree.questions[current.q]!).a
                        : engine.model.describe?.(tree.questions[current.q]!).b}
                    </Button>
                  ))}
                </span>
              </li>
            )}
            {current && isLeaf(current) && (
              <li className="grid grid-cols-[2rem_1fr] gap-2 border-t py-2.5 text-sm">
                <span className="text-primary">✓</span>
                <span className="flex flex-wrap items-center gap-2">
                  Leaf reached. Stored estimate:
                  {Object.entries(current.est).map(([k, [m, sd]]) => (
                    <span key={k} className="bg-accent num rounded-md px-2 py-0.5">
                      {param(k).sym} {m.toFixed(2)} ± {sd.toFixed(2)}
                    </span>
                  ))}
                </span>
              </li>
            )}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
