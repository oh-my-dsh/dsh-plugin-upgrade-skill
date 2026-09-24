# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Environment: Windows, dsh `0.1.2-alpha.4` running, six community Web plugins across three GitHub mirrors.
Goal: host `0.1.2-alpha.5` + the TUI plugin. Evidence: `attempt1-ebusy.log`, `attempt2-downgrade.log`,
`running-processes.txt`, `npm-dist-tags.txt` (all read-only, unchanged).

---

## 1. Attempt 1 — why `koffi.node` is EBUSY, and why a browser refresh does not free it

**Who holds the file.** `running-processes.txt` shows three `node.exe` processes at the moment of the failure:

| PID | Role |
|---|---|
| 42432 | **dsh web host** — the lock holder |
| 23768 | agent session worker |
| 23920 | the `npm install -g` attempting the copy |

The dsh web host loaded `@koromix/koffi` (a native FFI addon used for sandbox/filesystem operations) at
startup. `koffi.node` is a native `.node` binary: once a process loads (maps) a native module, **the OS holds
the file locked until that process exits**. npm's failure is a `copyfile` of exactly that file —
`@koromix/koffi-win32-x64/win32_x64/koffi.node` — into the package tree, so Windows refuses the overwrite and
npm reports `EBUSY`. The installer (PID 23920) is the victim, not the holder; the holder is the still-running
host (PID 42432).

**Why a browser refresh does not help.** The lock lives in the **host process, not the browser**. A page
refresh only reloads the SPA frontend; the Node host process stays alive with `koffi.node` still mapped, so
the handle survives every refresh (and closing the tab too). The equivalent troubleshooting entry says it
directly: the file lock is in the host, not in the browser — the only thing that releases it is the host
process exiting.

**Correct stop-then-upgrade sequence** (from the plugin-upgrade skill's "Global DSH host upgrades"
discipline):

1. **Fully stop every dsh process** — the web host *and* the agent session worker (it may also hold native
   modules). Graceful shutdown of `dsh web` first; `taskkill /PID <pid> /F` only as fallback.
   A browser refresh is **not** a host stop.
2. **Verify nothing is left**: `tasklist /FI "IMAGENAME eq node.exe"` shows no dsh-related PIDs.
3. **From an EXTERNAL terminal** — never from inside a running dsh session/agent (that session *is* the host
   process; npm would dismantle the package tree it executes from and the host dies mid-install) — run the
   **pinned** install (see §3; the pin is mandatory, that is exactly the attempt-2 trap).
4. **Restart** `dsh web`, hard-refresh the browser, and verify `dsh --version` and that the plugins load.

Because the host is fully stopped before npm runs, nothing can crash mid-install; a crash during a global
upgrade is the signature of doing it wrong, not a risk to tolerate.

## 2. Attempt 2 — why `dsh --version` printed `0.1.1-rc.2` instead of alpha.5

The combined command installed `@deepseek-ai/dsh` **unpinned**. An unpinned `npm install -g <pkg>` does not
preserve or advance the currently installed version — it resolves the bare name against a **dist-tag**, and
the default tag is **`latest`**. It follows the registry pointer, not your installed version.

`npm-dist-tags.txt` at the time:

```
next:   '0.1.1-rc.2'
latest: '0.1.1-rc.2'
alpha:  '0.1.2-alpha.5'
```

So the unpinned name resolved to **`0.1.1-rc.2`**, and npm replaced `0.1.2-alpha.4` with it — a silent
**downgrade** back to the older 0.1.1 stable line. This is why: the whole 0.1.2 series is a prerelease line,
published under the **`alpha` dist-tag**, while `latest` intentionally stays on the older stable 0.1.1 line
(the alpha.5 version card's corridor record confirms exactly this channel layout: `alpha` = `0.1.2-alpha.5`
for the umbrella package, `latest`/`next` = `0.1.1-rc.2`). A bare-name install follows `latest`, hence rc.2.

Two clarifications worth stating:

- The EBUSY fix *worked* — the install went through cleanly because dsh was stopped this time. The failure
  mode changed from "cannot write" to "wrote the wrong version"; the two attempts have independent root
  causes (file lock vs. dist-tag resolution).
- The only ways to land on alpha.5 are an **exact version pin** (`@deepseek-ai/dsh@0.1.2-alpha.5`) or an
  **explicit tag** (`@deepseek-ai/dsh@alpha`). Exact pins are preferred: dist-tag pointers move over time
  (the `alpha` tag later moved on to the 0.1.3 line), so a tag-pinned command degrades into the same trap.

## 3. The exact safe upgrade commands

Current state after attempt 2: host downgraded to `0.1.1-rc.2`, TUI plugin installed. The pinned install
below simultaneously repairs that downgrade and delivers alpha.5.

