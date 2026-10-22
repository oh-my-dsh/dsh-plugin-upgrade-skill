# S12 · Global Upgrade: EBUSY + Silent Downgrade — Diagnosis and Safe Procedure

**Case**: S12-global-upgrade-ebusy-trap · Windows, npm global install of @deepseek-ai/dsh
**Installed**: 0.1.2-alpha.4 · **Wanted**: 0.1.2-alpha.5 · **Also wanted**: the TUI plugin
**Report date**: 2026-10-16 · **Mode**: A (read-only inspect + procedure hand-off). Nothing was executed,
installed, or migrated; the fixture directory was only read.

---

## 0. Verdict in one paragraph

Attempt 1 was a **correct, properly pinned install** (@deepseek-ai/dsh@0.1.2-alpha.5) that failed for an
OS-level reason: the running `dsh web` host process (PID 42432) has `koffi.node` — a native
DLL — memory-mapped, and Windows keeps that file locked until the owning process exits; a browser refresh
does not touch that process. Attempt 2 used a **bare, unpinned** `@deepseek-ai/dsh` spec inside a
combined command, and a bare package name resolves to the **`latest` dist-tag**, which at that
moment was `0.1.1-rc.2` — an *older* line than the installed `0.1.2-alpha.4` — so npm
silently **downgraded** the host. Both failures are avoidable with one ordered rule: **verify the version
is published → fully stop every dsh process from an external terminal → install an exact version pin →
verify `dsh --version` before restarting → restart and hard-refresh**.

---

## 1. What the evidence pack actually shows

| Fixture file | Content | What it proves |
|---|---|---|
| `attempt1-ebusy.log` | `npm error code EBUSY`, `syscall copyfile`, `path …\@koromix\koffi-win32-x64\win32_x64\koffi.node`, `dest …\@deepseek-ai\.dsh-TMPDIR\…\koffi.node` | The install failed while moving a **native .node binary**, not while downloading or resolving |
| `running-processes.txt` | three `node.exe`: **42432 = dsh web host (annotated "holds koffi.node")**, 23768 = agent session worker, 23920 = the npm install itself | The file holder is a **live dsh host process**, and a second dsh process (the session worker) is also alive |
| `npm-dist-tags.txt` | `next: 0.1.1-rc.2`, `latest: 0.1.1-rc.2`, `alpha: 0.1.2-alpha.5` | The only tag that carries the wanted alpha.5 is **`alpha`**; `latest` *and* `next` are both the older 0.1.1 line |
| `attempt2-downgrade.log` | `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` → installs fine → `dsh --version` = `0.1.1-rc.2` | The install "succeeded" and still produced a downgrade — resolution, not I/O, is the fault |

---

## 2. Attempt 1 · root cause: koffi.node is locked by the running host

### 2.1 Who holds it

**The `dsh web` host process — `node.exe` PID 42432** — as annotated in
`running-processes.txt`. `@koromix/koffi` is a native FFI addon that dsh loads at startup for
sandbox / filesystem operations (the fixture states this explicitly). `koffi.node` is the platform
binary for it: `@koromix/koffi-win32-x64/win32_x64/koffi.node`.

### 2.2 Why the OS refuses the copy (the actual mechanism)

1. A Node native addon is a **Windows DLL (PE image)**. `node.exe` loads it via
   `process.dlopen` → `LoadLibraryW`.
2. The Windows loader maps that file as an **image section**. While the section is mapped, the file
   cannot be deleted, renamed, truncated, or overwritten — any such request fails with a sharing
   violation / `ERROR_BUSY`.
3. Node/npm surfaces that failure as **`EBUSY`** on the file operation (`syscall copyfile`
   here). npm stages the new global tree (the `.dsh-TMPDIR` path in the log) and then has to place
   `koffi.node` over the copy that the live host has mapped — that placement is exactly what the
   OS refuses.
4. The lock is **per-process and lifetime-bound**: Node never unloads a native addon (there is no
   `FreeLibrary` for addon handles), so *only process exit* releases it.

Consequence: **any** global install, uninstall, or reinstall that rewrites `koffi.node` — the
`@deepseek-ai/dsh` umbrella *or* `@koromix/koffi-win32-x64` — fails with EBUSY for as long as
a dsh host process lives. It is not an npm bug, not a permissions problem, and not a disk problem.

