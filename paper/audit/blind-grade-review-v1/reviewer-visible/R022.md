# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnostic Report

Static diagnosis from the evidence pack in `environment/fixture/` (read-only; nothing under the fixture was modified).

## 1. What exactly fails, and why

`pnpm install` fails during the install script of the **native (node-gyp) dependency `fs-ext@2.1.1`**. From `install-error.log`:

```
fs-ext@2.1.1 install: node-gyp configure build
fs-ext@2.1.1 install: gyp ERR! find VS msvs_version not set from command line or npm config
fs-ext@2.1.1 install: gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
fs-ext@2.1.1 install: gyp ERR! stack Error: Could not find any Visual Studio installation to use
```

The package that pulls it in is **`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`**, which declares `"fs-ext": "2.1.1"` in `dependencies` (`manifest-excerpt.json`) plus `@types/fs-ext@2.0.3` in devDependencies.

The failing install step is `fs-ext`'s `install` lifecycle script (`node-gyp configure build`), which compiles fs-ext's C++ flock bindings against the Node ABI. That step requires an MSVC toolchain ("Desktop development with C++" workload). Per `README.md`, the machine has **no Visual Studio / Build Tools installation (no `vswhere.exe`, no VS directory)** and the owner refuses to install them, so `node-gyp` cannot find any compiler and exits — failing the whole `pnpm install` (exit code 1).

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` only skips lifecycle scripts (including fs-ext's `node-gyp` build); it does not make the missing artifact go away:

- fs-ext's runtime entry point is a statically loaded native binding. `lease-excerpt.md` states: *"Note: `flock` is imported statically at module top — the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."* With the build skipped, the `.node` binary never exists, so `require/import 'fs-ext'` throws (`ERR_DLOPEN_FAILED` / module-not-found) the moment `src/lease.ts` is loaded — i.e. at service boot, not install.
- Skipping scripts globally is also unsafe for the rest of the workspace: it would suppress *every* package's lifecycle scripts (other legitimate postinstall steps), so "it installed" would be a false success with a broken runtime.
- Therefore the import must be satisfiable at install time; the module has to be genuinely built or replaced, not merely skipped.

## 3. Which lock path Windows actually takes at runtime, and what it implies about fs-ext

Per `lease-excerpt.md`: POSIX takes a non-blocking `flock(2)` (through fs-ext) on `session.lock`; **"Windows holds a named kernel semaphore derived from that path — never a file lock or handle"** and *"Windows has no lock file at all."* `win32-excerpt.ts` confirms: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle` (plus `MoveFileExW` for the durable-namespace rename, since Windows has no parent-directory fsync), and the excerpt states explicitly: *"no flock(2) is involved on Windows."*

**Implication:** the *flock functionality* of fs-ext is dead code on Windows — it is never called on that platform. The only reason fs-ext is needed there at all is the **static top-level `import { flock } from 'fs-ext'`** in `lease.ts`, which forces the package loader to resolve and load fs-ext even though the flock branch is never taken. So the failing native build buys nothing on this machine; the requirement is merely that a loadable `fs-ext` module resolves at import time.

## 4. Concrete, least-invasive fix plan (no Visual Studio, no upstream changes)

The repository already has a mechanism for exactly this: `README.md` — *"The repository already patches native dependencies through pnpm's `patchedDependencies` mechanism (see the existing `patches/node-pty@*.patch` precedent): a patch can rewrite a package's install script and entry file, and `pnpm-workspace.yaml` registers it."*

Plan — add `patches/fs-ext@2.1.1.patch`, registered in `pnpm-workspace.yaml` under `patchedDependencies` (mirroring the `node-pty@*` precedent):

1. **Neutralize the install script.** Patch fs-ext's `package.json` to replace its `"install": "node-gyp configure build"` script with a no-op (e.g. `node -e ""`) or remove it. No compiler is invoked; `pnpm install` completes.
2. **Provide a Windows-safe module that resolves and loads.** Because `lease.ts` imports `{ flock }` statically, the patched fs-ext entry must still export a `flock` symbol. Add a pure-JS fallback in the patched package (selected per-platform via the package `main`/`exports`, or a top-level wrapper): on `process.platform === 'win32'`, export `flock` as a function that throws `new Error("flock is not supported on Windows; the Windows lock path uses a named kernel semaphore (see src/win32.ts)")` — it must exist so the static import destructure succeeds, but can never be legitimately reached, since Windows never takes the flock branch. On POSIX, re-export the real native binding as today.
3. **No other code changes.** `lease.ts`, `win32.ts`, and the upstream fs-ext sources stay untouched; the fix lives entirely in the repo-owned patch file plus its `pnpm-workspace.yaml` registration, exactly like the existing `patches/node-pty@*.patch` precedent. (Upstream is not modified; the patch is applied locally by pnpm at install.)
4. **Verify on the target machine:** `pnpm install` completes with exit code 0 (no `gyp ERR`), and the service boots — proving the statically imported `fs-ext` resolves, the import succeeds, and the Windows named-semaphore lock path (never fs-ext's flock) drives locking.

This satisfies the only goal: `pnpm install` completes and the service boots on the MSVC-less Windows 11 machine, without installing Visual Studio and without modifying upstream dependencies.

## 5. Corridor card

The finding is covered by corridor card **`DSH-0.1.3-A1-fs-ext-windows-named-semaphore-lock`** — the `DSH-0.1.3-A1` prefix corresponds to the affected package version `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` from `manifest-excerpt.json`, and the card subject is the Windows lock path established in `lease-excerpt.md` / `win32-excerpt.ts` (named kernel semaphore, no file lock, fs-ext's flock branch never taken on Windows). Note: the evidence pack contains no card index file, so the slug portion after `DSH-0.1.3-A1-` is reconstructed from the pack's subject matter; the grounded, evidence-backed portion of the id is `DSH-0.1.3-A1`.
