# S17 — External UI plugin onboarding incident

## Scope and baseline

Mode A: read-only incident inspection, not a host upgrade or an implemented plugin migration. The complete task brief and supplied plugin-upgrade skill were read first. All eight fixture files were inspected. No fixture files, dependencies, profile rows, processes, or host configuration were changed; no installation, migration, package script, external request, or plugin execution was performed. The only deliverable is this report.

Evidence root: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S17-external-ui-plugin-onboarding-trap/environment/fixture. File references below are relative to that root unless otherwise stated.

The affected package identity is @lhh010/dsh-profiles; its profile row id is dsh-profiles. Those are different identifiers. The brief describes a linked installation in the web profile's node_modules, not a registry reinstall. The fixture supplies no package.json, lockfile, link target, Git metadata, exact DSH/Node versions, or plugin release version. Therefore a source SHA, declared/resolved dependency cohort, compatibility range, from/to corridor, and available release recommendation cannot be established. Do not infer a registry scope from a GitHub owner, or a host version from the plugin version. No unfamiliar working-tree changes were altered. This is a static evidence pack rather than an executable target checkout.

**Pre-existing:** not collected (Mode A; no baseline build/typecheck/test suite run). The three supplied incident failures are evidence, not newly introduced failures.

## Completed — findings and validation

### 1. Failure 1: one invalid bundle prevents the whole combo from executing

The culprit is plugin/lib/client.js, not @deepseek-ai/dsh-typert-registry. Lines 1–2 contain top-level ESM imports from react and react-dom; line 23 also contains an ESM export. This is legal module syntax but is not the client artifact format consumed here.

host-boot-log.txt records 53 loader entries composed into one 4.5 MB **classic script**, once per boot. restart-notes.txt explains that the host reads the installed client artifacts and concatenates their contents. The resulting combo is served to the browser as classic script code, not as 53 independently imported ESM modules. The host does not convert arbitrary plugin ESM into its module-loader format merely because the file is named client.js.

A classic-script parser rejects a static import. Parsing precedes execution of that entire script: a syntax error anywhere prevents all wrapper registration calls in the combo from running, including wrappers belonging to valid stock plugins. That explains the empty plugin list and disappearance of both previously working header plugins. It is not a React rendering error, a missing package installation, or a failure in the stock registry's apply function.

browser-error.txt provides two attribution levels: the outer “failed to import loader entry 0c013085 (@deepseek-ai/dsh-typert-registry)” identifies the first awaited entry whose load promise fails; the nested “bundle /plugins/@lhh010/dsh-profiles/lib/client.js compile error (position 1:1)” identifies the invalid artifact. The first waiter inherits the shared combo failure; its name is not proof that it supplied the bad code. Here the nested path and first-line import directly agree.

**Read-only check actually performed:** compiled the supplied client text with Node's vm.Script constructor, without running the resulting script. It failed with “SyntaxError: Cannot use import statement outside a module”. This independently confirms the classic-script format mismatch without executing fixture code. No real browser or host reproduction was run.

### 2. Diagnosis and the required packaging format

Start with the entire error, especially a nested bundle path and position. Compare the last known-good composition with the three insert rows in profile/cordis.patch.yml. The new row is the strongest suspect, not the innocent first awaited stock entry. In a separately authorized disposable profile, remove only the new dsh-profiles insert row and cold-start to confirm restoration; if several external additions are plausible, bisect those insert rows in halves and restart for each trial. Preserve stock entries and unknown configuration. Never bisect by randomly removing core packages or changing dependency versions. Such profile edits and restart trials are a proposed validation procedure, not actions taken on this read-only fixture.

A cheap static screen of each declared client artifact looks for statement-level import/export syntax and absence of __ModuleLoader__.load. For example, a line-oriented search for ^\s*(import|export)\b immediately flags this artifact. Text search is a heuristic (multiline syntax, comments, strings and dynamic import need care); a parser configured for classic scripts is the stronger check. Ordinary node --check of a .js file under an ESM package can accept ESM and therefore does not by itself prove classic-script compatibility. Parse the exact emitted artifact, not just its TypeScript/ESM source.

working-plugin-excerpt.txt shows the correct format: a classic-script wrapper registers the package with window.__ModuleLoader__.load({ id, factory }). Inside the factory, host-provided dependencies are obtained through the supplied require function. React should be required from the host module table, e.g. require("react"); compiled JSX can use require("react/jsx-runtime") as the working sample does. This avoids shipping an unrelated React runtime. DSH UI imports also use the host loader's require, with only modules available in the target cohort.

