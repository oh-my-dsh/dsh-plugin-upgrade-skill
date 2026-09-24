# S2 · Negative Scan Report — `@demo/dsh-minimal-llm` → DSH `0.1.2-alpha.2`

- **Mode**: A-equivalent read-only inspection (skill `plugin-upgrade`, pre-flight seven-class touchpoint scan; no writes to the fixture, no installs, no migrations executed).
- **Fixture scanned**: `benchmark/tasks/S2-negative-scan/environment/fixture` (static copy, 5 files: `README.md`, `package.json`, `index.js`, `src/session-notes.js`, `cordis.patch.yml`). Read-only; fixture untouched.
- **Scan scope**: every file in the fixture tree (no `node_modules`, vendor, or generated artifacts present).

## 0 · Configuration and dependency inventory (pre-flight step 0)

| Item | Value | Evidence |
|---|---|---|
| Plugin identity | `@demo/dsh-minimal-llm` v0.1.0, private, ESM (`type: module`), entry `index.js` | `package.json:2-8` |
| Runtime face | **Host-plane ordinary Cordis plugin** — no `dsh.client`, no client bundle, no browser deps | `package.json` (absent), `index.js` (plain `inject`/`apply`) |
| DSH dependency | `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` | `package.json:17` |
| Composition | `cordis.patch.yml`: one `insert` row (`id: minimal-llm`, `name: "@demo/dsh-minimal-llm"`), exposed via `exports["./cordis.patch.yml"]` and `dsh.bundle.patch` | `cordis.patch.yml:1-3`, `package.json:9-14` |
| `dsh-plugin.json` | not present | glob |
| Lockfile / install track | none in fixture (static copy); registry-package track assumed, unconfirmed | — |

**Critical inventory findings (outside the seven classes, both blocking):**

