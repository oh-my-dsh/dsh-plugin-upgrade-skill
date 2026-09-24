# S17 · External UI Plugin Onboarding Trap — Diagnostic Report

Task: S17-external-ui-plugin-onboarding-trap (read-only incident analysis)
Mode: plugin-upgrade skill, Mode A (inspect / read-only diagnosis) — no migrations, installs, or writes outside this report.
Fixture read: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S17-external-ui-plugin-onboarding-trap\environment\fixture (unchanged; read-only).

Evidence pack reviewed in full: browser-error.txt, profile/cordis.patch.yml, plugin/lib/client.js, plugin-apply-error.txt, working-plugin-excerpt.txt, host-boot-log.txt, restart-notes.txt.

---

## 1. Failure 1 — whole-combo client-bundle failure and the misleading `dsh-typert-registry` name

### Root cause: one bare-ESSM bundle poisons the entire combo

The user's client bundle (fixture plugin/lib/client.js) begins with top-level ESM tokens:

```
import React from 'react'
import { createPortal } from 'react-dom'
...
export function apply(ctx) { ... }
```

What the host actually assembles (host-boot-log.txt): at boot, the host walks every plugin package that declares a client entry, reads each one's client bundle, and **concatenates them into ONE classic `<script>` combo** ("client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)"). The browser receives a single classic-script document, not per-plugin ES modules and not a `<script type="module">` tag.

A classic `<script>` is parsed and compiled as one unit before anything executes. The token `import` at top level of a classic script is a **compile-time (early) syntax error for the whole script**, not a runtime error local to one plugin. Because all 53 loader entries share that one script, one ESM `import` anywhere fails the compile of the entire combo — hence "the browser refused to load plugins AT ALL": the Settings → Plugins list is empty and even the two previously-working stock plugins (dsh-brand-version, dsh-file-trace) vanish. The browser error itself records this attribution precisely, if you know how to read it:

`failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry): client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`

### Why the error names `dsh-typert-registry` even though it is innocent

The loader awaits the roster's entries in order and reports the **first entry whose import failed** — `dsh-typert-registry` is simply entry 0 of the awaited sequence, a stock host package the user never touched. Because the failure is at script-compile time, NO module in the combo registered, so the first awaited entry is the one that "failed to import". The second clause of the same message (`client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`) already names the true culprit and the exact position — position 1:1 is the `import React` on line 1. This matches the skill's troubleshooting table entry for `Failed to load plugins: failed to import loader entry <id>` with zero plugins registered: "the named `<id>` is only the first awaited entry (e.g. `dsh-typert-registry`, innocent); some plugin's client bundle contains raw ESM (a top-level `import`), and one ESM token fails the WHOLE classic-<script> bundle combo at compile time." The same family — combo-wide client failure with an innocent first-awaited entry named — is carded as DSH-0.1.5-A1-20 (real-host verified) for the roster/combo-mismatch variant.

Secondary defects in the same bundle (worth flagging even though compile error masks them): it touches `document.body` and mounts a React portal at module top level instead of inside `apply`, and it does not register through `window.__ModuleLoader__` at all — so even if it parsed, it would never join the loader roster.

## 2. Diagnosis discipline and the required client-bundle format

### How the culprit should have been located from the misleading error

1. Read the whole error, not the first identifier: the `client-modules: bundle <path> compile error (position 1:1)` clause names the offending bundle and position directly. Any "failed to import loader entry X" followed by a different bundle path means X is merely the first awaited entry.
2. Cheap static check that flags the offending bundle without a browser round-trip: grep every installed plugin's client bundle for top-level ESM tokens — `^import `, `^export `, `^import(` at the start of a line / outside a factory function. In this fixture the very first line of client.js hits. A one-liner over the profile's node_modules client bundles (e.g. content-search for `^(import|export)\s` in each `lib/client.js`) identifies the culprit in seconds; a bare-ESM file also fails `node --check`-style classic-script parsing while a wrapped bundle passes.
3. If the error were less specific: bisect the patch layer's `insert` rows — remove the newly inserted row (here `dsh-profiles`), restart, confirm the stock plugins return, re-insert. The newest insert is the prior probability winner; stock entries the user never touched should be presumed innocent (per the skill's attribution discipline, verify with probes rather than version numbers).
4. Distinguish failure planes before touching plugins: whole-combo failure (zero plugins register) = compile/serving plane; per-plugin apply failure (only that plugin missing) = registration plane. Failure 1 is the former; failure 2 the latter.

