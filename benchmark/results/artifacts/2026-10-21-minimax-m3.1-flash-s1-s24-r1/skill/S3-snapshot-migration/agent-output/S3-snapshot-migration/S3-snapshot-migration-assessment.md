# S3 · Snapshot Read-Surface Migration Assessment — bench-pet → dsh 0.1.2-alpha.2

**Mode**: A · inspect (read-only). **Fixture**: `/app/fixture/` (sealed, unmodified — hash-verified after the scan).
**Target host**: `dsh-v0.1.2-alpha.2`. **Plugin baseline**: written in the `dsh-v0.1.1-rc.1` style.
**Plugin own version**: `@demo/dsh-bench-pet` @ `0.1.0` (separate coordinate from the DSH host cohort).
**Corridor walked**: `dsh-v0.1.1-rc.1` → `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (net state folded; no delete-then-restore artifacts apply to this plugin — it writes no persisted SessionEvents).

> **No code was changed.** The deliverable is this report. Every "post-migration form" below is a plan, not an applied edit.

---

## 0 · How this was produced (evidence of read-only discipline)

| Step | Tool | Result |
|---|---|---|
| Corridor + touchpoint scan | `skills/plugin-upgrade/scripts/plan-migration.mjs --root <fixture> --from dsh-v0.1.1-rc.1 --to dsh-v0.1.2-alpha.2` | 3 hits, all class **#5** (UI/commands/tools): `src/client/index.ts:6`, `src/client/Pet.tsx:7`, `package.json:8`. Classes #1,#2,#3,#4,#6,#7 = 0 hits. |
| alpha.2 residue / peer check | `skills/plugin-upgrade/scripts/inject-lint.mjs <fixture>` | verdict `FIX-REQUIRED`; `runtimeRefsLeft` = `index.ts`, `Pet.tsx`; `declaredInject` = `[]` (the manifest has no `dsh.client`); `cordisPeer` = `null` (`cordisOk:false`); `peersMissingForImports` = `dsh-client-locale`, `dsh-client-ui-conversation`, `dsh-client-ui-slots` |
| Fixture integrity | sha256 of all 6 sealed files vs `fixture-seal.pre.json` | **UNCHANGED** (6/6) |

The planner is a heuristic first pass; every hit below was then confirmed against the card text, the alpha.2 API ledger, and the fixture source. The planner's *card list* is over-inclusive (it lists, e.g., `DSH-0.1.2-A1-06` PTC rename and `DSH-0.1.2-A1-28` composer DOM, which this plugin does not touch) — the "Not hit" section records those exclusions with reasons.

---

## 1 · Summary of breaking surfaces

**19 breaking / required surfaces across 4 files.** Nothing here is optional except the two capability cards in §7.

| # | Location | What breaks | Card |
|---|---|---|---|
| B1 | `package.json:8` `inject[0]="dsh-client-runtime"` | Removed package in the client inject list → the assembly row never enters the boot graph / stays pending, with no error | **DSH-0.1.2-A1-25** |
| B2 | `package.json:6-10` top-level `"client"` key | 0.1.2 reads only `dsh.client`; a legacy-shaped field is ignored → client half not recognised | **DSH-0.1.1-R1-02**, **DSH-0.1.1-R1-03** |
| B3 | `package.json:8` inject ids unscoped | 0.1.2 module ids are package names (scoped) | **DSH-0.1.2-A1-26** + precision checklist |
| B4 | `package.json` (no `peerDependencies`) | No `@deepseek-ai/cordis` peer, no cohort floors, no peers for consumed modules | **DSH-0.1.2-A2-03** + R-01/R-08 |
| B5 | `package.json` (no `dsh-llm` peer) | `partial.blocks` is a `ContentBlock`-family value → its owner moved to `@deepseek-ai/dsh-llm` | **DSH-0.1.2-A2-03** + precision checklist |
| B6 | `index.ts:6` | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` — module deleted | **DSH-0.1.2-A1-25** (+ API-10, R-11) |
| B7 | `index.ts:38-43` | Bare `scope.slots.register(...)` into a slot another entry declares → apply-order race throws | **DSH-0.1.2-A1-25**/**A1-26** (symptom row in troubleshooting) |
| B8 | `index.ts:14-19` | `LocaleNamespaceMap` augmentation module must be the locale owner and be in the type graph | **DSH-0.1.2-A1-25** + precision checklist (locale pairing) |
| B9 | `index.ts:29` | Service-level `inject` list: `'conversation'` may no longer be a service key → permanent `pending` | **DSH-0.1.1-R1-04** / R-02 |
| B10 | `index.ts` (missing import) | `ctx.slots` declarations are renderer-owned after the split → missing type graph | **DSH-0.1.2-A1-25** + precision checklist |
| B11 | `index.ts` (missing import) | ui-chat declarations for the new read path are not a direct dependency | **DSH-0.1.2-A2-03** + API-10 |
| B12 | `Pet.tsx:8` | `import type { ConversationSnapshot } from '.../dsh-client-runtime/client'` — module deleted | **DSH-0.1.2-A1-25** (+ API-10, R-11) |
| B13 | `Pet.tsx:19-23` | Flat `ConversationSnapshot` selector via `useSession` no longer exists | **DSH-0.1.2-A1-03** (+ API-10, R-11) |
| B14 | `Pet.tsx:19` | `running` is a lifecycle field — **not** in the compatibility projection | **DSH-0.1.2-A1-03** |
| B15 | `Pet.tsx:23` | `turnEnds` — turn timeline moved to the chat view's `timeline` | **DSH-0.1.2-A1-03** |
| B16 | `Pet.tsx:14` | `partial` → compat projection only; `ContentBlock` owner + discriminator must be re-checked | **DSH-0.1.2-A1-03** + **DSH-0.1.2-A2-03** |
| B17 | `Pet.tsx:21` | `runningCalls` → compat projection only | **DSH-0.1.2-A1-03** |
| B18 | `package.json:3` | Plugin's own SemVer bump is a separate step after compatibility work | SKILL Mode C step 6 |
| B19 | `cordis.patch.yml:1-3` | Row is composition (not a source patch) — but it must name the bare package name | **DSH-0.1.2-A1-26** + API-08 |

---

## 2 · The snapshot read surface in detail (the core of this assessment)

The pet's animation is driven by four reads, all funnelled through one flat snapshot selector.

### 2.1 What the code does today — `src/client/Pet.tsx`

| Line | Current read | Field class |
|---|---|---|
| `19` | `useSession(s => s.running)` | **lifecycle** |
| `20` | `useSession(isThinking)` → `snapshot.partial?.blocks.some(b => b.kind === 'reasoning')` (line 14) | **content** (streaming partial) |
| `21` | `useSession(s => s.runningCalls.length > 0)` | **content** (tool-in-flight) |
| `23` | `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` | **turn timeline** |

### 2.2 What 0.1.2 does to the surface — **DSH-0.1.2-A1-03** (Session view internals split up extensively)

The flat per-session conversation snapshot is gone; the timeline becomes an internal projection owned by each view package. The card's own field note (the 2026-08-28 `dsh-ui-whale` / `dsh-ui-progress` / `dsh-input-history` migration) records the exact split:

- the old flat fields (`nodes`, `partial`, `runningCalls`, `turnEnds`) **remain readable through the `views.get('chat')?.legacy` compatibility projection**;
- **lifecycle fields such as `running` are not in the projection** and must be read through the `useSession` seat instead.

Two further rules bound the migration:

- **API-10** (alpha.2 ledger): `useSession(session => session?.nodes)` → `useChat(chat => ...)`; `ConversationSnapshot.nodes[]` → iterate `ChatSnapshot.order` and call `snapshot.nodes.get(id)`. `snapshot.legacy.*` is *"only for staged compatibility with an explicit dual-host requirement; it should not become the new primary data surface for alpha.2-only plugins."*
- **R-11** (rollup): the ledger row reads `useSession` reading `ConversationSnapshot.nodes[]` (rc.2 → alpha.1) → *"on alpha.2 use `useChat`, keeping order via `ChatSnapshot.order` with `nodes.get(id)`; alpha.2-only code must not treat `legacy.nodes` as the primary data surface."*

So the read surface does **not** die — it **moves and splits**: content fields land in the chat view's `legacy` projection, the turn timeline lands in `chat.timeline`, and lifecycle stays on the `useSession` seat.

### 2.3 Post-migration form (alpha.2 target)

```ts
// src/client/Pet.tsx (target shape)
import { useEffect, useRef } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'

export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

/** Compatibility projection read: content field, available under views.get('chat')?.legacy */
function isThinking(chat: ChatSnapshot | undefined): boolean {
  const partial = chat?.legacy?.partial
  return partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}

