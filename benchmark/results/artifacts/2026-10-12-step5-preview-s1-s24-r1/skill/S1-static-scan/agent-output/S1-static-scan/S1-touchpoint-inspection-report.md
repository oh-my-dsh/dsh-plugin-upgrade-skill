# S1 · Static Touchpoint Inspection Report (read-only)

- **Subject plugin**: `legacy-plugin` (fixture copy under `.../S1-static-scan/fixture/`), declared `package.json#name = legacy-plugin`, `version = 0.1.1`, `private: true`, `type: module`. This is the **plugin release version**, not the DSH host corridor.
- **Corridor scanned**: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2`
  (corridor index order 2 → 3 of `references/README.md`; card files `v0.1.2-alpha.1.md` / `v0.1.2-alpha.2.md`, exact ledger `api-migration-0.1.2-alpha.2.md`).
- **Mode**: Mode A / pre-flight `#1`–`#7` static scan only. No file under the fixture was created, modified, or deleted; no install, no package script, no `git`, no network.
- **Read-only proof**: SHA-256 of every fixture file is recorded under "Baseline (rollback) & read-only evidence" at the end; all five non-README source/config files are byte-identical to the skill's own `examples/legacy-plugin/` originals, and nothing was written inside the fixture tree.

Path convention below: `src/index.ts` = `fixture/src/index.ts`, etc.

## Method

