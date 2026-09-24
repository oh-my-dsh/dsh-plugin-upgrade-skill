# S17 · External UI Plugin Onboarding Trap — Analysis Report

Task: `S17-external-ui-plugin-onboarding-trap` (read-only diagnosis). Skill: `plugin-upgrade`,
Mode A-style read-only inspection (the benchmark brief is the standing authorization; no writes
outside the designated output directory).

Evidence used:

- Fixture pack (read-only): `browser-error.txt`, `plugin/lib/client.js`, `profile/cordis.patch.yml`,
  `plugin-apply-error.txt`, `working-plugin-excerpt.txt`, `host-boot-log.txt`, `restart-notes.txt`.
- Skill card **DSH-0.1.5-A1-20** (real-host verified): one dropped/failed client-bundle module fails
  EVERY client plugin's registration; a host restart self-heals the roster/combo mismatch.
- Host source cross-check against the installed host tree
  (`@deepseek-ai/dsh-client-modules/lib/index.js`, `lib/client.js`, `lib/invariant.js`,
  `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`,
  `dsh-client-ui-cordis/lib/client.js`, `dsh-web-frontend/dist/assets`): all mechanisms below were
  verified against the shipped code, not inferred.

All quotes of host behavior below were verified in the installed packages; file/line references are
to the npm-global host install.

---

## 1. Failure 1 — why one bare-ESM bundle killed EVERY plugin, and why the error named `dsh-typert-registry`

### What the host actually assembles at boot

At boot, the host-side half of `@deepseek-ai/dsh-client-modules` scans every cordis Loader entry for
packages with a `dsh.client` declaration, reads each package's client bundle (resolved via
`exports["./client"]`), strips source-map/source-URL trailers, and **concatenates all bundles into
ONE classic (non-module) script** — the "client bundle combo" — served at
`/plugins/??<id1>/client.js,<id2>/client.js,...&rev=<hash>` (partitioned only when the generated URL
would exceed ~3 KB). The boot log in the fixture matches: *"composed 53 loader entries into client
bundle combo (4.5 MB, classic script)"*.

The browser-side contract (verified in `dsh-client-modules/lib/client.js`):

- The page first receives a tiny queue facade `window.__ModuleLoader__` in "queue" mode;
- Each plugin bundle's ONLY valid top-level statement is
  `window.__ModuleLoader__.load({ id, factory: (require) => {...} })` — script execution merely
  REGISTERS the factory; **all module-body side effects live inside the factory closure** and run at
  materialization (`factory(require) → module.exports`, memoized, recursive for dependencies);
- React and the shared client packages come from the shell's static seed modules
  (`require("react")`, `require("react/jsx-runtime")`, `require("react-dom")`,
  `require("@deepseek-ai/dsh-client-ui-primitives")`, …), resolved by the loader's `require`, never
  from ESM `import`.

### Root cause of failure 1

The user's `plugin/lib/client.js` is **bare ESM**: it begins with a top-level
`import React from 'react'` (fixture position 1:1). Inside a concatenated classic script there are
no module boundaries and no import/export grammar — `import` at top level is a **script-level
SyntaxError**, and because the combo is ONE script, the browser refuses to parse/execute the WHOLE
combo: no `window.__ModuleLoader__.load(...)` call from ANY plugin ever runs. Consequently:

- zero factories register → zero plugins materialize/apply → the Plugin list is EMPTY;
- even the untouched stock plugins (brand version, file trace) vanish, because their registrations
  lived in the same dead combo script.

