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

# S17 · The External UI Plugin Onboarding Trap — Root-cause report

Scope: read-only incident diagnosis (skill `plugin-upgrade`, Mode A · inspect). Evidence
read from the static fixture under `fixture/` (browser-error.txt, host-boot-log.txt,
plugin/lib/client.js, profile/cordis.patch.yml, plugin-apply-error.txt, restart-notes.txt,
working-plugin-excerpt.txt) and the read-only skill references. No files outside the
allowlist were opened; the fixture was not modified. Reference cards are cited by key point
+ card ID only, per the brief.

---

## 1. Failure 1 — one plugin's client bundle took down every plugin's registration

**Root cause.** The new plugin shipped its client bundle as *bare ESM*. `client.js`
starts with a top-level `import React from 'react'` / `import { createPortal } from
'react-dom'` and ends with `export function apply(ctx)`. At boot the host does **not**
load that file as an ES module — it reads every installed package's client bundle and
**concatenates them into a single classic `<script>`** (host-boot-log: `composed 53
loader entries into client bundle combo (4.5 MB, classic script)`). A "classic script" is
parsed as an ordinary script, not as a module, so the leading `import` token is a
**syntax error at position 1:1** in the combined program.

Because all 53 bundles are one concatenated program, a single parse error aborts the
**entire** script before it executes — the whole combo never runs, so **no** plugin calls
its registration and Settings → Plugins shows an empty list (zero entries). It is a
whole-combo failure: the one bad bundle is byte-0 fatal for the concatenated artifact,
which is why the two previously-working stock plugins vanish too.

**What the host assembles, and in what form it reaches the browser.**

- At boot the host scans installed packages that declare `dsh.client` (manifest field:
  `platform: web` + the client entry path, e.g. `lib/client.js`) — a package without
  that declaration never enters the roster (DSH-0.1.1-R1-02, DSH-0.1.1-R1-03).
- It reads each declared `lib/client.js`, concatenates them, and serves the result from a
  single combo route (`/plugins/??<pkg>/client.js&rev=...`) as one classic script
  (DSH-0.1.2-A1-26 verification line).
- Each plugin's client half is expected to be a **self-registering factory**:
  `window.__ModuleLoader__.load({ id, factory })`. The loader calls each factory with a
  CommonJS-style `require` and expects back a module object exposing `apply` (and
  usually an `inject` list). See the working-plugin-excerpt for the exact shell.

So the contract is: one classic script, N self-registering `__ModuleLoader__.load(...)`
calls — **never** top-level ESM `import`/`export`.

