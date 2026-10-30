# S14 · Link-Install File-Lock Trap — diagnosis & recovery report

**Plugin:** `@org/dsh-attach-input` (community Web plugin, **lib-only bundle, no build step**)
**Repo (source of truth):** `E:\dev\dsh-attach-input`  ·  **Profile:** `C:\Users\me\.dsh\profiles\web`
**Mode:** A · inspect / diagnose (read-only). No migration, no install, no file was modified by this report.

## Executive summary (one screen)

1. The profile entry is a **Junction** → `node_modules\@org\dsh-attach-input` **is** `E:\dev\dsh-attach-input`.
   The repo tree *is* the installed copy. **Copying repo files into the profile's `node_modules` was never correct
   here** — it was a self-copy (source path and destination path resolve to the same physical directory).
2. Two different "stale/locked" symptoms, **one owner**: the **running `dsh web` host process**.
   It serves the client bundle (so a browser refresh alone cannot show new code) and it holds file handles on the
   loaded plugin files (so `Copy-Item` gets EBUSY). The **browser never held those handles** — closing the tab
   could not release the lock, and correctly did not need to.
3. The rename-aside "recovery" renamed the **single physical file** through the junction, so the *source* repo lost
   the entry files too. The backup and the copy-source were the same bytes.
4. Recovery = stop the host → rename `.old2` back → `node --check` → restart `dsh web` → browser
   **hard refresh** → verify the **served bundle bytes**, not "the page still works".
5. Pre-flight that should have run first: `Get-Item … | Select LinkType, Target` plus the `cordis.patch.yml`
   `# link:` marker. Copy-into-`node_modules` advice is *correct only for a copied/registry install*; applied
   to a link install it is at best a no-op and at worst destructive (it destroyed the only copy here).

---

## 1 · What the profile entry actually is (and what a Junction means for deployment)

### 1.1 The introspection (cited)

From `fixture/profile-introspection.txt`:

~~~
PS E:\dev> Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}

PS E:\dev> Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target
FullName : E:\dev\dsh-attach-input
LinkType :
Target   : {}
~~~

and the composition row in the profile:

~~~
PS E:\dev> Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
~~~

Reading of the evidence:

| Fact | Evidence | Consequence |
|---|---|---|
| Profile entry is a **Junction** (Windows directory reparse point) to `E:\dev\dsh-attach-input` | `LinkType : Junction` / `Target : {E:\dev\dsh-attach-input}` | The profile path and the repo path are **two names for one directory** |
| The repo directory is a **real directory**, not another link | `LinkType :` (empty), `Target : {}` | The junction is the *only* indirection; the repo tree is the physical tree |
| The composition row carries an explicit `# link:<abs path>` install marker | the `cordis.patch.yml` line above | Install track = **link install** (pnpm `link:` track), not a copied/registry dependency |
| Nothing needs to be built | plugin is a *lib-only bundle, no build step* (fixture `maintainer-thread.md`) | The shipped files **are** the repo files; there is no artifact to "publish" into the profile |

This is the standard community *link:* install track: the plugin package name is written into the profile's
`package.json` dependencies as `link:<absolute path>` and the package manager materialises a junction
(skill reference **R-09** · `references/rollup-0.1.2.md`). A link-installed plugin is also deliberately
**outside** the Plugin Manager's bundle management (**DSH-0.1.6-A2-03** · `references/v0.1.6-alpha.2.md`) — it is
loaded because the composition row points at it, not because a bundle owns it.

### 1.2 Deployment semantics of a link install

> **The repo tree IS the installed copy.** There is no separate installed artifact to publish, sync, or copy.

Therefore, for this plugin and this install mode:

* Editing `E:\dev\dsh-attach-input\lib\client.js` / `lib\index.js` **already changes the installed copy**,
  byte-for-byte, at the moment you save. There is no "deploy" step. Corroborated by the skill's own verification
  wording for link installs: *"plugins load from the unchanged profile (junction installs need no sync)"*
  (**DSH-0.1.3-A1-07** · `references/v0.1.3-alpha.1.md`), and by the six-plugin zero-code fleet record in the
  same card file.
