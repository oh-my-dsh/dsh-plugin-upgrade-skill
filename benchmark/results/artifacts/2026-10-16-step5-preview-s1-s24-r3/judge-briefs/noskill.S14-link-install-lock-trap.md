# JUDGE BRIEF · noskill.S14-link-install-lock-trap

## Criteria (sealed rubric)
- [junction-deployment] (20pt) Use profile-introspection.txt LinkType Junction, Target and/or the link marker to establish that the profile entry resolves to the repo working tree. Repo edits already change the installed copy; copying those files through the junction is unnecessary and can act on the same physical files. Distinguish this from a copied dependency installation.
- [host-lock-and-client-cache] (20pt) Relate copy-session.txt and maintainer-thread.md to the running DSH host holding the loaded lib files/old module state. Closing a browser tab does not stop the host or release its lock. Separately explain stale client delivery/browser caching and why host restart plus cache-bypassing refresh is needed. Do not treat browser caching as a filesystem lock or extrapolate this host’s serving behavior to all DSH versions.
- [rename-recovery] (20pt) Explain why renaming through the junction renamed the sole source files and made the subsequent source copy fail. Restore client.js.old2 to client.js and index.js.old2 to index.js, preserve their contents, verify both with node --check or an equivalent syntax check, then activate. Stopping the host before restoration is a valid precaution; do not require renaming while locked or recreating/deleting the files.
- [ordered-activation] (20pt) Give the actual dependency order after repo edits/recovery: fully stop the host, restart dsh web, hard-refresh/bypass browser cache, then verify the new version/feature and absence of load errors. Syntax checking alone is not activation, and restarting only the browser is insufficient. Judge semantic order rather than the textual order of paragraphs.
- [install-mode-preflight] (20pt) Before any deployment file operation, inspect the actual profile entry with LinkType/Target or the cordis.patch.yml link marker and choose the procedure for linked versus copied installation. Explain why generic copy-into-node_modules advice caused this incident. Equivalent filesystem inspection is valid.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [copy-through-junction] ceiling=40 The final recovery/deployment plan still copies repo files onto the same junction target, deletes the only surviving .old2 files, or treats the two paths as independent copies. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [browser-only-activation] ceiling=40 The plan says browser refresh/closure alone releases the host lock or makes the host-side edit effective, without stopping and restarting the host. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S14-link-install-lock-trap/S14-link-install-lock-trap.md

# S14 · Link-Install File-Lock Trap — Diagnosis, Recovery, and Correct Activation Procedure

**Subject:** `@org/dsh-attach-input` v0.2.11 — lib-only Web plugin (no build step; `lib/client.js` + `lib/index.js` are the shipped files), installed into profile `C:\Users\me\.dsh\profiles\web`
**Evidence (read-only fixture):** `copy-session.txt`, `profile-introspection.txt`, `maintainer-thread.md`, `README.md`

**Verdict up front:** the profile install is a **junction (link) install** — the repo tree `E:\dev\dsh-attach-input` **is** the installed copy, reached through a second path. Every "copy into node_modules" action was therefore unnecessary; the EBUSY, and the final destruction of both entry files, both trace to the same two facts: (a) the **running dsh host process** holds the plugin's files open, and (b) the **junction makes "the profile's copy" and "the repo original" the same files**, so any file operation through one path is an operation on the other.

---

## 1. What the profile entry actually is

Evidence — `profile-introspection.txt`:

```
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}

Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target
LinkType :                (empty — this is the real directory)
Target   : {}

Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

- The profile entry is a **Junction** — an NTFS directory reparse point whose target is the repo. There is **no second copy** of the plugin inside the profile: the path `...\profiles\web\node_modules\@org\dsh-attach-input` is *resolved* to `E:\dev\dsh-attach-input` at I/O time. The repo directory itself reports no `LinkType` — it is the one real directory; the profile path is the alias.
- The profile's own manifest agrees: `cordis.patch.yml` carries the install marker `# link:E:\dev\dsh-attach-input (installed 2026-08-30)`.

**What a junction install means for deployment:**

- Editing `lib/*.js` in the repo **is** the deployment. The profile reads those exact bytes through the junction; nothing is copied, synced, or rebuilt (the plugin is lib-only, no build step).
- There is exactly **one** copy of each file. Any create/rename/delete through *either* path acts on the same directory entries and file records.
- Consequently, "deploying" after a repo edit means only: **restart the host** (so it re-reads the host-side module from disk) and **hard-refresh the browser** (so it re-fetches the client bundle instead of using its HTTP cache). No file movement of any kind is involved.

**Was copying repo files into the profile's node_modules EVER the right move for this install mode? No — never.**

- With a junction, source and destination are literally the same files. Had the files been unlocked, `Copy-Item E:\dev\dsh-attach-input\lib\*.js ...\node_modules\@org\dsh-attach-input\lib\ -Force` would have been a file copying onto itself — a pointless no-op.
- With the host running, it was guaranteed to fail with a sharing violation — which is exactly what `copy-session.txt` records ("The file ... is being used by another process" for `client.js`, `index.js`, **and** `package.json`).
- Copying is a *copied-install* operation. Applying it to a linked install was a category error, and it set up every subsequent failure (see §3).

