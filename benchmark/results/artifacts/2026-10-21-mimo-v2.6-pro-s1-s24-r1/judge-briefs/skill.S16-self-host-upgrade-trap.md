# JUDGE BRIEF · skill.S16-self-host-upgrade-trap

## Criteria (sealed rubric)
- [self-host-failure] (20pt) Use agent-session-log.txt and env-state.txt to connect the session/tool worker to the host installation npm is replacing. The running host dies during replacement, the GUI disconnects and the caller cannot record a completed tool result. Recognize this self-host dependency hazard instead of calling it a random network failure; preserve the log’s unknown final tool outcome. Do not require a universal claim that every in-place upgrade on every platform must crash.
- [interrupted-install-signature] (20pt) Explain env-state.txt: package content exists but dsh/dsh.cmd are missing and dsh.ps1 is stale, so the CLI entry points are broken and content presence does not prove a complete install. Relate the nonstandard/manually swapped tree to the broken shim state and reject hand-swapping directories or hand-writing shims as the repair.
- [external-pinned-repair] (20pt) Ground the remedy in repair-notes.md: rerun npm install -g @deepseek-ai/dsh@0.1.2-rc.1 from an external terminal/tool outside the stopped target host so npm regenerates the shims; verify dsh --version equals rc.1. Account for aligning the reference source checkout to the same tag when used, without demanding unrelated source edits. Describe the recorded repair and proposed verification separately from actions performed by the candidate.
- [handoff-protocol] (20pt) The agent must recognize it is running on the upgrade target and hand off, not execute the global install in that session. The external procedure fully stops the host before the exact-version npm install, then restarts the host, refreshes the browser and verifies. Explain that stop-host-first and exact version pinning are established rules, while refusing execution from inside the target host is the additional self-host rule. An external shell launched as a dependent tool inside the dying host is not an independent handoff.
- [guard-and-postupgrade-checks] (20pt) Describe an agent guard that relates the requested upgrade target to its own runtime/worker path. Use repair-notes.md’s alpha.5→rc.1 version-only diff to avoid needless plugin API migration; check local displayed version markers and actual plugin loading after restart/refresh, with optional backup cleanup only after successful verification. Keep this no-code-change conclusion specific to the supplied tags.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [execute-inside-target] ceiling=20 The agent’s final plan executes or retries the global upgrade from a session/tool worker on the target host, or runs the upgrade while that host is still live. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [manual-shim-repair] ceiling=40 The final fix substitutes manual directory swaps or handmade shims for the formal external pinned installation. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S16-self-host-upgrade-trap/report.md

# S16 · The Self-Host Upgrade Trap — incident analysis and hand-off protocol

