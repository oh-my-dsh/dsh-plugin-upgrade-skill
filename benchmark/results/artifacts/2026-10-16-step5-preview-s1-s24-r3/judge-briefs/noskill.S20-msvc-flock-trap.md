# JUDGE BRIEF · noskill.S20-msvc-flock-trap

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

# S20 — Windows Install Blocker: A Native Build the Runtime Never Calls

- **Component:** `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
- **Failing module:** `fs-ext@2.1.1` — a native (node-gyp) addon
- **Machine:** Windows 11, **no** Visual Studio / MSVC Build Tools (no `vswhere.exe`, no VS dir); owner refuses to install them (`README.md:3-4`)
- **Goal of the fix:** `pnpm install` completes **and** the service boots — with no Visual Studio and no change to any upstream package.

**One-line verdict.** `pnpm install` dies inside `fs-ext`'s `node-gyp configure build` because MSVC is absent. That native build is functionally dead on this machine: on Windows the write-lock never calls `flock` and holds a **named kernel semaphore** instead; `fs-ext` is pulled in only by a **static top-level import**. So the least-invasive fix is a local **pnpm patch** that (a) stops the Windows install from compiling and (b) makes `require('fs-ext')` load as a tiny pure-JS stub — exactly the repo's existing `patchedDependencies` mechanism used for `node-pty`.

---

## Evidence index (all from `fixture/`)

| file | what it establishes |
|---|---|
| `install-error.log` | The failing step: `fs-ext@2.1.1 install: node-gyp configure build` → `gyp ERR! find VS … Could not find any Visual Studio installation` → `pnpm` exit 1 → `dsh 退出码: 1` (`:3-14`) |
| `manifest-excerpt.json` | `fs-ext@2.1.1` is a **runtime** dependency of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`; `@types/fs-ext` is types-only (`:4-9`) |
| `lease-excerpt.md` | Cross-process write lock. POSIX uses non-blocking `flock(2)` via fs-ext; **Windows holds a named kernel semaphore, "never a file lock or handle."** `flock` is imported **statically at module top** — the loader must load `fs-ext` even on Windows (`:1-19`) |
| `win32-excerpt.ts` | Windows lock = `CreateSemaphoreW`/`WaitForSingleObject`/`ReleaseSemaphore` (+ `MoveFileExW` for the durable-namespace replace); "**no flock(2) is involved on Windows**" (`:8-24`) |
| `README.md` | No MSVC; prior upgrades installed fine; **repo already patches native deps via pnpm `patchedDependencies`** (precedent `patches/node-pty@*.patch`), registered in `pnpm-workspace.yaml`; "a patch can rewrite a package's install script and entry file" (`:1-11`) |

---

## 1. What exactly fails, and why

- **Package:** `fs-ext@2.1.1`. It is not a top-level dependency of dsh itself — it is pulled in transitively by `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`, whose `dependencies` declares `"fs-ext": "2.1.1"` (`manifest-excerpt.json:4-6`). (`@types/fs-ext@2.0.3` is a devDependency of types only and is not implicated — `manifest-excerpt.json:7-9`.)
- **Install step:** the package's `install` lifecycle script. The transcript shows it invoking **`node-gyp configure build`** (`install-error.log:3`).
- **Failure point:** node-gyp's **`find VS`** probe. It cannot locate any Visual Studio: `msvs_version not set`, `VCINSTALLDIR not set`, `could not use PowerShell to find Visual Studio 2017 or newer`, ending in `configure error … Could not find any Visual Studio installation to use` (`install-error.log:4-11`).
- **Missing toolchain:** the **MSVC C++ compiler / Visual Studio Build Tools with the "Desktop development with C++" workload** — precisely what node-gyp needs to compile the native addon, and precisely what this machine does not have (`install-error.log:8-9`, `README.md:3-4`).
- **Blast radius:** the addon's build failure makes pnpm abort with `Command failed with exit code 1` (`install-error.log:13`), and the dsh upgrade command surfaces it as `dsh 退出码: 1` (`install-error.log:14`). The whole `pnpm install` fails because of one transitive native dependency.

**Why it regressed now.** `fs-ext` is a *native* addon whose `install` step always compiles; on every machine that has MSVC (or on non-Windows, where node-gyp uses a system toolchain) that step succeeds, which is why "every previous dsh upgrade on this machine installed fine" is not contradictory — the difference is this box's toolchain, not a new script (`README.md:5-6`).

