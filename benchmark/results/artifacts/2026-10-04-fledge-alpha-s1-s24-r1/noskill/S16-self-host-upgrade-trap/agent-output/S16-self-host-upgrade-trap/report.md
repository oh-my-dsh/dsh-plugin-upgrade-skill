# S16 路 The Self-Host Upgrade Trap — Report

## 1. Structural root cause

The failure was not flaky or racy; it was guaranteed by construction. The dsh web session —
and therefore the agent and its tool-call worker — ran **inside the dsh host process
itself** (`node .../node_modules/@deepseek-ai/dsh/...`, GUI on http://127.0.0.1:3080). The
npm command the agent ran executed from a worker spawned by that very host process, and it
targeted the **same global npm package directory the running host was loaded from**.

`npm install -g` first removes/cleans the existing package (`npm warn cleaning
node_modules/@deepseek-ai/dsh`, `npm info remove @deepseek-ai/dsh`) — i.e. it deletes the
files the live host process and its worker were standing on. As the swap proceeds
(`linkStuff @deepseek-ai/dsh@0.1.2-rc.1`), the host's code tree is replaced out from under
it. The host process dies (GUI "connection lost"), and with it its tool worker, so the
`npm install` child is orphaned/killed mid-`linkStuff`. The tool call was therefore
**interrupted before producing any durable result** — `<no result recorded>` — because the
very agent bookkeeping process that would persist the result is a child of the thing npm
was replacing. The outcome is unrecoverable from inside the session; even success would
have had the same shape, because a completed swap still kills the session.

## 2. Broken state afterwards

From the before/after state: before the upgrade dsh was 0.1.2-alpha.5 with all three
shims (`dsh`, `dsh.cmd`, `dsh.ps1`) and a healthy host. Afterwards the package **content**
at `node_modules\@deepseek-ai\dsh\` was present (rc.1 files, partly hand-placed by a user's
manual repair), but:

- `dsh.cmd` and `dsh` shims were **missing** — npm never completed the `linkStuff`/bin-link
  step that (re)generates them;
- `dsh.ps1` was **stale**, pointing into the old tree;
- the user's partial hand-copy aligned content but not the npm metadata/bin links.

Since PATH resolution for `dsh` relies on those shim files, the CLI vanished even though
package files were on disk. An install that isn't a standard npm global install (no
`_package.json`-consistent tree, no bin shims, no `.bin` links) is invisible to the shell.

Hand-swapping or patching directories is worse, not better: it yields a hybrid tree
(alpha.5 leftovers, `dsh-old-0.1.1-rc.1` backup, hand-copied rc.1 files) that npm itself
can no longer reason about. A later formal `npm install -g` expects to own the directory;
stale/backup folders and mixed content cause npm to skip, misplace, or conflict with its
own removal/link steps, leaving an unbootable, inconsistent "install" that still has no
working shims.

## 3. The repair

The external repair session (a different agent CLI, run **outside** dsh, after the host
was dead) did the one thing the in-session attempt couldn't: it **re-ran the formal
install from the registry**:

```
npm install -g @deepseek-ai/dsh@0.1.2-rc.1
```

This works where the in-session attempt could not because no dsh process was holding the
global tree: npm was free to clean the non-standard/partially-swapped directory wholesale
and perform a fresh, complete install — fetch, extract, `linkStuff`, and regenerate the
`dsh`, `dsh.cmd`, `dsh.ps1` shims. Verification: `dsh --version` -> `0.1.2-rc.1`. The
repair notes also aligned the host-source checkout from the `dsh-v0.1.2-alpha.5` tag to
`dsh-v0.1.2-rc.1` (no local-modification conflicts), confirming the workspace matches the
installed binary. Left to the user: real-machine verification (`dsh --profile web`,
hard-refresh, confirm plugins load) and optional cleanup of `dsh-old-*` backups once rc.1
is confirmed working.

## 4. The protocol the agent should have followed

Recognition: the agent must identify that its own session, its tool worker, and the dsh
host process it serves are **inside the upgrade target**. A global `npm install -g
@deepseek-ai/dsh` executed from within is self-host replacement. It should therefore
**refuse to execute the install itself** — agent discipline boundary: "do it for the
user" ends where the agent is a component of the thing being replaced; from there it
hands the user a procedure.

The exact external procedure to give the user:

1. **Stop dsh first** — exit/kill the dsh web host process and close the browser tab
   running the session (confirm nothing on http://127.0.0.1:3080 responds). npm must not
   be run while any dsh process is holding files in the global npm tree.
2. From a **fresh, external shell/terminal** (not a tool call inside a dsh session), run:

   ```
   npm install -g @deepseek-ai/dsh@0.1.2-rc.1
   ```

3. Verify: `dsh --version` -> `0.1.2-rc.1`, then start the host (`dsh web` /
   `dsh --profile web`) and confirm the GUI and plugins load.

Order matters: the running dsh host must be terminated **before** npm runs, otherwise npm
deletes the tree out from under the live process and the install dies mid-`linkStuff`.

What is already known (existing upgrade rules): global npm installs replace the package
directory and regenerate shims, so any live consumer of that tree must be stopped first;
installs should be verified with `--version`; old-version backups are cleaned up only
after the new version is confirmed. **New for this incident**: the agent must treat *its
own session host* as the consumer it must not replace under itself — i.e. self-reference
check before any self-upgrade-shaped tool call, and a hard rule that global dsh upgrades
are never executed from a dsh web session.

## 5. Prevention

Agent-side guard: before any tool call that replaces, reinstalls, or uninstalls software,
the agent should resolve the install target (global npm prefix for `@deepseek-ai/dsh`) and
compare it against the process tree/working-directory of its own session. If the target
contains the running dsh host (the session's parent/host process), classify the call as a
self-upgrade trap and refuse to execute; respond with the external procedure from §4.
More generally: any `npm install -g`/uninstall/update whose package provides the host of
the current session gets the same refusal-and-handoff treatment.

Post-upgrade checklist for this machine (given alpha.5 -> rc.1 findings):

- `dsh --version` reports `0.1.2-rc.1` and all three shims (`dsh`, `dsh.cmd`, `dsh.ps1`)
  exist and are freshly generated;
- `dsh --profile web` starts, GUI at http://127.0.0.1:3080 loads after a hard browser
  refresh, and plugins (whale / progress / etc.) load;
- the source checkout used for host-source reference is aligned to `dsh-v0.1.2-rc.1`;
- no stale `dsh-old-*`-style manual swaps remain in the global tree; old backups
  (`dsh-old-0.1.1-rc.1`, `dsh-old-*`) may be removed once rc.1 is confirmed stable;
- re-check that no future in-session agent runs `npm install -g @deepseek-ai/dsh`
  (the §4 handoff rule is in effect).

Since the alpha.5 -> rc.1 diff is 252 files of pure package.json version bumps with zero
API/feature changes, plugins migrated for 0.1.2-alpha.x require no re-migration; the
checklist needs no plugin re-migration step.
