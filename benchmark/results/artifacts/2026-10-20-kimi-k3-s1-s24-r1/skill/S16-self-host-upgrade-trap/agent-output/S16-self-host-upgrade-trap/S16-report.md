# S16 · Self-Host Upgrade Trap — Incident Analysis Report

Evidence: fixture/agent-session-log.txt, fixture/env-state.txt, fixture/repair-notes.md (read-only).
Skill rule source: skills/plugin-upgrade/SKILL.md, section "Global DSH host upgrades (agent discipline)".
Cards referenced: DSH-0.1.2-RC1 corridor finding (references/v0.1.2-rc.1.md, zero plugin-facing changes) and rollup-0.1.2 dist-tag notes. Card IDs cited only; contents not pasted.

---

## 1. Structural root cause: why the in-session upgrade fails by construction

The failure is not a flaky race — it is geometrically guaranteed:

- **The session IS the host process.** The agent's web session executes inside the very
  node process whose on-disk tree is .../node_modules/@deepseek-ai/dsh/. The pwsh tool
  call ran "(timeout 600000ms, running inside the host's own worker process)"
  (agent-session-log.txt lines 6-7). The upgrade target and the executor are the same
  object.
- **npm must destroy the executor to replace the target.** A global reinstall first
  cleans/removes the old package tree: the log shows "npm warn cleaning
  node_modules/@deepseek-ai/dsh" (16:41:02) and "npm info remove @deepseek-ai/dsh"
  (16:41:05), then fetch (16:41:09) and "linkStuff" (16:41:31). The code the host
  process has mapped/executes — plus the module-resolution base it lazy-loads from — is
  deleted and rewritten underneath it mid-flight.
- **What dies first: the host process itself**, while npm is still writing the new tree.
  The GUI's WebSocket to the host drops ("browser tab: connection lost"), because the
  server end of that socket is the dying process. Everything downstream of the host —
  the session, the agent loop, and the tool-call plumbing — dies with it.
- **Why the tool call never returned a result:** a tool result is produced and durably
  recorded by the host's tool worker after the child command exits. Here the worker (and
  its parent host) was killed by its own child operation before npm finished; there was
  no surviving process to observe the exit, assemble the result, or persist it. Hence
  the log entry "<no result recorded — the tool call was interrupted after it was
  recorded, but no result was durably recorded. Its outcome is unknown.>" (lines 17-18).
  This "call recorded, result absent" signature is itself the fingerprint of a
  self-destructive tool call, not of a command that merely failed.

A self-upgrade executed *from the thing being upgraded* therefore cannot succeed: the
installer's success requires replacing files the executor depends on, so the executor is
sacrificed partway, and neither success nor failure can ever be reported back.

## 2. The broken state afterwards

From env-state.txt (BEFORE vs AFTER) and the post-incident shell probes:

- **Why the dsh command vanished although package content was still present.** The
  command a shell invokes is not the package tree; it is the *shims* npm generates in the
  global bin directory (%APPDATA%\npm on Windows): dsh, dsh.cmd, dsh.ps1. npm's
  interrupted run had completed the remove and the content placement (linkStuff began)
  but never reached the shim/link regeneration step — the host died mid-linkStuff.
  Result (log lines 30-34, env-state line 15): dsh.cmd and the extensionless dsh shim
  are MISSING; dsh.ps1 is stale, pointing into the old, now-replaced tree; the
  node_modules\@deepseek-ai\dsh\ directory holds rc.1 content that is unreachable as a
  command. "Command not found" with content on disk is the exact signature of an
  install interrupted between content placement and shim generation.
- **Why hand-swapping or hand-patching directories makes it worse.** The manual repair
  attempt by the user (env-state lines 12-14: "some placed by hand during a partial
  manual repair attempt") produced what the repair notes call a NON-STANDARD install:
  "the directory had been replaced/manually swapped, and the dsh / dsh.cmd shims were
  never generated". Hand-copied trees carry no npm provenance (no _integrity/
  _package-lock metadata npm itself records, no bin links, no correct
  %APPDATA%\npm shims, possibly mixed alpha.5/rc.1 files), so npm can no longer cleanly
  reason about the tree — later installs may mis-detect it, and hand-written shims can
  silently point at the wrong entry or stale backup directories (dsh-old-0.1.1-rc.1 was
  still sitting next door). Repair notes explicitly record the rule: repair by
  re-running the pinned formal install, "never hand-copy package directories or
  hand-write shims".

## 3. The repair actually applied, and why it works

What the external repair session did (repair-notes.md):

1. **Re-ran the formal, pinned install from the registry, from outside dsh:**
   npm install -g @deepseek-ai/dsh@0.1.2-rc.1
   → all three shims (dsh / dsh.cmd / dsh.ps1) regenerated; dsh --version → 0.1.2-rc.1.
2. **Aligned the host-source reference checkout** from the alpha.5 tag to the
   dsh-v0.1.2-rc.1 tag (no local-modification conflicts).

Why this works where the in-session attempt could not:

- **Externality**: the repairing process (a different agent CLI in an external shell)
  does not execute out of %APPDATA%\npm\node_modules\@deepseek-ai\dsh, so npm's
  remove/link sequence does not kill the repairer mid-run. The full install lifecycle —
  including the shim/link phase the interrupted run never reached — completes.
- **Idempotent, provenance-restoring form**: the formal registry install overwrites the
  non-standard tree with a canonical one and regenerates the bin shims, undoing both the
  interruption damage and the hand-patch damage in one step.
