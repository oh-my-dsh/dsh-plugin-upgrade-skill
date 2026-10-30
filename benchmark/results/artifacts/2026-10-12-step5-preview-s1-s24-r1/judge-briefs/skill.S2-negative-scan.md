# JUDGE BRIEF · skill.S2-negative-scan

## Criteria (sealed rubric)
- [host-break] (40pt) Locate index.js inject/apiProxy.llm.providers and map the breaking Host service to A1-01. Explain llm injection/listProviders and the dead apiproxy dependency in package.json; a card name alone earns zero.
- [negative-coverage] (20pt) Account for each of the other six categories with scanned-file evidence. session-notes.js is a pure string/array utility; cordis.patch.yml is ordinary plugin composition, not a host-source patch. Interpret a negative patch conclusion in its touchpoint-category context: wording such as no patch file/declaration under the source-patch category can correctly mean no host-source patch, especially when the scan scope includes the composition file. Do not deduct solely because an ordinary composition file has patch in its name, or require an extra explanation of that naming distinction when the category conclusion and scan evidence are correct. Still deduct for an explicit denial that the existing composition file itself exists, for misclassifying its insertion as host-source modification, or for unsupported negative conclusions. Do not invent coupling from filenames.
- [inference-boundary] (20pt) Explain why no static hits cannot establish compatibility: scan coverage is limited and dependency/config/runtime behavior needs separate evidence. Distinguish the existing decisive apiProxy break from the six negative categories.
- [verification-plan] (20pt) Specify post-migration build/typecheck, an isolated target-version cold boot with no pending, and an actual provider call. These are proposed checks, not checks supposedly executed inside this non-runnable fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S2-negative-scan/S2-negative-scan-report.md

# S2 · Negative Scan — `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

**Mode**: C · author-migrate (read-only inspection phase, per plugin-upgrade skill)
**Scope**: static source copy under `fixture/` (not installed, not executed). Nothing in `fixture/` was modified.
**Files scanned (complete fixture inventory)**: `package.json` (19 lines), `index.js` (15), `cordis.patch.yml` (3), `README.md` (5), `src/session-notes.js` (10). All five files read in full; no excluded directories exist inside the fixture (no `node_modules`, no lockfile).

## 0. Corridor and identity

- **Corridor** (pre-flight step 1, via `references/README.md` edge index): `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` (28 cards) → `dsh-v0.1.2-alpha.2` (8 cards). Both edges are reviewed/curated; **no corridor gap** for this window. The exact rc.2→alpha.2 ledger lives in `references/api-migration-0.1.2-alpha.2.md` (API-01…API-10, CFG-01).
- **`from` tag — inferred, not confirmed**: `index.js:2` self-describes as "0.1.1-rc.2 style"; the dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (`package.json:17`) matches rc.2's APIProxy package. But there is **no lockfile, no `peerDependencies`, no `engines`** in the fixture, so the cohort start and Node floor are unverified declarations, not facts. Recorded as pending.
- **Identity separation** (skill shared-prep step 2): the plugin's own release version is `0.1.0` (`package.json:3`); the DSH host corridor is `0.1.1-rc.2 → 0.1.2-alpha.2`. These are independent coordinates.
- **Face**: no `dsh.client` in the manifest and a host-side `apiProxy` dependency → this plugin is a **Host-plane / ordinary Cordis plugin**, not a Web Client plugin. This determines the migration direction (see §2).

## 1. Touchpoint checkup (`@demo/dsh-minimal-llm`, 0.1.1-rc.2 → 0.1.2-alpha.2)

