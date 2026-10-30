# S20 · Windows Install Blocker — Diagnosis & Fix Plan (static, evidence-only)

**Scope.** Static diagnosis from `/app/fixture/` only; the fixture was not modified (hash-verified against `fixture-hash-before.json`). No Visual Studio installation and no upstream edits appear anywhere in the plan.

**One-line answer.** `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` hard-depends on the native addon `fs-ext@2.1.1`, whose `install` script (`node-gyp configure build`) requires MSVC that this Windows 11 machine does not have and will not get; yet on Windows the flock code path fs-ext exists for is **never executed** (the win32 lock is a named kernel semaphore). Fix: a pnpm `patchedDependencies` patch on `fs-ext@2.1.1` — the repo's existing native-dependency patch mechanism (the `patches/node-pty@*.patch` precedent) — that (a) makes the install script a no-op on win32 and (b) makes the entry file export stubs on win32 instead of loading the never-built `.node` binary, so the plugin's top-level static `import { flock } from 'fs-ext'` still resolves and the service boots.

---

## 1. What exactly fails, and why

**Package / step / toolchain, from `install-error.log`:**

- The failing unit is **`fs-ext@2.1.1`**, and the failing step is its **`install` lifecycle script**: the log line `fs-ext@2.1.1 install: node-gyp configure build` shows pnpm running fs-ext's install script, which drives node-gyp.
- node-gyp dies in toolchain discovery, not compilation: `gyp ERR! find VS … could not use PowerShell to find Visual Studio 2017 or newer` → `gyp ERR! stack Error: Could not find any Visual Studio installation to use` → `gyp ERR! configure error` → `fs-ext@2.1.1 install: Failed`.
- pnpm then aborts the whole install (`Command failed with exit code 1`) and the dsh upgrade wrapper reports `dsh 退出码: 1`. So the **entire `pnpm install` / dsh upgrade is blocked by this one native build**.
- Why MSVC is demanded at all: fs-ext is a C++ native addon (POSIX `flock(2)`/`fcntl` bindings); building it on Windows requires the MSVC "Desktop development with C++" toolchain. Per `README.md`, the machine has **no Visual Studio / Build Tools at all** (no `vswhere.exe`, no VS directory) and **the owner refuses to install them** — while Node/corepack/pnpm work and *every previous dsh upgrade installed fine*, i.e. this is a newly introduced dependency, not a machine regression.
- Who pulls it in: `manifest-excerpt.json` shows **`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`** declaring **`"dependencies": { "fs-ext": "2.1.1" }`** (plus `@types/fs-ext` as a dev-only type package, which builds nothing). The session-persistence plugin is what drags the MSVC requirement into a Windows machine.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

- The goal is not merely "install exits 0" but "**install completes *and the service boots***". `--ignore-scripts` achieves only the first half: it skips fs-ext's `node-gyp configure build`, so nothing is ever compiled and **no `build/Release/*.node` binary exists** in the installed fs-ext.
- fs-ext's entry module loads that native binding at require time. And `lease-excerpt.md` states the killer fact: the plugin's lock module does
  ```ts
  import { flock } from 'fs-ext'
  ```
  **statically at module top**, with the explicit note: "*the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken*". A static top-level import is evaluated when the plugin module is loaded — unconditionally, on every platform.
- Therefore, with `--ignore-scripts`, booting dsh on Windows loads the session-persistence plugin → resolves `fs-ext` → fs-ext tries to load its missing `.node` binary → `MODULE_NOT_FOUND`-class crash **at startup**. The flag merely moves the failure from install time to boot time; the machine ends up with a broken install, not a working service.
- Secondary defects: the flag is per-invocation and not durable (every teammate/CI/future upgrade must remember it); it is a blunt instrument that disables **all** packages' lifecycle scripts, silently breaking any other dependency that legitimately needs a postinstall step; and it does nothing to make the loaded `fs-ext` module resolvable, which is the actual boot blocker.

## 3. Which lock path Windows actually takes at runtime — and what that implies

From `lease-excerpt.md` + `win32-excerpt.ts`:

- **POSIX**: non-blocking `flock(2)` on a `session.lock` file beside the log — the only path that uses fs-ext.
- **Windows**: the lock is a **named kernel semaphore derived from the session path** — "*never a file lock or handle*", and "***Windows has no lock file at all***". `win32-excerpt.ts` confirms the binding surface is pure Win32 API — `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle` (plus `MoveFileExW` for the durable-rename publish step) — and its closing comment: "*acquireLockHandleWin32 / releaseLockHandleWin32 wrap these named-semaphore primitives; **no flock(2) is involved on Windows***". Readers never touch the lock; searches and directory removal proceed freely while it is held.

**Implication for the failing native module:** on Windows, fs-ext's compiled code is **never executed at runtime — not once**. Its only Windows "function" is being *resolvable/loadable* because of the top-level static import in `lease.ts`. The MSVC build is therefore demanded for a module whose entire reason to exist on Windows is the import statement itself. This is the trap: a hard install-time dependency (native build) on a package with **zero runtime value on this platform**. Consequently, any mechanism that makes `require('fs-ext')` succeed on Windows without a real binary — with stubs that would throw only if actually called (they never are) — is functionally lossless on Windows, while POSIX keeps the real build and the real `flock`.

## 4. Fix plan — least-invasive, no Visual Studio, no upstream modification

**Mechanism: the repository's existing native-dependency patch precedent.** `README.md`: the repo already patches native dependencies through pnpm's **`patchedDependencies`** mechanism (`patches/node-pty@*.patch`), and "*a patch can rewrite a package's **install script** and **entry file**, and `pnpm-workspace.yaml` registers it*". node-pty is itself a node-gyp/MSVC native addon that installs fine on this machine — proof the mechanism already solves exactly this class of problem here. We apply the same two-point rewrite to `fs-ext@2.1.1`. Patching through pnpm is declarative, version-controlled, reproducible for every teammate/CI, pinned by the lockfile, and touches **no upstream source and no hand-edited node_modules**.

**Step 1 — open a patch workspace** (teammate machine, repo root):

```
pnpm patch fs-ext@2.1.1
```

pnpm prints a temp edit directory seeded with the pristine package.

**Step 2a — rewrite the install script** (kills the MSVC requirement). In the patch dir's `package.json`, replace

```json
"scripts": { "install": "node-gyp configure build" }
```

with `"install": "node install.js"` and add `install.js`:

```js
// install.js — added by patches/fs-ext@2.1.1.patch
const { spawnSync } = require('node:child_process')
if (process.platform === 'win32') {
  // Windows dsh lock path = named kernel semaphore (src/win32.ts); flock(2) is
  // never called on Windows, so no native binary is needed there.
  console.log('[fs-ext patched] win32: skipping node-gyp build (no MSVC required)')
  process.exit(0)
}
const r = spawnSync('node-gyp', ['configure', 'build'], { stdio: 'inherit' })
process.exit(r.status ?? 1)   // POSIX behaviour unchanged
```

**Step 2b — rewrite the entry file** (makes the static import loadable without a binary). In fs-ext's `main` file (`fs-ext.js`), gate the native-binding load:

```js
// top of entry, added by the patch
if (process.platform === 'win32') {
  const unavailable = (name) => () => {
    throw new Error('[fs-ext patched] ' + name + '() is unavailable on Windows: ' +
      'native build skipped (no MSVC); the win32 lock path uses named semaphores and never calls flock')
  }
  module.exports = { flock: unavailable('flock') /* …same stub for the other exports… */ }
} else {
  /* …original entry body untouched: load build/Release binding, export real functions… */
}
```

Design points: the win32 stubs **throw if ever called** (fail-loud, not fail-silent) — safe because §3 proves they are never called on Windows; POSIX keeps byte-identical behaviour (real build + real `flock`), so the same patched dependency is correct on every platform and nothing in the plugin's own code changes.

**Step 3 — commit the patch:**

```
pnpm patch-commit <temp-dir-from-step-1>
```

→ produces `patches/fs-ext@2.1.1.patch` (sibling of the node-pty precedent).

**Step 4 — register it where the repo registers patches** (`README.md`: `pnpm-workspace.yaml`):

```yaml
patchedDependencies:
  node-pty@<existing>: patches/node-pty@<existing>.patch   # existing precedent, untouched
  fs-ext@2.1.1: patches/fs-ext@2.1.1.patch                 # NEW
```

