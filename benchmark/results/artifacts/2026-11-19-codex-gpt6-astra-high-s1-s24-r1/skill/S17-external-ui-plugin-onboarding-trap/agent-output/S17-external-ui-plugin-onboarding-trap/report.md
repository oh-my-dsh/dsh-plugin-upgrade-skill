# S17: external UI plugin onboarding diagnosis

Completed a Mode A, read-only diagnosis using `skills/plugin-upgrade/SKILL.md`, `references/troubleshooting.md`, DSH-0.1.2-A1-25/A1-26, and DSH-0.1.7-A2-04. BENCHMARK-AUTH-v1 authorizes this report. Plan executed: inspect the supplied evidence, trace each failure to its layer, provide a corrected authoring contract and prevention procedures, write only this report. No fixture edits, installation, migration, runtime execution, process termination, or network access were performed.

## 1. A syntax error poisoned the complete client combo

The culprit is `@lhh010/dsh-profiles`, specifically `fixture/plugin/lib/client.js:1`: `import React from 'react'`. Line 2 has another static import, and line 23 has an ESM export. This is valid module syntax but invalid in the classic-script context that this host serves.

`host-boot-log.txt` records three resolved patch inserts and 53 loader entries composed into a 4.5 MB classic script. `restart-notes.txt` explicitly says the host reads the installed client bundles at boot, concatenates them into one script, caches it, and serves that result. The browser receives a classic `<script>` resource, not a separate ESM module for each plugin. It must parse the entire combined resource before executing any of it. A single illegal static `import` therefore prevents every `window.__ModuleLoader__.load(...)` call in the combo from executing, including innocent calls earlier in the file. Zero registrations explains both the empty plugin list and disappearing previously working header plugins. This is a compile failure, before factory execution or plugin apply.

The outer error names loader entry `0c013085 (@deepseek-ai/dsh-typert-registry)` because that is the first awaited loader entry whose import failed when the shared resource failed. It is the point of observation, not proof that this package supplied bad bytes. The nested error is already more specific: `/plugins/@lhh010/dsh-profiles/lib/client.js`, compile position 1:1. That path and position match the supplied file. Do not modify or reinstall the stock registry to fix this incident.

## 2. Diagnosis and the required bundle contract

Start with the earliest browser compile error and its nested resource path; distinguish whole-combo compilation from one factory failing and from one plugin failing during apply. Compare the added bundle with `working-plugin-excerpt.txt`. The local read-only scan performed here was:

```text
rg -n '^\s*(import\s|export\s)|slots\.register|kind:|scope:' fixture/plugin/lib/client.js
```

It flags imports at 1–2, export at 23, bare registration at 24, and declaration-only options at 25. A top-level import/export scan is a cheap diagnostic, not a complete JavaScript parser: comments, multiline syntax and minification can defeat a regex. A startup/build validation should parse each emitted artifact with JavaScript source type `script`, without executing it, then parse the assembled combo too. A module-mode syntax check can pass the broken bundle and is insufficient.

If the nested path is absent or ambiguous, bisect the profile patch layer's external-plugin `insert` rows, preserving stock composition and required dependencies. Begin with the new `dsh-profiles` row; compare a known-working composition containing brand-version and file-trace against one with profiles restored. For a larger set, disable half the external inserts, cold restart and refresh, and narrow until adding one row recreates whole-combo failure. Every comparison must use a newly built host combo. This is a proposed scratch-profile procedure, not an experiment run against this read-only fixture.

Ship loader-registered code with a factory-local CommonJS-style export object, not raw ESM. Source files may use ESM if the build transforms them. The following illustrates the emitted artifact contract and the slot correction together:

```javascript
window.__ModuleLoader__.load({
  id: '@lhh010/dsh-profiles',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');

    function ProfilesSection() {
      return React.createElement('section', null,
        React.createElement('h3', null, 'DSH Profiles'),
        React.createElement('div', null, 'Web'),
        React.createElement('div', null, 'CLI'));
    }

    const inject = ['slots'];
    function apply(ctx) {
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          { name: 'settings.section', id: 'profiles-manager', order: 5 },
          ProfilesSection,
        ),
      );
    }
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
```

The factory's `require` is the host module loader's dependency interface; obtain the shared React instance through `require('react')`, and use `require('react/jsx-runtime')` if compiled JSX needs it. Other externalized host dependencies likewise use this interface. Do not bundle a second React instance or leave browser-unresolvable static imports. The returned object must actually expose `apply` and the service dependency `inject: ['slots']`; merely declaring local variables with those names does not export them. The working excerpt elides details and should not be copied as an empty-export implementation.

Match the loader registration id and composition row `name` to package identity `@lhh010/dsh-profiles` (A1-26). The short composition row `id: dsh-profiles` is a separate coordinate; it need not equal the package name. Ensure package metadata points to the built client artifact and declares the imports/dependencies required by the target host contract. The fixture has no package manifest to audit those fields.

Also remove the top-level DOM root creation and discarded `createPortal(...)` call from this settings-slot implementation. Creating a portal value without rendering it is not mounting the section; slot registration should let the host render the component and own its lifecycle.

## 3. Repackaging exposed a separate slot error

