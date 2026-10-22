# S16 · The Self-Host Upgrade Trap — Incident Analysis

**Scope.** Read-only analysis of the evidence pack in `fixture/` (agent-session log, before/after
machine state, external repair notes). Nothing was executed, installed, migrated, or modified; the
fixture is untouched. All findings below are derived from the four evidence files only.

**Verdict in one line.** The failure was structural, not flaky: the agent ran a global npm
install of the very package its own session was executing inside, so the command destroyed its own
execution and reporting infrastructure mid-run; the only correct repair is a *formal re-install run
from outside dsh*, and the only correct agent behaviour is to refuse the self-upgrade and hand the
user an external procedure.

---

## 1. The structural root cause — npm was replacing the agent's own runtime

### 1.1 What the session and its tool worker are, relative to the upgrade target

From `env-state.txt` (BEFORE) and `agent-session-log.txt` (header):

- The user asked the **agent**, and the agent is a dsh **web session running INSIDE the dsh host
  process** on the user's machine (`dsh web host -> running, GUI at http://127.0.0.1:3080`,
  `agent session -> active, executing INSIDE that host process`).
- The host process is `node .../node_modules/@deepseek-ai/dsh/...` — i.e. the host's executable
  code **is** the global package directory that the install command targets.
- The agent's tool calls (`pwsh: npm install -g ...`) execute in a **worker process that is a child
  of that host**, and the worker's result is transported back to the session through the host's
  session/IPC layer (the same layer that serves the browser tab).

So the process tree is:

```
dsh host process (node, running from node_modules/@deepseek-ai/dsh/)
└── tool worker (pwsh / npm)
        └── npm install -g @deepseek-ai/dsh@0.1.2-rc.1   ← deletes/replaces its own ancestors' code
```

The npm process's **parent chain is inside the package npm is replacing**. The blast radius of the
command includes the command's own execution substrate and the transport that would report its
result. That is a self-referential destruction, and it is why the failure is *by construction*:

### 1.2 What npm actually does to a same-name global package

Replacing an already-installed package of the same name in the same global prefix is a
**remove-then-install**, not an in-place patch. The log shows the exact phases
(`agent-session-log.txt:9-12`):

```
[16:41:02] npm warn cleaning node_modules/@deepseek-ai/dsh   ← uninstall of the old version begins
[16:41:05] npm info remove @deepseek-ai/dsh                   ← old package (and its bin links) gone
[16:41:09] npm info fetch @deepseek-ai/dsh@0.1.2-rc.1         ← new tarball fetched
[16:41:31] npm info linkStuff @deepseek-ai/dsh@0.1.2-rc.1     ← new content being linked…
```

Between `remove` and the end of `linkStuff`, the directory the host is executing from is deleted
or half-written. A node process that has already loaded its modules survives on its in-memory copy
for a while, but the host is a *long-lived server*: it must keep spawning workers, resolving
`node_modules` paths, reading files, and serving the browser socket. Any of those touches that land
inside the replaced tree hit a deleted or half-written directory, and the host dies — exactly at
`linkStuff` (~30 s in, `agent-session-log.txt:14`: `the web GUI session DIED (browser tab:
connection lost)`).

### 1.3 What dies first, and why the tool call never returned a result

**What dies first: the host process** (and with it, in order): the worker running npm (its parent is
gone), the session/IPC transport, and the browser's websocket to the GUI.

**Why no result was ever recorded** (`agent-session-log.txt:15-18`): a tool result is durably
recorded by the *session layer*, and the session layer lives in the host. The command killed the
host; therefore the layer that would have recorded `npm install succeeded` (or failed) no longer
existed. The npm process may well have partially succeeded at the OS level — the rc.1 content was in
fact partially linked — but **no observer inside the system remained to report it**. The recorded
outcome is honestly `<no result recorded … outcome unknown>`, and it is *permanently* unknowable
from inside.

This is what makes it structural rather than flaky:

- It is **not a timeout** — the 600 000 ms tool timeout was never reached; the host died ~30 s in.
- It is **not a bad command** — the same command is the *correct repair* when run externally
  (`repair-notes.md:9-11`). The command is fine; the *caller's position* is not.
