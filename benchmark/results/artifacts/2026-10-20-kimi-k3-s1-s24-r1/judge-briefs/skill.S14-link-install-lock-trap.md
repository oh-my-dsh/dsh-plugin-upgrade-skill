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

# S14 · Link-Install File-Lock Trap — Diagnostic & Recovery Report

Plugin: `@org/dsh-attach-input` (lib-only Web plugin, no build step; shipped files = `lib/client.js` + `lib/index.js`)
Evidence: fixture/{copy-session.txt, profile-introspection.txt, maintainer-thread.md} (read-only, unchanged)
Skill consulted: plugin-upgrade — SKILL.md, references/troubleshooting.md (rows for S12-EBUSY and S14-junction), references/migration-hygiene.md §3, references/pre-flight.md, references/rollup-0.1.2.md (link: recipe), references/v0.1.7-alpha.2.md (card DSH-0.1.7-A2-04), references/v0.1.6-alpha.2.md (card DSH-0.1.6-A2-03). Only key points and card IDs are cited.

---

## 1. What the profile entry actually is — a Junction, not a copy

The introspection (fixture/profile-introspection.txt) is decisive:

- `Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input` → **LinkType: Junction**, **Target: {E:\dev\dsh-attach-input}**
- `Get-Item E:\dev\dsh-attach-input` → LinkType blank, Target {} — the repo is the real directory.
- `cordis.patch.yml` carries the install marker: `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`

**Deployment semantics of a Junction install:** a junction is a directory-level reparse point. The profile path and the repo path are **two names for the same physical directory tree** — same files, same bytes, same locks. There is no "installed copy" to deploy to. Editing `E:\dev\dsh-attach-input\lib\client.js` *is* editing the file the profile loads; the edit is already "deployed" the moment it is saved. This matches the skill's link-install recipe (rollup-0.1.2.md: a `"link:<absolute path>"` dependency + install creates exactly this junction; "junction installs need no sync", v0.1.3-alpha.1 notes).

**Was Copy-Item into node_modules ever the right move for THIS install mode? No — never.** For a link/junction install the source and destination are the same files, so the copy is (a) semantically a no-op — there is nothing to sync; (b) operationally harmful — it manufactures a lock collision (EBUSY) against the host that has the files open, and invites "lock-bypass" tricks that operate on the *unique* source files (see §3). The maintainer's step-4 assumption ("the profile must be running an installed COPY") was false, as the junction proves.

## 2. The two locks and their owners — both belong to the host, none to the browser

**Lock A — stale code after a browser refresh.** Two caching layers, and the decisive one is in the **dsh web host process**, not the browser:

- The host serves the client bundle/combo, and per card **DSH-0.1.7-A2-04** (v0.1.7-alpha.2) **client bundles are cached at host boot** — an install-tree client edit is not re-read from disk until the host restarts. So a plain browser refresh re-requests `client.js`, but the *running host* answers with pre-edit bytes.
- The host half (`lib/index.js`, incl. the new read-only host route) is loaded/registered **once** at apply/boot time by the host process; a running process keeps the old closures. Skill rule (migration-hygiene.md §3): client-half change → browser hard refresh; host-half change → **dsh restart**. This plugin changed both halves, so a refresh alone could never show the full change.
- The browser's own HTTP cache is the secondary layer (why a *hard* refresh is still needed after the host restarts — §4).

**Lock B — EBUSY on the lib files.** The owner is again the **running dsh host process**: it has loaded the plugin's host half (`index.js`) and holds open handles on the plugin's files (troubleshooting.md S12 row: a running `dsh web` host holds host-half / native-module file handles — real case `koffi.node` locked by the host PID — **the file lock is in the host, not the browser**). Windows refuses to *overwrite* a file another process has open → `IOException ... being used by another process` on `client.js`, `index.js`, `package.json`.

**Why closing the browser tab did not release the EBUSY:** the browser never opens those files — it receives bytes over HTTP. The handles are held by the host process, which kept running after the tab closed. Closing a tab removes the *consumer*, not the *lock owner*. Only fully stopping the host releases them.

## 3. Why rename-aside destroyed the SOURCE too — and the exact recovery

**Root cause:** through the junction, `$dst` (…`node_modules\@org\dsh-attach-input\lib`) and `E:\dev\dsh-attach-input\lib` **are the same directory**. `Rename-Item` on the "destination" renamed the one and only physical file — Windows permits *renaming* an open file even while *overwriting* it is EBUSY, which is exactly why the trap was executable. The follow-up copy then failed (`E:\dev\dsh-attach-input\lib\client.js` no longer existed — it had just been renamed to `client.js.old2`), leaving both path listings showing only `client.js.old2` / `index.js.old2` (copy-session.txt lines 12–21). No entry files anywhere; the plugin is broken in the repo *and* the profile simultaneously because there was never an "and".

