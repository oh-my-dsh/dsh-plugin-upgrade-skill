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

# S14 - Link-Install File-Lock Trap: Diagnosis and Recovery Report

**Plugin:** `@org/dsh-attach-input` v0.2.11 - lib-only Web plugin (no build step; shipped files are `lib/client.js` + `lib/index.js`)
**Repo (source of truth):** `E:\dev\dsh-attach-input`
**Profile entry:** `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input`
**Profile:** `C:\Users\me\.dsh\profiles\web` (the `web` profile)
**Install mode:** **Junction / link install** into the repo (proven in Section 1)
**Current state:** BROKEN - `lib/client.js` and `lib/index.js` were renamed to `.old2`; no entry files exist under either path (the junction makes both paths the same directory).

---

## Executive summary (TL;DR)

The profile entry is a **Junction** whose target is the repo. For a junction install, the repo tree **is** the installed copy - there is no separate snapshot to copy or deploy. Every failure in this session (the EBUSY `Copy-Item`, and catastrophically the rename-aside) came from applying **copied-dependency** instincts to a **linked** install.

- The two file locks were held by the **running `dsh web` host process**, not the browser. That is why closing the browser tab released nothing - the browser never opened those files on disk; it only downloaded bytes over HTTP.
- Copying repo files into the profile `node_modules` was **never** correct for this install mode: through the junction you would be copying a file onto itself.
- The rename-aside trick renamed the **one physical source file** (the junction makes the profile path and the repo path the same NTFS directory), so it destroyed the repo's entry files too.
- A browser refresh showed stale code because the **host was never restarted** and, on current hosts (0.1.7-alpha.2+, card `DSH-0.1.7-A2-04`), the client bundle is **read and cached at host boot** - a refresh alone can never serve the edited bytes.
- Recovery is mechanical and non-destructive: rename `.old2` back, `node --check` both files, fully stop the host, restart `dsh web`, hard-refresh. Details in Section 3.

---

## 1. What the profile entry actually is (and why Copy-Item was never right)

### The introspection is decisive

From `profile-introspection.txt`:

```powershell
PS E:\dev> Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target

FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}

PS E:\dev> Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target

FullName : E:\dev\dsh-attach-input
LinkType :
Target   : {}
```

And the profile composition marker (`Get-Content ...\cordis.patch.yml | Select-String dsh-attach-input`):

```yaml
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

Three facts, all consistent:

1. The profile entry has `LinkType : Junction` with `Target : {E:\dev\dsh-attach-input}`. It is a **directory reparse point** (a Windows junction), not a real directory.
2. The repo directory `E:\dev\dsh-attach-input` has **empty** `LinkType`/`Target` - it is the *real* directory; the junction points at it, not the other way around.
3. `cordis.patch.yml` records the install as an explicit **link install**: `# link:E:\dev\dsh-attach-input (installed 2026-08-30)`.

### What a Junction install means for deployment

A junction is a filesystem redirect: every path operation issued against `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\...` is transparently resolved to `E:\dev\dsh-attach-input\...`. The two names are **two labels for one physical directory**. Consequences:

- The profile's "installed copy" and the repo tree are **the same bytes on disk**. There is no second copy anywhere.
- Editing `E:\dev\dsh-attach-input\lib\client.js` edits the exact file the profile loads. The edit is already "live on disk"; it takes effect the next time the host reads it (see Section 4).
- There is **nothing to deploy, sync, or copy**. This is the same conclusion the skill records for real junction deployments: `v0.1.3-alpha.1` card `DSH-0.1.3-A1-07` verification notes "plugins load from the unchanged profile (**junction installs need no sync**)", and its six-plugin zero-code record ends "the profile junction installs loaded unchanged."

### Was Copy-Item into the profile `node_modules` EVER right for THIS install?

**No - never, for a link install.** The step-4 assumption ("the profile must be running an installed COPY") is false here. Copying would be a `Copy-Item` of a file onto *itself* through the junction (source and destination resolve to the same inode). It can only:

- deliver nothing the repo edit did not already deliver (redundant), and
- on a running host, collide with the host's open file handles (EBUSY, as observed), and
- when "beaten" with the rename-aside trick, destroy the single physical source file (Section 3).