* The profile's `node_modules\@org\dsh-attach-input` directory listing **is** the repo's `lib` listing. The
  fixture's final `Get-ChildItem` output shows both paths returning the identical two `.old2` files — that is
  not coincidence, it is the proof of the shared directory.

### 1.3 Was copying into `node_modules` ever the right move? — **No. Never, for this install mode.**

Concretely, in this case the copy command was:

~~~
Copy-Item E:\dev\dsh-attach-input\lib\*.js C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\ -Force
~~~

Through the junction, the destination `…\node_modules\@org\dsh-attach-input\lib\` **is** the source
`E:\dev\dsh-attach-input\lib\`. So the command asked Windows to copy a file onto itself. It could only ever:

* fail with EBUSY (what happened), or
* if it had "succeeded" after the lock was gone, it would have truncated/rewritten the one physical copy — a
  self-overwrite with a non-atomic write.

And the "copy into `node_modules`" advice is wrong in three more ways for a link install:

1. **It is redundant** — the bytes are already the live bytes (1.2 above).
2. **It bypasses the package manager** — a hand-written file inside a junction is invisible to the manager and
   will not survive any future `pnpm install`/re-link; the "deploy" would be a lie.
3. **It destroys provenance** — the only copy of your source *is* the installed copy, so any destructive move
   against the "installed" path is destructive against the source. That is precisely the accident in §3.

The generic advice ("copy the built files into the profile's `node_modules`") is *correct only for a **copied /
registry** install* — where the profile genuinely holds an independent copy that must be refreshed — and, for a
compiled plugin, the deploy step is the **build output** (not a copy of `lib/`). This plugin has neither: no build
step, and a link install. Applying copied-install advice to a linked install is the root cause of the whole
incident.

---

## 2 · The two locks and their owners

There are two symptoms, two mechanisms, and — importantly — **one owner: the running `dsh web` host process.**
The browser is involved in neither.

### Lock A — "the refresh shows nothing new" (a *serving* staleness, not an OS lock)

**Who serves the client bundle:** the **DSH host process** (`dsh web`), over HTTP. The browser tab is only a
consumer of bytes the host hands it; it never reads the plugin's `lib/` from disk. So "refresh the tab" re-requests
from the *same running host*, which may still be holding pre-edit state. Two independent sub-causes, both pointing
at the host:

1. **The host was never restarted.** The maintainer told the user *"restart dsh web and hard-refresh the browser"*,
   but the user's report says the user *"refreshed the browser tab only"* (`maintainer-thread.md`, step 3). The
   **host half** — `lib/index.js`, which registers the new read-only host route — is applied **once**, at host
   apply time; the route handler's closure keeps the *old* allow-list. A running process therefore keeps the old
   behaviour no matter how many times the page reloads. Attribution probe for exactly this asymmetry: *old input
   type → 200, new type → 404, while the on-disk artifact already contains the new allow-list ⇒ the running process
   predates the change* (skill reference `references/troubleshooting.md`, client/host plane-asymmetry row).
2. **The host caches client bundles at boot.** On hosts at or after **DSH-0.1.7-A2-04**
   (`references/v0.1.7-alpha.2.md`), *client plugin bundles are read and cached when the host boots*: editing a
   served `lib/client.js` on disk **no longer** takes effect on page refresh alone (0.1.6-era behaviour); only a
   **host restart** serves the new bytes. That card also warns that after a server restart an already-open page
   **auto-reconnects** and may keep running **pre-restart client bytes** — so "the page still responds" is *not*
   proof that the new code loaded. The fixture does not record the host's DSH version, so the exact cache rule in
   force here is **unconfirmed**; the *requirement* to restart the host is unconditional, because the host half
   changed (§4).

**Owner of Lock A:** the running `dsh web` host process. Not the browser, not the disk.

**And the browser has its own, third staleness layer:** the browser's HTTP cache of the bundle URL. Even with a
correctly restarted host, a plain reload can be answered from the browser cache, which is why a **hard refresh /
cache bypass** is required for `client.js` (see §4.6). The skill's plane rule is explicit: a change landing in
`lib/client.js` (client half) takes effect on a browser hard refresh; a change landing in `lib/index.js`
(host half) requires restarting dsh (`references/migration-hygiene.md` §3).

### Lock B — "EBUSY: the file is being used by another process" (a real OS file lock)

The evidence in `fixture/copy-session.txt`:

~~~
Copy-Item : The file "…\node_modules\@org\dsh-attach-input\lib\client.js"
is being used by another process, so the process cannot access this file.
+ CategoryInfo          : NotSpecified: (:) [ ], IOException, Microsoft.PowerShell.Commands.CopyItemCommand
~~~

and, critically, **the same IOException after the browser tab was closed** (the session's second attempt, covering
`client.js`, `index.js`, `package.json`).

**Why closing the tab did not release it:** the browser never held those handles. The browser received the bundle
as HTTP bytes; it has no open handle on `E:\dev\dsh-attach-input\lib\client.js` on the host filesystem. The
lock is held by the **host process** — the Node process that loaded the plugin's host half and read/assembled the
client bundle — and the skill states the rule in both places that matter:

* `SKILL.md`, host-upgrade discipline: *"fully stop every dsh process (a running host holds native-module file
  locks → EBUSY; **a browser refresh is not a host stop**)"*.
* `references/troubleshooting.md`, EBUSY row: on Windows, in-place upgrade/replace of dsh or plugin files reports
  EBUSY / "正由另一进程使用" and **closing the browser tab does not release it** — *"the file lock is in the host,
  not the browser"*; the prescribed order is **fully stop the host process → then replace/upgrade**.

So the maintainer's mental model was inverted: they treated the tab as the lock holder and the copy as the fix,
when the *host* was the lock holder and *stopping the host* was the fix.

**Unconfirmed detail (marked, not guessed):** the fixture does not name the holding PID, nor does it show whether
the handle is an open file handle or an in-memory-only cache. What is *confirmed* by the fixture: the lock is held
by "another process"; it survives closing the browser tab; and by the skill's Windows EBUSY row, the holder is the
running dsh host. The exact mechanism for the *client* bundle file specifically (boot-time read/assembly of the
combo) is **inference**, not fixture-confirmed — treat it as a working hypothesis, and identify the real holder by
process inspection rather than by assumption.

**Note on the "rename worked but the copy failed" oddity:** the transcript shows `Rename-Item` *succeeding* on a
file the host had locked, while the write-copy was refused. A rename only needs delete/share semantics, whereas the
copy needs write access — so a host that holds the file with a share-delete handle but no write share produces
exactly this asymmetry. This is **inference** (the fixture shows the outcome, not the handle flags).

---

## 3 · Why the rename-aside trick destroyed the SOURCE directory too

### 3.1 The mechanism

~~~
PS E:\dev> $dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
PS E:\dev> Rename-Item ($dst + '\client.js') 'client.js.old2'
PS E:\dev> Rename-Item ($dst + '\index.js') 'index.js.old2'
PS E:\dev> Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')
Copy-Item : Cannot find path "E:\dev\dsh-attach-input\lib\client.js" because it does not exist.
PS E:\dev> Get-ChildItem E:\dev\dsh-attach-input\lib
client.js.old2
index.js.old2
PS E:\dev> Get-ChildItem $dst
client.js.old2
index.js.old2
~~~

Both paths — `E:\dev\dsh-attach-input\lib` and
`…\node_modules\@org\dsh-attach-input\lib` — traverse **the same directory object** (the junction's target).
A directory has **one** namespace and **one** set of entries. `Rename-Item` through the profile path does not
create a second, profile-side file; it renames the *single* directory entry in the repo tree. There was never a
"profile copy" to displace — the profile path was a *name* for the repo directory.

So the sequence is self-defeating by construction:

| Step | What it actually did |
|---|---|
| `Rename-Item …\lib\client.js → client.js.old2` | renamed the **only** `client.js` in existence (the repo's) |
| `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' …` | tried to copy the file it had just renamed away → *"Cannot find path … because it does not exist"* |
| `Get-ChildItem` on both paths | identical listing ⇒ proof of one shared directory, not two synchronized copies |

