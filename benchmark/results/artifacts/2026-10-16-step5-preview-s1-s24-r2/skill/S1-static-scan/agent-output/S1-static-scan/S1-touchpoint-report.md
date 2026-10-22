# S1 · Static Touchpoint Scan Report — `legacy-plugin`

- **Task**: read-only touchpoint inspection before migrating `legacy-plugin` from dsh `0.1.1-rc.2` to `0.1.2-alpha.2`
- **Scan target**: `.../S1-static-scan/fixture/` (static copy, never executed, never modified)
- **Mode**: Mode A · inspect (read-only). No file under `fixture/` was created, modified, or deleted; no migration, install, build, or lifecycle script was run.
- **Method**: seven-class touchpoint self-check per `skills/plugin-upgrade/references/pre-flight.md`, using the regexes in `references/pre-flight-patterns.json` (the look-behind pattern for class #1 was re-run without look-around because ripgrep's default engine rejects it; the `cordis.patch.yml` exclusion was then applied by hand per API-08), followed by card mapping against the corridor card sets.
- **Corridor**: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2`, i.e. corridor edges **2** (`references/v0.1.2-alpha.1.md`, 28 cards, prefix `DSH-0.1.2-A1`) and **3** (`references/v0.1.2-alpha.2.md`, 8 cards, prefix `DSH-0.1.2-A2`) of `references/README.md`, plus the exact rc.2→alpha.2 interface ledger `references/api-migration-0.1.2-alpha.2.md` (API-01…API-10, CFG-01). Edge 1 (`v0.1.1-rc.2.md`, rc.1→rc.2, `DSH-0.1.1-R2-*`) is **before** the from-tag and therefore out of corridor scope — its cards (image `originalDimensions`, `read_image` output, Files API fallback) are not mappable to this scan.

## Summary table (pre-flight.md template)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | **YES** | `patch.yml:1-6`; `scripts/apply-patch.mjs:5-6,8`; `cordis.patch.yml:5-6` (declaration site); `package.json:7` (script wiring) | **DSH-0.1.2-A1-03** (classify per **API-08**) | Host source path + symbol are session-view internals; target-tag path revalidation required — "pending confirmation", do not guess paths |
| #2 events | **YES** | `src/index.ts:15-19` (producer, `ignorable: true`); `src/index.ts:20-22` (observer) | **DSH-0.1.2-A2-01** (net), **DSH-0.1.2-A1-02** (intermediate), **API-05** (write-surface gap) | Corridor folding: removed in alpha.1, restored in alpha.2 → net state "restored"; keep the marker line |
| #3 services/Remote | **YES** | `src/index.ts:26-27`, `30-31` (`ctx.get('apiProxy')`, `invoke('session.rename')`, `invoke('llm.providers')`) | **DSH-0.1.2-A1-01** + **API-01**; error flow **DSH-0.1.2-A2-02** + **API-02** | Host-plane fixture → inject owning domain service directly; do **not** swap to `remote` (would hang pending) |
| #4 filesystem | **YES** | `src/index.ts:36-37` (`homedir()/.dsh/profiles/default` + `writeFileSync`) | **DSH-0.1.2-A1-04** | Hardcoded user directory; resolve via runtime `DSH_HOME` + target profile |
| #5 UI/commands/tools | **YES** | `src/index.ts:10` (`@deepseek-ai/dsh-session-view/internal`); `src/index.ts:41-43` (`contributes.registerCommand` → `new SessionView`) | **DSH-0.1.2-A1-03**; deep subpath risk **API-07** | Registration API itself not carded as changed; the coupling is the internal import + view internals |
| #6 custom channel | **YES** | `src/index.ts:47-53` (`createServer`, `listen(43121,'127.0.0.1')`); note L54: never invoked | **DSH-0.1.2-A1-08** | Loopback-only is not a reason to skip the auth gate |
| #7 subprocess/output | **YES** | `src/index.ts:57-66`; `scripts/apply-patch.mjs:12-18` (both `JSON.parse` stdout as JSONL) | **DSH-0.1.2-A1-05** + **API-06** | argv shape is correct; the output-contract assumption is the defect |

**Result: all seven touchpoint classes hit.** There is no zero-hit class in this fixture; the "no hit" analysis below therefore documents, per class, what was scanned and ruled out, and why a zero hit could never be read as "no problem".

---

## Scanned file inventory (complete)

| File | Lines | Role |
|---|---:|---|
| `fixture/README.md` | 16 | fixture self-description (S1 copy; the original under `skills/plugin-upgrade/examples/legacy-plugin/README.md` adds that `cordis.patch.yml` is the composition *negative control*) |
| `fixture/package.json` | 9 | plugin manifest: `legacy-plugin@0.1.1`, `private`, ESM, one script `apply-patch` |
| `fixture/cordis.patch.yml` | 6 | profile composition row `legacy-plugin` + `patch: [patch.yml]` declaration |
| `fixture/patch.yml` | 6 | patch surface: target `src/session/view/SessionView.ts`, find/replace `renderSessionView` |
| `fixture/scripts/apply-patch.mjs` | 19 | patch applier (`DSH_HARNESS_SOURCE_ROOT`) + headless wrapper |
| `fixture/src/index.ts` | 68 | plugin entry `activate(ctx)` with all runtime couplings |

No hidden files, no lockfile, no `dsh-plugin.json`, no tests, no CI config in the fixture. All five non-README files are byte-identical to the skill's `examples/legacy-plugin/` originals (verified by line-by-line comparison), so the scan evidence transfers to the reference fixture.

---

## #1 · Source patch / monkey patch — **HIT**

**Hit files/lines**

- `fixture/patch.yml:1-6` — a patch-surface declaration: `surface → target: src/session/view/SessionView.ts` with `replacements: find "export function renderSessionView" → replace "…Patched"`. This is a host-source replacement, not composition.
- `fixture/scripts/apply-patch.mjs:5-6,8` — requires `DSH_HARNESS_SOURCE_ROOT`, then `readFileSync('patch.yml')` and applies the surface against the host checkout.
- `fixture/cordis.patch.yml:5-6` — `patch: [- patch.yml]`: the declaration site that pulls the source patch into the profile composition.
- `fixture/package.json:7` — wires `apply-patch` as a package script.

**Classification note (API-08)**: a file merely *named* `*patch*` is not a hit — `cordis.patch.yml` by itself is the official Loader composition overlay (and is the fixture's negative control). The class-#1 hit is justified by the *evidence chain* `cordis.patch.yml → patch.yml → find/replace surface + DSH_HARNESS_SOURCE_ROOT applier`: a real diff against host source.

**Concrete coupling points**: host source path `src/session/view/SessionView.ts` and the symbol `renderSessionView` — both session-view internals.

**Cards**

- **DSH-0.1.2-A1-03** · "Session view internals split up extensively" (breaking; touchpoints #1/#5; required-if-hit). Patch target paths, internal imports, and UI registration points for session-view internals no longer work on the target. Recipe: check each host path against an exact-tag compare; rebuild imports by owning module; capabilities without a stable public seam are "pending confirmation" — do not guess new paths. Field note: dsh-tui points `DSH_HARNESS_SOURCE_ROOT` at the target tag and validates each patch-surface path by composition — that is exactly the verification this fixture's `apply-patch.mjs` would have to be re-based onto.

**Ruled out inside the class**: `patchedDependencies`, `patch-package` — no matches. `monkeypatch`/`patch-surface` strings beyond the above — none.

---

## #2 · Internal event names and persistent events — **HIT**

**Hit files/lines**

- `fixture/src/index.ts:15-19` — `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })`: producer of an external informational **durable** event carrying the `ignorable` marker.
- `fixture/src/index.ts:20-22` — `ctx.on('session/event', …)`: plain observer (logs `event.type`).

**Corridor folding (explicitly requested)**: `SessionEvent.ignorable` is **removed in alpha.1** (**DSH-0.1.2-A1-02**, action level *required-if-target-is-alpha.1*) and **restored in alpha.2** (**DSH-0.1.2-A2-01**, a *fix*, required-if-hit). Per `references/README.md` — "if a field is removed in alpha.1 and restored in alpha.2, do not delete and re-add it" — the **net state over the rc.2→alpha.2 corridor is "restored"**. Therefore:

- the operative card for this hit is **DSH-0.1.2-A2-01**: alpha.2 retains the marker on external informational events through envelope/persistence/reload/transport; producers write `ignorable: true` only for informational events a reader may omit without affecting reconstruction; the marker is **not** a consumer-side filtering directive, and events remain in loaded events after reload;
- **DSH-0.1.2-A1-02** is recorded as the *intermediate-edge* card only: it would govern a stopover on alpha.1 ("temporarily stop writing that unknown persisted event"). It must **not** be applied to the alpha.2 target — deleting the producer marker and re-adding it later is exactly the mistake the folding rule forbids;
- residual risk per **API-05**: alpha.2 restores the *envelope* field, but the public `Session.append(...)` still cannot write `ignorable`. If this plugin's intent is durable persistence of `legacy/informational-note`, a live emit can succeed while the next cold load refuses the whole session (`SessionFormatUnsupportedError`) — "silent write / loud read". Out-of-repo producers should use a plugin-owned sidecar/store keyed by session id rather than casts or hand-edited JSONL. The static scan cannot tell whether `ctx.emit('session/event', …)` here routes into the durable session log — that data-flow question must be answered by a real mount (see "Must verify").
- The observer at L20-22 needs no card: plain `ctx.on` observation is unchanged across the corridor.

**Ruled out inside the class**: `tool/code-dispatch`, `tools-code-mode`, `connection/reset` — no matches (so the event-vocabulary half of **DSH-0.1.2-A1-06** and the `connection` face of A1-30 are not hit here).

---

## #3 · Internal service probes / Remote — **HIT**

**Hit files/lines**

- `fixture/src/index.ts:26-27` — `const apiProxy = await ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', { id, title })`.
- `fixture/src/index.ts:30-31` — `apiProxy.invoke('llm.providers')`.

