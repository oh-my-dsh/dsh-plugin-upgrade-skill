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
#### FILE: S3-snapshot-migration/S3-snapshot-migration.md

# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet`

- **Mode**: A · inspect (read-only assessment). No fixture file was created, modified, or deleted; no migration, install, or build was executed. The report is the only deliverable.
- **Subject**: `fixture/` — a browser pixel-pet plugin (`@demo/dsh-bench-pet` v0.1.0, Web Client half only) written in the `dsh-v0.1.1-rc.1` style; animation follows the live conversation snapshot.
- **Target host**: `dsh-v0.1.2-alpha.2` (`0a53fb55bea101816fa226bb964ae2bed71c343b`).
- **Evidence base**: all six fixture files read in full; read-only residue scan with the skill's own linter (`skills/plugin-upgrade/scripts/inject-lint.mjs`) — verdict `FIX-REQUIRED`; card/ledger citations from `skills/plugin-upgrade/references/`.

---

## 1. Version corridor and net state

Corridor connected by the `from → to` edges in `references/README.md` (never by filename order):

| Edge | Card set | Cards | Hits on this fixture |
|---|---|---|---|
| `dsh-v0.1.1-rc.1` → `dsh-v0.1.1-rc.2` | DSH-0.1.1-R2-01/02/03 | 3 | **0** — all three are image-attachment/`read_image` surfaces; the fixture carries no attachment code |
| `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` | DSH-0.1.2-A1-01…A1-32 | 28 | A1-03, A1-25, A1-26 (plus A1-19/A1-08 on the verification side only) |
| `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` | DSH-0.1.2-A2-01…A2-10 | 8 | A2-03 (dependency/peer surface) |

