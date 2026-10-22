# S1 · Static Touchpoint Scan — `legacy-plugin` (read-only, no source changes)

| | |
|---|---|
| **Task** | S1-static-scan · pre-migration touchpoint inspection of a legacy plugin |
| **Mode** | plugin-upgrade **Mode A · inspect** (read-only investigation and report; then stop) |
| **Subject** | `fixture/` — static copy of a dsh 0.1.1-era plugin, declared non-executable by its own README |
| **Host corridor** | `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` |
| **Result** | **7 / 7 touchpoint classes HIT.** No class is a zero-hit class. |
| **Fixture status** | **Unmodified.** 6 files, all mtimes still 2026-09-03T10:21:09Z; SHA-256 recorded in Appendix B |
| **Deliverable** | this file (the report is the deliverable; nothing under `fixture/` was touched) |

---

## 0. Scope, method, and read-only discipline

### 0.1 What was scanned (complete inventory — 6 files, 0 excluded)

| File | Size | Role |
|---|---:|---|
| `fixture/package.json` | 161 B | plugin manifest (name `legacy-plugin`, version `0.1.1`, `type: module`, one script) |
| `fixture/cordis.patch.yml` | 159 B | profile composition row + `patch:` list |
| `fixture/patch.yml` | 214 B | patch-surface declaration (target + replacements) |
| `fixture/scripts/apply-patch.mjs` | 752 B | patch applier + headless wrapper |
| `fixture/src/index.ts` | 2562 B | plugin entry (`activate(ctx)`) — carries #2…#7 |
| `fixture/README.md` | 1364 B | prose (read manually; treated as **non-evidence**, see 0.3) |

There is no `node_modules/`, no lockfile, no `dsh-plugin.json`, no `tests/`, no CI config, no `.git/` inside the fixture, so nothing had to be excluded from the scan. Every file above was read in full, line by line.

### 0.2 Method

1. Read the full corridor (see §1) and the seven-class pattern set `references/pre-flight-patterns.json`.
2. Ran all 14 regex patterns from `pre-flight-patterns.json` against all 6 files and recorded **file:line** for every match (Appendix A).
3. Ran the read-only planner and the read-only linter shipped with the skill, as an independent cross-check:
   - `node skills/plugin-upgrade/scripts/plan-migration.mjs --root <fixture> --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2` → "Scanned files: 5" (Markdown skipped by design), **all seven classes `detected`**, hit locations identical to my manual pass.
   - `node skills/plugin-upgrade/scripts/inject-lint.mjs <fixture>` → `verdict: FIX-REQUIRED` (driven by `cordisPeer: null` / `cordisOk: false`, i.e. the manifest declares **no** peer/dependency block at all — see §6.1).
   Both scripts are documented as read-only ("never writes the target repository and has no output-file option" / "read-only"). Neither wrote anything; the only directory created in this whole session is `agent-output/S1-static-scan/`.
4. Narrowed the planner's card list (it returns *every* card intersecting a detected touchpoint) down to the cards that intersect the **actual coupling points** found, per SKILL.md Mode C step 4 ("Keep only cards that intersect the hit touchpoints and the actual face").

### 0.3 Read-only discipline

* No file under `fixture/` was created, edited, moved, or deleted. Only `readFile`/`readdir`/`stat` and hash computation were used on it.
* No migration, install, build, typecheck, or plugin execution was performed. The two skill scripts that were run are the two explicitly documented as read-only; `verify-runtime.mjs` (NOT read-only, installs and cold-boots) was **not** run.
* `fixture/README.md` contains a "Hit location" table that matches my findings. I did **not** rely on it: the planner deliberately skips Markdown ("prose about a touchpoint is not a touchpoint"), and every finding below is independently derived from source lines.
* All paths outside `fixture/`, `agent-output/`, and `skills/plugin-upgrade/` were left untouched and unlisted.

---

## 1. Version corridor, folding, and what is *not* in scope

### 1.1 Corridor used

Built by `from → to` metadata in `references/README.md`, **not** by filename order:

| Edge | Card file | Cards | ID prefix |
|---|---|---:|---|
| `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` | `references/v0.1.2-alpha.1.md` | 28 | `DSH-0.1.2-A1` |
| `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2` | `references/v0.1.2-alpha.2.md` | 8 | `DSH-0.1.2-A2` |

Non-card corridor material also read (these carry recipes that no single card states):
`references/api-migration-0.1.2-alpha.2.md` (API-01…API-10, CFG-01 — the exact rc.2→alpha.2 interface ledger) and
`references/rollup-0.1.2.md` (R-01…R-13 — corridor-level increments: cross-cohort coexistence, unpublished-cohort install, baseline attribution, boot-race retry, type-export drift, install-channel pitfalls).

Card IDs below are given in full (`DSH-0.1.2-A1-01`); the short form (`A1-01`) is used inside tables. Both denote the same card.

### 1.2 Corridor folding — the rule, and the one live case

`references/README.md` and `rollup-0.1.2.md` both state the rule: **read the full corridor and compute the final net state before touching source; if a field is removed in an intermediate version and restored in the target, do not delete and re-add it.**

Mapping consequence used throughout this report:

* A hit is mapped to the card that describes its **net state at the target tag** (alpha.2), not to the intermediate card that first introduced the change.
* An intermediate card is still cited, but only as (a) the origin of the change, and (b) a conditional that matters **only if the plugin must also run on that intermediate tag** (cross-cohort coexistence, rollup R-02).

