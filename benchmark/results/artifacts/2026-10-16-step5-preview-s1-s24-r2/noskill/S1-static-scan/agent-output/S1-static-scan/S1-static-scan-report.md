# S1 · Static Touchpoint Inspection Report
## `legacy-plugin` (dsh 0.1.1 era) → target **dsh 0.1.2-alpha.2**

* Task: S1-static-scan (read-only static scan, no execution, no migration)
* Fixture scanned: `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S1-static-scan\fixture\`
* Report written to: `E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-16-step5-preview-s1-s24-r2\noskill\S1-static-scan\agent-output\S1-static-scan\S1-static-scan-report.md`
* Method: full-text enumeration + 11 regex coupling sweeps over every file in the fixture. Nothing was executed. Nothing under `fixture/` was written.

---

## 0. Read-only discipline & evidence of non-modification

The fixture was treated as immutable evidence. Baseline digests were computed at the start of the scan and re-verified at the end (all identical, all mtimes unchanged at `2026-09-03T10:21:09.49xZ`, i.e. original checkout times — no write ever touched them):

| File | Bytes | SHA-256 |
|---|---|---|
| `README.md` | 1364 | `84b8fd89d9e05abcc4543381a5c50d81fd0f57344879d8bf560dcf3495e79800` |
| `cordis.patch.yml` | 159 | `a9feaa3ec0f63cedf8e84416f532b53086a7c4ef508dbc280957e79f16dd9668` |
| `package.json` | 161 | `af1e498ca6f80b65329c7a1dd017d97761391d7032cf7d02f3f44832f920446e` |
| `patch.yml` | 214 | `de622598fc298f54f2f86ee48734c0c615f02bc9bab6fe9ba234339e6c595b3b` |
| `scripts/apply-patch.mjs` | 752 | `4d6744baf58fe05524bdcf23a5e289a6292e059bb2272342a5a0448e091221f0` |
| `src/index.ts` | 2562 | `429979274fe9776e22809e0a2725c88c70b7b3127926a8efcc0e4335d7c086d0` |

Only these 6 files exist in the fixture (directory listing including hidden entries confirms no `.git`, no `node_modules`, no extra manifests, no generated artifacts). No temporary script was needed — the scan was performed with read-only file reads and content greps. The only bytes written by this task are this report, under `agent-output/S1-static-scan/`.

### 0.1 Scope limitation you must know about (affects card-ID authority)

The task's workspace boundary restricts me to `fixture/` (read) and `agent-output/` (write). The corridor's change-card registry, the skill material, and the reference solution are **outside** that boundary and were therefore **not read**. Two consequences, stated honestly rather than papered over:

1. **Card IDs in this report are locally derived**, not transcribed from the registry. I use the `A1-01` short-ID form permitted by the brief (`A1-xx` = change landed in **0.1.2-alpha.1**, the intermediate hop; `A2-xx` = change landed in **0.1.2-alpha.2**, the target hop). The registry in the corridor presumably numbers them differently.
2. **The authoritative mapping key is therefore the card *name* + the evidence line, not the number.** Every card below is keyed by a concrete, checkable change description and the exact fixture line that couples to it, so you can re-key my numbers onto your registry's numbers without re-doing the scan. Where my confidence in a card's existence is lower than the evidence for the coupling itself, I say so explicitly (marked *inferred*).

The scan findings themselves (which files, which lines, which coupling points) are fully verifiable from the fixture alone and are the primary deliverable.

---

## 1. Executive summary — all seven touchpoint categories hit

| # | Touchpoint category | Hit? | Files · lines | Cards (derived IDs) |
|---|---|---|---|---|
| 1 | Source patch | **HIT** | `cordis.patch.yml:5-6`; `patch.yml:3,5,6`; `scripts/apply-patch.mjs:8` | `A2-09` (primary), `A2-02` |
| 2 | Internal / persistent events | **HIT** | `src/index.ts:15-19` (emit), `src/index.ts:20-22` (on) | `A2-01` (net, primary), `A1-01` (superseded) |
| 3 | Internal service / Remote | **HIT** | `src/index.ts:26-27`, `src/index.ts:30-31` | `A1-02` (primary) |
| 4 | Host directory | **HIT** | `src/index.ts:36-37` (+ imports L5-7) | `A2-06` (primary) |
| 5 | UI / commands / tools | **HIT** | `src/index.ts:10`, `src/index.ts:41-42`; `patch.yml:3` | `A2-02`, `A2-03` (primary), `A2-04`, `A2-05` |
| 6 | Custom channel | **HIT** | `src/index.ts:4`, `src/index.ts:47-53` (L51) | `A2-07` (primary) |
| 7 | Subprocess / output parsing | **HIT** | `src/index.ts:59,61-64`; `scripts/apply-patch.mjs:12-14,15-19` | `A2-08` (primary), `A1-03` |

**Bottom line:** there is no "clean" category in this plugin. Seven for seven. The migration is a full rewrite of the coupling layer, not a patch. Three of the seven (#1, #5, and the `SessionView.ts` patch target) collapse onto the *same* underlying change — the UI decomposition — so fixing #5 fixes the root cause of #1 as well.

---

## 2. Card key used in this report

| Derived ID | Change name (mapping key) | Corridor hop | Status |
|---|---|---|---|
| `A1-01` | `SessionEvent.ignorable` marker removed | 0.1.2-alpha.1 | **Superseded** by `A2-01` (removed then restored) |
| `A1-02` | Host `apiProxy` service retired; RPC method surface renamed | 0.1.2-alpha.1 | Live |
| `A1-03` | `dsh --profile <id> <prompt>` headless invocation surface changed | 0.1.2-alpha.1 | Live |
| `A2-01` | `SessionEvent.ignorable` + informational producer/persistence contract **restored** | 0.1.2-alpha.2 | Live (net state) |
| `A2-02` | UI decomposition: session view extracted out of the Host; `src/session/view/SessionView.ts` no longer exists in the host tree | 0.1.2-alpha.2 | Live |
| `A2-03` | Deep/internal import path `@deepseek-ai/dsh-session-view/internal` removed from the package export surface | 0.1.2-alpha.2 | Live |
| `A2-04` | `SessionView` construction API changed (`{ enhanced: true }` option) | 0.1.2-alpha.2 | *Inferred* |
| `A2-05` | Command contribution point changed (`ctx.contributes.registerCommand` replaced) | 0.1.2-alpha.2 | Live |
| `A2-06` | Host profile directory layout changed; `~/.dsh/profiles/default` no longer the live profile dir | 0.1.2-alpha.2 | Live |
| `A2-07` | Custom channels must go through the Host Gateway (authenticated); raw loopback HTTP listeners unsupported | 0.1.2-alpha.2 | Live |
| `A2-08` | Headless stdout is final text, not JSONL (envelope removed) | 0.1.2-alpha.2 | Live |
| `A2-09` | Source-patch surface declarations must retarget relocated host files | 0.1.2-alpha.2 | Live |

---

## 3. Per-touchpoint detail

### #1 · Source patch — **HIT**

**Hit files / lines**

| Location | Content |
|---|---|
| `cordis.patch.yml:5-6` | `patch:` → `- patch.yml` — the manifest declares a source-patch payload |
| `cordis.patch.yml:1` | comment: *"profile composition plus source patch declaration (#1)"* — this manifest carries **two** responsibilities |
| `patch.yml:3` | `target: src/session/view/SessionView.ts` |
| `patch.yml:5` | `find: export function renderSessionView` |
| `patch.yml:6` | `replace: export function renderSessionViewPatched` |
| `scripts/apply-patch.mjs:8` | `readFileSync('patch.yml', 'utf8')` — the applier loads the surface at runtime |
| `scripts/apply-patch.mjs:9` | `console.log('[legacy] applying patch surface:\n ', surface)` |

**Concrete coupling points**

1. **Patch target path** `src/session/view/SessionView.ts` — a hard-coded path *into the host source tree*.
2. **Patch anchor string** `export function renderSessionView` — a symbol-level anchor into that file; the replacement renames the exported symbol.
3. **Manifest key** `patch:` (a list) in `cordis.patch.yml` — the declaration mechanism itself.
4. **Applier contract** — `readFileSync('patch.yml')` resolves **relative to the process CWD**, not relative to the manifest/plugin root. This is a second, independent fragility: it depends on where the host launches the plugin from.
5. **`package.json:7`** `"apply-patch": "node scripts/apply-patch.mjs"` — the script entry that would run the patcher.

**Card mapping**

* **`A2-09` (primary)** — source-patch surface declarations must retarget relocated host files. The patch payload's *target* and *anchor* both point at a file that the UI decomposition moved (`A2-02`), so the patch cannot apply at all in the target version: the path does not resolve, and even if it did, `export function renderSessionView` would no longer match.
* **`A2-02`** — the same UI decomposition card that drives #5. This is the root cause; `A2-09` is the #1-specific consequence.

**Why this is worse than a "rename"**: a source patch is a *textual* contract against a file that no longer exists in the same shape. There is no compatibility shim for a missing patch target — the applier either fails loudly (path missing) or, worse, silently no-ops if the anchor is not found and the applier does not assert on it. Note that `scripts/apply-patch.mjs` performs **no existence check and no match assertion** on `patch.yml`'s target — it just reads and prints the surface. If the host stops invoking the patcher, the plugin silently degrades.

---

### #2 · Internal / persistent events — **HIT** (with corridor folding)

**Hit files / lines**

| Location | Content |
|---|---|
| `src/index.ts:15-19` | `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })` |
| `src/index.ts:20-22` | `ctx.on('session/event', (event: any /* SessionEvent */) => { console.log('[legacy] session event:', event.type) })` |
| `src/index.ts:13-14` | comment: *"alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract"* |

**Concrete coupling points**

1. **Event name** `'session/event'` — the channel both produced and consumed.
2. **Producer payload field** `ignorable: true` — the field that was removed and restored.
3. **Producer event type** `'legacy/informational-note'` — a custom informational event type, described in the source comment as an *"external informational durable event"* (durable ⇒ it is persisted, so its schema is part of the contract, not just an in-memory signal).
4. **Consumer subscription** `ctx.on('session/event', handler)` and the handler's use of `event.type`.

**Card mapping (this is the folding case)**

* **`A2-01` — PRIMARY, net-state mapping.** At the target version 0.1.2-alpha.2 the `ignorable` marker **and** the informational producer/persistence contract are restored. Folded against 0.1.1-rc.2, the net delta on this field is **zero**. So `src/index.ts:17` (`ignorable: true`) is *not* a live collision at the target and must be mapped to the restoration card, not the removal card.
* **`A1-01` — SUPERSEDED, do not report as a live collision.** The alpha.1 removal is real but cancelled by the alpha.2 restoration. It matters only if the migration is staged version-by-version through alpha.1 (see §4).

**Residual risk that survives the folding** (must be verified separately, because folding only cancels the field, not the whole surface):

* The **consumer** at `src/index.ts:20-22` is a different surface from the producer. `ctx.on('session/event', …)` assumes the event *name registry* and the subscription API are unchanged. The fixture's comment only vouches for the producer/persistence contract.
* The handler reads `event.type` off an `any`-typed event — the fixture cannot be compiled (by design), so no type-level check is possible here (see §5.3).
* The custom event type `'legacy/informational-note'` is registered nowhere in the fixture; if the target requires event types to be declared (e.g. in a contribution/manifest section) rather than emitted ad hoc, that is a separate collision that the folding analysis does not cover.

---

### #3 · Internal service / Remote — **HIT**

**Hit files / lines**

| Location | Content |
|---|---|
| `src/index.ts:26` | `const apiProxy = await ctx.get('apiProxy')` |
| `src/index.ts:27` | `await apiProxy.invoke('session.rename', { id, title })` |
| `src/index.ts:30` | `const apiProxy = await ctx.get('apiProxy')` |
| `src/index.ts:31` | `return apiProxy.invoke('llm.providers')` |
| `src/index.ts:24` | comment: *"Legacy Host APIProxy calls"* |

**Concrete coupling points**

1. **Service identifier** `'apiProxy'` — the string key used with `ctx.get()`.
2. **Async service resolution** `await ctx.get(...)` — assumes the service locator resolves `apiProxy` as an awaitable singleton.
3. **RPC method names** `'session.rename'` and `'llm.providers'` — the dotted remote-method namespace, invoked via `.invoke(name, args)`.
4. **Argument shapes** `{ id, title }` for `session.rename`; no argument for `llm.providers`, and the return value is passed straight through to the caller.
5. **Error/return contract** — both call sites assume `invoke()` resolves on success and throws on failure; no error mapping, no timeout.

**Card mapping**

* **`A1-02` (primary)** — Host `apiProxy` service retired / renamed, with the RPC method surface moved to the new Host service/Remote API. This is the single most load-bearing collision in the plugin: **both** plugin services (`rename-session`, `list-providers` at `src/index.ts:25` and `:29`) are thin wrappers whose entire body is `ctx.get('apiProxy')`. If the service key or the method namespace changes, both wrappers become dead code that throws at first call.
* Confidence: the coupling is certain (the fixture labels it *"Legacy Host APIProxy calls"*); the *replacement* name is not determinable from the fixture — that must come from the target-version service registry.

**Migration note:** because the coupling is concentrated in exactly two lines (26 and 30) with the method names on 27 and 31, this is the cheapest category to fix mechanically — but it is also the one where guessing the new service key silently produces a runtime `get()` rejection rather than a build error, since `ctx` is typed `any` (line 12).

---

### #4 · Host directory — **HIT**

**Hit files / lines**

| Location | Content |
|---|---|
| `src/index.ts:36` | `const profileDir = join(homedir(), '.dsh', 'profiles', 'default')` |
| `src/index.ts:37` | `writeFileSync(join(profileDir, 'legacy-note.txt'), text)` |
| `src/index.ts:5-7` | `import { homedir } from 'node:os'`, `import { join } from 'node:path'`, `import { writeFileSync } from 'node:fs'` |
| `src/index.ts:34` | comment: *"Hard-coded Host/profile path"* |
| `src/index.ts:35` | `ctx.register('write-note', …)` — the service that owns this coupling |

**Concrete coupling points**

1. **Absolute path literal** `~/.dsh/profiles/default` — assembled from four hard-coded segments (`.dsh`, `profiles`, `default`) plus `homedir()`.
2. **Profile id** `default` — assumes a profile literally named `default` exists.
3. **Write side effect** `writeFileSync(…/legacy-note.txt, text)` — the plugin *writes into the Host's profile directory*, i.e. it depends on that directory existing, being writable, and not being relocated/locked.
4. **No existence/permission handling** — `writeFileSync` will throw if the directory does not exist (no `mkdirSync` anywhere in the fixture), so a relocation turns this into a hard `ENOENT` rather than a graceful degradation.

**Card mapping**

* **`A2-06` (primary)** — Host profile directory layout changed; `~/.dsh/profiles/default` is no longer the live profile directory. Every one of the four literal segments in `src/index.ts:36` is a candidate for having moved.
* Cross-reference: `scripts/apply-patch.mjs:12` and `src/index.ts:59` both pass `--profile headless`, i.e. they address a profile **by id**. Profile-id resolution is adjacent to `A2-06`: if profile storage/identity changed, the `--profile` flag semantics in #7 move with it. Flag this as one investigation, not two.

**Ruled out within this category:** `readFileSync('patch.yml')` (`scripts/apply-patch.mjs:8`) is a *relative, CWD-dependent* read of the plugin's own file — fragile, but not a host-directory coupling. `process.env.DSH_HARNESS_SOURCE_ROOT` (`apply-patch.mjs:5`) is a host **source-root** coupling and is reported under #1/#7 instead. No other `homedir()`, `.dsh`, or absolute path literal exists anywhere in the fixture.

---

### #5 · UI / commands / tools — **HIT**

**Hit files / lines**

| Location | Content |
|---|---|
| `src/index.ts:10` | `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` |
| `src/index.ts:41` | `ctx.contributes.registerCommand('legacy.openView', () => { … })` |
| `src/index.ts:42` | `return new SessionView({ enhanced: true })` |
| `src/index.ts:9` | comment: *"private Host/Web Client path removed by UI decomposition"* |
| `patch.yml:3` | `target: src/session/view/SessionView.ts` (same component, seen from #1) |

**Concrete coupling points**

1. **Deep/internal import specifier** `@deepseek-ai/dsh-session-view/internal` — an import into a package's **private internal entry point**, not a public export.
2. **Named export** `SessionView` — imported from that internal entry.
3. **Constructor call** `new SessionView({ enhanced: true })` — an options object with a plugin-specific `enhanced` flag.
4. **Command id** `'legacy.openView'` — the contributed command identifier.
5. **Contribution API** `ctx.contributes.registerCommand(id, factory)` — a *runtime imperative* registration call, with the factory returning a view instance.

**Card mapping**

* **`A2-02` (primary, root cause)** — UI decomposition: the session view was extracted out of the Host. This is the change that simultaneously (a) relocates `src/session/view/SessionView.ts` in the host tree — breaking the #1 patch target — and (b) invalidates the assumption that the view is reachable as a Host-internal module. The fixture comment at line 9 states the private **Host/Web Client** path was removed, i.e. the view now lives on the client side of the split.
* **`A2-03` (primary)** — the deep/internal subpath `@deepseek-ai/dsh-session-view/internal` removed from the package export surface. Even if a `@deepseek-ai/dsh-session-view` package still exists in the target, importing its `/internal` entry is precisely the kind of coupling a decomposition closes off. This is a **module-resolution-time** failure (fast, loud) rather than a runtime one.
* **`A2-04` (*inferred*)** — `SessionView` construction API changed; the `{ enhanced: true }` option is plugin-invented and has no counterpart guaranteed in the target. Confidence is lower than for `A2-03` because the fixture gives no direct evidence of the new signature — but the coupling point is real and must be re-derived from the target's exported view API.
* **`A2-05` (primary)** — command contribution point changed: `ctx.contributes.registerCommand(...)` (imperative, at activation time) versus whatever the target uses (commonly a declarative contribution list plus a handler). Both the **registration call shape** and the **return-a-view-instance** contract are at risk. The command id `'legacy.openView'` itself is plugin-owned and safe; the *mechanism* is not.

**Note on "tools":** this fixture contributes **no tools** — there is no `contributes.tools` / tool-registration call anywhere (verified by sweep; the only `contributes` occurrence in the whole fixture is line 41). So the "tools" sub-facet of category #5 is not exercised here; see §5.

---

### #6 · Custom channel — **HIT**

**Hit files / lines**

| Location | Content |
|---|---|
| `src/index.ts:4` | `import { createServer } from 'node:http'` |
| `src/index.ts:47-53` | `function startLegacyBridge() { const server = createServer((_request, response) => { response.end('legacy') }); server.listen(43121, '127.0.0.1'); return server }` |
| `src/index.ts:51` | `server.listen(43121, '127.0.0.1') // http://localhost:43121/api/legacy` |
| `src/index.ts:45` | comment: *"Private loopback HTTP bridge that bypasses the Host Gateway authentication model"* |
| `src/index.ts:46` | comment: *"The function is never invoked; the fixture must remain static-only"* |
| `src/index.ts:54` | `void startLegacyBridge` — explicit keep-alive so the dead code is not tree-shaken |

