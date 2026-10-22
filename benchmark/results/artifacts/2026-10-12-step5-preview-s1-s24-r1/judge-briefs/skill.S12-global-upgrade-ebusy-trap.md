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
#### FILE: S12-global-upgrade-ebusy-trap/report.md

# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis & Remediation Report

Scope: read-only diagnosis from the evidence pack in `fixture/` (unchanged). No installs or migrations executed.
References: `plugin-upgrade` skill (SKILL.md "Global DSH host upgrades", troubleshooting.md, rollup R-08/R-01, v0.1.2-alpha.5 card).

---

## 1. Attempt 1 root cause — `EBUSY` on `koffi.node`

### What the evidence shows

- `attempt1-ebusy.log`: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` failed at
  `syscall copyfile`, source `@koromix\koffi-win32-x64\win32_x64\koffi.node`,
  destination `@deepseek-ai\.dsh-TMPDIR\...\koffi.node`. The `.dsh-TMPDIR` destination is npm's
  staging directory: npm downloads and unpacks there, then copies/renames the tree into the
  global package location. The failure is on the *last* file-move step, i.e. the OS refused to
  replace a file already on disk.
- `running-processes.txt`: three `node.exe` processes — PID 42432 (the **dsh web host**), PID 23768
  (agent session worker), PID 23920 (the npm install itself). The annotation confirms the web host
  loaded `@koromix/koffi` — a native FFI addon used for sandbox/filesystem operations — at startup.

### Who holds the lock, and why

The **running dsh web host process (PID 42432)** holds the lock on `koffi.node`:

1. `koffi.node` is a native binary (a `.node` file is a Windows DLL). When the host loads it at
   startup, Windows maps it into the process as an **executable image section**.
2. While an image section is open, Windows refuses to overwrite, rename-over, or delete the file —
   the kernel returns `ERROR_BUSY`, which Node's `fs` surfaces as `EBUSY`. This is why npm's
   `copyfile` into place failed specifically on the native module and not on the JS files.
3. The lock is a property of the **process**, and is released only when that process exits.

### Why a browser-page refresh does NOT free it

The browser page is only the SPA client talking to the host. A refresh reloads client-side assets
and re-opens the WebSocket; the **host node process (PID 42432) survives the refresh** — it is the
process that mapped `koffi.node`, and it keeps serving pages. The file lock lives in the host
process, not in the browser tab, so refreshing (or even closing) the tab changes nothing about the
handle. (Same finding as the skill's troubleshooting row: "文件锁在宿主不在浏览器" — the lock is in
the host, not the browser.)

### Correct stop-then-upgrade sequence

1. **Fully stop every dsh process** — the `dsh web` host *and* agent session workers (PID 42432 and
   23768 both qualify; stop the web terminal with Ctrl+C / stop the service, then end leftovers).
   Verify before proceeding: `tasklist /FI "IMAGENAME eq node.exe"` must show no dsh host/worker.
2. **From an EXTERNAL terminal** (never from inside a dsh session — the session *is* the host, and
   replacing the package tree mid-install kills the host and leaves content without shims), run the
   **pinned** install: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
3. Restart `dsh web`, hard-refresh the browser, verify version markers and plugins.

If an install was already interrupted, repair it from an external shell by re-running the pinned
install — never hand-copy package directories or hand-write shims (SKILL.md).

---

## 2. Attempt 2 root cause — `dsh --version` printed `0.1.1-rc.2`

### What the evidence shows

- `attempt2-downgrade.log`: the command used was the combined, **unpinned** form from the plugin
  README: `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`. Both specs are bare
  package names with no version or tag.
- `npm-dist-tags.txt` at that moment:

  | dist-tag | resolves to |
  |---|---|
  | `latest` | `0.1.1-rc.2` |
  | `next`   | `0.1.1-rc.2` |
  | `alpha`  | `0.1.2-alpha.5` |

### What the unpinned name resolves to, and why

A bare `npm install -g @deepseek-ai/dsh` resolves through the **`latest` dist-tag** — npm's default
tag. It does **not** mean "the newest published version", does **not** keep the currently installed
version, and does **not** refuse to move backwards. Here `latest` = `0.1.1-rc.2`, so npm installed
`0.1.1-rc.2`.

That is a **silent downgrade**:

- Installed before: `0.1.2-alpha.4`.
- Semver ordering: `0.1.2-alpha.4` > `0.1.1-rc.2` (the release number `0.1.2` > `0.1.1` already
  decides it; the prerelease suffixes are irrelevant across different release numbers).
- The 0.1.2 line publishes its prereleases to the **`alpha`** tag only — `alpha.5` exists on the
  registry but `latest`/`next` were still pinned to the 0.1.1 line's `0.1.1-rc.2`. This is exactly
  the package's published channel layout (independently measured in the v0.1.2-alpha.5 card's
  "npm channels" section, 2026-09-03: `alpha` = `0.1.2-alpha.5`, `latest` = `next` = `0.1.1-rc.2`
  for the umbrella package).
- `dsh --version` → `0.1.1-rc.2` proves the umbrella package itself was replaced downward. The
  "installs fine" step in the log hid it: a silent version regression is not an install error.

**Which dist-tag does the unpinned name follow? `latest`** — not `next`, not `alpha`. The user
wanted `alpha.5`, which lives on `alpha`; the command never asked for it.

### Additional trap dimensions

- **Tags are mutable.** Even `@alpha` is not a stable pin: the rollup records `latest` moving to
  `0.1.2-rc.1` on 2026-09-04 and `alpha` moving to `0.1.3-alpha.2` on 2026-09-07. Any README that
  says "install the `alpha` tag" drifts over time. Only an **exact version pin** is reproducible.
- **The TUI plugin is unpinned too.** `@deepseek-harness-tui/dsh-tui` resolved to whatever its own
  `latest` points at — no guaranteed relation to host `0.1.2-alpha.5`. Per rollup R-01's npm
  reality, sub/community packages often keep `latest` on an old stable line and must be installed
  with an explicit version or a verified tag.

---

## 3. Exact safe upgrade commands for this situation (want alpha.5 + TUI plugin)

Run everything from an **external terminal, not inside a dsh session**:

```powershell
# Step 1 — fully stop every dsh process (web host AND agent session workers).
#   Stop `dsh web` with Ctrl+C in its own window / stop the service; end leftover workers.
tasklist /FI "IMAGENAME eq node.exe"        # VERIFY: no dsh host / session worker remains
# taskkill /PID <pid> /F                   # only if a dsh process survived
# (Optional: Resource Monitor → CPU → Associated Handles → search "koffi.node" to see the holder.)

