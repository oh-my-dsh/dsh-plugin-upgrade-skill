# JUDGE BRIEF · skill.S12-global-upgrade-ebusy-trap

## Criteria (sealed rubric)
- [native-module-owner] (20pt) Identify the running Windows dsh web-host node.exe (PID 42432 in running-processes.txt) as the process that loaded koffi.node. Explain that the loaded native binary remains in use until that host exits, so npm cannot copy/replace it and reports EBUSY. File-in-use/handle wording is equivalent to lock; do not require universal claims about other operating systems or the word exclusive.
- [browser-versus-host-sequence] (20pt) Explain that refreshing the browser reloads the page/SPA without stopping the native-module-owning host. Give the ordered procedure: stop/confirm exit of the relevant dsh host, install, then restart. Separate numbered steps, prose and command blocks together establish the sequence; do not require a single sentence. Do not prescribe killing every unrelated Node process.
- [unpinned-dist-tag-resolution] (20pt) Explain that an unversioned npm global install follows latest, which npm-dist-tags.txt pins to 0.1.1-rc.2; alpha points to 0.1.2-alpha.5. This can replace the initially installed alpha.4 with rc.2 rather than preserving/upgrading it. A statement that an unpinned install does NOT preserve the installed version is correct, not contradictory advice. Distinguish a minor wrong prior-version label from a wrong resolution mechanism.
- [safe-exact-commands] (20pt) Provide npm install -g (or npm i -g) @deepseek-ai/dsh@0.1.2-alpha.5 and @deepseek-harness-tui/dsh-tui, together or separately after stopping the host. Verify dsh --version is alpha.5 and restart the host. An explicit @alpha may be discussed as a mutable alternative but cannot replace the requested exact-version command. Shell examples are proposed instructions, not required executed actions.
- [readme-prevention] (20pt) Tell README authors to pin the exact intended/tested core version whenever a plugin install command also installs dsh, and avoid silently following latest over an existing prerelease. Accept separate pinned core/plugin commands or one pinned combined command. Read the recommendation across headings and list items; quoted unpinned BAD examples are not endorsements.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S12-global-upgrade-ebusy-trap/S12-global-upgrade-ebusy-trap-report.md

# S12 · Global upgrade EBUSY + downgrade trap — diagnosis, safe procedure, README prevention

**Scope of this report.** Read-only forensic analysis of the evidence pack in `fixture/` (unchanged; nothing was installed, executed or migrated).
**Machine context from the brief:** Windows, DSH installed globally via npm, six community Web plugins installed from three GitHub mirrors, host `0.1.2-alpha.4` when attempt 1 started.

---

## 0 · Verdict in one screen

| # | Symptom | Root cause (one line) | Evidence |
|---|---|---|---|
| 1 | `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` dies with `EBUSY … syscall copyfile` on `koffi.node` | The running **dsh web host process** (PID 42432) has the native FFI addon `@koromix/koffi-win32-x64/win32_x64/koffi.node` mapped as a Windows image section; the mapping keeps the file locked until that **process exits**. npm's staging copy hits the locked file and aborts. | `fixture/attempt1-ebusy.log`, `fixture/running-processes.txt` |
| 2 | `dsh --version` prints `0.1.1-rc.2` after the combined install "went fine" | The bare spec `@deepseek-ai/dsh` is a **dist-tag** install — not "keep current", not "newest". It resolves `latest`, and at that moment `latest = 0.1.1-rc.2`: a **downgrade** below the already-installed `0.1.2-alpha.4`. The wanted build sits on the `alpha` tag. | `fixture/attempt2-downgrade.log`, `fixture/npm-dist-tags.txt` |
| 3 | Window of damage | Attempt 2 did not just print an old string — it **replaced the global install** with a build from the previous line, across the on-disk home-format boundary `0.1.2-alpha.4` had already touched. Repair is to move **forward** to pinned `alpha.5` (which reads all three home generations), not to experiment on rc.2. | card `DSH-0.1.2-A5-03` |
| 4 | Correct order | stop the **whole** dsh process tree → prove the lock is gone → **external** terminal → pinned host install → verify `dsh --version` → pinned TUI install → verify → restart `dsh web` → hard refresh → plugin roster check. | section 4 |

