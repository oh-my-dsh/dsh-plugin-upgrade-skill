// src/win32.ts — Windows durable namespace + lock bindings (excerpt)
//
// POSIX publishes a newly-created log by creating a directory entry and then
// fsyncing the parent directory. Windows does not expose that parent-directory
// fsync contract through Node, so the Windows path uses the native durable
// namespace primitive instead: …

type MoveFileExW = (existing: string, replacement: string, flags: number) => number
type CreateSemaphoreW = (security: null, initial: number, maximum: number, name: string) => number
type WaitForSingleObject = (handle: number, milliseconds: number) => number
type ReleaseSemaphore = (handle: number, count: number, previous: null) => number
type CloseHandle = (handle: number) => number
type GetLastError = () => number

interface Win32Bindings {
  moveFileExW: MoveFileExW
  createSemaphoreW: CreateSemaphoreW
  waitForSingleObject: WaitForSingleObject
  releaseSemaphore: ReleaseSemaphore
  // …
}

// acquireLockHandleWin32 / releaseLockHandleWin32 wrap these named-semaphore
// primitives; no flock(2) is involved on Windows.
