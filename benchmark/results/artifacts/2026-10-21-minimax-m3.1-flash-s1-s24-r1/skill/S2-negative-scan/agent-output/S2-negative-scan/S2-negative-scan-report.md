# S2 · Negative Scan Report — `@demo/dsh-minimal-llm` → dsh 0.1.2-alpha.2

**Scan date:** 2026-10-21
**Mode:** Mode A · inspect (read-only). No file under the fixture was created, modified, moved, or deleted.
**Target:** dsh `0.1.2-alpha.2`. Corridor built by the `from → to` edges in the version-corridor index, not by filename order:
`dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` (cards `DSH-0.1.2-A1-*`) → `dsh-v0.1.2-alpha.2` (cards `DSH-0.1.2-A2-*`).
**Fixture integrity:** SHA-256 of all 5 fixture files re-verified against `fixture-seal.pre.json` after the scan — **all MATCH, fixture unchanged**.
**Bottom line:** The premise "tiny plugin, so no compatibility problems" is **wrong for this plugin**. There is exactly one touchpoint hit — and it is the one category whose hit **guarantees** a break. The other six categories are zero-hit, and per the skill's own rule, **zero hits ≠ compatible**.

---

## 1. Scope, method, and what was actually examined

| Item | Value |
|---|---|
| Plugin package name | `@demo/dsh-minimal-llm` (private, `version: 0.1.0`, `type: module`) |
| Entry point | `main: index.js`, `exports["."]: "./index.js"` |
| Declared DSH dependency | `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` (a **runtime** dependency, not a peer) |
| Bundle declaration | `dsh.bundle.patch: "./cordis.patch.yml"` — the plugin is a **Bundle** whose composition overlay inserts one row |
| Composition row | `cordis.patch.yml` → `- insert: [{ id: minimal-llm, name: "@demo/dsh-minimal-llm" }]` |
| Files scanned | 4 (index.js, package.json, cordis.patch.yml, src/session-notes.js) |
| Excluded by the scanner | Markdown (README.md — prose is not a touchpoint), `node_modules`, `lib`, `dist`, `build`, `coverage`, `.git`, `vendor`, files > 1 MiB, sensitive names (`.env`, `.npmrc`, …) |
| Skipped large / dataless files | **none** (`skippedLargeFiles: []`, `skippedDatalessFiles: []`) — the zero-hit result is not an artifact of skipped files |
| Lockfile | **absent** — no `pnpm-lock.yaml` / `package-lock.json` in the fixture (see §6, this is itself a finding) |
| `dsh-plugin.json` (community manifest) | **absent** |
| Tests / build scripts / CI config | **absent** — the plugin has no `scripts` block, no test directory, no CI config, no `tsconfig` |
| Client half | **none** — no `dsh.client` declaration, no `dsh.client.inject`; this is a **Host-plane** plugin |

### Tools run (all read-only, from the cell-local skill copy)

1. `node skills/plugin-upgrade/scripts/plan-migration.mjs --root <fixture> --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2` (text + `--format json`) — the skill's read-only migration planner; resolved the corridor through the card-set frontmatter and reported **0 gaps**.
2. `node skills/plugin-upgrade/scripts/inject-lint.mjs <fixture>` — the alpha.2 residue/peer check.
3. Manual read of all 5 fixture files (each read exactly once) plus the skill's `references/pre-flight.md`, `references/pre-flight-patterns.json`, `references/api-migration-0.1.2-alpha.2.md`, `references/rollup-0.1.2.md`, `references/precision-checklist.md`, `references/v0.1.2-alpha.1.md`, `references/v0.1.2-alpha.2.md`, `references/v0.1.1-rc.2.md`, `references/troubleshooting.md`, and `examples/02-host-side-plugin.md`.

**Not run, and deliberately so:** `verify-runtime.mjs` is **not** read-only — it installs the plugin into a temporary profile and executes plugin code and lifecycle scripts. The task brief forbids installations and migrations, and the fixture is a static, non-executable copy with no installed DSH, so runtime verification is **out of scope here** and is listed as a mandatory post-migration step in §7.

---

## 2. Seven touchpoint categories — hit / no-hit with evidence

Pattern source: `references/pre-flight-patterns.json`. The planner is a **heuristic**; each no-hit below is therefore additionally justified by a manual reading of every fixture file.

