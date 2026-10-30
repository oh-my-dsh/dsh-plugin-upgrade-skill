# JUDGE BRIEF · noskill.S12-global-upgrade-ebusy-trap

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

# S12 - Global Upgrade: EBUSY + Downgrade Trap (diagnosis and safe upgrade procedure)

**Scope:** read-only analysis of the evidence pack in `fixture/` (left untouched). No installs, no migrations, no
registry calls, no `dsh` CLI invocations were performed. Everything below is derived from the four evidence
files plus the task brief; anything the fixture does not establish is explicitly marked **UNCONFIRMED**.

**Environment in the brief:** Windows, DSH `0.1.2-alpha.4` running, six community Web plugins from three
GitHub mirrors, target release `dsh-v0.1.2-alpha.5`.

---

## 0. TL;DR (the answer in one block)

**Attempt 1** failed because the **running DSH web host process itself** had the native addon `koffi.node`
memory-mapped, and Windows keeps a lock on a loaded image for the whole life of the process. A browser refresh
reloads only the SPA (a client of that host) - it never unloads the addon, so the lock survives. Only
**exiting the host process** releases it.

**Attempt 2** "succeeded" and silently **downgraded** because the README's combined command left
`@deepseek-ai/dsh` **unversioned**. An unversioned `npm install -g <pkg>` resolves to the registry's
**`latest` dist-tag**, and per `npm-dist-tags.txt` `latest` pointed at `0.1.1-rc.2` - an *older* line than
the `0.1.2-alpha.4` that was already installed. A global npm install **replaces** the global installation; it
does not preserve or advance the version you had. The alpha line lives under the **`alpha`** tag
(`alpha: '0.1.2-alpha.5'`).

**Safe sequence:** stop every DSH host -> prove the lock is gone -> install the **pinned** core
`@0.1.2-alpha.5` (and the plugin) -> verify `dsh --version` -> restart the host.
Both fixes are needed: stopping alone still downgrades, pinning alone still hits EBUSY.

---

## 1. Evidence inventory (key points only)

| File | Key points |
|---|---|
| `attempt1-ebusy.log` | `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` -> `npm error code EBUSY`, `npm error syscall copyfile`; `path` = the **already-installed** `C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node`; `dest` = `C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node` (npm staging dir). The spec was correctly **pinned**. |
| `running-processes.txt` | Three `node.exe`: **42432 = dsh web host (explicitly "holds koffi.node")**, 23768 = agent session worker, 23920 = the failing `npm install -g`. Comment: the web host loaded `@koromix/koffi` (native FFI addon for sandbox/filesystem ops) at startup; a loaded `.node` binary is OS-locked until the process exits; **refreshing the browser page only reloads the SPA, the host process stays alive**. |
| `attempt2-downgrade.log` | `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` -> installs fine, then `dsh --version` -> `0.1.1-rc.2`. The core spec is **unversioned**. |
| `npm-dist-tags.txt` | `next: '0.1.1-rc.2'`, `latest: '0.1.1-rc.2'`, `alpha: '0.1.2-alpha.5'`. |
| `README.md` | Static evidence-pack index; states the fixture must stay unchanged. |

Registry state at the time of both attempts (single source, `npm-dist-tags.txt`):

```
latest -> 0.1.1-rc.2      <-- what an unversioned global install resolves to
next   -> 0.1.1-rc.2
alpha  -> 0.1.2-alpha.5   <-- the release you actually want
```

---

## 2. Question 1 - Attempt 1 root cause: why `koffi.node` is locked

### 2.1 What is holding it

* The failing file is the **native FFI addon `koffi.node`** shipped inside the platform package
  `@koromix/koffi-win32-x64` (Windows x64 build), which the DSH host loads at startup for its
  sandbox/filesystem operations (`running-processes.txt` states this explicitly).
* The holder is **`node.exe` PID 42432 - the DSH web host** (the fixture annotates it
  `<- dsh web host (holds koffi.node)`). The other two `node.exe` entries are the agent session worker
  (23768) and the failing `npm install -g` itself (23920) - the npm process is the *reporter* of EBUSY, not
  the holder.
