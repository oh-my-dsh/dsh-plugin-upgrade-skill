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

# S7 · Unpublished Cohort — Installation & Type-Baseline Plan

**Subject:** `/app/fixture/` plugin declaring `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`
**Mode:** read-only analysis. No file under `/app/fixture/` was modified. **No install was run.** No registry/network call was made.
**Date of analysis:** 2026-10-21

---

## 0. Scope, method, evidence

**What was inspected** (read once each, read-only):

| File | Relevance |
|---|---|
| `fixture/package.json` | The declaration under analysis (5 lines: name, version, private, devDependencies) |
| `fixture/README.md` | The "npm install gives you the type baseline" claim + the npm reality statement |
| `fixture-seal.pre.json` / `fixture-seal.source.json` | Integrity manifest used to prove the fixture is unmodified |

**Fixture integrity (verified twice — before and after analysis):**

```
73b215c4e9632a8a3d7b7b29bd659aaa42e0e799f3e3d64b666b8cb9f2be1b4e  package.json
b4a1f0ef2a1ce99d3e89b0c77d35fc2d55331b8eb10e41c35f7a4a172fa89ab9  README.md
```

These match `fixture-seal.pre.json` and `fixture-seal.source.json` byte-for-byte. The fixture is **unchanged**.

**Method.** npm's resolution of a range is a pure function of (a) the range grammar and (b) the set of published versions. I re-implemented node-semver's `replaceCaret` / `replaceTilde` / `satisfies` semantics locally and exercised it offline against the published-version set stated in the brief. The implementation is self-tested against the semver.org spec table — **25/25 assertions pass, 0 failures** (see §6). No network, no `npm install`, no `npm view`, no registry query.

**Caveat on the method:** this is a *re-implementation* of node-semver, not node-semver itself — loading npm's bundled copy would have required reading a path outside the permitted read whitelist, so it was not done. The re-implementation is anchored to the semver.org spec table, which is the same contract node-semver implements. Every conclusion in §2 is a consequence of the range grammar and the published set, both of which are fixed inputs here.

