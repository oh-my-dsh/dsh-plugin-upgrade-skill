# S17 · External UI Plugin Onboarding Trap — Analysis Report

Task: S17-external-ui-plugin-onboarding-trap (read-only incident analysis)
Fixture inspected at E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S17-external-ui-plugin-onboarding-trap\environment\fixture (unchanged).

## Incident summary

A user hand-wrote an external web UI plugin (`@lhh010/dsh-profiles`) and installed it the
community way: plugin directory linked into the web profile's `node_modules` plus three
`insert` rows in `profile/cordis.patch.yml` (`dsh-brand-version`, `dsh-file-trace`,
`dsh-profiles`). The plugin's `lib/client.js` was written as a bare top-level-ESM module.
This produced a chain of three failures:

1. First boot: the browser refused to load ALL plugins, with an error naming
   `@deepseek-ai/dsh-typert-registry` — a stock entry the user never touched.
2. Second boot (after repackaging): an apply-time error about a slot named
   `settings.section` not being declared.
3. Dev loop: every plugin edit required a host restart, and one Windows restart died with
   EADDRINUSE until the orphaned process tree was force-killed.

---

## 1. Failure 1 root cause: one bad bundle took down every plugin's registration

### What the host assembles and how it reaches the browser

The host boot log states the mechanism directly:

    [boot] cordis patch layer: 3 insert rows resolved (dsh-brand-version, dsh-file-trace, dsh-profiles)
    [boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)

At boot the host's client-modules stage reads **every installed plugin's client bundle**,
wraps each one as a *loader entry*, and **concatenates all of them into one combo served as
a single classic `<script>`** (4.5 MB in this boot). The combo is a classic script, not a
module — that is the whole basis of the packaging contract (see §2). Each entry is wrapped
in `window.__ModuleLoader__.load({ id, factory: (require) => {...} })` (visible in
`working-plugin-excerpt.txt`), so all plugins execute in order inside one script context
under a shared `__ModuleLoader__` registry, and registration happens as each entry's
factory runs and its `apply(ctx)` is invoked.

### Why one top-level `import` killed everything

The new plugin's `lib/client.js` begins with:

    import React from 'react'
    import { createPortal } from 'react-dom'

Because the combo is executed as ONE **classic script**, the browser parses the whole
concatenated file before executing any of it. `import` (and `export`) are module-only
syntax; in a classic script they are a **parse-time SyntaxError for the entire combo**, not
a runtime error scoped to one entry. The whole 4.5 MB script fails to compile, so
**zero** loader entries register — which is exactly the observed symptom: Settings →
Plugins → Plugin list EMPTY, and the two previously-working stock plugins (brand version,
file trace) vanished too. The failure mode is all-or-nothing because parsing is
all-or-nothing.

### Why the error named `@deepseek-ai/dsh-typert-registry`

The loader reports failures per *entry*: "failed to import loader entry 0c013085
(@deepseek-ai/dsh-typert-registry): client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js
compile error (position 1:1)". The host applies/awaits entries in registration order;
`dsh-typert-registry` is simply the **first entry the loader awaited when the combo-level
compile failure surfaced** — likely entry index 0 of the 53, or the first entry whose
import the loader resolves. The named entry is innocent; the *cause* is correctly stated in
the error's second half ("bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error
(position 1:1)"), but the prominent first-mentioned name misdirects the user. Position 1:1
is another tell: a parse error at the very first character region of the bundle points at
module-level syntax (`import` statements hoist to the top), not at a bug deep in
component code.

## 2. Diagnosis discipline and the correct client-bundle format

### How the culprit should have been located despite the misleading error

- **Read the whole error, not the first name**: the parenthetical already names the real
  file (`/plugins/@lhh010/dsh-profiles/lib/client.js`) and position (1:1).
- **Bisect by patch rows**: the only recent change was the new `insert` row. Removing the
  `dsh-profiles` insert (or temporarily pointing it away) restores all other plugins —
  one-boot bisection that immediately isolates the culprit.
- **Cheap static check that flags the offending bundle**: scan each plugin's
  `lib/client.js` for top-level ESM syntax — regexes like `^import\s`, `^export\s`,
  `import\(`, or a `"type": "module"`-style expectation — before concat. Any hit means
  the bundle violates the classic-script contract. A one-line
  `grep -E "^(import|export)\\s" lib/client.js` over installed plugin bundles flags it.
  (Notably, ANY parse error — not just ESM — in any bundled entry would have the same
  blast radius, so the check should be "does this file parse as a classic script?")

