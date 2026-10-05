# S7 · Unpublished Cohort — Read-Only Install/Type-Baseline Plan

Task: `fixture/package.json` declares `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` and `fixture/README.md` claims "npm install gives you the type baseline". Registry reality (per the task brief): `@deepseek-ai/*` publishes only `0.1.1-rc.1` / `0.1.1-rc.2` / `0.1.2-alpha.2`; `0.1.2-alpha.1` was never published. No install was run; `fixture/` is unchanged.

## 1. Real consequence of the declaration

- `^0.1.2-alpha.1` expands to `>=0.1.2-alpha.1 <0.2.0`, and because the comparator itself carries a prerelease, npm semver only admits prerelease versions whose `[major,minor,patch]` tuple is exactly `0.1.2` (plus the release `0.1.2` itself and any stable `0.1.2.x`, of which none is known to exist).
  - `0.1.1-rc.1` / `0.1.1-rc.2` do **not** satisfy the range (they are `< 0.1.2-alpha.1` and carry the wrong tuple anyway).
  - `0.1.3-alpha.x` / `0.1.5-*` etc. do **not** satisfy it either (wrong prerelease tuple).
- Therefore `npm install` does **not** fail with ETARGET for the missing alpha.1: npm resolves a range to the highest *published* matching version. Given the brief's npm reality, the range matches exactly one published version — `0.1.2-alpha.2` — so install succeeds and silently installs `@deepseek-ai/dsh-llm@0.1.2-alpha.2`.
  - Caveat: the skill's rollup (references/rollup-0.1.2.md, R-08/R-01) reports a later registry state in which `0.1.2-alpha.3`/`0.1.2-alpha.4`/`0.1.2-rc.1` also exist; if that state applies, the same `^0.1.2-alpha.1` range resolves to the highest `0.1.2.x` published then (e.g. `0.1.2-rc.1`). Either way the resolved version is **not** `0.1.2-alpha.1`. Exact current registry state: **unconfirmed** (no live query performed per constraints).
- The README claim is therefore wrong in effect: `npm install` gives you an alpha.2+ (or rc.1) type surface, not the alpha.1 baseline the range text implies. This matters because the alpha.1→alpha.2 edge carries real type drift (R-11 ledger: `CallId`→`ToolCallId`, `deepFreeze`/`assertNever` → `@deepseek-ai/dsh-util-values`, `JsonValue` family moved, `dsh-client-runtime` removed, etc.). Code written against an alpha.1 baseline may fail typecheck (or typecheck against different declarations) under what npm actually installs.
- If *every* version matching the range were unpublished, npm would fail with `No matching version`/ETARGET. That is not the case here; only the implied lower bound is missing.

## 2. Workable installation / type-baseline plans

### Path A — Accept the published cohort as the real baseline (recommended default)
1. Query the registry read-only first: `npm view @deepseek-ai/dsh-llm versions` and `npm view @deepseek-ai/dsh-llm dist-tags` (currently unconfirmed; expected per brief: 0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.2).
2. Rewrite the range to the exact published target, e.g. `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (exact) or `"^0.1.2-alpha.2"` (floating within 0.1.2.x prereleases of the same tuple).
3. Regenerate the lockfile from scratch if it pins vanished versions (R-08 pitfall 2); add `minimumReleaseAgeExclude: ['@deepseek-ai/*']` to the workspace/profile pnpm config (R-08 pitfall 2); force the official registry to avoid mirror lag E404s (R-08 pitfall 1).
4. Update the README claim to state the real baseline version.
5. Typecheck with the drift ledger (R-11) applied: expect `CallId`→`ToolCallId`-style renames, moved `JsonValue` family, removed `dsh-client-runtime` imports to surface.

Tradeoffs: zero build tooling, uses official artifacts, matches what the host ecosystem actually runs. Exit path: if alpha.2's surface breaks the plugin, go to Path B; if a stable cohort floor matters, widen the range deliberately (e.g. `^0.1.2-alpha.2 || ^0.2.0-rc.1`-style unions per the 0.2.0-rc.1 note) instead of relying on the alpha.1 text.

### Path B — Reproduce the alpha.1 baseline from source (R-01 recipe)
1. In an isolated worktree outside the repo: `git clone https://github.com/deepseek-ai/deepseek-harness.git`, `git checkout dsh-v0.1.2-alpha.1` (tag existence **unconfirmed**), `pnpm install && pnpm run build`.
2. `pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1`.
3. In the plugin: keep the declared range `^0.1.2-alpha.1` but add `overrides` mapping `@deepseek-ai/*` to the local `file:` tarballs; regenerate the lockfile.
4. Note the R-01 caveat (single field report): pnpm 11.9.0 may bypass `file:` overrides for transitive deps with third-party peers — if observed, pin `packageManager: pnpm@11.24.0`; verify with a minimal repro before trusting it.

