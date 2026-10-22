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
#### FILE: S12-global-upgrade-ebusy-trap/S12-global-upgrade-ebusy-trap-report.md

# S12 — Global Upgrade: EBUSY Lock + Silent-Downgrade Trap

**Situation:** Windows, dsh `0.1.2-alpha.4` running (alpha channel), six community Web plugins
installed. Goal: upgrade to `dsh-v0.1.2-alpha.5` and install the TUI plugin. Two failed attempts,
two completely different root causes — one OS-level, one registry-level.

**Evidence reviewed (read-only fixture):**

| File | What it shows |
|---|---|
| `fixture/attempt1-ebusy.log` | `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` → `EBUSY` on `copyfile` of `koffi.node` |
| `fixture/running-processes.txt` | Process list during attempt 1: dsh web host (PID 42432), agent session worker (23768), the npm process itself (23920) |
| `fixture/attempt2-downgrade.log` | Combined README command installs fine, but `dsh --version` → `0.1.1-rc.2` |
| `fixture/npm-dist-tags.txt` | `latest: 0.1.1-rc.2`, `next: 0.1.1-rc.2`, `alpha: 0.1.2-alpha.5` |

---

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

### What `koffi.node` is and who holds it

`koffi.node` is the native binary of `@koromix/koffi`, the FFI addon dsh uses for its
sandbox/filesystem operations. It lives at
`...\@koromix\koffi-win32-x64\win32_x64\koffi.node` inside dsh's dependency tree. A `.node` file is
a **Windows DLL**: when node loads it, the OS maps an image section of that file into the process.

The process list in `running-processes.txt` identifies the holder directly:

```
node.exe  42432  <- dsh web host (holds koffi.node)
node.exe  23768  <- agent session worker
node.exe  23920  <- npm install -g (attempting the copy)
```

The **dsh web host (PID 42432) loaded koffi at startup** — the FFI/sandbox layer is initialized when
the host boots, before any plugin or page is involved. While a process has that image mapped,
**Windows keeps a lock on the file** (the file cannot be overwritten or deleted; only readers are
allowed) **until the process exits**.

`npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` has to replace that file inside the global install
tree (npm reifies the new package over the old one; the error's `dest` shows npm copying into its
staging path during that reify). The `copyfile` syscall hits the OS lock and fails with `EBUSY`.

Note also PID 23768, the **agent session worker** — it is another dsh node process that can equally
hold koffi locks. Stopping only the web host is not guaranteed to be enough; *every* dsh node process
must be gone.

### Why a browser-page refresh does not free the lock

The browser is only a **client** of the dsh host. Refreshing the page makes the browser re-fetch the
SPA over HTTP **from the same, still-running host process** (PID 42432). Nothing in a page refresh
restarts the host, so koffi stays mapped in PID 42432 and the OS lock persists. The same is true for
closing the tab or the whole browser — the host is a server started from the terminal (or a
service/background job); it keeps running until the *process* is terminated. The lock is a property
of the host process, not of the browser session, so no browser-side action can release it.

### Correct stop-then-upgrade sequence

1. **Fully stop dsh** — terminate the host process itself (Ctrl+C in the terminal that runs it, or
   stop the service/background job that launched it), and stop the agent session workers too.
   Closing or refreshing the browser page is *not* a stop.
2. **Verify the lock is gone:** `tasklist | findstr node` (or Task Manager / Resource Monitor) must
   show no dsh host or session-worker processes left. Only the forthcoming npm node process may
   appear.
   *If a process refuses to exit and still holds the file, find the holder explicitly with Resource
   Monitor → CPU tab → "Associated handles" searching `koffi.node`, or Sysinternals `handle.exe
   koffi.node`, and terminate that specific PID.*
3. **Upgrade with the version pinned:**
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`
4. **Verify before restarting:** `dsh --version` must print `0.1.2-alpha.5`
   (also `npm ls -g --depth=0 @deepseek-ai/dsh`).
5. **Restart dsh** normally.

Attempt 1's pin was already correct (`@0.1.2-alpha.5`); its only problem was the running host. That
is why the same command succeeds after a real stop.

---

## 2. Attempt 2 root cause — silent downgrade to `0.1.1-rc.2`

### What the unpinned spec resolves to, and why

The README's combined command was:

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

`@deepseek-ai/dsh` carries **no version specifier**. For a plain `npm install <pkg>`, npm resolves a
missing specifier to the package's **`latest` dist-tag** — always `latest`, never `next`, never
`alpha`, unless you ask for those tags explicitly (`@deepseek-ai/dsh@next`, `@alpha`).

The registry state at the time (`npm-dist-tags.txt`):

```json
{ "next": "0.1.1-rc.2", "latest": "0.1.1-rc.2", "alpha": "0.1.2-alpha.5" }
```

So the unpinned `@deepseek-ai/dsh` resolved to **`0.1.1-rc.2`** because that is where **`latest`**
points. `0.1.1-rc.2` is the *stable* line; the user is on the *alpha* line (`0.1.2-alpha.4` →
`0.1.2-alpha.5` lives only under the `alpha` tag). The install therefore moved the global install
**backwards**, from `0.1.2-alpha.4` to `0.1.1-rc.2` — a silent downgrade. npm does not refuse a
plain install that lands on a lower version than what is installed; it just installs what the tag
resolves to, which is why the command "went through fine" and only `dsh --version` afterwards
revealed the damage.

Two extra traps in the same registry snapshot:

- **`next` is also `0.1.1-rc.2`** — so the common folk rule "use `@next` for prereleases" would
  *also* fail to reach alpha.5 here. Only the `alpha` tag (or an exact pin) points at
  `0.1.2-alpha.5`.
- **Dist-tags move.** `alpha` will point at `0.1.2-alpha.6` when that ships. Only an exact version
  pin is reproducible.

---

## 3. Exact safe upgrade commands (alpha.5 + TUI plugin)

Run in a terminal after **fully stopping dsh** (see §1). If your global npm prefix is under
`C:\Program Files`, use an elevated terminal (that is a permission concern, separate from the EBUSY).

```powershell
# 0. Confirm no dsh processes remain (host + session workers):
tasklist | findstr node

