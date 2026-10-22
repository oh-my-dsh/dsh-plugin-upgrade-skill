# S16 · The Self-Host Upgrade Trap — Incident Report

Evidence: fixture/agent-session-log.txt, fixture/env-state.txt, fixture/repair-notes.md (read-only, unmodified).

## 1. Structural root cause: failure by construction, not by accident

The agent was not a process *next to* dsh — it was a workload *inside* dsh:

- The **host process** was `node .../node_modules/@deepseek-ai/dsh/...` (per the session-log header).
- The **web GUI session** at http://127.0.0.1:3080 was served by that host process.
- The **pwsh tool call** ran inside "the host's own worker process" — i.e., the executor of
  `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` lived inside the very package tree that npm
  was about to delete and replace.

The npm global upgrade is a *replace* operation, and the log shows the exact order that makes
this fatal: `cleaning node_modules/@deepseek-ai/dsh` → `remove @deepseek-ai/dsh` → fetch →
`linkStuff`. The moment npm removed the old package content, it deleted the code under the
feet of the running host: every subsequent module load, file stat, or IPC hop the host/worker
makes into `node_modules/@deepseek-ai/dsh` hits missing or half-written files.

**What dies first is the executor itself.** The host process (and with it the worker that was
running npm, and the web server backing the GUI tab) crashed mid-install — the GUI showed
"connection lost" at `linkStuff`. And **the tool call never returned a result** because the
component responsible for observing npm's exit and persisting the tool result *was the thing
that got killed*: no surviving process remained to record an outcome, so the log shows
"<no result recorded … outcome unknown>". This is structural: any in-session global upgrade of
the harness destroys its own runtime partway through, regardless of timing luck. It is not a
flaky network or a race that might succeed on retry — the mutator is a live dependent of the
mutation target, so interruption is guaranteed; only the exact crash point varies.

## 2. The broken state afterwards

Why `dsh` vanished although the package content was still present:

- A working npm global install is **two artifacts**: (a) the package tree under
  `%APPDATA%\npm\node_modules\@deepseek-ai\dsh`, and (b) the **bin shims**
  (`dsh`, `dsh.cmd`, `dsh.ps1`) in `%APPDATA%\npm` that npm generates during the
  link phase (`linkStuff`/bin linking) to point into that tree.
- The host died *between* "old tree removed / new content partially written" and "shims
  regenerated". Result per env-state.txt: rc.1 package **content** sits on disk, but
  `dsh.cmd` and `dsh` are **MISSING** and `dsh.ps1` is **stale, pointing into the old
  tree**. PATH resolution finds nothing runnable → "The term 'dsh' is not recognized".
- Content-on-disk is not an installation. Without the shims (and a clean, complete package
  layout) the CLI is dead no matter how many rc.1 files are present.

Why hand-swapping/patching directories makes it worse:

- The user already attempted a partial manual repair ("some placed by hand", "the directory
  had been replaced/manually swapped"). That converts a merely *interrupted* install into a
  **non-standard install**: file versions get mixed (alpha.5 leftovers vs rc.1), npm's idea of
  what is installed no longer matches reality, and the missing-shim problem is masked rather
  than fixed. The repair notes explicitly call the result "NON-STANDARD … the dsh command was
  actually dead" and verdict: only an external tool can repair it. Hand-patching adds entropy
  to a state that needs to be made *standard* again; every manual edit increases the distance
  from a registry-clean layout and makes diagnosis harder.

## 3. The repair actually applied, why it works, and how it was verified

Applied repair (repair-notes.md): **re-run the formal registry install from an external
session** — a different agent CLI, running outside dsh:

```
npm install -g @deepseek-ai/dsh@0.1.2-rc.1
```

Why this works where the in-session attempt could not:

1. **No self-amputation.** The repairing process does not execute from
   `node_modules/@deepseek-ai/dsh`. npm can remove, write, and link the package tree without
   killing the process that is performing the operation, so the install runs to completion —
   including the shim-generation phase that the in-session run never reached.
2. **Restoration of a standard install, not patching of a broken one.** Re-running the formal
   install overwrites the half-written/hand-swapped tree into a known-good registry layout and
   regenerates all three shims. It fixes the root defect (missing/stale shims, non-standard
   tree) instead of layering more manual edits on it.

Verification: `dsh / dsh.cmd / dsh.ps1` all regenerated; `dsh --version` → `0.1.2-rc.1`.
The companion source checkout was aligned from the alpha.5 tag to the `dsh-v0.1.2-rc.1` tag
with no local-modification conflicts. Left to the user: real-machine verification — start
`dsh --profile web`, hard-refresh the browser, confirm plugins load (whale / progress /
etc.); optionally clean up `dsh-old-*` backup directories once rc.1 is confirmed.

## 4. The protocol the agent should have followed instead

**Self-recognition:** the agent should have recognized that it *is part of the upgrade
target*. Its session, the GUI, and the tool worker all execute from
`node_modules/@deepseek-ai/dsh` on the same machine — so a global dsh install issued from a
dsh tool call is a process deleting its own runtime. 

**Should it execute the global install at all? No.** This is the discipline boundary: for a
self-host upgrade, the agent's correct move is not "do it for the user" but "hand the user a
procedure the agent itself must not execute" — the agent cannot survive its own execution, so
it cannot even report the outcome (as the missing tool result proves).

**The exact external procedure, in order:**

1. **Before npm runs — stop everything running from the old tree.** Exit all dsh sessions and
   stop the dsh web host (`dsh web` process). Nothing may be executing out of
   `%APPDATA%\npm\node_modules\@deepseek-ai\dsh` while npm replaces it. Skipping this
   step recreates the incident.
2. **From a plain external shell** (a normal terminal / another CLI, *not* a dsh session), run
   the formal pinned registry install:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   It must be the full registry install with the exact version tag — never a directory swap,
   file copy, or `npm link` — because only the formal install regenerates the bin shims and
   leaves a standard, verifiable layout.
3. **Then restart and verify:** `dsh --version` must print `0.1.2-rc.1`; confirm
   `dsh`/`dsh.cmd`/`dsh.ps1` exist and are fresh; start `dsh web` (or
   `dsh --profile web`), hard-refresh the GUI, confirm the session and plugins come up.

**Which parts are known rules vs new:** "stop the old version before upgrading", "use the
formal installer rather than copying files", and "verify the version afterwards" already
follow from standard upgrade rules. The **new** element for this incident is the agent-side
one: the agent must *decline to run the command itself* because it lives inside the target,
and must instead hand the user the external procedure (steps 1–3) to execute outside dsh.

## 5. Prevention

**Agent-side guard (against this class of failure):** before executing any mutating command
(install/upgrade/uninstall), the agent should check whether the mutation target intersects its
own runtime: e.g., detect `npm install -g @deepseek-ai/dsh` / any write whose target path is
an ancestor of the host process's module tree (the package containing the running host, its
bin shims, or its global prefix). On match: **refuse to execute**, explain that the agent runs
inside the target and the operation must be performed externally, and emit the ordered
external procedure from §4. Bonus: after any user-reported upgrade, treat "tool call recorded
but no result + GUI disconnect" as the interrupted-install signature and check for missing
shims before declaring success.

**Post-upgrade checklist for this machine (given the alpha.5→rc.1 findings):**

- `dsh --version` → `0.1.2-rc.1`; shims `dsh`, `dsh.cmd`, `dsh.ps1` all present and
  pointing into the current tree (not stale).
- The global tree is a *standard* install (registry layout, no hand-placed files).
- Start `dsh --profile web`, hard-refresh the browser, confirm the GUI reconnects.
- Confirm plugins load (whale / progress / etc.). The repair notes' key finding supports this
  being sufficient: the alpha.5→rc.1 diff is 252 files, **all `package.json` version bumps,
  zero API/feature changes** — plugins migrated for 0.1.2-alpha.x need **no re-migration**.
- Align the host-source reference checkout to the `dsh-v0.1.2-rc.1` tag (done in repair; no
  local-modification conflicts).
- Once rc.1 is confirmed working, optionally remove the `dsh-old-*` backup directories.
