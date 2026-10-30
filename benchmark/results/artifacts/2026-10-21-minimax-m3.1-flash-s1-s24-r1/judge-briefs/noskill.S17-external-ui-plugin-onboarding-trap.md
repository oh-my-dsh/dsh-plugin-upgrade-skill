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
#### FILE: S17-external-ui-plugin-onboarding-trap/S17-report.md

# S17 · The External UI Plugin Onboarding Trap — Incident Analysis

**Scope:** read-only analysis of the sealed evidence pack in `fixture/`. Nothing in `fixture/` was modified; this report is the only artifact written.

**Evidence used (each read once):** `README.md`, `browser-error.txt`, `host-boot-log.txt`, `plugin-apply-error.txt`, `restart-notes.txt`, `working-plugin-excerpt.txt`, `plugin/lib/client.js`, `profile/cordis.patch.yml`.

**Confidence legend**
- **Proven** — stated verbatim by a fixture file.
- **Inferred** — the only reading consistent with all fixture files; the internal implementation detail is not observable from the pack.
- **Unconfirmed** — the pack does not pin it down; marked rather than guessed.

---

## 0. Executive summary — the three failures are one story

| # | Failure | Trigger | Blast radius | Fixture |
|---|---|---|---|---|
| 1 | Browser refuses to load plugins; error names `@deepseek-ai/dsh-typert-registry` | One plugin shipped a **bare ESM client bundle** (top-level `import`/`export`) | **All 53 loader entries** — zero plugins registered, stock plugins vanished from the header | `browser-error.txt` |
| 2 | `slot "settings.section" is not declared (a parent entry's children table must declare it)` | Plugin was installed as a **top-level insert row only**, never declared as a **child of the settings parent entry**; it tried to *create* a slot by name | **That one entry only** — all other plugins loaded and rendered normally | `plugin-apply-error.txt` |
| 3 | Every edit needed a host restart; one restart died with EADDRINUSE | The combo is composed **once at boot**; on Windows the orphaned `node` child kept the port bound | Dev-loop friction; wasted cycles | `host-boot-log.txt`, `restart-notes.txt` |

**The single sentence that explains failure 1:** the host concatenates every installed plugin's client bundle into **one classic script** (proven: *"composed 53 loader entries into client bundle combo (4.5 MB, classic script)"*). A classic script is parsed as a unit, so **one** illegal token anywhere in the 4.5 MB poisons the whole file; no `window.__ModuleLoader__.load({...})` call in it ever runs; zero plugins register.

**The single sentence that explains the misleading error name:** the loader attributed a **shared-pipeline** failure to the entry it happened to be **awaiting** (`0c013085 (@deepseek-ai/dsh-typert-registry)`), not to the bundle whose content was broken. The real culprit is named one level down the cause chain: `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`.

**The single sentence that explains failure 2:** slot *declaration* is owned by the **parent entry** (its children table); a plugin may only *fill* a slot the parent already declared. The plugin tried to conjure `settings.section` out of thin air by calling `ctx.slots.register({name:'settings.section',...}, Component)`.

**The single sentence that explains failure 3:** the client-bundle pool is a **boot-time artifact**, not a watched file. Editing `lib/client.js` on disk cannot change a combo that was already composed and is already being served.

---

## 1. Failure 1 — root cause

### 1.1 What the host actually assembles, and in what form it reaches the browser

**Proven** (`host-boot-log.txt`):

```
[boot] cordis patch layer: 3 insert rows resolved (dsh-brand-version, dsh-file-trace, dsh-profiles)
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
[boot] web profile ready
```

So the pipeline is:

1. **Resolve the plugin set.** The profile patch layer contributes 3 `insert` rows (`profile/cordis.patch.yml`); the *host* contributes the rest. The user's plugin `@lhh010/dsh-profiles` was **1 of 53 loader entries** — and it broke **53 of 53**.
2. **Collect each plugin's client bundle.** The new plugin's bundle is `plugin/lib/client.js`, served at `/plugins/@lhh010/dsh-profiles/lib/client.js`.
3. **Compile/assemble.** The `client-modules` layer compiles the bundles and **concatenates all 53 into one file**: *"client bundle combo (4.5 MB, classic script)"*.
4. **Serve it as a classic script.** Not `type="module"`, not per-entry chunks — one classic script in global scope. Each entry contributes a `window.__ModuleLoader__.load({ id, factory })` call (see `working-plugin-excerpt.txt`).
5. **In the browser:** the loader reads the combo; each `load()` call registers one entry; the loader then applies each entry, calling its exported `apply(ctx)`.

