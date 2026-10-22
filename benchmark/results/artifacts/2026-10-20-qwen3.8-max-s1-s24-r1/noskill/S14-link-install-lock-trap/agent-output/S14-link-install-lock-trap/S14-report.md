# S14 · Link-Install File-Lock Trap — Diagnostic Report

**Plugin:** `@org/dsh-attach-input` (community Web plugin, lib-only, no build step; shipped files `lib/client.js` + `lib/index.js`)
**Repo:** `E:\dev\dsh-attach-input` · **Profile:** `C:\Users\me\.dsh\profiles\web`
**Evidence pack (read-only, SHA-256 verified unchanged):** `profile-introspection.txt`, `copy-session.txt`, `maintainer-thread.md`, `README.md`

## TL;DR

The profile's `node_modules\@org\dsh-attach-input` entry is a **Junction** whose target is the repo (`LinkType : Junction`, `Target : {E:\dev\dsh-attach-input}`), corroborated by the `cordis.patch.yml` marker `# link:E:\dev\dsh-attach-input`. The repo tree **is** the installed copy, so "copying repo files into the profile" was never a deploy step here — it is a self-copy through the junction. Both "locks" belong to the **running dsh host process**, not the browser: the host holds the lib files open (→ EBUSY on Copy-Item, unaffected by closing tabs), and it is also the process that serves the client bundle (→ a plain browser refresh re-requests the same stale/cached `client.js`). Because both paths are one directory, the rename-aside renamed the repo's only, already-edited copies of `client.js`/`index.js` to `*.old2` — which is why the following copy had no source and why "both" directories (really one, listed twice) appeared empty. Recovery: stop the host, rename the two `*.old2` files back (they contain the NEW feature code — nothing was lost), `node --check` both, restart the host, hard-refresh the browser, and verify at the network, host-route, and UI layers.

---

## 1. What the profile entry actually is — a Junction (link) install

Citations from `profile-introspection.txt`:

- `Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target` → `LinkType : Junction`, `Target : {E:\dev\dsh-attach-input}`
- `Get-Item E:\dev\dsh-attach-input` → `LinkType :` (empty), `Target : {}` — the repo is the one real directory.
- `cordis.patch.yml` → `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`

**Interpretation.** The plugin was **link-installed** (a `link:` dependency, npm-link style). The profile's `node_modules` entry is not a directory with its own files — it is a Windows **junction** (reparse point): every I/O operation addressed to the profile path is redirected by the filesystem to `E:\dev\dsh-attach-input`. There is exactly **one copy of the files on disk, and two paths that address it**.

**Deploy semantics.** The repo tree **is** the installed copy. The moment the maintainer saved the edited `lib/client.js` / `lib/index.js` in the repo (maintainer-thread step 1), the profile's "installed" files were already updated — there is **no deploy step at all**. The only remaining work is *activation*: restart the dsh host (so it re-loads host-side code) and hard-refresh the browser (so it re-fetches the client bundle).

