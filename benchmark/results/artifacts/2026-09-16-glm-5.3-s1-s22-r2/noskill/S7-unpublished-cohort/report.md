# S7 · Unpublished Cohort — Installation / Type-Baseline Plan (Read-Only Report)

## Scope and evidence

Read-only analysis of the fixture at `environment/fixture` (never modified; no install was executed):

- `package.json` — `"private": true`, `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`
- `README.md` — claims "npm install gives you the type baseline" and states the npm reality: `@deepseek-ai/*` publishes only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`; **`0.1.2-alpha.1` was never published**.

The registry version list comes from the task brief/fixture text; this is a closed-book environment, so the registry state itself is **unconfirmed** (see §4).

## 1. Real consequence of `^0.1.2-alpha.1`

**Install will NOT fail.** Under node-semver:

- A caret range on `0.1.2-alpha.1` (left-most non-zero digit is the minor) means `>=0.1.2-alpha.1 <0.2.0`.
- Prerelease versions only match a comparator carrying a prerelease when the `[major, minor, patch]` tuple is the same. So:
  - `0.1.1-rc.1` / `0.1.1-rc.2` — excluded (below the range and different tuple).
  - `0.1.2-alpha.2` — **matches**: same tuple `0.1.2`, and identifier precedence `alpha.2 > alpha.1` satisfies `>=0.1.2-alpha.1`.
- A future `0.1.2` stable or `0.1.2-beta.*` would also match once published.

**Actual installed version: `@deepseek-ai/dsh-llm@0.1.2-alpha.2`.**

The real consequence is therefore not an install error but a **silent baseline drift**:

- The README's "npm install gives you the type baseline" is misleading: the intended baseline `alpha.1` is unobtainable, and every developer actually compiles against `alpha.2`'s types.
- The caret range does not pin a reproducible baseline. Any later publish inside `<0.2.0` (e.g. `0.1.2` stable, `0.1.3`) silently moves the type baseline again — worse for prerelease-flavored declarations, because maintainers rarely notice the resolved version changed.
- If `alpha.2` introduced type changes relative to the (unpublished) `alpha.1`, type errors or spurious successes are attributed to the wrong baseline, and no lockfile-less environment (CI, fresh clone, consumer of this plugin) reproduces a known state.

## 2. Installation / type-baseline plan

No path requires waiting for `alpha.1` — it does not exist and cannot exist again as a publishable version.

### Path A (recommended): re-declare the baseline as `0.1.2-alpha.2`, pinned exactly

- Change `devDependencies` to `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (exact, no caret) and correct the README sentence to name the version.
- Rationale: a *type baseline* is by definition a fixed reference point; a floating caret range contradicts the README's own claim. Exact-pinning makes `npm install` deterministic across machines and CI.
- Verify: install (in a real environment) and run `tsc --noEmit` against the plugin's sources; record the resolved version in the README or a lockfile.
- Tradeoff: adopting a new alpha requires a deliberate version bump each time (that is the point).
- Exit path: if `alpha.2` types break compilation, fall back to Path B or C; revert the bump commit.

### Path B: keep the caret, add a lockfile + npm `overrides`

- Leave `^0.1.2-alpha.1` but commit `package-lock.json` so the resolved `alpha.2` is frozen, optionally with `"overrides": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }` to force the same resolution for transitive consumers.
- Tradeoff: two sources of truth (manifest range vs override/lockfile); the manifest still *reads* as if `alpha.1` is valid, which keeps the original confusion alive. `overrides` also requires an npm version that supports it (unconfirmed for all consumers).
- Exit path: promote to Path A once the baseline is validated.

### Path C: downgrade baseline to the `0.1.1-rc.x` cohort

- If `alpha.2` is unusable, declare `"0.1.1-rc.2"` (exact) — the newest published `rc`. Note this is a **breaking** range change: `0.1.1-rc.2` does **not** satisfy `^0.1.2-alpha.1`, so this is a conscious baseline reset, and type/API surface differences between the rc and alpha cohorts must be reviewed.
- Tradeoff: oldest, most stable published cohort, but farthest from the intended baseline.
- Exit path: re-upgrade via Path A when a compatible publish lands.

### Path D (defer): wait for `0.1.2` stable

- Keep the range; when `0.1.2` stable is published it satisfies the caret and becomes the highest match. Combined with a lockfile this is viable.
- Tradeoff: until then the baseline keeps resolving to `alpha.2` without anyone choosing it, and a hypothetical bad `0.1.2` publish would be auto-adopted. Not recommended alone.

In all paths: fix the README to state the actual resolved version instead of "npm install gives you the type baseline" as an unqualified promise.

## 3. Verification steps (to run in a real environment — not run here)

1. `npm view @deepseek-ai/dsh-llm versions` — confirm the published cohort (unconfirmed in this closed-book container).
2. In a scratch clone (never the fixture): `npm install`, then `npm ls @deepseek-ai/dsh-llm` — expect `0.1.2-alpha.2` under the current range.
3. `tsc --noEmit` to validate the plugin's types against the resolved baseline.

## 4. Unconfirmed items

- The actual npm registry contents (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`, absence of `0.1.2-alpha.1`) — taken from the brief/fixture text; not independently verifiable offline.
- Whether `0.1.2-alpha.2`'s type surface differs from the intended `alpha.1` (alpha.1 is unobtainable, so no diff is possible).
- Whether a `0.1.2` stable or later alpha is planned (affects Path D viability).
- npm client versions available to consumers (affects `overrides` support in Path B).