### 1.2 Why one plugin's bundle took down every plugin's registration

`plugin/lib/client.js` as the user wrote it (`plugin/lib/client.js`, proven):

```js
import React from 'react'            // line 1  <-- top-level ESM import
import { createPortal } from 'react-dom'
...
export function apply(ctx) { ... }   // line 23 <-- top-level ESM export
```

A **classic script** cannot contain a top-level `import` or `export`. In script (non-module) goal, those are `SyntaxError`, and a classic script is **parsed as a whole before any of it executes**. Therefore:

- The concatenation of 53 bundles is one file; that file contains at least one `import`; the **entire file is rejected at parse time**.
- Not one `window.__ModuleLoader__.load({...})` call executes → the loader's registry stays empty.
- The UI renders an empty *Settings → Plugins → Plugin list* and the stock plugins disappear from the header — **not because they broke, but because they were never registered**. They ride the same registration path; there is no per-plugin fallback. (Proven by `browser-error.txt`: *"Zero entries registered… The two stock plugins… are gone from the header as well."*)

The error's `position 1:1` corroborates this exactly: line 1, column 1 is the `i` of `import React from 'react'` — the first token of the offending bundle, and the first thing the compiler hit in that file.

Two extra hazards from the same packaging decision, worth naming because they would have produced the *same* all-or-nothing symptom later:

- **Global-scope collisions.** In a classic script, every top-level `const`/`let`/`function` from all 53 bundles shares **one global lexical scope**. Two plugins declaring the same top-level name (e.g. `const PROFILES`) produce *"Identifier 'PROFILES' has already been declared"* — again killing all 53. The working plugin avoids this structurally: everything lives **inside the `factory` closure** (`working-plugin-excerpt.txt`).
- **Top-level side effects.** The offending bundle calls `document.createElement`/`document.body.appendChild`/`createPortal` at **module top level**, i.e. at load time rather than at apply time, in the shared global scope. That is both an ordering hazard and semantically wrong for a slot-based UI (the host owns the slot container). It also contains a latent bug independent of packaging: `createPortal(node, host, 'profiles-root')` passes a **string** where the third argument must be a DOM **element**.

### 1.3 Why the error named `dsh-typert-registry` (an innocent stock entry)

Proven error text (`browser-error.txt`):

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
  client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

Decompose the three clauses — they carry three different pieces of information, and the user's mistake was to read only the first:

| Clause | What it means | What it does **not** mean |
|---|---|---|
| `failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)` | The **awaited entry** — the entry whose import promise rejected *first*. The `0c013085` is a generated loader-entry id/hash, and the package in parentheses is a stock host package the user never touched. | **It does not mean that entry is broken.** It is a *victim of await order* in a shared, all-or-nothing pipeline. |
| `client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error` | The **culprit**, named by absolute served path: the bundle that failed to compile is the new plugin's. | — |
| `(position 1:1)` | Line 1, column 1 of *that file* — the top-level `import`. | — |

**Why the innocent entry got the blame (inferred, consistent with every fixture file):** the combo/compile is a **shared** pipeline whose failure is surfaced once; the browser-side loader attaches that failure to the entry it was awaiting when it rejected. The stock `dsh-typert-registry` simply happened to be first in the import/await order (or first in the entry registry) — nothing about *its* content was ever examined. Two aggravating details that made the false lead so convincing:

- `dsh-typert-registry` appears **nowhere** in the user's `cordis.patch.yml`, so there was no way to connect the error to their change by reading the patch file.
- The victim id is an **opaque hash** (`0c013085`), not a package name, so "the entry in question" was unresolvable by hand.

**Why the error was visible in the browser at all (inferred):** the host-side `client-modules` compile step runs at boot (the log line proves composition happens at boot); its diagnostic was carried to the browser console together with the loader's own error. Whether the compile diagnostic is embedded in the served artifact, returned by a diagnostics endpoint, or inlined into the loader's error payload is **unconfirmed** — the observable contract (outer = victim entry, inner = culprit bundle path + position) is proven.

**Corollary that the evidence proves outright:** failure 1 and failure 2 have **different blast radii**, and that difference is diagnostic:
- Failure 1 = **parse-time**, whole-combo scope (53 of 53 dead).
- Failure 2 = **apply-time**, **per-entry** scope (*"All other plugins load and render normally on this boot."*).

