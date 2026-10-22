# S2 · Negative Scan Report — `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

Task: read-only touchpoint scan of the static plugin source in `/app/fixture/` (5 files), hit/no-hit verdict per touchpoint category, mapping of hits to change cards, and a judgment on whether zero-hit categories can prove compatibility with 0.1.2.

## 0. TL;DR

- **The premise "tiny plugin, should have no compatibility problems" is false.** The scan hits **one** of the seven touchpoint categories — **#3 internal service/Remote (`apiProxy`)** — at 3 code sites plus 1 dependency. `apiProxy` is the legacy 0.1.1-rc.2 host-access surface; per the migration corridor it is removed/redesigned in 0.1.2-alpha.2, so the plugin **will not run as-is** on the target version. A migration edit is required.
- **The six zero-hit categories do NOT prove compatibility** (§4). Zero hits only rules out the *known deprecated patterns enumerated by the corridor*; compatibility is a positive property that must be established by the mandatory post-migration verification (§5). **Zero hits ≠ compatible.**
- Fixture integrity: all 5 files sha256-verified identical to `fixture-hash-before.json`; nothing under `/app/fixture/` was modified, executed, or installed. All writes went to `/app/agent-output/S2-negative-scan/` only.

## 1. Scope, method, and arm limitation

**Scanned (complete corpus, all read in full — no sampling):**

