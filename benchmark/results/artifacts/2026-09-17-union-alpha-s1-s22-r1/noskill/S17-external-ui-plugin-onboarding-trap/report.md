# S17 — External UI plugin onboarding incident

## Scope and result

Read-only analysis completed. The complete task instruction and all eight fixture files were inspected. No fixture or benchmark-repository files were changed; no installation, migration, publishing, restart, process kill, or external-service access was performed. The code below is a proposed correction, not an applied plugin update.

Evidence root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S17-external-ui-plugin-onboarding-trap/environment/fixture

The three failures are distinct: (1) an invalid client artifact breaks the shared classic-script combo before registration, (2) after packaging is repaired, an unguarded cross-entry slot registration runs before its declaration, and (3) the boot-built combo requires a real host restart, which fails if the old Windows listener survives.

## 1. Failure 1: the external bundle, not typert-registry

The culprit is @lhh010/dsh-profiles, specifically fixture/plugin/lib/client.js. Its first line is a top-level ESM import of React; line 2 imports react-dom, and it also contains a top-level ESM export. These are valid module syntax but not valid classic-script syntax. The profile insertion itself is ordinary: fixture/profile/cordis.patch.yml adds dsh-profiles alongside dsh-brand-version and dsh-file-trace. Nothing here establishes a defect in the stock registry package.

The host boot evidence explicitly says it composes 53 loader entries into a 4.5 MB client bundle combo, served as a **classic script**. The restart evidence specifies that the host reads installed client bundles and concatenates them at boot. These are not 53 independent browser ESM imports with fault isolation. The working-plugin excerpt shows the intended input: each client artifact is a classic-script-compatible call to window.__ModuleLoader__.load with a module id and factory. Executing the combined script registers those factories for subsequent entry loading.

JavaScript parses a classic script before executing it. One illegal top-level import makes the shared script fail to compile, so none of its registration calls execute. That explains the empty Plugins list and disappearance of unrelated header plugins. The shared failure occurs before their individual apply functions could run.

The outer error says “failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)” because that is the entry whose load/import is being awaited when the shared combo failure surfaces. This is an attribution context, not proof that this entry supplied bad bytes. The nested diagnostic is more specific: “bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1).” It points directly at the external bundle's first import. Do not delete, rewrite, or reinstall typert-registry merely because its name appears first.

### Diagnosis procedure

1. Read the whole error chain, separating the awaited loader entry from the underlying bundle URL and position. Compare with the last inserted or edited external plugin.
2. Inspect the shipped client artifact, not only its source or package name. A cheap anchored scan for top-level import/export declarations and a check for the ModuleLoader registration shell flags this fixture immediately. Text scans can have false positives in comments and miss more complex syntax; they are triage, not a parser.
3. Compile each artifact with a classic-script parser without executing it. I performed this check on the fixture with Node vm.Script: it rejected the bundle with “SyntaxError: Cannot use import statement outside a module.” The fixture was only read, and no plugin code ran. A normal node --check against an ESM-classified .js file would not prove classic-script compatibility.
4. If the nested diagnostic is absent, bisect the newly added external plugin insert rows/client-bundle membership in a disposable copy of the profile. Remove or disable half the suspect additions, rebuild their artifacts if needed, restart the real host, and refresh. Keep the stock dependency baseline intact; bisect external additions rather than unrelated stock packages. Reintroduce the offending half until a single bundle remains. This is a proposed troubleshooting procedure only; the read-only fixture was not edited.

## 2. Required client packaging

An external plugin must ship the harness's ModuleLoader factory wrapper, not bare ESM and not merely an arbitrary IIFE. The outer wrapper is executable classic JavaScript. Its id must match the module identity resolved for the plugin. React and shared UI dependencies are obtained through the factory's loader-provided require function; that is not Node's require and should not be replaced with browser globals or a second bundled copy of React. A JSX build uses require('react/jsx-runtime'); a React.createElement implementation can use require('react'). Use only shared module ids actually supplied by the target harness.

A minimal illustrative shell, with the slot correction included, is:

```js
window.__ModuleLoader__.load({
  id: '@lhh010/dsh-profiles',
  factory: (require) => {
    const React = require('react');
    const module = { exports: {} };
    const exports = module.exports;

    function ProfilesSection() {
      // Production text should come from the plugin's locale resources.
      return React.createElement('div', { className: 'profiles-section' });
    }

    exports.inject = ['slots'];
    exports.apply = function apply(ctx) {
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          { name: 'settings.section', id: 'profiles-manager', order: 5 },
          ProfilesSection,
        ),
      );
    };
    return module.exports;
  },
});
```

The factory must actually return plugin exports containing apply and its required service dependencies, here inject = ['slots']. Merely declaring const inject and function apply without placing them on the returned exports would not expose them. The fixture's working excerpt is explicitly redacted; its shell is evidence for packaging, not a complete copy-paste implementation. Build with the target harness's compatible client bundling pipeline or an equivalent verified wrapper and validate the emitted artifact.

Remove the fixture's top-level document.body append and createPortal call. createPortal returns a React portal that must be included in a rendered React tree; calling it and discarding the result does not mount the section. Slot rendering should own this UI. A raw top-level DOM append would also survive plugin lifecycle changes unless explicitly cleaned up. This is a secondary defect, not the cause of the initial syntax failure.

## 3. Failure 2: slot declaration lifetime and registrant options

