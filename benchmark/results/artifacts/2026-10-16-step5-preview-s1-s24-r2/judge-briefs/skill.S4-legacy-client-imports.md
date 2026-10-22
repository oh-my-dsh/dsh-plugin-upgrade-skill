# JUDGE BRIEF · skill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/S4-legacy-client-imports.md

# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report (read-only)

- **Task**: static, read-only migration touchpoint analysis of the fixture Web Client plugin for the DSH corridor **0.1.1-rc.2 → 0.1.2-alpha.2**.
- **Method**: Mode A (inspect) per `SKILL.md`; seven-class pre-flight sweep (`references/pre-flight.md`) plus a manual line-by-line read of every fixture file. No build, no install, no reproduction environment, no network. The fixture was not modified (read-only access only).
- **Corridor** (from `references/api-migration-0.1.2-alpha.2.md` header, exact tags): `dsh-v0.1.1-rc.2` (`b150a55…`) → `dsh-v0.1.2-alpha.1` (`cd5ef81…`) → `dsh-v0.1.2-alpha.2` (`0a53fb5…`). Card sets read in full: `references/v0.1.2-alpha.1.md` (rc.2→alpha.1, prefix `DSH-0.1.2-A1`), `references/v0.1.2-alpha.2.md` (alpha.1→alpha.2, prefix `DSH-0.1.2-A2`), plus the interface ledger `references/api-migration-0.1.2-alpha.2.md` (API-01…API-10, CFG-01).

## Fixture identity

| Item | Value | Evidence |
|---|---|---|
| Plugin package name | `dsh-pet-session-bench` | `fixture/package.json:2` |
| Plugin version | `0.1.0` | `fixture/package.json:3` |
| Face declaration | `"dsh": { "client": { "platform": "web" } }` — a Web Client plugin (required to enter the browser plugin roster, per DSH-0.1.2-A1-01 field note) | `fixture/package.json:6` |
| `dsh.client.inject` | **absent** — nothing to clean per DSH-0.1.2-A1-25's inject recipe | `fixture/package.json` |
| peerDependencies / lockfile | **absent** — new type dependencies must be added during migration (see T1) | `fixture/package.json` |
| Composition files | none (no `cordis.patch.yml` / `agent.cordis.yml`) | fixture glob |
| Source | `fixture/src/client/index.ts` (14 lines), `fixture/src/client/Pet.tsx` (1 line, empty component, no card) | fixture glob |

## Summary — touchpoint checkup (`dsh-pet-session-bench`, rc.2 → alpha.2)

| Touchpoint class | Hit | File/line | Card (full ID) |
|---|---|---|---|
| #1 source patch / monkey patch | no | — | — |
| #2 internal event names / persistent events | no | — | — |
| #3 internal service probes / Remote | **yes** | `src/client/index.ts:11` | **DSH-0.1.2-A1-30** |
| #4 direct host directory reads/writes | no | — | — |
| #5 internal UI / commands / tools | **yes** | `src/client/index.ts:1, 5, 10, 12–13` | **DSH-0.1.2-A1-25**, **DSH-0.1.2-A1-26**, **DSH-0.1.2-A1-27** |
| #6 custom HTTP / WS / RPC / DOM / CSS | no | — | — |
| #7 subprocess / stdout / stderr | no | — | — |

All four hits are on the **Web Client plane** (the plugin is a browser plugin; nothing in the fixture runs on the Host plane). No Host-plane card applies.

---

## Touchpoint details

### T1 · Removed `@deepseek-ai/dsh-client-runtime/client` type import — **DSH-0.1.2-A1-25**

