# JUDGE BRIEF · noskill.S12-global-upgrade-ebusy-trap

## Criteria (sealed rubric)
- [native-module-owner] (20pt) Identify the running Windows dsh web-host node.exe (PID 42432 in running-processes.txt) as the process that loaded koffi.node. Explain that the loaded native binary remains in use until that host exits, so npm cannot copy/replace it and reports EBUSY. File-in-use/handle wording is equivalent to lock; do not require universal claims about other operating systems or the word exclusive.
- [browser-versus-host-sequence] (20pt) Explain that refreshing the browser reloads the page/SPA without stopping the native-module-owning host. Give the ordered procedure: stop/confirm exit of the relevant dsh host, install, then restart. Separate numbered steps, prose and command blocks together establish the sequence; do not require a single sentence. Do not prescribe killing every unrelated Node process.
- [unpinned-dist-tag-resolution] (20pt) Explain that an unversioned npm global install follows latest, which npm-dist-tags.txt pins to 0.1.1-rc.2; alpha points to 0.1.2-alpha.5. This can replace the initially installed alpha.4 with rc.2 rather than preserving/upgrading it. A statement that an unpinned install does NOT preserve the installed version is correct, not contradictory advice. Distinguish a minor wrong prior-version label from a wrong resolution mechanism.
- [safe-exact-commands] (20pt) Provide npm install -g (or npm i -g) @deepseek-ai/dsh@0.1.2-alpha.5 and @deepseek-harness-tui/dsh-tui, together or separately after stopping the host. Verify dsh --version is alpha.5 and restart the host. An explicit @alpha may be discussed as a mutable alternative but cannot replace the requested exact-version command. Shell examples are proposed instructions, not required executed actions.
- [readme-prevention] (20pt) Tell README authors to pin the exact intended/tested core version whenever a plugin install command also installs dsh, and avoid silently following latest over an existing prerelease. Accept separate pinned core/plugin commands or one pinned combined command. Read the recommendation across headings and list items; quoted unpinned BAD examples are not endorsements.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S12-global-upgrade-ebusy-trap/report.md

# S12 — Global Upgrade EBUSY + Downgrade Trap: Diagnosis & Safe Procedure

Evidence: fixture/attempt1-ebusy.log, fixture/running-processes.txt, fixture/attempt2-downgrade.log, fixture/npm-dist-tags.txt.

## 1. Attempt 1 root cause — why koffi.node is locked

**Who holds the file:** the **dsh web host process** (node.exe, PID 42432 in running-processes.txt).
At startup the host loads @koromix/koffi, a **native FFI addon** whose binary is
@koromix\koffi-win32-x64\win32_x64\koffi.node. A .node file is a Windows DLL: when Node
dlopen()s it, the OS memory-maps it as an executable image and keeps an **exclusive file
lock for the entire lifetime of the process**. Node never unloads native addons, so the lock is
released **only when the host process exits**.

npm's global install stages the new tree and then copies/replaces files over the live global prefix
(copyfile ... koffi.node -> ...\.dsh-TMPDIR\...\koffi.node). Any rename/copy/delete touching
the mapped koffi.node fails with **EBUSY** while PID 42432 lives.

**Why a browser-page refresh does not free the lock:** the lock belongs to the **server-side Node
host process**, not to any browser tab. Refreshing the page only reloads the SPA in the browser;
the host keeps running with koffi still mapped. Only terminating the host (and the agent-session
worker, PID 23768, which belongs to the same running dsh session) releases it.

**Correct stop-then-upgrade sequence:**
1. Stop the dsh host gracefully (Ctrl+C in the terminal running `dsh web`) and end agent sessions;
   fallback: `taskkill /PID 42432 /F` and `taskkill /PID 23768 /F` (the PIDs actually listed).
2. Verify no dsh node processes remain: `tasklist /FI "IMAGENAME eq node.exe"`.
3. Run the pinned install (see section 3).
4. `dsh --version` to verify, then restart `dsh web` (which loads the new koffi).

## 2. Attempt 2 root cause — why dsh --version showed 0.1.1-rc.2

The README's combined command used an **unpinned** spec:
`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`.
A bare package spec has no version range, so npm resolves it through the **latest dist-tag**.

Per fixture/npm-dist-tags.txt, at the time:
- latest: 0.1.1-rc.2
- next:   0.1.1-rc.2
- alpha:  0.1.2-alpha.5

The alpha.5 release was published **only under the alpha dist-tag**; latest was never advanced
(standard practice so stable-channel users don't receive prereleases). npm's global install does
**not** consider what is currently installed — it installs exactly what latest points to. Since
0.1.1-rc.2 < 0.1.2-alpha.4 in semver, the upgrade command **silently downgraded** the CLI from
alpha.4 to rc.2, and dsh --version truthfully printed 0.1.1-rc.2.

**Dist-tag followed: latest** (npm's default for unpinned specs).

## 3. Exact safe upgrade commands (target: 0.1.2-alpha.5 + TUI plugin)

```bat
:: 1) Stop dsh completely: Ctrl+C the terminal running `dsh web`; end agent sessions.
::    Closing/refreshing browser tabs is NOT sufficient — the host process holds koffi.node.
::    Fallback:  taskkill /PID 42432 /F  &  taskkill /PID 23768 /F

:: 2) Confirm nothing dsh-related is still running:
tasklist /FI "IMAGENAME eq node.exe"

:: 3) Install with the CLI PINNED to alpha.5 (exact pin, reproducible):
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
::    (equivalent channel form: npm install -g @deepseek-ai/dsh@alpha @deepseek-harness-tui/dsh-tui
::     — @alpha currently resolves to 0.1.2-alpha.5, but the exact pin is safer.)

:: 4) Verify the result BEFORE restarting:
dsh --version
::    must print: 0.1.2-alpha.5

:: 5) Restart the host so it loads the new build:
dsh web
```

Order matters: **stop -> verify stopped -> pinned install -> verify version -> start.** Never run the
global install while the host is up (EBUSY), and never leave the CLI unpinned (downgrade trap).

## 4. Prevention — what plugin README authors must change

1. **Never put a bare @deepseek-ai/dsh in an install command.** Always pin:
   `npm install -g @deepseek-ai/dsh@<exact-version> <your-plugin>`, or name the intended channel
   explicitly (`@deepseek-ai/dsh@alpha`) and say which version that currently means.
2. **State the trap explicitly:** an unpinned global spec follows the latest dist-tag, which on
   prerelease-driven projects lags the alpha/next channels and can **downgrade** the user's CLI —
   npm gives no warning.
3. **Add a stop-first step:** on Windows the running dsh host locks native modules (koffi.node);
   READMEs should say stop dsh (Ctrl+C the host), then install — not close the browser tab.
4. **Add a verify step:** `dsh --version` (and `npm view @deepseek-ai/dsh dist-tags` before
   upgrading) so users catch a wrong resolution immediately.
5. **Best practice:** plugin READMEs should install **only the plugin**. The CLI upgrade belongs in
   the CLI's own release notes as a separate, pinned step — a plugin's install instructions should
   never reinstall or change the CLI as a side effect.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.