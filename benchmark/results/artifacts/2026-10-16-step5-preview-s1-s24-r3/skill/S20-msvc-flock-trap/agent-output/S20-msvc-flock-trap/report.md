# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnosis & Fix Plan

- **Scenario**: dsh installation upgrade on Windows 11 with **no Visual Studio / Build Tools** (no `vswhere.exe`, no VS directory); owner refuses to install them. `pnpm install` fails.
- **Method**: static diagnosis only. `fixture/` untouched (read-only evidence). No installs, no migrations executed.
- **Covering corridor card**: **`DSH-0.1.3-A1-03`** (corridor edge `dsh-v0.1.2-rc.1` → `dsh-v0.1.3-alpha.1`, file `references/v0.1.3-alpha.1.md`).

## 1. What exactly fails, and why

- **Failing package**: `fs-ext@2.1.1`, a native (node-gyp) addon that provides `flock(2)` bindings.
- **Who pulls it**: `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` pins it as a direct dependency — `manifest-excerpt.json`: `"dependencies": { "fs-ext": "2.1.1" }` (plus `@types/fs-ext@2.0.3` in devDependencies).
- **Failing install step**: the dependency's lifecycle script — `install-error.log`: `fs-ext@2.1.1 install: node-gyp configure build`.
- **Missing toolchain**: MSVC / Visual Studio "Desktop development with C++" workload. node-gyp on Windows compiles the addon from source with MSVC and has **no** prebuilt-binary or compiler-less fallback, so its toolchain probe is fatal:
  - `gyp ERR! find VS msvs_version not set from command line or npm config`
  - `gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt`
  - `gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer`
  - `gyp ERR! find VS You need to install the latest version of Visual Studio … including the "Desktop development with C++" workload`
  - `gyp ERR! configure error … Could not find any Visual Studio installation to use` → `install: Failed`
- **Propagation**: the failed install script makes `pnpm install` exit 1 (`pnpm: Command failed with exit code 1`), so the whole dsh upgrade aborts (`dsh 退出码: 1`).
- **Why it is new**: every previous dsh upgrade on this machine installed fine; the new session-persistence package introduced a native module into the tree where none was needed before.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

- Skipping scripts does skip the failing `node-gyp` build — and that is exactly the trap.
- `fs-ext` is consumed at **module load time, not call time**: `src/lease.ts` imports it statically at module top (`import { flock } from 'fs-ext'`). `lease-excerpt.md` states it explicitly: *"flock is imported statically at module top — the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."*
- With the build skipped, the compiled binding (`fs-ext.node`) is never produced, so the top-level import fails the first time the persistence package loads — the failure just **moves from install time to service boot time** (`Cannot find module` / missing binding). `pnpm install` would go green while the service still cannot start.
- Card `DSH-0.1.3-A1-03` says the same: *"`pnpm install --ignore-scripts` cannot skip it — the module must exist and load."*
- Bonus damage: `--ignore-scripts` also silently skips every other legitimate lifecycle script in the tree.

## 3. Which lock path Windows actually takes at runtime, and what it implies

- **Windows takes the named-kernel-semaphore path.** Per `lease-excerpt.md`: the lock arbiter is the kernel; POSIX takes a non-blocking `flock(2)` (through fs-ext) on `session.lock` beside the log, while **"Windows holds a named kernel semaphore derived from that path — never a file lock or handle"**, and *"Windows has no lock file at all. Readers never touch the lock."*
- Per `win32-excerpt.ts`: the Windows branch is implemented with direct kernel32 bindings — `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` (plus `MoveFileExW` as the durable-namespace substitute for the parent-directory fsync contract) — wrapped as `acquireLockHandleWin32` / `releaseLockHandleWin32`. *"No flock(2) is involved on Windows."*
- **Implication for the failing module**: the entire native `fs-ext` addon — whose only purpose here is `flock(2)` — is **dead code on Windows**. It must exist and load (static import), but its `flock` export is never called on this platform. The install failure therefore comes from a module whose behavior Windows never uses; the correct response is to make the module *exist and load without compiling it*, not to install a C++ toolchain.
- Corollary: a pure-JS stand-in for `flock` on Windows is behavior-preserving, because nothing in the Windows code path ever calls it.

## 4. Fix plan (least-invasive; no Visual Studio, no upstream modification)

**Mechanism** — follow the repository's existing native-dependency patch precedent (`README.md` fixture: pnpm `patchedDependencies`, existing `patches/node-pty@*.patch`; *"a patch can rewrite a package's install script and entry file, and `pnpm-workspace.yaml` registers it"*). This is precisely card `DSH-0.1.3-A1-03`'s migration recipe.

1. **Create the patch (no MSVC needed)**:
   `pnpm patch fs-ext@2.1.1` → `pnpm patch-commit <editdir>` (or `--edit-dir`), which yields `patches/fs-ext@2.1.1.patch` alongside the existing `patches/node-pty@*.patch`.
