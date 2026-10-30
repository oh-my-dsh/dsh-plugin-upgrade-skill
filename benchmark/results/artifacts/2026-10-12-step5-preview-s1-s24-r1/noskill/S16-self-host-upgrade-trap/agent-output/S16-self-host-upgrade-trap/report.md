# S16 · The Self-Host Upgrade Trap — Incident Report

**Task:** S16-self-host-upgrade-trap
**Evidence:** `fixture/agent-session-log.txt`, `fixture/env-state.txt`, `fixture/repair-notes.md`, `fixture/README.md`
**Verdict in one line:** The agent ran a global upgrade of the package its own session and tool worker were executing from. That is a deterministic, structural self-termination — not a flaky npm failure — and the correct agent behavior was to never execute it.

All line citations below refer to files in the read-only fixture directory.

---

## 1. Structural root cause — failure by construction, not by accident

**The process topology (agent-session-log.txt:3, :6-7):**

- The dsh web session and the agent's tool worker run **inside the dsh host process** itself:
  `host process = node .../node_modules/@deepseek-ai/dsh/...` (agent-session-log.txt:3).
- The tool call (`npm install -g @deepseek-ai/dsh@0.1.2-rc.1`) was executed by a worker
  owned by that host process (agent-session-log.txt:7) — i.e., a **child of the very
  process whose on-disk files the install was going to delete**.
- The upgrade target (`%APPDATA%\npm\node_modules\@deepseek-ai\dsh`) is therefore the
  **module root of the running host**. The command's target and the agent's runtime are
  the same directory.

**Why it fails by construction:** a global npm replace is, by nature, an
**in-place delete-then-rebuild**:

```
[16:41:02] npm warn cleaning node_modules/@deepseek-ai/dsh   <- destruction begins
[16:41:05] npm info remove @deepseek-ai/dsh                  <- old tree removed
[16:41:09] npm info fetch @deepseek-ai/dsh@0.1.2-rc.1        <- minutes of fetching
[16:41:31] npm info linkStuff @deepseek-ai/dsh@0.1.2-rc.1    <- rebuild starts
```
(agent-session-log.txt:9-12)

The old files disappear **first**; the new files land **minutes later**. During that
window the host process is running from a directory that no longer exists. Node keeps
already-loaded modules in memory, so the host survives briefly — but the first lazy
`require`, plugin load, spawned child, or file stream that touches the deleted tree
faults. This is not timing-luck; **any** upgrade whose package contains its own running
process has this collision deterministically. Retrying, waiting, or re-issuing the call
cannot change the outcome.

**What dies first, and the order of the cascade:**

1. **The host process dies first**, at the linkStuff stage (agent-session-log.txt:14):
   disk reads under it are gone, the web server on 127.0.0.1:3080 dies, the browser tab
   reports "connection lost". The host is dead *before* npm finishes linking — i.e.,
   before the upgrade could ever complete.
2. **The tool worker dies second** — it is a child of the host (agent-session-log.txt:7),
   so it is killed or orphaned when the host goes.
3. **The result channel dies with them.** The path for a tool result is
   worker → host → agent session. The host is the only process that could receive and
   durably record the result, and the GUI transport is severed. Hence the log's
   `<no result recorded — the tool call was interrupted ... Its outcome is unknown.>`
   (agent-session-log.txt:17-18). That line is not a logging gap — it is the structural
   signature of self-upgrade: even a *successful* npm run would have had nowhere to
   report to. The agent can neither execute nor observe this operation.

---

## 2. The broken state afterwards — why `dsh` vanished while content was present

**Two different artifacts make the command exist** (agent-session-log.txt:30-33, env-state.txt:11-15):

