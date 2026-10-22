# JUDGE BRIEF · skill.S20-msvc-flock-trap

## Criteria (sealed rubric)
- [native-install-failure] (20pt) Use install-error.log and manifest-excerpt.json: fs-ext@2.1.1 is pulled by dsh-session-persistence-jsonl, its install script runs node-gyp configure build, and missing Windows Visual Studio/MSVC causes the failure. Attribute the failing dependency/build phase, not general pnpm or network unreliability.
- [static-import-trap] (20pt) Use lease-excerpt.md’s top-level flock import: skipping install scripts leaves fs-ext’s native entry unloadable; module loading still happens on Windows before runtime branch selection. Thus --ignore-scripts alone may avoid a build step but cannot achieve the required working service boot.
- [platform-lock-contract] (20pt) Use lease-excerpt.md and win32-excerpt.ts to distinguish Windows acquireLockHandleWin32/named kernel semaphore from POSIX flock. The unused Windows fs-ext call path permits an import-safe Windows stub, but Windows locking must still use the semaphore; Linux/macOS must keep real flock. Mere mentions of semaphore and flock without branch meaning are partial at best.
- [reproducible-local-patch] (25pt) Follow README.md’s pnpm patchedDependencies/node-pty precedent: patch fs-ext locally so win32 skips node-gyp and its entry exports an import-safe pure-JS fallback with compatible callable/callback shape, while non-Windows keeps the native module. Register the patch in pnpm-workspace.yaml and account for build permissions where needed; propose reinstall, module-load and service-boot checks. A conditional loading sketch is sufficient, but skipping only the build is not a complete fix. Do not require the candidate to execute commands or produce a patch file.
- [machine-and-upstream-boundaries] (10pt) Explicitly respect the machine owner’s no-Visual-Studio constraint and use the repository-managed patch without changing the upstream repository/published dependency. A local pnpm patch necessarily transforms installed dependency files and is allowed by the requested plan; do not mistake that for forbidden upstream modification.
- [corridor-mapping] (5pt) Cite full DSH-0.1.3-A1-03 and connect it to this install-channel fs-ext failure and Windows patch plan. The card ID by itself earns no credit.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [requires-visual-studio] ceiling=50 The proposed plan depends on installing Visual Studio/MSVC on this machine, contrary to the owner’s constraint, even if it also mentions pnpm patch. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [ignore-scripts-only] ceiling=40 The plan relies on --ignore-scripts alone or skips the build without making the statically imported entry loadable. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [upstream-edit-required] ceiling=40 The plan requires editing/releasing an upstream repository instead of using the existing repository-managed patch mechanism. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [lock-bypass] ceiling=20 The proposed workaround removes the Windows semaphore or replaces POSIX flock with a universal no-op, weakening real write ownership. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S20-msvc-flock-trap/report.md

# S20 · Windows Install Blocker — fs-ext native build without MSVC (diagnosis & fix plan)

## 1. What exactly fails, and why

- **Failing package**: `fs-ext@2.1.1`, a pinned dependency of
  `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
  (`manifest-excerpt.json`: `"dependencies": { "fs-ext": "2.1.1" }`).
- **Failing step**: the package's lifecycle install script `node-gyp configure build`.
- **Root cause**: node-gyp must compile fs-ext's C++ addon and needs a Visual Studio
  installation with the "Desktop development with C++" workload. Per `README.md`,
  this Windows 11 machine has **no Visual Studio / Build Tools** (no `vswhere.exe`,
  no VS directory) and the owner refuses to install them. The install log shows the
  exact toolchain probe failure:

  ```
  fs-ext@2.1.1 install: gyp ERR! find VS msvs_version not set from command line or npm config
  fs-ext@2.1.1 install: gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt
  fs-ext@2.1.1 install: gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
  fs-ext@2.1.1 install: Failed
  pnpm: Command failed with exit code 1
  ```

  All previous dsh upgrades worked because fs-ext (pinned at 2.1.1) is new in the
  0.1.3-alpha.1 cohort; no earlier dependency needed an MSVC compile on this machine.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` would skip the `node-gyp configure build` script, but it would
