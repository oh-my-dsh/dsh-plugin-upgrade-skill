# S16 · The Self-Host Upgrade Trap — Report

## 1. Structural root cause (why this fails by construction, not by accident)

The agent was not a bystander watching a package get upgraded. It was running *inside the
package being upgraded*, and it executed the upgrade with its own hands.

- **What the session is.** The dsh web session runs inside the dsh host process. The host
  process is literally `node .../node_modules/@deepseek-ai/dsh/...` — i.e. the process's
  own code is loaded from the very global-package directory that `npm install -g
  @deepseek-ai/dsh@0.1.2-rc.1` is about to delete and replace. The agent, its runtime, the
  HTTP server behind the GUI, and the tool-result recorder are all objects that live *inside*
  the target of the operation.
- **What the tool worker is.** The pwsh/npm tool call is a child spawned by that same host
  process ("running inside the host's own worker process"). It is the host's execution arm,
  and its stdout/result is delivered back *through* the host. So the orchestrator of the
  upgrade is itself a descendant of the thing npm is replacing.
- **What dies first.** The host process dies first. npm's sequence is visible in the log:
  `cleaning node_modules/@deepseek-ai/dsh` → `remove @deepseek-ai/dsh` → `fetch` →
  `linkStuff`. The first two phases physically remove the directory the host is executing
  from. On Windows this compounds two effects: in-use files are locked so deletion/replacement
  is not atomic, and the still-running host — which has only its already-loaded modules in
  memory — faults or crashes as soon as it lazy-requires anything from a file that no longer
  exists. The GUI connection loss at the `linkStuff` phase is exactly this: the host process
  (which serves the GUI) died mid-install.
- **Why the tool call never returned a result.** The tool result travels back up the
  host↔child channel to the host, which is the entity that durably records the result. Because
  the host was destroyed by the very operation it launched, there was no receiver left to
  capture the child's completion, so the call recorded "<no result — outcome unknown>." This is
  the interrupted-install signature: the operation got through *remove → fetch* and was cut off
  at *linkStuff* (shim generation), leaving no result and no final state.

This is structural, not a flake: any self-modifying operation that replaces the directory a
running process is executing from will always sever the channel that records the operation's
own outcome. The agent sawed off the branch it was sitting on.

## 2. The broken state afterwards

- **Why `dsh` vanished while package content remained.** The command `dsh` is not the
  package content; it is the *bin shim* that npm generates in the global prefix during the
  `linkStuff` phase — on Windows that is `dsh` (sh), `dsh.cmd` (cmd), and `dsh.ps1`
  (PowerShell). The shell resolves `dsh` through those shims, which point into
  `node_modules/@deepseek-ai/dsh`. The install was killed *before/at* shim generation, so
  the shims were never (re)written: `dsh` and `dsh.cmd` are MISSING and `dsh.ps1` is
  stale (points into the removed old tree). The rc.1 package files sit on disk, but nothing on
  PATH points at them, so the shell reports "not recognized" even though the content exists.
  A dead shim layer = a dead command, independent of the package directory's contents.
