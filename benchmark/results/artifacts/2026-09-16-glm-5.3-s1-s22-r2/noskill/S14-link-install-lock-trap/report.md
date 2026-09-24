# S14 · Link-Install File-Lock Trap — Analysis Report

## 1. What the profile entry actually is

`profile-introspection.txt` shows:

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

and the profile's `cordis.patch.yml` contains the install marker:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

The profile's `node_modules\@org\dsh-attach-input` is **not a copied dependency** — it is an
NTFS **junction** whose target is the repo directory `E:\dev\dsh-attach-input`. The repo
tree *is* the installed copy; the two paths are two names for the *same* directory tree.
(The repo directory itself has no `LinkType`, confirming it is the real directory and the
profile entry is the link.)

**Deployment consequence:** editing `lib/client.js` / `lib/index.js` in the repo has *already*
"deployed" the change to the profile. There is nothing to copy. Step 4 (`Copy-Item` from the
repo into the profile's node_modules) was never necessary — and never correct — for this
install mode: it was a self-copy of a directory onto itself (source and destination resolve
to the same files through the junction). It could never succeed while the host held the
files open, and even if it had succeeded it would have been a no-op at best. The generic
"copy into node_modules" advice applies only to *copied* (real-directory) installs.

## 2. The two locks and their owners

Two distinct staleness/locking mechanisms were conflated:

**Client-bundle staleness (browser refresh showed nothing).** For a Web plugin, the browser
does not load the plugin's `lib/client.js` directly from disk; the **running dsh host
(`dsh web`) loads the plugin's client half and serves the client bundle** to the browser.
A plain tab refresh just re-fetches what the still-running host serves — the host process
loaded the *old* plugin code into memory at startup and keeps serving it. Refreshing the
browser therefore could not show the new feature; the host had to be restarted first.

**File locks (EBUSY).** The `IOException ... being used by another process` on
`client.js`, `index.js`, and `package.json` is held by the **running dsh host Node.js
process**, not by the browser. On Windows, a process that has a module/file open (loaded
into the module cache, or held with a handle) blocks in-place writes to it. Closing the
browser tab releases nothing, because the browser never had these files open — the tab
talks to the host over HTTP/WebSocket. Only fully stopping the `dsh web` host process
releases the locks.

## 3. Why the rename-aside destroyed the SOURCE directory, and exact recovery

Because the profile entry is a junction to `E:\dev\dsh-attach-input`, the "destination"
path `...\node_modules\@org\dsh-attach-input\lib\client.js` *is*
`E:\dev\dsh-attach-input\lib\client.js` — the very same file. So:

- `Rename-Item ($dst + '\client.js') 'client.js.old2'` renamed the **repo's own**
  `client.js` to `client.js.old2` (same for `index.js`).
- The follow-up `Copy-Item E:\dev\dsh-attach-input\lib\client.js ...` then failed with
  "source does not exist" — the source had just been renamed away by the previous command.
- Result: both `Get-ChildItem` listings show only the `.old2` files, because **both paths
  are the same directory**. The plugin (and the repo) currently has no entry files at all.

**Recovery from the current state** (only `client.js.old2` / `index.js.old2` exist):

1. Stop the `dsh web` host process completely (so nothing holds the files open).
2. Rename the files back to their original names, e.g.
   `Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js` and
   `Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2 index.js` (use the *repo*
   path; the profile path would be identical, but working in the repo avoids the trap
   entirely).
   - Note: the `.old2` files are the *edited* versions from step 1 of the maintainer
     thread — the hover-preview edits were made in the repo before all of this — so simply
     restoring the names restores the intended new code. (If the edits were lost, they
     would need re-applying; here they are intact, just misnamed.)
3. Verify syntax before activating: run `node --check E:\dev\dsh-attach-input\lib\client.js`
   and `node --check ...\lib\index.js` (or import the host half in a throwaway Node
   process) to confirm the files parse.
4. Confirm the tree is intact: `Get-ChildItem E:\dev\dsh-attach-input\lib` should show
   `client.js`, `index.js` (+ `package.json` at the package root), and no `.old2` residue
   (delete the `.old2` names only after the originals are verified).
5. Proceed with activation (§4).

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin

After editing repo files (`lib/index.js` = host half, `lib/client.js` = client half):

1. **Stop the dsh host** (`dsh web`) completely — not just disconnect. This releases the
   Windows file handles on the lib files and, critically, is the only way the *host* will
   load the edited host-half code (`lib/index.js`); a running host keeps the version it
   loaded at startup.
2. (Sanity) `node --check` the edited files; optionally `Get-Item` the profile entry to
   re-confirm `LinkType: Junction` still targets the repo.
3. **Start the host again** (`dsh web`). It now loads the new `lib/index.js` from the repo
   *through the junction* — no copy step exists or is needed.
4. **Hard-refresh the browser (cache bypass, Ctrl+F5 / Ctrl+Shift+R)** — not just F5.
   Even after the host restarts and serves the new `client.js`, the browser may serve the
   *old* client bundle from its HTTP cache (a normal refresh can revalidate to cached
   assets). A hard refresh forces re-fetch of the new client bundle from the restarted
   host.
5. **Verify the new code actually loaded:**
   - Host half: check the host's plugin-load/registration log for the plugin, or exercise
     the new read-only host route the maintainer added and confirm it responds.
   - Client half: exercise the hover-preview feature in the UI; open DevTools → Network
     (checked "Disable cache" or after the hard refresh) and confirm the client bundle
     request returned the new content (e.g. new version marker / new code visible in the
     response, non-`304`/`disk cache` status).

Order matters: host restart **before** browser hard refresh — refreshing against an old
host re-serves the old bundle, which is exactly the stale-code confusion that started this.

## 5. Pre-flight check: determine the install mode BEFORE touching any file

Before any deploy/copy action, inspect the profile entry:

- `Get-Item <profile>\node_modules\@org\<pkg> | Select-Object FullName, LinkType, Target`
  — `LinkType: Junction` (or `SymbolicLink`) with `Target` pointing at a repo directory
  ⇒ **link install**: the repo tree is the installed copy; edits are live once processes
  reload; *never* copy into node_modules.
  `LinkType` empty ⇒ **copied dependency**: updating requires reinstall (`dsh` profile
  install/bundle update) or an explicit copy while the host is stopped.
- Cross-check the profile's `cordis.patch.yml` for the install marker — here
  `# link:E:\dev\dsh-attach-input (installed 2026-08-30)` — which records the same fact
  in configuration.

**Why the generic "copy into node_modules" advice is actively harmful here:** on a link
install the destination *is* the source. A copy is at best a no-op, and — as this incident
shows — any file manipulation (rename-aside, delete-then-copy) performed "in the profile"
is performed on the **repo working tree itself**. What looked like a safe recovery on an
"installed copy" destroyed the maintainer's own source files. Check `LinkType`/`Target`
and the `cordis.patch.yml` marker first, and choose the activation procedure that matches
the install mode.
