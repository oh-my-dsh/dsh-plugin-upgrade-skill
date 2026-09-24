# S20 · Windows Install Blocker: `fs-ext` Native Build the Runtime Never Calls — Diagnosis & Fix Plan

Static diagnosis task. All claims below are backed by the read-only fixture at
`environment/fixture/` (`install-error.log`, `manifest-excerpt.json`, `lease-excerpt.md`, `win32-excerpt.ts`, `README.md`). No fixture file was modified; no commands were executed against the machine; this is a paper diagnosis with a concrete patch plan.

## 1. What exactly fails, and why

**Failing step.** `pnpm install` exits 1 during the **install script phase** of the native dependency `fs-ext@2.1.1`. Its `install` lifecycle script runs `node-gyp configure build`, which needs a C++ toolchain. From `install-error.log`:

```
fs-ext@2.1.1 install: node-gyp configure build
fs-ext@2.1.1 install: gyp ERR! find VS msvs_version not set from command line or npm config
fs-ext@2.1.1 install: gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt
fs-ext@2.1.1 install: gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
fs-ext@2.1.1 install: gyp ERR! find VS You need to install the latest version of Visual Studio
fs-ext@2.1.1 install: gyp ERR! configure error
fs-ext@2.1.1 install: Failed
pnpm: Command failed with exit code 1
```

**Who pulls it.** `manifest-excerpt.json` shows `fs-ext` is a **pinned production dependency** of the dsh package being upgraded:

```json
{
  "name": "@deepseek-ai/dsh-session-persistence-jsonl",
  "version": "0.1.3-alpha.1",
  "dependencies": { "fs-ext": "2.1.1" }
}
```

**Missing toolchain.** node-gyp's Visual Studio locator failed on every probe: no `msvs_version` config, no `VCINSTALLDIR`, and the PowerShell/vswhere discovery found no VS 2017+ — because, per `README.md`, the machine has **no Visual Studio / Build Tools at all** (no `vswhere.exe`, no VS directory) and the owner refuses to install them. This is the first upgrade that breaks because `fs-ext` (a compiled C++ addon) is a *new* transitive requirement at 0.1.3-alpha.1; earlier upgrades installed fine because nothing needed a compiler.

So: **package** = `fs-ext@2.1.1` (pinned by `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`); **install step** = its `node-gyp configure build` install script; **missing toolchain** = MSVC / "Desktop development with C++" workload.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` would indeed skip the `node-gyp configure build` script, so no compiler is invoked. But that only defers the failure to **module load time**. `lease-excerpt.md` states:

> `import { flock } from 'fs-ext'` … `flock` is imported statically at module top — the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken.

With scripts skipped, `fs-ext`'s `.node` binary is never compiled, so `require('fs-ext')` throws at the static top-level import of `src/lease.ts` — session persistence fails to load and the service never boots. `--ignore-scripts` trades an install-time error for a boot-time error; it is not a fix.

## 3. Which lock path Windows actually takes at runtime — and what that implies

`lease-excerpt.md` documents the split:

- **POSIX**: non-blocking `flock(2)` via `fs-ext` on a `session.lock` file beside the log.
- **Windows**: **"holds a named kernel semaphore derived from that path — never a file lock or handle"**, via `acquireLockHandleWin32` / `releaseLockHandleWin32`. "**Windows has no lock file at all.** Readers never touch the lock."

`win32-excerpt.ts` confirms the Windows bindings: `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle` — "no `flock(2)` is involved on Windows."

**Implication:** `fs-ext`'s compiled `flock` binding is **dead code on Windows**. It exists only to satisfy the static import in `src/lease.ts`; it is never executed. Therefore the native build can be replaced on Windows by a loadable pure-JS shim that merely preserves the import surface — correctness of cross-process locking is unaffected, because Windows locking never goes through `flock`. Conversely, on Linux/macOS the real native `flock` must be kept.

## 4. Least-invasive fix plan (no Visual Studio, no upstream changes)

Follow the repository's existing native-dependency patch precedent (`README.md`: pnpm `patchedDependencies`, existing `patches/node-pty@*.patch` — "a patch can rewrite a package's install script and entry file, and `pnpm-workspace.yaml` registers it"). The patch lives in *our* workspace; the upstream `fs-ext` repo and its published tarball are untouched.

1. **Create the patch for `fs-ext@2.1.1`** (`pnpm patch fs-ext@2.1.1`), then edit the patched copy:
   - **Install script**: rewrite `package.json`'s `install` script to run `node-gyp configure build` **only on non-Windows** (e.g. `node -e "if (process.platform === 'win32') process.exit(0)" && node-gyp configure build`, or a tiny `scripts/install.js` that exits 0 on `win32`). Linux/macOS keep the genuine native build.
   - **Entry file**: make the main module a guarded loader — on Windows, export a **pure-JS `flock` fallback** with the same call signature (callback-taking, non-blocking semantics) that **warns once and no-ops** instead of loading the missing `.node` addon; on POSIX, load the real built addon unchanged. This keeps the static `import { flock } from 'fs-ext'` in `lease.ts` resolvable and loadable on Windows.
2. **Register it** in `pnpm-workspace.yaml`:
   ```yaml
   patchedDependencies:
     fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
   ```
   plus the repo's `allowBuilds` entry so pnpm still permits the (now platform-gated) build script for non-Windows hosts.
3. **Re-run `pnpm install`** on the Windows machine. No install script runs for `fs-ext` on Windows, so node-gyp/MSVC is never invoked; install completes.
4. **Verify**:
   - `pnpm install` exits 0;
   - `node -e "require('fs-ext')"` loads; calling `flock` on Windows warns once and returns success instead of throwing;
   - the service cold-boots (`dsh web --no-open` style smoke: boots and answers HTTP 200), exercising session persistence — the Windows lock path goes through the named kernel semaphore exactly as before.
5. **Boundaries respected**: no Visual Studio installed; no upstream (`fs-ext` or dsh) repository modified; the real Windows semaphore lock (`acquireLockHandleWin32`) is untouched — only the dead-on-Windows `flock` surface is shimmed; Linux/macOS keep the real native build.

Optional forward note: upstream later replaced `fs-ext` with `@deepseek-ai/node-addon-system` packaging (per the 0.1.5-alpha.1 corridor), which removes this trap at later versions — but for the 0.1.3-alpha.1 upgrade at hand, the pnpm patch is the least-invasive route.

## 5. Corridor card

**DSH-0.1.3-A1-03** — "Windows install fails on the `fs-ext` native build; the runtime never calls `flock` on Windows" (0.1.2-rc.1 → 0.1.3-alpha.1 corridor, `skills/plugin-upgrade/references/v0.1.3-alpha.1.md`; type *breaking*, install-channel finding, single-host Windows field report).

The card matches this incident exactly and prescribes the same recipe: same symptom (`pnpm install` exit 1 on `gyp ERR! find VS` for `fs-ext@2.1.1` pinned by `dsh-session-persistence-jsonl`), same static-import trap (`--ignore-scripts` insufficient), same platform analysis (Windows = named kernel semaphore, `flock` dead code), and the same fix: a pnpm `patchedDependencies` patch that gates `node-gyp` to non-Windows and adds a warn-once pure-JS `flock` fallback on Windows, registered in `pnpm-workspace.yaml` — with the explicit constraints "do not install Visual Studio just for this, do not patch upstream, and do not rely on `--ignore-scripts` alone." The card also names this as an install-channel pitfall (rollup R-08 install-channel pitfalls).
