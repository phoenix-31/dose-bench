import { parseArgs } from "node:util";
import { compileTree, validateTrace, validateTree } from "@dose-bench/compiler";
import { createEngine, fitTrace } from "@dose-bench/engine";
import { presetById, presets } from "@dose-bench/models";
import { recovery, type Accuracy } from "@dose-bench/sim";

export interface Io {
  out(text: string): void;
  err(text: string): void;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  /** True when stderr is a terminal: enables the in-place progress indicator. */
  readonly interactive?: boolean;
}

export const VERSION = "0.1.0";

const HELP = `dose ${VERSION}: Dynamically Optimized Sequential Experimentation tools

Usage
  dose models                                   List built-in models
  dose compile <model> [--length 10] [--out tree.json] [--pretty]
                                                Precompute a static question tree
  dose recover <model> [--n 200] [--length 10] [--seed 7] [--json]
                                                Parameter-recovery simulation vs baselines
  dose fit <model> <trace.json>                 Re-estimate a participant record under <model>
  dose validate <file.json>                     Check a dose-tree/1 or dose-trace/1|2 file

Models: ${Object.keys(presets).join(", ")}
`;

class UsageError extends Error {}

const int = (v: string | undefined, name: string, fallback: number, min = 1): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new UsageError(`--${name} must be an integer >= ${min}`);
  return n;
};

const fmtAcc = (a: Accuracy) =>
  `${a.mae.toFixed(3).padStart(7)}  ${(a.inaccuracy * 100).toFixed(0).padStart(4)}%  ${a.spearman.toFixed(2).padStart(5)}`;

export async function run(argv: readonly string[], io: Io): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.out(HELP);
        return 0;
      case "--version":
      case "-v":
        io.out(`${VERSION}\n`);
        return 0;

      case "models": {
        for (const id of Object.keys(presets)) {
          const m = presetById(id);
          const size = m.params.reduce((s, p) => s * p.values.length, 1);
          io.out(
            `${id.padEnd(12)} ${m.label.padEnd(18)} params: ${m.params
              .map((p) => p.name)
              .join(", ")
              .padEnd(24)} grid: ${String(size).padStart(6)}  questions: ${m.questions.length}\n`,
          );
        }
        return 0;
      }

      case "compile": {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: { length: { type: "string" }, out: { type: "string" }, pretty: { type: "boolean" } },
        });
        const id = positionals[0];
        if (!id) throw new UsageError("compile needs a model id");
        const length = int(values.length, "length", 10);
        const engine = createEngine(presetById(id));
        let lastPct = -1;
        const tree = await compileTree(engine, {
          length,
          onProgress: (f) => {
            const pct = Math.floor(f * 10) * 10;
            if (pct !== lastPct && values.out && io.interactive) io.err(`\rcompiling ${id}: ${pct}%`);
            lastPct = pct;
          },
        });
        const json = JSON.stringify(tree, null, values.pretty ? 2 : undefined);
        if (values.out) {
          await io.writeFile(values.out, json + "\n");
          io.err(
            `${io.interactive ? "\r" : ""}compiled ${id}: ${tree.nodes.length} nodes, ${tree.questions.length} distinct questions, ${(json.length / 1024).toFixed(0)} KB in ${(tree.meta.compiledMs / 1000).toFixed(1)} s -> ${values.out}\n`,
          );
        } else {
          io.out(json + "\n");
        }
        return 0;
      }

      case "recover": {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: {
            n: { type: "string" },
            length: { type: "string" },
            seed: { type: "string" },
            json: { type: "boolean" },
          },
        });
        const id = positionals[0];
        if (!id) throw new UsageError("recover needs a model id");
        const engine = createEngine(presetById(id));
        const r = await recovery(engine, {
          n: int(values.n, "n", 200),
          length: int(values.length, "length", 10),
          seed: int(values.seed, "seed", 7, 0),
        });
        if (values.json) {
          io.out(JSON.stringify(r, null, 2) + "\n");
          return 0;
        }
        io.out(`${id}: ${r.n} simulated people, ${r.length} questions each, seed ${r.seed}\n\n`);
        io.out(`${"param".padEnd(8)} ${"method".padEnd(14)}     MAE  inacc.   rank r\n`);
        for (const p of r.params) {
          io.out(`${p.padEnd(8)} ${"DOSE".padEnd(14)} ${fmtAcc(r.byQuestion.dose[p]!.at(-1)!)}\n`);
          io.out(`${"".padEnd(8)} ${"random order".padEnd(14)} ${fmtAcc(r.byQuestion.random[p]!.at(-1)!)}\n`);
          const mpl = r.mpl && (p === "rho" || p === "lambda") ? r.mpl[p] : undefined;
          if (mpl) io.out(`${"".padEnd(8)} ${"double MPL".padEnd(14)} ${fmtAcc(mpl)}\n`);
        }
        if (r.mpl)
          io.out(
            `\nMPL could not recover lambda for ${r.mpl.failed} of ${r.n} people (FOSD-inconsistent answers).\n`,
          );
        return 0;
      }

      case "fit": {
        const [id, file] = rest;
        if (!id || !file) throw new UsageError("fit needs a model id and a trace file");
        const v = validateTrace(JSON.parse(await io.readFile(file)));
        if (!v.ok) throw new UsageError(`not a valid dose-trace file:\n  ${v.errors.join("\n  ")}`);
        const fit = fitTrace(presetById(id), v.value);
        for (const [name, s] of Object.entries(fit.summary.params)) {
          io.out(
            `${name.padEnd(8)} mean ${s.mean.toFixed(3)}  sd ${s.sd.toFixed(3)}  90% [${s.ci90[0].toFixed(2)}, ${s.ci90[1].toFixed(2)}]\n`,
          );
        }
        return 0;
      }

      case "validate": {
        const [file] = rest;
        if (!file) throw new UsageError("validate needs a file");
        const data: unknown = JSON.parse(await io.readFile(file));
        const format = (data as { format?: unknown } | null)?.format;
        const v =
          typeof format === "string" && format.startsWith("dose-trace/")
            ? validateTrace(data)
            : validateTree(data);
        if (v.ok) {
          io.out(`${file}: valid ${String(format)}\n`);
          return 0;
        }
        io.err(`${file}: invalid\n  ${v.errors.slice(0, 20).join("\n  ")}\n`);
        return 1;
      }

      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`dose: ${e.message}\nRun "dose help" for usage.\n`);
      return 2;
    }
    io.err(`dose: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}