* **Mechanism:** `koffi.node` is a native image (a DLL in `.node` clothing). Once a process loads it, Windows
  maps it into the process address space and holds a lock on the backing file for the **lifetime of the
  process**. A live, mapped image cannot be overwritten or re-copied.
* **Why the error mentions a *copy* and a *staging* destination:** npm's global reify does not overwrite the
  old tree in place. It stages the new tree under the global prefix
  (`<global-prefix>\@deepseek-ai\.dsh-TMPDIR\...`) and moves the previously installed files around. The copy
  whose source is the **already-installed**
  `...\@koromix\koffi-win32-x64\win32_x64\koffi.node` is the one that is denied - precisely the file the live
  host has mapped. Hence `syscall copyfile`, with `path` = installed copy and `dest` = temp staging copy.
  `EBUSY` is npm's rendering of the Windows sharing/lock violation.
* **Consequence beyond this one file:** the same lock will also break `npm uninstall -g @deepseek-ai/dsh` and
  any global mutation that has to replace the loaded `.node`. The rule is therefore *"stop the host before any
  global mutation of DSH or of koffi"*, not only for installs.

### 2.2 Why a browser-page refresh does not free the lock

1. The lock is held **by the OS against the host process**, not against the browser tab. Its lifetime is the
   process lifetime.
2. The browser page is a **client** of the host (it talks to it over the local web socket on
   `http://127.0.0.1:3080`). A refresh tears down and re-creates only the *client-side* SPA; the host process
   never restarts, never unloads the addon, and keeps the image mapped.
3. So the refresh changes nothing at the OS level: host PID 42432 is still alive, still has `koffi.node` mapped,
   and the file is still locked. **Only terminating the host process** unmaps the image and releases the lock.

Corollary: "the GUI looks stopped / the page is blank" is *not* evidence that the host exited. The only reliable
check is the **process table**, not the browser.

### 2.3 The correct stop-then-upgrade sequence (Windows)

```powershell
# 1) STOP every DSH host that has koffi loaded.
#    Preferred: go to the terminal that launched "dsh web" and press Ctrl+C (graceful).
#    If you no longer have that terminal, kill the recorded host PID and its child tree:
taskkill /PID 42432 /T
#    (add /F only if the graceful form refuses; PID 42432 is the dsh web host from running-processes.txt)
#    NOTE: /T also takes down child workers (e.g. the agent session worker 23768) the host spawned.

# 2) PROVE the lock is gone before touching npm.
tasklist /FI "IMAGENAME eq node.exe"
#    -> PID 42432 (the dsh web host) MUST be absent.
#    -> Only your own npm process should remain while installing.
#    Optional extra proof if Sysinternals "Handle" is installed on the box:
#       handle koffi.node
#    (not part of the evidence pack; treat as optional tooling, UNCONFIRMED availability)

# 3) NOW install (still with the explicit version pin - see section 4).
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

# 4) VERIFY, then restart the host and reload the browser page.
dsh --version
dsh web
```

Rules that fall out of this:

* Do the stop **before** the install, and prove it in the process table - not by refreshing the page.
* Stop **all** DSH instances (web host, plus any CLI/headless DSH you have open) that may have loaded
  `koffi`. The fixture only marks the web host as the holder; whether the agent session worker (PID 23768)
  also loaded `koffi` is **UNCONFIRMED** - if it did, it must exit too (killing the host tree with `/T`
  covers that case).
* The upgrade is **not** a hot operation: the host must be down for the whole copy phase. That is why the
  install goes *after* the verification, not in parallel.
* Re-check after the install that no DSH process was auto-restarted by a supervisor/service before you re-run
  the install.

---

## 3. Question 2 - Attempt 2 root cause: why `dsh --version` printed `0.1.1-rc.2`

### 3.1 What the unpinned spec resolved to, and why

* The command was `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`. The first spec carries **no
  version and no dist-tag**.