**leave the package without its compiled native addon** — `fs-ext` would exist on disk
yet fail to load at runtime. It must actually load on Windows, because
`src/lease.ts` statically imports `flock` at module top (`lease-excerpt.md`):

```ts
import { flock } from 'fs-ext'
import { acquireLockHandleWin32, releaseLockHandleWin32 } from './win32.ts'
```

As the excerpt notes: "the package loader must resolve and load `fs-ext` even on
Windows, where the `flock` branch is never taken." So skipping the build merely
defers the failure from `pnpm install` to the first require of the session-persistence
package at service boot. The install blocker must be removed, not bypassed.

## 3. Which lock path Windows actually takes at runtime

Per `lease-excerpt.md`, the cross-process write-ownership lock is platform-split:

- **POSIX**: non-blocking `flock(2)` (through fs-ext) on `session.lock` beside the log.
- **Windows**: a **named kernel semaphore** derived from the artifact-directory path —
  "never a file lock or handle" — acquired via `acquireLockHandleWin32` /
  `releaseLockHandleWin32`. `win32-excerpt.ts` shows the bindings: `CreateSemaphoreW`,
  `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle` (plus `MoveFileExW` for
  the durable-namespace publish). "Windows has no lock file at all."

**Implication**: the fs-ext native module is **dead code on Windows** — `flock` is only
the POSIX branch and is never invoked. The module merely has to *resolve and load*
because of the static import; none of its native functionality is exercised. A pure-JS
stub that exports a warn-once no-op `flock` is therefore functionally complete on this
platform.

## 4. Least-invasive fix plan (no Visual Studio, no upstream modifications)

Follow the repository's existing patch precedent (`README.md`: `patches/node-pty@*.patch`
via pnpm `patchedDependencies`, registered in `pnpm-workspace.yaml`):

1. **Confirm the platform path** (done above): Windows takes the named-semaphore branch;
   `flock` is dead code on Windows.
2. **Add a pnpm patch** for `fs-ext@2.1.1` (e.g. `patches/fs-ext@2.1.1.patch`), keeping
   it platform-gated so Linux/macOS are untouched:
   - Rewrite the `package.json` install script so `node-gyp configure build` runs only
     on non-Windows platforms (on Windows, the install script exits 0 with no build).
   - Make the package entry load a **pure-JS fallback** when the native addon is absent
     on Windows: export a `flock` that warns once and no-ops (invoking its callback with
     no error), rather than throwing on require.
3. **Register the patch** in `pnpm-workspace.yaml` under `patchedDependencies` (mirroring
   the node-pty registration) and re-run `pnpm install`.
4. **Verification**:
   - `pnpm install` completes with exit code 0 on the no-MSVC machine.
   - `node -e "const {flock}=require('fs-ext'); flock(process.stdout.fd?0:0, 'ex', cb)"`
     (or a simple require) loads fs-ext and the flock path warns once instead of throwing.
   - Cold-start the service (`dsh web --no-open`), confirm boot and HTTP 200; confirm the
     session-persistence lease on a real session works via `acquireLockHandleWin32`.

Explicitly **not** done: installing Visual Studio Build Tools, patching upstream
`dsh-session-persistence-jsonl` sources, or relying on `--ignore-scripts`.

## 5. Covering corridor card

**DSH-0.1.3-A1-03** — "Windows install fails on the `fs-ext` native build; the runtime
never calls `flock` on Windows" (breaking; required-if-hit; packaging/install surface;
corridor edge 0.1.2-rc.1 → 0.1.3-alpha.1, skill reference `references/v0.1.3-alpha.1.md`).
The card prescribes exactly the pnpm-patch recipe in §4 and records the matching
symptoms (`gyp ERR! find VS`), the static-import reason `--ignore-scripts` fails, and
the named-semaphore Windows path.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.