# JUDGE BRIEF · skill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/fixture-integrity-after.json

{
  "verifiedAt": "2026-10-20T08:20:44.859Z",
  "algorithm": "sha256",
  "expectedFrom": "fixture-hash-before.json",
  "files": {
    "package.json": "73b215c4e9632a8a3d7b7b29bd659aaa42e0e799f3e3d64b666b8cb9f2be1b4e",
    "README.md": "b4a1f0ef2a1ce99d3e89b0c77d35fc2d55331b8eb10e41c35f7a4a172fa89ab9"
  },
  "result": "match — fixture unchanged"
}


#### FILE: S7-unpublished-cohort/report.md

# S7 · Unpublished Cohort — Read-Only Installation / Type-Baseline Plan

Mode: **A · inspect (read-only)** per the `plugin-upgrade` skill. No file under `/app/fixture/` was modified, no install/build/fetch was executed, nothing outside `/app/agent-output/` was written. Registry facts are taken **as stated by the task brief** (network access was not used) and are marked unconfirmed where they cannot be verified locally.

---

## 1. Fixture inventory (as-is, read-only)

`/app/fixture/` contains exactly two files:

- `package.json`: name `dsh-cohort-bench`, version `0.1.0`, `"private": true`, and a single dependency declaration — `devDependencies: { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }`. **No lockfile, no peerDependencies, no dsh-plugin.json, no source files.**
- `README.md`: claims "npm install gives you the type baseline", and states the npm reality: `@deepseek-ai/*` has only `0.1.1-rc.1` / `0.1.1-rc.2` / `0.1.2-alpha.2` — **`0.1.2-alpha.1` was never published**.

Because the fixture is minimal, everything below about peers, lockfiles, package manager, and host cohorts is **conditional guidance** for the real plugin repository; the fixture itself does not exhibit those surfaces (marked where relevant).

## 2. Registry facts used