**Concrete coupling points**

1. **Loopback bind** `127.0.0.1:43121` — a hard-coded host + port.
2. **Route namespace** `/api/legacy` (per the inline comment) — a plugin-private HTTP route served by a raw `node:http` server.
3. **Transport** `node:http` `createServer` — a bespoke HTTP channel with no authentication, no framing, no versioning.
4. **Explicit non-invocation** — the bridge is deliberately never called (`void startLegacyBridge`), which makes this the one category where the *code as written* cannot fail at runtime today.

**Card mapping**

* **`A2-07` (primary)** — custom channels must be established through the Host Gateway with its authentication model; a raw loopback HTTP listener that bypasses the Gateway is no longer a supported channel. The fixture's own comment (line 45) names the collision precisely: it *bypasses the Host Gateway authentication model*. In the target, an unauthenticated plugin-owned HTTP surface on a fixed loopback port is both unsupported and a security regression, so this must be re-expressed as a Gateway-authenticated channel rather than merely re-pointed.

**Why this category is a trap despite being dead code:** the scan must report it, because the coupling is *structural* — the moment anyone wires `startLegacyBridge()` into `activate()` (its only reason for existing), the collision becomes live. A "currently unreachable" hit is still a hit. Treat `A2-07` as a design-level blocker for the migration, not a line-level one.

