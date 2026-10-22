# JUDGE BRIEF · skill.S20-msvc-flock-trap

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

**Machine**: Windows 11, Node + corepack/pnpm working, **no Visual Studio / Build Tools** (no `vswhere.exe`, no VS directory) — owner refuses to install them.
**Symptom**: `pnpm install` exits 1 during the upgrade; the service cannot boot.
**Scope of this report**: static diagnosis + fix plan. Nothing in `fixture/` was modified; no upstream dependency is touched; no Visual Studio is installed.

---

## 0. Verdict in one paragraph

The upgrade pulls in `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`, which pins the **native** package `fs-ext@2.1.1`. pnpm runs `fs-ext`'s `install` script (`node-gyp configure build`), node-gyp's *find-VS* phase fails because the machine has no MSVC toolchain, and the whole install transaction aborts. But `fs-ext` is only used for the **POSIX** `flock(2)` branch of the session write lock; on Windows the lock is a **named kernel semaphore** built from `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` (`src/win32.ts`), and Windows "has no lock file at all". The native module is therefore **dead code on Windows**, reached only by a static `import { flock } from 'fs-ext'` at the top of `src/lease.ts`. The fix is the repository's existing native-patch precedent: a pnpm `patchedDependencies` patch of `fs-ext@2.1.1` that (a) runs `node-gyp` only on non-Windows and (b) gives the entry a pure-JS `flock` fallback that warns once and no-ops — so `require('fs-ext')` still loads and the Windows path never calls it. Corridor card: **`DSH-0.1.3-A1-03`**.

---

## 1. What exactly fails, and why

### 1.1 The failing package and the failing step

| Fact | Value | Evidence |
|---|---|---|
| Failing package | **`fs-ext@2.1.1`** (a native / node-gyp addon) | `install-error.log:3` — `fs-ext@2.1.1 install: node-gyp configure build` |
| Failing step | the package's **`install` lifecycle script**, i.e. `node-gyp configure build`, executed by pnpm while materialising the dependency | `install-error.log:3,10,12` (`gyp ERR! configure error`, `Failed`) |
| Failing phase inside node-gyp | **find VS** — toolchain discovery, before any compiler is invoked | `install-error.log:4` — `gyp ERR! find VS` |
| Missing toolchain | **MSVC / Visual Studio Build Tools** with the *"Desktop development with C++"* workload. Three independent discovery routes all fail: no `msvs_version` from CLI/npm config (`:5`), no `VCINSTALLDIR` / not in a VS Command Prompt (`:6`), PowerShell could not find VS 2017+ (`:7`). Final: `Error: Could not find any Visual Studio installation to use` (`:11`) | `install-error.log:5-11` |
| Net effect | the dependency install script exits non-zero → pnpm aborts the transaction → `pnpm: Command failed with exit code 1` → `dsh 退出码: 1` | `install-error.log:12-14` |

### 1.2 Who pulls `fs-ext` in

`manifest-excerpt.json` shows the direct consumer:

```json
{
  "name": "@deepseek-ai/dsh-session-persistence-jsonl",
  "version": "0.1.3-alpha.1",
  "dependencies":     { "fs-ext": "2.1.1" },
  "devDependencies": { "@types/fs-ext": "2.0.3" }
}
```

`fs-ext` is a **pinned, exact** runtime dependency (`"2.1.1"`, no range) of the JSONL session-persistence package at version `0.1.3-alpha.1`, and `@types/fs-ext` is a devDependency of the same package — the dependency is deliberate and typed, not a phantom transitive.

### 1.3 Why the machine never hit this before

`README.md:5-6`: "Node and corepack/pnpm are installed and working; **every previous dsh upgrade on this machine installed fine**." Combined with `manifest-excerpt.json` pinning `0.1.3-alpha.1`, the reading is that this dependency edge (`fs-ext` at an exact pin, from this package version) is **new on this upgrade** — the native build requirement arrived with the cohort being installed; it is not a pre-existing machine defect. Nothing about the machine regressed; the requirement did. (Consistent with card `DSH-0.1.3-A1-03`, which records this exact edge as a *breaking* packaging change on the `0.1.2-rc.1 → 0.1.3-alpha.1` corridor.)

