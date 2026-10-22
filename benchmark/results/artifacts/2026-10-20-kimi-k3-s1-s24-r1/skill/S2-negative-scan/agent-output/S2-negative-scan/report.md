# S2 · Negative Scan — Touchpoint Checkup Report

**Plugin**: `@demo/dsh-minimal-llm` v0.1.0 (fixture static copy, read-only scan only; dsh not installed, not executable)
**Corridor**: 0.1.1-rc.2-era source → **dsh 0.1.2-alpha.2** (edges: rc.2 → alpha.1 → alpha.2, per references/README.md from→to metadata)
**Scan scope**: all 5 tracked files (`README.md`, `package.json`, `cordis.patch.yml`, `index.js`, `src/session-notes.js`); no node_modules/vendor present. Fixture left completely unchanged.

## 1. Seven touchpoint categories — hit/no-hit with evidence

| Touchpoint | Hit? | Evidence (file:line) | Applicable cards |
|---|---|---|---|
| #1 source patch / monkey patch | **No hit** | 0 matches for `patch-package`/`patchedDependencies`/`monkeypatch`/`DSH_HARNESS_SOURCE_ROOT`. `cordis.patch.yml` exists but is profile composition (insert row `minimal-llm`), not a source patch — classified per API-08, a filename containing "patch" alone is not a hit | — |
| #2 internal events / persistent events | **No hit** | 0 matches for `SessionEvent`, `ctx.on(`, `subscribe(`, `tool/code-dispatch`, `connection/reset` across all files | — |
| #3 internal service probes / Remote | **HIT** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `await ctx.apiProxy.llm.providers()`; `package.json:17` hard dependency `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` — the package alpha.1 deletes | **DSH-0.1.2-A1-01**, **API-01** (api-migration-0.1.2-alpha.2.md); symptom cf. troubleshooting.md "waiting for service: apiProxy" |
| #4 direct host directory reads/writes | **No hit** | 0 matches for `DSH_HOME`, `.dsh/`, `homedir(`, `readFile`/`writeFile`/`mkdir`/`openPath` | — |
| #5 internal UI / commands / tool registration | **No hit** | 0 matches for `registerCommand`/`registerView`/`ctx.tools`/`dsh-client-runtime`/`ctx.slots`/`useSession`/etc. No `dsh.client` in package.json → host-plane-only plugin | — |
| #6 custom HTTP / WS / RPC / DOM / CSS channels | **No hit** | 0 matches for `createServer(`/`WebSocket`/`MutationObserver`/`localhost`/`/api/`/contenteditable` etc. | — |
| #7 subprocess / stdout / stderr parsing | **No hit** | 0 matches for `child_process`/`spawn(`/`execSync`/`execa`/`headless`/`--profile`. (`console.error` logging in index.js is diagnostic output, not parsing a subprocess stream) | — |

**No-hit notes**: heuristic pattern scan only; `src/session-notes.js` looks suspicious by filename ("session") but is verified line-by-line to be two pure utility functions with zero host coupling — filename similarity is not a touchpoint hit. Dependency/configuration inventory (pre-flight step 0) was checked separately: the decisive finding lives in `package.json` + `index.js`, i.e. category #3.

## 2. Hit → card mapping

**#3 → DSH-0.1.2-A1-01 (breaking, required-if-hit)**: 0.1.2-alpha.1 removes the APIProxy package/service entirely (`@deepseek-ai/dsh-host-apiproxy` is deleted; no `APIProxy` identifier exists). On 0.1.2-alpha.2 this plugin's `inject: ["apiProxy"]` leaves the row pending forever ("waiting for service: apiProxy") and `ctx.apiProxy.llm.providers()` can never run — **the plugin is NOT compatible with 0.1.2-alpha.2 as-is**.

Ledger mapping (API-01 / A1-01 table): `llm.providers` → `llm/listProviders` + `llm/listConfigurableProviders` (one call split into two results).

Plane discipline (A1-01 field note + API-01 core rule): this is a **host-plane** Cordis plugin (no `dsh.client` face). The correct migration is NOT `inject: ["remote"]` (that hangs on the host face); it is to skip the gateway and inject the owning domain service directly: `inject: ["llm"]` → `ctx.llm.listProviders()`, and remove the dead `@deepseek-ai/dsh-host-apiproxy` dependency from package.json/lockfile. The alpha.2 edge itself adds no new hit for this plugin; the break arrives at the alpha.1 edge and persists.

## 3. Do the six zero-hit categories prove 0.1.2 compatibility? — Judgment: **No.**

Basis:
1. **The method itself says so.** pre-flight.md states the scan is "a heuristic, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."
2. **Empirically false in this very plugin.** The actual incompatibility was invisible to six of seven categories and would have been missed entirely by the suspicious-looking `session-notes.js`; it was found only by the #3 hit plus the step-0 dependency inventory (`package.json` pinning a deleted package). "Tiny" + "mostly zero hits" did not imply compatible — the plugin is in fact broken on the target.
3. **Structural blind spots of a line-level scan**: it cannot see resolved dependency versions vs. removed packages, peer/engines floors, runtime injection resolution (a service key that no longer exists is a runtime pending, not a grep token), wire-contract drift, or behavior of code paths only reached at runtime.

**Still needed before any compatibility conclusion (mandatory post-migration verification — listed here, not executed per task scope)**:
1. **Static**: install with the 0.1.2-alpha.2 DSH cohort and run build/typecheck; scan the full lockfile for the removed `dsh-host-apiproxy` package.
2. **Runtime**: cold boot in an isolated profile; prove the `minimal-llm` row activates with no `pending (waiting for service: …)`.
3. **Behavior**: functional smoke of the one real path — provider listing succeeds (and one failure branch + cancellation per A1-01 verification guidance).
4. **Enablement**: confirm the profile composition still resolves to `@demo/dsh-minimal-llm` with no stale rows.

## Conclusion

- **Compatible as-is? No.** One breaking hit (#3: APIProxy removed, DSH-0.1.2-A1-01 / API-01). Required migration: `inject: ["llm"]` + `ctx.llm.listProviders()`, delete the `@deepseek-ai/dsh-host-apiproxy` dependency.
- **Zero-hit categories (#1, #2, #4–#7)**: they narrow the migration surface but are evidence of absence only within the pattern set — they cannot certify compatibility; the build / isolated-profile cold boot / smoke steps above remain mandatory.
