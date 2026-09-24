# S1 · Static Touchpoint Scan Report — legacy-plugin (dsh 0.1.1 era → 0.1.2-alpha.2)

**Scan mode**: read-only static inspection. No file under the fixture directory was created, modified, deleted, or renamed; no migration or installation was executed. The fixture itself declares it is a static, non-installable, non-compilable test fixture by design.

**Corridor**: `0.1.1-rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2`, i.e. card sets `DSH-0.1.2-A1-*` (28 cards, from rc.2 to alpha.1) and `DSH-0.1.2-A2-*` (8 cards, alpha.1 to alpha.2). The rc.1→rc.2 card set (`DSH-0.1.1-R2-*`) is *before* the corridor's `from` and is out of scope. Card IDs below use the short form (`A1-01`); full IDs are `DSH-0.1.2-A1-01` / `DSH-0.1.2-A2-01`.

**Files scanned (exhaustive — the fixture contains nothing else)**:

| File | Lines | Role |
|---|---|---|
| `README.md` | 16 | fixture description (not plugin code) |
| `cordis.patch.yml` | 6 | profile composition + source-patch declaration |
| `patch.yml` | 6 | source patch surface |
| `package.json` | 9 | manifest (name `legacy-plugin`, version 0.1.1, private, ESM, no deps) |
| `scripts/apply-patch.mjs` | 19 | patch-apply / headless-wrapper script |
| `src/index.ts` | 68 | plugin entry (`activate(ctx)`, host-plane) |

**Result overview**: all seven touchpoint categories HIT. There is no no-hit category; the "no-hit ≠ no problem" caveat is still recorded at the end because it bounds what this scan proves.

---

## #1 Source patch / monkey patch — HIT

**Hits**:

- `cordis.patch.yml:5-6` — declares `patch: [patch.yml]`, tying profile composition to a source-patch surface. (Note per pre-flight/API-08: an ordinary `cordis.patch.yml` is profile composition, not itself a patch hit — the hit is the declared `patch:` surface.)
- `patch.yml:2-6` — `surface:` with `target: src/session/view/SessionView.ts` and a text replacement renaming `export function renderSessionView` → `renderSessionViewPatched`.
- `scripts/apply-patch.mjs:5-6, 8` — requires `DSH_HARNESS_SOURCE_ROOT` and reads `patch.yml`, i.e. a source-tree patch application flow.

**Coupling points**: a hardcoded host source path (`src/session/view/SessionView.ts`) and a symbol-level find/replace against host source text.

**Card mapping**: **A1-03** (Session view internals split up extensively; touchpoints #1, #5; breaking, required-if-hit). The session-view module is exactly the area alpha.1 restructured; both the patch target path and the `find` anchor (`renderSessionView`) must be re-validated against an exact-tag compare of `dsh-v0.1.2-alpha.2`; every old target must map to a target-version file or state an explicit removal reason — mark "pending confirmation", do not guess new paths. (A1-01 lists #1 as an indirect touchpoint too, via the apiproxy package deletion changing the source tree.)

## #2 Internal/persistent events — HIT

**Hits**:

- `src/index.ts:15-19` — **producer**: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: {...} })` — a third-party *persisted/informational* SessionEvent carrying the `ignorable` marker.
- `src/index.ts:20-22` — **observer**: `ctx.on('session/event', ...)` logs `event.type` (plain observer role; low risk).

**Card mapping — this is the corridor-folding case**:

- **A1-02** (`SessionEvent.ignorable` temporarily removed; breaking; required-if-target-is-alpha.1): alpha.1 cannot preserve `ignorable: true` on third-party informational events; first-party readers reject reloads of sessions containing the unknown event.
- **A2-01** (Restore `SessionEvent.ignorable`; fix; required-if-hit): alpha.2 restores the retention semantics of envelope/persistence/reload/transport.

**Net state after folding (target = alpha.2)**: the marker's producer/persistence contract is **restored** — the fixture's `ignorable: true` producer must be **kept as-is**, not "migrated away". Do not delete the producer marker and re-add it later. Two residual cautions from A2-01: (a) the corridor must not *land* on alpha.1 as an intermediate milestone — the event would be unwritable there; (b) the public live `Session.append(...)` still has no `ignorable` parameter — this fixture's `ctx.emit('session/event', ...)` producer seam is a capability gap to mark explicitly, not something to fake through a public API cast. Unknown events without the marker remain required-on-read; the observer at :20-22 needs no change.

## #3 Internal service / Remote — HIT

**Hits**:

- `src/index.ts:26-27` — `ctx.register('rename-session')` → `await ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', { id, title })`.
- `src/index.ts:29-31` — `ctx.register('list-providers')` → `ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')`.

