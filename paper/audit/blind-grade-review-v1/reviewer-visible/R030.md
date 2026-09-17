# S2 · Negative Scan — compatibility report for `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

Read-only static scan of the fixture pack (`README.md`, `package.json`, `cordis.patch.yml`, `index.js`, `src/session-notes.js`). Nothing under the fixture was modified. Method: the seven-class touchpoint self-check (per the plugin-upgrade pre-flight procedure) over all five files, then mapping of hits to the 0.1.1-rc.2 → 0.1.2-alpha.2 corridor change cards.

## 0. Inventory (pre-flight step 0)

- Plugin: `@demo/dsh-minimal-llm` v0.1.0, `private: true`, `"type": "module"`, main `./index.js`.
- Composition: `cordis.patch.yml` inserts one row: `id: minimal-llm`, `name: "@demo/dsh-minimal-llm"`; exposed via `exports["./cordis.patch.yml"]` and `dsh.bundle.patch`.
- DSH dependency cohort: `"dependencies": { "@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1" }` (`package.json:17`). `index.js:2` self-identifies as "0.1.1-rc.2 style: injects apiProxy, dot-domain calls".
- Face: ordinary Host-plane (server-side) Cordis plugin — no `dsh.client` block, no browser code.
- No build/typecheck/test scripts in `package.json`; plain JS, so there is no compile step to catch breakage — runtime verification carries more weight here.
- Baseline run: not collected (static copy, dsh not installed/executable in this environment).

## 1. Seven-touchpoint checkup (`@demo/dsh-minimal-llm`, rc.2-style → 0.1.2-alpha.2)

| Touchpoint | Hit | Evidence | Applicable card(s) |
|---|---|---|---|
| #1 source patch / monkey patch | **No** | `cordis.patch.yml` contains only a composition `- insert:` row (row 1); no `.patch` hunks, no `patch-package`/`patchedDependencies`, no host-file rewrites anywhere in the pack. Per the pre-flight rule, "an ordinary `cordis.patch.yml` is profile composition and must be classified per API-08 — a filename containing `patch` alone is not a hit for this class." | API-08 (classification only) |
| #2 internal / persistent events | **No** | No `SessionEvent`, `ctx.on(`, `subscribe(`, `session.append`, or event-name strings (`tool/code-dispatch`, `connection/reset`) in `index.js` or `src/session-notes.js`. No `SessionEventMap` augmentation, so the alpha.1 removal / alpha.2 restore of `SessionEvent.ignorable` (cards DSH-0.1.2-A1-02 / A2-01, incl. API-05's silent-write/loud-read trap) does not apply. | — |
| #3 internal service probes / Remote | **YES** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `await ctx.apiProxy.llm.providers()`. Also `package.json:17` declares `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` — exactly the rc.2-era package that alpha.1 deletes ("rc.2's service key is `apiProxy` … alpha.1 deletes that package", DSH-0.1.2-A1-01). | **DSH-0.1.2-A1-01**; error-flow side: **DSH-0.1.2-A2-02** (after migrating to Remote) |
| #4 direct host directory reads/writes | **No** | No `DSH_HOME`, `.dsh`, `profiles/`, `homedir(`, `readFile`/`writeFile`/`mkdir`/`openPath` anywhere. | — |
| #5 internal UI / commands / tool registration | **No** | No `registerCommand`/`registerView`/`ctx.tools`/`commands.execute`, no `dsh-client-runtime`, `ctx.slots`, `useSession`/`useChat`, `__ModuleLoader__`. No `dsh.client` manifest, so the client-runtime removal (A1-25), client-modules scan contract (A1-26), `ctx.connection.api` removal (A1-30), and workspace-navigation move (A1-32) are all out of scope. | — |
| #6 custom HTTP / WS / RPC / DOM / CSS channels | **No** | No `createServer(`, `WebSocket`, routers, `/api/` calls, DOM/CSS editing. The auth-gate card DSH-0.1.2-A1-08 (bootstrap tokens / signed cookies) is not applicable — the plugin opens no channel. | — |
| #7 subprocess / stdout / stderr parsing | **No** | No `node:child_process`, `spawn(`, `exec(File)Sync`, `execa`, `--profile`/headless argv handling. The `console.error(...)` calls in `index.js:6,10,12` are ordinary plugin logging, not host-process output parsing — not a hit. | — |

**Suspicious-looking but clean:** `src/session-notes.js` — despite the name, it is two pure utility functions (`formatSessionNote`, `chunk`) with no host coupling surface; the file's own header states the "session" is only a historical naming habit. Zero hits confirmed; also no persistent-event write, so it cannot trip the API-05 cold-load trap.

## 2. Hit → change-card mapping

### Hit: `ctx.apiProxy.llm.providers()` — `index.js:3,9` — card **DSH-0.1.2-A1-01** (breaking, required-if-hit)