- **No retry, longer timeout, different flag, or `--force` can fix it.** The failure mode is a
  dependency cycle (agent ⊂ host ⊂ package ⊂ install target), and the only variable that matters is
  *where the command runs from*.

---

## 2. The broken state afterwards — why `dsh` vanished with the package content still present

### 2.1 The command lives in the shims, not in the package directory

On Windows, a global npm package becomes a command only through **generated shims** in the global
prefix's bin directory (`%APPDATA%\npm`, which is what `PATH` resolves): `dsh` (bash),
`dsh.cmd` (cmd), `dsh.ps1` (PowerShell). `node_modules\@deepseek-ai\dsh\` holds the package
*content* but is **not itself a command** — it is inert without its bin links.

Shims are generated in the **final phase** of an install (bin-linking, after `linkStuff`). The
install died during `linkStuff`, so:

1. at `[16:41:05] npm info remove`, npm unlinked the **old** (alpha.5) shims as part of removing the
   old package — the command was deleted first;
2. the **new** shims were never generated, because bin-linking never ran.

Net state (`agent-session-log.txt:30-33`, `env-state.txt:15`): `dsh.cmd` and `dsh` **MISSING**,
`dsh.ps1` **stale — points into the old tree** (a removed/replaced path, so it cannot execute a
working command either). Hence `dsh --version` and `dsh web` -> `The term 'dsh' is not
recognized…` — command resolution fails regardless of the package directory being full of correct
rc.1 files. `repair-notes.md:5-6` states it plainly: the shims `were never generated — so the dsh
command was actually dead`.

### 2.2 Why hand-swapping or patching directories would make it worse

The package directory now holds rc.1 content, `some placed by hand during a partial manual repair
attempt by the user` (`env-state.txt:12-14`) — i.e. the install is **NON-STANDARD**
(`repair-notes.md:4-5`): the directory was replaced/swapped by hand, and npm's global bookkeeping
(the prefix's package-lock/metadata and the bin links) does not describe what is on disk. Repairing
*that* by hand compounds the damage:

- **npm's records and the filesystem disagree.** npm's view of the global tree no longer matches the
  bytes on disk. The next npm operation — including the correct repair — now has to clean a
  directory it does not believe it owns, which on Windows means failed deletes, `EEXIST/ENOTEMPTY`
  noise, or silently skipped files, i.e. a hybrid install.
- **The mixed content is a correctness hazard.** A half-old/half-new tree (rc.1 files + alpha.5
  leftovers + hand-placed files) can *load* while being subtly wrong — the worst outcome, because
  it defeats the `dsh --version` sanity check.
- **Hand-written shims are guesswork.** npm's shims encode the exact script path and layout npm
  itself will maintain; the surviving `dsh.ps1` already demonstrates the failure mode — it is stale
  and `points into the old tree`. A hand-patched shim that merely *exists* is not a repaired
  install, and npm will overwrite or conflict with it later.
- **It cannot restore authority.** Only a completed formal install makes content, npm's record, and
  shims agree again. Every manual edit moves the machine further from that agreement.
- The recorded verdict (`env-state.txt:16-17`) is the direct consequence: `the dsh CLI itself is
  unusable; only an external tool (another agent CLI) can repair the install` — and note *why*
  external: no dsh host is running anymore, so nothing is holding locks on the package files and no
  npm process is a child of the thing it replaces.

---

## 3. The repair that was actually applied — and why it works

From `repair-notes.md` (an external agent CLI, run **outside** dsh):

1. **Re-ran the formal install from the registry**: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   -> `dsh / dsh.cmd / dsh.ps1 all regenerated; dsh --version -> 0.1.2-rc.1`.
2. **Aligned the source checkout** (the workspace used for host-source reference) from the alpha.5
   tag to the `dsh-v0.1.2-rc.1` tag; no local-modification conflicts.

**Why this form of repair works where the in-session attempt could not:**

- **Position.** It ran from outside any dsh session: no running host was npm's ancestor, no GUI
  transport depended on the outcome, and no process was executing from the directory npm deletes.
  The remove-then-install cycle could therefore run to completion — critically the **bin-linking
  phase that generates the shims**, which is precisely the phase the in-session attempt never
  reached.
- **Authority.** A completed install is the only operation that restores the three-way agreement
  (package content <-> npm's global record <-> generated shims). Hand-patching can never do this.
- **Timing safety.** The old host had already died in the incident, so no live process held the
  package files — on Windows that matters, because a running host's file locks would make npm's
  remove step fail or partial.
- Note the symmetry: **the repair is the same command that failed**. That is the cleanest proof that
  the original failure was not about the command, the version, or npm — it was about *who was
  standing inside the blast radius when it ran*.

**How the result is verified:**

- `dsh --version -> 0.1.2-rc.1` — proves both that the command resolves (shims regenerated and on
  PATH) and that the linked content is rc.1.
- Shim regeneration is implicitly verified by the command resolving at all (`dsh`, `dsh.cmd`,
  `dsh.ps1` all regenerated).
- Deferred to the user (`repair-notes.md:19-21`): **real-machine verification** — start
  `dsh --profile web`, hard-refresh the browser, confirm plugins load (whale / progress / etc.);
  optional cleanup of the `dsh-old-*` backups once rc.1 is confirmed.
- The diff finding de-risks that checklist: **alpha.5 -> rc.1 = 252 files, ALL package.json version
  bumps, zero API/feature changes** (`repair-notes.md:15-17`), so plugins migrated for
  0.1.2-alpha.x need **no re-migration** — the remaining risk is install health, not API breakage.

---

## 4. The protocol the agent should have followed instead

### 4.1 What the agent should have recognized

The agent should have recognized, **before** forming the tool call, that it is a *self-upgrade*:
its session runs inside the dsh host, the host runs from the global `@deepseek-ai/dsh` package, and
that package is the install target. Reading the release notes was legitimate (read-only, outside the
blast radius). Executing the replacement of its own runtime was not: the call's result is
*structurally undeliverable* (see 1.3), and its failure mode is a machine with no working dsh CLI
(see section 2).

### 4.2 Should it execute the global install at all?

**No — in no form.** Not `@0.1.2-rc.1`, not `@latest`, not via `npm up -g`, not "detached in the
background so it survives". Detaching is strictly worse: it removes even the partial observer the
in-session attempt had and leaves a blind mutation of the user's machine. The discipline boundary
here is exactly: **"do it for the user" ends where the action's blast radius includes the agent
itself and the user's machine health; beyond that line the agent's job is to hand the user a
procedure the agent must not execute.**

### 4.3 The exact external procedure to hand the user (order matters)

1. **Expect and announce the session loss.** State up front that completing this upgrade *will* end
   the current dsh session (and any dsh-hosted work in it); that is normal, not an error to debug.
2. **Stop the running host from outside, BEFORE npm runs.** Close the GUI and stop the dsh host
   process (e.g. `Stop-Process` on the `node .../@deepseek-ai/dsh/...` process, from a plain terminal
   or Task Manager). This must happen first because (a) npm's remove step must be able to delete the
   package directory — a running host holds those files on Windows and dies mid-install otherwise
   (see 1.2), and (b) no npm process may be a descendant of the host it is replacing (see 1.1).
3. **Run the install from a plain shell that is not a dsh session/tool worker**, and let it
   complete: `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. The command must be:
   - **exact-pinned** (`@0.1.2-rc.1`, never `@latest`/range) — an rc/alpha line's moving tags must
     not be resolved implicitly, and the installed version must match the release notes that were
     actually read;
   - **a single, uninterrupted run** — the fatal signature of this incident is an install truncated
     between `remove` and shim generation (see 2.1); a partial run leaves the CLI dead. Give it a
     generous timeout in an interactive shell (the fetch alone took ~20 s in the log).
