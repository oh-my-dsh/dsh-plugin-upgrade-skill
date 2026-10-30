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
#### FILE: report.md

# S14 · Link-Install File-Lock Trap — Diagnosis, Recovery & Activation Report

**Plugin**: `@org/dsh-attach-input` v0.2.11 — lib-only Web plugin (no build step; shipped files `lib/client.js` + `lib/index.js`).
**Evidence (read-only, unchanged)**: `fixture/profile-introspection.txt`, `fixture/copy-session.txt`, `fixture/maintainer-thread.md`, `fixture/README.md`.
**Skill basis**: `skills/plugin-upgrade` (Mode A · inspect — analysis and report only; no migration or install executed).
**Scenario**: repo edit (hover-preview feature in `lib/client.js` + a new read-only host route in `lib/index.js`) → browser refresh showed nothing → `Copy-Item` into the profile's `node_modules` hit EBUSY even after closing the browser tab → rename-aside "recovery" left **both** directories with only `client.js.old2` / `index.js.old2`.

---

## 1. What the profile entry actually is — and what "deploy" means for a Junction install

Introspection (`profile-introspection.txt`):

```
PS> Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input | Select FullName, LinkType, Target
FullName : C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input
LinkType : Junction
Target   : {E:\dev\dsh-attach-input}

PS> Get-Item E:\dev\dsh-attach-input | Select FullName, LinkType, Target
FullName : E:\dev\dsh-attach-input
LinkType :                 # empty — this end is the real directory
Target   : {}

PS> Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
  - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)
```

**What it is.** The profile entry is a **Junction** whose `Target` is the repo working tree `E:\dev\dsh-attach-input`; the empty `LinkType` on `E:\dev\dsh-attach-input` proves which end is the real directory. A Windows junction is a filesystem-level directory alias: every path under `node_modules\@org\dsh-attach-input` resolves to the **same physical directory and files** as `E:\dev\dsh-attach-input`. The profile composition carries an explicit install marker: `# link:E:\dev\dsh-attach-input (installed 2026-08-30)`.

**Deployment semantics.** For a link/junction install, **the repo tree IS the installed copy**. Editing `E:\dev\dsh-attach-input\lib\client.js` *is* editing `...\node_modules\@org\dsh-attach-input\lib\client.js` — one file, two names. There is nothing to sync, copy, or "put into `node_modules`"; the profile can never be stale *on disk* (only the running processes and caches can be stale). The skill records the same semantics: `DSH-0.1.3-A1-07` verification — "plugins load from the unchanged profile (junction installs need no sync)".

**Was Copy-Item ever the right move for THIS install mode? No — never.** `Copy-Item E:\dev\dsh-attach-input\lib\*.js ...\node_modules\@org\dsh-attach-input\lib\` copies each file **onto itself** through the junction. At best a no-op; in practice it is the entry point to every later mistake. "Copy into `node_modules`" is advice for a **copied dependency** (an independent second tree that the host loads from); for a link install the load path *is* the repo, so the only correct actions after an edit are process restarts and a cache-bypassed browser refresh (§4).

## 2. The two locks and their owners

**Lock A — stale code (browser refresh showed nothing new).**

- **Who serves the client bundle**: the **running dsh host process** (`dsh web`) — its HTTP server serves the Web Client page and each plugin's client bundle; the browser only renders and caches what the host serves. Nothing in this chain is owned by the browser tab alone.
- Since `DSH-0.1.7-A2-04` the host **reads and caches client bundles at boot**: "editing a served `lib/client.js` on disk NO LONGER takes effect on page refresh alone; only a host restart serves the new bytes". The refresh-only verification therefore *by design* reports pre-edit content.
- The host half is stricter still: `lib/index.js` (the new read-only route) is registered once at apply/boot; the running process keeps the old registrations/closures until restart (client-vs-host plane asymmetry row in `references/troubleshooting.md`). So the missing feature and the 404 route are two faces of the same cause: the host process predates the edit.
- Related trap in `DSH-0.1.7-A2-04`: after a server restart an open page **auto-reconnects** and may keep working while running pre-restart client bytes — "the page responds" is not proof of new code; verify the served bytes (§4 step 5).

**Lock B — EBUSY on every write attempt (`Copy-Item -Force`, even after closing the tab).**

- **Owner: the same running dsh host process**, which holds `lib/client.js` / `lib/index.js` (and `package.json`) open as its loaded plugin entry and served artifact (the skill's EBUSY troubleshooting row: the running `dsh web` host holds loaded file handles — real case `koffi.node` locked by the host PID).
- **The browser tab never held a filesystem handle** on these files at all — it holds an HTTP-cached/in-memory copy of the served bundle. Closing the tab can therefore not release a lock the tab never owned. The EBUSY persisted because the host kept running. Attribution (EBUSY row): *the file lock is in the host, not the browser* — only a full host stop releases it.

## 3. Why the rename-aside trick destroyed the SOURCE — and the exact recovery

**Mechanics** (`copy-session.txt`):

1. `$dst = 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'` is **the repo's `E:\dev\dsh-attach-input\lib` seen through the junction** — one physical directory under two names.
2. `Rename-Item ($dst + '\client.js') 'client.js.old2'` therefore renamed the repo's only `client.js`. The "locked destination file" and "the source file" were the same file; renaming aside moved the **only** copy.
3. `Copy-Item 'E:\dev\dsh-attach-input\lib\client.js' ($dst + '\client.js')` then failed **"Cannot find path ... because it does not exist"** — its source had just been renamed away one line earlier. Nothing was copied, so no replacement `client.js` / `index.js` ever appeared.
4. Both `Get-ChildItem` listings show only `client.js.old2` + `index.js.old2` because both paths enumerate **one** directory. The plugin now has no entry files at all — the direct consequence of treating a link install like a copied install.

