# S12 Report — Global Upgrade EBUSY + Downgrade Trap

Environment: Windows, dsh `0.1.2-alpha.4` running, six community Web plugins from three GitHub mirrors.
Goal: upgrade to `dsh-v0.1.2-alpha.5` and add the TUI plugin. Two failed attempts diagnosed below from the
evidence pack (`attempt1-ebusy.log`, `running-processes.txt`, `attempt2-downgrade.log`, `npm-dist-tags.txt`).

---

## 1. Attempt 1 — EBUSY on `koffi.node`: who holds the lock

**Root cause: the dsh web host process holds an OS-level file lock on `koffi.node` because it loaded the
native addon into its own process image at startup.**

Evidence chain (`running-processes.txt`):

```
node.exe  42432  Console   <- dsh web host (holds koffi.node)
node.exe  23768  Console   <- agent session worker
node.exe  23920  Console   <- npm install -g (attempting the copy)
```

`npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` failed with:

```
npm error code EBUSY
npm error syscall copyfile
npm error path C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node
```

- `koffi.node` is a native `.node` binary (the `@koromix/koffi` FFI addon used by dsh for sandbox/filesystem
  operations). The dsh web host (PID 42432) loaded it via the OS loader at startup.
- On Windows, a file loaded as a native module is mapped into the process (image section). While any live
  process has it mapped, the OS refuses operations that would replace or rewrite that file — npm's
  `copyfile` during the global reinstall hits exactly that and npm surfaces it as `EBUSY`. The lock belongs
  to the **process**, not to any user session or browser.
- PID 23920 is npm itself (a node process, but it does not load koffi — it is the victim, not the holder).
  PID 23768 is an agent session worker; any dsh-spawned worker that has loaded native addons holds the same
  kind of lock, so the safe procedure below stops the whole dsh runtime, not just the host.

**Why a browser-page refresh does not free the lock**

Refreshing the browser page only reloads the SPA (HTML/JS/static assets served over HTTP by the host). The
browser never loaded `koffi.node`; the lock is held inside the still-running host process (PID 42432),
which re-reads nothing and unloads nothing when a page refreshes. Even closing the browser entirely would
not help. The lock is released by exactly one event: **the holder process exiting.**

**Correct stop-then-upgrade sequence**