The "backup" was the file, and the "source" was the file: **one file, renamed**. The plugin ended with no entry
files at all in either view, and — this is the good news — the **edited (hover-preview) content was not lost**:
the rename preserved the bytes, and the copy never wrote anything.

### 3.2 Exact recovery from the current broken state

Order matters; do not skip to step 4. (Commands are for the maintainer to run on their own machine; this report
executed nothing.)

**Step 0 — stop the host *first*.** The host must be fully down before any rename/copy, for two reasons: it holds the
locks (§2, Lock B) and it **caches the client bundle at boot** (DSH-0.1.7-A2-04) — starting it while only
`.old2` exists would bake a broken/no-entry bundle into the cache.

~~~
# identify the holder (read-only) — find the dsh host among the node processes
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, CommandLine | Format-List
# stop the dsh web host (and only it) — a browser refresh is NOT a host stop
Stop-Process -Id <hostPid> -Force
# confirm no dsh host is left
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, CommandLine | Format-List
~~~

**Step 1 — restore the original names. Do it through the REPO path**, so the physical tree you are renaming is
unambiguous (the profile path reaches the same place, but naming the repo path removes all doubt):

~~~
$lib = 'E:\dev\dsh-attach-input\lib'
Get-ChildItem $lib                     # expect: client.js.old2, index.js.old2
Rename-Item -LiteralPath "$lib\client.js.old2" -NewName 'client.js'
Rename-Item -LiteralPath "$lib\index.js.old2"   -NewName 'index.js'
Get-ChildItem $lib                     # expect: client.js, index.js
# and the profile path must show exactly the same entries (same directory)
Get-ChildItem 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
~~~

