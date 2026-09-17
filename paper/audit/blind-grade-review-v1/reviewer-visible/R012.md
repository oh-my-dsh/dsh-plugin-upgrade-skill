# S2 · Negative Scan — Compatibility report for `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

Mode A · inspect (read-only). Fixture scanned at `fixture/` (files: `README.md`, `package.json`, `cordis.patch.yml`, `index.js`, `src/session-notes.js`). Nothing under the fixture was modified. Baseline suite: not collected (static copy, not executable).

## 0. Configuration and dependency inventory

- Plugin: `@demo/dsh-minimal-llm` v0.1.0, `private: true`, `"type": "module"`, main `index.js`.
- Profile composition: `cordis.patch.yml` (a single `- insert:` row for id `minimal-llm`), referenced by `package.json` under `dsh.bundle.patch` and `exports["./cordis.patch.yml"]`.
- Dependency cohort: `@deepseek-ai/dsh-host-apiproxy`: `0.0.1-rc.1` (the only dependency). No lockfile, no `peerDependencies`, no `engines`.
- Code style per `index.js` comment: "0.1.1-rc.2 style: injects apiProxy, dot-domain calls" — so the corridor `from` is the 0.1.1-rc.2 generation, `to` is 0.1.2-alpha.2 (corridor: rc.2 → alpha.1 → alpha.2).
- No `dsh-plugin.json`, no Git metadata in the fixture.

## 1. Seven touchpoint categories — hit/no-hit with evidence

| # | Category | Hit | Evidence |
|---|---|---|---|
| 1 | Source patch / monkey patch | **No** (one classification note) | No `patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT`, or monkey-patch patterns anywhere. `cordis.patch.yml` contains only a `- insert:` composition row; per API-08 ("cordis.patch.yml is composition, not a source patch") the filename containing `patch` alone is **not** a hit for this class. |
| 2 | Internal event names / persistent events | **No** | No `ctx.on(`, `SessionEvent`, `subscribe(`, or any event-name strings in `index.js` or `src/session-notes.js`. The only callback is the `ctx.effect(async () => …)` teardown effect. |
| 3 | Internal service probes / Remote | **YES — the only hit** | `index.js` line 3: `export const inject = ["apiProxy"]`; line 9: `await ctx.apiProxy.llm.providers()`. Comment in the same file: "0.1.1-rc.2 style: injects apiProxy, dot-domain calls". Additionally `package.json` declares the removed package `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1`. Face: ordinary Host-plane Cordis plugin (plain `apply(ctx)`, no `dsh.client` surface). |
| 4 | Direct host directory reads/writes | **No** | No `readFile`, `writeFile`, `mkdir`, `homedir(`, `DSH_HOME`, or path construction anywhere. `src/session-notes.js` does only in-memory string/array transforms. |
| 5 | Internal UI / commands / tool registration | **No** | No `registerCommand`, `ctx.tools`, `ctx.slots`, `dsh-client-runtime`, `useSession`/`useChat`, `__ModuleLoader__`, or any Client-face import. The plugin registers no tools, commands, views, or slots. |
| 6 | Custom HTTP / WS / RPC / DOM / CSS channels | **No** | No `createServer`, `WebSocket`, `fetch`, router calls, `/api/` strings, or DOM/CSS manipulation. |
| 7 | Subprocess / stdout/stderr parsing | **No** | No `node:child_process`, `spawn`, `exec`, `execa`. The `console.error(...)` lines in `index.js` are the plugin's own logging output, not parsing of a subprocess stream — not a hit. |

`src/session-notes.js` deserves an explicit no-hit note: the filename contains `session`, which could look like session-event coupling, but the file is two pure utility functions (`formatSessionNote`, `chunk`) with zero host-coupling surface, and nothing imports it from `index.js`. It is migration-neutral.

## 2. Hit touchpoints mapped to change cards

Touchpoint #3, Host-plane APIProxy consumer — two cards apply:

- **DSH-0.1.2-A1-01** (v0.1.2-alpha.1, breaking, "APIProxy removed, Host/Web Client calls moved to @Remote"). The card states rc.2's service key is `apiProxy` (type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`) and alpha.1 deletes that package. For **host-plane** consumers it explicitly warns: do **not** mechanically switch `apiProxy` → `remote` — `ctx.remote` exists only on the Client face, and a Host-side switch "waits forever on a service that only exists on the Client face". The correct migration is to skip the gateway and inject the owning domain service directly.
  - The plugin's single call `ctx.apiProxy.llm.providers()` maps per the card's table: `llm.providers` → `llm/listProviders` + `llm/listConfigurableProviders` ("one call split into two results"). On the Host plane this means injecting the `llm` domain service and calling `listProviders()` (plus `listConfigurableProviders()` if the configurable set is needed); exact service method coordinates must be confirmed against the target tag's generated declarations, not from memory.
  - The plugin's `try/catch` logs `error.message`; error-shape expectations change under **DSH-0.1.2-A2-02** (Remote failures become `RemoteError` instances; error codes gain namespaces). With direct Host-side service injection the call is an ordinary service call, but any retained remote path must handle `RemoteResult`/`RemoteError`.
- **Dependency-cohort consequence of A1-01 / rollup-0.1.2**: `@deepseek-ai/dsh-host-apiproxy` is on the rollup's list of packages removed rc.2 → alpha.1 (`dsh-host-apiproxy` among the 5 removed). `package.json` must drop this dependency entirely; the rollup warns that "a successful install with mixed old/new peers is not a migration", and the lockfile must be scanned for residual old-cohort rows.

Card filter result: all other alpha.1/alpha.2 cards (events, client runtime, UI, filesystem, channels, subprocess, packaging peers) do not intersect any hit touchpoint or the plugin's actual face (ordinary Host plugin, no Web Client half) and are **not applicable**.

## 3. Do the zero-hit categories prove 0.1.2 compatibility?

**No — zero hits do not equal compatible.** Basis, straight from the skill's pre-flight contract: "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests." The negative scan only rules out the known breaking surfaces it patterns for:

1. The hit itself already disproves "no compatibility problems": the user's belief that this tiny plugin should be trouble-free is wrong. Touchpoint #3 is hit at the plugin's core — its entire `apply()` body and its only dependency sit on the removed APIProxy layer. On 0.1.2-alpha.2 as-is, `inject: ["apiProxy"]` waits on a service that no longer exists (troubleshooting signature: `waiting for service: apiProxy`, the composition row stays pending forever), so the plugin never activates.
2. The static copy cannot confirm dependency resolution: no lockfile, no installed tree, no target host. Whether the migrated dependency set resolves cleanly on 0.1.2-alpha.2 is unverifiable from source reading alone.
3. The card list is curated, not a complete API diff; a corridor edge outside the cards could still affect the plugin.

**Required before concluding compatibility (mandatory post-migration verification; per the brief, not executed here):**

- Implement the A1-01 migration: drop `@deepseek-ai/dsh-host-apiproxy` from `package.json`; replace `inject: ["apiProxy"]` with the owning `llm` domain service; replace `ctx.apiProxy.llm.providers()` with `listProviders()` (coordinates confirmed against the alpha.2 generated declarations); adapt error handling to A2-02.
- Static: build/typecheck of the migrated source; close out the alpha.2 precision checklist.
- Dependency resolution: install and scan the full lockfile — zero residual `dsh-host-apiproxy` / 0.0.1-rc.1-cohort rows.
- Runtime: cold-boot an isolated real DSH 0.1.2-alpha.2 profile with this plugin's `cordis.patch.yml`; confirm the `minimal-llm` entry activates and no required/provided service stays pending (`verify-runtime.mjs` covers this layer with failure attribution).
- Behavior: one functional smoke — verify the `llm` provider-listing path executes and the plugin's effect tears down cleanly.

Only after those layers pass can "compatible with 0.1.2-alpha.2" be stated. Until then the honest verdict is: **six of seven touchpoint categories are zero-hit and carry no known corridor risk; the single #3 hit is a hard, migration-required incompatibility in the plugin's main path.**