# S20 · Windows Install Blocker: an `fs-ext` Native Build the Runtime Never Calls

- **Mode**: plugin-upgrade skill, Mode A (read-only static diagnosis; the fix plan is the deliverable — no files outside the fixture and this report were read or changed)
- **Evidence**: fixture files install-error.log, manifest-excerpt.json, lease-excerpt.md, win32-excerpt.ts, README.md (read-only)
- **Corridor**: dsh-v0.1.2-rc.1 → dsh-v0.1.3-alpha.1 (references/v0.1.3-alpha.1.md)
- **Answer**: the failure is card **DSH-0.1.3-A1-03**; the fix is a pnpm patch of `fs-ext@2.1.1` only (platform-guarded install script + pure-JS flock fallback), registered in pnpm-workspace.yaml — no Visual Studio, no upstream changes.

## 1. What exactly fails, and why

**The failing step** (install-error.log): `pnpm install` runs the install script of `fs-ext@2.1.1` — `node-gyp configure build` — which fails at toolchain discovery:

    gyp ERR! find VS msvs_version not set from command line or npm config
    gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer
    gyp ERR! find VS You need to install the latest version of Visual Studio
    gyp ERR! find VS including the "Desktop development with C++" workload.
    gyp ERR! stack Error: Could not find any Visual Studio installation to use

The whole install aborts: `pnpm: Command failed with exit code 1`, and the launcher wrapper records `dsh 退出码: 1`. Nothing after the script step (linking, profile assembly, dsh boot) ever runs.

**The package that pulls the failing module** (manifest-excerpt.json): `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` pins `"fs-ext": "2.1.1"` as a regular dependency (`@types/fs-ext@2.0.3` only carries the TypeScript declarations — irrelevant to the native build).

**Why the toolchain error happens** (README.md): the machine is Windows 11 with **no Visual Studio / Build Tools at all** — no `vswhere.exe`, no VS directory — and the owner refuses to install them. `fs-ext` ships C/C++ sources compiled at install time by `node-gyp`, and on Windows `node-gyp` has no MSVC compiler to invoke. Node and pnpm themselves work fine (README.md: "every previous dsh upgrade on this machine installed fine"), so this is purely a new native-dependency requirement introduced by the 0.1.3-alpha.1 upgrade, not a broken environment.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

Skipping the install script would only suppress the compile — it would leave `fs-ext` **unbuilt**: no `.node` binary exists, so the package is unloadable at runtime, not merely unbuilt. And `fs-ext` cannot be dodged as "unused on Windows":

- The dependency itself must still **install** for `pnpm install` to exit 0; `--ignore-scripts` also skips every other package's lifecycle scripts (the blanket effect hits the whole dependency graph, not just `fs-ext`).
- `lease-excerpt.md` shows the module is **statically imported at module top** of `src/lease.ts`:

      import { flock } from 'fs-ext'

  The excerpt states it explicitly: "the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken." A top-level static import is evaluated before any branch runs, so `@deepseek-ai/dsh-session-persistence-jsonl` fails to load at require/link time on Windows unless a loadable `fs-ext` module exists. The service cannot boot with the package missing — even though the native code it would run is never used on Windows.

This is exactly what card DSH-0.1.3-A1-03 records: "`fs-ext` is a pinned dependency of `@deepseek-ai/dsh-session-persistence-jsonl` and is statically imported from `src/lease.ts`, so `pnpm install --ignore-scripts` cannot skip it — the module must exist and load." Card A1-03's closing rule: do **not** "rely on `--ignore-scripts` alone."

## 3. Which lock path Windows actually takes at runtime — and what that implies

**Windows never takes the flock(2) path.** Per lease-excerpt.md, the cross-process write-ownership lock is arbitrated by the kernel, and the two platforms diverge:

- POSIX: a non-blocking `flock(2)` on `session.lock`, taken **through fs-ext**.
- Windows: "a named kernel semaphore derived from that path — **never a file lock or handle**", so "readers, searches, and directory removal proceed freely while the lock is held"; "**Windows has no lock file at all.** Readers never touch the lock."

