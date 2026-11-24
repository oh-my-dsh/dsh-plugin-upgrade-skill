# JUDGE BRIEF · skill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/installation-type-baseline-plan.md

# S7 — Installation and type-baseline plan

## Consequence of the existing declaration

The missing alpha.1 publication does **not** make `^0.1.2-alpha.1` unsatisfiable. This is a range, not an exact request for alpha.1. Under ordinary npm semver rules it expands to `>=0.1.2-alpha.1 <0.2.0-0`, with the additional prerelease eligibility rule: prereleases are admitted for the explicitly mentioned `0.1.2` major/minor/patch tuple. Thus alpha.2 is eligible and greater than alpha.1. Both `0.1.1-rc.1` and `0.1.1-rc.2` are below the lower bound.

Given the task's complete published-version set, a fresh normal npm resolution selects **@deepseek-ai/dsh-llm@0.1.2-alpha.2**. No prior alpha.1 publication is needed. An exact `0.1.2-alpha.1` request would have no registry match under these premises. The caret is also not restricted to alpha releases: future stable 0.1.x versions below 0.2.0 can qualify, and later prereleases of the 0.1.2 tuple can qualify. It does not automatically admit prereleases with different patch tuples.

Consequently, the README's statement that npm install gives “the type baseline” is ambiguous: it would give alpha.2's published declarations, not alpha.1's exact declarations. This is silent baseline movement, not proof of an inevitable install failure. Entire-install success is **unconfirmed**: transitive versions, peers, engines, install scripts, registry access and npm configuration were not supplied or executed. Production installs omitting devDependencies would not provide this development type dependency at all.

## Inspected evidence and limits

- `fixture/package.json`: private package `dsh-cohort-bench`, own version `0.1.0`; sole declared development dependency `@deepseek-ai/dsh-llm: ^0.1.2-alpha.1`.
- `fixture/README.md`: explicitly supplies the three-version registry universe and the absence of alpha.1. This is the task premise, not a live registry observation.
- The fixture contains only these two files. There is no lockfile, source, tsconfig, test/build script, installed dependency tree, manifest, profile composition, or fixture-local AGENTS/CLAUDE file to inspect.
- Read `skills/plugin-upgrade/SKILL.md` and `references/rollup-0.1.2.md`, particularly R-01, R-04 and R-11. Their later dated publication updates do not replace this task's supplied version universe. No linked external source was accessed.
- This is Mode A, read-only analysis. Source URL/SHA, branch and repository cleanliness, actual installation identity, current host and Node/npm versions are **unconfirmed**; no broader repository inspection was performed.

## Recommended path: explicitly adopt published alpha.2

Choose this when alpha.2 is the intended supported type target. In a later authorized implementation outside this unchanged fixture:

1. Record the original manifest/README, lockfile if one exists, dependency versions and host identity. Verify exact package metadata, engines, dependencies, peers, scripts and published declaration exports for alpha.2 before installing. Do not substitute a moving `alpha` or `latest` tag.
2. Pin `devDependencies["@deepseek-ai/dsh-llm"]` to exactly `0.1.2-alpha.2`. Inventory actual imports and declare other packages that own consumed declarations directly; keep the participating DSH cohort coherent. Do not guess additional dependencies from the package name alone.
3. Using npm, the illustrative future command is `npm install --save-dev --save-exact @deepseek-ai/dsh-llm@0.1.2-alpha.2`. Review dependency lifecycle scripts before any real install. Commit the reviewed `package-lock.json` with the manifest, and use `npm ci --include=dev` in subsequent CI. Pin/document compatible Node and npm versions. Exact top-level pinning plus the lockfile prevents accidental baseline drift; neither implies host compatibility.
4. Change the README to name alpha.2 explicitly and document the reproducible CI command. Typecheck real plugin sources against the actual packed declarations, then build and test. No such source or commands exist in this fixture, so current compile compatibility is **unconfirmed**.
5. Review the alpha.1→alpha.2 API delta rather than treating this as a types-only no-op. R-11 records `deepFreeze` and `assertNever` moving from `dsh-llm` to `dsh-util-values`, and `LlmModelDiscoveryError` being replaced by `RemoteError<'llm/model-discovery-rejected'>`. These are review candidates, not confirmed import hits here. Read the exact alpha.2 ledger/cards and validate the package exports before adapting source.
6. Scan the full lockfile and dependency graph for mixed cohorts and unexpected peers; a top-level version alone is insufficient. Later cold-start an isolated matching host, verify activation/services and execute a real plugin path before claiming runtime compatibility.

