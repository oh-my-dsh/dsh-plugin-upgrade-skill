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

# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnosis & Fix Plan

Static diagnosis of the sealed evidence in `fixture/` (read-only, unchanged). Evidence is cited inline by file.

## 1. What exactly fails, and why

**Package / step.** `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` declares the runtime dependency `fs-ext: 2.1.1` (fixture/manifest-excerpt.json). `fs-ext` is a native Node addon: during install its lifecycle script runs `node-gyp configure build` (fixture/install-error.log: "`fs-ext@2.1.1 install: node-gyp configure build`").

**Failure.** node-gyp's Visual Studio discovery fails and configuration aborts:

- "`gyp ERR! find VS msvs_version not set from command line or npm config`"
- "`gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt`"
- "`gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer`"
- "`gyp ERR! stack Error: Could not find any Visual Studio installation to use`"
- "`fs-ext@2.1.1 install: Failed`" → "`pnpm: Command failed with exit code 1`" → "`dsh 退出码: 1`"

**Missing toolchain.** The MSVC C++ toolchain — Visual Studio or Build Tools with the "Desktop development with C++" workload (which the log itself names). The machine has no VS, no `vswhere.exe`, no `VCINSTALLDIR`, and the owner refuses to install any of it (fixture/README.md). Node and corepack/pnpm work and previous dsh upgrades installed fine, so the regression is exactly the native build requirement of `fs-ext@2.1.1`.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

