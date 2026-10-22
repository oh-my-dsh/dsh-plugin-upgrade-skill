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

# S14 · Link-Install File-Lock Trap — Analysis Report

**Subject:** `@org/dsh-attach-input` (community Web plugin, **lib-only**, no build step), linked
into the DSH `web` profile at `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input`,
repo at `E:\dev\dsh-attach-input`.

**Evidence base (read-only fixture, unmodified):**

| File | Used for |
|---|---|
| `fixture/profile-introspection.txt` | LinkType/Target of the profile entry; `cordis.patch.yml` install marker |
| `fixture/copy-session.txt` | the EBUSY Copy-Item attempts and the rename-aside accident |
| `fixture/maintainer-thread.md` | what was edited, what the user did, and what broke |
| `fixture/README.md` | index of the evidence pack |

Nothing in this report was derived from the live host: no `dsh --version/--help/--dump-config`,
no `cordis_inspect_*`. Every claim is either cited to the fixture or explicitly flagged as
**unconfirmed** (§6).

---

## 0. Executive summary — the four sentences that fix everything

1. **The profile entry is a directory *Junction* to the repo** (`LinkType : Junction`,
   `Target : {E:\dev\dsh-attach-input}`). The repo tree **is** the installed copy — there is
   nothing to deploy and nothing to copy.
2. **Copying repo files into the profile's `node_modules` was never correct for this install mode.**
   Through the junction, the "destination" directory *is* the "source" directory; the copy was a
   file-onto-itself operation that could only ever fail or be a no-op.
3. **Both symptoms are owned by the running `dsh` host process, not by the browser.** The host
   serves the client bundle over HTTP and holds the plugin's `lib\*.js` / `package.json` open;
   the browser never opens a server-side file handle, which is exactly why closing the tab
   changed nothing.
4. **The rename-aside "recovery" renamed the repo's own files**, because a junction is a
   directory-level alias, not a copy — it produced one directory with two names and no entry files.
   Recovery is a rename-*back* of `client.js.old2` / `index.js.old2`, not a copy.

---

## 1. What the profile entry actually is, and what it means for deployment

### 1.1 The citation

From `fixture/profile-introspection.txt` (lines 1–5):

```
PS E:\dev> Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target

FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

and on the repo side (lines 7–11):

```
PS E:\dev> Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target

FullName : E:\dev\dsh-attach-input
LinkType :
Target   : {}
```

Corroborated by the profile's own install manifest (`profile-introspection.txt`, lines 13–14):

```
PS E:\dev> Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

Three independent facts agree:

* **`LinkType : Junction`** — the profile's `node_modules\@org\dsh-attach-input` entry is an NTFS
  *directory junction* (a reparse point), i.e. a **second path to one and the same on-disk
  directory**. It is *not* a directory containing a copy of the repo.
* **`Target : {E:\dev\dsh-attach-input}`** — the junction resolves to the repo. (`E:` and `C:`
  are different volumes; that is legal for a *junction*, unlike a directory symlink, which is
  consistent with how a profile can link a plugin from another drive.)
* **`LinkType :` / `Target : {}` on `E:\dev\dsh-attach-input`** — the repo is the **real,
  ordinary directory**: the source of truth, and itself not a link to anywhere.
* **The `link:` marker in `cordis.patch.yml`** — the profile's dependency list records this
  package as a *link* to `E:\dev\dsh-attach-input`, installed 2026-08-30. The profile's
  dependency manifest therefore says "this package resolves to that path", not "this package
  contains those bytes".

### 1.2 Deployment semantics of a junction install

For a **link install**:

* `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` **is** `E:\dev\dsh-attach-input`.
  Every file under the repo is visible at the profile path and vice versa. "Installed" and
  "source" are the same bytes on the same volume.
* **There is no deploy step.** For a *lib-only* plugin (no build step, per
  `maintainer-thread.md` lines 2–3: "a lib-only Web plugin (no build step; `lib/client.js` +
  `lib/index.js` are the shipped files)"), `lib/client.js` and `lib/index.js` *are* the shipped
  artifact. Editing and saving them in the repo **is** the deployment. No `build`, no `publish`,
  no `npm install`, no copy into the profile.
