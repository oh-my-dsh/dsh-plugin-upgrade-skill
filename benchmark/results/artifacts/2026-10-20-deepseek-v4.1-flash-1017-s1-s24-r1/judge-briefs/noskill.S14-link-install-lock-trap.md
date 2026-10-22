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

# S14 · Link-Install File-Lock Trap — Diagnosis, Recovery, and Activation Runbook

**Subject**: `@org/dsh-attach-input` v0.2.11 — lib-only DSH Web plugin, linked into profile `web`.
**Mode**: static forensic review of the read-only evidence pack; no migrations, no installs, no writes outside `agent-output/`.

**Verdict.** The repo tree *is* the installed plugin. The profile's `node_modules` entry is a **junction** pointing at `E:\dev\dsh-attach-input`, so there was never a second copy to deploy and the `Copy-Item` step was not merely unnecessary — it was a copy of a file onto itself. Both EBUSY locks belong to the **running dsh host process**, not to the browser; closing the tab could not release them because the tab never held them. The rename-aside "trick" renamed the repo's own files (same file objects, reached through the reparse point), which is why both paths now list only `.old2` entries. Recovery is a two-rename restore, a syntax check, a **full host restart**, and a **cache-bypassing browser reload** — in that order.

**Question map**

| The maintainer's question | Answered in |
|---|---|
| Why did the browser refresh show nothing new? | §2.3 |
| Why were the lib files "in use" with no tab open? | §2.4 |
| What does Junction + Target mean for "deploying"? | §1.2 |
| Was Copy-Item into node_modules ever necessary? | §1.3 |
| Why did rename-aside destroy the SOURCE too? | §3.1 |
| Exact recovery from the current broken state? | §3.3 |
| Complete ordered activation procedure? | §4 |
| How to determine install mode before touching files? | §5 |

---

## 0. Evidence index

Short fragments only (≤6 words each); no blocks are reproduced.

| ID | Source | What it establishes |
|---|---|---|
| **E1** | profile-introspection.txt | `Get-Item` on the profile entry: FullName is the profile's `node_modules\@org\dsh-attach-input`, **LinkType = Junction**, **Target = {E:\dev\dsh-attach-input}**. |
| **E2** | profile-introspection.txt | `Get-Item` on `E:\dev\dsh-attach-input`: LinkType empty, Target empty — an ordinary real directory. Control that fixes the direction of the link. |
| **E3** | profile-introspection.txt | `cordis.patch.yml` filtered for the package: an entry `node_modules/@org/dsh-attach-input` carrying the marker `link:E:\dev\dsh-attach-input (installed 2026-08-30)`. |
| **E4** | copy-session.txt | Two `Copy-Item` attempts into the profile lib: IOException "is being used by another process" on client.js; the retry — **after the tab was closed** — fails identically, now naming client.js, index.js and package.json. |
| **E5** | copy-session.txt | The rename-aside sequence: two `Rename-Item` calls **succeed**, then `Copy-Item` fails with "Cannot find path … because it does not exist". |
| **E6** | copy-session.txt | Both listings (repo lib and profile lib) show **only** `client.js.old2` and `index.js.old2` — identical content, two views. |
| **E7** | maintainer-thread.md | lib-only, no build step; edits were made directly in the repo; the user was told "restart dsh web and hard-refresh"; the user refreshed the **tab only**; then the copy attempts began. |

---

## 1. What the profile entry actually is

### 1.1 The introspection, read literally

| Path | LinkType | Target | Meaning |
|---|---|---|---|
| `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` | **Junction** | `{E:\dev\dsh-attach-input}` | a reparse point; not a directory of files [E1] |
| `E:\dev\dsh-attach-input` | *(empty)* | `{}` | a real directory — the link's target [E2] |

Two conclusions follow immediately.

1. The profile's `node_modules` entry contains **no files of its own**. It is a directory reparse point whose substitute path is the working tree. The empty LinkType/Target on the repo side is the control: the link points *from* the profile *to* the repo, and nothing points back.
2. The install record in the profile agrees with the filesystem: `cordis.patch.yml` lists the package under `node_modules/` with a `link:E:\dev\dsh-attach-input` marker and an install date [E3]. That marker is the profile's **declarative statement of install mode** — it says "this dependency is a link to that path", i.e. the plugin is consumed from the working tree, not from a materialised package directory.