The source era (`0.1.1-rc.1`) is **newer than the earliest card in the corridor** (`v0.1.1-rc.1.md` starts at `0.1.0-rc.8`), so the whole corridor `rc.1 → rc.2 → alpha.1 → alpha.2` is carded — **no unsupported gap** (contrast: a `0.1.0-rc.6` start would leave `rc.6 → rc.2` uncarded, per `examples/08-real-web-client-alpha2-migration.md`). Net-state folding applied: no field is removed-then-restored across this corridor for the surfaces this plugin touches (the `ignorable` remove/restore pair A1-02 → A2-01 is a **non-hit** — see `5).

Read-only residue scan (`node scripts/inject-lint.mjs fixture/`):

```json
{
  "importedClientModules": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-slots"],
  "declaredInject": [],
  "peersMissingForImports": ["@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-conversation", "@deepseek-ai/dsh-client-ui-slots"],
  "cordisPeer": null,
  "cordisOk": false,
  "runtimeRefsLeft": ["fixture\\src\\client\\index.ts", "fixture\\src\\client\\Pet.tsx"],
  "routeReviewRequired": false,
  "verdict": "FIX-REQUIRED"
}
```

Note `declaredInject: []`: the linter reads `package.json#dsh.client.inject`, but the fixture's manifest carries a **flat `client` key** (see F-09) — the declared inject list is invisible at the documented path.

---

## 2. Touchpoint checkup (seven classes, `references/pre-flight.md`)

| Touchpoint | Hit | File/line | Applicable cards |
|---|---:|---|---|
| #1 source patch / monkey patch | No | — | `fixture/cordis.patch.yml` is profile **composition**, classified per API-08 (negative control) |
| #2 internal events / persistent events | No | — | Snapshot **reads** only; no `SessionEventMap` augmentation, no `Session.append()` → A1-02 / A2-01 not hit |
| #3 internal service probes / Remote | **Yes** | `src/client/index.ts:6`, `src/client/Pet.tsx:8`, `package.json:8` | DSH-0.1.2-A1-25, DSH-0.1.2-A1-03, DSH-0.1.2-A2-03 |
| #4 host filesystem | No | — | No `DSH_HOME`/`readFile`/`openPath` usage |
| #5 internal UI / commands / tools | **Yes** | `src/client/index.ts:29,38-43`, `src/client/Pet.tsx:7-10,13-23` | DSH-0.1.2-A1-03, DSH-0.1.2-A1-25, DSH-0.1.2-A1-26, API-10 |
| #6 custom HTTP/WS/RPC/DOM channels | No | — | Renders a plain `<div data-frame>`; no `webServer.register`, no `contenteditable`/`setSelectionRange` (A1-28 non-hit) |
| #7 subprocess / stdout parsing | No | — | No child_process / headless wrappers |

No-hit notes: scan covered the whole `fixture/` tree (6 files, no `node_modules`/`lib` present); `src/client/locales.ts` is a pure dictionary with no DSH surface. Must still verify: build/typecheck on a copy, `--dump-config`, and a real Web mount (`7).

---

## 3. Findings — every breaking surface, with source location, new form, and card

### F-01 · `ClientContext` imported from the removed runtime package

- **Evidence**: `fixture/src/client/index.ts:6` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- **Old form**: the aggregated client runtime re-exported the Cordis `Context` as `ClientContext`.
- **How it breaks**: `@deepseek-ai/dsh-client-runtime` was **deleted from `packages/client` in alpha.1** — module-not-found at build/typecheck (TS2307 / `ERR_MODULE_NOT_FOUND`); with `skipLibCheck: true` and stale declarations the failure is deferred into implicit `any` selectors instead (API-10). Confirmed by the residue scan (`runtimeRefsLeft`).
- **Target form** (DSH-0.1.2-A1-25 mapping table):

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
```

- **Card**: **DSH-0.1.2-A1-25** (package removed, client symbols migrated by domain) · ledger **API-10** (Web Client runtime unbundling).
- **Best practice**: `ClientContext` is now plain Cordis `Context`; every client facet it must see comes from type-only augmentations of the **owning** packages actually used (F-08). Do not re-add a runtime aggregation package.
- **Verification**: `grep -r "dsh-client-runtime" src/ package.json` and the lockfile → zero hits; `tsc --skipLibCheck false` shows no missing declaration chain.

### F-02 · `ConversationSnapshot` type imported from the removed runtime package

- **Evidence**: `fixture/src/client/Pet.tsx:8` — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`
- **How it breaks**: same removed module; additionally the **flat** `ConversationSnapshot` shape (`nodes`/`partial`/`runningCalls`/`turnEnds`) is no longer a public read surface after the session-view split — the timeline became an internal projection of each view package (DSH-0.1.2-A1-03). Selecting `s.partial`/`s.runningCalls`/`s.turnEnds` on the post-split seat is a property-does-not-exist typecheck error once the type graph is corrected; with stale declarations it compiles and silently yields `undefined` at runtime (pet frozen on `idle`).
- **Target form**: there is no drop-in `ConversationSnapshot` export anymore. Reads go through (a) the staged chat-view projection — `conversationSnapshot.views.get('chat')?.legacy` / `?.timeline` — or (b) the alpha.2-only keyed chat snapshot (API-10 minimal shape):

```ts
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

function orderedNodes(snapshot: ChatSnapshot) {
  return snapshot.order.flatMap((id) => {
    const node = snapshot.nodes.get(id)
    return node ? [node] : []
  })
}

export function useOrderedNodes(ctx: ClientContext) {
  return ctx.useChat((chat) => chat ? orderedNodes(chat) : [])
}
```

  `ChatSnapshot.nodes` is a **keyed store** (`order` + `nodes.get(id)`), not the old `ConversationNode[]`; to read an assistant step's final node, narrow by discriminant to `type === 'assistant-step'` and read `data.finalNode`.
- **Card**: **DSH-0.1.2-A1-25** + **DSH-0.1.2-A1-03** (session view internals split) · ledger **API-10** (exact mapping).
- **Verification**: client tests must use the real `ChatNodeStore` shape (`order` + keyed `get`), covering missing ids and the assistant final node; do not mask old array fixtures with `as unknown as ChatSnapshot`.

### F-03 · `dsh-client-runtime` declared in the client inject list (phantom dependency)

- **Evidence**: `fixture/package.json:8` — `"inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]`
- **How it breaks**: the package no longer exists, so the assembly row **stays pending forever / the plugin never enters the boot graph, often with no explicit error** (A1-25 symptoms; `references/troubleshooting.md`: "panel/floating ball silently disappears, absent from the boot graph, usually with no error"). This is the failure that install-and-typecheck green cannot catch.
- **Target form**: remove the phantom entry; keep only packages that actually provide services:

```json
"dsh": { "client": { "platform": "web", "inject": ["dsh-client-ui-conversation", "dsh-client-locale"] } }
```

- **Card**: **DSH-0.1.2-A1-25** (explicitly covers declaring the package in `dsh.client.inject`).
- **Best practice**: `dsh.client.inject` records **runtime module** dependencies, recomposed by capability — a type-only import proves nothing either way (precision-checklist). If the plugin later consumes the chat store service at runtime (the primary `useChat` path), add `@deepseek-ai/dsh-client-ui-chat` to inject **after** checking the target host's module table; for the staged `legacy`/`timeline` form it stays type-only (peer only).
- **Verification**: cold boot shows the plugin in `__DSH_BOOT__.entries` with no `pending (waiting for service: …)` row; `dsh --profile <p> --dump-config` clean.

### F-04 · Flat snapshot selectors on the `useSession` seat — `partial.blocks` and `runningCalls`

- **Evidence**: `fixture/src/client/Pet.tsx:13-15` (`isThinking`: `snapshot.partial?.blocks.some(block => block.kind === 'reasoning')`), `:20` (`useSession(isThinking)`), `:21` (`useSession(s => s.runningCalls.length > 0)`)
- **How it breaks**: the transcript-content seat is no longer the flat conversation snapshot — `useSession(session => session?.nodes)`-style reads map to **`useChat`** (API-10), and the old flat fields survive only behind the staged `views.get('chat')?.legacy` projection (DSH-0.1.2-A1-03 field note: dsh-ui-whale / dsh-ui-progress / dsh-input-history migrated exactly this surface). Symptom family: "plugin loads but features half fail" — the pet never leaves `idle`.
- **Target form** (staged step 1 of the documented two-step plan — everything to `legacy` first so it runs):

```tsx
const EMPTY_PROJECTION = { nodes: [], partial: undefined, runningCalls: [] } as const

function isThinking(conversationSnapshot: {
  views: { get(name: 'chat'): { legacy?: typeof EMPTY_PROJECTION } | undefined }
}): boolean {
  const chat = conversationSnapshot.views.get('chat')
  const { partial } = chat?.legacy ?? EMPTY_PROJECTION
  return partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}

export function Pet({ useSession, useConversation, t }: PetProps) {
  const thinking = useConversation(isThinking)
  const toolRunning = useConversation(cs => {
    const chat = cs.views.get('chat')
    return (chat?.legacy?.runningCalls?.length ?? 0) > 0
  })
  // …
}
```

  Step 2 (alpha.2-only builds): read the keyed store via `useChat` + `snapshot.order` + `snapshot.nodes.get(id)` (F-02) and drop `legacy` entirely. The seat names `useConversation` (chat views/timeline) and `useSession` (lifecycle) are the post-split prop combination (`examples/06-real-world-batch-migration.md` step 4; the `useConversation`/`useInput`/`inputActions` session kit is declared in `ui-conversation`'s slot contract on both tags). The exact selector/snapshot type behind `useConversation` is not pinned by the corridor cards — confirm against the target tag's `ui-conversation` slots contract; do not invent field paths.
- **Card**: **DSH-0.1.2-A1-03** · ledger **API-10**.
- **Verification**: streaming reasoning sets `data-frame="thinking"`; an in-flight tool call sets `data-frame="working"`; missing/undefined projection degrades to the empty fallback, never `undefined` dereference.

### F-05 · `turnEnds` read — the turn timeline moved

- **Evidence**: `fixture/src/client/Pet.tsx:23` — `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`
- **How it breaks**: `turnEnds` is a flat field of the removed snapshot shape; its durable home after the split is the chat view's **timeline**, not the legacy projection (`examples/06-real-world-batch-migration.md`: "Turn timeline now lives at `chat?.timeline`"; dsh-ui-progress moved turn-end detection to the new timeline in the same migration).
- **Target form**: read the last settled turn's end reason from `views.get('chat')?.timeline` (shape per the target tag's timeline contract — the cards name the location, not the field layout; do not guess). Staged fallback: `turnEnds` is still readable through `legacy` (A1-03 field note lists `nodes/partial/runningCalls/turnEnds` as legacy-projection fields), but treat that as the temporary rung, not the destination.
- **Card**: **DSH-0.1.2-A1-03** · ledger **API-10**.

### F-06 · `running` is a lifecycle field — no compatibility projection exists for it

- **Evidence**: `fixture/src/client/Pet.tsx:19` — `useSession(s => s.running)`
- **How it breaks / what changes**: `running` is **not** carried by `views.get('chat')?.legacy`; lifecycle fields "must go through the `useSession` seat instead" (A1-03 field note; example 06 step 4). The fixture already reads it on the `useSession` seat, so the seat is right — but the snapshot behind that seat is no longer the flat conversation snapshot, so the field path must be confirmed against the target tag's session-status/props contract. Anyone who "migrates" this line into the legacy projection gets a silent `undefined`.
- **Target form**: keep the lifecycle read on the `useSession` seat; confirm the exact selector shape at `dsh-v0.1.2-alpha.2` (the status record behind the seat) from the target tag's declarations. Do **not** back-apply later shapes — `useSessionStatus`/`useSessionRetainInfo` are a 0.1.6-alpha.2 change (**DSH-0.1.6-A2-02**, outside this corridor).
- **Card**: **DSH-0.1.2-A1-03** (field note) · example 06 step 4.

### F-07 · Slot registration form — defer through `ctx.slots.inject`

- **Evidence**: `fixture/src/client/index.ts:29` (`export const inject = ['slots', 'conversation', 'locale']`) and `:38-43` (`ctx.inject(['slots', 'conversation'], scope => scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet))`)
- **How it breaks**: `conversation.session.header.actions` is declared by ui-conversation's apply, so a bare `ctx.slots.register` races it — `slot "conversation.session.header.actions" is not declared (a parent entry's children table must declare it)` at apply time (`references/troubleshooting.md`). The fixture's rc.1-era guard is a service inject on `conversation` as an ordering edge; after the runtime unbundling that guard depends on a service key whose survival is not guaranteed by any card in this corridor — if the key drifted, the row hangs at `pending (waiting for service: conversation)` forever (same pending family as A1-25). The documented post-split idiom removes the guesswork.
- **Target form**:

```ts
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
    Pet,
  ))
}
```

  `ctx.slots.inject(name, …)` waits for the slot declaration itself, so the `conversation` service inject is no longer needed as an ordering edge. The registrant keeps passing only `name`/`id`/`order` (never `kind`/`scope`) — the fixture already complies.
- **Card**: **DSH-0.1.2-A1-25** / **DSH-0.1.2-A1-26** (troubleshooting row for the not-declared race) · example 06 step 5.
- **Best practice**: `ctx.slots`'s type declarations now come from the renderer package — add `import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'` (F-08). The type-only import cannot resolve the runtime wait; `slots` stays in the entry's `inject`.
- **Verification**: cold boot, pet mounted in the header with no console error; `--dump-config` no pending.