* The repo is the only writable copy; the profile path is an alias for it. There is exactly one
  file named `client.js` in this deployment, reachable by two paths.
* Note that a junction alias means the *link* itself (the reparse point) lives in the profile and
  can be re-pointed or removed without touching the repo — but any operation performed *through*
  the profile path mutates the repo tree.

### 1.3 Was copying repo files into the profile's `node_modules` ever the right move?

**No — for this install mode it was never correct, and in this fixture it was actively
self-defeating.** Three independent reasons:

1. **It is a file-onto-itself copy.** `Copy-Item E:\dev\dsh-attach-input\lib\*.js` →
   `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\\` — the destination
   resolves through the junction back to `E:\dev\dsh-attach-input\lib\\`. The "install target" and
   the "source" are the same directory. PowerShell compares the *path strings*, which differ, so it
   does not short-circuit as "same file"; it proceeds to a write over the very file it is copying.
2. **The lock was the symptom, not the cause.** The sharing-violation error is what surfaced the
   real problem, but even with the host stopped, the copy would still have been a self-copy
   producing no new content anywhere (or a "cannot copy onto itself" error).
3. **The copy's *direction* is wrong for a link install.** Repo → profile is the same as
   profile → repo. The only meaningful direction is "edit the repo file, then reload the host".

Generic advice of the shape *"after editing a plugin, copy the files into the profile's
node_modules"* is written for a **copied dependency install** (a real directory in
`node_modules` holding its own bytes, possibly produced by a build). Applied to a **link
install**, it is worse than useless — see §5.3.

### 1.4 The correct "deploy" action for this plugin

```powershell
# Edit and save in the repo. That IS the deploy. Then reload the host (see §4).
code E:\dev\dsh-attach-input\lib\client.js
code E:\dev\dsh-attach-input\lib\index.js
```

No `Copy-Item`, no `npm install`, no `dsh plugin install`, no build step.

---

## 2. The two locks and their owners

Both symptoms have the same root owner — **the running `dsh` host process for the `web`
profile** — but they are two different mechanisms, and conflating them is what produced the
destroyed-rename workaround.

### 2.1 Lock #1 — "the browser refresh shows the old code"

**Owner: the `dsh` host process. The browser is not the owner of anything here.**

* The client bundle is **served by the host**. `dsh web` runs the Web profile; the host process
  owns the plugin's client-side bundle and delivers `lib/client.js` to the browser as an HTTP
  response (static asset route / host-served bundle). The browser is a pure consumer of bytes over
  HTTP — it never opens the server's file paths, so it cannot be the source of either symptom.
* **The host was never restarted.** `maintainer-thread.md` line 8 states the maintainer's advice
  was "restart dsh web and hard-refresh the browser to verify"; line 9 records what actually
  happened: "The user refreshed the browser tab only — nothing changed". The pre-edit host process
  was still alive, still holding the **old** module graph in memory (and/or serving the old bytes
  it had already read/cached). A browser refresh re-requests the *same URL* from the *same*
  still-running host, so it necessarily returned the old behaviour.
* **Second-order cause: the browser's own HTTP cache.** `client.js` is a static asset served
  under a stable URL whose *content* changed but whose *URL* did not. A normal (soft) refresh may
  be answered from the browser's disk cache without ever re-fetching, so even a correctly
  restarted host can be masked by a cached `client.js`. This is why a cache-bypassing reload is
  part of the activation procedure (§4).
* **A lock is not why the code looked stale.** The file handle prevents *writes*; it does not
  affect *reads*. Stale-on-refresh and EBUSY-on-write are separate symptoms that happen to share
  an owner.

### 2.2 Lock #2 — the EBUSY / sharing violation on Copy-Item

**Owner: the running `dsh` host process (node.exe) — again, not the browser.**

Evidence chain from `fixture/copy-session.txt`:

* lines 1–4: `Copy-Item E:\dev\dsh-attach-input\lib\*.js` → profile `lib\\` fails with
  *"The file '...node_modules\@org\dsh-attach-input\lib\client.js' is being used by another
  process, so the process cannot access this file."* with `IOException` / `CopyItemCommand`
  category — the classic Windows **ERROR_SHARING_VIOLATION** rendering, raised against the
  *destination* path.
* lines 6–8: the maintainer "closes the browser tab, waits, retries" and gets the **same**
  IOException naming `client.js`, `index.js`, `package.json`.
* The set of named files is itself the fingerprint: **`package.json` is Node's package-metadata
  file**, read by the module resolver when the host loads the plugin. A browser never reads
  `package.json` from the server's disk; a *host* loading `lib/*.js` does.

**Why closing the browser tab did not release the EBUSY:** because the browser was never the
holder. A browser tab holds no Windows handle on
`C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js` — it received
the bytes over HTTP and cached them in the browser's own (completely separate) storage. The
process holding the handle was the **live `dsh` host**, which was still running with the plugin's
modules loaded and the profile watched. The correct release action is to **stop the host
process**, not to close a tab.

**Why the rename still succeeded while the write failed** (mechanism, consistent with the
transcript): a rename only needs *delete* permission on the directory entry, whereas
overwriting the file's contents needs *write* permission on the file. The host's read handle
permitted the directory-entry modification but not the content overwrite. That asymmetry is
exactly what made the rename-aside trick look like it "worked" — and then it destroyed the source
(§3).

**Unconfirmed (flagged, not guessed):** the precise Win32 sharing mode the host's handle used,
and whether the open handles come from Node's module loader, from the host's file watcher, or
both. The *ownership* conclusion — the host, not the browser — is solid from the fixture; the
exact handle provenance is not recorded in it.

### 2.3 One-line summary of the two locks

| # | Symptom | Mechanism | Owner | Fix |
|---|---|---|---|---|
| 1 | Browser refresh shows old code | Host never restarted; still serving pre-edit code (plus browser HTTP cache) | **running `dsh` host** (+ browser cache for the second-order part) | restart host, then hard-refresh |
| 2 | `Copy-Item` → EBUSY on `client.js`/`index.js`/`package.json` | Windows sharing violation; the file is open by the host; destination is also the source through the junction | **running `dsh` host** | stop the host (no file surgery needed at all) |

---

## 3. Why the rename-aside destroyed the SOURCE directory, and the exact recovery

### 3.1 The mechanism

A **junction is a directory-level alias**: the profile path is not a container that happens to
hold similar files, it *is* the repo directory, reached through a reparse point. Every path
expression under it resolves to the same NTFS directory object and therefore to the same
directory entries. Consequences:

* `Rename-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js' 'client.js.old2'`
  renamed **the repo's own `lib\\client.js`**. The file kept its identity and its contents; only
  its *name* in the shared directory changed.
* The next command then asked for a file that no longer existed under that name:
  `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...` →
  *"Cannot find path 'E:\dev\dsh-attach-input\lib\client.js' because it does not exist."*
  **This error is the proof of aliasing**: the rename performed *through the profile path* removed
  the file *from the repo path*.
* `Get-ChildItem E:\dev\dsh-attach-input\lib` and `Get-ChildItem $dst` then returned
  **identical** listings (`client.js.old2`, `index.js.old2`) — two views of one directory
  (copy-session.txt lines 16–21). No copy ever ran; the "recovery" merely deleted the live entry
  names and never replaced them.
* The host's open handle simply followed the renamed file, so the lock survived the rename and
  the host was still holding a now-`client.js.old2` module.

**Root cause of the accident:** treating the profile's `node_modules` path as if it were a
*separate* place where files could be rearranged independently. With a junction there is only one
directory; there is no "profile side" to move files on. Any rename/delete performed under the
profile path is a rename/delete **in the repo**.

### 3.2 Current broken state (as recorded in the fixture)

* Both `lib` directories contain **only** `client.js.old2` and `index.js.old2` — the plugin has
  **no entry files at all**; the plugin is broken for both the repo and the profile (they are one
  directory).
