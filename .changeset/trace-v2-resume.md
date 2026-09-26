---
"@dose-bench/engine": minor
"@dose-bench/compiler": minor
"@dose-bench/react": minor
"@dose-bench/cli": minor
---

`dose-trace/2`: traces record the engine version, a design fingerprint, side randomisation (`sides`, `seed`, per-answer
`swapped`), timestamps and resume count. `DoseSession` gains `sides: "random"`, `choose("left" | "right")` and
`DoseSession.resume(engine, trace)`. The compiler validates both trace formats. `useDoseSession` and `DoseModule` take `sides`,
`seed`, `resume` and `onAnswer`; `ChoiceCard` follows `item.swapped` and ignores double clicks and held keys (`minRtMs`).
`DoseModule`'s `randomiseSides` prop is replaced by `sides`.

Fixes a long-standing bug where `DoseSession.next()` could return an already-asked question (with `gainBits: -1`) once
the question space or the design's `allowed` rule left nothing eligible; the module now ends instead. Models can set
`designKey` so options that change `probA` or `allowed` change `Engine.design`; the presets do. `traceSchema` is now a
discriminated union of `traceV1Schema` and `traceV2Schema`, so it no longer has `.shape`/`.extend`.
