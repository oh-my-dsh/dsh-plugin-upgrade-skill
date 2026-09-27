# S1 static touchpoint inspection

## Scope and conclusion

Target corridor: dsh 0.1.1-rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2. The fixture package labels itself 0.1.1, but that is a plugin version, not proof of an installed Host version. This report uses the corridor expressly requested in the task.

**All seven touchpoint categories hit.** These are source-level coupling findings, not executed failures or proof that this deliberately non-installable fixture ever worked. No fixture code, patch script, migration, installation, server, or subprocess was executed. No benchmark repository file was written or changed. The report is the sole output.

Fixture root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S1-static-scan/environment/fixture

All six fixture files were read in full; references below are relative to that root and line numbers are 1-based:

- package.json:1–9 — metadata and apply-patch script.
- cordis.patch.yml:1–6 — composition and patch declaration.
- patch.yml:1–6 — literal source replacement surface.
- scripts/apply-patch.mjs:1–19 — patch-surface reader and headless wrapper.
- src/index.ts:1–68 — all imports, event producer/listener, service calls, filesystem operation, UI registration, dormant channel, and subprocess wrapper.
- README.md:1–16 — static-only status and intent; findings were checked against source, not inferred solely from its table.

Local change-card evidence consulted (no external services):

- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/v0.1.2-alpha.1.md
- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/v0.1.2-alpha.2.md
- E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references/v0.1.1-rc.2.md — baseline context only; its rc.1 → rc.2 image changes precede the requested corridor.

Card abbreviations A1-NN and A2-NN mean DSH-0.1.2-A1-NN and DSH-0.1.2-A2-NN respectively. The card collections explicitly provide curated coverage, not a complete API diff.

## Findings by touchpoint

| Category | Hit? | Exact evidence | Concrete coupling and card mapping |
|---|---|---|---|
| #1 Source patch | Yes | cordis.patch.yml:5–6; patch.yml:3–6; scripts/apply-patch.mjs:5–9; package.json:6–7 | Composition names patch.yml, which names src/session/view/SessionView.ts and the literal export function renderSessionView replacement. The script requires DSH_HARNESS_SOURCE_ROOT and reads the surface. **A1-03**: Session-view decomposition invalidates assumptions about internal source paths, symbols, and patch targets. |
| #2 Internal/persisted events | Yes | src/index.ts:13–22, especially :15–19 | Producer emits the unknown external informational event legacy/informational-note with ignorable: true; a listener observes session/event and logs its type. **A2-01 is the final-state mapping**, with **A1-02 folded as a superseded intermediate removal**. The producer/persistence/reload retention obligation remains; this is not an instruction to remove the marker. |
| #3 Internal service / Remote | Yes | src/index.ts:24–32, specifically :26–27 and :30–31 | ctx.get('apiProxy') followed by invoke('session.rename', { id, title }) and invoke('llm.providers') uses the removed Host facade. **A1-01** is a direct hit. **A2-02** is a conditional follow-on for any resulting Client Remote/error-handling implementation, not evidence that existing source already handles Remote errors. |
| #4 Host directory | Yes | src/index.ts:5–7, :34–38 | join(homedir(), '.dsh', 'profiles', 'default') and writeFileSync(...'legacy-note.txt') assume both the default DSH home and active profile. **A1-04**: profile/launcher consolidation requires runtime DSH_HOME and selected-profile resolution rather than fixed user directories. scripts/apply-patch.mjs:5–6 additionally assumes a supplied source-root environment variable; its primary mapping is A1-03, not a claim that this variable was removed. |
| #5 Internal UI / commands / tools | Yes | src/index.ts:9–10, :40–43 | Private @deepseek-ai/dsh-session-view/internal import, ctx.contributes.registerCommand('legacy.openView', ...), and new SessionView({ enhanced: true }) depend on the internal view/registration surface. **A1-03**. Other ctx.register callbacks appear at :25, :29, :35, :57; their domain bodies map to #3/#4/#7. The fixture does not establish a public tool schema or supported registration API. |
| #6 Custom channel | Yes, dormant source | src/index.ts:4, :45–54, especially :48–51 | Node createServer responds directly and listens on 127.0.0.1:43121; the comment labels http://localhost:43121/api/legacy. **A1-08**: a private loopback server bypasses Connection-owned authentication and request fences. The handler does not actually dispatch on /api/legacy: it responds to every path. void startLegacyBridge does not call it, so this is a static hit, not an observed listening endpoint. |
| #7 Subprocess / output parsing | Yes | src/index.ts:8, :56–67; scripts/apply-patch.mjs:3, :11–19; package.json:7 | Both spawn and execFileSync run dsh --profile headless, then JSON.parse stdout and look for event.type === 'final' and event.text. **A1-05** directly applies. **A1-04** is launcher/profile context only: these calls already use the retained official launcher, and neither removed demo bin is present. |