### 1.4 Root cause, stated precisely

> A **POSIX-only** capability (`flock(2)` through `fs-ext`) is bound into the module graph by a **static top-level import**, so on Windows the package must still be *built* (in order to be loadable) even though its functionality is *never invoked*. The install pipeline conflates "must load" with "must compile natively".

---

## 2. Why `pnpm install --ignore-scripts` cannot fix this

`--ignore-scripts` looks like the obvious escape hatch and is the wrong one, for four independent reasons:

1. **It moves the failure from install to boot; it does not remove it.** `lease-excerpt.md:17-19` is explicit: *"`flock` is imported statically at module top — the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."* With the build skipped, `node_modules/fs-ext` contains no compiled addon, so `require('fs-ext')` from `lease.ts` throws at **module-load time** — the first time the session-persistence entry is imported. `pnpm install` would report success and the service would still fail to start. Trading a loud install failure for a silent boot failure is strictly worse.

2. **The flag cannot be attached to the failing invocation.** The transcript shows the failing `pnpm install` is itself a **child process of the dsh toolchain**: `install-error.log:13-14` (`pnpm: Command failed with exit code 1: ... pnpm install` → `dsh 退出码: 1`). There is no call site you own to append `--ignore-scripts` to; the only way to make it stick is a persisted config (`.npmrc` / `pnpm config set ignore-scripts true`), i.e. a permanent, machine-wide, invisible behaviour change.

3. **It is a blanket switch over the whole dependency tree.** `README.md:7-10` records that this repository **already patches native dependencies** via `patchedDependencies` (the `patches/node-pty@*.patch` precedent) — i.e. the tree carries native packages whose install scripts *must* run. Globally ignoring scripts would skip those too, so the machine goes from "one unnecessary native build fails" to "several necessary native builds never happen".

4. **It leaves the load-time contract unsatisfied.** Even if every other script were fine, reason #1 still stands: the module must load. `--ignore-scripts` addresses the *build*, never the *load*.

> **Conclusion**: `--ignore-scripts` is a diagnostic at best ("prove it is the build script, not resolution"), never the fix. The fix must make `fs-ext` **installable and loadable without MSVC on Windows**, while POSIX keeps building natively.

---

## 3. Which lock path Windows actually takes — and what that implies

### 3.1 The two branches

| | POSIX | **Windows** |
|---|---|---|
| Primitive | non-blocking `flock(2)` **through `fs-ext`** on `session.lock` beside the log | **named kernel semaphore derived from that path — never a file lock or handle** |
| Implementation | `fs-ext`'s native binding | `acquireLockHandleWin32` / `releaseLockHandleWin32` from `./win32.ts` |
| Win32 calls | — | `CreateSemaphoreW` (named), `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle` (+ `MoveFileExW` for the durable-namespace publish that replaces the POSIX parent-directory fsync contract, `GetLastError`) |
| On-disk artifact | a `session.lock` file beside the log | **no lock file at all** — readers, searches and directory removal proceed freely while the lock is held |

Evidence: `lease-excerpt.md:3-8` ("POSIX takes a non-blocking `flock(2)` (through fs-ext) on `session.lock` beside the log, and **Windows holds a named kernel semaphore derived from that path — never a file lock or handle**"), `lease-excerpt.md:15` ("**Windows has no lock file at all.** Readers never touch the lock."), `lease-excerpt.md:11-12` (the two imports side by side), and `win32-excerpt.ts:9-13,23-24` (`CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle` signatures; "acquireLockHandleWin32 / releaseLockHandleWin32 wrap these named-semaphore primitives; **no flock(2) is involved on Windows**").

