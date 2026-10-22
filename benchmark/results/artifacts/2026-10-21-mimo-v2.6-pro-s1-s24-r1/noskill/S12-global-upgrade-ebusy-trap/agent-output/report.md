# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Date: 2026-10-21T14:46:44+08:00
Scope: read-only analysis of `/app/fixture/` (evidence pack). No migrations, installs, or network access performed; fixture untouched.

## Evidence reviewed (fixture, read-only)

| File | What it shows |
|---|---|
| `attempt1-ebusy.log` | `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` → npm error **EBUSY**, syscall `copyfile`, src `...\@koromix\koffi-win32-x64\win32_x64\koffi.node`, dest under `...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node` |
| `running-processes.txt` | 3 × `node.exe`: PID 42432 = **dsh web host (holds koffi.node)**; PID 23768 = agent session worker; PID 23920 = the npm install itself. Notes that the host loaded `@koromix/koffi` at startup and that a browser refresh only reloads the SPA |
| `attempt2-downgrade.log` | unpinned combined install `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` "installs fine", then `dsh --version` → **`0.1.1-rc.2`** |
| `npm-dist-tags.txt` | `next: 0.1.1-rc.2`, `latest: 0.1.1-rc.2`, `alpha: 0.1.2-alpha.5` |

---

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

**What holds the lock.** `koffi.node` is a **native addon** (a compiled x64 Windows image) belonging to `@koromix/koffi`, the FFI library the dsh web host uses for its sandbox/filesystem operations. On Windows, once a PE image (`.dll`/`.node`) is **loaded into a process**, the loader maps it as an image section and the file is held open with a sharing lock for the *lifetime of that process*. Per `running-processes.txt`, the holder is **PID 42432, the dsh web host `node.exe`**, which loaded `@koromix/koffi` at startup. (The agent session worker PID 23768 may also have it mapped; the npm process itself, PID 23920, is only the writer.)

**Why the upgrade fails.** npm's global install stages/rewrites the package tree (the log's dest is npm's staging dir `@deepseek-ai\.dsh-TMPDIR\...`); every copy-over or rename of a loaded image file is refused by the OS with **EBUSY** (a sharing violation surfaces as EBUSY on npm's `copyfile`). npm cannot resolve this — the file is legitimately in use.

**Why a browser-page refresh does NOT free it.** The browser tab holds no file handle at all. Refreshing (or closing) the page only reloads/reaps the **SPA frontend**; the **dsh web host `node.exe` (PID 42432) is a separate, long-lived process** that keeps running with `koffi.node` still mapped. The image-section lock is released **only when every process that loaded the module exits**. So: refresh ≠ stop; closing the tab ≠ stop; even "stopping the web UI" in the browser ≠ stop.

**Correct stop-then-upgrade sequence.**
1. **Terminate the whole dsh host process tree** — quit dsh from its tray/CLI exit path (`dsh stop`, or Task Manager → end the host `node.exe`, PID 42432 in the capture), and also stop any agent session worker `node.exe` (PID 23768) if it loaded koffi. Do **not** rely on the browser.
2. **Verify nothing holds the file**: `tasklist /FI "IMAGENAME eq node.exe"` must show no dsh host; ideally `handle.exe koffi.node` (Sysinternals) or Process Explorer → "Find DLL" on `koffi.node` must return **zero** processes.
3. Only then run the pinned upgrade (see §3).
4. Verify the resulting version before restarting (see §3), then start dsh again.

---

## 2. Attempt 2 root cause — silent downgrade to `0.1.1-rc.2`

**What the unpinned spec resolves to.** The plugin README's combined command installs `@deepseek-ai/dsh` with **no version and no dist-tag**:
```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```
An untagged/unversioned spec is resolved by npm to the version the **`latest` dist-tag** points at — nothing else. Per `npm-dist-tags.txt` at that moment:

- `latest: 0.1.1-rc.2`  ← what the unpinned install follows
- `next:   0.1.1-rc.2`
- `alpha:  0.1.2-alpha.5`  ← the wanted release lives **only** on this tag

So `@deepseek-ai/dsh` → **0.1.1-rc.2**, exactly what `dsh --version` printed.

