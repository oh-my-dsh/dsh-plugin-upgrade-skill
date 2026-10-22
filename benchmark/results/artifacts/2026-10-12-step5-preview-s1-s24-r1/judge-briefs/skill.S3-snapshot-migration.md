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
#### FILE: S3-snapshot-migration/S3-snapshot-migration-assessment.md

# S3 · Snapshot Read-Surface Migration Assessment — `@demo/dsh-bench-pet`

> **Mode A · read-only inspect.** No source was edited; the fixture under
> `fixture/` is byte-for-byte unchanged. This report is the requested migration
> assessment only. No migrations, installs, dependency writes, or lifecycle
> scripts were executed.
>
> **Plugin**: `@demo/dsh-bench-pet` v0.1.0 (private) — browser pixel-pet, Web Client half only
> (`package.json#client.platform = "web"`). Animation pose follows the live conversation snapshot.
> **Host corridor**: `dsh-v0.1.1-rc.1` (code era) → `dsh-v0.1.2-alpha.2` (target).
> **Baseline (Mode C mechanical suite)**: not collected — this is a read-only Mode A pass over task
> material that "cannot be run" per the fixture README. Any new failure listed below is a
> projected compile/runtime break from the cards, not an observed one.

## Corridor used (connected by `from → to`, not filename order)

