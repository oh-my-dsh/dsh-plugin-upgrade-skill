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

# S17 · External UI Plugin Onboarding Trap — Incident Report

**Scope.** Analysis of the evidence pack in `fixture/` (read-only; unchanged):
`browser-error.txt`, `host-boot-log.txt`, `plugin/lib/client.js`, `plugin-apply-error.txt`,
`profile/cordis.patch.yml`, `restart-notes.txt`, `working-plugin-excerpt.txt`. All conclusions
below are grounded in those files; where the fixture is deliberately elided (the working
plugin's `ctx.slots.inject(...)` call bodies), the structural contract is inferred from the
error text and the surviving packaging shell, and that is flagged explicitly.

---

## 0. The installation, for reference

The plugin was onboarded "the usual community way" — nothing exotic:

- the plugin directory linked into the web profile's `node_modules`
  (`/plugins/@lhh010/dsh-profiles/`), with its client bundle at `plugin/lib/client.js`;
- one `insert` row in the profile's patch file (`profile/cordis.patch.yml`):

```yaml
- insert:
    - id: dsh-profiles
      name: '@lhh010/dsh-profiles'
```

- the boot log confirms the patch layer accepted it:
  `[boot] cordis patch layer: 3 insert rows resolved (dsh-brand-version, dsh-file-trace, dsh-profiles)`.

So the install mechanism was fine. All three failures are **packaging-contract** failures of
the external client bundle, plus a dev-loop/restart discipline failure.

---

## 1. Failure 1 — one bundle's top-level `import` took down every plugin

### 1.1 What actually happened

The offending bundle (`plugin/lib/client.js`) is **bare ESM**, not a host client bundle:

```js
import React from 'react'            // line 1 — top-level ESM import
import { createPortal } from 'react-dom'
...
export function apply(ctx) { ... }   // top-level ESM export
```

A stock, working bundle from the same profile (`working-plugin-excerpt.txt`) has a completely
different shape — it is a self-registering ModuleLoader bundle:

```js
window.__ModuleLoader__.load({
  id: "@local/dsh-brand-version",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");
    let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const inject = ["slots"];
    function apply(ctx) { /* ctx.slots.inject(...) */ }
    return module.exports;
  },
});
```

### 1.2 What the host assembles from the bundles, and in what form it reaches the browser

From `host-boot-log.txt`:

> `[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)`

At **host boot** the `client-modules` step:

1. reads the client bundle of **every installed plugin** (53 loader entries in this profile —
   the two stock plugins, the external `@dsh-external/dsh-file-trace`, the new
   `@lhh010/dsh-profiles`, and the rest of the host packages);
2. composes them into **one single 4.5 MB classic (non-module) script** — the "bundle combo";
3. serves that one script to the browser, where it executes as a classic `<script>` in global
   scope. There is **no `type="module"`**, no ESM resolution, and no per-file isolation: the
   combo is parsed and evaluated **as one unit**.

Each well-formed bundle self-registers its loader entry by calling
`window.__ModuleLoader__.load({ id, factory })` when the combo executes; the in-page
`ModuleLoader` then imports the registered entries in a deterministic order and calls each
entry's exported `apply(ctx)`.

### 1.3 Why ONE plugin's bundle took down EVERY plugin's registration

Because the combo is a **single classic script**, it is all-or-nothing:

- a top-level `import` statement is a **syntax error in a classic script** (and would be an
  unresolvable bare-specifier import even under ESM). The offending file's very first token is
  `import`, so the compile error is reported at **position 1:1** — exactly what
  `browser-error.txt` shows:
  `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`;
- the syntax error aborts parsing/evaluation of the **entire combo**, so **zero**
  `window.__ModuleLoader__.load(...)` calls ever run — not the new plugin's, and not the 52
  stock ones';
- with no entries registered, the loader has nothing to import: the browser reports
  `Failed to load plugins`, `Settings → Plugins → Plugin list: EMPTY. Zero entries
  registered.`, and the two stock plugins (brand version, file tracking) vanish from the
  header — they were collateral damage of the shared combo, not broken themselves.

One malformed file poisons the whole shared artifact. That is the structural hazard: textual
concatenation into one classic script converts a per-plugin packaging mistake into a
total-outage failure mode.

### 1.4 Why the error named `dsh-typert-registry` even though that entry is innocent

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
  client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

The named entry is simply the **first entry the loader attempted to import** — the first in its
deterministic import order (hash `0c013085`). When the whole combo failed to compile, the
loader had zero registered entries and reported the failure against the first entry it was
*awaiting*, which happened to be the stock `@deepseek-ai/dsh-typert-registry`. It is an
innocent bystander: a position in an import sequence, not a suspect.

The real culprit is already named in the error — in the **inner parenthetical**: the bundle
**file path** (`/plugins/@lhh010/dsh-profiles/lib/client.js`) and the **position** (`1:1` =
line 1, column 1 — the first token, i.e. the first `import`). The outer entry name is noise;
the inner file+position is the signal.

---

## 2. Diagnosis discipline and the correct external client-bundle contract

### 2.1 How the culprit should have been located from the misleading error

1. **Read the inner error, not the outer one.** The parenthetical names the offending bundle
   file and position. `position 1:1` on `/plugins/@lhh010/dsh-profiles/lib/client.js` points at
   line 1 — `import React from 'react'` — which is illegal in the combo's classic-script
   context. Open that file and look at line 1 before suspecting anything else.
2. **Bisect by change, not by error text.** The failure appeared immediately after the one new
   `insert` row (`dsh-profiles`) was added to `cordis.patch.yml`; everything else was untouched
   and previously worked. The newest change is the prime suspect.
3. **Bisect the combo.** Because the combo is all-or-nothing, the bisect unit is the *entry
   set*, not code inside a bundle: temporarily remove the `dsh-profiles` insert row (or move
   its `lib/client.js` aside) and reboot. If the error disappears and the stock plugins return,
   the new plugin's bundle is confirmed as the culprit. Re-add it and the failure returns.
4. **Cheap static check that flags the offending bundle:** the contract check is one grep —
   scan each installed `lib/client.js` for top-level ESM syntax:
   `grep -nE '^\s*(import|export)[ {*]' <plugin>/lib/client.js` (or equivalently: assert the
   file's top level is a single `window.__ModuleLoader__.load(` call). The offending file fails
   instantly — its first line is a top-level `import` and it also has a top-level `export`.
   This is a zero-cost check that could be run per plugin before ever booting the browser.
5. **Sanity check against a known-good reference.** The same profile already loads working
   external plugins (`working-plugin-excerpt.txt`); comparing the new bundle's packaging shell
   against a working one makes the mismatch obvious in seconds (ESM vs.
   `window.__ModuleLoader__.load({ id, factory })`).

### 2.2 The client-bundle format an external plugin MUST ship instead of bare ESM

The external client bundle is a **self-registering ModuleLoader bundle**, not an ES module:

- **What wraps the code:** a single top-level call

```js
window.__ModuleLoader__.load({
  id: "<plugin id>",
  factory: (require) => { ... },
});
```

  Nothing else may appear at top level — in particular **no top-level `import` and no
  top-level `export`**. Everything lives inside the `factory`.

- **How React (and every other dependency) is obtained:** through the loader-provided
  CommonJS-style `require` handed to the factory — **not** via ESM `import`:

```js
let React = require("react");                                  // host singleton React
let jsxRuntime = require("react/jsx-runtime");                 // for JSX-compiled output
let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
```

  This is not merely syntactic: the combo is a classic script with no module resolution, and
  going through the loader's `require` guarantees the plugin uses the **host's single React
  instance** (an ESM/bundled private copy of React would break hooks and context sharing).

- **What the factory must set up and export:** a CommonJS module shim, returning the module's
  exports:

```js
factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  /* ...body... */
  return module.exports;   // module.exports must carry apply(ctx) (and the inject table)
}
```

  The returned `module.exports` is the loader entry's public surface: it must export the
  plugin's `apply(ctx)` entry point (invoked by the loader at apply time with the plugin
  context) and, when the plugin injects into slots, the `inject` table declaring that linkage
  (see §3).

The corrected outer shell of the user's plugin is therefore:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let React = require("react");
    let reactDom = require("react-dom");   // createPortal obtained via require, not import
    // ... component definitions (pure functions, no top-level DOM side effects) ...
    const inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject("settings.section", {
        id: "profiles-manager",
        order: 5,
        component: ProfilesSection,
      });
    }
    module.exports = { apply, inject };
    return module.exports;
  },
});
```

(Secondary note: the user's bundle also performed **top-level DOM side effects** —
`document.createElement`/`appendChild` plus a `createPortal(...)` call at module scope. A
client bundle should only *register*; the host owns the mount points, and UI is contributed
through slots (§3), not self-mounted at import time.)

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

After the repackaging fixed the ESM problem, the browser loaded plugins again, but the host
log on the next boot showed:

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared
(a parent entry's children table must declare it)
```

