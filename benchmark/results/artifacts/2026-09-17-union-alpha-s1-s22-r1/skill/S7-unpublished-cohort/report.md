# S7 — Unpublished cohort installation/type-baseline plan

## Decision and scope

**The missing alpha.1 publication does not, by itself, make this range fail.** With the published-version set supplied by the brief, a fresh dependency resolution of `^0.1.2-alpha.1` selects **0.1.2-alpha.2**, not alpha.1. This is a silent type-baseline substitution, not proof of alpha.1 compatibility. Overall installation success remains unconfirmed: no install was run and transitive dependencies, peers, engine requirements, registry configuration, and lifecycle scripts were not verified.

Mode A: read-only inspection and planning. Only this report was written. No fixture modifications, dependency installs, builds, reproduction environments, publishing, or network calls were performed.

## Evidence and identity

Fixture root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S7-unpublished-cohort/environment/fixture

The complete fixture inventory contained two files:

- package.json: package name `dsh-cohort-bench`, plugin version `0.1.0`, `private: true`, and sole devDependency `@deepseek-ai/dsh-llm: ^0.1.2-alpha.1`. No scripts, package-manager declaration, or compatibility peers are present.
- README.md: claims npm install supplies the type baseline; states only 0.1.1-rc.1, 0.1.1-rc.2, and 0.1.2-alpha.2 are published and alpha.1 never was; labels the fixture test material not to execute or publish.

No source, lockfile, profile composition, installed dependency tree, or Git metadata inside the fixture was found. Source repository, source SHA, branch, containing-repository status/submodules, installed plugin identity, actual resolved dependency version, intended runtime host, and host/Node baseline were not collected or remain **unconfirmed**. The plugin's own version 0.1.0 is separate from its declared DSH dependency baseline 0.1.2-alpha.1.

Publication evidence is **supplied evidence**, not a live registry observation: the task brief and fixture README agree on the three-version snapshot. The explicitly requested skill's references/rollup-0.1.2.md, R-01, records the same historical snapshot. Later publication records in that reference do not replace this task's snapshot; live registry availability is **unconfirmed**.

Methodology read: E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/SKILL.md. On-demand references read: references/README.md, references/rollup-0.1.2.md, and references/v0.1.2-alpha.2.md beneath that skill directory. The alpha.1 card file was not read; no full rc.2-to-alpha.2 source migration is claimed.

An offline semver check used the already-installed semver library in the running DSH checkout. It did not access npm or install anything. Its library version was not recorded. This was local-tool verification, not a fixture-supplied registry or source observation. A mistaken read of references/scripts/README.md failed with file-not-found; no verifier script was loaded or run. No Git integrity comparison or before/after hash comparison was performed; fixture preservation is supported by issuing no fixture write operations, not by a claimed Git verification.

## 1. Caret and prerelease consequences

The offline semver calculation normalized the range to:

`>=0.1.2-alpha.1 <0.2.0-0`

Default npm semver prerelease eligibility applies in addition to numeric bounds: the prerelease comparator explicitly admits prereleases on the **same major/minor/patch tuple, 0.1.2**, that meet the lower bound. It does not admit arbitrary later prerelease tuples merely because they are numerically below 0.2.0.

| Candidate | Satisfies? | Explanation |
|---|---|---|
| 0.1.1-rc.1 | No | Below lower bound; different prerelease tuple |
| 0.1.1-rc.2 | No | Below lower bound; different prerelease tuple |
| 0.1.2-alpha.1 | Yes theoretically | Meets lower bound, but unpublished in supplied evidence |
| 0.1.2-alpha.2 | Yes | Later prerelease on the admitted 0.1.2 tuple |
| 0.1.2-rc.1 | Yes | Same tuple and later prerelease; hypothetical drift candidate |
| 0.1.3-alpha.2 | No | Different prerelease tuple; excluded by default prerelease matching, **not** by the numeric upper bound |

The measured maxSatisfying result over the three supplied published versions was **0.1.2-alpha.2**. Over that set plus hypothetical 0.1.2-rc.1, it was **0.1.2-rc.1**. Stable releases such as 0.1.2 and 0.1.3 would also satisfy the range if available; stable versions below 0.2.0 are allowed. Their availability was not checked.