No data was lost: the `.old2` files are the originals *renamed*, not copies.

**Exact recovery from the current state** (restore names → verify syntax → activate). Rename **once** via either path — they are the same directory; never copy between them:

```powershell
# 0) If a rename is refused (EBUSY) the host still holds handles — stop the dsh web host first.
$lib = 'E:\dev\dsh-attach-input\lib'    # or the node_modules path — SAME directory
Rename-Item (Join-Path $lib 'client.js.old2') 'client.js'
Rename-Item (Join-Path $lib 'index.js.old2')  'index.js'

# 1) Verify the names are back (identical listing through either name)
Get-ChildItem $lib
Get-ChildItem 'C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input\lib'

# 2) Verify syntax (lib-only bundle; there is no build step)
node --check (Join-Path $lib 'client.js')
node --check (Join-Path $lib 'index.js')
```

Then activate per §4: **fully stop the host → restart `dsh web` → browser hard refresh**. This matches the recovery order in the S14 troubleshooting row: restore the original names → `node --check` → stop the host completely → restart `dsh web` → hard-refresh the browser.

## 4. Complete, ordered activation procedure (link-installed, lib-only Web plugin, after repo edits)

0. **Pre-flight (§5)** — confirm link/junction mode ⇒ **zero file movement**. The repo edit *is* the deployment.
1. **Edit the repo files** in `E:\dev\dsh-attach-input` (the single source of truth). Optional static gate: `node --check lib\client.js` + `node --check lib\index.js` (lib-only: no build/bundle step exists, so no rebuild is missing).
2. **Fully stop the host.** Stop every `dsh web` host process serving this profile and confirm none remains (process list; port free). A browser refresh, reload, or closing the tab is **not** a host stop. The host must stop because it (a) owns the file handles (§2 Lock B), (b) caches client bundles at boot (`DSH-0.1.7-A2-04`), (c) registers the host half only at apply (the new read-only route in `lib/index.js`).
3. **Restart `dsh web`** (same profile). Boot re-loads `lib/index.js` (host half) and reads/caches the new `lib/client.js` bytes. **Host restart strictly precedes the verification refresh.**
4. **Browser hard refresh** — Ctrl+Shift+R / Ctrl+F5 (cache bypass) for `client.js`. A normal refresh may replay the browser's cached bundle, and per `DSH-0.1.7-A2-04` the page auto-reconnects across a restart while still executing pre-restart client bytes.
5. **Verify the new code actually loaded** (prove content + registration, not "the page responds"):
   - *Client half*: exercise the hover-preview on an image attachment; fetch the host boot manifest's advertised client artifact (combo URL) and assert a **marker string unique to the new edit** appears in the served bytes (the `DSH-0.1.7-A2-04` verification recipe: "fetch the combo URL and inspect"); the console must show the plugin **registered/mounted** — a bare HTTP 200 is not proof (skill validation layer 4).
   - *Host half*: call the new read-only route and assert its response; `dsh --profile web --dump-config` (or a staging instance `dsh --profile web --port 30xx`, per the rollup verification recipe) shows the row active with nothing pending.
   - *If anything still looks stale*: confirm the process you restarted is the one serving this profile (a running host keeps executing pre-edit code while disk reports new — ghost-host note, `references/pre-flight.md` §1.5), and that the browser cache was genuinely bypassed.

