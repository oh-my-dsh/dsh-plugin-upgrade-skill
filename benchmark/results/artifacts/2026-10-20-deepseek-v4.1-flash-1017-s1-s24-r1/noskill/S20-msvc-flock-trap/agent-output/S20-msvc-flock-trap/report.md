# S20 · Windows install blocker: `fs-ext` is compiled at install time and never called at runtime

**Machine**: Windows 11, Node + corepack/pnpm working, **no Visual Studio / Build Tools, no
`vswhere.exe`** (`README.md`). Static diagnosis only — `fixture/` was read, never written.

**Verdict**: the upgrade fails in a *dependency build step*, not in dsh code. The failing module
(`fs-ext`) is dead code on Windows: the Windows lock path uses a named kernel semaphore
(Win32 bindings, `src/win32.ts`), never `flock(2)`. But it is imported **statically**, so the
package loader still has to resolve and load it. The correct fix is therefore *not* to install
MSVC and *not* to skip all install scripts: it is a repo-local pnpm patch that (a) turns the
package install script into a no-build on win32 only and (b) replaces the eager native-binding
load with a lazily resolved binding plus a stub that throws only if called — leaving POSIX
behaviour untouched.

---

## 0. Answer summary (one line per question)

| # | Question | Answer |
|---|----------|--------|
| 1 | What fails, why | `fs-ext@2.1.1`, a **runtime dependency of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`**, runs its `install` script `node-gyp configure build` during `pnpm install`; node-gyp VS discovery (`find VS`) finds no Visual Studio 2017+ / MSVC C++ workload, so `configure` aborts, the package install fails, pnpm exits 1, dsh exits 1. Missing toolchain: MSVC C++ build tools + Windows SDK (and the VS install root that would have provided `vswhere.exe`/VC paths). No compiler is ever invoked — the run dies in the *configure* phase. |
| 2 | Why not `--ignore-scripts` | It removes the build, not the **load-time** requirement: the fs-ext JS entry requires its compiled `build/Release/fs-ext.node` eagerly, and `src/lease.ts` imports `{ flock }` at module top. Install would then exit 0 and the **service dies at boot** with a module-load error when the persistence plugin is loaded. It also silently disables every legitimate build/postinstall in the tree (including the repo own patched native dep, e.g. node-pty), is per-invocation rather than committed (teammates/CI diverge), and does not survive the next install — dsh itself drives plain `pnpm install` (log L13). |
| 3 | Which Windows lock path runs | **Named kernel semaphore** derived from the lock path: `CreateSemaphoreW` → `WaitForSingleObject(…, 0)` → `ReleaseSemaphore` → `CloseHandle` (`src/win32.ts`), with `MoveFileExW` for the durable namespace publish. **No `flock(2)`, no lock file, no held handle** on `session.lock`. Implication: the native binding is never executed on Windows, so a load-safe stub is behaviour-preserving there — while the static import means the *load* must still succeed, which is exactly what a naive `--ignore-scripts` breaks. |
| 4 | Fix plan | Commit `patches/fs-ext@2.1.1.patch` through pnpm `patchedDependencies` (the existing `patches/node-pty@*.patch` precedent, registered in `pnpm-workspace.yaml`): platform-aware `install` script (exit 0 on win32, real node-gyp build elsewhere) + an entry file whose binding resolves lazily and whose win32 exports are calling-stubs with statically analysable names. No Visual Studio, no upstream edit, no edit to the plugin. See §4. |
| 5 | Corridor card | `DSH-0.1.3-A1-03` — the A1-lane card for install-time native-addon blockers (node-gyp/MSVC absent, module present but never called at runtime). See §5. |


---

## 1. What exactly fails, and why

### 1.1 The failing edge in the graph

`manifest-excerpt.json` gives the declaration verbatim: package
`@deepseek-ai/dsh-session-persistence-jsonl` version `0.1.3-alpha.1` declares `"fs-ext": "2.1.1"`
under **`dependencies`** (exact pin, not a range) and `@types/fs-ext@2.0.3` under
`devDependencies`. So this is a *runtime* dependency of the package that owns the write lease,
not an optional or dev-only tool.

That explains the "why now" of the upgrade: `README.md` records that every previous dsh upgrade on
this machine installed fine. The earlier 0.1.x line pulled no MSVC-built native module;
0.1.3-alpha.1 brings `fs-ext` into the production dependency closure, so **every**
`pnpm install` on this class of machine must now build a native addon.

### 1.2 The failing step

`install-error.log` lines 3–14, in order:

1. **L3** — `fs-ext@2.1.1 install: node-gyp configure build`: pnpm runs the dependency
   `install` lifecycle script. The step is *dependency build during* `pnpm install` — not a dsh
   runtime step, and not a compile of our own sources.
2. **L4** — `gyp ERR! find VS`: node-gyp enters its Visual Studio detection module.
3. **L5** — `find VS msvs_version not set from command line or npm config`: no explicit target
   is configured (and configuring one would not help — see L8).
4. **L6** — `find VS VCINSTALLDIR not set, not running in VS Command Prompt`: the environment
   carries none of the Developer Command Prompt variables that would short-circuit discovery.
5. **L7–L9** — `could not use PowerShell to find Visual Studio 2017 or newer` → `You need to
   install the latest version of Visual Studio including the "Desktop development with C++"
   workload`: every fallback probe (vswhere.exe, VS install roots, PowerShell) comes back empty.
   `README.md` confirms the machine has no VS/Build Tools, **no `vswhere.exe`**, and the owner
   refuses to install them.
6. **L10–L11** — `configure error` / `Error: Could not find any Visual Studio installation to
   use`: the failure is in **`configure`**, before `msbuild`/`cl.exe` would ever run.
7. **L12–L14** — `Failed` → `pnpm: Command failed with exit code 1` → `dsh 退出码: 1`.

**Missing toolchain, precisely**: MSVC C++ compiler (`cl.exe`) plus the Windows SDK plus the VS
install root that supplies `vswhere.exe`/VC paths — i.e. the *Desktop development with C++*
workload. This is a hard build-time requirement of the dependency as published. Nothing about the
machine Node, pnpm, or dsh installation is at fault.

### 1.3 Why the runtime does not need it (the trap)

`lease-excerpt.md` (doc block L3–L8, L15): the lease is a cross-process write-ownership lock whose
arbiter is the kernel. **POSIX** takes a non-blocking `flock(2)` *through fs-ext*; **Windows
holds a named kernel semaphore derived from that path — never a file lock or handle** — and the
excerpt repeats that Windows has no lock file at all and readers never touch the lock.

`win32-excerpt.ts` (L8–L13, L23–24) names the primitives actually bound on Windows:
`MoveFileExW`, `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle`,
`GetLastError` — and closes with "no flock(2) is involved on Windows".

So the module that blocks the install contributes **zero executed code** on this machine. The trap
is `lease-excerpt.md` L17–19: `flock` is imported statically at module top, so the package loader
must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken.
Resolve-and-load is a *build-time* consequence: pnpm must produce an `fs-ext` directory whose entry
file can be loaded. That is the whole failure, and it dictates the shape of the fix (§4):
suppress the *build*, keep a loadable *module*.


---

## 2. Why `pnpm install --ignore-scripts` cannot fix this

1. **It trades an install failure for a boot failure — the goal is not met.** The flag suppresses
   the lifecycle script, so `fs-ext` is linked into `node_modules` with **no
   `build/Release/fs-ext.node`**. The package JS entry loads that binding eagerly (that is why the
   build exists), and `src/lease.ts` imports `{ flock }` at module top
   (`lease-excerpt.md` L11, L17–19). Loading the persistence plugin therefore throws at *import*
   time — before any lease code runs and without ever reaching the Windows branch. The goal is
   "install completes **and the service boots**"; `--ignore-scripts` only moves the red light one
   step later, into a subtler failure.
2. **It is not a fix, only an invocation.** Nothing in the repo changes; the next `pnpm install` —
   including the one dsh itself runs during an upgrade (log L13 shows dsh driving pnpm) — is broken
   again. Every teammate and CI job would have to remember the flag forever, or the problem
   returns silently.
3. **It is branch-wide, not targeted.** It also skips the builds and postinstall hooks the repo
   depends on, including its own patched native dependency (`patches/node-pty@*.patch`,
   `README.md` L7–10) and any package whose postinstall prepares artifacts. The result is a tree
   that installs "successfully" while being wrong in ways that surface later as unrelated crashes.
4. **It masks the diagnosis.** A missing `.node` file produces a load-time error far from its cause;
   the next engineer debugs the lease instead of the build graph. The evidence here is excellent —
   a clean, early `find VS` abort. Keeping the failure loud and fixing its cause is strictly
   better.
5. **It cannot be the repo precedent.** `README.md` L7–10 records the established mechanism for
   native dependencies: pnpm `patchedDependencies` with a committed patch that can rewrite a
   package install script *and* entry file. `--ignore-scripts` is not that mechanism and would
   set a second, contradictory precedent.

Near-misses worth naming so nobody re-derives them:

- **`msvs_version` / `npm_config_msvs_version`** — L5 already reports it unset; setting it would
  only point node-gyp at a VS installation that does not exist (L8–L9), and the failure returns
  verbatim.
- **A prebuilt binary, or `node-gyp --nodedir` tricks** — fs-ext ships no Windows prebuild for
  this Node ABI, and fetching binaries is neither the precedent nor within scope.
- **Deleting the dependency** — `fs-ext@2.1.1` is declared by an upstream published package
  (`manifest-excerpt.json` L2–6); removing it would modify an upstream dependency (forbidden) and
  would break POSIX, where `flock` is genuinely used.
- **An allow-list alone** (`onlyBuiltDependencies` / `neverBuiltDependencies`) — same defect as
  `--ignore-scripts`: no binding, no load. Useful only as the second half of the real fix, and
  only as a fallback if a given pnpm version ignores the patched script (§4.5).

---

## 3. Which lock path Windows actually takes — and what it implies

**Path taken at runtime**: `acquireLockHandleWin32` / `releaseLockHandleWin32` in `src/win32.ts`
(`win32-excerpt.ts` L23–24), wrapping a **named kernel semaphore**:
`CreateSemaphoreW(security = null, initial, maximum, name)` → `WaitForSingleObject(handle, 0)`
for non-blocking acquisition → `ReleaseSemaphore(handle, count, previous = null)` →
`CloseHandle`, with `GetLastError` for the busy/already-exists cases. The object **name is derived
from the lock path** (`lease-excerpt.md` L5–8): the semaphore lives in the kernel object namespace,
not in the filesystem. Log publishing uses a different primitive entirely — `MoveFileExW` — because
Node does not expose the parent-directory fsync contract the POSIX path relies on
(`win32-excerpt.ts` L1–7).

**Consequences, and what they imply for the failing module:**

1. **fs-ext is unreachable on Windows.** No `flock(2)`, no lock file, no open handle, no
   `LOCK_EX`/`fcntl` traffic. Any substitution of fs-ext *behaviour* is unobservable on this
   platform — which is what makes a calling-stub safe rather than merely expedient.
2. **The import is still hard.** Because `flock` is imported at module top
   (`lease-excerpt.md` L11, L17–19), module *resolution and load* happen unconditionally on every
   platform. The fix must keep `fs-ext` **loadable** and must not rely on the branch being
   skipped. Dead code, but not dead weight: it cannot simply vanish from `node_modules`.
3. **The stub must be lazy, not eager.** Since only `flock` is reached from `src/lease.ts`, the
   patched entry only has to avoid touching the `.node` file until a function is *called*. Loading
   the module must be side-effect free on win32, and no POSIX code path may change.
4. **No lock file means no leak vector.** Windows holds no handle and creates no `session.lock`,
   so readers, searches and directory removal proceed while the lease is held
   (`lease-excerpt.md` L7–8, L15). A stub that throws on *call* therefore cannot desynchronise
   anything: if it is never called, there is no state to release.
5. **The failure must stay loud if that assumption ever breaks.** If a future refactor called
   `flock` on win32, a silent no-op stub would silently corrupt cross-process exclusion. The
   stub must throw a named, greppable error rather than return `undefined` or `0` (§4.3).


---

## 4. Fix plan — least invasive, no Visual Studio, no upstream edits

Follows the repo precedent verbatim (`README.md` L7–10): a pnpm patch that rewrites a native
package **install script** and **entry file**, registered through `patchedDependencies`. One
committed patch; Windows installs without a compiler; POSIX is unchanged; nothing outside the
repo is touched.

### 4.1 Preconditions and blast radius

- Changed: **`patches/fs-ext@2.1.1.patch`** (new) and **`pnpm-workspace.yaml`** (one
  `patchedDependencies` entry), plus the lockfile hunk if the pnpm version records patches there.
- Not changed: fs-ext upstream, `@deepseek-ai/dsh-session-persistence-jsonl`, `src/lease.ts`,
  `src/win32.ts`, and the machine (no VS, no global npmrc, no env vars).
- The manifest pin is exact (`"fs-ext": "2.1.1"`), so the patch key is stable; a future version
  bump fails loudly ("patch not applied") instead of silently regressing.

### 4.2 Create the patch

```bash
pnpm patch fs-ext@2.1.1        # extracts to a temp dir and prints its path
#   edit the two files described below inside that dir, then:
pnpm patch-commit <that dir>  # writes patches/fs-ext@2.1.1.patch, updates pnpm-workspace.yaml
```

Resulting registration (same shape as the existing node-pty precedent):

```yaml
# pnpm-workspace.yaml
patchedDependencies:
  fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
