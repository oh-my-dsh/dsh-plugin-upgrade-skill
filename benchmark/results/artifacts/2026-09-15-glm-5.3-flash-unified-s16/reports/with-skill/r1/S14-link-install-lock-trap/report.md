# S14 · Link-Install File-Lock Trap — Diagnosis Report

Plugin: `@org/dsh-attach-input` v0.2.11 (lib-only Web plugin, no build step; `lib/client.js` + `lib/index.js` are the shipped files).
Evidence cited: `fixture/profile-introspection.txt`, `fixture/copy-session.txt`, `fixture/maintainer-thread.md`.

---

## 1. What the profile entry actually is — a Junction; copying was NEVER the right move

The introspection is unambiguous:

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

The profile's `node_modules` entry is an NTFS **Junction** pointing at the repo working tree `E:\dev\dsh-attach-input`. The profile composition confirms it — `cordis.patch.yml` carries the install marker:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

What a Junction install means for deployment: **the repo tree IS the installed copy.** There is exactly one physical directory behind both paths; `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js` and `E:\dev\dsh-attach-input\lib\client.js` are the same file. The moment the maintainer saved the hover-preview edits in `lib/client.js` / `lib/index.js`, the profile already had them. The v0.1.3-alpha.1 record states the same semantics: "junction installs need no sync" when the host moved across a version edge, and six link-installed Web client plugins "loaded unchanged" — no copy step exists in this install mode.

So `Copy-Item` into the profile's `node_modules` (maintainer-thread step 4) was **never necessary for this install** — it was a no-op by construction (it would overwrite the same physical bytes it read), and as Section 2–3 show, it was worse than a no-op: it triggered the lock failure and then destroyed the only copy of the source.

## 2. The two locks and their owners — both belong to the dsh web host, not the browser

**Why a browser refresh showed nothing new.** Two independent reasons, one per plane:

- **Client plane (`lib/client.js`):** the client bundle is served by the **running dsh web host process** over HTTP. The file on disk already had the new code (junction), but the browser had the old `client.js` in its HTTP cache; a plain refresh (F5) revalidates against and reuses the cached copy. Only a **hard refresh** (Ctrl+F5 / cache bypass) forces the browser to re-fetch the bundle. The migration-hygiene rule applies exactly: "a change landing in `lib/client.js` (client half) takes effect on a browser hard refresh."
- **Host plane (`lib/index.js`):** the running host loaded the old `lib/index.js` into memory at startup and keeps executing it; a browser refresh can never swap a running Node process's loaded modules. "A change landing in `lib/index.js` (host half) requires restarting dsh." The maintainer's step 3 ("user refreshed the browser tab only") therefore could not show anything new — the new read-only host route lives in the host half, and the new preview lived behind a cached client bundle.

**What holds the lib files open.** The **dsh web host process** (Node), not the browser. It loaded the plugin's host half from that junctioned path at startup and holds the loaded module/file handles open for the plugin's lifetime. This is the S12 lesson restated: the running dsh web host holds the loaded host-half / native-module file handles; the file lock is in the host, not the browser. On Windows, `Copy-Item -Force` must open the destination for writing, which is impossible while the handle is open → the `IOException` "being used by another process" on `client.js`, `index.js`, `package.json`.

