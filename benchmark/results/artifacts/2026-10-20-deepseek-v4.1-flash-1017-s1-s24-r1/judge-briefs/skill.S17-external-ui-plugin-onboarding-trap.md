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
#### FILE: S17-external-ui-plugin-onboarding-trap/report.md

# S17 · External UI Plugin Onboarding Trap — Incident Report

**Target**: `@lhh010/dsh-profiles` (hand-written external Web Client plugin, link-installed into the `web` profile)
**Mode**: read-only post-incident analysis (fixture byte-identical, nothing executed, nothing installed, no host started)
**Evidence pack**: `fixture/README.md`, `browser-error.txt`, `host-boot-log.txt`, `plugin/lib/client.js`, `profile/cordis.patch.yml`, `plugin-apply-error.txt`, `restart-notes.txt`, `working-plugin-excerpt.txt`
**Skill cards consulted (IDs only)**: `DSH-0.1.1-R1-01/02/03`, `DSH-0.1.2-A1-25/26`, `DSH-0.1.2-A3-01`, `DSH-0.1.5-A1-20`, `DSH-0.1.7-A2-04`, `DSH-0.1.7-J1-31/34`, plus the troubleshooting lookup rows for "failed to import loader entry" and `slot "…" is not declared`.

---

## 0. Executive verdict

| # | Symptom | Real cause | Whose defect | Fix class |
|---|---|---|---|---|
| 1 | Browser: `failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)`, **zero** plugins registered | `@lhh010/dsh-profiles/lib/client.js` was shipped as **bare ESM with a top-level `import`**; the host concatenates all client bundles into **one classic `<script>`**, so one ESM token is a parse error for the *entire* composed unit — before any `__ModuleLoader__.load` runs | plugin packaging (external author) + a **host diagnosability** gap | repackage as `__ModuleLoader__.load({id, factory})` with `require("react")` |
| 2 | Apply time: `slot "settings.section" is not declared (a parent entry's children table must declare it)` | bare `ctx.slots.register` on a slot owned/declared by **another entry**; cross-package apply order is unconstrained, so the registration can land before the owner declares the seat. Also passed owner-only fields `kind`/`scope` | plugin slot-contract misuse | wrap in `ctx.slots.inject(name, () => ctx.slots.register({name,id,order[,label]}, C))`, pass no `kind`/`scope` |
| 3 | Every client edit needs a host restart; one restart died with `EADDRINUSE` | the host composes **one** client-bundle combo **once at boot** and serves those bytes (a refresh is not a recompose); on Windows closing the terminal left the node host alive holding :3080 | environment / dev-loop misunderstanding (host behaviour is by design) | full host stop → confirm port free → start → hard refresh; `taskkill /PID <pid> /T /F` for the orphan |

The three failures are **independent layers**, not one bug: fixing #1 (packaging) exposed #2 (apply-time slot contract), and #3 was never a plugin bug at all. Failure #1's error text is misleading in its *subject* but not empty in its *cause chain* — see §2.4.

---

## 1. Failure 1 — why ONE bundle took down EVERY plugin

### 1.1 What the host actually assembles, and what reaches the browser

Per the boot log and the verified registration contract:

1. At boot, `client-modules` enumerates every package in the profile that declares `dsh.client` (manifest scan; a package without that declaration never enters the browser roster at all — card `DSH-0.1.1-R1-02/03`), and for each entry reads its client artifact (here `lib/client.js`) **from disk, once**.
2. It **concatenates** those files, in roster order, into **a single client-bundle combo** — the log line is explicit: `composed 53 loader entries into client bundle combo (4.5 MB, classic script)`. "Classic script" is the load-bearing word: the artifact is delivered as *one* plain `<script>` document, **not** as an ES module graph, not as 53 separately-parsed scripts.
3. That one document is advertised through `window.__DSH_BOOT__.entries` (roster: entry hash + package name, in order) and fetched from the combo route `/plugins/??<pkg>/client.js&rev=<rev>` (the `??` combo form).
4. The browser **compiles and runs that single unit**. Registration only happens when the unit executes a `window.__ModuleLoader__.load({ id, factory })` call; the client loader then waits, in roster order, for each roster entry's registration and applies it. The bundle's registration `id` must equal the `package.json` `name` (card `DSH-0.1.2-A1-26`).