# Step 2 — read-only tag check BEFORE pinning:
npm view @deepseek-ai/dsh dist-tags                      # expect alpha -> 0.1.2-alpha.5
npm view @deepseek-harness-tui/dsh-tui dist-tags         # pick the TUI version matching the 0.1.2-alpha line
npm view @deepseek-harness-tui/dsh-tui versions --json   # if no `alpha` tag exists: use an exact version

# Step 3 — ONE pinned install (explicit official registry guards against mirror lag):
npm install -g --registry https://registry.npmjs.org `
  @deepseek-ai/dsh@0.1.2-alpha.5 `
  @deepseek-harness-tui/dsh-tui@<exact-version-verified-above>

# Step 4 — verify BEFORE starting anything:
dsh --version                 # MUST print: 0.1.2-alpha.5   (anything else = wrong line, redo Step 3)
npm ls -g --depth=0           # both packages at the intended versions

# Step 5 — restart and verify:
dsh web                       # external terminal
# Browser: hard refresh (Ctrl+F5); confirm version markers and that the 6 Web plugins
# + TUI plugin are present/active.
```

Rules that make this safe:

- **Both packages pinned with exact versions** — no bare names, no reliance on `latest`/`next`/`alpha`.
- **Host fully stopped before npm runs** — nothing crashes mid-install (a mid-install crash is a
  signature of doing it wrong, per SKILL.md).
- **Host first, verify `dsh --version`, then restart the plugins/profile** — if the version check prints anything
  other than `0.1.2-alpha.5`, re-run the pinned install; never "fix" it by retrying a bare name.
- The six GitHub-mirror Web plugins are profile-level installs — the global host upgrade does not
  touch them, but after the restart confirm each is still mounted in the profile (a stale client
  bundle combo self-heals with a full host restart). If those plugin repos are updated later, fetch
  explicit tags rather than `git pull`, and mind mirror lag (rollup R-08).

---

## 4. Prevention — what plugin README authors must change

1. **Never publish a bare host install command.** `npm install -g @deepseek-ai/dsh` follows the
   `latest` dist-tag, which for this package points at the *previous* line (`0.1.1-rc.2`) while each
   0.1.x prerelease ships on `alpha` only — precisely the silent downgrade in attempt 2. Always
   write the exact pin: `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
2. **Don't rely on dist-tags at all in docs** — not even `@alpha`. `latest`/`next`/`alpha` are
   mutable publisher pointers that have demonstrably moved across lines within days (rollup
   measurements 2026-09-04 / 2026-09-07). Exact versions are the only reproducible contract; a tag
   reference goes stale the moment the maintainer republishes.
3. **Split or fully pin combined commands.** Either document two steps (host pinned first, then the
   plugin with its exact version), or pin *every* spec in the one-liner. A combined command with a
   bare host name guarantees at least one of the two packages resolves against a moving/older tag
   (the TUI plugin's own `latest` need not match host alpha.5).
4. **Include the stop-the-host step in the README itself.** On Windows a running dsh web host holds
   image-section locks on native modules (`koffi.node`) and the install dies with `EBUSY`; state
   explicitly: stop every dsh process — the web host process, not just the browser tab (a refresh
   reloads the SPA but the host process, and its file lock, survives).
5. **Tell users to install from an external terminal, not from inside a dsh session** — the session
   is the host process; an in-session global upgrade kills the host mid-install and leaves a broken
   package tree (SKILL.md global-host-upgrade discipline).
6. **Ship a verification step with the expected output.** "After installing, run `dsh --version`;
   you must see `0.1.2-alpha.5`. If you see an older version (e.g. `0.1.1-rc.2`), you were resolved
   through a dist-tag — re-run the pinned command." This converts the silent downgrade into an
   observable check.
7. **Document rollback by pin and the official registry.** Recovery is `npm install -g
   @deepseek-ai/dsh@<verified-version>` from an external shell; where mirror lag is a concern, add
   `--registry https://registry.npmjs.org` (rollup R-08).
8. **State the compatible host range** for the plugin so users can check *before* upgrading, and
   verify after restart that the plugin is actually active in the profile (successful install ≠
   enabled plugin).

---

## Pending / residual risk

- The TUI plugin's exact compatible version could not be determined from the read-only fixture —
  the report defers to `npm view @deepseek-harness-tui/dsh-tui dist-tags` at execution time.
- Registry state (evidence: 2026-09-03/04 window per the alpha.5 card's channel measurement) may
  have moved by the time the upgrade runs; re-check `npm view @deepseek-ai/dsh dist-tags` first.
  This reinforces (not weakens) the pin-exact-versions recommendation.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.