- **Package content:** `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\` — inert data on disk.
- **Shims:** the npm-generated wrappers `dsh`, `dsh.cmd`, `dsh.ps1` in `%APPDATA%\npm\`,
  which PowerShell/CMD actually resolve the `dsh` verb to. **The command exists only
  because of the shims.**

npm's shim generation happens at the **end** of an install (bin-linking is part of the
linkStuff/finalize phase). The interruption left the install exactly half-done:

- the old shims had already been removed / invalidated: `dsh.cmd <MISSING>`, `dsh` gone
  (agent-session-log.txt:32, env-state.txt:15) → `dsh --version` / `dsh web` →
  *"not recognized as the name of a cmdlet"* (agent-session-log.txt:22-28);
- `dsh.ps1` survived but is **stale**, pointing into the old tree, whose contents had
  been moved to the `dsh-old-0.1.1-rc.1` backup (agent-session-log.txt:31,33) — so even
  the surviving shim would not resolve to a usable package;
- the package directory `@deepseek-ai\dsh` still holds **rc.1 content** (partly placed
  by hand during the user's partial manual repair attempt — env-state.txt:11-13).

So: **"package content present" ≠ "installed."** An npm global install is content *plus*
shims *plus* npm's own metadata. A directory tree is inert; the CLI is dead without the
generated wrappers.

**Why hand-swapping / hand-patching directories makes it worse:**

1. It does not create the shims. Copying files into the package dir leaves the command
   dead — the user's own partial manual swap is the evidence: content present,
   command not found (env-state.txt:11-16).
2. It desynchronizes npm's bookkeeping. `npm ls -g`, the package's internal metadata, and
   the tree on disk now disagree; later npm operations (reinstall/update/uninstall) may
   skip the bin-relink step, overwrite the hand-made state unpredictably, or "succeed"
   while leaving the command unusable.
3. It can produce an internally inconsistent package (rc.1 files hand-placed into a tree
   npm had already cleaned, files missing that npm would have extracted), yielding later
   runtime errors that masquerade as product bugs.
4. It endangers the one good fallback — the `dsh-old-*` backup — once directories start
   being moved by hand (agent-session-log.txt:33).
5. Every manual step deepens the deviation from a standard install; the eventual real
   repair must first undo all of them. Manual repair adds work and risk, not a shortcut.

---

## 3. The repair actually applied — and why it works

**What the repair notes did (repair-notes.md:9-13):**

1. **Re-ran the formal install from the registry, externally**:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` → `dsh / dsh.cmd / dsh.ps1` **all
   regenerated**; `dsh --version -> 0.1.2-rc.1` (repair-notes.md:9-11).
2. Aligned the source checkout (host-source reference workspace) from the alpha.5 tag to
   `dsh-v0.1.2-rc.1`; no local-modification conflicts (repair-notes.md:12-13).

**Why this exact form works where the in-session attempt could not:**

- **Executed from outside the host.** The repairing agent CLI ran *outside* dsh
  (repair-notes.md:1). The install deletes and rebuilds the package tree — an operation
  that harms no running process this time, because no dsh process is rooted in it. The
  self-reference is broken by moving the *operator*, not the command.
- **It is the same authoritative, idempotent operation** — npm removes whatever exists
  (standard or hand-patched), re-extracts the complete rc.1 tarball from the registry,
  and regenerates **all** shims and metadata in one shot. Disk state and npm's records
  converge regardless of how mangled the partial manual repair left them. Nothing is
  copied "by hand"; nothing is inferred.
- **Its completion is externally observable** — the regenerated shims make
  `dsh --version` work (repair-notes.md:11), which the in-session agent could never
  determine, since its observation channel died with the host.

**How the result is verified:**

- Immediate: all three shims regenerated, `dsh --version -> 0.1.2-rc.1`
  (repair-notes.md:11).
- Risk assessment: diff `dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1` = 252 files, **all**
  package.json version bumps, **zero** API/feature changes → plugins migrated for
  0.1.2-alpha.x need **no** re-migration (repair-notes.md:16-17).