# 1. Upgrade dsh — explicitly pinned to the alpha-channel release:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
#    (Equivalent today: npm install -g @deepseek-ai/dsh@alpha
#     — but the exact pin is reproducible and immune to dist-tag drift.)

# 2. Install the TUI plugin (check its tags first if you want a pin:
#    npm view @deepseek-harness-tui/dsh-tui dist-tags):
npm install -g @deepseek-harness-tui/dsh-tui

# 3. Verify BEFORE restarting:
dsh --version                # must print 0.1.2-alpha.5
npm ls -g --depth=0          # @deepseek-ai/dsh@0.1.2-alpha.5 and @deepseek-harness-tui/dsh-tui

# 4. Restart dsh.
```

Equivalent single command — still safe, because the core is pinned (this is the only difference
from the README's combined command):

```powershell
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui
```

**Never re-run the unpinned combined command** (`npm install -g @deepseek-ai/dsh ...`): it
re-resolves `@deepseek-ai/dsh` to `latest` (= `0.1.1-rc.2` today) and downgrades you again. The
same applies to `npm update -g @deepseek-ai/dsh` — it will not move you to alpha.5; the alpha
channel is reachable only via an explicit `@0.1.2-alpha.5` pin or the `alpha` tag.

---

## 4. Prevention — what plugin README authors must do differently

1. **Never ship an unpinned core package.** Any install command that includes `@deepseek-ai/dsh`
   must pin an exact version (`@0.1.2-alpha.5`) or a channel tag the author has explicitly verified
   (`@alpha`). Unpinned means `latest`, which is the *stable* line — for an alpha-channel user that
   is a silent downgrade, and when a tag moves it can equally be a silent, unrequested upgrade for
   stable users.
2. **Do not merge "upgrade dsh" and "install my plugin" into one command.** The combined command
   forces a core reinstall on every plugin install; unpinned, it installs the wrong core version.
   Instead document a requirement ("requires dsh ≥ X / dsh on the alpha line") and give a
   plugin-only command: `npm install -g <plugin-package>`. Let users manage their own dsh version.
3. **State the channel and supported versions.** If the plugin targets a prerelease line, say so and
   pin to that line; if it supports stable, say which dsh versions are supported. Do not assume
   `next` is "the prerelease tag" — in this registry `next` and `latest` both point at `0.1.1-rc.2`.
4. **Warn about the running-host lock in every upgrade section.** A global dsh upgrade requires
   *fully stopping the dsh host and session workers* first; closing or refreshing the browser page
   does **not** release the `koffi.node` lock (the host process keeps the native module mapped).
   Document the order: stop dsh → verify no dsh node processes (`tasklist | findstr node`) →
   install → `dsh --version` → restart.
5. **Tell users how to verify.** After any install: `dsh --version` and
   `npm ls -g --depth=0`. Point them at `npm view @deepseek-ai/dsh dist-tags` to see where
   `latest`/`next`/`alpha` currently point, and prefer exact pins in docs because dist-tags drift
   (`alpha` → alpha.6 next release).

---

## Summary

- **Attempt 1 (EBUSY):** the running dsh web host (PID 42432, and possibly the session worker,
  PID 23768) has `koffi.node` — a native DLL — mapped; Windows locks the file until the process
  exits. A browser refresh only reloads the SPA from the still-running host and frees nothing.
  Fix: fully stop all dsh processes, verify with `tasklist`, then install, verify, restart.
- **Attempt 2 (downgrade):** the unpinned `@deepseek-ai/dsh` in the README's combined command
  resolves to the **`latest` dist-tag**, which is `0.1.1-rc.2` — the stable line, below the user's
  `0.1.2-alpha.4`. The alpha channel lives only under the `alpha` tag
  (`0.1.2-alpha.5`); `next` is *also* `0.1.1-rc.2` and would not help. Fix: pin the core exactly.
- **Safe path:** stop dsh → `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` (+
  `@deepseek-harness-tui/dsh-tui`) → verify `dsh --version` → restart; and README authors should
  pin the core (or drop it from the plugin command entirely) and document the stop-first rule.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.