* **The only copies of the maintainer's hover-preview edits are those two `.old2` files.** They are
  intact (a rename preserves content), and they are the *edited* versions, because the maintainer
  renamed the live edited files aside. Do **not** discard them.
* **Observation / unconfirmed:** the post-accident listing does not show `package.json`, even
  though the earlier error message named `package.json` among the locked files. The transcript
  does not explain this. Treat the **post-accident directory listing as authoritative** and
  verify the full expected file set against VCS (`git ls-files lib`, `git status --porcelain`)
  rather than assuming.

### 3.3 Exact recovery procedure (ordered, safe)

**Step 0 — Secure the only surviving copies before touching anything.**
The `.old2` files are the sole carriers of the uncommitted hover-preview work. Copy them *outside*
the repo (so a second accident cannot reach them) and/or commit them:

```powershell
$repo = 'E:\dev\dsh-attach-input'
$safe = 'E:\dev\_s14_backup'          # outside $repo — the repo tree is the junction's target
New-Item -ItemType Directory -Force -Path $safe | Out-Null
Copy-Item "$repo\lib\client.js.old2" "$safe\client.js"
Copy-Item "$repo\lib\index.js.old2"  "$safe\index.js"
Get-FileHash "$safe\client.js","$safe\index.js" -Algorithm SHA256
```

Then, if the repo is a git checkout, secure the edits in VCS as well:

```powershell
git -C $repo status --porcelain
git -C $repo stash list
```
Do not `git checkout --` or `git reset --hard` yet — see Step 3.

