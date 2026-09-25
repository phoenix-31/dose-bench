import { copyFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions, defineConfig, type Plugin } from "vite";

// Static hosts like GitHub Pages serve 404.html for unknown paths; make it the app so deep links
// such as /run/time work.
const spaFallback = (): Plugin => ({
  name: "spa-fallback",
  apply: "build",
  writeBundle(options) {
    const dir = options.dir ?? "dist";
    copyFileSync(`${dir}/index.html`, `${dir}/404.html`);
  },
});

export default defineConfig({
  // Set BENCH_BASE=/repo-name/ when deploying to GitHub Pages.
  base: process.env.BENCH_BASE ?? "/",
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // Resolve workspace packages to their TypeScript source in dev and build: no prebuild step needed.
    conditions: ["dose-bench-source", ...defaultClientConditions],
  },
  ssr: { resolve: { conditions: ["dose-bench-source", ...defaultServerConditions] } },
  worker: { format: "es" },
  build: { target: "es2022" },
});