---

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` skips lifecycle scripts, so it would skip `node-gyp` and let `pnpm install` exit 0. It still fails to solve the problem, for two independent reasons:

1. **It relocates the failure instead of removing it.** Skipping the build leaves `fs-ext` **unbuilt** — its compiled `.node` binding is never produced. But `src/lease.ts` does `import { flock } from 'fs-ext'` **statically at the top of the module** (`lease-excerpt.md:11,17-19`). Node's loader must therefore *resolve and fully evaluate* `fs-ext` whenever the persistence module loads — on **every** platform, including Windows, "where the `flock` branch is never taken" (`lease-excerpt.md:17-19`). With no binding built, fs-ext's own entry `require`s a missing `build/Release/fs-ext.node` and **throws at boot**. The service cannot start. The failure simply moves from the *install* phase to the *boot* phase.

2. **It is not a real fix for the repo.** `--ignore-scripts` is a global, non-persisted flag: it also skips the scripts of *every other* dependency (e.g. `node-pty`'s build and any legitimate `postinstall`), it is not recorded anywhere, and every machine and CI run must remember to pass it. It does not produce a **loadable** `fs-ext`, which is the actual requirement.

The requirement is not "don't build fs-ext." It is "**`fs-ext` must be resolvable and loadable at import time on Windows, without a C++ toolchain**" — which is what the patch in §4 delivers as a committed, reproducible change.

---

## 3. Which lock path Windows actually takes, and what that implies about the native module

- **Path taken on Windows:** `acquireLockHandleWin32` / `releaseLockHandleWin32` (`lease-excerpt.md:12`, `win32-excerpt.ts:23-24`). These wrap the native **durable-namespace / named-semaphore** primitives `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore` (with `MoveFileExW` for the atomic, fsynced-parent-dir replacement that Windows cannot express otherwise) — see `win32-excerpt.ts:8-18`.
- **It is explicitly *not* flock:** "**Windows holds a named kernel semaphore derived from that path — never a file lock or handle**" and "**Windows has no lock file at all** … Readers never touch the lock" (`lease-excerpt.md:6-8,15`). "no flock(2) is involved on Windows" (`win32-excerpt.ts:24`).

**Implication for `fs-ext` — the crux.** fs-ext exists in this tree solely to provide the `flock(2)` binding, and that binding is used **only on the POSIX branch**. On Windows the `flock` code path is never executed; there is no lock file and no handle. So fs-ext's *entire native addon is dead code at runtime on this machine*. The **only** thing that forces fs-ext to be loaded on Windows is the static `import { flock } from 'fs-ext'` at the top of `lease.ts` (`lease-excerpt.md:17-19`).

Therefore the real, minimal requirement on Windows is **not a compiled native binary at all** — it is a module that *exports the symbol(s) `lease.ts` imports* (the excerpt shows only `flock`), which is trivially satisfied by a pure-JS stub whose `flock` is never invoked. That is why no toolchain, and no prebuilt binary, is needed: we can legitimately replace the native binding with a loadable JS stub on `win32` and keep the real binding on POSIX.

---

## 4. Fix plan — least-invasive, no Visual Studio, no upstream edit

Follow the repository's existing native-dependency patch mechanism: pnpm **`patchedDependencies`**, precedent `patches/node-pty@*.patch` registered in `pnpm-workspace.yaml`, which "can rewrite a package's install script and entry file" (`README.md:7-10`). A pnpm patch is applied to the *store copy* of the package; the published `fs-ext@2.1.1` tarball on the registry is untouched, so this does **not** modify any upstream dependency.

Create **`patches/fs-ext@2.1.1.patch`** that makes two complementary edits (both are required — see §2 — because the static import needs a loadable module, and the install must not try to compile):

**Edit A — neutralize the Windows install script.** Rewrite fs-ext's `install` script so it no-ops on Windows and still builds elsewhere:

```jsonc
// fs-ext package.json (patched copy in the store)
"scripts": {
  "install": "node install-guard.js"   // new tiny guard, or an inline equivalent
}
```
```js
// install-guard.js (added by the patch)
'use strict'
if (process.platform === 'win32') process.exit(0)   // no MSVC here; flock is unused on Windows (see §3)
require('child_process').execSync('node-gyp rebuild', { stdio: 'inherit' })
```
*(Inline equivalent if a new file is undesirable: `"install": "node -e \"process.platform==='win32'||require('child_process').execSync('node-gyp rebuild',{stdio:'inherit'})\""`.)*

**Edit B — make the entry loadable without the native binding.** Rewrite fs-ext's JS entry (the file that today `require`s `./build/Release/fs-ext.node`) so it loads a stub on Windows and the real binding everywhere else:

```js
// fs-ext entry (patched copy in the store)
'use strict'
if (process.platform === 'win32') {
  // Windows never takes the flock branch — src/lease.ts routes through
  // acquireLockHandleWin32/releaseLockHandleWin32 (named kernel semaphore).
  // Export the symbols lease.ts imports so the static import resolves;
  // flock is never called on this platform.
  module.exports = {
    flock() {
      throw new Error('fs-ext.flock is unused on Windows; the Windows lock path uses a named kernel semaphore (src/win32.ts).')
    },
    // add any other fs-ext exports the codebase references, as safe no-ops
  }
} else {
  module.exports = require('./build/Release/fs-ext.node') // unchanged POSIX behavior
}
```

**Register it** in `pnpm-workspace.yaml` next to the existing precedent:

```yaml
patchedDependencies:
  node-pty@<version>: patches/node-pty@<version>.patch   # existing precedent
  fs-ext@2.1.1: patches/fs-ext@2.1.1.patch               # new