Therefore, for a fresh ordinary registry resolution with devDependencies included and no lockfile or overrides, alpha.2 is the eligible target in this snapshot. An exact request for `0.1.2-alpha.1` would instead have no matching published version. A production install omitting devDependencies would not supply this type baseline at all. Lockfiles, overrides, npm settings, registry metadata, and full dependency graph failures can affect an actual install, so the result must not be presented as an executed install success.

A successful alpha.2 installation would still make the README misleading if readers expect alpha.1 declarations. Semver acceptance is not an API compatibility proof. The alpha.1-to-alpha.2 skill material records moved exports and changed dependency ownership; R-11 specifically records `deepFreeze` and `assertNever` moving from dsh-llm to dsh-util-values, and `LlmModelDiscoveryError` changing to the RemoteError vocabulary. These are reference-reported candidate risks, not verified source hits: no plugin imports are supplied. A2-03's declaration/peer ownership changes warrant inspecting direct declaration dependencies when a real source repository is available. Other cards must not trigger speculative edits to this two-file fixture.

## 2. Workable plans — proposed only, not executed

### A. Adopt the published alpha.2 baseline explicitly (recommended if exact alpha.1 is not required)

1. In a future authorized worktree, identify the package manager from the actual repository's lockfile/tooling. The fixture suggests npm in prose but contains no lockfile. Keep one manager; do not introduce pnpm merely because a reference example uses it.
2. Verify exact package/version metadata and the required transitive/peer cohort against the official registry when network access is authorized. Record resolved versions, integrity, source identity, engines, and lifecycle scripts before installing.
3. Propose `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"` as the exact devDependency and explicitly update the README to say alpha.2 is the chosen type baseline. For an npm repository, the future command would be `npm install --save-dev --save-exact @deepseek-ai/dsh-llm@0.1.2-alpha.2`; it was **not run**. Check peer requirements rather than suppressing them with legacy-peer-deps or force.
4. Commit the reviewed manifest and single manager's lockfile in the real maintenance workflow (no commit here). Reproduce using `npm ci` or the existing manager's frozen equivalent, with devDependencies included. Inspect all cohort edges and declaration owners, not only the top-level dsh-llm version.
5. Review the alpha.1-to-alpha.2 edge against actual imports. Run typecheck, build, tests, and separately runtime verification before claiming support. If declaration resolution becomes any, use one diagnostic typecheck with skipLibCheck false and explicitly declare consumed declaration owners.

Tradeoff: this intentionally changes the baseline; it does not establish alpha.1 compatibility. Exact pins plus a lockfile prevent accidental forward drift, but transitive cohort coherence still needs verification. Exit: review the next chosen version explicitly and update pins/lockfile/docs together. Do not replace the pin with latest or a broad range merely to stop maintenance.

### B. Preserve literal alpha.1 through exact-tag source artifacts

Only choose this if alpha.1 itself must be installed for development/runtime work. Future external work would verify the official `dsh-v0.1.2-alpha.1` tag and its commit, then use that checkout's documented Node/package-manager toolchain in an isolated location to install/build and pack the required packages. Tag availability, SHA, build commands, engines, and successful artifact production are **unconfirmed** here.

Materialize a coherent local cohort store: direct dependency tarballs and every necessary internal transitive/peer dependency must resolve from that same verified source. A dsh-llm tarball alone is insufficient if its internal references still demand unpublished packages. Inspect packed manifests, exports, declarations, and rewritten workspace references. Use manager-supported local file dependencies and scoped overrides for the full required closure; do not blindly override unrelated dependencies. For npm, avoid a direct-dependency/override spec mismatch (EOVERRIDE); verify the direct local spec and override rules for the pinned npm version. For pnpm, use its documented override configuration and existing lockfile.