**Why the error names `@deepseek-ai/dsh-typert-registry` when that entry is innocent.**
The loader registers/awaits entries and reports the **first awaited loader entry** whose
import fails to resolve; `dsh-typert-registry` is simply that first entry in the await
order (a stock host package the user never touched). The real culprit is in the *same*
message's lower half — `bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error
(position 1:1)` — which is the parser's precise finger at the offending bundle. The
headline names the victim (first in line), the detail names the perpetrator; the user
stopped reading at the headline. This mirrors the known symptom family: the named id is
only the first awaited entry and one ESM token fails the whole classic-script combo
(troubleshooting.md, "Failed to load plugins … then zero plugins register").

## 2. Diagnosis discipline — finding the culprit despite the misleading headline

**How it should have been located.** Treat the whole-combo parse failure as a
*bisection over the patch layer*, not as evidence about the named entry:

1. Read the full error to the end: the `bundle … compile error (position 1:1)` clause
   already names the offending bundle and the exact position (1:1 = a leading ESM token).
2. Bisect `cordis.patch.yml`'s `insert` rows: remove only the last-added row
   (`dsh-profiles`) and re-boot — if the combo loads, the removed row is the culprit;
   otherwise binary-search the remaining rows. The new row is almost always the change that
   broke a previously-working boot (host-boot-log: "3 insert rows resolved … dsh-profiles"
   is the only delta).
3. Confirm per-bundle with a **cheap static check** (below), which flags the offending
   bundle without a full boot.

**Cheap static check that flags the offending bundle.** For each installed plugin's
declared client entry (`lib/client.js`):

- assert the file **starts** with `window.__ModuleLoader__.load(` (or at least contains it
  and no top-level ESM); and
- grep for a **top-level** `import` / `export` statement — any hit at column 0, outside
  a string/comment, is fatal in a classic-script combo. A bare `import React from 'react'`
  at 1:1 is exactly the signature. Equivalently run `node --check` on each bundle with
  ESM disabled (a classic-script parse) and attribute the first syntax error to its file.

**The client-bundle format an external plugin must ship instead of bare ESM.** Wrap the
code in `window.__ModuleLoader__.load({ id, factory })`:

- **What wraps the code**: the whole bundle is one call to
  `window.__ModuleLoader__.load(...)`, with the plugin body inside a `factory` function.
  The factory fabricates a CommonJS module shape (`var module = {exports:{}};
  var exports = module.exports;`) and sets
  `Object.defineProperty(exports, Symbol.toStringTag, {value:"Module"})` so the loader
  treats the result as an ES-module-shaped export.
- **How React is obtained**: via the `require` argument *inside* the factory —
  `require("react")` / `require("react/jsx-runtime")` (and any
  `@deepseek-ai/dsh-client-*` packages the same way). React is never a top-level ESM
  import; it is resolved by the combo's module loader at call time.
- **What the wrapper must export**: `factory` must `return module.exports`, carrying the
  plugin's `apply(ctx)` (and normally `const inject = [...]` listing consumed services,
  e.g. `["slots"]`). The `id` passed to `load({ id, ... })` must equal the package.json
  `name` (e.g. `"@lhh010/dsh-profiles"`) — the boot manifest keys entries/modules/
  registrations by package name (DSH-0.1.2-A1-26).
- Secondary smell in the same file: the plugin also runs imperative top-level DOM work
  (`document.createElement` / `document.body.appendChild` / `createPortal`) at module
  scope instead of rendering through the slot inside `apply`. That is outside the asked
  failure but belongs on the authoring checklist (side-effect-free module top, render via
  the slot contribution).

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

**What the message means.** `settings.section` is a slot that **another entry owns and
declares** (the settings-shell UI entry), not something this plugin can conjure. A slot
declaration is the *owner's* act: for a keyed/list slot the owner declares the slot and its
**children table** — the set of child names/keys it will accept (with the slot's
`kind`/`scope`/`owner` metadata). `settings.section` is a child of the settings
slot, so it must appear in the settings owner's children table; a plugin that merely
*registers into* that name has not declared it and cannot make the registration land until
the owner has.

**Who declares slots.** The slot's owning entry (the settings-shell/UI package) declares
its own slots — e.g. `'main': { kind:'keyed'; scope:'root' }` by `ui-layout`, or the
`settings.plugin.item` keyed slot by the settings panel (DSH-0.1.5-A2-03; DSH-0.1.2-A3-01).
Cross-package **apply order is unconstrained**, so a third-party registrant's `apply` can
run *before* the owner has declared the slot; a bare `ctx.slots.register` then hits
"not declared" at apply time.

**Why a bare registration of another entry's slot fails at apply time.** Because the
registration executes immediately in the registrant's own `apply`, but the declaration it
depends on lives in a *different* entry whose `apply` may not have run yet. Nothing
orders the two entries, so the register races the declare and loses.

**Exact wrapping form.** Defer the registration until the declarer has declared the slot:

```js
const inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register({ name: "settings.section", id: "profiles-manager", order: 5 }, ProfilesSection)
  );
}
```

`ctx.slots.inject(name, () => ctx.slots.register(...))` waits on the declaring plugin's
slot declaration and only then runs the inner register (troubleshooting.md slot row;
DSH-0.1.6-A1 / DSH-0.1.7-A1 settings-seat cards use the identical pattern for
`conversation.input.permission` / settings seats). `slots` must also be declared in the
entry's `inject`.

**Fields a registrant may pass vs must not pass.** The registrant passes only
`name` (the slot it contributes into), `id` (its own contribution key), and
`order` (optional) plus an optional `label`/locale. It **must not** pass `kind` or
`scope` — those are the *owner's declaration* metadata (single/keyed/list and
root/session/session-maybe) and re-stating them from the child is wrong; the user's
`kind: 'section', scope: 'settings'` is exactly the forbidden pair (and `'section'` is
not even a valid slot kind).

## 4. Dev-loop discipline — why edits need a restart, and the EADDRINUSE death

**Why the combo is not rebuilt on plugin-file change.** Combo assembly happens **once at
host boot**: the host reads each declared client bundle and concatenates the served
artifact at startup, then serves that cached artifact. Editing a bundle on disk afterwards
changes nothing in the browser — even after a hard refresh — until the host process is
stopped and started again (host-boot-log: "The combo line appears ONCE per boot"; client
bundles are cached at host boot — DSH-0.1.7-A2 client-bundle cache card). There is no
watch/HMR path for a community plugin's linked bundle: client-plugin HMR only recompiles
the checkout's own client-plugin bundles while its dev watcher runs, which does not cover
an external `@lhh010/dsh-profiles` bundle. Hence every plugin edit is host-restart gated.

**Correct restart procedure.** Fully stop the host process **tree**, then start fresh and
hard-refresh the browser:

1. Stop the host completely — on Windows closing the launching terminal is **not** enough
   (see below); kill the tree with `taskkill /PID <pid> /T /F`.
2. Start `dsh web` again; verify the boot log shows the combo line for the new contents.
3. Browser hard refresh; then check Settings → Plugins → Plugin list (an empty list means
   the combo failed again — re-read the full error).

**Why the restart died with EADDRINUSE.** The old host's node process was orphaned: closing
the launching terminal did not terminate the child node process, which kept holding the
listening port. The next host boot bound the same port and failed with `EADDRINUSE`.
Only killing the **whole process tree** (`taskkill /PID <pid> /T /F`) released the port,
after which the next boot bound normally. The lesson is Windows-specific: stop the tree,
not just the foreground process, before restarting.

## 5. Prevention

**Host-side prevention.**

- **Attribute the compile failure to the offending bundle, not the first awaited entry.**
  At combo-assembly/compile time, compile each bundle individually (or keep per-bundle
  source spans), and when a bundle fails to compile, report *that* bundle's package id plus
  file/line/column — e.g. `client-modules: bundle <pkg>/lib/client.js compile error at
  1:1 (bare ESM `import` is not allowed in a classic-script bundle)` — instead of
  surfacing only "failed to import loader entry <first-awaited-id>". Even better, run a
  cheap static gate at startup: for each bundle, flag any top-level `import`/`export`
  token before concatenation and fail with the specific package name. If one bundle is
  malformed, isolate it and report that plugin as the failure, so the other N-1 entries
  still register (fail the one plugin, not the whole combo roster).
- **Reorder the message**: the current error already carries the culprit in its detail
  clause — promote that detail to the headline and demote "first awaited entry" to a
  hint, so a misleading-but-innocent id is never mistaken for the cause.
- Optionally name the delta: on boot, diff the resolved insert rows against the previous
  boot and mark the newly-added entry in any combo-failure report.

**External-plugin authoring template / checklist** (so the next onboarding avoids all three):

1. **Packaging contract** — ship a classic self-registering bundle, not ESM:
   - `window.__ModuleLoader__.load({ id: "<package.json name>", factory })`; id must equal
     the package `name` (DSH-0.1.2-A1-26).
   - React/deps via `require("react")` / `require("react/jsx-runtime")` *inside* the
     factory; no top-level `import`/`export`.
   - Factory returns `module.exports` exposing `apply` (and `inject`); set
     `Symbol.toStringTag = "Module"`.
   - Declare `dsh.client` (`platform: web` + client entry path) in package.json
     (DSH-0.1.1-R1-02/R1-03); keep module top side-effect-free (no `document.body.append`).
2. **Static self-check before install** — grep the built `lib/client.js` for top-level
   ESM tokens; assert it starts with `window.__ModuleLoader__.load(`; assert the
   `load({id})` equals the package name; `node --check` the bundle as a script.
3. **Slot discipline** — register foreign slots through
   `ctx.slots.inject(name, () => ctx.slots.register({ name, id, order }, Component))`;
   declare `slots` in `inject`; pass only `name`/`id`/`order`(+label), never
   `kind`/`scope` (those are the owner's declaration fields).
4. **Dev loop** — every bundle edit requires a full host **tree** restart
   (`taskkill /PID <pid> /T /F` then `dsh web`), then a browser hard refresh; do not
   expect HMR for a linked community bundle.
5. **Failure triage** — on any boot error read the *whole* message to the `bundle …
   compile error` detail; bisect `cordis.patch.yml` insert rows (remove the newest first)
   before touching any named "innocent" entry.

---

## References (key point + card ID only)

- Classic-script combo / "named entry is only the first awaited, bare ESM kills the whole
  combo" — troubleshooting.md symptom row ("Failed to load plugins … zero plugins
  register").
- Slot-not-declared apply-time error and `ctx.slots.inject` wrapper / name·id·order-only
  rule — troubleshooting.md slot row; identical inject pattern in DSH-0.1.6-A1 and
  DSH-0.1.7-A1 settings-seat cards.
- Client-modules scans only `dsh.client`; `dshClient` merged into `dsh.client` —
  DSH-0.1.1-R1-02, DSH-0.1.1-R1-03.
- Registration id == package.json name; combo route `/plugins/??…` and
  `__DSH_BOOT__` verification — DSH-0.1.2-A1-26.
- Whole-roster client-combo failure attributes to the wrong (first/innocent) entry and is
  healed by a host restart — DSH-0.1.5-A1-20.
- Slot declaration shape (`kind`/`scope`/`owner` from the owner; keyed slot +
  children table) — DSH-0.1.5-A2-03.
- Official settings keyed-slot seam (`settings.plugin.item`) — DSH-0.1.2-A3-01.
- Client bundles cached at host boot (install-tree client edit needs a host restart) —
  DSH-0.1.7-A2.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.