* npm's rule: **an unversioned `npm install <pkg>` installs the version the registry's `latest` dist-tag
  points to.** The registry state at that moment (`npm-dist-tags.txt`) was `latest: '0.1.1-rc.2'`. Therefore
  the combined command **requested 0.1.1-rc.2** for the core - before npm even started copying. The install then
  "went through fine" because it was doing exactly what it was asked to do.
* **Why `latest` points at an older line than your install:** `latest` is the *stable* channel. npm never
  moves `latest` onto a prerelease (any version with a hyphen - `-rc.2`, `-alpha.5` - is a prerelease), so
  the alpha line is published under a separate tag. This publisher uses `alpha` for the `0.1.2-alpha.x` line
  and keeps `latest`/`next` on the `0.1.1-rc.x` line; both were `0.1.1-rc.2`.
* **Why the already-installed alpha.4 did not protect you:** a global `npm install` is a *declarative reify*.
  It computes the desired tree from the **registry + your specs** and **replaces** the global installation of
  that package. The previously installed `0.1.2-alpha.4` is not a floor, not a constraint, and is not even
  consulted when choosing the version. So an unpinned global install can - and here did - **silently downgrade**
  you across release lines. There is no error, no warning, and no "keep the current version" behaviour.
* **The tag matching your intent is `alpha`** (`alpha: '0.1.2-alpha.5'`); **the tag the unpinned command
  followed was `latest`** (`0.1.1-rc.2`).

### 3.2 Proof you can run yourself (pre-flight, read-only against the registry)

```powershell
npm view @deepseek-ai/dsh dist-tags        # see exactly which tag points where
npm view @deepseek-ai/dsh@alpha version    # what the alpha channel resolves to right now
npm ls -g --depth=0                       # what is actually installed globally
```

After any global install, `npm ls -g --depth=0` is the ground truth for "what did I just get?" - it would
have shown the downgrade immediately after attempt 2, before running `dsh --version`.

### 3.3 Two rules that follow

1. **Never** leave the core unversioned in a global install command - not alone, and especially not inside a
   combined/multi-package command copied from a README.
2. A global install is a **replace**, not an **advance**. If you want a specific build, name it exactly
   (`@deepseek-ai/dsh@0.1.2-alpha.5`) or name the channel tag explicitly (`@deepseek-ai/dsh@alpha`, currently
   `0.1.2-alpha.5`). Exact versions are reproducible; the `alpha` tag floats forward when a new alpha is
   published.

---

## 4. Question 3 - the exact safe upgrade commands for this situation

**Goal:** DSH `0.1.2-alpha.5` **and** the TUI plugin (`@deepseek-harness-tui/dsh-tui`), on Windows, with the
six community Web plugins left intact.

### 4.1 Recommended ordered procedure

```powershell
# --- Phase A: stop the host so the koffi.node lock is released ---------------------
# Preferred: Ctrl+C in the terminal running "dsh web".
# Otherwise kill the recorded host and its tree:
taskkill /PID 42432 /T
# Verify: the dsh web host PID must be gone before you install.
tasklist /FI "IMAGENAME eq node.exe"
# Expected: no dsh web host / dsh CLI process remains (only npm itself while installing).

# --- Phase B: record the "before" state (optional but cheap) ----------------------
dsh --version                # expect 0.1.2-alpha.4
npm ls -g --depth=0          # note the six Web plugin versions (for rollback comparison)

# --- Phase C: install the plugin first, the PINNED core LAST ---------------------
# C1. TUI plugin. Pin it too if you know its version (recommended: @<exact-version>).
npm install -g @deepseek-harness-tui/dsh-tui

# C2. The core, exactly pinned - LAST, so nothing a plugin install does can leave
#     the global prefix on the "latest" (rc.2) build.
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

# --- Phase D: verify (do not skip; this is the safety net) -----------------------
dsh --version                # MUST print 0.1.2-alpha.5
npm ls -g --depth=0          # MUST show @deepseek-ai/dsh 0.1.2-alpha.5

# --- Phase E: restart the host, then reload the browser page ---------------------
dsh web
```

