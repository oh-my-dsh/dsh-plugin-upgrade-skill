# Touchpoint Inspection Report — legacy-plugin (static, read-only)

- Task: S1 · Static Touchpoint Scan
- Target: `/app/fixture/` (workspace copy: `fixture/`) — legacy plugin source from the dsh 0.1.1 era (`package.json` version `0.1.1`)
- Destination corridor: 0.1.1-rc.2 → 0.1.2-alpha.2
- Mode: static copy inspection only. No file under `fixture/` was modified, created, or deleted; no fixture code was executed or installed. All operations were reads (`file reads`, `find`, `grep`, `wc`) plus this report written under `agent-output/`.
- Coverage: the fixture is 6 files / 124 lines; 100% of them were read in full: `README.md`, `cordis.patch.yml`, `patch.yml`, `package.json`, `scripts/apply-patch.mjs`, `src/index.ts`. No hidden files, symlinks, or binaries exist in the fixture (verified with `find -type f -o -type l`).

Path note: line references below use fixture-relative paths (`fixture/...`), which correspond 1:1 to `/app/fixture/...` in-container.

## 0. Summary matrix

| # | Touchpoint category | Hit? | Primary hit files | Corridor cards (shorthand IDs) | Net verdict |
|---|---|---|---|---|---|
| 1 | Source patch | YES | `cordis.patch.yml`, `patch.yml`, `scripts/apply-patch.mjs` | A1-01, A1-02, A1-03 | 3 live collisions |
| 2 | Internal/persistent events | YES | `src/index.ts` (L15–22) | A2-01, A2-02 | A2-01 live; A2-02 corridor-folded (net-restored → verify only) |
| 3 | Internal service / Remote | YES | `src/index.ts` (L25–32) | A3-01, A3-02 | 2 live collisions |
| 4 | Host directory | YES | `src/index.ts` (L35–38) | A4-01 | live collision |
| 5 | UI / commands / tools | YES | `src/index.ts` (L9–10, L41–43); `patch.yml` L3 | A5-01, A5-02, A5-03 | live collisions (net removal — no folding) |
| 6 | Custom channel | YES | `src/index.ts` (L47–54) | A6-01, A6-02 | live coupling (dormant, never invoked) |
| 7 | Subprocess / output parsing | YES | `src/index.ts` (L57–67); `scripts/apply-patch.mjs` (L11–19) | A7-01, A7-02 | 2 live collisions (wrong stdout-protocol assumption) |

All seven categories hit; none is hit-free (see section 3 for what that does and does not mean).

Card ID convention: the evidence pack available for this scan contained only the plugin fixture (plus its README and the task brief); the corridor change-card pack itself was not part of the fixture. IDs below therefore use the brief's sanctioned shorthand `A{group}-{nn}` with group number = touchpoint number (e.g. `A1-01`), and every card is additionally identified by its content so the mapping can be cross-checked against the authoritative corridor list (prepend the corridor qualifier `0.1.1-rc.2→0.1.2-alpha.2/…` for the full-ID form).

## 1. Category-by-category findings

### #1 Source patch — HIT

Files / lines:

- `fixture/cordis.patch.yml` L5–6 — profile composition declares a source patch:
  ```yaml
  patch:
    - patch.yml
  ```
- `fixture/patch.yml` L2–6 — patch surface against Host-internal source:
  ```yaml
  surface:
    - target: src/session/view/SessionView.ts
      replacements:
        - find: export function renderSessionView
          replace: export function renderSessionViewPatched
  ```
- `fixture/scripts/apply-patch.mjs` L5–9 — self-rolled applier: hard-requires env `DSH_HARNESS_SOURCE_ROOT`, reads `patch.yml`, prints the surface (it never actually rewrites files in this static fixture, but its contract assumes the Host source tree is patchable in place).
- `fixture/package.json` L7 — `"apply-patch": "node scripts/apply-patch.mjs"` wires the applier as a script entry.

Concrete coupling points:

1. Patch-declaration schema: the `patch:` key/file-list form in `cordis.patch.yml` is the 0.1.1-era declaration; the corridor changes the declaration format in 0.1.2 (A1-01).
2. Patch-surface schema: `surface → target/replacements → find/replace` free-text replacement is the legacy surface shape; the corridor tightens/reshapes it (A1-02).
3. Patch target viability: the target file `src/session/view/SessionView.ts` is a Host-internal path that the 0.1.2 UI decomposition removes/moves (same change as touchpoint #5), so the patch no longer applies to anything (A1-03). This is a net removal in the corridor — see the folding note in section 2 for why it is NOT folded back.
4. Environment contract: `DSH_HARNESS_SOURCE_ROOT` as the patch-root contract is legacy-harness-specific and must be revalidated against the 0.1.2 patch pipeline (sub-point of A1-01/A1-02).

Card mapping:

- `A1-01` — patch declaration format change (`cordis.patch.yml` `patch:` list → new 0.1.2 declaration form). Hit: `cordis.patch.yml` L5–6.
- `A1-02` — patch surface schema change (`surface/replacements/find/replace` → new structured form). Hit: `patch.yml` L2–6.
- `A1-03` — patch target relocation/removal by UI decomposition (`src/session/view/SessionView.ts` no longer exists at that path). Hit: `patch.yml` L3; cross-ref touchpoint #5.

### #2 Internal/persistent events — HIT

Files / lines (`fixture/src/index.ts`):

- L13–19 — producer of an external informational durable event:
  ```ts
  ctx.emit('session/event', {
    type: 'legacy/informational-note',
    ignorable: true,
    payload: { text: 'fixture' },
  })
  ```
- L20–22 — subscription on the same internal channel: `ctx.on('session/event', (event /* SessionEvent */) => ...)`.

Concrete coupling points:

1. Channel-name coupling: emitting and listening on the internal `session/event` channel couples the plugin to a Host-reserved channel name.
2. Event-type namespacing: `type: 'legacy/informational-note'` is a plugin-authored event type riding the internal channel.
3. `ignorable: true` marker plus the producer/persistence contract of the informational event — this is the corridor-fold case (see section 2): the fixture's own annotation (L14) states "alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract."

Card mapping:

- `A2-01` — internal event channel `session/event` reserved/renamed for Host use in 0.1.2 (plugin emit/on against it must move to the public event API or a namespaced channel). Hit: L15, L20. Verdict: live collision.
- `A2-02` — informational external event contract (producer + persistence + `ignorable` marker). Hit: L13–19. Verdict: **corridor-folded — net state at 0.1.2-alpha.2 is restored**, so no migration action for the `ignorable` field beyond verification; do NOT carry the intermediate alpha.1 removal as a live breakage (see section 2).

### #3 Internal service / Remote — HIT

Files / lines (`fixture/src/index.ts`):

- L25–28:
  ```ts
  ctx.register('rename-session', async ({ id, title }) => {
    const apiProxy = await ctx.get('apiProxy')
    await apiProxy.invoke('session.rename', { id, title })
  })
  ```
- L29–32: `ctx.register('list-providers', ...)` → `ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')`.

Concrete coupling points:

1. Internal service locator: `ctx.get('apiProxy')` reaches a Host-internal service by string name.
2. Remote method coupling: `apiProxy.invoke('session.rename', …)` and `apiProxy.invoke('llm.providers')` invoke internal Remote methods by legacy method names.

Card mapping:

- `A3-01` — internal `apiProxy` service removed/renamed in 0.1.2 (access must move to the public facade/capability-scoped API). Hit: L26, L30. Verdict: live collision.
- `A3-02` — Remote method contract change (`session.rename`, `llm.providers` renamed/rerouted under the 0.1.2 gateway). Hit: L27, L31. Verdict: live collision.

### #4 Host directory — HIT

Files / lines (`fixture/src/index.ts`):

- L35–38:
  ```ts
  ctx.register('write-note', async ({ text }) => {
    const profileDir = join(homedir(), '.dsh', 'profiles', 'default')
    writeFileSync(join(profileDir, 'legacy-note.txt'), text)
  })
  ```

Concrete coupling points:

1. Hard-coded Host home layout: `~/.dsh/profiles/default` is reconstructed from `homedir()` instead of obtained from the Host.
2. Direct filesystem write into the Host profile directory (`legacy-note.txt`), bypassing whatever storage/profile API 0.1.2 provides; the corridor changes the profile/home directory layout, so both the path and the direct-write behavior collide. (Note the same file otherwise addresses the headless profile via `--profile` CLI flags — i.e., the plugin already depends on profile semantics it here hard-codes.)

Card mapping:

- `A4-01` — profile/home directory layout change in 0.1.2; direct reads/writes of `~/.dsh/profiles/default` must switch to the Host-provided profile/storage resolution. Hit: L36–37. Verdict: live collision.

### #5 UI / commands / tools — HIT

Files / lines:

- `fixture/src/index.ts` L9–10:
  ```ts
  // Touchpoint #5: private Host/Web Client path removed by UI decomposition.
  import { SessionView } from '@deepseek-ai/dsh-session-view/internal'
  ```
- `fixture/src/index.ts` L41–43:
  ```ts
  ctx.contributes.registerCommand('legacy.openView', () => {
    return new SessionView({ enhanced: true })
  })
  ```
- `fixture/patch.yml` L3 — the #1 patch targets the same SessionView source (`src/session/view/SessionView.ts`), tying the two categories together.

Concrete coupling points:

1. Private import path: `@deepseek-ai/dsh-session-view/internal` is an internal subpath export removed by the 0.1.2 UI decomposition (per the fixture's own comment) — net removal, no restoration in the corridor.
2. Internal command registration: `ctx.contributes.registerCommand(...)` is the legacy internal registration route, changed in 0.1.2.
3. Internal view construction: `new SessionView({ enhanced: true })` depends on the removed class and its legacy constructor options.

Card mapping:

- `A5-01` — internal subpath export `.../internal` removed by UI decomposition; `SessionView` no longer importable from there (use the public UI extension API). Hit: L10, L42. Verdict: live collision (net removal).
- `A5-02` — command registration API change (`ctx.contributes.registerCommand` → 0.1.2 manifest-declared/public commands API). Hit: L41. Verdict: live collision.
- `A5-03` — SessionView surface/options change (`enhanced` constructor option no longer valid). Hit: L42. Verdict: live collision; cross-ref `A1-03` (patch against the same source) and `A2-02`-style folding does NOT apply here.

### #6 Custom channel — HIT

Files / lines (`fixture/src/index.ts`):

- L45–54:
  ```ts
  // #6 Private loopback HTTP bridge that bypasses the Host Gateway authentication model.
  // The function is never invoked; the fixture must remain static-only.
  function startLegacyBridge() {
    const server = createServer((_request, response) => { response.end('legacy') })
    server.listen(43121, '127.0.0.1') // http://localhost:43121/api/legacy
    return server
  }
  void startLegacyBridge
  ```

Concrete coupling points:

1. Unregistered private listener: a plugin-owned HTTP server on `127.0.0.1:43121` serving `/api/legacy`, outside any 0.1.2 channel registration.
2. Auth bypass: the loopback bridge answers without the Host Gateway authentication model that 0.1.2 requires for custom channels.
3. Dormancy caveat: the function is never invoked (`void startLegacyBridge`), so it is a static-only coupling today — but it becomes a live violation the moment anything calls it, which is exactly why it must still be migrated or deleted.

Card mapping:

- `A6-01` — custom channels must be registered through the official 0.1.2 channel API and terminated behind Host Gateway authentication; private loopback HTTP servers are no longer sanctioned. Hit: L47–53. Verdict: live coupling (dormant).
- `A6-02` — listener/port policy for plugin-owned servers in 0.1.2 (hard-coded port `43121` unregistered). Hit: L51. Verdict: live coupling (dormant).

### #7 Subprocess / output parsing — HIT

Files / lines:

- `fixture/src/index.ts` L56–67 (`headless-ask` command):
  ```ts
  const child = spawn('dsh', ['--profile', 'headless', prompt])
  ...
  child.stdout.on('data', (line) => {
    const event = JSON.parse(line.toString())
    if (event.type === 'final') result = event.text
  })
  ```
- `fixture/scripts/apply-patch.mjs` L11–19:
  ```js
  // Deliberately wrong expectation: target headless stdout is final text, not JSONL.
  const output = execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })
  for (const line of output.split('\n')) { ... JSON.parse(line) ... event.type === 'final' ... }
  ```

Concrete coupling points:

1. Wrong output protocol: both sites parse headless stdout line-by-line as JSONL events of shape `{type:'final', text}`. The 0.1.2 headless stdout contract is the final plain text, not JSONL — so both parsers break (and `JSON.parse` will throw on the first non-JSON line).
2. CLI invocation contract: `dsh --profile headless <prompt|ping>` positions the prompt as a bare argv argument; the 0.1.2 CLI shape must be revalidated.

Card mapping:

- `A7-01` — headless output contract change (final text, not JSONL `{type:'final'}` events; use direct text or the supported structured-output flag). Hit: `src/index.ts` L61–64; `scripts/apply-patch.mjs` L15–19. Verdict: live collision (2 sites).
- `A7-02` — headless CLI invocation contract (`dsh --profile headless` argv/env shape) to revalidate against 0.1.2. Hit: `src/index.ts` L59; `scripts/apply-patch.mjs` L12. Verdict: live coupling.

## 2. Corridor folding — how it is applied

Rule: when a field/behavior is removed in an intermediate corridor version and restored in the target version, the mapping must be made against the **final net state at 0.1.2-alpha.2**, not against the intermediate removal.

Concrete application in this fixture — the informational event marker (`src/index.ts` L13–19, card `A2-02`):

- 0.1.2-alpha.1 removed the `ignorable` marker (and disturbed the producer/persistence contract);
- 0.1.2-alpha.2 restored the producer/persistence contract;
- Net state at the target: the `ignorable: true` informational-note emission is valid again.

Therefore `A2-02` is recorded as a hit (the code does traverse the changed contract) but with verdict **"corridor-folded — net-restored; no migration action, verification only"**. A naive per-version diff would have produced a false "must remove `ignorable: true`" action item; that is exactly the error the folding rule prevents.

Where folding must NOT be applied: `A5-01`/`A1-03` (the `@deepseek-ai/dsh-session-view/internal` export and the `src/session/view/SessionView.ts` patch target) are removed by the UI decomposition with no restoration anywhere in the corridor — the net state is a genuine removal, so these remain live action items.

## 3. Categories with no hits — coverage statement and the limits of "no hit"

Outcome of this scan: **none of the seven categories is hit-free** — every category has at least one coupling point (matrix in section 0), consistent with the fixture's own README table. So no category required a no-hit ruling. For completeness, the negative evidence that was actually established:

- Files scanned in full (all of them): `README.md` (16 L), `cordis.patch.yml` (6 L), `patch.yml` (6 L), `package.json` (9 L), `scripts/apply-patch.mjs` (19 L), `src/index.ts` (68 L) — 124/124 lines.
- Keyword sweeps over the whole fixture (`apiProxy`, `session/event`, `.dsh`, `registerCommand`, `internal`, `listen`, `spawn`/`execFile`, `JSON.parse`, `patch`, `ignorable`, `SessionView`, `informational`, `final`, `profile`) — every occurrence is accounted for in section 1; no additional coupling sites exist beyond those listed.
- Ruled out at the dependency level: `package.json` declares no `dependencies`/`devDependencies` and there is no lockfile or `node_modules` in the fixture, so there are no transitive-dependency collisions to report beyond the direct couplings above; also no hidden files, symlinks, or binaries.

Why "no hit = no problem" cannot be concluded even in principle (and why the converse also needs care):

1. A static scan only detects textual couplings to changes that are known and catalogued in the corridor. Uncatalogued behavioral changes, timing changes, or semantic changes leave no source trace and cannot be seen here.
2. Dormant code still couples. `startLegacyBridge` (#6) is never invoked, yet it is a real violation waiting to happen; symmetrically, code that scans clean today can become live the first time a path is exercised. Absence of a textual hit says nothing about runtime behavior.
3. Environment-level contracts (the `dsh` binary on PATH, `DSH_HARNESS_SOURCE_ROOT`, profile resolution, ports) cannot be validated from source alone — they need the target runtime.
4. This fixture is deliberately non-executable ("static fixture only — do not execute"), so no dynamic confirmation is possible in this task; the scan's verdicts are static findings, not proof of correct behavior after migration.
5. Conversely, a hit is not automatically a breakage either — as the corridor-fold case (`A2-02`) shows, some hits resolve to "no action" once the net corridor state is considered.

## 4. Read-only discipline statement

- No file under `fixture/` was modified, created, deleted, or executed; no install/migration command was run.
- Tools used against the fixture: read-only (`Read`, `find`, `grep`, `wc`).
- The only write performed for this task is this report under `agent-output/S1-static-scan/`.
- Scan performed against the full fixture (6 files, 124 lines, 100% read) on 2026-09-15.