All other plugins loaded and rendered — so this is an **apply-time** failure isolated to the
new entry, not a combo failure.

### 3.1 Who declares slots

Slots are **declared by their owner — the parent entry** — in that entry's **children table**.
The settings surface is owned by a parent entry (the settings UI entry in this profile); its
children table declares the slots it accepts, one of which is `settings.section` (with the
slot's own shape: its `kind: "section"`, its `scope: "settings"`). Declaration is the
privilege of the slot's owner; consumers do not get to declare slots that belong to someone
else's tree.

### 3.2 Why the bare registration failed at apply time

The user's `apply` did:

```js
ctx.slots.register(
  { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
  ProfilesSection,
)
```

`ctx.slots.register(...)` with a `name` is a **slot declaration** — it asserts "I (this entry)
declare a slot with this name/shape." But `settings.section` is *another entry's* slot, and
`@lhh010/dsh-profiles`' own children table does not declare it (it is not the plugin's to
declare). At apply time the loader validates every registration against the declared slot
tree, and this one references an undeclared slot name — hence
`slot "settings.section" is not declared (a parent entry's children table must declare it)`.
The apply of that entry is rejected; because apply is per entry, the rest of the combo was
unaffected ("All other plugins load and render normally on this boot").

### 3.3 The exact wrapping form the registration must use