| # | Touchpoint | Verdict | Evidence (file:line) | Confidence / caveat |
|---|---|---|---|---|
| #1 | source patch / monkey patch | **NO HIT** | No `patch.yml`, no `patchedDependencies`, no `patch-package`, no `DSH_HARNESS_SOURCE_ROOT`, no `monkeypatch`. The only "patch"-named file is `cordis.patch.yml` — per **API-08** that is a **Profile composition overlay, not a source patch** (a filename containing `patch` alone is not a hit for this class). | High. The composition row itself is a **migration object** (see §3, item C) but is *not* a #1 hit. |
| #2 | internal event names / persistent events | **NO HIT** | No `SessionEvent`, `session/event`, `ctx.on(`, `subscribe(`, `tool/code-dispatch`, `connection/reset` anywhere. `src/session-notes.js` is a **false-friend on the filename only**: it exports `formatSessionNote(text)` and `chunk(lines, size)` — pure string/array helpers with no host coupling. | High. The filename "session" is a historical naming habit, not an event dependency. |
| #3 | internal service probes / Remote | **HIT** | `index.js:3` — `export const inject = ["apiProxy"]`; `index.js:9` — `await ctx.apiProxy.llm.providers()`; also `index.js:2` (comment), `index.js:6`, `index.js:10`, `index.js:12` (log strings). Planner reports exactly **1 hit** at `index.js:2`, pattern 1. | **Certain — this is the whole risk of the migration.** The service key `apiProxy` and the package `@deepseek-ai/dsh-host-apiproxy` were both **deleted** in alpha.1. |
| #4 | direct host directory reads/writes | **NO HIT** | No `DSH_HOME`, no `.dsh/`, no `profiles/`, no `homedir(`, no `readFile`/`writeFile`/`mkdir`/`openPath`. The only I/O is `console.error` to stderr. | High. |
| #5 | internal UI / commands / tool registration | **NO HIT** | No `registerCommand`, `registerView`, `contributes`, `ctx.tools`, `commands.execute`, no `dsh-client-runtime`, `PropsRuntime`, `ctx.slots`, `useSession`, `useChat`, `__ModuleLoader__`, `PLUGIN_ID`. | High — but see §3 item C: the **Bundle row id / package-name alignment** rule (A1-26) applies to the composition row even though no `#5` pattern matched. |
| #6 | custom HTTP / WS / RPC / DOM / CSS channels | **NO HIT** | No `createServer(`, `WebSocket`, `MutationObserver`, `insertRule`, no `127.0.0.1`/`localhost`, no `router.get/post/put/delete`, no `/api/`, no `contenteditable`/`setSelectionRange`. | High. |
| #7 | subprocess / stdout / stderr parsing | **NO HIT** | No `node:child_process`, `spawn(`, `execSync`/`execFileSync`, `execa`, `Bun.spawn`, no `headless`, no `--profile`. The plugin *writes* to stderr (`console.error`) but never *parses* a child process's output — and it does not parse its own stdout either. | High. |

**Scan result: 1 hit / 6 no-hits.** The single hit is category **#3**.

---

## 3. Hit → change-card mapping

### 3.1 Required change (breaking): the #3 hit

**`DSH-0.1.2-A1-01` · APIProxy removed, Host/Web Client calls moved to `@Remote`** — *type: breaking · touchpoints: #3 (indirectly #1) · action level: **required-if-hit** · edge `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1`*

Key points only (not a card copy):
- rc.2's service key was `apiProxy` (type `ApiProxy`, package `@deepseek-ai/dsh-host-apiproxy`); **alpha.1 deletes that package** — there is no `APIProxy` identifier at the target tag.
- The old `llm.providers` operation maps to two Remote methods (`llm/listProviders` + `llm/listConfigurableProviders`) — one call split into two results.
- **Plane rule (the decisive one):** the old `apiProxy` is the **Host-plane** facade; `ctx.remote` is the **Web Client-plane** facade. They are not the same runtime, so injection names cannot be swapped one-to-one. Mechanically changing `inject: ['apiProxy']` → `inject: ['remote']` yields `pending (waiting for service: remote)` — a different permanent-pending symptom, not a fix.
- The correct Host-plane migration is to **skip the gateway and inject the owning domain service directly**: `inject: ['llm']` + `ctx.llm.listProviders()`.
- This plugin is Host-plane, not a `dsh.client` browser plugin: it has no `dsh.client` declaration and no `dsh.client.inject`. The Client table in API-01 therefore **does not apply** to it.

