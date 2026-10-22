# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnostic Report

Environment: Windows, dsh currently running `0.1.2-alpha.4`, target `0.1.2-alpha.5`, six community Web plugins across three GitHub mirrors.
Evidence: `/app/fixture/` (read-only) — `attempt1-ebusy.log`, `running-processes.txt`, `attempt2-downgrade.log`, `npm-dist-tags.txt`. No fixture file was modified; nothing was installed or executed.

---

## 1. Attempt 1 root cause — the EBUSY on `koffi.node`

### What the evidence shows

`attempt1-ebusy.log`:

```
$ npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
npm error code EBUSY
npm error syscall copyfile
npm error path C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node
npm error dest C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node
```

`running-processes.txt` at the same moment:

| PID | Process | Role |
|---|---|---|
| 42432 | node.exe | **dsh web host — the process that loaded and holds `koffi.node`** |
| 23768 | node.exe | agent session worker (dsh child/worker process) |
| 23920 | node.exe | the `npm install -g` itself (the process attempting the copy) |

### Who is holding the file, and why

- `@koromix/koffi` is a **native FFI addon** that the dsh web host loads at startup for sandbox/filesystem operations. Its payload is `koffi.node`, a native Windows binary (PE image, DLL-equivalent).
- On Windows, when a process loads a native `.node`/`.dll` image, the OS **memory-maps the file and keeps an image lock on it for the entire lifetime of the process**. Unlike POSIX (where an open file can be unlinked/replaced while in use), Windows refuses any open-for-write / delete / replace of a file that has a mapped image section. The lock is released **only when the owning process exits** (or explicitly unloads the module — which koffi/dsh does not do).
- `npm install -g` upgrades a package by staging the new tree into a temporary directory (`.dsh-TMPDIR` visible in the `dest` field) and then swapping it over the existing global `node_modules` tree. That swap requires copying/moving over the currently installed `koffi.node`, whose image is mapped into PID 42432. The OS denies the `copyfile` with **EBUSY** ("resource busy or locked"). So the *locker* is the dsh web host (PID 42432), and the *victim* operation is npm's staging copy (PID 23920).
- Note the agent session worker (PID 23768) as well: dsh worker/child processes can also have koffi loaded, and children can outlive a parent kill. Both PIDs must be gone before the file is free.

### Why a browser-page refresh does NOT free the lock

The browser page is only the **SPA client** of the dsh web host. Refreshing (F5) reloads the front-end JavaScript inside the browser tab; it does **not** terminate the server-side `node.exe` host process (PID 42432) that memory-mapped `koffi.node` at startup. The lock lives with that OS process, not with any HTTP/WebSocket session or browser tab. Likewise, closing the tab, stopping an agent session from the UI, or logging out does not unload the native module. **Only fully exiting the dsh host process (and any dsh worker processes) releases the lock.**

### Correct stop-then-upgrade sequence

Important preliminary: run the install from a **standalone terminal (external PowerShell/CMD)** — not dsh's integrated terminal or an agent shell. An integrated shell is a child of the dsh host and dies the moment you stop dsh, killing your install mid-flight.

1. **Gracefully stop dsh**: finish/stop running agent sessions and background jobs, then shut the dsh web host down through its normal stop mechanism (UI shutdown / service stop / Ctrl-C on the host console).
2. **Verify no dsh node processes remain** (external terminal):
   ```powershell
   tasklist /FI "IMAGENAME eq node.exe"
   ```
   Identify dsh-related PIDs by their command line (do not kill unrelated node apps):
   ```powershell
   wmic process where "name='node.exe'" get ProcessId,CommandLine
   # or: Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId,CommandLine
   ```
3. **Force-kill leftovers as a process tree** if the graceful stop left the host or workers behind (e.g. the observed PIDs):
   ```powershell
   taskkill /PID 42432 /T /F     # /T kills the whole tree, incl. worker 23768
   ```
   Repeat `tasklist` until no dsh-owned node.exe remains. Once the owning processes have exited, the OS image lock on `koffi.node` is gone.
4. **Install with an explicitly pinned version** (see §3 for why pinning is mandatory):
   ```powershell
   npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
   ```
5. **Verify, then restart**:
   ```powershell
   dsh --version    # must print 0.1.2-alpha.5
   ```
   Only then start the dsh web host again.

(If a previous failed attempt left a stale staging directory such as `@deepseek-ai\.dsh-TMPDIR` under the global `node_modules`, remove it before retrying so npm starts from a clean state.)

---

## 2. Attempt 2 root cause — the silent downgrade to `0.1.1-rc.2`

### What the evidence shows

`attempt2-downgrade.log` (after dsh was stopped, so no EBUSY this time):

```
$ npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
(installs fine, but...)
$ dsh --version
0.1.1-rc.2
```

`npm-dist-tags.txt` (registry state at that time):

```
{
  next:  '0.1.1-rc.2',
  latest: '0.1.1-rc.2',
  alpha:  '0.1.2-alpha.5'
}
```

### Why it resolved to rc.2

