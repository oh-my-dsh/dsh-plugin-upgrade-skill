# S20 · Windows Install Blocker: fs-ext Native Build the Runtime Never Calls — Diagnosis & Fix Plan

- **Mode**: static diagnosis (plugin-upgrade skill, Mode A · inspect — read-only; this report is the deliverable plan, no repository or fixture change was made)
- **Machine baseline** (`fixture/README.md`): Windows 11, **no Visual Studio / Build Tools** (no `vswhere.exe`, no VS directory), owner refuses to install them; Node + corepack/pnpm work; every previous dsh upgrade installed fine on this machine.
- **Failing upgrade coordinate** (`fixture/manifest-excerpt.json`): `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` pins `"fs-ext": "2.1.1"` (plus dev `@types/fs-ext@2.0.3`). This pin is new in this upgrade — which is why earlier upgrades on the same MSVC-less machine succeeded.
- **Covering corridor card**: **DSH-0.1.3-A1-03** (see §5).

---

## 1. What exactly fails, and why

**Failing package**: `fs-ext@2.1.1` — a native (C++) Node addon.
**Failing step**: its **install lifecycle script** `node-gyp configure build`, run by pnpm during `pnpm install` (`fixture/install-error.log` L3).
**Missing toolchain**: node-gyp's `find VS` probe finds no MSVC toolchain — `msvs_version` not set, `VCINSTALLDIR` not set / not a VS Command Prompt, PowerShell cannot locate Visual Studio 2017+ (log L4–L7) — and aborts with `Could not find any Visual Studio installation to use` (log L11). `fs-ext@2.1.1 install: Failed` (log L12) fails the whole install: `pnpm: Command failed with exit code 1` (log L13), `dsh 退出码: 1` (log L14).

**Why fs-ext is in the graph at all**: it is a hard, exact-pinned dependency of `@deepseek-ai/dsh-session-persistence-jsonl` (manifest-excerpt.json L4–L6), the session-persistence provider of this dsh cohort (0.1.3-alpha.1). It is not optional and not a dev-only tool: `src/lease.ts` — the cross-process write-ownership lock — carries a **static, module-top import** `import { flock } from 'fs-ext'` (`fixture/lease-excerpt.md` L11, and the note at L17–L19).