Repackaging the plugin into a syntactically valid wrapper moved the failure across the isolation boundary — that is exactly why the second error names *the plugin itself* (`failed to apply loader entry (@lhh010/dsh-profiles)`) instead of a stock entry. **The isolation boundary is at apply time; there is none at parse time.** That asymmetry is the heart of failure 1.

---

## 2. Diagnosis discipline — locating the culprit, and the packaging contract

### 2.1 How the culprit should have been located

**Step 1 — read the entire error chain, not its first clause.** The outer clause is an *await-order artifact*; the inner `client-modules: bundle <path> compile error` is the actual attribution and it names the package path outright. A one-line habit that would have solved the session in one minute: *"always read to the innermost cause; the outer frame names the victim, not the culprit."*

**Step 2 — bisect at the bundle-pool level, not the entry level.** Because the host composes **all** bundles into one file, you cannot bisect in the browser by disabling loader entries one at a time; there is only one unit to disable. The correct bisect axis is the **plugin set**:

1. Remove the new plugin's `insert` row from `profile/cordis.patch.yml` (and/or its `node_modules` link).
2. **Restart the host** (a browser refresh cannot help — see §4).
3. If *Settings → Plugins → Plugin list* is populated again → the culprit is inside the removed set. Here the set had exactly one member, `@lhh010/dsh-profiles`, so it is confirmed in one step.
4. Re-add **half** the remaining suspect set at a time if there is more than one.

**Step 3 — the cheap static check that flags the offending bundle.** The compile failure is reproducible **without the host**, because the host's target format is known: *classic script*. Compiling a file the way a classic script is compiled reproduces the host's error exactly:

```bash
# Single file, classic-script semantics (read-only):
node -e "const fs=require('fs'),vm=require('vm');const p=process.argv[1];try{new vm.Script(fs.readFileSync(p,'utf8'),{filename:p});console.log('OK: compiles as a classic script')}catch(e){console.log('FAIL: '+e.message)}" plugins/@lhh010/dsh-profiles/lib/client.js
# FAIL: SyntaxError: Cannot use import statement outside a module
```

`vm.Script` is the classic-script compile path, so the reported position matches the host's `position 1:1`. Bulk version over every installed plugin:

```bash
# Cheap lint over the whole plugin set — one line, no host needed:
rg -n --glob '**/lib/client.js' -e '^\s*(import|export)\b' -e '^\s*(const|let|function)\b' -e 'document\.(body|createElement)\b' -e 'window\.__ModuleLoader__\.load\(' <plugins-root>
```

Hits on `^s*(import|export)` = illegal in the combo. Hits on a bare top-level `const|let|function` = global-scope collision risk. Hits on `document.body` / `document.createElement` = top-level side effect. **Zero hits on `window.__ModuleLoader__.load(`** = the bundle is not even a loader entry, so the host has nothing to register.

**Step 4 — verify the packaging contract by hand** (§2.2) before touching anything else.

### 2.2 The client-bundle format an external plugin must ship (the packaging contract)

Proven by `working-plugin-excerpt.txt` (a working plugin from the *same* profile, packaging shell only, component bodies elided):

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

1. **What wraps the code:** a call to the **global** `window.__ModuleLoader__.load({ id, factory })`. Not a bare script, not an ES module — the bundle's *entire* top-level content is that one call. Everything else is inside `factory`.
2. **`id`:** the entry's identity — the package/entry name (here `@local/dsh-brand-version`, matching the `name:` row in `cordis.patch.yml`). For the failing plugin it must be `@lhh010/dsh-profiles`, matching `profile/cordis.patch.yml`.
3. **`factory`:** a **CommonJS-style factory receiving `require`**. Its whole job is to build a module and hand it back.
4. **Module boilerplate (mandatory):** `var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });` — this is the standard CJS prologue and is what makes the factory a real module rather than a closure with globals.
5. **How React is obtained:** **not** via `import`. React (and `react-dom`, and host UI packages such as `@deepseek-ai/dsh-client-ui-primitives`) are **externals** resolved through the injected `require` inside the factory — e.g. `require("react/jsx-runtime")`, `require("react")`, `require("react-dom")`, `require("@deepseek-ai/dsh-client-ui-primitives")`. The host then hands back **its own singletons**, which guarantees **one React instance** in the page (two instances break hooks, context and portals) and keeps the 4.5 MB combo from growing with a private copy of React.
6. **What the wrapper must export:** the factory **must `return module.exports;`** and `module.exports` must expose the plugin's **`apply(ctx)`** function (plus anything else the entry contract expects). `apply` is what the host calls to wire the plugin into the running UI.
7. **Capability declaration:** `const inject = ["slots"];` — the entry declares which services it needs injected into `ctx`. Without it, `ctx.slots` is not available and the plugin cannot contribute to any slot.
8. **Contribution channel:** the working plugin uses `ctx.slots.inject(...)` inside `apply` — **not** a top-level or direct `ctx.slots.register(...)` on a free-form slot name (this is exactly the mistake in failure 2, §3).
9. **No top-level effects:** no `document.*` / `window.*` / `createPortal` at bundle top level. All rendering must happen through the slot contribution, inside `apply`, where the host owns the container.
10. **No ESM at top level:** no `import` / `export` statements; the file must compile as a classic script.

