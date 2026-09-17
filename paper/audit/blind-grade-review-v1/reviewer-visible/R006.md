# Touchpoint Inspection Report · legacy-plugin 0.1.1 → dsh 0.1.2-alpha.2

Mode A (read-only inspect), per the dsh-plugin-upgrade skill. Fixture scanned at
`E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S1-static-scan/environment/fixture`
(stand-in for `/app/fixture/`). **The fixture was not modified**; no build, install, or
migration was executed; no network access was used.

## 0. Inventory and corridor

- Files scanned (complete set): `README.md`, `package.json`, `cordis.patch.yml`, `patch.yml`,
  `scripts/apply-patch.mjs`, `src/index.ts` — 6 files, all read line-by-line.
- Plugin identity: `legacy-plugin` `version: 0.1.1`, `private: true`, `"type": "module"`,
  **no dependencies, no peerDependencies, no `engines`**, no `dsh-plugin.json`, no lockfile
  (`package.json` has only the `apply-patch` script). Composition: `cordis.patch.yml` mounts
  `legacy-plugin` **and declares a source patch** (`patch: [patch.yml]`).
- Corridor: `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`, connected by the
  `from → to` metadata in references/README.md (alpha.1 set `from: dsh-v0.1.1-rc.2`,
  28 cards, idPrefix `DSH-0.1.2-A1`; alpha.2 set carries `DSH-0.1.2-A2-*`),
  **not** by filename order. Full corridor read before mapping; folding rule applied (see #2).
- Face: Host-plane ordinary Cordis plugin (`src/index.ts` uses `ctx.get`, host fs/child_process)
  plus a Host-side patch script; **no Web Client half** (no `dsh.client`, no client imports
  except the internal `dsh-session-view/internal` import).

## Summary table

| Touchpoint | Hit | File/line | Applicable card (net, folded) | Confidence |
|---|---:|---|---|---|
| #1 source patch | YES | `cordis.patch.yml:5-6`, `patch.yml:3-5`, `scripts/apply-patch.mjs:5` | DSH-0.1.2-A1-03 (+ API-08 classification) | high |
| #2 events | YES | `src/index.ts:15-22` | DSH-0.1.2-A1-02 **folded into** DSH-0.1.2-A2-01 → net: no producer change | high (folding applied) |
| #3 service/Remote | YES | `src/index.ts:26-32` | DSH-0.1.2-A1-01; secondary DSH-0.1.2-A2-02 | high |
| #4 host directory | YES | `src/index.ts:36-37` | DSH-0.1.2-A1-04; DSH-0.1.2-A1-13 (conditional) | medium-high |
| #5 UI/commands/tools | YES | `src/index.ts:10,41-43` | DSH-0.1.2-A1-03 (touchpoints #1+#5); A1-26/A1-28/A1-29 ruled out | high |
| #6 custom channel | YES | `src/index.ts:47-53` | DSH-0.1.2-A1-08; A1-19 ruled out | high |
| #7 subprocess/output | YES | `src/index.ts:57-67`, `scripts/apply-patch.mjs:12-19` | DSH-0.1.2-A1-05 (+API-06); A1-04 conditional; A2-04 ruled out | high |

All seven categories hit; there is no zero-hit category (see §3 for the residual-risk caveat
that this static scan nevertheless cannot prove compatibility).

## 1. Hits by category

### #1 Source patch / monkey patch — HIT

- `cordis.patch.yml:5-6`: a `patch:` list containing `- patch.yml`. This is **not** plain
  profile composition: the file's own header says "profile composition plus source patch
  declaration (#1)", and per API-08 a plain `cordis.patch.yml` is composition — but this one
  carries a real patch-surface declaration, so it is classified as a source-patch hit, not a
  composition-only file.
- `patch.yml:3-5`: patch target `src/session/view/SessionView.ts`, replacing
  `export function renderSessionView` with `renderSessionViewPatched`.
- `scripts/apply-patch.mjs:5-6`: `process.env.DSH_HARNESS_SOURCE_ROOT` drives host-source
  patch application — the classic patch-surface marker from pre-flight #1.

Coupling: the patch target `src/session/view/SessionView.ts` and the symbol
`renderSessionView` are host session-view internals that alpha.1 splits up extensively.
Card **DSH-0.1.2-A1-03** (touchpoints #1, #5): "Patch target paths, internal imports, or UI
registration points no longer work." Every old patch target must be re-mapped against an
exact-tag compare of `dsh-v0.1.2-alpha.2`; capabilities without a stable public seam must be
marked pending confirmation, not guessed.

### #2 Internal event names / persistent events — HIT (corridor folding applies)

- `src/index.ts:15-19`: **producer** of a third-party persisted event
  `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, ... })`.
- `src/index.ts:20-22`: plain **observer** `ctx.on('session/event', ...)` (no persistence,
  transport, or whitelist coupling; no unknown-required-event whitelist exists).

Coupling and folding: alpha.1 card **DSH-0.1.2-A1-02** removed `SessionEvent.ignorable`
retention (action level "required-if-target-is-alpha.1"); alpha.2 card
**DSH-0.1.2-A2-01** restores it. Per the brief's folding rule, the corridor's **final net
state** is the alpha.2 restore, so:

- **A1-02 must NOT be applied** — deleting the producer's `ignorable: true` marker and the
  envelope-retention assumptions would be a wrong intermediate-step migration that A2-01
  then forces back (A1-02's own recipe: "first read A2-01 to compute the corridor net state;
  do not delete the producer marker and then restore it").
- Net mapping: **DSH-0.1.2-A2-01 only**. The producer line can keep writing
  `type: 'legacy/informational-note'` with `ignorable: true`; alpha.2 retains the field
  through envelope/JSONL/SQLite/API transports. Residual alpha.2 constraints that still bind:
  the public live `Session.append` face still has no `ignorable` parameter, so if the emit
  path changes the producer seam must not fake the flag via cast; the alpha.2 SQLite provider
  accepts only schema 20 and rejects schema 19.
- The observer at line 20 is a plain consumer and needs no card.

### #3 Internal service probes / Remote — HIT

- `src/index.ts:26-27`: `const apiProxy = await ctx.get('apiProxy')` then
  `apiProxy.invoke('session.rename', { id, title })`.
- `src/index.ts:30-31`: same pattern with `apiProxy.invoke('llm.providers')`.

Coupling: the `apiProxy` service key / `ApiProxy` type / `@deepseek-ai/dsh-host-apiproxy`
package are deleted in alpha.1 — card **DSH-0.1.2-A1-01** (touchpoints #3, indirectly #1).
This is a **host-plane** consumer (server-side `ctx.get`), so per the A1-01 field note the
correct migration is **not** `ctx.remote` (that is the client-plane facade; the host plane
would stall at `pending (waiting for service: remote)`) but to inject the owning domain
services directly: `session.rename` → the Session domain rename / `session/rename` mapping,
and `llm.providers` → note the split into `llm/listProviders` plus
`llm/listConfigurableProviders`. Secondary exposure: after re-routing, failures return
`RemoteResult<T>` carrying a `RemoteError` with namespaced codes — **DSH-0.1.2-A2-02**
(`internal` → `gateway/internal`, `session-not-found` → `session/not-found`, etc.); the
plugin currently has no error handling, so any new branching must use the new vocabulary,
never old bare code strings.

### #4 Direct host directory reads/writes — HIT

- `src/index.ts:36-37`: `join(homedir(), '.dsh', 'profiles', 'default')` then
  `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`.

Coupling: a hard-coded fixed Host profile path (`~/.dsh/profiles/default`) written from
plugin data flow (both path segments are literals on the same lines — the data-flow trace
pre-flight requires is complete). Cards: **DSH-0.1.2-A1-04** (touchpoints #4, #7 — alpha.1
removes standalone demo bins/packages and reshapes profiles; wrappers that hardcode fixed
profile paths no longer match; `headless`/`dsh` themselves still exist, so this is a
path-assumption risk rather than a confirmed removal) and **DSH-0.1.2-A1-13** (conditional —
platform shell and directory-picker fixes may obsolete workarounds; here there is no
workaround, only an assumption that the default profile directory is writable plugin
storage, which no card guarantees).

### #5 Internal UI / commands / tool registration — HIT

- `src/index.ts:10`: `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`
  — a private Host/Web internals path, flagged by the fixture's own comment as "removed by
  UI decomposition".
- `src/index.ts:41-43`: `ctx.contributes.registerCommand('legacy.openView', ...)`
  constructing `new SessionView({ enhanced: true })`.

Coupling: both lines are the same internal session-view coupling — card
**DSH-0.1.2-A1-03** (touchpoints #1 and #5; rebuild imports by owning module against an
exact-tag compare; do not guess a replacement path). Ruled out within this class:
**A1-26** (client-modules scan / `PLUGIN_ID` registration id) — no client bundle or
`dsh.client` block exists; **A1-28** (composer contenteditable) and **A1-29**
(`MarkdownText` labels) — no browser DOM or ui-primitives usage anywhere; **A1-06** (PTC
rename) — no tool presentation mode, dispatch waterfall, or `tools.mode: code`; A1-09/10/11
are optional capabilities and are not adopted automatically.

### #6 Custom HTTP / WS / RPC / DOM / CSS channels — HIT

- `src/index.ts:47-53`: `createServer(...)` with `server.listen(43121, '127.0.0.1')`
  (advertised as `http://localhost:43121/api/legacy`), with no authentication, no
  Host/Origin check, and no teardown wiring (defined but never invoked in this static
  fixture).

Coupling: a private loopback HTTP channel that "bypasses the Host Gateway authentication
model" (fixture's own comment, line 45) — card **DSH-0.1.2-A1-08** (touchpoints #6):
alpha.1+ Web/API channels use process-scoped bootstrap tokens and signed cookies; private
routes that bypass auth become security holes, and unauthenticated direct `/api` calls now
receive 401/403. A surviving bridge must integrate the token/cookie model — "listening on
loopback only" is explicitly not a reason to skip authentication. Ruled out: **A1-19**
(browser acceptance scripts reading the boot manifest/auth URL) — nothing fetches the web
root or a client bundle.

### #7 Subprocess / stdout / stderr parsing — HIT

- `src/index.ts:57-67`: `spawn('dsh', ['--profile', 'headless', prompt])` with
  `child.stdout.on('data', ...)` running `JSON.parse(line)` per chunk, expecting
  `{ type: 'final', text }` JSONL events.
- `scripts/apply-patch.mjs:12-19`: `execFileSync('dsh', ['--profile', 'headless', 'ping'])`
  then `output.split('\n')` → `JSON.parse(line)` — the file's own comment (line 11) states
  the expectation is "deliberately wrong: target headless stdout is final text, not JSONL".

Coupling: card **DSH-0.1.2-A1-05** (touchpoint #7): rc.2 stdout was **already** the final
assistant text with exit code 0/1 — it was never JSONL — and alpha.1 additionally makes
stderr carry a `dsh: reasoning:` segment. Both wrappers must read stdout as final text (per
API-06's headless argv/output contract) and treat stderr output as reasoning, not failure.
Folding note: the JSONL assumption was already wrong at `from` (rc.2), so the parse rewrite
is required regardless of the corridor; the corridor-specific addition is the stderr
reasoning segment. Conditional: **DSH-0.1.2-A1-04** (`--profile headless` / the `dsh` bin
still exist, but demo-bin removals mean wrappers must pin exact binaries/profiles), and
pre-flight #7 requires recording argv, cwd, env, cancellation, and exit codes — neither
wrapper captures exit codes or cancellation today. Ruled out: **DSH-0.1.2-A2-04** (Node 24
loader fix) — no Node-version workaround branches exist in either wrapper.

## 2. Corridor card mapping (folded net state)

| Hit | Intermediate card (alpha.1) | Target-state card (alpha.2) | Net action for 0.1.2-alpha.2 |
|---|---|---|---|
| #2 ignorable producer | DSH-0.1.2-A1-02 (removed `ignorable` retention) | DSH-0.1.2-A2-01 (restored it) | **A1-02 cancelled by A2-01**; keep the `ignorable: true` producer line as-is; only alpha.2 residual constraints apply |
| #3 apiProxy calls | DSH-0.1.2-A1-01 (APIProxy deleted in alpha.1, not restored) | DSH-0.1.2-A2-02 (error vocabulary on top) | Migrate to direct host-plane domain-service injection (never `inject:['remote']` on the host plane); new error branching uses namespaced `RemoteError` codes |
| #1/#5 session-view patch + import | DSH-0.1.2-A1-03 (split, never undone) | — | Re-map the patch target and internal import against exact alpha.2 source; mark un-reproducible capabilities pending confirmation |
| #4 fixed profile path | DSH-0.1.2-A1-04 (conditional), DSH-0.1.2-A1-13 | — | Replace the hard-coded `~/.dsh/profiles/default` assumption with host-provided facts or documented seams; verify on the alpha.2 profile layout |
| #6 loopback HTTP | DSH-0.1.2-A1-08 (auth gate, never relaxed) | — (precision checklist: preserve protocol when adding auth) | Add bootstrap-token/cookie auth; unauthenticated direct `/api` access will 401/403 |
| #7 headless wrappers | DSH-0.1.2-A1-05 (stdout already text at rc.2; stderr gains reasoning in alpha.1) | API-06 contract unchanged in alpha.2 | Parse stdout as final text; never treat stderr as failure; capture exit codes and cancellation |

Cards checked and **not applicable** despite the corridor: A1-06, A1-20, A1-21, A1-22,
A1-24, A1-25, A1-26, A1-27, A1-28, A1-29, A1-30, A1-31, A1-32, A2-03, A2-05, A2-06, A2-08,
A2-10 — none of their trigger surfaces (client runtime, workspaces, subagent descriptors,
settings namespaces, sessionProjections peers, pi-ai, pluginInventory strict consumers,
user-questions providers) appear in any scanned file; `package.json` declares no
`@deepseek-ai/*` dependencies at all, so dependency/peer-floor cards cannot bind.

## 3. No-hit categories and the limits of this scan

All seven categories produced hits, so there is no true zero-hit category to report. The
closest cases are the **ruled-out sub-surfaces** documented per category above (e.g. #5:
A1-26/A1-28/A1-29 scanned for and excluded because there is no client half — evidence: no
`dsh.client` key and no browser DOM or ui-primitives imports in any of the 6 files).

Why "no hit" could not be concluded as "no problem" even where sub-surfaces were clean —
the pre-flight caveat applies to this scan as a whole:

1. This is a heuristic static scan against a curated card list — explicitly "not a complete
   API diff"; cards can miss changes and patterns can miss usages.
2. Static analysis cannot see data flow through dynamic constructs (`ctx.register` payloads
   are typed `any` throughout `src/index.ts`), runtime service resolution, or resolved
   composition.
3. The fixture is deliberately non-compilable (README line 3), so no build/typecheck was
   run — every finding is unverified against a real alpha.2 host. Even at zero hits one
   would still need: dependency/configuration re-check against the target cohort, build +
   typecheck (`skipLibCheck: false`), a real cold mount on a 0.1.2-alpha.2 profile with no
   `pending (waiting for service: ...)` rows, and one functional path.

## Must verify before migration (plan only; nothing was executed)

1. A1-03: diff `src/session/view/SessionView.ts` / `renderSessionView` between
   `dsh-v0.1.1-rc.2` and `dsh-v0.1.2-alpha.2` exact tags; re-home or retire `patch.yml` and
   the `patch:` row in `cordis.patch.yml` (API-08: composition rows stay composition; patch
   entries must map to alpha.2 files or be retired with a stated reason).
2. A1-01/A2-02: replace both `ctx.get('apiProxy')` call sites with direct domain-service
   injection on the host plane; add `RemoteResult` handling with namespaced codes.
3. A2-01: keep the `ignorable: true` producer line unchanged (folded corridor net state).
4. A1-08: authenticate the loopback bridge or remove `startLegacyBridge`.
5. A1-05/API-06: rewrite both headless wrappers to consume stdout as final text and stderr
   as `dsh: reasoning:`; capture exit codes and cancellation.
6. Runtime: cold mount on a real alpha.2 profile; verify no pending rows, one
   message → tool → response flow, and that the patched surface still applies.
