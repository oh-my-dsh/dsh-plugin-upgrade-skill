# JUDGE BRIEF · skill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/S7-unpublished-cohort-install-plan.md

# S7 · Unpublished Cohort — Installation / Type-Baseline Plan (read-only report)

- **Task**: S7 · Unpublished Cohort Install Plan (read-only). Fixture: `fixture/` in this cell.
- **Mode**: **Mode A · inspect** per `plugin-upgrade` SKILL.md Step 0 — read-only investigation and report, then stop. No file under `fixture/` was modified; no install, no `npm view`, no network access, no build, no migration was executed.
- **Report file**: `agent-output/S7-unpublished-cohort/S7-unpublished-cohort-install-plan.md` (this file).
- **Date of analysis**: 2026-10-16 (container clock). Registry-state claims are anchored to the task brief and to the skill's own dated measurements (see §5).

---

## 0. Evidence inventory (what was actually read)

| Evidence | Content relevant to this task |
|---|---|
| `fixture/package.json` (6 lines) | `"devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }` (line 5). `"private": true` (line 4). **No** `dependencies`, **no** `peerDependencies`, **no** lockfile, **no** `engines`, **no** scripts. |
| `fixture/README.md` (3 lines) | Line 2: the README claim "npm install gives you the type baseline", plus the registry reality (`0.1.1-rc.1` / `0.1.1-rc.2` / `0.1.2-alpha.2` only; **alpha.1 was never published**). Line 3: test material only; fixture must stay unchanged. |
| `skills/plugin-upgrade/references/rollup-0.1.2.md` | **R-01** (target cohort not fully published; "npm reality (2026-08-31)" note naming exactly these three published versions), **R-02** (cross-cohort coexistence), **R-04** (CI/release coupling, lockfile with `file:` absolute paths), **R-06** (baseline attribution), **R-08** (three install-channel pitfalls: mirror lag, pnpm 11 supply-chain rules, **peer-floor prerelease semantics**), **R-11** (0.1.2 type-surface export drift ledger). |
| `skills/plugin-upgrade/references/v0.1.2-alpha.1.md` | 28 cards for the rc.2→alpha.1 edge; **DSH-0.1.2-A1-22** (`isTokenDelta` no longer exported from `@deepseek-ai/dsh-llm/message`), **DSH-0.1.2-A1-25** (line 436: "While the cohort is unpublished, point type dependencies at the official source checkout with `link:`, or use tarball `overrides` per R-01"). |
| `skills/plugin-upgrade/references/v0.1.2-alpha.2.md` | 8 cards for the alpha.1→alpha.2 edge; **DSH-0.1.2-A2-01** (`ignorable` restored — i.e. alpha.1 had removed it), **A2-03** (peer trimming + field notes), **A2-08** (new required `sessionProjections` inject/peer), **A2-10** (`settingsNamespace` removed). |
| `skills/plugin-upgrade/references/v0.1.1-rc.2.md`, `v0.1.1-rc.1.md` | The installable 0.1.1 line (3 + 9 cards). |
| `skills/plugin-upgrade/references/precision-checklist.md` | Peer-floor discipline ("every `@deepseek-ai/dsh-*` peer floor sits on the target cohort"), the citation contract ("Cite R-01 whenever the migration touches peer floors or the dependency cohort at all"), and the read-only-task landing rule ("the report is the deliverable — write it to the designated output path early"). |
| `skills/plugin-upgrade/references/v0.1.7-rc.1.md` (field note, lines 77–88) | First-hand measurement that the host checks peers with `semver.satisfies(runtime, range, { includePrerelease: true })` and semver `^7.8.5`; documents which ranges admit a prerelease under that flag. |
| `skills/plugin-upgrade/examples/04-dual-cohort-plugin.en.md` | The rc.2-baseline + unpublished-alpha.1 dual-cohort field record: reversible source overlay, "keep the release lockfile installable". |

**Fixture observation that shapes everything below**: the fixture has **no TypeScript source, no `tsconfig.json`, no build/test scripts, and no lockfile**. The "type baseline" exists only as a declaration; nothing in the fixture consumes or exercises it. See §4 for the consequences.

