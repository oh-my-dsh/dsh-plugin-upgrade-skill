# S17 · External UI Plugin Onboarding Trap — Diagnosis Report

Evidence base (read-only, unchanged): `fixture/browser-error.txt`, `fixture/plugin/lib/client.js`,
`fixture/profile/cordis.patch.yml`, `fixture/plugin-apply-error.txt`, `fixture/working-plugin-excerpt.txt`,
`fixture/host-boot-log.txt`, `fixture/restart-notes.txt`. Verified statically: a script-goal parse of
`plugin/lib/client.js` fails with "Cannot use import statement outside a module"; top-level ESM tokens sit at
lines 1–2 (`import`) and line 23 (`export`), i.e. the failure position 1:1 is the first character of the file.

---

## 1. Failure 1 — why ONE bad bundle killed EVERY plugin, and why an innocent entry was blamed

### What the host assembles and what reaches the browser

The host boot log shows the pipeline:

```
[boot] cordis patch layer: 3 insert rows resolved (dsh-brand-version, dsh-file-trace, dsh-profiles)
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
```

At boot the host resolves the `insert` rows of the profile's `cordis.patch.yml`, reads each installed plugin's
client bundle (e.g. `lib/client.js`), and **concatenates all 53 entries into a single "combo" served as one
classic script** (explicitly labeled `classic script` — a non-module `Script`, not an ESM `Module`). In the
browser, a module loader imports the "loader entries" carried by that script and each entry registers itself via
`window.__ModuleLoader__.load({ id, factory })` (see the working-plugin excerpt).

### Why one bundle takes down all registration

Because the delivery unit is **one concatenated classic script**, it is parsed as a whole. Classic-script grammar
has no `import`/`export` statements, so a single top-level ESM token anywhere in the concatenation is a **syntax
error for the entire script**. The user's bundle begins with:

```js
import React from 'react'          // line 1, column 1  ← position 1:1
import { createPortal } from 'react-dom'
...
export function apply(ctx) { ... } // line 23
```

A parse failure means the combo never executes at all: **zero** `window.__ModuleLoader__.load(...)` calls run, so
no entry registers — the plugin list is empty and even the two previously working stock plugins (brand version,
file tracking) vanish. It is not a cascade of per-plugin failures; it is all-or-nothing text-level parsing.

### Why the error named `@deepseek-ai/dsh-typert-registry`

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