**Was copying repo files into the profile's node_modules ever the right move? No — never, for this install mode.** Through the junction, the Copy-Item's source and destination were the *same directory*; `Copy-Item E:\dev\dsh-attach-input\lib\*.js → <profile>\node_modules\@org\dsh-attach-input\lib\` is copying files onto themselves. At best a no-op or a "cannot copy onto itself" error; here it produced a misleading EBUSY (§2) that escalated into the destructive rename (§3). File copying is a deploy step **only for copied installs** (registry/tarball), where node_modules holds independent files. For a link install, *any* file operation performed through the profile path silently mutates the repo working tree.

## 2. The two locks and their owners

**Lock A — the running dsh host process: the file-handle lock (EBUSY).** The dsh host (`dsh web`) serving the `web` profile is a running Node process. At startup it loaded the plugin — required `lib/index.js`, registered the plugin's host routes, and holds/serves the client bundle `lib/client.js` — leaving open OS handles on the plugin files. On Windows, another process writing a file that has open handles gets a sharing violation: exactly the `IOException ... is being used by another process` that Copy-Item reported for `client.js`, `index.js`, `package.json` (`copy-session.txt`). **Owner: the host process — not the browser.**

**Lock B — the browser HTTP cache: the stale-bundle "lock".** The client bundle reaches the browser over loopback HTTP *from the dsh host*; the browser then caches it (memory/disk cache). A plain refresh (F5) can serve cached subresources without re-fetching, so the tab may keep executing the OLD `client.js` even when the host would already serve new bytes. Owner: the browser; broken only by a cache-bypassing reload (hard refresh / DevTools "Disable cache").

**Why the browser refresh showed nothing new (maintainer-thread step 3).** The user refreshed the tab *only*; the host was never restarted. Two compounding causes:

1. **Host-side code is loaded once, at host startup.** The new read-only host route added to `lib/index.js` exists only on disk; the running Node process still holds the module image it required at boot. No browser gesture can make the host re-require it. (And no live HMR applies here: client-plugin hot reload only works while a dev watcher is rebuilding that bundle — a link-installed community plugin in a profile has no such watcher, so a host restart is mandatory.)
2. **The client bundle came from cache.** Even the client-side half of the feature (hover preview in `client.js`) may never have been re-fetched: the browser satisfied the request from its cache (Lock B).

The process that **serves** the client bundle is the **dsh host**, not the browser — refreshing the browser merely re-asks the *same old host* for the *same, possibly cached* asset.

**Why closing the browser tab did not release the EBUSY.** The browser never held a handle to any file under `node_modules` — it only ever received bytes over HTTP. The open handles belonged to the still-running `dsh web` host, which closing a tab obviously does not stop; hence the retry in `copy-session.txt` failed with the identical IOException. The maintainer was debugging the wrong process. The lock releases only when the host process (and any Node children it spawned) fully exits.

**A Windows subtlety that enabled the trap:** `Rename-Item` on the "locked" files *succeeded* — NTFS allows renaming a file whose handles were opened with share-delete, and the host kept running unperturbed (its code was already in memory; open handles follow the renamed file). So the lock blocked write-copy but not rename — an asymmetry that makes "rename aside" look safe right before it isn't.

## 3. Why rename-aside destroyed the SOURCE too — and the exact recovery

**Mechanism.** `<profile>\node_modules\@org\dsh-attach-input` is a junction to `E:\dev\dsh-attach-input` — the two paths are **the same directory**. Therefore, from `copy-session.txt`:

- `Rename-Item ($dst + '\client.js') 'client.js.old2'` renamed the **repo's** file `E:\dev\dsh-attach-input\lib\client.js` — which, because the maintainer edits in place, was the **only copy** of the new hover-preview code. There was no separate "old installed copy" to set aside; the premise of the trick (dest-side file ≠ source-side file) is false under a junction.
- Same for `index.js`.
- The next command, `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...`, failed with **"Cannot find path ... because it does not exist"** — its source had literally just been renamed away *by the previous command, through the other path*.
- The final two `Get-ChildItem` listings (repo lib and `$dst`) look like "both directories lost their files"; in fact they list **one directory twice**: `client.js.old2`, `index.js.old2`. One loss, one directory, two views of it.

Rename-aside is a semi-reasonable trick for a *copied* install (rename the locked stale file, copy the fresh one in, keep the old as fallback). For a *link* install it is a self-attack: the "destination-side" operations strike the source tree, and then the copy step has no source left. Result: the plugin has no entry files under their real names — the host cannot load it and the GUI loses the plugin entirely.

**Key recovery fact: no content was lost.** `client.js.old2` and `index.js.old2` *are* the maintainer's latest edited versions (renamed in place, after the edits), and `package.json` was never renamed. Recovery = rename back. **Do not copy anything.**

**Exact recovery from the current broken state (ordered):**

1. **Stop the dsh host fully** (the process serving the `web` profile: Ctrl+C in its terminal, or `Stop-Process` on the host's node PID). Verify it is gone: the loopback GUI port is no longer LISTENING — `Get-NetTCPConnection -LocalPort <port> -State Listen -ErrorAction SilentlyContinue` returns nothing. Do not activate while a half-loaded host is running; it also holds the handles that caused the original EBUSY.
2. **Restore the original names — in ONE place.** Either path works because they are the same directory; do it in the repo for clarity:

   ```powershell
   Set-Location E:\dev\dsh-attach-input\lib
   Rename-Item .\client.js.old2 client.js
   Rename-Item .\index.js.old2  index.js
   Get-ChildItem .   # expect exactly: client.js  index.js  (no *.old2 left)
   ```

   If a rename fails with a sharing violation, the host is still running — go back to step 1.
3. **Verify before activating** (parse-only; do not run/install/migrate anything):

   ```powershell
   node --check .\index.js
   node --check .\client.js
   ```

   `node --check` parses as CommonJS; if `client.js` is an ES module and --check complains specifically about `import`/`export` syntax, re-check it as a module instead (e.g. `Get-Content .\client.js -Raw | node --input-type=module --check -`) — that complaint is not a real syntax error. Also confirm `package.json` is intact and still names `lib/index.js` (host entry) and `lib/client.js` (client entry), and re-run the introspection to confirm the junction survived: `LinkType : Junction`, `Target : {E:\dev\dsh-attach-input}`.
4. **Clean up:** once verified, delete (or move outside `lib\`) any stray `*.old2`/backup files — in a link install, anything left in the tree is instantly "shipped".
5. **Activate** using the full procedure in §4, and verify per §4 step 6.

## 4. Complete ordered activation procedure (link-installed lib-only Web plugin, after repo edits)

Principle: **edit the repo → verify → restart the host fully → bypass the browser cache → verify at three layers.** No file copying, ever.

1. **Edit in the repo** (`E:\dev\dsh-attach-input\lib\...`). Through the junction this *already* updated the installed plugin; there is nothing to copy into the profile.
2. **Syntax-check the edited files** (`node --check`, §3 step 3) before taking down a working host.
3. **Stop the dsh host for that profile — fully.** "Fully" = the `dsh web` process has exited (its terminal returned / PID gone) **and** the GUI port is no longer listening. The host owns Lock A (open handles on the lib files) and the in-memory image of `lib/index.js`; an orphaned Node child keeps files locked and stale code served. Closing browser tabs is irrelevant to this step.
4. **Start the host again on the same profile** (the usual `dsh web` launch). Startup re-requires `lib/index.js` — this is the moment the new host route and any manifest changes come into existence. Host restart is *required* for host-side code; no refresh substitutes for it, because nothing watches/rebuilds a link-installed plugin's bundle.
5. **Hard-refresh the browser with cache bypass** — Ctrl+F5 / Ctrl+Shift+R, or DevTools → Network → "Disable cache" + reload. Why: `client.js` is an HTTP-served bundle and the browser caches it (Lock B); a plain refresh can serve the previous copy from cache even when the restarted host serves new bytes, so the tab can still run old client code after a perfect host restart. The cache bypass forces a real fetch from the new host.
6. **Verify the new code actually loaded — at three layers; don't trust behavior alone:**
   - **Network layer:** DevTools → Network → the plugin's `client.js` shows a fresh `200` response (not "(disk cache)"/"(memory cache)"), and its response text contains a marker string from the new feature (e.g. a hover-preview identifier); DevTools → Sources shows the new code.
   - **Host layer:** call the new read-only host route directly, e.g. `Invoke-WebRequest http://127.0.0.1:<gui-port>/<new-route>` → expect `200` after the restart (it would have been `404` before — a clean A/B proof the host picked up the new `index.js`).
   - **UI layer:** exercise the feature — hover an image attachment, see the preview.
   - *(Sanity, optional):* re-run `Get-Item ... | Select LinkType, Target` → junction intact, target = repo.

