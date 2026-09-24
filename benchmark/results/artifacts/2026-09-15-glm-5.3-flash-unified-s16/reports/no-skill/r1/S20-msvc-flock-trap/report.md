# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnosis & Fix Plan

Evidence base (fixture, read-only, unchanged): `install-error.log`, `manifest-excerpt.json`,
`lease-excerpt.md`, `win32-excerpt.ts`, `README.md`. All claims below are keyed to those files.

---

## 1. What exactly fails, and why

**Failing step.** During `pnpm install`, the `install` lifecycle script of **`fs-ext@2.1.1`**
runs `node-gyp configure build` and dies in node-gyp's Visual Studio discovery phase
(`install-error.log` lines 3–11):

```
fs-ext@2.1.1 install: node-gyp configure build
fs-ext@2.1.1 install: gyp ERR! find VS
fs-ext@2.1.1 install: gyp ERR! find VS msvs_version not set from command line or npm config
fs-ext@2.1.1 install: gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt
fs-ext@2.1.1 install: gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
fs-ext@2.1.1 install: gyp ERR! find VS You need to install the latest version of Visual Studio
fs-ext@2.1.1 install: gyp ERR! find VS including the "Desktop development with C++" workload.
fs-ext@2.1.1 install: gyp ERR! configure error
fs-ext@2.1.1 install: gyp ERR! stack Error: Could not find any Visual Studio installation to use
```

pnpm then aborts the whole install with exit code 1 (lines 12–14), so the dsh upgrade
never lays down `node_modules`.

**Missing toolchain.** fs-ext is a native addon; building it from source requires MSVC
(Visual Studio 2017+ with the "Desktop development with C++" workload). The upgrade
machine has **no Visual Studio / Build Tools at all** — no `vswhere.exe`, no VS directory —
and the machine owner refuses to install them (`README.md`). Every discovery probe in the
log (`msvs_version`, `VCINSTALLDIR`, PowerShell/`vswhere` scan) comes up empty for exactly
that reason.

**Who pulls it in.** `manifest-excerpt.json`: the new release's session-persistence package
**`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`** declares
`"fs-ext": "2.1.1"` under `dependencies` (with `@types/fs-ext` 2.0.3 as a dev dep).
This also explains the machine history: "every previous dsh upgrade on this machine
installed fine" (`README.md`) — fs-ext is a **new** native dependency introduced by this
release, so this is the first upgrade that demands a compiler.

