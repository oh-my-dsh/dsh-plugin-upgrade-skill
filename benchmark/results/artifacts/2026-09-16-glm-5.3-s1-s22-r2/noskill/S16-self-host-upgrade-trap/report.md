# S16 · The Self-Host Upgrade Trap — Analysis Report

Task: explain, from the read-only evidence pack in `environment/fixture/`, why an agent
running inside a dsh web session could not possibly succeed at
`npm install -g @deepseek-ai/dsh@0.1.2-rc.1`, what state it left behind, how the external
repair worked, what the agent should have done instead, and how to prevent recurrence.

Sources: `agent-session-log.txt`, `env-state.txt`, `repair-notes.md` (all read-only).

## 1. Structural root cause — failure by construction, not by accident

The session making the tool call was itself a live component of the thing npm was replacing:

- The user's request was executed by an agent whose host process is the globally installed
  dsh package itself (`node .../node_modules/@deepseek-ai/dsh/...` on the machine, per the
  session-log header). The session, the web GUI at http://127.0.0.1:3080, and the pwsh tool
  worker that actually ran npm are all threads/child processes of that host process, loaded
  from that exact package tree.
- The session log shows npm's own progress through the classic replacement sequence:
  `16:41:02 npm warn cleaning node_modules/@deepseek-ai/dsh` →
  `16:41:05 npm info remove @deepseek-ai/dsh` →
  `16:41:09 npm info fetch @deepseek-ai/dsh@0.1.2-rc.1` →
  `16:41:31 npm info linkStuff`. The remove step deleted the running host's own module
  tree out from under it. On Windows the old tree's files are also locked by the running
  processes, which is why npm renamed the old directory to
  `dsh-old-0.1.1-rc.1`-style backups (present in the post-state) rather than deleting it.
- What dies first: the host process (and with it the GUI connection and the tool worker)
  as soon as the files backing it are removed/renamed. That is exactly the observed
  signature — the browser tab lost connection mid-call between the fetch and link steps.
- Why the tool call never returned: the tool worker executing the command was a child of
  the host that npm killed. The call was recorded into the session log, but the worker
  never survived to record a durable result — the log excerpt states
  *"no result was durably recorded. Its outcome is unknown."* This is the defining
  signature of a self-host upgrade attempt: the caller, the recorder, and the upgrade
  target are the same process.

This cannot succeed regardless of timing, network, or retry luck: any step order npm
chooses must at some point destroy the executing host. It is a structural failure, not a
flaky one — and any retry of the same command from a new session on the same host would
repeat it.

## 2. The broken state afterwards

From `env-state.txt` and the post-mortem shell output:

- **Content present, command gone.** The npm global tree still contains
  `node_modules\@deepseek-ai\dsh\` with (mostly) rc.1 content, plus
  `dsh-old-0.1.1-rc.1` backups — the interrupted install got as far as placing files but
  never reached `linkStuff` completion, so npm never regenerated the command shims.
- **Shims are what make `dsh` a command.** On Windows, an npm global package exposes its
  bin through `dsh.cmd` (cmd shim), `dsh.ps1` (PowerShell shim), and the extension-less
  `dsh` sh shim in `%APPDATA%\npm`. Post-state: `dsh` and `dsh.cmd` are MISSING and
  `dsh.ps1` is stale (it still points into the old/renamed tree). PowerShell resolves
  commands via PATH to those files — hence `dsh : The term 'dsh' is not recognized` for
  both `dsh --version` and `dsh web`, even though the package content sits intact
  a directory away. The command "vanished" because the *entry points*, not the *content*,
  define a CLI.
- **Why hand-repair by directory swapping makes it worse.** The after-state notes rc.1
  files "some placed by hand during a partial manual repair attempt" and the repair
  session's verdict that the directory was "NOT a standard install." Hand-copying package
  directories or hand-writing shims:
  - produces a tree whose layout, `node_modules/.package-lock.json`, bin links, and npm
    metadata no longer agree with what npm recorded, so any *future* npm operation
    (upgrade, audit, uninstall) will misbehave or refuse;
  - cannot know npm's shim-generation rules (cmd/ps1/sh triple, execution policies,
    prefix paths), so hand-written shims are typically wrong or stale like the surviving
    `dsh.ps1`;
  - mixes old and new files (alpha.5 leftovers + rc.1 copies), which can produce a
    host that half-boots with an inconsistent internal version — worse to diagnose than
    a clean missing command.
  The correct repair input is npm itself, not file surgery.

## 3. The repair that actually worked

From `repair-notes.md`, the external session (a different agent CLI, run outside dsh):

1. **Re-ran the formal, pinned install from the registry** in an environment where no dsh
   process was running:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`.
   This works where the in-session attempt could not *because nothing is executing from
   the tree being replaced*: an external shell's npm can remove/rename, fetch, link, and
   generate shims without killing its own caller. The result is a standard install — npm
   itself regenerates the `dsh`/`dsh.cmd`/`dsh.ps1` triple and reconciles the tree with
   its metadata, superseding both the interrupted state and the user's manual patching.