Agreement between the reparse point and the patch file is the strongest possible evidence: the two independent sources (kernel-level filesystem object, profile configuration) say the same thing.

### 1.2 What a junction install means for deployment

A junction is resolved by the kernel during path lookup, not by the application. Every open, list, create, rename or delete performed under the profile path is redirected, transparently, to `E:\dev\dsh-attach-input`. Consequences:

- **The repo tree is the installed copy.** There is exactly one set of file objects. "Source" and "installed artifact" are the same bytes, with zero replication latency. An edit in the repo *is* an edit to the installed plugin the instant it is flushed.
- **There is no deploy step for file content.** The only things that can be stale are in-memory caches of those bytes: the host's module graph / bundle cache, and the browser's HTTP and ES-module caches. "Deploying" therefore degenerates to *making the processes re-read the files* — a restart, not a copy.
- **The two paths are one place, not two places.** This single sentence is the whole answer to the maintainer's step 5: any operation aimed at "the profile copy" is, by construction, an operation on the repo. There is no safe way to treat them as distinct.
- **No build artifact exists to regenerate.** The package is lib-only; `lib/client.js` and `lib/index.js` are the shipped files [E7]. The chain is: save file → host re-imports → browser re-fetches. Three steps, none of which is a file operation on `node_modules`.

### 1.3 Was copying repo files into the profile's node_modules ever the right move?

**No — for this install mode it was never right, and it cannot work.** Two independent arguments, either of which is sufficient:

**(a) Semantically there is nothing to deploy.** The link already makes the repo content the installed content. A copy could only "update" a second copy that does not exist. [E1][E2][E3] establish this positively; the failure in [E4] is what it looks like when an operator assumes the opposite topology.

**(b) Mechanically it is a self-copy.** `Copy-Item E:\dev\dsh-attach-input\lib\*.js <profile>\…\lib\ -Force` resolves the destination through the reparse point onto the **very same file objects** as the source. Windows will not let you open a file for truncating write while the host holds it → the observed IOException, surfaced by PowerShell as "is being used by another process" [E4]. With the host stopped the operation would instead fail as "cannot copy a file onto itself" (or, in the best case, be a silent no-op). It can never produce a newer installed copy, because there is only ever one copy.

The EBUSY is therefore not an obstacle to a correct deploy — it is **the symptom of attempting an invalid one**. A correct diagnosis at that moment would have read it as "the destination resolves to the source, and something is already holding that source open", i.e. exactly the two facts the introspection would have supplied seconds earlier.

Copying into `node_modules` is correct only for a **copied** install — a real directory materialised by the package manager or a tarball — and even then the sanctioned action is to rebuild/reinstall the package, never to hand-transplant files into the installed tree (§5.2).

---

## 2. The two locks and their owners

Both locks are held by the **same process**: the running DSH host — the node process that serves the profile (for this GUI, `dsh web` on `http://127.0.0.1:3080`). Neither is held by the browser.

### 2.1 Lock #1 — the host's server-side module (`lib/index.js`)

The host imports the plugin's server entry at boot to register whatever the plugin contributes — in this revision, a new read-only host route [E7]. Node reads and evaluates the file into its module registry, and the resolved module stays resident for the life of the process. Alongside that, the host's plugin loader watches the package (and reads `package.json` during resolution), which is why [E4] reports the EBUSY on **client.js, index.js *and* package.json** rather than on one file only: a single owner with a directory-wide interest, not three unrelated applications.

### 2.2 Lock #2 — the host's client-bundle path (`lib/client.js`)

In a lib-only Web plugin the browser never reads `lib/client.js` from disk. The **host** reads it and serves the bytes over HTTP to the page, holding the file open while it runs (and/or holding a bundle cache keyed by its path). That handle is on the file object — and because of the junction it is *simultaneously* a handle on `E:\dev\dsh-attach-input\lib\client.js`.

