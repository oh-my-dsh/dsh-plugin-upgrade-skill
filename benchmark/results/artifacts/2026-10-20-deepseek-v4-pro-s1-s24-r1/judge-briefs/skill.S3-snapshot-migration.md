# JUDGE BRIEF · skill.S3-snapshot-migration

## Criteria (sealed rubric)
- [chat-projection] (20pt) Locate Pet.tsx partial/runningCalls/turnEnds reads. Explain their temporary chat legacy projection and subsequent views/timeline or target-owned Chat access. Accept a supported direct migration when it explains the compatibility option; merely saying legacy is insufficient.
- [session-lifecycle] (20pt) Locate running in Pet.tsx and explain it belongs to the Session/useSession lifecycle seat, outside chat legacy. Do not claim the existing useSession call itself must be renamed for running.
- [type-and-inject] (20pt) Locate removed dsh-client-runtime imports and the package.json client.inject entry. Repoint Context as ClientContext to scoped cordis and snapshot types to their target owner; do not claim every snapshot type is exported by cordis. Unknown exact snapshot symbols may be explicitly deferred to target exports.
- [slot-registration] (20pt) Locate the scoped slots.register call in index.ts. Explain slots.inject around registration and the ui-renderer/client Context augmentation/service ownership; preserve the slot name and lifetime. Accept equivalent supported registration forms.
- [mapping-and-plan] (20pt) Tie the located snapshot/lifecycle/slot changes to full DSH-0.1.2-A1-03 and separate temporary projection from immediate type/inject/lifecycle changes. A1-25 is a valid additional package-removal card. A bare card ID earns zero.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S3-snapshot-migration/report.md

# S3 · Snapshot Read-Surface Migration Assessment (Read-Only)

**Mode**: A · inspect (read-only). No code was modified; the fixture was not touched.
**Plugin**: `@demo/dsh-bench-pet` v0.1.0 (private) — a Web Client pixel-pet in the session header.
**Face**: Web Client only (no Node/host runtime entry — `package.json` has no `main`/`exports`).
**Source era**: 0.1.1-rc.1 style (per fixture README).
**Target host**: `dsh 0.1.2-alpha.2`.

## Corridor

`dsh-v0.1.1-rc.1 → dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`, connected by the
`from → to` edges in the corridor index. The plugin is already at rc.1, so the rc.8→rc.1 edge is
already applied except where noted below (manifest key). The breaking work is concentrated on the
rc.2→alpha.1 edge (client-runtime removal, snapshot keying) plus the alpha.2 cohort pinning.

## Summary of findings

| # | Surface (file:line) | Break on 0.1.2-alpha.2 | Primary card(s) |
|---|---|---|---|
| S1 | `package.json:6-9` manifest key `client` | client half not recognized (must be `dsh.client`) | DSH-0.1.1-R1-02, DSH-0.1.1-R1-03 |
| S2 | `package.json:8` inject contains `dsh-client-runtime` | phantom dependency → row pending / out of boot graph | DSH-0.1.2-A1-25 |
| S3 | `package.json:8` inject misses recomposed owners (ui-slots / ui-chat / ui-renderer) | `slots`/`useChat` types/svc unresolved | DSH-0.1.2-A1-25, DSH-0.1.2-A2-03 |
| S4 | `src/client/index.ts:6` `ClientContext` from removed runtime | module not found / TS2307 | DSH-0.1.2-A1-25, API-10, R-11 |
| S5 | `src/client/Pet.tsx:8` `ConversationSnapshot` from removed runtime | module not found / TS2307 | DSH-0.1.2-A1-25, API-10, R-11 |
| S6 | `src/client/Pet.tsx:13-15` `snapshot.partial?.blocks` reasoning read | flat field gone | DSH-0.1.2-A1-03, API-10 |
| S7 | `src/client/Pet.tsx:19` `s.running` (lifecycle) | flat field gone; not in legacy projection | DSH-0.1.2-A1-03 |
| S8 | `src/client/Pet.tsx:21` `s.runningCalls` | flat field gone | DSH-0.1.2-A1-03, API-10 |
| S9 | `src/client/Pet.tsx:23` `s.turnEnds` | flat field gone | DSH-0.1.2-A1-03, API-10 |
| S10 | `src/client/Pet.tsx:18-23` `useSession` transcript hook | replaced by `useChat` keyed read | API-10, R-11 |
| S11 | `src/client/Pet.tsx:7` `PropsRuntime<'…'>` provides `useSession` | slot runtime props now expose `useChat` (+ `useSession` lifecycle seat) | API-10, DSH-0.1.2-A1-03 |
| S12 | `src/client/index.ts:29,38` `slots` service type-graph | slots service now owned by `ui-renderer` | DSH-0.1.2-A1-25, precision-checklist |
| S13 | `package.json` (whole) missing peerDependencies | type-graph won't resolve at alpha.2 cohort | DSH-0.1.2-A2-03, R-01/R-08 |