2. **Aligned the source checkout** used for host-source reference from the alpha.5 tag to
   `dsh-v0.1.2-rc.1` (no conflicts).

Verification recorded: `dsh / dsh.cmd / dsh.ps1` all regenerated and
`dsh --version → 0.1.2-rc.1`. Left to the user as real-machine checks: start
`dsh --profile web`, hard-refresh the browser, confirm plugins load, and optionally
clean up the `dsh-old-*` backups once rc.1 is confirmed.

## 4. The protocol the agent should have followed

**Recognition.** The agent should have identified itself as *inside* the upgrade target:
its host process is the globally installed `@deepseek-ai/dsh` package, its tool workers
are children of it, and the GUI depends on it staying alive. Given that relationship, the
global host upgrade is not a tool call it may execute — **it must never run the global
install itself**, in this session or any retry. This is the agent-discipline boundary:
"hand the user a procedure you must not execute yourself."

**The external procedure to hand the user** (order matters):

1. **Before npm runs:** fully stop every dsh process — the `dsh web` host (which ends
   this very session), any other sessions/worker processes it spawned, and any other dsh
   hosts on the machine. On Windows a running host also holds native-module file locks
   that can fail the install with EBUSY even from an external shell. A browser refresh is
   *not* a host stop. (Stopping the host also means this agent's session ends — that is
   expected and is precisely why the agent hands the procedure over rather than running it.)
2. **The install command, from an external terminal**, must be the *pinned* form:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` — the exact version, never a bare
   `npm install -g @deepseek-ai/dsh`: a bare name resolves to whatever the `latest`
   dist-tag currently points at, which can silently install a different (even older) line
   than the release notes the agent just read.
3. **After the install:** restart `dsh web`, hard-refresh the browser (the old client
   bundle is cached), verify `dsh --version` reports rc.1, and confirm plugins load.

**Which parts follow from known upgrade rules vs. what is new here:**

- Already established rules: (a) a running host must be stopped before a global upgrade
  (file-lock/EBUSY discipline); (b) the install must be version-pinned, never a bare
  package name; (c) restart + hard-refresh + version/plugin verification after upgrade;
  (d) repair of an interrupted install means re-running the formal pinned install, never
  hand-copying directories or hand-writing shims.
- New/specific to this incident: recognizing the *self-host* dimension — the requesting
  agent itself being a process of the upgrade target, which upgrades the failure from
  "risky" to "impossible by construction," upgrades the stopping rule from "recommended
  for file locks" to "mandatory and it includes killing your own session," and explains
  the no-result tool call signature. The alpha.5→rc.1 content assessment (below) is also
  incident-specific.

## 5. Prevention and post-upgrade checklist

**Agent-side guard.** Before executing any install/upgrade command, the agent (or a
host-side tool wrapper) should:

- Match the command's package identity against the host's own install identity — e.g.
  compare `@deepseek-ai/dsh` against the running host's package path
  (`node .../node_modules/@deepseek-ai/dsh/...`) or a host-provided "self install"
  identifier.
- If they match and the agent runs inside that host: **refuse the execution**, record why
  ("self-host upgrade is structurally fatal from inside a session"), and emit the external
  procedure of §4 as a user-facing instruction instead. A hard refusal (not a warning) is
  appropriate because retry variants (different cwd, shell wrapper, background job) all
  share the same defect.
- Additionally flag the interrupted-install signature — a tool call whose result was
  never durably recorded combined with the host dying — so any later session immediately
  suspects a broken install rather than debugging phantom "agent errors."
- The same guard should reject bare `npm install -g @deepseek-ai/dsh` (unpinned) even
  when proposed externally.

**Post-upgrade checklist for this machine** (given the repair notes' finding that the
alpha.5→rc.1 diff is 252 files of *pure `package.json` version bumps*, zero API/feature
changes):

- `dsh --version` → `0.1.2-rc.1` (shim triple regenerated — already verified).
- Restart `dsh --profile web`; hard-refresh the browser tab; confirm the GUI reconnects.
- Confirm plugins load and register (whale / progress / etc. per the repair notes) — since
  rc.1 has zero plugin-facing changes, plugins migrated for 0.1.2-alpha.x need **no
  re-migration**; any plugin failure indicates a broken install, not a migration gap.
- Confirm the npm global tree is now standard: no hand-patched leftovers, lock/metadata
  consistent, and a plain `npm ls -g @deepseek-ai/dsh` reports the pinned rc.1.
- Clean up the `dsh-old-*` backup directories only after the above passes.
- (Source-reference machine only) the workspace checkout alignment to
  `dsh-v0.1.2-rc.1` was done by the repair session; verify `git status` is clean there.

**Bottom line:** the in-session global upgrade failed by construction; the evidence
(remove-then-fetch-then-link interrupted, host dead, no durable tool result, shims missing
while content remained) is the fingerprint of a self-host upgrade kill; the only sound
repair is an external, pinned, formal re-install; and the correct agent behavior was to
recognize itself as part of the target and hand the user the stop-first external procedure
instead of executing it.
