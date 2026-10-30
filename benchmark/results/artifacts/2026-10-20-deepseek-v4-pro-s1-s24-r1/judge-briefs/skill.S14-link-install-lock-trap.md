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
#### FILE: S14-link-install-lock-trap/report.md

# S14 · Link-Install File-Lock Trap — Diagnosis & Recovery

**Plugin:** `@org/dsh-attach-input` v0.2.11 — lib-only Web plugin (no build step; shipped
files are `lib/client.js` + `lib/index.js`).
**Mode:** A · inspect (read-only). Fixture left untouched; this report only.

---

## 0. What the introspection actually proves

`profile-introspection.txt` lines 1–5:

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

`profile-introspection.txt` lines 7–11 show the repo directory itself is a plain
directory (`LinkType` empty, no `Target`). And `profile-introspection.txt` line 13
shows the install marker in the profile composition:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

---

## 1. What the profile entry is, and whether copying was ever right

The profile entry is a **Junction** (a Windows NTFS reparse point) whose target is the
repository `E:\dev\dsh-attach-input`. The two paths are not "a source and a copy" —
they are **one physical directory** seen through two names. Every file under the profile's
`node_modules\@org\dsh-attach-input` is literally the repo file.

**Deployment semantics of a link install:** the repo tree *is* the installed copy. Editing
`lib/client.js` / `lib/index.js` in the repo is already "deploying" — there is no second
location to sync. This is the `link:` local install track: it is written as
`"@org/dsh-attach-input": "link:<abs path>"` (or an equivalent `cordis.patch.yml` row),
and the package manager creates a junction rather than a copied directory — key point +
card R-09 in `rollup-0.1.2.md`. Link-installed plugins also stay outside the Plugin
Manager's bundle management (key point + card DSH-0.1.6-A2-03), and "junction installs
need no sync" is called out directly (key point + card DSH-0.1.3-A1-07).

**Was `Copy-Item` into node_modules ever the right move? No.** For this install mode the
copy was never necessary — the profile already resolves to the edited repo bytes. Worse,
it was actively harmful (see §3): every path in the copy/rename session acted on the *only*
copy of the files.

---

## 2. The two locks and their owners

There are two distinct "locks" here, and **both are owned by the running `dsh web`
host process — neither is owned by the browser.**

**Lock 1 — stale client bundle (why refresh showed old code).** The client bundle
`lib/client.js` is read and cached by the host at boot; the host is the server that
serves the client bundle over the combo route. A browser refresh only re-requests from the
host, and a not-yet-restarted host answers with its pre-edit boot cache, so the page shows
old behavior. Key point + card **DSH-0.1.7-A2-04**: "client bundles are cached at host
boot" — a served `lib/client.js` edit no longer takes effect on page refresh alone; only
a host restart serves the new bytes. The host-plane half (`lib/index.js`, the new
read-only route) is the same story: the running Node process loaded the old module at
startup and keeps executing it from memory regardless of what the disk now says (the
"ghost host" effect, `pre-flight.md` §1.5).

**Lock 2 — the EBUSY file lock (why Copy-Item failed).** The running `dsh web` host
process holds open handles on the loaded/served lib files (`client.js`, `index.js`,
`package.json`), which on Windows makes `Copy-Item -Force` / rename / delete fail with
`IOException: being used by another process`. The browser never opens those files — it
is a pure HTTP client receiving bytes; the file handles live in the host's Node process.
Key point + card for the sibling case (S12 row): the running `dsh web` host holds the
file handles; "the lock is on the host, not the browser."

**Why closing the browser tab did not release EBUSY:** because the browser was never the
owner of either lock. It holds no handle to `client.js`/`index.js`/`package.json`
and it does not serve the bundle. Closing the tab changes nothing in the host process that
actually holds the handles and the boot cache. A browser refresh / tab close is not a host
stop (SKILL.md §Global DSH host upgrades, step 1).

---

## 3. Why rename-aside destroyed the SOURCE too, and the exact recovery

`copy-session.txt` lines 11–14 run the rename against `$dst`, the *profile* path. But
because `$dst` is a Junction to `E:\dev\dsh-attach-input`, `Rename-Item ($dst +
'\client.js') 'client.js.old2'` renames the **one physical file** `E:\dev\dsh-attach-input\lib\client.js`.
There is no other copy. So after the two renames:

- the repo's `lib\` now holds only `client.js.old2` / `index.js.old2` (its entry files are gone);
- the subsequent `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' …` fails with
  "does not exist" — the source was just renamed away by the very first step;
- both directory listings show the same `.old2` files because they are the same directory.

**Exact recovery from the current broken state** (only `client.js.old2` / `index.js.old2` exist):