### The packaging contract an external plugin's client bundle must satisfy

Per the working-plugin-excerpt.txt fixture and the troubleshooting table, the bundle must be a **classic-script-compatible module-registration wrapper**, never bare ESM:

- **What wraps the code**: the entire bundle is a single call `window.__ModuleLoader__.load({ id, factory })`, where `id` equals the package.json `name` (registration id must equal the package name — DSH-0.1.2-A1-26) and `factory` is a plain function returning the module's exports (with `module`/`exports` locals and the `Symbol.toStringTag: "Module"` marker).
- **How React is obtained**: NOT via top-level `import`. Inside the factory, dependencies are obtained through the injected CommonJS-style `require`: `let react_jsx_runtime = require("react/jsx-runtime")`, `require("@deepseek-ai/dsh-client-ui-primitives")`, etc. The loader resolves these names against the host-provided module table.
- **What the wrapper must export**: the Cordis client-plugin object — `function apply(ctx) { ... }` (plus optional `inject: ["slots", ...]` etc.) returned via `module.exports`. All DOM/portal/slot work moves inside `apply(ctx)`; nothing runs at module evaluation time.
- Toolchain consequence: author in ESM/TSX if desired, but ship a build artifact (bundler output) that emits the `__ModuleLoader__.load` wrapper; never point the `dsh.client` bundle entry at hand-written ESM source.

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

### What the error means and who declares slots

Slot trees are declared by their **owning host entries**: a parent entry's children table (its own registration/declaration of child slots) is the authority for whether a slot name exists. `settings.section` is a slot owned and declared by the settings host entry, not by `@lhh010/dsh-profiles`. After repackaging fixed the compile error, the plugin's second boot reached the registration plane — and its client code used a **bare** `ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' }, ProfilesSection)`. Plugin apply order across entries is undefined, so a bare registration can execute **before the owning settings entry has declared its children table** — the loader rejects the apply with the observed error, and only that one plugin fails while everything else loads normally (plugin-apply-error.txt).

### The exact wrapping form

Per the troubleshooting table entry for this exact message: wrap the registration so it runs only after the owner's declaration exists:

```js
function apply(ctx) {
  ctx.slots.inject('settings.section', () => {
    ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5 }, ProfilesSection)
  })
}
```

### Which fields the registrant may pass and which it must not

- **May pass**: `name`, `id`, `order` (and `label` where applicable).
- **Must NOT pass**: `kind` and `scope` — these are declaration-time properties owned by the declaring parent entry. A child registrant re-stating them both conflicts with the owner's declaration and signals the wrong mental model (the user's bundle passed `kind: 'section', scope: 'settings' `— exactly the disallowed pair).

Related cards: DSH-0.1.2-A1-25, DSH-0.1.2-A1-26.

## 4. Dev-loop discipline — boot-assembled combo and the EADDRINUSE restart

### Why edits do not appear without a host restart

The host assembles the client-bundle combo **once per boot** (host-boot-log.txt: "The combo line appears ONCE per boot"). At startup it reads every installed plugin's client bundle from disk, concatenates, and serves the resulting classic script. There is no file watcher and no per-request re-composition of the combo, so editing plugin files on disk afterwards changes nothing — not even after a browser hard refresh, because the refresh re-fetches the same boot-time combo artifact. The correct edit loop is: edit bundle on disk → fully stop the host process → start the host (combo re-composed at boot) → hard-refresh the browser → verify Settings → Plugins → Plugin list is non-empty (an empty list means the combo failed again — restart-notes.txt step 3). Note the client plane and host plane differ here: client-bundle content requires the host restart to re-enter the combo, while host-half routes/registrations apply at host start anyway.

### Why the Windows restart died with EADDRINUSE

Closing the launching terminal does not reliably terminate the node host process tree on Windows: an orphaned node process kept holding the listening port, so the next boot's `bind` failed with EADDRINUSE. Only killing the entire process tree freed the port — `taskkill /PID <pid> /T /F` — after which the next boot bound normally. This is the same Windows process-tree/file-handle family as the EBUSY trap (troubleshooting.md, S12): on Windows, "stop the host" means verifying the process tree is actually gone (check the port / process list), not closing a window. A safe restart procedure: find the listening PID (e.g. `Get-NetTCPConnection -LocalPort <port>`), `taskkill /PID <pid> /T /F`, confirm the port is free, then start `dsh web` and hard-refresh.

## 5. Prevention — host side and authoring side

### What the HOST could do

