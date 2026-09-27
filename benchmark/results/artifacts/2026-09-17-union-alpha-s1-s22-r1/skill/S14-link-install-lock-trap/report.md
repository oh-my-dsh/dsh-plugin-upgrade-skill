# S14 — Link-install file-lock trap

## Scope and pre-existing state

Mode A: read-only diagnosis using the supplied static evidence. No installation, migration, package script, host restart, or fixture modification was performed. The requested report is the only file created. Mechanical baseline: **not collected** (not Mode C; the actual plugin repository and running affected host are not supplied). The broken entry names and failed copies predate this analysis.

Evidence paths below are relative to E:/deepseek-harness/dsh-plugin-upgrade-skill/benchmark/tasks/S14-link-install-lock-trap/environment/fixture. All four evidence files were read in full. The methodology was loaded from E:/deepseek-harness/dsh-plugin-upgrade-skill/skills/plugin-upgrade/SKILL.md; references/troubleshooting.md was consulted on demand, followed by the junction passages in references/v0.1.3-alpha.1.md (A1-07 and the six-plugin validation record). These support link-install semantics, not an inferred host-version upgrade.

## Completed: identity and diagnosis

### 1. This installation is a junction, not a copied dependency

profile-introspection.txt:1–11 reports:

- Profile entry: `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input`.
- `LinkType : Junction`; `Target : {E:\dev\dsh-attach-input}`.
- The target repository itself has empty LinkType and Target fields.

profile-introspection.txt:13–14 corroborates the filesystem result with the composition row in C:\Users\me\.dsh\profiles\web\cordis.patch.yml: `node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`. The actual filesystem target is authoritative; the comment records installation intent and can become stale.

The profile path redirects to the repository tree. There are not two independent copies of `lib`: editing a repository file changes the file seen through the profile immediately **on disk**. This does not reload the running host or browser. Copying those files into this profile node_modules was never necessary or correct for this install: source and destination alias the same files. Even without a lock, a self-copy is not a deployment step. Do not replace the junction, reinstall, or change the composition to solve activation.

Source identity is the local repository E:\dev\dsh-attach-input; installation identity is its profile junction. The reported package is `@org/dsh-attach-input` v0.2.11 (maintainer-thread.md:1), with shipped `lib/client.js` and `lib/index.js` and no build step (lines 3–7). No package manifest, lockfile, Git HEAD/branch/status, remote URL, DSH cohort, host version, or Node version is supplied. The thread version is not independently verified against a manifest. Do not infer those coordinates or choose a host migration corridor.

### 2. Two host-side barriers, plus browser caching

**Running-code/bundle state:** the long-lived `dsh web` Node host loads the host half (`lib/index.js`, including route registration) and serves the client bundle built/loaded from `lib/client.js`. Refreshing the browser only reloads the client page; it neither restarts the host nor reruns the host plugin apply/route registration. The still-running host can continue serving its existing client artifact and running its old host module. Thus repository edits being visible on disk do not prove that either runtime half has activated them. The fixture explicitly records a browser-only refresh and unchanged behavior (maintainer-thread.md:6–12).

**Windows file lock:** the relevant open-file ownership is in the running DSH host/its plugin-loading or serving machinery, not the browser tab. The host remains alive and holds the relevant loaded files/handles while the tab is closed. Copy-session.txt:1–8 records the same sharing failure after closing the browser, exactly why that action cannot release EBUSY. A rename being allowed is not proof that the owning process released a handle: Windows sharing permissions can permit rename while preventing overwrite.

These are the two host-side obstacles: stale loaded code and an OS sharing lock. Browser HTTP cache is an additional stale-client layer, not the owner of the lib-file lock. Even after a proper host restart, a normal refresh can reuse cached JavaScript. A hard refresh/cache bypass must obtain and evaluate the new client artifact.

