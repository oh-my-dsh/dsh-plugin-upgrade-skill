# H20-session-events-ledger · Alpha.4 Session Event Ledger Migration

The agent migrates the `/app/fixture/src/session-ledger.mjs` plugin-internal
event ledger module from dsh 0.1.2-alpha.3 to 0.1.2-alpha.4, whose real
breaking change is the removal of the `Session.events` getter in favor of the
explicit sequence/window surface. Tests "semantic migration, not symbol
replacement": visible-vs-own window semantics on a real forked session,
half-open window bounds, exact-seq lookup, sequence-brand boundaries, and no
runtime patching.

- **Environment**: `node:24-bookworm` + git; `/app/fixture` ships the alpha.3
  module, its behavioral contract tests, and the exact pinned first-party
  closure `@deepseek-ai/dsh-session@0.1.2-alpha.4` (committed lockfile,
  `npm ci` at build time; the agent phase needs no network for the migration).
  The fixture and `node_modules` are committed as a git baseline — the judge
  rejects any tracked modification outside `fixture/src/session-ledger.mjs`.
- **Verifier**: deterministic. 75 behavioral (contract tests against real
  alpha.4 sessions, including a seeded/forked session) + 15 canonical
  ledger-API migration + 12 hygiene. Hard caps: stale `session.events` read →
  30; invented `getEvents()` → 15; runtime-internal field access → 60;
  seq-as-array-index → 70. Flat 0: fixture untouched, tests/runtime tampered,
  or the removed `events` surface patched back (runtime canary).
- **Oracle**: `harbor run -p benchmark/tasks/H20-session-events-ledger -a oracle`, expected reward 1.0.

```
environment/fixture/   # alpha.3 ledger module + contract tests + pinned closure (test material only)
tests/                 # judge.mjs + judge-utils.mjs + judge-utils.test.mjs + test.sh
solution/              # canonical alpha.4 migration + solve.sh
```