fixture/plugin-apply-error.txt records a later and narrower failure: the browser can load plugins again, other plugins render, but dsh-profiles fails during apply with “slot settings.section is not declared (a parent entry's children table must declare it).” This demonstrates that correcting the bundle only exposed the next defect.

A slot is declared at runtime by its owning parent entry's children table. The settings UI owner declares settings.section; a contributor does not create it merely by naming it in register. A TypeScript SlotMap declaration documents/types the slot but does not establish its live runtime declaration. Likewise inject: ['slots'] waits for the registry service, not for every particular slot to exist. Cross-entry application order can leave that service available before the settings parent has registered its children.

The exact necessary wrapping form is:

```js
ctx.slots.inject('settings.section', () =>
  ctx.slots.register(
    { name: 'settings.section', id: 'profiles-manager', order: 5 },
    ProfilesSection,
  ),
);
```

The callback returns the registration disposer. Do not use a block callback that drops that return value. Declaration injection runs immediately if the slot exists, otherwise waits until declaration commit. It disposes the contribution when the declaration collapses and can install it again on re-declaration. The controller belongs to the caller's Fiber, so unloading the contributor also cancels a pending wait and removes active effects. This is better than a timeout, polling, or relying on patch-row ordering. If the actual declaring settings plugin is missing or disabled, injection cannot invent it; the owner must be included in the composition.

For this contribution, name, id, and order are registrant options, and the component is the second register argument. The installed settings contract also permits localized navigation label information. Other optional entry features must follow the exact target API; do not invent arbitrary metadata. **Do not pass kind or scope at the top level of a registration into someone else's slot.** Those are declaration-owned properties. The fixture's kind: 'section' and scope: 'settings' must be removed, not preserved inside the new wrapper. In the installed reference contract settings.section is a list slot with root scope, not a kind named section. A registrant may declare its own child slots through its own children table; that does not authorize it to redeclare the parent's slot.

Local corroboration, separate from the static incident fixture:

- C:/Users/lhh/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/types/client/registry.d.ts, lines 68–100: registration disposal ownership and inject(key, callback) declaration-lifetime semantics.
- C:/Users/lhh/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js, lines 1761–1772: shipped settings registration uses exactly slots.inject('settings.section', () => slots.register(...)); its child declaration, not its top-level registrant options, contains kind and scope.
- C:/Users/lhh/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/types/client/contract/slots.d.ts, lines 57–70: section navigation fields and list/root declaration.

These installed APIs corroborate the remedy; they are not evidence that a modified plugin was run successfully in the fixture's historical environment.

## 4. Dev-loop and Windows restart discipline

fixture/host-boot-log.txt and fixture/restart-notes.txt establish the relevant behavior: the combo is assembled once at host boot. Editing source or even the emitted client.js afterward does not rebuild the already prepared combo in this incident. A hard refresh only fetches the same host-served artifact. Rebuilding a plugin without restarting this host is therefore insufficient, and restarting without rebuilding changed source can still serve the old client.js. Do not assume a watcher or HMR mode is active merely because one is supported elsewhere.

For this boot-assembled setup, use this sequence:

1. Build the external plugin's emitted client bundle; validate classic syntax, wrapper id/exports, shared dependencies, and slot registration before launching.
2. Gracefully stop the host that serves the existing GUI and wait for its process tree to terminate.
3. Verify that the old listening process is gone and the intended port is free. On Windows, closing the launching terminal is not proof that child node processes stopped. Identify the actual old host/listener PID; do not kill all Node processes indiscriminately.
4. If that identified tree survives graceful shutdown, terminate the full old tree with taskkill /PID <pid> /T /F, then verify process and listener removal. This is the fixture's recovery command, not a command executed during this analysis.
5. Start the intended supported dsh web profile once, on the same intended endpoint. Confirm successful combo assembly and binding, then hard-refresh the existing browser page.
6. Check the console, Settings → Plugins → Plugin list, the existing header contributions, and the new settings section. An empty list with a combo error is a pre-apply packaging failure; a single entry apply error after others render calls for slot/lifecycle diagnosis.

EADDRINUSE is the new host's bind failure because the surviving old node process still owns the listening port. It is not a React issue, and repeated starts or changing ports would mask rather than resolve the stale-process problem. /T kills descendants as well as the selected process; /F forces termination when graceful shutdown did not finish. The evidence establishes a surviving listener, not a need to invent another networking cause.

## 5. Prevention

### Host diagnostics and development tooling

- Validate every input bundle as a classic script before admitting it to the combo. Report package id, loader entry id, resolved filesystem path/public URL, line/column, and parser message for the failing input. Never execute untrusted factories just to perform syntax validation.
- Preserve a manifest mapping each input to byte/line ranges in the assembled output, ideally with source mapping/sourceURL diagnostics, so combo errors can identify original artifacts.
- Distinguish “shared client combo compilation failed” from “entry import failed” and “entry apply failed.” Include the awaited entry only as context, never as the sole culprit attribution.
- On combo failure, perform per-input syntax diagnosis and report all malformed bundles rather than blaming the first awaited entry. Check the combo itself as well: concatenation separators can introduce failures not present in individual files.
- Verify wrapper identity, duplicate ids, required exports, and resolution of declared shared dependencies with suitable build gates or isolated smoke tests. Static parsing alone does not prove a factory returns a usable plugin.
- Fail clearly rather than silently skipping malformed plugins. If introducing isolation/quarantine, define dependency and partial-UI behavior explicitly.
- Document the boot-only assembly policy. A future watcher would need to rebuild the combo, invalidate what is served, and notify/reload clients; watching source files alone is not enough. Improve graceful process-tree shutdown and print an actionable listener/PID diagnostic on bind failure.

### External author checklist

- A compatible package/client entry and profile link/insert row with matching module identity; retain stock profile dependencies.
- Generated window.__ModuleLoader__.load({ id, factory }) client artifact, no bare top-level ESM import/export, no raw JSX or TypeScript in the shipped classic script.
- Loader-provided shared React/JSX runtime rather than duplicate React; explicit returned apply/inject exports.
- Required services declared; slot owner included; every cross-entry registration gated by slots.inject with the registration disposer returned.
- Only supported registrant fields; kind/scope belong to owned child declarations, not contributions to another entry's slot. Use locale-owned navigation/UI text and inspect the target slot's props and options.
- Components rendered through the slot system; no unowned top-level DOM mutations. Test unloading, declaration removal/reappearance, and reinstalling without duplicate contributions.
- Syntax/build checks followed by a minimal profile/browser smoke: stock plugin list and header remain, section renders, and no combo or apply errors occur. Include a case where the contributor activates before its slot owner.
- A documented edit → build artifact → stop and verify old tree → start intended host → refresh → inspect loop, including the Windows orphan-listener recovery procedure.

## Validation and limitations

Executed validation: full instruction/fixture inspection; read-only lookup of installed slot declarations and a shipped settings registration; classic-script compilation of the offending fixture bundle, which failed with the expected import syntax error. No live browser boot or repaired artifact smoke test was performed, because this task requires read-only evidence analysis rather than running a migration or installation.

A broad installed-package grep timed out; a later grep had an escaped-regex error, and a guessed installed slot-types directory was absent. Narrowed reads of the renderer declarations and shipped settings plugin provided the needed exact API evidence. These lookup errors did not block the analysis. No claim is made that runtime fixes were applied or tested. The only deliverable written is this report.
