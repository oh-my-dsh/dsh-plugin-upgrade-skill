# S1 · Static Touchpoint Scan Report — `legacy-plugin` fixture

- **Mode**: A · inspect (read-only static scan; no migration performed, no install)
- **Scan target**: `fixture/` (verbatim static fixture of the seven touchpoint classes; not an installable plugin, never executed)
- **Corridor**: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (two edges, resolved via the `from → to` index in `references/README.md`, not filename order)
- **Card sets read**: `references/v0.1.2-alpha.1.md` (28 cards, `DSH-0.1.2-A1`), `references/v0.1.2-alpha.2.md` (8 listed cards, `DSH-0.1.2-A2`), plus the exact interface ledger `references/api-migration-0.1.2-alpha.2.md` (API-01…API-10, CFG-01) and the corridor rollup `references/rollup-0.1.2.md`
- **Method**: full read of every fixture file; pattern sweep per the seven classes in `references/pre-flight.md`; cross-checked with the read-only planner (`node skills/plugin-upgrade/scripts/plan-migration.mjs --root fixture --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2 --format json`), which detected all 7 touchpoints and resolved the corridor with **no unsupported gaps**. Planner output is heuristic; the mapping below is filtered by actual coupling evidence and face, per Mode C step 4.
- **Read-only attestation**: `git status --porcelain -- fixture/` and `git diff HEAD -- fixture/` are both empty after the scan — the evidence pack is byte-identical to git HEAD. Only reads and the read-only planner run were performed; the planner was used in its verified read-only posture (no output files, no writes). Nothing outside the workspace was touched.

## Touchpoint checkup (`legacy-plugin`, `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2`)

| Touchpoint | Hit | File / line | Applicable card(s) | Note |
|---|---:|---|---|---|
| #1 source patch | YES | `cordis.patch.yml:5-6`, `patch.yml:2-7`, `scripts/apply-patch.mjs:5-19` | **DSH-0.1.2-A1-03** (+ classification per API-08) | Real host-source patch surface, not mere composition |
| #2 internal/persistent events | YES | `src/index.ts:15-19` (producer), `:20-22` (observer) | **DSH-0.1.2-A2-01** (final net), folds **DSH-0.1.2-A1-02**; caveat API-05 | Removed in alpha.1, restored in alpha.2 → keep the marker |
| #3 internal service / Remote | YES | `src/index.ts:26-27, 30-31` | **DSH-0.1.2-A1-01**, follow-on **DSH-0.1.2-A2-02** | `apiProxy` service key + 2 old operations gone |
| #4 host directory | YES | `src/index.ts:36-37` | **DSH-0.1.2-A1-04** (A1-13 conditional, not evidenced) | Hard-coded `~/.dsh/profiles/default` |
| #5 UI / commands / tools | YES | `src/index.ts:10`, `:41-43` | **DSH-0.1.2-A1-03** | `/internal` import + internal view construction in a command |
| #6 custom channel | YES | `src/index.ts:47-54` | **DSH-0.1.2-A1-08** (security) | Raw loopback HTTP server bypassing the Connection auth gate |
| #7 subprocess / output | YES | `src/index.ts:57-67`, `scripts/apply-patch.mjs:11-19` | **DSH-0.1.2-A1-05** (+ API-06 ledger); secondary A1-04 | JSON.parse on headless stdout; stderr + exit code ignored |

**All seven categories hit.** There is no hit-free category in this fixture; the "no hits" protocol is therefore applied at the sub-surface level in section "Scan scope, negatives, and why 'no hit' ≠ 'no problem'".

---

## Per-touchpoint detail

### #1 Source patch / monkey patch — HIT

**Hit files/lines**

- `fixture/cordis.patch.yml:5-6` — declares `patch: [- patch.yml]` under the profile row: the composition file itself points at a source-patch surface.
- `fixture/patch.yml:2-7` — the actual patch declaration: `surface:` → `target: src/session/view/SessionView.ts` with a find/replace pair (`export function renderSessionView` → `...Patched`). This targets a **host source file** (a session-view internal), with the classic monkey-patch shape.
- `fixture/scripts/apply-patch.mjs:5-6,8` — reads `process.env.DSH_HARNESS_SOURCE_ROOT` and the patch file: the dsh-tui-style patch-surface application flow (applies a source overlay against a checked-out host source root).