1. **Restore the original names** in the one physical directory. Use the repo path to be
   unambiguous (both paths are equivalent, but the repo name makes the intent clear):
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
   ```
   (If the host is still running and still holds handles, the renames may themselves hit
   EBUSY — do the host stop in step 3 first, then rename. The files are merely renamed,
   not deleted, so no content is lost regardless of order.)
2. **Verify syntax** before activating:
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```
3. **Activate** per §4 (fully stop host → restart `dsh web` → hard refresh → verify).

---

## 4. Complete ordered activation procedure (link-installed lib-only Web plugin)

Because the repo tree *is* the installed copy, "deploy" = make the **running host** stop
using its old in-memory/boot-cached bytes. Order matters:

1. **Fully stop every dsh host process.** Find and terminate the `dsh web` (Node)
   process(es) — do not rely on closing browser tabs; a refresh/tab-close is not a host
   stop (SKILL.md §Global DSH host upgrades, step 1). This releases the file handles
   (EBUSY) and drops the boot-cached client bundle.
2. **Restart the host** — `dsh web` (for the profile in question). At boot the host
   re-loads `lib/index.js` (host-plane route/service) and re-reads/caches
   `lib/client.js` (client bundle). This is the only step that changes what the combo
   route serves (key point + card DSH-0.1.7-A2-04).
3. **Hard-refresh the browser** (Ctrl+Shift+R / Ctrl+F5 — a cache-bypassing reload). Two
   reasons, both about cache layers on top of the host:
   - the browser's own HTTP cache may still hold the old `client.js` response;
   - DSH-0.1.7-A2-04 adds auto-reconnect: an already-open page may keep working across the
     restart *while still running pre-restart client bytes*, so a plain refresh of an open
     tab can still show old code. A hard refresh (or opening a fresh tab) forces a new
     fetch from the now-restarted host.
4. **Verify the new code actually loaded**, not just that the page responds:
   - fetch the client combo/bundle URL directly and confirm the served `client.js` bytes
     contain the new hover-preview marker (a changed byte/string), not the old one —
     key point + card DSH-0.1.7-A2-04;
   - exercise the feature: hover an image attachment and confirm the preview renders;
   - confirm the new read-only **host route** answers (new path/extensions return 200/expected
     body) — the host half is the one that needs the restart, since the route was registered
     from the old in-memory module;
   - check the browser console for loader errors and confirm the plugin still registers/mounts.

---

## 5. Pre-flight check before touching any file: determine the install mode

Before any copy/rename/delete, establish *which install track* this plugin is on (key
point + `pre-flight.md` §0: record "registry package, Git checkout, workspace/junction,
or copied install" as part of the inventory).

1. **Inspect the profile entry's link metadata:**
   ```powershell
   Get-Item <profile>\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
   ```
   - `LinkType : Junction` (or `SymbolicLink`) with a `Target` pointing at the repo →
     **link install**; the repo tree is the installed copy.
   - `LinkType` empty / no `Target` → a real **copied dependency** directory, where the
     profile holds its own physical copy that does need replacing/syncing (and even then,
     stop the host first — §2 Lock 2).
2. **Read the install marker in the profile composition** — `cordis.patch.yml` (also check
   `package.json` `dependencies` for a `link:` specifier):
   ```
   - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed …)
   ```
   A `link:<path>` marker (or a junction entry) ⇒ link install. A bare semver range in
   `dependencies` with a plain (non-junction) `node_modules` directory ⇒ copied install.

**Why the generic "copy into node_modules" advice is actively harmful for link installs:**
for a copied dependency the advice is (conditionally) reasonable; for a link/junction
install it is both pointless and destructive — the profile path and the repo path are the
same physical directory, so "copying repo → profile" is a self-copy (EBUSY / no-op), and a
rename-aside "recovery" mutates the *only* copy of the source. In this case that exact
advice turned a working plugin into a repo and profile that both have no entry files.
The correct action for a link install after a repo edit is: nothing to copy — stop the
host, restart, hard-refresh, verify (§4).

---

## Summary (what was tested)

- **Link/junction install semantics:** repo tree IS the installed copy; Copy-Item was never
  the right move (junction target + `link:` marker prove it).
- **Both locks belong to the running `dsh web` host**, not the browser: it serves/caches
  the client bundle (stale refresh, DSH-0.1.7-A2-04) and holds the lib file handles
  (EBUSY persists after tab close).
- **Rename-aside destroyed the source** because the junction made both paths the same
  directory; recovery = rename `.old2` back, `node --check`, then host restart.
- **Activation** = stop host → restart `dsh web` → hard refresh → verify served bytes.
- **Pre-flight** = read `LinkType`/`Target` and the `cordis.patch.yml` `link:`
  marker before any file operation.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.