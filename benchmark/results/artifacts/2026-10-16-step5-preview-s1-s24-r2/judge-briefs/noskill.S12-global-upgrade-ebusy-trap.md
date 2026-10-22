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
#### FILE: S12-global-upgrade-ebusy-trap/S12-global-upgrade-ebusy-trap.md

# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis and Safe Procedure

Scope: read-only diagnosis from the evidence pack in `fixture/` (5 files, unmodified). No install,
migration, or registry write was performed. Nothing outside the task cell was read.

**TL;DR**

| Symptom | Root cause | Fix |
|---|---|---|
| Attempt 1 `EBUSY ... copyfile ... koffi.node` | The long-lived **dsh Web-GUI host `node.exe`** (PID 42432) had already loaded the native FFI addon `@koromix/koffi`. On Windows a mapped `.node` image file is locked against write/delete until the **process exits**, and npm's reify step must replace that file. A browser refresh does not touch the host process. | Stop **every** dsh process (host *and* agent workers), verify, *then* install. |
| Attempt 2 `dsh --version` → `0.1.1-rc.2` | The README's combined command was **unpinned**. Bare `@deepseek-ai/dsh` resolves the `latest` dist-tag, and `latest` (like `next`) points at `0.1.1-rc.2`; the new build was published under the `alpha` tag. npm installs exactly what the tag says — it will happily *downgrade* and never warns. | Pin the exact version (or `@alpha`); verify with `dsh --version` **before** restarting anything. |

These are two **independent** failure modes. Attempt 2 proves it: once the processes were gone the
install completed cleanly (so §1 was the *only* blocker in attempt 1 — not permissions, not the npm
cache, not antivirus), yet the result was still wrong because of §2.

---

## 1. Attempt 1 — why `koffi.node` is locked

### 1.1 What the log says

```
$ npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
npm error code EBUSY
npm error syscall copyfile
npm error path   C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node
npm error dest   C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node
```

Two things matter here:

* `syscall copyfile` — npm is in its **reify/staging** phase, copying the newly unpacked
  `koffi.node` out of the package into its staging area before renaming it into its final home.
  Replacing a global package is *unlink-then-rename*, i.e. it must be allowed to delete/overwrite the
  file it is replacing.
* `path` is `@koromix/koffi-win32-x64\win32_x64\koffi.node` — this is **not** dsh's own code. It is
  the native, platform-specific half of the `@koromix/koffi` FFI addon that dsh loads at startup for
  its sandbox/filesystem operations. `koffi.node` is a Windows **DLL** under a `.node` extension.

### 1.2 Who holds it

`running-processes.txt` answers this directly:

```
node.exe  42432  Console   <- dsh web host (holds koffi.node)
node.exe  23768  Console   <- agent session worker
node.exe  23920  Console   <- npm install -g (attempting the copy)
```

* **PID 42432 — the dsh Web-GUI host.** This is the process that serves the browser UI you are looking
  at. It loaded `@koromix/koffi` **at startup**, so `koffi.node` is mapped into its address space for
  its whole lifetime. It is the lock holder.
* **PID 23768 — an agent session worker.** A dsh session worker loads the same native addon, so it is
  a **second** potential lock holder. Killing only the web host is not enough on a machine with live
  sessions; you must clear *all* dsh node processes.
* **PID 23920 — npm itself.** Not a lock holder; it is the process being refused.

### 1.3 Why the OS refuses (the mechanism)

Windows maps executable images (DLLs, and `.node` files are DLLs) as *image sections*. The mapping
keeps the underlying file open with a share mode that excludes `FILE_SHARE_WRITE` and
`FILE_SHARE_DELETE`. Consequences:

* No other process can **write** to it → the copy fails.
* No other process can **delete or rename** it → npm's unlink-then-rename reify strategy also fails.
* The mapping lives until the module is unloaded, which for a node process means **process exit**
  (npm cannot call `FreeLibrary` for you).

Windows surfaces this as `ERROR_USER_MAPPED_FILE` / `ERROR_BUSY`, which Node reports as `EBUSY`.
This is a plain file-lock collision, **not** a permissions problem, a corrupt npm cache, or antivirus
interference — and it is **Windows-specific**: Unix-like systems let you unlink a mapped
`.so`/`.dylib`, which is why the same README command works fine on macOS/Linux.