- The plugin README's combined command names the package **unpinned**: bare `@deepseek-ai/dsh`, with no version, range, or tag.
- npm resolves a bare `pkg` spec to whatever the package's **`latest` dist-tag** points at. It does **not** look at what you currently have installed, and it does **not** pick "the newest version on the registry". At the time, `latest = 0.1.1-rc.2`. So npm dutifully installed `0.1.1-rc.2` over the previous global tree — a perfectly successful install **of the wrong version**.
- `0.1.2-alpha.5` is a **prerelease**, published under the `alpha` dist-tag, deliberately **not** under `latest` (npm convention: prereleases are tagged to a channel — alpha/beta/next — so that default installs never pick them up automatically; likewise, semver ranges exclude prereleases unless explicitly requested). No unpinned or range-based install will ever reach alpha.5 on its own.
- Result: by semver ordering, `0.1.1-rc.2 < 0.1.2-alpha.4` (0.1.1 < 0.1.2), so the "upgrade" was in fact a **downgrade** below even the version that had been running. `dsh --version` printing `0.1.1-rc.2` is simply an accurate report of what npm installed.
- The dist-tag followed is therefore **`latest`** (which here happens to equal `next`, both `0.1.1-rc.2`). npm never "preserves" or "advances" the installed version on an unpinned global install — it re-resolves from the registry every time.

Side note: the TUI plugin half of the combined command is not what broke; installing `@deepseek-harness-tui/dsh-tui` unpinned is the normal case for a plugin. The trap is exclusively the unpinned **core dsh** package riding along in the same command.

---

## 3. Exact safe upgrade commands for this situation (want: dsh 0.1.2-alpha.5 + the TUI plugin)

Run all of this in a **standalone terminal**, after dsh is fully stopped and verified gone per §1 (steps 1–3).

```powershell
# 0) Make sure no dsh node.exe processes remain (host + workers) — see §1.
tasklist /FI "IMAGENAME eq node.exe"

# 1) Check what the registry tags actually point to right now (tags can move):
npm view @deepseek-ai/dsh dist-tags
npm view @deepseek-harness-tui/dsh-tui dist-tags

# 2) Install with EXPLICIT pins — never bare @deepseek-ai/dsh while on a prerelease channel.
#    Exact version is the safest form:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<X.Y.Z>
#    (<X.Y.Z> = the TUI version its README states is compatible with dsh 0.1.2-alpha.5;
#     if the plugin has no channel constraints, plain @deepseek-harness-tui/dsh-tui is acceptable —
#     the downgrade trap only applies to the core dsh package.)
#    Channel-tag alternative (resolves to whatever 'alpha' points at today — less reproducible):
# npm install -g @deepseek-ai/dsh@alpha @deepseek-harness-tui/dsh-tui

# 3) Verify BEFORE restarting dsh:
dsh --version
#    -> must print 0.1.2-alpha.5. If it prints 0.1.1-rc.2, the wrong spec was installed; redo step 2.
npm ls -g @deepseek-ai/dsh --depth=0    # cross-check the global tree

# 4) Restart the dsh web host; reload/reinstall your community Web plugins only if they
#    report incompatibility with the new core.
```

Rules of thumb encoded above:
- **Stop first, then install** — a running dsh host guarantees EBUSY on `koffi.node`; a browser refresh is not a stop.
- **Pin the core package** — exact version (`@0.1.2-alpha.5`) preferred; channel tag (`@alpha`) acceptable; **bare package name forbidden** for anyone on a prerelease, because it means `latest`.
- **Verify with `dsh --version` immediately after install**, before trusting the upgrade.

---

## 4. Prevention — what plugin README authors should change

The README's combined one-liner (`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`) is the trap: it silently re-resolves the **core** package to the `latest` dist-tag, downgrading every user who is on an alpha/beta/next channel. Recommendations, strongest first:

1. **Do not include the dsh core package in plugin install commands at all.** The plugin install only needs the plugin:
   ```
   npm install -g @deepseek-harness-tui/dsh-tui
   ```
   Document the core requirement separately as a compatibility statement ("requires dsh >= 0.1.2-alpha.5; check with `dsh --version`"), plus a link to the official dsh upgrade instructions. Installing a plugin does not touch dsh's locked native files, so this also sidesteps the EBUSY trap entirely.
2. **If a combined command is kept, never leave the core spec unpinned.** Use the dist-tag of the channel the plugin actually supports (e.g. `@deepseek-ai/dsh@alpha`) or an exact version, and add a warning box: "Bare `@deepseek-ai/dsh` installs the `latest` tag and will **downgrade** users on prerelease channels."
3. **Tell users to check what they have and what the tags mean before upgrading**:
   ```
   dsh --version
   npm view @deepseek-ai/dsh dist-tags
   ```
   and to keep their current core if it is newer than what the command would install; re-verify with `dsh --version` afterwards.
4. **Document the stop-then-upgrade prerequisite** (the EBUSY half of the trap): the dsh web host must be fully exited — not just the browser page refreshed, not just sessions stopped — before any global install that touches dsh's files, because the host process holds an OS lock on the native `koffi.node` addon until it exits; use an external terminal and `tasklist`/`taskkill /T` guidance as in §1.
5. **Ship a version-aware install snippet or helper** (e.g. an install script that reads `dsh --version`, compares against the plugin's supported range, and either installs only the plugin or pins the core explicitly). If the ecosystem provides peer-dependency metadata for "supported dsh version", declare it there so tooling can flag mismatches instead of silently re-installing the core.

---

## Summary table

| Attempt | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `EBUSY copyfile koffi.node` | dsh web host (node.exe PID 42432, plus worker 23768) has the native koffi addon memory-mapped; Windows image-locks it until process exit. Browser refresh only reloads the SPA client, never the host process. | Fully stop host **and** workers from an external terminal (`tasklist` → graceful stop → `taskkill /PID <pid> /T /F`), verify none remain, then install. |
| 2 | `dsh --version` → `0.1.1-rc.2` after "upgrade" | Bare `@deepseek-ai/dsh` resolves to the `latest` dist-tag = `0.1.1-rc.2`; alpha.5 is published only under the `alpha` tag, so the combined README command installed an **older** version (downgrade). | Pin exactly: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` (or `@alpha`), verify with `dsh --version` before restart. |