- **File/line**: `fixture/src/client/index.ts:1` (`import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`), consumed at `fixture/src/client/index.ts:9` (`apply(ctx: ClientContext)`).
- **Plane**: Web Client (plugin client bundle).
- **Card**: **DSH-0.1.2-A1-25** · `@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain (`references/v0.1.2-alpha.1.md:415`; corroborated by `references/rollup-0.1.2.md` R-05, which lists `dsh-client-runtime` among the 5 packages removed in rc.2→alpha.1).
- **Old pattern**: import `ClientContext` (and any other client symbols) from the aggregated runtime package `/client` entry.
- **How it breaks on alpha.2**: the package was deleted from `packages/client` in alpha.1 — build/typecheck report a nonexistent module / missing export; if the package were also named in `dsh.client.inject`, the assembly row would stay pending and the plugin would not enter the boot graph (this fixture declares no `dsh.client.inject`, so only the import breaks).
- **Migration action**:
  1. Replace the type import per the A1-25 verified mapping / API-10 ledger: `import type { Context as ClientContext } from '@deepseek-ai/cordis'`.
  2. Compose the Context facets actually used with **type-only imports from the owning packages** (API-10, "Type composition and dependency ownership"); do not rely on the old aggregation package or hoisting.
  3. Declare every owning package whose declarations are consumed as a **direct dev/peer dependency** (API-10 §3; `references/precision-checklist.md`, "Peers are a superset of inject"); run one diagnostic `tsc` with `skipLibCheck: false` to locate the missing declaration chain (API-10 §4, DSH-0.1.2-A2-03 field note), then restore the repo policy.
  4. Keep the DSH cohort exact and coherent (`R-01`, `references/rollup-0.1.2.md:92`). npm note: `0.1.2-alpha.2` is published on npm (alpha.1 never was), so registry resolution should serve the target cohort — verify before assuming tarball overrides.
- **Verification**: typecheck shows no leftover `dsh-client-runtime` reference anywhere (source, type-only imports, manifests, lockfile — `precision-checklist.md` "Dead references are cleared everywhere"); cold boot shows the plugin in the boot graph with no pending rows.

### T2 · `__ModuleLoader__.load` registration id ≠ package.json name — **DSH-0.1.2-A1-26**

- **File/line**: `fixture/src/client/index.ts:5` (`declare const __ModuleLoader__ …`) and `fixture/src/client/index.ts:10` (`__ModuleLoader__.load('pet-legacy-bundle', …)`); baseline name at `fixture/package.json:2` (`dsh-pet-session-bench`).
- **Plane**: Web Client boot contract (client-modules scan), fixed in the plugin's build/source.
- **Card**: **DSH-0.1.2-A1-26** · client-modules scan contract: registration id must equal the package.json name (`references/v0.1.2-alpha.1.md:443`).
- **Old pattern**: bundle registers under an arbitrary legacy id (`'pet-legacy-bundle'`).
- **How it breaks on alpha.2**: 0.1.2's boot manifest keys entries / modules / plugin registrations by **package name**; a mismatch either trips the startup assertion `loaded without registering "pet-legacy-bundle"` or, more subtly, keeps the plugin silently out of the boot graph (panel disappears, no plugin error in logs).
- **Migration action**: align the three ids of A1-26, with `package.json` `name` as the baseline:
  1. Registration id: make the `__ModuleLoader__.load` id equal `dsh-pet-session-bench` — via the tsdown banner `PLUGIN_ID` or by changing the string literal at `index.ts:10`.
  2. Assembly row `name` (plugin's own `cordis.patch.yml` or the home patch): use the bare package name. **Not present in this fixture** (no composition file ships with it) — verify the host-side row where the plugin is installed.
  3. Confirm with `dsh --profile <name> --dump-config` (row names, no pending) — a runtime check, out of scope for this static scan.
- **Verification** (per A1-26): `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"`; the combo-route script (`/plugins/??<package name>/client.js&rev=…`, URL contains `??`) contains `__ModuleLoader__.load({ id: "dsh-pet-session-bench"`; the startup log has no `loaded without registering` / `entries did not activate`. Acceptance mechanics (token URL → cookie → boot manifest → advertised resource) per **DSH-0.1.2-A1-19** (`references/v0.1.2-alpha.1.md:306`) — a wrapper/acceptance concern, not a source change.

### T3 · Removed `ctx.connection.api` face (`agentPresets.list`) — **DSH-0.1.2-A1-30**

- **File/line**: `fixture/src/client/index.ts:11` (`ctx.connection.api.agentPresets.list().then(presets => { … })`).
- **Plane**: Web Client (browser-side face).
- **Card**: **DSH-0.1.2-A1-30** · Client `ctx.connection.api` face removed entirely; history/transcript reads rerouted (`references/v0.1.2-alpha.1.md:521`). Its "Applies to" explicitly names `ctx.connection.api.*` consumers including `agentPresets`.
- **Old pattern**: call the Host APIProxy mirror face on `ctx.connection` and consume the bare promise.
- **How it breaks on alpha.2**: alpha.1 removed the old apiProxy mirror face on `ctx.connection`; the call throws. Per A1-30, if the call site swallows the error in a `catch`, the UI renders "forever blank" instead of erroring — a no-crash smoke cannot catch it.
- **Migration action**:
  1. Move the call to the generated client projection per the API-01 table (`references/api-migration-0.1.2-alpha.2.md:133`; DSH-0.1.2-A1-01 table): `agentPreset.list` → `ctx.remote.agentPresets.list(...)`. The tag's generated declarations are authoritative for the exact signature — confirm at the target tag rather than from notes (API-01 best practice 4).
  2. Declare the injection: add `'remote'` and `'remote.agentPresets'` to `export const inject` (currently `['slots', 'conversation']`, `index.ts:7`) — client contributions must declare `remote` plus the namespace actually used (API-01 best practice 3).
  3. Handle the result as `RemoteResult`: branch on `result.ok` first, then `result.error.code`; a bare `.then` treats `{ ok: false }` as success (related card **DSH-0.1.2-A2-02**, `references/v0.1.2-alpha.2.md:47` — this is a required action for the *migrated* code, not a break of the current source).
  4. Per A1-30, once the client no longer consumes the connection face, remove `connection` from inject and the type mirror. **Not applicable here**: the fixture never declared `connection` (see `index.ts:7`) — no dead face to remove.
  5. Optional, only if one artifact must serve both cohorts: the R-02 dual-cohort probe (`references/rollup-0.1.2.md:113`), e.g. resolve `ctx.remote.agentPresets` in a `try/catch` and fall back to `ctx.connection.api.agentPresets`.
