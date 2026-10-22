# S1 · Static Touchpoint Scan — legacy-plugin

- **Plugin**: `legacy-plugin` 0.1.1 (dsh 0.1.1-era source, static fixture)
- **Corridor**: `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2` — two edges: `rc.2 → 0.1.2-alpha.1` (28 cards, `DSH-0.1.2-A1-*`) and `alpha.1 → alpha.2` (8 cards, `DSH-0.1.2-A2-*`), connected by the `from → to` index, never by filename order.
- **Scan date**: 2026-10-20 · **Mode**: read-only static scan; no file under `fixture/` was modified, created, or deleted; no migrations or installs were executed; the fixture is intentionally uncompilable and was not built or run.
- **Files scanned (complete fixture inventory — 6 files, no others exist)**: `README.md`, `package.json`, `cordis.patch.yml`, `patch.yml`, `scripts/apply-patch.mjs`, `src/index.ts`. No tests, CI, lockfile, `dsh-plugin.json`, or tsconfig exist to scan.
- **Method**: full read of every file + the seven pre-flight pattern classes, plus negative checks for surfaces not expected here (`WebSocket`, `MutationObserver`, `dsh-client-runtime`, `ctx.settings`, `userQuestions`, `tasks.peek`, `tools.mode`/PTC rename tokens, `execa`, `Bun.spawn`, `cordis.yml`, `ctx.agent` — all zero matches).

---

## #1 · Source patch / monkey patch — HIT

| File | Lines | Coupling point |
|---|---|---|
| `patch.yml` | 1–6 | Declares a patch surface targeting host source file `src/session/view/SessionView.ts`, replacing the semantic marker `export function renderSessionView` with `renderSessionViewPatched`. |
| `scripts/apply-patch.mjs` | 5–9 | Reads `DSH_HARNESS_SOURCE_ROOT` env var and `patch.yml` to apply the surface against a host source checkout (patch-surface mechanism, same family as the dsh-tui field note). |
| `cordis.patch.yml` | 2–6 | Profile composition row for `legacy-plugin` with `patch: [patch.yml]`. |
| `package.json` | 6–8 | `"apply-patch": "node scripts/apply-patch.mjs"` script wiring. |

**Classification (API-08)**: `cordis.patch.yml` itself is the official Loader **composition** overlay, not a source patch — a filename containing "patch" alone is not a #1 hit, and this row must be treated as the public/negative control. The real #1 hits are `patch.yml` + `apply-patch.mjs`, which couple to host source paths.

