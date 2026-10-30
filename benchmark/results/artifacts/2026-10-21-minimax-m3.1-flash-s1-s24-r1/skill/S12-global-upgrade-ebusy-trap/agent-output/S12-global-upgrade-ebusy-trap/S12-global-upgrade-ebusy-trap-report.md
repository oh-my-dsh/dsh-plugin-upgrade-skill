# S12 · Global Upgrade: EBUSY (Attempt 1) + Silent Downgrade (Attempt 2)

**Subject:** DSH host upgrade `0.1.2-alpha.4` → `0.1.2-alpha.5` on Windows, six community Web plugins across three GitHub mirrors.
**Mode:** Mode A · inspect (read-only diagnosis) + a hand-off upgrade procedure. Nothing was installed, stopped, or written outside this report.
**Governing skill:** `skills/plugin-upgrade/SKILL.md` → section *Global DSH host upgrades (agent discipline)*; `references/troubleshooting.md` (EBUSY row, S12 source); `references/rollup-0.1.2.md` (R-04, R-08, R-12); `references/v0.1.2-alpha.5.md` (DSH-0.1.2-A5-01/02/03); `references/v0.1.6-alpha.2.md` (DSH-0.1.6-A2-04); `references/pre-flight.md` §1.5; `references/migration-hygiene.md` §3.

---

## 0. Evidence map

| Fixture file | What it proves |
|---|---|
| `attempt1-ebusy.log` | `npm error code EBUSY`, `syscall copyfile`, source `...\@koromix\koffi-win32-x64\win32_x64\koffi.node`, dest `...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node` |
| `running-processes.txt` | PID 42432 = dsh web host (holds koffi.node); 23768 = agent session worker; 23920 = the npm install itself. Explains that the host loaded `@koromix/koffi` at startup and that a browser refresh only reloads the SPA |
| `attempt2-downgrade.log` | `npm install -g @deepseek-ai/dsh deepseek-harness-tui/dsh-tui` (unpinned) → install succeeds → `dsh --version` prints `0.1.1-rc.2` |
| `npm-dist-tags.txt` | `next: 0.1.1-rc.2`, `latest: 0.1.1-rc.2`, `alpha: 0.1.2-alpha.5` at the time of the attempt |

Fixture integrity re-verified at report time: all five files still match `fixture-seal.pre.json` (sha256) — **UNCHANGED**. The bundled planner `scripts/plan-migration.mjs --from dsh-v0.1.2-alpha.4 --to dsh-v0.1.2-alpha.5` was run read-only against the fixture and reports the corridor `v0.1.2-alpha.5.md` with `DSH-0.1.2-A5-03` as the only manual-review card (no code/config touchpoints, as expected for a log-only fixture).

---

## 1. Attempt 1 — why `koffi.node` is locked, and why a browser refresh cannot free it

### 1.1 Root cause (what holds the lock)

The failing operation is `copyfile`, and its **source** is the file that already exists in the global tree:

```
path  C:\...\@koromix\koffi-win32-x64\win32_x64\koffi.node     <- the file already installed
dest  C:\...\@deepseek-ai\.dsh-TMPDIR\...\koffi.node            <- npm's staging dir for the new tree
```

npm lays the new `@deepseek-ai/dsh` tree down in a temp directory inside the global root and then materialises the `@koromix/koffi-win32-x64` platform binary into it. The copy of the **already-installed** `koffi.node` fails with `EBUSY` (Windows `ERROR_SHARING_VIOLATION`) because that file is an **open, mapped native image** inside a live process.

Who holds it — `running-processes.txt`:

* **PID 42432 — the `dsh web` host.** It loaded `@koromix/koffi` (a native FFI addon) at startup for sandbox/filesystem operations; the host's local-filesystem package depends on `koffi` (confirmed in the v0.1.5-alpha.2 verification note: `@deepseek-ai/dsh-fs-local` depends on `koffi` + `@deepseek-ai/schemastery`). On Windows the loader maps the `.node` binary into the process image and keeps the file handle open with sharing restrictions that forbid another writer/replacer. The OS therefore holds a lock on that exact file **for the lifetime of the process**.
* PID 23768 — an agent session worker (also `node.exe`); PID 23920 — npm itself (the writer, not the holder).

The lock is **not** a leftover from a crashed install and **not** an npm cache problem: it is a live OS file lock owned by a running process.

### 1.2 Why a browser-page refresh does not free it