Patterns executed per `references/pre-flight.md` over the whole fixture (all matches shown; grep output quoted):

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | **No** | `package.json:9,13` filename matches only | API-08 (negative control) | Only `cordis.patch.yml` references exist. Per **API-08**, an ordinary `cordis.patch.yml` is profile **composition**, not a source patch; a filename containing "patch" alone is not a #1 hit. No `patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT`, or host-source replacement anywhere. |
| #2 internal event names / persistent events | **No** | — | — | Zero matches for `SessionEvent`, `session/event`, `ctx.on(`, `subscribe(`, `tool/code-dispatch`, `tools-code-mode`, `connection/reset`. `ctx.effect(...)` (`index.js:7`) is Cordis lifecycle scope, not an event surface. |
| #3 internal service probes / Remote | **YES** | `index.js:3` (`export const inject = ["apiProxy"]`), `index.js:9` (`ctx.apiProxy.llm.providers()`), `package.json:17` (dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`) | **DSH-0.1.2-A1-01** (breaking, #3); conditional **DSH-0.1.2-A2-02**; ledger **API-01** | Direct, unambiguous hit: rc.2's service key `apiProxy` (type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`) is **deleted in alpha.1**; "there is no `APIProxy` identifier". The dependency pin is found by the pre-flight **step 0 dependency inventory**, not by the seven-class regexes — the `apiProxy` grep is case-sensitive and does not match the lowercase package name. |
| #4 direct host directory reads/writes | **No** | — | — | Zero matches for `DSH_HOME`, `.dsh/`, `profiles/`, `homedir(`, `readFile`, `writeFile`, `mkdir`, `openPath`. |
| #5 internal UI / commands / tools | **No** | — | — | Zero matches for `registerCommand`, `registerView`, `contributes`, `ctx.tools`, `commands.execute`, `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`, `/internal`, `__ModuleLoader__`, `PLUGIN_ID`. |
| #6 custom HTTP / WS / RPC / DOM / CSS | **No** | — | — | Zero matches for `createServer(`, `WebSocket`, `MutationObserver`, `insertRule`, `127.0.0.1`, `localhost`, `router.*(`, `/api/`, `contenteditable`. |
| #7 subprocess / stdout / stderr parsing | **No** | — | — | Zero matches for `node:child_process`, `spawn(`, `exec(File)?Sync(`, `execa`, `Bun.spawn`, `headless`, `--profile`. The plugin *writes* `console.error` diagnostics (`index.js:6,10,12`) but spawns/parses nothing; it owns no wrapper contract, so A1-05/A2-04 stderr-contract cards are not applicable. |

**Decoys checked and cleared**:
- `src/session-notes.js` — the filename says "session", but the content is two pure functions (`String` normalization + array chunking; lines 2–9), with no DSH import, no `ctx`, no I/O. It is also **not imported by `index.js`** (dead utility code). Zero hits on every class; the filename is a naming habit, as its own header comment says. No session-related card applies.
- `cordis.patch.yml` — a 3-line `insert` row (`id: minimal-llm`, `name: @demo/dsh-minimal-llm`). Composition, classified per API-08; not a source patch.

## 2. Hit → change-card mapping

Only one touchpoint class hits, and it is a **required**, breaking change:

### `ctx.apiProxy` Host consumer — DSH-0.1.2-A1-01 (+ API-01, conditional A2-02)

- **Current evidence**: `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `await ctx.apiProxy.llm.providers()`; `package.json:17` dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`.
- **Card**: **DSH-0.1.2-A1-01** (rc.2→alpha.1, breaking, "APIProxy removed, Host/Web Client calls moved to `@Remote`"; symptoms: "The old APIProxy surface disappears; calls for sessions, settings, credentials, model catalogs, etc. stop working."). Identifiers note: rc.2's service key is `apiProxy`, package `@deepseek-ai/dsh-host-apiproxy`; **alpha.1 deletes that package**.
- **Direction is plane-dependent** (card field note + API-01): this plugin has no `dsh.client` and sits on the host plane, so the correct migration is **not** to swap in `remote` — `inject: ["remote"]` on the host plane stalls forever at `pending (waiting for service: remote)`. The host-plane recipe: skip the Client gateway and **inject the owning domain service directly**, e.g. `inject = ['llm']` then `ctx.llm.listProviders()`, with the method name/shape confirmed against the exact target tag (API-01: "every other legacy APIProxy call must be confirmed item by item against the target tag"). The A1-01 ledger also records the old `llm.providers` as a split into two results (`llm/listProviders` + `llm/listConfigurableProviders` on the Client projection) — verify which host-plane `llm` service method carries this on alpha.2 before writing the call.
- **Dependency action**: remove `@deepseek-ai/dsh-host-apiproxy` from `dependencies` (its package no longer exists after alpha.1), and declare the DSH cohort explicitly (peer range + lockfile) per the skill's coherence rule.
- **Conditional follow-on**: if the author instead re-targets the Web Client plane, the consumer projection is `ctx.remote.llm.listProviders()` with `inject: ['remote', 'remote.llm']` **plus** `dsh.client` in the manifest, and **DSH-0.1.2-A2-02** then applies: branch on `result.ok` / `result.error.code` (namespaced codes such as `gateway/internal`, `gateway/cancelled`), never parse `error.message` and never use `instanceof RemoteError`. The current `try/catch` + `error.message` handling (`index.js:11-13`) is exactly the pattern A2-02 flags — acceptable to keep only on the host-plane path where a domain service is called directly.
- **Net-state note** (post-corridor folding): A1-01's Remote table is what a *Client* consumer lands on; a *Host* consumer lands on domain services. Cards intersect only with the actual face — the client-only consequences (A1-25 `dsh-client-runtime` removal, A1-30 `ctx.connection.api` removal, A1-32 `uiWorkspace`, API-10) are **not applicable** to this plugin.