---

## 2. The two locks and their owners

**Both locks are owned by the running dsh host process (the `dsh web` server) — not by the browser.**

| Locked file(s) | Owner | Why it is held open |
|---|---|---|
| `lib/index.js`, `package.json` | dsh host process | The host's plugin loader read the plugin manifest and loaded the host-side entry module at startup; the loaded module (and its file handles) live for the lifetime of the host process. |
| `lib/client.js` | dsh host process | The host is the HTTP server that **serves the client bundle** to the browser. It reads/holds `client.js` to serve it. The browser never opens the file on disk — it only receives bytes over HTTP and caches them in its own memory/HTTP cache. |

**Why a browser refresh showed stale code — two independent layers, both untouched:**

1. *Host layer:* the host had already loaded the plugin at startup and keeps the old host-side module in memory; it will not re-read `lib/index.js` / `package.json` until the process restarts.
2. *Browser layer:* the browser caches the previously downloaded bundle; a plain F5 reload can be satisfied from the HTTP cache without re-requesting anything.

The maintainer's instruction — "restart dsh web **and** hard-refresh the browser" — addressed both layers. The user only refreshed the tab (`maintainer-thread.md` step 3), and the host was never restarted, so *neither* layer was invalidated. Nothing changed because nothing that serves or caches the code was ever reloaded.

**Why closing the browser tab did not release the EBUSY:** the browser was never the locker. It holds no handle on any file under `E:\dev\...` or `C:\Users\me\.dsh\...` — it talks to the host over HTTP. The sharing violation is on the host's filesystem, owned by the host process; only a **full stop of that process** releases the handles. The retry in `copy-session.txt` ("maintainer closes the browser tab, waits, retries") was guaranteed to fail again for the same reason — and did.

---

## 3. Why the rename-aside trick destroyed the SOURCE directory — and the exact recovery

**Mechanism.** The renames were run through the *profile* path:

```powershell
$dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
Rename-Item ($dst + '\client.js') 'client.js.old2'
Rename-Item ($dst + '\index.js')   'index.js.old2'
```

A junction is not a copy — it redirects path resolution to the target directory. Renaming a file "in the profile" renames the directory entry **in `E:\dev\dsh-attach-input\lib`**, because that *is* the same physical directory (same directory entries, same file records). Both paths immediately show `client.js.old2`. The follow-up

```powershell
Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')
```

then failed with *"Cannot find path `E:\dev\dsh-attach-input\lib\client.js` because it does not exist"* — the maintainer had just renamed the source away **through the junction**, while believing they were renaming a disposable profile-side copy. Final state (`copy-session.txt`): `Get-ChildItem` on **both** paths shows only `client.js.old2` and `index.js.old2` — the plugin has no entry files at all (no host entry `index.js`, no client bundle `client.js`).

**Current broken state:**

- `E:\dev\dsh-attach-input\lib\` (== the profile's `lib\` through the junction) contains **only** `client.js.old2` and `index.js.old2`.
- **The content is intact and is the NEW code:** the maintainer edited the files (thread step 1) *before* the renames (thread step 5), and a rename does not change bytes. Only the file *names* are wrong.
- `package.json` was never renamed — the copy attempts failed before touching it, so it is intact.

**Exact recovery from the current state (restore names → verify syntax → activate):**

0. **Delete nothing.** The `.old2` files are the only copy of the content. Do **not** run any install/`pnpm` "repair" command — the install is already correctly linked, and reinstalling risks replacing the junction with a copy or repointing it.
1. **Fully stop the dsh host process** for this profile (per §4 step 2 — stop it, then confirm with `Get-Process` that no dsh/node process for the profile survives). This guarantees the renames below cannot be blocked and clears the host's stale module state.
2. **Restore the original names via the repo path** (the canonical one — avoid the junction path to remove all ambiguity):
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2 index.js
   Get-ChildItem E:\dev\dsh-attach-input\lib
   # expect: client.js, index.js, package.json
   ```
3. **Verify the restored content and its syntax:**
   ```powershell
   Select-String -Path E:\dev\dsh-attach-input\lib\client.js -Pattern '<identifier unique to the hover-preview code>'   # new feature actually present?
   node --check E:\dev\dsh-attach-input\lib\index.js
   node --check E:\dev\dsh-attach-input\lib\client.js
   ```
   (If the package is ESM, use the matching check, e.g. `node --input-type=module --check < file`. If a check fails or the new code is missing, restore from git instead: `git -C E:\dev\dsh-attach-input restore --source=HEAD -- lib/client.js lib/index.js`.)
4. **Sanity checks:**
   - Junction still intact: `Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object LinkType,Target` → expect `Junction` → `E:\dev\dsh-attach-input`.
   - One file, two paths: `(Get-FileHash E:\dev\dsh-attach-input\lib\client.js).Hash -eq (Get-FileHash C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js).Hash` → expect `True`.
   - Optionally `git -C E:\dev\dsh-attach-input status` should now show only the intended feature edits.
5. **Activate** — host start + browser hard refresh, exactly per §4.

