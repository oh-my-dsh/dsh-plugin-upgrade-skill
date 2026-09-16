# S14 · Link-Install File-Lock Trap — Diagnosis Report

Plugin: `@org/dsh-attach-input` v0.2.11 (lib-only Web plugin, no build step; shipped files are `lib/client.js` + `lib/index.js`)
Repo: `E:\dev\dsh-attach-input` · Profile entry: `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input`
Evidence: `fixture/profile-introspection.txt`, `fixture/copy-session.txt`, `fixture/maintainer-thread.md` (read-only, unmodified)

---

## 1. What the profile entry actually is — Junction install, repo tree IS the installed copy

Cited introspection (`fixture/profile-introspection.txt`):

```
PS> Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}

PS> Get-Item E:\dev\dsh-attach-input | Select-Object FullName, LinkType, Target
FullName : E:\dev\dsh-attach-input
LinkType :
Target   : {}

PS> Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

The profile entry is an NTFS **Junction** whose target is the repo directory (the repo itself is a
normal directory — empty `LinkType`/`Target`). The composition marker confirms it: the profile's
`cordis.patch.yml` row is annotated `link:E:\dev\dsh-attach-input (installed 2026-08-30)` — the
standard `link:` install track, where the package manager creates a junction from the profile's
`node_modules` entry to the absolute plugin path.

**What this means for deployment:** a junction is not a copy — both paths resolve to the *same
physical directory on disk*. There is exactly one copy of `client.js` / `index.js` / `package.json`.
The repo tree IS the installed copy, so every edit made in `E:\dev\dsh-attach-input` was already
"deployed" to the profile the moment it was saved. The only thing standing between an edit and the
running system is process state (the host's loaded-module cache) and browser HTTP cache — never
file placement.

**Was `Copy-Item` into the profile's node_modules ever the right move? No — never, for this install
mode.** It was redundant (the edits were already live at the profile path, through the junction) and
it was self-referential: "copying into the profile" writes *through* the junction into the repo
itself. The install took no sync step when it was created (2026-08-30) and none exists; per the
skill's records, link/junction-installed plugins load unchanged across host upgrades precisely
because "junction installs need no sync" (v0.1.3-alpha.1 card A1-07 verification; six-plugin
zero-code validation record, `references/v0.1.3-alpha.1.md`).

## 2. The two locks and their owners — both belong to the host process, not the browser

**Which process serves the client bundle:** the running `dsh web` **host** process (the Node
process). It loads the plugin through the junction at startup — the host half (`lib/index.js`,
including the read-only host route) enters its module cache and its routes register once at apply
time; the client half (`lib/client.js`) is served by the host's HTTP server to the browser.

**What holds the lib files open:** the same host process. On Windows, files loaded into a running
Node process (module cache, loaded scripts/native modules) are held open by that process's file
handles — the skill's own records show a real host PID locking a loaded `.node` module
(`references/troubleshooting.md`, S12 row). That is the EBUSY on every `Copy-Item` of `client.js`,
`index.js`, and `package.json` into the profile path.

**Why the browser refresh showed stale code:** closing/refreshing the tab touches neither lock.
A browser refresh only re-fetches what the *running host* serves — and the host was never
restarted, so it still had the pre-edit code in its module cache, its host route closures still
held the old code, and the served client bundle was the old one. (Even a normal refresh can
additionally hit browser HTTP cache for `client.js`; that is why a *hard* refresh is required
*after* the host restart — see section 4.) The user was told "restart dsh web and hard-refresh"
but only refreshed the tab — the restart, the step that actually swaps the code, never happened.

**Why closing the browser tab did not release the EBUSY:** the browser never held a disk file
lock. It holds the bundle in memory/HTTP cache, not an open handle on `lib\client.js`. The lock
owner is the host process PID; only **fully stopping the host** releases the handles. Closing the
tab was aimed at the wrong process.

## 3. Why rename-aside destroyed the SOURCE directory too, and the exact recovery

**Why both directories lost their files:** `$dst` (`...\profiles\web\node_modules\@org\dsh-attach-input\lib`)
is a path *through the junction*; `E:\dev\dsh-attach-input\lib` is the same physical directory.
The rename-aside trick assumed two independent copies ("rename the locked copy, copy the new one
in"), but there is only one file:

1. `Rename-Item ($dst + '\client.js') 'client.js.old2'` renamed **the repo's own `client.js`** —
   the rename traversed the junction and hit the single physical file.
2. Same for `index.js`. Now the one physical `lib` directory contains only `client.js.old2` /
   `index.js.old2` — which is exactly why **both** listings show only `.old2` files.
3. `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...` then failed with *"source does not
   exist"* — the copy source was itself the file that had just been renamed. The plugin was left
   with **no entry files under their real names at all**.

This is the documented failure signature for link/junction installs
(`references/troubleshooting.md`, S14 row): "rename-aside 绕锁后源目录和 profile 同时只剩 `.old2`
文件" — the rename went through the junction and renamed the only source file.

**Exact recovery from the current state** (order matters; no copy step exists anywhere in it):

```powershell
# 1. Rename the files back to their real names (do it once — both paths are the same files).
#    Via the repo path, so ownership is explicit:
Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2 index.js

# 2. Verify syntax before activating — the .old2 files contain the edited hover-preview code,
#    so this validates the new code, not the old:
node --check E:\dev\dsh-attach-input\lib\client.js
node --check E:\dev\dsh-attach-input\lib\index.js

# 3. Fully stop the dsh host process (this releases the file locks and drops the old code),
#    then start it again:
dsh web