### 2.3 Why a browser-page refresh does not free the lock

The browser page is only the **client bundle** (a SPA). Refreshing it re-downloads client assets and
reconnects to the *same* host process over the existing HTTP/WebSocket endpoint. The host
(`node.exe` PID 42432) is a separate OS process that keeps running and keeps the DLL mapped in its
address space. Nothing in a page reload unloads a native module from a Node process, so **the sharing
violation survives every refresh**. (Read-only ways to confirm the holder on a live box, if you ever need
to: Sysinternals `handle64 koffi.node`, or Resource Monitor → CPU → Associated Handles; the
fixture's own `tasklist` annotation already names PID 42432.)

### 2.4 Why "stopping dsh" must mean *every* dsh process

`running-processes.txt` lists **two** dsh-side node processes plus the installer:

* **42432** — the `dsh web` host (annotated holder of `koffi.node`);
* **23768** — the **agent session worker** — i.e. the very session that is issuing commands runs *on a
  dsh host process*. If that process also maps koffi (it is the same host code), stopping only the web
  host leaves EBUSY in place; and if you try to upgrade from *inside* that session, npm would be
  replacing the package tree the session itself executes from.

This is exactly the skill's global-host-upgrade discipline (`plugin-upgrade` → *Global DSH host
upgrades (agent discipline)*, and rollup card **R-12** "the upgrade target may be the currently running
host"): **never run the global host upgrade from inside a session on that host**; hand the procedure to
an external terminal.

### 2.5 The correct stop-then-upgrade sequence (ordered, and *why* each step exists)

1. **Confirm the target version is really published** — *before* stopping anything:
   `npm view @deepseek-ai/dsh@0.1.2-alpha.5 version`. npm publication lags the GitHub release by
   minutes-to-hours (skill card **DSH-0.1.6-A2-04**): *"never start the stop-host phase against an
   unpublished version"*, or you take the host down for nothing and hit `No match found for version`.
2. **Record the rollback baseline**: the current version (`0.1.2-alpha.4`) and the profile/plugin
   state, so a bad upgrade can be rolled back to the previous *published* version.
3. **From an EXTERNAL terminal** (plain PowerShell/CMD, *not* a dsh session, not the GUI's terminal):
   stop every dsh process — Ctrl+C in the terminal that runs `dsh web`; for detached/background
   hosts use `taskkill /PID <pid> /F`. Stop the web host, the agent session worker, the TUI, and
   any other host. **Then verify** with `tasklist /FI "IMAGENAME eq node.exe"` that no dsh-owned
   node process remains (the npm installer itself is a `node.exe`, so the cleanest check is
   "nothing before I start npm").
4. **Run the pinned install**: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` — exact version
   only (see §3 for why).
5. **Verify before restarting anything**: `dsh --version` must print `0.1.2-alpha.5`
   **exactly**; `npm ls -g --depth=0` should show the same.
6. **Restart and verify the fleet**: `dsh web` → **hard refresh** the browser (Ctrl+Shift+R) →
   check the version marker and the boot manifest / plugin roster lists **all six community plugins**.
   Known in-place-upgrade artifact gap (skill card **DSH-0.1.5-A1-20**, real-host verified): the first
   post-upgrade boot can serve a client combo that omits newly-added bundle modules —
   `failed to import loader entry <id>`, and *every* client plugin then fails to load. It
   **self-heals with one more host restart**; if it does not, roll the global package back to the
   previous published version and report upstream. This matters directly here: six Web plugins on one
   profile is exactly the observed fleet shape.

### 2.6 Residual state after a failed install

Attempt 1 failed *during* the copy, so the old tree is most likely intact — but always re-check with
`npm ls -g --depth=0` and `dsh --version` before proceeding. If an install was ever
**interrupted** (killed mid-run), the failure signature is "package content present but shims not
regenerated", i.e. the `dsh` command itself is gone. Repair only by re-running the **pinned**
install from an external shell — never hand-copy package directories and never hand-write shims.

---

## 3. Attempt 2 · root cause: the unpinned spec resolved to the latest dist-tag — which is older

### 3.1 What `@deepseek-ai/dsh` (no version) resolves to, and why

A **bare package name is the spec `@latest`** — npm resolves it through the registry's
**`latest` dist-tag**. It is *not* "the newest published version", *not* "the highest version that
satisfies anything", and *not* "keep whatever is installed". The registry state at the time
(`npm-dist-tags.txt`):

| dist-tag | version | vs. installed `0.1.2-alpha.4` |
|---|---|---|
| `latest` | **`0.1.1-rc.2`** | **older** → silent downgrade |
| `next` | `0.1.1-rc.2` | older → also a downgrade |
| `alpha` | `0.1.2-alpha.5` | newer → the one you wanted |

So `npm install -g @deepseek-ai/dsh` installed **`0.1.1-rc.2`** because that is what
`latest` points at. npm does not refuse to install an older version over a newer one — there is no
global-install downgrade protection — hence a clean "success" followed by `0.1.1-rc.2`.

### 3.2 The version ordering, spelled out

`0.1.1-rc.2 < 0.1.2-alpha.4 < 0.1.2-alpha.5` (semver compares `0.1.1` vs `0.1.2`
before it ever looks at prerelease labels). So the "upgrade" moved the host **backwards across a minor
line**.

### 3.3 Why "just use a range" does not save you either

On a prerelease line, semver's prerelease-matching rule only admits a prerelease when the range's
comparator carries a prerelease **on the same [major, minor, patch] tuple**. `^0.1.2` does **not**
match `0.1.2-alpha.5` (skill rollup **R-08**, peer-floor prerelease semantics — the same rule that
makes `^0.1.0-rc.8` refuse `0.1.2-alpha.2`). Therefore the only two specs that reliably land
on alpha.5 are an **exact pin** (`@0.1.2-alpha.5`) or the `alpha` **tag** — and tags move:
the same skill reference measured `alpha` as `0.1.2-alpha.5` on 2026-09-04 but
`0.1.3-alpha.2` on 2026-09-07. **Exact pins only.**

### 3.4 Why the downgrade is worse than cosmetic

`0.1.1-rc.2` is a different host line, not a patch. The six plugins and the `$DSH_HOME` state
were written by the 0.1.2 line, and the 0.1.2 line has storage/session-format changes (alpha.4 → alpha.5
alone touches storage domains and the `session_projcache` read path — cards
**DSH-0.1.2-A5-01/02/03**). Running a 0.1.1 host against a 0.1.2-era home is an **uncarded,
unsupported corridor**; card **A5-03** documents the mirror-image direction (0.1.1-rc.2 / 0.1.2-alpha.3
home → alpha.4 could refuse to boot or drop session titles) precisely because these home/host
combinations are fragile. The correct recovery is therefore a **pinned install of alpha.5**, not
"reinstall the same command again".

### 3.5 The TUI half of the combined command

`@deepseek-harness-tui/dsh-tui` is a **different package in a different scope**, and it was
equally unpinned. The same trap applies with a vengeance: the skill's rollup records that the
`@deepseek-ai/dsh-*` sub-packages keep `latest` at stale values (`0.0.1-rc.1` /
`0.1.0-rc.6`), so a bare non-umbrella package name is a standing downgrade hazard. **The fixture
contains no dist-tags listing for the TUI package** — see §6.

---

## 4. The exact safe upgrade commands for this situation

Run all of this from an **external terminal** (plain PowerShell), with **every dsh process stopped**
(§2.5). PowerShell shown; cmd equivalents are the same commands.

```powershell
# ---- 0) PRE-FLIGHT: prove the target version is published (registry may lag the GitHub release)
npm view @deepseek-ai/dsh@0.1.2-alpha.5 version      # must resolve; if E404, wait and retry
npm view @deepseek-ai/dsh dist-tags                   # expect alpha: 0.1.2-alpha.5, latest/next: 0.1.1-rc.2
npm view @deepseek-harness-tui/dsh-tui dist-tags      # check the TUI's tags BEFORE pinning it

# ---- 1) STOP every dsh process (web host + agent session worker + TUI + any other host)
#     Ctrl+C in the terminal running 'dsh web'; for detached hosts:  taskkill /PID <pid> /F
tasklist /FI "IMAGENAME eq node.exe"                  # verify: no dsh-owned node.exe remains

# ---- 2) INSTALL, always pinned to an exact version
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
npm install -g @deepseek-harness-tui/dsh-tui@<exact-version>   # version verified in step 0

# ---- 3) VERIFY BEFORE RESTARTING ANYTHING
dsh --version                 # MUST print 0.1.2-alpha.5 — nothing else
npm ls -g --depth=0           # both packages at the pinned versions

# ---- 4) RESTART AND VERIFY THE FLEET
dsh web
#   hard-refresh the browser (Ctrl+Shift+R)
#   check: version marker = 0.1.2-alpha.5, boot manifest/plugin roster lists all six plugins
#   if you see "failed to import loader entry <id>" (in-place upgrade combo gap, A1-20):
#       restart the host once more — it self-heals; if not, roll back:
#       npm install -g @deepseek-ai/dsh@0.1.2-alpha.4

# ---- 5) TUI PLUGIN INTO THE PROFILE (separate from the global host install)
#     install it through the profile's own mechanism, not mixed into the host command:
dsh plugin --profile web add @deepseek-harness-tui/dsh-tui@<exact-version>
#     then confirm the composition actually resolves to it (--dump-config shows the row, nothing pending)
```

Do **not**:

* run any of this from inside a dsh session on the host being upgraded (R-12 / host-self discipline);
* use a bare `@deepseek-ai/dsh`, `@latest`, or `@next` (`next` is *also*
  `0.1.1-rc.2` here);
* use a range such as `^0.1.2` (it cannot match a prerelease);
* stop the host before `npm view` has resolved the version;
* stop only the browser tab, or only the web host, and call it "stopped".

---

## 5. Prevention · what plugin README authors must do differently

| # | Do | Don't |
|---|---|---|
| 1 | **Pin the host exactly**: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` | `npm install -g @deepseek-ai/dsh`, `@latest`, `@next`, or `^0.1.2` — all resolve to `latest`/stale tags and can silently downgrade |
| 2 | If you must use a tag, **name the tag and the version it currently means**, and say it moves | `@alpha` written as if it were stable (it moved from alpha.5 to 0.1.3-alpha.2 within days) |
| 3 | **Pin every package in the command line**, including other scopes | `@deepseek-harness-tui/dsh-tui` bare — sub-packages' `latest` sits on old lines |
| 4 | **Split the command**: host upgrade (pinned, external terminal, host fully stopped) ≠ plugin install (into the profile via `dsh plugin` / Plugins page) | one combined `npm i -g dsh tui` line that hides the host spec's resolution |
| 5 | State the **stop requirement explicitly**: *stop every dsh process; closing the browser tab is not a host stop* | "close the browser and re-run" — the native-module lock survives it |
| 6 | Add the **verification line**: `dsh --version` must print the exact pinned version | implying a successful `npm install` proves the version |
| 7 | Add a **restart + hard-refresh** step and the A1-20 symptom (`failed to import loader entry`) with "restart once more" | assuming the first post-upgrade boot serves the new client combo |
| 8 | Mention **registry/mirror lag**: right after a GitHub release, use the official registry (`npm_config_registry=https://registry.npmjs.org`) and `npm view` before stopping the host | assuming a published GitHub tag is installable immediately (E404 window) |
| 9 | Keep the plugin's own **peer floor on the alpha line** (`^0.1.2-alpha.5`) so peer resolution does not add a second failure mode | an old `^0.1.0-rc.8` floor that semver refuses to match against the alpha host |
| 10 | Include the **rollback line** (previous published version) | leaving users with no documented way back |

A README install block that cannot catch anyone:

```markdown
## Upgrade the dsh host (run from an external terminal — never from inside a dsh session)

1. `npm view @deepseek-ai/dsh@0.1.2-alpha.5 version`  — must resolve before you stop anything
2. Stop **every** dsh process (web host, session workers, TUI). Closing the browser tab is NOT a stop.
   Verify: `tasklist /FI "IMAGENAME eq node.exe"`
3. `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`    — exact pin; never a bare name
4. `dsh --version` must print `0.1.2-alpha.5`
5. `dsh web` → hard-refresh (Ctrl+Shift+R) → confirm the plugin roster lists your plugins.
   If you see `failed to import loader entry <id>`, restart the host once more.
```

---

## 6. Evidence gaps and honest limits (nothing invented)

* The fixture's paths are **elided** (`C:\...`), so the exact absolute install root, the
  `.dsh-TMPDIR` location, and the global prefix are not inspectable. The lock mechanism is derived
  from the annotated process list + the `EBUSY`/`copyfile` signature + Windows DLL-mapping
  semantics, not from a `handle64` capture.
* **No dist-tags listing exists for `@deepseek-harness-tui/dsh-tui`** in the pack, so the report
  cannot state which version a bare TUI spec resolves to — only that it must be pinned and verified
  first (§4 step 0). No TUI version is asserted anywhere above.
* The pack does not say whether the **agent session worker (PID 23768)** also maps `koffi.node`;
  only the web host is annotated as the holder. The procedure therefore stops *all* dsh processes rather
  than betting on which one holds the lock.
* Nothing about the six community plugins' own versions, the three GitHub mirrors' state, or
  `$DSH_HOME` contents is in the pack; the A5-01/02/03 and A1-20 references are cited as the known
  0.1.2-line risks to check, not as observed facts about this machine.
* This report is read-only diagnosis: no install, migration, or configuration change was executed, and
  the fixture directory was not modified.

---

## 7. Skill references used (read-only)

* `plugin-upgrade/SKILL.md` → **Global DSH host upgrades (agent discipline)**: stop every dsh
  process (a running host holds native-module file locks → EBUSY; a browser refresh is not a host stop)
  → external terminal → pinned `npm install -g @deepseek-ai/dsh@<exact-version>` (a bare package
  name resolves to the `latest` dist-tag and can silently downgrade to an older line) → restart,
  hard-refresh, verify.
* `references/rollup-0.1.2.md` → **R-08** install-channel pitfalls (mirror lag, pnpm 11
  `minimumReleaseAge`, peer-floor prerelease semantics) and the dist-tag measurements
  (`alpha` = `0.1.2-alpha.5` on 2026-09-04; `alpha` = `0.1.3-alpha.2` on
  2026-09-07 while `latest`/`next` stayed on the RC) · **R-12** the upgrade target may be
  the currently running host · the layered validation checklist (dependency resolution → static → unit →
  real cold boot → cross-cohort → headless).
* `references/v0.1.6-alpha.2.md` → **DSH-0.1.6-A2-04**: npm publish lags the GitHub release;
  `npm view` must resolve the version *before* the stop-host phase.
* `references/v0.1.5-alpha.1.md` → **DSH-0.1.5-A1-20**: in-place npm-global upgrade can serve a
  client combo missing new bundle modules (`failed to import loader entry`); one host restart
  self-heals; roll back to the previous published version otherwise. Six-plugin real-host crossing
  record on Windows.
* `references/v0.1.2-alpha.5.md` → **DSH-0.1.2-A5-01/02/03**: what alpha.5 actually changes
  (storage `compatibleVersions`, `invalidRecords: 'backup-and-skip'`, the rc.2/alpha.3-era
  home boot fix) — relevant to why landing on the *right* line matters, and to post-upgrade home
  verification.
* `references/pre-flight.md` → step **1.5 Ghost host**: pin the corridor's `from` to the
  *running* process, never to the on-disk version — the same "ask the process, not the disk" rule
  applied here to `dsh --version` before and after the upgrade.

---

## 8. One-line answer to each question asked

1. **Attempt 1**: `koffi.node` is a native DLL memory-mapped by the running `dsh web` host
   (PID 42432); Windows holds the file locked for that process's lifetime, so npm cannot place the new
   copy (`EBUSY`/`copyfile`). A browser refresh only reloads the SPA against the same host
   process and releases nothing. Correct sequence: confirm the version is published → **from an external
   terminal, stop every dsh process** (web host *and* session workers/TUI) → pinned
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` → verify `dsh --version` → restart
   `dsh web` + hard refresh → verify the six-plugin roster (restart once more if the client combo
   404s).
2. **Attempt 2**: the bare `@deepseek-ai/dsh` spec means `@latest`, which pointed at
   **`0.1.1-rc.2`** — an older line than the installed `0.1.2-alpha.4` — so npm silently
   downgraded. It follows the **`latest` dist-tag** (`next` is also `0.1.1-rc.2` here;
   only `alpha` carries `0.1.2-alpha.5`).
3. **Safe commands**: §4 (publish check → stop all hosts externally → exact pins for
   `@deepseek-ai/dsh@0.1.2-alpha.5` and the TUI → verify → restart + hard refresh + roster check).
4. **Prevention**: pin every package exactly, never combine the host upgrade with plugin installs,
   document "stop every dsh process (a tab refresh is not a stop)" plus the publish-lag check and the
   `dsh --version` verification line, and ship a rollback line — §5.
