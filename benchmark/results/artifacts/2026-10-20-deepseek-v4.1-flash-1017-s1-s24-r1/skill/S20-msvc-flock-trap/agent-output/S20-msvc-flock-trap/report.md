# S20 · Windows install blocker: fs-ext native build vs. no MSVC

**Verdict**: install-time failure of the **fs-ext@2.1.1** native addon (node-gyp configure build,
no Visual Studio / C++ workload on the host) pulled in by
@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1.
Fix corridor card: **DSH-0.1.3-A1-03**.
Fix: a **pnpm patchedDependencies patch** that (a) runs node-gyp only on non-Windows and
(b) gives the entry a pure-JS flock no-op fallback on win32 — no Visual Studio, no upstream change.
Mode: static diagnosis only (fixture/ read-only; nothing installed, built, or executed).

---

## 1. What exactly fails, and why

**Failing package / step.** fs-ext@2.1.1, at its **install (lifecycle) step**:

> fs-ext@2.1.1 install: node-gyp configure build
> fs-ext@2.1.1 install: gyp ERR! find VS … msvs_version not set from command line or npm config
> fs-ext@2.1.1 install: gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt
> fs-ext@2.1.1 install: gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
> fs-ext@2.1.1 install: gyp ERR! find VS You need to install the latest version of Visual Studio
>   including the "Desktop development with C++" workload.
> fs-ext@2.1.1 install: gyp ERR! stack Error: Could not find any Visual Studio installation to use
> fs-ext@2.1.1 install: Failed
> pnpm: Command failed with exit code 1: … pnpm install   →   dsh 退出码: 1

— fixture/install-error.log

