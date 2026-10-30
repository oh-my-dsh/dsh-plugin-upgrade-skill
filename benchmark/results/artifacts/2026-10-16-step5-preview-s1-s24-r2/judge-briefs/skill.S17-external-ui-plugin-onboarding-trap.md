# JUDGE BRIEF · skill.S17-external-ui-plugin-onboarding-trap

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

**Scope**: read-only diagnosis of the evidence pack under `fixture/` (browser error, host boot
log, offending `lib/client.js`, profile patch rows, apply-time error, restart notes, working
plugin excerpt), grounded in the read-only `plugin-upgrade` skill references
(`references/troubleshooting.md`, `references/v0.1.2-alpha.1.md` cards A1-19/A1-25/A1-26,
`references/v0.1.5-alpha.1.md` card A1-20, `references/v0.1.7-alpha.2.md` card A2-04,
`references/v0.1.1-rc.1.md` cards R1-01…R1-03, `references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md`
cards J1-30/J1-31/J1-34, `examples/06-real-world-batch-migration.md`).

**Bottom line**: all three failures are packaging/contract failures of the new plugin
`@lhh010/dsh-profiles`, not host failures. (1) Its client bundle was shipped as bare ESM, and
one ESM token fails the *whole* boot-assembled classic-script combo at compile time, so every
plugin — including untouched stock entries — vanished; the error named an innocent entry
because the loader reports the *first awaited/unregistered* entry, not the culprit. (2) After
repackaging, its slot contribution was a bare `ctx.slots.register` of another entry's slot
(`settings.section`) with declarer-only fields (`kind`/`scope`); cross-entry apply order is
unconstrained, so the registration must be wrapped in `ctx.slots.inject(name, () => …)` and
must pass only registrant fields. (3) The client combo is assembled and cached once at host
boot, so every client-bundle edit requires a full host restart; on Windows, closing the
launching terminal orphans the node server process, which keeps the port and makes the next
boot die with EADDRINUSE until the process tree is force-killed.

---

## 1. Failure 1 — one plugin's client bundle took down every plugin's registration

### 1.1 What the host assembles, and in what form it reaches the browser

At host boot the client-modules plane (see boot log `host-boot-log.txt`):

1. **Enumerates the browser roster**: every installed package declaring `dsh.client`
   (`platform: web` + client entry — scan contract DSH-0.1.1-R1-03 / DSH-0.1.2-A1-26), the
   bundle-provided modules, and the profile's `insert` rows (here: `dsh-brand-version`,
   `dsh-file-trace`, `dsh-profiles` — 53 loader entries total in the fixture).
2. **Reads each plugin's client bundle** (`lib/client.js`) from the install tree and
   **concatenates all of them into ONE "client bundle combo"** — a single **classic
   `<script>`** (fixture: "composed 53 loader entries into client bundle combo (4.5 MB,
   classic script)"). It is served from the combo route `/plugins/??<pkg>/client.js&rev=…`
   and advertised to the page via `window.__DSH_BOOT__.entries` (DSH-0.1.2-A1-19).
3. Inside the combo, each entry's code is a **registration call**:
   `window.__ModuleLoader__.load({ id, factory: (require) => { … } })` (see
   `working-plugin-excerpt.txt`). The loader calls each factory with a `require` bound to the
   host's module table; the returned `module.exports` exposes the plugin's `apply(ctx)`
   activation entry, which runs when the plugin is activated.

So the browser never loads 53 scripts; it loads **one 4.5 MB classic script** that registers
all 53 modules, then the host activates them.

### 1.2 Why ONE bundle with a top-level ESM `import` took down EVERY plugin

The combo is a **classic script**, not a module. `import … from '…'` / `export …` are only
legal in a module goal; in a classic script they are a **syntax error**. A browser compiles
the whole script as one unit **before executing any of it**, so a single ESM token anywhere
in the 4.5 MB concatenation fails the entire combo:

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
  client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

