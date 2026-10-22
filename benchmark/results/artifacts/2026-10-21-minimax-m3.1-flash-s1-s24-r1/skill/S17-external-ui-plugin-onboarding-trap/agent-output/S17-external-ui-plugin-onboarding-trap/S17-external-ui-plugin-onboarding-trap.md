# S17 · The External UI Plugin Onboarding Trap — incident report

**Subject:** `@lhh010/dsh-profiles` (external Web-UI plugin), installed into the `web` profile
**Mode:** read-only incident diagnosis (Mode A inspect, extended to authoring guidance). No
fixture, skill, evaluator, or profile file was modified; no install, migration, or host run was
performed.
**Evidence base:** `fixture/` (8 sealed files) + `skills/plugin-upgrade/` (SKILL.md, card sets,
troubleshooting table, pre-flight patterns, examples). Nothing outside the task whitelist was read,
and no live host was probed.

---

## 0 · Executive summary

| # | Failure | Root cause | One-line fix |
|---|---|---|---|
| 1 | Browser: `Failed to load plugins: failed to import loader entry … (@deepseek-ai/dsh-typert-registry)` → **zero** plugins registered | The host composes **all** plugin client bundles into **one classic `<script>`** at boot. The new plugin shipped **bare ESM** (top-level `import`/`export`), which is a **compile-time SyntaxError of the whole concatenated script** — so *no* `__ModuleLoader__.load()` call ever ran and *every* entry failed. The named id is only the **first awaited entry**, i.e. an innocent victim. | Ship a **classic script** that calls `window.__ModuleLoader__.load({ id, factory })` and obtains React through the factory's `require`. |
| 2 | Apply-time: `slot "settings.section" is not declared (a parent entry's children table must declare it)` | The plugin **bare-registered** into a slot owned by *another* entry, with a bare `ctx.slots.register(...)`. Cross-entry apply order is undefined, so the registration landed **before** the owner's declaration. It also passed `kind`/`scope`, which are the **owner's** fields. | Wrap it: `ctx.slots.inject('settings.section', () => ctx.slots.register({ name, id, order }, C))` and pass only registrant fields. |
| 3 | Every edit needed a host restart; one restart died with **EADDRINUSE** | The host **reads and caches** the client-bundle combo **once at boot**; on-disk edits are invisible until restart. On Windows, closing the launching terminal leaves the child `node` process alive holding the listening socket, so the next boot cannot bind. | Restart = **stop the process tree** (`taskkill /PID <pid> /T /F`), then start the host, then hard-refresh, then check the plugin list. |

Key attribution lesson: in failure 1 the *id* in the message is noise; the *path* in the same
message (`/plugins/@lhh010/dsh-profiles/lib/client.js`, `compile error (position 1:1)`) is the
truth. The skill's troubleshooting table records this exact symptom family: the named entry is
only the first awaited entry (e.g. `dsh-typert-registry`, innocent).

---

## 1 · Failure 1 — one bad client bundle took down every plugin

### 1.1 What the host actually assembles, and in what form it reaches the browser

From `fixture/host-boot-log.txt` (a typical boot of this profile):

```
[boot] cordis patch layer: 3 insert rows resolved (dsh-brand-version, dsh-file-trace, dsh-profiles)
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
[boot] web profile ready
```

Pipeline, as far as the fixture + skill evidence supports:

1. **Composition.** The profile's `cordis.patch.yml` contributes three `insert` rows
   (`dsh-brand-version`, `dsh-file-trace`, `dsh-profiles`). These are *composition*, not a
   source patch (card `DSH-0.1.2-A1-26` / API-08 in the alpha.2 ledger). Each row's `name` must be
   the **bare package name including the scope** — the fixture row satisfies this
   (`@lhh010/dsh-profiles`).
2. **Roster scan.** `client-modules` enumerates installed packages that declare `dsh.client`
   (card `DSH-0.1.1-R1-03`: "client-modules scans only packages declaring `dsh.client`") and
   resolves each package's **client entry** to a file on disk (here `lib/client.js`). Entry ids are
   keyed by **package name** (card `DSH-0.1.2-A1-26`: `Entry name == package name`).
