# S1 · Static Touchpoint Scan Report (Read-Only)

Target fixture: `fixture/` (verbatim copy of the legacy plugin, dsh 0.1.1 era)
Corridor scanned against: dsh 0.1.1-rc.2 → 0.1.2-alpha.2 (change cards A1-xx, corridor-folded to final net state)
Scan performed: fully read-only; no file under `fixture/` was created, modified, or deleted; nothing was executed or installed. All findings below come from reading the six fixture files in full.

## Fixture inventory (complete)

| File | Lines | Role |
|---|---|---|
| `fixture/README.md` | 16 | Fixture self-description; includes the author's own touchpoint map (lines 8–16) |
| `fixture/cordis.patch.yml` | 6 | Profile composition + source-patch declaration (#1) |
| `fixture/package.json` | 9 | `legacy-plugin@0.1.1`, `apply-patch` npm script |
| `fixture/patch.yml` | 6 | Declarative patch surface for Host source (#1) |
| `fixture/scripts/apply-patch.mjs` | 19 | Patch applier + headless-CLI output parser (#1, #7) |
| `fixture/src/index.ts` | 68 | Plugin entry: events, services, fs, UI, channel, subprocess (#2–#7) |

No other files exist in the cell (recursive glob of `**/*` returned exactly these six files, plus this report's own output directory afterwards).

---

## #1 Source patch — HIT

**Hit:** yes.

| File | Lines | Concrete coupling point |
|---|---|---|
| `fixture/cordis.patch.yml` | 5–6 | `patch:` block declaring `- patch.yml` — the plugin relies on the Host's source-patch mechanism |
| `fixture/patch.yml` | 2–6 | `surface:` list targeting `src/session/view/SessionView.ts`, replacing `export function renderSessionView` with `export function renderSessionViewPatched` — a string-level patch on an **internal Host source file** |
| `fixture/scripts/apply-patch.mjs` | 5–9 | Requires env `DSH_HARNESS_SOURCE_ROOT` (line 5–6) and reads `patch.yml` (line 8) — couples to the harness source tree layout and the patch-surface format |
| `fixture/package.json` | 6–8 | `"apply-patch": "node scripts/apply-patch.mjs"` — wires the patch step into the plugin lifecycle |

**Card mapping:** corridor cards covering the source-patch mechanism / patch-surface declaration and the session-view source layout (A1 series, #1 source-patch card(s); the patched target `src/session/view/SessionView.ts` is part of the UI-decomposition surface also referenced under #5). Net state in 0.1.2-alpha.2: the patch surface and the patched file path must both be re-validated; a patch whose anchor string (`export function renderSessionView`) no longer exists in the target tree fails silently or loudly depending on the applier.

## #2 Events — HIT

**Hit:** yes.

| File | Lines | Concrete coupling point |
|---|---|---|
| `fixture/src/index.ts` | 15–19 | `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: ... })` — produces a **durable/persistent informational SessionEvent carrying the `ignorable` marker field** |
| `fixture/src/index.ts` | 20–22 | `ctx.on('session/event', ...)` — subscribes to the same internal persistent event stream (typed `SessionEvent`) |

**Card mapping (corridor folding applied):** the A1 corridor card for the SessionEvent `ignorable` marker shows the classic fold: **removed in the intermediate corridor version (0.1.2-alpha.1), restored — with its producer/persistence contract — in the target version (0.1.2-alpha.2)**. Folded to the final net state, `ignorable: true` is again a supported producer field in the target. Net mapping: the event producer/subscriber couple to the SessionEvent schema card; after folding, this is a **watch item, not a breaking change** — the field survives the corridor. (Had one compared only against alpha.1, this would have been misreported as a breaking removal; folding corrects that.)

## #3 Service / Remote — HIT

**Hit:** yes.

| File | Lines | Concrete coupling point |
|---|---|---|
| `fixture/src/index.ts` | 25–28 | `ctx.register('rename-session', ...)` obtains `await ctx.get('apiProxy')` and calls `apiProxy.invoke('session.rename', { id, title })` — legacy Host **APIProxy** remote-invocation surface with a positional method-name string |
| `fixture/src/index.ts` | 29–32 | `ctx.register('list-providers', ...)` again `ctx.get('apiProxy')` + `apiProxy.invoke('llm.providers')` |

**Card mapping:** the A1 corridor card for the internal service/Remote layer (apiProxy service retrieval and `invoke(method, params)` RPC strings). Both `session.rename` and `llm.providers` are named-remote-method couplings; any rename/removal of the Remote method table or of the `apiProxy` service key in the corridor maps here.

## #4 Host directory — HIT

**Hit:** yes.

| File | Lines | Concrete coupling point |
|---|---|---|
| `fixture/src/index.ts` | 35–38 | `write-note` builds `join(homedir(), '.dsh', 'profiles', 'default')` and writes `legacy-note.txt` into it — **hard-coded assumption of the Host profile directory layout** (`~/.dsh/profiles/<profile>`) and of a profile literally named `default` |

**Card mapping:** the A1 corridor card for the Host filesystem/profile-directory layout. Any change in the profile storage location, directory naming, or profile-identity model in 0.1.2-alpha.2 breaks this path construction.

## #5 UI / commands / tools — HIT

**Hit:** yes.

| File | Lines | Concrete coupling point |
|---|---|---|
| `fixture/src/index.ts` | 10 | `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` — imports a **private/internal package path** (explicitly commented "private Host/Web Client path removed by UI decomposition", line 9) |
| `fixture/src/index.ts` | 41–43 | `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))` — command registration through the internal `contributes` surface, instantiating the internal view class with a constructor option (`enhanced`) |

**Card mapping:** the A1 corridor card for UI decomposition / internal UI-command surface (removal of the `@deepseek-ai/dsh-session-view/internal` private path; command-registration contract). Note the cross-coupling with #1: `patch.yml` patches the very same session-view source area that this import depends on, so the UI-decomposition card must be applied to both touchpoints consistently.

## #6 Custom channel — HIT

**Hit:** yes.

| File | Lines | Concrete coupling point |
|---|---|---|
| `fixture/src/index.ts` | 45–54 | `startLegacyBridge()` creates a raw `node:http` server on `127.0.0.1:43121` (comment references `http://localhost:43121/api/legacy`) — a **private loopback HTTP bridge that bypasses the Host Gateway authentication model** (comment line 45). The function is intentionally never invoked (`void startLegacyBridge`, line 54), but the coupling pattern is present in source and is what a static scan must flag |

**Card mapping:** the A1 corridor card for the Host Gateway / channel model. Net state: a bypass channel around Gateway auth collides with any hardening or contract change in the Gateway card even though the fixture never executes it.

## #7 Subprocess / output parsing — HIT

**Hit:** yes.

| File | Lines | Concrete coupling point |
|---|---|---|
| `fixture/scripts/apply-patch.mjs` | 12–18 | `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })`, then splits stdout on `'\n'` and `JSON.parse`s **every non-empty line**, expecting `{ type: 'final', text }` events — assumes headless stdout is JSONL |
| `fixture/src/index.ts` | 57–66 | `spawn('dsh', ['--profile', 'headless', prompt])` with `child.stdout.on('data', ...)` doing `JSON.parse(line.toString())` **per data chunk** and matching `event.type === 'final'` — same JSONL assumption, plus a chunk-boundary bug (a `'data'` event is not line-aligned) |

**Card mapping:** the A1 corridor card for the headless-CLI output contract. The fixture's own comments state the assumption is **already wrong for the target contract**: headless stdout in the 0.1.2 line is **final text, not JSONL**. So this touchpoint maps to the headless output-parsing card with a definite break: every `JSON.parse` on stdout would throw on the first non-JSON byte.

---

## No-hit categories — none

All seven categories hit. For completeness, the negative part of the scan:

- Files fully read: all six files listed in the inventory (no `.d.ts`, config, or hidden files exist; recursive glob was exhaustive).
- Ruled out: no additional touchpoints beyond the seven categories (e.g., no theme tokens, no keybindings, no MCP servers, no plugin-config schema usage — `config: {}` in `cordis.patch.yml` line 4 is empty; no other imports than those listed in `src/index.ts` lines 4–10).
- **Why "no hit = no problem" cannot be concluded in general** (and would not have been safe even here had a category come back empty): a static, non-executable copy can hide (a) runtime-only couplings behind dynamic strings (e.g., the `'session.rename'` / `'llm.providers'` RPC names found here are plain strings — grep-style scanning only catches them if you know the namespace), (b) couplings in files excluded from the fixture copy, and (c) behavioral contract changes (like #7's stdout format) whose trigger is execution, not source shape. Absence of evidence in a static scan is not evidence of absence — each empty category would need a corridor-card cross-check against runtime behavior before being declared safe.

## Card-mapping summary (folded to 0.1.2-alpha.2 net state)

| Touchpoint | Hit files | Corridor card (A1 series) | Net severity after folding |
|---|---|---|---|
| #1 Source patch | cordis.patch.yml, patch.yml, scripts/apply-patch.mjs, package.json | source-patch mechanism / patch-surface card (+ shared session-view surface with #5) | Must re-validate anchor strings against target tree |
| #2 Events | src/index.ts:15–22 | SessionEvent schema card — `ignorable` removed in alpha.1, **restored in alpha.2** | Folded net: non-breaking; watch item only |
| #3 Service/Remote | src/index.ts:25–32 | apiProxy / Remote method-table card | Breaking risk if `apiProxy` key or method names changed |
| #4 Host directory | src/index.ts:35–38 | Host profile-directory layout card | Breaking risk: hard-coded `~/.dsh/profiles/default` |
| #5 UI/commands | src/index.ts:9–10, 41–43 | UI decomposition / internal-path removal card | Breaking: `@deepseek-ai/dsh-session-view/internal` is removed |
| #6 Custom channel | src/index.ts:45–54 | Host Gateway / channel model card | Collision by design (bypass), even though never invoked |
| #7 Subprocess/output | scripts/apply-patch.mjs:12–18, src/index.ts:57–66 | headless output contract card (stdout = final text, not JSONL) | Definite break: JSONL parse assumption wrong |

**Corridor-folding note (requirement 2):** fields/behaviors removed in an intermediate corridor version and restored in the target are mapped by their **final net state**. Concretely here, #2's `ignorable` marker is the folded case: alpha.1 removal is superseded by alpha.2 restoration of the producer/persistence contract, so it is reported as "supported in target — watch item" rather than as a breaking removal. All other hits involve no restoration and map to their cards at face value.

**Read-only discipline:** verified — the scan used only read/glob operations; the sole write in this session is this report under `agent-output/S1-static-scan/`, inside the cell as authorized. The fixture is byte-identical to its pre-scan state.
