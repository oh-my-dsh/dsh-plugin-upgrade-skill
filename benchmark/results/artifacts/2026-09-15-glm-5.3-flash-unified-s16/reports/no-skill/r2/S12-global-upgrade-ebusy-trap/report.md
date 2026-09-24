# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Machine under diagnosis: Windows DSH installation, currently running `0.1.2-alpha.4`, six community Web
plugins across three GitHub mirrors. Target release: `0.1.2-alpha.5`.
Evidence: `attempt1-ebusy.log`, `running-processes.txt`, `attempt2-downgrade.log`, `npm-dist-tags.txt`.

---

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

**What failed**

```
$ npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
npm error code EBUSY
npm error syscall copyfile
npm error path C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node
npm error dest C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node
```

**Who holds the lock (from `running-processes.txt`)**

```
node.exe  42432  Console   <- dsh web host (holds koffi.node)
node.exe  23768  Console   <- agent session worker
node.exe  23920  Console   <- npm install -g (attempting the copy)
```

The dsh web host (PID 42432) loaded `koffi.node` — the native FFI addon
(`@koromix/koffi-win32-x64`) used by dsh for sandbox/filesystem operations — **at process startup**.

**Why the file is locked.** `koffi.node` is a native `.node` binary. When a process loads a native
module, Windows maps it as an executable image in that process, and the OS holds the file locked
until the module is unloaded or the process exits. npm's upgrade needs to `copyfile` the new
`koffi.node` over the old one inside the global `node_modules` tree; because the dsh web host still
has the old binary mapped, the copy syscall fails with `EBUSY` (resource busy / in use).

**Why a browser-page refresh does NOT free the lock.** The browser page is only a client: refreshing
it reloads the SPA frontend inside the browser. The lock is held by the **server-side host process**
(PID 42432), which stays alive across any number of page reloads. The file lock lives at the OS,
process level — not in the browser session — so refreshing the page cannot release it. Only
terminating the process(es) that loaded `koffi.node` releases it.

**Important detail:** the web host is not necessarily the only holder. The same listing shows an
**agent session worker** (PID 23768) — any dsh component that loaded koffi also pins the file.
Stopping only the web host can still leave an EBUSY. All dsh-related `node.exe` processes must exit.

**Correct stop-then-upgrade sequence**

1. Stop dsh properly so every dsh-related process exits (web host **and** agent session workers) —
   e.g. `dsh stop` / the service manager / Ctrl+C on the host console. Do not merely close the
   browser tab.
2. Verify nothing dsh-related is left:
   `tasklist /FI "IMAGENAME eq node.exe"`
   (if other apps also run node.exe, check command lines, e.g.
   `wmic process where "name='node.exe'" get processid,commandline`, and confirm no dsh/koffi
   entries remain).
3. Run the pinned install (see section 3).
4. Verify `dsh --version`.
5. Restart dsh.

---

## 2. Attempt 2 root cause — why `dsh --version` printed `0.1.1-rc.2`

**What was run**

```
$ npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
(installs fine, but...)
$ dsh --version
0.1.1-rc.2
```

The combined command came from a plugin README. The TUI plugin installed fine; the problem is the
**unpinned** `@deepseek-ai/dsh` spec (no `@version` suffix).

**What an unpinned install resolves to.** For `npm install -g <pkg>` with no version/range, npm
installs whatever the package's **`latest` dist-tag** points to — it does *not* keep the currently
installed version, and it does *not* pick the semver-newest published version. `latest` is simply a
publisher-assigned pointer.

**Registry state at the time (`npm-dist-tags.txt`):**

```
{
  next:   '0.1.1-rc.2',
  latest: '0.1.1-rc.2',
  alpha:  '0.1.2-alpha.5'
}
```

