# S20 · Windows install blocker: `fs-ext` native build without MSVC — diagnosis and fix plan

**Task type:** static diagnosis + fix plan (no install executed here; `fixture/` read-only, unchanged).
**Machine:** Windows 11, **no Visual Studio / Build Tools** (owner refuses) — `fixture/README.md:1-4`.
**Goal:** let `pnpm install` complete and the service boot on that machine, with **no Visual Studio** and **no upstream dependency modification**.

---

## 0. Verdict (TL;DR)

`pnpm install` dies in the **dependency build phase**: the pinned native package **`fs-ext@2.1.1`** runs its `node-gyp configure build` install script and node-gyp aborts with `gyp ERR! find VS` because no MSVC toolchain exists on the machine (`fixture/install-error.log:3-13`). `fs-ext@2.1.1` is pulled in as a **direct, exactly-pinned dependency of `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`** (`fixture/manifest-excerpt.json:1-6`).

The irony is the whole point: on Windows the runtime **never calls `flock`**. `lease.ts` routes Windows through `acquireLockHandleWin32` — a **named kernel semaphore** (`CreateSemaphoreW`) — and the source doc states Windows holds *"never a file lock or handle"* and *"Windows has no lock file at all"* (`fixture/lease-excerpt.md:3-16`, `fixture/win32-excerpt.ts:8-24`). The `flock(2)` branch is POSIX-only dead code on Windows.

But `flock` is a **static top-level import** in `lease.ts` (`fixture/lease-excerpt.md:11`), so the module must **exist and load** even on Windows — which is exactly why `pnpm install --ignore-scripts` cannot rescue the install.

**Fix:** add a **pnpm patch** for `fs-ext@2.1.1` that (a) makes the install script a **no-op on win32** and (b) gives the entry a **loadable pure-JS `flock` fallback**, then register it via `patchedDependencies` / `allowBuilds` in `pnpm-workspace.yaml` — the repository's **existing precedent for native dependencies** (`patches/node-pty@*.patch`, `fixture/README.md:7-10`). No Visual Studio, no upstream edit.

**Card:** `DSH-0.1.3-A1-03` (corridor `dsh-v0.1.2-rc.1 → dsh-v0.1.3-alpha.1`). For the later upstream packaging change that removes `fs-ext` entirely: `DSH-0.1.5-A1-13`.

---

## 1. Evidence inventory (all from `fixture/`, read once)

| File | What it establishes |
|---|---|
| `install-error.log:3-13` | `fs-ext@2.1.1 install: node-gyp configure build` → `gyp ERR! find VS` (no `vswhere`, no VS dir, not in a VS command prompt) → `Failed` → `pnpm: Command failed with exit code 1` → `dsh 退出码: 1` |
| `manifest-excerpt.json:1-9` | `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` declares `"fs-ext": "2.1.1"` (exact pin) and `@types/fs-ext@2.0.3` (dev) |
| `lease-excerpt.md:3-19` | Lock semantics: POSIX = non-blocking `flock(2)` via fs-ext; **Windows = named kernel semaphore derived from the path, never a file lock/handle**; *"Windows has no lock file at all"*; `import { flock } from 'fs-ext'` is a **static** import — the loader must resolve and load `fs-ext` even on Windows where the `flock` branch is never taken |
| `win32-excerpt.ts:1-24` | The Windows path binds only Win32 APIs: `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle`, `GetLastError`, `MoveFileExW`; *"no flock(2) is involved on Windows"* |
| `README.md:1-12` | No VS/Build Tools and the owner refuses; node + corepack/pnpm work; earlier dsh upgrades installed fine; the repo already patches native deps via pnpm `patchedDependencies` (`patches/node-pty@*.patch` precedent) and registers the patch in `pnpm-workspace.yaml`; a patch may rewrite a package's install script **and** entry file |

---

## 2. Q1 — What exactly fails, and why

**Failing package:** `fs-ext@2.1.1` (exact pin).
**Failing step:** its **install lifecycle script** — `node-gyp configure build`, i.e. compiling the C++ addon that provides `flock(2)`.
**Missing toolchain:** the **MSVC / Visual Studio C++ toolchain** ("Desktop development with C++" workload). node-gyp's `find VS` step cannot locate a VS installation (`vswhere.exe` absent, no VS directory, not running inside a VS Command Prompt, `msvs_version`/`VCINSTALLDIR` unset) — `fixture/install-error.log:3-11`.
**Blast radius:** the script failure aborts the whole workspace install (`exit code 1` → `dsh 退出码: 1`, `fixture/install-error.log:13-14`), so the upgrade never reaches the boot step.