The browser loader awaits/imports entries in combo order and attributes whatever throws to **the entry it was
awaiting when the failure surfaced** — here `0c013085 (@deepseek-ai/dsh-typert-registry)`, the first awaited
entry. That entry is innocent: it merely happened to be the import in flight when the combo (which contains the
offending bundle's text) failed to compile. The error's *subject* is "first awaited entry"; the error's *detail
clause* — `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — names the real
culprit: the new plugin's bundle, failing at its very first character, the `import` keyword.

---

## 2. Diagnosis discipline — locating the culprit and the required bundle format

### How the culprit should have been found from the misleading error

1. **Read past the named entry to the detail clause.** The message already contains
   `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`. Position 1:1 relative to
   that bundle is its first character — `import React from 'react'`. The named entry (`dsh-typert-registry`) is
   attribution noise; never start by "fixing" the entry named in the prefix.
2. **Cheap static check that flags the offending bundle with zero restarts** — a script-goal parse/grep, since
   the combo is a classic script:
   - `grep -nE '^[[:space:]]*(import|export)\b' lib/client.js` → hits at lines 1, 2, 23;
   - or parse with script goal (`new Function(src)` / acorn/esbuild `sourceType:'script'`) →
     "Cannot use import statement outside a module".
   Any top-level `import`/`export` in a candidate bundle is disqualifying. Running this over every installed
   bundle is O(n) greps and cheaper than any runtime bisect.
3. **If attribution were truly absent: bisect the `insert` rows.** Comment out half of the `insert` rows in
   `cordis.patch.yml`, restart, and observe whether the combo loads; binary-search the remaining half. Each step
   costs one full host restart (combo is composed once per boot — see §4), so the static grep above should
   always be tried first.

### The client-bundle format an external plugin must ship

Bare ESM is never valid. The bundle must be a **classic script wrapped in a ModuleLoader registration call**,
CommonJS-shaped inside, exactly like the working plugin's shell:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",                 // must match the insert-row name in cordis.patch.yml
  factory: (require) => {                      // host-provided require
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react_jsx_runtime = require("react/jsx-runtime");               // React via require,
    let ui = require("@deepseek-ai/dsh-client-ui-primitives");          // not via ESM import

    /* component definitions, NO top-level side effects */

    const inject = ["slots"];
    function apply(ctx) { /* ctx.slots.inject(...) */ }

    return module.exports;                     // the wrapper must return the exports object
  },
});
```

Three contract points:

- **What wraps the code:** `window.__ModuleLoader__.load({ id, factory })` — a classic-script registration call;
  inside the factory the host shims `module`/`exports` CommonJS-style and the factory must `return module.exports`.
- **How React is obtained:** through the host-injected `require` map inside the factory
  (`require("react/jsx-runtime")`, `require("react-dom/client")` if a portal is truly needed, and host UI
  primitives such as `@deepseek-ai/dsh-client-ui-primitives`). React is a host-shared module; it must never be
  ESM-imported or bundled privately.
- **What the wrapper must export:** the plugin entrypoint `apply(ctx)` on `module.exports` (the working plugin
  also carries `const inject = ["slots"]`, the service list telling the host which ctx services it uses).

Additionally: no top-level side effects. The user's file created a DOM host node and called `createPortal(...)` at
module top level — code that would run at combo-evaluation time for every boot, detached from the plugin
lifecycle. All DOM/render work belongs inside `apply(ctx)` / component lifecycle.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

After repackaging (the bundle now loads), the second boot fails at apply time for the new plugin only:

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared
(a parent entry's children table must declare it)
```

### Who declares slots

Slots are **declared declaratively by the parent (owner) entry** in its children table — the settings page entry
owns its layout and declares the slots children may occupy (e.g. `settings.section`). Declaration describes the
slot itself: its name plus its shape (`kind`, `scope`).

### Why a bare registration of another entry's slot fails

The user's `apply` called:

```js
ctx.slots.register(
  { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
  ProfilesSection,
)
```

`register` is a declaration attempt: it tries to bring a new slot into existence. At apply time the host
validates every slot a child entry touches against the **parent entries' children tables**; `settings.section`
is owned by the settings entry, and a foreign entry's bare `register` is not a declaration the parent's table
contains — so validation fails closed with "a parent entry's children table must declare it". A child can never
create another entry's slot; the only cross-entry path is **injection into an already-declared slot** — which is
exactly what the working plugin does (`ctx.slots.inject(...)` calls, visible in the redacted excerpt).

### The exact wrapping form the registration must use

Same `apply(ctx)` entrypoint, but `inject` instead of `register`, descriptor trimmed to placement fields:

```js
function apply(ctx) {
  ctx.slots.inject(
    { name: 'settings.section', id: 'profiles-manager', order: 5 },  // target slot + this widget's identity/placement
    ProfilesSection,                                                  // the component
  )
}
```

### Fields a registrant may pass vs must not

- **May pass (placement/identity of the injected content):** `name` — which declared slot to inject into;
  `id` — unique id of this injection (`profiles-manager`); `order` — sort position among siblings (`5`).
- **Must not pass (declaration fields owned by the parent):** `kind` and `scope`. These describe the slot itself
  (`kind: 'section'`, `scope: 'settings'`) and belong solely to the parent entry's children-table declaration.
  A registrant passing them is re-declaring someone else's slot — redundant at best, a conflict at worst — and
  is precisely what the error's parenthetical forbids.

---

## 4. Dev-loop discipline — boot-frozen combo and the Windows restart procedure

### Why edits have no effect until a host restart

The combo line appears **once per boot**: at startup the host reads every installed plugin's client bundle from
disk, concatenates them into the 4.5 MB classic-script combo, and serves that snapshot (from memory / a boot-time
artifact). There is no watcher and no per-request re-read. Consequently, editing any plugin file afterwards
changes nothing in the browser — not even after a hard refresh — because the browser keeps receiving the frozen
boot-time combo. Every plugin edit therefore requires stopping the host and starting it again so the combo is
recomposed.

### Correct restart procedure

1. Stop the host properly from its launching terminal (Ctrl+C / the host's stop command) so the signal reaches
   the node process and its children — never just close the terminal window.
2. Verify the port is actually free before starting again (e.g. `netstat -ano | findstr :<port>`; if a PID still
   holds it, kill the whole tree: `taskkill /PID <pid> /T /F`).
3. Start the host; hard-refresh the browser; check Settings → Plugins → Plugin list (an empty list means the
   combo failed again — the fast boot-time check for Failure 1).

### Why the Windows restart died with EADDRINUSE

Closing the launching terminal on Windows does not reliably terminate the child process tree: the node host
process (and any processes it spawned) survived as an orphan and kept holding the listening socket. The next
boot's `listen()` then failed with **EADDRINUSE** — the port was still bound by the orphan. A graceful kill of
only the parent was insufficient because descendants hold/re-open the handle; `taskkill /PID <pid> /T /F`
(`/T` = entire tree, `/F` = force, since console processes get no graceful close) killed the tree, released the
socket, and the following boot bound normally.

---

## 5. Prevention

### Host-side: name the offender at startup / combo-failure time

- **Pre-compile each entry individually during combo composition** (script-goal parse of each bundle before
  concatenation). The host already knows the failing bundle at that moment — it printed the path and position —
  so it can report `plugin @lhh010/dsh-profiles: client bundle lib/client.js compile error at 1:1 (top-level ESM
  import; combo is a classic script)` instead of letting the browser blame the first awaited entry
  (`0c013085 / @deepseek-ai/dsh-typert-registry`).
- **Quarantine instead of poisoning the combo:** skip (or stub) a bundle that fails the pre-compile, register the
  remaining 52 entries, surface one banner "plugin X disabled: bundle compile error — see log". One bad plugin
  must degrade only itself, not blank the whole plugin system.
- **Cheap startup lint:** reject/flag any entry whose bundle contains top-level `import`/`export` (the same
  script-goal grep used for diagnosis), with the plugin id and line numbers in the message.
- **Fix attribution structurally:** per-entry compile/eval isolation (each entry's factory in its own
  try/catch boundary at composition time), so errors are attributed to the entry whose text failed, never to the
  importer that happened to be awaiting.
- **Dev loop and port hygiene:** watch plugin directories and recompose the combo on change (removes the
  restart-per-edit trap); on shutdown, terminate the whole process tree; on EADDRINUSE, report the PID holding
  the port and offer the tree-kill instead of a raw stack trace.

### Authoring-side: external-UI plugin template / checklist

A starter template should ship the correct shell verbatim (§2), and the checklist should demand:

1. **Packaging:** `window.__ModuleLoader__.load({ id: "<package name matching the cordis.patch.yml insert row>",
   factory: (require) => { ...; return module.exports; } })`. No top-level `import`/`export` anywhere.
2. **Dependencies:** React / react-dom / host UI primitives only via `require(...)` inside the factory — never
   ESM-imported, never privately bundled.
3. **Exports:** `apply(ctx)` on `module.exports` (plus the `inject = ["slots"]` service list if services are used).
4. **No top-level side effects:** no DOM creation/mutation, no portals, no fetches at module scope — all lifecycle
   work inside `apply` / component effects.
5. **Slots:** to appear in an existing page use `ctx.slots.inject({ name, id, order }, Component)` into a slot the
   parent entry has declared; never `register` another entry's slot; never pass `kind`/`scope` as a registrant.
   Declare your own slots only in your own entry's children table.
6. **Pre-install self-check:** `grep -nE '^\s*(import|export)\b' lib/client.js` must return nothing (or run a
   script-goal parse); run it before every install.
7. **Dev loop:** after every plugin file edit, restart the host properly (stop → confirm port free →
   `taskkill /PID <pid> /T /F` if orphaned on Windows → start), hard-refresh the browser, and confirm the plugin
   list is non-empty before concluding anything about your code.

Applying checklist item 6 would have caught Failure 1 before the first boot; item 5 would have prevented
Failure 2 entirely; host-side quarantine plus the restart discipline would have kept Failure 1 from blinding the
whole plugin system and would have made each bisect step cheap.
