# S14 Diagnosis Report · Link-Install File-Lock Trap (`@org/dsh-attach-input`)

Evidence sources (read-only fixture, unchanged):
- `fixture/profile-introspection.txt` — `Get-Item ... | Select FullName, LinkType, Target` on the profile entry and on the repo, plus the `cordis.patch.yml` install marker.
- `fixture/copy-session.txt` — the PowerShell session: two EBUSY `Copy-Item` attempts (second one after the browser tab was closed), then the rename-aside attempt that emptied both directories.
- `fixture/maintainer-thread.md` — what was edited (lib-only Web plugin: `lib/client.js` + `lib/index.js`, no build step), what the user did, and the current broken state (`client.js.old2` / `index.js.old2` only).

---

## 1. What the profile entry actually is — the repo IS the installed copy

The introspection is decisive:

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

and the profile's `cordis.patch.yml` confirms the install mode:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

(For contrast, `Get-Item E:\dev\dsh-attach-input` itself shows `LinkType` empty / `Target` `{}` — the repo is a normal directory; the junction is only on the profile side.)

**What this means for deployment:** the profile's `node_modules\@org\dsh-attach-input` is an NTFS junction — a filesystem alias, not a copy. Every path under it resolves to `E:\dev\dsh-attach-input`. There is exactly one set of files on disk, reachable via two pathnames:

- `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js`
- `E:\dev\dsh-attach-input\lib\client.js`

...are the **same file**. "Deploying" a repo edit to the profile is therefore automatic and requires **zero file operations**: editing the repo edits the installed copy, because for a link install the repo tree IS the installed copy.

**Was `Copy-Item` into the profile's node_modules ever the right move?** No — never, for this install. It was at best a file copied onto itself (same physical file through the junction), and in practice it was worse than a no-op: the running host held the files open (EBUSY), and the "fix" attempt (rename-aside) renamed the repo's only copy of the entry files. The copy-installed-dependency advice simply does not apply to a `link:`-marked junction install.

---

## 2. The two locks and their owners: the running dsh host, not the browser

There are two distinct "stale/locked" phenomena, and both belong to the **running dsh host process** (the node process that loaded the plugin and serves the web UI) — not to the browser.

**Lock/staleness #1 — why a browser refresh showed nothing new.** `client.js` is the client bundle of a lib-only Web plugin: the **host process serves it over HTTP** to the browser. The host loaded and cached/serves that bundle from its own state (and runs `lib/index.js` in-process as the server-side entry). When the maintainer edited the files, the host was never restarted, so it kept serving and running the old code. A browser refresh just re-downloads the old bundle from the still-running old host — new files on disk are irrelevant until the host restarts. (On top of that, the browser's HTTP cache can also hold the old `client.js` for the same URL, which is why a *hard* refresh is needed even *after* a correct host restart — see section 4.)

**Lock/staleness #2 — the EBUSY on `Copy-Item`.** Windows does not allow overwriting a file that is open in another process. The open handle belongs to the **running dsh host process**: it has `lib/index.js` loaded as its server entry module and holds/reads `lib/client.js` to serve the client bundle. Hence:

```
Copy-Item : The file "...node_modules\@org\dsh-attach-input\lib\client.js"
is being used by another process, so the process cannot access this file.
```

**Why closing the browser tab did not release the EBUSY.** The browser is a transient HTTP client: it fetches bytes over a short-lived connection and never keeps a handle on the host's files. The lock was never the browser's — it is the host's, and the host keeps running when a tab closes. That is exactly what the transcript shows: tab closed, wait, retry → *same IOException for client.js, index.js, package.json*. The only thing that releases the lock is **stopping the host process**.

---

## 3. Why rename-aside destroyed the SOURCE directory, and the exact recovery

**Why both paths lost their files.** `Rename-Item` was run against the *destination* path (`$dst = C:\...\node_modules\@org\dsh-attach-input\lib`), but through the junction that directory **is** `E:\dev\dsh-attach-input\lib`. So:

1. `Rename-Item $dst\client.js client.js.old2` renamed the **repo's** `client.js` — the only copy that exists.
2. Same for `index.js` → `index.js.old2`.
3. `Copy-Item E:\dev\dsh-attach-input\lib\client.js ...` then failed with `Cannot find path ... because it does not exist` — the source had just been renamed out from under itself.
4. `Get-ChildItem` on both paths shows only `client.js.old2` / `index.js.old2`, because they are two views of one directory. The plugin now has **no entry files at all** under either name.

The rename-aside trick is only survivable when the destination is a true, separate copy; through a junction it mutates the source of truth itself.

**Exact recovery from the current state** (only `.old2` files exist):