**How it got there (corridor-level):** the previously working cohorts on that machine did not pull this native dependency; the new cohort's session-persistence package does. `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` (the version in `manifest-excerpt.json`) pins `fs-ext: 2.1.1`, and `fs-ext` has no Windows prebuilt binary in this dependency set — it must be compiled from source. *Inference from the fixture (the "every previous upgrade installed fine" line in `README.md:5-6` + the manifest excerpt); the exact upstream commit that introduced the pin is not in the fixture.*

---

## 3. Q2 — Why `pnpm install --ignore-scripts` cannot fix this

Three independent reasons, all from the fixture:

1. **The module must load, not just install.** `lease-excerpt.md:17-19`: `flock` is imported **statically at module top**, so *"the package loader must resolve and load `fs-ext` even on Windows, where the `flock` branch is never taken."* `--ignore-scripts` skips the **build**; the package is then present but its native binding (`build/Release/fs_ext.node`) is **never produced**, so `require('fs-ext')` / `import { flock } from 'fs-ext'` fails at module load → the session-persistence entry cannot mount → the service will not boot. The install "succeeds" and the failure simply moves from install time to boot time.
2. **It does not remove the requirement.** The dependency is declared in the published manifest of `@deepseek-ai/dsh-session-persistence-jsonl` (`manifest-excerpt.json:4-6`). Ignoring scripts changes *how* it is installed, not *whether* it is needed — and it is needed at load time by a static import.
3. **It is a global blunt instrument.** `--ignore-scripts` suppresses **every** dependency's lifecycle scripts (and, in pnpm ≥10, the build-script gate is a separate allowlist anyway — see `migration-hygiene.md` §4 and `examples/06` Error 5: `pnpm approve-builds`). It is not a targeted fix and it would also silently skip scripts other packages legitimately need.

**Conclusion:** the blocker is not "the build script is annoying"; it is "a module that must *load* on Windows is delivered only as a locally compiled native addon". The fix must make the module **load** on Windows without a compiler, and it must do so through a mechanism the repository already uses.

---

## 4. Q3 — Which lock path Windows takes at runtime, and what it implies