## 3. Can the zero-hit categories prove compatibility with 0.1.2? — **No.**

**Judgment**: the six no-hit classes say nothing about compatibility, and even the one hit does not by itself decide it. This plugin is **not compatible as-is** (apiProxy is deleted on the target), but a hypothetical plugin with zero hits on all seven classes would still be *unproven*, not compatible. Zero hits is a screening result, not a verdict.

**Basis**:

1. **The scan is explicitly heuristic.** `pre-flight.md`'s own header: "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests." The skill (Mode C step 3) repeats it: "zero hits still require checking dependencies/imports and running build plus a real mount."
2. **The card set is curated, not a complete API diff** (`references/README.md` line 40; every card file's header). Uncarded breaking changes exist by design; a card not being hit is not evidence of absence.
3. **Live counter-example inside this very fixture**: the most decisive risk — the pinned, now-deleted package `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (`package.json:17`) — is **not detected by any of the seven regexes** (case-sensitive `apiProxy` does not match `dsh-host-apiproxy`; it is found only by the step-0 dependency inventory). The remaining undeclared cohort (no lockfile, no `peerDependencies`, no `engines`) is also invisible to the seven classes. A pure touchpoint scan of this plugin could have under-reported its risk. Packaging/dependency surfaces (cf. DSH-0.1.2-A1-24, A2-03, A2-08) sit *outside* the seven classes.
4. **Even the hit's *remedy* is unverifiable statically**: the plane split means a mechanically plausible fix (`inject: ["remote"]`) fails at runtime with a service that never mounts, while the correct host-plane fix depends on the target tag's actual `llm` service method — a fact only a real mount can confirm.
5. The decoy `src/session-notes.js` cuts the same way: its zero hits are genuinely established (pure functions, dead code), but its presence shows that "nothing in this file touches the host" does not extend to "this plugin is safe as a whole".

**What is still needed before any compatibility conclusion** (post-migration, mandatory):

1. **Pin `from` exactly** — confirm the plugin's DSH cohort with a real lockfile/peer declaration (currently inferred from a code comment; unverified).
2. **Apply the migration** — host-plane `inject: ['llm']` + `ctx.llm.listProviders()` (method confirmed at tag `dsh-v0.1.2-alpha.2`), drop `@deepseek-ai/dsh-host-apiproxy`, add the explicit DSH cohort peer.
3. **Static verification** — build/typecheck equivalent for this plain-JS plugin (it currently has no build script; at minimum a module/syntax load check; if TS is introduced, one `skipLibCheck: false` pass per API-10).
4. **Composition smoke** — `dsh --profile <isolated> --dump-config`: the `minimal-llm` insert row resolves (higher layers can override; see API-08 precedence), and **no pending lines** — in particular no `pending (waiting for service: apiProxy)` and no accidental `remote` wait.
5. **Runtime cold boot in an isolated profile** — entry activates, `apply()` runs, required/provided services all resolve (skill validation layer 4).
6. **Functional smoke** — one core path: the providers listing call succeeds end-to-end (credentials/host context permitting).
7. **Artifact smoke** — `npm pack --dry-run --json --ignore-scripts`: the manifest declares `dsh.bundle.patch: ./cordis.patch.yml` (`package.json:12-14`) and `exports["./cordis.patch.yml"]` — confirm the patch file actually ships inside the tarball (API-07: export map ≠ artifact presence; API-08 boundary).

## 4. Residual risks / pending

- **Corridor start unconfirmed** (no lockfile/peers) — record before implementing.
- **Target-tag API shape** for the host-plane replacement (`llm.listProviders` vs. split methods) must be read from `dsh-v0.1.2-alpha.2` source/exports, per A1-01/API-01; do not derive it from the Client Remote table.
- **Error-handling style**: the existing `catch (error) { error.message }` pattern is tolerable only on the host-plane service path; any move to `ctx.remote` obliges the A2-02 `ok`/`code` branch discipline.
- **Dead code**: `src/session-notes.js` is unreferenced; dropping it is optional hygiene, not a compatibility requirement.
- This report is a Mode C inspection only; no files under `fixture/` were read-modified (read-only), and nothing outside the three allowed paths was accessed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.