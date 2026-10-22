# S12 — Global Upgrade EBUSY + Downgrade Trap: Diagnosis & Safe Procedure

Evidence reviewed (read-only fixture): `attempt1-ebusy.log`, `attempt2-downgrade.log`,
`npm-dist-tags.txt`, `running-processes.txt`. No commands were executed; no fixture changes.

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

`npm error code EBUSY / syscall copyfile / path ...\@koromix\koffi-win32-x64\win32_x64\koffi.node`

`koffi.node` is a native addon binary (`@koromix/koffi`, used by the dsh web host for
sandbox/filesystem FFI). On Windows, once a process has loaded a `.node` binary, the OS
holds an exclusive lock on the file until that process exits. Per `running-processes.txt`,
the lock is held by the **dsh web host process itself** (`node.exe` PID 42432, Console),
which loaded `@koromix/koffi` at startup. The agent session worker (PID 23768) is a second
dsh-related node process that must also be stopped. The third entry (PID 23920) is the
npm install copying over the locked file — the victim, not the cause.

A browser-page refresh does **not** free the lock: it only reloads the SPA inside the
browser. The host `node.exe` process that loaded koffi keeps running, so the file lock
persists and the copy still fails with EBUSY.

Correct stop-then-upgrade sequence:
1. Stop the dsh web host AND any agent session workers — i.e. every dsh-related `node.exe`
   process, not a browser reload.
2. Verify with `tasklist /FI "IMAGENAME eq node.exe"` that no dsh node process remains.
3. From an external terminal (not from inside a dsh session), run the pinned install.
4. Restart `dsh web`, hard-refresh the browser, verify versions and plugins.

## 2. Attempt 2 root cause — `dsh --version` prints `0.1.1-rc.2`

The combined command was:

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

`@deepseek-ai/dsh` was given **no version specifier**, so npm does not preserve the
currently installed `0.1.2-alpha.4` nor advance it — it resolves the bare name through
npm dist-tags, specifically the **`latest`** tag. At that moment:

```
next:   '0.1.1-rc.2'
latest: '0.1.1-rc.2'
alpha:  '0.1.2-alpha.5'
```

`latest` pointed at the older `0.1.1-rc.2` line (the `0.1.2-alpha.5` prerelease is only on
the `alpha` tag; npm never promotes prereleases to `latest`). The install therefore
"succeeded" by **silently downgrading** the host from 0.1.2-alpha.4 to 0.1.1-rc.2.
npm's unpinned global install follows the `latest` dist-tag, not the installed version
and not the newest version on the registry.

## 3. Exact safe upgrade commands for my situation

Detected current state: dsh 0.1.2-alpha.4 running; want 0.1.2-alpha.5 + the TUI plugin.

```powershell
# 1. Stop ALL dsh processes (web host + agent workers). A browser refresh is not enough.
#    Identify them first, then exit the host/ workers cleanly, e.g.:
tasklist /FI "IMAGENAME eq node.exe"
#    ...stop the dsh web host and agent session worker(s) (Ctrl+C in their consoles,
#    or: taskkill /PID <pid> /T   for each dsh node.exe). Confirm none remain:
tasklist /FI "IMAGENAME eq node.exe"

# 2. From an EXTERNAL terminal (never from inside a dsh session), pinned install:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-version>
#    (check the plugin's exact version first, e.g. npm view @deepseek-harness-tui/dsh-tui dist-tags,
#     then substitute it; the host MUST be pinned — '@deepseek-ai/dsh@alpha' would also work today
#     but an exact version is deterministic)

# 3. Verify, then restart:
dsh --version        # expect 0.1.2-alpha.5
dsh web              # start the host again
# hard-refresh the browser page; confirm TUI/web plugin loads
```

Do not run the global install from inside a dsh session: the session process IS the host,
and an interrupted install leaves the `dsh` shim missing. If an install was already
interrupted, repair by re-running the pinned global install from an external shell —
never hand-copy package directories or hand-write shims.

## 4. Prevention — what plugin README authors should change

Install snippets like `npm install -g @deepseek-ai/dsh @my-plugin/dsh-tui` are trap doors:

- **Always pin the host package** (`@deepseek-ai/dsh@x.y.z-exact`) — or at minimum name an
  explicit dist-tag matching the documented corridor (e.g. `@deepseek-ai/dsh@alpha`). Never
  ship a bare `@deepseek-ai/dsh` in a combined install line; bare resolves to `latest`,
  which can silently downgrade users off the prerelease line.
- **Pin the plugin too** (`@my-plugin/dsh-tui@x.y.z` or a strict range), and state the
  exact DSH host version corridor the plugin was tested against.
- **Say explicitly** that bare `@deepseek-ai/dsh` follows the `latest` dist-tag and does
  NOT keep/advance the installed version — this is the single most important note.
- **Require a full stop before upgrade**: stop the dsh web host and agent workers with
  `tasklist`/`taskkill` verification; note that a browser page refresh does not release
  native-module locks (EBUSY on `*.node` files is the symptom).
- **Forbid running the global upgrade from inside a dsh session** and give the repair
  recipe (external pinned re-install) for an interrupted upgrade.
- Prefer per-host verification commands (`dsh --version` after restart) in the README so
  users notice a silent downgrade immediately.

## Limitations

No external documentation was consulted; the analysis is derived entirely from the fixture
evidence and the local skill reference (`skills/plugin-upgrade/SKILL.md`), which agrees on
every point above. No installs, migrations, or processes were started, and `fixture/` is
unchanged.