### F-08 · Type-graph and peer hygiene — every touched package becomes a direct dependency

- **Evidence**: `fixture/package.json` has **no `peerDependencies` at all**; the linter reports `peersMissingForImports` for `dsh-client-locale`, `dsh-client-ui-conversation`, `dsh-client-ui-slots` and `cordisPeer: null`. Post-migration the import set grows: `@deepseek-ai/cordis`, `dsh-client-ui-chat`, `dsh-client-ui-renderer`, `dsh-api-session-controller`.
- **How it breaks**: alpha.2 trimmed/moved peer edges, so standalone TypeScript consumers that directly reference the moved-out **type** packages must declare them explicitly; a published package's `devDependencies` are not installed for consumers, and with `skipLibCheck: true` a missing declaration owner surfaces as `ctx.useChat` selectors/callbacks silently becoming implicit `any` — "any newly introduced implicit `any` is a migration failure" (API-10; A2-03 field note).
- **Target form**:

```json
"peerDependencies": {
  "@deepseek-ai/cordis": "^4.0.1",
  "@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.1",
  "@deepseek-ai/dsh-client-ui-conversation": "^0.1.2-alpha.1",
  "@deepseek-ai/dsh-client-ui-slots": "^0.1.2-alpha.1",
  "@deepseek-ai/dsh-client-ui-chat": "^0.1.2-alpha.1",
  "@deepseek-ai/dsh-client-ui-renderer": "^0.1.2-alpha.1",
  "@deepseek-ai/dsh-api-session-controller": "^0.1.2-alpha.1"
}
```

  plus the type-only Context augmentations in source (erased from JS — they activate the merges, they do not load modules):

