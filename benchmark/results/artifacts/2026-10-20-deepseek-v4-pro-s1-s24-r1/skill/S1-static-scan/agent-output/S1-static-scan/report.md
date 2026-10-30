# S1 · Static Touchpoint Scan — legacy-plugin (dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

**Mode**: A · inspect (read-only). **Fixture is unchanged** — only the six listed files were read;
nothing was modified, executed, or installed. No temporary files were created.

## 0 · Source & corridor identity

- Source: `legacy-plugin` v0.1.1 (package.json:2-3), `private: true`, `type: module`, host-side
  Cordis plugin (`export function activate(ctx)`, no `dsh.client` half, no `dsh-plugin.json` /
  `agent.cordis.yml` / legacy `cordis.yml`).
- Files scanned (complete tree, no node_modules/vendor/git present):
  `README.md`, `package.json`, `cordis.patch.yml`, `patch.yml`,
  `scripts/apply-patch.mjs`, `src/index.ts`.
- Corridor: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` (cards DSH-0.1.2-A1-*) →
  `dsh-v0.1.2-alpha.2` (cards DSH-0.1.2-A2-*). All 7 touchpoints hit; face = **Host plane** throughout
  (no Web Client surface in the fixture).

## 1 · Summary table

| Touchpoint | Hit | File/line | Card(s) | Net action |
|---|---:|---|---|---|
| #1 source patch | **yes** | cordis.patch.yml:5-6 · patch.yml:2-6 · scripts/apply-patch.mjs:5 | DSH-0.1.2-A1-03 (API-08 for classification) | rebase/confirm removed internal path |
| #2 events | **yes** | src/index.ts:15-22 | DSH-0.1.2-A1-02 **folded into** DSH-0.1.2-A2-01 | net state: marker retained — do nothing to the marker |
| #3 service/Remote | **yes** | src/index.ts:26-27, 30-31 | DSH-0.1.2-A1-01 (follow-on A2-02) | apiProxy → domain service / ctx.remote |
| #4 host directory | **yes** | src/index.ts:36-37 | DSH-0.1.2-A1-04 | use DSH_HOME + profile, stop hardcoding |
| #5 UI/commands | **yes** | src/index.ts:10, 41-43 | DSH-0.1.2-A1-03 | internal import/registration gone |
| #6 custom channel | **yes** | src/index.ts:4, 45-54 | DSH-0.1.2-A1-08 | loopback not exempt; wire auth gate |
| #7 subprocess/output | **yes** | src/index.ts:59-64 · scripts/apply-patch.mjs:12-18 | DSH-0.1.2-A1-05 (API-06 ledger) | stdout is final text, not JSONL |

No category is empty, so the "no-hit" branch of requirement 3 does not apply; the generic
heuristic-scan caveat still holds (see §7).

## 2 · #1 Source patch / monkey-patch — HIT

- **Files/lines**: `patch.yml:2-6` (the actual patch surface), declared by
  `cordis.patch.yml:5-6` (`patch: [patch.yml]`), applied by
  `scripts/apply-patch.mjs:5` (`process.env.DSH_HARNESS_SOURCE_ROOT` + read `patch.yml`).
- **Coupling point**: the surface targets the host-internal path
  `src/session/view/SessionView.ts` and rewrites `renderSessionView` → `renderSessionViewPatched`.
- **Mapping**: `DSH-0.1.2-A1-03` (session view internals split up extensively; patch target paths and
  the `renderSessionView` symbol no longer exist at the old internal location). The path/function
  must be re-confirmed against an exact-tag compare; no stable public seam → mark "pending confirmation".
- **Classification note**: `cordis.patch.yml` is profile composition, not a source patch
  (API-08); but `patch.yml` under its `patch:` key **is** a real source-patch surface (a
  `surface.target` + replacement), so this is a genuine #1 hit, not a filename false-positive.

## 3 · #2 Internal / persistent events — HIT (with corridor folding)

- **Files/lines**: `src/index.ts:15-19` — producer `ctx.emit('session/event', { type:
  'legacy/informational-note', ignorable: true, payload: {...} })`; `src/index.ts:20-22` — plain
  observer `ctx.on('session/event', ...)`.
- **Coupling point**: the `ignorable: true` marker on an external informational durable event.
- **Corridor folding**: `SessionEvent.ignorable` is removed in alpha.1 (DSH-0.1.2-A1-02) and
  **restored** in alpha.2 (DSH-0.1.2-A2-01). Net final state at the target = marker retained, so the
  producer's `ignorable: true` is **not** a net break. Map to **DSH-0.1.2-A2-01** with A1-02 folded:
  do **not** delete the marker (A1-02) and re-add it (A2-01).
- **Residual caveat (A2-01 / API-05)**: alpha.2 restores only envelope/persistence/transport
  retention; the public live `Session.append()` still has no `ignorable` parameter. This fixture
  writes via `ctx.emit('session/event', …)` rather than `Session.append()`; if that emit becomes a
  persisted event, the third-party write surface is still a capability gap — do not fake a public
  entry via cast.
- **Observer** (lines 20-22) is a plain `ctx.on` and is unaffected by any card.
- **Ruled out**: no `tool/code-dispatch`, `tools-code-mode`, or `connection/reset` strings.

## 4 · #3 Internal service / Remote — HIT

- **Files/lines**: `src/index.ts:26-27` — `ctx.get('apiProxy') → apiProxy.invoke('session.rename', {id,title})`;
  `src/index.ts:30-31` — `ctx.get('apiProxy') → apiProxy.invoke('llm.providers')`.
- **Coupling point**: the removed Host `apiProxy` service (package `@deepseek-ai/dsh-host-apiproxy`).
- **Mapping**: `DSH-0.1.2-A1-01` (APIProxy removed; Host/Web Client calls move to `@Remote`).
  Ledger: `session.rename` → `session/rename`; `llm.providers` → split into `llm/listProviders` +
  `llm/listConfigurableProviders`.
- **Face note**: these are Host-plane consumers (`ctx.get('apiProxy')`, no `dsh.client`). Per the
  A1-01 field note / API-01, Host-plane apiProxy consumers must **not** swap to `inject: ['remote']`
  (that stalls "waiting for service: remote"); they skip the gateway and inject the owning domain
  service directly (e.g. `inject: ['llm']` then `ctx.llm.listProviders()`, and the session domain
  service for rename). `ctx.remote.session.rename` is the **client**-plane path.
- **Follow-on**: if any call migrates to a `ctx.remote.*` consumer, DSH-0.1.2-A2-02 (Remote failures
  become `RemoteError` instances, namespaced codes) applies.
- **Ruled out**: no `@Remote`, `ctx.remote`, `userQuestions.registerProvider`, `isTokenDelta`,
  `ctx.connection.api`, `settingsNamespace`, subagent descriptor, or `sessionProjections` usage.

## 5 · #4 Direct host directory reads/writes — HIT

- **Files/lines**: `src/index.ts:36-37` — `join(homedir(), '.dsh', 'profiles', 'default')` then
  `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`.
- **Coupling point**: hard-coded host/profile path `~/.dsh/profiles/default`.
- **Mapping**: `DSH-0.1.2-A1-04` (ACP/SDK examples merged; profiles live under `$DSH_HOME/profiles`;
  use the runtime `DSH_HOME` + target profile + launcher as source of truth; do not hardcode user
  directories).
- **Ruled out**: no `DSH_HOME` env read (the plugin hardcodes `homedir()` instead — that is the
  defect), no `patchedDependencies`, no `agent-presets` `roots` config.

## 6 · #5 Internal UI / commands / tools — HIT

- **Files/lines**: `src/index.ts:10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`;
  `src/index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({enhanced:true}))`.
- **Coupling point**: private Host/Web Client internal path `@deepseek-ai/dsh-session-view/internal`
  and the `SessionView` constructor consumed by a registered command.
- **Mapping**: `DSH-0.1.2-A1-03` (session view internals split up extensively; internal imports and
  UI registration points no longer work). The internal import is also an **undeclared** dependency
  (package.json lists no `@deepseek-ai/*` deps).
- **Ruled out**: no `dsh-client-runtime`, `registerView`, `ctx.tools`, `useSession/useChat`,
  `__ModuleLoader__`/`PLUGIN_ID`, composer-`textarea`, or `MarkdownText` usage — the client-modules
  scan contract (A1-26), keyed chat snapshots (A1-27), composer (A1-28), and MarkdownText (A1-29)
  cards are not hit because this is a Host-side plugin with no client bundle.

## 7 · #6 Custom HTTP/WS/RPC/DOM/CSS channel — HIT

- **Files/lines**: `src/index.ts:4` (`import { createServer } from 'node:http'`),
  `src/index.ts:45-54` — `startLegacyBridge()` creates a loopback HTTP server
  (`server.listen(43121, '127.0.0.1')`, comment names `/api/legacy`) that answers without going
  through the Host Gateway auth.
- **Coupling point**: a private loopback HTTP bridge that bypasses the Host Gateway authentication
  model. The function is defined but never invoked (`void startLegacyBridge` at line 54) — the
  coupling is **latent/dormant**, but present.
- **Mapping**: `DSH-0.1.2-A1-08` (Web/API channels use process-scoped bootstrap tokens + signed
  cookies; loopback is **not** exempt; custom routes registered directly with the raw WebServer do
  not inherit auth — handlers must call `ctx.connection.requestRejection(req)` first or use a
  Connection-owned carrier).
- **Ruled out**: no `WebSocket`, `MutationObserver`, `insertRule`, or hard-coded web-root/boot-manifest
  acceptance script (A1-19 not hit).

## 8 · #7 Subprocess / stdout / stderr parsing — HIT

- **Files/lines**: `src/index.ts:59-64` — `headless-ask` runs `spawn('dsh', ['--profile','headless', prompt])`
  and `JSON.parse(line.toString())` on stdout, expecting `event.type === 'final'` / `event.text`;
  `scripts/apply-patch.mjs:12-18` — `execFileSync('dsh', ['--profile','headless','ping'])`, then
  `JSON.parse(line)` on each stdout line expecting `{type:'final', text}`.
- **Coupling point**: wrong assumption that headless stdout is JSONL / an event stream with a
  `final` event.
- **Mapping**: `DSH-0.1.2-A1-05` (headless stdout is the final assistant text — it was **never** JSONL,
  already in rc.2; the alpha.1 change is that stderr gains a `dsh: reasoning:` segment). Precise
  argv/output contract in API-06: `dsh --profile headless "<task>"`, stdout = final text, stderr =
  reasoning/diagnostics, exit code authoritative (0 complete / 1 failure). Both sites also rely on a
  shell-visible `dsh` binary; argv arrays should not shell-concatenate the prompt.
- **Ruled out**: no `code`-mode strings (A1-06 PTC rename not hit); the `--profile headless` form
  is valid on both tags (A1-04 notes `--profile <name>` existed in rc.2); no `dsh web` wrapper (A2-04
  not hit).

## 9 · "No-hit = no problem" caveat

All seven categories report a hit, so no category relies on the "zero hits" argument. The caveat
still applies to the scan as a whole: this is a **heuristic static** scan — "hit" only means a
pattern matched. Proving actual collision needs, additionally (out of scope for read-only S1): a
build/typecheck with the target cohort, a real profile mount, and a functional smoke. The fixture is
deliberately non-compilable ("that it cannot be compiled is by design" — README.md:3), so those
layers were not and cannot be run here.

## 10 · Pending / residual risk

- #1/#5: exact alpha.2 owning module/path for the old session-view surface is unconfirmed against an
  exact-tag compare (no target checkout under the read allowlist) → "pending confirmation".
- #2: whether `ctx.emit('session/event', {ignorable:true})` actually persists (and thus hits the
  alpha.2 "write surface incomplete" caveat) needs a runtime persistence test.
- #3: exact Host-plane domain-service injection key for `session.rename` must be confirmed at the
  target tag (the A1-01 table is client-plane; host-plane uses owning domain services per API-01).