`latest` → `0.1.1-rc.2`, while the wanted pre-release lives under the `alpha` tag
(`0.1.2-alpha.5`). This is the classic pre-release layout: publishing an alpha does not move
`latest`, so `latest` keeps pointing at the older stable/rc line. Semver-wise `0.1.2-alpha.5` is
newer than both the previously installed `0.1.2-alpha.4` and `0.1.1-rc.2` — but that is irrelevant
to resolution; only the tag matters.

**Result:** the README's unpinned command silently **downgraded** dsh from `0.1.2-alpha.4` to
`0.1.1-rc.2`. npm has no downgrade protection on `install -g` — a bare package name just installs
the `latest` tag target, even when it is older than what is already on disk. This is why the
install "went through fine" yet `dsh --version` printed `0.1.1-rc.2`.

---

## 3. Exact safe upgrade commands (alpha.5 + TUI plugin)

Ordered procedure for this machine (Windows, six community Web plugins installed):

```bat
:: 1. Stop dsh fully — web host AND agent session workers must exit.
dsh stop

:: 2. Confirm no dsh-related node.exe remains (both PIDs 42432 and 23768 must be gone).
tasklist /FI "IMAGENAME eq node.exe"

:: 3. Install the PINNED dsh version together with the TUI plugin.
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

:: 4. Verify you actually got alpha.5 before restarting.
dsh --version
:: must print: 0.1.2-alpha.5

:: 5. Restart dsh and reload the web UI.
```

Notes:

- Pin the **exact version** (`@0.1.2-alpha.5`). `@deepseek-ai/dsh@alpha` would also currently
  resolve to `0.1.2-alpha.5` per the dist-tags, but exact pinning is robust against the `alpha` tag
  being moved later.
- The one-line combined install is fine **only because** dsh is now pinned; the unpinned form from
  the README is what caused the downgrade.
- Do not skip step 2: any leftover dsh `node.exe` process (e.g. a session worker) will re-trigger
  the EBUSY on `koffi.node`.
- The six community Web plugins are unaffected by reinstalling the dsh core; if any of them also
  ship native addons, apply the same stop-first rule when upgrading them.

---

## 4. Prevention — what plugin README authors should change

1. **Always pin versions in install/upgrade commands.** Write
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`, never a bare
   `npm install -g @deepseek-ai/dsh`. If a combined line is given, pin **every** package in it.
2. **Never rely on implicit `latest`.** `latest` is a publisher-assigned tag, not "the newest
   version". During a pre-release cycle, `latest` stays on the stable/rc line, so unpinned installs
   silently *downgrade* users who run alphas — exactly this incident. If a dist-tag must be used,
   name it explicitly (`@deepseek-ai/dsh@alpha`) and state which version it currently points to.
3. **Put the stop step in the README.** Any package shipping native addons (`.node` binaries such
   as koffi) cannot be overwritten while the consuming process runs on Windows. Upgrade docs must
   say: stop the app (all host/worker processes), verify with `tasklist`, install, verify
   `dsh --version`, restart — not "just run this install command".
4. **Include a verification step after install** (`dsh --version` must print the expected version)
   so a tag-resolution surprise like rc.2 is caught immediately instead of being discovered later.
5. **Version the docs.** Keep per-release upgrade instructions (a short "upgrading to
   0.1.2-alpha.x" section with the pinned command) rather than a single evergreen command that
   resolves differently depending on the registry's dist-tags on the day.

---

## Summary

| Attempt | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `EBUSY` copying `koffi.node` | dsh web host (PID 42432) has the native module mapped; Windows locks loaded images until process exit. Browser refresh only reloads the SPA — the host process stays alive. Session worker (23768) can hold it too. | Stop **all** dsh processes, verify with `tasklist`, then install. |
| 2 | `dsh --version` → `0.1.1-rc.2` | Unpinned `@deepseek-ai/dsh` resolves to the `latest` dist-tag, which pointed at `0.1.1-rc.2` (alpha.5 lives under the `alpha` tag). npm does not preserve or advance the installed version. | Pin `@deepseek-ai/dsh@0.1.2-alpha.5`. |
