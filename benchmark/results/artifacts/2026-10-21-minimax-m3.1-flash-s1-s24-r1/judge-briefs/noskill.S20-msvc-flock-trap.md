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

# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls

**Target machine:** Windows 11, no Visual Studio / Build Tools (owner refuses to install them).
**Goal:** make `pnpm install` complete and the service boot — no Visual Studio, no changes to upstream dependencies.
**Status of fixture:** `/app/fixture/` was read only; nothing in it was modified.
**Nature of this document:** static diagnosis + fix plan. No live-host probing was performed (the host runs a different dsh version and is out of scope).

---

## 0. TL;DR

`fs-ext@2.1.1` — a **POSIX-only** native addon — is now a hard runtime dependency of
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`. Its `install` script runs `node-gyp configure build`,
which needs an MSVC toolchain the machine does not have, so `pnpm install` aborts with exit code 1.
But on Windows the lease code **never calls `flock`**: the Windows path takes a *named kernel semaphore*
(`CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore`) and there is no lock file at all.
The native module is a pure install-time liability on Windows — and it is only *loaded* there because
`src/lease.ts` imports `flock` **statically at module top**.

**Fix:** use the repository's existing pnpm `patchedDependencies` mechanism (the `patches/node-pty@*.patch`
precedent) to ship a patch for `fs-ext@2.1.1` that (a) makes the install script a no-op on `win32` and
(b) rewrites the package entry into a pure-JS, platform-dispatching shim so the static import still resolves
on Windows. Install then completes with no compiler, and the Windows boot path is untouched.

---

## 1. Evidence inventory (what each fixture file proves)

| Fixture file | What it establishes |
|---|---|
| `install-error.log` | `fs-ext@2.1.1 install: node-gyp configure build` → `gyp ERR! find VS …` → `Could not find any Visual Studio installation to use` → `pnpm: Command failed with exit code 1` → `dsh 退出码: 1`. The failure is toolchain **discovery**, not a source compile error. |
| `manifest-excerpt.json` | `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` declares `"fs-ext": "2.1.1"` (exact pin) as a **runtime** dependency; `@types/fs-ext@2.0.3` is devDependencies-only (types, no native code). |
| `lease-excerpt.md` | POSIX takes a non-blocking `flock(2)` via fs-ext on `session.lock`; **Windows holds a named kernel semaphore derived from the path — never a file lock or handle**; "Windows has no lock file at all"; and critically: *"`flock` is imported statically at module top — the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."* |
| `win32-excerpt.ts` | The Windows lock path is built from `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle`, `GetLastError` (plus `MoveFileExW` for durable publish). "acquireLockHandleWin32 / releaseLockHandleWin32 wrap these named-semaphore primitives; **no flock(2) is involved on Windows**." |
| `README.md` | Machine facts: no VS/Build Tools, no `vswhere.exe`, owner refuses; Node + corepack/pnpm fine; *every previous dsh upgrade installed fine*; the repo **already** patches native deps via pnpm `patchedDependencies` (`patches/node-pty@*.patch`), and such a patch "can rewrite a package's install script **and entry file**", registered in `pnpm-workspace.yaml`. |

---

## 2. Q1 — What exactly fails, and why

**Failing package:** `fs-ext@2.1.1`.
**Failing install step:** the package's `install` lifecycle script, which runs `node-gyp configure build`
(`install-error.log`, line 1 of the transcript).
**Missing toolchain:** a Visual Studio 2017+ installation with the "Desktop development with C++" workload.
node-gyp's `find VS` step probes for it and, on this machine, every probe misses:

- `msvs_version not set from command line or npm config`
- `VCINSTALLDIR not set, not running in VS Command Prompt`
- `could not use PowerShell to find Visual Studio 2017 or newer`
- ⇒ `gyp ERR! find VS You need to install the latest version of Visual Studio including the "Desktop development with C++" workload.`
- ⇒ `gyp ERR! stack Error: Could not find any Visual Studio installation to use`

This is corroborated by `README.md`: no `vswhere.exe`, no VS directory, owner refuses to install it.

**Propagation:** the failing script exits non-zero ⇒ `pnpm: Command failed with exit code 1` ⇒ the whole
workspace install aborts (no further packages are installed) ⇒ the dsh upgrade step exits `1`
(`dsh 退出码: 1`). The blast radius is the entire install, not one package.

**Why it is a regression:** `README.md` states every previous dsh upgrade on this machine installed fine.
So `fs-ext` is a **newly introduced** dependency — introduced by the new
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` (`manifest-excerpt.json`), which pins
`"fs-ext": "2.1.1"` as a runtime dependency. The regression is a hard dependency on a POSIX-only native
module being shipped to a Windows host with no C++ toolchain.

