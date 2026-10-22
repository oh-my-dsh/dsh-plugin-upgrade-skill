# Touchpoint Inspection Report · legacy-plugin fixture

- **Task**: S1 · Static Touchpoint Scan (read-only), BENCHMARK-AUTH-v1 unattended evaluation
- **Mode**: Mode A · inspect (read-only investigation and report; no writes to the target, no installs, no migrations executed)
- **Target**: `/app/fixture/` — static copy of a legacy plugin written in the dsh 0.1.1 era (`skills/plugin-upgrade/examples/legacy-plugin/` verbatim copy per its README; not installable, deliberately non-compilable)
- **Corridor (pinned by the brief)**: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2`, i.e. two card edges connected by their `from → to` frontmatter (never filename order):
  1. `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1` — references/v0.1.2-alpha.1.md, 28 curated cards, prefix `DSH-0.1.2-A1`
  2. `dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2` — references/v0.1.2-alpha.2.md, 8 curated cards, prefix `DSH-0.1.2-A2`
- **Method**: (a) 100% full-file manual read of all 6 fixture files (117 lines total); (b) regex sweep with the seven-class patterns from references/pre-flight.md (source of truth: pre-flight-patterns.json); (c) read-only `scripts/plan-migration.mjs` run against the exact corridor; (d) read-only `scripts/inject-lint.mjs` run. Raw scanner outputs + post-scan SHA-256 hashes: see `appendix-scanner-outputs.md` beside this report. Planner results are treated as heuristic input, then refined card-by-card against the actual source lines and the actual runtime face (SKILL Mode C step 3–4).
- **Read-only discipline**: no file under `/app/fixture/` was created, modified, or deleted; only read-only tools and the two documented read-only scripts ran; no git, no install, no migration, no network. All outputs (this report, the appendix) were written only under `/app/agent-output/S1-static-scan/`.

---

## 1. Source identity and configuration/dependency inventory (pre-flight step 0)

| Item | Finding |
|---|---|
| package.json | `name: legacy-plugin`, `version: 0.1.1` (the plugin's own version — **not** a DSH host version), `private: true`, `type: module`; one script `apply-patch → node scripts/apply-patch.mjs` |
| Dependencies | **None declared**: no `dependencies`, no `devDependencies`, no `peerDependencies`, no `engines`, no lockfile. Yet src/index.ts imports `@deepseek-ai/dsh-session-view/internal` — an undeclared (phantom) DSH dependency |
| DSH cohort | No declared/resolved DSH dependency cohort at all; `inject-lint` verdict `FIX-REQUIRED` with `cordisPeer: null / cordisOk: false` — the Cordis peer floor required by the alpha.2 precision checklist is absent and must be established during migration (exact, coherent alpha.2 cohort; unpublished-cohort install rules per rollup-0.1.2.md R-01) |
| Standard manifest | No `dsh-plugin.json`; no `dsh.client` declaration; no `dsh.bundle.patch` |
| Profile composition | `cordis.patch.yml`: one loader row (`id: legacy-plugin`, `name: legacy-plugin`, `config: {}`) **plus** a `patch:` key referencing `patch.yml` (lines 5–6). Per API-08 (api-migration-0.1.2-alpha.2.md), `cordis.patch.yml` is by default composition, not a source patch — but here the referenced `patch.yml` contains a real find/replace surface against host source, so this fixture genuinely carries **both** a composition row and a source-patch declaration (not a filename false positive) |
| Source patch surface | `patch.yml`: target `src/session/view/SessionView.ts`, replacement `export function renderSessionView → export function renderSessionViewPatched` |
| Install track | Static copy; not an installable plugin (per fixture README). No branch/HEAD/submodule state inspectable (git forbidden in this cell; identity taken from the brief: legacy 0.1.1-era source) |
| Runtime face | Primarily a **host-plane** Cordis server plugin shape (`activate(ctx)`, `ctx.register/emit/on/get`, node builtins). The `SessionView` internal import implies an intended Web-Client UI coupling, but there is no client bundle half (`dsh.client`) — the face itself is incoherent and must be resolved during migration |
| Corridor baseline caveat | The brief pins the corridor to rc.2 → alpha.2. If the real plugin were built against a 0.1.1 tag **older** than rc.2, the rc.8→rc.1→rc.2 segment (v0.1.1-rc.1.md, v0.1.1-rc.2.md) would be an additional edge to read first; it is out of scope for this pinned corridor and noted only as a boundary |

Ghost-host check (pre-flight 1.5) is not applicable: there is no running host process and no checkout in this static cell; the corridor `from` is pinned by the brief, not derived from disk.

---

## 2. Touchpoint summary (pre-flight template)

## Touchpoint checkup (legacy-plugin fixture, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card(s) — net corridor state | Confidence note |
|---|---:|---|---|---|
| #1 source patch | **YES** | cordis.patch.yml:5–6; patch.yml:2–6; scripts/apply-patch.mjs:1–9 | **DSH-0.1.2-A1-03** (+ API-08 classification) | High — explicit find/replace surface on a session-view host path; target path falls inside the alpha.1 session-view split |
| #2 events | **YES** | src/index.ts:15–19 (producer), 20–22 (observer) | **DSH-0.1.2-A1-02 folded into DSH-0.1.2-A2-01** (net: marker retained; + API-05 write-surface gap) | High — external informational persisted SessionEvent with `ignorable: true`; this is the exact corridor-folding case (see §4) |
| #3 service/Remote | **YES** | src/index.ts:25–28, 29–32 | **DSH-0.1.2-A1-01** (+ API-01 face rule; A2-02 only if a client-plane Remote is adopted) | High — weak `ctx.get('apiProxy')` + `invoke('session.rename')` + `invoke('llm.providers')`; apiProxy package/service deleted in alpha.1 |
| #4 host filesystem | **YES** | src/index.ts:35–38 | **DSH-0.1.2-A1-04** | High — hard-coded `~/.dsh/profiles/default` + `writeFileSync` into it |
| #5 UI/commands/tools | **YES** | src/index.ts:10 (internal import), 41–43 (registerCommand + construction) | **DSH-0.1.2-A1-03** (+ API-07 for the `/internal` deep subpath) | High — `@deepseek-ai/dsh-session-view/internal` is exactly the split-up internal surface |
| #6 custom channel | **YES** | src/index.ts:45–54 | **DSH-0.1.2-A1-08** | High as shipped code — loopback HTTP server on fixed port bypassing the Host Gateway auth model; note it is never invoked (`void startLegacyBridge` at :54), so today it is dormant coupling, not a live listener |
| #7 subprocess/output | **YES** | src/index.ts:56–67; scripts/apply-patch.mjs:11–19 | **DSH-0.1.2-A1-05** (+ API-06 contract; DSH-0.1.2-A1-04 as context) | High — both sites parse `dsh --profile headless` stdout as JSONL; stdout was never JSONL (already final text in rc.2) and alpha.1 adds `dsh: reasoning:` on stderr |

**All seven classes hit.** No category is empty, so requirement 3 is answered at card/pattern level in §5 (what was scanned, what was ruled out inside each class, and why even a full hit list is not proof of completeness).

---

## 3. Per-touchpoint detail: coupling points and card mapping

### #1 Source patch / monkey patch — HIT

**Hit locations and coupling points**
- `cordis.patch.yml:5–6` — the loader row carries `patch: [patch.yml]`: a source-patch declaration riding on the profile composition row.
- `patch.yml:2–6` — the patch surface itself: `target: src/session/view/SessionView.ts`, `find: export function renderSessionView` → `replace: export function renderSessionViewPatched`. Coupling: an exact host-source file path plus an exact exported-symbol name in the host's session-view module.
- `scripts/apply-patch.mjs:5–6` — requires env `DSH_HARNESS_SOURCE_ROOT` (points the patcher at a host source checkout); `:8` reads `patch.yml`; `:9` logs the surface. Coupling: the application mechanism assumes a host source tree layout.

**Card mapping**
- **DSH-0.1.2-A1-03** (breaking, required-if-hit; touchpoints #1, #5): alpha.1 split the session-view internals extensively, so patch target paths and internal registration points no longer exist as before. Net action for this fixture: the target `src/session/view/SessionView.ts` and symbol `renderSessionView` must be re-verified one-by-one against an exact-tag compare of `dsh-v0.1.2-alpha.2`; if no equivalent owning module/public seam exists, mark **pending confirmation** — do not guess a new path. Verification per card: run a patch-surface composition against the target tag source; every old target must map to a target-version file or carry an explicit removal reason. The card's field note (dsh-tui) prescribes pointing `DSH_HARNESS_SOURCE_ROOT` at the **target** tag and validating each patch-surface path by composition — directly applicable to apply-patch.mjs.
- **API-08** (ledger, classification aid): `cordis.patch.yml` is composition by default; only the real find/replace evidence in `patch.yml` promotes this to the source-patch class. Migration must keep the two verification paths separate (composition: row/id/inject/config-replacement semantics; source patch: target file, semantic markers, composed result, behavior tests). Also note composition config replacement is whole-object, not deep-merge, and later layers win (profile manifest bundles → profile patch → home patch → CLI `--patch`).
- Ruled out for #1: **DSH-0.1.2-A1-01** lists "#1 indirectly" (patches targeting the removed apiproxy source) — this fixture's patch targets session-view, not apiproxy; **A1-21** (preset `roots` pointing at the old CLI presets directory) — no `roots` key anywhere; `patch-package`/`patchedDependencies` — zero hits.

### #2 Internal event names and persistent events — HIT

**Hit locations and coupling points**
- `src/index.ts:15–19` — **producer** role: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: {…} })`. Coupling: (a) the event-channel name `session/event`; (b) a **third-party custom event type** intended to be persisted; (c) the `ignorable: true` envelope marker whose retention semantics moved during the corridor.
- `src/index.ts:20–22` — **plain observer** role: `ctx.on('session/event', …)` logging `event.type`. Coupling: channel name + envelope field `type` (the `type`-not-`kind` contract predates this corridor — rc.1-era — and is already baseline at rc.2).