Restore **exactly once**, and restore **both** halves. Do not "re-copy from git" first: the `.old2` files already
contain the new hover-preview code (the edits were saved *before* the incident and the copy never overwrote
anything) — a `git checkout` would silently discard the feature.

**Step 2 — verify syntax.** This plugin has no build scripts, so the gate is a parse check of both halves
(per the lib-only routine in `skills/plugin-upgrade/examples/06-real-world-batch-migration.en.md`):

~~~
node --check "$lib\index.js"
node --check "$lib\client.js"
~~~

Caveat (worth one minute): `node --check` parses the file in the module format implied by the nearest
`package.json` `"type"` field. If the package is ESM (`"type": "module"`), check with the package's
own format context (or `node --input-type=module --check` style invocation) — otherwise a *false* parse error
is reported for a perfectly valid ESM entry file. Confirm what the package declares before treating a failure as
real.

Also confirm nothing else was left half-written by the failed copies:

~~~
node -e "const p=require('E:/dev/dsh-attach-input/package.json'); console.log(p.name, p.version)"
~~~

**Step 3 — confirm the restored bytes are the NEW code** (a marker string from your hover-preview implementation,
plus the new host-route path in `lib/index.js`):

~~~
Select-String -Path "$lib\client.js" -Pattern '<hover-preview marker>'
Select-String -Path "$lib\index.js"  -Pattern '<new read-only route path>'
~~~

**Step 4 — activate** (full ordered procedure in §4): start `dsh web`, then hard-refresh the browser, then verify
the served bytes.