**Step 1 — Stop the dsh host first (no file surgery while the host holds handles).**
Closing the browser tab is *not* the release action (§2.2); stop the host process itself and
confirm it is gone:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, CommandLine | Format-List     # identify the dsh web host
# stop it (Ctrl+C in its console, or Stop-Process -Id <pid> for the dsh host only)
```
Re-run the listing and confirm no dsh host process remains. (If the host is supervised and
auto-restarts, stop the supervisor too, so it cannot come back mid-recovery.)

**Step 2 — Restore the original names by renaming back (NOT by copying from elsewhere).**
The `.old2` files *are* the correct, edited files; renaming restores them in place and keeps
their content byte-for-byte:

```powershell
Set-Location "$repo\lib"
Rename-Item 'client.js.old2' 'client.js'
Rename-Item 'index.js.old2'  'index.js'
Get-ChildItem | Select-Object Name, Length, LastWriteTime
```

* If the rename is refused because a handle is still open, do **not** delete-and-paste; find and
  stop the holder (the host, or an editor/IDE indexer) and retry.
* **Fallback only if the `.old2` files are missing or corrupt:** restore from VCS
  (`git -C $repo checkout -- lib/client.js lib/index.js`, or `git restore lib/`) — and be aware
  this restores the **last committed** version, i.e. it **loses the uncommitted hover-preview
  edits** unless they were captured in Step 0 or exist in a stash/branch. Re-apply them from the
  backup or the diff afterwards.

**Step 3 — Verify the restored content is the edited content (not the pre-edit version).**

```powershell
$repo = 'E:\dev\dsh-attach-input'
Get-Content "$repo\lib\client.js" | Select-String 'hover'      # the new feature
Get-Content "$repo\lib\index.js"  | Select-String '<new-route-name>'
git -C $repo diff --stat                                          # edits present as unstaged changes
```
(The exact marker strings are the maintainer's own — grep for the hover-preview entry point and
the new read-only host route added in this change, per `maintainer-thread.md` line 7.)

**Step 4 — Syntax-verify both entry files before activating.**

```powershell
node --check "$repo\lib\client.js"
node --check "$repo\lib\index.js"
```
`node --check` performs a parse-only check (it does not execute the module), so it is safe and
side-effect free. **Caveat:** if the plugin is ESM and `package.json` does not declare
`"type": "module"`, `node --check` will parse the file as CommonJS and may report a spurious
"Cannot use import statement outside a module". In that case check ESM semantics explicitly by
checking a `.mjs` copy:

```powershell
Copy-Item "$repo\lib\client.js" "$env:TEMP\client.mjs"; node --check "$env:TEMP\client.mjs"
Remove-Item "$env:TEMP\client.mjs"
```
Also confirm the *exports* the loader expects are still exported and that the file is complete
(the accident only renamed files — it did not truncate them — so a clean parse plus the marker
grep in Step 3 is sufficient evidence).

**Step 5 — Confirm the profile view is repaired (this is the proof that no deploy step is missing).**

```powershell
$prof = 'C:\Users\me\.dsh\profiles\web'
Get-ChildItem "$prof\node_modules\@org\dsh-attach-input" -Recurse | Select-Object FullName, Length
```
Because of the junction, this listing is *by construction* identical to the repo listing — that
identity is exactly why the broken state was visible from both sides, and it is the proof that
repairing the repo repaired the installed copy. **No copy, sync, or reinstall step is required
or permitted.**

**Step 6 — Clean up the leftovers, then activate.**
After the verification above succeeds, delete the stray `.old2` files (they are now duplicates and
would only confuse later greps), keep the Step 0 backup until the feature is verified working,
and then run the activation procedure in §4.

---

## 4. Complete, ordered activation procedure for a link-installed, lib-only Web plugin

Because the plugin is **lib-only** (no build step) and **link-installed** (repo file = installed
file), the whole activation chain is exactly: **save → restart host → hard-refresh browser →
verify**. There is no build, no publish, no copy, no install.

### 4.1 Order (the sequence that matters)

1. **Stop the `dsh` host completely.**
   The host holds the plugin's files open (EBUSY) and keeps the old code in memory (stale).
   Exit the host process for the `web` profile and confirm no dsh/node host process for that
   profile remains. This also releases the write lock, so the edits can be saved safely.
   *Note:* a browser refresh cannot substitute for this; closing a browser tab releases nothing
   server-side (§2.2).
2. **Save the edits in the repo.**
   `E:\dev\dsh-attach-input\lib\client.js` and `...\lib\index.js` — the same bytes are the
   installed bytes (§1). Do **not** copy them anywhere. If you prefer to edit while the host runs,
   know that an atomic-save editor (temp file + rename) may succeed, but the host will still serve
   the old code until step 4 — so stop the host first.
3. **Verify syntax** (`node --check`, §3.4 Step 4) — cheap, and it prevents a broken restart.
4. **Start the host again** (`dsh web` for the `web` profile). On startup the host re-resolves
   the plugin through the junction, re-imports `lib/index.js` (server side: the new read-only
   host route) and re-reads/serves `lib/client.js` (client side: the hover preview). The host
   must be a **full process restart**, not a plugin reload — and if the host is supervised, ensure
   the supervisor does not resurrect the pre-edit process.
5. **Hard-refresh the browser (cache bypass).**
   `Ctrl+Shift+R` / `Ctrl+F5`, or DevTools → Network → *Disable cache* → reload, or
   DevTools → Application → *Clear site data*. Rationale: `client.js` is a static asset at an
   **unchanged URL with changed content**; a soft refresh can be answered from the browser's HTTP
   cache without re-fetching, which would show the pre-edit code even though the host is now
   correct. A cache-bypassing reload forces a fresh fetch of the new bytes. (An incognito /
   fresh-profile window is a good independent cross-check.)
6. **Verify the new code actually loaded** — see §4.2.

### 4.2 How to verify the new code actually loaded (four independent checks)

1. **Network panel (client side).** DevTools → Network → filter `client.js` → confirm the response
   was **not** served "from disk cache" (look at the Size/Status columns and the timing), and open
   the **Response** body and search for a marker from the new code (e.g. the hover-preview
   function or a version string).
2. **Console marker.** Put a version/build marker in the shipped client file (e.g.
   `__DSH_ATTACH_INPUT_BUILD__ = '0.2.11+hover'`) and assert it in the console
   (`typeof __DSH_ATTACH_INPUT_BUILD__`). A marker is the only reliable way to distinguish
   "cache served old bytes" from "host served old bytes".
3. **Server side (proves the host reloaded `index.js`).** Exercise the **new read-only host
   route** added in this change (via the host's HTTP surface, or the UI that calls it) and confirm
   it answers. A *new route* can only exist if the **host process** picked up the new
   `lib/index.js` — no amount of browser caching can fake this.
4. **Functional check.** Hover an image attachment and confirm the preview appears; confirm the
   host route returns its payload.

**Triage table (which symptom tells you what):**

| Observation | Conclusion | Action |
|---|---|---|
| New route works, hover preview does not | Host restarted fine; the **browser** served a cached `client.js` | hard refresh / clear site data |
| Neither works | Host was not really restarted, or it was started against a **different profile** than the one you introspected | re-check the profile path the host uses; restart against the `web` profile |
| Browser shows new code but errors in console | Syntax/parse problem in the shipped file | re-run `node --check`; check the console stack trace |

**Why there is no HMR here:** a third-party lib-only plugin installed by link gets no hot-reload
from the DSH repo's own dev watcher; the plugin's files are ordinary files served by the host.
Hence the explicit "stop → save → start → hard refresh" cycle.

---

## 5. The pre-flight check that must come before touching any file

### 5.1 The check (run this first, every time)

```powershell
$prof = 'C:\Users\me\.dsh\profiles\web'
$pkg  = "$prof\node_modules\@org\dsh-attach-input"

