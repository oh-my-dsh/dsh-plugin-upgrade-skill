# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnostic Report

Mode: A · inspect (read-only diagnosis; no files modified, no installs executed). Methodology: plugin-upgrade skill, "Global DSH host upgrades (agent discipline)" section plus references/troubleshooting.md (the S12 EBUSY row) and references/rollup-0.1.2.md (R-08 install-channel pitfalls).

## Pre-existing baseline

Not collected — read-only task; nothing was built or run.

## Completed

### 1. Attempt 1 root cause — EBUSY on koffi.node

**Who holds the lock:** the `dsh web` host process itself. attempt1-ebusy.log shows npm's `copyfile` failing on the source `@koromix/koffi-win32-x64/win32_x64/koffi.node`; running-processes.txt identifies node.exe PID 42432 as the dsh web host that loaded koffi (a native FFI addon used by sandbox/filesystem operations) at startup, with PID 23768 an agent session worker in the same process tree.

**Why it is locked:** `koffi.node` is a native `.node` binary. On Windows, once `LoadLibrary` maps a native module into a process, the OS holds a file lock on it until that process exits — the file cannot be overwritten or deleted. npm's global install must replace this exact file, so `copyfile` fails with EBUSY while any process that has loaded it is alive. The agent session worker runs in the host's process tree, so stopping the visible web window alone is not enough either; the whole dsh process tree must be gone.

**Why a browser refresh does not free the lock:** refreshing the page only reloads the SPA inside the browser. The host process — the thing that actually loaded koffi — stays alive. The lock is held by the host process, not the browser; no amount of refreshing releases it.

**Correct stop-then-upgrade sequence:**

1. Fully stop every dsh process (host and all session/agent worker processes). A browser refresh is not a host stop. Verify with `tasklist /FI "IMAGENAME eq node.exe"` that no dsh-owned node.exe remains.
2. From an EXTERNAL terminal — never from inside a dsh session, because the session IS the host process and the install would delete/replace the package tree being executed, killing the host mid-install — run the pinned install (section 3).
3. Restart `dsh web`, hard-refresh the browser, and verify version markers and that the plugins load.

A crash or EBUSY during the upgrade is a signature of doing it wrong (host not fully stopped), not a risk to tolerate. If an install was ever interrupted mid-flight, repair by re-running the pinned formal install from an external shell — never hand-copy package directories or hand-write shims.

### 2. Attempt 2 root cause — unpinned install downgraded to rc.2

The combined command from the plugin README was:

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

The bare package name `@deepseek-ai/dsh` (no `@version`, no `@tag`) resolves to the **`latest` dist-tag**. Per npm-dist-tags.txt at that moment:

- `latest` = `0.1.1-rc.2`
- `next` = `0.1.1-rc.2`
- `alpha` = `0.1.2-alpha.5`

So the command installed `0.1.1-rc.2` — a full version-line DOWNGRADE from the running `0.1.2-alpha.4`, which is why `dsh --version` printed `0.1.1-rc.2`. An unpinned global install neither preserves the currently installed version nor advances to the newest published one; it follows `latest` unconditionally. During the 0.1.2 alpha series the stable `latest` tag intentionally stayed on the older 0.1.1 line, and alpha.5 was only reachable via the `alpha` tag. The corridor references (v0.1.2-alpha.5 card, rollup-0.1.2 R-08) confirm this exact registry state: `latest` = `0.1.1-rc.2`, `alpha` = `0.1.2-alpha.5`, with sub-packages pinned to even older `latest` tags. A bare package name "can silently downgrade to an older line" — the trap the README's combined command baked in.

### 3. Exact safe upgrade commands

State: running dsh `0.1.2-alpha.4`, Windows, npm-global install; target `0.1.2-alpha.5` plus the TUI plugin (`@deepseek-harness-tui/dsh-tui`).

Step 0 — fully stop every dsh process (host + session workers); verify with `tasklist /FI "IMAGENAME eq node.exe"` that no dsh-owned node.exe remains. A browser refresh is NOT a host stop.

Step 1 — from an EXTERNAL terminal, run the pinned install:

```
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
```