- Current evidence: `inject = ["apiProxy"]` (`index.js:3`), dot-domain call `ctx.apiProxy.llm.providers()` (`index.js:9`), dependency `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` (`package.json:17`).
- How it breaks: the `apiProxy` service key and the `@deepseek-ai/dsh-host-apiproxy` package do not exist on alpha.1/alpha.2. The injection never resolves — the plugin stalls at `pending (waiting for service: apiProxy)`, and the dependency cannot be installed at the target cohort. There is no compile step in this plugin to surface it earlier.
- Target behavior (card's exact mapping): `llm.providers` splits into **`llm/listProviders` + `llm/listConfigurableProviders`**. Because this is a **host-plane** plugin, the card's field note applies: do not swap `inject: ["apiProxy"]` for `inject: ["remote"]` (that reports `pending (waiting for service: remote)` on the host plane). The correct host-plane migration is to inject the domain service behind the facade directly: `inject: ["llm"]` and call `ctx.llm.listProviders()` / `ctx.llm.listConfigurableProviders()`. (Only a browser-plane plugin would use `ctx.remote.llm.*` via `@deepseek-ai/dsh-api-remotes/client`.)
- Required cleanup: remove `@deepseek-ai/dsh-host-apiproxy` from `package.json` and re-scan the full lockfile for the old cohort (validation layer 1); declare whatever domain package owns the consumed service as a direct dependency of the exact alpha.2 cohort.
- Residual error-flow note: once calls cross the gateway as Remote (client-plane variant), **DSH-0.1.2-A2-02** applies — failures become `RemoteError` with namespaced codes; `index.js:11-13` currently catches and prints `error.message`, which would need to branch on `result.ok` / `result.error.code` instead of assuming a thrown Error shape. On the pure host-plane direct-injection path this card is only conditional.
- Verification (mandatory after migration; not runnable here): success + one business failure + cancellation for the provider-list call; then the layered ladder — dependency resolution, profile composition resolution (`dsh --profile <p> --dump-config`, no pending lines), isolated-profile cold boot, and one functional path.

### Composition-only surface: `cordis.patch.yml` / `dsh.bundle.patch` — API-08 (no source patch)

Classified as the official Loader composition overlay, not a source patch — no rebase work. Two checks remain for the migration: the `insert` row's `id: minimal-llm` / `name: "@demo/dsh-minimal-llm"` must still resolve against the target profile, and the patch file must actually ship in the packed artifact (API-07: export map entry `"./cordis.patch.yml"` ≠ artifact presence — verify with a pack manifest).

## 3. Do the zero-hit categories prove compatibility with 0.1.2? — **No.**

Judgment: the six zero-hit categories establish only "no *detected* coupling in those classes", not compatibility. Basis:

1. The pre-flight procedure itself states the limit: "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."
2. The dependency/configuration surface sits **outside** the seven classes: this plugin is *not* compatible as-is, because its one hit is fatal — the injected `apiProxy` service and the declared `@deepseek-ai/dsh-host-apiproxy` package are deleted in the corridor (DSH-0.1.2-A1-01). "6 of 7 categories clean" and "plugin boots on 0.1.2-alpha.2" are different claims, and here the first does not imply the second.
3. The cards are explicitly "a curated list, not a complete API diff"; corridor edges without cards (e.g. host UI changes) "do not prove the absence of API or behavior impact". A zero-hit scan against an incomplete card list is weaker evidence still.
4. This plugin has no build/typecheck step, so a whole class of breakage (missing exports, bad declarations) would never surface statically — runtime verification carries all the weight.

Before concluding compatibility, the following are mandatory (per the report brief, listed, not executed here):

- **Baseline + static**: run the mechanical suite in the current dependency state and record pre-existing failures; re-scan the lockfile after migration for the removed `@deepseek-ai/dsh-host-apiproxy` and any old-cohort rows.
- **Isolated-profile cold boot**: an isolated `DSH_HOME`/temp profile cold start with the migrated plugin; verify entry activation and that no injected service remains `pending` (a missing `llm`/domain service shows up only here, not at install).
- **Composition check**: `dsh --profile <p> --dump-config` shows the `minimal-llm` row resolving to the target package, no duplicate/old rows.
- **Functional smoke**: one real `listProviders` (or post-migration `llm/listProviders` + `llm/listConfigurableProviders`) call succeeding end-to-end, plus the error path.
- **Artifact smoke**: pack the plugin and confirm `cordis.patch.yml` is present in the tarball and referenced correctly (API-07/API-08).

Only after the single #3 hit is migrated per DSH-0.1.2-A1-01 and all of the above pass can "compatible with 0.1.2-alpha.2" be claimed — the scan alone, positive or negative, cannot deliver that conclusion.