**Why closing the browser tab did not release the EBUSY.** Because the browser was never the lock owner. The tab held only an HTTP connection and an in-memory copy of the fetched bundle; it held no on-disk handle to the lib files. Closing it released nothing — the host process was still running with the files loaded, so every retry failed with the same IOException. (A browser refresh/close is not a host stop, as the skill's host-upgrade discipline says.)

## 3. Why rename-aside destroyed the SOURCE directory too, and the exact recovery

**Why both paths "lost" their files simultaneously.** `Rename-Item` targeted the profile path, but through the Junction that path **is** `E:\dev\dsh-attach-input\lib`. Renaming `client.js` → `client.js.old2` renamed the **one and only copy** of the file; both directory listings then show only the `.old2` names because they are the same directory viewed twice. Rename succeeded where copy failed because a rename only rewrites a directory entry — Windows permits renaming a file that a process holds open (the open handle follows the rename) — whereas `Copy-Item` needs write access to the file content.

The subsequent `Copy-Item E:\dev\dsh-attach-input\lib\client.js ...` then failed with "source does not exist" for the same reason: the source path was never a separate file — the rename had just removed the only one. There was never a source copy and a profile copy; there was only ever one.

**Exact recovery from the current state** (only `client.js.old2` / `index.js.old2` exist in either view):

```powershell
# 1. Restore the original names — one rename per file, through EITHER path (same directory).
#    Work through the repo path so it is unambiguous which tree you are fixing.
Rename-Item 'E:\dev\dsh-attach-input\lib\client.js.old2' 'client.js'
Rename-Item 'E:\dev\dsh-attach-input\lib\index.js.old2'  'index.js'

# 2. Verify the entry files are back in both views and syntax-check them:
Get-ChildItem 'E:\dev\dsh-attach-input\lib'
Get-ChildItem 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'   # must show the same files
node --check 'E:\dev\dsh-attach-input\lib\client.js'
node --check 'E:\dev\dsh-attach-input\lib\index.js'
```

Notes on recovery:

- Renaming back is safe even while the host is still running (rename is metadata-only); but **do not stop at rename** — the host is still executing the pre-edit code, so continue with the activation procedure in Section 4.
- `package.json` was a copy target in the failed attempts but was **never renamed**, so it should be intact; verify it exists in the listing above (the transcript's only successful mutations were the two renames).
- Do NOT "re-copy from anywhere" or re-install to repair — there is nothing to re-copy from, and no copy is needed in this install mode. If `node --check` had failed, the fix would be a normal source edit in the repo, not a file operation against the profile.

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin after repo edits

Because this plugin shipped edits to **both halves**, both activation actions are required, in this order:

1. **(Pre-flight)** Confirm the install mode first (Section 5). For a link install, expect zero file-deployment steps.
2. **Finish all edits in the repo tree** and syntax-check (`node --check lib/client.js lib/index.js`); since the tree is junction-mounted, any syntax error will break the running profile on next restart, so check before restarting.
3. **Fully stop the dsh web host process.** Close/stop the `dsh web` session itself (kill the host process; verify no dsh/node host process remains). The browser tab and even the browser itself are irrelevant here — only a full host stop releases the lib file locks and unloads the old host half. "A browser refresh is not a host stop."
4. **Restart `dsh web`** (cold start). This loads the new `lib/index.js` (host half: the new read-only route) and makes the host serve the new `lib/client.js`.
5. **Hard-refresh the browser** (Ctrl+F5 / disable-cache refresh). A plain refresh may satisfy itself from the HTTP cache and keep showing the old client bundle even though the host restart already served the new file — this is exactly why the browser can still look stale after a correct host restart.
6. **Verify the new code actually loaded — prove registration/behavior, not a bare HTTP 200:**
   - Host half: request the new read-only route and confirm it responds (new extension behaves; old routes unaffected);
   - Client half: confirm the hover-preview behavior on an image attachment, and/or in DevTools confirm the served `client.js` contains the new feature code and the plugin registered without errors (no "did not activate" / registration console errors);
   - The host boot log should show the plugin entry activating cleanly.

Order rationale: the host stop must precede any file operation (it owns the locks); the restart must precede the hard refresh (the server must have the new content before the cache bypass has anything new to fetch); the hard refresh must precede verification (otherwise you verify a cached artifact).

## 5. The pre-flight check: determine install mode BEFORE touching any file

One read-only command answers it:

```powershell
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
```

- `LinkType : Junction` + non-empty `Target` (here `E:\dev\dsh-attach-input`) ⇒ **link install**: the repo tree is the deployed copy. Cross-check the profile marker in `cordis.patch.yml` — the row's `# link:E:\dev\dsh-attach-input (installed 2026-08-30)` annotation records the link install. Expected workflow after repo edits: stop host → restart host → hard refresh. **No copy step exists.**
- `LinkType` empty + `Target` empty (as `Get-Item E:\dev\dsh-attach-input` itself shows — the real directory) ⇒ an ordinary **copied/registry dependency**: only then are re-install or copy-into-profile operations meaningful (done with the host stopped).

Why the generic "copy into node_modules" advice is actively harmful for link installs:

1. **It is redundant** — the repo edit was already deployed the instant it was saved; the advice sends you hunting for a problem that does not exist (here it misattributed the stale browser view, whose real causes were browser cache + unrestared host).
2. **It cannot succeed while the host runs** (EBUSY), and the failure tempts lock-defeating tricks.
3. **The standard workaround is destructive in this mode:** rename-aside normally lets you slip a new file past a lock, but through a Junction it renames the *only* physical copy of your source file — simultaneously gutting the repo and the profile, with a failed "source does not exist" copy as the cherry on top. That is precisely the broken state recovered in Section 3.
4. Even a "successful" copy would overwrite the same bytes it read from, adding risk (partial copy = mixed old/new halves in the single shared tree) for zero benefit.

**Rule of thumb:** before any file touches a profile `node_modules` entry, ask the filesystem what that entry *is* (`LinkType`/`Target`) and check the `cordis.patch.yml` install marker; a link install makes the repo the deployment target and makes the host restart + hard refresh the entire activation procedure.

---

### Summary of root cause

A link (Junction) install was misread as a copied dependency. The stale browser view was caused by browser cache (client half) and an un-restarted host (host half); the EBUSY locks were held by the running dsh web host process; and the rename-aside trick, applied through the junction, renamed the sole copy of the source files, breaking repo and profile at once. Recovery: rename the `.old2` files back, `node --check`, fully stop the host, restart `dsh web`, hard-refresh the browser, then verify both halves behave. Pre-flight for next time: `Get-Item … | Select LinkType, Target` plus the `link:` marker in `cordis.patch.yml` — and never apply copied-install advice to a linked install.
