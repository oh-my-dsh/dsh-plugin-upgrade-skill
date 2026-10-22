# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis & Safe Procedure

Scope: read-only diagnosis from the evidence pack (`fixture/`). No installs, no migrations, no fixture
modification were performed. Fixture left unchanged.

---

## 1. Attempt 1 root cause — `EBUSY` on `koffi.node`

**What is locked and who holds it.** `koffi.node` is the native binary of the
`@koromix/koffi` package — a native FFI addon (`.node` = a DLL loaded into the Node
process via `LoadLibrary`/dlopen). The evidence in `running-processes.txt` is explicit:

- `node.exe PID 42432` — **the `dsh web` host**, annotated "holds koffi.node";
- `node.exe PID 23768` — the agent-session worker;
- `node.exe PID 23920` — the very `npm install -g` that is attempting the copy.

So the locker is the **running dsh web host process (PID 42432)**. It loaded the native
addon at startup, and on Windows a file that is mapped as a loaded image is held open with a
sharing mode that excludes write/delete — the OS refuses to replace or remove it for as long
as the process lives. The failure lands as `EBUSY` on the `copyfile` syscall because npm's
global reify stages the new tree in a temp dir (`.dsh-TMPDIR`) and copies from the
currently-installed `@koromix/koffi-win32-x64\win32_x64\koffi.node` (the source path in the
log), which is exactly the file the host has locked.

**Why a browser-page refresh does not free it.** A refresh only reloads the SPA — the client
JavaScript and assets served by the host over HTTP. It does **not** touch the host Node process
that owns the native-module handle. The lock lives in the host process, not in the browser tab,
so the lock persists across any number of refreshes.

