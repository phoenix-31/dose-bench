# Contributing

## Setup

Node 22 (`.nvmrc`) and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm dev          # bench app
pnpm test:watch   # vitest in watch mode
```

## Before you open a PR

```sh
pnpm format && pnpm typecheck && pnpm test && pnpm build
```

CI runs the same commands.

If you changed a published package (`packages/*`, `apps/cli`), add a changeset with `pnpm changeset` and describe the change for
users. Merging to `main` opens a "Version packages" PR; merging that publishes to npm.

## Ground rules

- **`@dose-bench/engine` has no runtime dependencies.** It runs inside survey platforms. Keep it free of DOM and Node APIs.
- **Don't break stored data.** `dose-trace/1` and `dose-tree/1` files are research data. Changes to their shape need a new format
  tag and a reader for the old one.
- **Question ids are stable.** Changing how a preset builds ids changes what old traces mean.
- **Maths changes need evidence.** If you touch selection, updating or a model's `probA`, the seeded recovery tests in
  `packages/sim` must still pass. Say in the PR how the numbers moved.
- **Tests with randomness are seeded.** Use `mulberry32(seed)`, never `Math.random`, in tests.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/): `feat(engine): …`, `fix(react): …`, `docs: …`, `test(sim): …`.