So the failure is: *install-time native compilation of a pinned dependency requiring MSVC on a machine that has none and will not get one.* This is a packaging/install-surface blocker, not a bug in our plugin code and not a corrupted lockfile.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` would suppress the failing `node-gyp configure build` step and let the install transaction finish — but it cannot deliver the actual goal ("install completes **and the service boots**"), for two reasons grounded in the fixture:

1. **The module must exist and load, not merely install.** `lease-excerpt.md` L17–L19 is explicit: *`flock` is imported statically at module top — the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken.* With scripts skipped, fs-ext's compiled binding (`build/Release/*.node`) is never produced; when the persistence package loads `lease.ts`, the top-level import pulls in fs-ext's entry, which loads the native binding — and throws at **boot** instead of at install. The blocker merely moves from `pnpm install` to service startup; the machine still cannot run dsh. (This is exactly the card's phrasing: "--ignore-scripts cannot skip it — the module must exist and load", DSH-0.1.3-A1-03.)
2. **It is a blunt instrument.** A blanket script skip also disables every other package's legitimate build scripts in this repository — including the already-patched native dependency precedent `patches/node-pty@*.patch` (README.md L7–L10), whose own build must run. It trades one breakage for several.

## 3. Which lock path Windows actually takes — and what that implies

Per the lease source documentation (`fixture/lease-excerpt.md` L3–L8, L15):

- **POSIX**: non-blocking `flock(2)` through fs-ext on a `session.lock` file beside the log.
- **Windows**: the lock is a **named kernel semaphore derived from that path — "never a file lock or handle"**; *"Windows has no lock file at all. Readers never touch the lock."*

`fixture/win32-excerpt.ts` confirms the binding surface: `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle` (L9–L13, L15–L21), wrapped by `acquireLockHandleWin32` / `releaseLockHandleWin32`, with the closing comment L23–L24: *"no flock(2) is involved on Windows."* `lease.ts` imports those wrappers alongside `flock` (lease-excerpt.md L11–L12).

**Implication**: on Windows the fs-ext native module is **dead code at runtime**. It is loaded (static import forces module resolution) but its `flock` branch is never executed — the OS-level lock semantics are fully provided by the named semaphore in `win32.ts`. Therefore:

- The failure is purely an **install/load-surface** problem: we need `fs-ext` to *exist and load* on Windows, not to *work*;
- Replacing its Windows behavior with a pure-JS no-op fallback is **behaviorally lossless** — nothing on the Windows path ever calls `flock`;
- Conversely, any "fix" that keeps the native build requirement (installing VS, prebuilt binaries from the network, etc.) is heavier than the problem warrants, and the machine owner has ruled VS out anyway.

## 4. Fix plan — least-invasive, no Visual Studio, no upstream modification

Follow the repository's **existing patch mechanism for native dependencies** (README.md L7–L10: pnpm `patchedDependencies`, precedent `patches/node-pty@*.patch`, registered in `pnpm-workspace.yaml`). A pnpm patch lives in *our* repository and rewrites the installed package's content at install time — the upstream registry package and its source repository are untouched, nothing is published.

**Patch target**: `fs-ext@2.1.1` (exact pin per manifest-excerpt.json, so the patch key is unambiguous).

**Step 1 — create the patch working copy** (on the Windows machine, in the repo root):

```
pnpm patch fs-ext@2.1.1
```

**Step 2 — two minimal edits inside the patch** (mirrors card DSH-0.1.3-A1-03's recipe):

(a) *Neutralize the install script on Windows only.* Rewrite fs-ext's `install` script (`node-gyp configure build`, per install-error.log L3) so node-gyp runs **only on non-Windows**; on Windows it exits 0 without compiling. Illustrative guard (a small `install-guard.js` or an inline `node -e`):

```js
// run node-gyp only where the native module is actually used
if (process.platform !== 'win32') {
  require('child_process').execFileSync('node-gyp', ['configure', 'build'], { stdio: 'inherit' })
}
// win32: nothing to build — the entry fallback below keeps the module loadable
```

(b) *Give the entry a pure-JS `flock` fallback (warn once, no-op).* Where fs-ext's entry loads the compiled binding, branch on the binding's absence / `process.platform === 'win32'` and export the same API surface with `flock`/`flockSync` as no-ops that warn once and never throw. Illustrative:

```js
let warned = false
function flockNoop(fd, mode, cb) {
  if (!warned) { warned = true; console.warn('[fs-ext patched] flock() is a no-op on Windows: dsh uses the named-semaphore lock path (win32.ts); fs-ext native binding not built.') }
  if (typeof cb === 'function') cb(null)
}
// Windows entry exports flockNoop in place of the native flock; POSIX keeps requiring ./build/Release/*.node unchanged
```

Linux/macOS behavior is untouched: node-gyp still runs there and the native binding still loads — the fallback only exists where the build was skipped.

**Step 3 — land and register the patch**:

```
pnpm patch-commit <pnpm's temp edit dir>
```

which writes `patches/fs-ext@2.1.1.patch` next to the node-pty precedent and registers it in `pnpm-workspace.yaml`. Verify the registration matches the repo's existing shape — per the card recipe, both `patchedDependencies` **and** the build-allow list (`allowBuilds`, the key this repo/pnpm generation uses for permitting lifecycle scripts) name fs-ext:

```yaml
patchedDependencies:
  fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
allowBuilds:
  - fs-ext        # patched install script: real node-gyp on POSIX, no-op on Windows
  # (existing entries such as node-pty remain)
```

**Step 4 — re-run the install and verify** (card A1-03 verification list):

1. `pnpm install` completes with exit code 0 on the MSVC-less machine (no `gyp ERR! find VS`);
2. `node -e "require('fs-ext')"` loads without throwing; calling the `flock` callback path **warns once instead of throwing**;
3. `dsh web --no-open` boots and answers HTTP 200 — proving the static `import { flock } from 'fs-ext'` in `lease.ts` resolves on Windows;
4. Smoke the real lock path once: open a session write handle (named semaphore via `acquireLockHandleWin32`), confirm a second writer is refused while readers/directory listing proceed freely, then release — confirming §3's semantics are intact;
5. Sanity-check the untouched platforms: a POSIX install of the same tree still compiles fs-ext natively (patch guard is platform-conditional).

**Explicit non-goals (per card and task)**: do **not** install Visual Studio / Build Tools; do **not** modify or republish upstream fs-ext or dsh packages (the pnpm patch is repo-local); do **not** rely on `--ignore-scripts` (§2).

**Rollback baseline**: record the current `pnpm-workspace.yaml`, `patches/` listing, and lockfile before editing. Rollback = delete `patches/fs-ext@2.1.1.patch` + its `patchedDependencies`/`allowBuilds` entries, re-run `pnpm install` (returns to the failing baseline on this machine — the baseline itself is the broken state, so rollback is only meaningful when moving to another fix).

**Follow-up (not needed for this fix)**: upstream drops `fs-ext` entirely at 0.1.5-alpha.1 in favor of `@deepseek-ai/node-addon-system` (card **DSH-0.1.5-A1-13**). When this deployment later crosses that corridor edge, retire the fs-ext patch per that card's recipe ("if your install pipeline pinned or rebuilt fs-ext, drop it").

## 5. Covering corridor card

**`DSH-0.1.3-A1-03`** — "breaking: Windows install fails on the `fs-ext` native build (no MSVC); the runtime never calls `flock` on Windows — pnpm-patch recipe", from the 0.1.2-rc.1 → 0.1.3-alpha.1 corridor (`skills/plugin-upgrade/references/v0.1.3-alpha.1.md`; anchored to official git tags `dsh-v0.1.2-rc.1` → `dsh-v0.1.3-alpha.1`, single-host Windows-11-without-MSVC field report 2026-09-07). Every fixture symptom matches the card 1:1: the `gyp ERR! find VS` transcript, the exact `fs-ext@2.1.1` pin inside `dsh-session-persistence-jsonl`, the static `flock` import in `lease.ts` that defeats `--ignore-scripts`, the named-semaphore Windows lock path in `win32.ts`, and the repo's node-pty `patchedDependencies` precedent. The manifest's package version (0.1.3-alpha.1) is exactly this card's corridor edge.

---

### Evidence index

| Claim | Fixture evidence |
|---|---|
| fs-ext@2.1.1 install script = `node-gyp configure build`; VS probe failure; exit 1 | `install-error.log` L3–L14 |
| fs-ext 2.1.1 pinned by `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` | `manifest-excerpt.json` L2–L6 |
| Static top-level `import { flock } from 'fs-ext'`; loader must load fs-ext even on Windows | `lease-excerpt.md` L11, L17–L19 |
| Windows lock = named kernel semaphore, never a file lock; no lock file; readers free | `lease-excerpt.md` L3–L8, L15 |
| `CreateSemaphoreW`/`WaitForSingleObject`/`ReleaseSemaphore` bindings; "no flock(2) … on Windows" | `win32-excerpt.ts` L9–L13, L23–L24 |
| No MSVC and owner refuses; Node/pnpm fine; previous upgrades fine; `patchedDependencies` + `patches/node-pty@*.patch` precedent registered in `pnpm-workspace.yaml` | `README.md` L1–L10 |
| Recipe, verification list, card id | `references/v0.1.3-alpha.1.md` → DSH-0.1.3-A1-03 |