export function Pet({ useSession, useChat, t }: PetProps) {
  const running     = useSession(s => s.running)                       // lifecycle seat — NOT in the projection
  const thinking   = useChat(chat => isThinking(chat))                // legacy projection (staged)
  const toolRunning= useChat(chat => (chat?.legacy?.runningCalls.length ?? 0) > 0) // legacy projection (staged)
  const lastTurnEnd= useChat(chat => chat?.timeline?.at(-1)?.reason)   // new turn-timeline path
  // ...
}
```

**Coordinates to confirm at the target tag** (the skill forbids inventing interfaces — card-schema rule 3, and API-10: *"the target tag wins"*):

1. The chat snapshot seat is `useChat` — alpha.2 declares it in `packages/client/ui-chat/src/client/contract/slots.ts` (API-10 source list). It is reachable as a standard slot prop and/or as `ctx.useChat(...)`; **the exact prop-vs-context surface on the `conversation.session.header.actions` slot must be read from the alpha.2 slot contract** (the fleet record in example 08 used the `useChat` + `snapshot.order`/`nodes.get(id)` shape, and the 0.1.1-rc.1 → alpha.1 batch record used a `useSession` + `useConversation` **two-seat** split — lifecycle on `useSession`, conversation view on `useConversation`).
2. The conversation-snapshot object that owns `views` — the `views.get('chat')` lookup in the A1-03 note is the legacy-projection entry point; on alpha.2 the chat view is reached through the ui-chat seat. Confirm whether the pet should read `chat.legacy` off the `useChat` selector result or off a separate conversation-view seat.
3. `chat.timeline` element shape (the last turn's `reason`): the batch record only says *"turn-end detection moved to the new timeline"*. Read the alpha.2 timeline type before coding the index.
4. `block.kind === 'reasoning'`: the `ContentBlock` discriminator name is **unconfirmed** in the fixture. `ContentBlock`-family values now live in `@deepseek-ai/dsh-llm` in this cohort — re-check the alpha.2 `dsh-llm` types and, if the discriminator changed, switch to the new name (do not carry `kind` over on faith).

### 2.4 Requirement 4 answered — compatibility projection vs. immediate switch

| Field | Class | Compatibility projection (`views.get('chat')?.legacy`) | Verdict |
|---|---|---|---|
| `partial` (→ `isThinking`) | content | **yes** | **Run first through the projection.** Still readable; use it to get the plugin running, then move to the typed chat view. |
| `runningCalls` (→ `toolRunning`) | content | **yes** | **Run first through the projection.** Same staged treatment. |
| `nodes` (not read today) | content | **yes** | Projection exists, but alpha.2's canonical form is the keyed store `order` + `nodes.get(id)`; do not build new code on `legacy.nodes`. |
| `running` | **lifecycle** | **no** | **Switch immediately** to the `useSession` lifecycle seat. A1-03 states lifecycle fields are not in the projection. (Today the value is discarded by `void running` on line 26, so this is the cheapest field to convert — or to drop if the running animation is not re-enabled.) |
| `turnEnds` / last end reason | **turn timeline** | mirror only | **Switch immediately** to the chat view's `timeline`. The `legacy.turnEnds` mirror is a stopgap; the sibling plugin (`dsh-ui-progress`) moved turn-end detection to the new timeline in the same pass. |
| the *type* `ConversationSnapshot` and the flat selector shape | — | — | **Switch immediately** — the package that exported them is deleted (B6/B12); this is a compile-time break, not a runtime one. |

**Recommended landing order** (the card's own two-step pattern, specialised to this plugin):

- **Step 1 — get it running:** route `partial` and `runningCalls` through the compatibility projection; keep `running` on the `useSession` seat; move the turn-end read to `timeline`. This yields a plugin that boots on alpha.2 with no `legacy.nodes` dependency.
- **Step 2 — make it canonical:** replace the projection reads with the typed chat-view reads, so `legacy` is not the permanent primary surface (API-10 / R-11). If the plugin must also run on 0.1.1-rc.1 hosts, Step 1 is the dual-host bridge (R-02 / R-03) and the probe must be host-aware.

**What is *not* available through any projection:** `running`. If the pet needs a "session is busy" signal that is not the lifecycle seat, that is a different question — and **DSH-0.1.2-A1-27** (session content reads via the `SessionBinding` durable event window) is the escape hatch **only** if the pet needs actual user-message *content*. It does not today: the pet reads no message text, so A1-27 is **not hit** — recorded in §6.

---

## 3 · Import / type-surface migration (B6, B10, B11, B12)

**DSH-0.1.2-A1-25** (`@deepseek-ai/dsh-client-runtime` removed) is the governing card, with **API-10** as the interface ledger and **R-11** as the corridor-level export-drift row. The rule that bites hardest here: *"Changing `ClientContext` to the Cordis `Context` alone is not enough: the client facets merged into Context come from their owning packages; without direct type dependencies, `skipLibCheck: true` can silently propagate `useChat` selectors or callback parameters to `any`."*

Target form for `src/client/index.ts`:

```ts
// old
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