The lock lives in the **Node host process**, not in the browser:

* A browser refresh (or even closing the tab / the whole browser) only tears down the **Web Client** half — the SPA, its WebSocket, and its re-fetched client bundles. It does not signal the Node host.
* The host (PID 42432) is a **separate long-lived OS process** that loaded the native addon into its own address space. It keeps the file mapped and keeps the lock until that process **exits**.
* Therefore the mental model "the page shows the old host, so refreshing should update the host" is inverted: the page and the host are different processes with different lifetimes. Refreshing the page refreshes the *client*; the *host* only changes when it is restarted.
* This is the same fact the skill's pre-flight §1.5 calls a **ghost host**: a process that predates the change keeps executing the old generation from memory while the disk already reports the new one. A browser hard refresh cannot convert a ghost host into a new one.

**What does release the lock:** the host process exiting (clean shutdown of `dsh web`, or `taskkill` of the host and its children). Nothing else does.
**What does not release it:** browser refresh, hard refresh, tab close, browser close, page navigation, WebSocket disconnect, `dsh web` backgrounded/minimised, or a detached helper that merely re-uses the same global tree. Retrying npm, or renaming the file aside, does not release the lock either — it only converts the failure into a half-replaced tree.

### 1.3 The correct stop-then-upgrade sequence

Per the skill's *Global DSH host upgrades* discipline (and `troubleshooting.md`'s EBUSY row), the order is mandatory and the install must happen **from an external terminal, never from inside a dsh session**:

1. **Confirm the target is published first** — `npm view @deepseek-ai/dsh@0.1.2-alpha.5 version` must resolve. Never start the stop-host phase against an unpublished version (DSH-0.1.6-A2-04: GitHub release → npm publish lag produced E404 windows; a failed install after you already killed the host is the worst outcome). In this fixture `alpha: '0.1.2-alpha.5'` confirms the version is on the registry.
2. **Fully stop every dsh process** — the `dsh web` host, any session workers, any `dsh` CLI/TUI processes. Not "the tab" — the *processes*.
3. **Verify they are gone** (re-run the process listing; optionally use Sysinternals `handle.exe koffi.node` if available — not part of the fixture).
4. **Run the pinned install from the external shell:** `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`.
5. **Restart** `dsh web`, then hard-refresh the browser.
6. **Verify** the version marker and that all plugins are still loaded.

Two consequences worth internalising:

* **A crash during the upgrade is a signature of doing it wrong**, not a risk to tolerate: because the host is fully stopped before npm runs, nothing can die mid-install. If the host *does* die mid-install, the host was not actually stopped.
* **Never run a global host upgrade from inside a dsh session.** The session *is* the host process; npm removes and replaces the very package tree the session executes from, the host dies mid-install, the tool call never returns, and the interrupted install leaves package content without regenerated shims — the `dsh` command itself disappears until an external pinned re-install repairs it. Repair = re-run the pinned formal install from an external shell; never hand-copy package directories and never hand-write shims.

---

## 2. Attempt 2 — why `dsh --version` printed `0.1.1-rc.2`

### 2.1 Root cause (what the unpinned name resolved to, and why)

The command was:

```
npm install -g @deepseek-ai/dsh deepseek-harness-tui/dsh-tui
```

`@deepseek-ai/dsh` carries **no version and no tag**, so npm resolves it through the registry manifest's **`latest` dist-tag**. From `npm-dist-tags.txt` at that moment:

| dist-tag | version |
|---|---|
| `latest` | `0.1.1-rc.2` |
| `next`   | `0.1.1-rc.2` |
| `alpha`  | `0.1.2-alpha.5`  ← the release the user actually wanted |

So the bare name resolved to **`0.1.1-rc.2`** and npm installed it, **replacing** the previously installed `0.1.2-alpha.4` tree. The install "went through fine" because it was a perfectly valid install — of the wrong version. `dsh --version` then truthfully reported `0.1.1-rc.2`.

**The dist-tag it followed: `latest`.** (Not `next`, not `alpha`. In this particular registry state `latest` and `next` happened to point at the same version, so the outcome is the same; the rule to carry forward is *bare name → `latest`.)

### 2.2 The trap in one sentence

**An unpinned global install does not preserve and does not advance the installed version — it always resolves the tag fresh and installs whatever the tag points at, even when that is *older* than what you already had.** npm emits no warning for moving backwards. The only signal is the post-install version check, which is why this failure is silent.

