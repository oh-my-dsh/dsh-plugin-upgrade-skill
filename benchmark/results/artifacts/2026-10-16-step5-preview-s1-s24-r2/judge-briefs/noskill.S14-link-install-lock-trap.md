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
#### FILE: S14-link-install-lock-trap/S14-link-install-lock-trap-report.md

# S14 · Link-Install File-Lock Trap — Diagnosis, Recovery & Activation

**Plugin:** @org/dsh-attach-input v0.2.11 — lib-only Web plugin (no build step; shipped files are `lib/client.js` + `lib/index.js`)
**Repo:** E:\dev\dsh-attach-input   ·   **Profile:** C:\Users\me\.dsh\profiles\web
**Install mode (proven in §1):** **LINK / JUNCTION** — the profile consumes the repo tree directly; it is NOT a copied dependency.
**Source of facts:** the read-only evidence pack (`profile-introspection.txt`, `copy-session.txt`, `maintainer-thread.md`, `README.md`). The fixture was inspected read-only and left unmodified.

## Bottom line

For a junction install the **repo tree *is* the installed copy** — there is one physical set of files and both paths see it. So there is no copy, sync, build, or publish step: saving your edit already "deploys" it. The only staleness lives in two *processes*: the **dsh host** (in-memory module cache, and it is the process that serves the client bundle) and the **browser** (HTTP cache of `client.js`). The correct activation is therefore:

> **fully stop the dsh host → start it again → hard-refresh the browser (cache bypass) → verify.**

Everything done after the failed browser refresh rested on a false premise — that a separate "installed copy" existed in `node_modules` — and each step compounded the damage, ending in the rename-aside accident that removed the entry files from *both* paths (because they are the same directory).

---

## 1. What the profile entry actually is

**Evidence — `profile-introspection.txt`:**

```powershell
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target

FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

And the installer's own record in the profile:

```powershell
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

And the repo side has no link — it is the real directory:

```powershell
Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target

FullName : E:\dev\dsh-attach-input
LinkType :
Target   : {}
```

**What this means.** `LinkType : Junction` with `Target : {E:\dev\dsh-attach-input}` says the `node_modules` entry is a **directory reparse point (junction)** — an alias for your repo, not a copy of the package. `E:\dev\dsh-attach-input` (empty `LinkType`/`Target`) is the single *real* directory. Consequently:

- `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js` and `E:\dev\dsh-attach-input\lib\client.js` are **the same file on disk**, reached through two paths. There is exactly one physical copy of every lib file.
- The `cordis.patch.yml` line `# link:E:\dev\dsh-attach-input (installed 2026-08-30)` is the installer's own marker that this is a **link** install.

**What a Junction install means for deployment.** The installer created a *link* instead of unpacking a tarball, so the profile reads your working tree live. "Deploying" a repo edit is therefore a **filesystem no-op**: the moment you save `lib/client.js`, the profile's `node_modules\...\lib\client.js` already reflects it (same file). No build, no copy, no version bump, no publish — that is the entire point of a link/dev install. The one thing a save does **not** update is the *running processes*: the host's in-memory module cache and the browser's HTTP cache still hold the previous bundle until reloaded (§4).

**Was copying repo files into the profile's `node_modules` EVER right for this install? No — never.**
- It is copying a file **onto itself** (junction ⇒ same inode). There is no second copy to update, so the operation is meaningless even in principle.
- The EBUSY it threw is a red herring that hid this: the maintainer read "locked installed copy" into an error that actually means "you are overwriting a file the running host has open — and it is the *same* file you are copying from."
- Copying into `node_modules` is the correct move **only for a *copied* install** (`LinkType` empty, real directory, no `# link:` marker). This is not that.

---

## 2. The two locks and their owners

Two different things were stale/locked, owned by two different processes — and **neither owner is the browser tab**.

**Lock A — the dsh HOST holds the lib files open → this is the EBUSY.**
- *Which process serves the client bundle:* the **dsh host** (`dsh web`). The Web GUI is served by `dsh web` (only `dsh web` injects the boot), and a Web plugin's `lib/client.js` is precisely the code the host hands to the browser over HTTP. The host also loads `lib/index.js` as the host-side plugin (that is where the new read-only route lives).
- Because the host has the plugin loaded (host module + client asset + manifest), it holds OS handles on `lib\client.js`, `lib\index.js` and `package.json` — exactly the three files that EBUSY on the second attempt in `copy-session.txt`. On Windows an open handle ⇒ sharing violation ⇒ *"being used by another process."*
- *Why closing the browser tab did not release the EBUSY:* the browser is a separate process acting only as an HTTP **client**. It receives bytes over the socket; it holds **no OS file handle** on the host's filesystem. Closing the tab frees browser memory and changes nothing on the host. Since the lock survived the tab closing, its owner must be host-side — and the only thing that releases it is **stopping the host**. (For a link install you should never be copying anyway, so this lock is irrelevant to a correct workflow; it matters only as proof the maintainer was fighting the host, not the browser.)