- **Verification**: cover the success branch and at least one domain error code on the migrated call; with the route deliberately broken, the UI must show an error state rather than blank (A1-30).

### T4 · Flat `useSession()` `nodes` snapshot — **DSH-0.1.2-A1-27**

- **File/line**: `fixture/src/client/index.ts:2` (`import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`), `fixture/src/client/index.ts:12` (`const { nodes } = useSession()`), `fixture/src/client/index.ts:13` (`const first = nodes[0]`).
- **Plane**: Web Client (session/chat snapshot read).
- **Card**: **DSH-0.1.2-A1-27** · Session content reads now go through the SessionBinding durable event window (`references/v0.1.2-alpha.1.md:461`); background split per **DSH-0.1.2-A1-03** (session view internals split; the timeline becomes an internal projection of each view package). Exact target mapping: API-10, "Web Client runtime unbundling, keyed chat snapshots…" (`references/api-migration-0.1.2-alpha.2.md:590`).
- **Old pattern**: read the per-session conversation-node snapshot as a flat array — `useSession()` → `{ nodes }` → `nodes[0]`.
- **How it breaks on alpha.2**: 0.1.2 no longer exposes per-session conversation-node snapshots; `session.getSnapshot().nodes` is undefined/empty with console factory errors (A1-27 symptoms). On alpha.2, `ChatSnapshot.nodes` is a **keyed store**, not `ConversationNode[]`; under `skipLibCheck: true` the selector silently degrades to `any` (API-10 one-page table).
- **Migration action** (pick by need; both cited):
  1. **Chat timeline read (canonical, API-10 exact mapping)**: use `useChat` with the keyed store —
     ```ts
     import type { Context } from '@deepseek-ai/cordis'
     import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
     function orderedNodes(snapshot: ChatSnapshot) {
       return snapshot.order.flatMap((id) => {
         const node = snapshot.nodes.get(id)
         return node ? [node] : []
       })
     }
     // ctx.useChat((chat) => chat ? orderedNodes(chat) : [])
     ```
     Read an assistant step's final node by narrowing `type === 'assistant-step'` then `data.finalNode`. Test fixtures must use the real `ChatNodeStore` shape (`order` + keyed `get`), not old arrays (API-10 verification).
  2. **Raw session-content read (A1-27 recipe)**: `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries` (`SessionEventLikeEntry[]`); user-message text lives in `entry.event.data.content` `{ type: 'text', text }` blocks; import `SessionBinding` / `SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`; scoped services via `binding.ctx.get(...)`.
  3. Whichever path is taken, the owning packages become direct type/dev/peer dependencies (API-10 §2–3; `precision-checklist.md`).
- **Verification**: send one real user message and read text consistent with the UI; empty sessions / unknown ids return null instead of throwing (A1-27); one `skipLibCheck: false` pass with no new implicit `any` (API-10).

---

## Non-hit classes (evidence)

- **#1 source patch**: no `patch.yml`, `patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT`, or host-source replacement anywhere in the fixture. Nothing to classify as a source patch (API-08 negative control).
- **#2 events**: no `SessionEvent` producer/consumer, no `ctx.on(`/`subscribe(`, no persisted custom events — DSH-0.1.2-A1-02 / A2-01 not hit.
- **#4 host filesystem**: no `DSH_HOME`, `.dsh/`, `profiles/`, `homedir(`, file reads/writes.
- **#6 custom channels**: no `createServer`, WebSocket, `router.*`, `/api/`, `127.0.0.1`, no composer DOM manipulation (DSH-0.1.2-A1-28 not hit — no `setSelectionRange`/`contenteditable`/`data-input-scroll`), no `MarkdownText` rendering (DSH-0.1.2-A1-29 not hit).
- **#7 subprocess**: no `child_process`, `spawn`, headless invocation (DSH-0.1.2-A1-05 / API-06 not hit).
- **`fixture/src/client/index.ts:7`** `export const inject = ['slots', 'conversation']`: the service names survive 0.1.2 — `conversation` is still reachable (`binding.ctx.get('conversation')`, A1-27 recipe) and `slots` is provided by the renderer (`precision-checklist.md`). No card hit; re-verify service availability at cold boot. This line is where T3's `'remote'` / `'remote.agentPresets'` entries must be added.
- **`fixture/src/client/Pet.tsx`**: empty component, no touchpoint.
- **Host plane**: zero hits — no Host service injection, no `ctx.remote` owner side, no host tools/packages; all Host-plane cards (A2-08 `sessionProjections`, A2-03 peers, A1-20/A1-21/A1-22/A1-31) are out of scope for this fixture.

