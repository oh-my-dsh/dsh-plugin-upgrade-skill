# JUDGE BRIEF · skill.S14-link-install-lock-trap

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

# S14 · Link-Install File-Lock Trap — Diagnosis Report

**Case**: `@org/dsh-attach-input` (lib-only Web plugin, no build step), repo `E:\dev\dsh-attach-input`, profile `C:\Users\me\.dsh\profiles\web`, host `dsh web` on Windows.
**Evidence**: fixture `profile-introspection.txt`, `copy-session.txt`, `maintainer-thread.md` (read-only). Skill references cited inline.

---

## 0. Executive summary

The profile entry is a **Junction (directory hard link) to the repo**: `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` *is* `E:\dev\dsh-attach-input` — there is no second copy anywhere. Editing `lib/*.js` in the repo therefore **already deployed** the change; the only missing steps were **restarting the dsh host** (host half, and the boot-time client-bundle cache) and a **browser hard refresh** (browser cache + the page's in-flight bundle). The copy attempt was a file-onto-itself that could only fail EBUSY, and the rename-aside "recovery" renamed the **one and only** physical file twice, breaking repo and profile simultaneously. The running host owns the file locks — not the browser — which is why closing the tab changed nothing. The plugin is recoverable in three commands (rename back → `node --check` → host restart + hard refresh); nothing needs reinstalling.

---

## 1. What the profile entry actually is (cited from `profile-introspection.txt`)

```
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}          ← profile-introspection.txt:3-5

Get-Item E:\dev\dsh-attach-input | Select FullName, LinkType, Target
FullName : E:\dev\dsh-attach-input
LinkType :                                   ← the repo itself is an ordinary directory
Target   : {}                                 ← profile-introspection.txt:9-11

Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
                                              ← profile-introspection.txt:13-14
```

**Install mode: link/junction install**, created by the documented `link:` recipe (write `"<plugin package name>": "link:<absolute path>"` into the profile's `package.json` dependencies, `pnpm install` → junction — skill `references/rollup-0.1.2.md` **R-09**:237-243).

**What a Junction means for deployment:**

- A junction is a directory reparse point: the profile-side path and the repo path are **two names for one and the same physical files**. `.../@org/dsh-attach-input\lib\client.js` and `E:\dev\dsh-attach-input\lib\client.js` have the same NTFS file ID. There is no "installed copy" to update.
- Therefore "deploying" a repo edit to this profile is a **no-op**: saving `lib/client.js` / `lib/index.js` in the repo *is* updating the install. The profile composition row in `cordis.patch.yml` resolves through the junction at every boot. Corroborated by the 0.1.3-alpha.1 card fleet record: six link-installed plugins crossed a host edge with "**junction installs need no sync**" and "the profile junction installs loaded unchanged" (`references/v0.1.3-alpha.1.md`:289, 323-324).

**Was `Copy-Item` into the profile's `node_modules` EVER the right move for this install? — No.**

- For a link install, never. The destination is the source. "Copy repo → profile" is copying a file onto itself; the copy conceptually duplicates zero bytes, and on Windows it physically fails with EBUSY because the host holds the files open (see §2).
- Even for a **copied** install, hand-copying is the wrong tool — updates go through the profile's package manager (`pnpm install` in the profile directory) and the lockfile, never `Copy-Item` into `node_modules` (see §5).
- The only legitimate uses of the profile's `node_modules` path during this incident were *reading* it (the introspection above) or *renaming through it* (which turned out to be catastrophic, §3).

---

## 2. The two locks and their owners

### Lock A — the stale browser view (stale *code*, owner: the browser page/tab + host-side bundle cache)

**Which process serves the client bundle: the dsh host, not the browser.** For a Web profile, the `dsh web` host process (node) reads the plugin's `lib/client.js` from disk and serves it to the browser over an HTTP combo route (`/plugins/??<id>/client.js&rev=…`, advertised via `window.__DSH_BOOT__.entries` — skill `references/v0.1.2-alpha.1.md` A1-19:306-316 / A1-26:443-457). The browser is a downloader/executor of host-served bytes; it has no independent copy of the code.

Why the refresh showed nothing new — three stacked layers:

1. **The host was never restarted.** The instruction "restart dsh web and hard-refresh the browser" was executed as "refresh the browser tab only" (`maintainer-thread.md`:8-9, 20-22). The running host was booted *before* the edits, so it still holds the pre-edit `lib/index.js` in its module cache and its pre-edit route registration (the new read-only host route was registered at apply time by the old closure). A browser refresh cannot change in-memory host code.
2. **The host boot-caches client bundles.** Since 0.1.7-alpha.2, plugin client bundles are read and cached when the host boots; an install-tree client edit "no longer takes effect on page refresh alone — only a host restart serves the new bytes" (skill `references/v0.1.7-alpha.2.md` **A2-04**:66-75). (On pre-0.1.7 hosts the combo is re-fetched per page load with no-cache, but the browser still has its own HTTP cache — and the host-half staleness above applies on every version.)
3. **The browser page itself.** The tab kept executing the old registered bundle; any refetch could still be served from the browser HTTP cache. Even a successful re-fetch only affects a *new* page load — and since 0.1.7 an open page may auto-reconnect to a restarted host while still running pre-restart client bytes, so "the page responds" is not proof of new code (A2-04:73).

Corroborating pattern (same house, S19 row in `references/troubleshooting.md:16`): client bundle re-pulled per refresh vs. host routes registered once at apply — "the running process predates the change".

### Lock B — the OS file locks (EBUSY, owner: the running dsh web host process)

```
Copy-Item …\node_modules\@org\dsh-attach-input\lib\*.js … -Force
Copy-Item : The file "…\lib\client.js" is being used by another process…
                                              ← copy-session.txt:1-4
# maintainer closes the browser tab, waits, retries:
Copy-Item : ... same IOException for client.js, index.js, package.json
                                              ← copy-session.txt:6-8
```

- **What holds the lib files open:** the `dsh web` host process. At boot it resolved the package (`package.json`), activated the plugin by loading `lib/index.js` (host half) into its module cache, and read/cached the client bundle `lib/client.js` for serving. On Windows those loaded files carry open handles; writes/deletes against them are refused with `ERROR_BUSY` → PowerShell's "being used by another process".
- **Why the whole set failed:** the host was started once, before the edits, and holds all three files.
- **Why closing the browser tab did NOT release the lock:** the tab never held a handle on the file in the first place — it only ever *received bytes over HTTP* from the host. The file handles belong to the host process, which keeps running (a Web profile serves until the process itself stops). The fixture's own experiment proves this: the retry *after* the tab was closed still hit EBUSY on all three files (`copy-session.txt:6-8`). This is the exact signature of the S12 field row: "the running dsh web host process holds the file handles of the loaded host-half/native modules — **the locks are in the host, not the browser**" (skill `references/troubleshooting.md:19`). **Only fully stopping the host releases the locks.**
- The same fact explains the seq 5 paradox partially: renames succeeded while the host was running (NTFS rename only needs DELETE-sharing on the inode; the host's handles do not block it) while the subsequent copy failed both because the host held the files and — decisively — because the source name no longer existed (§3).

---

## 3. Why the rename-aside destroyed the SOURCE directory, and the exact recovery

### Mechanism

```
$dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'   ← copy-session.txt:11
Rename-Item ($dst + '\client.js') 'client.js.old2'                              ← :12
Rename-Item ($dst + '\index.js')  'index.js.old2'                               ← :13
Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')
Copy-Item : Cannot find path "E:\dev\dsh-attach-input\lib\client.js" …          ← :14-15
Get-ChildItem E:\dev\dsh-attach-input\lib    → client.js.old2, index.js.old2    ← :16-17
Get-ChildItem $dst                            → client.js.old2, index.js.old2   ← :19-21
```

`$dst` is **not a separate destination** — it is the junction through to the repo. `Rename-Item ($dst + '\client.js') …` renamed the junction‑addressed inode, which *is* the repo inode (`profile-introspection.txt:3-5`). There was exactly **one** physical `client.js`; renaming it "in the profile" renamed it **in the repo too**. Both `Get-ChildItem` listings show the identical `ClientTree` — the same two directories, now both missing their entry files. The follow-up `Copy-Item` then failed with "source does not exist" because the "source" (`E:\dev\dsh-attach-input\lib\client.js`) is the very file that had just been renamed away. Net effect: the plugin has **no entry files at all** — no `package.json` `main`/client entry to load — and any host restart in the current state would fail to activate this row.

### Exact recovery (ordered)

> The renamed files `client.js.old2` / `index.js.old2` are the physical files that existed at rename time — i.e. the **post-edit repo files** (the edits were made first, `maintainer-thread.md`:6-7; every copy step failed, so nothing else ever overwrote them). Renaming them back restores the intended state.

1. **Fully stop the dsh web host** for the profile (Ctrl+C the `dsh web` terminal; confirm no lingering `node.exe` running dsh for this profile). The transcript shows renames succeeded while the host was running, but stopping first removes all EBUSY risk and is required anyway for step 4.
2. **Rename back — once, through either path (they are the same files):**
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
   ```
   Use the **repo path** as the canonical name. Verify both views agree afterwards:
   ```powershell
   Get-ChildItem E:\dev\dsh-attach-input\lib        # expect client.js, index.js (+ .old2 gone)
   Get-ChildItem $dst                                   # identical listing — same inodes
   ```
   (Optionally sanity-prove the identity: `fsutil file queryfileid` or compare `Get-FileHash` of a path from each side.)
3. **Verify syntax and content before the host ever sees the files:**
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\index.js
   node --check E:\dev\dsh-attach-input\lib\client.js
   Select-String -Path E:\dev\dsh-attach-input\lib\client.js -Pattern '<hover-preview marker>' | Select -First 1
   ```
   `node --check` catches a truncated/partially renamed file; the grep confirms the files contain the new feature (hover preview, new host route). **Fallback if content is unexpected**: check `git -C E:\dev\dsh-attach-input status` — if the edits were committed, restore only from the repo's own history; never reconstruct by copying from the profile side (it can only fail EBUSY / be wrong). Do not reinstall the link to "repair" it — a reinstall would only recreate the same junction over the same files.
4. **Activate** by following the procedure in §4 (host restart → hard refresh → verification).

---

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin after repo edits

1. **Edit in the repo only.** No build step here — `lib/client.js` and `lib/index.js` *are* the shipped artifacts. Because of the junction, the edit is already the installed copy; **do not touch `node_modules` whatsoever** (no copy, no rename, no `pnpm`-side meddling).
2. **Static gate while the host can still be reconsidered**: `node --check lib/index.js; node --check lib/client.js`.
3. **Stop the host fully** — every `dsh`/`node` process for the `web` profile. This is mandatory because:
   - the host half (`lib/index.js`, incl. the new read-only route) is loaded in-memory at activation — only a restart picks it up;
   - since 0.1.7 the host caches client bundles at boot (`references/v0.1.7-alpha.2.md` A2-04:66-75);
   - a running host holds file handles on the plugin files (`references/troubleshooting.md:19`) — if you ever must replace files, do it only after the stop.
   A browser refresh or tab close is **not** a host stop (`maintainer-thread.md`:20-22 scenario; S12 row).
4. **Start `dsh web` again** (same profile). Boot resolves composition → the row resolves through the junction → lib-only files load directly. Confirm the startup log shows **no** `loaded without registering "<id>"` / `entries did not activate`.
5. **Hard-refresh the browser (cache bypass: Ctrl+Shift+R / Ctrl+F5).** Why *required* for `client.js`: two independent caches sit between disk and the page — the host's boot-time bundle cache (0.1.7+) and the browser's HTTP cache. A plain refresh may still get the old cached bundle; the hard refresh forces re-validation against the restarted host's new `rev` URL. (Since 0.1.7 an open page may also auto-reconnect while running pre-restart client bytes — hard-refresh or reopen anyway.)
6. **Verify the new code actually loaded — bytes first, behavior second, never a bare HTTP 200** (`references/v0.1.2-alpha.1.md` A1-19:314-315 / A1-26:455):
   - **Boot manifest**: on the page, `window.__DSH_BOOT__.entries` contains the plugin's package-name id.
   - **Served bytes**: from the page, request the host-advertised combo URL `/plugins/??<package name>/client.js&rev=…` and assert the source contains the new hover-preview identifier (and contains `__ModuleLoader__.load({ id: "<package name>"`). A changed `rev` vs. pre-edit corroborates.
   - **Client behavior**: paste/image-hover in the composer — the hover preview renders (the vanilla-lib paste/composer precedent verified exactly this way: `references/v0.1.3-alpha.1.md`:323).
   - **Host behavior**: call the new read-only host route and assert the expected response. Attribution rule of thumb (S19 row, `troubleshooting.md:16`): old-type 200 + new-type 404 with the new code on disk ⇒ the running process predates the edit ⇒ the host was not restarted.
   - Also confirm the composition row is active and not pending: `dsh --profile web --dump-config`.
7. **If a host upgrade is later involved**, the junction install itself needs nothing across host upgrades (fleet records: `references/v0.1.3-alpha.1.md`:289; `references/v0.2.1-alpha.1.md`:133).

---

## 5. Pre-flight: determine the install mode BEFORE touching any file

Run, first thing, from a normal terminal (all reads):

```powershell
$p = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input'
Get-Item $p | Select-Object FullName, LinkType, Target
Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
```

Interpretation table (skill pre-flight class 0: record "the actual install track: registry package, Git checkout, workspace/junction, or copied install" — `references/pre-flight.md`:37):

| Observation | Install mode | Deployment meaning |
|---|---|---|
| `LinkType: Junction` + `Target` = repo path; `cordis.patch.yml` marker `# link:E:\dev\dsh-attach-input` | **Link install** (`references/rollup-0.1.2.md` R-09) | **Repo tree IS the installed copy.** Deploy = edit in repo → host restart → hard refresh. Profile entry shows no `LinkType` — it is the real directory; the junction exists only on the profile side. |
| `LinkType: SymlinkLink` | same semantics (symlink) | same as above |
| no `LinkType`, real files inside `node_modules/@org/…`, entry comes from the profile's `package.json`/lockfile | **Copied / package-managed install** | Update via the package manager in the profile directory (e.g. `pnpm install`), then host restart + hard refresh. Even here, **hand-copying is wrong** — it bypasses the lockfile and the artifact set. |

**Why the generic "copy the new files into the profile's node_modules" advice is actively harmful for a link install:**

1. **It is a self-copy**: source and destination are the same inodes. It can never succeed (the running host holds the files → EBUSY, `copy-session.txt:1-4`), so it burns time while the actual fix (host restart) is skipped.
2. **It invites a destructive workaround**: to "get past EBUSY," the natural next move is rename-aside — which, through the junction, renames the only physical copy of the file and breaks repo *and* profile simultaneously (`copy-session.txt:10-21`). This is precisely what happened here.
3. **It corrupts the integrity of the link topology**: any partial trickery (rename, delete-and-copy) desynchronizes or destroys the single shared tree; the junction no longer tracks the repo, and the profile entry no longer resolves — the exact broken state now requiring §3's recovery.
4. **It misattributes the locks**: copying assumes the copy on disk is wrong/absent, when nothing on disk was wrong at all — the running host process was. Lock attribution (host, not browser) is the difference between "why is my file locked" and "restart the host" (`troubleshooting.md:19-20`; S12).

Ancillary note: link-installed plugins sit outside the newer Plugin Manager's bundle management (`references/v0.1.6-alpha.2.md` A2-03:59-68); manage the row by editing `cordis.patch.yml` plus a host restart, and don't expect the Plugins page toggle to govern it.

---

## 6. Event-to-cause map (for the maintainer thread)

| Step in `maintainer-thread.md` | What actually happened |
|---|---|
| 1. Edited repo `lib/client.js` / `lib/index.js` | Correct — and via the junction, **already the deployed state** |
| 2. "Restart dsh web and hard-refresh" | Correct instruction (host restart + cache bypass needed for client bytes) |
| 3. Browser tab refresh only | Stale: host never restarted (old host-half code in memory, old route registration), host boot-cached the old client bundle (0.1.7+), browser cache served the old bundle |
| 4. `Copy-Item` into profile `node_modules` → EBUSY (even after tab close) | Self-copy onto junction-locked files; locks owned by the running host, not the browser tab |
| 5. Rename-aside then copy → both dirs hold only `.old2` | Renaming through the junction renamed the single physical file; the "source" of the copy no longer existed. Recovery: §3 |

**Status / residual risk**: plugin currently has no entry files; host will fail this row at next activation until §3 is completed. Nothing in the fixture state suggests data loss (the `.old2` files carry the edited content; git is the verification fallback). After recovery, verification per §4. `package.json` was never renamed and is intact. No content claims beyond what the fixture shows: the exact host version window determines whether the combo is re-fetched per refresh (pre-0.1.7) or boot-cached (0.1.7+) — either way a host restart is required here, since the host half (`lib/index.js`) also changed.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.