`win32-excerpt.ts` never references `fs-ext` at all — the Win32 bindings are plain function signatures (`MoveFileExW`, `CreateSemaphoreW`, …) resolved by the module's own FFI layer. The excerpt does not show that loader, but it shows no path from `win32.ts` back into `fs-ext`.

### 3.2 What that implies about the failing native module

1. **On Windows, `fs-ext`'s compiled addon is never executed.** `flock` is the POSIX branch only; the Windows branch is semaphore-only. The native code is dead code on this machine.
2. **The only thing Windows actually needs from `fs-ext` is loadability.** `lease.ts` imports `flock` statically at module top, so the package must resolve, its entry must execute, and `flock` must be an exported callable — but it will never be called.
3. **Therefore removing the native build on Windows is behaviour-preserving.** It cannot change locking semantics, because no Windows code path reaches the binding. The risk surface of the fix is limited to "does `require('fs-ext')` still succeed, and does the entry still export a `flock` of the right shape" — which is exactly what the patch below guarantees.
4. **Corollary for the fallback**: the pure-JS `flock` must **not throw** and must not silently pretend to hold a lock either. It should warn **once** and invoke the callback as a no-op (success), so any accidental POSIX-branch invocation on Windows is loud in the log and non-fatal, rather than crashing the host.

---

## 4. Fix plan — least-invasive, no MSVC, no upstream changes

### 4.1 Principle

Follow the repository's existing mechanism for exactly this class of problem (`README.md:7-10`): **pnpm `patchedDependencies`**. A patch can rewrite a package's install script **and** its entry file, and `pnpm-workspace.yaml` registers it. This changes nothing upstream, nothing in the host's own source, and nothing on POSIX.

**Chosen target: patch the leaf `fs-ext@2.1.1`** — not `@deepseek-ai/dsh-session-persistence-jsonl`. Patching the leaf is smaller (one package, no host semantics), fixes every consumer of `fs-ext` at once, and leaves `lease.ts`'s static import untouched (so no lazy-import refactor of host source is needed).

### 4.2 Step 1 — create the patch

Run from the workspace root that owns the failing install (see §4.4 for how to identify it):

```bash
pnpm patch fs-ext@2.1.1          # extracts the package into a temp dir and prints its path
```

Edit **two** things in the extracted package.

**(a) Neutralise the native build on Windows** — in the package's `package.json`:

```diff
-  "scripts": { "install": "node-gyp configure build" }
+  "scripts": { "install": "node ./scripts/install-win32-guard.js" }
```

with a new `scripts/install-win32-guard.js` added by the same patch:

```js
// fs-ext install guard (S20): build natively only where flock is actually used.
const { execSync } = require('node:child_process')
if (process.platform === 'win32') {
  console.log('[fs-ext] win32: skipping node-gyp (flock is the POSIX branch; the session lock uses the Win32 named-semaphore path).')
  process.exit(0)
}
execSync('node-gyp configure build', { stdio: 'inherit' })
```

