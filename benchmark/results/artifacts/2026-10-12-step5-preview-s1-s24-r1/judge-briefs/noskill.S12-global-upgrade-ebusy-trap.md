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

# S12 — Global Upgrade EBUSY + Downgrade Trap: Diagnosis & Remedy

**Context (from evidence pack):** running dsh `0.1.2-alpha.4`, target `dsh-v0.1.2-alpha.5`.
Evidence: `attempt1-ebusy.log`, `running-processes.txt`, `attempt2-downgrade.log`, `npm-dist-tags.txt`.

---

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

### What is holding the file

`attempt1-ebusy.log` shows npm failing on `syscall copyfile` while staging
`C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node` into the reify temp dir
(`C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node`).

`running-processes.txt` identifies the holder:

| PID | Process | Role |
|-----|---------|------|
| 42432 | `node.exe` | **dsh web host — holds `koffi.node`** |
| 23768 | `node.exe` | agent session worker (child of the host) |
| 23920 | `node.exe` | the `npm install -g` itself |

`koffi` (`@koromix/koffi`) is dsh's native FFI addon used for sandbox/filesystem
operations. `koffi.node` is a **native binary (a DLL under the `.node` extension)**.
When the dsh web host (PID 42432) starts, it loads that library, and the Windows
loader creates an **image section** on the file. While that section exists the OS
refuses to delete, move, rename, or overwrite the file — the syscall returns
`ERROR_BUSY` / `EBUSY`. npm's reify must replace/move the files of the currently
installed package tree (including the live `koffi.node` inside
`@koromix/koffi-win32-x64`) while writing the new `0.1.2-alpha.5` tree, so the
copy fails and the whole install aborts, leaving the `.dsh-TMPDIR` partial state
visible in the log.

### Why a browser-page refresh does not free the lock

A browser refresh only reloads the front-end SPA / HTTP session **inside the
browser**. The thing holding the lock is the **local `node.exe` host process
(PID 42432)** — a separate OS process that survives every page reload and keeps
`koffi` mapped in memory. The agent session worker (PID 23768) likewise stays
alive across refreshes. Only **process termination** unloads the image section
and releases the lock. (Even closing the browser tab is not enough; and closing
the host console alone may still leave worker processes behind.)

### Correct stop-then-upgrade sequence

1. Finish/quit the running dsh session(s) inside the app.
2. Exit the **dsh web host process** and its session workers — i.e. terminate the
   local `node.exe` processes, not the browser tab.
3. Verify nothing holds the tree before installing:

   ```powershell
   tasklist /FI "IMAGENAME eq node.exe"
   ```

   The list must be empty (npm's own transient `node.exe` only appears *during*
   the install). If a stale host/worker lingers, stop it:

   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | Stop-Process
   ```

   (or `taskkill /F /IM node.exe` — be sure this doesn't kill anything else you
   need that happens to be `node.exe`).
4. Optional cleanup of the half-written temp tree from the failed attempt
   (`...\@deepseek-ai\.dsh-TMPDIR`) if npm later complains about leftover state.
5. Run the install (pinned — see below), then **restart dsh**.

## 2. Attempt 2 root cause — silent downgrade to `0.1.1-rc.2`

`attempt2-downgrade.log`: `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`
succeeded, but `dsh --version` printed `0.1.1-rc.2`.

The core of the problem is that `@deepseek-ai/dsh` in that command is **unpinned**.

### What an unpinned global install resolves to

`npm install <pkg>` with no version specifier does **not** mean "newest available
version" — it means **the version currently published under the `latest`
dist-tag**. npm never promotes prereleases to `latest` on its own. From
`npm-dist-tags.txt` at the time of the attempt:

```
latest: '0.1.1-rc.2'
next:   '0.1.1-rc.2'
alpha:  '0.1.2-alpha.5'
```

So `@deepseek-ai/dsh` → **`0.1.1-rc.2` via the `latest` dist-tag**. The alpha.5
release was published only under the **`alpha`** tag — `latest` (and, notably,
`next` as well) still points at the older `0.1.1-rc.2`.

### Why this is a *downgrade*, not just "not an upgrade"

Semver ordering: `0.1.2-alpha.4` vs `0.1.1-rc.2` — compare `0.1.2` vs `0.1.1`
first; the prerelease identifiers (`alpha.4`, `rc.2`) only matter when
major.minor.patch are equal. `0.1.2-alpha.4 > 0.1.1-rc.2`. So replacing the
running alpha.4 with the `latest` tag's `0.1.1-rc.2` is a genuine **version
downgrade**, and npm's explicit `install -g` does exactly the requested install
with no "only upgrade" guard and no warning about moving backwards. Note that
even switching the spec to `@deepseek-ai/dsh@next` would **not** have helped:
`next` is also `0.1.1-rc.2`. Only `@alpha` or an **exact version pin** reaches
`0.1.2-alpha.5`.

## 3. Exact safe upgrade commands (want alpha.5 + TUI plugin)

```powershell
# 0. See what's on the registry and what you currently have
npm view @deepseek-ai/dsh dist-tags
npm ls -g --depth=0