```ts
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'      // ctx.slots declarations
import type {} from '@deepseek-ai/dsh-api-session-controller/client'  // session/chat facets
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'          // ChatSnapshot / useChat facets
```

- **Card**: **DSH-0.1.2-A2-03** (peer trimming; declare directly referenced type packages) · precision-checklist ("peers are a superset of inject", `@deepseek-ai/cordis` **exactly `^4.0.1`**, no bare `cordis` key, no `-rc` suffix, every `dsh-*` floor on `^0.1.2-alpha.1` or later within the cohort) · rollup **R-01** (cohort pinning; while the cohort is unpublished, point type deps at the official source checkout with `link:` or tarball `overrides`).
- **Verification**: one diagnostic `tsc --skipLibCheck false` pass to locate every declaration owner, then the repository's normal typecheck; `inject-lint.mjs` verdict flips to OK; lockfile scanned for the old cohort.

### F-09 · Manifest shape — the inject list must live at `dsh.client`

- **Evidence**: `fixture/package.json:6-9` — a **flat `client`** key (`{ "platform": "web", "inject": [...] }`), not `dsh.client`.
- **How it breaks**: hosts in this corridor read only `dsh.client`; the legacy `dshClient` merge (**DSH-0.1.1-R1-02**) and the client-modules scan (**DSH-0.1.1-R1-03**, **DSH-0.1.2-A1-26**) all key on `dsh.client`. A flat `client` field is read by nothing — the linter's `declaredInject: []` is the direct measurement. If the flat key is the real manifest, the client half never enters the browser plugin roster **already at the plugin's own rc.1 era** (pre-existing defect, not an alpha.2 regression — recorded here because this migration is the moment to fix it); if it is shorthand in the trimmed fixture, no action beyond moving the array.
- **Target form**: `"dsh": { "client": { "platform": "web", "inject": ["dsh-client-ui-conversation", "dsh-client-locale"] } }` (F-03), verified in the **packed** manifest, not only the source `package.json`.
- **Cards**: **DSH-0.1.1-R1-02**, **DSH-0.1.1-R1-03**, **DSH-0.1.2-A1-26**.

### F-10 · Locale pairing — keep both halves, verify the declaring module

- **Evidence**: `fixture/src/client/index.ts:14-19` (`declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }`) and `:36` (`ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')`).
- **Status**: **not a break** — the pairing pattern (type-level `LocaleNamespaceMap` augmentation **and** runtime `ctx.locale.register`) is exactly what the precision-checklist mandates, and both halves are present. `ctx.locale.register` remains the runtime entry at alpha.2 (it is one of the two capabilities the fleet probes in its compatibility self-check, example 06 appendix).
- **Action**: keep both halves; confirm at the target tag which module owns `LocaleNamespaceMap` (the fixture augments `dsh-client-ui-slots`; if the declaration moved to `@deepseek-ai/dsh-client-locale`, re-point the `declare module` block — the cards pin the pairing, not the owning module). `NS = 'pet'` is a grammar-conforming literal; the settings-namespace card (**DSH-0.1.2-A2-10**, `settingsNamespace()` removal) is **not hit** — this is a locale namespace, not a settings one.
- **Cards**: precision-checklist "Locale namespaces are declared, not implied" / "Locale pairing is a mandatory final check".

### F-11 · `cordis.patch.yml` — composition, not a source patch (negative control)

- **Evidence**: `fixture/cordis.patch.yml:1-3` — an `insert` row `{ id: 'bench-pet', name: '@demo/dsh-bench-pet' }`.
- **Status**: **not a break** and not a touchpoint-#1 hit. Per **API-08** this is the official Profile composition overlay; classify as a source patch only with real diff/`patch-package` evidence (none here). The row `name` is already the **bare package name with scope**, which is what the 0.1.2 scan contract requires (**DSH-0.1.2-A1-26**); the remaining A1-26 obligations — client bundle registration id (`__ModuleLoader__.load` id / tsdown banner `PLUGIN_ID`) equal to `@demo/dsh-bench-pet`, and a clean `--dump-config` — live in the build config, which the trimmed fixture does not include: **verify at build time**.
- **Note**: the fixture ships no build config, lockfile, or `dsh-plugin.json`; nothing else in the tree carries DSH surface.

---

## 4. Compatibility projection vs. immediate new read path (requirement 4)

The staged compatibility projection is **`conversationSnapshot.views.get('chat')?.legacy`** — the flat fields (`nodes`/`partial`/`runningCalls`/`turnEnds`) re-projected for dual-host running (DSH-0.1.2-A1-03 field note; example 06 step 3). API-10 is explicit that `snapshot.legacy.nodes` "is only for staged compatibility with an explicit dual-host requirement; it should not become the new primary data surface for alpha.2-only plugins".

