# S1 · Static Touchpoint Scan — legacy-plugin (read-only)

**Task**: read-only touchpoint inspection of the legacy plugin fixture (dsh 0.1.1 era) before a planned migration to **dsh 0.1.2-alpha.2**.
**Skill mode**: A · inspect (read-only). No file under the fixture was modified, created, deleted, or renamed; no build, install, or execution was performed (the fixture is static by design and documented as non-executable).

## 0. Configuration and dependency inventory (pre-flight step 0)

Scanned files (complete fixture tree, 6 files): `README.md`, `package.json`, `cordis.patch.yml`, `patch.yml`, `scripts/apply-patch.mjs`, `src/index.ts`.

| Item | Finding |
|---|---|
| Plugin identity | `legacy-plugin` v0.1.1, `private: true`, `type: module`; source fixture only — **not installable** (per fixture README; that it cannot compile is by design) |
| Install track | copied static fixture (no git checkout, no lockfile, no `node_modules`) |
| `dsh-plugin.json` | absent (community-standard manifest not adopted) |
| Profile composition | `cordis.patch.yml` — one row `id: legacy-plugin`, `config: {}`, plus a nonstandard `patch:` list pointing at `patch.yml` |
| `peerDependencies` / `engines` | **none declared**, although `src/index.ts:10` imports `@deepseek-ai/dsh-session-view/internal` — an undeclared direct dependency on a host-internal package (packaging risk; cf. DSH-0.1.2-A2-03's opposite direction: consumers must declare what they import) |
| Scripts | `apply-patch`: `node scripts/apply-patch.mjs` (touches #1/#7 below) |
| Version-coordinates note | the plugin's own `version: "0.1.1"` is the plugin release version, not the DSH host corridor; the corridor here is the host line `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2` |

**Corridor construction** (per `references/README.md` index, never filename order):
`dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1` ([v0.1.2-alpha.1.md], 28 cards, prefix `DSH-0.1.2-A1`) **+** `dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2` ([v0.1.2-alpha.2.md], 8 cards, prefix `DSH-0.1.2-A2`), with [api-migration-0.1.2-alpha.2.md] as the interface ledger for hit surfaces. Corridor folding was applied where a field is removed in alpha.1 and restored in alpha.2 (see #2).

---

## Touchpoint checkup (legacy-plugin, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | YES | `cordis.patch.yml:1-6`; `patch.yml:1-6`; `scripts/apply-patch.mjs:5-9` | DSH-0.1.2-A1-03; API-08 (classification) | Patch target path must be re-validated against the exact alpha.2 tag; no guessed new path |
| #2 events | YES | `src/index.ts:15-19` (producer), `20-22` (observer) | DSH-0.1.2-A1-02 + DSH-0.1.2-A2-01 (folded net state); API-05 | Marker survives to alpha.2 net, but the public third-party producer surface is still incomplete |
| #3 services/Remote | YES | `src/index.ts:26-27`, `30-31` (`ctx.get('apiProxy')`) | DSH-0.1.2-A1-01; DSH-0.1.2-A2-02 (post-migration error flow) | apiProxy package deleted in alpha.1; plane (host vs client) must be decided before choosing the replacement |
| #4 filesystem | YES | `src/index.ts:36-37` (hardcoded `~/.dsh/profiles/default`) | DSH-0.1.2-A1-04; DSH-0.1.2-A1-13 (conditional) | `DSH_HOME` is the source of truth; hardcoded user dirs are the anti-pattern the card names |
| #5 UI/commands/tools | YES | `src/index.ts:10` (internal import), `41-43` (`registerCommand` + `SessionView`) | DSH-0.1.2-A1-03; API-07 (artifact-presence caveat) | `dsh-session-view` internals split up; replacement owner "pending confirmation" |
| #6 custom channel | YES | `src/index.ts:47-54` (loopback HTTP :43121, no auth) | DSH-0.1.2-A1-08 | Loopback is explicitly not exempt from the auth gate |
| #7 subprocess/output | YES | `src/index.ts:57-67`; `scripts/apply-patch.mjs:12-18` | DSH-0.1.2-A1-05; API-06; (A1-04 for the profile/launcher surface) | The JSONL assumption was already wrong in rc.2; alpha.1 additionally changes stderr |

All seven categories hit. Per-category detail follows.

---

## #1 Source patch / monkey patch — HIT

**Hit locations**

- `cordis.patch.yml:1-6` — profile composition row for `legacy-plugin` that additionally declares a `patch:` list entry `patch.yml` (a source-patch declaration embedded in composition).
- `patch.yml:1-6` — a patch *surface*: `target: src/session/view/SessionView.ts`, replacement `export function renderSessionView` → `export function renderSessionViewPatched`.
- `scripts/apply-patch.mjs:5-9` — reads `DSH_HARNESS_SOURCE_ROOT` from env, loads `patch.yml`, i.e. the patch-surface application path (also a #7 hit, see below).

**Classification (important nuance)**: per **API-08**, the file *named* `cordis.patch.yml` is by default the official Loader composition overlay, **not** a source patch — a filename containing "patch" alone is not a hit for this class. The genuine source-patch evidence here is (a) the `patch.yml` surface with a find/replace against host source and (b) `apply-patch.mjs` + `DSH_HARNESS_SOURCE_ROOT`. The `patch:` key inside `cordis.patch.yml` is the declaration coupling the two.

**Card mapping**

- **DSH-0.1.2-A1-03** (Session view internals split up extensively; touchpoints #1/#5; required-if-hit): the patch target `src/session/view/SessionView.ts` and the symbol `renderSessionView` must be re-checked one-by-one against an exact-tag alpha.1/alpha.2 compare; every old target must map to a target-version file or state an explicit removal reason. The session-view module was split up, so the old path is unlikely to survive verbatim — mark the replacement owner **"pending confirmation"**; do not guess new paths. (Field-note pattern: point `DSH_HARNESS_SOURCE_ROOT` at the target tag and validate each patch-surface path by composition.)
- **API-08**: when migrating, keep the composition row (`id`/`config`) and the source patch in separate verification lanes — composition checks row id/inject/config-replacement semantics via `dsh --profile <p> --dump-config`; the source patch checks target-file existence and behavior tests.

## #2 Internal event names / persistent events — HIT

**Hit locations**

- `src/index.ts:15-19` — producer: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: {...} })` — an external informational durable SessionEvent.
- `src/index.ts:20-22` — plain observer: `ctx.on('session/event', ...)` logs `event.type`.

**Card mapping — this is the corridor-folding case the brief asks about**

- **DSH-0.1.2-A1-02** (`SessionEvent.ignorable` temporarily removed; required-if-target-is-alpha.1): alpha.1 cannot preserve `ignorable: true` on third-party informational events; first-party readers reject reloads treating unknown events as required.
- **DSH-0.1.2-A2-01** (Restore `SessionEvent.ignorable`; reverts A1-02): alpha.2 restores the marker's envelope/persistence/reload/transport retention semantics.

**Folded net state for target alpha.2**: the marker **survives** — the correct migration is to *keep* the `ignorable: true` producer marker exactly as-is. Do **not** apply A1-02 as a delete-then-A2-01-as-re-add sequence (the exact anti-pattern the corridor-folding rule exists to prevent). Only if the plugin ever needed to pin an intermediate alpha.1 target would A1-02's "temporarily stop writing the unknown event" advice apply.

**Residual risk beyond the fold (API-05)**: what alpha.2 restores is *retention* semantics; the public `Session.append()` still has no `ignorable` parameter, and alpha.2 offers ordinary third-party producers no supported append/registration surface for it. The fixture writes the envelope directly (`ctx.emit('session/event', {ignorable: true, ...})`), which is not a documented public producer seam — treat this as a **capability gap**, not a compile error: on alpha.2 the recommendation is to not persist plugin state as custom SessionEvents; use a plugin-owned sidecar/store keyed by Session id. Unknown events *without* the marker still fail closed on cold load, and a live smoke will not catch the silent-write/loud-read trap — only a real persist → cold-reload test will.

## #3 Internal service probes / Remote — HIT

**Hit locations**

- `src/index.ts:26-27` — `ctx.get('apiProxy')` then `apiProxy.invoke('session.rename', { id, title })`.
- `src/index.ts:30-31` — `ctx.get('apiProxy')` then `apiProxy.invoke('llm.providers')`.

**Card mapping**

- **DSH-0.1.2-A1-01** (APIProxy removed, calls moved to `@Remote`; required-if-hit): the `apiProxy` service (package `@deepseek-ai/dsh-host-apiproxy`) is deleted in alpha.1; both call sites stop working.
  - `session.rename` → `session/rename` Remote method (`ctx.remote.session.rename` on the client plane).
  - `llm.providers` → splits into **two** results: `llm/listProviders` + `llm/listConfigurableProviders`.
  - **Plane decision first** (A1-01 field note): `apiProxy` was the host-plane facade; `ctx.remote.*` is the client-plane (browser) facade — they are not swappable one-to-one. This plugin is a host-side plugin (`activate(ctx)`, node imports), so the correct migration is to **skip the gateway and inject the domain service directly** (e.g. `inject: ['llm']` → `ctx.llm.listProviders()`); switching to `inject: ['remote']` on the host plane produces `pending (waiting for service: remote)`.
- **DSH-0.1.2-A2-02** (Remote failures become `RemoteError`; error codes gain namespaces; required-if-hit for the migrated form): if any call migrates to `ctx.remote.*`, handle `RemoteResult<T>` in the result branch; codes are now namespaced (`session/not-found`, `gateway/cancelled`, `gateway/internal`, …); never branch on `Error.message`, never blanket-retry `gateway/internal`, use `isRemoteFailure` (not `instanceof`) for structural discrimination.

## #4 Direct host directory reads/writes — HIT

**Hit locations**

- `src/index.ts:36-37` — `join(homedir(), '.dsh', 'profiles', 'default')` + `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`: a hard-coded Host/profile path and an unconditioned write into it.

**Card mapping**

- **DSH-0.1.2-A1-04** (ACP/SDK examples merged into the `dsh` profile; touchpoints #4/#7; required-if-hit): use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; do not hardcode user directories. The fixed `~/.dsh/profiles/default` assumption breaks wherever `DSH_HOME` is redirected (the card's container field note confirms profiles live under `$DSH_HOME/profiles`).
- **DSH-0.1.2-A1-13** (platform shell/directory-picker fixes may obsolete workarounds; conditional): only relevant if this write is a workaround; no evidence it is — recorded as non-applicable unless history shows otherwise.
- Not mapped to A1-13's sister cards A1-21 (presets) — no preset consumption in the fixture.

## #5 Internal UI / commands / tool registration — HIT

**Hit locations**

- `src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` (the file's own comment marks it as a private Host/Web Client path removed by UI decomposition).
- `src/index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', ...)` returning `new SessionView({ enhanced: true })`: a command registration whose payload depends on the internal symbol.

**Card mapping**

- **DSH-0.1.2-A1-03** (Session view internals split up extensively; touchpoints #1/#5; required-if-hit): the internal import and the UI registration point no longer work; rebuild imports by owning module against the exact target tag, and mark capabilities with no stable public seam "pending confirmation". Ordinary plugins should migrate to public facets/services rather than adding more internal imports.
- **API-07** (Package export ≠ artifact presence): even if an `/internal`-style subpath appears in a source checkout's export map, the published alpha.2 tarball may not contain the file (`ERR_MODULE_PATH_NOT_EXPORTED` / `ERR_MODULE_NOT_FOUND` / missing `.d.ts`). Evidence order for any replacement import: packed artifact → exports at the target tag → implementation. Note also the undeclared dependency in `package.json` (see inventory) — the import has no matching `dependencies`/ `peerDependencies` entry at all.
- **Ruled out (with evidence)**: `DSH-0.1.2-A1-25` / **API-10** (`dsh-client-runtime` removal, keyed chat snapshots, `useChat`/`useSession`) — the fixture contains **no** `@deepseek-ai/dsh-client-runtime` import, no `dsh.client` manifest key, no `dsh.client.inject`, no store/snapshot selectors; grep over all six files returns zero hits. A1-25 does not apply to this fixture even though it sits in the same corridor segment.

## #6 Custom HTTP / WS / RPC / DOM / CSS channel — HIT

**Hit locations**

- `src/index.ts:47-54` — `startLegacyBridge()`: `node:http` `createServer` listening on `127.0.0.1:43121` (comment: `http://localhost:43121/api/legacy`), responding with no authentication. The function is never invoked in the fixture, but the code path is the coupling under scan.

**Card mapping**

- **DSH-0.1.2-A1-08** (Web/API channels use process-scoped bootstrap tokens and signed cookies; required-if-hit): on alpha.1/alpha.2 the Web/API plane is behind the Connection auth gate. Consequences for this hit: (a) if this bridge expects to call host `/api` routes itself, it will receive 401/403 without redeeming a bootstrap token (`GET /?token=...` → 303 + HttpOnly cookie; the token must never go into `/api` URLs, WS URLs, or `Authorization`); (b) as a *served* route it is an unauthenticated private channel — "listening on loopback only" is explicitly not a reason to skip authentication, and an unauthed private route becomes a security hole. Custom routes registered directly with `ctx.webServer.register()`/`registerUpgrade()` do not inherit auth/Host-Origin/CORS — handlers must call `ctx.connection.requestRejection(req)` first or move to a Connection-owned seam. The bridge also has no teardown wiring visible (server never closed), which the card's port-lifecycle verification would flag.

## #7 Subprocess / stdout / stderr parsing — HIT

**Hit locations**

- `src/index.ts:57-67` — `spawn('dsh', ['--profile', 'headless', prompt])`; `child.stdout.on('data')` runs `JSON.parse` per chunk looking for `{type:'final'}` — i.e. assumes headless stdout is JSONL.
- `scripts/apply-patch.mjs:12-18` — `execFileSync('dsh', ['--profile', 'headless', 'ping'])`, then `JSON.parse` each non-empty output line with the same JSONL assumption.

**Card mapping**

- **DSH-0.1.2-A1-05** (Headless: stderr gains a `dsh: reasoning:` segment; **stdout remains the final text**; required-if-hit): the JSONL assumption was **already wrong in rc.2** — stdout has been the final assistant text all along, so `JSON.parse` throws on ordinary successful output; alpha.1's change is that stderr now carries `dsh: reasoning:` deltas, so "stderr non-empty ⇒ failure" would also misjudge. Judge success by exit code (0 completed / 1 abort, error, or no completed turn).
- **API-06** (Headless argv and process output contract — the ledger for this exact surface): stdout = final text (never JSONL); stderr = `dsh: reasoning: ...` or `dsh: <code>: <message>`; argv shape `dsh --profile headless "<task>"` with launcher flags before the task; consume stdout and stderr concurrently; record termination signals instead of guessing from stderr text. Both fixture sites violate the parse contract; `index.ts:61` additionally parses raw `'data'` chunks as lines (chunk boundaries are not line boundaries).
- **DSH-0.1.2-A1-04** (touchpoints #4/#7): the launcher/profile surface these wrappers hardcode is the same one the card tells wrappers to source from `DSH_HOME` + the official launcher.
- **DSH-0.1.2-A2-04** (Node 24.0–24.11.1 empty client graph fix; touchpoint #7; conditional): recorded as **not applicable** — the fixture contains no Node-version workaround branch to remove (no `engines`, no Node pinning logic).

---

## No-hit notes and negative evidence

All seven touchpoint classes hit, so there is no empty category to discharge. For completeness, the following corridor cards were checked against the fixture and ruled out with evidence (scanned: all 6 fixture files, full-text):

- **A1-06** (Code Mode → PTC rename): no `tools.mode`, no `code` preset id, no `CodeDispatch*`, no `tools/code-dispatch` strings anywhere.
- **A1-25 / API-10** (`dsh-client-runtime` removal, keyed chat snapshots): no such import, manifest key, or selector (see #5).
- **A2-10** (`settingsNamespace` export removed): no `@deepseek-ai/dsh-settings` import, no `ctx.settings.*` call.
- **A2-08** (`sessionProjections` required inject/peer): fixture composes no `dsh-tool-todo`/`dsh-tool-subagent`/`dsh-agent` peers; its composition row is only itself.
- **A2-04**, **A1-13**, **A1-20/21/22/27/28/29/30/31/32**, **A1-07/09/10/11/14/23/24**: corresponding identifiers/imports absent (web fetch policy, user-questions providers, presets, token deltas, session binding, composer DOM, ui-primitives labels, `ctx.connection.api`, subagent descriptors, workspace navigation).

**Why "no hit ≠ no problem" still holds for this scan** (and would hold for any empty class): the seven-class scan is heuristic pattern matching over a static copy — zero hits only means "not detected by the current patterns". It cannot see data flow (e.g. where a path string is built), cannot prove the absence of runtime coupling (service activation, boot-graph entry, peer resolution), and the corridor cards are a *curated* list, not a complete API diff. The fixture also declares no `peerDependencies`/`engines` and no lockfile, so dependency-level breakage is invisible to source scan entirely. Final safety requires build/typecheck against the alpha.2 cohort, a real profile mount (`--dump-config`, no pending services), and a functional smoke — none of which this read-only task performed.

## Must verify (when the actual migration starts)

1. Exact-tag compare for every `patch.yml` target and the `dsh-session-view/internal` import owner (A1-03; API-07 evidence order).
2. Persist → cold-reload test for any retained custom session event (API-05 silent-write/loud-read trap).
3. Post-migration `ctx.remote`/`ctx.llm` error branches per A2-02; no `inject: ['remote']` on the host plane.
4. Auth wiring (or removal) of the loopback bridge; wrong-Host/Origin ⇒ 403, no-cookie ⇒ 401 (A1-08).
5. Headless wrapper rewrite validated against the API-06 stub matrix (plain success / reasoning / failure / spawn error), exit-code driven.
6. `dsh --profile <p> --dump-config` with the migrated composition: no pending lines, patch rows resolve.

## Rollback / discipline record

Read-only scan only: no writes inside the fixture or the benchmark repository; no installs, executions, version fetches, or publishes; this report is the sole output artifact (written to the designated output directory).