**Coupling points**

- The patch target path `src/session/view/SessionView.ts` is a Host session-view internal that alpha.1's UI decomposition split up extensively (A1-03): the target path almost certainly does not exist at the target tag. Per A1-03 and pre-flight #1: record the target path and replacement intent, then mark **pending confirmation** — every old target must map to a target-version file via an exact-tag compare, or carry an explicit removal reason. No new path may be guessed.
- Classification discipline (API-08): an ordinary `cordis.patch.yml` is **profile composition, not a source patch**; a filename containing "patch" alone is not a hit. Here the hit is real because of the declared `surface:` against host source plus the `DSH_HARNESS_SOURCE_ROOT` applier — but the composition rows (`id`/`name`/`config`) in `cordis.patch.yml` remain composition and migrate by composition rules (row/id/inject/config whole-object replacement), a different verification path than the source patch.

**Card mapping**: `DSH-0.1.2-A1-03` (breaking, required-if-hit, touchpoints #1/#5). Supplementary: API-08 (classification), API-07 (if the surface were shipped via `dsh.bundle.patch`, the patch file must actually be in the packed artifact).

### #2 Internal event names and persistent events — HIT (corridor folding applies)

**Hit files/lines**

- `fixture/src/index.ts:15-19` — producer: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: … })`. A third-party **persisted** informational session event carrying the `ignorable: true` marker; event type `legacy/informational-note` is unknown to first-party readers.
- `fixture/src/index.ts:20-22` — observer: `ctx.on('session/event', …)` (plain observer role; no persistence/reload/transport ownership in the fixture).

**Coupling points**

- The `ignorable` marker on an unknown third-party persisted event is exactly the surface of the A1-02/A2-01 pair. Without the marker, an unknown persisted event is **required-on-read**: first-party readers reject the reload (fail closed). With it, old readers may omit its semantics.

**Card mapping — corridor folding (the requested net-state reasoning)**

- `DSH-0.1.2-A1-02` (alpha.1): `SessionEvent.ignorable` **temporarily removed**; action level `required-if-target-is-alpha.1`. For a target of alpha.2 this card is **folded away / no-op**: its own recipe says "If the final target is alpha.2 or later, first read DSH-0.1.2-A2-01 to compute the corridor net state; do not delete the producer marker and then restore it."
- `DSH-0.1.2-A2-01` (alpha.2): **restores** `ignorable` retention semantics for third-party persisted events. Net final state across the corridor: **the field is retained** — so the correct migration action for this hit is: **keep `ignorable: true` on the producer; do not remove and re-add anything.** The hit is mapped to `DSH-0.1.2-A2-01` as the final-net card, with `DSH-0.1.2-A1-02` recorded as folded.
- Residual caveat (API-05): alpha.2 restores the envelope/persistence/reload/transport retention of the field, but the public `Session.append()` still cannot write `ignorable`. The fixture's producer seam is `ctx.emit('session/event', …)`, not the public append — whether that seam persists the marker end-to-end at the target tag is **pending confirmation**; do not fake a public entry via cast. Verification must include a real persist → cold-load cycle (silent write / loud read cannot be caught by a live smoke).

### #3 Internal service probes / Remote — HIT

**Hit files/lines**

- `fixture/src/index.ts:25-28` — service `rename-session`: `const apiProxy = await ctx.get('apiProxy')` (line 26) → `apiProxy.invoke('session.rename', { id, title })` (line 27).
- `fixture/src/index.ts:29-32` — service `list-providers`: `ctx.get('apiProxy')` (line 30) → `apiProxy.invoke('llm.providers')` (line 31).

**Coupling points**

- Service key `apiProxy` (type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`): deleted in alpha.1 (A1-01 identifiers note: "alpha.1 deletes that package; there is no `APIProxy` identifier"). Both `ctx.get('apiProxy')` probes and every `invoke` go away.
- Operation `session.rename` → Remote `session/rename` (client face: `ctx.remote.session.rename`; note `sessionTitle/rename` in the architecture note is a design draft).
- Operation `llm.providers` → **split into two**: `llm/listProviders` + `llm/listConfigurableProviders`.
- Face determination (API-01, A1-01 field note): the fixture is an ordinary Cordis server-side/host-plane plugin (`ctx.register` + `ctx.get`, no browser bundle, no `dsh.client`). Host-plane apiProxy consumers must **skip the gateway and inject the owning domain service directly** (e.g. `inject: ['llm']` then `ctx.llm.listProviders()`); mechanically swapping `apiProxy` → `remote` on the host plane pends forever (`pending (waiting for service: remote)`). The `ctx.remote.*` table applies only to the Web Client face.
- Error handling: the fixture handles no failures at all. Once calls move to Remote, they resolve to `RemoteResult<T>`; at alpha.2 failures are `RemoteError` instances with namespaced codes (`session/not-found`, `gateway/cancelled`, …) — the successor calls must branch on `result.ok` / `result.error.code`, not `catch`/`message` parsing/`instanceof`.

