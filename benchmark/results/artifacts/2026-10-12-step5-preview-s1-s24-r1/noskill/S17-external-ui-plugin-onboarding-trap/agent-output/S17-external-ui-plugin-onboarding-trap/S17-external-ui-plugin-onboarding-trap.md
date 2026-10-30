# S17 · External UI Plugin Onboarding Trap — Incident Report

Case: a hand-written external web UI plugin `@lhh010/dsh-profiles` installed the normal
community way (directory linked into the web profile's `node_modules` + one `insert` row in
`profile/cordis.patch.yml`). One plugin produced a chain of three failures. This report
traces each to its real cause and gives host-side + authoring-side prevention.

Evidence used (read-only fixture): `browser-error.txt`, `host-boot-log.txt`,
`plugin-apply-error.txt`, `plugin/lib/client.js`, `working-plugin-excerpt.txt`,
`restart-notes.txt`, `profile/cordis.patch.yml`.

Root facts the whole report rests on:

- The host serves the browser **one classic (non-module) client bundle combo**, assembled
  **once at boot**: `[boot] client-modules: composed 53 loader entries into client bundle
  combo (4.5 MB, classic script)`. It is concatenation, not ESM (`host-boot-log.txt`).
- Every plugin's client module must therefore be published as a **`__ModuleLoader__`
  package** (`window.__ModuleLoader__.load({ id, factory })`), classic-script compatible,
  with dependencies obtained via a `require(...)` argument — **not** bare top-level ESM
  (`working-plugin-excerpt.txt`).
- Slots are **declared by a parent entry's children table**; downstream plugins *inject*
  into slots, they do not *declare* other entries' slots (`plugin-apply-error.txt`).

---

## 1. Failure 1 — One bad bundle blanked *every* plugin; why `dsh-typert-registry` was named

**Observed** (`browser-error.txt`), first boot after the `insert`:

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
Settings → Plugins → Plugin list: EMPTY. ... The two stock plugins (brand version, file
tracking) ... are gone from the header as well.
```

**What the host assembles and in what form it reaches the browser.** At boot the
client-modules layer reads every installed plugin's client bundle, collects them as ordered
*loader entries*, and **concatenates them into a single ~4.5 MB classic script** served to
the browser as one `<script>` tag (explicitly *not* `type="module"`). Each well-formed
plugin contributes a `window.__ModuleLoader__.load({ id, factory })` call; the loader
registers each module and later runs its `apply(ctx)`/`inject` lifecycle. So the browser
receives **one non-module classic script**, and per-plugin behavior runs afterwards out of
the loader registry.

**Why ONE bundle took down ALL of them.** The submitted `plugin/lib/client.js` is bare ESM
— it *opens* with `import React from 'react'`. A top-level `import`/`export` is legal only
inside an ES module; in a **classic script it is a parse-time `SyntaxError` at `1:1`** (line
1 = the `import`). Because the host concatenated this file verbatim into the single classic
combo, the **entire combined script fails to parse as one unit**. When a classic script has
a parse error the browser discards the *whole* script before executing any of it — so none
of the 53 `__ModuleLoader__.load(...)` calls ever run. Result: zero registered entries, the
stock brand-version and file-trace plugins vanish from the header, and the plugin list is
empty. It is not a per-file failure; it is package failure — one malformed line poisons the
shared classic bundle that every entry lives inside.

**Why the error still named the innocent `@deepseek-ai/dsh-typert-registry` (id `0c013085`).**
The message is layered. The *leading* clause — `failed to import loader entry 0c013085
(@deepseek-ai/dsh-typert-registry)` — reports **the entry the loader happened to be
importing when the combo-wide compile error surfaced**, not the entry that is broken.
Because the whole-combo parse throws at a single instant, the loader can only attribute the
throw to *some* entry boundary; `dsh-typert-registry` is simply the entry it was on at that
moment (the "first awaited" entry). Stock package, untouched by the user. The *trailing*
clause is the one that actually identifies the culprit — `bundle
/plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — and it is
exactly the plugin the user added. **The named entity and the guilty file are two different
things**, and the guilty one is buried at the end of the line where it gets read past.

---

## 2. Diagnosis discipline + the client-bundle contract

