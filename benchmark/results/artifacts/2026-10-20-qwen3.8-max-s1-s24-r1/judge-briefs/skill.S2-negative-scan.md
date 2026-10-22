# JUDGE BRIEF · skill.S2-negative-scan

## Criteria (sealed rubric)
- [host-break] (40pt) Locate index.js inject/apiProxy.llm.providers and map the breaking Host service to A1-01. Explain llm injection/listProviders and the dead apiproxy dependency in package.json; a card name alone earns zero.
- [negative-coverage] (20pt) Account for each of the other six categories with scanned-file evidence. session-notes.js is a pure string/array utility; cordis.patch.yml is ordinary plugin composition, not a host-source patch. Interpret a negative patch conclusion in its touchpoint-category context: wording such as no patch file/declaration under the source-patch category can correctly mean no host-source patch, especially when the scan scope includes the composition file. Do not deduct solely because an ordinary composition file has patch in its name, or require an extra explanation of that naming distinction when the category conclusion and scan evidence are correct. Still deduct for an explicit denial that the existing composition file itself exists, for misclassifying its insertion as host-source modification, or for unsupported negative conclusions. Do not invent coupling from filenames.
- [inference-boundary] (20pt) Explain why no static hits cannot establish compatibility: scan coverage is limited and dependency/config/runtime behavior needs separate evidence. Distinguish the existing decisive apiProxy break from the six negative categories.
- [verification-plan] (20pt) Specify post-migration build/typecheck, an isolated target-version cold boot with no pending, and an actual provider call. These are proposed checks, not checks supposedly executed inside this non-runnable fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S2-negative-scan/report.md

# S2 · Negative Scan Report — @demo/dsh-minimal-llm → dsh 0.1.2-alpha.2

Read-only pre-flight scan (plugin-upgrade skill, Mode C step 0–4 preparation; no writes to the fixture, no installs, no migrations executed).
Scan date: 2026-10-20. Scanner: solver agent (skill arm).

## 0. Identity and version corridor

| Item | Value | Evidence |
|---|---|---|
| Plugin | `@demo/dsh-minimal-llm` v0.1.0, private, ESM (`"type": "module"`), main `index.js` | fixture/package.json:2–8 |
| Face | Ordinary host-plane Cordis plugin (no `dsh.client` key in package.json → not a Web Client plugin) | package.json full read |
| Composition | `dsh.bundle.patch → ./cordis.patch.yml`; row `insert: { id: minimal-llm, name: "@demo/dsh-minimal-llm" }` | package.json:9–15, cordis.patch.yml:1–3 |
| Dependencies | `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` (declared; never imported in source). No peerDependencies, no engines, no lockfile, no `dsh-plugin.json`, no scripts block | package.json:16–18; import/require grep: 0 source hits |
| `from` pin | 0.1.1-rc.2 generation — inferred from source self-declaration ("0.1.1-rc.2 style", index.js:2) + rc-cohort dependency (`0.0.1-rc.1`) + fixture README claim. No git metadata/lockfile in the static copy, so this is an inference, not a measured tag | index.js:2, package.json:17 |
| `to` pin | `dsh-v0.1.2-alpha.2` (user-stated target). Caveat: the API ledger records that no final `dsh-v0.1.2` tag existed at ledger time; "compatible with 0.1.2" is only decidable against a concrete 0.1.2-series version and must be re-checked at final release | api-migration-0.1.2-alpha.2.md header |
| Corridor | rc.2 → alpha.1 (28 cards, references/v0.1.2-alpha.1.md) → alpha.2 (8 cards, references/v0.1.2-alpha.2.md), chained by from→to metadata in references/README.md, not by filename order | references/README.md corridor index rows 2–3 |
| Ghost-host check (pre-flight 1.5) | Not applicable: static copy, no running host process to pin; `from` pinned by source evidence above | task statement |
| Baseline (Mode C step 0) | **Not collected** — the fixture is non-executable (dsh not installed), the task forbids installation/execution, and package.json declares no build/typecheck/test scripts at all. Pre-existing-failure exemption list therefore unavailable; the absence of any mechanical suite is itself recorded as a gap | package.json; task constraints |

## 1. Touchpoint checkup (@demo/dsh-minimal-llm, rc.2-gen → 0.1.2-alpha.2)

Method: full-text read of all 5 fixture files (≈50 lines total) + the pre-flight regex battery (both patterns of each class) run read-only over the fixture. No directories excluded (no node_modules/vendor/generated artifacts present).