**The published-version set used** (taken from the brief's README statement — *not* queried, per the authorization):

```
0.1.1-rc.1   0.1.1-rc.2   0.1.2-alpha.2
```

---

## 1. The fixture as found

```json
{
  "name": "dsh-cohort-bench",
  "version": "0.1.0",
  "private": true,
  "devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }
}
```

Two observations about the fixture's own shape, which bound what can be concluded:

- The manifest is a **deliberately reduced copy** (the README calls itself an "S7-specific copy" and "Test material only"). It has no `scripts`, no `type`, no `main`/`types`/`exports`, no `peerDependencies`, no `files`, and there is **no `package-lock.json`** in the tree. So statements about the real plugin's scripts, peer requirements, or lockfile are **unconfirmed** (§5).
- The dependency is a **`devDependency`**. It therefore supplies types to the *plugin author's* editor, typecheck and CI — and to any consumer only if the plugin re-exports those types. This matters for §3.7 but does not change the resolution arithmetic.

---

## 2. Part 1 — What the declaration actually does

### 2.1 Range expansion

node-semver's `replaceCaret` has three branches. For `0.x` versions with a non-zero minor, the upper bound is the **next minor**, and a prerelease in the lower bound is preserved:

```
^0.1.2-alpha.1   =>   >=0.1.2-alpha.1  <0.2.0-0
```

(For reference: `^1.2.3` → `>=1.2.3 <2.0.0-0`; `^0.0.3` → `>=0.0.3 <0.0.4-0`. All three branches were self-tested.)

Note also that on the `0.1.x` line, **caret and tilde are identical**: `~0.1.2-alpha.1` → `>=0.1.2-alpha.1 <0.2.0-0`. Swapping `^` for `~` changes nothing here.

### 2.2 Resolution against the real registry state

The semver prerelease rule: *a prerelease version satisfies a comparator-set only if some comparator in that set has the same `[major, minor, patch]` tuple and is itself a prerelease.* Here `>=0.1.2-alpha.1` is a prerelease comparator on tuple `(0, 1, 2)`, so **every prerelease of 0.1.2 is eligible** — and stable 0.1.2 is eligible too (it has no prerelease tag, so the restriction does not apply to it at all).

Applying that to the published set:

| Published version | Satisfies `^0.1.2-alpha.1`? | Note |
|---|---|---|
| `0.1.1-rc.1` | ❌ | below the floor |
| `0.1.1-rc.2` | ❌ | below the floor |
| `0.1.2-alpha.2` | ✅ | **prerelease eligible (same tuple, prerelease comparator present)** |
| `0.1.2-alpha.1` | ✅ | *would* match — but was never published |

npm takes the **maximum** satisfying published version.

### 2.3 The answer: **the install does NOT fail**

> **`npm install` succeeds today, and installs `@deepseek-ai/dsh-llm@0.1.2-alpha.2`.**

This is the single most important correction to the intuition the task title invites. The declaration is *not* an install-breaker — it is a **silently-wrong baseline**.

The mechanism is one rule: **a range is a constraint, not a pin.** npm enumerates the published versions, filters them by `satisfies()`, and picks the maximum. **npm never requires the range's lower bound to itself exist.** `0.1.2-alpha.1` being phantom therefore has *no* effect on resolution — it is a comparison operand, not a fetch target. The only thing it does is exclude everything below `(0,1,2)-alpha.1`.

Corollary: if the plugin had declared the **exact pin** `"0.1.2-alpha.1"`, npm would hard-fail with `ETARGET` ("No matching version found for @deepseek-ai/dsh-llm@0.1.2-alpha.1"). The caret is what converts a hard failure into a silent substitution. **The caret is masking the phantom, not causing it.**

### 2.4 The real damage: a lying floor and an unbounded baseline

**(a) The manifest names a version you will never get.** The README promises "npm install gives you the type baseline", but the baseline you get is `0.1.2-alpha.2`, while the manifest claims `0.1.2-alpha.1`. Any reviewer reading `package.json` believes the plugin is built against alpha.1. It is not. The one-character difference (`alpha.1` vs `alpha.2`) is precisely the kind of typo that survives review, because a caret range *looks* like a normal, healthy declaration.

**(b) The "type baseline" is not a baseline — it is a moving target.** `^0.1.2-alpha.1` absorbs the **entire `0.1.x` line**:

```
absorbed:  0.1.2-alpha.2  0.1.2-alpha.3  0.1.2-beta.0  0.1.2-rc.1  0.1.2  0.1.3  0.1.9  0.1.99
excluded:  0.2.0-alpha.1  0.2.0  1.0.0   and anything < 0.1.2-alpha.1
```

The drift, projected forward over the published set:

| Fresh install at | `^0.1.2-alpha.1` resolves to |
|---|---|
| today | `0.1.2-alpha.2` |
| after `0.1.2` stable publishes | `0.1.2` |
| after `0.1.3` stable publishes | `0.1.3` |

So the type baseline a contributor gets **changes silently over time**, with no manifest change, no PR, and no review. This directly contradicts the README's promise. A *baseline* must be pinned; a range is an invitation.

**(c) The lockfile bakes in the substitution.** `npm install` will write a `package-lock.json` pinning `0.1.2-alpha.2` with an integrity hash. After that, `npm ci` reproduces exactly — but the lockfile now records that the *effective* baseline is alpha.2, while the *declared* baseline reads alpha.1. The two disagree in the repository, permanently and invisibly.

**(d) The whole thing rests on alpha.2 remaining published.** If `0.1.2-alpha.2` is ever unpublished, nothing at or above `0.1.2-alpha.1` and below `0.2.0` remains → `^0.1.2-alpha.1` becomes **`ETARGET` and the install hard-fails**. The declaration's "working" status is contingent on a version it never names.

### 2.5 When this cohort *does* hard-fail

Verified against the published set — these are the failure modes to guard against:

| Declared range | Result today |
|---|---|
| `^0.1.2-alpha.1` | ✅ resolves → `0.1.2-alpha.2` |
| `0.1.2-alpha.1` (exact) | ❌ **ETARGET → npm install FAILS** |
| `=0.1.2-alpha.1` | ❌ **ETARGET → npm install FAILS** |
| `^0.1.2` | ❌ **ETARGET → npm install FAILS** |
| `~0.1.2` | ❌ **ETARGET → npm install FAILS** |
| `>=0.1.2 <0.2.0` | ❌ **ETARGET → npm install FAILS** |
| `^0.1.2-alpha.1 <0.1.2-alpha.2` | ❌ **ETARGET → npm install FAILS** |

**The single most likely regression:** a maintainer "fixes" the manifest by dropping the phantom prerelease and writing the tidy `^0.1.2`. Because `0.1.2` stable does not exist and prereleases are excluded from a non-prerelease range by default, **that change turns a working install into a hard failure.** `^0.1.2` only becomes valid once a real `0.1.2` stable ships. This is a trap worth calling out in the PR text.

### 2.6 The trap in "just relax the range to also cover the older cohort"

The obvious-looking repair — `>=0.1.1-rc.2 <0.2.0` — is **worse than it looks**:

```
>=0.1.1-rc.2 <0.2.0   =>   resolves today to 0.1.1-rc.2   (NOT 0.1.2-alpha.2)
```

Why: the tuple `(0,1,2)` now has **no prerelease comparator** in the set, so `0.1.2-alpha.2` is excluded by the prerelease rule — even though `0.1.2-alpha.2 > 0.1.1-rc.2` and even though it is below the `<0.2.0` bound. The result is a **silent downgrade** to the rc cohort, which is the opposite of the apparent intent.

The fix for that is to *include a prerelease comparator on the 0.1.2 tuple*:

| Range | `0.1.2-alpha.2` eligible? | Resolves today to |
|---|---|---|
| `>=0.1.1-rc.2 <0.2.0` | ❌ excluded | `0.1.1-rc.2` |
| `>=0.1.2-alpha.2 <0.1.3-0` | ✅ eligible | `0.1.2-alpha.2` |
| `>=0.1.1-rc.2 <0.1.2-alpha.3` | ✅ eligible | `0.1.2-alpha.2` |

This is the semver trap that makes cohort-spanning ranges behave in non-obvious ways, and it is the reason §3 recommends **caret ranges or exact pins over hand-rolled comparator sets** wherever possible.

### 2.7 Summary table

| Question | Answer |
|---|---|
| Will `npm install` fail today? | **No.** |
| Which version is actually installed? | **`0.1.2-alpha.2`** (max satisfying published version) |
| Why doesn't the phantom floor matter? | A range is a constraint, not a pin; npm never requires the lower bound to exist. |
| Is the installed version the one declared? | **No** — declared alpha.1, installed alpha.2. |
| Is the baseline stable over time? | **No** — the whole `0.1.x` line is absorbed; it drifts as 0.1.x releases. |
| Is the range's floor version real? | **No** — `0.1.2-alpha.1` was never published. |
| What is the actual defect class? | **Silent substitution / lying manifest**, not install breakage. |
| When does it hard-fail? | Exact pin; `^0.1.2` / `~0.1.2` (no stable exists); if alpha.2 is later unpublished. |
| Does the README promise hold? | **No.** "npm install gives you the type baseline" is false as written. |

---

## 3. Part 2 — The installation & type-baseline plan

### 3.0 Step zero (blocking): determine which cohort the code actually targets

Every path below depends on one fact the fixture cannot supply: **was this plugin written against the `0.1.1-rc.x` API surface or the `0.1.2-alpha.x` surface?** The fixture has no source, no `tsconfig.json`, no `.d.ts`, no lockfile — so this is **unconfirmed** (§5) and must be settled by the maintainer.

Cheapest ways to settle it, in order of cost:

1. The maintainer's local npm cache — if they ever had alpha.1, the tarball or its `.d.ts` may still be in `~/.npm/_cacache`. (Unconfirmed whether it still exists.)
2. The plugin's own CI history — the last green typecheck ran against *some* resolved version; the corresponding lockfile or CI log names it.
3. Git history of the manifest — the commit that introduced `^0.1.2-alpha.1` may show intent, and the commit before it may show which cohort the code was written against.
4. Inspect the public API surface of the three candidates and see which one the plugin's usage matches (needs the packages, i.e. network).

Once settled, pick a path. **Paths A and B are the two real options; C–F are fallbacks and mitigations.**

---

### 3.1 Path A — Repin to the published alpha *(recommended if the code targets 0.1.2-alpha)*

| Variant | Manifest value | Resolves today | Tradeoff |
|---|---|---|---|
| **A1** | `"0.1.2-alpha.2"` | `0.1.2-alpha.2` | **Exact pin.** Maximum reproducibility; the type baseline is genuinely a baseline. Manual bump on every upstream alpha; if alpha.2 is unpublished → ETARGET (same exposure as any pin). |
| **A2** | `"^0.1.2-alpha.2"` | `0.1.2-alpha.2` | Fixes the phantom floor, but **changes nothing about what you get** — A1 and A2 resolve identically today, and A2 still drifts across all of `0.1.x`. Hygiene fix, *not* a baseline-stability fix. |
| **A3** | `">=0.1.2-alpha.2 <0.1.3-0"` | `0.1.2-alpha.2` | Keeps prerelease eligibility while capping at the next minor. Still absorbs `0.1.2` stable when it ships (verified: in-window). Caps at minor granularity only. |

**Recommendation: A1 + a committed lockfile.** For a *type baseline* — a reference point the plugin's types are verified against — an exact pin plus a lockfile is the only combination that makes the README's promise true. A2 alone leaves the actual defect (unbounded drift) in place while merely making the manifest look honest.

**Exit paths from A1:**
- `0.1.2` stable publishes → you *choose* to bump (or not). A1 does not move under you; the trigger is a release note, not a silent re-resolve.
- alpha.2 is unpublished → §3.4 (vendor) or fall back to Path B.
- A newer alpha supersedes alpha.2 → deliberate bump + typecheck; changelog-gated.

---

### 3.2 Path B — Stay on the rc cohort *(recommended if the code targets 0.1.1-rc)*

| Variant | Manifest value | Resolves today | Tradeoff |
|---|---|---|---|
| **B1** | `"0.1.1-rc.2"` | `0.1.1-rc.2` | Exact pin. Survives alpha.2's removal (it is below the phantom floor, hence always resolvable while published). Oldest API surface. |
| **B2** | `"^0.1.1-rc.2"` | `0.1.1-rc.2` | **Beware:** also identical to `^0.1.1-rc.1`. It will drift forward to `0.1.2`/`0.1.3` when those publish. Use B1 if you want stability. |

**Note the resilience asymmetry:** the `0.1.1-rc.x` cohort sits *below* the phantom floor, so it remains reachable no matter what happens to the `0.1.2-alpha.x` cohort. If you need a fallback that cannot be broken by upstream unpublishing alpha.2, this is it.

**Exit paths from B1:** rc.2 unpublished → B1 becomes ETARGET; move to Path D, or repin to `0.1.1-rc.1` if still published.

---

### 3.3 Path C — Tolerate either cohort

- `"^0.1.1-rc.1 || ^0.1.2-alpha.2"` → resolves today to `0.1.2-alpha.2`.
- `"0.1.1-rc.2 || 0.1.2-alpha.2"` (exact union) → resolves today to `0.1.2-alpha.2`.

**Pros:** survives the unpublishing of *either* candidate — genuinely more robust against upstream churn.
**Cons:** obscures which baseline is in effect (a reader cannot tell what the plugin targets); the union's drift surface is the union of both ranges, i.e. all of `0.1.x`; npm's resolution silently picks the higher branch, so the "tolerated" old branch may never actually be exercised, and a broken old branch goes unnoticed. **Use only if upstream churn is expected to be frequent**, and pair it with a lockfile.

---

### 3.4 Path D — Remove the registry from the type baseline entirely

Vendor the type surface into the repo:

- Commit the published `.d.ts` (or the package tarball) under e.g. `vendor/` and point the dependency at it via `"file:./vendor/dsh-llm"`; or
- Use a workspace/`link:` dependency if the DSH source tree is checked out locally.

**Pros:** total reproducibility; **immune to upstream unpublishing** — which is the failure mode that makes the current declaration fragile; works offline and air-gapped; the type baseline becomes an explicit, reviewable artifact in the repository.
**Cons:** manual refresh burden; must be re-vendored on every upstream release; license/provenance check needed; you stop receiving upstream type fixes automatically; a vendored tarball adds bytes to the repo.
**Best used as:** the escape hatch when the chosen pin starts failing, or for a CI image that must build reproducibly.

---

### 3.5 Path E — Lockfile-only mitigation *(not a fix)*

Keep the manifest roughly as-is, commit a `package-lock.json` pinning the resolved version + integrity, and use `npm ci` everywhere.

**Pros:** zero drift for anyone who honours the lock; no manifest churn; freezes today's behaviour immediately.
**Cons:** the manifest still lies (`alpha.1`, unpublished) — the next person to regenerate the lockfile re-derives the substitution; a contributor running plain `npm install` without the lock (or with a stale one) still gets the registry's current answer, not the baseline; a lockfile is not a *declaration* of intent, and it silently rots.

**Verdict:** a legitimate *interim* mitigation to stabilise CI today, but it defers rather than removes the defect. Prefer A1/B1 plus this.

---

### 3.6 Path F — Fix upstream *(root cause; not owned by this repo)*

If `0.1.2-alpha.1` was a real version that was unpublished, ask upstream to republish it, or to document the intended floor. Alternatively, if it was a typo for `alpha.2`, upstream publishing a genuine `0.1.2-alpha.1` would make the *existing* manifest truthful and require no local change at all.

**Pros:** makes the current manifest correct; zero local churn; fixes the root cause for every consumer.
**Cons:** outside this repository's control; timing unknown; the plugin should not block on it.
**Use as:** an upstream issue filed in parallel with A1/B1 — not as the plan itself.

---

### 3.7 Type-baseline hardening — making the README's promise true

Whichever path is chosen, the README claim *"npm install gives you the type baseline"* should be made **literally true**. Concretely:

1. **Pin the baseline.** Exact pin (A1/B1) + committed `package-lock.json` (lockfileVersion 3). A baseline is a *reference point*; only a pin is one.
2. **Distinguish "install" from "baseline" in the README.** Replace the sentence with, e.g.: *"The type baseline is `@deepseek-ai/dsh-llm@0.1.2-alpha.2`, pinned exactly. Use `npm ci` to reproduce it; plain `npm install` may resolve a different version."* — the current wording is the direct cause of the confusion in §2.4(a).
3. **Add a typecheck gate.** A `typecheck` script (e.g. `tsc --noEmit`) run in CI against the pinned baseline, so the baseline is a verified contract rather than a claim.
4. **Add a "does the declared range resolve?" CI guard**, so a phantom floor is caught at PR time by the author instead of by a user's install. A minimal guard is: resolve the range against the registry's version list and fail if no satisfying version exists (or, equivalently, run a lockfile-only install in CI and check the exit code). This guard is exactly what would have caught the current declaration. *(These guards require network and belong in CI — they were deliberately not run during this read-only analysis.)*
5. **Record the baseline in one place** (e.g. a `BASELINE.md` line or a `// type-baseline: …` note) so the manifest, the lockfile, the README and CI all agree and drift is visible in review.
6. **Re-check the dependency's role.** It is currently a `devDependency`. If the plugin publishes type declarations that reference `@deepseek-ai/dsh-llm`'s types, consumers will need it as a `peerDependency` (or a real `dependency`) — otherwise their typecheck breaks. Whether the plugin publishes such types is **unconfirmed** (§5).

---

### 3.8 Decision matrix

| Situation | Recommended path |
|---|---|
| Code targets `0.1.2-alpha.x`; upstream is stable | **A1** (`"0.1.2-alpha.2"`) + lockfile + typecheck gate |
| Code targets `0.1.1-rc.x` | **B1** (`"0.1.1-rc.2"`) + lockfile |
| Upstream churn expected; want resilience | **C** (exact union) + lockfile |
| The pin starts failing (unpublished) | **D** (vendor) as escape hatch; keep B1 ready as a registry fallback |
| Need CI reproducibility *today*, minimal change | **E** (lockfile) as an interim, then A1/B1 |
| Upstream will republish/clarify | **F** in parallel; don't block on it |
| Absolutely certain the baseline must never move | **A1/B1 + lockfile + CI guard** (lockfile alone is insufficient: plain `npm install` re-resolves) |

---

## 4. Exit paths & triggers

| Trigger | Consequence under the current declaration | Action |
|---|---|---|
| `0.1.2` stable publishes | `^0.1.2-alpha.1` silently resolves to `0.1.2`; type baseline changes under you; typecheck may break | If pinned (A1/B1): no change, deliberate decision. If ranged: re-run typecheck immediately and pin. |
| `0.1.3` stable publishes | Silently resolves to `0.1.3` | Same as above. |
| `0.2.0` publishes | `0.1.x` range stops tracking upstream; install stays on the last `0.1.x` — a *silent freeze*, not a break | Deliberate re-pin to the `0.2.x` line when the plugin is ready. |
| `0.1.2-alpha.2` is unpublished | **Nothing at/above `0.1.2-alpha.1` below `0.2.0` remains → ETARGET, hard install failure** | Path D (vendored baseline), or fall back to Path B (`0.1.1-rc.2`, below the floor, still resolvable). |
| A maintainer "tidies" the range to `^0.1.2` | **ETARGET — turns a working install into a hard failure** (no `0.1.2` stable exists; prereleases excluded from a non-prerelease range) | Reject that edit; use `^0.1.2-alpha.2` or wait for a real `0.1.2`. Call this out explicitly in review. |
| A maintainer widens to `>=0.1.1-rc.2 <0.2.0` | **Silent downgrade to `0.1.1-rc.2`** — `0.1.2-alpha.2` is excluded by the prerelease rule (§2.6) | Use `>=0.1.2-alpha.2 <0.1.3-0` or a caret instead. |
| A newer alpha (e.g. `0.1.2-alpha.3`) publishes | Ranged declarations silently absorb it | Pinned declarations hold; bump deliberately. |
| Consumer environment sets `include-prerelease=true` | The declared range additionally admits `0.1.3-alpha.1` (verified) — resolution outcome changes | Standardise on an explicit pin; the outcome no longer depends on ambient npm config. |
| `alpha.1` turns out to have been published and later unpublished | The manifest was once truthful; a published-then-removed version is a *different* incident from "never published" | Escalate to upstream (Path F); treat as a supply-chain signal, not just a typo. |

---

## 5. Unconfirmed

Everything below could **not** be verified from the brief and the fixture alone, and is deliberately not guessed.

**Registry / dependency facts**
1. **The complete published-version list.** The three versions in the brief were used as the complete set. If other versions exist (a `0.1.2-alpha.3`, a `0.1.2` stable, a `0.2.0-alpha.x`, a `0.0.x`, …), the "max satisfying" target changes. The published set was **not** queried — the authorization forbids an install, and no registry call was made.
2. **Whether `0.1.2-alpha.1` was never published, or published-then-unpublished.** The brief says "never published"; npm's unpublish policy makes a typo more plausible than a removal, but this is unverifiable here — and the two histories imply different fixes (§4, last row).
3. **Whether upstream intended alpha.2 to be alpha.1's successor**, i.e. whether `alpha.1` is a typo. Highly plausible given the one-character difference, but **unconfirmed**.
4. **The type surface / API differences** between `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.1` and `0.1.2-alpha.2` — whether alpha.2 changed any exported type, and whether the plugin's usage still compiles. Not available offline.
5. **`@deepseek-ai/dsh-llm`'s own `peerDependencies`** on other `@deepseek-ai/*` packages. If those are also in the unpublished cohort, the install has further failure modes. The fixture has no lockfile and no installed tree.
6. **Whether the plugin's published type declarations reference `@deepseek-ai/dsh-llm`'s types** — which would make the devDependency a consumer-facing problem (§3.7 item 6). The fixture manifest has no `types`/`exports`/`peerDependencies` field.

**Environment / tooling**
7. **The consumer's npm configuration** — `.npmrc`, registry mirror, `include-prerelease`, `legacy-peer-deps`, lockfile version policy. The fixture contains no `.npmrc`. With `include-prerelease=true` the declared range's outcome changes (§4).
8. **The exact npm error text and exit behaviour** for the failing cases. `ETARGET` / "No matching version found for @deepseek-ai/dsh-llm@0.1.2-alpha.1" is **derived** from semver resolution semantics and node-semver's behaviour, not observed — no install was run. The literal wording and exit code vary by npm version.
9. **The analysis toolchain** — node v24.14.1, npm 11.11.0 — is the analysis sandbox, not necessarily the maintainer's or CI's environment.

**Fixture / repository shape**
10. **Which cohort the plugin's code targets** — the single most decision-relevant unknown (§3.0). The fixture contains no `src/`, no `tsconfig.json`, no `.d.ts`, no `scripts`, no lockfile.
11. **Whether the real plugin manifest matches the fixture's.** The fixture is a reduced, purpose-built "S7-specific copy" (its README says so), so the absence of scripts/lockfile/peers here is **not** evidence about the upstream repository.
12. **Whether a lockfile exists in the real plugin repository** — Path E's practicality depends on this, and the fixture cannot show it.
13. **Whether the DSH host overrides or hoists `@deepseek-ai/dsh-llm`** in a consumer's dependency tree (which could change what a plugin actually links against). The host runtime was deliberately not probed per the task's scope rules.

---

## 6. Appendix — verification method

**Re-implemented functions** (offline, no dependencies): `parse`, `compare` (incl. prerelease precedence per semver §11), `caret` (= node-semver `replaceCaret`), `tilde` (= `replaceTilde`), `parseComparator`, `rangeSets`, `testSet` (incl. the prerelease-tuple eligibility rule), `rangeTest` (= `satisfies`, with an `includePrerelease` switch), `maxSatisfying` (= `maxSatisfying`).

**Self-test battery — 25/25 assertions, 0 failures.** Anchored to the semver.org spec table:

*Expansion:* `^1.2.3`→`>=1.2.3 <2.0.0-0` · `^0.2.3`→`>=0.2.3 <0.3.0-0` · `^0.0.3`→`>=0.0.3 <0.0.4-0` · `^0.1.2`→`>=0.1.2 <0.2.0-0` · `^0.1.2-alpha.1`→`>=0.1.2-alpha.1 <0.2.0-0` · `^0.1.2-alpha.2`→`>=0.1.2-alpha.2 <0.2.0-0` · `~1.2.3`→`>=1.2.3 <1.3.0-0` · `~0.1.2`→`>=0.1.2 <0.2.0-0` · `~0.0.3`→`>=0.0.3 <0.0.4-0` · `~0.1.2-alpha.1`→`>=0.1.2-alpha.1 <0.2.0-0`

*Satisfaction:* `1.2.3`✓/`2.0.0`✗/`1.2.3-alpha.1`✗/`1.2.4-alpha.1`✗/`1.3.0-beta.1`✗/`1.2.4`✓/`1.3.0`✓/`1.9.9`✓/`2.0.0-0`✗ vs `^1.2.3` · `0.1.2-alpha.2`✓/`0.1.1-rc.2`✗/`0.2.0`✗ vs `^0.1.2-alpha.1` · `0.1.2-alpha.2`✗/`0.1.2`✓/`0.1.3-alpha.1`✗/`0.1.3`✓ vs `^0.1.2`

**Scripts** (kept under `scratch/` for auditability; they read nothing outside the report directory and perform no network or install):

| File | Purpose |
|---|---|
| `scratch/semver-core.cjs` | The node-semver-compatible core implementation |
| `scratch/semver-battery.cjs` | Self-test battery + the §2/§3 resolution tables |
| `scratch/semver-table.cjs` | Per-range match matrices used for the §2.2/§2.4/§2.6 tables |
| `scratch/semver-check.js`, `scratch/semver-check2.cjs` | Earlier exploratory rounds (superseded by the above) |

**Fixture integrity:** hashes recomputed before and after the analysis; both match `fixture-seal.pre.json` and `fixture-seal.source.json`. No file under `fixture/` was created, modified, moved or deleted. No install, no build, no network call, no host-runtime introspection was performed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.