3. **Composition of the combo.** All 53 loader entries' bundle texts are **concatenated into a
   single ~4.5 MB classic script** and served as one resource. The browser evaluates it as a
   **classic script**, i.e. *script*, not *module*.
4. **Registration.** Each plugin's contribution to that text is a call to
   `window.__ModuleLoader__.load({ id, factory })`. The loader builds a table keyed by `id`; the
   browser then awaits the entries one by one.

### 1.2 Why a single top-level `import` killed everything

A classic script has **no module semantics**. The concatenation of 53 bundles is *one* text and
*one* compilation unit, so a syntax error anywhere in it is a **compile error of the whole file**:
the browser never executes a single statement of it. Consequences, in order:

* no `__ModuleLoader__.load({...})` call ever runs → the loader table stays empty →
  **zero** loader entries are registered;
* the browser's plugin list is therefore **empty**, and even the two stock plugins that used to
  render (brand version, file tracking) disappear from the header — exactly what the fixture
  reports;
* the failure is **not** scoped to the offending plugin. One third-party package can blank the
  whole Web-UI plugin surface.

The offending bundle is `fixture/plugin/lib/client.js`, whose first two lines are
`import React from 'react'` / `import { createPortal } from 'react-dom'` and whose last line is
`export function apply(ctx) {...}` — three module-syntax tokens. I confirmed the host-side failure
mode locally by compiling the two files the way a classic script would be compiled
(`new vm.Script(src)`):

```
OFFENDER (fixture/plugin/lib/client.js) -> classic-script compile: FAILED
    SyntaxError: Cannot use import statement outside a module
WORKING  (excerpt code block)          -> classic-script compile: OK
```

### 1.3 Why the error named `dsh-typert-registry` although that entry is innocent

The message is a **loader-level, not bundle-level** report:

```
Failed to load plugins: failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry):
  client-modules: bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)
```

Two separate facts are packed into it, and they must be read separately:

* `failed to import loader entry <id>` — the loader iterates/awaits entries in roster order and
  reports the **first** entry whose import did not complete. Since the *combo* failed to compile,
  the **first awaited entry** is the first casualty. `@deepseek-ai/dsh-typert-registry` is a stock
  host package the user never touched; it is innocent. The skill's troubleshooting table states
  this verbatim for this symptom family.
* `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)` — the
  **actual** culprit, the offending path, and the offending position: line 1, column 1 = the first
  `import` token. This half of the message is the evidence; the id half is noise.

The skill records the same "innocent first entry, all plugins fail" shape in card
`DSH-0.1.5-A1-20` (real-host verified), with a different mechanism: there the combo *executed*
but the roster listed modules the served combo did not contain (new module 404, old module 200 at
the same rev). **Distinguish the two before touching plugins** — see §2.3.

---

## 2 · Diagnosis discipline

### 2.1 Bisect the composition layer, not the named entry

The failure domain is the **combo**, so the bisect unit is "which composition row contributed the
bad text". The profile's `cordis.patch.yml` has three insert rows; the row order in the file
matches the boot log's resolved order:

```yaml
- insert:
    - id: dsh-brand-version
      name: '@local/dsh-brand-version'
- insert:
    - id: dsh-file-trace
      name: '@dsh-external/dsh-file-trace'
- insert:
    - id: dsh-profiles
      name: '@lhh010/dsh-profiles'
```

Procedure (read-only against the fixture; in a real profile, comment out rows in a scratch copy):

1. **Remove the newest row** (`dsh-profiles`), restart the host, hard-refresh. If the plugin list
   comes back, the removed row owns the bad bundle. This single step already identifies the
   culprit here.
2. If ambiguous, **halve** the inserted rows and repeat → O(log n) restarts.
3. **Confirm at the file level**, not at the row level: for each surviving row, resolve the row's
   bare package name to its installed client entry and inspect *that file* (§2.2). The row id
   (`dsh-profiles`) and the package name (`@lhh010/dsh-profiles`) are different coordinates —
   do not derive one from the other (SKILL.md, shared preparation step 2).

### 2.2 The cheap static check that flags the offending bundle