A consumer must **wrap its registration as an injection into the parent-declared slot**, not
declare the slot itself. The working plugin in the same profile shows the pattern
(`working-plugin-excerpt.txt`):

- the entry declares its parent-slot linkage in a module-level table:
  `const inject = ["slots"];`
- and inside `apply(ctx)` it calls **`ctx.slots.inject(...)`** (elided in the excerpt) rather
  than `ctx.slots.register({ name: ... })`.

So the corrected registration is an **injection through the slot owner**:

```js
ctx.slots.inject("settings.section", {
  id: "profiles-manager",
  order: 5,
  component: ProfilesSection,
});
```

with the slot named as the **injection target** (the first argument), and the entry's `inject`
table declaring the linkage so the parent's children table can resolve the child at apply
time. (The excerpt elides the exact `inject(...)` argument list, so the argument shape above
is inferred from the API name, the error's field vocabulary — `id`/`order`/`kind`/`scope` — and
the declarant/registrant split the error implies; the register-vs-inject distinction and the
ownership rule are pinned down by the evidence.)

### 3.4 Which fields a registrant may pass, and which it must not

Split the descriptor's fields by ownership:

| Field | Owner | Registrant may pass it? |
|---|---|---|
| `id` (`"profiles-manager"`) | the **registrant** — its own registration identity | **Yes** |
| `order` (`5`) | the **registrant** — its own placement within the slot | **Yes** |
| the component (`ProfilesSection`) | the **registrant** — the content it contributes | **Yes** |
| `name` (`"settings.section"`) | the **declarant/parent** — the slot's identity in the children table | **No** — passed as the injection *target*, never as a descriptor field asserting a declaration |
| `kind` (`"section"`) | the **declarant** — the slot's shape | **No** |
| `scope` (`"settings"`) | the **declarant** — the slot's scope | **No** |

The user's failing call passed all three declarant-owned fields (`name`, `kind`, `scope`) from
a consumer position — that is exactly the "bare registration of another entry's slot" the
apply step rejects. A registrant contributes *content and placement* (`id`, `order`,
component) into a slot someone else declared.

---

## 4. Dev-loop discipline — restarts, the boot-time combo, and EADDRINUSE

### 4.1 Why the client bundle combo is not rebuilt when plugin files change

