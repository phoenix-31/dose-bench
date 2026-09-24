# @dose-bench/qualtrics

A single-file build of DOSE that defines `window.DOSE`, and a copy-paste Qualtrics template that runs a
10-question risk & loss module live in the respondent's browser.

## Build

```sh
pnpm --filter @dose-bench/qualtrics build   # -> dist/dose.iife.js (about 12 KB minified)
```

## Use in Qualtrics

1. Host `dist/dose.iife.js` somewhere you control (university web space, GitHub Pages).
2. **Look & Feel → General → Header**: paste `template/header.html`, pointing `src` at your copy.
3. **Survey Flow**: add Embedded Data fields `dose_trace`, `dose_rho`, `dose_lambda`, `dose_mu` *before* the DOSE block.
4. Add a *Text / Graphic* question. Paste `template/question.html` into its HTML view and
   `template/question.js` into its JavaScript.
5. Preview. Each respondent gets their own question sequence; the full record lands in `dose_trace`.

`DOSE` exposes `createEngine`, `DoseSession`, `riskLossModel`, `timeModel`, `presetById`, `fitTrace`,
`summarize` and `treeWalker`.

## Panels that block custom JavaScript

Compile a tree instead (`dose compile risk-loss --length 10 --out tree.json`) and implement it with
display logic, or load the JSON and walk it with `DOSE.treeWalker(tree)`.

## Incentives

Adaptive designs are not strictly incentive compatible. The paper pays one randomly chosen question and
cites evidence that gaming is rare (Ray et al. 2012). If reviewers require strict incentive compatibility,
use PRINCE (Johnson et al. 2021): pay a question drawn from the whole question space, asking it if it
wasn't already asked.
