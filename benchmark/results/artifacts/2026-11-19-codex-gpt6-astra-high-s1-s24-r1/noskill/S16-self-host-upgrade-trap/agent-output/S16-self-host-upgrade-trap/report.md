# S16: Self-host upgrade incident report

## Scope and evidence

This is a static, read-only analysis of `agent-session-log.txt`, `env-state.txt`, `repair-notes.md`, and the fixture README. No installation, migration, host restart, network access, or fixture modification was performed. No skills were read or used. Commands below are an external operator procedure, not commands executed in this analysis.

## 1. Structural root cause

The agent was executing inside the active dsh web host, whose Node process used the global `@deepseek-ai/dsh` installation. Its PowerShell tool ran in that host's own worker process. Thus the session, tool worker, and result-recording channel depended on the very installation that `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` was removing and replacing. This was a self-host upgrade, not an independent maintenance shell.

The log records cleanup, removal, fetching, and `linkStuff`, followed by loss of the web connection before any durable tool result. The host/session and its reporting path died before the install could complete normally and report success. With that execution context interrupted, the agent could neither supervise completion nor reliably record or recover the result. Increasing the tool timeout would not remove this dependency.

The failure is structural: an installer must survive independently of the service it replaces. An in-host install violates that requirement even if a particular run happens to survive. The evidence establishes the host death and interrupted install, but does not provide a process trace proving an exact signal, file lock, npm internal failure, or the precise termination order of every child process. The missing result alone means outcome unknown; the subsequent machine inspection establishes the broken installation in this case.

## 2. Why the command vanished

Before the attempt, alpha.5 was healthy and all three npm entry-point shims existed: `dsh`, `dsh.cmd`, and `dsh.ps1`. Afterwards, `dsh` and `dsh.cmd` were missing and `dsh.ps1` pointed into an old tree. Both `dsh --version` and `dsh web` failed with command-not-found errors.

Package files on disk do not constitute a usable npm global installation. The executable entry points and their targets must also be generated coherently. Here rc.1 content was present, but it was partially replaced and included files placed manually by the user. The combination of an interrupted link stage, missing shims, stale targets, and manually swapped content is the interrupted/non-standard-install signature. Merely adding a PATH entry or pointing at the remaining directory would not establish a repaired install.

Further hand-swapping directories or patching a launcher would compound the mismatch between package content, dependencies, npm-managed entry points, and old backup paths. It could conceal mixed versions while leaving other shells broken. The `dsh-old-*` directories are not a substitute for a coherent installation or proof of a valid rollback. Reconstruct the installation through the package manager rather than extending the manual patchwork.

## 3. Repair actually applied