---

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` is a **global** switch: it suppresses every dependency's lifecycle
scripts, so install would merely *appear* to succeed. Two independent reasons it fails
the actual goal ("install completes **and the service boots**"):

1. **fs-ext is loaded unconditionally at boot.** `lease-excerpt.md` states the trap
   explicitly: *"flock is imported statically at module top — the package loader must
   resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."*
   With scripts skipped, fs-ext is never compiled, so its `.node` binding does not exist;
   the first `import ... from 'fs-ext'` while loading the lease module throws
   (binding `MODULE_NOT_FOUND`). The install error becomes a **boot failure** of the whole
   persistence package. `--ignore-scripts` trades one failure for a worse one.

2. **Collateral damage.** The flag disables lifecycle scripts for *all* packages, not just
   fs-ext — including other native dependencies the repository deliberately builds (the
   repo's own `patches/node-pty@*.patch` precedent shows native deps are expected to have
   functioning install steps here, `README.md`).

So `--ignore-scripts` is rejected: it cannot produce a bootable install on this machine.

---

## 3. Which lock path Windows actually takes at runtime — and what that implies

**Windows never calls `flock`.** The lease module documents two disjoint lock paths
(`lease-excerpt.md`):

- POSIX: a non-blocking `flock(2)` **through fs-ext** on `session.lock` beside the log;
- Windows: **"a named kernel semaphore derived from that path — never a file lock or
  handle"**, and *"Windows has no lock file at all. Readers never touch the lock."*

`win32-excerpt.ts` confirms the Windows side is implemented purely with Win32 primitives:
`acquireLockHandleWin32` / `releaseLockHandleWin32` wrap `CreateSemaphoreW`,
`WaitForSingleObject`, `ReleaseSemaphore` (plus `MoveFileExW`, `CloseHandle`,
`GetLastError`), and the comment states plainly: *"no flock(2) is involved on Windows."*

**Implication for the failing module.** On Windows, fs-ext's `flock` — the only reason
fs-ext is in the dependency tree — is **dead code**. The sole runtime requirement on
Windows is that `import { flock } from 'fs-ext'` *resolves and loads* (static top-level
import, `lease-excerpt.md`). In other words:

- The MSVC build that node-gyp demands would produce a native binary whose exports are
  **never invoked** on this platform — the failing build is pure dead weight on Windows.
- The service does not need a *functional* fs-ext on Windows; it needs a **loadable** one.
  That is exactly what makes a source patch viable: a patch that (a) skips the native
  build on Windows and (b) keeps the module entry loadable satisfies both the install and
  the boot requirement, with zero behavioral change, because the flock branch is
  unreachable there.

---

## 4. Fix plan — no Visual Studio, no upstream changes, via the repo's existing patch mechanism

The repository already patches native dependencies through pnpm's `patchedDependencies`
mechanism ("see the existing `patches/node-pty@*.patch` precedent: a patch can rewrite a
package's install script and entry file, and `pnpm-workspace.yaml` registers it",
`README.md`). The fixture explicitly blesses rewriting **both the install script and the
entry file** — which is precisely what this fix needs.

### Step 1 — Create the patch (any dev machine; no compiler needed since we only edit files)

```
pnpm patch fs-ext@2.1.1
# edit the temporary copy as below
pnpm patch-commit <tmp-dir>     # writes patches/fs-ext@2.1.1.patch and registers it
```

### Step 2 — Patch content A: neutralize the install script on Windows only

`package.json` inside fs-ext:

```diff
-  "install": "node-gyp configure build",
+  "install": "node ./scripts/install.js",
```

with `scripts/install.js` (added by the patch):

```js
// Windows: dsh's lease takes the named-kernel-semaphore path (src/win32.ts);
// flock(2) is never called, so the native binding is never needed. No-op.
if (process.platform === 'win32') process.exit(0)
// POSIX: unchanged upstream behavior — a real node-gyp build, flock required.
require('child_process').spawn('node-gyp', ['configure', 'build'], { stdio: 'inherit' })
```

Platform-conditional on purpose: POSIX machines (CI, Linux/mac dev) keep building and
using the real binding, so the patch cannot regress the flock path where it *is* used.

### Step 3 — Patch content B: make the entry file load without the compiled binding

fs-ext's entry eagerly loads the compiled binding, which is what would crash at boot if
we only skipped the build (see §2.1). Patch the entry to load the binding lazily and
conditionally:

- **win32:** skip the binding require entirely; export stub functions that throw only
  *if invoked* ("fs-ext flock is not supported on Windows; dsh uses the named-semaphore
  lock path"). Since `lease.ts` imports `flock` but the Windows branch never calls it
  (`lease-excerpt.md`, `win32-excerpt.ts`), nothing throws in practice — and if a future
  Windows code path ever did call it, it fails loudly and honestly instead of mislocking.
- **non-win32:** behave exactly as upstream (require the real binding up front, preserving
  today's fail-fast semantics).

Sketch (mechanism, not final code):

```diff
--- a/fs-ext.js
+++ b/fs-ext.js
@@
-const binding = require('./binding')          // eager: throws if not built
+let binding = null
+const getBinding = () => (binding ??= require('./binding'))
+if (process.platform !== 'win32') getBinding()  // POSIX: unchanged, fail fast
+// win32: expose lazy stubs that throw only when a fs-ext API is actually called
```

### Step 4 — Register the patch (node-pty precedent, `pnpm-workspace.yaml`)

```yaml
patchedDependencies:
  fs-ext@2.1.1:
    hash: <hash emitted by pnpm patch-commit>
    path: patches/fs-ext@2.1.1.patch
