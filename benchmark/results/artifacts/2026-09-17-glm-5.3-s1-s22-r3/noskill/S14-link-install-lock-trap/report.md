# S14 · Link-Install File-Lock Trap — Analysis Report

## Summary

The plugin was **link-installed** (an NTFS Junction from the profile's
`node_modules\@org\dsh-attach-input` to `E:\dev\dsh-attach-input`). The profile entry
is not a copy — it IS the repo directory. Every failure in the session follows from
misreading that fact:

- The browser refresh showed nothing because the **running dsh host process** still had
  the old loaded plugin code; only a host restart reloads it (closing the browser tab
  changes nothing).
- The `Copy-Item` into the profile's node_modules hit EBUSY because the destination
  files are the **repo's own files**, held open by the running host, and because the
  source and destination of the copy were **the very same files**.
- The rename-aside trick renamed the shared files in place, so the "source"
  `E:\dev\dsh-attach-input\lib\client.js` ceased to exist the moment it was renamed
  through the profile path — leaving both paths (which are one directory) with only
  `.old2` files.

Recovery is a two-rename fix; the correct activation procedure is
"stop host → verify files → start host → hard-refresh browser".

---

## 1. What the profile entry actually is

Evidence (`profile-introspection.txt`):

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

and the profile's `cordis.patch.yml` carries the link marker:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

The profile's `@org/dsh-attach-input` entry is an **NTFS Junction** whose target is the
repo directory. A junction is a directory-level filesystem alias: every file access
through `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\...`
resolves to `E:\dev\dsh-attach-input\...` — the same physical files, one directory
with two names. The repo itself is a plain directory (`LinkType` empty, no Target), i.e.
the real store; the junction is the alias.

**Deployment semantics:** for a link install, editing the repo files IS deploying. The
"installed copy" and the repo tree are literally the same directory; there is nothing to
copy, sync, or publish. The plugin is also lib-only (no build step), so
`lib/client.js` / `lib/index.js` in the repo are already the shipped artifacts.

**Was Copy-Item ever the right move? No — not once for this install.** Copying repo files
into the profile's node_modules was (a) unnecessary, because the junction already serves
the edited files, and (b) actively harmful: it degenerated into copying each file onto
itself (`E:\dev\dsh-attach-input\lib\client.js` → the same file via the junction),
which is exactly why the open handle produced EBUSY and why the later rename destroyed
the "source". "Copy into node_modules" is advice for a **copied dependency** install;
for a link install it is the wrong mental model from step one.

---

## 2. The two locks and their owners

Two independent things kept the old code alive and the files locked:

### Lock 1 — who serves stale client code (why the refresh showed nothing)

The **dsh host process** (`dsh web` under this profile) serves the client bundle and has
the plugin's Host and Client halves already loaded in memory. `lib/index.js` (Host) was
imported when the host started; the client bundle is served from what the host has
loaded/registered. A browser refresh just re-requests the bundle from a host that is
still running the old code — the user saw the old behavior because **the host was never
restarted**. The maintainer's step 2 advice ("restart dsh web and hard-refresh") was
right; the user only did the refresh half.

### Lock 2 — who holds the lib files open (why EBUSY survived closing the tab)

The **running dsh host process** holds open handles on the plugin files under the
profile path (Node keeps imported modules' files open; on Windows an open handle makes
in-place overwrite fail with "being used by another process" / EBUSY). The browser is not
involved in this lock at all: the browser tab never holds a filesystem handle on
`lib/client.js` — it consumes an HTTP-served bundle. That is why closing the tab and
retrying produced the identical IOException for `client.js`, `index.js`, and
`package.json`. Only terminating the host process releases those handles.

---

## 3. Why rename-aside destroyed the SOURCE too, and the exact recovery

### Mechanism

`Rename-Item ($dst + '\client.js') 'client.js.old2'` renames the file **in place on
disk**. Because `$dst` is a junction to `E:\dev\dsh-attach-input`, the file being
renamed physically IS `E:\dev\dsh-attach-input\lib\client.js`. After the rename,
that path no longer exists under its original name anywhere — so the subsequent
`Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...` correctly failed with
"Cannot find path ... because it does not exist". Both `Get-ChildItem` listings then
showed only the `.old2` files because both paths list the same directory. The rename
was allowed despite the open handle because Windows permits renaming a file with an open
handle (as long as the handle was opened with share permissions that allow rename) —
which is exactly what makes rename-aside look like it "works" right before it breaks
everything.

### Exact recovery from the current state

The files are not lost — they exist as `.old2` in the shared directory. Fix:

1. **Fully stop the dsh host process** (`dsh web` for this profile), and close the
   browser tab for good measure. Nothing should hold handles on the plugin files.
