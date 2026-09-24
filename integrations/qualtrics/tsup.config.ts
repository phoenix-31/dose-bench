import { defineConfig } from "tsup";

// One self-contained file for survey platforms: `<script src="dose.iife.js">` defines window.DOSE.
export default defineConfig({
  entry: { dose: "src/index.ts" },
  format: ["iife"],
  globalName: "DOSE",
  target: "es2017",
  minify: true,
  sourcemap: true,
  clean: true,
  noExternal: [/@dose-bench\//],
  esbuildOptions(o) {
    o.conditions = ["dose-bench-source"];
  },
  outExtension: () => ({ js: ".iife.js" }),
});
