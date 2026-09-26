# @dose-bench/qualtrics

A single-file build of DOSE that defines `window.DOSE`, and a copy-paste Qualtrics template that runs a
10-question risk & loss or time module live in the respondent's browser.

## Build

```sh
pnpm --filter @dose-bench/qualtrics build   # -> dist/dose.iife.js (about 14 KB minified)
```

## Use in Qualtrics

1. Host `dist/dose.iife.js` somewhere you control (university web space, GitHub Pages).
2. **Look & Feel → General → Header**: paste `template/header.html`, pointing `src` at your copy.
3. **Survey Flow**: add Embedded Data fields _before_ the DOSE block: `dose_trace` plus one per parameter
   (`dose_rho`, `dose_lambda`, `dose_mu` for risk & loss; `dose_delta`, `dose_beta`, `dose_mu` for time).
4. Add a _Text / Graphic_ question. Paste `template/question.html` into its HTML view and
   `template/question.js` into its JavaScript. Set `MODULE` and `LENGTH` at the top of the script.
5. Preview. Each respondent gets their own question sequence; the full `dose-trace/2` record lands in
   `dose_trace`.

For a second module in the same survey (say, time after risk), add another question with `MODULE = "time"`
and `PREFIX = "dose_time_"`, and matching embedded data fields.

### What the template handles for you

- **Page reloads.** The trace is saved in the respondent's browser after every answer, keyed by response ID,
  and the module resumes at the same question, shown the same way. Resumes are counted in the trace.
- **Side randomisation.** Time modules put the earlier payment on the right about half the time (seeded and
  recorded per answer as `swapped`); risk modules keep the lottery on the left, as in the paper. Change
  `SIDES` to override. `choseA` in the trace always refers to the model's option A.
- **Double clicks.** Clicks within `MIN_RT_MS` (250 ms) of a question appearing, and any after the first, are
  ignored.
- **Provenance.** Each trace records the engine version and a fingerprint of the design, so you can show
  exactly what produced the data.

`test/template.test.ts` runs this script against a stand-in for the Qualtrics API.

`DOSE` exposes `createEngine`, `DoseSession`, `riskLossModel`, `timeModel`, `presetById`, `fitTrace`,
`summarize`, `treeWalker` and `version`.

## Panels that block custom JavaScript

Compile a tree instead (`dose compile risk-loss --length 10 --out tree.json`) and implement it with
display logic, or load the JSON and walk it with `DOSE.treeWalker(tree)`.

## Incentives

Adaptive designs are not strictly incentive compatible. The paper pays one randomly chosen question and
cites evidence that gaming is rare (Ray et al. 2012). If reviewers require strict incentive compatibility,
use PRINCE (Johnson et al. 2021): pay a question drawn from the whole question space, asking it if it
wasn't already asked.
