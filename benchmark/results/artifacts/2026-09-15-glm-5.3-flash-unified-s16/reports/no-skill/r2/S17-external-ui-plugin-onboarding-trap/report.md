# S17 · The External UI Plugin Onboarding Trap — Diagnosis Report

Scope: static, read-only analysis of the evidence pack under `/app/fixture/`. Nothing in
the fixture was modified; no migration or installation was executed. Statements below are
marked **[evidenced]** when a fixture file states them directly and **[inferred]** when
they are the mechanical conclusion drawn from that evidence.

Incident timeline (from the fixture):

1. User hand-wrote external plugin `@lhh010/dsh-profiles` and installed it the community
   way: plugin directory linked into the web profile's `node_modules` + one `insert` row
   (`id: dsh-profiles`, `name: '@lhh010/dsh-profiles'`) in the profile's
   `cordis.patch.yml` **[evidenced: `profile/cordis.patch.yml`]**.
2. First boot: browser refuses to load plugins AT ALL — the plugin list is empty and both
   stock plugins (brand version, file tracking) disappear — with an error naming the stock
   entry `0c013085 (@deepseek-ai/dsh-typert-registry)` **[evidenced: `browser-error.txt`]**.
3. After repackaging, second boot: browser loads plugins again, all other plugins render,
   but apply of `@lhh010/dsh-profiles` fails on slot `settings.section`
   **[evidenced: `plugin-apply-error.txt`]**.
4. Throughout: every plugin edit needed a host restart; one restart died with EADDRINUSE
   until the old process tree was force-killed **[evidenced: `host-boot-log.txt`,
   `restart-notes.txt`]**.

---

## 1. Failure 1 — why one bad bundle killed EVERY plugin, and why an innocent entry was blamed

### 1.1 What the host assembles and in what form it reaches the browser

**[evidenced]** The host boot log says:

```
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
```

and the dev-loop notes confirm the mechanics: at host boot the host reads every installed
plugin's client bundle, **concatenates them into ONE classic script** (the "combo"), and
serves that single script to the browser. Each plugin contributes one *loader entry* to
the combo. The correct per-entry shape is visible in the working plugin excerpt
(`working-plugin-excerpt.txt`):

```js
window.__ModuleLoader__.load({
  id: "@local/dsh-brand-version",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");
    /* ... */
    const inject = ["slots"];
    function apply(ctx) { /* ... */ }
    return module.exports;
  },
});
```

So the combo that reaches the browser is a **classic (non-module) `<script>`**: a flat
sequence of `window.__ModuleLoader__.load({ id, factory })` registration calls. Nothing is
executed at parse time except registering factories; the host later imports/applies
entries through the loader.

### 1.2 Why ONE plugin's ESM `import` took down EVERY plugin's registration

**[evidenced]** The new plugin's bundle (`fixture/plugin/lib/client.js`) is bare ESM:

```js
import React from 'react'
import { createPortal } from 'react-dom'
...
export function apply(ctx) { ... }
```

**[inferred, mechanical]** `import`/`export` are illegal syntax in a classic script. Since
the combo is a **single concatenated classic script**, parsing is all-or-nothing: a syntax
error anywhere in the concatenation aborts compilation of the WHOLE combo. Not a single
`window.__ModuleLoader__.load(...)` call ever executes, so zero entries register. That is
exactly the observed blast radius: "Settings → Plugins → Plugin list: EMPTY. Zero entries
registered," and even the two stock plugins that rendered fine before the insert vanished
from the header. The failure is at the parse/compile layer of the shared artifact, before
any per-plugin isolation can exist.

### 1.3 Why the error named `@deepseek-ai/dsh-typert-registry`

**[evidenced]** Full first-boot error:

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

**[inferred]** The browser-side loader imports/awaits entries one at a time out of the
combo. The failure surfaced while entry `0c013085` (`@deepseek-ai/dsh-typert-registry` —
a stock package the user never touched) was the entry being awaited, so the outer wrapper
("failed to import loader entry 0c013085 …") attaches the blame to the **first awaited
entry**, i.e. whoever happened to be in flight when the combo evaluation died — not to the
bundle that actually failed to compile. The real culprit is named only in the inner
detail: `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`.
`position 1:1` is a fingerprint: the very first token of that file is
`import React from 'react'`, and "compile error at 1:1 in a classic script" is precisely
what a top-level ESM `import` produces. `dsh-typert-registry` is innocent collateral — a
misleading attribution caused by reporting the await point instead of the failing bundle.

---

## 2. Diagnosis discipline — locating the culprit from the misleading error

### 2.1 Read the error's layers; don't trust the named entry