Concretely, the "upgrade" crossed **two version lines backwards**: `0.1.2-alpha.4` → `0.1.1-rc.2`. The `alpha` channel existed and was exactly right, but a bare name never looks at it.

### 2.3 Why `latest` lagged, and what that meant for the host

The umbrella package `@deepseek-ai/dsh` keeps `latest` on the oldest stable line while prereleases ride `alpha`/`next` — the corridor record shows `latest` = `0.1.1-rc.2` measured 2026-09-03, moving to `0.1.2-rc.1` only on 2026-09-04; sub-packages lag further (their `latest` stayed at `0.0.1-rc.1`/`0.1.0-rc.6`), which is why the corridor's own rule is *"install sub-packages with an explicit version or the `alpha`/`next` tag"*. The fixture's dist-tags listing is the 2026-09-03 state.

Two second-order facts make attempt 2 worse than it looks:

* **Attempt 2 moved the home backwards onto the rc.2 generation.** DSH-0.1.2-A5-03 is precisely about this: upgrading a **0.1.1-rc.2** or **0.1.2-alpha.3** home to alpha.4 could refuse to boot or drop session titles (the `session_projcache` v3/v4 generations were not read by alpha.4, and the first bad boot could permanently poison the new tree). **alpha.5 is the release that reads all three generations** (`compatibleVersions: [3, 4]` + a v3 bootstrap version gate). So alpha.5 is the correct landing spot for an rc.2-era home — but staying on the `latest` pointer (rc.2) is the worst place to be.
* **The combined command coupled two independent lifecycles.** One `npm install -g` invocation carried the host package *and* the TUI plugin. That made the host's resolution depend on whichever tag the plugin README happened to be written against, and made it impossible to fix the host without re-running the plugin install. The two installs must be separate commands.

### 2.4 What an unpinned install *is* good for (and is not)

* `npm install -g @deepseek-ai/dsh` → "install whatever `latest` says" — for a user who wants the stable line and accepts that it may be *older* than their current build.
* `npm install -g @deepseek-ai/dsh@alpha` → floating: right on the day it is written, wrong the day the tag moves. Not a pin.
* `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` → an **exact pin**: reproducible, and cannot move under you. **This is the form the skill prescribes.**

---

## 3. The exact safe upgrade procedure for this situation

**Your starting state right now is `0.1.1-rc.2`** — attempt 2 succeeded in downgrading you, and the EBUSY host is stopped. So this is a jump from the rc.2 generation to `0.1.2-alpha.5`, which is exactly the jump DSH-0.1.2-A5-03 makes safe.

Run **all** of this from a **plain external Windows Terminal** (PowerShell or cmd) — *not* from inside a dsh session, and not from a terminal whose shell is running dsh.

### Step 0 — record the baseline (read-only)

```
dsh --version
npm view @deepseek-ai/dsh dist-tags
npm ls -g --depth=0
```

Record the output (this is your rollback anchor): the current host version, the resolved dist-tags, and the exact global package set.

### Step 1 — prove the target exists **before** you stop anything

```
npm view @deepseek-ai/dsh@0.1.2-alpha.5 version
```

Must print `0.1.2-alpha.5`. If it prints E404 / "No match found", **stop here** — the npm publish lags the GitHub release for minutes-to-hours (DSH-0.1.6-A2-04). Poll until it resolves; do not kill the host against an unpublished version. In this fixture the dist-tags listing already shows `alpha: '0.1.2-alpha.5'`, so it is published.

### Step 2 — fully stop every dsh process

```
tasklist /FI "IMAGENAME eq node.exe" /V
```

Stop the `dsh web` host **and** every dsh-side `node.exe`: the host (PID 42432 in the evidence pack), the agent session worker (23768), plus any `dsh` CLI, TUI, or helper process. Prefer a graceful stop of `dsh web` (Ctrl-C in the console that owns it) so the process actually exits and the native handle is released; force only what refuses to exit:

```
taskkill /PID <host-pid> /T /F
taskkill /PID <worker-pid> /T /F
tasklist /FI "IMAGENAME eq node.exe"     # the dsh host must be gone
```

**Do not close the browser tab and call it done** — a page refresh, a tab close, and a browser close all leave the lock in place (§1.2).

### Step 3 — install the host, pinned, from the external shell

```
npm install -g @deepseek-ai/dsh@0.1.2-alpha.5
```

Exact version, not a bare name, not `@alpha`. The host is fully stopped, so nothing can die mid-install and the shims are regenerated cleanly.

