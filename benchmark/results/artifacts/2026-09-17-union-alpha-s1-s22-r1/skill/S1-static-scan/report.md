# S1 static touchpoint inspection

## Scope and conclusion

Mode A: read-only inspection, not a migration. All **seven of seven** touchpoint categories hit. This is a deliberately non-installable static fixture; no fixture code, package script, migration, installation, server, or model request was executed. Only this report is an intended output. The findings identify source coupling, not demonstrated runtime failures.

Fixture root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S1-static-scan/environment/fixture

All fixture-relative file references below resolve under that root. All six files were read in full: package.json:1–9, cordis.patch.yml:1–6, patch.yml:1–6, README.md:1–16, scripts/apply-patch.mjs:1–19, src/index.ts:1–68. A recursive glob found exactly these six files, with no tests, CI, lockfile, generated files, node_modules, nested rules, or other source files in this fixture. README.md:3 expressly says not to execute or publish and that non-compilability is intentional. Findings below are corroborated by source, not merely copied from its README table.

## Identity and corridor

- Source identity: local static copy inside E:/deepseek-harness/dsh-plugin-upgrade-skill; containing Git branch benchmark/glm-r3-flash-rejudge-a2; HEAD dbca8e4583e36c01105028734631d4f255332363. Fixture-scoped git status --short --untracked-files=all -- . returned no changes; git submodule status returned no entries. This is not a claim about unrelated working-tree paths.
- Package identity: legacy-plugin, own version 0.1.1, private: true, ESM (package.json:2–5). This plugin version is **not** an exact DSH host version. No repository URL, engines, dependencies, peerDependencies, packageManager, dsh.client, or standard dsh-plugin.json is supplied. There is no resolved cohort or installed-plugin identity to verify. The only script is apply-patch (package.json:6–8), intentionally not run.
- Requested host corridor: dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2, connected by from/to metadata in the reference index. The brief supplies the source-era/corridor assumption; the fixture itself does not prove an exact rc.2 installation. No earlier/later edges are claimed covered.
- Recommended analysis target: exactly 0.1.2-alpha.2 as requested, not a registry dist-tag or an upgrade of the running Harness. No registry availability or actual target install was checked. Local scan command Node version: v24.14.1; current DSH process version was not collected and is not evidence for this static target.

## Completed: seven-category scan and card mapping

Card prefixes below are full DSH-0.1.2 identifiers. Required-if-hit means work for a future real migration, not changes performed here.

| Category | Hit | Concrete locations and coupling | Applicable card / final target disposition |
|---|---|---|---|
| #1 Source patch | Yes | cordis.patch.yml:5–6 explicitly references patch.yml; patch.yml:2–6 declares target src/session/view/SessionView.ts and replacement renderSessionView → renderSessionViewPatched. scripts/apply-patch.mjs:5–9 requires DSH_HARNESS_SOURCE_ROOT and reads the patch declaration; package.json:7 exposes that script. | **DSH-0.1.2-A1-03**: session-view decomposition invalidates assumptions about private target paths and semantic markers. Locate the actual owner in exact target source; replacement path/public seam is pending confirmation. |
| #2 Events | Yes | src/index.ts:15–19 produces an external informational envelope of type legacy/informational-note, with ignorable: true at line 17; lines 20–22 observe session/event and event.type. | **DSH-0.1.2-A1-02 + DSH-0.1.2-A2-01**, folded to alpha.2: retain the informational marker; do not remove/re-add it. Producer/persistence/reload/transport preservation must be verified separately from the observer. |
| #3 Services / Remote | Yes | src/index.ts:25–28 obtains ctx.get('apiProxy') and invokes session.rename with { id, title }; lines 29–32 repeat the probe and invoke llm.providers. | **DSH-0.1.2-A1-01**: Host APIProxy service/package removed. Migrate by runtime face, not string substitution. **DSH-0.1.2-A2-02** is a conditional follow-on if using/forwarding Remote results or errors, not an existing old error-code hit. |
| #4 Host directory | Yes | src/index.ts:5–7 imports path/filesystem helpers; lines 35–38 construct homedir()/.dsh/profiles/default and write legacy-note.txt directly. | **DSH-0.1.2-A1-04**: runtime DSH_HOME and selected profile, rather than a fixed home/profile, must determine paths. This does not prove the profiles layout itself was removed. |
| #5 UI / commands / tools | Yes | src/index.ts:10 imports SessionView from @deepseek-ai/dsh-session-view/internal; lines 41–43 register legacy.openView via ctx.contributes.registerCommand and construct SessionView({ enhanced: true }). | **DSH-0.1.2-A1-03**: private session-view import/construction and UI registration coupling need owner-by-owner review after decomposition. No exact new import or command API is established by this fixture. |
| #6 Custom channel | Yes, statically | src/index.ts:4 and 47–53 define a raw Node HTTP server, returning legacy and listening on 127.0.0.1:43121; line 51 documents http://localhost:43121/api/legacy. | **DSH-0.1.2-A1-08**: a private loopback server does not inherit Connection authentication or Host/Origin checks. Preserve the HTTP protocol while using an authenticated supported seam. |
| #7 Subprocess / output | Yes | src/index.ts:8,57–67 spawns dsh --profile headless with prompt, parses each stdout data chunk as JSON and expects event.type === 'final'; scripts/apply-patch.mjs:3,12–19 executes dsh --profile headless ping, splits stdout by newline, then JSON.parse and checks final. | **DSH-0.1.2-A1-05**: stdout is final text, not JSONL; alpha.1 adds reasoning on stderr. **DSH-0.1.2-A1-04** applies to launcher/profile context review, but there is no removed demo executable hit: both already use the official dsh launcher. |