**If step D shows `0.1.1-rc.2` again** (i.e. a plugin install re-resolved the core to `latest`), re-run
the pinned core install - the last writer decides the outcome:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
dsh --version                # expect 0.1.2-alpha.5
```

### 4.2 Single-command variant (also correct - the pin must be present)

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
```

This is fine **because the core spec is pinned**. The failure in attempt 2 was not the combined command per se;
it was the *unversioned* core spec inside it. Still run the `dsh --version` / `npm ls -g --depth=0`
verification afterwards, and prefer the two-step order in 4.1 when a plugin declares a peer dependency on the
core (see 4.4).

### 4.3 Channel-tag alternative (acceptable, but floating)

```powershell
npm install -g @deepseek-ai/dsh@alpha      # resolves to 0.1.2-alpha.5 per npm-dist-tags.txt
```

Use this only when you deliberately want to track the alpha channel. The tag moves when the publisher cuts a
new alpha, so a re-run of the same command can install a *different* alpha. For a reproducible upgrade use the
exact version `0.1.2-alpha.5`.

### 4.4 Peer-dependency / plugin-interaction caveat

Whether `@deepseek-harness-tui/dsh-tui` declares a `peerDependencies` entry on `@deepseek-ai/dsh` is
**UNCONFIRMED** - the evidence pack contains no package metadata for it. If it does, npm may try to reconcile the
core version during the plugin install, which is exactly the class of event that can move the global `dsh` off
the pin. Mitigations, in order of preference:

* install the pinned core **last** (4.1);
* verify after **every** install step (Phase D);
* if npm reports a peer conflict (`ERESOLVE`), resolve it in favour of the pin - do **not** "fix" it by
  installing the unversioned core, and do **not** use `--force`/`--legacy-peer-deps` to bulldoze a peer range
  that conflicts with your chosen version.