This is the point that makes the whole incident legible: there is no "profile copy" that is locked while the repo copy stays free. One file, two names, one lock.

### 2.3 Why a browser refresh showed stale code

Two independent staleness layers, both on the wrong side of a refresh:

| Layer | What is stale | Can a refresh fix it? |
|---|---|---|
| **Server code** — `lib/index.js`, including the new route | the host process, which evaluated the old file at boot and will not re-evaluate it until restarted | **No.** A browser can never reload server code; the route simply does not exist in the running process |
| **Client code** — `lib/client.js` | the host, which serves the bytes it read/cached at boot; *and* the browser, which may satisfy the request from its own HTTP cache | Only with a **cache-bypassing** reload, and only after the host serves new bytes |

So the refresh was wrong twice over: the server half could not change at all, and the client half was re-served (or served from cache) unchanged. The reported "nothing changed, no preview" is the ordinary outcome of refreshing a UI whose provider process was never restarted. Note also that the maintainer's own instruction — "restart dsh web **and** hard-refresh" [E7] — was correct; only half of it was executed.

### 2.4 Why closing the browser tab did not release the EBUSY

- The tab **never held a filesystem handle** on the profile to begin with. The page was loaded from an HTTP origin; the plugin reached it as a response body. Closing a tab tears down a renderer and its sockets — not a Windows file handle owned by a different process tree.
- The retry after closing the tab failed identically, now naming all three paths [E4], because the holder was never the browser: the host was still running with both handles open. Nothing about the holder's state had changed, so nothing about the error changed.
- A useful rule for next time: an EBUSY / ERROR_SHARING_VIOLATION on a file inside a DSH profile points at the **host**, not the UI. Closing the UI is a no-op; only terminating the host releases the handles.

### 2.5 Confirming the owner on a live machine (read-only)

~~~powershell
Get-Process node, dsh -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, StartTime, Path
Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
# Sysinternals, read-only query:
handle64.exe -accepteula -nobanner "dsh-attach-input"
# when the object list is maintained:
openfiles /query /fo table | Select-String "dsh-attach-input"
~~~

Expected: the owning PID is the host's node process, and the paths it reports appear under **both** the profile path and the repo path — the same file, seen twice.

---

## 3. The rename-aside accident, and the exact recovery

### 3.1 Why the SOURCE directory lost its files too

Mapping [E5] onto the junction, step by step:

1. `$dst = <profile>\node_modules\@org\dsh-attach-input\lib` — the trailing component is not a directory of its own; path resolution ends at `E:\dev\dsh-attach-input\lib`.
2. `Rename-Item ($dst + '\client.js') 'client.js.old2'` — **succeeds**, and it renames the directory entry *in the repo*. A rename only rewrites a name in the parent directory; it does not need to open the file for writing. The host's open handle did not block it (its share mode permitted the rename), whereas the earlier `Copy-Item -Force` needed a truncating write-open on the destination and was refused [E4]. That asymmetry is the trap: **the rename succeeds precisely where the copy failed**, which makes the workaround feel safe.
3. `Rename-Item ($dst + '\index.js') 'index.js.old2'` — same thing for the second entry file.
4. `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')` — the **source is the file that was just renamed away**. There is no `client.js` in either view, because there is only one file and its name is now `client.js.old2`. Hence "Cannot find path … because it does not exist" [E5].
5. The two listings [E6] are identical in content: `client.js.old2`, `index.js.old2`. That identity is *proof*, not coincidence — two independent directories cannot spontaneously contain the same two oddly-named files. It is one directory observed through two names.

So the "rename the locked file aside, then copy the new one in" trick is valid only when source and destination are **different files** (the copied-install case). Here they are the same file: the rename destroyed the only copy of the source, which was also the only copy of the installed plugin. Net effect: the entry points named by `package.json` disappeared, and the plugin cannot load at all.

**What was *not* lost.** `.old2` are not backups of the previous release — they are the maintainer's *newly edited* files, merely misnamed, because they were renamed from the already-edited `client.js` / `index.js`. The renames touched only those two paths under `lib/`, so `package.json` and the rest of the package are intact. Recovery is therefore a **pure rename**: no content reconstruction, no data loss — provided the restore happens before anything else writes into that directory.

