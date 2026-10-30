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

- **Task**: analyze, read-only, the consequence of `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` when `0.1.2-alpha.1` was never published, and propose an installation/type-baseline plan.
- **Mode**: fully read-only. No file under `/app/fixture/` was modified (sha256 verified before and after, see Appendix A). No install/build/network access was performed. Semver semantics were verified offline with the node-semver 7.8.1 library bundled with the container's npm (Appendix B).
- **Fixture contents (verified by listing)**: only `package.json` and `README.md`. **No lockfile** (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`), no `node_modules`.

---

## 1. Facts used

| # | Fact | Source | Status |
|---|------|--------|--------|
| F1 | Plugin manifest declares `@deepseek-ai/dsh-llm: "^0.1.2-alpha.1"` as its only devDependency; `"private": true` | `fixture/package.json` (read) | verified |
| F2 | README claims "npm install gives you the type baseline" | `fixture/README.md` (read) | verified |
| F3 | Published versions of `@deepseek-ai/dsh-llm`: 0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.2; **alpha.1 was never published** | task brief ("npm reality") | taken from brief; live registry not queried (network prohibited) — see §5 |
| F4 | Fixture has no lockfile | directory listing | verified |
| F5 | `^0.1.2-alpha.1` expands to `>=0.1.2-alpha.1 <0.2.0-0` | node-semver 7.8.1 `validRange()`, run locally | verified |
| F6 | Against F3's cohort: 0.1.1-rc.1 ✗, 0.1.1-rc.2 ✗, 0.1.2-alpha.2 ✓; highest satisfying = **0.1.2-alpha.2** | node-semver `satisfies()`/`maxSatisfying` logic, run locally | verified |

## 2. Core question: will install fail? Which version lands?

**No, the install will not fail. `npm install` succeeds and silently installs `0.1.2-alpha.2` — a different artifact from the one named in the manifest.** This is the central trap of this scenario: the intuitive expectation ("the declared version doesn't exist ⇒ ETARGET failure") is wrong, because of how caret ranges and prerelease matching work in node-semver (which npm, and npm-compatible resolvers, use):

1. **Caret expansion on a 0.x version (F5).** `^` allows changes that do not modify the left-most non-zero component. For `0.1.2-alpha.1` that component is the minor (`1`), so the range becomes `>=0.1.2-alpha.1 <0.2.0-0`. The range is a *window*, not a pin: it does **not** require the exact version `0.1.2-alpha.1` to exist.
2. **Prerelease candidate rule.** By default a prerelease version may satisfy a range only if some comparator in the range carries a prerelease tag on the *same* `[major, minor, patch]` tuple. The lower bound `>=0.1.2-alpha.1` has a prerelease on tuple `0.1.2`, so `0.1.2-*` prereleases are candidates. (This is also why a hypothetical future `0.1.3-alpha.1` would *not* match — verified, F6/Appendix B.)
3. **Selection.** npm picks the highest version satisfying the range among published versions:
   - `0.1.1-rc.1`, `0.1.1-rc.2`: fail the lower bound (`0.1.1 < 0.1.2`) ✗
   - `0.1.2-alpha.2`: same tuple as the prerelease comparator, and `alpha.2 > alpha.1` (numeric prerelease identifier compare), and `0.1.2-alpha.2 < 0.2.0-0` ✓ → **selected**.

Counterfactual (verified): had `0.1.2-alpha.2` not been published, the highest match would be `null` and npm would hard-fail with `ETARGET No matching version found for @deepseek-ai/dsh-llm@^0.1.2-alpha.1`. The install therefore succeeds **only by the coincidence that alpha.2 exists in the same prerelease cohort**. Also verified: even if alpha.1 *had* been published, a fresh resolve would still install alpha.2 (highest match) — the range never pinned alpha.1 in the first place.

## 3. Real consequences of the declaration

- **C1 · Silent type-baseline drift (the actual defect).** The README's promise is technically fulfilled — you *do* get a type baseline — but you get **alpha.2's** `.d.ts`, not the alpha.1 the manifest names and the author presumably developed against. Per the semver spec, prereleases carry **no stability guarantee** (anything may change between prereleases of the same version), so alpha.2's exported types may add/remove/rename symbols or change signatures relative to alpha.1. Consequences range from benign (identical surface) to `tsc` compile failures, to the worst case: compiles cleanly but semantics differ from what the code assumes. Whether alpha.2's type surface is compatible with this plugin's code is **unconfirmed** (package contents not inspectable here, network prohibited).
- **C2 · The declaration is misleading documentation.** `"^0.1.2-alpha.1"` names an artifact that never existed on npm. Anyone auditing the manifest, diffing against the registry, or trying `npm install @deepseek-ai/dsh-llm@0.1.2-alpha.1` (exact) gets a 404/ETARGET and will wrongly conclude the ecosystem is broken; meanwhile normal `npm install` hides the problem entirely.
- **C3 · Fragile success (time bomb).** The resolution depends on alpha.2 remaining published. npm's unpublish policy permits removing recent publishes; if `0.1.2-alpha.2` were ever unpublished (or the registry/mirror lost it), every fresh install of this plugin flips from "silently works" to hard `ETARGET` failure with no manifest change.
- **C4 · Non-reproducibility (F4: no lockfile).** Every fresh `npm install` re-resolves the range. Verified drift scenarios: a future `0.1.2-alpha.3`, `0.1.2-beta.1`, or any stable `0.1.2`–`0.1.x` (< 0.2.0) would **all** satisfy the range and become the new pick, silently changing the type baseline again at some later date. (Boundary cases verified: `0.1.3-alpha.1` ✗ tuple rule, `0.2.0` ✗ upper bound.)
- **C5 · Tooling variance.** npm behavior above is verified. pnpm and Yarn (v1/berry) resolve through node-semver-compatible semantics and are **expected** to produce the same pick (0.1.2-alpha.2); not executed here — **unconfirmed**. Deno/Bun/other resolvers: **unconfirmed**.
- **C6 · Lockfile edge case (not applicable to the fixture).** If a downstream copy of this project somehow carried a lockfile pinning `0.1.2-alpha.1`, `npm ci` would fail (lockfile references a version absent from the registry) while `npm install` would re-resolve to alpha.2 and rewrite the lock. The fixture has no lockfile (F4), so this is advisory only; a lock pinning alpha.1 could not have been produced from the real registry anyway (**unconfirmed** whether any such artifact exists elsewhere).

## 4. Plan: installation / type-baseline paths

The fixture is read-only for this task, so the following is a plan for the maintainer to execute in the real repository, not something performed here. Paths are ordered by recommendation; each has an explicit exit path to the next.

### Path A (recommended) — Re-pin to reality: exact `0.1.2-alpha.2` + lockfile
1. Change the manifest to an **exact pin**: `"devDependencies": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }`. In a prerelease cohort, ranges are the wrong tool: semver gives prereleases no stability promise, so every upgrade between prereleases should be a deliberate, reviewed manifest change.
2. Generate and **commit the lockfile** (in the real environment: `npm install --package-lock-only` then review `resolved`/`integrity`; or full `npm install`). This freezes the baseline and makes C4 drift impossible without an explicit lockfile change. Use `npm ci` in CI.
3. **Verify the type baseline**: run `tsc --noEmit` (or the plugin's typecheck script) against alpha.2. Diff the consumed `.d.ts` surface against what the code imports.
4. Fix any fallout: if alpha.2 changed types the plugin consumes, adapt the code (preferred — aligns with the direction of travel) or add a thin local compat/shim layer.
5. Update the README: replace "npm install gives you the type baseline" with the exact-version statement, e.g. "type baseline = `@deepseek-ai/dsh-llm@0.1.2-alpha.2` (exact pin; see lockfile)".
- **Tradeoffs**: smallest change; honest about what already installs today (npm picks alpha.2 anyway); fully reproducible. Cost: one code/typecheck pass if alpha.1→alpha.2 changed types.
- **Exit path**: if step 3 shows alpha.2's type surface is incompatible *and* the plugin genuinely requires alpha.1-only types that cannot be adapted cheaply → Path B (backfill alpha.1) or Path C (older/newer baseline).

### Path B — Registry backfill: publish the missing `0.1.2-alpha.1`
Only viable if the maintainer controls the `@deepseek-ai` npm scope **and** the original alpha.1 artifact (tarball + provenance) still exists.
1. Publish `0.1.2-alpha.1` (it was never published, so no version-collision/unpublish-policy obstacle).
2. Note (verified, §2): publishing alpha.1 does **not** change fresh resolution — `^0.1.2-alpha.1` still picks the highest match, alpha.2. To actually run on alpha.1 you must **exact-pin** `"0.1.2-alpha.1"` (plus lockfile, as in Path A steps 2–5).
- **Tradeoffs**: restores manifest truthfulness if alpha.1 is genuinely the intended baseline; but publishing into an already-consumed prerelease cohort is process-smelly — downstream users on alpha.2 get a *lower* version than they currently resolve, and it re-legitimizes pinning to an old prerelease instead of moving forward.
- **Exit path**: alpha.1 artifact unrecoverable, or scope not controlled, or review decides forward-migration is better → Path A (stay on alpha.2) or Path C.

### Path C — Move to a different published baseline
Two sub-options:
- **C1: fall back to `0.1.1-rc.2`** (exact pin) — the newest published version outside the 0.1.2 line. Tradeoff: it predates the 0.1.2 prerelease cohort; the manifest's choice of the 0.1.2 line suggests the plugin needs 0.1.2-era types, so rc.2 may lack required API/types (**unconfirmed** — cannot inspect package contents here). Expect code adaptation; largest regression surface of the three paths.
- **C2: wait for / drive a stable `0.1.2` release** of `@deepseek-ai/dsh-llm`, then pin `"0.1.2"` exactly (or `^0.1.2` once a stable baseline exists, with lockfile). Tradeoff: cleanest end state, but blocks on upstream release timing.
- **Exit path** (C1): rc.2 type surface too old to support the plugin → back to Path A (alpha.2) as interim, or C2. **Exit path** (C2): stable release not coming in acceptable time → Path A as the interim baseline.

### Path D — Process hardening (combine with whichever path is chosen)
- Commit lockfiles; use `npm ci` in CI so installs never silently re-resolve.
- Add a CI preflight that fails on unresolvable or never-published references (e.g., `npm view @deepseek-ai/dsh-llm versions --json` and assert the manifest's intended exact version is present) — this catches "declared version ≠ published reality" *before* users hit it.
- Lint rule/review checklist: no caret/tilde ranges on prerelease (`-`) versions; prerelease deps must be exact pins with an expiry note.
- Fix README wording everywhere it promises "npm install gives you the type baseline" without naming the exact version.

### Do-nothing baseline (for contrast)
Leaving the manifest as-is keeps installs working today (via alpha.2) but retains C1–C4: an unaudited baseline swap, a misleading manifest, unpublish fragility, and future silent drift. Not recommended; listed only to make the risk explicit.

## 5. Unconfirmed items (per brief §3)
- **U1** Live registry state, dist-tags, and unpublish history of `@deepseek-ai/dsh-llm` — network access prohibited; the published-version cohort (F3) is taken verbatim from the task brief.
- **U2** Actual `.d.ts` surface of `0.1.2-alpha.2` vs whatever alpha.1 would have had; hence whether the plugin's code type-checks against alpha.2 (C1 severity).
- **U3** Resolution behavior under pnpm/Yarn/Bun/Deno (expected identical to npm under node-semver semantics; not executed here) (C5).
- **U4** Whether any downstream copy of this project carries a lockfile referencing alpha.1 (C6); none exists in the fixture.
- **U5** Intent behind the alpha.1 declaration (typo for alpha.2 vs. reference to an internal/pre-registry build) — affects the Path A vs B choice.
- **U6** Whether the maintainer controls the `@deepseek-ai` scope and still possesses the alpha.1 artifact (Path B precondition).

## Appendix A — Fixture integrity (read-only discipline)
sha256 computed at analysis start and again after the report was written; both match `fixture-hash-before.json`:
- `package.json` → `73b215c4e9632a8a3d7b7b29bd659aaa42e0e799f3e3d64b666b8cb9f2be1b4e` ✔
- `README.md` → `b4a1f0ef2a1ce99d3e89b0c77d35fc2d55331b8eb10e41c35f7a4a172fa89ab9` ✔

## Appendix B — Offline semver verification (node-semver 7.8.1, npm-bundled, run in-container)
```
range: ^0.1.2-alpha.1  ->  >=0.1.2-alpha.1 <0.2.0-0
0.1.1-rc.1     satisfies: false
0.1.1-rc.2     satisfies: false
0.1.2-alpha.2  satisfies: true
max(published cohort)              = 0.1.2-alpha.2      <- what npm installs
max(cohort without alpha.2)        = null               <- would be ETARGET
max(cohort incl. hypothetical alpha.1) = 0.1.2-alpha.2  <- alpha.1 publish wouldn't change fresh resolve
future-drift: 0.1.2-alpha.3 ✓  0.1.2-beta.1 ✓  0.1.2 ✓  0.1.3 ✓  0.1.9 ✓  0.1.3-alpha.1 ✗ (tuple rule)  0.2.0 ✗  0.2.0-alpha.1 ✗
```
Verification script kept at `agent-output/tmp/semver-check2.cjs` (outside the fixture).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.