**Coupling points**: the rc.2 host-plane `apiProxy` service key (package `@deepseek-ai/dsh-host-apiproxy`, deleted in alpha.1) and two of its dotted operations.

**Card mapping**:

- **A1-01** (APIProxy removed, calls moved to `@Remote`; breaking; required-if-hit) — primary. Per its migration table: `session.rename` → `session/rename` (`ctx.remote.session.rename`, client plane); `llm.providers` splits into `llm/listProviders` + `llm/listConfigurableProviders`. **Plane determination (A1-01 field note)**: this plugin's `activate(ctx)` in `src/index.ts` is host-plane/server-side, so the correct migration is *not* `inject: ["remote"]` but injecting the domain service behind the old gateway directly (e.g. `inject: ["llm"]`, `ctx.llm.listProviders()`); `ctx.remote.*` applies only to a browser/client-plane half (which would additionally require `dsh.client` in package.json per A1-26's scan contract).
- **A2-02** (Remote failures become `RemoteError`, namespaced codes; breaking; required-if-hit) — applies if any call moves to the client-plane Remote face: handle `RemoteResult<T>` branches, use namespaced codes (`session/not-found`, `gateway/cancelled`, …), never `instanceof` across realms; note the call *shape* is unchanged from rc.2.
- Related but **not hit**: A2-06 (`$host.home`), A2-08 (`sessionProjections` inject), A1-27/A1-30/A1-32 (client-plane session/workspace reads) — no corresponding call sites in this fixture.

## #4 Host filesystem (direct host directory reads/writes) — HIT

**Hits**:

- `src/index.ts:36-37` — `join(homedir(), '.dsh', 'profiles', 'default')` then `writeFileSync` into it: a hardcoded Host/profile path plus a direct write into host-owned storage.