---

### #7 · Subprocess / output parsing — **HIT** (two independent sites, same wrong assumption)

**Hit files / lines**

| Location | Content |
|---|---|
| `src/index.ts:59` | `const child = spawn('dsh', ['--profile', 'headless', prompt])` |
| `src/index.ts:61-64` | `child.stdout.on('data', (line: Buffer) => { const event = JSON.parse(line.toString()); if (event.type === 'final') result = event.text })` |
| `src/index.ts:56` | comment: *"Deliberately wrong wrapper assumption: treats headless stdout as JSONL"* |
| `scripts/apply-patch.mjs:12-14` | `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })` |
| `scripts/apply-patch.mjs:15-19` | `for (const line of output.split('\n')) { … const event = JSON.parse(line); if (event.type === 'final') console.log('…', event.text) }` |
| `scripts/apply-patch.mjs:11` | comment: *"Deliberately wrong expectation: target headless stdout is final text, not JSONL"* |
| `scripts/apply-patch.mjs:5` | `process.env.DSH_HARNESS_SOURCE_ROOT` (required, throws if unset) |

**Concrete coupling points**

1. **CLI executable name** `dsh` — resolved from `PATH`, with no absolute path or version pin. (`package.json` has no dependency pinning the CLI; version is `0.1.1`.)
2. **Invocation surface** `--profile headless <prompt>` — the flag form *and* the positional-prompt form.
3. **Output envelope assumption** — stdout is assumed to be **JSONL**: one JSON object per line, each with `type` and (for the final event) `text`.
4. **Field names** `event.type`, `event.text`, and the sentinel value `'final'`.
5. **Chunk-vs-line bug** (`src/index.ts:61`) — `stdout.on('data')` receives *arbitrary chunks*, not lines. `JSON.parse(line.toString())` is applied to whatever chunk arrived. This is broken independently of the format change and will also break on a multi-line or partial write.
6. **Synchronous vs async duality** — `execFileSync` (buffered, then split) in the script vs `spawn` + streaming in the plugin. Two different parsing strategies, one shared wrong assumption.
7. **`encoding: 'utf8'`** — assumes text output with no binary/NUL framing.

