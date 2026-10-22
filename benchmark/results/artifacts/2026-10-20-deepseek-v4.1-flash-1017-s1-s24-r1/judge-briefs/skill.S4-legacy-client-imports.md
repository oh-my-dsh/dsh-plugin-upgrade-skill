# JUDGE BRIEF · skill.S4-legacy-client-imports

## Criteria (sealed rubric)
- [runtime-removal] (25pt) Locate the old ClientContext import, identify Web Client/plugin impact and A1-25, and require removing the deleted-package import in favor of a supported target owning package. A direction such as importing Context from its actual target owning package with the needed type augmentation is sufficient; the fixture does not establish the exact package name. Type erasure does not make a removed type package harmless. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [registration-id] (25pt) Compare the actual pet-legacy-bundle loader ID with package.json name dsh-pet-session-bench, map A1-26 and require exact name alignment and client activation verification.
- [session-content] (25pt) Locate useSession/nodes, map A1-27 and require replacing the removed flat content access with a supported target content-reading surface, preserving ordering. Chat/durable windows or public selectors are supported directions; exact hook/store names such as useChat plus order/nodes.get are not mandatory when unavailable in the fixture. Do not positively claim that the old flat useSession nodes API remains supported. Pet.tsx is empty and has no breaking surface. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.
- [connection-face] (25pt) Locate connection.api.agentPresets.list, map A1-30 and require removing that deleted face in favor of a verified public target interface for the operation. Remote/public domain APIs are supported directions, but the exact successor name is not mandatory when unavailable in the fixture. Respect the closed-book task: exact successor package names, symbols or signatures absent from the fixture are not mandatory for full credit. Accept a correct located diagnosis, card and defensible migration direction with unavailable details marked unconfirmed or deferred to the actual target owners/exports. Use the sealed references to check asserted details, not to require unseen names. Uncertainty alone without the diagnosis and migration direction earns no credit; positively invented replacements still lose credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invented-migration] ceiling=70 Apply ONLY if the report positively asserts an unsupported lifecycle replacement (apply to setup/activate) or that service inject generally must move into a manifest. Explicitly rejecting these claims, or legitimate cleanup of the deleted package from client.inject, does NOT trigger this cap.

## Candidate report(s)
#### FILE: S4-legacy-client-imports/S4-legacy-client-imports.md

# S4 · Legacy Client Runtime Touchpoints — Migration Touchpoint Report

**Mode**: read-only static inspection (skill `plugin-upgrade`, Mode A / Mode C analysis, static copy — nothing executed)
**Source under analysis**: `/app/fixture/` → local `...\S4-legacy-client-imports\fixture` (4 files, unmodified)
**Corridor**: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (two carded edges, no unsupported gap)
**Card ID space**: `DSH-0.1.2-A1-*` (rc.2→alpha.1, 28 cards) and `DSH-0.1.2-A2-*` (alpha.1→alpha.2, 8 cards)
**Verdict**: 4 breaking touchpoints + 1 packaging consequence. All four break on `0.1.2-alpha.2`; none is fixable by a version bump alone.

---

## 1. Scan scope and source identity

| Item | Value |
|---|---|
| Files scanned | `README.md`, `package.json`, `src/client/index.ts`, `src/client/Pet.tsx` (4/4, complete) |
| Plugin package name | `dsh-pet-session-bench` (`package.json:2`), version `0.1.0` |
| Declared client manifest | `dsh.client.platform = "web"` (`package.json:6`) |
| Declared DSH dependencies | **none** — no `dependencies` / `devDependencies` / `peerDependencies` / `engines` at all |
| Lockfile / build config / tsconfig / `cordis.patch.yml` / `dsh-plugin.json` | absent from the fixture |
| Declared `@deepseek-ai/*` imports | `dsh-client-runtime/client` (`index.ts:1`), `dsh-client-ui-chat/client` (`index.ts:2`) |

