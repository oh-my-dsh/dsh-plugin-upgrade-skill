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

# S7 · Unpublished Cohort — Installation & Type-Baseline Plan (Read-Only Analysis)

**Status:** analysis complete · **Mode:** read-only · **No install / no network / no git / no fixture writes were performed.**
**Cell:** `S7-unpublished-cohort` · **Fixture read:** `fixture/package.json`, `fixture/README.md` (only two files exist)

---

## 0. Verdict up front

| Question | Answer |
|---|---|
| Does `npm install` fail because `0.1.2-alpha.1` was never published? | **No.** The declared spec is a *range*, not a version. Nothing in the resolution path ever asks the registry for the literal string `0.1.2-alpha.1`. |
| Which version actually gets installed? | **`0.1.2-alpha.2`** — the only published version that satisfies `^0.1.2-alpha.1`, and thus the highest one. |
| Will it fall back to `0.1.1-rc.2` (the newest *other* prerelease)? | **No.** `0.1.1-rc.2 < 0.1.2-alpha.1`, so it is below the range floor and ineligible. This is the most common wrong prediction for this scenario. |
| Is the README's "npm install gives you the type baseline" true? | **Technically yes, contractually no.** You get *a* baseline, but never the *declared* one, and it silently drifts. |
| Is the real hazard an install error? | **No — the hazard is silence.** A hard `ETARGET` would have been self-announcing. Here the build stays green on a version nobody pinned. |

---

## 1. Fixture inventory (what is actually verifiable)

```
fixture/package.json   (6 lines)
fixture/README.md      (3 lines)
```

