# S1 · Static Touchpoint Scan Report — legacy-plugin (dsh 0.1.1-rc.2 → 0.1.2-alpha.2)

- Scan mode: read-only static inspection (no file under the fixture was modified, created, deleted, or renamed; no fixture script was executed).
- Fixture scanned (complete file list, no exclusions):
  - fixture/README.md (documentation, describes intended hits)
  - fixture/package.json
  - fixture/patch.yml
  - fixture/cordis.patch.yml
  - fixture/scripts/apply-patch.mjs
  - fixture/src/index.ts
- Corridor used for card mapping: dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 (card set `DSH-0.1.2-A1-*`) → dsh-v0.1.2-alpha.2 (card set `DSH-0.1.2-A2-*`). Where a field was removed in alpha.1 and restored in alpha.2, the mapping uses the **final net state at 0.1.2-alpha.2** (corridor folding), not the intermediate removal.

## Summary table

| Touchpoint | Hit | File/line | Applicable card(s) | Confidence note |
|---|---:|---|---|---|
| #1 source patch | YES | patch.yml:3-6; scripts/apply-patch.mjs:5-9; cordis.patch.yml (classified as composition, not a patch) | DSH-0.1.2-A1-03; classification rule API-08 | patch-surface targets a session-view internal path split up in alpha.1 |
| #2 internal/persistent events | YES | src/index.ts:13-22 (`ctx.emit('session/event', ...)` producer with `ignorable: true`; `ctx.on('session/event')` observer) | DSH-0.1.2-A1-02 **folded with** DSH-0.1.2-A2-01 → net: A2-01 | field removed in alpha.1, restored in alpha.2; net state keeps the marker, but the public append surface still cannot write it |
| #3 internal service / Remote | YES | src/index.ts:24-32 (`ctx.get('apiProxy')`, `session.rename`, `llm.providers`) | DSH-0.1.2-A1-01 (primary); DSH-0.1.2-A2-02 (error handling after migration) | host-plane apiProxy deleted; must inject the domain service, not `remote` |
| #4 host directory | YES | src/index.ts:34-38 (fixed `join(homedir(), '.dsh', 'profiles', 'default')`, `writeFileSync`) | DSH-0.1.2-A1-04 | profiles live under `$DSH_HOME/profiles`; hardcoding `~/.dsh` no longer matches |
| #5 UI / commands / tools | YES | src/index.ts:9-10 (import `@deepseek-ai/dsh-session-view/internal`); src/index.ts:40-43 (`contributes.registerCommand`, `new SessionView(...)`) | DSH-0.1.2-A1-03 (primary); artifact-risk rule API-07 | private internal import + internal view constructor; deep subpath may not exist in the published tarball either |
| #6 custom channel | YES | src/index.ts:45-54 (`createServer`, `server.listen(43121, '127.0.0.1')`, `/api/legacy`) | DSH-0.1.2-A1-08 | loopback HTTP bridge bypassing the bootstrap-token/signed-cookie auth model |
| #7 subprocess / output parsing | YES | scripts/apply-patch.mjs:12-18 (`execFileSync('dsh', [...])` + `JSON.parse` per line); src/index.ts:56-67 (`spawn('dsh', ...)` + `JSON.parse` on stdout chunks) | DSH-0.1.2-A1-05 (primary); DSH-0.1.2-A1-04 (launcher/profile) | headless stdout is final text, never JSONL — the assumption is wrong already at rc.2 and stays wrong at alpha.2; alpha.1 additionally adds a `dsh: reasoning:` stderr segment |

All seven touchpoint categories hit. There are no no-hit categories; the no-hit disclosure in the task brief therefore does not apply. For completeness: fixture/package.json (no `dsh.client`, no peerDependencies, no engines, no `@deepseek-ai/*` imports — only a private name/version and an `apply-patch` script entry) and fixture/README.md were also read and contributed no additional couplings beyond those listed.

## Per-touchpoint detail

### #1 Source patch — HIT