**Card mapping**: **A1-04** (ACP/SDK examples merged into the `dsh` profile; behavior; required-if-hit; touchpoints #4, #7). Profiles live under `$DSH_HOME/profiles`; wrappers that hardcode fixed profile paths or user directories no longer match. Migration: use runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth; do not hardcode user directories. (Secondary: the write itself bypasses any host storage service — a hygiene concern flagged by the scan, no dedicated corridor card.)

## #5 Internal UI / commands / tools — HIT

**Hits**:

- `src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`: a private/internal Host-Web Client path.
- `src/index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', ...)` constructing `new SessionView({ enhanced: true })`: private UI/command registration built on that internal symbol.

**Card mapping**:

- **A1-03** (primary; touchpoints #1, #5): internal imports and UI registration points in the session-view area no longer work; rebuild imports by owning module, prefer public facets/services, mark missing stable public seams "pending confirmation".
- **A1-25** (`dsh-client-runtime` removed, symbols migrated by domain; breaking) — the same client-symbol redistribution this internal import depends on; if any client half is ever built, the owning-package mapping in A1-25 applies and package.json must drop phantom client-runtime references. (Not directly imported here, hence secondary.)
- **A1-26** (client-modules scan: registration id == package.json name) — conditional: only if this plugin grows a Web Client half; today it has none, so no action, but it bounds any future client build.
- `registerCommand` itself: `command.list/execute` were already Remote in rc.2 (A1-01 table note) — no dedicated removal card for command *registration*; the collision is the internal import + UI construction (A1-03), not the registration call.

## #6 Custom channel (HTTP/WS/RPC/DOM) — HIT

**Hits**:

- `src/index.ts:47-54` — `startLegacyBridge()`: `createServer` listening on `127.0.0.1:43121` (`http://localhost:43121/api/legacy`), explicitly documented in-source as bypassing the Host Gateway authentication model. The function is never invoked (`void startLegacyBridge`), but the coupling exists in shipped source.

**Card mapping**: **A1-08** (Web/API channels use process-scoped bootstrap tokens and signed cookies; security; required-if-hit; touchpoint #6). Custom loopback routes that bypass the Connection auth gate become security holes; loopback is *not* exempt. Migration per the card: custom routes registered outside the Connection must call `ctx.connection.requestRejection(req)` first (gaining Host/Origin fence, CORS, cookie auth) or move to a Connection-owned carrier; the bootstrap token is redeemed only via `GET /?token=...` → 303 + HttpOnly cookie, never placed in `/api`/WS URLs or headers. Verification demands wrong-Host/Origin → 403 and missing cookie → 401 before the route counts as protected. (Not hit: A1-28 composer DOM change — no DOM manipulation in this fixture.)

## #7 Subprocess / output parsing — HIT

**Hits**:

- `scripts/apply-patch.mjs:12-18` — `execFileSync('dsh', ['--profile','headless','ping'])` then `JSON.parse` of **every stdout line**, expecting JSONL events with `event.type === 'final'`.
- `src/index.ts:57-66` — `ctx.register('headless-ask')` spawning `dsh --profile headless <prompt>` and `JSON.parse`-ing each stdout data chunk for `type: 'final'`.

**Coupling points**: the wrapper assumption that headless stdout is a JSONL event stream.

**Card mapping**:

- **A1-05** (Headless: stderr gains `dsh: reasoning:`; stdout remains the final text; behavior; required-if-hit; touchpoint #7) — primary. Key fact: **stdout was already plain final assistant text in rc.2 and was never JSONL**; the fixture's parsing is wrong on the *base* version too, so this is a pre-existing defect the upgrade forces fixing, not a regression introduced by the corridor. Alpha.1's only change is the new stderr `dsh: reasoning:` segment. Migration: treat stdout as final text, judge success by exit code (0/1), never `JSON.parse` stdout; don't treat "stderr non-empty" as failure.
- **A1-04** (touchpoints #4, #7, secondary): wrappers spawning `dsh` bins / depending on process trees and profile resolution must follow the runtime `DSH_HOME`/official-launcher source of truth (the removed standalone demo bins `dsh-acp-demo`/`dsh-jsonrpc-agent` are not referenced here — no direct hit on that clause).

---

## No-hit categories

None — all seven categories hit in this fixture (it was constructed as a seven-touchpoint positive sample). For completeness, surfaces checked and ruled out beyond the hits:

- `package.json`: no `@deepseek-ai/*` dependencies, no `dsh.client`/`dsh.client.inject`, no peers — so packaging cards **A2-03** (peer trims), **A1-24** (pi-ai duplicate instance), **A1-22** (`isTokenDelta`), **A2-10** (`settingsNamespace`), **A1-21** (`resolveSessionPreset`), **A1-20** (`userQuestions.registerProvider`), **A1-31** (subagent descriptor v3), **A1-23** (base composition defaults) have no call sites here.
- No Web Client half exists → client-only cards (A1-26/A1-27/A1-28/A1-29/A1-30/A1-32, A2-04 Node loader workaround, A2-06 `$host`) are out of this plugin's plane today.

**Why "no hit" would still not prove "no problem"** (per the pre-flight contract): this is a heuristic static pattern scan of a 6-file, non-executable fixture. It cannot see dependency-graph effects at install time (A2-03's field notes show install-time and optional-dependency failures that pass static checks), runtime pending rows (A2-08), or auth behavior of a running host (A1-08's ghost-host generation fork). Zero hits means only "not detected by the current patterns"; a migration decision still requires an exact-tag source compare, a real mount, and functional smokes on the target version.

## Card mapping summary

| Touchpoint | Verdict | Cards |
|---|---|---|
| #1 source patch | HIT (`cordis.patch.yml:5-6`, `patch.yml:2-6`, `apply-patch.mjs:5-8`) | A1-03 (primary); A1-01 indirect |
| #2 events | HIT (`src/index.ts:15-22`) | A1-02 + A2-01 — **folded: net state at alpha.2 = ignorable restored; keep the producer marker; never land on alpha.1** |
| #3 service/Remote | HIT (`src/index.ts:26-31`) | A1-01 (primary), A2-02 (if client-plane Remote adopted) |
| #4 host directory | HIT (`src/index.ts:36-37`) | A1-04 |
| #5 UI/commands | HIT (`src/index.ts:10, 41-43`) | A1-03 (primary), A1-25 (secondary), A1-26 (conditional) |
| #6 custom channel | HIT (`src/index.ts:47-54`) | A1-08 |
| #7 subprocess/output | HIT (`apply-patch.mjs:12-18`, `src/index.ts:57-66`) | A1-05 (primary), A1-04 (secondary) |
