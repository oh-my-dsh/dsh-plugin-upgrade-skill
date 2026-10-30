# S4 · Legacy Client Runtime Touchpoints → dsh 0.1.2-alpha.2 (read-only scan)

- **Mode**: read-only inspection (skill Mode A applied to a Mode C repository). Deliverable is this
  report only. No file under the fixture was created, modified, or deleted; no build, install,
  dependency resolution, or migration was performed.
- **Fixture (static copy, not executable, unmodified)**
  `<…>/benchmark/results/artifacts/2026-10-12-step5-preview-s1-s24-r1/skill/S4-legacy-client-imports/fixture/`
  - `package.json` (7 lines)
  - `README.md` (6 lines, maintainer copy: "Test material only — do not execute or publish")
  - `src/client/index.ts` (14 lines)
  - `src/client/Pet.tsx` (1 line)
- **From → to**: source written in the dsh 0.1.1-rc.2 era → dsh 0.1.2-alpha.2.
  Corridor resolved by the `from → to` metadata in `references/README.md` (never by filename order):
  `references/v0.1.2-alpha.1.md` (`dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1`, 28 cards) then
  `references/v0.1.2-alpha.2.md` (`dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2`, 8 cards), plus
  `references/rollup-0.1.2.md` (corridor-level `R-01…R-13`) and
  `references/api-migration-0.1.2-alpha.2.md` (exact rc.2→alpha.2 interface ledger `API-01…API-10`,
  `CFG-01`).
- **Plane**: Web Client for every hit. Evidence: `fixture/package.json:6`
  `"dsh": { "client": { "platform": "web" } }`; the entry lives under `src/client/`; the entry
  signature is `apply(ctx: ClientContext)` (`fixture/src/client/index.ts:9`). Per the DSH-0.1.2-A1-01
  field note, the old `apiProxy` facade is host-plane and `ctx.remote` is client-plane, so no
  host-plane rewrite applies to any hit below.
- **Read-only tooling used** (both documented as non-writing; both confirmed not to write by
  re-reading the fixture afterwards):
  - `skills/plugin-upgrade/scripts/plan-migration.mjs --root <fixture> --from dsh-v0.1.1-rc.2
    --to dsh-v0.1.2-alpha.2`
  - `skills/plugin-upgrade/scripts/inject-lint.mjs <fixture>`
  Their output is quoted verbatim in §6; both are heuristic first passes and both **under-report**
  this fixture (see §6.1).

---

## 1. Summary — every touchpoint that breaks on 0.1.2-alpha.2

| # | Touchpoint | File / line | Plane | Card ID (full) | Migration action |
|---|---|---|---|---|---|
| 1 | `ClientContext` imported from the removed `@deepseek-ai/dsh-client-runtime/client`, used as the `apply` parameter type | `src/client/index.ts:1`, `:9` | Web Client | **DSH-0.1.2-A1-25** | Import `Context` from `@deepseek-ai/cordis` and alias it; add owning packages as direct dev/peer deps; keep `dsh.client.inject` free of the removed package |
| 2 | Client bundle registers under a non-package id: `__ModuleLoader__.load('pet-legacy-bundle', …)` | `src/client/index.ts:10` (declared at `:5`) | Web Client | **DSH-0.1.2-A1-26** | Register under the package.json `name` (`dsh-pet-session-bench`); align assembly-row name and the boot-manifest entry |
| 3 | Flat `useSession()` `nodes` snapshot read, indexed as an array | `src/client/index.ts:2`, `:12`, `:13` | Web Client | **DSH-0.1.2-A1-27** (related: DSH-0.1.2-A1-03; exact target shape in API-10 / rollup R-11) | Read the transcript via `useChat` / `ctx.useChat`, `snapshot.order` + `snapshot.nodes.get(id)`; for session content use `sessions.binding(id).eventSource` |
| 4 | `ctx.connection.api.agentPresets.list()` — removed client `connection.api` face | `src/client/index.ts:11` | Web Client | **DSH-0.1.2-A1-30** (re-route: DSH-0.1.2-A1-01; error contract: DSH-0.1.2-A2-02) | Move to `ctx.remote.agentPresets.list(...)`, declare the `remote` contribution in `inject`, branch on `result.ok` / `result.error.code` |
| 5 | Dependency / peer / `dsh.client.inject` composition: manifest declares **no** dependencies while source imports two `@deepseek-ai/*` packages, one of which no longer exists in the cohort | `package.json:1-7` | plugin (packaging surface) | **DSH-0.1.2-A1-25** + **DSH-0.1.2-A2-03** (+ rollup R-01, R-08) | Declare direct dev/peer deps for every owning package consumed (cohort floor `^0.1.2-alpha.2`, `@deepseek-ai/cordis` `^4.0.1`); compose `dsh.client.inject` from real service packages only |
| 6 | `export const inject = ['slots', 'conversation']` | `src/client/index.ts:7` | Web Client | no version card; precision-checklist (renderer `slots` type/declaration split) | Keep runtime inject as-is; make sure the `slots` Context augmentation is in the type graph (type-only import from the renderer package) and that `slots` is provided by the real renderer module |