- Hit locations:
  - patch.yml:3-6 — patch-surface declaration: target `src/session/view/SessionView.ts`, replacement `export function renderSessionView` → `renderSessionViewPatched`.
  - scripts/apply-patch.mjs:5-9 — reads `DSH_HARNESS_SOURCE_ROOT`, reads `patch.yml`, "applying patch surface" (static copy; not executed).
- Coupling points: the patch target is an **internal session-view source path**; the wrapper keys on the host source root and on the literal patch-surface file.
- Card mapping: **DSH-0.1.2-A1-03** (session view internals split up extensively; touchpoints #1/#5). The target path `src/session/view/SessionView.ts` must be re-validated against the exact target-tag compare; if no equivalent owning module exists, mark "pending confirmation", do not guess new paths.
- Classification note (API-08): fixture/cordis.patch.yml is a **profile composition overlay** (plugin row `legacy-plugin` + `patch:` list entry), not a source patch. Judging it a source patch by filename alone would be a false positive; its `patch:` entry points at patch.yml, which is the real patch-surface hit above. Composition-row migration checks id/config-replacement semantics instead of source hunks.

### #2 Internal/persistent events — HIT

- Hit locations: src/index.ts:15-19 (producer: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload })`); src/index.ts:20-22 (observer: `ctx.on('session/event', ...)`).
- Coupling points: third-party persisted informational SessionEvent carrying the `ignorable: true` marker; unknown-type reload semantics.
- Card mapping with **corridor folding**: DSH-0.1.2-A1-02 removed `SessionEvent.ignorable` in alpha.1; DSH-0.1.2-A2-01 restored it in alpha.2. Folding to the final net state at alpha.2: **the marker survives the corridor — do NOT delete the producer marker and re-add it**. Map this hit to **DSH-0.1.2-A2-01** (net), noting the intermediate A1-02 removal only matters if alpha.1 is an intermediate deployment target.
- Residual caveat (API-05): even at alpha.2, the public `Session.append()` still has no `ignorable` parameter; an out-of-repo producer must mark the producer seam as a capability gap rather than faking a supported write surface. Verification requires a real persist → cold-reload test, not just a live emit.

### #3 Internal service / Remote — HIT

- Hit locations: src/index.ts:25-28 (`rename-session`: `ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', ...)`); src/index.ts:29-32 (`list-providers`: `apiProxy.invoke('llm.providers')`).
- Coupling points: the rc.2 host-plane `apiProxy` service key; the dotted operations `session.rename` and `llm.providers`.
- Card mapping: **DSH-0.1.2-A1-01** (APIProxy removed; alpha.1 deletes `@deepseek-ai/dsh-host-apiproxy`). Per the A1-01 migration table: `session.rename` → `session/rename`; `llm.providers` splits into `llm/listProviders` + `llm/listConfigurableProviders`.
- Plane caveat (A1-01 field note): this plugin is a **host-plane** consumer (`ctx.get('apiProxy')`), so the correct migration is to inject the domain service behind the gateway (e.g. `inject: ['llm']` → `ctx.llm.listProviders()`), **not** `inject: ['remote']` — the host plane would stall at `pending (waiting for service: remote)`. The `ctx.remote.*` table applies only to browser (client-plane) plugins.
- Secondary mapping: **DSH-0.1.2-A2-02** — after migrating to Remote calls, failures are `RemoteError` instances with namespaced codes (`session/not-found`, `gateway/cancelled`, ...); handle `RemoteResult<T>` branches instead of parsing old dotted code strings.

### #4 Host directory — HIT

- Hit locations: src/index.ts:36-37 (`join(homedir(), '.dsh', 'profiles', 'default')`; `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`).
- Coupling points: hardcoded user-home profile path + direct filesystem write into the host profile directory.
- Card mapping: **DSH-0.1.2-A1-04** — profiles live under the runtime `$DSH_HOME/profiles`; the migration recipe is to use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth instead of hardcoding user directories. (Static line-level note per the pre-flight guidance: a line search cannot reveal data flow, but here the path is fully literal, so the coupling is certain.)

### #5 UI / commands / tools — HIT

