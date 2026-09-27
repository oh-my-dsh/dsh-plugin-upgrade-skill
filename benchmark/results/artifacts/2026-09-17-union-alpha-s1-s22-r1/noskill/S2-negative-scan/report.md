# S2 negative-scan report

## Verdict and scope

**One category hits: #3 internal service/Remote. The other six categories have no detected coupling. The plugin is not compatible as-is with dsh 0.1.2-alpha.2: its required apiProxy service and owning package were removed. Zero hits in the other categories do not establish compatibility. Real verification is still required.**

This was a read-only static review. No fixture files were modified, no migration or installation was executed, and no external services were accessed. The task instruction was read in full first. Source inventory, manual source review, and seven-class pattern scanning were completed; build, typecheck, Loader mount, and functional verification were not run because this task supplies a static, non-executable copy.

Fixture root (F): E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S2-negative-scan/environment/fixture

All five fixture files were read in full and included in the scan:

- F/package.json, lines 1–19
- F/cordis.patch.yml, lines 1–3
- F/index.js, lines 1–15
- F/src/session-notes.js, lines 1–10
- F/README.md, lines 1–5

Paths beginning F/ below are relative to that explicit root. No tests, scripts, lockfile, generated client entry, or additional source files were present in the fixture inventory. The plugin is @demo/dsh-minimal-llm version 0.1.0, private ESM, with index.js as its main/root export and a dsh.bundle.patch declaration. Its sole dependency is @deepseek-ai/dsh-host-apiproxy pinned to 0.0.1-rc.1 (package.json:17). That dependency version is not proof of the historically running dsh version: the source explicitly identifies its API style as 0.1.1-rc.2 (index.js:2), and no installed dependency tree or live host was supplied.

The reviewed migration corridor is dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2. Conclusions are about the exact alpha.2 target, not an unverified final 0.1.2 release or later prereleases.

## Seven-category evidence matrix

Every row covers all five files above, including metadata/configuration and the utility module, not merely index.js. Patterns were used as a heuristic and checked against actual code behavior; documentation/comments and filename words are not independent runtime hits.

| # | Category | Result | Evidence and exclusions | Change-card disposition |
|---|---|---|---|---|
| 1 | Source patch / monkey patch | **No hit** | No patch-package, patchedDependencies, host source-root override, monkey patch, source replacement, or artifact write. F/cordis.patch.yml:1–3 inserts a Loader row with id minimal-llm and package name @demo/dsh-minimal-llm. F/package.json:8–14 exports and declares this composition overlay. Neither file contains source hunks or a host implementation replacement. | No source-patch migration. API-08 distinguishes official composition from a source patch; do not infer A1-03 applicability from the patch filename. |
| 2 | Internal event names / persisted events | **No hit** | No SessionEvent, SessionEventMap, session/event, append, ctx.on, subscribe, dispatch-event name, or persistence/transport implementation. F/src/session-notes.js:2–9 only normalizes text and chunks arrays; the filename and formatSessionNote name do not make it a Session integration. F/index.js:7 uses ctx.effect, not an event subscription or durable event write. | No A1-02/A2-01 event migration, and no event-related PTC rename. |
| 3 | Internal service probes / Remote | **Hit** | F/index.js:3 requires apiProxy; line 9 calls ctx.apiProxy.llm.providers(); lines 10–12 log success or caught error.message. F/package.json:17 declares the removed dsh-host-apiproxy package. Comments/log literals at index.js:2,6,10,12 and README.md:3 corroborate but do not multiply the real coupling. No other service probes or Remote owners/consumers occur. | **DSH-0.1.2-A1-01, required-if-hit.** API-01 supplies runtime-plane-specific guidance. A2-02 is only conditional if an actual Remote consumer/owner is introduced, not a second proven existing break. |
| 4 | Direct host directory reads/writes | **No hit** | No DSH_HOME, .dsh path, profiles path construction, homedir, filesystem imports, readFile/writeFile/mkdir, or openPath. The relative package/overlay paths are Loader metadata, not code reading or writing host state. The utility module only handles supplied strings/arrays. | No directory/host-storage coupling requiring A1-04, A1-13, or A1-21 changes. |
| 5 | Internal UI / commands / tools | **No hit** | No registerCommand/registerView, contributes, ctx.tools, commands.execute, slots, useSession/useChat, client-runtime import, DOM view entry, or client registration metadata. F/package.json:5–14 declares a Host ESM entry and bundle overlay, not dsh.client. | No UI/runtime/command migration established. In particular, the word session in a utility function is not evidence for session-view or client-runtime changes. |
| 6 | Custom HTTP / WS / RPC / DOM / CSS channel | **No hit** | No server/router, WebSocket, loopback endpoint, /api/ route, custom request envelope, DOM observer, stylesheet mutation, or editable-input integration in any file. Using the existing apiProxy service is category #3, not implementation of a custom transport. | No custom-channel auth or DOM migration established (A1-08/A1-28). |
| 7 | Subprocess / stdout / stderr parsing | **No hit** | No child_process, spawn/exec/execa, headless launcher, --profile argv, exit-code handling, or reading/parsing another process's streams. F/index.js:6,10,12 emits console.error diagnostics; JSON.stringify at line 10 serializes a returned value for logging. Neither is subprocess output parsing. | No subprocess/Headless output migration established (A1-04/A1-05). |

