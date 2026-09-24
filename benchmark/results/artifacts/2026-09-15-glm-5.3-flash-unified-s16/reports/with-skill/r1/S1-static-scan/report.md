# Touchpoint checkup · legacy-plugin, `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2` (static, read-only)

- **Task**: S1 · Static Touchpoint Scan (read-only inspection, no source changes)
- **Mode**: plugin-upgrade Mode C step 3 (pre-flight seven-class touchpoint scan) executed strictly read-only; no migration, installation, or file write inside the scanned tree
- **Corridor** (built from `references/README.md#version-corridor-index`, edges 2–3 — not filename order):
  - `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` · card set `DSH-0.1.2-A1` (28 cards, `references/v0.1.2-alpha.1.md`)
  - `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` · card set `DSH-0.1.2-A2` (8 cards, `references/v0.1.2-alpha.2.md`)
  - Interface ledger for this exact corridor: `references/api-migration-0.1.2-alpha.2.md` (API-01…API-10, CFG-01)
  - The `dsh-v0.1.1-rc.1 → rc.2` cards (`DSH-0.1.1-R2-*`) lie **before** the corridor start and are out of scope.
- **Scan scope**: every file under `fixture/` — `README.md`, `package.json`, `patch.yml`, `cordis.patch.yml`, `src/index.ts`, `scripts/apply-patch.mjs` (6 files; no `node_modules`, no lockfile, no generated artifacts exist to exclude). Line numbers below refer to the fixture files as they stand at git HEAD.
- **Read-only discipline**: `fixture/` verified unchanged vs git HEAD before and after the scan; no command executed the plugin, the `apply-patch` script, or any `dsh` binary. This report is written only under `agent-output/S1-static-scan/`.

## Summary table

| Touchpoint | Hit | File:line (fixture-relative) | Applicable card(s) | Confidence note |
|---|---:|---|---|---|
| #1 source patch | YES | `cordis.patch.yml:6` · `patch.yml:2-6` · `scripts/apply-patch.mjs:5,8` | `DSH-0.1.2-A1-03` (+ API-08 classification, API-07 ledger) | Genuine host-source patch surface, not a filename false positive |
| #2 events | YES | `src/index.ts:15-19` (producer, `ignorable: true`) · `src/index.ts:20-22` (observer) | `DSH-0.1.2-A1-02` **folded with** `DSH-0.1.2-A2-01` (net state governs) | Corridor folding applies — see §Corridor folding |
| #3 services/Remote | YES | `src/index.ts:26,27` (`ctx.get('apiProxy')`, `invoke('session.rename')`) · `src/index.ts:30,31` (`ctx.get('apiProxy')`, `invoke('llm.providers')`) | `DSH-0.1.2-A1-01`; secondary `DSH-0.1.2-A2-02` | Host-plane face confirmed; two distinct APIProxy operations hit |
| #4 host filesystem | YES | `src/index.ts:36-37` (`join(homedir(), '.dsh', 'profiles', 'default')` + `writeFileSync`) | `DSH-0.1.2-A1-04` | Hard-coded user path bypassing runtime `DSH_HOME` |
| #5 UI/commands/tools | YES | `src/index.ts:10` (internal import) · `src/index.ts:41-43` (`ctx.contributes.registerCommand` + `new SessionView`) | `DSH-0.1.2-A1-03` | Same card as #1 — one change, two touchpoints |
| #6 custom channel | YES | `src/index.ts:47-54` (`createServer`, `listen(43121, '127.0.0.1')`, `/api/legacy`) | `DSH-0.1.2-A1-08` | Auth-bypassing loopback bridge; dead code but statically present |
| #7 subprocess/output | YES | `src/index.ts:57-67` (`spawn` + `JSON.parse` of stdout) · `scripts/apply-patch.mjs:12-19` (`execFileSync` + `JSON.parse` per line) | `DSH-0.1.2-A1-05` (+ API-06 ledger) | Wrong JSONL-stdout assumption; exit code / stderr unhandled |

**All seven categories registered hits; there is no hit-free category.** The no-hit discipline (requirement 3) is therefore applied at sub-pattern level in §"Zero-hit sub-patterns and why 'no hit' ≠ 'no problem'" below.

## Category detail

### #1 Source patch / monkey patch — HIT

