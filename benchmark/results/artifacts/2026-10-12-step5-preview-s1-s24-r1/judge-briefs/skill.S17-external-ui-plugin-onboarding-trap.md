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

# S17 · External UI Plugin Onboarding Trap — Incident Report

Scope: read-only diagnosis of the evidence pack under
`benchmark/.../S17-external-ui-plugin-onboarding-trap/fixture/` (unchanged), cross-checked against the
read-only `plugin-upgrade` skill (`SKILL.md`, `references/troubleshooting.md`, `references/v0.1.2-alpha.1.md`
`DSH-0.1.2-A1-25/26`, `references/v0.1.5-alpha-1.md` `DSH-0.1.5-A1-20`, `references/v0.1.7-alpha-2.md`
`DSH-0.1.7-A2-04`, `references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md` `J1-30…J1-34`,
`examples/06-real-world-batch-migration.en.md`). No migration, install, or host run was executed.

---

## 0. Evidence used

| Fixture | What it establishes |
|---|---|
| `profile/cordis.patch.yml` | 3 insert rows: `dsh-brand-version` → `@local/dsh-brand-version`, `dsh-file-trace` → `@dsh-external/dsh-file-trace`, `dsh-profiles` → `@lhh010/dsh-profiles` (the only new row) |
| `plugin/lib/client.js` | The user-written client bundle: two top-level `import` statements, top-level DOM/`createPortal` side effects, top-level `export function apply(ctx)` with a bare `ctx.slots.register({name:'settings.section', id:'profiles-manager', order:5, kind:'section', scope:'settings'}, …)` |
| `browser-error.txt` | `Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry): client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — plugin list EMPTY, both stock plugins also gone |
| `plugin-apply-error.txt` | Second boot, after repackaging: `failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared (a parent entry's children table must declare it)`; all other plugins fine |
| `host-boot-log.txt` | `[boot] cordis patch layer: 3 insert rows resolved` · `[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)` — once per boot; EADDRINUSE note |
| `restart-notes.txt` | Combo assembled once at boot; disk edits invisible until full host restart; Windows EADDRINUSE until `taskkill /PID <pid> /T /F` |
| `working-plugin-excerpt.txt` | Working shell: `window.__ModuleLoader__.load({ id, factory: (require) => { var module = {exports:{}}; … require("react/jsx-runtime"); require("@deepseek-ai/dsh-client-ui-primitives"); const inject = ["slots"]; function apply(ctx){ … } return module.exports } })` |

Static read-only scan of the fixture confirms the culprit is unambiguous: the only file in the pack carrying
top-level ESM tokens is `plugin/lib/client.js` (`import React from 'react'`, `import { createPortal } from 'react-dom'`,
`export function apply`), and **no** file in the pack contains `__ModuleLoader__` — i.e. the new plugin ships no
registered client entry at all.

---

## 1. Failure 1 root cause — one bad bundle took down all 53 entries, and the named entry was innocent

### 1.1 What the host assembles, and in what form it reaches the browser

At boot the host runs the composition in two visible stages:

1. **Patch layer** — `[boot] cordis patch layer: 3 insert rows resolved`. Each `insert` row in the profile's
   `cordis.patch.yml` is resolved through its `name` field to a package installed in the web profile's
   `node_modules` (here a junction into `@lhh010/dsh-profiles`). The row's `name` must be the **bare package
   name with its scope** (fixture row 9: `name: '@lhh010/dsh-profiles'`) and it identifies the entry by that
   name — the 0.1.2 scan contract is `Entry name == package name` (`DSH-0.1.2-A1-26`).
2. **Client-modules** — `[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)`.
   Every resolved entry that declares `dsh.client` contributes its client artifact (`lib/client.js`) to a **boot
   roster** (`window.__DSH_BOOT__.entries`, keyed by package name). The host then reads all 53 artifacts and
   **concatenates them into ONE classic (non-module) script** — a revision-bearing combo URL advertised through
   the boot manifest (`/plugins/??<package>/client.js&rev=…`, `DSH-0.1.2-A1-19`). That single
   `<script>` — not a module, not 53 separate scripts — is what the browser loads.

Each artifact's job inside that combo is to call `window.__ModuleLoader__.load({ id, factory })`, which puts the
module into the loader's table. The loader then awaits the roster's entries in order and activates each by
calling the module's exported `apply(ctx)` with the Cordis client context.

### 1.2 Why one `import` broke every plugin

A classic script is parsed as classic script: **any top-level `import` or `export` token is a syntax error, and
there is no per-module recovery.** `plugin/lib/client.js` begins with `import React from 'react'` (line 1), so the
offending segment of the combo fails at `position 1:1` — the first byte of that plugin's chunk inside the 4.5 MB
concatenation, exactly matching the reported column. Because the whole 4.5 MB text failed to compile, **zero**
`__ModuleLoader__.load({…})` calls executed: nothing registered, so the plugin list was empty and *both* stock
plugins (`dsh-brand-version`, `dsh-file-trace`) vanished from the header even though their bundles were byte-perfect.
The failure is per-combo, never per-plugin — this is the same "one dropped/failed module fails every client
plugin's registration" blast radius carded in `DSH-0.1.5-A1-20`, here caused by the artifact's syntax rather than
by a host-side artifact/rev gap.

### 1.3 Why the error named `@deepseek-ai/dsh-typert-registry`

`0c013085 (@deepseek-ai/dsh-typert-registry)` is simply **the first entry the loader awaited** from the boot
roster — a stock host package the user never touched. With the combo dead, every awaited entry is unregistered;
the loader reports the first one it happened to wait on. The outer clause is an ordering artifact, **not
causality**. The actual culprit was carried in the inner clause of the very same message —
`client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — which names
the offending artifact by path. Reading only the headline entry name sends you debugging a stock host package
that is, by construction, innocent.

---

## 2. Diagnosis discipline — how to find the culprit, and the contract the plugin broke

### 2.1 Locating the culprit from the misleading error

1. **Read the whole error, not the entry name.** `failed to import loader entry <id>` + `bundle <path> compile
   error` ⇒ the path is the culprit, the id is the first awaited entry. Confirm the id is a stock package
   (`@deepseek-ai/*`) and that it was never edited.
2. **Bisect the patch layer, not the plugins.** `profile/cordis.patch.yml` is 3 rows; exactly one is new
   (`dsh-profiles`) and the two stock rows predate the incident — the culprit is the row added since the last
   good boot. For a larger fleet, remove half the `insert` rows, boot, and re-add until the row that restores the
   list is the row that broke it. Removing one insert row is the smallest fully reversible experiment.
3. **Attribute before touching code** (the `DSH-0.1.5-A1-20` discipline): fetch the advertised combo URL and
   confirm the failure is compile-side (one segment's parse error) rather than host-side (an artifact 404s while
   others at the same rev answer 200). Here the log already names the artifact path, so no HTTP probing is needed.
4. **The cheap static check** — one command over the installed artifact, no host run:

   ```sh
   rg -n "^import |^export |__ModuleLoader__|PLUGIN_ID" <plugin>/lib/client.js
   ```

   A valid client bundle must satisfy: **contains** `__ModuleLoader__.load({ id: "<bare package name>"`, and
   **contains no top-level `import`/`export` tokens**. Do **not** rely on `node --check lib/client.js` for this:
   Node decides ESM vs CJS from the file extension/package `type`, so a classic-script-incompatible file can
   still pass a syntax check; the grep is the ESM-token check that matches the browser's parse mode. For
   source-built plugins add `rg -n "@deepseek-ai/dsh-client-runtime" src/ package.json` (any hit is a phantom
   dependency, `DSH-0.1.2-A1-25`).

### 2.2 The client-bundle contract an external plugin must ship instead of bare ESM

An external Web Client plugin must ship a **ModuleLoader classic-script bundle**, not a bare ESM module
(shaped like `working-plugin-excerpt.txt`):

```js
// lib/client.js — classic script, no top-level import/export anywhere
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",                 // == package.json name == patch row name
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");                                   // React obtained INSIDE the factory
    let react_jsx_runtime = require("react/jsx-runtime");
    let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    const inject = ["slots"];                                       // wait for the slots service
    function apply(ctx) { /* ctx.slots.inject(...) … */ }
    module.exports.apply = apply;                                    // wrapper's export = the entry
    return module.exports;
  },
});
```

- **What wraps the code:** `window.__ModuleLoader__.load({ id, factory })` — the runtime registration call that
  turns the artifact into a loader entry. The `id` is the bare package name (scope included) and must match
  `package.json#name` and the patch row's `name` (`DSH-0.1.2-A1-26`); a mismatch yields
  `loaded without registering "<id>"` or a silently absent entry.
