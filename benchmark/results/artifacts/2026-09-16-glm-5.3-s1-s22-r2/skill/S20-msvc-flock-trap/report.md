# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnosis & Fix Plan

**Task**: static diagnosis, fixture unchanged. **Corridor card**: `DSH-0.1.3-A1-03` (breaking; "Windows install fails on the `fs-ext` native build; the runtime never calls `flock` on Windows"), from references/v0.1.3-alpha.1.md (0.1.2-rc.1 → 0.1.3-alpha.1 edge).

## 1. What exactly fails, and why

- **Package**: fs-ext@2.1.1, a pinned runtime dependency of @deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1 (manifest-excerpt.json: `"fs-ext": "2.1.1"`).
- **Install step**: fs-ext's `install` lifecycle script runs `node-gyp configure build`, which compiles a C++ native addon and therefore requires the MSVC toolchain.
- **Missing toolchain**: the machine is Windows 11 with no Visual Studio / Build Tools (no vswhere.exe, no VS directory; README.md), so node-gyp's Visual Studio finder fails: `gyp ERR! find VS … VCINSTALLDIR not set` → `could not use PowerShell to find Visual Studio 2017 or newer` → `Could not find any Visual Studio installation to use` (install-error.log). The install script fails, pnpm install exits 1 (`dsh 退出码: 1`), and the upgrade aborts before any code runs.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

--ignore-scripts suppresses the node-gyp build, so no .node binary is produced — but the package is still expected to be **present and loadable**. src/lease.ts (lease-excerpt.md) does a **static top-level import**:

```ts
import { flock } from 'fs-ext'
```

The note is explicit: *"the package loader must resolve and load fs-ext even on Windows, where the flock branch is never taken."* With the native build skipped, fs-ext resolves to an entry whose compiled binary is missing; the static import makes the module loader fail at load time, so dsh-session-persistence-jsonl (and thus every profile that persists sessions) cannot start. --ignore-scripts converts an install-time failure into a boot-time failure — it does not remove the load requirement.

## 3. Which lock path Windows actually takes at runtime

Per lease-excerpt.md and win32-excerpt.ts:

- **POSIX**: non-blocking flock(2) via fs-ext on session.lock beside the log — the only consumer of fs-ext.
- **Windows**: **never a file lock or handle**. lease.ts calls acquireLockHandleWin32 / releaseLockHandleWin32, which wrap a **named kernel semaphore** derived from the path (CreateSemaphoreW / WaitForSingleObject / ReleaseSemaphore / CloseHandle via FFI-style Win32 bindings). *"no flock(2) is involved on Windows"*, and *"Windows has no lock file at all"* — readers, searches, and directory removal proceed freely while the lock is held.

**Implication**: the fs-ext native module (and its MSVC-dependent build) is **dead code on Windows** — the flock symbol is only referenced by the never-taken POSIX branch. The blocker is purely a packaging/install-script problem, not a runtime dependency.

## 4. Least-invasive fix plan (no Visual Studio, no upstream changes)

Follow the repository's existing patch precedent for native dependencies — pnpm's patchedDependencies mechanism already used for patches/node-pty@*.patch and registered in pnpm-workspace.yaml (README.md):

1. **Confirm the platform path** (done in §3): Windows routes to acquireLockHandleWin32; flock is the POSIX branch only. The native module is dead code on Windows.
2. **Create a pnpm patch for fs-ext@2.1.1** (`pnpm patch fs-ext@2.1.1` → patches/fs-ext@2.1.1.patch) that:
   - **rewrites the install script to run `node-gyp configure build` only on non-Windows** (e.g. a tiny guard that skips the build when process.platform === 'win32'), so no MSVC is needed on Windows while Linux/macOS keep the real native build; and
   - **gives the package entry a pure-JS `flock` fallback** — a stub that, on Windows, warns once and no-ops instead of throwing, so the static `import { flock } from 'fs-ext'` in lease.ts resolves and loads cleanly. Since Windows never executes the flock branch, the stub is unreachable in practice; it exists only to satisfy module loading.
3. **Register the patch** in pnpm-workspace.yaml: add fs-ext@2.1.1: patches/fs-ext@2.1.1.patch under patchedDependencies (and allowBuilds / the build-script allowlist, consistent with the node-pty precedent). Re-run pnpm install — it now completes without MSVC.
4. **Nothing upstream changes**: package.json still pins fs-ext@2.1.1; the patch is applied locally at install time by pnpm, exactly like the existing node-pty patch.

**Verification** (per the card): pnpm install completes; require('fs-ext') loads and the flock callback path warns once instead of throwing; dsh web --no-open boots and answers HTTP 200 — the session-persistence service starts, the named-semaphore Windows lock path works (it never touches fs-ext), and one message → tool → response round completes.

## 5. Corridor card

**DSH-0.1.3-A1-03** — *"Windows install fails on the fs-ext native build; the runtime never calls flock on Windows"* (type: breaking; edge 0.1.2-rc.1 → 0.1.3-alpha.1; touchpoints: none — packaging/install surface; action level: required-if-hit). Its migration recipe is exactly the plan in §4, and its source anchors to the dsh-v0.1.3-alpha.1 tag (d347e70): packages/session/session-persistence-jsonl/package.json pins fs-ext@2.1.1, src/lease.ts statically imports flock and routes Windows through acquireLockHandleWin32, src/win32.ts carries the named-semaphore bindings — matching the fixture (manifest-excerpt.json, lease-excerpt.md, win32-excerpt.ts) verbatim.

## Summary answers

| # | Question | Answer |
|---|---|---|
| 1 | What fails | fs-ext@2.1.1 (dep of dsh-session-persistence-jsonl) node-gyp configure build install script fails: no Visual Studio / MSVC on the machine; pnpm install exits 1 |
| 2 | Why not --ignore-scripts | lease.ts statically imports flock from fs-ext; the module must exist **and load** even on Windows — skipping the build moves the failure from install time to boot time |
| 3 | Windows lock path | Named kernel semaphore (CreateSemaphoreW & co. in win32.ts via acquireLockHandleWin32) — never a file lock/handle, no lock file at all ⇒ fs-ext is dead code on Windows |
| 4 | Fix | pnpm patch of fs-ext@2.1.1 (node-pty precedent): skip node-gyp on Windows in the install script + pure-JS warn-once flock stub in the entry; register in pnpm-workspace.yaml |
| 5 | Card | DSH-0.1.3-A1-03 |
