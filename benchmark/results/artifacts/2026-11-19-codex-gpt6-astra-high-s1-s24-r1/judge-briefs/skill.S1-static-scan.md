# JUDGE BRIEF · skill.S1-static-scan

## Criteria (sealed rubric)
- [source-patch] (10pt) Locate the source patch declaration/target and script, distinguish source patching from ordinary composition, and explain the private session-view coupling.
- [events] (10pt) Locate the informational event producer/consumer and ignorable:true. Explain alpha.1 removal and alpha.2 restoration: preserve omission-safe informational markers, not a whitelist for required events. Do not claim arbitrary Session.append supports writing the marker.
- [host-services] (10pt) Locate apiProxy usage and its removal. Distinguish Host domain-service injection (llm/listProviders) from Web Client Remote; do not prescribe a nonexistent Host remote service.
- [host-path] (10pt) Locate the fixed homedir/.dsh/profiles/default path and explain using runtime DSH_HOME/profile information. Do not claim --profile was introduced in alpha.1.
- [ui] (10pt) Locate both the private SessionView import and command registration and explain public owner/seam verification after the split.
- [channel] (10pt) Locate the private loopback HTTP server. Explain that loopback does not bypass auth requirements and distinguish host-managed authenticated channels from raw routes.
- [subprocess] (10pt) Locate dsh subprocess calls and stdout JSON.parse. Explain stdout final text vs stderr progress, and that the JSONL assumption was already wrong, rather than inventing an alpha.2 stdout change.
- [mapping] (20pt) Map actual located couplings to A1-01, A1-02+A2-01, A1-03, A1-04, A1-08; A1-05 is a valid additional stdout mapping. A bare card list earns zero. Award half only when the mappings are substantively correct but incomplete.
- [limits] (10pt) Account for all seven hit categories (there are no no-hit categories here), state the scan limits, and propose target-version build/typecheck, isolated boot and a functional path. Never require actually executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S1-static-scan/touchpoint-report.md

# Static touchpoint inspection — legacy-plugin

## Scope and evidence

Read-only inspection completed under BENCHMARK-AUTH-v1. No fixture code, package script, patch application, installation, migration, host process, verifier, or grading command was executed. Only this report was written. The supplied plugin-upgrade SKILL.md was read and applied in inspection mode; the task's prior authorization covers report writing without another confirmation.

The complete six-file fixture was inspected, including hidden-file enumeration: `package.json:1–9`, `cordis.patch.yml:1–6`, `patch.yml:1–6`, `README.md:1–16`, `scripts/apply-patch.mjs:1–19`, and `src/index.ts:1–68`. All file/line references below are relative to `fixture/`. Findings rely on the actual source/configuration, not merely the README's labels.

Identity: copied, static, non-installable fixture, package `legacy-plugin`, own version `0.1.1`, private ESM (`package.json:2–5`). Its own version is not proof of the host version. No dependency/peer/engine declarations, lockfile, standard manifest, build/test configuration, or fixture-local repository rules were present. Installation identity, resolved DSH/Node versions, runtime topology, source URL/SHA, and git state are not established by this copy; parent repository inspection is outside scope.

