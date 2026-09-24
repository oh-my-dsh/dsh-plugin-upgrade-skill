# S14 · Link-Install File-Lock Trap — Diagnosis Report

Task: explain the failed verification of `@org/dsh-attach-input` v0.2.11 (lib-only Web
plugin, no build step) and give the correct activation/recovery procedure.

Mode: read-only inspection (plugin-upgrade skill, Mode A). No migrations, installs, or
file changes were executed; the fixture directory was only read.

Evidence used (all from the read-only fixture):
- copy-session.txt — EBUSY Copy-Item attempts and the rename-aside accident
- profile-introspection.txt — Get-Item LinkType/Target + cordis.patch.yml marker
- maintainer-thread.md — the maintainer's own account of the sequence

---

## 1. What the profile entry actually is

profile-introspection.txt shows:

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

and the profile's cordis.patch.yml carries the install marker:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

This is a **link install** (Windows junction, the pnpm/npm `link:`-style track recorded in
cordis.patch.yml). The profile's `node_modules/@org/dsh-attach-input` is not a copy of the
plugin — it is *another path to the very same directory* as `E:\dev\dsh-attach-input`.
Consequences:

- **The repo tree IS the installed copy.** Editing `E:\dev\dsh-attach-input\lib\client.js`
  and `lib\index.js` already "deploys" the change to the profile. There is nothing to copy.