| Field / surface | Source location | Runs first through the compatibility projection? | Must switch to a new read path immediately? |
|---|---|---|---|
| `partial.blocks` (thinking detection) | `Pet.tsx:13-15,20` | **Yes** — `views.get('chat')?.legacy.partial.blocks` (staged rung) | Eventually — keyed store (`useChat` + `order` + `nodes.get(id)`) once stable; mandatory for alpha.2-only builds |
| `runningCalls` | `Pet.tsx:21` | **Yes** — `views.get('chat')?.legacy.runningCalls` (staged rung) | Eventually — keyed store / timeline |
| `turnEnds` | `Pet.tsx:23` | Readable via `legacy` (A1-03 field note), **but its durable home is `views.get('chat')?.timeline`** | **Yes for the stable form** — move to `chat?.timeline` (example 06: dsh-ui-progress did exactly this) |
| `running` (lifecycle) | `Pet.tsx:19` | **No** — lifecycle fields are not in the projection at all | **Yes** — `useSession` seat only; confirm the field shape at the target tag (already on the right seat in this fixture) |
| `ClientContext` / `ConversationSnapshot` imports | `index.ts:6`, `Pet.tsx:8` | **No** — the module is deleted; there is no projection for a removed package | **Yes** — owning packages per DSH-0.1.2-A1-25 / API-10 |
| `dsh.client.inject` phantom entry | `package.json:8` | **No** | **Yes** — remove (DSH-0.1.2-A1-25); a phantom row never enters the boot graph |
| Selector seat for transcript content | `Pet.tsx:20-23` | The projection is reached **through the new `useConversation` seat**, not the old `useSession` snapshot | **Yes** — `useSession` (flat transcript) → `useConversation` (views) + `useChat` (keyed store); `useSession` remains for lifecycle only |

Operating rules:

1. **Two-step landing** (example 06 step 3): move every flat field to `legacy` first so the plugin runs on alpha.2, then migrate field-by-field to `views`/`timeline`/`useChat` once stable. Do not attempt the keyed rewrite and the package cleanup in one unreviewed jump.
2. **Single-cohort shortcut**: if this plugin will only ever run on alpha.2+, skip `legacy` entirely and implement the primary reads directly (`useChat` + `order` + `nodes.get(id)`, `chat?.timeline`, `useSession` lifecycle seat) — `legacy` exists for dual-host coexistence (rollup **R-02**), and carrying it without that requirement violates API-10.
3. **No silent fields**: any field that stops resolving must produce a visible fallback (`EMPTY_PROJECTION` pattern), never `undefined` dereference — the "loads but half broken" family is invisible to a no-crash smoke (troubleshooting; DSH-0.1.2-A1-30 field note).

---

## 5. Cards checked and found NOT hit (with evidence)

| Card | Why not hit |
|---|---|
| DSH-0.1.2-A1-01 / A2-02 (APIProxy, `RemoteError`) | No `apiProxy`/`ctx.remote`/`connection.api` usage anywhere in the fixture |
| DSH-0.1.2-A1-02 / A2-01 (`SessionEvent.ignorable`) | The plugin only **reads** snapshots; no `SessionEventMap` augmentation, no `Session.append()` — no persisted custom events to fail closed on |
| DSH-0.1.2-A1-04/05, A1-07/08/12/13/14/23 | Headless argv, WebFetch defaults, auth tokens, telemetry/privacy defaults, shell fixes — no wrapper/CI/deployment surface in the fixture |
| DSH-0.1.2-A1-06 (Code→PTC) | No tool-mode/preset vocabulary |
| DSH-0.1.2-A1-09/10/11 | Optional capabilities — not adopted (capability cards are suggestions only) |
| DSH-0.1.2-A1-19 | Verification-side only (token URL / boot manifest) — see `7, not a source change |
| DSH-0.1.2-A1-20/21/22/24/31 | Host-plane surfaces (user-questions waterfall, agent presets, `isTokenDelta`, pi-ai, subagent descriptor) — absent |
| DSH-0.1.2-A1-27 (SessionBinding event window) | The pet reads the **live** chat snapshot via slot props, not per-session history/`nodes`; note for the future: cold/history reads would go through `sessions.binding(id)` + `eventSource` |
| DSH-0.1.2-A1-28 (composer contenteditable) | No composer DOM manipulation |
| DSH-0.1.2-A1-29 (`MarkdownText` labels) | No markdown rendering |
| DSH-0.1.2-A1-30 (`ctx.connection.api`) | Not consumed |
| DSH-0.1.2-A1-32 (`uiWorkspace` navigation) | No `connectWorkspace`/`pickDirectory`/`baselinesReady`/`recentWorkspaceId` |
| DSH-0.1.2-A2-04/05/06/08/10 | Node-loader fix (environment), plugin inventory `agentPresets`, `$host` facts, `sessionProjections` (host-plane composition), `settingsNamespace` — none touched |
| DSH-0.1.1-R2-01/02/03 | Image attachment surfaces — no attachment code |

---

## 6. Full post-migration target source (spelled out)

### `fixture/src/client/index.ts` (0.1.2-alpha.2)

```ts
/**
 * Pixel-pet plugin, browser half (0.1.2-alpha.2): registers the resident
 * Pet into the session-header actions slot; animation follows the live
 * conversation snapshot (see Pet.tsx).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only Context merges — each owning package is a direct dev/peer dep (DSH-0.1.2-A2-03).
import type {} from '@deepseek-ai/dsh-client-locale/client'           // ctx.locale
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'  // SlotMap: conversation.session.header.actions
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'      // ctx.slots service declarations
import { Pet } from './Pet.tsx'
import { en, zh, type PetKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The pet's copy. */
    pet: PetKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'pet'