### #1 and #5: source and UI coupling

A1-03 covers both the literal source patch target and private SessionView import/command construction. The patch surface must be checked against exact alpha.2 source ownership before any future migration; this scan does not invent replacement paths, constructors, or registration signatures. A stable public UI seam, if available, is preferable to moving the same private coupling to a guessed module.

The supplied apply-patch script only checks that DSH_HARNESS_SOURCE_ROOT exists and reads/logs patch.yml; it does not use that root to apply the declared replacement. Thus the declaration is a definite patch touchpoint, but successful patch application is not demonstrated. Profile composition, the patch declaration, package metadata, and resolved Host configuration are different artifacts.

### #2: corridor folding and event semantics

A1-02 removed ignorable retention in alpha.1; A2-01 restores it in alpha.2. Therefore, for this target, **keep ignorable: true on genuinely informational external events and preserve it across envelope, persistence, reload, and transport**. Do not prescribe deleting and restoring it, disabling this event solely because of the intermediate release, or adding a consumer whitelist that accepts unknown required events.

The marker means an older reader may omit the event's semantics when reconstruction remains correct. It does not mean a consumer should filter the event out of loaded history: marked events remain in loaded events after reload; unknown unmarked events remain required-on-read and must be rejected by readers that do not understand them. The listener at :20–22 only logs event.type; it is not a marker filter.

The source expresses producer intent through ctx.emit, but provides no implemented persistence seam. It does not prove an actual durable append or field retention. A2-01 explicitly notes that public live Session.append(...) has no ignorable parameter: a future implementation must identify a supported producer/persistence seam, or record a capability gap rather than cast/fake that parameter. SQLite schema 20 versus rejected schema 19 is a conditional deployment concern in the card, not a proven fixture database hit; no database/provider configuration is present.

### #3: preserve Host versus Client ownership

The file imports Node filesystem, HTTP, and child-process modules and describes the calls as Host APIProxy calls. Replacing apiProxy with a Host injection named remote would not be a valid migration. Host consumers should inject the target domain services behind the removed facade, after checking exact alpha.2 declarations and required authority. The package has no dsh.client entry, so browser activation is not established.

If the UI is separated into an actual Client plugin, A1-01's generated Remote mappings are:

- session.rename → session/rename, exposed as ctx.remote.session.rename; not sessionTitle/rename.
- llm.providers → llm/listProviders plus llm/listConfigurableProviders; preserve the two-result semantics instead of assuming a one-call rename.

For that Client path, A2-02 governs RemoteError and namespaced error codes. Unary Remote calls already used RemoteResult before alpha.2; alpha.2 did not newly change ordinary calls into throwing promises. Handle result.ok/value versus result.error; examples of target codes are gateway/cancelled and session/not-found. Do not classify ordinary business failures by parsing Error.message or cross-realm instanceof. No current RemoteResult branch, old error-code string, or removed Remote error-type import appears in the fixture, so A2-02 is migration-dependent rather than an independent existing-code hit.

### #4: resolve the actual Host location

A1-04 does not imply that every ~/.dsh installation stops working; it makes the hardcoded assumption unsafe for overridden DSH_HOME or a non-default selected profile. Determine the runtime home and selected profile from the supported Host configuration rather than the OS user's home. Do not substitute Client ctx.remote.$host into Node-side code. A2-06 introduces Client Host facts, but no host.describe or Client $host consumer exists here, so it is not a direct additional hit.

