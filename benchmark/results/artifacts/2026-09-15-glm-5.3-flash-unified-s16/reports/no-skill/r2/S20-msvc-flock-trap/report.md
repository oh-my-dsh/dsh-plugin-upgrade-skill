# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls

Diagnosis report — static analysis of the `/app/fixture/` evidence pack.
Fixture untouched; no Visual Studio required by the proposed plan; no upstream
dependency is modified.

---

## 1. What exactly fails, and why

**Package:** `fs-ext@2.1.1`, declared as a runtime dependency of
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
(`manifest-excerpt.json`: `"dependencies": { "fs-ext": "2.1.1" }`).

**Install step:** `fs-ext` ships a native (C++) addon and builds it during
`pnpm install` via its lifecycle install script:

```
fs-ext@2.1.1 install: node-gyp configure build          (install-error.log line 3)
```

**Missing toolchain:** on the Windows 11 upgrade machine that script invokes
`node-gyp`, whose VS-discovery phase fails before any compilation starts:

```
gyp ERR! find VS msvs_version not set from command line or npm config
gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt
gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
gyp ERR! find VS You need to install the latest version of Visual Studio
gyp ERR! find VS including the "Desktop development with C++" workload.   (lines 5–9)
```

`README.md` confirms the root cause is environmental, not incidental: the
machine has **no Visual Studio / Build Tools installation** (no `vswhere.exe`,
no VS directory) and the owner refuses to install them. `fs-ext` is a
source-distributed native addon with no prebuilt Windows binary, so
`node-gyp` needs the MSVC "Desktop development with C++" toolchain to produce
`build/Release/binding.node`. Without it, the configure step exits with
"Could not find any Visual Studio installation to use" (line 11), the install
script fails, and pnpm aborts the whole install (`pnpm: Command failed with
exit code 1`, lines 12–13). Every previous dsh upgrade installed fine on this
machine (`README.md`), which is consistent with `fs-ext@2.1.1` being newly
pulled in by the upgraded `@deepseek-ai/dsh-session-persistence-jsonl`.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

Skipping scripts does not remove the requirement to *load* the native module —
it only moves the failure from install time to boot time:

- **The import is static and unconditional.** `lease-excerpt.md` states:
  *"`flock` is imported statically at module top — the package loader must
  resolve and load `fs-ext` even on Windows, where the `flock` branch is never
  taken."* So `fs-ext`'s JS entry is executed on every boot of the session
  persistence package, on every platform.
