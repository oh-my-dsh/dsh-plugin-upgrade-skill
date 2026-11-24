# S20 — Windows fs-ext install and load blocker

## Completed: static diagnosis

Mode A, read-only inspection. Read `skills/plugin-upgrade/SKILL.md` and `references/v0.1.3-alpha.1.md`. The fixture was not changed. BENCHMARK-AUTH-v1 authorizes this report; the commands below are a proposed implementation, not commands executed against the fixture.

**Root cause:** `fs-ext@2.1.1` runs `node-gyp configure build` during `pnpm install`. Configuration fails because node-gyp cannot locate Visual Studio/MSVC with the C++ workload. `install-error.log` records `Could not find any Visual Studio installation to use`, followed by install failure and exit code 1. The `msvs_version` and `VCINSTALLDIR` messages are toolchain discovery diagnostics; setting those variables cannot supply a missing compiler. `README.md` confirms Windows 11 has no VS/Build Tools and the owner refuses installation; Node and pnpm already work.

`manifest-excerpt.json` identifies the dependency owner as `@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1`, with runtime dependency `fs-ext: 2.1.1`. `@types/fs-ext: 2.0.3` is a development-only type package and cannot provide the native runtime implementation.

**Why ignoring scripts is insufficient:** `pnpm install --ignore-scripts` can bypass the failing build, but it does not produce the native binding. `lease-excerpt.md` explicitly shows the top-level static `import { flock } from 'fs-ext'`. Loading the lease module therefore resolves and evaluates fs-ext even on Windows. An unbuilt native entry still fails to load, so bypassing the lifecycle failure alone cannot make the service boot. Removing fs-ext also breaks this import.

**Actual Windows lock:** `lease-excerpt.md` says POSIX uses nonblocking `flock(2)` on `session.lock`, whereas Windows uses `acquireLockHandleWin32` / `releaseLockHandleWin32` and a named kernel semaphore derived from the path for the entire write handle lifetime. Windows has no lock file. `win32-excerpt.ts` supplies `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, and `CloseHandle` bindings. Its `MoveFileExW` durable namespace operation is separate from locking. Thus the fs-ext flock implementation is unused on Windows even though its module must load. Keep the real semaphore path intact.

## Concrete least-invasive fix plan

Use the repository-local pnpm patch mechanism already documented in fixture `README.md` (`patches/node-pty@*.patch` precedent). Do not install Visual Studio, change the pinned DSH cohort, edit lease.ts, disable locking, or modify/publish upstream packages.

1. In the actual installation repository, preserve the baseline of `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and existing patches. Run `pnpm patch fs-ext@2.1.1` and edit only the extracted patch working copy.
2. Patch fs-ext's `package.json` install script to invoke a small local JS installer. On `process.platform === 'win32'`, exit successfully without invoking node-gyp. Otherwise run the original `node-gyp configure build`, forwarding output and propagating failure. For example, the new installer can conditionally call `require('node:child_process').execSync('node-gyp configure build', { stdio: 'inherit' })` when the platform is not win32. npm/pnpm's lifecycle PATH supplies node-gyp as before. Retain an explicit install script to avoid an implicit binding.gyp rebuild.
3. Patch the package entry as well. On Windows, export a pure-JavaScript `flock` callback implementation without loading any `.node` binding. It warns once if called and completes its callback with `null` (no-op). For a CommonJS entry, expose the name explicitly as `exports.flock = function (...) { ... }` so the existing named import remains available. Preserve the usual `(fd, flags, callback)` shape and asynchronous callback completion, for example via `process.nextTick(callback, null)`. Normal Windows DSH locking should never call this fallback. Do not substitute this no-op for the Windows semaphore.
4. On Linux/macOS, preserve the original native loader and all original exports, with no fallback that masks native errors. A wrapper may delegate to the original entry retained under a sibling filename on non-Windows; keep its relative binding paths valid. Match the actual entry/main structure while preparing the patch: the full fs-ext package is not included in this fixture.
5. Finish with `pnpm patch-commit <extracted-directory>`, retaining a local patch such as `patches/fs-ext@2.1.1.patch`. Merge these entries into existing `pnpm-workspace.yaml` maps, preserving all prior entries:

   ```yaml
   patchedDependencies:
     'fs-ext@2.1.1': patches/fs-ext@2.1.1.patch
   allowBuilds:
     fs-ext: true
   ```

   `allowBuilds` permits the patched, platform-aware lifecycle script; it does not disable every native dependency build. Update the lockfile through pnpm so it records the patch/hash. Keep the exact fs-ext version. Run normal `pnpm install` with scripts enabled. Review the resulting patch, workspace configuration, and lockfile changes as one reproducible local fix.

Both changes are necessary: the installer guard removes the MSVC requirement, and the entry guard removes the unbuilt-native-binding startup failure.

## Applicable card

**DSH-0.1.3-A1-03 — Windows install fails on the fs-ext native build; the runtime never calls flock on Windows**, in `skills/plugin-upgrade/references/v0.1.3-alpha.1.md`, corridor `dsh-v0.1.2-rc.1 → dsh-v0.1.3-alpha.1`. It specifies the platform-gated build, warn-once JS fallback, `patchedDependencies`/`allowBuilds` registration, and install/load/boot verification. The card is a draft backed by a single Windows host field report; the supplied fixture independently matches its diagnosis.

## Verification plan and remaining limits

- On the target Windows machine without MSVC, normal `pnpm install` must exit 0 with the patch applied and no fs-ext node-gyp invocation.
- From the dependency owner's resolution context, `require('fs-ext')` and the existing named import must load. Invoke the fallback twice: both callbacks complete successfully and only one warning appears.
- Cold-start `dsh web --no-open`; require successful service startup and HTTP 200. Exercise a fresh persisted session. Confirm a second writer is refused while readers remain usable and ownership is released on close, proving the real semaphore path still works.
- On Linux/macOS, verify native build/load and real flock exclusion remain intact; the Windows fallback must not run.

Pre-existing baseline: not collected (static diagnosis). Skipped: installs, builds, service execution, upstream writes, and unrelated migration cards. No claim of a measured successful install or boot is made. The fixture contains excerpts rather than the full fs-ext entry or workspace, so exact patch hunks and runtime validation remain implementation work; this does not block the requested diagnosis and plan.

Rollback: restore only the recorded workspace/lockfile baseline and remove only the new fs-ext patch, then reinstall the prior dependency state. This restores the pre-fix state, including its Windows blocker; it does not imply recovery of unrelated lifecycle-script effects. No session data or profile configuration needs changing.