**Concrete coupling points**: the rc.2 Host APIProxy service (service key `apiProxy`, type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`) and two of its operations, `session.rename` and `llm.providers`.

**Cards**

- **DSH-0.1.2-A1-01** · "APIProxy removed, Host/Web Client calls moved to `@Remote`" (breaking; #3; required-if-hit). rc.2's service key is `apiProxy`; alpha.1 deletes the package — there is no `APIProxy` identifier left. Per the A1-01 mapping table: `session.rename` → `session/rename` (generated declaration `ctx.remote.session.rename`); `llm.providers` → **`llm/listProviders` + `llm/listConfigurableProviders`** (one call split into two results).
- **API-01** adds the decisive *face* rule with a field note measured in a container: the old `apiProxy` is the **host-plane (server-side)** facade and `ctx.remote` is the **client-plane (browser-side)** facade; they are not the same runtime, so injection names cannot be swapped one-to-one. This fixture is host-plane (it imports `node:fs`, `node:os`, `node:child_process`; `package.json` declares no `dsh.client`), so the correct migration is to **skip the gateway and inject the owning domain service directly** (e.g. `inject: ['llm']` then `ctx.llm.listProviders()`). Mechanically rewriting `ctx.get('apiProxy')` to `ctx.get('remote')` fails with `pending (waiting for service: remote)` — the same symptom as discussion #5120 pain point #4. The host-side replacement for `session.rename` is **not** in the client table and must be confirmed item-by-item against the target tag's exports/types.
- **DSH-0.1.2-A2-02** + **API-02** · govern the error-control-flow rewrite once the calls move: Remote unary calls resolve to `RemoteResult<T>`; on alpha.2 `error` is a `RemoteError` instance and codes are namespaced (`session-not-found` → `session/not-found`, `agent-busy` → `session/agent-busy`, `internal` → `gateway/internal`, `cancelled` → `gateway/cancelled`); branch on `result.ok`/`result.error.code`, never parse `message`, never `instanceof` across realms, use `isRemoteFailure` only at catch boundaries. Version attribution: `RemoteResult<T>` already existed in alpha.1 — do not date `result.ok` handling as an alpha.2-only change.

**Ruled out inside the class**: no `ctx.remote`, `@Remote`, or `@deepseek-ai/dsh-api-*/client` usage. Specifically absent, hence not hit: A1-20 (`userQuestions.registerProvider`), A1-22 (`isTokenDelta`), A1-27 (SessionBinding event window), A1-30 (`ctx.connection.api`), A1-31 (subagent descriptor v2→3), A1-32 (`IWorkspaces` navigation), A2-05 (pluginInventory `agentPresets`), A2-06 (`ctx.remote.$host`), A2-08 (`sessionProjections` inject/peer), A2-10 (`settingsNamespace`).

---

## #4 · Direct host directory reads/writes — **HIT**

**Hit files/lines**

- `fixture/src/index.ts:36` — `const profileDir = join(homedir(), '.dsh', 'profiles', 'default')`.
- `fixture/src/index.ts:37` — `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`.

**Concrete coupling points**: a hardcoded user-home-relative host path `~/.dsh/profiles/default`, and a write into a directory the host owns (the profile directory). Data flow (per the pre-flight #4 warning that line-level search cannot reveal data flow — traced by reading the function): the write target is always `<home>/.dsh/profiles/default/legacy-note.txt`, with `text` coming straight from the `write-note` command argument.

**Cards**

- **DSH-0.1.2-A1-04** · (behavior; touchpoints #4/#7; required-if-hit). Use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; profiles live under `$DSH_HOME/profiles/<name>` (field note: confirmed by `dsh --help` in an alpha.2 container test); do not hardcode user directories; distinguish profile composition (`cordis.patch.yml` / `agent.cordis.yml`), package manifests, and resolved config. The fixed `profiles/default` path couples the plugin to a profile name and a home layout that the target host owns.
- **DSH-0.1.2-A1-13** (platform shell/directory-picker fixes; conditional; #4/#7) — *not* the operative card here: the fixture contains no persistent-shell or directory-picker compatibility workaround; A1-13 would only matter if such a workaround existed and had to be retired one-by-one after platform reproduction.
- **DSH-0.1.2-A1-21**'s #4 half (agent-presets `roots` pointing at the removed CLI `config/agent-presets/` directory) — not hit: no `roots` configuration exists in the fixture.

---

## #5 · Internal UI / commands / tool registration — **HIT**

**Hit files/lines**

- `fixture/src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` (comment on L9 marks it as the private Host/Web Client path removed by UI decomposition).
- `fixture/src/index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`.

**Concrete coupling points**: a deep `/internal` subpath import of `@deepseek-ai/dsh-session-view`, plus construction of the internal `SessionView` component with an internal `{ enhanced: true }` option.

**Cards**

- **DSH-0.1.2-A1-03** · (breaking; touchpoints #1/#5; required-if-hit). Session-view internals were split up extensively: internal imports from session-view paths no longer work; rebuild imports by owning module; where no stable public seam exists, mark "pending confirmation" — do not guess new paths; ordinary plugins should migrate to public facets/services and stop adding internal imports.
- **API-07** · "Package export ≠ artifact presence" — `@deepseek-ai/dsh-session-view/internal` is a raw deep subpath. The source checkout's export map may list `"./src/*"` while the published tarball's `files` does not contain it → `ERR_MODULE_NOT_FOUND` / missing `.d.ts` after install. Evidence order: packed/installed artifact → exports and declared types at the target tag → implementation/tests → release notes. Treat the seam as high-volatility coupling or move to a maintained entry point (`.` / `/client` / `/types` / `/remote`).
- On the registration call itself: `ctx.contributes.registerCommand` is **not** carded as changed in this corridor. (The carded command change is the *execute* signature gaining an images argument — API-10 `ctx.commands.execute(agent, line, [], signal)` — which would only bite a plugin that *calls* command execution; this fixture only registers.)

**Ruled out inside the class**: `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat` — no matches (so A1-25's client-runtime removal, A1-29 `MarkdownText` labels, and the `useSession`→`useChat` snapshot reshape of API-10 are not hit); `__ModuleLoader__`, `PLUGIN_ID` — no matches (A1-26 client-modules id contract not hit — there is no client bundle in this fixture).

---

## #6 · Custom HTTP / WS / RPC / DOM / CSS channels — **HIT**

**Hit files/lines**

- `fixture/src/index.ts:47-53` — `startLegacyBridge()`: `createServer(...)`, `server.listen(43121, '127.0.0.1')`, with the comment `http://localhost:43121/api/legacy` on L51.
- `fixture/src/index.ts:54` — `void startLegacyBridge`: the function is never invoked (the fixture must remain static-only). The coupling is still a genuine scan hit and a real migration item if the bridge were ever activated.

**Concrete coupling points**: a private loopback HTTP channel on a fixed port (43121) that bypasses the Host Gateway authentication model — it serves its own `'legacy'` response rather than riding a host-owned, authenticated seam.

**Cards**

- **DSH-0.1.2-A1-08** · "Web/API channels use process-scoped bootstrap tokens and signed cookies" (security; #6; required-if-hit). Old channels that reach the Web UI over the network or call `/api` directly may receive 401/403; private routes that bypass auth become security holes. Recipe: use the bootstrap token only for `GET /?token=...` (303 → HttpOnly/SameSite cookie bound to the authority); never put the token into `/api`, WS URLs, or the Authorization header; custom routes registered directly with `ctx.webServer.register()` / `registerUpgrade()` do **not** automatically inherit auth, the Host/Origin fence, CORS, or TLS — handlers must call `ctx.connection.requestRejection(req)` first, or switch to a Connection-owned carrier/seam. "Listening on loopback only" is explicitly not a reason to skip authentication.

**Ruled out inside the class**: `contenteditable`, `setSelectionRange`, `data-input-scroll` — no matches (A1-28's composer-DOM surface not hit); **A1-19** (web plugin acceptance reading the host boot manifest and the token URL) — not hit: the fixture parses no startup log, reads no `window.__DSH_BOOT__`, and concatenates no plugin bundle URL; A1-19 targets browser acceptance scripts/wrappers, which this fixture is not.

---

## #7 · Subprocess / stdout / stderr parsing — **HIT**

**Hit files/lines**

- `fixture/src/index.ts:57-66` — `spawn('dsh', ['--profile', 'headless', prompt])`; `child.stdout.on('data', line => JSON.parse(line.toString()))`; `event.type === 'final'` → `event.text`; resolves on `close`.
- `fixture/scripts/apply-patch.mjs:12-18` — `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })`; `output.split('\n')`; `JSON.parse(line)` per line; `event.type === 'final'` → `event.text`.

**Concrete coupling points**: both call sites assume headless **stdout is JSONL** with `{ type: 'final', text }` frames. Both use the correct argv *shape* (`--profile headless` before the task token) — the defect is purely the output-contract assumption. (Note: per A1-05, rc.2's stdout was *already* final text and never JSONL, so this assumption was already wrong at the from-tag; the corridor does not introduce the breakage, the cards merely state the authoritative target contract.)

**Cards**

- **DSH-0.1.2-A1-05** · "Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final text" (behavior; #7; required-if-hit). Recipe: treat stdout as the final assistant-text channel; receive `dsh: reasoning:` (and `dsh: <code>: <message>` failures) on stderr; judge success by exit code (0 = completion, 1 = failure/abort/no completed turn); do not `JSON.parse` stdout by default.
- **API-06** · the Headless argv and process-output contract: `dsh --profile headless "task"` with launcher flags before the task; stdout = final assistant text (not JSONL, no intermediate tool output); stderr = reasoning deltas / diagnostics; exit 0 complete, exit 1 abort/error/no completed turn; SIGINT maps to 130 and an ordinary SIGTERM stop maps to 0 — record the termination signal instead of guessing from stderr text; consume stdout and stderr concurrently; use argv arrays, never shell-concatenate a user task; default verification with a stub subprocess (the minimal stub matrix: ordinary success / reasoning success / task failure / spawn error).

**Adjacent corridor #7 cards — checked and not hit**: A1-04's #7 half (profiles `acp`/`sdk`/`sdk-minimal` added; standalone bins `dsh-acp-demo`, `dsh-jsonrpc-agent` and their packages removed — the fixture hardcodes no such bin and `--profile headless` remains a valid profile on the target); A1-13 (no shell/picker workaround present); A2-04 (Node 24.0–24.11.1 empty client graph for `dsh web` — targets `dsh web` startup wrappers/CI workarounds; this fixture invokes headless only, and `engines.node` is `^22.19.0 || >=24.0.0` on both tags, unchanged).

---

## No-hit analysis and why "no hit" ≠ "no problem"

**All seven classes hit**, so there is no zero-hit category to report. What follows is therefore the per-class record of what was scanned and ruled out (so the hits are provably complete), followed by the reasons a zero-hit scan could not be read as a compatibility verdict.

**Ruled out, per class (negative evidence from the same scan pass)**:

- #1: `patchedDependencies`, `patch-package`, `monkeypatch` — absent; `cordis.patch.yml` reclassified from "filename hit" to composition per API-08, with the genuine source-patch hit carried by `patch.yml` + `apply-patch.mjs`.
- #2: `tool/code-dispatch`, `tools-code-mode`, `connection/reset` — absent.
- #3: `ctx.remote`, `@Remote`, `@deepseek-ai/dsh-api-*/client` — absent; ten further service-surface cards enumerated under #3 above are symbol-absent.
- #4: `DSH_HOME`, `mkdir`, `openPath` — absent; the only other `readFileSync` (`apply-patch.mjs:8`) reads a repo-relative `patch.yml`, not a host directory (classed under #1).
- #5: `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`, `__ModuleLoader__`, `PLUGIN_ID` — absent.
- #6: `WebSocket`, `MutationObserver`, `insertRule`, `contenteditable`, `setSelectionRange`, `data-input-scroll` — absent.
- #7: `execa`, `Bun.spawn` — absent; `--profile`/`headless` hits are exactly the two call sites listed.

**Configuration/dependency inventory (pre-flight step 0)**: `package.json` declares **no** `peerDependencies`, **no** `engines`, and **no** `@deepseek-ai/*` dependencies; there is no lockfile, no `dsh-plugin.json`, and no resolved config in the fixture; composition lives in `cordis.patch.yml`. The DSH coupling therefore lives entirely in **undeclared** runtime service keys (`apiProxy`) and deep imports (`@deepseek-ai/dsh-session-view/internal`) — phantom dependencies that a dependency-graph check alone would miss, and conversely the emptiness of the dependency list proves nothing about coupling.

**Why a zero hit could not be concluded as "no problem"** (each point grounded in the skill's own references):

1. The seven-class scan is explicitly a **heuristic** ("Zero hits across the seven classes only means 'not detected by the current patterns'"; `pre-flight-patterns.json` `"scope": "heuristic"`). Zero hits still require checking dependencies/imports and running a build, a real mount, and functional smoke tests.
2. **Line-level search cannot reveal data flow** (pre-flight #4) — e.g. whether `ctx.emit('session/event', …)` reaches the durable session log (API-05's silent-write/loud-read) is invisible to the scan.
3. **Typecheck can be silent**: A1-29's `MarkdownText` break produced no typecheck error and only crashed real host rendering; A2-03's field note shows `skipLibCheck: true` turning missing declaration packages into implicit `any`.
4. **False positives and false negatives both exist**: a filename containing `patch` alone is not a hit (API-08), and tsbuildinfo caches can fake `MISSING_EXPORT` diagnostics for code with zero references (A1-21 field note — clean first, then grep).
5. **Cards are curated, not a complete API diff** (SKILL.md Mode C step 4): missing corridor edges or API coordinates must be marked unsupported/pending, not assumed safe.
6. The fixture's own README states the boundary: it only proves the scan patterns have known positive samples — "it does not prove that zero scan hits mean no host coupling."

**Must verify before any migration is called done** (pre-flight template + SKILL.md validation ladder):

- Static: full build + typecheck (run `tsc` with `skipLibCheck: false` at least once to find declaration owners, per API-10/A2-03); close `references/precision-checklist.md` (peer floors, runtime composition vs type declarations, locale pairing, channel auth with protocol preservation).
- Composition: `dsh --profile <p> --dump-config` on an isolated profile — row id/name, whole-config replacement semantics, no `pending (waiting for service: …)` rows (A2-08's runtime-pending failure mode is invisible to typecheck).
- Patch surface: re-base `patch.yml`'s target path/symbol against the exact alpha.2 tag (A1-03) — expected outcome "pending confirmation" until the owning module is identified.
- Runtime: cold boot a real profile; prove entry activation and that required/provided services are not pending; run one message → tool → response flow (or the plugin's equivalent `write-note`/`rename-session` path).
- Wrapper: exercise the headless wrapper against the API-06 stub matrix (success / reasoning / failure / spawn error), asserting stdout is consumed as final text, stderr as reasoning/diagnostics, and the exit code as authoritative.
- Channel: if the loopback bridge is ever activated, wire it through the Connection auth gate (A1-08) and prove 401/403 behavior for missing/bad cookies and wrong Host/Origin.

## Card index for this scan

| Full ID | Short | Touchpoint | Role in this scan |
|---|---|---|---|
| DSH-0.1.2-A1-01 | A1-01 | #3 | APIProxy removal + operation mapping (`session.rename`, `llm.providers`) |
| DSH-0.1.2-A1-02 | A1-02 | #2 | intermediate edge: `ignorable` removed in alpha.1 (superseded by net state) |
| DSH-0.1.2-A1-03 | A1-03 | #1, #5 | session-view internals split; patch target + internal import |
| DSH-0.1.2-A1-04 | A1-04 | #4, #7 | `DSH_HOME`/profile/launcher as source of truth; no hardcoded dirs |
| DSH-0.1.2-A1-05 | A1-05 | #7 | headless stdout = final text (never JSONL); stderr reasoning; exit code |
| DSH-0.1.2-A1-08 | A1-08 | #6 | bootstrap token + signed cookie auth model for custom channels |
| DSH-0.1.2-A2-01 | A2-01 | #2 | net state: `ignorable` restored for third-party persisted events |
| DSH-0.1.2-A2-02 | A2-02 | #3 | `RemoteError` + namespaced codes for the migrated call sites |
| API-01 / API-02 | — | #3 | face rule (host injects domain service) + `RemoteResult` control flow |
| API-05 | — | #2 | envelope restored but public `append` cannot write `ignorable` |
| API-06 | — | #7 | headless argv/output contract + stub matrix |
| API-07 | — | #5 | package export ≠ artifact presence (deep `/internal` subpath) |
| API-08 | — | #1 | `cordis.patch.yml` is composition, not a source patch |

*Report produced read-only; no fixture file was modified (verified: only reads/globs/greps were performed against `fixture/`, and this report is the sole write, under `agent-output/S1-static-scan/`).*