Tradeoffs: builds and install scripts can have side effects; local paths and artifacts introduce maintenance and CI portability costs. Store or reproducibly materialize artifacts at deterministic paths before frozen installs, with checksums and a cache keyed by source commit, toolchain, and packaging configuration. Do not depend on a developer's absolute home directory. Reference R-01's pnpm-version-sensitive override observation is explicitly a single unconfirmed field report, not a reason to pin an arbitrary manager version here.

Exit: either deliberately transition to a verified published cohort (for example alpha.2), removing only the corresponding local overrides and regenerating/reviewing the lockfile, or retain the source lane for historical alpha.1 compatibility. Do not assume alpha.1 will eventually be published. Keep publish gates disabled while consumer-required dependencies or local paths are not publicly reproducible; the fixture is private and must never be published.

### C. Verify alpha.1 types without installing that cohort

Keep a separately named published installation baseline (for example exact rc.2, if supporting that host is actually intended), and add an isolated **type-only** CI lane against a verified alpha.1 tag/commit. Use the tag's own TypeScript paths/declaration mappings, including consumed declaration owners, to run no-emit checks of the real plugin source. Check compiler resolution so it does not silently fall back to rc.2 node_modules. Do not leak these paths into production bundling: TypeScript paths do not rewrite runtime module resolution.

This is the R-01 verify-only pattern, not a claim that rc.2 types equal alpha.1 types. No source checkout, mapping, typecheck, or lane was created in this task. Mapping details and toolchain feasibility are **unconfirmed** until that source is inspected.

Tradeoff: avoids requiring npm alpha.1 artifacts, but passing proves only the selected source type surface. Runtime/module activation and behavior remain independent checks against each supported host. Exit: retain the historical lane while promising alpha.1 support, or retire it explicitly when changing the support policy; move the install baseline to a reviewed published version separately.

## Validation and prevention

Before a real migration, record baseline failures in the original dependency state and preserve manifest, lockfile, configuration, source SHA, and resolved versions. Then validate dependency resolution across the complete lockfile, static behavior, and a separate isolated real-profile activation plus core plugin flow. For a Web plugin, verify the advertised artifact and actual registration/mount, not just HTTP 200. No applicable runtime face can be determined from this fixture.

Prevent silent baseline drift by checking both (a) that a declared range has a candidate and (b) that the **intended baseline version itself exists and is what the lockfile resolves**. A range-only resolvability gate would pass this fixture and miss the problem. Record the exact baseline in docs and CI; keep reproducible frozen installs and deliberate upgrade reviews. A published plugin's devDependencies do not install for consumers, so runtime support and required peers must be specified separately when actual source requirements are known. Do not infer or widen the plugin's host compatibility range from this lone devDependency.

If a future install fails, distinguish missing exact versions from mirror lag, peer conflicts, engine errors, transitive gaps, and package-manager supply-chain policy. Re-query authorized primary metadata before changing safeguards. Do not globally disable release-age protections, delete lockfiles, or weaken peers merely to make installation pass.

## Completed, skipped, pending, rollback

**Completed:** full task and skill read; full fixture inventory/content inspection; on-demand reference analysis; offline semver computation; installation/type-baseline options and this report. No successful install, build, typecheck, or runtime result is claimed.

**Pre-existing:** not collected (Mode A; fixture has no test/build scripts or source).

**Skipped:** migration implementation, baseline scripts, full seven-class source scan, tag fetching/building, registry queries, and runtime validation. These are prohibited here or lack the necessary source/profile inputs. No unrelated APIs or optional capabilities were adopted.

**Pending/unconfirmed:** current registry metadata, exact tag/SHA and artifacts, full transitive/peer graph, actual source import hits, package manager and compiler configuration, install/lifecycle behavior, platform compatibility, and runtime support. No clean Git-status or byte-hash equality verification was performed. The report's confident semver conclusion is conditional on the supplied publication snapshot, not a claim of a live npm experiment.

**Rollback:** no fixture rollback is needed because no fixture write was issued. Only the designated report was created/replaced. Before executing any future path, capture its owned manifest/lockfile/configuration baseline and restore only those paths if necessary; do not reset unrelated work or promise reversal of arbitrary lifecycle-script side effects.
