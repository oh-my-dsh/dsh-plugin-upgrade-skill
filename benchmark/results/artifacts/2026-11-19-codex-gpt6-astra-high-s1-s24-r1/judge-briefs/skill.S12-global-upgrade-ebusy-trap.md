# JUDGE BRIEF · skill.S12-global-upgrade-ebusy-trap

## Criteria (sealed rubric)
- [native-module-owner] (20pt) Identify the running Windows dsh web-host node.exe (PID 42432 in running-processes.txt) as the process that loaded koffi.node. Explain that the loaded native binary remains in use until that host exits, so npm cannot copy/replace it and reports EBUSY. File-in-use/handle wording is equivalent to lock; do not require universal claims about other operating systems or the word exclusive.
- [browser-versus-host-sequence] (20pt) Explain that refreshing the browser reloads the page/SPA without stopping the native-module-owning host. Give the ordered procedure: stop/confirm exit of the relevant dsh host, install, then restart. Separate numbered steps, prose and command blocks together establish the sequence; do not require a single sentence. Do not prescribe killing every unrelated Node process.
- [unpinned-dist-tag-resolution] (20pt) Explain that an unversioned npm global install follows latest, which npm-dist-tags.txt pins to 0.1.1-rc.2; alpha points to 0.1.2-alpha.5. This can replace the initially installed alpha.4 with rc.2 rather than preserving/upgrading it. A statement that an unpinned install does NOT preserve the installed version is correct, not contradictory advice. Distinguish a minor wrong prior-version label from a wrong resolution mechanism.
- [safe-exact-commands] (20pt) Provide npm install -g (or npm i -g) @deepseek-ai/dsh@0.1.2-alpha.5 and @deepseek-harness-tui/dsh-tui, together or separately after stopping the host. Verify dsh --version is alpha.5 and restart the host. An explicit @alpha may be discussed as a mutable alternative but cannot replace the requested exact-version command. Shell examples are proposed instructions, not required executed actions.
- [readme-prevention] (20pt) Tell README authors to pin the exact intended/tested core version whenever a plugin install command also installs dsh, and avoid silently following latest over an existing prerelease. Accept separate pinned core/plugin commands or one pinned combined command. Read the recommendation across headings and list items; quoted unpinned BAD examples are not endorsements.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S12-global-upgrade-ebusy-trap/report.md

# S12: Windows global upgrade diagnosis

This is a read-only diagnosis and external execution procedure. No install, migration, process termination, or fixture change was performed. The supplied BENCHMARK-AUTH-v1 authorizes this report. I read skills/plugin-upgrade/SKILL.md, its global-host-upgrade discipline, the relevant troubleshooting entry, and the alpha.5 version-card channel evidence. Host installation is outside plugin Mode B/C; this report does not claim a plugin migration.

## Attempt 1: the host owns the lock

`attempt1-ebusy.log` records `EBUSY`, syscall `copyfile`, against `@koromix/koffi-win32-x64/win32_x64/koffi.node`, with a destination in npm's temporary DSH package tree. `running-processes.txt` identifies node.exe PID **42432** as the **dsh web host holding koffi.node**. PID 23768 is an agent worker; PID 23920 is npm attempting the copy, not the identified lock owner.

The host loaded @koromix/koffi, a native FFI addon used for sandbox/filesystem operations, at startup. Windows keeps the loaded native `.node` binary locked until the owning process exits. Refreshing or closing the browser only reloads or disconnects the SPA: it does not unload native code from the server process. Even a hard refresh cannot release this host lock.

Save work, stop every DSH host and associated worker, verify their exit, then install from an **external PowerShell terminal**. Prefer Ctrl+C in each host's owning terminal and disable any automatic restart while upgrading. Inspect remaining node processes and terminate only confirmed DSH processes if graceful shutdown fails; do not indiscriminately kill node.exe. PID 42432 is historical evidence, not a PID to blindly terminate later. Never run a global host upgrade from a tool inside the host being replaced: it can kill its own execution environment and leave an interrupted installation or missing command shims.

## Attempt 2: latest is an explicit replacement request

`attempt2-downgrade.log` contains:

```powershell
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

The bare `@deepseek-ai/dsh` requests npm's default **latest** dist-tag. It does not mean “keep my installed version,” “upgrade only,” or “choose the numerically greatest published prerelease.” The fixture's `npm-dist-tags.txt` shows:

| Tag | Version |
| --- | --- |
| latest | 0.1.1-rc.2 |
| next | 0.1.1-rc.2 |
| alpha | 0.1.2-alpha.5 |

Thus the successful combined command replaces the global host with **0.1.1-rc.2**, explaining the subsequent version output. The first failed pinned attempt does not make the second unpinned request inherit alpha.5. A new GitHub release does not automatically move npm's latest tag. There is no evidence here that TUI incompatibility or the three GitHub mirrors caused the downgrade.

## Exact upgrade procedure (commands to run externally, not executed here)

1. Finish/save active work and stop all DSH hosts and their workers as above. Verify no DSH process remains before installing. The following inspection helps identify remaining processes; unrelated Node applications can stay running:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Select-Object ProcessId, ParentProcessId, CommandLine
```

2. In the external terminal, use the pinned host command and install TUI separately:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
if ($LASTEXITCODE -ne 0) { throw 'DSH installation failed; stop here.' }
npm install -g @deepseek-harness-tui/dsh-tui
if ($LASTEXITCODE -ne 0) { throw 'TUI installation failed; stop here.' }
dsh --version
if ($LASTEXITCODE -ne 0) { throw 'DSH version check failed; stop here.' }
npm list -g --depth=0
```

Require `dsh --version` to print **0.1.2-alpha.5**, and confirm both packages are present, before restarting. TUI's exact release is not supplied; its bare name requests its own latest tag, independently of the explicitly pinned DSH host. Record that resolved TUI version and check its supported host range; do not invent a TUI version from the host's version.

An equivalent corrected combined install, used instead of the two install commands above, is:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
```

`@deepseek-ai/dsh@alpha` would select alpha.5 in this captured registry state, but tags move; the exact version pin is the reproducible choice. `@next` and `@latest` would both select rc.2 here. The npm version argument is `0.1.2-alpha.5`, without the Git tag's `dsh-v` prefix.

3. After verifying the version, cold-start:

```powershell
dsh web
```

Hard-refresh the browser after the new host is running. Verify the UI/host version markers, all six community Web plugins registering and mounting, and one normal interaction per plugin. Verify TUI activation in its documented profile and a basic TUI interaction; global package installation alone does not prove plugin enablement. No TUI launch syntax or profile configuration was provided, so none is fabricated here.

## README prevention

Publish a plugin-only install command for users who already have DSH, for example `npm install -g @deepseek-harness-tui/dsh-tui`. Put host setup/upgrade in a separate, clearly labeled procedure. Never silently add an unpinned `@deepseek-ai/dsh` to an existing-user plugin command. If a combined command is shown, pin the tested host version explicitly, such as the corrected alpha.5 command above, and preferably pin the tested plugin version too. State the tested compatibility range, explain latest/next/alpha and that latest may be older than an installed prerelease, and require a version check afterwards. Include Windows stop-host → external install → restart → browser refresh ordering. Keep GitHub owner/mirror names distinct from npm package identities.

## Completion, limitations and recovery

- **Completed:** both root causes traced to the four supplied evidence files; exact pinned external commands and README guidance provided. Only this report was written.
- **Pre-existing:** Mode C baseline not collected; the supplied EBUSY failure and rc.2 result are the observed baseline, not new failures introduced by this analysis. Initially running host was alpha.4; after attempt 2, the observed installed host was rc.2. Node version and individual plugin versions are not supplied.
- **Skipped:** installation, migration, runtime execution, source edits, network lookups, and fleet compatibility certification are outside this read-only task. The six plugin sources and manifests are absent; their names, SHAs, dependency cohorts and enablement cannot be established from these logs.
- **Pending/residual risk:** the commands are a proposed procedure, not a tested installation result. TUI compatibility and lifecycle-script effects require checking the actual selected release; Web and TUI runtime verification remains pending. No blocker prevents the requested diagnosis/report.
- **Rollback/recovery:** there are no changes to roll back from this task. If a failed installation left the command missing or damaged, keep DSH stopped and rerun the formal pinned alpha.5 install externally to regenerate package content and shims; do not hand-copy package trees or hand-write shims. If an actual rollback is needed, alpha.4 is the recorded pre-upgrade host version: use `npm install -g @deepseek-ai/dsh@0.1.2-alpha.4` externally after stopping the host, with data/configuration compatibility reviewed and pre-upgrade backups retained. An npm package rollback does not automatically undo data changes or third-party install-script effects.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.