"Copy the build/dropped files into `node_modules`" is the procedure for a **copied dependency**, where the profile holds an independent snapshot that must be refreshed. It does not apply to a linked install and is **actively harmful** there (Section 5).

---

## 2. The two locks and their owners

### Which process serves the client bundle, and what holds the lib files open

The **`dsh web` host process** serves everything, including the client bundle:

- The **host half** `lib/index.js` is loaded into the host at boot as a Cordis plugin (that is where the new read-only host route you added lives). The host holds this module and its manifest read.
- The **client half** `lib/client.js` is served by the host over HTTP (the client "combo" URL the browser downloads). On 0.1.7-alpha.2 and later, `DSH-0.1.7-A2-04` states client bundles are **read and cached when the host boots** - so the host also holds the bytes it read at boot and an open handle from that read.
- `package.json` is read for the manifest/version and is likewise held open by the host.

So the two EBUSY locks ("being used by another process") are owned by the **running host process**, exactly as the skill's S12/S14 evidence rows record: the running `dsh web` host holds the loaded host-half / bundle file handles; **the file lock is in the host, not the browser**.

### Why a browser refresh showed stale code

The maintainer told the user to "restart dsh web and hard-refresh," but the user **only refreshed the browser tab** - the host was never restarted. Two independent reasons that refresh showed the old behavior:

1. **The host never re-read the bundle.** A running host executes and serves what it loaded into memory at boot. This is the skill's "ghost host" principle (pre-flight step 1.5 / `ghost-host-check.mjs`): a process started before the checkout's last change is a ghost running the old code from memory while the disk reports the new code. On 0.1.7+ this is explicit - the client bundle is cached at host boot, so editing `lib/client.js` on disk "NO LONGER takes effect on page refresh alone; only a host restart serves the new bytes."
2. **The browser's own HTTP cache.** Even if the host did serve new bytes, a soft browser refresh can replay the cached client combo from the browser cache - which is why a **hard refresh (cache bypass)** is required (Section 4).

Net: with no host restart, the browser kept receiving (or re-serving) the pre-edit client bundle. Nothing about "no new preview" indicates a code defect; it indicates the host was never restarted.

### Why closing the browser tab did not release the EBUSY

The browser tab is only an **HTTP/WebSocket client** of the host's dev server. It downloaded the bundle bytes over the network; it never opened `lib/client.js` / `lib/index.js` / `package.json` as files on disk. The open file handles belong to the **host OS process**, a completely separate process from the browser. Closing the tab drops a network connection and releases browser-side memory - it cannot touch the host's file handles. Only **stopping the host process** releases the locks. ("A browser refresh is not a host stop.")

---

## 3. Why rename-aside destroyed the SOURCE, and the exact recovery

### Why the source directory lost its files too

The recovery attempt was:

```powershell
$dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
Rename-Item ($dst + '\client.js') 'client.js.old2'
Rename-Item ($dst + '\index.js')  'index.js.old2'
Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')
# Copy-Item : Cannot find path "E:\dev\dsh-attach-input\lib\client.js" because it does not exist.
```

`$dst` resolves **through the junction** to the real directory `E:\dev\dsh-attach-input\lib`. Renaming a file renames a single directory entry, and because the junction makes the profile path and the repo path **the same NTFS directory**, there is only **one physical `client.js`**. Renaming it through the junction renamed that one file - which is simultaneously the repo's file. That is why `Get-ChildItem E:\dev\dsh-attach-input\lib` then showed only the `.old2` names: the rename reached through the junction and hit the source itself.

The follow-up `Copy-Item` then failed with "source does not exist" because `E:\dev\dsh-attach-input\lib\client.js` was already gone (it is now `client.js.old2` - the same file, renamed). The copy was trying to copy a file onto itself, and the source name no longer existed. Result: both paths show only `client.js.old2` / `index.js.old2`, and the plugin has **no entry files**. (`package.json` was never renamed and is intact.)

Note on why the *rename* succeeded but the *copy* failed: Windows permits renaming a file that a process holds open **when the handle was opened with delete-share**, but blocks opening it for overwrite/truncate - so `Rename-Item` went through while `Copy-Item ... -Force` (which truncates the destination) hit EBUSY. That asymmetry is exactly what lured the rename-aside trap.