### 3.2 Safety before the restore

- **Stop the host first.** It is already in a broken state (no entry files); stopping it releases both handles, so the renames cannot hit a share violation, and it guarantees no half-initialised plugin state survives into the next boot.
- **Back up outside the junction.** Copy the two `.old2` files to a real directory that is neither the repo nor the profile. Backing up to the profile path would be another self-copy — the very mistake being repaired.
- **Do not run an installer**, `npm install`, or any "link repair" command. Those would either materialise a second, divergent copy or rewrite/remove the junction record and the `cordis.patch.yml` marker — turning a two-rename fix into a reinstall.

### 3.3 Exact recovery runbook (current broken state → working plugin)

Precondition: only `lib/client.js.old2` and `lib/index.js.old2` exist; `lib/client.js` and `lib/index.js` are absent [E6].

~~~powershell
# 0. Capture the "before" state so the fix is auditable
$repo = 'E:\dev\dsh-attach-input'
$link = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input'
$bak  = 'E:\dev\_s14-recovery-backup'          # a REAL directory, outside both views
New-Item -ItemType Directory -Force -Path $bak | Out-Null
Get-Item $link | Select-Object FullName, LinkType, Target        # expect Junction -> $repo
Get-ChildItem "$repo\lib" | Select-Object Name, Length, LastWriteTime
Get-FileHash "$repo\lib\client.js.old2", "$repo\lib\index.js.old2" -Algorithm SHA256

# 1. Stop the host completely (releases both locks -- see section 2)
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, StartTime, Path
Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue |
  Select-Object OwningProcess
#   Ctrl+C in the terminal that runs "dsh web" is the clean stop;
#   Stop-Process -Id <pid> only if it was started detached.

# 2. Back up the two surviving files OUTSIDE the junction
Copy-Item "$repo\lib\client.js.old2" $bak -Force
Copy-Item "$repo\lib\index.js.old2"  $bak -Force
Get-ChildItem $bak

# 3. Restore the original entry names -- once, through the REAL repo path
Rename-Item -LiteralPath "$repo\lib\client.js.old2" -NewName 'client.js'
Rename-Item -LiteralPath "$repo\lib\index.js.old2"  -NewName 'index.js'

# 4. Prove the restore landed in both views, and that both views are ONE file
Get-ChildItem "$repo\lib"  | Select-Object Name, Length
Get-ChildItem "$link\lib"  | Select-Object Name, Length          # must be identical
Get-FileHash "$repo\lib\client.js", "$link\lib\client.js",
             "$repo\lib\index.js",  "$link\lib\index.js" -Algorithm SHA256
#   -> per file the two hashes MUST be equal; equality across the two paths re-confirms the junction

# 5. Verify syntax BEFORE activating (run from the package root so package.json "type" applies)
Set-Location $repo
node --check .\lib\index.js
node --check .\lib\client.js
#   both must exit 0 and print nothing; a non-zero exit prints the parse error and line number

# 6. Sanity-check the manifest the host will resolve
Get-Content .\package.json -Raw | ConvertFrom-Json |
  Select-Object name, version, type, main, exports

# 7. Confirm no rename debris is left anywhere in the package
Get-ChildItem -Recurse -Force $repo |
  Where-Object { $_.Name -match '\.(old|old2|bak|tmp)$' }
#   expected: nothing (the .old2 entries became the entry files again)

# 8. Activate: start the host, verify its bytes, then hard-refresh the browser (section 4)
~~~

**Acceptance criteria for the recovery**: step 4 lists exactly two files per lib view with matching hashes; step 5 exits 0 twice; step 7 is empty. If step 4's hashes do **not** match, stop — the profile entry is no longer a junction to this repo, and §5 must be re-run before anything else.

---

## 4. The complete, ordered activation procedure

### 4.1 What restarts, and what merely reloads