**Card mapping**: `DSH-0.1.2-A1-01` (breaking, required-if-hit, touchpoint #3) — primary; `DSH-0.1.2-A2-02` (breaking, touchpoint #3) — follow-on for the replacement calls' error vocabulary, explicitly cross-referenced by A1-01; ledgers API-01 and API-02.

### #4 Direct host directory reads/writes — HIT

**Hit files/lines**

- `fixture/src/index.ts:35-38` — service `write-note`: `join(homedir(), '.dsh', 'profiles', 'default')` (line 36) → `writeFileSync(join(profileDir, 'legacy-note.txt'), text)` (line 37).

**Coupling points**

- Hard-coded user-home profile path `~/.dsh/profiles/default` built from `homedir()`; ignores the runtime `DSH_HOME` and the actual profile name; writes directly into the host home/profile directory (an area the plugin does not own).
- A1-04's recipe: use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; do not hardcode user directories. Data flow confirmed by tracing: `homedir()` → path join → `writeFileSync` target.

**Card mapping**: `DSH-0.1.2-A1-04` (behavior, required-if-hit, touchpoints #4/#7) — primary. `DSH-0.1.2-A1-13` (fix, conditional, #4/#7) is listed by pre-flight for this class but **not evidenced**: the fixture contains no platform workaround being removed. `DSH-0.1.2-A1-21` (#3/#4) not hit — no `resolveSessionPreset` / preset `roots` usage.

### #5 Internal UI / commands / tool registration — HIT

**Hit files/lines**

- `fixture/src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` — a private Host/Web Client `/internal` subpath import (matches pre-flight #5 pattern `/internal`; also API-07's deep-subpath risk class).
- `fixture/src/index.ts:40-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))` — command registration whose implementation constructs the internal session view directly.

**Coupling points**

- The `/internal` import breaks the moment alpha.1 splits the session-view internals (A1-03: "Patch target paths, internal imports, or UI registration points no longer work"). There is no declared dependency owner for `@deepseek-ai/dsh-session-view` anywhere in `package.json` (no dependencies/peerDependencies at all — see negatives), so even type ownership is unassigned.
- Migration posture per A1-03: rebuild imports by owning module against the exact target tag; capabilities with no stable public seam are **pending confirmation** — do not guess new paths; prefer public facets/services and avoid adding new internal imports.
- Not hit here (ruled out explicitly): `dsh-client-runtime` imports/inject (A1-25/API-10), Host `ctx.commands.execute` signature change (API-10 — the fixture registers a command, it does not execute Host commands), `__ModuleLoader__`/`PLUGIN_ID` client-bundle id contract (A1-26 — no client bundle), `MarkdownText` labels (A1-29), workspaces navigation (A1-32).

**Card mapping**: `DSH-0.1.2-A1-03` (breaking, required-if-hit, touchpoints #1/#5).

### #6 Custom HTTP / WS / RPC / DOM / CSS channels — HIT

**Hit files/lines**

- `fixture/src/index.ts:47-54` — `startLegacyBridge()`: raw `createServer` from `node:http` (line 48), `server.listen(43121, '127.0.0.1')` (line 51), serving any path (comment: `http://localhost:43121/api/legacy`) with an unauthenticated `response.end('legacy')`.

**Coupling points**

- A custom loopback HTTP channel **outside** the Host Gateway/Connection auth model — not even registered via `ctx.webServer.register()`, so it cannot inherit anything. Under A1-08, official `/api` routes go through the Connection auth gate (process-scoped bootstrap token → signed cookie, Host/Origin fence), while custom/raw routes inherit nothing: "listening on loopback only" is explicitly not a reason to skip authentication (pre-flight #6); an unauthenticated private route is a security hole, and network-reachable old channels get 401/403.
- Static-only caveat: the function is **never invoked** (`void startLegacyBridge`, line 54) — behaviorally dead code, but the static coupling hit stands and any future invocation would silently bypass host auth.

**Card mapping**: `DSH-0.1.2-A1-08` (security, required-if-hit, touchpoint #6). Not hit: A1-28 (no DOM/composer manipulation), A1-19 (no web root URL / boot-manifest / acceptance-script coupling).

### #7 Subprocess / stdout / stderr parsing — HIT

**Hit files/lines**

- `fixture/src/index.ts:57-67` — service `headless-ask`: `spawn('dsh', ['--profile', 'headless', prompt])` (line 59); per-`data`-chunk `JSON.parse(line.toString())` on **stdout** expecting `{type:'final', text}` (lines 61-64); `child.on('close', () => resolve(result))` (line 65) — exit code and stderr unused; no cancellation/abort handling.
- `fixture/scripts/apply-patch.mjs:11-19` — `execFileSync('dsh', ['--profile', 'headless', 'ping'])` (line 12) → splits stdout by newline and `JSON.parse(line)` per line (lines 15-18), same wrong JSONL expectation (comment at line 11 admits it).

**Coupling points**

- **stdout is not JSONL and never was** — rc.2's headless stdout was already the final assistant text (A1-05 cites `packages/bundle/headless/src/index.ts:129`); `JSON.parse` on it fails on ordinary final text. This is a pre-existing wrong assumption the corridor does not fix, but A1-05/API-06 pin the target contract.
- alpha.1 change (A1-05): **stderr gains a `dsh: reasoning:` segment** (rc.2's stderr was empty on success); failures are `dsh: <code>: <message>`. The fixture ignores stderr entirely → loses reasoning and misjudges runs.
- Exit code is the success criterion (0 completed / 1 failure-abort-no-turn; SIGINT→130, SIGTERM→0 in alpha.2 supervisor) — the fixture ignores it.
- The argv shape `dsh --profile headless <task>` (launcher flags before the task) is itself correct on both ends (A1-04: `--profile` existed in rc.2) — the violation is purely output interpretation plus missing stderr/exit/cancellation handling.

**Card mapping**: `DSH-0.1.2-A1-05` (behavior, required-if-hit, touchpoint #7) — primary, with the API-06 contract table as the ledger. Secondary: `DSH-0.1.2-A1-04` (#4/#7, profile-path/bin coupling — the headless profile path itself is valid at target). Not evidenced: `DSH-0.1.2-A2-04` (no Node-24 workaround present to remove), `DSH-0.1.2-A1-13` (no platform-shell workaround present).

---

## Corridor folding summary (explicit)

| Card | Edge | Effect | Net treatment for target alpha.2 |
|---|---|---|---|
| `DSH-0.1.2-A1-02` | rc.2 → alpha.1 | removes `SessionEvent.ignorable` retention | **Folded (no-op)** — action level is `required-if-target-is-alpha.1`; its own recipe forbids delete-then-re-add when the final target is alpha.2+ |
| `DSH-0.1.2-A2-01` | alpha.1 → alpha.2 | restores `ignorable` retention for third-party persisted events | **Final-net card for hit #2**: keep the producer's `ignorable: true`; verify persistence end-to-end; producer seam itself remains a capability gap (API-05) |

Rule applied (pre-flight step 1.3 / references/README.md): read the full corridor first and fold "removed then restored" before producing the change plan. No other card pair in this corridor folds (no other removal is undone inside the corridor).

---

## Scan scope, negatives, and why "no hit" ≠ "no problem"

**Requirement 3 status**: all seven touchpoint categories produced hits, so there is **no category with zero hits** in this fixture. The no-hit protocol is nevertheless discharged at the level where it actually operates — sub-surfaces and cards that the sweep covered and ruled out:

- **Files scanned (complete)**: `fixture/src/index.ts` (69 lines), `fixture/scripts/apply-patch.mjs` (20 lines), `fixture/cordis.patch.yml`, `fixture/patch.yml`, `fixture/package.json`, `fixture/README.md` (documentation only). No other source, test, CI, lockfile, or manifest exists in the fixture; `node_modules`/generated artifacts are absent.
- **Tokens/patterns swept with zero hits** (grep-verified over `.ts/.mjs/.yml/.json`): `dsh-client-runtime`, `useSession`/`useChat`, `connectWorkspace`/`pickDirectory`/`baselinesReady` (→ A1-25, A1-32, API-10 not applicable), `registerProvider`/`user-questions` (→ A1-20), `resolveSessionPreset` (→ A1-21), `isTokenDelta` (→ A1-22), `settingsNamespace`/`installSettingsSection` (→ A2-10, API-03), `tools.mode`/`code-dispatch`/`CodeDispatch`/`code-only` (→ A1-06/CFG-01), contenteditable/DOM tokens (→ A1-28), `WebSocket`/`MutationObserver`/`insertRule` (→ #6 DOM/WS sub-surfaces), `__ModuleLoader__`/`PLUGIN_ID` (→ A1-26), `ctx.remote`/`ctx.workspaces`/`ctx.tools`/`commands.execute` (→ not yet migrated, and no Host command execution), `connection.api` (→ A1-30), `pluginInventory` (→ A2-05/API-09), `sessionProjections` (→ A2-08), `Session.append` (→ API-05 append seam), `node_modules`/lockfile/`peerDependencies` (→ A1-24, A2-03 — the fixture declares **no** DSH dependency cohort at all).
- **Planner negatives**: the heuristic planner also surfaces touchpoint-intersection-only candidates (e.g. A1-06, A1-07, A1-09…A1-11, A1-19…A1-32, A2-02…A2-10). Per Mode C step 4 these were filtered by actual coupling evidence and face; the ruled-out list above is the outcome, not the planner's.
- **Why "no hit" cannot be concluded as "no problem"** (and why the same caution would apply to any zero-hit category):
  1. The card sets are **curated, not a complete API diff** (stated on every card file and in references/README.md) — an unaffected-looking surface may still have changed without a card.
  2. The pre-flight sweeps are **heuristic regexes**: a line-level search cannot see data flow, dynamic imports, indirection through helpers, or generated code (pre-flight #4 says exactly this; the planner's own limits section repeats it: zero hits do not prove public-contract-only coupling).
  3. This is a **static** scan only: build/typecheck, target-tag type resolution, a real profile mount (`verify-runtime` layer), and a functional smoke were **not** run and cannot be substituted by the scan. The fixture is designed not to compile — nothing here is executable proof either way.
  4. Sub-surface negatives depend on the patterns' coverage; an unknown required event, an unlisted internal path, or an undeclared dependency (this fixture declares no `@deepseek-ai/*` cohort at all — its own packaging is unresolved) can slip through a whitelist-style rule.
  5. Host-side "no card" changes do not prove absence of API impact — both card files end with the same warning.

## Must verify (out of scope for this static pass)

1. Exact-tag source compare for the #1 patch surface (`src/session/view/SessionView.ts`) — map or declare removal, no guessed paths (A1-03).
2. Cold-load persistence test for the #2 event (persist → restart → reload with and without the marker) (A2-01, API-05).
3. Face-confirmed migration compile of the #3 calls (host-plane direct service injection vs client `ctx.remote`), with success / domain-failure / `gateway/cancelled` coverage (A1-01, A2-02, API-01/02).
4. `DSH_HOME`-based path replacement for #4 plus a cold boot on an isolated profile (A1-04).
5. Typecheck with `skipLibCheck: false` once target devDependencies exist, to expose declaration owners for the #5 internal import (A1-03, API-10 dependency-ownership rule).
6. Auth review of the #6 bridge (and removal or wiring into a Connection-owned carrier if revived) (A1-08).
7. Headless stub-matrix rerun for #7: plain-text success, reasoning-on-stderr, failure, non-zero exit (A1-05, API-06).

---

*Report generated by a read-only static scan; no file under `fixture/` was modified (verified against git HEAD), no migration or installation was executed.*
