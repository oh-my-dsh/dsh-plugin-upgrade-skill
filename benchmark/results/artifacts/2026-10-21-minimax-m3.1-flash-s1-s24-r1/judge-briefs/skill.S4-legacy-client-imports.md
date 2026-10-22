# JUDGE BRIEF · skill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/S4-migration-touchpoint-report.md

# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

**Fixture (read-only, unmodified):** `fixture/` — a Web Client plugin in the dsh 0.1.1-rc.2 era
**Target host version:** dsh `0.1.2-alpha.2`
**Corridor:** `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (two card-set edges, no gap)
**Mode:** inspect (read-only). No file under `fixture/` was modified; no build, install, or reproduction
environment was created.

---

## 0. Method, scope and evidence rules

**Sources used (all inside the mounted skill/reference material):**

| Source | Role |
|---|---|
| `skills/plugin-upgrade/references/v0.1.2-alpha.1.md` | 28 curated cards for the rc.2→alpha.1 edge (card IDs `DSH-0.1.2-A1-01` … `DSH-0.1.2-A1-32`, with `A1-15`–`A1-18` absent) |
| `skills/plugin-upgrade/references/v0.1.2-alpha.2.md` | 8 curated cards for the alpha.1→alpha.2 edge (`DSH-0.1.2-A2-01`…`-06`, `-08`, `-10`) |
| `skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md` | Exact interface ledger API-01 … API-10 for rc.2→alpha.2 (incl. the Web Client unbundling table) |
| `skills/plugin-upgrade/references/rollup-0.1.2.md` | Corridor-level increments R-01 … R-13 (notably R-05 removed-package list, R-11 type-surface export drift) |
| `skills/plugin-upgrade/references/pre-flight.md` + `pre-flight-patterns.json` | The seven touchpoint classes and the scanner regexes |
| `skills/plugin-upgrade/references/precision-checklist.md` | Alpha.2 static-migration precision gates (peer floor, `dsh.client.inject` recomposition, locale pairing, dead-reference clearing) |
| `skills/plugin-upgrade/references/troubleshooting.md` | Symptom → root-cause → card lookup |
| `skills/plugin-upgrade/references/v0.1.1-rc.1.md` | Pre-corridor cards (rc.1 edge), cited only where the fixture's own era is concerned |

**Read-only tools executed (both from the cell-local skill copy, both non-mutating):**

- `node skills/plugin-upgrade/scripts/plan-migration.mjs --root fixture --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2`
  → corridor resolved across both edges; 3 files scanned; heuristic hit: **#5 at `src/client/index.ts:1`** (pattern 2).
- `node skills/plugin-upgrade/scripts/inject-lint.mjs fixture`
  → `verdict: FIX-REQUIRED`; `runtimeRefsLeft: [src/client/index.ts]`; `cordisPeer: null` (`cordisOk: false`);
  `declaredInject: []`; `peersMissingForInject: []`; `peersMissingForImports: []`; `rawWebServerRouteFiles: []`.
- Fixture SHA-256 re-computed after the scan and compared against `fixture-seal.pre.json` / `fixture-seal.source.json`:
  **all 4 files byte-identical** (`README.md`, `package.json`, `src/client/index.ts`, `src/client/Pet.tsx`).

**Evidence discipline.** Every finding below cites a card ID plus the file/line it was found at.
Where no card in the mounted material covers a point, the point is written as **unconfirmed** rather
than guessed. Curated card sets are explicitly *not* a complete API diff, so "no card" never means
"no change" — see §5.

---

## 1. Fixture inventory (complete — 4 files, no other source, config, or lockfile)

| File | Content summary | Plane |
|---|---|---|
| `fixture/package.json` | `name: dsh-pet-session-bench`, `version: 0.1.0`, `private: true`, `type: module`, `dsh: { client: { platform: "web" } }` | plugin / packaging |
| `fixture/README.md` | Fixture description; also carries maintainer touchpoint hints | — |
| `fixture/src/client/index.ts` | 14 lines: the whole client half | Web Client |
| `fixture/src/client/Pet.tsx` | 1 line: `export function Pet() {}` — an unused stub component | Web Client |

Notable absences (each is itself a finding, see §3.5–§3.7): no `cordis.patch.yml` / `agent.cordis.yml`,
no `dsh-plugin.json`, **no `peerDependencies` block at all**, no `dependencies`, no lockfile,
no `main`/`exports`, no `dsh.bundle`, no `dsh.client.inject`, no `dsh.client` entry path,
no host-side source at all.

---

## 2. Touchpoint class table (seven classes, per `pre-flight.md`)

| Class | Hit | Evidence |
|---|---:|---|
| #1 source patch / monkey patch | ✗ | No patch file; `plan-migration` reports 0/0. |
| #2 internal events / persistent events | ✗ | No `ctx.on`, no `SessionEvent`, no event vocabulary in source. |
| #3 internal service probes / Remote | **✓** | `index.ts:11` `ctx.connection.api.agentPresets.list()` — **missed by the heuristic** (the #3 regexes match `APIProxy|apiProxy|ctx.get(|ctx.remote|@Remote`, not `ctx.connection.api`). Found by manual read. |
| #4 direct host directory reads/writes | ✗ | No filesystem access. |
| #5 internal UI / commands / tools | **✓** | `index.ts:1,2,5,7,10,12` — client-runtime import, `useSession`, `__ModuleLoader__`, service inject list, client registration. |
| #6 custom HTTP/WS/RPC/DOM/CSS channels | ✗ | No custom route, socket, or DOM manipulation. (Auth-gate card `DSH-0.1.2-A1-08` therefore **not** hit.) |
| #7 subprocess / stdout / stderr | ✗ | No subprocess. |

**Planes.** The fixture is a pure **Web Client** plugin (its manifest declares `dsh.client.platform: "web"`;
all source lives under `src/client/`). There is **no Host-plane code at all**, so every Host-side card
(`DSH-0.1.2-A1-04`, `-05`, `-08`, `-13`, `DSH-0.1.2-A2-04`, `-08`, `-10`) is **not hit** by this fixture.

---

## 3. Breaking touchpoints — the hits

### 3.1 Removed client runtime import — `src/client/index.ts:1`

- **File/line:** `src/client/index.ts:1` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- **Plane:** Web Client (browser bundle) / plugin source
- **Card:** **`DSH-0.1.2-A1-25`** (`dsh-client-runtime` package removed, client symbols migrated by domain; type: breaking, action level: required-if-hit, touchpoints #3/#5)
- **Corroborating ledger:** API-10 row `ClientContext` → `Context` from `@deepseek-ai/cordis`; rollup **R-11** row for `ClientContext` (rc.2 → alpha.1); rollup **R-05** lists `dsh-client-runtime` among the five packages removed on the rc.2→alpha.1 edge.
- **How it breaks:** the package was deleted from `packages/client` in alpha.1 — the module no longer exists, so build/typecheck report a missing module; at runtime the plugin does not enter the boot graph or its assembly row stays pending, often with no explicit error.
- **Migration action:**
  1. Replace the type import with `import type { Context as ClientContext } from '@deepseek-ai/cordis'`.
  2. Re-import the client facets the plugin actually uses from their **owning packages** via type-only imports (e.g. `import type {} from '@deepseek-ai/dsh-client-ui-chat/client'`, `@deepseek-ai/dsh-api-session-controller/client`), per API-10 "Type composition and dependency ownership".
  3. Declare the owning packages as the plugin's **own direct dev/peer dependencies** (see §3.5) — a published package's `devDependencies` are not installed for consumers, and with `skipLibCheck: true` a missing declaration silently turns selectors/callbacks into implicit `any`.
  4. Remove every surviving `dsh-client-runtime` reference — imports, type-only imports, re-exports, manifest, lockfile (precision-checklist: "Dead references are cleared everywhere, not just the obvious three").
  5. Run one diagnostic typecheck with `skipLibCheck: false` to enumerate missing declaration owners, then restore the repo's normal policy; any newly introduced implicit `any` is a migration failure.

### 3.2 Client registration id ≠ package.json name — `src/client/index.ts:5,10`

- **File/line:** `src/client/index.ts:5` (the `__ModuleLoader__` declaration) and `src/client/index.ts:10` — `__ModuleLoader__.load('pet-legacy-bundle', () => { /* legacy bundle id, not package name */ })`
- **Plane:** Web Client (client bundle registration) / plugin packaging
- **Card:** **`DSH-0.1.2-A1-26`** (client-modules scan contract: registration id must equal the package.json name; type: breaking, action level: required-if-hit, touchpoint #5)
- **How it breaks:** the fixture's registration id is `'pet-legacy-bundle'` while `package.json#name` is `dsh-pet-session-bench`. 0.1.2 keys boot-manifest entries / modules / plugin registrations by package name (`Entry name == package name`). Symptoms are the startup assertion `loaded without registering "<id>"`, or — more silently — the panel disappears, the boot graph lacks the plugin, and no plugin-related error is logged.
- **Migration action:**
  1. Make the three ids agree, using `package.json#name` as the baseline: the client bundle's registration id (the `__ModuleLoader__.load` id, normally injected by the tsdown banner `PLUGIN_ID`), the assembly row's `name` in the plugin's own `cordis.patch.yml` / home patch (bare package name, scope included), and `package.json#name`.
  2. Here: set the registration id to the bare package name `dsh-pet-session-bench`.
  3. Verify with `dsh --profile <name> --dump-config` (no pending rows), then check that the page's `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"` and that the script fetched from the host-advertised combo route contains `__ModuleLoader__.load({ id: "<package name>"`; the startup log must show no `loaded without registering` / `entries did not activate`.
- **Secondary, lower-confidence note (explicitly flagged):** the fixture declares `load: (id: string, fn: () => void) => void` (line 5) — a positional two-argument call. The card's own verification snippet and `troubleshooting.md` (row "Browser: Failed to load plugins: failed to import loader entry") both show the 0.1.2 form as `__ModuleLoader__.load({ id, factory })`. **Card `DSH-0.1.2-A1-26` states only the id-equality rule explicitly; the loader call *shape* change is not separately carded.** Treat the object-argument form as *pending confirmation against the target tag's* `packages/client/modules` loader rather than a carded requirement.

### 3.3 Flat `useSession()` `nodes` snapshot — `src/client/index.ts:2,12,13`

- **File/line:**
  - `src/client/index.ts:2` — `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`
  - `src/client/index.ts:12` — `const { nodes } = useSession()`
  - `src/client/index.ts:13` — `const first = nodes[0]`
- **Plane:** Web Client
- **Primary card:** **`DSH-0.1.2-A1-27`** (Session content reads now go through the SessionBinding durable event window; type: breaking, action level: required-if-hit, touchpoint #3)
- **Related card:** **`DSH-0.1.2-A1-03`** (Session view internals split up extensively; type: breaking, required-if-hit, touchpoints #1/#5)
- **Corroborating ledger:** API-10 rows `useSession(session => session?.nodes)` → `useChat(chat => ...)` and `ConversationSnapshot.nodes[]` → iterate `ChatSnapshot.order` and call `snapshot.nodes.get(id)`; rollup **R-11** row "`useSession` reading `ConversationSnapshot.nodes[]` (rc.2 → alpha.1) → on alpha.2 use `useChat`, keeping order via `ChatSnapshot.order` with `nodes.get(id)`"; `DSH-0.1.2-A1-03` field note (2026-08-28) that the old flat fields remain readable only through the `views.get('chat')?.legacy` projection for staged compatibility.
- **How it breaks:** on alpha.2 the chat snapshot's `nodes` is a **keyed store**, not a `ConversationNode[]`. `nodes[0]` (index access on a keyed store) is not a valid read, and the per-session flat conversation-node snapshot that `useSession()` returned is gone — the timeline becomes an internal projection of each view package. The plugin loads but half its functionality is broken (empty/undefined content, console factory errors).
- **Migration action:**
  1. Switch the read to `useChat`, imported from `@deepseek-ai/dsh-client-ui-chat/client`, and treat the value as `ChatSnapshot | undefined`.
  2. Replace `nodes[0]` with ordered iteration: `snapshot.order.flatMap(id => { const n = snapshot.nodes.get(id); return n ? [n] : [] })` (API-10 minimal read shape), covering missing ids.
  3. To read an assistant step's final node, narrow by discriminant `type === 'assistant-step'` and read `data.finalNode`.
  4. Do **not** make `snapshot.legacy.nodes` the primary data surface for an alpha.2-only plugin (API-10; R-11).
  5. If the plugin needs the raw persisted transcript rather than the rendered timeline, use the `DSH-0.1.2-A1-27` path: `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries`, reading `entry.event.type === 'user/message'` and the text block in `entry.event.data.content`; import `SessionEventLikeEntry` / `SessionBinding` from `@deepseek-ai/dsh-api-session-controller/client`.
  6. Update client tests/fixtures to the real `ChatNodeStore` shape (`order` + keyed `get`) instead of `nodes: []`.
- **Unconfirmed:** whether `useSession` is still *exported* from `@deepseek-ai/dsh-client-ui-chat/client` at the alpha.2 tag. The mounted material documents the **target** (`useChat`) but does not state that `useSession` was removed from the export surface. Verify against the target tag's package exports before deleting the import.

### 3.4 Removed `ctx.connection.api` face — `src/client/index.ts:11`

- **File/line:** `src/client/index.ts:11` — `ctx.connection.api.agentPresets.list().then(presets => { /* legacy connection.api face */ })`
- **Plane:** Web Client (browser-side `ctx.connection` face)
- **Primary card:** **`DSH-0.1.2-A1-30`** (Client `ctx.connection.api` face removed entirely; history/transcript reads rerouted; type: breaking, action level: required-if-hit, touchpoint #3)
- **Related card:** **`DSH-0.1.2-A1-01`** (APIProxy removed, Host/Web Client calls moved to `@Remote`; its old→new table supplies the successor for `agentPreset.list` → `agentPresets/list`)
- **Related card (error handling on the new call):** **`DSH-0.1.2-A2-02`** (Remote failures become `RemoteError` instances; error codes gain namespaces)
- **Corroborating ledger:** API-01 "Web Client consumer ledger" (`agentPreset.read/copy/remove` → `ctx.remote.agentPresets.*`, and the A1-01 table row `agentPreset.list/select` → `agentPresets/list` / `agentPresets/select`); API-01 "Web Client" pattern shows `inject = ['remote', 'remote.session']` and `ctx.remote.session.rename({ sessionId, title })`.
- **How it breaks:** alpha.1 removed the old apiProxy mirror face on `ctx.connection`; the client call throws. **If the throw is swallowed by a `catch`, the UI renders "forever blank" instead of an error** — a smoke that only asserts "no crash" cannot detect it (card field note, dsh-better-sidebar, 2026-08-30).
- **Migration action:**
  1. Replace the call with the generated client Remote projection: `ctx.remote.agentPresets.list()` — do **not** hand-write namespace/method strings, and do not use `ctx.remote.sessionTitle.*` (that name is design-draft text, not an implementation).
  2. Declare the Remote contributions in the client `inject`: `remote` plus the specific namespace actually used (`remote.agentPresets`), per API-01 best practice #3 — do not rely on another plugin having mounted first.
  3. Handle the result as a `RemoteResult<T>`: branch on `result.ok` first, then on `result.error.code`. On alpha.2 the error value is a `RemoteError` instance and codes are namespaced (`session-not-found` → `session/not-found`, `agent-busy` → `session/agent-busy`, `internal` → `gateway/internal`, `cancelled` → `gateway/cancelled`). Never branch on old un-namespaced code strings, never parse `Error.message`, and never use `instanceof RemoteError` across realms. Use `isRemoteFailure` only at a catch boundary that catches an explicit `throw result.error`.
  4. Once nothing consumes the old face, remove `connection` from the `inject` list and drop the type mirror — "leave no dead face" (card `DSH-0.1.2-A1-30` recipe).
  5. Verification per API-01: cover at least `ok: true` and one domain error code; add cancellation for calls that accept an `AbortSignal`; and assert that an unmounted Remote contribution surfaces an explicit assembly error instead of hanging.

### 3.5 Missing peer dependency set / cohort floor — `fixture/package.json` (whole file)

- **File/line:** `fixture/package.json:1-7` — the manifest declares **no `peerDependencies`, no `dependencies`, no lockfile**.
- **Plane:** plugin / packaging
- **Cards:** **`DSH-0.1.2-A2-03`** (NPM packages trim unneeded peer dependencies; type: behavior, action level: conditional, packaging/distribution surface) and **`DSH-0.1.2-A1-25`** (declare the owning packages of the declarations you consume as direct dev/peer dependencies — its "Clean up `package.json`" step) and **`DSH-0.1.2-A1-24`** (dependency-graph duplicate-instance risk, general packaging concern)
- **Corroborating ledger:** precision-checklist — "Peer version floors — exact values": `@deepseek-ai/cordis` must be `^4.0.1` (a newer caret is a miss); "no bare `cordis` key survives anywhere in the peer block; no `-rc` suffix survives; every `@deepseek-ai/dsh-*` peer floor sits on the target cohort (`^0.1.2-alpha.1` or later within the cohort)"; "Peers are a superset of inject: every module whose types or services the plugin touches appears in `peerDependencies` on the target cohort floor — including modules used only for types."
- **Evidence from the shipped read-only checker:** `inject-lint.mjs` on the fixture reports `cordisPeer: null`, `cordisOk: false`, `declaredInject: []`, and `verdict: FIX-REQUIRED`.
- **Migration action:** add `peerDependencies` covering every module whose types/services the plugin touches — at minimum `@deepseek-ai/cordis` at exactly `^4.0.1`, plus the owning packages of the client symbols actually imported (`@deepseek-ai/dsh-client-ui-chat`, and whichever package owns `slots`/`conversation` per §3.6). Mark genuinely optional peers with `peerDependenciesMeta.optional` and make the flags match reality. Do not switch package managers or write a second lockfile.
- **Unconfirmed:** the exact cohort range to write for each `@deepseek-ai/dsh-*` peer. The precision checklist names `^0.1.2-alpha.1` "or later within the cohort" and the target is `0.1.2-alpha.2`; the exact published-artifact versions available for each sub-package are a registry fact that this read-only, offline task did not and may not verify.

### 3.6 Client service `inject` list after the client-runtime split — `src/client/index.ts:7`

- **File/line:** `src/client/index.ts:7` — `export const inject = ['slots', 'conversation']`
- **Plane:** Web Client (module-level service injection) / plugin
- **Cards:** **`DSH-0.1.2-A1-25`** (client symbols migrated by domain — the runtime aggregation package no longer provides the client facets, so each service must come from its owning package) and **`DSH-0.1.2-A1-03`** (session view internals split up extensively); **`DSH-0.1.2-A1-26`** for the composition side
- **Corroborating ledger:** precision-checklist — "The renderer's double role decides both lists": after the split the **`slots` service lives in `@deepseek-ai/dsh-client-ui-renderer`**, and the table lists candidate owners (`@deepseek-ai/dsh-client-ui-renderer` for "Hosts the renderer/slots service itself"; `@deepseek-ai/dsh-client-ui-conversation` for the "Composer / dock surface"); API-10 "Type composition and dependency ownership" step 1 — list only the client services the runtime actually needs injected, and remove the no-longer-existing `dsh-client-runtime`.
- **Migration action:** recompose the inject list by capability against the target host's module table rather than carrying the rc.2-era list forward. Confirm that `slots` and `conversation` are still provided under those service keys by their owning packages (`@deepseek-ai/dsh-client-ui-renderer`, `@deepseek-ai/dsh-client-ui-conversation`), and keep the owning packages in `peerDependencies` for the consumed types. Keep the type graph and the runtime service graph separate: a type-only import cannot resolve a runtime wait on `slots`.
- **Unconfirmed (explicitly):** **no card in the mounted material states that the service *keys* `slots` / `conversation` were renamed on this edge.** The mounted evidence establishes only that the *owner packages* moved (precision-checklist) and that the runtime aggregation package was removed (A1-25). Whether these two keys survive unchanged on alpha.2 is **pending confirmation against the target tag's client composition** — verify with a real cold boot, because an unsatisfiable service key leaves the entry `pending (waiting for service: …)` with no error.
- **Related, conditional:** the fixture's `inject` does **not** list `connection`, yet line 11 reads `ctx.connection.api`. Under cordis strict injection an undeclared service access throws (`cannot get property without inject`), which can abort `apply()` before the effect registers — pre-corridor card **`DSH-0.1.1-R1-04`** (cordis strict injection) and **`DSH-0.1.1-R1-05`** (weak `ctx.get` for optional services). The target fix is the same as §3.4: consume `ctx.remote.agentPresets.list()` and declare `remote` + `remote.agentPresets`. Whether the rc.2 client plane enforced strict injection for this face is **not stated by any 0.1.2 card** — treat as conditional.

### 3.7 Package-level client composition / manifest surface — `fixture/package.json:6`

- **File/line:** `fixture/package.json:6` — `"dsh": { "client": { "platform": "web" } }`
- **Plane:** plugin / packaging
- **Cards:** **`DSH-0.1.2-A1-25`** (`dsh.client.inject` must declare only real service packages; a phantom dependency leaves the assembly row pending) and **`DSH-0.1.2-A1-26`** (the three-id contract keyed by package name). Pre-corridor, for context only: **`DSH-0.1.1-R1-03`** (client-modules scans only packages declaring `dsh.client`) and **`DSH-0.1.1-R1-02`** (`dshClient` → `dsh.client` merge; the value shape is "platform `web` and the client entry path").
- **Observed:** the manifest declares **no `dsh.client.inject`, no client entry path, no `dsh.bundle`, no `main`/`exports`**.
- **Migration action:** after the source-level fixes, recompose `dsh.client.inject` to list only the runtime module edges the plugin genuinely needs (never the removed runtime package), and align the assembly-row name with the bare package name. Keep peers a superset of inject.
- **Unconfirmed:** whether the alpha.2 client-modules scan requires an explicit **entry path** inside `dsh.client` (as the rc.1-era cards describe) — **no 0.1.2 card in the mounted material restates that requirement**, and the fixture's client entry is not declared at all. Verify against the target tag's client-modules manifest contract before concluding the manifest is complete.

---

## 4. Explicitly NOT hit (with evidence, per the skill's report contract)

| Card | Why not hit |
|---|---|
| `DSH-0.1.2-A1-01` | Hit **only** indirectly, as the successor mapping for §3.4 — the fixture never used the `apiProxy` service/import by name. |
| `DSH-0.1.2-A1-02` / `DSH-0.1.2-A2-01` (`SessionEvent.ignorable`) | No events produced or persisted. Corridor note: alpha.1 removed the marker, alpha.2 restores it — the net state is "present", and this fixture never wrote it, so nothing to delete-and-restore. |
| `DSH-0.1.2-A1-04`, `-05`, `-13`; `DSH-0.1.2-A2-04` | Host plane / headless / launcher surfaces — no Host code, no subprocess, no argv parsing. |
| `DSH-0.1.2-A1-06` (PTC rename), `DSH-0.1.2-A1-07`, `DSH-0.1.2-A1-08` | No `tools.mode`, no approval policy, **no custom HTTP/WS/RPC route** (`inject-lint` reports `rawWebServerRouteFiles: []`), so the A1-08 auth gate does not apply. |
| `DSH-0.1.2-A1-09`, `-10`, `-11`, `DSH-0.1.2-A1-14`, `DSH-0.1.2-A1-12`, `-23` | Capability/privacy surfaces — the plugin declares no model-provider login, no third-party language, no subagent, no session-log upload, no telemetry rows. |
| `DSH-0.1.2-A1-15`–`A1-18`, `DSH-0.1.2-A2-07`, `DSH-0.1.2-A2-09` | **These IDs do not exist** in the mounted card files (curated sets: alpha.1 has 28 cards, alpha.2 has 8). They are not asserted here. |
| `DSH-0.1.2-A1-20`, `-21`, `-22`, `-31`, `DSH-0.1.2-A2-05`, `-06`, `-10` | `userQuestions`, agent-presets service internals, `isTokenDelta`, subagent descriptor version, plugin-inventory snapshot, `$host` facts, `settingsNamespace` — none of these surfaces appear in the fixture source. (`A2-05`/`A2-06` were surfaced by the heuristic planner because the alpha.1 card set shares their touchpoint classes; the fixture does not consume them.) |

---

## 5. Coverage caveats and residual risk

1. **The card sets are curated, not a complete API diff.** The alpha.1 file declares `coverage: curated`, `cardCount: 28`; the alpha.2 file declares `cardCount: 8`. The ID numbering has gaps (A1-15…A1-18, A2-07, A2-09). Absence of a card is **not** evidence that a surface did not change; where the mounted material could not answer a question, this report says **unconfirmed** rather than guessing.
2. **The heuristic scanner under-detects here.** `plan-migration.mjs` reported 1 hit (#5, `src/client/index.ts:1`) and 0 for #3, missing the `ctx.connection.api` hit at line 11 and the registration-id hit at line 10 (the #5 pattern set fires on the *first* matching line per file, so only line 1 was reported). Every finding in §3 was confirmed by reading the file, not by the scanner. Zero hits never prove public-contract-only coupling.
3. **No target-tag source was available.** The mounted material cites upstream tag URLs but the container has no network access and no upstream checkout, so no assertion here rests on an unverified upstream file read; all citations are to the mounted reference documents.
4. **Nothing was executed against a host.** No build, typecheck, pack, install, cold boot, or browser smoke was performed — the brief forbids creating a reproduction environment. Consequently **no verification layer is claimed as passed** for any item in §3; all verification steps are recommendations.
5. **Open (unconfirmed) items to close before implementing:**
   - whether `useSession` is still exported by `@deepseek-ai/dsh-client-ui-chat/client` at alpha.2 (§3.3);
   - whether the `__ModuleLoader__.load` call shape changed to an object argument (§3.2);
   - whether the service keys `slots` / `conversation` are unchanged on alpha.2 (§3.6);
   - whether alpha.2 requires a client entry path inside `dsh.client` (§3.7);
   - the exact published cohort version for each `@deepseek-ai/dsh-*` peer (§3.5).

---

## 6. Consolidated touchpoint table

| # | File/line | Old code | Plane | Card ID(s) | Action (short) |
|---|---|---|---|---|---|
| 1 | `src/client/index.ts:1` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` | Web Client | **`DSH-0.1.2-A1-25`** (+ API-10, R-05, R-11) | Import `Context` from `@deepseek-ai/cordis`; add per-owner type-only imports; declare owning packages as direct dev/peers; purge every `dsh-client-runtime` reference; one `skipLibCheck: false` typecheck. |
| 2 | `src/client/index.ts:10` (and `:5`) | `__ModuleLoader__.load('pet-legacy-bundle', …)` | Web Client / packaging | **`DSH-0.1.2-A1-26`** | Make registration id = assembly row name = `package.json#name` (`dsh-pet-session-bench`); loader call shape → *pending confirmation*. |
| 3 | `src/client/index.ts:2,12,13` | `useSession()` → `{ nodes }` → `nodes[0]` | Web Client | **`DSH-0.1.2-A1-27`** (+ `DSH-0.1.2-A1-03`, API-10, R-11) | Read via `useChat` + `ChatSnapshot.order` / `nodes.get(id)`; or use the SessionBinding durable event window; do not use `legacy.nodes` as the primary surface. |
| 4 | `src/client/index.ts:11` | `ctx.connection.api.agentPresets.list()` | Web Client | **`DSH-0.1.2-A1-30`** (+ `DSH-0.1.2-A1-01`, `DSH-0.1.2-A2-02`, API-01) | Call `ctx.remote.agentPresets.list()`; declare `remote` + `remote.agentPresets`; branch on `result.ok` then namespaced `result.error.code`; drop the `connection` face. |
| 5 | `package.json:1-7` | no `peerDependencies`, no deps | plugin / packaging | **`DSH-0.1.2-A2-03`** (+ `DSH-0.1.2-A1-25`, precision-checklist) | Add peers: `@deepseek-ai/cordis` = exactly `^4.0.1`, plus every touched module incl. type-only owners; flag optional peers. |
| 6 | `src/client/index.ts:7` | `inject = ['slots', 'conversation']` | Web Client | **`DSH-0.1.2-A1-25`** (+ `DSH-0.1.2-A1-03`, precision-checklist) | Recompose inject by capability against the new owners (`ui-renderer` for `slots`, `ui-conversation` for `conversation`); service-key survival = *unconfirmed*. |
| 7 | `src/client/index.ts:7` vs `:11` | `connection` consumed but not declared | Web Client | **`DSH-0.1.2-A1-30`** (+ `DSH-0.1.1-R1-04`, conditional) | Prefer the `remote` projection and declare it; strict-injection throw on undeclared service access = conditional risk. |
| 8 | `package.json:6` | `dsh.client` without inject / entry path | plugin / packaging | **`DSH-0.1.2-A1-25`** + **`DSH-0.1.2-A1-26`** | Declare only real service packages in `dsh.client.inject`; entry-path requirement = *unconfirmed*. |

**Read-only discipline statement.** `fixture/` was opened read-only; its four SHA-256 hashes were
re-verified after all scanning and match `fixture-seal.pre.json` and `fixture-seal.source.json` exactly.
The only file this task wrote is this report, under `agent-output/S4-legacy-client-imports/`.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.