**The one live folding case in this fixture is `SessionEvent.ignorable` (#2)** — `DSH-0.1.2-A1-02` removed it in alpha.1, `DSH-0.1.2-A2-01` restored it in alpha.2. Full analysis in §4.

### 1.3 Deliberately out of scope

| Item | Why |
|---|---|
| `references/v0.1.1-rc.2.md` (3 cards, `DSH-0.1.1-R2-01…03`, all touchpoint #5, image/`read_image` related) | Its edge is `rc.1 → rc.2`, i.e. **before** the corridor's `from` tag. Not part of `0.1.1-rc.2 → 0.1.2-alpha.2`. (Independently: the fixture contains no image, attachment, or `read_image` code, so nothing here would hit those cards anyway.) |
| `references/v0.1.1-rc.1.md` (order 0, `rc.8 → rc.1`) | Same reason — before `from`. Note for later: that set contains the "strict inject + weak `ctx.get`" card, which is relevant hygiene for `src/index.ts:26,30` but is **not** a corridor card for this migration. |
| `package.json` `"version": "0.1.1"` | This is the **plugin's own release version**, not the host corridor (SKILL.md shared-preparation step 2). It does not move the corridor. |
| `v0.1.2-alpha.3`…`v0.2.0-rc.1`, `jump-*` | After the target tag. Listed only where a card explains a mechanism used here (none do). |
| pre-flight §1.5 ghost-host check | Not applicable: there is no running host process and no checkout to interrogate in this container. The corridor's `from` is pinned by the task statement, not read off disk. |

---

## 2. Summary table (all seven classes hit)

| # | Touchpoint | Hit? | Files / lines | Concrete coupling points | Cards (net state at alpha.2) | Action level |
|---|---|---|---|---|---|---|
| 1 | Source patch / monkey patch | **HIT** | `patch.yml:1-6`; `scripts/apply-patch.mjs:5-6,8-9`; `cordis.patch.yml:5-6` (composition, negative control) | patch surface rewrites host source `src/session/view/SessionView.ts`; applier keyed on `DSH_HARNESS_SOURCE_ROOT` + cwd-relative `patch.yml` | **A1-03**; API-07 (for the sibling `/internal` import) | required-if-hit |
| 2 | Internal / persistent events | **HIT** | `src/index.ts:13-22` (producer 15-19, observer 20-22) | producer emits third-party persisted `session/event` carrying `ignorable: true`; plain observer logs `event.type` | **A2-01** (net) + **A1-02** (intermediate only) + API-05 residual gap | required-if-hit (A2-01); required-if-target-is-alpha.1 (A1-02) |
| 3 | Service probes / Remote | **HIT** | `src/index.ts:24-32` | `ctx.get('apiProxy')` → `apiProxy.invoke('session.rename')`, `apiProxy.invoke('llm.providers')`; host-plane face | **A1-01** + **API-01**; A2-02 only after migration; A2-08 composition-conditional | required-if-hit |
| 4 | Host directory read/write | **HIT** | `src/index.ts:5,7,34-38` | `join(homedir(),'.dsh','profiles','default')` + `writeFileSync` into the profile dir | **A1-04**; A2-06 client-plane only; A1-13 conditional | required-if-hit |
| 5 | Internal UI / commands / tools | **HIT** | `src/index.ts:9-10, 40-43` | `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`; `ctx.contributes.registerCommand('legacy.openView', …)` + `new SessionView({enhanced:true})` | **A1-03** + **API-07**; A1-26 / API-10 ruled out | required-if-hit |
| 6 | Custom channel | **HIT** | `src/index.ts:4, 45-54` | private loopback HTTP server, fixed port 43121, `/api/legacy`, outside the Connection auth gate, no teardown | **A1-08** (+ precision-checklist "Channel auth joins the host gate"); A1-19 / A1-28 ruled out | required-if-hit |
| 7 | Subprocess / output parsing | **HIT** | `src/index.ts:8, 56-67`; `scripts/apply-patch.mjs:3, 11-19` | `spawn/execFileSync('dsh', ['--profile','headless', …])` then `JSON.parse` per stdout chunk/line expecting `{type:'final', text}`; exit code and stderr ignored | **A1-05** + **API-06**; A1-04 (bins) / A2-04 / A1-13 conditional | required-if-hit |

---

## 3. Per-touchpoint detail

### #1 · Source patch / monkey patch — **HIT**

**Evidence**

* `patch.yml:1-6` — a patch **surface** declaration, i.e. a real source replacement, not a Loader overlay:
  * `target: src/session/view/SessionView.ts`
  * `find: export function renderSessionView` → `replace: export function renderSessionViewPatched`
* `scripts/apply-patch.mjs:5-6` — the applier is gated on `DSH_HARNESS_SOURCE_ROOT` and throws without it; `:8-9` reads `patch.yml` **relative to the process cwd** and echoes the surface to stdout.
* `cordis.patch.yml:5-6` — the profile composition row lists `patch.yml` under `patch:`.

**Classification discipline (this is where a naive scanner goes wrong)**

* `cordis.patch.yml` matches the `patch\.yml` pattern, but per **API-08** it is the **official Loader composition overlay** for a Profile/Bundle — a *negative control* for this class, not a hit. Its row id `legacy-plugin` and `name: legacy-plugin` agree with `package.json#name`, so there is no id-mismatch problem either (A1-26 not hit).
* The genuine #1 coupling is the **file that `cordis.patch.yml` points at**: `patch.yml` carries `surface.target`/`replacements`, i.e. it rewrites host source text. That is the class-#1 entry condition (API-08 best practice 2: "only enter the 'source patch' migration when there is evidence such as a real diff … a replaced host implementation").

**Cards**

* **DSH-0.1.2-A1-03 · Session view internals split up extensively** (breaking, required-if-hit, touchpoints #1+#5) — "Patch target paths, internal imports, or UI registration points no longer work." Recipe: check the host paths one by one against an **exact-tag compare**; rebuild imports by owning module; mark capabilities with no stable public seam as *pending confirmation* — **do not guess new paths**. Verification is exactly this fixture's shape: "Run a patch-surface composition against the target tag source; every old target must map to a target-version file or state an explicit removal reason." Field note: dsh-tui points `DSH_HARNESS_SOURCE_ROOT` at the target tag and validates each patch-surface path by composition — the same mechanism `apply-patch.mjs` uses.
* **API-07 · Package export ≠ artifact presence** — the companion ledger item for the sibling deep-subpath import in this same plugin (`src/index.ts:10`, see #5): a subpath that resolves in a source checkout may not exist in the published tarball. Evidence order: packed artifact → `exports`/`files` at the target tag → implementation/tests → release notes.

**Net-state / folding note** — no folding involved. `A1-03` is a straight break in both alpha.1 and alpha.2; there is no "removed then restored" pair for the session-view internals.

**What this means for the migration** — the patch target `src/session/view/SessionView.ts` and the semantic marker `export function renderSessionView` must be revalidated against `dsh-v0.1.2-alpha.2` source. If the owning module no longer exists at that path, the row is *upstreamed-remove / obsolete* and must not be silently re-based onto a guessed path (pre-flight #1). Status: **pending confirmation against the exact tag** — this scan cannot resolve it, because the fixture contains no copy of host source.

---

### #2 · Internal event names and persistent events — **HIT**

**Evidence** — `src/index.ts:13-22`

* **Producer role** (15-19): `ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })` — a third-party informational event intended to be **durable/persisted**, carrying the `ignorable` marker.
* **Plain observer role** (20-22): `ctx.on('session/event', (event) => console.log(… event.type))` — reads only `event.type`; no content, no timeline, no node reads.

pre-flight #2 requires distinguishing producer / persistence / reload / transport / plain observer. This fixture is **producer + plain observer**; it owns no persistence, reload, or transport seam.

**Cards**

* **DSH-0.1.2-A2-01 · Restore `SessionEvent.ignorable` for third-party persisted events** (fix, required-if-hit, touchpoint #2) — the **net-state card at the target tag**. alpha.2 restores retention of the marker across envelope/persistence/reload/transport; JSONL, SQLite, API transports and the generated catalog must preserve it as-is; unknown events **without** the marker remain required-on-read (fail closed).
* **DSH-0.1.2-A1-02 · `SessionEvent.ignorable` temporarily removed** (breaking, **required-if-target-is-alpha.1**) — the intermediate card. It applies only if the plugin must also run on alpha.1; see §4 for why it must **not** drive a source edit here.
* **API-05 · `ignorable` is restored, but the third-party write surface is still incomplete** — the residual gap that survives the folding: what alpha.2 restores is the **envelope/retention** semantics; the public live `Session.append(...)` still accepts only `type`, `data`, `SurfaceIntent` and cannot write `ignorable`. So an out-of-repo custom type can live-append fine and then be **refused on cold load** — "a silent write / loud read that one live smoke cannot catch."

**Ruled out inside this class**

* `tool/code-dispatch` / `tools-code-mode` / `connection/reset` (pattern 2) — **no match** in any file. Therefore **A1-06 (Code Mode → PTC rename)** is not hit.
* **A1-14** (optional incremental upload of DeepSeek session logs) — no `session-log-deepseek` coupling in the fixture; deployment-level, not a plugin-code hit.
* **A1-27** (session content reads via the SessionBinding durable event window) — the observer never reads conversation nodes / user message content, so not hit. *Conditional for later:* if the observer is extended to read content, A1-27 becomes the governing card.

**Net-state / folding note** — see §4 (the canonical case).

---

### #3 · Internal service probes / Remote — **HIT**

**Evidence** — `src/index.ts:24-32`

| Line | Call |
|---|---|
| 25-28 | `ctx.register('rename-session', …)` → `const apiProxy = await ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', { id, title })` |
| 29-32 | `ctx.register('list-providers', …)` → `ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')` |

**Coupling points**

1. The service key `apiProxy` (rc.2 type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`) is **deleted** in alpha.1.
2. The **wire names** `session.rename` and `llm.providers` are old rpc-map keys, not alpha.2 Remote paths.
3. Both call sites use **weak** `ctx.get(...)` with no `inject` declaration, so a missing service resolves to a runtime wait rather than a compile error.
4. **Face:** `activate(ctx)` + `ctx.register(...)` + `ctx.get(...)` with no `dsh.client` field in `package.json` and no browser entry → this is the **Host / ordinary Cordis server-side** face, not the Web Client face. That distinction decides the entire migration (below).

**Cards**

* **DSH-0.1.2-A1-01 · APIProxy removed, Host/Web Client calls moved to `@Remote`** (breaking, required-if-hit, touchpoint #3; indirectly #1). The card's old→new table maps exactly the two calls hit here:
  * `session.rename` → `session/rename` (generated declaration in the `session` namespace; `ctx.remote.session.rename` on the client plane). The card also warns that the `sessionTitle/rename` name in the 08-10 architecture note is a **design draft**, not the implementation.
  * `llm.providers` → **`llm/listProviders` + `llm/listConfigurableProviders`** — one call split into two results.
* **API-01 · APIProxy migrates by runtime plane to domain services or the `ctx.remote` projection** — the decisive recipe for this fixture, because the card's own field note says the old `apiProxy` is the **host-plane (server-side) facade** while `ctx.remote` is the **client-plane (browser) facade**; they are not in the same runtime and injection names cannot be swapped one-to-one. Correct migration for a **host-plane** consumer: skip the gateway and inject the owning domain service directly (e.g. `export const inject = ['llm']` then `ctx.llm.listProviders()`). Mechanically writing `inject: ['remote']` leaves the entry at `pending (waiting for service: remote)` — the same symptom as discussion #5120 pain point #4.
* **DSH-0.1.2-A2-02 · Remote failures become `RemoteError` instances; error codes gain namespaces** (breaking, required-if-hit, #3) — applies **only after** a migration that lands on `ctx.remote`, and only on the client plane. The rc.2→alpha.2 call shape does not change; what changes is `error` (`{code,message,details}` → `RemoteError`) and the code vocabulary (`session-not-found` → `session/not-found`, `agent-busy` → `session/agent-busy`, `internal` → `gateway/internal`, `cancelled` → `gateway/cancelled`, …). Not hit by the current source (there is no Remote call and no error-code branching in it), so it is a **follow-on obligation**, not a present break.
* **DSH-0.1.2-A2-08 · `sessionProjections` becomes a required inject and peer** (breaking, #3) — composition-conditional. It bites hosts that self-compose and mount `dsh-tool-todo`, `dsh-tool-subagent`, `dsh-agent`, `dsh-agent-loop`, `dsh-terminal-bash` individually. This fixture's `cordis.patch.yml` declares only its own row, so **not directly hit**; it becomes relevant the moment the migrated plugin is mounted on a self-composed profile instead of `dsh-base`.

**Ruled out inside this class** (pattern-2 matches: `@deepseek-ai/dsh-api-.+/client`, `/internal` — the only match is `src/index.ts:10`, which is the #5 UI import, classified there)

* **A1-20** `userQuestions.registerProvider` — no match.
* **A1-21** `resolveSessionPreset` / agent-presets `roots` — no match (also no `roots` in any yml).
* **A1-22** `isTokenDelta` — no match.
* **A1-25** `@deepseek-ai/dsh-client-runtime` — no import anywhere; the plugin is not a Web Client plugin. Not hit.
* **A1-27** SessionBinding reads — see #2.
* **A1-30** `ctx.connection.api` — no match.
* **A1-31** subagent descriptor version — no match.
* **A1-32** `IWorkspaces` navigation — no match.
* **A2-05** `pluginInventory/list` / `PluginInventorySnapshot` — no match.
* **A2-06** `ctx.remote.$host.home/isLoopback` — client-plane only; see #4 for why it is *not* the fix for this plugin's hardcoded home.
* **A2-10** `settingsNamespace` — no settings usage in the fixture.

**Net-state / folding note** — none. `A1-01` is a plain removal in alpha.1 that persists in alpha.2.

---

### #4 · Direct host directory read/write — **HIT**

**Evidence** — `src/index.ts:5,7,34-38`

```ts
const profileDir = join(homedir(), '.dsh', 'profiles', 'default')   // :36
writeFileSync(join(profileDir, 'legacy-note.txt'), text)            // :37
```

**Coupling points**

1. The DSH home is derived from `homedir()` + a **hardcoded `.dsh`** segment, instead of the runtime `DSH_HOME`.
2. The profile is **hardcoded as `default`**, instead of "the target profile this plugin is mounted in".
3. The plugin **writes** a file (`legacy-note.txt`) into a host-owned profile directory — a config/state location the host owns, with no ownership boundary.
4. `homedir()`/`writeFileSync` are host-plane Node APIs, confirming the face (consistent with #3).

**Cards**

* **DSH-0.1.2-A1-04 · ACP/SDK examples merged into the `dsh` profile, standalone demo bins and packages removed** (behavior, required-if-hit, touchpoints #4+#7). The relevant half for #4: profiles `acp`, `sdk`, `sdk-minimal` were added and the standalone bins/packages `dsh-acp-demo`, `dsh-jsonrpc-agent`, `@deepseek-ai/dsh-acp-demo`, `dsh-sdk-jsonrpc-demo`, `dsh-acp-snapshot` were removed; wrappers that hardcode old process trees or fixed profile paths no longer match. Recipe, verbatim in effect: **"Use the runtime `DSH_HOME`, the target profile, and the official launcher as the source of truth … do not hardcode user directories."** Field note (alpha.2 container test): `dsh --help` confirms profiles live under `$DSH_HOME/profiles` — so `~/.dsh/profiles/default` is only correct when `DSH_HOME` is unset *and* the profile really is `default`.
* **DSH-0.1.2-A2-06 · Client Remote adds fixed Host facts `$host.home/isLoopback`** (behavior, #3) — explicitly **not** the fix here: it is the **Web Client** plane's way of reading the Host home. A host-plane plugin must read `DSH_HOME` (or the host service that owns it). Citing A2-06 as the migration target for a host-side `homedir()` call would be a face error of exactly the kind API-01 warns about.
* **DSH-0.1.2-A1-13 · Platform shell and directory picker fixes may obsolete old workarounds** (fix, **conditional**, #4+#7) — applies only to plugins that *maintain* compatibility workarounds for persistent PowerShell/Bash or the Windows directory picker. This fixture maintains none, so it is a **ruled-out** card, listed for completeness. Its recipe is also the right warning for the migration: delete workarounds one by one, only after reproducing the fix on the target platform.

**Ruled out inside this class**

* Pattern 2 (`readFile|writeFile|mkdir|openPath`) also matched `scripts/apply-patch.mjs:2,8` (`readFileSync`) — that is the patch applier reading its own `patch.yml` from the plugin directory, **not** a host-directory access; classified under #1/#7. `mkdir`/`openPath`: no match.
* **A1-21** (agent-presets `roots` pointing at the old CLI `config/agent-presets/` directory) — no `roots` key in `cordis.patch.yml`; not hit.

**Net-state / folding note** — none. Note the direction of the risk: the *path construction* is the legacy coupling; alpha.1/alpha.2 did not move `~/.dsh` itself, but `A1-04` makes the runtime source of truth (`DSH_HOME` + profile) authoritative, and the hardcoded form silently breaks on any non-default `DSH_HOME`/profile.

---

### #5 · Internal UI / commands / tool registration — **HIT**

**Evidence**

* `src/index.ts:9-10` — `import { SessionView } from '@deepseek-ai/dsh-session-view/internal'` (a **deep `/internal` subpath** of a client UI package, imported from host-plane code).
* `src/index.ts:40-43` — `ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))`.

**Coupling points**

1. The **module path** `@deepseek-ai/dsh-session-view/internal` — a private entry point, not a maintained public seam.
2. The **component contract** — `new SessionView({ enhanced: true })` constructs the session view directly and passes a prop whose shape is internal.
3. The **registration point** — `ctx.contributes.registerCommand` plus a direct view construction, i.e. the plugin owns a UI surface through an internal seam rather than a public facet/service.
4. The **package is not declared** anywhere in `package.json` (there is no `dependencies`/`peerDependencies` block at all) — so this import is an undeclared dependency on top of a private path.

**Cards**

* **DSH-0.1.2-A1-03 · Session view internals split up extensively** (breaking, required-if-hit, touchpoints #1 **and #5**) — the same card as #1, and deliberately so: it is the single card that covers "patch target paths, **internal imports**, or **UI registration points** no longer work." Recipe: exact-tag compare per path, rebuild imports by owning module, and mark anything without a stable public seam as *pending confirmation*. Field notes on this card are directly on point (dsh-tui validating patch-surface paths by composition; the ui-whale/ui-progress/input-history migrations rebuilding imports by owning module).
* **API-07 · Package export ≠ artifact presence** — the `/internal` subpath is the textbook risk signal: an `exports` map entry (or a source checkout) is not proof that the published tarball contains the file. Evidence order and the "prefer `.`/`/client`/`/types`/`/remote` entry points" rule apply.

**Ruled out inside this class**

* `dsh-client-runtime` / `PropsRuntime` / `ctx.slots` / `useSession` / `useChat` / `__ModuleLoader__` / `PLUGIN_ID` — **no match** in any file. Therefore:
  * **A1-25** (`dsh-client-runtime` removal) — not hit.
  * **API-10** (client-runtime unbundling, keyed chat snapshots, `useSession`→`useChat`, Host `commands.execute` images argument) — not hit.
  * **A1-26** (client-modules scan contract: registration id must equal `package.json#name`) — not hit: there is no client bundle, no `dsh.client` field, no assembly row for a client half. (The one composition row that does exist, `cordis.patch.yml:2-3`, already uses `id`/`name` = `legacy-plugin` = `package.json#name`, so it is consistent.)
* **A1-09 / A1-10 / A1-11** — capability cards, optional, and none of their surfaces (provider-login settings page, third-party language registration, subagent provider/model selection) appear in the fixture. Per SKILL.md, capability cards are suggestions only and are **never** adopted automatically.
* **A1-28** (composer `<textarea>` → contenteditable DIV) — no `contenteditable`/`setSelectionRange`/`data-input-scroll`/`instanceof HTMLTextAreaElement` anywhere; not hit.
* **A1-29** (`MarkdownText` nested labels) — no `MarkdownText`/`codeLabels` usage; not hit.

**Net-state / folding note** — none. `A1-03` is a straight break in alpha.1 and alpha.2; there is no restore.

---

### #6 · Custom HTTP / WS / RPC / DOM / CSS channel — **HIT**

**Evidence** — `src/index.ts:4, 45-54`

```ts
function startLegacyBridge() {                                   // :47
  const server = createServer((_request, response) => {         // :48
    response.end('legacy')                                      // :49
  })
  server.listen(43121, '127.0.0.1')  // http://localhost:43121/api/legacy   // :51
  return server
}
void startLegacyBridge                                          // :54
```

**Coupling points**

1. A **private loopback HTTP channel** on a **fixed port 43121** serving `/api/legacy` — a bespoke RPC surface that exists outside the host's Connection auth model (the source comment says so outright).
2. **No authentication, no Host/Origin fence, no CORS/TLS** — "listening on loopback only" is explicitly *not* a reason to skip authentication (pre-flight #6).
3. **No lifecycle**: no `server.close()`, no dispose hook, no `error` handler on `listen`, no teardown on plugin dispose.
4. It is **never invoked** (`void startLegacyBridge`, per the fixture's static-only constraint). This does not make it a non-hit: the code is a live coupling point that must be classified and migrated (or deleted) before the plugin can be considered migrated. Note also that a never-invoked function is invisible to any runtime smoke — only a static scan can see it.

**Cards**

* **DSH-0.1.2-A1-08 · Web/API channels use process-scoped bootstrap tokens and signed cookies** (security, required-if-hit, touchpoint #6). Recipe for exactly this shape: custom routes registered with `ctx.webServer.register()` / `registerUpgrade()` **do not automatically inherit** auth, the Host/Origin fence, CORS, or TLS; the handler must call `ctx.connection.requestRejection(req)` first (honoring its 401/403), or move to a Connection-owned carrier (`ctx.connection.fetch.register` for a compatible exact endpoint, `ctx.connection.rpc.handle('/root', handler)` for a JSON RPC channel). Verification: wrong Host/Origin → 403; missing/bad Cookie → 401; a custom route must not be considered protected before it is explicitly wired into the gate.
* **precision-checklist.md §"Channel auth joins the host gate (A1-08)"** — the operative sub-recipe: keep the existing protocol, add the gate, change the registration **and** the service `inject` together (retain `webServer`, add `connection`); do not switch HTTP → RPC just to fix auth, because that changes request/envelope and response semantics; lint cannot prove a guard precedes all side effects — it is a manual/runtime check.
* Note that this bridge is **not even registered with the host webServer** — it is a standalone Node server. So the migration decision is binary: either wire it into the gate (which means registering it on the host webServer + `requestRejection`, or moving it to a Connection seam), or delete it. Leaving it as-is is a security hole that alpha.1/alpha.2 makes *more* attractive to fix, not less.

**Ruled out inside this class**

* `WebSocket`, `MutationObserver`, `insertRule` — no match (pattern 1 only matched `createServer(`).
* `router.(get|post|put|delete)(`, `/api/` as a host route — the only `/api/` occurrence is the comment on `src/index.ts:51`; there is no host router registration.
* `contenteditable`, `setSelectionRange`, `data-input-scroll` (pattern 3) — no match, so **A1-28** is not hit via #6 either.
* **A1-19** (Web plugin acceptance: boot manifest, token URL, advertised bundle URLs) — not hit: the fixture ships no browser acceptance script, no `dsh web` wrapper, no startup-log parsing, no `/plugins/<id>/client.js` URL construction. It becomes relevant only if a wrapper is added later.

**Net-state / folding note** — none; `A1-08` is an alpha.1 security change that stands in alpha.2 (its field notes were measured against a 0.1.2-alpha.2 host).

---

### #7 · Subprocess / stdout / stderr parsing — **HIT**

**Evidence**

* `src/index.ts:8, 56-67` — `spawn('dsh', ['--profile', 'headless', prompt])`, then:
  `child.stdout.on('data', (line: Buffer) => { const event = JSON.parse(line.toString()); if (event.type === 'final') result = event.text })` and `child.on('close', () => resolve(result))`.
* `scripts/apply-patch.mjs:3, 11-19` — `execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })`, then `output.split('\n')` + `JSON.parse(line)` + `event.type === 'final'`.

**Coupling points**

1. **Wrong output model**: both sites assume headless stdout is **JSONL** carrying `{ type: 'final', text }` events. It is not, and never was — see the attribution note below.
2. **Exit code ignored**: `close`/`execFileSync` results are not checked; a failed or aborted run resolves as success.
3. **stderr ignored**: no `dsh: reasoning:` handling, and no distinction between "stderr has content" and "the run failed".
4. **Chunk-vs-line confusion**: `stdout.on('data')` yields arbitrary byte chunks, not lines, so `JSON.parse(line.toString())` throws on any chunk boundary that is not a newline — a latent crash even if the stream *were* JSONL.
5. **No cancellation / teardown / spawn-error handling**: no `AbortSignal`, no `child.kill()`, no `error` listener, no dispose.
6. `apply-patch.mjs` additionally couples to **cwd** (relative `patch.yml`) and to `DSH_HARNESS_SOURCE_ROOT` (see #1).

**Cards**

* **DSH-0.1.2-A1-05 · Headless: stderr gains a `dsh: reasoning:` segment; stdout remains the final text** (behavior, required-if-hit, touchpoint #7). The card is explicit that this is **not** a new break in stdout: "rc.2's stdout was already the final assistant text with exit code 0/1 … it was never JSONL. The only alpha.1 change is that stderr gains a `dsh: reasoning:` segment (rc.2's stderr was empty on success)." Recipe: treat stdout as the final assistant-text channel, receive the reasoning/`dsh: <code>: <message>` segments on stderr, and **judge success by exit code**; do not `JSON.parse` stdout by default.
* **API-06 · The Headless argv and process output contract** — the exact ledger for the target tag:
  * correct shape is `dsh --profile headless "task"`, launcher flags before the task (the fixture's argv order is already correct; `--patch`-style flags must precede the task text);
  * stdout = final assistant text, **not JSONL**, no intermediate tool output;
  * stderr = `dsh: reasoning: …` deltas / `dsh: <code>: <message>` failures;
  * exit 0 = completed, exit 1 = abort/error/no completed turn; `SIGINT` → 130, ordinary `SIGTERM` → 0; record the signal rather than guessing from stderr text;
  * best practice: argv arrays (the fixture already does this), exit code as the success criterion, consume stdout **and** stderr concurrently, handle cancellation/signals/spawn errors/teardown, and do not wait for exit before draining pipes.

**Baseline attribution (precision point)**

The JSONL assumption is a **pre-existing defect**, already wrong on rc.2 — it is not introduced by this corridor. Per rollup **R-06** (pre-migration baseline attribution: establish the exemption list first, then migrate), it must be recorded as a pre-existing failure and fixed as part of the migration, but it must **not** be reported as "broken by 0.1.2". What the corridor *adds* on this touchpoint is the stderr reasoning segment: a wrapper that treated non-empty stderr as failure would start misreporting successful runs on alpha.1+; this fixture ignores stderr entirely, so it instead silently loses reasoning. Both readings belong in the report; neither is a reason to skip the fix.

**Ruled out inside this class**

* **A1-04**'s #7 half (standalone bins `dsh-acp-demo` / `dsh-jsonrpc-agent` and packages `@deepseek-ai/dsh-acp-demo` / `dsh-sdk-jsonrpc-demo` / `dsh-acp-snapshot` removed) — the fixture invokes only the `dsh` launcher itself, and `dsh --profile <name>` already existed in rc.2 (the card says so explicitly). **Not hit**, but cited because it is the #7 sibling card and because `--profile headless` is the profile whose sibling profiles changed.
* **A2-04** (empty client graph for `dsh web` on Node 24.0–24.11.1; fix, **conditional**, #7) — applies only to wrappers that added workarounds (forcing Node 22, skipping `dsh web`, probing the loader by major version). The fixture has no such workaround and no `dsh web` invocation. **Not hit**; worth remembering for the verification matrix (the failure window must be inside the test matrix, not just latest/LTS).
* **A1-13** — no persistent-shell / directory-picker workarounds; not hit.
* **A1-06**'s #7 half (PTC dispatch vocabulary) — no `tools/code-dispatch`, `tools-code-mode`, `tools:code-only`, `CodeDispatch*` tokens; not hit.

**Net-state / folding note** — none for this class.

---

## 4. Corridor folding, worked through: `SessionEvent.ignorable` (#2)

This is the case the brief asks to be reasoned through explicitly, and `rollup-0.1.2.md` calls it "the canonical example".

**Timeline across the corridor**

| Tag | State of `ignorable` | Card |
|---|---|---|
| `dsh-v0.1.1-rc.2` (from) | present — third-party informational events can carry `ignorable: true` and survive persistence/reload | — (baseline) |
| `dsh-v0.1.2-alpha.1` | **removed** — alpha.1 cannot preserve the marker; first-party readers reject reloads of unknown persisted events, treating them as required | **DSH-0.1.2-A1-02** (breaking, *required-if-target-is-alpha.1*) |
| `dsh-v0.1.2-alpha.2` (to) | **restored** — envelope/persistence/reload/transport retention of the marker is back; unknown events *without* the marker still fail closed | **DSH-0.1.2-A2-01** (fix, required-if-hit) |

**How it must be mapped**

1. **Primary card = A2-01**, because the migration target is alpha.2 and A2-01 describes the net state at the target tag. A2-01's own "Source" line records it as the *revert of* A1-02.
2. **A1-02 is cited but must not drive a source edit.** Its action level is literally `required-if-target-is-alpha.1`. Following it here would mean deleting `ignorable: true` from the producer (`src/index.ts:17`) — and then, per the folding rule, having to add it back for alpha.2. `rollup-0.1.2.md`: "do not delete once for alpha.1 and then add it back for alpha.2; if the final target restores that semantics, defensive code in old-version adaptations should be removed rather than kept."
3. **So the correct instruction for this producer is: keep `ignorable: true`.** The marker's semantics are exactly what A2-01 restores, and the event type `legacy/informational-note` is informational — "semantics an old reader can omit without affecting reconstruction".
4. **A1-02 becomes live only under cross-cohort coexistence** (rollup R-02): if the same artifact must also run on an alpha.1 host, the producer needs a generation-aware branch, because alpha.1 will reject the reload. That is a coexistence question, not an alpha.2 migration question.
5. **The residual gap survives the folding and is the real risk: API-05.** alpha.2 restores the *envelope* field, but the public `Session.append(...)` still cannot write it (only `type`, `data`, `SurfaceIntent`). Consequences for this fixture:
   * The producer here uses `ctx.emit('session/event', …)` — a live event-bus seam, not `Session.append`. Whether that emit path actually persists the marker into the durable envelope at alpha.2 is **not determinable from this static copy**; it must be marked *pending confirmation* against the target tag rather than assumed either way.
   * If the plugin's real intent is to persist plugin state via a custom `SessionEventMap` + `Session.append()`, alpha.2 best practice is **not** to do it: use a plugin-owned sidecar/store keyed by Session id (API-05 best practice 1), and treat a cold-load refusal as a migration blocker rather than swallowing it.
   * Either way, the verification must include a real **persist → restart → cold load** cycle; a live-only smoke cannot catch the "silent write / loud read" failure mode.

---

## 5. Zero-hit inventory (what was ruled out, and where)

All seven classes hit, so there is **no** zero-hit class to report. For completeness — and because "no hit" inside a class is not the same as "no problem" — here is every pattern that produced **no match anywhere in the fixture**, with the card it would have implicated:

| Class | Pattern with no match | Card(s) ruled out |
|---|---|---|
| #1 | `patchedDependencies`, `patch-package` | (no package-manager patch track in use) |
| #2 | `tool/code-dispatch`, `tools-code-mode`, `connection/reset` | A1-06 (PTC rename) |
| #3 | `@deepseek-ai/dsh-api-.+/client` (only `/internal` matched, classified as #5) | A1-25, A1-27, A1-30, A1-32, A2-05, A2-06, A2-10 |
| #4 | `mkdir`, `openPath`; `DSH_HOME` as a *read* (the string does not appear) | — |
| #5 | `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`, `__ModuleLoader__`, `PLUGIN_ID` | A1-25, A1-26, A1-28, A1-29, API-10 |
| #6 | `WebSocket`, `MutationObserver`, `insertRule`, `router.(get|post|put|delete)(`, `contenteditable`, `setSelectionRange`, `data-input-scroll` | A1-28 (DOM half) |
| #7 | `execa`, `Bun.spawn`; `dsh web`, `--json`, `--session-id` | A1-19, A2-04 |
| all | no image / `read_image` / attachment code | DSH-0.1.1-R2-01…03 (out of corridor anyway) |
| all | no `userQuestions`, `resolveSessionPreset`, `isTokenDelta`, `subagent` descriptor, `settingsNamespace`, `pluginInventory` | A1-20, A1-21, A1-22, A1-31, A2-05, A2-10 |

---

## 6. Why "no hit" (or "only N hits") cannot be read as "no problem"

This scan is a **heuristic**, and the skill says so in as many words: *"This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."* Concretely, for this fixture:

### 6.1 The dependency/configuration layer is entirely absent — and that is itself the biggest open risk

`fixture/package.json` declares **no** `dependencies`, **no** `peerDependencies`, **no** `engines`, no `dsh.client`, no `dsh-plugin.json`, and there is **no lockfile**. `inject-lint.mjs` therefore returns `verdict: FIX-REQUIRED` with `cordisPeer: null`. Consequences:

* The DSH cohort is **undeclared**, so nothing pins the plugin to `^0.1.2-alpha.1`+ or to the `@deepseek-ai/cordis ^4.0.1` peer floor (precision-checklist; rollup **R-01** must be cited whenever the migration touches peer floors or the cohort at all).
* `@deepseek-ai/dsh-session-view` is imported at `src/index.ts:10` but declared nowhere — the import is an undeclared dependency on a private path.
* `A2-03` (peers trimmed) and `A2-08` (peers **added**, e.g. `@deepseek-ai/dsh-session-projection` for `dsh-agent`/`dsh-tool-subagent`/…) both change the peer graph in opposite directions; neither can be evaluated without a real dependency block. A missing peer shows up as a **runtime `pending`**, not a typecheck error.

### 6.2 Type-level blindness

Every entry point is typed `activate(ctx: any)` and every callback parameter is `: any` (`src/index.ts:12, 20, 25, 29, 35, 57`). With `ctx: any` and no devDependencies, **typecheck cannot see any of the API-surface breaks** catalogued above (A1-01, A1-03, A2-02, A2-10 …). The fixture's own README states it cannot be compiled by design. So "no typecheck errors" would be meaningless here, and the absence of a build/test/CI layer means the static layer has no automated backstop at all.

### 6.3 Pattern-level blind spots

* The planner skips Markdown, files > 1 MiB, and several directories; it does **not** parse TypeScript data flow or dynamic/computed imports (`scripts/README.md` "Limits"). A dynamic `await import('@deepseek-ai/dsh-session-view/internal')` would be invisible to it.
* A line-level match cannot reveal data flow (pre-flight #4 says exactly this): once a path-construction call is hit, the variables' origin and the write destination must still be traced.
* A **never-invoked** function (`startLegacyBridge`, `src/index.ts:47-54`) is a coupling point that no runtime smoke would ever exercise. Static scan is the only layer that can see it — which is the argument *for* this scan, not against it.
* Card sets are **curated, not complete API diffs**; "Host UI/performance changes without cards do not mean 'definitely no API impact'".

### 6.4 What must still be run before anyone calls this plugin migrated

1. **Static inventory** — declare the real dependency/peer block on the alpha.2 cohort; add `@deepseek-ai/dsh-session-view` (or its post-split owner) explicitly; run `inject-lint.mjs` to `OK` (rollup R-01).
2. **typecheck/build** with the real `Context` (not `any`), plus one `tsc --skipLibCheck false` pass to locate the missing declaration chain (A2-03 field note, API-10).
3. **Per-hit focused verification**: patch-surface composition against `dsh-v0.1.2-alpha.2` source (A1-03); one host-plane domain-service call replacing each `apiProxy.invoke` (A1-01/API-01); `ignorable` persist → restart → cold load (A2-01/API-05); `DSH_HOME`-derived profile path (A1-04); auth gate on the loopback channel — 403 on wrong Host/Origin, 401 on missing Cookie (A1-08); headless stub matrix — plain success / reasoning / empty final text / spawn error / non-zero exit (A1-05, API-06).
4. **Real mount** — isolated profile cold boot, entry active, no `pending (waiting for service: …)` rows in `dsh --profile <p> --dump-config` (A2-08).
5. **Behavior + wrapper** — one core plugin path end-to-end, and exit code / stdout / stderr / cancellation / teardown for every subprocess boundary.
6. **Baseline first** (rollup R-06): the JSONL-stdout defect is pre-existing and belongs on the exemption list as a *pre-existing* failure, so it is not mis-attributed to the 0.1.2 upgrade.

---

## 7. Appendix A · full pattern-match log (file:line → pattern)

Generated by running all 14 patterns from `references/pre-flight-patterns.json` over all 6 fixture files. `README.md` matches are listed for completeness but are prose, not evidence.

**#1 source patch** — `(?<!cordis\.)patch\.yml|patchedDependencies|patch-package`:
`cordis.patch.yml:6` · `README.md:10` · `scripts/apply-patch.mjs:8`
`DSH_HARNESS_SOURCE_ROOT|patch-surface|monkeypatch|monkey-patch`:
`patch.yml:1` · `scripts/apply-patch.mjs:5` · `scripts/apply-patch.mjs:6`

**#2 events** — `SessionEvent|session/event|ctx\.on\(|subscribe\(`:
`README.md:11` · `src/index.ts:15` · `src/index.ts:20`
`tool/code-dispatch|tools-code-mode|connection/reset`: **no match**

**#3 services/Remote** — `APIProxy|apiProxy|ctx\.get\(|ctx\.remote|@Remote`:
`README.md:12` · `src/index.ts:24` · `src/index.ts:26` · `src/index.ts:27` · `src/index.ts:30` · `src/index.ts:31`
`@deepseek-ai/dsh-api-.+/client|/internal`: `src/index.ts:10`

**#4 host filesystem** — `DSH_HOME|\.dsh[/\\]|profiles[/\\]|homedir\(`:
`README.md:13` · `src/index.ts:36`
`readFile|writeFile|mkdir|openPath`: `scripts/apply-patch.mjs:2` · `scripts/apply-patch.mjs:8` · `src/index.ts:7` · `src/index.ts:37`

**#5 UI/commands/tools** — `registerCommand|registerView|contributes|ctx\.tools|commands\.execute`:
`README.md:14` · `src/index.ts:41`
`dsh-client-runtime|PropsRuntime|ctx\.slots|useSession|useChat|/internal`: `src/index.ts:10`
`__ModuleLoader__|PLUGIN_ID`: **no match**

**#6 custom channel** — `createServer\(|WebSocket|MutationObserver|insertRule`: `src/index.ts:48`
`127\.0\.0\.1|localhost|router\.(get|post|put|delete)\(|/api/`: `README.md:15` · `src/index.ts:51`
`contenteditable|setSelectionRange|data-input-scroll`: **no match**

**#7 subprocess/output** — `node:child_process|spawn\(|exec(File)?Sync\(|execa|Bun\.spawn`:
`scripts/apply-patch.mjs:3` · `scripts/apply-patch.mjs:12` · `src/index.ts:8` · `src/index.ts:59`
`headless|--profile`: `scripts/apply-patch.mjs:11` · `:12` · `:18` · `src/index.ts:56` · `:57` · `:59`

The read-only planner's independent hit list matched this log exactly (11 hits across the 5 non-Markdown files, all seven classes `detected`).

---

## 8. Appendix B · read-only evidence

SHA-256 (first 16 hex) and mtime of every fixture file, taken **after** the scan. All mtimes remain the fixture creation time (2026-09-03T10:21:09Z), i.e. nothing was written during this session.

| File | Size | mtime (UTC) | sha256 (truncated) |
|---|---:|---|---|
| `README.md` | 1364 B | 2026-09-03T10:21:09.490Z | `84b8fd89d9e05abc` |
| `cordis.patch.yml` | 159 B | 2026-09-03T10:21:09.491Z | `a9feaa3ec0f63ced` |
| `package.json` | 161 B | 2026-09-03T10:21:09.491Z | `af1e498ca6f80b65` |
| `patch.yml` | 214 B | 2026-09-03T10:21:09.492Z | `de622598fc298f54` |
| `scripts/apply-patch.mjs` | 752 B | 2026-09-03T10:21:09.493Z | `4d6744baf58fe055` |
| `src/index.ts` | 2562 B | 2026-09-03T10:21:09.494Z | `429979274fe9776e` |

The only filesystem writes in this session were inside `agent-output/S1-static-scan/` (this report). No temporary scratch files were created and none needed deleting.

---

## 9. Sources

Primary sources, all read locally and read-only:

* `skills/plugin-upgrade/SKILL.md` — mode selection (Mode A), shared read-only preparation, Mode C touchpoint discipline, card-filtering rule.
* `skills/plugin-upgrade/references/README.md` — version corridor index (`from → to` edges), card schema, folding rule.
* `skills/plugin-upgrade/references/pre-flight.md` + `pre-flight-patterns.json` — the seven touchpoint classes, the regexes, the per-class related-card lists, the summary template, and the "zero hits ≠ compatibility" caveat.
* `skills/plugin-upgrade/references/v0.1.1-rc.2.md`, `v0.1.2-alpha.1.md` (28 cards), `v0.1.2-alpha.2.md` (8 cards) — the corridor cards cited above.
* `skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md` — API-01…API-10, CFG-01.
* `skills/plugin-upgrade/references/rollup-0.1.2.md` — R-01…R-13, card index by touchpoint, the folding note naming `ignorable` as the canonical case.
* `skills/plugin-upgrade/references/precision-checklist.md` — alpha.2 static-migration checklist (peer floors, channel-auth gate, landing discipline, citation contract).
* `skills/plugin-upgrade/scripts/README.md`, `plan-migration.mjs`, `inject-lint.mjs` — read-only cross-check tooling and its documented limits.
