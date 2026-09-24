# @dose-bench/cli

Command-line tools for DOSE.

```sh
npx @dose-bench/cli models
npx @dose-bench/cli compile risk-loss --length 10 --out risk-loss-10.json
npx @dose-bench/cli recover risk-loss --n 400
npx @dose-bench/cli fit risk-loss trace.json
npx @dose-bench/cli validate risk-loss-10.json
```

Exit codes: 0 success, 1 failure, 2 usage error.