### #6: custom channel authentication

A1-08 requires Connection-owned authentication or explicit equivalent integration for custom carriers. Loopback binding alone does not make the server inherit the Host Gateway's authentication, Host/Origin fence, CORS, or TLS. Prefer a supported Connection-owned seam; a raw custom route needs the documented rejection gate rather than an assumption that registration protects it.

The process-scoped bootstrap token is redeemed at GET /?token=... for an authority-bound signed HttpOnly/SameSite cookie and a 303 redirect. It is reusable within the same process and rotates on process restart, not strictly single-use. Do not pass that token in /api URLs, WebSocket URLs, or Authorization headers. Future acceptance must distinguish missing/bad-cookie 401, wrong Host/Origin 403, and authenticated access. No network tests were run here.

### #7: stdout was never JSONL

A1-05 states that rc.2 headless stdout was already the final assistant text. Alpha.1 adds a dsh: reasoning: segment on stderr; it does not change stdout from JSONL to text. Both wrappers contain a pre-existing incorrect assumption that still fails at the target. The async wrapper additionally treats arbitrary data chunks as complete JSON objects and resolves on close without inspecting the exit code. The synchronous wrapper splits text into lines and parses each as JSON; execFileSync's nonzero-exit behavior does not repair its success-output parser.

A future wrapper should collect final text from stdout, handle reasoning/diagnostics separately on stderr, and use exit status (0 completion; 1 failure/abort/no completed turn) rather than stderr presence to classify outcome. Cover plain-text success, empty final text, reasoning, launch errors, and nonzero exit. Do not claim the retained dsh --profile headless command itself was removed, or that switching launchers alone fixes either parser.

## No-hit evidence and limits

There are **no no-hit categories** among #1–#7, so there is no category-level negative finding to manufacture. The complete six-file inventory above is the scope for every category. Within that scope, the following narrower surfaces were ruled out as direct observed couplings:

- No dsh-acp-demo/dsh-jsonrpc-agent launcher, removed SDK demo package, or ACP/SDK wrapper; A1-04 is directly relevant to the hardcoded profile path, not proof of a removed binary in #7.
- No tools.mode: code, Code Mode/PTC dispatch registration, PTC preset, or renamed dispatch type; no A1-06 hit.
- No read_image wrapper, image attachment schema, provider upload adapter, or image serialization. The rc.2 image cards are neither direct findings nor changes inside this corridor.
- No ctx.remote, host.describe, Client $host subscription, old Remote failure code, or removed error-class import; A2-02 remains a follow-on and A2-06 is not a direct hit.
- No WebFetch approval policy, settingsNamespace import, userQuestions.registerProvider, explicit session-projection-dependent composition, or listed peers/dependencies establishing those corresponding cards as direct hits.
- No actual custom WebSocket/RPC implementation, route path matcher, persistence adapter, SQLite store, lockfile, dependency graph, or test suite appears in the fixture. The raw HTTP source and informational producer intent still count as hits.

**No hit does not mean no problem.** This static fixture lacks an installed dependency graph, resolved profile, exact target source checkout, generated API declarations, runtime service inventory, and executable tests. Dynamic registrations, indirect dependencies, externally supplied configuration, installation ownership, and behavior omitted from curated cards can introduce further incompatibilities. Absence in this small copy is not a compatibility certification for the original plugin or a real deployment.

## Verification status and remaining work

Completed: full instruction read; complete read-only six-file fixture inspection; exact file/line evidence; seven-category classification; corridor card mapping with the final ignorable restoration; report production.

Not performed: compilation, installation, patch composition, Host/client activation, migration, persistence/reload tests, HTTP authentication tests, or subprocess runs. The fixture explicitly forbids execution and is intentionally non-installable. Exact replacement paths and public registration/producer APIs remain unverified. There is no blocker to this requested static report; runtime compatibility and migration acceptance remain outside its evidence.
