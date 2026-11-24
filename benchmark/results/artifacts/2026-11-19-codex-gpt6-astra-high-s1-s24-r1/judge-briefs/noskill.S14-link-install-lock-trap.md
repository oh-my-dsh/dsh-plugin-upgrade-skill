# JUDGE BRIEF · noskill.S14-link-install-lock-trap

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

# S14: linked plugin recovery and activation

## Diagnosis and evidence

The profile entry is a directory junction, not a separately installed copy. `fixture/profile-introspection.txt` records:

- Profile: `C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input`
- `LinkType : Junction`
- `Target : {E:\dev\dsh-attach-input}`
- The repository itself has an empty LinkType and Target.
- `cordis.patch.yml` contains `node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)`.

Both paths therefore address the same directory and files. Saving repository edits already updates the installed files. This lib-only plugin ships `lib/client.js` and `lib/index.js` directly and has no build step (`fixture/maintainer-thread.md`, step 1 and introduction). Deployment here requires activation of those edits, not copying or reinstalling. Copying the repo files into this profile entry was never necessary or appropriate for this install mode: it attempts to overwrite the source through an alias, risks file-lock errors or damage, and cannot create an independent replacement.

## The two host-side obstacles, plus browser cache

1. **Loaded-code/bundle state:** the running dsh Web host loads the plugin's server entry and serves the client bundle. A browser refresh only requests resources from that same host; it does not restart the host, reload its server module, or ensure that its client bundle state is rebuilt. The old running host can therefore keep serving old code after repository edits. Restart the host to activate `index.js`, the new route, and the served client code.
2. **Filesystem lock:** the running dsh host process (including any child process responsible for serving/bundling the plugin) is the relevant owner of open plugin-file handles. The browser consumes served HTTP resources; closing its tab does not terminate the host or release the host's handles on local `lib` files. This explains why closing the browser did not resolve the reported EBUSY.

Browser HTTP cache and already-loaded JavaScript are a separate source of stale client behavior. Even after the host has restarted, a browser can reuse an old `client.js` response. A hard reload with cache bypass is required to obtain and execute the new client code.

Evidence limit: the pack contains static transcripts, not a live handle listing, PID inventory, host source, or cache headers. The above is the host-versus-browser diagnosis supported by the task and symptoms; no specific PID, handle API, or precise bundler cache implementation has been measured. `copy-session.txt` proves that the attempted copy reported files in use and that closing the tab did not change that result. If a lock remains after the intended host is stopped, inspect local handle ownership and other host instances before proceeding; do not guess a PID or kill all Node processes.

## Why both paths lost their entry files

`fixture/copy-session.txt` shows that renaming the profile's `lib/client.js` to `client.js.old2` and `index.js` to `index.js.old2` also renamed those files in the repository. This is one directory reached by two names, not a destructive synchronization operation between independent trees. The subsequent copy failed because its source name no longer existed. Both listings then contained only the two `.old2` files. The contents were renamed; the original entry-point names are missing. Recover those names instead of copying files between the aliases or reinstalling the plugin.

## Exact recovery from the reported state (instructions only)

1. Stop the dsh Web host using the same terminal, application, or supervisor that launched it. For an interactive launch, request shutdown with Ctrl+C and wait for exit. Disable any automatic restart during recovery. Confirm that the relevant host and its serving/bundling children have fully exited and released the files. Closing the browser is not this step. Close the plugin tab while recovering so it cannot continue using the old page.
2. Use the repository path once. Confirm the junction target still matches it and that the current directory state is exactly the reported state. The following PowerShell script refuses to overwrite an existing entry file. These are recovery commands for the maintainer's real installation, not commands executed against this fixture:

```powershell
$repoLib = 'E:\dev\dsh-attach-input\lib'
$entries = @('client.js', 'index.js')
foreach ($entry in $entries) {
    $live = Join-Path $repoLib $entry
    $saved = Join-Path $repoLib ($entry + '.old2')
    if (Test-Path -LiteralPath $live) {
        throw "Unexpected existing entry: $live; inspect before proceeding."
    }
    if (-not (Test-Path -LiteralPath $saved -PathType Leaf)) {
        throw "Missing recovery file: $saved; stop and inspect."
    }
}
Rename-Item -LiteralPath (Join-Path $repoLib 'client.js.old2') -NewName 'client.js'
Rename-Item -LiteralPath (Join-Path $repoLib 'index.js.old2') -NewName 'index.js'

node --check (Join-Path $repoLib 'client.js')
if ($LASTEXITCODE -ne 0) { throw 'client.js syntax check failed; do not activate.' }
node --check (Join-Path $repoLib 'index.js')
if ($LASTEXITCODE -ne 0) { throw 'index.js syntax check failed; do not activate.' }

Get-ChildItem -LiteralPath $repoLib
Get-ChildItem -LiteralPath 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'
```

3. Confirm both listings show `client.js` and `index.js`. Review their contents to confirm the intended hover-preview and read-only route edits survived; `.old2` is the renamed content, not proof of a particular version. Syntax checks validate parsing only. On any rename or syntax error, keep the host stopped and resolve the actual state before activation.
4. Activate in the order below. Do not build, copy, install, or rename anything else. The fixture does not include actual JavaScript contents, so neither syntax checks nor feature verification can be executed here.

## Ordered activation after recovery or future repository edits

1. Pre-flight the install mode as below. For a linked lib-only plugin, work in the repository. Before file changes that encounter locks, fully stop the relevant dsh host and children; do not try rename-aside as a lock bypass.
2. Save the intended edits (or finish the recovery above), inspect the entry files, and run `node --check` on both. There is no build output to deploy.
3. Ensure the old dsh Web host is fully stopped, then start a fresh host with the same Web profile and the installation's established launch method. A browser restart alone is insufficient. The pack does not supply an exact launch command, so none is invented here. Check startup logs for successful plugin loading and no missing-entry, syntax, or route-registration errors.
4. Once the host is ready, reopen the browser tab and perform a cache-bypassing hard refresh (Ctrl+Shift+R in a Chromium browser, or DevTools Network: Disable cache, then reload). This replaces the page's old JavaScript execution context and fetches current client assets. Restarting the entire browser application is normally unnecessary; reopening/reloading the page after the host restart is the needed browser-side step. Merely closing and reopening a tab does not guarantee HTTP-cache bypass.
5. Verify the served code, not just the version label: inspect the actual client asset response in Network/Sources for a distinctive piece of the hover-preview implementation, and ensure it was fetched with cache bypass. Check the browser console for errors; hover an image attachment and confirm the preview appears. Exercise the newly added read-only host route using its actual path from `lib/index.js`, inspect its expected response, and check host logs. The route path and expected payload are absent from the fixture and must not be guessed. Successful startup alone and a package version alone do not prove that the new client code loaded.

## Pre-flight before touching files

Run these read-only checks on the real installation first:

```powershell
$profile = 'C:\Users\me\.dsh\profiles\web'
$pluginEntry = Join-Path $profile 'node_modules\@org\dsh-attach-input'
Get-Item -LiteralPath $pluginEntry -Force | Select-Object FullName, LinkType, Target
Get-Item -LiteralPath 'E:\dev\dsh-attach-input' -Force | Select-Object FullName, LinkType, Target
Get-Content -LiteralPath (Join-Path $profile 'cordis.patch.yml') |
    Select-String -SimpleMatch 'dsh-attach-input'
```

Resolve and compare any link target to the repository, and cross-check the install marker. A Junction or symbolic link to the repo means the repo IS the installed copy. An ordinary directory with no repo-targeting link and a dependency install record can indicate a copied dependency; inspect parent links and resolve inconsistencies before deciding that two directories are independent. An install comment alone is not stronger than the actual filesystem target.

Only a genuinely independent copied installation calls for its supported update/install workflow. Generic “copy into node_modules” advice is actively harmful here because it treats two aliases for one source tree as independent source and destination. The safe linked workflow is repository edit, syntax validation, complete host restart, browser cache bypass, and runtime verification.

## Scope and completion

This report used only the cell instruction and its four fixture files. No skills, network, installations, migrations, runtime restarts, fixture edits, grading, or verification harnesses were used. No blocker prevents the static diagnosis and recovery plan. Live process identification, syntax validation, and successful feature activation remain unverified because this evidence pack contains transcripts only; all operational commands above are proposed maintainer actions, not claimed results.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.