**Cards**: **A1-03** (Session view internals split up extensively; touchpoints #1/#5; patch target paths no longer work — each old target must be mapped one-by-one against an exact-tag compare of the target version, and targets with no owning module are marked "pending confirmation", never guessed). The specific target `src/session/view/SessionView.ts` sits squarely in the split-up session-view tree.

## #2 · Internal/persistent events — HIT

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 15–19 | **Producer** of an external persisted informational event: `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })`. |
| `src/index.ts` | 20–22 | **Observer**: `ctx.on('session/event', ...)` — logs `event.type`. The `type`-keyed envelope matches the 0.1.1-rc.1 contract (`type`, not `kind`); no coupling to a removed envelope shape. |

**Corridor folding (removed-then-restored)**: `SessionEvent.ignorable` was **removed** in alpha.1 (**A1-02**, action level `required-if-target-is-alpha.1`) and **restored** in alpha.2 (**A2-01**). Because the final target is alpha.2, the net state is: **the marker stays — do not delete and re-add it**. The hit maps to the final-net-state card **A2-01**; A1-02 is the intermediate edge the fold absorbs and is cited for traceability, not as an action card.

**Residual risk even at net state (API-05)**: alpha.2 restores retention semantics on the envelope/persistence/reload/transport seams, but the **public** `Session.append(...)` still has no `ignorable` parameter. A third-party producer writing through an unsupported surface (cast/faked entry) can live-append fine yet fail the next cold load with `SessionFormatUnsupportedError`, refusing the whole Session — a silent-write/loud-read trap one smoke test cannot catch. The fixture's `ctx.emit('session/event', …)` route is not the documented public append seam, so the producer seam should be marked as a capability gap rather than cast into existence.

## #3 · Internal service / Remote — HIT

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 26–28 | `ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', { id, title })` |
| `src/index.ts` | 29–32 | `ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')` |
| `src/index.ts` | 10 | `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` — a `/internal` deep subpath (also counted at #5, where it bites). |

Face: host-plane (server-side) plugin code — the old `apiProxy` service key is the **host-plane facade**, not the client-plane `ctx.remote`; injection names cannot be swapped one-to-one across planes.

**Cards**:
- **A1-01** (APIProxy removed; breaking): the rc.2 service key `apiProxy` and package `@deepseek-ai/dsh-host-apiproxy` disappear in alpha.1. Per the ledger, `session.rename` → Remote `session/rename`, and `llm.providers` → the pair `llm/listProviders` + `llm/listConfigurableProviders`. Plane discipline from the card's field note applies: host-plane consumers should skip the gateway and inject the domain service directly (e.g. `inject: ["llm"]` → `ctx.llm.listProviders()`); naively switching to `inject: ["remote"]` stalls at `pending (waiting for service: remote)`.
- **A2-02** (Remote failures become `RemoteError`; breaking): after migrating to unary Remote calls, results are `RemoteResult<T>`; the fixture's fire-and-forget `await apiProxy.invoke(...)` style does not check `result.ok`, and error codes are namespaced (`internal` → `gateway/internal`, `cancelled` → `gateway/cancelled`, `session-not-found` → `session/not-found`, …). Branching on old code strings or defensive catch-all misclassifies business failures.

## #4 · Direct host directory reads/writes — HIT

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 5–7, 35–38 | `join(homedir(), '.dsh', 'profiles', 'default')` + `writeFileSync(..., 'legacy-note.txt')` — hard-coded `~/.dsh` home and the literal profile name `default`. |

(For contrast: `scripts/apply-patch.mjs:8` reads `patch.yml` from its own cwd — a plugin-side file, not a host-directory coupling.)

**Cards**: **A1-04** (touchpoints #4/#7): hard-coded user directories and fixed profile paths no longer match; the runtime `DSH_HOME`, the target profile, and the official launcher are the source of truth. Profiles live under `$DSH_HOME/profiles`; `homedir() + '.dsh'` is exactly the coupling the card tells you to remove. A1-04's other half (removed standalone demo bins `dsh-acp-demo` / `dsh-jsonrpc-agent`) does not hit this fixture.

## #5 · Internal UI / commands / tool registration — HIT

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 10 | `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` — private deep subpath of the session-view package. |
| `src/index.ts` | 41–43 | `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))` — command handler directly instantiating a removed session-view internal class. |

**Cards**:
- **A1-03** (breaking; #1/#5): session-view internals were split up extensively in alpha.1 — internal imports and UI registration points no longer work; imports must be rebuilt by owning module against the target tag, and capabilities with no stable public seam are marked "pending confirmation", not guessed.
- **API-07** (ledger, supporting): a `/internal`-style deep subpath is the "package export ≠ artifact presence" risk class — even a resolvable export-map entry can miss the packed artifact; deep-subpath coupling is high-volatility regardless.
- Negative within #5: no `dsh-client-runtime` import (A1-25), no slot/chat selectors (API-10), no `tools.mode`/PTC-rename tokens (A1-06), no composer/`MarkdownText` surfaces (A1-28/A1-29) — checked and ruled out.

## #6 · Custom HTTP / WS / RPC / DOM / CSS channel — HIT

| File | Lines | Coupling point |
|---|---|---|
| `src/index.ts` | 4, 45–54 | `createServer` loopback HTTP bridge: `server.listen(43121, '127.0.0.1')`, serving `/api/legacy` with no authentication, no Host/Origin fence, no teardown hook. The function is never invoked (fixture is static-only), but the coupling shape is present. |

**Cards**: **A1-08** (security; #6): in alpha.1 the Web/API channels use process-scoped bootstrap tokens and signed cookies; a private channel that bypasses the Host Gateway authentication model is a security hole, and **"listening on loopback only" is not a reason to skip authentication**. Custom routes registered directly on the web server do not automatically inherit the Connection auth gate, Host/Origin fence, CORS, or TLS; handlers must call `ctx.connection.requestRejection(req)` first or move to a Connection-owned carrier. When preserving a channel protocol during migration, apply the auth gate without changing the wire protocol (precision-checklist discipline).

## #7 · Subprocess / stdout / stderr parsing — HIT (two sites)

| File | Lines | Coupling point |
|---|---|---|
| `scripts/apply-patch.mjs` | 3, 11–18 | `execFileSync('dsh', ['--profile', 'headless', 'ping'])`, then `JSON.parse` on **each line of stdout**, expecting `{type:'final', text}` JSONL. No exit-code handling (sync throw only), stderr ignored. |
| `src/index.ts` | 8, 56–66 | `spawn('dsh', ['--profile', 'headless', prompt])` with `JSON.parse` on stdout `'data'` chunks, resolving on `'close'`; never reads the exit code, never reads stderr, `JSON.parse` throws on plain-text chunks, and `'data'` chunk boundaries can split lines mid-token. |

**Cards**:
- **A1-05** (behavior; #7) + **API-06** (ledger): headless **stdout was already the final assistant text in rc.2 — it was never JSONL**, so the fixture's assumption is wrong on both corridor endpoints (a pre-existing bug, not an alpha regression). The actual alpha.1 delta: **stderr gains a `dsh: reasoning:` segment**; success must be judged by **exit code** (0 completed, 1 abort/error/no completed turn; SIGINT → 130), stdout treated as final text, stderr received as `dsh: reasoning:` / `dsh: <code>: <message>`. Both fixture sites violate the contract: `JSON.parse` on stdout, stderr ignored, exit code unused. API-06 also covers argv discipline (launcher flags before the task; use argv arrays — both sites already do) and concurrent stdout/stderr consumption.
- **A2-04** (conditional; #7): the alpha.2 fix for the empty `dsh web` client graph on Node 24.0–24.11.1 — **no hit**: the fixture contains no Node-version-forcing or `dsh web`-skipping workaround branches to remove. Recorded so the condition is not silently dropped if the real plugin's CI matrix has such branches.

---

## Summary table

| Touchpoint | Hit | File/line | Applicable card(s) | Confidence note |
|---|---:|---|---|---|
| #1 patch | yes | `patch.yml`:1–6; `scripts/apply-patch.mjs`:5–9; (`cordis.patch.yml`:2–6 = composition, API-08 negative control) | A1-03 | high — patch target is in the split session-view tree; exact-tag path re-check still required |
| #2 events | yes | `src/index.ts`:15–22 | **A2-01** (net state; folds A1-02 removal) + API-05 residual | high on the fold; producer seam (`ctx.emit`) is not the public append surface → capability-gap flag |
| #3 services/Remote | yes | `src/index.ts`:26–28, 29–32 | **A1-01** + **A2-02** | high — host-plane apiProxy; plane-discipline note applies |
| #4 filesystem | yes | `src/index.ts`:36–37 | **A1-04** | high — hard-coded `~/.dsh/profiles/default` |
| #5 UI/commands | yes | `src/index.ts`:10, 41–43 | **A1-03** (+ API-07) | high — `/internal` import + removed SessionView constructor |
| #6 custom channel | yes | `src/index.ts`:45–54 | **A1-08** | high on coupling shape; server never started in the static fixture, so runtime exposure is unproven |
| #7 subprocess/output | yes | `scripts/apply-patch.mjs`:11–18; `src/index.ts`:56–66 | **A1-05** + API-06; A2-04 conditional — no hit | high — wrong on both corridor endpoints (stdout was never JSONL) |

## No-hit categories and why that is not a clean bill

All seven classes hit in this fixture, so the honest "no-hit" accounting applies to the **surfaces checked and ruled out within and across classes**:

- Scanned: every file in the fixture (6/6 listed above), with class patterns and negative patterns (`WebSocket`, `MutationObserver`, `contenteditable`/`setSelectionRange` (A1-28 composer surface), `dsh-client-runtime` (A1-25), `ctx.settings` (A2-10), `userQuestions` (A1-20), `tasks.peek`, PTC/code-mode rename tokens (A1-06), `execa`/`Bun.spawn`, `cordis.yml`, `dsh-plugin.json`, `ctx.agent`). Zero matches for all of them.
- Ruled out: A1-06, A1-09/10/11 (capabilities), A1-20, A1-21, A1-22, A1-25, A1-26, A1-27, A1-28, A1-29, A1-30, A1-31, A1-32, A2-05, A2-06, A2-08, A2-10 as **source** hits.
- Why "no hit ≠ no problem":
  1. **Dependency/packaging layer is unscannable here**: `package.json` declares **no** dependencies, peerDependencies, devDependencies, engines, or `dsh.client` key, and there is **no lockfile**. Peer-floor pruning (**A2-03**) and peer additions (**A2-08**) cannot be evaluated without the real dependency declarations; the alpha.2 field notes show missing peers surface only as runtime `pending`, not as typecheck errors.
  2. **Line-level patterns cannot see data flow**: e.g. an indirect path construction or a dynamically composed event name would evade the regexes; #4 and #2 hits were confirmed only because the literals are inline.
  3. **Cards are curated, not a complete API diff**: corridor edges or API coordinates missing from the card set are "unsupported/pending", not "safe".
  4. **No build/mount was run** (by design — the fixture is intentionally uncompilable): static zero-hit still requires build + typecheck (`skipLibCheck: false` diagnostic for declaration drift, A2-03 field note), a real profile cold boot (`--dump-config` pending check), and one functional path before compatibility is claimed.

## Must verify (when this becomes a real migration)

1. Build/typecheck with declaration-owner diagnosis; 2. `dsh --profile <p> --dump-config` for pending rows; 3. patch-surface re-check of `src/session/view/SessionView.ts` against the alpha.2 tag (A1-03) — "pending confirmation" if no owning module exists; 4. real-host probe of each migrated Remote call (success / one business failure / cancellation) per A1-01/A2-02; 5. headless wrapper matrix per API-06 (plain success, reasoning present, failure, spawn error); 6. auth-gate proof for any retained custom channel per A1-08 (403 wrong Host/Origin, 401 missing cookie).