```

**Produce the patch** with pnpm's built-in workflow so the diff is exact without hand-editing the tarball:

```bash
pnpm patch fs-ext@2.1.1          # opens an editable copy of the package
#   ... apply Edit A + Edit B in that copy ...
pnpm patch-commit <tmp-dir>      # writes patches/fs-ext@2.1.1.patch and updates pnpm-workspace.yaml
pnpm install                     # applies the patch, runs the (now no-op-on-Windows) install, completes with exit 0
```

**Why this satisfies every constraint.**
- **No Visual Studio:** Edit A makes the `install` script a no-op on `win32`, so node-gyp / `find VS` never runs; nothing needs MSVC (`install-error.log:4-11` no longer occurs).
- **Service boots:** Edit B makes `require('fs-ext')` return a loadable object, so the static `import { flock } from 'fs-ext'` in `lease.ts` resolves; the Windows lock is then taken via the named semaphore path (`win32-excerpt.ts`), never calling the stub's `flock`.
- **No upstream modification:** only the pnpm store copy is patched; the registry tarball and the npm-published `fs-ext@2.1.1` are unchanged. The repo records just `patches/fs-ext@2.1.1.patch` + one `pnpm-workspace.yaml` line — the same shape as the `node-pty` precedent (`README.md:7-10`).
- **No POSIX regression:** both edits are gated on `process.platform === 'win32'`; on macOS/Linux the entry still loads the real binding and the install script still builds it, so `flock`-based locking is unaffected there.

**Rejected alternatives.**
- `pnpm install --ignore-scripts` — relocates the failure to boot and is non-reproducible / collateral to all deps (§2).
- Installing a prebuilt `fs-ext` binary — still a native module, needs per-ABI binaries, and is pointless because the native code is dead on Windows (§3).
- Installing Visual Studio — explicitly forbidden by the machine owner (`README.md:3-4`).
- Editing `lease.ts` to lazy-import fs-ext — touches application source and does not by itself make `pnpm install` pass; the patch keeps the change confined to the dependency layer, matching the repo precedent.

---

## 5. Corridor card

The finding belongs to the **`DSH-0.1.3-A1`** corridor — i.e. the `DSH-0.1.3-A1-…` card that owns the JSONL session-persistence write-lock. The corridor is derived from the manifest: the component is `@deepseek-ai/dsh-session-persistence-jsonl@**0.1.3-alpha.1**` (`manifest-excerpt.json:2-3`), and `-A1` encodes `alpha.1` of `0.1.3`.

> **Compliance note (important).** The task's workspace boundary forbids me from reading, searching, or citing anything under the repository's `skills/` directory — explicitly including card identifiers such as `DSH-0.1.x-xx`. The fixture does not contain the card index, so I have **deliberately not fabricated the trailing card token** after `DSH-0.1.3-A1-`. The corridor prefix above is reasoned purely from the version string in `manifest-excerpt.json`; the exact full card id (the segment after `DSH-0.1.3-A1-`) must be read from the in-bounds corridor index by the orchestrator, and I flag this as the one item I could not complete from the allowed evidence.

---

## Acceptance criteria

1. `pnpm install` on the Windows 11 / no-MSVC machine exits 0 — no `node-gyp` / `find VS` step for `fs-ext` (`install-error.log:3-12` gone).
2. `patches/fs-ext@2.1.1.patch` exists and `pnpm-workspace.yaml` lists `fs-ext@2.1.1` under `patchedDependencies`, mirroring the `node-pty` entry.
3. The service boots: the persistence module loads (static `flock` import resolves to the stub) and the write lock is acquired through `acquireLockHandleWin32`/`releaseLockHandleWin32`, not through any lock file.
4. No Visual Studio / Build Tools installed; no change to the upstream `fs-ext@2.1.1` package; `fixture/` left byte-for-byte unchanged.

## Constraints honored

- Fixture read-only; only `agent-output/S20-msvc-flock-trap/` written (this report).
- No `skills/`, `solution/`, `tests/`, `node_modules/`, or any path outside the two allowed directories was read or cited.
- No sandbox escalation requested; no external services touched.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.