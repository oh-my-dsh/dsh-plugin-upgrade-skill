# S17 · External UI Plugin Onboarding Trap — Analysis Report

Task: attribute a whole-combo client-bundle failure to the real culprit, explain the external
client-bundle packaging contract, the cross-entry slot declaration model and its registration
wrapper, the boot-assembled dev loop and its Windows restart discipline, and convert the
incident into host-side and authoring-side prevention.

Evidence: static fixture under `environment/fixture/` (browser-error.txt, plugin-apply-error.txt,
host-boot-log.txt, restart-notes.txt, working-plugin-excerpt.txt, plugin/lib/client.js,
profile/cordis.patch.yml), cross-checked against the shipped DSH runtime
(`@deepseek-ai/dsh-client-modules` node/browser halves, `dsh-client-ui-renderer` SlotRegistry /
`dsh-client-ui-slots` SlotCore, `dsh-client-ui-settings(-general)` bundles).

---

## 1. Failure 1 — why one plugin's bundle took down EVERY plugin

**What the host assembles.** At boot, `dsh-client-modules` (the `clientModules` service) scans every
loaded cordis Loader entry for packages whose `package.json` declares `dsh.client.platform = "web"`
and an `exports["./client"]` bundle. It reads each entry's client-bundle **bytes** and composes them
into ONE combo artifact: `/plugins/??<id1>/client.js,<id2>/client.js,…&rev=<hash>`, served as a single
**classic script** (the boot log's "composed 53 loader entries into client bundle combo (4.5 MB,
classic script)"). Each constituent bundle is expected to be nothing but a factory *registration*:

```js
window.__ModuleLoader__.load({ id: "<pkg name>", factory: (require) => { …; return module.exports; } });
```

Executing the combo script only *registers* factories with the `__ModuleLoader__` facade; the vendored
cordis Loader later materializes entries (`EntryTree.import → internal.import`) by looking up the
registered factory for each entry id.

**Why everything died.** The user's `@lhh010/dsh-profiles/lib/client.js` begins with a top-level ESM
`import React from 'react'`. ESM import/export statements are a **syntax error in a classic script**,
and because all 53 bundles are concatenated into one script, a single SyntaxError aborts parsing of
the entire combo: **zero** `__ModuleLoader__.load` calls execute, so no factory for any entry —
stock or external — is registered. Consequences seen in the evidence: the plugin list is empty, and
even the two stock plugins (brand version, file tracking) that rendered before the insert disappear.