---

## 3. Q2 — Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` suppresses lifecycle scripts, so the `node-gyp` build would be skipped and the install
*would* exit 0. That is precisely why it is the wrong fix — it relocates the failure instead of removing it:

1. **It does not remove the dependency, and the module is still loaded at boot.**
   `lease-excerpt.md` states that `flock` "is imported statically at module top — the package loader must
   resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken." A static ESM import
   is resolved and evaluated when `src/lease.ts` is loaded. fs-ext is a **compiled native addon**: with the
   build skipped there is no `fs_ext.node` binding on disk, so loading the package throws at import time
   (missing native binding / failed to load `.node` file) — the service fails to boot with a *module load*
   error instead of an install error. The goal of this task is "install completes **and** the service boots";
   `--ignore-scripts` satisfies only the first half.
2. **It is repo-wide and hits native dependencies that genuinely need their build.**
   The README's own precedent (`patches/node-pty@*.patch`, a patch that rewrites a native package's
   *install script and entry file*) shows this repo has at least one other native dependency whose install
   script is patched — i.e. a native module whose build is part of the normal install flow. A global
   `--ignore-scripts` also suppresses *that* build, trading a clean failure for a silently degraded install
   (inferred from the README; the README does not state node-pty's build requirement explicitly).
3. **It leaves the Windows install non-reproducible.** The next plain `pnpm install` (without the flag) — the
   one the teammate actually runs — fails again. The machine would need every future install to carry a
   special flag; nothing in the repository encodes the constraint.

Conclusion: `--ignore-scripts` treats the symptom (a script ran) instead of the cause (a Windows-host
dependency on a module whose native code Windows never executes).

---

## 4. Q3 — Which lock path Windows actually takes, and what that implies

**The path.** On Windows the lease is **not** a file lock. Per `lease-excerpt.md`, "Windows holds a named
kernel semaphore derived from that path — never a file lock or handle, so readers, searches, and directory
removal proceed freely while the lock is held", and "Windows has no lock file at all. Readers never touch
the lock." Concretely `src/lease.ts` calls `acquireLockHandleWin32` / `releaseLockHandleWin32` from
`./win32.ts`, which wrap the Win32 primitives shown in `win32-excerpt.ts`:

- `CreateSemaphoreW(security, initial, maximum, name)` — the named semaphore, its name derived from the
  session artifact directory path;
- `WaitForSingleObject(handle, ms)` — the blocking acquisition;
- `ReleaseSemaphore(handle, count, previous)` / `CloseHandle(handle)` — release and teardown;
- `MoveFileExW(existing, replacement, flags)` — the Windows durable-publish primitive that replaces the
  POSIX "create a directory entry, then fsync the parent directory" contract that Node does not expose on Windows.

`win32-excerpt.ts` states it outright: "**no flock(2) is involved on Windows**."

**What that implies about the failing module.**

1. **`fs-ext` is functionally dead code on Windows.** The `flock` branch is never taken; the entire native
   addon exists for the POSIX path only. On Windows it contributes *zero* runtime capability.
2. **Therefore the MSVC requirement buys nothing on this machine.** The machine pays a full C++ toolchain
   demand (a refused install, and an install blocker) for a module whose only exported function is never called.
3. **Yet the module is still mandatory at load time** — because of the *static* top-level import. This is the
   trap: the runtime does not need fs-ext, but the module loader must still resolve and load it on Windows.
   This is why the fix must handle **both** the install script (no build) **and** module loadability
   (a JS entry), and why `--ignore-scripts` alone cannot work (§3).
4. **The Windows lock path is independent of any C++ toolchain.** The Win32 bindings are used directly by the
   package's own Windows path, so removing the fs-ext build obligation does not weaken Windows locking.
   (How the Win32 bindings themselves are obtained — a prebuilt FFI loader vs. a locally compiled addon — is
   **not** shown in the fixture; the excerpts only show the type signatures. Marked unconfirmed below. It does
   not affect the plan: the fs-ext build is removed either way, and the repo's existing Windows path is
   already shipping and working on this machine per `README.md`.)

---

## 5. Q4 — Least-invasive fix plan (no Visual Studio, no upstream changes)

### Mechanism: the repository's existing pnpm `patchedDependencies` route

`README.md` states the precedent explicitly: the repository "already patches native dependencies through
pnpm's `patchedDependencies` mechanism (see the existing `patches/node-pty@*.patch` precedent): a patch can
rewrite a package's install script **and entry file**, and `pnpm-workspace.yaml` registers it."

This is exactly the tool the task asks for: it changes only the **installed copy** of a dependency inside this
repository. It does **not** fork, fork-publish, or alter the upstream package's published content, does not
change any upstream manifest, and does not require a compiler on the target machine. A patch is a normal,
reviewable text artifact in-repo, exactly like the existing `node-pty` patch.

The patch must do **two** things (mirroring the node-pty precedent, which rewrites install script *and* entry):

- **(a) Install script:** on `win32`, do not run `node-gyp` at all; on every other platform, run the
  original build unchanged (so POSIX keeps its working `flock`).
- **(b) Entry file:** make `require('fs-ext')` / `import 'fs-ext'` resolvable on Windows without any
  compiled binary — a pure-JS shim that dispatches on `process.platform`.

### Step-by-step

**Step 1 — Confirm the dependency chain on the target machine (2 minutes, read-only).**

```
pnpm why fs-ext
pnpm install            # reproduce; expect the same fs-ext/node-gyp failure
```
Expect: `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` → `fs-ext@2.1.1`. Confirm `fs-ext` is
the *only* package whose install script fails (the transcript shows only fs-ext; verify no second native
package fails once fs-ext is fixed).

**Step 2 — Create the patch (works on a machine with no MSVC; no build is required to extract a package).**

```
cd <repo>
pnpm patch fs-ext@2.1.1          # prints a temp extraction dir; extraction needs no toolchain
# … edit files in that dir (below) …
pnpm patch-commit <temp-dir>     # writes patches/fs-ext@2.1.1.patch
```
The manifest pins `"fs-ext": "2.1.1"` **exactly**, so the patch key `fs-ext@2.1.1` is stable and
deterministic (pnpm matches patchedDependencies by exact version — if the pin later floats to a range, the key
must be updated; note this as a maintenance item).

**Step 3 — (a) Rewrite the install script inside the patch.**

In the extracted `fs-ext@2.1.1` package, replace `package.json`'s `scripts.install` (currently
`"node-gyp configure build"`, per the transcript) with a call to a small script that is a **no-op on
Windows** and reproduces the original build everywhere else:

```jsonc
// package.json (patched)
"scripts": { "install": "node scripts/install.js" }
```

```js
// scripts/install.js (added by the patch)
if (process.platform === 'win32') {
  // No MSVC / Build Tools on Windows hosts: the native addon is not needed there.
  process.exit(0)
}
const { spawnSync } = require('node:child_process')
const r = spawnSync('node-gyp', ['configure', 'build'], { stdio: 'inherit', shell: true })
process.exit(r.status === null ? 1 : r.status)
```
Implementation notes: pnpm places its bundled `node-gyp` on the lifecycle-script `PATH`, so the
non-Windows branch behaves exactly like the original script; if `node-gyp` is not on `PATH` in some
environment, resolve `node-gyp/bin/node-gyp.js` instead. A one-line variant is also possible
(`"install": "node -e \"process.platform==='win32'||require('child_process').execSync('node-gyp configure build',{stdio:'inherit'})\""`),
but the separate file is easier to read and to review in the patch.

**Step 4 — (b) Rewrite the entry file inside the patch.**

Keep the original implementation file under a new name and point the package entry at a dispatching shim, so
no knowledge of fs-ext's internal layout is required (its exact file layout is **not** shown in the fixture —
confirm the entry path from the extracted `package.json` `main`/`exports` at patch time):