The combo is assembled **exactly once per host boot**. At boot the host resolves the patch
layer, then `client-modules` reads every installed plugin's client bundle and composes the 53
entries into the single 4.5 MB classic script — the boot log line
`[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)`
appears **once per boot**, and never again. There is **no file watcher and no rebuild step for
client bundles**: the served combo is a boot-time snapshot of the bundles on disk. Editing a
plugin file afterwards changes nothing in the browser — even a hard refresh just re-fetches
the same already-assembled combo. Only a **full host process restart** re-reads the bundles
and recomposes the combo.

### 4.2 The correct restart procedure

1. **Stop the host completely** — on Windows, kill the whole process tree (see §4.3); do not
   assume closing the launching terminal is enough.
2. **Start the host again** and wait for the boot sequence in the log:
   `[boot] cordis patch layer: N insert rows resolved` →
   `[boot] client-modules: composed N loader entries into client bundle combo` (this line is
   the proof the combo was *re*-assembled from the edited files) →
   `[boot] web profile ready`.
3. **Hard-refresh the browser** (bypass cache) so it fetches the fresh combo.
4. **Verify** in `Settings → Plugins → Plugin list` — a non-empty list means the combo
   compiled; an empty list means it failed again (restart-notes.txt, point 3).

### 4.3 Why the Windows restart died with EADDRINUSE

On Windows, closing the launching terminal **does not kill the child node process** — unlike
POSIX process groups/SIGHUP semantics, the console host closing leaves its children running.
The host's node process survived as an **orphan still holding the listening port**. The next
host boot tried to bind the same port, found it held by the orphan, and died with
**EADDRINUSE**. Force-killing the entire process tree released the socket:

```
taskkill /PID <pid> /T /F
```

after which the next boot bound normally (restart-notes.txt, point 2; host-boot-log.txt
notes). Practical discipline: always stop the host by killing its process tree (or run it
under a supervisor that guarantees tree teardown), never by closing the terminal window.

---

## 5. Prevention

### 5.1 What the HOST could do — at startup and at combo-failure time

1. **Validate each bundle in isolation before composition (boot-time gate).** Before
   concatenating, compile/parse each plugin's client bundle on its own and check the contract:
   top level must be a single `window.__ModuleLoader__.load({ id, factory })` call; any
   top-level `import`/`export` is an error. A failing bundle should be reported **by plugin id
   and file with the offending position** — e.g.
   `plugin @lhh010/dsh-profiles: lib/client.js is not a ModuleLoader bundle (top-level ESM import at 1:1)` —
   and isolated (excluded/errored) **instead of poisoning the combo**.
2. **Attribute combo failures to the real culprit, not the first awaited entry.** The inner
   error already carries the truth (`bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile
   error (position 1:1)`). At combo-failure time the loader/host should parse that inner
   error, map the bundle path back to the plugin id, and surface *that* —
   "failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)" names an
   innocent bystander and sends diagnosis in exactly the wrong direction.
3. **Isolate entries so one bad bundle cannot take down all of them.** Execute/register per
   entry (per-entry script or guarded registration) so a malformed bundle fails only its own
   entry; the other 52 entries should still load. The current single-classic-script design
   turns a per-plugin packaging mistake into a total outage — the single most valuable fix.
4. **Apply-time slot errors should name the owner.** When a registration targets an undeclared
   slot, report the owning parent entry and its children table, and suggest the injection form
   (`ctx.slots.inject("<slot>", { id, order, component })`) — e.g.
   `@lhh010/dsh-profiles tried to register slot "settings.section", which is declared by the
   settings entry; use ctx.slots.inject(...) to contribute into it`.
5. **Gate at install/apply time, not first browser load.** When the patch layer resolves an
   `insert` row for an external plugin, validate its client-bundle contract (and ideally its
   slot registrations) then, so the very first boot after onboarding either succeeds or fails
   with a precise, per-plugin message — instead of an empty plugin list in the browser.

### 5.2 What an external-plugin authoring template / checklist must contain

**A. Packaging shell (prevents failure 1).**
1. Copy the stock template's packaging shell (e.g. the brand-version excerpt) — never hand-roll
   bare ESM.
2. The bundle is exactly one top-level call: `window.__ModuleLoader__.load({ id, factory: (require) => {...} })`.
   **No top-level `import`, no top-level `export`** (the combo is a classic script).