**Lock B — the browser's HTTP cache holds the old `client.js` → this is why a refresh showed stale code.**
- A normal/soft refresh (F5 / click reload) is permitted to satisfy the JS request from cache, so it can keep serving the previously-cached `client.js` even though the correct bundle is already on disk.
- This was compounded by the fact that the maintainer asked the user to "restart dsh web **and** hard-refresh," but the user **only refreshed the browser tab** (`maintainer-thread.md` step 3). So both stale layers were active at once: (a) the host was **never restarted**, so it kept the old `index.js` in its in-memory module cache and kept serving the old bundle from memory; and (b) the browser did a **soft** refresh and got the cached `client.js`. Two stale layers, zero new code — "nothing changed" was guaranteed.
- This is also the answer to *"why can it still show stale code even after the host restarted?"*: restarting the host puts the new bundle on the server, but the browser will not re-request it unless its cache is bypassed — hence the mandatory **hard refresh** in §4.

---

## 3. Why the rename-aside trick destroyed the SOURCE, and the exact recovery

**Why the source directory lost its files too.** The rename was aimed at the *profile* path:

```powershell
$dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
Rename-Item ($dst + '\client.js') 'client.js.old2'
Rename-Item ($dst + '\index.js')  'index.js.old2'
```

But `$dst` is a **junction into the repo**. Renaming through the junction renames the *physical* file in the repo: `E:\dev\dsh-attach-input\lib\client.js` → `E:\dev\dsh-attach-input\lib\client.js.old2` (and likewise `index.js`). The very next command proved it:

```powershell
Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')
# -> Cannot find path "E:\dev\dsh-attach-input\lib\client.js" because it does not exist.
```

The "source" vanished because source and destination are **the same directory** — the rename had just moved the source out from under itself. `Get-ChildItem` then showed only `client.js.old2` / `index.js.old2` on *both* paths, because they are literally one directory listing. Net effect: the entry files that `package.json` (`lib/index.js`) and the client bundle (`lib/client.js`) point at no longer exist under their real names, so the plugin cannot resolve or load at all. Importantly, the `.old2` files are your **edited** versions (you edited before renaming), so the hover-preview feature code is intact — only misnamed.

**Exact recovery from the current broken state (only `client.js.old2` / `index.js.old2` exist).** Do NOT copy or swap anything; just restore names and reload.

1. **Restore the original entry filenames** — operate on the real repo path so the intent is unambiguous (it is the same physical operation through either path):

   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
   ```

2. **Verify integrity + syntax** (read-only; `node --check` parses without executing the module), and confirm the content is the intended edited version (the hover-preview code is present):

   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```

   If anything looks wrong, restore from version control instead of trusting the `.old2` bytes:
   `git -C E:\dev\dsh-attach-input checkout -- lib/client.js lib/index.js`

3. **Activate** — run the §4 procedure (stop host → start host → hard-refresh). No file operations.

4. **Sanity check** — `Get-ChildItem` either path; each must list `client.js` and `index.js` (they are the same directory), with no `.old2` remnants.

---

## 4. Complete, ordered activation procedure (link-installed, lib-only Web plugin, after repo edits)

Prerequisite: confirm it is a link/junction install (§5). If it is, **skip every copy/sync step** — saving the repo edit already updated the installed files.

1. **Confirm install mode** (§5). Link → continue. (Copied → a different procedure where copying *is* valid; not this case.)
2. **Fully stop the dsh host process.** Terminate it and verify it is actually gone (`Get-Process` / Task Manager — make sure no stray `dsh web`/node host survives in another console or as a service). This matters because:
   - a running Node process keeps loaded modules in memory (`require.cache` / module registry); it will keep serving the **old** `index.js` (old routes) until the process restarts, so closing a window while the host keeps running is a no-op;
   - the host is also the process holding the lib files open (the EBUSY source), though for a link install you will not be touching them.
3. **Start the host again** (`dsh web ...`) and wait until it is fully up and serving. On startup it re-reads `lib/index.js` and `lib/client.js` fresh from disk — which, through the junction, are your edited repo files. Host-side routes are now current.
4. **Hard-refresh the browser (cache bypass)** on the plugin page: `Ctrl+F5` / `Ctrl+Shift+R`, or DevTools → right-click Reload → "Empty Cache and Hard Reload." A normal reload may re-serve the cached `client.js` and show stale code. The tab/browser process does **not** need to be closed and reopened — a cache-bypassing reload of the page is sufficient. (This is the step that was skipped.)
5. **Verify the new code actually loaded:**
   - *Client bundle:* DevTools → Network → reload, select `client.js`, confirm `200` and **not** `(from disk cache)` / `304`; DevTools → Sources → open `client.js` and search for the new hover-preview identifier to confirm the served bytes are the new version; functionally, hover an image attachment and confirm the preview appears.
   - *Host route:* call the new read-only route and confirm the new response/behavior — proves the restarted host loaded the new `index.js`.
   - *Process check:* confirm the host is a new process (new PID / fresh startup log) so you know the in-memory module cache was actually cleared.

