# S17 · External UI Plugin Onboarding Trap — Incident Analysis & Prevention Report

Task: S17-external-ui-plugin-onboarding-trap (read-only). Evidence: `/app/fixture/` (unchanged, read-only)
plus read-only inspection of the live host runtime's Cordis inspect providers (host platform).
The client-platform inspect channel was unavailable during this session (GUI page not connected:
client queries timed out) and the local web route requires auth (HTTP 401), so client-side API
shapes are grounded in the fixture's working-bundle excerpt, the exact error texts, and the
host-side `clientModules`/`hmr` service contracts.

---

## 0. Evidence inventory (fixture)

| File | Key fact |
|---|---|
| `browser-error.txt` | First boot: "Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry): client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)". Plugin list EMPTY; both stock plugins gone from the header. |
| `plugin/lib/client.js` | Offending bundle as written: top-level `import React from 'react'` (line 1 col 1), `import { createPortal } from 'react-dom'`, module-scope DOM side effects (createElement + body.appendChild + createPortal at import time), and `apply(ctx)` doing a bare `ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' }, ProfilesSection)`. |
| `profile/cordis.patch.yml` | Community-style install: 3 `insert` rows; the new one is `id: dsh-profiles, name: '@lhh010/dsh-profiles'` alongside stock rows `@local/dsh-brand-version` and `@dsh-external/dsh-file-trace`. |
| `plugin-apply-error.txt` | Second boot (after repackaging): "failed to apply loader entry (@lhh010/dsh-profiles): slot \"settings.section\" is not declared (a parent entry's children table must declare it)". All other plugins load and render normally. |
| `working-plugin-excerpt.txt` | The working contract: `window.__ModuleLoader__.load({ id, factory: (require) => { module/exports shim + Symbol.toStringTag 'Module'; require('react/jsx-runtime'); require('@deepseek-ai/dsh-client-ui-primitives'); const inject = ["slots"]; function apply(ctx) { ctx.slots.inject(...) } return module.exports } })`. |
| `host-boot-log.txt` | Boot: patch layer resolves the 3 insert rows; "client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)" — ONCE per boot. Second boot attempt died with EADDRINUSE until `taskkill /PID <pid> /T /F`. |
| `restart-notes.txt` | Combo assembly happens once at host boot; disk edits are invisible to the browser (even hard refresh) until host restart; closing the launching terminal on Windows orphaned the node process holding the port; verify loop = hard refresh → Settings → Plugins → Plugin list (empty ⇒ combo failed again). |

