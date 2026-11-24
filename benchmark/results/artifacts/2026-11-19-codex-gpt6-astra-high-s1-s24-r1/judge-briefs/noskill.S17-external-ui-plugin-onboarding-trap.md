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
#### FILE: S17-external-ui-plugin-onboarding-trap/incident-report.md

# S17 — External UI plugin onboarding incident

## Scope and evidence

This is a read-only diagnosis of the supplied static evidence pack. No skills, network, installations, migrations, host restarts, process kills, or executable fixture code were used. Only this report was written. No runtime fix is claimed. References below are relative to `fixture/`.

## 1. The first failure is a whole-combo syntax failure

The culprit is `@lhh010/dsh-profiles`, specifically `plugin/lib/client.js`, which starts with `import React from 'react'`, imports `react-dom`, and later uses `export function apply`. These are ESM declarations. They are invalid in a classic script, regardless of whether React is installed or the profile link resolves correctly.

`host-boot-log.txt` and `restart-notes.txt` establish the transport: at boot the host reads installed plugins' client bundles and concatenates them into one classic-script client bundle combo (53 loader entries, 4.5 MB in the captured boot). The browser does not independently import these files as ESM modules. The working bundle shows how individual modules register inside that script: `window.__ModuleLoader__.load({ id, factory })`. A syntax error prevents the combined script from executing, including registration calls belonging to innocent modules. This explains the empty plugin list and disappearance of previously working header plugins.

The outer message names loader entry `0c013085 (@deepseek-ai/dsh-typert-registry)` because that is the entry whose import the loader was awaiting/reporting when the shared combo failed; it is not evidence that the stock registry bundle caused the syntax error. The nested error explicitly identifies `/plugins/@lhh010/dsh-profiles/lib/client.js` at position 1:1. The evidence supports a shared failure attributed to an awaited entry; the exact promise/error propagation implementation is not supplied.

## 2. Locate the producer, then fix the packaging contract

Start with the deepest error and inspect the named external bundle. Compare its first lines with `working-plugin-excerpt.txt`. Do not edit the innocent stock registry based on the outer entry label.

If the nested bundle attribution were missing, isolate newly inserted external entries in a disposable profile: remove/disable the new `dsh-profiles` insert first, rebuild/restart, and compare plugin registration. For a larger suspect set, bisect external insert rows and their corresponding client bundles, restarting between configurations. Bisect membership of the combo, not arbitrary stock loader entries or individual React components. A retained linked directory alone need not imply that an entry is included; the active profile entry set is the relevant control. This is a proposed procedure, not a change made to the supplied fixture.

A cheap static scan of emitted `lib/client.js` files for lines beginning with `import` or `export` immediately catches this file. Such a scan is only a warning heuristic (comments, strings, multiline syntax, and dynamic import require care). The authoritative cheap gate is parsing each emitted bundle in classic-script mode, then parsing the final combo in the same mode. No code execution is necessary.

An external client bundle must register a factory with the host loader, obtain shared dependencies using the factory's `require`, expose the plugin lifecycle exports, and return those exports. For this component's `React.createElement` usage, the packaging shell is:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    // Compile/include ProfilesSection here; no raw JSX or top-level ESM.
    exports.inject = ["slots"];
    exports.apply = function apply(ctx) {
      // Deferred settings.section contribution described below.
    };
    return module.exports;
  },
});
```

For automatic JSX output, resolve `react/jsx-runtime` through the same loader, as the working excerpt does. Other host-shared libraries likewise use factory `require`; do not bundle a second React singleton. An ordinary ESM output or an arbitrary IIFE with no loader registration/export contract is insufficient. Defining local `inject` and `apply` constants without actually placing them on `module.exports` is also insufficient; the working excerpt is explicitly redacted, so its omitted export wiring must not be copied as an omission in a new template.

The original top-level DOM append and `createPortal(...)` are unnecessary for the slot contribution. A returned portal must participate in a React render to mount anything; merely calling `createPortal` does not mount it. Let the host slot render the supplied component and keep side effects within lifecycle/disposal boundaries.

## 3. The second failure is slot declaration/order, not bundle parsing

`plugin-apply-error.txt` shows other plugins now load normally, while this entry fails during apply. Packaging has progressed far enough for `apply` to run. A registration is a contribution to an already declared slot; it does not create that slot. The parent/owner entry declares `settings.section` in its `children` table and owns its structural metadata. Bare `ctx.slots.register(...)` during this plugin's apply can run before that declaration exists. Depending on the slots service alone (`inject: ["slots"]`) does not establish that a particular slot has been declared.

The contribution must be deferred through the slot service's `inject` wrapper for `settings.section`, with `register` inside the wrapper, so the owning declaration is available before registration. Its registration descriptor should contain contributor fields `name: "settings.section"`, `id: "profiles-manager"`, and `order: 5`, followed by `ProfilesSection` as the component argument. Remove `kind: "section"` and `scope: "settings"` from the contributor descriptor: these attempt to supply declaration/owner metadata. Do not work around ordering by forging a competing `children` declaration in the external plugin. Ensure the real parent entry is installed/enabled; deferral cannot repair a permanently absent declaration.

The requested exact, executable `ctx.slots.inject` argument signature cannot be established from this evidence pack. `working-plugin-excerpt.txt` explicitly elides all its `ctx.slots.inject(...)` calls, and no implementation, type declaration, or complete example is supplied. The required nesting is therefore shown as pseudocode rather than an invented verified API:

```text
ctx.slots.inject(<settings.section dependency in the host API's required form>,
  <callback using the API's scoped context> => {
    scopedContext.slots.register(
      { name: "settings.section", id: "profiles-manager", order: 5 },
      ProfilesSection
    )
  })
