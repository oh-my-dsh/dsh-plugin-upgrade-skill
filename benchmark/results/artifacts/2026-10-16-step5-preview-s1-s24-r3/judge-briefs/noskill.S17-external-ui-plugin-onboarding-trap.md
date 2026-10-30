# JUDGE BRIEF · noskill.S17-external-ui-plugin-onboarding-trap

## Criteria (sealed rubric)
- [whole-combo-attribution] (20pt) Connect plugin/lib/client.js’s top-level ESM import with host-boot-log.txt’s classic-script combo and browser-error.txt’s compile failure: one syntax error prevents the whole combo compiling, so no entries register. The named stock typert-registry entry is the first awaited victim, not the faulty bundle. Do not infer that raw ESM is invalid in every JavaScript loading context.
- [diagnosis-and-packaging] (20pt) Bisect the profile insert rows to isolate the offending bundle and parse it as a classic script (vm.Script or equivalent; node --check alone can accept ESM and is insufficient). Describe a host ModuleLoader.load({id, factory}) bundle, package-name identity, host-provided React through require inside the factory, and inject/apply exports. Equivalent variable names and wrapper implementations are valid; do not require exact formatting or the elided bodies in working-plugin-excerpt.txt.
- [cross-entry-slot-registration] (20pt) Use plugin-apply-error.txt and the bare settings.section registration to explain that another entry owns the declaration and apply ordering is not guaranteed. Show or precisely describe ctx.slots.inject("settings.section", () => ctx.slots.register(...)) so registration waits for the declaration. Registrants supply name/id/order (optional label), not declaration-owned kind/scope. A block callback returning the registration or equivalent supported deferred form is valid; a bare mention of slots.inject is insufficient.
- [boot-restart-discipline] (20pt) Use host-boot-log.txt/restart-notes.txt: this host assembles the combo once at boot, so file edits and browser refresh do not rebuild it. Fully stop/restart the host for each iteration, kill the old Windows process tree if it retains the port (taskkill /PID <pid> /T /F or equivalent), then refresh and verify plugin registration. Explain EADDRINUSE as the old process retaining the port, not a new plugin packaging defect.
- [host-and-author-prevention] (20pt) Propose per-plugin classic-script validation and culprit attribution at startup/combo failure instead of blaming the first awaited entry. Give an authoring template/checklist covering loader factory, host React and inject/apply, deferred cross-entry slots, and host restart/Windows tree cleanup. A generic “add tests” or card list without these prevention measures is incomplete.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [contradictory-operational-advice] ceiling=0 The report recommends keeping bare top-level ESM in this classic combo, omitting/removing slots.inject in favor of immediate cross-entry registration, setting kind/scope on the registrant, or relying on HMR/browser refresh instead of the required host restart. These contradict the central incident contracts. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S17-external-ui-plugin-onboarding-trap/S17-external-ui-plugin-onboarding-trap.md

# S17 · The External UI Plugin Onboarding Trap — Incident Report

**Scope note.** This report is derived solely from the static evidence pack in
`fixture/` (read-only, unchanged): `browser-error.txt`, `host-boot-log.txt`,
`plugin-apply-error.txt`, `restart-notes.txt`, `working-plugin-excerpt.txt`,
`plugin/lib/client.js`, and `profile/cordis.patch.yml`. No host process was
executed and nothing outside the fixture was read. Where the evidence pack is
redacted (the working plugin's component bodies and its `ctx.slots.inject(...)`
call arguments are elided), the report says so explicitly instead of guessing
internals.

**The one-line story.** The user hand-wrote the client bundle of
`@lhh010/dsh-profiles` as a bare ES module. The host serves *all* plugins as one
boot-assembled classic script, so one bad bundle killed all 53 entries; the
loader blamed the entry it happened to be importing (a stock package), not the
file that failed. Repackaging into the correct ModuleLoader wrapper fixed the
combo and exposed the second, independent defect: a bare `ctx.slots.register`
of a slot owned by a parent entry's children table. Both were authoring-contract
violations; the dev loop then punished every edit with a full host restart, and
on Windows a restart died with `EADDRINUSE` until the orphaned process tree was
force-killed.

---

## 1. Failure 1 — one plugin's client bundle took down EVERY plugin's registration

### 1.1 What the host actually assembles, and in what form it reaches the browser

From `host-boot-log.txt`:

```
[boot] cordis patch layer: 3 insert rows resolved (dsh-brand-version, dsh-file-trace, dsh-profiles)
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
[boot] web profile ready
```