### Exact recovery from the current broken state

Do this **in the real repo path** (`E:\dev\dsh-attach-input\lib`) so it is unambiguous you are editing the one true copy - operating through the junction path is what caused the confusion. Canonical order (skill S14 recipe): **restore names -> verify syntax -> fully stop host -> restart `dsh web` -> hard refresh.**

```powershell
# 1) Restore the original entry-file names (rename .old2 back).
#    Use the REAL repo path, not the profile junction path.
Rename-Item 'E:\dev\dsh-attach-input\lib\client.js.old2' 'client.js'
Rename-Item 'E:\dev\dsh-attach-input\lib\index.js.old2'  'index.js'

# 2) Verify both files parse (catch a truncated/corrupt paste before boot).
node --check 'E:\dev\dsh-attach-input\lib\client.js'
node --check 'E:\dev\dsh-attach-input\lib\index.js'

# 3) Fully stop the host (release the lib-file handles; drop the in-memory broken state).
#    e.g. Stop-Process -Name dsh  (or close the terminal running `dsh web`).

# 4) Restart the host from an external/clean shell, then 5) hard-refresh the browser.
dsh web
```

Verification that recovery worked: `Get-ChildItem E:\dev\dsh-attach-input\lib` shows `client.js` and `index.js` (no `.old2`); both `node --check` pass; `dsh web` boots with the plugin active (no "entry did not activate" / missing-entry error); and the served client bundle contains the new code (Section 4).

**EBUSY fallback:** if a rename-back itself returns EBUSY (the host still holds that handle without delete-share in your build), stop the host **first**, then rename back, `node --check`, and start the host. Stopping the host first is always the safe order; the skill's canonical order works because rename is permitted on these handles.

---

## 4. Complete, ordered activation for a link-installed lib-only Web plugin after repo edits

For a **link install** the "deploy" is simply: the repo edit is already in the installed location. Activation is about getting the **running host** and the **browser** to pick up those bytes.

### Which processes must fully stop and restart

- **HOST (`dsh web`) - must fully stop and restart.** Three reasons:
  1. The host half `lib/index.js` is loaded into the host at boot; a running host is a ghost executing the pre-edit code from memory (pre-flight 1.5).
  2. On 0.1.7-alpha.2+ (`DSH-0.1.7-A2-04`) the client bundle is **read and cached at host boot**, so the host must restart to serve the edited `client.js` bytes - refresh-only verification reports stale content and can mislead a diagnosis.
  3. The host holds the lib-file handles open (the EBUSY source); any file-touching step requires the host to be stopped first.
- **BROWSER - does not need to be killed as a process; it needs a hard refresh.** On 0.1.7+ the page **auto-reconnects** after the server restart (`DSH-0.1.7-A2-04`), so connectivity resumes without a manual refresh - but that is precisely why "the page still works" is **not** proof the new code loaded (see below).

### The plane rule, and the 0.1.7+ override

`migration-hygiene.md` item 3 gives the base rule: a change in `lib/client.js` (client half) takes effect on a browser **hard refresh**; a change in `lib/index.js` (host half) requires **restarting dsh**. The 0.1.7-alpha.2 card overrides the client half: because the client bundle is cached at host boot, a `client.js` edit now also requires a **host restart** before the page can see it. Since your edit touched **both** `client.js` and `index.js`, on a current host you must **restart the host regardless** - which also covers the client half.

### Why a hard refresh (cache bypass) is required for `client.js`

The client bundle is delivered over HTTP (the combo URL) and the browser caches it like any static asset. A soft refresh may revalidate against or serve from the browser HTTP cache, replaying the **old** combo even after the host restarted with new bytes. A hard refresh (`Ctrl+F5` / `Ctrl+Shift+R`, or DevTools -> "Empty Cache and Hard Reload") forces a fresh GET of the combo. With the host restarted (it re-read and re-cached the new bytes at boot) **and** the browser cache bypassed, the page finally runs the new client code.

### Ordered procedure