### 1.4 Why refreshing the browser page does not free the lock

The browser is only an **HTTP client** of the host process. Pressing F5 / reload re-requests the SPA's
HTML/JS from PID 42432; the host itself is untouched and keeps running, so it keeps `koffi.node`
mapped. The lock is held by a *process*, not by a *tab*. Closing the browser window/tab likewise
leaves the host alive. Only **terminating the host process** (and the session workers) releases the
mapping — and it releases it immediately, no reboot needed.

### 1.5 What does *not* work (so you don't try it)

| Tried | Why it fails |
|---|---|
| Refresh / close the browser page | Host process untouched (§1.4). |
| `npm install -g --force` | `--force` overrides npm's own safety checks, not the OS file lock. Same `EBUSY`. |
| `npm cache clean --force` / `rm -rf node_modules\<pkg>` | Deleting the mapped file is also denied; you get "The action can't be completed because the file is open in dsh". |
| Rebooting | Works, but is unnecessary overkill. |
| Installing to a second global prefix | Dodges the symptom, leaves you with two dsh installs and a `PATH` coin-flip. |

### 1.6 The correct stop-then-upgrade sequence

```powershell
# 1. See what is actually running (the same command that produced the evidence)
tasklist /FI "IMAGENAME eq node.exe"

# 2. Stop the dsh Web-GUI host — Ctrl+C in the terminal that launched it,
#    or, if it is detached/backgrounded, kill it by PID:
taskkill /PID 42432 /F

# 3. Stop every dsh agent-session worker too (they hold the same addon):
taskkill /PID 23768 /F

# 4. Verify nothing dsh-related survives
tasklist /FI "IMAGENAME eq node.exe"
# (if the host respawns, a supervisor is running — stop the supervisor first, then re-check)

# 5. Only now install (see §3 for the pinned command)
```

**Ordering rule, stated plainly: stop → verify stopped → install → verify version → restart.**
Never interleave "install" with "dsh is running" on Windows.

---

## 2. Attempt 2 — why `dsh --version` printed `0.1.1-rc.2`

### 2.1 What happened

```
$ npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
(installs fine, but...)
$ dsh --version
0.1.1-rc.2
```

Note that the install **succeeded** here. That is important corroboration for §1: with the dsh
processes gone, the very same package installs without complaint, so the `EBUSY` was purely the
process-held lock. The version surprise is a *second, unrelated* defect — this time in the command
itself.

### 2.2 What the unpinned specifier resolves to

`npm install -g @deepseek-ai/dsh` (no `@version`) is **not** "keep or advance what is installed" and
it is **not** "newest available". A bare package name means *the `latest` dist-tag*. From
`npm-dist-tags.txt`:

```
$ npm view @deepseek-ai/dsh dist-tags
{
  next:   '0.1.1-rc.2',
  latest: '0.1.1-rc.2',
  alpha:  '0.1.2-alpha.5'
}
```

So the unpinned `@deepseek-ai/dsh` resolved to **`latest` = `0.1.1-rc.2`** — exactly what you got.
The package you wanted, `0.1.2-alpha.5`, was published under the **`alpha`** tag, which a bare
specifier never follows.

### 2.3 Why `latest` points at the *older* build

`latest` is a **moving label maintained by the publisher**, not a computed "highest version". It only
moves when a maintainer publishes with `--tag latest` (the default for a stable release). The new
build is a **prerelease** and was published with `--tag alpha`, so `latest` stayed on
`0.1.1-rc.2`. This is the normal, intentional npm convention: stable consumers on
`npm install -g pkg` must not be dragged onto a prerelease line.

So the registry is behaving correctly — the *command* is what is wrong.

### 2.4 Why npm let it downgrade silently

Semver ordering puts `0.1.2-alpha.5` **above** `0.1.1-rc.2` (compare `0.1.2` vs `0.1.1`; a
prerelease only sorts *below* its own release `0.1.2`, not below a lower version entirely). But npm
does not compare against what you already have when you name a tag or an explicit version — it
installs **exactly** what the specifier resolves to, and a global install is not upgrade-only. There
is no warning, no `npm WARN downgrade`, and `--prefer-offline`/`--force` are irrelevant here.