- `name: dsh-cohort-bench`, `version: 0.1.0`, `private: true`
- sole dependency: `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`
- **No `package-lock.json` / `npm-shrinkwrap.json` / `pnpm-lock.yaml` / `yarn.lock`.**
- **No `tsconfig.json`, no `src/`, no `.ts`/`.d.ts`, no `node_modules/`, no `.npmrc`.**
- README states the npm reality (only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` exist; `alpha.1` never published) and marks the material test-only.

**Consequence for this report:** the resolution question (§2) is fully answerable from the manifest plus semver mathematics — no registry access needed. The *compilation* question ("do the plugin's types still check against alpha.2?") is **not answerable at all** from this fixture, because the fixture ships no source and no `tsconfig`. That gap is registered in §6.

---

## 2. Finding 1 — the real consequence of `"^0.1.2-alpha.1"`

### 2.1 Range expansion

node-semver caret expansion for a `0.x.y` version with a prerelease tag:

```
^0.1.2-alpha.1   →   >=0.1.2-alpha.1   <0.2.0-0
```

Two independent gates decide admission:

1. **Interval** — must be `>= 0.1.2-alpha.1` **and** `< 0.2.0-0`. Note the output of caret-desugaring uses `0.2.0-0` (not `0.2.0`) precisely so that prereleases of `0.2.0` are not admitted.
2. **Prerelease gate** — a version carrying a prerelease tag is only admitted if some comparator in the set refers to *the same `major.minor.patch` tuple* **and** itself carries a prerelease. Here that comparator is `>=0.1.2-alpha.1`, tuple `0.1.2`. So `0.1.2-*` prereleases are admitted; `0.1.3-alpha.0` and `0.2.0-alpha.0` are **not**, even though they sit inside the numeric interval.

Recomputed against the published cohort (semver 2.0.0 precedence, prerelease identifiers compared numerically where numeric — `alpha.2 < alpha.10`):

| Published version | `>= 0.1.2-alpha.1` | `< 0.2.0-0` | prerelease gate | Satisfies |
|---|---|---|---|---|
| `0.1.1-rc.1` | ✗ (0.1.1 < 0.1.2) | ✓ | n/a | **no** |
| `0.1.1-rc.2` | ✗ | ✓ | n/a | **no** |
| `0.1.2-alpha.1` *(never published)* | ✓ | ✓ | ✓ | — (unobtainable) |
| `0.1.2-alpha.2` | ✓ | ✓ | ✓ | **yes** |

Projected behaviour for versions that do not exist yet (matters for drift, §2.4):

| Version | Satisfies `^0.1.2-alpha.1` |
|---|---|
| `0.1.2-alpha.10`, `0.1.2-beta.0`, `0.1.2-rc.1` | yes |
| `0.1.2` (first stable) | **yes** |
| `0.1.3` … `0.1.9` (any stable) | **yes** |
| `0.1.3-alpha.0`, `0.2.0-alpha.0` | no (prerelease gate) |
| `0.2.0` | no |

### 2.2 What the installer actually does

1. Fetch the packument for `@deepseek-ai/dsh-llm`.
2. Desugar the range, filter versions, drop prereleases the gate excludes.
3. Pick the **maximum** remaining version → **`0.1.2-alpha.2`**.
4. Write `node_modules/@deepseek-ai/dsh-llm` + a fresh `package-lock.json` pinning `0.1.2-alpha.2` with its tarball `resolved` URL and `integrity` hash.
5. **Leave `package.json` untouched.** A bare `npm install` never rewrites existing ranges. So after a *successful* install the manifest still advertises `^0.1.2-alpha.1` — a version that does not exist — while the tree contains `alpha.2`. The manifest is now permanently lying about the baseline, and the only record of truth is the lockfile.

### 2.3 Where an install *would* fail

The failure mode the scenario intuitively suggests only appears when something asks for the **exact** string `0.1.2-alpha.1`:

| Situation | Expected result | Confidence |
|---|---|---|
| Fresh `npm install` (no lockfile — current fixture state) | succeeds, resolves `0.1.2-alpha.2` | **high** (semver maths) |
| Committed lockfile whose `version`/`resolved` is `0.1.2-alpha.1`, then `npm ci` | fails — `ETARGET`/`E404` on a version absent from the packument; the tarball URL 404s | **medium — unconfirmed**, no lockfile in fixture; exact npm error class not reproducible offline |
| `"@deepseek-ai/dsh-llm": "0.1.2-alpha.1"` (exact pin) | fails — `ETARGET` | high (semver maths) |
| `overrides`/`resolutions` forcing `0.1.2-alpha.1` | fails, same as exact pin | high |
| `npm install @deepseek-ai/dsh-llm@0.1.2-alpha.1` (explicit version on CLI) | fails | high |

So the risk profile is **inverted** relative to the naive reading: a pinned/private-mirror setup fails loudly and cheaply, while the current `^` setup succeeds quietly and expensively.

### 2.4 Why "it installs fine" is still the worse outcome

- **Silent substitution.** The maintainer believes the baseline is `alpha.1`; the compiler is using `alpha.2`. Any API delta between the two alphas is invisible — no lockfile diff was authored, no changelog was read, no reviewer saw a version change.
- **Non-reproducible baseline.** `^0.1.2-alpha.1` admits `0.1.2` (stable), `0.1.3`, …, `0.1.9`. The day `0.1.2` ships, a lockfile-less clone, a cache-clearing CI runner, or a single `npm update` moves the "type baseline" to a stable release — possibly with breaking type changes — with zero manifest churn. Two machines can legitimately disagree about whether the plugin compiles.
- **The README becomes unfalsifiable.** "npm install gives you the type baseline" is true only if "the baseline" means "whatever the resolver picked today".
- **Debugging is misdirected.** Because the install is silent, a later type error gets blamed on the plugin's own code or the compiler version instead of on an unintended minor bump.

### 2.5 README claim, precisely

> "npm install gives you the type baseline"

Accurate restatement: *npm install gives you a type baseline, chosen by the resolver, from a range that can never resolve to the declared version, and which is free to move to a different minor release as soon as one is published.* The claim is not false in the sense of "install errors out"; it is false in the sense that the baseline is neither the declared one nor stable. The README should either name the resolved version or the manifest should pin it.

---

## 3. Options (each with tradeoff and exit path)

All commands below are **for the maintainer to run in a normal networked environment** — none were executed here, per the read-only constraint. `N` = needs registry network.

### Option A — Re-declare at the version that exists, keep a lockfile *(recommended, minimal)*
```jsonc
"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.2" }
```
then `npm install` (N) → commit `package-lock.json`; CI uses `npm ci` (N for first prime, then cacheable).
- **Pro:** one-token change; manifest stops lying; `npm install` and `npm ci` agree; range still allows a smooth pre-1.0 minor ride.
- **Con:** `^` on a `0.x` line still admits `0.1.3+` and the `0.1.2` stable — drift returns whenever the lockfile is bypassed (`npm update`, lock deleted, `--no-package-lock`).
- **Exit:** when `0.1.2` stable appears, run the §4 step-4 type-diff gate and move to `~0.1.2` + refreshed lock; the lockfile makes the interim deterministic, so the exit needs no code change.

### Option B — Exact pin, no caret *(recommended for a "baseline" artifact)*
```jsonc
"devDependencies": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }
```
(`npm i -D --save-exact ...` or `.npmrc: save-prefix=""`), commit lock, CI `npm ci`.
- **Pro:** the manifest *is* the baseline; drift is impossible without a manifest diff a reviewer can see; matches the word "baseline" in the README.
- **Con:** every bump is a manual, reviewable PR (that is the point, but it is friction); no automatic security/patch pickup on the pre-1.0 line.
- **Exit:** relax to `~0.1.2` (patches only) once a stable `0.1.2` is out and the type-diff gate is green; or add Renovate/Dependabot with `rangeStrategy: pin` so bumps arrive as PRs rather than silently.

### Option C — Keep the declared range, force the resolution with `overrides`
```jsonc
"overrides": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }
```
(pnpm: `pnpm.overrides`; Yarn: `resolutions`.)
- **Pro:** leaves `devDependencies` textually intact — useful if the range string itself is contractual/frozen (e.g. a doc snippet being tested, or a published template).
- **Con:** two sources of truth; the override hides the real baseline one indirection deeper; still admits drift for any *transitive* consumer that the override happens not to cover; and it entrenches the false declaration instead of correcting it.
- **Exit:** delete the override and adopt A or B once the manifest may change. Treat C as a temporary unblocker, not a destination.

### Option D — Obtain `alpha.1` out-of-band *(only if code genuinely needs alpha.1's surface)*
Prefer, in order: (D1) pull the tarball from an internal registry proxy / Artifactory / Nexus / CI cache that mirrored it before it was skipped, and consume it as `"@deepseek-ai/dsh-llm": "file:./vendor/dsh-llm-0.1.2-alpha.1.tgz"`; (D2) ask the maintainers to publish `0.1.2-alpha.1` now — since it was **never** published, the version number is still free (npm only blocks re-publication of an *unpublished* version), so this is technically possible; (D3) vendor a checked-in `.d.ts` snapshot of the intended surface.
- **Pro:** pins the true baseline; no range ambiguity.
- **Con:** D1/D2 both **unconfirmed** — no way to prove a mirror holds it or that maintainers will publish; D2 is moot for the range (because `alpha.2 > alpha.1`, `^0.1.2-alpha.1` would *still* resolve to alpha.2 — so D2 only helps together with an exact pin); vendored binaries/tarballs in-repo are an audit and licensing burden.
- **Exit:** the moment a mirror or a real release exists, drop `file:` and return to A/B. Add a `TODO` + issue link next to the `file:` spec so it cannot fossilise.

### Option E — Remove the dependency from the type baseline entirely
If `@deepseek-ai/dsh-llm` is imported only for types, either (E1) source the types from the installed DSH toolchain package if it re-exports them, or (E2) commit a narrow ambient shim (`types/dsh-llm.d.ts`) declaring only the members the plugin uses and drop the `devDependency`.
- **Pro:** zero registry coupling; install becomes deterministic and offline-friendly; the plugin cannot be broken by an upstream alpha.
- **Con:** E1 depends on the host package's layout (**unconfirmed** — not verifiable from this fixture); E2 hand-mirrors an API that will drift, and silently under-declares (the shim is a compile-time lie by construction); if the module is also needed at *runtime*, a shim does not provide it.
- **Exit:** revert to A/B as soon as the dependency stabilises at `0.1.2` stable.

### Option F — Packaging-hygiene companion (do this regardless of A–E)
If the plugin `import`s runtime values from `@deepseek-ai/dsh-llm` (rather than only types), the declaration should be `peerDependencies` (+ `devDependencies` for local type-checking), not `devDependencies` alone — otherwise a consumer silently gets a second, hoisted copy. **Cannot be verified here**: the fixture has no source, so "types-only vs runtime" is **unconfirmed**.

---

## 4. Recommended plan (A′ shape: pin + lock + gate)

Target end state: manifest truthful and exact, lockfile committed, CI deterministic, and one mechanical gate that catches upstream type drift before it reaches users.

1. **Fix the declaration.** Adopt **B** (`"0.1.2-alpha.2"`, no caret). If the range string must stay frozen for external reasons, adopt **C** and file a follow-up to move to B.
2. **Prime and commit the lock.** `npm install` (N) → verify `package-lock.json` records `0.1.2-alpha.2` with an `integrity` hash → commit. Record the resolved version in the README next to the "type baseline" sentence, and note that `alpha.1` never existed.
3. **Make CI strict.** `npm ci` (fails if lock and manifest disagree — this is the tripwire that would have caught the original bug at PR time), then `npx tsc --noEmit` (or the project's `typecheck` script). Add a guard that `package-lock.json` is committed and unmodified after install (`npm install && git diff --exit-code package-lock.json`).
4. **One-shot type-diff gate before any bump.** In a scratch copy: `npm view @deepseek-ai/dsh-llm versions --json` (N) → `npm install <next> --save-exact` (N) → `npx tsc --noEmit` → diff the emitted `.d.ts` surface (`node_modules/@deepseek-ai/dsh-llm/**/*.d.ts`). Green + no surface delta ⇒ bump; otherwise hold and record the delta in the changelog. This is the step that converts "silent substitution" into a reviewable event.
5. **Set expectations.** `peerDependencies` if runtime imports exist (Option F, pending source check); document the supported DSH host range; keep `private: true` until publication is intended.
6. **Rollback.** Every step is a single manifest line + lockfile: `git checkout package.json package-lock.json && npm ci`. Nothing here writes to `node_modules` in a way that cannot be rebuilt from the committed lock.

**Why not just leave `^` and let it resolve?** It *does* resolve — that is the trap. Leaving it means the reported bug ("install fails") is replaced by an unreported one ("baseline silently moved"), and the README keeps promising something nobody can check.

---

## 5. Verification checklist (not executed here; `N` = requires registry network)

| # | Command | Confirms |
|---|---|---|
| 1 | `npm view @deepseek-ai/dsh-llm versions --json` (N) | authoritative published cohort; that `0.1.2-alpha.1` is absent |
| 2 | `npm view @deepseek-ai/dsh-llm dist-tags --json` (N) | where `latest` sits — if `latest` = `0.1.1-rc.2`, a bare `npm i @deepseek-ai/dsh-llm` installs rc.2, a second divergence trap |
| 3 | `npm install --dry-run` (N) | resolved version without touching `node_modules` (dry-run needs metadata, so still network-bound) |
| 4 | `npm ls @deepseek-ai/dsh-llm` | what is actually installed vs declared |
| 5 | `npm ci` + `tsc --noEmit` | lock/manifest agreement and type health |
| 6 | `npx tsc --noEmit --traceResolution` | which `.d.ts` the compiler really binds to — the fastest way to expose a silent swap |

---

## 6. Unconfirmed register

| Item | Why it cannot be verified here | How to confirm |
|---|---|---|
| Registry truly contains only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2` | no network; taken from the brief/README | checklist #1 |
| Exact numeric outcome of `npm install` (`alpha.2`) | derived by hand-executed semver 2.0.0 + node-semver caret/prerelease rules, not by running npm | checklist #3/#4 |
| Whether a stale lockfile bearing `0.1.2-alpha.1` yields `ETARGET` vs `E404` | no lockfile in fixture; no install permitted | reproducible only with a synthetic stale lock + network; treat as **unconfirmed** |
| `dist-tags.latest` value | no network | checklist #2 |
| Whether the plugin's source type-checks against `alpha.2` | **fixture has no `src/`, no `tsconfig.json`** — nothing to compile | needs the real plugin repo |
| Whether `@deepseek-ai/dsh-llm` is used for *types only* or also at runtime (→ `peerDependencies`) | no source in fixture | inspect real imports; Option F |
| Whether a private mirror/CI cache retains the `alpha.1` tarball (Option D1) | no network, no mirror access | query the internal registry; **unconfirmed** |
| Whether maintainers would publish `alpha.1` retroactively (Option D2) | organisational decision, outside the fixture | ask maintainers; note it does **not** fix the range (alpha.2 still wins) |
| Whether DSH's bundled toolchain re-exports these types (Option E1) | outside the read-only whitelist | inspect installed `@deepseek-ai/dsh` package exports |
| Any API/type delta between `alpha.1` and `alpha.2` | `alpha.1` is unobtainable, so no diff baseline exists | not confirmable without the `alpha.1` artifact |