- **How React is obtained:** `require("react")` / `require("react/jsx-runtime")` **inside the factory**, resolved
  from the host's module table at evaluation time. Top-level ESM imports are impossible in a classic script, and
  the plugin must not assume it supplies React itself — browser-only libraries (react/react-dom and friends)
  belong in `devDependencies`, not `dependencies` (`DSH-0.1.5-A2-20`); only Host runtime libraries belong in
  `dependencies`.
- **What the wrapper must export:** the factory returns `module.exports`, and that export must carry the entry's
  `apply(ctx)` function (the activation hook the host calls) together with the entry's `inject` list (e.g.
  `["slots"]`, so the entry waits for the renderer's slot service instead of throwing on a missing service).
  Anything at top level that is not the `load({…})` wrapper — imports, `export`, or a module-scope
  `document.createElement`/`createPortal` call — is a composition-time hazard.

For this incident specifically: `apply(ctx)` in the user's file was fine in shape (a top-level
`export function apply(ctx)` would have worked *inside* such a wrapper); the module-scope portal/self-mount and
the top-level imports were not. Contributions to a host-owned settings section must be handed to the slot
(§3), not self-rendered at load time.

---

## 3. Failure 2 — `slot "settings.section" is not declared`

### 3.1 What the error means

Slots are **declared by their owner**. The entry that owns the settings shell declares `settings.section` in its
own **children table**; a third-party plugin only **contributes** into a slot that already exists. `ctx.slots.register`
is a declaration-time call: it asserts that the slot exists *right now*. Cross-entry (cross-package) apply order is
unconstrained, so a bare registration can land before the owner's declaration — and the apply step fails with
`slot "<name>" is not declared (a parent entry's children table must declare it)`. This is a documented
cross-plugin ordering failure (`references/troubleshooting.md`, `DSH-0.1.7-J1-34`, `DSH-0.1.7-J1-30`,
`examples/06` step 5).

