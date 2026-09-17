# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnostic Report

Environment: Windows, dsh `0.1.2-alpha.4` running, six community Web plugins across three GitHub mirrors, target release `@deepseek-ai/dsh@0.1.2-alpha.5`.

## 1. Attempt 1 root cause: why `koffi.node` is locked (EBUSY)

**Evidence:**
- `attempt1-ebusy.log`: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` fails with `npm error code EBUSY / npm error syscall copyfile` on `C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node` (dest is npm's temp staging dir `@deepseek-ai\.dsh-TMPDIR\...\koffi.node`).
- `running-processes.txt` shows three node.exe processes: PID 42432 = "dsh web host (holds koffi.node)", PID 23768 = "agent session worker", PID 23920 = the npm install itself.
- `running-processes.txt` explains the mechanism: the dsh web host loaded `@koromix/koffi` (a native FFI addon used for sandbox/filesystem operations) at startup. `koffi.node` is a native `.node` binary — once a process loads it via the OS loader, Windows holds an exclusive file lock on the backing file until **the process exits**.

**Root cause:** the running dsh web host (PID 42432) holds the lock. npm's global install cannot `copyfile` over a file loaded by a live process, hence EBUSY.

**Why a browser-page refresh does not free the lock:** the browser page is only the SPA front end served by the host. Refreshing reloads JavaScript in the browser tab; the host process that actually loaded `koffi.node` keeps running, so the OS lock persists. Only terminating the host process releases the file.

**Correct stop-then-upgrade sequence:**
1. Stop the running dsh host (and any agent session workers / child processes spawned from it — PID 23768 here) so every process that loaded `koffi.node` exits; verify with `tasklist /FI "IMAGENAME eq node.exe"` that no dsh-owned node.exe remains.
2. Run the upgrade install.
3. Restart dsh afterwards.

## 2. Attempt 2 root cause: why `dsh --version` printed `0.1.1-rc.2`

**Evidence:**
- `attempt2-downgrade.log`: `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` — the package `@deepseek-ai/dsh` is given **without a version specifier** — installs fine, then `dsh --version` prints `0.1.1-rc.2`.
- `npm-dist-tags.txt`: `next: '0.1.1-rc.2'`, `latest: '0.1.1-rc.2'`, `alpha: '0.1.2-alpha.5'`.

**Root cause:** an unpinned `npm install -g <pkg>` does not preserve the currently installed version nor advance to the newest prerelease; it resolves the package to whatever the npm **`latest` dist-tag** points to. At that moment `latest` (and `next`) pointed to `0.1.1-rc.2`, while `0.1.2-alpha.5` existed only under the `alpha` dist-tag. So the combined command installed rc.2 — a **downgrade** from the running `0.1.2-alpha.4` — even though it ran cleanly after the EBUSY was fixed. The install succeeding is exactly why this trap is dangerous: nothing errors; the version silently regresses. The wanted alpha.5 is only reachable via the explicit `@0.1.2-alpha.5` specifier or the `@alpha` dist-tag.

## 3. Exact safe upgrade commands

Order matters: release the lock first, pin the version explicitly.

```powershell
# 1. Fully stop dsh (host + session workers); confirm nothing holds koffi.node
tasklist /FI "IMAGENAME eq node.exe"   # ensure no dsh host/worker node.exe remains

# 2. Install the exact version wanted, together with the TUI plugin, in one install
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

# 3. Verify
dsh --version        # must print 0.1.2-alpha.5

# 4. Restart dsh
```

Key points:
- Pin `@0.1.2-alpha.5` explicitly (or use `@deepseek-ai/dsh@alpha`, which the dist-tags show resolves to `0.1.2-alpha.5`). Never rely on bare `@deepseek-ai/dsh` for a prerelease target.
- Installing both packages in one `npm install -g` is fine — the trap was the missing version specifier, not the combined command.
- Do not assume `latest`/`next` dist-tags track alpha releases; `npm-dist-tags.txt` proves they pointed at rc.2.

## 4. Prevention: guidance for plugin README authors

The offending combined command came from a plugin README. Authors should:

1. **Never publish unpinned dsh installs in copy-paste commands.** `npm install -g @deepseek-ai/dsh` silently resolves to the `latest` dist-tag, which can be older than the reader's running version. Pin a minimum version (`@deepseek-ai/dsh@^0.1.2`) or state the required version and let users upgrade separately.
2. **Do not chain dsh upgrades with plugin installs** in a single documented one-liner. Separate the two concerns: upgrade dsh first with an explicit version, then install the plugin `@deepseek-harness-tui/dsh-tui`. A plugin install should never be able to change the dsh version at all.
3. **Document the stop-first requirement.** Any upgrade command in a README must begin with stopping the running dsh host (and worker processes), because native addons like `koffi.node` stay locked until the host exits — and explicitly warn that refreshing the Web page does not release the lock.
4. **Warn about dist-tags for prereleases.** Alpha/beta channels live under separate dist-tags (`alpha` here) and `latest`/`next` may lag; point users to `npm view @deepseek-ai/dsh dist-tags` and to verifying with `dsh --version` after install.
5. Prefer version-resilient phrasing: document intent ("install the current alpha channel") via the dist-tag or a version range rather than a bare package name whose resolution changes under the reader.

## Evidence summary

| Finding | Source file | Evidence |
|---|---|---|
| EBUSY on `copyfile` of `koffi.node` | `attempt1-ebusy.log` | `npm error code EBUSY / syscall copyfile / path ...@koromix/koffi-win32-x64/.../koffi.node` |
| Lock holder | `running-processes.txt` | `node.exe 42432 ... dsh web host (holds koffi.node)`; native `.node` locked until process exit |
| Refresh does not help | `running-processes.txt` | "Refreshing the browser page only reloads the SPA; the host process (which loaded koffi) stays alive." |
| Downgrade | `attempt2-downgrade.log` | Unpinned install → `dsh --version` = `0.1.1-rc.2` |
| Why rc.2 | `npm-dist-tags.txt` | `latest: '0.1.1-rc.2'`, `next: '0.1.1-rc.2'`, `alpha: '0.1.2-alpha.5'` |