Do not start a host at all. The defect is *syntactic* and lives in the served artifact, so a
file-level gate finds it in milliseconds. I wrote and ran one:
`agent-output/S17-external-ui-plugin-onboarding-trap/scratch/client-bundle-format-check.mjs`
(read-only; it opens files, never writes). It performs four checks per candidate bundle:

| Check | Method | What it catches |
|---|---|---|
| classic-script compile | `new vm.Script(src)` | the exact host-side failure (`Cannot use import statement outside a module`) |
| top-level ESM tokens | scan with strings/comments masked | the same defect **with line numbers** (`import` @line 1, @line 2, `export` @line 23) |
| packaging shell | `/window\.__ModuleLoader__\.load\s*\(/` | a bundle that forgot the loader wrapper entirely |
| id ↔ package name | registration `id` vs `package.json` `name` | card `DSH-0.1.2-A1-26` (registration id must equal the package name) |

Result on the fixture (exit code 1 = offender found):

```
OFFENDER …/fixture/plugin/lib/client.js
  classic-script compile: SyntaxError: Cannot use import statement outside a module
      -> kills the WHOLE combo, zero plugins register
  top-level ESM token(s): import @line 1, import @line 2, export @line 23
  missing window.__ModuleLoader__.load({ id, factory }) wrapper
ok      …/scratch/working-plugin-code.js  (classic script, loader wrapper, id "@local/dsh-brand-version")
RESULT: 1 offending bundle(s)
```

The same evidence can be obtained without any tooling: `grep -nE "^(import|export)\b" lib/client.js`
over every installed plugin's client entry, plus a look for `__ModuleLoader__.load`. The skill's
pre-flight touchpoint #5 already searches for `__ModuleLoader__|PLUGIN_ID` — that pattern is the
canary for "this file is supposed to be a loader-registered classic bundle".

### 2.3 Runtime attribution probes (if the static check is inconclusive)

* **Fetch the served combo, not a hand-built path.** Read the host-advertised artifact URL from
  `window.__DSH_BOOT__.entries` and request it with the token→Cookie exchange
  (card `DSH-0.1.2-A1-19`: do not derive resource paths yourself; a revision-less
  `/plugins/<id>/client.js` or a bare HTTP 200 misjudges 401/404/unregistered/unmounted).
* **Distinguish "combo did not compile" from "combo compiled but a module is missing"**: in the
  first case the browser console shows a *compile* error and the plugin list is empty; in the
  second (card `DSH-0.1.5-A1-20`) the script runs, one module answers **404** at the same rev
  while an older module answers **200**, and a host restart self-heals. Restart-then-retry is a
  legitimate probe in the second case; it is a no-op in the first.

### 2.4 The client-bundle contract an external plugin must ship

The conforming shape is visible in `fixture/working-plugin-excerpt.txt` (a working plugin loaded
from the same profile). An external plugin must ship a **classic script** shaped like this:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",          // MUST equal package.json "name" (scoped name included)
  factory: (require) => {              // the factory receives the host's module registry
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");               // React comes from the host registry
    const { createPortal } = require("react-dom"); // NOT via a top-level import
    // const jsx = require("react/jsx-runtime");    // the excerpt's equivalent

    const inject = ["slots"];                      // service list the entry needs
    function apply(ctx) { /* ... */ }

    return module.exports;                         // MUST return module.exports
  },
});
```

Required properties of that shell:

1. **No module syntax at the top level.** No `import`, no `export`, no `import.meta`. The whole
   file must compile as a classic script. (TypeScript source may use `import type` freely — that
   is erased at build time — but the *emitted* bundle must be module-free.)
2. **The loader call is the entry point.** `window.__ModuleLoader__.load({ id, factory })` is what
   turns a file into a registrable loader entry. Without it the file contributes nothing.
3. **React (and every other dependency) is obtained through the factory's `require`.** The host
   owns the module table; the plugin does not ship or import its own copy of React. The working
   excerpt shows exactly this: `let react_jsx_runtime = require("react/jsx-runtime");` and
   `let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");`.
4. **The wrapper must export the plugin's public surface** by returning `module.exports`, and that
   surface must carry the **entry contract**: an `apply(ctx)` function plus the service list
   (`const inject = ["slots"]` in the excerpt). The loader reads these to mount the entry.