Note the sequencing: the second boot proves the combo problem was gone (all other plugins loaded and rendered) —
the repackaging fixed failure 1 and exposed the next layer. Failure 2 is at **apply** time, on the host side, and
already names the offending entry (`@lhh010/dsh-profiles`) rather than an innocent one.

### 3.2 The exact wrapping form the registration must use

Defer the contribution until the declaring entry's slot table exists, via `ctx.slots.inject`:

```js
function apply(ctx) {
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5 },
    ProfilesSection,
  ))
}
```

`ctx.slots.inject(name, factory)` waits on the owning entry's declaration and only then runs the registration,
removing the ordering dependency entirely (`examples/06-real-world-batch-migration.en.md:81`, `troubleshooting.md`,
`DSH-0.1.7-J1-34`: "cross-package apply order is unconstrained").

### 3.3 Which fields a registrant may pass, and which it must not

- **May pass:** `name` (the declared slot's name), `id` (this contribution's id, unique within the slot), `order`
  (positioning), and `label` where the seat's contract uses it.
- **Must NOT pass:** **`kind` and `scope`** — these are declaration-time properties owned by the declaring entry.
  The user's call passed `kind: 'section'` and `scope: 'settings'`, i.e. the plugin asserted ownership of a slot
  it does not own. Drop both and pass only `{ name, id, order }`.
- Also declare `'slots'` in the client entry's `inject` list so `ctx.slots` exists before `apply` runs, and take
  the `ctx.slots` types from `@deepseek-ai/dsh-client-ui-renderer/client` (devDependency).

Version note: seat contracts move between corridors (e.g. the retired `settings.plugin.item` keyed slot and the
plugin-manager bundle forms in `DSH-0.1.7-J1-31`; new seats `settings.launcher` / `settings.models.sign-in` in
`DSH-0.1.7-J1-34`), so verify the target host's `ui-settings` slot contract at the target tag before adopting a
seat — never infer a slot's shape from memory.

---

## 4. Dev-loop discipline — why edits needed a restart, and the Windows EADDRINUSE

### 4.1 Why the combo is not rebuilt when plugin files change