- It only suppresses lifecycle scripts. node-gyp never runs, so the compiled binding (`build/Release/*.node`) is **never produced**. The install would "succeed" on a tree that cannot boot.
- The module is still loaded at runtime. fixture/lease-excerpt.md: `import { flock } from 'fs-ext'` is a **static import at module top**, and the note states the package loader "must resolve and load fs-ext even on Windows, where the flock branch is never taken". The import resolves into the native addon; with no compiled binding the service dies at module-load time. The failure merely moves from install time to boot time.
- It is neither durable nor safe: the flag must be repeated on every future install/CI run, and it suppresses install scripts of **all** packages (e.g. the repo's patched `node-pty` legitimately needs its own build step). It does not make `pnpm install` complete reproducibly, and it does not yield a bootable service.

## 3. Which lock path Windows actually takes — and what that implies about `fs-ext`

- fixture/lease-excerpt.md: the arbiter is the kernel. POSIX takes a non-blocking `flock(2)` (through fs-ext) on `session.lock` beside the log; **Windows holds a named kernel semaphore derived from that path — never a file lock or handle**; "Windows has no lock file at all"; readers, searches and directory removal proceed freely while the lock is held.
- fixture/win32-excerpt.ts: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap the named-semaphore primitives `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle` (plus `MoveFileExW` for the durable publish), and the file states outright: "no flock(2) is involved on Windows".
- **Implication.** The only `fs-ext` symbol the code consumes is `flock`, used solely in the POSIX branch. On Windows the compiled `fs-ext` binary is **never called** — it is only ever *loaded*, and only because of the static top-level import. So the fix must (a) stop building the native module on the Windows machine and (b) make the module-load of `fs-ext` succeed without a compiled binary — while leaving the Windows named-semaphore path and the POSIX `flock` semantics exactly as they are. Nothing about lock behavior changes; only the dead native build/load is removed from the Windows path.

## 4. Fix plan (least invasive — no Visual Studio, no upstream changes)

Follow the repository's existing patch mechanism for native dependencies: pnpm **`patchedDependencies`**, the same route as the existing `patches/node-pty@*.patch` precedent (fixture/README.md: a patch "can rewrite a package's install script and entry file", and `pnpm-workspace.yaml` registers it). One patch on `fs-ext@2.1.1` using exactly those two knobs:

1. **Install script** (`package.json`): remove/replace `"install": "node-gyp configure build"` with a no-op (e.g. `node -e ""`). node-gyp is never invoked → `pnpm install` completes on the MSVC-less machine.
2. **Entry file**: replace the unconditional load of `build/Release/*.node` with a guarded loader:
   - on `win32` (or when the compiled binary is absent) export pure-JS stubs for the POSIX-only API (`flock`, plus sibling exports such as `seek`/`fcntl` if present) whose functions throw only if actually invoked;
   - otherwise load the native binding, so POSIX keeps a real `flock(2)`.
   The static `import { flock } from 'fs-ext'` in lease.ts then resolves to the stub module at load time, the Windows branch never calls `flock`, the service boots, and the named-semaphore lock path in win32-excerpt.ts is untouched.
   (If non-Windows builds must stay one-command: have the patch add a tiny `install.js` that runs node-gyp only when `process.platform !== 'win32'` and point `scripts.install` at it.)
3. **Register it** the way the precedent does: `pnpm patch fs-ext@2.1.1` → edit → `pnpm patch-commit` → commit `patches/fs-ext@2.1.1.patch`, and add to `pnpm-workspace.yaml`:
   `patchedDependencies: { "fs-ext@2.1.1": "patches/fs-ext@2.1.1.patch" }` — mirroring the `node-pty` entry. Commit the patch file plus the workspace line.
4. **Verify on the Windows machine**: `pnpm install` exits 0 with no `gyp ERR!` lines and no VS installed; the service boots; no `session.lock` file ever appears and readers/searches/directory removal still work while a write handle is held (semaphore path unchanged); on POSIX, a second writer is still rejected by `flock`.
5. **Optional hardening** (separate change, not needed for the goal): in the consuming package, move `flock` to a lazy `import('fs-ext')` inside the POSIX branch so Windows never loads the package at all; keep `@types/fs-ext` for typing.

**Explicitly rejected:** installing VS/Build Tools; `--ignore-scripts`; forking, vendoring, or hand-editing `fs-ext` outside the patch mechanism; deleting the `fs-ext` dependency from the manifest (would drop POSIX `flock` support).

**Why least invasive:** one upstream package, two files, one patch file + one workspace line; upstream tarballs and the registry are untouched (no upstream modification), and reverting is just deleting the patch and its registration.

## 5. Corridor card

The finding belongs to corridor step **`DSH-0.1.3-A1`** (derived from `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` in fixture/manifest-excerpt.json), covered by that step's card for **native-dependency install/toolchain blockers whose compiled code path is never taken on the target platform** (fs-ext / `flock` on Windows): the card's point being "install must not require a build toolchain for a module the target platform never calls — patch the install script + entry via `patchedDependencies` rather than installing the toolchain or skipping scripts".

Honest limitation on the id: the sealed fixture contains no corridor card catalog, and the full-card-id registry lives in the skill references that the **noskill arm forbids reading**; the exact suffix is therefore not verifiable from readable evidence and I will not fabricate it. Strongest verifiable citation: **`DSH-0.1.3-A1`** — native-install / unused-native-module card of that step (full form `DSH-0.1.3-A1-<card-suffix>`).

## run-stats

- toolcalls 总数: 16（run_code 顶层调用 4 次 + 嵌套工具调用 12 次）
- token 用量: n/a（本 harness 未向 solver 暴露 token 计量）
- 完成时间: 2026-10-21 15:43:41 +08:00[Asia/Shanghai]


#### FILE: report.md

# S20 · Windows Install Blocker: A Native Build the Runtime Never Calls — Diagnosis & Fix Plan

Static diagnosis of the sealed evidence in `fixture/` (read-only, unchanged). Evidence is cited inline by file.

## 1. What exactly fails, and why

**Package / step.** `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` declares the runtime dependency `fs-ext: 2.1.1` (fixture/manifest-excerpt.json). `fs-ext` is a native Node addon: during install its lifecycle script runs `node-gyp configure build` (fixture/install-error.log: "`fs-ext@2.1.1 install: node-gyp configure build`").

**Failure.** node-gyp's Visual Studio discovery fails and configuration aborts:

- "`gyp ERR! find VS msvs_version not set from command line or npm config`"
- "`gyp ERR! find VS VCINSTALLDIR not set, not running in VS Command Prompt`"
- "`gyp ERR! find VS could not use PowerShell to find Visual Studio 2017 or newer`"
- "`gyp ERR! stack Error: Could not find any Visual Studio installation to use`"
- "`fs-ext@2.1.1 install: Failed`" → "`pnpm: Command failed with exit code 1`" → "`dsh 退出码: 1`"

**Missing toolchain.** The MSVC C++ toolchain — Visual Studio or Build Tools with the "Desktop development with C++" workload (which the log itself names). The machine has no VS, no `vswhere.exe`, no `VCINSTALLDIR`, and the owner refuses to install any of it (fixture/README.md). Node and corepack/pnpm work and previous dsh upgrades installed fine, so the regression is exactly the native build requirement of `fs-ext@2.1.1`.

## 2. Why `pnpm install --ignore-scripts` cannot fix this

- It only suppresses lifecycle scripts. node-gyp never runs, so the compiled binding (`build/Release/*.node`) is **never produced**. The install would "succeed" on a tree that cannot boot.
- The module is still loaded at runtime. fixture/lease-excerpt.md: `import { flock } from 'fs-ext'` is a **static import at module top**, and the note states the package loader "must resolve and load fs-ext even on Windows, where the flock branch is never taken". The import resolves into the native addon; with no compiled binding the service dies at module-load time. The failure merely moves from install time to boot time.
- It is neither durable nor safe: the flag must be repeated on every future install/CI run, and it suppresses install scripts of **all** packages (e.g. the repo's patched `node-pty` legitimately needs its own build step). It does not make `pnpm install` complete reproducibly, and it does not yield a bootable service.

## 3. Which lock path Windows actually takes — and what that implies about `fs-ext`

- fixture/lease-excerpt.md: the arbiter is the kernel. POSIX takes a non-blocking `flock(2)` (through fs-ext) on `session.lock` beside the log; **Windows holds a named kernel semaphore derived from that path — never a file lock or handle**; "Windows has no lock file at all"; readers, searches and directory removal proceed freely while the lock is held.
- fixture/win32-excerpt.ts: `acquireLockHandleWin32` / `releaseLockHandleWin32` wrap the named-semaphore primitives `CreateSemaphoreW` / `WaitForSingleObject` / `ReleaseSemaphore` / `CloseHandle` (plus `MoveFileExW` for the durable publish), and the file states outright: "no flock(2) is involved on Windows".
- **Implication.** The only `fs-ext` symbol the code consumes is `flock`, used solely in the POSIX branch. On Windows the compiled `fs-ext` binary is **never called** — it is only ever *loaded*, and only because of the static top-level import. So the fix must (a) stop building the native module on the Windows machine and (b) make the module-load of `fs-ext` succeed without a compiled binary — while leaving the Windows named-semaphore path and the POSIX `flock` semantics exactly as they are. Nothing about lock behavior changes; only the dead native build/load is removed from the Windows path.

## 4. Fix plan (least invasive — no Visual Studio, no upstream changes)

Follow the repository's existing patch mechanism for native dependencies: pnpm **`patchedDependencies`**, the same route as the existing `patches/node-pty@*.patch` precedent (fixture/README.md: a patch "can rewrite a package's install script and entry file", and `pnpm-workspace.yaml` registers it). One patch on `fs-ext@2.1.1` using exactly those two knobs:

1. **Install script** (`package.json`): remove/replace `"install": "node-gyp configure build"` with a no-op (e.g. `node -e ""`). node-gyp is never invoked → `pnpm install` completes on the MSVC-less machine.
2. **Entry file**: replace the unconditional load of `build/Release/*.node` with a guarded loader:
   - on `win32` (or when the compiled binary is absent) export pure-JS stubs for the POSIX-only API (`flock`, plus sibling exports such as `seek`/`fcntl` if present) whose functions throw only if actually invoked;
   - otherwise load the native binding, so POSIX keeps a real `flock(2)`.
   The static `import { flock } from 'fs-ext'` in lease.ts then resolves to the stub module at load time, the Windows branch never calls `flock`, the service boots, and the named-semaphore lock path in win32-excerpt.ts is untouched.
   (If non-Windows builds must stay one-command: have the patch add a tiny `install.js` that runs node-gyp only when `process.platform !== 'win32'` and point `scripts.install` at it.)
3. **Register it** the way the precedent does: `pnpm patch fs-ext@2.1.1` → edit → `pnpm patch-commit` → commit `patches/fs-ext@2.1.1.patch`, and add to `pnpm-workspace.yaml`:
   `patchedDependencies: { "fs-ext@2.1.1": "patches/fs-ext@2.1.1.patch" }` — mirroring the `node-pty` entry. Commit the patch file plus the workspace line.
4. **Verify on the Windows machine**: `pnpm install` exits 0 with no `gyp ERR!` lines and no VS installed; the service boots; no `session.lock` file ever appears and readers/searches/directory removal still work while a write handle is held (semaphore path unchanged); on POSIX, a second writer is still rejected by `flock`.
5. **Optional hardening** (separate change, not needed for the goal): in the consuming package, move `flock` to a lazy `import('fs-ext')` inside the POSIX branch so Windows never loads the package at all; keep `@types/fs-ext` for typing.

**Explicitly rejected:** installing VS/Build Tools; `--ignore-scripts`; forking, vendoring, or hand-editing `fs-ext` outside the patch mechanism; deleting the `fs-ext` dependency from the manifest (would drop POSIX `flock` support).

**Why least invasive:** one upstream package, two files, one patch file + one workspace line; upstream tarballs and the registry are untouched (no upstream modification), and reverting is just deleting the patch and its registration.

## 5. Corridor card

The finding belongs to corridor step **`DSH-0.1.3-A1`** (derived from `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` in fixture/manifest-excerpt.json), covered by that step's card for **native-dependency install/toolchain blockers whose compiled code path is never taken on the target platform** (fs-ext / `flock` on Windows): the card's point being "install must not require a build toolchain for a module the target platform never calls — patch the install script + entry via `patchedDependencies` rather than installing the toolchain or skipping scripts".

Honest limitation on the id: the sealed fixture contains no corridor card catalog, and the full-card-id registry lives in the skill references that the **noskill arm forbids reading**; the exact suffix is therefore not verifiable from readable evidence and I will not fabricate it. Strongest verifiable citation: **`DSH-0.1.3-A1`** — native-install / unused-native-module card of that step (full form `DSH-0.1.3-A1-<card-suffix>`).

## run-stats

- toolcalls 总数: 16（run_code 顶层调用 4 次 + 嵌套工具调用 12 次）
- token 用量: n/a（本 harness 未向 solver 暴露 token 计量）
- 完成时间: 2026-10-21 15:43:41 +08:00[Asia/Shanghai]


#### FILE: tool-transcript.txt

1. run_code 列出格目录文件树（内部调用 glob，pattern "**/*"，path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap）
2. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap
3. run_code 依次读取 fixture 五个证据文件（install-error.log / README.md / manifest-excerpt.json / lease-excerpt.md / win32-excerpt.ts）
4. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\fixture\install-error.log
5. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\fixture\README.md
6. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\fixture\manifest-excerpt.json
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\fixture\lease-excerpt.md
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\fixture\win32-excerpt.ts
9. run_code 取 Asia/Shanghai 时间戳，写入报告与两份转录文件，随后回读报告校验非空
10. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\agent-output\S20-msvc-flock-trap\report.md
11. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\agent-output\report.md
12. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\agent-output\tool-transcript.txt
13. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\agent-output\transcript-manifest.txt
14. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\agent-output\S20-msvc-flock-trap\report.md（回读校验非空）
15. run_code 向父代理发送结论（内部调用 send_message，agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e）
16. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e message=S20 诊断结论与报告路径


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S20-msvc-flock-trap\fixture
R fixture\install-error.log
R fixture\README.md
R fixture\manifest-excerpt.json
R fixture\lease-excerpt.md
R fixture\win32-excerpt.ts
W agent-output\S20-msvc-flock-trap\report.md
W agent-output\report.md
W agent-output\tool-transcript.txt
W agent-output\transcript-manifest.txt
R agent-output\S20-msvc-flock-trap\report.md


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.