| Fact | Status |
|---|---|
| Published versions of the cohort: 0.1.1-rc.1, 0.1.1-rc.2, 0.1.2-alpha.2 only | **Given by the brief; unconfirmed** against the live registry (no network in this task). Matches the skill reference rollup-0.1.2.md **R-01** "npm reality (2026-08-31)" verbatim. |
| 0.1.2-alpha.1 never published | Given by the brief + R-01; **unconfirmed** live. |
| dist-tags (`latest` / `alpha` / `next`) for these packages | **Unconfirmed** — the brief does not state them. (R-01 carries a later note that alpha.3/alpha.4 were published under the `alpha` tag as of 2026-09-02; that update is reference material, not brief reality. It is treated below only as a contingency that makes the drift hazard worse, per the skill's "record both sources" discipline.) |
| Semver semantics of the caret range | **Verified locally** (see §3.5) with node-semver 7.8.1 bundled with the local npm — a read-only local tool, no network. |

## 3. Core analysis: what `^0.1.2-alpha.1` actually does

### 3.1 Caret expansion

For a `0.1.x` version the caret pins the left-most non-zero component (the minor), so:

```
^0.1.2-alpha.1  ≡  >=0.1.2-alpha.1 <0.2.0-0
```

(Verified: `new semver.Range('^0.1.2-alpha.1').range` → `>=0.1.2-alpha.1 <0.2.0-0`.)

### 3.2 Prerelease comparator rule

node-semver admits a prerelease version into a range **only if some comparator in the set carries a prerelease on the same `[major, minor, patch]` tuple**. Here the floor comparator `>=0.1.2-alpha.1` carries a prerelease on tuple `0.1.2`, so **other `0.1.2-alpha.X` prereleases (X ≥ 2) are admissible**. Prereleases on other tuples (e.g. `0.1.1-rc.*`, `0.1.3-alpha.1`) are not.

### 3.3 Per-version verdict against the brief's registry reality

| Published version | `>=0.1.2-alpha.1`? | `<0.2.0-0`? | Prerelease rule | Matches? |
|---|---|---|---|---|
| 0.1.1-rc.1 | No (0.1.1-rc.2 < 0.1.2-alpha.1 — verified `compare = -1`) | Yes | tuple 0.1.1 has no prerelease comparator | **No** |
| 0.1.1-rc.2 | No (same) | Yes | same | **No** |
| 0.1.2-alpha.2 | Yes (`compare(alpha.2, alpha.1) = 1`) | Yes | tuple 0.1.2 floor carries prerelease → admissible | **Yes** |

### 3.4 Conclusion — the install does NOT fail; it silently substitutes

- `npm install` **succeeds**. npm resolves the range to the highest matching published version: **`@deepseek-ai/dsh-llm@0.1.2-alpha.2`** (verified `maxSatisfying`). No ETARGET, no E404, no warning about alpha.1 — the never-published floor version is invisible in the outcome.
- The real consequence is therefore **not a broken install but a silent baseline drift**: the README promises "npm install gives you the type baseline" (i.e. the alpha.1 baseline the declaration names), but what actually lands is the **alpha.2** type surface. Anyone diffing against alpha.1 expectations is comparing against a version that never existed on npm.
- Contrast: had the declaration been the **exact pin** `0.1.2-alpha.1`, the install would fail loudly (no matching version — verified `maxSatisfying(published, '0.1.2-alpha.1') = null`; npm would report ETARGET). The caret range is precisely what masks the unpublished version: a caret with a prerelease floor means "alpha.1 **or anything newer up to 0.2.0**", not "exactly alpha.1".

### 3.5 Local verification record

Run read-only with the node-semver (v7.8.1) bundled with the machine's npm — the same resolver npm itself uses; no network, no install:

```
range expand:                       >=0.1.2-alpha.1 <0.2.0-0
satisfies 0.1.1-rc.1 / 0.1.1-rc.2:  false / false
satisfies 0.1.2-alpha.2:            true
maxSatisfying(brief reality):       0.1.2-alpha.2
maxSatisfying(+alpha.3/alpha.4):    0.1.2-alpha.4      (contingency, see 3.6)
maxSatisfying(+0.1.2 final):        0.1.2
maxSatisfying(+0.1.3-alpha.1):      0.1.2-alpha.2      (other-tuple prerelease NOT admitted)
maxSatisfying(+0.1.3 final):        0.1.3
satisfies 0.2.0:                    false
peer-floor probe: 0.1.2-alpha.2 vs ^0.1.0-rc.8 -> false (R-08 pitfall #3)
```

### 3.6 Forward-drift hazard (the range is a moving target)

The fixture has **no lockfile**, so every fresh install re-resolves. The verified consequence: as soon as anything newer in the `0.1.2` tuple (alpha.3, alpha.4, rc, final) or any **stable** `0.1.x > 0.1.2` is published, the same declaration silently floats up to it (e.g. to `0.1.2-alpha.4` per the R-01 update contingency, or to a future `0.1.3` stable). Two machines installing a week apart can get different type baselines from one "pinned-looking" declaration. Only `0.2.0` and other-tuple prereleases (e.g. `0.1.3-alpha.1`) are excluded by the range as written.

### 3.7 Type-surface consequences on the rc.2 → alpha.1 → alpha.2 corridor

If the plugin's code was written against an **alpha.1** baseline (per the declaration's intent), the actually-installed **alpha.2** differs on `@deepseek-ai/dsh-llm` itself. From the skill's curated cards and the R-11 export-drift ledger (IDs + gist only, per report discipline):

- **rc.2 → alpha.1 edge** (cards `DSH-0.1.2-A1`, file v0.1.2-alpha.1.md, 28 cards, reviewed):
  - **DSH-0.1.2-A1-22** — `isTokenDelta` no longer exported from `@deepseek-ai/dsh-llm/message`.
  - R-11 ledger row — `CallId` (dsh-llm, rc.2 `src/brand.ts:31`) becomes branded **`ToolCallId`** at the root export.
  - **DSH-0.1.2-A1-24** — `dsh-llm-pi-ai` bumps `@earendil-works/pi-ai` `^0.82.1` → `^0.84.2`; a plugin depending on pi-ai directly gets a second instance on an alpha host.
