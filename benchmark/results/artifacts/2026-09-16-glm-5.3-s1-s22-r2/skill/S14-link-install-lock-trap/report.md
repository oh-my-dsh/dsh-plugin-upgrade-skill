# S14 · Link-Install File-Lock Trap — Diagnostic Report

**Mode:** A · inspect (read-only; plugin-upgrade skill). No files outside the designated
output directory were modified; no migration or installation was executed.

**Evidence used (read-only):**
- \`fixture/profile-introspection.txt\` — \`Get-Item\` LinkType/Target on the profile entry and the repo, plus the \`cordis.patch.yml\` line.
- \`fixture/copy-session.txt\` — EBUSY \`Copy-Item\` transcript and the rename-aside attempt.
- \`fixture/maintainer-thread.md\` — the maintainer's step-by-step account.

---

## 1. What the profile entry actually is

Cited introspection (\`profile-introspection.txt\`):

\`\`\`
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}
\`\`\`

and the repo directory itself is a real directory (\`LinkType\` empty, \`Target : {}\`).
The profile's \`cordis.patch.yml\` confirms it with the install marker:

\`\`\`yaml
- node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
\`\`\`

**This is a link (junction) install, not a copied dependency.** The profile's
\`node_modules\@org\dsh-attach-input\` is not a copy of the repo — it is *the same directory*
as \`E:\dev\dsh-attach-input\`, reached through an NTFS junction. Every write "in the profile"
lands in the repo tree and vice versa.

**Deployment consequence:** editing \`lib/client.js\` / \`lib/index.js\` in the repo *is* the
deployment. There is no copy, publish, or sync step. Step 4 of the maintainer thread
(\`Copy-Item\` from the repo into the profile's node_modules) was **never the right move for
this install mode** — it was literally copying \`E:\dev\dsh-attach-input\lib\*.js\` onto
themselves through a second path to the same directory. That advice applies only to copied
(registry-extracted) installs.

## 2. The two locks and their owners

Two separate staleness/lock effects, both owned by the **running dsh host process**, not the
browser:

1. **Stale code after a browser refresh — host serves the client bundle.** The Web client
   artifact \`client.js\` is served to the browser by the running \`dsh web\` host process
   (HTTP at the GUI origin). More importantly, the host loaded the plugin's Host half
   (\`lib/index.js\`) into its Node process at boot. A browser refresh only re-requests what
   the *still-running host* serves/cached; the host never restarted, so the old code was
   still what the host had in memory. Hence "old behavior, no preview."
2. **EBUSY on the lib files — the dsh host holds them open.** The running host process has
   the plugin's entry files open/loaded (\`client.js\`, \`index.js\`, \`package.json\` all named
   in the transcript). On Windows, an open handle with no share-delete/in-place-write
   compatibility makes \`Copy-Item -Force\`'s overwrite fail with "being used by another
   process." **Closing the browser tab releases nothing** because the browser never held
   these file handles — the files live on the host's disk and the *host process* owns the
   handles. Only fully stopping the \`dsh web\` host process releases the EBUSY.

## 3. Why the rename-aside trick destroyed the source too — and the exact recovery

Because both paths resolve to the **same physical directory through the junction**,
\`Rename-Item ($dst + '\client.js') 'client.js.old2'\` renamed the *repo's* \`client.js\`.
After both renames, \`E:\dev\dsh-attach-input\lib\` no longer contained \`client.js\` /
\`index.js\`, so the follow-up \`Copy-Item E:\dev\dsh-attach-input\lib\client.js ...\` correctly
failed with "source does not exist." The transcript's twin \`Get-ChildItem\` listings show
both "directories" containing only the \`.old2\` files — one directory, two views.

**Exact recovery from the current state** (only \`client.js.old2\` / \`index.js.old2\` exist):

1. Fully stop the dsh host (\`dsh web\`) so no file handles interfere; close the browser tab
   as well (optional but tidy).
2. In **either** path (they are the same directory), rename the files back:
   \`\`\`powershell
   $lib = 'E:\dev\dsh-attach-input\lib'   # == the profile path through the junction
   Rename-Item "$lib\client.js.old2" 'client.js'
   Rename-Item "$lib\index.js.old2"  'index.js'
   \`\`\`
   (Windows file-rename back to the original names is permitted even while a handle is
   open in most cases, but stopping the host first avoids surprises.)
3. Verify syntax of both restored files before activating:
   \`\`\`powershell
   node --check E:\dev\dsh-attach-input\lib\client.js
   node --check E:\dev\dsh-attach-input\lib\index.js
   \`\`\`
   Both must parse cleanly. The \`.old2\` content is the *edited* (hover-preview) version —
   the maintainer edited the repo files, which were then renamed — so the feature code is
   intact and nothing was lost except the file names.
4. Confirm no stray duplicates remain (\`Get-ChildItem $lib\` shows exactly \`client.js\`,
   \`index.js\` plus any other shipped files), and that \`package.json\` is untouched.
5. Re-attempt NO copy step — the junction deploys the repo tree as-is.

## 4. Complete, ordered activation procedure for a link-installed lib-only Web plugin

1. **Edit the repo files** (\`lib/client.js\`, \`lib/index.js\`) — already done. That is the
   whole "deploy" for a link install.
2. **Fully stop the \`dsh web\` host process** (not a browser refresh, not a tab close —
   the host *process* must exit). This releases the file locks and discards the old
   in-memory Host-half module (\`index.js\`).
3. **Restart \`dsh web\`** from the profile. The host cold-loads \`lib/index.js\` (new
   host route) and begins serving the new \`client.js\` artifact.
4. **Hard-refresh the browser (cache bypass, e.g. Ctrl+F5 / Ctrl+Shift+R).** The client
   bundle is fetched over HTTP and the browser may serve a cached \`client.js\` even after
   the host restarted — a normal refresh can revalidate to a cached copy; a cache-bypassing
   reload forces a fresh fetch of the new bundle. This is why stale code can persist *even
   after* a correct host restart.
5. **Verify the new code actually loaded:**
   - Check the served artifact: fetch the client bundle URL (e.g. via the host's client
     artifact route or DevTools → Network → \`client.js\` → Response) and confirm a marker
     from the hover-preview feature is present.
   - Functional check: hover an image attachment and observe the new preview; exercise the
     new read-only host route and confirm it answers.
   - Host-side: confirm in the host boot/registration output that the plugin's entry is
     active and its provided services are not pending (per the skill's runtime-validation
     layer — registration/mount, not a bare HTTP 200).

Ordering summary: **edit repo → stop host → start host → hard refresh browser → verify.**
The browser step comes last because the new bundle only exists once the restarted host
serves it.

## 5. Pre-flight check before touching any file

Determine the **install mode from the profile itself**, before any copy/rename:

\`\`\`powershell
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
\`\`\`
- \`LinkType: Junction\` (or \`SymbolicLink\`) with \`Target\` → **link install**: the repo tree
  IS the installed copy; never copy into it; activation is host restart + hard refresh.
- \`LinkType\` empty (plain directory) → **copied dependency**: copying/ reinstalling into
  node_modules is the applicable (package-manager-owned) mechanism.

Corroborate with the profile composition marker:

\`\`\`powershell
Select-String -Path C:\Users\me\.dsh\profiles\web\cordis.patch.yml -Pattern 'dsh-attach-input'
#   - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
\`\`\`
The \`# link:<repo>\` comment is the explicit link-install marker recorded at install time.

**Why generic "copy into node_modules" advice is actively harmful here:** for a link
install it copies the repo onto itself (guaranteed EBUSY while the host runs, pointless
even when it doesn't), and any "workaround" for that EBUSY — rename-aside, delete-then-copy,
hand-syncing one side — mutates the *source repository* through the junction. It can, and
here did, destroy the repo's entry files. The correct response to "refresh shows stale
code" on a link install is *restart the host and hard-refresh the browser*, never a file
copy.

---

## Report structure per skill

- **Pre-existing (baseline):** not collected — read-only diagnosis of a static evidence
  pack; no repository build/test run was permitted or needed.
- **Completed:** identification of the Junction link install (introspection + cordis.patch.yml
  marker); lock attribution to the running dsh host (client-bundle serving + open handles);
  root cause of the rename-aside destruction (single directory, two paths); exact recovery
  (stop host → rename \`.old2\` back → \`node --check\` → activate); full ordered activation
  procedure; pre-flight install-mode check.
- **Skipped:** none of the five requested questions skipped; no external verification
  (network, publishing) per task rules.
- **Pending/residual risk:** recovery steps are prescribed from the transcript, not
  executed (fixture is read-only and this environment is not the maintainer's machine);
  the \`.old2\` files are assumed to contain the maintainer's edited feature code, which the
  transcript supports (edits were made in the repo before the renames).
- **Rollback / prevention:** after restoring names, consider version-controlling the repo
  (\`git status\` would have caught the renames instantly) and always running the LinkType
  pre-flight before any node_modules write.
- **Recommendations:** keep the \`# link:\` marker convention in \`cordis.patch.yml\` (it made
  the install mode discoverable); for copied installs, use the profile's package manager
  rather than manual \`Copy-Item\` (skill Mode B rule: single mechanism matching the
  resolved package identity).
