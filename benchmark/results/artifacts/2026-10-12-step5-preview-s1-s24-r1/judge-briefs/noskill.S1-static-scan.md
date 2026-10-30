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
#### FILE: S1-static-scan/touchpoint-report.md

# S1 · Touchpoint Inspection Report — `legacy-plugin` (dsh 0.1.1 era → 0.1.2-alpha.2)

**Mode:** read-only static scan. No file under `fixture/` was created, modified, or deleted; no command in the fixture was executed; nothing was installed or migrated.
**Scope read:** only `fixture/` (task evidence) and this `agent-output/` directory.
**Scan date:** 2026-10-12.

---

## 0. Scope, method, and honest limits

### 0.1 Complete file inventory of the fixture (everything that exists)

```
fixture/
├── README.md               1364 B   benchmark fixture wrapper doc (NOT part of the plugin)
├── package.json             161 B   plugin manifest ("name": "legacy-plugin", "version": "0.1.1")
├── cordis.patch.yml         159 B   cordis composition + source-patch declaration
├── patch.yml                214 B   patch surface definition
├── scripts/
│   └── apply-patch.mjs      752 B   patch applier + headless invocation
└── src/
    └── index.ts            2562 B   single plugin module, `activate(ctx)`
```

No hidden files, no lockfiles, no `node_modules/`, no additional source directories. Six files, two directories. Every line of all six files was read (largest file is 68 lines), so the scan is exhaustive for this package — there is no unscanned material inside the permitted path.

### 0.2 Read-only evidence (hashes recorded before any analysis)

| File | SHA-256 |
|---|---|
| `cordis.patch.yml` | `A9FEAA3EC0F63CEDF8E84416F532B53086A7C4EF508DBC280957E79F16DD9668` |
| `package.json` | `AF1E498CA6F80B65329C7A1DD017D97761391D7032CF7D02F3F44832F920446E` |
| `patch.yml` | `DE622598FC298F54F2F86EE48734C0C615F02BC9BAB6FE9BA234339E6C595B3B` |
| `README.md` | `84B8FD89D9E05ABCC4543381A5C50D81FD0F57344879D8BF560DCF3495E79800` |
| `scripts/apply-patch.mjs` | `4D6744BAF58FE05524BDCF23A5E289A6292E059BB2272342A5A0448E091221F0` |
| `src/index.ts` | `429979274FE9776E22809E0A2725C88C70B7B3127926A8EFCC0E4335D7C086D0` |

`README.md` is the benchmark's own fixture wrapper, not plugin source. It self-documents a seven-touchpoint hit table; I used it **only as corroboration** and re-derived every hit independently from the code. (It also claims to be "a verbatim copy of `skills/plugin-upgrade/examples/legacy-plugin/`" — that path is outside my permitted read scope, so the verbatim claim is **unverified**.)

### 0.3 Limitation you must know about before trusting the card column

**The authoritative 0.1.1-rc.2 → 0.1.2-alpha.2 change-card catalog is not inside my permitted read scope.** My boundary allows only the fixture and the report directory; the corridor changelog/card files are not present in either. I did **not** read them — that would have required touching forbidden paths.

Consequently, section 3 maps each hit to a change by **semantic identity + corridor step**, and labels the card ID as **provisional** (`A1-nn` = a change landed in 0.1.2-alpha.1, `A2-nn` = 0.1.2-alpha.2). Those provisional IDs are ordered by touchpoint category for readability and **must be reconciled against the catalog before you rely on them**. What *is* trustworthy in section 3 is the corridor step (where the fixture itself states it) and the identified coupling point (file + line + code).

### 0.4 General scan limitations

