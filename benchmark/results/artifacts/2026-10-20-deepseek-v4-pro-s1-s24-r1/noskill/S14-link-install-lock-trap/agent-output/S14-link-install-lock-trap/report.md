# S14 Report — Link-Install File-Lock Trap: Diagnosis, Recovery, and Correct Activation

## 0. One-paragraph diagnosis

The profile entry `node_modules/@org/dsh-attach-input` is an NTFS **Junction** whose
Target is the repo itself (`E:\dev\dsh-attach-input`), as shown in
`profile-introspection.txt` (`LinkType : Junction`, `Target : {E:\dev\dsh-attach-input}`),
with the matching install marker in `cordis.patch.yml`
(`- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`).
So there is **no installed copy** — the repo tree *is* the installed code. Every symptom
follows from missing that fact: the browser showed stale code because the running **dsh
host** process still had the old `lib/index.js` loaded and was serving the old
`lib/client.js`; the EBUSY came from that same **host** process holding the files open
(not the browser, so closing the tab did nothing); and the rename-aside "destroyed the
source" because renaming through the junction renamed the **same** files in the repo.
Recovery is simply renaming the `.old2` files back to their real names and then
activating in the correct order.

---

## 1. What the profile entry actually is

Evidence — `profile-introspection.txt`:

| Path | LinkType | Target |
|---|---|---|
| `…\profiles\web\node_modules\@org\dsh-attach-input` | **Junction** | `E:\dev\dsh-attach-input` |
| `E:\dev\dsh-attach-input` (repo) | *(empty — real directory)* | *(empty)* |

`cordis.patch.yml` records the same thing:
`- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`.

**Meaning for deployment:** a Junction (directory-level NTFS reparse point) makes the
profile's `node_modules` entry *alias* the repo directory. There is no second set of
files anywhere; any path that walks through
`…\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js` resolves to
`E:\dev\dsh-attach-input\lib\client.js`. Editing the repo therefore **immediately**
changes what the profile would load — there is nothing to "deploy" or "sync".

**Was Copy-Item into node_modules ever right?** No. For a link install there is no copied
artifact to refresh. "Copying the new files into the profile" is copying a file onto
*itself* — and worse, because the destination *is* the source through the junction, any
mutating operation performed at the destination (overwrite, rename, delete) acts on the
**repo's** files. The entire premise of step 4 in `maintainer-thread.md` was wrong for
this install mode.

---

## 2. The two locks and their owners

Both "locks" are held by the **running dsh host (server) process**, not the browser.

**Lock A — stale code on refresh.** The dsh host is the process that (a) loads the
host-side entry `lib/index.js` into memory as a module at startup and (b) **serves the
client bundle** `lib/client.js` to the browser over HTTP. After the maintainer edited the
repo, the host kept running with the *old* module graph in memory and kept emitting the
*old* bundle bytes it had already read. A plain browser refresh only re-requests from that
still-running, still-stale host (and may even reuse the browser's own HTTP cache of
`client.js`). Nothing on the client side can make the host re-read the repo files.

**Lock B — EBUSY "file in use".** The same running host process holds open handles (a
Windows share-mode lock) on the plugin's files — the loaded `lib/index.js` and the
`lib/client.js` it serves. `copy-session.txt` shows
`Copy-Item … -Force` failing with "is being used by another process" for exactly those
files.

**Why closing the browser tab did not release the EBUSY:** the browser never held those
files. It is a separate process that only ever received the *served bytes* over HTTP; it
has no handle on the server's filesystem files. Closing the tab terminates the client, but
the dsh host keeps running and keeps its handles/locks. Only stopping the host releases
the EBUSY.

---

## 3. Why rename-aside destroyed the SOURCE, and the exact recovery

**Why the source lost its files.** `$dst` is the profile path
`…\node_modules\@org\dsh-attach-input\lib`, which is a junction into the repo. So

```powershell
Rename-Item ($dst + '\client.js') 'client.js.old2'
Rename-Item ($dst + '\index.js') 'index.js.old2'
```

did **not** rename a profile-local copy — it renamed
`E:\dev\dsh-attach-input\lib\client.js` and `…\lib\index.js` to their
`.old2` names **in the repo**. That is why the very next step,

```powershell
Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')
```

failed with "cannot find path … does not exist": the source had just been renamed to
`client.js.old2` by the previous line. Both `Get-ChildItem` listings then showed the
same two `.old2` files because both paths are the **same directory** viewed twice. No
files were actually destroyed — the edited `.js` files were merely renamed.