**Card mapping (net corridor state — the folding case; full reasoning in §4)**
- **DSH-0.1.2-A1-02** (breaking, required-if-**target-is-alpha.1**): alpha.1 temporarily removed `SessionEvent.ignorable` retention; alpha.1 could not preserve the marker on third-party informational events, and unknown persisted events without the marker are refused on reload (fail-closed). Because our target is alpha.2, this card's "stop writing the event" recipe is **not** the net action.
- **DSH-0.1.2-A2-01** (fix, required-if-hit; explicit revert of A1-02): alpha.2 restores the envelope/persistence/reload/transport retention of `ignorable`. **Net state at the target: the field and its semantics are back — the producer keeps `ignorable: true`; the migration must NOT delete the marker for alpha.1 and re-add it for alpha.2.**
- Net obligations that remain after folding (from A2-01 + API-05): the marker is valid only for informational events an old reader can omit without breaking reconstruction; it is not a consumer-side filtering directive (events remain present after reload); unknown events **without** the marker stay required-on-read (fail closed) — so no consumer whitelist; and the public live `Session.append(...)` at alpha.2 still has **no** `ignorable` parameter, so the fixture's actual write seam (`ctx.emit('session/event', …)` through `ctx: any`) must be verified against the alpha.2 tag: if it is not a supported producer seam that persists the marker, treat it as a capability gap (plugin-owned sidecar/store per API-05) rather than faking the field via casts. This is a "silent write / loud read" risk: live append can succeed while cold load refuses the whole Session (`SessionFormatUnsupportedError`).
- Ruled out for #2: **DSH-0.1.2-A1-06** (Code Mode→PTC) — zero occurrences of `tools.mode`, `code-dispatch`, preset id `code`, etc. (the planner selected it only by number intersection); **DSH-0.1.2-A1-20** (`userQuestions.registerProvider` → `'user-questions/request'` waterfall) — no userQuestions surface; **DSH-0.1.2-A1-27** (SessionBinding durable event window) — that is the Web-Client content-read face, and this observer is a host-plane log-only listener; `connection/reset`, `tool/code-dispatch` patterns — zero hits.

