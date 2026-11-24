# JUDGE BRIEF · noskill.S1-static-scan

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

# S1 static touchpoint inspection

Scope: supplied legacy fixture; requested corridor 0.1.1-rc.2 to 0.1.2-alpha.2. All locations below are relative to `fixture/`, with one-based line numbers.

**Result: all seven categories hit.** A hit identifies coupling, not necessarily a breaking change. The event marker is specifically a restored target contract, not a target removal. Exact change-card mapping remains blocked: neither the solver instruction nor any of the six fixture files supplies the corridor's cards or an ID-to-change index. No card IDs are invented here. Semantic mapping candidates below are descriptions, not purported card titles or verified references.

## Evidence and scan coverage

Read every line of every supplied file, including hidden-file enumeration: `README.md` (1–16), `package.json` (1–9), `cordis.patch.yml` (1–6), `patch.yml` (1–6), `scripts/apply-patch.mjs` (1–19), and `src/index.ts` (1–68). No additional fixture files were found. The README's touchpoint table corroborates the source but was not used as a substitute for inspecting it. The package's version is the plugin version, not proof of an installed dsh version; no dependency manifest pins dsh here.

Only the task instruction and fixture were read. No skills, external documentation, sibling artifacts, reference answers, tests, validators, credentials, memories, or network sources were accessed. No fixture code, patch command, installation, migration, compilation, or runtime test was executed. This is intentionally a static, non-installable fixture.

## #1 Source patch — HIT

- `cordis.patch.yml:2–6`: profile/plugin composition declares a `patch` list containing `patch.yml`.
- `patch.yml:3–6`: exact source-file target `src/session/view/SessionView.ts`; exact text match `export function renderSessionView`; replacement renames it to `renderSessionViewPatched`.
- `scripts/apply-patch.mjs:5–9`: requires `DSH_HARNESS_SOURCE_ROOT`, reads relative `patch.yml`, and logs it. `package.json:6–7` exposes the script through `apply-patch`.

Concrete coupling: profile patch composition, a private source layout, an exact exported declaration, an environment-variable requirement, and current-working-directory-relative patch loading. Moving the source file or changing its declaration can invalidate this patch. The target source file itself is not present, so target patch applicability is unverified. Despite the script name, its supplied implementation only reads/logs the patch; it does not apply replacements or use the source-root value after checking it.

Semantic card mapping pending: source/UI decomposition affecting SessionView source and exports; any corridor change to patch/profile loading must be checked against actual cards. No evidence permits assigning an exact card ID or claiming that the patch mechanism itself changed.

## #2 Internal/persistent events — HIT, with final-state folding

- `src/index.ts:13–19`: external informational durable-event producer calls `ctx.emit('session/event', ...)` with `type: 'legacy/informational-note'`, `ignorable: true`, and `payload.text`.
- `src/index.ts:20–22`: listener subscribes to `session/event`, treats input as `SessionEvent`, and reads `event.type`.

Concrete coupling: event topic, durable-event producer contract, external event type, marker serialization/persistence, and consumer shape. The fixture explicitly states at line 14 that alpha.1 removed the ignorable marker and alpha.2 restored its producer/persistence contract. Fold the corridor to its final target state: retain the marker in this informational producer; do not list its absence in alpha.1 as a required alpha.2 migration or delete it solely on that basis. This is still a touchpoint requiring verification of target typing and persistence behavior. The listener only logs the type; the fixture does not show a replay engine, exhaustive event dispatcher, or actual persistence implementation.

Semantic card mapping pending: the alpha.2 restoration of the external informational SessionEvent `ignorable` producer/persistence contract, with the alpha.1 removal treated as superseded for the target. The exact restoration and predecessor card IDs are unavailable. Compatibility is supported by the fixture comment, not independently verified target source.

## #3 Service/Remote — HIT

- `src/index.ts:24–28`: `rename-session` retrieves `ctx.get('apiProxy')` and invokes `session.rename` with `{ id, title }`.
- `src/index.ts:29–32`: `list-providers` retrieves the same service and invokes `llm.providers` with no explicit arguments.

Concrete coupling: service key, asynchronous lookup, generic `invoke` interface, two remote method names, their parameters, and return values. Both methods need individual target-contract inspection; confirming one does not validate the other. No imported Remote type or replacement service is supplied.

Semantic card mapping pending: legacy Host APIProxy/service-to-Remote API changes for session rename and LLM provider discovery. The fixture identifies these as legacy calls but contains no target signatures, replacement names, or card IDs. A precise migration prescription would be speculative.

## #4 Host directory — HIT

- `src/index.ts:5–7`: home/path/filesystem dependencies.
- `src/index.ts:34–38`: `write-note` builds `join(homedir(), '.dsh', 'profiles', 'default')` and writes `legacy-note.txt` there.

