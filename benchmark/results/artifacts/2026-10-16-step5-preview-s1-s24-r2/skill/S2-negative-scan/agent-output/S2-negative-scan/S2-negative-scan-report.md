# S2 · Negative Scan — @demo/dsh-minimal-llm → dsh 0.1.2-alpha.2

**Mode**: A/C read-only inspection (Mode C author-migrate *diagnosis only* — no source, dependency, or config write was performed).
**Target host version**: `dsh-v0.1.2-alpha.2`.
**Deliverable**: this report. The fixture was **not modified** (proof in §1).

---

## 0. One-paragraph answer

**The plugin is NOT compatible with 0.1.2-alpha.2 as it stands, and the six zero-hit touchpoint classes cannot tell you that it is.**
Exactly **one** of the seven touchpoint classes is hit — **#3 internal service probes / Remote** — and that single hit lands on a **breaking** change card, **`DSH-0.1.2-A1-01`** ("APIProxy removed"), whose documented symptom is a composition row that **stays `pending (waiting for service: apiProxy)` forever**, so the plugin's only function is dead on the target host.
The zero-hit classes are *necessary but not sufficient* evidence: this very fixture contains a removed-package dependency (`@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`, `package.json:17`) that **matches none of the 17 scan regexes** and is only visible through the separate removed-package inventory (`rollup-0.1.2.md` **R-05**). Zero hits ≠ compatible. Details and the remaining mandatory verification steps are in §6.

---

## 1. Scope, method, and read-only proof

### 1.1 What was read

| Path | Role |
|---|---|
| `fixture/package.json`, `fixture/index.js`, `fixture/cordis.patch.yml`, `fixture/src/session-notes.js`, `fixture/README.md` | task evidence (static copy, read-only) |
| `skills/plugin-upgrade/SKILL.md`, `references/pre-flight.md`, `references/README.md`, `references/v0.1.2-alpha.1.md`, `references/v0.1.2-alpha.2.md`, `references/api-migration-0.1.2-alpha.2.md`, `references/rollup-0.1.2.md`, `references/precision-checklist.md`, `references/troubleshooting.md`, `references/pre-flight-patterns.json`, `scripts/README.md`, `examples/legacy-plugin/*` | skill reference (read-only) |

Nothing outside those three allowed roots was listed, globbed, grepped, or opened. No `solution/`, `tests/`, `benchmark/`, `node_modules/`, `.dsh/`, or temp directory was touched. No migration, install, build, or lifecycle script was executed.

### 1.2 Commands run (all read-only)

1. `node skills/plugin-upgrade/scripts/plan-migration.mjs --root <fixture> --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2 --format json` — the skill's read-only migration planner. Exit 0.
2. `node skills/plugin-upgrade/scripts/inject-lint.mjs <fixture>` — the skill's read-only alpha.2 residue/peer checker. Exit 0, `verdict: FIX-REQUIRED` (see §5.3).
3. Manual line-level enumeration of **all 17 class regexes** from `references/pre-flight-patterns.json` over the fixture (the planner reports only the *first* matching line per file per class, so its `index.js:2` hit understates the real call sites — see §4.3).
4. Card-by-card reading of the whole corridor (28 + 8 cards) plus the rc.2→alpha.2 API ledger and the corridor-level rollup.

### 1.3 Fixture integrity (SHA-256, before == after)

| File | SHA-256 |
|---|---|
| `fixture/package.json` | `414ADB496685D6467D57740ACF03AECCDB343F1D231B2B3F05E354124508602E` |
| `fixture/index.js` | `7306621926891CDF7D26EF268725B5F386213CE8410259947A30662117B0A866` |
| `fixture/cordis.patch.yml` | `D50C34AE80E26E0DD0AB56B9E2835A6B3049665B8777027033FF52695CA02ABE` |
| `fixture/src/session-notes.js` | `7A3219984C595F4C927E386B54E688C9ACE2D0A50CAD0E72A436F93C9C673748` |
| `fixture/README.md` | `FDCA9077F0C9FB810F365D890F677E1CAB35208E1FFC78AE9D1B3F54AA39D479` |

