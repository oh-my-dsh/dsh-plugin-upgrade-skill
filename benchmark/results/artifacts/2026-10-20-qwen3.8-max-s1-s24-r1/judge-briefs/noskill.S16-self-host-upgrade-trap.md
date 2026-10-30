# JUDGE BRIEF · noskill.S16-self-host-upgrade-trap

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

# S16 · The Self-Host Upgrade Trap — Incident Report

Evidence base (read-only fixture):
`fixture/agent-session-log.txt` (the fatal in-session npm install and its interruption),
`fixture/env-state.txt` (before/after machine state), `fixture/repair-notes.md` (external repair session).

**Executive summary.** A dsh web agent executed `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` from a tool
worker inside the very host process that npm was replacing. The host died mid-install (GUI connection
lost), the tool call never recorded a result, and the install stopped before npm's bin-linking phase —
leaving package content on disk but no working `dsh`/`dsh.cmd` shims, i.e. a dead command. A user's
partial manual repair made the tree non-standard. The correct repair — applied by an external agent CLI —
was to re-run the formal registry install, which regenerated all shims (`dsh --version` → 0.1.2-rc.1).
The protocol the agent should have followed: recognize that the upgrade target is its own host, refuse to
execute the global install in-session, and hand the user an external procedure in which **the host is
stopped before npm runs**.

---

## 1. Structural root cause: the agent upgraded the process it was living inside

**What the session and its tool worker are, relative to the upgrade target.** The session log header states
the host process is `node .../node_modules/@deepseek-ai/dsh/...` and the log annotates the tool call as
"running inside the host's own worker process". So the whole stack — the web GUI served at
http://127.0.0.1:3080, the agent session runtime, and the pwsh tool worker that executed npm — is either
that process or a child of it. And `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` targets exactly the
directory that process executes its code from: `%APPDATA%\npm\node_modules\@deepseek-ai\dsh`. The
command's object and the command's execution environment are the same artifact: the agent is a guest of
the package it asked npm to delete. That circularity is why this fails *by construction* — no timeout
tuning, retry, backgrounding, or luck removes it; the only safe executor of an upgrade is a process with
no dependency on the target.

