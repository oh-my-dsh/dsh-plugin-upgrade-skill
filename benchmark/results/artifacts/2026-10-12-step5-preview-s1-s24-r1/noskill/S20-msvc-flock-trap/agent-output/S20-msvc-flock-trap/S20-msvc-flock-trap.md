# S20 — The MSVC Bootstrap / node-gyp Flock Trap (Read-Only Incident Report)

Subject: `pnpm install` failure for `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` on Windows 11
Evidence: `fixture/` only (`install-error.log`, `manifest-excerpt.json`, `README.md`, `lease-excerpt.md`, `win32-excerpt.ts`)
Constraint: no Visual Studio / Build Tools, owner refuses to install them; Node + corepack/pnpm healthy.

---

## 1. The real failure — what actually happened before the "flock" framing

**One correction up front, because it is the crux of the whole incident:** there is **no flock error anywhere in the session evidence.** `install-error.log` is the complete, unfiltered tail of the failing run and it contains no occurrence of "flock", "EBUSY", "EPERM", "EPIPE", no file path, no handle, no "EPERM: operation not permitted, flock", no "listen EADDRINUSE", no lock-path string of any kind. Grep over all five fixture files for `flock` returns **exactly one code path** — the POSIX branch in `lease-excerpt.md:5` — plus one architectural note (`lease-excerpt.md:17-18`) and one negative statement (`win32-excerpt.ts:24`, "no flock(2) is involved on Windows").

So the "the log ends in a flock error" premise is **not supported by the evidence pack**. What the session evidence *actually* shows is the following causal chain, in order:

1. **`pnpm install` resolves the plugin manifest.** `manifest-excerpt.json` declares `"dependencies": { "fs-ext": "2.1.1" }` — a plain, **non-optional, hard** dependency, not under `optionalDependencies`, not under `peerDependencies`, not guarded by `os`/`cpu`.
2. **pnpm reaches the install-script phase for that package.** The log line `fs-ext@2.1.1 install: node-gyp configure build` (`install-error.log:3`) is pnpm running the package's `install` script, i.e. `node-gyp configure build`. Nothing about this line is plugin-specific: this is fs-ext's own install script doing what it always does.
3. **node-gyp tries to find an MSVC toolchain.** It exhausts its search in order, and the log is literally the enumeration of that search:
   - `msvs_version not set from command line or npm config` (`:5`) → no `--msvs_version`, no `msvs_version` in `.npmrc`;
   - `VCINSTALLDIR not set, not running in VS Command Prompt` (`:6`) → the process environment carries no toolchain;
   - `could not use PowerShell to find Visual Studio 2017 or newer` (`:7`) → node-gyp fell back to its `vswhere`-via-PowerShell probe and that failed too.
4. **`gyp ERR! configure error` / `stack Error: Could not find any Visual Studio installation to use`** (`:10-11`). This is the **root cause**: node-gyp's *configure* phase aborted. It never got as far as compiling a single `.cc` file, never produced a `.node` binary, never ran a linker.
5. **`Failed`** (`:12`) — fs-ext's install script exits non-zero. Because fs-ext is a normal dependency, pnpm treats that as fatal: `pnpm: Command failed with exit code 1: ... pnpm install` (`:13`), and the dsh wrapper surfaces `dsh 退出码: 1` (`:14`).

**What tried to acquire the lock, on which file, and why — the honest answer from the evidence:** *nothing acquired any lock.* No lock acquisition was attempted in this session. What the log *does* show running is **node-gyp's MSVC/Python discovery**, which pnpm had already begun inside the fs-ext package directory before dying. The only "lock-like" apparatus anywhere in this incident is the plugin's *own* cross-process write-ownership lock, and the fixture is explicit that on Windows it is **not** file-based: `lease-excerpt.md:6-7` and `win32-excerpt.ts:24` both state Windows holds **a named kernel semaphore derived from the lock path** (`CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore`, `win32-excerpt.ts:9-11,17,19`) and that **"Windows has no lock file at all"** (`lease-excerpt.md:15`, "Readers never touch the lock"). A construct the plugin *does not use on this OS* cannot be the thing that broke the install.