**Why a hard refresh is needed for `client.js` specifically:** it is a static JS asset served over HTTP with caching headers, so the browser caches it. A host restart changes the server side, but the browser will not re-request the bundle unless the cache is bypassed — which is why stale code can persist even after a correct host restart until you hard-refresh.

**Order rationale:** stop host (clear in-memory modules, release file handles) → start host (load new code from disk) → hard-refresh browser (bypass HTTP cache, fetch the new bundle). Doing only one half leaves the other stale; the host must be fully down before it comes back up.

---

## 5. Pre-flight check before touching any file

Always determine the install mode **first**, from the profile — never assume "installed copy."

1. **`LinkType`/`Target` on the profile entry:**
   `Get-Item <profile>\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target`
   - `LinkType : Junction` (or `SymbolicLink`) with a `Target` pointing at your repo → **LINK install**.
   - `LinkType` empty and `Target` empty, and it is a real directory → **COPIED install**.
2. **`cordis.patch.yml` install marker:**
   `Get-Content <profile>\cordis.patch.yml` → look for the package line.
   - a `# link:<repo-path>` comment (here `# link:E:\dev\dsh-attach-input (installed 2026-08-30)`) → **LINK install**;
   - no `link:` annotation (plain entry / version pin) → **COPIED install**.
3. **Cross-check the repo:** `Get-Item E:\dev\dsh-attach-input` shows empty `LinkType`/`Target` → it is the real tree the junction points at (confirms which side is the single physical copy).

**Decision:**
- **LINK (this case):** repo tree == installed copy. Deploy = save the edit. Activation = stop host → start host → hard-refresh browser. **No file copying, ever.**
- **COPIED:** the profile holds an independent copy; you must get the new files into it (copy or reinstall) **and** restart the host **and** hard-refresh the browser.

**Why the generic "copy into node_modules" advice is actively harmful for a link install:**
- **It is a self-copy.** Source and destination are the same files via the junction, so there is nothing to update — you overwrite the file with itself.
- **It invites destructive "recovery" maneuvers.** Believing a separate locked copy exists leads to rename-aside / force-overwrite tricks to "unblock" the copy; because both paths are the same directory, those tricks mutate your **source repo** — exactly how both trees lost their entry files (§3).
- **It masks the real activation steps.** Effort goes into fighting EBUSY instead of the two things that matter: restart the host and hard-refresh the browser.
- For a link install the filesystem is already in sync; the only staleness is in the host's memory and the browser's cache, and neither is fixed by copying files.

---

## Answers to the maintainer's questions (compact)

- **Why did the browser refresh show nothing new, and why were the lib files "in use" with no tab open?** The host was never restarted (old `index.js` in its module cache, old bundle served from memory) and the browser did a soft refresh that hit its HTTP cache. The "in use" lock is held by the **dsh host**, not the browser — the browser holds no server-side file handle, which is why closing the tab released nothing.
- **What does Junction + Target mean for deploying my edits — was Copy-Item ever necessary?** The junction means the repo tree *is* the installed copy (one physical set of files). Deploy = save. Copy-Item was never necessary and never correct for this install.
- **Why did rename-aside kill the SOURCE too, and what is the recovery?** Renaming through the junction renamed the physical repo files (same directory). Recovery: rename `client.js.old2`→`client.js` and `index.js.old2`→`index.js`, `node --check` both, then activate (no copying).
- **Correct activation procedure / order / browser need / why stale after a host restart?** Fully stop the host → start it → hard-refresh (cache bypass) → verify. Stale-after-restart is the browser's HTTP cache; only a cache bypass fetches the new `client.js`.
- **How should I have determined the install mode before touching files?** `LinkType`/`Target` plus the `# link:` marker in `cordis.patch.yml` (§5). "Copy into node_modules" applies only to *copied* installs.

---

## Appendix — exact command sequences

**A. Pre-flight (determine install mode):**
```powershell
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target
```

**B. Recover the current broken state (only `.old2` files exist):**
```powershell
Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
node --check E:\dev\dsh-attach-input\lib\client.js
node --check E:\dev\dsh-attach-input\lib\index.js
# if content is wrong:  git -C E:\dev\dsh-attach-input checkout -- lib/client.js lib/index.js
```

**C. Activate after repo edits (link install):**
```powershell
# 1) fully stop the host and confirm it is gone
Get-Process dsh,node -ErrorAction SilentlyContinue      # confirm no host remains
Stop-Process -Name dsh -Force                            # or stop the console/service running: dsh web
# 2) start it again and wait until it is serving
dsh web ...
# 3) in the browser: Ctrl+F5  (or DevTools -> Empty Cache and Hard Reload)
# 4) verify: DevTools Network -> client.js is 200 and not (from disk cache);
#    Sources contains the new code; hover preview works; new host route responds
```

*Fixture inspected read-only and left unmodified; report written to `agent-output\S14-link-install-lock-trap\`.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.