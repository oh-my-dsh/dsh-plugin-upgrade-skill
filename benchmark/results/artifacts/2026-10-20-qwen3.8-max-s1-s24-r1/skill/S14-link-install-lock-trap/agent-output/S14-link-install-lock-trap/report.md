# S14 · Link-Install File-Lock Trap — Read-Only Diagnostic Report

**Plugin**: `@org/dsh-attach-input` v0.2.11 (lib-only Web plugin, no build step; shipped files `lib/client.js` + `lib/index.js`)
**Repo**: `E:\dev\dsh-attach-input` · **Profile**: `C:\Users\me\.dsh\profiles\web`
**Mode**: plugin-upgrade Mode A (read-only inspect/diagnose). Evidence: fixture `copy-session.txt`, `profile-introspection.txt`, `maintainer-thread.md` (all read-only; fixture left byte-for-byte unchanged). No migration, installation, or file modification was executed for this report; every command below is a *recommendation* for the maintainer's machine, not something run here.

---

## 0. Incident timeline (reconstructed from the evidence pack)

1. Maintainer edits `lib/client.js` / `lib/index.js` **in the repo** (hover-preview feature + a new read-only host route). Because the profile entry is a junction to the repo (Section 1), these edits were **already on the profile's disk the instant they were saved** — no deploy step existed or was needed.
2. User refreshes the browser tab only → old behavior. Root cause: the **running dsh host** serves a boot-time-cached client bundle and registered the host half at apply time; a refresh cannot pick up either (Section 2, Lock A).
3. Maintainer misdiagnoses this as "the profile must run an installed COPY" and runs `Copy-Item E:\dev\dsh-attach-input\lib\*.js → <profile>\node_modules\@org\dsh-attach-input\lib\ -Force` → **EBUSY** ("being used by another process") on `client.js` (and on retry also `index.js`, `package.json`). Root cause: the running host process holds the file handles; note also this "copy" is a **self-copy** — source and destination are the same physical files through the junction (Sections 1–2, Lock B).
4. Maintainer closes the browser tab, waits, retries → same EBUSY. Of course: the browser never held any filesystem handle (Section 2).
5. Rename-aside trick: `Rename-Item client.js → client.js.old2`, `Rename-Item index.js → index.js.old2` (both against the **profile** path), then copy from the repo path fails with **"Cannot find path E:\dev\dsh-attach-input\lib\client.js — it does not exist"**. Both listings now show only the two `.old2` files. Root cause: the rename went *through* the junction and renamed the one and only physical file; the "source" and the "destination" are the same directory (Section 3).
6. Current broken state: the plugin has **no entry files at all** under either path name; the only surviving copies of the code (including the new hover-preview edits) are `client.js.old2` and `index.js.old2`. Recovery in Section 3.3.

---

## 1. What the profile entry actually is — and what that means for "deployment" (Q1)

### 1.1 The introspection evidence

`fixture/profile-introspection.txt`:

```
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target
  LinkType : Junction
  Target   : {E:\dev\dsh-attach-input}

Get-Item E:\dev\dsh-attach-input | Select FullName, LinkType, Target
  LinkType :            (empty)
  Target   : {}          (empty)
```

and the profile composition marker:

```
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

Read together: the profile's `node_modules\@org\dsh-attach-input` entry is **not a directory of files** — it is an NTFS **junction** (a reparse point) whose target is the repo `E:\dev\dsh-attach-input`. The repo directory itself has empty `LinkType`/`Target`: it is the real, physical directory. The `cordis.patch.yml` row carries the explicit `link:…(installed 2026-08-30)` install marker, i.e. this plugin was installed via the `link:` local install track (skill reference: rollup-0.1.2 **R-09** — writing `"<pkg>": "link:<abs path>"` into the profile and installing creates exactly this junction; the 0.1.3-alpha.1 card's verification note likewise records "junction installs need no sync").

### 1.2 What a junction install means for deployment

Every filesystem access to `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\…` is redirected by the reparse point to `E:\dev\dsh-attach-input\…`. There is **one physical directory, two path names**. Consequences:

- **The repo tree IS the installed copy.** Saving an edit in the repo *is* the deployment; there is no copy/sync/publish step between "edited" and "present in the profile's node_modules". Disk state was already current at the end of maintainer-thread step 1.
- **"Deploying" reduces entirely to *activation***: making the running processes pick up the bytes that are already on disk — i.e. restart the dsh host (it caches client bundles at boot and registers host-half routes at apply time) and bypass the browser cache (Section 4).
- Any file operation performed "on the profile copy" is performed **on the repo** (and vice versa) — this is what turned the rename-aside trick into a source-destroying accident (Section 3).

### 1.3 Was the Copy-Item into node_modules ever the right move? **No — never, for this install mode.**

- It is a **self-copy**: `Copy-Item E:\dev\dsh-attach-input\lib\*.js → <junction>\lib\` resolves to copying each file onto itself. Best case it is a redundant no-op/error; worst case (had the host *not* held the files open) a `-Force` self-copy can truncate a file to zero bytes before failing — **destroying the only copy in existence**, since a link install has no second copy. The EBUSY was, ironically, the only thing protecting the data at that moment.
- It attacks a problem that does not exist (files "not deployed") while ignoring the real one (a running host serving cached/stale content).
- Copy-into-node_modules is legitimate advice **only for a copied (registry/tarball) install**, where profile and repo genuinely are two distinct trees. Applying it to a link install is actively harmful — see Section 5.3.

---

## 2. The two locks and their owners (Q2)

Both symptoms come from **one and the same process — the running dsh web host (its Node process)** — manifesting on two different planes. The browser owns *neither* lock.

### Lock A — the "stale code" lock: boot-time bundle cache + apply-time route registration (host, in memory)

- **Which process serves the client bundle?** The **dsh host's web server** serves `lib/client.js` (typically inside the client combo bundle) over HTTP; the browser merely downloads whatever the host serves.
- Per skill card **DSH-0.1.7-A2-04**: client plugin bundles are **read and cached when the host boots**; editing a served `lib/client.js` on disk no longer takes effect on page refresh alone — only a **host restart** serves the new bytes. The same card warns that after a server restart open pages **auto-reconnect** and may keep running pre-restart client bytes, so "the page responds" is not evidence of new code.
- The host half (`lib/index.js`, incl. the new read-only route) is registered when the plugin is applied at boot; a running process keeps the old closure (skill troubleshooting row 16: the client face may re-fetch per refresh, but host routes only change on **host restart**).
- So the refresh showed nothing new because the **host** was still serving its boot-time-cached bundle and its boot-time-registered routes — even though the on-disk bytes (via the junction) were already the new ones. This is a memory/registration lock, not a filesystem lock: no refresh, hard or otherwise, can clear it.

### Lock B — the EBUSY filesystem lock: open handles held by the host process

- The Windows "being used by another process" IOException on `client.js`/`index.js` is a **file-handle lock held by the running dsh host PID**, which loaded the plugin's host half and read/served the lib files (skill troubleshooting row 19, first-hand S12 case: loaded host-half/native module files locked by the host PID; SKILL.md's host-upgrade discipline says the same: "a running host holds native-module file locks → EBUSY; a browser refresh is not a host stop").
- **Why closing the browser tab did not release it:** the browser is an HTTP client — it holds sockets, **never filesystem handles** on the server's disk. The lock owner was the host process from start to finish; closing the tab changed nothing about the host's open handles, hence the identical retry failure. The correct lock-release action is **fully stopping the dsh host process(es)**, not any browser action.
- Corollary the maintainer missed: once the host is stopped, no rename-aside "trick" would have been needed at all — and for a junction install even a successful copy would have been pointless (Section 1.3).

---

## 3. Why rename-aside destroyed the SOURCE directory, and the exact recovery (Q3)

### 3.1 Mechanism: both paths are the same directory

`Rename-Item ($dst + '\client.js') 'client.js.old2'` was executed against the **profile** path `…\profiles\web\node_modules\@org\dsh-attach-input\lib` — but that path *is* `E:\dev\dsh-attach-input\lib` through the junction (§1.2). The rename therefore moved the **one physical file** that both views share. Immediately afterwards:

- `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' …` failed with "source does not exist" — the source (repo view) had just lost `client.js` to the very rename performed "on the profile copy". There was never a second file to copy from.
- `Get-ChildItem` on the repo lib and on the profile lib print the **same directory's** contents twice: only `client.js.old2` and `index.js.old2`.

Why did the rename succeed where the copy failed? On Windows a rename is a same-volume directory-metadata operation, permitted on files whose open handles allow share-delete (as Node/libuv handles typically do), while `Copy-Item -Force` must open the destination for writing/truncation, which collides with the host's handles → EBUSY. So the "lock bypass" worked precisely because it bypassed the safety net — and, through the junction, it bypassed it **on the source tree**. (In a copied install the rename-aside trick renames only the installed copy and the repo stays intact; in a link install there is no "only the copy" — that asymmetry is the trap.)

**Crucially:** the `.old2` files are the **new, feature-edited** versions (the maintainer edited in place in step 1, and the rename happened afterwards). They are the only surviving copies of the code and must not be deleted.

### 3.2 What NOT to do

- Do not delete the `.old2` files; do not re-run any copy/rename "recovery" against the profile path while the host runs; do not try to `npm/pnpm install` over the junction as a shortcut (it may replace the junction with a real directory and silently fork profile from repo).

### 3.3 Exact recovery from the current broken state (ordered)

