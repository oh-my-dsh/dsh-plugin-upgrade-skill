# S14 — Link-Install File-Lock Trap: Analysis Report

## 1. What the profile entry actually is

`profile-introspection.txt` shows:

```
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

and `cordis.patch.yml` confirms: `node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`.

This is a **link/junction install**: the profile's `node_modules\@org\dsh-attach-input` is a directory junction whose Target is the repo itself at `E:\dev\dsh-attach-input`. For deployment this means there is no separate installed copy — **the repo tree IS the installed copy**. Any edit to `E:\dev\dsh-attach-input\lib\*.js` is immediately visible (at the filesystem level) as the profile's `node_modules\@org\dsh-attach-input\lib\*.js`.

Consequently, `Copy-Item` of repo files into the profile's node_modules was **never the right move** for this install mode. The advice "copy the new files into the profile's node_modules" applies only to a *copied dependency* install. For a link install, copying is at best redundant (you'd be copying a directory onto its own junction, i.e. source and destination are the same directory) and at worst destructive — as step 5 of the thread shows. It is actively harmful because junction traversal makes source and destination the same directory, so the "copy fresh files in" operation has no real "fresh source" separate from the destination.

## 2. The two locks and their owners

Two independent stale-code/lock problems, both owned by the **host**, not the browser:

1. **Stale client bundle (why a browser refresh shows old code).** The plugin is lib-only; `lib/client.js` is served to the browser by the **running dsh host process** (the dsh web host serving its profile). Editing `lib/client.js` on disk does not retroactively change the bundle already loaded in the browser, and a plain tab refresh can be served from the **browser cache** — no new bytes are requested. So the user saw old behavior because the host never re-read the file from disk (it is still serving/holding the old module graph from process start) *and* the browser never bypassed its cache.

2. **EBUSY on the lib files (why Copy-Item failed even with no browser tab).** The files `client.js`, `index.js`, `package.json` are **held open by the running dsh host process** — the host loaded the plugin from disk and keeps handles on the lib files (module loading / dev file serving). The browser tab is irrelevant: closing it did not release the lock because the owner is the **dsh host process**, not the browser. That is why EBUSY persisted with no browser tab open.

## 3. Why rename-aside destroyed the source too, and recovery

`Rename-Item ($dst + '\client.js') 'client.js.old2'` was run on the *profile* path `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js`. But that path is a **junction to the repo**, so it and `E:\dev\dsh-attach-input\lib\client.js` are *the same directory entry*. Renaming it via the junction path renamed the one and only file — visible from **both** paths. Hence:

```
PS > Get-ChildItem E:\dev\dsh-attach-input\lib
client.js.old2
index.js.old2
PS > Get-ChildItem $dst        # profile path via junction
client.js.old2
index.js.old2
```

Then `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...` failed with "source does not exist" because the source had just been renamed by the earlier `Rename-Item`. Both the profile view and the repo view show only the renamed files; there are no entry files at all, so the plugin is broken.

**Recovery from the current broken state** (do not copy, do not re-rename, do not re-install):

1. Stop the dsh host process (and close the browser tab) so nothing holds the files open.
2. In the repo (or equivalently via the junction path — same directory), restore the original names:
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2 index.js
   ```
   (`package.json` was reported locked in the EBUSY error but is not listed among the `.old2` files; confirm it still exists under its original name, and if it was also renamed-aside, restore `package.json` likewise.)
