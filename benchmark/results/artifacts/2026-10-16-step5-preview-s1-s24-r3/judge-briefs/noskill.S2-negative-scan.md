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

# S2 · Negative Scan Report — `@demo/dsh-minimal-llm`

**Target migration:** dsh `0.1.1-rc.2` → `0.1.2-alpha.2`  
**Scan type:** static, read-only source scan (no build, no execution, no migration performed)  
**Fixture scanned (read-only):** `package.json`, `index.js`, `cordis.patch.yml`, `README.md`, `src/session-notes.js`

**Integrity:** the fixture was opened read-only only. File sizes recorded before/after the scan are identical (68 / 619 / 361 / 599 / 389 bytes). No file under the fixture tree was created, edited, moved, or deleted.

---

## 0. Method & a note on scope

This is the **no-skill** cell: the migration skill (its canonical seven-category list, the ordered *corridor*, and the `DSH-0.1.x-xx` change cards) is **outside the allowed read paths**, so it was not read or cited. The taxonomy below is therefore **reconstructed** from (a) the observable source, (b) the fixture README, which states the plugin "hits only one touchpoint category (#3 internal service/Remote: `apiProxy`)", and (c) the standard host-coupling surfaces of a dsh/Cordis plugin. I scan **every** plausible host-coupled surface so the hit/no-hit evidence is grounded in code, and I keep the reconstruction transparent rather than inventing card IDs that cannot be verified.

Definition used here — a *touchpoint hit* means: **the plugin uses a host-coupled surface that the 0.1.2 corridor could change.** Boilerplate that the corridor does not touch is reported as no-hit with that reasoning stated.

---

## 1. Plugin inventory (what actually couples to the host)

The plugin is tiny and has **zero `import`/`require` statements** — it is fully self-contained. All host coupling lives in `index.js`:

| Location | Code | Nature |
|---|---|---|
| `index.js:3` | `export const inject = ["apiProxy"]` | service-injection declaration (obtains the `apiProxy` host service) |
| `index.js:5` | `export function apply(ctx)` | plugin entry (standard) |
| `index.js:7` | `ctx.effect(async () => { … })` | lifecycle effect (standard) |
| `index.js:9` | `const providers = await ctx.apiProxy.llm.providers()` | **dot-domain call into the internal `apiProxy` service** |
| `package.json:17` | `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` | pinned dependency on the apiProxy host-service package (RC) |
| `package.json:9,13` / `cordis.patch.yml:1-3` | `exports` → `./cordis.patch.yml`; `dsh.bundle.patch`; `insert: [{id: minimal-llm, …}]` | packaging / manifest (standard) |

`index.js:1-2` self-labels the path as *"hits only one touchpoint category, #3"* and *"0.1.1-rc.2 style … 旧 API（apiProxy）路径"* — the author already flags `apiProxy` as the legacy surface.

---

## 2. Seven touchpoint categories — hit / no-hit with evidence

| # | Category | Verdict | Evidence (from source) |
|---|---|---|---|
| 1 | **Packaging / manifest / dependency declarations** (`exports`, `dsh.bundle.patch`, `cordis.patch.yml`, npm pins) | **No hit (1 flag)** | `cordis.patch.yml` uses the plain `insert` form; `package.json` `exports`/`dsh.bundle.patch` are standard. **Flag, not a confirmed break:** the dep `@deepseek-ai/dsh-host-apiproxy` is pinned to an **RC (`0.0.1-rc.1`)**; its compatibility with a `0.1.2-alpha.2` host is unverified. |
| 2 | **Plugin entry & lifecycle contract** (`inject`, `apply`, `ctx.effect`, reload/dispose) | **No hit** | `apply(ctx)` + `ctx.effect()` are standard scaffolding the corridor does not change. The `export const inject = ["apiProxy"]` line is mechanically entry-level but exists *only* to obtain the category-3 service, so its substance is counted under #3, not here. |
| 3 | **Internal service / Remote (host-service coupling)** (`ctx.<svc>…`, dot-domain namespaces) | **HIT** | `index.js:3` `export const inject = ["apiProxy"]` **and** `index.js:9` `ctx.apiProxy.llm.providers()` — a dot-domain call into an internal host service. This is the single real touchpoint. |
| 4 | **Config schema** (`export const Config`, schema/validate) | **No hit** | grep across all files: no `Config`, `Schema`, `schema`, or `validate`. |
| 5 | **Events** (`ctx.on/once/emit`, event bus) | **No hit** | no `on(`, `emit`, `once(`, or `EventEmitter` anywhere. |
| 6 | **Slots / UI / view & theme tokens** (`ctx.slot`, components, render, theme) | **No hit** | no `slot`, `view`, `component`, `render`, React/JSX/TSX, or theme tokens anywhere. |
| 7 | **Tools / commands / service providers** (tool/command registration, `ctx.provide`) | **No hit** | no `tool`, `command`, `provide(`, `registerTool`, or `addCommand`. |