The offending file is `plugin/lib/client.js`, line 1 column 1 = `import React from 'react'`
(plus `import { createPortal } from 'react-dom'` and `export function apply(ctx)`). Because
compilation is all-or-nothing, **zero** of the 53 entries register — hence the empty plugin
list and the disappearance of the two stock plugins (brand version, file tracking) that
rendered fine before the insert. The blast radius of one mispackaged bundle is the entire
plugin surface, not just the new plugin (same signature as DSH-0.1.5-A1-20: "one dropped
module can take down every plugin's registration").

### 1.3 Why the error named `dsh-typert-registry` — an innocent entry

The loader imports/activates entries from the roster one at a time. When the single combo
script fails to compile, **no** entry registers, and the failure surfaces at the entry the
loader was importing at that moment — the **first awaited / first unregistered entry**,
`0c013085 (@deepseek-ai/dsh-typert-registry)`. The named entry is only the *attribution
anchor of the error wrapper*, not the culprit; the **inner frame** carries the truth
(`bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`). The
skill's troubleshooting table states this explicitly: "the named `<id>` is only the first
awaited entry (e.g. `dsh-typert-registry`, innocent); some plugin's client bundle contains
raw ESM … and one ESM token fails the WHOLE classic-`<script>` bundle combo at compile time."

### 1.4 Diagnosis discipline — locating the culprit from the misleading error

1. **Read the innermost error frame, not the named entry.** The wrapper names the first
   awaited entry; the inner frame names the bundle file and position. Here it points
   straight at `/plugins/@lhh010/dsh-profiles/lib/client.js` at 1:1.
2. **Use the timeline**: the two stock plugins worked immediately before the single new
   `insert` row (`dsh-profiles`) — the regression is already localized to that row's plugin.
3. **Bisect the patch layer's `insert` rows** (the skill's recipe): comment out the new row in
   `profile/cordis.patch.yml`, restart the host, hard-refresh; if all plugins load again, the
   removed row's plugin is the culprit. Restore the row and fix the plugin, not the profile.
