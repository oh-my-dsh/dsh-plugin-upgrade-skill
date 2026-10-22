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

# S16 · The Self-Host Upgrade Trap — Incident Report

Evidence read (read-only): `fixture/README.md`, `fixture/agent-session-log.txt`,
`fixture/env-state.txt`, `fixture/repair-notes.md`; skill methodology from
`plugin-upgrade/SKILL.md`; references `rollup-0.1.2.md` (R-12), `v0.1.2-alpha.5.md`,
`v0.1.2-rc.1.md`.

---

## 1. Structural root cause — why this fails by construction, not by accident

The session and its tool worker are **inside the thing npm is replacing**. The evidence
identifies the host process as `node .../node_modules/@deepseek-ai/dsh/...` serving the
GUI at `http://127.0.0.1:3080`. The agent that received "update dsh to v0.1.2-rc.1" is a
dsh web session **running inside that same host process**, and the `pwsh` tool call that ran
`npm install -g @deepseek-ai/dsh@0.1.2-rc.1` executes as a worker **of** that host
("running inside the host's own worker process"). So the upgrade command is a child of the
very process whose on-disk code it is about to delete.

A global npm install of `@deepseek-ai/dsh` proceeds as: resolve/fetch the new tarball, then
**remove the old global tree** (`npm info remove @deepseek-ai/dsh`), then link the new
content and regenerate the bin shims (`npm info linkStuff`). The old tree being removed is
the tree the host process is actively executing from. Removing/replacing a running Node
process's own module files kills it: on Windows the native-module binaries (`.node` DLLs) are
file-locked by the running process (EBUSY) and the lazily-imported JS/resources vanish from
underneath it. **The host process dies first** — it is the thing npm is replacing, and the log
shows the death at the `linkStuff` stage (16:41:31), before shims were regenerated.

Because the tool worker is a descendant of that host, killing the host tears the worker down
mid-install. That is why **the tool call never returned a result**: the parent that would have
relayed/durably-recorded the result was already gone — the log records
`<no result recorded — the tool call was interrupted…>`. A crash during the upgrade is the
signature of doing it wrong, not a flaky failure to tolerate (SKILL.md, global-upgrade
discipline).

The interrupted-install signature in the evidence is exactly this sequence:
`cleaning` → `remove @deepseek-ai/dsh` → `fetch @0.1.2-rc.1` → `linkStuff` → session dies,
no result. The install was killed *between* "old tree removed" and "new shims written".

---

## 2. The broken state — why `dsh` vanished while the package content survived

The `dsh` command on this machine is not the package content; it is the **npm-generated bin
shims** that wire the CLI into PATH: on Windows, `dsh.cmd` (batch wrapper), `dsh.ps1`
(PowerShell wrapper), and `dsh` (sh-script for bash-like shells), all in `%APPDATA%\npm`,
each pointing into `node_modules/@deepseek-ai/dsh`. The interrupted install:

- removed the old shims — `dsh.cmd` and `dsh` are **MISSING**;
- left only a **stale `dsh.ps1`** pointing into the old tree;
- left `node_modules/@deepseek-ai/dsh\` present but **partially replaced**, plus the
  `dsh-old-0.1.1-rc.1` backup.

So the content directory exists, but there is no live entry point on PATH, and the one shim
that survived points at a path that no longer matches the content. PowerShell resolves "dsh"
to nothing → `not recognized`. The CLI is dead because **the shim layer was never
regenerated**, not because the files are gone.

Hand-swapping or patching directories makes it worse, not better. A working global install is
the union of (a) the package tree, (b) npm-managed bin shims, (c) npm's install metadata, and
(d) correct platform native bindings. Hand-copying content produces a **non-standard install**:
content without generated shims (the repair notes confirm "the directory had been
replaced/manually swapped, and the dsh/dsh.cmd shims were never generated"). Every manual
patch adds drift between "what npm believes is installed" and "what is on disk", so the next
install or repair starts from a mixed hand-edited state and is *less* deterministic. The single
correct fix is one pinned formal re-install, which atomically regenerates the tree **and** the
shims and re-syncs metadata — manual surgery can only add a second, inconsistent state.

---

## 3. The repair — what actually fixed it and why it works where the in-session attempt could not

The repair notes applied, from an **external** agent CLI (outside dsh):

1. Re-ran the formal pinned install from the registry:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   → `dsh` / `dsh.cmd` / `dsh.ps1` all regenerated; `dsh --version` → `0.1.2-rc.1`.
2. Aligned the source checkout (host-source reference) from the `dsh-v0.1.2-alpha.5` tag to
   `dsh-v0.1.2-rc.1`; no local-modification conflicts.

Why this works where the in-session attempt could not:

- **External shell, not a child of the host.** Nothing is holding the package tree's file
  locks, and there is no running host for npm to kill mid-install. (The host is already dead,
  which is precisely what makes repair safe.)
- **Formal install, not hand-copy.** npm itself regenerates the bin shims that wire `dsh` back
  into PATH and re-syncs its install metadata — the exact two things the interrupted attempt
  never finished.
- **Pinned exact version** (`@0.1.2-rc.1`), so the target is explicit rather than whatever a
  dist-tag resolves to.

Verification of the result: the three shims are present again and `dsh --version` returns
`0.1.2-rc.1` (proving the shim → bin → version chain works end to end). The repair notes left
the real-machine confirmation to the user: start `dsh web`, hard-refresh the browser, confirm
plugins load — i.e. verify the running process and the web client version marker, not just the
CLI version string.

---

## 4. The protocol the agent should have followed

**What the agent had to recognize about its own relationship to the target:** it was executing
*inside* the host being upgraded — the upgrade target **is** the currently running host, and the
upgrade command runs as a worker of that host (R-12: "the upgrade target may be the currently
running host"). This is the check the agent skipped: before running an operation that can take
the host down, confirm whether the target underpins the current Harness. Here it unambiguously
did.

**Should it execute the global install at all?** No. This is the agent-discipline boundary —
"do it for the user" stops where executing the command removes the ground the agent itself is
standing on. SKILL.md's global-upgrade rule is explicit: **never execute the global host
upgrade from inside a session on that host; hand the user the external procedure.** The agent
should have stopped at "here is what must happen", not turned it into a `pwsh` tool call.

**The exact external procedure to hand the user (order matters):**

1. **Fully stop every dsh process** — not just refresh the browser (a refresh reconnects to a
   still-running host). This must happen **before npm runs**: a running host holds
   native-module file locks (EBUSY) and is the thing that dies mid-install otherwise.
2. **From an EXTERNAL terminal**, run the **pinned** install:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   The `@<exact-version>` is required because a bare `npm install -g @deepseek-ai/dsh`
   resolves the `latest` dist-tag and can silently land on a different line (the rc.1 card's
   npm-channels note records `latest` moving to `0.1.2-rc.1` around 2026-09-04; pinning makes
   the target explicit and stable).
3. **Restart `dsh web`, hard-refresh the browser**, verify version markers and that plugins
   still load.

**Known vs new for this incident:** the stop-before-replace ordering, "external terminal", and
"pinned exact version" all already follow from SKILL.md's global-upgrade discipline and the
R-12 safety check — these are standing rules, not new. What is **new** for this incident is the
concrete failure anatomy the evidence exposes: (a) the tool worker being a *child of the killed
host* is what makes the call un-returnable — so "the tool call never returned" is itself a
diagnostic signature of self-upgrade, not a network flake; and (b) the Windows-specific
**content-vs-shim decoupling** — package content survived but the `.cmd`/`.ps1`/`dsh` shims
were never regenerated — which upgrades "re-run the pinned install from outside" from a
precaution into the *definitive repair*, and rules out "just put the files back by hand".

---

## 5. Prevention and post-upgrade checklist

**Agent-side guard against this class of failure:**

- **Self-identification pre-flight (before any install/uninstall touching the host package):**
  detect whether the current process (or its parent chain / worker) executes from the very
  install tree the command would replace — compare the install target path against the
  runtime's own module path (`process.execPath` / `require.resolve('@deepseek-ai/dsh')`). If
  they overlap, refuse to execute and classify the request as **self-upgrade**.
- **Deny-to-external downgrade rule:** for the fatal commands (`npm install -g
  @deepseek-ai/dsh`, `npm uninstall -g`, global pnpm ops on the host package) whose target is
  the running host, downgrade the action from "execute" to "emit the external procedure".
- **Interrupted-install signature detection:** if a tool call terminates with "no result
  durably recorded" / worker death / GUI connection lost *after an install tool call*, classify
  it as the self-upgrade/interrupted-install pattern and immediately produce the external
  repair procedure — do not retry the install inside the session.

**Post-upgrade checklist for this machine (given the alpha.5 → rc.1 findings):**

The repair notes' key finding — diff `dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1` = 252 files, all
`package.json` version bumps, zero API/feature changes — matches the rc.1 corridor card
(DSH-0.1.2-RC1, zero cards: pure version bump). So the checklist covers:

1. **Shim presence** (the exact failure this incident hit): confirm `dsh`, `dsh.cmd`, and
   `dsh.ps1` all exist again and `dsh --version` → `0.1.2-rc.1`.
2. **Runtime marker:** start `dsh web`, **hard-refresh** the browser (not just reconnect),
   and confirm the web client reports the rc.1 version marker (e.g. `0.1.2-rc.1-a66e470`),
   with zero console errors.
3. **Plugin fleet:** confirm plugins still load/enabled (whale / progress / etc.). Because
   alpha.5 → rc.1 is a no-op corridor, plugins migrated for 0.1.2-alpha.x need **no
   re-migration** — a simple "still enabled / still mounted" check suffices; do not run
   migration work for a version-only bump.
4. **Storage/persistence:** alpha.5 already carried the storage salvage behavior (DSH-0.1.2-A5-02
   `backup-and-skip`) and the host boot fix (DSH-0.1.2-A5-03), both unchanged at rc.1 — verify
   no unexpected `*.json.bak.*` salvage files appeared and session titles/history survive boot.
5. **Source-checkout alignment:** confirm the host-source reference checkout is on the
   `dsh-v0.1.2-rc.1` tag (the repair notes did this) with no local-modification conflicts.
6. **Optional cleanup:** remove the `dsh-old-*` backup directories only after rc.1 is
   confirmed stable.

**Bottom line:** the failure is structural (the agent replaced the tree it was running from,
and its own tool worker died with the host), the correct repair is one external pinned formal
re-install that regenerates the shims, and the discipline is to hand the user a procedure you
must not execute yourself — never a `pwsh` self-upgrade from inside the session.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.