**The consequence chain — and this is where the user's "flock" intuition accidentally lands close to the truth.** Even though the *install* died at MSVC detection, the failure mode that flanks it on Windows is real and worth stating precisely: `lease-excerpt.md:11` uses a **static top-level import** (`import { flock } from 'fs-ext'`), and the fixture spells out the consequence at `:17-18`: *"the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."* So on a machine with no toolchain the plugin has **two distinct failure surfaces, both caused by the same dependency**:

- **at install time** — fs-ext cannot be built, so `pnpm install` fails outright (this is the session that was actually logged); and
- **had it been installed by any means that skips scripts** (e.g. `--ignore-scripts`) — the loader would immediately hit `MODULE_NOT_FOUND` for `fs-ext`'s native binding the first time `src/lease.ts` is loaded, because the static import is *unconditional* and the `flock` code path is **never reached on Windows** anyway.

Those are not the flock error either; they are `node-gyp` and `MODULE_NOT_FOUND`. Any downstream "flock" wording that reaches the user is a **re-reporting artifact** — a tool or a person relabelling "the fs-ext native dependency could not be produced/loaded" with the only fs-ext API name they recognised. The flock call is a red herring layered on top of a red herring.

---

## 2. Why "the machine has no toolchain" being presented as the interesting finding is itself the red herring

The evidence draws a sharp line between **detection state** and **fatal cause**:

**What is true about the detection state (machine facts, `README.md:3-5`):**
- No `vswhere.exe`, no VS directory — i.e. node-gyp's probe at `install-error.log:7` is *correct*. This is not a detection bug, not a stale cache, not a broken PATH entry, not a version-matching problem. Node and corepack/pnpm are installed and working, and every previous dsh upgrade on this machine installed fine.

**What is actually fatal (incident facts):**
- The plugin declares a **hard runtime dependency on a native addon** (`"fs-ext": "2.1.1"`, `manifest-excerpt.json:5`) whose install path is **compile-from-source with node-gyp** (`install-error.log:3`).
- There is **no prebuild in evidence anywhere in the fixture**: no `prebuild-install` invocation, no `napi`/`node-api` artifact, no `prebuilds/` directory, no `@deepseek`-hosted binary, no `node-gyp-build` fallback. The only build mechanism in the log is `node-gyp configure build`.
- From `configure error` (`:10`) onward everything is collateral. The `find VS` block (`:4-9`) is node-gyp *explaining* its failure, not causing it. `Failed` (`:12`) is the exit code; `pnpm: Command failed` (`:13`) and `dsh 退出码: 1` (`:14`) are pnpm and the dsh wrapper relaying that non-zero exit up the stack.

So: **"no MSVC" is not a detection anomaly to be fixed, it is the environment the package was shipped into without a prebuild.** The correct diagnosis is not "node-gyp could not find VS" but **"a package that requires a C toolchain at install time was specified as a plain runtime dependency with no prebuilt fallback, on a machine whose owner has declared that a C toolchain will never exist."**

Equally, the loud-but-downstream trio in this incident are, in order of noise:

| Signal | Where it appears | What it actually is |
|---|---|---|
| MSVC / "find VS" / "Desktop development with C++" | `install-error.log:4-11` | **The real cause** — configure aborted before any compilation |
| Python | *not present in this log* | node-gyp's *next* probe; never reached here. Absence of Python is irrelevant to this failure |
| flock / lock file | *not present anywhere* | The plugin's POSIX-only write lock; on Windows it is a named semaphore (`win32-excerpt.ts:24`) and "Windows has no lock file at all" (`lease-excerpt.md:15`) |