Non-breaking (already conformant / verify only): `cordis.patch.yml` insert row, `ctx.effect`,
`ctx.locale.register`, `ctx.inject(['slots','conversation'])`, `LocaleNamespaceMap` augmentation,
`dsh-client-locale` / `dsh-client-ui-conversation` type-only imports (packages survive).

---

## Detailed findings

### S1 · Manifest key `client` → `dsh.client`

- **Evidence**: `package.json:6` declares the client half under a top-level `client` key.
- **Old form**: `"client": { "platform": "web", "inject": [...] }`.
- **Break**: from 0.1.1-rc.1 on, only `dsh.client` is read (legacy `dshClient` was merged into
  `dsh.client`; client-modules enumerates packages only by the `dsh.client` declaration). A bare
  `client` key is ignored, so the browser half silently never enters the plugin roster — no Node-side
  error.
- **Target form**:
  ```json
  "dsh": { "client": { "platform": "web", "inject": [...] } }
  ```
- **Cards**: DSH-0.1.1-R1-02, DSH-0.1.1-R1-03. Acceptance also reads the boot manifest (DSH-0.1.2-A1-19).
- **Verify**: pack and confirm the packed manifest carries `dsh.client`; cold boot and assert the entry
  appears in `window.__DSH_BOOT__.entries`.

### S2 · `dsh-client-runtime` in the inject list

- **Evidence**: `package.json:8` — `"inject": ["dsh-client-runtime", ...]`.
- **Break**: `@deepseek-ai/dsh-client-runtime` was deleted in alpha.1. Keeping it is a runtime phantom
  dependency: the assembly row stays `pending` / out of the boot graph, often with no explicit error.
- **Target form**: remove `dsh-client-runtime`; keep only packages that really provide services.
- **Cards**: DSH-0.1.2-A1-25 (field note: dsh-input-history reproduced exactly this).
- **Verify**: grep source + packed manifest + lockfile for any surviving `dsh-client-runtime` reference.

### S3 · `dsh.client.inject` recomposition (by capability)

- **Evidence**: `package.json:8` — `inject` lists runtime/conversation/locale only.
- **Break**: after the runtime unbundling the `slots` service moved to `ui-renderer`, and the snapshot
  read now comes from `ui-chat`; `dsh.client.inject` records runtime module edges, so missing owners
  leave type/service resolution incomplete.
- **Target form** (candidate owners to confirm at the target tag, not a mandatory list):
  ```json
  "inject": [
    "dsh-client-ui-slots",        // mounts into a host slot point (ctx.slots / PropsRuntime)
    "dsh-client-ui-conversation", // composer/dock surface (header.actions slot owner)
    "dsh-client-locale"           // own strings / i18n
  ]
  ```
  `dsh-client-ui-chat` (ChatSnapshot) and `dsh-client-ui-renderer` (slots service declaration) are
  required as type/peer dependencies; add them to `dsh.client.inject` only if the bundle value-imports them.