**How the culprit should have been located from the misleading error.**

- **Read to the end of the line.** Trust the file path + position over the leading entity
  name. The error already *told* you the culprit: `/plugins/@lhh010/dsh-profiles/lib/client.js`
  at `1:1`. `@deepseek-ai/dsh-typert-registry` is a decoy.
- **`position 1:1` is the fingerprint.** A compile error at the very first character of a
  *per-file* client bundle is the signature of a top-level `import`/`export` — i.e. bare
  ESM shipped into a classic-script combo. Line 1 of the submitted file is
  `import React from 'react'`: exact match.
- **Bisect empirically to confirm attribution.** This class of failure is "one bad parcel
  kills the shipment." Temporarily drop the new plugin's bundle from the combo (comment out
  its `insert` row in `cordis.patch.yml`, or move its bundle out of `node_modules`) and
  reboot. If brand-version / file-trace reappear and the list repopulates, the dropped
  plugin is proved the culprit — then narrow to the file named at `1:1`.
- **Cheap static check that flags the offending bundle.** A one-line gate on every external
  plugin's shipped client bundle: (a) it must **begin with / contain the
  `window.__ModuleLoader__.load(` wrapper**, and (b) it must contain **no top-level
  `import`/`export`** (`grep -nE '^\s*(import|export)\s' lib/client.js` must be empty).
  Either assertion failing = do not ship. (`node --check` is the wrong tool — it reinterprets
  the file by extension and won't enforce the classic-script/contract rule.)

**The client-bundle an external plugin must ship instead of bare ESM** (reconstructed from
`working-plugin-excerpt.txt`):

- **Wrapper:** the code is wrapped in `window.__ModuleLoader__.load({ id, factory })` — *not*
  a `<script type=module>`, *not* top-level ESM.
- **CommonJS shell inside `factory`:** `var module = { exports: {} }; var exports =
  module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`
- **How React (and every dependency) is obtained:** **via the `require` argument passed into
  the factory**, e.g. `require("react")`, `require("react-dom")`, `require("react/jsx-runtime")`,
  `require("@deepseek-ai/dsh-client-ui-primitives")`. There are **no `import` statements at
  all** — dependencies are pulled in by module id at factory-execution time.
- **What the wrapper must export:** `factory` **returns `module.exports`**, and that exports
  object carries the plugin's lifecycle facets — at minimum an **`apply(ctx)`** function,
  plus a declared injection list (`const inject = ["slots"];`). `apply(ctx)` is where all
  mounting/injection happens (e.g. `ctx.slots.inject(...)`).
- **No top-level DOM side effects.** The submitted file appended a `<div id="dsh-profiles-root">`
  to `document.body` and ran `createPortal(...)` at *import* time. That is out of contract:
  classic-script load order and DOM availability are not the plugin's to assume at load.
  All rendering must be driven from `apply(ctx)` through the slots/inject lifecycle, as the
  working plugin does.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

**Observed** (`plugin-apply-error.txt`), second boot after repackaging (bundle now compiles,
plugins load again):

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not
declared (a parent entry's children table must declare it)
```

This time the error **names the real culprit correctly** — the failure is now per-entry at
*apply* time, not a whole-combo compile crash, so all other plugins load fine. The plugin
still isn't correct, just packaged correctly enough to reach apply.

**Who declares slots.** Slots are declared by their **parent (owner) entry** in that parent's
**children table**. `settings.section` belongs to the settings host entry (a parent), which
declares it and the area it lives in. Downstream plugins *consume* existing declared slots;
they do not declare slots owned by others.

**Why the bare registration fails at apply time.** The submitted code
(`plugin/lib/client.js:23-28`) does a bare self-declaration:

```js
export function apply(ctx) {
  ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
    ProfilesSection,
  )
}
```

`ctx.slots.register(...)` with `name`/`kind`/`scope` tries to *declare a slot* named
`settings.section`. But this plugin is not that slot's parent, and it never targets the
parent-owned slot as a child. At apply time the slot system resolves the target through the
owning parent's children table; nothing in this registrant's entry declares/attaches to that
parent-declared slot, so it is "not declared" *in the applicable parent* → throw. (Note: it
also carries the old ESM `export` keyword — harmless as a classic-script parse at this point
only because repackaging has by now wrapped it, but it is the same bare-ESM mistake from §1.)

**The wrapping form the registration must use.** Register as a **child injected into the
parent-declared slot**, via the slots **inject** path shown by the working plugin — declare
`const inject = ["slots"];` at module scope and, inside `apply(ctx)`, call the slots
**inject/child-register** that attaches to the *already-declared* parent `settings.section`,
rather than `ctx.slots.register(...)`-declaring a slot it does not own. Shape:

```js
// module scope
const inject = ["slots"];
function apply(ctx) {
  // target the PARENT-declared slot; pass only the child's own facet:
  ctx.slots.inject("settings.section", {
    id: "profiles-manager",   // this registrant's child node id  — allowed
    order: 5,                // ordering among siblings          — allowed
    // ProfilesSection component                                    — allowed
  }, ProfilesSection);
}
module.exports = { apply, inject };
```

*Honest scoping:* the exact helper invocation (`inject` vs a child-`register`) is inferred
from the redacted working excerpt — its call body is elided, and I did not read the host
source (out of scope). What is certain from the evidence is the **direction**: bind the
component as a **child of the parent-declared `settings.section`** through the inject
mechanism; do not standalone-declare the slot. The elided argument list should be confirmed
against the real slot API when wiring it up.

**Which fields a registrant MAY pass vs MUST NOT.**

- **MAY pass (the registrant's own child contribution):** the child node's **`id`**
  (`profiles-manager`), the optional **`order`** for sibling positioning, and the mounted
  **component**. Plus the *reference* to which parent slot to attach to.
- **MUST NOT pass (the slot's declaration/ownership facets, owned by the parent):**
  **`kind: 'section'`** and **`scope: 'settings'`**. These describe/define the `settings.section`
  slot itself and are set by its declaring parent; a registrant re-supplying them is
  effectively re-declaring a slot it does not own and is rejected. Likewise the slot `name`
  must be a *reference to* a parent-declared slot, not a fresh declaration.

---

## 4. Dev-loop discipline — why edits don't show up, correct restart, and the Windows EADDRINUSE

**Why the client combo isn't rebuilt when plugin files change.** The combo is assembled
**exactly once at host boot** (`[boot] client-modules: composed 53 loader entries ...`,
appears once per boot, `host-boot-log.txt` / `restart-notes.txt`). There is no watch/live
rebuild: the host snapshots the concatenated classic script into memory at boot and serves
that static string. Editing any plugin file on disk afterwards changes nothing in the
browser — **even after a hard refresh**, because a hard refresh just re-fetches the same
already-assembled combo the process still holds.

**Correct restart procedure** (`restart-notes.txt:3`):
1. Fully **stop the host process** (not merely close the terminal/GUI that launched it —
   see below);
2. **start the host again** so it re-reads every bundle and recomposes the combo;
3. **hard-refresh the browser**;
4. verify **Settings → Plugins → Plugin list is populated** — an empty list means the combo
   failed again (re-run §2's diagnosis).

**Why the Windows restart died with EADDRINUSE until the process tree was force-killed**
(`host-boot-log.txt`, `restart-notes.txt:8-11`). On Windows, closing the launching terminal
window does **not** tear down the child `node` process — it detaches/orphans it while it
keeps holding the listening port. The next host boot therefore fails to bind with
**EADDRINUSE** (port still held by the orphan). The fix is to kill the whole process tree so
the orphaned node goes with it:

```
taskkill /PID <pid> /T /F
```

- `/T` = terminate the tree including children (the node host), `/F` = force. After the tree
  is killed the port is freed and the next boot binds normally. (This is a Windows-specific
  hazard; on POSIX stopping the process group normally suffices.) The blocking syntax
  `taskkill /PID <pid> /T /F` is what actually releases the port — the orphaned node, not
  the closed terminal, owned EADDRINUSE.

---

## 5. Prevention — host-side (name the offender) + authoring-side (never repeat the 3)

### Host: name the culprit instead of the "first awaited entry"

The misleading attribution in Failure 1 comes from concatenating all bundles first and only
then compiling the combo as one unit, so the loader can only blame whichever entry it was
importing when the single parse threw. Host-side fixes:

- **Per-entry compile/validate BEFORE concatenating.** At boot, compile/parse *each* plugin's
  client bundle in isolation (sandbox-load each `__ModuleLoader__` entry on its own) and, on
  failure, **report the offending file/plugin and position directly** — the inner message
  already knows `/plugins/@lhh010/dsh-profiles/lib/client.js` at `1:1`; surface *that* as the
  primary, top-level error instead of the incidental `0c013085` entry name.
- **Fault isolation on combo failure.** If the assembled combo fails to compile, **map the
  failing span back to its source entry** (via a loader-entry source map) and name that
  entry/plugin; optionally skip the offending entry and still serve the rest so one bad
  plugin can't blank the whole list.
- **Fail loud per-entry, not whole-combo.** Never let the failure surface as "loader entry
  `<innocent>`"; always carry the originating `bundle <path>` to the front of the message.
- The apply-time error in Failure 2 already names the entry correctly; keep that
  per-entry-at-apply discipline and, if possible, append the resolved owning parent entry so
  the author knows *which* parent's children table owns the slot.

### Authoring template / checklist for external web UI plugins

Ship every onboarding with this checklist so none of the three failures recur:

1. **Client-bundle packaging (prevents Failure 1).**
   - Client bundle is a `window.__ModuleLoader__.load({ id, factory })` wrapper — **classic
     script**, **no top-level `import`/`export`**. (`grep -nE '^\s*(import|export)' lib/client.js`
     must be empty; file must contain `__ModuleLoader__.load(`.)
   - Dependencies via the factory `require` argument (`require("react")`, `require("react-dom")`,
     `require("@deepseek-ai/dsh-client-ui-primitives")`); use the CJS `module.exports` shell;
     `factory` returns `module.exports`.
   - **No DOM side effects at load** — nothing appended to `document.body`, no `createPortal`
     at import; all mounting runs inside `apply(ctx)` through slots/inject.
2. **Slot registration (prevents Failure 2).**
   - To add UI into an existing slot (e.g. `settings.section`), **inject as a child of the
     parent-declared slot** (`inject = ["slots"]` + `ctx.slots.inject(...)` into the parent
     slot); **do not** `register`/declare a slot you don't own.
   - Pass only the child `id` + optional `order` + component. **Do not** pass the slot's
     declaration facets `kind` and `scope` (owned by the parent).
3. **Dev-loop discipline (prevents the EADDRINUSE / stale-combo trap).**
   - The combo is built **once at boot** — after **any** plugin file change, **restart the
     host process**, then hard-refresh the browser, then confirm the plugin list repopulates.
   - On Windows, **fully stop/restart the host process**; if a boot fails with **EADDRINUSE**,
     release the port with **`taskkill /PID <pid> /T /F`** (kill the tree) before rebooting.
4. **Installation smoke test before committing the `insert` row.**
   - Insert the plugin into the profile, boot once, and confirm the two *stock* plugins still
     load. If the plugin list goes empty and stock plugins vanish, the new bundle poisoned the
     classic combo — apply §2's static check + bisect rather than editing the (innocent)
   entries the error happens to name.

---

### Appendix — quick-reference: the three failures vs. their true cause

| # | Symptom | Misleading surface | True culprit | Fix |
|---|---------|--------------------|--------------|-----|
| 1 | Plugin list empty, stock plugins gone | errors on `@deepseek-ai/dsh-typert-registry` (id `0c013085`) | `@lhh010/dsh-profiles/lib/client.js` line 1 top-level `import` breaks the single classic combo | Wrap in `__ModuleLoader__.load`, no top-level ESM, `require` for React, no import-time DOM |
| 2 | `slot "settings.section" is not declared` at apply | — | bare `ctx.slots.register(...)`-declaring a slot owned by a parent | Inject as a child of the parent-declared slot; pass only child `id`/`order`/component, not `kind`/`scope` |
| 3 | Edits don't show; reboot EADDRINUSE | — | combo built once at boot; Windows orphaned node holds the port | restart host process → hard refresh; `taskkill /PID <pid> /T /F` to free the port |
