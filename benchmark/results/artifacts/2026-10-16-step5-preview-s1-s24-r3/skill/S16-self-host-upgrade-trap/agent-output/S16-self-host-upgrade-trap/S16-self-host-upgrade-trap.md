# S16 · The Self-Host Upgrade Trap — Incident Report

**Scope**: read-only diagnosis of the fixture evidence (`fixture/agent-session-log.txt`,
`fixture/env-state.txt`, `fixture/repair-notes.md`) plus the read-only plugin-upgrade skill
(`skills/plugin-upgrade/`, chiefly `SKILL.md` § "Global DSH host upgrades (agent discipline)",
`references/rollup-0.1.2.md` R-12, `references/troubleshooting.md` EBUSY row,
`references/v0.1.2-rc.1.md`, `references/v0.1.2-alpha.5.md`). No fixture file was modified;
nothing was installed or executed.

**Verdict up front**: this was not a flaky failure. Running a global `@deepseek-ai/dsh`
install from inside a dsh session on that same host is **fatal by construction** — the
upgrade target is the runtime executing the upgrade. The correct agent behavior was to
recognize that, refuse the in-session install, and hand the user an external procedure.

---

## 1. Structural root cause — why the in-session global upgrade fails by construction

### 1.1 What the session and its tool worker are, relative to the upgrade target

From the evidence (session-log header and `env-state.txt` BEFORE):

- The **host process** is `node …/node_modules/@deepseek-ai/dsh/…` — the GUI at
  `http://127.0.0.1:3080` is served by it.
