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
#### FILE: S3-snapshot-migration/S3-snapshot-migration-report.md

# S3 · Snapshot Read-Surface Migration Assessment — @demo/dsh-bench-pet

**Mode**: A · inspect (read-only). No fixture file was modified; no installs or migrations executed.
**Corridor**: dsh 0.1.1-rc.1 → 0.1.1-rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2 (cards are cumulative; a plugin jumping rc.1 → alpha.2 must satisfy every edge).
**Fixture**: `fixture/` — browser-only Web Client plugin (`package.json`, `cordis.patch.yml`, `src/client/{index.ts,Pet.tsx,locales.ts}`). No host half, no Remote/APIProxy calls, no session-event production, no composer DOM access, no MarkdownText, no workspace navigation.
**Baseline**: not collected (Mode A; fixture cannot be run).

---

## 1. Breaking surfaces on 0.1.2-alpha.2 (each tied to source location)

| # | Location | Surface | Breaks because | Card |
|---|----------|---------|----------------|------|
| B1 | `fixture/package.json:8` | `client.inject` contains `"dsh-client-runtime"` | Package deleted in alpha.1; keeping it in inject is a phantom dependency — the assembly row stays pending / the plugin never enters the boot graph | **DSH-0.1.2-A1-25** |
| B2 | `fixture/src/client/index.ts:6` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` | Module no longer exists; build/typecheck fails with missing module | **DSH-0.1.2-A1-25** + ledger **API-10** |
| B3 | `fixture/src/client/Pet.tsx:8` | `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | Same removed module; the flat snapshot type is replaced by keyed `ChatSnapshot` | **DSH-0.1.2-A1-25** + **API-10** |
| B4 | `fixture/src/client/Pet.tsx:13-15, 20` | `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` via `useSession(isThinking)` | `partial` is a transcript field; the flat `ConversationSnapshot` fields were split into per-view projections in alpha.1 | **DSH-0.1.2-A1-03** (field note) + **API-10** |
| B5 | `fixture/src/client/Pet.tsx:21` | `useSession(s => s.runningCalls.length > 0)` | `runningCalls` flat field moved off the primary snapshot | **DSH-0.1.2-A1-03** + **API-10** |
| B6 | `fixture/src/client/Pet.tsx:23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | `turnEnds` flat field moved off the primary snapshot | **DSH-0.1.2-A1-03** + **API-10** |
| B7 | `fixture/src/client/Pet.tsx:19` | `useSession(s => s.running)` | Lifecycle field. **Not a break in place** — but it is NOT carried by the compatibility projection, so it must remain on (immediately switch to) the `useSession` seat when the sibling selectors move to `useChat` | **DSH-0.1.2-A1-03** (field note) |

No card on the rc.2 edge (DSH-0.1.1-R2-01/02/03, image-attachment behavior) and no card on the alpha.2 edge (DSH-0.1.2-A2-01/02/03/04/05/06/08) intersects this fixture's touchpoints — see §5.

---

## 2. Correct post-migration form for each surface

### B1 — `package.json` inject list (immediate, no compatibility path)

```json
"client": {
  "platform": "web",
  "inject": ["dsh-client-ui-conversation", "dsh-client-locale"]
}
```

Drop `dsh-client-runtime`; keep only packages that actually provide services (A1-25). If the final Pet implementation consumes the chat seat, verify at the target tag whether `@deepseek-ai/dsh-client-ui-chat` must be added to this list (API-10: "list only the client services the runtime actually needs injected").

### B2 — `ClientContext` (immediate)

```ts
// index.ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'   // activates session facet merge
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'            // activates useChat merge (new read path)
import type {} from '@deepseek-ai/dsh-client-locale/client'             // unchanged: ctx.locale
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'    // unchanged: SlotMap merge
```

Rules (API-10 "Type composition and dependency ownership"): every owning package whose declarations are consumed must be a **direct** dev/peer dependency (devDeps are not transitively installed); activate Context augmentation with type-only imports; run one diagnostic `tsc --skipLibCheck false` pass — any new implicit `any` is a migration failure.

`apply(ctx: ClientContext)`, `ctx.effect(...)`, `ctx.locale.register(...)`, `scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)`, and the service-id list `export const inject = ['slots', 'conversation', 'locale']` are **unchanged** — no corridor card removes the `slots` / `conversation` / `locale` service ids or the slot name.

### B3/B4/B5/B6 — snapshot reads (two-stage; projection first, keyed store final)

**Stage 1 — compatibility projection** (valid staged form per A1-03 field note; `legacy` must not become the permanent primary surface per API-10):

```ts
// Pet.tsx
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

