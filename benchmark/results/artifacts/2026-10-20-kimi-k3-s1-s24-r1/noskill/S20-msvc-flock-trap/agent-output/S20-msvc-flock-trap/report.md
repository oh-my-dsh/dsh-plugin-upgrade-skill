# S20 · Windows Install Blocker — Diagnosis & Fix Plan

## 1. What exactly fails, and why

**Package:** `fs-ext@2.1.1`, a **direct runtime dependency** of
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
(`fixture/manifest-excerpt.json` lines 4–6: `"dependencies": { "fs-ext": "2.1.1" }`).

**Install step:** `fs-ext` is a native module. Its lifecycle `install` script runs
`node-gyp configure build` (`fixture/install-error.log` line 3). node-gyp tries to
locate a Visual Studio C++ toolchain and fails:

- `gyp ERR! find VS msvs_version not set …` (line 5)
- `gyp ERR! find VS VCINSTALLDIR not set …` (line 6)
- `gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer` (line 7)
- `gyp ERR! stack Error: Could not find any Visual Studio installation to use` (line 11)

**Missing toolchain:** the machine has **no Visual Studio / Build Tools** at all
(no `vswhere.exe`, no VS directory) and the owner refuses to install them
(`fixture/README.md` lines 3–4). node-gyp therefore has no compiler, the
`fs-ext` install script exits non-zero, and `pnpm install` aborts with exit code 1
(`install-error.log` lines 12–14).

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` would skip the `node-gyp` build, so install would *appear* to
succeed — but it only defers the failure to service boot:

- `fs-ext` ships no prebuilt binary here; skipping the script leaves the package
  **without its compiled `.node` addon**.
- `src/lease.ts` does a **static top-level import**: `import { flock } from 'fs-ext'`
  (`fixture/lease-excerpt.md` lines 11 and 17–18: "the package loader must resolve
  and load `fs-ext` even on Windows"). As soon as the service imports
  `@deepseek-ai/dsh-session-persistence-jsonl`, Node loads `fs-ext`, fails to find
  the native binding, and the process crashes at startup.
- So the goal "install completes **and the service boots**" is still unmet. The blocker
  is the *static import of an absent native binding*, not the build step alone.

## 3. Which lock path Windows actually takes at runtime

Per `fixture/lease-excerpt.md` (lines 5–8, 15) and `fixture/win32-excerpt.ts`
(lines 23–24):

- **POSIX** takes a non-blocking `flock(2)` through `fs-ext` on `session.lock`.
- **Windows holds a named kernel semaphore** derived from the artifact path —
  `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` /
  `CloseHandle` via `acquireLockHandleWin32` / `releaseLockHandleWin32`.
  "**Never a file lock or handle**"; "**Windows has no lock file at all**"; "no
  `flock(2)` is involved on Windows."

**Implication:** on this Windows 11 machine the `flock` branch is *dead code* — the
`fs-ext` native module is **never called at runtime**. It is required only because of
the unconditional static `import { flock } from 'fs-ext'` at module top. The failing
native build is therefore pure install-time/boot-time ballast on Windows: its compiled
output is never exercised.

## 4. Concrete, least-invasive fix plan (no Visual Studio, no upstream changes)

Use the repository's **existing pnpm `patchedDependencies` mechanism** — the same
precedent as `patches/node-pty@*.patch` (`fixture/README.md` lines 7–10) — to patch
the *dependency package* `fs-ext@2.1.1` itself, so upstream sources and our own
`lease.ts` stay untouched:

1. **Create `patches/fs-ext@2.1.1.patch`** against the published `fs-ext@2.1.1`
   tarball, changing two things:
   - **Neutralize the install script:** replace `"install": "node-gyp configure build"`
     in the package's `package.json` with a no-op (or remove it), so `pnpm install`
     never invokes node-gyp and never needs MSVC.
   - **Stub the native binding loader:** rewrite the package's entry file
     (`index.js` / `fs-ext.js`) so that loading it does not `require()` the missing
     `build/Release/fs-ext.node`. Export JavaScript stubs for the API surface our code
     imports (`flock`, plus `seek`/`fcntl` etc. if statically referenced) that throw
     a clear `Error('fs-ext native binding unavailable: patched out on this platform')`
     **only when actually called**. On Windows they are never called (Section 3), so the
     stub is inert; on POSIX machines the patch is simply not applied (step 3).
2. **Register the patch** in `pnpm-workspace.yaml` under `patchedDependencies`,
   exactly as the `node-pty` precedent does:
   ```yaml
   patchedDependencies:
     fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
   ```
3. **Scope it to the Windows machine** (least invasive): apply this patch only in the
   environment/branch used for the no-MSVC Windows host (or gate registration so POSIX
   machines keep the unpatched, genuinely compiled `fs-ext`). POSIX behavior — real
   `flock(2)` — is unchanged there.
4. **Verify on the target machine:** `pnpm install` completes with no `gyp` output;
   `node -e "require('@deepseek-ai/dsh-session-persistence-jsonl')"` resolves (the
   stubbed `fs-ext` loads); the dsh service boots and acquires its write lock via the
   named-semaphore path (`CreateSemaphoreW`), confirming `flock` is never invoked.

Why this is least-invasive: it touches nothing upstream, adds no toolchain, changes no
application code, and follows a mechanism the repo already trusts for exactly this class
of problem (native deps that can't build on a given host).

## 5. Corridor card

**Card id: `DSH-0.1.3-A1-fs-ext-static-import-win32-dead-flock`** — the card covering
"@deepseek-ai/dsh-session-persistence-jsonl 0.1.3-alpha.1 statically imports `fs-ext`'s
`flock` although the Windows lock path (named kernel semaphore) never calls it, forcing
a node-gyp/MSVC build on machines where the native module is dead code; fix via the
repo's `patchedDependencies` precedent."

> Note: this noskill arm is barred from reading the skills/reference tree, and the card
> registry is not present in the readable fixture or the local dsh checkout, so the exact
> registered card id could not be verified from readable sources; the id above is cited
> per the required `DSH-0.1.3-A1-…` format with the finding's slug. If the canonical
> registry is available to the orchestrator, substitute the registered suffix for the
> same finding.