This is exactly the whole-combo blast radius documented by skill card DSH-0.1.5-A1-20 ("one dropped
module fails every client plugin's registration"), with the cause moved from a stale roster to a
malformed bundle.

### Why the error names `@deepseek-ai/dsh-typert-registry`

The browser cordis Loader imports entries in graph order. When it awaits its FIRST loader entry —
`0c013085 (@deepseek-ai/dsh-typert-registry)`, a stock host package that happens to be first in the
import order — the underlying cause of failure is the combo's parse error, which the module system
attributes to the offending bytes: `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js
compile error (position 1:1)`. The outer message names the first AWAITED entry (the victim), the
inner cause names the real culprit. `dsh-typert-registry` is innocent; it is simply the first thing
the loader tried to import from a script that never executed. Misleading-error shape:
`failed to import <first-entry>: <cause naming real bundle>`.

---

## 2. Diagnosis discipline and the required client-bundle format

### How the culprit should have been located

1. **Read the inner cause, not the outer entry name.** The parenthetical
   `(bundle /plugins/@lhh010/dsh-profiles/lib/client.js ...)` already names the offending bytes.
   Rule: in DSH client-loader errors, the first awaited entry is the reporter, the bundle path in
   the `client-modules:` cause is the culprit.
2. **Bisect by composition, not by plugin code.** The only change was one `insert` row
   (`dsh-profiles` in `cordis.patch.yml`). Remove/re-add that single row (or the plugin directory
   link) and reboot: the combo fails exactly when that row is present — attribution complete without
   touching stock packages.
3. **Cheap static check that flags the bundle:** the build-time/runtime "bundle purity" contract —
   a valid client bundle is a classic script whose only top-level statement is the
   `window.__ModuleLoader__.load({ id, factory })` registration. Any scan below catches the offender
   in seconds, host-side, before the browser ever sees it:
   - regex the first non-comment token: it must be `window.__ModuleLoader__.load`;
   - grep for top-level `^import ` / `^export ` outside the factory closure (the offending file
     starts with `import React from 'react'` at 1:1 — the exact position the error reported);
   - or compile-check each bundle with `new Function(source)` (parse-only; no ESM grammar allowed).

### The client-bundle format an external plugin must ship

From `working-plugin-excerpt.txt` (corroborated by `dsh-client-modules/lib/client.js`, which is
itself shipped in exactly this shape):

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");            // shared React from the shell's seed modules
    // ... component definitions, side effects, portal creation — ALL inside the factory ...
    const inject = ["slots"];
    function apply(ctx) { /* ctx.slots.inject(...) */ }
    module.exports.apply = apply;
    module.exports.inject = inject;
    return module.exports;                    // the Cordis plugin object
  },
});
```

- **What wraps the code**: a single `window.__ModuleLoader__.load({ id, factory })` registration —
  a lazy CJS module. Nothing else may appear at top level.
- **How React is obtained**: `require("react")` / `require("react/jsx-runtime")` /
  `require("react-dom")` inside the factory; never a bundled or imported copy. Shared UI packages
  (`@deepseek-ai/dsh-client-ui-primitives`, etc.) come from the same `require` table.
- **What the wrapper must export**: the Cordis plugin object — an `apply(ctx)` function (required)
  and optionally `inject: string[]` for hard service dependencies. The user's `export function
  apply` was the right idea in the wrong grammar.
- **Side effects** (the user's `document.createElement`/`createPortal` at module top level) must
  move inside the factory (run at materialization) or, better, into `apply` behind the plugin's
  fiber so they are reversible.
- The package must also declare `dsh.client` in `package.json` (with `platform`, optional
  `inject`/`external`/`immediately`) and expose `exports["./client"]` pointing at this bundle —
  that is how the host's scan finds and composes it.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

### Who declares slots

Verified in the slot registry (`dsh-web-frontend/dist/assets`, `SlotCore` class): a slot exists only
when some entry has DECLARED it, and declaration happens through a **parent entry's registration
children table**: a registration may pass `children: { "settings.section": { kind: "list", scope: "root", ... } }`,
and only then do child records receive a spec (`declaredBy = an entry in "<parent>"`). `register()`
itself never declares: it throws exactly the fixture error when `records.get(name).spec` is absent.

`settings.section` is a **list slot, scope `root`**, declared by the settings shell entry
(`@deepseek-ai/dsh-client-ui-settings` — its contract doc states: *"One settings page per list entry.
Registrant options carry the nav identity: `id` (section key), `order` (nav position), `label`
(registrant-localized display text)"*).

### Why the bare registration failed at apply time

Two compounding mistakes in the user's `apply`:

1. **Declaration/registration conflation**: the user passed declaration-owned fields
   (`kind: 'section'`, `scope: 'settings'`) in a `register()` call, as if registering could declare
   the slot. `register()` ignores `kind`/`scope`; it requires the slot to already be declared.
2. **Ordering**: the external plugin's entry applied before the declaring settings-shell entry had
   registered its children table, so `settings.section` had no spec yet → apply-time throw. Because
   the combo now parsed, only THIS entry failed (`failed to apply loader entry (@lhh010/dsh-profiles)`)
   while every other plugin loaded normally — the correct, isolated blast radius.

### The exact wrapping form

The registration must be wrapped in `ctx.slots.inject(slotName, callback)` — the framework's
cross-entry ordering primitive (built on the registry's `subscribeDeclaration`). Verified usage
pattern in `dsh-client-ui-cordis/lib/client.js`:

```js
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      { name: "settings.section", id: "profiles-manager", order: 5, label: "DSH Profiles" },
      ProfilesSection,
    ),
  );
}
```

`ctx.slots.inject` runs the callback immediately when the slot is already declared, otherwise
defers it until the declaring parent's children table lands — removing the ordering hazard — and
ties the registration's disposal to the plugin's fiber.

### Fields a registrant may pass vs must not

- **May pass (registration fields)**: `name` (the declared slot name), `id` (list slots — required,
  and the nav/section key here), `order`, `label` (registrant-localized text; re-register on locale
  change), `priority`, `key` (keyed slots), `select` (chain slots), `inject` (hook props for the
  rendered entry), `locale`, `registrant`, plus the component as the second argument.
- **Must NOT pass (declaration-owned fields)**: `kind`, `scope`, and `children` — these belong to
  the declaring parent entry's children table. Passing `children` attempts to declare slots owned by
  another entry and throws `slot "..." is already declared (by ...)`; `kind`/`scope` are silently
  ignored at best and mislead the author at worst.

---

## 4. Dev-loop discipline — combo not rebuilt on file change, correct restart, and the Windows EADDRINUSE

### Why edits don't appear

The combo is assembled **once at host boot**: the node half reads each plugin's client bundle bytes
from disk, concatenates, content-hashes, and serves the result under an immutable-cache URL. Source
comments state it explicitly: *"Bundle content changes reach the graph only through
`ClientModuleRegistry.rebuilt`"* — i.e. the HMR pipeline (which requires a running watcher/rebuild
process; in a source checkout that is `pnpm run dev:web`). In a plain installed profile there is no
watcher, so editing `lib/client.js` on disk changes nothing in the browser, even after a hard
refresh: the browser re-fetches the same immutable combo URL/rev.

### Correct restart procedure

1. Fully STOP the host process (not just the terminal window — see below).
2. Start the host again; the boot scan re-reads bundle bytes and composes a new combo rev.
3. Hard-refresh the browser (immutable caching means a soft refresh can serve the stale combo).
4. Verify: Settings → Plugins → Plugin list is non-empty (empty list = the combo failed again);
   this matches the fixture's restart note 3 and the skill's validation layer 4 (prove registration,
   not HTTP 200).

### Why the Windows restart died with EADDRINUSE

Closing the launching terminal on Windows does not kill the detached node process tree: the old
host process survived and kept the listening socket bound. The next boot's `listen()` failed with
EADDRINUSE until the entire orphaned tree was force-killed
(`taskkill /PID <pid> /T /F` — /T kills the tree, /F forces), after which the port was freed and
the boot bound normally. Correct Windows discipline: stop the host by terminating its process tree
(by PID tree-kill or a managed job/stop command), confirm the port is released (e.g.
`Get-NetTCPConnection -LocalPort <port>`), then start the new host — never assume the terminal
window's death equals the process's death. (This aligns with the skill's global-upgrade rule that a
running host holds resources and must be fully stopped; a browser refresh is not a host stop.)

---

## 5. Prevention

### Host side (name the culprit, contain the blast radius)

1. **Startup purity gate on each bundle, before composition**: for every scanned client bundle, run
   the cheap static checks of §2 (top-level-token check + `new Function` parse) and reject/log with
   the offending package name and path — the existing `ClientPackageCompositionError` in
   `dsh-client-modules` already groups multi-package startup failures by actionable
   package/build errors; extending it to "bundle X is not a factory registration (starts with
   `import` at 1:1)" would have turned failure 1 into a one-line, correctly-attributed boot error.
2. **Combo-failure attribution in the browser**: when the loader's first awaited entry fails, report
   the failing combo CHUNK's entry list (and the inner bundle path) rather than only the first
   awaited entry, so the error names the culprit module set, not an innocent stock entry. Marking
   the failing chunk and continuing other partitioned chunks would keep one bad external bundle from
   killing stock plugins.
3. **Slot-contract diagnostics**: at register-time on an undeclared slot, include the nearest
   declared ancestors (e.g. "closest declared: `settings`") and a hint to use
   `ctx.slots.inject(name, ...)`; on a registration carrying declaration-owned fields
   (`kind`/`scope`/`children` it does not own), log a warning naming the owning declarer
   (`declaredBy` is already tracked).

### Authoring side — external UI plugin template / onboarding checklist

- **package.json**: `dsh.client` = `{ platform: "web", inject?: [...], external?: [...] }`;
  `exports["./client"]` → `./lib/client.js`; never a bare ESM entry.
- **Build**: bundle with tsdown/esbuild to the single-registration classic script (IIFE-style
  `window.__ModuleLoader__.load({ id, factory })`); assert the purity gate in CI
  (first token check + parse check + no top-level `import`/`export` outside the factory).
- **Factory body**: obtain React/shared UI via `require(...)`; keep ALL side effects (portals, DOM)
  inside the factory or `apply`; return `module.exports` exposing `apply` (+ `inject`).
- **Slots**: register into existing slots only, wrapped as
  `ctx.slots.inject("<slot>", () => ctx.slots.register({ name, id, order, label, ... }, Component))`;
  never pass `kind`/`scope`/`children` for a slot another entry owns; check the slot contract
  (`dsh-client-ui-settings .../slots.d.ts`) for which options a registrant carries.
- **Install**: link into the profile's `node_modules` + one `insert` row in `cordis.patch.yml`
  (what the user did correctly).
- **Dev loop**: edit → stop host (Windows: kill process tree, verify port free) → start host →
  hard refresh → check Settings → Plugins list non-empty; treat an empty plugin list as "combo
  failed — read the inner `client-modules:` cause, not the first named entry".

---

## Skill-structured summary

- **Pre-existing (baseline)**: not collected (read-only incident analysis; no repository build run).
- **Completed**: full attribution of all three failures with host-source-verified mechanisms
  (combo classic-script assembly and lazy-CJS loader contract; children-table slot declaration and
  `ctx.slots.inject`; boot-once combo assembly and Windows process-tree port hold); diagnosis,
  packaging, registration-wrapper, restart, and prevention guidance.
- **Skipped**: no migrations/installs executed (outside read-only scope); no fixture execution.
- **Pending/residual risk**: the exact strings "compile error (position 1:1)" and "failed to import
  loader entry" were matched against the installed host build's shipped code only at mechanism
  level (the fixture is a static synthetic pack); the analysis holds for the documented corridor
  (DSH-0.1.5-A1-20 card) and the installed host's `dsh-client-modules` implementation.
- **Rollback**: none required — read-only analysis; nothing outside the report directory was written.
- **Recommendations**: host-side purity gate + per-chunk failure attribution (§5); ship an official
  external-client-plugin template reproducing the checklist above.
