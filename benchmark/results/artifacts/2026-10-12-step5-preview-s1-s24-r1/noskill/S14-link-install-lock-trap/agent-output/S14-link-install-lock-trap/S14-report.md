# S14 · Link-Install File-Lock Trap — Analysis & Recovery Report

**Subject:** `@org/dsh-attach-input` v0.2.11 (lib-only Web plugin, no build step)
**Evidence (read-only fixture):** `copy-session.txt`, `profile-introspection.txt`, `maintainer-thread.md`
**Repo (single physical copy):** `E:\dev\dsh-attach-input` — **Profile entry:** `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input`

---

## 0. Verdict (TL;DR)

1. The profile entry is a **Junction** to the repo (`LinkType : Junction`, `Target : {E:\dev\dsh-attach-input}` — `profile-introspection.txt:3-5`, install marker `# link:E:\dev\dsh-attach-input` in `cordis.patch.yml`, `profile-introspection.txt:13-14`). **The repo tree IS the deployed copy.** Copying repo files into the profile's node_modules was **never** the right move for this install mode — the profile path *is* the repo path.
2. Both locks are process-side: the **running dsh host process** holds the lib files open (EBUSY) and keeps serving the **old code from its module cache**. The browser's only contribution is its **HTTP cache**. Closing the browser tab released nothing because the browser never held the files.
3. The rename-aside trick renamed the files **in the repo itself**, because renames performed on the profile path traverse the junction into `E:\dev\dsh-attach-input\lib`. One directory, one inode, two names.
4. Recovery: stop the host → verify the `.old2` files are the NEW code → rename them back to `client.js` / `index.js` → `node --check` → start host → hard-refresh browser → verify.
5. Correct activation for a link install is **process-level only**: stop host → start host → cache-bypass reload. **No file copy appears anywhere in the procedure.**

---

## 1. What the profile entry actually is

### Evidence

`profile-introspection.txt:1-5` — the profile entry:

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

`profile-introspection.txt:7-11` — the repo root: **no** `LinkType`, **no** `Target` (it is a real, physical directory).

`profile-introspection.txt:13-14` — the installation marker in `C:\Users\me\.dsh\profiles\web\cordis.patch.yml`:

```
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

### What a Junction install means for deployment

- The entry under the profile's `node_modules` is an OS directory **reparse point** — a transparent redirect to `E:\dev\dsh-attach-input`. Every path under the profile entry resolves to the repo tree.
- There is exactly **one physical copy** of every file. `lib/client.js` under the profile and `lib/client.js` in the repo are the same inode under two names.
- Deployment is therefore **already complete at file-save time**: saving the edited repo file instantly changes what the profile plugin tree contains. The only remaining step is *process activation* (host restart) and *client cache invalidation* (hard refresh). "Deploying to the profile" is a no-op in this install mode.
- Direct confirmation from the fixture: `Get-ChildItem E:\dev\dsh-attach-input\lib` and `Get-ChildItem <profile>\lib` show **identical listings** (`copy-session.txt:16-21`) — not because a copy succeeded, but because it is one directory.

### Was copying repo files into the profile's node_modules ever right for THIS install? No.

- Source and destination are the same physical files through the junction, so `Copy-Item E:\dev\dsh-attach-input\lib\*.js <profile>\lib\` (`copy-session.txt:1`) is a self-copy. At best a pointless no-op against identical bytes; in practice it failed with EBUSY anyway (`copy-session.txt:2-4`).
- It also misdiagnosed the failure: the user's stale verification was caused by (a) the still-running old host process serving code loaded at startup, and (b) the browser cache — not by stale bytes on disk. There was never a "deployment" step to perform.
- Copying is the update mechanism for a **copied** (normal) dependency install, where the node_modules copy is genuinely separate bytes. Applying it here was a category error.

---

## 2. The two locks and their owners

### Lock 1 — the filesystem EBUSY ("being used by another process")

- **Owner: the running dsh host process** (the `node.exe` serving the `web` profile's plugin). The host required `lib/index.js` at startup and serves `lib/client.js` through the plugin's route, so it has the lib files held open. On Windows, a file held with an open handle that does not permit write sharing cannot be overwritten — `Copy-Item ... -Force` returns the IOException seen at `copy-session.txt:1-4` and again for `client.js`, `index.js`, `package.json` at `copy-session.txt:7-8`.
- **The browser was never the holder.** A tab only *fetches* `client.js` over HTTP; it never opens the repo files on disk. That is exactly why closing the tab changed nothing (`copy-session.txt:6-8`): the EBUSY persists until the **host process itself** is stopped. No amount of browser-side action can release Lock 1.
- instructive asymmetry: the **rename succeeded** (`copy-session.txt:12-13`) where the copy failed. Renaming is a directory-level operation (delete permission), not a file-level write-sharing operation — so the rename slid past the very lock that blocked the copy, which is what made the "rename-aside" trick do its damage.

### Lock 2 — stale content (two layers)

- **Layer A — host module cache (primary cause of "refresh shows nothing new").** Node keeps required modules in `require.cache` for the life of the process. The host that answered the user's refresh was still executing the **old** `lib/client.js` / `lib/index.js` loaded at its startup; editing files on disk does not change a running process (`maintainer-thread.md:3, 9`). The maintainer's instruction "restart dsh web and hard-refresh" is precisely a **host** restart — the user only refreshed the browser tab, which cannot restart the host.
- **Layer B — browser HTTP cache (why stale code can persist even after the host restarted).** `client.js` is served under the same URL for every version, so after the host restarts and serves new bytes, a normal reload may still be satisfied from the browser's cached copy of the old bundle. Only a **cache-bypassing reload** (hard refresh) forces refetch. Note that closing a tab does not even reliably clear this — the profile's cache can survive into a new tab; the bypass is the reload, not the tab lifecycle.

### Attribution summary

| Symptom | Owner | Released by |
|---|---|---|
| EBUSY on Copy-Item into profile `lib` | Running dsh host process (open lib file handles) | **Fully stopping the host** |
| Browser shows old hover-less code | Old host process (module cache) **+** browser HTTP cache | Host restart **+** hard refresh |

The browser is implicated in neither lock; the maintainer's mental model ("the tab holds the files", "the profile must run an outdated copy") was wrong in both directions.

---

## 3. Why the rename-aside destroyed the SOURCE — and the exact recovery

### Why both directories lost their files

- `$dst = C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib` (`copy-session.txt:11`) is **inside the junction**. `Rename-Item ($dst + '\client.js') 'client.js.old2'` (`copy-session.txt:12-13`) therefore renamed `E:\dev\dsh-attach-input\lib\client.js` — the **repo** file. The profile path resolves through the reparse point to the same directory; there is one file, and the operation hit it.
- The follow-up copy `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')` then failed with *"Cannot find path E:\dev\dsh-attach-input\lib\client.js because it does not exist"* (`copy-session.txt:14-15`) — because that very file had just been renamed away. The "source does not exist" error is the signature of self-destruction: **the source path and the destination path are the same file.**
- The twin `Get-ChildItem` listings (`copy-session.txt:16-21`) both showing only `client.js.old2` / `index.js.old2` are not two damaged directories — they are **one damaged directory seen through two paths**. The plugin currently has **no entry files at all** (no `client.js`, no `index.js`) in both locations, exactly as reported (`maintainer-thread.md:13-15`).

### Recovery from the current broken state

**Important:** the `.old2` files contain the **NEW** edited code — the hover-preview feature and the new read-only route were saved *before* the rename attempts (`maintainer-thread.md:6-7`, `copy-session.txt:12-13`). The edits are not lost; only the filenames are.

1. **Fully stop the dsh host first** (see §4 step 3) — never move files of a link install out from under a running host; this also releases the handles.
2. **Work at the repo path** (`E:\dev\dsh-attach-input\lib`), not the profile path, to avoid junction-induced confusion. The profile shows the same content either way.
3. **Verify the `.old2` contents before restoring** — open them and confirm they contain the new hover-preview code and the new read-only route (feature identifiers); also confirm no other entry files are missing from `lib\` (compare with the package manifest / `git status` in the repo).
4. **Restore the original names** — a pure rename, no copying ever:
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
   ```
   *(Contingency: if verification shows the `.old2` files are the OLD versions, instead restore the intended versions from version control — `git -C E:\dev\dsh-attach-input checkout -- lib\client.js lib\index.js` — and re-apply the edits.)*