The factory must return its plugin module exports, including apply and its service injection declaration. Simply defining local variables named apply/inject and returning an otherwise empty module.exports is insufficient; the comparison excerpt elides implementation and is not a complete template. A concrete illustrative packaging and registration shell is:

```js
window.__ModuleLoader__.load({
  id: "@lhh010/dsh-profiles",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");

    function ProfilesSection() {
      // Product copy should use the target host's locale facilities.
      return React.createElement("div", { className: "profiles-section" });
    }

    exports.inject = ["slots"];
    exports.apply = function apply(ctx) {
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          { name: "settings.section", id: "profiles-manager", order: 5 },
          ProfilesSection,
        ),
      );
    };
    return module.exports;
  },
});
```

This is report-only guidance, not a built or mounted replacement. A supported build pipeline may accept ESM/TypeScript as source, but its shipped browser artifact must emit the wrapper and contain no surviving static ESM statements. A plain CommonJS file is also insufficient without the loader registration shell. Do not “fix” this by changing the whole host combo to type=module: that does not supply the required package registration protocol.

Align the wrapper id with the actual package.json name and the patch row's name, here @lhh010/dsh-profiles, not the short row id dsh-profiles. Verify the declared dsh.client artifact exists and its required runtime modules are present. The fixture has no manifest, so those checks remain pending rather than assumed broken.

### 3. Failure 2: declaration ownership and activation order

plugin-apply-error.txt is a later and separate failure: repackaging restores loading for all other plugins, but this plugin fails during apply. Compilation/registration and application must not be conflated.

Slots are declared by the owning parent entry's children table. For settings.section, the settings parent supplies that declaration and its structural metadata. A contributor registers a component into that declared slot; it does not declare the slot by adding kind and scope to a registration. Having the slots service injected only makes the service available. It does not guarantee that another entry has already applied and declared its children. Cross-entry apply order is not a safe dependency mechanism.

The exact required ordering wrapper is:

```js
ctx.slots.inject("settings.section", () =>
  ctx.slots.register(
    { name: "settings.section", id: "profiles-manager", order: 5 },
    ProfilesSection,
  ),
);
```

inject waits for the named slot's declaration and ties the contribution to its lifecycle; the callback returns the registration disposer. Keep that return when converting to a block-bodied callback. Contributions must be removed on disposal/update, not leak across activations. If the owning settings entry is absent altogether, the wrapper cannot invent it: inspect owner enablement and pending activation.

Registrant metadata is name, id, order, and optionally label where the target slot accepts it. Do **not** pass kind or scope: they belong to the declaration owner. In plugin/lib/client.js:25, both kind: 'section' and scope: 'settings' must be removed in a future repair. Do not duplicate the settings parent's children table or rely on patch-row order to race ahead of it.

An additional authoring defect is visible at lines 18–21: the artifact appends a DOM node at module evaluation time and discards the return value of createPortal. createPortal produces a React node for an existing rendered tree; calling it alone does not mount a component. The settings slot should own rendering, with no top-level body append or manual portal needed here. This is a separate lifecycle/rendering problem, not the reason for either reported error.

### 4. Dev loop and the Windows port collision

The fixture explicitly records one combo assembly per host boot. The host retains that assembled artifact; changing linked files on disk does not rebuild the running host's combo. A browser hard refresh re-fetches what that host is serving and cannot make the host reread inputs. A filesystem link changes file identity/access, not the existence of a watcher. No active source rebuild/HMR pipeline is demonstrated in this incident, so do not promise hot updates.

For an authorized development run: (1) finish emitting the plugin artifact; (2) stop the actual existing DSH host and its child processes, not merely the browser or launcher terminal; (3) verify its listening PID is gone and the intended port is free; (4) start one host with the same web profile and intended installation; (5) check successful bind and the new combo assembly; (6) hard-refresh the browser and check Settings → Plugins → Plugin list plus actual settings component rendering and console/apply errors. Do not start a second server or change ports to conceal the old process.

Closing the Windows launching terminal left a node process alive according to restart-notes.txt. That orphan retained the listening socket. The replacement process therefore received EADDRINUSE; this was not a bundle compile failure or evidence of a new host successfully serving updated code. Prefer graceful process-tree termination first. If it remains, identify the PID owning the intended port and verify it belongs to this host, then use the observed fallback taskkill /PID <pid> /T /F. /T covers descendants; /F forces termination. Recheck the port before relaunching. Do not kill every Node process or force-kill an unrelated listener. No processes were terminated during this inspection.

