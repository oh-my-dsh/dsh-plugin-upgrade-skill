# S17 Report · External UI Plugin Onboarding Trap

Scope note: analysis is grounded solely in the fixture evidence pack and the local
`skills/plugin-upgrade` reference material. No external documentation was consulted.

## 1. Failure 1 root cause — why one bad bundle zeroed out every plugin

The host does not load each plugin's `lib/client.js` as a separate `<script
type="module">`. At boot it reads **every installed plugin's client bundle,
concatenates them into one classic (non-module) script — the "client bundle combo"
(boot log: `client-modules: composed 53 loader entries into client bundle combo
(4.5 MB, classic script)`) — and serves that single blob to the browser (the combo
route `/plugins/??...`, fetched as a revision-bearing single resource). It reaches
the browser as a **classic script**, not an ESM module graph.

The offender, `@lhh010/dsh-profiles`'s `lib/client.js`, was written as ordinary
source code with a top-level ESM `import` (`import React from 'react'`,
`import { createPortal } from 'react-dom'`) and an `export`. Inside a classic
script, a top-level `import`/`export` token is a **compile (parse) error for the
whole script**, not a runtime error for one module. Since all 53 plugins were
concatenated into one script, that single token fails compilation of the entire
combo: no `__ModuleLoader__.load(...)` call ever executes, so **zero** loader
entries register, the Plugin list in Settings is empty, and even the stock
brand-version/file-tracking plugins disappear. Every plugin dies with one.

Why the error named `@deepseek-ai/dsh-typert-registry`: the browser-side loader
imports loader *entries* and reports the failure against the first awaited entry
(`failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)`). The
combo script is shared and evaluated once, so the failure surfaces attributed to
whatever entry was awaited first in the import sequence — an innocent stock
package the user never touched. The name is a symptom location, not the cause: the
real message is the suffix, `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js
compile error (position 1:1)`, which points at the actual offending file.

## 2. Diagnosis discipline — finding the culprit behind the misleading error

Bisect, don't trust the named entry:

- Treat `failed to import loader entry <id>` as "the combo script failed to load,"
  never as "plugin `<id>` is broken." `<id>` is only the first awaited entry.
- Bisect the composition layer: walk the `insert` rows in
  `profile/cordis.patch.yml` (dsh-brand-version, dsh-file-trace, dsh-profiles)
  and check each row's client bundle. The culprit is the row added most recently /
  not previously working — here `dsh-profiles` → `@lhh010/dsh-profiles`.
- Cheap static check that flags the offender: grep every installed plugin's
  `lib/client.js` for forbidden source-form tokens, i.e. a top-level `import` /
  `export` statement (e.g. `rg -n "^(import|export) " .../node_modules/*/lib/client.js`,
  or skim the head of each file). A bundle that starts with `import React ...`
  is the culprit instantly; position `1:1` in the error confirms it sits at the
  very first byte.

What an external plugin must ship instead of bare ESM — the host's packaging
contract (visible in the working-plugin excerpt):

- One **classic script** that self-registers via `window.__ModuleLoader__.load({ id,
  factory })`, where `id` equals the package name (`@lhh010/dsh-profiles`), and
  `factory: (require) => { ... }` returns `module.exports`
  (`var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" }); ...`).
- Inside the factory, dependencies are obtained through the factory-scoped
  `require(...)` — `let react_jsx_runtime = require("react/jsx-runtime")`,
  `require("@deepseek-ai/dsh-client-ui-primitives")` — **never** top-level `import`.
  React is obtained as `require("react")` / `require("react/jsx-runtime")` from
  the host-provided module table, so the bundle carries no bare imports.
- The factory's `module.exports` must expose the plugin entry contract: a
  `const inject = ["slots", ...]` declaration of the services it consumes and an
  `apply(ctx)` function (the excerpt shows `const inject = ["slots"]; function
  apply(ctx) { ... } return module.exports;`). In other words: webpack/tsdown-style
  CJS-inside-IIFE output that calls `__ModuleLoader__.load`, not an ESM module
  graph. The user's plugin was raw source ESM — it needed bundling to this
  `__ModuleLoader__.load({ id, factory })` shell before install.

## 3. Failure 2 — `slot "settings.section" is not declared`

Meaning: slot names are part of a declarative contract owned by the *parent* entry.
The entry that owns the region (the settings shell, e.g. `@deepseek-ai/dsh-client-ui-settings`)
publishes a children table whose keys are the slot names it will render. A plugin
that wants to contribute into `settings.section` does not own that name, so a bare
`ctx.slots.register({ name: 'settings.section', ... })` fails at apply time: the
registry refuses a registration for a name no parent entry declared — apply order
across packages is unconstrained, so the registration can land before the owner's
declaration exists.

Who declares slots: the owning/parent client entry declares them (the children
table in its slot contract, e.g. the ui-settings contract declares the settings
seats). The registrant only *contributes a child* into an already-declared slot.

The wrapping form that resolves the ordering:

```js
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({ id: 'profiles-manager', name: 'settings.section', order: 5 }, ProfilesSection),
  );
}
```

`ctx.slots.inject(name, () => ctx.slots.register(...))` defers the registration
until the parent entry's slot declaration has been applied, so cross-entry ordering
no longer matters.

Fields the registrant may pass to `register`: only the contribution identity and
presentation hint — `name` (the declared slot it contributes into), its own `id`,
`order`, and optionally `label`. It must **never** pass `kind` and `scope`: those
are owned by the declaring parent entry (declaring `kind: 'section'` or
`scope: 'settings'` duplicates/overrides the parent's declaration and is rejected).
The user's broken call passed `name, id, order, kind: 'section', scope: 'settings'`
— exactly the forbidden combination — plus the bare-register form.

Also note the second assumed defect in the user's bundle: it appended a raw
`<div id="dsh-profiles-root">` to `document.body` and self-rendered via
`createPortal` outside React/the slot system. A hosted client plugin must render
inside its registered slot through the normal renderer path, not by grabbing the
DOM directly.

## 4. Dev-loop discipline — boot-assembled combo, Windows restart, EADDRINUSE

Why plugin edits do nothing until restart: the host reads every installed plugin's
client bundle and **concatenates them once at host boot** (`[boot] client-modules:
composed 53 loader entries into client bundle combo ...`, "The combo line appears
ONCE per boot"). There is no watcher, no rebuild, no HMR for the combo — a later
edit to `lib/client.js` on disk changes nothing the browser receives, even after a
hard refresh. (Consistent with the 0.1.7-alpha.2 behavior: client bundles are
cached at host boot; an install-tree client edit needs a host restart. Older
clients could rely on no-cache refetch, but the current contract is boot-cached.)

Correct restart procedure after editing a plugin's client bundle (or the host
half):

1. Stop the host process **completely** — on Windows, close the terminal alone is
   NOT sufficient (below). Prefer a deliberate kill of the host's whole process
   tree.
2. Start the host again (`dsh web` / profile restart) so the combo is
   re-assembled from the new bytes.
3. Browser hard refresh, then inspect: Settings → Plugins → Plugin list. An empty
   list means the combo failed again; a populated list means every entry
   registered.

Why the Windows restart died with EADDRINUSE: closing the launching terminal left
the `node` host process alive (the terminal window and the node process are not
the same lifetime). The orphaned node process kept holding the HTTP port, so the
next boot's bind failed with `EADDRINUSE`. The port is only freed by killing the
**entire process tree** — `taskkill /PID <pid> /T /F` (the `/T` flag is what takes
the child node processes with it; `/F` forces). After that, the next boot bound
normally. A browser tab close or a terminal close is not a host stop; a browser
refresh is even less.

## 5. Prevention

Host-side (startup / combo-failure attribution):

- Attribute, don't just name the first entry: at combo-failure time the host
  should report **which bundle file failed to compile** (it already has the
  information — the fixture error does say
  `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error`). Surface that
  file/plugin name as the headline, and list the loader entries as "also affected"
  rather than as the cause.
- Validate each bundle at startup (or at combo build): run a parse check per
  plugin bundle and reject/flag bundles containing top-level `import`/`export`
  with a message naming that plugin's package (e.g. "`@lhh010/dsh-profiles`
  ships a bare-ESM client bundle; rebuild it as `__ModuleLoader__.load(...)`"),
  instead of letting one bad file abort the whole classic script with a parse
  error attributed to the first awaited loader entry. Fast preflight: scan for
  `^import `/`^export ` tokens before concatenation.
- Optionally isolate failures: compile/serve per-plugin module preambles so one
  plugin's ESM token poisons only that plugin's registration rather than the
  entire combo, and report the offending plugin by name in the boot log.

Author-side (template / checklist so the next onboarding avoids all three):

- Packaging: `lib/client.js` must be a classic script of the form
  `window.__ModuleLoader__.load({ id: "<package name>", factory: (require) => { ... return module.exports; } })`;
  no top-level `import`/`export`; React and UI deps via `require("react")` /
  `require("react/jsx-runtime")` / `require("@deepseek-ai/dsh-client-ui-primitives")`;
  factory exports `const inject = [...]` and `apply(ctx)`; registration id ===
  package.json `name`. Check: grep the built artifact for bare ESM before install.
- Slots: contribute with `ctx.slots.inject(name, () => ctx.slots.register(...))`;
  never a bare `ctx.slots.register` on another entry's slot; pass only
  `name`/`id`/`order`/`label` — never `kind`/`scope`; render inside the slot via
  the renderer, never self-mount a portal div on `document.body`.
- Dev loop: changing any plugin file means full host restart before the browser
  sees it; on Windows stop the host completely — `taskkill /PID <pid> /T /F` if a
  terminal close left an orphan — then relaunch, then hard-refresh and check the
  Settings → Plugins list (empty = combo failed again).
- Pre-flight script: `node --check lib/client.js`-style parse (or the bundler's
  own mode), an ESM-token scan, and a manifest check (`dsh.client` entry,
  `inject` list, package name == `__ModuleLoader__` id).

Limitations: no external docs were consulted; all claims derive from the fixture
pack and the local `plugin-upgrade` skill notes. Where the fixture does not pin a
detail (e.g. the exact tsdown banner), the report flags it as part of the
documented contract in the skill rather than asserting host internals.