**The important second-order fact:** the machine's missing toolchain is fatal for the *plugin* even though the plugin's Windows lock path never needs fs-ext to do anything. `lease-excerpt.md:11-12` statically imports both `flock` from `fs-ext` **and** the Windows bindings, and `lease-excerpt.md:5,15` + `win32-excerpt.ts:24` establish that on Windows the semaphore path is taken and the `flock` branch is *never taken*. The only reason fs-ext must resolve at all on Windows is that static import — a packaging accident, not a functional requirement.

---

## 3. The exact resolution for this user (command-level, ordered)

**Honest framing first, because it changes the shape of the answer:** this is **not user-fixable on this machine**. The user cannot make `pnpm install` succeed by any command, because the failure is that fs-ext *has no non-build install path*, and this user has committed to never installing a C toolchain. `--ignore-scripts`, `--offline`, `--prod`, shims — every user-side trick either leaves the hard dependency unresolved (install fails) or leaves it present-but-unbuilt (loader crashes later at `MODULE_NOT_FOUND`, per `lease-excerpt.md:17-18`). Every durable fix is a **package change**. That is why the fixture's `README.md:7-9` records that the repository *already* patches native dependencies through `patchedDependencies` (the `patches/node-pty@*.patch` precedent) and that "a patch can rewrite a package's install script and entry file" — that mechanism is the escape hatch, and it is maintainer-side.

**Step 0 — stop, and clean the poisoned install (user-side, mandatory first).**
```powershell
# 1. Close every process holding node_modules/.pnpm — editors, dev servers, the dsh CLI itself.
#    A half-finished install is a half-finished install; re-running it on top of a
#    partial state produces confusing second-order failures.
# 2. Record the exact failing line for the issue report (see §5):
git -C <plugin-source-repo> status --porcelain   # confirm nothing of yours is uncommitted first
# 3. Remove the broken tree. This is destructive and it is the correct move here,
#    because the previous run died mid-install and left a partial state.
Remove-Item -Recurse -Force node_modules
Remove-Item -Recurse -Force node_modules\.pnpm  # no-op if absent
Remove-Item -Force pnpm-lock.yaml               # only if you will regenerate it below
```
Why: pnpm died mid-install; the residual `node_modules/.pnpm/fs-ext@...` entry is unbuilt and unlinkable. Skipping this step turns a clean failure into an ambiguous one.

**Step 1 — apply the maintainer-side patch (this is the actual fix, not optional).**
```powershell
# In the plugin's repository (NOT in the user's app). Regenerate against the locked version:
pnpm patch fs-ext@2.1.1
#    -> pnpm creates .pnpm-patches/fs-ext@2.1.1/ with a full editable copy of the package.
```
Now edit the editable copy so that **Windows never needs a compiled fs-ext**:

- **(a) `package.json` in the patch dir** — replace the native build script with a no-op:
  ```json
  "scripts": { "install": "node -e \"\"" }
  ```
  (delete `node-gyp rebuild` / `node-gyp configure build` entirely, or reduce it to a zero-exit no-op).
- **(b) the package entry** — add a pure-JS fallback so that `require('fs-ext')` resolves on Windows with **no native binary**. fs-ext's POSIX surface the plugin uses is exactly one function (`flock`, `lease-excerpt.md:11`); on Windows it must never be called (`lease-excerpt.md:5,15`; `win32-excerpt.ts:24`). A minimal Windows shim suffices:
  ```js
  // fs-ext entry, Windows branch
  module.exports = {
    flock: function () {
      throw new Error('fs-ext#flock is POSIX-only; this build uses the Windows named-semaphore lock');
    },
    // plus any other fs-ext members fs-ext's own JS surface is expected to expose
  };
  ```
- **(c) commit the patch file the editor produced:**
```powershell
pnpm patch-commit .pnpm-patches/fs-ext@2.1.1
```
This yields `patches/fs-ext@2.1.1.patch` and the `patchedDependencies` entry in `pnpm-workspace.yaml` — the same mechanism as the recorded `patches/node-pty@*.patch` precedent (`README.md:7-9`).

