# JUDGE BRIEF · skill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/S7-type-baseline-plan.md

# S7 · Unpublished Cohort — Install / Type-Baseline Plan (Read-Only Report)

- **Mode**: A · inspect (read-only). No file under the fixture was modified; no install, fetch, or switch was executed.
- **Evidence inspected**: `fixture/package.json` (the single declaration), `fixture/README.md`, plus the read-only skill reference `skills/plugin-upgrade/` (SKILL.md, `references/rollup-0.1.2.md` R-01/R-04/R-06/R-08/R-11, `references/v0.1.3-alpha.1.md` A1-07).
- **Fixture state**: only `package.json` + `README.md` exist. There is no `src/`, no lockfile, no `tsconfig.json`, no CI config in the fixture — noted below as an evidence gap.

---

## 1. What actually happens on `npm install` (the semver question)

**Declaration**: `"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`
**Registry reality** (per task brief; matches the npm reality note in `references/rollup-0.1.2.md` R-01, measured 2026-08-31): only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` exist. `0.1.2-alpha.1` was never published.

### Range expansion

For a `0.x` version the caret locks the minor: `^0.1.2-alpha.1` := `>=0.1.2-alpha.1 <0.2.0`.

Per node-semver prerelease semantics, a prerelease version satisfies a range only if some comparator sharing its `[major, minor, patch]` tuple also carries a prerelease. The comparator `>=0.1.2-alpha.1` has tuple `(0,1,2)` **with** a prerelease, so prereleases of tuple `(0,1,2)` are admissible.

### Candidate-by-candidate resolution

| Published version | Satisfies `^0.1.2-alpha.1`? | Why |
|---|---|---|
| `0.1.1-rc.1` | No | Below the lower bound `0.1.2-alpha.1`; also, tuple `(0,1,1)` has no prerelease-carrying comparator in the range |
| `0.1.1-rc.2` | No | Same two independent reasons |
| `0.1.2-alpha.2` | **Yes** | Tuple `(0,1,2)` matches the prerelease-carrying comparator; `alpha.2 > alpha.1` (identifier `alpha` equal, `2 > 1`) |
| `0.1.2-alpha.1` | would match | **does not exist** — never published |

### Answer

- **Will install fail? No.** `npm install` resolves the range to the **newest satisfying published version: `0.1.2-alpha.2`**. There is no E404/ETARGET for the range as written.
- **Which version gets installed?** `0.1.2-alpha.2` — a *different* version from the one the manifest nominally pins.
- **When it WOULD fail**: any consumer that hard-requires the declared exact version — `npm install @deepseek-ai/dsh-llm@0.1.2-alpha.1`, or a lockfile pinning `0.1.2-alpha.1` used with `npm ci` — gets E404/ETARGET (the unpublished-cohort pattern of R-01 / DSH-0.1.3-A1-07).

---

## 2. Real consequence: silent cohort drift, not a loud failure

The dangerous property is the opposite of a broken install: the install **succeeds** while the pinned baseline silently becomes a different version.

1. **The manifest documents a version that never existed.** Anyone reading `^0.1.2-alpha.1` believes the type baseline is alpha.1; what lands is alpha.2. The README's claim "npm install gives you the type baseline" is only defensible if the baseline is redefined as "whatever the caret happens to resolve" — which is alpha.2 today and can move again tomorrow (the range is `>=0.1.2-alpha.1 <0.2.0`, so any later `0.1.2-*` prerelease or `0.1.3/…/<0.2.0` release is admitted; R-01's update records that `0.1.2-alpha.3`/`alpha.4` were published later, and the rollup header shows the `alpha` dist-tag moving to the 0.1.3 line — the drift window is structural, not hypothetical).
2. **Typecheck can break while `package.json` looks untouched.** Per R-11, the alpha.1 → alpha.2 edge carries real type-surface export drift (e.g. `JsonValue`/`isJsonValue`/`snapshotJsonValue`, `deepFreeze`, `assertNever` move out to the new `@deepseek-ai/dsh-util-values`; `settingsNamespace`/`installSettingsSection`/`deepEqualJson` deleted; several error classes unified into `RemoteError` code branching; `collectSessionTitleMessages` made private). Code written against alpha.1-era (or rc.2→alpha.1-era) declarations typechecks in bulk failure (TS2305/TS2614) even though the declared range is "as before". Which rows apply here is **unconfirmed** — the fixture contains no plugin source to scan.
3. **Reproducibility/CI coupling** (R-04): with the range as-is, resolved output depends on registry state at install time. If the plugin's own releases are cut while the intended alpha.1 cohort is unpublished, downstream consumers replicating the *declared intent* (exact alpha.1) are blocked.
4. **Channel caveat** (R-08): if the maintainer's environment sits behind a lagging mirror, the E404/ETARGET you may actually observe is a *channel* failure, not semver — it would still install `0.1.2-alpha.2` from the official registry. Don't confuse the two.

---

## 3. Installation / type-baseline plan

Choose **one** primary path; each has an explicit exit. This report itself is the Mode-A deliverable — paths below are Executed-by-maintainer, not run here.

### Path 1 (recommended) · Re-baseline the declaration to the published alpha.2

- Change `"@deepseek-ai/dsh-llm": "^0.1.2-alpha.1"` → `"^0.1.2-alpha.2"` (the explicit peer-floor rewrite pattern from R-08).
- Fix the README to state the true baseline: "npm install gives you `@deepseek-ai/dsh-llm@0.1.2-alpha.2` declarations".
- Run the mechanical suite (typecheck/build) against the installed alpha.2 declarations; if any import hit an R-11 drift row, apply the ledger row (e.g. add `@deepseek-ai/dsh-util-values` and repoint imports).
- **Tradeoff**: accepts the alpha.2 type surface — i.e., the baseline silently received anyway becomes the documented one. Cost is an honest manifest + a one-time typecheck pass.
- **Exit path**: if the suite goes red beyond a recorded baseline exemption list (R-06), revert the manifest (rollback recorded) and drop to Path 3.

### Path 2 · Keep the caret, lock determinism externally

- Leave `^0.1.2-alpha.1` (it installs fine) and commit a lockfile recording the resolved `0.1.2-alpha.2`; correct the README to say the baseline is "the newest `0.1.2` prerelease admitted by the caret (currently `0.1.2-alpha.2`)".
- **Tradeoff**: smallest diff, but the manifest still documents a nonexistent version; drift within the corridor continues silently. Honest only while the README override is kept in sync.
- **Exit path**: treat as a stopgap; migrate to Path 1 or Path 3 at the next dependency touch.

### Path 3 · The alpha.1 type surface is genuinely required

Only if the plugin was validated against alpha.1 declarations (e.g. rc.2→alpha.1 corridor API) and alpha.2 is unacceptable.
- **Source tarball lane** (R-01 recipe): isolated worktree → checkout tag `dsh-v0.1.2-alpha.1` (tag existence **unconfirmed** here) → build → `pnpm pack` → pin via `overrides` to `file:` tarballs. Add the R-04 CI gates: materialize the tarball store per runner, `NPM_PUBLISH_ENABLED` switch so tags don't publish against an unresolvable cohort.
- **Verify-only lane** (R-01, dsh-TUI #622/#647 pattern): keep the install baseline at the last published cohort and point `tsconfig` `paths` at the alpha.1 source tree; `tsc --noEmit` proves the type surface without installing anything.
- **Exit path**: when the baseline is officially moved forward (or alpha.1 is published — **unconfirmed** whether that will ever happen), delete the overrides/store and return to registry resolution.

### Path 4 · Stay on the last fully published cohort

Drop the declared range to `^0.1.1-rc.2` (note: this does **not** re-admit `0.1.2-alpha.2` — prereleases of tuple (0,1,2) are excluded once the lower bound's tuple is (0,1,1)). Accept the rc.2 API surface (and forgo the alpha.1 corridor changes). **Exit path**: move to Path 1 when alpha.2 types are accepted.

---

## 4. Verification plan (per skill's layered checklist, dependency layers)

1. `npm view @deepseek-ai/dsh-llm versions --json` and `npm view @deepseek-ai/dsh-llm dist-tags` — confirm the three-version reality and which dist-tag points where before choosing a path.
2. `npm view @deepseek-ai/dsh-llm@^0.1.2-alpha.1 version` — observe the resolution is `0.1.2-alpha.2` with no error.
3. After the chosen path: `npm ls @deepseek-ai/dsh-llm` (or `pnpm list --depth 0 | grep @deepseek-ai` on the pnpm lane) shows exactly one @deepseek-ai row at the target version — no mixed cohorts, no rc/alpha mixture (R-01/R-08 verification).
4. Lockfile scanned for `0.1.2-alpha.1` (must be absent — it would guarantee `npm ci` failure) and committed; CI runs with the official registry (`npm_config_registry=https://registry.npmjs.org`) to dodge mirror lag.
5. Typecheck against the installed declarations; changes attributed against a pre-change baseline exemption list (R-06) so drift fixes don't masquerade as regressions.
6. pnpm supply-chain note if the pnpm lane is used: fresh `@deepseek-ai/*` packages can trip pnpm 11's `minimumReleaseAge`; prefer `minimumReleaseAgeExclude` scope exemptions (R-08).

## 5. Rollback

Record original `package.json` (hash/contents), remove any overrides/store dirs, delete generated lockfile, restore the README sentence. Per skill safety boundaries: changes in a dedicated branch/worktree, never auto-stash/reset, confirmation before any write.

## 6. Unconfirmed list

- **Current registry contents**: not queried (no network/install permitted). The three-version list is taken from the task brief and the skill's 2026-08-31 measurement; today's live registry state is unconfirmed.
- **Existence of git tag `dsh-v0.1.2-alpha.1`** (needed by Path 3) — not verified here.
- **Whether `0.1.2-alpha.1` will ever be published** — unknown.
- **Which R-11 drift rows would actually hit this plugin**: the fixture has no source/imports to scan; unconfirmed whether alpha.2 types even change the plugin's consuming surface.
- **Whether a lockfile, `tsconfig.json`, or CI config exists for this plugin** outside the fixture — the fixture directory contains only the two files; anything elsewhere is outside the allowed read scope and was not inspected.
- **`@deepseek-ai/dsh-llm` current `latest`/`alpha` dist-tag targets** (matter only if someone installs a bare package name / tag instead of the range) — unconfirmed.
- **Mirror/pnpm channel behavior** in the eventual installing environment — unconfirmed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.