So the unit that reaches the browser is **one anonymous script** whose per-plugin boundaries exist only as comments/conventions. Nothing in the delivered form says "these 900 lines belong to plugin X".

### 1.2 What the offending file did

`plugin/lib/client.js` is written as an ES module:

- `import React from 'react'`, `import { createPortal } from 'react-dom'` at **top level**;
- `export function apply(ctx)` at the bottom.

Inside a classic script both `import` and `export` are **syntax errors**. Crucially, a syntax error is raised at **compile time of the whole unit**, i.e. *before a single statement runs*. The 53 `__ModuleLoader__.load(...)` calls that make up the combo therefore **never execute** — including the 52 perfectly valid ones.

Result: the roster lists 53 entries, none is ever registered, every entry's await fails, and the UI reports zero plugins — the two stock plugins (brand version, file trace) that rendered fine before the insert also disappear, exactly as `browser-error.txt` records.

### 1.3 Why there is no fault isolation

The composition model has one compilation unit and no per-entry try/catch around *parsing*. A **runtime** error inside one factory would only kill that one entry (the other 52 would already have registered). A **parse** error cannot be contained that way, because parsing precedes execution of every entry. This asymmetry is the whole trap: the failure mode looks like "all plugins are broken", which sends the user toward the host, the roster, or the innocent package named in the message.

### 1.4 Why the error names `@deepseek-ai/dsh-typert-registry` (which is innocent)

The browser-side loader reports **the first entry it was awaiting** (`0c013085`, roster position 0), not the file that failed to parse:

- the entry id is a function of **roster/await order**, so it is stable across boots and always points at whatever stock package happens to be first;
- the named package's own bundle is untouched, valid classic script, and would have registered normally had the unit executed;
- the fixture itself flags this ("note WHICH entry it names").

Read the message as a whole, though — the *wrapper* names an entry, but the nested cause is informative:

```
failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
  client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

The `client-modules: bundle … compile error` line **does** path-name the offending artifact, and "compile error" (not "threw", not "timeout") already says *parse*, not *runtime*. `position 1:1` is a coordinate in the **composed artifact**, not a line in the user's file — it carries no per-plugin information and must not be read as "line 1 of my plugin". The diagnostic discipline is: **never accept the subject of the outer message as attribution; follow the cause chain, then prove it.**

### 1.5 Secondary defects in the same file (they would still bite after wrapping)

Even inside a correct wrapper this bundle is wrong in four more ways; worth fixing in the same pass:

| Defect | Consequence |
|---|---|
| module-scope side effects: `document.createElement('div')` + `document.body.appendChild` + `createPortal(...)` executed at load time, outside `apply` | runs during combo evaluation, before the React shell mounts; leaks a DOM node per evaluation, no cleanup, portal target can be detached by the host's root render; `createPortal(node, host, 'profiles-root')` also passes a meaningless third argument (a key, not a container id) |
| `export function apply` instead of returning it from the factory | the loader never sees `apply`; the entry registers but does nothing |
| slot registration passes `kind: 'section'`, `scope: 'settings'` | owner-only declaration fields → failure #2 (§3) |
| `React.createElement(...)` off a default `React` import | in the classic wrapper `require("react")` is a module namespace; default interop is not guaranteed — use `require("react/jsx-runtime")` (`jsx`/`jsxs`) or `React.createElement` via explicit interop |

---

## 2. Diagnosis discipline — how the culprit should have been found

### 2.1 Read the error at the right level (3 invariants)

1. **Scope of blast radius**: *all* entries empty, including stock plugins that were fine one boot ago ⇒ the failure is in the **shared artifact**, not in any one plugin's runtime logic and not in the host's roster.
2. **Error class**: "compile error"/"failed to import" of a *bundle* ⇒ **parse**, so the artifact is not a legal classic script. This is a packaging question, answerable statically, not a debugging question.
3. **Named id ≠ culprit**: the id is roster order. Treat `(@deepseek-ai/dsh-typert-registry)` as a *position marker*, and the nested `bundle <path>` as the *lead*.

### 2.2 What to bisect, and in what order

Bisect **the profile patch layer** (`fixture/profile/cordis.patch.yml`), because that is the only thing that changed between a good boot and a bad boot:

1. Record the last-good composition (the two stock `insert` rows) and the one new row (`id: dsh-profiles`, `name: '@lhh010/dsh-profiles'`).
2. Disable/remove **only** the new row (or set it `disabled: true`), then **fully restart the host** (a refresh cannot help — §4), hard refresh.
3. If the stock plugins come back and the list is no longer empty ⇒ the new package's client artifact is the culprit. This is a two-row bisect here; with N new rows, halve the set per boot, because combo assembly only happens at boot.
4. Re-enable and confirm reproducibility (same entry hash, same message) — attribution is complete only when the row toggles the symptom.

Never bisect by editing plugin source first: with the wrong wrapper the file cannot load at all, so nothing inside it is being exercised.

### 2.3 The cheap static check that flags the offending bundle

No host needed, no restart, seconds to run — on the suspected `lib/client.js`:

```powershell
# 1) classic-script parse (Node parses .js as a CommonJS script; top-level import/export is an immediate SyntaxError)
node --check .\plugin\lib\client.js
#    -> SyntaxError: Cannot use import statement outside a module

