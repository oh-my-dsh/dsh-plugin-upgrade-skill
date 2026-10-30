# S2 · Negative Scan Report — @demo/dsh-minimal-llm (0.1.1-rc.2 → 0.1.2-alpha.2)

Read-only scan. The fixture under `fixture/` was not modified, and nothing in it was executed.
This report is the only deliverable written (to `agent-output/S2-negative-scan/`).

## 0. Scan basis, scope, corridor, face

- **Fixture inventory** (5 files): `README.md`, `package.json`, `cordis.patch.yml`, `index.js`, `src/session-notes.js`. No lockfile, no `dsh-plugin.json`, no build/test scripts, no `node_modules`, no hidden files.
- **Method**: the seven touchpoint classes of `references/pre-flight.md`, executed with the exact regexes of `references/pre-flight-patterns.json` against every fixture file (JS RegExp so the `(?<!cordis\.)` lookbehind is honored), **plus** the pre-flight step-0 configuration/dependency inventory and a manual line-by-line read. Pattern results and inventory are reported separately, because they detect different things (see §3).
- **Corridor**: `from` = `dsh-v0.1.1-rc.2` (self-declared in `index.js:2` "0.1.1-rc.2 style: injects apiProxy, dot-domain calls"; consistent with the dot-domain call style), `to` = `dsh-v0.1.2-alpha.2`. Edges: rc.2→alpha.1 (`v0.1.2-alpha.1.md`, 28 cards) and alpha.1→alpha.2 (`v0.1.2-alpha.2.md`, 8 cards). **This window is fully carded — no unsupported corridor gap.** (In a real migration, pin `from` from the actual baseline/process rather than a code comment — pre-flight §1.5 ghost-host check.)
- **Face determination**: no `dsh.client` key in `package.json`; the plugin exports `inject`/`apply(ctx)` and uses `ctx.effect` → **ordinary host-plane (server-side) Cordis plugin**. This decides which half of DSH-0.1.2-A1-01 applies (host-plane recipe, not the client `ctx.remote` table).
- The fixture's own `README.md` was treated as scan input/documentation, not as authority; every conclusion below was re-derived from the pattern run, the inventory, and the source lines themselves.

## 1. Hit / no-hit conclusion per touchpoint category

