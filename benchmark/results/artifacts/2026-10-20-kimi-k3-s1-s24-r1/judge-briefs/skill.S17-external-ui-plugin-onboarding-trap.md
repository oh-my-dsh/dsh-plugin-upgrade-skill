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
#### FILE: S17-external-ui-plugin-onboarding-trap/S17-report.md

# S17 · The External UI Plugin Onboarding Trap — Incident Analysis Report

Skill: `plugin-upgrade` (Mode A · read-only inspection). Fixture read-only, untouched.
Key reference anchors: troubleshooting.md rows 13/14/16/18/19/20 (plugin-upgrade skill),
DSH-0.1.7-J1-34, DSH-0.1.7-A2-04, DSH-0.1.2-A1-26, DSH-0.1.2-A1-25 (card IDs only).

---

## 1. Failure 1 root cause — one plugin's ESM bundle killed every plugin's registration

**What the host assembles.** At boot the host reads the client bundle (`lib/client.js`)
of EVERY plugin row resolved from the profile's `cordis.patch.yml`, and concatenates them
into ONE **classic script** — the "client bundle combo" (host-boot-log.txt:
`client-modules: composed 53 loader entries into client bundle combo (4.5 MB, classic script)`).
That combo is what reaches the browser: a single non-module `<script>`, not a module graph.