1. **The declared dependency package no longer exists at the target.** `@deepseek-ai/dsh-host-apiproxy` is the rc.2-era APIProxy package; card `DSH-0.1.2-A1-01` records that **alpha.1 deletes that package** (rc.2 service key `apiProxy`, type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`; "alpha.1 deletes that package; there is no `APIProxy` identifier"). The dependency must be removed and replaced by the owning domain-service cohort at `0.1.2-alpha.2`. Corridor-level install-channel caveats apply (rollup R-01 npm publication gaps, R-08 install-channel pitfalls).
2. **The corridor `from` tag is not pinned.** The dependency pins `0.0.1-rc.1` while the code style matches 0.1.1-rc.2 (per fixture README). The corridor to `0.1.2-alpha.2` is either `rc.2 → alpha.1 → alpha.2` or, if truly older, starts at `rc.1`. This must be confirmed from the real installation identity (registry metadata / the profile's resolved composition) before any migration write; per the skill, corridor edges are connected by `from → to` metadata, never assumed.

## 1 · Seven touchpoint scan

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | **No** | — | — (API-08 classification note) | `cordis.patch.yml` is profile composition, not a source patch; "a filename containing `patch` alone is not a hit for this class" (pre-flight #1). No `patchedDependencies`, `patch-package`, `DSH_HARNESS_SOURCE_ROOT`, or monkey-patching anywhere. |
| #2 events / persistent events | **No** | — | — | No `ctx.on(`, `SessionEvent`, `subscribe(`, or known event names in any file. `src/session-notes.js` looks suspicious by filename ("session") but contains only pure string/array utilities (`formatSessionNote`, `chunk`) with zero host coupling — a genuine negative, not a masked hit. |
| #3 internal service probes / Remote | **YES** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `await ctx.apiProxy.llm.providers()` | `DSH-0.1.2-A1-01` (primary); api-migration-0.1.2-alpha.2 **API-01** (plane-correct pattern); `DSH-0.1.2-A2-02`/API-02 (only if the call moves to a Remote face); troubleshooting row "waiting for service: apiProxy" | See detailed mapping below. High confidence: exact identifier `apiProxy` plus the deleted package in `package.json` match the card's rc.2 identifiers. |
| #4 direct host directory reads/writes | **No** | — | — | No `DSH_HOME`, `.dsh`, `homedir()`, `readFile`/`writeFile`/`mkdir`/`openPath` in any file. The plugin performs no filesystem access. |
| #5 internal UI / commands / tool registration | **No** | — | — | No `registerCommand`/`registerView`/`contributes`/`ctx.tools`/`ctx.slots`, no `dsh-client-runtime`, no `__ModuleLoader__`/`PLUGIN_ID`. Host-plane only; no client half exists. |
| #6 custom HTTP / WS / RPC / DOM / CSS channel | **No** | — | — | No `createServer`, `WebSocket`, router registrations, loopback URLs, DOM/CSS mutation. |
| #7 subprocess / stdout / stderr parsing | **No** | — | — | No `child_process`, `spawn`, `execa`, no `headless`/`--profile` launches. Only `console.error` logging of its own. |

No-hit notes: the scan covered every file in the fixture (whole tree; nothing to exclude — no `node_modules` or build output). Dependencies/configuration were checked separately in step 0 and **did** produce two blocking findings, which the seven-class scan alone would not surface.

## 2 · Hit touchpoint → card mapping (#3)

### `DSH-0.1.2-A1-01` — APIProxy removed, Host/Web Client calls moved to `@Remote` (breaking, required-if-hit)

The fixture's single call `ctx.apiProxy.llm.providers()` is a textbook hit:

- **What breaks**: the `apiProxy` service and the `@deepseek-ai/dsh-host-apiproxy` package are deleted in alpha.1. With `inject: ["apiProxy"]`, the plugin entry stays **pending forever** (`web boot: N entries did not activate`, `waiting for service: apiProxy` — troubleshooting table row 3). Even if injected, `ctx.apiProxy.llm.providers()` throws because the facade no longer exists.
- **Correct migration (per the card's field note + API-01 ledger)**: this plugin is **Host-plane** (no `dsh.client`, plain Cordis plugin). The field note is explicit: the old `apiProxy` is the host-plane facade, `ctx.remote` is the client-plane facade; they are not in the same runtime, so injection names cannot be swapped one-to-one. The correct migration for host-plane apiProxy consumers is to skip the gateway and inject the domain service behind it directly (`inject: ["llm"]`, then `ctx.llm.listProviders()`); if you mistakenly change it to `inject: ["remote"]`, the host plane reports `pending (waiting for service: remote)`.
- Sketch (plan only — not applied; this task is read-only):
  - `index.js`: `inject = ["llm"]`; replace `ctx.apiProxy.llm.providers()` with `ctx.llm.listProviders()` — **method name must be re-confirmed against the `dsh-v0.1.2-alpha.2` tag's generated declarations before writing** (cards are curated; "when release notes give direction only … the recipe must require re-checking the target tag's types"). Note the Remote-face ledger splits `llm.providers` into `listProviders` + `listConfigurableProviders`; confirm the Host domain service's exact method set at the tag.
  - `package.json`: drop `@deepseek-ai/dsh-host-apiproxy` entirely (deleted package); add the exact `0.1.2-alpha.2` DSH cohort dependency per precision-checklist peer-floor rules; keep the cohort exact and coherent.
  - `cordis.patch.yml` insert row: unchanged (composition; the row name already matches the bare package name).
- **Secondary risk — the silent catch**: `index.js:11-13` wraps the call in `try/catch` and only logs. Card `DSH-0.1.2-A1-30` documents the failure signature: "If the call site silently swallows the error in a catch, the UI renders 'forever blank' instead of an error — a smoke that only asserts no-crash cannot catch it." After migration, the failure path must **surface** (fail loud) rather than remain a swallowed `console.error`, and post-migration smoke tests must assert the success value, not merely absence of exceptions.

### Related but not directly hit

- `DSH-0.1.2-A2-02` / API-02 (`RemoteResult`/`RemoteError`): applies only if the call were moved to the Client `ctx.remote` projection. For the Host domain-service pattern (`ctx.llm.listProviders()`) the ordinary service contract governs; do not adopt Remote error handling on the Host face.
- Rollup R-01/R-02/R-08: dependency-cohort and install-channel constraints for the replaced dependency, not source changes.

## 3 · Do the six no-hit categories prove compatibility with 0.1.2-alpha.2?

**No. Zero hits on the other six categories does not mean this plugin is compatible — and this very fixture demonstrates why.** Judgment and basis:

1. **The scan is heuristic by definition.** pre-flight.md states upfront: "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."
2. **The one hit it does have is a hard breaking removal.** Six of seven categories are clean, yet the plugin is **broken at 0.1.2-alpha.2 as-is**: its declared dependency package was deleted in alpha.1 and its sole service injection (`apiProxy`) stays pending forever. "Tiny plugin, mostly zero hits" and "incompatible" coexist here — the user's premise ("it should have no compatibility problems") does not survive the card-by-card check.
3. **The most important findings live outside the seven classes.** The dependency inventory (step 0) — the `@deepseek-ai/dsh-host-apiproxy` pin and the unpinned corridor `from` — is exactly the surface the touchpoint table does not cover, and it carries the blocking changes. A clean touchpoint table with a stale dependency cohort is a false green.
4. **Cards are a curated list, not a complete API diff** (references/README: "curated means only the identified plugin-relevant changes are included"). No-hit categories can still hide changes not carded, and the corridor `from` is currently unverified — per the skill, an unconfirmed corridor edge must be treated as a gap, not assumed benign.
5. **Silent-failure masking**: this plugin's swallowed `catch` means even a runtime smoke that only checks "no crash" would report success while the feature is dead (A1-30 field-note pattern). A compatibility conclusion drawn from a green boot plus a quiet console would be wrong.

**What is still needed before any compatibility conclusion (and before implementing the migration):**

- Pin the corridor `from` tag from the real installation identity (registry metadata / resolved profile composition), not from code style; then read the full corridor (`rc.2 → alpha.1 → alpha.2`, or from `rc.1` if older) and fold net changes.
- Re-confirm the exact Host `llm` domain-service method names and the peer-dependency cohort against the `dsh-v0.1.2-alpha.2` tag's generated declarations (do not reverse-engineer from the Client Remote table or from memory).

**Mandatory post-migration verification steps (recorded here per the brief; not executed in this read-only task):**

1. Dependency layer: package-manager install with the exact `0.1.2-alpha.2` cohort; full dependency-graph scan confirms no `@deepseek-ai/dsh-host-apiproxy` residue anywhere (not just top-level).
2. Static layer: build + typecheck of the plugin against the target cohort's declarations (no `ctx: any` masking).
3. Enablement layer: isolated-profile cold boot (`verify-runtime.mjs`) — entry activates, does not wait for `apiProxy`/`remote`, no pending required/provided services; failure attributed (plugin-code / dependency-resolution / profile-config / dsh-runtime).
4. Behavior layer: one real message → tool/response or equivalent flow; specifically assert the provider listing **returns data** (not merely no-exception — the silent-catch pattern demands a positive assertion), and that a failure path surfaces loudly.
5. Wrapper layer: exit codes, stdout/stderr, cancellation, teardown of the `ctx.effect` cleanup.

## Summary

- **Completed**: read-only seven-class scan of all 5 fixture files; step-0 dependency/config inventory; #3 mapped to `DSH-0.1.2-A1-01` with the Host-plane migration pattern from API-01; verification plan recorded.
- **Skipped**: no-hit categories #1, #2, #4–#7 with per-class evidence above; `cordis.patch.yml` correctly classified as composition (API-08), not a #1 patch hit.
- **Pending/residual risk**: corridor `from` tag unpinned (`0.0.1-rc.1` dependency pin vs rc.2-style code); Host `llm` service method names unconfirmed against the target tag; no lockfile/install track in the static fixture; nothing has been executed (static copy, dsh not installed).
- **Rollback**: not applicable — this task made no writes anywhere; the fixture is byte-identical to its delivered state.
- **Recommendations**: after migration, drop the swallowed `catch` in favor of fail-loud error surfacing; keep the plugin Host-plane (it has no client half — do not "modernize" it onto `ctx.remote`); bump the plugin's own SemVer separately from the DSH cohort version when releasing.