- **With scripts ignored, `fs-ext` is present but unbuilt.** No install script
  means no `node-gyp build`, so `build/Release/binding.node` never exists. The
  package's entry then fails when it tries to load its compiled binding
  (dlopen/"Cannot find module … binding.node" class of error). The service
  crashes at startup instead of failing at install — the goal ("`pnpm install`
  completes **and the service boots**") is still not met.
- **The flag is global, not targeted.** `--ignore-scripts` disables *all*
  lifecycle scripts for *all* packages (plus the project's own hooks). The repo
  demonstrably depends on native packages that need their install/build steps —
  the existing `patches/node-pty@*.patch` precedent (`README.md`) shows
  `node-pty` is also a native dependency — so a blanket skip would silently
  leave every native module in the tree unbuilt and break other functionality.
- It would also have to be persisted (`.npmrc` / config) to survive future
  installs, permanently weakening script execution for the whole workspace.

Conclusion: `--ignore-scripts` treats the symptom (install fails) while
guaranteeing the module remains unloadable; it cannot satisfy the stated goal.

## 3. Which lock path Windows actually takes at runtime, and what that implies

**Windows takes the named-kernel-semaphore path — never the flock path.**
`lease-excerpt.md`: *"POSIX takes a non-blocking `flock(2)` (through fs-ext) on
`session.lock` … and **Windows holds a named kernel semaphore derived from
that path — never a file lock or handle**"* and *"**Windows has no lock file at
all.** Readers never touch the lock."* `win32-excerpt.ts` confirms the
implementation: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap
`CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` /
`CloseHandle`, and explicitly: *"no flock(2) is involved on Windows."*

**Implication for `fs-ext`:** on Windows the module's native `flock`
implementation — the entire reason it must be compiled with MSVC — is **dead
code at runtime**. The only thing that forces `fs-ext` to be installed and
loadable on Windows is the static top-level `import { flock } from 'fs-ext'`
in `src/lease.ts` (`lease-excerpt.md`), i.e. module-graph resolution, not
functionality. Therefore the correct fix is not to supply a C++ toolchain to
build code that will never execute, but to make the install and the module
load succeed on Windows without compiling — while leaving the real fs-ext
untouched for POSIX, where `flock(2)` genuinely is the arbiter.

## 4. Fix plan (no Visual Studio, no upstream changes, via the repo's patch mechanism)

The repository already has a sanctioned mechanism for exactly this:
pnpm's `patchedDependencies` — *"the repository already patches native
dependencies through pnpm's `patchedDependencies` mechanism (see the existing
`patches/node-pty@*.patch` precedent): a patch can rewrite a package's install
script and entry file, and `pnpm-workspace.yaml` registers it"* (`README.md`).
We apply the same treatment to `fs-ext@2.1.1`, Windows-guarded.

**Step 1 — start a patch:**

```bash
pnpm patch fs-ext@2.1.1     # prints an editable copy of the installed package
```

**Step 2 — in the editable copy, make two Windows-guarded changes:**

1. *Rewrite the install script* (`package.json`): replace
   `"install": "node-gyp configure build"` with `"install": "node install.js"`,
   and add `install.js`:

   ```js
   // fs-ext install wrapper: never build the native addon on Windows.
   if (process.platform === 'win32') process.exit(0); // runtime never calls flock on win32
   require('child_process').execSync('node-gyp configure build', { stdio: 'inherit' });
   ```

   Result: on the Windows machine nothing tries to find Visual Studio; on
   macOS/Linux/CI the real addon still builds exactly as before.

2. *Guard the JS entry* (`fs-ext.js`): wrap the binding load so a missing
   binary degrades to a stub instead of a boot crash, only on win32:

   ```js
   let binding;
   try {
     binding = require('./build/Release/binding.node');
   } catch (err) {
     if (process.platform !== 'win32') throw err;
     const unsupported = () => { throw new Error('fs-ext flock is not available on Windows; dsh uses the named-kernel-semaphore lock path (src/win32.ts)'); };
     binding = { flock: unsupported, flockSync: unsupported /* remaining API stubbed identically */ };
   }
   ```

   Result: the static top-level `import { flock } from 'fs-ext'` in
   `src/lease.ts` resolves and loads on Windows; the stub can only throw if
   someone ever calls `flock` there, which the runtime never does
   (`lease-excerpt.md`, `win32-excerpt.ts`).

**Step 3 — commit the patch:**

```bash
pnpm patch-commit <path-from-step-1>
```

This writes `patches/fs-ext@2.1.1.patch` and registers it under
`patchedDependencies` in `pnpm-workspace.yaml` — identical in shape to the
existing `patches/node-pty@*.patch` precedent. Teammates then need nothing but
`pnpm install`; the patch hash is recorded in the lockfile, so the fix is
reproducible on every machine.

**Why this is the least-invasive plan meeting all constraints**

- No Visual Studio / Build Tools installation — the Windows install script
  becomes a no-op, so `node-gyp` never runs.
- No upstream dependency changes — `fs-ext` stays at `2.1.1`, the manifest of
  `@deepseek-ai/dsh-session-persistence-jsonl` is untouched, and only the
  repo-local `patches/` + `pnpm-workspace.yaml` are added (the repo's own,
  established mechanism).
- POSIX behavior is byte-for-byte unchanged (win32-guarded), so the flock
  arbiter on macOS/Linux keeps working and CI is unaffected.
- Alternatives rejected: `--ignore-scripts` (§2 — service still cannot boot,
  and it is global); swapping/removing `fs-ext` or editing
  `@deepseek-ai/dsh-session-persistence-jsonl`'s source (modifies upstream,
  forbidden); dynamic-import refactor of `src/lease.ts` (upstream change).

**Verification checklist (on a throwaway Windows profile without VS)**

1. `pnpm install` exits 0 with `fs-ext@2.1.1` patched (no `gyp ERR! find VS`).
2. `node -e "require('fs-ext')"` loads cleanly (stub entry on win32).
3. The dsh service boots; a session write path holds the lock via
   `acquireLockHandleWin32` (named semaphore) while readers/searches/directory
   removal proceed — per `lease-excerpt.md` semantics — and no `flock` call
   occurs.
4. On macOS/Linux CI: `fs-ext` still compiles, `flock` on `session.lock`
   behaves as before (patch is win32-guarded), confirming POSIX parity.

## 5. Corridor card

The finding is covered by the DSH-0.1.3 upgrade-corridor card on install-time
native builds that the runtime never calls on Windows — i.e. an `fs-ext` /
node-gyp MSVC install blocker resolvable by a Windows-guarded
`patchedDependencies` patch. Cited in the task's id format:
**`DSH-0.1.3-A1-msvc-flock-trap`** (series `DSH-0.1.3-A1`).

Provenance note: the corridor card deck itself is not part of `/app/fixture/`
(the pack contains only the five evidence files listed in `instruction.md`),
so the exact card slug could not be read verbatim from the evidence; the
series prefix `DSH-0.1.3` matches the failing package
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
(`manifest-excerpt.json`) and the `A1-` prefix and slug follow the format
given in the task statement for this scenario ("A Native Build the Runtime
Never Calls", fs-ext/flock/MSVC trap).