| Touchpoint | Hit | File/line evidence | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | **No** | Pattern battery: 0 hits (`patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT`, `monkeypatch`, …). `cordis.patch.yml` exists but is the official Loader **composition overlay**, not a source patch — filename alone is not a class-#1 hit (pre-flight #1; API-08 negative-control rule) | — (API-08 classification) | High: full read confirms no host-file replacement, no diff hunks, no writes to published artifacts |
| #2 internal events / persistent events | **No** | 0 hits (`SessionEvent`, `ctx.on(`, `subscribe(`, `session/event`, `tool/code-dispatch`, `connection/reset`). `src/session-notes.js` is a **filename false-suspect**: pure string/array utilities (`formatSessionNote`, `chunk`), zero host coupling | — | High: file read in full; "session" is naming habit only |
| #3 internal service probes / Remote | **YES** | index.js:3 `export const inject = ["apiProxy"]`; index.js:9 `await ctx.apiProxy.llm.providers()`; package.json:17 dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` | **DSH-0.1.2-A1-01** (APIProxy removed); rollup **R-05** (dependency is one of the 5 packages removed rc.2→alpha.1); ledger **API-01** (plane-split migration recipe) | High: direct pattern hits, confirmed by full read |
| #4 host filesystem reads/writes | **No** | 0 hits (`DSH_HOME`, `.dsh/`, `profiles/`, `homedir(`, `readFile`, `writeFile`, `mkdir`, `openPath`) | — | High |
| #5 internal UI / commands / tools | **No** | 0 hits (`registerCommand`, `registerView`, `contributes`, `ctx.tools`, `dsh-client-runtime`, `ctx.slots`, `useSession`, `useChat`, `__ModuleLoader__`, `PLUGIN_ID`). Consistent with the host-plane face (no `dsh.client`); all client-side cards (A1-03/09/10/25/26/28/29, A2-04/05/06, API-10) are inapplicable by face | — | High |
| #6 custom HTTP/WS/RPC/DOM/CSS channels | **No** | 0 hits (`createServer(`, `WebSocket`, `MutationObserver`, `insertRule`, `127.0.0.1`, `localhost`, `router.*`, `/api/`, `contenteditable`, …). No channel surface → A1-08 auth gate not triggered | — | High |
| #7 subprocess / stdout-stderr parsing | **No** | 0 hits (`node:child_process`, `spawn(`, `exec*Sync(`, `execa`, `Bun.spawn`, `headless`, `--profile`) | — | High |

No-hit notes: scan scope = every tracked file in the fixture (5 files); zero hits were **additionally corroborated by full-text reading**, because a pattern no-hit alone is not evidence (see §3).
Net card review: all 36 corridor cards (28 + 8) were checked against the hit surface and the plugin's face; only A1-01 intersects. A2-01/02/03/04/05/06/08/10 and the remaining A1 cards have no consumer in this source. Cards are a curated list, not a complete API diff (SKILL Mode C step 4) — the review bounds card-applicable risk, not all risk.

## 2. Hit → card mapping and migration direction (plan only; nothing executed)

**H1 · `apiProxy` injection + call (index.js:3,9) → DSH-0.1.2-A1-01 / API-01**
- Breakage on alpha.2: the `apiProxy` service key no longer exists in the host composition and the owning package was deleted. A required `inject` on a missing service leaves the plugin **permanently pending — it silently never activates**; there is no crash to observe.
- Plane determination (A1-01 field note): this is a **host-plane** plugin. Correct migration = skip the gateway, inject the owning domain service directly:
  `export const inject = ["llm"]` → `await ctx.llm.listProviders()`.
  The old single `llm.providers()` **splits into two** results: `listProviders` + `listConfigurableProviders` (A1-01 table row) — a mechanical rename is not enough.
  Anti-pattern: switching to `inject: ["remote"]`/`ctx.remote.*` on the host plane hangs forever (`pending (waiting for service: remote)`) — that projection is client-plane only.
- **Pending confirmation** (do not guess): the exact owning package/peer coordinates of the `llm` domain service at tag `dsh-v0.1.2-alpha.2` are not named in the cards; confirm against the target tag's generated declarations before adding any dependency.

**H2 · dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (package.json:17) → rollup R-05 + A1-01 identifiers note**
- The package is on the rc.2→alpha.1 removal list; alpha.1 deletes it from the host tree. The source never imports it — it is a **declared-but-dead rc-cohort dependency** that a pure import-grep would miss. Remove it; an install that still resolves this stale package is mixed-cohort and "a successful install with mixed old/new peers is not a migration" (SKILL C-5).

**H3 · landing discipline (post-migration writes, per precision-checklist)**
- After the code fix: declare coherent peers for the alpha.2 cohort (`@deepseek-ai/cordis` at exactly `^4.0.1`; every `@deepseek-ai/dsh-*` peer floor on the target cohort, no `-rc` survivors); today the plugin declares **no peers at all**, so nothing enforces the corridor. Keep `dsh.bundle.patch` + `exports["./cordis.patch.yml"]` consistent and prove the yml lands in the packed artifact (API-08 pt.4: `npm pack --dry-run --json --ignore-scripts`). Choose the plugin's own SemVer bump separately from the DSH host version.

## 3. Question 3 — can the zero-hit categories tell you this plugin is compatible with 0.1.2?

