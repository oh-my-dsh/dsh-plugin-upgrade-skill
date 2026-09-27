# S12 — Global upgrade: EBUSY and unintended downgrade

## Scope and conclusion

This is a read-only diagnosis of the supplied historical evidence. No installation, migration, process termination, registry request, source change, or test requiring mutation was performed. The fixture and benchmark repository were not modified.

The two failures are independent: attempt 1 encountered a Windows native-module lock; attempt 2 successfully installed the wrong DSH version because its command omitted the desired version/channel.

## Evidence

All five fixture files were read in full under:
E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S12-global-upgrade-ebusy-trap/environment/fixture/

- attempt1-ebusy.log records an explicit alpha.5 install failing with EBUSY during copyfile of @koromix/koffi-win32-x64/win32_x64/koffi.node into a .dsh-TMPDIR destination.
- running-processes.txt identifies node.exe PID 42432 as the DSH Web host holding koffi.node, PID 23768 as an agent session worker, and PID 23920 as the npm installer attempting the copy. It explicitly states that the host loaded the native FFI addon at startup for sandbox/filesystem operations.
- attempt2-downgrade.log records the unpinned combined command and the resulting 0.1.1-rc.2 version.
- npm-dist-tags.txt records latest = 0.1.1-rc.2, next = 0.1.1-rc.2, and alpha = 0.1.2-alpha.5.
- README.md establishes that these captures are static, read-only evidence.

## Attempt 1: the lock owner and correct shutdown

The holder is the server-side DSH Web host, not the browser and not merely the npm process. koffi.node is native executable code loaded into the host process. Windows retains the relevant loaded-module file lock until that process exits; npm cannot perform the required copy/replacement while it remains in use. A browser refresh reloads the SPA and reconnects to the same live host. Closing the browser, refreshing the page, or reloading a plugin does not terminate that Node host and therefore does not release its lock.

Save work and shut down DSH normally from its launching terminal (Ctrl+C) or its actual service/process supervisor. Stop DSH agent workers and any other DSH instances using the same global installation, and prevent automatic restart during maintenance. Verify they have exited before installing. The evidence specifically proves the host's lock; it does not establish that every worker or every node.exe has loaded koffi.

Use a separate PowerShell terminal for maintenance, not a tool inside the DSH process being replaced. Inspect current identities, for example:

~~~powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Select-Object ProcessId, ParentProcessId, CommandLine
~~~

If graceful shutdown fails, terminate only a freshly verified DSH process/tree. Do not blindly kill all node.exe processes or reuse the historical PIDs: PIDs can be reassigned, and unrelated Node applications must not be stopped. Retrying npm while the same host remains alive, using administrator privileges, clearing npm's cache, or adding --force does not release the loaded-module lock.

## Attempt 2: unpinned does not mean keep or upgrade

The command was:

~~~powershell
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
~~~

The bare @deepseek-ai/dsh requests npm's default dist-tag, latest, in the evidenced configuration. latest was explicitly mapped to 0.1.1-rc.2. npm does not interpret the bare package as “preserve my installed alpha” or “choose the highest version ever published.” Dist-tags are publisher-controlled labels; their names do not guarantee chronological or semantic-version ordering. Thus the combined command replaced DSH with rc.2 even though alpha.5 existed. @next would also select rc.2 in this snapshot; @alpha would select alpha.5. The release label dsh-v0.1.2-alpha.5 is not the npm version specifier to use.

## Exact safe upgrade procedure

After the shutdown and exit verification above, run the following in the independent terminal. Execute subsequent steps only if the previous command succeeds:

~~~powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
if ($LASTEXITCODE -ne 0) { throw 'Install failed; do not restart DSH yet.' }
dsh --version
npm ls -g --depth=0
~~~

Require dsh --version to print exactly 0.1.2-alpha.5 and the global package list to show both the pinned DSH and @deepseek-harness-tui/dsh-tui. If the version differs, do not call the upgrade successful: inspect Get-Command dsh -All and npm prefix -g for another installation earlier on PATH. Restart DSH with the user's normal launch command only after verification, then reload its browser page and smoke-test plugin loading.

An equivalent split installation is npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 followed by npm install -g @deepseek-harness-tui/dsh-tui; do not include bare @deepseek-ai/dsh in that second command. An explicit @alpha install matches the fixture's desired version today but is a moving channel, so the exact alpha.5 pin is preferable for this request.

The fixture does not identify versions or compatibility details for the six community Web plugins, nor a tested TUI version. This report cannot certify those plugins against alpha.5 or invent migration/activation commands. The TUI package name above is taken directly from the evidence; its unpinned version remains registry-dependent.

## README prevention

1. Separate first-time host installation from adding a plugin to an existing installation. For existing DSH users, show a plugin-only command so the README does not silently replace their host.
2. Where a combined command is necessary, specify a tested exact DSH version or an explicitly named supported channel. Explain that channels move and that bare DSH follows latest, which can downgrade a prerelease installation. Do not recommend @next as a universal prerelease fix.
3. Document supported DSH/plugin versions and distinguish deliberate host upgrades from plugin installation. Keep tested examples current without claiming compatibility not established by tests.
4. Put the Windows stop-host-and-workers warning before global install commands; explicitly state that a page refresh is insufficient. Include post-install version checks and restart instructions.

## Validation and limits

The diagnoses and commands were checked against all supplied captures, not executed against the live installation. No external services were accessed. Analysis is complete with no blocker; actual upgrade success and plugin compatibility remain unverified by design under the read-only task scope.
