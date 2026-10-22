# S17 · The External UI Plugin Onboarding Trap — Incident Report (read-only analysis)

**Scope**: read-only diagnosis of the three-failure onboarding incident for the hand-written
external Web UI plugin `@lhh010/dsh-profiles`, from the sealed evidence pack under
`/app/fixture/` (hashes re-verified against `fixture-hash-before.json`: all 8 files sha256-identical,
fixture untouched). Analysis performed under the `plugin-upgrade` skill (Mode A · inspect —
no migration or installation was executed). Card citations use the skill's
`references/` card IDs; fixture citations use evidence-pack filenames.

**Evidence base**: `browser-error.txt`, `host-boot-log.txt`, `plugin/lib/client.js`,
`plugin-apply-error.txt`, `profile/cordis.patch.yml`, `restart-notes.txt`,
`working-plugin-excerpt.txt`. Key cards: troubleshooting rows 13/14 (the two exact error
signatures), DSH-0.1.1-R1-03/R1-04/R1-05, DSH-0.1.2-A1-19, DSH-0.1.2-A1-26, DSH-0.1.5-A1-20,
DSH-0.1.7-A2-04, DSH-0.1.7-J1-34, DSH-0.1.6-A1-22, rollup R-02, example 06.

---

## 1. Failure 1 root cause — why ONE plugin's bare-ESM bundle took down EVERY plugin

### What the host actually assembles, and in what form it reaches the browser

At boot, the host's **client-modules** layer enumerates every installed package that declares
`dsh.client` (`platform: web` + client entry — DSH-0.1.1-R1-03), reads each package's client
bundle (`lib/client.js`), and **concatenates all of them into ONE bundle "combo" served as a
single classic (non-module) `<script>`**. The boot log states this verbatim
(`host-boot-log.txt`):

> `[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)`

The combo is advertised to the page through `window.__DSH_BOOT__` as revision-bearing
combo URLs of the form `/plugins/??<pkg>/lib/client.js&…&rev=…` (note the `??` batch
separator) — DSH-0.1.2-A1-19 / DSH-0.1.2-A1-26. Each plugin's bundle is expected to be a
**loader entry**: a call to `window.__ModuleLoader__.load({ id, factory })` that registers the
module under its package name; the browser-side plugin loader then imports/awaits these
registered entries per the boot manifest.

### Why one ESM token kills all 53 entries

The user's bundle (`plugin/lib/client.js`) is **bare ESM**: its very first token is a
top-level `import` (`import React from 'react'` at line 1, column 1 — matching the reported
`compile error (position 1:1)`), and it ends with `export function apply`.

A classic script is **parsed/compiled as a whole before any of it executes**. Concatenation
does not isolate modules: the single `import` statement at position 1:1 of the
`@lhh010/dsh-profiles` segment is a syntax error in classic-script grammar, so the **entire
4.5 MB combo fails at compile time and not one line of it runs** — none of the 53
`__ModuleLoader__.load(...)` registration calls of ANY plugin ever execute. This is exactly
the documented failure family (troubleshooting row 13): "some plugin's client bundle contains
raw ESM (a top-level `import`), and one ESM token fails the WHOLE classic-`<script>` bundle
combo at compile time." Registration is all-or-nothing at the combo level, so a single
malformed newcomer bundle erases the entire client-plugin fleet: Settings → Plugins shows an
empty list and the two previously-working stock plugins (brand version, file tracking)
disappear from the header too (`browser-error.txt`).

### Why the error named `@deepseek-ai/dsh-typert-registry` — an innocent stock entry

The error text (`browser-error.txt`):

> `Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry): client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`

Because the combo never executed, **no** manifest entry ever appears in the module registry.
The client plugin loader walks the boot manifest and awaits entries' registrations **in
manifest order**; the **first awaited entry** — here hash `0c013085`,
`@deepseek-ai/dsh-typert-registry`, a stock host package the user never touched — is the
first one whose awaited registration can never arrive, so the loader's headline failure names
*it*. The named id is a symptom of the await order, not an attribution of fault (troubleshooting
row 13: "the named `<id>` is only the first awaited entry (e.g. `dsh-typert-registry`,
innocent)"; the same misattribution pattern is real-host-verified in DSH-0.1.5-A1-20: "the
first unregistered entry is named (an innocent one) and ALL client plugins fail to load").

