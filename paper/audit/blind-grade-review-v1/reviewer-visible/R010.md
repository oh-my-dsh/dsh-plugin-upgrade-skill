# S14 Diagnostic Report · Link-Install File-Lock Trap (@org/dsh-attach-input)

Evidence pack: fixture README.md, copy-session.txt (PowerShell transcript), profile-introspection.txt (LinkType/Target + cordis.patch.yml), maintainer-thread.md. All quotes below are from these files.

## 1. What the profile entry actually is

profile-introspection.txt is unambiguous:

    FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
    LinkType : Junction
    Target   : {E:\dev\dsh-attach-input}

The repo itself is a real directory (`LinkType : ` empty, `Target : {}` for `E:\dev\dsh-attach-input`). The profile's `cordis.patch.yml` confirms the install mode:

    - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)

A Junction is an NTFS directory junction. The path under the profile's node_modules is not a copy of the plugin — it is the same directory on disk as `E:\dev\dsh-attach-input`, re-exported under another path. Consequences for deployment:

- **The repo tree IS the installed copy.** Every edit to `E:\dev\dsh-attach-input\lib\*.js` is already "deployed" the moment it is saved. No copy step exists or can ever be needed.
- Therefore `Copy-Item E:\dev\dsh-attach-input\lib\*.js C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\` was **never the right move for this install mode** — it is a no-op at best (copying a directory onto itself through the junction) and, as the transcript shows, blocked outright by file locks.
- The only remaining work after a repo edit is activation: restart the processes that already loaded the files into memory (see §4).

## 2. The two locks and their owners

**Lock A — why the browser refresh showed nothing new.** The maintainer thread records the user "refreshed the browser tab only — nothing changed (old behavior, no preview)". That is expected: the browser does not read the JS files from disk. The **running dsh host process** serves the client bundle — it loaded `lib/client.js` (and `lib/index.js`) from the profile path at startup and keeps serving its in-memory/loaded version to the page. A refresh only re-fetches what the host serves; since the host never restarted, the refresh faithfully delivered the old code. New code cannot appear until the host process reloads the plugin.

**Lock B — why EBUSY persisted after closing the browser tab.** copy-session.txt shows the file being held is `...\lib\client.js`: "The file ... is being used by another process, so the process cannot access this file." The owner is the **running dsh host process**, not the browser. The host is a long-lived Node process; on Windows, files mapped/loaded by a running process are locked, and closing a browser tab only tears down the HTTP client — the host keeps running and keeps its handle on the lib files. That is exactly why "closes the browser tab, waits, retries" produced the "same IOException for client.js, index.js, package.json". Closing the tab releases nothing; only stopping the host process releases the files.

## 3. Why rename-aside destroyed the SOURCE directory, and recovery

**Why both directories lost the files.** Because both paths are the same physical directory via the junction. The transcript:

    PS E:\dev> $dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
    PS E:\dev> Rename-Item ($dst + '\client.js') 'client.js.old2'
    PS E:\dev> Rename-Item ($dst + '\index.js') 'index.js.old2'
    PS E:\dev> Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')
    Copy-Item : Cannot find path "E:\dev\dsh-attach-input\lib\client.js" because it does not exist.

The renames were performed "at" the profile path but physically renamed files inside `E:\dev\dsh-attach-input\lib` — the one and only copy of those files. Then the copy-back failed because its source (`E:\dev\...\lib\client.js`) had just been renamed away by the same session. Result, per the transcript: both `Get-ChildItem E:\dev\dsh-attach-input\lib` and `Get-ChildItem $dst` list only `client.js.old2` and `index.js.old2` — the plugin has "no entry files at all". The rename-aside trick is only valid when the source and destination are genuinely different directories; through a junction it is self-destruction.

**Exact recovery from the current broken state:**

1. Work in either path (they are identical); using the repo path `E:\dev\dsh-attach-input\lib` makes intent clearest. Stop the dsh host first if further writes are needed (§4), though plain renames of the non-locked `.old2` names may succeed without it.
2. Restore the original names:
   - `Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js`
   - `Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2 index.js`
   (This both restores the package entries and effectively undoes the failed copy — the .old2 files ARE the current latest edits.)
3. Verify syntax before activating: `node --check E:\dev\dsh-attach-input\lib\client.js` and `node --check ...\lib\index.js` (and confirm `package.json` still exists in the package root — it was among the EBUSY-locked files, never successfully touched).
4. Then activate per §4.

No re-copying is required at any point: once names are restored, the junction means the profile already points at the restored files.

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin after repo edits

Precondition: install mode is link (§5), repo edits saved, `node --check` passes on every entry file.

1. **Fully stop the dsh host process** (the profile's running host), not merely the browser session. This releases the Windows file locks on `lib/client.js`, `lib/index.js`, and `package.json` and clears the host's in-memory copy of the old code.
2. While the host is down, make any final file adjustments (here: the §3 renames; for a healthy link install, no file operation is needed at all).
3. **Restart the dsh host / profile.** At startup it resolves `node_modules/@org/dsh-attach-input` through the junction into `E:\dev\dsh-attach-input` and loads the current files — this, not any copy, is the deployment step for a link install.
4. **Hard refresh the browser (cache bypass, e.g. Ctrl+F5) once the host is back.** A hard refresh is required specifically for `client.js` because even after the host serves the new bundle, the browser's HTTP cache may still hold the old client script and replay it without contacting the server — which reproduces exactly the "refreshed and nothing changed" symptom. A plain refresh is not a cache bypass.
5. **Verify the new code actually loaded**, at both layers:
   - Host side: confirm the new read-only host route responds (curl/browser GET on the new route added in v0.2.11).
   - Client side: confirm the hover-preview behavior on an image attachment, and/or check via DevTools Network/Sources that the served `client.js` content contains the hover-preview code (e.g. search the response body for a preview-specific identifier).

Ordering matters: restarting the host without a hard refresh can still show stale client code (browser cache); hard-refreshing without restarting the host only re-fetches the old bundle from the still-running host.

## 5. The pre-flight check: determine install mode before touching anything

Before any deploy-style action, inspect the profile entry the same way profile-introspection.txt did:

- `Get-Item <profile>\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target`
  - `LinkType : Junction` (or SymbolicLink) with `Target` = the repo → **link install**: the repo tree is the installed copy; skip all copying, just restart + hard refresh.
  - `LinkType` empty and files physically present → **copied dependency**: only then does a copy/update procedure into the profile apply (still subject to stopping the host first to release locks).
- Cross-check the install marker in the profile's `cordis.patch.yml`: the line `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)` explicitly records link mode and the source target — a written record that predates any file operation.

**Why generic "copy into node_modules" advice is actively harmful for link installs:**

- It is a self-copy: source and destination are the same physical directory, so it either does nothing meaningful or collides with the host's open file handles (EBUSY), inviting exactly the failed "recovery" improvisation seen in copy-session.txt.
- The rename-aside variant, applied across a junction, renames away the only existing files and then fails to copy replacements from a source that no longer exists — destroying the plugin (current broken state: only `.old2` files).
- It misdirects diagnosis: the maintainer concluded "the profile must be running an installed COPY" and blamed deployment, when the real issue was purely process restart order (§4).

Rule of thumb: **check LinkType/Target (and the cordis.patch.yml marker) first; copy advice applies only to non-linked installs, and for link installs the entire deployment is "restart host, hard-refresh browser, verify".**

## Summary of root causes

| Symptom | Root cause | Evidence |
|---|---|---|
| Browser refresh showed nothing new | Running dsh host serves the client bundle from its loaded copy; host was never restarted | maintainer-thread.md step 3; copy-session.txt context |
| EBUSY on Copy-Item, even with browser closed | Host process, not browser, holds lib files open on Windows | copy-session.txt: IOException for client.js/index.js/package.json after tab closed |
| Rename-aside destroyed source too | Profile path and repo path are the same directory via Junction; rename hit the only copy, then Copy-Item's source was gone | profile-introspection.txt Junction/Target; copy-session.txt "Cannot find path E:\dev\...\client.js" |
| Current broken state | Only `client.js.old2` / `index.js.old2` exist in both views of the single directory | copy-session.txt final Get-ChildItem outputs |
| Wrong remedy chosen | Install mode never checked; copied-install advice applied to a link install | maintainer-thread.md step 4 vs profile-introspection.txt |