2. **Two minimal edits inside the patched package** (nothing else; no version bump, no API change):
   a. **Install script → guarded no-op on Windows.** In the package's `package.json`, replace `"install": "node-gyp configure build"` with a platform guard, e.g.
      ```json
      "install": "node -e \"if (process.platform !== 'win32') { require('child_process').execSync('node-gyp configure build', {stdio:'inherit'}) }\""
      ```
      i.e. `node-gyp` runs **only on non-Windows**; on Windows the step is a no-op, so no MSVC lookup ever happens. Linux/macOS keep the native build unchanged.
   b. **Entry → pure-JS `flock` fallback on Windows.** Guard the native binding load in the package entry (`lib/fs-ext.js` / `index.js`) so `require('fs-ext')` succeeds without a compiled binary, and export a `flock` that **warns once and no-ops** on Windows (calls the callback with success), while POSIX keeps loading and calling the real binding:
      ```js
      // patched entry (sketch)
      const isWin = process.platform === 'win32'
      let flock
      if (isWin) {
        let warned = false
        flock = (...args) => {
          if (!warned) { warned = true; process.emitWarning('fs-ext flock unavailable on Windows (pure-JS fallback); the lease uses a named kernel semaphore instead.') }
          const cb = args[args.length - 1]
          if (typeof cb === 'function') cb(null)
        }
      } else {
        ({ flock } = require('./fs-ext.node')) // original native load, unchanged
      }
      ```
      This keeps `src/lease.ts`'s static top-level import satisfiable on a machine with no compiler.
3. **Register the patch** in `pnpm-workspace.yaml` (per the card: `patchedDependencies` and `allowBuilds`; the exact `allowBuilds` key follows the workspace pnpm version's config schema):
   ```yaml
   patchedDependencies:
     fs-ext:
       hash: <sha512 written by pnpm patch-commit>
       version: 2.1.1
   ```
4. **Re-run `pnpm install`** on the Windows machine. Expected: the fs-ext step is a no-op, no `gyp ERR! find VS`, install exits 0.
5. **Boot the service.** Expected (card verification): `require('fs-ext')` loads; the `flock` callback path warns once instead of throwing; `dsh web --no-open` boots and answers HTTP 200; session write locks work through the semaphore path and no `session.lock` file appears.

**Why this is the least-invasive option**
- Installs nothing (no Visual Studio), touches no upstream dependency (the patch is applied at install time from the repository's own `patches/`).
- No change to dsh source and no dependency replacement — Windows already has a correct semaphore-based lock; only the *loadability* of the unused POSIX module is repaired.
- POSIX behavior is unchanged bit-for-bit (the native path is bypassed only under `process.platform === 'win32'`).
- Explicitly rejected alternatives: `--ignore-scripts` (§2 — converts install failure into boot failure); forking/vendoring `fs-ext` (more invasive, diverges from the `node-pty` precedent); installing VS (forbidden by the machine owner).

## 5. Corridor card

- **`DSH-0.1.3-A1-03`** — *"Windows install fails on the `fs-ext` native build; the runtime never calls `flock` on Windows"*.
  - Type: breaking · Applies to: profile wrappers / packaging; any Windows machine without Visual Studio Build Tools upgrading to 0.1.3-alpha.1 · Touchpoints: none (packaging/install surface) · Action level: required-if-hit.
  - Its migration recipe (install script rewritten to run node-gyp only on non-Windows; pure-JS `flock` fallback that warns once; register the patch in `pnpm-workspace.yaml`) and its verification plan (`pnpm install` completes; `require('fs-ext')` loads; `dsh web --no-open` answers HTTP 200) are the basis of §4.
  - Location: `skills/plugin-upgrade/references/v0.1.3-alpha.1.md` (edge `dsh-v0.1.2-rc.1` → `dsh-v0.1.3-alpha.1`; git-tag anchored).
- Related, not primary: from the 0.1.5-alpha.1 corridor onward the packaging swaps `fs-ext` for `node-addon-system` (see `references/v0.1.5-alpha.1.md`), which would remove this failure class entirely — relevant only if the fleet later moves to that cohort.

## Verification plan (run on the machine, in order)

1. `pnpm install` (scripts enabled) → exit 0, no `gyp ERR! find VS`.
2. `node -e "require('fs-ext')"` → loads; a forced `flock` call warns once and does not throw.
3. `dsh web --no-open` → HTTP 200; open a session, write artifacts, confirm a concurrent second writer is excluded via the semaphore and that no `session.lock` file is created on Windows.
4. POSIX regression: on a Linux/macOS host the native build still runs and the `flock` path is unchanged.

## Residual risk / pending

- The patch is pinned to `fs-ext@2.1.1`; bumping the dependency requires regenerating the patch and its `hash` in `pnpm-workspace.yaml`.
- The install-script guard must never reach POSIX — the platform test `process.platform !== 'win32'` is the load-bearing condition.
- `@types/fs-ext` needs no change (types do not require the binary).
- An upstream fix, or the later `node-addon-system` packaging switch, supersedes this patch — remove it then.

## Rollback

- Delete `patches/fs-ext@2.1.1.patch` and the `patchedDependencies.fs-ext` block from `pnpm-workspace.yaml`; `pnpm install` returns to the recorded pre-patch baseline (the current failing state on this machine). Nothing else in the tree is modified by this plan.