- Hit locations: src/index.ts:10 (`import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`); src/index.ts:41-43 (`ctx.contributes.registerCommand('legacy.openView', ...)` returning `new SessionView({ enhanced: true })`).
- Coupling points: private Host/Web Client internal path (comment in the fixture itself says "removed by UI decomposition"); internal view-class construction inside a command registration.
- Card mapping: **DSH-0.1.2-A1-03** — session view internals split up; patch target paths, internal imports, and UI registration points no longer work. Rebuild imports by owning module; mark capabilities without a stable public seam as "pending confirmation"; prefer public facets/services.
- Secondary risk (API-07): even if a deep subpath like `/internal` appears in the checkout's export map, the published tarball may not contain the target file (`ERR_MODULE_NOT_FOUND` / missing `.d.ts` after install); verify against the packed artifact, not the source checkout.

### #6 Custom channel — HIT

- Hit locations: src/index.ts:47-53 (`startLegacyBridge`: `createServer`, `server.listen(43121, '127.0.0.1')`, comment `http://localhost:43121/api/legacy`); src/index.ts:54 (`void startLegacyBridge` — never invoked, static-only).
- Coupling points: a private loopback HTTP bridge that bypasses the Host Gateway authentication model; no Host/Origin fence, no auth gate, no teardown.
- Card mapping: **DSH-0.1.2-A1-08** — Web/API channels moved to process-scoped bootstrap tokens + signed cookies; old channels calling `/api` directly may receive 401/403, and private unauthenticated routes become security holes. "Loopback only" is not a reason to skip authentication. Migration: route through Connection-owned carriers or call `ctx.connection.requestRejection(req)` first for custom `ctx.webServer.register()` routes.

### #7 Subprocess / output parsing — HIT

- Hit locations:
  - scripts/apply-patch.mjs:12-18 — `execFileSync('dsh', ['--profile', 'headless', 'ping'])`, then `JSON.parse` per stdout line expecting `{ type: 'final', text }` JSONL events.
  - src/index.ts:57-67 — `spawn('dsh', ['--profile', 'headless', prompt])`; `child.stdout.on('data', ...)` does `JSON.parse(line)` and looks for `event.type === 'final'`.
- Coupling points: (a) headless argv shape; (b) the assumption that headless stdout is JSONL; (c) success judged by parsed events rather than the exit code; (d) stdout parsed per `data` chunk, which is not even line-framed.
- Card mapping: **DSH-0.1.2-A1-05** — rc.2's stdout was **already the final assistant text, never JSONL**; alpha.1's only change is that stderr gains a `dsh: reasoning:` segment. So the fixture's JSONL assumption is wrong at both ends of the corridor: `JSON.parse` on stdout throws at rc.2 and at alpha.2 alike. Correct contract: stdout = final text; stderr = `dsh: reasoning:` / `dsh: <code>: <message>`; success by exit code (0 completed, 1 failed/aborted/no completed turn). Treating non-empty stderr as failure would misjudge successful reasoning runs at alpha.1/alpha.2.
- Secondary mapping: **DSH-0.1.2-A1-04** — the wrapper hardcodes the headless profile invocation; profile composition/launcher facts (DSH_HOME, official launcher) must be re-validated rather than assumed. (A2-04 is conditional-only: no Node-version workaround branch exists in this fixture, so it does not apply.)

## Corridor folding note (explicit)

The only removed-then-restored field in this corridor that the fixture touches is `SessionEvent.ignorable`: removed by DSH-0.1.2-A1-02 (alpha.1), restored by DSH-0.1.2-A2-01 (alpha.2). Because the migration target is 0.1.2-alpha.2 directly, the net state is "field exists with restored producer/persistence/reload/transport retention semantics" — the correct plan is to **keep the producer writing `ignorable: true`** and map the hit to A2-01, not to perform the alpha.1 removal and then undo it. The folding also preserves the residual gap: alpha.2's public `Session.append()` still cannot write the marker (API-05), so the producer seam should be flagged as a capability gap rather than reported as fully supported.

## Read-only discipline statement

The fixture directory was only read. No file inside it (or anywhere in the benchmark repository) was modified, created, deleted, or renamed; no fixture script was executed; no migration, installation, or external service was invoked. The only write performed by this task is this report file in the designated output directory.
