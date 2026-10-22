# S1 — Static Touchpoint Scan — legacy-plugin (dsh 0.1.1 era) → dsh 0.1.2-alpha.2

**Mode:** A · inspect (read-only). No migration was implemented; no file under `fixture/` was modified.
**Subject:** static copy of a legacy plugin (`legacy-plugin`, plugin version `0.1.1`).
**Planned corridor:** `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2`.

**Corridor, built from the `from → to` edges in `references/README.md` (never by filename order):**
`dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1` (card set `DSH-0.1.2-A1`, 28 cards) → `dsh-v0.1.2-alpha.2` (card set `DSH-0.1.2-A2`, 8 cards).
**No corridor gap** — the two edges chain exactly, so every hit below is carded. The planner confirms `gaps: []`.

---

## 0. Scan scope and method

### Files scanned (read-only, complete)

All 6 files under `fixture/`:

| File | Size | Role |
|---|---|---|
| `fixture/README.md` | 1364 B | fixture documentation (Markdown prose, not a code hit) |
| `fixture/package.json` | 161 B | plugin manifest |
| `fixture/cordis.patch.yml` | 159 B | profile composition row |
| `fixture/patch.yml` | 214 B | source-patch surface declaration |
| `fixture/scripts/apply-patch.mjs` | 752 B | patch driver + headless wrapper |
| `fixture/src/index.ts` | 2562 B | plugin entry — all runtime coupling |

Excluded by design: nothing else exists under `fixture/` — no `node_modules`, no lockfile, no test/CI directory, no `dsh-plugin.json`, no `agent.cordis.yml`, no legacy `cordis.yml`.

### Method

1. Ran the skill's read-only migration planner `skills/plugin-upgrade/scripts/plan-migration.mjs --root fixture --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2 --format json` (exit 0, `gaps: []`). Its pattern set is `references/pre-flight-patterns.json`.
2. Independently re-applied the same 7-class pattern set to all 6 fixture files with per-line attribution, so every hit line below is exact. (The planner reports path + line + pattern number only and caps displayed hits; the manual pass does not cap.)
3. Read the full corridor — `v0.1.1-rc.2.md`, `v0.1.2-alpha.1.md`, `v0.1.2-alpha.2.md` — plus the API ledger `api-migration-0.1.2-alpha.2.md`, `pre-flight.md`, `rollup-0.1.2.md`, `precision-checklist.md`, `troubleshooting.md`, `README.md`, and folded the corridor to its **net final state**.

### Read-only discipline

- The fixture was re-hashed after the scan against `fixture-seal.pre.json`: **all 6 files MATCH, 0 added, 0 removed, 0 modified.**
- The planner was invoked with no write option (it has none; `scripts/plan-migration.mjs` imports only `existsSync`/`readFile`/`readdir`/`stat` from `node:fs` — verified by reading the source).
- Nothing from the fixture was executed: `scripts/apply-patch.mjs` and the `dsh --profile headless` invocations were **read, never run**. No install, no migration, no publish, no network, no writes outside the report path.

### Scan-result caveat (applies to every row below)

A zero hit in a class means **"not detected by the current regex patterns"**, never "no host coupling". The patterns are heuristic and blind to TypeScript data flow, dynamic imports, computed service keys, config-driven paths, and any surface reached through a dependency's own defaults. This fixture also cannot be compiled or executed (by design), so the static scan is the only evidence available here — see §4.

---

## 1. Summary table

| # | Touchpoint | Hit | Files / lines | Cards |
|---|---|---:|---|---|
| #1 | Source patch | **YES** | `fixture/patch.yml:2-6`; `fixture/scripts/apply-patch.mjs:5-8`; `fixture/cordis.patch.yml:5-6` (composition — negative control) | `DSH-0.1.2-A1-03` (required-if-hit); `DSH-0.1.2-A1-01` (indirectly #1) |
| #2 | Internal / persistent events | **YES** | `fixture/src/index.ts:15-19` (producer); `fixture/src/index.ts:20-22` (observer) | `DSH-0.1.2-A2-01` (net target state) + `DSH-0.1.2-A1-02` (folded, superseded — no action for an alpha.2 target); `DSH-0.1.1-R1-06` (pre-corridor, already satisfied) |
| #3 | Service / Remote | **YES** | `fixture/src/index.ts:24-32` (`ctx.get('apiProxy')` x2, `session.rename`, `llm.providers`) | `DSH-0.1.2-A1-01` (required-if-hit); `DSH-0.1.2-A2-02` (error flow for the new Remote); `DSH-0.1.1-R1-04` / `R1-05` (inject discipline) |
| #4 | Host filesystem | **YES** | `fixture/src/index.ts:35-38` (`~/.dsh/profiles/default`) | `DSH-0.1.2-A1-04` (required-if-hit); `DSH-0.1.2-A1-13` (conditional); `DSH-0.1.2-A1-21` (conditional) |
| #5 | UI / commands / tools | **YES** | `fixture/src/index.ts:9-10` (internal import); `fixture/src/index.ts:41-43` (`ctx.contributes.registerCommand`) | `DSH-0.1.2-A1-03` (required-if-hit); `DSH-0.1.2-A1-25` (adjacent, not hit) |
| #6 | Custom channel | **YES** | `fixture/src/index.ts:47-54` (loopback HTTP, port 43121) | `DSH-0.1.2-A1-08` (required-if-hit); `DSH-0.1.2-A1-19` (acceptance side) |
| #7 | Subprocess / output parsing | **YES** | `fixture/src/index.ts:57-67`; `fixture/scripts/apply-patch.mjs:12-19` | `DSH-0.1.2-A1-05` (required-if-hit); `DSH-0.1.2-A1-04` (profile/bin surface); `DSH-0.1.2-A2-04` (conditional, Node window) |

**All seven classes hit.** There is no genuinely empty category in this fixture; §4 therefore records, per class, what a *pattern-level* miss would still have left undiscovered, and why "no hit" can never be promoted to "no problem".

---

## 2. Per-class detail

### #1 · Source patch / monkey patch — **HIT**

**Hit files / lines**