Work on the **repo path** (canonical; the profile path is the same directory anyway):

1. **Fully stop the dsh host** — terminate the `dsh web` process for this profile and verify it is gone (console exited; port no longer listening; e.g. `Get-Process -Name node` shows no host PID holding the profile). No browser action substitutes for this.
2. **Restore the original names**:
   ```powershell
   Rename-Item 'E:\dev\dsh-attach-input\lib\client.js.old2' 'client.js'
   Rename-Item 'E:\dev\dsh-attach-input\lib\index.js.old2'  'index.js'
   ```
3. **Verify the directory is whole**: `Get-ChildItem E:\dev\dsh-attach-input\lib` shows `client.js` and `index.js` (no leftover `.old2`); confirm `package.json` is intact at the repo root (it survived — every copy attempt on it hit EBUSY) and that its `main`/`exports` and the manifest's client entry still point at these two files. Via the profile path, confirm the junction itself is still a junction (`Get-Item … | Select LinkType,Target` → `Junction`, `{E:\dev\dsh-attach-input}`).
4. **Verify syntax before activating** (a broken entry would now fail at host boot):
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\index.js
   node --check E:\dev\dsh-attach-input\lib\client.js
   ```
   (If either file is ESM and `node --check` complains about `import`/`export` syntax, re-check with `Get-Content <file> -Raw | node --input-type=module --check -`.) Additionally grep both files for the hover-preview feature marker to confirm the restored bytes are the **new** edits, not stale content; if the repo is a git checkout, `git status`/`git diff` on `lib/` provides the same confirmation against the intended change.
5. **Activate** per the full ordered procedure in Section 4 (restart host → hard-refresh browser → verify loaded code).
6. Only after verification passes, treat the incident as closed. If anything in step 4 fails, the repo's git history is the fallback baseline for `lib/` — but nothing in the evidence suggests the `.old2` content is damaged; it was never written to, only renamed.

Post-state check: both path views again list exactly `client.js` + `index.js`, the plugin loads at host boot with nothing pending, and the hover preview works.

---

## 4. Complete ordered activation procedure for a link-installed lib-only Web plugin after repo edits (Q4)

Principle: **disk deploy is automatic (junction); activation = process restarts + cache bypass, in this order.**

1. **Edit & save in the repo** (`E:\dev\dsh-attach-input\lib\…`). This *is* the deployment. Do not copy anything anywhere. Optionally run `node --check` on both files now — cheap, and it happens before any downtime.
2. **Fully stop the dsh host** — every dsh process serving this profile (Ctrl+C in the host console; verify the PID/port is gone). Reasons this step is non-negotiable: it is the only thing that (a) releases the file handles behind Lock B, (b) discards the **boot-time client-bundle cache** (DSH-0.1.7-A2-04), and (c) tears down the apply-time host-route registration so the new `index.js` half (the new read-only route) can register. **A browser refresh — hard or not — is not a host stop; closing tabs is not a host stop.**
3. **Start the host**: `dsh web` (with the profile). At boot it re-reads the lib files through the junction: the client bundle is re-cached with the new bytes and the host half re-registers the new route.
4. **Hard-refresh the browser (cache bypass)**: Ctrl+F5 / Ctrl+Shift+R, or DevTools → Network → "Disable cache" (keep DevTools open) / "Empty Cache and Hard Reload". Why a plain refresh is not enough for `client.js`: it is a static script asset that the **browser's HTTP cache** (disk/memory cache) can serve stale without revalidation; and since 0.1.7-alpha.2 an already-open page **auto-reconnects** across the host restart and happily keeps executing the pre-restart client bytes it already loaded (DSH-0.1.7-A2-04) — reconnectivity is not freshness.
5. **Verify the new code actually loaded** — prove bytes and behavior, never accept a bare HTTP 200 or "the page works":
   - **Served-content check**: fetch the advertised client artifact (combo/bundle URL from the host boot manifest) out-of-band (e.g. `Invoke-WebRequest` with the session cookie) and grep it for the hover-preview marker / new version constant — this verifies what the *host* now serves, independent of the browser.
   - **Browser check**: DevTools → Network shows the bundle/client.js fetched from network (size column is a real byte count, **not "(disk cache)/(memory cache)"**) after the hard refresh; Sources shows the new code.
   - **Registration/behavior check**: the hover preview appears on image attachments; the new read-only host route responds correctly; the plugin entry is active with no pending required services in the boot graph.
6. Order matters end-to-end: **repo edit → host stop → host start → browser hard refresh → verify**. Any browser-side action before the host restart is wasted; a host restart without the cache-bypass refresh can still show stale `client.js`.

(Note: if the profile is ever migrated to Plugin-Manager-managed bundle installs, a link-installed plugin stays **outside** that management — first-hand evidence in card **DSH-0.1.6-A2-03**: link installs keep loading via their hand-written `cordis.patch.yml` rows but are not managed as bundles; toggling/activation for them remains "edit the patch row + HMR reload or host restart". This does not change the procedure above.)

---

## 5. Pre-flight check before touching any file (Q5)

### 5.1 How to determine the install mode from the profile

Run these **read-only** probes first (skill pre-flight: record "the actual install track: registry package, Git checkout, workspace/junction, or copied install" before any write):

1. **LinkType/Target of the profile entry** (the decisive probe — `profile-introspection.txt` shows exactly this):
   ```powershell
   Get-Item <profile>\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target
   ```
   - `LinkType: Junction` (or `SymbolicLink`) + `Target: {<repo path>}` ⇒ **link install**: profile entry and repo are one physical tree.
   - `LinkType` empty ⇒ a real directory ⇒ **copied install**: profile and repo are independent trees (only there does copy-based deployment make sense).
   - Cross-checks: `cmd /c dir <profile>\node_modules\@org` prints the `<JUNCTION>` tag; `fsutil reparsepoint query <path>` dumps the reparse data.
2. **cordis.patch.yml install marker**: `Select-String` the profile's `cordis.patch.yml` for the package row — here it literally records `# link:E:\dev\dsh-attach-input (installed 2026-08-30)`.
3. **Profile dependency manifests**: the `link:` track writes `"<pkg>": "link:<abs path>"` into the profile's `package.json` dependencies, and the lockfile carries the `link:` protocol entry (R-09). Either corroborates the junction finding.
4. **Identity check**: compare `Get-Item` metadata (LastWriteTime/Length) of a file under both paths — for a junction they are the same file, not equal copies.