**Judgment: No. Zero hits ≠ compatible — and in this fixture the answer is moot anyway, because the scan did hit: the plugin is NOT compatible with 0.1.2-alpha.2 as-is (H1/H2 are breaking, action level required-if-hit).**

Even setting the hit aside, the six zero-hit categories could not have proven compatibility. Basis:

1. **The scan is normative-heuristic, by its own contract.** pre-flight.md header: "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests." SKILL Mode C step 3 says the same: zero hits still require checking dependencies/imports and running build plus a real mount. The seven classes cover **source-code coupling surfaces**; compatibility also lives in surfaces no class greps:
2. **Dependency/manifest surface — this fixture is the counterexample.** package.json declares a removed-cohort package (H2) that no source line imports. A source-pattern scan with perfect patterns and zero hits would still have missed the only thing that breaks the install. Likewise: no peerDependencies/engines (nothing pins the corridor), `dsh.bundle.patch`/`exports` packing correctness, and cordis.patch.yml composition semantics (whole-config replacement, alpha.2 layer precedence) — all outside the seven classes.
3. **Pattern silence ≠ semantic safety.** Regexes match spelling, not contracts: a service renamed behind an unchanged-looking call shape, an envelope/wire-contract change, or a curated-card blind spot ("cards are a curated list, not a complete API diff") all evade the battery. The fixture shows the mirror-image error too: `session-notes.js` and `cordis.patch.yml` are filename false-suspects for #2/#1. Both directions need judgment; here the zero hits are trustworthy **only because they were corroborated by reading all 5 files end-to-end** — feasible for a 50-line fixture, not a substitute for verification in a real repo.
4. **Failure on alpha.2 would be silent, so "no symptoms" proves nothing.** With `inject = ["apiProxy"]`, the plugin just never activates (pending on a nonexistent service) — no crash, no stack. And even an activated plugin here swallows errors: index.js:11–13 catches everything into `console.error` (the "forever blank" masking pattern the A1-30 note warns about). Absence of visible errors is not evidence of compatibility; only **positive proof** is: activation observed, required services resolved, the functional path executed with its success branch asserted.
5. **What is still needed before anyone may conclude "compatible"** (mandatory post-migration steps; listed, not executed, per task):
   - Baseline mechanical suite in the repo's own dependency state (Mode C step 0 / R-06) — here **not collectible** (non-executable copy, no scripts declared); record as gap and add at least a typecheck/test when migrating.
   - Dependency resolution: install against the alpha.2 cohort with the project's package manager; scan the **full lockfile** for the old cohort and for `dsh-host-apiproxy`, not just top-level deps.
   - Enablement resolution: isolated profile's composition points at this package, no duplicate/stale rows (`dsh --profile <name> --dump-config` without GUI/model).
   - Static: build/typecheck (diagnostic run with `skipLibCheck: false` if any selector degrades to `any`), close out precision-checklist.
   - Runtime: cold-boot a real DSH alpha.2 profile (scripts/verify-runtime.mjs runs this layer end-to-end with failure attribution); assert the plugin **activates** and no required/provided service stays pending.
   - Behavior/smoke: exercise the migrated path — `ctx.llm.listProviders()` success branch plus one failure branch (A1-01 verification rule), and the second split call `listConfigurableProviders`.
   - Wrapper/packaging: packed filename and manifest carry the plugin's own version; `cordis.patch.yml` present in the pack.

## 4. Report sections per SKILL "Validation and reporting"

- **Pre-existing (baseline)**: not collected (non-executable static copy; no scripts in package.json; task forbids installs/execution).
- **Completed**: read-only identity + corridor pinning; seven-class scan with line-level evidence and full-read corroboration; net review of all 36 corridor cards; hit→card mapping (A1-01, R-05, API-01, API-08, precision-checklist peer floors); migration direction and negative-scan judgment (this report). No file under the fixture was modified; no migration/install was executed.
- **Skipped**: client-plane cards (face = host plugin); A1-08 channel auth (no channel); #1 source-patch handling (cordis.patch.yml classified as composition per API-08); baseline run (see above); all runtime verification layers (out of task scope, listed as mandatory post-migration).
- **Pending / residual risk**: exact `from` tag unmeasurable from the static copy (inference recorded in §0); `llm` domain-service owning package/peer coordinates must be confirmed at the target tag (not named in cards — marked pending, not guessed); no final `dsh-v0.1.2` tag existed at ledger time → re-verify at final release; plugin has no mechanical suite at all.
- **Rollback**: not applicable — this task performed no writes to the fixture and no installs. (For the future migration: record HEAD/version, lockfile hash, and cordis.patch.yml/ package.json hashes before writes; recover only paths owned by the migration.)
- **Recommendations**: when migrating, do H1+H2+H3 together in one dedicated branch; add a minimal typecheck/smoke script so future corridors have a baseline; keep the `console.error` catch but re-throw or surface activation failures so silent-pending states become observable in tests.

— End of report. Fixture untouched (read/grep only); all scan output reproduced above from read-only commands.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.