**Correct stop-then-upgrade sequence.** The lock is released only when the host process exits.
The safe order is: fully stop every dsh process first (the web host **and** the agent-session
worker), verify they are gone, and only then run the install — from an **external** terminal,
never from inside the dsh session (the session IS the host process; installing the host from
inside itself is structurally fatal per the skill's host-upgrade discipline). A crash during the
upgrade is a signature of doing it wrong, not a risk to tolerate.

Cites: SKILL.md "Global DSH host upgrades (agent discipline)" (governing procedure);
rollup **R-12** (upgrade target may be the currently running host — pre-upgrade safety check);
troubleshooting.md EBUSY row / benchmark task **S12-global-upgrade-ebusy-trap** (koffi.node held
by the host PID; lock is in the host, not the browser; sequence is stop-host → replace → pinned
rollback).

---

## 2. Attempt 2 root cause — `dsh --version` shows `0.1.1-rc.2`

**What the unpinned name resolves to.** The combined command
`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` leaves `@deepseek-ai/dsh`
**unpinned** (no version specifier). npm resolves a bare package name to the **`latest`
dist-tag**.

**Why that lands on rc.2.** `npm-dist-tags.txt` (the registry state at the time) shows:

| dist-tag | version |
|---|---|
| `next`   | `0.1.1-rc.2` |
| `latest` | `0.1.1-rc.2` |
| `alpha`  | `0.1.2-alpha.5` |

So `latest` = `0.1.1-rc.2`, while the target `0.1.2-alpha.5` sits **only** on the `alpha`
dist-tag (it was never promoted to `latest`). The unpinned install therefore follows
**`latest`**, resolves `0.1.1-rc.2`, and silently downgrades the host from the running
`0.1.2-alpha.4` to the older `0.1.1` line — exactly what `dsh --version` printed. A bare
global install does **not** preserve or advance the installed version; it re-resolves the name
against `latest` and can move backward across lines.

Cites: SKILL.md host-upgrade discipline ("a bare package name resolves to the `latest`
dist-tag and can silently downgrade to an older line"); rollup **R-04** (dist-tag separation:
prerelease adaptations on `alpha`, `latest` kept for the stable line); precision-checklist
("prereleases route to the prerelease dist-tag, never latest").

---

## 3. Exact safe upgrade commands for this situation

Goal: host = `0.1.2-alpha.5`, plus the TUI plugin `@deepseek-harness-tui/dsh-tui`.

```powershell
# 0. STOP the host completely (external terminal — NOT from inside a dsh session).
#    Stop both the web host and the agent-session worker, e.g.:
taskkill /PID 42432 /T /F     # dsh web host (holds koffi.node)
taskkill /PID 23768 /T /F     # agent-session worker
tasklist /FI "IMAGENAME eq node.exe"   # verify no dsh host/worker remains

# 1. Pinned install. Pin the host to the exact version; pin the TUI plugin too.
#    (Determine the TUI plugin's exact compatible version first, e.g.
#     `npm view @deepseek-harness-tui/dsh-tui dist-tags` — the fixture only
#     carries the dsh dist-tags, so its version is not derivable from here.)
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-tui-version>

# 2. Verify BEFORE restarting anything.
dsh --version                 # must print 0.1.2-alpha.5 (never trust an unpinned install)

# 3. Restart and verify the full surface.
dsh web                       # restart the host
# then hard-refresh the browser (Ctrl+F5) and confirm the TUI plugin resolves and activates.
```

Alternative if the TUI plugin's exact version is unknown: split the steps —
`npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` → `dsh --version` (confirm alpha.5) → then
`npm install -g @deepseek-harness-tui/dsh-tui@<version>`. Optionally set
`npm_config_registry=https://registry.npmjs.org` to dodge mirror lag (rollup **R-08**). The
host pin is mandatory; the TUI pin is equally recommended so it can never resolve to a version
whose DSH peer range is off-cohort.

Cites: SKILL.md host-upgrade steps 1–3 (stop host → pinned `@<exact-version>` install → restart
+ hard-refresh + verify version markers and plugins); troubleshooting EBUSY row (pinned
`@<verified-version>` rollback because `latest` may lag); rollup **R-08** (mirror lag →
official registry).

---

## 4. Prevention — what README authors must change

1. **Never publish an unpinned host install.** Replace
   `npm install -g @deepseek-ai/dsh` with `npm install -g @deepseek-ai/dsh@<exact-version>`.
   A bare name follows `latest`, which can lag or point at a different line and silently
   downgrade (this trap). (SKILL.md host-upgrade discipline; R-04; precision-checklist pin rule.)
2. **Mind the dist-tag for prereleases.** A prerelease like `0.1.2-alpha.5` lives on `alpha` /
   `next`, not `latest`. A README targeting a prerelease must pin the exact version; using the
   `alpha` tag is a weaker fallback because that tag moves as new alphas ship. (R-04;
   `npm-dist-tags.txt` evidence here.)
3. **Pin the plugin's own version too, and align its DSH peer range to the target cohort.**
   Unpinned plugin names have the same failure mode, and a peer floor written as an old range
   (e.g. `^0.1.0-rc.8`) does not admit a prerelease cohort under npm's semver prerelease
   matching rules. (R-08 peer-floor prerelease semantics; R-04 dist-tag for plugin releases.)
4. **Document stop-then-upgrade.** State explicitly that the host must be fully stopped before
   the install on Windows, because a running host holds native-module file handles (`koffi.node`
   → `EBUSY`), and "close/refresh the browser tab" does not stop the host. (troubleshooting
   EBUSY row; R-12.)
5. **Route prerelease plugin adaptations to the prerelease dist-tag**, keeping `latest` for the
   stable-host line, so users on the stable cohort are not auto-upgraded to an alpha-adapted
   build. (R-04.)

---

## Blocker / residual notes

- The fixture's `npm-dist-tags.txt` covers only `@deepseek-ai/dsh`; the TUI plugin's
  (`@deepseek-harness-tui/dsh-tui`) exact compatible version is not derivable from the
  evidence and the task is read-only/no-network, so it is left as an explicit
  "`@<exact-tui-version>` — look up first" placeholder rather than invented.
- Per the workspace boundary, nothing outside the allowed read paths was inspected; no
  installs/migrations were executed and the fixture directory is unchanged.