- The **agent session** (the model turn that took the user's "update dsh to v0.1.2-rc.1")
  runs **inside that host process**. The session is not a peer of the host; it *is* the host.
- The **tool worker** that executed `pwsh: npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
  (timeout 600000 ms, "running inside the host's own worker process") is a **child/descendant
  process of that host**.

So when npm replaces the global package tree, **npm is replacing the directory its own
grandparent process is executing from**. The executor is a descendant of the target. That
relationship, not any npm bug, is the root cause — and it is exactly what the skill already
names in `rollup-0.1.2.md` **R-12 · "The upgrade target may be the currently running host"**
and in `SKILL.md` § "Global DSH host upgrades (agent discipline)": *"the session IS the host
process, npm removes/replaces the very package tree it executes from, the host dies
mid-install (the tool call never returns)."*

### 1.2 What npm does, in order — and where the death happens

The log records npm's install lifecycle verbatim:

| Time | npm step | What it means |
|---|---|---|
| 16:41:02 | `npm warn cleaning node_modules/@deepseek-ai/dsh` | begins removing the old global package tree |
| 16:41:05 | `npm info remove @deepseek-ai/dsh` | old package removed — **including its bin links/shims** |
| 16:41:09 | `npm info fetch @deepseek-ai/dsh@0.1.2-rc.1` | tarball fetched |
| 16:41:31 | `npm info linkStuff @deepseek-ai/dsh@0.1.2-rc.1` | new content extracted/linked into place |
| — | **GUI died here** ("browser tab: connection lost") | the host process is gone |

Two facts about npm's ordering matter: (a) removing the old package removes its shims
*before* the new package exists; (b) **bin-link/shim generation is the last phase of the
install**, after all content is extracted. Anything that dies between (a) and (b) leaves the
machine with no old shims and no new shims — precisely the observed state (§2).

### 1.3 What dies first, and why

**The host dies first.** The GUI connection loss at 16:41:31 is the first visible symptom —
the host process is what serves the GUI. Mechanism, from the evidence plus the skill's
Windows field knowledge: a running dsh host **holds file handles on its loaded host halves and
native modules** (`troubleshooting.md` EBUSY row: the locks live *in the host process, not in
the browser*). Even where deletion succeeds (Node lazily loads JS, so unlinking an
already-extracted file can pass), the moment npm swaps/removes the tree the host is executing
from — the running process loses the modules it will lazily import, and the directory
replacement breaks open handles. The host dies **mid-install**, at `linkStuff`.

**Then the tool worker dies with it.** The worker is a child of the host; the host's death
tears down its process subtree, so the `npm` process is killed mid-extraction. That is why
the tree is left "**partially replaced**" (`env-state.txt` AFTER) and why the final
bin-linking phase never ran.

### 1.4 Why the tool call never returned a result

Two independent, structural reasons — both visible in the log's
`[tool result] <no result recorded — the tool call was interrupted after it was recorded,
but no result was durably recorded. Its outcome is unknown.>`:

1. **The observer is dead.** The only process that could receive and durably record the tool
   result is the host that owns the session — and the host is what died. There is nobody left
   to deliver a result to.
2. **The executor is dead.** The tool worker (`pwsh`) and its `npm` child are descendants of
   the host and were torn down with it; even a "successful" install could not have been
   reported back.

This is why the failure is *structural, not accidental*: the operation's target contains the
operation's caller and its entire result channel. It reproduces 100% of the time whenever a
global host install is run from inside a session on that host. Per `SKILL.md`: *"a crash
during the upgrade is a signature of doing it wrong, not a risk to tolerate."*

### 1.5 The interrupted-install signature (for post-mortem recognition)

The evidence pack shows a recognizable fingerprint, worth naming because it is how you tell
this class of incident apart from an ordinary broken install:

1. `npm warn cleaning …` → `remove` → `fetch` → `linkStuff`, then silence — the log stops at
   `linkStuff`, with the install never reaching its bin-link phase;
2. the session/tool result is *missing* ("no result recorded … outcome unknown") rather than
   an error;
3. afterwards: **package content present but the install is non-standard** (partially
   replaced, some files placed by hand during a partial manual repair), **shims missing or
   stale**, and a `dsh-old-*` backup directory left behind.

---

## 2. The broken state afterwards — why `dsh` vanished, and why hand-repair makes it worse

### 2.1 Why the `dsh` command is gone even though the package content is present

On Windows, a global npm package is **not reachable through its package directory**. The
`dsh` command resolves through the **shim files in `%APPDATA%\npm`** (which is on `PATH`):
`dsh`, `dsh.cmd`, `dsh.ps1`. `node_modules/@deepseek-ai/dsh/` is not on `PATH`; nothing maps
the command name to it. The observed state (`agent-session-log.txt` tail and `env-state.txt`
AFTER):

- `dsh.cmd` **MISSING**, `dsh` **MISSING**, `dsh.ps1` **stale** ("points into the old tree");
- `node_modules/@deepseek-ai/dsh/` **present, partially replaced** (rc.1 files, some placed by
  hand), plus `node_modules/@deepseek-ai/dsh-old-0.1.1-rc.1/` as npm's rename-aside backup.

The mechanism follows directly from §1.2: npm **deleted the old package's bin links during
`remove`** (16:41:05), then died at `linkStuff` (16:41:31) — **before** the bin-linking phase
that regenerates shims for the new install. Old shims gone, new shims never created, and the
leftover `dsh.ps1` was never regenerated so it still points into the old tree. Hence
`dsh --version` and `dsh web` both report *"not recognized as the name of a cmdlet…"* while
rc.1 bytes sit on disk. **Package content is not a usable install** — the shim layer and npm's
install metadata are part of the install, and they are exactly what the interruption destroyed.
`env-state.txt`'s verdict is the correct summary: *the dsh CLI itself is unusable; only an
external tool can repair the install.*

### 2.2 Why swapping or patching directories by hand makes it worse

1. **npm's install state no longer matches the tree.** A global install records its state
   (package/lock metadata under the global `node_modules`). The tree is now non-standard —
   partially replaced plus hand-placed files. Every future npm operation (install, update,
   uninstall, audit, and even the eventual formal repair) derives its assumptions from that
   metadata, so it can remove the wrong thing, skip the wrong package, or refuse.
2. **Hand-made shims encode fragile path assumptions.** A copied or hand-written shim turns a
   loud, unambiguous "command not found" into a quiet, expensive "module not found" /
   half-boot failure — the misattribution trap: symptoms look like a host or plugin bug, not
   an install defect.
3. **Version skew.** Hand-copying into a half-extracted tree yields a mixture of rc.1 files,
   alpha.5 leftovers, and files missing entirely from the interrupted extraction. A host that
   boots halfway and dies later — potentially *after* writing session/storage state — is worse
   than a cleanly dead CLI.
4. **Windows file locks compound it.** Any still-running dsh process holds handles on the
   tree (the S12/EBUSY lesson: the locks are in the host process, not the browser); and a
   hand-replacement that "succeeds" while some dsh process survives leaves that process
   running **old code in memory while lazily importing new files** — the ghost-host condition
   the skill's pre-flight step 1.5 exists to detect.
5. The evidence shows this already happening: the AFTER state contains *"some placed by hand
   during a partial manual repair attempt by the user."* Continuing that path deepens the
   inconsistency.

The skill's rule is therefore explicit: **repair from an external shell by re-running the
pinned formal install — never hand-copy package directories or hand-write shims.**

---

## 3. The repair that was actually applied, and why it works

### 3.1 What the repair notes did

From `fixture/repair-notes.md` ("a different agent CLI, run outside dsh"):

1. **Repaired the shims by RE-RUNNING the formal install from the registry**:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` → `dsh` / `dsh.cmd` / `dsh.ps1` all
   regenerated; `dsh --version` → `0.1.2-rc.1`.
2. **Aligned the source checkout** (the workspace used for host-source reference) from the
   alpha.5 tag to the `dsh-v0.1.2-rc.1` tag; no local-modification conflicts.
3. **Key finding**: diff `dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1` = 252 files, **all
   `package.json` version bumps, zero API/feature changes** → plugins migrated for
   `0.1.2-alpha.x` need **no re-migration**.
4. **Left for the user**: real-machine verification (start `dsh --profile web`, hard-refresh,
   confirm plugins load — whale / progress / etc.) and optional cleanup of the `dsh-old-*`
   backups once rc.1 is confirmed.

### 3.2 Why this form of repair works where the in-session attempt could not

- **The host is dead (and must be confirmed dead) before npm runs.** Nothing is executing from
  the tree being replaced, so npm is not killing its own executor; no process holds the file
  locks that would otherwise produce `EBUSY`; and the install can run to completion —
  including the bin-linking phase whose absence is the whole defect (§2.1).
- **The repairing shell is external** — not a descendant of the target package — so it
  survives the install, observes the outcome, and can verify it. The in-session attempt failed
  precisely because its observer was inside the blast radius.
- **A pinned re-install is idempotent and self-healing.** npm cleans the non-standard residue,
  extracts a *complete* package, regenerates *all three* shims, and rewrites its metadata —
  restoring a standard install atomically instead of patching a broken one. That is why it
  works on a tree that "looks almost right" and why hand-repair does not.
- **The version is pinned to the exact target** (`@0.1.2-rc.1`), per the dist-tag rule: a bare
  `npm install -g @deepseek-ai/dsh` resolves `latest`, which drifts (measured: umbrella
  `latest` moved `0.1.1-rc.2` → `0.1.2-rc.1` on 2026-09-04; `latest` can also lag) and can
  silently install a different line than intended.

### 3.3 How the result is verified

- **Immediately (repair session, external CLI)**: all three shims regenerated;
  `dsh --version` → `0.1.2-rc.1` — the command resolves again, which is the direct proof the
  shim layer is whole.
- **Deferred to the user (repair notes, "Left for the user")**: start `dsh --profile web`,
  hard-refresh the browser, confirm the plugin fleet loads (whale / progress / etc.); optional
  `dsh-old-*` cleanup once rc.1 is confirmed.
- **Migration verification — none required**: with 252/252 changed files being version bumps,
  the alpha.5→rc.1 edge is a *no-op corridor* (`references/v0.1.2-rc.1.md`: zero cards; every
  plugin-facing runtime API surface identical to alpha.5). Post-repair verification is
  therefore **runtime-only** — the agent must not invent migration work for this edge.

---

## 4. The protocol the agent should have followed instead

### 4.1 What the agent should have recognized about itself

Before running anything, the agent had everything it needed to see the trap:

- it was **a session running inside the dsh host process** (host = `node
  …/node_modules/@deepseek-ai/dsh/…`, GUI at `http://127.0.0.1:3080`);
- its **tool worker was a child of that host**;
- the requested command, `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`, **targets that exact
  package tree**.

In other words: *the upgrade target is my own runtime substrate, and my result channel dies
with it.* This is the R-12 pre-upgrade safety check — "before performing an operation that
could affect the running host, first confirm whether the upgrade target belongs to the current
session / profile / Harness host" — and the answer here was unambiguous on every R-12 item
(the runtime being modified underpins the current Harness).

### 4.2 Should it have executed the global install at all?

**No — and no amount of in-session confirmation changes that.** The failure is structural
(§1), so "ask the user, then run it anyway" is still fatal. `SKILL.md` is categorical:
*"Never execute the global host upgrade from inside a session on that host; hand the user the
external procedure."* R-12 says the same: the agent must not unconditionally perform
operations that could take the host down; hand control back to the user, or complete recovery
through an external/manual path. The agent's correct output for this request was a **procedure
for the user**, not a tool call.

### 4.3 The exact external procedure (order matters)

1. **Fully stop every dsh process on the machine — first, before npm runs.** A browser
   refresh or tab close is *not* a host stop: the file locks live in the host process, not the
   browser (`troubleshooting.md` EBUSY row; S12 field case). Also sweep for hosts nobody
   started by hand (service-managed instances — the rc.1 real-host record documents a
   `launchd`-managed host on the same source symlink that must be restarted explicitly).
   Only with the host fully stopped does npm have a non-executing target and unlocked files.
2. **From an EXTERNAL terminal, run the pinned install:**
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   — the **exact version**, never a bare package name: a bare `@deepseek-ai/dsh` resolves the
   `latest` dist-tag, which drifts between lines (umbrella `latest` measured moving
   `0.1.1-rc.2` → `0.1.2-rc.1` on 2026-09-04; per S12 it can also lag), so an unpinned
   command can silently install different content than the user asked for.
3. **Restart `dsh web` (equivalently `dsh --profile web`), hard-refresh the browser, and
   verify version markers and that plugins load.**

Because the host is fully stopped *before* npm runs, nothing crashes mid-install — per
`SKILL.md`, a crash during the upgrade is the signature of doing it wrong.

### 4.4 Which parts are known rules, and which part is new for this incident

**Already known upgrade rules (documented before this incident):**

- **R-12 · "The upgrade target may be the currently running host"** (`rollup-0.1.2.md`) — the
  pre-upgrade self-check (is the target part of the current session/profile/host?), and the
  rule that if it is, the agent must not unconditionally host-down it: hand control back to
  the user or recover externally.
- **`SKILL.md` § Global DSH host upgrades (agent discipline)** — never run the global host
  upgrade from inside a session on that host; the three-step external procedure
  (stop every dsh process → external terminal → pinned install → restart/hard-refresh/verify);
  "a crash during the upgrade is a signature of doing it wrong"; and the repair rule for an
  already-interrupted install (external pinned re-install, never hand-copy/hand-written
  shims).
- **The dist-tag pinning rule** — bare package name → `latest` → silent line changes
  (`SKILL.md`; measured in `v0.1.2-rc.1.md` npm-channels note and example 06's dist-tag-drift
  entry).
- **The EBUSY/lock lesson** (S12 / `troubleshooting.md`) — locks live in the host process, so
  "stop the host" is a precondition, not an optimization.

**New for this incident (the increment this episode adds):**

- **The interrupted-install signature as a named, recognizable pattern**: install log stops at
  `linkStuff`; tool result *missing* (not an error); afterwards **package content present but
  shims missing/stale and the install non-standard**. This is the post-mortem fingerprint that
  distinguishes "agent upgraded the host from inside a session" from every other broken
  install — and it should be read directly from evidence, as done in §1.5/§2.1.
- **The meta-rule about observability**: an operation whose success *cannot be observed by its
  own caller* — because the operation kills its result channel — is disqualified as an
  in-session tool call, independent of how well the command itself is written. (The existing
  rules say "don't do it"; this says *why it can never be made safe in-session*, and gives the
  detectable signature when it happened anyway.)
- **The repair form for this specific state**: the only correct repair is the external pinned
  formal re-install — proven here by the repair notes (shims regenerated, `dsh --version` →
  `0.1.2-rc.1`) — with the alpha.5→rc.1 zero-change diff as the reason the post-repair work is
  runtime verification only, not plugin re-migration.

---

## 5. Prevention

### 5.1 An agent-side guard against this class of failure

A **pre-execution gate** (a hard block, not a warning), implemented as:

1. **Self-location check.** Before any global host install, resolve the session's own identity:
   the host process's module path (under the npm global tree,
   `node_modules/@deepseek-ai/dsh/…`) and the host's package name (`@deepseek-ai/dsh`).
   Compare against the install target.