3. Verify `lib/client.js` and `lib/index.js` exist again and parse:
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```
4. Confirm `Get-ChildItem` on **both** paths now shows the same real files (`client.js`, `index.js`, `package.json`) — proving the junction points back at the repo.
5. Then restart (host first, see §4) to activate.

No copy step is needed at any point — restoring names in the repo restores the installed plugin, because they are the same directory.

## 4. Complete, ordered activation procedure (link-installed lib-only Web plugin)

After editing repo files, in this order:

1. **Stop the dsh host process fully** (all dsh/cordis host processes for that profile). This releases the lib-file handles (the EBUSY owner) and tears down the old in-memory plugin module graph, including the code that serves `client.js`. A "reload profile" that leaves the host alive is not sufficient if modules remain cached/locked.
2. **(Browser tab can stay open or be closed; the code bytes come from the host.)** Restart the dsh host the same way you normally launch it. On startup the host re-reads `lib/index.js` (server side) and re-serves `lib/client.js` from the **edited repo tree** — the junction means the profile path now points at your new code. No install/copy step.
3. **Hard-refresh the browser** on the web client (Ctrl+F5 / Ctrl+Shift+R, or DevTools → "Empty cache and hard reload" / disable cache while DevTools open). This is required because the browser may cache `client.js`; a normal F5 can re-use the cached bundle and show the old code even though the host restarted and is now serving the new bytes. The new `client.js` must be fetched without cache.
4. **Verify the new code actually loaded:**
   - In the browser DevTools Network tab, fetch `client.js` during the hard refresh and confirm it is served fresh: status `200` with `(from disk cache)` absent — expect a real `200` and a `200 OK` time, and the response body should contain your hover-preview marker.
   - In the page console / Sources, confirm the new hover-preview code is present (e.g. search Sources for the new identifier or the read-only host route string).
   - Visit the new read-only host route and confirm it responds, proving `lib/index.js` (server side) was reloaded by the host restart.
5. If any of these checks fail, re-check: host fully stopped before restart, hard refresh (not plain F5), and the profile entry is still the junction (§5) — not a copied shadow copy someone accidentally installed over it.

Order rationale: host restart delivers the new server-side bundle and releases file locks; browser hard refresh forces the new `client.js` to be re-requested because the host, not the cache, is the source of truth. Doing only one of the two leaves one party stale.

## 5. Pre-flight check before touching any file

Determine install mode **before** copying, renaming, or deleting anything:

```powershell
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target
Select-String -Path C:\Users\me\.dsh\profiles\web\cordis.patch.yml -Pattern dsh-attach-input
```

Interpretation:

- `LinkType : Junction` (or `SymbolicLink`) with a non-empty `Target` pointing at a repo directory, plus a `cordis.patch.yml` line like `node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input` → **link install**. The repo tree IS the installed copy. Deployment = edit repo, restart host, hard-refresh browser. **Do not** copy into node_modules, **do not** rename files under the junction path.
- `LinkType` empty / `Target : {}` for the profile entry (a real directory), no `link:` marker in `cordis.patch.yml` (or a version/registry spec instead) → **copied dependency install**. Here only does "copy/upgrade into the profile's node_modules" apply, and then you must respect the host's file locks (stop the host first).
- Cross-check the repo side: `Get-Item E:\dev\dsh-attach-input | Select LinkType, Target` should show empty LinkType — it's the real directory the junction targets.

Why generic advice is harmful for link installs: the copied-install instructions assume node_modules contains an independent copy. Under a junction, node_modules path and repo path resolve to the **same** directory, so "copy into node_modules," "rename aside then overwrite," or "delete the old files first" all act **on your repo**: renames destroy the repo's entry files (§3), copies are either no-ops or self-overwrites, and EBUSY from the running host is misattributed to the browser even though the real owner is the host process (§2). The fix in every case is to recognize the junction first and use the activation procedure in §4 instead.

## Summary of the trap

The session failed on all three fronts for one underlying reason: the maintainer treated a **link install** as a **copy install**. The profile entry is a Junction to the live repo, so (a) copying repo → node_modules was unnecessary, (b) EBUSY came from the dsh host process holding the lib files (closing the browser tab couldn't help), (c) rename-aside through the junction renamed the repo's only copy of each entry file, and (d) a plain browser refresh showed stale code because the host process and/or browser cache still served the old `client.js`. Correct path: restore the `.old2` names in place, verify with `node --check`, stop the host, restart the host, hard-refresh the browser, and verify via Network/Sources and the new host route.