**Card mapping**

* **`A2-08` (primary)** — headless stdout is **final text**, not JSONL. The envelope is gone, so `JSON.parse` at `src/index.ts:62` and `apply-patch.mjs:17` throws on the very first line, and the `event.type === 'final'` / `event.text` sentinels at `:63` and `:18` no longer exist. This is a **hard runtime crash**, not a silent behavior change.
* **`A1-03` (secondary)** — the `dsh --profile headless <prompt>` invocation surface itself changed. Even after fixing the parsing, the flag/positional form at `src/index.ts:59` and `apply-patch.mjs:12` must be re-verified against the target CLI.
* Cross-reference to `A2-06`: `--profile headless` addresses a profile by id — profile identity/layout is the #4 investigation.

**Note:** `scripts/apply-patch.mjs:5` (`DSH_HARNESS_SOURCE_ROOT`) is a coupling to the host **source tree root**. It is listed under #7 because it gates the subprocess/patch workflow, but it belongs to the same investigation as #1's patch-target relocation (`A2-02`/`A2-09`): the script exists to patch the host source, so its required env var is only meaningful while a patchable host source tree exists.

---

## 4. Corridor folding analysis (0.1.1-rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2)

**The rule, restated.** The corridor has one intermediate hop. When a field/symbol is *removed* at alpha.1 and *restored* at alpha.2, the naive per-hop reading says "breaking change at alpha.1, fix at alpha.2". The **folded** reading — which is what a migration to the *target* version must use — cancels the two: net delta from 0.1.1-rc.2 to 0.1.2-alpha.2 is **zero** for that field. You map to the restoration card and mark the removal card superseded.

