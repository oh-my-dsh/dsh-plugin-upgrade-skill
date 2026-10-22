# S1 · Static Touchpoint Scan Report — legacy-plugin
## Corridor: dsh 0.1.1-rc.2 → 0.1.2-alpha.2 (read-only inspection, no migration executed)

- Fixture scanned: `/app/fixture/` (cell-local: `...\\noskill\\S1-static-scan\\fixture\\`)
- Output: `/app/agent-output/S1-static-scan/touchpoint-scan-report.md`
- Date: 2026-10-20 · Arm: noskill (skill card register not readable in this arm — see §3.0 for the ID caveat)

---

## 0. Scope, method, and read-only discipline

**Method.** (1) Full-text read of every file in the fixture (6 files, ~120 lines total — 100% line coverage, no file skipped); (2) a systematic token sweep for coupling-bearing constructs (`ctx.get/emit/on/register`, `contributes`, `apiProxy`, `invoke(`, `homedir`, `.dsh/profiles`, `/internal`, `createServer/listen`, `spawn/execFileSync`, `JSON.parse`, `--profile headless`, `patch`, `DSH_HARNESS_SOURCE_ROOT`, `ignorable`, `session/event`, imports) to catch anything the narrative read could miss; (3) per-category adjudication against the seven touchpoint definitions. **Nothing in the fixture was executed** (no `apply-patch`, no `dsh` invocation), no migration or installation was run, no git operations, no network access.

**Read-only compliance.** SHA-256 of all six fixture files was verified against `fixture-hash-before.json` **before and after** the analysis: 6/6 MATCH, 0 differences, 0 failures. No file under `fixture/` was created, modified, or deleted; all artifacts of this task were written only under `agent-output/`.

**Files in scope (complete inventory):**

| File | Bytes | Role |
|---|---|---|
| `README.md` | 1364 | Fixture documentation (orientation only; its hit table agrees with this independent scan) |
| `package.json` | 161 | Plugin manifest (name `legacy-plugin`, version `0.1.1`, script wiring) |
| `cordis.patch.yml` | 159 | Cordis profile composition incl. `patch:` declaration |
| `patch.yml` | 214 | Source patch surface (target file + find/replace) |
| `scripts/apply-patch.mjs` | 752 | Patch applier + headless `dsh` subprocess check |
| `src/index.ts` | 2562 | Plugin entry (`activate(ctx)`) — bulk of runtime coupling |

---

## 1. Hit summary — all seven categories HIT

| # | Touchpoint category | Hit? | Hit locations (file:lines) | Corridor card (content → best-effort ID, see §3.0) |
|---|---|---|---|---|
| 1 | Source patch | **YES** | `cordis.patch.yml:2-6`; `patch.yml:2-6`; `scripts/apply-patch.mjs:5-9`; `package.json:7` | Source-patch surface mechanism removed/unsupported + patch target invalidated by UI decomposition → A1-group (presumed A1-07 / A1-01 family) |
| 2 | Internal/persistent events | **YES** | `src/index.ts:13-19` (producer), `src/index.ts:20-22` (consumer) | `SessionEvent.ignorable` removed in 0.1.2-alpha.1 → **A1 card**; producer/persistence contract restored in 0.1.2-alpha.2 → **A2 card**; folded net state = field KEPT (§2.2) |
| 3 | Internal service / Remote | **YES** | `src/index.ts:24-28`, `src/index.ts:29-32` | Legacy internal `apiProxy` service removed, replaced by public typed services/Remote → A1-group (presumed A1-02) |
| 4 | Host directory | **YES** | `src/index.ts:34-38` | Host profile-directory layout governed/relocated; hard-coded `~/.dsh/profiles/default` forbidden → A1-group (presumed A1-04) |
| 5 | Internal UI / commands / tools | **YES** | `src/index.ts:9-10` (import), `src/index.ts:40-43` (command) | UI decomposition removed private Host/Web-Client paths (`@deepseek-ai/dsh-session-view/internal`); command registration surface changed → A1-group (presumed A1-01) |
| 6 | Custom channel | **YES** | `src/index.ts:45-54` (bridge), `src/index.ts:54` (dead-code marker) | Host Gateway is the sanctioned channel/auth model; private loopback HTTP channels unsupported → A1-group (presumed A1-05) |
| 7 | Subprocess / output parsing | **YES** | `src/index.ts:56-67`; `scripts/apply-patch.mjs:11-19` | Headless `dsh` stdout contract = final plain text, not JSONL → A1-group (presumed A1-06) |