> If your pnpm version's `pnpm patch` cannot add new files, use the inline equivalent — a single-line script is enough:
> `"install": "node -e \"if(process.platform!=='win32'){require('child_process').execSync('node-gyp configure build',{stdio:'inherit'})}else{console.log('[fs-ext] win32: skipping node-gyp')}\"`
> *(Confirm the exact `install` value and the exact loader file against the extracted `fs-ext@2.1.1` tarball while you are inside `pnpm patch` — the fixture deliberately does not include `fs-ext`'s own sources.)*

**(b) Make the entry loadable without the compiled addon** — in the package's main entry (`lib/fs-ext.js`; verify the path from `package.json` `main` at patch time):

```diff
-module.exports = require('../build/Release/fs-ext.node')
+let native = null
+try { native = require('../build/Release/fs-ext.node') } catch { native = null }
+
+let warned = false
+function flockFallback(fd, operation, callback) {
+  if (!warned) {
+    warned = true
+    console.warn('[fs-ext] flock unavailable on this platform (no native build); ' +
+      'Windows uses the Win32 named-semaphore lock path and never calls flock.')
+  }
+  if (typeof callback === 'function') process.nextTick(callback, null)
+  return flockFallback
+}
+
+module.exports = native
+  ? Object.assign({}, native, { flock: native.flock ?? flockFallback })
+  : { flock: flockFallback }
```

Properties this buys, all of them required:

- `require('fs-ext')` **succeeds** with no `build/Release/fs-ext.node` present → `lease.ts`'s static import resolves on Windows.
- `flock` is still an **exported callable with the original `(fd, operation, callback)` shape** → `@types/fs-ext@2.0.3` still type-checks, no dsh source change, no type drift.
- The fallback **warns once** and **does not throw**, so an accidental POSIX-branch call on Windows is visible but non-fatal.
- On Linux/macOS the native addon loads and **`native.flock` wins** — the `Object.assign` keeps the real binding; behaviour is unchanged. POSIX must be re-verified, not assumed.

Commit the patch:

```bash
pnpm patch-commit <temp-dir>     # writes patches/fs-ext@2.1.1.patch
```

### 4.3 Step 2 — register it

In the `pnpm-workspace.yaml` of the workspace whose `pnpm install` fails:

```yaml
patchedDependencies:
  fs-ext: patches/fs-ext@2.1.1.patch
```

and reconcile `allowBuilds` with the patched script:

- If `fs-ext` **is** listed under `allowBuilds`, keep it — the patched script is a no-op on win32, so pnpm runs it and it exits 0. This keeps one shared workspace file correct on **both** platforms (Linux/macOS still compile natively).
- If `fs-ext` is **not** listed, pnpm skips the script entirely (it prints `Ignored build scripts: fs-ext@2.1.1`), which is equally fine on Windows.

Either way the outcome is the same: **no node-gyp invocation on Windows, native build preserved elsewhere**. Do not "fix" this by removing `fs-ext` from `allowBuilds` *and* relying on the unpatched script — that only hides the build, it does not make the module loadable (§2, reason 1).

> Note on YAML keys: `patchedDependencies` / `allowBuilds` keys containing a leading `@` must be quoted, or they silently fail to match the allowlist. `fs-ext` has no leading `@`, but keep the quoting habit when adding rows for scoped native packages.

### 4.4 Step 3 — make sure the patch lands in the workspace that actually installs

`install-error.log:13` shows the failing `pnpm install` is a **child of the dsh toolchain**. That inner install may run against a **profile** workspace (`$DSH_HOME/profiles/<name>/pnpm-workspace.yaml`), not the repository root — profiles carry their own `pnpm-workspace.yaml` with their own `allowBuilds` map. Before committing the fix, determine which workspace owns the failing transaction:

- if it is the **repository root** → §4.2–§4.3 as written;
- if it is a **profile** workspace → copy `patches/fs-ext@2.1.1.patch` there and add the same `patchedDependencies` row to that profile's `pnpm-workspace.yaml` (or point its patch path at the repository's `patches/` file), so the profile install is patched too;
- keep the copies **byte-identical** and re-sync whenever `fs-ext` is bumped — a stale patch silently stops applying and the MSVC failure returns.

### 4.5 Step 4 — verify (acceptance criteria for "the plan works")

| # | Check | Pass condition |
|---|---|---|
| 1 | `pnpm install` on the Windows 11 machine | completes, exit 0; log shows **no** `node-gyp` run for `fs-ext` (either `win32: skipping node-gyp` from the guard, or `Ignored build scripts: fs-ext@2.1.1`) |
| 2 | `node -e "const f=require('fs-ext'); console.log(typeof f.flock)"` | prints `function`; no `MODULE_NOT_FOUND` |
| 3 | the warning path | first `flock` call logs the one-time warning and the callback fires without throwing; a second call does **not** re-warn |
| 4 | patch actually applied | `pnpm install` output mentions the patched dependency; `node_modules/fs-ext/package.json` shows the patched `install` script, not `node-gyp configure build` |
| 5 | POSIX non-regression | on a Linux/macOS machine with the same patch: `pnpm install` still compiles `fs-ext` natively, `require('fs-ext').flock` is the **native** binding, and an exclusive lock on a `session.lock` file still behaves as before |
| 6 | service boot | `dsh web --no-open` boots and answers HTTP 200 |
| 7 | host typecheck | `@types/fs-ext@2.0.3` still resolves; no new type errors from the patched entry |