2. **Target-is-self refusal.** If the target package *is* the host's own package (or any
   package inside the running host's tree), **refuse to execute** and emit the external
   procedure (§4.3) as the reply. No in-session confirmation path exists, because the failure
   is structural.
3. **Command-shape denylist** for the same class: intercept `npm install -g|i -g|update -g|
   uninstall -g @deepseek-ai/dsh` and equivalents (`pnpm add -g`, `yarn global add`, direct
   edits/renames of the global package tree) whenever a dsh session is the caller.
4. **Extend the same gate to the rest of the R-12 checklist**: target plugin running in the
   current profile; target preset is the agent's own preset; the runtime/dependency being
   modified underpins the current host; the plugin about to be uninstalled is still depended on
   by the current runtime.
5. **Observability rule.** An operation that terminates its own result channel (host
   stop/restart/upgrade from inside a session on that host) is never a valid in-session tool
   call — it belongs outside, and the agent's job is to hand over the procedure.
6. **Repair guard.** If an interrupted install is detected (§1.5 signature: content present,
   shims missing, non-standard tree), permit only the external pinned re-install; block
   hand-copy/hand-written-shim "fixes", which also create the half-old/half-new
   misattribution state (§2.2).

### 5.2 Post-upgrade checklist for this machine (alpha.5 → rc.1 findings in view)

