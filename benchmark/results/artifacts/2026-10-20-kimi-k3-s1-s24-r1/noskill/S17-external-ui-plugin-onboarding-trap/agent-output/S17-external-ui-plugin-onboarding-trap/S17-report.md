# S17 · External UI Plugin Onboarding Trap — Incident Report

Evidence: fixture/ (browser-error.txt, plugin/lib/client.js, profile/cordis.patch.yml,
plugin-apply-error.txt, working-plugin-excerpt.txt, host-boot-log.txt, restart-notes.txt).

## 1. Failure 1 — one bad bundle killed every plugin

**What the host assembles.** At boot (and only at boot — see §4) the host's
client-modules layer resolves the cordis patch rows, reads EVERY installed plugin's
client bundle, and concatenates them into ONE "client bundle combo" — host-boot-log.txt:
"composed 53 loader entries into client bundle combo (4.5 MB, classic script)". The
browser loads that single classic script; each loader entry inside it is then imported /
applied by the module loader as one all-or-nothing batch ("Failed to load plugins").

**Why one plugin took down all.** The user's `plugin/lib/client.js` is bare ESM:
line 1 is `import React from 'react'`. A classic script cannot contain top-level
`import`/`export`; the browser/parser rejects the bundle at compile time
("bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)" —
position 1:1 is the `import` keyword itself). Because all entries ride in one combo
and the loader awaits the entries as a batch, the compile error of ONE bundle rejects
the whole load: zero entries register, the plugin list is EMPTY, and even the two
previously-working stock plugins disappear from the header.

**Why the error named the innocent entry.** `@deepseek-ai/dsh-typert-registry` is just
the FIRST loader entry in the await order (entry 0c013085). The loader reports the
failure against the entry it was awaiting when the batch rejected — the combo's compile
error surfaces attached to the first awaited entry, not to the bundle that actually
failed to compile. The real culprit is named only in the inner clause of the message
("bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error"), which the user
overlooked.

## 2. Diagnosis discipline + the required client-bundle format

**Locating the culprit from the misleading error:**
- Do NOT trust the entry name after "failed to import loader entry …" — that is the
  first awaited entry, a reporting artifact. Read the FULL nested message; the inner
  "bundle <path> compile error" clause names the real file.
- Bisect: remove the most recently inserted patch row(s) from the profile's
  cordis.patch.yml (here: the `dsh-profiles` insert) and reboot. Combo healthy → the
  culprit is among the removed rows; re-add one at a time.
- Cheap static check: lint/grep each plugin's shipped client bundle for top-level
  `import `/`export ` statements (or attempt to parse it as a classic script, not a
  module). Any hit = bundle violates the packaging contract. A one-line check such as
  `grep -nE '^(import|export) ' lib/client.js` would have flagged this file instantly.