- **Cards**: DSH-0.1.2-A1-25, DSH-0.1.2-A2-03; precision-checklist ("`dsh.client.inject` is an exact
  recomposition, not a subset").
- **Verify**: `skipLibCheck: false` typecheck + real cold boot (no `pending` rows).

### S4 · `ClientContext` type

- **Evidence**: `src/client/index.ts:6` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`.
- **Break**: package removed (alpha.1); TS2307 / module resolution failure; `skipLibCheck: true` can
  silently widen selectors to `any` instead of erroring.
- **Target form**:
  ```ts
  import type { Context } from '@deepseek-ai/cordis'
  // type-only augmentations per actual use:
  import type {} from '@deepseek-ai/dsh-client-locale/client'          // ctx.locale
  import type {} from '@deepseek-ai/dsh-client-ui-conversation/client' // SlotMap merge
  import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'     // ctx.slots (renderer-owned)
  type ClientContext = Context
  ```
- **Cards**: DSH-0.1.2-A1-25, API-10, R-11 (`ClientContext` → Cordis `Context`).

### S5 · `ConversationSnapshot` type

- **Evidence**: `src/client/Pet.tsx:8` — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`.
- **Break**: package removed; the flat snapshot type no longer exists under that name.
- **Target form**: `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client` (keyed store, not the
  old `ConversationNode[]`).
- **Cards**: DSH-0.1.2-A1-25, API-10, R-11.

### S6 · `snapshot.partial?.blocks` reasoning detection

- **Evidence**: `src/client/Pet.tsx:13-15` — `snapshot.partial?.blocks.some(block => block.kind === 'reasoning')`.
- **Break**: `partial` flat field is gone; the `block.kind` discriminant no longer exists on a keyed store.
- **Target form**: iterate `ChatSnapshot.order` and `snapshot.nodes.get(id)`; narrow assistant nodes by
  discriminant (`type === 'assistant-step'`) and inspect reasoning content. Minimal ordered-read helper
  (from API-10):
  ```ts
  function orderedNodes(snapshot: ChatSnapshot) {
    return snapshot.order.flatMap((id) => {
      const node = snapshot.nodes.get(id)
      return node ? [node] : []
    })
  }
  ```
  The exact reasoning predicate must be pinned to the target tag's `ChatNode` union — the old
  `block.kind === 'reasoning'` has no 1:1 keyed equivalent to quote from memory.
- **Cards**: DSH-0.1.2-A1-03, API-10.

### S7 · `s.running` (lifecycle) — must switch immediately

- **Evidence**: `src/client/Pet.tsx:19` — `useSession(s => s.running)`.
- **Break**: `running` is a lifecycle field; it is **not** served by the `views.get('chat')?.legacy`
  compatibility projection.
- **Target form**: read through the alpha.2 `useSession` seat (lifecycle subscription), which survives
  but whose selector input type is no longer the flat `ConversationSnapshot`.
- **Cards**: DSH-0.1.2-A1-03 (field note: "lifecycle fields (e.g. running) are not in the projection and
  must go through the `useSession` seat instead").

### S8 · `s.runningCalls` (tool in flight)

- **Evidence**: `src/client/Pet.tsx:21` — `useSession(s => s.runningCalls.length > 0)`.
- **Break**: flat `runningCalls` field gone from the new read surface.
- **Target form**: staged via `views.get('chat')?.legacy.runningCalls` (dual-host only), final via
  re-deriving tool-in-flight state from ordered `ChatSnapshot` nodes.
- **Cards**: DSH-0.1.2-A1-03, API-10.

### S9 · `s.turnEnds` (turn timeline)

- **Evidence**: `src/client/Pet.tsx:23` — `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`.
- **Break**: flat `turnEnds` field gone.
- **Target form**: staged via `views.get('chat')?.legacy.turnEnds` (dual-host only), final via the last
  completed turn's end reason derived from ordered nodes / turn tail.
- **Cards**: DSH-0.1.2-A1-03, API-10.

### S10 · `useSession` transcript hook → `useChat`

- **Evidence**: `src/client/Pet.tsx:18-23` reads the whole snapshot through `useSession`.
- **Break**: transcript/snapshot reads move to `useChat`; `useSession` no longer returns the flat
  `ConversationSnapshot` with `partial`/`runningCalls`/`turnEnds`/`nodes`.
- **Target form**: `useChat(chat => ...)` with `ChatSnapshot.order` + `nodes.get(id)`; keep
  `useSession` only for the lifecycle `running` field.
- **Cards**: API-10, R-11 (`useSession` reading `ConversationSnapshot.nodes[]` → `useChat`).

### S11 · `PropsRuntime<'…'>` runtime props

- **Evidence**: `src/client/Pet.tsx:7,10,18` — `PropsRuntime<'conversation.session.header.actions'>`
  destructured as `{ useSession }`.
- **Break**: the slot runtime-props surface now exposes `useChat` (and the `useSession` lifecycle seat);
  the component must destructure the new members and the selector parameter types change.
- **Target form**: `export function Pet({ useChat, useSession, t }: PetProps)`.
- **Cards**: API-10, DSH-0.1.2-A1-03. (Exact member names: confirm against the target tag ui-slots/ui-chat
  slot contract with a `skipLibCheck: false` typecheck — not quoted from memory.)

### S12 · `slots` service type-graph ownership

- **Evidence**: `src/client/index.ts:29` injects `'slots'`; `src/client/index.ts:38-42` calls
  `scope.slots.register(...)`.
- **Break**: the `slots` service now lives in `ui-renderer`. The cordis service name `slots` is
  unchanged, but the Context declaration (`ctx.slots`) is renderer-owned; without the renderer's
  augmentation in the type graph, `scope.slots` typechecks as missing/implicit.
- **Target form**: add `import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'`; keep
  `'slots'` in `export const inject`. Do **not** add renderer to `dsh.client.inject` solely for this
  type-only import.
- **Cards**: DSH-0.1.2-A1-25, precision-checklist ("the renderer's double role decides both lists").

### S13 · Missing peerDependencies at the target cohort

- **Evidence**: `package.json` has no `dependencies`/`peerDependencies` at all.
- **Break**: the owning packages of every consumed declaration (`cordis`, ui-slots, ui-conversation,
  ui-locale, ui-chat, ui-renderer) must be direct peers at the alpha.2 floor, or `skipLibCheck: false`
  reports missing declarations and the packed artifact won't typecheck for consumers.
- **Target form** (floors per precision-checklist; `@deepseek-ai/cordis` pinned exactly `^4.0.1`):
  ```json
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.2-alpha.2",
    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.2-alpha.2",
    "@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.2",
    "@deepseek-ai/dsh-client-ui-chat": "^0.1.2-alpha.2",
    "@deepseek-ai/dsh-client-ui-renderer": "^0.1.2-alpha.2"
  }
  ```
- **Cards**: DSH-0.1.2-A2-03, R-01/R-08 (peer floor prerelease semantics; `^0.1.0-rc.x` does not admit
  `0.1.2-alpha.2`).

---

## Requirement 4 — compatibility projection vs immediate switch

The old flat `ConversationSnapshot` fields split into two buckets on 0.1.2-alpha.2 (DSH-0.1.2-A1-03 field
note + API-10):

| Field (evidence) | Route | Reason |
|---|---|---|
| `running` — `Pet.tsx:19` | **Immediate new read path** — the `useSession` seat | lifecycle field; **not** present in the `legacy` projection |
| `partial` (reasoning) — `Pet.tsx:14` | **Compatibility projection first** — `views.get('chat')?.legacy.partial`, then `useChat` ordered read | flat content field, still readable in the staged `legacy` projection |
| `runningCalls` — `Pet.tsx:21` | **Compatibility projection first** — `views.get('chat')?.legacy.runningCalls`, then `useChat` | flat timeline field in `legacy` projection |
| `turnEnds` — `Pet.tsx:23` | **Compatibility projection first** — `views.get('chat')?.legacy.turnEnds`, then `useChat` | flat timeline field in `legacy` projection |

Staged `legacy` reads are acceptable **only** with an explicit dual-host requirement; they must not become
the primary data surface for an alpha.2-only plugin (API-10). The final alpha.2-only read shape is
`useChat` + `ChatSnapshot.order` + `snapshot.nodes.get(id)`, with assistant content narrowed by
`type === 'assistant-step'`.

---

## Final summary table

| Hit location | Old interface | Typical symptom | Target interface | Required / conditional | Card(s) |
|---|---|---|---|---|---|
| package.json:6 | `client` manifest key | client half silently absent | `dsh.client` | required | DSH-0.1.1-R1-02/03 |
| package.json:8 | inject `dsh-client-runtime` | row pending / out of boot graph | remove; recompose owners | required | DSH-0.1.2-A1-25 |
| index.ts:6 | `ClientContext` (runtime) | TS2307 | cordis `Context` + type-only augments | required | DSH-0.1.2-A1-25, API-10 |
| Pet.tsx:8 | `ConversationSnapshot` (runtime) | TS2307 | `ChatSnapshot` (ui-chat) | required | DSH-0.1.2-A1-25, API-10 |
| Pet.tsx:13-15 | `partial?.blocks` | field gone | `useChat` ordered nodes | required | DSH-0.1.2-A1-03, API-10 |
| Pet.tsx:19 | `s.running` | field gone (no legacy) | `useSession` seat | required | DSH-0.1.2-A1-03 |
| Pet.tsx:21 | `s.runningCalls` | field gone | legacy → `useChat` | required | DSH-0.1.2-A1-03, API-10 |
| Pet.tsx:23 | `s.turnEnds` | field gone | legacy → `useChat` | required | DSH-0.1.2-A1-03, API-10 |
| Pet.tsx:18-23 | `useSession` transcript | wrong selector surface | `useChat` | required | API-10, R-11 |
| Pet.tsx:7,10,18 | `PropsRuntime` → `useSession` | prop absent/any | `useChat` + `useSession` seat | required | API-10, DSH-0.1.2-A1-03 |
| index.ts:29,38 | `slots` type-graph | ctx.slots unresolved | renderer type-only augment | required | DSH-0.1.2-A1-25 |
| package.json | no peers | skipLibCheck:false failures | direct peers @ alpha.2 floor | required | DSH-0.1.2-A2-03, R-01/08 |

## Skipped / non-hits (evidence)

- **#1 source patch**: `cordis.patch.yml` is profile composition (API-08), already in the bare-name form
  (`name: '@demo/dsh-bench-pet'`), so it satisfies DSH-0.1.2-A1-26 — verify, not a change.
- **#2 events**: no `SessionEvent`/`session/event`/append usage — DSH-0.1.2-A1-02 / A2-01 not hit.
- **#3 Remote/APIProxy**: no `ctx.remote`/`apiProxy`/`ctx.connection.api` usage — DSH-0.1.2-A1-01/A1-30/A2-02 not hit.
- **#4 filesystem / workspace**: no `workspaces`/`uiWorkspace` usage — DSH-0.1.2-A1-32 not hit.
- **#5 UI/commands**: no `ctx.commands.execute`, `MarkdownText`, composer DOM, or registerCommand — API-10
  command-images / A1-28 / A1-29 not hit.
- **#6/#7 custom channel / subprocess**: no HTTP/WS/spawn/headless — not hit.

## Pending / residual risk

- Exact `PropsRuntime` member names and the `ChatNode` reasoning/tool/turn discriminants are not spelled
  out in the cards; they must be pinned against the target tag (`ui-slots` / `ui-chat` slot contract)
  with a one-off `skipLibCheck: false` typecheck before the target code is written.
- `conversation.session.header.actions` slot name and its declaring service are not carded as changed; the
  SlotMap type merge will surface any rename at typecheck — verify at the target tag.
- No runtime mount was performed (read-only assessment): typecheck-passed ≠ Loader-mount-passed ≠
  behavior-passed. A real isolated-profile cold boot + one `message → tool → response` flow remains.
- The rc.8→rc.1 edge is draft and the plugin sits at its boundary; any manifest-key ambiguity above is the
  one item that should be confirmed against the packed artifact rather than assumed.

## Read-only discipline

- Fixture `…/fixture/` was inspected read-only and left unchanged.
- No migration, install, build, or lifecycle script was executed.
- Only allowlisted paths were read (fixture, agent-output, `skills/plugin-upgrade/`).
- Recommended (not executed here) verification: `node scripts/inject-lint.mjs <fixture-dir>` for residue/peer
  checks, then `skipLibCheck: false` typecheck, then an isolated `dsh web --no-open` boot-manifest
  acceptance pass per DSH-0.1.2-A1-19.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.