// new
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'          // ctx.locale merge + locale namespace owner
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'  // SlotMap merge (header.actions)
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'      // renderer-owned ctx.slots declaration
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'         // useChat / ChatSnapshot
```

Notes that must not be dropped:

- A **type-only import is erased at compile time** — it cannot load a module, register a service, or satisfy a runtime wait. It only pulls the declaration into the type graph. The matching package must therefore be a **direct dev/peer dependency**, and the **runtime** module edge (if any) must be declared in `dsh.client.inject`.
- The precision checklist is explicit: *"Do not add renderer to package-level `dsh.client.inject` solely because of this type import."* The web host already mounts the renderer/slots service; add `@deepseek-ai/dsh-client-ui-renderer` to **peers**, not to `inject`.
- A packed package's `devDependencies` are **not** installed for consumers, and ui-chat's `.d.ts` references further declaration owners (client-store, ui-primitives, session/commands/conversation). So peers must be a **superset of inject**, including type-only consumers.
- Run **one** `tsc --skipLibCheck false` pass during the migration to surface the missing declaration chain, then restore the repository's policy. A newly introduced implicit `any` is a migration failure.

---

## 4 · Composition, manifest and packaging

### 4.1 `package.json` — recompose the manifest (B2, B3, B4, B5, B18)

- **Manifest key** — the 0.1.2 host reads `dsh.client`; the fixture's top-level `"client"` key is the 0.1.1-rc.1 shape. **DSH-0.1.1-R1-02** merges the legacy `dshClient` field into `dsh.client`; **DSH-0.1.1-R1-03** makes the client-modules scan read `dsh.client` only, so a package without it never enters the browser plugin roster — *silently, with no Node-half error*. Target:

  ```json
  "dsh": {
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-ui-chat",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-conversation"
      ]
    }
  }
  ```

- **Inject list** — `@deepseek-ai/dsh-client-runtime` must be **removed** (**DSH-0.1.2-A1-25**): after the dismantling it is a *runtime phantom dependency*, and keeping it leaves the assembly row pending / out of the boot graph. The fleet record in that card is explicit: *"with the runtime package left in `inject` the row did not enter the graph, and removing it restored it."*
- **Inject is runtime module dependencies, not a subset** (precision checklist). The three remaining entries are the recomposition of the removed runtime package by capability: chat snapshot (**ui-chat**), locale/i18n (**client-locale**), composer/dock + slot owner (**client-ui-conversation**). The precision-checklist table lists these owners scoped — the fixture's unscoped ids are the pre-split spelling. **Confirm the exact id string against the alpha.2 client module table** before landing; the ids must be the real client module package names.
- **Peers** — the fixture has no `peerDependencies` at all. Required floors for this cohort: `@deepseek-ai/cordis` at exactly `^`4.0.1` (a newer caret is a miss, not an improvement), every `@deepseek-ai/dsh-*` peer on the target cohort (write `^0.1.2-alpha.2` — the range must carry a prerelease with the same tuple or npm's semver rules will not match it, R-08), no bare `cordis` key, no `-rc` suffix left. **DSH-0.1.2-A2-03** is the governing card, and it cuts both ways: upstream *pruned* peers (add the packages you actually import) and *added* peers (a missing peer shows up as a runtime `pending`, not as a typecheck error). Add `@deepseek-ai/dsh-llm` because the pet touches `ContentBlock`-family values.
- **Install channel** — alpha.2 *is* published to npm (R-01: the `@deepseek-ai/dsh-*` line carries `0.1.2-alpha.2`), so a normal `^0.1.2-alpha.2` peer floor resolves; if a specific internal package is missing, fall back to the `link:` local track (R-09) rather than a second lockfile. Use the single package manager the repository's lockfile already implies; do not mix npm/pnpm/bun.
- **Plugin's own version** — `0.1.0` is the *plugin* release, not the DSH cohort. Bump it separately, after the compatibility changes pass, and verify the packed filename and the packed manifest both carry the plugin version (SKILL Mode C step 6; the batch record's hard-won rule: bump → build → commit, or the client bundle bakes a stale version constant).