4. **Verify before reconnecting:** `dsh --version` -> `0.1.2-rc.1`; then start the host fresh
   (`dsh --profile web` / `dsh web`), hard-refresh the browser, confirm plugins load.
5. **Only then, optional cleanup:** remove the `dsh-old-*` backup directories once rc.1 is
   confirmed working.

### 4.4 Which parts are known upgrade rules, and which are new for this incident

| Part | Status |
| --- | --- |
| Pin the exact version; verify after install; never hand-edit installed artifacts; stop a service before replacing its own files | **Known upgrade rules** — the agent should already have applied these |
| An agent running *inside* dsh must **never** execute a global install of dsh itself — not even "just to check" (`npm view`/`npm ls` are fine; `npm install -g @deepseek-ai/dsh@...` is not) | **New for this incident** — the self-hosting recognition |
| The self-upgrade tool call is **structurally unable to return a result** (the transport dies with the host), so "run it and see" is not a strategy | **New** |
| The interrupted-install signature — `npm warn cleaning` -> `remove` -> `fetch` -> `linkStuff` -> host death, shims missing, `command not found` — and its only correct repair: **formal re-install from outside**, never shim/directory patching | **New** |
| alpha.5 -> rc.1 is version-bump-only (252 files, zero API changes), so the post-upgrade checklist verifies plugin *loading*, not plugin *re-migration* | **New (incident-specific reassurance)** |