Critically, **the real culprit is already in the same message**: the wrapped cause after the
colon — `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error
(position 1:1)` — names the offending bundle and the exact source position. The trap is the
human reading only the headline entry name.

---

## 2. Diagnosis discipline — locating the culprit from a misleading error, and the required bundle format

### How the culprit should have been located

1. **Read the full error chain, not the headline.** The headline names the first *awaited*
   entry (innocent); the wrapped cause names the *compiled* bundle and position
   (`@lhh010/dsh-profiles/lib/client.js`, 1:1). Treat "failed to import loader entry X" +
   "zero plugins registered" as a **whole-combo** failure signature, never as a defect of X
   (troubleshooting row 13; DSH-0.1.5-A1-20's "attribute before touching plugins").
2. **Bisect the patch layer's `insert` rows** (`profile/cordis.patch.yml`). The only recent
   change is the new third insert row (`id: dsh-profiles`, `name: '@lhh010/dsh-profiles'`);
   comment it out (or bisect halves of recent inserts in general), restart the host, and
   re-check: if the plugin list comes back, the culprit lives in the removed set. This is the
   documented bisection axis for this exact symptom (troubleshooting row 13: "Bisect the patch
   layer's `insert` rows to find the culprit").
3. **Cheap static check that flags the offending bundle without any browser**:
   - `node --check lib/client.js` — parses the file as a **classic/CommonJS script**; a
     top-level `import`/`export` fails the check offline and points at the exact position
     (this single command reproduces the host's compile error locally);
   - `rg -n "^\s*(import|export)\b" lib/client.js` — bare-ESM token scan;
   - `rg -n "__ModuleLoader__|PLUGIN_ID" lib/client.js` (pre-flight touchpoint #5 static
     scan) — a correctly packaged bundle contains the `window.__ModuleLoader__.load({ id …`
     wrapper; its **absence** plus top-level `import` proves raw ESM;
   - server-side confirmation: fetch the combo route (`curl -g` because of `??`) at the
     current rev and grep for each expected `__ModuleLoader__.load({ id: "<pkg>"` — the
     DSH-0.1.2-A1-26 verification recipe; a bundle whose registration call is missing (or a
     combo that 404s/omits modules, cf. DSH-0.1.5-A1-20's old-200/new-404 probe) localizes the gap.

### The client-bundle format an external plugin must ship (instead of bare ESM)

The working comparison bundle (`working-plugin-excerpt.txt`) shows the contract:

- **What wraps the code**: every client bundle must be a **loader entry** —
  `window.__ModuleLoader__.load({ id: "<bare package name>", factory: (require) => { … } })`.
  Inside the factory the code is CommonJS-style: `var module = { exports: {} }; var exports =
  module.exports; … return module.exports;`. This is what the community build preset
  (tsdown/esbuild) emits, with the registration id injected by the tsdown banner `PLUGIN_ID`.
  The **three ids must agree** (DSH-0.1.2-A1-26): registration id == `package.json` `name`
  == the assembly row's `name` in `cordis.patch.yml` (bare scoped package name, e.g.
  `'@lhh010/dsh-profiles'`).
- **How React is obtained**: never imported as ESM and never bundled — the factory receives an
  injected `require`, and shared host-provided modules are resolved **lazily inside the
  factory** from the host's module table: `require("react")` / `require("react/jsx-runtime")`,
  and host UI packages likewise (`require("@deepseek-ai/dsh-client-ui-primitives")` in the
  working excerpt). Build with these marked **external**. Requiring host-unique modules during
  *script evaluation* instead of factory time is the documented cross-cohort trap
  (`missed the module table`, rollup R-02/R-03).
- **What the wrapper must export**: `module.exports` must carry the Cordis plugin face —
  the **`apply(ctx)` function** (the working excerpt's `function apply(ctx) { ctx.slots.inject(...) }`)
  and the **`inject` service list** (`const inject = ["slots"]`) that strict injection
  requires: every service consumed via `ctx.get`/property access must be declared there or
  access throws `cannot get property without inject` (DSH-0.1.1-R1-04); genuinely optional
  services are probed weakly instead (DSH-0.1.1-R1-05). The user's `export function apply`
  is ESM syntax and part of the compile failure; in loader form `apply` is a property of the
  returned `module.exports`.
- **No top-level side effects**: the user's bundle appends a div to `document.body` and calls
  `createPortal` at module-evaluation time (lines 18–21 of `plugin/lib/client.js`). Even
  after re-wrapping, that pattern is wrong: all UI work belongs inside `apply`/the slot
  contribution's component lifecycle, not at bundle evaluation.

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

After repackaging, the combo compiles and every other plugin loads (`plugin-apply-error.txt`);
the failure is now isolated to this plugin's **apply time**:

> `failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared (a parent entry's children table must declare it)`

### Who declares slots, and why a bare registration of another entry's slot fails

`settings.section` is **owned by the settings UI shell entry** (the `ui-settings` package
family): the owning entry declares its seats in its slot contract and materializes them
through **its children table in the Cordis composition** — the error message says exactly this,
and DSH-0.1.7-J1-34 phrases it as "the settings shell declares the seat in its children".
An external plugin is a *sibling registrant*: it may contribute entries **into** a declared
slot but never declares the slot itself.

The reason a bare `ctx.slots.register({ name: 'settings.section', … }, ProfilesSection)`
fails is **ordering**: cross-package/cross-entry Cordis apply order is unconstrained
(troubleshooting row 14; DSH-0.1.7-J1-34: "cross-package apply order is unconstrained"). This
plugin's `apply` can run **before** the settings shell entry has declared `settings.section`;
the slot system rejects registration into an undeclared slot at apply time. The failure is
nondeterministic-looking precisely because it depends on composition order, not on the slot
name being wrong.

### The exact wrapping form the registration must use

Defer the contribution until the owner's declaration exists, with the slot system's
**`inject` wrapper** (troubleshooting row 14; example 06 step 5; official packages use the
same pattern, e.g. `ui-permission-presets` in DSH-0.1.6-A1-22 and the settings seats in
DSH-0.1.7-J1-34):

```js
function apply(ctx) {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: 'profiles-manager', order: 5 },
      ProfilesSection,
    ),
  )
}
```

`ctx.slots.inject(name, cb)` makes the contribution **wait on the declaring entry's slot
declaration**; only then does the inner `ctx.slots.register` run.

### Fields a registrant may pass vs. must not

- **May pass** (contribution identity/placement): `name` (the declared slot), `id` (unique
  registrant id), `order`, and — where the slot contract provides for it — presentational
  fields of the registrant such as `label`/`locale` (troubleshooting row 14: "the registrant
  passes only `name`/`id`/`order`(`label`)"; official keyed/list seats add contract-defined
  registrant fields like `locale`/`inject`, cf. DSH-0.1.6-A1-22).
- **Must NOT pass**: `kind` and `scope` — these are **declaration-owned** properties of the
  slot itself (single/keyed/list; root/session scope), fixed by the owning entry's children
  table and slot contract, never by a registrant. The user's registration passed
  `kind: 'section', scope: 'settings'` (`plugin/lib/client.js` line 25) and must drop both.
- Type note: `ctx.slots` typings come from `@deepseek-ai/dsh-client-ui-renderer/client`
  (example 06) — declare that package in devDependencies for the types; and confirm the target
  seat actually exists in the running DSH version's owning package contract (seats move between
  versions — e.g. `settings.plugin.item` was retired by 0.1.7, DSH-0.1.7-J1-31).

---

## 4. Dev-loop discipline — boot-assembled combo, restart procedure, Windows EADDRINUSE

### Why plugin-file edits never reach the browser without a host restart

The combo is **assembled once at host boot and cached in the host process**: the client-modules
line appears exactly once per boot (`host-boot-log.txt`), and the served artifact is a
revision-pinned (`rev=…`) snapshot of the install tree read at that moment. Editing any
plugin file on disk afterwards changes nothing in the browser — **even after a hard refresh** —
because the refresh only re-requests the same boot-cached combo (`restart-notes.txt` item 1).
This is carded behavior: "Client plugin bundles are read and cached when the host boots:
editing a served `lib/client.js` on disk no longer takes effect on page refresh alone; only a
host restart serves the new bytes" (DSH-0.1.7-A2-04). A refresh-only verification therefore
reports stale content and can mislead the diagnosis; the auto-reconnecting page may even keep
running pre-restart client bytes across a restart — verify the **served bundle content itself**
(fetch the combo URL and inspect), not just that the page responds.

### Correct restart procedure (per iteration)

1. **Fully stop the host process** — a browser refresh is not a host stop, and closing the
   terminal window is not a guaranteed stop either (see below);
2. start `dsh web` again (the boot log must show a **new** `composed … loader entries into
   client bundle combo` line);
3. **hard-refresh** the browser;
4. check Settings → Plugins → Plugin list — **an empty list means the combo failed again**
   (`restart-notes.txt` item 3); then verify the plugin's registration/DOM marker, per the
   DSH-0.1.2-A1-19 discipline (HTTP 200 alone proves nothing).

### Why the Windows restart died with EADDRINUSE until the tree was killed

On Windows, "stopping" the host by **closing the launching terminal** can leave node processes
alive: the host runs as a **process tree** (shell → node host → spawned children), and closing
the console does not reliably terminate every member — an orphaned node process keeps the
listening socket **bound**. The next `dsh web` boot then fails to bind the same port with
**EADDRINUSE** (`host-boot-log.txt` note 2; `restart-notes.txt` item 2). The orphan only
released the port when the **entire tree** was force-killed:

```
taskkill /PID <pid> /T /F
```

(`/T` = whole tree, `/F` = force). The following boot then bound normally. Discipline: locate
the holder first (`netstat -ano | findstr :<port>` → PID; or `Get-Process node`), kill the
tree, and only then restart. The same "fully stop the host first" rule also prevents the
Windows **EBUSY** file-lock class of failures — a running host holds locks on loaded
host-half/native files (troubleshooting row 19).

---

## 5. Prevention

### What the HOST could do (startup / combo-failure time)

1. **Per-bundle compile validation at assembly**: before concatenating the 53 entries, parse
   each plugin bundle individually as a classic script (e.g. `vm.Script`/acorn per module).
   On failure, log and advertise the **offending package name + position**, and serve the combo
   **without** that module (fail-soft): one malformed bundle should degrade to one missing
   plugin, never to a fleet-wide blackout.
2. **Attribution at combo-failure time**: when entries fail to register, diff the boot roster
   against actual `__ModuleLoader__` registrations and report "N entries never registered;
   combo compile error in bundle `<pkg>/lib/client.js` at 1:1" instead of surfacing the
   **first awaited entry** as the headline. The cause information already exists in the wrapped
   error (`browser-error.txt` names the real bundle in its cause clause) — promote the cause,
   or list all unregistered entries, so the innocent first-awaitee (`dsh-typert-registry`) is
   never the face of the failure.
3. **Module isolation in delivery**: serve per-module scripts (or wrap each loader entry in
   its own `<script>`/try-catch, or move to real ESM with an import map) so a syntax error is
   scoped to one module instead of poisoning one shared classic script.
4. **Startup format lint at roster build**: flag bundles that contain top-level
   `import`/`export` tokens, lack the `__ModuleLoader__.load({ id …` wrapper, or whose
   registration id ≠ `package.json` name ≠ assembly-row name (the three-id agreement of
   DSH-0.1.2-A1-26) — reported **with the package name** before the combo ships. The existing
   `loaded without registering "<id>"` assertion fires too late (after the combo is already
   down); a pre-flight parse check fires before serving.

### External-plugin authoring template / checklist

**Manifest & install**
- [ ] `package.json` declares `dsh.client` (`platform: web` + client entry); verify the
      **packed** manifest, not just source (DSH-0.1.1-R1-02/R1-03).
- [ ] One `insert` row in the profile `cordis.patch.yml` with the **bare scoped package name**;
      never re-insert ids a bundle layer already provides (a duplicate insert is a fatal
      `duplicate loader entry id`, troubleshooting row 18).
- [ ] Link/copy install into the profile's `node_modules` is a plain dependency install; check
      `LinkType`/`Target` before copying (junction installs share one physical tree,
      troubleshooting row 20).

**Client bundle format**
- [ ] Ship the loader form: `window.__ModuleLoader__.load({ id: "<package name>", factory:
      (require) => { var module = { exports: {} }; … return module.exports } })` — produced by
      the community build preset (tsdown banner `PLUGIN_ID`), **never bare ESM**.
- [ ] Three-id agreement: registration id == `package.json` name == assembly-row name
      (DSH-0.1.2-A1-26).
- [ ] `react`, `react-dom`, `react/jsx-runtime`, host `@deepseek-ai/dsh-client-*` packages
      are **external**, obtained via the injected `require` inside the factory; nothing
      platform-specific is required at script-evaluation time (rollup R-02).
- [ ] `module.exports` carries `apply(ctx)` and `const inject = [...]` listing every service
      consumed (strict injection, DSH-0.1.1-R1-04); optional services probed weakly
      (DSH-0.1.1-R1-05).
- [ ] No top-level DOM/side effects at module evaluation; all UI work inside `apply`/components.
- [ ] Offline gate before install: `node --check lib/client.js` passes **as a classic script**;
      `rg -n "__ModuleLoader__|PLUGIN_ID" lib/` hits; `rg -n "^\s*(import|export)\b" lib/client.js`
      does not.

**Slot contributions**
- [ ] Confirm the target seat exists in the running DSH version's **owning package slot
      contract** (seats move/retire across versions: `settings.plugin.item` retired by 0.1.7,
      DSH-0.1.7-J1-31; `details`→`rightbar`, DSH-0.1.5-A1-14).
- [ ] Register into another entry's slot **only** wrapped:
      `ctx.slots.inject(name, () => ctx.slots.register(...))` (apply order is unconstrained).
- [ ] Registrant passes only `name`/`id`/`order` (+ contract-defined registrant fields like
      `label`/`locale`); **never** `kind`/`scope`.
- [ ] `ctx.slots` types from `@deepseek-ai/dsh-client-ui-renderer/client` in devDependencies
      (example 06).

**Dev loop & verification**
- [ ] Every client-file edit ⇒ **full host restart** (boot-cached combo, DSH-0.1.7-A2-04);
      browser hard refresh afterwards; empty Plugin list = combo failed again.
- [ ] Windows stop discipline: fully terminate the host **process tree**
      (`taskkill /PID <pid> /T /F` after `netstat -ano | findstr :<port>`) before restarting —
      closing the terminal can orphan a socket-holding node process (EADDRINUSE) and a running
      host holds file locks (EBUSY).
- [ ] Post-restart verification per DSH-0.1.2-A1-19/A1-26: `window.__DSH_BOOT__.entries`
      contains the package name; fetch the advertised combo URL (`curl -g` for `??`) and grep
      `__ModuleLoader__.load({ id: "<pkg>"`; boot log free of `loaded without registering` /
      `entries did not activate`; then a real DOM marker/behavior check — a bare HTTP 200 is
      not proof of registration.

---

## One-paragraph summary

The browser loads all 53 plugin client bundles as **one boot-assembled, revision-pinned classic
script combo**; the new plugin shipped **bare ESM**, whose top-level `import` at 1:1 is a
classic-script syntax error that fails the whole combo at compile time, so no
`__ModuleLoader__.load` registration of any plugin ever runs and the loader's headline error
names merely the **first awaited manifest entry** (`dsh-typert-registry`, innocent) while the
wrapped cause already pins the culprit bundle. The fix is the loader-wrapper format
(`__ModuleLoader__.load({ id: <package name>, factory: (require) => … })`, React via injected
`require`, exports `apply` + `inject`). Failure 2 is a slot-ownership/ordering violation:
`settings.section` is declared by the settings shell entry's children table, cross-entry apply
order is unconstrained, so registration must be deferred with
`ctx.slots.inject(name, () => ctx.slots.register(...))` passing only `name`/`id`/`order`
(never `kind`/`scope`). The dev loop requires a **full host restart** per client edit
(boot-time combo cache), and on Windows the host must be stopped as a whole process tree
(`taskkill /T /F`) or an orphaned node process keeps the port bound (EADDRINUSE). Prevention:
host-side per-bundle compile validation and cause-first error attribution; authoring-side a
packaging/slot/dev-loop checklist as above.