export function Pet({ useSession, useChat, t }: PetProps) {
  const running = useSession(s => s.running)                 // lifecycle: stays on useSession seat
  const thinking = useChat(chat =>
    chat?.views.get('chat')?.legacy.partial?.blocks.some(b => b.kind === 'reasoning') ?? false)
  const toolRunning = useChat(chat =>
    (chat?.views.get('chat')?.legacy.runningCalls.length ?? 0) > 0)
  const lastTurnEnd = useChat(chat => {
    const ends = chat?.views.get('chat')?.legacy.turnEnds
    return ends?.[ends.length - 1]?.reason
  })
  // ...frame logic unchanged
}
```

(API-10 documents the same compatibility surface as `snapshot.legacy` on the `ChatSnapshot`; A1-03's field note documents it as `views.get('chat')?.legacy`. The exact prop/selector exposure through `PropsRuntime` must be verified against the target-tag declarations — see §6.)

**Stage 2 — final keyed read path** (API-10 minimal alpha.2-only shape):

```ts
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'

function orderedNodes(snapshot: ChatSnapshot) {
  return snapshot.order.flatMap((id) => {
    const node = snapshot.nodes.get(id)                      // keyed store, not ConversationNode[]
    return node ? [node] : []
  })
}
const nodes = useChat(chat => (chat ? orderedNodes(chat) : []))
// an assistant step's final node: narrow by discriminant type === 'assistant-step', then read data.finalNode
```

The final per-field coordinates for `partial` / `runningCalls` / `turnEnds` on views/timeline are view-package surfaces; the corridor cards (A1-03 field note) prescribe "migrate everything to `legacy` first, then field-by-field to views/timeline once stable" — verify each target selector against the exact alpha.2 tag rather than guessing (§6). Do not mask old array fixtures in tests with `as unknown as ChatSnapshot` (API-10).

### B7 — lifecycle field `running` (immediate seat assignment)

Keep it on the `useSession` seat exactly as today: `useSession(s => s.running)`. When B4–B6 move to `useChat`/`legacy`, do **not** move `running` with them — the projection does not carry lifecycle fields (A1-03 field note).

---

## 3. Card mapping (full numbers)

| Card | Title (abbrev.) | Hit locations |
|---|---|---|
| **DSH-0.1.2-A1-25** | `@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain | package.json:8; index.ts:6; Pet.tsx:8 |
| **DSH-0.1.2-A1-03** | Session view internals split; flat snapshot fields readable via `legacy` projection; lifecycle via `useSession` seat | Pet.tsx:13-23 |
| **API-10** (api-migration-0.1.2-alpha.2.md) | Web Client runtime unbundling + keyed chat snapshots — the exact symbol ledger for A1-25/A1-03 | index.ts:6; Pet.tsx:8-23 |
| **DSH-0.1.2-A1-26** | client-modules scan: registration id == package.json `name` | checked, compliant — see §5 |

---

## 4. Compatibility projection vs. immediate new read path

**Can run first through the compatibility projection** (`views.get('chat')?.legacy` / `snapshot.legacy`):
- `partial` (thinking detection, Pet.tsx:14/20)
- `runningCalls` (Pet.tsx:21)
- `turnEnds` (Pet.tsx:23)
- (`nodes`, unused by this plugin, is also in the projection)

Rationale: A1-03's field note confirms all four flat fields remain readable there, enabling the verified two-step migration ("everything to `legacy` first, then field-by-field"). API-10 warns `legacy` is staged compatibility only — for an alpha.2-only plugin it must not become the primary surface.

