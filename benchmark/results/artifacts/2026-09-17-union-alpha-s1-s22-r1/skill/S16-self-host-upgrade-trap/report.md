# S16 — Self-host upgrade trap: read-only incident report

## Scope and evidence

This is a read-only inspection, not a plugin upgrade or source migration. A global DSH-core upgrade is outside plugin-upgrade Modes B/C, and replacing the host from inside its own Session must not be executed. The benchmark authorization permits analysis and this report, not installations or migrations.

All four supplied fixture files were read in full. Evidence paths below are relative to E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S16-self-host-upgrade-trap/environment/fixture/:

- README.md: static, read-only evidence-pack scope.
- agent-session-log.txt: in-session command, interrupted result, and subsequent shell observations.
- env-state.txt: healthy alpha.5 baseline and broken installation state.
- repair-notes.md: external repair performed and verification left outstanding.

Methodology: E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/SKILL.md, especially “Global DSH host upgrades (agent discipline)”; references/rollup-0.1.2.md, R-12; and references/v0.1.2-rc.1.md. The reference paths are relative to that skill directory. No external sources were accessed. Findings are evidence-pack observations, not fresh measurements of the affected machine.

## Pre-existing baseline

Mechanical build/typecheck/test failures: **not collected**; this is not Mode C and contains no plugin source to migrate.

The recorded healthy host was @deepseek-ai/dsh **0.1.2-alpha.5**, globally installed through npm. Its Web host was running at http://127.0.0.1:3080; the requesting agent Session executed inside that host. All three launchers — dsh, dsh.cmd, and dsh.ps1 — were present. The global tree also contained dsh-old-* backups (env-state.txt:1–6).

Installation identity and source identity are distinct. The runtime installation was the npm-global package; a separate source-reference checkout was later aligned from the alpha.5 tag to dsh-v0.1.2-rc.1. Updating that checkout did not repair npm launchers. The fixture supplies no checkout branch, exact machine SHA, lockfile, dependency inventory, Node version, or configuration hashes; none is invented. The old backup named dsh-old-0.1.1-rc.1 is not evidence that the running host baseline was rc.1.

## Completed — diagnosis

### 1. Structural root cause and termination sequence

The target was not an independent application controlled by an external agent. The Session was part of the running DSH host, and the tool call ran inside that host's own worker process. That runtime executed from the global @deepseek-ai/dsh package tree that npm was removing and replacing (agent-session-log.txt:1–7).

The log records cleaning at 16:41:02, removal at 16:41:05, fetching rc.1 at 16:41:09, and entry into linkStuff at 16:41:31. The host then died before the install completed; its Web connection was lost. The host/Session infrastructure needed to supervise the tool and persist its result was gone, so the agent could not receive a completed result or execute its own recovery steps. The recorded call has an explicit “no result recorded” entry, not a success or a known npm exit code (agent-session-log.txt:9–18).

The operational order is package replacement → loss of the running host and its Session/tool supervision → lost GUI connection and no durable tool result. The fixture does not establish the precise low-level exception or relative process-exit timestamps for npm and its worker. It does establish that the controlling host died while the operation was incomplete. A browser connection failure is a symptom, not the originating failure.

This is a structural self-dependency failure, not flaky networking, a plugin API regression, a timeout requiring a longer budget, or an npm command to retry from the same Session. The operation destroys the environment required to complete and report that operation. Correctly pinning the version does not remove this relationship. Windows native-module locks can also cause EBUSY while hosts remain alive; no EBUSY was recorded here, so it is a prevention concern, not an asserted observed exception.

### 2. Why the CLI disappeared despite package files remaining

The after-state was not a healthy rc.1 installation. It had rc.1 package content, partly placed by hand during a subsequent manual repair, but dsh and dsh.cmd were missing and dsh.ps1 was stale. Both dsh --version and dsh web failed with command-not-found (env-state.txt:8–17; agent-session-log.txt:20–34).

Package payload and command launchers are separate installation outputs. Files under node_modules/@deepseek-ai/dsh do not by themselves restore the npm-global launchers used for command resolution. The missing/stale launchers, incomplete replacement, and absent completion result together identify an interrupted, non-standard installation. A linkStuff log entry proves npm reached that stage, not that linking completed successfully.

Hand-swapping the package directory again would not complete npm's bin-link generation or establish a coherent dependency tree. It could mix versions, preserve stale targets, and further obscure package-manager ownership. Hand-writing shims would only patch a visible symptom without proving the payload and dependencies were installed coherently. Neither directory backups nor copied rc.1 files constitute a valid reinstall. Do not hand-copy directories or construct launchers manually.

### 3. The repair actually performed

A different agent CLI, running **outside DSH**, re-ran the formal registry installation:

    npm install -g @deepseek-ai/dsh@0.1.2-rc.1

That is a reinstall of the exact requested version, not a downgrade, a source build, a directory swap, or a shim-only patch. The original host was already dead. The independent repair process did not depend on the DSH files being replaced and could survive to complete npm's installation/linking work.

The repair notes explicitly verify that dsh, dsh.cmd, and dsh.ps1 were all regenerated and that dsh --version returned 0.1.2-rc.1 (repair-notes.md:8–11). Those observations establish CLI repair. The separate source checkout alignment to dsh-v0.1.2-rc.1 had no local-modification conflicts, but was reference alignment rather than the mechanism that restored the CLI (lines 12–13).

**Not yet established:** successful Web restart, browser state, and plugin behavior on this machine. The repair notes leave those to the user; this report does not claim they passed.

## Required external upgrade protocol

The original agent should have recognized its own execution path under the npm-global DSH tree before dispatching a mutating tool. It should have declined to execute this global install itself and handed off the following ordered procedure. User confirmation or unattended authority cannot make that Session independent of the host.

