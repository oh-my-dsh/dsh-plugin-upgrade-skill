# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls
## Diagnosis and fix plan (static analysis; `/app/fixture/` untouched)

Evidence base (all quotes from the sealed fixture): `install-error.log`, `manifest-excerpt.json`, `lease-excerpt.md`, `win32-excerpt.ts`, `README.md`. Corridor card content is cited by ID and key points only.

---

## 1. What exactly fails, and why

**Failing package / module.** `fs-ext@2.1.1` — a *pinned runtime dependency* of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`. `manifest-excerpt.json` shows `"dependencies": { "fs-ext": "2.1.1" }` (plus the `@types/fs-ext@2.0.3` devDependency). The version is exact-pinned ("2.1.1"), so pnpm resolves exactly this native package.

**Failing install step.** The dependency's `install` lifecycle script: `install-error.log` shows `fs-ext@2.1.1 install: node-gyp configure build`. `fs-ext` is a native C++ addon; node-gyp must compile it (`configure build`) into a `.node` binary before the package is usable.

**Missing toolchain.** The MSVC C++ toolchain (Visual Studio 2017+ with the "Desktop development with C++" workload, i.e. VS Build Tools). The log's `gyp ERR! find VS` chain states it explicitly: `msvs_version not set from command line or npm config`, `VCINSTALLDIR not set, not running in VS Command Prompt`, `could not use PowerShell to find Visual Studio 2017 or newer`, `You need to install the latest version of Visual Studio including the "Desktop development with C++" workload`, then `stack Error: Could not find any Visual Studio installation to use` → `configure error` → `install: Failed` → `pnpm: Command failed with exit code 1` (`dsh 退出码: 1`).

**Environment corroboration.** `README.md`: Windows 11, **no** Visual Studio / Build Tools (`vswhere.exe` absent), owner refuses to install them; Node + corepack/pnpm work and **every previous dsh upgrade installed fine** — the regression arrives with this dependency set (session-persistence-jsonl pulling `fs-ext`), not with the machine.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

- `--ignore-scripts` only suppresses the failing `node-gyp configure build`; it does not and cannot produce the compiled binding. It converts an *install-time* failure into a *load-time* failure.
- The module must still **resolve and load at runtime**, because `lease-excerpt.md` shows the failing static import at module top: `import { flock } from 'fs-ext'`, and states that "the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken".
- `fs-ext`'s entry requires the native binding to exist; with scripts skipped there is no `fs-ext.node`, so the first boot that loads `src/lease.ts` throws at module resolution/load. Result: `pnpm install` may pass, but **the service cannot boot** — the task's single goal (install completes *and* service boots) is not met. The module must exist and load in a working state (same conclusion as corridor card DSH-0.1.3-A1-03: "the module must exist and load", "--ignore-scripts cannot skip it").

## 3. Which lock path Windows actually takes at runtime — and what that implies

**Windows path (fixture):**
- `lease-excerpt.md`: the write-lock is "a named kernel semaphore derived from that path — **never a file lock or handle**", and "**Windows has no lock file at all.** Readers never touch the lock." The POSIX branch is the non-blocking `flock(2)` on `session.lock` through fs-ext.
- `win32-excerpt.ts`: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle` (plus `MoveFileExW` for the durable publish), and the header states: "no `flock(2)` is involved on Windows."
- The static import is the only Windows touchpoint: `lease-excerpt.md` notes `flock` "is imported statically at module top — the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."

**Implication for the failing native module:** on Windows, `fs-ext`'s compiled addon is **dead code at runtime** — it is statically imported (so it must load) but never called; only POSIX executes `flock`. Therefore Windows does not need a compiled `fs-ext.node` at all; it only needs the package to resolve and load with a safe `flock` placeholder. The entire MSVC build is pure install-channel cost on Windows with zero runtime value there — which is exactly why a local patch can skip it safely on Windows only, while Linux/macOS keep the real native behavior.

## 4. Concrete, least-invasive fix plan (no Visual Studio; no upstream modification)

Follow the repository's existing patch mechanism for native dependencies (`README.md`: `patches/node-pty@*.patch`, registered via pnpm's `patchedDependencies` in `pnpm-workspace.yaml`; "a patch can rewrite a package's install script and entry file"):