Tradeoffs: true alpha.1 type surface, but machine-dependent lockfile paths, a mandatory tarball-store materialization script for CI (R-04), and an `NPM_PUBLISH_ENABLED=false` release gate until the cohort ships. Exit path: delete the `overrides` section once alpha.1 (or a superset) is published — registry resolution resumes.

### Path C — Verify-only type lane, no install of the unpublished cohort (dsh-TUI #622 pattern)
1. Keep the install baseline at the nearest published cohort (rc.2 or alpha.2 — decision pending the registry query).
2. Typecheck against the canonical source via tsconfig `paths` pointing at the plugin-upgrade source checkout (`dsh-v0.1.2-alpha.1` tag), running `tsc --noEmit`. This proves the type surface without populating `node_modules` with an unpublished cohort.
3. Verify runtime separately (real DSH profile mount / verify-runtime) — type declarations alone do not prove activation.

Tradeoffs: fast, reproducible in CI, but the installed baseline and the checked types can diverge; mark clearly which lane produces which signal. Exit path: Path A once the cohort is on npm.

### Path D — Dual-cohort coexistence (only if the plugin must run on both rc.2 and an unpublished alpha host)
- See R-02: one artifact, runtime resolution of the cohort surface (`require` probe for platform modules; try/catch probe for injected services; `!!js` probes in `cordis.patch.yml`). Out of scope for a pure type-baseline fix but the fallback when consumers span cohorts.

## 3. Validation plan (once a path is chosen)

- `pnpm list --depth 0 | grep @deepseek-ai` (or `npm ls @deepseek-ai/dsh-llm`) shows exactly one coherent cohort, no mixture, and it equals the intended baseline.
- Full lockfile scan: no `0.1.2-alpha.1` pins, no removed `dsh-client-runtime`, no stale `0.0.1-rc.1` rows.
- Static: `tsc --noEmit` (and build/tests) green, with R-06 baseline attribution — failures must be compared against the pre-existing exemption list, not fixed opportunistically.
- Install log carries no peer-floor prerelease warnings (R-08 pitfall 3): confirm the declared range actually admits the resolved prerelease tuple.

## 4. Rollback

- Record before changes: HEAD/branch, lockfile hash, fixture `package.json` content, resolved versions.
- Overrides/lockfile paths owned by this task only; restore them (not the whole tree) on failure. `pnpm install --frozen-lockfile` on a clean checkout is the verification step (R-04).

## 5. Unconfirmed / limitations

- Exact current npm version list and dist-tags for `@deepseek-ai/dsh-llm` — not queried (offline constraint).
- Whether the GitHub tag `dsh-v0.1.2-alpha.1` exists and builds as the rc.2→alpha.1 card implies — unconfirmed.
- The pnpm 11.9.0 overrides-bypass and retry-parameter claims (single field report per "Pending confirmation") — unconfirmed.
- No external documentation was consulted; analysis relies on the task brief, the fixture, and the in-repo plugin-upgrade references (rollup-0.1.2.md R-01/R-08/R-11, v0.1.2-alpha.1/alpha.2 cards).
- The brief's npm reality (only 0.1.1-rc.1/rc.2 and 0.1.2-alpha.2) conflicts in part with the skill's later measured state (alpha.3/4/5, rc.1 present); both implications are covered in §1.