**Everything the offending bundle got wrong (audit of `plugin/lib/client.js`):**

| Offending line | Problem |
|---|---|
| `import React from 'react'` | top-level ESM in a classic script → whole-combo SyntaxError at 1:1. React must come from the injected `require`. |
| `import { createPortal } from 'react-dom'` | same; and `react-dom` should be a host-provided external, not a private copy. |
| `document.createElement(...)` / `document.body.appendChild(host)` / `createPortal(...)` at top level | side effect executed at **load** time in the shared global scope; fights the host's slot container; `createPortal`'s 3rd arg was a string instead of an element. |
| `export function apply(ctx)` | top-level ESM export → second illegal token; also means the module exposes nothing via `module.exports`. |
| *(absent)* `window.__ModuleLoader__.load({...})` | the bundle is **not a loader entry at all** — even a perfectly parsed file would have registered nothing. |
| *(absent)* `module`/`exports`/`Symbol.toStringTag` prologue | no module semantics; everything would have leaked into the shared global scope. |
| *(absent)* `const inject = ["slots"]` | `ctx.slots` would not have been injected. |
| *(absent)* `return module.exports` | the host would find no `apply` to call. |

---

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

Proven (`plugin-apply-error.txt`), after the plugin was repackaged so the browser could load plugins again:

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared
  (a parent entry's children table must declare it)
All other plugins load and render normally on this boot.
```

### 3.1 What the message means

**Slot declaration is owned by the parent entry, not by the registrant.** The host's client-module model gives each loader entry a **children table**: a parent entry (here, the entry that owns the Settings surface) declares, in its children table, which **child slot names exist** and which child entry fills each one. A slot is therefore a **two-sided contract**:

- **Parent side (declaration):** the parent entry's children table lists `settings.section` and names the child entry allowed to fill it.
- **Child side (contribution):** the declared child submits a contribution **into that already-declared slot**.

The message states the rule precisely: *"a parent entry's children table must declare it."* When the plugin's `apply` ran, the registry resolved the name `settings.section`, looked for a declaration in the owning parent's children table, found none, and refused — at **apply time**, i.e. after the combo parsed fine and after 52 other plugins had already registered and rendered.

### 3.2 Why a bare registration of another entry's slot fails

What the plugin did (`plugin/lib/client.js`):

```js
export function apply(ctx) {
  ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
    ProfilesSection,
  )
}
```

This is a **self-declaring** registration: it *asserts the existence* of a namespace entry that belongs to the parent, using a free-form name, with no evidence of having been granted that slot. Two independent reasons it is rejected:

1. **No grant exists.** The plugin was installed the "usual community way" — a top-level `insert` row (`profile/cordis.patch.yml`):

   ```yaml
   - insert:
       - id: dsh-profiles
         name: '@lhh010/dsh-profiles'
   ```

   Nothing in that row (nor anywhere in the patch) declares the plugin as a **child of the settings parent entry**, and nothing declares the slot name `settings.section` in that parent's children table. So `settings.section` **did not exist** in the model — the plugin was trying to create a slot by naming it. Registration is not declaration.
2. **Wrong channel/ownership.** Even a correctly-named slot must be filled through the declared path. The working plugin's pattern (`working-plugin-excerpt.txt`) is a **capability-gated injection** — `const inject = ["slots"]` plus `ctx.slots.inject(...)` inside `apply` — not a direct `ctx.slots.register` of a name. A bare `register` on an undeclared name bypasses the very check that produced this error.

**The fix therefore has two halves — one plugin-side, one declaration-side:**
- *Declaration side:* the plugin must be registered as a **child of the parent entry that owns the Settings surface**, with the child slot name `settings.section` declared in that parent's children table, and this entry named as the child that fills it.
- *Plugin side:* the contribution must be submitted through the declared slot using the injection form.

### 3.3 The exact wrapping form the registration must use

Reconstructed from the fixture's packaging shell (the component bodies are elided, so the payload **key** is **unconfirmed**; the structure is proven):

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { createPortal } = require("react-dom");          // host-provided externals, NOT imports
    const react_jsx_runtime = require("react/jsx-runtime");
    const { /* ...host UI primitives... */ } = require("@deepseek-ai/dsh-client-ui-primitives");

    function ProfilesSection() { /* ... renders the section ... */ }

    const inject = ["slots"];                                 // capability declaration

    function apply(ctx) {
      ctx.slots.inject([{
        slots: {
          // EXACTLY the child slot name declared in the parent's children table:
          'settings.section': {
            id: 'profiles-manager',                            // own contribution id
            order: 5,                                          // own placement
            kind: 'section',                                   // own kind (if the schema defines it)
            component: ProfilesSection,                         // payload (key unconfirmed — verify)
          },
        },
      }]);
    }

    module.exports = { apply };                               // the entry's public surface
    return module.exports;
  },
});
```