1. Built the corridor by `from → to` edges (not filename order): `rc.1→rc.2` (3 cards, `DSH-0.1.1-R2`), `rc.2→alpha.1` (28 cards, `DSH-0.1.2-A1`), `alpha.1→alpha.2` (8 cards, `DSH-0.1.2-A2`).
2. Ran the seven `pre-flight-patterns.json` regex classes over every tracked file in the fixture (content search, read-only; `rg` is not installed in this container, so the same patterns were run through the environment's content-search tool — one class needed the `(?<!cordis\.)` look-around rewritten as a post-filter, applied manually, see #1).
3. Mapped each hit to cards by **touchpoint intersection** (SKILL Mode C step 4), then folded the corridor to its net state (step 2 of the same section) before writing any action recommendation.

## Summary table

| # | Touchpoint | Hit? | Files / lines | Cards (0.1.1-rc.2 → 0.1.2-alpha.2) |
|---|---|---|---|---|
| 1 | Source patch / monkey patch | **YES** | `patch.yml:2-6`; `scripts/apply-patch.mjs:5-6,8`; `cordis.patch.yml:2-6` (negative control) | `DSH-0.1.2-A1-03` (required-if-hit) + `API-08` (classification) + `API-07` (subpath reality) |
| 2 | Internal / persistent events | **YES** | `src/index.ts:13-22` | `DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01` (folded) + `API-05` (capability gap) |
| 3 | Internal service / Remote | **YES** | `src/index.ts:24-32` | `DSH-0.1.2-A1-01` (required-if-hit) + `API-01` + `DSH-0.1.2-A2-02` (conditional) |
| 4 | Host directory read/write | **YES** | `src/index.ts:34-38` | `DSH-0.1.2-A1-04` (required-if-hit; touchpoints #4/#7) |
| 5 | Internal UI / commands / tools | **YES** | `src/index.ts:9-10,40-43` | `DSH-0.1.2-A1-03` (required-if-hit; #1+#5) + `API-07` |
| 6 | Custom HTTP/WS/RPC/DOM/CSS channel | **YES** | `src/index.ts:45-54` | `DSH-0.1.2-A1-08` (required-if-hit) |
| 7 | Subprocess / stdout / stderr parsing | **YES** | `src/index.ts:56-67`; `scripts/apply-patch.mjs:11-19` | `DSH-0.1.2-A1-05` + `DSH-0.1.2-A1-04` + `API-06` |

**All seven classes hit.** There is no zero-hit class in this fixture, so §"No-hit discipline" below covers (a) the sub-surfaces ruled out inside each class and (b) why a zero result could not have been read as "no problem".

---

## #1 · Source patch / monkey patch — **HIT**

**Evidence**

- `patch.yml:2-6` — a patch *surface* replacing host source:
  `target: src/session/view/SessionView.ts`, `find: export function renderSessionView` → `replace: export function renderSessionViewPatched`.
- `scripts/apply-patch.mjs:5-6` — `process.env.DSH_HARNESS_SOURCE_ROOT` is mandatory host-source-root indirection (the dsh-tui patch lane; cf. `A1-03` field note); `:8` reads `patch.yml` and `:9` echoes the surface.
- `cordis.patch.yml:2-6` — row `legacy-plugin` with `patch: [patch.yml]`. **Classified as composition, not a source patch** (`API-08`): an ordinary `cordis.patch.yml` is the official Profile/Bundle overlay; a filename containing `patch` alone is not a hit for this class.

**Coupling points hit**

1. The patch target path `src/session/view/SessionView.ts` and the symbol `renderSessionView` are host-source coordinates that exist only in the 0.1.1 layout.
2. The whole lane is gated on `DSH_HARNESS_SOURCE_ROOT` (env-driven host source root) rather than on a published artifact.
3. `patch.yml` is read with a process-cwd-relative path (`readFileSync('patch.yml')`), so composition depends on where the script is launched from.

**Cards**

- **`DSH-0.1.2-A1-03`** (breaking, `#1`+`#5`, **required-if-hit**): "Session view internals split up extensively… patch target paths, internal imports, or UI registration points no longer work." The patch target is literally a session-view file, so the primary collision for this class is `A1-03`. Action per card: check the host paths one-by-one against an **exact-tag compare**; capabilities with no stable public seam are *pending confirmation* — do not guess new paths. The pre-flight text adds the same rule: when no equivalent owning module exists in the target tag, mark it pending confirmation.
- **`API-08`** — keeps `cordis.patch.yml` out of the source-patch bucket and puts it in the composition bucket (row / id / inject / whole-config replacement semantics). Composition precedence on alpha.2: bundle `dsh.profile.bundles` list → `$DSH_HOME/profiles/<name>/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → CLI `--patch` overlays in argv order.
- **`API-07`** (adjacent, applies to #5's import below as well) — "package export ≠ artifact presence": a path that looks importable in the source checkout may be absent from the published tarball (`ERR_MODULE_NOT_FOUND` / missing `.d.ts`). Relevant to any rebuild that keeps a raw source seam.

**Action shape (for the plan, not executed now)**: compose the patch surface against the exact `dsh-v0.1.2-alpha.2` tag source; every old target must map to a target-version file or carry an explicit removal reason. Until that compare is run, `renderSessionView` / `src/session/view/SessionView.ts` → **pending confirmation**.

---

## #2 · Internal event names and persistent events — **HIT**

**Evidence** — `src/index.ts:13-22`

```ts
// #2 Producer of an external informational durable event.
// alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract.
ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })   // :15-19
ctx.on('session/event', (event: any /* SessionEvent */) => { console.log(...) })                                  // :20-22
```

**Coupling points hit**

1. **Producer role**: emits a *third-party, unknown* event type (`legacy/informational-note`) into `session/event` with `ignorable: true`.
2. **Observer role**: subscribes to `session/event` and reads `event.type` only (no schema validation).
3. The locoment at `:14` is itself evidence that the author already knew the corridor fold; the *code* still keeps the marker — which is the correct net state, and must not be "fixed" into a deletion.

**Cards — corridor folding (the required reasoning)**

- `DSH-0.1.2-A1-02` (breaking, `#2`, **required-if-target-is-alpha.1**): alpha.1 cannot retain `ignorable: true` on third-party informational events; unknown persisted events are rejected on reload.
- `DSH-0.1.2-A2-01` (fix, `#2`, **required-if-hit**): alpha.2 **restores** the retention semantics of envelope / persistence / reload / transport. Explicitly a "revert of A1-02".
- **Net state for the target `0.1.2-alpha.2`: the marker exists again.** Per the corridor rule ("if a field is removed in an intermediate version and restored in the target, do not delete and re-add it"), the migration must **keep `ignorable: true`** and must **not** install an alpha.1-era defensive removal. A migration that deletes the marker here would be wrong on the target and would reintroduce the alpha.1 breakage (`A2-01` symptoms: old adapters that keep dropping the marker make first-party readers reject sessions containing unknown events). Conversely, a branch that only targets alpha.1 would have to drop it — that branch is not this corridor.
- **`API-05`** (same corridor, same surface) — the *residual* risk that survives the folding: alpha.2 restores the **envelope field**, but the public `Session.append()` still has no `ignorable` parameter, so an out-of-repo producer has no supported public write surface for the marker. Recommendation from the card: mark the producer seam as a **capability gap**, never fake a public entry via cast; if durable plugin state is needed, use a plugin-owned sidecar/store keyed by Session id. Unknown events **without** the marker remain required-on-read (fail closed) — the marker is not a consumer-side filtering directive.

**What is not determinable statically** (flagged, not assumed): whether `ctx.emit('session/event', …)` reaches the durable envelope at all in this plugin's topology, and whether persistence/reload/transport owners preserve the field end-to-end. Pre-flight requires distinguishing producer / persistence / reload / transport / plain-observer roles; this fixture gives a producer + an observer only.

---

## #3 · Internal service probes / Remote — **HIT**

**Evidence** — `src/index.ts:24-32`

```ts
const apiProxy = await ctx.get('apiProxy')                       // :26, :30
await apiProxy.invoke('session.rename', { id, title })           // :27
return apiProxy.invoke('llm.providers')                          // :31
```

**Coupling points hit**

1. Service key `apiProxy` obtained by `ctx.get(...)` — the rc.2 host-plane facade (type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`).
2. Two legacy RPC operations: `session.rename` and `llm.providers`.
3. No `inject` declaration anywhere in the file, so the wait is dynamic (`await ctx.get`) rather than declared — swallowed by `ctx: any` (see "No-hit discipline").

**Cards**

- **`DSH-0.1.2-A1-01`** (breaking, `#3`, **required-if-hit**) — "APIProxy removed, Host/Web Client calls moved to `@Remote`". Operation-level mapping from the card: `session.rename` → `session/rename` (client projection `ctx.remote.session.rename`); `llm.providers` → **split into two**: `llm/listProviders` + `llm/listConfigurableProviders`.
- **`API-01`** — the plane discipline that decides *which* of those mappings is legal here. This plugin runs its calls on the **Host plane** (`ctx.get('apiProxy')` is the server-side facade). Per the `A1-01` field note and API-01: a host-plane consumer must **skip the client gateway and inject the owning domain service directly** (e.g. `inject: ['llm']` then `ctx.llm.listProviders()`). Mechanically rewriting `apiProxy` → `remote` produces `pending (waiting for service: remote)` and hangs forever. Therefore:
  - `llm.providers` → host-side `inject: ['llm']` + `ctx.llm.listProviders()` (executable contract per API-01's minimal Host pattern).
  - `session.rename` on the host plane → the `A1-01` table is the **Web Client generated projection**, not a Host service-key table; the owning domain service must be confirmed **item-by-item against the exact `dsh-v0.1.2-alpha.2` tag** → **pending confirmation**, do not reverse-engineer from the client table.
- **`DSH-0.1.2-A2-02`** (breaking, `#3`, **required-if-hit** — *conditional on this plugin taking a `ctx.remote` route*): `RemoteResult`'s error object becomes a `RemoteError` instance and error codes gain namespaces (`session-not-found` → `session/not-found`, `internal` → `gateway/internal`, `cancelled` → `gateway/cancelled`, `agent-busy` → `session/agent-busy`); `isRemoteFailure` replaces `instanceof`. If the plugin stays host-plane and calls domain services directly, this card does not apply; if any part of it becomes a Remote consumer, error branching must be by `result.error.code`, never by parsing `Error.message` (`API-02`/rollup "Remote call error flow").

**Ruled out in this class** (content-searched, zero matches in every fixture file): `userQuestions.registerProvider` (`A1-20`), `resolveSessionPreset` (`A1-21`), `isTokenDelta` (`A1-22`), `@deepseek-ai/dsh-client-runtime` (`A1-25`), `connection.api.*` (`A1-30`), `ctx.workspaces.*` / `ctx.uiWorkspace` navigation (`A1-32`), `pluginInventory/list` (`A2-05`), `ctx.remote.$host` (`A2-06`), `sessionProjections` inject (`A2-08`), `settingsNamespace` / `installSettingsSection` / `deepEqualJson` (`A2-10`, `R-11`).

---

## #4 · Direct host directory read/write — **HIT**

**Evidence** — `src/index.ts:34-38`

```ts
const profileDir = join(homedir(), '.dsh', 'profiles', 'default')          // :36
writeFileSync(join(profileDir, 'legacy-note.txt'), text)                   // :37
```

**Data flow (traced, as pre-flight requires for path-construction hits)**: `text` arrives from the caller through the `ctx.register('write-note', …)` service (`:35`) with no validation, is concatenated into a **hard-coded** profile directory built from `homedir()`, and is written there with `writeFileSync`. The write is not guarded by an existence check and `text` is never sanitized.

**Coupling points hit**

1. Hard-coded host path `~/.dsh/profiles/default` — assumes the 0.1.1 fixed profile directory *and* that a profile named `default` exists and is writable.
2. Uses `homedir()` instead of the runtime `DSH_HOME`, so it ignores the actual profile the operator launched.
3. Writes plugin-private data into a host-owned directory (mixed ownership; also a collision surface if the profile directory is relocated/created by the launcher).

**Cards**

- **`DSH-0.1.2-A1-04`** (behavior, touchpoints **#4 and #7**, **required-if-hit**) — "ACP/SDK examples merged into the `dsh` profile, standalone demo bins and packages removed… Wrappers that hardcode these bins, old process trees, or fixed profile paths no longer match." Migration recipe verbatim: use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; distinguish profile composition (`cordis.patch.yml` / `agent.cordis.yml`), package manifests, and resolved config; **do not hardcode user directories**. (The same card also owns the `#7` hit, see below.)
- **`DSH-0.1.2-A1-13`** (#4, conditional) and **`DSH-0.1.2-A1-21`** (#4, required-if-hit) are the other `#4` cards in the rollup index; **not hit** here — `A1-13` needs a platform-shell / Windows directory-picker compatibility workaround (none present) and `A1-21` needs agent-presets `roots` configuration (the fixture's `cordis.patch.yml` contains exactly one row, `legacy-plugin`).

**Action shape**: re-point the write at the runtime profile root derived from `DSH_HOME` + the target profile, and treat profile-dir existence/writability as a runtime check; verify with a cold boot of the new profile and an upgrade boot of the old one (`A1-04` verification).

---

## #5 · Internal UI / commands / tools — **HIT**

**Evidence**

- `src/index.ts:9-10` — `// Touchpoint #5: private Host/Web Client path removed by UI decomposition.` / `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`
- `src/index.ts:40-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`

**Coupling points hit**

1. Private deep subpath import `@deepseek-ai/dsh-session-view/internal` (matches both the `#3` pattern `/internal` and the `#5` UI class).
2. `ctx.contributes.registerCommand(...)` — command registration whose handler constructs and returns a host-internal `SessionView` instance with a plugin-chosen option (`enhanced: true`).

**Cards**

- **`DSH-0.1.2-A1-03`** (breaking, `#1`+`#5`, **required-if-hit**) — the card for exactly this fixture shape: "Host/Web Client integrations that patch host source **or import from internal session-view paths**". Recipe: check host paths one-by-one against an exact-tag compare, rebuild imports by owning module, and mark capabilities with no stable public seam as *pending confirmation*; ordinary plugins should prefer public facets/services over more internal imports. Verification per card: run a patch-surface composition against the target tag source and map every old target to a target-version file or an explicit removal reason.
- **`API-07`** — the `./internal` seam is a *raw source* seam: before keeping it, check `exports`, `files`, and the **packed artifact** of the target version (exports can declare a subpath that the tarball does not contain). Treat any retained raw seam as high-volatility coupling pinned to an exact version.
- **Not carded, stated honestly**: `ctx.contributes.registerCommand` itself has **no dedicated card** in this corridor. The `#5` card list (`A1-03/06/09/10/11/26/28/29` + `API-10`) contains nothing about Host-side command *registration*; `API-10`/`R-11` only change the **`ctx.commands.execute` call arity** (`(agent, line, signal)` → `(agent, line, [], signal)`), which this fixture does not call. So the registration line is a *hit for the class* whose real carded risk is the internal import and the view construction, and the replacement seam is **pending confirmation** against the target tag's public types/examples.

**Ruled out in this class**: `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`, `__ModuleLoader__`, `PLUGIN_ID` (`A1-25` / `A1-26` / `API-10`), `MarkdownText` and `<textarea>`/DOM manipulation (`A1-28`, `A1-29`), the PTC vocabulary (`A1-06`) — zero matches. `A1-26` (client-modules registration id must equal `package.json` name) applies only to a plugin with a Web Client half; this fixture is Host-side with no client bundle and no `dsh.client` declaration, so it is out of scope (recorded, not counted as a hit).

---

## #6 · Custom HTTP / WS / RPC / DOM / CSS channel — **HIT**

**Evidence** — `src/index.ts:45-54`

```ts
function startLegacyBridge() {                                                  // :47
  const server = createServer((_request, response) => { response.end('legacy') })// :48-50
  server.listen(43121, '127.0.0.1') // http://localhost:43121/api/legacy         // :51
  return server
}
void startLegacyBridge                                                          // :54
```

**Coupling points hit**

1. A private loopback HTTP server on `127.0.0.1:43121` advertising the route `http://localhost:43121/api/legacy` — an `/api`-shaped route **outside** the Host Gateway.
2. The bridge is not registered with the host web server and never invokes the Connection auth gate.
3. The function is currently unreferenced (`void startLegacyBridge`); the channel is dormant, not absent.

**Cards**

- **`DSH-0.1.2-A1-08`** (security, `#6`, **required-if-hit**) — "Web/API channels use process-scoped bootstrap tokens and signed cookies." Applies to plugins with **custom loopback HTTP/WS/RPC**; the card's own wording kills the usual escape hatch: *"listening on loopback only" is not a reason to skip authentication.* Consequences for this fixture: old channels that reach the Web UI over the network or call `/api` directly can receive 401/403, and private routes that bypass auth become security holes. Recipe: use the bootstrap token only for `GET /?token=...` (303 + HttpOnly/SameSite cookie bound to the authority), never put the token into `/api`, WS URLs, or the Authorization header; routes registered directly with `ctx.webServer.register()` / `registerUpgrade()` do **not** inherit auth, the Host/Origin fence, CORS, or TLS, so handlers must call `ctx.connection.requestRejection(req)` first or move to a Connection-owned carrier/seam. Verification: wrong Host/Origin → 403, missing/bad cookie → 401, and a custom route must not be considered protected before it is explicitly wired into the gate.
- **`DSH-0.1.2-A1-28`** (`#6` DOM + `#5`) is the other `#6` card; **not hit** — there is no DOM/composer manipulation in this fixture (no `contenteditable`, `setSelectionRange`, `data-input-scroll`), and the fixture is Host-side, not a browser plugin.
- **`DSH-0.1.2-A1-19`** (`#6`/`#7`, required-if-hit) is the browser-acceptance counterpart (token URL → cookie → `window.__DSH_BOOT__.entries` → advertised resource → real mount). **Not hit** — no `dsh web` acceptance script, no bundle-path concatenation, no `HTTP 200`-only check anywhere in the fixture. Recorded because it constrains any future browser-facing use of this channel.

---

## #7 · Subprocess / stdout / stderr parsing — **HIT**

**Evidence A** — `src/index.ts:56-67`

```ts
const child = spawn('dsh', ['--profile', 'headless', prompt])   // :59
let result = ''
child.stdout.on('data', (line: Buffer) => {                      // :61-64
  const event = JSON.parse(line.toString())                      // :62
  if (event.type === 'final') result = event.text                // :63
})
child.on('close', () => resolve(result))                          // :65
```

**Evidence B** — `scripts/apply-patch.mjs:11-19`

```ts
const output = execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })  // :12-14
for (const line of output.split('\n')) {
  if (!line.trim()) continue
  const event = JSON.parse(line)                                  // :17
  if (event.type === 'final') console.log('[legacy] headless ok:', event.text)
}
```

**Coupling points hit**

1. Both call sites **assume stdout is JSONL** (`JSON.parse` per line/chunk, looking for `type === 'final'`).
2. Exit code is never read; success is inferred from a parsed `final` event that can never arrive.
3. stderr is ignored entirely (no reasoning/diagnostic handling), and there is no cancellation, no `AbortSignal`, no spawn-error and no teardown handling.
4. In A, `child.stdout.on('data', …)` parses each *chunk* as one whole line — chunk boundaries are not message boundaries, so even a hypothetical JSONL stream would be mis-parsed.
5. In B, `execFileSync` blocks on exit and then splits the captured text — the API-06 anti-pattern "wait for process exit before reading pipes".
6. `scripts/apply-patch.mjs` reads `patch.yml` relative to `process.cwd()` (`:8`) and requires `DSH_HARNESS_SOURCE_ROOT` (`:5-6`), so its own behavior is launch-directory dependent (cross-reference #1).

**Cards**

- **`DSH-0.1.2-A1-05`** (behavior, `#7`, **required-if-hit**) — "Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final text." The card states rc.2's stdout was **already** the final assistant text and was **never JSONL**; the alpha.1 delta is the stderr reasoning segment. Recipe: treat stdout as the final assistant-text channel; receive `dsh: reasoning:` / `dsh: <code>: <message>` on stderr; judge success by exit code (0 = completed, 1 = abort/error/no completed turn); **do not `JSON.parse` stdout by default**. Verification must cover plain-text success, reasoning present, empty final text, direct launch failure and non-zero exit.
- **`DSH-0.1.2-A1-04`** (behavior, touchpoints **#4 and #7**, **required-if-hit**) — launcher wrappers must use the runtime `DSH_HOME`, the target profile and the official launcher instead of hardcoded bins/paths; wrappers that hardcode old bins or fixed profile paths no longer match. (Same card as the `#4` hit — one card, two touchpoints.)
- **`API-06`** (Headless argv and process-output contract) — the precise target contract: correct invocation is `dsh --profile headless "<task>"` with launcher flags **before** the first non-launcher token (`dsh --profile headless --patch ./plugin.patch.yml "verify the plugin"`); **both fixture call sites already use the correct argv shape and are not broken on argv**; stdout = final assistant text (not JSONL, no intermediate tool output), stderr = `dsh: reasoning:` deltas / `dsh: <code>: <message>` failures, exit 0 = completed, exit 1 = abort/error/no completed turn, `SIGINT` → 130, ordinary `SIGTERM` → 0. Best-practice items that apply here: use argv arrays (both do), consume stdout and stderr concurrently, and handle cancellation, signals, spawn errors and teardown without waiting for exit. `--dump-config` is a composition check and cannot carry task/app args.

**Ruled out in this class**: `execa` / `Bun.spawn` (zero matches — plain `node:child_process` only); the obsolete argv forms `dsh headless …` and `dsh --profile headless -p …` (API-06 names them as non-target command shapes; the fixture does not use them); `DSH-0.1.2-A2-04` (Node 24.0–24.11.1 empty client graph for `dsh web` — applies to startup wrappers/CI matrices that force Node 22 or skip `dsh web`; the fixture spawns `dsh --profile headless`, and there is no CI matrix in this copy); `DSH-0.1.2-A1-13` (platform shell / directory-picker workarounds — none present).

---

## Corridor edges checked for completeness

- **`dsh-v0.1.1-rc.1 → dsh-v0.1.1-rc.2`** (`DSH-0.1.1-R2-01/02/03`): image-attachment `originalDimensions`, `read_image` scaling facts, DeepSeek Files-API preference. **No hits** — the fixture contains no image, attachment, `read_image`, tool-schema, or LLM-adapter surface at all (verified by content search).
- **`from` pinning**: the brief says "dsh 0.1.1 era". I pinned `from` at `dsh-v0.1.1-rc.2`, the last published 0.1.1 tag and the exact `from` of the alpha.2 API ledger. If the real source baseline is older than rc.2, the earlier edges (`rc.8→rc.1` draft, 9 cards: repository-plugins removal, `dshClient`→`dsh.client` merge, client-modules scan → bundle `dsh.client`, strict injection + weak `ctx.get`, session-event `type`-not-`kind` contract, `tasks.peek` removal, 0812 service renames `httpServer`→`webServer` / `tasks`→`jobs`) would come back into scope — `ctx.get('apiProxy')` in particular is the kind of call site that edge's "strict injection" card touches. **Residual risk / pending**: the exact patch tag must be confirmed before the plan is executed. Pre-flight §1.5 (ghost host — pin `from` to the *running process*, not the disk) is not executable on a static copy: there is no host process to probe, so `from` rests on the tag declaration above.
- `DSH-0.1.2-A1-06` (PTC rename) appears in the `#2`/`#3`/`#5`/`#7` related-card lists but its vocabulary (`tools.mode: 'code'`, preset id `code`, `CodeDispatch*`, `tools/code-dispatch*`, `tools-code-mode`) has zero matches here.

---

## No-hit discipline

### Files scanned (complete set — the fixture has no other files)

| File | Lines | Notes |
|---|---|---|
| `src/index.ts` | 68 | sole source file; all of #2–#7's evidence lives here |
| `scripts/apply-patch.mjs` | 19 | #1 + #7 evidence |
| `patch.yml` | 6 | #1 evidence |
| `cordis.patch.yml` | 6 | composition (negative control for #1 per `API-08`) |
| `package.json` | 9 | identity only |
| `README.md` | 16 | benchmark's own copy; used as a cross-check only, never as evidence — every hit above is cited from source files |

**Excluded / absent (nothing to scan, not silently skipped)**: `node_modules/`, generated artifacts, `dsh-plugin.json`, any lockfile (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`), `AGENTS.md` / `CLAUDE.md`, CI configuration, tests, `.npmrc`. No `.dsh/` directory, no client bundle, no `dsh.client` manifest declaration. Recursive listing of the fixture returned exactly the six files above (four at root, two in `src/`/`scripts/`).

Per the workspace boundary I did **not** list, read, or glob any parent or sibling directory of the fixture (no repository root, no `benchmark/` tree, no `solution/`, no `tests/`); the only other path read was the skill at `skills/plugin-upgrade/`.

### Sub-surfaces ruled out

Inside every class, named identifiers were content-searched across all six files and produced **zero matches**, with the card each search would have triggered:

- `#2`: `tool/code-dispatch`, `tools-code-mode`, `connection/reset` → would trigger `A1-06` / `A2-06` / `A1-19` lanes.
- `#3`: `userQuestions.registerProvider` (`A1-20`), `resolveSessionPreset` (`A1-21`), `isTokenDelta` (`A1-22`), `dsh-client-runtime` (`A1-25`), `connection.api` (`A1-30`), `ctx.workspaces` / `ctx.uiWorkspace` / `connectWorkspace` / `pickDirectory` (`A1-32`), `pluginInventory/list` (`A2-05`), `ctx.remote.$host` (`A2-06`), `sessionProjections` (`A2-08`), `settingsNamespace` / `installSettingsSection` / `deepEqualJson` (`A2-10`, `R-11`).
- `#4`: platform-shell / directory-picker workarounds (`A1-13`), agent-presets `roots` configuration (`A1-21`).
- `#5`: `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`, `__ModuleLoader__`, `PLUGIN_ID` (`A1-25`, `A1-26`, `API-10`), `MarkdownText` / composer DOM (`A1-28`, `A1-29`), `ctx.commands.execute` arity (`API-10`/`R-11`).
- `#6`: `WebSocket`, `MutationObserver`, `insertRule`, `contenteditable`, `setSelectionRange`, `data-input-scroll`, `router.(get|post|put|delete)` (`A1-28`); `dsh web` acceptance / boot manifest readiness parsing (`A1-19`).
- `#7`: `execa`, `Bun.spawn`; obsolete `dsh headless` / `-p` argv forms (`API-06`); Node-version pinning or `dsh web`-skipping workarounds (`A2-04`).
- Whole corridor edges: `DSH-0.1.1-R2-01/02/03` (rc.1→rc.2, see above).

### Why "no hit" could not have been read as "no problem"

1. **The scan is line-level regex, not data flow.** Pre-flight states it outright: zero hits across the seven classes only means "not detected by the current patterns"; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests. For `#4` a path-construction grep cannot follow variables, which is why `write-note`'s `text` had to be traced by hand — and why an unreferenced, dormant channel (`void startLegacyBridge`, `#6`) is still counted as a hit.
2. **Dynamic indirection is invisible to grep.** `ctx.get('apiProxy')` happens to be a literal, but a computed key or a specifier assembled at runtime (`['llm','providers'].join('.')`, the technique `R-02` uses precisely to dodge static external scans) would return zero hits while still being coupled. Same for `import()` of a computed path.
3. **`ctx: any` disables the compiler lane entirely.** Every entry point is typed `activate(ctx: any)` / `(event: any /* SessionEvent */)`. Typecheck would return **zero diagnostics even for genuinely removed exports**, so the export-drift cards (`R-11`: `CallId`, `JsonValue`, `collectSessionTitleMessages`, `todo/write`, the agent-presets error classes, `LlmModelDiscoveryError`, `FIRST_PARTY_SECTION_ORDER`, …) cannot be screened statically on this source at all. A real typecheck needs the real `Context` and target-tag declarations, plus one `skipLibCheck: false` diagnostic pass (`A2-03` field note).
4. **Dependency and packaging surfaces are empty, not clean.** `package.json` carries no `dependencies`, no `devDependencies`, no `peerDependencies`, no `engines`, and no `@deepseek-ai/*` imports, and there is no lockfile. So the install-time cards cannot be evaluated rather than passed: `A1-24` (pi-ai second instance), `A2-03`/`A2-08` (peer pruning/addition, `sessionProjections` runtime-pending), `R-08` peer-floor prerelease semantics (`^0.1.0-rc.8` does **not** admit `0.1.2-alpha.2`), and `R-05`'s removed-package inventory (`@deepseek-ai/dsh-acp-demo`, `dsh-acp-snapshot`, `dsh-client-runtime`, `dsh-host-apiproxy`, `dsh-sdk-jsonrpc-demo` removed rc.2→alpha.1) can only be checked on the import surface of one file.
5. **The fixture is deliberately not buildable/installable** (`README.md:3`: "it is not an installable plugin… that it cannot be compiled is by design"), so build, typecheck, tests, pack, mount, and any behavioral or headless round trip were **not run** and must not be claimed. Zero hits here also cannot cover host behavior changes that official material declares no plugin action for, and cannot detect the `#1` collision without composing `patch.yml` against the real target tag.
6. **Coverage size.** The entire surface is ~4.4 KB across six files. A zero-hit result on that much code says nothing about a real plugin's remaining files, templates, or assets.

## Validation status

- **Not run** (static copy, read-only mandate, and the brief's no-execute rule): build, typecheck, plugin tests, pack/artifact smoke, isolated-profile cold boot, Loader mount, headless round trip, Web token→cookie→boot-manifest lane.
- **Run**: seven-class pattern scan over all six files; identifier-level ruled-out searches; corridor read and folding; SHA-256 baseline.
- Distinctions kept: "pattern hit" ≠ "typecheck verified" ≠ "real host behavior verified" (`api-migration` closing rule).

## Baseline (rollback) & read-only evidence

SHA-256 of the fixture at scan time (nothing was written inside the fixture tree):

```
a9feaa3ec0f63cedf8e84416f532b53086a7c4ef508dbc280957e79f16dd9668  cordis.patch.yml
af1e498ca6f80b65329c7a1dd017d97761391d7032cf7d02f3f44832f920446e  package.json
de622598fc298f54f2f86ee48734c0c615f02bc9bab6fe9ba234339e6c595b3b  patch.yml
84b8fd89d9e05abcc4543381a5c50d81fd0f57344879d8bf560dcf3495e79800  README.md
4d6744baf58fe05524bdcf23a5e289a6292e059bb2272342a5a0448e091221f0  scripts/apply-patch.mjs
429979274fe9776e22809e0a2725c88c70b7b3127926a8efcc0e4335d7c086d0  src/index.ts
```

`cordis.patch.yml`, `package.json`, `patch.yml`, `src/index.ts`, `scripts/apply-patch.mjs` are byte-identical (SHA-256) to `skills/plugin-upgrade/examples/legacy-plugin/`; only `README.md` differs (the benchmark's S1-specific copy).

Recoverable paths owned by this task: the report file only. No rollback of fixture, skill, evaluator, or host state is needed or claimed.

## Pending / residual risk

1. `src/session/view/SessionView.ts` + `renderSessionView` (`#1`) and the `@deepseek-ai/dsh-session-view/internal` seam (`#5`): both need an exact-tag compare / public-seam confirmation on `dsh-v0.1.2-alpha.2` before any edit — **pending confirmation**, no guessed replacements.
2. Host-plane owner service for `session.rename` (`#3`): confirm against the target tag's declarations; do not derive Host keys from the `A1-01` client projection table.
3. `from` tag unconfirmed (`dsh 0.1.1 era` vs `0.1.1-rc.2`); ghost-host probe impossible on a static copy.
4. Producer seam for `ignorable` (`#2`): capability gap — public `Session.append()` cannot write the marker on alpha.2 (`API-05`); decide sidecar/store vs dropping durable state before implementing.
5. Empty dependency/packaging surface blocks evaluation of `A1-24`, `A2-03`, `A2-08`, `R-05`, `R-08`.
6. `ctx: any` everywhere means the compiler cannot be used as a detector; a real typecheck with target declarations and one `skipLibCheck: false` pass is mandatory before any "no further impact" claim.