**Why the error named `@deepseek-ai/dsh-typert-registry`.** The Loader imports entries in graph
order and awaits them; the first entry it happened to await was `dsh-typert-registry` (entry id
`0c013085`). Its import failed because *its factory never registered* — the loader's error wrapper
names **the entry it was importing**, not the bundle that broke the script. `dsh-typert-registry` is
completely innocent stock code the user never touched. The actual culprit is named only in the inner
detail: `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — position
1:1 is precisely the top-level `import` token.

## 2. Diagnosis discipline and the required client-bundle format

**Locating the culprit from the misleading error.**

1. Read the error **inside-out**: the outer "failed to import loader entry … (@deepseek-ai/dsh-typert-registry)"
   names the first *awaited* entry, not the offender; the inner `client-modules: bundle <path> compile error (position)`
   names the exact bundle file and position. The bundle path is the diagnosis; the entry id is noise.
2. Bisect by composition: remove one `insert` row from the profile's `cordis.patch.yml` (or unlink one
   plugin from the profile's `node_modules`), restart, hard-refresh, and check
   Settings → Plugins → Plugin list (empty list = combo still failing). The newest external insert is
   the prime suspect — stock entries have booted successfully before.
3. Cheap static check that flags the offending bundle without a browser: every shipped client bundle
   must be a classic-script-safe registration. Scan each entry's client bundle for top-level ESM
   tokens — a line starting with `import ` / `export ` (import expressions `import(` and strings are fine),
   or `import.meta` — or equivalently parse the source with a classic-script goal
   (`new Function(source)` / `node --check` in CJS goal). A bundle whose first non-comment token is not
   `window.__ModuleLoader__.load(` is malformed by construction.

**The packaging contract an external plugin must ship** (mirrored by `working-plugin-excerpt.txt` and every
shipped `lib/client.js`):

- The whole file is ONE call: `window.__ModuleLoader__.load({ id, factory })`, where `id` is the package
  name and `factory` is `(require) => { …; return module.exports; }`.
- Inside the factory, emulate CommonJS: `var module = { exports: {} }; var exports = module.exports;`,
  obtain dependencies synchronously through the injected **`require`**: `const React = require("react")`,
  `require("react/jsx-runtime")`, `require("@deepseek-ai/dsh-client-ui-primitives")`, … The module table
  resolves platform seed words and other packages' client halves; packages your bundle requires
  dynamically must be declared in `package.json` `dsh.client.external` so the boot graph orders them
  ahead of you (and they must not be you).
- The wrapper must **export the plugin via `module.exports`**: at minimum an `apply(ctx)` function, plus
  `inject: ['slots', …]` when it consumes services. `export function apply` never reaches the Loader —
  classic scripts have no module exports.
- All side effects — DOM creation, portals, CSS injection — live inside the factory / `apply`, never at
  script top level (the user's `document.createElement`/`createPortal` at top level would have run at
  registration time even if it had parsed).

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

**Who declares slots.** In the client slot system (`SlotCore`/`SlotRegistry`), a slot exists only while
some **parent entry's registration declares it** via a `children` table. The settings shell entry
(`dsh-client-ui-settings-general`) registers into the `sidebar.settings` seat and, in the same
`register()` options, carries:

```js
ctx.slots.inject("sidebar.settings", () => ctx.slots.register({
  name: "sidebar.settings",
  children: {
    "settings.section": { kind: "list", scope: "root" },
    "settings.onboarding": { kind: "list", scope: "root" },
    /* … */
  },
}, SettingsRoot));
```

That `children` entry *creates* the `settings.section` record (spec + `declaredBy`), and unloading the
declaring entry destroys it. Slot types are typed in `@deepseek-ai/dsh-client-ui-settings`'s SlotMap
(the settings domain base), but runtime declaration belongs to the shell entry.

**Why the bare registration failed at apply time.** `SlotCore.register` looks up
`records.get(name).spec` and throws exactly this error when no live declaration exists. Cross-entry
ordering is not guaranteed: the new external entry applied before/independently of the declaring
shell entry's registration (external entries land in the application combo in graph order, and the
declaration is an effect of *another* fiber's apply). The user's
`ctx.slots.register({ name: 'settings.section', … }, ProfilesSection)` therefore ran against an
undeclared slot and the Loader reported `failed to apply loader entry (@lhh010/dsh-profiles)` — a
per-entry failure this time; every other plugin loaded and rendered fine.

**The exact wrapping form required:** register through the declaration-aware wrapper

```js
ctx.slots.inject("settings.section", () => ctx.slots.register({
  name: "settings.section",
  id: "profiles-manager",
  order: 5,
  label: () => t("profiles.nav"),   // localized nav label
  locale: NS,                        // locale namespace, re-registers on locale change
}, ProfilesSection));
```

`ctx.slots.inject(key, callback)` installs an effect per *declaration epoch*: it runs the callback
synchronously when the slot is already declared, otherwise it waits and runs inside the declaring
`register()` after the children table commits; on collapse/undeclaration it disposes the contribution
and re-arms. The controller belongs to the caller's fiber, so plugin unload cancels the wait and
removes the contribution — this is exactly what the "working" excerpt's
`const inject = ["slots"]; function apply(ctx) { /* ctx.slots.inject(...) */ }` shell does.

**Fields a registrant may pass:** `name` (required, the slot key); per slot kind `id` (list slots,
required), `key` (keyed), `select` (chain); plus `order`, `label`, `priority`, `locale`, `inject`
(per-entry injected services), `children` (to declare *its own* child slots), `store`, `registrant`.
**Fields it must not pass:** `kind`, `scope`, and any `owner`-contract data — those belong to the
declaring parent's children-table spec, and the registry simply drops them from options. The user's
`kind: 'section'` and `scope: 'settings'` were foreign (and not even valid spec values: the declared
spec is `{ kind: 'list', scope: 'root' }`); they signal the author mistook the registration options
for the declaration site. The user also omitted the required `label` (the shell renders registrant
labels as nav rows) and never declared `inject: ['slots']` on the returned plugin, which the client
runner requires before `ctx.slots` is exposed.

## 4. Dev-loop discipline — why no rebuild, and the EADDRINUSE restart

**Why edits do nothing.** `ClientModuleRegistry` composes the combo **once at host boot** from the bundle
bytes read at activation ("the combo line appears ONCE per boot"). Bundle content changes reach the
served graph only through `ClientModuleRegistry.rebuilt(id)` — the registration hook of the client-HMR
node half, which is installed only when the dev watcher (`pnpm run dev:web` from the DSH checkout) is
rebuilding those bundles. An externally linked plugin has no watcher, and plain profile packages are not
rebuilt on file change; the served combo URL is revision-keyed and immutable-cached. So editing
`plugin/lib/client.js` on disk changes nothing in the browser — even after a hard refresh — until the
host process is stopped and started again.

**Correct restart procedure:**

1. Stop the host through its own shutdown path (or ensure the whole process tree is dead — see below).
2. Fix/rebuild the plugin's client bundle on disk.
3. Start the host again (watch the boot log for the fresh "composed N loader entries into client
   bundle combo" line).
4. Hard-refresh the browser (the old combo URL is immutable-cached; the new boot manifest carries a new rev).
5. Verify Settings → Plugins → Plugin list — an empty list means the combo failed again (check the
   console error, read the inner bundle path).

**Why the Windows restart died with EADDRINUSE.** Closing the launching terminal kills the shell
process but not the node process *tree* it spawned: the host (and its nested node children) kept
running and kept the listening socket bound. The next host boot could not bind and failed with
EADDRINUSE until the orphaned tree was force-killed with `taskkill /PID <pid> /T /F` (`/T` = tree,
`/F` = force); after that, the next boot bound normally. The discipline: never assume closing the
terminal stopped the host; terminate the tree (or use the host's supported stop path) and confirm the
port is free before restarting.

## 5. Prevention

**Host-side (startup / combo-failure attribution):**

- **Validate per-bundle at compose time.** `buildCombo` already holds each record's source bytes; parse
  each constituent with a classic-script goal (or check the `window.__ModuleLoader__.load(` prologue and
  scan for top-level `import`/`export` tokens) before concatenating. A failure should aggregate into the
  existing `ClientPackageCompositionError` naming **package, client path, and position** — the same
  shape already used for missing bundles — so boot fails loud with the real culprit instead of serving a
  poisoned combo.
- **Attribute at failure time.** When an entry import fails after a combo arrived, the loader knows which
  bundle URLs loaded and which entry ids never registered; wrap the error with that set ("combo X loaded
  but entries a, b, c never registered — first missing factory: <id>") rather than only the first awaited
  entry, so a stock entry name never masks an external bundle's syntax error.
- **Serve the check cheaply.** A `verify-client-bundle-format` static gate (mirroring the build-time
  "bundle purity" the runtime message already references) would have rejected the plugin at install time.

**Authoring-side template / checklist for the next external UI plugin:**

1. **package.json**: `dsh.client: { platform: "web", inject: ["slots"], external: [<dynamically required package names>] }`;
   `exports["./client"]` pointing at the bundle; install = link into the profile's `node_modules` + one
   `insert` row in `cordis.patch.yml`.
2. **client bundle**: exactly one `window.__ModuleLoader__.load({ id, factory })` call; CJS-style
   `module`/`exports` inside the factory; React via `require("react")` / `require("react/jsx-runtime")`;
   no top-level ESM, no top-level DOM/portal side effects; `module.exports` carries
   `{ inject, apply(ctx) }`.
3. **Slot registration**: never bare `ctx.slots.register` into another entry's slot — wrap with
   `ctx.slots.inject("<slot>", () => ctx.slots.register({ name, id, order, label, locale }, Component))`;
   pass only registrant fields (`name`/`id`/`order`/`label`/`locale`/`priority`…); never `kind`/`scope`;
   route visible copy through the locale seat (`label`, `t`), never hardcoded strings.
4. **Dev loop**: host restart (whole process tree stopped — `taskkill /T /F` on Windows if orphaned) +
   browser hard refresh after every plugin edit; check the boot log's combo line and
   Settings → Plugins → Plugin list after each boot.
5. **Diagnosis reflex**: read console errors innermost-first; the bundle path inside a
   `client-modules: …` message is the culprit; the outer "loader entry" name usually is not.

---

### Summary of the three failures

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | Every plugin fails to load; error names stock `dsh-typert-registry` | One external client bundle with top-level ESM `import` broke the single classic-script combo for all 53 entries; the error names the first awaited entry, not the broken bundle | Ship the bundle as a `window.__ModuleLoader__.load({id, factory})` classic-script registration with `require`-based React and `module.exports`-style plugin export |
| 2 | `failed to apply loader entry (@lhh010/dsh-profiles)`: slot `settings.section` not declared | `settings.section` is declared at runtime by the settings shell entry's `children` table; a bare `ctx.slots.register` from a foreign entry ran against no live declaration (and passed declaration-owned `kind`/`scope` fields) | Wrap in `ctx.slots.inject("settings.section", () => ctx.slots.register({ name, id, order, label, locale }, Component))`; declare `inject: ["slots"]` |
| 3 | Edits invisible; restart died with EADDRINUSE | Combo is assembled once at host boot from bundle bytes (rebuild only via the HMR `rebuilt()` hook, absent for external plugins); closing the terminal on Windows orphaned the node tree holding the port | Restart the host (kill the whole process tree: `taskkill /PID <pid> /T /F`) + hard refresh; verify via the boot combo line and the Plugin list |