At combo-assembly time (startup):
- **Static pre-flight per bundle**: before concatenating, cheaply scan each candidate bundle for classic-script-incompatible tokens (top-level `import`/`export` outside a factory, or simply parse each bundle standalone in classic-script mode). On failure, either reject only that bundle with a loud, named error (`plugin <package> client bundle is bare ESM and cannot enter the combo`), or fail fast at boot naming the plugin — instead of serving a combo the browser will reject wholesale.
- **Deterministic error attribution**: when reporting `failed to import loader entry`, surface the already-known compile-error bundle path as the primary message (or attach the full per-bundle compile results), so the first-awaited entry is never the headline. The information already exists host-side (the message's second clause proves it); make it the first clause.
- At combo-failure time in the browser: report "combo failed to compile — N plugins registered 0 of M entries" as a distinct state from "entry X failed", and offer a host-side diagnostic endpoint listing per-bundle compile status, so attribution never depends on bisecting the patch layer.

### External-plugin authoring template / checklist

1. **Packaging**: build the client half with a bundler emitting `window.__ModuleLoader__.load({ id, factory })`; `id` equals package.json `name`; factory uses `require("react")` / `require("react/jsx-runtime")` / `require("@deepseek-ai/dsh-client-ui-primitives")` for dependencies; factory returns `{ apply, inject? }` via `module.exports`. No top-level `import`/`export` ever reaches `lib/client.js`. (Cite DSH-0.1.1-R1-03: the package must declare `dsh.client` to be scanned; DSH-0.1.2-A1-26: registration id must equal package name.)
2. **No top-level side effects**: all DOM creation, portals, and mounting happen inside `apply(ctx)`, never at module evaluation.
3. **Slot registration**: own slots are declared freely; slots owned by other entries (`settings.section`, `conversation.*`, …) are registered only via `ctx.slots.inject(name, () => ctx.slots.register(...))`, passing only `name`/`id`/`order`(`label`) — never `kind`/`scope`.
4. **Install**: link into the web profile's node_modules plus exactly one `insert` row with the bare package name in `cordis.patch.yml`; do not duplicate bundle-provided ids.
5. **Verification after each change**: fully stop the host (verify the process tree/port on Windows; `taskkill /T /F` if needed) → restart → browser hard refresh → Settings → Plugins list non-empty → then behavior checks. Empty plugin list = combo failure; re-run the bare-ESM grep before anything else.
6. **Pre-publish static gate**: run the top-level-ESM grep and a classic-script parse check over the shipped bundle in CI so the defect never reaches a profile.

---

## Skill-format report sections

- **pre-existing / baseline**: not collected (read-only incident analysis; no builds or suites run — the fixture is static evidence and must not be executed).
- **Completed**: full root-cause attribution for all three failures (combo compile failure with misleading first-awaited-entry naming; cross-entry slot declaration ordering; boot-assembled combo + Windows orphaned-process EADDRINUSE), diagnosis procedure, packaging and slot-registration contracts, prevention design (host + authoring), as above.
- **Skipped**: running the migration planner or verify-runtime scripts — inapplicable: there is no migration corridor task here and the fixture must not be executed; no touchpoint scan beyond the client/UI class (#5/#6) because the failures live entirely on the Web Client plane.
- **Pending/residual risk**: exact host-internal identifiers (loader entry ordering key, settings children-table owner id) are inferred from the evidence pack and skill references, not read from pinned host source; a host-side prevention design would need the target tag's loader source before implementation. EADDRINUSE reproduction is Windows-specific and was observed, not re-executed, here.
- **Rollback**: nothing to roll back — no file outside this report was written; the fixture directory is unchanged.
- **Recommendations**: adopt the authoring checklist as the external-plugin template (community-standard adjacent); propose the host-side per-bundle pre-flight and error-attribution changes as upstream follow-ups; add the "empty plugin list ⇒ grep for bare ESM first" step to onboarding docs.

## Sources

- Fixture evidence pack (all seven files) under the task's environment/fixture directory.
- plugin-upgrade skill: SKILL.md (Mode A discipline), references/troubleshooting.md (rows: `failed to import loader entry` + zero registrations; `slot ... is not declared`; EBUSY/process-tree family), references/pre-flight.md (touchpoint classes #5/#6), references/README.md (corridor index).
- Cards cited: DSH-0.1.1-R1-03, DSH-0.1.2-A1-25, DSH-0.1.2-A1-26, DSH-0.1.5-A1-20.