| Component | What it caches | Action required |
|---|---|---|
| **DSH host** (`dsh web`, the node process serving the profile) | the server module graph (`lib/index.js`), the client-bundle bytes/cache (`lib/client.js`), and the watchers that produced the EBUSY | **Full stop, then start.** A reconnect, a new tab, or a retry is not enough |
| **Browser tab** | the HTTP cache and the page's ES-module registry for the bundle URL | **No process restart**, but a **cache-bypassing reload** is mandatory. The tab need not be closed; the *cache* must be bypassed |
| **Filesystem / repo** | nothing | **No action.** Edits are already live through the junction; copying is never part of this flow |

### 4.2 Ordered procedure

**Step 0 — pre-flight, once.** Determine the install mode (§5). If it is a link install, nothing below involves copying a file.

**Step 1 — stop the host, completely.**
Ctrl+C in the terminal running `dsh web`, or `Stop-Process` on the owning PID if it was detached. Then *verify* it is gone: no listener on the host port (`Get-NetTCPConnection -LocalPort 3080 -State Listen` returns nothing) and no surviving node instance for that profile. "Completely" matters — an orphaned second instance would keep the old module graph and, if it still owns the port, would serve the old bundle no matter how often you refresh.

**Step 2 — confirm the bytes on disk are the bytes you meant to ship.**
No copy, no deploy — just proof:
~~~powershell
Set-Location E:\dev\dsh-attach-input
Get-ChildItem .\lib | Select-Object Name, Length, LastWriteTime
Get-FileHash .\lib\client.js, .\lib\index.js -Algorithm SHA256
node --check .\lib\index.js
node --check .\lib\client.js
~~~
Optional and decisive: hash the same two files **through the profile path** and compare — equal hashes mean the host will read exactly these bytes (§5.1, signal 3).

**Step 3 — start the host.**
Start `dsh web` for the same profile. The startup log should report loading `@org/dsh-attach-input` (with its version) and no import error. This is the moment the new **server-side** code is installed; before it, the new route does not exist in any process.

**Step 4 — verify the host serves the NEW code, before involving the browser.**
~~~powershell
# take the exact asset URL from the browser's Network panel (or the host's route table)
$u = 'http://127.0.0.1:3080/<client-bundle-url-for-@org/dsh-attach-input>'
$r = Invoke-WebRequest $u -UseBasicParsing
$r.StatusCode
$r.Headers['ETag']; $r.Headers['Last-Modified']; $r.Headers['Cache-Control']
$r.Content -match 'hover-preview'          # a unique token introduced by your edit
(Invoke-WebRequest 'http://127.0.0.1:3080/<new-route>' -UseBasicParsing).StatusCode   # expect 200
~~~
If the body still lacks the new token, the host being queried is not the one you restarted, or it is serving a cached bundle. Resolve that first; debugging the browser before this step passes is wasted effort.

**Step 5 — hard-refresh the browser (cache bypass).**
Ctrl+Shift+R / Ctrl+F5, or DevTools → Network → "Disable cache" → reload, or the reload button's "Empty Cache and Hard Reload". Why it is mandatory **for `client.js` specifically**:

- The bundle is served at a **stable URL**. The plugin is lib-only with no build step, so there is no content hash in the filename and no cache-busting query — the browser's HTTP cache is entitled to reuse the stored response for that URL, and a normal reload may satisfy the request from memory or disk cache **without contacting the host at all**.
- Even when the document itself is re-fetched, the page's **ES-module registry** is keyed by URL: re-importing the same specifier inside the same document returns the already-evaluated module instance. Only a document reload clears it — and only a cache bypass guarantees that document reload carries the new bytes.
- Therefore: **host restart without a hard refresh = new server behaviour, old client behaviour.** That combination looks exactly like "the feature still doesn't work", which is what was reported [E7].

**Step 6 — verify the new client code actually loaded (positive assertions).**
1. **Network panel**: the bundle request returns **200** — not 304, and Size is neither "(disk cache)" nor "(memory cache)"; transferred bytes are non-zero; ETag/Last-Modified differ from the pre-edit value.
2. **Response body**: contains the new token / function name from the diff.
3. **Console**: the new log line (if any) appears once per load; no module-evaluation error.
4. **Behaviour**: the hover preview appears on an image attachment — the actual acceptance test.
5. **Server side, same moment**: the new read-only route answers 200 with the expected JSON. A useful A/B control: point the same request at a host started before the edit and observe 404 — that is what proves the restart was the fix.