---

## Appendix — semver reasoning detail and constraint log

**Ordering facts used above** (semver 2.0.0 §11, prerelease precedence, numeric identifiers compared numerically):
- `0.1.1-rc.2 < 0.1.2-alpha.1` — patch/minor differ; prerelease comparison never even runs.
- `0.1.2-alpha.1 < 0.1.2-alpha.2 < 0.1.2-alpha.10` — `alpha.2`/`alpha.10` compare **numerically**, not as strings, so `alpha.10` is *later* than `alpha.2`.
- `0.1.2-alpha.2 < 0.1.2-beta.0 < 0.1.2` — a release outranks all of its own prereleases; `beta > alpha` lexically.

**Caret upper bound is `<0.2.0-0`, not `<0.2.0`.** The `-0` sentinel exists to exclude prereleases of the upper bound; combined with the prerelease gate this is why `0.2.0-alpha.0` is rejected while `0.1.2-*` is accepted. Any tool that re-implements the range by hand (CI matrix filters, custom resolvers, `engines`-style checks) must reproduce this, or it will disagree with npm about exactly this cohort.

**Constraint log (this session):** read only `fixture/package.json`, `fixture/README.md`; wrote only into `agent-output/S7-unpublished-cohort/`; ran **no** `npm`/`pnpm`/`yarn`, **no** network calls, **no** `git` commands; no `skills/` content read; fixture bytes untouched. Version math was re-derived independently in-process rather than by invoking a package-manager semver implementation, so no external dependency was installed or loaded to produce §2.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.