### 4.2 `cordis.patch.yml` — composition, not a source patch (B19)

- The file is an `insert` row only: **API-08** classifies `cordis.patch.yml` as *profile composition overlay*; it is **not** a source patch. Classified as **#1 not hit** — there is no monkey-patch surface in this plugin.
- The row's `name: '@demo/dsh-bench-pet'` is **already correct** for **DSH-0.1.2-A1-26** (the row name must be the bare package name *with* the scope). The `id: bench-pet` is the row id, which is a different coordinate from the registration name and is fine.
- **DSH-0.1.2-A1-26** additionally requires the **client bundle's registration id** (the `__ModuleLoader__.load` id, usually injected by the build banner) to equal the `package.json` `name`, i.e. `@demo/dsh-bench-pet`. The fixture ships no build config, so this is **unverifiable here** and is listed in §8 as a must-verify. Symptom if missed: `loaded without registering "<id>"`, or — more quietly — the pet silently disappears from the boot graph.
- The plugin declares no `dsh.bundle`, so it is installed as a plain Cordis dependency plus this insert row (the plain-plugin track in **DSH-0.1.1-R1-01**), with config-level HMR mount and no host restart. Note that this is a *browser UI* plugin, not a model-facing tool plugin, so the "no `dsh.bundle`" rule in the troubleshooting table does not apply to it.