# (a) Is the profile entry a link?
Get-Item $pkg | Select-Object FullName, LinkType, Target, Attributes, @{n='IsReparse';e={$_.Attributes -band [IO.FileAttributes]::ReparsePoint}}

# (b) What does the profile's own install manifest say?
Select-String -Path "$prof\cordis.patch.yml" -Pattern 'dsh-attach-input'

# (c) Optional deeper confirmation that both paths are the same file (may need elevation):
fsutil file queryfileid "E:\dev\dsh-attach-input\lib\client.js"
fsutil file queryfileid "$pkg\lib\client.js"     # identical File ID => same underlying file
```

### 5.2 Reading the result — the decision table

| Install mode | Signal | Source of truth | Correct "deploy" action | What NOT to do |
|---|---|---|---|---|
| **LINK (junction)** — *this profile* | `LinkType = Junction`, `Target = {E:\dev\dsh-attach-input}`; `cordis.patch.yml` entry carries the `link:` marker | the **repo checkout** | **none** — save the repo file; it *is* the installed file. Then restart host + hard refresh | do **not** copy into `node_modules`; do **not** rename/delete/move anything under the profile path (it mutates the repo) |
| **COPIED dependency** | `LinkType` empty, no `Target`, not a reparse point; `cordis.patch.yml` lists the path with **no** `link:` marker | the **profile's own copy** | copy/build the artifact into the profile's `node_modules` (expect the copy to be lockable by a running host — stop the host first) | do **not** assume "edit the repo and restart" is enough — the profile keeps its own bytes |

For this fixture the answer is unambiguous on both signals: `LinkType : Junction` +
`Target : {E:\dev\dsh-attach-input}` and the `# link:E:\dev\dsh-attach-input` marker in
`cordis.patch.yml` → **LINK install**.

### 5.3 Why generic "copy into node_modules" advice is actively harmful for a link install

1. **It cannot work, by construction.** Destination and source are the same directory through the
   junction → a file-onto-itself copy. At best a no-op, at worst an error. There is no separate
   installed artifact for a copy to fill.
2. **It misdirects the write into the repo while looking like it writes to the profile.** Any write
   that *does* succeed through the profile path lands in the repo tree. The maintainer believed
   they were "publishing to the profile"; in reality they were editing the repo (or destroying it).
3. **It manufactures the EBUSY problem and the temptation to use the destructive workaround.**
   The copy failed with a sharing violation (§2.2), which invited the rename-aside trick that
   destroyed the source (§3). The copy attempt was not merely ineffective — it was the direct
   cause of the outage.
