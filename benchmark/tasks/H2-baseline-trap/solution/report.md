# Migration Report (H2-baseline-trap, dsh 0.1.1-rc.2 → 0.1.2-alpha.2)

## Pre-existing (Pre-Migration Baseline, Exemption List)

Ran the mechanical test suite (`node --test test/basic.test.mjs`) before migrating and recorded the baseline:

- **`test/basic.test.mjs` › formatProviderLabel**: expects kebab-case but the implementation returns Title Case; the assertion fails. **This failure already existed before the migration** (the README states the tests were red to begin with), is unrelated to this migration, and was **not introduced by this migration**; per R-06 it goes on the exemption list — not changed here, not attributed to the migration, to be fixed separately later.

## Completed

- `index.js`: `inject: ["apiProxy"]` → `inject: ["llm"]` (host-plane direct connection to the domain service, DSH-0.1.2-A1-01); `ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`.
- `package.json`: removed the dead dependency `@deepseek-ai/dsh-host-apiproxy` (deleted with alpha.1).
- Verification: isolated-profile cold boot (dsh 0.1.2-alpha.2); the plugin tree activated successfully (no pending); the `llm.listProviders()` call went through (a route count of 0 without an API key is expected — a profile configuration matter, not counted as a plugin fault).

## Skipped

- The pre-existing failing test case: exempted per baseline, outside this migration's scope.

## Pending / Residual Risk

- The test failure on the exemption list needs a separate scheduled fix.

## Rollback

- The migration only touched `index.js` and `package.json`; `git checkout -- .` returns to baseline.