```text
1. (Pre-flight, see Section 5) Confirm the profile entry is a Junction to this repo. If it is, do NOT copy anything.
2. Edit lib/client.js and lib/index.js in the repo E:\dev\dsh-attach-input.        [already done]
3. node --check both files (fast syntax gate before you bounce the host).
4. Fully stop `dsh web` (release file handles; drop the in-memory old code).
5. Start `dsh web` again. It now loads the new index.js and reads+caches the new client.js at boot.
6. Hard-refresh the browser (cache bypass) so it re-fetches the client combo.
7. Verify the NEW code is actually served and mounted (next block).
```

### How to verify the new code actually loaded (do not accept a bare 200)

"The page responds" / HTTP 200 is not proof - on 0.1.7+ an open page keeps working across a restart while still running **pre-restart** client bytes. Prove the bytes:

- **Inspect the served bundle.** Fetch the advertised client combo/artifact URL (with the session cookie) and grep the response for a marker unique to your new code - e.g. a new function/symbol or feature string you added to `client.js`. This is `DSH-0.1.7-A2-04`'s own verification recipe: after editing, a refresh should NOT yet show the change; after host restart + refresh it SHOULD.
- **Confirm behavior.** The hover-preview actually appears on an image attachment; the new read-only host route responds.
- **Layered proof (skill validation layer 4).** For a Web Client plugin: exchange the printed token URL for its cookie, read the host boot manifest, request the advertised client artifact, and prove **registration/mount** - not just HTTP 200. `verify-runtime.mjs` runs this layer end-to-end in an isolated profile and attributes any failure (plugin-code / dependency-resolution / profile-config / dsh-runtime).

Windows note for the ghost check: `ghost-host-check.mjs` is POSIX-only (`ps -o lstart=`). The Windows equivalent is to compare the host process start time (`Get-Process dsh | Select StartTime`) against the edited files' `LastWriteTime` (`Get-Item ...\lib\client.js`). If the process predates the edit, it is a ghost - restart it. Simpler and safer on a dev box: just always restart the host after a repo edit.

---

## 5. The pre-flight check that must come before touching any file

The entire incident was avoidable with one check performed **before** any copy/rename. Determine the **install mode** (link vs copied dependency) from the profile first.

### How to determine the install mode

```powershell
# A) Authoritative: the reparse point on the profile entry.
Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
    Select-Object FullName, LinkType, Target
# LinkType = Junction/SymbolicLink with a non-empty Target  -> LINK install (repo tree IS the copy).
# LinkType empty (real directory)                            -> COPIED dependency (independent snapshot).

# B) The profile composition install marker.
Get-Content 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' | Select-String dsh-attach-input
# ->  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)

# C) Confirm the Target resolves to your repo.
(Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input').Target
# -> E:\dev\dsh-attach-input   (matches the repo you are editing)
```

This maps directly to the skill's shared read-only preparation step 2, which requires recording **source identity and installation identity separately** - explicitly calling out "workspace/junction, or copied install" as distinct tracks. `pre-flight.md` step 0 likewise requires recording "the actual install track: registry package, Git checkout, workspace/junction, or copied install" before anything else.

### Why the generic "copy into node_modules" advice is actively harmful for link installs

That advice is correct **only** for a copied dependency, where the profile holds an independent snapshot that a repo edit does not touch. Applied to a **link/junction** install it is wrong in three escalating ways:

1. **Redundant:** the profile entry and the repo are the same directory (same inode through the reparse point). You would copy a file onto itself; the edit is already in the installed location.
2. **It manufactures the EBUSY:** on a running host the copy collides with the host's open file handles - the exact error in `copy-session.txt`, which persists after closing the browser because the lock is the host's, not the browser's.
3. **It invites the rename-aside disaster:** the natural "beat the lock" move is to rename the locked file and copy a replacement in - but through the junction that renames the **one physical source file**, destroying the repo's entry files too (Section 3).

For a link install the correct mental model is: **edit the repo, restart the host, hard-refresh. There is no copy step at all.** The pre-flight `LinkType`/`Target` check plus the `cordis.patch.yml` `# link:...` marker is what tells you which world you are in before you touch a file.

---

## Answer key (the maintainer's five questions, condensed)