**Step 5 — no cleanup of the profile's `node_modules` is required or desirable.** There is nothing copied there
to clean: the junction still points at the repo, and the profile directory listing is the repo listing. Running
`pnpm install` / `pnpm update` in the profile as a "repair" is *not* part of this recovery and can only add
risk (a link-installed plugin is outside bundle management anyway — DSH-0.1.6-A2-03).

---

## 4 · Complete, ordered activation procedure for a link-installed lib-only Web plugin after repo edits

Applies to this plugin shape (lib-only, no build step) **and** to any plugin installed by the `link:`/junction
track. The one-line summary: **the repo edit is the deployment; what remains is getting the two planes to re-read
the bytes — host restart first, browser hard refresh second — and then proving the new bytes are what is running.**

| # | Action | Why (owner / evidence) |
|---|---|---|
| 0 | **Pre-flight: determine the install mode** (§5). If it is a **link/junction** install, there is **no copy step at all** — the repo file *is* the installed file. | R-09; DSH-0.1.3-A1-07 ("junction installs need no sync") |
| 1 | Edit in the repo: `lib/client.js` (client half) and/or `lib/index.js` (host half). Nothing else to do — **do not copy into the profile** | §1.2–1.3 |
| 2 | **Static gate:** `node --check lib/index.js` and `node --check lib/client.js` (no build/typecheck/test scripts exist for this plugin shape) | examples/06 "final checks appropriate to the plugin's shape" |
| 3 | **Fully stop the host.** Stop *all* `dsh` processes (the `dsh web` host; check for other dsh instances). A browser refresh/tab close is **not** a host stop. | SKILL.md host-upgrade discipline; troubleshooting EBUSY row |
| 4 | *(only if the file set is wrong)* restore names / repair the tree with the host **down** (§3.2). Never while the host runs. | §3 |
| 5 | **Start the host**: `dsh web` (or `dsh --profile web`). The host re-reads the plugin's host half and re-reads/caches the client bundle at boot — this is what makes the new bytes visible. | DSH-0.1.7-A2-04; plane rule (migration-hygiene §3) |
| 6 | **Browser hard refresh** (cache bypass): `Ctrl+Shift+R`, or DevTools → Network → *Disable cache* → reload. Needed because the browser HTTP-caches the client bundle URL; a normal reload can be served from cache. If the page was open across the host restart, **reload again after the restart** — auto-reconnect keeps the pre-restart client bytes alive. | DSH-0.1.7-A2-04 (auto-reconnect caveat); troubleshooting plane row |
| 7 | **Verify the new code actually loaded** (§4.7). | DSH-0.1.7-A2-04 verification recipe |

### 4.7 How to verify the new code actually loaded (not "the page still works")

Because the page auto-reconnects across a host restart and can keep running pre-restart client bytes, verify the
**served bytes and the runtime behaviour**, not the page's liveness. The skill's own recipe for this card is
"edit one byte of a served client bundle; refresh the page and assert the change is NOT served; restart the host,
refresh, and assert it IS served" (DSH-0.1.7-A2-04) — i.e. content-level assertions, not a 200 response.

Concrete checks for this plugin:

1. **Served-bundle content check (client half).** Fetch the client combo/bundle URL the host advertises (boot
   manifest → client artifact) and grep the bytes for the hover-preview marker:
   ~~~
   Invoke-WebRequest 'http://127.0.0.1:<port>/<advertised-client-combo-url>' -OutFile .\combo.js
   Select-String -Path .\combo.js -Pattern '<hover-preview marker>'
   ~~~
   If the marker is absent, the host served a cached/old bundle (host not restarted, or the wrong profile/port).
2. **Host-route behaviour check (host half).** Exercise the new read-only route with the **new** input type
   (expect success) and the **old** type (expect the old response). The diagnostic signature of a stale host
   process is *old type 200 + new type 404 while the on-disk artifact already contains the new allow-list* — that
   means "the running process predates the change", i.e. the host was not restarted.