/**
 * Required services (cordis fiber inject). 'slots' owns the registration
 * seat (service now provided by dsh-client-ui-renderer); 'locale' owns the
 * dictionaries. The header.actions ordering edge is no longer a service
 * inject — ctx.slots.inject waits for the slot declaration itself.
 */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the pet dictionaries and the resident pet.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
    Pet,
  ))
}
```

### `fixture/src/client/Pet.tsx` (0.1.2-alpha.2 — staged form; see `4 for the alpha.2-only shortcut)

```tsx
/**
 * Pet: a pixel companion in the session header. Pose follows the live
 * conversation snapshot — the tail wags faster while thinking or while a
 * tool call is in flight, and a settled turn triggers a celebration frame.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Keyed chat snapshot type + owning packages' Context merges (API-10).
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

/** Stable empty fallback so selectors never hand out undefined shapes. */
const EMPTY_PROJECTION = { nodes: [], partial: undefined, runningCalls: [] } as const

/** Minimal structural view of the conversation snapshot seat (confirm the exported type at the target tag). */
interface ConversationSnapshotSeat {
  views: {
    get(name: 'chat'): {
      legacy?: { nodes: readonly unknown[]; partial?: { blocks: readonly { kind: string }[] }; runningCalls?: readonly unknown[] }
      timeline?: unknown
    } | undefined
  }
}

/** Whether the snapshot shows the model emitting reasoning with no tool in flight. */
function isThinking(conversationSnapshot: ConversationSnapshotSeat): boolean {
  const chat = conversationSnapshot.views.get('chat')
  const { partial } = chat?.legacy ?? EMPTY_PROJECTION
  return partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}

/** The pet. Animation follows the projected conversation snapshot fields. */
export function Pet({ useSession, useConversation, t }: PetProps) {
  // Lifecycle seat: running is NOT in the chat view's legacy projection (DSH-0.1.2-A1-03).
  const running = useSession(/* session-status selector — shape per the target tag's props contract */)
  // Staged compatibility projection (step 1); step 2 moves these to useChat + order + nodes.get(id).
  const thinking = useConversation(isThinking)
  const toolRunning = useConversation(cs => {
    const chat = cs.views.get('chat')
    return (chat?.legacy?.runningCalls?.length ?? 0) > 0
  })
  // Turn timeline: the last completed turn's end reason now lives at chat?.timeline.
  const lastTurnEnd = useConversation(cs => {
    const chat = cs.views.get('chat')
    return /* last settled turn's end reason, per the target tag's timeline contract */ undefined as string | undefined
  })
  const frame = useRef<string>('idle')
  void t
  void running
  void lastTurnEnd as CSSProperties
  useEffect(() => {
    frame.current = toolRunning ? 'working' : thinking ? 'thinking' : 'idle'
  }, [toolRunning, thinking])
  return <div data-frame={frame.current} className="pet" />
}

/** Primary alpha.2-only read shape (API-10) — use instead of the staged form when no rc-era host must be served. */
export function orderedNodes(snapshot: ChatSnapshot) {
  return snapshot.order.flatMap((id) => {
    const node = snapshot.nodes.get(id)
    return node ? [node] : []
  })
}
```

### `fixture/package.json` (0.1.2-alpha.2)

```json
{
  "name": "@demo/dsh-bench-pet",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["dsh-client-ui-conversation", "dsh-client-locale"]
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.1",
    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.2-alpha.1",
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.2-alpha.1",
    "@deepseek-ai/dsh-client-ui-chat": "^0.1.2-alpha.1",
    "@deepseek-ai/dsh-client-ui-renderer": "^0.1.2-alpha.1",
    "@deepseek-ai/dsh-api-session-controller": "^0.1.2-alpha.1"
  }
}
```

`cordis.patch.yml` and `locales.ts` need **no changes** (F-10/F-11 are keep-and-verify items).

---

## 7. Verification plan (layered — the three completion states are not interchangeable)

1. **Static residue**: `grep -r "dsh-client-runtime" src/ package.json` and the lockfile → zero hits; `node scripts/inject-lint.mjs <copy>` → verdict OK (no `runtimeRefsLeft`, `cordisOk: true`, no `peersMissing*`).
2. **Typecheck/build**: one `tsc --skipLibCheck false` diagnostic pass to locate every declaration owner (A2-03 field note), then the repository's normal typecheck and build with **no new implicit `any`**; tests must build the real `ChatNodeStore` (`order` + keyed `get`) rather than the old array.
3. **Loader/config**: `dsh --profile <p> --dump-config` — row `@demo/dsh-bench-pet` present, **no pending lines**; packed manifest checked (not just source `package.json`) for `dsh.client` and the inject list (R1-02/R1-03).
4. **Runtime (Web)**: isolated profile, `dsh web --no-open` at the pinned tag; redeem the printed token URL for the Cookie, read `window.__DSH_BOOT__.entries`, confirm the entry id `@demo/dsh-bench-pet` and that the host-advertised combo URL (`??@demo/dsh-bench-pet/client.js`) returns 200 and registers under the package name (DSH-0.1.2-A1-19, DSH-0.1.2-A1-26). A bare HTTP 200 proves nothing.
5. **Behavior**: in one live session — reasoning streaming → `data-frame="thinking"`; tool call in flight → `data-frame="working"`; settled turn → settle frame; locale switch keeps the `pet` namespace resolving (pairing check).
6. **Wrapper**: exit code / stdout / stderr / teardown of any verification script.

**Rollback baseline**: the fixture is untouched (read-only assessment); the baseline is the current source as-is, and no installs, lockfiles, or profiles were changed. **Pre-existing failures**: not collected — the fixture README declares it task material that cannot be run, so no baseline mechanical suite exists to exempt (R-06 noted as not applicable in Mode A).

---

## 8. Citation index