The pattern pass found zero matches in categories 1, 2, 4, 5, 6, and 7. Category 3 matched apiProxy in source/comments and README; an additional case-insensitive pass found the lowercase apiproxy package name. Counts are not risk scores: one hard missing service can disable the entire plugin.

## Confirmed break: DSH-0.1.2-A1-01

### Existing behavior and failure

The Loader overlay inserts the root package, package.json resolves its root to index.js, and the manifest has no browser dsh.client entry. This is a **Host-side Cordis plugin**, not a Web Client consumer. It declares inject = ["apiProxy"] and calls the old Host facade's llm.providers(). A1-01 removes @deepseek-ai/dsh-host-apiproxy and apiProxy in alpha.1; that removal remains in alpha.2. The plugin can remain pending on its unsatisfied apiProxy injection, so even its apply() log need not execute. Trying to retain/install the old package also leaves an unsupported old-cohort dependency rather than proving target compatibility.

The try/catch inside apply cannot repair a dependency that prevents activation. A success-looking log is not an adequate readiness assertion either: the catch logs a failure and does not turn the smoke into a failing test.

### Required migration direction (not executed)

Remove the old APIProxy dependency/coupling and use the target Host domain service. The confirmed Host pattern is:

~~~js
export const inject = ['llm']

export function listHostProviders(ctx) {
  return ctx.llm.listProviders()
}
~~~

Use the target llm service's real declarations and behavior to preserve the intended provider-list semantics and declare the appropriate direct package/type dependencies. The old facade's provider directory included concerns now separated into live/configurable directories on the Client projection; do not assume that renaming a method necessarily preserves every returned field. This fixture only logs the result, so document which directory the plugin actually needs, and verify it against the pinned target Host API.

**Do not mechanically replace apiProxy with remote.** ctx.remote is the browser Client projection, not the Host replacement. A Host plugin with inject = ['remote'] can remain pending forever, waiting for a service absent on that face. Do not add dsh.client or import Host-internal Client packages merely to follow a Remote table.

For comparison only, a genuine Web Client migration would use the generated ctx.remote.llm.listProviders() and listConfigurableProviders() methods with the required Client injection/type composition. Such unary results require branching on result.ok and handling result.error.code. A2-02 changes RemoteError/error-code vocabulary; it does not make catch-only handling sufficient and does not require a Host domain service result to be wrapped in RemoteResult. No actual RemoteResult consumption, removed failure-class import, or error-code branch exists in this fixture, so A2-02 is conditional, not an additional detected hit.

## What the six negative results mean

They mean only that the reviewed five-file static copy contains no coupling detected by the current patterns and manual review in those six classes. They are evidence of reduced migration scope, not proof that the plugin loads or behaves correctly. The scan cannot establish installed dependency resolution, target package artifact contents, provider availability, composed Loader configuration, lifecycle behavior, or semantic equivalence of returned provider data. Indirect dependencies, dynamically assembled names, and environment-owned configuration can also escape a lexical scan.

