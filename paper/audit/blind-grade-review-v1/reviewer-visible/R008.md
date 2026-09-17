# S17 · Diagnostic Report — The External UI Plugin Onboarding Trap

Scope: read-only analysis of the evidence pack under `.../environment/fixture/` (unmodified).
Method: plugin-upgrade skill (Mode A · inspect — read-only investigation and report), grounded in
the fixture files and the skill's troubleshooting table plus version cards
(DSH-0.1.2-A1-25/A1-26, DSH-0.1.5-A1-20, DSH-0.1.1-R1-01/03).

---

## 1 · Failure 1 root cause — one bad client bundle takes down EVERY plugin's registration

**Evidence.** `browser-error.txt`:

> `Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry): client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`

Note the error itself names BOTH the entry it was importing (`@deepseek-ai/dsh-typert-registry`) and the bundle that failed to compile (`/plugins/@lhh010/dsh-profiles/lib/client.js`) — the user's own plugin. `host-boot-log.txt` confirms what the host builds:

> `[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)`

**Mechanism.** The host does not serve each plugin's `client.js` separately. At boot, the client-modules assembler reads every installed plugin's client bundle (every package declaring `dsh.client`, per card DSH-0.1.1-R1-03) and **concatenates them into one combined "combo" artifact served as a single classic `<script>`**. The browser then evaluates this one script; the loader entries it contains are awaited/registered in order — `dsh-typert-registry` is merely the first entry whose import the loader reported while the combo died.

Because it is a **classic script, not a module**, the combo is parsed as a whole: any top-level ESM token is a parse/compile error for the entire script. The new plugin's `plugin/lib/client.js` begins:

```js
import React from 'react'
import { createPortal } from 'react-dom'
```

That `import` at line 1, column 1 (`position 1:1` in the error) makes the whole 4.5 MB combo fail to compile. Nothing in the combo executes, so **zero** loader entries register — which is exactly what the user saw: "Settings → Plugins → Plugin list: EMPTY. Zero entries registered", including the two previously working stock plugins (brand version, file tracking). The blast radius is the whole combo, not the offending plugin.

**Why `dsh-typert-registry` is named though innocent.** The error message pattern `failed to import loader entry <id>` reports the entry the loader was importing/awaiting when the combo compile failed — the first entry in the awaited sequence (a stock host package the user never touched). The real attribution signal is the second clause: `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error`, which names the actual offending artifact. Card DSH-0.1.5-A1-20 records the same whole-combo failure family: "one dropped module fails every client plugin's registration."

## 2 · Diagnosis discipline — locating the culprit and the correct bundle format