```js
// <entry>.js — patched entry (the file package.json's "main"/"exports" points to)
if (process.platform === 'win32') {
  // Windows never calls flock(): the lease uses a named kernel semaphore (see src/win32.ts).
  // Export a JS-only surface so the package loader can still load fs-ext with no native build.
  const unsupported = (name) => function () {
    const err = new Error('fs-ext.' + name + '() is unavailable on Windows: the native addon is not built ' +
      'there (POSIX-only feature; the Windows lease path uses a named semaphore).')
    err.code = 'ENOSYS'
    throw err
  }
  module.exports = {
    flock: unsupported('flock'),
    // … one stub per name exported by the original entry (generate this list mechanically from
    //   the original module's exports while creating the patch, so nothing is missed) …
  }
} else {
  module.exports = require('./<original-entry>.js')   // unchanged POSIX behaviour
}
```
Scope check: the fixture shows exactly one consumer of fs-ext — `import { flock } from 'fs-ext'` in
`src/lease.ts` — so the Windows stub must at minimum provide `flock`. Whether any other repository code
imports additional fs-ext functions is **not** determinable from the fixture; the plan therefore requires
(1) a repo-wide check for other `from 'fs-ext'` imports and (2) generating the stub list from the original
module's export list, so the patched package's surface is name-complete even if some APIs are unused.

**Step 5 — Register the patch in `pnpm-workspace.yaml` (per README: "pnpm-workspace.yaml registers it").**

```yaml
patchedDependencies:
  'fs-ext@2.1.1': patches/fs-ext@2.1.1.patch
```
Keep the existing `node-pty` entry. The lockfile (`pnpm-lock.yaml`) is updated in-repo by `pnpm install`.
If the repo uses pnpm 10's build-approval allowlist (`onlyBuiltDependencies`/`neverBuiltDependencies`), note
that it keys on **package name**, not on script content — the patch does not change that list, and `fs-ext`
stays approved exactly as before. (If fs-ext were added to `neverBuiltDependencies` as well, that would also
skip the *POSIX* build and break the POSIX `flock` — so do **not** do that; the patched install script is
already a no-op on Windows.)

**Step 6 — Verify on the target machine (no VS installed).**