**Windows path (authoritative):** `lease.ts` → `acquireLockHandleWin32` / `releaseLockHandleWin32` (`lease-excerpt.md:12`) → the Win32 bindings in `win32-excerpt.ts`: `CreateSemaphoreW(security, initial, maximum, name)` (a **named kernel semaphore** whose name is derived from the session's artifact path), `WaitForSingleObject`, `ReleaseSemaphore`, `CloseHandle`, `GetLastError`. `win32-excerpt.ts:23-24`: *"no flock(2) is involved on Windows."* The doc adds: Windows *"holds a named kernel semaphore derived from that path — never a file lock or handle, so readers, searches, and directory removal proceed freely while the lock is held"*, and *"Windows has no lock file at all"* (`lease-excerpt.md:6-8,15`).

**Implications for the failing native module:**

| Implication | Consequence for the fix |
|---|---|
| `flock` is a **POSIX-only branch** on Windows — never executed | The native `fs_ext.node` **binary is functionally unnecessary on Windows**; skipping its compilation cannot break Windows lock semantics |
| Write-ownership is still enforced on Windows (by the named semaphore), so the fallback must not be a *second* lock mechanism | The pure-JS `flock` must be a **load-time placeholder only**, never an alternative arbiter |
| The import is **static**, so the package must be *loadable* | The patch must keep `require('fs-ext')` **succeeding** — the fallback is a *loading* fix, not a *build* fix |
| The failure is therefore a **packaging/install-surface** blocker, not a runtime-behavior gap | Correct fix class: make the Windows build a no-op + make the entry loadable — exactly the pnpm-patch recipe in the card |

---

## 5. Q4 — Fix plan (least invasive: no Visual Studio, no upstream change)

Follow the repository's existing native-dependency patch mechanism (`patches/node-pty@*.patch`; `fixture/README.md:7-10`), as prescribed by card `DSH-0.1.3-A1-03`.

### 5.1 Files touched (the complete footprint)

| File | Action | Content |
|---|---|---|
| `patches/fs-ext@2.1.1.patch` | **new** | pnpm patch of `fs-ext@2.1.1`: (a) platform-aware install script, (b) load-safe entry |
| `pnpm-workspace.yaml` | **edit** | `patchedDependencies: { "fs-ext@2.1.1": "patches/fs-ext@2.1.1.patch" }` and `allowBuilds: { "fs-ext@2.1.1": true }` (pnpm ≥10 build-script gate; older pnpm uses `onlyBuiltDependencies`) |
| `pnpm-lock.yaml` | **regenerate** | pnpm records the patch hash; commit the regenerated lockfile so `--frozen-lockfile` CI still works |

Nothing else. **No** change to any `package.json` dependency declaration, **no** edit inside `node_modules`, **no** upstream repo edit, **no** Visual Studio install, **no** `--ignore-scripts`.

### 5.2 Steps

1. **Confirm the platform path first (per the card's step 1).** Verify in the target checkout that `src/lease.ts` routes Windows to `acquireLockHandleWin32` and that `flock` is only used in the POSIX branch — the fixture already shows both (`lease-excerpt.md:3-16`, `win32-excerpt.ts:23-24`). This is the precondition that makes "skip the native build on Windows" safe.
2. **Author the patch** (repo root, on a branch):
   `pnpm patch fs-ext@2.1.1` → in the unpacked directory:
   - **install script** — replace `"install": "node-gyp configure build"` with a platform-aware script, e.g. `"install": "node scripts/install.js"`, where `scripts/install.js` exits 0 immediately on `process.platform === 'win32'` and otherwise runs the original `node-gyp configure build` (Linux/macOS keep the native build unchanged).
   - **entry file** — make the native binding optional: wrap the `require('./build/Release/fs_ext.node')` load in `try/catch`; on failure, publish a **pure-JS `flock` placeholder** (warn once, no-op) while keeping every other export of the package identical so the package's public surface and `@types/fs-ext` typings still match. The module must **load**; the placeholder must never actually arbitrate a lock.
3. **Commit the patch:** `pnpm patch-commit` → `patches/fs-ext@2.1.1.patch`. Use the **exact** key `fs-ext@2.1.1` because the dependency is exactly pinned (`manifest-excerpt.json:5`); the `node-pty` precedent used a `@*` wildcard, but an exact key is the tighter match here.
4. **Register it** in `pnpm-workspace.yaml` under `patchedDependencies`, and add `allowBuilds` for `fs-ext@2.1.1` so the (now no-op on Windows) install script is permitted to run under pnpm's default build-script gate.
5. **Re-run `pnpm install`** — expect exit 0 on the Windows machine, with no `node-gyp` invocation and no VS requirement. Re-run once more to prove idempotence and that the patched instance is the one materialized (patched packages are installed under a `patch_hash=…` directory — a link script pointing at the unpatched instance would silently defeat the fix; see the `rollup-0.1.2.md` R-03 note about the link pointing at the patched instance).
6. **Boot and verify** (see §7 for the layer-by-layer checks).

### 5.3 Why this is the least-invasive option

- **Zero upstream change:** `fs-ext@2.1.1` stays pinned exactly as published; the patch is a *repository-local* artifact, applied by pnpm at install time. Nothing is written back to the npm package or to the upstream repo.
- **Zero toolchain change:** the machine owner keeps his refusal; no VS, no "Desktop development with C++" workload, no per-machine SDK install.
- **Follows an existing, reviewed mechanism:** the repo already patches a native dependency the same way (`patches/node-pty@*.patch`, registered in `pnpm-workspace.yaml` — `README.md:7-10`), and the card prescribes exactly this shape for this exact failure.
- **Platform-scoped:** the native build is preserved verbatim on Linux/macOS; only win32 skips it.
- **Scoped blast radius:** the change touches 1 new file, 1 config file, 1 regenerated lockfile.

### 5.4 Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| `pnpm install --ignore-scripts` | Does not produce a loadable module (static import) → failure moves to boot; see §3 |
| Install Visual Studio / Build Tools | Explicitly out of scope (owner refuses); disproportionate for a module Windows never calls |
| `pnpm.overrides` replacing `fs-ext` with a JS stub package | Changes the **dependency graph** (i.e. modifies upstream dependency resolution) and drops the native POSIX build for every platform — larger blast radius than a patch; also breaks `@types/fs-ext` alignment |
| Edit `node_modules/fs-ext` in place | Untracked, non-reproducible, wiped on the next install; not a patch mechanism |
| Upgrade the host to a cohort where `fs-ext` is gone (`DSH-0.1.5-A1-13`: `fs-ext` → `@deepseek-ai/node-addon-system`, prebuilt for macOS/Linux) | Correct upstream direction, but (a) it is a **host-version change**, not a fix for the cohort being installed, and (b) the replacement ships **macOS/Linux** platform packages — it does not by itself solve a **Windows** install. It remains the strategic follow-up (§8), not this fix |
| Vendor a Windows prebuilt `fs_ext.node` into the repo | Binary artifact in the repo, ABI/Node-version coupling, and it still cannot be produced without the toolchain; the patch removes the need for a Windows binary entirely |

---

## 6. Q5 — Corridor card

**Primary card: `DSH-0.1.3-A1-03`** — *"Windows install fails on the `fs-ext` native build (no MSVC); the runtime never calls `flock` on Windows — pnpm-patch recipe"*, in `skills/plugin-upgrade/references/v0.1.3-alpha.1.md` (corridor `dsh-v0.1.2-rc.1 → dsh-v0.1.3-alpha.1`, id prefix `DSH-0.1.3-A1`, type *breaking*, touchpoint: packaging/install surface).

Key points used (paraphrased, not pasted):
- Symptoms: `pnpm install` exits 1 on the `fs-ext@2.1.1` `node-gyp configure build` script with the `gyp ERR! find VS` message; the dependency is a pinned one of `@deepseek-ai/dsh-session-persistence-jsonl` and is statically imported from `src/lease.ts`, so `--ignore-scripts` cannot skip it.
- Recipe: confirm the Windows path first (`acquireLockHandleWin32` / `CreateSemaphoreW`, `flock` is POSIX-only) → add a pnpm patch rewriting the install script to build only on non-Windows plus a pure-JS `flock` fallback → register it in `pnpm-workspace.yaml` (`patchedDependencies` + `allowBuilds`) → re-run `pnpm install`. Do **not** install Visual Studio, do **not** patch upstream, do **not** rely on `--ignore-scripts` alone.
- Verification: `pnpm install` completes; `require('fs-ext')` loads and the flock callback path warns once instead of throwing; `dsh web --no-open` boots and answers HTTP 200.

**Corroborating lookup row:** `skills/plugin-upgrade/references/troubleshooting.md:21` — symptom `gyp ERR! find VS` / `fs-ext` native build failure on Windows without (and unwilling to install) Visual Studio → root cause: static import in session-persistence + Windows uses the named-semaphore path, `flock` is dead POSIX code → fix: the repo's pnpm patch precedent (win32 skips node-gyp + pure-JS fallback, native retained on non-Windows) → card `DSH-0.1.3-A1-03`.

**Related later card (context, not this fix):** `DSH-0.1.5-A1-13` — packaging change that drops `fs-ext`/`@types/fs-ext` from the persistence package in favour of `@deepseek-ai/node-addon-system` (prebuilt for macOS/Linux).

---

## 7. Validation and reporting (skill format)

### Pre-existing
Not collected (diagnosis-only task; no install/build/test was executed in this environment). The one pre-existing condition that *is* in scope and is the trigger: the machine has no MSVC toolchain and will not get one.

### Completed
- Read-only diagnosis of the install failure, the dependency chain (`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` → `fs-ext@2.1.1`), and the Windows lock path — all from `fixture/` (read-only, unmodified).
- Located the covering card and the symptom→root-cause→card row.
- Produced a concrete patch-based fix plan with the exact file footprint and per-layer verification steps.
- `fixture/` left byte-identical; nothing outside `agent-output/` was written.

### Skipped (with reason)
- **Actually applying the patch / re-running `pnpm install`** — the machine under diagnosis is not this environment, the fixture must stay unchanged, and building here would neither prove the Windows path nor be admissible. Steps 2–6 of §5.2 are handed over as the executable plan.
- **`verify-runtime.mjs`** (the skill's runtime verifier) — POSIX-only per `scripts/README.md`, and it would install and execute plugin code; it cannot exercise a Windows named-semaphore path and would not reproduce the MSVC failure.
- **Host-version probes** (`dsh --version`, `--dump-config`, `cordis_inspect_*`) — out of scope by task rules, and the installed host is a different cohort than the one under diagnosis.

### Pending / residual risk
- **Fallback semantics.** The card prescribes "warn once, no-op". A no-op that *reports success* would, if ever called on Windows, silently drop write-ownership. Recommended hardening: the placeholder should refuse loudly (throw a clear "flock is unsupported on Windows; the Win32 named-semaphore path is authoritative" error) if it is ever actually invoked, while still allowing the module to **load**. Recorded as a deliberate refinement over the card's wording, not a contradiction of it.
- **Second writer on Windows.** The fallback does not weaken the Windows lock — exclusivity is enforced by the named semaphore — but the *verification* must confirm two concurrent writers on one session still conflict on Windows (§8 check V4).
- **The fs-ext entry file name and binding path** (`lib/fs-ext.js` vs `fs-ext.js`, `./build/Release/fs_ext.node`) are **not in the fixture**; the patch author must locate the actual require site at patch time rather than assume it.
- **The exact pnpm major on the machine is unconfirmed** (`README.md:5-6` says corepack/pnpm work). pnpm ≥10 blocks dependency build scripts by default, so the allowlist key is `allowBuilds` on new pnpm and `onlyBuiltDependencies` on older pnpm; use whichever the installed pnpm accepts (`pnpm approve-builds` writes it).
- **`@types/fs-ext@2.0.3` (dev) alignment** — the fallback must keep the package's exported signatures so TypeScript still compiles; check the typecheck layer in step 6.
- **CI with `--frozen-lockfile`** — the regenerated lockfile must be committed together with the patch, or frozen installs break (cf. `rollup-0.1.2.md` R-04 on lockfile/pipeline coupling).
- **Upstream drift** — if the persistence package is later upgraded to a cohort that no longer depends on `fs-ext` (`DSH-0.1.5-A1-13`), the patch becomes dead weight and should be dropped together with its lockfile entry.

### Rollback
Recorded baseline: current `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and the working tree of the repository being upgraded; the patch is additive (1 new file) plus 1 config edit plus a lockfile regeneration.
Recovery for **only the paths owned by this task**: delete the `fs-ext@2.1.1` entry from `patchedDependencies` and `allowBuilds`, delete `patches/fs-ext@2.1.1.patch`, re-run `pnpm install` to restore the pristine graph. On Linux/macOS nothing changes at all (the native build is preserved by the patch). No third-party lifecycle-script side effects beyond `fs-ext`'s own build are claimed as recoverable.

### Recommendations
1. Apply the plan in §5.2 on a branch; keep the change to the three files listed in §5.1.
2. Document the Windows/no-MSVC constraint and the patch in the repository README next to the existing `node-pty` patch note, so the next person does not rediscover it.
3. Track the upstream packaging change (`DSH-0.1.5-A1-13`) as the strategic exit: when the persisted cohort drops `fs-ext`, retire the patch instead of carrying it forward.
4. Add a CI lane that installs the patched graph on a **Windows runner without VS** — cheap insurance that the install path never regresses to requiring node-gyp.

---

## 8. Verification plan to run on the target Windows machine

| # | Check | Expected |
|---|---|---|
| V1 | `pnpm install` | exit 0; **no** `node-gyp`/`find VS` output; no VS installed, none required |
| V2 | `node -e "require('fs-ext')"` | loads successfully; the fallback warns once instead of throwing |
| V3 | `pnpm install` again (idempotence) | exit 0; the materialized package is the patched instance (not the unpatched one) |
| V4 | Session write-ownership on Windows | two concurrent writers on one session still conflict — via the **named semaphore** path, not via `flock` |
| V5 | `dsh web --no-open` | boots and answers HTTP 200 (per the card's verification) |
| V6 | Lockfile / CI | `pnpm install --frozen-lockfile` succeeds with the regenerated lockfile committed |
| V7 | Non-Windows regression (if a Linux/macOS runner is available) | native `fs-ext` still builds; `flock` still functions (POSIX path untouched) |

---

## 9. Explicitly unconfirmed in this report

- The installed pnpm major version on the target machine (fixture says only that pnpm works) → affects the allowlist key name, not the approach.
- The exact file layout of `fs-ext@2.1.1` (entry file name, native binding path) — not in the fixture; must be inspected at patch time.
- The exact upstream commit that introduced the `fs-ext@2.1.1` pin — not in the fixture; the pin is confirmed only through `manifest-excerpt.json`.
- Whether the Windows service boot path touches `lease.ts` in this specific profile (the fixture documents the package-level behavior; the profile composition is not in the fixture) — hence V5 in §8.
- No live host was inspected for this task: no `dsh` version/config probes and no `cordis_inspect_*` calls were made, per the task's boundary rules.