**Step 7 — if it is still stale after step 5, in this order.**
(a) More than one host instance, or the old process still owns the port — a stale listener answers on the same port. (b) The tab is pointed at a different host/port/profile than the one restarted. (c) A service worker or an intermediary proxy is serving its own copy (`navigator.serviceWorker.getRegistrations()` in the console). (d) In a build that content-addresses the bundle, the page still references the old hashed URL — the HTML must be re-fetched first. (e) The file you edited is not the file the host resolves — re-run the hash comparison from step 2.

### 4.3 Condensed form

~~~text
edit repo files
  -> [pre-flight] install mode = link?  (Junction/Target + cordis.patch.yml link marker)
  -> stop host completely              (releases both locks; port no longer listening)
  -> verify repo files                 (listing, SHA256, node --check)   -- NO copying, ever
  -> start host                        (installs new server module; rebuilds/serves client bundle)
  -> verify host bytes                 (asset body has new token; new route returns 200)
  -> hard refresh browser              (stable URL + ES-module registry => cache bypass required)
  -> verify: Network 200 / Response / Console / Behaviour
~~~

---

## 5. The pre-flight check: link vs copied dependency

This is the step that should have preceded every file operation in this incident. Three independent signals, any two of which are conclusive; all three take seconds and are read-only.

### 5.1 The three signals

**Signal 1 — reparse-point test on the profile entry (primary).**
~~~powershell
Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
  Select-Object FullName, LinkType, Target, Attributes
~~~
- LinkType = `Junction` or `SymbolicLink` **with a non-empty Target** ⇒ **link install**; the Target is the live source tree.
- LinkType empty / Target empty ⇒ an ordinary directory ⇒ **copied install**.

[E1] vs [E2] is exactly this test run on both sides: the profile entry is a Junction with a target, the repo is empty on both columns.

**Signal 2 — the install record in the profile's patch file (declarative counterpart).**
~~~powershell
Get-Content 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' | Select-String 'dsh-attach-input'
~~~
An entry under `node_modules/<pkg>` carrying a `link:<path>` marker records that the dependency was installed **as a link** to that path, with the install date [E3]. Marker and filesystem must agree; if they ever disagree, trust the filesystem (the kernel object) and treat the discrepancy as a bug to chase *before* editing anything.

**Signal 3 — identity confirmation (cheap, read-only, unambiguous).**
~~~powershell
Get-FileHash "$repo\package.json", "$link\package.json" -Algorithm SHA256   # equal => same file
(Get-Item "$link").Attributes -band [IO.FileAttributes]::ReparsePoint      # non-zero => reparse point
fsutil reparsepoint query "$link"                                          # prints tag + substitute name
dir /AL 'C:\Users\me\.dsh\profiles\web\node_modules\@org'                  # lists links only
~~~
Equal hashes across the two paths for the same logical file prove the link; they are also the fastest way to answer "is my edit already deployed?" — for a link install the answer is yes, by definition, the moment the file is saved.

### 5.2 Decision table

| LinkType | Target | cordis.patch.yml | Mode | Correct post-edit action |
|---|---|---|---|---|
| Junction / SymbolicLink | non-empty, points at the repo | `node_modules/<pkg>` entry **with** `link:` marker | **linked** | **Nothing to copy.** Restart the host, then hard-refresh the browser (§4) |
| *(empty)* | `{}` | plain entry, no marker | **copied** (package manager / tarball) | Rebuild and reinstall the package. Do **not** hand-edit the installed tree — it is disposable and the next install overwrites it |

### 5.3 Why the generic "copy into node_modules" advice is actively harmful here

