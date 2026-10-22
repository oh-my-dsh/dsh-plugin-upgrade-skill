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

# S12 · Global Upgrade EBUSY + Downgrade Trap — Diagnosis Report

Mode: read-only inspection/diagnosis (plugin-upgrade skill, Mode A discipline + "Global DSH host
upgrades (agent discipline)" section). Nothing was installed, migrated, or modified; the fixture
pack was read only. This is a **host (dsh core) upgrade** question, not plugin Mode B/C work — the
skill explicitly separates the two, and the six installed community Web plugins need **no code
changes** for this edge (see §5).

Evidence used (all from `/app/fixture/`, read-only):
`attempt1-ebusy.log`, `running-processes.txt`, `attempt2-downgrade.log`, `npm-dist-tags.txt`.
Skill references consulted: SKILL.md §"Global DSH host upgrades (agent discipline)";
references/v0.1.2-alpha.5.md (cards DSH-0.1.2-A5-01/02/03 + npm-channel record);
references/rollup-0.1.2.md (R-04, R-08); references/troubleshooting.md (EBUSY row, S12 lineage);
references/precision-checklist.md (prerelease dist-tag rule).

---

## 1. Attempt 1 root cause — EBUSY on `koffi.node`

### What the evidence shows

`attempt1-ebusy.log`:

- `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` → `npm error code EBUSY`,
  `syscall copyfile`,
  path `C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node`,
  dest `C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node`.

`running-processes.txt` at the same moment — three `node.exe` processes:

| PID | Role |
|---|---|
| 42432 | **dsh web host** — annotated "holds koffi.node" |
| 23768 | agent session worker (child of the host) |
| 23920 | the npm install itself |

### Who holds the file, and why

`koffi.node` is the native binary of **`@koromix/koffi`**, the FFI addon the dsh host loads at
startup for its sandbox/filesystem operations. On Windows, a native `.node`/DLL that a process has
loaded is **mapped into that process's address space**, and the OS refuses any other process's
write/delete/copy-over access to the image file **until the owning process exits**. The owner here
is the running dsh web host, PID 42432 — not the browser, not npm.

npm's global install stages the new package tree through a temporary directory
(`@deepseek-ai\.dsh-TMPDIR`) before swapping it into place; its `copyfile` step touching the
already-installed, process-mapped `koffi.node` therefore fails with `EBUSY`. This is the exact
signature recorded in the skill's troubleshooting table (row: in-place global dsh upgrade on
Windows → EBUSY, real case `koffi.node` locked by the host PID; "the file lock is in the host,
not the browser"; source: this S12 scenario).

### Why a browser-page refresh does NOT free the lock

The browser is only a **client** of the dsh web host: refreshing (or even closing the tab)
reloads the SPA in the browser process and never touches PID 42432. The host keeps running —
serving the page, holding the loaded koffi image — so the OS-level file lock persists. The only
thing that releases the lock is **the host process exiting** (together with its workers; the agent
session worker PID 23768 lives inside the same host tree).

### Additional structural hazard (skill discipline)

The skill's "Global DSH host upgrades" section is explicit: **never run the global host upgrade
from inside a dsh session.** The session *is* the host process — npm removes/replaces the very
package tree the host executes from, the host dies mid-install (the tool call never returns), and
the interrupted install leaves package content present **without regenerated shims** (the `dsh`
command itself gone until an external pinned re-install repairs it). Attempt 1's process list
shows a live agent session worker, so if that npm command was issued from a dsh agent shell, it
would have been fatal even without the EBUSY. A crash during the upgrade is a signature of doing
it wrong, not a risk to tolerate.

### Correct stop-then-upgrade sequence

1. **Fully stop every dsh process**: exit the `dsh web` host (Ctrl+C in its terminal / its normal
   shutdown), close any dsh TUI or CLI sessions, and stop agent session workers. Do NOT run the
   install from a shell spawned by dsh itself — open a fresh **external** terminal.
2. **Verify nothing dsh-related remains**: `tasklist /FI "IMAGENAME eq node.exe"` — no host/worker
   node.exe may survive (the npm process itself will be the only node.exe once you run the
   install). If a stray host remains, stop it by its confirmed PID (`taskkill /PID <pid>`) only
   after verifying the PID is the dsh host.
3. **From the external terminal, run the pinned install**:
   `npm install -g @deepseek-ai/dsh@<exact-version>` (see §2/§3 — never the bare name).
4. **Restart** `dsh web`, **hard-refresh** the browser (client bundles are re-fetched per page
   load; a stale tab keeps old client halves), then verify version markers and that all plugins
   activate (§5).

Because the host is fully stopped before npm runs, nothing crashes mid-install. If an install was
already interrupted (EBUSY halfway, or a killed host): repair from an external shell by simply
**re-running the same pinned formal install** — never hand-copy package directories or hand-write
shims.

---

## 2. Attempt 2 root cause — the silent downgrade to `0.1.1-rc.2`

### What happened

`attempt2-downgrade.log`: after stopping dsh, the combined command from a plugin README —

```
npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui
```

installed cleanly, but `dsh --version` then printed **`0.1.1-rc.2`**, not the wanted
`0.1.2-alpha.5`. So attempt 2 fixed the lock problem (host stopped → no EBUSY) but fell into the
**resolution** trap: both specifiers are unpinned.

### What an unpinned `@deepseek-ai/dsh` resolves to, and why

npm semantics: a bare package name (no `@version` / range) resolves to whatever the registry's
**`latest` dist-tag** points at — *not* the currently installed version, and *not* the highest
semver on the registry. npm neither preserves nor advances your installed version; it just
installs the `latest` pointer.

`npm-dist-tags.txt` (registry state at the time):

| dist-tag | version |
|---|---|
| `latest` | **0.1.1-rc.2** ← what the bare name installed |
| `next` | 0.1.1-rc.2 |
| `alpha` | 0.1.2-alpha.5 ← the wanted release |

**The dist-tag it follows is `latest`.** The answer to "why is alpha.5 not on `latest`": the
0.1.2-alpha.x line is a **prerelease cohort**, and standard publish discipline (recorded in the
skill: rollup R-04 and the precision-checklist rule "prereleases route to the prerelease
dist-tag, never latest") keeps prereleases on the `alpha` dist-tag so that stable-channel users
are not auto-upgraded onto an alpha host. Hence, while you were running `0.1.2-alpha.4`
(installed from the alpha channel), `latest` still pointed at the last non-prerelease-channel
umbrella release, `0.1.1-rc.2`. The alpha.5 card's npm-channel record confirms exactly this
state: `alpha` = 0.1.2-alpha.5, `next` = 0.1.1-rc.2, `latest` = 0.1.1-rc.2 for the umbrella
`@deepseek-ai/dsh` (DSH-0.1.2-A5 corridor verification record).

Result: the "upgrade" command actually performed a **cross-line downgrade**
`0.1.2-alpha.4 → 0.1.1-rc.2`, silently, with a clean exit code. The combined form made it
worse: `@deepseek-harness-tui/dsh-tui` was equally unpinned and landed on *its* `latest`,
which is not guaranteed to target the alpha.5 host cohort either.

### Why this downgraded state is dangerous (don't keep running rc.2)

- **Plugin cohort mismatch**: your six community Web plugins are installed against the
  0.1.2-alpha cohort. On a 0.1.1-rc.2 host they can hit cross-cohort problems — client bundles
  hard-requiring modules unique to the alpha cohort fail with `missed the module table` and one
  bad entry can fail the whole bundle combo (rollup R-02 family).
- **On-disk home generation**: your `$DSH_HOME` was written by alpha.4 (a newer
  `session_projcache` generation than rc.2 knows). alpha.5 is precisely the release that reads
  **all three** projcache generations (v3 rc.2-era single-file, v4 alpha.3 per-record, and
  "poisoned" v5-stamped alpha.4 documents) and fixes the alpha.4 boot-refusal/title-loss bugs
  (card **DSH-0.1.2-A5-03**). Running rc.2 on an alpha.4-era home is a downgrade-read the old
  host was never built for. The correct move is forward to alpha.5 promptly, not staying on rc.2.

---

## 3. Exact safe upgrade commands for your situation

Goal: `@deepseek-ai/dsh` at **0.1.2-alpha.5** plus the TUI plugin, with six community Web
plugins on alpha-cohort builds. Everything below runs in an **external** terminal (PowerShell/cmd
opened by you, not by dsh), **after dsh is fully stopped**.

```powershell
# ---- Step 0: stop every dsh process, then PROVE it ----
#   (exit dsh web normally; close TUI/CLI sessions; do not run this from a dsh-spawned shell)
tasklist /FI "IMAGENAME eq node.exe"
# Expected: no dsh host / agent-worker node.exe left. If a confirmed dsh host PID survives:
#   taskkill /PID <confirmed-dsh-host-pid>

# ---- Step 1: resolve the TUI plugin's exact compatible version (read-only query) ----
npm view @deepseek-harness-tui/dsh-tui dist-tags
npm view @deepseek-harness-tui/dsh-tui versions --json
# Pick the newest release whose docs/peer range state compatibility with dsh 0.1.2-alpha.5
# (the alpha cohort — do NOT assume its "latest" tag targets alpha.5).

# ---- Step 2: pinned install of BOTH packages (exact versions, one command) ----
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@<exact-version>

# ---- Step 3: verify resolution before starting anything ----
dsh --version            # must print 0.1.2-alpha.5  (not 0.1.1-rc.2)
npm ls -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui

# ---- Step 4: restart and verify ----
dsh web
# then hard-refresh the browser (Ctrl+Shift+R) and check the six plugins load (§5).
```

Notes:

- The pin must be the **exact version** (`@0.1.2-alpha.5`). Using the moving tag
  `@alpha` would also reach alpha.5 *today* (per the dist-tags listing), but tags move; exact
  pins are reproducible and are what the skill's global-upgrade procedure mandates
  (`npm install -g @deepseek-ai/dsh@<exact-version>`).
- Never the bare name: `@deepseek-ai/dsh` = `latest` = `0.1.1-rc.2` = the downgrade trap (§2).
- If the registry is a lagging third-party mirror and the fresh alpha 404s (ETARGET/E404), point
  the install at the official registry for this command (rollup **R-08**: mirror lag on fresh
  `@deepseek-ai/*` publishes), e.g. PowerShell:
  `$env:npm_config_registry = "https://registry.npmjs.org"` before the install.
- **If an install is interrupted** (EBUSY mid-copy, killed process, power loss): from the same
  external shell, just re-run the Step-2 pinned command — npm repairs the tree and regenerates
  shims. Never hand-copy package directories or hand-write shims.
- Do not "upgrade the host only and ignore the plugins" beyond this edge's needs: see §5 — this
  particular edge needs no plugin work, but the verification pass is still required.

---

## 4. Prevention — what plugin README authors must change

The trap is the README's own combined command `npm install -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`.
Author-side fixes, in priority order:

1. **Pin exact versions in every published install command** —
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5 @deepseek-harness-tui/dsh-tui@X.Y.Z`.
   A bare package name silently means "whatever `latest` points at", which for a prerelease
   host cohort is an *older release line* (rc.2), i.e. the README command downgrades exactly the
   users who followed it to get the alpha. Never publish a bare-name global install of dsh.
2. **If a tag must be used, use the correct explicit tag** (`@alpha` for the alpha cohort) and
   say which dist-tag the command follows — but prefer exact versions, because tags move after
   the README is written.
3. **Document the host-version corridor** the plugin release supports ("requires dsh
   0.1.2-alpha.4 … 0.1.2-alpha.5"), and keep plugin prereleases on the prerelease dist-tag
   (rollup **R-04**: publish plugin alphas under `--tag alpha`, keeping `latest` for the
   stable-host line) so both sides follow the same channel discipline.
4. **Document the stop-then-upgrade order for Windows/global installs**: "fully stop the dsh host
   process first — closing or refreshing the browser does not release native-module file locks
   (EBUSY on `koffi.node`); run the install from an external terminal, never from inside a
   running dsh/agent session; then restart `dsh web` and hard-refresh."
5. **Add a post-install verification line** to the README: `dsh --version` must print the pinned
   version — turning a silent downgrade into a caught one.
6. **Do not bundle host + plugin in one unpinned command**; if a combined convenience command is
   published, every specifier in it carries an exact version.
7. Optionally note the **mirror-lag workaround** (official registry) for users whose npm points
   at a lagging mirror on release day (rollup **R-08**).

---

## 5. Plugin impact and post-upgrade validation (six community Web plugins, three GitHub mirrors)

- **Corridor**: alpha.4 → alpha.5, cards **DSH-0.1.2-A5-01** (`DomainSpec.compatibleVersions`,
  capability, optional), **DSH-0.1.2-A5-02** (`invalidRecords: 'backup-and-skip'` +
  `KvUnit.backupRecord`, capability, optional), **DSH-0.1.2-A5-03** (host fix for rc.2/alpha.3-era
  homes, informational). The card set's conclusion: for plugins staying on `defineTool`, the
  Remote wire, presets, or client UI, this is a **restart-only edge with zero code changes**;
  only plugins that persist state through the storage-domain API may optionally adopt A5-01/02.
  (Report cites card IDs and gist only, per scope.)
- **Validation after Step 4** (skill's layered checklist, host-upgrade subset):
  1. `dsh --version` = 0.1.2-alpha.5; `npm ls -g` shows both pinned packages.
  2. Cold-boot the profile: `dsh web` starts without `duplicate loader entry id` / pending-service
     loops; hard-refresh the browser so client bundles are re-fetched.
  3. All six plugins register and their UI contributions appear (a single failing client bundle
     can blank the whole combo — check the browser console for
     `Failed to load plugins: failed to import loader entry <id>`).
  4. Behavior smoke: one full message → tool → response flow per critical plugin.
  5. Session list shows pre-upgrade titles (A5-03 tolerance); no new `*.json.bak.*` salvage
     files appearing under `$DSH_HOME` after boot is the healthy signal.
- **Rollback baseline**: record the currently working pin before touching anything. If alpha.5
  misbehaves, roll back by *pinned* install from an external shell with the host stopped —
  e.g. `npm install -g @deepseek-ai/dsh@0.1.2-alpha.4` — never by drifting to the bare name
  (that lands on rc.2 again). Note that homes written by alpha.5 keep the projcache generations
  alpha.4 already reads (v4/v5), so a within-alpha.4/5 rollback is safe; rolling back across the
  line to 0.1.1-rc.2 is not advisable for an alpha-era home.

---

## Answers in one line each

1. **EBUSY**: the running dsh web host (node.exe PID 42432) has `koffi.node` memory-mapped as a
   loaded native addon; Windows locks loaded images until the process exits — a browser refresh
   only reloads the SPA client and never stops the host. Fix: fully stop all dsh processes →
   verify → pinned install from an external terminal → restart → hard-refresh.
2. **Downgrade**: unpinned `@deepseek-ai/dsh` resolves to the **`latest` dist-tag**, which was
   `0.1.1-rc.2` (alpha.5 rides the `alpha` tag by prerelease-publish discipline); npm follows
   the tag, not your installed version, so the combined README command silently downgraded you.
3. **Safe commands**: stop dsh → `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
   @deepseek-harness-tui/dsh-tui@<verified-exact-version>` → `dsh --version` → `dsh web` →
   hard-refresh → verify the six plugins (§3/§5).
4. **Prevention**: README authors must publish exact-version-pinned install commands (never bare
   names), state the supported host corridor and dist-tag, document stop-host-first + external
   terminal + post-install `dsh --version` verification (§4).


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.