# 1. Stop dsh completely (host process + session workers — NOT the browser tab)
tasklist /FI "IMAGENAME eq node.exe"     # must show no dsh-related node.exe

# 2. Upgrade the CORE first, pinned to the exact prerelease you want
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

# 3. Install the TUI plugin AFTER the core, also pinned.
#    Check its tags first, then pin the exact version (do not leave it unpinned):
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm install -g @deepseek-harness-tui/dsh-tui@<exact-version>
#    (substitute the real exact version from the dist-tags output above)

# 4. Verify BEFORE restarting anything
dsh --version            # must print 0.1.2-alpha.5
npm ls -g --depth=0      # must show 0.1.2-alpha.5, no remnants of 0.1.1-rc.2

# 5. Restart dsh
```

Key points about the order and the pinning:

- **Core first, plugin second.** The TUI plugin targets a core stream; upgrading
  core after installing the plugin can leave a mismatched pair.
- **Both packages must be pinned.** The whole of attempt 2 came from one
  unpinned token. If you ever combine them into one command, every spec must
  carry an exact version:
  `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<ver>`.
- Adding the plugin in a second, separate install is the safest habit — it can
  never drag the core back to `latest`.
- If the install still fails with EBUSY, a dsh host/worker process is still
  alive: re-run `tasklist` before retrying.

## 4. Prevention — what plugin README authors should change

1. **Never ship an unpinned install command.** `npm install -g @pkg/name`
   installs the `latest` dist-tag, which on a prerelease project is an older
   release — it can silently downgrade users (exactly the attempt-2 trap).
   Always pin an exact version: `npm i -g @deepseek-ai/dsh@0.1.2-alpha.5`.
2. **When on a prerelease channel, be explicit about the tag.** `latest`/`next`
   may both lag the alpha stream; `alpha` is its own dist-tag. Say which channel
   your command targets and keep the docs' example version in sync with the
   channel you actually publish under.
3. **Tell users to stop dsh before upgrading, and say what "stop" means.** Add
   the step: exit the dsh host and its session workers (the local `node.exe`
   processes) — refreshing or closing the browser tab is **not** enough, because
   the host process keeps the native `koffi.node` addon file-locked on Windows
   and the install will fail with EBUSY. Include the `tasklist`/`Get-Process`
   verification command.
4. **Don't combine an unpinned core with a plugin in one command.** A plugin
   install (or a user copying your "install everything" line) can silently drag
   the core to `latest`. Keep the core command and the plugin command separate,
   each pinned, in the documented order: core → plugin.
5. **Document verification.** Show `dsh --version` and its expected output so a
   silent downgrade can't pass unnoticed, and mention the EBUSY → "a dsh
   process is still running" interpretation so users don't start guessing.

---

### Summary

- **Attempt 1:** the dsh web host process (PID 42432) had `@koromix/koffi`'s
  native `koffi.node` mapped into memory; Windows' image-section lock makes that
  file un-replaceable until process exit. A browser refresh only reloads the
  SPA — the host `node.exe` (and its session worker) survive it, so the lock
  persists. Fix: fully quit dsh's local processes (verify with `tasklist`), then
  install.
- **Attempt 2:** the unpinned `@deepseek-ai/dsh` resolved through the **`latest`
  dist-tag** to `0.1.1-rc.2` — semver-lower than the running `0.1.2-alpha.4` —
  so `npm install -g` performed a silent downgrade. Only the `alpha` tag (or an
  exact pin) reaches `0.1.2-alpha.5`.
- **Fix:** stop dsh completely → `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`
  → `npm install -g @deepseek-harness-tui/dsh-tui@<pinned>` → verify
  `dsh --version` = `0.1.2-alpha.5` → restart.
- **README authors:** pin exact versions, separate core and plugin commands,
  document the stop-before-upgrade step, and warn that browser refreshes don't
  release file locks.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.