- **Why hand-swapping/patching directories makes it worse.** A correct `npm install -g` is
  not "copy files into a folder"; it also maintains invariant side effects: correctly-generated
  shims (absolute paths, Windows wrapper quoting, the package's `bin` field), and npm's reify/
  lock metadata so npm and the filesystem agree on what is installed. Manually swapping
  `@deepseek-ai/dsh` with a backup or copying files reproduces none of those invariants: you
  get a non-standard tree whose shims are missing or point at the wrong root, with no reify
  record, so it can look "installed" but fail at load time. Every manual edit adds divergence
  from the canonical install, and erases the authoritative signal of what a correct install
  looks like — making verification impossible and the eventual repair harder. The evidence
  confirms the trap already happened once: the user's partial manual repair left rc.1 content
  "placed by hand," producing a "NOT a standard install."

## 3. The repair

- **What was actually applied.** The external repair session did **not** hand-patch anything.
  It re-ran the formal registry install — `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` — from
  an *external* agent CLI running outside dsh. That single command regenerated `dsh` /
  `dsh.cmd` / `dsh.ps1` and made `dsh --version` return `0.1.2-rc.1`. It then aligned the
  source checkout from the alpha.5 tag to the `dsh-v0.1.2-rc.1` tag.
- **Why this works where the in-session attempt could not.** The external tool is *not* inside
  the package being replaced: its running code lives elsewhere, so when npm deletes/replaces
  `node_modules/@deepseek-ai/dsh` and regenerates shims, nothing executing the repair is
  destroyed. There is no self-referential dependency, so the operation runs to completion
  (through `linkStuff`) and its result can be recorded. Additionally, the old dsh host was
  already dead, so no running process held file locks to block the clean reinstall.
- **How the result is verified.** (a) `dsh --version` → `0.1.2-rc.1`; (b) all three shims
  regenerated and pointing into the rc.1 tree; (c) real-machine check — start
  `dsh --profile web`, hard-refresh the browser, confirm plugins load; (d) source checkout on
  the rc.1 tag.

## 4. The protocol the agent should have followed

- **What it should have recognized.** The agent is the upgrade target: its own runtime code
  lives in the exact directory `npm install -g` will replace. Therefore it must **not**
  execute the global install itself — not even "carefully" or "detached" — because replacing
  its own files necessarily kills it mid-operation and severs its own result channel.
- **Should it run the install at all?** No. This is the agent-discipline boundary: the correct
  move is to *hand the user a procedure they run outside dsh*, not to do it for them.
- **Exact external procedure (order matters).**
  1. **Stop the running dsh host first** (quit `dsh web` / close the GUI; ensure no dsh/node
     process still holds the package files). This must happen *before* npm runs, so no process
     locks the files and the reinstall is clean.
  2. From a separate shell/agent *outside* dsh, run the pinned install:
     `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`.
     The `@0.1.2-rc.1` pin is required — a bare `npm install -g @deepseek-ai/dsh` would
     resolve to *latest*, which may not be rc.1, so pinning reproduces exactly the reviewed
     release notes.
  3. Verify: `dsh --version` → `0.1.2-rc.1`; confirm `dsh` / `dsh.cmd` / `dsh.ps1`
     are present and point into the rc.1 tree.
  4. Restart `dsh --profile web`, hard-refresh the browser, confirm plugins load.
  5. Only after rc.1 is confirmed, remove the stale `dsh-old-*` backups.
- **Known-upgrade-rules vs. new for this incident.** Already standard upgrade discipline:
  pin the exact target version, prefer the formal registry install over manual copying, stop the
  running instance before replacing it, and verify with `--version`. *New for this incident*
  is the self-host recognition itself: that the agent lives inside the target and so must not
  execute the install at all, and must hand off an external procedure that includes "stop the
  host first" — because the agent cannot survive long enough to do stop-then-install itself.

## 5. Prevention

- **Agent-side guard.** Add a pre-flight self-modification check to the command/tool layer:
  before any mutating command (`npm i/-g/install/update/remove`, or any write) whose resolved
  target path is the same as — or an ancestor of — the directory the running dsh host executes
  from (`node_modules/@deepseek-ai/dsh`), **refuse to execute** and instead emit the external
  hand-off procedure. Concretely: resolve the global prefix + package name, compare it with the
  host's own code root (derived from its executable/module path), and block on intersection. The
  strongest signal is `-g` combined with the *hosting* package name. The guard must refuse,
  not "try detached," because detachment cannot fix file locks or the orchestrator's own
  self-destruction.
- **Post-upgrade checklist for this machine** (given the alpha.5 → rc.1 findings):
  1. `dsh --version` returns `0.1.2-rc.1` (not alpha.5, not stale).
  2. Shims `dsh`, `dsh.cmd`, `dsh.ps1` all present and pointing into the rc.1 tree.
  3. `dsh --profile web` starts cleanly; GUI responds at 127.0.0.1:3080 after a hard refresh.
  4. Plugins load (whale / progress / etc.). The alpha.5 → rc.1 diff is 252 files, *all*
     package.json version bumps with zero API/feature changes, so plugins migrated for
     0.1.2-alpha.x need no re-migration — only a load confirmation.
  5. Source checkout aligned to the `dsh-v0.1.2-rc.1` tag.
  6. Remove stale `dsh-old-*` backups only after rc.1 is confirmed.
