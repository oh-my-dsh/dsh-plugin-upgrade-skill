# S3 · Snapshot Read-Surface Migration Assessment — bench-pet (read-only)

**Mode**: A-style read-only assessment (per plugin-upgrade skill). No migration executed, no files in the fixture touched.
**Plugin**: `@demo/dsh-bench-pet` 0.1.0 (private, Web Client face only — `src/client/*`, no host half)
**Corridor**: `dsh-v0.1.1-rc.1` → `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (edges chained by the corridor index `from → to` metadata, not filename order; full corridor read and net state computed before writing this report).
**Baseline**: not collected — the fixture is static task material ("cannot be run"); this is a source-level assessment only.

## Corridor net state (summary)

- rc.1 → rc.2 (`DSH-0.1.1-R2-01/02/03`): image-attachment surface only — **zero hits** for this plugin (no `ImageAttachmentRef`, no `read_image`, no LLM adapter code).
- rc.2 → alpha.1 (`DSH-0.1.2-A1-*`): the load-bearing edge. `dsh-client-runtime` removed (A1-25), session-view internals split (A1-03), boot manifest keyed by package name (A1-26), session content reads rerouted (A1-27).
- alpha.1 → alpha.2 (`DSH-0.1.2-A2-*`): peer-dependency ownership rules (A2-03); `ChatSnapshot.nodes` is a **keyed store** (API-10). No restore/overlap to fold — nothing removed in alpha.1 that this plugin needs comes back in alpha.2.

## Touchpoint checkup (bench-pet, 0.1.1-rc.1 → 0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch | no | — | — | `cordis.patch.yml` is profile composition (API-08), classified below under enablement |
| #2 events | no | — | — | no `SessionEvent` producers/consumers in source |
| #3 services/Remote | yes | `package.json`, `src/client/index.ts`, `src/client/Pet.tsx` | DSH-0.1.2-A1-25, DSH-0.1.2-A1-27, DSH-0.1.2-A2-03, API-10 | runtime package removal + snapshot read surface |
| #4 filesystem | no | — | — | no host directory access |
| #5 UI/commands/tools | yes | `src/client/Pet.tsx`, `cordis.patch.yml` | DSH-0.1.2-A1-03, DSH-0.1.2-A1-26, API-10 | `useSession` selectors, registration id |
| #6 custom channel | no | — | — | plain slot component, no DOM/RPC channels |
| #7 subprocess/output | no | — | — | none |

---

## 1. Breaking surfaces, locations, target shapes, and cards

### 1.1 `dsh-client-runtime` declared in `dsh.client.inject` — package no longer exists

- **Location**: `package.json` → `client.inject: ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"]`
- **How it breaks**: the package was deleted in alpha.1. After the dismantling it is a runtime phantom dependency: the plugin's assembly row stays **pending forever / never enters the client boot graph**, often with no explicit error (silent disappearance of the pet).
- **Target form**: remove `"dsh-client-runtime"` from `client.inject`; keep only packages that actually provide services the plugin waits for — here `dsh-client-ui-conversation` (declares the `conversation` slot map / service) and `dsh-client-locale` (`locale` service), which both still exist at alpha.2.
- **Card**: **DSH-0.1.2-A1-25** (breaking; required-if-hit), with the API-10 dependency-ownership rules.

### 1.2 `ClientContext` imported from the removed runtime package