### Step 4 — install the TUI plugin **separately**, pinned to an immutable ref

```
npm view "deepseek-harness-tui/dsh-tui" peerDependencies
npm install -g "deepseek-harness-tui/dsh-tui#<tag-or-commit-sha>"
```

Rules for this step:

* **Separate command from the host install.** Never combine the host package and the plugin package in one `npm install -g`. (This is the defect in the README command that produced attempt 2.)
* **Pin an immutable ref.** A GitHub shorthand without a ref resolves the default branch HEAD and moves under you; a tag or commit SHA does not. The specific TUI tag/SHA to use is **not stated in the fixture** — take it from the plugin's own release notes, and pin it.
* **Check the peer floor first** (the `peerDependencies` command above). npm's prerelease matching rules are unforgiving: a range written as `^0.1.0-rc.8` does **not** match `0.1.2-alpha.5` — the comparator must share the same tuple and carry a prerelease (R-08, install-channel pitfall 3). If the TUI's floor is stale, the fix belongs in the plugin's repository (raise it to `^0.1.2-alpha.5`); on the user side it shows up as an install-time peer warning/refusal.
* **Re-run the TUI's own patch-surface check.** The TUI is a *host-plane* plugin: it pushes cohort differences into `!!js` probes in `cordis.patch.yml` rather than changing its artifact. The probe snapshots are evaluated against the rc.2 and alpha baselines; after the host moves to alpha.5 they must be re-evaluated, or the TUI silently composes the wrong rows.

### Step 5 — verify the landing, don't trust "install finished"

```
dsh --version
npm ls -g --depth=0
```

* `dsh --version` must print **exactly `0.1.2-alpha.5`**. This is the single check that catches attempt 2's class of failure. If it prints anything else, you are on the wrong version — stop and re-pin.
* `npm ls -g --depth=0` must show `@deepseek-ai/dsh@0.1.2-alpha.5` and the pinned TUI package, with no second `@deepseek-ai/dsh` copy.

### Step 6 — restart and verify the plugin fleet

```
dsh web
```

then **hard-refresh the browser** (Ctrl+F5). Both halves matter: a client-half change lands on a browser hard refresh, a host-half change lands only on a **host restart** (migration-hygiene §3). Then confirm in the boot log / Settings → Plugins:

* the client reports the `0.1.2-alpha.5` version marker;
* no `missed the module table`, no `service-unavailable` loop, no entry stuck `pending`;
* all six community Web plugins are still listed and enabled, and the TUI entry activated.

The alpha.4 → alpha.5 edge is a **restart-only edge for plugins** on `defineTool` / the Remote wire / presets / client UI — no plugin code changes are required; the only changed API surface is the storage-domain vocabulary (DSH-0.1.2-A5-01 `compatibleVersions`, DSH-0.1.2-A5-02 `invalidRecords: 'backup-and-skip'`), which is opt-in per domain. So your six Web plugins should come up unchanged; the point of the check is to prove it, not to expect breakage.

### Step 7 — rollback (same rules in reverse)

```
# stop every dsh process first, then:
npm install -g @deepseek-ai/dsh@0.1.2-alpha.4
```

Roll back to the **pinned** version you recorded in Step 0 — never with a bare name (the bare name is what put you on rc.2). Rolling back across the alpha.5 fix means losing the A5-03 boot/title fix for an rc.2-era home, so roll back to `0.1.2-alpha.4` only if alpha.5 itself is broken, and expect the rc.2/alpha.3-era `session_projcache` risk to return.

### Notes on your six plugin installs

They live outside the global npm tree (GitHub-mirror installs), so the host replacement does not touch them. Two cautions: (a) if any of them is a **link/junction** install into a profile, do **not** "fix" it by copying files into `node_modules` — for a junction install the repo tree and the install directory are the same physical location, and a copy/rename across the junction damages the only source file; check `Get-Item | Select LinkType,Target` first; (b) a global host upgrade does not change profile composition rows (`cordis.patch.yml` / `agent.cordis.yml`) — those are owned by the profile.

---

## 4. Prevention — what plugin README authors must change

The README that produced attempt 2 is the vector. The command `npm install -g @deepseek-ai/dsh deepseek-harness-tui/dsh-tui` is defective in **three independent ways**, and each needs its own fix.

### 4.1 Never let the host package be unpinned in a user-facing command