3. All dependencies through the factory's `require`: `require("react")`,
   `require("react/jsx-runtime")`, `require("@deepseek-ai/dsh-client-ui-primitives")` — never
   ESM imports; this also guarantees the host's singleton React.
4. Inside the factory: the module shim
   (`var module = { exports: {} }; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`)
   and `return module.exports;` at the end.
5. `module.exports` exports `apply(ctx)` (plus the `inject` table when injecting into slots).
6. No top-level DOM side effects (no `document.body.appendChild`, no `createPortal` at module
   scope) — register, don't self-mount.
7. Pre-flight self-check before the first boot: `grep -nE '^\s*(import|export)[ {*]' lib/client.js`
   must return nothing, and the file must contain `window.__ModuleLoader__.load(`.

**B. Slot usage (prevents failure 2).**
1. Slots are declared by their **owner** (the parent entry's children table). Look up the slot
   name and shape in the owning entry's declared children before using it.
2. To contribute UI into an existing slot, use the injection form inside `apply(ctx)`:
   `ctx.slots.inject("<slot name>", { id, order, component })`, and declare the linkage in the
   module's `inject` table.
3. Never `ctx.slots.register({ name: "<slot you do not own>" })`. A registrant passes only its
   own fields — `id`, `order`, and the component — and **never** the declarant's fields
   (`name`, `kind`, `scope`); the slot name appears as the injection target, not as a
   descriptor field.

**C. Dev loop (prevents failure 3).**
1. Every client-bundle edit requires a **full host restart** — the combo is assembled once at
   boot and is never rebuilt on file change. After restart: hard-refresh, then check
   `Settings → Plugins` (empty list = combo failed again).
2. On Windows, stop the host by killing the **whole process tree** (`taskkill /PID <pid> /T /F`)
   — closing the terminal orphans node and the next boot dies with **EADDRINUSE**.
3. Wait for the boot log's `client-modules: composed N loader entries ...` line before
   refreshing, so you know you are testing the new combo.

---

## 6. Root-cause summary

| # | Failure | Root cause | Fix |
|---|---|---|---|
| 1 | Whole-combo client-bundle failure; error named stock `@deepseek-ai/dsh-typert-registry`; zero plugins registered | External bundle shipped as bare ESM (top-level `import`/`export`); the host concatenates all 53 bundles into **one classic script**, so the first `import` (position 1:1) is a syntax error that kills the entire combo. The loader named the first entry it was awaiting (`0c013085`), an innocent bystander; the culprit was in the inner error's file+position | Ship the `window.__ModuleLoader__.load({ id, factory: (require) => ... })` wrapper; deps via `require` (host singleton React); return `module.exports` with `apply(ctx)` |
| 2 | `slot "settings.section" is not declared (a parent entry's children table must declare it)` at apply time | Slots are declared by their **owner/parent entry**; the plugin used `ctx.slots.register({ name: 'settings.section', ... })` — a bare declaration of another entry's slot, passing declarant-owned fields (`name`, `kind`, `scope`) it must not | Wrap as an injection: `ctx.slots.inject("settings.section", { id, order, component })` with the linkage declared in the entry's `inject` table; registrant passes only `id`/`order`/component |
| 3 | Edits invisible until host restart; one restart died with EADDRINUSE | The combo is assembled **once at boot** with no watcher/rebuild, so disk edits never reach the browser until a full restart; on Windows, closing the terminal leaves node alive holding the port, so the next boot cannot bind | Restart = kill process tree (`taskkill /PID <pid> /T /F`) → boot → hard refresh → verify plugin list |

**Host-side prevention:** per-bundle contract validation at boot (name the offending plugin and
position, isolate the bad bundle), per-entry isolation so one bundle cannot take down the combo,
combo-failure attribution to the bundle file/plugin rather than the first awaited entry,
apply-time slot errors that name the slot's owner and the injection form, and an install-time
gate on `insert` rows for external plugins.

**Authoring-side prevention:** a template/checklist covering the ModuleLoader wrapper shell
(no top-level ESM, `require`-based deps, module shim, `apply` in `module.exports`, no
self-mounting), the inject-not-register slot rule with the declarant/registrant field split, and
the restart/hard-refresh/verify dev loop with Windows process-tree teardown.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.