Touchpoint classes #1, #2, #4, #6, #7 (source patches, internal/persistent events, host filesystem,
custom HTTP/WS/RPC/DOM/CSS channels, subprocess/output) have **zero hits** — see §4.

---

## 2. Findings in detail

### Finding 1 · Removed client-runtime package and `ClientContext` type

- **Location**: `fixture/src/client/index.ts:1`
  `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`;
  consumed at `fixture/src/client/index.ts:9` `export function apply(ctx: ClientContext): void`.
- **Plane**: Web Client (browser half of the plugin).
- **Card**: `DSH-0.1.2-A1-25` — *`@deepseek-ai/dsh-client-runtime` package removed, client symbols
  migrated by domain* (breaking, touchpoints #3/#5, action level required-if-hit).
- **Old pattern**: type-only import of `ClientContext` from the aggregated client runtime.
- **How it breaks**: the package is deleted from `packages/client` in alpha.1;
  `references/rollup-0.1.2.md:170` (R-05) lists `@deepseek-ai/dsh-client-runtime` among the five
  packages removed on the rc.2→alpha.1 edge. Typecheck/build reports a nonexistent module
  (TS2307-class), and the runtime half never enters the boot graph or stays pending, often with no
  explicit error (A1-25 symptoms). `inject-lint.mjs` independently flags this file:
  `"runtimeRefsLeft": ["…fixture\\src\\client\\index.ts"]`, `"verdict": "FIX-REQUIRED"`.
- **Migration action**: per the A1-25 mapping table (`references/v0.1.2-alpha.1.md:424-431`):
  `ClientContext` → `import type { Context } from '@deepseek-ai/cordis'` (the alias form is shown in
  `examples/01-simple-client-plugin.md:46-51`); every other symbol the plugin consumes moves to its
  owning package (`ISessions`/`SessionFace`/`SessionBinding` →
  `@deepseek-ai/dsh-api-session-controller/client`; `ConversationNode` →
  `@deepseek-ai/dsh-client-ui-conversation/client`; `CommandRowProps` →
  `@deepseek-ai/dsh-client-ui-chat/client`). Activate the needed Context augmentations with
  **type-only** imports and add only the owning packages actually hit; declare each of them as a
  direct dev/peer dependency (API-10 "Type composition and dependency ownership",
  `references/api-migration-0.1.2-alpha.2.md:631-637`). At the same time make sure
  `dsh.client.inject` carries no reference to the removed package — the fixture manifest has **no**
  `dsh.client.inject` key at all (`package.json:1-7`, verified), so that sub-step is a no-op here;
  only packages that really provide services may be composed there.
- **Source**: `references/v0.1.2-alpha.1.md:415-439`; `references/rollup-0.1.2.md:170`;
  `references/api-migration-0.1.2-alpha.2.md:597-604` (API-10 exact mapping);
  `examples/01-simple-client-plugin.md:15-70`.

### Finding 2 · Client bundle registration id ≠ package.json name

- **Location**: `fixture/src/client/index.ts:10`
  `__ModuleLoader__.load('pet-legacy-bundle', () => { … })`; the global is declared locally at
  `fixture/src/client/index.ts:5`.
- **Plane**: Web Client (client-bundle registration / boot graph).
- **Card**: `DSH-0.1.2-A1-26` — *client-modules scan contract: registration id must equal the
  package.json name* (breaking, touchpoint #5, action level required-if-hit).
- **Old pattern**: registering the client half under an ad-hoc bundle id (`pet-legacy-bundle`) while
  the package is named `dsh-pet-session-bench` (`fixture/package.json:2`).
- **How it breaks**: 0.1.2's boot manifest keys entries / modules / plugin registrations by package
  name (`Entry name == package name`). Symptoms per A1-26: the startup assertion
  `loaded without registering "<id>"`, or — more subtly — the panel silently disappears, the plugin
  is absent from the boot graph, and no plugin-related error appears in the logs
  (`references/troubleshooting.md:7-8`).
- **Migration action** (A1-26 recipe, `references/v0.1.2-alpha.1.md:450-455`): the three ids must
  agree with `package.json` `name` as the baseline —
  1. the client bundle's registration id (the id of `__ModuleLoader__.load`, usually injected by the
     tsdown banner `PLUGIN_ID`) must be `dsh-pet-session-bench`;
  2. the assembly row's `name` (in the plugin's own `cordis.patch.yml` or the home patch) must use
     the bare package name;
  3. verify with `dsh --profile <name> --dump-config`.
  Verification per the card: `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"`,
  the served script fetched from the combo route `/plugins/??dsh-pet-session-bench/client.js&rev=…`
  contains that registration, and the startup log has no `loaded without registering` /
  `entries did not activate`.
