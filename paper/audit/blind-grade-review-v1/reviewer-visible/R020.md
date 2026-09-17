# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnostic Report

Scope: read-only diagnosis of the fixture evidence pack (install-error.log, manifest-excerpt.json, lease-excerpt.md, win32-excerpt.ts, README.md). No fixture file was modified. Guidance follows the plugin-upgrade skill (Mode A inspect / packaging corridor card DSH-0.1.3-A1-03).

## 1. What exactly fails, and why

- **Package**: `fs-ext@2.1.1`, a pinned runtime dependency of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` (manifest-excerpt.json: `"dependencies": { "fs-ext": "2.1.1" }`, plus `@types/fs-ext: 2.0.3` in devDependencies).
- **Install step**: `fs-ext@2.1.1 install: node-gyp configure build` (install-error.log). fs-ext is a native addon, so pnpm runs its node-gyp build script during install.
- **Missing toolchain**: node-gyp cannot locate a C++ compiler: `gyp ERR! find VS … could not use PowerShell to find Visual Studio 2017 or newer … Error: Could not find any Visual Studio installation to use`. README.md confirms the machine has "no Visual Studio / Build Tools installation (no vswhere.exe, no VS directory)" and the owner refuses to install them.
- **Result**: the install script fails, pnpm exits 1 (`pnpm: Command failed with exit code 1`), so the dsh upgrade aborts — even though Node, corepack/pnpm, and every previous dsh upgrade worked on this machine (README.md).

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` only skips running node-gyp; it does not produce the native addon binary. `src/lease.ts` **statically imports** `flock` from `fs-ext` at module top (lease-excerpt.md: "import { flock } from 'fs-ext'" and the note "the package loader must resolve and load fs-ext even on Windows, where the flock branch is never taken"). With no compiled `fs_ext.node`, loading `@deepseek-ai/dsh-session-persistence-jsonl` fails at import time, so the service cannot boot — the card DSH-0.1.3-A1-03 states this exactly: "`pnpm install --ignore-scripts` cannot skip it — the module must exist and load." The install would "succeed" only to fail at startup.

## 3. Which lock path Windows actually takes at runtime, and what that implies

Windows never takes the flock path at all:

- lease-excerpt.md: "POSIX takes a non-blocking flock(2) (through fs-ext) on `session.lock` … **Windows holds a named kernel semaphore derived from that path — never a file lock or handle**" and "**Windows has no lock file at all.** Readers never touch the lock."
- `src/lease.ts` routes Windows to `acquireLockHandleWin32` / `releaseLockHandleWin32` from `./win32.ts`, which are pure Win32 named-semaphore bindings (`CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle`); win32-excerpt.ts states plainly: "no flock(2) is involved on Windows."
- (win32.ts also replaces the POSIX parent-directory fsync with `MoveFileExW` for durability — further evidence the Windows plane never touches fs-ext.)

**Implication**: `fs-ext` is dead code on Windows — its native module is never called. The failing build is therefore a packaging problem, not a functional need, so the least-invasive fix is to make install/build and loading Windows-safe without changing upstream or installing Visual Studio.

## 4. Concrete least-invasive fix plan (no Visual Studio, no upstream change)

Follow the repository's existing patch precedent for native dependencies: README.md documents pnpm `patchedDependencies` with the existing `patches/node-pty@*.patch` precedent ("a patch can rewrite a package's install script and entry file, and `pnpm-workspace.yaml` registers it"). This is exactly the recipe of card DSH-0.1.3-A1-03:

1. **Confirm the platform path first** (done above): on Windows `lease.ts` takes `acquireLockHandleWin32` (named kernel semaphore); `flock` is only the POSIX branch, so the native module is dead code on Windows.
2. **Create a pnpm patch for `fs-ext@2.1.1`** (`pnpm patch fs-ext@2.1.1` → edit → `pnpm patch-commit`), containing two rewrites:
   - **Install script**: make `node-gyp configure build` run only on non-Windows (e.g. a small guard script that exits 0 on `process.platform === 'win32'`, otherwise execs node-gyp). Linux/macOS keep the real native build.
   - **Entry file**: give the JS entry a pure-JS `flock` fallback on Windows — warn once and no-op — so the static import in `lease.ts` resolves and loads; the flock branch is never invoked on Windows anyway.
3. **Register the patch** in `pnpm-workspace.yaml` under `patchedDependencies` (pointing at the new `patches/fs-ext@2.1.1.patch`) and ensure `fs-ext` remains listed in `allowBuilds` so non-Windows builds are still permitted.
4. **Re-run `pnpm install`** on the machine.

Explicitly rejected alternatives: do not install Visual Studio Build Tools (machine owner refuses; unnecessary since the code is never called on Windows), do not modify/pin a different upstream `fs-ext` version or edit `@deepseek-ai/dsh-session-persistence-jsonl`'s manifest, and do not rely on `--ignore-scripts` alone (item 2). Note for the future: corridor card DSH-0.1.5-A1-13 removes `fs-ext` entirely in favor of `@deepseek-ai/node-addon-system/flock` (`tryLockExclusive`), which permanently eliminates this install blocker — upgrading past 0.1.5-alpha.1 supersedes this patch.

## 5. Covering corridor card

**DSH-0.1.3-A1-03 · "Windows install fails on the `fs-ext` native build; the runtime never calls `flock` on Windows"** (references/v0.1.3-alpha.1.md, corridor rc.2 → 0.1.3-alpha.1). Its symptoms, recipe (Windows-guarded install script + pure-JS flock fallback via a pnpm patch following the `patches/node-pty@*` precedent, registered in `pnpm-workspace.yaml`), and verification steps match this fixture exactly.

**Verification plan (from the card)**: `pnpm install` completes; `require('fs-ext')` loads and the flock callback path warns once instead of throwing; `dsh web --no-open` boots and answers HTTP 200 — i.e. install completes and the service boots, the sole goal of this plan.

## Rollback

The only owned paths are the new `patches/fs-ext@2.1.1.patch` and the `patchedDependencies`/`allowBuilds` entries in `pnpm-workspace.yaml`; removing them restores the prior state. No upstream dependency files are changed.