Hashes were taken before the first scan command and re-taken after the last one; they are identical. No file was created, renamed, or deleted under `fixture/`.

---

## 2. Identity and version corridor

### 2.1 Plugin identity (pre-flight step 0 inventory)

| Fact | Value | Evidence |
|---|---|---|
| Package name / version | `@demo/dsh-minimal-llm` @ `0.1.0` | `package.json:2-3` |
| Private / ESM / entry | `private: true`, `type: module`, `main: index.js` | `package.json:4-6` |
| Runtime shape | plain Cordis **host-plane** plugin: `export const inject` + `export function apply(ctx)` + `ctx.effect(...)` | `index.js:3,5,7` |
| Web Client half | **none** — no `dsh.client`, no `dsh.client.inject`, no client bundle, no `__ModuleLoader__` / `PLUGIN_ID`, no build script | `package.json` (whole file), `index.js` (whole file) |
| Community manifest `dsh-plugin.json` | **absent** | directory listing |
| Profile composition | `cordis.patch.yml` = one `insert` row (`id: minimal-llm`, `name: "@demo/dsh-minimal-llm"`); **no `patch:` key** | `cordis.patch.yml:1-3` |
| Bundle self-registration | `dsh.bundle.patch: "./cordis.patch.yml"`, also re-exported via `exports["./cordis.patch.yml"]` | `package.json:9,12-14` |
| Dependencies | `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (**the only** `@deepseek-ai/*` reference in the whole plugin) | `package.json:17` |
| `peerDependencies` / `engines` / `devDependencies` / `scripts` / `files` / lockfile | **all absent** | `package.json` (whole file) |

### 2.2 Corridor

| Item | Value |
|---|---|
| `to` | `dsh-v0.1.2-alpha.2` (declared by the task) |
| `from` | **not declared anywhere in the plugin** — no `engines`, no peer range, no lockfile. Inferred as `dsh-v0.1.1-rc.2` from three converging signals: the rc.2-only `apiProxy` service key (`index.js:3,9`), the removed `@deepseek-ai/dsh-host-apiproxy` dependency pinned at `0.0.1-rc.1` (`package.json:17`), and the in-source style comment (`index.js:2`). |
| Corridor edges walked | `v0.1.2-alpha.1.md` (`dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1`, 28 cards) → `v0.1.2-alpha.2.md` (`dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`, 8 cards) |
| Corridor gaps | none (planner: `gaps: []`) |
| Supplementary ledgers read in full | `api-migration-0.1.2-alpha.2.md` (exact rc.2→alpha.2 interface ledger, API-01…API-10, CFG-01), `rollup-0.1.2.md` (R-01…R-13 + layered validation checklist) |

> **Corridor caveat.** `index.js:2` is a *comment*. `precision-checklist.md` is explicit that "in-source compatibility notes are not facts". The `from` pin above is an inference, not a declaration — see §6.2 item 1. The corridor conclusion below holds for any `from` in `rc.2 → alpha.2`, because `apiProxy` is absent from **both** edges' target states; a `from` older than rc.2 would add uncarded segments.

---

## 3. Touchpoint checkup (@demo/dsh-minimal-llm, dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2)

| # | Touchpoint class | Hit | Evidence (file:line) | Applicable card(s) | Confidence note |
|---|---|---:|---|---|---|
| 1 | source patch / monkey patch | **NO** | `cordis.patch.yml:1-3` is a plain `insert` row with **no `patch:` key**; no `patchedDependencies`, no `patch-package`, no `DSH_HARNESS_SOURCE_ROOT`/`patch-surface`/`monkeypatch` anywhere | `DSH-0.1.2-A1-03` — **not hit** | High. The class regex (negative lookbehind on `cordis.` followed by `patch.yml`) deliberately excludes `cordis.patch.yml`; `pre-flight.md` #1 and **API-08** require classifying it as Profile composition. `dsh.bundle.patch` points at a safe in-package relative path (API-08 §4) |
| 2 | internal event names / persistent events | **NO** | no `SessionEvent`, `session/event`, `ctx.on(`, `subscribe(`; no `tool/code-dispatch`, `tools-code-mode`, `connection/reset` in any of the 4 scanned files | `DSH-0.1.2-A1-02` / `DSH-0.1.2-A2-01` — **not hit** | High. Net-state rule checked: `ignorable` is removed in alpha.1 and **restored** in alpha.2; the plugin produces *no* events at all, so neither card applies and there is no delete-then-re-add hazard |
| 3 | internal service probes / Remote | **YES** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `await ctx.apiProxy.llm.providers()` (plus log-only mentions on `:2,6,10,12`) | **`DSH-0.1.2-A1-01`** (breaking, required-if-hit) + **API-01**; supporting: `rollup R-05`, `R-08`, `troubleshooting.md` row 3 | **Certain.** See §4 |
| 4 | direct host directory reads/writes | **NO** | no `DSH_HOME`, `.dsh/`, `profiles/`, `homedir(`; no `readFile`/`writeFile`/`mkdir`/`openPath` | `DSH-0.1.2-A1-04`, `A1-13`, `A1-21` — **not hit** | High. `src/session-notes.js` is pure string/array work (`String().trim().replace().slice()`, `Array.slice`) |
| 5 | internal UI / commands / tool registration | **NO** | no `registerCommand`/`registerView`/`contributes`/`ctx.tools`/`commands.execute`; no `dsh-client-runtime`/`PropsRuntime`/`ctx.slots`/`useSession`/`useChat`; no `__ModuleLoader__`/`PLUGIN_ID` | `DSH-0.1.2-A1-03, A1-06, A1-09, A1-10, A1-11, A1-26, A1-28, A1-29` — **not hit** | High. No Web Client half exists, so `A1-26` (registration id == package.json name) is **inapplicable** — note the composition row's `name` already *is* the bare package name, so the rule would be satisfied anyway |
| 6 | custom HTTP / WS / RPC / DOM / CSS channels | **NO** | no `createServer(`, `WebSocket`, `MutationObserver`, `insertRule`; no `127.0.0.1`, `localhost`, `router.*(`, `/api/`; no `contenteditable`, `setSelectionRange`, `data-input-scroll` | `DSH-0.1.2-A1-08`, `A1-19`, `A1-28` — **not hit** | High. `inject-lint.mjs`: `rawWebServerRouteFiles: []`, `routeReviewRequired: false` |
| 7 | subprocess / stdout / stderr parsing | **NO** | no `node:child_process`, `spawn(`, `exec(File)Sync(`, `execa`, `Bun.spawn`; no `headless`, `--profile` | `DSH-0.1.2-A1-04, A1-05, A1-06, A1-13`, `A2-04` — **not hit** | High for the plugin itself. See §5.4 for the `console.error` note and the one residual `A2-04` verification-matrix caveat |

**Planner cross-check (independent tool, same verdict):** `detected: true` for class 3 only; classes 1, 2, 4, 5, 6, 7 all `detected: false`, `totalHits: 0`. `scannedFiles: 4` (Markdown is skipped by design, so the fixture `README.md` is *not* scan input — the conclusions above come from source, not from the fixture's own prose).

### 3.1 `src/session-notes.js` — the decoy

`formatSessionNote()` and `chunk()` are pure functions over strings and arrays. They match **zero** patterns. Two further facts make them harmless even in principle:

* the file is **never imported** — the fixture contains no `import`/`require()` statement at all, so it is not in the plugin's runtime module graph;
* the word "session" in the filename is a naming habit only; class 2's pattern is `SessionEvent`, which does not match.

---

## 4. The one hit, mapped to cards

### 4.1 What breaks, and how

| | |
|---|---|
| **Hit location** | `index.js:3` (`export const inject = ["apiProxy"]`) and `index.js:9` (`ctx.apiProxy.llm.providers()`); dependency `package.json:17` |
| **Old interface** | rc.2 service key `apiProxy`, type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy` |
| **How it fails on 0.1.2-alpha.2** | rc.2 → alpha.1 **deletes the package and the service** (`DSH-0.1.2-A1-01`; `rollup R-05` lists `@deepseek-ai/dsh-host-apiproxy` among the 5 packages removed on that edge). `troubleshooting.md` row 3 names the exact symptom: `waiting for service: apiProxy` → **the composition row stays pending forever**, `apply()` never runs. If the inject is softened instead, the same card's field note applies: the host plane has no `remote` service, so `inject: ["remote"]` also pends forever |
| **Why it is silent** | `index.js:11-13` wraps the call in `try/catch` and only `console.error`s the message. Even if `apply()` did run, `ctx.apiProxy` would be `undefined` → `TypeError` → swallowed → **no crash, no error surfaced, feature dead**. This is precisely the "silent error swallowing" anti-pattern called out in the `DSH-0.1.2-A1-30` field note and rollup layer 3 ("an empty UI counts as a failure in validation") |
| **Target interface (Host plane)** | `DSH-0.1.2-A1-01` field note + **API-01** minimal correct Host pattern: host-plane APIProxy consumers **skip the gateway and inject the owning domain service directly** → `export const inject = ["llm"]` … `ctx.llm.listProviders()`. Do **not** swap to `inject: ["remote"]` (client-plane only) |

### 4.2 Cards that actually apply to this hit

| Card | Type / action level | What it requires here |
|---|---|---|
| **`DSH-0.1.2-A1-01`** | breaking · required-if-hit | Migrate the hit call by **runtime plane**. This plugin is host-plane (no `dsh.client`, no client bundle), so the recipe is: `inject: ["llm"]` + `ctx.llm.listProviders()`; the `llm.providers → llm/listProviders` (+ `llm/listConfigurableProviders`) split in the card's table is the **Web Client consumer projection** and must not be used to derive Host method names (API-01: "Host calls must confirm the owning domain service item by item against the target tag") |
| **API-01** (ledger) | exact rc.2→alpha.2 ledger | Same plane rule; supplies the minimal Host pattern and the "confirm against the target tag's exports" discipline |
| **`rollup R-05`** | process | Pre-migration inventory of removed-package consumers: `@deepseek-ai/dsh-host-apiproxy` is on the rc.2→alpha.1 removal list → **must be dropped** from `package.json:17` |
| **`rollup R-08`** | process (install channel) | A lockfile pinning `@deepseek-ai/*@0.0.1-rc.1` is one of R-08's three named 404/refusal mechanisms. Here the correct move is deletion, not re-pinning |
| **`troubleshooting.md` row 3** | symptom lookup | Predicts `waiting for service: apiProxy` → pending forever; first card to check = `A1-01` |

### 4.3 Cards the planner listed as "applicable" but that are **not** actually hit

The planner intersects cards with *detected touchpoint classes*, so 18 cards came back "applicable" purely because they carry `#3`. Narrowing them against the actual source:

| Card | Why it is not hit |
|---|---|
| `A1-06` (Code Mode→PTC), `A1-07` (WebFetch default), `A1-14` (session-log-deepseek), `A1-20` (userQuestions waterfall), `A1-21` (`resolveSessionPreset`), `A1-22` (`isTokenDelta`), `A1-25` (`dsh-client-runtime`), `A1-27` (SessionBinding reads), `A1-30` (`ctx.connection.api`), `A1-31` (subagent descriptor v2→3), `A1-32` (`ctx.uiWorkspace`), `A1-11` (subagent selectors), `A2-05` (`pluginInventory` `agentPresets`), `A2-06` (`ctx.remote.$host`), `A2-08` (`sessionProjections` inject/peer), `A2-10` (`settingsNamespace`), `A2-02` (`RemoteError` vocabulary) | The plugin contains no PTC/code-mode vocabulary, no WebFetch policy surface, no session-log egress, no `userQuestions` answerer, no agent-presets import, no `isTokenDelta`, no client-runtime import, no session-content read, no `connection.api` consumption, no subagent descriptor, no `workspaces` navigation, no subagent selector, no `pluginInventory` consumer, no `$host` read, none of the six tool packages as peers, no `dsh-settings` import, and **no `ctx.remote` call at all** (it is host-plane). `A2-02` in particular only binds once a call becomes a client-plane Remote call |
| `A1-12`, `A1-23`, `A1-24`, `A2-03` (planner "manual review") | Deployment/privacy/packaging surfaces with **no** touchpoint number by design. `A2-03` (peer trims/additions) is worth one review pass because the plugin depends on a DSH package, but it is a dependency-graph decision, not a source change |

Full line-level enumeration of the #3 hit, correcting the planner's first-match-per-file output:

```
index.js:2   // 0.1.1-rc.2 style: injects apiProxy, dot-domain calls.
index.js:3   export const inject = ["apiProxy"]
index.js:6   console.error("[minimal-llm] apply() 执行 — 旧 API（apiProxy）路径")
index.js:9   const providers = await ctx.apiProxy.llm.providers()
index.js:10  console.error("[minimal-llm] apiProxy.llm.providers() 成功 →", …)
index.js:12  console.error("[minimal-llm] apiProxy.llm.providers() 失败 →", …)
```

(`plan-migration.mjs:matchingLine` returns only the first matching line per file per class, hence its single `index.js:2` hit. The functional hits are `:3` and `:9`.)

---

## 5. No-hit classes — evidence per class (the negative scan proper)

**#1 source patch / monkey patch — NO HIT.**
`cordis.patch.yml:1-3` is an ordinary Loader composition overlay (`- insert: - id/name`) with **no `patch:` key**, unlike the canonical `examples/legacy-plugin/cordis.patch.yml`, which carries a real `patch: [patch.yml]` source-patch declaration and therefore *is* a #1 hit. No `patchedDependencies` / `patch-package` / `DSH_HARNESS_SOURCE_ROOT` / `patch-surface` / `monkeypatch` in any file. Classified per **API-08** ("`cordis.patch.yml` is composition, not a source patch"). `dsh.bundle.patch` = `./cordis.patch.yml` is a safe in-package relative path (API-08 §4). → `A1-03` skipped.

**#2 events / persistent events — NO HIT.**
No `SessionEvent`, `session/event`, `ctx.on(`, `subscribe(`, `tool/code-dispatch`, `tools-code-mode`, `connection/reset`. The plugin neither produces nor observes events. Corridor net state computed as required: `ignorable` is removed by `A1-02` and restored by `A2-01`; with no event producer at all, neither card applies and there is no "delete then re-add" trap.

**#3 services / Remote — HIT** (see §4).

**#4 host filesystem — NO HIT.**
No `DSH_HOME`, `.dsh/`, `profiles/`, `homedir(`, `readFile`, `writeFile`, `mkdir`, `openPath`. The plugin never touches the host directory layout; it does not read profile files or write artifacts.

**#5 UI / commands / tools — NO HIT.**
No `registerCommand`, `registerView`, `contributes`, `ctx.tools`, `commands.execute`; no `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`; no `__ModuleLoader__`, `PLUGIN_ID`. There is no client bundle to register and no slot/command contribution.

**#6 custom channels — NO HIT.**
No `createServer(`, `WebSocket`, `MutationObserver`, `insertRule`; no `127.0.0.1`, `localhost`, `router.(get|post|put|delete)(`, `/api/`; no `contenteditable`, `setSelectionRange`, `data-input-scroll`. Corroborated by `inject-lint.mjs`: `rawWebServerRouteFiles: []`, `routeReviewRequired: false`. `A1-08` (bootstrap token / signed cookie gate) and `A1-19` (boot-manifest acceptance) are therefore inapplicable.

**#7 subprocess / output — NO HIT.**
No `node:child_process`, `spawn(`, `exec(File)Sync(`, `execa`, `Bun.spawn`; no `headless`, `--profile`. The plugin spawns nothing and parses no process output, so the Headless argv/stdout/stderr contract (`A1-05`, **API-06**) and the Node 24 loader fix (`A2-04`) do not apply to the plugin.

**No-hit notes (scope):** all 4 scannable files (`package.json`, `index.js`, `cordis.patch.yml`, `src/session-notes.js`) were scanned; `README.md` is skipped by design (Markdown) and was read manually instead; no `node_modules`, `.git`, build output, or vendor tree exists in the fixture; no lockfile exists to scan. Dependencies and configuration were checked separately (§2.1, §5.3) — that is where the invisible finding lives.

---

## 6. Can the zero-hit classes tell you the plugin is compatible? (the question you actually asked)

### 6.1 Judgment

**No.** Six of seven classes are zero-hit and that establishes **nothing** about 0.1.2 compatibility. Three independent reasons, in increasing order of force:

1. **The skill says so, in its own words.** `pre-flight.md` opens with: *"This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."* `plan-migration.mjs`'s Limits section repeats it: *"zero hits do not prove public-contract-only coupling … card sets are curated, not complete API diffs."*
2. **The zero hits are the wrong sample.** This plugin's entire behaviour is one host-plane service call. A scan that looks for events, DOM, channels, subprocesses and UI registration has almost nothing to look at — "6 of 7 clean" here means "the plugin is small", not "the plugin is safe".
3. **The one class that did hit is already disqualifying.** `DSH-0.1.2-A1-01` is `breaking` / `required-if-hit`, its symptom is a permanently pending composition row, and its supporting evidence (`R-05`, `troubleshooting.md` row 3) confirms the service and its package are gone. The compatibility answer is **NO** on the strength of that single hit, before the zero-hit classes are even considered.

### 6.2 What else is needed before any compatibility conclusion can be signed off

Ordered by what blocks a conclusion:

1. **Pin `from` to an exact tag.** The plugin declares no `engines`, no peer range, and ships no lockfile; `dsh-v0.1.1-rc.2` is *inferred* from code style and a dependency version, and an in-source comment is not evidence (`precision-checklist.md`). A mis-pinned `from` mis-selects the whole corridor (`pre-flight.md` §1).
2. **Collect the R-06 baseline — currently impossible here.** This is a static copy: no lockfile, no `node_modules`, no `scripts`, no tests. Build/typecheck baseline = **"not collected"**. (The plugin is plain ESM with no build step, so "static" will reduce to a syntax/type check plus `npm pack`.)
3. **Finish the dependency inventory (R-05 / R-08).** Drop `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (removed in alpha.1) and decide the cohort peer floor. `inject-lint.mjs` currently returns **`FIX-REQUIRED`**: `cordisPeer: null`, `cordisOk: false` — the manifest has no `peerDependencies` block at all, so it cannot carry the `@deepseek-ai/cordis: ^4.0.1` floor that `precision-checklist.md` requires for the alpha.2 cohort. Whether a no-import, plain-JS plugin must declare that peer is a judgement call for the author, but it must be an explicit decision, not an accident.
4. **Confirm the Host-plane target method against the alpha.2 tag.** The card's `llm.providers → llm/listProviders` row is the *client* projection. Confirm the `llm` domain service's actual exports at `dsh-v0.1.2-alpha.2` before writing `ctx.llm.listProviders()` (API-01 best practice 4).
5. **Remove the silent catch.** `index.js:11-13` swallows the failure. Whatever the migration, the error path must surface, or a "no-crash" smoke will pass on a dead feature (rollup layer 3; `A1-30` field note).
6. **Prove the artifact, not the source tree.** `package.json` declares `dsh.bundle.patch` but has **no `files` array**; `npm pack --dry-run --json --ignore-scripts` must show `cordis.patch.yml` inside the tarball, or the install is recognised and then fails on a missing overlay (API-07).
7. **Run the mandatory post-migration verification ladder** (listed, deliberately **not** executed in this read-only task):
   * **Dependency resolution** — `pnpm list --depth 0 | grep @deepseek-ai` all on the target cohort; scan the *whole* lockfile for the old cohort and the 5 removed package names, not just top-level deps (R-05, rollup layer 1).
   * **Static** — typecheck/build with the real `Context`; `skipLibCheck: false` once to surface any implicit `any` (API-10 type-composition section).
   * **Isolated-profile cold boot** — `dsh --profile <p> --dump-config` must show **no pending rows** (specifically no `waiting for service: apiProxy` / `waiting for service: remote`), then a real cold boot with entry activation confirmed.
   * **Functional smoke** — one real round on the migrated path (`llm.listProviders()` success **and** one failure branch), asserting the error surfaces rather than being swallowed.
   * **Wrapper/version caveat** — if `dsh web` is part of the lane, the matrix must include a Node version inside the `A2-04` failure window (24.0–24.11.1, e.g. 24.9), a fixed 24.12+, and a 22 LTS; `engines.node` is unchanged between tags, so do not look for the difference there.

### 6.3 What the zero-hit classes *do* buy you

They are still worth having: they shrink the change surface to a single card and a single dependency line, which makes this a genuinely small migration (one `inject` list, one call site, one dependency, plus the peer-floor decision). What they cannot buy you is the word "compatible".

---

## 7. Report sections required by the skill

* **Pre-existing (Mode C baseline)**: **not collected** — static copy, no lockfile / `node_modules` / build / tests available in this container (§6.2 item 2).
* **Completed (read-only diagnosis only)**: corridor pinned and walked; seven-class scan run with per-class evidence; the single hit mapped to `DSH-0.1.2-A1-01` + API-01 + R-05/R-08; 17 planner-"applicable" cards narrowed to the 1 real hit; `inject-lint` run; fixture integrity proven.
* **Skipped (non-hits, with evidence)**: `A1-02`/`A2-01`, `A1-03`, `A1-04`, `A1-05`, `A1-06`, `A1-07`, `A1-08`, `A1-09`, `A1-10`, `A1-11`, `A1-13`, `A1-19`, `A1-20`, `A1-21`, `A1-22`, `A1-25`, `A1-26`, `A1-27`, `A1-28`, `A1-29`, `A1-30`, `A1-31`, `A1-32`, `A2-02`, `A2-05`, `A2-06`, `A2-08`, `A2-10` — see §4.3 and §5 for the per-card reason.
* **Pending / residual risk**: (a) `from` tag is inferred, not declared; (b) baseline not collected; (c) `cordis` peer floor undecided (`inject-lint: FIX-REQUIRED`); (d) Host-plane `llm` service exports unconfirmed at the target tag; (e) `cordis.patch.yml` presence in the packed artifact unproven (no `files` array); (f) install-channel risk if the `0.0.1-rc.1` pin is ever re-resolved instead of deleted (R-08); (g) `src/session-notes.js` is dead code (never imported) — decide whether to keep it, but it carries no compatibility weight.
* **Rollback baseline recorded**: plugin version `0.1.0`; `package.json` SHA-256 `414ADB49…4508602E`; `index.js` SHA-256 `73066219…17B0A866`; `cordis.patch.yml` SHA-256 `D50C34AE…5CA02ABE`; `src/session-notes.js` SHA-256 `7A321998…C9C673748`; no lockfile exists. Nothing was modified, so rollback is a no-op.
* **Recommendations**: (1) migrate per `A1-01` host-plane recipe (`inject: ["llm"]`, `ctx.llm.listProviders()`), deleting the `dsh-host-apiproxy` dependency; (2) make the failure path loud; (3) declare the cohort peer floor explicitly; (4) keep the plugin on the **public** domain-service seam rather than re-introducing any gateway/client-runtime coupling; (5) re-run this scan after the migration — a second negative scan is only meaningful once the hit is gone.

---

*Prepared read-only under BENCHMARK-AUTH-v1. No file under `fixture/` was created, modified, or deleted; no migration, install, or lifecycle script was executed.*