- **Scope limits for this fixture**: there is **no** `cordis.patch.yml`, no `dsh-plugin.json`, no
  build script and no bundler config anywhere in the fixture (file inventory: 4 files). So the
  assembly-row half of A1-26 cannot be checked from this copy, and the id is currently a hardcoded
  literal rather than a `PLUGIN_ID` banner — both marked unconfirmed in §5.
- **Source**: `references/v0.1.2-alpha.1.md:443-457`; `references/troubleshooting.md:7-8`.

### Finding 3 · Flat `useSession()` `nodes` snapshot

- **Location**: `fixture/src/client/index.ts:2`
  `import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`;
  `fixture/src/client/index.ts:12-13`
  `const { nodes } = useSession()` / `const first = nodes[0]`.
- **Plane**: Web Client.
- **Card**: `DSH-0.1.2-A1-27` — *Session content reads now go through the SessionBinding durable
  event window* (breaking, touchpoint #3, action level required-if-hit).
- **Old pattern**: reading the transcript as a flat `nodes` array from a session snapshot.
- **How it breaks**: A1-27's symptom is exactly this class of read — 0.1.2 no longer exposes
  per-session conversation-node snapshots (the timeline became an internal projection of each view
  package; see DSH-0.1.2-A1-03), so `session.getSnapshot().nodes` is undefined/empty and the console
  reports factory errors (`references/v0.1.2-alpha.1.md:466-467`). On alpha.2 the snapshot's `nodes`
  is a **keyed store**, not the old `ConversationNode[]`, and ordering comes from `order`
  (`references/api-migration-0.1.2-alpha.2.md:593`, `:604`; `references/rollup-0.1.2.md:272`), so
  `nodes[0]` silently yields `undefined`.
- **Migration action**: for the chat transcript, use the alpha.2 shape from API-10
  (`references/api-migration-0.1.2-alpha.2.md:609-627`) — read through `useChat` /
  `ctx.useChat((chat) => …)`, iterate `snapshot.order` in order and call `snapshot.nodes.get(id)`
  per id, taking `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client`. For raw session
  content (not the chat view), follow the A1-27 recipe: `sessions.binding(id)` →
  `binding.eventSource.getSnapshot().entries` (`SessionEventLikeEntry` / `SessionBinding` from
  `@deepseek-ai/dsh-api-session-controller/client`), with user text in
  `entry.event.data.content` `{ type: 'text', text }` blocks. Add the owning packages as direct
  type deps (Finding 5) and run one `tsc --skipLibCheck false` pass to locate declaration owners.
- **Corroborating cards** (not the primary ID): `DSH-0.1.2-A1-03` (Session view internals split up
  extensively — the same `useSession`→`useChat` move is recorded in its field note at
  `references/v0.1.2-alpha.1.md:136-144`), rollup `R-11` (`references/rollup-0.1.2.md:272`), and
  `API-10` in the interface ledger.
- **Source**: `references/v0.1.2-alpha.1.md:461-484`; `references/api-migration-0.1.2-alpha.2.md:590-627`;
  `references/rollup-0.1.2.md:262-285`.

### Finding 4 · `ctx.connection.api` face

- **Location**: `fixture/src/client/index.ts:11`
  `ctx.connection.api.agentPresets.list().then(presets => { … })`.
- **Plane**: Web Client (client-plane consumer of the old Host APIProxy mirror).
- **Card**: `DSH-0.1.2-A1-30` — *Client `ctx.connection.api` face removed entirely; history /
  transcript reads rerouted* (breaking, touchpoint #3, action level required-if-hit).
- **Old pattern**: `ctx.connection.api.<namespace>.<method>()` — here `agentPresets.list()`.
- **How it breaks**: alpha.1 removed the old apiProxy mirror face on `ctx.connection`, so client
  calls throw (`references/v0.1.2-alpha.1.md:526-527`). The current code has no `catch`, so the
  failure surfaces as an unhandled rejection; A1-30's field note records the opposite failure mode
  for call sites that *do* swallow errors — the UI renders "forever blank" while every smoke stays
  green (`references/v0.1.2-alpha.1.md:531`). This is a silent-failure class, so the report flags
  it as high-risk rather than cosmetic.
- **Migration action**:
  1. Re-route per `DSH-0.1.2-A1-01` (APIProxy removed, Host/Web Client calls moved to `@Remote`):
     `agentPresets.list` → `ctx.remote.agentPresets.list(...)` (`references/v0.1.2-alpha.1.md:78`,
     `:92-95`; consumer ledger `references/api-migration-0.1.2-alpha.2.md:146-148` — note the
     related renames: `read` stays `read`, `copy` keeps `name?`, `remove` became `deletePreset(id)`).
  2. Declare the Remote contribution in the entry's `inject` (e.g. `remote` plus the specific
     namespace) and do not rely on another plugin having mounted first
     (`references/api-migration-0.1.2-alpha.2.md:162-164`). The fixture's current `inject`
     (`index.ts:7`) does not declare `remote`, so this is an additive change.
  3. Handle the result per `DSH-0.1.2-A2-02`: branch on `result.ok` first, then on
     `result.error.code` (namespaced codes, `RemoteError` instance; never `instanceof`, never parse
     `message`) — `references/v0.1.2-alpha.2.md:59-79`.
  4. Once the client no longer consumes the face, remove `connection` from the inject list and the
     type mirror (A1-30 recipe). The fixture's `inject` does not list `connection`; the only
     `connection` typing here rides on the removed `ClientContext` from Finding 1 and disappears with
     it.
- **Plane check**: because this plugin runs on the Web Client face (`package.json:6`), the correct
  target is the client projection `ctx.remote.*`; the host-plane alternative (inject the owning
  domain service directly) does not apply (A1-01 field note,
  `references/v0.1.2-alpha.1.md:97-106`).
- **Source**: `references/v0.1.2-alpha.1.md:521-531`; `references/v0.1.2-alpha.1.md:57-108`;
  `references/v0.1.2-alpha.2.md:47-81`.

### Finding 5 · Dependency, peer and `dsh.client.inject` composition

- **Location**: `fixture/package.json:1-7` (whole manifest).
- **Plane**: plugin packaging surface (not one of the seven classes; "Special surfaces" in
  `references/pre-flight.md:188-189`).
- **Cards**: `DSH-0.1.2-A1-25` (declaration ownership) + `DSH-0.1.2-A2-03` (NPM packages trim
  unneeded peer dependencies) + rollup `R-01` (target-cohort availability) and `R-08`
  (peer-floor rewrite) + `references/precision-checklist.md` (peer floors).
- **Evidence**: the source imports `@deepseek-ai/dsh-client-runtime/client` (`index.ts:1`) and
  `@deepseek-ai/dsh-client-ui-chat/client` (`index.ts:2`), yet the manifest declares no
  `dependencies`, no `peerDependencies`, no `@deepseek-ai/*` ranges and no `dsh.client.inject`.
  `inject-lint.mjs` reports `"importedClientModules": []`, `"declaredInject": []`,
  `"cordisPeer": null`, `"cordisOk": false`, `"verdict": "FIX-REQUIRED"`.
- **Migration action**:
  - After Findings 1/3/4, every package whose declarations or services the plugin consumes must be
    a **direct** dev/peer dependency on the target cohort — a published package's
    `devDependencies` are not transitively installed for consumers, and with `skipLibCheck: true` a
    missing declaration shows up later as an implicit `any` in selectors/callbacks
    (`references/api-migration-0.1.2-alpha.2.md:631-637`; `DSH-0.1.2-A2-03` field note).
  - Peer floors: rewrite the DSH cohort to `^0.1.2-alpha.2` (rollup R-08,
    `references/rollup-0.1.2.md:233`) and pin `@deepseek-ai/cordis` at `^4.0.1`
    (`references/precision-checklist.md:40-46`).
  - `dsh.client.inject` is an exact recomposition by capability, not a subset; list only runtime
    service modules the client half actually consumes (`references/precision-checklist.md:48-99`)
    and keep the no-longer-existing `dsh-client-runtime` out of it (A1-25,
    `references/v0.1.2-alpha.1.md:435`).
  - `package.json:6`'s `"dsh": { "client": { "platform": "web" } }` is what puts this plugin on the
    browser roster (A1-01 field note) — keep it; do not rewrite the manifest wholesale.
- **Source**: `references/api-migration-0.1.2-alpha.2.md:631-637`; `references/v0.1.2-alpha.2.md:85-96`;
  `references/rollup-0.1.2.md:92-111`, `:223-235`; `references/precision-checklist.md:35-99`.

### Finding 6 · `inject = ['slots', 'conversation']` (check, no version card)

- **Location**: `fixture/src/client/index.ts:7`.
- **Plane**: Web Client.
- **Card**: no version card covers this line. Related non-card material:
  `references/precision-checklist.md:81-99` — after the client split the `slots` **service** lives
  in the renderer package, so a plugin that consumes slots needs the renderer-owned Context
  declarations in its type graph (a type-only import such as
  `import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'` is one way), while a pending
  `slots` service must be fixed by the real renderer module's activation in the client composition —
  a type-only import is not a boot fix.
- **Action**: keep the runtime inject entries as they are; verify the type graph separately with
  `skipLibCheck: false`, and do **not** add the renderer to `package.json`'s `dsh.client.inject`
  solely because of the type import.
- **Status**: the `conversation` service name is still used unchanged in the alpha.1 A1-27 recipe
  (`references/v0.1.2-alpha.1.md:475`), which is evidence it survives the split; it is not carded as
  a removal → treated as a check item, not a break.
- **Source**: `references/precision-checklist.md:81-99`; `references/v0.1.2-alpha.1.md:468-481`.

### Finding 7 · `src/client/Pet.tsx` (non-hit)

- `export function Pet() {}` (`fixture/src/client/Pet.tsx:1`), imported at `index.ts:3` and unused.
- No card applies; no touchpoint class hit. Noted only so the scan is provably exhaustive over the
  four files.

---

## 3. Corridor net-state notes (why no "delete then re-add" traps)

- `SessionEvent.ignorable` is removed by `DSH-0.1.2-A1-02` and restored by `DSH-0.1.2-A2-01`
  (`references/rollup-0.1.2.md:52-55`). Net state at alpha.2 = restored. The fixture has zero
  session-event code (class #2: 0 hits), so no producer/persistence work is required.
- `ClientContext` and the client symbols are removed in alpha.1 and never restored
  (`DSH-0.1.2-A1-25`); `ctx.connection.api` is removed in alpha.1 and never restored
  (`DSH-0.1.2-A1-30`); the transcript read surface moves to `useChat` + keyed nodes in the same
  edge. Therefore the migration goes straight to the alpha.2 target shape — no alpha.1 intermediate
  state should be coded and then undone.
- `DSH-0.1.2-A2-02` only matters here *because* Finding 4 must migrate to `ctx.remote`; on its own it
  is not a hit (the fixture never touches `ctx.remote` today).

---

## 4. Non-hit touchpoint classes (with evidence)

| Class | Hits | Evidence / why not hit | Cards therefore not applied |
|---|---:|---|---|
| #1 source patch / monkey patch | 0 | no `patch.yml`, `patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT` in any of the 4 files; planner class #1 = 0/0 | `DSH-0.1.2-A1-03` (patch-surface half), API-08 |
| #2 internal / persistent events | 0 | no `SessionEvent`, `ctx.on(`, `tool/code-dispatch`, `connection/reset`; planner class #2 = 0/0 | `DSH-0.1.2-A1-02`, `DSH-0.1.2-A2-01`, `DSH-0.1.2-A1-06` |
| #3 internal service probes / Remote | 4 (see Findings 1, 3, 4) | `dsh-client-runtime` import, `useSession`, `ctx.connection.api` | `DSH-0.1.2-A1-01`, `A1-20`, `A1-21`, `A1-22`, `A1-27`, `A1-30`, `A1-31`, `A1-32`, `A2-02`, `A2-05`, `A2-06`, `A2-08`, `A2-10` — only `A1-01`, `A1-27`, `A1-30`, `A2-02` intersect the actual code; the rest have no matching surface here (no `userQuestions`, no `resolveSessionPreset`, no `isTokenDelta`, no `connectWorkspace`/`pickDirectory`/`baselinesReady`, no `pluginInventory`, no `$host`, no `sessionProjections` peers, no `settingsNamespace`) |
| #4 host filesystem | 0 | no `DSH_HOME`, `.dsh/`, `profiles/`, `homedir(`, `readFile`/`writeFile`/`mkdir`/`openPath`; planner class #4 = 0/0 | `DSH-0.1.2-A1-04`, `A1-13`, `A1-21` |
| #5 internal UI / commands / tool registration | 3 (Findings 1, 2, 6) | `dsh-client-runtime` (`index.ts:1`), `__ModuleLoader__` (`index.ts:5`, `:10`), `useSession` (`index.ts:2`, `:12`) | `DSH-0.1.2-A1-25`, `A1-26` apply; `A1-28` (composer contenteditable), `A1-29` (`MarkdownText` labels), `A1-09`/`A1-10`/`A1-11` (capabilities) have no matching surface — no DOM manipulation, no `MarkdownText`, no command/view registration |
| #6 custom HTTP / WS / RPC / DOM / CSS | 0 | no `createServer(`, `WebSocket`, `MutationObserver`, `insertRule`, `127.0.0.1`, `/api/`, `contenteditable`, `setSelectionRange`; planner class #6 = 0/0; `inject-lint.mjs` `"rawWebServerRouteFiles": []`, `"routeReviewRequired": false` | `DSH-0.1.2-A1-08`, `A1-28` |
| #7 subprocess / stdout / stderr | 0 | no `child_process`, `spawn(`, `headless`, `--profile`; planner class #7 = 0/0 | `DSH-0.1.2-A1-04`, `A1-05`, `A2-04` |
| Web startup / acceptance | 0 | no acceptance scripts, no boot-manifest readers, no `window.__DSH_BOOT__` consumers in the fixture | `DSH-0.1.2-A1-19` (still recommended as a *verification* step for the migrated plugin) |

---

## 5. Unconfirmed items (stated, not guessed)

1. **`__ModuleLoader__.load` argument shape at the target tag.** The fixture declares a local
   two-argument shape `(id: string, fn: () => void)` (`index.ts:5`). A1-26's verification snippet
   shows built bundles containing `__ModuleLoader__.load({ id: "<package name>"`
   (`references/v0.1.2-alpha.1.md:455`), i.e. an object argument in the built artifact. No card
   states a signature change, so the **id equality** is the authoritative requirement and the
   argument shape must be confirmed against `packages/client/modules/src/client/system.ts` at
   `dsh-v0.1.2-alpha.2` before editing. **Unconfirmed.**
2. **Whether `useSession` remains an export of `@deepseek-ai/dsh-client-ui-chat/client` at
   alpha.2.** The cards mandate moving the *read* to `useChat` + keyed nodes (A1-27 / API-10 /
   R-11); they do not declare the `useSession` export itself removed. **Unconfirmed.**
3. **Exact signature of `ctx.remote.agentPresets.list(...)` at alpha.2** (the legacy call passes no
   arguments). The A1-01 ledger gives the method path, not its parameter list. **Unconfirmed** —
   must be read from the generated declarations at the target tag.
4. **Registry availability of the target cohort.** `references/rollup-0.1.2.md:108` (R-01 "npm
   reality", 2026-08-31) states `@deepseek-ai/dsh-*` has `0.1.1-rc.1`, `0.1.1-rc.2` and
   `0.1.2-alpha.2` on npm and that alpha.1 was never published. I did not query any registry
   (no network access). **Unconfirmed by me**; re-check per R-01 before pinning.
5. **Assembly-row and boot-graph checks.** The fixture has no `cordis.patch.yml`, no
   `dsh-plugin.json`, no build script and no lockfile, so A1-26's three-id check (bundle id /
   assembly-row name / `--dump-config`) can only be partially evaluated. **Not evaluable from this
   copy.**
6. **Baseline correctness.** The fixture is stated to be rc.2-era source; no build/typecheck was run
   (read-only task), so the "from" tag rests on the maintainer's statement, not on a measured
   baseline (R-06). **Not measured.**
7. **`conversation` service survival.** Inferred only from its unchanged use in the alpha.1 A1-27
   recipe; no card states it exists at alpha.2. **Unconfirmed.**

---

## 6. Read-only tooling output (verbatim, cross-check)

### 6.1 `plan-migration.mjs` (heuristic, first pass)

```
- Corridor: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2`
- Scanned files: 3                      (Markdown skipped; package.json, Pet.tsx, index.ts)
- #5 internal UI / commands / tool registration | detected | 1/1
- #1 #2 #3 #4 #6 #7 → 0/0
- Hit locations: #5 `src/client/index.ts:1` (pattern 2)
- Applicable cards: DSH-0.1.2-A1-03, A1-06, A1-09, A1-10, A1-11, A1-25, A1-26, A1-28, A1-29,
  A1-32, DSH-0.1.2-A2-05  (manual-review list: A1-12, A1-23, A1-24, A2-03)
```

**Why the planner under-reports, and why manual review governs**: `matchingLine()` in
`skills/plugin-upgrade/scripts/plan-migration.mjs:118-151` returns only the *first* matching line
per file per pattern and then `break`s out of the pattern loop for that file. Consequences here:

- only `index.ts:1` is reported, although pattern 2 (`dsh-client-runtime|…|useSession|useChat|…`)
  also matches lines 2 and 12;
- pattern 3 (`__ModuleLoader__|PLUGIN_ID`) is never evaluated because pattern 2 already matched;
- class #3 has no matcher for `ctx.connection.api`, so Finding 4 is invisible to the heuristic even
  though it is one of the four real breaks.

This matches the skill's own warning that the planner's results remain heuristic and that zero or
few hits still require manual dependency/import review (`skills/plugin-upgrade/SKILL.md:76`).
The card list it emits is a candidate set; per `SKILL.md:77` only cards that intersect the hit
touchpoints and the actual face are kept — hence the trimmed set in §1.

### 6.2 `inject-lint.mjs` (alpha.2 residue / peer check)

```json
{
  "importedClientModules": [],
  "declaredInject": [],
  "peersMissingForInject": [],
  "peersMissingForImports": [],
  "cordisPeer": null,
  "cordisOk": false,
  "runtimeRefsLeft": ["…fixture\\src\\client\\index.ts"],
  "rawWebServerRouteFiles": [],
  "routeReviewRequired": false,
  "verdict": "FIX-REQUIRED"
}
```

`runtimeRefsLeft` independently confirms Finding 1 (removed-package residue in source);
`cordisPeer: null` / `cordisOk: false` confirm Finding 5 (no peer block at all, so the
`^4.0.1` cordis floor and the cohort peers cannot be satisfied from the manifest as-is);
`rawWebServerRouteFiles: []` confirms class #6 is a true zero-hit.

---

## 7. Validation plan for the migration (NOT executed — read-only task)

1. **Static inventory**: after the edits, `grep -r "dsh-client-runtime" .` must be empty in source,
   `dependencies`/`peerDependencies`, `dsh.client.inject` and any lockfile
   (`references/precision-checklist.md:134-139`); `node skills/plugin-upgrade/scripts/inject-lint.mjs
   <repo>` must no longer report `FIX-REQUIRED` for residue/peers.
2. **Typecheck with real declarations**: one diagnostic run with `tsc --skipLibCheck false` to
   locate every missing declaration owner, then restore the repository policy; no new implicit `any`
   (`references/api-migration-0.1.2-alpha.2.md:636`).
3. **Card-level tests**: chat snapshot fixtures in the real keyed shape (`order` + `nodes.get`),
   including missing ids; the agent-presets call covered for `ok: true` and at least one domain
   error code (A2-02); an explicit assertion that a failed preset read renders an error state rather
   than a blank panel (A1-30 silent-failure class).
4. **Web runtime (per DSH-0.1.2-A1-19)**: isolated profile, `dsh web --no-open`, token URL → Cookie,
   read `window.__DSH_BOOT__.entries`, confirm `"id":"dsh-pet-session-bench"`, request the
   host-advertised client resource (not a hand-built path), confirm `__ModuleLoader__.load`
   registration under the package name (A1-26), wait for a plugin-owned DOM marker, collect page
   errors, then remove.
5. **Composition**: `dsh --profile <name> --dump-config` shows the correct row name and no pending
   rows; a Web cold boot has no `pending (waiting for service: …)`.
6. **Distinguish the three completion states** (typecheck passed ≠ Loader mount passed ≠ real
   behavior passed) in the final migration report (`references/api-migration-0.1.2-alpha.2.md:695-701`).

---

## 8. Read-only discipline statement

- Inspected read-only: the four fixture files, `skills/plugin-upgrade/**` (SKILL.md, references,
  examples, scripts).
- Nothing under the fixture was created, modified, moved, or deleted. Verified after running the two
  read-only scripts by re-listing and re-reading the fixture: still exactly
  `README.md`, `package.json`, `src/client/Pet.tsx`, `src/client/index.ts` with identical contents
  (index.ts re-read in full: 14 lines, byte-identical to the first read).
- No build, no dependency install, no environment creation, no migration change, no git operation,
  no network access, no reads outside the three permitted paths. The only writes are this report
  under `agent-output/S4-legacy-client-imports/`.
- The two scripts that were executed are documented as read-only and write nothing
  (`skills/plugin-upgrade/scripts/README.md:6`, `:8`); their output is quoted in §6 and their
  heuristic limits are documented in §6.1 rather than trusted blindly.