3. **Boot/activation check.** The host log must show the plugin's entry activated with nothing pending (no
   "loaded without registering <id>", no "N entries did not activate"), and the composition must resolve the row to
   the bare package name (R-09 verification: the row's `name` is the bare package name, DSH-0.1.2-A1-26).
4. **Composition check (read-only, on the running profile):** `dsh --profile web --dump-config` shows the
   `@org/dsh-attach-input` row resolved and nothing pending for it.
5. **Behavioural check.** Paste/attach an image into the composer and confirm the hover preview appears, the
   preview opens, and the new host route answers — the same runtime pass the skill records for this plugin class
   (DSH-0.1.3-A1-08: paste image/text, open preview/viewer, confirm slot placement).

### 4.8 Plane cheat-sheet for this plugin

| Changed file | Plane | Minimum action to see it |
|---|---|---|
| `lib/client.js` | client half (served to the browser) | **host restart** (re-reads/caches the bundle) **+ browser hard refresh** |
| `lib/index.js` | host half (routes/services registered once at apply) | **host restart** (a browser refresh can never fix it) |
| both (this incident) | both | host restart **then** browser hard refresh, in that order |

The original advice "restart dsh web and hard-refresh the browser" was, in principle, the right advice for these
two files — but (a) the user only did the browser refresh, and (b) it was preceded by a destructive, unnecessary
copy attempt that removed the entry files. The correct sequence is *stop → repair → start → hard refresh → verify*.

---

## 5 · The pre-flight check that should have come before touching any file

### 5.1 The check (read-only, ~10 seconds)

~~~
# (1) What IS the profile entry?  Junction/SymbolicLink + Target => link install.
Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
  Select-Object FullName, LinkType, Target
#     LinkType : Junction      Target : {E:\dev\dsh-attach-input}   -> LINK install
#     LinkType :               Target : {}                            -> copied/registry install

# (2) What does the composition say?  the '# link:' marker names the source path
Get-Content 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' | Select-String 'dsh-attach-input'
#     - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)

# (3) What did the package manager record?  the 'link:' spec is the source of the junction
Get-Content 'C:\Users\me\.dsh\profiles\web\package.json' |
  Select-String 'dsh-attach-input'
#     "@org/dsh-attach-input": "link:E:\\dev\\dsh-attach-input"

# (4) Optional but decisive: same bytes at both paths => one physical file, not two copies
(Get-FileHash 'E:\dev\dsh-attach-input\lib\client.js').Hash
(Get-FileHash 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js').Hash
~~~

Decision table:

| Signal | Install mode | What "deploying a repo edit" means |
|---|---|---|
| `LinkType` = Junction/SymbolicLink and `Target` = the repo path; `cordis.patch.yml` row carries `# link:<path>`; profile `package.json` dependency uses `link:<path>` | **link / junction install** | **nothing to deploy** — the repo file *is* the installed file. Edit, then restart the host + hard refresh the browser. **Never copy into `node_modules`.** |
| `LinkType` empty, `Target` empty, directory contains real files; the row/dependency names a version (registry) | **copied / registry install** | the profile holds an independent copy; refreshing it means re-running the package manager (or replacing the copy deliberately) — and *that* is the only world where "copy into `node_modules`" is even coherent |
| a `link:` dependency but a **stale** profile copy elsewhere | mixed | fix the install track first, then proceed |

This mirrors the skill's own discipline: record **source identity and installation identity separately** — registry
package, Git checkout, workspace/junction, or copied install (`SKILL.md`, shared preparation step 2) — and record
the *actual install track* in the pre-flight inventory (`references/pre-flight.md` §0).

### 5.2 Why "copy into `node_modules`" is actively harmful for a link install

* **It is a self-copy.** Source and destination resolve to the same physical directory. The only outcomes are
  EBUSY, or a non-atomic self-overwrite of your only copy. (What happened here: EBUSY, then a destructive
  rename, then *no entry files at all*.)
* **Any destructive move against the "installed" path is destructive against the source.** There is no redundancy
  to absorb a mistake — the profile path is an alias, not a backup. The rename-aside "recovery" is therefore the
  *worst* possible move on a link install: it renames the single physical file and then cannot copy it back.
* **It silently desynchronises you from the package manager.** The profile's `node_modules` for a `link:`
  dependency is owned by the package manager; hand-written bytes there are not tracked, are not reinstalled, and
  are not what a later `pnpm install` will reproduce. The "deployment" is imaginary.
* **It adds no value.** For a link install the repo edit is already live; for a compiled plugin the deploy step is
  the **build output**, not a copy of `lib/`. This plugin has no build step at all.
* **It is the *copy*-install advice, and it must be conditioned on the install mode.** Applying it to a linked
  install converts a harmless no-op into a data-loss incident.

**Rule to carry forward:** *determine the install mode first; a copy step is only ever meaningful for a copied or
registry install.*

---

## 6 · Validation & reporting (skill report structure)

**Pre-existing (not collected).** No baseline suite exists for this plugin: it is a lib-only bundle with no build,
typecheck or test scripts, so the static gate is `node --check` on both halves (run by the maintainer as part of
§3.2 step 2).

**Completed.**
* Install mode established from the fixture introspection: **Junction** profile entry → `E:\dev\dsh-attach-input`,
  `# link:` marker in the profile's `cordis.patch.yml` (installed 2026-08-30) → **link install** (§1).
* Deploy semantics established: repo tree **is** the installed copy; no sync/copy step exists for this track
  (R-09; DSH-0.1.3-A1-07) (§1.2–1.3).
* Both symptom mechanisms attributed to the **running `dsh web` host process** — serving/cache of the client
  bundle for the stale-refresh symptom, file handles for the EBUSY — with the browser shown to be irrelevant to
  both, corroborated by the fixture (lock persists after the tab was closed) and by the skill's Windows EBUSY row
  ("the lock is in the host, not the browser") (§2).
* Rename-aside accident explained: one physical directory, one file namespace; the rename moved the *only* file,
  and the subsequent copy therefore failed with "Cannot find path" (§3.1).
* Recovery path specified in executable order: stop host → rename `.old2` back (via the repo path) → `node
  --check` both halves → start `dsh web` → browser hard refresh → content-level verification (§3.2, §4).
* Pre-flight install-mode check specified (LinkType/Target + `# link:` marker + profile `package.json` link
  spec + optional hash equality) with a decision table and the "copy advice is mode-conditional" rule (§5).

**Skipped (with evidence).**
* No migration, no install, no runtime boot, no file written outside this report — the brief authorises a
  read-only diagnosis only; the fixture was not modified.
* No live-host probing (`dsh --version`, `--dump-config`, `cordis_inspect_*`, …) — out of scope per
  the boundary segment, and the installed host runs a different version than this task's subject.
* The **exact PID** of the lock holder was not identified (not present in the fixture); the report gives a
  read-only identification procedure instead of asserting a PID.
* The **host's DSH version** is not in the fixture, so whether the boot-time client-bundle cache rule
  (DSH-0.1.7-A2-04) is in force here is **unconfirmed**; the host-restart requirement holds regardless because the
  host half changed.

**Pending / residual risk.**
* The `.old2` files are the *only* copy of the edited entry files until they are renamed back — **do not** run
  `git checkout`/`git clean`/a package-manager install in the repo before restoring them.
* Whether the failed `Copy-Item` attempts left any partially written file (e.g. `package.json`) is not
  visible in the transcript; the report adds an explicit parse check.
* The mechanism behind "rename succeeded while the write was refused" is inferred from the observed outcome, not
  from handle inspection.

**Rollback.** Baseline before the incident: the plugin tree at `E:\dev\dsh-attach-input` with the *new*
hover-preview content in `lib/client.js` / `lib/index.js` (as saved before the incident), profile
composition row pointing at the junction, marker date 2026-08-30. Recovery from the incident is the rename-back in
§3.2 (the bytes were never lost). No other path in this task was modified; the only recoverable artifact is the
plugin's two entry files, restored by renaming `.old2` → original name.

**Recommendations.**
1. Encode the install-mode check (§5) as a mandatory first step of the plugin's own release/verification
   documentation — one `Get-Item … LinkType,Target` line — and state explicitly for link installs that
   *"there is no copy step; the repo file is the installed file."*
2. Replace the generic "copy into `node_modules`" advice in the README/verification runbook with the conditional
   rule: *copy only for a copied/registry install; for a link install, edit → `node --check` → restart host →
   hard refresh.*
3. Make the verification runbook **content-based** (grep the served bundle for a feature marker; probe the new host
   route) instead of "the page still works", because an open page auto-reconnects across a host restart and can
   keep running pre-restart client bytes (DSH-0.1.7-A2-04).
4. Never rename or move files under a link/junction path as a "lock workaround" — under a junction there is only
   one file, and the profile path is an alias for the source.

---

## Appendix · Evidence index (fixture + skill references)

**Fixture (read-only, unmodified)**
* `fixture/profile-introspection.txt` — `LinkType : Junction`, `Target : {E:\dev\dsh-attach-input}`; the
  repo directory's own `LinkType`/`Target` empty; the `cordis.patch.yml` row
  `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`.
* `fixture/copy-session.txt` — EBUSY `IOException` on `client.js`/`index.js`/`package.json`,
  **unchanged after the browser tab was closed**; the rename-aside sequence; the resulting
  `"Cannot find path … because it does not exist"`; the identical two-file listings in both directories.
* `fixture/maintainer-thread.md` — lib-only/no-build plugin shape; edits to `lib/client.js` +
  `lib/index.js` (hover preview + a new read-only host route); the user refreshed the tab only; the copy
  attempt; the rename-aside accident.

**Skill references consulted (key points + IDs only)**
* `SKILL.md` — host-upgrade discipline (stop all dsh processes; a browser refresh is not a host stop) and
  shared-preparation step 2 (record source identity and installation identity separately: registry / Git checkout /
  workspace-junction / copied install).
* `references/rollup-0.1.2.md` **R-09** — the `link:` profile-dependency track; pnpm materialises a
  junction; composition row uses the bare package name; verify on a staging instance.
* `references/v0.1.3-alpha.1.md` **DSH-0.1.3-A1-07** (junction installs need no sync) and **A1-08**
  (runtime pass for a lib-only paste/composer plugin: paste, open preview/viewer, confirm slot placement).
* `references/v0.1.7-alpha.2.md` **DSH-0.1.7-A2-04** — client bundles are read and cached at host boot; an
  install-tree client edit needs a host restart; auto-reconnect keeps pre-restart client bytes; verify by fetching
  the combo URL and inspecting content.
* `references/migration-hygiene.md` §3 — plane rule: `lib/client.js` → browser hard refresh;
  `lib/index.js` → dsh restart.
* `references/troubleshooting.md` — EBUSY row (lock is in the host, not the browser; stop the host, then
  replace); link/junction row (recovery recipe: `.old2` → original name → `node --check` → stop host →
  restart `dsh web` → browser hard refresh; check LinkType/Target before touching files); client/host
  plane-asymmetry row (new type 404 + old type 200 while disk has the new allow-list ⇒ running process predates
  the change).
* `references/v0.1.6-alpha.2.md` **DSH-0.1.6-A2-03** — link-installed plugins stay outside the Plugin Manager's
  bundle management; they still load and serve their bundles.
* `skills/plugin-upgrade/examples/06-real-world-batch-migration.en.md` — lib-only plugin shape ⇒
  `node --check lib/index.js && node --check lib/client.js`; "code changes don't show after a refresh" ⇒ client
  half = hard refresh, host half = restart.
* `references/pre-flight.md` §0 — the pre-flight inventory must record the actual install track.
