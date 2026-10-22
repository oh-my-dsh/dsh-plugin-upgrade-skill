# S14 · Link-Install File-Lock Trap — Analysis Report

Plugin: `@org/dsh-attach-input` v0.2.11 (lib-only Web plugin: `lib/client.js` + `lib/index.js`, no build step).
Profile: `C:\Users\me\.dsh\profiles\web`. Repo: `E:\dev\dsh-attach-input`.

---

## 1. What the profile entry actually is

From `profile-introspection.txt`:

```
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target
  LinkType : Junction
  Target   : {E:\dev\dsh-attach-input}
```

and `Get-Content cordis.patch.yml` shows the marker:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

The profile's "installed copy" is not a copy at all — it is a **directory junction** whose target is the repo itself. The repo tree **is** the installed plugin. A junction means:

- every path under `...\node_modules\@org\dsh-attach-input\` (including `...\lib\client.js`, `...\lib\index.js`, `package.json`) resolves to the same on-disk file as `E:\dev\dsh-attach-input\...`;
- editing the repo in place **is** deploying — there is nothing to copy;
- any change made through either path is immediately visible through the other.

Therefore step 4 in the maintainer thread — `Copy-Item E:\dev\dsh-attach-input\lib\*.js` into the profile's `node_modules` — was **never** the right move for this install mode. The profile and the repo are the same files; "copying into node_modules" is advice for copied/registry installs only. For a link install the correct deployment step is: save the repo files, restart the host, hard-refresh the browser.

## 2. The two locks and their owners

Two processes, two different stale-code mechanisms:

### Lock A — the EBUSY on the lib files: owned by the running `dsh` host, NOT the browser

The `Copy-Item` EBUSY (`client.js`, `index.js`, `package.json` all reported "being used by another process", and it persisted after the browser tab was closed) is caused by the **dsh host process** still running. For a Cordis-style host, plugins are loaded by the host itself: the host reads `index.js` (and its server-side graph) into the running plugin scope, and a Web client bundle built by/served from the host resolves `client.js` through the profile path. Node on Windows holds an open file handle on the entry script/module graph it loaded, so the host keeps `lib/index.js` / `lib/client.js` / `package.json` locked.

The browser is an HTTP/WS client of the host — it never opens the lib files on disk and holds no file locks on them. Closing the browser tab therefore cannot release the EBUSY. The only thing that releases it is **stopping the dsh host process** (and any other process that mounted the plugin, e.g. a second host instance or a watcher).

### Lock B — the stale browser: served code owned by the host + browser cache

A plain browser refresh showed nothing new for two stacked reasons:

1. The host process had already loaded the old code into memory (the "ghost host" situation — disk may be new, the running process is old). Simply refreshing the page does not re-read the plugin from disk.
2. Even after the host restarts and re-reads the repo (now the new code, thanks to the junction), the browser can still serve `client.js` from its HTTP cache — the plugin is lib-only with no build step, so the served file URL is stable across your edits and the browser happily reuses the cached bundle.

Hence the two required resets: restart the host (to drop the old in-memory module graph), then a **hard refresh / cache bypass** (to get the new `client.js` bytes). Neither alone is sufficient.

## 3. Why the rename-aside trick destroyed the SOURCE directory too

The rename-aside recovery renamed:

```
$dst\client.js  ->  $dst\client.js.old2
$dst\index.js   ->  $dst\index.js.old2
```

where `$dst = C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib`. Because that profile path is a junction into `E:\dev\dsh-attach-input`, `$dst` and `E:\dev\dsh-attach-input\lib` are **the same directory**. Renaming through the junction renamed the one physical file, so both directory listings then showed only `client.js.old2` / `index.js.old2`. There was never a second copy to fall back on; both paths lost their entry files simultaneously. The follow-up `Copy-Item` then failed with "source does not exist" — because the source had been renamed too. The plugin now has no entry files at all, in both views of the same directory.

The correct recovery from the current broken state (only `client.js.old2` / `index.js.old2` exist):

1. **Fully stop the dsh host** (and any editor/watcher on those paths) so no handle remains on the renamed files.
2. Rename them back to their original names, through either path — they are the same directory:

   ```powershell
   $lib = 'E:\dev\dsh-attach-input\lib'
   Rename-Item ($lib + '\client.js.old2') 'client.js'
   Rename-Item ($lib + '\index.js.old2') 'index.js'
   ```

3. Verify both names are back in both views (`Get-ChildItem $lib` and `Get-ChildItem` of the profile path — identical) and that `package.json` still exists.
4. Syntax-check before activating: `node --check` on both files (they are plain JS, lib-only, no build):

   ```powershell
   node --check $lib\client.js; node --check $lib\index.js
   ```

   If the hover-preview edit also touched syntax, reconstruct it in git (`git status`/`git diff` in the repo) at this point, then re-check.
5. Then "activate" — run the procedure in §4. Do **not** copy anything into node_modules; the junction already publishes the repo.

Note: `client.js.old2`/`index.js.old2` are the **pre-rename** files (i.e. they contain the hover-preview edits, assuming those were saved before the accident) — restoring their original names also restores the feature code. Verify the feature lines are present before syntax-checking.

## 4. Complete ordered activation procedure (link-installed, lib-only Web plugin)

Prerequisite: pre-flight confirms a link install (§5). Current state: repo edited and recovered, entry files present.

1. **Save all repo edits** in `E:\dev\dsh-attach-input` (client.js / index.js / package.json in final state). No build step exists, so the files on disk are the shippable artifact.
2. **Fully stop the dsh host** — the entire process tree: the `dsh` / `dsh web` host process, any running plugin dev-watch process, and any second host instance attached to the same profile. Only after they are gone are the lib-file locks released and the old in-memory plugin graph dropped. (Editor/IDE file watchers on the repo should be closed too if they hold handles.)
3. Verify the lock is gone if you need to touch files: a `Copy-Item`/`Rename-Item` probe on a copy — no, more directly, no process of yours should hold the files; the EBUSY on Copy-Item for these paths indicates a survivor host. Do not Copy-Item into the junction regardless.
4. **Start the host fresh** (`dsh web` or the normal launcher) so it re-reads `index.js` / `client.js` / `package.json` from the repo through the junction. New server route (`read-only host route` from the feature) appears in the host's route table — confirm via the host startup log or a host route listing that previously lacked it.
5. **Hard-refresh the browser with cache bypass** (Ctrl+F5 / Ctrl+Shift+R, or DevTools → Network → "Disable cache" + reload). The host now serves the new `index.js`-declared client bundle; without a cache bypass the browser may still show the stale `client.js`. The reason `client.js` specifically needs a bypass: a lib-only plugin's served path (`.../dsh-attach-input/lib/client.js`) is unchanged by your edit, and browsers key HTTP cache on URL, not content — the hover-preview code is new, the URL is not.
6. **Verify the new code actually loaded**, by feature and by provenance:
   - UI: hover over an image attachment → the new hover-preview appears (old code did not);
   - network: DevTools → Network → the `client.js` request returns 200 with the new byte size/304-revalidated, and its source contains the preview code;
   - host route: call the new read-only host route directly and confirm it exists (old host has no such route);
   - in-page marker: check for the feature's DOM markers if present.
   Any one of these passing on stale code is impossible; the UI + network checks together confirm both lock-B resets (host restart and browser cache bypass) took effect.
7. Only then resume normal development. For subsequent edits, repeat from step 2 — host restart, hard refresh — never Copy-Item into the junction.

## 5. Pre-flight check that should come before touching any file

Determine the install mode **from the profile**; never assume a copied install.

```powershell
# 1. What is the profile entry physically?
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
#  - LinkType = Junction, Target = <repo path>  -> LINK INSTALL: repo IS the installed copy
#  - LinkType empty, real directory             -> COPIED/registry install: profile has its own copy

