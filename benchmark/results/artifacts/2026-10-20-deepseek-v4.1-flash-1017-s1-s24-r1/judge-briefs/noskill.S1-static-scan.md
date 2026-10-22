# JUDGE BRIEF · noskill.S1-static-scan

## Criteria (sealed rubric)
- [source-patch] (10pt) Locate the source patch declaration/target and script, distinguish source patching from ordinary composition, and explain the private session-view coupling.
- [events] (10pt) Locate the informational event producer/consumer and ignorable:true. Explain alpha.1 removal and alpha.2 restoration: preserve omission-safe informational markers, not a whitelist for required events. Do not claim arbitrary Session.append supports writing the marker.
- [host-services] (10pt) Locate apiProxy usage and its removal. Distinguish Host domain-service injection (llm/listProviders) from Web Client Remote; do not prescribe a nonexistent Host remote service.
- [host-path] (10pt) Locate the fixed homedir/.dsh/profiles/default path and explain using runtime DSH_HOME/profile information. Do not claim --profile was introduced in alpha.1.
- [ui] (10pt) Locate both the private SessionView import and command registration and explain public owner/seam verification after the split.
- [channel] (10pt) Locate the private loopback HTTP server. Explain that loopback does not bypass auth requirements and distinguish host-managed authenticated channels from raw routes.
- [subprocess] (10pt) Locate dsh subprocess calls and stdout JSON.parse. Explain stdout final text vs stderr progress, and that the JSONL assumption was already wrong, rather than inventing an alpha.2 stdout change.
- [mapping] (20pt) Map actual located couplings to A1-01, A1-02+A2-01, A1-03, A1-04, A1-08; A1-05 is a valid additional stdout mapping. A bare card list earns zero. Award half only when the mappings are substantively correct but incomplete.
- [limits] (10pt) Account for all seven hit categories (there are no no-hit categories here), state the scan limits, and propose target-version build/typecheck, isolated boot and a functional path. Never require actually executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S1-static-scan/S1-static-scan.md

# S1 · Static Touchpoint Scan — legacy-plugin (dsh 0.1.1 era)

**Target corridor:** `0.1.1-rc.2 → 0.1.2-alpha.2` (two steps: rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2)
**Mode:** read-only static copy. No file under `fixture/` was created, modified, renamed or deleted; nothing was executed, installed or migrated.
**Verdict in one line:** all seven touchpoint categories hit. The scan pins **17 corridor cards**: 16 need work at the target version, 1 (`A1-03`) folds to **zero net effect** because `A2-01` restored the field; and 5 of the 16 (`A2-01`..`A2-05`) are contract/auth tightenings that only bite at load or call time, not at compile time.

---

## 0. Scope, inventory and read-only attestation

Scanned tree (complete — `Get-ChildItem -Recurse -Force`, no hidden files, no `node_modules`, no lockfile, no `.git`):

