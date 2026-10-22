# JUDGE BRIEF · noskill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/S7-install-type-baseline-plan.md

# S7 · Unpublished Cohort — Install / Type-Baseline Plan (Read-Only Report)

**Scope**: read-only analysis of `fixture/` only. No file under `fixture/` was modified; no `npm install`, `npm ci`, build, or reproduction environment was executed; no network was queried. Registry state is taken as given by the task brief and is marked accordingly.

---

## 1. Fixture evidence (what I could verify)

| Item | Value | Verified |
|---|---|---|
| Plugin name / version / private | `dsh-cohort-bench` / `0.1.0` / `true` | yes (`package.json:2-4`) |
| Dev dependency | `@deepseek-ai/dsh-llm`: `^0.1.2-alpha.1` | yes (`package.json:5`) |
| README claim | "npm install gives you the type baseline" | yes (README.md, task brief) |
| Lockfile (`package-lock.json` / yarn/pnpm) | **absent** | yes (only `package.json` + `README.md` in fixture) |
| `scripts`, `resolutions`, `overrides`, `engines`, `.npmrc` | **absent** | yes |
| `tsconfig.json`, type wiring (`.d.ts` references, `types`/`typings` field) | **absent from fixture** | yes — cannot assess integration shape |
| npm reality per brief | published: `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`; `0.1.2-alpha.1` never published | **given by brief; not independently queried** → unconfirmed |

---

## 2. Semver analysis — what the declaration actually resolves to

### 2.1 Caret expansion

`^0.1.2-alpha.1` is parsed by node-semver (the semver library npm uses) as:

```
>=0.1.2-alpha.1 <0.2.0
```

For `0.x` versions, caret `^0.1.2` allows patch-level changes within the `0.1.x` line up to (but excluding) `0.2.0` — i.e., `>=0.1.2 <0.2.0`. The prerelease part (`-alpha.1`) only raises the lower bound to `>=0.1.2-alpha.1`.

### 2.2 The prerelease rule (the decisive detail)

node-semver's includePrerelease-ish behavior: **a comparator that itself contains a prerelease only accepts other prerelease versions that share the identical `major.minor.patch` tuple as the comparator.** So from this range, only `0.1.2-<prerelease>` versions above `-alpha.1` are selectable; prereleases on other tuples (`0.1.1-rc.*`) can never match, even ignoring precedence.

### 2.3 Match table against the three published versions

| Candidate | Tuple matches `0.1.2`? | Passes `>=0.1.2-alpha.1`? | Overall | Why |
|---|---|---|---|---|
| `0.1.1-rc.1` | no (`0.1.1`) | no — `_RC < _ALPHA` alphabetically in the pre-release identifier ordering at the same tuple, and here the whole version is lower anyway (`0.1.1 < 0.1.2`) | **no match** | tuple mismatch + precedence |
| `0.1.1-rc.2` | no (`0.1.1`) | no — `0.1.1-rc.2 < 0.1.2-alpha.1` | **no match** | tuple mismatch + precedence |
| `0.1.2-alpha.2` | **yes** | **yes** — same tuple `0.1.2`, and `alpha.2 > alpha.1` | **MATCH** | semver prerelease ordering within the same tuple |

### 2.4 Direct answer to the assignment's question

> **Will install actually fail? Which version actually gets installed?**

- **Install will NOT fail.** `^0.1.2-alpha.1` is satisfiable by the published `0.1.2-alpha.2` (same tuple, higher prerelease). npm resolves the range, finds a satisfying version, and proceeds. The missing `0.1.2-alpha.1` is only a *lower bound* that happens to be unpublished — a nonexistent version used as a bound is fine as long as something satisfying it exists.
- **`0.1.2-alpha.2` gets installed** — assuming the registry contents are exactly as stated in the brief and a plain `npm install` with no lockfile overrides the resolution.
- Corollary: the maintainer's *intent* (`alpha.1`) and the *outcome* (`alpha.2`) differ. The declared pin is effectively a "minimum alpha in the 0.1.2 channel", not a fixed version.

### 2.5 Conditions under which it *would* fail (edge cases)