- **DSH-0.1.2-A1-25** — `@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain (F-01, F-02, F-03, F-07).
- **DSH-0.1.2-A1-03** — Session view internals split; flat `ConversationSnapshot` fields via `views.get('chat')?.legacy`; lifecycle fields via the `useSession` seat (F-02, F-04, F-05, F-06).
- **DSH-0.1.2-A1-26** — client-modules scan contract: registration id / row name / package name (F-03, F-07, F-09, F-11).
- **DSH-0.1.2-A2-03** — NPM peer trimming; declare directly referenced type packages (F-08).
- **DSH-0.1.1-R1-02 / R1-03** — `dsh.client` manifest merge and scan contract (F-09).
- **API-10** (api-migration-0.1.2-alpha.2.md) — Web Client runtime unbundling, keyed chat snapshots, exact mapping (F-01, F-02, F-04, `4, `6).
- **API-08** — `cordis.patch.yml` is composition, not a source patch (F-11).
- **precision-checklist.md** — peer floors (`^4.0.1` exact), peers-superset-of-inject, locale pairing, `skipLibCheck: false`, citation contract (F-08, F-10).
- **examples/06-real-world-batch-migration.md** — the same plugin family (pixel pet in `conversation.session.header.actions`) migrated rc.1 → alpha.1: two-step `legacy` landing, `ctx.slots.inject`, `useSession` + `useConversation` seats, `chat?.timeline` (F-04, F-05, F-06, F-07).
- **references/troubleshooting.md** — not-declared slot race, silent boot-graph absence, "loads but half fails" symptom rows (F-03, F-04, F-07).
- **rollup-0.1.2.md R-01 / R-02** — cohort pinning; cross-cohort coexistence (the only justification for keeping `legacy`) (F-08, `4).
- **DSH-0.1.6-A2-02** — cited only to mark a **later** seat rename (`useSessionStatus`) as out of corridor; must not be back-applied (F-06).


#### FILE: S3-snapshot-migration/findings.json