### #3 Internal service probes / Remote — HIT

**Hit locations and coupling points**
- `src/index.ts:25–28` — plugin-provided service `rename-session`: weak probe `await ctx.get('apiProxy')` then `apiProxy.invoke('session.rename', { id, title })`. Coupling: (a) the rc.2 host service key `apiProxy` (type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`); (b) the dotted RPC operation name `session.rename`.
- `src/index.ts:29–32` — service `list-providers`: same weak probe then `apiProxy.invoke('llm.providers')`. Coupling: operation name `llm.providers`.

**Card mapping**
- **DSH-0.1.2-A1-01** (breaking, required-if-hit; touchpoint #3): APIProxy removed — the package `@deepseek-ai/dsh-host-apiproxy` is deleted in alpha.1, so both `ctx.get('apiProxy')` probes resolve to nothing and both invokes die. Operation ledger from the card: `session.rename` → Remote `session/rename`; `llm.providers` → split into **two** calls `llm/listProviders` + `llm/listConfigurableProviders` (one call becomes two results).
- **Face rule (A1-01 field note + API-01)** — decisive for the fix direction: the old `apiProxy` is the **host-plane** facade; `ctx.remote` is the **client-plane** (browser) facade; they are not in the same runtime. This fixture is a host-plane plugin, so the correct migration is to skip the gateway and inject the owning domain service behind the old call (API-01's executable host example: `export const inject = ['llm']` → `ctx.llm.listProviders()`). Mechanically switching to `inject: ['remote']` on the host plane hangs forever at `pending (waiting for service: remote)`. For `session.rename`, the host-plane owning domain service/method must be confirmed item-by-item at the alpha.2 tag (API-01: do not derive host service keys from the client Remote table) — mark **pending confirmation** until checked against target-tag source.
- **DSH-0.1.2-A2-02** (breaking, required-if-hit): **conditional follow-up, not a present hit** — the fixture never uses `ctx.remote`. It becomes applicable only if the migration adopts a client-plane Remote (or a plugin-owned client half): unary calls then resolve to `RemoteResult<T>` and failures are `RemoteError` instances with namespaced codes (`session/not-found`, `gateway/cancelled`, …); branch on `result.ok`/`result.error.code`, never `instanceof`, no blanket defensive catch, retry only transient+idempotent.
- Also note the probe style itself: `await ctx.get('apiProxy')` is the weak-get pattern; strict-injection rules entered before this corridor (rc.1 edge) and are baseline at rc.2, but the migration should still convert to declared `inject` per API-01 best practice.
- Ruled out for #3: **A1-21** (`resolveSessionPreset`) — zero references; **A1-22** (`isTokenDelta`) — not imported; **A1-25** (`dsh-client-runtime` removed) — not imported and not in any `dsh.client.inject` (inject-lint `runtimeRefsLeft: []` confirms); **A1-27/A1-30/A1-32** (client session-content read, `ctx.connection.api`, `ctx.workspaces` navigation) — no client-plane consumption at all; **A1-31** (subagent descriptor v3) — no subagent surface; **A2-05** (`pluginInventory/list` gains optional `agentPresets`) — inventory not consumed; **A2-06** (`$host.home/isLoopback`) — client-Remote fact, not used (and not the right fix for the host-plane #4 hit); **A2-08** (`sessionProjections` required inject/peer) — the fixture mounts none of the affected tool packages; **A2-10** (`settingsNamespace` runtime export dropped) — no settings surface; `@Remote` decorators, `@deepseek-ai/dsh-api-*/client` imports — zero hits.

### #4 Direct host directory reads/writes — HIT

**Hit locations and coupling points**
- `src/index.ts:35–38` — service `write-note`: builds `join(homedir(), '.dsh', 'profiles', 'default')` and `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`. Coupling points, traced through the data flow as pre-flight requires: (a) home assumed to be `~/.dsh` (ignores runtime `DSH_HOME`); (b) profile hard-coded to `default` (ignores the actually targeted profile); (c) an unowned **write** of an arbitrary file into the host profile directory.

**Card mapping**
- **DSH-0.1.2-A1-04** (behavior, required-if-hit; touchpoints #4, #7): profiles/launcher facts changed around alpha.1 (three profiles `acp`/`sdk`/`sdk-minimal` added; standalone demo bins/packages removed), and wrappers that hardcode fixed profile paths no longer match. Recipe is directly on point: use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; distinguish profile composition vs package manifest vs resolved config; **do not hardcode user directories**. The card's field note confirms profiles live under `$DSH_HOME/profiles` (so `homedir()/.dsh` is only accidentally right when `DSH_HOME` is unset, and `default` is only right when that profile is the target).
- Ruled out for #4: **DSH-0.1.2-A1-13** (platform shell / directory-picker fixes obsoleting workarounds) — the fixture carries no such workaround branches; **DSH-0.1.2-A1-21** (preset `roots` paths) — no `roots`; `DSH_HOME` env reads — zero (which is itself the defect); `mkdir/openPath` — zero hits. The only other fs calls (`readFileSync('patch.yml')` in apply-patch.mjs:8) read the plugin's own file relative to cwd — recorded under #1, not a host-directory coupling.

### #5 Internal UI / commands / tool registration — HIT

**Hit locations and coupling points**
- `src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`: a private `/internal` deep-subpath import of a host/client UI module.
- `src/index.ts:41–43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`: a command registration whose callback constructs the internal class with an options object. Coupling: internal module path + class name + constructor options shape + the registration surface name.

**Card mapping**
- **DSH-0.1.2-A1-03** (breaking, required-if-hit; touchpoints #1, #5): session-view internals were split extensively in alpha.1 — internal imports and UI registration points stop working. Recipe: check host paths one-by-one against an exact-tag compare; rebuild imports by **owning module**; anything without a stable public seam is **pending confirmation** — do not guess new paths; ordinary plugins should move to public facets/services rather than adding internal imports. For this fixture both the import path (`dsh-session-view/internal`) and the `new SessionView({ enhanced: true })` construction must be re-derived from the alpha.2 tag or dropped; the `registerCommand` surface name itself also needs target-tag confirmation (the fixture's `ctx.contributes` shape does not compile by design).
- **API-07** (ledger, reinforces A1-03): "package export ≠ artifact presence" — deep subpaths like `/internal` may be missing from the packed tarball even when an export map lists them (`ERR_PACKAGE_PATH_NOT_EXPORTED` / `ERR_MODULE_NOT_FOUND`); prefer maintained entry points (`.`, `/client`, `/types`). Also relevant to the phantom dependency: the imported package is not declared in package.json at all.
- Ruled out for #5: **A1-25** (removed `dsh-client-runtime` symbols) — not imported; **A1-26** (client-modules registration id == package.json name) — no client bundle half, no `__ModuleLoader__`/`PLUGIN_ID`, no `dsh.client`; incidentally row id/name (`legacy-plugin`) already equal the package name, but there is nothing to scan-mount; becomes relevant only if a client half is added during migration; **A1-28** (composer contenteditable) — no composer DOM code; **A1-29** (`MarkdownText` nested `labels`) — no ui-primitives usage; **A1-09/A1-10/A1-11** (optional capabilities: provider-login settings seat, third-party languages, subagent model selection) — capability cards are suggestions only, nothing in the fixture consumes them, and per SKILL discipline they are never adopted automatically; `registerView`, `ctx.tools`, `ctx.slots`, `useSession`, `useChat` — zero hits. Caller-side `commands.execute` (API-10's explicit-`[]` images argument) — the fixture registers a command but never calls `commands.execute`, so that ledger row is not hit.

### #6 Custom HTTP / WS / RPC / DOM / CSS channels — HIT

**Hit locations and coupling points**
- `src/index.ts:47–53` — `startLegacyBridge()`: raw `node:http createServer` listening on `127.0.0.1:43121`, advertised in comments as `http://localhost:43121/api/legacy`, explicitly "bypasses the Host Gateway authentication model". Coupling: a private loopback HTTP channel outside the Connection auth gate; fixed port with no lifecycle/teardown handling; no Host/Origin check; no auth on the handler.
- `src/index.ts:54` — `void startLegacyBridge`: the bridge is **never invoked**; today it is dormant shipped code, not a live listener. The coupling still counts: the code ships, and any future activation collides with the alpha.1+ auth model.

**Card mapping**
- **DSH-0.1.2-A1-08** (security, required-if-hit; touchpoint #6): from alpha.1, Web/API channels use process-scoped bootstrap tokens and signed cookies; private routes that bypass auth become security holes, and old channels may meet 401/403. Routes registered outside the Connection-owned surface do **not** automatically inherit auth, the Host/Origin fence, CORS, or TLS; handlers must first call `ctx.connection.requestRejection(req)` or the channel must move to a Connection-owned carrier/seam. Pre-flight #6 underlines: "listening on loopback only" is not a reason to skip authentication. Net action: either delete the dead bridge (preferred — it is never called) or re-platform it onto a gated carrier with explicit rejection handling; verification per card: wrong Host/Origin → 403, missing/bad cookie → 401, custom route not considered protected until explicitly wired into the gate.
- Note: `inject-lint` reported `rawWebServerRouteFiles: []` — its raw-route probe looks for `ctx.webServer.register()`-style registrations and does not see this raw `node:http` server, so the #6 auth review here is manual (a good demonstration that tool zero-hits ≠ no coupling).
- Ruled out for #6: **A1-19** (web plugin acceptance via boot manifest/auth URL) — no acceptance/startup-parsing scripts in the fixture; **A1-28** (composer DOM channel) — none; `WebSocket`, `MutationObserver`, `insertRule`, `contenteditable`, `setSelectionRange`, `data-input-scroll`, `router.get/post` — zero hits.

### #7 Subprocess / stdout / stderr parsing — HIT

**Hit locations and coupling points**
- `src/index.ts:56–67` — service `headless-ask`: `spawn('dsh', ['--profile', 'headless', prompt])`; treats each stdout `data` **chunk** as a complete JSONL line (`JSON.parse(line.toString())`), expects `{ type: 'final', text }`, resolves on `close` with whatever accumulated. Coupling points recorded per pre-flight (argv, cwd, env, cancellation, exit codes, stream ownership): argv shape itself matches the alpha.2 contract (launcher flags before the task, argv array not shell string — API-06 best practice 1); but stdout contract is wrong (final text, not JSONL; chunks are not lines), stderr is never consumed (loses `dsh: reasoning:` and `dsh: <code>: <message>`; unconsumed pipe can also fill and stall the child), the exit code is ignored (failure resolves as success with empty result), a `JSON.parse` throw inside the `data` handler is uncaught, and there is no cancellation/kill/teardown, no cwd/env control.
- `scripts/apply-patch.mjs:11–19` — `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })` then splits stdout on `\n` and `JSON.parse`es every line expecting `{type:'final'}`. Same wrong JSONL assumption; the file's own comment (:11) admits the expectation is deliberately wrong. Exit-code ownership is implicit: `execFileSync` throws on non-zero with no try/catch, so any failure aborts the patch script; stderr is not captured.

**Card mapping**
- **DSH-0.1.2-A1-05** (behavior, required-if-hit; touchpoint #7): the authoritative card. rc.2's stdout was **already** the final assistant text with exit code 0/1 — it was never JSONL (so the fixture's parsing was broken before the corridor even started; the corridor makes it a diagnosed defect); the alpha.1 change is that stderr gains a `dsh: reasoning:` segment (rc.2 stderr was empty on success). Recipe: treat stdout as the final-text channel; receive `dsh: reasoning:` / `dsh: <code>: <message>` on stderr; judge success **by exit code** (0 completed, 1 failure/abort/no-completed-turn); do not `JSON.parse` stdout by default. Verification per card + **API-06** stub matrix: plain-text success, reasoning present, empty final text, direct launch failure, non-zero exit; sensitive reasoning to a controlled stderr sink; consume stdout and stderr concurrently; handle cancellation, signals (SIGINT→130), spawn errors, teardown.
- **DSH-0.1.2-A1-04** (context for #7): the spawned invocation uses the official `dsh` launcher and the `headless` profile, which remain the correct shape at alpha.2 (API-06: `dsh --profile headless "task"`); no removed demo bins (`dsh-acp-demo`, `dsh-jsonrpc-agent`) are referenced. The card still applies as discipline: wrapper facts (profile set, launcher behavior) must come from the runtime/official launcher at the target tag, not from hardcoding — the same card is the primary hit under #4.
- Ruled out for #7: **A1-06** (PTC rename) — no Code-Mode identifiers; **A1-13** (shell/directory-picker workaround removal) — no workaround branches; **A2-04** (Node 24.0–24.11.1 empty-client-graph fix) — no forced-Node/skip-`dsh web`/loader-probe workarounds exist to remove; `execa`, `Bun.spawn` — zero hits.

---

## 4. Corridor folding: the `SessionEvent.ignorable` remove→restore case (requirement 2)

The brief asks how a field removed in an intermediate corridor version and restored in the target must be mapped. This fixture contains exactly one such case, on touchpoint #2:

1. **rc.2 (baseline)**: `ignorable: true` exists on third-party informational persisted SessionEvents.
2. **alpha.1 — DSH-0.1.2-A1-02** (breaking, action level *required-if-target-is-alpha.1*): retention of the marker is temporarily removed; alpha.1 cannot preserve it, and first-party readers fail closed on unknown persisted events. Its own recipe says: *if the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; do not delete the producer marker and then restore it.*
3. **alpha.2 (target) — DSH-0.1.2-A2-01** (fix, required-if-hit; documented revert of A1-02): the envelope/persistence/reload/transport retention semantics are restored.
4. **Net state at the target**: the marker is retained again. Therefore the migration of src/index.ts:15–19 is **keep the producer and its `ignorable: true` field unchanged** with respect to the marker — a naive per-edge walk (strip at alpha.1, re-add at alpha.2) would be churn and is explicitly forbidden by A1-02, A2-01, SKILL Mode C step 2, and pre-flight step 1.3.
5. **Folding is not "no action"**: the net state carries A2-01's constraints and API-05's gap — marker only for genuinely omittable informational events; not a consumer-side filter (events survive reload); unmarked unknown events stay required-on-read (no consumer whitelists); and alpha.2 still offers **no public `Session.append(..., { ignorable })` write surface**, so the fixture's `ctx.emit('session/event', …)` producer seam must be verified at the target tag. If it is not a supported persisted producer seam, the honest classification is **capability gap → plugin-owned sidecar/store** (API-05 best practice 1), never a cast/thaw/hand-edited-JSONL fake; a live-append smoke cannot catch this (silent write, loud cold-load refusal).
6. Mapping convention used in this report: the hit maps to the **pair** `DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01` with the net action taken from A2-01 (+API-05); A1-02 remains cited because it defines the fail-closed reader semantics and forbids the delete-and-restore churn.

No other remove→restore fold exists in this corridor for the fixture's hits (checked against both card files; A2-02/A2-10 modify surfaces the fixture does not consume).

---

## 5. No-hit handling: scan scope, exclusions, and why "no hit ≠ no problem" (requirement 3)

**All seven touchpoint categories hit**, so there is no empty category to report. The requirement is therefore answered at the granularity where negatives actually occur — individual cards/patterns inside hit categories, and the inventory surfaces around the code:

**Files scanned (complete scope)** — every file in the fixture, each read 100% line-by-line and additionally regex-swept: `README.md` (16 lines, fixture metadata/ground-truth table — my independent findings match it), `package.json` (9), `cordis.patch.yml` (6), `patch.yml` (6), `scripts/apply-patch.mjs` (19), `src/index.ts` (68). No exclusions were needed: the fixture has no `node_modules`, no lockfile, no dist/generated output, no tests/CI config, no dotfiles, no binary/large files (planner scanned the 5 non-Markdown files; the manual read covered all 6).

**Card-level negatives (scanned for, ruled out, with reasons)** — see the "Ruled out" bullets in §3: A1-06, A1-07*, A1-09, A1-10, A1-11, A1-13, A1-14*, A1-19, A1-20, A1-21, A1-22, A1-23*, A1-24*, A1-25, A1-26, A1-27, A1-28, A1-29, A1-30, A1-31, A1-32, A2-02 (conditional-only), A2-03*, A2-04, A2-05, A2-06, A2-08, A2-10. (* = no numeric touchpoint / packaging-privacy "manual review" cards: A1-07 and A1-14 are conditional preset/egress cards whose surfaces the fixture never touches — no shipped-preset policy code, no session-log-deepseek usage; A1-12/A1-23 are deployment-privacy defaults worth a one-line note to the maintainer but require no plugin code change; A1-24 needs a direct `@earendil-works/pi-ai` dependency — there is none; A2-03 has nothing to prune because no dependencies are declared at all — the real packaging work here is **adding** the exact alpha.2 cohort and the Cordis peer floor.)

**Why "no hit" (at any granularity) cannot conclude "no problem"** — the disciplines this report operates under:
1. **Pattern scans are heuristic** (pre-flight header; planner Limits): regexes cannot see data flow, dynamic imports, computed service keys, or TypeScript semantics; zero hits only mean "not detected by the current patterns". Here the converse also showed up: inject-lint's raw-route probe returned zero while a real raw HTTP server sits at src/index.ts:48.
2. **Cards are curated, not complete API diffs** (references/README.md): "no card hit" ≠ "no upstream change"; uncarded host UI/performance changes may still affect a plugin, and missing corridor edges must be reported as unsupported gaps instead of answered from memory.
3. **Static reading cannot prove runtime state** (SKILL Mode C step 3 / validation ladder): even a fully-mapped hit list requires dependency-resolution checks (this fixture has **no** dependency declarations to resolve — itself a FIX-REQUIRED finding), build/typecheck at the target tag, a real profile mount with no pending rows, and at least one behavior path (message→tool→response or equivalent). The fixture cannot compile by design, so the build/typecheck layer can only be exercised after the migration edits, not before.
4. **Face ambiguity**: several alpha.2 seams differ by runtime plane (host vs Web Client). The fixture mixes planes (host activate() importing a client-ish internal UI class); until the face is decided, "not hit" verdicts for client-plane cards (A1-26/27/28/29/30/32, A2-05/06) hold **only** under the assumption that no client bundle half is added during migration. Adding one re-opens all of them.
5. **Baseline caveat**: conclusions are pinned to from=rc.2 per the brief; an actual older 0.1.1 build point would add the rc.1/rc.2 edges (including the session-event `type` contract and strict-injection changes that this fixture's style predates) before this corridor applies.

---

## 6. Pending-confirmation list and recommended verification ladder (post-migration, out of scope to execute here)

Pending confirmation at the `dsh-v0.1.2-alpha.2` tag (never guess per card recipes):
1. #1/#5 — owning module and public seam (if any) for the old `src/session/view/SessionView.ts` / `renderSessionView` / `SessionView` internals (A1-03); patch surface must be re-composed or retired with an explicit removal reason.
2. #2 — whether `ctx.emit('session/event', …)` is a supported persisted producer seam that retains `ignorable` at alpha.2; else sidecar/store (A2-01 + API-05).
3. #3 — host-plane owning domain service + method behind old `session.rename` (API-01: confirm item-by-item at the target tag; `llm.providers` → `ctx.llm.listProviders()` (+ configurable-providers split) is the card-verified host example).
4. #5 — the actual command-registration surface name/shape at the target tag (fixture's `ctx.contributes.registerCommand` is unverified legacy shape).
5. Packaging — declare the exact, coherent alpha.2 DSH cohort + Cordis peer floor (inject-lint FIX-REQUIRED; rollup R-01 for the unpublished-cohort install track).

Verification ladder when the migration is executed (SKILL "Validation and reporting"; not run here — this task is read-only): dependency resolution / enablement resolution (`--dump-config`, no pending rows) → build + typecheck (`skipLibCheck: false` diagnostic pass) → real cold-boot mount → behavior path (headless wrapper per API-06 stub matrix; one message→tool→response flow) → wrapper contract (exit code, stdout, stderr, cancellation, teardown).

---

## 7. Read-only compliance statement

- `/app/fixture/`: **unchanged** — only read/glob/grep and the two documented read-only scripts (`plan-migration.mjs`, `inject-lint.mjs`) touched it; post-scan SHA-256 hashes of all 6 files recorded in the appendix; no write/edit tool ever targeted a fixture path; nothing executed from the fixture (apply-patch.mjs and the fixture entry were never run).
- No migrations or installations were executed; no git operations; no external network access; skill files and references read-only.
- All writes of this session: `agent-output/S1-static-scan/touchpoint-scan-report.md` (this file) and `agent-output/S1-static-scan/appendix-scanner-outputs.md`.

*Card citations in this report are summary points plus card IDs per the cell's context budget; the authoritative text is references/v0.1.2-alpha.1.md, references/v0.1.2-alpha.2.md, and references/api-migration-0.1.2-alpha.2.md (API-01/05/06/07/08) under skills/plugin-upgrade/.*