Why (a): it removes the fatal `node-gyp configure build` step (`install-error.log:3`) so MSVC/Python are never probed on this machine. Why (b): it removes the *second* failure surface — the unconditional `import { flock } from 'fs-ext'` (`lease-excerpt.md:11`) whose note at `:17-18` guarantees the loader resolves fs-ext on Windows too. Why (c): `patchedDependencies` is the only mechanism that survives `pnpm install` in a clean checkout, on every machine, including CI.

**Step 2 — reinstall with a clean, script-aware run (user-side, after the patch is published or applied locally).**
```powershell
pnpm install            # node-gyp never runs; no toolchain probe, no flock anything
```
Why: with the patch registered, the install phase no longer contains a compile step, so the `find VS` chain (`install-error.log:4-11`) cannot be reached. Verify:
```powershell
node -e "require('fs-ext'); console.log('fs-ext loads without a native binary')"
# then run the plugin's own Windows path, which exercises acquireLockHandleWin32 /
# releaseLockHandleWin32 (win32-excerpt.ts:23) and never touches flock.
```

**Step 3 — if (and only if) you are pinned to the published tarball with no patch available.**
Do **not** paper over this with `--ignore-scripts`: it makes `pnpm install` exit 0 and then guarantees a `MODULE_NOT_FOUND` at first `require('fs-ext')` (`lease-excerpt.md:17-18`), converting a loud install failure into a silent runtime failure. The only honest options are (i) wait for the patched release from Step 1, or (ii) vendor a local file copy of fs-ext and point the dependency at it via `pnpm.overrides` / a `file:` spec. Neither is a workaround worth recommending; both are strictly worse than Step 1.

**What NOT to do, and why:**
- **Do not install Visual Studio / Build Tools with the C++ workload**, **do not install Python**, **do not set `msvs_version` / `VCINSTALLDIR` / run from a Developer Command Prompt.** Every one of those suppresses the symptom by adding a 6–10 GB toolchain to a machine whose owner has ruled it out, to support a lock the plugin never takes on this OS.
- **Do not file this against node-gyp.** node-gyp behaved correctly: it correctly reported that there is no VS installation (`README.md:3-4`, `install-error.log:4-11`). The defect is in the packaging of fs-ext as a hard, prebuild-less dependency.
- **Do not "fix" it by deleting the semaphore code or the `flock` import wholesale.** The semaphore path *is* the Windows correctness mechanism (`win32-excerpt.ts:8-21`); removing it would be a regression, not a repair.

---

## 4. What the plugin maintainer must change

**(1) Kill the compile-at-install-time requirement for the Windows platform.**
`fs-ext@2.1.1` is a hard `dependencies` entry (`manifest-excerpt.json:5`) whose only install path in the log is `node-gyp configure build` (`install-error.log:3`). Concretely, pick one:
- **Prebuilds via N-API** — this is the single highest-leverage change. An N-API (`node-api`) build of fs-ext is ABI-stable and ships per-platform binaries with `node-gyp-build`/`prebuild-install`, so Windows users download a `.node` file and node-gyp is never invoked at install time. No toolchain, no Python.
- **`optionalDependencies` + honest platform set** — if fs-ext must remain source-built at all, list it under `optionalDependencies` with `os`/`cpu` fields covering **only the platforms that actually need it**, i.e. `"os": ["!win32"]`. pnpm then skips it entirely on Windows. Note this is *not* currently true: the fixture shows fs-ext in plain `dependencies` with no platform guard, which is why pnpm built it on Windows in the first place.
- **A pure-JS shim behind a platform check** — since `lease-excerpt.md:5,15` and `win32-excerpt.ts:24` establish Windows never calls `flock`, the correct dependency shape is "POSIX-only native, Windows no-op". The shim in §3 Step 1(b) is the reference implementation.

