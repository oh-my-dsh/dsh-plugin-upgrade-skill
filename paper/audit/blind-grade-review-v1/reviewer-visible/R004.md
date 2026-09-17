# S16 · The Self-Host Upgrade Trap — Diagnostic Report

Evidence pack: fixture/agent-session-log.txt, fixture/env-state.txt, fixture/repair-notes.md, fixture/README.md (read-only). Skill applied: dsh-plugin-upgrade — its "Global DSH host upgrades (agent discipline)" section covers exactly this incident class.

## 1. Structural root cause: self-upgrade from inside the host fails by construction

The evidence pack states the configuration explicitly (agent-session-log.txt header): the agent session was "running inside a dsh web session, GUI at http://127.0.0.1:3080, host process = node .../node_modules/@deepseek-ai/dsh/...". In dsh, a web session is not a client of a separate server — **the session and its tool worker are code executing inside the very npm global package tree that 'npm install -g @deepseek-ai/dsh@0.1.2-rc.1' was replacing.** The pwsh tool call was therefore not an external installer touching a stopped product; it was the product deleting and rewriting its own running source.

The log shows the exact death sequence:

- `[16:41:02] npm warn cleaning node_modules/@deepseek-ai/dsh` / `[16:41:05] npm info remove @deepseek-ai/dsh` — npm starts removing the tree the host is executing from;
- `[16:41:09] npm info fetch ...` / `[16:41:31] npm info linkStuff @deepseek-ai/dsh@0.1.2-rc.1` — then the annotation: "at this point the web GUI session DIED (browser tab: connection lost)."

What dies first is the **host process itself**: once npm removes/replaces module files the running Node process depends on, the host collapses mid-install and takes every session (including the agent) with it. The tool call never returned a result because the worker that would have produced the result no longer exists — the log records exactly this: `[tool result] <no result recorded — the tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown.>` This is deterministic ("by construction"), not flaky: any successful removal step necessarily destroys the executor. The skill states it directly: "the session IS the host process, npm removes/replaces the very package tree it executes from, the host dies mid-install (the tool call never returns)".

## 2. Broken state afterwards: content present, command gone

Before/after from env-state.txt:

- BEFORE: `dsh --version -> 0.1.2-alpha.5`, host running, "shims -> dsh, dsh.cmd, dsh.ps1 all present".
- AFTER: host dead; `dsh --version` and `dsh web` → "command not found"; "shims -> dsh.cmd and dsh MISSING; dsh.ps1 stale".

Why the command vanished while content remained: `dsh` is a **shim** (npm-generated launcher script in %APPDATA%\npm — `dsh`, `dsh.cmd`, `dsh.ps1`) that merely points into node_modules/@deepseek-ai/dsh. An npm global install's final step regenerates those shims via bin linking (linkStuff). The interrupted install died at/around that phase, so the package *content* survived ("@deepseek-ai/dsh package CONTENT present (rc.1 files ...)", and the shell listing shows `node_modules\@deepseek-ai\dsh\  <present, partially replaced>`) but the launchers were never (re)written: `dsh.cmd <MISSING>`, `dsh.ps1 <stale, points into the old tree>`. No shim → no command on PATH → "dsh: The term 'dsh' is not recognized as the name of a cmdlet, function, script file, or operable program file."

Why hand-swapping makes it worse: the user already tried ("some placed by hand during a partial manual repair attempt by the user"), and env-state.txt records the verdict: "NOT a standard install". repair-notes.md confirms: "the directory had been replaced/manually swapped, and the dsh / dsh.cmd shims were never generated". Hand-copying directories (a) leaves a non-standard tree npm cannot reason about or upgrade cleanly afterwards, (b) still does not generate the missing shims (the actual missing piece), (c) risks version/config inconsistency across a partially replaced tree, and (d) discards the registry's own record of the installation. The skill is categorical: "repair from an external shell by re-running the pinned formal install (never hand-copy package directories or hand-write shims)".

## 3. The repair actually applied, and why it works

