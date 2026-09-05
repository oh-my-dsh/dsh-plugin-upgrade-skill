# S17 report — The external UI plugin onboarding trap

## 1. Failure 1 root cause: one raw-ESM bundle failed the WHOLE combo

The host does not serve each plugin's client bundle separately. At boot it reads every
installed plugin's client bundle and concatenates them into ONE classic `<script>`
combo (the boot log: "composed 53 loader entries into client bundle combo, classic
script"). Classic scripts have no module system: a single top-level `import React from
'react'` anywhere in that concatenation is a syntax error, and a syntax error fails the
compilation of the ENTIRE combo — so zero plugins registered, including the two stock
plugins that worked before the insert.

The error text — `failed to import loader entry 0c013085
(@deepseek-ai/dsh-typert-registry)` — is misattributed by construction: after the combo
finally loads (or in the loader's await chain), the host evaluates entries in order, and
`dsh-typert-registry` is simply the FIRST awaited entry. The failure was never in that
package; the compile error belongs to the user's new bundle.

## 2. Diagnosis discipline: bisect, syntax-check, and the correct packaging form

Do not chase the named entry. The cheap discriminating steps:

- Bisect the profile's `cordis.patch.yml` insert rows: comment out the new plugin's row,
  reboot — if the combo loads again, the new bundle is the culprit.
- Static-check the suspect bundle directly: `node --check lib/client.js` — a top-level
  `import` outside a wrapper is flagged immediately (the file is being parsed as a
  classic script).

The client bundle an external plugin ships is NOT a bare ES module. It must register
through the host's module loader:

```js
window.__ModuleLoader__.load({
  id: "<package name>",
  factory: (require) => {
    var module = { exports: {} };
    let react_jsx_runtime = require("react/jsx-runtime"); // React comes from the host, via require
    /* components; exports.apply(ctx) { ... } */
    return module.exports;
  },
});
```

Three contract points: the whole file is wrapped in `window.__ModuleLoader__.load({ id,
factory })`; React (and any host module) is obtained with `require(...)` INSIDE the
factory, never a top-level `import`; and the exports carry `inject` plus `apply`.

## 3. Failure 2: cross-entry slot registration must go through `ctx.slots.inject`

After repackaging, apply failed with: `slot "settings.section" is not declared (a parent
entry's children table must declare it)`. `settings.section` is a slot DECLARED by
another entry (`ui-settings-general`); plugin apply order across entries is undefined,
so a bare `ctx.slots.register` can run before the owner's declaration arrives — the
framework then rejects the registration and the whole entry fails to apply.

The registration must be wrapped so it defers until the declaration exists:

```js
ctx.slots.inject('settings.section', () => ctx.slots.register(
  { name: 'settings.section', id: 'profiles-manager', order: 5 },
  ProfilesSection,
))
```

The registrant passes only `name`, `id`, `order` (and optionally `label`) —
`kind`/`scope` belong to the DECLARING entry and must not be re-specified.

## 4. Dev-loop discipline: boot-assembled combo, full restarts, Windows tree-kill

The combo is assembled ONCE per host boot; there is no HMR rebuild for it. Every plugin
edit therefore requires a full host restart (stop the host, start it again), then a
browser hard refresh. On Windows, stopping by closing the terminal leaves the node
process tree alive holding the listening port — the next boot fails with EADDRINUSE.
Stop the whole tree: `taskkill /PID <pid> /T /F`, then boot again and verify with
`dsh --version` / the boot log's combo line.

## 5. Prevention

Host side: at startup (or at combo-failure time), statically scan each plugin's client
bundle before concatenation (a classic-script parse or `new Function` probe costs
nothing at that scale) and NAME the offending plugin in the boot log; attribute
combo-compile failures to the plugin whose bytes contain the first ESM token rather than
the first awaited entry; make the cross-entry slot error hint "register another entry's
slot via ctx.slots.inject".

Authoring side: an external-plugin client-bundle template (ModuleLoader wrapper +
require-based React + inject/apply exports) and a checklist — no top-level imports;
syntax-check with `node --check`; wrap cross-entry registrations in
`ctx.slots.inject`; every iteration ends with a full host restart (tree-kill on
Windows) plus a hard refresh before re-testing.