### The packaging contract an external plugin must ship

Compare `working-plugin-excerpt.txt` to the user's bundle. The correct form is:

    window.__ModuleLoader__.load({
      id: "@lhh010/dsh-profiles",
      factory: (require) => {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
        let react = require("react");
        let react_dom = require("react-dom");
        // ... component definitions using React.createElement ...
        const inject = ["slots"];
        function apply(ctx) { /* ctx.slots... registration */ }
        return module.exports;
      },
    });

- **Wrapper**: `window.__ModuleLoader__.load({ id, factory })` — a plain classic-script
  call registering the entry with the host's module loader; `id` is the plugin's package
  name (the same name used in the `insert` row).
- **CommonJS-style module locals**: the factory builds its own `module`/`exports` and
  returns `module.exports`; `Symbol.toStringTag: "Module"` marks it as a module namespace.
- **React via `require`**: dependencies are NOT imported or bundled — the loader-provided
  `require("react")`, `require("react/jsx-runtime")`,
  `require("@deepseek-ai/dsh-client-ui-primitives")` etc. resolve host-provided shared
  modules. This is why a working bundle deduplicates React and stays small.
- **Must export**: an `apply(ctx)` function (the Cordis plugin object; `inject` lists
  required services such as `slots`).
- **No top-level side effects with DOM**: the user's bundle also appended a
  `document.body.appendChild(host)` portal at import time — that belongs inside the
  component/apply lifecycle, not module evaluation.

## 3. Failure 2: `slot "settings.section" is not declared (a parent entry's children table must declare it)`

### What the error means and who declares slots