**(2) Fix the static import, which is what makes the platform mismatch fatal rather than cosmetic.**
`lease-excerpt.md:11` imports `flock` at module top level, and `:17-18` explicitly notes this forces the loader to resolve fs-ext on Windows where the branch is never taken. Even with prebuilds, this is the wrong shape:
```ts
// load lazily and only where it is used
const flock = process.platform === 'win32'
  ? null
  : (await import('fs-ext')).flock;   // never resolved on Windows
```
This is what makes the failure class *impossible on Windows* rather than merely *rare* — it decouples "Windows install" from "POSIX native addon exists" entirely. Combine with a `try { require('fs-ext') } catch` plus an explicit, actionable error message if the import is ever reached on an unsupported platform.

**(3) Use the packaging fields that already exist to state the truth.**
- `engines`: pin the node range actually built against (and note in the README that no compiler is required).
- `os` / `cpu` on any dependency that is genuinely platform-specific — as above, `"os": ["!win32"]` for fs-ext.
- `bundledDependencies` or vendoring the tiny POSIX-only path is also legitimate here given how small the used surface is.

**(4) Make the failure self-explanatory when it does happen.**
Right now the error is `gyp ERR! find VS` + `Could not find any Visual Studio installation to use` (`install-error.log:4-11`) relayed verbatim by pnpm (`:13`) and the dsh wrapper (`:14`) — which points the user at *their* machine instead of at *your* packaging, and is exactly the trap this incident is named for. Add a `preinstall` guard that detects "Windows **and** no MSVC **and** no prebuild available" and fails fast with a message naming the package, the reason, and the fix ("`fs-ext` is POSIX-only; this plugin uses a Windows named-semaphore lock and does not need it. Upgrade to >= <fixed version>"). Better: make the *unconditional* `require('fs-ext')` throw a message that says the same thing, so even a partial install that skips scripts explains itself instead of surfacing a bare `MODULE_NOT_FOUND`.

**(5) Ship an install-time smoke test that covers Windows.**
Every previous dsh upgrade installed fine on this machine (`README.md:5-6`) — the toolchain-free path was never exercised by the *new* dependency. A CI job on `windows-latest` with no MSVC, running the real install plus one lock acquire/release, catches this class before release.

**(6) Reduce the native surface, full stop.**
`win32-excerpt.ts:1-6` already notes Node does not expose the parent-directory fsync contract, which is why Windows uses the durable-namespace primitive (`MoveFileExW`, `win32-excerpt.ts:8`) plus a named semaphore. If fs-ext is retained *only* for POSIX `flock`, it is a heavy (source-built, toolchain-requiring) dependency carrying a one-function payload — a strong candidate for replacement with a prebuilt, dependency-free equivalent.

---

## 5. Prevention for the USER — check this before filing a node-gyp issue on Windows

Run this checklist **before** opening an issue against node-gyp, pnpm, or the plugin. Each item is something the evidence for this incident lets you decide locally:

1. **Is the failing package actually a build, or is it a packaging problem?** Read the first line of the failing script: `fs-ext@2.1.1 install: node-gyp configure build` (`install-error.log:3`). If the first thing that runs is `node-gyp`, the package *requires* a compiler by design. That is a packaging fact about the dependency, not a bug in node-gyp.
2. **Does it ship a prebuild?** Look in the cached tarball / package dir for `prebuilds/`, `build/Release/*.node`, `node-api`/`napi` in the name, or a `prebuild-install` call. If none exists, a from-source build is the *only* path and node-gyp is doing exactly its job. (In this incident: none — the log contains no such step.)
3. **Is the failure about your machine, or about the dependency's platform support?** Check whether the package is a `dependency` vs `optionalDependencies`, and whether it has `os`/`cpu` fields. A POSIX-only native package in plain `dependencies` is a packaging bug and an upstream issue, not a node-gyp issue.
4. **Does the code path you actually run even need the native module?** Check the plugin's source for how the import is done. A *static, unconditional* `import { flock } from 'fs-ext'` (`lease-excerpt.md:11`, with the note at `:17-18`) means the module must exist on every platform; a lazy/platform-gated import means it does not. In this incident the Windows lock is a named semaphore (`win32-excerpt.ts:24`, `lease-excerpt.md:15`), so the native module is *never functionally used* on Windows.
5. **Reproduce the failure in isolation before reporting.** A minimal `fs-ext@2.1.1`-only install in a scratch directory that fails identically proves the problem is the package, not your app or your plugin config.
6. **Did a previous version of this same app install cleanly on the same machine?** Here, `README.md:5-6` says yes — every previous dsh upgrade installed fine. A new failure on an unchanged machine after a dependency change is strong evidence the *change* (a new hard native dependency) is the cause. Compare the two manifests.
7. **Check the Python question separately from the MSVC question.** They are independent probes. Here the log never even mentions Python, so "install Python" is guesswork. Read which one failed first.
8. **Read the log to its *last* frame, not its loudest.** The last frames are `Failed` → `pnpm: Command failed with exit code 1` → `dsh 退出码: 1` (`install-error.log:12-14`). The frames above are node-gyp narrating. The narrative tells you *why*; the exit chain tells you *what to file where*.
9. **Never report a lock error you have not actually seen a line for.** There is no flock line in this session at all — and on Windows this plugin has **no lock file** (`lease-excerpt.md:15`); its lock is a named kernel semaphore (`win32-excerpt.ts:9-11,24`). If your reported symptom has no matching line in your own log, you are reporting folklore, and the maintainer cannot act on it.
10. **Search the plugin's tracker with the *package name* before filing at node-gyp.** Search "fs-ext windows", "fs-ext prebuild", "fs-ext optionalDependencies". If a prebuild or an `optionalDependencies` release exists, the fix is a version bump — not a toolchain install, and definitely not a node-gyp issue.

**One-line summary for the user:** your machine is fine; `fs-ext@2.1.1` was published as a hard, source-only dependency for a code path you never execute on Windows (the Windows lock is a named semaphore, not a file lock), so the fix is a packaging change — prebuilds, `optionalDependencies` with `os`, or a lazy/platform-gated import — not a Visual Studio install.

---

## Evidence ledger

| Claim | Source | Status |
|---|---|---|
| fs-ext is a hard dependency of the plugin, `dependencies`, no platform guard | `manifest-excerpt.json:5` | verbatim |
| Install invoked `node-gyp configure build` | `install-error.log:3` | verbatim |
| node-gyp exhausted msvs_version → VCINSTALLDIR → PowerShell/vswhere probes, then `configure error` | `install-error.log:4-11` | verbatim |
| Exit chain: `Failed` → pnpm exit 1 → `dsh 退出码: 1` | `install-error.log:12-14` | verbatim |
| **No flock / lock error text anywhere in the session** | grep across all 5 fixture files | negative finding |
| No MSVC / no vswhere / no VS dir; owner refuses to install | `README.md:3-4` | verbatim |
| Node + corepack/pnpm healthy; prior upgrades installed fine | `README.md:5-6` | verbatim |
| `patchedDependencies` precedent (`patches/node-pty@*.patch`), patches can rewrite install script + entry | `README.md:7-9` | verbatim |
| POSIX uses `flock(2)` via fs-ext on `session.lock` | `lease-excerpt.md:5` | verbatim |
| Windows uses a named kernel semaphore; "Windows has no lock file at all" | `lease-excerpt.md:6-7,15` | verbatim |
| `flock` statically imported at module top; loader must resolve fs-ext on Windows | `lease-excerpt.md:11,17-18` | verbatim |
| Windows lock = `CreateSemaphoreW`/`WaitForSingleObject`/`ReleaseSemaphore`; no flock(2) involved | `win32-excerpt.ts:9-11,17,19,23-24` | verbatim |
| Python absence is fatal | — | **not in evidence** (not in log; never reached) |
| fs-ext ships any prebuild / N-API / node-gyp-build artifact | — | **not in evidence** (none present in fixture; inferred absence of a non-build install path) |
| Concrete shim code, patch commands, `os: ["!win32"]` | — | **derived recommendation** (general packaging practice + fixture's `patchedDependencies` precedent), not fixture text |