### #1 and #5: distinguish source replacement from composition

cordis.patch.yml:2–4 is a composition row (id/name legacy-plugin and config {}). Its filename alone is not a source-patch hit; API-08 in the API ledger explicitly distinguishes composition from source patching. The positive evidence is the explicit patch reference and actual target/replacement declaration in patch.yml. The script reads/logs that declaration but never writes host source, applies the replacement, or even uses sourceRoot after checking its presence. Thus a declared source patch is detected, not a successful patch application. Do not execute it to establish the hit.

For DSH-0.1.2-A1-03, compare src/session/view/SessionView.ts and the renderSessionView marker against exact-tag owning modules before any future rebase. Prefer an available public UI/service seam; otherwise mark pending confirmation. The fixture mixes Node-only Host behavior with a private UI import and supplies no Client entry declaration, so it does not demonstrate a valid Host/Client split. Do not invent a replacement package path or assume ctx.contributes.registerCommand has a specific one-to-one replacement. Other ctx.register calls at src/index.ts:25,29,35,57 are callback registrations, not proof of a real target model-tool API. No ctx.tools registration is present.

### #2: corridor folding is preservation, not deletion

DSH-0.1.2-A1-02 is required only when the final target is alpha.1: unknown external informational events could lose the marker and then be rejected as required on reload. DSH-0.1.2-A2-01 restores the envelope retention behavior. At this task's final alpha.2 target, **keep ignorable: true** on the informational producer. Do not remove the event, strip its marker, whitelist arbitrary unknown events in consumers, or filter it from loaded history.

Required acceptance semantics: an unknown informational event with the marker remains in loaded events after reload; readers may omit its semantics without affecting reconstruction. Unknown events without the marker must still fail closed. The observer at lines 20–22 only logs the type; it neither proves persistence nor fixes it. There is no persistence/reload/transport implementation in the fixture. In particular, its illustrative ctx.emit call does not prove a supported durable production API. The alpha.2 card says public live Session.append has no ignorable argument; a real plugin limited to that API has a producer-seam capability gap, not permission to cast around it. No SQLite usage or schema migration is detected here.

### #3: respect the runtime plane and precise Remote vocabulary

The file's node:http/fs/os/child_process usage and comments make this a Host-side APIProxy consumer, not a proven browser plugin. DSH-0.1.2-A1-01 and ledger API-01 direct Host consumers to inject the owning domain services. The documented example is llm with ctx.llm.listProviders(); confirm any configurable-provider aggregation and the exact rename owner/signature against alpha.2 primary declarations before implementing. Do not put inject: ['remote'] into this Host file: remote is Client-only and would leave a Host entry waiting for an unavailable service.

For a separately designed Web Client, the precise table is session.rename → session/rename (ctx.remote.session.rename({ sessionId, title }), not ctx.remote.sessionTitle.rename), and llm.providers → llm/listProviders plus llm/listConfigurableProviders (combine by provider id when preserving both directories). This is a face-specific migration reference, not a recommendation to put browser APIs into the present Node file. Do not silently preserve { id, title } as the Client request signature.