Live host inspection (read-only) corroborating the model:
- `clientModules` service: "incremental dsh.client scan + wire composition + bundle route + index injection rows"; construction runs the activation scan synchronously; `graph()` returns the graph served as `window.__DSH_BOOT__` — `WebBootGraph { rev, entries: [{ id, url, rev, inject?, immediately?, external? }], batches: [{ phase: 'bootstrap' | 'application', url, rev, entries[] }] }`; `fetchBundle` serves revisioned immutable bundle bodies under `/plugins` (each body built once on first GET); `rebuilt(id)` is "the only entry point through which build changes reach the graph" (the HMR watch's registration hook); `artifactBaseline(id)` exists so an HMR watch cannot miss writes made between startup composition and watch installation.
- `hmr` service: `reconcileProfile` replaces running plugins whose loaded files changed, but reports `pending` modules as "changed modules that load after a restart".
- `@deepseek-ai/dsh-typert-registry` is the stock host entry `include:typert` (schema/reflection registry) — never touched by the user, confirming it is an innocent bystander.

---

## 1. Failure 1 root cause — one bare-ESM bundle took down EVERY plugin

**What the host assembles, and in what form it reaches the browser.** At boot, `clientModules`
scans the installed plugins' `dsh.client` declarations and composes all client bundles into ONE
client bundle combo — a single **classic script** (boot log: 53 loader entries, 4.5 MB), organized
in boot-graph batches (`bootstrap` and `application` phases) and served under the `/plugins`
route at immutable revisioned URLs. Alongside it, the host injects the boot graph into the page as
`window.__DSH_BOOT__` (graph rev + per-entry `{id, url, rev, inject?, external?, immediately?}` +
batch table). Inside the combo, each plugin bundle must be a self-registration of the form
`window.__ModuleLoader__.load({ id, factory })`. The browser receives classic scripts — NOT ES
modules and NOT one script per plugin — and the module loader then imports/applies the advertised
entries in graph order.

**Why one bundle killed all 53.** The user's `lib/client.js` is bare ESM: line 1, column 1 is
`import React from 'react'`. `import`/`export` statements are syntax errors in a classic
script. A classic script parses **atomically**: a single syntax error anywhere fails the parse of
the whole script and none of its statements run. The compose/transform step flagged exactly this —
"bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)" (the `client-modules:`
prefix is the composing host service) — and because all 53 registrations live in one script body,
ZERO entries ever reached `window.__ModuleLoader__`. Hence the total blackout: the plugin list is
empty and the two previously-fine stock plugins (brand version, file tracking) vanish from the
header too. Blast-radius rule of the combo architecture: **a per-entry apply error breaks one entry
(Failure 2); a combo compile/parse error breaks every entry (Failure 1).**

**Why the error named `@deepseek-ai/dsh-typert-registry`.** The naming is positional, not causal.
The boot graph (`window.__DSH_BOOT__`) is assembled separately from bundle compilation, so the
browser still advertised all 53 entries. The plugin-loading step then began awaiting/importing
loader entries in graph order; the FIRST entry awaited was rev `0c013085` =
`@deepseek-ai/dsh-typert-registry` — the stock schema registry that bootstraps the rest, first in
the bootstrap phase. It (like every other entry) never registered because the combo never executed,
so the loader's generic "failed to import loader entry <first awaited>" error fired against it,
with the host's composition-time compile error chained as the cause. The typert registry is simply
the first victim in the await sequence; **the culprit is named only in the chained cause:
`@lhh010/dsh-profiles/lib/client.js` at position 1:1 — the top-level `import`.**

---

## 2. Diagnosis discipline + the client-bundle contract an external plugin must ship

### 2.1 Locating the culprit from a misleading error

1. **Read the FULL chained error, cause first.** The text after the colon names the true bundle and
   position (`/plugins/@lhh010/dsh-profiles/lib/client.js … position 1:1`); the entry name before
   the colon is just the first awaited victim. Never chase the named stock entry — cross-check the
   change surface instead: the only delta in this session was the `dsh-profiles` insert row.
2. **Treat an EMPTY plugin list as a combo-wide failure** ⇒ the newest/edited bundle is guilty
   until proven innocent (not the entry the error names).
3. **Cheap static check (seconds, no restart):** scan the suspect bundle for top-level ESM syntax
   and for the wrapper:
   - `Select-String -Path lib\client.js -Pattern '^\s*(import|export)\b'` — any hit ⇒ the bundle
     is not combo-compatible; or
   - `node --check lib\client.js` (checked as a classic/CJS script ⇒ SyntaxError on the top-level
     `import`); plus a positive check that the first token is `window.__ModuleLoader__.load({` and
     its `id` equals the package name in the patch insert row.
4. **Bisect if no cause is printed:** remove (or comment out) the new `insert` row in
   `cordis.patch.yml` / unlink the plugin dir → restart host → hard refresh. Stock plugins return ⇒
   the new plugin is the culprit; then bisect within the bundle (wrapper shell first, add code back
   in halves). Here position 1:1 already pinpoints line 1.
5. **Confirm recovery** the same way every iteration: restart → hard refresh → Settings → Plugins →
   Plugin list non-empty.

### 2.2 The required client-bundle form (instead of bare ESM)

- **What wraps the code:** one classic-script registration call —
  `window.__ModuleLoader__.load({ id, factory })` — where `factory(require)` is a CJS-style
  closure containing the `var module = { exports: {} }; var exports = module.exports;` shim,
  `Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })`, the plugin code, and
  `return module.exports;`. No top-level `import`/`export` anywhere, and no module-scope DOM side
  effects (the user's import-time `document.body.appendChild` + `createPortal` must move inside
  the apply/render lifecycle — the slot system mounts components).
- **How React is obtained:** through the wrapper's injected `require` — `require('react')`,
  `require('react/jsx-runtime')`, `require('react-dom')`, and host UI libs such as
  `@deepseek-ai/dsh-client-ui-primitives`. These are host-provided shared externals (boot-graph
  entries carry `external[]`), guaranteeing ONE React instance shared with the shell. Bundling or
  ESM-importing React is forbidden: there is no module graph inside the combo to resolve bare
  specifiers, and a second React instance would break hooks/context.
- **What the wrapper must export:** `module.exports` must carry `apply(ctx)` — the lifecycle the
  loader invokes with the injected context — plus the `inject` declaration (e.g.
  `const inject = ["slots"]`, surfaced in the entry's `inject` list) naming every ctx service the
  module needs, so the loader provides `ctx.slots` before apply runs. `id` must exactly equal the
  package name used in the patch insert row (the loader keys entries by it).

---

## 3. Failure 2 — slot "settings.section" is not declared

**What the message means / who declares slots.** In the DSH slot system a slot is not a free name a
registrant can invent. A slot comes into existence only when the **parent entry that owns the UI
region** — for `settings.section`, the stock Settings page entry — **declares it in its children
table**; the declared slot then exists as a node in the live Slot tree, and other entries fill it.
The apply-time error is the slots service refusing to resolve the name `settings.section` against
any parent's declaration: nothing in the loaded graph declared that slot for this registrant.

**Why the bare registration failed at apply time.** `apply(ctx)` runs when the loader activates
the entry. The user called `ctx.slots.register(...)` with a self-authored, declaration-shaped
descriptor — `{ name: 'settings.section', id, order, kind: 'section', scope: 'settings' }` — i.e.
a bare registration into ANOTHER entry's slot namespace. At apply time the service validates the
target against declared slots / parent children tables; the validation throws, and the loader fails
THIS entry only ("failed to apply loader entry (@lhh010/dsh-profiles)") while every other plugin
loads and renders — the combo itself was healthy after repackaging, so this is the per-entry
failure mode, in contrast to Failure 1's whole-combo mode. Cross-entry ordering compounds this: an
eager registration executed during this entry's apply can run before the declaring parent's
children table has been applied, so a form that demands the slot already exist at call instant is
inherently racy across entries.

**The exact wrapping form the registration must use.** Per the working bundle, the module declares
`const inject = ["slots"]` and, inside `apply(ctx)`, registers through the slots service's
**injection wrapper — `ctx.slots.inject(...)`** — instead of a bare `ctx.slots.register(...)` with
a self-authored descriptor. The injection form binds the registrant's content to a slot key that a
parent entry declares (attaching through the declaration, which resolves the cross-entry ordering:
the content rides the parent's children table instead of racing it). The target slot key must be a
real declared key — verify it against the live Slot tree (client inspect `Slots.listSubTree`, or
the Settings entry's children table) rather than inventing `settings.section`.

**Fields a registrant may pass vs must not.**
- MAY pass (registrant-owned): its `id` (unique child id, e.g. `profiles-manager`), `order`
  (placement among siblings), its props, and the component/render factory.
- MUST NOT pass (declaration-owned — belong exclusively to the declaring parent's children table):
  the slot `name` (the slot key is the injection TARGET, never re-declared by the registrant),
  and slot-shape attributes such as `kind` and `scope`. The failing call passed all three
  declaration-owned fields — it was effectively attempting to declare a slot, which only a parent
  entry's children table may do.

(Honest caveat: the client-platform inspect channel was down in this session, so the exact
positional signature of `ctx.slots.inject` should be re-verified against the live client Service
inspect / Slot tree before shipping; the structural contract above is what the working-bundle
excerpt and the error text establish.)

---

## 4. Dev-loop discipline — boot-assembled combo, restart procedure, EADDRINUSE

**Why plugin edits never reach the browser without a restart.** The combo and the boot graph are
composed ONCE, at host boot: `clientModules` construction runs the activation scan synchronously
(boot log prints the composed line once per boot), and bundles are then served as **immutable
revisioned bodies** (`fetchBundle` builds each body once on first GET; responses are cached under
their rev). The ONLY path by which changed client-bundle bytes re-enter the graph is
`clientModules.rebuilt(id)` — the HMR watch's registration hook — and that fires only when a
watcher/rebuild pipeline (the dev-mode `dev:web` flow) is watching the plugin and publishes a new
generation. A community-style install (linked dir + one patch row) has no such watcher, so disk
edits change nothing; a browser hard refresh merely re-fetches the same immutable rev. Even the
host-side HMR (`hmr.reconcileProfile`) reports changed modules as `pending` — "changed modules
that load after a restart".

**Correct restart procedure per iteration:**
1. Stop the host COMPLETELY — on Windows kill the whole process tree (do not rely on closing the
   terminal); find the holder with `netstat -ano | findstr :<port>` (or `Get-NetTCPConnection`)
   and `taskkill /PID <pid> /T /F`.
2. Verify the listening port is actually free.
3. Start the host; watch the boot log's composed line (entry count should include the plugin).
4. Browser hard refresh.
5. Check Settings → Plugins → Plugin list: non-empty ⇒ combo OK; EMPTY ⇒ combo failed again —
   run the §2.1 static check on the newest bundle before anything else.

**Why the Windows restart died with EADDRINUSE.** Closing the launching terminal does not
terminate the spawned host on Windows: tree termination is not propagated to the detached child
node process (no job-object binding), so the orphaned process kept the TCP listener open. The next
host boot's `bind()` on the same port failed with EADDRINUSE. The orphan died only when the whole
tree was force-killed (`taskkill /PID <pid> /T /F` — /T includes child processes, /F forces),
freeing the port; the following boot bound normally. Discipline: terminal-closed ≠ host-stopped;
always tree-kill and confirm the port is free before relaunching.

---

## 5. Prevention

### 5.1 Host-side (name the culprit, contain the blast radius)

1. **Compose-time per-bundle validation:** parse/transform each client bundle individually BEFORE
   concatenation. A bundle that fails classic-script compilation is dropped from the combo and
   reported loudly by plugin name, id and position — e.g. "excluded @lhh010/dsh-profiles: ESM
   `import` at 1:1; client bundles must be `__ModuleLoader__`-wrapped classic script" — while the
   remaining 52 entries keep working. (`clientModules` already aggregates malformed `dsh.client`
   declarations into one loud throw at construction; extend the same startup audit to bundle FORM:
   top-level import/export detection, wrapper presence, `id` ↔ package-name ↔ patch-row match —
   listing every offending plugin in one boot-time report.)
2. **Attribution at combo-failure time:** when the browser loader finds 0 of N advertised entries
   registered, report "client combo failed to execute (0/53 registered) — see host composition
   log" instead of "failed to import loader entry <first awaited>". Lead with the chained cause
   (the real bundle + position); never let the first-awaited entry's name (typert-registry) be the
   headline. The composed-line boot log should gain per-entry compose status.
3. **Structural isolation:** serve batches/entries as separately-parsed scripts (or wrap each
   factory registration in try/catch at composition), degrading "one bad plugin" from
   whole-GUI-dead to the same single-entry failure mode Failure 2 already shows.
4. **Dev-loop ergonomics:** auto-install HMR watches for linked plugin dirs in dev so
   `rebuilt(id)` recomposes the graph without full restarts; in production installs, when a
   bundle's mtime is newer than its composed rev, print "plugin files changed — restart required".
   On Windows, run the host under a job object / tree-killing supervisor so closing a terminal can
   never orphan the listener (no EADDRINUSE).

### 5.2 Authoring-side template/checklist (external plugin authors)

**Scaffold/template package** should contain: a pre-wrapped `lib/client.js`
(`window.__ModuleLoader__.load({ id, factory })` with the module/exports shim and
`Symbol.toStringTag`), require-based externals (`react`, `react/jsx-runtime`, `react-dom`,
`@deepseek-ai/dsh-client-ui-primitives`), `const inject = [...]` listing every ctx service used,
`apply(ctx)` performing slot injection via the `ctx.slots.inject` wrapper, and a matching
`cordis.patch.yml` insert-row snippet (`id` + `name`).

**Checklist:**
1. Bundle form: no top-level `import`/`export` (preflight: `^\s*(import|export)\b` scan or
   `node --check`); file starts with `window.__ModuleLoader__.load({`; wrapper `id` === package
   name === patch-row `name`; no module-scope DOM side effects; React NOT bundled (require only,
   single shared instance).
2. Services: every `ctx.*` service touched is listed in `inject` (e.g. `["slots"]`).
3. Slots: never invent slot names — enumerate the live declared Slot tree (client inspect
   `Slots.listSubTree` / the parent entry's children table); register only through the injection
   wrapper; pass ONLY registrant-owned fields (`id`, `order`, props, component) — never
   declaration-owned `name`/`kind`/`scope`.
4. Install: link dir into the profile's `node_modules` → one `insert` row in `cordis.patch.yml`
   → FULL host restart (Windows: tree-kill via `taskkill /PID <pid> /T /F`, verify port free) →
   browser hard refresh → Plugin list non-empty.
5. Triage card: EMPTY plugin list = combo-wide parse failure = newest bundle guilty until proven
   innocent; read the chained cause (bundle path + position), run the static ESM check, and do not
   chase the entry named in "failed to import loader entry …". Single-entry apply error while
   everything else renders = your apply()/registration semantics (slot declaration, inject list,
   ctx usage).

---

## Appendix A — Reconstructed correct client bundle for @lhh010/dsh-profiles

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",              // === package name in the patch insert row
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");                       // host-provided shared externals;
    // const { jsx } = require("react/jsx-runtime");      // never bundle React yourself
    // const ui = require("@deepseek-ai/dsh-client-ui-primitives");

    const PROFILES = [
      { id: 'web', label: 'Web', engine: 'dsh' },
      { id: 'cli', label: 'CLI', engine: 'dsh' },
    ];

    function ProfilesSection() {
      return React.createElement(
        'div',
        { className: 'profiles-section' },
        React.createElement('h3', null, 'DSH Profiles'),
        PROFILES.map(p => React.createElement('div', { key: p.id }, p.label)),
      );
    }

    const inject = ["slots"];                 // declare every ctx service apply() needs

    function apply(ctx) {
      // Inject into a slot the Settings parent entry actually declares in its children
      // table (verify the exact key against the live Slot tree first). Pass ONLY
      // registrant-owned fields: id, order, props/component — never name/kind/scope.
      ctx.slots.inject("<parent-declared settings slot key>", {
        id: "profiles-manager",
        order: 5,
      }, ProfilesSection);
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
```

Removed vs the user's version: both top-level `import` statements (→ `require` inside the
factory), and the module-scope `document.body.appendChild` + `createPortal` bootstrap (the slot
system mounts the component; no manual DOM root). Caveat: the exact positional signature of
`ctx.slots.inject` and the real declared slot key must be confirmed against the live client
inspect (Service `slots` / `Slots.listSubTree`) before shipping — the structural contract
(wrapper, externals, inject list, apply export, target-a-declared-slot, registrant-only fields) is
what the fixture evidence establishes.

---

*Fixture directory untouched (read-only analysis). No migrations, installations, git operations,
external network access, or writes outside `/app/agent-output/` were performed. Live-runtime
queries were read-only host-platform inspect calls permitted by the brief's "local tools
read-only" clause.*