# 2. The composition marker
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
#  - "# link:E:\dev\dsh-attach-input"  -> link install (junction created by `dsh plugin link`-style install)
#  - no link: comment / plain entry    -> copied install
```

Decision rule:

- **Link/junction install**: repo edits are immediately live to the next host start; deploy = restart host + hard refresh. Do **not** Copy-Item the repo into `node_modules` — the "target" is the same files, and on Windows the open handles from the host will produce EBUSY, and rename-aside will damage the repo (§3).
- **Copied/registry install**: profile's `node_modules` holds its own copy; deploy = copy/replace those files (after stopping the host) or upgrade via the package workflow.

Why the generic "copy into node_modules" advice is actively harmful for link installs:

- It is a no-op logically (same files through the junction) but a destructive one physically: the host's open handles turn it into EBUSY, and the rename-aside workaround it invites renames the one physical copy away from both views, silently breaking the plugin everywhere.
- It misleads the mental model: you end up managing "the profile's copy" that does not exist, while the actual source (your repo) is being renamed out from under it.

General pre-flight additions before any upgrade work: confirm process ownership of locks (running `dsh` host PID vs browser), confirm the ghost-host generation (host started before or after your last repo write — see troubleshooting.md's junction row and the ghost-host guidance), and record the install track (registry / workspace / junction / copied) before writing any file.

---

### Limitations

- Analysis is confined to the evidence pack under the cell directory plus `skills/plugin-upgrade`; no external documentation was consulted, per the task instructions. Process-owner attribution for the EBUSY (host vs browser) is inferred from the fixture's static evidence and the dsh Cordis loading model described in the local skill references, not from live process inspection — the fixture environment is static.
- The fixture is static (no live `E:\dev` or profile paths to inspect), so recovery steps are given as the exact commands to run, not executed: the task forbids modifying the fixture or running installs/migrations.
