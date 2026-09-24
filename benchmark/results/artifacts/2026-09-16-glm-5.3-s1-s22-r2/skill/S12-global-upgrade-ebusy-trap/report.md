# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Task: diagnose two failed `npm install -g @deepseek-ai/dsh` upgrade attempts on Windows from the read-only evidence pack, and produce a safe upgrade procedure plus prevention guidance. Methodology: `plugin-upgrade` skill, "Global DSH host upgrades (agent discipline)" section; this is a read-only analysis (Mode A-style), no migrations or installs were executed.

## Evidence base

- `attempt1-ebusy.log` — `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` fails with `EBUSY` on `copyfile` of `@koromix/koffi-win32-x64/win32_x64/koffi.node` into npm's `.dsh-TMPDIR` staging directory.
- `running-processes.txt` — at the moment of attempt 1 three node.exe processes existed: the **dsh web host** (PID 42432), an **agent session worker** (PID 23768), and the **npm install** itself (PID 23920). The host had loaded `@koromix/koffi` (native FFI addon) at startup.
- `attempt2-downgrade.log` — after stopping dsh, the combined command `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` (copied from a plugin README) completed, but `dsh --version` printed `0.1.1-rc.2`.
- `npm-dist-tags.txt` — dist-tags at the time: `latest: 0.1.1-rc.2`, `next: 0.1.1-rc.2`, `alpha: 0.1.2-alpha.5`.

## 1. Attempt 1 — why `koffi.node` was EBUSY

**What holds the lock:** the running **dsh web host process** (node.exe PID 42432). `koffi.node` is a native Windows addon (`.node` = DLL). The dsh host loads it at startup for sandbox/filesystem FFI operations. On Windows, a loaded DLL is mapped into the process and the OS keeps it open/locked — the file cannot be replaced, moved, or copied-over while any process has it loaded. When npm's installer tried to stage/replace `koffi.node` inside the global package tree, `CopyFile` returned `EBUSY`.

The agent session worker (PID 23768) is a second long-lived dsh process that also belongs to the host's process tree and must be stopped too, but the direct lock holder per the fixture annotation is the web host.

**Why a browser refresh does not free it:** the browser page is just the SPA frontend served over HTTP. Refreshing it reloads the client-side app in the browser; the *host* node.exe process — the one that loaded `koffi.node` — keeps running untouched. The lock lives in the OS handle table of that process and is released only when the process **exits**. A refresh never terminates the host.

**Correct stop-then-upgrade sequence:**

1. Fully stop every dsh process — the web host and all agent/session workers (verify with `tasklist` / `Get-Process node` that no dsh-owned node.exe remains). A browser refresh is **not** a host stop.
2. From an **external** terminal, run the **pinned** install: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
3. Restart `dsh web`, hard-refresh the browser, then verify with `dsh --version` → `0.1.2-alpha.5` and check plugin status.

Because the host is stopped before npm runs, nothing can crash mid-install — a crash during upgrade is a signature of doing it wrong, not a tolerated risk.

## 2. Attempt 2 — why `dsh --version` showed `0.1.1-rc.2`

The README command used an **unpinned** package spec: `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`. With no version specifier, npm resolves a bare package name to the **`latest` dist-tag**, not to "the currently installed version" and not to the highest published version. Per `npm-dist-tags.txt`, at that moment `latest` pointed to `0.1.1-rc.2`, while `0.1.2-alpha.5` was published only under the **`alpha`** dist-tag.

So the install "succeeded" by silently **downgrading** the host from `0.1.2-alpha.4` to `0.1.1-rc.2` — an older release line. This is exactly the trap: prerelease versions (like `0.1.2-alpha.*`) never become `latest` until explicitly promoted, so an unpinned "upgrade" can move you backwards.

- Dist-tag followed: **`latest`** (npm's default tag when no specifier is given).
- To get alpha.5 by tag you would need `@deepseek-ai/dsh@alpha`; the safest form is the exact version `@deepseek-ai/dsh@0.1.2-alpha.5`.

## 3. Exact safe upgrade commands for this situation

Target: host `0.1.2-alpha.5` plus the TUI plugin, on Windows.

```powershell
# 1. Fully stop dsh (host + session workers), then verify nothing is left
tasklist /FI "IMAGENAME eq node.exe"     # no dsh-owned node.exe should remain

# 2. From an EXTERNAL terminal: pinned host version + pinned plugin
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

# 3. Restart and verify
dsh web
dsh --version        # must print 0.1.2-alpha.5
```

Notes:
- Pin the **exact version** (`@0.1.2-alpha.5`); do not rely on `@alpha` either — dist-tags move. (If you prefer tag-based, `@alpha` is correct *today* but re-pinning to the exact version is unambiguous and reproducible.)
- If an install was interrupted (like attempt 1), repair by re-running the pinned formal install from an external shell — never hand-copy package directories or hand-write shims.
- After upgrade, confirm the TUI plugin is actually composed/active in the target profile, not merely installed.

## 4. Prevention — what plugin README authors should do differently

The trap came from a README's "official combined command" that was **unpinned**. Recommendations for install-command authors:

1. **Always pin the host package to an explicit version or a named dist-tag** in any command that installs `@deepseek-ai/dsh` alongside the plugin, e.g. `npm install -g @deepseek-ai/dsh@<exact-version> @your-plugin`. A bare `@deepseek-ai/dsh` silently follows `latest`, which can be older than what the user already runs.
2. **Never present the install command as an upgrade path.** Separate "fresh install" from "upgrade" instructions, and state that upgrades must (a) fully stop dsh first (native addon file locks → EBUSY) and (b) pin the exact target version.
3. **Warn that dsh must be stopped** before `npm install -g` on Windows, and that refreshing the browser does not stop the host.
4. If the plugin requires a minimum host version, express it as a documented prerequisite ("requires dsh ≥ 0.1.2-alpha.4") rather than embedding an unpinned co-install that may downgrade the host.
5. Show a post-install verification step (`dsh --version`) so a silent downgrade is caught immediately.

## Validation status

- Read-only analysis only; fixture untouched; no installs, migrations, or external services used.
- Cross-checked against the `plugin-upgrade` skill's global-host-upgrade discipline section (stop → external pinned install → restart & verify).

## Completed / Skipped / Pending

- **Completed:** both root-cause diagnoses, safe upgrade commands, prevention guidance.
- **Skipped:** none of the requested items.
- **Pending/residual risk:** the TUI plugin's exact host-compatibility range for 0.1.2-alpha.5 was not verifiable from the fixture (no registry access allowed); the user should confirm the plugin supports alpha.5 after install.