Corroborating references (key points only):
- **API-01** (`references/api-migration-0.1.2-alpha.2.md`) — the rc.2→alpha.2 interface ledger for APIProxy. Its Host minimal pattern is exactly this migration: `inject = ['llm']`, call `ctx.llm.listProviders()`, and assert `typeof ctx.llm.listProviders === 'function'` before use. Evidence order: the target tag's own exports/`.d.ts`/implementation wins over any ledger text.
- **R-05** (rollup `0.1.2`) — rc.2→alpha.1 removes 5 packages, including `@deepseek-ai/dsh-host-apiproxy` (and `@deepseek-ai/dsh-client-runtime`, `@deepseek-ai/dsh-acp-demo`, `dsh-acp-snapshot`, `dsh-sdk-jsonrpc-demo`). Pre-migration inventory of removed-package consumers is a required step — this plugin is **exactly one such consumer**.
- **Troubleshooting** — symptom `web boot: N entries did not activate` / `waiting for service: apiProxy` → 0.1.2 removed the ApiProxy transport layer, so a row with `require: ['apiProxy']` stays **pending forever**; first cards to check are `DSH-0.1.2-A1-01` and `DSH-0.1.2-A1-25`.
- **Example 02 (Host-side plugin)** — the same scenario, container-verified: `inject: ['apiProxy']` + `ctx.apiProxy.llm.providers()` → `inject: ['llm']` + `ctx.llm.listProviders()`; the recipe is delete the `@deepseek-ai/dsh-host-apiproxy` dependency and the `apiProxy` inject, confirm the domain service and method from the **owning package at the target tag**, then verify on a real profile that the entry activates, no service is pending, and the domain method executes.
- **`DSH-0.1.1-R1-04`** (strict injection, earlier edge) — accessing an undeclared service throws, and in some plugins the throw happens at the top of `apply()`, so the whole `ctx.effect` never registers. This plugin's `apply()` reads `ctx.apiProxy` **inside** `ctx.effect`, so the strict-injection failure mode is contained — but the *service-missing* failure mode is not (see §3.2).

### 3.2 Adjacent / conditional changes that the same hit drags in

| Card | Type | Action level | Why it applies to this plugin |
|---|---|---|---|
| **`DSH-0.1.2-A2-02`** · Remote failures become `RemoteError` instances; error codes gain namespaces | breaking | required-if-hit | Applies to the **Client** Remote path only. On the Host path (`ctx.llm.listProviders()`) there is no `RemoteResult` envelope, so this card is **not** triggered by the recommended Host migration. It becomes live only if the plugin is (mis)migrated to `ctx.remote.llm.listProviders()` — where the result must be branched on `result.ok` first, then `result.error.code` (namespaced codes such as `gateway/cancelled`, `session/not-found`), and `isRemoteFailure` is used only at a catch boundary, never `instanceof`. **This is the trap to avoid by choosing the Host path.** |
| **`DSH-0.1.2-A1-26`** · client-modules scan contract: registration id must equal the package.json name | breaking | required-if-hit (for Web Client plugins) | This plugin has **no client half**, so the client-roster half does not apply. But the **composition-row half** does: alpha.1 keys boot entries/modules by **package name**. The row's `name: "@demo/dsh-minimal-llm"` already equals the package.json `name` (scoped form, as required) — **that part is already correct and must be preserved** when the row is rewritten. |
| **`DSH-0.1.2-A2-03`** · NPM packages trim unneeded peer dependencies (+ R-11 type-surface export drift) | behavior | conditional | The fixture declares **no** `peerDependencies` at all and imports **no** `@deepseek-ai/*` types — so there is nothing to trim here. The real packaging work is replacing the removed `@deepseek-ai/dsh-host-apiproxy` dependency (see §3.3). |
| **`DSH-0.1.2-A2-05`** · plugin inventory returns optional Agent Preset grouping | behavior | conditional | Not hit — the plugin never reads `pluginInventory/list`. |
| **`DSH-0.1.2-A2-06`** · Client Remote adds fixed Host facts `$host.home/isLoopback` | behavior | required-if-hit (Client) | Not hit — Client plane only. |
| **`DSH-0.1.2-A2-08`** · `sessionProjections` becomes a required inject and peer | breaking | required-if-hit | Not hit — the plugin mounts no `dsh-tool-todo` / `dsh-tool-subagent` / `dsh-agent` / `dsh-agent-loop` / `dsh-terminal-bash` and declares no such peers. |
| **`DSH-0.1.2-A2-01`** / **`DSH-0.1.2-A1-02`** · `SessionEvent.ignorable` removed then restored | fix | required-if-hit | Not hit — #2 is zero. Worth noting the corridor **net state** rule: the marker was removed in alpha.1 and restored in alpha.2, so a target of alpha.2 means *net zero change* here. |
| **`DSH-0.1.2-A1-23`** / **`DSH-0.1.2-A1-12`** · base composition telemetry default `DISABLED` → `FEEDBACK_ONLY`, new plugin-package-name reporting row | privacy | conditional / informational | Deployment-side, not plugin code. The plugin ships no user-facing text and registers no locale namespace, so the **locale-pairing** rule and the `@deepseek-ai/dsh-client-locale` seat do not apply. |
| **rollup `R-01`** / `R-08` | process | — | The dependency cohort must be pinned to the target cohort and installed through the official registry. `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` **cannot** be kept (removed package) and a bare package name resolves to a floating dist-tag. |
| **rollup `R-02`** | breaking (combined) | — | If the plugin must keep working on an **old rc.2 host** as well as an alpha.2 host, a hard `inject: ['llm']` breaks on rc.2 (service absent) and a hard `inject: ['apiProxy']` breaks on alpha.2. That forces the dual-cohort strategy (weak probe at the use site, or a `!!js` composition probe in `cordis.patch.yml` per `references/host-plane-probes.md`). **Decide the support matrix before writing code.** |
| **rollup `R-06`** | process | — | Baseline attribution. The fixture has **no** test/build/typecheck script, so the mechanical baseline is trivially empty — but record that explicitly rather than treating "no tests" as "no risk". |
| **rollup `R-12`** | security | — | If the migration is performed from inside a running DSH session on that host, upgrading the host can kill the session. Hand the host-upgrade step to the user as an external-terminal procedure. |