- **Stale/pinned lockfile** pinning `0.1.2-alpha.1` → `ETARGET` ("No matching version found"). Not present in the fixture (verified), but any polluted checkout with a hand-edited lockfile would hit this. The fixture itself contains no lockfile, so this is a downstream-environment risk only.
- **Registry reachability/permissions/private-mirror mismatch** — a local mirror that lacks alpha channels would yield `ETARGET`. *unconfirmed* (no network queries allowed).
- `npm ci` with **no committed lockfile** → fails immediately (`ENOENT package-lock.json` / equivalent), independent of semver.
- **If someone "cleans up" the range to `^0.1.2`** (dropping the prerelease): npm by default **excludes prereleases from ranges that contain no prerelease**, so `0.1.2-alpha.2` would *not* match and install would fail with `ETARGET`. This is the most likely way to turn a working situation into a broken one. (Only `--include-prerelease` or a matching tag restores it.)

---

## 3. Real consequences for the type baseline

1. **A baseline gets installed, but not the one the README implies.** The README's "npm install gives you the type baseline" is *accidentally true in outcome, false in intent*: you receive the `0.1.2`-channel type definitions, specifically `alpha.2`'s. Whether `alpha.2`'s `.d.ts` differs from the never-published `alpha.1`'s is **unconfirmed** (no copy of either package is present in the fixture; alpha.1 does not exist anywhere to diff against).
2. **The declared dependency is aspirational, not reproducible.** `^0.1.2-alpha.1` floating within the `0.1.2` tuple means any future `0.1.2-alpha.3`, `0.1.2-beta.1`, or stable `0.1.2` becomes eligible automatically. With no lockfile in the fixture, two installs on different days can produce different type surfaces — the "baseline" is not pinned.
3. **Downstream contamination risk.** `0.1.2-alpha.2` is a prerelease: consumers of this plugin who install with a stable-only range (`^0.1.2`, `~0.1.2`, `>=0.1.2 <0.2.0`) will *not* pull it via this range — but if the plugin ever re-exports or type-references `@deepseek-ai/dsh-llm` as a regular (non-dev) dependency, the prerelease leaks through. As declared, it is `devDependencies`, so the exposure is limited to local type-checking. *unconfirmed* how `dsh-llm` types are consumed (no tsconfig/type wiring in fixture).
4. **Alpha-channel semantics are not a stable type contract.** Alpha packages may change or break `.d.ts` content without semver notice relative to what reviewers saw.
5. **No build/type scripts exist** in the fixture, so the README's "type baseline" claim maps to nothing in-package that I can verify; how the baseline is validated (tsc pass? dts lint?) is **unconfirmed**.

---

## 4. Installation / type-baseline plan

Multiple paths, with tradeoffs and explicit exit paths. All commands below are **recommendations for the maintainer to run later** — none were executed here.

### Path A — Accept the resolution, make it explicit (fastest, recommended default)

Treat `0.1.2-alpha.2` as the current baseline and pin it exactly.

```bash
npm view @deepseek-ai/dsh-llm versions --json        # sanity: enumerate published versions
npm view @deepseek-ai/dsh-llm@^0.1.2-alpha.1 version  # expect: 0.1.2-alpha.2
npm install --save-dev --save-exact @deepseek-ai/dsh-llm@0.1.2-alpha.2
```

