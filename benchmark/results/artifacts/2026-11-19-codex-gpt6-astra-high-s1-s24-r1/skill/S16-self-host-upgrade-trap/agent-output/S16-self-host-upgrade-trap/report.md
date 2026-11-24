# S16: Self-host upgrade incident diagnosis

This was a self-upgrade dependency failure followed by an incomplete npm installation. The correct recovery is an external, exact-version npm reinstall with all dsh hosts stopped. This report is read-only analysis; no install, migration, process stop, source checkout, or fixture edit was performed.

## Evidence and scope

Read `skills/plugin-upgrade/SKILL.md`, the relevant R-12 section of `references/rollup-0.1.2.md`, and `references/v0.1.2-rc.1.md`. The incident evidence is the supplied fixture's `README.md`, `agent-session-log.txt`, `env-state.txt`, and `repair-notes.md`. The supplied session excerpt was explicitly requested incident evidence, not a search of private session history. No network or external verification was used.

This is Mode A-style incident inspection, not a Mode B plugin update or Mode C source migration. BENCHMARK-AUTH-v1 authorizes this report without another confirmation; it does not authorize executing an installation.

## 1. Structural root cause

The active agent session lived inside the running dsh host, whose executable code came from the global `node_modules/@deepseek-ai/dsh` installation. Its PowerShell tool worker was owned by that host. It was therefore not an independent installer capable of surviving destruction of its own control plane.

The tool launched `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` against that same package tree. The excerpt records cleanup at 16:41:02, removal at 16:41:05, fetch at 16:41:09, and `linkStuff` at 16:41:31. Then the host/session died and the browser lost its connection. The host and its result-recording path disappeared before installation could complete and regenerate a usable command surface. The GUI loss is a consequence of host death, not an ordinary browser-refresh problem. The worker could no longer deliver a result to a live session, so the tool-call record has no durable result or exit status.

The excerpt does not establish an exact OS-level termination mechanism or exit code for each child process. It does establish that the host died during its own replacement and that installation was incomplete. Treating the missing result as success, extending the 600000 ms timeout, or retrying from another session on the same host cannot solve the dependency cycle. This operation is structurally unsafe by construction, not flaky networking or an rc.1 plugin API regression. On Windows, native modules held by a running host can additionally cause EBUSY; the preventive requirement is to stop the host before npm begins, not to tolerate a crash during npm.

## 2. Why the command disappeared

Before the attempt, alpha.5 was healthy and `dsh`, `dsh.cmd`, and `dsh.ps1` existed. Afterwards the package directory contained rc.1 files, including files manually placed there during a partial repair, but `dsh` and `dsh.cmd` were missing and `dsh.ps1` was stale and pointed into the old tree. Both `dsh --version` and `dsh web` failed with command-not-found.

Package content is not equivalent to an npm installation: Windows command entry points must be generated and linked to the installed package correctly. The content-plus-missing-shims signature is consistent with interruption during replacement/linking. A logged `linkStuff` line does not prove linking finished. This is not evidence that the whole package was absent or that changing PATH alone would restore it.

Hand-swapping the rc.1 tree or a `dsh-old-*` directory cannot reliably regenerate npm's command entry points, dependency layout, or installation metadata. It can mix versions, preserve stale targets, and obscure the original interrupted-install state. Hand-writing shims merely masks those inconsistencies. Leave the backup trees alone during repair and let npm restore the formal installation.

## 3. Repair actually recorded

