# JUDGE BRIEF · skill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/migration-touchpoint-report.md

# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report (read-only)

**Mode**: A · inspect (read-only) per the `plugin-upgrade` skill. No file under `/app/fixture/` was modified; no build/repro environment was created; this report is the only artifact written (under `/app/agent-output/S4-legacy-client-imports/`).

## 1. Identity and corridor

- **Fixture**: `dsh-pet-session-bench` v0.1.0, `"private": true`, manifest `"dsh": { "client": { "platform": "web" } }` (package.json:6) — a **Web Client plugin** (browser-plane client half), dsh 0.1.1-rc.2 era, static copy, no lockfile.
- **Corridor** (built by `from → to` metadata in references/README.md, orders 2→3, not filename order):
  `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` (references/v0.1.2-alpha.1.md, 28 cards, prefix `DSH-0.1.2-A1`, status reviewed/curated) → `dsh-v0.1.2-alpha.2` (references/v0.1.2-alpha.2.md, 8 cards, prefix `DSH-0.1.2-A2`, reviewed/curated). Net final state computed across both edges; companion exact ledger: references/api-migration-0.1.2-alpha.2.md (API-01…API-10).
- **Scan scope**: all 4 fixture files read in full — README.md (6 lines), package.json (7 lines), src/client/index.ts (14 lines), src/client/Pet.tsx (1 line). No directories excluded; no composition file or build config present in the fixture.
- **Result**: **4 breaking touchpoints, all on the Web Client plane**, each pinned to a reviewed card with tag-anchored primary sources. (The fixture README's maintainer hints name the same four cards; each was independently re-verified against the card files and the source lines below, not taken on faith.)

## 2. Touchpoint checkup (pre-flight seven classes)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | — | none | — | No host-source patching in fixture |
| #2 internal/persistent events | — | none | — | No SessionEvent production/consumption |
| #3 services / Remote | ✔ | index.ts:1,9 · index.ts:11 · index.ts:2,12,13 | DSH-0.1.2-A1-25 · DSH-0.1.2-A1-30 · DSH-0.1.2-A1-27 | Cards reviewed/curated, primary sources tag-pinned |
| #4 host filesystem | — | none | — | No fs access |
| #5 UI / commands / tools registration | ✔ | index.ts:5,10 (+ package.json:2) | DSH-0.1.2-A1-26 (A1-25 also #5) | id mismatch directly visible in source |
| #6 custom HTTP/WS/DOM channels | — | none | — | No channel or DOM code |
| #7 subprocess / stdout parsing | — | none | — | No subprocess surface |

Must verify after any future migration (not executed here): build/typecheck (one `skipLibCheck:false` pass), real web-profile cold boot + mount proof, one functional chat-read path and one Remote success/error path.

## 3. Breaking touchpoints (4)

### TP-1 · Removed package `@deepseek-ai/dsh-client-runtime/client`
- **File/line**: src/client/index.ts:1 (`import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`); :9 (`apply(ctx: ClientContext)` uses that type).
- **Plane**: Web Client (plugin client half); packaging face (package.json).
- **Card**: **DSH-0.1.2-A1-25** (breaking, required-if-hit, touchpoints #3/#5). Exact type-composition mapping: API-10 in api-migration-0.1.2-alpha.2.md; dependency-ownership support: DSH-0.1.2-A2-03 field note.
- **Symptom on 0.1.2-alpha.2**: build/typecheck report a nonexistent module; with `skipLibCheck:true` and missing direct type deps, selectors/callbacks can silently degrade to `any`; at runtime the plugin can stay out of the boot graph without an explicit error.
- **Migration action**:
  1. Replace with `import type { Context as ClientContext } from '@deepseek-ai/cordis'` (A1-25 verified mapping row for `Context`/`ClientContext`).
  2. Compose remaining client facets per owning package with type-only imports, adding only what is actually consumed after TP-3/TP-4 fixes (here: ui-chat for chat reads, `@deepseek-ai/dsh-api-remotes/client` for the Remote projection) — API-10 "Type composition and dependency ownership".
  3. Declare every declaration-owning package as a direct dev/peer dependency. The fixture declares **no dependencies at all** (package.json:1–7); do not add/keep `dsh-client-runtime` anywhere. While the 0.1.2 cohort is unpublished, point type deps at the source checkout via `link:` or tarball `overrides` per rollup R-01 (A1-25 recipe).
  4. `dsh.client.inject` cleanup sub-action is **vacuous here**: the manifest has no `inject` array (package.json:6), so there is no runtime phantom row to remove.
  5. Run one diagnostic typecheck with `skipLibCheck:false`; any new implicit `any` is a migration failure (A2-03 field note; precision-checklist).
- **Verification** (per card): no leftover `dsh-client-runtime` imports; cold boot shows the plugin in the boot graph with no pending rows.

### TP-2 · `__ModuleLoader__.load` registration id ≠ package.json name
- **File/line**: src/client/index.ts:5 (`declare const __ModuleLoader__`), :10 (`__ModuleLoader__.load('pet-legacy-bundle', …)` — the source comment itself admits "legacy bundle id, not package name"); baseline name at package.json:2 (`"name": "dsh-pet-session-bench"`).
- **Plane**: Web Client (client bundle registration); profile-composition face (assembly row).
- **Card**: **DSH-0.1.2-A1-26** (breaking, required-if-hit, touchpoint #5) — 0.1.2's boot manifest keys entries/modules/registrations by package name (`Entry name == package name`).
- **Symptom**: startup assertion `loaded without registering "pet-legacy-bundle"`; or silently — panel disappears, plugin absent from the boot graph, no plugin-related error in logs.
- **Migration action**:
  1. Set the client bundle's registration id to the bare package.json name `dsh-pet-session-bench` (in a real build this id is usually injected by the tsdown banner `PLUGIN_ID`).
  2. Ensure the assembly row (the plugin's own cordis.patch.yml or the home patch) uses the bare scoped package name; the 0.1.1 `file:///` literal-path + short-name form silently keeps the client half out of the graph and must be replaced.
  3. Check row names and absence of pending via `dsh --profile <name> --dump-config`.
- **Unconfirmed**: the fixture ships no composition file and no build config, so items 2–3 of the three-id agreement cannot be verified from the fixture; they must be checked in the real repository/profile.
- **Verification** (per card): `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"`; the combo route `/plugins/??dsh-pet-session-bench/client.js&rev=…` artifact contains `__ModuleLoader__.load({ id: "dsh-pet-session-bench"`; no `loaded without registering` / `entries did not activate` at startup.

### TP-3 · Flat `useSession()` `nodes` snapshot → keyed chat snapshot
- **File/line**: src/client/index.ts:2 (`import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`), :12 (`const { nodes } = useSession()`), :13 (`nodes[0]`).
- **Plane**: Web Client.
- **Card**: **DSH-0.1.2-A1-27** (breaking, required-if-hit, touchpoint #3 — 0.1.2 no longer exposes per-session conversation-node snapshots); context: **DSH-0.1.2-A1-03** (session-view internals split; field notes record the flat `ConversationSnapshot` fields being affected and the `useSession`→`useChat` switch); exact alpha.2 mapping: API-10 (`useSession(session => session?.nodes)` → `useChat(chat => …)`; `ConversationSnapshot.nodes[]` → iterate `ChatSnapshot.order` + `nodes.get(id)`).
- **Symptom**: plugin loads but half-broken — `nodes` undefined/empty, factory errors in console; on alpha.2 `ChatSnapshot.nodes` is a **keyed store**, so array indexing `nodes[0]` yields undefined even where a snapshot arrives; without direct type deps the selector can silently become `any`.
- **Migration action**:
  1. Switch to the chat projection: `ctx.useChat(...)` (ui-chat), replacing flat reads with the ordered keyed read — `snapshot.order.flatMap(id => { const n = snapshot.nodes.get(id); return n ? [n] : [] })`; `nodes[0]` becomes the first id of `order` (API-10 minimal read shape).
  2. If the real intent is raw transcript/session-event reading rather than the chat view projection, the alpha.1+ seam is the SessionBinding durable event window: `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries`, types `SessionBinding`/`SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client` (A1-27 recipe).
  3. Do **not** adopt `snapshot.legacy.nodes` as the primary surface — staged dual-host compatibility only (API-10).
  4. Move the hook call into a React component/hook: calling `useSession()` inside `apply()` (index.ts:9–12) violates hook rules. This is a **pre-existing defect independent of the DSH version** (baseline observation, not attributed to the migration), but the rewrite to `useChat` must land inside the component (e.g. Pet) rather than in `apply`.
- **Verification** (per card/ledger): one real user message → plugin reads text consistent with the UI; empty/unknown sessions return null instead of throwing; client tests use the real keyed `order + nodes.get()` shape, not old array fixtures.

### TP-4 · Removed `ctx.connection.api` face (`agentPresets.list`)
- **File/line**: src/client/index.ts:11 (`ctx.connection.api.agentPresets.list()` — source comment: "legacy connection.api face"); related: index.ts:7 (`export const inject = ['slots', 'conversation']`).
- **Plane**: Web Client.
- **Card**: **DSH-0.1.2-A1-30** (breaking, required-if-hit, touchpoint #3 — the old apiProxy mirror face on `ctx.connection` was removed entirely in alpha.1). Successor method mapping confirmed by **DSH-0.1.2-A1-01** table (`agentPreset.list/select` → `agentPresets/list` / `agentPresets/select`) and the API-01 Web Client consumer ledger; alpha.2 result/error shape per **DSH-0.1.2-A2-02**.
- **Symptom**: client calls throw; if a catch swallows the error the UI renders "forever blank" — a no-crash smoke cannot catch it (A1-30).
- **Migration action**:
  1. Rewrite to the generated client Remote projection: `const result = await ctx.remote.agentPresets.list()` — do not hand-write wire namespace/method strings; obtain the generated type mounts via `@deepseek-ai/dsh-api-remotes/client` (A1-01 recipe).
  2. Handle the alpha.2 failure vocabulary: unary calls resolve to `RemoteResult<T>`; branch on `result.ok`, then `result.error.code` — codes are namespaced on alpha.2 (e.g. `agent-preset/not-found`, `gateway/internal`, `gateway/cancelled`); `error` is a `RemoteError` instance; use `isRemoteFailure` only at explicit catch boundaries, never `instanceof` across realms; no default retry (A2-02).
  3. Extend `export const inject` (index.ts:7) with `'remote'` and `'remote.agentPresets'` (API-01 best practice #3 — declare the Remote contributions actually used; do not rely on another plugin having mounted first). Keep `'slots'`/`'conversation'` only if still consumed after the TP-3 rewrite.
  4. `connection` is not in the current inject list, so there is no dead face to remove — and it must not be re-added (A1-30: leave no dead face).
  5. **Unconfirmed (signature detail)**: the *method name* `agentPresets.list` is card-confirmed (A1-01 table); its exact generated signature/return type at tag `dsh-v0.1.2-alpha.2` must be re-checked against the target tag's generated declarations before coding — cards give direction, never invent interfaces.
- **Verification** (per cards): cover success, one business error code, and cancellation for the hit call; with the route deliberately broken, the UI shows an error state rather than blank.

## 4. Related non-breaking cards that shape the migration

- **DSH-0.1.2-A1-01** — source of the agentPresets mapping; also the plane rule: `ctx.remote` exists only on the client face. This plugin declares `dsh.client` (package.json:6), so the Web Client consumer table applies and the Host-side "inject the domain service directly" rule does not.
- **DSH-0.1.2-A1-03** — session-view internals split; public snapshot consumption surface affected (field notes).
- **DSH-0.1.2-A2-02** — post-migration Remote error handling contract on alpha.2 (`RemoteError`, namespaced codes).
- **DSH-0.1.2-A2-03** — dependency-ownership direction (declaring consumed declaration owners as direct dev/peer deps; `skipLibCheck:false` diagnostic).
- **DSH-0.1.2-A1-19** — informational for acceptance: web plugin acceptance reads the host boot manifest and the auth URL (token→cookie→boot→mount chain), used in the validation plan only.

## 5. Non-hit cards (full-corridor scan evidence)

All 36 cards across both corridor edges were checked against the fixture. Not hit — **alpha.1** (24): A1-02 (no custom persisted SessionEvents), A1-04 (no ACP/SDK demo bins), A1-05 (no headless wrapper), A1-06 (no Code-Mode vocabulary; same for CFG-01), A1-07 (no WebFetch/approval use), A1-08 (no direct channel/auth code), A1-09 / A1-10 / A1-11 (capability cards — suggestions only, not adopted automatically), A1-12 (no adapter metadata use), A1-13 (no shell/directory-picker workarounds), A1-14 (no session-log upload surface), A1-20 (no `userQuestions`), A1-21 (no `resolveSessionPreset`/host presets), A1-22 (no `isTokenDelta`), A1-23 (no telemetry config surface), A1-24 (no direct pi-ai dependency), A1-28 (no composer DOM manipulation), A1-29 (no `MarkdownText` usage), A1-31 (no subagent descriptor assertions), A1-32 (no `ctx.workspaces` navigation / `baselinesReady` / `recentWorkspaceId`). **alpha.2** (7): A2-01 (no `ignorable` event production), A2-04 (no Node 24.0–24.11.1 loader workaround), A2-05 (does not consume `pluginInventory/list`), A2-06 (no `host.describe` usage), A2-08 (`sessionProjections` peers/inject not applicable — this client plugin injects only `['slots','conversation']` and peers none of the listed tool packages), A2-10 (no `settingsNamespace`/host settings seam).

## 6. Unconfirmed items (explicitly marked, not guessed)

1. **Dependency cohort**: package.json declares no dependencies/devDependencies and the fixture has no lockfile — the declared/resolved DSH dependency cohort cannot be recorded from the fixture.
2. **Composition/assembly row**: no cordis.patch.yml or build config in the fixture — A1-26's three-id agreement (registration id / assembly row name / package name) is only verifiable for id #1 here; items #2–#3 pending the real repository/profile.
3. **`agentPresets.list` generated signature** at dsh-v0.1.2-alpha.2 — method name card-confirmed (A1-01), exact signature unconfirmed (must re-check target-tag declarations).
4. **Git provenance**: not inspected (git operations prohibited in this cell); source identity is the static fixture copy only.

## 7. Recommended validation plan (for the eventual migration; nothing executed here)

Per the skill's layered validation: (1) dependency resolution — lockfile scan for old cohort and `dsh-client-runtime` residues; (2) enablement resolution — `--dump-config` row names, no pending; (3) static — build/typecheck plus one `skipLibCheck:false` pass and the alpha.2 precision-checklist; (4) runtime — real web-profile cold boot, boot-manifest entry id == package name, combo artifact carries the matching `__ModuleLoader__.load` id, token→cookie→mount proof rather than a bare HTTP 200 (A1-19); (5) behavior — one user message read back consistently through the keyed chat snapshot, one `agentPresets.list` success + one error-code path; (6) wrapper — N/A (no subprocess surface).

## 8. Read-only discipline statement

- `/app/fixture/` touched only by read operations (all 4 files read in full); zero writes, zero byte changes.
- All writes confined to `/app/agent-output/S4-legacy-client-imports/`; no temp files elsewhere; no dependency installation, no build, no reproduction environment, no migration performed, no git operations, no external network access.
- Card references above are ID + key points only; no full card text reproduced.

**Sources**: fixture files (paths/lines cited inline); skill references — README.md (corridor index), v0.1.2-alpha.1.md (DSH-0.1.2-A1-01/-03/-19/-25/-26/-27/-30/-32), v0.1.2-alpha.2.md (DSH-0.1.2-A2-02/-03/-08), api-migration-0.1.2-alpha.2.md (One-Page Conclusion, API-01, API-10), pre-flight.md (seven-class template). Cards themselves pin tag-anchored primary sources (dsh-v0.1.1-rc.2 / dsh-v0.1.2-alpha.1 / dsh-v0.1.2-alpha.2); those upstream URLs were **not** re-fetched in this read-only cell — card-file citations are the source of record here.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.