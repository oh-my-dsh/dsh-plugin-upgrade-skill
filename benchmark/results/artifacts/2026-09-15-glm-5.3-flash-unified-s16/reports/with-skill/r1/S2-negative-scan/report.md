# S2 · Negative Scan Report — `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

- **Mode**: A · inspect (read-only pre-flight scan; no file under `fixture/` was modified, nothing was installed or executed as a migration)
- **Date**: 2026-09-15
- **Scan scope**: all 5 files of the static copy (`package.json`, `cordis.patch.yml`, `index.js`, `src/session-notes.js`, `README.md`); no hidden files, no lockfile, no `node_modules`, no git metadata present.
- **Method**: skill `plugin-upgrade` pre-flight seven-class touchpoint scan (`references/pre-flight.md`), read against the full corridor `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2` (`references/v0.1.2-alpha.1.md` 28 cards, `references/v0.1.2-alpha.2.md` 8 cards, plus `rollup-0.1.2.md` and the `api-migration-0.1.2-alpha.2.md` ledger).

---

## 1. Identity and inventory (pre-flight step 0)

| Item | Value | Evidence |
|---|---|---|
| Plugin package / version | `@demo/dsh-minimal-llm` @ `0.1.0`, private, ESM | `package.json:1-5` |
| Entry | `index.js` (`exports["."]`) | `package.json:6-10` |
| Composition | `dsh.bundle.patch: ./cordis.patch.yml`, one insert row `id: minimal-llm`, `name: "@demo/dsh-minimal-llm"` | `package.json:11-14`, `cordis.patch.yml:1-4` |
| DSH dependency cohort | `@deepseek-ai/dsh-host-apiproxy` @ `0.0.1-rc.1` (the only dependency) | `package.json:16-18` |
| Face | Ordinary Cordis **host-plane** plugin — no `dsh.client` key, no `dsh-plugin.json`, no client bundle | whole `package.json` |
| Standard manifest | absent | — |
| Lockfile / engines / peers | absent (static copy; resolved versions unknown) | — |
| Code surface | `inject = ["apiProxy"]` + one call `ctx.apiProxy.llm.providers()` in try/catch; `src/session-notes.js` = pure string/array utilities, zero host coupling (the `session` in its filename is a naming habit, not a Session API usage) | `index.js:3,9`, `src/session-notes.js:1-10` |

