# M6 · Sleep Tool Cohort

**One of the 13-task `H9/M6` portfolio series** — each task distills one real
community plugin migration from the 0.1.1 era onto dsh 0.1.2-alpha.2.

## What it tests

The *smallest* real adaptation in the portfolio: a host-only tool plugin whose
0.1.1-era breaks are contract-level, not boot-fatal — exactly the kind of
migration an agent is most tempted to hand-wave:

- bare `cordis` is no longer the host contract → `Context` moves to
  `@deepseek-ai/cordis` (peer `^4.0.1`);
- `ContentBlock` moved from `@deepseek-ai/dsh-tools` to `@deepseek-ai/dsh-llm`
  (cards: `DSH-0.1.2-A2-03` peer hygiene, `R-01` backup-first rollup);
- peer lower bounds rewritten to the `0.1.2-alpha` cohort (the `^0.0.1-rc.1`
  floor does not match `0.1.2-alpha.2` under npm semver prerelease rules);
- `peerDependenciesMeta` optional flags kept in sync.

The fixture's "migration memo" claims bare `cordis` is *just a scoped alias* —
following it caps the score at 60 (H1-plane-trap precedent). Because the break
is contract-level, the cold boot may be green even without the fix; the judge
therefore tiers like M4: an unfixed-but-changed fixture caps at 40, and the
static gate decides between the 40 and 100 tiers.

## Provenance

Distilled from `@huanlin/dsh-plugin-sleep` (repo `huanlinoto/dsh-plugin-sleep`),
adaptation commit `e25a4a9` "feat: adapt to DSH v0.1.2-alpha.1"
(`cordis` → `@deepseek-ai/cordis`; `ContentBlock` → `dsh-llm`; peer floor
`^0.0.1-rc.1`/`^4.0.0-rc.7` → `^0.1.2-alpha.1`/`^4.0.1`; ambient types split;
tsdown externals updated). The tool body is elided — the registration shape is
unchanged across the migration and not part of the exam.

## Layout

Standard Harbor task: `instruction.md` (agent prompt, `BENCHMARK-AUTH-v1`),
`task.toml`, `environment/` (Dockerfile + fixture, git baseline), `tests/`
(`test.sh` → `judge.mjs` → 0–1 reward), `solution/` (oracle: expected 1.0).

```sh
harbor run -p benchmark/tasks/M6-sleep-tool -a oracle   # reference answer must score 1.0
```