**What dies first, and the destructive ordering.** npm's recorded phases show the order:
`cleaning node_modules/@deepseek-ai/dsh` → `remove @deepseek-ai/dsh` → `fetch` → `linkStuff`. npm
deletes/displaces the live code tree *before* placing the new one, and shim (bin-link) regeneration is the
*last* phase of an install. While the tree the host is running from is being removed and replaced, the
host's lazy `require()` resolution fails and — on Windows — the live node process's open handles and
directory locks collide with npm's remove/rename steps. The **host process dies first**: the log shows the
GUI died immediately after `linkStuff` ("browser tab: connection lost"), and the GUI died because the
process serving it died. Its death cascades to the session runtime and the tool worker's result path; the
npm child was killed/orphaned mid-flight, which is why "the install never completed" (tree "partially
replaced", bin-link phase never reached).

**Why the tool call never returned a result.** Tool results are durably recorded by the session runtime
living inside the host. The host died while the pwsh worker was still running npm, so no surviving process
existed to receive npm's exit code and write the tool-result turn — hence the log's
`[tool result] <no result recorded — ... Its outcome is unknown>`. This is not a logging flake: the
recorder was destroyed by the command's own effect. An in-session self-upgrade has no winning branch —
even if the host somehow survived to npm's completion, the session would be sitting on a swapped runtime;
on Windows the overwhelmingly likely branch is the mid-install death that actually occurred.

## 2. The broken state: package content ≠ installed command

**Why `dsh` vanished although the directory was still present.** On Windows, the `dsh` command *is not*
the package folder; it is the set of shim files npm generates in the global prefix `%APPDATA%\npm`
(which is on PATH): `dsh` (sh), `dsh.cmd`, `dsh.ps1`, each a small launcher pointing into
`node_modules\@deepseek-ai\dsh`. Shells resolve `dsh` only through those shims, and npm writes them in
the install's final bin-linking phase. The interrupted install died before that phase, after npm's
clean/remove phase had already removed the old shims. After-state per the evidence: `dsh.cmd` **MISSING**,
`dsh` **MISSING**, `dsh.ps1` **stale** ("points into the old tree"). With the resolvable shims gone and
the one survivor pointing at a displaced/renamed tree, every invocation from a fresh shell yields "The term
'dsh' is not recognized" — while `node_modules\@deepseek-ai\dsh\` still holds files. Presence of
content says nothing about the existence of the command.

**The content itself is untrustworthy.** env-state records a hybrid: rc.1 files present, "some placed by
hand during a partial manual repair attempt by the user", "NOT a standard install", alongside a
`dsh-old-0.1.1-rc.1` backup dir. Package.json↔content correspondence, the transitive dependency tree, and
npm's bookkeeping are all in undefined states.

**Why hand-swapping or patching directories makes it worse.**
1. Manual file copies never regenerate shims — the actual missing piece — so patching the directory leaves
   `dsh` exactly as dead.
2. Hand overlays create version chimeras (alpha.5 remnants + rc.1 files + hand-placed files); a mixed tree
   fails at runtime in subtler, harder-to-diagnose ways than a clean "command not found".
3. Each manual edit destroys forensic state and breaks npm's assumptions: the next real
   `npm install -g` diffs the on-disk tree against the ideal tree, and a hand-mangled directory can make
   npm skip placements, hit EEXIST/EPERM conflicts, or produce another partial install. The repair notes
   confirm precisely this signature: content present, install "NON-STANDARD" (directory "replaced/manually
   swapped"), shims "never generated".
4. File surgery bypasses the parts of an install a copy cannot do: dependency resolution and lifecycle
   (postinstall) scripts.
Conclusion: the broken state is not fixable by file operations at all; it must be normalized by a real
installer run.

## 3. The repair actually applied, why it works, and how it is verified

**What the repair notes applied** (a different agent CLI, running entirely outside dsh):
1. Re-ran the formal registry install: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` → `dsh`,
   `dsh.cmd`, `dsh.ps1` all regenerated; `dsh --version` → `0.1.2-rc.1`.
2. Aligned the source checkout (host-source reference workspace) from the alpha.5 tag to the
   `dsh-v0.1.2-rc.1` tag; no local-modification conflicts.

**Why that form works where the in-session attempt could not.**
- *Executor independence*: the external CLI loads no code from the target package, so npm removing and
  replacing that tree kills nothing; the install can run every phase (clean → fetch → place → resolve
  deps → bin-link → lifecycle) to completion. The self-reference that doomed the in-session attempt is
  gone. A dead/stopped host also means no locked handles in the tree, so npm's Windows remove/rename steps
  no longer fight a live process.
- *Formal install, not file surgery*: a registry install is idempotent and self-normalizing — it rebuilds
  the ideal tree over the non-standard hybrid and regenerates the shims, the two things the broken state
  lacked.

**How the result is verified.**
- Immediate/mechanical: all three shims present; `dsh --version` prints exactly `0.1.2-rc.1`.
- Scope assessment (repair notes' key finding): tag diff `dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1` = 252
  files, **all** package.json version bumps, zero API/feature changes → plugins migrated for
  0.1.2-alpha.x need **no re-migration**.
- Real-machine confirmation left for the user: start `dsh --profile web`, hard-refresh the browser,
  confirm plugins (whale / progress / etc.) load; optional cleanup of `dsh-old-*` backups only after
  rc.1 is confirmed.

## 4. The protocol the agent should have followed

**Recognition (self-knowledge before action).** Before touching the command, the agent should have
identified that the upgrade target and itself are the same process tree: host =
`node .../node_modules/@deepseek-ai/dsh`; session, tool worker, and GUI are all inside or children of it.
"Update dsh" from inside a dsh session is self-host surgery — the operating agent cannot survive the
operation. This is a *category* of task an agent must never execute itself, however carefully.

**Should it execute the global install at all? No.** No in-session form fixes the circularity — not a
background job, not a detached process, not a longer timeout, not `--force`. The correct output of the
tool call is a refusal plus the exact external procedure handed to the user.

**The exact external procedure (order matters).**
1. **Before npm runs — stop the dsh host completely.** Finish/save active sessions; close the GUI tab;
   stop the `dsh web` host process (graceful stop if available, else kill the node process serving the
   GUI — e.g. find the PID owning port 3080 and `Stop-Process` it); verify no node process is executing
   from `...\node_modules\@deepseek-ai\dsh`. Rationale: this removes the self-reference and releases
   file handles/locks, so npm's remove/rename cannot fight a live process. Skipping this step reproduces
   the same mid-install death by construction.
2. **Run the install from an external shell** — a normal PowerShell/cmd window that is *not* a dsh tool
   call, or an external agent CLI:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   Why the command must look like this:
   - Formal **registry** install with `-g` and the exact package id: only a formal install regenerates
     the bin shims and rebuilds the ideal dependency tree — the only form that produces a *standard*
     install.
   - **Exact version pin** (`@0.1.2-rc.1`): deterministic and auditable, matching the release notes the
     agent checked; never `@latest` or a floating range for a deliberate upgrade.
   - **No** `npm link`, no install-from-local-folder, no robocopy/xcopy over the tree — those are
     exactly how the non-standard hybrid state of §2 was produced.
3. **Verify before declaring success**: `dsh --version` → 0.1.2-rc.1; `dsh`, `dsh.cmd`, `dsh.ps1`
   present in `%APPDATA%\npm` and pointing into the new tree; then start `dsh --profile web`,
   hard-refresh the browser, confirm plugins load.
4. **Assess migration need from the version diff**: check the tag diff; here alpha.5→rc.1 is version-bumps
   only → no plugin re-migration.
5. **Housekeeping**: align the source checkout tag to `dsh-v0.1.2-rc.1`; remove `dsh-old-*` backups
   only after rc.1 is confirmed.

**Known upgrade rules vs. new for this incident.**
- *Already follows from known upgrade rules* (as embodied by the repair notes): check release notes and
  the tag diff before upgrading; use the formal registry install with an exact version pin; never modify
  the installed tree by hand; verify `dsh --version` + GUI + plugin loads after upgrading; keep
  `dsh-old-*` backups until confirmation, then clean up; align the source checkout tag with the
  installed version; derive plugin-migration decisions from the actual diff.
- *New for this incident* (the S16 trap's lesson): the **executor-independence rule for self-host
  upgrades** — a dsh agent must recognize that its own host process is the upgrade target, must not
  execute the global install itself under any circumstances, must require the host to be **stopped
  before npm runs**, and must hand the procedure to the user or an external agent CLI. Plus the
  diagnostic signature: *package content present + shims missing/stale + tool call with no recorded
  result* = interrupted mid-install; the only valid repair is a formal re-install from outside, never a
  manual patch.

## 5. Prevention

**Agent-side guard (design).**
- *Self-identity record at session start*: the host records its own facts — package name
  (`@deepseek-ai/dsh`), version, install root (`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`), shim
  directory (`%APPDATA%\npm`), GUI port. Guards evaluate commands against these facts, not just the
  string "dsh".
- *Pre-execution command policy on every shell tool call*: refuse — and replace with the §4 hand-off
  procedure — any command whose effect touches the self-identity facts:
  - global package-manager ops targeting the host package (`npm install|uninstall|update -g
    @deepseek-ai/dsh...`, pnpm/yarn/bun equivalents, installs from tarball/folder paths that resolve to
    the host package);
  - any write/delete/rename/move inside the host's install root, the global npm prefix, or its shim files
    (robocopy/xcopy/Copy-Item/Remove-Item/Rename-Item/Move-Item against those paths) — this also blocks
    the "manual repair" class;
  - `npx`/ad-hoc execution of the host package's own bins during an upgrade window.
  The response is a **hard refusal with the procedure emitted**, not a confirmation prompt: the failure
  mode kills the very process that would report the confirmation outcome (as this incident's
  "no result recorded" proves).
- *Interrupted-call hygiene*: if a tool call ends with no durably recorded result and the command touched
  the host tree or global prefix, assume a broken install — never retry in-session; require external
  verification (shims + `dsh --version`) first. "No result recorded" must never be read as success or
  as a transient flake.
- *Safe automation escape hatch*: if automated upgrading is truly wanted, the only safe form is a detached
  external executor that runs after host shutdown — the agent may **write** a standalone script (stop
  host → `npm install -g` exact version → verify shims/version → restart host) for the user or OS to
  run outside the host's lifetime; the agent never **executes** it.

**Post-upgrade checklist for this machine (alpha.5 → rc.1, given the 252-files-all-version-bumps
finding).**
1. `dsh --version` → exactly `0.1.2-rc.1`.
2. All three shims (`dsh`, `dsh.cmd`, `dsh.ps1`) present in `%APPDATA%\npm` and fresh — pointing
   into the current tree, not stale.
3. Global tree is a standard npm install: no hand-placed leftovers or hybrid content; `dsh-old-*`
   backups intact and untouched.
4. `dsh --profile web` starts; GUI reachable at http://127.0.0.1:3080 after a browser hard-refresh; no
   orphaned node process holding the port.
5. Plugins (whale / progress / etc.) load and behave. Because the diff shows zero API/feature changes,
   plugins already migrated for 0.1.2-alpha.x must load **without re-migration** — do not re-migrate
   reflexively; a migration prompt on this upgrade is itself a red flag to investigate.
6. Source checkout aligned to tag `dsh-v0.1.2-rc.1` (matches installed version for host-source
   reference).
7. Only after 1–6 pass: optionally remove the `dsh-old-*` backup directories.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.