4. **Cheap static check that flags the offending bundle**: a client bundle must be a classic
   script registering through `window.__ModuleLoader__.load({ id, factory })` — never bare
   ESM. One grep over the plugin's built client entry settles it:
   - `rg -n "__ModuleLoader__|PLUGIN_ID" lib/` must **hit** (pre-flight class #5 pattern);
   - `rg -n "^\s*(import|export) " lib/client.js` must **not hit** (a hit = mispackaged);
   - equivalently `node --check lib/client.js` fails, since a top-level `import` is illegal
     in a classic/CJS script.
   Applied to the fixture bundle: no `__ModuleLoader__`, two top-level `import`s and one
   top-level `export` — flagged in seconds, with no browser involved.

### 1.5 The client-bundle format an external plugin must ship instead of bare ESM

From `working-plugin-excerpt.txt` (a working plugin loaded from the same profile):

```js
window.__ModuleLoader__.load({
  id: "@local/dsh-brand-version",                 // must equal package.json "name"
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react_jsx_runtime = require("react/jsx-runtime");                          // React via require
    let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    /* … component definitions … */
    const inject = ["slots"];
    function apply(ctx) { /* ctx.slots.inject(...) … */ }
    return module.exports;                 // must return module.exports, exposing apply
  },
});
```

The contract, point by point:

- **What wraps the code**: a `window.__ModuleLoader__.load({ id, factory })` call — the
  bundle is a *classic script* that registers itself with the loader. The registration `id`
  must equal the package name (`@lhh010/dsh-profiles`); the build normally injects it via the
  tsdown banner `PLUGIN_ID` (DSH-0.1.2-A1-26). No top-level `import`/`export`, ever.
- **How React is obtained**: *inside the factory*, through the injected `require` —
  `require("react")` / `require("react/jsx-runtime")` and host UI primitives such as
  `require("@deepseek-ai/dsh-client-ui-primitives")`. The loader resolves these against the
  host's module table, so the plugin shares the host's single React copy instead of bundling
  or importing its own. (Consequently the plugin must not ESM-import React or react-dom, and
  must not ship its own copy.)
- **What the wrapper must export**: the factory builds a CommonJS-like `module`/`exports`
  (with `Symbol.toStringTag` "Module") and **returns `module.exports`**, which must expose
  the plugin's activation entry — the `apply(ctx)` function — and declare its capability
  `inject` list (e.g. `["slots"]`). An ESM named export (`export function apply`) is not the
  wire format; even a *valid* ESM bundle would not register.
- **No module-top-level side effects**: the fixture bundle also appended a DOM node and
  called `createPortal(...)` at module scope. Mounting belongs in `apply(ctx)` (or the slot
  render), which runs at activation — not at script-evaluation time.

The user's bundle violated every clause: bare ESM imports/exports, React imported rather
than required, no `__ModuleLoader__.load` wrapper, no `module.exports` return, and top-level
DOM side effects. It should have been produced by the build pipeline (loader wrapper +
`PLUGIN_ID` banner), not hand-written as an ESM file.

---

## 2. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

### 2.1 What the error means

Slots have an **owner**: the entry that owns the surface (here, the settings shell — the
`ui-settings` package, whose slot contract declares the settings seats, e.g.
`ui-settings/src/client/contract/slots.ts`). The declaring entry lists the seats it offers
in **its children table / slot contract** (`{ name, kind, scope, … }`), and only that
declaration may carry the full descriptor. `settings.section` is such a seat: it is
*declared by the settings entry*, and third-party plugins may only contribute *into* it.

The user's `apply` did:

```js
ctx.slots.register(
  { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
  ProfilesSection,
)
```

i.e. a **bare registration of another entry's slot**, passing declarer-only fields
(`kind`, `scope`).

### 2.2 Why a bare registration of another entry's slot fails at apply time

`ctx.slots.register` requires the slot to **already be declared**. The declarer is a
different entry, and **cross-entry apply order is unconstrained** — the host activates
plugins in an undefined order, so the registrant's `apply` can (and did) run before the
settings entry's declaration exists. The host's apply-time check rejects it:
`slot "settings.section" is not declared (a parent entry's children table must declare it)`.
Note this failure only appeared on the *second* boot because the first boot never got past
the combo compile error; once the bundle loaded, the next contract violation surfaced.

### 2.3 The exact wrapping form the registration must use

Defer the registration until the parent entry has declared the slot (skill recipe,
troubleshooting row + example 06 + jump card J1-34):

```ts
ctx.slots.inject('settings.section', () => ctx.slots.register(
  { name: 'settings.section', id: 'profiles-manager', order: 5 },
  ProfilesSection,
))
```

`ctx.slots.inject(name, factory)` makes the contribution **wait on the declaring plugin's
slot declaration**, so ordering no longer matters.

**Fields a registrant may pass**: only `name` / `id` / `order` (plus `label` / `locale`
where the seat's contract allows them — the seat entry shape is
`{ name, id, order?, locale?, children?, inject? }`).
**Fields it must NOT pass**: `kind` and `scope` (and any other declaration-shape fields) —
those belong to the parent entry's declaration. The fixture bundle's `kind: 'section'` and
`scope: 'settings'` are exactly the forbidden ones.

Additional authoring note: seat names and kinds drift across host versions
(`settings.plugin.item` was retired by 0.1.7; `settings.launcher` and `settings.models.sign-in`
were added), so the registrant should read the **target host's** slot contract rather than
invent a seat from memory.

---

## 3. Dev-loop discipline — the boot-assembled combo, restart procedure, and the Windows EADDRINUSE

### 3.1 Why the client bundle combo is not rebuilt when plugin files change

The host **reads and caches every client bundle at boot** and composes the combo once per
process (boot log: the "composed 53 loader entries …" line appears **once per boot**). There
is no file watcher, no rebuild-on-change, and no HMR for the client half; the combo route
serves the boot-assembled bytes at a fixed rev. DSH-0.1.7-A2-04 states it outright: "Client
plugin bundles are read and cached when the host boots: editing a served `lib/client.js` on
disk NO LONGER takes effect on page refresh alone (0.1.6-era behavior); only a host restart
serves the new bytes." That is why every plugin edit in the session needed a host restart
and why even a hard browser refresh changed nothing. (Caution from the same card: after a
restart an already-open page auto-reconnects and may keep running pre-restart bytes — verify
the **served bundle content** (fetch the combo URL), not just that the page responds.)

### 3.2 The correct restart procedure

1. **Fully stop the host process** — on Windows, kill the whole process tree
   (`taskkill /PID <pid> /T /F`); closing the launching terminal is not enough (§3.3).
   (Stopping completely is also the rule before replacing files in the install tree: the
   running host holds file locks on loaded host-half/native modules — the known EBUSY trap.)
2. **Start the host again** and wait for `web profile ready`.
3. **Hard-refresh the browser.**
4. **Check Settings → Plugins → Plugin list**: a populated list = the combo compiled;
   an **empty list = the combo failed again** (restart-notes item 3).

### 3.3 Why the Windows restart died with EADDRINUSE until the process tree was force-killed

On Windows, closing the launching terminal does **not** stop the host's server: the dsh web
host runs its node server as a child/detached process, and a console-close event only
reaches processes attached to that console. The launcher dies; the **node server survives as
an orphan** and keeps the listening port bound. The next host boot therefore fails to bind
with **EADDRINUSE**. Only force-killing the entire process tree
(`taskkill /PID <pid> /T /F`) released the port, after which the next boot bound normally —
exactly the sequence in `restart-notes.txt` item 2 and `host-boot-log.txt`.

---

## 4. Prevention

### 4.1 What the HOST could do

**At startup (per-bundle validation, before the browser ever sees the combo):**

- **Validate each client bundle in isolation**, not only the concatenated combo: parse every
  `lib/client.js` as a classic script (or `node --check` it) and reject at boot with the
  **plugin id + file + position**:
  `plugin @lhh010/dsh-profiles: client bundle lib/client.js is not a valid classic script
  (top-level import at 1:1); a client bundle must register via
  window.__ModuleLoader__.load({ id, factory })`. This converts a whole-combo outage into a
  named single-plugin boot failure — the difference between "all 53 plugins gone" and "one
  plugin mispackaged".
- Enforce the registration contract at boot: registration `id` == package name (the existing
  `loaded without registering "<id>"` assertion, DSH-0.1.2-A1-26), presence of
  `__ModuleLoader__.load` / `PLUGIN_ID` in the bundle, and the `dsh.client` declaration scan
  (DSH-0.1.1-R1-03).

**At combo-failure time (attribution):**

- Attribute the failure to the **innermost cause** — the offending bundle file and position
  — and demote the wrapper's entry name with an explicit note: "the named entry is the first
  awaited/unregistered entry and may be innocent". Report **all** affected entries (the whole
  roster), and include the bisect recipe (remove the newest `insert` row, restart, compare).