- Left for the user on the real machine: start `dsh --profile web`, hard-refresh the
  browser, confirm plugins load (whale / progress / etc.); optional cleanup of the
  `dsh-old-*` backups once rc.1 is confirmed (repair-notes.md:19-21).

---

## 4. The protocol the agent should have followed

**What the agent should have recognized (visible in its own log):** the session log
itself records the topology — host process inside `node_modules/@deepseek-ai/dsh`
(agent-session-log.txt:3), tool worker inside that host's process (agent-session-log.txt:7).
The requested task "update dsh to v0.1.2-rc.1" is literally "replace the directory my own
process tree runs from, using a child of that process tree." The agent read the release
notes (correct) but never asked **"am I inside the thing I am about to replace?"** — and
the answer, from its own session context, was yes.

**Should it have executed the global install at all? No.** Not "with a warning," not
"with a longer timeout," not "with a retry." The operation is structurally
uncompletable by this agent (Section 1) and its result is structurally unreceivable. The
agent's correct move: **refuse the tool call and hand the user an ordered external
procedure.** Checking release notes and *describing* the upgrade is fine; *performing* it
in-session is not.

**The exact external procedure to hand the user (order matters):**

1. **Record current state first.** From any shell outside dsh: `dsh --version`
   (expect `0.1.2-alpha.5`), note the active plugins, and keep the existing `dsh-old-*`
   backups until the new version is verified.
2. **Stop the dsh host before npm runs.** Exit the running `dsh web` host process (the
   one serving 127.0.0.1:3080) — closing the GUI tab is not enough. Nothing may remain
   running from the package directory. This must come **before** npm because (a) any
   surviving process rooted in the tree dies mid-install and corrupts the install,
   (b) on Windows, files held open by the host make the delete/replace inconsistent, and
   (c) an in-session npm call would sever its own result channel — the exact failure of
   this incident.
3. **Run the install from an external shell, in exactly this form:**
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   — the *formal registry install, global, version-pinned*. Why exactly this: the `-g`
   form is what populates the global prefix **and triggers npm's shim generation and
   metadata** — precisely the artifacts whose partial state killed the command; installing
   from the registry guarantees a standard, verifiable tree. Not a local file copy, not
   a tarball patched by hand, not a hand-written shim — every one of those reproduces
   Section 2's broken state.
