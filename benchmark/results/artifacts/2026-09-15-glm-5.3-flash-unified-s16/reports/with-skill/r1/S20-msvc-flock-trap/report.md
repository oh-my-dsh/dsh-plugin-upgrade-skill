# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnosis Report

- Task: static diagnosis of the `pnpm install` failure on the Windows 11 upgrade machine (no Visual Studio, owner refuses to install it). Evidence-only; `/app/fixture/` untouched.
- Mode: A · inspect (read-only) — report and fix plan only; no writes to the repository were made or needed for this diagnosis.
- Corridor: dsh 0.1.2-rc.1 → 0.1.3-alpha.1 (the upgrade that first pulls the failing module into the graph).
- Covering card: **`DSH-0.1.3-A1-03`** (see §5).

---

## 1. What exactly fails, and why

**Package:** `fs-ext@2.1.1` — a pinned, exact runtime dependency of
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
(`"dependencies": { "fs-ext": "2.1.1" }`, fixture `manifest-excerpt.json`).

**Install step:** `pnpm install` reaches fs-ext's lifecycle install script —
`fs-ext@2.1.1 install: node-gyp configure build` — which compiles fs-ext's native
C++ binding. On Windows, node-gyp requires the MSVC toolchain (Visual Studio
Build Tools, "Desktop development with C++" workload).

**Missing toolchain:** node-gyp's Visual Studio discovery fails outright
(fixture `install-error.log`):

```
fs-ext@2.1.1 install: gyp ERR! find VS msvs_version not set from command line or npm config
fs-ext@2.1.1 install: gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt
fs-ext@2.1.1 install: gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
fs-ext@2.1.1 install: gyp ERR! find VS You need to install the latest version of Visual Studio
fs-ext@2.1.1 install: gyp ERR! find VS including the "Desktop development with C++" workload.
fs-ext@2.1.1 install: gyp ERR! stack Error: Could not find any Visual Studio installation to use
pnpm: Command failed with exit code 1
```

