# S1 · Static Touchpoint Scan Report — legacy-plugin (0.1.1 era → dsh 0.1.2-alpha.2)

Read-only static scan performed per the plugin-upgrade skill (Mode A · inspect). No file under the
fixture was modified, created, deleted, or renamed; no migration, installation, or execution was
performed. The fixture is explicitly non-executable by design.

Path note: the brief names `/app/fixture/` and `/app/agent-output/`; in this environment the
read-only fixture actually lives at
E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S1-static-scan\environment\fixture
(hereafter "fixture") and the report was written to the designated output directory
E:\deepseek-harness\test-lhh010\benchmark-runs\glm-5.3-r3\skill\S1-static-scan\report.md.

## 0. Configuration and dependency inventory (pre-flight step 0)

Files scanned (complete fixture tree, 6 files — nothing excluded; there is no vendor/, node_modules/,
CI, or generated artifact in the fixture):

- fixture\package.json — name `legacy-plugin`, version 0.1.1, private, type module. **No
  peerDependencies, no engines, no lockfile, no `dsh-plugin.json` manifest.** The only script is
  `apply-patch: node scripts/apply-patch.mjs`.
- fixture\cordis.patch.yml — profile composition row for `legacy-plugin` with `patch: [patch.yml]`.
- fixture\patch.yml — patch-surface declaration (see touchpoint #1).
- fixture\scripts\apply-patch.mjs — patch runner + headless subprocess wrapper (see #1/#7).
- fixture\src\index.ts — the plugin body carrying touchpoints #2–#7.
- fixture\README.md — fixture documentation (not plugin source).

Notable: `src/index.ts` imports `@deepseek-ai/dsh-session-view/internal` but package.json declares no
dependency on it at all — an undeclared internal import even before any host upgrade is considered.

## 1. Version corridor used

From/to: dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2 ("0.1.1 era" source, target alpha.2). Edges connected
by the from→to index in the skill's references/README.md (never filename order):

- edge 2: v0.1.2-alpha.1.md (rc.2 → alpha.1, 28 cards, prefix DSH-0.1.2-A1)
- edge 3: v0.1.2-alpha.2.md (alpha.1 → alpha.2, 8 cards, prefix DSH-0.1.2-A2), corroborated by
  api-migration-0.1.2-alpha.2.md where API surfaces are hit.

Corridor folding applied (required by the task): `SessionEvent.ignorable` is removed in alpha.1
(DSH-0.1.2-A1-02) and restored in alpha.2 (DSH-0.1.2-A2-01). Because the final target is alpha.2,
the **net state is "retained"** — the migration plan must NOT delete the producer marker, and must
not plan a delete-then-re-add cycle. Details under touchpoint #2.

## Touchpoint checkup (legacy-plugin, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch | YES | patch.yml:2-5; cordis.patch.yml:1-6; scripts/apply-patch.mjs:5-9 | DSH-0.1.2-A1-03 (+ API-08 classification) | patch target path almost certainly gone; verify per exact tag |
| #2 events | YES | src/index.ts:15-22 | A1-02 ⊕ A2-01 (folded: keep `ignorable`) | producer role; folded net state authoritative |
| #3 services/Remote | YES | src/index.ts:26-32 | DSH-0.1.2-A1-01; error-flow DSH-0.1.2-A2-02 | host-plane plugin — inject domain service, not `ctx.remote` |
| #4 filesystem | YES | src/index.ts:36-37 | DSH-0.1.2-A1-04 (+ A1-21, A1-13 conditional) | hardcoded `~/.dsh/profiles/default` |
| #5 UI/commands/tools | YES | src/index.ts:10, 41-43 | DSH-0.1.2-A1-03 | internal import + command registration; A1-25/A1-26 not hit (no client half) |
| #6 custom channel | YES | src/index.ts:47-54 | DSH-0.1.2-A1-08 | loopback ≠ exempt from auth gate |
| #7 subprocess/output | YES | src/index.ts:57-67; scripts/apply-patch.mjs:12-18 | DSH-0.1.2-A1-05 (+ A1-04; A2-04, A1-13 conditional) | stdout-as-JSONL assumption was already wrong in rc.2 |

All seven categories hit — there is no no-hit category in this fixture. The "no hit ≠ no problem"
caveat still applies to the overall scan and is recorded at the end.

## #1 Source patch / monkey patch — HIT

Coupling points:

- patch.yml:2-5 — patch surface targeting host source `src/session/view/SessionView.ts`, replacing
  `export function renderSessionView` with `renderSessionViewPatched`.
- cordis.patch.yml:5-6 — the composition row wires `patch: [patch.yml]` into the profile.
- scripts/apply-patch.mjs:5-9 — reads `DSH_HARNESS_SOURCE_ROOT` and applies the surface against the
  host source tree (the classic dsh-tui-style patch mechanism).

Card mapping:

- **DSH-0.1.2-A1-03 (Session view internals split up extensively)** — direct hit. The session-view
  internals were extensively split in alpha.1; the patch target path and the symbol
  `renderSessionView` must be re-validated file-by-file against an exact-tag compare of
  dsh-v0.1.2-alpha.2. Per the card, when no equivalent owning module exists at the target tag the
  item must be marked "pending confirmation" — do not guess new paths.
- Classification note (pre-flight #1 / API-08): `cordis.patch.yml` itself is profile composition,
  not a source patch; the true #1 hits are `patch.yml` plus the `DSH_HARNESS_SOURCE_ROOT` runner. The
  composition row is also the migration vehicle for A1-21-style `roots` probing if profiles are ever
  pinned, but that card is not directly hit here (no agent-presets `roots` configured).

## #2 Internal/persistent events — HIT

Coupling points (src/index.ts):

- Lines 15-19 — **producer** of a third-party persisted SessionEvent: `ctx.emit('session/event', {
  type: 'legacy/informational-note', ignorable: true, payload: {...} })`.
- Lines 20-22 — plain **observer**: `ctx.on('session/event', ...)` logging `event.type`.

Card mapping — this is the corridor-folding case the task calls out:

- **DSH-0.1.2-A1-02** (`SessionEvent.ignorable` temporarily removed, alpha.1) and
  **DSH-0.1.2-A2-01** (restored for third-party persisted events, alpha.2). Folding: field removed in
  alpha.1, restored in alpha.2 ⇒ **final net state at the alpha.2 target is "the marker is retained"**.
  Concretely for the migration plan: do NOT delete the `ignorable: true` producer marker (that would be
  the correct move only if the target were exactly alpha.1); do NOT delete-then-re-add it either — the
  source keeps the marker unchanged. Two alpha.2-specific riders from A2-01:
  - the restore covers envelope/persistence/reload/transport retention; the public live
    `Session.append(...)` still has no `ignorable` parameter — the producer seam here (`ctx.emit` on
    `session/event`) must be marked as a capability gap to verify, not a documented public entry;
  - unknown events **without** the marker remain required-on-read, so the marker must stay exactly on
    this informational event and must not be spread to other event types as a "filter".
- The observer half (ctx.on) is a plain listener with no rename in this corridor; no additional card.
  A1-06 (PTC rename) event-vocabulary items (`tool/code-dispatch` etc.) are not referenced by this
  fixture.

## #3 Internal service probes / Remote — HIT

Coupling points (src/index.ts:25-32): two call sites obtain the service via `await ctx.get('apiProxy')`
and invoke RPC keys:

- `apiProxy.invoke('session.rename', { id, title })` (line 27)
- `apiProxy.invoke('llm.providers')` (line 31)

Card mapping:

- **DSH-0.1.2-A1-01 (APIProxy removed, calls moved to @Remote)** — direct hit. rc.2's service key
  `apiProxy` (package `@deepseek-ai/dsh-host-apiproxy`) is deleted in alpha.1. Operation mapping per
  the card's table: `session.rename` → `session/rename`; `llm.providers` splits into
  `llm/listProviders` **plus** `llm/listConfigurableProviders` (one call becomes two results — a
  behavioral difference, not a pure rename).
- **Face determination (critical, from the A1-01 field note):** this plugin is a host-plane
  (server-side) plugin — it reaches the old apiProxy via `ctx.get` in `activate(ctx)`. The card's
  `ctx.remote.<ns>.<method>` table is the **client-plane** facade. The correct host-plane migration is
  to skip the gateway and inject the domain service behind it directly (e.g. `inject: ['session']` /
  `inject: ['llm']` and call `ctx.llm.listProviders()`); naively swapping to `inject: ['remote']` on
  the host plane produces `pending (waiting for service: remote)`.
- **DSH-0.1.2-A2-02 (RemoteError / namespaced codes)** — applies to whatever remote/result surface the
  migration lands on: `RemoteResult<T>` success/error branching, namespaced codes
  (`session/not-found`, `session/agent-busy`, `gateway/*`), no `instanceof` across realms,
  `gateway/cancelled` terminates rather than becoming a generic error, no blind retry of
  `gateway/internal`. If the plugin stays host-plane with direct service injection, ordinary service
  exceptions apply instead — but any result-envelope handling must still follow this card.
- Not hit: A2-06 (`$host.home/isLoopback` — replaces `host.describe`; this fixture never calls
  `host.describe`), A1-20 (userQuestions), A1-22 (isTokenDelta), A1-27/A1-30/A1-31/A1-32 (client-plane
  reads), A2-05 (pluginInventory), A2-08 (sessionProjections inject — the fixture composes no tool
  packages), A2-10 (settingsNamespace — fixture never imports dsh-settings).

## #4 Direct host directory reads/writes — HIT

Coupling point (src/index.ts:36-37): `const profileDir = join(homedir(), '.dsh', 'profiles', 'default')`
followed by `writeFileSync(join(profileDir, 'legacy-note.txt'), text)` — a hardcoded
`~/.dsh/profiles/default` path assuming the default profile lives under the user's home `.dsh`.

Card mapping:

- **DSH-0.1.2-A1-04 (ACP/SDK examples merged into the `dsh` profile; standalone bins/packages
  removed)** — the card's recipe is exactly this fixture's defect: use the runtime `DSH_HOME`, the
  target profile, and the official launcher as the source of truth; do not hardcode user directories
  or profile paths. Its field note confirms profiles live under `$DSH_HOME/profiles` in the 0.1.2
  line, so a home-derived `.dsh` constant can silently point at the wrong tree when `DSH_HOME` is
  set.
- **DSH-0.1.2-A1-21** (conditional, same touchpoint per pre-flight): only relevant if the plugin ever
  resolves presets/roots — the fixture does not; recorded because pre-flight #4 lists it and the
  hardcoded-path pattern is identical.
- **DSH-0.1.2-A1-13** (conditional): platform shell/directory-picker fixes may obsolete workarounds —
  no shell workaround present; not applicable beyond the conditional listing.
- Data-flow note per pre-flight: the write target is fully static here, so no further tracing was
  needed; nothing was executed and no directory was probed (read-only discipline).

## #5 Internal UI / commands / tool registration — HIT

Coupling points (src/index.ts):

- Line 10 — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` (private Host/Web
  Client path; also an undeclared dependency in package.json).
- Lines 41-43 — `ctx.contributes.registerCommand('legacy.openView', ...)` constructing
  `new SessionView({ enhanced: true })`.

Card mapping:

- **DSH-0.1.2-A1-03** — direct hit on both halves: the internal session-view import path and the UI
  registration point. Recipe: rebuild imports by owning module against the exact target tag; migrate
  to public facets/services; capabilities without a stable public seam are "pending confirmation".
- **DSH-0.1.2-A1-25 / A1-26 / API-10** — NOT hit: those govern Web Client plugins (`dsh-client-runtime`
  imports, `dsh.client.inject`, client-bundle registration id == package name). This fixture has no
  client half, no `dsh.client` declaration, no bundle. A1-26 becomes relevant only if the migration
  adds a browser face.
- A1-09/A1-10/A1-11 (optional capabilities) — not applicable; the skill treats capability cards as
  suggestions only and they must not be adopted automatically.

## #6 Custom HTTP / WS / RPC / DOM / CSS channels — HIT

Coupling point (src/index.ts:47-54): `startLegacyBridge()` creates a Node `http` server answering
every request with `'legacy'` on `127.0.0.1:43121` (commented as
`http://localhost:43121/api/legacy`). The function is defined and referenced (`void startLegacyBridge`)
but never invoked; it is still a live coupling point in the source.

Card mapping:

- **DSH-0.1.2-A1-08 (Web/API channels use process-scoped bootstrap tokens and signed cookies)** —
  direct hit. The bridge bypasses the Host Gateway authentication model entirely: no Host/Origin
  fence, no auth gate, no teardown story. Per the card, "listening on loopback only" is explicitly NOT
  a reason to skip authentication; custom routes registered outside the Connection seam do not inherit
  auth/CORS/TLS, and handlers must call `ctx.connection.requestRejection(req)` first or move to a
  Connection-owned carrier. The migration plan must either delete the bridge or wire it into the auth
  gate; the never-invoked status changes the severity, not the classification.
- DOM/CSS channel items of the pre-flight (#6 second regex set, and A1-28's contenteditable composer)
  — not hit: no DOM/CSS manipulation exists in this fixture (it has no browser code at all).

## #7 Subprocess / stdout / stderr parsing — HIT

Coupling points:

- src/index.ts:57-67 — `headless-ask` spawns `dsh --profile headless <prompt>` and parses each
  `stdout` `data` chunk with `JSON.parse`, looking for `event.type === 'final'`. (Two stacked defects:
  the JSONL assumption is wrong for the target contract, and `data` chunks are not line-aligned even
  if it were JSONL.)
- scripts/apply-patch.mjs:12-18 — `execFileSync('dsh', ['--profile', 'headless', 'ping'])` then
  `JSON.parse` per stdout line expecting `{ type: 'final', text }`.

Card mapping:

- **DSH-0.1.2-A1-05 (Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final
  text)** — direct hit, with an important pre-existing-failure nuance: per the card, rc.2's stdout was
  **already** the final assistant text and was never JSONL, so the fixture's JSONL assumption is wrong
  against the from-version too, not only the target. Recipe: treat stdout as final assistant text, do
  not `JSON.parse` stdout, receive `dsh: reasoning:` / `dsh: <code>: <message>` on stderr, and judge
  success by exit code (0 complete / 1 failure). Both call sites violate the "don't parse stdout as
  JSON" rule and have no stderr/exit-code handling at all.
- **DSH-0.1.2-A1-04** (also touches #7): the wrapper hardcodes the `dsh` launcher + profile shape;
  use the runtime `DSH_HOME`/official launcher as the source of truth. Its field note also warns that
  a headless cold boot without credentials reports `dsh: MISSING_CREDENTIAL` — a profile-config issue
  not to be misattributed to the plugin.
- **DSH-0.1.2-A2-04** (conditional): only relevant if the surrounding toolchain added Node 24.0–24.11.1
  workarounds — none present in the fixture; recorded because pre-flight #7 lists it.
- **DSH-0.1.2-A1-13** (conditional): no shell/picker workaround branches present; not applicable.

## Special surfaces

- Packaging/dependencies (A1-24, A2-03, A2-08): not hit — the fixture declares no `@deepseek-ai/*`
  cohort, no pi-ai dependency, no tool-package peers. But note the undeclared
  `@deepseek-ai/dsh-session-view/internal` import (#5) means the dependency inventory is incomplete
  rather than clean; a real migration must first make the import graph explicit (and, per A2-03's
  field note, verify declaration ownership with `skipLibCheck: false` once type deps exist).
- Privacy/composition defaults (A1-12, A1-14, A1-23): not hit — no telemetry/ingress configuration and
  no reuse of the `dsh-base` composition in this fixture.
- Permissions/approval (A1-07): not hit — no WebFetch/approval surface.

## No-hit statement and limits of the scan

Every one of the seven categories hit in this fixture, so there is no per-category no-hit entry.
Still, per the pre-flight's own caveat and the task's requirement 3, the following limits hold and
"no hit" anywhere must never be read as "no problem":

- Scan scope: the complete 6-file fixture tree, content-searched for all seven pattern families
  (patch/DSH_HARNESS_SOURCE_ROOT, SessionEvent/session/event/ctx.on, apiProxy/ctx.get/internal imports,
  DSH_HOME/.dsh/profiles/homedir/readFile/writeFile, registerCommand/contributes/client-runtime,
  createServer/localhost//api/, child_process/spawn/headless/--profile). The patterns are heuristic:
  dynamic string construction, config-time coupling, and lockfile/registry drift are invisible to a
  static pass.
- This fixture is non-compilable by design; no build/typecheck/mount could corroborate anything, and
  none was attempted (read-only discipline).
- Cards are a curated list, not a complete API diff; a clean touchpoint map does not cover dependency
  resolution, enablement/composition resolution, or runtime pending states.
- Before any real migration (Mode B/C), the mandatory follow-ups are: dependency/lockfile review
  against the exact alpha.2 cohort, a real profile cold boot with `--dump-config` pending-row check,
  and a functional smoke of each migrated call path (per the skill's validation layers 1–5).

## Recommended migration actions (planning only — nothing was changed)

1. (#1) Re-validate `patch.yml`'s `SessionView.ts` target against the alpha.2 exact tag; expect the
   patch surface to be rebuilt around the new owning module or dropped (A1-03).
2. (#2) Keep the `ignorable: true` producer marker as-is (folded A1-02 ⊕ A2-01); verify reload
   retention on alpha.2 and mark the emit seam a capability gap pending a public entry.
3. (#3) Replace `ctx.get('apiProxy')` with host-plane direct domain-service injection
   (`session.rename` semantics; `llm.providers` → the split provider listing), with A2-02 error-flow
   discipline on any result envelope.
4. (#4) Replace the hardcoded `~/.dsh/profiles/default` with the runtime `DSH_HOME`-derived profile
   path (A1-04).
5. (#5) Remove the `@deepseek-ai/dsh-session-view/internal` import; re-home `legacy.openView` onto a
   public seam or mark pending confirmation (A1-03).
6. (#6) Delete `startLegacyBridge` or wire it through the Connection auth gate
   (`ctx.connection.requestRejection`) — loopback is not an exemption (A1-08).
7. (#7) Rewrite both headless wrappers: stdout = final text (never JSON.parse), stderr carries
   reasoning/`dsh: <code>`, success judged by exit code (A1-05).

## Rollback / baseline record

Nothing was modified, so no rollback is required. Baseline recorded for a future migration: fixture
tree at benchmark path above (git-protected; grading requires it unchanged vs HEAD), plugin version
0.1.1, no lockfile, corridor dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2.
