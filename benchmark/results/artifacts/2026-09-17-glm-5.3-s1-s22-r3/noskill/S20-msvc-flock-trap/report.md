# S20 · Windows Install Blocker: the fs-ext native build the runtime never calls — static diagnosis and fix plan

Task: static diagnosis only; the fixture directory was not modified. All claims below are backed by the fixture evidence (install-error.log, manifest-excerpt.json, lease-excerpt.md, win32-excerpt.ts, README.md).

## 1. What exactly fails, and why

- **Package**: `fs-ext@2.1.1`, a pinned production dependency (not dev) of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` (manifest-excerpt.json: `"dependencies": { "fs-ext": "2.1.1" }`).
- **Install step**: fs-ext's `install` lifecycle script runs `node-gyp configure build` (install-error.log, first line). node-gyp compiles a C++ native addon and therefore needs the MSVC toolchain.
- **Missing toolchain**: every Visual Studio discovery probe failed — `msvs_version not set`, `VCINSTALLDIR not set`, PowerShell-based VS 2017+ lookup found nothing, concluding "You need to install the latest version of Visual Studio including the 'Desktop development with C++' workload" (install-error.log). README.md confirms the machine has no VS / Build Tools (no `vswhere.exe`, no VS directory) and the owner refuses to install them.
- Result: `pnpm install` exits 1, upgrade blocked. This is the first upgrade that breaks because fs-ext is a newly introduced compiled dependency at 0.1.3-alpha.1; earlier upgrades installed fine since nothing needed a compiler (README.md).

## 2. Why `pnpm install --ignore-scripts` cannot fix this

Per lease-excerpt.md, `src/lease.ts` does:

```ts
import { flock } from 'fs-ext'
import { acquireLockHandleWin32, releaseLockHandleWin32 } from './win32.ts'
```

with the explicit note: *"flock is imported statically at module top — the package loader must resolve and load fs-ext even on Windows, where the flock branch is never taken."*

`--ignore-scripts` only skips the install (node-gyp) script. The package itself remains a declared dependency that `lease.ts` imports statically: when the persistence module is loaded, Node must resolve fs-ext and run its entry file. With the build skipped, the compiled `.node` binary is missing, so the module load throws and `dsh-session-persistence-jsonl` — and every profile that persists sessions — fails at boot. `--ignore-scripts` merely converts an install-time failure into a boot-time failure; it does not remove the load requirement of the static import.

## 3. Which lock path Windows actually takes, and what that implies

lease-excerpt.md and win32-excerpt.ts give the exact split:

- **POSIX**: non-blocking `flock(2)` via fs-ext on `session.lock` beside the log — the only consumer of fs-ext.
- **Windows**: **never a file lock or handle**; lease.ts calls `acquireLockHandleWin32` / `releaseLockHandleWin32`, which wrap a **named kernel semaphore** derived from the session path (CreateSemaphoreW / WaitForSingleObject / ReleaseSemaphore / CloseHandle bindings in win32-excerpt.ts). "no flock(2) is involved on Windows", "Windows has no lock file at all" — readers, searches, and directory removal proceed freely while the lock is held.

**Implication**: on Windows the fs-ext native module is dead code — the `flock` symbol is referenced only by the never-taken POSIX branch. The install blocker is purely a packaging problem (a native build required at install time), not a runtime dependency. The fix may safely neutralize the fs-ext build on Windows, provided the static import still resolves and load.

## 4. Least-invasive fix plan — no Visual Studio, no upstream changes

Follow the repository's existing patch precedent for native dependencies: README.md states the repo already patches native deps via pnpm `patchedDependencies` (the existing `patches/node-pty@*.patch`), where a patch can rewrite a package's install script and entry file, registered in `pnpm-workspace.yaml`.

1. **Confirm the platform path** (done in §3): Windows routes to the named-semaphore win32 bindings; flock is the POSIX branch only. The native module is unreachable on Windows, so skipping its build is safe.
2. **Create a pnpm patch for fs-ext@2.1.1**: `pnpm patch fs-ext@2.1.1` → edit the extracted package → `patches/fs-ext@2.1.1.patch`. The patch:
   - **rewrites the install script to skip `node-gyp configure build` on win32** (e.g. make `install` a no-op or plain-JS prebuild check on Windows), removing the MSVC requirement; and
   - **gives the package entry a pure-JS `flock` fallback** — a stub that warns once and no-ops instead of throwing when the compiled binary is absent, so the static `import { flock } from 'fs-ext'` in lease.ts resolves and loads cleanly. The stub is unreachable in practice on Windows (the flock branch is never taken); it exists only to satisfy module loading. POSIX keeps the real binding, so no real lock is disabled anywhere.
3. **Register the patch** in `pnpm-workspace.yaml`: add `fs-ext@2.1.1: patches/fs-ext@2.1.1.patch` under `patchedDependencies` (and any build-script allowlist entry, consistent with the node-pty precedent). Re-run `pnpm install` — it now completes without MSVC.
4. **Nothing upstream changes**: the manifest still pins `fs-ext@2.1.1`; the patch is applied locally at install time by pnpm, exactly like the node-ty [node-pty] precedent. No fork, no PR to fs-ext, no VS install, and no change to the real Windows lock (the named kernel semaphore stays untouched).

**Verification**: `pnpm install` completes; loading fs-ext succeeds and its flock stub warns instead of throwing; the dsh service boots and session persistence works — on Windows it acquires the write-ownership lock through acquireLockHandleWin32 (named semaphore), never touching fs-ext; one full message → tool → response round confirms the profile is healthy.

## 5. Corridor card

`DSH-0.1.3-A1-03` — "Windows install fails on the fs-ext native build; the runtime never calls flock on Windows" (edge 0.1.2-rc.1 → 0.1.3-alpha.1; packaging/install surface, no plugin touchpoints; action required-if-hit). Its migration recipe matches the plan in §4: patch fs-ext@2.1.1 via pnpm patchedDependencies to skip the native build on Windows and provide a loadable flock stub.

## Summary table

| # | Question | Answer |
|---|---|---|
| 1 | What fails | fs-ext@2.1.1 (pinned dep of dsh-session-persistence-jsonl@0.1.3-alpha.1): its `node-gyp configure build` install script fails — no Visual Studio / MSVC on the machine; pnpm install exits 1 |
| 2 | Why not --ignore-scripts | lease.ts statically imports `flock` from fs-ext; the module must exist **and load** even on Windows — skipping the build moves the failure from install time to boot time |
| 3 | Windows lock path | Named kernel semaphore (CreateSemaphoreW & co. in win32.ts via acquireLockHandleWin32) — never a file lock/handle, no lock file at all ⇒ fs-ext is dead code on Windows |
| 4 | Fix | pnpm patch of fs-ext@2.1.1 (node-pty precedent): skip node-gyp on win32 in the install script + pure-JS warn-once flock stub in the entry; register in pnpm-workspace.yaml |
| 5 | Card | DSH-0.1.3-A1-03 |
