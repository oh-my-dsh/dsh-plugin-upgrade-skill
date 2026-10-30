# JUDGE BRIEF · noskill.S2-negative-scan

## Criteria (sealed rubric)
- [host-break] (40pt) Locate index.js inject/apiProxy.llm.providers and map the breaking Host service to A1-01. Explain llm injection/listProviders and the dead apiproxy dependency in package.json; a card name alone earns zero.
- [negative-coverage] (20pt) Account for each of the other six categories with scanned-file evidence. session-notes.js is a pure string/array utility; cordis.patch.yml is ordinary plugin composition, not a host-source patch. Interpret a negative patch conclusion in its touchpoint-category context: wording such as no patch file/declaration under the source-patch category can correctly mean no host-source patch, especially when the scan scope includes the composition file. Do not deduct solely because an ordinary composition file has patch in its name, or require an extra explanation of that naming distinction when the category conclusion and scan evidence are correct. Still deduct for an explicit denial that the existing composition file itself exists, for misclassifying its insertion as host-source modification, or for unsupported negative conclusions. Do not invent coupling from filenames.
- [inference-boundary] (20pt) Explain why no static hits cannot establish compatibility: scan coverage is limited and dependency/config/runtime behavior needs separate evidence. Distinguish the existing decisive apiProxy break from the six negative categories.
- [verification-plan] (20pt) Specify post-migration build/typecheck, an isolated target-version cold boot with no pending, and an actual provider call. These are proposed checks, not checks supposedly executed inside this non-runnable fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S2-negative-scan/S2-negative-scan-report.md

# S2 · Negative Scan Report — @demo/dsh-minimal-llm → dsh 0.1.2-alpha.2

- **Task**: S2-negative-scan ("Zero Hits ≠ Compatible")
- **Scanned target**: `fixture/` (static copy; read-only) — 5 files, 2036 bytes total
- **Mode**: read-only static scan. No file under `fixture/` was modified (all operations were reads). No migration, install, build, or execution was performed.
- **Report location**: `agent-output/S2-negative-scan/S2-negative-scan-report.md`
- **Date**: 2026-10-16

## 0. Method and stated limitations

- **Complete file inventory** (no hidden files present): `package.json`, `cordis.patch.yml`, `index.js`, `src/session-notes.js`, `README.md`.
- **Method**: content-based pattern scan (regex families per touchpoint category) plus a full manual read of every file. The scan is deliberately **not** filename-based — `src/session-notes.js` was specifically inspected because its name suggests host coupling.
- **Not executed**: dsh is not installed in this container and the fixture is a static copy. No build/typecheck/cold-boot/smoke-test was run; per the brief these are mandatory *post-migration* steps, and recommendations are in §5.
- **Stated limitation**: the authoritative seven-category corridor and the 0.1.2 change-card list live in the skill/corridor docs, which this cell is not permitted to read, and no skill is loaded here. Category names below are **reconstructed** from standard Cordis/dsh plugin surfaces; category **#3** ("internal service/Remote") is taken verbatim from the fixture README, which states the plugin "hits only one touchpoint category (#3 internal service/Remote: `apiProxy`)". My independent scan confirms that statement. Change-card *identifiers* are deliberately not cited; the mapping in §3 is semantic (by change family).

## 1. Seven touchpoint categories — verdicts with evidence

| # | Category (reconstructed name) | Verdict | Key evidence |
|---|-------------------------------|---------|--------------|
| 1 | Plugin manifest & registration (`dsh` block, exports, patch ops) | **NO HIT** | package.json:11-14, package.json:9, cordis.patch.yml:1-3 |
| 2 | Plugin lifecycle shell (`inject` / `apply` / `ctx.effect` / dispose) | **NO HIT** | index.js:3, index.js:5, index.js:7 |
| 3 | Internal service / Remote API surface (service injection, dot-domain calls, provider packages) | **HIT** | index.js:3, index.js:9, package.json:17 |
| 4 | Event system (`ctx.on` / `ctx.emit` / `ctx.bail`, event modes) | **NO HIT** | zero matches (loose sweep, all files) |
| 5 | Config schema (`Config` / zod / `ctx.config`) | **NO HIT** | zero matches (loose sweep, all files) |
| 6 | Slots / UI / tools registration | **NO HIT** | zero matches (loose sweep, all files) |
| 7 | Dependencies & runtime environment | **NO HIT** (one flag) | package.json:5, package.json:16-17; no `engines` |