Both packages may go in one command safely because the host is now explicitly pinned — the unpinned-name downgrade cannot recur. If you prefer maximal determinism, run two commands: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`, then `npm install -g @deepseek-harness-tui/dsh-tui`, checking the resolved version of the community package (its `latest` is whatever its maintainer tagged; if you know the desired version, pin it too).

Step 2 — restart `dsh web`, hard-refresh the browser.

Step 3 — verify:

- `dsh --version` prints `0.1.2-alpha.5` (not rc.2).
- `npm view @deepseek-ai/dsh dist-tags` confirms the `alpha` tag resolves to `0.1.2-alpha.5` (install channel matches intent).
- The six community plugins load. If the first boot after an in-place upgrade drops newly-added bundle modules from the served client combo (the DSH-0.1.5-A1-20 pattern), a single host restart self-heals the roster/combo mismatch before blaming any plugin.
- Per the alpha.5 corridor card, alpha.4 → alpha.5 is a restart-only edge with zero plugin code changes for plugins on defineTool / Remote / presets / client UI, so any plugin failure after this upgrade points at install resolution, not migration.

Rollback baseline: the original install was `0.1.2-alpha.4` (attempt 1) and attempt 2 left `0.1.1-rc.2`; recovery for the host package only is `npm install -g @deepseek-ai/dsh@<known-good-version>` from an external shell with the host stopped — never hand-copy package directories or hand-write shims.

### 4. Prevention — guidance for plugin README authors

1. **Never publish a bare `@deepseek-ai/dsh` (unpinned) install command.** A bare name follows the `latest` dist-tag, which during the 0.1.2 alpha series resolved to `0.1.1-rc.2` — silently downgrading alpha-line users. Pin the exact version (`npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`); if a tag is intended, name it explicitly (`@deepseek-ai/dsh@alpha`) and say which line the tag tracks.
2. **State the stop-host precondition.** The README must say: fully stop all dsh processes (host and session workers; a browser refresh is not a stop) before installing, and run the install from an external terminal, never from inside a dsh session. This prevents both the EBUSY failure and the fatal in-session install that would delete the running host's own package tree.
3. **Do not combine an unpinned host upgrade with a plugin install.** Combined one-liners are safe only when every package carries an explicit `@version`.
4. **Include a post-install verification line** (`dsh --version` should print the intended version) so the downgrade trap is caught immediately.
5. **Mind registry-channel reality.** Sub-packages of `@deepseek-ai/*` have had `latest` lagging far behind the alpha line (rollup-0.1.2 R-08); test README install commands against live `npm view ... dist-tags` output at publish time, and document third-party mirror lag for users.

## Skipped

- No migrations or installs were executed (read-only task; the authorization explicitly forbids them).
- No live registry queries: npm-dist-tags.txt is supplied as the registry state at the time and matches the corridor references' recorded measurements, so re-querying was unnecessary and would not reproduce the historical state.

## Pending / residual risk

- The exact version of `@deepseek-harness-tui/dsh-tui` to pin is not in the evidence pack; resolve it with `npm view @deepseek-harness-tui/dsh-tui version` before pinning, or verify the resolved version after an unpinned install.
- Whether a third-party npm mirror is configured on the user's machine is unknown; if `0.1.2-alpha.5` 404s on install, apply rollup-0.1.2 R-08's mirror-lag recipe (use the official registry or wait for the mirror to sync).
- Attempt 2 left the machine on `0.1.1-rc.2`; the recommended procedure supersedes that state, but any session data written by rc.2 in the meantime is governed by the alpha.5 host's cross-version read tolerance (A5-03), not by this report.

## Rollback

Baseline recorded from the evidence: host was `0.1.2-alpha.4` (attempt 1), accidentally downgraded to `0.1.1-rc.2` (attempt 2). Recoverable path: external shell, host fully stopped, `npm install -g @deepseek-ai/dsh@<chosen-version>`. No configuration, lockfile, or plugin files are modified by this task.

## Recommendations

- Adopt a helper script or alias (e.g. `dsh-upgrade <version>`) that enforces the ordered sequence: verify no dsh node.exe processes → pinned external install → restart → `dsh --version` check. This turns both traps into non-events.
- Report the plugin README's unpinned combined command upstream to the mirror maintainer, citing the dist-tag mechanism above.