### 3.3 The dependency change the hit forces (not a touchpoint, but mandatory)

`package.json:16-18`

```json
"dependencies": { "@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1" }
```

This is a **removed package** (R-05 list). It must be deleted, and the replacement cohort must be pinned explicitly. Two sub-cases, and the difference matters:

- If the plugin needs only the **LLM domain service**, the correct alpha.2 shape is `inject: ['llm']` + `ctx.llm.listProviders()`. Whether a package dependency on the owning `@deepseek-ai/dsh-llm` package is also required must be confirmed **from the target tag's own package manifest** (the "peers are a superset of inject" rule: every module whose types or services the plugin touches must appear in `peerDependencies` on the cohort floor).
- If the plugin must keep supporting rc.2, a single `inject` list cannot express both cohorts; use a weak probe at the use site or a `!!js` composition probe (R-02 + `host-plane-probes.md`).

### 3.4 Composition / packaging boundary (API-08, API-07)

- `cordis.patch.yml` is **composition**, not a source patch. The row `- insert: [{ id: minimal-llm, name: "@demo/dsh-minimal-llm" }]` is a **Bundle row** inserted by the plugin's own `dsh.bundle.patch`.
- **API-08 composition precedence** (lowest → highest): profile `dsh.profile.bundles` patches → `$DSH_HOME/profiles/<name>/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → CLI `--patch` overlays. Later layers win.
- **API-07**: the manifest declares `dsh.bundle.patch`, so the pack manifest **must actually contain** `cordis.patch.yml` — otherwise the install is recognized but the Loader/dump fails on a missing overlay file. `exports["./cordis.patch.yml"]` does **not** satisfy this boundary.
- A row whose `id` matches an existing row means `config` is a **whole replacement**, not a deep merge.
- **Plugin-ownership caution (troubleshooting, real field note):** a *model-facing tool* plugin should not declare `dsh.bundle` and insert a tool row into the host composition — a global-layer tool reaches **every** agent regardless of the composed preset. This plugin registers no tool and no model-facing row, so it does not trip this — but it is the reason to keep the row minimal.

---

## 4. The main question: can the six no-hit categories tell me this plugin is compatible with 0.1.2?

**No. They cannot. The premise is unsound, and the no-hit set is in fact the *opposite* of reassuring here.**

### Basis 1 — the skill states the rule explicitly
`references/pre-flight.md` opens with: *"This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."* The skill's own planner output carries the same caveat: *"This is a heuristic plan, not compatibility proof."*

### Basis 2 — the one hit is a guaranteed break, and it is the whole migration
The plugin is not "mostly compatible". It is **one line away from not booting at all**: `inject = ["apiProxy"]` names a service that alpha.1 **deleted** (`DSH-0.1.2-A1-01`). On the target host the row does not activate; it sits at `pending (waiting for service: apiProxy)` forever, and `ctx.apiProxy.llm.providers()` throws. The dependency `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` is a **removed package** (R-05), so the install itself is unresolvable. The size of the plugin is irrelevant: the break is in the *composition seam*, and the seam is exactly what a tiny plugin has and nothing else.

### Basis 3 — "no hits" is a statement about the *scanner*, not about the plugin
A zero hit means "none of the current regexes matched". The regexes are **syntactic and narrow**. Concretely, they cannot see:
- **Dependency / cohort validity** — a *removed package* pinned in `dependencies` is invisible to touchpoint patterns. The `inject-lint` run proves this: it reported `verdict: "FIX-REQUIRED"` **with zero touchpoint hits**, because it checks peers/residue, not patterns. That is the cleanest single demonstration that a clean touchpoint table coexists with a broken plugin.
- **Peer floors and cohort pinning** (precision-checklist: `@deepseek-ai/cordis` at `^4.0.1`, `@deepseek-ai/dsh-*` peers on the target cohort, no bare `cordis` key, no `-rc` suffix). The fixture has **no** `peerDependencies` — so it fails the peer-floor rule by omission, invisibly to every touchpoint class.
- **Face / plane correctness** — whether the injected name is even valid *on the plane the plugin runs on*. `#3` hit/no-hit says "does it mention a service"; only the card says "is that service still there, and on which plane".
- **Composition correctness** — whether the row id, the row `name`, the package.json `name`, and the pack manifest agree (A1-26, API-07, API-08).
- **Behavioral drift** — even a perfectly-migrated `ctx.llm.listProviders()` must be checked against the target tag's actual contract (does it return a list? a `RemoteResult`? is it sync or async? does it throw or return empty?). The API-01 ledger explicitly says each legacy call must be confirmed **item by item against the target tag** — "do not reverse-engineer it from the Client Remote table".

