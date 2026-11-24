# S14 — linked-plugin activation and safe recovery

Mode A: read-only diagnosis. BENCHMARK-AUTH-v1 authorizes this report. No installation, migration, process termination, fixture edit, or recovery command was executed. Commands below describe the maintainer's real machine, using paths recorded in the evidence; they are not commands to run against the static fixture.

## Completed: installation identity and cause

The package is `@org/dsh-attach-input`, version `0.2.11` according to `fixture/maintainer-thread.md`. It is a lib-only Web plugin: `lib/client.js` and `lib/index.js` are shipped directly, with no build step. The feature adds attachment hover preview and a read-only host route.

`fixture/profile-introspection.txt` explicitly reports:

```text
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
```

The repository itself has blank LinkType and an empty Target. The profile composition supplies corroborating installation provenance:

```yaml
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

This is a linked installation, not a second installed copy. Traversing the profile junction reaches the repository tree. Editing the repository already changes the installed files on disk, but it does not replace code cached in a running process. Copying the repo files into this profile's node_modules was never the right deployment step: the proposed source and destination are aliases of the same files. It adds no deployment and risks destructive operations on the only source tree. Do not unlink, reinstall, copy, or rewrite the profile to solve this incident.

## The two locks and their owners

1. **Runtime/cache lock:** the running `dsh web` host serves the client bundle. Its boot-time client-bundle cache can continue serving pre-edit bytes, and its loaded `index.js` implementation and registered route closures remain the old implementation until host restart. A browser refresh contacts that same running server and cannot refresh its module state. This explains why repo edits did not produce the preview. The browser also has its own cached resources and an already-executing client module; even after a host restart, an open page that reconnects may keep running the old client.
2. **Windows file lock:** the running DSH host, not the browser tab, owns the relevant open handles on the loaded plugin files/module-serving resources. `fixture/copy-session.txt` records the in-use IOException and its persistence after closing the tab. Closing the browser only closes a client connection; it neither exits the server nor releases the server's handles. Fully stop the host processes using this installation to release them. Do not kill all Node processes indiscriminately.

These explanations are supported by `skills/plugin-upgrade/references/troubleshooting.md` (Windows EBUSY and link/junction rows) and `references/v0.1.7-alpha.2.md`, card **DSH-0.1.7-A2-04** (boot-time bundle caching and automatic reconnect). The fixture has no PID/handle inventory or host version, so this is process-role attribution, not a claim to have measured a particular PID or exact host cache implementation here. The card supplies activation guidance, not evidence that this fixture runs alpha.2.

## Why both directories lost their entry files

In `fixture/copy-session.txt`, `$dst` points through the junction. Renaming `$dst\client.js` to `client.js.old2` therefore renames `E:\dev\dsh-attach-input\lib\client.js` itself. The same applies to `index.js`. The next copy reads the original repository filenames, which no longer exist. Both listings show the same two `.old2` files because both listings inspect the same directory. The contents were renamed, not shown to have been deleted. Rename-aside does not create a separate backup or a second source. Windows allowing these renames does not prove that the host has exited or released every relevant handle.

## Recovery from the recorded broken state

Use an external PowerShell terminal. First fully stop the DSH host serving this Web profile, including any launcher/service that would immediately respawn it and any other DSH process using this linked package. Use its owning terminal's normal shutdown; confirm the old process tree has exited and its Web listener is gone. If anything remains, identify the owning PID/profile before stopping it. Stopping before recovery avoids further lock contention and partially restored entrypoints being loaded.

Then restore names **once, via the repository path**, with no force-overwrite:

```powershell
$pluginLib = 'E:\dev\dsh-attach-input\lib'
foreach ($entry in @('client.js', 'index.js')) {
    $live = Join-Path $pluginLib $entry
    $saved = Join-Path $pluginLib ($entry + '.old2')
    if (Test-Path -LiteralPath $live) {
        throw "Unexpected existing entry: $live. Inspect before proceeding."
    }
    if (-not (Test-Path -LiteralPath $saved -PathType Leaf)) {
        throw "Missing recovery file: $saved"
    }
}
Rename-Item -LiteralPath (Join-Path $pluginLib 'client.js.old2') -NewName 'client.js' -ErrorAction Stop
Rename-Item -LiteralPath (Join-Path $pluginLib 'index.js.old2') -NewName 'index.js' -ErrorAction Stop
node --check (Join-Path $pluginLib 'client.js')
if ($LASTEXITCODE -ne 0) { throw 'client.js syntax check failed; keep host stopped' }
node --check (Join-Path $pluginLib 'index.js')
if ($LASTEXITCODE -ne 0) { throw 'index.js syntax check failed; keep host stopped' }
```

Confirm both paths now show `client.js` and `index.js`, inspect restored contents for the intended hover-preview and route changes, and retain a separate recovery snapshot before any subsequent edits. Syntax checks parse without executing the plugin, but do not prove API compatibility. If either rename fails, inspect the resulting filenames before taking further action; do not repeat a destructive recovery sequence. If checks fail, preserve the files and diagnose while the host stays stopped. No evidence supports restoring or replacing `package.json`; the reported copy error is not evidence that it was renamed or lost.

## Ordered activation after recovery or later repo edits

1. Establish the installation identity using the pre-flight below. For this lib-only junction install, edit the repository's shipped `lib` files directly; no build, package-manager install, or deployment copy is required.
2. Fully stop the relevant DSH host process tree from an external terminal, and verify exit. For the present broken state, do this before the recovery renames above. For later edits, stopping before touching locked files avoids this same failure.
3. Finish edits or restore `.old2` names; run both `node --check` commands and inspect the intended changes. Do not start with either entry missing or invalid.
4. Start a fresh `dsh web` instance with the same existing home/profile and original launch options. Verify the new host PID/start time and listener belong to the intended profile. A browser reload, plugin-page toggle, or automatic reconnect is not a host restart.
5. After host startup completes, perform a browser hard reload (`Ctrl+Shift+R` or `Ctrl+F5`), or reload with DevTools network cache disabled. This forces retrieval of the newly served `client.js`/combo and replaces the page's old executing module. Merely closing and reopening a tab can reuse cached resources. The browser process itself need not fully exit; the host must fully stop and restart, and the page must reload with cache bypass.
6. Verify both planes: inspect the startup activation result for the expected package/profile and no failed/pending entry; inspect the boot-advertised client artifact/combo URL in browser Network and search its response for a distinctive piece of the new hover-preview code. Check that the client plugin registers/mounts with no relevant console errors. A version string unchanged at `0.2.11`, HTTP 200 alone, or a responsive page is insufficient evidence.
7. Exercise an image attachment hover and verify the actual preview. Exercise the new read-only host route through the intended UI/request and check its expected response and absence of route-not-found errors. The fixture supplies no route URL, so no endpoint is invented here. Successful client behavior and the new host route together prove both `client.js` and `index.js` changes activated.

## Pre-flight before touching files

Run read-only inspection of the actual profile entry and its composition first:

```powershell
$pluginEntry = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input'
Get-Item -LiteralPath $pluginEntry -Force | Select-Object FullName, LinkType, Target, Attributes
Get-Item -LiteralPath 'E:\dev\dsh-attach-input' -Force | Select-Object FullName, LinkType, Target
Select-String -LiteralPath 'C:\Users\me\.dsh\profiles\web\cordis.patch.yml' -Pattern 'dsh-attach-input'
```

Resolve any link targets/chains before comparing source and destination. `Junction` plus this Target proves shared directory identity; the `link:` marker corroborates intent but is not a substitute for filesystem inspection. If an entry has no direct LinkType, inspect real resolution and installation metadata too, since parent links/package-manager layouts can still redirect paths. Only after establishing a genuinely separate dependency copy should an appropriate package-manager-managed update procedure be considered. Generic “copy into node_modules” guidance is actively harmful here: apparent deployment and recovery operations mutate the source itself.

## Validation, limits, and rollback

- **Pre-existing:** no mechanical baseline collected. Recorded incident failures are stale UI, file-in-use errors, and missing entry filenames; these preceded this report.
- **Completed:** reviewed all four fixture documents and the skill; established link identity, explained both locks, and supplied recovery and activation steps. Relevant references read: pre-flight inventory, troubleshooting rows, DSH-0.1.7-A2-04, and the v0.1.3-alpha.1 junction/no-sync verification notes.
- **Skipped:** installs, builds, dependency/host upgrades, version-corridor migration, and runtime helper scripts. This is a static evidence pack, not an executable repository or live profile, and the request forbids installations/migrations. No version bump or profile edit is warranted.
- **Pending/residual risk:** actual restoration, syntax results, handle ownership inspection and runtime smoke verification remain for the real installation. Git SHA, remote URL, dependency cohort/lockfile, host/Node versions and source contents were not supplied; none are guessed. No blocker prevents this report, but these facts cannot be verified from the fixture.
- **Rollback/recovery baseline:** the two `.old2` files are the recorded surviving artifacts. Restore their names without overwriting new work. They preserve the edited content; they are not proven to be a previous good release. A feature rollback would require an independently identified backup or reviewed diff and must preserve unrelated edits. The junction and profile configuration need no rollback because this report changes neither.
- **Recommendation:** make installation-mode inspection and separate host/client verification mandatory before future linked-plugin activation.