1. **Before stopping anything**, preserve the current exact version, installation path, source-reference identity, profile/configuration baseline, and an independent terminal/recovery entry point. Finish the handoff while the Session is still available.
2. **From an external terminal, fully stop every DSH process before npm runs**, including additional hosts, workers, and any service/supervisor that would automatically restart them. Verify the relevant DSH processes and listeners are gone. Closing or refreshing the browser does not stop the host; leaving another host alive can retain native-module file locks.
3. **From that external terminal only**, run the exact pinned formal install and wait for its actual exit status:

       npm install -g @deepseek-ai/dsh@0.1.2-rc.1

   Do not substitute a bare package name, latest, or an unpinned tag. Dist-tags move: the local rc.1 reference records latest as 0.1.1-rc.2 on the incident date, September 3, and moved to rc.1 on September 4. An unpinned command could therefore silently choose an older line rather than the requested release. These are historical reference measurements, not a current registry query.
4. Verify successful npm completion, all three launcher files and their targets, command resolution to the intended global installation, and dsh --version = 0.1.2-rc.1. If installation fails, retain diagnostics and repair from the external shell with the pinned formal installer; do not return to self-installation or directory patching.
5. Start the intended Web profile with **dsh --profile web**, as specified in the repair notes. Confirm the intended host/port, then hard-refresh the browser. Verify host and browser version markers and the plugin checks below.

**Existing rules versus incident-specific lesson:** R-12 already requires checking whether a target underpins the current Harness, protecting the host, and providing independent recovery. Exact-version installation and post-upgrade verification are established upgrade disciplines. Full shutdown before installation also avoids native locks. This incident supplies the concrete stronger rule: an agent inside that host must never execute its npm-global replacement, even with approval; it must hand off externally. It also supplies the observed failure signature and recovery: host dies mid-call, no durable result, package content remains without usable shims, and an external pinned formal reinstall regenerates them. A crash during a properly ordered stopped-host install is not an expected risk to accept.

## Recommendations — guard and post-upgrade checklist

### Agent-side guard

Before any package/runtime mutation, compare the resolved mutation target with the current host's installation root and required runtime dependencies. Resolve aliases/junctions where applicable; do not rely solely on working directory or a literal command-string match. Recognize npm-global install/update/uninstall operations as well as equivalent package-manager operations and manual replacement of the active tree.

If the operation would replace, remove, or invalidate the running host, reject dispatch with an explicit self-host-upgrade diagnostic and provide the external pinned procedure. If independence cannot be established, fail closed and hand off. Do not treat confirmation, a longer timeout, a background job, a detached child, an alternative in-session shell, or another retry as an independent maintenance environment. Safe read-only version/source inspection can remain available. The guard is recommended, not implemented here.

### Post-upgrade checks for this machine

- Check the global package is a standard rc.1 npm install, all three shims resolve correctly, and no PATH entry selects a stale backup or another installation.
- Verify the restarted host is newly running from rc.1; check CLI, host, browser/build markers, and the separate source-reference checkout agree on the intended version. A hard refresh alone is not a host restart.
- Start dsh --profile web on the intended endpoint, hard-refresh, and confirm actual Web Client registration/mount, not merely an HTTP 200 or a visible shell.
- Confirm whale, progress, and the other configured plugins are enabled and visibly functional; verify required/provided Cordis services and entries do not remain pending. Check browser and host errors, including missing-module failures or repeated service-unavailable errors.
- Exercise one core plugin action and a message → tool → response flow, confirming the tool result is recorded and the GUI remains connected. These are proposed real-machine tests, not tests executed by this analysis.
- Preserve existing profiles and plugin versions unless an observed issue requires a separate investigation. The exact alpha.5→rc.1 diff in repair-notes.md:15–17 is **252 package.json version bumps and zero API/feature changes**. The reviewed rc.1 reference likewise has zero cards for this edge. Plugins already compatible with the healthy alpha.5 baseline do not need re-migration merely for rc.1. This does not certify arbitrary earlier alpha plugins that never completed intervening migrations, or prove this machine's runtime checks passed.
- Once rc.1 is confirmed, optionally remove the identified dsh-old-* backups through a separate deliberate cleanup. They are not the repair mechanism and should not be deleted prematurely.

## Skipped

No installation, migration, package scripts, builds, tests, Git switch, cleanup, runtime restart, or external-service request was executed. No fixture or benchmark-repository files were modified. No dynamic Cordis plugin was necessary. Seven-touchpoint source migration and older corridor rewrites are inapplicable to this installation incident and version-only edge. Later-version client-bundle issues are not evidence of this machine's cause and are not attributed to alpha.5→rc.1.

## Pending / residual risk

The actual machine is represented only by static evidence. Runtime/plugin verification remains outstanding, as the repair notes state. Exact npm/Node versions, process-exit internals, configuration hashes, and a full dependency inventory are unavailable. The incomplete tool result cannot be assigned an invented exit code. Arbitrary effects of interrupted installation or manual directory changes are not proven reversible by the source checkout alignment.

## Rollback

The recorded healthy runtime baseline is 0.1.2-alpha.5, not the old rc.1 backup directory. If rc.1 subsequently fails validation, an external operator can stop all DSH hosts and use a formal exact-pinned installation of @deepseek-ai/dsh@0.1.2-alpha.5 as the host recovery candidate, then revalidate. Preserve profiles and user data; do not claim data/schema downgrade safety without separate evidence. A rollback must not swap in dsh-old-* directories, auto-reset source changes, or promise to undo unknown lifecycle-script effects. This analysis changed only the designated report, so it performed no host mutation requiring rollback.