1. **Stop the dsh host process completely** (the node/dsh web host), so nothing holds the files and the half-loaded plugin is unloaded. Verify the process is gone before touching files (this also un-blocks step 3's renames if anything still had a handle).
2. **Restore the original entry names** — do it in the repo path (clearest; identical effect through the junction):
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2 index.js
   ```
   These renames are allowed even while the host runs (open handles keep working under a rename), but doing this after step 1 avoids any ambiguity.
3. **Verify syntax before starting anything:**
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```
   (`node --check` parses without executing — safe for the browser-targeted `client.js` too.) Also confirm `package.json` is intact in the repo.
4. **Confirm both views agree and the junction is intact:**
   ```powershell
   Get-ChildItem E:\dev\dsh-attach-input\lib
   Get-ChildItem C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib
   Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target
   ```
   Both listings must show `client.js` + `index.js` (plus `package.json`), and `LinkType` must still be `Junction` → `E:\dev\dsh-attach-input`. Only after verification, delete the leftover nothing (the `.old2` names were consumed by the renames; if any stray copies remain, remove them).
5. Then perform the activation procedure in section 4 (start host → hard refresh → verify). No copying is involved anywhere in the recovery.

---

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin after repo edits

Precondition: install mode already confirmed as link (section 5) — therefore **no file copy step exists at all**.

1. **Pre-flight (once):** confirm junction/`link:` marker (section 5). Confirm repo files are syntactically valid: `node --check lib\client.js; node --check lib\index.js`.
2. **Fully stop the dsh host process** (the node server hosting the plugin and serving the web UI) — *not* just the browser tab. This is the step that (a) releases the EBUSY locks on `lib/index.js` / `lib/client.js` / `package.json`, and (b) drops the old in-memory code. Wait until the process has actually exited (verify no node/dsh process is still running and no handle remains on the lib files).
3. **Do not copy anything.** The junction already points at the edited repo; a copy is a no-op onto itself at best.
4. **Start the dsh host again.** At startup it re-resolves `node_modules/@org/dsh-attach-input` through the junction, requires `lib/index.js` fresh from `E:\dev\dsh-attach-input`, runs the new server code, and now serves the **new** `lib/client.js` over HTTP.
5. **Hard refresh the browser (Ctrl+F5 / cache-bypass reload).** Why hard refresh specifically: even after the host restarted and serves the new `client.js`, the browser's HTTP cache may still hold the old bundle for the same URL and serve it on a normal refresh. The hard refresh forces revalidation/fetch so the new client code is actually downloaded and executed.
6. **Verify the new code actually loaded — both sides:**
   - *Host side:* exercise the new read-only host route from the hover-preview feature (e.g., `Invoke-WebRequest`/curl the new endpoint) and confirm it responds with the new behavior; check the host log for the plugin loading (version/marker) without errors.
   - *Client side:* after the hard refresh, open DevTools → Network → select `client.js` → confirm a fresh 200 whose body contains the hover-preview code (search for a new identifier), or a temporary version/console marker; then confirm the hover-preview behavior works on an image attachment in the UI.
   - If the client still looks old: re-check that the host was truly restarted (it serves the bundle), and that the reload was a cache-bypass reload — those are the only two places staleness can hide.

Order matters: stop host → verify files → start host → hard refresh → verify. Restarting only the browser (step 1 in the maintainer thread's instructions that the user skipped: "restart dsh web") never loads new code; skipping the host restart is what made the refresh look like a no-op.

---

## 5. The pre-flight check that must come before touching any file

Before any copy/rename/deploy action, determine the **install mode from the profile itself**:

1. **LinkType/Target probe:**
   ```powershell
   Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
     Select-Object FullName, LinkType, Target
   ```
   - `LinkType : Junction` (or `SymbolicLink`) with a `Target` → **link install**: the profile path is an alias of the repo; the repo tree IS the installed copy.
   - `LinkType` empty, with real files inside → **copied dependency**: only then do "update the copy in node_modules" workflows apply.
2. **Install marker cross-check:** read the profile's `cordis.patch.yml`:
   ```
   - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
   ```
   The `link:E:\dev\dsh-attach-input` marker independently confirms the junction — the plugin was installed as a link to the repo on 2026-08-30.
3. (Optional sanity check for the reverse direction: `Get-Item` on the target repo shows `LinkType` empty — a plain directory — confirming the repo is the real storage, the profile entry is the alias.)

**Why the generic "copy into node_modules" advice is actively harmful for link installs:**

- It misdiagnoses the problem: stale behavior after repo edits under a link install is a **process restart** issue, not a file-deployment issue. Copying fixes nothing and hides the real fix (restart host, hard refresh).
- Through the junction, the "destination" is the **same directory** as the source, so the copy is a file onto itself — a no-op at best.
- While the host runs, the copy hits the host's open handles → the EBUSY seen in `copy-session.txt`, inviting ever-riskier workarounds.
- The standard workaround for a locked copy target — rename-aside — is catastrophic here: it renames the **repo's only copy** of the entry files (both views of one directory), which is precisely how this plugin ended up with zero entry files.
- Correct response to "files locked + link install": stop the host (releases locks), touch nothing, start the host — the junction guarantees the new code loads.

---

## Summary

- The profile entry is a **Junction → `E:\dev\dsh-attach-input`** (`profile-introspection.txt`), also marked `link:` in `cordis.patch.yml`. The repo is the installed copy; copying into the profile was never needed and never right.
- Both staleness and EBUSY trace to the **running dsh host**: it serves `client.js` and holds the lib files open. The browser never held a lock, so closing the tab changed nothing.
- Rename-aside through the junction renamed the repo's own files (one directory, two paths), leaving only `.old2`. Recovery: stop host → rename `.old2` back to `client.js` / `index.js` in the repo → `node --check` both → confirm both views and the junction → then activate.
- Activation: stop host fully → no copying → start host → **hard refresh** (browser HTTP cache) → verify via the new host route and a fresh `client.js` in DevTools Network.
- Pre-flight always: `Get-Item ... | Select LinkType, Target` + `cordis.patch.yml` `link:` marker. Copy advice is only for copied dependencies; on a link install it is a self-copy, hits the host's locks, and rename-aside destroys the source.