**Net:** exactly **one** touchpoint category is hit — **#3 internal service / Remote (`apiProxy`)**. Categories 1, 2, 4, 5, 6, 7 are no-hit (with one dependency-version *flag* under #1).

---

## 3. Decoy correctly cleared: `src/session-notes.js`

The filename (`session-notes`) and the symbol `formatSessionNote` invite a false "session" touchpoint. The code is **pure utility** — `String().trim().replace().slice()` and an array chunker. Verified programmatically: it contains **none** of `ctx`, `apiProxy`, `effect`, `slot`, `on(`, `emit`, `Config`, `schema`, `provide`, `inject`, `Remote`, `fetch`, `import`, or `require`. **No host coupling → no hit.** The "session" in the name is historical, not a coupling surface. (This file is not even referenced by `index.js`/`package.json`; it is dead weight.)

---

## 4. Mapping the hit to the change corridor

Because the skill card list is outside the allowed paths, this maps **by surface**, not by card ID:

- **#3 hit (`inject: ["apiProxy"]` + `ctx.apiProxy.llm.providers()`) → the change card(s) covering the internal-service / Remote access API between `0.1.1-rc.2` and `0.1.2-alpha.2`.** The source itself marks this as the *"旧 API（apiProxy）路径"* / *"0.1.1-rc.2 style"*, i.e. the legacy service-access path the corridor is expected to have changed. Migration action: rewrite the `apiProxy` access (both the `inject` declaration and the `ctx.apiProxy.llm.providers()` dot-domain call) to the `0.1.2` service API defined by that card.
- **#1 flag (`@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1`) → the dependency/pinning card for the apiProxy host-service package.** Confirm (or bump to) the version the `0.1.2-alpha.2` host ships/accepts.

**To map these to exact `DSH-0.1.x-xx` card IDs and read the precise before/after API, the migration must be run with the skill corridor available** — that list is not present in this cell.

---

## 5. The key question: do the no-hit categories tell me it is compatible with 0.1.2?

**No. Zero-hit categories cannot certify 0.1.2 compatibility.** Three independent reasons:

1. **There is a confirmed hit.** The plugin is *not* all-clear: category #3 (`apiProxy`) intersects the migration corridor and must be migrated. "Mostly no-hit" does not mean "compatible."
2. **A zero-hit is an absence-of-evidence, not evidence-of-compatibility.** The scan only proves *"this visible source does not use the surface probed."* It does **not** prove *"0.1.2 did not change something this plugin relies on."* The authority on what changed is the corridor/change set; a usage scan can only confirm presence or absence of usage, never safety. (Reassuring but insufficient: this plugin has no imports, so no *transitive* coupling is smuggled in — but that only shrinks the blind spot, it does not close it.)
3. **Static scan does not equal a running system.** It cannot see runtime/dynamic coupling, and it cannot validate the pinned RC dependency. Concretely, `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` is pinned to a pre-release; a "no code hit" plugin can still break purely because that pinned package is incompatible with the `0.1.2-alpha.2` host. And in this cell the plugin is a static copy — dsh is not installed and nothing is executable, so no runtime evidence exists at all.

**Verdict:** the plugin is *small and likely cheap to migrate*, but it is **not established as compatible**. It has exactly one touchpoint to migrate (#3), one dependency to confirm (#1), and zero runtime evidence.

---

## 6. What is needed before concluding "compatible"

1. **Migrate the #3 surface** (`inject: ["apiProxy"]` and `ctx.apiProxy.llm.providers()`) to the `0.1.2` internal-service/Remote API per the relevant change card.
2. **Resolve the #1 dependency flag:** confirm `@deepseek-ai/dsh-host-apiproxy` is compatible with `0.1.2-alpha.2` (bump/pin per the card if not).
3. **Run the mandatory post-migration verification** (not done here; this task is scan-only):
   - **build / typecheck** — the plugin compiles against the `0.1.2` types;
   - **isolated-profile cold boot** — load the plugin under a clean `0.1.2` profile and confirm it applies without error (this exercises `apply()`/`ctx.effect()`/service injection for real);
   - **functional smoke test** — actually call the migrated apiProxy path and assert it returns providers, i.e. prove the #3 surface works end-to-end.
4. Only after (1)–(3) pass can compatibility be asserted. Until then the honest statement is: *"one touchpoint identified and pending migration; no counter-evidence in the other six categories; compatibility unverified."*

---

## 7. One-line summary

`@demo/dsh-minimal-llm` hits **exactly one** touchpoint category — **#3 internal service / Remote (`apiProxy`)**, via `inject: ["apiProxy"]` (`index.js:3`) and `ctx.apiProxy.llm.providers()` (`index.js:9`) — with a secondary dependency-pin flag on `@deepseek-ai/dsh-host-apiproxy:0.0.1-rc.1`; `src/session-notes.js` is a benign utility decoy with zero coupling. **The six zero-hit categories do not establish 0.1.2 compatibility** — the plugin still has a live touchpoint to migrate plus an RC dependency to confirm, and only a build/typecheck + isolated-profile cold boot + functional smoke test against a real `0.1.2` runtime can close the question.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.