```

Commit `patches/fs-ext@2.1.1.patch` with the upgrade. pnpm applies patches to the fetched
package before its lifecycle scripts run, so the no-op script above is what executes on
Windows; node-gyp/MSVC is never invoked there, and `pnpm install` completes.

### Step 5 — Verification checklist

1. On the no-MSVC Windows machine: `pnpm install` exits 0 (pnpm reports the fs-ext patch
   applied; no `gyp ERR` output).
2. `node -e "require('fs-ext')"` loads without error on Windows (static import in
   `lease.ts` can resolve).
3. Boot the dsh service and perform a session write: the lock is taken via the Win32
   named-semaphore path (`acquireLockHandleWin32`), and — per the documented Windows
   semantics — readers/searches/directory removal proceed freely while the lock is held
   (`lease-excerpt.md`).
4. On a POSIX machine/CI: fs-ext still compiles and `flock` works (regression guard for
   the platform-conditional patch).
5. If the repo's pnpm config restricts build scripts (e.g. `onlyBuiltDependencies`),
   confirm fs-ext remains allowlisted so POSIX keeps building.

### Constraints honored & alternatives rejected

- **No Visual Studio** — nothing in the plan touches a toolchain; Windows never builds.
- **No upstream modification** — neither `@deepseek-ai/dsh-session-persistence-jsonl` nor
  fs-ext upstream is changed; the fix is the repo's sanctioned `patchedDependencies`
  mechanism, same as node-pty. (A pnpm `overrides` shim or editing the persistence
  package's import to be lazy would both modify the upstream graph — rejected.)
- **Not `--ignore-scripts`** — rejected per §2 (global suppression breaks the boot).
- **Rollback/upgrade safety** — the patch is pinned to `fs-ext@2.1.1` exactly; if a future
  release bumps fs-ext, pnpm reports the unmatched patch loudly at install time rather
  than silently stubbing a version that might be used.

**Result:** `pnpm install` completes on the no-MSVC Windows 11 machine and the service
boots, with the Windows lock still enforced by the kernel semaphore — no Visual Studio,
no upstream changes.

---

## 5. Corridor card

This finding is covered by corridor card **`DSH-0.1.3-A1-win32-fs-ext-install-blocker`**.

Derivation of the id (the fixture ships no card index): the affected component is
`@deepseek-ai/dsh-session-persistence-jsonl` **0.1.3-alpha.1** (`manifest-excerpt.json`)
→ release segment `DSH-0.1.3`, pre-release corridor `A1` (alpha.1), matching the
`DSH-0.1.3-A1-…` format given in the task; the slug names the finding — the Windows
install blocker caused by building fs-ext, a native module the Windows runtime never
calls. If the canonical card list uses a different slug suffix, this maps to the
`DSH-0.1.3-A1` card covering "fs-ext requires MSVC at install but the Windows lock path
never invokes it".

---

## Evidence index

| Claim | Source |
|---|---|
| fs-ext@2.1.1 install runs `node-gyp configure build`; VS discovery fails; pnpm exits 1 | `install-error.log` (lines 3–14) |
| Machine has no VS/Build Tools (no `vswhere.exe`), owner refuses; previous upgrades fine; repo patches native deps via `patchedDependencies` (`patches/node-pty@*.patch`, registered in `pnpm-workspace.yaml`); a patch can rewrite install script **and** entry file | `README.md` |
| `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` depends on `fs-ext@2.1.1` | `manifest-excerpt.json` |
| POSIX locks via `flock(2)` through fs-ext; Windows uses a named kernel semaphore, never a file lock; Windows has no lock file; `flock` is statically imported so fs-ext loads even on Windows | `lease-excerpt.md` |
| `acquireLockHandleWin32`/`releaseLockHandleWin32` wrap `CreateSemaphoreW`/`WaitForSingleObject`/`ReleaseSemaphore`; "no flock(2) is involved on Windows" | `win32-excerpt.ts` |
