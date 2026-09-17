# S14 · Link-Install File-Lock Trap — Diagnostic Report

Task: diagnose the failed verification of `@org/dsh-attach-input` v0.2.11 (lib-only Web plugin, hover-preview feature). Evidence: `copy-session.txt`, `profile-introspection.txt`, `maintainer-thread.md` in the read-only evidence pack. Analysis follows the dsh-plugin-upgrade skill (Mode A · inspect, read-only): the maintainer's repo at `E:\dev\dsh-attach-input` is a Git/source checkout; the installation identity must be recorded separately from the source identity — that single distinction explains every failure below.

## 1. What the profile entry actually is

`profile-introspection.txt` is decisive:

```
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

The profile "installed" entry is **not a directory containing a copy of the package** — it is an NTFS junction (a directory link). Through the link, `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib` and `E:\dev\dsh-attach-input\lib` are **the same physical directory**. The repo tree IS the installed copy; there is no separate deployment target.

Deployment semantics for this install mode:

- Edits to `lib/client.js` / `lib/index.js` in the repo are *already live in the profile* the moment they are saved to disk. Zero copying, zero installing, zero file movement is needed to "deploy" them.
- `cordis.patch.yml` confirms the install mode independently: `- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)` — the `link:` marker records a link install.
- Therefore **Copy-Item into the profile's node_modules was never the right move** — not merely unnecessary, it was a category error: it tried to copy files onto themselves across a link. The host (which held the files open, see §2) blocked the overwrite with EBUSY, and even a successful copy would have overwritten the source repo in place, destroying the working tree with no backup.

The maintainer's step-4 assumption ("the profile must be running an installed COPY") was wrong, and every subsequent action inherited that wrong premise.

## 2. The two locks and their owners

**Who serves the client bundle / holds the lib files open: the running dsh host process.** In a DSH web session, the host loads the Web plugin's `lib/client.js` (an ES module) and serves the client bundle to the browser over HTTP. While the host runs, the loaded module files are held open — on Windows that makes an overwrite (Copy-Item -Force) fail with `IOException` (EBUSY), exactly as recorded:

- `copy-session.txt`, attempt 1: *"The file ...lib\client.js is being used by another process"* — that is the dsh host, not the browser.
- Attempt 2 (after closing the browser tab and waiting): *"same IOException for client.js, index.js, package.json"*.

**Why closing the browser tab did not release the lock:** the browser is a *consumer* of the bundle, not its *holder*. The browser received an HTTP response — a copy of the code in browser memory/cache — and holds no open handle to the files on disk. The open handles belong to the dsh **host process**, which keeps running regardless of how many browser tabs open or close. That is also why a browser-only refresh showed nothing new: refreshing re-fetches from the same running host, which still serves the module it loaded at startup (and a plain refresh can be served from HTTP cache anyway). The fix for the lock is stopping the **host process**, which was never attempted.

## 3. Why rename-aside destroyed the SOURCE directory, and the recovery

**Mechanism.** `Rename-Item ($dst + '\client.js') 'client.js.old2'` was executed against a path *under the junction*. Junction traversal is transparent at the filesystem level, so the rename applied to the one real file behind the link — `E:\dev\dsh-attach-input\lib\client.js`. There was never a separate profile copy to rename aside. The transcript then proves it:

- `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ...` fails with *"Cannot find path \"E:\dev\dsh-attach-input\lib\client.js\" because it does not exist."* — the source path no longer resolves because the rename moved the source file itself.
- `Get-ChildItem E:\dev\dsh-attach-input\lib` and `Get-ChildItem $dst` print the **identical listing** — `client.js.old2`, `index.js.old2` — the classic proof that both paths are one directory. The plugin now has no entry files under their real names; the host cannot activate it.

**Recovery from the current broken state** (rename-back plus a syntax check; no installation, consistent with this task's read-only execution constraints):

1. Fully stop the dsh host first (§4) so nothing re-reads the half-broken package mid-repair.
2. In `E:\dev\dsh-attach-input\lib` (the real directory; doing it there or via the junction path is equivalent):
   - `Rename-Item client.js.old2 client.js`
   - `Rename-Item index.js.old2 index.js`
   This restores the original names. The `.old2` files are the newest working content (the hover-preview edits were made in place before any of this), so restoring them restores the feature, not a stale version.
3. Verify the files are syntactically valid before activation: `node --check lib/client.js` and `node --check lib/index.js` (or a trial `import` of `./lib/index.js` under the package's module mode), and confirm `package.json` still exists and declares the entry points.
4. Follow the activation procedure in §4.

Do **not** re-copy anything into the profile node_modules — same directory, same trap.

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin after repo edits

1. **Stop every dsh process completely** (the host process serving the web profile). The skill states the principle: *a running host holds native-module file locks → EBUSY; a browser refresh is not a host stop.* Closing the browser tab (the pack's step 4) was irrelevant because the browser never held the lock. Only a full host stop releases the open handles on `lib/*.js`.
2. **Save/verify the repo files** — for this incident, that is the §3 recovery: restore `.old2` names, `node --check` both files.
3. **Restart the host** (`dsh web` / the profile). Because the entry is a junction to the repo, the restarting host reads the freshly edited `lib/client.js` / `lib/index.js` directly from `E:\dev\dsh-attach-input`. No copy step exists in this procedure — by design.
4. **Hard refresh the browser (cache bypass: Ctrl+F5 / DevTools "Disable cache" reload).** Two reasons: (a) a plain refresh may serve the plugin module from the browser's HTTP cache — this is why the maintainer's step-3 plain refresh "showed nothing new" even on a correct install; (b) even a fresh fetch is only meaningful *after* the host restart, because the old host serves old code. Host restart changes what is served; the hard refresh guarantees the browser actually re-fetches it.
5. **Verify the new code actually loaded**, not merely that the page returned:
   - Check the served artifact matches disk: fetch the client module URL the host advertises (or inspect the loaded module in DevTools) and confirm hover-preview identifiers from the new `lib/client.js` appear; compare bytes with the repo file.
   - Confirm host-side activation: the `cordis.patch.yml` row resolves and no Cordis services remain pending at cold start.
   - Behaviorally exercise the feature once: hover an image attachment and observe the preview (one real plugin path, per the skill's validation ladder: runtime enablement → served artifact → behavior).

Failure-attribution shortcut for next time: "refresh shows old behavior" means either the host did not restart or the browser cached — never "the profile has a stale copy".

## 5. Pre-flight: determine install mode BEFORE touching any file

Before any deploy-style action, run the two read-only checks that were ultimately performed in `profile-introspection.txt` — they should have come first:

1. **LinkType/Target probe** of the profile entry:
   `Get-Item <profile>\node_modules\@org\dsh-attach-input | Select-Object FullName, LinkType, Target`
   - `LinkType: Junction` (+ `Target: E:\dev\dsh-attach-input`) ⇒ **link install**: the repo tree is the deployed artifact; activation = restart host + hard refresh; copying is harmful (it overwrites the source in place, behind the link).
   - Empty `LinkType`/`Target` (as the probe of `E:\dev\dsh-attach-input` itself shows — the link has one direction only) ⇒ an ordinary directory; then check whether the *profile* entry is a real separate copy.
2. **Composition marker**: `Select-String dsh-attach-input <profile>\cordis.patch.yml` returned `# link:E:\dev\dsh-attach-input (installed 2026-08-30)`. A `link:` annotation records link-install intent; its absence, with a regular dependency row, indicates a copied/registry install — where "update the copy" would at least be the right *category* of action (done via the package manager, never Copy-Item).

The skill generalizes this as Mode A step 2: *record source identity and installation identity separately — registry package, Git checkout, workspace/junction, or copied install.* The two probes are that separation made concrete.

**Why the generic "copy into node_modules" advice is actively harmful for link installs:**

- It is semantically a no-op-with-destruction: the destination resolves to the source, so "deploying" mutates the only copy that exists.
- It corrupts the working tree: overwriting repo files (with themselves or with divergent content) destroys the reviewed state, typically without backup — exactly the un-versioned overwrite the skill's baseline/rollback discipline prevents.
- It triggers spurious EBUSY failures that invite escalating workarounds; this pack documents the escalation chain: copy fails → close tab (wrong process) → rename-aside, which — because of the junction — renamed the *source* entry files and left the plugin with no entry files at all.
- It misdirects diagnosis away from the actual activation requirement (host restart), so even a "successful" copy would not have made the new code appear.

## Summary of root causes

| Observed failure | Root cause | Evidence |
|---|---|---|
| Browser refresh showed nothing new | Host still running serves the module loaded at startup; plain refresh may hit cache | maintainer-thread.md steps 2–3; the host is the bundle server |
| Copy-Item EBUSY, persists with no browser tab | Lock held by the dsh host process, not the browser | copy-session.txt attempts 1–2 |
| Rename-aside emptied the repo | Junction makes profile path and repo path one directory; rename hit the source | copy-session.txt final Get-ChildItem listings; profile-introspection.txt Junction/Target |
| "Cannot find path E:\dev\...\client.js" | The renamed file WAS the source file | copy-session.txt Copy-Item error |
| Plugin has no entry files now | Both entries exist only as `.old2` | copy-session.txt; recovery = rename back + `node --check` + restart host + hard refresh |