Tradeoff: simplest registry-backed reproducible route, but alpha.2 is a different contract. Exit if incompatible: restore only the recorded manifest, README and lockfile, and return to the recorded development dependency state. Do not claim recovery of arbitrary lifecycle-script side effects. No global host upgrade is needed merely to establish a type baseline.

## Alternative: retain published rc.2 and add an alpha.1 type-check lane

Choose this when runtime support must remain on rc.2 while alpha.1 compatibility needs investigation. Pin the ordinary development install to exact `0.1.1-rc.2`, lock it with npm, and clearly label it the rc.2 baseline. It does not satisfy the current caret range; changing that declaration is an intentional baseline change.

In separate CI work, obtain and verify the official `dsh-v0.1.2-alpha.1` tag and immutable commit, and use a dedicated tsconfig whose paths are derived from that checkout's `tsconfig.base.json`. Map all consumed DSH declaration owners/subpaths coherently and run the pinned TypeScript compiler with `--noEmit`; check resolution traces so imports do not accidentally fall back to rc.2 installed types. The exact paths, tag availability/SHA and compiler requirements are **unconfirmed** in this task. No checkout, reproduction environment or compilation was created here.

Tradeoff: retains a published runtime/install baseline while testing unpublished source types. Paths mapping changes compile-time resolution, not emitted module specifiers or runtime service activation; source types can also differ from packed declarations. It cannot establish alpha.1 runtime support. Keep rc.2 and alpha.1 type results separate. Exit by removing the dedicated mapping lane when a verified published target replaces it, then verify against that package's packed declarations.

## Alternative: exact alpha.1 source-built cohort

Use this only when alpha.1's exact contract is required. The missing package/version is `@deepseek-ai/dsh-llm@0.1.2-alpha.1`; the full needed transitive cohort is **unconfirmed**. The absence of this exact version justifies investigating source artifacts, but the existing caret declaration alone does not require this route.

Future procedure: verify the official alpha.1 tag and commit; inspect its package manager, lockfile, build instructions and lifecycle scripts; build in an isolated worktree with its pinned toolchain; pack the required packages, including transitive and peer declaration owners. Record names, versions, hashes and provenance. Consume the reviewed tarballs through explicit `file:` dependencies and appropriate package-manager overrides, with a lockfile. For npm, align direct dependency and override specifications to avoid direct-dependency override conflicts; do not copy pnpm-only syntax into npm. The upstream build may require pnpm while the plugin remains npm-managed: keep these projects and lockfiles separate.

Ensure every required unpublished cohort reference resolves locally, including tarball-internal dependencies. Never satisfy missing alpha.1 packages with an unnoticed mixture of rc.2/alpha.2. Materialize the artifacts at reproducible relative paths on every CI runner before frozen installation; do not commit a lockfile that assumes one developer's absolute cache path. Gate publishing: the fixture is private and must remain so, and consumer releases must not ship inaccessible local paths or unsatisfiable unpublished dependencies.

Tradeoff: highest fidelity to an unpublished contract, with substantial build, packaging and CI maintenance. R-01's pnpm version-sensitivity report is explicitly **unconfirmed** for this repository; it is not a reason to switch package managers or adopt an untested pin. Exit when an acceptable published cohort is available: deliberately select its exact version, remove local overrides, regenerate/review the lockfile, and rerun type/runtime validation. Alpha.2 availability does not make it identical to alpha.1.

## Completion, skipped work and residual risk

**Pre-existing:** baseline failures not collected (Mode A); there are no executable fixture scripts.

**Completed:** inspected both fixture files; distinguished exact publication from range resolution; provided three installation/type-baseline paths and their exit conditions. Only this report was written.

**Skipped:** installs, dependency resolution commands, builds, typechecks, tests, source checkout, network/registry queries, runtime/profile changes and publication, as required. No fixture modification occurred. No automatic migration, shim or API edit is justified without source evidence.

**Pending/unconfirmed:** registry metadata beyond the supplied premise, actual install outcome, transitive cohort closure, declaration compatibility, tag/build reproducibility, current host compatibility and runtime activation. These do not block the requested read-only plan; they block claims of verified install or runtime success.

**Rollback:** none required for the fixture because it was unchanged. For later implementation, restore only the explicitly recorded manifest/README/lockfile and any task-owned CI/tsconfig changes; preserve unrelated work. The plugin's own version remains 0.1.0 and must not be confused with the DSH cohort.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.