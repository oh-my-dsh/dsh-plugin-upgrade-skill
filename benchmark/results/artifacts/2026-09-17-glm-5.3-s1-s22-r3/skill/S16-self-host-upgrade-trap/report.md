# S16 · The Self-Host Upgrade Trap — Report

Task: analyze the read-only evidence pack in the S16 fixture (session log excerpt,
before/after machine state, external repair notes) and explain the self-host upgrade
failure, the broken state, the repair, the correct protocol, and prevention. Methodology:
plugin-upgrade skill (Mode A read-only inspection; "Global DSH host upgrades (agent
discipline)" section), plus the v0.1.2-rc.1 corridor card. No files were modified, no
installs or migrations executed; the only write is this report.

Evidence sources (all read-only):
- fixture\agent-session-log.txt — tool-call log of the fatal in-session `npm install -g`
- fixture\env-state.txt — machine state before (0.1.2-alpha.5, healthy) and after (broken)
- fixture\repair-notes.md — external repair session record
- skill references\v0.1.2-rc.1.md — alpha.5→rc.1 corridor: 252 files, all package.json
  version bumps, zero plugin-facing changes

---

## 1. Structural root cause — why the in-session global upgrade fails by construction

The session and its tool worker are not bystanders of the upgrade target; they are parts
of it. The dsh web session lives inside the dsh host process
(`node .../node_modules/@deepseek-ai/dsh/...`), and the `pwsh` tool call that ran
`npm install -g @deepseek-ai/dsh@0.1.2-rc.1` executed inside the host's own worker
process — a child of the very package tree npm was about to remove and replace.

Sequence visible in the session log:

- 16:41:02 `npm warn cleaning node_modules/@deepseek-ai/dsh` — npm deletes the package
  directory the running host process is executing from. On Windows the host also holds
  native-module file locks in that tree, so removal and replacement contend with live
  handles.
- 16:41:05 `npm info remove @deepseek-ai/dsh`
- 16:41:09–16:41:31 fetch and `linkStuff` of the new version
- mid-`linkStuff` the web GUI dies (browser: connection lost), because the host process
  itself was taken down when its package content was pulled out from under it.

What dies first is the host process — the agent session, the web GUI server, and the tool
worker that was running the npm command all die together with it. That is why the tool
call never returned a result: the machinery that would have captured the subprocess exit,
recorded the tool result into the session log, and streamed it back to the agent was
destroyed before npm finished. The log records the call as interrupted with "no result
durably recorded; outcome unknown". This is not flakiness or a race that could go well on
a retry: a process cannot successfully replace the package tree it is currently executing
from. Failure is guaranteed by the ownership relationship, independent of timing, npm
version, or luck.

## 2. The broken state afterwards — command gone, content present

env-state.txt and the follow-up shell checks show the interrupted-install signature:

- `dsh --version` / `dsh web` → "command not found" (PowerShell: term not recognized).
- In `$env:APPDATA\npm`: `node_modules\@deepseek-ai\dsh\` present with rc.1 content
  (partially placed by the user's manual patch attempt), `dsh-old-0.1.1-rc.1` backup
  present, `dsh.ps1` stale (points into the old tree), `dsh.cmd` **missing**, `dsh`
  shim missing.

Why the command vanished while the content survived: npm's install pipeline is ordered —
fetch/extract the new package content first, then remove the old tree, then regenerate the
platform shims (`dsh`, `dsh.cmd`, `dsh.ps1`) as the final bin-linking step. The host
died during `linkStuff`, i.e. after content placement but before shim generation. The
package directory is therefore "full" but non-standard: an install that never completed its
metadata/bin phase, plus hand-swapped directories from the user's partial manual repair.
A stale `dsh.ps1` pointing into the old tree is worse than none in one way — it can
appear to work briefly or resolve against the wrong version — but the effective result is
that no shim reliably invokes the package, so the CLI is dead even though the code exists.
Only an external tool (the repair agent's CLI, run outside dsh) could operate on the
machine at that point, because dsh itself was the broken artifact.

Why hand-repair makes it worse: swapping or patching directories by hand reproduces
exactly the interrupted state — package content without a standard install record — with
no npm metadata, no guaranteed complete file set, no lifecycle completion, and no shims.
It also mixes generations (old backups, stale .ps1, partially replaced content), which is
precisely what the repair notes diagnosed as "NON-STANDARD". A registry install is atomic
from npm's perspective; a hand-patched tree is neither verifiable nor upgradable cleanly —
the next npm operation will treat it as corrupted state.

## 3. The repair actually applied, and why it works

The repair notes applied the correct fix: **re-run the formal pinned install from the
registry in an external shell** —

`npm install -g @deepseek-ai/dsh@0.1.2-rc.1`

— which regenerated `dsh`, `dsh.cmd`, and `dsh.ps1` and restored
`dsh --version → 0.1.2-rc.1`. They also aligned the source-reference checkout from the
alpha.5 tag to `dsh-v0.1.2-rc.1` (no conflicts).

Why this form works where the in-session attempt could not: it is executed by a process
that does not live inside the upgraded package tree. Nothing holds locks on the target
files, nothing dies mid-install when the old tree is removed, so npm can run to completion
including the shim-generation phase whose absence was the actual breakage. Re-running the
formal install (rather than hand-copying) is what converts "content present, install
interrupted" back into a standard, metadata-consistent install.

Verification recorded: shim trio present, `dsh --version` reports 0.1.2-rc.1. Left for
the user: start `dsh --profile web`, hard-refresh the browser, confirm plugins load
(whale / progress / etc.), and optionally clean up the `dsh-old-*` backups after rc.1 is
confirmed.

## 4. The protocol the agent should have followed

Recognition: the agent should have noticed that the upgrade target — the globally
installed `@deepseek-ai/dsh` — is the package its own session, GUI, and tool worker are
currently executing from. "Update dsh" is therefore not a plugin upgrade (Mode B) or a
source migration (Mode C); it is a global host upgrade, which the skill explicitly scopes
out of agent-executed work. It should never have executed the global install itself — not
even with a longer timeout, not on retry, not "carefully". The correct output is a handed-
over external procedure, not a performed action:

1. **Fully stop every dsh process first** (host, web GUI, any launchd/KeepAlive-style
   supervised hosts, background workers). A running host holds native-module file locks
   (EBUSY on Windows) and is the process that dies mid-install; a browser refresh is not
   a host stop. Because the host is fully stopped before npm runs, nothing can crash
   mid-install — a crash during the upgrade is a signature of doing it wrong, not a risk
   to tolerate.
2. **From an external terminal** (not from inside any dsh session), run the **pinned**
   install: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. The exact-version pin matters:
   a bare `npm install -g @deepseek-ai/dsh` resolves to the `latest` dist-tag, and
   dist-tags drift across channels (measured in the corridor card: the umbrella `latest`
   moved from 0.1.1-rc.2 to 0.1.2-rc.1 between 2026-09-03 and 09-04; RCs ride `next`,
   alphas ride `alpha`), so an unpinned install can silently land on a different line
   than intended.
3. **Restart `dsh web`, hard-refresh the browser, verify**: `dsh --version` shows the
   pinned version, version markers in the web client, and plugins load.

Which parts follow from known rules vs. new for this incident: the stop-before-install
ordering, the external-shell requirement, the pinned-version rule, and the
restart/refresh/verify tail are the skill's existing global-upgrade discipline; they were
already on record and the agent violated them by running the install in-session. What is
incident-specific is the repair corollary this event adds: if an install was already
interrupted, repair from an external shell by re-running the pinned formal install — never
by hand-copying package directories or hand-writing shims — and expect the failure state
(content present, shims missing, stale .ps1) rather than a clean "not installed".

## 5. Prevention

Agent-side guard. A pre-execution check in the tool layer (or a host-side gate on global
install commands) should:

- detect the pattern: `npm(-style) install -g` / `yarn global add` / `pnpm add -g`
  targeting `@deepseek-ai/dsh` (or any package that is an ancestor of the running
  process's own module path — compare the resolved package directory against the running
  host's `node_modules` chain);
- refuse the execution and return a structured explanation plus the external procedure
  above, instead of spawning the subprocess. The refusal must state the structural reason
  ("this session runs inside the package being replaced") so it is not retried with a
  bigger timeout. The same guard should also catch the adjacent repair trap: hand-copying
  directories or writing shims into the global tree after an interrupted install.

Post-upgrade checklist for this machine, given the alpha.5→rc.1 findings in the repair
notes (the corridor edge is 252 files, all `package.json` version bumps; zero
API/feature changes — plugins already migrated for 0.1.2-alpha.x need no re-migration):

1. `dsh --version` → 0.1.2-rc.1 and the web client reports the rc.1 version marker;
2. no ghost hosts: confirm no surviving process still runs alpha.5-era code from memory
   (per the corridor card's real-host record, a supervised KeepAlive host kept old code in
   memory while lazily importing new files — every host, including ones nobody started by
   hand, must be restarted);
3. plugins load and show Enabled (whale / progress / the user's fleet); since the edge has
   zero plugin-facing changes, plugin failures would indicate an install artifact, not a
   compatibility break — do not "re-migrate" anything for rc.1;
4. source-reference checkout stays on the `dsh-v0.1.2-rc.1` tag (already aligned by the
   repair, no conflicts);
5. clean up the `dsh-old-*` backup directories only after rc.1 is confirmed working;
   keep them until then as rollback reference;
6. confirm no residual non-standard state: shims `dsh`/`dsh.cmd`/`dsh.ps1` all
   regenerated by npm (not hand-written), and a subsequent npm operation treats the tree
   as a normal install.

## Verdict summary

- Root cause: structural self-replacement — the session/tool worker execute inside the
  package tree npm removed; the host died first, so the tool call could never return.
- Broken state: interrupted install signature — package content present, shims never
  generated (`dsh.cmd`/`dsh` missing, `dsh.ps1` stale), CLI dead; hand-patching
  reproduces exactly this non-standard state.
- Correct repair (applied): external, pinned, formal re-install from the registry;
  verified via shims + version + runtime plugin load.
- Correct protocol: never execute the global host upgrade in-session; hand over
  stop-all-hosts → external pinned install → restart/hard-refresh/verify.
- Prevention: agent-side self-upgrade guard keyed on the target being an ancestor of the
  running process's own module path, plus the rc.1-specific checklist above.
