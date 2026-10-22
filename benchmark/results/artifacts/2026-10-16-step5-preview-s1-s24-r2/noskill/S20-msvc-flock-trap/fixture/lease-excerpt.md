# src/lease.ts — cross-process write-ownership lock (excerpt)

> Cross-process write-ownership lock for one session's artifact directory,
> held for the whole life of a write handle. The arbiter is the kernel:
> POSIX takes a non-blocking `flock(2)` (through fs-ext) on `session.lock`
> beside the log, and **Windows holds a named kernel semaphore derived from
> that path — never a file lock or handle**, so readers, searches, and
> directory removal proceed freely while the lock is held. …

```ts
import { flock } from 'fs-ext'
import { acquireLockHandleWin32, releaseLockHandleWin32 } from './win32.ts'
```

> … **Windows has no lock file at all.** Readers never touch the lock. …

Note: `flock` is imported statically at module top — the package loader must
resolve and load `fs-ext` even on Windows, where the `flock` branch is never
taken.
