# S1-static-scan · Legacy DSH plugin touchpoint inspection report

- Plugin: `legacy-plugin` (private, version 0.1.1, `"type": "module"`), fixture copy, source only — nothing executed, nothing modified.
- corridor: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` (per `references/README.md` corridor index; edges read via `references/v0.1.1-rc.2.md`, `references/v0.1.2-alpha.1.md`, `references/v0.1.2-alpha.2.md`).
- Corridor folding rule applied: changes removed in an intermediate version and restored in the target are evaluated by their **final net state** in 0.1.2-alpha.2 (see #2 below).
- Scan scope: all files under `fixture/` (`README.md`, `package.json`, `patch.yml`, `cordis.patch.yml`, `src/index.ts`, `scripts/apply-patch.mjs`). Fixture unchanged; read-only.

## Summary

| Touchpoint | Hit | File/line | Card(s) | Confidence |
|---|---|---|---|---|
| #1 source patch | yes | `cordis.patch.yml:5-6`, `patch.yml:2-6`, `scripts/apply-patch.mjs:5,8` | DSH-0.1.2-A1-03 (A1-24/A2-03 packaging context) | high for patch-surface classification; path validity pending against exact tag |
| #2 events | yes | `src/index.ts:15-22` | DSH-0.1.2-A2-01 (net of A1-02), A1-27 adjacent | high |
| #3 services/Remote | yes | `src/index.ts:25-32` | DSH-0.1.2-A1-01, A2-02 (on the consumer seam) | high |
| #4 host directory | yes | `src/index.ts:36-37` | DSH-0.1.2-A1-04 (hardcoded user dir), A1-21 pattern reference | high |
| #5 UI/commands/tools | yes | `src/index.ts:10,41-43` | DSH-0.1.2-A1-03, A1-10/A1-11 capability check, A1-25/API-10 pattern ruled out | high |
| #6 custom channel | yes | `src/index.ts:47-54` | DSH-0.1.2-A1-08, A1-19 (adjacent) | high |
| #7 subprocess/output parsing | yes | `src/index.ts:57-66`, `scripts/apply-patch.mjs:11-18` | DSH-0.1.2-A1-05, API-06; A2-04 only as a ruled-out conditional | high |

All seven touchpoint classes hit. No category is a clean no-hit; per-class "ruled out" evidence is listed below.

---

## #1 · Source patch / monkey patch — HIT

Coupling points:

- `fixture/cordis.patch.yml:5-6` — declares `patch: [patch.yml]` on the plugin's own row. Note the classification subtlety: `cordis.patch.yml` itself is **profile composition**, not a source patch (API-08); it is a hit only insofar as its `patch:` row wires in a real patch surface.
- `fixture/patch.yml:2-6` — a true source-patch surface: `target: src/session/view/SessionView.ts`, a `find`/`replace` replacement of `export function renderSessionView`. This applies a replacement intent against **host source**, so it belongs to touchpoint #1 proper.
- `fixture/scripts/apply-patch.mjs:5-6` — reads `process.env.DSH_HARNESS_SOURCE_ROOT` and targets a host source root, i.e. the patch is meant to be composed against a host checkout.

Card mapping:

- `DSH-0.1.2-A1-03` (Session view internals split up extensively; touchpoints #1, #5): the patch target path `src/session/view/SessionView.ts` is an internal session-view path; alpha.1 reorganized those internals, so the patch target and the `find` marker must be re-validated per-file against the alpha.2 tag (marked "pending confirmation" until a tag compare confirms the path still exists — the skill forbids guessing new paths).
- Packaging context only (not a direct hit): `DSH-0.1.2-A1-24` / `DSH-0.1.2-A2-03` — no DSH peers or lockfile in the static copy, so no dependency-side collision can be concluded from the fixture alone.

## #2 · Internal event names and persistent events — HIT (corridor-folded)

Coupling points:

- `fixture/src/index.ts:15-19` — external informational durable event producer: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: ... })`.
- `fixture/src/index.ts:20-22` — observer/consumer on the same event name (`ctx.on('session/event', ...)`); the comment documents the alpha.1 removal / alpha.2 restoration of the `ignorable` marker.

Corridor folding (required by the brief): `DSH-0.1.2-A1-02` removed `SessionEvent.ignorable` in alpha.1 (its action level is explicitly "required-if-target-is-alpha.1"); `DSH-0.1.2-A2-01` restored the envelope/persistence/reload/transport retention semantics of `ignorable: true` in alpha.2. Net state at the target = **restored**. Therefore this hit maps to **A2-01**, not to A1-02: the fixture must not strip the marker and must not be declared a permanent incompatibility. Residual caveat from API-05 / A2-01: even in alpha.2 the public `Session.append(...)` has no `ignorable` parameter and the third-party write surface is still incomplete — a plugin using only public append cannot persist the marker and risks `SessionFormatUnsupportedError` on cold load; so the producer seam here is a capability-gap candidate that needs a sidecar/store or upstream support, flagged as a follow-up validation item rather than a blocker to delete the marker.
- `DSH-0.1.2-A1-27` (Session content reads via the SessionBinding durable-event window) is adjacent but not hit: the fixture only emits/observes; it does not read session content through SessionBinding.