**Folding table for this fixture**

| Field / surface | 0.1.1-rc.2 | 0.1.2-alpha.1 | 0.1.2-alpha.2 (target) | Folded net | Card to report |
|---|---|---|---|---|---|
| `SessionEvent.ignorable` | present | **removed** | **restored** | no change | `A2-01` (restoration). `A1-01` **superseded** |
| Informational event producer/persistence contract | present | (affected) | **restored** | no change | `A2-01` |
| `'session/event'` name + `ctx.on` subscription | present | unknown | unknown | **not cancelled by the fold** | verify separately — no card assigned from fixture evidence |
| `src/session/view/SessionView.ts` in host tree | present | moved (decomposition) | absent | **removed** | `A2-02` — no restoration to fold against |
| `@deepseek-ai/dsh-session-view/internal` | present | removed | removed | **removed** | `A2-03` |
| `apiProxy` service + `session.rename`/`llm.providers` | present | retired | retired | **removed** | `A1-02` |
| `~/.dsh/profiles/default` | live | changed | changed | **changed** | `A2-06` |
| headless stdout JSONL envelope | JSONL | changed | final text | **changed** | `A2-08` |

**Three consequences of getting the fold wrong:**

1. **False positive.** Mapping `src/index.ts:17` (`ignorable: true`) to `A1-01` reports a live collision that does not exist at the target, and invites a pointless rewrite of the emit call — potentially breaking the very contract alpha.2 restored.
2. **False negative.** The fold cancels *only the named field*. The consumer subscription at `src/index.ts:20-22` and the ad-hoc event type `'legacy/informational-note'` are **not** covered by the restoration and must be verified on their own. Folding too broadly (treating "the events card" as cancelled) would hide real collisions.
3. **Staged-migration blind spot.** If the migration is executed hop-by-hop (0.1.1-rc.2 → alpha.1 → alpha.2) rather than as one jump, `A1-01` **is** a live break at the intermediate stop and must be handled there. The folded mapping answers "what collides at the target"; it does not answer "what breaks on the way". For a single-shot migration to 0.1.2-alpha.2, the folded answer is the correct one.