1. `pnpm install` → exit code 0, and the transcript contains **no** `node-gyp`/`find VS` line for fs-ext.
2. `pnpm rebuild fs-ext` → exit 0, no gyp error (the patched script is a no-op on Windows).
3. Module-load smoke test (run where fs-ext is resolvable, e.g. inside the persistence package's directory):
   `node -e "const m=require('fs-ext'); console.log(typeof m.flock)"` → prints `function` with **no**
   native binding present — proving the static import in `src/lease.ts` resolves on Windows.
4. Boot the service / load the session-persistence plugin → `src/lease.ts` loads (shim), the Windows path takes
   `acquireLockHandleWin32` → a named semaphore is created; **no `session.lock` file appears** next to the
   log; readers/greps and directory removal succeed while a write handle is held (the documented Windows
   behaviour); the write-ownership guarantee is still enforced through the semaphore.
5. Cross-platform regression (Linux/macOS CI): the same patched package still runs `node-gyp configure build`
   and `flock` behaves as before — the patch's non-Windows branch is byte-for-byte the original behaviour.
6. Confirm the fixture/upgrade still completes end-to-end: `pnpm install` → `dsh` upgrade step → service boot
   (previously `dsh 退出码: 1`).

**Step 7 — (Optional, non-blocking) Upstream contribution, explicitly OUT of the fix.**

The clean upstream fix is for `@deepseek-ai/dsh-session-persistence-jsonl` to stop importing `flock`
statically (lazy `await import('fs-ext')` inside the POSIX branch, or a platform-guarded dynamic import)
and/or to drop fs-ext from the Windows dependency set. That is an upstream change and is **not** part of this
plan; the patch above is the in-repo, least-invasive way to unblock the machine today.

### Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| Install Visual Studio Build Tools | Forbidden by the machine owner; `README.md` states the refusal explicitly. |
| `pnpm install --ignore-scripts` | Install-only fix that breaks boot (static import of an unbuilt native addon) and suppresses other native builds; §3. |
| `pnpm.neverBuiltDependencies: [fs-ext]` (or removing it from `onlyBuiltDependencies`) | Skips the build but leaves the unbuilt module to be loaded at boot **and** disables the POSIX build that POSIX needs; the patched install script already handles Windows precisely. |
| Dropping / replacing `fs-ext` in the upstream manifest | Modifies an upstream dependency declaration — explicitly out of scope; also a published-package change, not a repo-local one. |
| Vendoring a prebuilt fs-ext binary | A binary artifact the repo would have to build, sign and ship; the patched JS shim is smaller, reviewable and platform-scoped. |
| Patching the *consumer* to make the import lazy only | Does **not** fix the install failure: fs-ext remains a declared dependency, so pnpm still installs it and still runs its install script. It may be added later as a complement, but on its own it is insufficient. |

### Risk register

- **Stub surface drift:** if the repo imports fs-ext APIs beyond `flock`, the Windows stub must cover them →
  generate the stub list from the original module's exports; grep the repo for `from 'fs-ext'`.
- **Version drift:** `patchedDependencies` keys are exact-version; a change of `fs-ext` in the upstream manifest
  invalidates the patch key. Keep the pin at `2.1.1` or update the key and the patch together.
- **POSIX regression:** the patch's non-Windows branch must remain the original build; guard with the Linux CI
  check in Step 6.5.
- **Store/patch interaction:** pnpm re-applies the patch on install; a stale store copy may require
  `pnpm install --force` once. No compiler is involved at any point.

---

## 6. Q5 — Corridor card

**Card family (evidenced):** `DSH-0.1.3-A1-…` — the brief's own example format, matching the failing
package's release train `0.1.3-alpha.1` (`manifest-excerpt.json`:
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`).

**Full card id: UNCONFIRMED — cannot be read from this task's whitelist.** The corridor card index lives
outside the read boundary of this cell (the whitelist contains only the fixture and this report directory), and
the fixture itself contains no card identifiers. Nothing in the evidence supports inventing a suffix.

**What the card must cover (for the reviewer to match):** the Windows host corridor of the 0.1.3 upgrade —
the native-dependency install path on a Windows host without a C++ toolchain, i.e. the `fs-ext` /
node-gyp / "find VS" install blocker. Subject slot to confirm against the card index: the
"Windows / native-dependency install" card of the `DSH-0.1.3-A1-…` series (candidate id for a
search in the index: `DSH-0.1.3-A1-WINDOWS-NATIVE-INSTALL` — *candidate only, unverified*).

**One-line confirmation step (outside this cell's scope):** open the corridor card index of the upgrade skill
and select the `DSH-0.1.3-A1-…` card whose subject is the Windows native-dependency install path; record its
full id verbatim in the ticket that carries this report.

---

## 7. Explicitly unconfirmed (not verifiable from the brief + fixture)

1. The exact full corridor card id (§6) — the card index is outside the read whitelist.
2. fs-ext's own file layout (entry filename, `main`/`exports` shape, internal binding path) — not in the
   fixture; Step 4 is written to be layout-agnostic on purpose.
3. Whether fs-ext publishes a usable win32 prebuilt binary upstream — not determinable from the transcript.
   Irrelevant to the plan: the requirement is that the install completes **without** MSVC, and a source build
   on this machine cannot.
4. Whether the repo imports fs-ext APIs beyond `flock` — the fixture shows only `flock`; Step 4 requires a
   repo-wide check before the patch is finalised.
5. Whether the repository uses pnpm 10's `onlyBuiltDependencies`/`neverBuiltDependencies` allowlist and its
   exact contents — Step 5 notes the interaction conditionally, and the fix does not depend on it.
6. How `src/win32.ts` obtains the Win32 bindings (prebuilt FFI loader vs. locally compiled addon) — the
   excerpt shows only the signatures. The plan removes the fs-ext build obligation regardless.
7. The node-pty build requirement on this machine — inferred from the README's patch precedent; not stated.

---

## 8. Acceptance criteria for the fix

- [ ] `pnpm install` on the Windows 11 machine (no VS, no Build Tools, owner refuses) exits **0**.
- [ ] No `node-gyp`/`find VS` invocation for fs-ext during the install.
- [ ] `require('fs-ext')` succeeds on Windows with no compiled binding present.
- [ ] The service boots; the session-persistence plugin loads; the Windows lease path takes the named-semaphore
      branch; no `session.lock` file is created; readers and directory removal work while a write handle is held.
- [ ] No Visual Studio / Build Tools installed; no upstream package content or manifest changed; the only new
      in-repo artifacts are `patches/fs-ext@2.1.1.patch` and the `pnpm-workspace.yaml` registration
      (plus the lockfile update).
- [ ] Linux/macOS CI still builds fs-ext normally and `flock` behaves as before.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.