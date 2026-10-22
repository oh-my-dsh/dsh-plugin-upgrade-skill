# S14 · Link-Install File-Lock Trap — Analysis & Recovery Report

Plugin: \`@org/dsh-attach-input\` v0.2.11 (lib-only Web plugin, no build step)
Evidence: \`fixture/profile-introspection.txt\`, \`fixture/copy-session.txt\`, \`fixture/maintainer-thread.md\`

---

## 1. What the profile entry actually is — and what it means for "deployment"

The introspection settles it (\`fixture/profile-introspection.txt:1-5\`):

\`\`\`
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
\`\`\`

The repo directory itself is a plain directory (\`LinkType\` empty, \`Target\` empty — same file, lines 7-11), and the profile's own ledger records the install mode: \`cordis.patch.yml\` contains \`- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)\` (lines 13-14).

**Deployment semantics of a Junction install:** a junction is a directory reparse point — the profile's \`node_modules\@org\dsh-attach-input\` and the repo \`E:\dev\dsh-attach-input\` are *two paths naming one and the same directory tree*. There is exactly one copy of every file. Therefore:

- **The repo tree IS the installed copy.** Editing \`lib/client.js\` / \`lib/index.js\` in the repo already "deploys" them to the profile. There is no copy/publish/build step for this install mode.
- **Copying repo files into the profile's \`node_modules\` was NEVER the right move here** (\`maintainer-thread.md:10-12\` assumed a copied install — that premise was false). At best it is a same-file self-copy that can never change a single byte; in practice it only collides with the host's open handles (EBUSY) and baits destructive workarounds. The correct pipeline is: edit in repo → restart the host → hard-refresh the browser. No deploy step exists.

## 2. The two locks and their owners

Both symptoms have the **same owner: the running dsh host process** (the Node.js process serving the profile), not the browser.

**(a) Why a browser refresh shows stale code.** The client bundle (\`lib/client.js\`) is served to the browser *by the dsh host*, and the host-side entry (\`lib/index.js\`) is loaded into the host's own module graph at startup. The files on disk changed the moment the maintainer saved them, but the running host never re-read them: it keeps serving/executing the code it loaded at boot. A plain browser refresh only re-requests content from the *still-running old host* (and may even be answered from the browser cache — see §4), so nothing new can appear (\`maintainer-thread.md:9\`: "refreshed the browser tab only — nothing changed").

**(b) Why EBUSY survived closing the browser tab.** On Windows, a file held open by a process cannot be overwritten in place. The open handles on \`lib\client.js\`, \`lib\index.js\` (and \`package.json\`) belong to the **host process** — it has the plugin's module loaded and/or the static file served through its own file handles/caches. The browser is a separate client at the other end of an HTTP socket; it holds no Windows file handles on the profile's files. Hence \`copy-session.txt:6-8\`: after the tab was closed, the retry hit the *same* IOException — closing a tab releases nothing, because the tab never held the lock. The lock is released only when the dsh host process fully exits.

Summary of attribution:

| Lock | Symptom | Owner | Released by |
|---|---|---|---|
| Stale code | refresh shows old behavior | running dsh host (old code in memory) + browser HTTP cache | host restart, then hard refresh |
| EBUSY | Copy-Item IOException | running dsh host (open file handles) | host process exit — *not* closing the browser |

## 3. Why rename-aside destroyed the SOURCE too — and the exact recovery

**Why both directories lost their files.** Because of the junction, \`$dst\client.js\` and \`E:\dev\dsh-attach-input\lib\client.js\` are the *same file*. \`Rename-Item ($dst + '\client.js') 'client.js.old2'\` (\`copy-session.txt:12\`) renamed the one underlying file — so the repo's \`client.js\` ceased to exist in the same instant. The follow-up \`Copy-Item 'E:\dev\dsh-attach-input\lib\client.js'\` then failed with "Cannot find path … because it does not exist" (\`copy-session.txt:14-15\`), and both listings show only \`client.js.old2\` / \`index.js.old2\` (\`copy-session.txt:16-22\`) — not because two directories coincidentally match, but because there is only one directory. The plugin now has no entry files anywhere.

**Exact recovery from the current broken state** (only \`client.js.old2\` / \`index.js.old2\` exist):

1. **Fully stop the dsh host** for the \`web\` profile (stop the \`dsh web\` process/job). This drops every file handle, so the renames cannot fail and no half-edited file can be served.
2. **Do NOT touch the junction entry itself.** Do not delete/replace/re-create \`node_modules\@org\dsh-attach-input\`; recover only the *filenames inside* it.
3. **Rename the files back**, in either path — they are the same directory; prefer the repo path for clarity:
   \`\`\`powershell
   Rename-Item E:\dev\dsh-attach-input\lib\client.js.old2 client.js
   Rename-Item E:\dev\dsh-attach-input\lib\index.js.old2  index.js
   \`\`\`
   (If \`package.json\` had also been renamed aside, restore it the same way — the EBUSY transcript hit it too, \`copy-session.txt:8\`.)
4. **Verify the tree**: \`Get-ChildItem E:\dev\dsh-attach-input\lib\` must show \`client.js\` and \`index.js\` and no leftover \`*.old2\`; \`Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select LinkType,Target\` must still report \`Junction → E:\dev\dsh-attach-input\`.
5. **Syntax-verify before starting anything**: \`node --check lib\client.js\` and \`node --check lib\index.js\` (these are the *edited* v0.2.11 contents — the rename-aside never overwrote them, so the feature code is intact inside the .old2 files).
6. **Activate** per §4.

## 4. Complete, ordered activation procedure (link-installed lib-only Web plugin, after repo edits)

1. **Edit** the plugin files in the repo (\`E:\dev\dsh-attach-input\lib\…\`). Deployment is already done — the junction makes the repo tree the installed tree.
2. **Static gate**: \`node --check\` every edited file.
3. **Fully stop the dsh host** (the \`dsh web\` process for this profile — Ctrl+C / stop its job; confirm the process is gone). This is the *only* process that must restart: it owns both locks (in-memory old code; open file handles). The browser does **not** need to be restarted or closed.
4. **Start the host again.** Only now does the host load the new \`index.js\` into its module graph and begin serving the new \`client.js\`.
5. **Hard-refresh the browser tab** (Ctrl+F5, or DevTools → Network → "Disable cache" then reload). This cache bypass is required specifically for \`client.js\`: the browser may hold the old bundle from its HTTP cache and would otherwise reuse it (or revalidate cheaply) *even against a freshly restarted host* — which is exactly how "host restarted but the page still shows old code" happens. A normal F5 is not a guarantee; a cache-bypassing reload is.
6. **Verify the new code actually loaded**, don't assume:
   - DevTools → Network: the \`client.js\` request returns **200 with the new body** (not 304/from-cache); the response contains a new marker (e.g. bump a \`// v0.2.11 hover-preview\` comment or a \`console.log('[attach-input] hover-preview v0.2.11')\` at module top and watch the console).
   - Exercise the feature: hover an image attachment and confirm the preview appears.
   - Confirm the new host side: request the new read-only host route and check its expected response.

## 5. The pre-flight check that must come before touching any file

**Determine the install mode from the profile first** — two probes, both read-only:

\`\`\`powershell
# Probe 1: reparse point?
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
#   LinkType Junction/SymbolicLink + non-empty Target  => LINK install (Target = the live repo)
#   LinkType empty                                     => copied dependency

# Probe 2: install ledger
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
#   "# link:E:\dev\dsh-attach-input" marker => link install, naming the source repo
\`\`\`

Both probes were available all along and answer the question in seconds (\`profile-introspection.txt\` is exactly these two probes, run *after* the damage).

**Why the generic "copy into node_modules" advice is actively harmful for link installs:** it assumes the profile holds an independent copy that must be synchronized. Under a junction there is no second copy — the "copy" is a self-copy onto the very files the host has locked, so it (a) can never change anything, (b) reliably trips EBUSY, and (c) baits escalation ("rename the locked file aside", "delete and re-copy", "replace the stubborn directory") that operates on *the repo itself* through the reparse point — which is how this session ended with both paths empty. For a link install the entire deploy model is **edit → restart host → hard-refresh**; any procedure containing a copy step is a category error.

---

### Condensed answers to the maintainer's questions (\`maintainer-thread.md:19-31\`)

1. Refresh showed nothing because the running host serves/runs the code it loaded at boot; EBUSY persisted because the lock owner is the host process, not the browser tab.
2. Junction + Target mean the repo tree *is* the installed copy — step 4's Copy-Item was never necessary and could never work for this install.
3. Rename-aside renamed the single underlying file (one directory, two paths), so the source vanished too; recovery = stop host, rename \`*.old2\` back in place, verify junction intact, \`node --check\`, then activate.
4. Activation: edit in repo → \`node --check\` → fully stop host → start host → hard-refresh (cache bypass for \`client.js\`) → verify via Network 200/new marker, feature behavior, and the new host route.
5. Pre-flight: \`Get-Item … | Select LinkType,Target\` plus the \`cordis.patch.yml\` \`link:\` marker; only a non-empty LinkType/absent marker distinguishes link from copy — and copied-install advice must never be applied to a link install.
