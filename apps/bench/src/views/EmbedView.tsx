import { CodeBlock } from "@/components/CodeBlock";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const REACT = `import { createEngine } from "@dose-bench/engine";
import { riskLossModel } from "@dose-bench/models";
import { DoseModule } from "@dose-bench/react";
import "@dose-bench/react/styles.css";

const engine = createEngine(riskLossModel()); // build once per page

export function RiskSection({ onDone }: { onDone: (trace: unknown) => void }) {
  return <DoseModule engine={engine} length={10} onComplete={(trace) => onDone(trace)} />;
}`;

const ESM = `import { DoseSession, createEngine } from "@dose-bench/engine";
import { riskLossModel } from "@dose-bench/models";

const session = new DoseSession(createEngine(riskLossModel()), { length: 10 });

function show() {
  const item = session.next();            // most informative question, chosen on this device
  if (!item) return save(session.trace()); // dose-trace/1 JSON
  render(item.text.a, item.text.b);
}
function onChoice(choseA: boolean) {
  session.answer(choseA);                  // Bayes update
  show();
}`;

const QUALTRICS = `// Look & Feel → General → Header: <script src=".../dose.iife.js"></script>
// Question JavaScript (two buttons with classes dose-a and dose-b in the question text):
Qualtrics.SurveyEngine.addOnReady(function () {
  var q = this, box = q.getQuestionContainer();
  var s = new DOSE.DoseSession(DOSE.createEngine(DOSE.riskLossModel()), { length: 10 });
  function show() {
    var item = s.next();
    if (!item) {
      Qualtrics.SurveyEngine.setEmbeddedData("dose_trace", JSON.stringify(s.trace()));
      return q.clickNextButton();
    }
    box.querySelector(".dose-a").textContent = item.text.a;
    box.querySelector(".dose-b").textContent = item.text.b;
  }
  box.querySelector(".dose-a").onclick = function () { s.answer(true); show(); };
  box.querySelector(".dose-b").onclick = function () { s.answer(false); show(); };
  q.hideNextButton();
  show();
});`;

const TREE = `# Locked-down panel? Compile ahead of time, ship JSON, walk it anywhere.
npx @dose-bench/cli compile risk-loss --length 10 --out risk-loss-10.json

import { treeWalker } from "@dose-bench/compiler";
const w = treeWalker(tree);
w.question;      // { kind: "gain", win: 10000, lose: 0, sure: 5000, ... }
w.answer(true);  // follow branch A
w.estimate;      // at a leaf: { rho: [mean, sd], lambda: [...], mu: [...] }`;

export function EmbedView() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader>
          <CardTitle>One engine, four ways to deploy</CardTitle>
          <CardDescription>Everything below uses the same packages as this page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex max-w-prose list-disc flex-col gap-3 pl-5 text-sm leading-relaxed">
            <li>
              <b>React.</b> <code>DoseModule</code> or <code>useDoseSession</code> from{" "}
              <code>@dose-bench/react</code>. Components are unstyled apart from an optional plain-CSS theme.
            </li>
            <li>
              <b>Any page, live.</b> <code>DoseSession</code> from <code>@dose-bench/engine</code> has no
              dependencies and runs in jsPsych, lab.js, oTree templates or a plain page.
            </li>
            <li>
              <b>Qualtrics.</b> The IIFE build exposes a global <code>DOSE</code>. Drive a two-button question
              from its JavaScript and store the trace as embedded data.
            </li>
            <li>
              <b>Precompiled tree.</b> For panels that can't run code mid-survey, compile with the CLI and
              ship JSON. The walker asks exactly what the live engine would.
            </li>
          </ul>
        </CardContent>
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        {[
          ["React", REACT],
          ["Plain TypeScript", ESM],
          ["Qualtrics", QUALTRICS],
          ["Precompiled tree", TREE],
        ].map(([label, code]) => (
          <div key={label} className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{label}</p>
            <CodeBlock text={code!} />
          </div>
        ))}
      </div>
    </div>
  );
}