**Why.**
1. **Dist-tag semantics**: `pkg` with no version = `pkg@latest`. npm does *not* choose the highest semver, does *not* keep the currently installed version, and does *not* "upgrade" — it installs whatever the tag names. Here the tag names 0.1.1-rc.2.
2. **Why `latest` is behind**: the maintainer published `0.1.2-alpha.5` to the **`alpha`** channel only and left `latest` on the older `0.1.1-rc.2` (prerelease/alpha builds are deliberately kept off `latest`). The three mirrors of the plugin README all quote the same channel-agnostic combined command.
3. **Why it is a downgrade and succeeds silently**: your installed version was `0.1.2-alpha.4`, which is semver-greater than `0.1.1-rc.2` (0.1.2 > 0.1.1). npm happily replaces the newer prerelease with the older one, exits 0, and reports success — the only way to notice is the post-install version check.

Net effect: attempt 2 traded an *explicit* failure (EBUSY) for a *silent* regression (0.1.2-alpha.4 → 0.1.1-rc.2).

---

## 3. Exact safe upgrade commands (want dsh 0.1.2-alpha.5 + the TUI plugin)

All commands run in an **elevated** shell on Windows, after the host is stopped.

```bat
:: 0) STOP dsh completely — host process must EXIT (browser refresh is not enough)
dsh stop
::    verify no dsh node host remains (and no node.exe holding koffi.node):
tasklist /FI "IMAGENAME eq node.exe"
::    optional but airtight: handle.exe koffi.node   -> must print nothing

:: 1) Upgrade dsh to EXACTLY alpha.5 — pin the version, never rely on 'latest'
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

:: 2) VERIFY immediately — guard against silent downgrade
dsh --version
::    must print 0.1.2-alpha.5 ; if not, do not start dsh, re-check the pin

:: 3) Install the TUI plugin — pin it too (pick the version you tested)
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm install -g @deepseek-harness-tui/dsh-tui@<exact-tested-version>
::    e.g. npm install -g @deepseek-harness-tui/dsh-tui@1.2.3

:: 4) Verify the global tree, then restart dsh
npm ls -g --depth=0
dsh start
```

One-liner equivalent (still pinned on **both** packages):

```bat
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-tested-version>
```

Notes:
- `@deepseek-ai/dsh@alpha` would also resolve to 0.1.2-alpha.5 *today*, but dist-tags are mutable; the **exact pin `@0.1.2-alpha.5`** is the only durable, reproducible choice.
- Never issue an unpinned `npm install -g @deepseek-ai/dsh`: it will track `latest` (currently the *older* 0.1.1-rc.2) and silently downgrade.
- The TUI plugin may have its own dependency on `@deepseek-ai/dsh`; installing it pinned avoids it dragging a `latest`-channel dsh back in. The final `dsh --version` check after **all** installs is the required guard.

---

## 4. Prevention — what plugin README authors must change

1. **Never ship an unpinned global install command.** Always pin an exact version per package: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @scope/plugin@x.y.z`. At minimum use an explicit dist-tag (`@alpha`), never bare `pkg`.
2. **Pin every package in a combined command independently.** One unpinned package in a multi-package install is enough to trigger the trap; the pin on the plugin does not protect the core.
3. **Match the channel the README talks about.** If the doc tells users to move to a prerelease (alpha/beta/rc), the command must name that prerelease explicitly, because such builds are (correctly) not on `latest`.
4. **State the Windows stop requirement next to the command**: "Stop the running dsh host (exit the app / `dsh stop`); closing or refreshing the browser does **not** release the native `koffi.node` image lock." Optionally give the verification (`handle.exe koffi.node` → empty).
5. **Include a post-install verification step** with the expected output (`dsh --version` → `0.1.2-alpha.5`). npm exits 0 even when it "succeeded" at the wrong version, so the version check is the only tripwire.
6. **Keep install snippets release-synced** — generate/update the pinned version in the README at release time (or document `npm view <pkg> dist-tags` as the discovery step) so docs never quote a command that resolves to a different channel than the surrounding prose.
7. **Document the channels** (`latest` vs `alpha` / `next`) once, so users understand that bare `pkg` follows `latest` and does not preserve or advance whatever they already have.

## run-stats

- toolcalls total: 9 run_code invocations (17 inner tool calls: 3 pwsh, 5 read, 3 write, 4 edit, 1 grep, 1 send_message)
- token usage: n/a (not exposed to the solver)
- completion time: 2026-10-21T14:46:44+08:00
