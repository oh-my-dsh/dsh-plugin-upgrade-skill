# S14 · Link-Install File-Lock Trap — Analysis Report

## Executive summary

The profile entry `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` is a **Junction** pointing at the source repo `E:\dev\dsh-attach-input`. The two paths are literally the same directory, so there is nothing to "deploy": editing the repo already updated the installed copy. Every failure followed from treating a link install as a copied install — the Copy-Item was unnecessary, the EBUSY came from the running dsh host (not the browser), and the rename-aside destroyed the single shared directory.

---

## 1. What the profile entry actually is

From `profile-introspection.txt`:

- `Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` → **LinkType: Junction, Target: E:\dev\dsh-attach-input**
- The repo path itself is a normal directory (empty LinkType/Target).
- `cordis.patch.yml` records the install marker: `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`.

A junction is an NTFS directory-level mount: every path under the profile node_modules entry resolves to the same underlying directory as the repo. Consequences:

- The **repo tree IS the installed copy**. There is no build artifact or separate deployment target — the profile "contains" the repo contents by reference.
- Copying repo files into the profile was **never the right move and was never needed**. At best it copies a file onto itself (no-op semantics); here it only surfaced the OS sharing violation. For a link install, "deployment" is complete the instant the repo files are saved.

## 2. The two locks and their owners

Two independent reasons a plain refresh shows nothing new:

1. **Host lock (file locks).** The running dsh host process (the web profile's Node process serving the harness/GUI at 127.0.0.1:3080) has loaded `lib/index.js` into its module cache and may keep open handles on the lib files while serving the client bundle. On Windows, a process's open/loaded-module handles deny overwrite of those files — that is the "being used by another process" IOException. The browser tab is irrelevant here: closing it released nothing because **the browser never held the file locks — the host process did**.
2. **Browser cache.** `lib/client.js` is served as a static script asset and cached by the browser. A normal refresh (or even the browser tab staying open) can keep serving the cached bundle; a **hard refresh (cache bypass)** is needed for client code.

So: EBUSY is owned by the host; staleness in the tab after the host restarted is owned by the browser cache. Two different layers, two different fixes.

## 3. Why rename-aside destroyed the source directory, and recovery

The rename targeted the path under `...\profiles\web\node_modules\@org\dsh-attach-input\lib` — but that path **is** `E:\dev\dsh-attach-input\lib` through the junction. `Rename-Item` on the junction path renamed the single physical files. Then `Copy-Item E:\dev\dsh-attach-input\lib\client.js ...` failed with "source does not exist" because the source no longer had `client.js` — it was just renamed to `client.js.old2` by the previous command, in the same physical directory. Both listings show the identical contents (`client.js.old2`, `index.js.old2`) because they are one directory viewed twice. Note the rename succeeded where the copy failed because Windows permits renaming a locked file (the directory entry is writable even when the file handle is open) — which is exactly why the "trick" both worked and destroyed the state.

**Exact recovery** (from the current state where only `.old2` files exist):

1. In the repo directory `E:\dev\dsh-attach-input\lib` (use the source path — clearer, same directory):

   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2 index.js
   ```

   If a lock keeps this from proceeding it would be at delete/overwrite time, not rename; renames on locked files succeed. If a stray renamed target name ever conflicts, resolve the lock first (step 2 of section 4) rather than renaming again.

2. Verify the restored files are your intended hover-preview versions (check `git -C E:\dev\dsh-attach-input status` / `git diff` — the edits were made in the working tree, so the correct content is what git shows as modified, or restore with `git checkout -- lib` if the edits should be discarded).
3. Syntax-check both entry files before activating:

   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```

4. Only then proceed to the activation procedure (section 4).

Because of the junction, this single rename restores both paths — the profile entry and the repo become healthy together.

## 4. Complete ordered activation procedure (link-installed lib-only Web plugin)

Precondition: repo edits are saved; no copy step exists in this mode.

1. **Stop the dsh host process completely** (all dsh/Node processes serving the web profile — not just a terminal; verify no lingering `node` processes for dsh, e.g. via `Get-Process node`). The host is what holds the file locks and what statically serves `lib/client.js`.
2. (Optional but recommended) Sanity-check syntax: `node --check` on the edited lib files.
3. **Start the host again** (`dsh --profile web` or the usual launcher). On boot it re-imports `lib/index.js` fresh from the junction path — the new host code is now live, including the new host route.
4. **In the browser: hard refresh** (Ctrl+F5 / Ctrl+Shift+R, cache bypass). A normal reload may reuse the cached `client.js`; the hard refresh re-requests it from the restarted host, which now serves the new bytes.
5. **Verify the new code actually loaded**, not just "no errors":
   - Client: check DevTools → Network → `client.js` response contains a new-code marker (e.g. the hover-preview handler name/string), or use a console log the new code emits.
   - Host: exercise the new read-only host route and confirm the new response, or check host logs for the plugin's activation diagnostics.
   - Behavior: open the image-attachment hover and confirm the preview appears.

Why the browser can still show stale code even after the host restarts: the browser caches the served script independently of the host process; only a cache-bypassing reload (or a versioned/uncacheable asset URL) guarantees the fresh client bundle.

## 5. The pre-flight check (before touching any file)

Before any file operation, determine the install mode:

```powershell
Get-Item <profile>\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
```

- **LinkType: Junction/SymbolicLink** with a Target → link install. The Target directory is the installed copy; no copying, no deployment step. Also confirm the marker in `cordis.patch.yml` (`# link:<path>`).
- **No LinkType** (real directory) → copied dependency; only then would copying or reinstalling updated files be meaningful (and even then, with the host stopped to avoid EBUSY).

Why the generic "copy into node_modules" advice is actively harmful here:

- It treats the symptom (stale behavior) whose real cause was a non-restarted host plus browser cache — the files were already current in the profile.
- Through the junction, "copying into the profile" is writing onto the same files the host has open → guaranteed sharing-violation errors that mislead diagnosis.
- Worse, the copy attempt invites "fixes" like rename-aside that mutate the **one physical directory** behind both paths, converting a verification problem into data loss (no entry files at all).
- It also trains the maintainer to skip the actual fix: stop/restart the host and hard-refresh the browser.

## What is tested (per task brief) — how the analysis maps

- Recognizing link/junction install and deploy semantics → Section 1.
- Attributing both locks to the right processes (running host, not the browser) → Section 2.
- Recovering a rename-aside accident safely → Section 3.
- Not applying copied-install advice to a linked install → Sections 4–5.