Two independent traps that only look like one: (a) an **OS-level file lock** no browser action can release, and (b) a **registry alias** that silently moves the installation backwards. Neither is a DSH defect; both are procedural, which is why the fix is an ordered procedure rather than a flag.

---

## 1 · Evidence inventory

| File | Lines | What it establishes | What it does **not** establish |
|---|---|---|---|
| `fixture/attempt1-ebusy.log` | 5 | `EBUSY`, `syscall copyfile`, source `C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node`, destination under `C:\...\@deepseek-ai\.dsh-TMPDIR\...` | Which PID owns the lock (that comes from the process list), and whether the prefix was left half-written |
| `fixture/running-processes.txt` | 12 | Three `node.exe` at the time: **42432** = `dsh web` host, **23768** = agent session worker, **23920** = the npm install itself. The note states the host loaded `@koromix/koffi` at startup and that a browser refresh only reloads the SPA. | Whether 23768 also holds the addon (very likely — `2.3`), whether another process (AV scanner, editor) touches the file |
| `fixture/attempt2-downgrade.log` | 4 | The exact combined command: `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` — **two unpinned specs, one line**; then `dsh --version` → `0.1.1-rc.2` | The TUI's resolved version (not printed) |
| `fixture/npm-dist-tags.txt` | 7 | `next: 0.1.1-rc.2`, `latest: 0.1.1-rc.2`, `alpha: 0.1.2-alpha.5` — decisive for section 3 | Nothing about sub-package tags (separate packages) |
| `fixture/README.md` | 9 | Pack is static and read-only; grading requires the directory unchanged. | — |

The fixture was not modified; no npm/git command and no network call was made while producing this report.

---

## 2 · Attempt 1 — who holds `koffi.node`, and why a refresh cannot help

### 2.1 What the log literally says

```text
npm error code EBUSY
npm error syscall copyfile
npm error path C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node
npm error dest C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node
```

Three facts to extract:

1. **`EBUSY` is a Windows sharing/lock violation, not a permissions failure.** It maps to Win32 `ERROR_SHARING_VIOLATION` / `ERROR_LOCK_VIOLATION` surfacing through libuv (the same cause can appear as `EPERM` on other npm versions — do not read the code as the diagnosis).
2. **The failing operation is a copy**, i.e. npm is staging the new tree (destination under the prefix's `.dsh-TMPDIR`) while the existing package tree is live. The first **native binary** it touches aborts the run.
3. **`koffi.node` is a native addon**, not a JS file: `@koromix/koffi-win32-x64` is the prebuilt platform package for the FFI library `koffi` that DSH's filesystem/sandbox plane uses. The path in the log is exactly the prebuilt-binaries directory, so the locked file is the loaded image, not a stale duplicate.

### 2.2 The lock mechanism (why it exists at all)

When Node loads a `.node` file it calls `LoadLibraryEx`; Windows maps the PE image into the process as a **section object backed by that file**. From that moment:

* the file cannot be **overwritten or truncated** — write access is denied while the image is mapped;
* the file cannot be **deleted or renamed** — delete is refused or parked as *delete-pending*, so npm cannot replace the directory either;
* the constraint is per **process image**, and it is released only when the last process that mapped it **exits** (or unloads it — `FreeLibrary`, which dsh does not do at runtime).

`koffi` is loaded **at host startup** and stays loaded for the host's whole lifetime — sandbox/filesystem operations go through it. So the window in which the global tree is un-replaceable is exactly the window in which `dsh web` is up, which is exactly when people run `npm install -g`.

### 2.3 There is more than one holder — the process list is the point

`fixture/running-processes.txt` lists three `node.exe`:

| PID | Role | Holds `koffi.node`? | Consequence |
|---|---|---|---|
| 42432 | `dsh web` host | **Yes** — loaded at startup (stated in the capture) | Primary lock; must exit |
| 23768 | agent session worker | **Very likely yes** — a second Node process living in the same install tree, serving the same filesystem/sandbox plane. Treat as a holder until proven otherwise. | Stopping only the web host can leave the lock in place — the "I closed it and it still says EBUSY" experience |
| 23920 | the `npm install -g` process | No | Victim, not culprit — do **not** kill it as part of the fix |

Practical rule: **never stop by image name.** A blanket `taskkill /IM node.exe` also kills the running npm, unrelated Node tooling and your editor's language server. Identify by **command line and parent PID**; stop the host first so it can tear down its own children, then clean up orphans.

### 2.4 Why a browser-page refresh does not free the lock

Four reasons, in increasing order of importance:

1. **Wrong object.** The lock is an OS handle owned by a kernel-visible process image; the browser page is not a party to it. Reloading HTML/JS/WS cannot unmap a DLL in another process.
2. **Refresh ≠ restart.** F5/Ctrl+F5 replaces the renderer's document. The `dsh web` server keeps the same PID, the same mapped images, the same handles.
3. **Closing the tab is not a stop either.** `dsh web` is a server: with the tab closed it keeps running (and keeps working if a turn is in flight). Users "close the page", the tab disappears, and `node.exe` 42432 is still alive.
4. **A wedged host keeps the lock too.** If the host hangs or is killed at the wrong moment, Windows can leave the file *delete-pending*; it stays unavailable until the handle closes. "The window is gone" is not evidence — **"the process is gone"** is.

Mental model for the report's audience: *the lock lives in the host process, so the upgrade's precondition is process death, not browser hygiene.* A hard refresh belongs to the **verification** phase after restart (client bundles come from the host and must be re-fetched), never to releasing the lock.

### 2.5 The correct stop-then-upgrade sequence (attempt 1's remedy)

Ordering is the whole content of the fix; each step is a gate, not a suggestion.

1. **Stop the host gracefully.** In the console running `dsh web`, press `Ctrl+C` once and let it exit (it can flush sessions and close the sandbox). If it is detached/service-managed, stop it by PID.
2. **Stop leftover workers** (the 23768 class) — by PID, not by image name.
3. **Prove nothing is left.** No `node.exe` whose command line mentions dsh/`web`, and no process with `koffi.node` mapped. The negative check is the gate; the next step must not run on a hunch.
4. **Prove the file itself is free** (optional, decisive): try an exclusive open of the exact path. Success ⇒ the lock is really gone; sharing violation ⇒ something you have not identified still holds it.
5. **Use an external terminal.** Not a dsh session, not an agent chat inside the host: the session *is* the host process, and npm would be replacing the very package tree it executes from. This is not style — it is the structural failure mode where the tool call never returns and the install dies mid-reify.
6. **Install the pinned host version.** Pinned = exact version, never a tag (sections 3 and 4).
7. **Verify before touching anything else.** `dsh --version` must print the target; only then install the TUI, and only then start the host again.

### 2.6 What the aborted attempt may have left behind

An `EBUSY` abort is not guaranteed to be a no-op. Reify had already started staging (`.dsh-TMPDIR` in the log), so the prefix may hold: a full old tree plus stale staging dirs, or a partially replaced tree. Two checks settle it before any repair:

* `dsh --version` — does the command still resolve, and which version does it claim?
* `npm ls -g --depth=0` — does npm consider the global tree consistent, and what does it think is installed?

If `dsh` is gone or broken, the repair is **one more pinned global install from an external shell** (after the stop sequence) — never hand-copying directories or hand-writing shims: shims are generated at install time, and a hand-assembled tree gives a "works until the next install" state. (Here attempt 2 ran to completion afterwards, so the tree now holds rc.2 — `3.6`; the repair path is still the same pinned install.)

---

## 3 · Attempt 2 — why `dsh --version` shows `0.1.1-rc.2`

### 3.1 One-line answer

`npm install -g @deepseek-ai/dsh` is **not** "upgrade to the newest DSH" and **not** "keep what is installed". An unqualified spec means **`@deepseek-ai/dsh@latest`**, and at the time of the attempt `latest` pointed at `0.1.1-rc.2` while the requested build was reachable only through the `alpha` tag. npm therefore installed `0.1.1-rc.2` **over** `0.1.2-alpha.4` — a silent downgrade across release lines.

### 3.2 What a dist-tag is, and why `latest` is *older* here

A dist-tag is a **mutable name → version pointer** on the registry. It is not a version range and not a recency ranking; it is a label the publisher sets (`npm publish --tag alpha`, `npm dist-tag add`). The capture shows three labels diverging:

```text
next   : 0.1.1-rc.2
latest : 0.1.1-rc.2
alpha  : 0.1.2-alpha.5
```

Read it as three **channels**, not three rungs of one ladder:

* `latest` is the channel for the most *stable* line. Here it is the `0.1.1` release candidate — itself a prerelease, so "stable channel" does not mean "final build". npm installs a prerelease happily when a tag points at one.
* `next` is a second pointer into the same `0.1.1` line, so `@next` reproduces the identical trap. Only `alpha` (or the exact version) reaches `0.1.2-alpha.5`.
* Semver order is what users compare, and by semver `0.1.1-rc.2 < 0.1.2-alpha.4 < 0.1.2-alpha.5`. So the tag that sounds newest (`latest`) is the **oldest** of the three builds in the capture. Chronology and tag names disagree; that is the trap.

Generalised: **dist-tags encode the maintainer's channel policy, not the version ordering.** The installed version and a tag's target are unrelated values, and npm reconciles them in neither direction.

### 3.3 What npm does with the installed version (nothing)

For a global install, npm resolves the requested spec and **reifies that tree**, replacing whatever occupies the global prefix. There is:

* no "you already have something newer, skipping" guard;
* no downgrade prompt or `--allow-downgrade` gate for tag installs;
* no comparison between the installed version and the tag target.

The only non-negotiable signal is the binary's own report — `dsh --version` after the install — plus `npm ls -g --depth=0` for what npm believes it installed. "The install goes through fine" in the capture is accurate *as an npm statement* (exit 0) and completely wrong as a version statement. That asymmetry is why the trap survives review: the command looks idempotent ("just make sure it is there") and its effect is destructive.

### 3.4 The combined command made it worse, not safer

`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` carries **two** independent unqualified specs:

1. `@deepseek-ai/dsh` → `latest` → `0.1.1-rc.2` (the host, downgraded);
2. `@deepseek-harness-tui/dsh-tui` → *its own* `latest` (the plugin, at whatever that tag pointed to that day — unknown from the capture).

None of the following protects the host:

* **The plugin's peer range.** A `peerDependencies` entry on `@deepseek-ai/dsh` is a *warning* (at worst an `ERESOLVE` refusal for the plugin); it never pins, constrains or upgrades the host you asked for in the same command. A TUI built against the `0.1.1` line is perfectly happy with rc.2 — that compatibility is what makes the downgrade look correct.
* **Ordering inside one command.** npm installs the requested specs as one reify: no "host first, then plugin" semantic, and no checkpoint where a human could read `dsh --version`.
* **Failure isolation.** Two specs, one operation: if either half fails (mirror lag, peer refusal, lock), the prefix can be left mixed and the user cannot tell which half landed.

So the combined command is the *worst* form of the correct sequence — it bundles a destructive unpinned host install with a plugin install and reports success.

### 3.5 Collateral damage: the downgrade crossed a home-format boundary

Attempt 2 did not merely print an old number. The global package was replaced by a `0.1.1`-line build while the on-disk `$DSH_HOME` had already been through `0.1.2-alpha.4`. The alpha.5 corridor's host fix (card `DSH-0.1.2-A5-03`) documents this family of failure on the *forward* path: a home written by one `session_projcache` generation can be refused at boot or silently lose session titles when a different generation opens it, and a bad bootstrap can persist ("poison") the tree. The reverse direction — alpha.4-written state opened by rc.2 — is the same class of risk, with no fix card at all.

Practical conclusion: **do not run the rc.2 host against the existing home and do not "check whether rc.2 is fine".** The repair is a pinned `0.1.2-alpha.5` install (its host fix reads all three generations) plus a snapshot of `$DSH_HOME` taken before the first alpha.5 boot — cheap insurance, and the only sound rollback here.

### 3.6 Prove it on the machine (read-only, no install)

```powershell
npm ls -g --depth=0                     # what npm thinks is installed globally
npm view @deepseek-ai/dsh dist-tags     # which channel points where, right now
npm view @deepseek-ai/dsh versions --json | Select-Object -Last 20
npm config get registry                 # a mirror may lag the alpha publication
```

Expected reading: the installed version is `0.1.1-rc.2`, `latest` still points at it, `0.1.2-alpha.5` appears in `versions` and on `alpha`. If `0.1.2-alpha.5` is **absent** from `versions` on the configured registry, the cause is mirror lag rather than a wrong pin — check the official registry before concluding anything (registry-side pitfall `R-08` in the corridor rollup).

---

## 4 · The safe upgrade for this machine (alpha.5 + the TUI plugin)

Run every block in an **external** PowerShell window (Windows Terminal or a plain console), never from inside a dsh session. Blocks are gates: do not continue past a block whose check fails.

### Phase 0 — pre-flight (read-only)

```powershell
# 0.1 What is installed now, and where does each channel point?
npm ls -g --depth=0
npm view @deepseek-ai/dsh dist-tags
npm view @deepseek-ai/dsh@0.1.2-alpha.5 version      # must print 0.1.2-alpha.5
npm config get registry                              # mirror that lags => E404/ETARGET later

# 0.2 Snapshot the home before any boot of a new host (this is the rollback that works)
$stamp = Get-Date -Format yyyyMMdd-HHmm
Copy-Item -Recurse -Force "$env:USERPROFILE\.dsh" "$env:USERPROFILE\.dsh.bak-$stamp"
```

If 0.1 cannot resolve `0.1.2-alpha.5`, stop: that registry (or its mirror) does not have the build yet. Wait, or use the official registry **for this one command** (`--registry https://registry.npmjs.org`) — do not permanently reconfigure the machine for a single install.

### Phase 1 — stop the whole host tree and prove the lock is gone

```powershell
# 1.1 Identify, do not guess. (PIDs below are from the capture; re-discover them.)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, ParentProcessId, CommandLine | Format-List

# 1.2 Stop gracefully: Ctrl+C in the console that runs the dsh web host, let it exit.
#     Then stop leftovers by PID (host first, then orphaned workers):
Stop-Process -Id 42432 -ErrorAction SilentlyContinue          # dsh web host
Stop-Process -Id 23768 -Force -ErrorAction SilentlyContinue   # agent session worker
#     Never: taskkill /IM node.exe   (kills npm, editors' language servers, other tooling)

# 1.3 Gate A: no dsh node process left
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, CommandLine
#     expect: nothing whose CommandLine runs dsh / dsh web / the session worker

# 1.4 Gate B: nobody has koffi.node mapped
tasklist /M koffi.node
#     expect: "INFO: No tasks are running which match the specified criteria."

# 1.5 Gate C (decisive): is the file itself free? Try an exclusive open.
$p = Join-Path (npm root -g) '@koromix\koffi-win32-x64\win32_x64\koffi.node'
try { $fs = [System.IO.File]::Open($p,'Open','ReadWrite','None'); $fs.Dispose(); 'LOCK RELEASED' }
catch { "STILL LOCKED: $($_.Exception.Message)" }
```

Only `LOCK RELEASED` (with clean 1.3/1.4) authorises Phase 2. A browser refresh cannot change any of these results.

If Gate C still reports a lock while 1.3/1.4 look clean, an unidentified process holds the addon (AV scanner, a second DSH install, an editor extension host, a leftover service). Find it with `handle.exe koffi.node` (Sysinternals) or Resource Monitor → CPU → Associated Handles, and stop **that** process. Never "work around" the lock by renaming the file inside the live tree.

### Phase 2 — install the pinned host

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
```

Exact version — not `@alpha`, not bare. A tag works today and moves tomorrow; the exact spec is the only form whose effect you can state in advance.

### Phase 3 — verify before anything else

```powershell
dsh --version                       # must print 0.1.2-alpha.5
npm ls -g --depth=0 @deepseek-ai/dsh
```

Wrong number ⇒ stop and diagnose (registry/mirror resolution, an npm shim shadowed by an older install, `npm prefix -g` versus the `PATH` entry that actually wins). Do **not** stack a second unpinned install on top to "fix" it — that is attempt 2 again.

### Phase 4 — install the TUI plugin, pinned, as a separate step

```powershell
# 4.1 Which release of the TUI targets this host?
npm view @deepseek-harness-tui/dsh-tui dist-tags --json
npm view @deepseek-harness-tui/dsh-tui peerDependencies --json   # does it admit 0.1.2-alpha.5?

# 4.2 Install the exact version you just inspected
npm install -g @deepseek-harness-tui/dsh-tui@<exact-version>

# 4.3 Verify the TUI, and that the host still reports alpha.5
dsh-tui --version        # adjust to the binary the package ships
dsh --version
```

If the TUI release you inspected does **not** admit `0.1.2-alpha.5` in its peer range, that is a signal to pick a TUI release built for the alpha line (or to wait) — never a reason to lower the host to the TUI's line. Separate commands also mean a TUI failure leaves you with a verified host and a clear next step instead of a mixed prefix.

### Phase 5 — start the host, refresh hard, verify the plugins

```powershell
dsh web
```

Then in the browser:

1. **Hard refresh** (`Ctrl+Shift+R`, or DevTools → "Empty Cache and Hard Reload"). A normal reload can reuse the previous client bundle set, and an in-place host upgrade is exactly when a stale bundle combination misbehaves.
2. Confirm the version marker shows `0.1.2-alpha.5`.
3. Confirm all six plugins are present in the roster, none stuck "waiting"/disabled; open one panel from each of the three GitHub-mirror sources to prove each half registered.

For this edge no plugin re-install is required: `alpha.4 → alpha.5` is a restart-only edge for plugins (package inventory, session read API, presets and the Remote wire unchanged; the only cards are two optional storage-domain capabilities, `DSH-0.1.2-A5-01` and `DSH-0.1.2-A5-02`, plus the host boot/title fix `DSH-0.1.2-A5-03`). If a plugin fails after the upgrade, the first suspect is the home/boot fix, not the plugin's code.

### Phase 6 — rollback (only if Phase 3/5 fail)

```powershell
# stop the host first (Phase 1), then:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.4
```

Caveat that belongs in the same breath: reverting the **binary** does not revert the **home**. Once alpha.5 has booted and written, going back to alpha.4 is not a supported state — restore the `$DSH_HOME` snapshot from Phase 0.2 instead, and treat the version rollback as a last resort for a machine whose data you can afford to lose.

### What not to do (each line is one of the two traps in disguise)

| Tempting action | Why it is wrong here |
|---|---|
| `npm install -g @deepseek-ai/dsh` "to be sure it is current" | Resolves `latest` = `0.1.1-rc.2` and downgrades the host. This *is* attempt 2. |
| `npm install -g @deepseek-ai/dsh@latest` | Same thing, spelled out. |
| `npm install -g @deepseek-ai/dsh@next` | `next` also points at `0.1.1-rc.2` in the capture. |
| `npm install -g … && dsh web` in one line | Removes the verification gate and can restart the host on a broken prefix. |
| Running the install from a dsh session / agent chat | The session is the host; replacing its tree mid-run kills the install and the tool call. |
| Refresh the browser, then retry the install | The lock is unaffected; same `EBUSY`, one more partially staged tree. |
| `--force` / `--ignore-scripts` to push past the error | Neither releases a Windows image lock; `--ignore-scripts` also skips native/shims work the next boot needs. |
| Rename or delete `koffi.node` inside the live tree | The file is in use: rename yields delete-pending or a broken package. Stop the process instead. |

---

## 5 · Prevention — what plugin README authors must change

The failure is authored, not accidental: a README line that says "install the host and my plugin" teaches every user to run the exact command that downgrades them. The fix is a **snippet contract** — five fields per command: prerequisites, exact spec, expected output, next step, rollback.

### 5.1 Rules

1. **Never ship a bare host package name.** `npm install -g @deepseek-ai/dsh` is a dist-tag install. Write the exact version your release was tested against (`@deepseek-ai/dsh@0.1.2-alpha.5`). If you must use a channel, name it (`@alpha`) **and** state the version it resolved to on the date of writing — a tag is a moving pointer and your snippet changes meaning silently.
2. **Never bundle the host install with the plugin install.** Two commands, two gates. A combined line has no checkpoint, cannot be partly verified, and hides a host downgrade behind a plugin that "installed fine".
3. **Say that `latest` may be *older* than what the user runs.** One sentence — "a bare install follows the `latest` tag, which currently points at an older release line than the alpha you need" — prevents the whole class of report. Better: give the check (`npm view <pkg> dist-tags`).
4. **Put the stop step in the snippet, with the Windows symptom.** On Windows a running host locks its own install tree: `EBUSY` on copy/replace, and **a browser refresh does not help because the lock is in the host process**. Give the stop command, the "no node process left / no `koffi.node` mapped" check, then the install.
5. **Print the expected output next to every verification command.** `dsh --version` → `0.1.2-alpha.5`. Users read exit 0 as success; the trap is that exit 0 is exactly what a downgrade returns.
6. **Give the rollback line and its data caveat.** A pinned re-install of the previous version is fine; claiming it "restores everything" is not, because the host's on-disk home format moves with the version. Say which one is true for your plugin.
7. **Declare the supported host in prose *and* in `peerDependencies`.** The peer range produces install-time warnings; it does not pin the host. Prose is what a human copies, the peer range is what a resolver checks — hard-code the tested version in both.
8. **Never tell users to run a global install from inside a DSH session.** The session is the host process: the install replaces the tree it executes from, can die mid-reify, and leaves the `dsh` command broken until an external pinned re-install repairs it. Say "external terminal" explicitly.
9. **Re-verify the snippet at every release.** An install line ages: the tag it relied on moves, the host it named is superseded. Treat the snippet as a tested artifact with a "verified against" date, like a lockfile.
10. **Do not paper over platform failures with flags.** `--force`, `--ignore-scripts`, "run as admin" turn a clear lock error into an inconsistent installation.

### 5.2 Template (the shape every plugin README should use)

```markdown
## Install

Requires DSH 0.1.2-alpha.5 (tested; see peerDependencies). The dsh host must be fully
stopped — on Windows a running host keeps native modules (e.g. koffi.node) locked and the
install fails with EBUSY; refreshing the browser does not release it.

1. Stop every dsh process, then confirm none is left:
       tasklist /M koffi.node         # expected: no matching tasks
2. In an EXTERNAL terminal, install the exact host build (never a bare package name —
   a bare name follows the latest dist-tag and can install an OLDER line):
       npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
3. Verify before continuing (a successful npm exit code does not mean the right version):
       dsh --version                  # expected: 0.1.2-alpha.5
4. Install this plugin, pinned to the tested release:
       npm install -g @deepseek-harness-tui/dsh-tui@<exact-version>
5. Start the host and hard-refresh the browser (Ctrl+Shift+R):
       dsh web

Rollback (stop the host first): npm install -g @deepseek-ai/dsh@<previous-version>
Note: rolling back the package does not roll back the host's on-disk data format;
restore your $DSH_HOME backup if the newer host already booted.
```

### 5.3 Anti-pattern → correct form

| Anti-pattern (seen in the wild, and in this evidence pack) | Correct form |
|---|---|
| `npm i -g @deepseek-ai/dsh @scope/my-plugin` | Two pinned commands with a `dsh --version` gate between them |
| `npm i -g @deepseek-ai/dsh` "just to get the CLI" | `npm i -g @deepseek-ai/dsh@<exact tested version>` |
| "Install the latest DSH, then my plugin" | "Install DSH `<version>` (tested); do not substitute `latest`, it currently points at `<other line>`" |
| Install instructions only, no stop step | Stop step + lock check + install + verify, in that order |
| "If it fails, retry / run as admin / `--force`" | Name the failure (`EBUSY` = host still running) and the fix (stop the process) |
| A plugin version with no host version anywhere | `peerDependencies` range **and** the tested exact version in prose |

### 5.4 What the host project should keep doing

Publish prereleases to their own channel (`alpha`, `next`) and keep `latest` on the stable line — that policy is correct and is *why* the tag split exists. The gap is documentation, not tagging: any page whose copy-paste install line omits the version recreates attempt 2 for the next user. Likewise `0.1.2-alpha.5` is the right target here not only because it is the requested build but because `DSH-0.1.2-A5-03` is the release that tolerates homes written by rc.2 / alpha.3 / alpha.4 — the upgrade is also the repair for the state attempt 2 created.

---

## 6 · What could not be verified here (honest limits)

| Item | Status |
|---|---|
| Actual PID→handle mapping on the user's machine | Inferred from `running-processes.txt`, which itself states the host holds the addon; Phase 1 gates confirm it in one command. |
| Whether the agent worker (23768) independently holds `koffi.node` | Not stated in the capture. Treated as a holder — the safe assumption, cheap to check. |
| Whether aborted attempt 1 left a half-written prefix | Unknown from the fixture; `2.6` gives the two checks. Moot for the version number, since attempt 2 replaced the tree. |
| The TUI package's exact current version and its peer range for `0.1.2-alpha.5` | Not in the evidence pack; Phase 4 inspects it before installing. |
| Whether the six GitHub-installed plugins need any change for this edge | The `alpha.4 → alpha.5` corridor has no plugin-facing breaking card (restart-only), so none expected; Phase 5's roster check is the empirical answer. |
| Whether the home was already "poisoned" by earlier boots | Unknown; `DSH-0.1.2-A5-03` says alpha.5 self-heals the documented shapes, which is why the Phase 0.2 snapshot is the only real safety net. |
| Live registry state | Not queried (read-only task, no network). The capture's dist-tags listing is the authority for attempt 2; Phase 0 re-reads it before acting. |

**Bottom line.** Attempt 1 failed on an OS-level image lock owned by the running host — stop the process tree, prove the lock is gone, and only then replace files. Attempt 2 failed because an unqualified global install is a `latest`-tag install, and `latest` pointed at an older release line; the plugin in the same command offered no protection. The safe path: snapshot the home, stop and verify, install `@deepseek-ai/dsh@0.1.2-alpha.5` from an external shell, verify `dsh --version`, then install the TUI pinned and separately, then restart and hard-refresh. For README authors: pin the host, split the commands, put the stop and the expected output in the snippet, and say out loud that `latest` is a channel, not a version.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.