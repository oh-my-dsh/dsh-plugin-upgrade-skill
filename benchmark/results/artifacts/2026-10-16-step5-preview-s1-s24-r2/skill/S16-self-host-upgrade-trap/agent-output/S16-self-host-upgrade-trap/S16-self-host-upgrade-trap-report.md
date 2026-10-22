# S16 · The Self-Host Upgrade Trap — Analysis Report

Evidence: `fixture/agent-session-log.txt`, `fixture/env-state.txt`, `fixture/repair-notes.md` (read-only, unchanged).
Governing rules: the plugin-upgrade skill's "Global DSH host upgrades (agent discipline)" section in
`SKILL.md`, rollup entry **R-12** ("The upgrade target may be the currently running host"), the
troubleshooting row for benchmark task **S12-global-upgrade-ebusy-trap**, and the version cards
`references/v0.1.2-rc.1.md` (alpha.5→rc.1) and `references/v0.1.2-alpha.5.md` (A5-03).

---

## 1. The structural root cause — failure by construction, not by accident

**What the session and its tool worker are relative to the upgrade target.** The requesting agent ran
INSIDE a dsh web session: the host process was `node .../node_modules/@deepseek-ai/dsh/...`, the GUI at
http://127.0.0.1:3080 (fixture/agent-session-log.txt:2-3; fixture/env-state.txt:3-4, "agent session ->
active, executing INSIDE that host process"). The pwsh tool call that ran
`npm install -g @deepseek-ai/dsh@0.1.2-rc.1` executed inside the host's own worker process — i.e. the
executor chain was **session → host process → tool worker → npm**, every link a descendant of the very
process whose code npm was about to replace. The upgrade target (the global `@deepseek-ai/dsh` package
tree) *is* the runtime underpinning the session. That is rollup **R-12**'s exact case: "the plugin,
preset, runtime component, or dependency being modified may also be part of the Harness that is
currently running … ordinary upgrade operations can directly affect the runtime environment that is
executing the upgrade task itself."

**Why it fails by construction.** Three independent structural facts, any one of which makes the
operation unsafe, and the first two make it fatal with probability 1 — not a race that could have gone
the other way:

1. **npm's global upgrade of an already-installed package begins by removing the old tree.** The log
   shows the sequence verbatim: `npm warn cleaning node_modules/@deepseek-ai/dsh` (16:41:02) →
   `npm info remove @deepseek-ai/dsh` (16:41:05) → fetch (16:41:09) → `linkStuff` (16:41:31)
   (fixture/agent-session-log.txt:9-12). Deleting/renaming the old package tree deletes the files the
   running host executes from. A process cannot survive the removal of its own code base as a matter
   of mechanism, not luck.
2. **The executor is inside the blast radius.** The host dies first — it is the process whose files are
   being removed. When the host dies, the tool call's result transport (the session↔worker channel
   through that host) dies with it. That is why the tool call **never returned a result**: the log
   records "recorded after it was recorded, but no result was durably recorded. Its outcome is
   unknown" (fixture/agent-session-log.txt:17-18). The agent was not given a failure to react to; the
   witness of its own action died mid-call. The browser tab's "connection lost" is the same event seen
   from the GUI side (line 14).