- Keep per-bundle boundaries (or per-entry error spans / source positions) in the served
  combo so `position 1:1` maps back to the owning file automatically.

**At apply time (slot declaration):**

- When a registration fails the declaration check, name the **declaring entry** that owns the
  slot and emit the correct wrapping form:
  `slot "settings.section" is declared by <settings entry>; contribute with
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name, id, order }, Component))`.
- Reject non-registrant fields (`kind`, `scope`) with a message that they belong to the
  parent entry's children table, and point at the seat's published slot contract.

### 4.2 What an external-plugin authoring template / checklist should contain

**Manifest & install**

1. `package.json` declares `dsh.client` (`platform: 'web'` + client entry); the package name
   equals the client bundle's registration `id`.
2. Install the community way: link/junction the plugin directory into the profile's
   `node_modules`, plus exactly ONE `insert` row in the profile's `cordis.patch.yml` whose
   `name` is the **bare package name** (`'@lhh010/dsh-profiles'`). Never hand-insert an id the
   bundle layer already provides (`duplicate loader entry id` is fatal).
3. `dsh --profile <name> --dump-config` shows the row resolved, no pending.

**Client bundle packaging contract (the Failure-1 checklist)**

4. The bundle is a **classic script** calling
   `window.__ModuleLoader__.load({ id: '<package name>', factory: (require) => { … } })`.
   **Never bare ESM** — no top-level `import`/`export`.