## #3 · Internal service probes / Remote — HIT

Coupling points:

- `fixture/src/index.ts:25-28` — legacy host-plane service probe: `ctx.get('apiProxy')` then `apiProxy.invoke('session.rename', { id, title })`.
- `fixture/src/index.ts:29-32` — same probe: `apiProxy.invoke('llm.providers')`.

Card mapping:

- `DSH-0.1.2-A1-01` (APIProxy removed, Host/Web Client calls moved to `@Remote`): the missing `apiProxy` service hangs/fails on alpha.x. API-01 plane rule for a Host-plane call site: skip the client gateway and inject the owning domain service directly (e.g. `inject: ['llm']` → `ctx.llm.listProviders()`); do **not** mechanically rewrite to `ctx.remote`, which only exists on the client face. `session.rename` maps to the `session/rename` Remote only on the Web Client face; `llm.providers` maps to `llm/listProviders` + `llm/listConfigurableProviders` (client) or the direct `llm` domain service (host).
- `DSH-0.1.2-A2-02` (Remote failures become `RemoteError`; codes gain namespaces): not present in the fixture today (no `ctx.remote` usage), but any consumer written against these calls while migrating must adopt the namespaced codes (`session/not-found`, `gateway/cancelled`, …) and `RemoteResult` branching — listed as the follow-on card on the same seam.

## #4 · Direct host directory reads/writes — HIT

Coupling points:

- `fixture/src/index.ts:36-37` — hard-coded host/profile path: `join(homedir(), '.dsh', 'profiles', 'default')` and `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`.

Card mapping:

- `DSH-0.1.2-A1-04` (ACP/SDK examples merged into the `dsh` profile; wrappers that hardcode fixed profile paths / process trees no longer match; recipe: "do not hardcode user directories"). The `~/.dsh/profiles/default` literal collides with that guidance and must move to the runtime `DSH_HOME`/profile resolution.
- `DSH-0.1.2-A1-21` (shipped presets moved out of the CLI `config/agent-presets/` into the `dsh-agent-presets` package) is the same pattern class — directories that moved in alpha.1 — flagged as the reference pattern for why the hard-coded path is a problem; not directly hit (no preset directory read in the fixture).

## #5 · Internal UI / commands / tool registration — HIT

Coupling points:

- `fixture/src/index.ts:10` — internal UI import: `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`.
- `fixture/src/index.ts:41-43` — private UI/command registration: `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`.

Card mapping:

- `DSH-0.1.2-A1-03` (session view internals split up extensively; touchpoints #1, #5): the `/internal` import path and `SessionView` constructor are exactly what alpha.1 reorganized; registration must move to a public seam or a confirmed target-tag owning module — "pending confirmation" until per-file path checks against the exact tag.
- Ruled out / not hit on this class: `DSH-0.1.2-A1-25` (`dsh-client-runtime` removal, client symbols) — fixture imports no `dsh-client-runtime` and no `useSession`/`useChat`/keyed snapshot selectors; `DSH-0.1.2-A1-26` (client-modules scan id = package name) — no client bundle entry; `DSH-0.1.2-A1-10/A1-11` — capabilities not registered here. The command-execution signature change (`commands.execute` needing an explicit `[]` images arg, API-10) is not hit because the fixture never calls `commands.execute`.
- `DSH-0.1.2-R2-01/02/03` (image attachment refs, `read_image`) touchpoint #5 — scanned, no image/read_image usage; no hit.

## #6 · Custom HTTP / WS / RPC / DOM / CSS channels — HIT

Coupling points:

- `fixture/src/index.ts:4` — `import { createServer } from 'node:http'`.
- `fixture/src/index.ts:47-53` — private loopback bridge `startLegacyBridge()`: `server.listen(43121, '127.0.0.1')`, comment "http://localhost:43121/api/legacy"; explicitly bypasses the Host Gateway authentication model.
- `fixture/src/index.ts:54` — defined but never invoked (`void startLegacyBridge`); even dead code is recorded because it is a static coupling.

Card mapping:

- `DSH-0.1.2-A1-08` (Web/API channels use process-scoped bootstrap tokens and signed cookies): any loopback custom route that reaches the Web UI or calls `/api` directly without the Connection auth gate becomes a hole or 401/403 failure; custom routes registered outside `ctx.webServer.register()` do not inherit auth, Host/Origin fence, CORS, or TLS. Loopback-only is **not** an exemption.
- `DSH-0.1.2-A1-19` adjacent: if any acceptance/wrapper script hits this URL, token-URL → cookie → boot-manifest handling is required; not directly present in the plugin source.
- Ruled out: `DSH-0.1.2-A1-28` (composer textarea → contenteditable) — no DOM editing code; `DSH-0.1.2-A1-29` (MarkdownText labels) — no such component.

## #7 · Subprocess / stdout / stderr parsing — HIT

Coupling points:

- `fixture/src/index.ts:8` — `import { spawn } from 'node:child_process'`.
- `fixture/src/index.ts:59-65` — `spawn('dsh', ['--profile', 'headless', prompt])`, then `child.stdout.on('data', ...)` with `JSON.parse(line.toString())` expecting a JSONL stream with `event.type === 'final'`. This is the deliberately wrong wrapper assumption: alpha.1/alpha.2 headless **stdout is the final assistant text**, never JSONL.
- `fixture/scripts/apply-patch.mjs:3,12-18` — `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })` then `JSON.parse` per line — same wrong JSONL expectation on the alpha.2 contract.

Card mapping:

- `DSH-0.1.2-A1-05` (Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final text): the JSONL-parse wrapper breaks — `JSON.parse` on plain final text fails; non-empty stderr must no longer be treated as failure; exit code is authoritative. Full invocation/output contract: `API-06`.
- `DSH-0.1.2-A1-04` adjacent: agent/headless profile dirs live under `$DSH_HOME/profiles`; use the runtime launcher/env, not hardcoded profile paths.
- `DSH-0.1.2-A2-04` (empty client graph for `dsh web` on Node 24.0–24.11.1): **conditional, not hit** — the fixture contains no Node-24 workaround branch, loader probe, or `dsh web` skip; the card is recorded only as "checked and ruled out" because A2-04's fix removes the need for such workarounds, and none exist here.
- `DSH-0.1.2-A1-13` (platform shell/directory-picker fixes obsoleting old workarounds): scanned — no persistent-shell or picker workaround present; ruled out.

---

## Configuration & dependency inventory (checked separately)

- `fixture/package.json` — no `@deepseek-ai/*` dependencies, no peers, no `dsh-client-runtime`, no lockfile in the static copy; therefore A1-24 (pi-ai instance split), A2-03/A2-08 (peer trimming / `sessionProjections` peer), and A1-30 (`ctx.connection.api`) cannot be confirmed or denied from the fixture alone — they require the real `package.json`/lockfile of the source repo.
- No `dsh-plugin.json` manifest in the fixture.
- Profile composition: only `cordis.patch.yml` (classified in #1 via API-08; its own rows are an ordinary fixture row).

## Ruled-out-by-scan notes (why "no hit" ≠ "no problem")

For every class above: hit means a static coupling exists. Absence of further matches in this fixture does **not** prove compatibility — contracts can still collide via paths not present in this source copy (this is a seven-touchpoint static fixture, not the full plugin). Specifically: zero hits for `Session.append` + `SessionEventMap` augmentation (API-05 surface), `userQuestions.registerProvider` (A1-20), `settingsNamespace`/`installSettingsSection` (API-03/A2-10), `resolveSessionPreset` (A1-21), `isTokenDelta` (A1-22), `dsh-client-runtime`/`useSession`/`useChat` keyed snapshots (A1-25/API-10), `ctx.connection.api` (A1-30), `IWorkspaces.connectWorkspace/pickDirectory` (A1-32), `connection.api.*` wrappers, and `workspaceFiles`/`readByteRange` (0.1.5 edge, out of corridor). The remaining corridor cards (A1-07 WebFetch defaults, A1-12/A1-14/A1-23 privacy defaults, A1-16/17 absent, A2-05 plugin inventory shape, A2-06 `$host` facts) are not exercised by any line in this fixture and can only be re-checked against the real plugin.

## Must verify before migrating

1. Static: build/typecheck with `skipLibCheck: false` once to expose the missing declaration chain from the internal import; verify every `patch.yml` target path against the exact alpha.2 tag source before keeping the patch surface (A1-03).
2. Composition: `dsh --profile <p> --dump-config` on an isolated profile; confirm `cordis.patch.yml` rows resolve and the `patch:` row either maps cleanly or is removed (A1-03/A1-04).
3. Real host mount: one message → tool → response flow, since A2-08 makes several tool packages `pending` without `sessionProjections`; confirm no pending services.
4. Wrapper contracts: replace the JSONL stdout assumption with the API-06 table (stdout = final text, stderr = reasoning/errors, exit code authoritative); cover the stub matrix.
5. Custom channel: either delete `startLegacyBridge` or wire it through `ctx.connection.requestRejection(req)` / a Connection-owned carrier with the token→cookie auth model (A1-08).

## Limitations

- All analysis is confined to the static fixture copy; the fixture cannot be compiled/executed by design, so runtime failure modes (pending services, cold-load refusal of unknown events, Remote error vocabulary) are asserted from the corridor cards, not reproduced.
- External documentation was not consulted; card references are to the in-container `references/` files only. Per-file target paths (`SessionView.ts` split map, old `apiProxy`→domain service per call site, headless argv shapes per entrypoint) must be confirmed against the exact upstream tag before editing, which this report marks as pending confirmation rather than asserting.
