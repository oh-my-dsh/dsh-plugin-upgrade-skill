# S16 — Self-host upgrade trap

## Scope and evidence

This is a read-only incident analysis, not an upgrade execution. I read instruction.md in full and all four fixture files. No installation, migration, repair, cleanup, external access, or fixture modification was performed. The earlier report-writing attempt failed at JavaScript parsing and did not create the report; this document is the successful recovery output.

Evidence directory: E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S16-self-host-upgrade-trap/environment/fixture

Sources: README.md (scope); agent-session-log.txt (host relationship, npm sequence, missing result); env-state.txt (before/after machine state); repair-notes.md (applied external repair and remaining verification). The historical machine's outcomes below are reported by that evidence, not independently reproduced here.

## 1. Structural root cause

The healthy machine ran 0.1.2-alpha.5. The agent was not an independent administrator: its web session ran inside the dsh host, which executed from the global node_modules/@deepseek-ai/dsh installation. The tool worker belonged to that host's execution context. The command `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` targeted the same installation that supplied the running host and its tools.

This creates a self-replacement lifecycle conflict. The mechanism responsible for executing, supervising, and recording the upgrade is dependent on the software being replaced. Giving the command a longer timeout, retrying it, or placing it in a background job still owned by dsh does not establish an independent upgrade supervisor.

The recorded sequence is cleaning at 16:41:02, removal at 16:41:05, fetching at 16:41:09, and linkStuff at 16:41:31. At that point the GUI lost its connection. The host/session died before a successful install completion and durable tool result were recorded. Thus the reporting and supervision path disappeared while the upgrade was still in progress. The log records a tool call with no durable result and an unknown outcome, not a successful command or a normal npm error result.

The structural failure is the dependency cycle, rather than flaky networking or an ordinary timeout. The evidence does not supply a crash stack, exact operating-system termination mechanism, or npm exit status. It cannot prove whether a particular loaded module, file lock, child termination, or subsequent file access triggered death. Replacing files does not universally force every Node process to exit immediately. Nevertheless, relying on the target host to survive its own replacement and report completion is unsound by construction; this incident shows the concrete failure. Host/session loss is the first observed operational failure, followed by an incomplete/unusable installation; the exact timing of npm and worker termination is not established.

## 2. Why the command vanished despite package content

Before the attempt, the global prefix contained working dsh, dsh.cmd, and dsh.ps1 launchers. Afterwards dsh and dsh.cmd were missing, while dsh.ps1 was stale. The package directory contained rc.1 files but was partially replaced and subsequently affected by the user's manual repair. Both `dsh --version` and `dsh web` failed to resolve a usable command.

Package content and an installed command are distinct artifacts. npm must install the payload and generate the platform launchers that connect command resolution to the package's bin entry. The presence of rc.1 files does not prove that bin linking completed or that the installation is coherent. The linkStuff log line shows that linking was entered, not that it finished successfully. Missing launchers plus a stale remaining launcher, a lost tool result, and a dead host form the interrupted-install signature. The stale dsh.ps1 did not establish a usable CLI; shell-resolution details beyond the observed failures are not available.

Further directory swapping or patching would preserve or worsen the non-standard state. Copying a package tree does not regenerate npm's launchers or ensure that dependencies, metadata, target paths, and package files agree. Reusing dsh-old-* directories risks introducing stale or mixed-version content; the named dsh-old-0.1.1-rc.1 backup is not evidence of a valid alpha.5 rollback. Handwritten shims can conceal the installation problem rather than repair it. Use the package manager to restore a standard installation; do not infer integrity from a version string or a folder name alone.

## 3. Repair actually applied and its verification

