# S12 Global Upgrade EBUSY + Downgrade Trap — Diagnosis and Safe Upgrade Procedure

## 1. Attempt 1 root cause: EBUSY on koffi.node

`koffi.node` (from `@koromix/koffi`, native FFI addon used by the dsh web host for
sandbox/filesystem operations) is locked because the **running dsh web host
process (node.exe, PID 42432) loaded that native `.node` binary at startup**.
On Windows, once a native binary is loaded into a process, the OS holds an
exclusive file lock on it until that process exits. npm's `copyfile` into the
new TMPDIR install tree fails with EBUSY because the old bytes on disk are
still mapped/locked.

A browser-page refresh does **not** release the lock: refreshing only reloads
the SPA in the browser. The dsh web host process that loaded koffi stays
alive, so its handle on `koffi.node` remains. Only terminating the host
process (and any other dsh/agent node processes using it) frees the lock.

Correct stop-then-upgrade sequence:

1. Stop the dsh web host and related node processes (e.g. close their console
   windows, `taskkill /PID 42432 /F`, also stop the agent session worker if it
   uses the same install). Verify with
   `tasklist /FI "IMAGENAME eq node.exe"` that no dsh-related node process remains.
2. Run `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
3. Restart dsh and verify with `dsh --version`.

## 2. Attempt 2 root cause: unpinned `@deepseek-ai/dsh` resolved to rc.2

The combined command was unpinned:

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

With no version specifier, npm does **not** keep or advance the currently
installed version — it resolves the package to the version behind the
**`latest` dist-tag**. Per `npm-dist-tags.txt`, at the time of the attempt:

```
next:  '0.1.1-rc.2'
latest: '0.1.1-rc.2'
alpha: '0.1.2-alpha.5'
```

`latest` (and `next`) pointed at `0.1.1-rc.2`, while the wanted alpha.5 sat
behind the `alpha` tag. So the "upgrade" actually replaced 0.1.2-alpha.4 with
0.1.1-rc.2 — a downgrade. Size-wise it "succeeded," but `dsh --version`
reported `0.1.1-rc.2`. The rule: installing globally does not preserve the
installed release line; every unpinned reinstall follows the `latest` tag.

## 3. Exact safe upgrade commands

Stop dsh (all node processes using it), then install with everything pinned
and the alpha tag used explicitly:

```
# 1. Full cutover: stop the web host / agent workers, confirm none remain
tasklist /FI "IMAGENAME eq node.exe"

# 2. Install dsh alpha.5 by explicit version AND the TUI plugin
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

# equivalently, to follow the alpha dist-tag:
# npm install -g @deepseek-ai/dsh@alpha @deepseek-harness-tui/dsh-tui

# 3. Verify
dsh --version          # expect 0.1.2-alpha.5
```

If you want to float on the alpha line in future upgrades, use
`@deepseek-ai/dsh@alpha` — never bare `@deepseek-ai/dsh` (follows `latest`,
which may be behind or on a different line). Plugins should likewise be
pinned to the version you intend.

## 4. Prevention for plugin README authors

The official combined command trapped the user. README install commands
should:

- **Never install the dsh core unpinned.** Write
  `npm install -g @deepseek-ai/dsh@<the exact version line the plugin supports>`
  (e.g. `@deepseek-ai/dsh@alpha` or `@deepseek-ai/dsh@0.1.2-alpha.5`), so the
  core cannot silently jump to whatever `latest` points at.
- Keep the plugin pinned to a matching version/tag
  (`@deepseek-harness-tui/dsh-tui@<version-or-compatible-tag>`).
- State the prerequisite explicitly: **stop all running dsh/node host
  processes before upgrading** (`tasklist /FI "IMAGENAME eq node.exe"` /
  close the web host), because on Windows a running dsh locks native files
  like `koffi.node` and the install fails with EBUSY. Note that refreshing a
  browser page does NOT release the lock — the host process must be stopped.
- Tell users to verify afterwards with `dsh --version`, since dist-tags
  (`latest`, `next`, `alpha`) move independently and `latest` may lag the
  release they want.
- Optionally document the failure modes (EBUSY → stop dsh first; unexpected
  lower version → the `latest` dist-tag was followed, rerun with an explicit
  `@alpha` / version pin).

## Limitations

Analysis is based solely on the evidence pack in the fixture directory
(`attempt1-ebusy.log`, `attempt2-downgrade.log`, `npm-dist-tags.txt`,
`running-processes.txt`, `README.md`). No external documentation was
consulted, per the task constraints.