The combo is assembled **once per host boot**: the host resolves the patch layer, reads every installed plugin's
client bundle, and concatenates the 53 loader entries into one classic script, which it then **caches and serves
for the lifetime of the process** with a revision stamp. Editing `lib/client.js` on disk therefore changes nothing
in the browser — not even after a hard refresh, because the page re-fetches the identical, identically-revisioned
combo. `host-boot-log.txt` and `restart-notes.txt` record exactly this ("The combo line appears ONCE per boot"),
and it is carded behavior: `DSH-0.1.7-A2-04` — client bundles are cached at host boot, an install-tree client
edit needs a host restart before the page sees it, and Web pages auto-reconnect after a server restart, so an
open page can keep working on **pre-restart bytes**. Consequence: a refresh-only verification can report stale
content and mislead a diagnosis; verify the served bytes (fetch the combo URL and inspect it), not just that the
page responds. Plane split to keep in mind: a change in `lib/index.js` (host half) has always required a host
restart; on this corridor a change in `lib/client.js` does too, because the artifact is only read at boot.

### 4.2 Correct restart procedure

1. **Fully stop the host process** — closing the launching terminal is not a stop, and a browser refresh is
   definitely not a host stop (`SKILL.md`, host-upgrade discipline; a running host also holds file locks, `EBUSY`).
2. **Start the host again** (`dsh web` on the target profile) and **wait for the boot lines**: `cordis patch layer:
   N insert rows resolved` then `client-modules: composed N loader entries into client bundle combo`. The combo
   line is the proof a NEW combo was assembled; without it you are looking at a stale process.
3. **Hard-refresh the browser.**
4. **Verify effect, not just liveness:** Settings → Plugins → Plugin list (an empty list means the combo failed
   again), then the plugin's own DOM marker / rendered settings section. Per `DSH-0.1.2-A1-19`, a 200, a URL, or
   an id in `entries` alone does not prove a plugin works.

### 4.3 Why the Windows restart died with EADDRINUSE

On Windows, closing the launching terminal detaches the console but leaves the **node host process alive** — the
process tree is not torn down with the window. The orphan kept holding the listening port, so the **next** host
boot failed with `EADDRINUSE` (port already bound), and the plugin state in the browser was still being served by
that orphan — i.e. the old, pre-edit combo. Killing the entire process tree (`taskkill /PID <pid> /T /F`) freed
the port, and the following boot bound normally. Practical disciplines: stop the host by killing its process
**tree** (not the terminal), and before restarting verify that no previous host process still holds the port —
otherwise every "restart" observation is actually a report from the orphan, which is exactly how a "my edit did
nothing" loop is manufactured. Closing the terminal first is also the safe order for any later file replacement
(a live host holds file handles ⇒ `EBUSY`).

---

## 5. Prevention

### 5.1 Host-side (startup and combo-failure time)

1. **Validate each artifact before concatenating it into the combo.** Parse every resolved client artifact in the
   mode it will be served in — a classic script. An artifact that fails to parse (any top-level `import`/`export`
   token) must be reported **by plugin name and path** at boot, e.g.
   `[boot] client-modules: EXCLUDED @lhh010/dsh-profiles (lib/client.js): classic-script parse error at 1:1 (top-level ESM)`,
   and either excluded with a warning or the boot refused with that name — never silently concatenated.
2. **Attribute combo failures to the offending segment, not the first awaited entry.** The host already knows the
   segment→artifact mapping, so a failure at `position 1:1` of the combo should report the artifact path as the
   **subject** and the awaiting entry id at most as a symptom line. The current message does name the path, but
   buries it as a sub-clause of `failed to import loader entry <id>` — the headline is what operators act on.
3. **Contain the blast radius.** Serve/evaluate entries so that one unparseable artifact cannot fail the other 52:
   a bad entry is skipped (with its name) and the remaining entries still register, instead of the plugin list
   going empty and every stock plugin disappearing.
4. **Fail fast at discovery/install.** When the scan resolves an entry's `dsh.client` artifact, check the two
   cheap invariants and warn/fail at install or boot with the plugin's name: presence of
   `__ModuleLoader__.load({ id: "<package name>"`, absence of top-level ESM tokens. `dsh plugin add` reporting
   `declares no dsh.bundle — installed as a plain dependency, not a profile layer` is the same "say it plainly"
   pattern the host already uses.
5. **Detect the slot class of error earlier.** At apply failure, the current message already names the plugin;
   the host can additionally suggest the fix (slot declared by another entry ⇒ wrap with `ctx.slots.inject(name, …)`)
   and name the declaring entry, turning a dead end into a one-line repair.
6. **Make boot self-attributing overall:** the boot log already prints `3 insert rows resolved` and
   `composed 53 loader entries … 4.5 MB`; printing the per-entry served artifact list (name → `lib/client.js`) gives
   operators a direct diff surface when something is missing from the roster.