1. **Install integrity (standard install, not a patched one):** `dsh --version` →
   `0.1.2-rc.1`; `dsh`, `dsh.cmd`, `dsh.ps1` all present and consistent (none stale);
   `npm ls -g @deepseek-ai/dsh` clean; no half-swapped tree and no residue of the partial
   manual repair.
2. **Runtime:** start `dsh --profile web`, hard-refresh the browser; confirm the web client
   reports `0.1.2-rc.1` and the plugin fleet loads (whale / progress / etc.); Settings →
   Plugins shows the expected entries Enabled.
3. **Plugin migration: none.** alpha.5→rc.1 is 252 files, all version bumps, zero API/feature
   changes (`v0.1.2-rc.1.md` zero-card corridor; repair-notes key finding). Plugins migrated
   for `0.1.2-alpha.x` need no re-migration — do not generate migration work for this edge.
4. **First-boot health:** watch the logs for storage-salvage messages (`*.json.bak.*` files)
   and for session-list/title anomalies. This home crossed the alpha.4→alpha.5 boundary, whose
   host fix (A5-03) exists precisely because rc.2/alpha.3-era homes could refuse to boot or
   drop session titles on alpha.4 — confirm titles render in the session list.
5. **Ghost-host sweep:** ensure no stale dsh process from the broken tree survives — a process
   that predates the install keeps old code in memory while lazily importing new files (the
   ghost condition; service-managed hosts need an explicit restart, not just a browser
   refresh).
