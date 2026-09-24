import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Set BENCH_BASE=/repo-name/ when deploying to GitHub Pages.
  base: process.env.BENCH_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // Resolve workspace packages to their TypeScript source in dev and build: no prebuild step needed.
    conditions: ["development"],
  },
  worker: { format: "es" },
  build: { target: "es2022" },
});