- **Evidence**:
  - `cordis.patch.yml:6` — `patch:` list referencing `patch.yml` (a source-patch declaration attached to the plugin composition row, not ordinary composition content);
  - `patch.yml:2-6` — `surface:` with `target: src/session/view/SessionView.ts` and find/replace `export function renderSessionView` → `renderSessionViewPatched` (a host-source replacement intent);
  - `scripts/apply-patch.mjs:5-6,8` — reads `DSH_HARNESS_SOURCE_ROOT` and `patch.yml` (the pre-flight #1 sentinel pattern for a patch applier).
- **Coupling points**: replacement of a named host source function inside a fixed host-internal path; the patch applier resolves the host checkout via an env-var source root. Both the target path and the target symbol are host-internal session-view surface.
- **Classification note (API-08)**: `cordis.patch.yml` is by default Profile composition, and "a filename containing `patch` alone is not a hit". Here the hit does not rest on the filename: the composition row explicitly declares a `patch:` surface whose target is host source (`src/session/view/SessionView.ts`) with find/replace hunks — that is a real #1 hit. The composition row itself (`id`/`name`/`config`) remains composition and is inventoried separately.
- **Card mapping**: **`DSH-0.1.2-A1-03` (Session view internals split up extensively)** — Type breaking, Touchpoints #1 + #5, Action level required-if-hit. Symptom: "Patch target paths, internal imports, or UI registration points no longer work." Recipe: check the host path `src/session/view/SessionView.ts` and the symbol `renderSessionView` one by one against an exact-tag compare at the target tag; when no equivalent owning module exists in the target, mark the patch surface **"pending confirmation"** — do not guess new paths. Supporting ledger: API-07 (internal subpaths — export-map presence ≠ packed-artifact presence) for the verification order.

### #2 Internal event names and persistent events — HIT

- **Evidence**:
  - `src/index.ts:15-19` — `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: … })`: the plugin is a **producer of a third-party persisted informational SessionEvent** carrying the `ignorable: true` envelope marker;
  - `src/index.ts:20-22` — `ctx.on('session/event', …)`: a plain observer of the internal `session/event` name (reads `event.type`).
- **Coupling points**: producer/persistence role (the envelope marker must survive persistence/reload/transport) and the internal event name itself.
- **Card mapping** (see §Corridor folding for the net-state computation):
  - **`DSH-0.1.2-A1-02`** (`SessionEvent.ignorable` temporarily removed) — Type breaking, Touchpoint #2, Action level **required-if-target-is-alpha.1**. Hit, but its removal action is **not** to be executed because the final target is alpha.2.
  - **`DSH-0.1.2-A2-01`** (Restore `SessionEvent.ignorable` for third-party persisted events) — Type fix, Touchpoint #2, Action level required-if-hit; explicitly cites itself as the "revert of DSH-0.1.2-A1-02". This is the **governing net-state card**: keep the producer marker; ensure every persistence/reload/transport seam preserves it as-is; the marker is legitimate only because the event is informational (a reader without this plugin can omit its semantics without affecting reconstruction).
  - The observer role (`ctx.on`) has no dedicated corridor card: the session-event `type`-not-`kind` contract predates this corridor (v0.1.1-rc.1 card set), and no corridor card renames `session/event`. Recorded as an internal-name coupling to re-verify at runtime, not as a card hit.
  - **Residual nuance from A2-01 / API-05**: alpha.2 restores the envelope/retention semantics, but the public `Session.append(...)` still cannot set `ignorable`. The fixture emits via `ctx.emit('session/event', …)`; whether that producer seam actually lands the marker in the persisted envelope at alpha.2 must be proven by a persist → cold-load test. If it cannot, it is a **capability gap to report**, never to be faked with casts.

### #3 Internal service probes / Remote — HIT

- **Evidence**: `src/index.ts:26` and `:30` — `await ctx.get('apiProxy')` (rc.2 service key `apiProxy`, package `@deepseek-ai/dsh-host-apiproxy`); `:27` — `apiProxy.invoke('session.rename', { id, title })`; `:31` — `apiProxy.invoke('llm.providers')`.
- **Coupling points**: two distinct legacy APIProxy operations (`session.rename`, `llm.providers`) on the **host plane** (ordinary Cordis server-side plugin: `activate(ctx)` + `ctx.register`; no browser bundle, no `dsh.client` manifest). No failure handling exists on either call today.
- **Card mapping**:
  - **`DSH-0.1.2-A1-01` (APIProxy removed, Host/Web Client calls moved to `@Remote`)** — Type breaking, Touchpoint #3, required-if-hit. The `apiProxy` service key and its package are deleted in alpha.1; both operations appear in the card's ledger:
    - `session.rename` → `session/rename` (client projection `ctx.remote.session.rename`; host plane: inject the owning session domain service behind it);
    - `llm.providers` → **split into two**: `llm/listProviders` + `llm/listConfigurableProviders` (client), or host-plane direct injection of the `llm` domain service (`inject: ['llm']` → `ctx.llm.listProviders()`), then combine by provider id.
    - Face warning from the A1-01 field note: this is a host-plane consumer — the migration is to **skip the gateway and inject the domain service directly**; mechanically switching to `inject: ['remote']` leaves the host plane stuck at `pending (waiting for service: remote)`.
  - **`DSH-0.1.2-A2-02`** (Remote failures become `RemoteError` instances; error codes gain namespaces) — Type breaking, Touchpoint #3. Secondary/follow-on: once the calls are migrated to Remote/domain results, error control flow must branch on `result.ok` and namespaced `result.error.code` (A1-01's recipe explicitly defers error control flow to A2-02). The fixture's current no-branching style would silently treat `ok: false` as success; `instanceof` and `message`-parsing are forbidden by the card.

### #4 Direct host directory reads/writes — HIT

- **Evidence**: `src/index.ts:36` — `const profileDir = join(homedir(), '.dsh', 'profiles', 'default')`; `:37` — `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`.
- **Coupling points**: hard-coded user-home path construction (`~/.dsh/profiles/default`) that ignores the runtime `DSH_HOME`, plus a direct write into the host's profile directory tree (data flow: `homedir()` → `join` → `writeFileSync`, traced per pre-flight #4).
- **Card mapping**: **`DSH-0.1.2-A1-04`** (ACP/SDK examples merged into the `dsh` profile, standalone demo bins and packages removed) — Type behavior, Touchpoints #4 + #7, required-if-hit. The card's recipe: use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; **do not hardcode user directories**; distinguish profile composition / package manifests / resolved config. (Per the card's field note, profiles live under `$DSH_HOME/profiles`; the hardcoded `homedir()`-based construction breaks the moment `DSH_HOME` differs from `~/.dsh`.)
- Ruled out for #4: `DSH-0.1.2-A1-21` (#4 aspect: `roots` pointing at the rc.2 CLI preset directory — no agent-preset config present in the fixture), `DSH-0.1.2-A1-13` (platform shell / directory-picker workarounds — none present).

### #5 Internal UI / commands / tool registration — HIT

- **Evidence**: `src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` (internal deep subpath of a host UI package); `:41-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))` (command registration whose implementation constructs the internal view class).
- **Coupling points**: internal session-view import path (`/internal`), plus the internal UI registration point that instantiates it. Same underlying host change as #1 — the session-view internals split.
- **Card mapping**: **`DSH-0.1.2-A1-03`** (Touchpoints #1 + #5) — rebuild imports by owning module against the exact target tag; if no stable public seam exists for rendering a session view from a plugin command, mark **"pending confirmation"** and prefer public facets/services; do not guess replacement paths. Supporting: API-07 evidence order (packed artifact → exports → source) before trusting any `/internal` replacement.
- Ruled out for #5 (all zero-hit, see §Zero-hit sub-patterns): A1-25 (no `dsh-client-runtime` import), A1-26 (no client bundle / `dsh.client` / `__ModuleLoader__` / `PLUGIN_ID`), A1-28 (no composer DOM access), A1-29 (no `MarkdownText`), A1-30 (no `ctx.connection.api`), A1-32 (no `ctx.workspaces` navigation), A1-09/A1-10/A1-11 (optional capabilities — suggestions only, not adopted), API-10 `commands.execute` signature change (the fixture registers a command; it never calls `commands.execute`).

### #6 Custom HTTP / WS / RPC / DOM / CSS channels — HIT

- **Evidence**: `src/index.ts:47-53` — `startLegacyBridge()`: raw `node:http` `createServer` answering `response.end('legacy')`, `server.listen(43121, '127.0.0.1')` advertising `http://localhost:43121/api/legacy`; line 54 `void startLegacyBridge` — the function is **never invoked** (the fixture is static-only), but the coupling is statically present and any future activation would open an unauthenticated channel.
- **Coupling points**: a private loopback HTTP channel that bypasses the Host Gateway authentication model entirely (self-declared in the fixture comment, line 45); no auth, Host/Origin fence, CORS, TLS, or teardown discipline is present.
- **Card mapping**: **`DSH-0.1.2-A1-08`** (Web/API channels use process-scoped bootstrap tokens and signed cookies) — Type security, Touchpoint #6, required-if-hit. alpha.1 puts all Web/API traffic behind process-scoped bootstrap tokens + signed cookies on the Connection auth gate; the card's rule applies verbatim to this channel: **"listening on loopback only" is not a reason to skip authentication**; a private route that bypasses auth becomes a security hole. Recipe direction: per the card, custom routes do not automatically inherit auth, the Host/Origin fence, CORS, or TLS — handlers should call `ctx.connection.requestRejection(req)` first, or the channel should migrate to a Connection-owned carrier/seam; and the existing channel protocol must be preserved while applying the gate (precision-checklist: "channel authentication with protocol preservation"). Verification per card: wrong Host/Origin → 403, missing/bad Cookie → 401, and the custom route must not be considered protected before it is explicitly wired into the gate.
- Ruled out for #6: `DSH-0.1.2-A1-19` (web acceptance scripts reading the boot manifest/token URL — the fixture is a server-side bridge, not an acceptance script), `DSH-0.1.2-A1-28`'s DOM aspect (no textarea/contenteditable/DOM mutation patterns).

### #7 Subprocess / stdout / stderr parsing — HIT

- **Evidence**:
  - `src/index.ts:57-67` — service `headless-ask`: `spawn('dsh', ['--profile', 'headless', prompt])`, then `child.stdout.on('data', …)` with `JSON.parse(line.toString())` expecting `{ type: 'final', text }` (a JSONL-stdout assumption, self-declared wrong at line 56); resolves on `'close'` **without inspecting the exit code** (line 65); **stderr is never consumed**; no cancellation/teardown.
  - `scripts/apply-patch.mjs:12-19` — `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })`, then `output.split('\n')` + `JSON.parse(line)` expecting `event.type === 'final'` (same wrong JSONL assumption, self-declared at line 11).
- **Coupling points**: wrapper contract on the headless process — stdout format, stderr ownership, exit-code semantics, argv shape.
- **Card mapping**: **`DSH-0.1.2-A1-05`** (Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final text) — Type behavior, Touchpoint #7, required-if-hit. Key facts from the card: stdout was **already** the final assistant text in rc.2 — it was **never JSONL**, so both `JSON.parse` loops are broken against the *from* version already and stay broken at the target; alpha.1's actual change is that stderr gains `dsh: reasoning:` (rc.2 stderr was empty on success) — dropping stderr loses reasoning, and exit code (0 completed / 1 failure-abort-no-turn) is the authoritative success criterion, which the fixture ignores in `index.ts:65`. Migration direction per card + API-06: treat stdout as final assistant text (no `JSON.parse` by default), consume the `dsh: reasoning:` / `dsh: <code>: <message>` segments on stderr, judge success by exit code, use argv arrays, and handle cancellation/signals/teardown. The argv shape itself (`['--profile', 'headless', <task>]`, launcher flags before the task) is already correct per API-06 and must not be "fixed".
- Ruled out for #7: `DSH-0.1.2-A1-04`'s #7 aspect (the wrapper invokes `dsh` itself, not the removed `dsh-acp-demo` / `dsh-jsonrpc-agent` bins), `DSH-0.1.2-A1-13` (no platform workarounds), `DSH-0.1.2-A2-04` (conditional; no Node-version workaround branches present), `DSH-0.1.2-A1-06` (#7 aspect; no code-mode tokens anywhere).

## Corridor folding (requirement 2, explicit)

The brief's folding case is instantiated exactly once in this corridor, at touchpoint #2:

- **alpha.1 edge**: `DSH-0.1.2-A1-02` *removes* the `SessionEvent.ignorable` retention semantics for third-party persisted events (action level: required-if-target-is-alpha.1 — i.e., "stop writing the unknown persisted event / drop the marker" applies **only if you stop at alpha.1**).
- **alpha.2 edge**: `DSH-0.1.2-A2-01` *restores* it (self-described as the revert of A1-02).
- **Final net state at the target `dsh-v0.1.2-alpha.2`**: the field **exists**, with producer/persistence/reload/transport retention semantics. Per SKILL.md Mode C step 2 and `references/README.md` ("if a field is removed in alpha.1 and restored in alpha.2, do not delete and re-add it"), the correct treatment of the hit at `src/index.ts:15-19` is:
  1. **Keep** `ignorable: true` on the producer — do not perform A1-02's removal step at all;
  2. Map the hit to **`DSH-0.1.2-A2-01`** as the governing net-state card, and record `DSH-0.1.2-A1-02` as the **folded intermediate edge** (no net source change attributable to it);
  3. Preserve A2-01's producer-side condition: the marker is correct only because `legacy/informational-note` is informational; and its verification requirement (unknown events with the marker survive reload; unknown events without it fail closed) plus the API-05 caveat that the public `Session.append` cannot set the field — so the actual persistence of the marker through `ctx.emit('session/event', …)` must be runtime-proven, not assumed.

No other field in this corridor is removed-then-restored; all other mapped cards are monotonic within rc.2 → alpha.2 (A1-01/A1-03/A1-04/A1-05/A1-08 are alpha.1-edge changes that persist unchanged at alpha.2; A2-02 is additive on top at the alpha.2 edge).

## Zero-hit sub-patterns, and why "no hit" ≠ "no problem"

**Hit-free categories: none.** Every one of the seven classes produced at least one hit, so there is no category for which "files scanned, nothing found" can be claimed at category level. The honest no-hit record is at sub-pattern level:

| Class | Zero-hit sub-patterns (run over all 6 fixture files) | What they rule out (card) |
|---|---|---|
| #2 | `tool/code-dispatch`, `tools-code-mode`, `tools.mode`, `CodeDispatch*`, `code-only/ptc-only`, `connection/reset` | `DSH-0.1.2-A1-06` (Code→PTC rename) not hit |
| #3 | `userQuestions`/`registerProvider`; `resolveSessionPreset`; `isTokenDelta`; `ctx.connection.api`; subagent descriptor/version; `sessionProjections`; `settingsNamespace`/`installSettingsSection`; `pluginInventory`; `host.describe`/`$host` | `DSH-0.1.2-A1-20`, `A1-21` (#3 aspect), `A1-22`, `A1-30`, `A1-31`, `A2-08`, `A2-10`, `A2-05`, `A2-06` not hit |
| #4 | `DSH_HOME` env reads; `readFile`/`mkdir`/`openPath` (only the one `writeFileSync` hit above); preset `roots` paths | `DSH-0.1.2-A1-21` (#4 aspect), `A1-13` not hit |
| #5 | `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`; `__ModuleLoader__`, `PLUGIN_ID`; `MarkdownText`; `ctx.workspaces`/`connectWorkspace`/`pickDirectory`/`uiWorkspace`; `commands.execute`; `registerView`, `ctx.tools` | `DSH-0.1.2-A1-25`, `A1-26`, `A1-29`, `A1-32`, `A1-09/10/11` (optional capabilities) not hit; API-10 signature change not hit |
| #6 | `WebSocket`, `MutationObserver`, `insertRule`, `contenteditable`, `setSelectionRange`, `data-input-scroll`, `HTMLTextAreaElement`; `ctx.webServer.register`/`registerUpgrade`; `router.(get|post|…)` | `DSH-0.1.2-A1-28` (DOM aspect), `DSH-0.1.2-A1-19` not hit |
| #7 | Node-version workaround branches (`engines` pins, loader probing); removed demo bins (`dsh-acp-demo`, `dsh-jsonrpc-agent`, `dsh-acp-snapshot`); `SIGINT`/`SIGTERM` handling; `--dump-config` | `DSH-0.1.2-A2-04`, `DSH-0.1.2-A1-04` (#7 aspect), `DSH-0.1.2-A1-13` (#7 aspect) not hit |
| packaging | `dependencies` / `peerDependencies` / `engines` / `@deepseek-ai/*` entries: **zero** in `package.json`; no lockfile, no `dsh-plugin.json` | `DSH-0.1.2-A1-24` (pi-ai), `DSH-0.1.2-A2-03` (peer trims) not hit as cards — but see the inventory observation below |

**Why a zero hit can never be reported as "no problem" here (and equally, why the hits above are not yet a verdict):**

1. **The scan is heuristic by construction.** `references/pre-flight.md` states it in its header: "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests." SKILL.md Mode C step 3 repeats the same for the planner: zero hits still require checking dependencies/imports and running a build plus a real mount.
2. **The card sets are curated, not a complete API diff** (stated in the header of both `v0.1.2-alpha.1.md` and `v0.1.2-alpha.2.md`, and in their closing footers: "Host UI/performance changes without cards do not mean 'definitely no API impact'"). A textual pattern can only match changes someone already carded; uncarded host behavior can still break the plugin, and per the corridor rules such gaps must be marked "unsupported / pending review", never resolved from memory.
3. **Static text cannot see data flow, composition, or runtime assembly.** Pre-flight #4 says it directly: "a line-level search cannot reveal data flow." Dynamic event names, runtime-built import specifiers, configuration inherited from the composed profile, and Cordis service assembly (`inject`/pending) are invisible to grep. The zero-hit rows above rule out only *literal* occurrences.
4. **Dead code is not safe code, and live-looking code is not proven live.** `startLegacyBridge` (`src/index.ts:47-54`) is never invoked, yet its #6 hit still demands a decision (delete, or wire into the auth gate) because the coupling ships in the artifact. Conversely, absence of a pattern in code paths that only activate at runtime cannot be proven by static scan.
5. **Static completion states are not runtime completion states.** Per the API ledger's minimal validation ladder, "typecheck passed", "Loader mount passed", and "real behavior passed" are three different states; this report covers only the first rung's input (static inventory). Nothing here has been executed.

## Inventory observations (pre-flight step 0, not touchpoint hits)

- `package.json` declares **no dependencies, no peerDependencies, no engines, and no `@deepseek-ai/*` cohort at all**, yet `src/index.ts:10` imports `@deepseek-ai/dsh-session-view/internal`. The consumed declarations' owner is undeclared; under the target cohort, any package whose declarations the source consumes must become a direct dev/peer dependency (API-10 type-ownership rule; compare the A1-25 cleanup pattern), and the `/internal` subpath additionally needs the API-07 packed-artifact check. There is no lockfile, so the "single package manager / lockfile scan" step has nothing to scan and the DSH cohort must be established during migration.
- `package.json` ships an `apply-patch` script that mutates host source via `DSH_HARNESS_SOURCE_ROOT`; it must never be run as part of (or before) the migration, and the patch surface it applies is the #1 finding above.
- The composition row (`cordis.patch.yml:2-5`, `id: legacy-plugin`, `config: {}`) is ordinary composition: no telemetry overrides are present, so `DSH-0.1.2-A1-23` (base-composition telemetry defaults) does not hit this fixture; per API-08, composition rows get row/id/inject/config-replacement review, and `config` replacement is whole-object, not a merge.

## Must verify (explicitly out of scope for this static pass)

1. Build + typecheck against the exact `dsh-v0.1.2-alpha.2` tag declarations (no `any` masking; one diagnostic pass with `skipLibCheck: false` when selector types are involved);
2. Real isolated-profile cold boot / mount, with no pending rows (`dsh --profile <p> --dump-config`);
3. For each mapped card's verification clause: A1-01 success + one business failure + cancellation per migrated call (host-plane domain-service injection proven, not `remote`); A2-01 persist → cold load proving the `ignorable` marker survives; A1-03 exact-tag path compare for the patch surface and the `/internal` import; A1-08 auth-gate probe of the loopback channel (403/401 paths); A1-05 headless stub matrix (plain success, reasoning present, empty final text, failure, non-zero exit).

## Result line

- **Hits: 7/7 categories, 8 distinct hit sites, 6 distinct cards** (`DSH-0.1.2-A1-01`, `A1-03`, `A1-04`, `A1-05`, `A1-08`, `A2-01`) plus one folded intermediate (`DSH-0.1.2-A1-02`, no net action at alpha.2) and one follow-on (`DSH-0.1.2-A2-02`, error flow of the migrated #3 calls).
- **Fixture integrity**: `fixture/` unmodified relative to git HEAD for the entire session (verified before and after scanning).