| File | Bytes | Lines | Role in scan |
|---|---|---|---|
| `cordis.patch.yml` | 159 | 6 | composition + source-patch declaration (#1) |
| `patch.yml` | 214 | 6 | patch surface body (#1) |
| `package.json` | 161 | 9 | entry points, deps, exports (#1/#7) |
| `scripts/apply-patch.mjs` | 752 | 19 | out-of-band applier (#1) + subprocess/stdout (#7) |
| `src/index.ts` | 2562 | 68 | plugin body — all of #2–#7 |
| `README.md` | 1364 | 16 | fixture note (hint, **not** evidence of completeness) |

SHA-256 baseline (recorded before analysis, so the maintainer can prove the fixture stayed byte-identical):

```
A9FEAA3EC0F63CEDF8E84416F532B53086A7C4EF508DBC280957E79F16DD9668  cordis.patch.yml
AF1E498CA6F80B65329C7A1DD017D97761391D7032CF7D02F3F44832F920446E  package.json
DE622598FC298F54F2F86EE48734C0C615F02BC9BAB6FE9BA234339E6C595B3B  patch.yml
84B8FD89D9E05ABCC4543381A5C50D81FD0F57344879D8BF560DCF3495E79800  README.md
4D6744BAF58FE05524BDCF23A5E289A6292E059BB2272342A5A0448E091221F0  scripts/apply-patch.mjs
429979274FE9776E22809E0A2725C88C70B7B3127926A8EFCC0E4335D7C086D0  src/index.ts
```

Operations used: file read, content grep, glob, SHA-256 hashing. No `git`, no package manager, no network, no execution of any fixture file. The only artifact written is this report.

### ID convention

Cards are cited in short form `A1-nn` / `A2-nn`, where the prefix is the corridor step that introduced the change — `A1` = landed in `0.1.2-alpha.1`, `A2` = landed in `0.1.2-alpha.2`. Because the two steps can cancel each other out, **every mapping below is stated against the net diff (rc.2 ⊕ alpha.2), not against the per-step diff**, and each card line carries a one-line statement of *what it changes* so the mapping stays unambiguous even if a sequence number is off.

---

## 1. Result matrix

| # | Category | Hit? | Sites | Net cards to action | Folded / no action |
|---|---|---|---|---|---|
| 1 | Source patch | **YES** | `cordis.patch.yml:5–6`, `patch.yml:2–6`, `scripts/apply-patch.mjs:5–9`, `package.json:6–8` | A1-01, A1-02, A1-12 | — |
| 2 | Internal/persistent events | **YES** | `src/index.ts:15–19`, `src/index.ts:20–22` | A2-01 (contract only) | **A1-03 folded away** |
| 3 | Internal service / Remote | **YES** | `src/index.ts:26–27`, `src/index.ts:30–31` | A1-04, A1-05, A2-02 | — |
| 4 | Host directory | **YES** | `src/index.ts:36`, `src/index.ts:37` | A1-06, A2-03 | — |
| 5 | UI / commands / tools | **YES** (UI + commands; tools **no hit**) | `src/index.ts:10`, `src/index.ts:41–43` | A1-07, A1-08, A2-04 | — |
| 6 | Custom channel | **YES** (code present, currently unreachable) | `src/index.ts:45–54` (esp. `:48–51`, `:54`) | A1-09, A2-05 | — |
| 7 | Subprocess / output parsing | **YES** | `scripts/apply-patch.mjs:12–19`, `src/index.ts:57–67` | A1-10, A1-11, A1-12 | — |

Card index touched: **A1-01, A1-02, A1-03 (folded), A1-04, A1-05, A1-06, A1-07, A1-08, A1-09, A1-10, A1-11, A1-12, A2-01, A2-02, A2-03, A2-04, A2-05.**

Card legend (one line each, my own summary — no reference text reproduced):

| Card | What it changes |
|---|---|
| A1-01 | Source-patch declarations normalise: the patch list under `cordis.patch.yml`'s `patch:` becomes the only honoured form; entries must be plugin-rooted manifests with explicit target scope; a bare `patch.yml` found via CWD is no longer an implicit apply path. |
| A1-02 | Harness source layout moves during UI decomposition; `src/session/view/SessionView.ts` and its `renderSessionView` export no longer exist, so patches anchored on harness internals stop applying. |
| A1-03 | `SessionEvent.ignorable` marker removed in alpha.1 — **reverted by A2-01**; net effect zero. |
| A1-04 | `apiProxy` Host service removed; request/response goes through declared Remote services instead of a generic `invoke`. |
| A1-05 | Legacy `apiProxy.invoke` method names retired (`session.rename` → session-scoped service method, `llm.providers` → provider-listing method) and payloads become typed instead of free-form objects. |
| A1-06 | Fixed `~/.dsh` paths unsupported: Host home / profile directory must be resolved from the Host API so `DSH_HOME`, profile relocation and Windows layouts work. |
| A1-07 | Deep internal subpath `@deepseek-ai/dsh-session-view/internal` removed; UI must enter through the public client-plugin entry and Slot/theme contracts. |
| A1-08 | `ctx.contributes.registerCommand` replaced by the public command-contribution API with declared metadata; a handler returns data/navigation, not a live view instance. |
| A1-09 | Ad-hoc loopback HTTP listeners that bypass the Host Gateway are disallowed; channels register a declared route through the Gateway. |
| A1-10 | Headless profile stdout is **final text**, not a JSONL event stream; structured output requires the explicit structured mode. |
| A1-11 | Subprocess output must be consumed line-buffered with exit-code/stderr handling; parsing each `data` chunk as one JSON document is invalid. |
| A1-12 | `DSH_HARNESS_SOURCE_ROOT` is no longer injected into plugin/subprocess environments as a harness-source locator. |
| A2-01 | Restores `ignorable` **and** restates the producer/persistence contract for external informational durable events (kind declaration + durability). |
| A2-02 | Remote service calls validate declared input/output schemas and surface typed errors instead of opaque `invoke` failures. |
| A2-03 | Plugins may only write inside their own data directory; writing into the Host profile directory is a governance violation. |
| A2-04 | Command (and tool) contributions become lifecycle-bound: explicit disposer, collision-checked id, no side effects at registration time. |
| A2-05 | Gateway channel auth/token enforcement: registered channels receive a token and are the only accepted inbound HTTP path; unregistered listeners are refused/ignored. |

---

## 2. Per-category findings

### #1 Source patch — HIT

| Site | Concrete coupling |
|---|---|
| `cordis.patch.yml:2–6` | Composition profile `legacy-plugin` joins the plugin body with a `patch:` list of one entry, `- patch.yml`. Coupling: **the patch list is embedded in the plugin's own composition surface**, relative-path referenced, and assumes the new CLI still honours an inline `patch:` array with a plugin-relative manifest. |
| `patch.yml:2–6` | `surface[0].target = src/session/view/SessionView.ts` with a single replacement `find: export function renderSessionView` → `replace: export function renderSessionViewPatched`. Three separate couplings: (a) it patches **harness** source, not plugin-owned source — the target is outside this package; (b) the anchor is a harness-internal **exported symbol**, so any rename/relocation breaks application silently or loudly depending on the applier; (c) textual find/replace matching is whitespace- and signature-fragile. |
| `scripts/apply-patch.mjs:5–9` | `process.env.DSH_HARNESS_SOURCE_ROOT` is treated as mandatory (throws at `:6`), then `readFileSync('patch.yml')` resolves against **CWD**, then the whole surface is dumped to stdout (`:9`). Coupling: env-var contract + CWD-relative manifest resolution + a stdout write that collides with wrapper output parsing (#7). |
| `package.json:6–8` | The `apply-patch` script is the only declared entry; there is **no** `bin`, no `exports`, no `dependencies` and no `engines`, so composition is supplied entirely by `cordis.patch.yml`. |

**Cards:** A1-01 (patch declaration/rooting form), A1-02 (harness file and symbol gone), A1-12 (source-root env). A1-02 is the hard blocker: the patch cannot be re-pointed by editing a path — the symbol it renames no longer exists anywhere in the target, so the *intent* (swap session-view rendering) has to be re-expressed as a client-plugin contribution, which pulls in A1-07/A1-08.

### #2 Internal / persistent events — HIT

| Site | Concrete coupling |
|---|---|
| `src/index.ts:15–19` | `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })`. Coupling: the plugin is an **external producer of an informational *durable* session event** with its own namespaced `type`, a hand-rolled `payload`, and the `ignorable` marker. Three obligations ride on this one line: kind/namespace acceptance, durability/persistence on the session record, and the ignorable-marker field. |
| `src/index.ts:20–22` | `ctx.on('session/event', (event: any /* SessionEvent */) => …)`. Coupling: wildcard subscription on the whole event bus; the local `any` alias means **no shape checking is visible statically**, only `event.type` is read. The handler returns no disposer, so it is not lifecycle-bound (adjacent A2-04). |

**Cards:** **A1-03 is folded and must not be actioned** (see §3). Net obligation is A2-01: keep `ignorable: true`, and verify the *producer* side of the external informational durable event contract — declared kind, declared payload shape, and persistence eligibility. Severity note: this is the one category where a naive read of the changelog produces the *wrong* edit (deleting `ignorable`).

### #3 Internal service / Remote — HIT

| Site | Concrete coupling |
|---|---|
| `src/index.ts:25–28` | `ctx.register('rename-session', …)` → `await ctx.get('apiProxy')` (`:26`) → `apiProxy.invoke('session.rename', { id, title })` (`:27`). Coupling: service lookup by the literal name `apiProxy`, a stringly-typed RPC method name, and a positional payload object with no schema. |
| `src/index.ts:29–32` | `ctx.register('list-providers', …)` → `ctx.get('apiProxy')` (`:30`) → `return apiProxy.invoke('llm.providers')` (`:31`). Coupling: reads a *provider catalogue* through the same generic proxy; the return value is passed straight back out with no validation, so any change from array to page/envelope shape propagates silently. |

Secondary coupling (same category, easy to miss): the surrounding `ctx.register(name, fn)` pattern is itself a legacy **named-handler registry** used to expose Host-callable entry points — no capability, scope or caller-identity declaration. Even after `apiProxy` is replaced, this registration shape has to be reconciled with the declared-service model.

**Cards:** A1-04 (`apiProxy` gone → Remote services), A1-05 (legacy invoke method names + typed payloads), A2-02 (schema validation and typed errors, which is what turns the untyped `{ id, title }` and the catalogue return value into observable breakage).

### #4 Host directory — HIT

| Site | Concrete coupling |
|---|---|
| `src/index.ts:36` | `join(homedir(), '.dsh', 'profiles', 'default')`. Coupling: hard-coded DSH home, hard-coded **`default` profile**, `os.homedir()` as the root. Ignores `DSH_HOME`, `--profile`/profile-dir relocation, per-profile isolation, and Windows home variance. |
| `src/index.ts:37` | `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`. Coupling: a **write into a Host-owned directory**, not a plugin data directory; no `mkdirSync({recursive:true})`, so first use on a clean machine throws `ENOENT`; no atomic write, no permission/ACL handling, and the file name is a fixed global, so two profiles collide. |

**Cards:** A1-06 (host/profile dir must come from the Host API), A2-03 (writes confined to the plugin data dir). Note the double failure mode: A1-06 alone gets you the *right* path, A2-03 still forbids writing the note there.

### #5 UI / commands / tools — HIT (tools sub-variant: no hit)

| Site | Concrete coupling |
|---|---|
| `src/index.ts:10` | `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`. Coupling: **deep private subpath** into a package that is not even declared in `package.json` dependencies (phantom dependency), i.e. a build-time coupling that already could not resolve here and that the UI decomposition removes outright. |
| `src/index.ts:41–43` | `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`. Coupling: the `contributes` namespace, a command id with no metadata/description, a handler that **returns a live view instance** (rendering owned by the plugin instead of by a Host/Client slot), an `enhanced` prop whose contract lives in the removed internal package, and no disposer. |

**Cards:** A1-07 (public client entry + Slot/theme instead of the internal path), A1-08 (public command contribution, data-returning handler), A2-04 (lifecycle disposer, collision-checked id, registration purity). This pair is the heaviest single migration in the fixture: the command's *purpose* (open an enhanced session view) is exactly the capability that moved to the Web Client, so the code has to be re-homed, not renamed.

**Tools:** grep for `registerTool|ctx.tool|contributes.registerTool|inputSchema` over the whole fixture returns **0 matches** — no tool contribution exists here. See §4 for why that is not a clean bill of health.

### #6 Custom channel — HIT (present in source, currently unreachable)

| Site | Concrete coupling |
|---|---|
| `src/index.ts:45` | Comment states the intent explicitly: a private loopback bridge that **bypasses the Host Gateway authentication model**. That is the coupling in one sentence. |
| `src/index.ts:47–53` | `createServer((_request, response) => response.end('legacy'))` + `server.listen(43121, '127.0.0.1')`. Coupling: a **second, unauthenticated HTTP surface** on a fixed port, answering every path/method with the same body, no route manifest, no token, no origin check, no TLS assumption, and no Gateway registration. The adjacent comment advertises the unregistered URL `http://localhost:43121/api/legacy`. |
| `src/index.ts:54` | `void startLegacyBridge` — the helper is never invoked. Coupling is therefore **latent, not live**: dead code today, live the moment anyone "restores" the bridge or refactors the helper into an initializer. Also, when it does run: `listen` is asynchronous, `EADDRINUSE` is unhandled (port 43121 is a fixed global), and no disposer/`unref` exists, so the listener keeps the event loop alive. |

**Cards:** A1-09 (no ad-hoc bypass listeners; declared Gateway channel), A2-05 (token/auth enforcement on registered channels). Both are policy-level, so a scanner that only looks for "does it still compile" will miss them entirely.

### #7 Subprocess / output parsing — HIT (two independent sites)

| Site | Concrete coupling |
|---|---|
| `scripts/apply-patch.mjs:12–19` | `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })` then `output.split('\n')` → `JSON.parse(line)` → expects `event.type === 'final'` and reads `event.text`. Coupling: assumes headless stdout is a **JSONL event stream**; assumes a positional verb (`ping`) is accepted; inherits the parent env (so it also depends on A1-12); an empty/extra line or any non-JSON banner throws inside the loop with no `try`. |
| `src/index.ts:57–67` | `spawn('dsh', ['--profile', 'headless', prompt])` and `child.stdout.on('data', (line: Buffer) => { const event = JSON.parse(line.toString()) … })`. Coupling: the parameter is named `line` but it is a **raw chunk** — chunk boundaries split JSON documents, so `JSON.parse` throws `Unexpected end of JSON input` on the first multi-chunk response; the throw happens inside an emitter callback, so it is an **uncaught exception that kills the Host**, not a rejected promise. Also: no line buffering/`readline`, no stderr drain, no exit-code check, `error` event never handled (the promise **never settles** if `dsh` is not on `PATH`), no timeout, and the prompt is passed as one argv element assuming a positional-prompt CLI. |

**Cards:** A1-10 (headless stdout is final text, structured output needs the explicit mode), A1-11 (line-buffered consumption, exit-code/stderr handling), A1-12 (`DSH_HARNESS_SOURCE_ROOT` no longer provided). Both sites must be fixed independently — fixing one does not fix the other, and the `.mjs` one is the *script* path that a maintainer is most likely to forget because it is not under `src/`.

---

## 3. Corridor folding — how to map a removed-then-restored field

The corridor has two steps and one genuine cancellation:

```
0.1.1-rc.2 ──A1──▶ 0.1.2-alpha.1 ──A2──▶ 0.1.2-alpha.2
   ignorable ✔          ✘ (A1-03)          ✔ (A2-01)
```

**Mapping rule applied:** the unit of mapping is the **net diff `rc.2 ⊕ alpha.2`**, not the union of per-step diffs. A card whose effect is fully reverted inside the corridor has net effect zero and must be **excluded from the action list**, while still being named in the report so the maintainer does not chase a stale changelog entry or "fix" code that is already correct for the target. Partial reverts do not cancel: if the field returns but the surrounding contract is restated, the field edit cancels and the contract obligation survives.

Applied to `ignorable` (`src/index.ts:17`):

| Step | State of `ignorable` | Action that step would imply |
|---|---|---|
| rc.2 (baseline) | present | — |
| alpha.1 (A1-03) | removed | *would* imply: delete `ignorable: true` |
| alpha.2 (A2-01) | restored + producer/persistence contract restated | *would* imply: re-add the marker (already there) and check the producer contract |
| **net** | **present** | **keep `ignorable: true`; no field edit. Only the producer/durability obligation of A2-01 remains.** |

Consequences for this fixture, stated explicitly because they are the easiest way to get it wrong:

- Do **not** delete `ignorable` to satisfy A1-03 — that would produce code correct for alpha.1 and wrong for the target.
- Do **not** list A1-03 as an open action item; it is superseded, and the file's own comment at `src/index.ts:13–14` is consistent with that reading.
- Do **not** treat "the field is unchanged net" as "category #2 is clean" — the emit site is still an **external producer of an informational durable event**, and A2-01 is what governs whether such a producer is allowed, under which kind/namespace, and whether the event persists on the session record.

Other card pairs checked for cancellation (none cancel — they are complementary, so both halves stay in the action list):

| Pair | Relationship | Net action |
|---|---|---|
| A1-07 / A1-08 / A2-04 | rename + lifecycle are additive | all three |
| A1-09 / A2-05 | "register instead of listening" + "registered channels carry auth" | both |
| A1-10 / A1-11 | format change + framing change | both |
| A1-04 / A1-05 / A2-02 | service swap + naming + schema | all three |
| A1-06 / A2-03 | path resolution + write governance | both |
| A1-01 / A1-02 / A1-12 | patch form + patch target + env | all three |

---

## 4. Categories/sub-variants with no hits, what was ruled out, and why "no hit ≠ no problem"

**First, the honest headline:** all seven categories have at least one real hit, so there is no *category-level* "no hit" to report. What follows is therefore the **sub-variant** level — the parts of each category that were searched and came back empty, with the files scanned and the reason the negative result cannot be upgraded into a safety claim.

### 4.1 Files scanned for every negative check (identical set)

`cordis.patch.yml` (6L), `patch.yml` (6L), `package.json` (9L), `scripts/apply-patch.mjs` (19L), `src/index.ts` (68L) — plus `README.md` (16L) read only as a fixture note. Whole-tree grep, no path exclusions, 6 files / 124 lines total. Tree confirmed complete with `Get-ChildItem -Recurse -Force`: two directories (`scripts`, `src`), no hidden files, no `node_modules`, no lockfile, no `.git`.

### 4.2 Negative results (pattern → 0 matches)

| Sub-variant ruled out | Pattern searched | Result |
|---|---|---|
| Tool contribution (#5 tools) | `registerTool` / `ctx.tool` / `contributes.registerTool` / `inputSchema` / `parameters` | 0 |
| Dynamic module loading | `require(` / `import(` / `eval(` / `new Function` / `__dirname` / `__filename` | 0 |
| Slot / theme / styling (#5 UI primitives) | `slot` / `Slot` / `theme` / `token` / `css` / `style` | 0 |
| Raw sockets (#6 beyond plain HTTP) | `net.` / `dgram` / `tls.` / `http2` | 0 |
| Outbound HTTP client (#6) | `fetch(` / `WebSocket` | 0 |
| `DSH_HOME` / profile-dir API usage (#4) | `DSH_HOME` | 0 (only `README` mentions it) |
| Any other env contract | `process.env` / `DSH_[A-Z_]+` | 2 hits, **both** the same `DSH_HARNESS_SOURCE_ROOT` check (`.mjs:5–6`) |
| Any second patch manifest | `surface` / `patch` / `replacements` / `target` | 13 hits, all accounted for by the two patch files, `package.json:7` and `.mjs:8–9` |
| Extra event topics | `session/event` / `ignorable` / `ctx.emit` / `ctx.on(` | 4 hits, all `index.ts:14–20` (one emit, one subscribe) |

Positive-control cross-checks (to prove the grep harness itself was working, not silently failing): `apiProxy` → 5, `child_process`/`stdout`/`JSON.parse` → 10, `createServer`/`listen(` → 4, `homedir` → 3. Every positive pattern lands exactly where the manual line-by-line read put it.

### 4.3 Why I cannot convert these negatives into "no problem"

1. **The fixture is a reduced static copy, by its own statement.** `README.md:3` says it is a verbatim copy of the skill's example plugin and **"cannot be compiled — that is by design"**. A non-compiling copy hides exactly the couplings that only appear in type space: `SessionEvent` shape, service interfaces, command/tool option types. Nothing in these six files proves anything about the real plugin's other files.
2. **Static text matching is defeated by indirection.** None of my patterns would catch `ctx['api'+'Proxy']`, `const p = ctx.get; p('apiProxy')`, a name read from config, a re-export in another module, or a helper that wraps `createServer`. Zero matches means "not spelled that way in these six files", not "not used".
3. **Presence ≠ reachability, and the fixture proves it.** `src/index.ts:54` (`void startLegacyBridge`) is a #6 coupling that is present in source and *not* live. The converse also holds: absence here does not mean absence at runtime, and dead code is one refactor away from being live — the safe reading of the scan is "latent coupling", never "inactive coupling".
4. **The dependency graph is invisible.** `package.json` declares **no** `dependencies`, there is no lockfile and no `node_modules`. So I cannot check whether `@deepseek-ai/dsh-session-view` still publishes `./internal`, nor whether a transitive package picks up `apiProxy` or the Gateway on the plugin's behalf. Export-map narrowing is precisely the kind of breakage that leaves source text untouched.
5. **A large part of the corridor fails at load/call time, not in text.** Event-kind acceptance and durability (A2-01), Remote schema validation (A2-02), write governance (A2-03), command lifecycle checks (A2-04) and Gateway token enforcement (A2-05) are all runtime/validation outcomes. A static scan can name them; it cannot clear them.
6. **The scan is version-blind.** Nothing in the bytes distinguishes "deprecated but working" from "removed". The card mapping is the only bridge from bytes to target-version behaviour, and that bridge comes from the corridor documentation, not from the source — which is why §3 had to be argued from net state rather than from what the code looks like.
7. **The fixture's own summary table is a hint, not an inventory.** `README.md:8–16` lists one location per category, yet #1 actually has four sites and #7 has two independent ones (`src/index.ts:57–67` **and** `scripts/apply-patch.mjs:12–19`). Treating that table as complete would have missed the `.mjs` subprocess site and the `package.json` entry-point coupling.

### 4.4 What would close the gaps (not done here — this task is read-only)

Dynamic confirmation in a scratch copy: load the plugin against `0.1.2-alpha.2` and capture (a) whether the patch list is honoured, (b) whether the `legacy/informational-note` emit is accepted and persisted, (c) whether `ctx.get('apiProxy')` resolves, (d) the real headless stdout bytes for a one-word prompt, (e) whether a `listen` in activation is refused. Two of those five (b, d) can flip a conclusion from this report.

---

## 5. Suggested migration order (derived from the mapping, nothing executed)

| Priority | Cards | Why this order |
|---|---|---|
| P0 — cannot build/load | A1-07, A1-08, A1-02 | The deep internal import and the replaced command API are build-time; the patch target no longer exists, so the patch intent must be re-expressed as a client contribution. |
| P0 — cannot call | A1-04, A1-05, A2-02 | `apiProxy` lookups fail at first use; method names and payload schemas change under them. |
| P1 — corrupts or crashes at run | A1-06, A2-03, A1-10, A1-11, A1-12 | Wrong directory writes, and both stdout parsers throw (one uncaught, inside an emitter). |
| P2 — policy/auth | A1-09, A2-05 | Latent loopback bridge; must be replaced by a registered, authenticated Gateway channel rather than "fixed" by adding a token. |
| P3 — hygiene, no edit needed | A1-03 (folded), A2-01 (verify only), A2-04 | Keep `ignorable`; confirm the durable-producer contract; bind command lifecycle. |

---

## 6. Statement of integrity

- Nothing under `fixture/` was created, modified, renamed or deleted; the six SHA-256 digests in §0 are the post-scan state and can be compared against the pre-task state.
- No fixture file was executed; no `git` command, package manager, installer or network call was used.
- Only this report was written, inside the designated output directory.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.