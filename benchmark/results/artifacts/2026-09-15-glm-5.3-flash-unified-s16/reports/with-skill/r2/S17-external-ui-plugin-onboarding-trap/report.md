# S17 · The External UI Plugin Onboarding Trap — Diagnosis Report

Subject: `@lhh010/dsh-profiles`, a hand-written external web UI plugin installed the
community way (directory linked into the web profile's `node_modules` + one `insert` row
in the profile's `cordis.patch.yml`), which produced a chain of three failures.
Evidence: read-only fixture under `fixture/` (browser-error.txt, plugin/lib/client.js,
profile/cordis.patch.yml, plugin-apply-error.txt, host-boot-log.txt, restart-notes.txt,
working-plugin-excerpt.txt). Diagnosis method: symptom → root cause lookup in the
plugin-upgrade skill's `references/troubleshooting.md` (rows "Failed to load plugins …
zero plugins register" and "slot … is not declared"), cards DSH-0.1.2-A1-25/A1-26
(`references/v0.1.2-alpha.1.md`), DSH-0.1.5-A1-20 (`references/v0.1.5-alpha.1.md`),
pre-flight touchpoint #5, and the working-plugin excerpt as the packaging contract.

---

## 1. Failure 1 root cause — one raw-ESM bundle took down EVERY plugin's registration

**What the host assembles at boot.** The host-boot log shows the decisive line:

```
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
```

Once per boot, the host reads every installed plugin's client bundle
(`<pkg>/lib/client.js`) and **concatenates them into ONE combined script — a *classic*
(non-module) script** — served to the browser from the combo route
(`/plugins/??<package>/lib/client.js&rev=…`). The browser does not load 53 separate
files; it executes a single classic `<script>` containing every entry. Each entry is
supposed to be a self-registering call of the form
`window.__ModuleLoader__.load({ id, factory })` (see the working excerpt). There is no
per-plugin isolation: the combo is one parse unit and one failure domain.

**Why one plugin killed all of them.** The user's `lib/client.js` is a **bare ESM
module**: it begins with top-level `import React from 'react'` /
`import { createPortal } from 'react-dom'` and ends with a top-level
`export function apply(ctx)`. `import`/`export` are illegal syntax in a classic script.
When the host composed the combo, the offending bundle failed the **compile step of the
whole combo**:

```
client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

Position 1:1 is the very first token of that file — the `import` keyword (verified
statically: the fixture bundle parses neither as a classic script nor as CJS; the parse
error lands exactly on line 1's `import`). A compile-time syntax error in the combo
means **zero** entries are handed to `__ModuleLoader__` — no registration at all — which
is exactly what the browser showed: `Settings → Plugins → Plugin list: EMPTY`, and even
the two previously-working stock plugins (brand version, file tracking) vanished. The
failure domain of the combo is all-or-nothing; nothing about the user's plugin was
"ordinary enough" to degrade gracefully.

**Why the error named `@deepseek-ai/dsh-typert-registry`.** The outer error frame —
`failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)` — names only
**the first awaited loader entry**: the entry the loader happened to be waiting on when
the combo failed, by roster order, not the culprit. `dsh-typert-registry` is a stock
host package the user never touched; it is innocent. The real attribution is in the
nested cause, which names the failing bundle path
(`/plugins/@lhh010/dsh-profiles/lib/client.js compile error`). This "first unregistered
/ first awaited entry is named" mis-attribution is a known, carded failure family
(troubleshooting row 13; DSH-0.1.5-A1-20 observed the same shape with an upgrade-dropped
combo module: "the first unregistered entry is named (an innocent one) and ALL client
plugins fail to load").

## 2. Diagnosis discipline — locating the culprit despite the misleading name

**Read the whole error before touching anything.** The outer id is the first awaited
entry (innocent); the nested cause already names the real failing bundle path. Attribution
before edits — never "fix" the named stock entry (per DSH-0.1.5-A1-20's recipe:
*attribute before touching plugins*).

**What to bisect.** The **patch layer's `insert` rows** in the profile's
`cordis.patch.yml`. The combo is built from exactly the entries the patch layer inserted
(here: `dsh-brand-version`, `dsh-file-trace`, `dsh-profiles`). Bisect: comment out half
the new `insert` rows, restart, re-check the browser; repeat on the failing half. The
two stock plugins were rendering before the insert, so the newest row
(`@lhh010/dsh-profiles`) is the prime suspect.

**Cheap static checks that flag the offending bundle** (all read-only, no boot needed):

1. **Read the nested cause's path** — here it already points at
   `node_modules/@lhh010/dsh-profiles/lib/client.js`.
2. **ESM-token grep on every `lib/client.js` in the combo** — a top-level
   `import`/`export` at line start is the smoking gun:
   `grep -nE "^(import|export) " <profile>/node_modules/*/lib/client.js`.
   The fixture hits at lines 1, 2 and 23.
3. **Classic-script parse check** — the same class of check the host's compile step
   performs: `node --check <bundle>` (or equivalent classic-script parse). The fixture
   fails with `SyntaxError: Cannot use import statement outside a module` on the first
   token — reproducing the host's "compile error (position 1:1)" offline.
4. **Wrapper grep** — a correct bundle contains `__ModuleLoader__`
   (pre-flight touchpoint #5 scans exactly for `__ModuleLoader__|PLUGIN_ID`); the
   fixture contains **zero** occurrences.

**The client-bundle format an external plugin must ship instead of bare ESM.** A
classic-script, CommonJS-flavored factory wrapped in the module loader — exactly the
shape of the working plugin's excerpt:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",              // == package.json "name" (see below)
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // React (and any host/shared package) comes from the HOST-provided require
    // inside the factory — never a bare ESM import:
    let react_jsx_runtime = require("react/jsx-runtime");
    let react = require("react");

    const inject = ["slots"];               // injected faces this plugin needs
    function apply(ctx) {                   // all work happens inside apply(ctx)
      // ctx.slots.inject(...) / registrations — see section 3
    }
    return module.exports;                  // the factory RETURNS module.exports
  },
});
```

- **What wraps the code:** `window.__ModuleLoader__.load({ id, factory })`. The `id`
  must equal the package.json `name` (three-id agreement, card DSH-0.1.2-A1-26:
  registration id == package name == patch insert row's bare scoped name); the banner is
  normally injected by the build (tsdown `PLUGIN_ID` banner) rather than hand-written.
- **How React is obtained:** through the host-supplied `require` passed into the
  factory — `require("react")` / `require("react/jsx-runtime")` /
  `require("@deepseek-ai/dsh-client-ui-primitives")` — so the bundle shares the host's
  single React instance and never bundles or imports its own. The combo is a classic
  script, so *any* top-level `import`/`export` is a compile error.
- **What the wrapper must export:** the factory returns the CJS `module.exports` object,
  which must expose `apply(ctx)` (the entry's activation function), optionally with an
  `inject` array declaring the faces it needs (the working plugin declares
  `const inject = ["slots"]`).

The corrected `@lhh010/dsh-profiles` bundle is therefore the same UI code, re-shelled:
drop the `import React`/`import react-dom` lines, take `require("react")` (and
portal support) from the factory's `require`, drop the top-level DOM side effects
(`document.createElement`/`appendChild` at module scope), and move everything into
`apply(ctx)`; drop `export` and `return module.exports` with `apply` on it.

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

After repackaging (browser loads plugins again), the apply-time error on the second
boot was:

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared (a parent entry's children table must declare it)
```

**Who declares slots.** Every slot is declared by the **parent entry that owns the
surface** — the host/bundle entry that renders the settings page declares
`settings.section` in **its own children table**. A slot name used by another entry
(`settings.section`, `conversation.*`, …) is not a free namespace any plugin may
`register` into; it exists only where its owner declared it.

**Why a bare registration of another entry's slot fails at apply time.** The user's
`apply` did a bare `ctx.slots.register({ name: 'settings.section', … }, ProfilesSection)`.
Apply order across loader entries is **undefined**, so the registration can execute
before the owning parent entry's children table has declared the slot — and the apply
step fails closed with "not declared". Registering into someone else's slot is only
legal as a *deferred, hooked* registration that waits on the declaration.

**The exact wrapping form.** Per troubleshooting row 14 (cards DSH-0.1.2-A1-25/A1-26),
wrap the registration in `ctx.slots.inject`:

```js
function apply(ctx) {
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      { name: "settings.section", id: "profiles-manager", order: 5 },
      ProfilesSection,
    ),
  );
}
```

`ctx.slots.inject(name, registerFn)` defers the `register` until the parent entry's
`settings.section` declaration exists, which removes the apply-order race.

**Which fields the registrant may pass and which it must not.**

- **May pass:** `name`, `id`, `order` (and a `label`). These are the contributor's own
  placement facts (which slot, who am I, where in the order).
- **Must not pass:** `kind`, `scope`. Those describe the slot's nature and live **only**
  in the parent entry's declaring children table — the owner decides that the slot is a
  `section` scoped to `settings`. The user's registration passed
  `kind: 'section', scope: 'settings'`, which is exactly the overreach the contract
  forbids (troubleshooting row 14: "the registrant passes only `name`/`id`/`order`
  (`label`), never `kind`/`scope`").

Note also that after this fix the plugin still had a latent correctness problem from
Failure 1's code: module-top-level DOM side effects and a manual `createPortal` are not
part of the contract — rendering belongs inside the registered component/`apply` flow,
or the code runs at combo-parse time on every boot regardless of activation.

## 4. Dev-loop discipline — boot-assembled combo and the Windows restart

**Why edits need a host restart.** The combo is assembled **once, at host boot**:
the host reads every installed plugin's `lib/client.js`, concatenates them into the one
classic-script combo (the `[boot] client-modules: composed 53 loader entries …` line),
and serves that snapshot. There is no file watcher for plugin sources and no per-request
rebuild; editing a plugin file on disk afterwards has **no effect in the browser — even
after a hard refresh** — because the browser keeps receiving the boot-time combo (same
rev). Only stopping and starting the host process re-reads the plugin files and
re-composes the combo. (Contrast: a *running* host serving stale code after an on-disk
change is the same "process predates the change = ghost" family that
`ghost-host-check.mjs` classifies; the dev-loop consequence is identical — restart to
regenerate.)

**The correct restart procedure** (restart-notes.txt step 3, and the skill's host-stop
discipline):

1. **Fully stop the host process** and verify it is actually gone — a browser refresh
   or closing the launching terminal is **not** a host stop; confirm the port is free
   and no orphan `node` process remains.
2. Start the host again (`dsh web`).
3. **Hard-refresh the browser**, then check `Settings → Plugins → Plugin list` — an
   empty list means the combo failed again (the empty list is itself the combo-failure
   indicator from Failure 1).

**Why the Windows restart died with EADDRINUSE until the tree was force-killed.** On
Windows, closing the launching terminal does not kill the host's child `node` process —
the process is orphaned and keeps running, still holding the listening port. The next
boot then fails to bind: `EADDRINUSE` (the port is held by the previous, now-orphaned
host). Killing the whole process tree is what releases the port:

```
taskkill /PID <pid> /T /F
```

`/T` (tree) is essential because the listener may be a descendant of the visible
process; `/F` forces it. After the tree kill, the next boot bound normally. The general
rule behind it (SKILL.md, global host upgrades; troubleshooting EBUSY row): a running
host holds process/file resources until the process tree is gone — stop the tree
first, then mutate/replace/restart.

## 5. Prevention

### Host-side: name the offending plugin, not the first awaited entry

- **Per-bundle validation at combo-assembly time (boot).** Before/while concatenating,
  compile-check each candidate `lib/client.js` as a classic script (parse for
  top-level `import`/`export`, or run the per-bundle compile the combo step already
  needs) and resolve the failing path to its **owning package id** from the boot roster
  / patch insert rows. Emit e.g.
  `client bundle @lhh010/dsh-profiles/lib/client.js is not a classic-script loader entry: top-level ESM at 1:1; combo aborted` —
  instead of surfacing the first awaited loader entry (`dsh-typert-registry`) as the
  failure name.
- **At combo-failure time, keep the innocent out of the message.** The error frame
  should lead with the culprit bundle path and its owner; the awaited-entry id belongs
  in a diagnostic detail line at most. Optionally, quarantine only the offending entry
  (skip it, serve the rest of the combo) and mark it failed-by-name, so one bad
  third-party plugin cannot blank every plugin's registration (the all-or-nothing
  domain is the amplifier of this incident).
- **Apply-time slot errors already name the registrant** (`failed to apply loader entry
  (@lhh010/dsh-profiles)`) — good; extend the same ownership attribution to the
  compile-time path.

### Authoring template / checklist for external UI plugins

A "new external client plugin" template should ship (and its README should enforce) the
packaging contract the working excerpt demonstrates:

1. **Ship the loader wrapper, never bare ESM.** Bundle shape:
   `window.__ModuleLoader__.load({ id, factory })` with the factory returning
   `module.exports`. Build with the standard banner (`PLUGIN_ID`) so
   `id == package.json name == cordis.patch.yml insert row name` (three-id agreement,
   DSH-0.1.2-A1-26). Pre-publish gate: `grep -nE "^(import|export) " lib/client.js`
   must be empty and `node --check lib/client.js` must pass (classic-script parse) —
   these two checks would have prevented Failure 1 before any boot.
2. **React via host `require`, never bundled/imported.** Inside the factory:
   `require("react")` / `require("react/jsx-runtime")` / host UI primitives; the host's
   single React instance is shared.
3. **No module-top-level side effects.** No `document.*`, no rendering at bundle scope;
   all activation work goes in `apply(ctx)`.
4. **Cross-entry slots go through the inject wrapper.** To contribute to another entry's
   slot: `ctx.slots.inject("<slot>", () => ctx.slots.register({ name, id, order }, C))`;
   pass only `name`/`id`/`order`(`label`) — never `kind`/`scope` (owner-owned). Declare
   needed faces via `const inject = [...]` (e.g. `["slots"]`). This prevents Failure 2.
5. **Declare the three ids consistently.** Registration id, package.json `name`, and the
   patch insert row's bare scoped name must agree; verify with
   `dsh --profile <name> --dump-config` and, after boot, `window.__DSH_BOOT__.entries`
   and a combo fetch containing `__ModuleLoader__.load({ id: "<package name>"`.
6. **Dev-loop discipline in the README.** Every plugin-file edit requires a full host
   restart (boot re-composes the combo once); stop = verify the process tree is gone
   (Windows: `taskkill /PID <pid> /T /F` for orphans, otherwise EADDRINUSE on the next
   boot); then hard-refresh and confirm the plugin appears in `Settings → Plugins →
   Plugin list` — an empty list means the combo failed again, and the first named entry
   in the error is not necessarily the culprit.
7. **Validate the real mount, not just the build.** A green build/install does not prove
   enablement: cold-boot the profile, prove registration/mount (per the skill's runtime
   validation layer), and only then iterate on UI code.

---

### Summary of the three failures

| # | Symptom | Real culprit / cause | Fix |
|---|---|---|---|
| 1 | Browser refuses ALL plugins, error names `@deepseek-ai/dsh-typert-registry` | First-awaited-entry mis-attribution; real culprit is the raw-ESM `@lhh010/dsh-profiles/lib/client.js` failing the whole classic-script combo at compile (position 1:1 = the `import` token) | Ship the `window.__ModuleLoader__.load({ id, factory })` classic wrapper; React via factory `require`; factory returns `module.exports` with `apply` |
| 2 | Apply-time: `slot "settings.section" is not declared` | Bare `ctx.slots.register` into a parent-owned slot, with over-reaching `kind`/`scope` fields | `ctx.slots.inject("settings.section", () => ctx.slots.register({ name, id, order }, C))`; pass only `name`/`id`/`order`(`label`), never `kind`/`scope` |
| 3 | Every edit needed a host restart; one restart hit EADDRINUSE | Combo is composed once at boot from a boot-time snapshot; closing the terminal orphaned the Windows node process still holding the port | Full stop → verify tree gone (`taskkill /PID <pid> /T /F`) → restart → hard refresh → check plugin list |