## 5. Pre-flight: determine the install mode BEFORE touching any file

```powershell
# (1) Profile entry: link or copied dependency?
Get-Item C:\Users\me\.dsh\profiles\web\node_modules\@org\dsh-attach-input |
  Select-Object FullName, LinkType, Target
#   LinkType Junction/SymbolicLink + Target => LINK install (repo tree = installed copy)
#   LinkType empty + its own children      => COPIED install (independent second tree)

# (2) Install marker in the profile composition
Get-Content C:\Users\me\.dsh\profiles\web\cordis.patch.yml | Select-String dsh-attach-input
#   - node_modules/@org/dsh-attach-input  # link:E:\dev\dsh-attach-input (installed 2026-08-30)

# (3) Dependency track in the profile's package.json: "link:<absolute path>" vs a registry version;
#     pnpm creates exactly this junction for a link: dependency (rollup-0.1.2 install-channel recipe).
```

- The skill says it directly: shared preparation step 2 / `references/pre-flight.md` §0 — record the **actual install track** (registry package, Git checkout, workspace/junction, or copied install) *first*, keeping source identity and installation identity separate. Only then may a plan touch files.
- Expectation check: `DSH-0.1.6-A2-03` — link-installed plugins stay **outside** the Plugin Manager's bundle management (not in `dsh.profile.bundles` / the pnpm lockfile, "changes apply … otherwise at restart"). That is normal for the link track, not a defect to fix by copying files in.
- **Why the generic "copy into `node_modules`" advice is actively harmful for link installs**: on a copied track it means "put the new bytes where the host loads from"; on a link track that destination *is the source file itself*. Applied blindly it (a) degenerates to a self-copy no-op, (b) makes rename/restore semantics operate on the only copy — as here, ending with **zero** entry files, (c) destroys the rollback baseline (the "old" and "new" trees were never two trees), (d) violates package-manager ownership of `node_modules`. The correct link-install actions after an edit are exactly three: stop the host fully → restart `dsh web` → hard-refresh the browser.

## Cross-references (key points and IDs only)

| Ref | Point used |
|---|---|
| `DSH-0.1.7-A2-04` | Client bundles cached at host boot ⇒ a served `lib/client.js` edit needs a **host restart**; pages auto-reconnect on pre-restart bytes; verify the served combo bytes, not the page response |
| `DSH-0.1.3-A1-07` | Junction installs need no sync; plugins load from the unchanged profile |
| `DSH-0.1.6-A2-03` | Link-installed plugins stay outside Plugin Manager bundle management (expected) |
| `troubleshooting.md` · S14 row | Junction self-rename destruction; recovery order: restore names → `node --check` → full host stop → restart → hard refresh |
| `troubleshooting.md` · EBUSY row | File locks belong to the running `dsh web` host process, not the browser; stop the host before file replacement |
| `rollup-0.1.2.md` · install channel | `link:` dependency creates the junction via pnpm; verification on a staging instance |
| `pre-flight.md` §0 / SKILL.md prep #2 | Record install track before touching anything; source vs installation identity |

## run-stats

- **toolcalls 总数**: 14（run_code ×13 + send_message ×1；内层工具调用 read ×9、glob ×1、grep ×1、write ×3）
- **token 用量**: n/a（本 harness 不暴露 token 计数）
- **完成时间**: 2026-10-21T15:09:20 +08:00（Asia/Shanghai；任务开始采样 2026-10-21T15:00:41+08:00）


#### FILE: tool-transcript.txt

1. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. run_code[tools.glob] pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap
3. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\README.md
4. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\profile-introspection.txt
5. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\copy-session.txt
6. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\maintainer-thread.md
7. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.7-alpha.2.md
8. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
9. run_code[tools.grep] pattern=junction|LinkType|link install|link-installed path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade include=*.md
10. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.3-alpha.1.md offset=265 limit=65
11. run_code[tools.read] E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md offset=25 limit=40
12. run_code[tools.write] E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\agent-output\report.md（S14 诊断报告正文，含 run-stats）
13. run_code[tools.write] E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\agent-output\tool-transcript.txt 与 E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\agent-output\transcript-manifest.txt
14. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（自包含结果汇报给父代理）


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\profile-introspection.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\copy-session.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\fixture\maintainer-thread.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.7-alpha.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.3-alpha.1.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S14-link-install-lock-trap\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.