repair-notes.md step 1: **"Repaired the shims by RE-RUNNING the formal install from the registry: npm install -g @deepseek-ai/dsh@0.1.2-rc.1"** — run from an *external* agent CLI, outside dsh, with the host already dead (so nothing executing from the tree could be killed). A formal registry install is idempotent over the damaged state: it replaces the manually-swapped directory with a canonical one **and** runs the bin-linking step that regenerates `dsh / dsh.cmd / dsh.ps1` — fixing both the content and the actually missing artifact (the shims) in one atomic, standard operation. Verification recorded: "-> dsh / dsh.cmd / dsh.ps1 all regenerated; dsh --version -> 0.1.2-rc.1". Step 2 aligned the source checkout from the alpha.5 tag to the dsh-v0.1.2-rc.1 tag, "no local-modification conflicts". Remaining verification is deliberately left to the user on the real machine: "start dsh --profile web, hard-refresh the browser, confirm plugins load (whale / progress / etc.)", plus optional cleanup of the dsh-old-* backups — matching the skill's runtime-validation layer (cold-start a real profile, verify activation, prove client registration rather than a bare HTTP 200).

## 4. The protocol the agent should have followed

What the agent should have recognized: it was being asked to upgrade **its own substrate**. Per the skill, this is not Mode B/C plugin work at all — and "when the requesting agent runs INSIDE a dsh session it is structurally fatal... Never execute the global host upgrade from inside a session on that host; hand the user the external procedure." So: the agent should **not execute the global install at all**. It should stop after the read-only release-notes assessment (which it did do) and hand the user this exact procedure, in order:

1. **Fully stop every dsh process before npm runs** — "a running host holds native-module file locks → EBUSY; a browser refresh is not a host stop". This is what makes the crash impossible: "Because the host is fully stopped before npm runs, nothing crashes mid-install — a crash during the upgrade is a signature of doing it wrong, not a risk to tolerate."
2. **From an EXTERNAL terminal, run the pinned install** `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` — pinned because "a bare package name resolves to the `latest` dist-tag and can silently downgrade to an older line"; external because the executor must not live inside the tree being replaced.
3. **Restart `dsh web`, hard-refresh the browser, verify version markers and plugins.**

Known rules vs. new: this sits outside Mode B/C, but the pieces follow from the skill's existing "Global DSH host upgrades (agent discipline)" section — the stop-first rule, the pinned-install rule, and the restart/verify checklist are all stated upgrade rules, as is the never-hand-copy repair rule. What is **new for this incident** is the observed failure signature and its post-mortem lesson: an in-session attempt is not merely risky but structurally fatal, with a specific interrupted-install fingerprint (GUI connection lost mid-linkStuff, tool result never durably recorded, shims deleted/never regenerated while package content remains), and the sanctioned repair is a formal external re-install rather than directory surgery. The alpha.5→rc.1 diff itself (repair-notes.md: "252 files, ALL of them package.json version bumps. Zero API/feature changes") confirms the upgrade was content-trivial — the entire incident was self-inflicted by the execution topology.

## 5. Prevention

**Agent-side guard.** A pre-flight check before any global package mutation, ideally as a hard tool-time guard (not a prompt): (a) detect that the install target's global root (@deepseek-ai/dsh) is an ancestor of the current process's own module path — i.e. "am I executing from inside the tree I am about to replace?"; if yes, refuse the tool call and emit the external procedure instead (stop all dsh processes → pinned external install → restart/verify). A cheaper secondary tripwire: any `npm install -g` whose package name matches the host package is refused in-session. This matches the skill's discipline boundary: hand the user a procedure the agent must not execute itself. A failed-attempt detector also helps: GUI connection lost + missing shims + package content present ⇒ classify as interrupted self-upgrade, prescribe external pinned re-install, forbid hand-swapping.

**Post-upgrade checklist for this machine**, informed by the alpha.5→rc.1 findings in repair-notes.md (pure version bump, zero plugin-facing changes):

1. `dsh --version` reports exactly 0.1.2-rc.1 (pinned target, no silent dist-tag drift); all three shims (`dsh`, `dsh.cmd`, `dsh.ps1`) exist and are freshly generated — no stale pointers into the old tree.
2. The global tree is a standard registry install — no hand-placed files, no mixed/partial replacement; npm reports a clean state so future upgrades behave.
3. Cold start `dsh --profile web`, hard-refresh the browser, and confirm plugins actually load and register (whale / progress / etc. — repair-notes.md "Left for the user"); prove client registration, not just a reachable GUI.
4. Source checkout aligned to the dsh-v0.1.2-rc.1 tag (done in the repair) with no local-modification conflicts.
5. Plugin re-migration: **not needed** — the corridor diff is 252 files, all version bumps, so plugins migrated for 0.1.2-alpha.x carry forward unchanged.
6. Only after rc.1 is confirmed working: clean up the dsh-old-* backup directories (e.g. dsh-old-0.1.1-rc.1) and discard stale shim-era residue npm has not already replaced.