**Why one bundle poisoned the whole combo.** The user's plugin shipped
`plugin/lib/client.js` as **bare ESM**: its very first bytes are
`import React from 'react'`. An `import` statement is only legal in a module context; in a
classic script it is a *compile-time* syntax error, and compile errors in a classic script
reject the ENTIRE script — none of its code runs. Because the combo is one concatenated
script, the compile error (`position 1:1`, i.e. the top-level `import` token at the start of
the offending bundle's segment) aborts the whole combo before ANY plugin's
`window.__ModuleLoader__.load({...})` registration executes. Result: Settings → Plugins list
EMPTY, and even the two stock plugins (brand version, file trace) that worked before the
insert disappear — the failure is total, not per-plugin.

**Why the error named `@deepseek-ai/dsh-typert-registry`.** The error text is
`failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry): client-modules:
bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)`.
`dsh-typert-registry` is innocent — it is merely the **first awaited loader entry** in the
boot sequence: the browser boot awaits plugin loading, the awaited promise rejects with the
combo's compile error, and the rejection is attributed to whichever entry was being awaited at
that moment. The true culprit is in the *detail* part of the same message: the bundle path
`/plugins/@lhh010/dsh-profiles/lib/client.js`. Attribution rule (troubleshooting.md row 13):
the named entry is the first awaited entry, not the offender.

## 2. Diagnosis discipline — locating the culprit despite the misleading error

- **Do not trust the entry id** in `failed to import loader entry <id>`. Check whether the
  message carries a bundle path; if it does (`/plugins/@lhh010/...` here), that path IS the
  culprit.
- **Bisect the patch layer**: the failure appeared exactly when ONE `insert` row
  (`dsh-profiles` → `@lhh010/dsh-profiles`) was added to `cordis.patch.yml`. Remove/half-split
  the insert rows — combo works without the new row, fails with it ⇒ culprit confirmed. The
  two pre-existing rows (`dsh-brand-version`, `dsh-file-trace`) rendered fine before, so they
  are exonerated by history alone.
- **Cheap static check**: grep each plugin's shipped client bundle for top-level ESM tokens —
  `^import ` / `^export ` at line start (position 1:1-style). A compliant bundle starts with
  `window.__ModuleLoader__.load({`. One `rg -n "^import |^export " lib/` flags the offending
  bundle in seconds without any boot. (Cross-check with pre-flight.md's
  `__ModuleLoader__|PLUGIN_ID` pattern: a bundle that lacks it entirely is malformed.)

**The packaging contract an external plugin must ship** (working-plugin-excerpt.txt):
- The bundle is wrapped as `window.__ModuleLoader__.load({ id, factory })` — a classic-script
  self-registration, no ESM anywhere.
- `id` MUST equal the package.json `name` (here `@lhh010/dsh-profiles`); mismatch yields the
  startup assertion `loaded without registering "<id>"` (troubleshooting.md row 8, DSH-0.1.2-A1-26).
- React and host packages are obtained via the injected CommonJS-style `require` INSIDE the
  factory (`require("react")`, `require("react/jsx-runtime")`, `require("@deepseek-ai/dsh-client-ui-primitives")`),
  never via top-level `import` — the module loader resolves them against the host-provided
  module table.
- The factory builds `module.exports` and returns it; the wrapper must export the plugin
  surface — at minimum the `apply(ctx)` lifecycle function (and declare `inject`, e.g.
  `["slots"]`). In practice this wrapper is produced by the tsdown build with the `PLUGIN_ID`
  banner — authors build, they do not hand-write the shell.

## 3. Failure 2 — `slot "settings.section" is not declared (a parent entry's children table must declare it)`

**Meaning.** Slot names are owned: a parent entry (here the settings shell, a stock host
package) DECLARES `settings.section` in its children table; other entries may only REGISTER
contributions INTO that declared slot. The error means a `ctx.slots.register({name:'settings.section', ...})`
executed at a moment when no declaration for `settings.section` existed yet in the runtime.

**Why the bare registration failed.** Cross-entry apply order is undefined/unconstrained
(troubleshooting.md row 14; DSH-0.1.7-J1-34: "cross-package apply order is unconstrained").
The user's plugin called `ctx.slots.register(...)` directly at apply time; its apply ran
BEFORE the settings shell's apply that declares the slot, so the registration hit an
undeclared slot and was rejected. It is an ordering race, not a wrong name — the same code
might pass on a boot where the order happened to flip, which is why it must be fixed
structurally, not by retrying.

**The exact wrapping form.** Register through the deferred injector:

```js
ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'profiles-manager', order: 5 }, ProfilesSection))
```

`inject` makes the contribution WAIT on the declaring plugin's slot declaration, eliminating
the ordering dependency entirely.

**Field discipline.** A registrant may pass only `name` / `id` / `order` (and `label` where the
contract has one). It must NOT pass `kind` or `scope` — those are properties of the slot
declaration owned by the parent entry, and re-stating them in a registration is outside the
registrant's authority (the user's bundle passed `kind: 'section', scope: 'settings'` — both
must go). Also note: the DOM side effects at the bundle's top level (`document.body.appendChild`,
`createPortal` outside `apply`) are out of contract as well — a settings-section contribution
renders through the slot, not through a self-created portal.

## 4. Dev-loop discipline — why edits do nothing and why the restart died