The independent agent CLI, running outside dsh, re-ran the formal registry installation:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-rc.1
```

The repair notes explicitly report that this regenerated `dsh`, `dsh.cmd`, and `dsh.ps1`, and that `dsh --version` returned `0.1.2-rc.1`. This was a reinstall of the exact target package, not a source-directory swap, manual shim edit, or plugin migration. The external executor did not rely on the dsh host to stay alive and could finish and observe npm's result while dsh was down.

Separately, the source checkout used for host-source reference was aligned from the alpha.5 tag to `dsh-v0.1.2-rc.1`, with no local-modification conflicts. Aligning that reference checkout did not itself restore the CLI; npm regenerated the launchers.

These are recorded repair results, not independently repeated measurements. The notes leave actual web startup and plugin loading for the user, so full application recovery is not yet demonstrated.

## 4. Required agent protocol and external procedure

Before issuing a global install, the agent should identify the target installation, active host executable/package path, and the ownership of its session and tool worker. Here those facts already showed that upgrading dsh meant replacing its own execution host. It should not execute the global install from that session, even with user authorization to upgrade. It should prepare and hand off the following procedure to a genuinely independent terminal or external agent CLI. A new terminal tab hosted by the same dsh worker is not sufficient; neither is an unverified background child spawned by that worker.

1. Save needed work and record the intended version, active profile/configuration, plugin setup, and current installation location. Review compatibility and protect any local source changes before changing tags.
2. Open an independent PowerShell terminal outside dsh. From it, identify the applicable Node/npm environment and global prefix so the repair targets the installation used by this machine.
3. Stop the running dsh web host and all dsh processes using that installation. Confirm they have exited before running npm. The GUI and agent session will disconnect as an expected consequence; the external terminal must remain available. Do not indiscriminately terminate unrelated Node processes.
4. In that external terminal, run the exact version-pinned registry command:

   ```powershell
   npm install -g @deepseek-ai/dsh@0.1.2-rc.1
   ```

   Wait for completion and inspect npm's result/exit status. The scoped package and explicit version select the requested release; the formal global install regenerates the launchers and package layout. Do not substitute an unpinned latest version, a local source-directory install, a manual directory copy, or a hand-written shim. No evidence calls for `--force` or arbitrary elevation.
5. Confirm that command resolution uses the intended installation, all three shims exist and point to the current tree, and `dsh --version` returns `0.1.2-rc.1`. If installation or verification fails, continue diagnosis externally; do not claim success or restart from an uncertain tree.
6. Align the host-source reference checkout to `dsh-v0.1.2-rc.1`, preserving local changes if any. In this recorded repair there were no conflicts.
7. Start `dsh --profile web`, hard-refresh the browser, and verify the runtime and plugins as detailed below. Only after successful verification consider removing obsolete backups.

Baseline upgrade discipline already accounts for choosing an exact target version, using the formal package-manager installation, reviewing release differences, keeping source references aligned, protecting local changes, and verifying the result. The incident-specific addition is an explicit self-host boundary: recognize that the agent depends on the target, refuse to perform the replacement from that session, and require an independent executor plus a stopped host before npm begins. No separate upgrade-rule document is included in the evidence pack, so this distinction describes the general baseline and the new incident lesson, not a claim to have inspected an unavailable policy.

## 5. Prevention and post-upgrade checklist

An agent-side pre-execution guard should compare package-manager mutations against its host identity and install root. For a global install/update/uninstall of the package supplying the current host (including wrapped shell commands and equivalent removal/replacement operations), block execution through the host worker and supply the external procedure. Detection should use host metadata, executable/package paths, global prefix, and process ancestry where available, rather than only matching a literal command string. If independence cannot be established, hand off. Ordinary upgrade authorization does not resolve the execution dependency. A future updater could automate this only through a separately managed supervisor with independent lifetime and result persistence.

For this machine, verify:

- npm completed successfully; launchers `dsh`, `dsh.cmd`, and `dsh.ps1` are regenerated, resolve to the intended install, and no stale command shadows it.
- CLI version is exactly `0.1.2-rc.1`; the source reference checkout is at `dsh-v0.1.2-rc.1`.
- `dsh --profile web` starts and remains available; the browser reconnects after a hard refresh.
- Expected plugins, including whale and progress, load and function; inspect startup/plugin errors rather than relying on a visible page alone.
- Existing profile and configuration remain usable. A fresh session can execute a harmless tool and record its result.
- Consider optional `dsh-old-*` cleanup only after rc.1 runtime/plugin verification, with exact paths reviewed first.

The repair notes report that the alpha.5-to-rc.1 diff comprised 252 files, all `package.json` version bumps, with zero API or feature changes. On that recorded evidence, plugins already migrated for 0.1.2-alpha.x require no re-migration. Do not invent API fixes or repeat a migration simply because the release label changed. Runtime checks remain necessary to validate the repaired installation, profile, and browser state. The diff finding is taken from the supplied notes; source trees were not provided for independent diff verification.

## Completion and limits

The report is complete. No blocker prevented static analysis. Live repair, process-level forensic confirmation, source-diff reproduction, and the remaining web/plugin checks are outside this read-only task and have not been performed.
