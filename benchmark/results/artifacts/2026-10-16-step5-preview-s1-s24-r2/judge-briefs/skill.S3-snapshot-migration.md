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

# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet` (bench-pet)

**Mode**: A · inspect (read-only). **Deliverable**: this report. **Code was not touched.**
**From**: `dsh-v0.1.1-rc.1` (plugin's declared era) → **To**: `dsh-v0.1.2-alpha.2`
**Plugin**: `@demo/dsh-bench-pet` v0.1.0, Web Client half (`platform: web`), pixel pet in `conversation.session.header.actions`
**Evidence root**: `.../S3-snapshot-migration/fixture/` (6 files) · **Skill reference**: `skills/plugin-upgrade/` (read-only)
**Date of assessment**: 2026-10-16

---

## 0. Scope, mode and read-only discipline

* This is a **read-only assessment** (Mode A). Per the task brief and the skill's landing-discipline rule ("when the task statement says the fixture must stay unchanged, the fixture stays untouched and the report is the deliverable"), **no source, manifest, dependency or configuration write was made anywhere** — not to the fixture, not to the skill, not to any scratch path outside the designated output cell.
* **No migration, build, install, typecheck, pack or boot was executed.** Every statement below is derived from the fixture source plus the skill's version cards and API ledger; nothing is claimed as "verified at runtime".
* Fixture integrity was captured before and after the analysis (see §10). All six files are byte-identical to their pre-analysis state.
* No parent/sibling directories were listed or opened; no external service was contacted.

---

## 1. Corridor and net state (folded before any conclusion)

Corridor is built along the `from → to` edges in `references/README.md`, never by filename order:

| Order | Card file | Edge | Cards | Relevant to this fixture |
|---|---|---|---:|---|
| 0 | `v0.1.1-rc.1.md` | `dsh-v0.1.0-rc.8` → `dsh-v0.1.1-rc.1` | 9 (draft) | **Yes** — `dsh.client` manifest contract, strict inject, self-rendering client session surface |
| 1 | `v0.1.1-rc.2.md` | `dsh-v0.1.1-rc.1` → `dsh-v0.1.1-rc.2` | 3 | No — image-attachment/`read_image` only |
| 2 | `v0.1.2-alpha.1.md` | `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` | 28 | **Yes** — the bulk of this migration |
| 3 | `v0.1.2-alpha.2.md` | `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` | 8 | Partly — dependency/peer surface only |

**Net-state folding notes (applied before writing any target form):**

1. `@deepseek-ai/dsh-client-runtime` is **removed** in alpha.1 and never returns; the 0.1.2 line through rc.1 adds no replacement. Net: delete, don't shim.
2. The flat `ConversationSnapshot` content fields are **removed as a primary surface** in alpha.1; a `legacy` projection survives for staged compatibility, and `API-10` states explicitly that an alpha.2-only plugin "must not treat `legacy.nodes` as the primary data surface". Net: the projection is a *transitional* device, not the destination.
3. `ignorable` was removed in alpha.1 and restored in alpha.2 (`DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01`). This fixture produces no custom `SessionEvent`, so the net effect is **nothing** — do not delete-then-re-add anything here.
4. The rc.1-era card `DSH-0.1.1-R1-07` (self-rendering clients have no `ctx.sessions`; aggregate session state in the Node half behind a `/state` route) is **superseded for this shape** by the alpha.1+ public read surface (`views.get('chat')?.legacy`, the `useSession` seat, and alpha.2's `useChat`). Do **not** apply R1-07's Node-half workaround to this plugin: it never reads `ctx.sessions`.

---

## 2. Touchpoint checkup (`bench-pet`, `dsh-v0.1.1-rc.1` → `dsh-v0.1.2-alpha.2`)

| Touchpoint | Hit | File/line | Applicable card |
|---|---:|---|---|
| #1 source patch / monkey patch | **No** | `cordis.patch.yml:1-3` | none — classified as Profile composition per `API-08` |
| #2 internal event names / persistent events | **No** | — | none (`DSH-0.1.2-A1-02`/`A2-01` not hit) |
| #3 internal service probes / Remote | **Yes (3 sites)** | `src/client/index.ts:6`; `src/client/Pet.tsx:8`; `package.json:8` | `DSH-0.1.2-A1-25`, `API-10`, `R-11` |
| #4 direct host directory read/write | **No** | — | none |
| #5 internal UI / commands / tool registration | **Yes (7 sites)** | `src/client/index.ts:39-42`; `src/client/Pet.tsx:7,10,18,19,21,23` | `DSH-0.1.2-A1-03`, `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-26`, `API-10` |
| #6 custom HTTP/WS/RPC/DOM/CSS | **No** | — | none |
| #7 subprocess / stdout / stderr | **No** | — | none |
| Special surface · packaging/manifest | **Yes (2)** | `package.json:6,8` (and the absence of any peer block) | `DSH-0.1.2-A2-03`, `DSH-0.1.1-R1-02`, `DSH-0.1.1-R1-03`, `R-01`, `R-08` |
| Special surface · locale pairing | **Pass** | `src/client/index.ts:14-19` + `:36` | precision-checklist "Locale pairing" (both halves present) |

No-hit notes: scan covered all six fixture files in full (~3.8 KB total); nothing inside the fixture was excluded. Dependency/lockfile state could not be inspected — the fixture's `package.json` declares **no** `dependencies`, `devDependencies` or `peerDependencies` at all, and no lockfile, `tsconfig` or build script ships with it (see §7, risk P3).

---

## 3. Findings

Each finding follows the skill's per-interface structure: current evidence → old form → how it breaks → target form → card → best practice → verification.

---

### F1 · `ClientContext` imported from the removed client-runtime package

* **Current evidence**: `src/client/index.ts:6` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
* **Old form**: type-only import of the aggregated client-runtime entry.
* **How it breaks**: the package was deleted from `packages/client` in alpha.1. Typecheck fails (`TS2307` cannot find module / `TS2724` no exported member once devDeps move to the target cohort); a client bundle that hard-references the specifier reports `missed the module table` on the new host, and the assembly row never enters the boot graph — usually with **no error at all**.
* **Target form** (`DSH-0.1.2-A1-25` mapping row "`Context` (client ctx, alias `ClientContext`)"):

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
```

  Keeping the `ClientContext` alias means the rest of the file (`apply(ctx: ClientContext)`, the inner `scope: ClientContext`) compiles unchanged. `API-10` adds the mandatory second half: the client facets merged into `Context` come from their **owning packages**, so the file also needs the type-only augmentations listed in F10.
* **Card**: `DSH-0.1.2-A1-25` (breaking, required-if-hit, touchpoints #3/#5) · corroborated by `API-10` and `R-11`.
* **Best practice**: this is a *type-only* seam, but it is not free — "dead references are cleared everywhere" means the identifier must also disappear from `dependencies`/`peerDependencies`, `dsh.client.inject`, and any lockfile or generated manifest. A single surviving stale type import leaves the static migration incomplete even when install and boot pass.
* **Verification**: `grep -rn "dsh-client-runtime" src/ package.json` (and the lockfile, once one exists) returns nothing; `tsc` at the target cohort resolves `Context` from `@deepseek-ai/cordis`.

---

### F2 · `ConversationSnapshot` type import — the snapshot read-surface root break

* **Current evidence**: `src/client/Pet.tsx:8` — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`
* **Old form**: the flat conversation-snapshot type from the aggregated runtime, carrying `nodes`, `partial`, `runningCalls`, `turnEnds`, `running` as direct fields.
* **How it breaks**: two independent failures stacked on one line. (a) The module is gone (same as F1). (b) Even with a resolvable module, the flat shape is gone: 0.1.2 turned each view's timeline into an internal projection of its own package, so no per-session flat `ConversationSnapshot` is published. Selectors that used to return typed values silently degrade to `any` under `skipLibCheck: true`, which is why `DSH-0.1.2-A2-03`'s field note mandates one `skipLibCheck: false` pass during migration.
* **Target form** (`API-10` exact mapping; `R-11` ledger row):

```ts
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
```

  `ChatSnapshot` is the alpha.2 owning surface: an ordered keyed store (`order` + `nodes.get(id)`), a staged `legacy` projection, and a separate `timeline`.
* **Card**: `DSH-0.1.2-A1-25` (package removal) + `DSH-0.1.2-A1-03` (session-view internals split; "the public snapshot consumption surface is affected too") + `API-10` / `R-11`.
* **Best practice**: prefer the entry point the package owner maintains (`/client`), not a raw `src/*` subpath — `API-07` uses `@deepseek-ai/dsh-client-ui-conversation` as its worked example of an export-map entry that is absent from the packed tarball.
* **Verification**: one `skipLibCheck: false` typecheck shows no missing declaration chain and **no new implicit `any`** in `Pet.tsx`; test fixtures build the real `ChatNodeStore` shape (`order` + `get`), never `nodes: []`.

---

### F3 · `dsh.client.inject` still names the removed package (and omits the new owner)

* **Current evidence**: `package.json:8` — `"inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]`
* **Old form**: package-level runtime module edges, including the deleted aggregation package.
* **How it breaks**: `dsh-client-runtime` becomes a **phantom dependency**. The pet silently disappears from the boot graph, the panel is absent, and the logs carry no plugin-related error — the first row of `troubleshooting.md`. The field note on `DSH-0.1.2-A1-25` records the same first-hand result: "with the runtime package left in `inject` the row did not enter the graph, and removing it restored it."
* **Target form**: recompose by capability, not by subset — drop the removed package and add the owner of the read the plugin actually performs:

```json
{
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["dsh-client-ui-chat", "dsh-client-ui-conversation", "dsh-client-locale"]
    }
  }
}
```

  * `dsh-client-ui-chat` — **new**: owns `ChatSnapshot` / `useChat`, the surface F4–F7 migrate onto.
  * `dsh-client-ui-conversation` — keep: declares the `conversation.session.header.actions` slot the pet mounts into (it is the ordering edge the fixture's own comment describes).
  * `dsh-client-locale` — keep: owns the `locale` service behind `ctx.locale.register`.
  * **Do not** add `@deepseek-ai/dsh-client-ui-renderer` to `dsh.client.inject` merely because of the type-only import in F10 — the precision-checklist states this explicitly ("adding a type-only import is not a boot fix"; "Do not add renderer to package-level `dsh.client.inject` solely because of this type import").
* **Card**: `DSH-0.1.2-A1-25` (required-if-hit) · composition discipline per the precision-checklist section "`dsh.client.inject` is an exact recomposition, not a subset".
* **Best practice**: `dsh.client.inject` records **runtime module dependencies**. Neither a type-only import nor a value import from a static platform library proves a required edge; decide each candidate owner by inspecting the target host's module table and the plugin's actual service consumption.
* **Verification**: `grep -n "dsh-client-runtime" package.json` returns nothing (pitfall 2 of example 06 is precisely "boot fails with a missing-service error, yet nothing references it in `src/`"); `dsh --profile <name> --dump-config` shows the row with nothing pending.

---

### F4 · `running` — lifecycle field, **no compatibility projection exists**

* **Current evidence**: `src/client/Pet.tsx:19` — `const running = useSession(s => s.running)`
* **Old form**: lifecycle flag read straight off the flat snapshot through the `useSession` seat.
* **How it breaks**: `DSH-0.1.2-A1-03`'s field note is explicit — the `legacy` projection carries `nodes` / `partial` / `runningCalls` (example 06 destructures exactly those three), while **lifecycle fields such as `running` are not in the projection at all** and "must go through the `useSession` seat instead". So this read has no staged-compat landing zone: the seat survives, but the value it selects is no longer a `ConversationSnapshot`.
* **Target form**: keep the seat, drop the assumption about the payload type.

```tsx
// Lifecycle stays on the useSession seat; its selector payload is NOT ConversationSnapshot.
const running = useSession(s => s.running)
```

* **Card**: `DSH-0.1.2-A1-03` (field note, 2026-08-28, dsh-ui-whale / dsh-ui-progress / dsh-input-history) · procedure per example 06 step 4 ("lifecycle split").
* **Best practice**: this is the one field where the *old* call site is already the destination. Resist "fixing" it by moving `running` onto the chat snapshot — that would couple a lifecycle read to a content projection that explicitly does not carry it.
* **Verification**: assert the pose actually changes across a real turn (idle → working → idle) on a cold-booted target profile; an empty or frozen pose counts as a failure.

---

### F5 · `thinking` — `partial.blocks` reasoning detection

* **Current evidence**: `src/client/Pet.tsx:13-15` and `:20`

```ts
function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}
const thinking = useSession(isThinking)
```

* **Old form**: a content selector on the flat snapshot, executed on the `useSession` seat.
* **How it breaks**: `partial` is not a field of the alpha.2 chat snapshot, and a *content* selector has no business on the session seat — `useSession(isThinking)` stops typechecking the moment the seat's payload type changes. The failure is quiet at runtime (the selector returns `false` forever) and only visible as a dead animation.
* **Target form — staged (compatibility projection, transitional)**:

```tsx
// Step one of the two-step plan: get it running on the projection.
const chat = useChat(c => c)                        // ChatSnapshot | undefined
const { partial } = chat?.legacy ?? EMPTY_PROJECTION
const thinking = partial?.blocks.some(b => b.kind === 'reasoning') ?? false
```

* **Target form — primary (alpha.2-only, the destination)**:

```tsx
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'

function isThinking(chat: ChatSnapshot | undefined): boolean {
  if (!chat) return false
  for (const id of chat.order) {              // order defines sequence; nodes is keyed
    const node = chat.nodes.get(id)
    if (node?.type !== 'assistant-step') continue
    // API-10: narrow by discriminant to 'assistant-step', then read data.finalNode.
    // The block field inside finalNode must be confirmed against the target tag
    // (see §7, risk P1) — do not guess it.
    if (node.data.finalNode?.[/* content blocks */].some(b => b.kind === 'reasoning')) return true
  }
  return false
}

const thinking = useChat(isThinking)
```

* **Card**: `DSH-0.1.2-A1-03` (field note: flat fields readable through the `legacy` projection) · `API-10` (keyed-store read shape; `assistant-step` / `data.finalNode` narrowing) · `R-11` (ledger row "`useSession` reading `ConversationSnapshot.nodes[]` → `useChat`").
* **Best practice**: `API-10` states the projection "is only for staged compatibility with an explicit dual-host requirement; it should not become the new primary data surface for alpha.2-only plugins". Since this plugin targets alpha.2 alone, the keyed-store form is the correct landing zone and `legacy` is at most a waypoint.
* **Verification**: reasoning-block detection exercised against a real streamed turn; the "no assistant step yet" and "unknown id in `order`" cases return `false` rather than throwing.

---

### F6 · `toolRunning` — `runningCalls.length > 0`

* **Current evidence**: `src/client/Pet.tsx:21` — `const toolRunning = useSession(s => s.runningCalls.length > 0)`
* **Old form**: flat array of in-flight tool calls on the snapshot.
* **How it breaks**: same class as F5 — content field, wrong seat, gone field. This is the pet's "working" frame, i.e. the tool-in-flight signal.
* **Target form — staged**: `const { runningCalls } = chat?.legacy ?? EMPTY_PROJECTION` (exactly the destructuring example 06 used for this fleet).
* **Target form — primary**: derive "a tool call is in flight" from the keyed store while iterating `chat.order` / `chat.nodes.get(id)`, narrowing the tool-call node discriminant at the target tag (see §7, risk P1).
* **Card**: `DSH-0.1.2-A1-03` · `API-10` · `R-11`.
* **Best practice**: keep the empty-projection fallback (`?? EMPTY_PROJECTION`) — a missing chat view is a normal boot-race state, not an error.
* **Verification**: one message → tool call → response round on a real profile; the pose must show `working` while the call is in flight and revert afterwards.

---

### F7 · `turnEnds` — turn timeline, **must switch immediately**

* **Current evidence**: `src/client/Pet.tsx:23` — `const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`
* **Old form**: the flat turn-end array; the last entry's `reason` picked the settle/celebration frame.
* **How it breaks**: `turnEnds` is **not** carried by the `legacy` projection. Example 06 records the split explicitly: the projection destructures `{ nodes, partial, runningCalls }` and the turn timeline is annotated as living at a *new* location (`chat?.timeline`); dsh-ui-progress's entry in the same fleet is summarised as "turn-end detection moved to the new timeline". A plugin that stages everything onto `legacy` therefore still loses this field.
* **Target form**:

```tsx
// Turn timeline is a separate surface on the chat snapshot, not a flat array.
const lastTurnEnd = useChat(chat => {
  const turns = chat?.timeline              // target-tag shape to confirm (§7, risk P1)
  return turns?.[turns.length - 1]?.reason
})
```

* **Card**: `DSH-0.1.2-A1-03` (field note) · procedure per example 06 step 3 ("migrate field by field to views/timeline once stable") and the dsh-ui-progress row of the same fleet.
* **Best practice**: this is the field that proves "move everything to `legacy` first" is a *two-step* plan and not a destination. Schedule the field-by-field move in the same change set if the plugin is alpha.2-only.
* **Verification**: a settled turn produces exactly one celebration frame; an aborted/cancelled turn is distinguished by `reason`, not guessed.

---

### F8 · Component props and seat plumbing

* **Current evidence**: `src/client/Pet.tsx:7,10,18` — `import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'`; `PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>`; `export function Pet({ useSession, t }: PetProps)`
* **Old form**: one runtime seat (`useSession`) plus the locale seat, both sourced from `dsh-client-ui-slots`.
* **How it breaks**: the component now needs a *second* runtime seat for content, and the `useSession` seat's selector payload is no longer `ConversationSnapshot`. Example 06 step 4 records the resulting shape: "component props combine `useSession` + `useConversation`" — props become a composition of seats, and a component that destructures only the session seat cannot reach the chat snapshot at all.
* **Target form**:

```tsx
export function Pet({ useSession, useChat, t }: PetProps) {
  const running     = useSession(s => s.running)   // lifecycle seat  (F4)
  const thinking    = useChat(isThinking)          // content seat    (F5)
  const toolRunning = useChat(hasRunningCall)      // content seat    (F6)
  const lastTurnEnd = useChat(lastTurnReason)      // timeline seat   (F7)
  /* …unchanged frame derivation… */
}
```

  The root-context equivalent documented in `API-10` is `ctx.useChat((chat) => chat ? orderedNodes(chat) : [])`; use it wherever a component has the root `Context` rather than slot props.
* **Card**: `DSH-0.1.2-A1-03` (field note) · example 06 step 4 · `API-10`.
* **Best practice**: `PropsRuntime`/`PropsLocale` themselves are **not** carded as removed — `@deepseek-ai/dsh-client-ui-slots` survives into alpha.2 (`API-10` cites `packages/client/ui-slots/src/index.ts` as the alpha.2 "client slot base Context augmentation", and the precision-checklist keeps `dsh-client-ui-slots` as the candidate owner for "mounts into host slot points"). What changes is which seats the props expose and which package owns each declaration. Confirm the seat names and the owning module of `LocaleNamespaceMap` at the target tag (§7, risk P2) rather than assuming.
* **Verification**: `skipLibCheck: false` typecheck of `Pet.tsx` against the real props type — a selector or callback that quietly becomes `any` is a migration failure, not an ignorable warning.

---

### F9 · Bare `ctx.slots.register` — apply-order race on a slot another entry declares

* **Current evidence**: `src/client/index.ts:38-42`

```ts
ctx.inject(['slots', 'conversation'], (scope: ClientContext) => {
  scope.slots.register(
    { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
    Pet,
  )
})
```

* **Old form**: order the plugin's own fiber *after* the `conversation` service, then register directly.
* **How it breaks**: the fixture's own comment ("`register()` into an undeclared slot throws") names the right hazard but the wrong defence. Cordis apply order **across entries** is undefined, so the registration can still land before ui-conversation's apply declares the slot, and the host throws `slot "conversation.session.header.actions" is not declared (a parent entry's children table must declare it)`. `troubleshooting.md` maps this symptom straight to `DSH-0.1.2-A1-25` / `DSH-0.1.2-A1-26`.
* **Target form**:

```ts
ctx.slots.inject('conversation.session.header.actions', () =>
  ctx.slots.register(
    { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
    Pet,
  ),
)
```

  The descriptor is already compliant: the registrant passes only `name` / `id` / `order` and never `kind` / `scope`.
* **Card**: `DSH-0.1.2-A1-25` + `DSH-0.1.2-A1-26` (via `troubleshooting.md`).
* **Best practice**: the `ctx.inject(['slots', 'conversation'], …)` wrapper is still legitimate for *service* ordering, but it does not substitute for `ctx.slots.inject` on the *declaration* race. Keep both if you also want the service wait.
* **Verification**: repeated cold boots never throw the declaration error; the pet renders in the header row.

---

### F10 · Owning packages for the type-only Context augmentations

* **Current evidence**: `src/client/index.ts:8,10` — `import type {} from '@deepseek-ai/dsh-client-locale/client'` and `import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'`
* **Old form**: pull the locale merge and the ui-conversation `SlotMap` merge from the owning packages (already correct in spirit).
* **How it breaks**: two gaps. (a) Nothing brings in the **renderer-owned `ctx.slots` declarations** — after the split the slots service lives in `@deepseek-ai/dsh-client-ui-renderer`, and example 06 step 5 records the concrete fix ("`ctx.slots` types come from the renderer package — remember to add it to devDependencies"). (b) Nothing brings in the **ui-chat** declarations that F2/F4–F7 now consume; `DSH-0.1.2-A2-03`'s field note records that ui-chat's `.d.ts` reaches into dev-only packages (`dsh-client-store`, UI primitives, session/commands/conversation), so under `skipLibCheck: true` a missing owner surfaces as an implicit `any` rather than a dependency error.
* **Target form**:

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'          // ctx.locale
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client' // SlotMap: header.actions
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'         // ChatSnapshot / useChat
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'     // ctx.slots declarations
```

* **Card**: `DSH-0.1.2-A1-25` (symbol migration by domain) · `API-10` ("Type composition and dependency ownership") · `DSH-0.1.2-A2-03` (field note on declaration owners) · `API-07` (export ≠ artifact presence).
* **Best practice**: these imports are erased from JavaScript — they cannot load a module, register a service, or resolve a runtime wait. Keep the owning packages in **peers** for the consumed types, and never infer an inject edge from them. Both `/client` subpaths used here are owner-maintained entries; avoid `./src/*` deep imports, which `API-07` shows can be absent from the packed tarball even when the export map lists them.
* **Verification**: one `tsc --skipLibCheck false` pass locates every missing declaration owner; the resulting direct dependencies are added; then restore the repo's existing `skipLibCheck` policy.

---

### F11 · `cordis.patch.yml` — composition overlay, **not** a source patch (no-hit)

* **Current evidence**: `cordis.patch.yml:1-3` — `- insert:` / `- id: bench-pet` / `name: '@demo/dsh-bench-pet'`
* **Classification**: per `API-08`, classify `cordis.patch.yml` **by default as the official Profile/Bundle composition overlay**; only enter source-patch migration on evidence of a real diff, `patch-package`/`patchedDependencies`, or a replaced host implementation. None is present. This is a **negative control** — no migration action.
* **What still must be true**: the assembly row's `name` is the **bare package name** (with scope) — it is (`'@demo/dsh-bench-pet'`), satisfying item 2 of `DSH-0.1.2-A1-26`. The row `id: bench-pet` is a local row id and is not the id that must equal the package name; that one is the client bundle's `__ModuleLoader__.load` registration id, which cannot be checked here because the fixture ships no build config (§7, risk P3).
* **Card**: `API-08` (classification) · `DSH-0.1.2-A1-26` (row-name contract).
* **Verification**: `dsh --profile <name> --dump-config` shows the row by bare package name with nothing pending; `window.__DSH_BOOT__.entries` contains `"id":"@demo/dsh-bench-pet"`.

---

### F12 · Locale namespace pairing — **already correct, keep it**

* **Current evidence**: type half `src/client/index.ts:14-19` (`declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }`); runtime half `src/client/index.ts:36` (`ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')`)
* **Status**: **pass**. The precision-checklist makes this a mandatory final check for *any* plugin shipping user-facing text — "type-level `LocaleNamespaceMap` augmentation AND runtime `ctx.locale.register`, both present, every time". Both halves are present, and registration goes through the host's public language seat rather than a self-built i18n patch (so `DSH-0.1.2-A1-10` and `R-13`'s advice is already satisfied).
* **Residual check**: confirm at the target tag which module owns `LocaleNamespaceMap`. If it moved out of `dsh-client-ui-slots`, re-target the `declare module` — an augmentation against the wrong module is a silent no-op, and the plugin would keep typechecking while `t` loses its keys.
* **Card**: precision-checklist "Locale pairing is a mandatory final check" · `DSH-0.1.2-A1-10` (optional capability, not adopted) · `R-13` (no hit).

---

### F13 · Packaging surface — no peer block at all

* **Current evidence**: `package.json` in full — `name`, `version`, `private`, `type`, `client`. There is **no** `dependencies`, `devDependencies` or `peerDependencies`, and no `engines`; the fixture ships no lockfile.
* **How it breaks**: the precision-checklist rule is "**peers are a superset of inject**: every module whose types or services the plugin touches appears in `peerDependencies` on the cohort floor — including modules used only for types". After F1/F2/F10 the touched set is `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-chat`, `@deepseek-ai/dsh-client-ui-conversation`, `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-renderer` (types), `@deepseek-ai/dsh-client-ui-slots` (props types), and — because F5/F6 inspect content blocks — `@deepseek-ai/dsh-llm`, which the checklist calls out by name ("Touching `ContentBlock`-family values requires `@deepseek-ai/dsh-llm` in peers (it moved there in this cohort)").
* **Target form** (shape, not exact versions — see §7, risk P3):

```json
"peerDependencies": {
  "@deepseek-ai/cordis": "^4.0.1",
  "@deepseek-ai/dsh-client-ui-chat": "^0.1.2-alpha.2",
  "@deepseek-ai/dsh-client-ui-conversation": "^0.1.2-alpha.2",
  "@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.2",
  "@deepseek-ai/dsh-client-ui-renderer": "^0.1.2-alpha.2",
  "@deepseek-ai/dsh-client-ui-slots": "^0.1.2-alpha.2",
  "@deepseek-ai/dsh-llm": "^0.1.2-alpha.2"
}
```

* **Card**: `DSH-0.1.2-A2-03` (peer trimming / adding direct dependencies) · precision-checklist (peer floors) · `R-01` · `R-08`.
* **Best practice / hard constraints from the checklist**:
  * `@deepseek-ai/cordis` must be **`^4.0.1` exactly** — `^4.0.2` is a miss, not an improvement.
  * No bare `cordis` key anywhere in the peer block; no `-rc` suffix survives; every `@deepseek-ai/dsh-*` floor sits on the target cohort (`^0.1.2-alpha.1` or later within 0.1.2).
  * `R-08`'s prerelease trap: a floor written as `^0.1.0-rc.8` is judged **not** to match `0.1.2-alpha.2` by npm's prerelease matching rules — rewrite it explicitly to `^0.1.2-alpha.2`.
  * `R-01`: while a cohort package is unpublished, point type dependencies at the official tag checkout via `link:` or tarball `overrides`; do not describe every `0.1.2-alpha.*` as 404 wholesale.
  * Count the optional peers: every genuinely optional peer carries a matching `peerDependenciesMeta.optional` flag.
* **Verification**: `pnpm list --depth 0 | grep @deepseek-ai` all on the target cohort with no mixture; the full lockfile scanned for the old cohort and for `dsh-client-runtime`, not just top-level deps; install log carries no peer warnings.

---

### F14 · Manifest key for the client half — pre-existing defect, not an alpha.2 break

* **Current evidence**: `package.json:6-9` — the client half is declared under a **top-level `"client"` key**, not under `dsh.client`.
* **How it breaks**: `DSH-0.1.1-R1-03` states that client-modules "enumerates packages by the `dsh.client` declaration only", and `DSH-0.1.1-R1-02` that hosts read `dsh.client` and ignore anything else. Every manifest example in the skill (example 06 before/after, `verify-runtime.check.mjs`, the precision-checklist) uses `"dsh": { "client": { … } }`. A top-level `client` key has **no supporting evidence anywhere in the corridor**.
* **Attribution — read this before acting**: this is **not** introduced by the 0.1.2 upgrade. `dsh.client` was already the scanned shape in the 0.1.1-rc.1 era (R1-02/R1-03 sit in the rc.8→rc.1 edge), so on the plugin's own declared baseline the client half is already mis-declared. Report it as a **pre-existing defect** in the R-06 sense — do not silently fold it into the migration diff and do not let it mask a real alpha.2 regression.
* **Target form**:

```json
{
  "dsh": {
    "client": {
      "platform": "web",
      "inject": ["dsh-client-ui-chat", "dsh-client-ui-conversation", "dsh-client-locale"]
    }
  }
}
```

* **Card**: `DSH-0.1.1-R1-02` · `DSH-0.1.1-R1-03` (both draft, rc.8→rc.1 edge) · related scan contract `DSH-0.1.2-A1-26`.
* **Best practice**: R1-02's verification is about the **packed** manifest, not the source one — check after `npm pack`, because bundlers can drop or rewrite unknown top-level keys.
* **Verification**: pack and confirm the packed manifest carries `dsh.client`; after install, the boot manifest lists the plugin's entry by package name.

---

## 4. Compatibility projection vs. immediate switch (requirement 4)

The skill describes a **two-step** migration for this exact plugin shape ("move everything to legacy first so it runs, then migrate field by field to views/timeline once stable"). The split below answers which fields may take step one and which cannot.

### 4.1 May run first through the compatibility projection (staged, transitional only)

| Field | Fixture location | Projection form | Card |
|---|---|---|---|
| `partial` (reasoning-block detection) | `Pet.tsx:14` | `chat?.legacy.partial?.blocks` | `DSH-0.1.2-A1-03` field note; example 06 step 3 |
| `runningCalls` (tool in flight) | `Pet.tsx:21` | `chat?.legacy.runningCalls` | `DSH-0.1.2-A1-03` field note; example 06 step 3 |
| `nodes` (transcript, if ever needed) | not read today | `chat?.legacy.nodes` | `API-10`; `R-11` |

Reached on alpha.1 as `conversationSnapshot.views.get('chat')?.legacy`; on alpha.2 the same projection is reached on the `ChatSnapshot` returned by `useChat` (`snapshot.legacy.nodes`). Always keep the empty fallback (`?? EMPTY_PROJECTION`) — an absent chat view is a normal boot state.

**Why it is only a waypoint**: `API-10` — "`snapshot.legacy.nodes` is only for staged compatibility with an explicit dual-host requirement; it should not become the new primary data surface for alpha.2-only plugins." `R-11` repeats it: "alpha.2-only code must not treat `legacy.nodes` as the primary data surface." This plugin targets alpha.2 alone, so the projection buys a green intermediate build, nothing more.

### 4.2 Must switch to a new read path immediately (no projection covers them)

| Field / surface | Fixture location | Why no projection | New read path | Card |
|---|---|---|---|---|
| `turnEnds` (last turn's end reason) | `Pet.tsx:23` | Explicitly excluded from the projection; the turn timeline moved to its own surface | `chat.timeline` (last completed turn's end reason) | `DSH-0.1.2-A1-03`; example 06 step 3 + dsh-ui-progress row |
| `running` (lifecycle) | `Pet.tsx:19` | Lifecycle fields are *not* in the projection by design | the `useSession` seat (seat survives; payload type changes) | `DSH-0.1.2-A1-03` field note; example 06 step 4 |
| `useSession` selector payload | `Pet.tsx:19-23` | The seat no longer receives a `ConversationSnapshot`, so content selectors stop typechecking there | content selectors move to `useChat`; only lifecycle stays on `useSession` | `DSH-0.1.2-A1-03`; `API-10`; `R-11` |
| `ConversationSnapshot` type | `Pet.tsx:8` | The type itself is gone with its package | `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client` | `DSH-0.1.2-A1-25`; `API-10`; `R-11` |
| `ClientContext` type | `index.ts:6` | Package removed | `Context as ClientContext` from `@deepseek-ai/cordis` | `DSH-0.1.2-A1-25` |
| `ctx.slots.register` | `index.ts:39-42` | Apply-order race is a composition property, not a data shape | `ctx.slots.inject(name, () => ctx.slots.register(…))` | `DSH-0.1.2-A1-25`; `DSH-0.1.2-A1-26` |
| `dsh.client.inject` | `package.json:8` | Phantom dependency — boot-graph level, no data projection exists | recompose by capability (F3) | `DSH-0.1.2-A1-25` |
| peers / cohort floors | `package.json` (absent) | Install-time, no projection | direct peers on the cohort floor (F13) | `DSH-0.1.2-A2-03`; `R-01`; `R-08` |

**Practical ordering implied by the split**: (1) fix the module/type/inject/peer layer first — nothing runs until it compiles and the row enters the boot graph; (2) land `partial` + `runningCalls` on the projection to get a green build and a visible pet; (3) in the same change set, move `turnEnds` to `timeline`, keep `running` on the session seat, and move the content selectors onto `useChat`; (4) only then consider deleting the projection usage. Steps (2) and (3) can be one commit for an alpha.2-only plugin; the projection is a debugging aid, not a release state.

---

## 5. Summary table

| # | Hit location | Old interface | Typical symptom on 0.1.2-alpha.2 | Target interface | Card | Required / conditional | Verification status |
|---|---|---|---|---|---|---|---|
| F1 | `src/client/index.ts:6` | `ClientContext` from `@deepseek-ai/dsh-client-runtime/client` | `TS2307`/`TS2724`; bundle `missed the module table`; row absent from boot graph, no error | `Context as ClientContext` from `@deepseek-ai/cordis` | `DSH-0.1.2-A1-25` | **Required if hit** | Not run (read-only task) |
| F2 | `src/client/Pet.tsx:8` | `ConversationSnapshot` from the removed package | module gone *and* flat shape gone; selectors silently `any` | `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client` | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-03`, `API-10`, `R-11` | **Required if hit** | Not run |
| F3 | `package.json:8` | `dsh.client.inject` contains `dsh-client-runtime` | pet silently missing from boot graph, no log error | `["dsh-client-ui-chat","dsh-client-ui-conversation","dsh-client-locale"]` | `DSH-0.1.2-A1-25` | **Required if hit** | Not run |
| F4 | `src/client/Pet.tsx:19` | `useSession(s => s.running)` | lifecycle value not on the projection; seat payload type changed | keep on the `useSession` seat | `DSH-0.1.2-A1-03` | **Required if hit** | Not run |
| F5 | `src/client/Pet.tsx:13-15,20` | `useSession` over `snapshot.partial.blocks` | field gone; content selector on the wrong seat | `useChat` over `order` + `nodes.get(id)`, narrow `assistant-step` → `data.finalNode`; staged via `chat.legacy.partial` | `DSH-0.1.2-A1-03`, `API-10`, `R-11` | **Required if hit** | Not run |
| F6 | `src/client/Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | field gone | staged `chat.legacy.runningCalls`; primary from the keyed store | `DSH-0.1.2-A1-03`, `API-10` | **Required if hit** | Not run |
| F7 | `src/client/Pet.tsx:23` | `useSession(s => s.turnEnds[…].reason)` | **not** in the projection; celebration frame lost | `chat.timeline` last completed turn's reason | `DSH-0.1.2-A1-03`, example 06 | **Required if hit** | Not run |
| F8 | `src/client/Pet.tsx:7,10,18` | single `useSession` seat in `PropsRuntime` | cannot reach the chat snapshot from props | compose seats (`useSession` + chat seat); root form `ctx.useChat(...)` | `DSH-0.1.2-A1-03`, `API-10` | **Required if hit** | Not run |
| F9 | `src/client/index.ts:39-42` | bare `scope.slots.register(...)` | `slot "conversation.session.header.actions" is not declared` at apply time | `ctx.slots.inject(name, () => ctx.slots.register(...))` | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-26` | **Required if hit** | Not run |
| F10 | `src/client/index.ts:8,10` | augmentations missing for renderer + ui-chat | `ctx.slots` types unresolved; `useChat` selectors become implicit `any` | add `import type {}` for `ui-chat/client` and `ui-renderer/client` | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A2-03`, `API-07` | **Required if hit** | Not run |
| F11 | `cordis.patch.yml:1-3` | composition overlay | none (negative control) | unchanged; row `name` already the bare package name | `API-08`, `DSH-0.1.2-A1-26` | No change | Not run |
| F12 | `src/client/index.ts:14-19,36` | `LocaleNamespaceMap` + `ctx.locale.register` | none — pairing complete | keep; re-verify the augmentation's owning module | precision-checklist | No change (verify owner) | Not run |
| F13 | `package.json` (no peer block) | no declared dependencies | missing declaration owners; peer-floor prerelease mismatch | direct peers on the cohort floor, `cordis@^4.0.1` | `DSH-0.1.2-A2-03`, `R-01`, `R-08` | **Required** | Not run |
| F14 | `package.json:6` | top-level `client` key | client half not scanned (pre-existing, not an alpha.2 break) | nest under `dsh.client` | `DSH-0.1.1-R1-02`, `DSH-0.1.1-R1-03` | **Pre-existing defect** | Not run |

---

## 6. No-hit list (with evidence, so the sweep is auditable)

| Card | Why it does not hit |
|---|---|
| `DSH-0.1.2-A1-01` (APIProxy removed) | No `apiProxy` / `executeRemote` anywhere in the fixture |
| `DSH-0.1.2-A1-02` / `DSH-0.1.2-A2-01` (`SessionEvent.ignorable`) | No `SessionEventMap` augmentation and no `Session.append`; the pet is a pure reader |
| `DSH-0.1.2-A1-04`–`A1-09`, `A1-11`–`A1-14` | Host-plane / capability surfaces not touched by a slot-mounted reader |
| `DSH-0.1.2-A1-19` (Web acceptance) | No acceptance script ships with the fixture — but it **is** the required verification lane (§8) |
| `DSH-0.1.2-A1-20` | No `userQuestions` usage |
| `DSH-0.1.2-A1-21`, `A1-22`, `A1-23`, `A1-24` | No agent-presets / llm-message / telemetry / pi-ai coupling |
| `DSH-0.1.2-A1-27` (SessionBinding durable event window) | **Near miss, worth recording**: the pet never reads raw session content via `sessions.binding(id).eventSource`. If a future revision needs user-message text or a durable event window rather than the chat projection, `DSH-0.1.2-A1-27` is the carded path (`SessionBinding` + `SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`) |
| `DSH-0.1.2-A1-28` (composer contenteditable) | The pet renders a `<div>` in the header; it never touches the composer DOM |
| `DSH-0.1.2-A1-29` (`MarkdownText`) | No markdown rendering |
| `DSH-0.1.2-A1-30` (`ctx.connection.api` removed) | No `connection` in `inject`, no `connection.api.*` call site |
| `DSH-0.1.2-A1-31`, `A1-32` | No subagent descriptors; no `ctx.workspaces` navigation |
| `DSH-0.1.2-A2-02` (`RemoteError`) | No `ctx.remote` consumption |
| `DSH-0.1.2-A2-04` (Node 24 loader) | Startup/CI wrapper concern only; no workaround present in the fixture |
| `DSH-0.1.2-A2-05` (`agentPresets` on inventory) | No `pluginInventory` consumption |
| `DSH-0.1.2-A2-06` (`$host` facts) | No `host.describe` / home / loopback reads |
| `DSH-0.1.2-A2-08` (`sessionProjections` peer) | The plugin lists no `dsh-tool-*` / `dsh-agent*` packages as peers, so the new required inject/peer does not reach it. Re-check if peers are ever added |
| `DSH-0.1.2-A2-10` (`settingsNamespace`) | No `ctx.settings` usage |
| `DSH-0.1.1-R1-01` | No repository-plugins mechanism; the plugin is a normal package + `cordis.patch.yml` insert row |
| `DSH-0.1.1-R1-04` / `R1-05` | No `ctx.get` on undeclared services; `inject` lists every consumed service (`slots`, `conversation`, `locale`) |
| `DSH-0.1.1-R1-06` | No session-event subscription |
| `DSH-0.1.1-R1-07` | No `ctx.sessions` in the client half — see §1 folding note 4 |
| `DSH-0.1.1-R1-08` / `R1-09` | No `tasks.peek`; no 0812 service renames in play |
| `DSH-0.1.1-R2-01`–`R2-03` | No image-attachment metadata, no `read_image` wrapping, no DeepSeek adapter |

---

## 7. Pending / residual risk (knowledge-base gaps — flagged, not guessed)

* **P1 · Exact field names on the new surfaces.** The cards pin the *locations* (`chat.order`, `chat.nodes.get(id)`, `data.finalNode`, `chat.timeline`) but not the inner field names for reasoning blocks, in-flight tool calls, or the turn-end record. `API-10`'s own rule applies: "If the actual types at the target tag conflict with this document, the target tag wins and the conflict must be flagged as a knowledge-base gap; do not break compilable code just to 'fit a card'." Confirm against `packages/client/ui-chat/src/client/contract/snapshot.ts` at the pinned tag before writing the final selectors.
* **P2 · Seat and augmentation ownership.** `PropsRuntime` / `PropsLocale` / `LocaleNamespaceMap` are not carded as moved; `@deepseek-ai/dsh-client-ui-slots` survives into alpha.2, while the `ctx.slots` *service* lives in `ui-renderer`. Whether the chat seat is exposed through `PropsRuntime` or must be reached from the root `Context` is not settled by the corridor material — example 06 (alpha.1) says props compose `useSession` + `useConversation`, and `API-10` (alpha.2) documents the root `ctx.useChat`. Verify at the target tag.
* **P3 · No build/dependency substrate in the fixture.** The fixture has no `dependencies`/`devDependencies`, no lockfile, no `tsconfig`, no build script and no tests. Consequently: (a) F13's exact version strings are a shape, not a prescription; (b) the client bundle's `__ModuleLoader__.load` registration id required by `DSH-0.1.2-A1-26` cannot be checked at all; (c) no baseline (R-06 layer 0) could be collected — there is nothing to run. Treat all three as open items rather than as passes.
* **P4 · `dsh.client.inject` edge for slots.** The precision-checklist deliberately leaves the consumer-side inject edge ambiguous ("check the target host's module table, composition, and actual service consumption"). Whether `dsh-client-ui-slots` also needs a package-level inject edge for this plugin must be decided from the real client composition, not from the type graph.
* **P5 · Unverifiable-at-runtime items.** Nothing in this report was executed. "Typecheck passed", "Loader mount passed" and "real behavior passed" are three different completion states and **none of them is claimed here**.

---

## 8. Validation plan (not executed — read-only assessment)

Ordered per the rollup's layered validation checklist; each layer gates the next.

0. **Baseline (R-06)** — not collectable: the fixture has no scripts, deps or tests (P3). Recorded as a gap rather than assumed green.
1. **Dependency resolution** — full lockfile scan for the old cohort and for `dsh-client-runtime`; `pnpm list --depth 0 | grep @deepseek-ai` all on `0.1.2-alpha.2`; no peer warnings in the install log (`R-08`).
2. **Static** — `clean` then `build` + `typecheck` (the clean is mandatory: stale `tsbuildinfo` produces false positives, example 06 pitfall 1) plus **one** `tsc --skipLibCheck false` pass to locate every missing declaration owner and prove no new implicit `any`.
3. **Card-level unit tests** — one assertion per hit touchpoint: chat-snapshot selectors built on the real `ChatNodeStore` (`order` + `get`, covering missing ids and the assistant final node); the turn-timeline read; the lifecycle seat; the slot-declaration race.
4. **Real cold boot / mount smoke** — isolated profile, `dsh web --no-open` at the pinned tag, token URL → Cookie (manual 303, then `Set-Cookie`), read `window.__DSH_BOOT__.entries`, find the entry by `package.json#name`, request the host-advertised bundle URL, assert `__ModuleLoader__.load({ id: "@demo/dsh-bench-pet" … })` and a pet DOM marker; collect and fail on page errors. Per `DSH-0.1.2-A1-19`, none of "resource 200", "id in entries" or "no crash" alone proves the plugin works. Check `--dump-config` for pending rows (`DSH-0.1.2-A1-26`).
5. **Behavior** — one message → tool call → response round; assert the three poses (idle / thinking / working) and exactly one settle frame per completed turn; then a cancelled turn to prove `reason` is read rather than guessed.
6. **Wrapper** — not applicable (no subprocess surface in this plugin).

---

## 9. Rollback

Nothing was changed, so there is nothing to roll back. For the subsequent (authorised) migration: record `HEAD`, the plugin version, the lockfile hash and the exact `package.json` / `cordis.patch.yml` contents before the first write; migrate in a dedicated branch/worktree; never auto-stash, reset, clean or checkout. Restore only the paths this task explicitly owns, and report any residual third-party side effects truthfully. Note `R-12`: if the plugin under upgrade is part of the host currently running the upgrade, hand control back rather than taking the host down.

---

## 10. Read-only discipline and fixture integrity

**Fixture untouched.** SHA-256 of every fixture file, captured before the analysis and re-verified after the report was written:

```
c1114413138587e985b76c1fd8e43e91c9cd0e06f43b19c17b09bcca2a8b72d8  README.md
73d74cf519c91984daef5148cf17a4ab7275dc36b0a3f4c98c755e93ff218f0a  cordis.patch.yml
154e9fd5f8e1b9006571b0d842f7670476411b793b291e6938ade40701f1f903  package.json
777a963ffa454f0ba340babb7269f378d6daca8f0f2aacbfd2c08187345b3ec3  src/client/Pet.tsx
94533a879790cdcbbe47624c4409352ea0b2f7a637284cda0e88db1f18d0dd05  src/client/index.ts
d56aa3aaff649bdd3aad777d4272e8e690b2918fb168e573953102dfddeec5ff  src/client/locales.ts
```

6 files, 6 unchanged; modification timestamps still `2026-09-03T10:21:09Z` (the fixture's packaging time). No temporary or scratch file was created outside this output cell, and none remains.

**Paths consulted (read-only)**: the fixture tree (6 files) and `skills/plugin-upgrade/` — specifically `SKILL.md`, `references/{README,pre-flight,precision-checklist,troubleshooting,rollup-0.1.2,api-migration-0.1.2-alpha.2,v0.1.1-rc.1,v0.1.1-rc.2,v0.1.2-alpha.1,v0.1.2-alpha.2}.md` and `examples/{01,06,08}-*`. The task's `solution/` and `tests/` directories were **not** read. No parent, sibling, repository-root, `benchmark/`, `.dsh/`, `node_modules/` or system-temp path was listed, globbed or opened. No network access, no install, no build, no migration execution.

**Blockers**: none. One honest limitation is recorded as P3 — the fixture carries no dependency, build or test substrate, so no mechanical baseline or typecheck could be run and every "verification status" above is "not run" by design.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.