This matches the machine facts (fixture `README.md`): no Visual Studio/Build
Tools at all — no `vswhere.exe`, no VS directory — and the owner refuses to
install them. It also explains why "every previous dsh upgrade on this machine
installed fine": `fs-ext` enters the dependency graph at this corridor
(`@deepseek-ai/dsh-session-persistence-jsonl` 0.1.3-alpha.1 is the package that
declares it), so this is the first upgrade on the machine that demands an MSVC
build. Card `DSH-0.1.3-A1-03` records exactly this new breaking face at the
0.1.2-rc.1 → 0.1.3-alpha.1 boundary.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` would skip the failing `node-gyp configure build`, but
skipping the build does not make the module loadable:

- `src/lease.ts` imports `flock` from `fs-ext` **statically, at module top**
  (`import { flock } from 'fs-ext'`, fixture `lease-excerpt.md`), and the
  fixture states the consequence explicitly: "the package loader must resolve
  and load `fs-ext` even on Windows, where the `flock` branch is never taken."
- With scripts ignored, the `fs-ext` directory is unpacked but its compiled
  native binding (`.node`) is never produced. The first time the host loads the
  session-persistence package, `require('fs-ext')` fails to find/bind the native
  module — the failure merely moves from install time to module-load time, and
  the service cannot boot.
- Card `DSH-0.1.3-A1-03` states it directly: "`fs-ext` … is statically imported
  from `src/lease.ts`, so `pnpm install --ignore-scripts` cannot skip it — the
  module must exist and load."

Additionally, `--ignore-scripts` is a global switch: it suppresses every
package's lifecycle scripts, including ones that are genuinely needed. It is a
suppression of the symptom, not a fix, and the card explicitly rules out
relying on it.

## 3. Which lock path Windows actually takes at runtime, and what that implies

Two code paths exist in `lease.ts` (cross-process write-ownership lock for one
session's artifact directory), with the kernel as arbiter:

- **POSIX:** a non-blocking `flock(2)` on `session.lock` beside the log,
  taken **through fs-ext** (fixture `lease-excerpt.md`).
- **Windows:** `acquireLockHandleWin32` / `releaseLockHandleWin32` from
  `src/win32.ts` hold a **named kernel semaphore derived from the lock path**
  (`CreateSemaphoreW` + `WaitForSingleObject` / `ReleaseSemaphore` +
  `CloseHandle` bindings, fixture `win32-excerpt.ts`). The fixtures are
  unambiguous: "Windows holds … **never a file lock or handle**", "Windows has
  no lock file at all", and "no flock(2) is involved on Windows."

**Implication about the failing native module:** on Windows, the compiled
`flock` binding inside fs-ext is **dead code** — the only fs-ext API the
runtime could call on the lock path is never invoked. The module still must
*resolve and load* (because of the static import), but its native flock
implementation is never executed. That is precisely what legitimizes a local
patch: Windows needs `fs-ext` to be *loadable*, not *buildable*; the real
native behavior only matters on POSIX, where the build environment exists.
Card `DSH-0.1.3-A1-03` reaches the same conclusion: "The native module is dead
code on Windows."

## 4. Concrete, least-invasive fix plan (no Visual Studio, no upstream change)

The repository already has a precedent for exactly this class of problem: pnpm's
`patchedDependencies` mechanism, used for the native `node-pty` package
(`patches/node-pty@*.patch`, registered in `pnpm-workspace.yaml`; fixture
`README.md`: "a patch can rewrite a package's install script and entry file").
Apply the same mechanism to `fs-ext@2.1.1`:

1. **Create the patch.** Run `pnpm patch fs-ext@2.1.1` to obtain an editable
   copy, then change two things inside it:
   - **Install script (build skip on Windows):** rewrite fs-ext's `install`
     script so `node-gyp configure build` runs **only on non-Windows** — e.g. a
     tiny guarded script: `if (process.platform === 'win32') process.exit(0);`
     otherwise exec node-gyp as before. On the target machine no compiler is
     ever invoked.
   - **Entry file (pure-JS `flock` fallback):** adjust the package's JS entry so
     the native binding lookup is guarded (try/catch around the binding
     require) and, when the binding is absent, `flock(fd, op, cb)` becomes a
     pure-JS fallback that **warns once and no-ops** the callback — the exact
     recipe the card prescribes ("give the entry a pure-JS `flock` fallback
     (warn once, no-op)"). Because §3 proves `flock` is never called on
     Windows, this fallback is unreachable in normal Windows operation; it
     exists only so the static import resolves and the module loads. The
     native path is untouched for Linux/macOS.
   - Write the result as `patches/fs-ext@2.1.1.patch` (version-pinned filename,
     same convention as the `node-pty` precedent).
2. **Register the patch** in `pnpm-workspace.yaml`: add it under
   `patchedDependencies` and keep fs-ext in the build allow-list (`allowBuilds`)
   so its (now platform-guarded) install script still runs on non-Windows
   machines.
3. **Re-run `pnpm install`** on the Windows machine. Expected: fs-ext's install
   script exits 0 without invoking node-gyp; the patched entry loads without a
   compiled binding; the whole graph installs.
4. **Explicitly not done** (per the card and the machine constraints):
   - Do **not** install Visual Studio or Build Tools;
   - Do **not** modify upstream dependencies — no fork, no version bump, no
     hand-edit of `@deepseek-ai/dsh-session-persistence-jsonl` or the lockfile
     (the patch is applied declaratively at install time by pnpm);
   - Do **not** rely on `--ignore-scripts` (§2).

**Why this is least-invasive:** scoped to a single pinned package
(`fs-ext@2.1.1`), declaratively registered and reviewable in-repo like the
existing `node-pty` patch, byte-identical POSIX/macOS behavior (native build
still runs there), and fully reversible.

**Rollback:** delete `patches/fs-ext@2.1.1.patch` and its
`pnpm-workspace.yaml` entries, re-run `pnpm install` — the graph returns to its
pre-patch state.

## 5. Corridor card

**`DSH-0.1.3-A1-03`** — *"breaking: Windows install fails on the `fs-ext` native
build (no MSVC); the runtime never calls `flock` on Windows — pnpm-patch
recipe"* (corridor 0.1.2-rc.1 → 0.1.3-alpha.1, `references/v0.1.3-alpha.1.md`).
The same finding is indexed in `references/troubleshooting.md` (row: "Windows
上 `pnpm install` 失败：`gyp ERR! find VS` / `fs-ext` 原生构建失败…"). This
report's §1–§4 restate that card's symptoms and migration recipe, each verified
against the fixture evidence.

## Verification plan (per card DSH-0.1.3-A1-03)

1. `pnpm install` completes with exit 0 on the Windows machine; no `gyp ERR!`
   output.
2. `require('fs-ext')` loads in the installed tree; the `flock` callback path
   warns once instead of throwing.
3. Service boots: `dsh web --no-open` starts and answers HTTP 200 (the Windows
   lock path exercises the named-semaphore bindings, not the patched fallback).
4. On a POSIX machine/CI: fs-ext still compiles natively and real `flock`
   locking works — no behavior change outside Windows.

## Residual risk / pending

- The patch is pinned to `fs-ext@2.1.1`; if a later corridor bumps fs-ext, pnpm
  will report the patch as no longer applying and it must be re-based.
- The pure-JS flock fallback is safe **only because** Windows provably never
  calls `flock` (§3). If future code ever adds a Windows `flock` call site, the
  warn-once fallback would mask a real locking regression — keep the warning
  visible and treat it as a signal, never silence it.
- Single-machine field evidence (one Windows 11 host without MSVC); behavior on
  other skipped-toolchain environments follows from the same code path but was
  not separately measured.