# 2) the same check as a grep, if node is unavailable
Select-String -Path .\plugin\lib\client.js -Pattern '^\s*(import|export)\s'
#    -> plugin\lib\client.js:1:import React from 'react'
#    -> plugin\lib\client.js:28:export function apply(ctx) {

# 3) the positive shape: a combo member must be a registration call, with id == package.json name
Select-String -Path .\plugin\lib\client.js -Pattern '__ModuleLoader__\.load\('
#    -> (no output = it is not a client bundle at all)
```

Any one hit from (1)/(2) is **conclusive**: the file cannot be a member of a classic-script combo. Compare the shell against `fixture/working-plugin-excerpt.txt` — a working member starts with `window.__ModuleLoader__.load({ id: "@local/dsh-brand-version", factory: (require) => { … } })` and contains no `import`/`export` at any depth outside strings. Diffing the *shell* (first and last 10 lines) is enough; there is no need to read component bodies.

Generalisation for the fleet: a repo-level lint over every `dsh.client` entry (`^import|^export`, `__ModuleLoader__.load` present, id == package name, `dsh.client` declared in the **packed** manifest) catches this class before install.

### 2.4 The client-bundle format an external plugin MUST ship

Bare ESM is never acceptable. The shipped artifact must be a **classic script that registers itself** through the host loader:

```js
// lib/client.js  — built artifact, plain script, no import/export anywhere
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",              // MUST equal package.json "name"
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const { jsx, jsxs } = require("react/jsx-runtime");   // host-provided
    const React = require("react");                        // host-provided, single instance
    const { createPortal } = require("react-dom");          // only if declared in dsh.client.inject

    /* components … */

    const inject = ["slots"];              // services consumed via ctx.*
    function apply(ctx) { /* … slot registrations … */ }

    return module.exports;                 // must expose apply (and inject when declared)
  },
});
```

- **What wraps the code**: the loader registration `window.__ModuleLoader__.load({ id, factory })`. The artifact is evaluated once as script; the `factory` is invoked at activation and is handed a `require` that resolves **only** modules the host provides (React, `react/jsx-runtime`, `react-dom`, and the client packages the manifest declares). No ESM keywords, no top-level `await`, no reliance on `module`/`exports`/`require` existing in the page scope before the factory runs.
- **How React is obtained**: `require("react")` **inside** the factory, together with `require("react/jsx-runtime")` for JSX. Never `import` it, and never bundle a second copy — two React instances produce broken hooks/dispatcher errors that look like component bugs.
- **What the wrapper must export** (i.e. what `factory` returns): `apply(ctx)` — the activation entry — plus the `inject` string array whenever the plugin touches `ctx.slots`/other services. The registration `id`, the assembly row's `name`, and `package.json` `name` are the **same bare scoped name** (card `DSH-0.1.2-A1-26`); the packed manifest must still declare `dsh.client` with `platform: "web"` and the entry path (cards `DSH-0.1.1-R1-02/R1-03`).
- **No module-scope DOM work**: mount in components; portals created in effects with cleanup.

The corrected file for this incident (all of §1.5 + §3 fixed):

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    const { jsx, jsxs } = require("react/jsx-runtime");
    // const { createPortal } = require("react-dom");     // only if "react-dom" is in dsh.client.inject
    // const { useEffect, useRef } = require("react");    // only if you need lifecycle

    const PROFILES = [
      { id: "web", label: "Web", engine: "dsh" },
      { id: "cli", label: "CLI", engine: "dsh" },
    ];

    function ProfilesSection() {
      return jsxs("div", {
        className: "profiles-section",
        children: [
          jsx("h3", { children: "DSH Profiles" }),
          ...PROFILES.map((p) => jsx("div", { children: p.label }, p.id)),
        ],
      });
    }

    const inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          { name: "settings.section", id: "profiles-manager", order: 5, label: "Profiles" },
          ProfilesSection,
        ),
      );
    }

    // host convention: populate module.exports and return it
    return Object.assign(module.exports, { apply, inject });
  },
});
```

