# S17 Report — External UI Plugin Onboarding Trap

## 1. Failure 1 root cause

The host does not load each plugin's client bundle separately. At boot it concatenates
every installed plugin's `lib/client.js` into ONE classic script ("client-modules: composed
53 loader entries into client bundle combo (4.5 MB, classic script)") and serves that single
document to the browser. Because it is a classic script, the entire combo is parsed with
classic-script (not ESM) grammar. A single top-level `import ... from ...` (or
`export function ...`) anywhere in the concatenation is a syntax error for the WHOLE
document — the combo fails to parse/compile before any plugin factory runs — so every
loader entry fails and zero plugins register (Plugin list empty, stock brand-version and
file-trace also gone).

The browser error names `@deepseek-ai/dsh-typert-registry` only because the client loader
awaits loader entries in order and reports the FIRST awaited entry (`loader entry 0c013085
(@deepseek-ai/dsh-typert-registry)`); that entry's `import` dies because the shared combo
never compiled. The diagnostic payload is the real signal: `bundle /plugins/@lhh010/dsh-profiles/lib/client.js
compile error (position 1:1)` — position 1:1 of that bundle, i.e. exactly where the user's
raw `import React from 'react'` sits. The named entry is innocent; it is just the first
victim of a combo-wide parse failure.

## 2. Diagnosis discipline and the client-bundle contract

Locating the culprit:

- Do NOT trust the named loader entry. Bisect: drop the newest insert row (`dsh-profiles`)
  from `cordis.patch.yml` and reboot — if plugins return, the new plugin is implicated.
- Within candidates, apply a cheap static check on each `lib/client.js`: classic-script
  parse (`node --check` as a script / grep for top-level `^import ` / `^export `). Any bare
  ESM statement flags the offending bundle. In the evidence pack,
  `fixture/plugin/lib/client.js` starts with `import React from 'react'` and ends with
  `export function apply` — instantly flagged; the working excerpt has none of these.
- Alternative: `git stash`/remove each candidate row and reboot; the combo compile error
  message itself already names the bundle path.

The external client-bundle contract (as exemplified by
`working-plugin-excerpt.txt`): the plugin must ship a CommonJS-style wrapper module
registered with the shared loader:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // ... code ...
    return module.exports;
  },
});
```

- React is NOT imported at the top level; it is obtained from the host-provided shared
  registry via `require("react")`, `require("react/jsx-runtime")`,
  `require("react-dom")`, `require("@deepseek-ai/dsh-client-ui-primitives")`, etc. inside
  the factory.
- `exports` is built as a normal CJS module object; the factory returns `module.exports`.
- The exported object is the cordis plugin module: it must expose the lifecycle hook
  `apply(ctx)` and the `inject` list (e.g. `const inject = ["slots"]`). A bare
  `export function apply(...)` ESM export cannot cross the classic-script boundary.

## 3. Failure 2 — slot declaration and the required registration wrapper

`slot "settings.section" is not declared (a parent entry's children table must declare
it)` means the slot graph is two-sided: only the entry that OWNS a settings section (the
parent entry, e.g. the settings UI entry) may declare the slot `settings.section` in its
own entry's children table. Other plugins do not declare that slot; they contribute
children TO it. The user's bundle called bare `ctx.slots.register({ name: 'settings.section', ... }, ProfilesSection)`
from the `dsh-profiles` entry — that entry's children table never declared
`settings.section`, so at cordis apply time the registration references an undeclared slot
and the whole entry fails to apply (the failure is scoped to `@lhh010/dsh-profiles`;
everything else loads normally).

The registration must be wrapped so it attaches to the parent-declared slot through the
injection API, mirroring the working plugin: declare `const inject = ["slots"]` and inside
`apply(ctx)` use the `ctx.slots.inject(...)` form (registered under the caller's own entry
context, targeting the parent entry's declared slot), never a bare
`ctx.slots.register(...)` with a raw slot record.

Fields a registrant MAY pass: its own contribution metadata — its unique child `id`
(e.g. `'profiles-manager'`), `order`, and the component/component factory to render.
Fields it MUST NOT pass / redeclare: the slot identity/declaration metadata `name`,
`kind`, and `scope` of `settings.section` — those are fixed by the parent entry's
children-table declaration — and it must not register a slot name that no parent entry
declares.

## 4. Dev-loop discipline

The host assembles the client bundle combo exactly ONCE per boot: it reads every installed
plugin's client bundle from disk, concatenates them into one classic script, and serves
that from memory. There is no watcher or on-demand rebuild, so editing a plugin's source
on disk afterwards changes nothing in the browser — even a hard refresh just refetches the
same stale combo. Correct procedure per iteration:

1. Repackage/rewrite the plugin bundle (valid packaging format, proper slot injection).
2. Fully stop the host process tree.
3. Start the host again (the combo is re-assembled at this boot).
4. Browser hard refresh, then verify Settings → Plugins → Plugin list is non-empty; an
   empty list means the combo or an entry failed again.

Windows restart discipline: closing the launching terminal did NOT kill the node process;
the orphaned process kept holding the listening port, so the next host boot died with
EADDRINUSE. The fix is to force-kill the entire process tree — `taskkill /PID <pid> /T /F`
— before rebooting, after which the port binds normally.

## 5. Prevention

Host-side, at startup or combo-failure time:

- Compile/parse each plugin's client bundle individually (still concatenating for
  serving) and, on failure, throw an error naming the OWNING plugin id/path ("plugin
  '@lhh010/dsh-profiles' client bundle failed to compile: position 1:1") instead of
  letting the first awaited loader entry absorb the blame.
- At boot, sanity-check every bundle for top-level ESM statements or missing
  `__ModuleLoader__.load(...)` wrapper and log a per-plugin ONBOARDING error before
  attempting to compose the combo.
- Validate slot registrations at apply time against the parent entries' children tables
  and attribute the error to the registering entry (already partially done for failure 2),
  plus a startup warning when an entry calls bare `ctx.slots.register`.
- Optionally serve per-entry sourcemaps / report per-entry load status in Settings →
  Plugins so a whole-combo failure names the bad entry directly.

Authoring template / checklist for external UI plugins:

- [ ] `lib/client.js` is a classic script wrapping everything in
      `window.__ModuleLoader__.load({ id: "<my-id>", factory: (require) => { ... } })`.
- [ ] No top-level `import`/`export` anywhere in the shipped bundle; React, react-dom,
      and primitives come from `require(...)` inside the factory.
- [ ] `factory` builds a CJS `module.exports` and returns it; exports include
      `apply(ctx)` and the `inject` list (e.g. `["slots"]`).
- [ ] Slot contributions use `ctx.slots.inject(...)` targeting a slot that the parent
      entry declares in its children table; never bare `ctx.slots.register` for another
      entry's slot; pass only your own `id`/`order`/component, never redeclare
      `name`/`kind`/`scope`.
- [ ] Dev loop: edit → repackage → `taskkill /PID <pid> /T /F` the old host → reboot
      host → browser hard refresh → confirm Plugin list non-empty.
- [ ] Verify locally that Settings → Plugins shows the entry before publishing.