* **Rule:** every host install in a README is `npm install -g @deepseek-ai/dsh@<exact-version>`, where the version is the cohort the plugin was actually tested against.
* **Why:** a bare name follows `latest`, which on the umbrella package lags the release line and can be *older* than the user's installed build — a silent downgrade with no npm warning.
* **Say it in the README explicitly:** `npm install -g @deepseek-ai/dsh` installs the `latest` dist-tag, which may be *older* than what you already have; pin the version you tested.
* **Show the reader the channel map**, e.g. `npm view @deepseek-ai/dsh dist-tags`, and state which channel the recommended version rides (`alpha` for prerelease cohorts). State that dist-tags move and that the pinned version does not.

### 4.2 Never combine the host package and a plugin package in one `npm install -g`

* **Rule:** two commands, in this order — host first (pinned), then plugin (pinned). If the plugin is profile-scoped, use the profile track (the plugin-manager / `dsh plugin add` lane) rather than a global install, and never let it carry the host package as a side effect.
* **Why:** combining makes the host's resolution depend on the tag the README was written against, and makes "upgrade the host" impossible without re-running the plugin install — which is precisely the coupling that produced attempt 2.

### 4.3 State the stop-host rule, and that a browser refresh is not a stop

* **Rule:** the README's install section must say, in the imperative: *stop the running `dsh web` host and all dsh processes first, from a separate terminal*; the install fails with `EBUSY` on `koffi.node` (and other native modules) if the host is still running; closing or refreshing the browser does **not** release the lock; the lock is released only when the host process exits.
* **Why:** the failure looks like an npm bug and sends users to reinstall npm, clear caches, or force-delete files in the global tree — all of which turn a harmless lock into a half-replaced install.

### 4.4 Pin the *plugin's* peer floor to the cohort it supports, and publish it on the right channel

* Declare `peerDependencies` on `@deepseek-ai/dsh` as a cohort floor that actually admits the target — e.g. `^0.1.2-alpha.5`, **not** `^0.1.0-rc.8`-style floors. npm's prerelease matching refuses the latter for any `0.1.2-alpha.x` host (R-08 pitfall 3), producing an install-time peer warning/refusal that looks like user error.
* Publish prerelease-cohort plugin versions under the `alpha` dist-tag, keeping `latest` for the stable-host line (R-04) — otherwise stable-host users are auto-upgraded into an incompatible cohort.
* Remember the sub-package trap: `@deepseek-ai/dsh-*` packages carry their own (lagging) `latest` tags, so READMEs must pin sub-packages by exact version or by the `alpha`/`next` tag.

### 4.5 Add a verification step to the README — the cheapest possible fix for this whole class

```
dsh --version          # must print the version the plugin was tested against
```

and, for the "upgrade the host" path, a *before/after* pair of `npm view @deepseek-ai/dsh dist-tags` and `npm ls -g --depth=0`. A README that ends with a verification command turns a silent downgrade into a visible mismatch.

### 4.6 Document the install-channel pitfalls your readers will hit (R-08, DSH-0.1.6-A2-04)

* **Mirror lag** — third-party npm mirrors (npmmirror and the like) lag fresh `@deepseek-ai/*` publications by hours or more → E404/ETARGET. Point users at the official registry (`npm_config_registry=https://registry.npmjs.org`).
* **npm publish lag** — a GitHub pre-release can be missing from npm for minutes-to-hours; the README should tell readers to `npm view @deepseek-ai/dsh@<version> version` and wait, rather than to kill their host and retry.
* **pnpm 11 supply-chain rule** — `minimumReleaseAge` (24 h) refuses a brand-new release; prefer a per-scope `minimumReleaseAgeExclude: ['@deepseek-ai/*']` over disabling the rule repo-wide.
* **CI** — use the verify-only, no-install pattern (keep the install baseline, typecheck against the target tag with a `paths` mapping) instead of pinning a global install in CI.

### 4.7 Do not ask users to run a global host upgrade from inside a dsh session

If the README is read by a user who is *currently in* a dsh session, a global host upgrade is structurally fatal there (the session is the host; npm replaces the tree it is executing from; the host dies mid-install; shims are left unregenerated and the `dsh` command disappears until an external pinned re-install repairs it). The README should say: **run the host upgrade from a separate external terminal, with dsh fully stopped** — and if a host install was interrupted, repair by re-running the pinned formal install from an external shell (never by hand-copying package directories or hand-writing shims).

---

## 5. Answer summary