- **alpha.1 → alpha.2 edge** (cards `DSH-0.1.2-A2`, file v0.1.2-alpha.2.md, 8 cards, reviewed; ledger api-migration-0.1.2-alpha.2.md):
  - R-11 ledger rows — **`deepFreeze` / `assertNever` leave `dsh-llm`** for the new package `@deepseek-ai/dsh-util-values` (must be declared as a direct dependency, see **DSH-0.1.2-A2-03**); **`LlmModelDiscoveryError`** (code `model-discovery-failed`) is replaced by `RemoteError<'llm/model-discovery-rejected'>` (alpha.2 `src/types.ts:261`) — see **DSH-0.1.2-A2-02** / ledger **API-02** (RemoteResult / RemoteError boundaries).
  - **DSH-0.1.2-A2-01** — `SessionEvent.ignorable` restored (an alpha.1-only adaptation must not be "deleted then re-added": fold the corridor into its net state before editing source).

Practical meaning: an install that is **green** can still be followed by **bulk TS2305/TS2614 typecheck failures** (R-11 "static drift") the moment code written for alpha.1 (or rc.2) imports any of the moved/removed `dsh-llm` exports — and, conversely, code compiled happily against the substituted alpha.2 is **not** the alpha.1 baseline the README advertises. Runtime does not necessarily break in sync with the type surface (R-11), so typecheck alone is not proof of wire compatibility (validation layer 2 note in rollup-0.1.2.md).

### 3.8 Cohort-coherence risks (conditional — surfaces absent from the fixture)

