# S20 · Windows install blocker: a native build the runtime never calls

Diagnosis is read-only: the fixture under `fixture/` was not modified. All
conclusions are cited from fixture evidence plus the corridor card set.

## 1. What exactly fails, and why

- **Package**: `fs-ext@2.1.1` (`fixture/install-error.log:3`), pulled in as a
  pinned dependency of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
  (`fixture/manifest-excerpt.json:2-6`; devDep `@types/fs-ext@2.0.3`).
- **Install step**: fs-ext's lifecycle script `node-gyp configure build`
  (`fixture/install-error.log:3`) — i.e. a native C++ addon compile.
- **Missing toolchain**: node-gyp's Visual Studio discovery fails
  (`fixture/install-error.log:4-11`): `VCINSTALLDIR not set`, PowerShell cannot
  find Visual Studio 2017+, ending in
  `Error: Could not find any Visual Studio installation to use`. On Windows a
  node-gyp build requires MSVC ("Desktop development with C++" workload), and
  this machine has no Visual Studio / Build Tools at all — no `vswhere.exe`, no
  VS directory (`fixture/README.md:3-4`). The owner refuses to install them.
- **Result**: fs-ext install fails → `pnpm install` exits 1 → the dsh upgrade
  exits 1 (`fixture/install-error.log:12-14`). Previous upgrades installed fine
  because this native dependency is new in the 0.1.3-alpha.1 persistence line
  (`fixture/README.md:5-6`).

## 2. Why `pnpm install --ignore-scripts` cannot fix it

`--ignore-scripts` would skip the node-gyp failure, but it also skips producing
the built binding. The module is **required at load time**, not at build time:
`src/lease.ts` statically imports `{ flock } from 'fs-ext'` at module top
(`fixture/lease-excerpt.md:11`), and the excerpt states the package loader
"must resolve and load `fs-ext` even on Windows, where the `flock` branch is
never taken" (`fixture/lease-excerpt.md:17-18`). So with the build skipped,
`require('fs-ext')` fails when the session-persistence package loads — the
install-time failure just moves to boot time. `--ignore-scripts` is therefore
not a fix; it converts a `pnpm install` error into a service boot error.

## 3. Which lock path Windows actually takes — and what that implies

On Windows the runtime never calls `flock`. Per `fixture/lease-excerpt.md:5-8`:
"Windows holds a named kernel semaphore derived from that path — **never a
file lock or handle**", and "Windows has no lock file at all"
(`fixture/lease-excerpt.md:15`). The Windows branch is
`acquireLockHandleWin32` / `releaseLockHandleWin32` (`fixture/lease-excerpt.md:12`),
implemented on `CreateSemaphoreW` / `WaitForSingleObject` /
`ReleaseSemaphore` with "no flock(2) involved on Windows"
(`fixture/win32-excerpt.ts:9-10,23-24`). `flock` is only the POSIX branch.

**Implication**: `fs-ext` provides one meaningful export here — `flock` — and on
Windows that export is dead code. The native module must merely *exist and
load* (static import); neither its compiled binding nor any of its functions is
ever invoked on this platform. Removing the network of "a native build is
required" without breaking the import is therefore safe on Windows, while
Linux/macOS still need the real build.

## 4. Fix plan (no Visual Studio, no upstream modification)

Follow the repository's existing patch mechanism for native dependencies
(`patched/node-pty@*.patch` precedent, registered via pnpm's
`patchedDependencies`; `fixture/README.md:7-10`). All changes stay in the
repository's own `patches/` + `pnpm-workspace.yaml`:

1. **Create `patches/fs-ext@2.1.1.patch`** (generate via
   `pnpm patch fs-ext@2.1.1`, edit, `pnpm patch-commit <dir>`) that does two
   things:
   - rewrites fs-ext's install script so `node-gyp rebuild` runs **only on
     non-Windows** (guard the script on `process.platform !== 'win32'`; on
     win32 exit 0 without building);
   - replaces the package entry so the `flock` export is a **pure-JS fallback
     that warns once and no-ops** (no throw), keeping every other export
     shape-compatible.
2. **Register the patch** in `pnpm-workspace.yaml`
   (`patchedDependencies: fs-ext@2.1.1 → patches/fs-ext@2.1.1.patch`; keep
   fs-ext in the allow-build list so the patch itself applies and non-Windows
   machines still build it).
3. **Re-run `pnpm install`** on the Windows machine. Linux/macOS installs are
   unaffected: the guard is platform-conditional and the native build stays.
4. Explicitly **not** part of the plan: installing Visual Studio, patching
   upstream `fs-ext`, or relying on `--ignore-scripts` alone (see §2).
5. **Verification** (pass/fail gates before declaring the upgrade done):
   - `pnpm install` completes with exit 0 on the no-MSVC Windows 11 machine;
   - `node -e "require('fs-ext')"` loads, and invoking the flock path warns
     once instead of throwing;
   - `dsh web --no-open` boots and answers HTTP 200.

Rollback: remove the `patches/fs-ext@2.1.1.patch` file and its
`patchedDependencies` row, then re-run `pnpm install` (the baseline is the
current pre-upgrade install; `install-error.log` is the recorded failure
state).

## 5. Corridor card

This finding is covered by **`DSH-0.1.3-A1-03`** — "Windows install fails on
the `fs-ext` native build (no MSVC); the runtime never calls `flock` on
Windows — pnpm-patch recipe", from the 0.1.2-rc.1 → 0.1.3-alpha.1 corridor card
set (`references/v0.1.3-alpha.1.md`, idPrefix `DSH-0.1.3-A1`; type: breaking;
packaging/install surface; single-host Windows field report 2026-09-07).

Note: the fixture pins the 0.1.3-alpha.1 persistence cohort
(`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`, `fs-ext@2.1.1`),
so later-corridor packaging changes (fs-ext → `node-addon-system` at
0.1.5-alpha.1, card DSH-0.1.5-A1-13) do **not** apply to this machine.