**How to bisect despite the misleading error.** The named entry (`dsh-typert-registry`) is a stock host package; never start there. The error text already points at the failing *bundle path* — the culprit is whichever recently inserted plugin owns it. The systematic method (per the skill's troubleshooting row "Browser: `Failed to load plugins: failed to import loader entry <id>`, then **zero** plugins register"):

1. **Bisect the profile patch layer's `insert` rows.** `profile/cordis.patch.yml` has exactly three inserts: `dsh-brand-version`, `dsh-file-trace`, `dsh-profiles`. Remove/disable the newest row (`dsh-profiles`), restart, and observe: the combo compiles and all other plugins return. Re-add to confirm reproducibility. With more rows, bisect halve-by-halve.
2. **Cheap static check that flags the offending bundle:** grep the suspect `lib/client.js` for top-level ESM tokens — `^import\b` / `^export\b` at file scope. `plugin/lib/client.js` fails instantly: line 1 is `import React from 'react'`. A conforming bundle contains neither; it is a classic script whose only entry point is a `window.__ModuleLoader__.load({ ... })` call. (Equivalently: fetch the combo URL `/plugins/??<pkg>/client.js&rev=...` per DSH-0.1.2-A1-26's verification recipe and check for ESM tokens.) The working excerpt (`working-plugin-excerpt.txt`) contains no `import`/`export` statements — comparison makes the deviation obvious in seconds.

**The client-bundle format an external plugin must ship.** Per the working excerpt and card DSH-0.1.2-A1-26, the client half is an IIFE-style classic script that registers through the module loader:

- **Wrapper:** the entire bundle is one call `window.__ModuleLoader__.load({ id, factory })`, where `id` MUST equal the package.json `name` (here it must be `'@lhh010/dsh-profiles'` — card A1-26: "registration id == package.json name"; the insert row's `name` must be the same bare scoped name, which `cordis.patch.yml` already does: `name: '@lhh010/dsh-profiles'`).
- **How React is obtained:** not via `import`, but through the loader's CommonJS-style `require` *inside the factory*: `factory: (require) => { let react_jsx_runtime = require("react/jsx-runtime"); ... }`. The working plugin also requires host primitives the same way (`require("@deepseek-ai/dsh-client-ui-primitives")`). No DOM side effects at module top level either — the offender's `document.createElement`/`document.body.appendChild` at file scope is another smell; work belongs in `apply(ctx)`.
- **What the factory must export/return:** build a `module = { exports: {} }` shell inside the factory (as the working excerpt does) and return it (`return module.exports`), with the plugin's `apply(ctx)` (and `inject`) on those exports. The host later applies this export as the plugin's client entry.

So the user's bundle should have been produced by a bundler (e.g. tsdown/rollup, format iife/cjs with the `__ModuleLoader__.load` banner injecting `PLUGIN_ID`), never hand-written raw ESM.

## 3 · Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

**Evidence.** `plugin-apply-error.txt` (second boot, after repackaging fixed failure 1):

> `failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared (a parent entry's children table must declare it)`

Note: "All other plugins load and render normally on this boot" — the packaging fix worked; this is now a single-plugin apply-time error, confined to the offender.

**Who declares slots.** A slot name is **declared by the entry that owns it** (the parent entry, e.g. the settings UI host plugin owns `settings.section`) in its own children table. Other entries may only *occupy* a declared slot.

**Why bare registration fails.** The user's repackaged bundle still does:

```js
ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' }, ProfilesSection)
```

A bare `ctx.slots.register` of another entry's slot is applied immediately — but apply order between loader entries is undefined, so the registration can execute **before the owner's declaration exists**, and the host fails closed with the quoted error rather than silently dropping the UI. (The troubleshooting table lists this exact symptom and resolution.)

**The correct wrapping form.** Defer the registration until the parent's declaration is visible, with `ctx.slots.inject`:

```js
ctx.slots.inject('settings.section', () => ctx.slots.register(...))
```

The inject wrapper registers a dependency on the declared slot and runs the callback once the parent entry has declared it, making ordering safe.

**Allowed vs forbidden fields.** The registrant passes only placement/identity fields: `name`, `id`, `order` (and `label`). It must **not** pass the owner-owned schema fields `kind` and `scope` — the offender passes `kind: 'section', scope: 'settings'`, both of which belong to the declaring parent's children-table entry, not to the occupier. (The user's bundle also fails the wrapper contract structurally: `apply` was an ESM `export function` instead of a property of the factory-returned `module.exports`.)

## 4 · Dev-loop discipline — boot-assembled combo and the Windows restart trap

**Why edits do nothing until host restart.** Per `host-boot-log.txt` and `restart-notes.txt` item 1: combo assembly happens **once at host boot** — the host reads every installed plugin's client bundle from disk, concatenates them into the one classic-script combo (53 entries, 4.5 MB), and serves that artifact. Editing a plugin file afterwards changes nothing in the browser, "even after a hard refresh", because the browser keeps receiving the already-composed artifact; there is no per-file or per-request re-assembly on the client path. The correct loop is: **edit → fully stop the host → start the host (combo recomposed) → browser hard refresh → verify Settings → Plugins → Plugin list is non-empty** (empty list = the combo failed again, per `restart-notes.txt` item 3).

**Why the restart died with EADDRINUSE.** Per `restart-notes.txt` item 2: on Windows, stopping the host by merely closing the launching terminal left the host's node process alive (the terminal closing does not terminate the child process tree). The orphaned process still held the listening port, so the next boot failed with `EADDRINUSE`. Only killing the entire process tree freed the port:

```
taskkill /PID <pid> /T /F
```

after which the next boot bound normally. (Skill-side corroborating discipline: a running host holds locks on its own process tree; "a browser refresh is not a host stop" — stop must be verified at the process level, not assumed from the terminal.)

## 5 · Prevention

**Host-side — name the culprit, not the first awaited entry.**

- At combo-compile time, wrap the per-bundle concatenation/compile so a failure is attributed to the owning package before entry awaiting begins: report `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` as the *primary* error with the offending package id (`@lhh010/dsh-profiles`), and only mention the awaited entry as context. The information already exists in the message — the host just leads with the wrong half.
- Better: a cheap **startup pre-validation pass** — after scanning `dsh.client` packages (DSH-0.1.1-R1-03) and before composing, parse/compile each candidate bundle standalone (classic-script mode); reject any bundle containing top-level `import`/`export` with a message naming the package and the fix ("ship an iife/cjs bundle registering via `window.__ModuleLoader__.load({ id: <package.json name>, factory })`, `require('react')` inside the factory").
- For slot errors, include the declaring-owner hint in the message: which entry owns `settings.section` and that `ctx.slots.inject('<name>', () => ...)` is the required wrapper; also reject owner-owned fields (`kind`/`scope`) from occupiers with a field-level message.
- Combo-failure resilience: fail the offending entry only where feasible, or at minimum keep previous-combo rollback (the A1-20 field note shows a restart self-heals roster/combo mismatch — an automatic stale-combo fallback would keep stock plugins rendering while naming the broken one).

**Authoring template / checklist for external UI plugin onboarding** (each item maps to one of the three failures):

1. **Bundle format (Failure 1):** never hand-write ESM. Ship a bundler-built iife/classic bundle whose entire body is `window.__ModuleLoader__.load({ id: "<package.json name>", factory: (require) => { ...; return module.exports; } })`; get React via `require("react/jsx-runtime")` (or `require("react")`) inside the factory; no top-level `import`/`export`, no top-level DOM side effects. Pre-ship check: `grep -E "^(import|export)\b" lib/client.js` must return nothing; the `load` id must equal the package name (DSH-0.1.2-A1-26's three-ids-agree rule: registration id == package.json name == insert row's bare scoped `name`).
2. **Slot registration (Failure 2):** register only into slots another entry declares via the deferred wrapper `ctx.slots.inject("<owner slot>", () => ctx.slots.register(...))`; pass only `name`/`id`/`order`/`label`; never `kind`/`scope` (owner-owned).
3. **Installation:** exactly one mechanism — directory linked into the profile's `node_modules` **plus** one `insert` row whose `name` is the bare package name (the fixture's `cordis.patch.yml` row for `dsh-profiles` is correct); never duplicate an id a bundle layer already provides (duplicate-insert boots fatal, per troubleshooting).
4. **Dev loop (Failure 3):** every plugin file edit requires a full host stop/start (combo is boot-assembled) then a browser hard refresh; on Windows, stop means the process tree is gone — verify no node process still holds the port, otherwise `taskkill /PID <pid> /T /F` before relaunching; treat `EADDRINUSE` on the next boot as an orphaned previous host, never as a config problem.
5. **Verification after each boot:** Plugin list non-empty (combo compiled), no `failed to apply loader entry` in the host log (apply succeeded), and the plugin's UI section actually renders.