**Why.** fs-ext is a **compiled C++/NAN addon**: its only shippable artifact is a
build/Release/*.node binary produced by node-gyp, and node-gyp on Windows needs an MSVC toolset
plus the Windows SDK. This machine has **no Visual Studio / Build Tools** (no vswhere.exe, no VS
directory) and the owner **refuses to install them** — fixture/README.md. The failure is therefore
purely a **host toolchain gap**, not a code, Node, pnpm, registry, or network fault: previous
upgrades on the same machine "installed fine" because they pulled no package with a gyp build step
(fixture/README.md).

**Who pulls it.** fs-ext is a **pinned production dependency** of the session-persistence plugin:

    "name": "@deepseek-ai/dsh-session-persistence-jsonl", "version": "0.1.3-alpha.1",
    "dependencies": { "fs-ext": "2.1.1" },
    "devDependencies": { "@types/fs-ext": "2.0.3" }

— fixture/manifest-excerpt.json. An exact pin, not a range: no resolver trick swaps it out without
editing the declaration, and it is a runtime (not dev/optional) dependency, so it is installed on
every target platform — including Windows, where the resulting binary is never used (§3).

**Blast radius.** The gyp step aborts the whole profile install, so the service never reaches boot
and dsh reports exit 1. One addon takes down the entire upgrade, not just the session-persistence
plugin.

## 2. Why pnpm install --ignore-scripts cannot fix this

Four independent reasons, all evidenced:

1. **The binary is only ever produced by the skipped script.** fs-ext ships no prebuilt .node for
   this ABI; its "install" script (node-gyp configure build) is the sole producer of
   build/Release/fs_ext.node (fixture/install-error.log). Skipping it leaves a package directory
   with **no loadable artifact**.
2. **The import is static and unconditional, on every platform.** lease.ts does
   "import { flock } from 'fs-ext'" at module top (fixture/lease-excerpt.md, line 11). ESM
   resolution and module evaluation therefore run **on Windows too**, before any process.platform
   branch is reachable — the excerpt says it outright: "flock is imported statically at module top
   — the package loader must resolve and load fs-ext even on Windows, where the flock branch is
   never taken." Loading the entry then loads the native binding, which is missing →
   MODULE_NOT_FOUND / "Could not locate the bindings file" at **boot**.
3. **It converts an install failure into a boot failure, silently.** --ignore-scripts turns a loud
   "pnpm install exits 1" into a green-looking install followed by a service that dies while
   loading the session-persistence plugin. That is strictly worse for the operator and hides the
   real cause.
4. **It is not something the repository can keep.** It must be appended to *every* install,
   including the plugin installs / profile bootstraps dsh runs itself; it disables the build
   scripts of *all* other dependencies as collateral (terminal, sqlite, ssh, agent tooling); and it
   leaves a dependency tree no verification can certify.

--ignore-scripts is therefore at best a **diagnosis probe**: it proves the failure is the gyp step
and nothing else.

## 3. Which lock path Windows actually takes — and what that implies

**Windows = a named kernel semaphore, not a file lock.** lease.ts documents the arbiter and the
split (fixture/lease-excerpt.md):

- POSIX: non-blocking flock(2) through fs-ext on session.lock beside the log;
- **Windows: acquireLockHandleWin32 / releaseLockHandleWin32 — a named kernel semaphore derived
  from that path, "never a file lock or handle"**, so readers, searches and directory removal
  proceed freely while the lock is held; "Windows has no lock file at all", "readers never touch
  the lock".

win32.ts confirms the primitives (fixture/win32-excerpt.ts): CreateSemaphoreW,
WaitForSingleObject, ReleaseSemaphore, CloseHandle — plus MoveFileExW for the durable namespace
publish that replaces the POSIX parent-directory fsync contract Node does not expose on Windows.
The comment is explicit: "no flock(2) is involved on Windows".

**Implication for the native module.** On Windows, fs-ext is **dead code**:

- no flock call is ever made, so the native binding is never entered;
- what Windows needs from the package is **only a resolvable, loadable module** (because of the
  static import) — not a working flock;
- consequently a **pure-JS stub on win32 is semantically equivalent** to the compiled binary there:
  both are never executed, both merely satisfy module loading. The real mutual-exclusion guarantee
  is carried by the kernel semaphore, which the patch does not touch;
- POSIX must keep the **real native build** — there flock is the actual arbiter — so the patch has
  to be platform-scoped, never a blanket replacement.

This is exactly why the fix can be a packaging patch instead of a toolchain install: the missing
capability is *not used* by the Windows runtime.

## 4. Least-invasive fix plan (no Visual Studio, no upstream change)

Follow the repository's **existing native-dependency patch mechanism**: pnpm patchedDependencies,
the same shape as the patches/node-pty@*.patch precedent registered in pnpm-workspace.yaml
(fixture/README.md). A patch may rewrite a package's **install script and entry file** — precisely
the two things that block us.

### 4.1 Target state

- package.json of @deepseek-ai/dsh-session-persistence-jsonl **unchanged** ("fs-ext": "2.1.1"
  stays; upstream is not forked, republished, or overridden to another version).
- One new file patches/fs-ext@2.1.1.patch, plus registration rows in pnpm-workspace.yaml.
- Windows: no gyp run, module loads, flock warns once and no-ops.
  Linux/macOS: native build byte-for-byte unchanged.
- Reversible: delete the patch and its registration rows, re-run pnpm install.

### 4.2 Steps

1. **Confirm the platform path before changing anything** (already established, §3): on Windows the
   lock is the named semaphore; flock is POSIX-only. Record this in the change note — it is the
   justification for a JS fallback.
2. **Author the patch** (never hand-edit node_modules):

       pnpm patch fs-ext@2.1.1          # opens a scratch copy of the package
       # edit as below, then
       pnpm patch-commit <scratch-dir>  # writes patches/fs-ext@2.1.1.patch

   Edit two things inside the patched package:
   - **package.json → scripts.install**: guard the native build, e.g.
     "install": "node ./scripts/install-guard.js", where install-guard.js exits 0 with a one-line
     note when process.platform === 'win32' (no native build: unused there) and otherwise spawns
     the original "node-gyp configure build" unchanged. Leave "gypfile": true untouched so
     Linux/macOS keep building exactly as before.
   - **entry (index.js / fs-ext.js)**: wrap acquisition of the native binding in
     try { … require('./build/Release/fs_ext.node') … } catch (err) { if (process.platform !==
     'win32') throw err; … } and, on win32, export **shape-compatible stubs** for flock, flockSync,
     fcntl, fcntlSync that (a) console.warn **once** ("fs-ext native binding unavailable on win32;
     Windows locking uses the named kernel semaphore, flock is a no-op"), and (b) callback with
     **no error** (or return 0 synchronously), so an unexpected caller degrades to a no-op instead
     of a crash. Never throw on win32.
3. **Register the patch** in pnpm-workspace.yaml — both keys are needed:

       patchedDependencies:
         fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
       allowBuilds:            # keep the (now guarded) install script permitted where it builds
         - fs-ext

   (allowBuilds is the field the corridor card names for this repository; if the local pnpm still
   uses the older onlyBuiltDependencies name, add fs-ext there — same intent: the build script
   stays approved, its Windows body is a no-op.)
4. **Re-run the install** and let the lockfile record the patch hash: pnpm install, then once
   pnpm install --frozen-lockfile to prove the committed pnpm-lock.yaml is coherent on the
   teammate's machine and in CI.
5. **Verify at the three layers that matter** (dsh web --no-open on the Windows host):
   - *dependency resolution*: install exits 0; require.resolve('fs-ext') resolves; the lockfile
     records fs-ext@2.1.1(patch_hash=…); no other package's build script was skipped or newly
     allowed.
   - *module load*: require fs-ext from the plugin context → no MODULE_NOT_FOUND; call
     flock(fd, 'exnb', cb) → one warning, cb invoked without error (no-op), process healthy.
   - *behavior*: boot the profile, open a session, take and release the write lock — two
     concurrent writers on the same session must still serialize through the named semaphore (the
     real Windows arbiter, untouched by the patch) — and one message → tool → response flow
     completes.
6. **Record the rollback**: patches/fs-ext@2.1.1.patch, the registration rows, and the regenerated
   pnpm-lock.yaml are the only owned paths; removing the rows and re-running pnpm install restores
   the previous (failing) install state. Nothing else is touched.

### 4.3 Explicitly rejected alternatives

| Option | Why rejected |
|---|---|
| Install VS Build Tools / "Desktop development with C++" | Owner refuses; a multi-GB machine-wide change to fix one addon that is dead on Windows |
| pnpm install --ignore-scripts | §2: no bindings, boot-time crash, collateral damage to every other build script, unverifiable tree |
| pnpm.overrides to another fs-ext / a fork / a file: replacement | Rewrites an **upstream** pin (forbidden) or still ships a gyp build |
| Vendoring a hand-built .node into node_modules | Not reproducible, breaks --frozen-lockfile, lost on every install |
| Patching session-persistence-jsonl to lazy-load flock | Touches a dependency's own source instead of the leaf package, and leaves the unbuilt addon in the tree |
| Fake msvs_version / VCINSTALLDIR | No MSVC exists to point at; gyp simply fails later at compile/link |

### 4.4 Structural follow-up (not required for this install)

The 0.1.5 corridor removes the problem at the source: @deepseek-ai/dsh-session-persistence-jsonl
drops fs-ext and @types/fs-ext and calls tryLockExclusive(handle.fd) from
@deepseek-ai/node-addon-system/flock (**DSH-0.1.5-A1-13**), so a later upgrade to >= 0.1.5-alpha.1
retires this patch entirely. The alpha.2 note (**DSH-0.1.5-A2-10**) adds the acceptance check: a
fresh install tree must contain no fs-ext at all (npm ls fs-ext empty). Until then the patch above
is the least-invasive path; do not jump a whole corridor merely to dodge one build script.

## 5. Corridor card

**DSH-0.1.3-A1-03** — "Windows install fails on the fs-ext native build; the runtime never calls
flock on Windows" (breaking; profile wrappers / packaging; any Windows host without Visual Studio
Build Tools on the 0.1.2-rc.1 → 0.1.3-alpha.1 edge). It names the same symptoms, the same
static-import reason --ignore-scripts fails, the same Windows named-semaphore path, and the same
pnpm-patch recipe with patchedDependencies + allowBuilds registration — a direct match for this
fixture, whose manifest is versioned 0.1.3-alpha.1.

Supporting cross-references: DSH-0.1.5-A1-13 (structural replacement of fs-ext),
DSH-0.1.5-A2-10 ("no fs-ext in the tree" acceptance note).

## Evidence map

| Claim | Evidence |
|---|---|
| fs-ext@2.1.1 gyp/VS failure, exit 1, dsh 退出码 1 | fixture/install-error.log |
| No VS/Build Tools, owner refuses; pnpm-patch precedent (patches/node-pty@*.patch, pnpm-workspace.yaml) | fixture/README.md |
| Pinned runtime dep of dsh-session-persistence-jsonl@0.1.3-alpha.1 | fixture/manifest-excerpt.json |
| Static top-level import of flock; Windows = named semaphore, no lock file | fixture/lease-excerpt.md (lines 6–19) |
| CreateSemaphoreW / WaitForSingleObject / ReleaseSemaphore / CloseHandle, MoveFileExW; no flock on Windows | fixture/win32-excerpt.ts (lines 8–24) |
| Card, recipe, verification | DSH-0.1.3-A1-03 |

**Caveats.** Static diagnosis: nothing was installed, built, or executed, and fixture/ was left
byte-identical (task constraint). The patch text is a recipe, not a validated diff — the Windows
no-op must be confirmed against the real fs-ext entry shape at 2.1.1, and the Linux/macOS path
(native build still runs) must be re-verified before committing.