The repair notes say a different agent CLI, outside dsh, reran the formal registry install:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-rc.1
```

That regenerated all three entry points (`dsh`, `dsh.cmd`, `dsh.ps1`), and `dsh --version` returned `0.1.2-rc.1`. The external tool did not depend on the dsh tree being replaced, so it could remain alive through installation and inspect the result. The original host was already dead; the general repair procedure must still verify that every other dsh host is stopped before reinstalling.

Separately, the repair aligned the source-reference checkout from alpha.5 to `dsh-v0.1.2-rc.1`, with no local-modification conflicts. That source checkout is a different identity from the npm-global installation; changing its tag did not repair the CLI shims.

The notes prove CLI recovery, not full runtime acceptance. Starting the web profile, hard-refreshing the browser, and verifying whale/progress and other plugins were explicitly left for the user.

## 4. Procedure the original agent should have handed off

Before dispatching a mutation, the agent should identify the global installation being targeted and compare it with the package tree underpinning its own host and worker. Here they are the same. It must not execute the global install inside this session, even if the user requests an upgrade and confirms it. It should give the user the following ordered external procedure and retain an independent recovery entry point:

1. Open an external PowerShell terminal independent of dsh. Record the existing version (`0.1.2-alpha.5`), global prefix/package location, and profile/configuration baseline; preserve existing user configuration. Save any work before shutting down the host. In the already-broken case, use the recorded baseline rather than requiring the dead CLI to run.
2. Fully stop every dsh process, including other profiles and any supervised instance; prevent automatic relaunch while replacing the package. Verify the relevant host processes are gone and native-module locks are released. Do not kill unrelated Node applications. Closing or refreshing the browser is not a host stop. This step MUST finish before npm runs.
3. In that external terminal, execute exactly `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. Let it complete and check its exit status. Do not substitute a bare package name or a moving dist-tag. The reference's historical 2026-09-03 measurement had umbrella `latest` at `0.1.1-rc.2`, so an unpinned install could silently downgrade this alpha.5 host. Its September 4 update moved `latest` to rc.1; that temporal change further supports exact pinning and is not a claim about today's registry.
4. Verify the regenerated `dsh`, `dsh.cmd`, and `dsh.ps1` entry points in the actual npm global prefix, check `Get-Command dsh -All` for stale precedence, and run `dsh --version`; require `0.1.2-rc.1` before restarting.
5. Start `dsh web` from the external terminal (the repair notes phrase this machine's web-profile launch as `dsh --profile web`). Hard-refresh the browser after the new host is up. Verify host/client version markers and plugin behavior as below.

If step 3 fails, keep the external terminal available, preserve the actual error, and diagnose there. Do not resume installation from the damaged host or patch directories by hand. A successful formal reinstall of the pinned target is the documented recovery path.

Existing upgrade rules already supplied explicit version selection, clean host shutdown to avoid locked native modules, restart/hard refresh, separate source and install identities, and runtime validation. R-12 already required identifying whether the target underpins the current Harness and maintaining an external recovery path. This incident makes the stronger execution boundary concrete: an in-host agent must hand off this global self-upgrade, because its own worker/result recorder can die mid-install and leave no CLI shims. The current skill's dedicated global-host section now states that specific prohibition and pinned-reinstall remedy explicitly; it is not missing from the supplied skill.

## 5. Prevention and acceptance checklist

An agent-side pre-dispatch guard should detect global install/update/uninstall operations on `@deepseek-ai/dsh` and equivalent mutations to its resolved install tree. Compare canonical target paths, including junctions/symlinks, with the active host's installation and process ancestry. Also check target presets/plugins/dependencies against the current runtime, as R-12 requires. If the target supplies this host, block tool execution and emit the external stop/install/verify/start procedure. If identity cannot be determined, require external execution rather than guessing it is safe. Generic confirmation must not bypass the structural boundary. Launching a child terminal from the same host without independent lifecycle control is not sufficient proof of separation.

For this machine, acceptance should cover:

- Formal install completes successfully; all three shims resolve to the expected global installation; CLI version is rc.1.
- Source-reference checkout is separately aligned with `dsh-v0.1.2-rc.1`; no user changes are discarded to achieve this.
- A fresh web host starts from the intended install, with no surviving alpha.5 process serving old code. Browser hard refresh yields matching rc.1 markers.
- Existing profile composition still enables the intended plugin identities; whale, progress, and other installed plugins actually register, render, and work. Inspect startup/client errors and pending services, then complete one message → tool → response flow. Installation success alone is insufficient.
- Preserve existing configuration and session data; verify ordinary session access. No new plugin re-migration is warranted solely for alpha.5 → rc.1: the repair notes and version reference agree that all 252 changed files are `package.json` version bumps, with zero API/feature changes. Older alpha migrations should not be replayed merely because the rc.1 release summary repeats the whole series' changes.
- Consider optional `dsh-old-*` cleanup only after rc.1 runtime acceptance and after confirming precisely which backup directories are no longer needed. Cleanup was not part of the recorded repair and is not performed here.

## Completion, limits, and recovery baseline

**Completed:** evidence-based diagnosis, repair attribution, exact external procedure, guard design, and machine-specific checklist. Only this report was written.

**Pre-existing:** mechanical baseline not collected (not a source migration). The supplied incident baseline is healthy alpha.5; the broken shims and hand-swapped package tree predate this analysis.

**Skipped:** installations, migrations, package scripts, runtime launches, source switching, and cleanup are outside this read-only task. No migration-planner or runtime-verifier execution was necessary to interpret this static incident.

**Pending/residual risk:** real-machine web and plugin acceptance remains pending per the repair notes. No live npm state, process state, or lifecycle side effects were independently checked. No blocker to producing this report.

**Rollback:** no fixture changes need rollback. If the user later needs host rollback, the recorded baseline is alpha.5 and recovery must use an external formal install pinned to that known version after stopping hosts, preserving configuration/data. The existence of `dsh-old-*` backups does not justify manually swapping them into place or promising recovery of arbitrary lifecycle-script effects.