**The format an external plugin must ship instead** (per working-plugin-excerpt.txt):
a `window.__ModuleLoader__.load({...})` wrapper:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    let React = require("react");            // React comes from require(), never import
    /* ... component code ... */
    function apply(ctx) { /* slot wiring */ }
    module.exports.apply = apply;            // or exports.apply =
    return module.exports;
  },
});
```

- **What wraps the code:** `window.__ModuleLoader__.load({ id, factory })` — a
  classic-script-safe registration call, with a CJS-style `factory(require)` body.
- **How React (and other deps) are obtained:** via the injected `require`
  (`require("react")`, `require("react/jsx-runtime")`,
  `require("@deepseek-ai/dsh-client-ui-primitives")`) — the host provides these
  shared modules; the bundle must NOT bundle or ESM-import its own React.
- **What the wrapper must export:** the factory returns `module.exports`, which must
  expose `apply(ctx)` — the host calls it at apply time with the plugin context.

## 3. Failure 2 — `slot "settings.section" is not declared`

**Who declares slots.** Slots are DECLARED by the entry that owns them, via its
children table — here the settings UI's parent entry declares a slot named
`settings.section` in its children declaration. A slot name only exists because some
parent entry declared it; the declaration is what the apply-time validator checks.

**Why the bare registration fails.** The user's `apply` called
`ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5,
kind: 'section', scope: 'settings' }, ProfilesSection)`. That is a *slot declaration*
shaped call aimed at a slot owned by ANOTHER entry. At apply time the host looks up
`settings.section` among the slots the calling entry (or its parent chain) declares,
finds none — the new plugin never declared it, only the settings parent may — and
rejects: `slot "settings.section" is not declared (a parent entry's children table
must declare it)`.

**The correct wrapping form.** A plugin contributing into someone else's slot must use
the INJECT path, not register: `ctx.slots.inject(...)` (exactly what the working
plugin does — its excerpt shows `const inject = ["slots"]` and `ctx.slots.inject(...)`
calls inside `apply`). Injection attaches a contribution to a slot the parent already
declared.

**Which fields may / must not be passed.** An injecting registrant may pass only
contribution fields: its own `id`, `order`, and the component/payload itself. It
must NOT pass slot-definition fields — `name` (the slot name is the parent's, given
as the inject target, not re-declared), `kind`, `scope` — those belong to the
declaring parent's children table; supplying them turns the call into an attempted
re-declaration of a foreign slot and fails validation.

## 4. Dev-loop discipline

**Why edits don't show up.** The combo is assembled ONCE at host boot: the host reads
every installed plugin's client bundle from disk, concatenates them, and serves the
result (host-boot-log.txt: the "composed 53 loader entries" line appears once per
boot). There is no watch/rebuild for external plugin files; the served combo is the
boot-time snapshot. Editing a plugin file afterwards changes nothing in the browser —
even after a hard refresh — until the host process itself is restarted and recomposes
the combo.

**Correct restart procedure:** stop the host process completely → confirm the port is
free → start the host → browser hard refresh → verify via Settings → Plugins → Plugin
list (an EMPTY list means the combo failed again). Every plugin edit requires this
full cycle.

**Why the Windows restart died with EADDRINUSE.** Closing the launching terminal does
not reliably terminate the node process tree on Windows — an orphaned node process kept
holding the listening port. The next host boot then failed to bind (EADDRINUSE) because
the port was still owned by the orphan. Only killing the whole tree —
`taskkill /PID <pid> /T /F` — freed the port, after which the boot bound normally.
Lesson: on Windows always verify the old host process (and its children) are actually
dead before restarting; check `netstat -ano | findstr :<port>` if bind fails.

## 5. Prevention

**Host-side:**
- At combo assembly, validate each bundle INDIVIDUALLY (parse-as-classic-script, or
  wrap each entry's compile in its own try/catch) and, on failure, log/raise an error
  that names the offending plugin's id and bundle path — never attribute a batch
  rejection to the first awaited entry.
- On combo failure, keep the healthy entries loadable: skip/quarantine the bad bundle
  and load the rest, surfacing a per-plugin error in the plugin list instead of an
  empty registry.
- Static check at boot: reject bundles containing top-level `import`/`export`
  (or missing the `window.__ModuleLoader__.load` envelope) with a message spelling
  out the packaging contract.
- Dev-loop aid: watch installed plugin client bundles and recompose the combo (or at
  least log "plugin file changed — restart required"), and on bind failure with
  EADDRINUSE print the PID(s) holding the port plus the taskkill hint.

**Authoring-side (template / checklist for external UI plugins):**
1. Ship the client bundle as `window.__ModuleLoader__.load({ id, factory })`;
   factory receives `require`, returns `module.exports` exposing `apply(ctx)`.
2. NO top-level ESM `import`/`export` in the shipped bundle; obtain React and host
   primitives via `require("react")` etc.; never bundle your own React.
3. Use `ctx.slots.inject(...)` to contribute into another entry's slot; pass only
   `id`, `order`, and your component — never `name`/`kind`/`scope` (slot
   declaration is the parent entry's children-table business).
4. Pre-ship static gate: parse the bundle as a classic script / grep for
   `^(import|export) `; require the `__ModuleLoader__.load` envelope.
5. Dev loop: after ANY plugin edit, fully restart the host (on Windows verify the old
   process tree is dead — `taskkill /PID <pid> /T /F` — before rebinding), hard
   refresh, and check Settings → Plugins → Plugin list; empty list = combo failure,
   read the nested bundle error, not the first-named entry.