The repair notes describe a different agent CLI, running outside dsh, executing the formal registry install again:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-rc.1
```

This regenerated dsh, dsh.cmd, and dsh.ps1. The notes confirm that `dsh --version` then reported 0.1.2-rc.1. They do not describe manual shim reconstruction, installation from a renamed backup, a forced install, or an uninstall-first repair.

The external executor did not depend on the dsh installation for its own survival, and the failed host was already dead. npm could therefore finish the formal installation and bin-linking work without destroying the context relied on to supervise it. This is a coherent package-manager repair, not a claim that npm installation is atomic or infallible.

The external repair also aligned the separate source checkout, used for host-source reference, from the alpha.5 tag to dsh-v0.1.2-rc.1, with no local-modification conflicts. Source-checkout alignment and global executable installation are separate actions; changing a checkout tag alone does not repair the global CLI.

Verified in the notes: regenerated launchers, CLI version, checkout alignment, and the version-only diff finding. Still left for the user: start the new web host, hard-refresh the browser, and verify plugins on the actual machine. This report does not upgrade that pending verification into a completed success claim.

## 4. Protocol the agent should have followed

The agent should first identify the package-manager target, active installation path, and its own host relationship. In this case the requested upgrade replaces its own execution environment. It should explicitly decline to execute that global install from the session and deliver an external procedure instead. User permission to upgrade does not remove the lifecycle dependency. Nor is closing only the browser tab equivalent to stopping the host.

Ordered external procedure for this machine:

1. Save needed work and record the exact target and procedure while the current host remains available. Preserve existing backups and configuration; do not mix directory repair into the upgrade.
2. In an independent terminal or other independent controller, stop the running dsh host and any other dsh processes using that global installation. Confirm they have exited before npm runs. Do not start the installer as a tool/background child of the host and then kill its supervisor. The GUI disconnect at this deliberate stop is expected.
3. From the independent terminal, using the intended Node/npm installation and global prefix, run exactly `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` and wait for a successful exit. This is an exact, version-pinned registry package spec, not an unpinned latest tag, Git checkout, directory copy, or hand-patched launcher. The pin selects the evaluated prerelease; the formal install lets npm produce both package files and launchers. If it fails, keep diagnosis and repair outside dsh rather than declaring success.
4. Confirm `dsh --version` reports 0.1.2-rc.1, check command resolution and all three launchers in the intended global prefix, and ensure they target the installed package rather than a backup. If needed, inspect `Get-Command dsh -All`, `npm prefix -g`, and `npm list -g @deepseek-ai/dsh --depth=0` from that external shell. These are suggested checks, not commands executed in this analysis.
5. Start a fresh host using `dsh --profile web`, hard-refresh the existing browser URL http://127.0.0.1:3080, and verify the GUI and expected plugins. Align the separate reference checkout to dsh-v0.1.2-rc.1 after checking for local changes; do not discard changes blindly.
6. Only after rc.1 is confirmed healthy, optionally remove obsolete dsh-old-* backups. Retain them until verification is complete.

Ordinary upgrade discipline already accounts for identifying the exact target, checking release differences, using a formal pinned registry install, treating the source checkout separately, preserving local changes, and validating runtime/plugin behavior before cleanup. The new incident-specific requirement is self-host recognition and the hard ordering boundary: the current agent must not execute its own global replacement; the host must stop before an independent executor starts npm. No separate upgrade-rule document was supplied or consulted, so this classification is a procedural distinction rather than a claim about the contents of an unseen skill.

## 5. Prevention and alpha.5 → rc.1 checklist

An agent-side guard should classify destructive package operations against the current host installation before dispatch. It should consider the resolved global prefix, installed package identity and path, and current host provenance, not only a literal match for this exact npm command. Equivalent package-manager aliases, removal/reinstallation commands, wrappers, and direct directory replacement require the same self-host check. When the operation would replace the active host, block in-session execution with an actionable explanation and the stop-first external procedure. If the relationship cannot be established, do not assume the operation is independent.

Background execution in the same host is not an exemption. A genuinely independent, supported updater with explicit lifecycle ownership would be a different design; none is evidenced here. A guard need not forbid every legitimate plugin update or supervised restart, which can have different lifecycle guarantees. Its scope is unsafe replacement/removal of the installation sustaining the session. Test this decision logic with inert command fixtures, not by upgrading a live host.

Machine-specific post-upgrade checklist:

- Verify the standard global install and launcher resolution, then confirm CLI version 0.1.2-rc.1.
- Confirm the separate host-source reference checkout matches dsh-v0.1.2-rc.1 without losing local modifications.
- Use the repair notes' diff finding: dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1 changed 252 files, all package.json version bumps, with zero API or feature changes. Plugins already migrated for 0.1.2-alpha.x need no re-migration. Do not invent API changes or repeat a migration solely because the prerelease label changed.
- Launch `dsh --profile web`, hard-refresh the browser, confirm GUI connectivity, and verify whale, progress, and other expected plugins actually load. No API diff does not substitute for this smoke check.
- Treat the interrupted upgrade tool call as unresolved historical work, not a success. Inspect any resumed session's durable state rather than assuming the old process or its tool job continues. The fixture does not establish whether durable sessions can resume, so no data-loss or non-resumability claim is warranted.
- Clean dsh-old-* backups only after successful verification; this cleanup is optional.

## Completion and limits

The requested analysis is complete from the supplied evidence. No live-machine verification was possible or attempted within this read-only task; the GUI/plugin smoke checks remain pending exactly as stated in the repair notes. The fixture and benchmark repository were not changed. Only the designated output directory was created and this report written. No skills directory, verifier, or reference answer was read.