Concrete coupling: fixed home-level `.dsh` root, `profiles` layout, literal `default` profile, and writable preexisting directory. This bypasses whatever active-profile/path resolution the host exposes. A different active profile or a changed target directory layout can select the wrong destination or fail. No directory creation or path override appears.

Semantic card mapping pending: Host data/profile directory layout or profile path resolution changes. The exact target location and corresponding card ID cannot be established from this fixture.

## #5 UI/commands/tools — HIT

- `src/index.ts:9–10`: private import `@deepseek-ai/dsh-session-view/internal`; the accompanying comment explicitly associates this path with removal through UI decomposition.
- `src/index.ts:40–43`: `ctx.contributes.registerCommand('legacy.openView', ...)` returns `new SessionView({ enhanced: true })`.
- Related command-like registrations: `src/index.ts:25`, `29`, `35`, `57` use `ctx.register`; their domain dependencies are reported in #3, #4, and #7.

Concrete coupling: internal UI package entry point, SessionView constructor and option, command contribution API, and assumed ability for a command to return an instantiated internal view. The source-patch surface in #1 overlaps the UI decomposition risk. There is no explicit tool schema or tool registration in any supplied file; do not turn a UI/command hit into an invented tool-API hit.

Semantic card mapping pending: Host/Web Client UI decomposition and relevant command contribution changes. Removal of the private path is asserted by the fixture comment; exact replacement UI APIs and card IDs are absent. No independent evidence establishes that `enhanced` or `registerCommand` was specifically removed.

## #6 Custom channel — HIT, statically dormant

- `src/index.ts:4`, `45–54`: defines `startLegacyBridge`, creates a raw Node HTTP server, responds with `legacy`, and listens on `127.0.0.1:43121`.
- `src/index.ts:51` documents `http://localhost:43121/api/legacy` in a comment.

Concrete coupling: private loopback transport and fixed port, independent of the Host Gateway authentication model identified at line 45. The callback ignores the request and contains no routing or authentication. `/api/legacy` is a documented example URL, not an implemented route check; the server would answer any path if started. `void startLegacyBridge` references the function without calling it, so this source does not launch the bridge. This is a latent integration touchpoint, not evidence of a running endpoint or exploited vulnerability.

Semantic card mapping pending: Host Gateway/custom-channel authentication and transport integration. Exact authentication protocol, supported channel API, and card IDs are not supplied.

## #7 Subprocess/output parsing — HIT in two implementations

- `src/index.ts:8`, `56–67`: spawns `dsh --profile headless <prompt>`, applies `JSON.parse` directly to each stdout data chunk, expects `{ type: 'final', text }`, and resolves its accumulated text when the child closes.
- `scripts/apply-patch.mjs:3`, `11–19`: synchronously runs `dsh --profile headless ping`, splits stdout by newline, parses every nonblank line as JSON, and expects the same final-event envelope.
- `package.json:7` provides the script invocation entry point.

Concrete coupling: executable discovery, CLI arguments/profile naming, stdout format, and final-result semantics. The script comment at line 11 states that target headless stdout is final text, not JSONL. Both parsers therefore assume the wrong target output contract. Treat stdout according to the target's final-text contract rather than requiring a `final` JSON event; verify stderr and exit status separately against target documentation before implementing changes.

An additional code-local issue: Node stdout data chunks are not guaranteed to be whole JSON records, so the asynchronous parser also lacks buffering even under a hypothetical JSONL protocol. It has no spawn-error handling, does not inspect the close exit code, and does not explicitly consume stderr. These are observations, not independently identified corridor change cards. The synchronous variant does line splitting, but its JSONL assumption still conflicts with the stated final-text contract.

Semantic card mapping pending: headless CLI stdout final-text/output contract change. Its exact card ID and other CLI/exit-status changes are unavailable.

## Negative findings and limits

There are no entire touchpoint categories without hits, so no category-level negative row is applicable. Across all six files, the scan found no explicit tool registration, no explicit Remote import, no replay/storage implementation, no actual patch application, and no invocation of the bridge function. These limited negatives do not establish compatibility: actual dsh source, runtime composition, external configuration, dependencies, generated files, and target contract definitions are absent. Static fixtures cannot establish runtime event persistence, channel authentication correctness, patch applicability, or successful subprocess behavior.

## Outstanding evidence

The requested exact card-by-card mapping cannot be completed from the permitted evidence. An authoritative corridor card catalog is required to replace each semantic mapping above with verified IDs and to distinguish changes that are separate cards from changes sharing a card. No confirmation is needed to perform this scan; the blocker is missing admissible reference material. The scan itself is complete, but the exact-ID requirement remains unresolved.

## Read-only verification

Only this report directory was created/written. SHA-256 hashes were recorded after the read-only inspection and rechecked after report generation; the six fixture files remained byte-identical across those checks. No initial Git-baseline comparison was performed because repository metadata and reference material were outside this task's permitted reading scope.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.