**Must switch to a new read path immediately (no projection available)**:
- `running` (Pet.tsx:19) — lifecycle fields are absent from the projection; they go through the `useSession` seat. The selector text stays `s => s.running`, but it must be sourced from `useSession`, never from `legacy`.
- Both removed-module imports (index.ts:6, Pet.tsx:8) — the module is gone; there is no compatibility shim. `ClientContext` → `Context` from `@deepseek-ai/cordis`; `ConversationSnapshot` → `ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client`.
- `package.json` inject entry `dsh-client-runtime` (package.json:8) — a phantom inject blocks the boot graph from the first cold start; it cannot be projected.

---

## 5. Checked non-hits (with evidence)

- **cordis.patch.yml** (rows: `insert: [{ id: bench-pet, name: '@demo/dsh-bench-pet' }]`) — assembly-row `name` already equals the bare package name; **DSH-0.1.2-A1-26** compliant, no change. (Bundle registration id `PLUGIN_ID` must also equal `@demo/dsh-bench-pet` — the build banner is not part of this fixture; verify at build time.)
- **rc.2 edge** DSH-0.1.1-R2-01/02/03 — image-attachment ref/output/adapter behavior; the plugin touches no attachment or `read_image` surface.
- **alpha.2 edge** DSH-0.1.2-A2-01 (`SessionEvent.ignorable` restore — plugin produces no persisted events), A2-02 (`RemoteError` — plugin makes no Remote calls), A2-03 (peer trims — consume transitively), A2-04 (Node 24 client-graph fix — host-side), A2-05 (inventory grouping — informational), A2-06 (`$host` facts — additive), A2-08 (`sessionProjections` required inject — applies to host tool packages; this is a pure Web Client plugin).
- **DSH-0.1.2-A1-27** (SessionBinding durable event window) — adjacent but not hit: Pet reads the live snapshot via slot-injected props, not `sessions.scope(id)`/`session.getSnapshot().nodes`. If a future feature reads durable user-message content, the new path is `sessions.binding(id)?.eventSource.getSnapshot().entries` filtering `entry.type === 'event' && entry.event.type === 'user/message'`, importing `SessionBinding`/`SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`.
- Not hit, for completeness: A1-01 (APIProxy), A1-08/A1-19 (channels/acceptance), A1-20 (userQuestions), A1-28 (composer DOM), A1-29 (MarkdownText labels), A1-30 (`ctx.connection.api`), A1-32 (workspace navigation).

---

## 6. Pending / verify at the exact target tag

1. Whether the slot runtime props (`PropsRuntime`) expose `useChat` alongside `useSession`, and the exact `legacy` accessor shape (`views.get('chat')?.legacy` vs `snapshot.legacy`) — the two card sources document both; confirm against `dsh-v0.1.2-alpha.2` declarations.
2. Whether consuming the chat seat requires adding `@deepseek-ai/dsh-client-ui-chat` to `dsh.client.inject` (ordering edge), per API-10 item 1.
3. Final views/timeline selectors for `partial`/`runningCalls`/`turnEnds` (Stage 2) — cards are curated, not a complete API diff; derive from exact-tag source, not memory.
4. One diagnostic `skipLibCheck: false` typecheck after dependency re-ownership; then restore repo policy.
5. **Secondary observation (manifest key)**: the fixture declares a bare `"client"` key in package.json:6. Per **DSH-0.1.1-R1-02** / **DSH-0.1.1-R1-03**, hosts scan only `dsh.client`; a bare `client` key would keep the client half out of the roster even before this corridor. This is likely a trimming artifact of the fixture (the plugin is stated to be rc.1-era working code), but the packed manifest must be verified: the recognized form is `"dsh": { "client": { "platform": "web", "inject": [...] } }`.

---

## 7. Rollback / discipline

- Rollback: not applicable — no writes, installs, or version switches performed; `fixture/` hash-identical before and after.
- This report is the sole deliverable, written under `agent-output/S3-snapshot-migration/` as authorized.
- Recommendation: proceed to Mode C (author-migrate) only with a separate confirmation; validate with the skill's ladder — lockfile free of `dsh-client-runtime` and the old cohort, real `ChatNodeStore`-shaped tests (missing ids, assistant `data.finalNode`), then full Web chain in an isolated profile (token→Cookie, `__DSH_BOOT__.entries` contains `"@demo/dsh-bench-pet"`, combo route `/plugins/??@demo/dsh-bench-pet/client.js` registers and mounts, no pending rows).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.