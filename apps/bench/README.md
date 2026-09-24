# DOSE Bench app

Vite + React 19 + Tailwind v4 + shadcn/ui. Run it with `pnpm dev` from the repo root.

UI primitives live in `src/components/ui` in shadcn's format; add more with `npx shadcn add <component>`.
Tree compilation and recovery simulations run in Web Workers (`src/workers`).

Deploy: `pnpm --filter @dose-bench/bench build` produces a static site in `dist/`. Set `BENCH_BASE=/repo-name/` for GitHub Pages (the `bench-pages` workflow does this).