```bat
:: 1) Stop every dsh process (web host + agent session workers); graceful stop first,
::    taskkill /PID <pid> /F only as fallback. A browser refresh is NOT a host stop.
tasklist /FI "IMAGENAME eq node.exe"      :: verify no dsh-related node.exe remains

:: 2) From an EXTERNAL terminal (not inside any running dsh session) — PINNED installs:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

::    (equivalently two commands; the dsh one MUST carry the exact version.
::     If a fresh release 404s / ETARGETs through a mirror — mirrors lag new
::     publications by hours — force the official registry first:)
set npm_config_registry=https://registry.npmjs.org

:: 3) Verify BEFORE restarting anything:
dsh --version                              :: must print 0.1.2-alpha.5, not a tag pointer

:: 4) Restart and verify:
dsh web
::    then hard-refresh the browser and confirm the version marker and that the six
::    community plugins + the TUI plugin load.
```

Notes:

- Do not run this from inside a dsh session — the session *is* the host process.
- The global install does not touch the six community Web plugins; they live in profiles. Verify them after
  restart.
- alpha.4 → alpha.5 is a restart-only edge for plugins (zero plugin-facing code changes), and alpha.5
  specifically **fixes** the boot/session-title failures that alpha.4 had for homes coming from a
  `0.1.1-rc.2`-era state (card DSH-0.1.2-A5-03) — which is precisely the state attempt 2 put this home in.
  alpha.5 is therefore the correct repair target, not just the desired one.
- If a specific TUI plugin version is required, pin it too (`@deepseek-harness-tui/dsh-tui@<version>`);
  unpinned, it follows its own `latest`, which is acceptable for the plugin but reproducible pins are better.

## 4. Prevention — what plugin README authors should do differently

1. **Never ship an unpinned host package name in an install/upgrade command.** A bare `@deepseek-ai/dsh`
   follows the `latest` dist-tag, which is currently an *older* line and will keep drifting. The command that
   was correct on the day it was written silently downgrades every later reader. Pin the exact version:
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
2. **If a dist-tag must be used, name it explicitly and date-stamp it** (`@deepseek-ai/dsh@alpha` — resolves
   to `0.1.2-alpha.5` as of 2026-09), and tell readers to check `npm view @deepseek-ai/dsh dist-tags` first.
   Prefer exact pins: tags move (the `alpha` tag later moved to the 0.1.3 line), so tag-pinned snippets decay
   into this trap.
3. **Pin every package in a combined command — or don't combine.** One unpinned name in
   `npm install -g a b` is enough to downgrade the host while the user's actual intent was only to add a
   plugin. Better yet, keep "install the TUI plugin" and "upgrade the dsh host" as separate documented
   commands: merging an optional plugin install with a host upgrade turns a plugin install into an
   accidental host downgrade.
4. **State the stop-host prerequisite in every README upgrade section.** On Windows, a running dsh host locks
   its loaded native modules (real case: `koffi.node` → EBUSY); say explicitly that closing or refreshing the
   browser does *not* stop the host, and that all dsh processes must be exited before a global install.
5. **Require an external terminal.** READMEs should warn that the upgrade must not be run from a shell or
   agent session inside dsh itself — that session is the host process, and the install dismantles the
   package tree it runs from.
6. **Give readers a one-line verification** — `dsh --version` must print the pinned version — so a silent
   dist-tag drift or mirror lag is caught immediately instead of being discovered as a mysterious version
   change. Mention the official registry (`npm_config_registry=https://registry.npmjs.org`) for E404/ETARGET
   on fresh releases, since third-party mirrors lag new publications.
7. *(For authors who publish too)* follow the project's own tag discipline deliberately: prerelease lines on
   an `alpha` tag, `latest` reserved for the stable line — and recognize that this discipline is exactly why
   bare-name install snippets are dangerous for prerelease-track tools.

---

### Evidence cross-reference

| Claim | Evidence |
|---|---|
| Host PID 42432 holds `koffi.node`; worker 23768; installer 23920 | `running-processes.txt` |
| koffi is loaded by the host at startup; lock survives until process exit; browser refresh only reloads the SPA | `running-processes.txt` (annotations) |
| `copyfile` fails on `@koromix/koffi-win32-x64/.../koffi.node` with EBUSY | `attempt1-ebusy.log` |
| `latest`/`next` = `0.1.1-rc.2`, `alpha` = `0.1.2-alpha.5` | `npm-dist-tags.txt` |
| Unpinned install landed on rc.2 | `attempt2-downgrade.log` |
| Stop-all-hosts → external pinned install → restart/verify procedure | plugin-upgrade SKILL.md, "Global DSH host upgrades (agent discipline)" |
| EBUSY row: lock is in the host, not the browser; pin exact version on rollback | `references/troubleshooting.md` (S12 row) |
| `alpha` = prerelease channel, `latest` = stable line for the umbrella package; tag drift over time; mirror-lag registry override | `references/v0.1.2-alpha.5.md` (npm channels), `references/rollup-0.1.2.md` (R-08) |
| alpha.5 fixes rc.2-era-home boot/title bugs (A5-03); alpha.4→alpha.5 is restart-only for plugins | `references/v0.1.2-alpha.5.md` |

No files were modified inside `fixture/`; no migrations or installs were executed.