Decision rule: **junction/link ⇒ there is no "deploy files" step, ever; the workflow is edit-in-repo → host restart → cache-bypass refresh. Copied install ⇒ update the installed copy through its package manager (never hand-copy over a running host), then the same activation tail.**

### 5.2 Why the generic "copy into node_modules" advice is actively harmful for link installs

- **It is a self-copy**: source and destination resolve to the same physical files. At best it errors confusingly; at worst a `-Force` overwrite truncates the file to zero bytes — and because a link install keeps **no second copy**, that is unrecoverable data loss in the repo itself.
- **It invites lock-bypass tricks on the source tree**: the copy fails with EBUSY (the real problem is the running host, §2), which tempts operators into rename/delete workarounds that — through the junction — mutate the **repo**, exactly as happened here: one `Rename-Item` "on the profile" stripped the entry files from both views at once (§3).
- **It misattributes the failure**: time spent fighting "the copy" hides the actual cause (host boot cache + host-held handles), so the real fix (stop/restart the host) is never reached.
- **It can silently change the install topology**: file-manager or script operations that replace a junction with a real directory fork the profile from the repo — future repo edits then stop appearing in the profile with no error at all.
- For a link install the advice is not merely unnecessary (the bytes are already deployed) — every failure mode above lands on the maintainer's **only** copy of the source.

### 5.3 One-line rule

> Look at `LinkType`/`Target` (and the patch-row `link:` marker) **before** touching a file: if the profile entry is a junction, the repo is the install — stop the host instead of copying files, and never rename "aside" what is, through the junction, your source.

---

## Citations

- Fixture: `copy-session.txt` (EBUSY attempts, rename-aside, both listings with only `.old2`), `profile-introspection.txt` (`LinkType: Junction`, `Target: {E:\dev\dsh-attach-input}`, repo `LinkType` empty, `cordis.patch.yml` `link:` marker row), `maintainer-thread.md` (steps 1–6, questions).
- Skill `plugin-upgrade` (SKILL.md): host holds file locks → EBUSY, "a browser refresh is not a host stop"; shared read-only prep — record installation identity (junction vs copied) separately from source identity.
- Skill references: **DSH-0.1.7-A2-04** (client bundles cached at host boot; refresh-only verification reports stale content; auto-reconnect can keep pre-restart bytes; verify served bundle content), **DSH-0.1.6-A2-03** (link-installed plugins stay outside Plugin-Manager bundle management; patch-row + restart is their management path), **rollup-0.1.2 R-09** (`link:` install track creates the junction; junction installs need no sync — echoed in the v0.1.3-alpha.1 verification record), troubleshooting rows 19–20 (EBUSY owned by host PID, not browser; junction rename-aside ⇒ both views lose files; recovery = rename back → `node --check` → stop host → restart → hard refresh), row 16 (host routes re-register only on host restart).

## Boundary compliance

- `fixture/` read-only, unmodified; no writes outside the designated `agent-output/` directory; no migrations, installations, or repo/profile file operations executed; no git operations; no external network access; report is diagnosis + recommended procedure only.