### 4.6 Explicitly rejected alternatives

| Alternative | Why rejected |
|---|---|
| Install Visual Studio Build Tools | Machine owner refuses (`README.md:3-4`); card `DSH-0.1.3-A1-03` says "Do not install Visual Studio just for this". Also installs a multi-GB toolchain to compile code that Windows never executes. |
| `pnpm install --ignore-scripts` | §2 — moves the failure to boot, cannot be attached to the dsh-spawned install, breaks the repo's other native builds. |
| Fork / vendor `fs-ext`, or patch it upstream | Task forbids modifying upstream dependencies; also unnecessary — pnpm's patch layer already provides the exact seam. |
| Lazy-load `flock` in `src/lease.ts` (make the import dynamic on the POSIX branch) | Would require changing host source (the `@deepseek-ai/dsh-session-persistence-jsonl` package) — a larger, semantic change to the module graph — and it still leaves `fs-ext`'s install script failing on Windows. The leaf patch is strictly smaller. |
| Add `fs-ext` to `onlyBuiltDependencies` / fetch a prebuilt binary | npm-side vocabulary, and there is no prebuilt `fs-ext` binary to fetch; the native artefact is not needed on Windows at all. |
| Upgrade the cohort to drop `fs-ext` | Effective eventually — card `DSH-0.1.5-A1-13` records `fs-ext` being replaced by `@deepseek-ai/node-addon-system` — but that is a **much** larger, riskier upgrade, not a least-invasive fix for this blocker. Worth tracking as a follow-up so the patch can be deleted when the cohort moves. |

### 4.7 Risk / rollback

- **Blast radius**: one leaf package's install script + entry, on Windows only; the POSIX code path is untouched.
- **Rollback**: delete the `patchedDependencies` row (and the patch file) and re-run `pnpm install` — the tree returns to its current failing state, i.e. rollback is trivially safe because the current state is already a known failure.
- **Watch item**: if a future `fs-ext` bump changes the entry file or the `install` script, the patch stops applying. Detect it via check #4 above (inspect `node_modules/fs-ext/package.json` after install) rather than assuming.

---

## 5. Corridor card

**`DSH-0.1.3-A1-03` · "Windows install fails on the `fs-ext` native build; the runtime never calls `flock` on Windows"**