| File | Lines | Role |
|---|---|---|
| `index.js` | 15 | plugin entry: `inject` + `apply(ctx)` |
| `package.json` | 19 | manifest: `dsh.bundle.patch`, exports, dependencies |
| `cordis.patch.yml` | 3 | cordis service patch (`insert`) |
| `src/session-notes.js` | 11 | pure utility functions |
| `README.md` | 5 | fixture notes (confirms category numbering: #3 = internal service/Remote) |

**Method:** exhaustive full-text reading + read-only pattern greps (`apiProxy`/`apiproxy`, `@deepseek-ai`, `inject`, `ctx.`, `effect|dispose`, `apply`, `providers|llm`, `cordis|insert|patch`, `dsh|bundle`, `tool`, `slot|theme|render|ui`, `event|emit|subscribe`, `config|schema`, `session`, `import|require`, `engines|peerDependencies|version`). Verdicts are semantic (full read), not keyword-only — see the decoy note in §2.

**Arm limitation (disclosed):** this cell contains no copy of the corridor's change-card catalog. The seven-category frame below is reconstructed from (a) the fixture README, which authoritatively names category **#3 = "internal service/Remote: `apiProxy`"**, and (b) the coupling surfaces the dsh plugin runtime declares (Service / Event / Config / Tool / Slots / Theme / lifecycle / manifest). Card IDs in §3 are **locally assigned placeholders (TC3-C1…C3)**; when executing the migration, substitute the corridor's exact card IDs. This limitation is itself one reason zero-hit verdicts cannot be treated as a compatibility proof (§4, point 2).

## 2. Per-category verdicts (seven touchpoint categories)

| # | Category | Verdict | Evidence (file:line) |
|---|---|---|---|
| TC1 | Manifest & bundle metadata (`package.json`: `dsh.*` fields, `exports`, `main`, `type`, version/engine ranges) | **NO-HIT** (residual unknown, see note) | Scanned `package.json:3-15`: `"version": "0.1.0"`, `"type": "module"`, `"main": "index.js"`, `"exports"` (incl. `./cordis.patch.yml`), `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`. No known-broken manifest pattern. No `engines`/`peerDependencies` constraints at all. |
| TC2 | cordis service patch / registration (`cordis.patch.yml`) | **NO-HIT** (residual unknown, see note) | `cordis.patch.yml:1-3`: `- insert:` / `id: minimal-llm` / `name: "@demo/dsh-minimal-llm"`. Plain insert patch, service name matches `package.json:2`. No removed patch verbs or renamed keys observed. |
| TC3 | **Internal service / Remote (`apiProxy`)** | **HIT** | ① `index.js:3` `export const inject = ["apiProxy"]` — injects the legacy internal-service surface. ② `index.js:9` `await ctx.apiProxy.llm.providers()` — dot-domain call through the proxy (self-labeled "0.1.1-rc.2 style" at `index.js:2`). ③ `package.json:17` dependency `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` — the legacy host-apiproxy binding package. (Also cosmetic references in log strings `index.js:6,10,12`.) |
| TC4 | Plugin lifecycle & context contract (`apply` / `inject` mechanism / `ctx.effect` / `dispose`) | **NO-HIT** | `index.js:5` `export function apply(ctx)`, `index.js:7` `ctx.effect(async () => {...})`. Standard entry contract, no deprecated lifecycle signature. (The injected *name* `"apiProxy"` is TC3 evidence, not a TC4 problem — the inject mechanism itself is unchanged.) No `dispose` usage. |
| TC5 | Tool registration & schema | **NO-HIT** | Grep `tool` → 0 matches in source (only the unrelated word "utility" in a comment). Plugin registers no tools. |
| TC6 | Client surface: Slot / UI / theme / client half | **NO-HIT** | Grep `slot|theme|render|ui` → 0 matches. Host-side-only plugin; no client contribution, no theme token usage. |
| TC7 | Event / messaging & plugin Config schema | **NO-HIT** | Grep `event|emit|subscribe` → 0 matches; `config|schema` → 0 matches. No listeners, no config entries. |

**Decoy / false-positive note (why this scan is semantic, not keyword-based):** `src/session-notes.js` and its filename match the keyword "session" (`src/session-notes.js:1-2`, `formatSessionNote`), which a naive grep could flag as a host-session-API touchpoint. Full reading shows two **pure** string/array utilities (`formatSessionNote`, `chunk`) with zero imports, zero host coupling, zero side effects — confirmed **zero touchpoints**. This cuts both ways and is part of the §4 argument: keyword scanning yields both false positives (here) and potential false negatives (renamed/re-exported surfaces), so even the zero-hit verdicts above rest on the full read of the entire corpus, which is only trustworthy because the corpus is 5 files.

## 3. Hit touchpoints → change-card mapping (category TC3)

Card IDs are locally assigned (corridor catalog not available in this cell — see §1); each card states the break and the affected sites.

| Card (local ID) | Change (key point) | Affected sites | Required migration action (NOT executed — scan-only task) |
|---|---|---|---|
| **TC3-C1** | `apiProxy` injected internal-service/Remote surface removed in the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor; host capabilities are exposed through the cordis Service/Provider architecture instead | `index.js:3` | Drop `"apiProxy"` from `inject`; declare the successor service/provider per the corridor's mapping table |
| **TC3-C2** | Dot-domain proxy calls (`ctx.apiProxy.llm.providers()`) replaced by declared service-method calls | `index.js:9` (and log strings `index.js:6,10,12`) | Rewrite the call site to the 0.1.2 service API; the exact successor method must be taken from the corridor doc or a live cordis Service inspection (`listService`) on a 0.1.2-alpha.2 host |
| **TC3-C3** | Legacy binding package `@deepseek-ai/dsh-host-apiproxy` (pinned `0.0.1-rc.1`) retired | `package.json:17` | Remove the dependency; add a replacement only if the successor API requires one; re-resolve the lockfile against 0.1.2-alpha.2 |

**Corroborating observation (environment evidence, read-only):** the DSH host runtime installed in this environment exposes, via its inspect directory, only `Service`, `Event`, `Config`, `Tool` providers (host platform) and `Service`, `Event`, `Builtin`, `Slots`, `Theme` (client platform) — the string "apiProxy" appears **nowhere** in the live runtime surface listing. This is consistent with TC3-C1/C2: the proxy surface no longer exists on the modern host, and LLM-provider access must go through a declared Service.

**Non-hit sides of the migration:** `cordis.patch.yml` and the manifest need no *known* edit; they stay as-is pending the boot verification in §5 (items 3-4).

## 4. Key question: can the zero-hit categories tell you this plugin is compatible with 0.1.2?

**Judgment: No. Zero hits ≠ compatible.** The six no-hit verdicts are useful risk triage, not a compatibility certificate. Basis:

1. **Logical asymmetry of negative scans.** A touchpoint scan tests for the presence of *known deprecated patterns*. "Pattern absent" proves only that the specific breakages enumerated by the corridor's cards do not appear in this source. Compatibility is the much stronger *positive* claim: every surface the plugin does use (`apply/inject/effect` contract, `dsh.bundle.patch` manifest key, `insert:` patch schema, ESM packaging, service-name resolution) must still exist **with the same semantics** in 0.1.2-alpha.2. Absence of known-bad evidence is not evidence of goodness.
2. **The pattern set's completeness is itself unverified.** The scan is only as good as the card catalog behind it. In this cell the catalog was not even available — the seven-category frame had to be reconstructed (§1). If the corridor missed a 0.1.2-alpha.2 change, or a category boundary is drawn differently than assumed here, a "zero-hit" category can hide real breakage. A negative result inherits every blind spot of its checklist.
3. **Static text cannot observe dynamic contracts.** Dependency resolution (will `0.0.1-rc.1`-era packages even install next to 0.1.2-alpha.2? peer conflicts?), DI-container behavior when an unknown inject name is requested (silent undefined vs. hard boot failure), patch-schema enforcement at load time, engine/Node requirements, bundling — none of these are decidable by reading source. They surface only at install/build/boot.
4. **Concrete residual unknowns remain in this plugin's no-hit categories.** TC1: the cell materials contain no 0.1.2-alpha.2 manifest schema, so `"dsh": { "bundle": { "patch": ... } }` (`package.json:11-15`) is *assumed* unchanged, not confirmed. TC2: same for the `- insert:` patch verb (`cordis.patch.yml:1`). "NO-HIT" above therefore means precisely "no known breakage found", not "confirmed compatible".
5. **Moot for the verdict anyway — the hit side already decides it.** The plugin hits TC3, so it is *known incompatible as-is* with 0.1.2-alpha.2 regardless of what the other six categories say; the user's belief is refuted by one hit. And once the mandated TC3 rewrite is done, the correctness of that rewrite can again only be established by positive verification (§5) — never by re-running a negative scan and seeing fewer hits.

**What zero hits legitimately buy you:** a narrowed work surface and a focused test plan — e.g., here, no client-half, Tool, Event, or Config regression testing is needed, so the smoke test can concentrate on service injection, patch loading, and the migrated LLM-provider call path. That is prioritization evidence, not a compatibility proof.

**What else is needed before a compatibility conclusion can be drawn:**
- The **0.1.2-alpha.2 corridor/changelog (cards + API docs)** — to positively confirm the six no-hit categories against the authoritative pattern set, and to obtain the exact `apiProxy → successor service` mapping for the TC3 rewrite;
- A **live 0.1.2-alpha.2 host** for cordis Service inspection (`listService`) to identify the concrete replacement for `llm.providers()`;
- Execution of the **mandatory verification checklist below** after the migration edit.

## 5. Mandatory post-migration verification checklist (listed only — deliberately NOT executed per task scope)

1. **Dependency resolution & install** against dsh 0.1.2-alpha.2 in a scratch project: after removing `@deepseek-ai/dsh-host-apiproxy`, a clean install resolves with no peer/version conflicts.
2. **Build / typecheck**: ESM syntax check (`node --check index.js` or the bundler used for packaging); `tsc --noEmit` if any TS is introduced; lint against the 0.1.2 plugin contract if available.
3. **Patch-load verification**: the bundle plus `cordis.patch.yml` is accepted by a 0.1.2-alpha.2 host; the service `minimal-llm` appears in cordis inspection with `name: @demo/dsh-minimal-llm` and expected props.
4. **Isolated-profile cold boot**: start dsh under a disposable/isolated profile with only this plugin installed; boot completes with no load-time errors or deprecation warnings; `apply()` demonstrably runs (its stderr marker at `index.js:6` appears); the new inject resolves (no unknown-inject failure).
5. **Functional smoke test**: exercise the migrated provider call end-to-end in the isolated profile — the successor of `ctx.apiProxy.llm.providers()` returns a sane provider list matching the old result shape consumed at `index.js:9-10`; also exercise the failure branch (`index.js:11-13`) once.
6. **Utility regression**: trivial unit checks of `formatSessionNote` / `chunk` (`src/session-notes.js`) — zero host coupling, expected to pass unchanged; guards against accidental edits.
7. **Only after 1-6 pass** may the verdict "compatible with 0.1.2-alpha.2" be issued.

## 6. Fixture integrity attestation (read-only discipline)

sha256 of all five fixture files, computed after the full scan, matches `fixture-hash-before.json` exactly (`cordis.patch.yml` d50c34ae…, `index.js` 73066219…, `package.json` 414adb49…, `README.md` fdca9077…, `src/session-notes.js` 7a321998…); no extra or missing files. No fixture file was modified, created, deleted, executed, or installed; no migrations or installations were run. This report is the only artifact written, under `/app/agent-output/S2-negative-scan/`.