---

## 3. Failure 2 — `slot "settings.section" is not declared`

### 3.1 Who declares slots

Slots belong to the entry that **owns the rendering site** — here the settings shell (the `ui-settings` family). The owning package declares the slot in its slot contract: the slot's name, `kind` (`single`/`list`/`keyed`), `scope`, owner props, and the **`children` table** that says which child slot names exist under a parent slot/seat. `settings.section` exists only because the settings shell declares it.

A **registrant** does not declare anything. It contributes an entry (component + `id` + `order`) *into* an already-declared slot. That is the entire distinction, and the message says it precisely: `a parent entry's children table must declare it` — the registry looked up `settings.section` in the declaring entry's children table and found nothing at the moment of registration.

### 3.2 Why a bare registration fails at apply time

`ctx.slots.register(name, C)` is executed **immediately**, during the plugin entry's `apply`. Cross-package apply order is unconstrained: the profile merely inserts both rows, so nothing guarantees the settings shell's entry has been applied (and has declared its seats) before `@lhh010/dsh-profiles` applies. On the second boot the plugin happened to apply first, the declaration did not exist yet, and the registry rejected the registration as an undeclared slot — a hard error that also aborts the rest of that entry's `apply`.

It is an ordering race, not a naming typo: the same code can pass on one boot and fail on another, which is why "it worked yesterday" is not evidence. The failure is deterministic in the sense that the code is *always* wrong.

The fixture's registration also passed `kind: "section"` and `scope: "settings"` — i.e. it tried to *re-declare* the owner's slot from the registrant side. Those fields are part of the declaring entry's contract, not the contribution's.

### 3.3 The exact wrapping form

```js
ctx.slots.inject("settings.section", () =>
  ctx.slots.register(
    { name: "settings.section", id: "profiles-manager", order: 5 },
    ProfilesSection,
  ),
);
```

`ctx.slots.inject(name, fn)` **defers** the registration until the slot is declared: the contribution waits on the declaring plugin's declaration instead of racing it, which is the canonical form for any slot owned by another package (the same rationale the corridor states for the two settings seats, card `DSH-0.1.7-J1-34`; general migration recipe in the batch example: slot registration becomes `ctx.slots.inject(name, () => ctx.slots.register(...))`).