### 4.5 Rollback

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.4     # restore the previously running build
dsh --version                                      # expect 0.1.2-alpha.4
```

The host must be stopped for the rollback install as well - same lock, same reason. The six community Web
plugins are separate global packages and are untouched by a core rollback; re-check them with
`npm ls -g --depth=0`.

### 4.6 What the fixture does not tell us about the six Web plugins

The brief mentions "six community Web plugins across three GitHub mirrors", but the evidence pack lists **no**
plugin package names, versions or install commands for them. What *is* established by the two failures is the
pattern to audit: **any** of their READMEs that recommends a combined
`npm install -g @deepseek-ai/dsh <plugin>` command carries the same downgrade trap, and any README that says
"install while DSH is running" carries the same EBUSY trap. Their individual status is **UNCONFIRMED** - check
each README against section 5.

---

## 5. Question 4 - Prevention: what plugin README authors should change

The trap is authored into the README, so the fix belongs in the README. Five concrete changes:

1. **Pin the core in every install command.** Never ship an unversioned `@deepseek-ai/dsh` in a combined
   command. The published command must name the exact tested version:
   `npm install -g @deepseek-harness-tui/dsh-tui@<plugin-version> @deepseek-ai/dsh@0.1.2-alpha.5`.
   If the intent is "track the alpha channel", write the tag explicitly (`@deepseek-ai/dsh@alpha`) **and** say
   in prose that the tag floats, so a reader understands why the resulting version may differ from the one in the
   README. Never leave it implicit.
2. **Spell out that the core is replaced, not upgraded.** A one-line warning is enough: *"`npm install -g
   @deepseek-ai/dsh` (no version) resolves to the registry's `latest` tag, which on this package currently
   points at a different (older) release line than the one you already have - it will **downgrade** your
   installation without any error."*
3. **Document the stop-first requirement, with the symptom.** Add a troubleshooting entry: *"installing DSH
   while it is running fails with `npm error code EBUSY` while copying `koffi.node`. The DSH web host loads
   this native addon at startup and Windows keeps the file locked until the **host process exits**. Refreshing
   the browser page does **not** release the lock - it only reloads the UI. Stop the host (Ctrl+C in the terminal
   running `dsh web`; on Windows `taskkill /PID <host-pid> /T`) and confirm it is gone with
   `tasklist /FI "IMAGENAME eq node.exe"` before installing."*
4. **Publish a stop -> install -> verify -> restart sequence, with the expected output.** Verification is what
   turns a silent downgrade into a visible one. Suggested template:

   ```bash
   # 1. STOP DSH first (Ctrl+C in the terminal running "dsh web").
   #    Windows check:  tasklist /FI "IMAGENAME eq node.exe"   -> no dsh host PID left
   #    macOS/Linux:     pgrep -f dsh                          -> no dsh process left

   # 2. Install the plugin AND the exact DSH version it was tested with.
   npm install -g @deepseek-harness-tui/dsh-tui@0.1.0 @deepseek-ai/dsh@0.1.2-alpha.5

   # 3. Verify (expected output shown).
   dsh --version      # expected: 0.1.2-alpha.5
   npm ls -g --depth=0

   # 4. Restart DSH.
   dsh web
   ```

   Note in the README that the core spec must stay pinned, and that if a plugin install changes the reported
   version, the fix is to re-run the pinned core install.
5. **Declare the supported core range and test the documented command in CI.** Put a `peerDependencies` (or at
   minimum a documented "tested with DSH x.y.z" line) on the plugin so npm surfaces incompatibilities instead of
   silently resolving them, and run the exact README command in CI on Windows (the EBUSY case is
   Windows-specific) and on macOS/Linux. Publish a compatibility matrix so a user knows which core version to pin
   for which plugin release.

**Bonus rule:** README commands should never rely on "install the latest of everything" for a package whose
release lines live behind non-`latest` tags. Prerelease channels (`alpha`, `next`, `beta`) are the normal
way to ship a pre-1.0 line; every command that touches such a package must name the channel or the exact version.

---

## 6. Claims: confirmed vs unconfirmed

**Confirmed by the fixture**

* The EBUSY is a `copyfile` on the installed
  `C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node`, staged to npm's `.dsh-TMPDIR`
  (`attempt1-ebusy.log`).
* The holder is the DSH web host `node.exe` PID 42432, which loaded `@koromix/koffi` at startup; the lock
  lives as long as the process, and a browser refresh does not end it (`running-processes.txt`).
* Attempt 1's spec was correctly pinned to `0.1.2-alpha.5`; the only failure there was the lock.
* Attempt 2's core spec was unversioned, the install succeeded, and `dsh --version` then reported
  `0.1.1-rc.2` (`attempt2-downgrade.log`).
* Registry dist-tags at that time: `latest`/`next` -> `0.1.1-rc.2`, `alpha` -> `0.1.2-alpha.5`
  (`npm-dist-tags.txt`).

**UNCONFIRMED (not stated anywhere in the brief or fixture - flagged rather than guessed)**

* Whether `@deepseek-harness-tui/dsh-tui` has a `peerDependencies` on `@deepseek-ai/dsh` (and its version
  range), and its own published versions.
* Whether the agent session worker (PID 23768) also loaded `koffi`; the fixture attributes the lock only to
  PID 42432.
* The identities, versions and install commands of the six community Web plugins and their three GitHub mirrors.
* Whether a Windows service/supervisor would auto-restart the DSH host (and re-take the lock) between the stop
  and the install.
* The exact Win32 error code behind npm's `EBUSY` (sharing violation vs. delete-pending) - irrelevant to the
  fix, but not recorded in the log.
* Whether the registry's `latest` tag has since moved; the dist-tags listing is a point-in-time capture.

**Deliberately not done:** no `npm install`/`uninstall`/`upgrade`, no registry calls, no `dsh` CLI
invocation, no host/inspector introspection, no writes outside this report directory. The `fixture/` tree was
left byte-identical (SHA-256 re-checked against `fixture-seal.pre.json` after writing this report).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.