5. **Syntax check without executing:**
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```
   (`node --check` only parses; do not `require()` the plugin here — that would start a process holding the modules.)
6. **Activate and verify** using §4 (stop host → start host → hard refresh → verification checks).

---

## 4. Complete, ordered activation procedure (link-installed, lib-only, after repo edits)

| # | Step | Who |
|---|---|---|
| 1 | **Pre-flight** (§5): confirm the install mode from the profile. Link mode → the rest of this procedure contains **no file copy at all**. | Operator |
| 2 | **Edit the repo files** (`lib/client.js`, `lib/index.js`) and save. No build step means the saved bytes are the shipped bytes. Because of the junction, the plugin tree under the profile already resolves them. | Operator |
| 3 | **Fully STOP the dsh host.** Terminate the host process/service that runs the `web` profile (not a soft "reload plugin" — the process keeps its `require.cache`). Confirm it is really gone, e.g. `Get-Process node` empty / `dsh status` shows stopped. **This is what releases the EBUSY handles from §2.** | **Host process: full stop** |
| 4 | **Start the host again.** At startup it requires `lib/index.js` and registers the route serving `lib/client.js`, reading the current bytes from the repo through the junction. | **Host process: full start** |
| 5 | **Hard-refresh the browser (cache bypass).** `Ctrl+Shift+R`, or DevTools → right-click the reload button → **"Empty Cache and Hard Reload"**. Needed for `client.js` because the bundle is served under the same URL across versions and a normal reload would be satisfied from the browser's HTTP cache with the pre-edit bundle. The browser process does **not** need to be closed/stopped — it never held the file locks; the *page* needs a cache-bypassing refetch. If a service worker or aggressive cache headers exist, "Empty Cache and Hard Reload" (or restart the browser) is the fallback. | **Browser: hard reload only** |
| 6 | **Verify the new code actually loaded:** | |
|   | • *Host side:* the startup log shows the plugin loaded / the new read-only route registered; temporarily add a one-line version `console.log` marker in `client.js` if in doubt. | Host log |
|   | • *Served bytes:* DevTools → Network → `client.js` → **Response** contains the new hover-preview code / new marker string; compare the response's size (or hash) with the repo file. | Served bundle |
|   | • *Functional:* hover an image attachment in the app → the preview appears (the check that "showed nothing" before). | Browser |
|   | • *Link integrity (optional):* `Get-FileHash` on the repo file and on the profile-path file — identical by construction, confirming no copy drift. | Filesystem |

**Process restart summary:** HOST = full stop + start (mandatory — releases file handles **and** clears the module cache). BROWSER = cache-bypass reload of the page (mandatory — bypasses the client-bundle cache). Closing tabs is irrelevant to the locks.

---

## 5. Pre-flight check to run BEFORE touching any file

```powershell
# 1. What does the profile entry point to?
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
#   LinkType = Junction  + Target = {E:\dev\dsh-attach-input}   -> LINK INSTALL
#   LinkType = SymbolicLink + Target = {<path>}                 -> LINK INSTALL
#   LinkType = (empty)                                          -> copied / regular dependency

# 2. What does the install manifest say?
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
#   "- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed ...)"
#     -> the "link:" install marker
```

Corroboration: `Get-Item` on `E:\dev\dsh-attach-input` shows no `LinkType`/`Target` → it is the real directory, the single physical copy. (Equivalently: hashes of the profile-path files and the repo-path files are trivially identical — they are the same inodes by construction, which is itself proof no separate copy exists.)

### Why the generic "copy into node_modules" advice is actively harmful for link installs

1. **It is a self-copy.** For a link install, the profile path resolves through the junction into the repo. "Copy repo files into the profile's node_modules" is an instruction to copy a file onto itself — the destination and the source are the same bytes.
2. **It manufactures a fake problem.** It fails EBUSY (host holds the modules), framing a healthy link install as "stale deployed files" and sending you down the wrong troubleshooting path. The real gap is always process state (host) + client cache (browser), never the bytes on disk.
3. **Its failure mode pushes people into destructive "unblocking" moves.** When the copy is blocked, the habitual workarounds are rename-aside, delete-then-copy, or `Remove-Item -Recurse` — and on a junction, each operation performed *through the profile path* lands on the **repo**: renaming renames the source (the observed S14 accident, §3); a recursive delete can drop the junction itself (making the plugin vanish from the profile) or, with tools that follow reparse points, delete the repo. This incident is the case study of that failure mode.
4. **Correct advice is mode-dependent.** Link install → never touch node_modules; stop host, start host, hard refresh. Copied install → stop host, then update/reinstall the dependency (or copy files), start host, hard refresh. One generic workflow cannot serve both, and applying the copied-install workflow to a link install is precisely the trap here.

---

## Appendix — evidence quick reference

| Claim | Source |
|---|---|
| Profile entry is a Junction to the repo | `profile-introspection.txt:1-5` |
| Repo is the real directory (no link) | `profile-introspection.txt:7-11` |
| `link:` install marker in `cordis.patch.yml` | `profile-introspection.txt:13-14` |
| EBUSY on `Copy-Item ... -Force` (both attempts) | `copy-session.txt:1-4`, `7-8` |
| EBUSY persists after browser tab closed | `copy-session.txt:6-8` |
| Rename-aside "succeeded" (rename ≠ copy w.r.t. locks) | `copy-session.txt:12-13` |
| Follow-up copy fails: "source does not exist" | `copy-session.txt:14-15` |
| Both listings show only `.old2` files (same directory, junction) | `copy-session.txt:16-21` |
| User refreshed tab only; stale behavior | `maintainer-thread.md:3, 9` |
| Plugin now has no entry files | `maintainer-thread.md:13-15` |
