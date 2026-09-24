# S3 · Snapshot Read-Surface Migration Assessment (Read-Only)

Target plugin: `bench-pet` (`@demo/dsh-bench-pet` 0.1.0, private, Web Client half only)
Fixture inspected read-only: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S3-snapshot-migration\environment\fixture
Corridor assessed: dsh 0.1.1-rc.1 → 0.1.1-rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2 (final target: **dsh-v0.1.2-alpha.2**)
Skill mode: Mode A-style read-only inspection under the plugin-upgrade skill (no writes, no installs, no builds; fixture untouched).

## 0. Method and corridor net state

The corridor was built from the skill's `from → to` edges (references/README.md), not filename order:

- v0.1.1-rc.2.md (DSH-0.1.1-R2-01..03) — image/LLM surfaces only; no hits for this plugin.
- v0.1.2-alpha.1.md (DSH-0.1.2-A1-01..32) — the breaking edge for this plugin: client-runtime removal, session-view split, scan-contract change.
- v0.1.2-alpha.2.md (DSH-0.1.2-A2-01..10) plus api-migration-0.1.2-alpha.2.md (API-01..API-10, CFG-01) — final net state for the chat read surface (keyed `ChatSnapshot`, `useChat`, staged `legacy` projection).

Net-state notes applied: `SessionEvent.ignorable` was removed in alpha.1 and restored in alpha.2 (DSH-0.1.2-A1-02 → DSH-0.1.2-A2-01) — this plugin writes no session events, so nothing to delete/re-add. The plugin's snapshot reads are affected by the alpha.1 view split (DSH-0.1.2-A1-03) whose alpha.2 successor surface is defined by API-10.

## 1. Hit inventory — every surface that breaks, with source location, target form, and card

Summary table first (details in the sections after):

| # | Hit location | Old surface | Symptom on 0.1.2-alpha.2 | Target form | Cards |
|---|---|---|---|---|---|
| H1 | package.json `client.inject` includes `dsh-client-runtime` | runtime aggregation package in inject | row pending / plugin out of the boot graph, often silently | remove the phantom package; keep only real service packages | DSH-0.1.2-A1-25 |
| H2 | src/client/Pet.tsx:8 `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'` | type import from removed package | TS2305 / missing module; with `skipLibCheck: true` selectors silently become `any` | domain-owned types (`ChatSnapshot` from `@deepseek-ai/dsh-client-ui-chat/client`, etc.) | DSH-0.1.2-A1-25, API-10 |
| H3 | src/client/index.ts:6 `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'` | `ClientContext` from removed package | same as H2 | `import type { Context as ClientContext } from '@deepseek-ai/cordis'` + owner-package `import type {}` augmentations | DSH-0.1.2-A1-25, API-10 |
| H4 | src/client/Pet.tsx:13-15 `isThinking` reads `snapshot.partial?.blocks` via `useSession` | flat `ConversationSnapshot.partial` on the `useSession` seat | `partial` undefined → pet never enters the thinking frame (silent functional loss, no crash) | staged: legacy projection; target: `useChat` keyed snapshot read | DSH-0.1.2-A1-03, API-10 |
| H5 | src/client/Pet.tsx:21 `s.runningCalls.length > 0` | flat `ConversationSnapshot.runningCalls` | same silent loss (working frame never triggers) | staged: legacy projection; target: views/timeline read | DSH-0.1.2-A1-03, API-10 |
| H6 | src/client/Pet.tsx:23 `s.turnEnds[s.turnEnds.length - 1]?.reason` | flat `ConversationSnapshot.turnEnds` | same silent loss (settle frame never triggers) | staged: legacy projection; target: views/timeline read | DSH-0.1.2-A1-03, API-10 |
| H7 | src/client/Pet.tsx:19 `s.running` (lifecycle field) | `useSession` lifecycle seat | none — but only the `useSession` seat keeps working; the legacy projection does NOT carry it | keep reading `running` through the `useSession` seat | DSH-0.1.2-A1-03 (field note) |
| H8 | cordis.patch.yml row `id: bench-pet` vs `name: '@demo/dsh-bench-pet'` | rc.1-era short id + package name row | client bundle may stay out of the graph ("loaded without registering" or silent panel disappearance) | all three ids (bundle registration id, package.json name, assembly row) equal the bare package name `@demo/dsh-bench-pet` | DSH-0.1.2-A1-26 |
| H9 | src/client/index.ts `inject = ['slots', 'conversation', 'locale']` and slot `conversation.session.header.actions` | client fiber inject for ordering | no corridor card changes this seam in 0.1.2 (the slot move happens later, in 0.1.5-alpha.2) | keep; re-verify at the target tag | (non-hit, verification item) |