---

## 4. Complete, ordered activation procedure (link-installed, lib-only Web plugin, after repo edits)

**Precondition:** install mode confirmed as link/junction (§5), and the repo files already contain the new code (for a link install, editing the repo *is* the deploy — nothing is copied).

1. **Finish/verify the edits** in `E:\dev\dsh-attach-input\lib\*.js` — here: hover-preview in `client.js`, new read-only host route in `index.js`.
2. **Fully stop the dsh host process** — not merely "close the window":
   ```powershell
   Get-Process dsh,node -ErrorAction SilentlyContinue   # identify the host process
   # stop it (Ctrl+C in its console, or Stop-Process), then re-check until it is gone
   ```
   Why: the host holds `lib/index.js` / `package.json` / `lib/client.js` open (any file change now would hit the same EBUSY) and keeps the previously loaded host-side module in memory; only a fresh process re-reads them from disk.
3. **If any files still need changing, do it now** — while the host is stopped, always via the repo path. (For this incident the files were already edited; the broken names were fixed per §3.)
4. **Start the host** (`dsh web`, or the profile's start command). Wait for startup to complete and confirm in its output/log that `@org/dsh-attach-input` loaded without error — a missing `index.js` at this point is what "completely broken" looks like: the load failure names the plugin.
5. **Hard-refresh the browser — cache bypass:**
   `Ctrl+F5` / `Ctrl+Shift+R`, or DevTools (F12) → right-click the reload button → **Empty Cache and Hard Reload** (or Network tab → **Disable cache** while DevTools is open, then reload).
   Why this is required for `client.js`: the bundle is served by the host over HTTP and cached by the browser; a normal reload may be answered from the browser's HTTP cache, and the host itself may hold the bundle from its first request. Step 4's restart clears the host-side state; only the hard refresh guarantees the browser discards its cached copy and re-fetches the new bytes from disk. The browser does **not** need to be closed or restarted — its staleness is a cache issue, not a lock. (If the GUI registers a service worker, unregister it as well.)
6. **Verify the new code actually loaded:**
   - **DevTools → Network:** the `client.js` request returns **200**, *not* "(from disk cache)"; open the **Response** and search for a symbol unique to the new code (e.g. the hover-preview handler) — its presence proves the served bundle is the new one.
   - **DevTools → Console/Sources:** evaluate an export/flag only the new code defines, or set a breakpoint in the new handler.
   - **Functional test:** hover an image attachment → the preview appears (the new feature).
   - **Host side:** the host log shows the plugin loaded; exercise the new read-only route (e.g. `Invoke-RestMethod`/`curl`) and confirm the new response shape.

**Which processes must stop and restart — summary:**

- **Host process: yes, fully stop and start.** It owns both file locks and the in-memory host-side module; nothing it serves changes until it does.
- **Browser: no restart needed.** It needs only a cache-bypassing reload. Closing tabs has no effect on either the lock or the served code.

---

## 5. Pre-flight check — determine the install mode BEFORE touching any file

1. **Introspect the profile entry** (the check that was skipped, and the one that answers everything):
   ```powershell
   Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
     Select-Object FullName, LinkType, Target
   ```
   - `LinkType : Junction` (or `SymbolicLink`) with `Target : {E:\dev\dsh-attach-input}` → **link install**: the repo tree *is* the installed copy. Deploy = edit repo → stop host → start host → hard-refresh browser. Never copy.
   - `LinkType` empty → a real directory inside the profile → **copied install**: the profile holds its own copy; repo edits require re-copying the changed files (with the host fully stopped, or the same EBUSY returns) followed by a host restart.
2. **Read the install marker in the profile's patch file:**
   ```powershell
   Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
   # - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
   ```
   A `link:<path>` marker means linked; a bare entry / version entry means copied.
3. **Cross-check identity (cheap and decisive):** hash the same relative file through both paths — equal hashes mean one file reachable by two paths (link); or drop a marker file in the repo and watch it appear under the profile path.

**Why the generic "copy into node_modules" advice is actively harmful for link installs:**

- **No-op at best:** through the junction, source and destination are the same files — you would be copying a file onto itself.
- **Guaranteed failure with the host running:** the host holds those files open (EBUSY), and that failure is precisely what tempted the destructive "rename-aside recovery" — which, *through the junction*, renamed the repo's own entry files and left both paths with no `client.js`/`index.js` at all. The copy advice didn't just waste time; it directly caused the outage.
- **It masks the real fix:** for a link install the entire activation procedure is *stop host → start host → hard-refresh browser*. No file movement happens at any point, so any workflow built around copying is solving a problem that does not exist for this install mode.

---

## Evidence map

- Junction + Target + `link:` install marker → `fixture/profile-introspection.txt`
- EBUSY on `client.js`, `index.js`, `package.json` (twice, including after closing the browser tab); rename-aside; "source does not exist"; both directories left with only `.old2` files → `fixture/copy-session.txt`
- Timeline: edit repo → tell user to restart host + hard-refresh → user refreshed tab only → copy attempts → rename-aside → plugin broken → introspection → `fixture/maintainer-thread.md`


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.