**Boot-time combo assembly.** The combo is assembled ONCE per host boot (host-boot-log.txt:
the `composed 53 loader entries` line appears once; card DSH-0.1.7-A2-04: "client bundles are
cached at host boot"). The running host process serves the combo it built at startup from
memory/cache; editing `lib/client.js` on disk afterwards changes nothing in the browser —
even after a hard refresh — because the browser re-fetches the SAME cached combo from the
SAME running process. There is no file-watcher on install-tree client bundles.

**Correct restart procedure.**
1. Fully stop the host process (a browser refresh or closing the tab is NOT a host stop).
2. Start `dsh web` again — boot re-reads every plugin's client bundle and rebuilds the combo.
3. Browser hard refresh, then verify Settings → Plugins → Plugin list is non-empty (empty =
   the combo failed again — the fastest regression probe, per restart-notes.txt step 3).

**Why Windows died with EADDRINUSE.** Closing the launching terminal window does not
necessarily kill the host's node process tree on Windows — the orphaned node process
survived, still bound to the listening port. The next boot then failed with EADDRINUSE
because the port was still held by the orphan. Only killing the whole process tree —
`taskkill /PID <pid> /T /F` (`/T` = child tree, `/F` = force) — released the port, after
which the next boot bound normally. Discipline: before restarting, verify no dsh node
process survives; treat EADDRINUSE on boot as "a previous host is still alive", not as a
new-host problem. (Same family as the EBUSY file-lock row in troubleshooting.md row 19:
locks/ports belong to the host process, never the browser.)

## 5. Prevention

**Host-side (startup / combo-failure attribution):**
1. When combo compilation fails, surface the **bundle path and byte offset** as the primary
   error (the info already exists — `bundle /plugins/@lhh010/dsh-profiles/lib/client.js
   compile error (position 1:1)` was present but subordinated to the misleading awaited-entry
   id). Never headline the first awaited entry as if it were the cause; label it explicitly
   as "first awaited entry (usually innocent)".
2. Compile-validate each plugin's client bundle INDIVIDUALLY at boot (e.g. per-bundle
   syntax check before concatenation) and refuse/report per bundle: "plugin X's client
   bundle is not a valid classic script" — turning a whole-combo failure into a named
   per-plugin failure while letting compliant plugins still load.
3. Emit a boot warning when a client bundle lacks the `__ModuleLoader__.load` wrapper or
   contains top-level `import`/`export` tokens (the same cheap static check from §2).
4. On EADDRINUSE at boot, probe and print the PID/command line already holding the port
   with the suggested `taskkill /PID <pid> /T /F` remediation.

**Authoring-side (template / checklist for external UI plugins):**
1. **Build, don't hand-write the client entry**: ship the tsdown-built bundle whose shell is
   `window.__ModuleLoader__.load({ id: <package.json name>, factory })`; verify the packed
   artifact, not just source.
2. Static gate in CI / pre-publish: no top-level `^import `/`^export ` in `lib/client.js`;
   bundle starts with `__ModuleLoader__.load`; registration id == package.json `name`.
3. React/host deps via the factory's `require(...)`; declare them as peers/externals, never
   bundle or import them at top level.
4. Cross-entry slots (any slot you did not declare — `settings.section`, `conversation.*`,
   `settings.launcher`, …): ALWAYS `ctx.slots.inject(name, () => ctx.slots.register(...))`;
   pass only `name`/`id`/`order`(/`label`); never `kind`/`scope`.
5. No DOM side effects at bundle top level — all rendering through `apply(ctx)` and slots.
6. Dev-loop note in the README: client-bundle edits require a FULL host restart + hard
   refresh; on Windows confirm the old node process tree is dead (`taskkill /T /F`) before
   restarting; after boot, non-empty Settings → Plugins list is the smoke test.
7. Install discipline: one `insert` row per plugin in `cordis.patch.yml`, and never insert an
   id the bundle layer already provides (duplicate loader entry id is fatal at boot —
   troubleshooting.md row 18).

---

## Evidence map

| Claim | Fixture file |
|---|---|
| Combo = classic script, 53 entries, assembled once per boot | fixture/host-boot-log.txt |
| Misleading error names dsh-typert-registry; detail names the real bundle, position 1:1; plugin list empty | fixture/browser-error.txt |
| Offending bundle: top-level ESM imports, portal side effect, bare register with kind/scope | fixture/plugin/lib/client.js |
| Compliant wrapper shape (load/factory/require/inject) | fixture/working-plugin-excerpt.txt |
| Slot-not-declared apply-time error | fixture/plugin-apply-error.txt |
| Install = 3 insert rows | fixture/profile/cordis.patch.yml |
| Restart/EADDRINUSE/taskkill /T /F, empty-list smoke test | fixture/restart-notes.txt |

Skill cards cited by ID only: troubleshooting.md rows 8/13/14/18/19, DSH-0.1.2-A1-25,
DSH-0.1.2-A1-26, DSH-0.1.7-A2-04, DSH-0.1.7-J1-34.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.