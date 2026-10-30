# S7 · Unpublished Cohort — Installation / Type-Baseline Plan (Read-Only Report)

- **Mode**: Mode A · inspect (read-only). No file under `fixture/` was modified; no install was executed; no network query was made (per brief).
- **Fixture**: `fixture/package.json` (`dsh-cohort-bench@0.1.0`, `"private": true`) declares `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`; `fixture/README.md` claims "npm install gives you the type baseline".
- **Stated npm reality (from the brief, not re-verified)**: `@deepseek-ai/*` has only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` — **0.1.2-alpha.1 was never published**. This matches skill rollup **R-01**'s npm-reality note (2026-08-31); see "Unconfirmed" for the rollup's later dist-tag updates.
- **Skill cards cited (IDs only)**: R-01, R-02, R-04, R-08, R-11 from `references/rollup-0.1.2.md`; DSH-0.1.2-A2-02 from `references/v0.1.2-alpha.2.md`; API-10 from `references/api-migration-0.1.2-alpha.2.md`.

---

## 1. Real consequence of the declaration

### 1.1 Will install fail? — **No.**

`^0.1.2-alpha.1` is a caret range over a 0.x prerelease. Per npm/node-semver semantics it desugars to:

```
^0.1.2-alpha.1  :=  >=0.1.2-alpha.1  <0.2.0-0
```

(For 0.x versions the caret upper bound is the next minor; for a prerelease lower bound the upper bound is written `<0.2.0-0`.)

Prerelease admission rule (the part people usually miss): a comparator carrying a prerelease tag admits **only prerelease versions sharing the same [major, minor, patch] tuple** — here `[0,1,2]`.

Evaluating the published cohort against the range:

| Version | Satisfies `>=0.1.2-alpha.1 <0.2.0-0`? | Prerelease tuple admitted? | Installed candidate? |
|---|---|---|---|
| 0.1.1-rc.1 | No (< 0.1.2-alpha.1) | tuple [0,1,1] — irrelevant | No |
| 0.1.1-rc.2 | No (< 0.1.2-alpha.1) | tuple [0,1,1] — irrelevant | No |
| **0.1.2-alpha.2** | **Yes** (alpha.2 > alpha.1 in prerelease order) | **tuple [0,1,2] — admitted** | **Yes — highest (only) match** |

So a fresh `npm install` (or `pnpm install`) **succeeds silently and resolves to `@deepseek-ai/dsh-llm@0.1.2-alpha.2`** — no ETARGET, no E404, no warning. The unpublished `alpha.1` in the range is only the *floor*, and npm never tries to fetch it.

### 1.2 The real damage is not an install failure — it is a silent baseline swap

1. **README claim is false in practice.** "npm install gives you the type baseline" implies the alpha.1 type surface. What you actually get is the **alpha.2** type surface. Per **R-11**, the alpha.1 → alpha.2 edge carries real type-surface export drift, including in `@deepseek-ai/dsh-llm` itself: `deepFreeze`/`assertNever` move to `dsh-util-values`; `LlmModelDiscoveryError` becomes `RemoteError<'llm/model-discovery-rejected'>` (see also **DSH-0.1.2-A2-02**); `JsonValue`/`isJsonValue`/`snapshotJsonValue` move out of `dsh-session`; settings helpers are deleted. Consequences cut both ways:
   - Code written against the *intended* alpha.1 baseline can fail typecheck on the installed alpha.2 with TS2305/TS2614 bulk errors.
   - Code that typechecks against the silently-installed alpha.2 may use exports that **do not exist on alpha.1**, so the repo no longer proves anything about alpha.1 compatibility.
2. **Runtime skew if the real host is an alpha.1 build.** alpha.1 is only obtainable by building the upstream tag `dsh-v0.1.2-alpha.1` from source (R-01). A plugin compiled against alpha.2 types but mounted on an alpha.1-source host is exactly the cross-cohort hazard **R-02** describes (missing module-table entries, hard-inject services pending forever), and alpha.2's RemoteResult error-code namespace differs from alpha.1 (**DSH-0.1.2-A2-02**).
3. **The range floats upward.** `^0.1.2-alpha.1` admits *every* future `0.1.2-*` prerelease (same `[0,1,2]` tuple) and the eventual `0.1.2` final. Without a committed lockfile, two fresh installs on different dates can resolve to different cohorts (e.g. alpha.2 today, a later 0.1.2 prerelease tomorrow) — an uncontrolled type baseline even if installs keep "working". With the fixture having **no lockfile**, this drift is currently unbounded.
4. **Private-package caveat.** `"private": true` only blocks publishing; it does nothing to dependency resolution, so none of the above is mitigated.

**Bottom line**: install does **not** fail; the declaration **installs 0.1.2-alpha.2** while claiming an alpha.1 baseline — a silent, floating cohort swap plus a false reproducibility promise in the README.

---

## 2. Workable installation / type-baseline plan

First decide what "alpha.1" means to this plugin, because the correct path depends on the answer:

- **Q1**: Is alpha.1 just an stale floor and alpha.2 is acceptable? → Path A.
- **Q2**: Must the typecheck prove compatibility with the actual (unpublished) alpha.1 surface, e.g. the target host is built from `dsh-v0.1.2-alpha.1`? → Path B (verify-only) or Path C (tarball install).
- **Q3**: Does the plugin only need to support published cohorts? → Path D.

### Path A — Accept alpha.2 as the real baseline (recommended default)

- **Action**: rewrite the declaration to an **exact pin** `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (or `^0.1.2-alpha.2` if upward float within the 0.1.2 prerelease line is acceptable — per **R-08** pitfall 3, an explicit prerelease-carrying floor is also what makes peer ranges match at all); commit the resulting lockfile; fix the README to name the real baseline.
- **Then**: run the R-11 ledger against the plugin source to find alpha.1→alpha.2 import breaks (fixture ships no source — actual hit list **unconfirmed**).
- **Tradeoffs**: honest, registry-resolvable, reproducible (with lockfile). Cost: you are on the alpha.2 surface; any alpha.1-only host is out of scope; the peer floor must carry a prerelease or npm semver refuses the whole 0.1.2 prerelease line (R-08).
- **Exit path**: none needed — this is a terminal registry state. When a later 0.1.2 ships, bump the pin deliberately.