The named entry is the await point, not the cause. The actionable part is the inner
`bundle <path> compile error (position L:C)` clause — it names the exact file and offset.
Discipline: when a whole-combo failure names a stock/untouched entry, immediately look for
the `bundle …` detail and treat THAT as the suspect; cross-check the named entry against
"what did I actually change?" (the user only ever touched `@lhh010/dsh-profiles` and its
`cordis.patch.yml` insert row — an untouched stock package is almost never the cause).

### 2.2 What to bisect

The unit of bisect is the **combo membership**, i.e. the `insert` rows in the profile's
`cordis.patch.yml` (equivalently, what is linked into the profile's `node_modules`):

1. Remove the newest `insert` row (`dsh-profiles`) and restart the host. If the combo
   loads and the plugin list repopulates (stock plugins return), the removed plugin's
   bundle is the culprit. The user's case is a 1-suspect bisect (one new insert); with N
   new inserts, binary-search the rows: split the new inserts in half, boot, and keep the
   failing half.
2. Confirm before/after by the boot log's `composed N loader entries into client bundle
   combo` line and by Settings → Plugins → Plugin list (empty list = combo failed again).

### 2.3 Cheap static check that flags the offending bundle

Compile the suspect file as a **classic script** without booting anything:

- `node --check lib/client.js` — with a top-level `import`, this fails with
  `SyntaxError: Cannot use import statement outside a module`, reproducing exactly the
  host/browser classic-script parse failure.
- Or plain grep for top-level ESM: lines matching `^import ` or `^export ` in the bundle.
  The working-plugin excerpt contains none; the offending `client.js` starts with one.
- The error offset corroborates it: `compile error (position 1:1)` means the file's first
  token is already illegal — only a leading `import` does that.

Run this on every bundle added by a new insert row before installing; it turns the
whole-combo outage into a local, per-file check.

### 2.4 The client-bundle format an external plugin must ship instead of bare ESM

Not bare ESM. Ship a **classic script wrapped in the host loader's registration shell**
(the same shell the working plugin uses):

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",                       // entry id, matches the insert row's name
  factory: (require) => {                           // CommonJS-style factory, host-injected require
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // React is obtained via the injected require — the host's shared, deduped copy.
    // NEVER a top-level `import React from 'react'`, NEVER a bundled copy of React.
    let react_jsx_runtime = require("react/jsx-runtime");
    // (as needed: require("react"), require("react-dom"), require("@deepseek-ai/dsh-client-ui-primitives"), …)

    // component definitions here — no DOM side effects at module top level

    const inject = ["slots"];                       // declare required ctx capabilities
    function apply(ctx) {
      ctx.slots.inject(/* see §3 */);
    }

    module.exports.apply = apply;                   // export through module.exports…
    return module.exports;                          // …and return it to the loader
  },
});
```

The three contract points the question asks for:

- **What wraps the code:** `window.__ModuleLoader__.load({ id, factory })`, where
  `factory` is a `(require) => { … }` CommonJS-style function. The combo is a classic
  script, so the file must parse as one — no `import`/`export` statements.
- **How React is obtained:** through the factory-injected `require`
  (`require("react/jsx-runtime")` for JSX runtime, or `require("react")` /
  `require("react-dom")` as needed), which resolves against the host's module registry so
  React is shared with the host and other plugins instead of being bundled or ESM-imported.
- **What the wrapper must export:** a `module.exports` object (tagged
  `Symbol.toStringTag: "Module"`) that is returned from the factory and carries the
  entry's `apply(ctx)` lifecycle function, plus the capability declaration
  (`const inject = ["slots"]`) saying which context capabilities the entry needs injected.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

**[evidenced]** Second-boot host log:

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared
(a parent entry's children table must declare it)
```

All other plugins load and render normally on this boot — the failure is isolated to this
entry's apply step, which confirms the packaging fix worked and this is a separate,
independent mistake.

### 3.1 Who declares slots

**[inferred from the message + working excerpt]** Slots are **declared by the parent entry
that owns a surface** (here, the settings-page entry declares `settings.section` in its
**children table**). Declaration is a parent-side act: the parent's children table is the
single source of truth of which slots exist. A plugin entry is a child/leaf — it does not
own a children table and therefore cannot declare slots, including slots that visually
live "in" a page the plugin targets.

### 3.2 Why the bare registration of another entry's slot fails at apply time

**[evidenced]** What the user wrote in `apply`:

```js
ctx.slots.register(
  { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
  ProfilesSection,
)
```

Passing a full slot descriptor (`{ name, kind, scope, … }`) makes this a **slot
declaration call** — "declare a slot named `settings.section` in MY children table."
At apply time the host validates every slots operation against the declaring parent's
children table: `@lhh010/dsh-profiles` is not the settings entry and has no children
table declaring that slot, so validation rejects it with
`slot "settings.section" is not declared (a parent entry's children table must declare it)`.
The slot (as owned by the settings parent) is fine — the *form* of the call is wrong: you
cannot re-declare another entry's slot by bare registration.

### 3.3 The exact wrapping form the registration must use

**[evidenced by the working plugin excerpt]** A working plugin consumes slots with the
**inject** wrapper, not `register`:

```js
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject(/* ... */);
}
```

So the fix is:

```js
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", ProfilesSection /*, placement options */);
}
```

`ctx.slots.inject(slotName, component)` targets a slot that the owning parent entry has
already declared; the host resolves `settings.section` against the settings entry's
children table and mounts the contributed component. The plugin code must also keep the
capability line `const inject = ["slots"]` in its entry shell so `ctx.slots` is injected
at all.

### 3.4 Which fields a registrant may pass and which it must not

- **May pass (registrant-owned):** the **name of an already-declared slot as a plain
  string**, the registrant's own **component**, and at most its own placement/identity
  within the slot (e.g. an `order`/`id` for its contribution, if the API exposes one).
- **Must NOT pass (slot-definition fields owned by the parent's declaration):** a full
  descriptor object re-declaring the slot — `name` as part of an object literal,
  `kind: 'section'`, `scope: 'settings'`. Those fields describe the slot itself and belong
  exclusively to the parent entry's children-table declaration; a child passing them is
  attempting an illegal declaration, which is what the apply-time error enforces.

---

## 4. Dev-loop discipline — the boot-assembled combo and the Windows restart

### 4.1 Why plugin edits do nothing until a host restart

**[evidenced]** `host-boot-log.txt` / `restart-notes.txt`: the combo line
("composed 53 loader entries into client bundle combo (4.5 MB, classic script)") appears
**once per boot**. At boot the host reads every installed plugin's client bundle,
concatenates them into the one classic script, and serves that artifact; there is no file
watcher and no per-request recomposition. Consequently, editing any plugin file on disk
afterwards changes nothing in the browser — not even after a hard refresh — because the
browser keeps receiving the stale, boot-time combo. Every plugin edit therefore requires a
full **stop → start of the host process**, then a browser hard refresh, then a check of
Settings → Plugins → Plugin list (empty list = the combo failed again).

### 4.2 The correct restart procedure

1. Actually terminate the host process and confirm it is gone / the port is released
   (don't assume closing the launching terminal did it — see 4.3).
2. Start the host; confirm the boot log shows the combo composed with the expected entry
   count.
3. Hard-refresh the browser and verify the plugin list is non-empty and the new plugin's
   surface renders.

On Windows, when in doubt that the previous host is truly dead, kill the whole process
tree explicitly: `taskkill /PID <pid> /T /F` (as the notes record), then start the host.

### 4.3 Why the restart died with EADDRINUSE until the tree was force-killed

**[evidenced]** `restart-notes.txt`: stopping the host by closing the launching terminal
left a node process alive; the next boot failed with EADDRINUSE; only
`taskkill /PID <pid> /T /F` freed the port.

**[inferred]** On Windows, closing a terminal window does not reliably deliver termination
to child processes of the shell — the backgrounded node host survives as an orphan, still
holding the listening socket. The new host process then tries to `bind`/`listen` on the
same port and fails with `EADDRINUSE`, because an actively listening socket held by a live
process cannot be rebound. The orphan is not a child of the new process, so the new host
cannot reap it; the only fix is to kill the entire old process tree
(`/T` = tree, `/F` = force), after which the next boot binds normally. Discipline: treat
"closed the window" as NOT "stopped the host"; verify the listener is gone (or
preemptively `taskkill /T /F`) before every restart.

---

## 5. Prevention

### 5.1 What the HOST could do to name the offender instead of the first awaited entry

The root reporting defect in Failure 1 is that a combo-wide compile failure is attributed
to whichever entry was being awaited. The host already knows the failing bundle's path and
offset (`bundle …/dsh-profiles/lib/client.js compile error (position 1:1)`), so:

- **At combo-composition time (boot):** after concatenation, dry-run-parse each
  contribution as a classic script (per-entry `new Function(src)` or an acorn/native
  parser pass with classic `script` goal, per bundle, before serving the combo). On
  failure, refuse to serve the broken combo and log the offending **plugin id + insert-row
  name + file path + line:column**, e.g.
  `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js (insert dsh-profiles) is not a classic script: SyntaxError at 1:1 — top-level ESM import?`.
  Even better: keep the last-good combo and fall back to it, marking only the offending
  plugin as failed, so one bad plugin cannot blank every plugin.
- **At combo-failure/entry-import time:** wrap per-entry evaluation so that a compile
  error raised from bundle X is re-attributed to bundle X's plugin (catch at the bundle
  boundary and prefix the error with the entry id that OWNS the failing bundle), instead
  of surfacing under the first awaited entry (`0c013085 @deepseek-ai/dsh-typert-registry`).
- **Boot hint:** since the host resolves the `cordis.patch.yml` insert rows itself
  (`3 insert rows resolved (…, dsh-profiles)`), a compile failure of any bundle whose
  path maps to a recently inserted row can be reported as
  "suspect: newly inserted plugin `<id>`", which would have ended the misattribution
  immediately.
- **Apply-time validation** for Failure 2 is already good (the message names the slot, the
  rule, and the fix — "a parent entry's children table must declare it"); the host could
  add the expected call form to the message, e.g. "use `ctx.slots.inject('<slot>', comp)`
  to contribute to a declared slot."

### 5.2 External-plugin authoring template / checklist

An authoring template should ship the exact loader shell (§2.4) with TODO slots for
components and `apply`, so the author never hand-writes packaging. Checklist covering all
three failures:

Packaging (Failure 1):

- [ ] `lib/client.js` is a **classic script**, NOT ESM: zero top-level `import`/`export`.
- [ ] Wrapped in `window.__ModuleLoader__.load({ id: "<your-plugin-name>", factory: (require) => { … } })`.
- [ ] React/react-dom/UI primitives obtained via the injected `require`
      (`require("react/jsx-runtime")`, …) — never imported, never bundled.
- [ ] Entry exports a `module.exports` (tagged `Symbol.toStringTag: "Module"`) that is
      returned from the factory and carries `apply(ctx)`; capability line
      `const inject = ["slots"]` present if slots are used.
- [ ] No DOM side effects at module top level (the offending file created a host div and
      portaled at load time); all rendering happens inside the component/apply lifecycle.
- [ ] Pre-install static check passes: `node --check lib/client.js` and
      `grep -nE '^(import|export) ' lib/client.js` returns nothing.

Slot usage (Failure 2):

- [ ] Contribute to an existing surface with `ctx.slots.inject("<declared.slot>", Component)`
      — never `ctx.slots.register({name, kind, scope, …}, …)` for another entry's slot.
- [ ] Pass only registrant-owned fields (slot name as string, component, own order/id);
      never slot-definition fields (`kind`, `scope`, descriptor-style `name`).
- [ ] The target slot's declared name verified against the owning entry (e.g.
      `settings.section` declared by the settings entry).

Install & dev loop (Failure 3):

- [ ] Exactly one new `insert` row in the profile's `cordis.patch.yml`
      (`id` + `name` matching the wrapper's `id`); plugin dir linked into the profile's
      `node_modules`.
- [ ] Know that the combo is built once per host boot: after any plugin file edit, fully
      restart the host (verify the old process/port is really released; on Windows
      `taskkill /PID <pid> /T /F` for orphans), hard-refresh the browser, and confirm
      Settings → Plugins → Plugin list is non-empty before debugging further.
- [ ] On a whole-combo failure, read the error's `bundle <path> compile error (position L:C)`
      detail and suspect the newly inserted plugin — not the stock entry named in the
      outer message.

---

## Evidence-to-claim map

| Claim | Source |
|---|---|
| Combo = 53 entries, one classic script, built once per boot | `fixture/host-boot-log.txt`, `fixture/restart-notes.txt` |
| Correct loader shell / require-based React / module.exports+apply / `ctx.slots.inject` | `fixture/working-plugin-excerpt.txt` |
| Offending bundle is bare ESM starting with `import React from 'react'` at 1:1 | `fixture/plugin/lib/client.js` + `browser-error.txt` position 1:1 |
| Misattribution to first awaited entry `0c013085 (@deepseek-ai/dsh-typert-registry)`; zero plugins registered | `fixture/browser-error.txt` |
| Insert-row install path | `fixture/profile/cordis.patch.yml` |
| Slot error text and isolation to one entry on second boot | `fixture/plugin-apply-error.txt` |
| Bare `register(descriptor, component)` used by the plugin | `fixture/plugin/lib/client.js` |
| Windows orphaned node / EADDRINUSE / `taskkill /T /F` | `fixture/restart-notes.txt` |

Inference boundaries: the host-internal behaviors (parse-all-or-nothing of the concatenated
classic script, await-point attribution, parent children-table slot declaration,
`register` = declare vs `inject` = consume) are not quoted from host source (none is in the
fixture); they are the mechanical readings of the captured error messages, the boot log,
and the working-plugin excerpt, and are labeled as such above.