### 5.2 External-plugin authoring template / onboarding checklist

Template skeleton for `lib/client.js` (classic-script ModuleLoader bundle):

```js
window.__ModuleLoader__.load({
  id: "@scope/my-plugin",                    // == package.json name == cordis.patch.yml row name
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let jsx = require("react/jsx-runtime");                                  // React from the host module table
    let primitives = require("@deepseek-ai/dsh-client-ui-primitives");       // if used
    const inject = ["slots"];                                                // wait for services you consume
    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register(         // cross-entry slot ⇒ always inject
        { name: 'settings.section', id: 'my-plugin', order: 10 },            // name/id/order only —
        ProfilesSection,                                                     // NEVER kind / scope
      ))
    }
    module.exports.apply = apply;                                            // export = the activation entry
    return module.exports;
  },
});
```

Checklist for the next onboarding (each item maps to one of the three failures):

**Packaging contract (failure 1)**
- [ ] `lib/client.js` is a **classic script** containing `window.__ModuleLoader__.load({ id, factory })` — no
      top-level `import`/`export` anywhere; `rg -n "^import |^export " lib/client.js` returns nothing.
- [ ] Registration id == `package.json#name` == the profile patch row's `name` (bare name **with scope**).
- [ ] React / react-dom / host primitives are `require(...)`-d **inside** the factory; browser-only libraries sit
      in `devDependencies`, not `dependencies`; `dsh.client.inject` names only real service packages (no
      `dsh-client-runtime` remnant).
- [ ] The factory returns `module.exports` carrying `apply(ctx)` (plus the entry's `inject` list).

**Slot contribution contract (failure 2)**
- [ ] The target slot is declared by **another** entry ⇒ wrap with `ctx.slots.inject(name, () => ctx.slots.register(...))`.
- [ ] Registration fields limited to `name` / `id` / `order` (+ `label` where the seat's contract uses it); never
      `kind` / `scope`.
- [ ] `'slots'` declared in the entry's `inject`; `ctx.slots` types from `@deepseek-ai/dsh-client-ui-renderer/client`.
- [ ] The seat's contract verified against the **target host tag** (seats are added/retired per corridor).

**Composition (install)**
- [ ] Plugin linked into the profile's `node_modules` + exactly **one** `insert` row in the profile's
      `cordis.patch.yml`; no duplicate row for anything the bundle layer already provides (a duplicate insert is
      fatal: `duplicate loader entry id`).

**Dev loop (failure 3)**
- [ ] Edit → **full host process-tree stop** → start → wait for the `composed N loader entries …` combo line →
      hard refresh → check the plugin list **and** the plugin's own render marker.
- [ ] On Windows, if the port stays bound: `taskkill /PID <pid> /T /F`, confirm no orphan host, then boot again.
- [ ] Verify the **served** artifact (fetch the combo URL / `window.__DSH_BOOT__.entries` contains
      `"id":"<package name>"`), not merely that the page responds — auto-reconnect can hide stale bytes.
- [ ] Rollback step recorded: delete the `insert` row (the plugin leaves the composition; the rest of the fleet
      boots unchanged) before touching plugin code again.

---

## 6. Verification of this diagnosis against the evidence

| Claim | Evidence |
|---|---|
| Culprit = `@lhh010/dsh-profiles` client bundle | Only file with top-level ESM tokens in the pack (`plugin/lib/client.js:1-2,23`); error's inner clause names its path; only new insert row is `dsh-profiles` |
| Named entry is innocent | `@deepseek-ai/dsh-typert-registry` is a stock `@deepseek-ai/*` entry, absent from the profile patch, and the whole-combo failure means the first awaited entry fails first |
| Failure 2 is cross-entry slot ordering, not a missing slot | Apply-time error only, after repackaging; all other plugins load; the fix is `ctx.slots.inject` wrapping and dropping `kind`/`scope` |
| Dev loop requires full host restart | `host-boot-log.txt` combo line once per boot; `restart-notes.txt` edits invisible; `DSH-0.1.7-A2-04` boot-time caching |
| EADDRINUSE is a Windows orphaned-process-tree symptom | `restart-notes.txt`: terminal closed → node still alive → `EADDRINUSE` → resolved by `taskkill /PID <pid> /T /F` |

No plugin, host, evaluator, or fixture file was modified; the fixture remains byte-identical to its recorded state.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.