### 3.4 Fields allowed vs forbidden for a registrant

| May pass | Must NOT pass |
|---|---|
| `name` (the declared slot name) | `kind` (`single`/`list`/`keyed`) — owner-declared |
| `id` (stable per-contribution id, unique within the slot) | `scope` (`root`/`session`/`session-maybe`…) — owner-declared |
| `order` (sort key among siblings) | `children` table, `owner`/owner-props type, `store`, `hookContext`, `slots` — all part of the declaration |
| `label` — only where the slot contract defines an entry label (tabs/settings entries) | `inject` in the *slot-declaration* sense (service injection belongs to the plugin's own `inject` array) |

Additionally: the contributed component must accept the props the declaring site passes (owner props / injected hooks) and must return `null` when it has nothing to render; nothing may assume the site mounts it synchronously.

### 3.5 Choosing the right seam for this host

`settings.section` is a shell-internal seat. For "a card in Settings → Plugins" the documented public seam at 0.1.2–0.1.6 is the **keyed** slot `settings.plugin.item[key = the plugin's settings namespace]` (card `DSH-0.1.2-A3-01`, with the Node half registering the namespace through the `settings` service). From 0.1.7 the plugin-manager family supersedes it (`plugins.bundle.config` keyed by package name, `plugins.row.config`, `plugins.item`, `plugins.detail.*` — card `DSH-0.1.7-J1-31`), and a plugin still registering `settings.plugin.item` **silently shows nothing**. So the second lesson is: confirm the seat exists **in the installed shell's contract at this DSH version** before writing the registration; if it does not, no wrapper will help — pick a declared seat. A wrapper (`ctx.slots.inject`) fixes ordering; it cannot conjure a slot nobody declares.

---

## 4. Dev-loop discipline — why edits need a restart, and why Windows needed a tree kill

### 4.1 Why the combo is not rebuilt

`host-boot-log.txt`: the `client-modules: composed 53 loader entries …` line appears **once per boot**. The host reads each `dsh.client` artifact from disk at boot, composes the single classic script, and serves *those bytes*. There is no watcher on plugin files and no recomposition on request: a browser refresh (even a hard refresh with cache disabled) re-fetches the **same boot-time artifact** — "no-cache" governs the HTTP cache, not the composed content. Card `DSH-0.1.7-A2-04` records exactly this behaviour (client bundles cached at host boot; an on-disk `lib/client.js` edit needs a host restart; a page may even keep working across a restart while running pre-restart bytes).

Consequences for diagnosis: after any client edit, a "still broken" observation may be measuring **stale bytes**, and a "fixed" observation may be measuring the old success. Always verify the **served artifact**, not the page's liveness.

### 4.2 The correct restart procedure

1. **Stop the host properly** — stop the `dsh web` process (Ctrl+C in its own console, or stop the managed job), not the terminal window.
2. **Prove it is gone**: `Get-NetTCPConnection -LocalPort 3080 -State Listen` (or `netstat -ano | findstr :3080`) must be empty. A bound port = a live host.
3. **Start the host again** (`dsh web`) and wait for the boot lines: patch rows resolved, combo composed, profile ready.
4. **Hard refresh** the page (Ctrl+Shift+R) or open a fresh window.
5. **Verify the artifact, not the UI**: the boot combo line (entry count/size changed as expected); `window.__DSH_BOOT__.entries` contains `"id":"@lhh010/dsh-profiles"`; the fetched combo script contains `__ModuleLoader__.load({ id: "@lhh010/dsh-profiles"`; Settings → Plugins is non-empty (an empty list means the combo failed again).
6. **Only then** judge the apply-time behaviour (slot error, rendering). The apply error of failure #2 only becomes visible *after* the combo parses — that is why the incident produced two different errors on two boots.

### 4.3 Why `EADDRINUSE` appeared, and why the tree kill was required

On Windows, closing the launching terminal (or Ctrl+C in a wrapper shell) can terminate only the **parent** process; the `node` host it spawned survives, detached, and keeps the listening socket on :3080 (and its native-module file handles) open. The browser tab was already disconnected, so nothing else looked wrong. The next boot cannot bind :3080 → `EADDRINUSE`; the old host, invisible, is still serving the pre-edit combo.

The port owner is the surviving node process, not a stale `TIME_WAIT` socket, so waiting does not help. Forensics and fix:

```powershell
# who owns the port
Get-NetTCPConnection -LocalPort 3080 -State Listen | Select-Object -ExpandProperty OwningProcess
Get-Process -Id <pid> | Select-Object Id, ProcessName, Path, StartTime
# kill the host AND its children (what the user eventually did)
taskkill /PID <pid> /T /F
# confirm, then start
Get-NetTCPConnection -LocalPort 3080 -State Listen
```

`/T` kills the child tree (node spawns helpers); `/F` is needed because a console-attached host may not honour a graceful close. Prevention: run the host as a managed console/job and stop *that* job; never "get around" `EADDRINUSE` by starting a second server on another port — it would compose and serve a different/stale combo and make every subsequent observation untrustworthy. The same "host still alive" fact explains file-lock (`EBUSY`) failures on the host half: the lock belongs to the host process, never to the browser tab.

---

## 5. Prevention

### 5.1 What the HOST should do

**At startup (combo assembly), per entry, before concatenation:**

1. **Parse each client artifact individually as a classic script** (`new vm.Script(src, { filename })` or equivalent) and reject with an attributed error:
   `plugin @lhh010/dsh-profiles: lib/client.js is not a valid classic script — top-level 'import'/'export' at 1:1; client bundles must call window.__ModuleLoader__.load({ id, factory })`.
   Cost: 53 text parses, once per boot — trivial next to composing 4.5 MB.
2. **Stop emitting one compilation unit.** Serve one `<script>`/`new Function` per entry (or `//# sourceURL=plugin:<name>/client.js` per segment) so a syntax error is contained to its entry and the good 52 keep registering. Even if the combo stays concatenated, compile-check entry-by-entry first and *exclude* the bad one with a visible per-plugin error instead of blacking out the fleet.
3. **Never report the first awaited entry as the cause.** On compile failure, emit `combo compile failed in <plugin> (<bundle path>): <parser message>`; if attribution is unavailable, bisect internally (compile prefixes/suffixes) and say so. At minimum, label the existing message honestly: `entry 0c013085 (@deepseek-ai/dsh-typert-registry) is the first unregistered roster entry, not the failing bundle`.
4. **Roster/manifest hygiene checks** at boot: registration id == package `name`; `dsh.client` present in the packed manifest; every `dsh.client.inject` module resolvable; duplicate loader entry ids are fatal (a second `insert` of an id the bundle layer already provides is a hard composition error) — report all of these with the plugin name.
5. **Make staleness visible**: compare `dsh.client` entry mtimes against the boot time and print `client bundle combo is stale (plugin X edited after boot) — restart the host to recompose`, or expose an explicit recompose/rebuild action. This turns the #3 trap into a message instead of an inference.

**On the slot side:**

6. When a registration targets an undeclared slot, name **both** sides: `plugin <registrant> registered "settings.section" before the declaring entry (<declaring package>) declared it — wrap with ctx.slots.inject(name, () => ctx.slots.register(...))`. Reject `kind`/`scope` on a contribution with a message that says those are declaration fields. Optionally expose `ctx.slots.declared()` for diagnostics, and let a failed contribution fail *only that contribution*, not the entry's whole `apply`.
7. Log once per boot the mapping `entry hash ↔ package name ↔ bundle path` so any roster-order message is immediately resolvable.

**Distribution-side:**

8. Ship an official external-plugin authoring template whose build emits the loader wrapper and whose `package.json` carries `dsh.client` + a banner-injected `PLUGIN_ID == name`; add `dsh plugin lint --client` running the same static checks offline, and run it in `dsh plugin add` before the row is written.

### 5.2 What the authoring template / checklist should contain

**Packaging**
- [ ] `package.json`: bare scoped `name`; `dsh.client: { platform: "web", inject: [...] }` listing only genuinely host-provided modules (`react`, `react-dom`, `react/jsx-runtime`, client packages); browser-only deps in `devDependencies`.
- [ ] Build produces `lib/client.js` as a **classic script**: exactly one `window.__ModuleLoader__.load({ id: PLUGIN_ID, factory })`, `PLUGIN_ID === package.json.name`; no top-level `import`/`export`/`await`; all imports become `require(...)` inside the factory; React from `require("react")` (+ `require("react/jsx-runtime")`), never a second bundled copy.
- [ ] `factory` returns `module.exports` exposing `apply(ctx)`, plus `inject` whenever `ctx.slots`/other services are used. No DOM/global side effects at module scope; portals/effects created and cleaned up inside components.
- [ ] Verify the **packed** artifact, not the source: `node --check lib/client.js`, grep for `^\s*(import|export)`, grep the registration id, confirm the packed `package.json` still declares `dsh.client`.

**Slots**
- [ ] Register only seats that exist in the installed shell's slot contract (read the owner package's `contract/slots.ts` at the installed version). For plugin settings cards, use `settings.plugin.item[key = namespace]` on 0.1.2–0.1.6 or the plugin-manager slots from 0.1.7.
- [ ] Always `ctx.slots.inject(name, () => ctx.slots.register({ name, id, order[, label] }, Component))` for slots owned by another entry; never pass `kind`/`scope`/`children`; component accepts the site props and returns `null` when empty.