---

## 5. Categories without hits, and why "no hit" ≠ "no problem"

### 5.1 Result: there are **no** zero-hit categories in this fixture

All seven touchpoint categories hit (see §1). So the "no hits" obligation is discharged by (a) the per-category ruled-out inventory in §5.2 and (b) the epistemic caveat in §5.3.

### 5.2 What was scanned and what was explicitly ruled out, per category

Full scan surface = all 6 files in the fixture, every line, plus 11 regex sweeps (`ctx.*`, `emit|.on(`, `apiProxy|invoke(`, `homedir|.dsh|profiles|profile`, `registerCommand|contributes|SessionView|@deepseek-ai`, `createServer|listen|http|43121|127.0.0.1|localhost`, `spawn|execFile|exec(|child_process|stdout|stderr|JSON.parse`, `readFileSync|writeFileSync|readdir|mkdir|path.join|join(`, `process.env`, `import |require(`, `final|jsonl|JSONL`).

| # | Category | Ruled out (searched, absent) |
|---|---|---|
| 1 | Source patch | No `cordis.plugin.yml` or other manifest; no `patches/` dir, no `.patch`/`.diff` files; `package.json` contains no patch-related script beyond `apply-patch`; `README.md` is documentation only and is not itself a patch surface |
| 2 | Events | No other event names — `emit`/`.on(` occur only at `src/index.ts:15` and `:20` (the `.on(` at `:61`/`:65` are child-process events, not plugin events); no `events.emit`, no persistence/duration API usage, no event-type declaration |
| 3 | Service / Remote | No other `ctx.get(...)` — only `'apiProxy'` (lines 26, 30); no `ctx.service`, no `remote.*`, no direct Host RPC. (`ctx.register` at 25/29/35/57 registers *plugin* services for others to call — the inverse direction, not a Host-service dependency) |
| 4 | Host directory | No other `homedir()` / `.dsh` / absolute-path literal; `readFileSync('patch.yml')` is CWD-relative and plugin-local; `DSH_HARNESS_SOURCE_ROOT` is a source-root coupling, reported under #1/#7; no `mkdirSync`/`rmSync`/`readdirSync` anywhere |
| 5 | UI / commands / tools | **No tool contribution exists** — no `contributes.tools`, no tool-registration call, no tool schema anywhere (the only `contributes` occurrence in the fixture is line 41); no other `@deepseek-ai/dsh-*` import (only `dsh-session-view/internal` at line 10); no webview/panel/menu/view contribution; no `registerCommand` other than line 41 |
| 6 | Custom channel | No WebSocket, no `node:net`, no unix socket, no second port (43121 is the only one), no Gateway/client usage; no `fetch`/`axios` outbound calls |
| 7 | Subprocess / output parsing | `spawn` (`:59`) and `execFileSync` (`apply-patch.mjs:12`) are the only two process launches; no `exec`, no `fork`, no `execSync`; no stdout/stderr option overrides; `JSON.parse` occurs only at `:62` and `apply-patch.mjs:17` |

