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

# S14 · Link-Install File-Lock Trap — diagnosis and recovery

**Subject**: `@org/dsh-attach-input` v0.2.11 verification (lib-only Web plugin, no build step)
**Evidence**: read-only fixture pack `fixture/` — `profile-introspection.txt`, `copy-session.txt`, `maintainer-thread.md`
**Scope**: analysis and procedure only. Nothing in this report was executed against the affected machine; the fixture was read, not modified.

---

## 0 · Symptom → root cause, at a glance

| Observed | Root cause | Plane |
|---|---|---|
| Browser refresh shows old behavior after editing `lib/client.js` | The running `dsh web` host process serves the client bundle; a refresh is only a re-request, and the old module is still in the page/HTTP cache (and, on 0.1.7-alpha.2+, the host caches bundles at boot). The client half changed but the process and the page did not. | Host + browser |
| The new host route behind the preview returns 404 | The host half (`lib/index.js`) is applied once at boot; routes/services/tools register with closures over the old module instance. A refresh cannot re-apply the host half. | Host |
| `Copy-Item` → `EBUSY` "being used by another process", still after closing the tab | The host process holds the file handles for the loaded `lib/*.js`. The destination path is the *same physical file* through the junction, so the copy opens a live host-held file. | Host |
| Rename-aside → BOTH trees show only `client.js.old2` / `index.js.old2`, then "source does not exist" | Renaming through a Junction renames the single underlying directory entry. There were never two copies. | Filesystem identity |
| The plugin now has no entry files at all | Consequence of the above, not a second fault. | Recovery (§3) |

---

## 1 · What the profile entry actually is

### The introspection

`profile-introspection.txt:1-5` — the profile entry:

    FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
    LinkType : Junction
    Target   : {E:\dev\dsh-attach-input}

`profile-introspection.txt:7-11` — the repository directory itself:

    FullName : E:\dev\dsh-attach-input
    LinkType :
    Target   : {}

The empty `LinkType`/`Target` on the repo path proves the repo is an ordinary directory, not a link; the profile entry is a **reparse point (Junction)** whose only content is "resolve to `E:\dev\dsh-attach-input`". Two paths, one directory, one set of file records.

`profile-introspection.txt:13-14` — the install marker in the profile composition:

    - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)

So the profile is a **legacy link install**: a hand-inserted `cordis.patch.yml` row plus a `link:` dependency materialized as a junction by the profile's package manager (install track R-09: put `"<name>": "link:<abs path>"` into the profile `package.json` dependencies and let `pnpm install` create the junction). Note the second-order consequence: plugins installed this way are **outside** Plugin Manager bundle management (card DSH-0.1.6-A2-03) — there is no Plugins-page row that "deploys" them, and the only supported on/off switch is a `disabled` override on the `cordis.patch.yml` row, applied at HMR/restart.

### What a Junction install means for deployment

- **There is no deploy step.** The repo tree *is* the installed copy. When the maintainer saved `lib/client.js` and `lib/index.js`, the installed package changed at that instant — byte for byte, with no sync, no copy, no reinstall. The package on disk was already correct before any of the failed commands ran.
- The only thing that was ever stale was the **running processes**: the host's in-memory module instances and the browser page's already-executed JS. Activation is a *process* problem, not a *file* problem.
- Package-level operations that do exist for a link install: create the junction (`pnpm install` in the profile), remove it (drop the `link:` dependency and reinstall), and toggle the `cordis.patch.yml` row. None of them is "put the files there".
- Diagnosis corollary: any "did my code get deployed?" probe must read the **served bytes** or the **running process's behavior**, never the presence/content of files at the profile path — those two paths show identical bytes by construction.

### Was copying repo files into the profile's `node_modules` ever the right move?

**No — not for this install mode, at any point, under any locking condition.**

1. It is a **category error**: it applies copied-install semantics (the profile holds an independent snapshot that must be refreshed) to a link install (the profile holds a pointer to the one snapshot). The premise in `maintainer-thread.md:10-12` — "the profile must be running an installed COPY" — is exactly the false premise the introspection refutes.
2. It is **at best a no-op**: source and destination resolve to the same file record, so a successful copy would read and write the same bytes.
3. It is **at worst destructive**: while the host runs it cannot complete (EBUSY), which is what pushed the operator into the rename-aside escalation — and that escalation wrote to the *only* copy (§3).
4. The correct "deploy" vocabulary for a link install is exactly three verbs: **save, stop the host, restart the host** — then hard-refresh the browser. For a *copied/registry* install the correct verb is **reinstall through the package manager the profile lockfile names** (a version change), never a hand copy.