**Exact recovery from the current broken state** (only `.old2` files exist; contents are the maintainer's NEW edits, intact):

```powershell
# 1. Restore the original names. Rename through the REPO path to keep the mental model straight
#    (either path works — same directory through the junction). Rename works even while the
#    host still holds handles, but do it with the host stopped if it is already down.
$lib = 'E:\dev\dsh-attach-input\lib'
Rename-Item ($lib + '\client.js.old2') 'client.js'
Rename-Item ($lib + '\index.js.old2')  'index.js'

# 2. Verify: both views must now list client.js + index.js (identical listing = same dir), and
#    syntax-check both shipped files (lib-only plugin: node --check is the build-free gate).
Get-ChildItem $lib
Get-ChildItem 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
node --check ($lib + '\client.js')
node --check ($lib + '\index.js')

# 3. Activate (full procedure in §4): stop every dsh process for the profile, restart dsh web,
#    hard-refresh the browser, then verify behavior + the new host route.
```

Never delete the `.old2` files until after the restore is verified; they are the only copies of the new feature code.

## 4. Complete, ordered activation procedure after repo edits (link-installed, lib-only Web plugin)

0. **Edit in the repo only.** Deployment is instant and automatic — the junction makes the repo tree the installed copy. No copy, no install, no sync step exists for this mode.
1. **Static gate:** `node --check lib\client.js` and `node --check lib\index.js` (no build step; this is the whole compile-equivalent for a lib-only bundle).
2. **Fully stop the dsh host process(es)** serving the profile (stop `dsh web` in its terminal; confirm no dsh/node host for that profile survives). Two independent reasons: (a) the host half `index.js` is loaded once at boot — the new read-only host route does not exist in the running process; (b) per **DSH-0.1.7-A2-04** the host caches client bundles at boot, so even `client.js` bytes are not re-read until restart. A browser refresh is NOT a host stop (SKILL.md: "a browser refresh is not a host stop"; this is also why the files were EBUSY-locked).
3. **Restart `dsh web`.** The host now re-reads the junctioned tree: new host route registered, new client bytes cached for serving.
4. **Hard-refresh the browser (Ctrl+F5 / Ctrl+Shift+R).** Needed because the browser's HTTP cache can still serve the *old* `client.js` even against a restarted host — cache bypass forces a real fetch of the new bytes. (Note the asymmetry from troubleshooting.md's plane row: the client bundle is re-fetched per refresh while host-side registrations wait for restart — and after 0.1.7-alpha.2 the served client bytes themselves are host-boot-cached. Host restart + hard refresh covers both layers.)
5. **Verify the new code actually loaded** (per SKILL.md validation layer 4 — prove registration/mount, not a bare HTTP 200):
   - DevTools → Network: the `client.js` response body contains the hover-preview marker (search a distinctive new string); status 200 from the restarted host.
   - UI behavior: hover an image attachment → the preview renders (the core client path).
   - Host half: request the new read-only route (e.g. `Invoke-RestMethod` against it) → 200 with the expected payload; a pre-edit-only route shape returning 404 would prove the host is still running old code (stale-host signature).
   - Boot graph/console: no activation errors for `@org/dsh-attach-input`; the plugin's registration id appears.

## 5. Pre-flight check — determine the install mode BEFORE touching any file

Run this before any copy/rename/upgrade advice (pre-flight.md: record "the actual install track: registry package, Git checkout, workspace/junction, or copied install"):

```powershell
Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
  Select-Object FullName, LinkType, Target
# Junction/Symlink + Target -> LINK install: repo tree IS the installed copy; never copy into it.
# blank LinkType with real content  -> copied/registry install: deployment = update the copy.
Select-String -Path 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' -Pattern 'dsh-attach-input'
# '# link:E:\dev\dsh-attach-input (installed 2026-08-30)' — the profile's own install marker.
# Also check profiles/<name>/package.json for a "link:<abs path>" dependency (rollup-0.1.2.md recipe).
```

Interpretation: **LinkType/Target set → link install → "deploy" = edit the repo, then host restart + hard refresh; there is nothing to copy.** Card DSH-0.1.6-A2-03 adds a management consequence: link-installed plugins stay outside the Plugin Manager's bundle management — this legacy shape (repo junction + manual `cordis.patch.yml` row) is precisely that case.

**Why the generic "copy into node_modules" advice is actively harmful here:** it assumes the profile entry is an independent copy. Applied to a junction it is (1) redundant — source and destination are the same bytes, so there is nothing to deploy; (2) collision-prone — it tries to overwrite files the running host holds open, producing the EBUSY that invites escalation; (3) destructive when "fixed" — rename-aside through a junction renames the unique source file, wiping the entry files from repo and profile in one move (the exact accident in copy-session.txt). The advice didn't just fail to help; it converted a zero-risk repo edit into a data-loss incident. Install-mode pre-flight first, plane-aware activation second (client → hard refresh; host → restart), never file surgery on a linked tree.

---

### Card / evidence index (IDs only)

- fixture/profile-introspection.txt — Junction + Target {E:\dev\dsh-attach-input}; cordis.patch.yml `link:` marker (2026-08-30)
- fixture/copy-session.txt — EBUSY sequence; rename-aside; both listings reduced to `.old2`
- fixture/maintainer-thread.md — change inventory (client hover-preview + new read-only host route)
- troubleshooting.md — S12 row (host owns file locks; browser tab irrelevant) · S14 row (junction semantics + recovery order)
- migration-hygiene.md §3 — client half → hard refresh; host half → dsh restart
- DSH-0.1.7-A2-04 — client bundles cached at host boot; pages reconnect after server restart
- DSH-0.1.6-A2-03 — link-installed plugins stay outside Plugin Manager bundle management
- rollup-0.1.2.md — `link:` dependency recipe + junction verification
- pre-flight.md — record the actual install track before acting
- SKILL.md — "a browser refresh is not a host stop"; validation layer 4 (prove registration/mount, not bare 200)


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.