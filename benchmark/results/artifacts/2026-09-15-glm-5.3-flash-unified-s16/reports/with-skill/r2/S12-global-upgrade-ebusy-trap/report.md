# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Evidence reviewed (read-only, from `/app/fixture/`): `attempt1-ebusy.log`, `attempt2-downgrade.log`, `npm-dist-tags.txt`, `running-processes.txt`. No installs, migrations, or fixture modifications were performed.

## 1 · Attempt 1 root cause: EBUSY on `koffi.node`

**Who holds the lock:** the running **dsh web host process** — `node.exe` PID **42432**, explicitly annotated in `running-processes.txt` as "dsh web host (holds koffi.node)". The host loaded `@koromix/koffi` (the native FFI addon `koffi.node` under `@koromix/koffi-win32-x64`) at startup. `koffi.node` is a native `.node` binary: once a process loads it, the OS (Windows) holds the module image file locked for the **lifetime of that process**. npm's `copyfile` of `koffi.node` into its staging directory therefore fails with `EBUSY` — matching `attempt1-ebusy.log` (`syscall copyfile`, path `...\@koromix\koffi-win32_x64\...\koffi.node`).

**Why a browser refresh does not free the lock:** the lock is held by the **host process**, not by the browser. Refreshing the page (or even closing the tab) only reloads the SPA served by the host; the host process keeps running with `koffi.node` mapped, so the OS lock persists. Nothing short of the process exiting releases it.

**Also note:** `running-processes.txt` shows an **agent session worker** (`node.exe` PID 23768) running from the same dsh install alongside the host (PID 42432) and the npm attempt itself (PID 23920). Every dsh node process must be stopped, not just the visibly "web" one — any process running from the global package tree can hold native-module locks.

**Correct stop-then-upgrade sequence** (per the plugin-upgrade skill, "Global DSH host upgrades"):

1. **Fully stop every dsh process** — quit the web host and any agent session workers (Ctrl+C in their consoles / stop the service). Verify nothing remains: `tasklist /FI "IMAGENAME eq node.exe"` should list no dsh-related node processes.
2. Run the install **from an external terminal, never from inside a dsh session** (an agent session IS the host process; npm would remove/replace the package tree it executes from and the host dies mid-install). Because the host is fully stopped first, nothing can crash mid-install — a crash during a global upgrade is the signature of doing it wrong, not a risk to tolerate.
3. Restart `dsh web`, hard-refresh the browser, and verify the version marker.

## 2 · Attempt 2 root cause: silent downgrade to `0.1.1-rc.2`

**What the unpinned package resolves to:** in

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

`@deepseek-ai/dsh` has **no version specifier**, so npm resolves the bare name to the **`latest` dist-tag**. Per `npm-dist-tags.txt` at the time:

```
next:   '0.1.1-rc.2'
latest: '0.1.1-rc.2'
alpha:  '0.1.2-alpha.5'
```

`latest` = **`0.1.1-rc.2`** — so the "combined command from the plugin README" reinstalled the host at `0.1.1-rc.2`, which is exactly what `dsh --version` then printed in `attempt2-downgrade.log`.

**Why this is a *downgrade* rather than a no-op:** a bare global install does not compare against (or preserve) the currently installed version — it simply installs whatever the `latest` dist-tag points at, even if that is *older* than what is already installed (here `0.1.2-alpha.4` → `0.1.1-rc.2`, one full minor line back). SemVer ordering is irrelevant to bare-name resolution; npm never consults the installed version. The wanted `0.1.2-alpha.5` sits on the **`alpha` dist-tag**, invisible to an unpinned install. The README's one-liner was fine for fresh installs but silently reverts any prerelease-track user to the `latest` stable line.

## 3 · Exact safe upgrade commands (target: alpha.5 + TUI plugin)

Current state after attempt 2: the host is **downgraded to 0.1.1-rc.2** and must be repaired with a pinned install. From an **external terminal** (not inside any dsh session):

```bat
:: 1) Fully stop dsh (web host + any agent session workers), then verify:
tasklist /FI "IMAGENAME eq node.exe"

:: 2) Pinned install of the host + the TUI plugin:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

::    (recommended: check and pin the TUI version too, so the whole command is reproducible)
npm view @deepseek-harness-tui/dsh-tui dist-tags
::    then: npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-version>

:: 3) Verify and restart:
dsh --version        :: must print 0.1.2-alpha.5
dsh web              :: restart the host, then HARD-refresh the browser (Ctrl+F5) and check plugins load
```

Notes:

- `@deepseek-ai/dsh@alpha` would also resolve to `0.1.2-alpha.5` today, but dist-tags move (the skill's records show `alpha` later repointed to the 0.1.3 line); **pin the exact version** for a reproducible, non-drifting install.
- Reassuring detail for this exact situation: alpha.5's card **DSH-0.1.2-A5-03** is precisely the fix for homes that passed through rc.2-era data ("upgrading a 0.1.1-rc.2 / 0.1.2-alpha.3 home to alpha.4 could refuse the boot or drop session titles; alpha.5 reads all three `session_projcache` generations"). So after the accidental rc.2 downgrade, go **straight to alpha.5 — not alpha.4**.
- If any install was interrupted mid-flight, repair by re-running the pinned formal install from an external shell — never hand-copy package directories or hand-write shims.

## 4 · Prevention: what plugin README authors should do differently

1. **Never publish a bare `npm install -g @deepseek-ai/dsh`** in any install/upgrade instruction. A bare name follows `latest`, which can lag the prerelease line and silently *downgrade* users who are on an alpha/rc track. Always pin the exact version: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
2. If a tag-based command is shown, **name the tag explicitly and say what it points at** (e.g. `@deepseek-ai/dsh@alpha` — "resolves to 0.1.2-alpha.5 as of <date>"), and re-verify whenever versions move.
3. **Separate "fresh install" from "upgrade" instructions.** An upgrade section must begin with: fully stop all dsh processes (web host *and* session workers; a browser refresh is not a host stop) before running the install — a running host holds native-module file locks (the EBUSY-on-`koffi.node` trap), and an install run from inside a dsh session kills the host mid-flight.
4. **State the expected post-install check**: `dsh --version` must print the exact pinned version; tell users to verify before declaring success (attempt 2 "succeeded" visibly yet installed the wrong version).
5. **Pin every package in multi-package one-liners** — or split the pinned host upgrade from plugin installs entirely — so that installing a plugin can never revert the host to `latest`.