{
  "task": "S3-snapshot-migration",
  "mode": "A-inspect (read-only assessment)",
  "plugin": {
    "name": "@demo/dsh-bench-pet",
    "version": "0.1.0",
    "face": "Web Client (dsh.client, platform web)"
  },
  "from": "dsh-v0.1.1-rc.1 (code era)",
  "to": "dsh-v0.1.2-alpha.2 (0a53fb55bea101816fa226bb964ae2bed71c343b)",
  "corridor": [
    {
      "edge": "dsh-v0.1.1-rc.1 -> dsh-v0.1.1-rc.2",
      "cards": "DSH-0.1.1-R2-01/02/03",
      "hits": 0,
      "note": "image-attachment surfaces only"
    },
    {
      "edge": "dsh-v0.1.1-rc.2 -> dsh-v1.2-alpha.1",
      "cards": "DSH-0.1.2-A1-*",
      "hits": 3,
      "note": "A1-03, A1-25, A1-26"
    },
    {
      "edge": "dsh-v0.1.2-alpha.1 -> dsh-v0.1.2-alpha.2",
      "cards": "DSH-0.1.2-A2-*",
      "hits": 1,
      "note": "A2-03 dependency/peer surface"
    }
  ],
  "residueScan": {
    "tool": "skills/plugin-upgrade/scripts/inject-lint.mjs (read-only)",
    "verdict": "FIX-REQUIRED",
    "runtimeRefsLeft": [
      "fixture/src/client/index.ts",
      "fixture/src/client/Pet.tsx"
    ],
    "peersMissingForImports": [
      "@deepseek-ai/dsh-client-locale",
      "@deepseek-ai/dsh-client-ui-conversation",
      "@deepseek-ai/dsh-client-ui-slots"
    ],
    "cordisPeer": null,
    "declaredInject": []
  },
  "findings": [
    {
      "id": "F-01",
      "location": "fixture/src/client/index.ts:6",
      "surface": "ClientContext imported from @deepseek-ai/dsh-client-runtime/client",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A1-25",
        "API-10"
      ],
      "target": "import type { Context as ClientContext } from '@deepseek-ai/cordis'",
      "projection": "none (module deleted)",
      "immediate": true
    },
    {
      "id": "F-02",
      "location": "fixture/src/client/Pet.tsx:8",
      "surface": "ConversationSnapshot type imported from @deepseek-ai/dsh-client-runtime/client",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A1-25",
        "DSH-0.1.2-A1-03",
        "API-10"
      ],
      "target": "ChatSnapshot from @deepseek-ai/dsh-client-ui-chat/client; read keyed store via useChat + order + nodes.get(id)",
      "projection": "none for the type; staged reads via views.get('chat')?.legacy",
      "immediate": true
    },
    {
      "id": "F-03",
      "location": "fixture/package.json:8",
      "surface": "dsh-client-runtime in client inject (phantom dependency)",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A1-25"
      ],
      "target": "inject: ['dsh-client-ui-conversation', 'dsh-client-locale'] at dsh.client",
      "projection": "none",
      "immediate": true
    },
    {
      "id": "F-04",
      "location": "fixture/src/client/Pet.tsx:13-15,20,21",
      "surface": "flat snapshot selectors partial.blocks / runningCalls on useSession",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A1-03",
        "API-10"
      ],
      "target": "useConversation seat + views.get('chat')?.legacy (staged); useChat + order + nodes.get(id) (primary)",
      "projection": "yes - views.get('chat')?.legacy.partial.blocks / .runningCalls",
      "immediate": false
    },
    {
      "id": "F-05",
      "location": "fixture/src/client/Pet.tsx:23",
      "surface": "turnEnds read",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A1-03",
        "API-10"
      ],
      "target": "views.get('chat')?.timeline (durable home); legacy readable as staged rung",
      "projection": "partial (legacy readable; stable home is chat?.timeline)",
      "immediate": true
    },
    {
      "id": "F-06",
      "location": "fixture/src/client/Pet.tsx:19",
      "surface": "running lifecycle field",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A1-03"
      ],
      "target": "useSession seat only; confirm field shape at target tag (do not back-apply DSH-0.1.6-A2-02 useSessionStatus)",
      "projection": "no - lifecycle fields are not in the legacy projection",
      "immediate": true
    },
    {
      "id": "F-07",
      "location": "fixture/src/client/index.ts:29,38-43",
      "surface": "slot registration via ctx.inject(['slots','conversation'], scope => scope.slots.register(...))",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A1-25",
        "DSH-0.1.2-A1-26"
      ],
      "target": "ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name, id: 'pet', order: 10 }, Pet)); inject = ['slots','locale']",
      "projection": "none",
      "immediate": true
    },
    {
      "id": "F-08",
      "location": "fixture/package.json (no peerDependencies)",
      "surface": "type graph / peer hygiene for all @deepseek-ai/* imports",
      "breaks": true,
      "cards": [
        "DSH-0.1.2-A2-03",
        "R-01"
      ],
      "target": "peerDependencies with @deepseek-ai/cordis ^4.0.1 exactly and every touched dsh-* package on ^0.1.2-alpha.1+; add type-only imports of ui-renderer/api-session-controller/ui-chat; one tsc --skipLibCheck false pass",
      "projection": "none",
      "immediate": true
    },
    {
      "id": "F-09",
      "location": "fixture/package.json:6-9",
      "surface": "flat client manifest key instead of dsh.client",
      "breaks": true,
      "cards": [
        "DSH-0.1.1-R1-02",
        "DSH-0.1.1-R1-03",
        "DSH-0.1.2-A1-26"
      ],
      "target": "dsh.client.{platform,inject}; verify in the packed manifest",
      "projection": "none",
      "immediate": true,
      "note": "pre-existing at rc.1 era if the flat key is real; fix during this migration"
    },
    {
      "id": "F-10",
      "location": "fixture/src/client/index.ts:14-19,36",
      "surface": "locale pairing (LocaleNamespaceMap augmentation + ctx.locale.register)",
      "breaks": false,
      "cards": [
        "precision-checklist"
      ],
      "target": "keep both halves; verify declaring module at target tag",
      "projection": "n/a",
      "immediate": false
    },
    {
      "id": "F-11",
      "location": "fixture/cordis.patch.yml:1-3",
      "surface": "profile composition insert row (API-08 negative control)",
      "breaks": false,
      "cards": [
        "DSH-0.1.2-A1-26",
        "API-08"
      ],
      "target": "no change; row name is already the bare package name; verify PLUGIN_ID banner and --dump-config",
      "projection": "n/a",
      "immediate": false
    }
  ],
  "projectionVsImmediate": {
    "compatibilityProjection": "conversationSnapshot.views.get('chat')?.legacy (nodes/partial/runningCalls/turnEnds) - staged dual-host only, must not become the primary surface (API-10)",
    "canRunThroughProjectionFirst": [
      "partial.blocks (Pet.tsx:14)",
      "runningCalls (Pet.tsx:21)",
      "turnEnds (Pet.tsx:23, staged only; durable home chat?.timeline)"
    ],
    "mustSwitchImmediately": [
      "running lifecycle field (Pet.tsx:19) - useSession seat only, not in projection",
      "turn timeline stable form chat?.timeline (Pet.tsx:23)",
      "all removed-package type/module surfaces (index.ts:6, Pet.tsx:8, package.json:8)",
      "selector seat useSession(transcript) -> useConversation(views) + useChat(keyed store)"
    ]
  },
  "nonHitCards": [
    "DSH-0.1.2-A1-01",
    "DSH-0.1.2-A1-02",
    "DSH-0.1.2-A1-04",
    "DSH-0.1.2-A1-05",
    "DSH-0.1.2-A1-06",
    "DSH-0.1.2-A1-07",
    "DSH-0.1.2-A1-08",
    "DSH-0.1.2-A1-09",
    "DSH-0.1.2-A1-10",
    "DSH-0.1.2-A1-11",
    "DSH-0.1.2-A1-12",
    "DSH-0.1.2-A1-13",
    "DSH-0.1.2-A1-14",
    "DSH-0.1.2-A1-19",
    "DSH-0.1.2-A1-20",
    "DSH-0.1.2-A1-21",
    "DSH-0.1.2-A1-22",
    "DSH-0.1.2-A1-23",
    "DSH-0.1.2-A1-24",
    "DSH-0.1.2-A1-27",
    "DSH-0.1.2-A1-28",
    "DSH-0.1.2-A1-29",
    "DSH-0.1.2-A1-30",
    "DSH-0.1.2-A1-31",
    "DSH-0.1.2-A1-32",
    "DSH-0.1.2-A2-01",
    "DSH-0.1.2-A2-02",
    "DSH-0.1.2-A2-04",
    "DSH-0.1.2-A2-05",
    "DSH-0.1.2-A2-06",
    "DSH-0.1.2-A2-08",
    "DSH-0.1.2-A2-10"
  ],
  "readOnlyDiscipline": "fixture inspected read-only and unchanged; no migration/install/build executed; report is the only write",
  "deliverable": "S3-snapshot-migration.md"
}

## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.