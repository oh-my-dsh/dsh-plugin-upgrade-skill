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

# S20 · Windows Install Blocker — Fix Plan

**Corridor card:** `DSH-0.1.3-A1-03` (Windows install fails on the `fs-ext` native build; the runtime never calls `flock` on Windows).

**Scope:** static diagnosis. The fixture is read-only; nothing upstream or in the repository is modified. This plan fixes the install on the target Windows 11 machine (no Visual Studio / Build Tools) so `pnpm install` completes and the service boots.

---

## 1. What exactly fails, and why

- **Package:** `fs-ext@2.1.1`.
- **Install step:** `fs-ext` runs its `install` lifecycle script — `node-gyp configure build` — during `pnpm install` (`install-error.log:3`).
- **Missing toolchain:** that build needs a C++ compiler/toolchain. The machine has **no Visual Studio / Build Tools** (no `vswhere.exe`, no VS directory — `README.md:3-4`), so `node-gyp` cannot locate a toolset and fails (`install-error.log:4-11` → `gyp ERR! find VS … Could not find any Visual Studio installation to use` / `You need to install the latest version of Visual Studio including the "Desktop development with C++" workload`). The owner refuses to install them (`README.md:3`).
- **How it reaches the tree:** `fs-ext@2.1.1` is a pinned `dependency` of `@deepseek-ai/dsh-session-persistence-jsonl` (`manifest-excerpt.json:5`), which the DSH session-persistence plane pulls in. The failed install script makes the whole `pnpm install` exit with code 1 (`install-error.log:12-14`).

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` would skip the `node-gyp` build — but it also skips *creating* the native `.node` addon, so `fs-ext` never becomes loadable. That is fatal here because `fs-ext` is not optional:

- `lease-excerpt.md:11` shows a **static top-level import** `import { flock } from 'fs-ext'`, and `lease-excerpt.md:17-19` states it explicitly: the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken.

So `--ignore-scripts` trades a build failure for a module-load failure at boot: `pnpm install` may "complete" but the service cannot start because the static import cannot resolve. Card `DSH-0.1.3-A1-03` records the same conclusion: the module must exist and load.

## 3. Which lock path Windows takes at runtime — and the implication

Windows does **not** use `flock(2)` at runtime:

- `lease-excerpt.md:5-8`: "Windows holds a named kernel semaphore derived from that path — **never a file lock or handle**"; `lease-excerpt.md:15`: "Windows has no lock file at all."
- `win32-excerpt.ts`: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle` (`win32-excerpt.ts:8-24`); the comment at `win32-excerpt.ts:24` states "no `flock(2)` is involved on Windows."

**Implication:** on Windows the compiled `fs-ext` native addon is dead code — the `flock` branch is POSIX-only and never executes. The very artifact whose build fails is never actually used on this platform. That is what makes a platform-gated patch safe: removing the Windows native build and substituting a pure-JS no-op fallback does not change Windows runtime behavior (the real lock is the named kernel semaphore).

## 4. Least-invasive fix plan (no Visual Studio, no upstream edits)

Follow the repository's existing native-dependency patch mechanism (`patchedDependencies`, precedent `patches/node-pty@*.patch` registered in `pnpm-workspace.yaml` — `README.md:7-9`). This is the card `DSH-0.1.3-A1-03` recipe.

1. **Create a pnpm patch for `fs-ext@2.1.1`** (via `pnpm patch fs-ext@2.1.1`), containing two edits:
   - **Install script → platform-gated:** rewrite the package's `install` script so `node-gyp configure build` runs only on **non-Windows** platforms; on Windows it becomes a no-op (no compile, no toolchain lookup).
   - **Entry → pure-JS `flock` fallback:** give the package entry a pure-JS `flock` shim used only on Windows (log a one-time warning, no-op the callback) so the static `import { flock } from 'fs-ext'` still resolves and the module loads. POSIX keeps the real native addon and the real `flock`.
   - Linux/macOS behavior is untouched (native build preserved).
2. **Register the patch** in `pnpm-workspace.yaml` under `patchedDependencies` (add `fs-ext@2.1.1: patches/fs-ext@2.1.1.patch`) and, where the repo uses pnpm 11 supply-chain allowlists, under `allowBuilds` so the remaining (non-Windows) build script stays permitted.
3. **Re-run `pnpm install`** on the Windows 11 machine. The Windows path skips the native build; the fallback entry loads.
4. **Verify:** `pnpm install` completes; `require('fs-ext')` loads and the `flock` path warns once instead of throwing; boot `dsh web` and confirm it answers HTTP 200 (Windows session lock still comes from `acquireLockHandleWin32`).

This does **not** install Visual Studio, does **not** modify any upstream dependency, and does **not** rely on `--ignore-scripts` alone.

## 5. Corridor card

`DSH-0.1.3-A1-03` — `breaking`, applies to packaging/install surface, `required-if-hit`; single-host Windows field report (Windows 11 without MSVC), recipe = pnpm patch + platform-gated `node-gyp` + pure-JS `flock` fallback.

---

### Evidence map

| Finding | Fixture evidence |
|---|---|
| Build step + missing toolchain | `install-error.log:3-14`, `README.md:3-4` |
| `fs-ext` is a pinned dep of session-persistence | `manifest-excerpt.json:4-6` |
| Static import ⇒ module must load on Windows | `lease-excerpt.md:11,17-19` |
| Windows uses named semaphore, not flock | `lease-excerpt.md:5-8,15`, `win32-excerpt.ts:8-24` |
| Existing patch precedent | `README.md:7-9` |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.