6. **Housekeeping:** optional cleanup of the `dsh-old-*` backup directories once rc.1 is
   confirmed working; source checkout aligned to the `dsh-v0.1.2-rc.1` tag (done in the
   repair) with no local modifications.
7. **Honest accounting:** record what was verified (shims + `dsh --version`, external) versus
   what was explicitly left to the user (real-machine GUI/plugin verification, backup
   cleanup) — as the repair notes already do.

---

## Evidence index

- `fixture/agent-session-log.txt` — tool-call log: npm lifecycle through `linkStuff`, missing
  tool result, post-mortem `dsh` command-not-found and `%APPDATA%\npm` shim listing.
- `fixture/env-state.txt` — BEFORE (healthy alpha.5, session inside the host) / AFTER (host
  dead, command gone, content present but non-standard, shims missing/stale).
- `fixture/repair-notes.md` — external repair: pinned re-install regenerated shims;
  alpha.5→rc.1 = 252 version-bump-only files; user left with runtime verification + cleanup.
- Skill (read-only): `SKILL.md` § Global DSH host upgrades; `references/rollup-0.1.2.md`
  **R-12**; `references/troubleshooting.md` EBUSY row (S12); `references/v0.1.2-rc.1.md`
  (zero-card corridor, npm channels); `references/v0.1.2-alpha.5.md` (A5-03 home-upgrade fix);
  `scripts/ghost-host-check.mjs` (running-host generation check).
