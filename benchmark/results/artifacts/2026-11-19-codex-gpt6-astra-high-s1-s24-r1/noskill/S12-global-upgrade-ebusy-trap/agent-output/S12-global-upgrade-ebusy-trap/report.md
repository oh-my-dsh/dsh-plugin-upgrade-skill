# S12: Windows global upgrade failure and downgrade

## Attempt 1: the host holds a native binary open

`attempt1-ebusy.log` records EBUSY during npm's `copyfile` operation involving `@koromix/koffi-win32-x64/win32_x64/koffi.node`. `running-processes.txt` explicitly identifies node.exe PID 42432 as the dsh web host holding that binary. The host loaded the Koffi native FFI addon at startup for sandbox/filesystem operations. Windows keeps the loaded native module locked until its owning process exits, preventing the attempted replacement/copy operation.

This is a server process lifetime issue. Refreshing or closing the browser page affects the SPA/client; it does not terminate the dsh web host that loaded the addon, so it does not release this lock. The listed agent worker (23768) and npm installer (23920) are distinct processes; the evidence identifies the host, not either of those, as the holder. Do not kill all node.exe processes.

Stop dsh gracefully in its hosting terminal with Ctrl+C, let it exit, and verify that the host process has ended. If several dsh hosts use this global installation, stop each before installing. Keep dsh stopped throughout both installation steps, verify the version, then restart it using the normal launch command. No deletion of koffi.node, cache purge, or elevation is established as necessary by this evidence.

## Attempt 2: the combined command selects latest again

`attempt2-downgrade.log` shows:

```powershell
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

The bare `@deepseek-ai/dsh` is a fresh unpinned package request. With npm's normal default tag, it resolves through `latest`; it does not mean “preserve the installed version” or “choose the highest available prerelease.” The captured registry mapping in `npm-dist-tags.txt` is:

| Tag | Version |
| --- | --- |
| latest | 0.1.1-rc.2 |
| next | 0.1.1-rc.2 |
| alpha | 0.1.2-alpha.5 |

Thus the combined install replaces the alpha installation with rc.2, matching the captured `dsh --version` result. A successful npm exit does not guarantee the intended release channel. `@next` would also select rc.2 in this snapshot. The release name `dsh-v0.1.2-alpha.5` is not the npm version specifier; use `0.1.2-alpha.5`.

## Safe ordered commands

These are proposed commands, not commands executed in this analysis. First stop the host with Ctrl+C in its original terminal. In another PowerShell terminal, verify its process has exited:

```powershell
Get-Process -Id 42432 -ErrorAction SilentlyContinue
```

For the captured session, no process output means this PID has exited. PID 42432 is historical evidence, not a reliable identifier in a later session. For a later run, identify the current dsh host PID and substitute it. If graceful shutdown fails, inspect the specific current process before stopping it:

```powershell
Get-CimInstance Win32_Process -Filter 'ProcessId = 42432' |
    Select-Object ProcessId, Name, CommandLine
# Only if this is still the intended dsh web host:
Stop-Process -Id 42432 -ErrorAction Stop
Wait-Process -Id 42432 -ErrorAction SilentlyContinue
```

After confirming the relevant dsh hosts have exited, run the exact target installation followed by the TUI-only installation:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
if ($LASTEXITCODE -ne 0) { throw 'DSH upgrade failed; stop here.' }

npm install -g @deepseek-harness-tui/dsh-tui
if ($LASTEXITCODE -ne 0) { throw 'TUI installation failed; stop here.' }

$installedVersion = (dsh --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $installedVersion -ne '0.1.2-alpha.5') {
    throw "Unexpected DSH version: $installedVersion"
}
$installedVersion
```

Expected output is `0.1.2-alpha.5`. Restart dsh only after these checks pass. Do not rerun the original unpinned combined command afterward. An equivalent single installation command, after stopping dsh, is:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
```

Use either installation form, not both. `@deepseek-ai/dsh@alpha` would select alpha.5 according to the captured tags, but the explicit version is preferable for this exact target because tags can move. The fixture supplies no TUI version or compatibility matrix; its unpinned request uses the registry's selected plugin version, whose compatibility must be checked separately. The other six Web plugins and their mirrors do not require changes to resolve either documented failure.

## README prevention

Plugin README authors should make the primary installation example plugin-only:

```powershell
npm install -g @deepseek-harness-tui/dsh-tui
```

Document the required DSH versions separately. If a combined bootstrap example is provided, explicitly pin the supported DSH version (for this case, `@deepseek-ai/dsh@0.1.2-alpha.5`) rather than silently reinstalling bare `@deepseek-ai/dsh`. If intentionally tracking a release channel, name that tag explicitly and explain that it moves. Explain that bare package requests follow `latest`, which may lag a prerelease already installed. Include Windows host shutdown instructions, warn that browser refresh does not unload native addons, and verify `dsh --version` before restarting. The same guidance applies to installation commands across the plugin mirrors.

## Scope and evidence limits

This was one read-only, no-skill analysis of solver-instruction.md and the five fixture files. No skills, external sources, network, installations, migrations, runtime process termination, tests, scoring, or other cases were accessed. Only this report was written under agent-output; the fixture was unchanged. The fixture explicitly attributes the lock to the host, but no live handle inspection or execution was performed. Registry mappings are the captured state, not a claim about today's registry. No blockers prevented the requested diagnosis and procedure; actual installation success and plugin compatibility remain unverified because execution is outside the authorized scope.