## Cards considered and excluded (no fabrication)

- **DSH-0.1.2-A1-01** (APIProxy removed): the Host-plane card; the fixture's hit is the *client mirror* face, which A1-30 cards. A1-01's table is cited only as the source of the target method for T3.
- **DSH-0.1.2-A1-19**: acceptance/wrapper surface (boot manifest, token URL) — affects verification scripts, not plugin source; cited under T2 verification.
- **DSH-0.1.2-A1-32**: no `connectWorkspace` / `startSession` / `pickDirectory` / `baselinesReady` usage in the fixture.
- **DSH-0.1.2-A2-02** (`RemoteError` / namespaced codes): not a break of current source (no `ctx.remote` today); listed as a required action for the migrated T3 call.
- **DSH-0.1.2-A2-03 / A2-08**: packaging and host-composition cards; the fixture declares no peers and mounts no host tool packages. A2-08's field note (missing peer shows up as runtime `pending`) is worth remembering when the migration adds dependencies.

## Unconfirmed / not verifiable in a static read-only scan

1. **Exact signatures/exports at the target tag** — the generated declarations at `dsh-v0.1.2-alpha.2` are authoritative (API-01 best practice 4); confirm `ctx.remote.agentPresets.list`'s exact parameters against the tag before implementing.
2. **`useSession`'s own export status at alpha.2** — the skill sources indicate the `useSession` *seat* survives (A1-03 field note: "lifecycle fields … must go through the `useSession` seat"), while the flat `nodes` shape is the documented break; `useChat` is the documented target read (API-10). Treat the `useSession` import at `index.ts:2` as "shape broken, package present"; verify the export at the tag.
3. **Assembly-row id (A1-26 id #2)** — the fixture ships no `cordis.patch.yml`; the host-side row must be checked where the plugin is installed (`--dump-config`), which this read-only scan cannot run.
4. **Runtime behavior** — no build, typecheck, cold boot, or mount was performed (the brief forbids a reproduction environment); nothing here is evidence of runtime compatibility.
5. **Baseline failures (R-06)** — not collected: the read-only brief prohibits running the mechanical suite, so no pre-existing/migration-introduced attribution is possible from this scan.

## Read-only discipline

- The fixture was opened read-only; no file under `fixture/` was created, modified, or deleted.
- No build, install, dependency resolution, network access, or reproduction environment was created; no temporary scripts were needed or left behind.
- This report is the only artifact written, under the designated `agent-output/S4-legacy-client-imports/` directory.
- The skill, evaluator, and reference answers were not modified.

## Sources (all read-only, within the allowed paths)

- `skills/plugin-upgrade/SKILL.md` (modes, safety boundaries, reporting structure)
- `skills/plugin-upgrade/references/pre-flight.md` (seven touchpoint classes, summary template)
- `skills/plugin-upgrade/references/v0.1.2-alpha.1.md` — cards DSH-0.1.2-A1-25 (:415), A1-26 (:443), A1-27 (:461), A1-30 (:521); related A1-01 (:57), A1-03 (:125), A1-19 (:306), A1-32 (:549)
- `skills/plugin-upgrade/references/v0.1.2-alpha.2.md` — related card DSH-0.1.2-A2-02 (:47)
- `skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md` — API-01 (:87), API-10 (:590)
- `skills/plugin-upgrade/references/rollup-0.1.2.md` — R-01 (:92), R-02 (:113), R-05 (:165)
- `skills/plugin-upgrade/references/precision-checklist.md` (peer/dependency discipline, citation contract)
- Fixture: `fixture/package.json`, `fixture/src/client/index.ts`, `fixture/src/client/Pet.tsx`, `fixture/README.md` (the README's "touchpoint hints" line was treated as a maintainer cross-check only; every mapping above is independently grounded in the card files and ledger, and all four agree)


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.