- Step 4 (Copy-Item from the repo into the profile's node_modules) was **never necessary and
  never correct for this install mode**. It was literally copying each file onto itself
  (source and destination resolve to the same physical file through the junction). On
  Windows, overwriting a file that a running process holds open fails with the observed
  IOException/EBUSY — which is the only reason this self-copy did not silently "succeed".
- The correct "deployment" for a link-installed plugin is process-level, not file-level:
  restart the host (and reload the client) so the new code is loaded. See §4.

## 2. The two locks and their owners

Two independent staleness/lock mechanisms were mistaken for each other:

**Lock A — who serves the client bundle (why the refresh showed nothing new).**
The browser does not read `lib/client.js` from disk. The **running dsh host (the `dsh web`
Node process)** loads the plugin's Host entry from the linked directory and serves/loads
the client code as part of the Web GUI. A browser refresh alone re-requests artifacts from
that still-running host, which is still holding/serving the **old, already-loaded** module
code. So the user's step 3 (refresh tab only) could not show the hover preview: the
process that would have to pick up the new `lib/*.js` from disk — the host — was never
restarted.

**Lock B — who holds the lib files open (why EBUSY survived closing the tab).**
The EBUSY on `client.js`, `index.js`, and `package.json` comes from the **running dsh host
process**, not from the browser. On Windows, a Node process that has loaded/required those
modules keeps the files locked against overwrite-in-place. Closing the browser tab releases
nothing, because the browser never had these files open — the tab only talks HTTP to the
host. That is why the retry "even after the browser tab was closed" produced the identical
IOException.

Secondary staleness (after the host IS restarted): the browser may still serve a cached
copy of the client artifact, which is why a **hard refresh / cache bypass** is part of the
procedure in §4, not a plain reload.

## 3. Why rename-aside destroyed the SOURCE directory, and the exact recovery

The rename-aside trick renamed files "in the profile":

```
Rename-Item ($dst + '\client.js') 'client.js.old2'
```

But `$dst` is the junction — the same physical directory as `E:\dev\dsh-attach-input\lib`.
Renaming through either path renames the one real file. The subsequent copy then failed
with "source does not exist" because the source `E:\dev\dsh-attach-input\lib\client.js`
*is* the file that had just been renamed away. The two identical directory listings at the
end of copy-session.txt (`client.js.old2`, `index.js.old2` in BOTH paths) are the direct
proof that these are one directory seen twice. The plugin (and the repo) now have no entry
files at all.

**Exact recovery from the current state:**

1. **Fully stop the dsh host** (stop `dsh web` / every dsh process; on Windows also verify
   no lingering Node process holds the junction files — this removes Lock B so renames
   cannot fail mid-way).
2. **Restore the original names** — from either path (they are the same directory):
   ```powershell
   $lib = 'E:\dev\dsh-attach-input\lib'   # equivalently the profile node_modules path
   Rename-Item ($lib + '\client.js.old2') 'client.js'
   Rename-Item ($lib + '\index.js.old2')  'index.js'
   ```
   Because the maintainer's feature edits were made in the repo *before* all of this, the
   `.old2` files ARE the edited versions — the rename-aside never actually replaced them.
   Renaming back recovers both the repo and the "installed" plugin in one action.
3. **Verify syntax** before activating (lib-only plugin, no build step, so check directly):
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```
   plus a quick content sanity check that the hover-preview code is present.
4. **Activate** per §4 (restart host, hard-refresh browser, verify).
5. Confirm no stray `.old`/`.old2` or copied duplicates remain in the lib directory.

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin

After editing files in the repo (which is already the deployed copy):

1. **Pre-flight**: confirm install mode (see §5) and syntax-check the edited files
   (`node --check` each entry file).
2. **Fully stop the dsh host** — the process that loaded the old Host half
   (`lib/index.js`) and that is serving the old client code. A browser refresh is not a
   host stop. All dsh processes on the machine should be down so no file locks remain.
3. **Restart the host** (`dsh web` with the same profile). On boot it resolves the
   profile composition through the junction and loads the new `lib/index.js`; the client
   half is served from the new `lib/client.js`.
4. **Hard-refresh the browser (cache bypass)**, e.g. Ctrl+F5 / Ctrl+Shift+R or DevTools
   "Disable cache" + reload. Reason: even against a restarted host, the browser may reuse
   a cached `client.js` artifact; a plain reload can therefore still show stale client
   code after the host restarted. (Host half needs no browser action at all; the browser
   matters only for the client half.)
5. **Verify the new code actually loaded**:
   - functional: exercise the hover-preview on an image attachment and the new read-only
     host route;
   - client side: DevTools Network panel shows `client.js` fetched fresh (200, not from
     disk/memory cache) and the running bundle contains a marker from the new code (e.g. a
     new function/string unique to the feature), or check the plugin's registration/mount
     in the GUI;
   - host side: the host log shows the plugin entry activating without errors, and the new
     host route responds.
6. Only if verification fails, diagnose (host log, served artifact content) — do NOT fall
   back to copying files into node_modules (§5).

Order summary: edit → syntax check → stop host → start host → hard refresh → verify.

## 5. Pre-flight: determine the install mode BEFORE touching any file

Two complementary checks on the profile:

1. **Filesystem introspection of the profile entry** (exactly what
   profile-introspection.txt ended up doing — but it should have come first):
   ```powershell
   Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
     Select-Object FullName, LinkType, Target
   ```
   `LinkType: Junction` (+ Target pointing at the repo) ⇒ link install: the repo tree is
   the installed copy; deployment = restart processes. Empty `LinkType` ⇒ a real copied
   dependency: file replacement (with the host stopped) would be the relevant track.
2. **Composition install marker** in the profile:
   ```powershell
   Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
   # - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed ...)
   ```
   The `link:<path>` marker records the link-install track and its target.

**Why generic "copy into node_modules" advice is actively harmful for link installs:**
- It is redundant at best: destination == source through the junction; there is nothing to
  update.
- While the host runs it fails with EBUSY (the host holds the files), inviting escalating
  "workarounds".
- Those workarounds (rename aside, delete, or force-overwrite through the profile path)
  operate on the **single shared directory**, so they damage the source repo itself —
  exactly the .old2 accident here, which left both views with no entry files.
- It also conflates the two failure layers: the actual staleness was process-level (host
  not restarted; browser cache), which no file copy fixes.

---

## Skill-mode report fields

- **pre-existing / baseline**: not collected (read-only diagnosis task; no builds or tests run).
- **Completed**: full attribution of both locks (running dsh host serves/holds the files;
  browser tab irrelevant to EBUSY), junction deploy semantics, rename-aside failure
  mechanism, recovery plan, ordered activation procedure, and install-mode pre-flight.
- **Skipped**: no runtime verification executed (fixture is static evidence; task forbids
  migrations/installs). No version-corridor cards applied — this is an activation/lock
  diagnosis, not a host-version migration.
- **Pending/residual risk**: recovery (§3) and procedure (§4) are derived from the
  transcript evidence and were not executed against a live profile; if any `.old2` rename
  back fails, re-check for a still-running dsh/Node process before retrying.
- **Rollback**: N/A — no changes were made; the fixture was read only.
- **Recommendations**: always run the §5 pre-flight before any deploy action; for link
  installs treat "deploy" as host restart + hard refresh; never manipulate files through
  the profile's node_modules path of a junction.
