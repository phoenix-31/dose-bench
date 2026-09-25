import { describe, expect, it } from "vitest";
import { DoseSession, createEngine } from "@dose-bench/engine";
import { riskLossModel } from "@dose-bench/models";
import { run, type Io } from "../src/run.js";

function memIo(files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    out: (t) => void out.push(t),
    err: (t) => void err.push(t),
    readFile: async (p) => {
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p]!;
    },
    writeFile: async (p, d) => void (files[p] = d),
  };
  return { io, files, out: () => out.join(""), err: () => err.join("") };
}

describe("dose CLI", () => {
  it("prints help and lists models", async () => {
    const h = memIo();
    expect(await run([], h.io)).toBe(0);
    expect(h.out()).toMatch(/dose compile/);
    const m = memIo();
    expect(await run(["models"], m.io)).toBe(0);
    expect(m.out()).toMatch(/risk-loss/);
    expect(m.out()).toMatch(/time-joint/);
  });

  it("compiles a tree to a file that then validates", async () => {
    const t = memIo();
    expect(await run(["compile", "risk-loss", "--length", "4", "--out", "tree.json"], t.io)).toBe(0);
    expect(t.err()).toMatch(/31 nodes/);
    const v = memIo(t.files);
    expect(await run(["validate", "tree.json"], v.io)).toBe(0);
    expect(v.out()).toMatch(/valid dose-tree\/1/);
  });

  it("runs a small recovery study and prints the MPL comparison", async () => {
    const r = memIo();
    expect(await run(["recover", "risk-loss", "--n", "12", "--length", "6"], r.io)).toBe(0);
    expect(r.out()).toMatch(/double MPL/);
  }, 30_000);

  it("re-fits a trace", async () => {
    const trace = {
      format: "dose-trace/1",
      model: "risk-loss",
      length: 2,
      answers: [
        { n: 1, question: "G:10000:5000", choseA: false, rtMs: 900, gainBits: 0.6 },
        { n: 2, question: "M:10000:5000", choseA: true, rtMs: 800, gainBits: 0.5 },
      ],
      estimate: {},
    };
    const f = memIo({ "t.json": JSON.stringify(trace) });
    expect(await run(["fit", "risk-loss", "t.json"], f.io)).toBe(0);
    expect(f.out()).toMatch(/lambda\s+mean/);
  });

  it("validates and re-fits a dose-trace/2 file from a live session", async () => {
    const s = new DoseSession(createEngine(riskLossModel()), { length: 3, sides: "random" });
    while (!s.done) s.choose("left");
    const f = memIo({ "t.json": JSON.stringify(s.trace()) });
    expect(await run(["validate", "t.json"], f.io)).toBe(0);
    expect(f.out()).toMatch(/valid dose-trace\/2/);
    expect(await run(["fit", "risk-loss", "t.json"], f.io)).toBe(0);
    expect(f.out()).toMatch(/rho\s+mean/);
  });

  it("reports usage errors with exit code 2 and failures with 1", async () => {
    const a = memIo();
    expect(await run(["frobnicate"], a.io)).toBe(2);
    expect(a.err()).toMatch(/unknown command/);
    const b = memIo();
    expect(await run(["compile", "risk-loss", "--length", "zero"], b.io)).toBe(2);
    const c = memIo();
    expect(await run(["compile", "nope"], c.io)).toBe(1);
    expect(c.err()).toMatch(/Unknown model/);
    const d = memIo({ "bad.json": '{"format":"dose-tree/1"}' });
    expect(await run(["validate", "bad.json"], d.io)).toBe(1);
  });
});