1. **It encodes a topology that does not exist.** The advice presumes "source tree" and "installed snapshot" are distinct. [E1] and [E3] state, independently, that they are the same directory. Advice is not neutral when its premise is false — it directs effort at a copy that cannot exist.
2. **It degrades into a self-copy.** The destination resolves through the reparse point onto the source file objects. The operation is refused while the host holds them (the observed EBUSY [E4]) and is a no-op at best when it does not. It can never make the plugin newer.
3. **The obvious workaround is destructive.** "Rename the destination aside, then copy over it" mutates the **source**, because they are one file — which is precisely how both entry files vanished [E5][E6]. That is the trap this task is named for: the standard remedy for a locked copied install is a data-loss operation on a linked install.
4. **Even a hypothetical success would harm.** It would create a second, divergent body of code inside the profile, silently decoupled from the repo — so later edits and later debugging would be against the wrong bytes, and a re-link would discard the divergence without warning.
5. **It misdiagnoses the symptom.** "Nothing changed after a refresh" is a *staleness* problem (process caches), not a *missing files* problem. The correct response to staleness in a link install is a restart; the copy attempt treated a cache problem as a deployment problem, and in doing so converted a harmless non-event into an outage.

---

## Appendix A — The incident, in one table

| # | What was done | What actually happened | Correct action |
|---|---|---|---|
| 1 | Edited `lib/client.js` and `lib/index.js` in `E:\dev\dsh-attach-input` | the live installed plugin changed, because the repo **is** the install [E1] | nothing further on disk |
| 2 | Browser tab refreshed only | server half unchanged (host still running old module), client half re-served/cached | restart host, then hard refresh |
| 3 | `Copy-Item` into the profile's `node_modules` | self-copy; destination file held open by the host → EBUSY [E4] | never valid for a link install |
| 4 | Closed the tab, retried | identical failure — the holder was the host, not the browser [E4] | stop the host, not the tab |
| 5 | Renamed `client.js` / `index.js` aside "in the profile" | renamed the **repo's** files through the junction [E5] | never rename across a link without proving the two sides differ |
| 6 | Copied the "new" file in | source no longer existed; both views then showed only `.old2` [E5][E6] | restore names in the repo, verify, restart host |
| 7 | Finally inspected the entry | Junction → `E:\dev\dsh-attach-input`, with a `link:` marker in `cordis.patch.yml` [E1][E3] | this was step 0 all along |

## Appendix B — Hard "do not"s

- Do **not** `Copy-Item` (or robocopy, or xcopy) into a junction-backed `node_modules`. It cannot help and can destroy the source.
- Do **not** rename or delete a file through a link path unless you have proven the two sides are different objects (hash or `fsutil file queryfileid` on both).
- Do **not** delete/recreate the junction, re-run a package manager, or "repair the link" to fix a broken plugin. The reparse point plus the `cordis.patch.yml` marker are the entire mechanism by which the repo is live; re-materialising them is a reinstall, not a repair.
- Do **not** infer "the browser is holding the file" from a tab-level observation. Only the host process (and anything it spawned) can hold a plugin file in a profile.
- Do **not** treat "the feature doesn't show" as a deployment failure before checking whether the host was restarted and the browser cache bypassed.
- Do **not** run installers, migrations, or package-manager commands as part of diagnosis.

## Appendix C — Verification checklist (tick all before declaring success)

- [ ] `Get-Item <profile-entry>` shows LinkType = Junction and Target = the repo (§5.1).
- [ ] `Get-ChildItem "$repo\lib"` and `Get-ChildItem "$link\lib"` list the same names, and `Get-FileHash` agrees across the two paths.
- [ ] `node --check` exits 0 for both `lib/index.js` and `lib/client.js`, run from the package root.
- [ ] The host was fully stopped (port free) and then **started again** — not merely refreshed.
- [ ] `Invoke-WebRequest` of the bundle URL returns a body containing the new token, and the new route returns 200.
- [ ] The browser was reloaded with cache bypass, and the Network panel shows **200** (not 304, not "disk/memory cache") for the bundle.
- [ ] The feature is observable in the UI (hover preview on an image attachment).
- [ ] No `.old` / `.old2` / `.bak` debris remains, and nothing was copied into `node_modules`.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.