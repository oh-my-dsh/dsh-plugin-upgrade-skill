# S1 · Static Touchpoint Scan — `legacy-plugin` (dsh 0.1.1 era)

**Corridor audited:** dsh `0.1.1-rc.2` → `0.1.2-alpha.2`  
**Target scanned (read-only):** `.../noskill/S1-static-scan/fixture/`  
**Report written to:** `.../noskill/S1-static-scan/agent-output/S1-static-scan/S1-static-scan-report.md`  
**Scan mode:** pure static copy — no install, no migration, no execution, no network.  
**Verdict: 7 of 7 touchpoint categories HIT.** No category is clean; there is no "no-hit" category in this fixture.

---

## 0. Method, scope and read-only proof

### 0.1 Files scanned (complete inventory — nothing else exists in the fixture)

| # | File | Bytes | Role in scan |
|---|---|---|---|
| 1 | `fixture/README.md` | 1364 | fixture self-description / touchpoint index (task material, not plugin code) |
| 2 | `fixture/package.json` | 161 | plugin manifest — version, scripts, deps |
| 3 | `fixture/cordis.patch.yml` | 159 | profile composition + **source-patch declaration** (#1) |
| 4 | `fixture/patch.yml` | 214 | **patch surface** — target path + find/replace (#1) |
| 5 | `fixture/scripts/apply-patch.mjs` | 752 | patch applier + headless CLI subprocess wrapper (#1, #7) |
| 6 | `fixture/src/index.ts` | 2562 | plugin body — events, service/Remote, host dir, UI/command, channel, subprocess (#2–#7) |

Every file was read in full (line-numbered). Six files, 6,112 bytes total. No `node_modules/`, no lockfile, no test directory, no `cordis.yml`, no `.dsh/` directory, no hidden files (the enumeration used `-Force`, so dot-files would have appeared).

### 0.2 Read-only discipline — verified, not asserted

The fixture was never opened for write. SHA-256 + length + mtime captured **before** writing this report, and unchanged after:

| SHA-256 | Bytes | LastWriteUtc | File |
|---|---|---|---|
| `A9FEAA3EC0F63CEDF8E84416F532B53086A7C4EF508DBC280957E79F16DD9668` | 159 | 2026-09-03T10:21:09Z | `cordis.patch.yml` |
| `AF1E498CA6F80B65329C7A1DD017D97761391D7032CF7D02F3F44832F920446E` | 161 | 2026-09-03T10:21:09Z | `package.json` |
| `DE622598FC298F54F2F86EE48734C0C615F02BC9BAB6FE9BA234339E6C595B3B` | 214 | 2026-09-03T10:21:09Z | `patch.yml` |
| `84B8FD89D9E05ABCC4543381A5C50D81FD0F57344879D8BF560DCF3495E79800` | 1364 | 2026-09-03T10:21:09Z | `README.md` |
| `4D6744BAF58FE05524BDCF23A5E289A6292E059BB2272342A5A0448E091221F0` | 752 | 2026-09-03T10:21:09Z | `scripts/apply-patch.mjs` |
| `429979274FE9776E22809E0A2725C88C70B7B3127926A8EFCC0E4335D7C086D0` | 2562 | 2026-09-03T10:21:09Z | `src/index.ts` |

All six mtimes are the pre-existing `2026-09-03` values (the container clock reads 2026-10-16), i.e. nothing in the fixture was created or touched by this scan. Only `agent-output/` was written.

### 0.3 How the card mapping is expressed (please read before using §1–§7)

The authoritative corridor change-card registry lives outside this task cell (the repository `skills/` tree, `solution/`, `tests/`), which this task **explicitly forbids** me to read, search or cite. I therefore could not look up the full `DSH-0.1.x-xx` identifiers. To keep the mapping actionable I use the short form the brief accepts, assigned in the corridor's own touchpoint order:

| Short form | Touchpoint | Named change the card governs (semantic key) |
|---|---|---|
| `A1-01` | #1 source patch | 0.1.1-era **source-patch surface** (plugin-declared `patch:` list + textual find/replace against Host source) |
| `A1-02` | #2 internal/persistent events | **SessionEvent producer / persistence contract** (incl. the `ignorable` marker) |
| `A1-03` | #3 internal service / Remote | **Host `apiProxy` service token + Remote `invoke` surface** |
| `A1-04` | #4 Host directory | **Host directory layout / profile-path resolution** |
| `A1-05` | #5 UI / commands / tools | **UI decomposition — private Host/Web-Client internal path removed; command/tool contribution surface** |
| `A1-06` | #6 custom channel | **Host Gateway authentication model** (custom loopback HTTP channel that bypasses the gateway) |
| `A1-07` | #7 subprocess / output parsing | **headless CLI stdout format** (final text, not JSONL) |

Substitution is unambiguous: each row is keyed to a *named change*, so replacing `A1-0N` with the registry's full ID is a mechanical lookup by name. Every hit below also names the change in prose, so the mapping survives the ID substitution.

---

## 1. Summary matrix

| # | Touchpoint category | Hit? | Evidence (file:line) | Card (short) | Net-state verdict vs `0.1.2-alpha.2` |
|---|---|---|---|---|---|
| 1 | Source patch | **HIT** | `cordis.patch.yml:5-6`, `patch.yml:2-6`, `scripts/apply-patch.mjs:8-9`, `package.json:7` | `A1-01` | Breaks — patch surface no longer honored; also targets a Host path that #5 moves |
| 2 | Internal / persistent events | **HIT** | `src/index.ts:13-22` | `A1-02` | **Survives after folding** — `ignorable` restored in target; contract still a collision point |
| 3 | Service / Remote | **HIT** | `src/index.ts:24-32` (`ctx.get`, `apiProxy.invoke`) | `A1-03` | Breaks — service token / remote method names must be re-resolved |
| 4 | Host directory | **HIT** | `src/index.ts:34-38` | `A1-04` | Breaks — hard-coded `~/.dsh/profiles/default` |
| 5 | UI / commands / tools | **HIT** | `src/index.ts:9-10`, `40-43` | `A1-05` | Breaks — `/internal` subpath import removed by UI decomposition |
| 6 | Custom channel | **HIT (dormant)** | `src/index.ts:45-54` | `A1-06` | Breaks architecturally — bypasses Gateway auth; never invoked at runtime |
| 7 | Subprocess / output parsing | **HIT** | `src/index.ts:56-67`, `scripts/apply-patch.mjs:11-18` | `A1-07` | Breaks — assumes stdout is JSONL; target emits final text |

---

## 2. Touchpoint #1 — Source patch — **HIT** · card `A1-01`

### Hit files / lines

| File | Lines | What is there |
|---|---|---|
| `fixture/cordis.patch.yml` | 1, 5-6 | `patch:` key listing `- patch.yml` — a **plugin-declared source-patch surface** |
| `fixture/patch.yml` | 1-6 | `surface:` → `target: src/session/view/SessionView.ts`, `replacements:` → `find`/`replace` textual rewrite |
| `fixture/scripts/apply-patch.mjs` | 8-9 | `readFileSync('patch.yml', 'utf8')` + `console.log('[legacy] applying patch surface:\n ', surface)` — the applier |
| `fixture/package.json` | 7 | `"apply-patch": "node scripts/apply-patch.mjs"` — wires the applier into the plugin lifecycle |
| `fixture/src/index.ts` | (none) | no direct code, but the patch target path is a Host UI file — see #5 |

### Concrete coupling points

1. **`patch:` declaration key** (`cordis.patch.yml:5`) — the plugin tells the Host "apply these source patches". This is the 0.1.1-era source-patch surface; in the target corridor it is no longer an honored composition key, so the declaration becomes dead configuration at best and a load-time schema error at worst.
2. **Patch surface aimed at Host source, not plugin source** (`patch.yml:3`) — `target: src/session/view/SessionView.ts` is a path inside the **Host/Web-Client** tree, not inside this plugin. The plugin is reaching across the plugin/Host boundary and textually rewriting a Host module.
3. **Symbol-level rewrite of a Host export** (`patch.yml:5-6`) — `find: export function renderSessionView` → `replace: export function renderSessionViewPatched`. Any Host-side rename, move, or signature change to `renderSessionView` silently voids the patch (a `find` that no longer matches is a no-op, not an error).
4. **Out-of-tree Host source root via env var** (`scripts/apply-patch.mjs:5-6`) — `process.env.DSH_HARNESS_SOURCE_ROOT` is required, i.e. the plugin is handed a path into the DSH checkout to patch it. This is the same class of Host-directory coupling as #4, arrived at through an environment variable instead of `homedir()`.
5. **cwd-relative patch read** (`scripts/apply-patch.mjs:8`) — `readFileSync('patch.yml')` resolves against the *process* cwd, not against the plugin root; where the applier is launched from changes what gets patched.
6. **Non-standard manifest filename** (`cordis.patch.yml`) — a second manifest-shaped file whose name collides with the patch concept. If the target corridor treats `*.patch.yml` specially (or if the loader globs manifests), this file can be picked up twice.

### Compound coupling — #1 × #5 (most important interaction in this fixture)

The patch target `src/session/view/SessionView.ts` is *the same module* that touchpoint #5 imports (`@deepseek-ai/dsh-session-view/internal` → `SessionView`). So the two touchpoints are not independent: **#5 removes/moves the module that #1 patches.** After migration the patch surface points at a path that no longer exists, and even if the path survived, the `find` string is anchored to a symbol the decomposition renames. Fixing #5 alone silently voids #1, and fixing #1 alone leaves a patch on a module nothing imports. They must be resolved together, and the correct migration is almost certainly to **drop the patch surface entirely** rather than re-target it.

### Migration consequence

Delete `patch.yml`, the `patch:` key in `cordis.patch.yml`, `scripts/apply-patch.mjs` and the `apply-patch` npm script; replace whatever behaviour the rewrite bought with a supported extension point. Nothing here should be "ported".

---

## 3. Touchpoint #2 — Internal / persistent events — **HIT** · card `A1-02`

### Hit file / lines

`fixture/src/index.ts` lines **13-22** (whole block).

```ts
13:  // #2 Producer of an external informational durable event.
14:  // alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract.
15:  ctx.emit('session/event', {
16:    type: 'legacy/informational-note',
17:    ignorable: true,
18:    payload: { text: 'fixture' },
19:  })
20:  ctx.on('session/event', (event: any /* SessionEvent */) => {
21:    console.log('[legacy] session event:', event.type)
22:  })
```

### Concrete coupling points

1. **Event name** `'session/event'` (`src/index.ts:15`, `:20`) — an internal, persistent bus event, subscribed to and emitted to by name. Both directions are string-coupled to the Host's event registry; a rename or a scoping change in the corridor breaks both silently.
2. **`ignorable: true` marker** (`src/index.ts:17`) — the field the corridor *folds* (see §9). Net state after folding: **the field is present and meaningful in `0.1.2-alpha.2`**, so it must **not** be stripped.
3. **Producer side / persistence contract** (`src/index.ts:15-19`) — an *external* (plugin-originated) event of kind `legacy/informational-note` is being pushed onto what the comment calls a **durable** event. The corridor change is about which external events are persisted vs. dropped; a plugin-originated informational event landing on the durable bus is exactly the shape that changed.
4. **Consumer side, untyped payload** (`src/index.ts:20-22`) — `(event: any /* SessionEvent */)` reads only `event.type`. The comment is a *hint* that the real type is `SessionEvent` but the code deliberately does not import it, so there is no compile-time check that the shape the target emits still matches.
5. **No manifest declaration** — nothing in `cordis.patch.yml` or `package.json` declares that this plugin emits or listens on `session/event`. The coupling exists only in code, so any manifest-driven audit reports "clean" here.

### Net-state verdict

**Collision, but *not* on the `ignorable` field.** See §9 for the folding analysis. The thing that must be re-verified after migration is the **producer/persistence contract** — i.e. whether an external informational event is still accepted on the durable `session/event` bus at all, and whether the consumer still receives every event type or only a filtered subset.

---

## 4. Touchpoint #3 — Internal service / Remote — **HIT** · card `A1-03`

### Hit file / lines

`fixture/src/index.ts` lines **24-32**.

```ts
24:  // #3 Legacy Host APIProxy calls.
25:  ctx.register('rename-session', async ({ id, title }: any) => {
26:    const apiProxy = await ctx.get('apiProxy')
27:    await apiProxy.invoke('session.rename', { id, title })
28:  })
29:  ctx.register('list-providers', async () => {
30:    const apiProxy = await ctx.get('apiProxy')
31:    return apiProxy.invoke('llm.providers')
32:  })
```

### Concrete coupling points

1. **Service token `'apiProxy'` resolved by string** (`src/index.ts:26`, `:30`) — `await ctx.get('apiProxy')` looks the Host API proxy up by a bare string key. In the target corridor the token is renamed/replaced or the service is no longer exposed to plugins at all; `ctx.get` then yields `undefined` and the failure surfaces as `Cannot read properties of undefined (reading 'invoke')` at first use, not at load.
2. **Remote method `'session.rename'`** (`src/index.ts:27`) — a remote method name plus a positional payload `{ id, title }`. Remote method names are part of the Host RPC surface; the corridor re-shapes it, so the name, the argument order, and the return shape all need re-validation.
3. **Remote method `'llm.providers'`** (`src/index.ts:31`) — same class, different service family (LLM providers). Two distinct remote surfaces are coupled in one file.
4. **Un-`await`ed / untyped proxy** (`src/index.ts:26-27`, `:30-31`) — `apiProxy` is `any`; nothing pins the expected shape. There is no way to statically tell which of the two calls the corridor breaks worse.
5. **Both call sites wrapped in `ctx.register`** (`src/index.ts:25`, `:29`) — the failures are deferred into plugin-exposed commands (`rename-session`, `list-providers`), so the breakage is invisible until a user invokes them.

### Net-state verdict

**Breaks.** All three of `'apiProxy'`, `'session.rename'`, `'llm.providers'` must be re-resolved against the target's service/Remote registry before migration. Because the proxy is `any`, this cannot be validated statically — it needs the target package present (see §8).

---

## 5. Touchpoint #4 — Host directory — **HIT** · card `A1-04`

### Hit file / lines

`fixture/src/index.ts` lines **34-38**.

```ts
34:  // #4 Hard-coded Host/profile path.
35:  ctx.register('write-note', async ({ text }: any) => {
36:    const profileDir = join(homedir(), '.dsh', 'profiles', 'default')
37:    writeFileSync(join(profileDir, 'legacy-note.txt'), text)
38:  })
```

### Concrete coupling points

1. **Hard-coded Host profile directory** (`src/index.ts:36`) — `join(homedir(), '.dsh', 'profiles', 'default')`. Four separate assumptions baked into one string: (a) the Host state root is `~/.dsh`; (b) profiles live under `profiles/`; (c) the active profile is literally named `default`; (d) `homedir()` is the right anchor (breaks for a relocated/portable install, a non-standard `HOME`, or a sandboxed Host).
2. **Unconditional write into Host state** (`src/index.ts:37`) — `writeFileSync(...)` with no `mkdirSync(..., {recursive:true})`, no existence check, no error handling. If the directory does not exist (renamed layout, different profile name) the call throws `ENOENT`.
3. **Deferred failure** (`src/index.ts:35`) — the write only happens when the `write-note` command is invoked, so a wrong path is discovered at runtime by the user, not at install time.
4. **Bypasses the Host path-resolution API** — the correct pattern in the target is to ask the Host for the profile directory. The plugin instead reconstructs it, which is precisely what the corridor change invalidates.
5. **Cross-reference to #1** — `scripts/apply-patch.mjs:5-6` does the same thing through `DSH_HARNESS_SOURCE_ROOT`: an env-var-supplied path into the Host tree. Two different mechanisms, one coupling class.

### Net-state verdict

**Breaks.** Replace the hand-built path with the Host-provided profile/state directory resolution; do not "fix" it by renaming the literal, because the literal is the bug.

---

## 6. Touchpoint #5 — UI / commands / tools — **HIT** · card `A1-05`

### Hit file / lines

`fixture/src/index.ts` lines **9-10** and **40-43**.

```ts
 9:  // Touchpoint #5: private Host/Web Client path removed by UI decomposition.
10:  import { SessionView } from '@deepseek-ai/dsh-session-view/internal'
...
40:  // #5 Private UI/command registration.
41:  ctx.contributes.registerCommand('legacy.openView', () => {
42:    return new SessionView({ enhanced: true })
43:  })
```

### Concrete coupling points

1. **Private/internal subpath import** (`src/index.ts:10`) — `@deepseek-ai/dsh-session-view/internal`. The `/internal` suffix is a private, unversioned entry point into the Host/Web-Client package. The corridor's **UI decomposition** removes exactly this kind of private path. This is the single most likely hard failure in the whole plugin: a module-resolution error at import time, which fails *load*, not invocation.
2. **Direct construction of an internal UI component** (`src/index.ts:42`) — `new SessionView({ enhanced: true })`. Even if the module resolved, constructing a Host view object directly from a plugin is not a supported surface; the corridor replaces it with a declarative contribution (slot/registration), and the `enhanced: true` option is an internal flag with no stability guarantee.
3. **Command contribution via `ctx.contributes.registerCommand`** (`src/index.ts:41`) — the command id `'legacy.openView'` and the `contributes` container shape are both part of the contribution surface the decomposition re-shapes (command ids may need a namespace prefix, and `contributes` may be replaced by a manifest `contributes` block).
4. **UI logic inside a command handler** (`src/index.ts:41-43`) — the command handler *returns a view instance*, i.e. the plugin is driving UI directly from a command callback rather than declaring UI. This is the pattern the decomposition is designed to eliminate.
5. **Not declared in `package.json`** — `@deepseek-ai/dsh-session-view` is **not** in the dependency list (`package.json` has no `dependencies` at all). The import is undeclared, so dependency-level audits see nothing, and the resolution depends on whatever happens to be hoisted in the Host's `node_modules`.

### Net-state verdict

**Breaks, at load time.** Combine with §2 (#1 × #5): the patch surface also targets this module.

---

## 7. Touchpoint #6 — Custom channel — **HIT (dormant)** · card `A1-06`

### Hit file / lines

`fixture/src/index.ts` lines **45-54**.

```ts
45:  // #6 Private loopback HTTP bridge that bypasses the Host Gateway authentication model.
46:  // The function is never invoked; the fixture must remain static-only.
47:  function startLegacyBridge() {
48:    const server = createServer((_request, response) => {
49:      response.end('legacy')
50:    })
51:    server.listen(43121, '127.0.0.1') // http://localhost:43121/api/legacy
52:    return server
53:  }
54:  void startLegacyBridge
```

### Concrete coupling points

1. **Raw `node:http` server inside a plugin** (`src/index.ts:4`, `:48`) — `createServer` imported and used to stand up an unauthenticated HTTP listener from plugin code.
2. **Fixed loopback bind, fixed port** (`src/index.ts:51`) — `server.listen(43121, '127.0.0.1')`, with the documented endpoint `http://localhost:43121/api/legacy` on the same line. A hard-coded port collides with any other consumer and is not configurable.
3. **Bypasses the Host Gateway authentication model** (`src/index.ts:45`) — the handler `response.end('legacy')` (`:49`) answers with no auth, no origin check, no token. This is the architectural collision: in the target corridor all plugin↔Host traffic is expected to traverse the Gateway with authentication, and a private side-channel is disallowed by design.
4. **Undocumented, unversioned endpoint** (`src/index.ts:51`) — `/api/legacy` is a private contract; there is no consumer in this fixture, so nothing pins its shape, and nothing in the migration can tell you who depended on it.

### Dormancy caveat — read this before you discount this hit

`startLegacyBridge` is **never called**: line 54 is `void startLegacyBridge`, and line 46 says so explicitly. So:

- A **dynamic/behavioural** scan would report **no hit** for #6. That would be wrong for a migration audit.
- The coupling is real and **static**: the import, the `createServer` call, the fixed port, and the auth-bypassing handler all exist in the source that ships. It fails review/lint/policy checks, and it is one line away from becoming live.
- I am scoring this as **HIT (dormant)** rather than "no hit", precisely because the brief asks for a *static* scan.

### Net-state verdict

**Breaks architecturally.** Delete the bridge; route any external integration through the authenticated Gateway. Do not "port" it to a different port.

---

## 8. Touchpoint #7 — Subprocess / output parsing — **HIT** · card `A1-07`

### Hit file / lines

`fixture/src/index.ts` lines **56-67**; `fixture/scripts/apply-patch.mjs` lines **11-18**.

```ts
56:  // #7 Deliberately wrong wrapper assumption: treats headless stdout as JSONL.
57:  ctx.register('headless-ask', ({ prompt }: any) =>
58:    new Promise((resolve) => {
59:      const child = spawn('dsh', ['--profile', 'headless', prompt])
60:      let result = ''
61:      child.stdout.on('data', (line: Buffer) => {
62:        const event = JSON.parse(line.toString())
63:        if (event.type === 'final') result = event.text
64:      })
65:      child.on('close', () => resolve(result))
66:    })
67:  )
```

```js
11: // Deliberately wrong expectation: target headless stdout is final text, not JSONL.
12: const output = execFileSync('dsh', ['--profile', 'headless', 'ping'], {
13:   encoding: 'utf8',
14: })
15: for (const line of output.split('\n')) {
16:   if (!line.trim()) continue
17:   const event = JSON.parse(line)
18:   if (event.type === 'final') console.log('[legacy] headless ok:', event.text)
19: }
```

### Concrete coupling points

1. **Bare `'dsh'` on `PATH`** (`src/index.ts:59`; `scripts/apply-patch.mjs:12`) — the plugin spawns the Host CLI by name with no version pin, no absolute path, no capability check. Which `dsh` runs, and therefore which output contract applies, is environment-determined.
2. **`--profile headless` as a subprocess contract** (`src/index.ts:59`; `apply-patch.mjs:12`) — the flag name and its semantics are part of the CLI surface the corridor changes.
3. **`JSON.parse` on every stdout chunk** (`src/index.ts:61-62`) — the core breakage. The target's headless stdout is **final text, not JSONL** (`apply-patch.mjs:11` states it outright). `JSON.parse("some final answer")` throws `SyntaxError` on the first chunk, inside a `data` handler with no `try/catch` → an **unhandled `'error'`/exception event on the child process**, which crashes the plugin host rather than rejecting the promise.
4. **`JSON.parse` on every stdout line** (`apply-patch.mjs:15-17`) — identical wrong assumption, in the sync variant. Same crash, no recovery path.
5. **Chunk-boundary bug independent of the format change** (`src/index.ts:61`) — the parameter is named `line` but a `'data'` event carries an arbitrary byte chunk, not a line. Even under a genuine JSONL protocol, a JSON object split across two chunks would fail to parse. This bug exists *regardless* of the corridor, so it must be fixed during migration either way.
6. **`event.type === 'final'` / `event.text`** (`src/index.ts:63`; `apply-patch.mjs:18`) — the code depends on an event envelope (`type`, `text`) that the target does not emit on stdout. The whole envelope is the coupling.
7. **No `stderr` handling, no exit-code check, no timeout** (`src/index.ts:59-65`; `apply-patch.mjs:12`) — `execFileSync` throws on non-zero exit, and the async variant ignores `child.on('error')` entirely. Both wrappers assume success.
8. **Prompt passed as a bare argv element** (`src/index.ts:59`) — `spawn('dsh', ['--profile', 'headless', prompt])` with no array-escaping concerns (`spawn` is safe here) but also no length/validation guard; a very long prompt hits `E2BIG` on some platforms.
9. **`resolve(result)` on `'close'`** (`src/index.ts:65`) — resolves with `''` if no `final` event was ever seen, so a silent failure looks like an empty answer.

### Net-state verdict
**Breaks at runtime, on the first invocation.** Both wrappers must be rewritten to consume final text; while rewriting, also fix the chunk-boundary bug, add `stderr`/exit-code/timeout handling, and stop swallowing failures into an empty string.

---

## 9. Corridor folding — how the folded field must be mapped

The brief's folding rule: *when a field is removed in an intermediate corridor version and restored in the target version, treat it by the final net state.*

This fixture contains exactly one folded field, and it is the trap in this task:

| Field | `0.1.1-rc.2` | intermediate `0.1.2-alpha.1` | target `0.1.2-alpha.2` | Net delta vs `0.1.1-rc.2` |
|---|---|---|---|---|
| `ignorable` on the emitted `session/event` (`src/index.ts:17`) | present | **removed** | **restored** (with the producer/persistence contract) | **none** — field valid in both endpoints |

**How to map it.** Two cards are involved in the corridor: the alpha.1 *removal* of the marker, and the alpha.2 *restoration* of the producer/persistence contract. The naive move is to map `src/index.ts:17` to the removal card and emit "delete `ignorable`" — that is a **false positive** produced by reading an intermediate state as if it were the target. The correct move is to map to the card that describes the **final net state**, i.e. the alpha.2 restoration / producer-persistence contract (`A1-02`), and conclude:

- **Do not remove `ignorable: true`.** It is valid in the target; stripping it would be a regression introduced by the migration.
- **Do not declare the event touchpoint "clean" either.** The field survived, but the *contract around the field* — whether an external, plugin-originated, informational event is still accepted onto the durable `session/event` bus — is what the card actually changed, and that is the part the plugin must re-verify.

So #2 is a **hit on the contract, not on the field**, and it maps to the net-state card (`A1-02`) rather than to the intermediate removal card. Mapping it to *both* cards and reporting both would also be wrong: it double-counts a single net change and implies two migrations where there is one.

---

## 10. Cross-cutting findings

1. **`package.json:3` — `"version": "0.1.1"`** must be bumped as part of the corridor move; it is the only version marker in the fixture and it is the anchor a reviewer will check first.
2. **`package.json` has no `dependencies` at all**, yet `src/index.ts:10` imports `@deepseek-ai/dsh-session-view/internal`. The import is undeclared (see #5) — a dependency-level scan of this plugin reports zero external coupling, which is false.
3. **No manifest declares the plugin's events or services.** `cordis.patch.yml` carries only `id`, `name`, `config: {}`, `patch:`. The `session/event` emit/subscribe (#2) and the `apiProxy` lookups (#3) are invisible to any manifest-driven audit.
4. **Two files reach into the Host tree by different means** — `homedir()/.dsh/profiles/default` (#4) and `DSH_HARNESS_SOURCE_ROOT` (#1). A migration that fixes only one leaves the other.
5. **Three of the seven failures are load-time, four are invoke-time.** Load-time (`src/index.ts:10` internal import; `cordis.patch.yml:5` patch key if the loader validates it) will stop the plugin from starting at all. Invoke-time (#2 consumer, #3 both remote calls, #4 write, #6 dormant, #7 both wrappers) will look fine on install and fail later. Plan the verification accordingly — a smoke test that only loads the plugin will miss four of the seven.
6. **Every `ctx.register` handler defers its failure** (`src/index.ts:25, 29, 35, 41, 57`) — five registered commands, all of them wrapping a corridor collision. None of them fail at activation.
7. **The fixture is deliberately non-compilable** (stated in `fixture/README.md:3`: *"that it cannot be compiled is by design"*). Type-checking therefore cannot be used as evidence for or against any touchpoint; all conclusions here are from reading source text.

---

## 11. No-hit categories, what was ruled out, and why "no hit ≠ no problem"

### 11.1 There are no no-hit categories

All seven categories hit (§1). The requirement to document no-hit categories therefore reduces to documenting **negative findings inside the hit categories** and the residual uncertainty that a static scan cannot close. Both are below.

### 11.2 Explicit negatives (checked, and deliberately *not* scored as hits)

| Checked for | Result | Where I looked | Why it is not a hit |
|---|---|---|---|
| Additional plugin files (other manifests, `cordis.yml`, lockfile, tests, `.dsh/`, hidden files) | **none** | full recursive `-Force` enumeration of `fixture/` | nothing to scan — six files is the whole plugin |
| Declared dependency on `@deepseek-ai/dsh-session-view` | **absent** | `package.json` (whole file, 9 lines) | absence of a declaration is *not* absence of coupling — the import at `src/index.ts:10` is undeclared, so a dependency audit scores #5 as clean while the plugin is broken |
| Manifest declaration of the `session/event` event or the `apiProxy` service | **absent** | `cordis.patch.yml`, `package.json` | the coupling is code-only, so a manifest audit scores #2/#3 as clean |
| The patch target file `src/session/view/SessionView.ts` | **does not exist in the fixture** | `patch.yml:3` vs. the file inventory | a path-existence check scores #1 as "target missing → nothing to patch", when in fact the target lives in the Host tree and is the module #5 imports |
| Runtime effect of the loopback bridge | **none — never invoked** | `src/index.ts:46`, `:54` | a behavioural/dynamic scan scores #6 as clean; the static coupling (import, `createServer`, fixed port, auth-bypassing handler) is real and ships |
| Other `spawn`/`exec` sites, other HTTP listeners, other `writeFileSync` targets, other `homedir()` uses | **none** | grep over the whole fixture for `spawn|execFile|execSync|child_process`, `createServer|listen|http`, `writeFileSync`, `homedir` | confirms the hit lists in #4/#6/#7 are complete, not partial |
| Any reference to `0.1.2`, `alpha`, or a corridor card ID | **only one incidental comment** | grep for `version|0\.1\.1|alpha` → `package.json:3`, `src/index.ts:14` | the fixture contains no corridor/card material of its own; the card mapping in §0.3 is derived from the named changes, not read from a registry |

### 11.3 Why "no hit" could never be read as "no problem" here

1. **A static scan sees text, not resolution.** `ctx.get('apiProxy')` and `apiProxy.invoke('session.rename')` (#3) are strings. Whether the target still exposes that token and that remote method cannot be settled from this fixture; it needs the target package's service registry. A "no hit" on #3 would have meant "I did not find the string", not "the service still exists".
2. **The corridor card registry and the target API surface are outside this task's read scope.** I was forbidden from reading the repository `skills/` tree (which holds the card IDs), `solution/` and `tests/`. So even for the seven hits, the card mapping is by *named change* (§0.3), and the verdicts in §1 are reasoned from the source, not diffed against the target. Symbol-level confirmation is still owed.
3. **Dormant code is still coupling.** `startLegacyBridge` (#6) never runs. A dynamic scan clears it; a migration ships it. Static hits are the only ones that catch this.
4. **Undeclared imports defeat dependency-level audits.** `src/index.ts:10` has no entry in `package.json`. Any tool that reasons about dependencies rather than source reports #5 clean.
5. **Absence of a manifest is not absence of a contract.** No manifest declares the event or service usage (#2/#3). Manifest-driven tooling scores both clean.
6. **Subprocess behaviour is not statically decidable.** #7 depends on the actual `dsh` binary found on `PATH` and the bytes it really writes to stdout. I can prove the *assumption* is wrong (the fixture says so at `apply-patch.mjs:11`), but only execution can prove the fixed version works — and execution is out of scope for this read-only task.
7. **No type-checking is available.** `fixture/README.md:3` states the fixture cannot be compiled by design, so no type-level evidence exists for any category, hit or not.
8. **Failure latency differs per touchpoint.** Three categories fail at load, four at first invocation (§10.5). "No hit" on a load-time category is meaningful; "no hit" on an invoke-time category is nearly worthless, because nothing exercises it until a user does.

---

## 12. What I did not do (scope limits, stated honestly)

- I did **not** read, search or cite the repository `skills/` tree (including `SKILL.md` and card identifiers), `solution/`, `tests/`, the repository root, `benchmark/`, `node_modules/`, or any path outside `fixture/` and `agent-output/`. Consequently the **full `DSH-0.1.x-xx` card IDs are not reproduced here**; §0.3 gives the short form keyed to each named change so the substitution is mechanical.
- I did **not** install, execute, compile, migrate, or publish anything. `scripts/apply-patch.mjs` was read, never run; the loopback bridge was never started; no `dsh` binary was invoked.
- I did **not** modify the fixture. SHA-256 evidence in §0.2; all six mtimes remain `2026-09-03`.
- I did **not** produce a migration plan or patch — this task is the read-only scan only. §2/§4/§6/§7/§8 record *migration consequences*, not edits.

---

## 13. One-line answer

**All seven touchpoints hit.** #1 (`A1-01`, patch surface + the `SessionView.ts` target it shares with #5), #2 (`A1-02`, `session/event` emit/subscribe — hit on the producer/persistence *contract*, **not** on the folded `ignorable` field, which is restored in the target and must be kept), #3 (`A1-03`, `ctx.get('apiProxy')` + `invoke('session.rename'|'llm.providers')`), #4 (`A1-04`, hard-coded `~/.dsh/profiles/default`), #5 (`A1-05`, `@deepseek-ai/dsh-session-view/internal` + `registerCommand`), #6 (`A1-06`, dormant loopback bridge on `127.0.0.1:43121/api/legacy`), #7 (`A1-07`, stdout-as-JSONL in both `src/index.ts:61-63` and `scripts/apply-patch.mjs:15-18`). Three fail at load, four at first use.
