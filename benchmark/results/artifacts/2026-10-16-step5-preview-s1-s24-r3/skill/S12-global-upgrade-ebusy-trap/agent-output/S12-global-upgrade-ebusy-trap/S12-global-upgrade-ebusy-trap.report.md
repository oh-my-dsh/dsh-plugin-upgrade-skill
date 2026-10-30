# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis & Safe Procedure

**Scope:** read-only diagnosis from the evidence pack. No migration, install, or write was
performed against the fixture (fixture left byte-for-byte unchanged). Target state the user
wants: **dsh `0.1.2-alpha.5` + the TUI plugin**, starting from a running `0.1.2-alpha.4`.

Two independent traps fired in the two attempts:

| Attempt | Command shape | What went right | What went wrong | Trap |
|---|---|---|---|---|
| 1 | `npm i -g @deepseek-ai/dsh@0.1.2-alpha.5` (correct pin) | right version | `EBUSY` copying `koffi.node` | **OS file lock** — host process not stopped |
| 2 | `npm i -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` (bare dsh) | host stopped, no EBUSY | `dsh --version` → `0.1.1-rc.2` | **unpinned name → `latest`** → silent downgrade |

Fixing attempt 1 (stop the host) exposed attempt 2 (unpin the version). Both must be fixed together.

---

## 1. Attempt 1 root cause — why `koffi.node` is locked, and why a browser refresh does not free it

**What holds the file:** the running **dsh web host process** — `node.exe PID 42432`
(`running-processes.txt`). That host loaded `@koromix/koffi` at startup. `koffi` is a native
FFI addon used for the host's sandbox/filesystem operations, and its binary is a Windows
**PE image** (`koffi.node`). When a process loads a `.node`/DLL image, Windows memory-maps it
and keeps an **exclusive kernel file lock on that file for the lifetime of the process**. The
file cannot be opened for write, deleted, renamed, or replaced until the mapping process exits.

**Why npm hit EBUSY:** a global install must clear/replace the existing
`@koromix\koffi-win32-x64\win32_x64\koffi.node` in the global tree. The `copyfile` in
`attempt1-ebusy.log` has that exact installed file as its **`path`** (source) and a
`@deepseek-ai\.dsh-TMPDIR\...` staging file as its `dest` — i.e. npm is moving the old file
aside to make room for alpha.5. The OS refuses the operation on the source because the host
process still has it mapped → `EBUSY / syscall copyfile`. The lock is on the **file npm must
touch**, held by the **host**, which is exactly the process that is still running.

