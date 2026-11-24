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


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.