5. Inside the factory: build `module`/`exports` (`Symbol.toStringTag` "Module"), obtain React
   via `require('react')` / `require('react/jsx-runtime')` and host primitives via `require`
   (never bundle or import your own React), **return `module.exports`** exposing
   `apply(ctx)`, and declare the capability `inject` list.
6. No module-top-level DOM side effects; mount inside `apply(ctx)` / the slot render.
7. Let the build pipeline emit the wrapper + `PLUGIN_ID` banner; do not hand-write
   `lib/client.js`. Static gate in CI (or before install):
   `rg -n "__ModuleLoader__|PLUGIN_ID" lib/` must hit; `rg -n "^\s*(import|export) " lib/`
   must not; or `node --check` the built client entry.

**Slot contribution (the Failure-2 checklist)**

8. Never bare-register another entry's slot. Always:
   `ctx.slots.inject('<slot>', () => ctx.slots.register({ name, id, order }, Component))`.
9. Pass only registrant fields (`name`/`id`/`order`, plus `label`/`locale` if the seat's
   contract allows); **never** `kind`/`scope`.
10. Read the target host's slot contract for the exact seat name/kind (seats drift:
    `settings.plugin.item` retired in 0.1.7; `settings.launcher` / `settings.models.sign-in`
    added) instead of inventing one.

**Dev loop (the Failure-3 checklist)**

11. Every client-bundle edit requires a **full host restart** (combo is assembled and cached
    at boot; no rebuild-on-change, no client HMR) — then a browser hard refresh, then check
    Settings → Plugins (empty list = combo failed again).
12. On Windows, stop = **kill the whole process tree** (`taskkill /PID <pid> /T /F`); closing
    the terminal orphans the node server → next boot EADDRINUSE. Also stop the host fully
    before replacing any file in the install tree (running host holds file locks → EBUSY).
13. First-boot acceptance, not just "no error" (DSH-0.1.2-A1-19): `window.__DSH_BOOT__.entries`
    contains the plugin id; the combo URL `/plugins/??<pkg>/client.js&rev=…` contains
    `__ModuleLoader__.load({ id: "<pkg>"`; a DOM marker owned by the plugin renders; zero page
    errors.

---

## 5. Evidence index

| Fixture file | What it proves |
|---|---|
| `browser-error.txt` | Whole-combo failure: inner frame names `lib/client.js` 1:1; wrapper names innocent first-awaited entry `@deepseek-ai/dsh-typert-registry`; zero plugins registered |
| `plugin/lib/client.js` | Bare ESM (`import`/`export`), React imported not required, no `__ModuleLoader__.load` wrapper, top-level DOM side effects, bare `ctx.slots.register` with `kind`/`scope` |
| `profile/cordis.patch.yml` | The single new `insert` row (`dsh-profiles`) that localizes the regression; row `name` is the bare package name (correct) |
| `plugin-apply-error.txt` | Second boot: slot not declared — bare registration of the settings entry's seat |
| `working-plugin-excerpt.txt` | The correct packaging shell: `__ModuleLoader__.load({ id, factory })`, `require('react/jsx-runtime')`, `module.exports` return, `inject` list, `ctx.slots` injection |
| `host-boot-log.txt` | Combo assembled once per boot (53 entries, 4.5 MB, classic script); EADDRINUSE on second boot until tree-kill |
| `restart-notes.txt` | Dev-loop rules: edits need host restart; Windows tree-kill; hard refresh + plugin-list check |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.