**Evidence limitation (declared, not papered over)**: the source pins no DSH cohort and ships no lockfile, so the `from` side (`0.1.1-rc.2`) is taken from the fixture README and the brief, **not** from a resolved dependency graph. Per-file "compiles on rc.2" is therefore **unconfirmed**; what is confirmed is that every construct below is the rc.2-era form and that the alpha.2 card set declares it broken.

**Net-state folding before action** (corridor read first, then acted on): `DSH-0.1.2-A1-02` (rc.2→alpha.1 removed `SessionEvent.ignorable`) is reverted by `DSH-0.1.2-A2-01` (alpha.2 restores it) → **net zero action**, and the fixture writes no SessionEvents anyway. Nothing else in the corridor is removed-then-restored, so no other delete-then-re-add trap applies.

---

## 2. Touchpoint inventory (summary)

| ID | File:line | Affected plane | Card | Change type / action level | One-line break |
|---|---|---|---|---|---|
| T1 | `src/client/index.ts:1` | Web Client (type plane) + plugin packaging | **`DSH-0.1.2-A1-25`** | breaking · required-if-hit | `@deepseek-ai/dsh-client-runtime/client` no longer exists; `ClientContext` has no owner |
| T2 | `src/client/index.ts:5,10` | Web Client (boot/registration) + plugin bundle | **`DSH-0.1.2-A1-26`** | breaking · required-if-hit | registration id `pet-legacy-bundle` ≠ package name `dsh-pet-session-bench` |
| T3 | `src/client/index.ts:2,12-13` | Web Client (transcript read) | **`DSH-0.1.2-A1-27`** (support: A1-03, API-10) | breaking · required-if-hit | flat `useSession().nodes` array is gone; snapshots are keyed |
| T4 | `src/client/index.ts:11` (+ `:7`) | Web Client consumer → Host Remote | **`DSH-0.1.2-A1-30`** (support: A1-01, A2-02) | breaking · required-if-hit | `ctx.connection.api` face removed entirely; successor is `ctx.remote.*` |
| P1 | `package.json:1-7` | plugin (packaging) | derived from **A1-25** + **`DSH-0.1.2-A2-03`** | required consequence of T1/T3 | removed package still imported; no direct dependency owns the new imports |

No card below is invented: each row cites an existing card ID from the two corridor files; supporting IDs are listed separately from the primary card so the mapping stays auditable.

---

## 3. T1 · Removed client runtime package (`DSH-0.1.2-A1-25`)

- **Current evidence**: `src/client/index.ts:1` — `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`; `ClientContext` is then the type of `apply(ctx)` at `:9`.
- **Old form**: type import from the aggregating client runtime package (also the roster package rc.2 listed in `dsh.client.inject`).
- **How it breaks**: the package was deleted in alpha.1 and is still absent in alpha.2 (`DSH-0.1.2-A1-25`; re-confirmed across the whole corridor by API-10 in `api-migration-0.1.2-alpha.2.md`). Static: TS2307 "cannot find module" / TS2305 missing export. Runtime: even after a type-only workaround, a phantom runtime entry in `dsh.client.inject` keeps the assembly row out of the boot graph or pending forever, often with no error.
- **Migration action**:
  1. Replace with the owning package: `import type { Context as ClientContext } from '@deepseek-ai/cordis'`.
  2. Add type-only augmentations **only for the facets actually used** (per A1-25 / API-10): `@deepseek-ai/dsh-client-ui-chat/client` (chat slot contract) and, if session facets are read, `@deepseek-ai/dsh-api-session-controller/client`.
  3. Remove `@deepseek-ai/dsh-client-runtime` from every place it can appear — the fixture's `package.json` has no `dsh.client.inject`, so there is nothing to delete there, but the removal must not be re-introduced when the roster is written; only packages that actually provide services belong in `dsh.client.inject`.
  4. Keep host-only packages out of the client bundle.
