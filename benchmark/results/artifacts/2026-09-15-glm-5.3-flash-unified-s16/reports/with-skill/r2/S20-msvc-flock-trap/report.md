# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls

Diagnosis of the `pnpm install` failure on the Windows 11 upgrade machine (no Visual
Studio Build Tools, owner refuses to install them). Static diagnosis from the evidence
in `/app/fixture/` (unchanged); fix plan follows the repository's existing patch
precedent. Corridor card: **`DSH-0.1.3-A1-03`**.

---

## 1. What exactly fails, and why

**Package:** `fs-ext@2.1.1`, a pinned dependency of
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`
(`manifest-excerpt.json`: `"dependencies": { "fs-ext": "2.1.1" }`).

**Failing step:** the package's lifecycle install script, `node-gyp configure build`
(`install-error.log` line 3). `fs-ext` is a native addon with no prebuilt binary for
this setup, so install compiles it from source.

**Missing toolchain:** node-gyp cannot find any Visual Studio installation —
`gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer` …
`You need to install the latest version of Visual Studio including the "Desktop
development with C++" workload` (`install-error.log` lines 4–11). The machine facts
(`README.md`) confirm there is no `vswhere.exe` and no VS directory, and that they
will not be installed. node-gyp exits nonzero, pnpm aborts with exit code 1, and the
whole `pnpm install` fails. Every previous dsh upgrade on this machine installed
fine — this is the first upgrade that pulls `fs-ext` into the tree.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

Because the failure is not only a build failure — it is a module-load requirement.
`src/lease.ts` imports the lock at module top level:

```ts
import { flock } from 'fs-ext'
```

and `lease-excerpt.md` states it explicitly: *"the package loader must resolve and
load `fs-ext` even on Windows, where the `flock` branch is never taken."*

`--ignore-scripts` would skip the `node-gyp` script, so `pnpm install` might exit 0 —
but no `fs_ext.node` binary is produced. The first time the session-persistence
package is loaded, the static import resolves `fs-ext`, which tries to load its
missing native binding and throws. The service never boots. The goal is not merely a
green install; it is install **and** boot. A skipped build does not satisfy the
static import; the module must exist and load. (Card `DSH-0.1.3-A1-03` says the same:
"`--ignore-scripts` cannot skip it — the module must exist and load.")

## 3. Which lock path Windows actually takes at runtime, and what that implies

Windows never takes a file lock. Per `lease-excerpt.md`, POSIX takes a non-blocking
`flock(2)` (through fs-ext) on `session.lock`, while *"Windows holds a named kernel
semaphore derived from that path — never a file lock or handle"*; *"Windows has no
lock file at all. Readers never touch the lock."* The bindings in `win32-excerpt.ts`
confirm the implementation: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap
`CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle`, and
the excerpt says outright: *"no flock(2) is involved on Windows."*

**Implication:** on Windows, `fs-ext`'s native `flock` binding is dead code. The
module only needs to **load** (to satisfy the static import) — its compiled flock
implementation is never invoked. Therefore a pure-JS fallback that exports a no-op
`flock` (warn once, invoke the callback / return) is functionally complete for the
Windows runtime, and the native compile is needed only on non-Windows platforms.
That is what makes the least-invasive fix below safe: it removes a build the runtime
never calls, without changing any lock semantics on either platform.

## 4. Fix plan (no Visual Studio, no upstream changes)

The repository already patches native dependencies via pnpm's `patchedDependencies`
mechanism — precedent: `patches/node-pty@*.patch`, registered in `pnpm-workspace.yaml`
(`README.md`: a patch *"can rewrite a package's install script and entry file"*).
Use exactly that mechanism for `fs-ext@2.1.1`.

**Step 1 — Confirm the platform path** (already done in §3): `flock` is the POSIX
branch only; the native module is dead code on Windows.

**Step 2 — Create the patch:**

```bash
pnpm patch fs-ext@2.1.1
# edit the prepared directory as below, then:
pnpm patch-commit <path>
```

Two edits inside the patched copy:

1. **Install script:** replace the bare `node-gyp configure build` install script
   with a guarded runner (e.g. `node scripts/install.js`) that executes
   `node-gyp configure build` only when `process.platform !== 'win32'` and exits 0
   as a no-op on Windows. Result: no compiler is required on Windows; Linux/macOS
   keep the native build.
2. **Entry file:** in the JS entry, guard the native binding load — on `win32`,
   skip `require('./build/Release/fs_ext.node')` and export a pure-JS fallback
   instead: `flock` (and the sync variant) emit one warning and no-op (callback
   invoked with success; sync returns). All other exports pass through unchanged.
   On non-Windows the native binding loads exactly as before.

**Step 3 — Register the patch in `pnpm-workspace.yaml`:** `patch-commit` writes
`patches/fs-ext@2.1.1.patch` and adds it under `patchedDependencies`; also list
`fs-ext` under `allowBuilds` so its (now platform-guarded) build script is still
permitted to run where it applies.

**Step 4 — Reinstall and verify:**

```bash
rm -rf node_modules
pnpm install          # must exit 0 with no Visual Studio present
node -e "require('fs-ext')"   # loads; flock path warns once instead of throwing
dsh web --no-open     # service boots and answers HTTP 200
```

Also verify on a non-Windows checkout that `fs-ext` still compiles natively and
`flock` behaves as before (the patch is win32-only in effect).

**Why this satisfies the constraints**

- **No Visual Studio:** the only failing step on Windows is skipped, not repaired.
- **No upstream modification:** the `fs-ext: 2.1.1` pin in
  `@deepseek-ai/dsh-session-persistence-jsonl` and all upstream sources stay
  untouched; the patch is a local repository overlay, same as the `node-pty`
  precedent.
- **Least invasive:** lock semantics change nowhere — Windows keeps its named
  semaphore path, POSIX keeps `flock`; only dead code on Windows is stubbed.

**Rejected alternatives**

- `pnpm install --ignore-scripts` — leaves the static import unresolvable (§2);
  install may pass but boot fails.
- Install Visual Studio Build Tools — machine owner refuses (`README.md`).
- Patch/replace the upstream dependency or make `lease.ts` import dynamically —
  modifies upstream, explicitly out of scope.

**Maintenance note:** this patch is a stopgap for the 0.1.3-alpha.1 corridor. From
`0.1.5-alpha.1` the dependency disappears upstream (`fs-ext` replaced by
`@deepseek-ai/node-addon-system`, card `DSH-0.1.5-A1-13`); drop
`patches/fs-ext@2.1.1.patch` when upgrading past that release so the local patch
does not outlive its target.

## 5. Corridor card

**`DSH-0.1.3-A1-03`** — "Windows install fails on the `fs-ext` native build; the
runtime never calls `flock` on Windows" (type: breaking, action level:
required-if-hit), in `skills/plugin-upgrade/references/v0.1.3-alpha.1.md`
(0.1.2-rc.1 → 0.1.3-alpha.1 corridor). Its symptoms, root cause, and pnpm-patch
recipe match this fixture exactly, and the troubleshooting table
(`references/troubleshooting.md`, `gyp ERR! find VS` row) routes this symptom to the
same card.