DSH-0.1.2-A2-02 / API-02: RemoteResult already existed before alpha.2; alpha.2 changes error values to RemoteError and introduces namespaced codes. If a real Client/Remote adapter is introduced, handle result.ok and preserve code/details, treat gateway/cancelled as cancellation, and do not blindly retry gateway/internal or unknown failures. Existing source contains no old code-string comparisons or removed Remote error imports, so these are follow-on requirements rather than additional direct residue findings.

### #4: follow the complete path data flow

homedir() → join(..., '.dsh', 'profiles', 'default') → profileDir → join(profileDir, 'legacy-note.txt') → writeFileSync is a direct Host filesystem write, not profile resolution. It ignores runtime DSH_HOME and the selected profile; directory existence, write permission, and ownership are unchecked. DSH-0.1.2-A1-04 provides the appropriate launcher/profile guidance. The readFileSync('patch.yml') in scripts/apply-patch.mjs:8 is instead cwd-relative plugin-local input, not a second .dsh state path. DSH-0.1.2-A1-13 is not a direct hit: no shell/directory-picker workaround exists. DSH-0.1.2-A1-21 is not a direct hit either: there is no resolveSessionPreset, roots override, or CLI config/agent-presets path.

### #6: dormant code is still a static channel hit

startLegacyBridge is not invoked (src/index.ts:54 only references it); no listener was started during this scan, and no live exposure is claimed. The server callback also does not actually route by method/path: /api/legacy is only a comment, and if invoked the callback would return legacy for all requests. There is no Cookie, token, Host, Origin, authentication, or close/disposal handling. Loopback alone is not an authentication exemption.

DSH-0.1.2-A1-08 and the precision checklist require a real implementation to join the Connection gate before processing protected requests, or use a Connection-owned compatible carrier. A raw Node server is not automatically a Cordis Connection route, and merely putting /api in its URL does not protect it. Keep the current plain HTTP response semantics unless a separate redesign explicitly changes them; do not convert it blindly to JSON RPC. Future acceptance should check unauthorized rejection, wrong Host/Origin, authorized behavior and server teardown without weakening the existing protocol. No security probe was sent.

### #7: pre-existing parser error versus new stderr behavior

DSH-0.1.2-A1-05 explicitly says rc.2 stdout was already final assistant text. The JSONL expectation is therefore a visible pre-existing assumption, **not** a claim that alpha.1 changed stdout from JSONL. alpha.1's added dsh: reasoning: stderr segment is the corridor change. Both parsers must be reviewed in a real migration: even a structured stream would not guarantee that each Node data chunk was one JSON record.

src/index.ts:59 supplies no cwd/env options, so normal subprocess defaults inherit them; command lookup is through the current environment. No AbortSignal/timeout, spawn-error handler, controlled stderr sink, or explicit disposal is shown. Line 65 ignores close code/signal and resolves a potentially empty result even on failure. The synchronous script also inherits cwd/env, sets only UTF-8 encoding, provides no cancellation/timeout or explicit failure handling, and execFileSync throws on launch/nonzero failure. Its own stdout additionally contains human diagnostic lines at 9 and 18. Neither wrapper defines a clean structured output protocol.

Future wrappers should keep stdout as final text, route reasoning/diagnostics on stderr to an appropriate controlled sink, and use exit status (0 completed; 1 failure/abort/no completed turn) rather than stderr presence as the success signal. Cover plain text, reasoning, empty result, launch error, nonzero exit, cancellation and teardown. Both calls already use dsh --profile headless; DSH-0.1.2-A1-04 does not justify renaming a nonexistent removed demo bin. DSH-0.1.2-A2-04 is not a direct hit: no Node-major loader probe, Node-22 workaround, dsh web launcher, HMR or empty-client-graph workaround appears.

## Skipped / negative evidence

**There are no no-hit categories.** All seven are positive. Therefore there is no absent category to label safe. The complete six-file scan nevertheless rules out these narrower surfaces:

- No PTC/code-mode configuration, tool/code-dispatch listener, or old preset id: DSH-0.1.2-A1-06 is not triggered merely by generic session/event or a subprocess call.
- No dsh-client-runtime import, dsh.client.inject, keyed chat snapshots, workspace navigation, settings namespace helper, plugin inventory strict schema, or $host usage: DSH-0.1.2-A1-25, A1-27, A1-30, A1-32 and DSH-0.1.2-A2-05, A2-06, A2-10 are not direct hits. The private SessionView import is already covered by A1-03; do not label it an actual dsh-client-runtime import.
- No DOM observer, CSS insertion, contenteditable/textarea selector, localization registration, MarkdownText usage, or ModuleLoader registration. A1-28 and the related UI capability cards are not automatic migrations for every UI-related hit.
- No dependency/peer block, lockfile or complete profile composition: DSH-0.1.2-A2-03 and A2-08 cannot be established as actual dependency/pending-service defects here. Their checks remain relevant to a future installable plugin, including coherent cohort dependencies (rollup R-01) and runtime service composition separately from type declarations.
- No actual running Host/installed plugin to classify as a ghost host, no custom WS or RPC implementation, and no browser-acceptance script to migrate under A1-19. A later real Web implementation would still need mount verification.