1. Fully stop the dsh runtime: stop the web host/daemon **and** all running dsh agent sessions/workers
   (any process that may have loaded dsh's native addons).
2. Verify nothing is left holding files: `tasklist /FI "IMAGENAME eq node.exe"` should show no dsh-related
   node processes (the npm process you are about to run doesn't count).
3. Run the pinned install (see §3).
4. Verify `dsh --version` prints the expected version.
5. Start dsh again (host, then sessions) — it will load the freshly installed `koffi.node`.

---

## 2. Attempt 2 — why `dsh --version` printed `0.1.1-rc.2` instead of `alpha.5`

**Root cause: the unpinned `@deepseek-ai/dsh` in the combined command resolves to the `latest` dist-tag,
and `latest` is `0.1.1-rc.2` — so npm installed an older version over the running alpha, without warning.**

Evidence:

```
$ npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui   (installs fine)
$ dsh --version
0.1.1-rc.2
```

```
$ npm view @deepseek-ai/dsh dist-tags
{
  next:   '0.1.1-rc.2',
  latest: '0.1.1-rc.2',
  alpha:  '0.1.2-alpha.5'
}
```

- A bare package name in `npm install -g` is exactly `npm install -g @deepseek-ai/dsh@latest`. Resolution is
  a **dist-tag lookup**, not "highest semver in the registry". `latest` pointed at `0.1.1-rc.2`, so that is
  what was installed. (`@next` would also have given rc.2; only the `alpha` tag points at `0.1.2-alpha.5`.)
- npm global install does **not** preserve or advance your currently installed version. It installs whatever
  the specifier resolves to, and it downgrades silently — no confirmation, no error.
- Why `latest` didn't pick alpha.5: `0.1.2-alpha.5` is a prerelease published under the non-default `alpha`
  tag. Registry resolution ignores prereleases unless you name the tag or pin the exact version. Semver
  ordering confirms the direction of the trap: `0.1.1-rc.2 < 0.1.2-alpha.4 < 0.1.2-alpha.5`, so the
  "successful" install was actually a **double downgrade** (from alpha.4 to rc.2 — and it would have been a
  downgrade even if attempt 1 had succeeded and you were on alpha.5).
- Net effect: attempt 2 "went through fine" and quietly replaced alpha.4 with rc.2. The install mechanics
  worked; the version selection was wrong.

---

## 3. Exact safe upgrade commands for this situation

You are currently on the accidentally installed `0.1.1-rc.2`. Run these in order (cmd/PowerShell):

```bat
:: 1. Stop dsh completely: stop the web host/daemon and close all running dsh
::    agent sessions/workers (per your dsh docs), then verify:
tasklist /FI "IMAGENAME eq node.exe"
::    -> no dsh-related node.exe may remain. Only proceed once the list is clean.

:: 2. Install the exact target version of dsh, plus the TUI plugin:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

:: 3. Confirm you actually got alpha.5 BEFORE starting dsh:
dsh --version
::    must print: 0.1.2-alpha.5

:: 4. Start dsh again (web host, then sessions) and reopen your browser tab.
```

Key details:

- The pin **`@deepseek-ai/dsh@0.1.2-alpha.5`** is the whole fix for attempt 2. `@deepseek-ai/dsh@alpha`
  would also resolve to alpha.5 today, but an exact version is immune to the `alpha` tag being moved later.
- Do **not** drop the pin back to `@deepseek-ai/dsh` — that reinstalls the `0.1.1-rc.2` downgrade again.
- The TUI package (`@deepseek-harness-tui/dsh-tui`) is unpinned here because its dist-tags were not in the
  evidence pack; it installed fine in attempt 2. If you want reproducibility there too, first run
  `npm view @deepseek-harness-tui/dsh-tui dist-tags` and pin the version you want.
- Step 1 is the fix for attempt 1: as long as the dsh host is running, `koffi.node` stays locked and the
  install fails with EBUSY again.
- If you had customized anything inside the global install directory, note this replaces the dsh package
  tree (your six community Web plugins live in dsh's plugin directories — they are not reinstalled by this
  command; check they still load after restart).

---

## 4. Prevention — what plugin README authors should do differently

The trap is a bare package name in an install command meeting a stale `latest` dist-tag. README authors
should:

1. **Pin the exact version in every install/upgrade command.** Write
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`, never `npm install -g @deepseek-ai/dsh`. If a release
   line is intended, use its explicit tag (`.../dsh@alpha`) — but only if you control/verify that tag,
   because tags move; exact versions do not.
2. **Never rely on `latest` in copy-paste commands.** `latest` is whatever the maintainer last tagged (here
   it lagged at `0.1.1-rc.2` while the recommended release was `0.1.2-alpha.5`). An unpinned README command
   silently *downgrades* any user on a newer prerelease.
3. **Keep pins through combined one-liners.** Combining packages is fine —
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<pinned>` — but every
   package in the command needs its own pin; one bare name poisons the whole line.
4. **Put the stop-first step in upgrade docs for anything shipping native addons.** Packages with `.node`
   binaries (koffi etc.) cannot be replaced while a process has them loaded on Windows. READMEs should state
   the ordered procedure explicitly: stop the app → verify no leftover processes (`tasklist`) → install →
   verify version → start. That also inoculates users against the "just refresh the browser" red herring.
5. **Add a version assertion after install.** A `dsh --version` check with the expected output turns a
   silent downgrade (attempt 2) into an immediately visible failure.
6. **Maintainer-side counterpart:** publish prereleases under a non-`latest` tag (`npm publish --tag alpha`)
   and move `latest` deliberately, so `latest` never points older than the version your own READMEs
   recommend.