- The fixture is a **static copy that cannot compile by design**; `activate(ctx: any)` and every callback parameter are `any`. Type-level breakage (removed exports, changed signatures) is therefore **invisible to this scan** — I can only see textual coupling.
- This package declares **no dependencies at all** (no `@deepseek-ai/cordis` peer, no `@deepseek-ai/dsh-*` deps) despite importing `@deepseek-ai/dsh-session-view/internal` at `src/index.ts:10`. Dependency drift is thus not detectable from the manifest.
- Transitive coupling (host `cordis.yml`, overlays, other plugins, the harness source the patch rewrites) is outside the 6 files.

---

## 1. Summary — all seven categories hit

| # | Touchpoint category | Hit? | Primary evidence | Corridor step(s) involved | Provisional card |
|---|---|---|---|---|---|
| 1 | Source patch | **YES** | `cordis.patch.yml:5-6`, `patch.yml:2-5`, `scripts/apply-patch.mjs:5-8`, `package.json:6-8` | 0.1.2-alpha.1 (and shares the #5 target module) | `A1-01` |
| 2 | Internal / persistent events | **YES** | `src/index.ts:13-22` | 0.1.2-alpha.1 **and** 0.1.2-alpha.2 (folded) | `A1-02` ⇢ `A2-01` |
| 3 | Internal service / Remote | **YES** | `src/index.ts:24-32` | 0.1.2-alpha.1 | `A1-03` |
| 4 | Host directory | **YES** | `src/index.ts:34-38` | 0.1.2-alpha.1 | `A1-04` |
| 5 | UI / commands / tools | **YES** | `src/index.ts:9-10, 40-43` | 0.1.2-alpha.1 | `A1-05` |
| 6 | Custom channel | **YES** (latent — dead code) | `src/index.ts:45-54` | 0.1.2-alpha.1 | `A1-06` |
| 7 | Subprocess / output parsing | **YES** | `src/index.ts:56-67`, `scripts/apply-patch.mjs:11-18` | 0.1.2-alpha.1 | `A1-07` |

**No category is hit-free.** Requirement 3 of the brief (report the no-hit categories) therefore does not trigger; section 5 nevertheless records the per-category "ruled out" detail, because that is what makes "no hit ⇒ no problem" falsifiable.

---

## 2. Per-category detail

### 2.1 #1 — Source patch — **HIT**

Files/lines:

| File:line | Code | Role |
|---|---|---|
| `cordis.patch.yml:5-6` | `patch:` / `- patch.yml` | plugin requests **source patching** during profile composition |
| `patch.yml:2-5` | `surface:` → `target: src/session/view/SessionView.ts` → `find: export function renderSessionView` / `replace: export function renderSessionViewPatched` | patch surface: a harness **source path** plus a **symbol prefix** to rewrite |
| `scripts/apply-patch.mjs:5-6` | `process.env.DSH_HARNESS_SOURCE_ROOT` … `throw` | harness source root supplied by **environment variable** |
| `scripts/apply-patch.mjs:8` | `readFileSync('patch.yml', 'utf8')` | surface file read **relative to CWD** |
| `scripts/apply-patch.mjs:9` | `console.log('[legacy] applying patch surface:\n ', surface)` | operator-visible effect of applying the patch |
| `package.json:6-8` | `"apply-patch": "node scripts/apply-patch.mjs"` | plugin ships a script that **launches `dsh`** |

Concrete coupling points:

1. **Patch declaration surface in cordis composition.** The plugin relies on a `patch:` key inside its composition file. Any rename, removal, or schema change of that key makes the plugin's composition invalid at load — and per the repository's "misconfiguration fails loud" convention, it fails at load, not at first use.
2. **The patch payload itself.** `patch.yml` names a *file path in the harness source tree* and a *function declaration prefix*. Both are refactor-fragile: the path `src/session/view/SessionView.ts` and the symbol `renderSessionView` are exactly the kind of private Host/Web Client surfaces that the same UI decomposition behind #5 disturbs. A patch whose `find` no longer matches must fail rather than silently no-op.
3. **The patch is a declaration, not an edit, but it is still a source rewrite.** Renaming the exported symbol (`renderSessionView` → `renderSessionViewPatched`) while leaving call sites untouched produces an inconsistent tree — the applier has no verification step (no re-read/compile check after applying).
4. **Environment contract.** `DSH_HARNESS_SOURCE_ROOT` is an external, undocumented-in-fixture variable; the applier hard-fails without it, and there is no default. A corridor change that renames or removes that variable turns a working invocation into an immediate throw.
5. **CWD-relative surface read.** `readFileSync('patch.yml')` only resolves when the CWD is the plugin root; any invocation from elsewhere breaks regardless of the corridor.
6. **A plugin that spawns the `dsh` binary** (`package.json` script + `scripts/apply-patch.mjs:12`) collides with application-launch rules about which entry points are supported — see #7, same call site.

Migration actions (pre-work, do not apply yet): re-resolve `patch:`/patch-layer mechanics at target; re-point `target` and `find` at the target's real path/symbol (expect the session-view module to have moved — see #5); replace the env-var root with a capability-resolved or config-supplied value; anchor the surface read to the module directory instead of CWD.

---

### 2.2 #2 — Internal / persistent events — **HIT**

File/lines: `src/index.ts:13-22`.

```
13:   // #2 Producer of an external informational durable event.
14:   // alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract.
15:   ctx.emit('session/event', {
16:     type: 'legacy/informational-note',
17:     ignorable: true,
18:     payload: { text: 'fixture' },
19:   })
20:   ctx.on('session/event', (event: any /* SessionEvent */) => {
21:     console.log('[legacy] session event:', event.type)
22:   })
```

Concrete coupling points:

1. **Event key `session/event`** (`:15`, `:20`) — both producer and consumer sides are coupled to this key spelling.
2. **Envelope marker `ignorable: true`** (`:17`) — the subject of the corridor fold (see 3.1).
3. **Event type `legacy/informational-note`** (`:16`) — a type that is **not** part of the host's `SessionEventMap`. Under the repository's required-on-read rule, a build that does not know a type refuses the log unless the event carries the envelope's `ignorable: true`. This plugin is precisely on that escape hatch: it is an *external informational* producer whose type is foreign to the host map.
4. **`payload: { text: 'fixture' }`** (`:18`) — payload contents ride the same persistence contract; a payload field the target does not know is only tolerable while the event stays ignorable.
5. **Consumer `ctx.on('session/event', …)`** (`:20-22`) — subscribes to *all* session events and only reads `event.type`; any move of the session-event key breaks the subscription silently (no throw, just no events).

---

### 2.3 #3 — Internal service / Remote — **HIT**

File/lines: `src/index.ts:24-32`.

```
24:   // #3 Legacy Host APIProxy calls.
26:     const apiProxy = await ctx.get('apiProxy')
27:     await apiProxy.invoke('session.rename', { id, title })
30:     const apiProxy = await ctx.get('apiProxy')
31:     return apiProxy.invoke('llm.providers')
```

Concrete coupling points:

1. **Internal service key `'apiProxy'`** (`:26`, `:30`) — an **internal** Host service looked up through `ctx.get`. Internal keys are not public API; their removal is a permitted corridor change and it is exactly the kind of private-surface coupling this category exists to catch.
2. **Async service acquisition** — `await ctx.get(...)`: the plugin assumes the lookup is awaitable and rejects loudly for an unknown key. There is no `try`/`catch`, so removal surfaces as an unhandled rejection inside a registered command.
3. **RPC method name + argument shape `'session.rename', { id, title }`** (`:27`) — method-name and argument coupling on the Remote surface.
4. **RPC method name `'llm.providers'`** (`:31`) — a second method name, called with no arguments; a namespace or rename of the provider listing breaks it independently of the service key.
5. **Registrant side is clean; the coupling is on the callee** — `ctx.register('rename-session' …)` / `ctx.register('list-providers' …)` (`:25`, `:29`) are the plugin's own names and are not themselves at risk. Only the two `apiProxy` call paths are.

Migration action: route both calls through the target's **public** API capability (the BFF/Typert RPC client), re-map the method names and argument shapes, and keep failure handling since a missing service key fails loud at activation.

---

### 2.4 #4 — Host directory — **HIT**

File/lines: `src/index.ts:34-38`.

```
34:   // #4 Hard-coded Host/profile path.
36:     const profileDir = join(homedir(), '.dsh', 'profiles', 'default')
37:     writeFileSync(join(profileDir, 'legacy-note.txt'), text)
```

Concrete coupling points:

1. **State root `'.dsh'`** (`:36`) — assumes the host's state directory name.
2. **Layout `'profiles'` + `'default'`** (`:36`) — assumes the per-profile directory layout *and* the literal profile name `default` (a third, independent assumption hiding inside the same expression).
3. **`homedir()` from `node:os`** (`:5`, `:36`) — home directory resolved by the plugin rather than supplied by the host, so the plugin cannot follow a host that relocates state (platform state dir, `DSH_HOME`-style override, or a different profile name).
4. **`writeFileSync` with no `mkdir`** (`:37`) — assumes the directory already exists and is writable; any layout change turns a working write into `ENOENT`.
5. **Bypasses the filesystem capability/policy** — a direct `node:fs` write ignores whatever fs capability, policy, or sandbox the target installs, which is both a correctness and a permission-surface problem.

Migration action: resolve the profile directory from the host (fs/settings capability) or an explicit validated `Config` field, create the directory if absent, and route writes through the fs capability. Note that the repository convention "no hardcoded tunables in plugins / misconfiguration fails loud" makes the current literal `default` a convention violation in its own right, independent of the corridor.

---

### 2.5 #5 — UI / commands / tools — **HIT**

File/lines: `src/index.ts:9-10` and `src/index.ts:40-43`.

```
 9:  // Touchpoint #5: private Host/Web Client path removed by UI decomposition.
10:  import { SessionView } from '@deepseek-ai/dsh-session-view/internal'
41:   ctx.contributes.registerCommand('legacy.openView', () => {
42:     return new SessionView({ enhanced: true })
43:   })
```

Concrete coupling points:

1. **Private subpath import `@deepseek-ai/dsh-session-view/internal`** (`:10`) — a `/internal` subpath export. The fixture states this private Host/Web Client path was **removed by UI decomposition**, so the import cannot resolve at the target. This is the single clearest hard break in the whole scan: it fails at module resolution, before any runtime logic.
2. **Private component construction `new SessionView({ enhanced: true })`** (`:42`) — depends on a non-public component constructor and an undocumented option (`enhanced`), so even a re-exported module would not guarantee the same options.
3. **`ctx.contributes.registerCommand('legacy.openView', …)`** (`:41`) — command contribution through `ctx.contributes`. The contribution site is coupled to wherever the target keeps command registration; the command id `legacy.openView` is the plugin's own and is not itself at risk.
4. **No tool registration anywhere** — the scan found no `ctx.tool`/tool contribution in this package; the category hits on UI + commands only. (Listed explicitly here so the negative half of this category is auditable.)
5. **Interaction with #1** — `patch.yml:3` rewrites `src/session/view/SessionView.ts`, i.e. **the patch target and the imported module are the same session-view surface**. These two touchpoints collapse together: if the module moved, the patch has nothing to patch and the import has nothing to import.

Migration action: drop the `/internal` import; determine the target's public UI surface (or delete the UI command); re-locate command registration to the target's contribution API.

---

### 2.6 #6 — Custom channel — **HIT (latent)**

File/lines: `src/index.ts:45-54`.

```
45:  // #6 Private loopback HTTP bridge that bypasses the Host Gateway authentication model.
47:   function startLegacyBridge() {
48:     const server = createServer((_request, response) => {
49:       response.end('legacy')
50:     })
51:     server.listen(43121, '127.0.0.1') // http://localhost:43121/api/legacy
54:   void startLegacyBridge
```

Concrete coupling points:

1. **A raw `node:http` listener** (`:4` import, `:48` `createServer`) — an application-level channel outside any harness transport.
2. **Hardcoded loopback port `43121`** (`:51`) — fixed port, no configuration, no collision handling.
3. **Ad-hoc route namespace `/api/legacy`** (`:51` comment) — a private RPC-ish route that bypasses the **Host Gateway authentication model**, per the fixture's own comment.
4. **Dead code today** (`:46` "never invoked", `:54` `void startLegacyBridge`) — the collision is **potential, not active**: nothing in the fixture serves or dials this port.

Honest classification: this is a **positive hit on the touchpoint** (a custom channel exists in the source and collides with the gateway/transport model if it is ever wired), but the *runtime* risk is zero in the static copy. Do not downgrade it to "no problem" — the moment anyone un-doors `startLegacyBridge` the plugin is outside the authenticated transport, and the port is fixed.

Migration action: route any cross-process call through the Gateway/transport; if a listener is genuinely required, make the port a validated `Config` field and confirm the target still permits non-gateway listeners.

---

### 2.7 #7 — Subprocess / output parsing — **HIT (two independent copies)**

File/lines: `src/index.ts:56-67` and `scripts/apply-patch.mjs:11-18`.

```
57:   ctx.register('headless-ask', ({ prompt }: any) =>
59:       const child = spawn('dsh', ['--profile', 'headless', prompt])
61:       child.stdout.on('data', (line: Buffer) => {
62:         const event = JSON.parse(line.toString())
63:         if (event.type === 'final') result = event.text
65:       child.on('close', () => resolve(result))
```

```
11:  // Deliberately wrong expectation: target headless stdout is final text, not JSONL.
12:  const output = execFileSync('dsh', ['--profile', 'headless', 'ping'], {
15:  for (const line of output.split('\n')) {
17:     const event = JSON.parse(line)
18:     if (event.type === 'final') console.log('[legacy] headless ok:', event.text)
```

Concrete coupling points:

1. **Binary + argv surface** (`src/index.ts:59`, `scripts/apply-patch.mjs:12`) — `dsh` resolved from `PATH`, invoked as `dsh --profile headless <prompt>`. The argv surface is contract, not convenience: flag spellings, the meaning of a bare prompt argument, and the set of supported launch entry points can all change inside a corridor, and a plugin has no compile-time link to them.
2. **Output-format assumption: stdout is JSONL** (`src/index.ts:62-63`, `scripts/apply-patch.mjs:15-18`) — both copies parse each line as JSON and look for `{ type: 'final', text }`. The fixture states the target headless stdout is **final text**, not JSONL. So `JSON.parse` throws on the first ordinary text line: in the async copy (`src/index.ts:62`) it throws inside a `data` handler and the promise never resolves/rejects (a hang); in the sync copy (`scripts/apply-patch.mjs:17`) it throws and aborts the script.
3. **Chunk ≠ line** (`src/index.ts:61`) — `data` events deliver arbitrary chunks; parsing each chunk as one complete line is wrong even under a real line protocol. A correct parser must buffer and split on newlines.
4. **Error swallowing** (`src/index.ts:60-66`) — no `error` listener, no exit-code check, no `JSON.parse` guard; `resolve(result)` fires with an empty string on any failure. Silent wrong answers are worse than crashes.
5. **Duplication across surfaces** — the same wrong assumption is implemented twice (async `spawn` and sync `execFileSync`), so the corridor change must be fixed in two places, not one.

Migration action: consume headless output as final text (or via the supported SDK/session-log projection instead of scraping stdout), buffer-then-split if a line protocol is used, handle non-zero exits and parse failures explicitly, and drop the assumption that `dsh` is on `PATH` in favour of a resolved, supported entry point.

---

## 3. Change-card mapping (0.1.1-rc.2 → 0.1.2-alpha.2)

> **Provisional IDs.** `A1-nn` = change landed in **0.1.2-alpha.1**; `A2-nn` = change landed in **0.1.2-alpha.2**. The authoritative catalog is outside my permitted read scope (see 0.3), so these labels stand in for the real IDs; the *corridor step* and the *coupling point* columns are what you should trust and re-key against the catalog. "Evidence" says whether the fixture itself states the corridor version.

| # | Coupling point (evidence) | Semantic change it collides with | Corridor step | Provisional card | Evidence strength |
|---|---|---|---|---|---|
| 1 | `patch:` declaration in cordis composition (`cordis.patch.yml:5-6`) | inline source patching in profile composition is no longer the supported mechanism (patch layers ship as installable bundles) | 0.1.2-alpha.1 | `A1-01` | Medium — key is observed; its fate at target is inferred |
| 1 | patch payload targeting `src/session/view/SessionView.ts` / `renderSessionView` (`patch.yml:3,5`) | the session-view surface the patch rewrites moved/was removed by the same UI decomposition that hit #5 | 0.1.2-alpha.1 | `A1-01` (shared with `A1-05`) | Medium-High — target module is corroborated by `src/index.ts:9` |
| 1 | `DSH_HARNESS_SOURCE_ROOT` env contract (`scripts/apply-patch.mjs:5-6`) | harness source-root resolution no longer supplied by that variable | 0.1.2-alpha.1 | `A1-01` | Low-Medium — variable observed; no statement about its fate |
| 2 | `ignorable: true` envelope marker (`src/index.ts:17`) | **see 3.1 — folded** | alpha.1 removed ⇢ alpha.2 restored | `A1-02` ⇢ `A2-01` | **High** — fixture states both steps at `src/index.ts:14` |
| 2 | `session/event` key, foreign event type, payload (`src/index.ts:15-22`) | required-on-read session-event contract: unknown types are refused unless the envelope carries `ignorable` | 0.1.2-alpha.1 (constraint in force through alpha.2) | `A1-02` | Medium — mechanism is documented in the fixture's comments; exact key/payload policy at target unverified |
| 3 | internal service key `'apiProxy'` (`src/index.ts:26,30`) | internal Host `apiProxy` service removed; callers move to the public API capability (BFF/Typert RPC client) | 0.1.2-alpha.1 | `A1-03` | Medium — internal-key coupling observed; replacement named by convention, not by evidence |
| 3 | RPC method names `'session.rename'`, `'llm.providers'` (`src/index.ts:27,31`) | method-name/namespace changes on the Remote surface that accompany the service swap | 0.1.2-alpha.1 | `A1-03` | Medium |
| 4 | `~/.dsh/profiles/default` layout + `homedir()` (`src/index.ts:36`) | host state directory / profile directory layout relocation | 0.1.2-alpha.1 | `A1-04` | Medium — hardcoded path observed and flagged by the fixture; the specific relocation is inferred |
| 4 | direct `node:fs` write bypassing fs capability/policy (`src/index.ts:37`) | host directory access expected through the fs capability/policy rather than raw writes | 0.1.2-alpha.1 | `A1-04` | Medium |
| 5 | `@deepseek-ai/dsh-session-view/internal` (`src/index.ts:10`) | private Host/Web Client UI path removed by UI decomposition | 0.1.2-alpha.1 | `A1-05` | **High** — fixture states the removal at `src/index.ts:9` |
| 5 | `ctx.contributes.registerCommand` (`src/index.ts:41`) | command-contribution API relocation | 0.1.2-alpha.1 | `A1-05` | Low-Medium — assumption about the contribution site, not stated by the fixture |
| 6 | loopback HTTP `/api/legacy` (`src/index.ts:45-54`) | custom channels must use the authenticated Host Gateway transport; raw listeners bypass it | 0.1.2-alpha.1 | `A1-06` | Medium — gateway-auth model stated at `src/index.ts:45`; the prohibition is inferred |
| 7 | headless stdout parsed as JSONL (`src/index.ts:59-63`; `scripts/apply-patch.mjs:12-18`) | headless output contract: stdout is final text, not a JSONL event stream | 0.1.2-alpha.1 | `A1-07` | **High** — fixture states the expectation is wrong at both call sites |
| 7 | `spawn`/`execFileSync` argv surface + PATH resolution (`src/index.ts:59`; `scripts/apply-patch.mjs:12`) | supported application-launch entry points narrow (package bins and argv escapes are not supported launch surfaces) | 0.1.2-alpha.1 | `A1-07` | Medium |

### 3.1 Corridor folding — the `ignorable` envelope marker

The important case, and the reason requirement 2 asks you to *think* rather than tally:

- **0.1.2-alpha.1** removed the `ignorable` marker from the session-event envelope (`A1-02`).
- **0.1.2-alpha.2** restored the producer/persistence contract, i.e. the marker is back (`A2-01`).
- **Net state from 0.1.1-rc.2 to 0.1.2-alpha.2: unchanged.** The field the plugin sets at `src/index.ts:17` exists at the target with the same role.

How to map it:

1. **Map the touchpoint to the last word in the corridor — `A2-01` (alpha.2 restoration)** — and treat `A1-02` (alpha.1 removal) as *folded/superseded*, not as a pending migration. Counting both as work would double-count a change whose net effect is zero.
2. **Do not conclude "no action".** The touchpoint still hits, for three reasons: (a) the field's validity is *corridor-version-dependent* — the identical source line is invalid at alpha.1 and valid at alpha.2, so the corridor is non-monotone and "compiles at target" is not evidence of a clean path; (b) the foreign event type `legacy/informational-note` sits on the required-on-read escape hatch, which is the mechanism alpha.2 restored, so the plugin's correctness is *defined* by that contract; (c) a restored contract need not be byte-identical to the removed one in every adjacent detail (naming, envelope placement, or which consumers see it) — that is the one thing to verify against the alpha.2 card rather than assume.
3. **Action:** keep `ignorable: true`, keep the event type foreign-but-ignorable, and pin the build to the target. If the corridor must be traversable, the emit needs a version guard rather than a rewrite — but since the migration target is alpha.2 itself, the practical answer is "no code change; verify the restored envelope's exact shape against `A2-01`".

### 3.2 Corridor steps I could and could not resolve

The corridor as briefed runs **0.1.1-rc.2 → 0.1.2-alpha.2**. The fixture evidence names two intermediate steps — **0.1.2-alpha.1** and **0.1.2-alpha.2** — so all "removed/renamed" changes above are attributed to alpha.1, and the one restoration to alpha.2. Whether a **0.1.1 final** step sits between rc.2 and alpha.1 (and carries its own cards) **cannot be determined from the fixture**; treat the alpha.1 attributions as "landed at or before alpha.1" until the catalog is checked.

---

## 4. Migration pre-work, ordered by risk

1. **#5 + #1 (combined, first):** the `/internal` session-view import cannot resolve, and the patch that rewrites that same module has nothing to rewrite. Resolve the target's session-view surface before anything else; both touchpoints collapse into one decision.
2. **#3:** replace both `apiProxy` call paths with the public API capability and re-map `session.rename` / `llm.providers`. Fails loud at activation, so it will not linger silently.
3. **#7 (two sites):** stop treating headless stdout as JSONL; treat it as final text; buffer chunks; handle exit codes and parse errors. Fix both copies in the same change.
4. **#4:** resolve the profile directory from the host or a validated `Config` field; stop hardcoding `default`; create the directory; use the fs capability.
5. **#6:** decide whether the loopback bridge survives at all. If yes, make the port configurable and route it through the Gateway transport.
6. **#2:** keep `ignorable: true`; verify the restored envelope's exact shape against the alpha.2 card; confirm the `session/event` key and payload shape still match.

---

## 5. Requirement 3 — no-hit categories, ruled-out coverage, and the fallacy

**No category is hit-free, so there is nothing to report under the brief's no-hit branch.** Recording what was ruled out *inside* each hit category, because that is the audit trail that makes the positives falsifiable:

| # | Ruled out (searched, absent) |
|---|---|
| 1 | No plugin self-patching (`src/index.ts` has no patch logic), no inline source string surgery, no `patch:` usage in `src/index.ts`; the entire patch mechanism is declarative (2 files) + one applier script |
| 2 | No `SessionEventMap` declaration merging in the fixture, no `@mode`/`@param` event JSDoc, no version-gated emit, no `ignorable` on any other event |
| 3 | No Remote/BFF client import, no `ctx.get` on any other service key, no worker/provider registration |
| 4 | No use of an fs capability, no settings read, no config field, no `mkdir`; the only host-path handling is the single `homedir()` join |
| 5 | No tool registration, no presenter/card UI, no `ctx.tool`, no UI dictionary/locale call — only one import and one `registerCommand` |
| 6 | No Gateway usage, no transport client, no auth handling, no other listener or port |
| 7 | No stdout buffering, no exit-code handling, no `error` listener, no SDK/spawn wrapper — only the two raw invocations |

**Why "no hit" could never be read as "no problem" here:**

1. **A negative is bounded by the scan's input, not by the target.** I scanned 6 files / ~140 lines of plugin-owned source. Absence of a textual pattern in those files says nothing about coupling carried by the host `cordis.yml`, overlays, sibling plugins, the harness source the patch rewrites, or the plugin's (entirely absent) dependency manifest.
2. **This fixture cannot be type-checked** (`ctx: any`, no dependencies, deliberately non-compilable), so every *type-level* break — a removed export, a changed signature, a narrowed payload — is categorically invisible to a textual scan. A category can read "no hit" purely because the types were erased.
3. **Dynamic coupling defeats static matching.** `ctx.get(key)` with a computed key, self-modification/mount-time plugin behavior, runtime registries, and indirect or lazily evaluated providers would all pass a grep-based scan untouched. `patch.yml` is itself the extreme case: a *string* that only collides when it is applied to the target tree, i.e. the collision is determined by a file outside the fixture.
4. **Dead code inverts the risk without changing the hit.** `startLegacyBridge` (`src/index.ts:47-54`) is never invoked, so a runtime-only assessment would score #6 as safe; a touchpoint scan correctly scores it as a hit. The converse also holds: a live-looking pattern can be a false positive if the symbol is coincidental.
5. **Environment-dependent behavior is neither hit nor no-hit.** `DSH_HARNESS_SOURCE_ROOT` (`scripts/apply-patch.mjs:5`) and the PATH-resolved `dsh` (`src/index.ts:59`) make correctness depend on state I cannot observe from the fixture.

So the correct reading of any "no hit" would be: **"no evidence in these 6 files at this scan's resolution"** — never "safe to migrate".

---

## 6. Blockers and open items (stated honestly, per the brief)

1. **Change-card catalog not readable in scope (blocking for exact IDs).** The authoritative 0.1.1-rc.2 → 0.1.2-alpha.2 card list lives outside my two permitted paths, so section 3's card IDs are provisional labels keyed by corridor step and coupling point. Reconcile `A1-01…A1-07` / `A2-01` against the catalog before quoting them anywhere.
2. **Unverified corridor assumptions.** Whether 0.1.1 final is a distinct corridor step; whether the `session/event` key spelling, the `apiProxy` replacement surface, and the host state-directory layout are as inferred at the target.
3. **Fixture wrapper claims I could not verify.** `README.md` asserts a verbatim copy of a path under the repository's `skills/` tree; out of scope, so unverified. It is also not part of the plugin's shipped source.
4. **Not executed, not published.** No migration, install, build, or fixture execution was performed. The fixture's own hashes (0.2) are the read-only evidence; the fixture directory was not written to at any point.

---

*Prepared by: S1 static touchpoint scan (read-only). Report written to `agent-output/S1-static-scan/touchpoint-report.md`.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.