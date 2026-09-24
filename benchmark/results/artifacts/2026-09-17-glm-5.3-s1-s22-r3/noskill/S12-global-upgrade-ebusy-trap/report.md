# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Task: S12-global-upgrade-ebusy-trap (read-only analysis of the evidence pack in the fixture directory).

## 1. Attempt 1 root cause — why koffi.node is EBUSY

**What failed:** `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` aborted with `EBUSY` on `copyfile` while copying the native addon `@koromix/koffi-win32-x64/win32_x64/koffi.node` from the npm cache into the global install staging directory (`@deepseek-ai/.dsh-TMPDIR/...`).

**Who holds the lock:** the running dsh web host process — `node.exe` PID 42432 in running-processes.txt. That process loaded koffi (the native FFI addon used for sandbox/filesystem operations) at startup. On Windows, a loaded native `.node` PE image is held with a mandatory share lock by the OS: the file cannot be renamed, replaced, or deleted while any process has it mapped. The upgrade needs to replace that exact file, so the copy fails with EBUSY.

The other two node processes are not the cause: PID 23768 (agent session worker) is only relevant if it also loaded koffi (likely, as a child of the same installation), and PID 23920 is the npm installer itself — the victim, not the holder.

**Why a browser-page refresh does not free the lock:** the browser page is only the SPA frontend. The koffi addon lives in the Node host process behind it. Reloading the page just re-fetches the web bundle and reconnects over WebSocket; the host process (PID 42432) — and the session workers it spawned — keep running with koffi still mapped. The lock is held by a process image, not by a page; only process exit releases it.

**Correct stop-then-upgrade sequence:**

1. Fully exit dsh: stop the web host (and any running sessions/agent workers) so every node process from the dsh installation terminates — verify with `tasklist` that no dsh node processes remain.
2. Then run the global install.
3. Restart dsh afterward; the new process loads the new koffi.node.

Upgrading while any dsh-derived process is alive will keep hitting EBUSY on Windows.

## 2. Attempt 2 root cause — the silent downgrade

**What happened:** after a clean stop, the user ran the "official combined command" from a plugin README:

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

This installed successfully but left `dsh --version` at `0.1.1-rc.2` instead of `0.1.2-alpha.5`.

**Why:** `@deepseek-ai/dsh` with no version specifier is resolved by npm against the registry dist-tags, and unpinned `npm install <pkg>` resolves to the **`latest`** dist-tag. Per npm-dist-tags.txt, at that moment:

- `latest` → `0.1.1-rc.2`
- `next` → `0.1.1-rc.2`
- `alpha` → `0.1.2-alpha.5`

So the unpinned spec resolved to 0.1.1-rc.2 and npm happily "upgraded" (actually downgraded from the user's alpha.4 line to rc.2 — a semantic downgrade the user never asked for). Unpinned install never preserves the currently installed version and does not advance to the newest published release; it blindly follows `latest`, whatever that tag points at. The alpha.5 build is only reachable via the explicit `@0.1.2-alpha.5` (or `@alpha`).

## 3. Exact safe upgrade commands for this situation

Goal: dsh 0.1.2-alpha.5 plus the TUI plugin.

```
# 1. Stop dsh completely (web host + all sessions/workers), confirm no node.exe from dsh remains:
tasklist /FI "IMAGENAME eq node.exe"

# 2. Install both packages with fully pinned versions:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

# 3. Verify before restarting:
dsh --version    # must print 0.1.2-alpha.5

# 4. Start dsh again.
```

If a pinned TUI version is required to match, check `npm view @deepseek-harness-tui/dsh-tui versions` (or its peerDependency range on `@deepseek-ai/dsh`) and pin it explicitly too. Never use the bare `npm install -g @deepseek-ai/dsh` form when tracking a pre-release line — `latest` does not point at alphas.

## 4. Prevention — guidance for plugin README authors

- **Always pin the dsh version in combined install commands.** A README that says `npm install -g @deepseek-ai/dsh <plugin>` silently forces every user onto whatever `latest` points at — which can be an older line than the user is running (exactly this trap). Either pin an exact tested version (`@deepseek-ai/dsh@0.1.2-alpha.5`) or document the tag explicitly (`@alpha`, `@next`) and say which one the plugin is tested against.
- **Never imply the command preserves or advances the user's installed version.** State plainly that an unpinned spec follows the `latest` dist-tag.
- **Document the Windows stop-first requirement.** Native addons like koffi.node are file-locked while any dsh process runs; READMEs should include "fully exit dsh (including the web host and all sessions) before upgrading, then verify with tasklist that no dsh node processes remain" for Windows users, and note that refreshing the browser page does not stop the host.
- **Separate "install the plugin" from "upgrade dsh".** A plugin README should not bundle an implicit dsh upgrade into its install line; recommend the plugin-only install when dsh is already present, and give the stop-then-pin-then-verify upgrade sequence separately.
- **Include a verification step** (`dsh --version`) in every documented install/upgrade procedure so a silent downgrade is caught immediately.

## Summary

- Attempt 1: EBUSY because the running dsh web host (PID 42432) had koffi.node loaded; Windows locks loaded native addons until the owning process exits; a page refresh reloads only the SPA and never releases the lock. Stop all dsh processes, then install.
- Attempt 2: the unpinned `@deepseek-ai/dsh` resolves to the `latest` dist-tag (0.1.1-rc.2), not the installed version and not the newest alpha; pin `@0.1.2-alpha.5` (or `@alpha`) explicitly.
- Safe path: exit dsh fully → `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui` → `dsh --version` → restart.
- Prevention: READMEs must pin versions/tags, document the Windows stop-first rule, avoid bundling implicit dsh upgrades, and end with a version check.