- **Location**: `src/client/index.ts:3` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`
- **How it breaks**: typecheck/build reports a nonexistent module (TS2305); the client bundle cannot be produced at all.
- **Target form**:
  ```ts
  import type { Context as ClientContext } from '@deepseek-ai/cordis'
  // keep the existing type-only augmentations that merge ctx.locale / the SlotMap:
  import type {} from '@deepseek-ai/dsh-client-locale/client'
  import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
  ```
  Client facets merged into `Context` now come from their owning packages via type-only imports; do not rely on hoisting or the old aggregation package.
- **Card**: **DSH-0.1.2-A1-25**; exact mapping table also in **API-10**.

### 1.3 `ConversationSnapshot` type import + flat snapshot reads in selectors

- **Location**: `src/client/Pet.tsx:4` — `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`; and the three selectors inside `Pet()`:
  - `useSession(s => s.running)` (line ~26)
  - `useSession(isThinking)` reading `snapshot.partial?.blocks` (lines 12–14, 27)
  - `useSession(s => s.runningCalls.length > 0)` (line 28)
  - `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)` (line 30)
- **How it breaks**: two layers.
  1. The type import fails exactly like 1.2 (package gone).
  2. The read surface: 0.1.2 no longer exposes per-session flat conversation-node snapshots — the timeline becomes an internal projection of each view package. `ChatSnapshot.nodes` on alpha.2 is a **keyed store (`ChatNodeStore`), not `ConversationNode[]`**; `useSession`-seat transcript reads are replaced by `useChat`. Lifecycle fields (e.g. `running`) are **not** in the chat projection and stay on the `useSession` seat.
- **Target form** (alpha.2 primary surface, per API-10):
  ```ts
  import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'

  // ordered node iteration over the keyed store:
  function orderedNodes(snapshot: ChatSnapshot) {
    return snapshot.order.flatMap((id) => {
      const node = snapshot.nodes.get(id)
      return node ? [node] : []
    })
  }
  // selector registration moves off the transcript seat:
  ctx.useChat((chat) => chat ? orderedNodes(chat) : [])
  ```
  For the pet's specific fields:
  - `running` → keep the `useSession` seat (lifecycle field; unchanged seat, unchanged semantics).
  - `partial?.blocks` / `runningCalls` / `turnEnds` → transitional read via the compatibility projection first (see §4), then migrate field-by-field onto the `useChat` keyed store / the view's timeline surface once stable. The exact alpha.2 field names for partial-block streaming, in-flight call count, and last turn-end reason inside the new view surface are **not spelled out in the curated cards** — per skill rules these must be re-checked against the target tag's `packages/client/ui-chat/src/client/contract/snapshot.ts` types before implementation; mark them "pending confirmation", do not invent the field names.
- **Cards**: **DSH-0.1.2-A1-03** (session-view split; field note documents the `views.get('chat')?.legacy` projection and the two-step migration), **DSH-0.1.2-A1-27** (durable event window as the content-read gap for third parties), **API-10** (keyed `ChatSnapshot`, `useChat`, `legacy.nodes` staged-compat only).

### 1.4 Registration id / assembly row name mismatch — client half silently out of the graph

- **Location**: `cordis.patch.yml` — insert row `{ id: bench-pet, name: '@demo/dsh-bench-pet' }`; `package.json` `name: "@demo/dsh-bench-pet"`.
- **How it breaks**: 0.1.2's boot manifest keys entries/modules/plugin registrations **by package name**. Three ids must agree with `package.json` `name` as the baseline: (1) the client bundle's `__ModuleLoader__.load({ id })` registration id (usually injected by the tsdown banner `PLUGIN_ID`), (2) the assembly row name, (3) the package name. The row's `name` already matches, but `id: bench-pet` ≠ `@demo/dsh-bench-pet`; symptom is either the startup assertion `loaded without registering "<id>"` or — worse — the panel silently disappearing with no plugin-related error.
- **Target form**: align every id to the bare scoped package name `@demo/dsh-bench-pet` (row name, registration id / `PLUGIN_ID` banner, entry id). Replace any 0.1.1-era `file:///` literal-path + short-name id row form with the package-name row.
- **Card**: **DSH-0.1.2-A1-26** (breaking; required-if-hit).

### 1.5 No direct type/dev dependencies on the owning declaration packages

- **Location**: `package.json` — declares no `dependencies` / `devDependencies` / `peerDependencies` at all, while the source directly imports `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-conversation/client`, `@deepseek-ai/dsh-client-locale/client` (and after migration will additionally consume `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-chat/client`).
- **How it breaks**: alpha.2 trims incidental peers (packages keep peers only for Cordis or identity-sensitive exports), and a published package's `devDependencies` are not transitively installed. With `skipLibCheck: true` the missing declaration chain does not fail the dependency check — instead `useChat`/`useSession` selectors and callback props silently become implicit `any` (a migration failure that typecheck masks).
- **Target form**: make every package whose declarations the source consumes a direct dev/peer dependency pinned to the **exact alpha.2 cohort** (single coherent cohort in package.json + lockfile; while the 0.1.2 cohort is unpublished, use `link:` to the official source checkout or tarball `overrides` per rollup R-01). On first migration run one typecheck with `skipLibCheck: false` to locate the full declaration-owner chain, then restore the repo's policy.
- **Cards**: **DSH-0.1.2-A2-03** (+ its field note on `skipLibCheck: false`), dependency-ownership rules in **API-10**; cohort coherence per rollup-0.1.2 R-01.

### 1.6 Non-hits checked with evidence (so they are not "missed")