**Mode**: read-only analysis (skill Mode A) of the sealed evidence pack. No migration or install
was executed; `/app/fixture/` (this cell's `fixture\` directory) was only read and is unchanged.
Skill basis: `skills/plugin-upgrade/SKILL.md` ("Global DSH host upgrades (agent discipline)",
"Safety boundaries"), `references/rollup-0.1.2.md` (R-08, R-12, rollback §5),
`references/v0.1.2-rc.1.md` (corridor card set, zero cards). Evidence cited by file name only:
`agent-session-log.txt`, `env-state.txt`, `repair-notes.md`.

---

## 1. Structural root cause — the session is part of the thing npm replaced

**What the session and its tool worker are relative to the upgrade target.** The agent's dsh web
session does not run *beside* dsh — it runs *inside* the host process
`node .../node_modules/@deepseek-ai/dsh/...`. The tool call
`pwsh: npm install -g @deepseek-ai/dsh@0.1.2-rc.1` (timeout 600 000 ms) is executed by a tool
worker that is a child of that same host process, and its result is reported back through the host
(session transcript persistence, gateway/WebSocket to the GUI). The upgrade target — the global
`@deepseek-ai/dsh` package tree — is exactly the tree the host executes from. In short: the
executor of the upgrade is a component of the upgrade target.

**What dies first.** npm's global-install phase order is visible in the log:
`cleaning node_modules/@deepseek-ai/dsh` (16:41:02) → `remove @deepseek-ai/dsh` (16:41:05) →
`fetch @deepseek-ai/dsh@0.1.2-rc.1` (16:41:09) → `linkStuff` (16:41:31). Between `remove` and
`linkStuff` the old package directory — the host's own code — is renamed/removed and replaced
while the host is still executing and lazily importing from that path. The **host process dies
first**: the GUI session died ("connection lost") exactly while `linkStuff` was running. On
Windows the damage is aggravated by file locks on loaded native modules (the skill's stop-first
rationale: EBUSY) and by any lazy `import()`/`require()` landing on a path npm just deleted.

**Why the tool call never returned a result.** The tool result is produced by the worker and
delivered through the host that just died; with the host gone there is no process left to record
an outcome. The log shows `[tool result] <no result recorded … outcome unknown>`. The 600 s
timeout is irrelevant — the call did not time out; its reporting path was destroyed.

**Why this is failure by construction, not by accident.** While the host is alive the install
cannot be safely performed; the moment npm replaces the host's tree, the session and its result
path die with it; and even a "lucky" completion would still require a host restart to load the new
code — killing the session anyway. No retry, longer timeout, or ordering of `npm install -g`
against an in-host tool call makes "session survives" and "atomic install" both true. SKILL.md
states the rule flatly (never execute the global host upgrade from inside a session on that host),
and rollup **R-12** ("the upgrade target may be the currently running host") classifies this as a
pre-upgrade safety check — a structural hazard, not a flaky race.

## 2. The broken state afterwards — content without shims

From `env-state.txt` and the post-incident `dir` output in `agent-session-log.txt`:

- **Before (healthy, 0.1.2-alpha.5)**: host running at `http://127.0.0.1:3080`, agent session
  active inside it; shims `dsh`, `dsh.cmd`, `dsh.ps1` all present; npm global tree
  `@deepseek-ai/dsh` plus `dsh-old-*` backups.
- **After (broken)**: host dead; `node_modules\@deepseek-ai\dsh\` **present** (rc.1 files, some
  hand-placed during the user's partial manual repair) but **not a standard install**; `dsh.cmd`
  MISSING, `dsh` MISSING, `dsh.ps1` **stale — points into the old tree**;
  `dsh-old-0.1.1-rc.1\` backup present. Verdict in the state file: the dsh CLI is unusable;
  only an external tool (another agent CLI) can repair the install.

**Why the `dsh` command vanished while the package content remained.** A global npm install
writes two coupled but separately-produced artifacts: (a) the package **content** under the global
`node_modules\@deepseek-ai\dsh\`, and (b) the **launcher shims** `dsh` / `dsh.cmd` /
`dsh.ps1` in `$env:APPDATA\npm`, generated by npm's `linkStuff` bin-linking phase from the
manifest's `bin` field. The command `dsh` resolves through those shims on PATH — not through
the package directory. The interruption landed between content placement and shim regeneration:
the old tree was cleaned/renamed (hence `dsh-old-*`), the old bin links were removed with it
(`dsh.cmd` gone), and the new shims were never written before the process died during
`linkStuff`. The stale `dsh.ps1` is the fossil of that half-state: it survived but points into
the old tree. Hence `dsh --version` / `dsh web` → "term not recognized" although the code is on
disk: the interruption destroyed the CLI entry points, not the code.

**Why swapping or patching directories by hand makes it worse.** A hand-copied tree is not an npm
install. npm's own bookkeeping (its lock/entry metadata in the global tree, bin links derived from
`bin`, dependency linkage, lifecycle scripts such as native-module steps) is not reproduced by
copying files, so later `npm install/uninstall/ls` against that tree can misbehave or remove
more than expected. Hand-written shims can point into the wrong tree — the stale `dsh.ps1` shows
this already happened — and can be shadowed by other PATH entries. A mixed-identity tree (rc.1
content + alpha.5 leftovers + `dsh-old-*` backups + hand-placed files) has **no trustworthy
version identity**: `dsh --version` can lie or crash on mismatched dependencies, and manual
patching destroys the evidence of what is actually missing. This machine already shows the
failure: the repair notes found "the directory had been replaced/manually swapped … the dsh /
dsh.cmd shims were never generated", i.e. the hand repair produced a non-standard install that
still could not run `dsh`. SKILL.md's repair rule is explicit: **never hand-copy package
directories or hand-write shims**.

## 3. The repair that was actually applied

`repair-notes.md` (a different agent CLI, run **outside** dsh):

1. **Re-ran the formal install from the registry**: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   → `dsh` / `dsh.cmd` / `dsh.ps1` all regenerated; `dsh --version` → `0.1.2-rc.1`.
2. **Aligned the source checkout** used for host-source reference from the `alpha.5` tag to the
   `dsh-v0.1.2-rc.1` tag; no local-modification conflicts.

**Why this form of repair works where the in-session attempt could not.**
(a) The executor is outside the dsh host, so the install no longer replaces the code of the process
running it — the §1 contradiction is gone; (b) by repair time the host was already dead, so there
were no live file locks (no EBUSY) and no in-flight imports; (c) a formal registry install makes
npm recompute the entire standard state — content **and** bin shims **and** its metadata — instead
of a human guessing the layout; it is the only sanctioned way to regenerate `dsh.cmd` /
`dsh.ps1` from the manifest `bin`; (d) the version is **pinned** (`0.1.2-rc.1`): a bare
package name resolves the `latest` dist-tag, which can sit on another line than intended (rollup
R-08; the rc.1 channel record shows sub-package `latest` tags lag badly).

**How the result is verified.** Minimal proof already obtained: all three shims present and
`dsh --version` → `0.1.2-rc.1`. The repair notes leave runtime-level verification to the user:
start `dsh --profile web`, hard-refresh the browser, confirm plugins load (whale / progress /
etc.); delete the `dsh-old-*` backups only **after** rc.1 is confirmed. Scope check: the
alpha.5→rc.1 diff is 252 files, **all** `package.json` version bumps, zero API/feature change —
independently corroborated by the corridor card set `v0.1.2-rc.1.md` (zero cards, "pure version
bump") — so no plugin re-migration belongs to this repair.

## 4. The protocol the agent should have followed

**Recognition.** Before any command, the agent must answer R-12's pre-check: *does the upgrade
target belong to the currently running host?* Here the answer was trivially yes — the session and
its tool worker are children of the `node …/@deepseek-ai/dsh` host tree and
`npm install -g @deepseek-ai/dsh@…` replaces exactly that tree. The agent therefore **must not
execute the global host upgrade at all**, regardless of how directly the user asks to "update
dsh": executing it destroys the agent's own runtime and result path. That is the discipline
boundary — for host-self upgrades, "do it for the user" is forbidden; the deliverable is a
procedure the user runs externally.

**The exact external procedure to hand the user (order matters):**

1. **Before npm runs — fully stop every dsh process.** Exit web sessions, stop every `dsh web`
   host including service/scheduled-managed hosts, and verify no `node …/@deepseek-ai/dsh`
   process remains (Task Manager / `Get-Process node`). A browser refresh or closing the tab is
   **not** a host stop. Rationale: a running host holds native-module file locks (Windows → EBUSY)
   and is the process that would die mid-install; per the v0.1.5-alpha.1 card A1-20 summary, an
   in-place upgrade of a running host can anyway leave stale client/roster combos needing a
   restart to self-heal.
2. **From an external terminal (never from a dsh session or an in-host tool call), run the pinned
   install**: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. It must carry the **exact pinned
   version** the user requested — a bare package name resolves to the `latest` dist-tag and can
   silently land on a different line (R-08; the rc.1 npm-channel measurement). It must run
   **after** the host is fully stopped and **before** anything is restarted.
3. **Then restart**: `dsh web` / `dsh --profile web`, **hard-refresh** the browser (the web
   client is served/cached from the install tree; a refresh without a host restart loads stale
   assets), verify version markers (`dsh --version` and the client-reported build id) and that
   plugins load (whale / progress / …).
4. **Only after confirmation**, optionally delete the `dsh-old-*` backup directories.

**Which parts follow from known upgrade rules, and which part is new for this incident.**
*Already known rules*: the pinned-install / dist-tag discipline (R-08 plus the rc.1 channel
record); the stop-first discipline and "treat stop→start as one atomic operation with an
independent recovery path" (R-12); "never execute the global host upgrade from inside a session —
hand the user the external procedure" and "never hand-copy package directories or hand-write
shims" (SKILL.md global-upgrade section); the restart + verify-version-markers + verify-plugins
checklist (SKILL.md validation layers; A1-20 restart self-heal).
*New for this incident*: (i) the interrupted-install signature — an interrupted global install
leaves package content present **without** regenerated shims, so the `dsh` command disappears
while the files remain, with a stale `dsh.ps1` pointing into the old tree; (ii) the recovery
recipe for that state — re-run the **pinned formal install from an external shell**, which is a
*repair of the machine*, not a retry of the task; (iii) result semantics — a tool call that dies
with the host records *no result*, so the outcome must be treated as **unknown** (inspect machine
state; never assume success or failure), and the crash itself is evidence the protocol was
violated ("a crash during the upgrade is a signature of doing it wrong").

## 5. Prevention

**Agent-side guard.**

- **Host-self detection pre-flight**: before any global install/update/uninstall, resolve where the
  command would write (`npm root -g`, `(Get-Command dsh).Source` / `where dsh`) and compare
  it with the tree the current process runs from (the session's host package path). If the target
  tree **is** the running host's tree, refuse to execute and emit the external hand-off procedure.
  This operationalizes R-12's four questions (target plugin in the current profile? target preset
  the one in use? runtime/dependency underpinning the current Harness? uninstalling something the
  runtime still depends on?).
- **Command-class guard**: classify `npm install|i|update|uninstall|remove -g <pkg>` where
  `<pkg>` resolves into the host's own tree (notably `@deepseek-ai/dsh*`) as *host-self
  destructive*; the tool layer should block it from an in-host session (or require a recorded,
  explicit acknowledgment that the host will die mid-call) and offer the hand-off template instead.
- **Hand-off discipline**: a refusal must deliver the ordered procedure of §4 verbatim (stop →
  external pinned install → restart → verify), not a vague "please upgrade manually"; when an
  interrupted attempt is discovered, label the prior outcome "unknown" and inspect machine state
  (shims, version marker, standard-install-ness) before further action.
- **Never "helpfully" repair mid-incident** by copying directories or writing shims — route to the
  formal pinned re-install.

**Post-upgrade checklist for this machine (alpha.5→rc.1).**

1. **Standard-install proof**: `dsh` / `dsh.cmd` / `dsh.ps1` all present in
   `$env:APPDATA\npm`; **no shim pointing into `dsh-old-*`** (the stale-`dsh.ps1` trap);
   `dsh --version` → `0.1.2-rc.1`.
2. **No ghost host**: ensure no surviving process — including service/launchd/scheduled-managed
   hosts (the rc.1 real-host record's KeepAlive case) — keeps alpha.5 code in memory while lazily
   importing rc.1 files; a browser refresh is not a host restart (A1-20).
3. **Cold start + client**: start `dsh --profile web` (or `dsh web`), hard-refresh, confirm the
   client reports the rc.1 build id with zero console errors.
4. **Plugin fleet**: whale / progress / etc. Enabled in Settings → Plugins; logs show no entry
   `pending`, no `missed the module table`, no `service-unavailable` loop; one full
   message → tool → response round passes (layered-checklist layer 4).
5. **First-boot storage sanity**: no storage-salvage messages and no `*.json.bak.*` files (the
   alpha.5 storage-salvage card's symptom), since this machine's `$DSH_HOME` spans several host
   versions.
6. **Migration scope = none**: alpha.5→rc.1 is a pure version bump (252 files, all version fields;
   zero corridor cards) — plugins migrated for 0.1.2-alpha.x need **no** re-migration; do not do
   pointless re-migration work.
7. **Cleanup + rollback**: only after rc.1 is confirmed, delete `dsh-old-*` and stale shims; if
   rc.1 misbehaves, roll back the same way — pinned formal re-install of
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` from an external shell (rollup rollback §5:
   prefer switching back to the recorded host version), never hand-copying.

---

## Evidence and references (IDs / key points only)

- Sealed evidence pack: `fixture/agent-session-log.txt`, `fixture/env-state.txt`,
  `fixture/repair-notes.md` (read-only).
- `SKILL.md` · "Global DSH host upgrades (agent discipline)" + "Safety boundaries": structural
  fatality of in-session host upgrades; external procedure (stop → pinned install → restart →
  verify); never hand-copy directories or hand-write shims.
- `rollup-0.1.2.md` · **R-12** (upgrade target may be the running host; four pre-checks; atomic
  stop→start; independent recovery path), **R-08** (install-channel pitfalls: mirror lag, pnpm
  supply-chain rules, peer-floor prerelease semantics; dist-tag drift), rollback §5 (switch back to
  the recorded host version).
- `v0.1.2-rc.1.md` · card set **DSH-0.1.2-RC1**: zero cards; 252 files all version bumps; npm
  channel measurement (`next`/`latest` = 0.1.2-rc.1, `alpha` = 0.1.2-alpha.5 as measured);
  real-host validation incl. ghost check and the "launchd-managed host must also be restarted" case.
- `v0.1.5-alpha.1.md` card **A1-20** (via the SKILL.md references summary): an in-place
  npm-global upgrade of a running host can serve a stale client/roster combo; host restart
  self-heals.
- `v0.1.2-alpha.5.md` storage card (via the SKILL.md references summary):
  `invalidRecords: 'backup-and-skip'` salvage and `*.json.bak.*` symptoms for first-boot checks.

## run-stats

- toolcalls 总数: 17 次底层工具调用（read 8、glob 1、grep 1、write 6、send_message 1），封装在 8 次 run_code 调用中。
- token 用量: n/a（本会话不暴露 token 计数）。
- 完成时间: 2026-10-21T15:14:54.400+08:00。


#### FILE: S16-self-host-upgrade-trap/tool-transcript.txt

tool-transcript.txt · S16-self-host-upgrade-trap · solver 运行记录
（所有文件访问均经 run_code 封装内的 tools.* 调用完成；序号=底层工具调用序号）
1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. glob pattern=**/* path=E:\...\S16-self-host-upgrade-trap（列本格目录树）
3. read E:\...\S16-self-host-upgrade-trap\fixture\README.md
4. read E:\...\S16-self-host-upgrade-trap\fixture\agent-session-log.txt
5. read E:\...\S16-self-host-upgrade-trap\fixture\env-state.txt
6. read E:\...\S16-self-host-upgrade-trap\fixture\repair-notes.md
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-rc.1.md
9. grep pattern=shim|dsh\.cmd|global install|self-upgrade|command not found|not recognized path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
10. write E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md（分析报告主文件）
11. write E:\...\S16-self-host-upgrade-trap\agent-output\report.md（报告副本，兼容收尾自报默认路径）
12. read E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md（回读校验非空）
13. write E:\...\S16-self-host-upgrade-trap\agent-output\tool-transcript.txt
14. write E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\tool-transcript.txt
15. write E:\...\S16-self-host-upgrade-trap\agent-output\transcript-manifest.txt
16. write E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\transcript-manifest.txt
17. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（结果回传父代理）


#### FILE: S16-self-host-upgrade-trap/transcript-manifest.txt

transcript-manifest.txt · S16-self-host-upgrade-trap · 真实文件系统读/写目标（R=读 W=写，按发生顺序）
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\agent-session-log.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\env-state.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\repair-notes.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-rc.1.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\report.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\transcript-manifest.txt


#### FILE: report.md

# S16 · The Self-Host Upgrade Trap — incident analysis and hand-off protocol

**Mode**: read-only analysis (skill Mode A) of the sealed evidence pack. No migration or install
was executed; `/app/fixture/` (this cell's `fixture\` directory) was only read and is unchanged.
Skill basis: `skills/plugin-upgrade/SKILL.md` ("Global DSH host upgrades (agent discipline)",
"Safety boundaries"), `references/rollup-0.1.2.md` (R-08, R-12, rollback §5),
`references/v0.1.2-rc.1.md` (corridor card set, zero cards). Evidence cited by file name only:
`agent-session-log.txt`, `env-state.txt`, `repair-notes.md`.

---

## 1. Structural root cause — the session is part of the thing npm replaced

**What the session and its tool worker are relative to the upgrade target.** The agent's dsh web
session does not run *beside* dsh — it runs *inside* the host process
`node .../node_modules/@deepseek-ai/dsh/...`. The tool call
`pwsh: npm install -g @deepseek-ai/dsh@0.1.2-rc.1` (timeout 600 000 ms) is executed by a tool
worker that is a child of that same host process, and its result is reported back through the host
(session transcript persistence, gateway/WebSocket to the GUI). The upgrade target — the global
`@deepseek-ai/dsh` package tree — is exactly the tree the host executes from. In short: the
executor of the upgrade is a component of the upgrade target.

**What dies first.** npm's global-install phase order is visible in the log:
`cleaning node_modules/@deepseek-ai/dsh` (16:41:02) → `remove @deepseek-ai/dsh` (16:41:05) →
`fetch @deepseek-ai/dsh@0.1.2-rc.1` (16:41:09) → `linkStuff` (16:41:31). Between `remove` and
`linkStuff` the old package directory — the host's own code — is renamed/removed and replaced
while the host is still executing and lazily importing from that path. The **host process dies
first**: the GUI session died ("connection lost") exactly while `linkStuff` was running. On
Windows the damage is aggravated by file locks on loaded native modules (the skill's stop-first
rationale: EBUSY) and by any lazy `import()`/`require()` landing on a path npm just deleted.

**Why the tool call never returned a result.** The tool result is produced by the worker and
delivered through the host that just died; with the host gone there is no process left to record
an outcome. The log shows `[tool result] <no result recorded … outcome unknown>`. The 600 s
timeout is irrelevant — the call did not time out; its reporting path was destroyed.

**Why this is failure by construction, not by accident.** While the host is alive the install
cannot be safely performed; the moment npm replaces the host's tree, the session and its result
path die with it; and even a "lucky" completion would still require a host restart to load the new
code — killing the session anyway. No retry, longer timeout, or ordering of `npm install -g`
against an in-host tool call makes "session survives" and "atomic install" both true. SKILL.md
states the rule flatly (never execute the global host upgrade from inside a session on that host),
and rollup **R-12** ("the upgrade target may be the currently running host") classifies this as a
pre-upgrade safety check — a structural hazard, not a flaky race.

## 2. The broken state afterwards — content without shims

From `env-state.txt` and the post-incident `dir` output in `agent-session-log.txt`:

- **Before (healthy, 0.1.2-alpha.5)**: host running at `http://127.0.0.1:3080`, agent session
  active inside it; shims `dsh`, `dsh.cmd`, `dsh.ps1` all present; npm global tree
  `@deepseek-ai/dsh` plus `dsh-old-*` backups.
- **After (broken)**: host dead; `node_modules\@deepseek-ai\dsh\` **present** (rc.1 files, some
  hand-placed during the user's partial manual repair) but **not a standard install**; `dsh.cmd`
  MISSING, `dsh` MISSING, `dsh.ps1` **stale — points into the old tree**;
  `dsh-old-0.1.1-rc.1\` backup present. Verdict in the state file: the dsh CLI is unusable;
  only an external tool (another agent CLI) can repair the install.

**Why the `dsh` command vanished while the package content remained.** A global npm install
writes two coupled but separately-produced artifacts: (a) the package **content** under the global
`node_modules\@deepseek-ai\dsh\`, and (b) the **launcher shims** `dsh` / `dsh.cmd` /
`dsh.ps1` in `$env:APPDATA\npm`, generated by npm's `linkStuff` bin-linking phase from the
manifest's `bin` field. The command `dsh` resolves through those shims on PATH — not through
the package directory. The interruption landed between content placement and shim regeneration:
the old tree was cleaned/renamed (hence `dsh-old-*`), the old bin links were removed with it
(`dsh.cmd` gone), and the new shims were never written before the process died during
`linkStuff`. The stale `dsh.ps1` is the fossil of that half-state: it survived but points into
the old tree. Hence `dsh --version` / `dsh web` → "term not recognized" although the code is on
disk: the interruption destroyed the CLI entry points, not the code.

**Why swapping or patching directories by hand makes it worse.** A hand-copied tree is not an npm
install. npm's own bookkeeping (its lock/entry metadata in the global tree, bin links derived from
`bin`, dependency linkage, lifecycle scripts such as native-module steps) is not reproduced by
copying files, so later `npm install/uninstall/ls` against that tree can misbehave or remove
more than expected. Hand-written shims can point into the wrong tree — the stale `dsh.ps1` shows
this already happened — and can be shadowed by other PATH entries. A mixed-identity tree (rc.1
content + alpha.5 leftovers + `dsh-old-*` backups + hand-placed files) has **no trustworthy
version identity**: `dsh --version` can lie or crash on mismatched dependencies, and manual
patching destroys the evidence of what is actually missing. This machine already shows the
failure: the repair notes found "the directory had been replaced/manually swapped … the dsh /
dsh.cmd shims were never generated", i.e. the hand repair produced a non-standard install that
still could not run `dsh`. SKILL.md's repair rule is explicit: **never hand-copy package
directories or hand-write shims**.

## 3. The repair that was actually applied

`repair-notes.md` (a different agent CLI, run **outside** dsh):

1. **Re-ran the formal install from the registry**: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   → `dsh` / `dsh.cmd` / `dsh.ps1` all regenerated; `dsh --version` → `0.1.2-rc.1`.
2. **Aligned the source checkout** used for host-source reference from the `alpha.5` tag to the
   `dsh-v0.1.2-rc.1` tag; no local-modification conflicts.

**Why this form of repair works where the in-session attempt could not.**
(a) The executor is outside the dsh host, so the install no longer replaces the code of the process
running it — the §1 contradiction is gone; (b) by repair time the host was already dead, so there
were no live file locks (no EBUSY) and no in-flight imports; (c) a formal registry install makes
npm recompute the entire standard state — content **and** bin shims **and** its metadata — instead
of a human guessing the layout; it is the only sanctioned way to regenerate `dsh.cmd` /
`dsh.ps1` from the manifest `bin`; (d) the version is **pinned** (`0.1.2-rc.1`): a bare
package name resolves the `latest` dist-tag, which can sit on another line than intended (rollup
R-08; the rc.1 channel record shows sub-package `latest` tags lag badly).

**How the result is verified.** Minimal proof already obtained: all three shims present and
`dsh --version` → `0.1.2-rc.1`. The repair notes leave runtime-level verification to the user:
start `dsh --profile web`, hard-refresh the browser, confirm plugins load (whale / progress /
etc.); delete the `dsh-old-*` backups only **after** rc.1 is confirmed. Scope check: the
alpha.5→rc.1 diff is 252 files, **all** `package.json` version bumps, zero API/feature change —
independently corroborated by the corridor card set `v0.1.2-rc.1.md` (zero cards, "pure version
bump") — so no plugin re-migration belongs to this repair.

## 4. The protocol the agent should have followed

**Recognition.** Before any command, the agent must answer R-12's pre-check: *does the upgrade
target belong to the currently running host?* Here the answer was trivially yes — the session and
its tool worker are children of the `node …/@deepseek-ai/dsh` host tree and
`npm install -g @deepseek-ai/dsh@…` replaces exactly that tree. The agent therefore **must not
execute the global host upgrade at all**, regardless of how directly the user asks to "update
dsh": executing it destroys the agent's own runtime and result path. That is the discipline
boundary — for host-self upgrades, "do it for the user" is forbidden; the deliverable is a
procedure the user runs externally.

**The exact external procedure to hand the user (order matters):**

1. **Before npm runs — fully stop every dsh process.** Exit web sessions, stop every `dsh web`
   host including service/scheduled-managed hosts, and verify no `node …/@deepseek-ai/dsh`
   process remains (Task Manager / `Get-Process node`). A browser refresh or closing the tab is
   **not** a host stop. Rationale: a running host holds native-module file locks (Windows → EBUSY)
   and is the process that would die mid-install; per the v0.1.5-alpha.1 card A1-20 summary, an
   in-place upgrade of a running host can anyway leave stale client/roster combos needing a
   restart to self-heal.
2. **From an external terminal (never from a dsh session or an in-host tool call), run the pinned
   install**: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. It must carry the **exact pinned
   version** the user requested — a bare package name resolves to the `latest` dist-tag and can
   silently land on a different line (R-08; the rc.1 npm-channel measurement). It must run
   **after** the host is fully stopped and **before** anything is restarted.
3. **Then restart**: `dsh web` / `dsh --profile web`, **hard-refresh** the browser (the web
   client is served/cached from the install tree; a refresh without a host restart loads stale
   assets), verify version markers (`dsh --version` and the client-reported build id) and that
   plugins load (whale / progress / …).
4. **Only after confirmation**, optionally delete the `dsh-old-*` backup directories.

**Which parts follow from known upgrade rules, and which part is new for this incident.**
*Already known rules*: the pinned-install / dist-tag discipline (R-08 plus the rc.1 channel
record); the stop-first discipline and "treat stop→start as one atomic operation with an
independent recovery path" (R-12); "never execute the global host upgrade from inside a session —
hand the user the external procedure" and "never hand-copy package directories or hand-write
shims" (SKILL.md global-upgrade section); the restart + verify-version-markers + verify-plugins
checklist (SKILL.md validation layers; A1-20 restart self-heal).
*New for this incident*: (i) the interrupted-install signature — an interrupted global install
leaves package content present **without** regenerated shims, so the `dsh` command disappears
while the files remain, with a stale `dsh.ps1` pointing into the old tree; (ii) the recovery
recipe for that state — re-run the **pinned formal install from an external shell**, which is a
*repair of the machine*, not a retry of the task; (iii) result semantics — a tool call that dies
with the host records *no result*, so the outcome must be treated as **unknown** (inspect machine
state; never assume success or failure), and the crash itself is evidence the protocol was
violated ("a crash during the upgrade is a signature of doing it wrong").

## 5. Prevention

**Agent-side guard.**

- **Host-self detection pre-flight**: before any global install/update/uninstall, resolve where the
  command would write (`npm root -g`, `(Get-Command dsh).Source` / `where dsh`) and compare
  it with the tree the current process runs from (the session's host package path). If the target
  tree **is** the running host's tree, refuse to execute and emit the external hand-off procedure.
  This operationalizes R-12's four questions (target plugin in the current profile? target preset
  the one in use? runtime/dependency underpinning the current Harness? uninstalling something the
  runtime still depends on?).
- **Command-class guard**: classify `npm install|i|update|uninstall|remove -g <pkg>` where
  `<pkg>` resolves into the host's own tree (notably `@deepseek-ai/dsh*`) as *host-self
  destructive*; the tool layer should block it from an in-host session (or require a recorded,
  explicit acknowledgment that the host will die mid-call) and offer the hand-off template instead.
- **Hand-off discipline**: a refusal must deliver the ordered procedure of §4 verbatim (stop →
  external pinned install → restart → verify), not a vague "please upgrade manually"; when an
  interrupted attempt is discovered, label the prior outcome "unknown" and inspect machine state
  (shims, version marker, standard-install-ness) before further action.
- **Never "helpfully" repair mid-incident** by copying directories or writing shims — route to the
  formal pinned re-install.

**Post-upgrade checklist for this machine (alpha.5→rc.1).**

1. **Standard-install proof**: `dsh` / `dsh.cmd` / `dsh.ps1` all present in
   `$env:APPDATA\npm`; **no shim pointing into `dsh-old-*`** (the stale-`dsh.ps1` trap);
   `dsh --version` → `0.1.2-rc.1`.
2. **No ghost host**: ensure no surviving process — including service/launchd/scheduled-managed
   hosts (the rc.1 real-host record's KeepAlive case) — keeps alpha.5 code in memory while lazily
   importing rc.1 files; a browser refresh is not a host restart (A1-20).
3. **Cold start + client**: start `dsh --profile web` (or `dsh web`), hard-refresh, confirm the
   client reports the rc.1 build id with zero console errors.
4. **Plugin fleet**: whale / progress / etc. Enabled in Settings → Plugins; logs show no entry
   `pending`, no `missed the module table`, no `service-unavailable` loop; one full
   message → tool → response round passes (layered-checklist layer 4).
5. **First-boot storage sanity**: no storage-salvage messages and no `*.json.bak.*` files (the
   alpha.5 storage-salvage card's symptom), since this machine's `$DSH_HOME` spans several host
   versions.
6. **Migration scope = none**: alpha.5→rc.1 is a pure version bump (252 files, all version fields;
   zero corridor cards) — plugins migrated for 0.1.2-alpha.x need **no** re-migration; do not do
   pointless re-migration work.
7. **Cleanup + rollback**: only after rc.1 is confirmed, delete `dsh-old-*` and stale shims; if
   rc.1 misbehaves, roll back the same way — pinned formal re-install of
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` from an external shell (rollup rollback §5:
   prefer switching back to the recorded host version), never hand-copying.

---

## Evidence and references (IDs / key points only)

- Sealed evidence pack: `fixture/agent-session-log.txt`, `fixture/env-state.txt`,
  `fixture/repair-notes.md` (read-only).
- `SKILL.md` · "Global DSH host upgrades (agent discipline)" + "Safety boundaries": structural
  fatality of in-session host upgrades; external procedure (stop → pinned install → restart →
  verify); never hand-copy directories or hand-write shims.
- `rollup-0.1.2.md` · **R-12** (upgrade target may be the running host; four pre-checks; atomic
  stop→start; independent recovery path), **R-08** (install-channel pitfalls: mirror lag, pnpm
  supply-chain rules, peer-floor prerelease semantics; dist-tag drift), rollback §5 (switch back to
  the recorded host version).
- `v0.1.2-rc.1.md` · card set **DSH-0.1.2-RC1**: zero cards; 252 files all version bumps; npm
  channel measurement (`next`/`latest` = 0.1.2-rc.1, `alpha` = 0.1.2-alpha.5 as measured);
  real-host validation incl. ghost check and the "launchd-managed host must also be restarted" case.
- `v0.1.5-alpha.1.md` card **A1-20** (via the SKILL.md references summary): an in-place
  npm-global upgrade of a running host can serve a stale client/roster combo; host restart
  self-heals.
- `v0.1.2-alpha.5.md` storage card (via the SKILL.md references summary):
  `invalidRecords: 'backup-and-skip'` salvage and `*.json.bak.*` symptoms for first-boot checks.

## run-stats

- toolcalls 总数: 17 次底层工具调用（read 8、glob 1、grep 1、write 6、send_message 1），封装在 8 次 run_code 调用中。
- token 用量: n/a（本会话不暴露 token 计数）。
- 完成时间: 2026-10-21T15:14:54.400+08:00。


#### FILE: tool-transcript.txt

tool-transcript.txt · S16-self-host-upgrade-trap · solver 运行记录
（所有文件访问均经 run_code 封装内的 tools.* 调用完成；序号=底层工具调用序号）
1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. glob pattern=**/* path=E:\...\S16-self-host-upgrade-trap（列本格目录树）
3. read E:\...\S16-self-host-upgrade-trap\fixture\README.md
4. read E:\...\S16-self-host-upgrade-trap\fixture\agent-session-log.txt
5. read E:\...\S16-self-host-upgrade-trap\fixture\env-state.txt
6. read E:\...\S16-self-host-upgrade-trap\fixture\repair-notes.md
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-rc.1.md
9. grep pattern=shim|dsh\.cmd|global install|self-upgrade|command not found|not recognized path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
10. write E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md（分析报告主文件）
11. write E:\...\S16-self-host-upgrade-trap\agent-output\report.md（报告副本，兼容收尾自报默认路径）
12. read E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md（回读校验非空）
13. write E:\...\S16-self-host-upgrade-trap\agent-output\tool-transcript.txt
14. write E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\tool-transcript.txt
15. write E:\...\S16-self-host-upgrade-trap\agent-output\transcript-manifest.txt
16. write E:\...\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\transcript-manifest.txt
17. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（结果回传父代理）


#### FILE: transcript-manifest.txt

transcript-manifest.txt · S16-self-host-upgrade-trap · 真实文件系统读/写目标（R=读 W=写，按发生顺序）
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\agent-session-log.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\env-state.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\fixture\repair-notes.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-rc.1.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\report.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S16-self-host-upgrade-trap\agent-output\S16-self-host-upgrade-trap\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.