### Basis 4 — the "no-hit" categories in this plugin do not even fire on the right thing
Two of the six no-hits are actively misleading if read as compatibility evidence:
- **#2 no-hit is a filename coincidence.** `src/session-notes.js` contains the word "session" and nothing else. Reading "no session-event hit" as "the session surface is safe" is reasoning from a name, not from a dependency.
- **#7 no-hit is a direction-of-data mistake.** The plugin *emits* on stderr and never *parses* a subprocess. "No subprocess hit" says nothing about whether the plugin's own stderr output is still meaningful under the new host's logging, nor about the headless stdout/stderr contract (`DSH-0.1.2-A1-05`) if the plugin is ever driven headlessly.
- **#1 no-hit is a classification trap.** `cordis.patch.yml` *is* a migration object — just not a #1 hit. Per API-08, classifying it by filename produces a false positive that "generates wrong migration tasks" (rebasing source hunks that do not exist, deleting valid bundle rows).

### Basis 5 — the one thing the no-hit set *can* legitimately support
A narrow, honest claim: **"no known breakage in categories #1, #2, #4, #5, #6, #7."** That is a statement about *known carded risks in those classes* for this corridor. It is **not** a compatibility verdict, and it says nothing about the #3 hit that is present, about dependencies/cohort, about composition, or about runtime behavior.

### Judgment (one line)
> **Zero hits in six categories is a scoping result, not a compatibility verdict. The compatibility verdict for this plugin is "not compatible as written" — and the reason is visible only in the one category that *did* hit, plus the dependency it pins.**

### What else is needed before a verdict can be issued
1. **Corridor confirmation** — confirm the real `from` tag. The fixture has no lockfile and no `@deepseek-ai/dsh` pin; the corridor `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2` is **assumed** from the plugin's own comment (`index.js:2`, "0.1.1-rc.2 style") and must be confirmed against the install track (**unconfirmed** in this scan). If the real `from` is older than `dsh-v0.1.1-rc.2`, the segment is an **unsupported gap** and must be researched from exact-tag source, not from memory.
2. **Cohort inventory** — the exact `@deepseek-ai/*` packages and versions the target host exposes, and whether the removed `@deepseek-ai/dsh-host-apiproxy` has any replacement. `R-01`/`R-05`.
3. **Target-tag contract check** — read the owning package's exports/`.d.ts`/implementation at `dsh-v0.1.2-alpha.2` and confirm the service key and method that replace `ctx.apiProxy.llm.providers()` on the **Host** plane. The API-01 ledger's Host example is `llm`/`listProviders()`, but the skill's rule is that **the target tag wins** over any ledger text, and a conflict must be reported, not silently resolved.
4. **Support-matrix decision** — alpha.2-only, or dual-cohort with rc.2 (which changes the migration shape entirely: R-02 + `!!js` composition probes).
5. **Baseline (R-06)** — the mechanical suite in the repository's own dependency state, before any writes. Here the fixture has **no** build/test/typecheck script, so the baseline is empty *by construction* — that is a fact to record, not a fact to hide.
6. **The verification ladder** in §7 — build/typecheck, isolated-profile cold boot, functional smoke.