## Prevention and recommendations

### Host-side improvements (proposals, not changes made)

- At startup, validate each resolved client artifact separately as a classic script before combining. Report package name, loader row id, physical/served artifact path, and line/column of the actual parse error. Include a concise “emit __ModuleLoader__.load; bare ESM is unsupported” hint.
- Preserve combo segment offsets or source maps so browser combo positions map back to package-local paths and lines. Also validate the final combo to catch concatenation boundary problems; per-file parsing alone does not test the joining operation.
- When a shared combo promise rejects, label the failure as combo-level and report the underlying error once. Describe the first awaited entry as affected, not causal. Surface diagnostics even when zero plugin registrations succeeded.
- Check expected package registrations against completed registrations and distinguish syntax failure, missing wrapper, wrong registration id, missing required module, and apply failure. A successful HTTP response alone proves none of these.
- Refuse an invalid combo with a clear diagnostic rather than silently claiming full activation. Optional per-artifact isolation or an explicit development watcher could reduce blast radius, but would require its own dependency/lifecycle design and tests; it is not present in this evidence.
- Log startup artifact identity/revision and restart-required semantics. Improve launcher process-tree cleanup and EADDRINUSE diagnostics with the existing listener PID where safe.

### External-author template/checklist

1. Distinguish package name, profile row id, client artifact path, installation link target, and plugin release versus DSH cohort versions. Check resolver metadata and activation, not just installation success.
2. Supply the supported wrapper build configuration, external host React/JSX dependencies, assigned/returned apply and inject exports, and a gate parsing the shipped output as classic script. Verify registration id equality.
3. Show a settings contribution using slots service injection plus slots.inject around slots.register, returning cleanup and passing only registrant metadata. Explain parent-owned children declarations.
4. Avoid module-evaluation DOM mutations, duplicate React runtimes, discarded portals, and unmanaged effects. Include locale-owned text and teardown tests.
5. Document explicit artifact rebuild → full host stop → port check → same-profile boot → browser refresh. On Windows include scoped process-tree handling, not “close the terminal”.
6. In an isolated real web profile, read the boot manifest and request its advertised revision-bearing artifact after normal authentication, without logging tokens. Prove expected wrapper registration, no pending entries, actual settings render, and no page errors. Test both slot arrival orders and plugin stop/reapply cleanup; test malformed-artifact diagnostics and the exit/stdout/stderr/cancellation/teardown path. HTTP 200 and a nonempty plugin list alone are insufficient.

## Skipped

- No Mode B/C installation, dependency update, source migration, version bump, patch bisection, global host upgrade, or real restart: excluded by the task's read-only scope.
- No unrelated migration corridor was applied. The precise incident host version is absent. The relevant references are troubleshooting.md (combo failure and undeclared-slot rows) and v0.1.2-alpha.1.md, DSH-0.1.2-A1-26 (registration identity); the adjacent A1-25 concerns removed runtime dependencies, for which this fixture supplies no positive evidence.
- No live Cordis extension was defined: this task diagnoses a persistent external artifact; changing the current benchmark harness would neither reproduce nor repair the evidence pack.

Reference root: E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/references.

## Pending / residual risk

The fixture and syntax-only check substantiate both root causes and the recorded restart behavior. No built corrected artifact, exact-tag implementation, package manifest, resolved dependency graph, actual junction target, authenticated boot manifest, browser trace, or live slot activation test is supplied. Consequently packaging/mount success and cross-version compatibility remain unverified. The comparison bundle is expressly redacted; the report's explicit exports are necessary guidance, not a claim that hidden text was inspected. No baseline suite, runtime verifier, teardown test, or Windows reproduction was executed. No lifecycle scripts ran, so this investigation introduced no script side effects.

## Rollback

There is no applied migration to roll back. Fixture/profile/artifact ownership was preserved; no automatic reset, clean, stash, checkout, or copy through the link occurred. A future authorized repair should first record the real source HEAD, plugin version, lockfile and exact profile/artifact hashes, and verify the installation link target. Recovery should restore only that repair's owned source/build artifacts and the specific dsh-profiles patch row if changed, then cold-start and validate. This report does not promise rollback of arbitrary installer effects. The report file itself is the sole created output.
