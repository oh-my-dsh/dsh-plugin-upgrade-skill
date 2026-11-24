# S20 — Windows native dependency installation blocker

## Diagnosis

`@deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1` declares the runtime dependency `fs-ext@2.1.1`; `@types/fs-ext@2.0.3` is only a development dependency (`manifest-excerpt.json`). The failing step is fs-ext's `install` lifecycle command, `node-gyp configure build`. Configuration fails while locating Visual Studio, before a successful native build: the log explicitly reports `Could not find any Visual Studio installation to use`, then exit code 1 (`install-error.log`). The machine actually lacks Visual Studio/Build Tools and the owner refuses installation (`README.md`). Changing `msvs_version`, using a VS command prompt, or installing TypeScript declarations cannot supply the missing compiler toolchain.

`pnpm install --ignore-scripts` suppresses the failing build but does not create the native binding. `lease-excerpt.md` explicitly shows the top-level `import { flock } from 'fs-ext'` and states that Windows must resolve and load that module despite never taking the flock branch. Therefore skipping scripts alone cannot make the service boot: the native module remains unbuilt and its normal entry still attempts to load it. The fixture supplies no post-ignore-scripts boot trace, so the precise missing-binding error text is not established. Globally suppressing lifecycle scripts also is not a targeted repair.

## Runtime lock path

POSIX uses nonblocking `flock(2)` through fs-ext on `session.lock`, held for the lifetime of the write handle. Windows instead holds a named kernel semaphore derived from that path; it has no lock file (`lease-excerpt.md`). The Windows bindings wrap `CreateSemaphoreW`, `WaitForSingleObject`, `ReleaseSemaphore`, and `CloseHandle`, via `acquireLockHandleWin32` and `releaseLockHandleWin32` (`win32-excerpt.ts`). The Windows durable namespace path also has its own native primitive, `MoveFileExW`. None of this requires flock. Preserve these bindings and all existing semaphore ownership/release semantics; do not substitute a dummy successful lock or introduce a Windows lock file.

## Least-invasive fix plan

Use the repository's existing pnpm `patchedDependencies` mechanism, matching its `patches/node-pty@*.patch` precedent and registration in `pnpm-workspace.yaml` (`README.md`). Apply a repository-local patch to exactly `fs-ext@2.1.1`, not a published upstream modification or an edit to the session persistence package. Keep fs-ext installed so the existing static import resolves.

1. In the actual checkout, use `pnpm patch fs-ext@2.1.1` to prepare the package for patching. Inspect that package's manifest and loader to identify its real entry file and original exports. Their full contents are not provided here; do not assume filenames or replace unrelated exports blindly.
2. Patch its install script to execute a small JavaScript platform guard. On `process.platform === 'win32'`, exit successfully without invoking node-gyp. On every other platform, run the original `node-gyp configure build` command and propagate failures. An explicit guarded install script is essential: merely removing it may allow a default native build lifecycle to run for a package with `binding.gyp`. Keep normal lifecycle scripts enabled elsewhere.
3. Patch the runtime entry so Windows does not load or require any fs-ext native binding. Provide an explicit named `flock` export compatible with the package's existing module format and the importing service's loader. On Windows that exported function should throw a clear unsupported-operation error if unexpectedly invoked; it must never pretend to acquire a lock. Preserve any other exports needed by consumers, with explicit unsupported behavior where appropriate. On non-Windows retain the original native loader and complete API unchanged. For a CommonJS entry, use an explicit assignment such as `exports.flock = function flock() { throw new Error('fs-ext flock is unavailable on Windows; use the Win32 semaphore path'); };` within the Windows branch, and retain original native-loading code exclusively in the other branch. Verify named-import interoperability under the actual service runtime rather than assuming a dynamically assigned exports object suffices.
4. Persist the generated patch, for example `patches/fs-ext@2.1.1.patch`, using `pnpm patch-commit <prepared-package-directory>`. Register the exact package/version with the repository's established workspace configuration, preserving existing patches:

   ```yaml
   patchedDependencies:
     fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
   ```

   Let the repository's pnpm version update lockfile patch metadata and include that change with the patch and configuration. Do not hand-edit the shared store or rely on a one-off node_modules edit. The resulting patch alters the local installed copy reproducibly; it does not publish or change upstream dependencies.
5. On the target Windows machine without MSVC, perform a clean normal `pnpm install` with scripts enabled, then boot the service. Confirm the patched fs-ext install succeeds without node-gyp, the unchanged named import loads without a native binding, and the service actually starts. Verify Windows write-lock exclusion with two processes targeting the same session: the second writer must be denied while the first owns the semaphore and must succeed after release or owner exit. Confirm no lock file is introduced. Separately validate on a supported POSIX environment that fs-ext still builds and flock still excludes a competing writer.

This addresses both independent gates: successful installation and successful loading of the otherwise unused module. It retains the real Windows synchronization path and normal POSIX behavior. It requires no Visual Studio installation and no upstream publication or source change.

## Corridor card and evidence limits

The supplied fixture contains no corridor cards or mapping from this finding to a full `DSH-0.1.3-A1-…` identifier. The applicable finding is the Windows fs-ext/MSVC installation trap with an unused but statically imported flock binding. Its exact corridor card ID cannot be established from the authorized evidence. Inventing the suffix would be unsupported; access to the corridor card index is the only blocker to providing that requested citation.

This is a static diagnosis and proposed fix, not a verified installation repair. Only the instruction and the five fixture files were read. No skills, network, prior answers, test harnesses, verifiers, scoring material, or other repository content were consulted. The fixture was left unchanged. No install, build, runtime test, or patch application was performed; the steps above are acceptance checks for implementation in the real checkout. The excerpts do not establish other packages' Windows compatibility or the actual fs-ext entry layout, so service boot remains to be verified after implementation.
