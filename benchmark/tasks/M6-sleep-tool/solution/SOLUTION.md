# M6 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/). The migration (mirroring the real
`dsh-plugin-sleep` adaptation, commit `e25a4a9`):

1. `package.json` — bare `cordis` peer removed; `@deepseek-ai/cordis` added at
   `^4.0.1`; `@deepseek-ai/dsh-tools` floor rewritten `^0.0.1-rc.1` →
   `^0.1.2-alpha.1`; `@deepseek-ai/dsh-llm` added at `^0.1.2-alpha.1`
   (ContentBlock's new home); `peerDependenciesMeta` marks all three optional;
   version bumped.
2. `index.js` — the type surface (JSDoc `import(...)` annotations) repointed:
   `Context` from `@deepseek-ai/cordis`, `ContentBlock` from `dsh-llm`,
   `ToolRunContext` stays on `dsh-tools`. No bare `cordis` reference survives.
3. The "migration memo" (bare `cordis` is "just a scoped alias") is a trap —
   bare `cordis` is no longer the host contract; following it leaves the
   plugin on a dead cohort and caps at 60.

## Expected judge score: 100

15 (diagnosis naming `bench-sleep-tool`, citing `DSH-0.1.2-A2-03` + `R-01`)
+ 50 (static contract) + 25 (add + headless activation via `MISSING_CREDENTIAL`)
+ 10 (version bump + private flag) = 100.

## Core point (in one sentence)

Contract-level breaks do not show up in a cold boot — the exam is whether the
agent rewrites the cohort contract (peers, type sources) from the cards anyway
instead of trusting the in-source memo.
