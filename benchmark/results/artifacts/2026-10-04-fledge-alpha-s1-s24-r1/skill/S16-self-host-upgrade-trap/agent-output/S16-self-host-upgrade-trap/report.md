# S16 · The Self-Host Upgrade Trap — Incident Report

Evidence: `fixture/agent-session-log.txt`, `fixture/env-state.txt`, `fixture/repair-notes.md` (read-only).
Skill rules cited: `skills/plugin-upgrade/SKILL.md` ("Global DSH host upgrades (agent discipline)"),
`references/rollup-0.1.2.md` (R-08, R-12, layered validation), `references/troubleshooting.md` (EBUSY row),
`references/v0.1.2-rc.1.md` (alpha.5→rc.1 zero-card edge).

## 1. Structural root cause — fatal by construction, not by accident

The requesting agent was a **dsh web session whose host process executes directly out of the npm global
package tree** (`host process = node .../node_modules/@deepseek-ai/dsh/...`, GUI at `http://127.0.0.1:3080`).
The tool worker that ran `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` was spawned **by that host process
itself** (`running inside the host's own worker process`). So the entity performing the replacement and the
entity being replaced are the same tree:

- npm's global upgrade is **remove-then-replace**: the log shows `npm warn cleaning
  node_modules/@deepseek-ai/dsh` → `npm info remove @deepseek-ai/dsh` → fetch → `npm info linkStuff`.
  Between `remove` and the completion of `linkStuff`, the package directory the host process loaded (and
  continues to lazily load modules and workers from) is deleted or half-written underneath the running
  process.
- **What dies first is the host process itself** — and with it (a) the tool worker running npm, (b) the
  session, and (c) the HTTP/WebSocket server behind the GUI. The browser tab is only a client of that
  server, so its "connection lost" is a *symptom* of the host dying, not the cause. Closing/refreshing the
  browser never stops a host; here the host stopped because its own files were removed.
- **The tool call never returned a result by construction**: the result would have to be delivered by the
  session/host that npm just killed. The log records the call and then `<no result recorded … outcome
  unknown>` — the executor was destroyed mid-flight, so no success/failure could ever be durably reported.
  Retrying would reproduce the same crash at the same phase; this is a structural self-amputation, not a
  flaky install.

This is exactly the failure the skill pre-describes (SKILL.md: "the session IS the host process, npm
removes/replaces the very package tree it executes from, the host dies mid-install (the tool call never
returns)") and the R-12 hazard class ("the upgrade target may be the currently running host").

## 2. The broken state afterwards

The `dsh` command on PATH is **not the package content** — it is the set of **shims** npm generates in the
global prefix (`$env:APPDATA\npm`): `dsh`, `dsh.cmd`, `dsh.ps1`, which point into the package's bin entry.
The interrupted install died around `linkStuff`: rc.1 package files were (partly) placed, but the
bin-linking step never completed. Afterwards:

- `dsh.cmd` and `dsh` are **MISSING**; `dsh.ps1` is **stale, pointing into the old tree**;
- `node_modules\@deepseek-ai\dsh\` is present but "partially replaced" — some rc.1 files were placed by
  npm, some placed **by hand** during the user's partial manual repair attempt; the tree is **non-standard**.

Hence `dsh --version` → "not recognized": content without shims is not an installed CLI.

Why hand-swapping / hand-patching directories makes it worse:

1. **It desynchronizes npm's own bookkeeping.** A manually swapped/copied tree is a non-standard install;
   npm no longer knows what is installed, so subsequent installs, repairs, or uninstalls behave
   unpredictably (as the repair notes confirm: "the directory had been replaced/manually swapped, and the
   dsh / dsh.cmd shims were never generated").
2. **It produces mixed-cohort franken-trees.** Partial copies blend alpha.5 and rc.1 files in one package
   directory; such a tree can half-boot and fail in ways no version card covers.
3. **Hand-written shims can point at the wrong tree.** The stale `dsh.ps1` already demonstrated this —
   with a `dsh-old-0.1.1-rc.1` backup directory sitting next to the real one, a hand-fix can silently
   launch the old code or a mix.
4. **It destroys the clean rollback baseline** (`dsh-old-*` backups) and the ability of the formal
   installer to do the one correct repair: regenerate the shims itself.

The skill rule is explicit: an interrupted install is repaired by **re-running the pinned formal install
from an external shell — never hand-copy package directories or hand-write shims**.

## 3. The repair actually applied

The external repair session (a **different agent CLI, run outside dsh**) did:

1. **Re-ran the formal pinned install from the registry**: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   → npm regenerated all three shims (`dsh` / `dsh.cmd` / `dsh.ps1`); `dsh --version` → `0.1.2-rc.1`.
2. **Aligned the host-source reference checkout** from the alpha.5 tag to `dsh-v0.1.2-rc.1` (no
   local-modification conflicts), so the source tree used for reference matches the installed host.

Why this form works where the in-session attempt could not:

- **The repairing process does not execute from the tree being replaced.** npm's remove/replace window
  harms only processes running out of that tree; an external shell has no dependency on it, so nothing
  dies mid-install and the install runs to completion — including the bin-linking phase that was never
  reached in-session.
- **No running host → no file locks** (the EBUSY failure mode of in-place replacement on Windows, per the
  troubleshooting row) and no client connections to sever.
- **A completed formal install is the only reliable shim generator**; it also heals the non-standard tree
  by laying down the authoritative package content over the hand-patched one.

Verification: `dsh --version` returns exactly `0.1.2-rc.1`; all three shims exist and are freshly
generated (not stale). Deferred real-machine verification left for the user: start `dsh --profile web`,
hard-refresh the browser, confirm plugins load (whale / progress / etc.); optional cleanup of the
`dsh-old-*` backups once rc.1 is confirmed good.

## 4. The protocol the agent should have followed

**Self-recognition (before any command).** The agent should have resolved its own execution context:
its host process runs from `.../npm/node_modules/@deepseek-ai/dsh/...`, so the requested target
`@deepseek-ai/dsh` **is the host it is running inside**. Upgrading it is not Mode B/C plugin work; it is
self-modification of the executor. Per R-12's minimum check, target = current Harness host → the agent
**must not unconditionally perform an operation that takes the host down**, and per the skill's host-upgrade
discipline it **must not execute the global install from inside the session at all**.

**Hand the user the external procedure instead (order matters):**

1. **Before npm runs — fully stop every dsh process** (all profiles/hosts, including any auto-restarted or
   service-managed ones). Closing or refreshing the browser tab does **not** stop the host; the file locks
   are held by the host process, and on Windows a running host makes the replacement fail with EBUSY or
   worse, half-apply.
2. **From an EXTERNAL terminal, run the pinned install**:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   The exact-version pin is mandatory: a bare `npm install -g @deepseek-ai/dsh` resolves through the
   `latest` dist-tag, which drifts (measured in the corridor: `latest` sat on `0.1.1-rc.2` while rc.1 was
   on `next`, then moved to `0.1.2-rc.1` a day later) and can silently install a different line than the
   one whose release notes were reviewed.
3. **After the install completes — restart `dsh web`, hard-refresh the browser, and verify**: version
   markers report `0.1.2-rc.1` and the plugin fleet loads. Because the host was fully stopped before npm
   ran, nothing crashes mid-install — **a crash during the upgrade is a signature of doing it wrong**, not
   a risk to tolerate. If an install was already interrupted, the repair is the same pinned formal
   re-install from an external shell.

**Provenance of the procedure.** Every step already follows from known upgrade rules: R-12 (identify the
target's relationship to the running host; hand control back / use an external path), SKILL.md "Global DSH
host upgrades" (the three-step external procedure, the pin rule, the interrupted-install repair rule), the
troubleshooting EBUSY row (fully stop the host before replacing files; browser refresh ≠ host stop; pin
exact versions), and R-08 (dist-tag/pin pitfalls). **New for this incident** is the concrete evidentiary
signature — *package content present + `dsh`/`dsh.cmd` shims missing + one stale `dsh.ps1` + tool call
recorded with no result* — as the recognizable fingerprint of an in-session self-upgrade, and its
confirmation that the pinned re-install regenerates shims and fully heals that state.

## 5. Prevention

**Agent-side guard (this class of failure, not just this command):**

- Before executing any install / upgrade / uninstall / stop / restart tool call, classify the target
  against the agent's own execution path: if the agent's session, worker, or host process resolves into
  the tree being modified (global npm prefix containing `@deepseek-ai/dsh`, the active profile, the
  current preset, a runtime dependency of the host — the R-12 checklist), **refuse the tool call and emit
  the external procedure for the user instead**. Self-host modification is a hard boundary between "do it
  for the user" and "hand the user a procedure the agent must not execute itself".
- Require an exact-version pin for any host install command the agent even *quotes*; never issue or
  endorse a bare `@deepseek-ai/dsh` install.
- Treat "the GUI died / browser disconnected" as evidence the host may be down — never as proof a host
  was stopped cleanly, and never as a reason to retry the same command.
- Never attempt directory swaps, hand-copied package trees, or hand-written shims as a repair path.

**Post-upgrade checklist for this machine (given the alpha.5→rc.1 findings):**

- The edge is a **pure version bump**: 252 files, all `package.json` version strings, **zero API/feature
  changes** — plugins migrated for `0.1.2-alpha.x` need **no re-migration**; verification effort goes to
  the install itself, not plugin compatibility.
- `dsh --version` = `0.1.2-rc.1`; all three shims (`dsh`, `dsh.cmd`, `dsh.ps1`) present and regenerated
  (no stale pointers into old trees); no hand-placed files left in the package directory (tree is a
  standard install again).
- Start `dsh --profile web`, **hard-refresh** the browser, confirm the client version marker
  (`0.1.2-rc.1-a66e470`), zero console errors, and that the plugin fleet loads (whale / progress / etc.)
  and shows Enabled; run at least one message → tool → response round.
- Source-reference checkout aligned to the `dsh-v0.1.2-rc.1` tag; check for **ghost hosts** — any
  still-running host process started from the old checkout (including service/`KeepAlive`-managed ones)
  must be restarted, or it keeps old code in memory while lazily importing new files.
- Clean up `dsh-old-*` backup directories only after rc.1 is confirmed healthy on the real machine.
