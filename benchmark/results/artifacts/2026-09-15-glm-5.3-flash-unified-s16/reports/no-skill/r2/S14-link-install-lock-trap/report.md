# S14 Diagnosis Report · Link-Install File-Lock Trap (`@org/dsh-attach-input`)

Evidence cited: `fixture/profile-introspection.txt` (introspection), `fixture/copy-session.txt`
(PowerShell session), `fixture/maintainer-thread.md` (maintainer's write-up). The fixture was
read-only; nothing in it was modified.

---

## 1. What the profile entry actually is — a Junction (link) install

The introspection is decisive:

```
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}

FullName : E:\dev\dsh-attach-input
LinkType :
Target   : {}
```

The profile entry is **not a copied directory** — it is an NTFS **directory junction** whose
target is the repo itself, `E:\dev\dsh-attach-input`. The repo directory, by contrast, is a real
directory (empty `LinkType`), so the link is one-way: the profile path is a reparse point that
redirects every path traversal into the repo tree. The profile's install manifest confirms it:

```
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

**What this means for deployment:** for a link install, **the repo tree IS the installed copy**.
`C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib\client.js` and
`E:\dev\dsh-attach-input\lib\client.js` are the *same file* reached through two paths. Saving a
file in the repo has already "deployed" it to the profile — there is no artifact to copy, ever.

**Was `Copy-Item` into node_modules ever the right move? No — never, for this install mode.**
In the best case it copies each file onto itself (a no-op); in practice the running host holds
the files open, so it fails with EBUSY; and if someone "fixed" a link install by replacing the
junction with a real copied directory, they would *detach* the profile from the repo, after
which future repo edits would silently never ship. Step 4 in the maintainer thread was based on
a false premise ("the profile must be running an installed COPY") — the evidence shows the
opposite.

---

## 2. The two locks and their owners — it is the running dsh host, not the browser

**Which process serves the client bundle:** the **running dsh host process** (the Node host
that loaded the plugin). It loads `lib/index.js` once at startup into its module cache and
serves `lib/client.js` to browsers as a static client asset. The browser is only an HTTP
client; it never holds a handle on the server-side files.

**What holds the lib files open:** the same **dsh host process**. It keeps the plugin's lib
files in use after loading/serving them (loaded plugin modules plus open handles for serving
the client bundle). On Windows, `Copy-Item -Force` overwrites a file in place, which fails with
a sharing violation when another process has the file open without write sharing — this is the
`IOException ... being used by another process` seen in `copy-session.txt` for `client.js`,
`index.js`, and `package.json`. `-Force` cannot bypass another process's open handle.

**Why a browser refresh showed nothing new:** two independent caches were in the way, and
neither is fixed by a plain refresh:

1. The **host** had already loaded the old `index.js` (and was serving the old `client.js`)
   into memory at startup. A running Node host never re-reads a plugin's files on its own, so
   host-side behavior — including the new read-only host route — stays old until the host
   process is fully stopped and restarted.
2. The **browser** caches `client.js` under its URL per normal HTTP caching. A soft refresh
   (F5 / reload) may satisfy the request from the memory/disk cache without pulling a fresh
   body, so the tab kept executing the stale bundle.

**Why closing the browser tab did not release the EBUSY:** because the browser was never the
lock owner. It held only an HTTP connection, which closed with the tab. The EBUSY comes from
the **dsh host's** file handles on the server side, and that process kept running. That is
exactly what the transcript shows: the second `Copy-Item` after "maintainer closes the browser
tab, waits, retries" failed with the same `IOException`. Only stopping the host process
releases those handles.

---

## 3. Why rename-aside destroyed the SOURCE directory too, and the exact recovery

### Why both directories "lost" their files

`Rename-Item ($dst + '\client.js') 'client.js.old2'` was executed through
`C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib` — but that path *is*
`E:\dev\dsh-attach-input\lib` through the junction. Renaming a file through a reparse point
renames the underlying file in the target directory. So the two renames did not stage copies
aside in the profile; they renamed the **repo's own edited files**:

- `E:\dev\dsh-attach-input\lib\client.js` → `client.js.old2`
- `E:\dev\dsh-attach-input\lib\index.js` → `index.js.old2`

The follow-up failure is the smoking gun:

```
Copy-Item : Cannot find path "E:\dev\dsh-attach-input\lib\client.js" because it does not exist.
```

The source had just been renamed away by the previous command. And the two `Get-ChildItem`
listings in `copy-session.txt` show *identical contents* (`client.js.old2`, `index.js.old2`)
precisely because they are one directory seen through two paths. Net result: the plugin has no
entry files at all, under either path.

**Important:** no code was lost. The `.old2` files **are** the edited hover-preview versions —
they are the renamed repo files; the "fresh copies" never arrived (the copy failed).

### Exact recovery from the current state

Current state: `E:\dev\dsh-attach-input\lib` (= the profile path) contains only
`client.js.old2` and `index.js.old2` (plus `package.json`, which the renames never touched).

1. **Fully stop the dsh host process** (and confirm it is gone). Nothing should be running that
   tries to load the plugin — the entry files do not exist right now, and the host must not hold
   handles during recovery.
2. **Restore the original names in the repo** (use the real repo path so intent is explicit;
   the profile path is the same files):
   ```powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
   ```
   These renames are safe even while a host runs (they create files, not overwrite locked
   ones), but doing it with the host stopped keeps everything clean.
3. **Verify the restore landed in the same directory the profile sees** (proves the junction is
   still intact and the install is whole):
   ```powershell
   Get-ChildItem E:\dev\dsh-attach-input\lib
   Get-ChildItem 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
   Get-Item 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
     Select-Object FullName, LinkType, Target   # expect Junction -> E:\dev\dsh-attach-input
   ```
   Both listings must show `client.js`, `index.js`, `package.json`; do **not** rename or delete
   the junction itself.
4. **Verify syntax before starting anything** (lib-only, no build step to catch errors):
   ```powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   ```
   Both must pass; also confirm the hover-preview code is actually inside the restored files
   (it should be — see §3 note above).
5. **Activate** per §4 below.

---

## 4. Complete, ordered activation procedure (link-installed lib-only Web plugin)

For this install mode, "deploy" = save the repo files; "activate" = restart the right processes
in the right order.

1. **Confirm the install mode** is a link (§5 pre-flight) — if it is, skip any copy step
   entirely.
2. **Save all edits** and **syntax-check** them: `node --check lib\client.js` and
   `node --check lib\index.js`. A lib-only plugin has no bundler to catch a typo for you; a
   syntax error would take the whole plugin down at next host start.
3. **Fully stop the dsh host process.** This is the mandatory restart for a lib-only plugin:
   the host is what (a) `require`s `lib/index.js` into its module cache — including the new
   read-only host route — and (b) serves `lib/client.js` to browsers. Verify the process is
   actually gone (task manager / process list), not merely that a window closed. Closing
   browser tabs does nothing here — the browser is not the lock owner (§2).
4. **Start the host again.** On startup it re-reads `index.js` (host route live) and serves the
   current on-disk `client.js` — which, thanks to the junction, is already your edited file.
5. **Hard refresh the browser (Ctrl+F5 / cache-bypass reload).** The browser must be involved,
   but only via a cache-bypassing reload — the browser process never needs to be restarted or
   closed. The hard refresh is needed **for `client.js` specifically** because the browser's
   HTTP cache still holds the old bundle under the same URL; a normal reload can serve it from
   the memory/disk cache without fetching a fresh body. A hard refresh forces a real request so
   the server's current bytes are downloaded.
6. **Verify the new code actually loaded — both halves:**
   - *Host side:* exercise the new read-only host route (curl or address bar) and confirm it
     responds; check the host startup log for the plugin loading cleanly.
   - *Client side:* open DevTools → Network, reload with cache disabled, and confirm
     `client.js` was fetched from the server (`200` with a new size / new content — **not**
     `(disk cache)`, `(memory cache)`, or `304`); optionally view the served source and confirm
     the hover-preview code is present; then confirm the visible behavior (hover preview works).

Why stale code can still appear after the host restarted: the browser cache outlives the host.
That is why step 5 (hard refresh) is required even with a freshly restarted server.

---

## 5. Pre-flight check: determine install mode BEFORE touching any file

Before any deploy/activation step, run two read-only checks against the profile:

1. **LinkType/Target on the profile entry:**
   ```powershell
   Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
     Select-Object FullName, LinkType, Target
   ```
   - `LinkType: Junction` (or `SymbolicLink`) + a `Target` → **link install**: the repo tree is
     the installed copy; activation = restart host + hard refresh, nothing to copy.
   - Empty `LinkType` → a real copied dependency; updates go through the installer/reinstall,
     not ad-hoc file copies (and even then, stop the host first or the files are locked).
2. **The cordis.patch.yml install marker** (the profile's record of what the installer did):
   ```powershell
   Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
   # - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
   ```
   The `link:<path>` marker independently confirms a link install and names the source tree.

Had this pre-flight been run first, the entire incident is avoided: step 4 (Copy-Item) is
obviously unnecessary, and the rename-aside "workaround" is obviously self-destructive.

**Why generic "copy into node_modules" advice is actively harmful for link installs:**

- It is a **no-op at best**: the copy destination resolves, through the junction, to the same
  files as the source — you are copying the repo onto itself.
- It **fails messily**: the running host holds the files open, producing EBUSY that invites
  ever-riskier workarounds — which is exactly how the rename-aside trick, executed through the
  junction, renamed the **source repo's own entry files** and left the plugin with no entries
  at all (§3).
- It can **detach the link**: replacing the junction with a real copied directory breaks the
  install's semantics — future repo edits would never reach the profile, the
  `cordis.patch.yml` link marker would no longer match reality, and the next plugin operation
  would be operating on a fork of the code.

**Rule of thumb:** check LinkType/Target (and the link marker) first; if it is a link, the
deployment already happened when you hit Save — the remaining work is process restart order
(host stop → host start) plus a browser hard refresh, and the only correct response to EBUSY is
to stop the **host process**, never to rename files aside.

---

### Summary of root causes

| Symptom | Actual cause |
|---|---|
| Browser refresh showed nothing new | Host still running with old `index.js` in memory + browser HTTP cache on `client.js`; a soft refresh fixes neither |
| EBUSY on `Copy-Item` into profile | Destination is the repo via Junction; the running **dsh host** holds the files open, not the browser |
| EBUSY persisted after closing the tab | Lock owner is the host process server-side; the browser never held a file handle |
| Rename-aside emptied the SOURCE dir | Both paths are the same directory through the junction; renames hit the repo's own files |
| `Copy-Item` "source does not exist" | The previous `Rename-Item` had just renamed the repo's `client.js` away |
| Correct model | Link install: repo IS the deployed copy; activate = stop host, start host, hard refresh |
