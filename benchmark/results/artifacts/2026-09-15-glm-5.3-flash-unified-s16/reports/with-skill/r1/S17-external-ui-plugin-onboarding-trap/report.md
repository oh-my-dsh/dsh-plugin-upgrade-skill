# S17 · The External UI Plugin Onboarding Trap — Diagnosis Report

Scope: read-only analysis of the evidence pack under `fixture/` (unchanged), cross-checked
against the `skills/plugin-upgrade` reference material in this workspace. No migrations or
installs were executed. All findings below are grounded in the fixture files and the skill's
cards/rows cited inline.

Incident summary — a hand-written external web UI plugin (`@lhh010/dsh-profiles`) installed
the community way (plugin directory linked into the web profile's `node_modules`, one
`insert` row in the profile's `cordis.patch.yml`) produced three chained failures:

1. First boot: the browser refused to load **any** plugin, with an error naming
   `@deepseek-ai/dsh-typert-registry` (stock entry, untouched by the user). Plugin list: empty.
2. After repackaging: a new, different apply-time error about a slot named `settings.section`.
3. Throughout: every plugin edit required a full host restart, and one Windows restart died
   with `EADDRINUSE` until the old process tree was force-killed.

---

## 1. Failure 1 — one plugin's ESM bundle took down EVERY plugin's registration

### What the host assembles and in what form it reaches the browser

Per `fixture/host-boot-log.txt`:

```
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
```

At boot the host reads **every installed plugin's client bundle** (`lib/client.js` per
package, enumerated by the `dsh.client` manifest declaration — DSH-0.1.1-R1-03) and
**concatenates them into one combined script** — the "bundle combo". It is served to the
browser through a single combo route (the `/plugins/??<pkg>/client.js&…&rev=…` form per
DSH-0.1.2-A1-26's verification recipe) and executed by the browser as **one classic
`<script>`** (no `type="module"`). The boot roster (`window.__DSH_BOOT__.entries`) lists the
expected entry ids; each entry inside the combo is expected to self-register by calling
`window.__ModuleLoader__.load({ id, factory })`.

### Why ONE bad bundle killed all 53 entries

Because the combo is a **single classic script**, it is compiled by the browser as one parse
unit. The user's `fixture/plugin/lib/client.js` begins with:

```js
import React from 'react'
import { createPortal } from 'react-dom'
```

A top-level `import` is an **ESM-only token**. In a classic script the whole file fails at
**compile time** — the browser never executes a single line of the 4.5 MB combo. Parse
failure is all-or-nothing: there is no per-plugin isolation in one script, so zero of the 53
entries ever get to call `__ModuleLoader__.load`, and **every** plugin disappears from
Settings → Plugins (including the two stock plugins that worked before the insert). This is
the same blast radius recorded in DSH-0.1.5-A1-20 ("one dropped module fails every client
plugin's registration") and in `references/troubleshooting.md` row 13.

### Why the error named `dsh-typert-registry`, which is innocent

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

The loader processes the roster **in order and awaits each entry**; `dsh-typert-registry`
(entry `0c013085`) is simply the **first awaited entry** of the combo that failed to compile
(`references/troubleshooting.md` row 13: "the named `<id>` is only the first awaited entry…
innocent"; DSH-0.1.5-A1-20: "the first unregistered entry is named (an innocent one)"). The
entry id is a bystander. Two details in the same message actually identify the real culprit:

- the inner clause names the offending **artifact path**:
  `/plugins/@lhh010/dsh-profiles/lib/client.js`;
- `position 1:1` = line 1, column 1 — exactly where `import React from 'react'` sits in the
  user's bundle.

So the attribution error is a reporting defect: the host surfaces the first awaited *entry id*
instead of the *package that owns the failed bundle*, even though it already knows the path.

---

## 2. Diagnosis discipline — locating the culprit and the required bundle format

### How the culprit should have been located from the misleading error

1. **Read the whole error before touching the named entry.** The named id (`dsh-typert-registry`)
   is stock and untouched (fixture says so explicitly); a stock entry that "everyone else"
   depends on being the first failure of a whole-combo outage is the signature of
   misattribution. The inner clause already names
   `/plugins/@lhh010/dsh-profiles/lib/client.js` — map that artifact path back to its
   package id (`@lhh010/dsh-profiles`) and you have the culprit with zero code changes.
2. **If the message had not named the path: bisect the patch layer's `insert` rows**
   (`fixture/profile/cordis.patch.yml` has exactly three: `dsh-brand-version`,
   `dsh-file-trace`, `dsh-profiles`). Comment out the newest insert row, restart, hard
   refresh; if plugins come back, that row is the culprit (troubleshooting row 13:
   "Bisect the patch layer's `insert` rows to find the culprit"). Bisect the *composition*
   (the insert rows), not the innocent stock entries.
3. **Cheap static check that flags the offending bundle**: parse each installed plugin's
   `lib/client.js` as a **classic script** — `node --check lib/client.js` (the exact gate
   used in example 06 for vanilla-lib plugins). A file containing top-level ESM
   (`import`/`export`) fails the classic-script parse immediately, while every correctly
   packaged bundle (a plain `window.__ModuleLoader__.load(...)` call) parses fine. Equivalently:
   `rg -n "^import |^export "` over the installed bundles (pre-flight #5 already greps
   `__ModuleLoader__|PLUGIN_ID` in this surface). This check pins the culprit in seconds,
   offline, before any boot.

### The client-bundle format an external plugin must ship instead of bare ESM

The contract (from `fixture/working-plugin-excerpt.txt`, the WORKING plugin's shell, and
troubleshooting row 13):

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",              // == package.json "name" (DSH-0.1.2-A1-26)
  factory: (require) => {                   // everything runs INSIDE the factory
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react_jsx_runtime = require("react/jsx-runtime");   // React comes from the host…
    let ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives"); // …via require

    /* component definitions (side effects go here or into apply, not module top level) */

    const inject = ["slots"];               // services this entry consumes
    function apply(ctx) { /* ctx.slots.inject(...) / registration */ }
    return module.exports;                  // wrapper must export { name, apply }
  },
});
```

Key properties, each contrasted with the user's file:

- **What wraps the code**: a classic-script IIFE-like registration call
  `window.__ModuleLoader__.load({ id, factory })`. All code lives inside the
  `factory: (require) => …` closure; there must be **no top-level ESM `import`/`export`**
  anywhere in the artifact, because the combo is concatenated and parsed as one classic script.
- **How React is obtained**: via the loader's `require("react")` /
  `require("react/jsx-runtime")` **inside the factory** — the host supplies the single React
  instance. The user's file instead did `import React from 'react'` (bare ESM, and would
  anyhow have created a second React or an unresolvable bare specifier). The working plugin's
  shell shows the exact pattern: `let react_jsx_runtime = require("react/jsx-runtime")`.
- **What the wrapper must export**: the factory returns `module.exports`, and the module's
  export shape is the registration pair **`{ name, apply }`** (whale-girl field note,
  DSH-0.1.1-R1-01: "the client entry changed from 'page script' to `{name, apply}`
  registration"), with `apply(ctx)` performing registration and `const inject = [...]`
  declaring consumed services. Registration ids must equal the package.json `name` — the
  boot manifest, combo URL, and `__ModuleLoader__.load` id are keyed by package name
  (DSH-0.1.2-A1-26); mismatch produces `loaded without registering "<id>"` or silent absence.
- Additionally, the user's bundle ran DOM side effects at module top level
  (`document.createElement`/`document.body.appendChild`/`createPortal` before any `apply`).
  In the correct form those belong inside the factory/`apply`, so nothing executes at combo
  parse time and failures are attributable to the entry.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

After the repackage the bundle parsed and the combo loaded (all other plugins render again —
`fixture/plugin-apply-error.txt`), but at **apply time** the new plugin's registration failed:

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared
(a parent entry's children table must declare it)
```

- **Who declares slots**: the entry that **owns** the slot — the parent (host/settings) entry
  declares `settings.section` in its children table. A slot name owned by another entry is
  not free for a foreign entrant to create.
- **Why a bare registration of another entry's slot fails at apply time**: the plugin used a
  bare `ctx.slots.register({ name: 'settings.section', … }, ProfilesSection)` (visible in
  `fixture/plugin/lib/client.js` lines 23–28). Apply order across loader entries is
  **undefined**, so a foreign registration can land **before the owner's declaration exists**;
  the framework fails closed rather than inventing an undeclared slot
  (troubleshooting row 14; cards DSH-0.1.2-A1-25 / A1-26).
- **The exact wrapping form required**:

  ```js
  function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register(
      { name: 'settings.section', id: 'profiles-manager', order: 5 },
      ProfilesSection,
    ))
  }
  ```

  `ctx.slots.inject(name, () => ctx.slots.register(...))` defers the registration to the
  slot's injection point, i.e. only once the parent's declaration exists (same pattern as
  example 06: `ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(...))`).
- **Field whitelist**: the registrant may pass only **`name`, `id`, `order`** (and `label`
  where applicable). It must **not** pass **`kind`** or **`scope`** — those are
  declaration-time properties owned by the parent entry's children table
  (troubleshooting row 14: "the registrant passes only `name`/`id`/`order`(`label`), never
  `kind`/`scope`"). The user's registration passed both `kind: 'section'` and
  `scope: 'settings'` — both foreign-owned fields must be dropped.

---

## 4. Dev-loop discipline — boot-time combo assembly and the Windows restart trap

### Why plugin edits do nothing until a host restart

At boot the host resolves the cordis patch layer's insert rows and **composes the client
bundle combo exactly once** (`fixture/host-boot-log.txt`: "composed 53 loader entries into
client bundle combo (4.5 MB, classic script)"; `fixture/restart-notes.txt` item 1: combo
assembly happens ONCE at host boot; editing a plugin file on disk afterwards has NO effect,
even after a hard refresh). The browser's hard refresh only re-downloads the same
boot-composed artifact — it cannot pick up a new file. Hence the correct dev loop is:

1. edit the plugin file → 2. **fully stop the host process** (a browser refresh is not a host
stop) → 3. start the host again → 4. browser hard refresh → 5. check Settings → Plugins →
Plugin list (empty list = the combo failed again; `fixture/restart-notes.txt` item 3).

(For completeness: the general hygiene rule says a client-half change "takes effect on a
browser hard refresh" (`references/migration-hygiene.md` item 3) — that holds where the combo
route re-reads artifacts; in the host observed here the combo is boot-composed, so the
restart step is mandatory. Record both and trust the observed behavior of the running host.)

### Why the Windows restart died with EADDRINUSE until the process tree was force-killed

On Windows, **closing the launching terminal does not terminate the host's node process** —
it is orphaned and keeps running, still holding the listening port
(`fixture/restart-notes.txt` item 2). The next boot then fails with `EADDRINUSE` because the
port is still bound by the previous host's process. Closing the window is not a host stop:
the host must be stopped explicitly, and because the launcher leaves a whole process tree,
stopping only the top process can still leave children alive — the reliable stop is a tree
kill:

```
taskkill /PID <pid> /T /F
```

After the tree dies the port is released and the next boot binds normally. The same
"running process holds resources" family is documented for file locks in troubleshooting
row 19 (EBUSY: the running host holds native-module handles; stop the host before file
replacement).

---

## 5. Prevention

### What the HOST could do to name the offending plugin

- **Pre-parse each candidate bundle at combo assembly time.** Before concatenating, compile
  each `lib/client.js` as a classic script (parse check). On failure, exclude only that
  module from the combo, keep the other 52 entries working, and record the entry as failed
  with its **package id** in `window.__DSH_BOOT__.entries` / the Settings plugin list —
  converting a whole-combo outage into one degraded plugin.
- **Attribute at combo-failure time instead of naming the first awaited entry.** The error
  already carries the culprit artifact path
  (`bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`); the
  host should parse the inner compile error, map the artifact path back to the owning package
  (`/plugins/<name>/lib/client.js` → `<name>`), and report "plugin `@lhh010/dsh-profiles`'s
  client bundle is not classic-script compatible (ESM token at 1:1)" — never the innocent
  first-awaited entry id.
- **Per-entry isolation at import time.** Wrap each loader entry's import/apply in its own
  boundary so one entry's compile/apply exception is attributed and contained (the
  DSH-0.1.5-A1-20 lesson generalized: one bad module must not fail every client plugin's
  registration).
- **Fail at install/enable time.** `dsh plugin add` / enablement could run the same static
  classic-script parse and reject (or warn on) a bundle containing top-level ESM, and verify
  the `__ModuleLoader__.load` id equals the package name (DSH-0.1.2-A1-26) before the plugin
  ever enters a boot roster.

### External-plugin authoring template / checklist (so none of the three failures repeats)

**Packaging (prevents Failure 1):**

- [ ] Ship `lib/client.js` as a classic script wrapped in
      `window.__ModuleLoader__.load({ id, factory })`; **no top-level `import`/`export`**;
      all code (including DOM side effects) inside the factory or `apply`.
- [ ] `id` of `__ModuleLoader__.load` == package.json `name` (bare, scoped name) —
      DSH-0.1.2-A1-26's three-id rule (registration id == insert row `name` == package name).
- [ ] React (and all host packages) via `require("react")` / `require("react/jsx-runtime")`
      **inside the factory** — never bundled, never bare-ESM imported.
- [ ] Wrapper exports the `{ name, apply }` pair via `module.exports`; declare consumed
      services in `const inject = [...]`.
- [ ] Pre-boot gate: `node --check lib/client.js` (classic-script parse; catches ESM tokens),
      plus grep for `__ModuleLoader__.load({ id: "<package name>"` in the artifact.

**Slot registration (prevents Failure 2):**

- [ ] Registering into another entry's slot (`settings.section`, `conversation.*`, …) always
      uses the wrapper `ctx.slots.inject('<slot>', () => ctx.slots.register(...))` — never a
      bare `ctx.slots.register` for a parent-declared slot.
- [ ] Registrant fields: only `name`, `id`, `order` (`label` allowed); never `kind`/`scope`.
- [ ] Optionally wrap `apply` in a compatibility self-check (probe `ctx.slots.inject` etc.;
      render a remediation banner instead of throwing — example 06 practice).

**Dev loop (prevents Failure 3 pain):**

- [ ] Assume combo assembly is boot-time: every client-bundle iteration = full host stop →
      start → browser hard refresh → check the plugin list; never judge a change by a
      refresh alone.
- [ ] Stop the host explicitly; on Windows verify the process is gone (or free the port with
      `taskkill /PID <pid> /T /F` for the whole tree) before restarting — closing the
      terminal is not a stop and orphans the port (EADDRINUSE).
- [ ] When the browser names an entry after a new insert: read the full error, then bisect
      the patch layer's `insert` rows — do not debug the (innocent) named stock entry.

---

## Evidence and reference index

- Fixture: `browser-error.txt` (misattributed entry id, empty plugin list),
  `plugin/lib/client.js` (top-level ESM imports; bare `ctx.slots.register` with
  `kind`/`scope`), `profile/cordis.patch.yml` (three insert rows — bisect surface),
  `plugin-apply-error.txt` (undeclared-slot apply error), `working-plugin-excerpt.txt`
  (correct `__ModuleLoader__.load` shell), `host-boot-log.txt` (boot-time combo, "classic
  script"), `restart-notes.txt` (boot-once dev loop, EADDRINUSE tree-kill).
- Skill: `references/troubleshooting.md` rows 13–14 (misattributed combo failure; slot
  declaration/wrapper/field rules), `references/v0.1.2-alpha.1.md` DSH-0.1.2-A1-25/-A1-26
  (inject contract; package-name id equality and combo route), `references/v0.1.5-alpha.1.md`
  DSH-0.1.5-A1-20 (one dropped module fails every client plugin; first-entry
  misattribution), `references/v0.1.1-rc.1.md` R1-01/R1-03 (`{name, apply}` registration;
  `dsh.client` enumeration), `examples/06-real-world-batch-migration.en.md` (`ctx.slots.inject`
  wrapper; `node --check lib/client.js` gate), `references/pre-flight.md` #5
  (`__ModuleLoader__|PLUGIN_ID` scan), `references/migration-hygiene.md` item 3
  (plane/effect discipline), `examples/legacy-plugin/` (static fixture, never executed).
