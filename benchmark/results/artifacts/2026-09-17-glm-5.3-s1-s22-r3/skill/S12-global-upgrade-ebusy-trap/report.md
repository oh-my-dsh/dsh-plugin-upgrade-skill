# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Mode: A-style read-only diagnosis of a **DSH host global upgrade** (not a plugin Mode B/C operation).
Evidence: attempt1-ebusy.log, attempt2-downgrade.log, npm-dist-tags.txt, running-processes.txt (fixture, unchanged).

## Context

- Installed host: `dsh` 0.1.2-alpha.4 on Windows, six community Web plugins across three GitHub mirrors.
- Target: 0.1.2-alpha.5.
- Upgrading the global `npm install -g @deepseek-ai/dsh` tree while an agent runs **inside** a dsh session is
  structurally fatal (npm replaces the very package tree the session executes from). This diagnosis is done from
  the evidence pack only; no install or migration was executed.

## 1. Attempt 1 root cause — why `koffi.node` is EBUSY

**Who holds the lock:** the `dsh web` host process — `node.exe` PID 42432 in running-processes.txt. The host
loaded `@koromix/koffi` (native FFI addon used for sandbox/filesystem operations) at startup. `koffi.node` is a
native Windows PE DLL (`.node`); Windows locks a loaded DLL's file image for the lifetime of the mapping — no
other process can copy/overwrite/delete it while any process has it loaded. The agent session worker
(`node.exe` PID 23768) descends from the host, and the npm installer itself (PID 23920) is the one whose
`copyfile` from `...\@koromix\koffi-win32-x64\win32_x64\koffi.node` fails with EBUSY.

**Why a browser refresh does not help:** refreshing the page only reloads the browser SPA (Web Client). The Web
Client is not the process that loaded koffi — the **host** Node process is. The lock is held by the host OS
process image, and it is released only when that process exits. A refresh does not stop the host.

**Correct stop-then-upgrade sequence** (per the plugin-upgrade skill's global-host-upgrade discipline):

1. Fully stop every dsh process — the `dsh web` host and all session workers. Verify with
   `tasklist /FI "IMAGENAME eq node.exe"` that the host PIDs are gone (a browser refresh is not a host stop).
2. From an **external** terminal (not from inside a dsh session on that host), run the **pinned** install
   (see §3) — never a bare package name.
3. Restart `dsh web`, hard-refresh the browser, verify `dsh --version` and that plugins load.

Because the host is fully stopped before npm runs, nothing can crash mid-install. Attempt 1's crash was a
signature of doing it wrong, not a tolerable risk. If an install was already interrupted mid-copy, repair from
an external shell by re-running the pinned formal install — never hand-copy package directories or hand-write
shims (an interrupted install can leave content present without regenerated `dsh` shims, i.e. the `dsh`
command disappears until an external pinned re-install).

## 2. Attempt 2 root cause — why `dsh --version` printed 0.1.1-rc.2

The combined command from the plugin README used the **unpinned** package name `@deepseek-ai/dsh`. A bare
package name with no version spec resolves to the `latest` **dist-tag** — not to "keep or advance what is
installed." Per npm-dist-tags.txt at that moment:

- `latest` = **0.1.1-rc.2**
- `next` = 0.1.1-rc.2
- `alpha` = 0.1.2-alpha.5

The 0.1.2-alpha line is published only under the `alpha` tag, so the unpinned install "succeeded" by
**silently downgrading** 0.1.2-alpha.4 → 0.1.1-rc.2 — an older release line. That is exactly why
`dsh --version` printed 0.1.1-rc.2: the install did what it was told (install `latest`), and `latest`
pointed backwards relative to the installed prerelease.

## 3. Exact safe upgrade commands for this situation

Goal: alpha.5 on the host, plus the TUI plugin. All from an external terminal, after every dsh process is
stopped (§1 sequence):

```
# 0) stop dsh web and all sessions; verify no node.exe dsh processes remain
tasklist /FI "IMAGENAME eq node.exe"

# 1) pinned host install — always the exact version, never the bare name
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5

# 2) the TUI plugin as a separate, explicit step
npm install -g @deepseek-harness-tui/dsh-tui

# 3) restart and verify
dsh --version        # must print 0.1.2-alpha.5
```

Notes:

- Pin the host version explicitly (`@0.1.2-alpha.5`, or `@alpha` if you deliberately want the alpha tag).
  A bare `@deepseek-ai/dsh` follows `latest` and here means a downgrade.
- Install host and plugin in separate pinned commands rather than one unpinned combined line; after install,
  verify the target profile's composition still resolves each plugin to the expected package and that the
  runtime entries are active (a successful npm install alone does not mean DSH enabled the plugin).
- Hard-refresh the browser after restarting `dsh web`, and verify version markers and the six Web plugins.

## 4. Prevention — what plugin README authors should do differently

- **Never publish an unpinned global-install command.** `npm install -g @deepseek-ai/dsh <my-plugin>` makes
  the user's host version an accident of today's `latest` dist-tag — which can silently downgrade prerelease
  users. READMEs should pin the tested host version (`@deepseek-ai/dsh@0.1.2-alpha.5`) or a named dist-tag
  the author actually tests (`@alpha`).
- **Never bundle the host upgrade into the plugin's install line.** Install commands for a plugin should
  install only the plugin, and state the host compatibility range separately ("requires dsh
  0.1.2-alpha.4/alpha.5"), letting the user upgrade the host deliberately with their own pinned procedure.
- **State the stop-first precondition.** Any README command that upgrades the global host must say: fully stop
  every dsh process first (native addon file locks → EBUSY), run from an external terminal, never from inside
  a dsh session on that host, then restart and verify `dsh --version`.
- **Tell users which dist-tag line they are on.** A short note ("the 0.1.2-alpha series is published under the
  `alpha` tag; `latest` is 0.1.1-rc.2") prevents the exact silent downgrade seen in attempt 2.

## Skipped / not collected

- No baseline build/test suite run — this is a read-only diagnosis of install evidence, not a source migration
  (Mode A; "pre-existing" not collected).
- No registry or network access was performed; dist-tag state was taken from the fixture's npm-dist-tags.txt.
- The fixture directory was not modified.

## Residual risk

- The six community plugins' compatibility with 0.1.2-alpha.5 was not assessed (no plugin versions/sources
  given in the evidence pack); each plugin's own corridor should be checked before or right after the upgrade.
- If attempt 1's interrupted install left the tree partially replaced, the pinned re-install in §3 repairs it;
  do not hand-copy package directories or hand-write shims.