1. **Author a pnpm patch for the exact version** — `patches/fs-ext@2.1.1.patch` (via `pnpm patch fs-ext@2.1.1` → edit → `pnpm patch-commit`), containing:
   - **Install-script gate** (`package.json` `scripts.install`): run `node-gyp configure build` **only when `process.platform !== 'win32'`** (replace the script with a tiny `install.js` that spawns node-gyp on non-Windows and exits 0 on Windows). Windows never invokes node-gyp/MSVC; Linux/macOS keep the unmodified native build.
   - **Entry-file pure-JS fallback** (e.g. `fs-ext.js`): keep loading the native binding when it exists (non-Windows), and fall back to a pure-JS `flock` shim on Windows / when the binding is absent — **warn once, then no-op the callback** instead of throwing. This is safe by `3: the Windows lock path never calls `flock`. Do not touch `@types/fs-ext` or any other file.
2. **Register the patch exactly like the node-pty precedent** in `pnpm-workspace.yaml`: `patchedDependencies: fs-ext@2.1.1: patches/fs-ext@2.1.1.patch`, plus the corresponding build-approval entry (`allowBuilds` / `onlyBuiltDependencies`) so pnpm ≥ 10/11 lets the now platform-gated install script run where it is genuinely needed (pnpm blocks dependency build scripts by default).
3. **Re-run `pnpm install`** on the Windows 11 machine — no Visual Studio, no change to the registry-published `fs-ext` or `@deepseek-ai/dsh-session-persistence-jsonl` (upstream untouched), no edits outside `patches/` + `pnpm-workspace.yaml`. The overlay lives in the repo's own patch mechanism — the sanctioned, reversible route (DSH-0.1.3-A1-03 recipe: win32-skip node-gyp + pure-JS fallback, non-Windows keep native).
4. **Verification (all must pass):**
   - `pnpm install` exits 0 on the Windows machine (install-error.log's failure is gone);
   - `require('fs-ext')` loads, and the flock callback path warns once instead of throwing (it is never taken in production on Windows);
   - `dsh web --no-open` boots and answers HTTP 200 — the "service boots" criterion;
   - POSIX sanity (CI or a Linux/mac box): `pnpm install` still performs the native build and `flock` still locks for real — the patch must be Windows-only in effect.
5. **Forward note (not required for the fix):** corridor card DSH-0.1.5-A1-13 records that upstream later replaces `fs-ext`/`@types/fs-ext` with prebuilt `@deepseek-ai/node-addon-system` in session-persistence-jsonl (plus the `native/landlock-run`→`native/system` packaging move). Once this install crosses to dsh 0.1.5-alpha.1 or newer, drop the patch and install the prebuilt addon instead; until then the patch is the sanctioned route.

**Rollback:** delete `patches/fs-ext@2.1.1.patch` and its two `pnpm-workspace.yaml` rows, re-run `pnpm install`. Only those repo-owned paths change; no upstream or fixture content is involved. (Baseline recorded: fixture sealed read-only; the repo's existing `patches/node-pty@*` rows untouched.)

**Out-of-scope / not done:** installing Visual Studio or Build Tools (explicitly refused by the machine owner and forbidden by the task); modifying upstream dependencies; `--ignore-scripts` as the fix; anything outside `/app/fixture/` (read-only) and this `/app/agent-output/`.

## 5. Corridor card

- **Covering card: `DSH-0.1.3-A1-03`** — corridor `dsh-v0.1.2-rc.1 → dsh-v0.1.3-alpha.1` (`references/v0.1.3-alpha.1.md` of the plugin-upgrade skill): "Windows install fails on the `fs-ext` native build (no MSVC); the runtime never calls `flock` on Windows — pnpm-patch recipe". Type: breaking; action level: required-if-hit; surface: packaging/install. Its key points match this finding one-to-one: pinned `fs-ext@2.1.1` in `session-persistence-jsonl`, static import from `src/lease.ts`, Windows routes through `acquireLockHandleWin32` (named semaphore) so `flock` is POSIX-only dead code, and the fix is a repo-local pnpm patch (win32 skips node-gyp + pure-JS `flock` fallback) registered in `pnpm-workspace.yaml`, verified by install + module load + `dsh web` HTTP 200.
- Context (not the covering card): `DSH-0.1.5-A1-13` is the later packaging change that removes the problem at its root (`fs-ext` → `@deepseek-ai/node-addon-system`).

## Evidence map

| Claim | Fixture evidence |
|---|---|
| package + pinned version | `manifest-excerpt.json` (`fs-ext: 2.1.1` under `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`) |
| failing step + toolchain | `install-error.log` (node-gyp configure build → find VS chain → exit 1) |
| static import / must load | `lease-excerpt.md` (top-of-module `import { flock } from 'fs-ext'`) |
| Windows lock = named semaphore | `lease-excerpt.md`, `win32-excerpt.ts` (CreateSemaphoreW … "no flock(2) is involved on Windows") |
| machine constraints + patch precedent | `README.md` (no VS, owner refuses; `patches/node-pty@*.patch` + `patchedDependencies`) |

## run-stats

- toolcalls: 31 invocations in total — 11 `run_code` wrapper calls (1 of which failed at parse and executed nothing) + 20 executed tool calls (3 pwsh, 9 read, 1 grep, 4 write, 2 edit, 1 send_message)
- tokens: n/a (not visible in this harness)
- completion time: 2026-10-21T15:51:39.4525221+08:00 (Asia/Shanghai)