### H1 · package.json — `dsh-client-runtime` in `client.inject`

- Current evidence: package.json lines 6-9 — `"client": { "platform": "web", "inject": ["dsh-client-runtime", "dsh-client-ui-conversation", "dsh-client-locale"] }`.
- Old form: declaring the removed aggregation package `@deepseek-ai/dsh-client-runtime` in the client inject list.
- How it breaks: the package was deleted in alpha.1; keeping it is a runtime phantom dependency — the assembly row stays pending and the plugin never enters the boot graph, often without an explicit error.
- Target form:

```json
"client": {
  "platform": "web",
  "inject": ["dsh-client-ui-conversation", "dsh-client-locale"]
}
```

Keep only packages that actually provide services the bundle consumes. Per DSH-0.1.2-A1-25, also make every package whose declarations the source imports a direct dev/peer dependency of the plugin.
- Card: **DSH-0.1.2-A1-25** (required-if-hit; here it is hit).
- Verification: cold boot shows the plugin in the boot graph with no pending rows; `dsh --profile <p> --dump-config` shows no pending.

### H2 · Pet.tsx — `ConversationSnapshot` type import

- Current evidence: src/client/Pet.tsx line 8.
- Old form: `import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`.
- How it breaks: module does not exist on alpha.2 → typecheck TS2305. With `skipLibCheck: true` and stale declarations the failure can hide and turn selectors into implicit `any` instead — which the skill counts as a migration failure, not a warning.
- Target form: the flat `ConversationSnapshot` no longer exists as a public read surface. The alpha.2 chat read surface is the keyed snapshot from ui-chat:

```ts
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
```

with reads via `ctx.useChat(chat => ...)`; node iteration is `snapshot.order.flatMap(id => snapshot.nodes.get(id) ? [snapshot.nodes.get(id)!] : [])` (API-10 minimal shape). During staged migration the old field set is reachable through the legacy projection (see section 3).
- Cards: **DSH-0.1.2-A1-25** (symbol migration by domain), **API-10** (exact mapping table; `ConversationSnapshot.nodes[]` → `ChatSnapshot.order` + `snapshot.nodes.get(id)`).
- Also applies per API-10 dependency-ownership rules: `@deepseek-ai/dsh-client-ui-chat` (and any other owner of declarations the source consumes) becomes a direct dev/peer dependency; run one typecheck pass with `skipLibCheck: false` to surface the full declaration chain.

### H3 · index.ts — `ClientContext` type import

- Current evidence: src/client/index.ts line 6.
- Old form: `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`.
- Target form:

```ts
import type { Context as ClientContext } from '@deepseek-ai/cordis'
```