(If this repo's pnpm version keeps `patchedDependencies` under the `pnpm` key of the root `package.json` instead, follow wherever the existing node-pty entry lives — the precedent, not the file name, is the contract.)

**Step 5 — reinstall and verify** (all local, no VS):

```
pnpm install        # no --ignore-scripts; fs-ext install step now exits 0 on win32
```

Verification checklist:
1. `pnpm install` exits 0 with no `gyp ERR! find VS` output; lockfile records the patched fs-ext hash.
2. dsh service boots; the session-persistence plugin loads — i.e. `import { flock } from 'fs-ext'` resolved against the stub entry with no `.node` file present.
3. Functional lock check on Windows: start a writer on a session artifact dir (acquires the named semaphore via `acquireLockHandleWin32`), confirm a second writer is excluded while readers/search/dir-removal still succeed, and the lock releases cleanly — proving the semaphore path was never dependent on fs-ext.
4. Sanity on a POSIX box (or CI): install still runs node-gyp there and `flock` still works — the patch is platform-gated, not platform-destructive.

**Rejected alternatives (and why they are worse):**
- *Install VS Build Tools* — explicitly refused by the machine owner; constraint.
- *`--ignore-scripts`* — §2: install "succeeds" but boot crashes on the unresolvable native binding; non-durable; disables all packages' scripts.
- *Fork/republish fs-ext or the plugin, or hand-edit node_modules* — modifies upstream / is unreproducible; violates the "no upstream modification" constraint and the repo's patch discipline.
- *Patch the plugin (`@deepseek-ai/dsh-session-persistence-jsonl`) to make the flock import lazy* — would also work in theory, but it rewrites a **non-native** upstream package's compiled code (more invasive, further from the node-pty precedent, which is specifically for **native dependencies**), and leaves fs-ext's install script still demanding MSVC — the install blocker itself would remain.
- *Remove `fs-ext` from the dependency tree (overrides/resolutions)* — breaks the POSIX lock path and modifies the plugin's effective manifest; not least-invasive.

## 5. Corridor card

**`DSH-0.1.3-A1-msvc-flock-trap`**

Derivation and honest caveat: the card id encodes the affected release — `manifest-excerpt.json` pins the finding to `@deepseek-ai/dsh-session-persistence-jsonl` **`0.1.3-alpha.1`** → prefix `DSH-0.1.3-A1-` (matching the id format given in the task, `DSH-0.1.3-A1-…`), and the covered finding is the MSVC/flock trap diagnosed above (native `fs-ext` build demanded at install on Windows while the win32 named-semaphore lock path never calls `flock`). This cell runs the **noskill arm**, whose readable material is the fixture only — the corridor index itself is not among the in-cell documents — so the slug portion is reconstructed from the task's own naming (`S20-msvc-flock-trap`) and should be reconciled against the corridor index by the skill arm; the prefix `DSH-0.1.3-A1-` follows directly from the fixture-pinned version.

---

## Evidence map

| Claim | Fixture source |
|---|---|
| fs-ext@2.1.1 install script = `node-gyp configure build`; VS discovery failure; install exit 1; dsh exit 1 | `install-error.log` |
| No VS/Build Tools on machine; owner refuses; prior upgrades installed fine | `README.md` |
| patchedDependencies precedent (`patches/node-pty@*.patch`), patch may rewrite install script + entry file, registered in `pnpm-workspace.yaml` | `README.md` |
| `fs-ext@2.1.1` is a runtime dependency of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` | `manifest-excerpt.json` |
| Static top-level `import { flock } from 'fs-ext'`; loader must resolve fs-ext even on Windows | `lease-excerpt.md` |
| Windows lock = named kernel semaphore, never a file lock/handle; no lock file on Windows; readers never touch it | `lease-excerpt.md` |
| Win32 bindings are CreateSemaphoreW/WaitForSingleObject/ReleaseSemaphore/CloseHandle (+MoveFileExW); "no flock(2) is involved on Windows" | `win32-excerpt.ts` |

*Fixture integrity: all five fixture files re-hashed (SHA-256) after this analysis and identical to `fixture-hash-before.json`; nothing outside `/app/agent-output/` was written.*