---

## 1. Requirement 1 — the real consequence of `^0.1.2-alpha.1`

### 1.1 Short answer

**Install will not fail.** Given the registry contents stated in the brief (`@deepseek-ai/dsh-llm` has only `0.1.1-rc.1`, `0.1.1-rc.2`, `0.1.2-alpha.2`), `npm install` resolves `^0.1.2-alpha.1` to **`0.1.2-alpha.2`** and succeeds. The never-published `alpha.1` is silently escalated to the published `alpha.2` by caret-on-a-prerelease semantics. The failure mode people expect (`ETARGET` / `E404` for the missing version) does not occur; the real risk is **silent version substitution and type-surface drift**, not a red install.

### 1.2 Desugaring the range

`^0.1.2-alpha.1` (caret, 0.x minor) desugars in node-semver to:

```
>=0.1.2-alpha.1  <0.2.0-0
```

### 1.3 The rule that decides everything (prerelease tuple gate)

node-semver's comparator-set test (`testSet`) applies a second gate after the comparators pass: a candidate **that carries a prerelease** satisfies the range only if **some comparator in the range also carries a prerelease with the same `[major, minor, patch]` tuple** (unless `includePrerelease` is set). This is exactly the mechanism the skill cites twice:

- **R-08 pitfall 3**: "when the peer floor is written as an old range like `^0.1.0-rc.8`, npm semver's prerelease matching rules (the comparator must share the same tuple and carry a prerelease) judge it **not to match** `0.1.2-alpha.2` — install-time peer warning/refusal, regardless of actual host compatibility."
- **v0.1.7-rc.1 field note**: the host's own peer check must call semver the way the host does — `semver.satisfies(runtime, range, { includePrerelease: true })` — and the admitted/refused columns only match the host with that flag. npm's *dependency* resolution does **not** set that flag; it uses the tuple-gated default rules.

### 1.4 Candidate-by-candidate verdict (computed, not guessed)

The table below was produced by an in-container re-implementation of node-semver's documented rules (comparator test + tuple gate; prerelease identifiers compared per spec: numeric < alphanumeric, shorter field set is lower, release > prerelease). This is pure arithmetic on the version strings — **no npm, no registry, no network, no filesystem** were touched.

| Candidate (published, per brief) | `>=0.1.2-alpha.1` | `<0.2.0-0` | tuple gate vs `0.1.2-alpha.1` | **npm (default rules)** |
|---|---|---|---|---|
| `0.1.1-rc.1` | fail (patch 1 < 2) | pass | tuple `(0,1,1)` ≠ `(0,1,2)` | **no match** |
| `0.1.1-rc.2` | fail (patch 1 < 2) | pass | tuple `(0,1,1)` ≠ `(0,1,2)` | **no match** |
| `0.1.2-alpha.2` | pass | pass | tuple `(0,1,2)` = `(0,1,2)`, `alpha.2` > `alpha.1` | **MATCH → installed** |

Resolution result: **max satisfying version = `0.1.2-alpha.2`**.

Illustrative drift exposure of the same range (hypothetical versions, to show the range is not a stable pin):

| Hypothetical | npm default rules | note |
|---|---|---|
| `0.1.2-alpha.1` | MATCH | the declared (never published) version |
| `0.1.2-alpha.3`, `0.1.2-beta.1` | MATCH | any later `0.1.2-*` prerelease substitutes silently |
| `0.1.2`, `0.1.3` (stable) | MATCH | non-prerelease candidates only need to pass the comparators — the range floats up to later stable minors |
| `0.1.5-rc.2` | no match | different prerelease tuple → excluded |
| `0.2.0-rc.1`, `0.2.0` | no match | upper bound `<0.2.0-0` |

Cross-check on the fallback range (for §2 Path B): `^0.1.1-rc.2` ≡ `>=0.1.1-rc.2 <0.2.0-0` matches **only `0.1.1-rc.2`** among the published set — it does **not** admit `0.1.2-alpha.2` (tuple `(0,1,1)` vs `(0,1,2)`). So `^0.1.1-rc.2` is a genuine cohort pin, not a floor that floats.

