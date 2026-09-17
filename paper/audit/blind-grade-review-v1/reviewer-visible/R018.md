# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnostic Report

Environment: Windows, running dsh 0.1.2-alpha.4, six community Web plugins across three GitHub mirrors. Target release: 0.1.2-alpha.5. Evidence: attempt1-ebusy.log, attempt2-downgrade.log, npm-dist-tags.txt, running-processes.txt (read-only fixture pack).

## 1. Attempt 1 root cause — EBUSY on koffi.node

**Evidence.** attempt1-ebusy.log:

    $ npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
    npm error code EBUSY
    npm error syscall copyfile
    npm error path C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node
    npm error dest C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node

running-processes.txt shows who holds the file:

    node.exe  42432  <- dsh web host (holds koffi.node)
    node.exe  23768  <- agent session worker
    node.exe  23920  <- npm install -g (attempting the copy)

**Diagnosis.** The **dsh web host process itself** (PID 42432), together with its agent session worker (PID 23768), loaded the native FFI addon @koromix/koffi (koffi.node, used for sandbox/filesystem operations) at startup. On Windows, a loaded native .node binary is locked by the OS and cannot be overwritten or copied over until the loading process exits. npm's copy of the new package tree into the global install therefore fails with EBUSY on copyfile.

**Why a browser refresh does not help.** Refreshing the browser page only reloads the SPA client; the host Node process that actually loaded koffi.node stays alive, so the OS file lock persists. Only process exit releases it — and that includes **all** dsh processes, not just the visible web host (the agent session worker is a separate node.exe).

**Correct stop-then-upgrade sequence** (per the plugin-upgrade skill's global-host discipline, matching the fixture's own annotation):

1. Fully stop every dsh process — the host (PID 42432), any agent session workers (PID 23768), and any other dsh-owned node processes. Verify with `tasklist /FI "IMAGENAME eq node.exe"` that nothing dsh-owned remains.
2. From an **external terminal** (never from inside a dsh session — an in-session host upgrade removes the very package tree the session executes from and dies mid-install), run the pinned install (see §3).
3. Restart `dsh web`, hard-refresh the browser, verify version markers and that the plugins are active.

Because the host is fully stopped before npm runs, nothing can crash mid-install; a crash during the upgrade is a signature of doing it wrong.

## 2. Attempt 2 root cause — `dsh --version` shows 0.1.1-rc.2

**Evidence.** attempt2-downgrade.log:

    $ npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
    (installs fine, but...)
    $ dsh --version
    0.1.1-rc.2

npm-dist-tags.txt:

    {
      next: '0.1.1-rc.2',
      latest: '0.1.1-rc.2',
      alpha: '0.1.2-alpha.5'
    }

**Diagnosis.** The command omitted the version specifier — the package name @deepseek-ai/dsh is **unpinned**. An unpinned install resolves to the **`latest` dist-tag**, which at that moment pointed to 0.1.1-rc.2, not 0.1.2-alpha.5. The pre-release line lives on a separate tag: 0.1.2-alpha.5 is only on the `alpha` tag (and `next` also points at the older 0.1.1-rc.2). So the install "succeeded" while **silently downgrading** from 0.1.2-alpha.4 to 0.1.1-rc.2. An unpinned install neither preserves nor advances the previously installed version — it follows `latest`, with no semver-range resolution against what is installed. The TUI plugin half (@deepseek-harness-tui/dsh-tui) was fine; only the dsh core specifier was wrong.

## 3. Exact safe upgrade commands

From an external terminal, with every dsh process fully stopped (per §1):

    :: 1. verify nothing dsh-owned is running
    tasklist /FI "IMAGENAME eq node.exe"

    :: 2. pinned core install to the exact target version
    npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

    :: 3. install the TUI plugin
    npm install -g @deepseek-harness-tui/dsh-tui

Or combined — the pin must be kept even in a combined command (that pin is exactly what attempt 2 lacked):

    npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

Then verify before restarting:

    dsh --version        :: must print 0.1.2-alpha.5

Finally restart `dsh web`, hard-refresh the browser, and confirm the six community plugins plus the TUI plugin are active. If a previous attempt was interrupted, repair by re-running the pinned formal install from an external shell — never hand-copy package directories or hand-write shims. (Alternative: `npm install -g @deepseek-ai/dsh@alpha` would also fetch 0.1.2-alpha.5 per npm-dist-tags.txt, but the exact-version pin is safer against tag movement.)

## 4. Prevention — guidance for plugin README authors

- **Never publish bare, unpinned global install commands** such as `npm install -g @deepseek-ai/dsh @scope/plugin`. A bare name resolves to the `latest` dist-tag, which for pre-release-era registries can be an *older* release line — users silently downgrade. Pin the exact version: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui`, or at minimum pin the tag that actually carries the intended line (`@deepseek-ai/dsh@alpha`).
- **State the stop-then-upgrade sequence in the README**: fully stop all dsh processes (host + session workers) before installing; explicitly note that a browser refresh is *not* a host stop and does not release native-module locks (the koffi.node EBUSY).
- **Warn against upgrading from inside a dsh session**; instruct users to use an external terminal.
- **Add a post-install verification step**: `dsh --version` must print the intended version before restart; document the dist-tag that carries the version the README targets and keep the pinned command in sync with each release.
- Prefer a per-release "Upgrade" section with the exact pinned command over a one-time generic install line.

## Summary

- **Attempt 1**: EBUSY because the running dsh web host (PID 42432) and its agent session worker (PID 23768) hold the OS lock on the loaded native module koffi.node; a browser refresh only reloads the SPA and releases nothing. Fix: stop every dsh process, then install externally.
- **Attempt 2**: the unpinned @deepseek-ai/dsh followed the `latest` dist-tag, which pointed to 0.1.1-rc.2 (the `alpha` tag held 0.1.2-alpha.5), so the install silently downgraded. Fix: pin @0.1.2-alpha.5 explicitly, verify `dsh --version`, then restart and check plugins.