---

## 2 · The two locks and their owners

There are two distinct "it didn't update" mechanisms here, and they have different owners. Neither owner is the browser tab.

### Lock A — stale code: the host serves the bundle, the page executes it

- The **client bundle is served by the running `dsh web` host process** over HTTP; the browser is a pure consumer. The JS implementing the hover preview was parsed and executed in the page at load time; a refresh re-requests the route but cannot retroactively change a module instance the host still holds.
- On 0.1.7-alpha.2 and later the asymmetry is worse: client plugin bundles are **read and cached at host boot**, so an install-tree `lib/client.js` edit no longer takes effect on a page refresh at all — only a host restart serves the new bytes (card DSH-0.1.7-A2-04, first-hand 2026-09-23). That card also warns that the page now auto-reconnects across a server restart, so an open page can *keep working* while still running pre-restart bytes — "the page responds" is not evidence.
- Independently, a plain refresh may replay the composed bundle from the browser's HTTP cache. Hence the hard refresh (cache bypass) requirement in §4.
- The host half (`lib/index.js`) is a separate, stricter plane: routes/services/tools register **once at apply time**, and their handlers close over the module instance loaded then. A new read-only host route added by this edit therefore cannot exist in a process that booted before the edit — it 404s while the disk file plainly contains it. That is the classic asymmetric-plane probe (old route 200, new route 404, disk artifact contains the new code ⇒ the running process predates the change; troubleshooting row 16). `migration-hygiene.md` §3 states the rule directly: `lib/client.js` → browser hard refresh, `lib/index.js` → restart dsh. **This edit touched both halves** (hover preview + a new host route), so a browser-only action was guaranteed to fail on both counts — precisely what the user saw.

### Lock B — EBUSY: the owner is the host PID, and the destination is the same file

- Windows refuses the write because the **running `dsh web` host process holds open handles on the loaded `lib/*.js`** (module loader, source/asset readers). The recorded real-world analogue for this class is a native module (`koffi.node`) locked by the host PID (troubleshooting row 19). The lock is host-side.
- **Closing the browser tab cannot release it**, for two independent reasons: (a) the browser never held a file handle — it received bytes over HTTP, and the handles live in the host process; (b) the failing operation is a write to a path that resolves *through the junction* to the file the host has open, i.e. the EBUSY is a self-collision between the host and the maintainer's own copy command, not contention with a viewer.
- The EBUSY was therefore **correct and informative**: the filesystem was saying "source and destination are the same file". It was read as "something else is using the profile copy", and the attempted remedy escalated against the wrong owner.
- Stop semantics: "fully stop" means every `dsh` process serving that profile, not just the foreground window — the boot tree can carry child processes (runtime/addon helpers) that also hold handles. A browser refresh or tab close is not a host stop; only process termination is. Confirm with the port owner and the process list before touching files (§4 step 2).

---

## 3 · Why rename-aside destroyed the source, and the exact recovery

### Why both trees lost their files

`Rename-Item ($dst + '\client.js') 'client.js.old2'` (`copy-session.txt:12-13`) does **not** rename a link or a "profile copy". Path resolution walks `...\node_modules\@org\dsh-attach-input` → junction → `E:\dev\dsh-attach-input`, then renames the **single underlying directory entry** `lib\client.js` to `lib\client.js.old2`. There was one file; it now has a new name, visible identically from both paths (`copy-session.txt:16-22`). The subsequent `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js'` correctly reported "does not exist" (`copy-session.txt:14-15`) — the source was the file that had just been moved.

Two details explain why the trap is easy to fall into:

- Windows **permits renaming an open file** in many cases (a rename does not need the delete-share that the copy's overwrite needed). So the trick "worked" where the copy failed, which read as progress; the damage surface merely moved from a loud lock error to a silent shape change.
- The listing showing only `.old2` files in *both* directories was not "two damaged copies". It was **one file, seen twice** — the definitive proof of the junction identity, available only after the accident.

### Exact recovery from the current broken state

Current state: `lib\` contains only `client.js.old2` and `index.js.old2`; `package.json` and the junction itself are untouched; the host may still be running with the old modules.

**Order matters: stop the host before any file operation.**

1. **Stop every host process for this profile** (files under a live host are still locked, and its loader may race a missing entry):
   - find the listener owner: `Get-NetTCPConnection -LocalPort 3080 -State Listen | Select-Object LocalPort, OwningProcess` (substitute the actual port);
   - enumerate candidates: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dsh|attach-input' } | Select-Object ProcessId, CommandLine`;
   - stop them (`Stop-Process -Id <pid>`, or the documented launcher stop), then re-run both probes and confirm **nothing** remains. Do not proceed on a partial stop.
2. **Restore the original names, through the repo path** (the canonical location; the profile path would perform the same rename, but the repo path keeps the reasoning honest):
   - `Rename-Item -Path 'E:\dev\dsh-attach-input\lib\client.js.old2' -NewName 'client.js'`
   - `Rename-Item -Path 'E:\dev\dsh-attach-input\lib\index.js.old2' -NewName 'index.js'`
   - Rename only — no `Copy-Item`, no `Move-Item` across trees, no new files. Nothing else is missing: `package.json` was never renamed and no other file in `lib\` was touched.
3. **Prove identity is restored and the link is intact** (read-only):
   - `Get-ChildItem 'E:\dev\dsh-attach-input\lib' | Select Name, Length, LastWriteTimeUtc` and the same for `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib` — both must list exactly `client.js` and `index.js` with identical `Length`/`LastWriteTimeUtc`;
   - `Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' | Select LinkType, Target` must still print `Junction` / `{E:\dev\dsh-attach-input}`. If an editor or a delete/recreate cycle replaced the reparse point with a real directory, re-establish the link the supported way: keep `"@org/dsh-attach-input": "link:E:\\dev\\dsh-attach-input"` in the profile `package.json` and run the profile's package manager (`pnpm install`) — never hand-create the junction.
4. **Verify syntax without executing plugin code** (lib-only bundle: no build, no test runner needed):
   - `node --check 'E:\dev\dsh-attach-input\lib\client.js'` and `node --check 'E:\dev\dsh-attach-input\lib\index.js'` — silent + exit 0 means parse-clean; any `SyntaxError` names the file:line to fix before activation.
   - Classic-script sanity for the client half (a Web client bundle registered via `window.__ModuleLoader__.load({ id, factory })` must not contain bare ESM, which fails the whole combo): `Select-String -Path 'E:\dev\dsh-attach-input\lib\client.js' -Pattern '^\s*(import|export)\s'` should return nothing.
   - Registration identity: the bundle's `load({ id: ... })` id must equal the bare package name `@org/dsh-attach-input`, or boot fails with `loaded without registering "<id>"`.
5. **Activate** (§4 steps 3–5): start `dsh web` for the profile, read the boot log for this row (activated, no pending required service, no `N entries did not activate`, no `duplicate loader entry id`), then hard-refresh the browser and confirm the served client bytes plus the new host route.
6. **Do not** "restore" by re-copying from anywhere — there is no second copy, and any file written now would be a new authoring session, not a recovery. The `.old2` names must be gone from both paths when step 3 passes; a lingering `.old2` file is confusing residue, and its presence means the rename-back hit the wrong path.

---

## 4 · Complete ordered activation procedure (link-installed, lib-only Web plugin)

Precondition: §5 pre-flight has classified the install as a link/junction install whose entry files are `lib/client.js` (client half) and `lib/index.js` (host half).

**0 · Classify and record.** Install mode = Junction (so: no deploy step). What changed = which halves. Record the current served artifact / version constant as the "before" value so step 5 has an oracle.

**1 · Save in the repo.** No copy, no sync, no reinstall. (Had the install mode been *copied*, this step would instead be a version bump + package-manager reinstall in the profile — the file operation is determined by the install mode, never by habit.)

**2 · Fully stop the host.**
- Terminate every `dsh` process serving the profile (parent and children); confirm via the port owner and an empty process query (§3 step 1).
- Why: the host half is bound once at apply time, the client bundle may be cached at boot (0.1.7-alpha.2+), and the loaded files are held open (EBUSY). A browser refresh, a tab close, or a page reload is not a host stop. Do not skip this on the belief that "the client half only needs a refresh" — that is true only for a pure client-half edit, and not even that from 0.1.7-alpha.2 onward.

**3 · Restart the host against the same profile.** `dsh web` (fixed alias for the `web` profile) for the production instance; for verification prefer a separate staging instance on another port (`dsh --profile web --port 30xx`) so the running UI is not disturbed. Wait for the listening line, then read the boot log: the plugin row must activate with no pending required service and no entry-count warning. A boot that lists the row but leaves it inactive is a composition problem, not a cache problem.

**4 · Browser: hard refresh (cache bypass), once, after the restart.**
- `Ctrl+F5` / `Ctrl+Shift+R` (or DevTools → Network → *Disable cache* → reload). A soft reload may replay the composed bundle from the HTTP cache; and because 0.1.7+ pages auto-reconnect across a server restart, an open tab can keep running pre-restart bytes without ever re-executing the bundle. The hard refresh is what forces a fresh fetch of the HTML + client-bundle combo from the *new* host process.
- Order is non-negotiable: **stop → start → hard refresh**. Refreshing before the restart re-fetches the same old bundle and manufactures a false "still broken" result; refreshing without a restart is exactly the mistake in `maintainer-thread.md:8-9`.

**5 · Verify the new code actually loaded — not merely that the page renders.**

| Layer | Probe | Pass condition |
|---|---|---|
| Served client bytes | Fetch the client bundle/combo URL the page requests (with a cache-buster) and search for a string that exists only in the edited `client.js` (feature marker or a version constant bumped for the occasion) | Marker present; absent ⇒ the restart did not take, or the wrong profile/port |
| Host half | Call the new read-only route with the arguments the UI would use | Expected status/body; a 404 while the disk file contains the route ⇒ the running process predates the edit |
| Registration | Browser console + module-loader roster | Plugin id present, no `Failed to load plugins`, no slot / `__ModuleLoader__` error |
| Behavior | Hover an image attachment once | Preview appears and one request hits the new route |
| Negative control (cheap, definitive) | Bump a version constant in `client.js` before restarting; re-read the served bundle | New constant served. Separates "my bytes did not ship" from "my feature logic is wrong" in one step |

**6 · Rollback.** The repo remains the single source of truth: restore the previous bytes in the repo (`git checkout -- lib/` *in the repo*, never through the profile path), then repeat 2–5. Never roll back by writing into the profile path — that is the same junction write that started the incident.

---

## 5 · The pre-flight check that must precede touching any file

### Determine the install mode (read-only, ~30 seconds)

1. **Reparse point on the profile entry** — the primary fact:
   `Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' | Select-Object FullName, LinkType, Target`
   - `LinkType: Junction` (or `SymbolicLink`) + a `Target` outside the profile ⇒ **link install**;
   - empty `LinkType`/`Target` ⇒ a real directory inside the profile ⇒ **copied/registry install** (then use the profile `package.json`/lockfile to separate registry from hand-copied).
   - Cross-check the target: `Get-Item 'E:\dev\dsh-attach-input' | Select LinkType, Target` empty ⇒ the target is the plain source tree (reproduced in `profile-introspection.txt:7-11`). Independent probes if wanted: `dir /AL` on the parent, `fsutil reparsepoint query <path>`.
2. **Same-file proof** — what makes "deploy" meaningless: compare `Length`/`LastWriteTimeUtc` of both paths, or run `fsutil file queryfileid` on both; an identical file id means one physical file.
3. **Profile composition / install marker** — the authoritative install-track record:
   - `Select-String -Path 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' -Pattern dsh-attach-input` → the row plus its `# link:<abs path> (installed <date>)` marker (as in `profile-introspection.txt:14`);
   - `@org/dsh-attach-input` in the profile `package.json` dependencies with a `link:` specifier, and the matching `link:` entry in the profile lockfile (install track R-09). A registry `version` specifier instead means copied/registry.
4. **What will lock the files** — enumerate the owning processes before planning any write: the listener on the Web port plus `dsh`/node processes whose command line names the profile (troubleshooting row 19). This turns "EBUSY later" into "known owner now".
5. **Do not use the Plugins page as an oracle.** Link-installed plugins are not managed as bundles (DSH-0.1.6-A2-03): absence from that page does not mean "not installed/deployed", and its toggles do not apply to them.

### Why the generic "copy into `node_modules`" advice is actively harmful here

- **Wrong model, not merely wasted effort.** It encodes "the profile holds a snapshot that must be refreshed". Under a junction there is one snapshot and the profile is a pointer to it. The advice is confidently wrong, so it sends the operator to fix a non-problem while the real one (a running host + a cached page) stays untouched.
- **It cannot succeed while the host runs, so it teaches escalation.** The destination resolves to the same open file ⇒ EBUSY ⇒ the operator closes the browser (no effect), retries (same error), then reaches for rename-aside / force / unlocker tricks. Every one of those is a **destructive write against the only copy** — exactly the chain in `copy-session.txt`.
- **The escalation has a silent failure shape.** Rename succeeds where copy failed, so it looks like progress; the damage (missing entry files, dead plugin) surfaces only at the next start. On a copied install the same trick leaves one stale copy behind; on a link install it removes the source from both paths at once.
- **It corrupts the diagnosis.** Believing "the profile runs an installed copy" explains away the real evidence and makes a host restart look unnecessary; the maintainer then tells the user "restart and hard-refresh" while personally verifying nothing (the user refreshed only, so nothing could change).
- **It risks the single source.** A partially completed or interrupted write through the junction (truncate-then-write on the one file the host is reading) is a data-loss path with no backup — the repo is not a second copy, it *is* the copy.

**Correct advice, by install mode:**

| Install mode | How to make an edit live |
|---|---|
| Link / junction (this case) | Save in the repo → fully stop the host → restart the host → **hard refresh** the browser → verify served bytes + the new host route. No copy, ever. |
| Copied / registry | Bump the plugin version and reinstall through the package manager the profile lockfile names (`pnpm` in the profile), then restart + hard refresh. Never hand-copy into `node_modules`. |

---

## 6 · Answers to the maintainer's five questions (short form)

1. **Refresh showed nothing / files "in use" with no tab open** — the host process serves the client bundle and holds the files open; the page re-executes only what it fetches, and (0.1.7+) the host caches bundles at boot. The tab was never the lock owner.
2. **What Junction+Target means / was the copy ever necessary** — the profile entry is a reparse point to `E:\dev\dsh-attach-input`; repo tree = installed tree, so the edits were already "deployed". The copy was never necessary, never correct, and could not succeed while the host ran.
3. **Why rename-aside killed the source / recovery** — one directory entry, renamed once, visible from both paths. Recovery: stop the host, rename `.old2` back (repo path), `node --check` both entry files, confirm the junction still reports `Junction` / `E:\dev\dsh-attach-input`, restart, hard refresh, verify served bytes.
4. **Correct activation order and why a hard refresh** — stop all host processes → restart `dsh web` (host half + the boot-time bundle cache) → hard refresh (bypass the browser's replay of the old bundle) → verify the served bundle contains the new marker and that the new host route answers. A soft refresh or a tab close is not a stop.
5. **Pre-flight** — `Get-Item` `LinkType`/`Target` on the profile entry, plus the `link:` marker in `cordis.patch.yml` and the profile `package.json`/lockfile. That single question ("pointer or copy?") decides whether the fix is a process action or a package action — and "copy into `node_modules`" is the one action that is wrong in the first case and dangerous in the second.

---

## 7 · What was and was not done here

- **Done**: read-only inspection of the four fixture files; classification of the install mode from the cited introspection; reconstruction of the failure chain; recovery and activation procedures; pre-flight checklist.
- **Not done** (out of scope by the brief): no command was executed against the affected machine; no migration, install, package-manager, git, or network operation was run; the fixture directory was not modified.
- **Residual risk if the procedure is followed**: if the reparse point was replaced by a real directory during the incident (an editor or a delete/recreate can do this), the rename-back restores the files but the profile would then be serving a *copy*, and the next repo edit would silently not deploy — §3 step 3 exists to catch exactly that. If the `.old2` files are later deleted, the bytes are gone from both paths and recovery becomes re-authoring from editor history.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.