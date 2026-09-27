# S20 — Windows native-install blocker

## Conclusion

The blocker is fs-ext@2.1.1 building a native addon that Windows session locking does not use. The least-invasive repair is a repository-owned pnpm patch that changes both the Windows install lifecycle and the Windows module-loading path. Preserve the native POSIX behavior and the existing Windows named semaphore. Do not install Visual Studio, disable locking, or modify/publish upstream dependencies.

This is a static diagnosis and fix plan, not a claim of an executed repair. No install, build, or service boot was run. The fixture and repository files were not modified.

All fixture references below are relative to E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S20-msvc-flock-trap/environment/fixture.

## 1. Exact failure

install-error.log identifies **fs-ext@2.1.1**, whose install script runs **node-gyp configure build**. It fails during Visual Studio discovery/configuration with “Could not find any Visual Studio installation to use,” and pnpm exits with code 1. This is a missing Windows C++ build toolchain, not a TypeScript compile error, permissions error, or lock-contention failure.

manifest-excerpt.json establishes the dependency chain: @deepseek-ai/dsh-session-persistence-jsonl@0.1.3-alpha.1 declares fs-ext 2.1.1 as a runtime dependency. @types/fs-ext 2.0.3 is only a development type package and cannot provide a native binary.

README.md confirms there is no Visual Studio/Build Tools installation, no vswhere.exe, and no VS directory. Node and corepack/pnpm work. The missing msvs_version and VCINSTALLDIR messages are discovery diagnostics: setting them cannot create the absent compiler. The owner explicitly refuses Visual Studio, so following node-gyp's generic recommendation is not a viable fix.

## 2. Why --ignore-scripts does not solve boot

pnpm install --ignore-scripts can bypass the failing build but cannot produce the native addon. It leaves the dependency installed without its required compiled binding.

lease-excerpt.md shows the unconditional top-level import:

~~~ts
import { flock } from 'fs-ext'
~~~

The same excerpt explicitly says the loader resolves and loads fs-ext even on Windows. Runtime branch selection happens too late to prevent module evaluation. Therefore skipping the install script alone merely moves failure from installation to startup when the normal native entry tries to load the unbuilt addon. It also suppresses unrelated dependency lifecycle scripts, making it broader and less reliable than a targeted repair.

Similarly, changing only the entry file leaves the install failure; changing only the install script leaves the startup failure. Both must be addressed.

## 3. Actual Windows lock path

lease-excerpt.md describes a kernel-arbitrated write-ownership lock held for the write handle's lifetime:

- POSIX uses nonblocking flock(2) through fs-ext on session.lock beside the log.
- Windows uses a named kernel semaphore derived from that path. Windows creates no lock file and holds no file-lock handle. Readers, searches, and directory removal remain free to proceed.

win32-excerpt.ts identifies CreateSemaphoreW, WaitForSingleObject, ReleaseSemaphore, and CloseHandle bindings, with acquireLockHandleWin32 / releaseLockHandleWin32 wrapping semaphore operations. It explicitly states no flock(2) is involved on Windows. MoveFileExW is a separate durable-namespace operation, not an alternative flock implementation.

Thus fs-ext is unnecessary for the documented Windows lock execution path, but its static import still makes module loadability mandatory. Keep the semaphore and its acquire/release ownership semantics unchanged; a silent successful flock stub would conceal an incorrect code path rather than preserve locking.

## 4. Concrete least-invasive fix plan

README.md expressly establishes the repository precedent: patches/node-pty@*.patch, registered with patchedDependencies in pnpm-workspace.yaml, can rewrite a native package's install script and entry file. Apply the same mechanism to the exact fs-ext version rather than changing upstream, removing the runtime dependency, or hand-editing an ephemeral node_modules installation.

1. In a separately authorized implementation checkout, prepare a pnpm patch for fs-ext@2.1.1 using the existing native-patch workflow. Inspect the actual package manifest and entry source first; the fixture does not supply them, so an exact apply-ready diff cannot honestly be derived here.
2. Patch its install script to invoke a platform-aware JavaScript installer. On process.platform === 'win32', exit successfully without invoking node-gyp. On every other platform, run the original node-gyp configure build and propagate its error/exit status. Retain an explicit install script so package-manager default native-build behavior cannot reintroduce the Windows build. Do not globally disable lifecycle scripts or turn POSIX native-build failures into successes.
3. Patch the public entry so Windows exports an import-compatible JavaScript shim **without evaluating any native binding loader**. Preserve the named flock export required by the static import, including CommonJS-to-ESM named-export detection if that is the package's format. Export unsupported operations as functions that fail clearly if called; do not throw merely when importing, and do not silently report successful locking. Keep any other public exports needed by consumers compatible. On non-Windows platforms, retain the original native entry and behavior. A dispatcher with a separate original-native implementation is one practical structure, provided Windows never loads that implementation.
4. Store the reproducible patch as patches/fs-ext@2.1.1.patch and register it in pnpm-workspace.yaml:

~~~yaml
patchedDependencies:
  # Retain the repository's existing entries.
  fs-ext@2.1.1: patches/fs-ext@2.1.1.patch
~~~

5. Regenerate the pnpm lockfile with the patch metadata/hash using the repository's pinned pnpm version. Keep existing native patches intact and retain appropriate per-package build approval where required by pnpm policy. Review the patch, workspace registration, and lockfile as one reproducible local change. This is a downstream patch, not an upstream source edit, release, or fork publication.

### Acceptance checks to run during implementation

- On Windows 11 without Visual Studio, perform a clean normal pnpm install with scripts enabled. Require exit 0 and verify fs-ext does not invoke node-gyp, while unrelated required lifecycle scripts still run.
- Test the actual static named import of flock under the shipped Node module-loading mode. It must succeed without an fs-ext native binary. Calling its Windows unsupported-operation shim must fail explicitly.
- Boot the service through its normal supported launch/profile and exercise session persistence. Require successful startup and actual writes, not merely a successful import.
- Check cross-process writer contention for the same session: the second writer must be excluded, release must permit reacquisition, and reads/searches must remain usable. Confirm Windows does not create a session.lock file or call flock. Preserve the existing durable-namespace operations.
- On POSIX, run the normal native install and existing flock-based write-ownership tests to prove the platform guard has not disabled compilation or locking there.
- Reinstall with the resulting frozen lockfile to check that the patch is reproducible and not dependent on manual node_modules edits.

## 5. Corridor card and remaining evidence limits

**Full corridor card ID: not established from the allowed task evidence.** The brief gives only the example prefix DSH-0.1.3-A1-…; none of the five fixture files contains a complete card identifier or a card-to-finding mapping. I will not invent a suffix or substitute S20-msvc-flock-trap, which is a benchmark task ID rather than a corridor card. The semantic finding is the Windows fs-ext/native-build dependency and static-import trap in the 0.1.3-alpha.1 persistence package. Identifying its exact full card ID remains blocked by the missing reference in the intended inputs and the prohibition on reading the benchmark skills directory.

The fixture is sufficient to diagnose the failure and specify the two-part downstream patch. It is not a complete fs-ext package or runnable service checkout, so patch applicability, a successful install, and a successful boot remain implementation acceptance criteria, not results claimed by this static report.