win32-excerpt.ts shows what Windows uses instead: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` (plus `MoveFileExW` for the durable-namespace rename, which Node's parent-directory fsync cannot express). "no flock(2) is involved on Windows."

**Implication: the failing native module is dead code on Windows.** The only fs-ext consumer in the excerpt is `flock`, and `flock` is only reachable from the POSIX branch. fs-ext merely has to *exist and load* (the static top-level import in lease.ts forces that) — its compiled flock code is never executed on Windows. So the native build can be skipped on Windows without changing any runtime behavior, as long as a loadable module still answers the import. Card A1-03 states this as the first recipe step: "Confirm the platform path first: on Windows, `lease.ts` takes `acquireLockHandleWin32` … and holds 'never a file lock or handle'; `flock` is only the POSIX branch. The native module is dead code on Windows."

## 4. Fix plan (least-invasive: no Visual Studio, no upstream modification)

Goal restated: `pnpm install` completes on the no-MSVC machine and the service boots — no Visual Studio, no upstream dependency changes. The repository already has a mechanism for exactly this (README.md): it patches native dependencies via pnpm `patchedDependencies` (the existing `patches/node-pty@*.patch` precedent), where "a patch can rewrite a package's install script and entry file, and `pnpm-workspace.yaml` registers it." Card A1-03 prescribes the same: "Add a pnpm patch (the repository already patches native packages this way, e.g. `patches/node-pty@*`)".

### Step 1 — Confirm the platform path (read-only, before patching)

Verify on the machine that Windows takes the semaphore path (recipe step 1 of card A1-03): `lease.ts` routes Windows through `acquireLockHandleWin32`; `flock` is only the POSIX branch. The fixture evidence (lease-excerpt.md, win32-excerpt.ts) already supports this; a five-minute confirmation against the real source tree is cheap insurance.

### Step 2 — Create the patch (upstream copy unmodified; only the local patched copy changes)

Run `pnpm patch fs-ext@2.1.1`, edit the staged copy, then `pnpm patch-commit`. Two changes, both Windows-safe:

**(a) Rewrite the install script** in the staged `fs-ext` `package.json` to build only on non-Windows, e.g.:

    "scripts": {
      "install": "node ./scripts/install-guard.js && node-gyp configure build"

with a two-line `install-guard.js` in the staged copy that exits 0 when `process.platform === 'win32'` and re-invokes `node-gyp` otherwise. The point: `node-gyp configure build` runs on Linux/macOS exactly as before, and on Windows the install script becomes a no-op success.

**(b) Give the entry a pure-JS `flock` fallback** so the statically imported module always loads (card A1-03 recipe step 2: "give the entry a pure-JS `flock` fallback (warn once, no-op)"). Shape:

```js
let flock;
try {
  flock = nativeFlock; // existing binding path
} catch (err) {
  flock = (fd, op, cb) => {
    warnOnce(); // once per process: fs-ext flock unavailable on win32; no-op
    if (typeof cb === 'function') process.nextTick(() => cb(null));
    return 0;
  };
}
export { flock };
```

The fallback is a no-op that warns once, because on Windows `flock` is dead code (Section 3): if it were ever reached, that is a bug to surface, not a lock to fake. Linux/macOS resolve the native binding and are behaviorally untouched.

### Step 3 — Register the patch in pnpm-workspace.yaml

Card A1-03 recipe step 3: "Register the patch in `pnpm-workspace.yaml` (`patchedDependencies` and `allowBuilds`) and re-run `pnpm install`." Concretely:

    patchedDependencies:
      fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
    allowBuilds:
      - fs-ext

(Keep the existing `patches/node-pty@*` entry; the `allowBuilds` entry whitelists the still-real build on POSIX so pnpm's build-scripts approval does not silently skip it.)

### Why this is least-invasive

- **No Visual Studio** — nothing compiles on Windows.
- **Upstream untouched** — `@deepseek-ai/dsh-session-persistence-jsonl` keeps its exact dependency declaration (fs-ext 2.1.1); the pnpm patch mechanism rewrites only the installed copy of `fs-ext` itself, through the repository's own precedent channel (node-pty) — not a fork, not a version bump, not a vendored copy.
- **Lockfile-cohort coherent** — same package, same version; the patch is recorded in the lockfile, and Linux/macOS builds keep the real native module.
- **Reversible** — the patch is one new file plus two pnpm-workspace.yaml keys (rollback in Section 6).

## 5. Corridor card covering this finding

**Card: `DSH-0.1.3-A1-03` — Windows install fails on the `fs-ext` native build; the runtime never calls `flock` on Windows** (type: breaking), from the corridor card set references/v0.1.3-alpha.1.md (`idPrefix: DSH-0.1.3-A1`, corridor `from: dsh-v0.1.2-rc.1` → `to: dsh-v0.1.3-alpha.1`). The fixture matches the card on every coordinate:

- **Symptom match**: card A1-03 — `pnpm install` exits 1, `fs-ext@2.1.1` runs its `node-gyp configure build` install script and fails with `gyp ERR! find VS … You need to install the latest version of Visual Studio (including the Desktop development with C++ workload)`. install-error.log shows exactly this transcript.
- **Dependency match**: card A1-03 — `fs-ext` is a pinned dependency of `@deepseek-ai/dsh-session-persistence-jsonl` and is statically imported from `src/lease.ts`. manifest-excerpt.json shows the pin (`fs-ext: 2.1.1`) at version `0.1.3-alpha.1` — the corridor's target version; lease-excerpt.md shows the static import.
- **Runtime-path match**: card A1-03 — on Windows `lease.ts` takes `acquireLockHandleWin32` (a named kernel semaphore via `CreateSemaphoreW`) and the native module is dead code. win32-excerpt.ts shows those exact bindings.
- **Recipe match**: card A1-03 prescribes the pnpm patch (platform-guarded install script, pure-JS flock fallback, `patchedDependencies` + `allowBuilds` in pnpm-workspace.yaml), which is exactly the plan in Section 4, and matches the repository precedent (patches/node-pty@*) recorded in README.md.
- **Scope fields**: card A1-03 applies to profile wrappers / packaging, action level required-if-hit, touchpoints: none (packaging/install surface) — consistent with this being an install-channel finding rather than an API migration.

Per the skill's corridor rule, the citation is by the `from → to` metadata (0.1.2-rc.1 → 0.1.3-alpha.1), not by filename order; card A1-03 is anchored to the official git tags `dsh-v0.1.2-rc.1` (a66e470204…) and `dsh-v0.1.3-alpha.1` (d347e703908d…), so it does not depend on the release-tarball build identity.

## Validation, residual risk, rollback

### Validation plan (card A1-03 verification + skill validation layers)

1. **Dependency resolution**: `pnpm install` completes (exit 0); the lockfile gains only the patchedDependencies entry / patch hash for fs-ext@2.1.1 — scan for no other graph change; no old-cohort or removed packages appear.
2. **Module load**: `require('fs-ext')` loads on Windows and the flock callback path warns once instead of throwing (card A1-03 verification wording); on a POSIX machine or CI, confirm the native build still runs and a real flock call succeeds.
3. **Enablement/runtime**: `dsh web --no-open` boots and answers HTTP 200 (card A1-03 verification); the profile composition still resolves `@deepseek-ai/dsh-session-persistence-jsonl`, and no required/provided Cordis service remains pending at cold start (skill runtime layer).
4. **Behavior**: one message → tool → response flow through the persistence path (skill behavior layer) — the Windows semaphore lock is exercised, proving the no-op flock fallback is in fact never needed.
5. **Static**: typecheck/build unchanged — `@types/fs-ext@2.0.3` is untouched, so the TypeScript surface does not move.

### Skipped / non-hits

- `pnpm install --ignore-scripts` — rejected as a fix (Section 2), per card A1-03.
- Installing Visual Studio Build Tools — excluded by the machine constraint (README.md) and by card A1-03 (do not install Visual Studio just for this).
- No other corridor card intersects this fixture: the failure is purely the packaging/install surface (A1-03 touchpoints: none), so the session-log, SessionHandle, proxy-policy, and Web-client cards of this corridor are out of scope here.

### Pre-existing failures / residual risk

- Pre-existing (baseline) failures: **not collected** — Mode A inspection, no baseline run was performed (per the skill's reporting template for non-Mode-C tasks).
- The flock fallback is a warn-once no-op: if any code path ever reaches `flock` on Windows, locking silently degrades to a warning rather than a hard failure. Mitigation: the warn-once makes such a path observable; treat any appearance of the warning as a bug (Section 3 shows the path should be unreachable).
- Single-host evidence: card A1-03 itself carries a single-host field report; the POSIX half of the patch (native build still working) is verification-residual on this Windows-only analysis environment.
- The patch must be produced through `pnpm patch` / `pnpm patch-commit` staging; hand-editing installed files under node_modules would be lost on the next install and is not part of this plan.

### Rollback

- Baseline: current HEAD / package versions, the existing lockfile, and pnpm-workspace.yaml as recorded before the change (record hashes/paths per the skill's read-only preparation step). Upstream dependencies are never modified, so there is nothing else to restore.
- Recovery: delete `patches/fs-ext@2.1.1.patch`, remove the `fs-ext@2.1.1` entry from `patchedDependencies` and the `fs-ext` row from `allowBuilds` in pnpm-workspace.yaml, re-run `pnpm install`. This is the exact inverse of the two files the plan touches; no other paths are owned by this task.

