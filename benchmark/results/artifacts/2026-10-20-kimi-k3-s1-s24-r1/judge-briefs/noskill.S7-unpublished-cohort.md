# JUDGE BRIEF · noskill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/S7-unpublished-cohort-install-plan.md

# S7 · Unpublished Cohort — Installation / Type-Baseline Plan (Read-Only Report)

**Scope**: analysis and planning only. Nothing under `fixture/` was modified, and no install was executed.
**Date**: 2026-10-20

---

## 1. Fixture facts (verified read-only)

The fixture contains exactly two files (no `package-lock.json`, no `npm-shrinkwrap.json`, no `node_modules/`):

- `fixture/package.json` — `"name": "dsh-cohort-bench"`, `"private": true`, and the single declaration:
  `"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`
- `fixture/README.md` — claims **"npm install gives you the type baseline"**, while itself stating that npm reality is: only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` exist, and **`0.1.2-alpha.1` was never published**. README also says: "Test material only — do not execute or publish"; grading requires the fixture unchanged vs git HEAD.

Registry state (the version list above) comes from the task brief/README; I could not and did not re-verify it against the live registry — see §5.

---

## 2. Real consequence of `^0.1.2-alpha.1` (semver analysis)

### 2.1 How node-semver expands this range

A caret on a prerelease of a `0.x` version expands to:

```
^0.1.2-alpha.1  →  >=0.1.2-alpha.1  <0.2.0
```

with the crucial **prerelease-tuple rule**: because the range comparator carries a prerelease tag (`-alpha.1`), prerelease versions are admitted **only for the same `[major, minor, patch]` tuple `0.1.2`**. Concretely the satisfied set is:

- ✅ `0.1.2-alpha.1`, `0.1.2-alpha.2`, … any `0.1.2-*` prerelease ≥ `alpha.1`
- ✅ stable `0.1.2`, and stable `0.1.3` … `0.1.x` (< 0.2.0)
- ❌ `0.1.1-rc.1` / `0.1.1-rc.2` — below the floor (`0.1.1` < `0.1.2-alpha.1` in semver ordering; a higher-patch prerelease outranks a lower-patch release)
- ❌ any future `0.1.3-beta.1`-style prerelease of a *different* tuple — excluded by the tuple rule

### 2.2 Will `npm install` fail? — **No.**

Given the brief's registry list {`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`}, there **is** a satisfying version: npm picks the maximum satisfying version → **`0.1.2-alpha.2` is installed**. When a range (not a dist-tag) is requested, npm resolves by max-satisfying, so `dist-tags` are irrelevant here. `ETARGET`/“No matching version” would only occur if **no** published version satisfied the range — e.g. had the declaration been `^0.1.2` (stable-only, prereleases excluded), install *would* fail outright.

### 2.3 The actual (quieter) consequences

1. **Silent substitution**: the declaration names `alpha.1`, but `alpha.2` is what lands in `node_modules`. Nobody is warned; `npm install` exits 0.
2. **The README's promise is false in the literal sense**: “npm install gives you the type baseline” — you do *not* get the `alpha.1` type baseline; you get `alpha.2`'s. Whether their public types differ is **unconfirmed** (see §5); if they do, type-check results drift or break with no signal at install time.
3. **No lockfile → non-reproducible floating baseline**: with only `package.json` present, every fresh `npm install` re-resolves. Today it floats to `0.1.2-alpha.2`; the day a stable `0.1.2`/`0.1.x` (or a higher `0.1.2-*` prerelease) is published, the baseline moves again — still within spec, still without warning.
4. **`npm ci` is currently impossible** (requires a lockfile), so CI cannot reproduce anything deterministically yet.
5. **Fragility**: if `0.1.2-alpha.2` were ever unpublished/yanked, the same declaration flips from “silently works” to hard `ETARGET` failure with no code change on our side.

---

## 3. Workable installation / type-baseline plan

All write steps are proposed for **after** the fixture is unfrozen or in a working copy — none were executed.

### Path A — Align the declaration with reality (recommended)

1. In a working copy, change the devDependency to the version that actually exists and is what npm already resolves to:
   `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` (exact pin) — or minimally `^0.1.2-alpha.2` if floating within the `0.1.2` tuple is acceptable.
2. Generate and commit a lockfile: `npm install --package-lock-only`, then verify with `npm ls @deepseek-ai/dsh-llm`.
3. Update README: replace “npm install gives you the type baseline” with “`npm ci` reproduces the locked type baseline”.
4. CI: use `npm ci` (fails loudly on lockfile/manifest drift).
- **Tradeoffs**: requires editing the manifest (outside this read-only task); bakes in the assumption that `alpha.2`'s types are an acceptable baseline — **unconfirmed** until someone diffs `alpha.1` vs `alpha.2` type surface (alpha.1 cannot be fetched from npm, so this may only be checkable if alpha.1 artifacts exist somewhere internal — unconfirmed).
- **Exit path**: if type-check against `alpha.2` fails, drop to Path C.

### Path B — Maximum reproducibility variant

Path A, but additionally: exact pin (no caret) + committed lockfile + `npm ci --ignore-scripts` in CI + `npm install --save-exact` as the team convention. Optionally `overrides` in `package.json` to force transitive copies of `dsh-llm` to the same version.
- **Tradeoffs**: every intentional bump is a manual PR; slightly more maintenance.
- **Exit path**: loosen to caret once upstream publishes stable `0.1.2`/`0.2.0`.

### Path C — If the `alpha.1` API is genuinely required

`alpha.1` cannot be installed from npm (never published); `overrides`/resolutions **cannot conjure a nonexistent version**. Options, in order of preference:
1. **Downgrade the baseline to `0.1.1-rc.2`** if its type surface covers the plugin's usage (pin exact + lockfile as in Path B). Requires a compatibility check of the plugin's imports against rc.2's typings — **unconfirmed**, needs a compile test in a scratch copy.
2. **Vendor the types**: if a legitimate `alpha.1` artifact exists outside npm (internal registry, git tag, tarball — existence **unconfirmed**), depend on it via `file:` tarball/URL or copy its `.d.ts` into a local `types/` shim wired through `tsconfig` `paths`. Tradeoff: you now own that snapshot; document provenance.
3. **Request/wait for upstream** to publish `alpha.1` (or jump to `alpha.2` and fix breakages) — a process exit path, not a technical one.

### Path D — Do nothing (accept the float)

Keep `^0.1.2-alpha.1`; document in README that it resolves to `0.1.2-alpha.2` today.
- **Tradeoffs**: zero effort now, but the type baseline remains a moving target (§2.3 items 3–5) and the README claim stays misleading. Not recommended for a “type baseline” whose whole point is stability.
- **Exit path**: migrate to Path A at any time with one-line manifest edit + lockfile commit.

### Verification-first preamble (all read-only, safe to run anytime)

```bash
npm view @deepseek-ai/dsh-llm versions --json   # confirm registry reality before choosing a path
npm install --dry-run                            # confirm resolver picks 0.1.2-alpha.2 without writing
```

---

## 4. Recommended sequence (Path A concretely)

1. `npm view @deepseek-ai/dsh-llm versions --json` — verify the three-version reality (do not trust this report or the README blindly).
2. In a **copy** of the fixture (fixture itself stays untouched): set devDep to `0.1.2-alpha.2` (exact).
3. `npm install` in the copy → run the plugin's `tsc --noEmit`/type tests → record whether the baseline compiles.
4. If green: commit manifest + `package-lock.json` + README wording fix (“`npm ci` reproduces the locked type baseline”); wire CI to `npm ci`.
5. If red: fall back to Path C-1 (try `0.1.1-rc.2`) or C-2 (vendor), documenting the decision.
6. Add a CI guard: `npm ls @deepseek-ai/dsh-llm` must print exactly the pinned version.

---

## 5. Unconfirmed items (not verifiable within this task's boundaries)

- **Registry version list** (`0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` only; `alpha.1` never published) — taken from the task brief/README; no network access was permitted or used to re-verify.
- **Whether `0.1.2-alpha.1` artifacts exist anywhere else** (internal registry, git tags, tarballs) — unknown.
- **Whether the type surfaces of `alpha.2` (or `rc.2`) are compatible with what the plugin actually imports** — the fixture contains no source files and no tsconfig, so no compile test was possible; the plugin's real type requirements are unconfirmed.
- **`dsh-llm`'s own peer/engines constraints** (Node version, companion `@deepseek-ai/*` packages) — unknown; could impose additional install-time failures not analyzed here.
- **Exact npm version behavior** assumed above is standard node-semver (npm ≥ 7); pnpm/yarn use equivalent prerelease-tuple semantics, but this was not re-tested locally (no install permitted).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.