### Path B — Keep alpha.1 as a *verify-only* type baseline, no alpha.1 install (R-01 "verify-only" lane)

- **Action**: keep the installable dependency set on a published cohort (rc.2 or alpha.2) for node_modules; in CI, check out upstream tag `dsh-v0.1.2-alpha.1` and run `tsc --noEmit` with a `tsconfig` `paths` mapping pointing `@deepseek-ai/*` at the checked-out source (pattern credited in R-01 to dsh-TUI #622/#647).
- **Tradeoffs**: proves the alpha.1 type surface with **zero** unpublished installs — no tarball store, no overrides, no lockfile machine paths. Cost: it proves types only; runtime behavior on alpha.1 must be verified separately (mount on a source-built host, R-02 style); two dependency states to maintain.
- **Exit path**: delete the CI lane and the paths mapping once the intended baseline is published on the registry.

### Path C — Install the true alpha.1 cohort from source-built tarballs (R-01 unpublished-cohort recipe)

- **Action**: in an isolated worktree, `git checkout dsh-v0.1.2-alpha.1`, `pnpm install && pnpm run build`, `pnpm -r exec pnpm pack` into a local cohort store, and pin via `overrides` to `file:` tarballs; write the manifest range as `^0.1.2-alpha.1` (it now genuinely resolves to the tarball).
- **Tradeoffs**: the only path that gives you alpha.1 in `node_modules` for real. Costs (all from R-01/R-04): frozen lockfiles record machine-dependent absolute paths (CI needs a store-materialization script + cache); a version tag that triggers npm publish while overrides point at tarballs ships an unresolvable package — irreversible for that version; pnpm-version sensitivity around file:-tarball overrides is a **single-field-report, pending-confirmation** item (pin `packageManager` and reproduce before adopting). Also apply **R-08**: official registry only, per-scope `minimumReleaseAgeExclude`, prerelease-carrying peer floors.
- **Exit path**: once the cohort ships on npm, delete the `overrides` section and regenerate the lockfile — resolution returns to the registry.

### Path D — Stay on the last published 0.1.1 cohort

- **Action**: declare `^0.1.1-rc.2` (exact pin `0.1.1-rc.2` preferred) and keep the plugin on the rc.2 surface until the needed 0.1.2 cohort is published.
- **Tradeoffs**: simplest, fully registry-backed. Cost: oldest API surface; the eventual rc.2 → alpha.1 jump is only carded from source/tag material (alpha.1 unpublished), so the deferred migration is not cheaper — just later.
- **Exit path**: move to Path A when alpha.2 (or later) is acceptable, or Path B/C when alpha.1 fidelity is required.

### Guardrails common to all paths

1. Commit a lockfile and use `--frozen-lockfile` in CI; without it the floating range in §1.2.3 stays live.
2. Verify dependency resolution with `pnpm list --depth 0 | grep @deepseek-ai` (single cohort, no mixture) — layered validation checklist layer 1.
3. For peer ranges, write the floor with an explicit prerelease (`^0.1.2-alpha.2`), never `^0.1.0-rc.8`-style old floors (R-08 pitfall 3).
4. If the plugin must run on hosts of both cohorts, apply **R-02** (runtime probes instead of hard requires/injects) — do not solve it with per-version artifacts.
5. Profile-level staging of the unpacked plugin itself uses the `link:` track (R-09) on a scratch profile, never the production instance.

---

## 3. Unconfirmed items

1. **Registry state not re-verified**: the brief forbids network access; the three-version npm reality is taken from the task brief (consistent with R-01's 2026-08-31 measurement). The rollup additionally records (2026-09-02/04) that `0.1.2-alpha.3`/`alpha.4` were later published under the `alpha` dist-tag and `0.1.2-rc.1` under `next`/`latest` — if true at execution time, `^0.1.2-alpha.1` would resolve **higher than alpha.2** on a fresh lockfile-less install. **Unconfirmed** against the live registry in this run.
2. **Exact resolver output not executed**: §1.1's resolution (`^0.1.2-alpha.1` → 0.1.2-alpha.2) follows standard node-semver range/prerelease rules; per the brief no install or `npm view` was run to demonstrate it. **Unconfirmed by execution** (high confidence from documented semver semantics).
3. **No plugin source in fixture**: only `package.json` + `README.md` exist; which R-11 drift rows (if any) actually hit this plugin's imports is **unconfirmed**.
4. **No lockfile in fixture**: the floating-range drift of §1.2.3 assumes a fresh install; if a consumer-side lockfile exists elsewhere it would pin resolution — **unconfirmed**.
5. **pnpm version sensitivity for file:-tarball overrides** (R-01 note; 11.9.0 vs 11.24.0): single field report, pending confirmation per the rollup's own "Pending confirmation" section.
6. **Existence/location of an alpha.1 target host**: whether any deployment actually runs a source-built alpha.1 host (which would force Path B/C over Path A) is **unconfirmed** from fixture material alone.
7. **Skill rollup status**: rollup-0.1.2.md is based on `dsh-v0.1.2-rc.1` and awaits re-verification against the 0.1.2 final release (its own header caveat).

---

## Report sections per skill template

- **Pre-existing**: not collected (Mode A read-only; no baseline suite run — fixture has no scripts or source).
- **Completed**: read-only analysis of `fixture/package.json` + `fixture/README.md`; semver resolution analysis (§1); four-path plan with tradeoffs and exit paths (§2); card cross-references R-01/R-02/R-04/R-08/R-11, DSH-0.1.2-A2-02, API-10.
- **Skipped**: no install, no network query, no source touchpoint scan (no source files), per brief and Mode A boundaries.
- **Pending/residual risk**: see §3 — principally the un-re-verified registry state and the unknown R-11 hit list.
- **Rollback**: not applicable — nothing was modified; `fixture/` is untouched.
- **Recommendations**: adopt Path A unless an alpha.1-source host is a hard requirement (then Path B first, C only if node_modules-level alpha.1 fidelity is truly needed); in all cases commit a lockfile and correct the README's baseline claim.
