# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

## 1. Attempt 1 root cause — why `koffi.node` is EBUSY

**What holds the lock:** the running **dsh web host process** (PID 42432 in `running-processes.txt`). `koffi.node` is a native Windows addon binary (@koromix/koffi, an FFI library dsh uses for sandbox/filesystem operations). On Windows, when a process loads a native `.node` DLL via `LoadLibrary`, the OS keeps the file locked (it is memory-mapped as an executable image) until **the process exits**. npm's `copyfile` from `@koromix\koffi-win32-x64\win32_x64\koffi.node` therefore fails with `EBUSY` because the destination copy in the global install tree cannot replace a file that a live process has mapped.

**Why a browser-page refresh does not free it:** the browser page is only the SPA client. The koffi addon is loaded inside the **Node host process**, not in the browser. Refreshing the page merely reloads the Web UI and reconnects; the host Node process stays alive the whole time, so the file stays locked. (Note the agent session worker, PID 23768, is a separate process; the evidence marks the *web host* as the koffi holder — but any process that loaded koffi must exit.)

**Correct stop-then-upgrade sequence:**

1. Finish/stop any running agent sessions (they may also hold addon copies via their workers).
2. Fully exit the dsh web host process (and the TUI/CLI if any) — verify with `tasklist` that the dsh Node processes are gone. Closing the browser tab alone is not sufficient.
3. Only then run `npm install -g @deepseek-ai/dsh@<exact-version>`.
4. Restart dsh and verify with `dsh --version`.

## 2. Attempt 2 root cause — why `dsh --version` shows `0.1.1-rc.2`

The README's combined command installs an **unpinned** `@deepseek-ai/dsh`:

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

An unpinned `npm install -g <pkg>` does **not** preserve or advance the currently installed version. It resolves the spec against the registry and, with no tag qualifier, installs whatever the **`latest` dist-tag** points to. Per `npm-dist-tags.txt`:

- `latest` → `0.1.1-rc.2`
- `next` → `0.1.1-rc.2`
- `alpha` → `0.1.2-alpha.5`

So the install "succeeded" but silently **downgraded** the global install from `0.1.2-alpha.4` to `0.1.1-rc.2`, because `latest` is older than the alpha channel the user was on. Pre-release versions (`0.1.2-alpha.x`) are also never matched by bare semver ranges/`latest` unless explicitly tagged — the user must either pin the exact version or the `@alpha` tag.

## 3. Exact safe upgrade commands (want alpha.5 + TUI plugin)

```powershell
# 1. Stop all dsh processes (web host, TUI, agent workers); verify none remain
tasklist /FI "IMAGENAME eq node.exe"

# 2. Install the exact version and the TUI plugin together, pinned
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

# 3. Verify
dsh --version   # must print 0.1.2-alpha.5
```

Alternative pin: `@deepseek-ai/dsh@alpha` (the `alpha` dist-tag currently points at `0.1.2-alpha.5`), though pinning the **exact version** is safest against future alpha releases moving the tag.

## 4. Prevention — guidance for plugin README authors

- **Never publish an unpinned bare package name as the install command.** `npm install -g @deepseek-ai/dsh` follows the `latest` dist-tag and can silently downgrade users on pre-release channels. Always pin: `npm install -g @deepseek-ai/dsh@<version>` (or a documented `@alpha` tag with a warning).
- **Include the stop-first step** in install/upgrade instructions: "fully exit dsh (web host and TUI) before upgrading; a browser refresh does not release native addons like koffi.node."
- **State the dist-tag semantics**: a bare name resolves to `latest`, which may be older than the version the user already runs — this is a downgrade trap, not an upgrade.
- Prefer documenting a single copy-paste sequence (stop → pinned install → `dsh --version` verify) rather than a combined command that hides the version choice.