**Exact recovery (from the current broken state).** The `.old2` files are the *new,
edited* files (they were renamed after the edit, before any copy succeeded), so renaming
them back restores the new code. Rename is the operation that works here — note the
rename-aside succeeded even while the host still ran, so no Copy-Item is needed:

```powershell
# 0) (Recommended) fully stop the dsh host first, so nothing re-locks during recovery.
# 1) Restore the original names in the repo (the junction sees the same files):
Rename-Item 'E:\dev\dsh-attach-input\lib\client.js.old2' 'client.js'
Rename-Item 'E:\dev\dsh-attach-input\lib\index.js.old2'  'index.js'

# 2) Verify both files exist and are the new edits:
Get-ChildItem E:\dev\dsh-attach-input\lib
Get-Content E:\dev\dsh-attach-input\lib\client.js -TotalCount 20   # sanity: hover-preview code present

# 3) Verify syntax before activating:
node --check E:\dev\dsh-attach-input\lib\index.js
node --check E:\dev\dsh-attach-input\lib\client.js
```

(`package.json` was reported locked by the second Copy-Item attempt but was never
renamed — it lives at the package root, not in `lib/` — so no action is needed for it.)
Then activate per section 4.

---

## 4. Complete, ordered activation procedure (link-installed lib-only Web plugin)

Because a link install has no copy step, "activation" is purely about process restart and
cache bypass:

1. **Fully stop the dsh host process.** This is the only process that must *stop and
   restart*. It releases the file handles (the EBUSY) and drops the in-memory module
   graph so `lib/index.js` is re-read on next start.
2. **(No file copy — link install.)** The repo files *are* the installed files; after the
   section-3 rename-back they already contain the new code.
3. **Start the dsh host again.** It now re-reads `lib/index.js` from the repo (through
   the junction) and begins serving the new `lib/client.js` bytes.
4. **Hard-refresh the browser (cache bypass)** — e.g. Ctrl+Shift+R / Ctrl+F5, or DevTools →
   Network → "Disable cache" → reload, or "Empty Cache and Hard Reload". A normal refresh
   can still reuse the browser's cached `client.js`, so it may keep showing old code
   even though the host is now serving the new file. The hard refresh forces a fresh
   fetch of `client.js` from the restarted host.
5. **Verify the new code actually loaded:**
   - In the browser, hover over an image attachment and confirm the preview appears
     (and the new read-only host route responds, if applicable).
   - Confirm the served bundle is the new one: open DevTools → Network, reload, click the
     `client.js` response, and confirm its content/hash reflects the edit (not a
     cached 304/old bytes).
   - Watch the console for any load/parse errors from the new bundle.

**Order and the host-vs-browser distinction:** the host must be restarted **before** the
hard refresh; restarting the host alone is not enough (the browser cache), and
hard-refreshing alone is not enough (the host still serves/loads old code). The browser is
**never** "stopped/restarted" as a process for a link install — closing the tab was
irrelevant and does not release any lock; it only needs the cache-bypassing refresh.

---

## 5. Pre-flight check — determine install mode BEFORE touching any file

Run this on the **profile entry** before any copy/rename/delete:

```powershell
# (a) Is the node_modules entry a link/junction, or a real copied directory?
Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
  Select-Object FullName, LinkType, Target

# (b) What does the profile's install manifest record?
Get-Content 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' | Select-String dsh-attach-input
```

Interpretation:

- **`LinkType : Junction`** (or `SymbolicLink`) with a **`Target`** pointing at the
  repo, plus a `cordis.patch.yml` line like
  `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed …)`
  ⇒ **link install**. The repo tree *is* the installed copy: edit in place, then only
  restart the host + hard-refresh. **Do not copy, rename, or delete anything through the
  node_modules path.**
- **`LinkType` empty / `Target` empty** (a real directory) and no `link:` marker ⇒
  **copied install**. Only then is there a separate installed copy to refresh (and even
  then, stop the host first to avoid the EBUSY).

**Why generic "copy into node_modules" advice is actively harmful for link installs.**
For a link install there is nothing to copy — the destination already *is* the source — so
the advice is a no-op at best. In practice it is destructive in two ways: (1) the
overwrite attempts hit files the running host holds open and fail with EBUSY (or worse,
succeed into the live repo); and (2) any "rename aside / delete then replace" maneuver is
executed through the junction, so it mutates the **repo's own** files — exactly how this
maintainer ended up with both the repo and the profile missing their entry files. The
install-mode check above is what must gate every subsequent action.