Review changes card by card against applicability, not by the number of matching categories. For example, A2-03 is a packaging/dependency change explicitly outside the seven touchpoint classes. It still motivates checking direct dependency ownership and the real target installation. The ordinary composition overlay and root exports still need artifact/Loader verification despite no source-patch hit. Optional feature cards do not justify adding unrelated functionality.

Use the corridor's final net state. A1-02 temporarily removes SessionEvent.ignorable and A2-01 restores its envelope semantics; do not plan delete-then-restore edits for an alpha.2 target. Here neither card has a real event hit. The utility's session-related filename must not create one. Restoration also does not by itself prove arbitrary third-party Session.append persistence works; no such persistence exists here and none should be introduced for this migration.

**Compatibility cannot be concluded now.** There is a confirmed required migration, and the post-migration verification below remains outstanding. No-hit categories do not justify “roughly compatible,” “no changes required,” or “verification passed.”

## Mandatory post-migration verification (not run)

Perform these steps later in an authorized writable copy and isolated target environment, never in this read-only fixture:

1. **Pin and inspect the target graph.** Use exactly dsh 0.1.2-alpha.2 and compatible Cordis/domain packages; inspect the actual installed/packed exports, declarations, and runtime files. Remove the obsolete APIProxy dependency; verify direct dependency ownership and no accidental old-cohort resolution. The fixture has no lockfile or scripts, so no package-manager choice or successful installation can be inferred.
2. **Build and typecheck.** Run the maintained project's clean build and typecheck against the actual target Context/domain declarations. For this plain-JavaScript fixture, arrange equivalent checked-JS or a small typed consumer test plus runtime entry resolution; do not claim a nonexistent npm script passed or mask ctx with any. This step alone does not prove Loader activation.
3. **Artifact and composition smoke.** Inspect the pack file list without executing unknown lifecycle scripts. Confirm index.js and cordis.patch.yml are included, exports resolve, and dsh.bundle.patch points to the included overlay. In an isolated DSH_HOME/Profile, dump the fully composed configuration and verify the minimal-llm row, package resolution, and required llm provider. Config dump alone does not execute apply().
4. **Real isolated-profile cold boot.** Start a fresh Host process at the pinned target with the migrated plugin. Confirm the Loader row is active, not pending for apiProxy or remote, and apply executes once. Capture actionable activation failures; restart rather than relying on a stale process after a Host-code change.
5. **Functional smoke.** Invoke the real llm provider-list operation and assert returned provider identities/fields and intended live/configurable semantics, including an empty directory where supported. Exercise actual supported failure behavior; fail the test rather than accepting a swallowed diagnostic. Ensure provider data is not confused with a RemoteResult envelope. If a real Remote path is intentionally added, separately cover success, domain failure, cancellation where supported, and local assembly faults with A2-02 handling.
6. **Lifecycle/reload check.** Stop/remove and remount the plugin, checking that effects do not duplicate work and no late async completion is mistaken for current-run success. Verify a new process starts cleanly. No custom Session-event persistence exists, so do not invent an event-storage migration test requirement for this utility.

Record build/typecheck, artifact resolution, Loader mount, and functional smoke as separate results. Currently all are **not run / unverified**, not passed. There is no blocker to completing this static report; the absent executable target environment is the concrete limitation on a runtime compatibility verdict.

## Local reference basis

Read-only reference sources used for category definitions, card applicability, and migration interpretation (plain paths; not runtime proof):

- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/pre-flight.md — seven categories and heuristic limits.
- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/pre-flight-patterns.json — scan expressions.
- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/v0.1.2-alpha.1.md — DSH-0.1.2-A1-01 and Host/Client distinction; A1-02 intermediate event state.
- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/v0.1.2-alpha.2.md — A2-01 restoration, A2-02 failure vocabulary, A2-03 packaging.
- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md — API-01 Host domain call, API-07 artifact checks, API-08 composition classification, and validation ladder.

No target runtime test or primary target artifact was executed or installed during this report. The fixture remains unchanged.