Requested corridor, based on reference metadata: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`. Only those two edges apply; the rc.1→rc.2 and later alpha.3+ changes are outside this corridor. Card shorthand below expands to `DSH-0.1.2-<ID>`. References are the supplied `references/README.md`, `pre-flight.md`, `v0.1.2-alpha.1.md`, `v0.1.2-alpha.2.md`, and the alpha.2 API migration ledger. No external source fetch was performed; cards are curated evidence, not a full target-source diff.

## Completed: all seven touchpoints hit

| Category | Hit | Files and lines | Concrete coupling and applicable cards |
|---|---|---|---|
| #1 Source patch | Yes | `cordis.patch.yml:5–6`; `patch.yml:2–6`; `scripts/apply-patch.mjs:5–9`; `package.json:7` | Explicit patch.yml declaration replaces host `src/session/view/SessionView.ts`'s `renderSessionView` with `renderSessionViewPatched`; helper requires `DSH_HARNESS_SOURCE_ROOT` and reads the patch. **A1-03**: session-view internals split; target and replacement anchor need revalidation. |
| #2 Events | Yes | `src/index.ts:15–22` | Producer emits external `legacy/informational-note` with `ignorable: true`, and observer logs `session/event` event.type. **A2-01** is the final target mapping; **A1-02** is the intermediate removal explicitly reversed by A2-01. |
| #3 Service / Remote | Yes | `src/index.ts:25–32` | Two `ctx.get('apiProxy')` lookups and `invoke('session.rename', {id,title})` / `invoke('llm.providers')`. **A1-01** removes the Host APIProxy. **A2-02** is conditional follow-through if these calls move to a Web Client Remote consumer; there is no existing Remote error branch to fix in this fixture. |
| #4 Host directory | Yes | `src/index.ts:5–7,35–37` | `homedir()` → `.dsh/profiles/default` → synchronous write of `legacy-note.txt`. **A1-04**: runtime DSH_HOME and selected profile must govern location rather than a hardcoded home/profile. |
| #5 UI / commands / tools | Yes | `src/index.ts:10,41–43` | Private `@deepseek-ai/dsh-session-view/internal` import, `ctx.contributes.registerCommand('legacy.openView', ...)`, and `new SessionView({enhanced:true})`. **A1-03**: private UI/module and registration coupling affected by decomposition. No actual tool registration was found. |
| #6 Custom channel | Yes, dormant code | `src/index.ts:4,47–54` | Raw createServer, constant response, fixed port 43121 on 127.0.0.1, comment naming `/api/legacy`. **A1-08**: custom channel bypasses Connection authentication and Host/Origin fences. |
| #7 Subprocess / output | Yes | `src/index.ts:8,57–65`; `scripts/apply-patch.mjs:3,11–18`; entry script `package.json:7` | spawn and execFileSync invoke `dsh --profile headless <task>`, then parse stdout as JSONL/final events. **A1-05**: stdout remains final text; stderr gains reasoning. **A1-04** also informs the profile/cwd/environment audit, but no removed demo bin is used. |

### #1 — source-patch ownership and unresolved replacement

`cordis.patch.yml` is a composition overlay by default (API-08). This is a genuine #1 hit because its explicit `patch: [patch.yml]` connects to a concrete host target and source replacement, not because its filename contains “patch.” The helper only reads/logs patch.yml and checks the environment variable; its name/log message do not prove it actually applies any replacement. It must not be run.

A1-03 requires mapping the exact old target and render function to the target tag's owning module. The target host checkout/artifact is not supplied, so the replacement location/public extension point is pending confirmation; no new path is guessed. `readFileSync('patch.yml')` is also cwd-sensitive. `DSH_HARNESS_SOURCE_ROOT` is a source-root coupling, not evidence of reading DSH_HOME.

### #2 — fold to the final event state

A1-02 temporarily removes retention of `SessionEvent.ignorable` in alpha.1. A2-01 restores it in alpha.2. Therefore retain the informational producer's `ignorable: true`; do not delete and re-add the marker or apply the alpha.1-only instruction to stop writing as the final alpha.2 conclusion.

The marker means an older reader may omit the event's informational semantics without damaging reconstruction. It is not permission to drop the event in persistence/transport or to whitelist unknown required events at the observer. Preserve it through envelope, persistence, reload, and transport; unknown unmarked required events must still fail closed. `ctx.on` here only logs event.type; no filtering consumer or persistence implementation is shown.

The code is a static producer illustration. `ctx.emit('session/event', ...)` does not prove real persistence or a supported public append seam. As API-05/A2-01 explain, alpha.2 public `Session.append` cannot set ignorable; do not invent a cast-based append solution. Establish a supported producer/envelope seam, or use a plugin-owned sidecar/store where appropriate. SQLite schema compatibility is not a direct fixture hit because no SQLite persistence code/configuration exists.

### #3 — distinguish Host from Web Client

The activation file imports Node filesystem, HTTP, and subprocess APIs, so it is Host-oriented despite mixing a private UI import into the same static example. A1-01 is a direct hit even for an ordinary server plugin because it actually consumes apiProxy. Do not mechanically inject Client-only `remote` into this Host activation: use the owning domain service and verify its exact target API. The supplied ledger confirms Host `llm` / `ctx.llm.listProviders()` as a seam; the exact Host session-title mutation and its argument contract remain pending target-source verification.

If the relevant operation is moved into a separate Web Client face, the mapped projections are `ctx.remote.session.rename({sessionId, title})` (not sessionTitle.rename), and `ctx.remote.llm.listProviders()` plus `listConfigurableProviders()` for the old combined provider directory. Declare the real remote namespace injections and combine provider results by id as needed. This is face-specific guidance, not an instruction to import host-internal packages into an ordinary plugin.

Conditional A2-02 acceptance: Remote unary calls already returned RemoteResult before alpha.2. Handle `result.ok`; alpha.2 changes error instances and namespaced codes. Cancellation (`gateway/cancelled`) terminates/propagates; preserve code/details for internal or unknown failures without automatic retries. No old error-code strings, stream failure classes, host.describe, pluginInventory, settings helper, session snapshots, or subagent descriptor use appear here, so their separate cards are not direct hits.

### #4 — trace the full write destination

The file write uses the OS user's home and literal profile `default`, ignoring DSH_HOME overrides and the actual selected profile. The only written name is `legacy-note.txt`; neither the target profile directory's existence nor ownership is checked. A1-04 applies to fixed profile-path coupling, not a claim that alpha.1 introduced --profile or removed a profile named default. A future migration should resolve the runtime host/profile location explicitly and test relocated home/non-default profile cases. No settings contents, home directories, credentials, or session logs were opened during this scan.

### #5 — private UI dependency remains unresolved

A1-03 covers the private SessionView import, construction, and associated contribution. The source does not establish a replacement command/slot registration contract. Confirm target owning exports and packed JS/types (API-07), then use a maintained public seam if available. Do not prescribe an invented replacement import. No `ctx.commands.execute`, removed dsh-client-runtime, useChat/useSession selector, MarkdownText, localization registration, or __ModuleLoader__ identity mismatch is evidenced. In particular, `registerCommand` alone does not justify applying the command-execute argument migration. The overlay name already agrees with package.json name (`legacy-plugin`); no client bundle declaration exists to prove runtime mounting.

### #6 — dormant but concrete authentication coupling

`startLegacyBridge` is never invoked (`void startLegacyBridge` merely references it), so no listening server was observed or started. If activated, it responds to every request rather than actually routing only `/api/legacy`; that path appears only in a comment. There is no cookie/token validation, Host/Origin check, CORS/TLS policy, listen-error handling, port lifecycle policy, or teardown/disposer in this code.

A1-08 requires the Connection auth gate or a correctly gated equivalent while preserving the channel protocol. Loopback binding is not authentication. A future integration should use the Connection-owned seam or call its request rejection gate as appropriate; raw custom web-server routes do not inherit these protections automatically. Bootstrap token redemption occurs on GET /?token=..., yielding an authority-bound cookie; do not send the token in /api URLs or Authorization. Validate unauthenticated 401, wrong Host/Origin 403, authenticated success, and server disposal. No DOM/CSS, WebSocket, or composer manipulation is present, so A1-28 is not a hit.

### #7 — separate pre-existing parsing defects from corridor change

Both argv arrays already have the supported shape: `['--profile', 'headless', prompt]` or `['--profile', 'headless', 'ping']`. Neither uses a removed standalone demo command. Neither specifies cwd/env, so they inherit the parent environment/current directory and executable resolution; runtime DSH_HOME/profile identity is unverified.

A1-05 does not announce a switch from JSONL to text: rc.2 stdout was already final assistant text. The JSON.parse expectations are pre-existing defects exposed by the static scan. Alpha.1 adds `dsh: reasoning:` on stderr; nonempty stderr alone does not mean failure. Keep stdout and stderr separate and judge completion using exit status plus termination/cancellation state.

The async wrapper parses arbitrary Buffer chunks as JSON, has no line buffering (even a hypothetical JSONL stream could split/coalesce), ignores stderr and spawn errors, and resolves on close without inspecting code/signal. It has no cancellation/child teardown. The synchronous wrapper splits stdout into lines then parses each as an event; execFileSync will throw on launch/nonzero failure, but no structured error/cancellation handling is provided. Options specify only UTF-8 encoding. A future wrapper must collect plain stdout text, concurrently drain/control stderr, handle spawn/nonzero/abort/signal paths, and release resources. There is no Node-version workaround or dsh web launcher here, so A2-04 is not a direct hit; there is no platform shell workaround to justify A1-13 cleanup.

## Skipped / negative evidence

There are **no no-hit categories among #1–#7**; each has direct evidence above. Within those categories, the explicit exclusions above come from reading all six files, including package/config/script surfaces, not just pattern matching. Configuration contains no PTC/code-mode values or dispatch names (A1-06); no preset roots/resolveSessionPreset (A1-21); no platform workaround (A1-13); no custom tool package/sessionProjections composition (A2-08); no direct pi-ai dependency (A1-24). There is no lockfile/dependency graph to verify peer pruning (A2-03), nor evidence of deployment telemetry configuration to assign privacy defaults as source collisions.

“No detected coupling” cannot prove compatibility: this copy is intentionally incomplete, `ctx: any` hides API contracts, transitive dependencies and dynamic mounting are absent, and the change cards are curated rather than exhaustive. The real plugin will need dependency/import/configuration review, target build/typecheck, packed-artifact checks, a real profile mount, and functional smoke tests. None of these passes is claimed here.

## Pending / validation / rollback

Pre-existing baseline: mechanical tests not collected because the fixture is static and explicitly non-executable. Known pre-existing source concerns include headless JSONL parsing and unmanaged process/channel lifecycle; these must not be attributed wholesale to the new host version.

Static report is complete. Migration remains pending: exact SessionView replacement/public seam, Host session rename service signature, real event persistence seam, runtime identities, and actual target packaging. These are limitations of a static copy, not blockers to this inspection.

Future validation on a separate real plugin checkout should cover source-patch target resolution; event marker round-trip and unknown-required rejection; service success/failure/cancellation; relocated DSH_HOME and selected profile; UI registration/mount; channel auth and teardown; and wrapper text/reasoning/empty output/nonzero/spawn-error/cancellation cases. Do not execute this fixture to obtain those checks.

Rollback: no source/configuration/dependency changes were made, so no fixture rollback is needed. The report is the only authored artifact; fixture file hashes were compared immediately before and after report creation to confirm no mutation by that operation. No claim is made about an unobserved upstream git baseline. The skill was read only, and no external service or credential access occurred.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.