3. **On Windows a running host also holds file locks** on loaded native modules (the S12 row: a real
   case where `koffi.node` was locked by the host PID; "the file lock is on the host, not the
   browser"). Even without the self-hosting problem, replacing the tree under a live host would fail
   with EBUSY. Self-hosting fires first here, but both mechanisms point the same way.

The skill states the conclusion verbatim: "when the requesting agent runs INSIDE a dsh session it is
**structurally fatal**: the session IS the host process, npm removes/replaces the very package tree it
executes from, the host dies mid-install (the tool call never returns) … **a crash during the upgrade
is a signature of doing it wrong, not a risk to tolerate**." The agent had correctly done the Mode-A
part (checked the release notes) and then crossed the discipline boundary: "never let 'help me check
for updates' slide into installing or changing code" — and a global host upgrade is carved out
explicitly as never executable from inside a session on that host.

## 2. The broken state afterwards

**Why `dsh` vanished although the package content was present.** On Windows the global `dsh` command
is not the package itself — it is three shim files in `%APPDATA%\npm` (`dsh`, `dsh.cmd`, `dsh.ps1`)
that npm generates **only at the end of a successful install**, each pointing into the global package
tree. The interrupted install died between npm's `remove` of the old tree (16:41:05) and its final
bin/shim generation step: the old shims were already displaced, the new ones were never written. The
post-mortem shell confirms it line by line (fixture/agent-session-log.txt:30-33): `dsh.ps1` present but
**stale** (still points into the old tree), `dsh.cmd` **MISSING**, the extensionless `dsh` **MISSING**;
`node_modules\@deepseek-ai\dsh\` present but "partially replaced". `dsh --version` therefore fails
at PATH resolution — "not recognized as the name of a cmdlet" — before any package code could run
(fixture/env-state.txt:10-11, 15). Package content on disk is irrelevant to command resolution without
shims.

**The broken state has two layers.** Beyond npm's interrupted install, the user had already attempted a
**partial manual repair**: the tree contained rc.1 content "some placed by hand", making the install
**NON-STANDARD** — "the directory had been replaced/manually swapped" (fixture/env-state.txt:12-14;
fixture/repair-notes.md:5-6). So the post-incident machine was not merely "an interrupted install" but
an interrupted install **plus** a hand-swapped tree that had desynchronized npm's own view of the
global prefix.

**Why swapping/patching directories by hand makes it worse.**

- npm's global prefix is npm's **managed state**: the package tree plus its recorded install metadata,
  and npm's own remove-rename backup semantics (the `dsh-old-0.1.1-rc.1` directory in the log is npm's
  rollback artifact, fixture/agent-session-log.txt:34). Hand-placed files break the invariant
  "disk == what npm recorded", so the next npm operation computes the wrong plan: it may believe the
  package is already installed and skip extraction **and shim generation**, or roll back to the wrong
  tree. A hand swap converts a recoverable interrupted install into an install npm cannot trust.
- A hand-assembled tree mixes files from two generations ("partially replaced" + hand-placed), so
  internal version stamps disagree. That is worse than a clean failure: the package can boot and then
  misbehave in confusing ways (the in-place-upgrade mixed-generation hazard carded at 0.1.5-alpha.1
  A1-20 is the same family — an inconsistent tree serving a client combo that omits newly added
  modules).
- Hand-written or stale shims encode npm's bin resolution (node path, the package's bin entries,
  `.cmd`/`.ps1` wrappers). The surviving stale `dsh.ps1` "points into the old tree" — a tree the next
  npm operation may rename or remove. Hand-patching shims just relocates the failure.
- Hence the skill's explicit repair rule: "**never hand-copy package directories or hand-write
  shims**" — the only sanctioned repair is re-running the pinned formal install.

## 3. The repair actually applied, and why it works where the in-session attempt could not

**What the repair notes did** (fixture/repair-notes.md:9-13):

1. **Re-ran the formal install from the registry, pinned, from an external shell:**
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` → all three shims (`dsh` / `dsh.cmd` / `dsh.ps1`)
   regenerated; `dsh --version` → `0.1.2-rc.1`.
2. **Aligned the source checkout** (the workspace used for host-source reference) from the
   `dsh-v0.1.2-alpha.5` tag to `dsh-v0.1.2-rc.1`; no local-modification conflicts.

**Why this form of repair works where the in-session attempt could not.** The difference is not the
command — it is *where the executor stands relative to the blast radius*. The repair session was "a
different agent CLI, run outside dsh" (fixture/repair-notes.md:1): nothing in its process tree lived in
the package npm was replacing, and the old host was already dead, so no process held the tree or the
native-module locks. npm's remove→fetch→link→shim-generation cycle could therefore run to completion
and restore **all install invariants at once** — tree content, npm's global metadata, and the PATH
shims — which is exactly what neither the interrupted install nor the manual swap could do. Two
details of the form matter:

- **Pinned exact version.** A bare `@deepseek-ai/dsh` resolves the `latest` dist-tag, which is a
  moving target across lines (measured in the rc.1 card: umbrella `latest` was `0.1.1-rc.2` and moved
  to `0.1.2-rc.1` only on 2026-09-04; sub-package `latest` tags lag further). The pin makes the
  repair deterministic, and the same pin is the rollback form from the S12 row
  (`npm i -g @deepseek-ai/dsh@<verified-version>`).
- **Re-install rather than "finish the manual swap."** Only npm itself can make the global prefix
  standard again; resuming the hand swap would have preserved the non-standard state.

**How the result is verified.** Immediately: all three shims regenerated and `dsh --version` →
`0.1.2-rc.1` (the command resolves and reports the intended version — proof the shims and the tree
now agree). Then the deferred real-machine checklist handed to the user (fixture/repair-notes.md:20-21):
start `dsh --profile web`, hard-refresh the browser, confirm plugins load (whale / progress / etc.),
and optionally clean the `dsh-old-*` backups once rc.1 is confirmed. The corridor evidence sets the
expectation for that checklist: the alpha.5→rc.1 diff is **252 files, all of them package.json version
bumps, zero API/feature changes** (fixture/repair-notes.md:16-17, matching the rc.1 card's "zero
cards" finding) — so plugins migrated for 0.1.2-alpha.x need no re-migration, and a plugin failing to
load after this repair is an installation/fleet problem, not a migration problem.

## 4. The protocol the agent should have followed instead

**What it should have recognized about its own relationship to the upgrade target.** Before executing
anything, the recognition test of R-12: "first confirm whether the upgrade target belongs to the
current session / profile / Harness host." Here the answer was yes *by construction and was directly
observable*: the upgrade target was the global `@deepseek-ai/dsh` package, and the agent's own
runtime context named the host process as running from `.../node_modules/@deepseek-ai/dsh/...`. The
session was not merely "a user of dsh" — it was a child of the upgrade target. Any command whose
target set includes the agent's own host process tree is one the agent cannot execute and survive to
report on.

**Should it execute the global install at all? No.** This is the agent-discipline boundary the task
tests: "do it for the user" covers work inside the blast radius the agent can safely change and verify
(read-only inspection, plugin work, profile edits the host tolerates); "hand the user a procedure you
must not execute yourself" covers operations whose target underpins the agent's own execution. The
agent had already done its legitimate share — checking the release notes (Mode A). The install itself
belongs to the user, from an external terminal.

**The exact external procedure to hand the user (order matters):**

1. **Fully stop every dsh process on the machine FIRST — before npm runs.** The web host *and* any
   stray/headless dsh or node processes (check for anything still listening on :3080). A running host
   holds native-module file locks → EBUSY on Windows, and **a browser refresh or closing the tab is
   not a host stop** — the lock is on the host process, not the browser (S12 row). Stopping first is
   also what makes the upgrade non-crashing by construction: with the host already down, nothing can
   die mid-install.
2. **From an EXTERNAL terminal** (a plain shell, not a dsh session), run the **pinned** install:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. The exact-version pin is mandatory: a bare package
   name resolves `latest`, which can silently install a different line (and doubles as the rollback
   pin). This is the command form from SKILL.md's procedure.
3. **Restart and verify:** `dsh web` (here `dsh --profile web`), hard-refresh the browser, confirm
   version markers read `0.1.2-rc.1` and plugins load; clean up `dsh-old-*` backups only after rc.1
   is confirmed.

**Which parts already follow from known upgrade rules vs. what is new for this incident.**

- *Already known (skill rules):* the recognition rule is R-12 (confirm the target isn't the running
  host; if it is, "the Agent must not unconditionally perform operations that could take the host
  down. Hand control back to the user for confirmation, or complete recovery through an external /
  manual path"); the three-step external procedure is SKILL.md's "Global DSH host upgrades (agent
  discipline)"; the stop-before-npm ordering and the pinned rollback are the S12 row (host holds the
  locks; `latest` may lag, so pin); the pin-over-bare-name rule is reinforced by the rc.1 card's
  dist-tag measurements; "never hand-copy package directories or hand-write shims; repair by
  re-running the pinned formal install" is the explicit repair rule; and "fully stop **every** dsh
  process" plus verifying the restarted host is genuinely new code is the ghost-host discipline
  (`scripts/ghost-host-check.mjs`: a process older than the change keeps running old code while
  lazily importing new files).
- *New for this incident:* the evidence that the failure signature matches the predicted one exactly
  (tool call recorded but never returned; shims missing/stale while package content present; death
  between npm's `remove` and shim generation); the compounding factor that a **partial manual repair
  had already made the tree non-standard**, so the correct repair was a full pinned re-install rather
  than "finishing" the swap; the explicit handoff warning that manual directory swapping must not be
  attempted (it converts a recoverable state into one npm cannot repair safely); and the
  machine-specific post-upgrade checklist (below).

## 5. Prevention

**An agent-side guard against this class of failure.** A pre-execution self-reference check on the
tool-call path, implementing R-12 mechanically:

1. **Identity resolution before mutation.** Before any command that installs/removes/replaces a
   package, stops/restarts a process, or edits the active profile/preset, resolve the target's
   identity and ask: *is this target part of the currently running host / my own session's process
   tree?* The runtime context already exposes the host package path
   (`.../node_modules/@deepseek-ai/dsh/...`), so the check is mechanically available — e.g. refuse any
   global install/remove of `@deepseek-ai/dsh*`, any process-control of the current host PID or its
   ancestors, and any edit of the active profile/preset, when executed from inside a session on that
   host.
2. **R-12's four minimum confirmations** as an explicit pre-flight: (a) is the target plugin running
   in the current profile? (b) is the target preset the one the current Agent uses? (c) does the
   modified runtime/dependency underpin the current Harness? (d) is the plugin about to be
   uninstalled still depended on by the current runtime? Any "yes" → do not execute.
3. **On a "yes", emit the handoff, not an execution:** the guard blocks the call and produces the
   external procedure (stop everything → external pinned install → restart/verify) for the user. The
   agent is not powerless — it may do everything except be the executor of the fatal step (the repair
   here was itself done by an agent CLI, running outside dsh).
4. **Make the fatal path unrepresentable rather than retryable.** "A crash during the upgrade is a
   signature of doing it wrong" — so the guard must not try to make the in-session install safer with
   timeouts, retries, or backgrounding (all of which still kill the host and still lose the result);
   it must prevent the call. Same for the repair path: block hand-copy/hand-shim "fixes" and route to
   the pinned external re-install.
5. **Refuse mutating probes too** — `npm install` "just to see what happens", `npm ls -g`-style checks
   that still touch global state, or a browser refresh mistaken for a host stop.

**Post-upgrade checklist for this machine (given the alpha.5→rc.1 findings):**

1. **Shims and command:** `dsh --version` → exactly `0.1.2-rc.1`; all three shims present in
   `%APPDATA%\npm` (`dsh`, `dsh.cmd`, `dsh.ps1`), none stale (each resolves into the current rc.1
   tree, not a `dsh-old-*`).
2. **Standard install restored:** `npm ls -g @deepseek-ai/dsh` reports rc.1 with no hand-swapped
   directories left from the manual attempt; the non-standard tree is gone. Remove the `dsh-old-*`
   backups only after rc.1 is confirmed working.
3. **No ghost processes:** before and after the restart, confirm no surviving dsh/node process still
   runs alpha.5 code or holds port 3080 — a process older than the install would keep old code in
   memory while lazily importing new files (the ghost-host case; on this Windows machine: check
   `Get-Process` and the :3080 listener).
4. **Real boot:** `dsh --profile web`, hard-refresh the browser; GUI version marker reads
   `0.1.2-rc.1`; zero console errors after load and after opening Settings.
5. **Plugin fleet:** whale / progress / etc. load and show Enabled. Expected per the corridor
   evidence: rc.1 is a pure version bump over alpha.5 (252 files, all `package.json` version bumps,
   zero API/feature changes), so plugins migrated for 0.1.2-alpha.x need no re-migration — treat any
   load failure as an install/fleet issue, not a trigger to re-migrate.
6. **Home data sanity:** this machine's `$DSH_HOME` ran alpha.5, which carries the A5-03 fix (the
   host's `session_projcache` reads all three generations — v3 single-file, v4 per-record, and the
   "poisoned" v5-stamped-lineageless documents). rc.1 keeps that behavior unchanged, so the session
   list should show recorded titles after the upgrade; unexpected `*.json.bak.*` salvage files would
   indicate schema failures that are *not* expected on this edge and should be investigated rather
   than ignored.
7. **Source checkout alignment:** the host-source checkout must sit on `dsh-v0.1.2-rc.1` (the repair
   did this). A checkout left on alpha.5 while the registry install is rc.1 is a generation mismatch
   that will mislead future debugging and ghost checks.
8. **Record the rollback baseline:** exact pins — `@0.1.2-rc.1` to re-apply, `@0.1.2-alpha.5` to roll
   back — because `latest` is a moving tag and is not a baseline.

---

### Bottom line

The in-session global upgrade failed by construction: the executor was a child of the upgrade target,
npm's remove-then-link cycle deleted the host's own code, the host died before npm could generate the
shims, and the tool call's result died with its transport. The `dsh` command vanished because Windows
resolves it through `%APPDATA%\npm` shims that only a *completed* install writes — and the user's
well-meant manual directory swap then made the tree non-standard, which is why the only correct repair
was the external pinned re-install the repair notes applied. The agent's discipline boundary: recognize
self-upgrade via R-12's check, never execute the global host install from inside a session, and hand
the user the stop-first, external, pinned, verify-after procedure.