4. **It corrupts the mental model of where the source of truth lives.** Afterwards "the profile
   has its own copy" feels true, so later fixes target the wrong file, and the repo/profile pair
   silently diverges (when a copy lands at all).
5. **The mirror-image error is just as costly.** Applying *"just edit the repo and restart"* to a
   **copied** install silently does nothing — the profile keeps serving its stale bytes forever.
   That is precisely why the install-mode check must be the gate, not an afterthought.

### 5.4 The pre-flight checklist

- [ ] `Get-Item` on the profile entry → `LinkType`/`Target` (link vs copied).
- [ ] `cordis.patch.yml` install marker (`link:` prefix ⇒ link install) — and confirm you are
      inspecting the **same profile the running host uses**.
- [ ] Is the plugin **lib-only** (no build)? Check `package.json` for a `build` script and for
      `main`/`exports` pointing at `lib/*.js`. If it *is* built, add the build/publish step —
      but even then the *target* is still the repo, because the junction makes it the installed copy.
- [ ] Is the dsh host running? (It holds the locks — stop it before any file work.)
- [ ] Working tree state: `git status`; uncommitted work must be committed or backed up
      **before** any surgery.

---

## 6. Explicitly unconfirmed / not derivable from the fixture

* **How the host serves `lib/client.js`** — static asset route, in-memory bundle, or
  watcher-backed dev server. Not recorded in the fixture. All variants yield the same remedy
  (host restart + browser cache bypass); only the mechanism wording would change.
* **Whether the host re-reads `client.js` per request or serves a cached copy.** Not recorded.
  The symptom ("browser refresh showed nothing new") is fully explained by "the host was never
  restarted" regardless of which variant applies.
* **The precise Win32 sharing mode of the host's handle**, and whether the open handles come from
  Node's module loader, a file watcher, or both. The *ownership* conclusion (host, not browser)
  is solid; the handle provenance is inference.
* **Why `package.json` is absent from the post-accident `Get-ChildItem` listing** although the
  earlier error named it as locked. Unexplained by the transcript — hence the VSC-based
  inventory check in §3.3 Step 4.
* **The exact command that created the junction** (`dsh plugin install --link`, `npm link`,
  `mklink /J`, or a host-level link manager). The profile manifest shows only the `link:...`
  marker, not the producing command. It does not affect any conclusion above.
* **Whether `cordis.patch.yml` contains other entries with different install modes** — the
  fixture shows only the single `dsh-attach-input` match.
* **Whether the DSH host has any additional per-plugin cache** (e.g. a resolved-manifest cache
  keyed by path) that would need clearing beyond a process restart. Not observable from the
  fixture; a full host restart is the recommended lower bound.

---

## 7. Corrected playbook (condensed)

```
PRE-FLIGHT   Get-Item <profile>\node_modules\@org\dsh-attach-input  → LinkType/Target
             Select-String <profile>\cordis.patch.yml 'dsh-attach-input'  → 'link:' marker?
             LINK?  → the repo IS the install. Never copy into node_modules; never rename
                      anything under the profile path.
             COPY?  → copy/build into the profile's node_modules (host stopped).

REPAIR NOW   0) back up lib\*.old2 outside the repo; git stash/commit the edits
             1) STOP the dsh host (a browser tab is not the lock holder)
             2) Rename-Item client.js.old2 -> client.js ; index.js.old2 -> index.js
             3) node --check lib\client.js ; node --check lib\index.js
             4) grep for the hover-preview marker + the new route; git diff --stat
             5) Get-ChildItem through the junction → same listing (no deploy step needed)

ACTIVATE     1) stop host   2) save repo edits   3) node --check   4) start dsh web
             5) Ctrl+Shift+R (cache bypass) / incognito
             6) verify: Network shows a fresh client.js + console version marker +
                new host route answers + hover preview works
```

**Bottom line:** nothing was ever broken in the deployment pipeline — the profile entry is a
junction to the repo, so the repo edit *was* the deploy. The host was never restarted (stale
code) and the host (not the browser) held the files open (EBUSY); treating the junction as a
separate copy directory is what turned a copy error into a self-inflicted outage.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.