### 5.3 Why "no hit" cannot be read as "no problem"

1. **A static text scan cannot see indirect or computed references.** This fixture happens to use literal strings everywhere, which is why the scan is exhaustive here. But a service id built from a constant, an event name composed at runtime, a path joined from config, or a dynamically `import()`-ed module would all be invisible. Absence of a literal is not absence of a dependency.
2. **A static scan cannot see behavioral/protocol changes.** Cards that change the *semantics* of an API the plugin does use — return shapes, timing, error types, default values, wire framing — collide with zero textual overlap. Nothing in a grep detects "this method now returns a stream instead of a string".
3. **Additive cards break plugins with no coupling text at all.** New *required* manifest fields, new permission/consent declarations, or a new mandatory registration step fail a plugin that never mentions them. Such a category would scan as "no hit" and still be a hard failure.
4. **Transitive and host-side couplings are out of view.** The plugin's dependencies, the host runtime it is loaded into, and anything the host does on the plugin's behalf are not in these 6 files.
5. **Dead code hides hits.** `startLegacyBridge()` (`src/index.ts:47-53`) is never invoked — a runtime-only or execution-driven scan could miss it entirely; only a static scan catches it. The converse also holds: code that looks live may be unreachable. Reachability and coupling are independent questions.
6. **This fixture cannot be compiled — by design** (`README.md:3`). That removes the strongest static check available: type-level verification. Signature changes such as `new SessionView({ enhanced: true })` (`A2-04`) cannot be confirmed or refuted by the compiler here, so several couplings are *unverifiable* rather than *verified absent*.
7. **The scan cannot determine the migration target.** It establishes *what couples*, not *what to couple to*. Every card above needs the target-version registry to turn into a concrete fix.
8. **Scope of the scan is exactly 6 files.** If the real plugin has generated files, vendored copies, additional entry points, or build outputs, those were not scanned and no claim is made about them.