### Category 1 — manifest & registration: NO HIT
- `package.json:11-14` — `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; `exports` also exposes the patch file (`package.json:9`).
- `cordis.patch.yml:1-3` — a single `insert` op carrying only `id: minimal-llm` and `name: "@demo/dsh-minimal-llm"`.
- No removed/renamed manifest keys, no legacy patch ops, no deprecated bundle fields matched any scan pattern. → no *changed* manifest construct is present.
- Caveat: whether 0.1.2 still consumes `dsh.bundle.patch` and the `insert` op identically is a **load-time behavior** a static scan cannot prove (see §4).

### Category 2 — lifecycle shell: NO HIT
- `index.js:3` — `export const inject = ["apiProxy"]`; `index.js:5` — `export function apply(ctx)`; `index.js:7` — `ctx.effect(async () => { ... })`.
- The shell *forms* themselves (inject array, `apply`, `ctx.effect`) show no deprecated-lifecycle pattern. The **content** of the inject array (`"apiProxy"`) is the category-3 surface and is counted once, under category 3.

### Category 3 — internal service / Remote: **HIT** (the only hit in the plugin)
- `index.js:3` — `export const inject = ["apiProxy"]` — injects the internal service under the name `apiProxy`.
- `index.js:9` — `const providers = await ctx.apiProxy.llm.providers()` — dot-domain call convention into that service.
- The source **self-identifies as the old style**: `index.js:2` — "0.1.1-rc.2 style: injects apiProxy, dot-domain calls"; `index.js:6` — log string "旧 API（apiProxy）路径" ("old-API path").
- `package.json:17` — `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` — the host provider package backing that surface, pinned to a release candidate.

### Categories 4, 5, 6 — events / config / slots-UI-tools: NO HIT
- A loose, case-insensitive sweep across all five files for `on(`, `emit`, `bail`, `hook`, `middleware`, `config`, `schema`, `zod`, `z.`, `validate`, `slot`, `ui`, `react`, `component`, `render`, `tool`, `register`, `command`, `prompt` produced **zero matches**. These surfaces are untouched.

### Category 7 — dependencies & runtime: NO HIT (one flag)
- `package.json:5` — `"type": "module"` (ESM). No `engines` field, no dsh-core version pin, no devDependencies/peerDependencies.
- The only dependency is the apiProxy provider package (`package.json:17`), which is counted under category 3. **Flag**: an `rc`-pinned host provider package must be re-resolved against 0.1.2-alpha.2's expected range — that is a resolution-time question, not a source-scan question.

### The decoy, explicitly resolved
- `src/session-notes.js` — the filename suggests session/host coupling, but the content is two **pure utility functions** (`formatSessionNote`, `chunk`; `src/session-notes.js:2-10`). Automated coupling check: references `ctx` = false, `inject` = false, `dsh`/`cordis` = false. **Zero hits — correctly.**
- Note the one raw-grep false positive encountered: `src/session-notes.js:3` matches a naive `/replace/` pattern via `String.prototype.replace`. This is exactly why hits must be judged semantically, not by raw pattern counts.
- Mirror-image lesson of the task title: a *scary filename* can be harmless, and a *clean scan* can still hide risk.

## 2. (merged into §1) — verdict summary

**1 hit / 6 no-hit.** The single hit is the apiProxy internal-service/Remote surface (category 3). Everything else in the plugin — manifest, lifecycle shell, events, config, slots/UI/tools, and the suspicious-looking `src/session-notes.js` — is zero-hit on content.

## 3. Mapping the hit to the 0.1.2 change cards

All three category-3 evidence points belong to **one change-card family**: the 0.1.2 change of the apiProxy / internal-service-Remote surface. Mapping by change family:

| Fixture evidence | Surface that changed in 0.1.2 | Migration consequence |
|------------------|------------------------------|----------------------|
| `inject = ["apiProxy"]` (index.js:3) | the injectable internal-service name | acquire the service under its 0.1.2 name/shape |
| `ctx.apiProxy.llm.providers()` (index.js:9) | the dot-domain call convention on that service | rewrite the call to the 0.1.2 call form |
| `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (package.json:17) | the host provider package + version range backing the surface | re-pin to the 0.1.2-compatible provider/range |

Migration consequence in one line: rewrite `index.js`'s service acquisition and call to the 0.1.2 surface and re-pin the provider dependency; until then the plugin will at best take its catch/log path (`index.js:12`) and at worst fail to resolve the service at cold boot.

On card identifiers: the exact card IDs live in the corridor docs (`skills/`), outside this cell's permitted read scope, and are deliberately not cited; the mapping above is by change family, which is what the evidence supports.

## 4. Judgment: do the six zero-hit categories mean "compatible with 0.1.2"?

**No. Zero hits ≠ compatible.** The scan result reads: "no *known broken pattern* from the corridor's changed surfaces appears in this source." It does **not** read: "this plugin will run on 0.1.2." Basis:

1. **A pattern scan is only sound against its pattern list.** Six zero-hit categories mean the source does not touch those surfaces *in ways the patterns recognize*. Absence of a match is not evidence of correctness — `session-notes.js` is zero-hit and harmless, but that is a fact about its content, not a guarantee about anything else.
2. **The scan cannot see through the dependency.** `package.json:17` pins `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`. Whether that rc satisfies 0.1.2-alpha.2's expected provider range is a resolution-time question that no source scan can answer. If the range moved, `ctx.apiProxy` will not resolve even though the call site "looks" fine.
3. **Load-time behavior is invisible to a static scan.** `cordis.patch.yml` is applied by the host at bundle/registration time; plugin-id resolution (`minimal-llm` vs `name: "@demo/dsh-minimal-llm"`) and how `dsh.bundle.patch` is consumed are runtime behaviors. A zero-hit manifest scan cannot prove 0.1.2 reads them the same way.
4. **Semantic drift on a matched surface fails silently here.** The one hit is precisely the kind of surface the corridor flags because it changed. The try/catch at `index.js:8-13` means a wrong migration produces a **log-only error path** — a naive "plugin loaded" check would still pass.
5. **The scan is static and nothing was executed.** No build, no typecheck, no cold boot, no functional run happened (dsh is not installed in this container). Even a perfect zero-hit scan is a paper check.

Correct reading of the result: **one required migration (the apiProxy surface), no additionally detected touchpoints, and compatibility unproven until verified.**

## 5. What is needed before concluding compatibility

1. **Corridor/change-card check for the one hit** — confirm the exact 0.1.2 replacement for the apiProxy surface (service name, call convention, provider package + version range) against the change cards / 0.1.2 release notes, then rewrite `index.js` accordingly and re-pin `package.json:17`.
2. **Mandatory post-migration verification (per the brief; not run in this task)**:
   - **Build / typecheck** — at minimum an ESM syntax/load check of `index.js` and `src/session-notes.js`;
   - **Isolated-profile cold boot** — fresh dsh profile, install the migrated plugin, confirm the patch `insert` applies, `apply()` runs, and the apiProxy/equivalent path does **not** take the catch branch (`index.js:12`);
   - **Functional smoke test** — invoke the migrated `providers()` path and assert the **returned data shape**, not merely the absence of a thrown error.
3. **Re-run this seven-category scan after the rewrite** to confirm the category-3 hit is gone and no new touchpoints were introduced.

## 6. Limitations of this report

- The category taxonomy is reconstructed; the authoritative corridor and change-card IDs live in the skill/corridor docs, which this cell is not permitted to read or cite. The fixture README's own statement ("hits only one touchpoint category, #3 internal service/Remote: `apiProxy`") matches my independent content scan.
- Static scan only; nothing was executed; the fixture was not modified (read-only operations only, verified).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.