No category is empty, so requirement 3's per-empty-category statement does not trigger; the full coverage/ruling-out record and the "no hit ≠ no problem" reasoning are nevertheless documented in §4.

---

## 2. Per-category detail

### 2.1 Touchpoint #1 — Source patch — HIT

**Hit files/lines**
- `cordis.patch.yml:2-6` — cordis profile entry `id/name: legacy-plugin` with `config: {}` and `patch: [patch.yml]`: the plugin's profile composition **declares a source-patch surface applied to the Host itself**.
- `patch.yml:2-6` — `surface:` entry targeting Host-internal source file `src/session/view/SessionView.ts`, textual replacement `export function renderSessionView` → `export function renderSessionViewPatched`.
- `scripts/apply-patch.mjs:5-9` — requires env `DSH_HARNESS_SOURCE_ROOT` (Host source-tree location contract) and reads `patch.yml` as the surface to apply.
- `package.json:7` — `"apply-patch": "node scripts/apply-patch.mjs"` wires the mechanism into the package scripts.

**Concrete coupling points**
1. The **source-patch mechanism itself**: cordis profile `patch:` field + the `DSH_HARNESS_SOURCE_ROOT` env contract + a script that mutates the Host source tree. This is the deepest form of coupling — the plugin does not consume the Host API, it rewrites Host internals.
2. The **patch target coordinates**: file path `src/session/view/SessionView.ts` and exported symbol `renderSessionView`. Both live in the Host session-view UI region that the corridor's **UI decomposition** restructured (the same change family as #5). In the target version the file path and/or symbol may not exist → the patch fails to apply, or worse, silently matches nothing.
3. The **patch semantics**: renaming a Host export (`renderSessionViewPatched`) breaks every Host caller of the original symbol even when the patch applies cleanly — it is a standing incompatibility with any Host-internal consumer, independent of the corridor.