The fixture does not include a PID/handle trace or HTTP cache headers. Attribution to the running host follows the task evidence and troubleshooting guidance; an exact PID, low-level open flags, or the precise cache component was not measured. Do not turn this incident into a claim that all Node imports permanently lock every JavaScript file. The summarized retry also mentions package.json even though the displayed wildcard is `*.js`; no additional package.json damage can be inferred from that abbreviated line.

### 3. Rename-aside changed the only source files

Copy-session.txt:11–21 shows `Rename-Item` through the profile path changing client.js to client.js.old2 and index.js to index.js.old2. Because the parent is a junction, these operations renamed the originals in E:\dev\dsh-attach-input\lib. The subsequent copy from the original repository name failed because that name no longer existed. Both listings show the same two `.old2` files, not independent destruction of two copies. The bytes have not been shown lost; the required entry names have been removed. These `.old2` files are the renamed edited files, not proven backups of an older release.

## Exact recovery and ordered activation (proposed, not executed)

Run the following only on the affected machine, from an **external PowerShell terminal**, not through a session hosted by the DSH process that must stop. The paths below are incident paths, not locations to create in the benchmark.

1. Perform the read-only install-mode checks in the next section. Confirm that the junction still resolves to the stated repository and the current state really is only client.js.old2 and index.js.old2. Preserve any unexpected files; if originals reappear, do not overwrite them automatically.
2. Fully stop the affected `dsh web` host using its owning terminal/process supervisor. Stop other DSH instances using this same linked tree, if any, and prevent a supervisor from immediately respawning them. Verify those host processes have exited and released their handles/listening port. Closing a tab, closing the browser, disconnecting a session, or pressing refresh is not this stop. Do not indiscriminately kill unrelated Node processes. Stopping before recovery is safer than attempting another rename under an active lock.
3. Restore the two names **once**, through the real repository path, without copying through the alias. The following checks refuse overwrite and require both backups before the first rename:

```powershell
$ErrorActionPreference = 'Stop'
$lib = 'E:\dev\dsh-attach-input\lib'
foreach ($name in @('client.js', 'index.js')) {
    if (Test-Path -LiteralPath (Join-Path $lib $name)) {
        throw "Original already exists; inspect without overwriting: $name"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $lib ($name + '.old2')) -PathType Leaf)) {
        throw "Missing recovery file: $name.old2"
    }
}
Rename-Item -LiteralPath (Join-Path $lib 'client.js.old2') -NewName 'client.js'
Rename-Item -LiteralPath (Join-Path $lib 'index.js.old2') -NewName 'index.js'
Get-ChildItem -LiteralPath $lib
Get-ChildItem -LiteralPath 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
node --check (Join-Path $lib 'client.js')
if ($LASTEXITCODE -ne 0) { throw 'client.js syntax check failed; do not activate' }
node --check (Join-Path $lib 'index.js')
if ($LASTEXITCODE -ne 0) { throw 'index.js syntax check failed; do not activate' }
```

Both views should now show client.js and index.js. No second restoration through node_modules is needed. A partial rename failure requires inspecting the two actual filenames before continuing, not blindly rerunning or deleting anything. If syntax fails, keep the host stopped and repair/recover only the affected source after review. Syntax checks do not execute the plugin and do not prove API or runtime compatibility.

4. Once both syntax checks pass, start a fresh `dsh web` using the same installation, profile, and original launch options that served this plugin. Confirm a new host process, successful startup, the expected profile, and active plugin entry with no missing-file/registration/pending-service error. This reloads the host route and regenerates/reloads the served client state. No build is required for this lib-only package, and there is no dependency install or file-sync step.
5. Open or return to the browser only after the host is ready. Hard-refresh the same GUI (for example Ctrl+Shift+R/Ctrl+F5, or DevTools Disable cache with reload). A full browser-process restart is not needed to release the file lock; what is required on the browser side is fresh page/client JavaScript evaluation with cache bypass. Reopening a tab alone can still use cached JavaScript.
6. Verify both halves, not only a successful HTTP response:
   - Confirm the profile entry still targets E:\dev\dsh-attach-input and the composition has one intended entry, no duplicate or obsolete source row.
   - Use DevTools Network/Sources to inspect the **actual advertised client artifact** (possibly a combined bundle): verify successful fresh retrieval and a distinctive existing hover-preview code fragment/marker matching the edited file. Do not guess an artifact URL, rely solely on a 200, or accept an unchanged version label as proof of new code.
   - Confirm client registration/mount without console errors. Attach an image and hover to observe the new preview, then exercise any existing click/viewer behavior for regression.
   - Exercise the newly added read-only host route using its real declared path and expected input, checking its actual response rather than accepting a generic page/404. The route URL is absent from the evidence and must not be invented.
   - If either half is stale, recheck the serving PID/profile and retrieved artifact before changing files. Record startup, request, console, and behavior results without exposing credentials or session logs.