| Question | Answer |
|---|---|
| Why is `koffi.node` locked? | It is a **native `.node` image mapped into the running `dsh web` host** (PID 42432), which loaded `@koromix/koffi` at startup for sandbox/filesystem ops. Windows keeps the mapped image locked until the process exits; npm's `copyfile` of that file into its staging dir fails with EBUSY. |
| Why doesn't a browser refresh free it? | The lock is in the **host process**, not the browser. A refresh/tab-close/browser-close only reloads the Web Client half; the Node host survives and keeps the native module mapped. Only **process exit** releases it. |
| Correct sequence? | Confirm the version is published → stop **all** dsh processes (host + workers) → verify they are gone → **from an external terminal** run `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` → restart `dsh web` → hard-refresh the browser → verify `dsh --version` and the plugin fleet. |
| Why did `dsh --version` print `0.1.1-rc.2`? | The unpinned `@deepseek-ai/dsh` resolved via the registry's **`latest` dist-tag**, which pointed at `0.1.1-rc.2` (the `alpha` tag held `0.1.2-alpha.5`). npm installed that tag target, **replacing** the alpha.4 tree — an unpinned global install does not preserve or advance the installed version, and npm warns nothing when it moves backwards. |
| Which dist-tag? | **`latest`** (bare name). `next` and `alpha` were also present but were not consulted; `@alpha` would have given alpha.5 that day, but a tag floats and a version pin does not. |
| Safe commands? | `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5` **then separately** `npm install -g "deepseek-harness-tui/dsh-tui#<immutable-ref>"` — host first, both pinned, both with dsh fully stopped, host install from an external terminal. Verify with `dsh --version` → `0.1.2-alpha.5`. |
| README prevention? | Pin the host version; never combine host + plugin in one global install; state the stop-host rule and that a refresh ≠ stop; publish on the right dist-tag with a correct peer floor; end with a `dsh --version` verification step; document mirror/publish-lag/`minimumReleaseAge` pitfalls; never tell users to upgrade the host from inside a dsh session. |

---

## 6. Report structure (per the skill's *Validation and reporting*)

* **Pre-existing:** not collected (Mode A inspect; no code was migrated). The two failures below are *operational*, not code regressions.
* **Completed:** root cause of attempt 1 (native-image lock held by the live host process; browser refresh is not a stop) and of attempt 2 (bare name → `latest` → `0.1.1-rc.2` → silent downgrade); the stop-then-upgrade procedure with pinned commands for alpha.5 + the TUI; README-author prevention guidance.
* **Skipped / not applicable:** no plugin source migration — the alpha.4 → alpha.5 edge is a restart-only edge for `defineTool`/Remote/preset/client-UI plugins (DSH-0.1.2-A5-01/02 are opt-in storage-domain capabilities). The read-only planner found no code/config touchpoints in the fixture (logs only).
* **Pending / residual risk:**
  * The exact TUI plugin version/tag/SHA to pin is **not stated in the fixture** — take it from the plugin's release notes and pin it.
  * The TUI's `peerDependencies` floor and its `cordis.patch.yml` `!!js` probe snapshots are **not in the fixture**; check both against `0.1.2-alpha.5` (probe re-evaluation + npm prerelease peer matching).
  * Whether the agent session worker (PID 23768) also mapped `koffi` is **unconfirmed**; the conservative "stop every dsh process" rule covers it.
  * The registry/mirror the user actually installs from is **unconfirmed**; mirror lag (R-08) can turn the pinned install into E404.
  * The six plugins' per-plugin install track (registry vs link/junction) is **not in the fixture**; check `LinkType`/`Target` before touching any `node_modules` (S14 trap).
  * npm publish lag after a GitHub pre-release (DSH-0.1.6-A2-04) — poll `npm view` before stopping the host.
* **Rollback:** baseline recorded in Step 0 (`dsh --version`, `npm view … dist-tags`, `npm ls -g --depth=0`); rollback = stop all dsh processes, then `npm install -g @deepseek-ai/dsh@0.1.2-alpha.4` from an external shell (pinned, never bare).
* **Recommendations:** adopt the verify-first, stop-host, pin-exactly discipline for every global host upgrade; treat `dsh --version` as a mandatory post-install gate; publish plugin READMEs with a pinned host version, a separate plugin command, and a verification step.

*Nothing in the fixture was modified; all five fixture files re-verified against `fixture-seal.pre.json` as UNCHANGED. No install, migration, or host command was executed.*