2. Rename the files back to their original names, in the repo path (either path works;
   the repo path makes the intent obvious):
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
   ```
   Verify `Get-ChildItem E:\dev\dsh-attach-input\lib` shows `client.js` and
   `index.js` again (the profile node_modules path will show the same, because it is
   the same directory).
3. **Verify syntax** before activating — the `.old2` contents are the maintainer's
   edited versions (the edits were made in the repo, which is the same directory), so
   check they parse. For a lib-only bundle with no build step, a plain parse check is
   the available gate, e.g.:
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\index.js
   node --check E:\dev\dsh-attach-input\lib\client.js
   ```
   (`--check` validates syntax without executing.) If either fails, fix the file in the
   repo first — do not activate broken code.
4. Only then **activate** per §4.

Do not delete the `.old2` files until the plugin loads correctly, in case the edits
themselves need to be re-inspected or diffed.

---

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin

After editing `lib/client.js` / `lib/index.js` in the repo (no build step, so the repo
files are final):

1. **Verify the files** (names restored, syntax checked) — §3 steps 2–3.
2. **Fully stop the dsh host** running the profile (`dsh web` / the profile's host
   process). This is the process that (a) holds the lib-file handles and (b) has the old
   plugin code loaded in memory. Closing the browser is NOT sufficient and does not need
   to precede this for the file handles, but close it if you want a clean slate.
3. **Start the host again** (`dsh web` under the profile). Node re-imports
   `lib/index.js` through the junction; because the link install makes the repo tree
   the installed copy, no copying is ever performed. The new Host-half code is now live
   and serves the **new** `client.js` bundle.
4. **Hard-refresh the browser** (Ctrl+F5 / Ctrl+Shift+R, i.e. cache bypass, or DevTools
   open with "Disable cache"). Why hard and not plain refresh: the browser may have the
   old `client.js` bundle in its HTTP cache, so a normal refresh can re-serve stale
   client code **even after the host restarted** — this is the residual staleness path
   the maintainer's question points at. A cache-bypassing reload forces the browser to
   fetch the new bundle from the restarted host.
5. **Verify the new code actually loaded:**
   - Behavioral: trigger the new hover-preview feature on an image attachment; confirm
     the new read-only host route responds (the route exists only in the new code, so
     its presence is a clean version probe).
   - Technical corroboration: DevTools → Network → confirm `client.js` was fetched
     (not served from cache) and its response contains the new code (search for a symbol
     unique to the hover-preview change); check the host's startup log/plugin listing
     shows the plugin loaded without errors.
   - Negative check: confirm no lingering EBUSY/lock errors, and that
     `Get-ChildItem` on both paths shows `client.js` / `index.js` with recent
     write times matching the edit.

Ordering rationale: host-stop must precede any file touching (handles); host-start must
precede the browser refresh (otherwise the refresh hits the old or dead host);
hard-refresh must come last because cache staleness is the final layer.

---

## 5. Pre-flight check: determine the install mode before touching any file

Before ever copying/renaming anything under a profile's node_modules:

1. **Interrogate the entry's link metadata** (PowerShell):
   ```powershell
   Get-Item <profile>\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
   ```
   - `LinkType: Junction` (or `SymbolicLink`) with a populated `Target` → **link
     install**; the repo tree IS the installed copy — the only activation action is
     host restart (+ browser hard refresh). Never copy files into it.
   - `LinkType` empty and `Target` empty → a real directory, i.e. possibly a
     **copied dependency** — only then does "update the copy" even begin to apply
     (and even then, prefer reinstall/upgrade tooling over ad-hoc Copy-Item while the
     host is running).
2. **Check the profile's `cordis.patch.yml` install marker**:
   ```powershell
   Get-Content <profile>\cordis.patch.yml
   ```
   The `# link:E:\dev\dsh-attach-input (installed ...)` comment on the
   `node_modules/@org/dsh-attach-input` entry records the link install explicitly.
   A link marker here corroborates the junction and names the source directory.
3. Optionally confirm both paths agree: `Get-ChildItem` the repo dir and the profile
   node_modules path — identical contents (and identical file IDs / write times) confirm
   aliasing.

**Why generic "copy into node_modules" advice is actively harmful for link installs:** it
presupposes the two directories are independent copies, but with a junction they are the
same directory. The copy degenerates into self-overwrite (EBUSY from the host's open
handles), and any file-management trick applied through the profile path (rename, move,
delete) silently mutates the source repository — as the rename-aside step demonstrated
by simultaneously "removing" the files from both paths. The advice doesn't just fail to
help; it destroys the single shared copy that was already correctly deployed.

---

## File references (plain text paths)

- Fixture evidence: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S14-link-install-lock-trap\environment\fixture\copy-session.txt
- Fixture evidence: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S14-link-install-lock-trap\environment\fixture\profile-introspection.txt
- Fixture evidence: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S14-link-install-lock-trap\environment\fixture\maintainer-thread.md
- Task brief: E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\tasks\S14-link-install-lock-trap\instruction.md