For future edits, use the same sequence: inspect installation identity → fully stop affected hosts before replacing locked files → edit repository lib files directly → syntax-check both → start the same host/profile → browser hard refresh → verify both route and hover behavior. If edits already exist on disk, skip editing and proceed to checks/restart; never add a copy-to-node_modules step.

## Pre-flight before any file change

Read-only incident-machine checks:

```powershell
Get-Item -LiteralPath 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input' |
    Select-Object FullName, LinkType, Target
Get-Item -LiteralPath 'E:\dev\dsh-attach-input' |
    Select-Object FullName, LinkType, Target
Select-String -LiteralPath 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' -Pattern 'dsh-attach-input'
```

Resolve the target and inspect package identity plus the exact composition row before deciding a deployment mechanism. Record repository rules, HEAD, working-tree changes, dependency manager/lockfile, versions and hashes of intended recovery paths when the actual repository is available; preserve uncommitted feature edits. Do not scan credentials or rewrite resolved config.

A Junction/Target plus a matching `link:` marker means repository and installed path share storage: no sync. A genuinely separate copied dependency has different storage and may require the package manager/install mechanism that owns it, with lifecycle and rollback review; a blank LinkType alone should not substitute for tracing parent links/resolution and corroborating installation metadata. Generic copying advice is actively harmful here because it treats aliases as independent backups, invites self-overwrite/EBUSY, and makes rename/delete operations affect the only source tree.

## Skipped

- No DSH or plugin upgrade, version bump, dependency resolution change, build, install, release, publish, Git operation, or fixture recovery was executed. This is a link activation incident, not evidence of an API version incompatibility.
- No full migration corridor or seven-class source scan was needed: the actual source is absent and the requested outcome is read-only incident diagnosis. Only the directly relevant troubleshooting/junction references were consulted.
- No browser or host process was stopped in this benchmark. The affected machine is represented by transcripts, not a live reproducible deployment.

## Pending/residual risk

The diagnosis and recovery plan are complete; **recovery and runtime validation remain unperformed**. The fixture lacks the `.old2` contents, package manifest/lockfile, repository metadata, exact launch options, route definition, host PID/handles and served artifact. Consequently syntax success, runtime activation, compatibility and feature correctness cannot be claimed. No scripts ran, so this analysis introduced no installation/lifecycle side effects. The operator should retain edited bytes and collect the proposed checks on the affected machine before declaring recovery complete.

## Rollback

The recoverable incident baseline is the two named `.old2` files in the one real lib directory plus the existing junction/composition evidence. Restoring their original names recovers entry availability, not a prior feature version. If the edited feature must be rolled back, first preserve those edits separately, then use a known-good version of only lib/client.js and lib/index.js, with the host fully stopped, followed by syntax checks and the same activation procedure. No known-good SHA or file hash was supplied; none is fabricated. Never reset/clean the whole repo, delete the junction target, restore through both aliases, or claim rollback of unknown third-party effects.

## Recommendations

Document the install mode and canonical source path alongside the plugin's local activation instructions. Make “stop host → syntax checks → restart host → hard refresh → verify client and host behavior” the lib-only link workflow. Keep the profile link intact; no HMR watcher, copied deployment, or host upgrade is necessary to explain or fix this incident.
