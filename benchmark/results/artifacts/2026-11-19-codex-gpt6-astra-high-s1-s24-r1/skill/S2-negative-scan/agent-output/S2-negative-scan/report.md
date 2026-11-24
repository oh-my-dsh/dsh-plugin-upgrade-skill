# S2 read-only compatibility scan

Target: DSH **0.1.2-alpha.2**. Result: **one hit category (#3), six no-hit categories; compatibility is not established, and the existing APIProxy dependency is a known migration blocker.** A majority of negative categories is not a compatibility vote.

## Scope, identity and method

Applied the supplied `skills/plugin-upgrade/SKILL.md` in Mode A (read-only impact inspection). BENCHMARK-AUTH-v1 authorizes the report. No migration, installation, package script, plugin execution, verifier, network request, or external service was run.

Inspected every file in the static fixture: `index.js` (15 lines), `src/session-notes.js` (10), `package.json` (19), `cordis.patch.yml` (3), and `README.md` (5). No fixture files were excluded. There are no local AGENTS.md/CLAUDE.md, lockfiles, tests, CI, node_modules, generated artifacts, submodule metadata, or Git metadata in this copy. No parent repository was inspected. Branch, HEAD, source URL, live installation identity, resolved dependencies and actual DSH/Node versions are unavailable, rather than inferred from the enclosing repository.

The package is `@demo/dsh-minimal-llm` version `0.1.0`, private ESM, with `index.js` as main/root export (`package.json:2-9`). Its only dependency is `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` (`package.json:16-18`); there are no peers, engines, packageManager or scripts. No JS imports are present. This dependency version and the plugin version are not the DSH host version. `index.js:2` describes rc.2 API style; consequently the analytical corridor is **dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2**, as connected by reference metadata. The actual historical host version remains unverified. If it predates rc.2, its earlier edges need a separate review.

The plugin is Host-side: the bundle overlay inserts its package as a Cordis entry (`cordis.patch.yml:1-3`), whose main exports `inject` and `apply`. There is no `dsh.client` declaration or client bundle. `package.json:11-14` declares the bundle patch; it is composition metadata, not a standard `dsh-plugin.json` (absent).

Ran the supplied `pre-flight-patterns.json` expressions read-only through PowerShell Select-String on all five files and manually reviewed the complete contents. PowerShell matching is case-insensitive here: raw category counts were **0, 0, 8, 0, 0, 0, 0**. Eight #3 matching lines include comments/documentation/log strings and the lower-case package dependency; they are not eight independent API uses. The actual executable coupling is the injection and provider call.

## Seven touchpoint conclusions

All file/line references below are relative to `fixture/`.

| Category | Conclusion | Evidence and card disposition |
|---|---|---|
| #1 Source/monkey patches | No hit | No source diff, monkey patch, patchedDependencies, patch-package, host source path or replacement. `cordis.patch.yml:1-3` only inserts an entry; `package.json:9,13` exports/declares that overlay. API-08 explicitly classifies it as composition. DSH-0.1.2-A1-03 is not triggered. |
| #2 Internal/persisted events | No hit | Neither JS file registers/subscribes/appends/transports/reloads events. `src/session-notes.js:2-9` only normalizes/truncates strings and slices arrays. Its filename and function name do not create Session coupling. `ctx.effect` at `index.js:7` is lifecycle work, not a session event observer. A1-02/A1-06/A2-01 not triggered. |
| #3 Services/Remote | **Hit** | `index.js:3` requires `apiProxy`; `index.js:9` calls `ctx.apiProxy.llm.providers()`. `package.json:17` declares its old owner. **DSH-0.1.2-A1-01 + API-01** apply directly. A2-02 is conditional on a Remote consumer, not an instruction to create one on the Host. |
| #4 Host filesystem | No hit | Complete source has no fs imports, read/write/mkdir calls, DSH_HOME, homedir or profile directory construction. The package-relative overlay pointer is metadata, not a direct host filesystem operation. A1-04/A1-13/A1-21 not triggered. |
| #5 UI/commands/tools | No hit | `index.js:3-15` only injects a service and logs its result; no command/tool/view registration or internal UI imports. No slots, client runtime, useSession/useChat or browser entry. Utility exports at `src/session-notes.js:2,6` are not plugin commands. A1-03/06/09/10/11/25/26/28/29 and API-10 require surfaces absent here. |
| #6 Custom channels | No hit | No server/router/WS/RPC endpoint, browser DOM or CSS manipulation anywhere in source. Calling a host service is not defining a custom transport. A1-08/A1-28/A1-19 not triggered. |
| #7 Subprocess/output parsing | No hit | No child_process, spawn, exec, execa, headless invocation, argv or stdout/stderr parsing. `console.error` at `index.js:6,10,12` emits this plugin's diagnostics; JSON.stringify serializes a provider result, not child output. A1-04/05/06/13 and A2-04 not triggered. |

## Hit mapping and migration recommendation (not executed)

**DSH-0.1.2-A1-01: required-if-hit, breaking.** APIProxy and its owning package disappear in alpha.1 and remain removed in the final alpha.2 target. The injection can remain pending because `apiProxy` is unavailable; if reached without that service, the provider call fails. Retaining the old dependency does not prove the new host provides the old service and risks mixing cohorts. These are source/card-based expected failures, not runtime observations.

For this **Host** plugin, API-01 and the A1-01 Host field note prescribe the domain service:

```js
// Future Host migration sketch; not applied to fixture.
export const inject = ['llm']
// Inside the existing lifecycle path:
const providers = await ctx.llm.listProviders()
```

Check the exact alpha.2 owning package exports/types and actual provider-result shape before implementation; remove the obsolete host-apiproxy dependency, declare only the consumed target-cohort dependencies, and ensure the profile actually mounts the llm service. Preserve needed provider semantics and effect/disposal behavior. The supplied snippet establishes the Host seam; it is not a claim that target packages were installed or typechecked here.

Do **not** mechanically inject `remote` or switch this Host plugin to `ctx.remote.llm.*`: that projection belongs to the Web Client, and Host injection of it can stall waiting for `remote`. Only a genuine browser implementation would use generated `llm.listProviders()` plus `llm.listConfigurableProviders()` (old provider operation split) and the relevant namespace injections/type mounts.

**DSH-0.1.2-A2-02 / API-02:** reviewed as the adjacent #3 error-flow change. It is conditional, not a current Remote-call hit. If a future client consumes unary Remote, branch on `result.ok`; alpha.2 errors are RemoteError with namespaced codes. Ordinary Remote business failures are not caught merely with try/catch. Preserve code/details, treat cancellation separately, and do not auto-retry internal/unknown errors. Do not impose RemoteResult semantics on the direct Host llm service without its own contract evidence.

**DSH-0.1.2-A2-03:** packaging review remains necessary outside the seven categories. No lockfile or installed graph exists here; confirm direct runtime/type dependency ownership, consistent exact alpha.2 cohort, and pack contents in the executable migration environment. A1-24 has no direct pi-ai dependency hit. A2-08 has no listed tool/agent package hit in this fixture; the eventual full profile must still provide all services required by its own packages.

## Why no-hit does not mean compatible

A no-hit means only that these patterns and manual inspection detected no coupling in this supplied source category. It neither proves the target API unchanged nor establishes installability, transitive dependency compatibility, package exports, runtime activation, configuration correctness, or behavior. The reference cards are curated rather than a complete API diff. Dependencies and profile composition are independent obligations, and are already material here despite six negative categories. Tiny source size is irrelevant to the severity of a removed required service.

The utility file has no host coupling and needs no event migration based on available evidence. That local finding cannot certify the whole plugin. This report concerns exactly alpha.2, not a final 0.1.2 release or every later version.

## Required validation after migration — pending, not run

1. Establish the actual old and target host/package identities and Node version. In a separate executable working copy, record baseline build/typecheck/tests before migration so existing failures are not misattributed. No baseline is available here, and no failures are claimed to pass.
2. Resolve dependencies with the repository's established package manager; this fixture provides none. Inspect the complete lockfile/tree for old host-apiproxy, mixed cohorts, peer errors and missing runtime/type owners. Verify imports and exports against actual target artifacts. Confirm the packed `index.js` and declared `cordis.patch.yml` exist and package identity/version match. Keep the plugin release version separate from the host version.
3. Run build and typecheck against real alpha.2 dependencies, plus relevant tests. This fixture has no scripts/configuration; those checks must be provisioned in the real project (including appropriate JS checking), not reported as passed by a vacuous command. Cover provider result semantics and failures; any applicable cancellation/teardown must remain correct.
4. Use an isolated DSH_HOME/profile. Inspect resolved composition for the expected package row and llm provider, no duplicates or obsolete source lines. Then **cold-boot a real alpha.2 profile and prove the plugin entry activates and required services do not remain pending**. Config dumping or a successful install alone is insufficient. No Web mount is required by this Host-only plugin.
5. Execute the core provider-listing path on that real host and assert the actual expected result, not just presence of the apply log or absence of a crash. This is the dedicated functional smoke equivalent for this plugin. Test a controlled failure and detach/restart behavior; `index.js:11-12` currently catches and logs errors, so apparent startup success can hide a failed operation. Classify dependency-resolution, profile-config and runtime failures separately from plugin code failures.

## Completion, skipped work, risk and rollback

**Completed:** read-only inventory, seven-category pattern/manual scan, full two-edge target corridor review, specific hit mapping and validation plan. Read supplied SKILL.md, references/README.md, pre-flight.md, pre-flight-patterns.json, v0.1.2-alpha.1.md, v0.1.2-alpha.2.md, and relevant API ledger sections. No reference examples/evals were accessed.

**Skipped:** six no-hit migrations for reasons above; unrelated capabilities and other version corridors. No source/dependency/config changes, installation, build/typecheck, tests or runtime verification were attempted because the fixture is explicitly static and non-executable. Their future execution is mandatory, not waived by the negative scan.

**Pending/residual risk:** actual host baseline, installed target artifacts, complete dependency graph, full profile and all executable validation. No blocker prevented delivery of this report; these limitations prevent compatibility certification. Source inspection establishes a required migration, not a successfully migrated plugin.

**Rollback:** fixture and supplied skill were left unchanged. There is no migration to undo. The report is the only created artifact. Before a future migration, preserve the real package/lockfile, source entry and task-owned composition baseline; recovery must be limited to those owned paths. No Git SHA or lockfile baseline can be manufactured from this static copy.