---

## 6. Recommended migration order (derived from the scan, not executed)

1. **#5 → #1 together (root cause).** Resolve the UI decomposition (`A2-02`/`A2-03`/`A2-05`) first: it fixes the `SessionView` import, the command contribution, *and* retires the #1 patch target in one move. Do not try to repoint `patch.yml` at a new path until the decomposition's final layout is known — repointing a source patch at a file that is about to move again is wasted work.
2. **#3 (`A1-02`) next.** Two lines (26, 30) plus two method names (27, 31); the highest value-to-effort ratio, and the most likely to fail silently because `ctx` is `any`.
3. **#7 (`A2-08`/`A1-03`) next.** Two sites with the same wrong assumption. Replace the JSONL envelope assumption with final-text handling *and* fix the chunk-vs-line bug at `src/index.ts:61` while you are there.
4. **#4 (`A2-06`) and #6 (`A2-07`).** Both are design-level: derive the profile directory from the host rather than hard-coding it, and re-express the loopback bridge as a Gateway-authenticated channel.
5. **#2 (`A2-01`) last, and minimally.** Under the folded mapping the emit is compatible at the target — verify the consumer subscription and the ad-hoc event type, then leave the producer alone unless the verification fails.

---

## 7. Verification statement

* Fixture integrity: 6/6 files hash-identical before and after the scan (§0); no file created, modified, or deleted under `fixture/`.
* No command from the fixture was executed: `scripts/apply-patch.mjs` was read, never run; `dsh` was never invoked; no migration, installation, or network access was performed.
* Writes performed by this task: this report only, at `agent-output/S1-static-scan/S1-static-scan-report.md`. No temporary scripts were created (none were needed), so nothing requires cleanup.
* Not read, by design and by the workspace boundary: the corridor's change-card registry, the skill material, reference solutions, tests, `node_modules`, and every path outside `fixture/` and `agent-output/`. Card IDs in §2 are therefore locally derived and keyed by change name — see §0.1.