**Dev loop**
- [ ] Any client-bundle edit ⇒ full host restart (stop host → confirm :3080 free → start → hard refresh → verify served combo bytes + `__DSH_BOOT__.entries` + plugin list); a browser refresh is not a restart; on Windows stop the process tree (`taskkill /PID <pid> /T /F`) and confirm the port.
- [ ] After a restart, check Settings → Plugins → Plugin list first: non-empty ⇒ combo OK, now read apply-time errors; empty ⇒ you are back at failure #1, not at a new bug.

**Diagnosis**
- [ ] Read the whole cause chain; `failed to import loader entry X` is a combo-level statement, and X is roster order.
- [ ] Run the two static checks (`node --check`, `^\s*(import|export)`) before touching the host.
- [ ] Bisect the profile patch rows with full restarts; attribution is complete only when toggling the row toggles the symptom.

### 5.3 One-page runbook implied by this incident

| Observation | First move | Do not |
|---|---|---|
| Zero plugins, error names a stock package | treat as combo parse failure; read the nested cause; `node --check` the newest bundle | blame the named package or reinstall the host |
| One plugin's entry fails to apply, everyone else fine | read the apply error; check slot declaration/owner contract and `ctx.slots.inject` | add `kind`/`scope` to "declare it yourself" |
| Edit has no effect | full host restart, then verify served bytes | trust a hard refresh |
| `EADDRINUSE` | find the :3080 owner, `taskkill /T /F`, confirm free, start | start a second server on another port |

---

## 6. Residual risk / not verified

- No host was started and no plugin was loaded: all conclusions are derived from the evidence pack + the versioned contracts in the skill corridor (cards cited above). The exact internal composition function and the client loader's promise-chain ordering are described from their documented behaviour, not re-read from source (read-only scope).
- The exact seat inventory of the installed settings shell is unknown from the fixture; whether `settings.section` is declared at all on this host is therefore stated conditionally (§3.5). If the installed shell does not declare it, the plugin must move to `settings.plugin.item` / the plugin-manager slots.
- Whether the plugin's own `package.json` declares `dsh.client` and `inject` could not be checked (not in the fixture); it is a required precondition and is listed as a checklist item.
- The `EADDRINUSE` root cause is the documented Windows terminal/child-process behaviour; a `TIME_WAIT`-only variant would have needed a wait rather than a kill, which the evidence (port held until the tree kill) rules out here.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.