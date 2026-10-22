# S14 · Link-Install File-Lock Trap — Diagnosis & Activation Report

**Subject**: community Web plugin \`@org/dsh-attach-input\` (lib-only, no build step) — hover-preview feature
edits in \`lib/client.js\` / \`lib/index.js\`, failed verification, EBUSY on every copy attempt, and a
rename-aside "recovery" that removed the entry files from **both** the repo and the profile.

**Evidence used (read-only)**: \`fixture/maintainer-thread.md\`, \`fixture/copy-session.txt\`,
\`fixture/profile-introspection.txt\`, \`fixture/README.md\`, plus the read-only
\`skills/plugin-upgrade/\` reference set (\`references/troubleshooting.md\`, \`references/migration-hygiene.md\`,
\`references/v0.1.7-alpha.2.md\` card DSH-0.1.7-A2-04, \`references/v0.1.6-alpha.2.md\` card DSH-0.1.6-A2-03,
\`references/rollup-0.1.2.md\` card R-09, \`references/v0.1.3-alpha.1.md\`, \`references/pre-flight.md\`,
\`examples/06-real-world-batch-migration.en.md\`).

**Status of the fixture**: unmodified (SHA-256 prefixes: \`copy-session.txt\` \`e097b55968d5eac9\`,
\`maintainer-thread.md\` \`58ad4874f244198e\`, \`profile-introspection.txt\` \`6343bb0886cd1a45\`,
\`README.md\` \`3ae3a30e6f3d9179\`).

---

## 0. Executive summary

The profile entry is a **Junction**, not a copy: \`Get-Item\` reports \`LinkType : Junction\`,
\`Target : {E:\dev\dsh-attach-input}\`. The plugin's repo tree **is** the installed tree — one physical
directory reached through two paths. Therefore the repo edits were already "deployed" the moment they were
saved; step 4 (Copy-Item into the profile's \`node_modules\`) was never necessary and could only fail,
because source and destination resolve to the *same file* that the running **dsh web host process** had
open. The browser refresh showed stale code because the *host* serves (and caches) the client bundle, not
the browser — and a plain refresh can additionally be answered from the browser's own HTTP cache. Closing
the tab released nothing, because the file locks belong to the host process, which keeps the plugin's
loaded modules open for its whole lifetime. The rename-aside "recovery" destroyed the source too because
\`Rename-Item\` through a junction renames the one and only file; both directory listings then show the same
\`.old2\` names. Recovery is a pure rename-back, then \`node --check\`, then a full host restart and a hard
refresh. The pre-flight that should have come first is a two-command install-mode probe (\`LinkType\`/\`Target\`
+ the \`link:\` marker in the profile's \`cordis.patch.yml\`).

---

## 1. What the profile entry actually is

### 1.1 The introspection evidence (\`fixture/profile-introspection.txt\`)

\`\`\`powershell
PS E:\dev> Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
          Select-Object FullName, LinkType, Target

FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}

PS E:\dev> Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target

FullName : E:\dev\dsh-attach-input
LinkType :
Target   : {}

PS E:\dev> Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
\`\`\`

Read the three blocks together:

| Observation | Meaning |
|---|---|
| profile entry: \`LinkType : Junction\`, \`Target : {E:\dev\dsh-attach-input}\` | the \`node_modules/@org/dsh-attach-input\` entry is a **directory reparse point**, not a package directory. \`Target\` is a one-element array (PowerShell always returns an array for links) — the single target is the repo. |
| repo path: \`LinkType\` empty, \`Target : {}\` | \`E:\dev\dsh-attach-input\` is the **real** directory. The link exists only on the \`node_modules\` side. |
| \`cordis.patch.yml\`: \`- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)\` | the profile composition records this row as a **\`link:\` install** with its creation date. This is the on-disk install marker (see §5). |

A Windows **junction** (\`mklink /J\`, no admin rights needed, local directories only) stores no data. It is a
pointer at the filesystem level. Consequently:

\`\`\`text
C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js
        === literally the same NTFS file as ===
E:\dev\dsh-attach-input\lib\client.js
\`\`\`

Same file id, same volume, same content, same timestamps. There is **no second copy anywhere on disk**.

### 1.2 What a Junction install means for deployment

For a link/junction install the words "install" and "deploy" lose their usual meaning:

- **The repo tree *is* the installed copy.** Every save in the repo is instantly visible at the profile
  path. There is no artifact to move, no \`node_modules\` payload to refresh, no lockfile entry to bump.
- **For a lib-only plugin with no build step, "shipping" the edit *is* editing the file.** The shipped
  bytes and the repo bytes are the same bytes. Nothing in the pipeline needs to run.
- **The only thing left is *activation*** — getting the already-correct bytes actually executed and
  displayed. That is a process/cache problem, never a file-copy problem (§4).
- Corroborating practice in the skill's own records: six link-installed Web client plugins crossed whole
  version corridors with "**zero code changes** … the profile junction installs loaded unchanged"
  (\`references/v0.1.3-alpha.1.md\`, six-plugin validation record); and "junction installs need no sync"
  (card DSH-0.1.3-A1-07). The install topology is deliberately edit-in-place.
- Note also that link-installed plugins sit **outside** the newer Plugin Manager's bundle management
  (card DSH-0.1.6-A2-03): the Plugins page will not install/remove them, and toggling their row goes
  through the profile's \`cordis.patch.yml\` (\`disabled\` override) plus an HMR reload or host restart.
  So "the profile does not manage this plugin" is expected, not a symptom of a broken install.

### 1.3 Was copying repo files into the profile's \`node_modules\` EVER right for this install?

**No. Never. Not once, in any variant.** For a junction install the copy step is not merely redundant — it
is structurally impossible for it to do anything useful:

1. **Source and destination are the same file.** \`Copy-Item E:\dev\dsh-attach-input\lib\client.js
   C:\...\node_modules\@org\dsh-attach-input\lib\client.js\` is a request to copy a file onto itself
   through a junction. Windows resolves the destination through the reparse point back to the repo file
   and refuses the self-copy — which is exactly the \`IOException … is being used by another process\`
   (EBUSY / sharing violation) seen in \`fixture/copy-session.txt\`. The error is not a permissions
   problem and not a transient lock; it is the symptom of a command that has no valid meaning for this
   topology.
2. **It could never have changed anything.** Even in the impossible case where the copy "succeeded", it
   would write the same bytes over the same bytes. There is no stale copy in the profile to refresh —
   the maintainer's premise ("the profile must be running an installed COPY") was factually wrong, and
   \`profile-introspection.txt\` disproves it in one command.
3. **It actively caused the damage.** Because the copy could not work, the maintainer escalated to a
   rename-aside hack (§3), which is the step that actually destroyed the entry files. The generic
   "copy into node_modules" advice is the root cause of the outage, not a harmless extra step.

The contrast that makes this concrete: **if** \`Get-Item\` had reported an empty \`LinkType\` (a real
directory — a registry/pnpm-copied install), *then* the correct procedure would be: fully stop the host →
copy the new \`lib/*.js\` over the installed copies → verify \`node --check\` → restart the host → hard
refresh. That is the only world in which "copy into node_modules" is correct, and this is not that world.

---

## 2. The two locks and their owners

There are two independent "locks" in play, and they are owned by two different processes. The maintainer
attributed both to the browser; in fact **neither** belongs to the browser.

### 2.1 Lock A — the stale-bytes lock: owned by the **dsh web host process** (and, secondarily, the browser cache)

- **Which process serves the client bundle?** The \`dsh web\` host process — its own HTTP server serves the
  Web app and the client plugin bundle/combo to the browser. The browser is only an HTTP/WebSocket
  *client* of that server. Nothing the browser does locally changes the bytes the host serves.
- **Why a refresh showed nothing new:** the page re-fetched the client bundle **from the host**, and the
  host was still serving the copy it had read **when it booted** (the plugin row was composed and its
  \`lib/client.js\` was loaded/read into the host's module graph and its client-bundle cache at boot). A
  plain refresh therefore gets old bytes even though the file on disk is new. On DSH 0.1.7-alpha.2 and
  later this is explicit, measured behaviour: "Client plugin bundles are read and cached when the host
  boots: editing a served \`lib/client.js\` on disk NO LONGER takes effect on page refresh alone (0.1.6-era
  behavior); only a host restart serves the new bytes" — card **DSH-0.1.7-A2-04**
  (\`references/v0.1.7-alpha.2.md\`).
- **The second, browser-side layer:** a plain reload can also be satisfied from the browser's HTTP cache.
  That is why a **hard refresh (cache bypass)** is part of the procedure — but note the ordering: the
  hard refresh only helps if the host is already serving the new bytes. Hard-refreshing against an
  un-restarted host is asking the cache to bypass itself in order to fetch the same old bytes again.
- **Auto-reconnect caveat** (same card): after a server restart an already-open page reconnects
  automatically and may keep *looking* healthy while it is still running **pre-restart client bytes**.
  "The page works" is therefore not evidence that the new code loaded. Verify the served bundle content
  itself (§4.4).

### 2.2 Lock B — the file-handle lock: owned by the **dsh web host process**

- **What holds the lib files open:** the running host has the plugin's host half (\`lib/index.js\`) loaded
  as a module in its Cordis loader graph, and has read \`lib/client.js\` (+ \`package.json\`, which is why
  \`package.json\` appears in the second EBUSY list in \`fixture/copy-session.txt\`) while composing and
  serving the row. On Windows, a file opened by a process without delete-sharing cannot be opened for
  write, moved, or replaced by another process → \`EBUSY\` / "being used by another process".
- **Why closing the browser tab did not release it:** the browser tab holds **no handle on those files
  at all**. The tab holds a TCP connection to the host's HTTP/WS server. Closing it terminates the
  connection; the host process keeps running, keeps its module graph alive, and keeps the handles. File
  locks on Windows are **process-scoped**, not connection-scoped — the only thing that releases them is
  the host process exiting.
  This is the same root cause the skill records for the global-upgrade EBUSY trap: "a running host holds
  native-module file locks → EBUSY; **a browser refresh is not a host stop**"
  (\`SKILL.md\`, host-upgrade discipline; \`references/troubleshooting.md\` EBUSY row: "文件锁在宿主不在浏览器").
- **Diagnostic attribution probes** (read-only, safe to run any time):
  - \`Get-Process node -ErrorAction SilentlyContinue\` (or \`Get-CimInstance Win32_Process -Filter "Name='node.exe'"\`) — identify the running \`dsh web\` host process(es); a \`dsh\` host shows the web/launcher command line.
  - \`Get-Process -Id <pid> | Select-Object Id, StartTime, Path\` — confirm the host started *before* the edits (a ghost host: see \`references/pre-flight.md\` §1.5 — an already-running host keeps executing old code while disk reports the new state).
  - A handle-inspection tool is *not* needed: the EBUSY plus a pre-edit host start time is sufficient attribution. Never kill a process you have not identified.

### 2.3 The asymmetry that made step 5 possible (and catastrophic)

Worth internalising, because it explains the whole session:

- **Writing** the destination (Copy-Item, \`-Force\`) needs *write* access → **denied** (EBUSY).
- **Renaming** the destination (Rename-Item) needs only *delete/rename* access, which Windows grants to
  files opened with share-delete → **succeeded**.

That is why the rename "worked" when the copy would not, and why many editors survive an edit against a
loaded file (write-temp-then-rename-over). The same capability that makes an in-place edit possible is
what made the rename-aside trick *look* like a viable workaround — right up to the moment it moved the
only existing copy of the entry files out from under both paths.

---

## 3. Why the rename-aside trick destroyed the SOURCE directory, and the exact recovery

### 3.1 Mechanism

\`\`\`powershell
$dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
Rename-Item ($dst + '\client.js') 'client.js.old2'
\`\`\`

\`$dst\` is reached **through the junction**, so \`$dst\client.js\` *is* \`E:\dev\dsh-attach-input\lib\client.js\`.
\`Rename-Item\` renamed that single physical file. There is no second file in a "profile copy" to keep the
old name alive — the rename propagated to both views at once, because both views are the same directory:

\`\`\`text
Get-ChildItem E:\dev\dsh-attach-input\lib     ->  client.js.old2   index.js.old2
Get-ChildItem $dst                            ->  client.js.old2   index.js.old2
\`\`\`

Then \`Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')\` failed with
\`Cannot find path "E:\dev\dsh-attach-input\lib\client.js" because it does not exist\` — because the
maintainer had *just renamed that exact path away*. The copy did not fail because the junction mysteriously
"ate" files; it failed because the source no longer existed under that name. The final state is not "two
damaged copies" but **one damaged directory**: the plugin has no entry files at all, so the host cannot
load the row (expect a boot-graph failure / non-activating entry for \`@org/dsh-attach-input\` until recovery
is done).

Damage inventory: \`lib/client.js\` and \`lib/index.js\` are renamed to \`.old2\`; **content is intact** (the
copy never overwrote anything, and the renamed files were the *edited* files — the edits were saved before
the copy attempts). \`lib/package.json\` is **not** renamed (only the two entry files were), but it was named
in the EBUSY list, so confirm it is present and unmodified.

### 3.2 Exact recovery from the current broken state

Run in this order. Steps 1–2 are the only file operations, and they are renames — the one operation already
proven to succeed against this host.

\`\`\`powershell
# 0. Record the current state for the report
Get-ChildItem 'E:\dev\dsh-attach-input\lib' | Select-Object Name, Length, LastWriteTime

# 1. Fully stop the host FIRST (so nothing re-loads a half-named path mid-repair).
#    Stop every dsh / dsh-web process, then verify none remain.
Get-Process | Where-Object { $_.ProcessName -match 'dsh|node' } |
  Select-Object Id, ProcessName, Path, StartTime      # identify the dsh web host rows first
#    ... then Stop-Process -Force on those rows only, and re-check until the list is empty.

# 2. Rename the two files back to their real names. Do it through EITHER path - they are the same file.
#    Do it in the repo (the canonical path), and do NOT copy anything.
Rename-Item 'E:\dev\dsh-attach-input\lib\client.js.old2' 'client.js'
Rename-Item 'E:\dev\dsh-attach-input\lib\index.js.old2'  'index.js'

# 3. Verify names, syntax, and that the new feature is really in the bytes.
Get-ChildItem 'E:\dev\dsh-attach-input\lib'                       # expect client.js, index.js, package.json
node --check 'E:\dev\dsh-attach-input\lib\index.js'               # host half
node --check 'E:\dev\dsh-attach-input\lib\client.js'              # client half
Select-String -Path 'E:\dev\dsh-attach-input\lib\*.js' -Pattern 'hover|preview'   # new-feature marker present?

# 4. Prove the junction is still intact and the two paths are one directory again
Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
  Select-Object FullName, LinkType, Target                       # LinkType must still be Junction
(Get-FileHash 'E:\dev\dsh-attach-input\lib\client.js').Hash -eq
  (Get-FileHash 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js').Hash   # must be True

# 5. Restart the host, then hard-refresh the browser (full procedure in section 4)
dsh web --profile web
# Ctrl+Shift+R (or Ctrl+F5) in the browser

# 6. Confirm the plugin row activated and the feature is live (section 4.4)
\`\`\`

Notes on the recovery:

- **Do not** re-run any \`Copy-Item\`, \`Move-Item\`, \`xcopy\`, \`robocopy\`, or "delete and reinstall" step. The
  files are already where they belong; every one of those operations would either fail again or destroy
  the last remaining copy.
- **Do not** "fix" it by recreating the junction or re-running \`pnpm install\` in the profile. The junction
  is intact — nothing about it was damaged. Re-installing would at best replace the junction with a real
  copied directory, permanently severing the repo→profile link and recreating the exact problem the
  maintainer thought they had.
- If \`node --check\` fails, or the new-feature marker is **absent** from the \`.old2\` content, then the
  edits themselves were not in those files: re-apply them from your editor's local history / backup, then
  re-run \`node --check\` before restarting. (From the evidence, the \`.old2\` files *are* the edited files,
  so this should be a clean restore — but verify rather than assume.)
- After the host restarts, check the boot log for the plugin id. Expect **no** \`failed to import loader
  entry @org/dsh-attach-input\`, **no** \`N entries did not activate\`, and **no** \`waiting for service: …\`
  lines attributable to this row (\`references/troubleshooting.md\` symptom table).

---

## 4. The complete, ordered activation procedure (link-installed lib-only Web plugin, after repo edits)

This is the procedure that should have been followed after step 1 of the maintainer's thread. It has no
copy step, because there is nothing to copy.

### 4.1 Before you touch anything (pre-flight — see §5)

1. Determine the install mode: \`LinkType\`/\`Target\` on the profile entry + the \`link:\` marker in the
   profile's \`cordis.patch.yml\`. Only continue if it is a link/junction install (it is).
2. Identify the running host process(es) and note their start time — you are about to stop them, and a
   "ghost host" started before the edit is the thing that will bite you.

### 4.2 The ordered procedure

| # | Action | Why |
|---|---|---|
| 1 | **Edit the repo files** (\`E:\dev\dsh-attach-input\lib\client.js\`, \`lib\index.js\`). Save. | For a link install this *is* the deployment. The bytes are already live at the profile path. |
| 2 | **Static check, no build**: \`node --check lib/index.js && node --check lib/client.js\`. Grep the artifact for the new version constant / feature marker. | Lib-only plugins have no build pipeline; \`node --check\` is the available static gate (\`examples/06…en.md\` routine for vanilla-lib plugins). |
| 3 | **Fully stop the host process** — the \`dsh web\` host, every dsh process on the box. Verify with \`Get-Process\` that nothing remains. **Closing the browser tab is not a host stop.** | Releases the EBUSY file handles (§2.2) and drops the in-memory module graph + the client-bundle cache read at boot (§2.1). Also required before *any* future file operation in that tree. |
| 4 | **Restart the host**: \`dsh web --profile web\` (from the profile directory). Wait for boot to finish. | The host half (\`lib/index.js\`) is only executed by a fresh process — including the new read-only route, which is registered once at apply time by the *new* process. |
| 5 | **Hard-refresh the browser** (Ctrl+Shift+R / Ctrl+F5, or DevTools → "Empty Cache and Hard Reload"). | Bypasses the browser's HTTP cache for the client combo/bundle (§2.1). The host serves the bytes it cached at boot, so the page must be forced to re-fetch them. |
| 6 | **Verify** (§4.4) — served bytes, registration, and behaviour. | "The page loads" is not evidence; an auto-reconnected page can run pre-restart client bytes (card DSH-0.1.7-A2-04). |

**Which processes must stop and restart — host vs browser:**

- **Host: must fully stop and restart.** Always, for this change set, because \`lib/index.js\` (host half)
  changed → the new read-only host route only exists in a new process; and because client bundles are
  read and cached at host boot (card DSH-0.1.7-A2-04) → even a *client-only* edit needs the restart on
  current DSH. A "soft" reload, HMR, or a config reload is not a substitute: HMR/config reload covers
  composition rows, not re-reading already-loaded plugin modules.
- **Browser: does not need to restart the application, but must bypass its cache.** A hard refresh
  (cache bypass) is sufficient; closing and reopening the tab is *not* equivalent if the browser keeps
  its HTTP cache. For the same reason, verify in a **fresh** DevTools session or with caching disabled,
  not in a tab that has been open since before the restart.
- **Order matters**: host restart **before** the hard refresh. Refreshing first just re-fetches the old
  cached bundle from the un-restarted host.

### 4.3 Why a hard refresh is needed for \`client.js\`

\`lib/client.js\` is not executed by the browser from disk — the browser downloads the client bundle/combo
that the **host** serves. Two caches therefore stand between the edited file and the running page:

1. the **host's** boot-time read/cache of the bundle (cleared only by a host restart), and
2. the **browser's** HTTP cache of the URL it fetched (cleared only by a cache-bypassing reload).

A normal reload asks the browser cache first, and even a validated revalidation can be answered from the
host's stale cached bytes. A hard refresh forces the browser to re-fetch from the network; combined with
a restarted host, that request is finally answered with the new \`lib/client.js\`. This is the
"client half takes effect on a hard refresh" rule (\`references/migration-hygiene.md\` §3) with the
0.1.7-alpha.2 correction layered on top: the hard refresh is necessary but **not sufficient** on its own.

### 4.4 How to verify the new code actually loaded

Verify at three layers — disk, served bytes, behaviour. Passing only the third is the trap.

1. **Disk layer (proves the repo side only):** \`Get-FileHash\` of \`E:\dev\...\lib\client.js\` equals the
   hash read through the profile junction path; \`node --check\` clean; the new feature marker is present
   in the file.
2. **Served-bytes layer (proves what the browser will get):** DevTools → Network, caching disabled,
   hard reload. Find the client bundle/combo request, open its **Response** and search for the new
   feature marker / version constant. The response must **not** be marked "(from disk cache)". This is
   the check card DSH-0.1.7-A2-04 prescribes: "verify the served bundle content itself (fetch the combo
   URL and inspect), not just that the page responds."
3. **Registration layer:** DevTools → Console — the plugin's client half registers through
   \`window.__ModuleLoader__.load({ id, factory })\`; the id must be \`@org/dsh-attach-input\` and there must
   be **no** \`Failed to load plugins: failed to import loader entry …\` and **no** factory error. One
   broken bundle can take down the whole combo, so a console error here is a hard stop
   (\`references/troubleshooting.md\`).
4. **Host layer:** the boot log lists the plugin row as activated, with no
   \`web boot: N entries did not activate\`, no \`waiting for service: …\`, no
   \`duplicate loader entry id\`; \`dsh --profile web --dump-config\` shows the row and nothing pending.
5. **Behaviour layer (the real proof):**
   - *client half*: attach an image in the composer and hover it — the hover-preview overlay must appear
     (the feature the edit was for).
   - *host half*: call the new read-only route and confirm the **new** response shape (not a 404, not the
     old payload). Per the skill's host/client asymmetry record, "the client bundle is re-fetched on every
     refresh (no-cache), while the host half registers its routes once at apply time (the closure holds
     the old whitelist), and the running process only swaps them on a host restart" — so a 404 on the new
     route with a 200 on the old one proves you are still talking to a pre-restart host.
6. **Rollback baseline recorded** before all of this: current HEAD/version of the repo, the two file
   hashes pre-edit, and the profile \`cordis.patch.yml\` row — so a failed activation is diagnosable rather
   than guessed at.

---

## 5. The pre-flight check that must come before touching any file

### 5.1 Determine the install mode (two commands, ~10 seconds, read-only)

\`\`\`powershell
# A) What IS the profile entry? (link vs real directory)
Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
  Select-Object FullName, LinkType, Target
#   LinkType = Junction / SymbolicLink  -> LINK install  -> repo tree IS the installed copy
#   LinkType = (empty)                  -> real directory -> COPIED / registry install

# B) What does the profile composition say about this row?
Get-Content 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' |
  Select-String 'dsh-attach-input'
#   "- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)"
#     -> the install marker: a link: row with the target path and the install date

# C) (corroborating) how was the dependency declared?
Get-Content 'C:\Users\me\.dsh\profiles\web\package.json'      # dependency written as "link:<abs path>"
\`\`\`

Interpretation table:

| \`LinkType\` | \`Target\` | \`cordis.patch.yml\` marker | Install mode | What "deploy the edit" means |
|---|---|---|---|---|
| \`Junction\` / \`SymbolicLink\` | repo path | \`link:<repo path>\` | **link install** | nothing — edit = deploy |
| *(empty)* | *({})* | version/id row, no \`link:\` | copied / registry install | stop host → copy files → restart → hard refresh |

This is exactly the discipline the skill demands in its shared read-only preparation: "Record source
identity and installation identity separately: registry package, Git checkout, workspace/junction, or
copied install" (\`SKILL.md\`), and "the actual install track: registry package, Git checkout,
workspace/junction, or copied install" (\`references/pre-flight.md\` §0). The \`link:\` profile-dependency
mechanism that creates the junction is carded as **R-09** in \`references/rollup-0.1.2.md\`.

### 5.2 Why the generic "copy into node_modules" advice is actively harmful for link installs

1. **It is a category error.** The advice assumes a copied install. On a link install the destination
   path resolves to the source file, so the command has no valid semantics — it can only fail (EBUSY) or
   self-copy.
2. **It manufactures a false problem and burns the diagnosis.** The EBUSY it produces is then
   mis-attributed ("the profile must be running a stale copy", "the browser is holding the files"),
   which is precisely the wrong turn this session took. The lock was the host's, and there was never a
   copy to refresh.
3. **It invites the destructive workaround.** Copy fails → "rename aside, then copy" → the rename moves
   the *only* copy of the entry files, and the follow-up copy fails because its source no longer exists.
   The generic advice is the direct causal ancestor of the outage (§3).
4. **\`-Force\` against a loaded module is a live-corruption risk** in any world where the copy *can*
   proceed: overwriting a file a running host has mapped/loaded can crash or wedge the host mid-write,
   and a half-written entry file is worse than a stale one.
5. **It can silently sever the link.** Any "repair" that replaces the junction with a real directory
   (re-install, delete-and-copy) permanently disconnects repo edits from the profile. The maintainer
   would then be back in a world where every edit *does* need a copy — having destroyed the topology
   that made their workflow simple — and with no record of why.
6. **It hides the real activation problem.** The actual requirement was a process restart plus a cache
   bypass. Chasing a file-copy fix means the host keeps running pre-edit code and the browser keeps
   showing stale bytes, so the feature "doesn't work" for reasons that have nothing to do with files.

**Rule of thumb:** never write into a profile's \`node_modules\` for a plugin you did not install through
the package manager. If \`LinkType\` says Junction/SymbolicLink, the only correct file operations are the
edits you make in the repo itself.

---

## 6. Answers to the maintainer's five questions (compact)

1. **Why did the browser refresh show nothing new, and why were the lib files "in use" with no tab open?**
   Because the \`dsh web\` **host** serves the client bundle and had already read/cached \`lib/client.js\` at
   boot (card DSH-0.1.7-A2-04), and because the host process holds the loaded modules
   (\`lib/index.js\`, \`lib/client.js\`, \`package.json\`) open — Windows file locks are process-scoped, and the
   browser tab holds no handle on those files at all.
2. **What does Junction + Target mean for deploying my edits — was the Copy-Item ever necessary?**
   It means the repo tree *is* the installed tree: one physical directory, two paths. The edits were
   already deployed when saved. The Copy-Item was never necessary and could only fail — source and
   destination are the same file.
3. **Why did the rename-aside destroy the source, and what is the recovery?**
   The rename went through the junction, so it renamed the single physical file; both listings then show
   the \`.old2\` names, and the follow-up copy failed because its source path had just been renamed away.
   Recovery: stop the host → \`Rename-Item client.js.old2 client.js\` and \`Rename-Item index.js.old2 index.js\`
   → \`node --check\` both + grep the new-feature marker → confirm \`LinkType\` is still \`Junction\` and the
   hashes match across the junction → restart \`dsh web --profile web\` → hard refresh → verify (§4.4).
   Copy nothing, reinstall nothing.
4. **What is the correct activation procedure after repo edits?**
   Edit → \`node --check\` → **fully stop the host** (not the tab) → restart \`dsh web --profile web\` →
   **hard refresh** the browser (host restart first, refresh second) → verify served bytes, registration,
   boot log, and the actual hover-preview behaviour plus the new host route. Host half (\`lib/index.js\`)
   needs the restart; client half (\`lib/client.js\`) needs the restart *and* the cache-bypassing refresh.
5. **How should I have determined the install mode before touching files?**
   \`Get-Item <profile entry> | Select FullName, LinkType, Target\` plus the \`link:\` marker line in the
   profile's \`cordis.patch.yml\`. \`Junction\` + \`link:\` target ⇒ link install ⇒ the repo is the installed
   copy and "copy into node_modules" is not merely useless but actively harmful.

---

## 7. Pending / residual risk

- The fixture is a static transcript: no live process, filesystem, or host was available to confirm the
  *current* on-disk state or to run the recovery. The recovery commands in §3.2 are stated as the exact
  procedure to run; they have not been executed here (this evaluation is read-only by authorization).
- The DSH host version for the profile is not recorded in the fixture. The activation procedure above is
  written to the **stricter** of the two documented behaviours (client bundle cached at host boot,
  card DSH-0.1.7-A2-04), so it is safe on both older and current hosts. If the host is pre-0.1.7-alpha.2,
  a client-only edit would additionally work with a hard refresh alone — but a host restart remains
  required here because \`lib/index.js\` changed.
- Whether the profile has other link-installed plugins sharing this host is unknown; the host restart
  affects all of them, so schedule it (it is a normal restart, not a destructive one).
- Not verified here: the plugin's own manifest row name matching the bare package name (a separate class
  of "silently absent" boot failures, cards DSH-0.1.2-A1-25/A1-26) — worth a one-time check while the host
  is stopped, since the plugin currently has no entry files at all.