---

## 5. Prevention

### 5.1 An agent-side guard against this class of failure

A **self-target check in the tool-call path**, evaluated *before* executing any package-manager
command:

1. **Parse** the command for global package operations: `npm install|i|uninstall|update|up|ci -g
   <pkg>[@<ver>]` (and the pnpm/yarn global equivalents).
2. **Resolve the caller's own package identity**: the package the current host process is running
   from — derivable from the host's main-module path (`.../node_modules/@deepseek-ai/dsh/...`), the
   shim that launched the session, or the session's recorded launch path — and its global prefix.
3. **Resolve the command's target identity**: the package name/version being installed and the
   global prefix it will land in.
4. **If they intersect (same package, same prefix) -> refuse the call** and emit the hand-off
   procedure from 4.3 instead. The refusal message should say *why*: "this would replace the
   package this session is running inside; the call cannot return a result and will leave the CLI
   dead; here is the external procedure."

Two supporting guards for the same class:

- **Blast-radius / deliverability guard.** Any command whose effects include the current process
  tree (self-replacement, killing the host, replacing the node binary or the prefix) either is
  refused, or — when genuinely needed — must run **detached with durable logging to a file** plus an
  explicit "check the log from a new shell" instruction. For self-upgrade specifically, refuse: the
  repair path must be owned by the user, not by a blind background process.
- **Interrupted-install triage guard.** If an install is ever observed truncated (the 2.1
  signature), the agent must never hand-patch shims or directories; the only sanctioned repair is
  re-running the formal install externally, followed by 5.2.

### 5.2 Post-upgrade checklist for this machine (alpha.5 -> rc.1)

Given the repair notes' finding that the alpha.5->rc.1 diff is version-bump-only (252 files, zero
API/feature changes, no plugin re-migration needed), the checklist is about **install health and
load verification**, not migration:

1. **Shims:** `dsh`, `dsh.cmd`, `dsh.ps1` all present in `%APPDATA%\npm`, none stale (none
   pointing into a `dsh-old-*` tree).
2. **Version:** `dsh --version` -> `0.1.2-rc.1`.
3. **Standard install:** `npm ls -g --depth=0` reports `@deepseek-ai/dsh@0.1.2-rc.1`; no
   hand-placed/hybrid content remains from the manual repair attempt (content matches the registry
   tarball; if in doubt, re-run the formal install once more).
4. **No stale processes:** no alpha.5 host/worker processes still running.
5. **Host + GUI:** `dsh --profile web` starts cleanly; GUI reachable; browser hard-refreshed.
6. **Plugins load** (whale / progress / etc.) — verify they *load*, which per the diff finding is
   all that should be needed.
7. **Source checkout** (if used for host-source reference) aligned to the `dsh-v0.1.2-rc.1` tag
   with no local-modification conflicts.
8. **Cleanup (optional, last):** remove `dsh-old-*` backup directories only after 1-7 pass.

---

## Evidence map

| Claim | Source |
| --- | --- |
| Session ran inside the host process; GUI at 127.0.0.1:3080 | `agent-session-log.txt:1-7`, `env-state.txt:3-4` |
| Install phases and death during `linkStuff`; no tool result recorded | `agent-session-log.txt:9-18` |
| `dsh` command not found; shims missing/stale; package content present | `agent-session-log.txt:22-33`, `env-state.txt:8-17` |
| Non-standard install; shims never generated; repair = formal re-install externally | `repair-notes.md:3-11` |
| alpha.5->rc.1 = version bumps only; verification left to user | `repair-notes.md:15-21` |