---

## 5. Recommended migration shape (plan only — nothing was changed)

**File 1 — `index.js`**

```js
// Host plane: inject the owning domain service, not the removed gateway facade.
export const inject = ['llm']

export function apply(ctx) {
  ctx.effect(async () => {
    try {
      const providers = await ctx.llm.listProviders()
      // ... consume
    } catch (error) {
      // report; do not swallow into a silent blank state
    }
  })
}
```

Notes:
- Do **not** mechanically write `inject: ['remote']` — that is the documented trap (`pending (waiting for service: remote)`).
- Keep the `ctx.effect` registration shape; strict injection (`DSH-0.1.1-R1-04`) means the service access must be declared in `inject`.
- If dual-cohort support is required, probe the service weakly at the use site instead of widening `inject`, and never block on an inject wait (R-02, R-07).
- Keep the failure visible: a swallowed error renders "forever blank" and stays green under a no-crash smoke (A1-30 field note).

**File 2 — `package.json`**
- Delete `"@deepseek-ai/dsh-host-apiproxy": "0.0.1-rc.1"` (removed package, R-05).
- Add/pin the cohort dependency and peers on the target cohort (`^0.1.2-alpha.2` or later within the cohort); `@deepseek-ai/cordis` at `^4.0.1` if a peer is declared; no bare `cordis`, no `-rc` suffix in peer floors (precision-checklist).
- Keep `exports["./cordis.patch.yml"]`, and confirm the patch file is in the **pack manifest** (API-07).

**File 3 — `cordis.patch.yml`**
- Keep `name: "@demo/dsh-minimal-llm"` — the bare scoped package name (A1-26). Do not "tidy" it into a short id.
- Verify the composed result with `dsh --profile <p> --dump-config`: row present, **no pending lines**, correct layer precedence (API-08).

**File 4 — `src/session-notes.js`** — **no change**. It is a pure utility module with zero host coupling. Renaming or "modernizing" it would be an unrelated diff.

**Not adopted:** `capability` cards (A1-11, A1-09, A1-10) are suggestions only and are never adopted automatically. No locale namespace is needed (no user-facing text). No client-half work is needed (no `dsh.client`).

---

## 6. Pre-existing / residual risk found in the fixture (read-only observations)