No hit means only that the inspected source does not show that coupling; it cannot establish compatibility. Dynamic paths, undeclared imports, missing dependency metadata, mixed runtime faces, target declaration changes and real Loader activation can fail outside these patterns. The curated card lists are not a complete API diff. Build, real mount and a core functional path remain necessary for an actual plugin, but are deliberately not run against this static fixture.

## Pre-existing and validation limits

Pre-existing mechanical failure baseline: **not collected** (Mode A). No build/typecheck/test command was run, and no pass or failure exemption list is fabricated. README.md:3 establishes intentional non-compilability. The parser defect and lifecycle omissions are source observations rather than measured failures or migration-introduced regressions. A future author migration of the real source must collect its original dependency-state baseline before changes (rollup R-06).

Completed validation consists of full manual source/config reads, recursive file inventory, read-only Git identity/status checks, and card/ledger comparison. No dependencies were installed, scripts executed, target declarations fetched, external services accessed, credentials read, runtime mounted or fixture edits made.

### Future validation plan, not executed

1. Obtain the real installable source and exact from/to artifacts; establish build/typecheck/test baseline before changing its own version/cohort. Check dependency graph and full lockfile with its existing package manager, declare actual consumed owners, and verify package versus plugin version separately (DSH-0.1.2-A2-03; rollup R-01/R-06).
2. Resolve the patch target and UI owner at exact alpha.2 source, or document removal/public alternative; test intended UI behavior and reversible registration (A1-03).
3. Verify source-to-persistence-to-reload-to-transport retention of the informational marker and rejection of unknown required events (A2-01).
4. Prove the Host domain service calls and selected-profile/DSH_HOME file ownership; if creating a Client face, validate its generated Remote types and failure branches independently (A1-01/A2-02/A1-04).
5. Cold-start an isolated real target profile with bounded timeouts, inspect enablement/no pending dependencies, execute one core plugin path, and dispose cleanly. For a Web half, authenticate, use the host-advertised boot artifact and prove actual registration/mount, not just HTTP 200 (A1-19).
6. Test channel access control with protocol preservation and lifecycle cleanup (A1-08); test both wrapper implementations against text stdout, stderr reasoning/diagnostics, exit codes, empty output, cancellation and teardown (A1-05). Do not run these fixture scripts.

## Pending / residual risk

Static scan is complete. Runtime compatibility remains unproven by design. Exact target replacement paths/UI command seams, the Host rename service signature, durable informational-event producer capability, real dependency resolution and activation all remain pending verification against alpha.2 source/types and an installable implementation. Nothing in this report claims a live host migration, successful compile, patch application, or authenticated endpoint test.

## Rollback

No fixture, configuration, dependency, host, or installed plugin was changed, so none needs rollback. Recorded baseline is the fixture-scoped clean Git state at dbca8e4583e36c01105028734631d4f255332363 and the six original paths above; no lockfile exists. Do not reset or clean the containing repository. The only owned deliverable is E:/deepseek-harness/test-lhh010/benchmark-runs/union-alpha-r1/skill/S1-static-scan/report.md; removing that report, if desired later, has no plugin/runtime effect.

## Reference material used

Reference root: E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade

- SKILL.md: Mode A, seven-class inspection, reporting and read-only boundaries.
- references/README.md: explicit version-corridor edges and curated coverage limits.
- references/pre-flight.md: scan classes and negative-evidence requirements.
- references/v0.1.2-alpha.1.md: DSH-0.1.2-A1 cards, particularly 01–05 and 08.
- references/v0.1.2-alpha.2.md: DSH-0.1.2-A2 cards, particularly 01–04.
- references/api-migration-0.1.2-alpha.2.md: API-01 runtime faces, API-02 error semantics and API-08 composition versus patches.
- references/precision-checklist.md: read-only report delivery, type/runtime distinction and protocol-preserving authentication review.
- references/rollup-0.1.2.md: R-01 cohort verification and R-06 baseline attribution; no installation recipe executed.