**Why a browser-page refresh does NOT release it:** the lock lives in the **OS kernel, keyed to
the host process's handle — not in the browser**. dsh is a host `node.exe` (server) plus a
browser SPA (client). Refreshing the page only reloads the client SPA and re-dials the *same*
host; it does not stop, restart, or signal the host `node.exe`. The host keeps running and keeps
`koffi.node` mapped, so the lock persists across any number of refreshes. This matches
`running-processes.txt` ("Refreshing the browser page only reloads the SPA; the host process
stays alive") and the skill's troubleshooting row for this exact task: *"the file lock is on the
host, not the browser."*

**Correct stop-then-upgrade sequence (do all of it, in order, from an EXTERNAL terminal):**

1. **Fully stop every dsh process** — the `dsh web` host *and* any agent session-worker
   `node.exe` (in the evidence, PIDs 42432 and 23768). Ctrl+C in the terminal running
   `dsh web`, and end the others. Do **not** rely on closing or refreshing the browser tab.
2. **Verify the lock is gone** before installing:
   `tasklist /FI "IMAGENAME eq node.exe"` — no dsh host/session-worker `node.exe` should
   remain. If you are unsure what still holds the file, confirm the owner with Resource Monitor
   (`resmon` → CPU → *Associated Handles* → search `koffi.node`) or Sysinternals `handle.exe
   koffi.node`, and end that process. Never hand-copy package directories or hand-write shims to
   work around a lock.
3. **Run the install from an external shell, never from inside a dsh session on that host.**
   Upgrading the global host from within a session is structurally fatal: the session *is* the
   host process, npm replaces the very package tree the session executes from, the host dies
   mid-install, and the interrupted install leaves package content without regenerated shims —
   the `dsh` command itself disappears until a pinned external re-install repairs it.
4. **Restart `dsh web`, hard-refresh the browser**, then verify version markers and that plugins
   load.

> Rule of thumb from the skill's "Global DSH host upgrades" discipline: *because the host is
> fully stopped before npm runs, nothing crashes mid-install — a crash during the upgrade is a
> signature of doing it wrong, not a risk to tolerate.*

---

## 2. Attempt 2 root cause — why `dsh --version` shows `0.1.1-rc.2`, not alpha.5

**What the unpinned name resolves to:** the combined README command
`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` specifies dsh with **no
version, range, or tag**. A bare package name is shorthand for `@deepseek-ai/dsh@latest`, so npm
resolves it against the **`latest` dist-tag** — *not* the highest version in the registry, *not*
the version currently installed, and *not* the newest release.

**What `latest` pointed to** (`npm-dist-tags.txt`, and confirmed by the skill's alpha.5
verification record: *"`latest` is `0.1.1-rc.2` only for the umbrella package"*):

```
next:   '0.1.1-rc.2'
latest: '0.1.1-rc.2'   ← the bare name lands here
alpha:  '0.1.2-alpha.5' ← the release the user actually wants
```

**So the bare `@deepseek-ai/dsh` installed `0.1.1-rc.2`.** That is why `dsh --version` prints
`0.1.1-rc.2` (`attempt2-downgrade.log`).

**Why this is a downgrade, not just "no change":** by SemVer ordering `0.1.1-rc.2 < 0.1.2-alpha.4`
(the `0.1.1` line sorts below the `0.1.2` line, and rc.2 is a prerelease of `0.1.1`). The user was
running `0.1.2-alpha.4`; installing `latest` pulled them *back* to `0.1.1-rc.2`. npm does not
preserve or advance an installed version when you give it a bare name — it re-resolves to
`latest`, and here `latest` is an older line, so the install silently downgrades.

**Why `latest` lags:** the maintainers publish the `0.1.2-alpha.x` line on the **`alpha`**
dist-tag and never advanced the umbrella package's `latest` past `0.1.1-rc.2`. `latest` is a
curated pointer to the recommended/stable line, which intentionally trails the prerelease
channel. Consequently **alpha.5 is reachable only via the `alpha` tag or an explicit exact
version** — a bare name can never reach it. (Note `next` is *also* `0.1.1-rc.2` here, so neither
`latest` nor `next` reaches alpha.5; only `alpha` does.)

**Which dist-tag does the unpinned install follow? → `latest`.**

---

## 3. Exact safe upgrade commands (alpha.5 + TUI)

Stop first, then install with an **explicit pin** so npm cannot fall back to `latest`.

```bash
# ── 0. From an EXTERNAL terminal (never inside a dsh session on this host) ──
# 1. Fully stop every dsh process (host + session workers). Do NOT just close/refresh
#    the browser — the koffi.node lock lives in the host process, not the browser.
# 2. Confirm the lock is released:
tasklist /FI "IMAGENAME eq node.exe"
#    (no dsh host/session-worker node.exe should remain; if unsure, check Associated
#     Handles in resmon, or:  handle.exe koffi.node )

# 3. Install with an EXPLICIT pin. Option A — exact version (most reproducible):
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
#    Option B — the alpha dist-tag (currently == 0.1.2-alpha.5):
#      npm install -g @deepseek-ai/dsh@alpha @deepseek-harness-tui/dsh-tui
#    Either way, dsh is PINNED — never a bare `@deepseek-ai/dsh`.

# 4. Verify the on-disk version BEFORE restarting:
dsh --version
#    MUST print: 0.1.2-alpha.5   (if it prints 0.1.1-rc.2, the latest-tag trap fired —
#    re-run step 3 with the explicit pin)

# 5. Restart dsh web, hard-refresh the browser, confirm version markers + the TUI plugin loads.
```

**Notes for the TUI half:**
- The critical fix is pinning dsh; the TUI package (`@deepseek-harness-tui/dsh-tui`) may be
  installed in the same pinned command as shown.
- The evidence pack contains no dist-tag/version data for the TUI package, so do not guess a
  TUI version. Install a TUI release whose peer/dependency cohort matches dsh `0.1.2-alpha.5`
  (check `npm view @deepseek-harness-tui/dsh-tui versions peerDependencies`), then confirm it
  actually activates in the running profile. If you prefer to be conservative, install dsh
  pinned first, verify `0.1.2-alpha.5`, then add the TUI as a second step.

---

## 4. Prevention — what plugin README authors must change

The trap caught the user through a plugin README's "official combined command." Authors should:

1. **Never ship a bare `@deepseek-ai/dsh` in an install/upgrade command.** Always pin:
   `@deepseek-ai/dsh@<exact-version>` for reproducibility, or an explicit channel tag
   (`@deepseek-ai/dsh@alpha` / `@next`) only when deliberately tracking that channel. The
   precision-checklist rule is explicit: *"prereleases route to the prerelease dist-tag, never
   latest."*
2. **State the dist-tag semantics plainly** so users know a bare name = `latest`, which can be an
   *older* line than the alpha they run and will silently downgrade a prerelease install. A
   one-line warning suffices: *"`npm install -g @deepseek-ai/dsh` with no version follows the
   `latest` tag, which may lag the alpha/next channels — always pin the version."*
3. **Put the stop-first ordering in the README** for Windows users: fully stop every dsh
   host/session process before upgrading, because a running host holds native-module file locks
   (`koffi.node` → `EBUSY`) and **closing or refreshing the browser does not release them**. Name
   the symptom so users recognize it.
4. **Do not fold an unpinned core upgrade into a plugin install command.** If dsh + plugin must
   be installed together, pin dsh explicitly (`npm i -g @deepseek-ai/dsh@<exact> <plugin>`).
   Better: separate "upgrade the host (pinned)" from "install the plugin," and run the host
   upgrade from an external terminal.
5. **Add a verification + rollback step:** after install, `dsh --version` must equal the intended
   version; if not, the bare-name/`latest` trap fired — reinstall with an explicit pin. For
   rollback, pin a known-good exact version (the `latest` tag may lag, so never roll back via
   `latest`).
6. **Declare the channel the plugin targets** (e.g. "requires dsh `0.1.2-alpha.5`, on the `alpha`
   channel"), so a user sitting on the stable/`latest` line knows they must opt into the alpha
   channel explicitly rather than being silently moved by a bare install.

---

## Evidence & references

**Fixture (read-only, unchanged):**
- `attempt1-ebusy.log` — `EBUSY`/`copyfile`, `path` = installed
  `@koromix\koffi-win32-x64\win32_x64\koffi.node`, `dest` = `.dsh-TMPDIR` staging file.
- `running-processes.txt` — `node.exe 42432` = dsh web host (holds koffi.node), `23768` = agent
  session worker, `23920` = the npm install; note that a browser refresh reloads only the SPA.
- `attempt2-downgrade.log` — unpinned combined install "succeeds," `dsh --version` → `0.1.1-rc.2`.
- `npm-dist-tags.txt` — `latest: 0.1.1-rc.2`, `next: 0.1.1-rc.2`, `alpha: 0.1.2-alpha.5`.

**Skill (read-only):**
- `SKILL.md` → "Global DSH host upgrades (agent discipline)": stop every dsh process (a running
  host holds native-module file locks → EBUSY; a browser refresh is not a host stop) → external
  pinned install (`npm install -g @deepseek-ai/dsh@<exact-version>`; a bare name resolves to
  `latest` and can silently downgrade) → restart `dsh web`, hard-refresh, verify.
- `references/troubleshooting.md` (S12 row): the EBUSY/`koffi.node` lock is held by the running
  dsh web host, not the browser; stop the host fully before file replacement; roll back by
  pinning an exact verified version because `latest` may lag.
- `references/precision-checklist.md`: prereleases route to the prerelease dist-tag, never latest.
- `references/v0.1.2-alpha.5.md` (npm channels, measured 2026-09-03): `alpha` = `0.1.2-alpha.5`
  (umbrella + sub-packages), `next` = `0.1.1-rc.2`, umbrella `latest` = `0.1.1-rc.2`.