Corollary worth knowing: `npm update -g` would **not** have saved you either — with a `*` range it
will not pull a prerelease. Only an explicit version or the `alpha` tag reaches `0.1.2-alpha.5`.

### 2.5 Which specifiers actually reach 0.1.2-alpha.5

| Specifier | Resolves to | Verdict |
|---|---|---|
| `@deepseek-ai/dsh` | `latest` → `0.1.1-rc.2` | **Downgrade.** This is the trap. |
| `@deepseek-ai/dsh@latest` | `0.1.1-rc.2` | Same trap, spelled out. |
| `@deepseek-ai/dsh@next` | `0.1.1-rc.2` | Also wrong — `next` is pinned to the same old build here. |
| `@deepseek-ai/dsh@alpha` | `0.1.2-alpha.5` | Correct, but **floating** — it follows the `alpha` tag as that tag moves. |
| `@deepseek-ai/dsh@0.1.2-alpha.5` | `0.1.2-alpha.5` | **Correct and reproducible.** Use this. |

Check any of this before and after with:

```powershell
npm view @deepseek-ai/dsh dist-tags        # where the tags point
npm view @deepseek-ai/dsh versions --json  # everything published
npm dist-tag ls @deepseek-ai/dsh           # same, via the dist-tag subcommand
```

### 2.6 One more thing to verify after installing

Confirm the binary you run is the one npm just wrote — if a second dsh exists on `PATH` (a local
`node_modules`, a different npm prefix, an nvm-managed root), `dsh --version` can report a *third*
version and send you chasing the wrong bug:

```powershell
npm prefix -g              # where -g installs land
npm ls -g --depth=0        # what is actually installed there, and at what version
(Get-Command dsh).Source   # which dsh the shell will execute
```

---

## 3. The exact safe upgrade commands for your situation

You want `0.1.2-alpha.5` **and** the TUI plugin. Do it in this order — stop first, pin everything,
verify before you restart.

```powershell
# ---------- STEP 0: stop dsh completely (this is what attempt 1 was missing) ----------
tasklist /FI "IMAGENAME eq node.exe"
taskkill /PID 42432 /F      # dsh web host  — use the PID from YOUR tasklist, not this example
taskkill /PID 23768 /F      # agent session worker(s) — also hold koffi
tasklist /FI "IMAGENAME eq node.exe"   # must show no dsh node.exe left

# ---------- STEP 1: upgrade the core, pinned to the exact version ----------
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

# ---------- STEP 2: add the TUI plugin, pinned too ----------
# Pick the version that matches your dsh line; do not leave it bare either:
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm view @deepseek-harness-tui/dsh-tui versions --json
npm install -g @deepseek-harness-tui/dsh-tui@<EXACT-VERSION-COMPATIBLE-WITH-0.1.2-alpha.5>

# ---------- STEP 3: verify BEFORE restarting anything ----------
npm ls -g --depth=0
dsh --version        # must print 0.1.2-alpha.5 — if it prints 0.1.1-rc.2, STOP and re-check §2.6

# ---------- STEP 4: only now restart ----------
# relaunch dsh web / your session, then confirm all six community plugins still load
```