| # | Observation | Evidence | Significance |
|---|---|---|---|
| P1 | No lockfile of any kind | fixture tree | The resolved cohort is **unknown**; the dependency version in `package.json` (`0.0.1-rc.1`) is a declared range, not a resolved one. R-08 pitfall 2 explicitly calls out a lockfile pinning vanished versions (`@deepseek-ai/*@0.0.1-rc.1`) as a 404/refusal trigger. |
| P2 | No `peerDependencies`, no `engines`, no `scripts`, no `tsconfig`, no tests, no CI | `package.json` | The "peers are a superset of inject" rule and the alpha.2 peer floor have nothing to check — but also nothing that *proves* cohort alignment. `inject-lint` returned `cordisPeer: null`, `cordisOk: false`. |
| P3 | `private: true` | `package.json:4` | The plugin is not published; the delivery channel is a local/`link:` install track (R-09) or a private registry. `R-04`'s dist-tag guidance (`alpha` vs `latest`) does not apply, but the "install one artifact, pin the cohort" rule still does. |
| P4 | `version: 0.1.0` with no DSH host version anywhere | `package.json:3` | Per SKILL.md step 6, the plugin's own SemVer bump is a **separate** decision from the DSH cohort, and the DSH host version must never be reused as the plugin release version. |
| P5 | The plugin is a **Bundle** whose only row is its own package | `cordis.patch.yml` + `dsh.bundle.patch` | A Bundle row that inserts the plugin's own package must not collide with an id the host already provides — Cordis treats a duplicate insert as **fatal** (duplicate loader entry id), not a silent override. Verify at the target tag that the id `minimal-llm` is not already present. |
| P6 | `console.error` for all output | `index.js:6,10,12` | Not a touchpoint (#7 is about *parsing*), but the only observability the plugin has. If the host's stderr contract changes (A1-05 adds a `dsh: reasoning:` segment to headless stderr), these lines interleave with host diagnostics. Low impact, worth knowing before reading boot logs. |
| P7 | `src/session-notes.js` is unreferenced by any other fixture file | tree | It is dead-but-harmless code. It is **not** evidence of a session-event dependency, and it does not need migrating. |
| P8 | The `inject-lint` verdict is `FIX-REQUIRED` despite zero touchpoint hits | tool output | The cleanest proof of the §4 thesis: a completely clean touchpoint table coexisted with a plugin that cannot install and cannot boot. |

---

## 7. Mandatory post-migration verification (not run in this task)

Ordered ladder; do not advance until the previous layer passes. Every command carries an explicit timeout — a host boot that hangs otherwise waits forever.

**Layer 0 — Baseline (R-06), before any write**
1. Record `HEAD`, working-tree state, resolved dependency versions, lockfile hash, tool versions, exact commands and exit codes.
2. Run the mechanical suite in the repository's own dependency state. For this fixture the suite is empty (no scripts) — record that fact explicitly, do not treat "no tests" as "no risk".
3. Baseline failures go into a do-not-fix exemption list.

**Layer 1 — Dependency resolution**
4. `pnpm list --depth 0 | grep @deepseek-ai` — every `@deepseek-ai/*` on the target cohort, no mixture, no removed package left.
5. Scan the **whole** lockfile for the old cohort and for removed packages (`@deepseek-ai/dsh-host-apiproxy`, `@deepseek-ai/dsh-client-runtime`, …).
6. Install through the official registry (`npm_config_registry=https://registry.npmjs.org`) to avoid mirror lag; per-scope `minimumReleaseAgeExclude` for `@deepseek-ai/*` on the day an alpha ships (R-08). Confirm the pinned peer range admits the prerelease target — `^0.1.0-rc.8` does **not** admit `0.1.2-alpha.2` under npm's prerelease rules.

**Layer 2 — Static: build / typecheck**
7. `pnpm run clean && pnpm run build && pnpm run typecheck && pnpm run test` (run `clean` first — incremental `tsbuildinfo` produces false TS2305/TS2614; a clean-build can fail where `tsc` passes, so `tsc` alone is not sufficient).
8. Typecheck against the **real** `Context`/projection — never `ctx: any`. If a selector or callback silently widens to `any`, run one diagnostic typecheck with `skipLibCheck: false` and declare the packages owning the consumed declarations.
9. `node skills/plugin-upgrade/scripts/inject-lint.mjs <plugin-dir>` → expect `verdict: "OK"` (no residue, peers complete, `cordis` peer at `^4.0.1`). The current `FIX-REQUIRED` must become `OK`.
10. Artifact smoke: `npm pack --dry-run --json --ignore-scripts` — confirm `cordis.patch.yml` **is** in the pack manifest (API-07), and that the runtime JS and `.d.ts` resolve from the actual artifact.

**Layer 3 — Card-level tests**
11. One assertion per hit touchpoint. For the #3 hit: a test that fails if the service key is `apiProxy`; a success-path test for the domain call; a test that a domain failure is **surfaced**, not swallowed; a test that cancellation terminates without retry (if the Client path is ever used, per A2-02). Test doubles must encode the descriptor table so drift becomes a test failure.
12. Guard against silent error swallowing — a call site that catches the error leaves the UI blank while every smoke stays green.

**Layer 4 — Real cold boot on an isolated profile**
13. `timeout 60 dsh --profile <scratch> --dump-config` — the composed result shows the row `minimal-llm` / `@demo/dsh-minimal-llm`, with **no pending lines** (in particular no `pending (waiting for service: apiProxy)` and no `pending (waiting for service: remote)`).
14. `timeout 90 dsh --profile <scratch> --port 30xx` — cold boot; the boot log shows the plugin entry **active**, no `missed the module table`, no `service-unavailable` loop, and no entry left pending. Use an isolated `DSH_HOME`/scratch profile; never the production instance.
15. `node skills/plugin-upgrade/scripts/verify-runtime.mjs <plugin> --json` — the skill's end-to-end activation verifier, in a **disposable container** (it really installs and runs plugin code and lifecycle scripts; it is not a sandbox). Its failure attribution (plugin-code / dependency-resolution / profile-config / dsh-runtime) is the fastest way to localize a failure. **Not run in this task** — the brief forbids installations.
16. If dual-cohort support is claimed: boot the **same artifact** on the old host and the new host (R-02, layer 5 of the ladder).

**Layer 5 — Functional smoke**
17. Execute one real plugin path: the provider-listing call returns the expected provider ids, and the failure path reports a visible error instead of a silent blank.
18. Complete one message → tool → response round if the plugin participates in a model-facing flow (it does not today — it registers no tool).

**Layer 6 — Packaging**
19. Bump the **plugin's own** SemVer separately from the DSH cohort; verify the packed filename and packed manifest both carry the plugin version; never reuse the DSH host version.
20. `npm pack --dry-run --json --ignore-scripts` — the manifest's `dsh.bundle.patch` target exists in the artifact.

**Wrapper layer** — exit code, stdout, stderr, cancellation, teardown: the plugin's only process-visible output is stderr; confirm teardown does not leave a pending effect.

---

## 8. Report structure (per the skill's contract)

- **Pre-existing (baseline)** — not collected (this was a read-only scan; no migration was performed). The fixture has no mechanical suite, so the baseline is empty by construction; this is recorded, not hidden.
- **Completed** — a read-only seven-class touchpoint scan with per-class evidence; the corridor `rc.2 → alpha.1 → alpha.2` resolved with **no gaps**; one hit mapped to `DSH-0.1.2-A1-01` (plus the adjacent cards in §3.2); `inject-lint` and the read-only planner executed; fixture integrity re-verified against the seal (all SHA-256 match, fixture unchanged).
- **Skipped** — touchpoints #1, #2, #4, #5, #6, #7 (no hits, with per-class evidence and the caveats in §2); all runtime verification layers (§7) — out of scope for this read-only task, listed as mandatory post-migration steps; no migration, install, or file write under the fixture.
- **Pending / residual risk** — the `from` tag is **assumed**, not confirmed (no lockfile, no DSH pin: P1); the exact replacement contract for `ctx.apiProxy.llm.providers()` on the Host plane must be read from the target tag's owning package rather than trusted from the ledger; the support matrix (alpha.2-only vs dual-cohort) is an open decision that changes the migration shape; the peer-floor and cohort-pinning rules have nothing to verify because the plugin declares no peers (P2); the fatal-duplicate-insert risk on the Bundle row id (P5) is unchecked; a plugin that is "tiny" can still hide host coupling in the *composition* and *dependency* surfaces, which no touchpoint pattern covers.
- **Rollback** — no writes were made, so there is nothing to roll back. Baseline to record before the migration: branch/HEAD, the (currently absent) lockfile, resolved cohort versions, and the hashes of `package.json` / `cordis.patch.yml` / `index.js`. If the host upgrade is performed from inside a running DSH session, that is the structurally fatal case — hand it to the user as an external-terminal procedure (SKILL.md "Global DSH host upgrades").
- **Recommendations** — adopt the Host domain-service seam (`llm`/`listProviders()`) and keep the plugin small on purpose; do **not** adopt optional capability cards; do not touch `src/session-notes.js`; record the peer floor explicitly even though the plugin has no peers today, so the next cohort bump has a single place to change; and if dual-cohort support is wanted later, implement it once, as a `!!js` composition probe (R-02 + `host-plane-probes.md`), rather than per-consumer try/catch.

---

## 9. One-paragraph answer to the question asked

No — the six zero-hit categories cannot tell you this plugin is compatible with 0.1.2-alpha.2, and in this plugin's case the zero-hit set is beside the point: the single hit is `inject = ["apiProxy"]` / `ctx.apiProxy.llm.providers()`, and `DSH-0.1.2-A1-01` deleted the `apiProxy` service *and* its package `@deepseek-ai/dsh-host-apiproxy` (a removed package per `R-05`) in alpha.1, so on the target host the entry never activates and the install cannot even resolve. A no-hit result is a statement about the scanner's regexes, not about the plugin: it cannot see a removed package pinned in `dependencies`, a missing peer floor, a wrong-plane service name, a Bundle row whose id/name/pack manifest disagree, or a behavioural drift in the replacement contract. The `inject-lint` run is the proof in one line — it reported `FIX-REQUIRED` on a plugin with a completely clean touchpoint table. The honest verdict is therefore **"not compatible as written; one required change (Host-plane APIProxy → owning domain service `llm`/`listProviders()`, plus dropping the removed dependency and pinning the cohort)"**, and it may only be upgraded to "compatible" after the mandatory ladder: baseline (R-06) → dependency resolution → build/typecheck + `inject-lint` OK + pack-manifest check → isolated-profile cold boot with no pending lines → a functional smoke of the provider-listing path. Until then, "no hits" means "no *known* breakage in those six classes", and nothing more.