- **Best practice**: one owner per declaration; the plugin's own `devDependencies`/`peerDependencies` must name every package whose declarations it consumes (see P1). Do not substitute `any` for the lost `ClientContext` — that silently turns selectors/callbacks into implicit `any` (API-10, type composition).
- **Verification (for the real migration, not run here)**: typecheck has zero `dsh-client-runtime` references; one `tsc --skipLibCheck false` pass shows no missing declaration chain and no new implicit `any`; cold boot shows no pending row for this plugin.
- **Sources**: card `DSH-0.1.2-A1-25` (alpha.1 release notes; alpha.1 `packages/client` tree; `dsh-client-store` and session-controller client exports) · API-10 in `api-migration-0.1.2-alpha.2.md` ("Exact mapping" + "Type composition and dependency ownership") · `references/pre-flight.md` classes #3/#5.

---

## 4. T2 · Registration id ≠ package name (`DSH-0.1.2-A1-26`)

- **Current evidence**: `src/client/index.ts:5` declares the loader global; `:10` calls `__ModuleLoader__.load('pet-legacy-bundle', …)` while `package.json:2` names the package `dsh-pet-session-bench`. The inline comment on `:10` states the id is a "legacy bundle id, not package name" — the mismatch is intentional and is exactly the break.
- **Old form**: `__ModuleLoader__.load(<short/legacy bundle id>, fn)`, id supplied by a banner/`PLUGIN_ID` that is not the package name.
- **How it breaks**: 0.1.2's client-modules scan keys boot-manifest entries, modules and plugin registrations by **package name** ("Entry name == package name"). Mismatch either raises the startup assertion `loaded without registering "<id>"` **or** fails silently: the bundle is fetched, the panel disappears, the boot graph lacks the plugin, and logs contain no plugin-related error.
- **Migration action** (three ids must agree, `package.json` `name` as the baseline):
  1. registration id → `'dsh-pet-session-bench'`, or inject it at build time from `package.json#name` instead of hardcoding;
  2. the assembly row in the plugin's own `cordis.patch.yml` (or the home patch) must use the bare package name, scoped form included — the fixture ships **no** composition file, so this item is **unconfirmed / not evaluable here** and must be checked in the real repository;
  3. the hand-written `declare const __ModuleLoader__` at `:5` is a local ambient stand-in; keep it only if the build genuinely provides no global typing (**unconfirmed** whether alpha.2 ships one — resolve at the target tag, do not guess).
- **Best practice**: never derive the id from a filename, directory or short name; make the bundle banner read the manifest so the three ids cannot drift again. Verify through the host-advertised resource URL rather than constructing `/plugins/<id>/client.js` yourself (`DSH-0.1.2-A1-19`).
- **Verification**: `window.__DSH_BOOT__.entries` contains `"id":"dsh-pet-session-bench"`; the fetched combo artifact contains the load call with the same id; startup log has neither `loaded without registering` nor `entries did not activate`; a DOM marker owned by the plugin appears. A bare HTTP 200 proves none of this (A1-19).
- **Sources**: card `DSH-0.1.2-A1-26` (`packages/client/modules/src/client/system.ts` registration assertion; `manifest.ts` "Entry name == package name"; `__DSH_BOOT__` injection) · `DSH-0.1.2-A1-19` (boot-manifest acceptance) · pre-flight class #5.

---

## 5. T3 · Flat `useSession().nodes` transcript read (`DSH-0.1.2-A1-27`)

