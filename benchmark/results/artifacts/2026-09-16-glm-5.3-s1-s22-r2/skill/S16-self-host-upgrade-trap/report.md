# S16 · The Self-Host Upgrade Trap — Read-Only Incident Report

**Mode:** A · inspect (read-only diagnosis; skill `plugin-upgrade`, "Global DSH host upgrades (agent discipline)" section)
**Evidence:** `fixture/agent-session-log.txt`, `fixture/env-state.txt`, `fixture/repair-notes.md` (read-only, unchanged)
**Corridor card applied:** `references/v0.1.2-rc.1.md` (alpha.5 → rc.1, zero cards, verified 2026-09-03 — same date as this incident)

---

## 1. Structural root cause: why the in-session global upgrade fails by construction

The session and its tool worker are not merely *running on* the machine being upgraded — they
are processes **inside the thing npm was replacing**. Per the session log header, the host
process is `node .../node_modules/@deepseek-ai/dsh/...`: the dsh web GUI, the agent session,
and the pwsh tool worker that executed the npm command all live in a process whose code is
loaded from the very global package directory `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
removes and rewrites. npm's own log shows the sequence (`16:41:02 cleaning` →
`16:41:05 remove` → `16:41:09 fetch` → `16:41:31 linkStuff`): during "cleaning"/"remove"
npm deletes or truncates files the running host still has mapped and lazily imports. On
Windows, a running process also holds native-module file locks, so removal/replacement can
raise EBUSY mid-way; the host either crashes on the next lazy import of a deleted module or
dies when its locked files become inconsistent.

What dies first is the **host process** — the web GUI connection dropped at ~16:41 mid-call
("connection lost" in the browser tab). The tool worker is a child of that host, so it dies
with it, *before* the npm child process finishes the install lifecycle (the shim-generation
and linkStuff/bin steps at the end). That is exactly why the tool call never returned a
result: the session log records the call as interrupted with no durably recorded outcome —
the process that would have captured and written the tool result was killed while the tool
was still executing. This is not a timeout and not flakiness; the failure is deterministic
whenever the upgraded package tree is the executing tree. A crash **during** the upgrade is a
signature of doing the upgrade wrong (from inside), not a risk to tolerate.

## 2. The broken state afterwards

From `env-state.txt` and the new-shell probe in the session log:

- **Command vanished despite content present.** `dsh --version` / `dsh web` → "command
  not found", while `node_modules\@deepseek-ai\dsh\` is present (partially replaced).
  The npm install died between the content-extraction phase and the final shim/bin-linking
  phase: `dsh.cmd` and the extensionless `dsh` shim are **missing**, and `dsh.ps1` is
  **stale** (still pointing into the old tree). npm's global install is a two-part operation
  — package content *and* generated shims under `%APPDATA%\npm` — and only the first part
  ran to completion. A CLI whose shims were never (re)generated is dead regardless of how
  complete the package directory looks.
- **Hand-swapping directories makes it worse.** The "AFTER" state records that the user's
  partial manual repair attempt *hand-placed some rc.1 files* into the package directory,
  and the repair notes confirm the result was a **non-standard install**: manually mixed
  content plus missing shims is a state no tool can reason about — file mix from two
  versions, no guarantee the packed file set matches the registry tarball, no bin metadata
  consistency. Hand-written shims or directory swaps can point into the wrong tree
  (exactly what the stale `dsh.ps1` already does), silently mix alpha.5 and rc.1 code, and
  leave native modules (`node-addon-system`, etc.) mismatched with their JS wrappers.
  Never repair by hand-copying package directories or hand-writing shims; the only sound
  repair is to re-run the formal registry install from outside.

## 3. The repair actually applied, why it works, and verification

The repair notes show the external agent CLI (running *outside* dsh, so not executing from
the tree being replaced) did:

1. **Re-ran the formal pinned install from the registry:**
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. This works where the in-session attempt
   could not because nothing depends on the target tree while npm runs — the host is already
   dead/stopped, no file locks, and the install runs to completion through the *whole*
   lifecycle, regenerating `dsh`, `dsh.cmd`, and `dsh.ps1` shims and replacing the
   hand-mangled directory with the canonical registry content. Result:
   `dsh --version -> 0.1.2-rc.1`.
2. **Aligned the source checkout** (the workspace used for host-source reference) from the
   alpha.5 tag to `dsh-v0.1.2-rc.1`; no local-modification conflicts.

Verification: shim files all present and regenerated; version marker reports `0.1.2-rc.1`;
left for the user (real-machine verification): start `dsh --profile web`, hard-refresh the
browser, confirm plugins load (whale / progress / etc.). Optional cleanup of `dsh-old-*`
backup directories only after rc.1 is confirmed.

## 4. The protocol the agent should have followed

**Recognition.** The agent should have recognized its own relationship to the upgrade
target: it was a session running *inside* the dsh host process, and the request was to
replace the global package tree that host executes from. Upgrading the dsh host is **not**
Mode B/C plugin work at all — it falls under the skill's agent-discipline rule: **never
execute the global host upgrade from inside a session on that host.** The agent must not
run the global install, no matter how benign the release looks (here the corridor was even
a pure version bump — the failure had nothing to do with the release's content).

**The external procedure to hand the user** (order matters):

1. **Fully stop every dsh process first** — including background/service-managed hosts
   (the rc.1 card's launchd-managed host is the cautionary example: a KeepAlive host kept
   old code in memory after the checkout flip). A running host holds native-module file
   locks (EBUSY) and is exactly the in-session trap again. A browser refresh is *not* a
   host stop.
2. **From an EXTERNAL terminal**, run the pinned install:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. The explicit version pin is mandatory: a
   bare `npm install -g @deepseek-ai/dsh` resolves the `latest` dist-tag, which does not
   track RCs (RCs ride `next`), and can silently install an older line (at incident time
   `latest` was `0.1.1-rc.2` / only later `0.1.2-rc.1`).
3. **Restart `dsh web`, hard-refresh the browser, verify** version markers and that
   plugins load.

**What follows from known rules vs. what is new:** the "never upgrade the host from inside
a session", the stop-first ordering, the pinned-install requirement, and the
restart/hard-refresh/verify tail all follow directly from the skill's existing
global-host-upgrade discipline. New for this incident: (a) the repair side — if an install
was already interrupted, repair only by re-running the pinned formal install from an
external shell, never by hand-copying directories or hand-writing shims (the user's manual
swap made the state non-standard); and (b) the tail additionally covers re-aligning any
host-source reference checkout to the target tag and post-repair plugin-load verification.

## 5. Prevention

**Agent-side guard.** Before executing any `npm install -g` (or any package-manager
global write), the agent should check whether the target package (or a package that owns
code it is executing from) is the running host's own tree — e.g. compare the resolved
install path against the host process's executing entry (`node .../node_modules/@deepseek-ai/dsh/...`)
— and refuse to run it in-session, instead emitting the external procedure above as the
deliverable. The boundary is: an agent may *diagnose and hand over* a procedure it must not
*execute itself*. A mid-install host crash should be treated as a signature of doing it
wrong, triggering the interrupted-install repair path rather than a retry.

**Post-upgrade checklist for this machine** (informed by the repair notes' alpha.5 → rc.1
finding that the corridor is 252 files of pure `package.json` version bumps, zero API/
feature changes — matching corridor card `v0.1.2-rc.1.md`, zero cards):

- Start `dsh web` (or `dsh --profile web`) from the repaired install; confirm
  `dsh --version -> 0.1.2-rc.1` and the web client reports the rc.1 version marker.
- Hard-refresh the browser; confirm zero console errors and that plugins load
  (whale / progress / etc.) and show Enabled in Settings → Plugins.
- Because the corridor has zero plugin-facing changes, **no plugin re-migration** is
  needed — plugins already on any 0.1.2-alpha.x are compatible; do not trigger
  migrations that would imply API changes.
- Check for ghost hosts: any long-running/service-managed host started before the flip
  still runs alpha.5 code in memory — restart each one (a browser refresh is not a host
  restart).
- After confirmation, optionally clean up the `dsh-old-*` backup directories; also
  replace the stale artifacts left by the interrupted install and the user's manual swap
  (already superseded by the formal re-install).
- Run one core session flow (message → tool → response) to prove the repaired install
  works end-to-end.

---

## Skill report sections

- **Pre-existing (baseline):** not collected — read-only Mode A incident analysis; no
  builds, tests, or installs were run.
- **Completed:** read-only analysis of all three fixture evidence files; root-cause,
  broken-state, repair, protocol, and prevention sections above; corridor card
  `v0.1.2-rc.1.md` cross-checked against the repair notes' alpha.5→rc.1 diff finding
  (252 files, all version bumps — they agree).
- **Skipped:** Mode B/C migration work (inapplicable — no plugin source to migrate; the
  corridor has zero plugin-facing changes); execution of any install or repair (forbidden
  by the read-only scope); other corridor cards (the corridor edge is a pure version bump,
  no API surfaces hit).
- **Pending/residual risk:** real-machine verification steps (host restart, browser
  hard-refresh, plugin-load check, ghost-host sweep) are the user's to execute; the
  fixture is a static evidence pack, so timing/lock details of the mid-install death are
  inferred from the log, not reproduced.
- **Rollback:** nothing to roll back — no state outside the report file was touched; the
  fixture remained read-only and unchanged.
- **Recommendations:** implement the agent-side self-upgrade guard (§5); keep RC installs
  on the `next` channel guidance and the "repair = pinned formal re-install only" rule in
  the incident-response docs.