| Order | Edge | from | to | Relevant to this plugin? |
|---|---|---|---|---|
| — | plugin's own era | `dsh-v0.1.0-*` → `dsh-v0.1.1-rc.1` | earliest card is rc.1, so `≤rc.1` is an **unsupported gap** | treated as "old API surface", verified against rc.2 source baseline |
| 1 | [v0.1.1-rc.2.md](../../../../skills/plugin-upgrade/references/v0.1.1-rc.2.md) | rc.1 | rc.2 | 3 cards (image dims, `read_image`, DeepSeek Files API) — **non-hits** for this read-surface |
| 2 | [v0.1.2-alpha.1.md](../../../../skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | rc.2 | alpha.1 | **primary** — `dsh-client-runtime` removal + session-view split (A1-25/A1-03/A1-27/A1-30) |
| 3 | [v0.1.2-alpha.2.md](../../../../skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | alpha.1 | alpha.2 | 8 cards; net-state fold matters for `ignorable` (A1-02→A2-01), **not** relevant to this plugin |

Ledger: [API-10](../../../../skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md#api-10--web-client-runtime-unbundling-keyed-chat-snapshots-and-command-attachment-parameters) (rc.2→alpha.2 read surface), and the real
[Host+Web-Client alpha.2 migration example](../../../../skills/plugin-upgrade/examples/08-real-web-client-alpha2-migration.md).

---

## 1. Touchpoint checkup (pre-flight template)

Touchpoint classes hit: **#3 (services/session-view reads)** and **#5 (slot runtime snapshot + client runtime)**.
`#1` (patch) / `#2` (events) / `#4` (host FS) / `#6` (custom channel) / `#7` (subprocess) — **no hits**.

| Touchpoint | Hit | File:line | Governing card | Confidence |
|---|---:|---|---|---|
| #1 patch | 0 | — | — | — (`cordis.patch.yml` is **composition**, not a source patch — see §4, API-08) |
| #2 events | 0 | — | — | — |
| #3 services / session reads | **Yes** | `Pet.tsx:19,20,21,23`; `Pet.tsx:8,13,14` | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-27`, `DSH-0.1.2-A1-30`, API-10 | high |
| #4 filesystem | 0 | — | — | — |
| #5 UI / commands / slot | **Yes** | `package.json:8`; `src/client/index.ts:6,35,38`; `src/client/Pet.tsx:8` | `DSH-0.1.2-A1-25`, `DSH-0.1.2-A1-26` | high |
| #6 custom channel | 0 | — | — | — |
| #7 subprocess/output | 0 | — | — | — |

---

## 2. Every surface that breaks on `0.1.2-alpha.2`, with source location, target shape, and card

The unifying root cause is **`@deepseek-ai/dsh-client-runtime` package removal** — client symbols
were split to owning-domain packages in `alpha.1` (**DSH-0.1.2-A1-25**), and the flat
`ConversationSnapshot` read surface was retired over the session-view split
(**DSH-0.1.2-A1-03 / A1-27 / A1-30**, ledger **API-10**). Six concrete hits follow.

---

### 2.1 · `package.json` — removed runtime still declared in `dsh.client.inject`

- **Current evidence**: `fixture/package.json:8` — `client.inject: ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]`
- **Old interface**: `dsh-client-runtime` as a mounted client service
- **How it breaks**: runtime does not enter the boot graph / assembly row stays `pending` forever, often with no explicit error (phantom dependency).
- **Target shape** (spell-out):
  ```jsonc
  "client": {
    "platform": "web",
    "inject": ["dsh-client-ui-conversation", "dsh-client-locale"]
  }
  ```
  Remove `dsh-client-runtime`; keep only packages that actually still provide services.
  Add `@deepseek-ai/dsh-client-ui-chat` as a **direct dev/peer dependency** *only* if the source imports `ChatSnapshot` from it (see 2.4) — declaration ownership must be direct, and a consumed package's `devDependencies` do not transit to you (API-10 "Type composition and dependency ownership"; peer-trim note `DSH-0.1.2-A2-03`).
- **Card**: **DSH-0.1.2-A1-25**
- **Verification**: full lockfile scan shows no `dsh-client-runtime`; `--dump-config` shows this row not pending; cold boot places it in the boot graph.

---

### 2.2 · `src/client/index.ts:6` — `ClientContext` type source removed

- **Current evidence**: `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- **Old interface**: `ClientContext` exported from the aggregated runtime `/client`
- **How it breaks**: `TS2305` / module-not-found — the package no longer exists (deleted from `packages/client` in alpha.1).
- **Target shape**:
  ```ts
  import type { Context as ClientContext } from '@deepseek-ai/cordis'
  ```
- **Card**: **DSH-0.1.2-A1-25** (mapping row: `Context` / alias `ClientContext` → `@deepseek-ai/cordis`)
- **Verification**: typecheck clean with `tsconfig` upgraded to the alpha.2 cohort; no leftover `/client` runtime imports.

---

### 2.3 · `src/client/index.ts:35` and `:38` — `apply`/`inject` scope still typed with the removed `ClientContext`

- **Current evidence**: `export function apply(ctx: ClientContext): void { … }` and `ctx.inject(['slots','conversation'], (scope: ClientContext) => { … })`
- **Old interface**: `scope: ClientContext` (removed-package type)
- **How it breaks**: same removed-symbol typecheck failure as 2.2.
- **Target shape**: parameter/scope typed `Context` from `@deepseek-ai/cordis`. The body is otherwise unchanged: `ctx.locale.register('pet', { zh, en })` and `scope.slots.register({ name:'conversation.session.header.actions', id:'pet', order:10 }, Pet)` keep their signatures (locale service and the `conversation.session.header.actions` slot remain valid on alpha.2). `export const inject = ['slots','conversation','locale']` (index.ts:29) is already free of the removed runtime and stays as-is.
  ```ts
  import type { Context } from '@deepseek-ai/cordis'

  export function apply(ctx: Context): void {
    ctx.effect(() => ctx.locale.register('pet', { zh, en }), 'pet: dictionaries')
    ctx.inject(['slots', 'conversation'], (scope: Context) => {
      scope.slots.register(
        { name: 'conversation.session.header.actions', id: 'pet', order: 10 },
        Pet,
      )
    })
  }
  ```
- **Card**: **DSH-0.1.2-A1-25**
- **Verification**: typecheck + a Web cold boot where the slot registers and mounts (not just entry activation; `window.__DSH_BOOT__.entries` must carry the package name — see DSH-0.1.2-A1-26 / A1-19).

---

### 2.4 · `src/client/Pet.tsx:8` — `ConversationSnapshot` type import removed + flat field reads

- **Current evidence**: `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`
- **Old interface**: `ConversationSnapshot` from the aggregated runtime
- **How it breaks**: module-not-found; the whole flat-snapshot type tree (`nodes`, `partial`, `runningCalls`, `turnEnds`, …) no longer exists in that shape.
- **Target shape**: import the keyed chat snapshot type from its owner:
  ```ts
  import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
  ```
  `ChatSnapshot.nodes` is now a **keyed store**, not `ConversationNode[]` (API-10).
- **Card**: **DSH-0.1.2-A1-25** (symbol migration) + **DSH-0.1.2-A1-03** / **A1-27** / **A1-30** (the retiring of per-view node snapshots) + ledger **API-10**
- **Verification**: no `/client` runtime imports; `ChatSnapshot` resolves from the real `ui-chat` package at the target tag; `skipLibCheck: false` shows no missing declaration chain and no new implicit `any`.

---

### 2.5 · `src/client/Pet.tsx:13-14` — `isThinking(snapshot)` reads the flat `partial.blocks`

- **Current evidence**:
  ```ts
  function isThinking(snapshot: ConversationSnapshot): boolean {
    return snapshot.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
  }
  ```
- **Old interface**: `ConversationSnapshot.partial.blocks[]` (flat)
- **How it breaks**: `partial` is not on the new keyed `ChatSnapshot`; the imported type no longer exists either. The selector feeding "reasoning" needs re-homing to the chat read path (§3).
- **Target shape (durable)**: read the ordered chat nodes and detect an in-flight reasoning block by discriminant. The durable store read is fixed by API-10:
  ```ts
  import type { Context } from '@deepseek-ai/cordis'
  import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
  import type {} from '@deepseek-ai/dsh-api-session-controller/client'
  import type {} from '@deepseek-ai/dsh-client-ui-chat/client'

  function orderedNodes(snapshot: ChatSnapshot) {
    return snapshot.order.flatMap((id) => {
      const node = snapshot.nodes!.get(id)
      return node ? [node] : []
    })
  }
  export function useOrderedNodes(ctx: Context) {
    return ctx.useChat((chat) => (chat ? orderedNodes(chat) : []))
  }
  ```
  Reading the assistant step's settled content is confirmed: narrow by `type === 'assistant-step'`, then read `data.finalNode`. **The exact reasoning-block / in-flight `kind` discriminant on the new `ChatNode` store is NOT pinned in any card** (release notes give direction only), so it is tagged **pending confirmation** and must be re-typed against the target tag's `.d.ts` — do **not** invent it (card rule 3). First-pass landing may keep reading `partial` through the `legacy` projection (§3).
- **Cards**: **DSH-0.1.2-A1-30** (session reads rerouted), **DSH-0.1.2-A1-27** (content via SessionBinding durable event window), **DSH-0.1.2-A1-03** (view internals split / `legacy` projection field note); ledger **API-10**
- **Verification**: a live reasoning stream flips the pet to `thinking`; a completed assistant step is recoverable via `assistant-step → data.finalNode`; reasoning discriminant verified against target-tag types.

---

### 2.6 · `src/client/Pet.tsx:19-23` — `useSession` selectors over the retired flat snapshot

- **Current evidence** (the four snapshot reads — this is the heart of "snapshot read-surface migration"):
  ```ts
  const running     = useSession(s => s.running)                                    // :19  lifecycle
  const thinking    = useSession(isThinking)                                        // :20  partial.blocks
  const toolRunning = useSession(s => s.runningCalls.length > 0)                     // :21  runningCalls
  const lastTurnEnd = useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)     // :23  turnEnds
  ```
  (`running`/`lastTurnEnd` are `void`-suppressed placeholders in this trimmed fixture, but the read statements themselves still bind to the removed surface.)
- **Old interface**: `useSession(selector)` returning the flat `ConversationSnapshot` (`running`, `runningCalls`, `turnEnds`) from the aggregated runtime.
- **How it breaks**: transcript reads rerouted in alpha.1 (A1-30); the flat fields `partial / runningCalls / turnEnds` no longer come from a `ConversationSnapshot` — they are carried by the chat view, and lifecycle `running` is **not** in that projection (A1-03 field note). The `useSession` prop is destructured from `PropsRuntime<'conversation.session.header.actions'>` (`Pet.tsx:10,18`), so the emitted snapshot type — and possibly the provider prop name — changes from what 0.1.1-rc.1 supplied.
- **Target shape (durable)**: read via `useChat` over the keyed snapshot, `snapshot.order` + `snapshot.nodes.get(id)` per id (API-10). The exact block-level facts (an in-flight tool call, the last turn's end `reason`) are **pending confirmation** against the target `ChatNode` store types — the card fixes the *store iteration* (`order`/`get`) and the assistant-final-node narrowing, not every field discriminator. See §3 for the projection-first vs. immediate-read discrimination per field.
- **Cards**: **DSH-0.1.2-A1-30**, **DSH-0.1.2-A1-27**, **DSH-0.1.2-A1-03**, ledger **API-10**; `running` seat → **DSH-0.1.2-A1-03** field note
- **Verification**: pet animates off real α.2 snapshots across thinking / tool-in-flight / settled-turn states; no implicit `any`; cold-boot mount shows the resident pet.

---

## 3. Requirement 4 — compatibility-projection first vs. immediate new read path

The session-view split card records the exact re-homing ladder (DSH-0.1.2-A1-03 field note): the old flat
`ConversationSnapshot` fields **`nodes` / `partial` / `runningCalls` / `turnEnds`** remain readable through the
compatibility projection **`views.get('chat')?.legacy`**, while **lifecycle fields (`running`) are NOT in that projection** and live on the **`useSession` seat**. Applying that lens to the four Pet reads:

| Pet read | Source field(s) | Can land first through `views.get('chat')?.legacy`? | Durable alpha.2 read path |
|---|---|---|---|
| `isThinking` (Pet.tsx:13-14) | `partial.blocks` (`kind:'reasoning'`) | **Yes — projection-first** (flat `partial` present in `legacy`) | migrate field-by-field into the `useChat` view timeline; reasoning discriminant **pending confirmation** at target tag |
| `toolRunning` (Pet.tsx:21) | `runningCalls.length > 0` | **Yes — projection-first** (`runningCalls` in `legacy`) | migrate into `useChat` ordered-node scan for an in-flight tool-call block; block discriminant **pending confirmation** |
| `lastTurnEnd` (Pet.tsx:23) | `turnEnds[last].reason` | **Yes — projection-first** (`turnEnds` in `legacy`) | migrate into `useChat` ordered-node scan for the last settled `assistant-step` (`data.finalNode`); end-reason field mapping **pending confirmation** |
| `running` (Pet.tsx:19) | `s.running` | **NO — cannot use the chat `legacy` projection**; it is a lifecycle field absent from the projection | must re-home to the **`useSession` seat** (or an equivalent lifecycle read) immediately, verified against the α.2 slot runtime |

**Summary:** the three transcript-shaped reads (`partial`, `runningCalls`, `turnEnds`) may first be routed
through the `views.get('chat')?.legacy` compatibility projection and then migrated field-by-field into the
`useChat` timeline; `running` must be switched to its dedicated session-lifecycle seat right away, because it
never rides on that projection. The **durable target for all four** is spelled out in API-10:
`useChat` + `order` + `nodes.get(id)`, with `running` resolved on its lifecycle seat.

> **Note on the slot provider seam (honest gap).** The pet pulls `useSession` from
> `PropsRuntime<'conversation.session.header.actions'>` (`dsh-client-ui-slots`, `Pet.tsx:7,10,18`). No card
> explicitly renames that slot runtime *provider prop*. The read surface it must now emit has changed
> (`ChatSnapshot`, not flat `ConversationSnapshot`), so confirm the provider prop / emitted snapshot shape
> at `dsh-v0.1.2-alpha.2`'s `dsh-client-ui-slots` + `dsh-client-ui-conversation` before finalizing names —
> tagged **pending confirmation**, not invented here.

---

## 4. Non-hits / already-compliant (with evidence)

- **`cordis.patch.yml`** — insert row `id: bench-pet` / `name: '@demo/dsh-bench-pet'`. This is **Profile composition**, not a source patch (API-08); it is not a break. Per **DSH-0.1.2-A1-26**, the row `name` already equals `package.json#name` (`@demo/dsh-bench-pet`, scoped, no `file:///`), so the three-id agreement (package name = assembly row name = loader registration id) is **consistent today** — no change needed, only a final `--dump-config` re-check.
- **`src/client/index.ts:8,10`** — `import type {}` from `dsh-client-locale/client` and `dsh-client-ui-conversation/client` — both packages are retained at the target tag (they even appear as owners in the A1-25 split). Not hits.
- **`index.ts:29`** `inject = ['slots','conversation','locale']` — cordis fiber service names, all still provided by retained packages; **not** a hit (the removed runtime is not in it).
- **`ctx.locale.register`** (index.ts:36) — uses the retained locale service; A1-10 (registering third-party languages) is an *optional capability*, not a breaking change here.
- **`Pet.tsx:7`** — `PropsLocale`/`PropsRuntime` from `dsh-client-ui-slots` — package not removed; the *snapshot it emits* is the concern (see §3 note), not the import.
- **#5 Patterns** — no `MarkdownText`/`codeLabels` (A1-29), no direct composer DOM (A1-28), no custom `/api` route or `contenteditable` (A1-08/A1-28), no `connectWorkspace`/`pickDirectory` (A1-32). Verified by full-file read (no grep authority needed for a 3-file fixture).
- **`DSH-0.1.2-A1-02 → A1-01` (`ignorable`)** — corridor net state: the plugin writes no custom persisted `SessionEvent` / `Session.append`, so the remove-then-restore fold is irrelevant here.

---

## 5. Pending / residual risk (flag, don't fabricate)

1. `ChatNode` block discriminants for reasoning / in-flight tool-call / turn-end `reason` — **not pinned in any card**. Confirm against `packages/client/ui-chat/.../snapshot.ts` at `dsh-v0.1.2-alpha.2`; do not invent (card rule 3).
2. Slot runtime provider in `dsh-client-ui-slots` (`useSession` prop / emitted snapshot) — confirm prop shape/name at the target tag (see §3 note).
3. Type ownership: if `ChatSnapshot`/`ChatNodeStore` is imported from `@deepseek-ai/dsh-client-ui-chat/client`, that package must be a **direct dev/peer** dependency (A1-25/A2-03). Run one `skipLibCheck: false` pass to surface any missing `.d.ts` chain before narrowing types.
4. `.legacy` projection is staged compatibility plumbing — it is a **first pass**, not the alpha.2-only primary surface; API-10 states `snapshot.legacy.nodes` must not become the sole data path for α.2-only plugins. Land the milestone, then migrate into the view timeline.
5. This is a Web Client (browser) face — all card directions are client-plane. Host-plane equivalents (A1-01's "inject the domain service" note) do **not** apply here.

## 6. Validation ladder (would be run under an authorized Mode C; not executed here)

1. Static inventory of all `@deepseek-ai/*` imports/cohort versions — done from source.
2. `tsc` against the α.2 cohort; one `skipLibCheck: false` diagnostic for declaration ownership.
3. Focused unit tests for `isThinking` / `toolRunning` / `lastTurnEnd` / `running` against a real keyed `ChatNodeStore` (`order + get`), covering "empty session", reasoning in-flight, tool in-flight, settled turn.
4. Artifact smoke: `npm pack --dry-run --json --ignore-scripts`; verify tarball + manifest; verify no `dsh-client-runtime` in the dependent graph.
5. Headless-safe Loader/config smoke on an isolated profile; `--dump-config` shows no pending.
6. Real Web mount: token→Cookie → boot manifest `entries` contains `@demo/dsh-bench-pet` → client artifact 200 → slot mount renders the resident pet → unload (DSH-0.1.2-A1-19).

Distinguishing completion honestly: none of the above was executed; this report proves **static read-surface migration**, not "typecheck passed", not "Loader mount passed", and not "real behavior passed".

## 7. Rollback

Read-only pass; nothing was written, so there is nothing to roll back. The fixture remains the recorded rollback baseline.

---

### Appendix — Summary table (hit → old → target → card → change class → read path)

| File:line | Old interface | Typical symptom on α.2 | Target interface | Card | Change | Read path |
|---|---|---|---|---|---|---|
| `package.json:8` | `inject:[… "dsh-client-runtime" …]` | row pending / out of boot graph | drop runtime; keep `ui-conversation`+`locale`; add `ui-chat` dep if importing it | `DSH-0.1.2-A1-25` | required | — |
| `index.ts:6` | `ClientContext` from `/client` | TS2305 / module gone | `Context` from `@deepseek-ai/cordis` | `DSH-0.1.2-A1-25` | required | — |
| `index.ts:35,38` | `ctx/scope: ClientContext` | same removed-symbol typecheck failure | `Context` (body unchanged) | `DSH-0.1.2-A1-25` | required | — |
| `Pet.tsx:8` | `ConversationSnapshot` from `/client` | type/module gone | `ChatSnapshot` from `ui-chat/client` | `DSH-0.1.2-A1-25` | required | projection-first → view |
| `Pet.tsx:13-14` | `snapshot.partial.blocks` (`reasoning`) | flat field gone | `useChat` ordered nodes; `assistant-step`→`data.finalNode`; reasoning discriminant pending-confirm | `A1-30`/`A1-27`/`A1-03`, API-10 | required | **projection-first** |
| `Pet.tsx:21` | `snapshot.runningCalls.length>0` | flat field gone | `useChat` in-flight tool-call scan (discriminant pending-confirm) | `A1-30`/`API-10` | required | **projection-first** |
| `Pet.tsx:23` | `snapshot.turnEnds[last].reason` | flat field gone | `useChat` last `assistant-step` (end-reason mapping pending-confirm) | `A1-30`/`API-10` | required | **projection-first** |
| `Pet.tsx:19` | `s.running` (lifecycle) | field off the chat projection | `useSession` seat / lifecycle read | `A1-03` field note | required | **read-path switch (immediate)** |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.