**Single-command variant** (fine, and arguably better — one npm run, no half-upgraded state where the
core is new but the plugin is not — *provided both packages are pinned*):

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<EXACT-VERSION>
```

If you prefer to ride the prerelease channel rather than a frozen version, the minimum acceptable
substitution is `@deepseek-ai/dsh@alpha` — it reaches `0.1.2-alpha.5` today but is a moving target,
so re-run `npm view @deepseek-ai/dsh dist-tags` and re-verify `dsh --version` afterwards. Never
substitute `@latest` or `@next`.

**Do not** add `--force`, do not "fix" the `EBUSY` by cleaning the cache, and do not skip Step 0 —
on Windows every dsh process that has loaded `koffi.node` must be gone before Step 1.

---

## 4. Prevention — what plugin README authors must change

The trap caught you because the README's "official combined command" was `npm install -g
@deepseek-ai/dsh @deepseek-harness-tui/dsh-tui` — unpinned *and* silent about the Windows lock.
Rules for README authors:

1. **Never ship a bare core package name.** `@deepseek-ai/dsh` alone means `latest`, and `latest`
   is a label that points wherever the publisher last put it — which on a prerelease line is an
   *older stable build*. Write the exact version:
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
   If you must float, use the **explicit dist-tag you mean** (`@alpha`), never `@latest`/`@next`
   as a synonym for "newest" — here `@latest` and `@next` are both `0.1.1-rc.2`.
2. **Pin the plugin package too.** An unpinned plugin will follow *its* `latest`, which can drift
   away from the dsh version in the same command and produce a mismatched pair. Include a
   compatibility line: "dsh-tui 1.x ↔ dsh 0.1.2-alpha.x".
3. **State the stop-first prerequisite for Windows.** Any native addon (`koffi.node`) means the
   running host holds a file lock and the install *will* fail with `EBUSY`. The README should say:
   stop dsh (all processes, not just the browser tab) → verify → install → verify `dsh --version` →
   restart. Publishing this as a *sequence* rather than a one-liner is the single highest-value change.
4. **Make the verification step explicit and mandatory.** `dsh --version` must print the version the
   command claims to install. A README that never asks the user to check invites exactly the silent
   downgrade you hit.
5. **Don't fold a core upgrade into a plugin one-liner.** If a user following your plugin
   instructions silently changes the dsh core version, that is your bug, not theirs. Either pin the
   core to a version you have tested against, or omit the core entirely and document
   "requires dsh ≥ 0.1.2-alpha.5, already installed".
6. **Tell users how to inspect the registry** — `npm view <pkg> dist-tags` /
   `npm dist-tag ls <pkg>` — so they can confirm what a tag points at instead of trusting a tag name.
7. **Don't imply the lock is browser-scoped.** "Close the dsh tab and retry" is wrong; say "quit the
   dsh host process (and any agent sessions)".

---

## 5. Residual risks specific to your setup

* **Six plugins across three GitHub mirrors.** Any of them installed from a mirror with an unpinned
  command can drag the core version around the next time you touch it. After the upgrade run
  `npm ls -g --depth=1` and check whether any installed plugin declares a dependency on
  `@deepseek-ai/dsh` (a nested, differently-versioned copy can shadow the global one).
* **A plugin with a `peerDependency`/`dependency` on `@deepseek-ai/dsh`** will re-resolve that
  dependency at install time — another route to the same downgrade. Pin or check it before installing
  plugins.
* **Half-upgraded state.** Installing dsh and the TUI plugin in separate npm runs leaves a window
  where the new core is paired with an old plugin (or vice-versa). Prefer one combined, fully pinned
  command, or reinstall the plugin immediately after the core.
* **Prerelease churn.** `alpha` is a moving tag; pin exact versions in anything you automate
  (scripts, CI, mirror build recipes).

---

## 6. Evidence index

| File | What it established |
|---|---|
| `fixture/attempt1-ebusy.log` | `EBUSY` on `copyfile` of `@koromix/koffi-win32-x64\win32_x64\koffi.node` — native addon, staging copy phase. |
| `fixture/running-processes.txt` | PID 42432 dsh web host loaded `@koromix/koffi` at startup; PID 23768 agent worker also present; browser refresh only reloads the SPA. |
| `fixture/attempt2-downgrade.log` | Combined unpinned install succeeded (processes stopped ⇒ lock was the only attempt-1 blocker), yet `dsh --version` → `0.1.1-rc.2`. |
| `fixture/npm-dist-tags.txt` | `latest` = `next` = `0.1.1-rc.2`, `alpha` = `0.1.2-alpha.5` — a bare specifier resolves `latest`, hence the downgrade. |
| `fixture/README.md` | Read-only fixture; grading requires it unchanged (verified: all five files still carry their original 2026-09-07 mtimes and hashes). |

*Diagnosis only — no install, migration, or registry operation was executed, and the fixture
directory was not modified.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.