4. **Verify the command, not the directory:** `dsh --version` → `0.1.2-rc.1`, and
   `dsh`, `dsh.cmd`, `dsh.ps1` present in `%APPDATA%\npm`. (A populated
   `node_modules\@deepseek-ai\dsh\` proves nothing on its own — Section 2.)
5. **Restart and functionally check:** `dsh --profile web`, hard-refresh the browser,
   confirm plugins load (whale / progress / …).
6. **Only then clean up:** remove `dsh-old-*` backups once rc.1 is confirmed.

**Which parts follow from known upgrade rules vs. what is new for this incident:**

- **Known/standard (ordinary upgrade discipline the agent already had):** read the
  release notes before upgrading (done — agent-session-log.txt:4); record the current
  version and keep a backup (the `dsh-old-*` backups existed — env-state.txt:5,
  agent-session-log.txt:33); stop the service before replacing its binaries; use the
  formal package-manager command rather than manual file operations; verify afterwards
  (version check + service restart + functional plugin check — repair-notes.md:19-21).
- **New for this incident:** the **self-host boundary**. When the agent's session runs
  inside the host process of the product being upgraded *and its tool worker is a child
  of that process*, the agent must **never execute that upgrade itself** — not because
  it is risky, but because it is structurally impossible to complete and impossible to
  receive results from. The correct action is a hard refusal plus an emitted external
  runbook. Two corollaries are equally new: (a) there is no "run it and wait to see"
  path — the result channel dies with the host; (b) post-upgrade verification must check
  the **command** (shims), not the presence of package content, because a half-finished
  npm global install on Windows kills the CLI while leaving the content on disk.

---

## 5. Prevention

**Agent-side guard against this class of failure:**

1. **Pre-execution self-reference check for every install/upgrade/uninstall/remove
   command.** Before running, resolve the target — `npm prefix -g` / `npm root -g` +
   package name — and compare it against the ancestry of the agent's own process tree:
   host executable path and module root, worker process path/cwd, the session's working
   directory. If the resolved target is an ancestor of (or equal to) the runtime the
   agent is executing inside, **hard-stop**: refuse the call, explain the topology in
   one sentence, emit the ordered external runbook. This must be a refusal, not a
   "please confirm" prompt — the failure is deterministic, so confirmation is
   meaningless.
2. **Generalize the class, not the command.** Same guard for: upgrading/restarting/
   stopping the host from inside one of its own sessions (`dsh web restart` issued from
   within the web session), replacing the interpreter/runtime the agent runs on, and any
   operation whose completion would kill or corrupt the process tree executing it.
3. **Manual-repair guard.** Never hand-copy files into, or hand-patch, a global install
   tree; route all repair through the package manager, executed from an external shell.
   (The user's partial manual swap deepened this incident — Section 2.)
4. **Journal integrity.** Tool calls whose host dies mid-flight must be recorded as
   *interrupted / outcome unknown*, never silently dropped — the pattern already visible
   in agent-session-log.txt:17-18, which any harness should preserve so post-mortems do
   not guess whether an upgrade completed.

**Post-upgrade checklist for this machine** (given the alpha.5 → rc.1 findings):

1. `dsh --version` → `0.1.2-rc.1`; `dsh`, `dsh.cmd`, `dsh.ps1` all present in
   `%APPDATA%\npm`; `dsh.ps1` no longer stale (repair-notes.md:11, agent-session-log.txt:31).
2. `npm ls -g --depth=0` lists `@deepseek-ai/dsh@0.1.2-rc.1` — a standard install with no
   hand-patched remnants (env-state.txt:11-13, repair-notes.md:3-6).
3. `dsh --profile web` starts cleanly; GUI reachable at 127.0.0.1:3080; browser
   hard-refreshed to avoid cached GUI assets (repair-notes.md:20).
4. Plugins load (whale / progress / etc.). Required despite the alpha.5→rc.1 diff being
   252 files of pure package.json version bumps with zero API changes — no re-migration
   is needed, so *nothing* should regress, and a successful load is the proof
   (repair-notes.md:16-17).
5. Only after 1-4 pass: delete the `dsh-old-*` backups (repair-notes.md:21); confirm the
   host-source checkout is aligned to tag `dsh-v0.1.2-rc.1` (repair-notes.md:12-13).

---

## Summary table

| Question | Answer |
|---|---|
| Failure type | Structural, deterministic — the upgrade target is the agent's own runtime (session-log:3,7) |
| What dies first | The dsh host process, mid-install, when npm deletes the tree it runs from (session-log:9-12,14) |
| Why no tool result | Worker → host → agent result channel is severed by the host's death; outcome unknowable by design (session-log:17-18) |
| Why `dsh` vanished | npm links shims at the end of install; interruption removed old shims, never wrote new ones; content left behind is inert (session-log:30-33, env-state:11-15) |
| Why manual patching worsens | No shims created, npm metadata diverges from disk, mixed/partial content, backup endangered |
| Correct repair | External re-run of `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` — idempotent, regenerates shims + metadata, observable (repair-notes:9-11) |
| Correct agent protocol | Refuse in-s execution; stop host → external `npm install -g …@0.1.2-rc.1` → verify `dsh --version`/shims → restart → plugin check → cleanup |
| Known vs new | Known: release notes, backup, stop-service, formal installer, verify-after. New: self-host boundary (never self-upgrade), result channel dies with host, verify the command not the content |
| Prevention | Pre-exec self-reference guard with hard refusal; generalize to all self-corrupting commands; manual-repair guard; interrupted-call journaling; post-upgrade checklist per repair-notes findings |