**Card mapping** — A1-group card "source-patch surface removed / unsupported for plugins" (presumed **A1-07**; the `patch:` + `DSH_HARNESS_SOURCE_ROOT` mechanism) **plus** the UI-decomposition card (presumed **A1-01**, shared with #5) which independently invalidates the concrete target path/symbol. No alpha.2 restoration of the patch surface is evidenced anywhere in the fixture, so the net state at 0.1.2-alpha.2 is: **mechanism gone and target gone — the collision stands at the target version**. Migration consequence: abandon source patching entirely; the behavior the patch produced must be re-expressed through supported extension points (or dropped).

### 2.2 Touchpoint #2 — Internal/persistent events — HIT (corridor folding applies)

**Hit files/lines**
- `src/index.ts:13-19` — `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })`: the plugin is a **producer of an external informational durable SessionEvent** and sets the `ignorable` marker.
- `src/index.ts:20-22` — `ctx.on('session/event', (event) => ... event.type ...)`: a **consumer** of the same event stream, coupled to SessionEvent shape/delivery.
- Fixture annotation pinning the corridor versions: `src/index.ts:13-14` — "alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract."

**Concrete coupling points**
1. The `ignorable: true` field on an emitted SessionEvent.
2. A custom external event-type namespace `legacy/informational-note` flowing through the durable `session/event` channel (producer-side registration/persistence semantics).
3. Consumer-side assumption that `session/event` delivers typed SessionEvent objects with a `.type` discriminator.

**Card mapping and corridor folding (required by the brief)**
- **A1 card** (0.1.2-alpha.1): removal of the `SessionEvent.ignorable` marker — version pinned by the fixture annotation.
- **A2 card** (0.1.2-alpha.2): restoration of the ignorable producer/persistence contract for external informational events.
- **Folding rule**: when a field is removed in an intermediate corridor version and restored in the target version, the migration is adjudicated by the **final net state**, i.e. the two cards compose to "field present at 0.1.2-alpha.2 under the restored (and possibly tightened) contract". The A1 removal card is *superseded*, not additive.
- **How #2 maps under folding**: for a single-hop 0.1.1-rc.2 → 0.1.2-alpha.2 upgrade, the correct action is **do NOT strip `ignorable`** (applying the A1 card literally would be wrong churn — you would delete the field and then have to re-add it). Keep `ignorable: true`; instead verify conformance to the **A2 restored contract**: the event must genuinely be informational (it is: `legacy/informational-note`), and the producer/persistence semantics for external informational events (registration of the custom type, whether/how it is persisted and replayed) must match what the A2 card restored.
- **Residual risk to note**: the folding is a no-op **only at the target**. If the plugin were ever shipped against 0.1.2-alpha.1 (intermediate stop), #2 would be a live breaking collision there. Folded ≠ irrelevant; it means "review against the restoring card, not the removing card."

### 2.3 Touchpoint #3 — Internal service / Remote — HIT

**Hit files/lines**
- `src/index.ts:24-28` — `ctx.register('rename-session', ...)` resolves `await ctx.get('apiProxy')` and calls `apiProxy.invoke('session.rename', { id, title })`.
- `src/index.ts:29-32` — `ctx.register('list-providers', ...)` resolves `ctx.get('apiProxy')` and calls `apiProxy.invoke('llm.providers')`.
- Fixture annotation: `src/index.ts:24` "Legacy Host APIProxy calls."

**Concrete coupling points**
1. **Private Host service name** `apiProxy` resolved through string-keyed service location (`ctx.get('apiProxy')`) — an internal, untyped Host service, not a published plugin-facing API.
2. **String RPC method names** `session.rename` and `llm.providers` passed to `invoke()` — invisible to type checking, so a rename/removal in the corridor surfaces only at runtime.
3. The untyped `invoke` envelope (promise + plain-object args/results) as the calling convention.

**Card mapping** — A1-group card "legacy internal APIProxy removed; plugin↔Host calls move to the public typed service / Remote interfaces" (presumed **A1-02**). Collision at target: `ctx.get('apiProxy')` no longer resolves (throws / returns nothing); both call sites break at runtime, and both method-name strings must be re-mapped to the successor public service methods (session rename; LLM provider listing). This is a runtime-only failure mode — the code still compiles — which makes it a high-priority migration item despite looking innocuous.

### 2.4 Touchpoint #4 — Host directory — HIT

**Hit files/lines**
- `src/index.ts:34-38` — `const profileDir = join(homedir(), '.dsh', 'profiles', 'default')` then `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`.
- Fixture annotation: `src/index.ts:34` "Hard-coded Host/profile path."

**Concrete coupling points**
1. **Hard-coded Host layout** `~/.dsh/profiles/default` — assumes the on-disk profile directory scheme (root `.dsh`, `profiles` subdirectory, a profile literally named `default`) is stable across versions.
2. **Writing plugin data into a Host-managed directory** — the plugin stores its own state (`legacy-note.txt`) inside the Host profile tree rather than a plugin-designated location.
3. Implicit assumption that the *current* profile is `default` (ignores multi-profile / non-default active profile).

**Card mapping** — A1-group card "Host directory/profile layout governance: no hard-coded Host paths; profile and state directories relocated or abstracted behind Host-provided path APIs" (presumed **A1-04**). Collision at target: the hard-coded path may not exist or may point at the wrong location → `writeFileSync` throws (missing directory) or silently pollutes a stale location; even where the path survives, writing into Host-managed space conflicts with the target's directory governance. Migration: obtain directories from the Host-provided path API and store plugin data in the plugin-designated location. *Secondary host-path coupling*: `DSH_HARNESS_SOURCE_ROOT` in `scripts/apply-patch.mjs:5` is also a Host-filesystem contract, but it is adjudicated under #1 (its purpose is the patch mechanism), not here.

### 2.5 Touchpoint #5 — Internal UI / commands / tools — HIT

**Hit files/lines**
- `src/index.ts:9-10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`; fixture annotation at line 9: "private Host/Web Client path removed by UI decomposition."
- `src/index.ts:40-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`.

**Concrete coupling points**
1. **Private deep import** `@deepseek-ai/dsh-session-view/internal` — a non-public package entry point into Host/Web-Client internals.
2. **Direct instantiation of a Host UI class** (`new SessionView({ enhanced: true })`) including a private options shape (`enhanced`) — the plugin constructs Host UI objects instead of requesting them through a public contribution.
3. **Internal command-registration surface** `ctx.contributes.registerCommand(...)` returning a raw view instance — the command contribution API contract itself.
4. **Packaging inconsistency (static-copy artifact)**: `package.json` declares **no dependencies at all**, yet `src/index.ts` imports `@deepseek-ai/dsh-session-view/internal` — the import is unresolvable as declared (fixture README: "that it cannot be compiled is by design"). Recorded as evidence of the private-path coupling, not as an extra touchpoint.

**Card mapping** — the **UI decomposition card**: "private Host/Web-Client paths removed; session-view internals decomposed; `/internal` entry points gone; command contributions move to the public API" (presumed **A1-01**; the fixture pins the change but not its version step — see §3.0). Collision at target: **build-time** failure first (module `@deepseek-ai/dsh-session-view/internal` does not resolve), then API failure (`SessionView` moved/split/renamed; `registerCommand` surface changed). Cross-link: the same decomposition is what invalidates #1's patch target `src/session/view/SessionView.ts` — one corridor change collides with this plugin through two touchpoints.

### 2.6 Touchpoint #6 — Custom channel — HIT

**Hit files/lines**
- `src/index.ts:45-53` — `function startLegacyBridge()`: raw `createServer(...)` from `node:http`, `server.listen(43121, '127.0.0.1')`, route `/api/legacy` (comment at line 51), responding `'legacy'` with no authentication.
- `src/index.ts:54` — `void startLegacyBridge`: the bridge is **defined but never invoked** (dead code in the static copy).
- Fixture annotation: `src/index.ts:45` — "Private loopback HTTP bridge that bypasses the Host Gateway authentication model."

**Concrete coupling points**
1. A **self-hosted loopback HTTP channel** (fixed port 43121, fixed route `/api/legacy`) used as a private IPC/extension channel instead of the Host-sanctioned channel mechanism.
2. **Bypass of the Host Gateway authentication model** — the endpoint is unauthenticated and reachable by any local process.
3. **Fixed-port assumption** — collision-prone and outside any Host port allocation.

**Card mapping** — A1-group card "Host Gateway is the sanctioned channel mechanism / Gateway authentication model; custom loopback channels bypassing the Gateway are unsupported" (presumed **A1-05**). Collision at target: even though the function is currently never called, the coupling **is statically present** and a touchpoint scan counts code presence, not liveness — if wired up post-migration it would open an unauthenticated local endpoint in violation of the Gateway model. Migration: delete the bridge or re-implement the capability as a Gateway-sanctioned channel.

### 2.7 Touchpoint #7 — Subprocess / output parsing — HIT (two sites)

**Hit files/lines**
- `src/index.ts:56-67` — `ctx.register('headless-ask', ...)`: `spawn('dsh', ['--profile', 'headless', prompt])`; parses each stdout **chunk** with `JSON.parse(line.toString())` and expects `{ type: 'final', text }`. Annotation line 56: "Deliberately wrong wrapper assumption: treats headless stdout as JSONL."
- `scripts/apply-patch.mjs:11-19` — `execFileSync('dsh', ['--profile', 'headless', 'ping'])`, splits stdout into lines, `JSON.parse(line)` per line, expects `event.type === 'final'` → `event.text`. Annotation line 11: "Deliberately wrong expectation: target headless stdout is final text, not JSONL."

**Concrete coupling points**
1. **CLI invocation form**: binary `dsh`, flags `--profile headless`, positional argument (`prompt` / `ping`) — coupled to the headless wrapper's argument contract.
2. **Stdout output-format assumption**: both sites assume a JSONL event stream with a terminal `{type:'final', text}` event. In the target version, headless stdout is the **final plain text** — every `JSON.parse` throws `SyntaxError` (`apply-patch.mjs` fails on the first non-empty line; `index.ts` fails per data chunk).
3. **Latent framing bug** (pre-existing, worth noting for the rewrite): `index.ts` parses raw `data` chunks as if chunk boundaries were line boundaries — broken even under a true JSONL contract; the migration rewrite should consume the plain-text contract (collect stdout, use as final text) or an explicitly documented structured-output flag if the target provides one.

**Card mapping** — A1-group card "headless profile stdout contract: final text, not JSONL" (presumed **A1-06**; the change is fixture-attested at both sites but its version step is not pinned — see §3.0). Collision at target: guaranteed runtime failure of both call sites the first time they run.

---

## 3. Card-mapping summary and ID caveat

### 3.0 ID scheme caveat (noskill arm)

The canonical card register (skill references) is **out of readable scope in this arm**, so registry numbers could not be verified. IDs below follow the brief's `A1-01`-style scheme: prefix = corridor step (**A1 = 0.1.2-alpha.1**, **A2 = 0.1.2-alpha.2**), number = position within the register. Only #2's step attribution is **fixture-pinned** (`src/index.ts:13-14`); the other cards are attributed to the A1 group by inference (the fixture describes them as accomplished removals/changes, and the only alpha.2 annotation is the #2 restoration). **The semantic mapping (change content ↔ coupling point) is authoritative**; if the canonical register numbers differently, the mappings below carry over 1:1 by card content.

### 3.1 Summary table

| # | Card content (semantic mapping) | Corridor step | Best-effort ID | Net state at 0.1.2-alpha.2 | Migration consequence |
|---|---|---|---|---|---|
| 1 | Source-patch surface (`patch:` + `DSH_HARNESS_SOURCE_ROOT`) removed/unsupported | alpha.1 (inferred) | A1-07 (presumed) | Gone — no restoration evidenced | Abandon source patching; re-express via supported extension points |
| 1/5 | UI decomposition removes private session-view paths/symbols | alpha.1 (inferred) | A1-01 (presumed) | Gone | Patch target invalid AND `/internal` import unresolvable |
| 2 | `SessionEvent.ignorable` removed | **alpha.1 (pinned)** | **A1 card** | **Superseded by A2** | Do NOT strip the field |
| 2 | ignorable producer/persistence contract restored | **alpha.2 (pinned)** | **A2 card** | Field KEPT under restored contract | Keep `ignorable: true`; verify informational-type + persistence conformance |
| 3 | Internal `apiProxy` service removed → public typed services/Remote | alpha.1 (inferred) | A1-02 (presumed) | Gone | Re-map `session.rename` / `llm.providers` to successor public service methods |
| 4 | Host profile-directory layout governed/relocated; no hard-coded Host paths | alpha.1 (inferred) | A1-04 (presumed) | Changed | Use Host-provided path APIs; move plugin data out of the profile tree |
| 5 | Private Host/Web-Client UI paths removed; command registration moves to public API | alpha.1 (inferred) | A1-01 (presumed) | Gone | Replace `/internal` import + `registerCommand`+raw-view pattern |
| 6 | Host Gateway = sanctioned channel/auth model; custom loopback channels unsupported | alpha.1 (inferred) | A1-05 (presumed) | Enforced | Delete or re-channel the loopback bridge (dead code today) |
| 7 | Headless stdout = final plain text, not JSONL | alpha.1 (inferred) | A1-06 (presumed) | Changed | Rewrite both parse sites to the plain-text contract |

**Corridor folding, restated as a rule:** evaluate the net composition of all cards from 0.1.1-rc.2 to 0.1.2-alpha.2, not each card in sequence. A remove→restore pair (here: `ignorable`, A1 remove + A2 restore) folds to the target's final state — "kept, under the restoring card's contract" — so the removing card generates **no code change**, only a contract-conformance review against the restoring card. Folding is target-specific: the same code would genuinely collide at 0.1.2-alpha.1.

---

## 4. Coverage, ruling-out record, and why "no hit ≠ no problem"

**All seven categories hit**, so no empty-category statement is required; the coverage record is given in full anyway.

**Scanned (100% of the fixture):** `README.md` (16 lines), `package.json` (9), `cordis.patch.yml` (6), `patch.yml` (6), `scripts/apply-patch.mjs` (19), `src/index.ts` (68) — every line read, plus the §0 token sweep; sweep output contained no coupling outside what §2 reports.

**Considered and ruled out (near-misses / classification decisions):**
- `README.md` — documentation only, no executable coupling; used solely as orientation (its hit table matches this scan).
- `package.json` — counted under #1 only for the `apply-patch` script wiring; the name/version fields are era markers, not a touchpoint. `config: {}` in `cordis.patch.yml` is empty → no plugin-config-schema coupling detectable (but emptiness is not evidence of target-version compatibility — a new mandatory manifest field would not show up here).
- `void startLegacyBridge` (`index.ts:54`) — liveness suppression; still ruled **IN** as a #6 hit because static presence of the coupling is what a pre-migration scan must report.
- `ctx.on('session/event')` consumer (`index.ts:20-22`) — ruled into #2 (same event contract), not a separate category.
- `DSH_HARNESS_SOURCE_ROOT` (`apply-patch.mjs:5`) — a Host env/path contract, ruled into #1 (its purpose), not #4.
- `node:` builtin imports (`fs/http/os/path/child_process`) — platform APIs, not dsh couplings per se; they matter only where they implement a touchpoint (#4 write, #6 server, #7 spawn).

**Why "no hit = no problem" cannot be directly concluded (applies to every category, and would apply verbatim to any empty one):**
1. **String-built dynamic coupling.** This codebase demonstrably builds couplings as runtime strings (`ctx.get('apiProxy')`, `invoke('session.rename')`, event type `legacy/informational-note`). A static scan can enumerate the strings it sees, but any lookup assembled via indirection (variables, templates, config) is invisible to token sweeps — absence of a hit is absence of *evidence*, not evidence of absence.
2. **Partial copy / transitive surface.** The fixture is a deliberately partial static copy (README: non-compilable by design; e.g. the imported package is not even declared in `package.json`). Build configs, lockfiles, tsconfig path aliases, CI, and transitive dependencies — all classic corridor-collision carriers — are outside the copy, so a category could hit in the real project while showing no hit here.
3. **Contract-level collisions are not textually local.** Event persistence semantics (#2's restored A2 contract), Gateway auth enforcement (#6), and headless output framing (#7) are behavioral contracts of the target version; conformance can only be *confirmed* at runtime against 0.1.2-alpha.2 — which this brief forbids (no execution/migration), so even full-hit categories carry residual uncertainty about exact post-migration behavior.
4. **Folding cuts both ways.** A net no-op at the target (like #2's kept field) can be a live break at an intermediate stop (alpha.1), and a category with zero textual hits could still collide through a removed capability the plugin's *users* depend on. Static hit-lists must therefore be re-adjudicated per corridor step, not just endpoint-to-endpoint.

---

## 5. Bottom line

The fixture hits **7/7** touchpoint categories. Highest-severity collisions at 0.1.2-alpha.2: **#1** (patch mechanism and target both gone), **#5** (build-breaking private import + command API change), **#3** (runtime-only apiProxy failure), **#7** (guaranteed parse failure at two call sites). **#4** is a layout/governance collision; **#6** is a present-but-dormant policy collision (dead code). **#2** is the corridor-folding case: A1-removal superseded by A2-restoration → keep `ignorable: true`, review against the restored producer/persistence contract, and do not apply the intermediate removal. Read-only discipline: fixture hashes verified identical before and after the scan (6/6), nothing executed, nothing written outside `agent-output/`.
