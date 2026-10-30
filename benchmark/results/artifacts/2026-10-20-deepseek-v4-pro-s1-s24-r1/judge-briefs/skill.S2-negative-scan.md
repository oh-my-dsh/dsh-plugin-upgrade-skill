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

# S2 · Negative Scan — @demo/dsh-minimal-llm (0.1.0) → dsh 0.1.2-alpha.2

## Identity / corridor
- Plugin: `@demo/dsh-minimal-llm` v0.1.0, ordinary **host-side** Cordis plugin (no Web Client half, no `dsh.client`).
- Source style: 0.1.1-rc.2 (declares the old `apiProxy` service).
- Corridor: 0.1.1-rc.2 → 0.1.2-alpha.1 → 0.1.2-alpha.2 (target).
- Declared dependency: `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` (package.json).
- Composition: `cordis.patch.yml` inserts one row `minimal-llm` → `@demo/dsh-minimal-llm`; package.json `dsh.bundle.patch` points at it.

## 1. Hit / no-hit per touchpoint category

| # | Touchpoint | Hit | Evidence (file:line) |
|---|---|---|---|
| 1 | source patch / monkey patch | **No** | Only `cordis.patch.yml` + `dsh.bundle.patch` present; per API-08 this is Loader composition, not a source patch. No `patchedDependencies`/`patch-package`/`monkeypatch`/`DSH_HARNESS_SOURCE_ROOT`. |
| 2 | internal events / persistent events | **No** | No `SessionEvent`, `ctx.on`, `subscribe`, `session/event`, `tool/code-dispatch`, `connection/reset`. |
| 3 | internal service probes / Remote | **HIT** | `index.js:1` `export const inject = ["apiProxy"]`; `index.js:5-7` `ctx.apiProxy.llm.providers()`; dependency on removed `@deepseek-ai/dsh-host-apiproxy`. |
| 4 | direct host FS reads/writes | **No** | No `DSH_HOME`, `.dsh`, `readFile/writeFile/mkdir/openPath/homedir`. `src/session-notes.js` is pure string/array logic. |
| 5 | UI / commands / tool registration | **No** | No `registerCommand`/`registerView`/`contributes`/`ctx.tools`/`dsh-client-runtime`/`useSession`/`useChat`/`__ModuleLoader__`/`PLUGIN_ID`. |
| 6 | custom HTTP/WS/RPC/DOM/CSS | **No** | No `createServer`/`WebSocket`/`MutationObserver`/`127.0.0.1`/`/api/`/`contenteditable`/`insertRule`. |
| 7 | subprocess / stdout-stderr parsing | **No** | No `child_process`/`spawn`/`exec`/`execa`/`headless`/`--profile`. `console.error` in index.js is the plugin's own log, not host-output parsing. |

Scan scope: read-only over `fixture/` (all 6 tracked files); no `node_modules` present. The suspicious-looking `src/session-notes.js` has **zero** coupling — the "session" in its filename is historical only (pure `formatSessionNote`/`chunk` utilities).

## 2. Hit touchpoint → change cards

Touchpoint #3 (internal service probe) maps to:

- **DSH-0.1.2-A1-01** — APIProxy removed in alpha.1; host-side consumers must skip the gateway and inject the owning domain service. Here the call is `llm.providers`, so the host-plane replacement is `inject: ["llm"]` + `ctx.llm.listProviders()` (and `ctx.llm.listConfigurableProviders()` if the configurable directory is also needed).
- **API-01** — same rule, by runtime plane: Host plugins do **not** declare `remote` (that only exists on the Client face); the verified host pattern is `inject = ['llm']` → `ctx.llm.listProviders()`. The `@Remote` table (`llm/listProviders`) applies only to Web Client `ctx.remote`.
- Packaging consequence: the dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` names a package deleted in alpha.1; with it kept, `inject: ["apiProxy"]` stalls at `pending (waiting for service: apiProxy)` and `apply()` never runs. Related packaging-discipline context: DSH-0.1.2-A2-03 (peer trimming), but the root cause here is the removed package + removed service, not peer drift.

## 3. Do the zero-hit categories prove compatibility? — No

**The premise "no compatibility problems" is false: this plugin has a real breaking hit, not a clean scan.**

- Zero hits on #1/#2/#4/#5/#6/#7 mean only "no pattern in those classes was detected" — the pre-flight text says exactly this: zero hits ≠ compatibility, and build + a real mount + functional smoke are still mandatory.
- Worse, those six clean categories cannot offset the single #3 hit: `apiProxy` was the precise surface deleted in alpha.1 (DSH-0.1.2-A1-01). A host-side plugin injecting `apiProxy` against 0.1.2 will not activate — its entry waits forever for a service the host no longer provides, and the dependency package no longer resolves to a host-mounted service.
- The no-hit categories therefore tell me nothing that licenses a compatibility conclusion. They only clear those surfaces. Compatibility still depends on (a) the dependency/peer cohort, (b) the removed service key `apiProxy`, and (c) actual runtime behavior — none of which a negative scan can establish.

**Basis for the judgment**: card DSH-0.1.2-A1-01 identifiers ("rc.2's service key is `apiProxy`, type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`; alpha.1 deletes that package; there is no `APIProxy` identifier") plus its field note that a host-plane `apiProxy` consumer must inject the domain service directly (`inject: ["llm"]`, `ctx.llm.listProviders()`), and API-01's identical host-plane rule.

**What is needed before any "compatible" conclusion** (mandatory post-migration verification; not run here because the fixture is a read-only static copy):
1. Replace `inject: ["apiProxy"]` → `inject: ["llm"]` and `ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`.
2. Drop `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`; align the DSH peer cohort to `0.1.2-alpha.2` in package.json + lockfile (no mixed old/new peers).
3. `dsh --profile <p> --dump-config`: no pending rows, no `waiting for service: apiProxy`.
4. Build / typecheck (ideally `skipLibCheck: false` to catch declaration owners).
5. Isolated-profile cold boot: entry active, no pending Cordis services.
6. Functional smoke: actually call `ctx.llm.listProviders()` and assert a non-error result (success + one failure path).

## Summary template

## Touchpoint checkup (@demo/dsh-minimal-llm, 0.1.1-rc.2 → 0.1.2-alpha.2)

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | No | cordis.patch.yml / package.json | API-08 (composition) | filename alone is not a patch hit |
| #2 events | No | — | — | no event/producer code |
| #3 services/Remote | **Yes** | index.js:1,5-7; package.json dependency | DSH-0.1.2-A1-01, API-01 | hard break; apiProxy deleted |
| #4 filesystem | No | — | — | no FS/DSH_HOME access |
| #5 UI/commands/tools | No | — | — | no client/UI surface |
| #6 custom channel | No | — | — | no HTTP/WS/DOM |
| #7 subprocess/output | No | — | — | no child process/headless |

No-hit notes: whole `fixture/` tree read-only; no `node_modules`; dependencies/config checked separately (see §2).
Must verify: dependency swap, build/typecheck, real profile mount (`--dump-config` + cold boot), `ctx.llm.listProviders()` functional smoke.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.