5. **`id` must be the bare package name**, equal to the `package.json` `name` and to the
   composition row's `name` (card `DSH-0.1.2-A1-26`; the symptom of a mismatch is the startup
   assertion `loaded without registering "<id>"`).
6. **The package must declare `dsh.client`** (platform `web` + client entry path) or it never
   enters the browser roster at all (cards `DSH-0.1.1-R1-02`/`R1-03`).

---

## 3 · Failure 2 — `slot "settings.section" is not declared`

### 3.1 What the message means

`fixture/plugin-apply-error.txt`:

```
failed to apply loader entry (@lhh010/dsh-profiles): slot "settings.section" is not declared
  (a parent entry's children table must declare it)
All other plugins load and render normally on this boot.
```

The slot model has two roles:

* **The declarer (owner)** publishes a *children table*: the parent slot declares which child
  slots exist, together with their `kind` and `scope`. `settings.section` is declared by the
  **settings shell** entry (the `ui-settings` slot contract owns the settings seats; card
  `DSH-0.1.7-J1-34` / `DSH-0.1.7-A1-11` show the same shape for `settings.launcher` and
  `settings.models.sign-in`: "the settings shell declares the seat in its children"). *Unconfirmed
  from the fixture*: the exact owning package name for `settings.section` at the target tag — the
  fixture only names the slot. The role split is confirmed.
* **The registrant (occupant)** contributes a component into a slot it does **not** own.

The error is raised when a contribution targets a child slot name that the parent's children table
has not (yet) declared.

### 3.2 Why a bare registration fails at apply time

The plugin did this:

```js
export function apply(ctx) {
  ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5, kind: 'section', scope: 'settings' },
    ProfilesSection,
  );
}
```

`ctx.slots.register(...)` is an **immediate** call: it asserts "this child slot exists" *at that
moment*. Cross-package **apply order is unconstrained** — the plugin's `apply` can run before the
settings shell's `apply` has declared the slot. When it does, the assertion fires and the entry
fails to apply. The error appears only for this entry; every other plugin applies normally, which
matches the fixture exactly.

Two further authoring errors are visible in the same call:

* `kind: 'section'` and `scope: 'settings'` are **declarer** fields. A registrant that passes
  them is trying to (re)declare a seat it does not own. Per the skill's troubleshooting row, the
  registrant passes **only** `name` / `id` / `order` (and `label`/locale where the contract
  allows) and **never** `kind` / `scope`. `owner` and the `children` table are likewise
  declarer-only.
* The `slots` service must be **declared in the plugin's client `inject` list** — the working
  excerpt's `const inject = ["slots"];` — and the `ctx.slots` *type* comes from the renderer
  package (type-only import `@deepseek-ai/dsh-client-ui-renderer/client`; the type graph and the
  runtime service graph are checked separately).

### 3.3 The exact wrapping form the registration must use

Wrap the registration in `ctx.slots.inject(name, factory)` so the contribution **waits** for the
declaring entry's declaration:

```js
function apply(ctx) {
  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5 },   // registrant fields only
    ProfilesSection,
  ));
}
```

This is the in-tree pattern for a cross-package seat: card `DSH-0.1.6-A1-22` shows
`ui-permission-presets` occupying `conversation.input.permission`, a slot declared by
`ui-conversation`, via `ctx.slots.inject('conversation.input.permission', () =>
ctx.slots.register({ name, locale, inject }, PermissionSelect))`; card `DSH-0.1.7-J1-34`
prescribes the same wrapper for the settings seats with the reason spelled out: "so the
contribution waits on the declaring plugin's slot declaration (cross-package apply order is
unconstrained)".

Field summary for a registrant:

| Field | Registrant may pass? | Notes |
|---|---|---|
| `name` | yes | must be the **child slot name the owner declared** |
| `id` | yes | stable, provider-unique contribution id |
| `order` | yes | sort order within the seat |
| `label` / locale fields | conditionally | per the seat's contract (e.g. `locale` namespace on a keyed seat) |
| `kind` | **no** | the owner's declaration defines it (`single` / `keyed` / `list`) |
| `scope` | **no** | the owner's declaration defines it (`root` / `session` / `session-maybe`) |
| `owner` / `children` | **no** | declarer-only (the parent's children table) |

### 3.4 One more forward-compat note for this slot

`settings.section` is a **host-owned settings surface**, and the settings plane moved in the
0.1.7 window: `ctx.settings.register` no longer exists; per-profile values live in the plugin's
own Cordis `Config` (`DSH-0.1.7-J1-04`), and the client transport renamed
`settingsScope` → `configForms` (`DSH-0.1.7-J1-27`). If the goal is "a settings page for my
plugin", the target tag's shipped extension points (config form / plugin-manager page) are the
supported seams; `settings.section` is one host seat among several. *Unconfirmed*: the exact
target-tag contract for `settings.section` — the fixture predates any tag identification.

---

## 4 · Dev-loop discipline (failure 3)

### 4.1 Why editing a plugin file changes nothing in the browser

The boot log shows the combo line **once per boot**:

```
[boot] client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)
```

The host **reads and caches** the client bundles at boot and serves the cached bytes. Therefore:

* editing `lib/client.js` on disk changes nothing — not on refresh, not on a hard refresh, not
  after clearing the browser cache; the running host still serves the bytes it read at boot;
* the plugin's own `apply` runs **in the browser**, so a *client* fix requires the host to
  re-read the file ⇒ **host restart**, then browser hard refresh;
* the mirror image is also true on the Host plane: routes/allow-lists are registered once at
  apply time, so a Host-half change also needs a restart (the skill's troubleshooting table
  records the asymmetry: the client bundle was refresh-bound in the 0.1.6 era, the host half was
  always restart-bound);
* card `DSH-0.1.7-A2-04` states the current rule and its verification: client bundles are cached
  at host boot; "a client-bundle edit requires a host RESTART before the page sees it — a
  refresh-only verification reports stale content and can mislead a diagnosis".

One trap to keep in mind while verifying: since 0.1.7-alpha.2 the Web page **auto-reconnects**
after a server restart, so an open tab can keep looking healthy while running pre-restart bytes.
"the page still works" is not proof that the new bundle is being served — fetch the advertised
combo URL and inspect the bytes.

### 4.2 The correct restart procedure

1. **Stop the host completely** — kill the *process*, not the terminal window. On Windows:
   `taskkill /PID <pid> /T /F` (tree kill).
2. **Confirm the port is free** and no orphaned `node` for that host remains.
3. **Start the host** (`dsh web`).
4. **Hard-refresh the browser** (the page may auto-reconnect; still refresh).
5. **Check Settings → Plugins → Plugin list.** An empty list means the combo failed again — and
   with the fix in §5.1 the message will now name *your* bundle, not the first awaited entry.

This is the fixture's own recipe (`fixture/restart-notes.txt`, item 3), and it matches the skill's
"ghost host" discipline (pre-flight step 1.5): a process started before your edit is still running
the old code; on Windows there is no `ps -o lstart`, so compare the process start time against
the file's last-write time, or use the bundled `ghost-host-check.mjs`.

### 4.3 Why the Windows restart died with EADDRINUSE

Mechanism, from the fixture's own observation:

1. The host was started **from a terminal**. On Windows, closing that terminal window does **not**
   kill the child `node` process — the console host goes away, the orphan keeps running. The
   orphaned process still holds the **listening socket**, so the port stays bound.
2. The next host start reaches the bind step and fails with `EADDRINUSE` — a *new* process
   colliding with an *old* one that is still alive. The failure is not a configuration problem; it
   is a leftover-process problem, and it masks the real work (the next plugin edit).
3. `taskkill /PID <pid> /T /F` kills the **whole tree** (the launcher and its node child), the
   handle is released, and the following boot binds normally — exactly as the fixture records.

Corollary for the whole session: every "the plugin did not change" observation in a
restart-driven loop is confounded until the process tree is provably gone. Related Windows trap in
the same family (from the skill's troubleshooting table): a running host holds file handles on
loaded host-half/native files, so replacing an installed file while the host runs yields
`EBUSY` — the lock lives in the **host process**, not the browser. The discipline is identical:
stop the host first, then mutate, then start.

---

## 5 · Prevention

### 5.1 Host-side: name the offending plugin, not the first awaited entry

Concrete, implementable changes — all at startup / combo-build time, before any byte reaches the
browser:

1. **Per-entry validation while composing the combo.** Before concatenating, parse each candidate
   client bundle **as a classic script** and keep a per-entry result
   `{ package, entryPath, ok, error{ message, line, column } }`. The failure class is already
   known to the host: "this file is not a valid classic script".
2. **Attribute the combo failure to the package that owns the bad bytes.** If the concatenated
   combo fails to compile, re-run the per-entry check and report
   *"client bundle of `<package>` (`<entry path>`) is not a classic script: <SyntaxError> at
   line:col"* — the fixture's own message already contains this information
   (`bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`); the host
   should promote it to the **first** line of the error instead of burying it behind
   `failed to import loader entry <first awaited id>`.
3. **Never let one third-party bundle blank the whole plugin surface.** Degrade instead of
   fail-all: exclude the offending bundle from the combo, register every other entry, and surface
   the culprit as a **named** row in Settings → Plugins (e.g. "client bundle invalid: ESM syntax
   at lib/client.js:1:1 — not a classic script") plus a host-log line. Today one bad third-party
   file makes the product look broken and destroys the evidence trail.
4. **Validate the packaging contract at boot, per entry**, and report per entry:
   * the bundle contains a `window.__ModuleLoader__.load({ id, factory })` call;
   * the registration `id` equals the package `name` (card `DSH-0.1.2-A1-26`) and the
     composition row's bare package name;
   * the factory returns `module.exports` and the exports carry the entry contract
     (`apply`, `inject`).
   Missing/inconsistent values should be reported **per package** ("registration id X != package
   name Y"), not as a roster-wide failure.
5. **Publish the composition manifest.** Log/serve the combo composition (entry id → resolved
   file → byte length → per-entry validation verdict). A reader of the next failure can then map
   *error → package* without bisecting, and the "who owns this bundle" question stops being a
   guess.
6. **Serve the combo in a way that isolates entries** (e.g. per-entry script resources aggregated
   by the loader, or a per-entry error boundary) so one plugin's compile error cannot zero the
   roster. At minimum, keep the diagnostic granularity of point 3 even if the serving form stays a
   single classic script.

### 5.2 Authoring-side: the external-plugin onboarding template & checklist

**Template — the client bundle shell** (an external plugin's `lib/client.js` must be a classic
script, see §2.4):

```js
window.__ModuleLoader__.load({
  id: "@scope/my-plugin",                    // == package.json "name"
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");                 // from the host module registry
    const { createPortal } = require("react-dom");
    const inject = ["slots"];                       // services this entry needs
    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'my-plugin', order: 10 },  // registrant fields only
        MySection,
      ));
    }
    return module.exports;                          // apply + inject must be reachable
  },
});
```

**Checklist — before the first install**

| # | Check | Why / reference |
|---|---|---|
| 1 | Client bundle compiles **as a classic script** (no top-level `import`/`export`); `grep -nE "^(import|export)\b" lib/client.js` is empty | a single module token kills the whole combo (§1.2) |
| 2 | `window.__ModuleLoader__.load({ id, factory })` present; `id` == `package.json` `name` == composition row `name` | cards `DSH-0.1.2-A1-26`, `DSH-0.1.1-R1-03` |
| 3 | React and every other dependency come from the factory's `require`, never from a shipped/imported copy | host owns the module table |
| 4 | The wrapper returns `module.exports`; exports carry `apply(ctx)` and the `inject` service list | entry contract (working excerpt) |
| 5 | `package.json` declares `dsh.client` (platform `web` + client entry path) | cards `DSH-0.1.1-R1-02`, `R1-03` |
| 6 | `dsh.client.inject` lists only **real runtime module providers**; every service used is declared in the client `inject` list (e.g. `slots`) | alpha.2 precision checklist; a missing declaration is a pending row / missing-service boot error |
| 7 | Slot contributions use `ctx.slots.inject(name, () => ctx.slots.register({ name, id, order }, C))`; **never** `kind`/`scope` | §3.3 |
| 8 | No module-level side effects (DOM creation, portals) outside `apply(ctx)` | the fixture's bundle creates a DOM host and calls `createPortal` at module scope — evaluation-time side effects run before the entry is mounted |
| 9 | Settings-owning plugins follow the target tag's settings plane (per-plugin `Config`, not `ctx.settings.register`) | card `DSH-0.1.7-J1-04`; `settingsScope`→`configForms` (`DSH-0.1.7-J1-27`) |
| 10 | Cold-boot acceptance in an isolated profile: **plugin list non-empty**, the plugin's DOM marker renders, zero page errors; the advertised artifact URL returns 200 and the bytes contain `__ModuleLoader__.load` | card `DSH-0.1.2-A1-19` (read the boot manifest + token→Cookie; do not hand-build resource paths; HTTP 200 alone proves nothing) |
| 11 | Restart discipline: stop the **process tree** → start → hard refresh → re-check the plugin list | §4.2–4.3; card `DSH-0.1.7-A2-04` |

**Checklist — per iteration during development**

1. Edit the plugin's client bundle.
2. **Restart the host** (tree-kill on Windows), then hard-refresh the browser.
3. Verify the *served bytes*, not just the page: fetch the host-advertised combo URL and confirm
   the new text is present (the page may auto-reconnect and look fine with stale bytes).
4. Empty plugin list ⇒ the combo failed ⇒ re-read the error's **path**, not its id (§1.3).

### 5.3 Where this incident would have been caught earlier

| Layer | Would have caught | When |
|---|---|---|
| Build/format gate | failure 1 (bare ESM client bundle) | before packing/publishing |
| Cold-boot acceptance on an isolated profile | failures 1 and 2 (entry applies, DOM marker renders) | before the plugin is considered installed |
| Slot-contract typecheck (`ctx.slots` types from the renderer package) | failure 2 at typecheck time | in CI |
| Per-entry boot validation + degraded combo | failure 1 (and turns a total outage into one named bad row) | at host boot, for the *next* author |
| Restart checklist in the plugin README | failure 3 (stale bytes / EADDRINUSE loop) | every iteration |

---

## 6 · Verification artifacts produced by this analysis

All under `agent-output/S17-external-ui-plugin-onboarding-trap/` (the fixture was not modified):

| Artifact | What it is | Result on the fixture |
|---|---|---|
| `scratch/client-bundle-format-check.mjs` | read-only static gate: classic-script compile + top-level ESM tokens + loader wrapper + id↔package-name | flags `fixture/plugin/lib/client.js` (exit 1); passes the working excerpt (exit 0) |
| `scratch/working-plugin-code.js` | the code block extracted from `fixture/working-plugin-excerpt.txt`, used as the conforming reference | classic-script compile: OK |

Both reproduce the host-side failure mode exactly:
`SyntaxError: Cannot use import statement outside a module` for the offender, clean compile for the
working bundle.

## 7 · Unconfirmed / open items

* The **target DSH tag** of this profile is not identified by the fixture, so all card references
  above are cited for the *contract* they state, not as "the change you must make at tag X". Where
  the plane moved (settings → profile `Config`, `settingsScope`→`configForms`, `settings.section`
  ownership), the exact target-tag shape must be re-read from that tag's slot contract before
  shipping.
* The **owning package** of the `settings.section` child slot is inferred (the settings shell /
  `ui-settings` slot contract family), not stated by the fixture.
* The fixture's error path form (`/plugins/<package>/lib/client.js`) differs from the card's
  recorded combo form (`/plugins/??<package>/client.js&rev=…`); both are consistent with "the
  host advertises the artifact — do not derive paths yourself" (card `DSH-0.1.2-A1-19`).
* Whether the host currently *degrades* (skips a bad bundle) or *fails all* was not observable
  from the fixture: failure 1 shows a total outage, so it fails all — but no fixture line shows
  what the host would do with a per-entry validation result, hence §5.1 is a proposal, not a
  description of current behavior.
* The EADDRINUSE analysis explains the *observed* mechanism (orphaned node process holding the
  socket). The fixture does not record the exact launcher topology (shell → node → children); the
  tree-kill remedy is the one the fixture records as working.