- `fixture/patch.yml:2-6` — declares a real source replacement: `surface[0].target = src/session/view/SessionView.ts`, `find: "export function renderSessionView"` → `replace: "export function renderSessionViewPatched"`.
- `fixture/scripts/apply-patch.mjs:5-6` — `DSH_HARNESS_SOURCE_ROOT` env-var driven patch source root (the canonical dsh-tui-style source-patch driver).
- `fixture/scripts/apply-patch.mjs:8` — `readFileSync('patch.yml', 'utf8')` — the patch surface is resolved from a **working-directory-relative** path.
- `fixture/cordis.patch.yml:5-6` — `patch: [patch.yml]` row. **Classification: profile composition, NOT a source patch** (API-08, below). It is the declared *carrier* of the patch surface, not an independent hit.

**Concrete coupling points hit**

1. A **host-source file path** is patched by string replacement (`src/session/view/SessionView.ts`) — a Host-side internal session-view path.
2. The replacement anchor is a **named export symbol** (`renderSessionView`), i.e. a symbol the alpha.1 UI decomposition reshaped.
3. The patch driver resolves the host checkout through `DSH_HARNESS_SOURCE_ROOT`, so the plugin assumes it may write into a host source tree — the definition of a monkey patch.

**Card mapping**

- **`DSH-0.1.2-A1-03` · Session view internals split up extensively** (breaking, required-if-hit, #1 + #5) — *primary*. Scoped to integrations that patch host source **or import from internal session-view paths**, which is exactly this fixture. Symptoms: patch target paths, internal imports, or UI registration points no longer work. Recipe: check each host path one-by-one against an exact-tag compare; rebuild imports by owning module; mark capabilities without a stable public seam as **"pending confirmation" — do not guess new paths**; prefer public facets/services over adding more internal imports. Verification: compose the patch surface against target-tag source and map every old target to a target-version file or an explicit removal reason.
- **`DSH-0.1.2-A1-01` · APIProxy removed, Host/Web Client calls moved to `@Remote`** — *indirect* (the card itself declares "indirectly #1"): the APIProxy→Remote migration changes host files the patch anchors to, so the patch surface must be re-validated **together with** the #3 migration, not before it.
- **API-08** (corridor API ledger) · `cordis.patch.yml` is composition, not a source patch — the classification rule applied above: `cordis.patch.yml` is the official Loader composition overlay for a Profile/Bundle; only real diffs, `patch-package`/`patchedDependencies`, replaced host implementations, or direct writes to published artifacts enter source-patch migration. Here the real source patch is `patch.yml` + `apply-patch.mjs`; the `cordis.patch.yml` row is the composition negative control and must be migrated as a **composition row** (row id / name / inject / whole-config replacement semantics — `config` is a whole replacement, not a deep merge), never rebased as a source hunk.

**Residual risk:** the patch target is a *Host* internal path while the plugin's runtime coupling (#5) is a *Client* internal path; both belong to the same UI decomposition wave and must be migrated in one pass against one target tag.

---

### #2 · Internal / persistent events — **HIT**

**Hit files / lines**

- `fixture/src/index.ts:15-19` — **producer**: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })`.
- `fixture/src/index.ts:20-22` — **observer**: `ctx.on('session/event', (event) => console.log('[legacy] session event:', event.type))`.

**Concrete coupling points hit**

1. The producer writes a **third-party event type** (`legacy/informational-note`) into the durable `session/event` channel and marks it `ignorable: true`.
2. The payload key is `payload`, not `data` — the public `Session.append()` surface takes `{ type, data, SurfaceIntent }`, so the fixture bypasses the public surface and hand-writes an envelope.
3. The observer subscribes to the **internal** event name `session/event` and reads `event.type` (correct per the rc.1 contract — see below).

**Card mapping — this is the corridor-folding case**

One field in this corridor is **removed at an intermediate version and restored at the target**:

- **`DSH-0.1.2-A1-02` · `SessionEvent.ignorable` temporarily removed** (breaking, action level **`required-if-target-is-alpha.1`**) — alpha.1 could not preserve the marker on third-party informational events; first-party readers then reject a reload, treating unknown persisted events as required.
- **`DSH-0.1.2-A2-01` · Restore `SessionEvent.ignorable` for third-party persisted events** (fix, **`required-if-hit`**) — alpha.2 restores the *retention* semantics of envelope / persistence / reload / transport.

**Folding rule applied (net final state, not per-version actions).** The target is **alpha.2**, not alpha.1. Therefore:

- **Do NOT delete the `ignorable: true` marker** as A1-02 would require for an alpha.1 target, and **do not delete-then-re-add**. The rollup states the rule for this canonical case: "fold the corridor into its net state before modifying source — do not delete once for alpha.1 and then add it back for alpha.2; if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept."
- The **only** card whose action level is live for this hit is **`DSH-0.1.2-A2-01`**, and its action level is `required-if-hit` — the hit is present, so it applies.
- **`DSH-0.1.2-A1-02` is recorded as superseded-by-revert, not as an action item.** Its action level `required-if-target-is-alpha.1` is false for this corridor; it stays in the report as the *reason* the net state must be computed.

**The remaining live problem under A2-01 (easy to miss):** A2-01 restores envelope/persistence/reload/transport *retention*, but the **public live `Session.append(...)` still has no `ignorable` parameter** — it accepts only `type`, `data` and `SurfaceIntent`. So:

- If the plugin persists through the public append surface, an unknown event written there carries **no** marker and the next **cold load** fails closed with `SessionFormatUnsupportedError`, refusing the whole Session. A2-01 says explicitly: mark the producer seam as a **capability gap**; do not fake a public entry via a cast.
- API-05 (API ledger) adds the failure shape: **"silent write / loud read that one live smoke cannot catch"**, and recommends that out-of-repo plugins on alpha.2 not persist state via a custom `SessionEventMap` + `Session.append()`, but use a plugin-owned sidecar/store keyed by Session id.
- The fixture's `ctx.emit('session/event', …)` is a **raw-envelope write**, not the public append — closer to the retained-marker path, but still an unsupported third-party producer seam, still hand-writing `payload` instead of `data`. Treat the producer seam as **pending confirmation** against the target tag's types, and validate by a real persist → **cold load** test, not a live-only smoke.

**Corridor-adjacent card already satisfied:** **`DSH-0.1.1-R1-06`** (session event contract: the field is `type`, not `kind`; the subscription survives sessions absence) is a **pre-corridor** card (rc.8→rc.1 edge, already in force at the rc.2 baseline) and the fixture **already complies** — it reads `event.type`, never `event.kind`, and its subscription is registered unconditionally. Recorded as *already satisfied — no action*, not as a hit.

**Residual risk:** the fixture cannot be compiled or booted, so the real write path (public append vs raw envelope vs a persistence seam the plugin owns) cannot be settled by inspection alone — a verification-layer gap, not a static one.
---

### #3 · Internal service probes / Remote — **HIT**

**Hit files / lines**

- `fixture/src/index.ts:24-28` — `rename-session`: `const apiProxy = await ctx.get('apiProxy')` then `await apiProxy.invoke('session.rename', { id, title })`.
- `fixture/src/index.ts:29-32` — `list-providers`: `const apiProxy = await ctx.get('apiProxy')` then `return apiProxy.invoke('llm.providers')`.

**Concrete coupling points hit**

1. The **service key `apiProxy`** — rc.2's service key of type `ApiProxy` from package `@deepseek-ai/dsh-host-apiproxy`. alpha.1 deletes that package; **no `APIProxy` identifier exists at the target**.
2. Two **old APIProxy operations**: `session.rename` and `llm.providers`.
3. `ctx.get('apiProxy')` is a **runtime service probe with no declared `inject`** — the entry exports `activate(ctx: any)` and declares no `inject` at all.
4. The plugin is a **Host-plane** plugin (it registers Host services and imports a Host-side package), so the migration target is the **Host domain-service** seam, not the client Remote projection.

**Card mapping**

- **`DSH-0.1.2-A1-01` · APIProxy removed, Host/Web Client calls moved to `@Remote`** (breaking, **`required-if-hit`**, #3 + indirectly #1) — *primary*. Old→new for the two hit operations:
  - `session.rename` → `session/rename`, i.e. the `session` namespace's generated declaration on the Client face — or, **because this is the Host plane**, the owning domain service injected directly. The card's field note is explicit: "the old `apiProxy` is the host-plane (server-side) facade, `ctx.remote` is the client-plane (browser-side) facade; they are not in the same runtime." The correct Host migration is to inject the domain service behind the old call and **not** to declare `inject: ['remote']`, which on the Host plane leaves the entry `pending (waiting for service: remote)`.
  - `llm.providers` → **split** into two results: `llm/listProviders` + `llm/listConfigurableProviders`. On the Host face the equivalent is the `llm` domain service (`ctx.llm.listProviders()`), whose method names must be confirmed **item by item** against the target tag — the client table must not be used to derive Host service keys.
  - Method/namespace names must come from the **generated declarations at the target tag**, never hand-assembled `namespace/method` strings.
- **`DSH-0.1.2-A2-02` · Remote failures become `RemoteError` instances; error codes gain namespaces** (breaking, **`required-if-hit`**, #3) — *secondary, applies to the migrated call sites*. The call shape (`{ ok, value } | { ok: false, error }`) did **not** change between rc.2 and alpha.2, but `error` became a `RemoteError` **instance**, error codes gained namespaces (`session-not-found` → `session/not-found`, `agent-busy` → `session/agent-busy`, `internal` → `gateway/internal`, `cancelled` → `gateway/cancelled`, etc.), `isRemoteFailure` was added, and `RemoteStreamError` / `TypertRemoteFailure` / `TypertLookupFailure` were removed. The fixture's current code does `await apiProxy.invoke(...)` with **no result-branch handling at all**; after migration it must branch on `result.ok` first, then on `result.error.code`, must **not** use `instanceof`, and must not treat a business failure as a rejection. `gateway/cancelled` must terminate/propagate rather than retry; `gateway/internal` and unknown codes must preserve `code`/`details` and **not** auto-retry.
- **`DSH-0.1.1-R1-04` · cordis strict injection: `ctx.get` on undeclared services throws** (breaking, required-if-hit, #3) — *pre-corridor but still binding*: the fixture calls `ctx.get('apiProxy')` with **no `inject` declaration** (the entry has no `inject` export at all). Under strict injection the throw can occur at the top of `apply()`, so the whole effect never registers and features silently disappear. Whatever the #3 migration injects must be declared in `inject`.
- **`DSH-0.1.1-R1-05` · Prefer weak `ctx.get` over property access for optional host services** (behavior, conditional, #3) — *pre-corridor, still binding*: the fixture already uses the weak `ctx.get(...)` form rather than property access, which is the R1-05-preferred shape for an optional service; keep that shape (do not "upgrade" it to `ctx.apiProxy`) for services not guaranteed in every profile.
- **`DSH-0.1.2-A2-08` · `sessionProjections` becomes a required inject and peer** (breaking, required-if-hit, #3) — *conditional, not hit*: it bites **self-composed** profiles that mount `dsh-tool-todo` / `dsh-tool-subagent` / `dsh-agent` / `dsh-agent-loop` / `dsh-terminal-bash` individually and list them as peers. The fixture declares no peers and composes nothing, so **not applicable** — recorded because this card's failure mode is a silent runtime *pending* rather than a typecheck error, and it is the one a zero-hit reading would most easily miss.
- **`DSH-0.1.2-A2-06` · Client Remote adds fixed Host facts `$host.home/isLoopback`** (behavior, required-if-hit, #3) — *not applicable*: it applies to **Web Client** integrations reading Host facts; the fixture has no client half and never calls `host.describe`.
- **`DSH-0.1.2-A2-10` · `dsh-settings` drops the runtime `settingsNamespace` export** (breaking, required-if-hit, #3) — *not applicable*: the fixture never touches `ctx.settings`.

**Residual risk:** the Host-vs-Client plane determination is the highest-impact judgement in this report. Getting it wrong produces two different failure modes — a Host entry stuck at `pending (waiting for service: remote)`, or a client bundle that never assembles. It must be settled from the plugin's real deployment shape (is this entry mounted in a Host profile or a browser bundle?), which a 6-file static scan cannot fully answer: the fixture has no `dsh.client` manifest row and its own header calls it a static fixture.

---

### #4 · Host filesystem read/write — **HIT**

**Hit files / lines**

- `fixture/src/index.ts:35-38` — `write-note`: `const profileDir = join(homedir(), '.dsh', 'profiles', 'default')` then `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`.
- `fixture/src/index.ts:7` — `import { writeFileSync } from 'node:fs'`.
- `fixture/scripts/apply-patch.mjs:2, 8` — `readFileSync('patch.yml', 'utf8')` — **working-directory-relative, not a host-home path**; see the ruled-out list below.

**Concrete coupling points hit**

1. A **hard-coded home-relative path**: `~/.dsh/profiles/default`, built from `homedir()`, ignoring the runtime `DSH_HOME` and ignoring which profile is actually active.
2. A **direct write into a host-owned profile directory** (the profile composition directory), with no service, permission, or ownership mediation.
3. The path is **not parameterised**: no profile name comes from config, so a plugin installed in any profile writes into `default`.

**Card mapping**

- **`DSH-0.1.2-A1-04` · ACP/SDK examples merged into the `dsh` profile, standalone demo bins and packages removed** (behavior, **`required-if-hit`**, #4 + #7) — *primary*. The migration recipe is exactly on point: "Use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; distinguish profile composition (`cordis.patch.yml` / `agent.cordis.yml`), package manifests, and resolved config, and **do not hardcode user directories**." The field note confirms `dsh --help` shows profiles living under `$DSH_HOME/profiles`, and that a headless cold boot without credentials reports `dsh: MISSING_CREDENTIAL: ...` — a **profile configuration issue** to triage as such, not misclassified as a plugin/runtime failure.
- **`DSH-0.1.2-A1-13` · Platform shell and directory picker fixes may obsolete old workarounds** (fix, **conditional**, #4 + #7) — *conditional*: relevant only if the plugin carries a persistent-shell or Windows directory-picker workaround. This fixture does not (it hard-codes a path instead of working around a picker), so the card is **listed, not triggered** — and the card's own rule applies: do not clean up compatibility branches in bulk.
- **`DSH-0.1.2-A1-21` · `dsh-agent-presets` drops `resolveSessionPreset`; shipped presets now come from the package's `presets/`** (breaking, required-if-hit, #3 + #4) — *conditional*: the #4 leg concerns plugins that **read profile files directly**. The fixture does read profile files directly, but does not touch agent presets, so the preset-specific part is **not applicable**; the profile-file-reading habit is covered by A1-04.

**Residual risk:** the card does not tell you *where* to write instead. The replacement seam (profile-owned storage vs a plugin-owned store keyed by session/profile id vs a host service) must be confirmed against the target tag — a path rewrite without that confirmation risks writing into a directory the target host also manages.
---

### #5 · Internal UI / commands / tools — **HIT**

**Hit files / lines**

- `fixture/src/index.ts:9-10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` — a **deep `/internal` subpath import** of a DSH package.
- `fixture/src/index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))` — command registration through the **internal `ctx.contributes` surface**, returning an internal UI component instance.

**Concrete coupling points hit**

1. A **private package subpath** (`/internal`) of `@deepseek-ai/dsh-session-view` — no public export-map entry, no stability guarantee.
2. A **named export** (`SessionView`) from that private path, constructed with an options object (`{ enhanced: true }`).
3. The **command registration surface itself** (`ctx.contributes.registerCommand`) plus the command id string `legacy.openView`.
4. The command's **return value is a UI component instance** — the plugin is expected to mount in a **UI-capable face**.

**Card mapping**

- **`DSH-0.1.2-A1-03` · Session view internals split up extensively** (breaking, **`required-if-hit`**, #1 + #5) — *primary*. The card is scoped to integrations that patch host source **or import from internal session-view paths** — precisely this import. Symptoms: patch target paths, internal imports, or UI registration points no longer work. Recipe: check host paths one-by-one against an exact-tag compare; rebuild imports **by owning module**; mark capabilities without a stable public seam as **pending confirmation** (do not guess new paths); prefer public facets/services over adding more internal imports. Verification: compose against target-tag source; every old target must map to a target-version file or an explicit removal reason. **API-07** reinforces it: **package export ≠ artifact presence** — `/internal` and `/src/*` subpaths can appear in `exports` while the published tarball does not contain the file, yielding `ERR_MODULE_NOT_FOUND` / `ERR_PACKAGE_PATH_NOT_EXPORTED` / missing `.d.ts` at install time even when the source checkout looks fine.
- **`DSH-0.1.2-A1-25` · `@deepseek-ai/dsh-client-runtime` package removed, client symbols migrated by domain** (breaking, required-if-hit, #3 + #5) — *adjacent / conditional*. The fixture does **not** import `dsh-client-runtime` (verified: that identifier occurs nowhere under `fixture/`), so the removal itself is **not hit**. It is listed because the same decomposition wave splits client symbols by owning package, and because the fixture's `/internal` import must be re-homed to whichever package owns `SessionView` at the target tag — the card's per-domain mapping table is the reference for that re-homing, not for a hit.
- **`DSH-0.1.2-A1-26` · client-modules scan contract: registration id must equal the package.json name** (breaking, required-if-hit, #5) — *conditional*: it bites plugins with a **Web Client half** built into a bundle and mounted through an assembly row. The fixture has no client bundle, no `__ModuleLoader__`, no `PLUGIN_ID`, and its `cordis.patch.yml` row name (`legacy-plugin`) **does** match its `package.json` `name` (`legacy-plugin`), so the three-id contract is **not violated today**. Recorded so that, if a client half is added during the migration, the id / row-name / package-name triple is checked.
- **`DSH-0.1.2-A1-09` / `A1-10` / `A1-11` / `A1-29` / `A1-28`** — capability/DOM cards for the Web Client UI. **Not hit**: the fixture registers no model-settings page, no locale, no subagent preset, no `MarkdownText`, and touches no composer DOM. Listed to show they were considered and ruled out.

**Unmapped residual (declared, not guessed):** the corridor cards do **not** name `ctx.contributes.registerCommand` anywhere — verified by grep across `v0.1.1-rc.2.md`, `v0.1.2-alpha.1.md` and `v0.1.2-alpha.2.md`: the identifiers `registerCommand`, `contributes` and `ctx.register` occur **0 times**. The *command-registration surface* therefore has **no covering card** in this corridor. Only its companion coupling (the `/internal` `SessionView` import) is carded, via **A1-03**. The honest reading: the command seam is **pending confirmation** against the target tag, and it must not be assumed stable because the card set is silent — "card sets are curated, not complete API diffs".

---

### #6 · Custom HTTP / WS / RPC / DOM / CSS channel — **HIT**

**Hit files / lines**

- `fixture/src/index.ts:4` — `import { createServer } from 'node:http'`.
- `fixture/src/index.ts:47-53` — `function startLegacyBridge() { const server = createServer((_request, response) => { response.end('legacy') }); server.listen(43121, '127.0.0.1'); return server }`.
- `fixture/src/index.ts:51` — the comment names the route: `http://localhost:43121/api/legacy`.
- `fixture/src/index.ts:45-46, 54` — the comment states the bridge "bypasses the Host Gateway authentication model"; the function is **never invoked** (`void startLegacyBridge`), so the channel is statically present but dormant.

**Concrete coupling points hit**

1. A **raw Node HTTP server** on loopback `127.0.0.1:43121`, independent of the host's WebServer and of the Connection auth gate.
2. A route path under `/api/` (`/api/legacy`) that a reader would reasonably assume is host-gated, but that is served by a **separate, unauthenticated** listener.
3. **No auth, no Origin/Host fence, no CORS, no TLS, no teardown** — the server is returned to the caller and never closed; no `close()` on unload.
4. A **fixed port** (`43121`) — a collision/ownership hazard against the host's own listeners.

**Card mapping**

- **`DSH-0.1.2-A1-08` · Web/API channels use process-scoped bootstrap tokens and signed cookies** (security, **`required-if-hit`**, #6) — *primary*. Scope is exactly "plugins with custom loopback HTTP/WS/RPC, browser pages, or custom `/api` routes". Symptoms: old channels reaching the Web UI over the network or calling `/api` directly may receive 401/403, and private routes that bypass auth become **security holes**. Recipe: the bootstrap token is used only for `GET /?token=...`, then a 303 to `/` plus an HttpOnly/SameSite cookie bound to the authority; the token must **not** be placed into `/api`, WS URLs, or the Authorization header; the official `/api` Remote/RPC/exact-Fetch routes and `/api/remote.mux` pass through the Connection auth gate; **custom routes registered directly with `ctx.webServer.register()` / `registerUpgrade()` do not automatically inherit auth, the Host/Origin fence, CORS, or TLS** — the handler must call `ctx.connection.requestRejection(req)` first, or move to a Connection-owned carrier/seam.
  - Applied here: the loopback listener is not the host WebServer at all, so the correct migration is either (a) move the route onto the host WebServer and gate it with `ctx.connection.requestRejection(req)` before any side effect, adding `connection` to the entry's inject list, or (b) move it to `ctx.connection.fetch.register` / `ctx.connection.rpc.handle('/root', handler)` — **preserving the wire protocol** where a protocol change is not authorised. The precision checklist repeats this: "The `webServer` service still exists in alpha.2. Switching a plain HTTP route to RPC changes request/envelope and response semantics; auth migration alone does not authorise that protocol change."
  - Because the route is *dormant* (`void startLegacyBridge`), this is a **latent** hit: no live effect today, live the moment the function is called. It must still be migrated — the point of a static scan is to catch it before activation.
- **`DSH-0.1.2-A1-19` · Web plugin acceptance now reads the host boot manifest and the auth URL** (behavior, required-if-hit, #6 + #7) — *adjacent*: the fixture's own comment names a web-root-style URL (`http://localhost:43121/api/legacy`), i.e. it hard-codes a URL. On alpha.1+ the `dsh web` root URL carries a **process-level token** and resources are advertised through `window.__DSH_BOOT__` with revision-bearing URLs; a hard-coded revision-less URL misjudges 401/404 as compatibility. Not a direct hit on the fixture's bridge (it targets its own port, not the host's) — recorded as the acceptance-side rule for any future browser-side check of this plugin.
- **`DSH-0.1.2-A1-28` · composer edit surface `<textarea>` → contenteditable DIV** (breaking, required-if-hit, #6 DOM + #5) — **not hit**: the fixture contains no composer DOM access (`contenteditable` / `setSelectionRange` / `data-input-scroll` do not appear). Listed to show it was considered and ruled out.

**Residual risk:** the card constrains *how* the channel authenticates; it does not decide whether a loopback listener is the right shape at all, nor who owns port 43121. The port/ownership question and the teardown question are **not carded** and must be resolved by design, not by card lookup.
---

### #7 · Subprocess / stdout / stderr parsing — **HIT** (two sites, both wrong)

**Hit files / lines**

- `fixture/src/index.ts:8` — `import { spawn } from 'node:child_process'`.
- `fixture/src/index.ts:57-67` — `headless-ask`: `spawn('dsh', ['--profile', 'headless', prompt])`, then `child.stdout.on('data', line => { const event = JSON.parse(line.toString()); if (event.type === 'final') result = event.text })`, resolving on `child.on('close')`.
- `fixture/scripts/apply-patch.mjs:3` — `import { execFileSync } from 'node:child_process'`.
- `fixture/scripts/apply-patch.mjs:12-19` — `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })`, then `output.split('\n')` → `JSON.parse(line)` → `if (event.type === 'final') ...`.
- `fixture/scripts/apply-patch.mjs:11` — the comment states the wrong expectation explicitly: "target headless stdout is final text, not JSONL".

**Concrete coupling points hit**

1. **argv shape**: `dsh --profile headless <task>` — the task text is the last positional token. (This shape is *correct* per the target contract, and is worth stating because the card blesses it.)
2. **stdout contract**: both sites assume **JSONL** and `JSON.parse` each line, then look for `event.type === 'final'`.
3. **stderr contract**: **not handled at all** by either site — no `dsh: reasoning:` segment sink, no `dsh: <code>: <message>` capture, and stderr is not redirected at all.
4. **Success determination**: the spawn site resolves on `close` without regard to the **exit code**, so a failed, aborted, or no-completed-turn run looks like a successful empty answer; the execFileSync site does throw on non-zero, but never classifies stderr.
5. **Cancellation / teardown**: no `AbortSignal`, no `SIGINT`/`SIGTERM` handling, no kill-on-teardown; stdout is read but stderr is not, and the child is never reaped on cancellation.

**Card mapping**

- **`DSH-0.1.2-A1-05` · Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final text** (behavior, **`required-if-hit`**, #7) — *primary*. Key point: **rc.2's stdout was already the final assistant text (exit 0/1) and was never JSONL** — so the fixture's JSONL assumption was already wrong at the *baseline*, not a regression introduced by alpha.1. The only alpha.1 change is that stderr gains a `dsh: reasoning:` segment (rc.2's stderr was empty on success). Recipe: treat stdout as the final assistant-text channel (unless a specific entrypoint has its own structured contract); receive the reasoning segment / `dsh: <code>: <message>` on stderr; **judge success by exit code** (0 = completed, 1 = failure/abort/no completed turn); **do not `JSON.parse` stdout by default**. Verification matrix: plain-text success, reasoning present, empty final text, direct launch failure, non-zero exit.
  - Applied: both fixture sites must drop `JSON.parse` on stdout and use the raw stdout text as the answer; both must read stderr into a separate sink; the spawn site must resolve/reject on the **exit code**, not merely on `close`; and neither may treat "stderr has output" as failure, because a reasoning-bearing successful run would then be misreported.
- **`DSH-0.1.2-A1-04` · ACP/SDK examples merged into the `dsh` profile, standalone demo bins and packages removed** (behavior, required-if-hit, #4 + #7) — *adjacent*: the card's #7 leg covers wrappers that hard-code **bins** (`dsh-acp-demo`, `dsh-jsonrpc-agent`) or fixed profile paths. The fixture hard-codes the `dsh` binary and the profile name `headless` (a profile the card says was **added** in alpha.1), so the fixture's assumption that `headless` exists must be confirmed against the target tag; `dsh --profile headless ...` is the correct invocation shape. The card's field note also warns that a cold boot without credentials reports `dsh: MISSING_CREDENTIAL: ...` — a **profile configuration issue**, not a plugin defect.
- **`DSH-0.1.2-A1-13` · Platform shell and directory picker fixes may obsolete old workarounds** (fix, conditional, #4 + #7) — *conditional*: relevant only to persistent-shell / Windows picker workarounds; the fixture has none. Listed, not triggered.
- **`DSH-0.1.2-A1-06` · Code Mode renamed precisely to PTC mode** (breaking, required-if-hit, #2 + #3 + #5 + #7) — **not hit**: no `tools.mode: 'code'`, no `code` preset id, no `tools/code-dispatch-log`, no `CodeDispatch*`, no `tools:code-only`, no "Code Mode" copy — and none of the *preserved* identifiers (`run_code`, its `code` argument, `CodeSdkLanguage`, `CodeRunFailedError`, `dsh-code-runtime*`, persisted `tool/code-dispatch*`, plugin name `tools-code-mode`) appear either. The fixture's subprocess is a **headless CLI** call, not a PTC/code-mode surface. Listed to show it was considered and ruled out — and, importantly, it must **not** be applied here as a blanket `code` → `ptc` replace.
- **`DSH-0.1.2-A2-04` · Fix empty client graph for `dsh web` on Node.js 24.0–24.11.1** (fix, conditional, #7) — *conditional*: this card concerns **workarounds added for the Node 24.0–24.11.1 window** (forcing Node 22, skipping `dsh web`, probing the loader by major version). The fixture contains **none** of those workarounds, so it is listed, not triggered. It becomes relevant only if the plugin's own CI pins a Node version to dodge that defect — note `engines.node` is unchanged between the two tags (`^22.19.0 || >=24.0.0`), so do not look for an `engines` difference.
- **`DSH-0.1.2-A2-01` / `A2-03` / `A1-23` / `A1-24`** — *not applicable* to this class (event envelope, peer trimming, composition defaults, `pi-ai` bump).

**API-06** (corridor API ledger) · The Headless argv and process output contract — the authoritative channel table for this class, and it also confirms the argv rule the fixture already satisfies:

| Channel | alpha.2 contract |
|---|---|
| stdout | Final assistant text; **not JSONL**, no intermediate tool output |
| stderr | Reasoning deltas start with `dsh: reasoning:`; failures are `dsh: <code>: <message>` |
| exit 0 | Task completed |
| exit 1 | Abort, error, or no completed turn |

API-06 also states the `SIGINT` → 130 mapping, the supervisor's `SIGTERM` → 0 mapping (callers should still record the termination signal rather than infer state from stderr text), and that `--dump-config` is a composition check that starts no app. Best practice for this hit: argv arrays with `spawn`/`execFile` (no shell concatenation), the exit code as the success criterion, **consume stdout and stderr concurrently**, and handle cancellation, signals, spawn errors and teardown — the fixture currently does none of the last three.
---

## 3. Card-mapping summary (net final state)

Corridor folded to the **final target (alpha.2)**, not to per-version actions.

| Hit | Live cards (act now) | Folded / superseded | Considered and ruled out |
|---|---|---|---|
| #1 source patch | `DSH-0.1.2-A1-03`; `DSH-0.1.2-A1-01` (indirect) | — | — |
| #2 events | `DSH-0.1.2-A2-01` (+ API-05 capability-gap note) | **`DSH-0.1.2-A1-02` superseded by A2-01** — *not* an action item for an alpha.2 target | `DSH-0.1.1-R1-06` — pre-corridor, already satisfied (reads `event.type`; subscription unconditional) |
| #3 services/Remote | `DSH-0.1.2-A1-01`; `DSH-0.1.2-A2-02`; `DSH-0.1.1-R1-04`; `DSH-0.1.1-R1-05` | — | `DSH-0.1.2-A2-08`, `A2-06`, `A2-10`, `A1-20`, `A1-21`, `A1-22`, `A1-27`, `A1-30`, `A1-31`, `A1-32` — no hit |
| #4 host filesystem | `DSH-0.1.2-A1-04` | — | `DSH-0.1.2-A1-13`, `DSH-0.1.2-A1-21` — conditional, not triggered |
| #5 UI/commands | `DSH-0.1.2-A1-03` | — | `DSH-0.1.2-A1-25`, `A1-26`, `A1-09`, `A1-10`, `A1-11`, `A1-28`, `A1-29` — no hit |
| #6 custom channel | `DSH-0.1.2-A1-08`; `DSH-0.1.2-A1-19` (acceptance side) | — | `DSH-0.1.2-A1-28` — no hit |
| #7 subprocess/output | `DSH-0.1.2-A1-05`; `DSH-0.1.2-A1-04` | — | `DSH-0.1.2-A1-06`, `A1-13`, `A2-04` — conditional, not triggered |

### The corridor-fold decision, stated once

`ignorable` is the one field in this corridor that is **removed at an intermediate version and restored at the target**. The rule applied is the rollup's: "read the full corridor before touching anything: a field or its semantics may be removed in an intermediate version and restored in a later one … fold the corridor into its net state before modifying source — do not delete once for alpha.1 and then add it back for alpha.2; if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept."

Applied: **`DSH-0.1.2-A2-01` is the live card for #2; `DSH-0.1.2-A1-02` is retained only as the reason the fold is required.** Because A1-02's action level is literally `required-if-target-is-alpha.1` and this target is alpha.2, no marker deletion is warranted. The marker at `src/index.ts:17` **stays**. The residual work under A2-01 is not the marker but the **write surface**: the public `Session.append()` cannot set `ignorable`, so an unknown third-party event written through it will fail the **cold load**; out-of-repo producers should use a plugin-owned sidecar/store, and the envelope write must be verified by a persist → restart → reload test rather than a live smoke.

---

## 4. Why "no hit ≠ no problem" — and what a zero hit would *not* have discharged

**This fixture hits all seven classes**, so there is no genuinely empty category to report. To still answer the brief's third requirement, this section records, per class, what a *pattern-level* miss would have left undiscovered, plus the global limits that apply to any class regardless of hit count.

### 4.1 Per class: what a pattern miss would have hidden

| Class | Pattern-miss blind spot | Why the miss would still be a real problem |
|---|---|---|
| #1 | A patch expressed as a **real diff** (`.patch`/`.diff`), a `patch-package`/`patchedDependencies` entry, a post-install write into a published artifact, or a patch applied by a shell script — none match the regex set, yet all are monkey patches in the A1-03 sense. | A1-03's symptom is "patch target paths no longer work" — invisible to a filename regex, and it fails at compose time, not at build time. |
| #2 | A producer that writes through `Session.append()` (no `ignorable` parameter), an event type declared only in a **`SessionEventMap` augmentation**, a **computed** event name, or a durable event transported by a custom channel. | A2-01 / API-05's failure is **silent write / loud read**: the plugin works live, and the whole Session is refused on the next cold load. |
| #3 | A service obtained by **property access** (`ctx.llm`) instead of `ctx.get()`; a service key built at runtime; an internal call reached through a **dependency's** default rather than the plugin's own source. | A1-01's symptom is the removed `apiProxy` service and the Host/Client plane mix-up, whose wrong-branch failure is a **permanent `pending (waiting for service: remote)`** — install and typecheck both look fine. |
| #4 | A path assembled from **config** or an env var (`DSH_HOME`) rather than `homedir()`; a read/write that happens inside a dependency; a path reached through a symlink/junction. | A1-04 forbids hard-coded user directories; a config-driven path is *more* correct in form and can still point at the wrong profile. |
| #5 | A UI symbol imported from a **stable-looking** public entry that was nevertheless moved to another owning package; a slot registered under a computed name; a **type-only** import whose `.d.ts` is missing from the tarball. | API-07: "in the export map" ≠ "in the published artifact" — the failure is `ERR_MODULE_NOT_FOUND` at install, or selectors silently becoming `any`. |
| #6 | A route registered through the host's own `webServer` (so no `createServer`/`WebSocket` regex hit) yet still **outside** the Connection auth gate; a WS upgrade route; a DOM-level injection into the composer. | A1-08's own wording: custom routes "do not automatically inherit auth, the Host/Origin fence, CORS, or TLS". A route with no regex signature is exactly the one that silently bypasses the gate. |
| #7 | A wrapper using a library (`execa`, `Bun.spawn`) with different naming; a stream parser over stdout that assumes **any** structured format; a wrapper that checks only the exit code and discards stderr. | A1-05: stdout was **never** JSONL — a parser that does not look like JSONL can still be wrong; and reasoning on stderr must not be mistaken for failure. |

### 4.2 Global limits of this scan (apply even to the classes that hit)

1. **Heuristic, not proof.** `pre-flight.md` states it in its own preamble: zero hits across the seven classes "only means *not detected by the current patterns*". The pattern set is a regex list over file contents.
2. **No data-flow analysis.** The patterns cannot follow a value from a path-construction call into the file actually written, or from an import into the service it resolves to. `pre-flight.md` explicitly requires manual tracing after a path-construction hit.
3. **Curated cards are not a complete API diff.** The card files say so twice ("this file is a curated list of plugin-relevant changes, not a complete API diff"; "card sets are curated, not complete API diffs"). Silence about a surface is **not** evidence of compatibility. Concrete proof inside this very report: the **command-registration surface** (`ctx.contributes.registerCommand`) is mentioned by **no card** in the corridor, yet the fixture depends on it in #5.
4. **The fixture is not compilable or executable, by design.** Its header states "static fixture only. Do not execute or publish", and the skill's own reference states it "cannot compile" — so build, typecheck, dependency resolution, and runtime behaviour **could not be observed here**. Every runtime claim in this report is a *card-derived expectation*, not a measurement. Specifically unverified: whether `@deepseek-ai/dsh-session-view/internal` exists at the target tag (and whether the tarball contains it); whether the `session/event` write actually persists through the fixture's raw envelope; whether the `apiProxy` probe throws or merely never resolves; and whether `ctx.contributes.registerCommand` still exists.
5. **No dependency or configuration inventory was possible.** `fixture/package.json` has **no** `peerDependencies`, **no** `dependencies`, **no** `engines`, **no** `dsh.client` manifest row and **no** `dsh.bundle` row; there is no lockfile, no `dsh-plugin.json`, no `agent.cordis.yml`, no CI config. So the peer-floor / cohort-alignment layer (precision checklist: exact peer carets, `@deepseek-ai/cordis` `^4.0.1`, no `-rc` suffixes, peers superset-of inject) is **entirely unexamined**, and the composition layers that the fixture's `cordis.patch.yml` would land in (`$DSH_HOME/profiles/<name>/cordis.patch.yml`, `$DSH_HOME/cordis.patch.yml`, `--patch` overlays, bundle patches) are **unknown**.
6. **The `from` side is a *declared* version, not a *measured* one.** `fixture/package.json` says `"version": "0.1.1"` — that is the *plugin's* version, not the DSH host corridor; the brief pins the corridor start at rc.2. Nothing in the fixture proves which host it was built against, so the rc.2 baseline is an assumption inherited from the brief.
7. **The ghost-host question was not checked** — it cannot be: there is no running host in this scan. `pre-flight.md` §1.5 requires the `from` to be pinned to the **running process**, not to the disk. For a real migration of this plugin, that probe must run before these corridor conclusions are applied to a live host.
8. **Port / ownership / teardown questions are uncarded.** The fixture's fixed port 43121, its never-closed server, and its direct write into the host-owned `~/.dsh/profiles/default` directory are **not** covered by any card in this corridor. They need an explicit design decision (owner, lifecycle, profile resolution), not a card lookup.
---

## 5. Must-verify (not discharged by this scan)

Static scan only; per the skill's validation ladder these remain open and are **not** claimed as passed:

1. **Baseline (R-06)** — the fixture cannot build, so no baseline failure set can be collected here. In a real repo, collect the pre-migration build/typecheck/test failures first and exempt them.
2. **Dependency resolution** — with a real manifest, verify the DSH peer cohort, `@deepseek-ai/cordis` `^4.0.1`, no `-rc` suffix, peers superset-of inject, and the **full lockfile** for the old cohort (rollup R-01 / R-05).
3. **Enablement resolution** — `dsh --profile <p> --dump-config`: no pending lines, correct row id/name, whole-config replacement semantics for the `legacy-plugin` row, and the composition layer that actually picks up `patch.yml`.
4. **Patch surface** — compose `patch.yml` against the **target-tag** host source: `src/session/view/SessionView.ts` and the `renderSessionView` anchor must each map to a target file or an explicit removal reason; otherwise **pending confirmation**, not a guessed path.
5. **Real mount** — cold-boot a real profile; confirm the entry activates, the `apiProxy` probe no longer waits forever, and no service stays `pending`.
6. **Behaviour** — one message → tool → response round for the event path; one live call of each renamed command (`session.rename` and the split `llm/listProviders` + `llm/listConfigurableProviders`); a **persist → cold-load** round-trip for the `legacy/informational-note` event (the one that fails "loud" while every live smoke stays green).
7. **Channel auth** — if the loopback bridge is activated, prove wrong Host/Origin → 403 and missing/bad Cookie → 401, and that the rejection guard precedes every side effect.
8. **Headless wrapper** — run the stub matrix (plain-text success, reasoning success, task failure with exit 1, spawn error) and confirm stdout is treated as final text, stderr is a separate reasoning/diagnostic sink, and the exit code is the success criterion.
9. **Command seam** — confirm `ctx.contributes.registerCommand` and the `SessionView` import against the target tag's exports **and** packed artifact (API-07), because no card covers the command surface.

---

## 6. Pre-existing / completed / skipped / pending / rollback

- **Pre-existing (baseline)**: not collected — the fixture is not buildable by design, so no attribution list can be produced.
- **Completed (this task)**: read-only scan of all 6 fixture files; independent re-run of the 7-class pattern set with exact line attribution; corridor `rc.2 → alpha.1 → alpha.2` read and folded to net state; hit→card mapping per class; negative controls recorded (`cordis.patch.yml` = composition; producer vs observer; R1-06 already satisfied; A1-06 / A1-26 / A2-06 / A2-08 / A2-10 / A1-28 ruled out); fixture integrity re-verified against the seal hashes (6/6 MATCH).
- **Skipped (no hit / not applicable)**: `DSH-0.1.2-A1-06`, `A1-07`, `A1-09`, `A1-10`, `A1-11`, `A1-12`, `A1-14`, `A1-20`, `A1-22`, `A1-23`, `A1-24`, `A1-25`, `A1-26`, `A1-27`, `A1-28`, `A1-29`, `A1-30`, `A1-31`, `A1-32`, `DSH-0.1.2-A2-03`, `A2-05`, `A2-06`, `A2-08`, `A2-10`, and `DSH-0.1.1-R2-01/02/03` — each with the reason given above.
- **Pending / residual risk**: the command-registration surface has no covering card; the patch target's new owning path is unknown until compared against the target tag; the Host-vs-Client plane for this plugin must be confirmed from its real deployment shape; the event write surface is a documented capability gap under A2-01; port ownership/teardown and profile-directory write ownership are uncarded; no dependency, peer, composition, build, typecheck or runtime evidence exists for this fixture.
- **Rollback**: nothing to roll back — **no file under `fixture/` was modified**; the only artifact written is this report under `agent-output/S1-static-scan/`. Verified after the scan against `fixture-seal.pre.json`: 6/6 files byte-identical, 0 added, 0 removed.
- **Recommendations**: treat the live cards above as the migration work-list, in the order **#1/#5** (one pass against one target tag — both hinge on the same session-view split) → **#3** (A1-01 + A2-02 together; on the Host plane inject the owning domain service, not `remote`) → **#7** → **#2** (A2-01 net state; keep `ignorable`) → **#6** → **#4**. Adopt public seams — a public command/UI facet, domain services, a host-gated channel, `DSH_HOME`-relative profile resolution, an exit-code-driven headless wrapper — rather than adding further internal imports. Do **not** apply a blanket `code` → `ptc` rename (A1-06 is not hit), and do **not** delete the `ignorable` marker (A1-02 is superseded).

---

*Report produced read-only under the plugin-upgrade skill, Mode A (inspect). Reference material consulted: `references/pre-flight.md`, `references/pre-flight-patterns.json`, `references/README.md`, `references/v0.1.1-rc.1.md`, `references/v0.1.1-rc.2.md`, `references/v0.1.2-alpha.1.md`, `references/v0.1.2-alpha.2.md`, `references/api-migration-0.1.2-alpha.2.md`, `references/rollup-0.1.2.md`, `references/precision-checklist.md`, `references/troubleshooting.md`, `scripts/plan-migration.mjs`, `scripts/README.md`. Card IDs and key points only are cited, per the citation contract.*