- **Slot name `conversation.session.header.actions'`** (`Pet.tsx`, `index.ts`): unchanged across rc.1 → alpha.2; the `conversation` slot only moves under root-scoped `main` at **0.1.5-alpha.2** — outside this corridor. Recorded as a future-corridor risk, no action now.
- **`PropsRuntime`/`PropsLocale` from `@deepseek-ai/dsh-client-ui-slots`**: package exists at alpha.2 and still carries the client slot base Context augmentation (cited as a live alpha.2 source in API-10). Only the dependency-ownership rule (1.5) applies.
- **`ctx.locale.register(NS, { zh, en })` and the `LocaleNamespaceMap` augmentation**: no card in this corridor changes the locale registration surface (alpha.1's third-party-language capability card A1-10 is optional/additive). Unchanged.
- **`inject = ['slots', 'conversation', 'locale']` + nested `ctx.inject([...])`**: strict-injection semantics land before this corridor's start (rc.1); no alpha.2 card alters this pattern for these services. Unchanged.
- **rc.2 cards (image surface)**: zero code overlap — skipped with evidence above.
- **TSX / React.createElement**: the plugin builds its own client bundle; not a DSH corridor item.

---

## 2. Requirement 4 — compatibility projection vs immediate new read path

**Can run first through the compatibility projection (`views.get('chat')?.legacy`)** — the old flat `ConversationSnapshot` fields `nodes` / `partial` / `runningCalls` / `turnEnds` all remain readable through the `legacy` projection (DSH-0.1.2-A1-03 field note; API-10 calls `snapshot.legacy.nodes` staged compatibility):

- `snapshot.partial?.blocks` (the `isThinking` selector)
- `s.runningCalls.length` (the `toolRunning` selector)
- `s.turnEnds[...].reason` (the `lastTurnEnd` selector)

Recommended sequencing (the verified two-step strategy from the A1-03 field note): first migrate the whole plugin onto `legacy` so it runs on alpha.2, then move field-by-field to `useChat` + the keyed store (`order` + `nodes.get(id)`) / the view timeline once stable. The projection is a bridge, not a destination: an alpha.2-only plugin must not make `legacy` its primary data surface.

**Must switch to the new path immediately (no projection exists)**:

- Everything routed through `@deepseek-ai/dsh-client-runtime`: the `client.inject` row (1.1) and both type imports (1.2, 1.3) — the package is gone; nothing projects it.
- `useSession(s => s.running)` — lifecycle fields are **not** in the `legacy` chat projection; they must stay on the `useSession` seat (which remains valid, so this selector keeps working, but it cannot be moved into the projection-based read).
- The registration-id / row-name alignment (1.4) — no compat mode; misalignment silently keeps the client half out of the boot graph.
- Direct dependency ownership at the alpha.2 cohort (1.5) — structural, not projectable.

## 3. Validation plan (to run when the migration is approved)

1. **Dependency**: lockfile contains no `dsh-client-runtime` and no old-cohort `@deepseek-ai/*`; all DSH packages on the exact alpha.2 cohort.
2. **Enablement**: `dsh --profile <p> --dump-config` shows the row name `@demo/dsh-bench-pet`, no pending rows; boot manifest `window.__DSH_BOOT__.entries` contains `"id":"@demo/dsh-bench-pet"`; combo URL `/plugins/??@demo/dsh-bench-pet/client.js&rev=...` contains `__ModuleLoader__.load({ id: "@demo/dsh-bench-pet"`; no `loaded without registering`.
3. **Static**: `tsc` with `skipLibCheck: false` once (no missing declaration owners, no new implicit `any`), then the repo's normal typecheck/build.
4. **Runtime**: cold-boot a real profile; token→Cookie exchange; prove the slot registration mounts (pet visible in the session header), not just HTTP 200.
5. **Behavior**: one message → tool-call → response turn; assert the pet's frame transitions idle → thinking → working → idle track the live snapshot through both the legacy-projection bridge and (after stepwise migration) the keyed `useChat` reads.

## 4. Status

- **Completed**: read-only corridor analysis, touchpoint scan, per-surface breakage map with card citations, staged-read-path plan, validation plan.
- **Skipped**: rc.2 image cards (no overlap); 0.1.5-era slot moves (outside corridor) — both with evidence.
- **Pending/residual risk**: exact alpha.2 field names for `partial`-blocks / in-flight-calls / turn-end-reason inside the new `useChat` view surface are not in the curated cards — must be confirmed against the alpha.2 tag's `ui-chat` contract types before implementation; the 0.1.2 npm cohort's publication state affects whether `link:`/tarball `overrides` are needed during the transition.
- **Rollback**: not applicable (no writes performed; fixture untouched).

*Prepared under BENCHMARK-AUTH-v1. Fixture read-only discipline respected: no file inside the fixture or benchmark repository was created, modified, or deleted.*