| # | Touchpoint class | Verdict | Evidence (file:line) | Applicable card |
|---|---|---|---|---|
| 1 | Source patch / monkey patch | **NO HIT** | `cordis.patch.yml` (lines 1–3) is a Loader composition overlay (one `insert` row); `package.json:12-14` `dsh.bundle.patch` is the official bundle-manifest pointer. The class pattern's `(?<!cordis\.)patch\.yml` lookbehind excludes exactly this filename; no `patchedDependencies` / `patch-package` / `DSH_HARNESS_SOURCE_ROOT` / `patch-surface` / `monkeypatch` anywhere. | none (API-08 negative control: composition, **not** a source patch) |
| 2 | Internal event names / persistent events | **NO HIT** | No `SessionEvent` production, no `ctx.on(`, no `subscribe(`, no `tool/code-dispatch` / `tools-code-mode` / `connection/reset` in any file. | none (A1-02 / A2-01 unreachable) |
| 3 | Internal service probes / Remote | **HIT** | `index.js:3` `export const inject = ["apiProxy"]`; `index.js:9` `ctx.apiProxy.llm.providers()` (comments at `index.js:1,2,6` also match). **Plus an inventory-only hit:** `package.json:16-18` depends on `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` — the package alpha.1 deletes (see §2; the lowercase `apiproxy` in the package name does not match the `apiProxy` regex, so the pattern alone under-reports this class). | **DSH-0.1.2-A1-01** (+ R-05) |
| 4 | Direct host directory reads/writes | **NO HIT** | No `DSH_HOME` / `.dsh\` / `profiles\` / `homedir(`, no `readFile`/`writeFile`/`mkdir`/`openPath` in any file. | none (A1-04 / A1-13 / A1-21 unreachable) |
| 5 | Internal UI / commands / tool registration | **NO HIT** | No `registerCommand`/`registerView`/`contributes`/`ctx.tools`/`commands.execute`, no `dsh-client-runtime`/`PropsRuntime`/`ctx.slots`/`useSession`/`useChat`, no `__ModuleLoader__`/`PLUGIN_ID`. The plugin has **no client half at all** (no `dsh.client` key), so the whole client-plane family (A1-25…A1-30) is unreachable. | none (A1-03 / A1-25…A1-30 unreachable) |
| 6 | Custom HTTP / WS / RPC / DOM / CSS channels | **NO HIT** | No `createServer(`/`WebSocket`/`MutationObserver`/`insertRule`, no `127.0.0.1`/`localhost`/`router.*(`/`/api/`, no `contenteditable`/`setSelectionRange`/`data-input-scroll`. | none (A1-08 unreachable) |
| 7 | Subprocess / stdout / stderr parsing | **NO HIT** | No `node:child_process`/`spawn(`/`exec(File)?Sync(`/`execa`/`Bun.spawn`, no `headless`/`--profile`. The plugin's own `console.error` lines (`index.js:6,10,12`) are its logging output, **not** parsing of dsh's stdout/stderr; A1-05 governs consumers of the headless output contract. | none (A1-05 / A2-04 unreachable) |

**No-hit notes** (pre-flight template): scan scope = all 5 tracked fixture files, no excluded directories (there is no `node_modules`/`vendor`/`build output`); dependencies/configuration checked separately via the step-0 inventory (below); `src/session-notes.js` was read in full — two pure functions (`formatSessionNote`, `chunk`), zero imports, zero host coupling, and referenced by nothing in the plugin (unreferenced dead code — a hygiene question, not a compatibility one; the "session" in the filename is naming habit only).

**Step-0 inventory (checked separately from the patterns)**:
- Zero `import` statements in the entire plugin source.
- `package.json`: no `peerDependencies`, no `engines`; single dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`; `dsh.bundle.patch → ./cordis.patch.yml`, which is also in the `exports` map.
- `cordis.patch.yml`: one `insert` row, `id: minimal-llm`, `name: @demo/dsh-minimal-llm` (bare package name).
- `ctx` surface used: `ctx.effect(...)` and `ctx.apiProxy.llm.providers()` — nothing else.

## 2. Mapping the hit to the change cards

### DSH-0.1.2-A1-01 · APIProxy removed; Host/Web Client calls moved to `@Remote` — **the only real hit (required-if-hit, breaking)**

- **Current evidence**: `index.js:3`, `index.js:9`; `package.json:17` (resolved dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`).
- **How it breaks on 0.1.2-alpha.2**: alpha.1 deletes the `apiProxy` service key and the whole `@deepseek-ai/dsh-host-apiproxy` package (A1-01 "Identifiers"; R-05's removed-package list for rc.2→alpha.1 includes `dsh-host-apiproxy`). As written, the entry can never resolve its inject: the row sits at `pending (waiting for service: apiProxy)`, and the effect body would throw on `ctx.apiProxy` (undefined) if it ever ran. Install alone will not reveal this.
- **Plane rule (A1-01 field note + API-01)**: this is a **host-plane** plugin, so the correct migration is to skip the client gateway and inject the owning domain service directly. Do **not** mechanically switch to `inject: ["remote"]` — on the host plane that waits forever on a service that only exists in the browser (`pending (waiting for service: remote)`, the discussion-#5120 failure mode).
  - old: `export const inject = ["apiProxy"]` … `await ctx.apiProxy.llm.providers()`
  - new (host plane): `export const inject = ["llm"]` … `await ctx.llm.listProviders()` — per A1-01's field-note recipe. The card table's `llm/listProviders` + `llm/listConfigurableProviders` split is the **client Remote projection**; for the host call, confirm the exact method (`ctx.llm.listProviders()`) against the alpha.2 tag's declarations before relying on it (API-01 best practice: the target tag's exports/.d.ts/tests are authoritative).
- **Dependency change**: delete the `@deepseek-ai/dsh-host-apiproxy` entry from `package.json` (R-05 inventory → retire). The host `llm` service is provided by the host composition, so no replacement peer is needed; `dependencies` can be dropped entirely. R-01 is cited because the migration touches the dependency cohort (registry reality: `0.1.2-alpha.2` is on npm; the removed package must be removed, not bumped).
- **Error flow**: the existing `try/catch` + `error.message` logging is acceptable for a host-plane domain call. **DSH-0.1.2-A2-02** (`RemoteError`/`RemoteResult`, namespaced codes) binds `ctx.remote` consumers — client plane only — **N/A** here; it becomes mandatory only if the plugin is rewritten as a Web Client consumer.
- **Checked but not applicable**: DSH-0.1.2-A2-08 (`sessionProjections` required inject) applies to self-composed profiles mounting `dsh-tool-todo`/`dsh-tool-subagent`/etc. or plugins listing them as peers — this plugin lists none. DSH-0.1.2-A2-03 (peer trims) leaves nothing behind once the apiproxy dependency is gone. DSH-0.1.2-A1-26 (registration id == package.json name) binds **client bundles**; the host insert row already uses the bare package name.
- **Composition note (API-08)**: `cordis.patch.yml` stays as-is — it is composition, not a patch to rebase. When the bundle is packed, verify the patch file actually ships (`npm pack --dry-run`; the `exports` map listing it is necessary but not sufficient — API-07).

## 3. Judgment: do the zero-hit categories tell us the plugin is compatible with 0.1.2?

**No — "zero hits" is a scope statement, not a compatibility verdict. This fixture is itself the proof.**

1. **The scan is heuristic by design.** pre-flight.md states it outright: *"Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."* Regex cannot see data flow, dynamically constructed service keys, or indirect coupling.
2. **In this very plugin the patterns under-detect the only real break.** The deleted-package dependency at `package.json:17` does not match the #3 regex (lowercase `apiproxy` vs `apiProxy`), so a pattern-only reading misses half of the required migration. It was caught by the step-0 inventory — exactly the discipline that must be applied to the six zero-hit classes as well: "not detected" ≠ "verified clean".
3. **The one detected hit is breaking (A1-01, required-if-hit).** As it stands, the plugin is **not** compatible with 0.1.2-alpha.2 — `apiProxy` and its package are gone. The zero-hit classes only bound the migration scope ("nothing else detected"); they cannot make the plugin compatible.
4. **Cards are curated, not a complete API diff** (references/README.md), and each card file repeats that the absence of a card is not proof of absence of impact. Even this fully carded corridor cannot convert "no card hits" into "compatible".
5. **What zero hits legitimately buy you**: a smaller migration surface (one class to fix instead of seven) and a lower prior for hidden coupling — nothing more.

**What is still needed before anyone can conclude "compatible"** (mandatory post-migration verification — listed here, deliberately **not** executed, per this task's read-only constraint):
1. Apply the A1-01 host-plane change (§2) in a working copy; remove the apiproxy dependency (R-05; R-01 cited for the cohort touch).
2. **Layer 1 · dependency resolution**: `pnpm list --depth 0 | grep @deepseek-ai` (or npm `ls`) plus a full lockfile scan — no `dsh-host-apiproxy`, no old-cohort rows anywhere.
3. **Layer 2 · static**: this plugin is plain JS with no build/typecheck — at minimum `node --check` on each file, and `npm pack --dry-run --json --ignore-scripts` proving `cordis.patch.yml` is inside the artifact (API-07: `exports` map ≠ tarball content).
4. **Layer 3 · enablement**: `dsh --profile <p> --dump-config` shows the `minimal-llm` row with the bare package name and **nothing pending**.
5. **Layer 4 · runtime**: isolated-profile cold boot (skill's `scripts/verify-runtime.mjs`); assert the entry is active, with no `pending (waiting for service: apiProxy)` and no `pending (waiting for service: remote)` (the plane-misjudgment failure mode).
6. **Layer 5 · behavior**: one functional smoke of the migrated path — `ctx.llm.listProviders()` success branch, plus one failure branch (e.g. credentials unconfigured) proving errors surface instead of hanging or silently logging.
7. Hygiene (optional): decide whether to keep the unreferenced `src/session-notes.js`.

## 4. Report skeleton (SKILL.md "Validation and reporting")

- **Pre-existing**: not collected — the fixture has no test/typecheck suite to baseline (R-06 N/A for a read-only scan).
- **Completed**: read-only seven-class scan + step-0 inventory; hit/no-hit per class with evidence (§1); hit mapped to DSH-0.1.2-A1-01 with the host-plane migration sketch (§2); zero-hit interpretation (§3). No source or config was modified.
- **Skipped (with evidence)**: #1 (API-08 composition negative control), #2, #4, #5, #6, #7 — see §1 rows.
- **Pending / residual risk**: the host-side `llm` service method name/shape must be confirmed against the exact alpha.2 tag declarations (API-01); pack-artifact presence of `cordis.patch.yml` unverified (API-07); no runtime evidence of any kind was collected in this task.
- **Rollback**: N/A (read-only scan; nothing changed).
- **Recommendation**: treat this as a **one-card migration** (DSH-0.1.2-A1-01, host plane) plus a dependency removal, then run the six-layer verification above before declaring 0.1.2-alpha.2 compatibility. Do not shorten that to "only one touchpoint hit, roughly compatible" — that is precisely the failure mode this negative scan is testing for.