- **Peer floors (R-08 pitfall #3)**: if the real plugin also declares DSH **peerDependencies** with an old-style prerelease floor such as `^0.1.0-rc.8`, that range does **not** match `0.1.2-alpha.2` (verified locally: `false`) — npm/pnpm emit peer warnings or refuse, regardless of actual host compatibility. Remedy per R-08: rewrite the floor explicitly to the target cohort (`^0.1.2-alpha.2`) when bumping.
- **Cohort mixing**: `dsh-llm@0.1.2-alpha.2` must be coherent with the rest of the installed `@deepseek-ai/*` cohort and the running host; "a successful install with mixed old/new peers is not a migration" (SKILL.md Mode C step 5). If the plugin must also run on rc.2 hosts, the cross-cohort recipe is **R-02** (one artifact + runtime cohort-surface probes; type imports stay erased).
- **Install-channel pitfalls (R-08 #1/#2)**: third-party mirrors lag fresh `@deepseek-ai/*` publications (E404/ETARGET), and pnpm 11's default `minimumReleaseAge` (24 h supply-chain rule) refuses day-one alpha installs — both conditional on the maintainer's channel/package manager, **unconfirmed** for this fixture (no lockfile → manager unknown; README says npm).

## 4. Installation / type-baseline plan — paths, tradeoffs, exit paths

All paths assume the maintainer first **re-queries the live registry** (`npm view @deepseek-ai/dsh-llm versions --json` and `npm view @deepseek-ai/dsh-llm dist-tags`) — the brief's three-version reality is authoritative for this report but unconfirmed live, and R-01 itself says "for the alpha.2 target, query the registry first".

### Path A (recommended) — adopt the published alpha.2 as the real baseline

1. Rewrite the declaration from `^0.1.2-alpha.1` to an **exact pin** `0.1.2-alpha.2` (devDependencies), and commit a lockfile. Exact, not `^0.1.2-alpha.2`: the caret would keep the forward-drift of §3.6 (it admits alpha.3+ and every stable <0.2.0 — verified).
2. Fix the README claim to say which version the baseline actually is ("npm install gives you the **0.1.2-alpha.2** type baseline"); the alpha.1 baseline the current text implies cannot come from npm at all.
3. Align code/typecheck with the alpha.1→alpha.2 ledger rows in §3.7 (`deepFreeze`/`assertNever` → `dsh-util-values`, `LlmModelDiscoveryError` → `RemoteError<'llm/model-discovery-rejected'>`, plus anything the rc.2→alpha.1 edge touched if the code predates alpha.1). Fold the corridor to its **net state** first (do not delete-then-restore `ignorable`-style fields).
4. If peer floors exist in the real repo, rewrite them to the alpha.2 cohort per R-08; the disappearance of the install-time peer warning is the landed signal.
- **Tradeoffs**: cheapest and fully registry-resolvable; but you adopt alpha.2 semantics — anything that genuinely depended on alpha.1-only behavior must be checked against the two card sets (A1: 28 cards, A2: 8 cards). Exact-pinning loses automatic patch pickup inside the cohort (acceptable — and desirable — for a type baseline).
- **Exit path**: if the registry has moved on (R-01 update: alpha.3/alpha.4 under the `alpha` tag, or a later rc/final), re-run the choice against the newest published cohort member — or, once the intended final release ships, repin to it and delete any temporary overrides.

### Path B — verify-only, no install (keep rc.2 as the install baseline)

Per R-01's "Verify-only, no install" recipe (dsh-TUI #622/#647 pattern): keep the installed baseline at the published **0.1.1-rc.2**; in CI, check out the upstream tag `dsh-v0.1.2-alpha.1` (or alpha.2) and run `tsc --noEmit` with `paths` mapping from a `tsconfig.base.json` pointing at the source tree. This proves the **type surface** of the unpublished cohort without installing it; runtime is verified separately on a real host.
- **Tradeoffs**: zero dependency on npm for alpha.1; honest about "alpha.1 was never published"; but it is type-only proof, needs GitHub tag access in CI, and the local install no longer matches what is typechecked (document that explicitly).
- **Exit path**: when the target cohort ships on npm, drop the paths-mapping lane and repin to the registry version (Path A step 1).
- **Not executable inside this task** (the brief forbids building any environment); it is a plan for the maintainer's repo/CI.

### Path C — build the unpublished cohort from the official tag (tarball overrides)

Per R-01's main recipe: clone `deepseek-harness`, `git checkout dsh-v0.1.2-alpha.1`, `pnpm install && pnpm run build`, `pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1`, then pin via `overrides` to the `file:` tarballs.
- **Tradeoffs**: the only way to get **actual alpha.1 artifacts**; but it drags in R-04 CI coupling (frozen-lockfile records machine-dependent absolute paths → needs a tarball-store materialization script + actions cache; add an `NPM_PUBLISH_ENABLED` gate so a publish cannot ship a version whose `@deepseek-ai/*` ranges are unresolvable from the registry — irreversible for that version; publish own prerelease adaptations under the `alpha` dist-tag, keeping `latest` for the stable-host line). The R-01 pnpm version pin (`packageManager: pnpm@11.24.0`; 11.9.0 allegedly bypasses file:-tarball overrides) is a **single field report — unconfirmed**; run a minimal reproduction before adopting.
- **Exit path**: built into the recipe — once the cohort (or the final release) ships officially, **delete the overrides section** and return to plain registry resolution.

### Path D — dual-cohort coexistence (only if the plugin must run on rc.2 hosts AND the alpha cohort)

Per R-02: one artifact + runtime resolution of the cohort surface — build-preset shim that resolves value imports via injected `require` with try/catch fallback between new and legacy specifiers; forward only the shared value surface (never re-export cohort-specific exports); take cohort-only services out of the hard `inject` list and probe them at the use site (cordis `remote` proxy throws for uninjected properties). Host-plane equivalent: `!!js` probes in `cordis.patch.yml` (host-plane-probes.md). Verification: link the same artifact to both hosts; cold boot + one full conversation round each.
- **Tradeoffs**: highest complexity, permanent until one cohort is dropped; rejected alternatives are documented in R-02 (per-consumer try/catch duplication, per-host artifacts, hard inject-wait).
- **Exit path**: when the old host population is gone, delete the shim and hard-pin the surviving cohort (Path A).

### What NOT to do

- Do not "fix" the manifest by exact-pinning `0.1.2-alpha.1` alone and calling it done — that converts a silent drift into a hard ETARGET install failure with no artifact available (verified unresolvable); it is only honest **combined with** Path B or C.
- Do not leave `^0.1.2-alpha.1` as-is with the current README: it is a moving target (§3.6) mislabeled as a fixed baseline.
- Do not widen to `>=0.1.2-alpha.1 <0.2.0`-style "equivalents" — same drift, more words.

## 5. Recommendation

**Path A now** (exact-pin `0.1.2-alpha.2` + lockfile + README correction + ledger-driven typecheck alignment), **with Path B's tag-source typecheck lane** kept in CI as the alpha.1-fidelity proof if any code truly depends on alpha.1 semantics; escalate to **Path C** only if actual alpha.1 artifacts are required; **Path D** only on evidence that rc.2 hosts must keep running the plugin. Order matters: re-query the registry first, then pin.

## 6. Validation plan (for the maintainer, after any path is executed)

Per the skill's layered checklist (rollup-0.1.2.md): layer 0 baseline first (run build/typecheck/tests in the repo's current dependency state and record the exemption list, R-06); then 1) dependency resolution — `pnpm list --depth 0 | grep @deepseek-ai` shows one coherent cohort, full-lockfile scan finds no stale cohort rows; 2) static — typecheck + build green without `@ts-ignore` (remember: all-green statics do not prove the wire contract); 3) card-level unit tests for hit touchpoints; 4) real cold boot + one message→tool→response round (or the keyless mount-smoke variant); 5) cross-cohort runs only if Path D applied. This report collects **no baseline** (Mode A read-only; nothing was run against the fixture, which is also marked "test material only — do not execute").

