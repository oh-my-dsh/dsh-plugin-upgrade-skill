# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnosis and Fix Plan

Task type: static diagnosis (plugin-upgrade skill, Mode A · inspect — read-only). The fixture
directory was not modified in any way; no installs, builds, or version switches were run.

## 1. What exactly fails, and why

**Failing package and step.** `pnpm install` exits 1 during the *install script* (lifecycle
build) phase of the native package `fs-ext@2.1.1`. From `environment/fixture/install-error.log`:

- `fs-ext@2.1.1 install: node-gyp configure build`
- `gyp ERR! find VS` — `msvs_version not set`, `VCINSTALLDIR not set`, `could not use
  PowerShell to find Visual Studio 2017 or newer`
- `Error: Could not find any Visual Studio installation to use`
- `pnpm: Command failed with exit code 1`

**Why it is pulled in.** `environment/fixture/manifest-excerpt.json` shows
`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` declares `"fs-ext": "2.1.1"` as a
pinned runtime `dependencies` entry (plus `@types/fs-ext` for types). This is the session
persistence layer of the DSH 0.1.3-alpha.1 upgrade — new on this edge, which is why
"every previous dsh upgrade on this machine installed fine" (fixture README).

**Missing toolchain.** The host is Windows 11 with no Visual Studio / Build Tools (no
`vswhere.exe`, no VS directory; the owner refuses to install them — fixture README).
node-gyp's `configure` step cannot locate an MSVC toolchain, so the C++ build of fs-ext
fails and pnpm aborts the whole install. No other package or step is implicated in the log.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` would indeed skip the `node-gyp configure build` lifecycle script — but it
does not make the package usable. `environment/fixture/lease-excerpt.md` states the decisive
fact:

> `flock` is imported statically at module top — the package loader must resolve and load
> `fs-ext` even on Windows, where the `flock` branch is never taken.

The import is `import { flock } from 'fs-ext'` at the top of `src/lease.ts`. ESM static
imports are resolved when the module graph loads, before any branch logic runs. With
`--ignore-scripts`, the `fs-ext` package directory exists but contains no compiled
`.node` binary (its main entry loads the native addon). The moment
`dsh-session-persistence-jsonl` loads on any machine, `require('fs-ext')`/`import 'fs-ext'`
throws `MODULE_NOT_FOUND`/missing-binary, and the service fails at boot instead of at
install — the blocker moves, it does not disappear. So install-time skipping alone is not a
fix; the module must exist *and* load, which is only achievable by giving fs-ext a loadable
(pure-JS) entry on Windows.

## 3. Which lock path Windows actually takes at runtime — and what that implies

From `environment/fixture/lease-excerpt.md` and `environment/fixture/win32-excerpt.ts`:

- POSIX: a non-blocking `flock(2)` on `session.lock`, implemented through `fs-ext`.
- Windows: **never a file lock or handle**. `lease.ts` calls
  `acquireLockHandleWin32`/`releaseLockHandleWin32` from `src/win32.ts`, which wrap a
  **named kernel semaphore derived from the path** via FFI-style Win32 bindings
  (`CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle` — declared
  in `win32-excerpt.ts`). The win32 file states it outright: "no flock(2) is involved on
  Windows." There is not even a lock *file* on Windows ("Windows has no lock file at all").
  The same file also shows the Windows durable-rename path uses `MoveFileExW` — also not
  fs-ext.

**Implication:** the fs-ext native binary is dead code on Windows. The only reason it must
exist is the static top-level import in `lease.ts`; no runtime code path ever calls `flock`
there. Therefore a Windows machine does not need the compiled addon at all — it only needs a
*loadable* `fs-ext` module. That licenses a stub/patch approach rather than a real build.

## 4. Least-invasive fix plan (no Visual Studio, no upstream changes)

The fixture README records the repository's existing precedent: native dependencies are
already patched through pnpm's `patchedDependencies` mechanism (existing
`patches/node-pty@*.patch`, registered in `pnpm-workspace.yaml`), and "a patch can rewrite a
package's install script and entry file." The plan follows that exact mechanism:

1. **Create the patch file** `patches/fs-ext@2.1.1.patch` (generated with
   `pnpm patch fs-ext@2.1.1`), rewriting the package in two places:
   - **Install script** (`package.json` `scripts.install`): run `node-gyp configure build`
     only on non-Windows, e.g. `node -e "if (process.platform !== 'win32')
     process.exit(1)" && node-gyp configure build` or a tiny guard script — on Windows the
     script exits 0 without invoking node-gyp. Linux/macOS keep the native build unchanged.
   - **Entry file** (fs-ext's main module): on Windows, export a pure-JS `flock` fallback
     that warns once and no-ops (calls back without locking), so the static import in
     `lease.ts` resolves and loads. All other exports can be stubbed similarly or left to
     fail-loud if ever called — but per §3 nothing else on the Windows path touches fs-ext.
2. **Register it** in `pnpm-workspace.yaml` under `patchedDependencies`
   (`"fs-ext@2.1.1": "patches/fs-ext@2.1.1.patch"`) and ensure `allowBuilds` (or the
   equivalent onlyBuiltDependencies/neverBuilt list per the repo's existing pattern)
   permits fs-ext's script to run on POSIX while the patched script self-skips on Windows.
3. **Re-run `pnpm install`** on the machine; it must complete with exit 0.
4. **Do not** install Visual Studio, do not fork/patch the upstream fs-ext repository, do
   not change the dependency pin in `dsh-session-persistence-jsonl`, and do not rely on
   `--ignore-scripts` (per §2).

**Verification (per the corridor card's check):**
- `pnpm install` completes;
- `require('fs-ext')` (or dynamic import) loads on Windows and the `flock` callback path
  warns once instead of throwing;
- `dsh web --no-open` boots and answers HTTP 200 — i.e. the session-persistence service
  starts, the per-session write lock engages through the named-semaphore path, and a session
  can be created and reopened (exercising `lease.ts` on both load and lock acquisition).

**Rollback:** remove the two lines registering the patch in `pnpm-workspace.yaml` and delete
`patches/fs-ext@2.1.1.patch`; `pnpm install` returns to upstream behavior (and to failing on
this machine). No upstream or global state is touched at any point.

## 5. Corridor card

**DSH-0.1.3-A1-03** — "Windows install fails on the `fs-ext` native build; the runtime never
calls `flock` on Windows" in the skill's `references/v0.1.3-alpha.1.md` card set
(0.1.2-rc.1 → 0.1.3-alpha.1 corridor). It matches every element of this fixture: the same
gyp ERR! find VS symptom, the same `fs-ext@2.1.1` pin in
`@deepseek-ai/dsh-session-persistence-jsonl`, the static `lease.ts` import defeating
`--ignore-scripts`, the named-semaphore Windows lock path, and the pnpm-patch recipe
(`patches/node-pty@*` precedent, POSIX keeps the native build).

## Report structure per the skill

- **pre-existing**: not collected — static diagnosis task (Mode A); no baseline suite was run
  because the fixture must stay unchanged and the failing machine is not this container.
- **Completed**: full evidence-backed diagnosis (§1–§3, §5) and the fix plan (§4) derived
  from the fixture and the DSH-0.1.3-A1-03 card.
- **Skipped**: no runtime verification of the patch on a real no-MSVC Windows host (not
  available here); no `pnpm patch` execution (would be a write outside the permitted output
  directory and the plan step belongs to the teammate's machine).
- **Pending/residual risk**: the pure-JS `flock` no-op means that if any *future* code path
  ever routes POSIX-style locking through fs-ext on Windows, mutual exclusion would silently
  degrade — the warn-once stub surfaces that. The patch is version-pinned to
  `fs-ext@2.1.1`; a future fs-ext bump needs the patch regenerated. Unverified on the actual
  target machine by this agent.
- **Rollback**: as in §4 — unregister the patch and delete the patch file; nothing else
  changes.
- **Recommendations**: longer term, make `lease.ts` import `fs-ext` lazily/conditionally
  (dynamic import inside the POSIX branch only) upstream, which would remove the Windows
  load requirement entirely without any patch.