- **Pinning**: @0.1.2-rc.1 is explicit, so no dist-tag resolution can silently pick a
  different line (per rollup-0.1.2 dist-tag notes, bare package names follow latest).

Verification recorded in the notes: dsh / dsh.cmd / dsh.ps1 all present again and
dsh --version returns 0.1.2-rc.1. Remaining verification was deliberately handed to the
user on the real machine: start dsh --profile web, hard-refresh the browser, confirm
plugins load (whale / progress / etc.); optional cleanup of dsh-old-* backups once rc.1
is confirmed.

## 4. The protocol the agent should have followed

**What the agent should have recognized about itself:** it was a session running INSIDE
the dsh host process on the target machine — i.e., it lives in the very package tree the
upgrade replaces. Executing the global upgrade would be self-destruction, not
administration. The discipline boundary: this is a "hand the user a procedure you must
not execute yourself" case, not a "do it for the user" case.

**Should it execute the global install at all? No** — never from inside a session on
that host (SKILL.md, "Global DSH host upgrades"). The correct action is to hand the user
the exact external procedure:

1. **Before npm runs — fully stop every dsh process.** A running host holds
   native-module file locks (EBUSY risk on Windows) and owns the tree being replaced;
   note that a browser refresh is NOT a host stop — the server process must actually
   exit.
2. **From an EXTERNAL terminal** (outside any dsh session), run the pinned install:
   npm install -g @deepseek-ai/dsh@0.1.2-rc.1
   The pin matters: a bare name resolves to the latest dist-tag and can silently
   downgrade/switch lines. Because the host is fully stopped first, nothing crashes
   mid-install — a crash during the upgrade is a signature of doing it wrong, not a
   risk to tolerate.
3. **Restart and verify**: restart dsh web, hard-refresh the browser, verify version
   markers (dsh --version → 0.1.2-rc.1) and that plugins load.

**Which parts follow from known upgrade rules vs. what is new here:**
- Already covered by known rules (SKILL.md agent-discipline section): the never-in-session
  prohibition, the full-host-stop precondition, the pinned-install requirement, the
  restart/hard-refresh verification, and the interrupted-install repair form (re-run the
  pinned formal install; never hand-copy trees or hand-write shims).
- New/confirmed by this incident's evidence: the observed *signature* for diagnosis —
  a tool call recorded with no durably recorded result, plus post-incident
  "command not found" with package content present and dsh.cmd/dsh missing while dsh.ps1
  is stale — and the concrete demonstration that a partial manual directory swap
  converts a recoverable interrupted install into a non-standard install requiring the
  formal reinstall to restore provenance.

## 5. Prevention

**Agent-side guard against this class of failure:**
- A pre-execution check in the tool layer (or system-prompt-level discipline with
  tooling backstop) that detects *self-referential destructive operations*: when a
  session's host executable path is inside the npm global prefix tree, refuse/redirect
  any package-manager invocation that removes, reinstalls, or upgrades @deepseek-ai/dsh
  (or the tree containing the current process). Detection inputs are cheap:
  process.execPath / module resolution root vs. the resolved install target.
- On detection, the agent should not even partially run the command; it should emit the
  external procedure (stop host → external pinned install → restart + verify) and mark
  the operation as user-executed-only.
- Post-hoc detection: treat "tool call recorded but no result durably recorded" plus
  host disconnect as the interrupted-self-upgrade signature and surface the external
  repair command rather than retrying in-session.

**Post-upgrade checklist for this machine (given the alpha.5→rc.1 findings):**
- Shims/CLI: dsh, dsh.cmd, dsh.ps1 all present and fresh; dsh --version → 0.1.2-rc.1
  (repairs the exact damage seen here).
- Runtime: start dsh --profile web, hard-refresh the browser (drop cached client),
  confirm version markers in the GUI.
- Plugins: confirm whale / progress / etc. load. Per the corridor finding in card set
  DSH-0.1.2-RC1 (references/v0.1.2-rc.1.md): the alpha.5..rc.1 diff is 252 files of pure
  package.json version bumps with zero API/feature changes, so plugins migrated for
  0.1.2-alpha.x need NO re-migration — plugin failures after this upgrade point at
  install damage (as here), not at compatibility drift.
- Hygiene: once rc.1 is confirmed healthy, optionally remove the dsh-old-* backup
  directories (e.g. dsh-old-0.1.1-rc.1) that the stale dsh.ps1 era left behind.
- Reference checkout: keep the host-source reference aligned to dsh-v0.1.2-rc.1
  (already done by the repair session).

---

### Summary

The incident was structural: the agent, its tool worker, and the GUI all live in the
host process rooted in the package tree npm was replacing; npm's remove/link sequence
killed the host mid-install, so the tool call could never return and the install never
reached shim generation — leaving rc.1 content on disk but the dsh command dead, a state
hand-patching only deepened. The correct repair — re-running the pinned formal install
from an external shell — restores provenance and shims because the repairing process
survives the replacement. The correct protocol was to never run the upgrade in-session:
stop all dsh processes, run npm install -g @deepseek-ai/dsh@0.1.2-rc.1 externally,
restart and verify. Guards should detect self-referential upgrades before execution and
recognize the interrupted-install signature afterwards; post-upgrade verification is
cheap precisely because alpha.5→rc.1 carries zero plugin-facing changes.