- **Pros**: install succeeds today; no waiting; removes the lie of an unpublished lower bound; keeps the intended `0.1.2` line.
- **Cons**: stays on the alpha channel; new in-channel alphas are no longer auto-picked (that's also a *pro* for reproducibility).
- **Exit**: migrate to stable `0.1.2` (or later 0.2.x) the moment it ships; re-baseline the plugin's types then.
- **Verification**: `npm ls @deepseek-ai/dsh-llm` → `0.1.2-alpha.2`; then run the plugin's normal type-check to record the baseline.

### Path B — Path A + lockfile for reproducibility

Do Path A, then commit `package-lock.json` to the fixture and standardize on `npm ci` in CI.

- **Pros**: byte-reproducible "type baseline"; CI can never silently drift to `alpha.3`.
- **Cons**: locks a prerelease into version control; every intentional bump requires a lockfile touch (there is no lockfile in the fixture — adding one is a policy change for this plugin).
- **Exit**: drop/adjust the lockfile entry when stable ships; `npm install @deepseek-ai/dsh-llm@0.1.2 --save-exact` regenerates it.

### Path C — Retarget to the published `rc` line (`0.1.1-rc.2`)

```bash
npm install --save-dev --save-exact @deepseek-ai/dsh-llm@0.1.1-rc.2
```

- **Pros**: the newest fully published non-alpha-2 version in the given registry set; avoids the alpha.2 drift pool.
- **Cons**: moves the baseline back a minor (`0.1.1` vs `0.1.2`) — type deltas between the rc line and the 0.1.2 channel are **unconfirmed**; likely contradicts whatever the plugin expects from `0.1.2`.
- **Exit**: only justified as a temporary stopgap; return to Path A/B as soon as `0.1.2-alpha.2`-or-better compatibility is confirmed.

### Path D — Dist-tag driven install

```bash
npm view @deepseek-ai/dsh-llm dist-tags --json        # confirm which tags exist (e.g. `alpha`, `rc`, `latest`)
npm install --save-dev @deepseek-ai/dsh-llm@alpha     # only if an `alpha` tag exists and points at 0.1.2-alpha.2
```

- **Pros**: expresses intent ("give me the alpha channel") rather than a frozen number.
- **Cons**: tags are mutable pointers — *unconfirmed* whether an `alpha` tag exists or what it points at; a tag retarget silently changes your baseline; prerelease dist-tags are frequently absent.
- **Exit**: convert to an exact pin (Path A) once the observed target is acceptable.

### Path E — Guard rails instead of changing the spec

Keep the range semantics but enforce the baseline:

- `overrides` (npm ≥8.3) in `package.json`:
  ```json
  "overrides": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }
  ```
- or a CI check: `npm ls @deepseek-ai/dsh-llm --depth=0` and diff against an expected-version file, failing on drift.

- **Pros**: fixes the baseline without rewriting `devDependencies`; catches drift where it hurts.
- **Cons**: overrides mask the real spec problem (the caret lie) and can confuse tooling; check-script is bespoke.
- **Exit**: replace with a proper pin (Path A) whenever the manifest is next touched.

### Recommended sequencing

1. First `npm view` (Path A/D checks) — decision gate, no mutation.
2. Path A pin + record the baseline output.
3. If CI reproducibility matters (it should, for a *type baseline*): Path B lockfile + `npm ci`, or Path E guard.
4. Path C only if `alpha.2` turns out incompatible (compatibility unverified here).
5. Re-baseline on stable `0.1.2` release.

---

## 5. Verification checklist for the maintainer (not executed here)

```bash
# 1. Confirm registry truth before touching anything
npm view @deepseek-ai/dsh-llm versions --json
npm view @deepseek-ai/dsh-llm dist-tags --json

# 2. Confirm the range resolution logic without installing
npx semver -r ^0.1.2-alpha.1 0.1.1-rc.1 0.1.1-rc.2 0.1.2-alpha.2
#   expect: only 0.1.2-alpha.2 echoed (the other two filtered out)

# 3. After choosing a path
npm ls @deepseek-ai/dsh-llm
npm explain @deepseek-ai/dsh-llm        # if installed under npm v8.10+
npx tsc --noEmit                        # establish the actual type baseline result
```

Expected result of step 2 is the formal proof of §2.3: only `0.1.2-alpha.2` satisfies the range.

## 6. Unconfirmed items (explicitly)

- The exact published version list and dist-tags of `@deepseek-ai/dsh-llm` — taken from the brief, **not queried** (no network access permitted in this task).
- Content diff between the unpublishable `0.1.2-alpha.1` and the installed `0.1.2-alpha.2` (types added/removed/changed) — no package copy is present in the fixture.
- Whether `0.1.2-alpha.2`'s types are API-compatible with what the plugin's code expects — no application code, tsconfig, or type-check script exists in the fixture.
- npm/Node versions that will actually be used in CI (prerelease-handling defaults, `overrides` availability, `npm ci` semantics).
- Existence of an `alpha` dist-tag and whether it points at `0.1.2-alpha.2` (needed to judge Path D).
- Any `.npmrc` / mirror / registry-proxy configuration in the real environment, which could hide alpha channels and turn the analysis into an `ETARGET` scenario of §2.5.

## 7. Summary

`^0.1.2-alpha.1` does **not** satisfy the two `0.1.1-rc.*` versions (tuple mismatch and pre-release ordering) but **is** satisfied by `0.1.2-alpha.2`, so a plain install succeeds and lands on `0.1.2-alpha.2` — never the unpublished `0.1.2-alpha.1`. The declaration is best understood as "at least alpha.1 of the 0.1.2 line" and is therefore drift-prone with no lockfile. Recommended: pin `0.1.2-alpha.2` exactly (Path A), optionally lock it (Path B) or guard it (Path E); use `0.1.1-rc.2` (Path C) only as a validated stopgap; do **not** "simplify" the range to `^0.1.2` without care, as that excludes prereleases and would break the install.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.