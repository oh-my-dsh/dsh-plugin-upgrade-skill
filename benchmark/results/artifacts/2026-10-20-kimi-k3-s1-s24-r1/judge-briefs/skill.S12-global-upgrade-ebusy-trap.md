# JUDGE BRIEF · skill.S12-global-upgrade-ebusy-trap

## Criteria (sealed rubric)
- [native-module-owner] (20pt) Identify the running Windows dsh web-host node.exe (PID 42432 in running-processes.txt) as the process that loaded koffi.node. Explain that the loaded native binary remains in use until that host exits, so npm cannot copy/replace it and reports EBUSY. File-in-use/handle wording is equivalent to lock; do not require universal claims about other operating systems or the word exclusive.
- [browser-versus-host-sequence] (20pt) Explain that refreshing the browser reloads the page/SPA without stopping the native-module-owning host. Give the ordered procedure: stop/confirm exit of the relevant dsh host, install, then restart. Separate numbered steps, prose and command blocks together establish the sequence; do not require a single sentence. Do not prescribe killing every unrelated Node process.
- [unpinned-dist-tag-resolution] (20pt) Explain that an unversioned npm global install follows latest, which npm-dist-tags.txt pins to 0.1.1-rc.2; alpha points to 0.1.2-alpha.5. This can replace the initially installed alpha.4 with rc.2 rather than preserving/upgrading it. A statement that an unpinned install does NOT preserve the installed version is correct, not contradictory advice. Distinguish a minor wrong prior-version label from a wrong resolution mechanism.
- [safe-exact-commands] (20pt) Provide npm install -g (or npm i -g) @deepseek-ai/dsh@0.1.2-alpha.5 and @deepseek-harness-tui/dsh-tui, together or separately after stopping the host. Verify dsh --version is alpha.5 and restart the host. An explicit @alpha may be discussed as a mutable alternative but cannot replace the requested exact-version command. Shell examples are proposed instructions, not required executed actions.
- [readme-prevention] (20pt) Tell README authors to pin the exact intended/tested core version whenever a plugin install command also installs dsh, and avoid silently following latest over an existing prerelease. Accept separate pinned core/plugin commands or one pinned combined command. Read the recommendation across headings and list items; quoted unpinned BAD examples are not endorsements.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S12-global-upgrade-ebusy-trap-report.md

# S12 Global Upgrade EBUSY + Downgrade Trap — Report

## 1) Attempt 1 root cause: EBUSY on koffi.node

**Diagnosis.** Attempt 1 failed because the running DSH Web host process still had the native module `koffi.node` loaded. The fixture’s `running-processes.txt` identifies:

- `node.exe` PID 42432 — `dsh web` host, holding `koffi.node`
- `node.exe` PID 23768 — agent session worker
- `node.exe` PID 23920 — the npm global install trying to copy the file

`attempt1-ebusy.log` shows npm failing at `copyfile` for:

`C:...@koromixkoffi-win32-x64win32_x64koffi.node`

**Why the file is locked.** `koffi.node` is a native Node addon. Once it is loaded into a Windows process, the OS keeps the backing file locked until that process exits. npm therefore cannot overwrite/copy it while the host is alive.

**Why a browser-page refresh does not help.** Refreshing the browser only reloads the Web SPA/client. It does not terminate the `dsh web` host process that already mapped/loaded `koffi.node`, so the OS-level lock remains.

**Correct stop-then-upgrade sequence.**

1. From outside the DSH session, stop every DSH process gracefully: stop `dsh web`, exit sessions/workers, and confirm no DSH node processes remain.
2. Run the pinned install from an external terminal:
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`
3. Restart `dsh web`, hard-refresh the browser, then verify `dsh --version` and plugin state.
4. If an install was already interrupted, repair by rerunning the same pinned formal install externally; do not hand-copy package trees or hand-write shims.

## 2) Attempt 2 root cause: rc.2 instead of alpha.5

**Diagnosis.** The combined command left the host package unpinned:

`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`

For a bare package name, npm resolves the package’s **`latest` dist-tag**, not the currently installed version and not the highest prerelease. The fixture’s `npm-dist-tags.txt` shows the registry state at that time:

- `latest: 0.1.1-rc.2`
- `next: 0.1.1-rc.2`
- `alpha: 0.1.2-alpha.5`

So `@deepseek-ai/dsh` resolved to `0.1.1-rc.2`, silently downgrading the host even though `0.1.2-alpha.5` existed under the `alpha` tag.

**Rule:** an unpinned global install follows the dist-tag, usually `latest`; it does not preserve your current prerelease line or advance automatically to a newer alpha.

## 3) Safe upgrade commands for this situation

Run these from an external terminal after DSH is fully stopped.

Preferred, one combined command with the host pinned exactly:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-compatible-tui-version>
```

If the TUI plugin version is intentionally “latest”, make that explicit rather than accidental:

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@latest
```

Then verify:

```powershell
dsh --version
# expect: 0.1.2-alpha.5
dsh web
```

Before choosing `<exact-compatible-tui-version>`, check that plugin’s own README/release notes and dist-tags, but do not leave the DSH host package unpinned.

## 4) Prevention for plugin README authors

README authors should prevent this trap by changing their install/upgrade examples:

- Never show `npm install -g @deepseek-ai/dsh` unpinned in host-upgrade instructions.
- Always show an exact pinned host version, e.g. `@deepseek-ai/dsh@0.1.2-alpha.5`, or explicitly explain that `@alpha` follows a moving tag.
- State that a bare package name resolves to the npm `latest` dist-tag, which may be an older stable/rc line than the user’s current alpha.
- Tell users to stop all DSH processes before a global upgrade, especially on Windows where native modules such as `koffi.node` are file-locked while loaded.
- Prefer separate, clearly ordered commands for “stop host”, “upgrade pinned host”, “install plugin”, “restart/verify”, rather than one combined command that hides the host resolution.
- Include post-install verification: `dsh --version`, expected plugin version, and a browser hard refresh after `dsh web` restarts.

## Evidence used

- `fixture/attempt1-ebusy.log`: EBUSY during `copyfile` of `koffi.node`.
- `fixture/running-processes.txt`: running `dsh web` host held `koffi.node`; browser refresh does not stop it.
- `fixture/attempt2-downgrade.log`: unpinned combined install succeeded but `dsh --version` printed `0.1.1-rc.2`.
- `fixture/npm-dist-tags.txt`: `latest`/`next` pointed to `0.1.1-rc.2`; `alpha` pointed to `0.1.2-alpha.5`.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.