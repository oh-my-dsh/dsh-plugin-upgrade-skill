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

# S12 · Global Upgrade EBUSY + Downgrade Trap — Report

## 1. Attempt 1 root cause — why is `koffi.node` locked?

**Who holds the file.** The **dsh web host process** (`node.exe`, PID 42432 in
`running-processes.txt`) holds `koffi.node`. At startup the host loads
`@koromix/koffi` (via the platform package `@koromix/koffi-win32-x64`), a
native FFI addon used for sandbox/filesystem operations. A native `.node`
binary is loaded into the process with `LoadLibrary`-style semantics: on
Windows the OS memory-maps it and holds an open handle on the file with a share
mode that forbids delete/overwrite until the loading process exits. So the lock
is owned by the *host process*, not by anything in the browser.

**Why the install fails.** `npm install -g` replacing the installed package must
overwrite/replace the very `koffi.node` the running host has mapped — the
`copyfile` syscall on `...\@koromix\koffi-win32-x64\win32_x64\koffi.node`
is denied with `EBUSY` because the OS will not let the file be replaced while
it is loaded. This is an OS-level lock, so npm cannot retry its way around it.

**Why a browser refresh does NOT free the lock.** Refreshing the page only
reloads the **SPA (client-side bundle served by the host)**. The dsh web host
Node process — the thing that actually `dlopen`'d koffi — keeps running with the
addon still mapped. The lock lives in the process, so it survives any number of
page reloads and only goes away when the **host process exits**.

**Correct stop-then-upgrade sequence:**

1. Stop the running dsh web host — `Ctrl+C` in its terminal, or
   `taskkill /PID <host-pid> /F` (use the dsh host PID from `tasklist`).
2. Wait for it to fully exit; optionally confirm no `node.exe` still maps it:
   `tasklist /FI "IMAGENAME eq node.exe"`.
3. Then run the pinned install (see §3).
4. Verify with `dsh --version`.

## 2. Attempt 2 root cause — why `dsh --version` showed `0.1.1-rc.2`

The combined command was
`npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`. The first
argument is **unpinned** — no version and no dist-tag. npm resolves an unpinned
package spec against the **`latest`** dist-tag.

From `npm-dist-tags.txt`, the registry state at the time was:

| tag     | version         |
|---------|-----------------|
| latest  | 0.1.1-rc.2      |
| next    | 0.1.1-rc.2      |
| alpha   | 0.1.2-alpha.5   |

So the unpinned `@deepseek-ai/dsh` resolved to **`latest` = 0.1.1-rc.2**, and
the install silently **downgraded** the existing 0.1.2-alpha.4 to 0.1.1-rc.2.
`0.1.2-alpha.5` was published only under the **`alpha`** tag, never promoted to
`latest`, so a default (tag-less) install does not reach it.

The dist-tag it follows is **`latest`** (npm's default when no version/tag is
given). This is why "installing the same package again" did not preserve or
advance the installed version — it re-resolved to `latest`, which happened to be
an older release.

## 3. Exact safe upgrade commands (want alpha.5 + TUI plugin)

```powershell
# 0) Stop the running dsh host first (releases the koffi.node lock).
tasklist /FI "IMAGENAME eq node.exe"      # identify the dsh host PID
taskkill /PID <dsh-host-pid> /F           # or Ctrl+C in its terminal

# 1) Install the pinned alpha.5 together with the TUI plugin.
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui

# 2) Verify you actually got alpha.5.
dsh --version                              # expect: 0.1.2-alpha.5
```

Key point: **pin `@deepseek-ai/dsh` to the exact version** (or, if you
deliberately want to track the alpha channel, use the explicit tag
`@deepseek-ai/dsh@alpha`) — never the bare package name. The TUI plugin can stay
unpinned (it resolves to its own `latest`), but pinning the `dsh` version is
what prevents the downgrade.

## 4. Prevention — what README authors should do differently

- **Never publish an install command with an unpinned pre-release/channel
  package.** `npm install -g @deepseek-ai/dsh` == `npm install -g
  @deepseek-ai/dsh@latest`; when `latest` is an older rc, users silently get a
  downgrade. Pin the exact version (`@0.1.2-alpha.5`) or use an explicit
  dist-tag (`@alpha`).
- **Do not mix a pinned package with an unpinned package whose channel matters.**
  In a combined command, pin every package whose version/channel you are
  claiming; otherwise each unpinned spec re-resolves to `latest` independently.
- **Keep `latest` honest, or document the channel.** If the project's real
  recommended release is on the `alpha` tag, either promote it to `latest` or
  state clearly that users must use `@alpha` / the exact version. Don't let the
  README's "default" install diverge from the tag that actually ships the fix.
- **Include a stop-before-upgrade step.** Because `dsh` loads a native addon
  (`koffi.node`), a running host locks that file on Windows and any in-place
  global reinstall fails with `EBUSY`. READMEs should say: stop dsh (Ctrl+C /
  kill the host), *then* run the install.
- **Add a verification step** (`dsh --version`) to the README so a wrong
  resolution is caught immediately instead of discovered later.
- Prefer documenting the upgrade as an explicit, ordered procedure (stop →
  pinned install → verify) rather than a one-liner that assumes a running
  install can be overwritten in place.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.