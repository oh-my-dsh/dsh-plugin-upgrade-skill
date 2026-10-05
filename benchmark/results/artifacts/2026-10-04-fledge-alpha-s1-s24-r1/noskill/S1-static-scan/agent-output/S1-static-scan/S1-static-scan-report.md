# S1 Static Touchpoint Scan Report

Scope: read-only scan of
`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-04-fledge-alpha-s1-s24-r1\noskill\S1-static-scan\fixture\`
(dsh 0.1.1-era legacy plugin, target: dsh 0.1.2-alpha.2).

## Card-ID notation and corridor folding

- Corridor: 0.1.1-rc.2 → … → 0.1.2-alpha.2. Cards referenced as `A1-0N` (full ID may be `A1-0N` spelled out). Within this fixture, card `A1-0N` corresponds to touchpoint category `#N`.
- Corridor folding rule applied: where a field was removed in an intermediate corridor version (e.g. alpha.1) and restored in the target (alpha.2), the mapping uses the **final net state** in 0.1.2-alpha.2, not the intermediate removal. Concretely, for `#2` the `ignorable` marker on `SessionEvent` is removed in alpha.1 but its producer/persistence contract is restored in alpha.2, so the legacy producer is evaluated against the **restored** contract (alpha.2 state): the event is still persisted/produced, and the collision is not "marker removal" but any contract drift in the restored producer/persistence semantics. Intermediate alpha.1-only removal cards are not separately flagged.
- Limitation: the canonical change-card document itself is not present inside this cell directory; card identification below is derived from the fixture's own in-code annotations and the corridor description in the brief. No external documentation was consulted (per the brief, none was searched).

## Touchpoint #1 — Source patch of Host source

**Hit: yes.**

Files/lines:
- `fixture\patch.yml:1-6` — declares a patch surface against `src/session/view/SessionView.ts`, renaming `renderSessionView` → `renderSessionViewPatched`.
- `fixture\cordis.patch.yml:1-6` — profile composition referencing `patch.yml` as a patch entry.
- `fixture\scripts\apply-patch.mjs:1-19` — reads `patch.yml`, prints the surface, shells out to `dsh`.
- `fixture\package.json:7` — `apply-patch` npm script wiring.

Concrete couplings: legacy mechanism that patches Host/Winter-CGR sources and expects upstream symbol names (`renderSessionView`) to be stable.

Card mapping: **A1-01** (source-patch touchpoint). Collision: the patched file/symbol set can no longer be assumed to exist under 0.1.2-alpha.2's UI decomposition; patch application must be removed or replaced by the supported extension surface.

## Touchpoint #2 — Internal/persistent events

**Hit: yes.**

Files/lines:
- `fixture\src\index.ts:13-22` — produces an external durable informational event: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: {...} })` and subscribes with `ctx.on('session/event', ...)`.

Concrete couplings: emits and consumes Host `SessionEvent` as a durable/persistent channel, carrying the legacy `ignorable` marker.

Card mapping: **A1-02**. Corridor folding: alpha.1 removed the ignorable marker; alpha.2 restored the producer/persistence contract. Final net state (0.1.2-alpha.2): the restored contract applies — the legacy producer must match the alpha.2 producer/persistence semantics; do **not** flag alpha.1's marker removal as the collision. If the restored contract changed shape, this event emission/subscription pair needs migration.

## Touchpoint #3 — Internal service / Remote (`ctx.get`)

**Hit: yes.**

Files/lines:
- `fixture\src\index.ts:25-32` — `ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', ...)` and `apiProxy.invoke('llm.providers')`.

Concrete couplings: direct use of the legacy internal `apiProxy` service and its verb surface (`session.rename`, `llm.providers`).

Card mapping: **A1-03**. Collision: internal service access path renamed/replaced in the corridor; `ctx.get('apiProxy')` and these invokes must be migrated to the new public service/Remote surface.

## Touchpoint #4 — Host filesystem

**Hit: yes.**

Files/lines:
- `fixture\src\index.ts:35-38` — `join(homedir(), '.dsh', 'profiles', 'default')` + `writeFileSync(... 'legacy-note.txt')`.

Concrete couplings: hard-coded Host profile directory `~/.dsh/profiles/default`, writes directly into it.

Card mapping: **A1-04**. Collision: host directory layout is no longer guaranteed stable at that fixed path; use the provided profile/path APIs.

## Touchpoint #5 — Internal UI / commands / tools

**Hit: yes.**

Files/lines:
- `fixture\src\index.ts:9-10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` (private path).
- `fixture\src\index.ts:41-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`.

Concrete couplings: import from a private `/internal` export and constructing the private `SessionView` (UI decomposition removed the Host/Web internal path), plus private command-registration surface.

Card mapping: **A1-05**. Collision: `@deepseek-ai/dsh-session-view/internal` no longer exists; `SessionView` must be obtained via the public contribution API.

## Touchpoint #6 — Custom channel

**Hit: yes.**

Files/lines:
- `fixture\src\index.ts:45-54` — `startLegacyBridge()` creates a loopback HTTP server on `127.0.0.1:43121` answering `/api/legacy`, bypassing the Host Gateway auth model (never invoked; static fixture).

Concrete couplings: private loopback HTTP bridge / custom channel outside the Host Gateway authentication model.

Card mapping: **A1-06**. Collision: unsupported custom channel; must be routed through the Host Gateway with proper auth.

## Touchpoint #7 — Subprocess / output parsing

**Hit: yes.**

Files/lines:
- `fixture\src\index.ts:56-67` — `spawn('dsh', ['--profile', 'headless', prompt])`, parses each stdout chunk as JSON (`JSON.parse(line)`), expects `event.type === 'final'` / `event.text`.
- `fixture\scripts\apply-patch.mjs:11-18` — `execFileSync('dsh', ['--profile','headless','ping'])`, splits stdout by newline and `JSON.parse`s each line, same final-text expectation.

Concrete couplings: wrapper around the headless `dsh` CLI assuming stdout is JSONL events; the target CLI emits final plain text, not JSONL.

Card mapping: **A1-07**. Collision: stdout contract changed; parsing must be updated to the final-text output of `dsh --profile headless`.

## Scan completeness notes

All files under `fixture\` were read in full: `README.md`, `package.json`, `patch.yml`, `cordis.patch.yml`, `src\index.ts`, `scripts\apply-patch.mjs`. There are no other source files in the fixture, so no untouched categories: every one of #1–#7 produced at least one hit. Had a category shown no hit, "no hit" would not prove absence of migration impact — couplings can be transitive (e.g. a private import pulled in by a transitive dependency, an event type emitted by another package, or a subprocess wrapper in a script not grepped). Here all seven categories were confirmed by direct source evidence.

## Read-only discipline

No file under `fixture\` was modified, created, deleted, or executed. No migrations/installations run. Report written only under `agent-output\S1-static-scan\`.