- **Current evidence**: `src/client/index.ts:2` imports `useSession` from `@deepseek-ai/dsh-client-ui-chat/client`; `:12` calls `useSession()` with no selector and `:12-13` destructures `{ nodes }` and reads `nodes[0]` positionally.
- **Old form**: one flat `ConversationNode[]` snapshot obtained from the session seat, indexed by position.
- **How it breaks**: 0.1.2 stopped exposing per-session conversation-node snapshots as an array — the timeline became an internal projection of each view package (`DSH-0.1.2-A1-27`, supported by `DSH-0.1.2-A1-03`). Per API-10 the alpha.2 shape is a **keyed store**: `ChatSnapshot.order` (ids) + `ChatSnapshot.nodes.get(id)`; the hook-level mapping is `useSession(session => session?.nodes)` → `useChat(chat => …)`. Symptom: the plugin loads, then half its functionality is dead — `nodes` undefined/empty plus factory errors in the console; positional `nodes[0]` yields nothing even where a store exists.
- **Migration action** (alpha.2-only shape; no dual-host requirement is stated for this fixture):
  1. Read through `ctx.useChat(chat => …)` and iterate `snapshot.order`, resolving each id with `snapshot.nodes.get(id)`, skipping missing ids.
  2. If the real intent is *content* (user messages / history) rather than rendered nodes, use the gap card A1-27 prescribes: `sessions.binding(id)` → `binding.eventSource.getSnapshot().entries` (`user/message` → its `data.content` text blocks), pulling scoped services via `binding.ctx.get(…)`; import `SessionBinding` / `SessionEventLikeEntry` from `@deepseek-ai/dsh-api-session-controller/client`.
  3. For an assistant step's finished node, narrow by discriminant `type === 'assistant-step'` and read `data.finalNode`.
  4. `snapshot.legacy.nodes` is a staged dual-host compatibility projection only — not the primary surface for an alpha.2-only plugin.
  5. **Unconfirmed**: whether the `useSession` export itself is fully removed at alpha.2 (the corpus confirms `useChat` exists in the `ui-chat/client` contract but does not state `useSession`'s absence). The **shape** break is confirmed; the export-level statement must be checked against the target tag's `ui-chat` `slots.ts` before editing.
- **Best practice**: never index a snapshot array by position; treat a missing id as a normal case; keep snapshot reads inside the hook selector and do not cache a mutable snapshot object across renders.
- **Verification**: send one user message in a real session — the plugin reads text matching the UI; empty/unknown sessions return null or an empty list instead of throwing; client tests build a real `ChatNodeStore` (`order` + keyed `get`) and cover a missing id and the assistant final node; no `as unknown as ChatSnapshot` cast hiding an old array fixture.
- **Sources**: card `DSH-0.1.2-A1-27` (SessionBinding definition; SessionEventLikeEntry contract; alpha.1 release notes) · `DSH-0.1.2-A1-03` (session-view split and the legacy projection field note) · API-10 (`ChatSnapshot`/`ChatNodeStore`, `useChat` mapping; `packages/client/ui-chat/src/client/contract/snapshot.ts`) · pre-flight class #5.

---

## 6. T4 · Removed `ctx.connection.api` face (`DSH-0.1.2-A1-30`)

- **Current evidence**: `src/client/index.ts:11` — `ctx.connection.api.agentPresets.list().then(presets => …)`. Note `inject` at `:7` is `['slots', 'conversation']` — `connection` was never declared, so the coupling was already implicit.
- **Old form**: client-side apiProxy mirror on the connection service; `agentPreset.list` consumed as a promise resolving to a list.
- **How it breaks**: alpha.1 removed the mirror face (`DSH-0.1.2-A1-30`: only protocol types are re-exported); the call throws at runtime while typechecking may stay green. The successor is the generated `ctx.remote.*` projection (`DSH-0.1.2-A1-01` table maps `agentPreset.list/select` → `agentPresets/list` / `agentPresets/select`). Two extra traps: unary Remotes resolve to `RemoteResult<T>` and do **not** reject on business failure, so `.then(presets => …)` would hand the callback the wrapper object and, if the site swallows errors, the UI renders "forever blank" instead of an error (A1-30 field note); and in alpha.2 the failure is a `RemoteError` with namespaced codes (`agent-preset/not-found`, `gateway/cancelled`, `gateway/internal`, …) — old unprefixed codes and `instanceof` no longer match (`DSH-0.1.2-A2-02`).
- **Migration action**:
  1. Declare the projection: `export const inject = ['slots', 'conversation', 'remote', 'remote.agentPresets']` — the namespace actually used must be listed; do not rely on another plugin having mounted first.
  2. Rewrite as `const result = await ctx.remote.agentPresets.list()`, branch on `result.ok` first, then on `result.error.code`; keep code/details for unknown codes; `gateway/cancelled` terminates or propagates cancellation, `gateway/internal` is not retried by default.
  3. Import the failure vocabulary from the owning packages: `RemoteError` / `RemoteResult` from `@deepseek-ai/dsh-typert-protocol`, `isRemoteFailure` from `@deepseek-ai/dsh-api-gateway/client` — only at a catch boundary where a RemoteError was explicitly thrown; never `instanceof`.
  4. If preset selection/copy is needed later, follow the A1-01 table (`read` / `copy(from, id, name?)` / `deletePreset(id)` — object argument became a string); the exact argument shape of `list` must be taken from the generated declaration at the target tag (**unconfirmed** here: the corpus confirms the method path, not its full signature).
  5. Remove the dead face: no `connection` in `inject`, no `ctx.connection` type mirror left behind.
  6. Do not "fix" this by injecting `remote` on a host-plane consumer — `remote` only exists on the client plane (A1-01 field note: host-side pending-forever symptom).
- **Best practice**: one face per plane; the migration must not leave a caught-and-ignored call path, since that converts a hard failure into a permanently blank UI that a "no crash" smoke cannot detect.
- **Verification**: success branch (list renders), one business failure code (`agent-preset/not-found`), `gateway/cancelled`, `gateway/internal` (no auto-retry); a deliberately broken route surfaces an error state rather than blank; real cold boot shows no pending `remote` / `remote.agentPresets`.
- **Sources**: cards `DSH-0.1.2-A1-30` (alpha.1 `connection/src/client/api.ts`; APIProxy→Remote note) · `DSH-0.1.2-A1-01` (AgentPreset row of the APIProxy→Remote table) · `DSH-0.1.2-A2-02` (RemoteError, namespaced codes, `isRemoteFailure`) · API-01 + API-02 in `api-migration-0.1.2-alpha.2.md` · pre-flight class #3.

---

## 7. P1 · Packaging consequence (A1-25 cleanup clause + `DSH-0.1.2-A2-03`)

- **Current evidence**: `package.json:1-7` declares no `dependencies`, `devDependencies`, `peerDependencies` or `engines`, yet the source imports two `@deepseek-ai/*` packages.
- **Why it breaks with T1/T3**: the only package that could have justified the imports is the removed runtime; after T1 the imports are owned by `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-chat/client` (and `dsh-api-session-controller/client` if the binding path is used). A published package's devDependencies are not installed for consumers, so those owners must be this plugin's own direct dev/peer dependencies; alpha.2 both prunes and adds peers (A2-03 / A2-08), so the cohort must be pinned exactly rather than left floating.
- **Migration action**: add the owning packages as direct dev/peer dependencies at the exact alpha.2 cohort; keep the plugin's own version separate from the DSH host version; do not mix package managers when a lockfile exists (none here — **unconfirmed** which manager the real repo uses, so this stays a plan item, not an assertion).
- **Verification**: install + `skipLibCheck: false` typecheck clean; lockfile contains no old cohort and no `dsh-client-runtime`; packed artifact carries the plugin's own version.
- **Sources**: `DSH-0.1.2-A1-25` (package.json cleanup) · `DSH-0.1.2-A2-03` (peer trim/add, type-dependency ownership field note) · API-10 type composition.

---

## 8. Seven-class touchpoint checkup (`pre-flight.md` template)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch / monkey patch | 0 | — | — | No `patch.yml`, `patchedDependencies`, `patch-package`, host-source replacement or `DSH_HARNESS_SOURCE_ROOT` in the 4 files. The `dsh` key in `package.json` is a plugin manifest, not composition (API-08). |
| #2 events / persistent events | 0 | — | A1-02/A2-01 net-zero | No `ctx.on`, `SessionEvent`, `subscribe`, custom event names, `tool/code-dispatch`, `connection/reset`; no producer/persistence role. |
| #3 services / Remote | **2** | `index.ts:1`, `index.ts:11` | A1-25 (T1); A1-30 + A1-01 + A2-02 (T4) | Faces recorded: `:1` is the client type plane, `:11` is a Web Client consumer of a Host Remote. |
| #4 host filesystem | 0 | — | — | No `fs`, `DSH_HOME`, `.dsh`, `profiles`, `homedir`, `readFile`/`writeFile`/`openPath`. |
| #5 UI / commands / tools | **3** | `index.ts:5,10` (T2); `index.ts:2,12-13` (T3); `index.ts:7` (T4 inject) | A1-26; A1-27 (+A1-03); A1-30 | `__ModuleLoader__` at `:5,10`; `useSession` at `:2,12`; `inject` lacks the remote namespaces T4 needs. |
| #6 custom HTTP/WS/RPC/DOM/CSS | 0 | — | A1-08/A1-28 not hit in source | No `fetch`, `WebSocket`, `createServer`, route registration, `MutationObserver`, `insertRule`, `textarea`/`setSelectionRange`/`contenteditable`, `data-input-scroll`. |
| #7 subprocess / stdout / stderr | 0 | — | — | No `child_process`, `spawn`, `exec*`, `headless`, `--profile`, `DSH_HOME`. |

**No-hit notes**: scan covered the complete fixture (4 files; no node_modules, build output, tests or CI). Dependency/configuration inventory checked separately in §1/§7.

**Must verify (not executed — static copy)**: `tsc --skipLibCheck false` + build; real profile cold boot through `dsh web` token→Cookie; boot entry + advertised resource + registration under the package name; one real transcript read and one `agentPresets` round-trip.

---

## 9. Skipped cards and why (evidence per card, not "no action" by default)

**Not hit — no matching construct in the fixture**: A1-04 / A1-05 / A1-13 (no CLI, headless wrapper, shell or directory-picker workaround) · A1-06 (no `tools.mode`, `code` preset or `CodeDispatch*`) · A1-07 (no approval/WebFetch policy) · A1-08 / A1-19 (**source plane** not hit: no custom route, no acceptance script; both remain applicable as *verification method* for T2) · A1-09 / A1-10 / A1-11 (capabilities, not adopted) · A1-12 / A1-14 / A1-23 (privacy/composition surfaces; no profile or egress code) · A1-20 (no `userQuestions.registerProvider`) · A1-21 (no `resolveSessionPreset`; the `agentPresets` at `:11` is the Remote face, not the preset-resolution export) · A1-22 (no `isTokenDelta`) · A1-24 (no `@earendil-works/pi-ai`) · A1-28 (**no** `<textarea>` or `setSelectionRange`; `Pet.tsx:1` renders nothing) · A1-29 (no `MarkdownText`/`codeLabels`) · A1-31 (no subagent descriptor) · A1-32 (no `ctx.workspaces`, `connectWorkspace`, `pickDirectory`, `baselinesReady`) · A2-01 (net-zero with A1-02; no producer) · A2-04 (**environment** concern only: Node 24.0–24.11.1 empty client graph — matters for T2's verification host, not this source) · A2-05 / A2-06 / A2-08 / A2-10 (host-plane inventory, `@host` facts, self-composed profiles, settings namespace — no host code here).

**Deliberately not treated as separate hits**: A1-03 is real but is the *cause* behind T3 rather than a second edit site; A2-03 supports P1 rather than standing as its own touchpoint.

---

## 10. Unconfirmed items (explicitly not guessed)

1. `0.1.1-rc.2` as the exact source tag is declared by the brief/README only — the fixture has no lockfile or resolved DSH version.
2. Whether `useSession` is removed or merely superseded at alpha.2 (`useChat` is confirmed; the export-level statement is not).
3. The exact generated signature/arguments of `agentPresets/list` at alpha.2 (path confirmed; full parameter shape not).
4. Whether alpha.2 provides a global typing for `__ModuleLoader__` (the local `declare const` may or may not be redundant).
5. The assembly row name in the plugin's own composition file: **no** `cordis.patch.yml` / profile row exists in the fixture, so A1-26 item 2 cannot be evaluated here.
6. The real repository's package manager, tsconfig and build-banner mechanism (none present).
7. `inject: ['slots', 'conversation']` was checked and **not** filed as a break: both service names still occur at alpha.2 in the corpus (A1-27 uses `binding.ctx.get('conversation')`; `slots` underlies the slot contract). Whether `conversation` is session-scoped such that a root-level inject stays pending is **unconfirmed** and must be observed on a real boot, not assumed.

---

## 11. Recommended migration order

1. **P1 + T1** first — without a compiling type plane nothing else can be judged; delete every `dsh-client-runtime` reference and add the owning packages.
2. **T2** — align the three ids before any runtime check, otherwise the client half never enters the boot graph and later results are meaningless.
3. **T3 / T4** — independent behavioural rewrites; change T4's `inject` together with its call-site rewrite so no dead face remains.
4. Re-run the ladder: static (typecheck/build) → enablement (`--dump-config`, no pending) → artifact (boot entry, advertised resource, mount) → behaviour (one transcript read, one `agentPresets` call including its failure branch).

## 12. Read-only discipline (what was and was not done)

- Only the fixture (4 files) and the skill's `SKILL.md` + `references/` were read. No tests/solution directories, no other repository content.
- No file under `fixture/` was written, moved, renamed or reformatted; no build, install, package-manager, git, network or code-execution command was run against the plugin source. The analysis is static reading plus the skill's card corpus.
- Baseline hashes recorded at scan time (unchanged at report time):

| File | Bytes | SHA-256 |
|---|---:|---|
| `README.md` | 729 | `4dc7a7c599d9fa440f4a98f7a31f907cf72bfbc5210e9491cbeb6e4714365ecb` |
| `package.json` | 145 | `ffd9e5ccaab6dd032995df4dff93403c5c58bf7cc60d2e98dd0b637e23c76142` |
| `src/client/index.ts` | 608 | `98183cf3d7455ccd3b23b128e7911307795c7f3f3bfdcec5625ea1849807a063` |
| `src/client/Pet.tsx` | 25 | `037f6c3b5dd30b8db5674de69b803f8877f2c07450282f7d2c402a01b099bd27` |

## 13. Card index used

| Card | Role in this report |
|---|---|
| `DSH-0.1.2-A1-25` | T1 primary; P1 |
| `DSH-0.1.2-A1-26` | T2 primary |
| `DSH-0.1.2-A1-27` | T3 primary |
| `DSH-0.1.2-A1-30` | T4 primary |
| `DSH-0.1.2-A1-01` | T4 method mapping (`agentPreset.list` → `agentPresets/list`) |
| `DSH-0.1.2-A1-03` | T3 supporting (session-view split / legacy projection) |
| `DSH-0.1.2-A2-02` | T4 failure vocabulary (`RemoteError`, namespaced codes) |
| `DSH-0.1.2-A2-03` | P1 packaging (peer trim/add, declaration ownership) |
| `DSH-0.1.2-A1-19` | T2 verification method (boot manifest / advertised resources) |
| `DSH-0.1.2-A2-04` | T2 verification environment (Node 24.0–24.11.1 empty graph) |
| `DSH-0.1.2-A1-02` + `DSH-0.1.2-A2-01` | Corridor net-state folding (removed then restored → no action) |
| API-10 / API-01 / API-02 (ledger) | Exact interface mapping inside the alpha.2 corridor |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.