The load-bearing points:

- The slot key is **`'settings.section'` exactly as declared by the parent** — no inventing, no aliasing, no `scope`-qualified variant unless the host's schema documents one.
- The contribution goes through **`ctx.slots.inject([...])`** — the same channel the working plugin uses — and the plugin has declared the `"slots"` capability (`const inject = ["slots"]`).
- The plugin **does not create the slot**; it fills one the parent declared. If the parent's children table does not contain `settings.section`, the correct behaviour is to **fail the declaration side** (fix the patch/manifest so the parent declares the child slot), not to work around the runtime error.
- The component is passed as data. **No manual `document.body.appendChild`, no manual `createPortal`** — the host owns the container and the render position.

### 3.4 Which fields a registrant may pass, and which it must not

| Field in the offending registration | May a registrant pass it? | Rationale |
|---|---|---|
| `id: 'profiles-manager'` | **Yes** | identity of *its own* contribution inside the slot — registrant-owned. |
| `order: 5` | **Yes** | placement of its own contribution — registrant-owned. |
| `kind: 'section'` | **Yes**, *if* the host's slot-contribution schema defines `kind` as per-contribution metadata | metadata about its own contribution. |
| `scope: 'settings'` | **Unconfirmed — treat as parent-owned** | the slot is *already* named `settings.section`; if `scope` denotes the owning surface/parent namespace, it is a **parent-owned** field and a registrant must **omit** it. If the host's schema defines `scope` as pure placement metadata, it is allowed. The redacted working excerpt does not disambiguate this — verify against the host's slot schema before shipping. |
| the slot **`name`** as a free-form *creation* request | **No** | a registrant may only **target** a slot the parent's children table already declares; it may never conjure one by name. |
| the **parent entry id / children-table identity** | **No** | a registrant may not self-authorize into a namespace it was not granted (passing a parent id to "claim" its slot is the same defect as the bare `register`). |
| loader plumbing (`module id`, entry hash `0c013085`-style ids, `factory`, `inject`) | **No** | these are entry-contract fields, not contribution fields. `id`/`factory` belong to the `load({...})` call; `inject` is the capability list. |

**One-line rule:** *a registrant may describe **its own contribution** (id, order, kind, and whatever else the schema marks as per-contribution); it may never describe **the slot** (its existence, its owner, its parent) — the parent owns that, and the plugin's job is to be declared as a child before it fills anything.*

---

## 4. Dev-loop discipline — the boot-assembled combo and the Windows restart

### 4.1 Why editing plugin files changes nothing