# 4. Hard-refresh the browser (Ctrl+F5 / cache bypass).
```

Note the `.old2` files are the *edited* versions (they were renamed, not reverted); renaming back
restores the hover-preview work intact. After step 1, `Get-ChildItem` on either path should show
`client.js` / `index.js` (and `package.json`) — since both paths are one directory, one listing is
proof enough.

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin after repo edits

Precondition (section 5): confirmed link install — so there is **no deploy/copy/install step at
all**. The whole procedure is process- and cache-level:

1. **Static syntax check first** — `node --check lib\client.js` and `node --check lib\index.js`.
   A lib-only plugin has no build step, so there is no compiler to catch syntax errors before the
   host tries to load the file; do not let the host be the first one to parse it.
2. **Fully stop the host process** — the `dsh web` Node process, not the browser. It is the lock
   owner (section 2) and the holder of the old code (module cache + host routes registered at
   apply time). A browser refresh/close is *not* a host stop. Verify the process is actually gone
   before continuing.
3. **Start the host** (`dsh web`). On boot it re-requires the plugin through the junction, so the
   edited `lib/index.js` (new host route) and edited `lib/client.js` are what gets loaded and
   served.
4. **Hard refresh the browser** (Ctrl+F5 / DevTools-open refresh / cache bypass). Why hard:
   the browser may still hold the old `client.js` in its HTTP cache, and a normal refresh can be
   served from cache — stale code after a successful host restart is a *browser cache* symptom,
   while stale code before the restart was a *host process* symptom. Refresh only re-fetches; the
   host restart is what changes what is served.
5. **Verify the new code actually loaded** — do not accept a bare page load:
   - **Behavior pass on the new client feature:** attach/hover an image attachment and confirm the
     hover-preview actually appears (per the maintainer thread, this is the feature).
   - **Probe the new host route:** request the new read-only route and confirm it responds (new
     extension returns the expected payload, not 404). Disk-having-the-code is not proof the
     running process loaded it.
   - **Console clean:** the web console shows no loader/registration errors after load.
   - **Composition sanity:** `dsh --profile web --dump-config` still resolves the
     `node_modules/@org/dsh-attach-input` row with nothing pending (per the link-install
     verification recipe, `references/rollup-0.1.2.md` R-09).

Order rationale: stop-host → start-host → hard-refresh. Hard-refreshing before the restart
re-fetches the old bundle (and can re-cache it); restarting without a hard refresh can leave the
old client.js in browser cache. Only both, in that order, guarantees the new code end to end.

## 5. The pre-flight check that must come before touching any file

Determine the **install mode** from the profile, read-only, before any write:

1. **LinkType/Target probe** (the decisive check, and it is exactly what the introspection ran):
   ```powershell
   Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
     Select-Object FullName, LinkType, Target
   ```
   - `LinkType: Junction` (or ReparsePoint/SymbolicLink) + a `Target` → **link install**: the
     profile entry and the target directory are the same physical tree. Repo edits are already
     deployed; the correct activation is section 4's restart+hard-refresh, with zero file writes.
   - Empty `LinkType`/`Target` → a real directory: a copied/registry install, where updating
     means reinstalling through the package manager (`dsh plugin add` / the profile's lockfile
     package manager — never hand-copying files into `node_modules` either).
2. **Composition/install marker**: grep the profile's `cordis.patch.yml` (and
   `profiles/<name>/package.json` dependencies) for the package row. This install carries both
   markers: the `link:E:\dev\dsh-attach-input (installed 2026-08-30)` annotation in
   `cordis.patch.yml` and, in the `link:` install track, a
   `"@org/dsh-attach-input": "link:E:\dev\dsh-attach-input"` dependency that the package manager
   turned into the junction (R-09, `references/rollup-0.1.2.md`). Either one, read *before*
   touching files, answers the deploy question for free.

**Why the generic "copy into node_modules" advice is actively harmful for link installs** (this
incident is the proof, step by step):

- It is **redundant**: the file it copies to is the file it copies from — same inode-path through
  the junction. There is nothing to deploy.
- It **invites EBUSY**: the running host legitimately holds the loaded lib files; a pointless copy
  turns that normal state into a blocking error.
- It **invites the rename-aside workaround**: "rename the locked file, then copy" assumes two
  copies exist. Through a junction it renames the *only* copy — simultaneously corrupting the
  source repo and the profile, and making the follow-up copy fail with "source does not exist"
  (section 3). One redundant command plus one wrong assumption destroyed both trees.
- It **muddies ownership**: writes through the junction land in a Git working tree, so a botched
  "deploy" dirties (here: breaks) the repo the maintainer owns.

The skill records this exact trap as its own troubleshooting row
(`references/troubleshooting.md`, S14): check `LinkType`/`Target` to classify the install first;
"copy into node_modules" for a link install is a harmful recommendation; the fix path is
restore names → `node --check` → full host stop → restart `dsh web` → browser hard refresh.

---

### Summary of root causes

| Observed failure | Root cause |
|---|---|
| Browser refresh showed nothing new | Running `dsh web` host still held the old code (module cache + routes registered at apply time); the browser only re-fetches what the host serves. The host was never restarted. |
| EBUSY on every `Copy-Item`, even with no browser tab open | The host process (not the browser) holds the loaded `lib` files open. Closing the tab releases nothing. |
| Rename-aside wiped the repo too | Profile entry is a Junction to the repo: `$dst` and `E:\dev\dsh-attach-input` are one physical directory; the rename hit the only copy, and the follow-up copy's source no longer existed. |
| `Copy-Item` deploy attempt at all | Install-mode misdiagnosis: `LinkType: Junction` + `link:` marker in `cordis.patch.yml` prove a link install, where repo edits are already live and no file ever needs copying. |