- **Corridor / edge**: `dsh-v0.1.2-rc.1 → dsh-v0.1.3-alpha.1` (card set `references/v0.1.3-alpha.1.md`, `idPrefix: DSH-0.1.3-A1`, `cardCount: 8`, `status: draft`, `coverage: curated`, `verifiedAt: 2026-09-05`).
- **Type**: breaking · **Applies to**: profile wrappers / packaging; any Windows machine without Visual Studio Build Tools upgrading to 0.1.3-alpha.1 · **Touchpoints**: none (packaging/install surface) · **Action level**: required-if-hit.
- **Why this card is the right one**: its symptom line is verbatim this fixture — `pnpm install` exits 1, `fs-ext@2.1.1` runs `node-gyp configure build` and fails with `gyp ERR! find VS … You need to install the latest version of Visual Studio (including the "Desktop development with C++" workload)`; `fs-ext` is a pinned dependency of `@deepseek-ai/dsh-session-persistence-jsonl` and is statically imported from `src/lease.ts`, so `pnpm install --ignore-scripts` cannot skip it — the module must exist and load. Its recipe is the three steps executed in §4 (confirm the Win32 semaphore path → add the pnpm patch that runs node-gyp only on non-Windows with a pure-JS `flock` fallback that warns once → register in `pnpm-workspace.yaml` `patchedDependencies`/`allowBuilds` and re-run install), and its verification list is §4.5. Its recorded source anchors match `manifest-excerpt.json` exactly (`"fs-ext": "2.1.1"` pinned, `src/lease.ts` static import, `src/win32.ts` named-semaphore bindings, single-host Windows-11-without-MSVC field report).
- **Supporting references** (same knowledge base, not the primary card):
  - `references/troubleshooting.md` — the Windows `gyp ERR! find VS` / `fs-ext` row points at `DSH-0.1.3-A1-03` and states the same reasoning (`--ignore-scripts` cannot skip the module load; Windows runs the named kernel semaphore; `flock` is POSIX dead code; fix via the repo's pnpm-patch precedent).
  - `DSH-0.1.5-A1-13` (packaging: `fs-ext` replaced by `@deepseek-ai/node-addon-system`) — the forward direction, relevant only to the "delete the patch later" follow-up in §4.6.
  - `references/rollup-0.1.2.md` R-08 — install-channel pitfalls (mirror lag, pnpm supply-chain `minimumReleaseAge`, peer-floor prerelease semantics) to rule out *before* blaming the patch; this is a Windows-native failure so none of those apply, but they are the first thing to check if the patched install then fails for a different reason.

---

## 6. Evidence index

| Claim | Source |
|---|---|
| `fs-ext@2.1.1` is the failing package; the failing step is its `install` script `node-gyp configure build` | `fixture/install-error.log:3` |
| Missing toolchain is MSVC / VS Build Tools with the C++ workload | `fixture/install-error.log:4-11` |
| Install aborts and dsh propagates exit code 1 | `fixture/install-error.log:12-14` |
| `fs-ext` is an exact-pinned runtime dep of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` | `fixture/manifest-excerpt.json:2-5` |
| `@types/fs-ext@2.0.3` is a devDep of the same package (typed, deliberate dep) | `fixture/manifest-excerpt.json:7-9` |
| Windows lock = named kernel semaphore, never a file lock or handle; no lock file at all | `fixture/lease-excerpt.md:3-8,15` |
| `flock` is statically imported at module top; `fs-ext` must load even on Windows | `fixture/lease-excerpt.md:11,17-19` |
| Win32 lock built from `CreateSemaphoreW`/`WaitForSingleObject`/`ReleaseSemaphore`/`CloseHandle`; no `flock(2)` on Windows; `win32.ts` never touches `fs-ext` | `fixture/win32-excerpt.ts:9-13,23-24` |
| Machine has no VS / vswhere; owner refuses to install; previous upgrades installed fine | `fixture/README.md:3-6` |
| Repo's existing native-patch precedent: `patchedDependencies` + `patches/node-pty@*.patch`; a patch can rewrite install script and entry file; `pnpm-workspace.yaml` registers it | `fixture/README.md:7-10` |
| Card id, symptom text, three-step recipe, verification list, source anchors | skill `references/v0.1.3-alpha.1.md`, card `DSH-0.1.3-A1-03` (lines 130–161) |

**Assumptions / limits of the evidence** (flagged rather than guessed):

- The fixture does not include `fs-ext@2.1.1`'s own sources, so the exact `install` script string and the exact main-entry path in §4.2 must be confirmed inside `pnpm patch` against the extracted tarball. The *behaviour* the patch must produce is fixed by the evidence; the literal file/line targets are not.
- `win32-excerpt.ts` shows the Win32 function signatures but not the FFI loader that resolves them; the conclusion "no `fs-ext` involvement on the Windows path" rests on the absence of any `fs-ext` reference in that file plus the explicit "no flock(2) is involved on Windows" comment, not on seeing the loader.
- Whether the failing `pnpm install` runs in the repository root or in a profile workspace is not determinable from the fixture; §4.4 makes that an explicit pre-flight check rather than an assumption.
- `fixture/` was read only; no files outside `agent-output/` were created, modified, or deleted in producing this report.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.