Proven (`restart-notes.txt` #1 and `host-boot-log.txt`):

> *"Combo assembly happens ONCE at host boot: the host reads every installed plugin's client bundle, concatenates them into one classic script, and serves that. Editing a plugin file on disk afterwards has NO effect in the browser, even after a hard refresh, until the host process is stopped and started again."*

> *"[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)"*

So the client-bundle pool is a **boot-time artifact**: read once, compiled once, concatenated once, and served from that snapshot for the life of the process. There is **no watcher, no incremental rebuild, no per-request re-read**. Consequences the user hit:

- A browser refresh re-requests the **same already-composed combo** → identical bytes → identical failure.
- Even a hard refresh does not help, because the bytes on the server never changed. The user's "maybe it is just a stale browser cache" hypothesis was wrong; the staleness was **server-side**.
- Only a **host process restart** re-reads the plugin directories and re-composes the 53 entries.
- The composite is also a 4.5 MB single script, so browser caching of the combo itself can add a second layer of staleness → after a restart, **hard-refresh** to drop the cached copy.

**The correct restart procedure (Windows):**

```
1. Stop the host deliberately (Ctrl+C in the host's own console, or the command's own quit) —
   do NOT just close the launching terminal window.
2. Verify the port is free:
     netstat -ano | findstr :<port>            # expect no LISTENING line
     Get-NetTCPConnection -LocalPort <port> -State Listen
3. If a listener remains, kill the whole tree:
     taskkill /PID <pid> /T /F
4. Start the host again; wait for "[boot] client-modules: composed 53 loader entries".
5. Hard-refresh the browser (Ctrl+Shift+R).
6. Verify: Settings -> Plugins -> Plugin list is NON-EMPTY (empty list = the combo failed again),
   and the new entry is present.
```

### 4.2 Why the Windows restart died with EADDRINUSE until the tree was force-killed

Proven (`restart-notes.txt` #2 and the second bullet of `host-boot-log.txt`):

> *"On Windows, stopping the host by closing the launching terminal left a node process alive: the NEXT host boot failed with EADDRINUSE (the listening port was still held by the orphaned process). Killing the entire process tree freed the port: taskkill /PID <pid> /T /F"*

Mechanism (inferred; the observable facts are proven):

- The host is launched **through a wrapper** (a shell/terminal → a package-manager script → `node` → the host's own `node` child). Closing the launching terminal, or signalling only the top-level wrapper, terminates the **foreground** process only; the **grandchild node** that actually owns the listening socket survives as an orphan. On Windows there is no process-group kill by default, and Ctrl-C in a wrapper shell often does not reach a detached grandchild.
- The orphan keeps the TCP listener bound. The next host's `bind()` then fails with `EADDRINUSE` and the new boot dies **before it can compose the combo** — the plugin never even gets a chance to be evaluated. (This is why the EADDRINUSE boot produced *no* plugin error at all: it is a port problem, not a plugin problem.)
- Only `taskkill /PID <pid> /T /F` — `/T` kills the **children** of the tree, `/F` forces termination — removed the orphan and released the socket; the following boot "bound normally".
- Note this is a **live listener**, not a `TIME_WAIT` remnant: the port stayed occupied until a *process* was killed, which rules out the usual "just wait a minute" folklore. `TIME_WAIT` sockets do not block a listener that sets `SO_REUSEADDR` (Node's `net.Server` does), so the explanation must be the orphaned process — which is exactly what the notes say.

**Discipline to prevent it:** treat "stop the host" as **"stop the process tree"**, and *verify the port is free before booting again*. Closing the terminal window is not a stop command.

---

## 5. Prevention

### 5.1 Host-side — name the offending plugin instead of the first awaited entry

The host had every piece of information needed to say *"your plugin is broken"* and instead said *"some stock plugin is broken"*. Concrete, implementable changes:

1. **Pre-flight each bundle in isolation, before composing.** Compile every plugin's client bundle **separately** with the same target format (classic script). A per-bundle compile result is directly attributable: `@lhh010/dsh-profiles → /plugins/@lhh010/dsh-profiles/lib/client.js → position 1:1`. The current design composes first and attributes later — attribution is lost exactly when it matters.
2. **Fail the boot with the culprit's identity.** If a bundle fails to compile, emit a diagnostic of the form:
   ```
   [boot] client-modules: FAILED package=@lhh010/dsh-profiles file=/plugins/@lhh010/dsh-profiles/lib/client.js
          position 1:1 — top-level ESM "import" is not allowed in the classic-script combo
          hint: ship window.__ModuleLoader__.load({ id, factory }) with externals resolved by require(...)
   ```
   The boot log line that says *"composed 53 loader entries"* should be accompanied by the **per-entry contribution list**, so the mapping *entry hash ↔ package id ↔ source path* is always on record.
3. **Never attribute a shared-pipeline failure to the awaited entry.** The loader's message should distinguish the two roles explicitly: `awaited entry 0c013085 (@deepseek-ai/dsh-typert-registry)` vs `offending bundle <path>`. The observed message (`failed to import loader entry X: <cause about bundle Y>`) reads as "X is broken" and drove the whole investigation down the wrong path.
4. **Preserve the cause chain and make it readable.** The chain already existed in the message; the host should also expose it programmatically (an `error.cause` with `{ offendingBundle, package, file, line, column }`), and the `0c013085`-style hash should be **resolvable to a package name** in every message.
5. **Make the blast radius proportionate.** Parse-time isolation is the real fix: either **serve each entry as its own chunk** instead of one 4.5 MB classic script, or wrap each entry in its own `try/catch` boundary so one bad bundle disables **only itself**. Today one plugin can take the whole UI's plugin surface down (53/53) — an availability bug, not just a DX bug.
6. **Validate the packaging contract at boot, per entry.** Check: exactly one `window.__ModuleLoader__.load({...})` call; no top-level `import`/`export`; no top-level DOM side effects; `id` matches the installed package name; `factory` returns an object exposing `apply`; the capability list includes `slots` when the entry uses `ctx.slots`. Report per entry: `ok | <rule violated>`.
7. **Pre-flight slot declarations too, at boot.** Cross-check each entry's declared/injected slot names against the parents' children tables and report **before** the browser loads: *"entry @lhh010/dsh-profiles injects into undeclared slot 'settings.section'; declare it as a child of <settings parent entry> with slot 'settings.section'."* This converts failure 2 from a runtime apply-time error into a boot-time, per-plugin diagnostic.
8. **Give the user a doctor command** (`dsh web --check-plugins` / `dsh doctor --plugins`): prints, per plugin, bundle path, compile status, entry id, exported shape, declared slots vs. parent children tables, and the patch rows that installed it — so the bisect of §2.1 becomes a single command.
9. **Publish the contract as a versioned artifact** (schema + reference implementation + `dsh plugin scaffold`) — the packaging contract in §2.2 is currently discoverable only by reading another plugin's minified/combined output, which is why the user guessed "imports React" was fine.

### 5.2 Authoring-side — the template and the checklist

**Template** (the corrected bundle of §3.3, as an authoring starting point): build with a bundler targeting **IIFE / classic script**, mark `react`, `react-dom`, `@deepseek-ai/dsh-client-ui-primitives` (and any other host-provided package) as **externals**, and emit the `window.__ModuleLoader__.load({...})` wrapper. A build config in that spirit:

```js
// rollup / esbuild equivalent
{
  format: 'iife',
  // entry file wraps everything in window.__ModuleLoader__.load({ id, factory })
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  // resolve externals to the injected require: require('react') etc.
}
```

**Checklist — must pass before the first boot:**

*Packaging (failure 1)*
- [ ] The bundle's only top-level statement is `window.__ModuleLoader__.load({ id, factory })`.
- [ ] **Zero** top-level `import` / `export` statements (the file must compile as a classic script).
- [ ] Every dependency is obtained via the injected `require` inside the factory — **no** `import React`, no `require` at top level.
- [ ] React/`react-dom`/host UI packages are **externals** (one React instance in the page).
- [ ] The factory contains the `module`/`exports`/`Symbol.toStringTag` prologue and ends with `return module.exports;`.
- [ ] `module.exports` exposes `apply(ctx)`.
- [ ] `const inject = ["slots"];` is declared when the plugin uses `ctx.slots`.
- [ ] **No** top-level `document.*` / `window.*` / `createPortal` side effects.
- [ ] Local static check passes: the `vm.Script` classic-script compile of the built bundle succeeds, and the scan for `^s*(import|export)` returns nothing.
- [ ] `id` in the `load()` call equals the package name in the profile's `cordis.patch.yml` `name:` row.

*Slot declaration (failure 2)*
- [ ] The plugin is declared as a **child of the parent entry that owns the Settings surface**, with the child slot name `settings.section` listed in that parent's **children table**.
- [ ] The contribution is submitted via `ctx.slots.inject([...])`, not `ctx.slots.register(...)`.
- [ ] The slot key is exactly `settings.section` as declared by the parent.
- [ ] Only **own-contribution** fields are passed (`id`, `order`, and whatever the host schema marks as per-contribution). Parent-owned fields — slot existence, parent/namespace identity, `scope` *if* it denotes the owning surface — are **omitted**.
- [ ] The component is handed to the host as data; no manual portal or DOM host.

*Install & dev loop (failure 3)*
- [ ] The `insert` row in `profile/cordis.patch.yml` uses the package name that matches the bundle's `id`.
- [ ] The plugin directory is linked into the web profile's `node_modules`.
- [ ] After **every** plugin edit: **stop the host process tree** (Windows: `taskkill /PID <pid> /T /F`, verify the port is free) → **reboot the host** → **hard-refresh** the browser.
- [ ] Verification step each cycle: *Settings → Plugins → Plugin list* is **non-empty** (an empty list means the **combo** failed again — go to §2.1), and the new entry is present and renders.

---

## 6. Answers in one line each

1. **Failure 1 root cause** — The host concatenates all 53 plugins' client bundles into **one classic script**; a top-level ESM `import` makes that single file a parse-time `SyntaxError`, so *no* `load()` call runs and *zero* entries register. The error named `dsh-typert-registry` because the loader attached the **shared** failure to the entry it was **awaiting** (await-order artifact); the real culprit was named one level deeper — `/plugins/@lhh010/dsh-profiles/lib/client.js`, position 1:1.
2. **Diagnosis discipline** — Read to the **innermost cause**; bisect the **plugin set** (remove insert rows → restart host → is the list populated?), not loader entries; statically compile each bundle as a classic script (`vm.Script`) to reproduce the exact `1:1` error offline. The required format is `window.__ModuleLoader__.load({ id, factory })` with a CJS prologue, **React via the injected `require`** (externals, one instance), a `module.exports` exposing `apply`, `const inject = ["slots"]`, and `return module.exports`.
3. **Failure 2** — Slots are **declared by the parent entry's children table**; the plugin was installed only as a top-level insert row, so `settings.section` did not exist and its bare `ctx.slots.register({name:'settings.section',...})` tried to create a parent-owned slot. Fix = declare the plugin as a child of the settings parent **and** contribute via `ctx.slots.inject([...])` keyed on the declared slot name; pass own-contribution fields only (`id`, `order`, schema-defined `kind`), never slot/parent/declaration fields.
4. **Dev loop** — The combo is composed **once at boot** and served from that snapshot (no watcher), so file edits are invisible until the **host process** restarts; the Windows `EADDRINUSE` came from an **orphaned `node` child** that kept the port bound after the terminal was closed, and only `taskkill /PID <pid> /T /F` freed it — the correct stop is "kill the tree and verify the port is free", not "close the window".
5. **Prevention** — Host: pre-flight each bundle **in isolation** at boot, fail with the **offending package + path + position**, keep `awaited entry` and `offending bundle` as **distinct** fields, emit an entry↔package manifest, and **isolate parse failures per entry** so one plugin cannot disable 53. Authoring: ship the wrapper template + the two checklists above, and make "restart the host (kill the tree) → hard refresh → the plugin list must be non-empty" the standard verification loop.

---

## 7. Unconfirmed items (explicitly flagged, not guessed)

1. The **exact payload key** for a slot contribution (`component` vs `render` vs `element` …) — the working plugin's bodies are elided in `working-plugin-excerpt.txt`. The *structure* (capability `"slots"` → `ctx.slots.inject([...])` → slot key = declared child slot name) is proven; the key name is not.
2. Whether `scope` is a **registrant-owned placement field** or a **parent-owned scope selector** — the fixture does not disambiguate; the report treats it as parent-owned pending verification against the host's slot schema.
3. The **precise internal plumbing** by which a boot-time compile diagnostic reaches the browser console (embedded in the served artifact, a diagnostics endpoint, or the loader's error payload). The observable contract — outer clause = awaited entry, inner cause = culprit bundle path + position — is proven.
4. The exact **host API names** for the parent-side children-table declaration (the config surface that makes a plugin a child of the settings entry and declares the `settings.section` child slot). The *semantics* are proven by the error text ("a parent entry's children table must declare it"); the exact key names in the plugin manifest / patch schema are not observable from the pack.
5. The **web port number** — the fixture never states it; the restart notes reference it only as "the listening port". The GUI URL of this benchmark environment is unrelated to the fixture and was deliberately not used as a fact.
6. Whether the 53 entries' order (and hence "which entry is awaited first") is deterministic — the victim `dsh-typert-registry` was simply first in whatever order the loader used; the pack does not fix the ordering rule.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.