## 7. Unconfirmed items

1. Live registry contents and dist-tags for `@deepseek-ai/*` (brief's three-version reality taken as given; R-01's later alpha.3/alpha.4 update recorded as an unresolved divergence between brief and reference — both listed, neither silently picked).
2. Whether `0.1.2-alpha.1` exists as GitHub tag `dsh-v0.1.2-alpha.1` and what its `dsh-llm` exports actually contain (Paths B/C assume the tag exists per R-01/SKILL.md; not fetched here).
3. The real plugin's package manager, lockfile state, peerDependencies, host cohort, and source imports — the fixture contains none of these; all peer/CI/channel guidance is conditional.
4. R-01's pnpm pin sensitivity (`11.9.0` vs `11.24.0`) — single field report, not reproduced.
5. Whether the "type baseline" in the README is consumed at typecheck time only (devDependencies suggests yes) or also mirrored in runtime host expectations — affects whether Path D is needed.

## 8. Discipline & integrity record

- `/app/fixture/` untouched: sha256 re-computed after the analysis matches `fixture-hash-before.json` exactly — `package.json` `73b215c4…f2be1b4e`, `README.md` `b4a1f0ef…a89ab9`.
- No install, no build, no dependency fetch, no network query; the only executions were read-only local `node -e` evaluations using npm's bundled node-semver and file hashing.
- All writes confined to `/app/agent-output/S7-unpublished-cohort/`.

*Cited skill material (IDs/gist only): rollup-0.1.2.md R-01, R-02, R-04, R-06, R-08, R-11; v0.1.2-alpha.1.md (rc.2→alpha.1, 28 cards) DSH-0.1.2-A1-22/-24/-32; v0.1.2-alpha.2.md (alpha.1→alpha.2, 8 cards) DSH-0.1.2-A2-01/-02/-03; api-migration-0.1.2-alpha.2.md API-02/API-10; SKILL.md Mode A/C steps and layered validation.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.