At host boot the `client-modules` layer:

1. takes every installed plugin's client bundle — for the new plugin that is
   `/plugins/@lhh010/dsh-profiles/lib/client.js`, the file the user hand-wrote —
   together with the host's own built-in client modules (the 53 loader entries
   are far more than the 3 patch rows: the stock entries such as
   `@deepseek-ai/dsh-typert-registry`, the settings host, the UI primitives,
   etc. come from the host itself);
2. **composes them into ONE client bundle combo** — a single 4.5 MB artifact;
3. serves it to the browser as a **classic script** (a plain `<script>`, *not*
   `<script type="module">`, not 53 separate files).

In the browser that one script runs top to bottom. A well-formed entry's
contribution is a `window.__ModuleLoader__.load({ id, factory })` call (see
`working-plugin-excerpt.txt`); the loader registers the entry (keyed by a hash
such as `0c013085`) and later imports it — invoking `factory(require)` — and
finally applies it.

**The critical structural fact: the combo is a single classic script.**
Everything is concatenated into one artifact, so every plugin's registration
depends on the whole artifact parsing.

### 1.2 Why a top-level ESM `import` is fatal to the whole combo

`plugin/lib/client.js` line 1 is:

```js
import React from 'react'
```

`import`/`export` declarations are only legal inside an ES module. The combo is
delivered as a **classic script**, where a top-level `import` statement is an
immediate `SyntaxError` — and the error position is exactly `1:1`, the very
first character of the file, which is precisely where that `import` keyword
sits. The error in `browser-error.txt` confirms this:

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
  client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

Because a classic script is **all-or-nothing at parse time**, the syntax error
aborts the *entire* 4.5 MB script — not just the offending entry. Not one of the
53 `window.__ModuleLoader__.load(...)` calls ever executes. With zero entries
registered, the loader has nothing to import, `Settings → Plugins → Plugin list`
renders **empty**, and the two stock plugins that "rendered fine before the
insert are gone from the header as well" (`browser-error.txt`). That is the
whole-combo blast radius: **one plugin's bundle took down every plugin's
registration because registration happens by evaluating one shared script.**

### 1.3 Why the error named `dsh-typert-registry` even though that entry is innocent

Read the error as two nested frames:

- **Outer frame (the cursor):** `failed to import loader entry 0c013085
  (@deepseek-ai/dsh-typert-registry)` — this names the loader entry whose
  *import was in progress* when the failure surfaced. It is a position in the
  loader's import loop, not an accusation. `@deepseek-ai/dsh-typert-registry` is
  a stock host package the user never touched (stated in `browser-error.txt`).
- **Inner frame (the culprit):** `client-modules: bundle
  /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` —
  this names the file that actually failed to compile, and the position inside
  *that file* (line 1, column 1 = the `import React from 'react'` line).

The misdirection is purely an attribution artifact of the import loop: the
compile error is raised by the `client-modules` layer while the loader is
importing some entry, and the loop wraps it with the entry it was importing.
The named entry and the failing bundle are different things, and only the
latter is guilty. The tell that the named entry is innocent: it is a stock host
package, and the user's only change since the last good boot was inserting the
`dsh-profiles` patch row (`profile/cordis.patch.yml`).

---

## 2. Diagnosis discipline

### 2.1 How the culprit should have been located from the misleading error

1. **Read the whole error, including the nested clause.** The outer frame names
   a stock entry; the inner frame names `/plugins/@lhh010/dsh-profiles/lib/client.js`
   with `position 1:1`. The file path *and* the position are already in the
   message — the culprit is identified, you just have to read past the entry
   name. Never stop at the first identifier in a loader error.
2. **Correlate with the last change.** The only delta since the last good boot is
   the `dsh-profiles` insert row in `profile/cordis.patch.yml`. Change
   correlation makes it the prime suspect before any deep debugging.
3. **Open the suspect bundle and look at the reported position.** Line 1 column
   1 is `import React from 'react'` — a top-level ESM import, illegal in the
   classic-script combo. Root cause confirmed in seconds.
4. **If the error had NOT named the file**, bisect the all-or-nothing combo:
   remove insert rows one at a time (newest first — here, `dsh-profiles`) or
   temporarily stub each bundle to a no-op `load()` call, rebooting after each
   removal, until the combo compiles again; the last removed row is the culprit.
   With 53 entries in one script, per-row bisection is the only cheap
   divide-and-conquer available.