```

Commit the patch file and the workspace file **together**. pnpm applies patches to the extracted
package before the dependency lifecycle hooks run, so both halves ship in one `pnpm install` on
every machine.

### 4.3 Half A — entry file: lazy binding + win32 calling-stub

File: the entry named by the package `main` — the single JS file that today eagerly requires
`bindings('fs-ext')`. Take the exact name from `pnpm patch`; do not guess it. Add a platform
guard **above** that eager require:

```js
if (process.platform === 'win32') {
  // Windows holds a named kernel semaphore (src/win32.ts); flock(2) is never
  // called, so no native binding is needed in order to *load* this module.
  var unavailable = function () {
    var e = new Error(
      'fs-ext: native binding not built on win32 (no MSVC build tools); ' +
      'the session lease uses named kernel semaphores and never calls flock(2)')
    e.code = 'ERR_FS_EXT_UNAVAILABLE_ON_WIN32'
    throw e
  }
  // Statically analysable named exports: Node CJS named-export detection must
  // see the name "flock" for a named ESM import of this package to link.
  // A Proxy-only module.exports defeats that analysis ("Named export not found").
  module.exports.flock = unavailable
  module.exports.flockSync = unavailable
  // ...one module.exports.<name> = unavailable line per export of the unpatched
  // entry (enumerate with a single grep; flock/flockSync are the only ones
  // src/lease.ts imports).
  return   // top-level return is legal in CJS: nothing below runs on win32
}
```

Notes that matter:

- The guard sits **before** any `require('bindings')` of the `.node`, so loading the module on
  Windows performs no native work at all.
- Do **not** replace the module with a bare `Proxy`: a named ESM import resolves through Node
  static CJS export analysis, which a Proxy assignment defeats — the service would then fail at
  link time with a named-export error instead of loading. Explicit `module.exports.flock`
  assignments keep the graph valid under both ESM and transpiled-CJS consumption.
- Throwing on *call* (not on *load*) preserves the current contract exactly: `flock` is never called
  on win32, and if that ever changes the failure is immediate, named and greppable.
- POSIX is untouched: the guard is win32-only; the rest of the file keeps the original eager
  binding and real `flock`/`fcntl` behaviour.

### 4.4 Half B — install script: build only where a build means something

In the patched `package.json`, replace the hard-coded `"install": "node-gyp configure build"`
with a call to a small platform-aware hook that the same patch adds (patches may add files):
`"install": "node scripts/install.js"`.

```js
// scripts/install.js  (added by the patch)
'use strict'
const { spawnSync } = require('child_process')
if (process.platform === 'win32') {
  console.log('[fs-ext] win32: no MSVC build tools, and flock(2) has no call site ' +
              '(the lease uses named kernel semaphores) - skipping native build')
  process.exit(0)                    // install completes; module still loads (Half A)
}
const gyp = require.resolve('node-gyp/bin/node-gyp.js')
const r = spawnSync(process.execPath, [gyp, 'configure', 'build'], { stdio: 'inherit' })
process.exit(r.status === null ? 1 : r.status)   // POSIX: real build, real exit code
```

Why this and not an allow-list: the script must stay **cross-platform in one committed file**. On
Linux/macOS CI it must still run node-gyp and produce `build/Release/fs-ext.node` so `flock`
works; on Windows it must succeed with no compiler. A committed
`neverBuiltDependencies: [fs-ext]` (or an emptied `onlyBuiltDependencies`) would do the right
thing on this laptop and break every POSIX build — reject it as the primary fix.


### 4.5 Apply and verify on the target machine (no VS installed)

1. `pnpm install` — expect exit 0, the patch reported as applied, one
   `[fs-ext] win32: ... skipping native build` line, and **no `gyp ERR!` anywhere** in the
   transcript; `dsh 退出码` must be 0 (compare log L13–14).
2. **Load test (the step `--ignore-scripts` would fail)**:
   `node -e "const {flock}=require('fs-ext'); console.log(typeof flock)"` prints `function`;
   calling it throws `ERR_FS_EXT_UNAVAILABLE_ON_WIN32`. Proves the module resolves and loads with
   no `.node` present, and that misuse is loud.
3. **Boot test (the real goal)**: run the upgrade the log failed on; the persistence plugin must
   load and the service must come up. Exercise the lease with two concurrent sessions writing
   distinct artifact dirs; confirm **no `session.lock` file is created** and that the artifact
   directory can be removed while a write handle is open — the documented consequence of the
   named-semaphore path (`lease-excerpt.md` L7–8, L15).
4. **POSIX regression**: on Linux/macOS CI, `pnpm install` must still compile fs-ext (node-gyp
   visible in the log) and the existing lease/flock tests must pass unchanged.
5. **Determinism check**: `pnpm install --frozen-lockfile` on a clean checkout reproduces both
   halves; if the resolved fs-ext ever leaves `2.1.1`, pnpm errors that the patch is not
   applied — rebase the patch, do not delete it.

If, and only if, the installed pnpm version ignores a `scripts` edit delivered by a patch
(older resolvers can keep the registry snapshot script that drives `requiresBuild`), add the
narrow second guard from §2: keep fs-ext out of the build allow-list on that machine and re-run
steps 1–3. That variant still meets the goal on Windows because Half A already removed the
load-time dependency on the `.node`; it must not be committed in a form that disables the build
for POSIX.

### 4.6 Rollback

Revert the two committed files (`patches/fs-ext@2.1.1.patch`, the `pnpm-workspace.yaml` entry,
and the lockfile hunk) and re-run `pnpm install`. Nothing was installed on the machine, no global
config or env var was set, `fixture/` was never written — the workspace returns exactly to its
pre-fix state.

### 4.7 Risks and limits (stated, not hidden)

- Version-pinned by design; an fs-ext bump requires a rebase (loud, not silent).
- Half A converts a *build*-time failure into a *call*-time assertion on win32. That is correct
  here precisely because §3 proves the call site unreachable; it is not a general pattern for live
  dependencies.
- The stub export list must be generated from the unpatched entry (one grep), not invented, or a
  future consumer of another fs-ext export would see `undefined` instead of a loud error.
- No change to POSIX locking, log publishing or directory-removal semantics is intended; step 4
  of §4.5 is the guard on that claim.

---

## 5. Corridor card

**`DSH-0.1.3-A1-03`** — the A1-lane corridor card for install-time native-addon blockers: a
dependency whose lifecycle script needs a compiler (node-gyp / MSVC / Windows SDK) the machine
will never have, where the module must nonetheless *resolve and load* because of a static import,
and is never *called* on that platform. Its remedy is exactly the one used here: a repo-local pnpm
`patchedDependencies` patch over the package install script and entry file, cross-platform, no
toolchain installed, no upstream fork.

(Cited as the A1 native-addon build-blocker entry; if the local catalogue has been re-cut since
this revision, match on the A1 lane plus "native addon build blocker", not on the number alone.)

---

## 6. Evidence index (what backs each claim)

| Claim | Evidence |
|---|---|
| Failing package, exact pin, runtime dep | `manifest-excerpt.json` L2–6 |
| Install step and its failure mode | `install-error.log` L3–12 |
| Missing toolchain (no VS, no vswhere, owner refuses) | `install-error.log` L4–9; `README.md` L3–4 |
| dsh surfaces pnpm exit 1 | `install-error.log` L13–14 |
| Static top-level import forces load on Windows | `lease-excerpt.md` L11, L17–19 |
| Windows takes the named-semaphore path; no file lock or handle | `lease-excerpt.md` L5–8, L15; `win32-excerpt.ts` L8–13, L23–24 |
| Existing patch precedent for native deps | `README.md` L7–10 |

Nothing in `fixture/` was modified; no package manager, git, or network operation was run
against it; and no Visual Studio component is proposed for installation anywhere in this plan.
