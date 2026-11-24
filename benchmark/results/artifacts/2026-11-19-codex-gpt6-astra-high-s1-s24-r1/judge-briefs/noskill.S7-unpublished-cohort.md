# JUDGE BRIEF · noskill.S7-unpublished-cohort

## Criteria (sealed rubric)
- [published-version-evidence] (25pt) Use package.json and the supplied README/brief to distinguish the @deepseek-ai/dsh-llm declaration from the published version list: alpha.1 was never published there, while alpha.2 was. Do not infer each internal package exists from the root package or a dist-tag. The brief already supplies the registry fact: credit using it with proposed package-specific verification; never require an actual online npm view in this closed-book task.
- [caret-resolution] (25pt) Explain why ^0.1.2-alpha.1 can select the supplied published 0.1.2-alpha.2: the missing lower-bound release does not make the range unresolvable. Identify the silent declaration/type-baseline mismatch and prerelease compatibility uncertainty. Do not claim all alpha versions are missing or that the caret guarantees alpha.1. No mandatory semver formula or keyword spelling.
- [workable-baseline-plan] (25pt) Give at least ONE complete feasible plan with its tradeoff: either deliberately target the published alpha.2 using an exact pin and acknowledge that this does not validate alpha.1; or obtain a verified exact upstream alpha.1 source ref, build/package the necessary cohort and resolve local tarballs explicitly. One coherent plan is sufficient for full credit. Bare npm ci, tarball or overrides words are not a plan; do not require guessing an unavailable tag or command.
- [reproducibility-and-exit] (25pt) Make the chosen plan reproducible with one consistent project package manager, a committed lockfile/frozen install or equivalent, and a proposed typecheck against the intended target. For temporary local overrides, explain when/how to replace them with verified equivalent published packages and remove the overrides; an exact published-pin plan can describe deliberate future upgrades instead. Mark unverified source/build/runtime details honestly. Do not require both npm and pnpm, switching package managers, or executing installs.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [install-unpublished-registry-version] ceiling=10 Trigger only for an affirmative prescription to install the exact unpublished @deepseek-ai cohort alpha.1 version from npm as if available. The declared caret range, local tarballs built from alpha.1 source, rejected BAD examples and explicitly forbidden exact-install commands do not trigger this cap.

## Candidate report(s)
#### FILE: S7-unpublished-cohort/installation-type-baseline-plan.md

# Installation and type-baseline plan

## 1. Actual consequence of the declaration

The missing `0.1.2-alpha.1` publication does **not** by itself make `npm install` fail. In npm semver, `^0.1.2-alpha.1` expands to `>=0.1.2-alpha.1 <0.1.3-0`, subject to prerelease eligibility rules. The comparator explicitly includes a prerelease on the `0.1.2` tuple, so later prereleases on that same tuple are eligible. `0.1.2-alpha.2` is greater than `0.1.2-alpha.1` and satisfies this range. Neither `0.1.1-rc.1` nor `0.1.1-rc.2` satisfies its lower bound.

Given exactly the published versions stipulated in the brief, a fresh ordinary npm resolution selects **`@deepseek-ai/dsh-llm@0.1.2-alpha.2`**. A range does not require its lower-bound version to have been published. An exact declaration of `0.1.2-alpha.1`, by contrast, has no matching registry release under those facts. The caret range could also admit stable `0.1.2` if it were published later; it is not an exact alpha.1 baseline or a permanent alpha.2 pin.

This is a dependency-selection conclusion, not a claim that a real install succeeded. Registry access, package integrity, transitive dependencies, peer constraints, engines, npm configuration, and usable type exports are **unconfirmed**. Production installs that omit devDependencies will not supply this development type baseline. A lockfile can further determine the selected version; no lockfile exists in the provided fixture.

Evidence: `fixture/package.json` contains a single devDependency, the quoted range, and `private: true`; `fixture/README.md` supplies the publication inventory and the claim about npm install. The fixture contains only those two files. Publication history is accepted as the task's stipulated fact, not independently queried. No install or network access was performed.

## 2. Recommended path: explicitly adopt the published alpha.2 baseline

Proposed changes for a later, authorized implementation in the real plugin repository:

1. Decide that alpha.2, rather than an unavailable alpha.1 artifact, is the intended baseline. Change the development declaration to exact `"@deepseek-ai/dsh-llm": "0.1.2-alpha.2"`.
2. Inventory the real plugin's DSH imports, runtime host requirements, and any additional direct, peer, and transitive `@deepseek-ai/*` dependencies. Use compatible packages from the alpha.2 cohort where required; do not blindly override transitive or peer constraints or mix release cohorts. The fixture supplies no such dependency graph, so exact companion package names and requirements are **unconfirmed**.
3. Inspect the published alpha.2 package metadata and declarations, its type export paths, peers and engines before adoption. Compare the APIs the plugin uses against those declarations and the intended host runtime. Availability of the package does not establish that its types or runtime behavior match alpha.1.
4. Only in a separately authorized working copy, perform the install, review lifecycle scripts and dependency changes, and commit the resulting lockfile with the manifest. Record the Node/npm versions and resolved versions. Use the committed lockfile and `npm ci` for repeatable development/CI installs, ensuring development dependencies are included. An exact direct pin alone does not freeze transitive dependencies.
5. Run the real plugin's typecheck, relevant tests, and a host integration smoke test. No source, tsconfig, test scripts, package tarballs, or host runtime is supplied here, so commands specific to that repository and compatibility results remain **unconfirmed**.

Tradeoff: this uses a stipulated published version and makes the intended baseline explicit, but may require source migration from alpha.1 assumptions. Semver ordering does not prove prerelease API compatibility.

Exit: if type or runtime checks fail, stop adoption and restore the prior manifest and lockfile together in the real working copy; select one of the alternatives below. Do not silently widen ranges, force peer resolution, or suppress type errors as a substitute for compatibility evidence.

## 3. Alternative paths

### A. Preserve the current caret range, with an honest alpha.2 resolution claim

If accepting compatible future versions is intentional, keep `^0.1.2-alpha.1`, generate/review a lockfile in the later implementation, and document that the stipulated fresh resolution is alpha.2. Use `npm ci` against that lockfile. This requires less manifest change but leaves an unpublished lower bound that may confuse maintainers and permits drift on a fresh unlocked resolution. Exit by pinning alpha.2 if the range no longer expresses the intended policy. The same compatibility checks as the recommended path still apply.

### B. Require an authentic alpha.1 baseline

Public npm cannot provide an exact alpha.1 package under the stated publication history. Obtain a maintainer-approved archived artifact or reproducible source revision for alpha.1, with provenance, immutable revision/checksum, license, and the matching dependency cohort. A reviewed local package artifact, vendored declarations, or an approved private distribution could supply types later; their availability and authenticity are **unconfirmed**. This report does not construct, install, or publish any such artifact.

A source tag alone does not prove installability: generated declarations, build prerequisites and dependencies must also be verified. Vendored declarations provide a type snapshot, not proof of runtime compatibility. Do not relabel alpha.2 declarations as alpha.1. Exit: if no authentic artifact can be verified, explicitly mark the alpha.1 baseline unavailable and move to alpha.2 or an older supported cohort instead of promising npm can recreate it.

### C. Adopt the published rc.2 cohort

If the intended host supports the older release, evaluate exact `0.1.1-rc.2` and its compatible companion dependencies as a separate fallback. This requires changing the declared version; rc.2 is not a fallback npm can select for the current caret range. Compare APIs and adapt source before adopting it, then lock and validate the complete dependency graph and host integration. Host support and necessary migration are **unconfirmed**. Tradeoff: an older published baseline may be usable but may lack APIs required by the plugin. Exit: abandon this route if it cannot meet the plugin's requirements; avoid combining rc.2 types with an incompatible alpha runtime.

## 4. Proposed README correction and acceptance criteria

Suggested wording for the recommended path:

> The development type baseline is `@deepseek-ai/dsh-llm@0.1.2-alpha.2`. Version alpha.1 was never published. The previous caret range resolves to alpha.2 among the currently stipulated releases. After the manifest and lockfile are updated and validated, use `npm ci` with development dependencies included to reproduce the locked baseline. Typechecking and host integration checks determine compatibility.

Acceptance requires a reviewed manifest/lockfile pair, verified type exports, successful plugin typechecking and relevant tests, and compatibility with the specified host runtime. None of those execution outcomes is claimed by this read-only report.

## Scope and blockers

Only the solver instruction and the two fixture files were read. No skill was used, no network service was contacted, and no install, build, migration, reproduction environment, or fixture modification was performed. Only this report was written under agent-output. There is no blocker to completing the planning task. Actual installation success and baseline compatibility remain **unconfirmed** because execution is prohibited and the fixture lacks package artifacts, implementation source, dependency graph and runtime evidence.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.