### 4.3 Slot registration — the apply-order race (B7)

`src/client/index.ts:38-43` registers into `conversation.session.header.actions`. The fixture's own comment (lines 25-28) already states the hazard: *"the header.actions slot is declared by ui-conversation's apply, and register() into an undeclared slot throws."* Waiting for the `conversation` **service** (`ctx.inject(['slots','conversation'], …)`) does **not** guarantee that ui-conversation's `apply` has already **declared** the slot — apply order is undefined, so a bare `register` can land first and throw *"slot … is not declared (a parent entry's children table must declare it)"*.

Target form (the shape used by the sibling pet plugin in the 0.1.1-rc.1 → 0.1.2-alpha.1 fleet migration, and the wrapping recipe in the skill's troubleshooting table):

```ts
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pet: dictionaries')

  ctx.slots.inject('conversation.session.header.actions', () => {
    ctx.slots.register(
      { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
      Pet,
    )
  })
}
```

Keep the registration payload to `name`/`id`/`order` only (never `kind`/`scope`) — the fixture already complies.

**Also verify at the target tag:** that the slot name `conversation.session.header.actions` still exists in the alpha.2 ui-conversation slot table. **DSH-0.1.2-A1-03** states that UI registration points and internal session-view paths were split up extensively; if the seat moved, the registration target moves with it. The plugin's own comment names it as an "ordering edge", so this is the highest-value single check in the whole migration.

---

## 5 · Locale, props and services

| Item | Verdict | Basis |
|---|---|---|
| `ctx.locale.register(NS, { zh, en })` (`index.ts:36`) | **Keep as-is.** The runtime half of the locale pairing rule is unchanged in this cohort. | precision checklist (locale pairing) |
| `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { pet: PetKey } }` (`index.ts:14-19`) | **Owner must be confirmed.** The fixture augments **ui-slots** while the runtime dictionary owner is **client-locale** (imported type-only on line 8). The rule is that the type-level `LocaleNamespaceMap` augmentation **and** the runtime `ctx.locale.register` must both be present for any plugin shipping user-facing text — the pet has both, so the pairing is satisfied; but the *module that owns* the map must be the one the plugin actually imports, else the `pet` namespace never merges and `PropsLocale<'pet'>` (`Pet.tsx:10`) loses its keys. **Unconfirmed from the fixture** — resolve at the alpha.2 tag. | precision checklist; **DSH-0.1.2-A1-25** (symbols moved by domain) |
| `import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'` (`Pet.tsx:7`) | **Keep** — the package still exists in 0.1.2 — but it becomes a **direct peer dependency**, and the slot's prop contract must be re-read on alpha.2 (the props gain the new chat seat). | **DSH-0.1.2-A1-25**; **DSH-0.1.2-A1-03** |
| `export const inject = ['slots','conversation','locale']` (`index.ts:29`) | **Reconcile.** `slots` and `locale` are real service keys. If slot registration moves to `ctx.slots.inject`, `'conversation'` may no longer be needed — and if it is not a service key on alpha.2, a hard `inject` entry leaves the entry **permanently pending** on that host. Prefer probing a genuinely optional service with a weak `ctx.get` over widening `inject`. | **DSH-0.1.1-R1-04** (strict injection), **DSH-0.1.1-R1-05** (weak `ctx.get` for optional services), R-02 |
| `locales.ts` (zh + en dictionaries) | **No break.** The zh/en pair is the right shape for this cohort. | — |
| `ctx.effect(...)` usage | **Keep.** | — |

---

## 6 · Not hit (with reasons) — so the plan is not padded

| Card | Why it does not apply to this plugin |
|---|---|
| **DSH-0.1.2-A1-27** (session content reads via the `SessionBinding` durable event window) | The pet reads **no user-message content**; it reads snapshot state fields. The card's own read path (`sessions.binding(id)` → `eventSource.getSnapshot().entries` → `entry.event.data.content`) is the escape hatch for *content* reads only. Not hit. Revisit only if the pet starts rendering message text. |
| **DSH-0.1.2-A1-30** (`ctx.connection.api` removed), **DSH-0.1.2-A1-01** (APIProxy → `ctx.remote`), **DSH-0.1.2-A2-02** (`RemoteError` / namespaced codes), **DSH-0.1.2-A2-06** (`$host.home/isLoopback`) | The plugin makes **no** Remote / APIProxy / `ctx.connection.api` call. No Remote surface is hit at all. |
| **DSH-0.1.2-A1-32** (`ctx.uiWorkspace`), **DSH-0.1.2-A1-26**'s workspace half | The plugin never touches `ctx.workspaces` / `connectWorkspace` / `pickDirectory` / `baselinesReady` / `recentWorkspaceId`. |
| **DSH-0.1.2-A1-28** (composer `<textarea>` → contenteditable) | The plugin does not touch the composer DOM, `el.value`, `setSelectionRange`, or `[data-input-scroll]`. |
| **DSH-0.1.2-A1-29** (`MarkdownText` nested `labels`) | The pet renders `<div data-frame=… class="pet" />`; no `MarkdownText`, no fenced code blocks. |
| **DSH-0.1.2-A1-06** (Code Mode → PTC) | No `tools.mode: 'code'`, no `code` preset id, no `CodeDispatch*`, no `tools:code-only`, no `Code Mode` copy. The plugin has no host/tool half. |
| **DSH-0.1.2-A1-11** (subagent model selection), **DSH-0.1.2-A1-09** (model settings login), **DSH-0.1.2-A1-10** (third-party languages) | **Capability** cards — suggestions only, never adopted automatically. The pet is a client UI plugin with no model/tool/preset surface. (A1-10 is adjacent but not applicable: the pet registers a **dictionary namespace**, not a language.) |
| **DSH-0.1.2-A1-12** (plugin name/version attached to DeepSeek requests), **DSH-0.1.2-A1-23** (base telemetry default), **DSH-0.1.2-A1-14** (session-log upload) | **Deployment/privacy** surfaces — no plugin-code change; relevant to the operator, not to this source tree. |
| **DSH-0.1.2-A1-24** (pi-ai 0.82 → 0.84) | The plugin does not import `@earendil-works/pi-ai`; the no-duplicate-instance trap does not apply. |
| **DSH-0.1.2-A2-05** (plugin inventory `agentPresets`), **DSH-0.1.2-A2-08** (`sessionProjections` required inject/peer), **DSH-0.1.2-A2-10** (`settingsNamespace` removed) | The plugin consumes no plugin-inventory snapshot, lists none of the affected tool packages as peers, and registers no settings namespace (the `pet` namespace is a **locale** namespace, not a settings one). |
| **DSH-0.1.2-A1-02** → **DSH-0.1.2-A2-01** (`SessionEvent.ignorable` removed then restored) | The plugin **produces no persisted SessionEvents** and reads none. The corridor net state is "restored in alpha.2" — nothing to delete and re-add here. |
| **DSH-0.1.1-R2-01/02/03** (image attachment dimensions, `read_image` output, DeepSeek Files API) | No image, `read_image`, or attachment surface. |
| **DSH-0.1.1-R1-06** (session event `type` vs `kind`), **DSH-0.1.1-R1-07** (self-rendering clients have no `ctx.sessions`), **DSH-0.1.1-R1-08** (`tasks.peek`), **DSH-0.1.1-R1-09** (`httpServer`→`webServer`, `tasks`→`jobs`) | No session-event subscription, no `ctx.sessions`, no task/job API, no `webServer` route. The pet's `useSession` is a **slot prop** (a lifecycle seat) and must not be confused with the removed `ctx.sessions` service of R1-07. |
| **DSH-0.1.2-A1-15 … A1-18** (not present in the alpha.1 card set) | The alpha.1 card file is a curated list; no cards exist for these numbers. |
| **DSH-0.1.2-A2-04** (Node 24.0–24.11.1 empty client graph) | **Conditional, environment-side.** If the plugin's CI/test matrix pins Node 24.0–24.11.1, remove only the workarounds that bypass that defect. Not a source change in this tree. |

---

## 7 · Optional / capability follow-ups (not to be adopted automatically)

- **DSH-0.1.2-A1-10** — if the pet later wants to ship a language beyond zh/en, the host's public language-registration API is the path; do not build a self-made i18n patch. *(Not adopted here.)*
- **DSH-0.1.2-A1-09 / A1-11** — no model-facing surface in this plugin; nothing to integrate. *(Not adopted.)*
- **R-13** — the corridor moves host UI copy to localized seats. The pet anchors to a **slot**, not to displayed text, so it is unaffected — but keep it that way: if the pet ever locates host UI by text, it must cover all language variants or it will fail silently.

---

## 8 · Verification plan (the layers that actually prove this)

1. **Static inventory** — `grep -rn "dsh-client-runtime" src/ package.json` must return **nothing** (imports, type-only imports, `dsh.client.inject`, peers, lockfile). A single surviving reference, including a stale *type* import, leaves the migration incomplete.
2. **Typecheck, once with `skipLibCheck: false`** — this is the step that surfaces the missing declaration chain (ui-chat → client-store / ui-primitives / session / commands / conversation). Then restore the repository policy. Any new implicit `any` is a migration failure.
3. **Peer floor check** — `node skills/plugin-upgrade/scripts/inject-lint.mjs <plugin-dir>` must reach `OK`: no `runtimeRefsLeft`, `cordisPeer === '^4.0.1'`, no missing peers for inject **or** for imports (including type-only ones). Peers ⊇ inject.
4. **Build + plugin tests** on a clean build (clean first: stale `tsbuildinfo` produces false `MISSING_EXPORT` diagnostics).
5. **Real cold boot in an isolated profile** — no `pending (waiting for service: …)`, no `loaded without registering`, no `missed the module table`. Confirm the boot manifest contains the entry whose id is `@demo/dsh-bench-pet` and that the client bundle's registration id equals the package name (**DSH-0.1.2-A1-26**).
6. **Web acceptance** (**DSH-0.1.2-A1-19**) — use the token URL printed by `dsh web:`, exchange it for the cookie (`redirect: 'manual'` if the script has no cookie jar), read `window.__DSH_BOOT__.entries`, request the **host-advertised** artifact URL (do not hand-concatenate `/plugins/<id>/client.js`), then assert a DOM marker owned by the pet, and collect page errors. A bare HTTP 200, or the id merely appearing in the startup log, proves nothing.
7. **Behaviour** — one real turn: a thinking step, a tool call in flight, and a settled turn must move the pet through `thinking` → `working` → settle. **Caveat**: the current implementation writes the frame into a `useRef` and mutates it in a `useEffect`; a ref write does not schedule a re-render, so `data-frame` may never change on screen. Fix that (state instead of ref) **before** using `data-frame` as the acceptance oracle — otherwise the animation looks broken for a reason that has nothing to do with the host version.
8. **Two-host lane, only if 0.1.1-rc.1 support is still claimed** — the same artifact on an rc.1 host and an alpha.2 host, with the projection step as the bridge (R-02 / R-03). A host-side `dsh` upgrade must be done from an **external** terminal, never from inside a running session.

---

## 9 · Pre-existing observations (not migration findings — do not fold into the migration diff)

- `Pet.tsx:24-31` — `frame` is a `useRef` mutated in `useEffect`; no re-render is triggered, so the animation frame does not update. Pre-existing behaviour defect, unrelated to the host version, but it blocks verification step 7.
- `Pet.tsx:26-27` — `void running` and `void lastTurnEnd as CSSProperties` discard the two values, and the `as CSSProperties` cast is meaningless (`lastTurnEnd` is a reason string, not a style object). The fixture is trimmed; if the running/settle animations are meant to be live, these reads are the ones that must be wired to the new seats.
- `Pet.tsx:18` — the props destructure takes only `{ useSession, t }`; the new chat seat must be added to it.

---

## 10 · Open items to confirm at the target tag (not guessable from the fixture)

| # | Item | Why it cannot be settled from the fixture alone |
|---|---|---|
| 1 | The exact `dsh.client.inject` id strings (scoped package names vs. bare names) | The fixture uses the pre-split spelling; the alpha.2 client module table is authoritative (**DSH-0.1.2-A1-26**) |
| 2 | The client bundle's `__ModuleLoader__.load` id / build-banner `PLUGIN_ID` == `@demo/dsh-bench-pet` | No build config in the fixture (**DSH-0.1.2-A1-26**) |
| 3 | Which module owns `LocaleNamespaceMap` (ui-slots vs. client-locale) | The fixture augments one and imports the other; the alpha.2 type graph decides |
| 4 | The chat seat's surface on the `conversation.session.header.actions` slot (`useChat` prop vs. `ctx.useChat`, and whether a separate `useConversation` seat is required for `views.get('chat')`) | API-10 cites the alpha.2 ui-chat slots contract but not this slot's prop set |
| 5 | `chat.timeline` element shape and the "last turn reason" field | The card/ledger name the timeline, not its members |
| 6 | The `ContentBlock` discriminator for reasoning (`kind` vs. `type`) and its alpha.2 home (`@deepseek-ai/dsh-llm`) | Not in the fixture; **do not carry `kind` over on faith** |
| 7 | Whether the slot name `conversation.session.header.actions` still exists in alpha.2's ui-conversation slot table | **DSH-0.1.2-A1-03** says UI registration points moved |
| 8 | Whether `'conversation'` is still a service key on alpha.2 | Determines whether the service-level `inject` list can keep it |

---

## 11 · One-paragraph answer for the maintainer

Your pet does not lose its snapshot — the snapshot stops being one flat object. Four reads split into two destinations: **`partial` and `runningCalls` can run first through the compatibility projection** `views.get('chat')?.legacy`, which still carries the old flat fields, so the plugin boots and animates with a one-line-per-field change; **`running` and the turn-end reason cannot wait** — `running` is a lifecycle field that is deliberately *not* in the projection and must come from the `useSession` seat, and `turnEnds` has moved to the chat view's `timeline`, where the sibling progress plugin moved its turn-end detection. Around that, the mechanical work is the client-runtime removal (**DSH-0.1.2-A1-25**): the deleted package takes your `ClientContext` and `ConversationSnapshot` imports with it, the flat `useSession` selector is replaced by the keyed chat read (`useChat` + `order`/`nodes.get(id)`) per the split card (**DSH-0.1.2-A1-03**) and the alpha.2 ledger (**API-10**), your `package.json` needs the `dsh.client` manifest key and a peer block at the cohort floor (**DSH-0.1.1-R1-02**/**R1-03**, **DSH-0.1.2-A2-03**), and your bare slot `register` should be wrapped in `ctx.slots.inject` so the apply-order race cannot throw at boot. Nothing here needs a Host-side change, and no Remote, APIProxy, workspace, composer, markdown, settings, or PTC surface is touched.

---

*Report produced read-only. The fixture was not modified (sha256 re-verified against the seal after the scan). All card references are by ID only; the card texts live in `skills/plugin-upgrade/references/`.*