```

Before shipping a patch, inspect the local slot service declaration or an unredacted working caller to settle whether the dependency argument is a string, array, or other descriptor and how the scoped context is passed. The error establishes declaration ownership; the working excerpt establishes availability of an inject-based pattern. Neither establishes the exact signature or exhaustive allowed-field schema. The descriptor above is the conservative repair for this incident, not an asserted complete list of all supported contributor options.

## 4. Development loop and the Windows restart failure

The combo is a boot-time snapshot. These observations establish no file watcher/rebuild/invalidation path for the captured setup. Changing plugin files and even hard-refreshing the browser continues to fetch the existing combo until the host is stopped and started. A browser cache clear alone cannot regenerate it.

Use this loop: rebuild the plugin's emitted bundle; inspect/parse its output; stop the existing host cleanly; verify that its processes exited and the actual listening port is released; start one host instance with the intended profile; check for the new combo assembly and successful bind in logs; hard-refresh the browser; inspect Settings → Plugins → Plugin list and the rendered settings contribution. Also check that existing header plugins remain present. An empty list signals another global load failure and should send diagnosis back to combo errors.

On Windows, closing the launching terminal did not terminate the old host's node process. The surviving process retained the listening socket; the next host consequently failed with EADDRINUSE. Identify and verify the PID belonging to that host before terminating anything. If normal shutdown fails, the recorded recovery is `taskkill /PID <verified-host-pid> /T /F`, terminating the host process tree rather than indiscriminately killing all node processes. Verify release before starting the replacement. No actual PID/port is included in the evidence and none should be invented. The failure is a process-lifecycle issue, not evidence of a React, slot, or packaging defect.

## 5. Prevention

At startup, the host should parse each bundle under the actual classic-script contract before accepting it into the combo. Report plugin/package ID, profile entry, resolved bundle path, syntax location, and a diagnostic for ESM declarations in classic output. Check required loader registration identity and lifecycle exports where feasible, keeping syntax parsing distinct from unsafe execution-based validation. Parse the final combined script as well, because concatenation boundaries can introduce failures absent from individual files.

Keep an explicit mapping from combined source offsets to plugin bundle paths, with boundary markers/source maps. At combo failure time, preserve the original syntax cause and map its location to the contributing bundle. Label the waiting stock entry as the affected import, not the culprit. Present a combo-wide failure once with its producer and affected entries; do not repeatedly imply that every waiting entry is independently broken. Separate per-plugin loading could improve isolation, but is a design change requiring validation of dependency/order semantics.

The authoring template/checklist should include:

- Package/profile wiring with matching loader module ID, correct emitted client path, and a minimal external-plugin insert example.
- A working build preset producing the host `window.__ModuleLoader__.load` factory format, shared React/JSX runtime via host `require`, and explicitly exported `inject` and `apply`.
- No raw ESM declarations or uncompiled JSX in the shipped bundle; build-time classic-script parse checks and a loader contract smoke check.
- A complete, verified slot-injection example copied from the actual host API, with `register` nested inside the declaration-aware wrapper, only contribution metadata, and the required parent entry identified.
- Host-managed rendering and lifecycle cleanup rather than top-level DOM/portal side effects.
- The boot-time rebuild/restart/hard-refresh loop, targeted Windows process-tree shutdown recovery, and port-release verification.
- Acceptance checks for all existing plugins plus the new settings section; clear separation of syntax/load failures, apply-time slot errors, and process bind failures.

The read-only report is complete. The only substantive evidence limitation is the missing exact slot-injection API and descriptor schema; no executable patch or runtime verification can honestly be claimed from this static pack alone.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.