1. **What the profile entry is / was Copy-Item ever right?** It is a **Junction** to `E:\dev\dsh-attach-input` (`LinkType: Junction`, `Target: {E:\dev\dsh-attach-input}`; `cordis.patch.yml` `# link:...`). The repo tree **is** the installed copy, so **Copy-Item into `node_modules` was never necessary or correct** for this install - it copies a file onto itself and only causes harm.
2. **Why stale refresh / why EBUSY after closing the tab?** The **`dsh web` host** serves the client bundle and holds the lib files open (host half loaded at boot; client bundle read+cached at boot on 0.1.7+; manifest read). The host was never restarted (ghost), and the browser cache can replay the old combo. Closing the tab released nothing because the browser is only an HTTP client - the file locks live in the **host process**, which must be stopped.
3. **Why rename-aside hit the source / recovery?** The junction makes the profile path and the repo path the **same directory**, so renaming `...\node_modules\@org\dsh-attach-input\lib\client.js` renamed the single physical `client.js` in the repo. Recovery: rename `client.js.old2`/`index.js.old2` back to their original names in the **real repo path**, `node --check` both, fully stop the host, restart `dsh web`, hard-refresh.
4. **Ordered activation.** Confirm link mode (no copy) -> edit repo -> `node --check` -> **fully stop `dsh web`** -> **restart `dsh web`** (loads new `index.js`, re-reads+caches new `client.js` at boot) -> **hard-refresh** the browser (bypass HTTP cache) -> verify the served bundle bytes and mount. **Host restarts; the browser only hard-refreshes** (it need not be killed; on 0.1.7+ it auto-reconnects). Hard refresh is needed for `client.js` because the browser caches the HTTP combo; and on 0.1.7+ the host must restart anyway because it caches the bundle at boot.
5. **Pre-flight.** Before touching any file: `Get-Item <profile>\node_modules\@org\dsh-attach-input | Select LinkType, Target` (Junction+Target = link) and check `cordis.patch.yml` for the `# link:...` marker. "Copy into node_modules" is copied-install advice; for a link install it is redundant, manufactures EBUSY, and its rename-aside escape destroys the source - i.e. actively harmful.

---

## Evidence and references

- Fixture (read-only, unchanged): `profile-introspection.txt` (Junction/Target + `cordis.patch.yml` marker), `copy-session.txt` (EBUSY on `client.js`/`index.js`/`package.json`, persists after tab close; rename-aside -> both dirs show only `.old2`), `maintainer-thread.md` (the six steps and questions), `README.md`.
- Skill `SKILL.md`: shared read-only prep #2 (record source vs installation identity: workspace/junction vs copied install); global-host note ("a running host holds ... file locks -> EBUSY; a browser refresh is not a host stop"); validation layer 4 (Web Client: token URL -> cookie -> boot manifest -> advertised client artifact -> prove registration/mount, not a bare 200).
- Skill `references/troubleshooting.md`: the S14 row (Junction proven by `LinkType`/`Target`; repo tree == install dir; copy is redundant; rename through the junction renames the one source file; recovery `.old2` -> original -> `node --check` -> stop host -> restart `dsh web` -> hard refresh; check `LinkType`/`Target` first; "copy into node_modules" is harmful for link installs) and the S12 EBUSY row (host, not browser, owns the lock).
- Skill `references/migration-hygiene.md` item 3: plane rule (`client.js` = browser hard refresh; `index.js` = host restart).
- Skill `references/v0.1.7-alpha.2.md` card `DSH-0.1.7-A2-04`: client bundles cached at host boot (edit needs a host restart); pages auto-reconnect after a server restart (so verify served bundle bytes, not that the page responds); verification recipe (edit -> refresh NOT served -> restart+refresh IS served).
- Skill `references/v0.1.3-alpha.1.md` card `DSH-0.1.3-A1-07`: "junction installs need no sync"; six link-installed Web plugins crossed the edge with zero code changes and "the profile junction installs loaded unchanged."
- Skill `references/pre-flight.md` step 1.5 + `scripts/ghost-host-check.mjs`: a process started before the checkout's last change is a ghost running old code from memory; pin behavior to the process, not the disk.

*Read-only diagnosis. No files outside this report were created or modified; the fixture was inspected but not altered.*


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.