The client facets merged into Context now come from the owning packages via type-only augmentation — the fixture's existing `import type {} from '@deepseek-ai/dsh-client-locale/client'` and `import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'` lines are exactly the right pattern and should be kept; add owners for any newly consumed surface (e.g. ui-chat when `useChat` is adopted).
- Card: **DSH-0.1.2-A1-25**; composition guidance in **API-10** ("Type composition and dependency ownership").

### H4 · Pet.tsx — thinking detection on `snapshot.partial`

- Current evidence: src/client/Pet.tsx lines 13-15 (`isThinking`) consumed at line 20 via `useSession(isThinking)`.
- Old form: `snapshot.partial?.blocks.some(block => block.kind === 'reasoning')` on the flat `ConversationSnapshot` handed to `useSession` selectors.
- How it breaks: 0.1.2 no longer exposes per-session conversation-node snapshots through that seat; `partial` is simply absent, so `isThinking` folds to `false` forever — the pet silently loses the thinking pose (the `?? false` makes this a silent degradation, not a crash; a no-crash smoke will not catch it).
- Target form (two-stage, see section 3):
  - Stage 1 (compatibility projection): read the old flat fields from the chat view's legacy projection — `views.get('chat')?.legacy` — which still carries `nodes` / `partial` / `runningCalls` / `turnEnds`.
  - Stage 2 (new read path): read the streaming assistant content from the `useChat` keyed snapshot; narrow nodes by their discriminant (per API-10's discriminant-narrowing guidance for assistant steps) and re-derive "emitting reasoning with no tool in flight" from the projected nodes. Do not hand-copy the old `blocks`/`kind` field names into the new path — confirm the exact block discriminant spelling against the alpha.2 tag's `ChatSnapshot` types (API-10 pins packages/client/ui-chat/src/client/contract/snapshot.ts at dsh-v0.1.2-alpha.2); the skill forbids inventing interfaces not stated in the cards.
- Cards: **DSH-0.1.2-A1-03** (session view internals split; the 2026-08-28 dsh-ui-whale field note documents the `views.get('chat')?.legacy` projection and the two-step "legacy first, then field-by-field to views/timeline" approach), **API-10** (keyed snapshot + `useChat`).
- Related but distinct: DSH-0.1.2-A1-27 reroutes raw session-content reads to the SessionBinding durable event window. This plugin does not read user-message content from `session.getSnapshot()`, so A1-27's recipe is not required here; it becomes relevant only if the pet ever needs historical message text rather than the live view.

### H5 · Pet.tsx — tool-in-flight on `runningCalls`

- Current evidence: src/client/Pet.tsx line 21.
- Old form: `useSession(s => s.runningCalls.length > 0)`.
- Break and target: same mechanism as H4 — `runningCalls` is a flat conversation-snapshot field; stage through `legacy.runningCalls`, then re-derive "a tool call is in flight" from the alpha.2 views/timeline projection once stable.
- Cards: **DSH-0.1.2-A1-03**, **API-10**.

### H6 · Pet.tsx — settle frame on `turnEnds`

- Current evidence: src/client/Pet.tsx line 23.
- Old form: `useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`.
- Break and target: same mechanism; `turnEnds` is view data that moved into the timeline projection. Stage through `legacy.turnEnds`, then read the turn timeline from the new views/timeline surface.
- Cards: **DSH-0.1.2-A1-03**, **API-10**.

### H7 · Pet.tsx — `running` lifecycle field (no change, but a classification obligation)

- Current evidence: src/client/Pet.tsx line 19.
- Form: `useSession(s => s.running)` stays on the `useSession` seat. The A1-03 field note is explicit that lifecycle fields such as `running` are **not** carried by the legacy projection — they must keep going through the `useSession` seat. So this selector is the one read that must NOT be rerouted through the projection during staging, and it is also not part of the `useChat` transcript migration.
- Card: **DSH-0.1.2-A1-03** (field note, 2026-08-28).

### H8 · cordis.patch.yml — scan-contract id alignment

- Current evidence: cordis.patch.yml lines 1-4 — `- insert: - id: bench-pet, name: '@demo/dsh-bench-pet'`.
- How it breaks: 0.1.2's client-modules scan keys entries/modules/registrations by package name; a short id that differs from the package.json name reproduces either the startup assertion `loaded without registering "…"` or the subtler silent disappearance (panel gone, boot graph lacks the plugin, no errors).
- Target form: with package.json `name` as the baseline, all three ids must agree on the bare package name `@demo/dsh-bench-pet`: (1) the client bundle's `__ModuleLoader__.load({ id })` registration id (usually injected by the tsdown banner `PLUGIN_ID`), (2) the assembly row (`id` aligned to the package name, `name: '@demo/dsh-bench-pet'`), (3) `dsh --profile <p> --dump-config` shows the row resolved with no pending.
- Card: **DSH-0.1.2-A1-26** (required-if-hit).
- Honesty note: the fixture's row already carries the correct `name`; the divergent short `id: bench-pet` is flagged as a probable hit of A1-26's id-agreement rule, but the fixture is task material that cannot be run, so the final judgment belongs to the `dump-config`/boot-graph verification above rather than to static reading alone.

### H9 · index.ts — inject list and slot name (non-hit in this corridor, keep + verify)

- Current evidence: src/client/index.ts `export const inject = ['slots', 'conversation', 'locale']`; slot `conversation.session.header.actions`; locale registration `ctx.locale.register(NS, { zh, en })` and the `LocaleNamespaceMap` augmentation in ui-slots.
- Assessment: no card in the 0.1.1-rc.1 → 0.1.2-alpha.2 corridor renames the conversation header slot, removes the client `slots`/`locale` services, or changes `locale.register`. (The `conversation` slot moves under root-scoped `main` only in 0.1.5-alpha.2 — outside this corridor.) The ordering-edge `inject` of `conversation` remains the correct pattern. Keep, and confirm once against the alpha.2 tag's ui-conversation client declarations.
- Cards: none (negative evidence); listed so the scope of "checked and not hit" is explicit.

## 2. Non-hits checked and excluded (evidence)

- DSH-0.1.1-R2-01..03 (image refs, read_image text, Files API): no attachment, image, or LLM surfaces in the fixture.
- DSH-0.1.2-A1-01 / A1-30 / A2-02 (APIProxy → Remote, `ctx.connection.api`, `RemoteError`): the plugin makes no Host calls at all — no `connection`, no `remote`, no error-code branching.
- DSH-0.1.2-A1-27: no `session.getSnapshot().nodes` / raw timeline reads (see H4 note).
- DSH-0.1.2-A1-28 (composer textarea → contenteditable): no composer DOM manipulation.
- DSH-0.1.2-A1-29 (MarkdownText labels): no markdown rendering.
- DSH-0.1.2-A1-31/A1-32 (subagent descriptor, workspaces navigation): no subagent or workspace usage.
- DSH-0.1.2-A1-20 (user-questions waterfall), A1-21 (resolveSessionPreset), A1-22 (isTokenDelta): no corresponding imports or calls.
- DSH-0.1.2-A2-01/A2-05/A2-06/A2-08/A2-10: no session-event production, inventory consumption, `$host` reads, self-composed tool-package profile, or settings-namespace usage.
- Locale dictionaries (src/client/locales.ts): zh/en key parity holds; no corridor card touches dictionary shape.

## 3. Compatibility projection vs immediate new read path (requirement 4)

The corridor offers exactly one staged mechanism: the chat view's **legacy projection** (`views.get('chat')?.legacy`, per the DSH-0.1.2-A1-03 field note; API-10 similarly permits `snapshot.legacy` on the new snapshot only for staged dual-host compatibility). Classification of every snapshot field this plugin reads:

| Field | Can run first through the legacy projection? | Reason / obligation |
|---|---|---|
| `partial` (H4, thinking) | **Yes** | explicitly listed as still readable through `views.get('chat')?.legacy` |
| `runningCalls` (H5, working) | **Yes** | same projection field set |
| `turnEnds` (H6, settle frame) | **Yes** | same projection field set |
| `nodes` (not read directly here, but the type's anchor) | **Yes** (`legacy.nodes`) | same; API-10 warns it must not become the primary surface for an alpha.2-only plugin |
| `running` (H7, lifecycle) | **No — and must not** | lifecycle fields are not in the projection; they must switch to (stay on) the `useSession` seat immediately |
| import/inject surfaces (H1-H3) | **No** | build/boot-blocking removals (`dsh-client-runtime` gone); there is no projection for a deleted package — these are day-one changes |
| scan-contract ids (H8) | **No** | loader-level contract; alignment is required before any client half can mount at all |

Recommended sequencing (the pattern the A1-03 field note reports as successful in three real plugins): first do H1/H2/H3/H8 plus a mechanical move of all four flat-field selectors onto the legacy projection, boot and verify the pet still animates; then migrate field-by-field to `useChat`/views/timeline once stable. API-10's constraint applies: the legacy projection is a migration scaffold with an explicit dual-host requirement, not the new home — an alpha.2-only release should end with the keyed-snapshot reads.

## 4. Validation plan (for the later authorized migration; none of it run here)

1. Static: typecheck once with `skipLibCheck: false`; no `dsh-client-runtime` imports or inject rows remain; no new implicit `any` in selectors.
2. Loader: isolated profile cold boot; `--dump-config` shows no pending; `window.__DSH_BOOT__.entries` contains `"id":"@demo/dsh-bench-pet"`; the combo URL's script contains `__ModuleLoader__.load({ id: "@demo/dsh-bench-pet"` (DSH-0.1.2-A1-26 verification).
3. Runtime/behavior: on a real alpha.2 web host, drive one turn and assert the pet's `data-frame` transitions idle → thinking → working → settle; a no-crash smoke is insufficient because every snapshot-field failure here is silent (H4-H6).
4. Regression guards: keep a test that fails if `partial`, `runningCalls`, or `turnEnds` reads silently fold to `false`/`undefined`.

## 5. Report per the skill's structure

- **Pre-existing (baseline)**: not collected — read-only assessment; the fixture is task material that cannot be built or run (fixture README states this).
- **Completed**: full read-surface hit inventory with locations, target forms, and card citations (sections 1-3); corridor net-state computed across rc.2 → alpha.1 → alpha.2.
- **Skipped**: non-hits with evidence (section 2).
- **Pending/residual risk**: (a) the exact discriminant/field spelling of the streaming reasoning blocks inside the alpha.2 `ChatSnapshot` is not pinned by the cards — derive it from the target tag's ui-chat contract types before writing stage-2 code (do not invent it); (b) H8's final judgment needs the `dump-config`/boot-graph check; (c) runtime behavior unverified — no host was started (out of scope for this read-only task).
- **Rollback**: nothing to roll back — no files were modified. The fixture directory was only read.
- **Recommendations**: when the migration is authorized, follow the two-stage read-surface plan in section 3; adopt the plugin's own SemVer bump separately from the host corridor; consider whether the settle-frame "turn end reason" should move to the timeline projection's native end-reason API once confirmed at the tag.

## 6. Card citation index (full IDs used in this report)

DSH-0.1.1-R2-01, DSH-0.1.1-R2-02, DSH-0.1.1-R2-03 (non-hits); DSH-0.1.2-A1-01, DSH-0.1.2-A1-02, DSH-0.1.2-A1-03 (hit), DSH-0.1.2-A1-20, DSH-0.1.2-A1-21, DSH-0.1.2-A1-22, DSH-0.1.2-A1-25 (hit), DSH-0.1.2-A1-26 (hit), DSH-0.1.2-A1-27 (adjacent, non-hit), DSH-0.1.2-A1-28, DSH-0.1.2-A1-29, DSH-0.1.2-A1-30, DSH-0.1.2-A1-31, DSH-0.1.2-A1-32 (non-hits); DSH-0.1.2-A2-01, DSH-0.1.2-A2-02, DSH-0.1.2-A2-05, DSH-0.1.2-A2-06, DSH-0.1.2-A2-08, DSH-0.1.2-A2-10 (non-hits); API-10 (hit), API-01/API-02/API-04/API-05/API-08 (consulted, non-hit).