**Order rationale:** restart the host *before* hard-refreshing (refreshing against the old host just re-caches stale code); stop *fully* before starting (two hosts on one profile fight over the port and file handles); verify syntax *before* stopping anything (never take down a working host for a broken file).

## 5. The pre-flight check before touching any file

**Determine the install mode first — read-only, two commands, thirty seconds:**

1. **Introspect the profile entry:**

   ```powershell
   Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
     Select-Object FullName, LinkType, Target
   ```

   - `LinkType : Junction` (or `SymbolicLink`) with `Target` = a dev repo ⇒ **link install**: the profile path is an alias of the repo. Never copy into it, never rename/delete through it; activation = host restart + browser hard refresh, period.
   - `LinkType :` empty and a real directory with its own files ⇒ **copied install**: node_modules is independent of any repo, and *there* (and only there) is updating the files in node_modules — preferably via a proper package reinstall — the deploy step.
2. **Read the profile's install marker:** `Select-String -Path <profile>\cordis.patch.yml -Pattern 'dsh-attach-input'` → `# link:E:\dev\dsh-attach-input (installed 2026-08-30)` ⇒ link install (corroborates the junction); a plain version/registry spec (e.g. `@org/dsh-attach-input@0.2.11`) ⇒ copied dependency. If marker and filesystem disagree, trust the filesystem (`LinkType`/`Target`) and investigate. *(Optional third check: compare a file hash or the `package.json` version between repo and profile entry — under a junction they are identical because they are literally the same files.)*

This pre-flight, run before maintainer-thread step 4, would have shown `Junction → E:\dev\dsh-attach-input` plus the `link:` marker, and the entire Copy-Item → EBUSY → rename-aside cascade would never have started.

**Why the generic "copy into node_modules" advice is actively harmful (not merely unnecessary) for link installs:**

- **It is a self-copy.** Source and destination resolve to the same directory; at best a no-op, and `-Force` overwriting a file with itself mid-read can truncate/corrupt it.
- **"Destination-side" operations mutate the source tree.** Every rename/delete/overwrite done through the profile path edits the maintainer's only copy of the code. Here it destroyed the entry files on "both" sides at once and stranded the only copy of the new feature code under `*.old2` names. In a copied install a botched update leaves the repo untouched; in a link install it can destroy the repo.
- **It misdirects the diagnosis.** The resulting EBUSY was blamed on the browser — a process that never touches plugin files — sending the operator to ever more destructive "unlock" tricks, when the real fix was always: stop the host, restart the host, hard-refresh. Zero file copying.
- **It invents divergence that cannot exist in a link install** — half-copied trees, stray backups, "profile vs repo" version drift — all meaningless when there is exactly one directory.

**One-line rule:** `Junction`/`link:` ⇒ the repo IS the install — never copy, never rename through node_modules; stop the host, work in the repo, restart the host, hard-refresh the browser, and verify at the network + host-route + UI layers.

---

*Prepared from the sealed evidence pack only; the fixture directory was verified byte-identical (SHA-256 vs `fixture-hash-before.json`) before and after this analysis. No migrations, installs, or external services were executed.*