**Corridor pin.** `index.js:2` self-describes as "0.1.1-rc.2 style: injects apiProxy", which matches card DSH-0.1.2-A1-01's record that rc.2's service key `apiProxy` is typed by package `@deepseek-ai/dsh-host-apiproxy` (deleted in alpha.1). So the working corridor is **`dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2`**. Caveat: the dependency version `0.0.1-rc.1` is a sub-package version, not a host tag (per rollup-0.1.2 the `@deepseek-ai/dsh-*` sub-packages' `latest` sat at `0.0.1-rc.1`), so it cannot refine the pin; the static copy has no lockfile/HEAD/host record to prove the exact from-tag. See §5 for the residual risk if the real source predates rc.2.

---

## 2. Seven touchpoint classes — hit/no-hit with evidence

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 source patch / monkey patch | **No** | — | (API-08 classification only) | Pattern `patch\.yml|patchedDependencies|patch-package\|DSH_HARNESS_SOURCE_ROOT\|monkeypatch` → 0 matches. `cordis.patch.yml` matches the filename pattern literally but is **profile composition** (a bundle insert row), not a source patch — per pre-flight #1 and API-08 it is classified as a composition overlay and is *not* a hit for this class. No host source is replaced anywhere. |
| #2 internal / persistent events | **No** | — | — | `SessionEvent`, `session/event`, `ctx.on(`, `subscribe(`, `tool/code-dispatch`, `connection/reset` → 0 matches. The plugin produces and consumes no events; `src/session-notes.js` contains no event API despite its filename. |
| #3 internal service probes / Remote | **YES** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `ctx.apiProxy.llm.providers()`; `package.json:17` dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` | **DSH-0.1.2-A1-01** (primary), **DSH-0.1.2-A2-02** (error-handling follow-up), R-05 (removed-package inventory) | Face: host-plane ordinary plugin. See §3. |
| #4 direct host directory reads/writes | **No** | — | — | `DSH_HOME`, `.dsh/`, `profiles/`, `homedir(`, `readFile|writeFile|mkdir|openPath`, `fs.`, `node:fs` → 0 matches. No filesystem access at all. |
| #5 internal UI / commands / tools registration | **No** | — | — | `registerCommand|registerView|contributes|ctx.tools|commands.execute`, `dsh-client-runtime|useSession|useChat|ctx.slots`, `__ModuleLoader__|PLUGIN_ID` → 0 matches. No client half, no tool/command/UI registration. Composition row naming already complies with the DSH-0.1.2-A1-26 convention (`name` = bare scoped package name `@demo/dsh-minimal-llm`), and A1-26's client-side id alignment does not apply since there is no client bundle. |
| #6 custom HTTP / WS / RPC / DOM / CSS channels | **No** | — | — | `createServer(`, `WebSocket`, `localhost|127.0.0.1`, `router.(get|post…)`, `/api/`, DOM/composer tokens → 0 matches. |
| #7 subprocess / stdout / stderr parsing | **No** | — | — | `node:child_process|spawn(|execSync|execa|Bun.spawn`, `headless|--profile` → 0 matches. The plugin's own `console.error` logging is its *own* output, not parsing of a subprocess's streams — DSH-0.1.2-A1-05's stderr contract concerns wrappers that parse dsh's stderr, which this plugin does not do. |

**No-hit notes**: scan covered every tracked file (5 files, no exclusions needed — no vendor/generated dirs exist); dependency/configuration surfaces (`package.json` deps, `dsh.bundle.patch`, `cordis.patch.yml` rows) were checked separately from the source grep. Special surfaces: no permissions/approval usage (A1-07 n/a), no pi-ai dependency (A1-24 n/a), no settings API (A2-10 n/a), no `pluginInventory` consumption (A2-05 n/a), no privacy-relevant telemetry surface owned by the plugin (A1-12/A1-14/A1-23 are deployment-level, informational only here).

---

## 3. Hit → change-card mapping (touchpoint #3)

**DSH-0.1.2-A1-01 · APIProxy removed, Host/Web Client calls moved to `@Remote`** (breaking, required-if-hit, touchpoints #3 / indirectly #1)

- **What breaks**: alpha.1 deletes the `@deepseek-ai/dsh-host-apiproxy` package and the `apiProxy` service key entirely (R-05 lists `dsh-host-apiproxy` among the 5 packages removed rc.2→alpha.1). On 0.1.2-alpha.2 this plugin's entry would stall `pending (waiting for service: apiProxy)` — and even if resolved, `ctx.apiProxy.llm.providers()` has no target.
- **Target behavior for this face** (host-plane, per A1-01's field note and API-01's host pattern — *not* the `ctx.remote.*` client table): skip the gateway and inject the owning domain service directly:
  - `export const inject = ["apiProxy"]` → `export const inject = ["llm"]`;
  - `await ctx.apiProxy.llm.providers()` → `await ctx.llm.listProviders()` **and** `await ctx.llm.listConfigurableProviders()` (the single old call was split into two per the A1-01 ledger row `llm.providers` → `llm/listProviders` + `llm/listConfigurableProviders`);
  - never change the inject to `"remote"` on the host plane — `remote` exists only on the client face and the entry would hang `pending (waiting for service: remote)` forever.
- **Packaging consequence**: drop `@deepseek-ai/dsh-host-apiproxy` from `dependencies` (the package no longer exists); the plugin needs no new hard DSH runtime dependency for a host-plane domain-service inject. Install-channel pitfalls for the new cohort (mirror lag, pnpm `minimumReleaseAge`, prerelease peer-floor semantics, alpha.1 never published to npm while alpha.2 is) are rollup R-01/R-08.
- **Composition**: `cordis.patch.yml` needs no change (insert row id/name already conform to A1-26's bare-package-name convention); verify via `dsh --profile <p> --dump-config` after migration.

**DSH-0.1.2-A2-02 · Remote failures become `RemoteError`; error codes gain namespaces** (breaking, required-if-hit on `ctx.remote` / Remote-failure handling — conditional here)

- The current `catch { … error.message }` in `index.js:11-13` does not branch on codes, so nothing breaks mechanically today; but once migrated, any future error-code handling must use the namespaced vocabulary (`gateway/cancelled`, `gateway/internal`, `llm/…`) and `result.ok` / `isRemoteFailure` semantics instead of `instanceof` or message parsing. Flagged as a follow-up obligation attached to the #3 migration, not an independent change.

**Corridor net-state check (folded, no action)**: `SessionEvent.ignorable` was removed in alpha.1 (DSH-0.1.2-A1-02) and restored in alpha.2 (DSH-0.1.2-A2-01) — net: nothing to do, and irrelevant anyway since #2 is a no-hit. This is exactly why the full corridor was read before concluding.

---

## 4. The key question: do the zero-hit categories prove compatibility with 0.1.2?

**Judgment: No. Zero hits do not certify compatibility — and in this specific case the plugin is, as-is, *not* compatible with 0.1.2-alpha.2 at all, because the one hit (#3) is a hard blocker.**

The basis, in order of authority:

1. **The pre-flight scan says so about itself.** `references/pre-flight.md` (header): *"This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."*
2. **The card sets are curated, not a complete API diff.** Both corridor files state this explicitly, and `references/README.md` defines `curated` as "only the identified plugin-relevant changes are included". A zero-hit scan can only clear the *catalogued* surfaces; it cannot clear uncatalogued ones. The corridor files themselves carry the warning: "Host UI/performance changes without cards do not mean 'definitely no API impact'".
3. **Line-level greps cannot see data flow.** Pre-flight #4 warns that a hit-level search cannot reveal where a path/value comes from or goes; the same limits apply to the zero-hit classes. Semantic coupling (e.g., an indirect consumer of a changed shape) is invisible to the patterns.
4. **The `from` pin is an assumption here.** The static copy has no lockfile, no git history, and no host-version record. If the real source cohort predates `0.1.1-rc.2` (the `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` pin cannot disambiguate), the corridor gains two more edges (DSH-0.1.1-R1-01…09, DSH-0.1.1-R2-01…03) that would have to be re-scanned. The zero-hit claim is only as good as the corridor it was scanned against.
5. **What zero hits *do* legitimately tell you** — and this is the useful, bounded conclusion: for the six no-hit classes, **no card in the rc.2 → alpha.2 corridor requires any migration action on those surfaces for this plugin**. That narrows the migration to touchpoint #3 plus packaging; it does not establish runtime compatibility, which only the verification ladder below can do.
6. **"Tiny" is not evidence.** This plugin's entire host coupling is 2 lines, and those 2 lines sit exactly on the corridor's biggest breaking change (APIProxy removal). Size and hit count are orthogonal to compatibility.

**What is still needed before a compatibility conclusion can be signed** (mandatory post-migration steps per SKILL.md "Validation and reporting", rollup "Layered validation checklist", API-01 "Verification by face"; this task only records them — none were runnable here because the fixture is a static copy with dsh not installed):

1. **Confirm the exact from-tag** from the real repository (git history, lockfile, the host it actually ran on) to close the corridor-pin gap in §1;
2. **Baseline (R-06)**: run build/typecheck/tests in the repo's own dependency state *before* migrating and record the exemption list (baseline: **not collected** — static copy, no toolchain);
3. **Dependency resolution**: remove `@deepseek-ai/dsh-host-apiproxy`; install the exact target cohort (`^0.1.2-alpha.2`), verify with `pnpm list --depth 0 | grep @deepseek-ai` (or npm equivalent) and a full-lockfile scan for the old cohort (R-01/R-08 pitfalls: alpha.1 is not on npm; alpha.2 is; mirror lag / `minimumReleaseAge` / prerelease peer floors);
4. **Static**: build + typecheck against the target cohort's declarations;
5. **Runtime**: isolated-profile cold boot (e.g. the `verify-runtime` pattern): entry `minimal-llm` active, **no `pending (waiting for service: …)` rows**, `dsh --profile <p> --dump-config` shows the row with the bare package name and no pending;
6. **Functional smoke**: one real `listProviders`/`listConfigurableProviders` round through the new inject, covering the success branch and one failure (the plugin's own log line makes this observable);
7. Then, and only then, choose the plugin's own SemVer bump separately — never reuse `0.1.2-alpha.2` as the plugin's release version (Mode C step 6).

---

## 5. Pending / residual risk

- **From-tag unproven** (see §1/§4.4): if the source is actually older than rc.2, re-scan against the `v0.1.1-rc.1` and `v0.1.1-rc.2` edges. For the record, none of those cards' surfaces (repository-plugins mechanism, `dshClient` manifest merge, client-modules scan, strict `ctx.get`, session event contract, `tasks.peek`, `httpServer`/`tasks` renames, image-attachment schemas) appear in this source, so no *additional* hit is expected — but that is an expectation, not a scan result.
- **0.1.2 final not released at card-verification time**: `api-migration-0.1.2-alpha.2.md` itself requires re-checking exports/types against the final tag once it ships; this report must not be read as a final-release compatibility verdict.
- **Untested runtime**: nothing in this report proves the migrated code boots; layers 3–6 of the verification ladder are unexecuted by design of this task.
- **Rollback**: not applicable — the scan was strictly read-only and `fixture/` is unchanged.

## Bottom line

- **1 of 7 touchpoint classes hit** (#3 services/Remote, `apiProxy`) → map to **DSH-0.1.2-A1-01** (+ A2-02 follow-up, R-05/R-08 packaging): the plugin is **not compatible with 0.1.2-alpha.2 as-is** and needs the small but mandatory host-plane migration `inject ["apiProxy"] → ["llm"]`, `ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()` + `ctx.llm.listConfigurableProviders()`, and removal of the dead `@deepseek-ai/dsh-host-apiproxy` dependency.
- The six zero-hit classes mean "no carded migration work on those surfaces", **not** "compatible". Compatibility is established only after the mandatory verification steps in §4 (build/typecheck on the target cohort, isolated-profile cold boot with no pending rows, one functional providers path).
