import { readFile, writeFile } from "node:fs/promises";
import { run } from "./run.js";

const code = await run(process.argv.slice(2), {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  interactive: Boolean(process.stderr.isTTY),
});
process.exitCode = code;