`plugin-apply-error.txt` shows other plugins now load normally, while profiles fails at apply with `slot "settings.section" is not declared (a parent entry's children table must declare it)`. This is downstream of successful combo compilation; it is not another registry error.

The parent/owner entry declares its child slots in its `children` table, defining their kind and scope. A consumer contributing to that slot is not its declarer. Bare `ctx.slots.register(...)` runs immediately during apply, and independent entry apply order does not guarantee that the parent has declared its child yet. Injecting the slots service alone establishes service availability, not availability of this particular named slot.

The exact cross-entry form is `ctx.slots.inject('settings.section', () => ctx.slots.register(...))`, as in the complete example above. It gates registration on the declaration and uses the slot lifecycle rather than assuming patch-row order. Registrants pass `name`, `id`, `order`, and optionally `label` where supported; the component is the second argument. They must not pass `kind` or `scope`: those belong to the declaring owner. Remove both fields from line 25. If the owner is absent altogether, injection cannot manufacture it: verify the profile includes the settings parent and the slot name exists on the target host.

## 4. Correct development and Windows restart loop

The evidence demonstrates a boot-time snapshot, not a file watcher. Editing the linked directory changes on-disk bytes but does not invalidate the host's cached combo. Hard refresh alone fetches the same cached bytes. This agrees with A2-04, but the fixture does not identify an exact host version, so no version is inferred from that card.

For each build/edit: finish producing the linked plugin's client artifact; fully stop the current DSH host; confirm its processes exited and its listening port is free; start one host for the intended web profile; confirm a new combo assembly log; hard-refresh the browser; verify the served combo includes the new marker or content and the plugin list, stock entries, and new settings section render. Auto-reconnect alone can retain old page code, so responsiveness is not proof of updated bytes. Link installation does not require copying the artifact into another physical install tree.

Closing the launching terminal left an old Node child alive in this incident. It still owned the listening port, so the replacement host failed to bind with EADDRINUSE. Identify the owning PID and its DSH process tree first (for example through listener/process inspection); attempt orderly shutdown, then, for a verified stuck DSH tree, use `taskkill /PID <verified-host-pid> /T /F`. `/T` terminates descendants, and `/F` forces termination. Confirm port release before relaunching. Do not kill all Node processes or change ports to hide the surviving host. These are instructions only; no processes were touched here.

## 5. Prevention

Host startup should validate each bundle as a classic script before concatenating and report package name, resolved artifact path, and syntax location. Preserve a bundle-to-combo byte/line offset map and content hashes so a combo syntax error can be translated back to the originating file. Validate the final concatenated resource too, including separators between artifacts. Reject a bad artifact with an actionable startup diagnostic; optional quarantine should be explicit and respect dependent plugins rather than silently serving an incomplete graph. Registration-id/export checks can catch a syntactically valid artifact that never registers the expected module.

At combo failure time, surface the script parse failure separately from an awaited entry import failure: explicitly state that the awaited registry entry may be innocent, attach underlying script error/location, and use the offset map or a diagnostic per-bundle parse to name the culprit. A try/catch inside a combined classic script cannot recover from its own parse failure. Independent script resources can reduce parse-failure scope, but that is a host design change requiring dependency/error handling, not this plugin's fix. Log combo revision, composition roster and boot identity to make stale-byte diagnoses easy.

An external-plugin template/checklist should include:

- A build configuration emitting the loader/factory shell, correctly returned `apply`/`inject` exports, shared React/runtime requires, and a matching package id and client-artifact metadata.
- A classic-script parse check on actual distribution output, no residual static ESM, no duplicate React, and registration/export validation against the package name.
- A settings component registered via `slots.inject`; explain ownership through the parent's children table, consumer-only registration options, and cleanup through framework lifecycle.
- Link-install instructions with one unique profile insert row and verification of the resolved physical target; no unnecessary copying through a junction.
- A cold-boot smoke procedure proving expected loader registration, apply, visible settings content, retained stock plugins, and no pending dependencies; HTTP 200 alone is insufficient.
- The build → complete host stop → verified port release → restart → hard refresh → served-byte verification loop, including targeted Windows process-tree recovery.

## Scope, validation and residuals

**Pre-existing:** Mode C baseline not collected; this is a static incident analysis, not a migration. The supplied three failures are the incident evidence.

**Completed:** All eight fixture files inspected; read-only static scan confirmed the ESM and registration defects. Source identity is the hand-authored linked plugin `@lhh010/dsh-profiles`; installation identity is a web-profile node_modules link plus its insert row. The other two rows are identified in the evidence. No unrelated repository state was inspected.

**Skipped:** Builds, package scripts, installs, live bisection, browser mounting and host restarts are outside the read-only task. No host upgrades or migration corridor are prescribed.

**Pending/residual risk:** Exact host/Node/plugin versions, source SHA, link target, manifest and resolved dependency cohort are not supplied. The proposed code illustrates the evidenced contract; it was not compiled or mounted. No claim of successful runtime repair is made. These omissions do not block the evidence-backed diagnosis.

**Rollback:** The fixture was never changed, so no rollback is required. The only created artifact is this report. For a future authorized implementation, preserve the original client build and the individual owned patch row; recover those paths only, then cold restart to replace cached bytes.