After repackaging into the loader format, the plugin's `apply` did:

    ctx.slots.register(
      { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
      ProfilesSection,
    )

Slots are not free-form names any plugin may grab. In this host, slots follow a **parent →
children tree**: a parent entry (the settings page's owning plugin) declares its children
table — the set of sub-slots it will render — via `ctx.slots.inject(...)` on its own
children. `settings.section` must therefore be **declared by the settings parent entry
first**; a bare `slots.register({ name: 'settings.section', ... })` from an outside entry
fails at apply time with exactly this error. Slot declarations are hierarchical and
order-dependent across entries: the parent's declaration must be resolvable when the child
registrant applies, and an undeclared cross-entry slot name is rejected rather than
silently ignored (fail-loud).

### The exact wrapping form the registration must use

The registrant must not hand-roll the raw slot-record object. It must obtain the parent's
slot through the proper accessor — in practice the settings entry exposes a typed child
slot (e.g. `settings.section` reached via `ctx.slots` typed declaration merging / the
`@deepseek-ai/dsh-client-ui-primitives` helpers), and the external plugin registers into
**the parent slot's `children` table** rather than registering a new top-level slot:

    ctx.slots.inject(...)   // on the PARENT: declares the children table including 'settings.section'
    // on the CHILD (external plugin):
    ctx.slots.register(
      parentSlot,           // the declared slot object obtained from the parent entry
      { id: 'profiles-manager', order: 5 },  // registrant-controlled fields only
      ProfilesSection,
    )

**Fields the registrant may pass**: its registration identity — `id`, `order` (and
component props if the slot contract allows). **Fields it must not pass**: the slot's
structural metadata — `name`, `kind`, `scope`, children declarations — those belong to
the declaring parent entry's table. The user's bundle wrongly re-declared `name`,
`kind: 'section'`, and `scope: 'settings'` as if creating the slot itself; the host
rejects that because the parent (settings) entry never listed this child.

(Concretely: check how the working sibling plugins in the same profile register settings
sections — they obtain the shared settings slot and pass only `id`/component, optionally
`order`.)

## 4. Dev-loop discipline

### Why editing plugin files does nothing until restart

Per `restart-notes.txt` and `host-boot-log.txt`: combo assembly happens **once per host
boot**. The host reads each installed plugin's client bundle, concatenates into one combo
classic script, and serves that snapshot. Editing a file on disk afterwards changes the
served bundle not at all — even a browser hard refresh re-fetches the same boot-time
combo. The dev loop for external (non-HMR) plugins is therefore:

1. Edit the plugin source / rebuild its `lib/client.js`.
2. **Stop the host process** (fully — see below).
3. Start the host (watch for the `client-modules: composed N loader entries` line —
   the new combo is now live).
4. Hard-refresh the browser.
5. Verify Settings → Plugins → Plugin list is non-empty (empty list = combo compile
   failure again; read the browser console error).

### The Windows EADDRINUSE death

On Windows, the host spawns child node processes; closing the launching terminal does not
reliably tear down the whole tree. One orphaned node process kept the listening port
bound, so the next boot failed with EADDRINUSE. The port was freed only by killing the
entire tree: `taskkill /PID <pid> /T /F` (`/T` = tree, `/F` = force). Correct restart
procedure on Windows: stop via the host's own shutdown path if one exists, otherwise
locate the listener (`netstat -ano | findstr :<port>` → PID) and `taskkill /PID <pid> /T /F`,
then boot. Simply closing the terminal window is not a stop.

## 5. Prevention

### Host-side

- **Name the offending entry, not the first awaited one**: at combo-compile failure time,
  the host knows which bundle each byte range came from (it performed the concatenation).
  It can attribute the SyntaxError's position to the owning plugin and report "client
  bundle of `@lhh010/dsh-profiles` failed to compile at 1:1 (top-level `import`)" instead
  of surfacing loader entry 0's name. Even simpler: **validate each bundle individually
  before concatenating** (parse-as-classic-script check, or regex for
  `^(import|export)\\s`); reject the boot loudly naming the plugin, so one bad external
  plugin cannot take down the 52 healthy ones — or at minimum cannot masquerade as a
  stock-entry failure.
- **Cache per-entry compile results** so a failure pinpoints the entry; and consider
  serving the combo with per-entry markers (e.g. `//# sourceURL=` or wrapper comments) so
  browser-reported positions map back to plugins.
- **Startup ordering for slots**: when an apply-time slot error occurs, the message could
  name both the registrant and the expected declaring parent entry (it partly does), plus
  a hint that structural slot fields must come from the parent's children table.

### Authoring-side template / checklist for external UI plugins

1. **Client bundle format**: single classic-script file wrapping everything in
   `window.__ModuleLoader__.load({ id: "<pkg name>", factory: (require) => { ... return module.exports; } })`;
   CommonJS-style `module`/`exports` locals; NO top-level `import`/`export`, no
   dynamic `import()`, no ESM `"type": "module"` artifacts in the shipped `lib/client.js`.
2. **Dependencies via `require`** inside the factory (`react`, `react-dom`,
   `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`); never bundle React and
   never touch DOM at module-evaluation time — do UI work inside components and
   `apply(ctx)`.
3. **Export the Cordis plugin**: `apply(ctx)` function plus `inject` array (e.g.
   `["slots"]`) returned via `module.exports`.
4. **Slot registration**: register into existing slots through the proper
   parent-slot/children-table form; pass only `id` (+ `order`/props where allowed);
   never pass `name`/`kind`/`scope` — those are the declaring parent's fields. Verify
   the target slot is declared by an entry in the same profile.
5. **Install**: directory linked into the web profile's `node_modules` + one `insert`
   row (`id` + `name`) in `cordis.patch.yml`; keep `name` consistent with the
   `__ModuleLoader__.load` id.
6. **Dev loop**: edit → fully stop the host (Windows: `taskkill /PID <pid> /T /F` if the
   port is held; check `netstat -ano`) → start host → confirm the
   `client-modules: composed` line → hard refresh → check Plugin list non-empty.
7. **Triage rule**: an empty Plugin list after adding one plugin means a combo-level
   compile failure; read the parenthetical bundle path in the error, not the first-named
   loader entry, and bisect by removing the new `insert` row.

## Verdict on the three questions tested

- Failure 1 was caused by the new plugin's bare-ESM client bundle breaking the
  boot-assembled classic-script combo at parse time; the error named
  `dsh-typert-registry` merely because it was the first awaited loader entry.
- Failure 2 was a cross-entry slot-declaration violation: `settings.section` belongs to
  the settings parent entry's children table; the external plugin must register into the
  declared parent slot passing only its own identity fields.
- Failure 3 was the documented dev-loop contract: the combo is assembled once per host
  boot, and Windows restarts require force-killing the whole process tree to free the
  port.