5. **Confirm by comparison.** Diff the packaging shell of the suspect against
   `working-plugin-excerpt.txt` — the missing `window.__ModuleLoader__.load({...})`
   wrapper is immediately visible.

### 2.2 The cheap static check that flags the offending bundle

Any of these, run on `plugin/lib/client.js` before booting:

- **Top-level ESM scan:** `grep -nE '^\s*(import|export)[ {*]' lib/client.js`
  — any hit is fatal for a client bundle, because the combo is a classic script.
- **Parse-as-classic-script check:** compile the source in script (non-module)
  mode, e.g. `node -e "new Function(require('fs').readFileSync('lib/client.js','utf8'))"`
  — it throws (`Cannot use import statement outside a module` /
  `Unexpected token 'export'`) exactly the way the host's `client-modules`
  compiler did at `1:1`. (`node --check` on the file works too, provided the
  package is not `"type": "module"`.)
- **Structural head check:** the first statement of the bundle must be
  `window.__ModuleLoader__.load({`. If it is anything else — `import`, `const`,
  `export` — the bundle is not in the shipping format.

### 2.3 The client-bundle format an external plugin must ship instead of bare ESM

From `working-plugin-excerpt.txt`, the packaging shell of a working plugin is:

```js
window.__ModuleLoader__.load({
  id: "@local/dsh-brand-version",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");
    let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    /* ... component definitions elided ... */
    const inject = ["slots"];
    function apply(ctx) {
      /* ... ctx.slots.inject(...) calls elided ... */
    }
    return module.exports;
  },
});
```

The contract, item by item:

- **What wraps the code:** the bundle is *not* a module. It is a classic-script
  fragment whose top-level statement is `window.__ModuleLoader__.load({ id, factory })`.
  The `id` is the plugin's module id and matches the patch row's `name`
  (`@local/dsh-brand-version` ↔ `name: '@local/dsh-brand-version'` in the patch;
  the profiles plugin's id must therefore be `@lhh010/dsh-profiles`).
- **The factory:** `factory: (require) => { ... }` is a CommonJS-style factory.
  Inside it, `var module = { exports: {} }` / `var exports = module.exports` are
  initialized and tagged (`Object.defineProperty(exports, Symbol.toStringTag,
  { value: "Module" })`). All module code lives *inside* this closure — no
  top-level `import`/`export`, and no top-level side effects.
- **How React is obtained:** through the factory's injected `require` argument —
  `require("react/jsx-runtime")` in the working plugin, plus
  `require("@deepseek-ai/dsh-client-ui-primitives")` for host UI primitives.
  Dependencies are resolved by the ModuleLoader against the host's shared
  bundle, so every plugin shares one React instance. **Never** obtain React via
  a top-level `import React from 'react'` — that is the failure-1 bug.
- **What the wrapper must export:** the factory `return module.exports`, and the
  plugin's contract must be attached to that exports object so the loader can
  invoke it — the apply hook `apply(ctx)` (called by the loader with the plugin
  context at apply time, where `ctx.slots.inject(...)` calls live) and the
  injection declaration `const inject = ["slots"]` (which tells the loader this
  entry injects into the slots system). A bare ESM `export function apply(ctx)`
  never reaches the browser at all: the classic-script combo cannot even parse
  it. (The excerpt elides the exact `module.exports` attachment lines and the
  `ctx.slots.inject(...)` arguments; the observable contract is that the loader
  drives `apply` and `inject` from the module the factory returns.)
- **No module-scope side effects.** The failing bundle also does
  `document.createElement('div')`, `document.body.appendChild(host)` and
  `createPortal(...)` at top level. In the shipping format, DOM work belongs
  inside `apply(ctx)` (driven by the injected slot), not at load time.

---

## 3. Failure 2 — `slot "settings.section" is not declared`

After repackaging (failure 1 fixed), the second boot failed at apply time
(`plugin-apply-error.txt`):

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared (a parent entry's children table must declare it)
```

All other plugins loaded and rendered normally on this boot — the failure is now
per-entry, not combo-wide, because the combo compiles.

### 3.1 What the message means

Slots are a declared tree, not a free-form namespace. **The parent entry that
owns a container declares its child slots in its children table** — the slot
name, and its declaration-level metadata, belong to that parent. The profiles
plugin's code did:

```js
export function apply(ctx) {
  ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
    ProfilesSection,
  )
}
```

A bare `ctx.slots.register` with a full slot descriptor tries to *declare/claim*
the slot `settings.section` — a slot that belongs to the settings host entry's
children table and that no parent entry declared on this boot. At apply time the
loader resolves registrations against the declared slot tree, finds no
declaration for `settings.section`, and rejects the entry.

### 3.2 Why a bare registration of another entry's slot fails at apply time

- **Who declares slots:** the parent entry (here, the settings host entry that
  renders the settings sections container) declares its children — including
  `settings.section` — in its children table.
- **Why `register` fails:** registration is not a way to invent a slot in someone
  else's namespace. The registrant does not own the name `settings.section`, so
  the loader refuses it at apply time with the declaration requirement spelled
  out in the message. The failure is correctly attributed to the registrant
  (`@lhh010/dsh-profiles`) — unlike failure 1's cursor attribution — and it is
  contained to that one entry, which is why the other plugins still rendered.
- **Why it appeared only after repackaging:** the two failures are layered.
  Before repackaging the combo never compiled, so apply time was never reached;
  fixing the packaging exposed the next, independent defect. Fix one layer,
  reboot, and the next layer surfaces.

### 3.3 The exact wrapping form the registration must use

The registration must use the **inject wrapper**, exactly as the working plugin
does (`working-plugin-excerpt.txt`):

- the factory declares `const inject = ["slots"]` — announcing that the entry
  injects into the slots system;
- inside `apply(ctx)`, the call is `ctx.slots.inject(...)` — attaching the
  plugin's component to the parent-declared slot — **not** `ctx.slots.register`
  with a slot descriptor.

In shape, the corrected registration injects into the declared slot and passes
only registrant-owned fields, e.g.

```js
function apply(ctx) {
  ctx.slots.inject('settings.section', { id: 'profiles-manager', order: 5 }, ProfilesSection)
}
```

(The excerpt elides the exact `ctx.slots.inject(...)` arguments, so the precise
argument order should be copied from a working plugin or the host docs; the
non-negotiable part evidenced by the pack is *inject-into-a-declared-slot* via
the `inject = ["slots"]` wrapper, in contrast to *declare-a-slot* via bare
`register`.)

### 3.4 Which fields a registrant may pass, and which it must not

The split is parent-declaration vs. registrant-placement:

- **May pass (registrant-owned):** `id` (the registrant's own identity, e.g.
  `'profiles-manager'`) and `order` (its position among the slot's registrants).
- **Must not pass (parent-declaration fields):** `name` (the slot name — owned by
  the parent entry's children table), `kind` and `scope` (declaration-level
  metadata of the slot, likewise owned by the declarer).

The failing call passed all five — `name`, `id`, `order`, `kind`, `scope` — and
the three declaration fields are precisely what a registrant has no right to
supply. That is the concrete content of "a parent entry's children table must
declare it".

---

## 4. Dev-loop discipline

### 4.1 Why the client bundle combo is not rebuilt when plugin files change

Combo assembly happens **once, at host boot**: the host reads every installed
plugin's client bundle, concatenates them into the single classic script, and
serves that (`host-boot-log.txt`: "The combo line appears ONCE per boot";
`restart-notes.txt`: "the host reads every installed plugin's client bundle,
concatenates them into one classic script, and serves that. Editing a plugin
file on disk afterwards has NO effect in the browser, even after a hard
refresh"). There is no file watcher and no incremental rebuild for plugin client
bundles — the browser is served the artifact the host assembled at boot, so a
hard refresh re-requests the same stale combo. Every plugin edit therefore
requires a host process restart.

### 4.2 The correct restart procedure

1. **Fully stop the host process** — not merely closing the launching terminal
   (see 4.3). On Windows, kill the whole process tree:
   `taskkill /PID <pid> /T /F`.
2. Optionally verify the listening port is free before rebooting.
3. **Start the host again** and wait for `[boot] web profile ready`.
4. **Hard-refresh the browser** (Ctrl+Shift+R) to drop any cached combo.
5. **Check `Settings → Plugins → Plugin list`** — an empty list means the combo
   failed again; go read the boot log for the named culprit bundle and position
   (`restart-notes.txt`, point 3).

### 4.3 Why the Windows restart died with EADDRINUSE until the tree was force-killed

On Windows, closing the launching terminal does **not** terminate the host's
node process — there is no signal delivered to a detached console process the
way a POSIX terminal would send one, and any worker/child processes the host
spawned are likewise unaffected. The previous host therefore survived as an
**orphaned process tree still holding the listening port**. The next host boot
tried to bind that same port and died with `EADDRINUSE` (`restart-notes.txt`,
point 2; `host-boot-log.txt`: "the previous host's node process was still alive
holding the port. The old process only went away after killing the whole process
tree (`taskkill /PID <pid> /T /F`); the next boot then bound normally").

Two details matter: the socket can be held by a *child* of the process the user
sees, so killing only the visible parent is not enough — hence `/T` (kill the
whole tree); and the process was unresponsive to ordinary termination, hence
`/F` (force). This is a Windows-specific dev-loop discipline: stop the host by
killing its process tree, never by closing the terminal window.

---

## 5. Prevention

### 5.1 What the HOST could do

At startup / combo-assembly time:

1. **Per-entry compile validation before composing.** Compile each bundle
   independently in classic-script mode (the same check as 2.2) while assembling
   the combo, and log per-entry results:
   `[boot] client-modules: entry @lhh010/dsh-profiles (lib/client.js) compile error at 1:1: unexpected 'import' — expected classic script starting with window.__ModuleLoader__.load({`.
   Fail the boot (or skip the entry) naming the plugin, its bundle path, its
   patch-row id (`dsh-profiles`), and the position.
2. **Fix the attribution in the import loop.** Wrap each entry's import in its
   own try/catch and report the entry that *actually* failed (id, hash, source
   file) — not the entry whose import happened to be in flight. The inner
   `client-modules` clause already carries the true file and position; the outer
   frame should carry the same identity instead of the cursor. The current
   message shape (`failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)`)
   is what sent the user hunting through stock packages.
3. **Map positions back to plugins and print a source snippet.** Translate
   `position 1:1` into `lib/client.js:1` plus the offending line
   (`import React from 'react'`), so the error is self-explanatory without
   opening the file.
4. **Consider graceful degradation instead of all-or-nothing.** At minimum,
   when one bundle fails, the message should say so explicitly ("1 of 53 entries
   failed; the combo is a single classic script, so nothing registered");
   ideally, register the healthy entries and report the broken one, so a single
   bad third-party plugin cannot blank the whole UI.
5. **Validate slot registrations against the declared tree with actionable
   output.** The apply-time error already names the registrant correctly; it
   should additionally list which parent entry declares `settings.section` (or
   the set of declared slot names) and hint at the inject wrapper
   (`ctx.slots.inject`, `inject = ["slots"]`) instead of bare `register`.
6. **Emit the entry manifest at boot.** Log the 53 composed entries (id, hash,
   source path) so any later error naming a hash or entry can be resolved to a
   plugin directory immediately.

### 5.2 What an external-plugin authoring template / checklist should contain

**Packaging (prevents failure 1):**

- [ ] `lib/client.js` is a **classic script** whose first statement is
      `window.__ModuleLoader__.load({ id: "<name matching the patch row>", factory: (require) => { ... } })`.
- [ ] **No top-level `import`/`export` anywhere** in the bundle (the combo is one
      classic script; one hit kills all plugins).
- [ ] Inside the factory: `var module = { exports: {} }; var exports = module.exports;`
      plus the `Symbol.toStringTag` tagging; all code inside the closure.
- [ ] **All dependencies via the injected `require`** — `require("react/jsx-runtime")`,
      `require("@deepseek-ai/dsh-client-ui-primitives")` — never ESM imports;
      this is also what guarantees a single shared React instance.
- [ ] The factory returns `module.exports` with the plugin contract attached —
      `apply(ctx)` and the `inject` declaration — so the loader can invoke them.
- [ ] **No module-scope side effects** (no `document.body.appendChild`, no
      top-level `createPortal`); DOM work happens inside `apply(ctx)`.
- [ ] Pre-publish static check passes: classic-script parse
      (`new Function(source)` / `node --check` in CJS mode), no top-level
      `import`/`export`, head statement is the `load({...})` wrapper, packaging
      shell diffed against a known-working plugin.

**Slot usage (prevents failure 2):**

- [ ] Declare `const inject = ["slots"]` when the plugin injects into slots.
- [ ] Register **via the inject wrapper** `ctx.slots.inject(...)` into a
      parent-declared slot — never a bare `ctx.slots.register` with a slot
      descriptor for a slot you do not own.
- [ ] Pass only registrant-owned fields (`id`, `order`); never `name`, `kind`,
      `scope` — those belong to the parent entry's children table.

**Dev loop (prevents the restart pain):**

- [ ] After every plugin edit: **fully restart the host** (the combo is
      assembled once per boot; file edits and hard refreshes change nothing
      until then).
- [ ] On Windows, stop the host by killing the **process tree**
      (`taskkill /PID <pid> /T /F`) — closing the terminal orphans the node
      process and the next boot dies with `EADDRINUSE`.
- [ ] After restart: hard-refresh, then check `Settings → Plugins → Plugin
      list`; empty list = combo failed → read the boot log for the named
      culprit bundle and position.

---

## 6. Corrected bundle sketch (illustrating the full contract)

Applying sections 2.3 and 3.3–3.4 to the user's plugin (component bodies kept
close to the original; the `ctx.slots.inject` argument order is the one place
the evidence pack elides, and should be confirmed against a working plugin or
the host docs):

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react_jsx_runtime = require("react/jsx-runtime");

    const PROFILES = [
      { id: 'web', label: 'Web', engine: 'dsh' },
      { id: 'cli', label: 'CLI', engine: 'dsh' },
    ];

    function ProfilesSection() {
      return react_jsx_runtime.jsx('div', { className: 'profiles-section', children: [
        react_jsx_runtime.jsx('h3', { children: 'DSH Profiles', key: 'h' }),
        ...PROFILES.map(p => react_jsx_runtime.jsx('div', { children: p.label, key: p.id })),
      ]});
    }

    const inject = ["slots"];

    function apply(ctx) {
      ctx.slots.inject('settings.section', { id: 'profiles-manager', order: 5 }, ProfilesSection);
    }

    module.exports.apply = apply;   // attach the contract so the loader can drive it
    module.exports.inject = inject;
    return module.exports;
  },
});
```

What changed relative to the user's original, and why:

| Original defect | Fix | Failure prevented |
| --- | --- | --- |
| `import React from 'react'` / `import { createPortal } from 'react-dom'` at top level (bare ESM) | `window.__ModuleLoader__.load({ id, factory })` classic-script wrapper; React via `require("react/jsx-runtime")` | Failure 1 — whole-combo classic-script compile error at 1:1 |
| `export function apply(ctx)` (ESM export) | `function apply(ctx)` attached to `module.exports`, factory returns `module.exports` | Failure 1 — the contract never reaches the browser |
| Top-level `document.createElement` / `appendChild` / `createPortal` side effects | DOM rendering driven by the injected slot component inside `apply` | Load-time side effects in a shared combo |
| `ctx.slots.register({ name: 'settings.section', id, order, kind, scope }, ...)` — declaring another entry's slot | `const inject = ["slots"]` + `ctx.slots.inject('settings.section', { id, order }, ...)` — registrant-owned fields only | Failure 2 — `slot "settings.section" is not declared` |

---

## 7. Summary of root causes

1. **Failure 1 (all plugins dead, misleading entry name):** the host composes
   every installed plugin's client bundle into **one classic script served at
   boot**; the new plugin's bundle was bare ESM with a top-level `import`, which
   is a parse error at `1:1` that aborts the entire script, so zero of the 53
   loader entries registered. The loader blamed the entry it was importing
   (`@deepseek-ai/dsh-typert-registry`, a stock package) — an import-cursor
   artifact — while the nested `client-modules` clause named the true culprit,
   `/plugins/@lhh010/dsh-profiles/lib/client.js`.
2. **Failure 2 (apply-time slot error):** after the packaging was fixed, the
   plugin's bare `ctx.slots.register` tried to declare a slot
   (`settings.section`) owned by a parent entry's children table, passing
   declaration fields (`name`, `kind`, `scope`) a registrant must not pass. The
   registration must be wrapped as an injection (`const inject = ["slots"]` +
   `ctx.slots.inject(...)`) carrying only registrant-owned fields (`id`,
   `order`).
3. **Dev-loop pain:** the combo is assembled once per boot, so every edit needs
   a full host restart; on Windows, closing the terminal orphans the node
   process tree holding the port, so the next boot dies with `EADDRINUSE` until
   `taskkill /PID <pid> /T /F` frees it.
4. **Prevention:** host-side per-entry compile validation and correct
   failure attribution (plus actionable slot-declaration errors) at
   boot/apply time; authoring-side a template/checklist covering the
   ModuleLoader classic-script wrapper, `require`-based dependencies, the
   `apply`/`inject` export contract, inject-only slot registration, and the
   restart discipline.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.