### 1.5 What actually happens on `npm install`

1. **No `ETARGET`, no `E404`.** A target error requires *no* published version to satisfy the range; here `0.1.2-alpha.2` does.
2. **`package.json` is unchanged** (the range stays `^0.1.2-alpha.1`); the **resolved `0.1.2-alpha.2` lands in `package-lock.json`**. Because the fixture ships no lockfile, the resolution is re-decided at every fresh install — reproducibility depends entirely on committing a lockfile afterwards (R-04's lockfile discipline).
3. **The README's claim is accidentally true but misleading.** "npm install gives you the type baseline" holds — but the baseline you receive is **alpha.2's type surface**, one edge past the declared alpha.1 and two edges past the newest installable 0.1.1 (`rc.2`). The declared version is a *phantom floor*: it can never be what you get, and what you do get changes as the registry changes (any later `0.1.2-*` prerelease or a stable `0.1.x ≥ 0.1.2` satisfies the same range).
4. **Real install-failure modes are elsewhere, not in the missing alpha.1** (R-08): a lagging third-party mirror reporting E404/ETARGET for the fresh `@deepseek-ai/*` publication; pnpm 11's `minimumReleaseAge` refusing a <24h-old package; or an old lockfile pinning versions that have vanished from the registry. With npm and the official registry, none of these apply to this declaration.

### 1.6 The type-baseline consequence (why a green install is not a green baseline)

If plugin code was written against the **rc.2-era** `@deepseek-ai/dsh-llm` surface, the silently-installed **alpha.2** surface breaks it — the R-11 ledger rows that touch this exact package:

| Symbol | Edge | Verdict on `0.1.2-alpha.2` |
|---|---|---|
| `CallId` from `@deepseek-ai/dsh-llm` | rc.2 → alpha.1 | removed → use `ToolCallId` (same package, root export, branded) |
| `isTokenDelta` from `@deepseek-ai/dsh-llm/message` | rc.2 → alpha.1 (DSH-0.1.2-A1-22) | no longer exported → narrow locally on the `StreamChunk` discriminator |
| `deepFreeze`, `assertNever` from `@deepseek-ai/dsh-llm` | alpha.1 → alpha.2 (R-11) | moved to `@deepseek-ai/dsh-util-values` |
| `LlmModelDiscoveryError` from `@deepseek-ai/dsh-llm` | alpha.1 → alpha.2 (R-11) | replaced by `RemoteError<'llm/model-discovery-rejected'>` (DSH-0.1.2-A2-02 error vocabulary) |

So the honest reading of the README claim: **install succeeds and hands you a coherent alpha.2 baseline; the "baseline" is not the declared alpha.1 and not the published rc.2 — it is whatever the registry's max-satisfying version is on install day.** Whether the plugin's own source compiles against it is **unconfirmed** (§4): the fixture contains no source, no `tsconfig.json`, and no typecheck script.

### 1.7 Secondary observations

- **Packaging shape**: `@deepseek-ai/dsh-llm` sits in `devDependencies` with `"private": true`. That is consistent with a *type-only* baseline (devDependencies are not passed to consumers — DSH-0.1.2-A2-03 field note). If any runtime import of the package exists in the real plugin (it cannot exist in this fixture — there is no source), the declaration must move to `dependencies`/`peerDependencies`; per precision-checklist, touching `ContentBlock`-family values requires `@deepseek-ai/dsh-llm` **in peers**.
- **No peer surface in the fixture**: there are no `peerDependencies`, so R-08 pitfall 3 / the v0.1.7-rc.1 host peer-enforcement matrix does not bite here. It *would* bite the moment the plugin declares a `@deepseek-ai/*` peer floor with this style — e.g. `^0.1.2-alpha.1` as a peer would be refused by an alpha.2+ host unless rewritten to the exact cohort value (R-08 recipe: "explicitly rewrite it to `^0.1.2-alpha.2`").
- **Dist-tags are irrelevant to this resolution**: an explicit version range resolves to the max satisfying version regardless of `latest`/`alpha`/`next` (R-01's note about sub-package `latest` sitting on old versions matters only for bare `npm install <pkg>`).

---

## 2. Requirement 2 — installation / type-baseline plan

Four paths, in the order I would try them. All commands are **proposals for the maintainer to run** — nothing was executed here (read-only task, no install permitted).

### Path A (recommended) · Declare reality: pin the published alpha.2

```json
{ "devDependencies": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" } }
```

Exact pin; `^0.1.2-alpha.2` is acceptable if you want later `0.1.2-*` prereleases to float (it admits them by the same tuple rule). Then:

1. `npm install` with the official registry explicitly: `export npm_config_registry=https://registry.npmjs.org` (R-08 pitfall 1 — mirrors lag fresh `@deepseek-ai/*` publications).
2. **Commit the lockfile**; from then on use only that package manager for this repo (SKILL.md Mode B step 1). The lockfile is what converts today's registry state into a reproducible baseline.
3. Treat the type surface as **alpha.2** and close the R-11 rows that touch `@deepseek-ai/dsh-llm` (§1.6) plus the neighbouring drift (`settingsNamespace` removal, DSH-0.1.2-A2-10, is the most commonly reported single break on this edge).
4. Verify per the rollup's layered checklist, layers 1–2 at minimum: dependency resolution (`npm ls --depth 0` / lockfile scan shows one coherent cohort, no mixture) and static (typecheck + build), against the R-06 baseline.

- **Tradeoffs**: minimal cost; removes the phantom floor; makes the declared baseline equal the installed baseline. Cost: you are now on a prerelease cohort whose final release was still pending confirmation in the skill's rollup — re-verify dist-tags before assuming stability.
- **Exit path**: when the `0.1.2` final ships (rollup "Pending confirmation" says it had not, as of the file's measurement date), re-pin to the final and re-run the ledger; no overrides to unwind.

### Path B · Stay on the installable 0.1.1 line (rc.2 baseline)

```json
{ "devDependencies": { "@deepseek-ai/dsh-llm": "0.1.1-rc.2" } }
```

(or `^0.1.1-rc.2`; verified in §1.4 to admit **only** `0.1.1-rc.2` among the published set — it does not float to alpha.2.)

- **Tradeoffs**: the only other installable cohort; matches the "published baseline supplied by the registry and lockfile" pattern the dual-cohort field record used (04-dual-cohort-plugin.en.md). But every 0.1.2 corridor change (28 alpha.1 cards + 8 alpha.2 cards + the rollup increments) becomes future work, and if the plugin must run on **both** cohorts you need R-02's dual-cohort artifact discipline (one artifact + runtime resolution; no per-cohort builds), which is significantly more engineering than Path A.
- **Exit path**: migrate to Path A later as a normal Mode C corridor migration with the R-06 baseline established first.

### Path C · You genuinely want alpha.1 (the declared version): build it from the tag (R-01)

alpha.1 was never published, so the only way to obtain it is from source:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /path/dsh-build   # isolated worktree
cd /path/dsh-build && git checkout dsh-v0.1.2-alpha.1
pnpm install && pnpm run build
mkdir -p ~/.dsh-cohorts/0.1.2-alpha.1
pnpm -r exec pnpm pack --pack-destination ~/.dsh-cohorts/0.1.2-alpha.1
```

then pin via `file:` tarball `overrides` (or `link:` type dependencies per DSH-0.1.2-A1-25's note). The declared range in the manifest may stay `^0.1.2-alpha.1`.

- **Tradeoffs**: you get exactly the declared semantics. But: heavy (full upstream build), the frozen lockfile records **machine-dependent absolute paths** so every CI runner needs a materialized tarball store (R-04), and alpha.1 itself is a *transient* state — it had removed `SessionEvent.ignorable` (DSH-0.1.2-A1-02), which alpha.2 restored (DSH-0.1.2-A2-01); targeting alpha.1 means inheriting a known-regressed edge. R-01's own warning applies: *do not describe every `0.1.2-alpha.*` as 404 wholesale* — alpha.2 **is** published; only alpha.1 (and, per R-01's 2026-09-02 update, alpha.3/alpha.4 at that date) were not. **Query the registry before building anything.**
- **Exit path**: delete the `overrides` section once the cohort ships on npm (R-01). For a *temporary* alpha.1 lane, prefer the **reversible source overlay** pattern from 04-dual-cohort-plugin.en.md (validate → record original registry links → link built outputs → verify → restore), which keeps the release lockfile installable and never leaves a half-linked mixed cohort.

### Path D · Verify the type surface without installing anything (dsh-TUI #622 lane, cited in R-01)

Keep the install baseline at rc.2 (or nothing at all) and prove the target's type surface with a `paths` mapping in `tsconfig` pointing at a source checkout of the target tag, running `tsc --noEmit`.

- **Tradeoffs**: zero dependency mutation — the right lane for a read-only/report-only context like this one, and for CI that must not depend on registry publication. It proves the **type** surface only; runtime must be verified separately (R-01: "runtime is verified separately"; dsh-TUI #647 kept this lane even after going npm on alpha.2).
- **Exit path**: switch to Path A when you are ready to make the cohort the real install baseline.

### Decision summary

| Path | What you get | Install risk | Type surface | Cost | Exit path |
|---|---|---|---|---|---|
| **A** pin `0.1.2-alpha.2` | published prerelease, reproducible w/ lockfile | lowest (official registry; mirror lag is the only trap, R-08) | alpha.2 (apply R-11 rows) | low | re-pin to the 0.1.2 final when it ships |
| **B** `0.1.1-rc.2` | published rc.2 baseline | lowest | rc.2 (0.1.2 work deferred) | low now, high later (28+8 cards + R-02 if dual-cohort) | migrate via Mode C with R-06 baseline |
| **C** build alpha.1 from tag | exactly the declared version | medium-high (source build, absolute-path lockfiles, R-04 CI) | alpha.1 (incl. the `ignorable` regression) | high | delete `overrides` / unwind overlay when npm ships the cohort |
| **D** `paths` + `tsc --noEmit` | type-surface proof, no install | none | whatever tag you point at | low | adopt Path A when ready |

**Cross-cutting for every path**: (1) record the R-06 baseline first — run build/typecheck/tests in the repository's own dependency state and keep the exemption list, so pre-existing failures are never attributed to this change; (2) cite **R-01** in the change record whenever the dependency cohort is touched (precision-checklist citation contract); (3) keep peer floors on the target cohort with exact values, no `-rc` leftovers; (4) validate layers 1–2 of the rollup checklist before claiming done.

---

## 3. Validation plan (what "done" would mean — none of it executed here)

1. **Dependency resolution**: `npm ls --depth 0` (or `pnpm list --depth 0 | grep @deepseek-ai`) shows exactly one coherent cohort, no mixture; the full lockfile is scanned for the old cohort, not just top-level rows (SKILL.md "Validation and reporting" §1).
2. **Static**: typecheck + build green **relative to the R-06 baseline** — new-zero failures, test list not shrunk.
3. **Declared == resolved**: `package.json` range and lockfile resolution agree, and the agreement is intentional (that is the whole point of Path A).
4. **Registry re-query before acting**: `npm view @deepseek-ai/dsh-llm versions --json` and `dist-tags` — the registry is a moving target (R-01's own note records alpha.3/alpha.4 appearing under `alpha` days after the 2026-08-31 measurement).

---

## 4. Unconfirmed (explicitly not verifiable in this read-only, no-network run)

1. **Actual npm resolution was not executed.** This container is read-only with no network and no install permission, so the "install succeeds, resolves `0.1.2-alpha.2`" conclusion is **derived** from node-semver's documented rules (re-implemented and computed in §1.4) plus the registry contents asserted by the brief. It is consistent with the skill's R-01 npm-reality note, but the end-to-end `npm install` behaviour is **unconfirmed by execution**.
2. **Whether `@deepseek-ai/dsh-llm@0.1.2-alpha.2`'s type surface compiles the plugin's source — unconfirmed/unverifiable from the fixture.** The fixture contains no source, no `tsconfig.json`, and no scripts (only `package.json` and `README.md`), so no typecheck can exist or be predicted here. The R-11 ledger (§1.6) is the best available proxy and is itself a curated, not complete, diff.
3. **alpha.1's exact type surface — unconfirmed.** Never published; only obtainable by building from tag `dsh-v0.1.2-alpha.1` (R-01), which was not done.
4. **Current registry contents — the brief is the authority for this task.** The skill's own dated notes show the registry moves (R-01: alpha.3/alpha.4 published under `alpha` as of 2026-09-02; rollup header: `next` = `0.1.2-rc.1`, `alpha` = `0.1.3-alpha.2` as of 2026-09-07). Re-query before acting on any path.
5. **0.1.2 final status — unconfirmed.** Rollup's "Pending confirmation" states the final release had not shipped at measurement time and that all entries must be re-reviewed after it does.
6. **npm/pnpm bundled-semver version — unconfirmed.** The tuple-gate behaviour used here has been stable across semver 7.x, and the host pins `^7.8.5` for its own checks (v0.1.7-rc.1 field note), but the exact semver bundled with the maintainer's npm/pnpm was not inspected.
7. **R-01's pnpm 11 override sensitivity and R-07's retry parameters** are single field reports, explicitly unreproduced (rollup "Pending confirmation"); treat them as leads, not facts.
8. **Runtime/boot consequences of any path — out of scope and unconfirmed** (no install, no profile, no cold boot was permitted or performed).

---

## 5. Citations

- `references/rollup-0.1.2.md`: **R-01** (unpublished-cohort installation; npm reality 2026-08-31; verify-only `tsc` lane), **R-02** (cross-cohort coexistence), **R-04** (CI/release coupling, lockfile absolute paths, dist-tag discipline), **R-06** (baseline attribution), **R-08** (mirror lag; pnpm 11 `minimumReleaseAge`; peer-floor prerelease semantics and the `^0.1.2-alpha.2` rewrite), **R-11** (type-surface export drift ledger), "Layered validation checklist", "Rollback", "Pending confirmation".
- `references/v0.1.2-alpha.1.md`: **DSH-0.1.2-A1-22** (`isTokenDelta`), **DSH-0.1.2-A1-25** (line 436, `link:`/`overrides` for unpublished cohorts).
- `references/v0.1.2-alpha.2.md`: **DSH-0.1.2-A2-01** (`ignorable` restored), **A2-03** (peer trim + field notes), **A2-08** (`sessionProjections` peer/inject), **A2-10** (`settingsNamespace` removal).
- `references/api-migration-0.1.2-alpha.2.md`: one-page conclusion, "Type export drift" row.
- `references/precision-checklist.md`: peer-floor discipline; citation contract; read-only-task landing rule.
- `references/v0.1.7-rc.1.md`: field note lines 77–88 (host peer check with `includePrerelease: true`, semver `^7.8.5`, admitted/refused matrix).
- `examples/04-dual-cohort-plugin.en.md`: rc.2-baseline + unpublished-alpha.1 dual-cohort record; reversible source overlay; "keep the release lockfile installable".
- `SKILL.md`: Step 0 mode selection (Mode A), Mode B step 1 (single package manager per lockfile), "Validation and reporting" structure, safety boundaries.

## 6. Rollback / safety statement

- The fixture was **not modified** (no writes under `fixture/`; nothing installed, built, fetched, or migrated). This report is the only artifact produced, written under `agent-output/S7-unpublished-cohort/`.
- For whichever path the maintainer chooses: record `HEAD`, the current `package.json`, and the lockfile hash before any change; work in a dedicated branch/worktree; restore only the paths owned by that change (SKILL.md "Rollback"); never auto-stash/reset/clean.
- If the upgrade target ever turns out to be the currently running host, apply **R-12** (host-self safety boundary) before touching anything.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.