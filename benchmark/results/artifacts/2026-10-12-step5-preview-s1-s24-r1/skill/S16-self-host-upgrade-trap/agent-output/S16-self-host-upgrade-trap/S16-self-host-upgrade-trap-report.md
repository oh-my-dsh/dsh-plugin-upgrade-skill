# S16 · The Self-Host Upgrade Trap — incident analysis

**Subject:** an agent running *inside* a dsh web session (host process = `node .../node_modules/@deepseek-ai/dsh/...`) ran
`npm install -g @deepseek-ai/dsh@0.1.2-rc.1` as a tool call after the user said "update dsh to v0.1.2-rc.1". The GUI died
mid-call, the tool call returned no result, and the `dsh` command itself was gone afterwards.

**Evidence used (read-only, unchanged):** `fixture/agent-session-log.txt`, `fixture/env-state.txt`,
`fixture/repair-notes.md`, `fixture/README.md`; skill references `SKILL.md` ("Global DSH host upgrades (agent
discipline)"), `references/rollup-0.1.2.md` (R-12), `references/troubleshooting.md` (S12 EBUSY row),
`references/precision-checklist.md`, `references/pre-flight.md` (step 1.5), `references/migration-hygiene.md`,
`references/v0.1.2-rc.1.md`, `references/v0.1.2-alpha.5.md`, `references/v0.1.6-alpha.2.md`.

**Verdict up front:** this was not a flaky npm run. It is the structural self-upgrade case: the session that issued the
command *was* the process that the command was replacing. Nothing about the command was wrong as a shell command; it was
wrong as a *place to run it from*.

---

## 1. Structural root cause — why this fails by construction

### 1.1 The identity: the session and its tool worker are *inside* the upgrade target

`agent-session-log.txt:2-4` states the relationship plainly: the agent session is a dsh web session, GUI at
`http://127.0.0.1:3080`, **host process = `node .../node_modules/@deepseek-ai/dsh/...`**. `env-state.txt:4` confirms:
"agent session → active, executing INSIDE that host process", and `:7` records that the tool call ran "running inside
the host's own worker process".

So the chain is:

- **upgrade target** = the global package directory `node_modules\@deepseek-ai\dsh` plus its bin shims in
  `%APPDATA%\npm`;
- **the thing executing the upgrade** = a tool worker that is a child/extension of that same package's process, whose
  modules are *loaded from that very directory*.

There is no isolation boundary between executor and target. This is exactly the case `rollup-0.1.2.md:287-306`
(R-12 "The upgrade target may be the currently running host") demands be checked *before* acting:
"confirm whether the upgrade target belongs to the current session / profile / Harness host … whether the runtime /
dependency being modified underpins the current Harness", and, if it does, "the Agent must not unconditionally perform
operations that could take the host down. Hand control back to the user … or complete recovery through an
external / manual path." Here the question answers itself at the identity level: the target is not merely *used by* the
current host — it **is** the current host.

### 1.2 npm's global install is a destructive in-place replace

The log shows npm's actual sequence (`agent-session-log.txt:9-12`):

```
[16:41:02] npm warn cleaning node_modules/@deepseek-ai/dsh
[16:41:05] npm info remove @deepseek-ai/dsh
[16:41:09] npm info fetch @deepseek-ai/dsh@0.1.2-rc.1
[16:41:31] npm info linkStuff @deepseek-ai/dsh@0.1.2-rc.1
```

`cleaning` → `remove` → `linkStuff` is npm tearing down and rewriting the directory the running host is executing from.
The host's module registry, loaded `.js` files, native modules and open file handles all point into a tree that is being
unlinked underneath it. Nothing about that is recoverable from inside: there is no way to upgrade the floor you are
standing on.

### 1.3 What dies first, and why the tool call can never return a result

- **What dies first is the host process**, at ~`16:41:31` (right after `linkStuff`, before npm ever reached the
  bin/shim-writing phase). The browser tab losing its connection (`agent-session-log.txt:14`) is a *symptom*, not the
  cause — the GUI is only the host's client; the host process is the thing that died.
- **The tool call's worker dies with it.** The result of a tool call has to be produced by that worker and *durably
  recorded* by the host runtime. When the host is the casualty of the call, there is nothing left to write the result.
  The log records exactly this (`agent-session-log.txt:17-18`): *"`<no result recorded — the tool call was interrupted
  after it was recorded, but no result was durably recorded. Its outcome is unknown.>`"*
- Consequently the agent loses the turn **and** the feedback loop: it cannot learn success/failure, cannot retry, cannot
  roll back, cannot warn the user. The call is a "kill the caller" pattern — its effect is to destroy the process that
  would have reported its own effect. That is why the outcome had to be discovered later "from a NEW shell on the same
  machine" (`agent-session-log.txt:20`).

**Why structural, not accidental:** the failure needs no race, no bug, no bad registry, no unlucky timing. Any attempt
of this shape destroys the host, because the executor and the target are the same object. The only variable is *how far*
npm gets before the process dies (here ~30 s: cleaning → remove → fetch → link). Per the skill: "a crash during the
upgrade is a signature of doing it wrong, not a risk to tolerate" (`SKILL.md:41-42`). A crash is therefore also a
*diagnostic*: it tells you the upgrade was run from the wrong place, not that npm is flaky.

---

## 2. The broken state afterwards — "content present, command gone"

### 2.1 The evidence

`env-state.txt:8-16` and `agent-session-log.txt:22-33`:

| | before | after |
|---|---|---|
| host / GUI | running, GUI at 127.0.0.1:3080 | dead |
| `dsh --version` | `0.1.2-alpha.5` | command not found |
| `dsh web` | works | command not found |
| npm global tree | standard install (alpha.5) | `@deepseek-ai/dsh` **content present** (rc.1 files, *some placed by hand* during a partial manual repair attempt by the user) — but **not a standard install** |
| shims | `dsh`, `dsh.cmd`, `dsh.ps1` all present | `dsh` and `dsh.cmd` **MISSING**; `dsh.ps1` **stale, points into the old tree** |
| backups | `dsh-old-*` | `dsh-old-0.1.1-rc.1` |

### 2.2 Why the command vanished although the package content is still there

A usable global npm CLI is **two coupled artifacts**, not one:

1. the package payload in `node_modules\@deepseek-ai\dsh`;
2. the **bin shims** npm writes into `%APPDATA%\npm` (the directory that is on `PATH`): `dsh`, `dsh.cmd`, `dsh.ps1`,
   generated at the **end** of a successful install, after the payload is linked and npm has resolved `bin`.

The interrupted install died between `linkStuff` (16:41:31) and shim generation. Part of the payload landed; the shims
never did. That is the whole answer to "why is the command gone when the files are there": `dsh` is not the package
directory — `dsh` is *a shim on PATH*, and the shims are the half of the install that never completed.

The surviving `dsh.ps1` cannot rescue it either, for two reasons:

- it is **stale** and still points into the old tree (`agent-session-log.txt:31`), i.e. at a package path that no longer
  holds a working install (and `node_modules\@deepseek-ai\dsh-old-0.1.1-rc.1` is itself an old backup line — the tree
  carries history of interrupted in-place replaces);
- on Windows, `dsh` is resolved through `PATHEXT` (`.COM;.EXE;.BAT;.CMD;…`), so the command lookup finds the
  extension-less `dsh` shim and `dsh.cmd` — both MISSING. A `.ps1` file is not how `dsh` is discovered, so even a
  *correct* `dsh.ps1` would not have been invoked by `dsh --version`.

Hence the verdict line `env-state.txt:16-17`: "the dsh CLI itself is unusable; only an external tool … can repair the
install." Note also the residual hazard: the leftover `dsh-old-0.1.1-rc.1` directory name is older than the alpha.5 host
that was running — the global tree has already been hand-managed before this incident, so "package content present" is
not even a trustworthy statement about *which* content is present.

### 2.3 Why hand-swapping or hand-patching directories makes it worse

`env-state.txt:12-13` already records that the user began exactly this: "some placed by hand during a partial manual
repair attempt by the user". That path is actively harmful:

1. **It destroys the last reliable signal.** The state that repair needs is "npm's bookkeeping vs. disk". Hand-copying
   files into (or moving directories around inside) the global npm tree makes it impossible to tell what npm placed from
   what a human placed, so the one transactional repair left — re-run the formal install so npm reconciles its own
   records — loses the information it needs to reconcile *against*.
2. **A mixed-version tree is worse than a missing install.** A half-replaced directory can hold a `package.json`/bin
   target from one build and host modules from another, which *looks* installed and fails partially or misleadingly at
   runtime, instead of failing loudly as "command not found".
3. **Hand-written shims bypass npm permanently.** A `dsh.ps1` edited by hand (or copied from the old tree) is invisible
   to later npm operations: it will not be updated, cleaned, or version-checked, producing "works in one shell, not in
   another" and phantom-version symptoms whose root cause is a hand-edited launcher.
4. **Directory surgery runs into the Windows lock problem** already captured in `troubleshooting.md:19` (S12): the
   running host holds native-module file handles, close-the-tab does not release them, and in-place replace/rename under
   lock is what produces `EBUSY` and half-swapped trees in the first place. Hand-swapping recreates that failure mode
   with none of npm's recovery.
5. The skill states the rule flatly: repair by re-running the **pinned formal install** from an external shell — "never
   hand-copy package directories or hand-write shims" (`SKILL.md:43-44`).

---

## 3. The repair that was actually applied, and why it works

### 3.1 What the repair notes did (`repair-notes.md:1-11`)

1. **Re-ran the formal install from the registry, pinned, from outside dsh** — a *different agent CLI, run outside
   dsh*:
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` → `dsh / dsh.cmd / dsh.ps1` **all regenerated**; `dsh --version` →
   `0.1.2-rc.1`.
2. Aligned the source checkout used for host-source reference from the alpha.5 tag to `dsh-v0.1.2-rc.1`; no
   local-modification conflicts.

So the repair is **the same command as the original attempt, executed from the right place** — not a different
technique. That is the crux: the fault was never the command.

### 3.2 Why this form works where the in-session attempt could not

- **The host is already dead.** The reason the first attempt was fatal — a live process executing from the tree npm is
  cleaning — is gone. There is nothing to kill mid-install, so the install runs to completion and *reaches* the
  bin/shim-writing phase that the killed attempt never reached. (This is also why the same command no longer risks the
  S12 `EBUSY` lock problem: no host process holds the native-module handles.)
- **npm is idempotent and self-healing for its own tree.** Re-running the *identical pinned* install lets npm
  re-establish its own record of the package, overwrite the hand-placed partial files with the registry payload, and
  regenerate every shim. It repairs a non-standard tree *without anyone needing to know what was hand-placed* —
  precisely the knowledge a manual repair lacks.
- **It runs from a process that survives the install**, so the outcome is observable, the command returns a result, and
  the repair can be verified rather than inferred.
- **Pinning matters.** `npm install -g @deepseek-ai/dsh@0.1.2-rc.1` states the exact target. A bare
  `npm install -g @deepseek-ai/dsh` resolves the `latest` dist-tag, which drifts: measured in
  `references/v0.1.2-rc.1.md:48-55`, the umbrella `latest` moved to `0.1.2-rc.1` on 2026-09-04, and the `alpha` tag had
  already drifted to the 0.1.3 line by 2026-09-07. Tags move; an exact version does not.
- **The "different agent CLI, run outside dsh" detail is the boundary itself**: repairing *is* allowed — from outside.
  It is the in-host session that must never do it. (And after the repair, any future session runs *inside the rc.1
  host* and is therefore subject to the same rule again.)

### 3.3 How the result is verified

- `dsh --version → 0.1.2-rc.1` proves **both** halves at once: shims regenerated *and* payload executes. A payload-only
  success would still be "command not found" — which is why this one command is the right acceptance test for this
  incident.
- `repair-notes.md:6-7` records the corridor finding that makes the rest of the verification cheap:
  `dsh-v0.1.2-alpha.5..dsh-v0.1.2-rc.1` = **252 files, ALL `package.json` version bumps, zero API/feature changes**, so
  plugins migrated for `0.1.2-alpha.x` need **no re-migration**. Any post-repair plugin failure is therefore an
  install/repair artifact to attribute to the repair, not evidence of plugin incompatibility (cf. the baseline-attribution
  discipline of R-06).
- Left for the user on the real machine (`repair-notes.md:19-21`): start `dsh --profile web`, hard-refresh the browser,
  confirm plugins load (whale / progress / etc.); optional cleanup of the `dsh-old-*` backups once rc.1 is confirmed.

---

## 4. The protocol the agent should have followed instead

### 4.1 What it should have recognized about itself

Before the install — ideally before even reading the release notes — the agent should have answered R-12's question
(`rollup-0.1.2.md:295-304`): *does the upgrade target belong to the current session / profile / Harness host?* Here the
answer is not "probably" but **tautologically yes**: the request was to replace the global `@deepseek-ai/dsh` package,
and the session's own host process is `node .../node_modules/@deepseek-ai/dsh/...` with the tool worker inside it
(`agent-session-log.txt:2-7`). The available signals are all upstream of any failure:

- the user's request names a **global host install** (`npm install -g`), which is not Mode B/C plugin work and is
  explicitly outside this skill's plugin modes (`SKILL.md:22-26`);
- the target is the umbrella `@deepseek-ai/dsh` package **itself**, not a plugin or a profile row;
- the agent's own runtime descends from that package.

A correct agent treats "I am inside the thing you are asking me to replace" as a **hard stop**, not as a detail.

### 4.2 Should it have executed the global install at all? No.

No — and the read-only work it had already done (checking the release notes) does not change that. The corridor
`alpha.5 → rc.1` being a zero-card no-op (`references/v0.1.2-rc.1.md:25-27`, `:160-166`: 252 files, all version bumps,
no plugin-facing changes) only means the *upgrade is cheap to justify*; it does not make it executable from inside the
host. Mode A inspect ends in a report (`SKILL.md:58-60`), and host-lifecycle operations are handed off, not performed.

### 4.3 The exact external procedure to hand the user (order matters)

**Step 0 (before anything) — read-only impact note.** State the request's nature: global host upgrade, target
`@deepseek-ai/dsh@0.1.2-rc.1`, corridor alpha.5→rc.1 is a pure version bump with zero plugin-facing changes, therefore
no plugin re-migration is required. Confirm the exact target version **exists on the registry** before asking the user to
stop anything — `npm view @deepseek-ai/dsh@0.1.2-rc.1 version` — because npm publish can lag the GitHub release
(`references/v0.1.6-alpha.2.md:79`: "Poll `npm view` until the version resolves before killing the running host — never
start the stop-host phase against an unpublished version").

**Step 1 — fully stop every dsh process FIRST.** Quit/stop the dsh host process itself; **closing the browser tab is
not a host stop**, and the host holds native-module file locks (`troubleshooting.md:19`, S12). This is what must happen
*before* npm runs: it removes the self-destruct condition (nothing executing from the tree npm will clean) and the lock
condition (no `EBUSY`), and it guarantees npm runs to completion.

**Step 2 — from an EXTERNAL terminal (not a dsh session), run the pinned install:**

```sh
npm install -g @deepseek-ai/dsh@0.1.2-rc.1
```

It must be **exactly this form**: (a) an exact pinned version, because a bare package name resolves the `latest`
dist-tag, which drifts (`v0.1.2-rc.1.md:48-55`, `rollup-0.1.2.md:3`) and can silently install a different line than the
user asked for; (b) the formal registry install, never a hand-built tree, a copied directory, or a hand-written shim —
hand-built trees "violate the formal-install rule" (`v0.1.6-alpha.2.md:79`) and a non-standard tree is what leaves the
CLI dead; (c) run from a process that is not, and does not depend on, the install target.

**Step 3 — restart and verify.** Restart `dsh web` (**host restart**, not a refresh: the host half only takes effect on
restart — `migration-hygiene.md:17-21`), hard-refresh the browser, then verify version markers and that the plugin fleet
loads (`SKILL.md:34-39`).

### 4.4 What is already a known upgrade rule vs. what is new for this incident

| Part of the procedure | Status |
|---|---|
| R-12 host-self safety boundary: check whether the target is the running host; do not take the host down; hand control back or recover externally (`rollup-0.1.2.md:287-306`) | **known rule** (rollup, security type) |
| Stop the host **before** any file replacement/upgrade; a browser refresh is not a host stop; the host holds the locks (`troubleshooting.md:19`, S12) | **known rule** |
| Pin the exact version; dist-tags drift (`latest` moved to rc.1; `alpha` drifted to the 0.1.3 line) (`v0.1.2-rc.1.md:48-55`, `rollup` R-08 install-channel pitfalls) | **known rule** |
| Verify the target resolves on npm before stopping the host (`v0.1.6-alpha.2.md:79`, E404 window) | **known rule** |
| Host half ⇒ host restart + hard refresh; verify the *process*, not the disk (`migration-hygiene.md:17-21`; `pre-flight.md:49-87`, step 1.5 / `ghost-host-check.mjs`) | **known rule** |
| Repair of an interrupted install = external pinned re-install; never hand-copy directories or hand-write shims (`SKILL.md:43-44`) | **known rule** (already encoded) |
| **The specific structural fatality: the session IS the host process, so the tool call cannot return a result (no durable result is recorded — the agent loses the turn *and* the feedback loop), and the interrupted npm install leaves the distinctive "payload present / shims absent" state in which the `dsh` command itself is dead** | **new for this incident** — now encoded in `SKILL.md:24-44` ("Global DSH host upgrades (agent discipline)") |

In short: the *ordering* rules (stop → pinned external install → restart/verify) were already known from S12 and the
dist-tag literature. What this incident adds is the proof that the failure is not order-related but **identity-related**,
and the signature by which its aftermath is recognised.

---

## 5. Prevention

### 5.1 An agent-side guard against this class of failure

1. **A pre-tool-call self-location check (make R-12 mechanical).** Before any command that writes to the global package
   tree or the shim directory, resolve: *is the install target the package root my own process is executing from?*
   Compare the running host's package root (e.g. the `.../node_modules/@deepseek-ai/dsh/...` prefix of `process.argv[1]`
   / loaded module paths, which `agent-session-log.txt:3` shows is directly readable) against the target of
   `npm install -g` / `npm uninstall -g` / any write under the global npm prefix or `%APPDATA%\npm`. Same root ⇒
   **refuse**. Same-root detection is cheap, deterministic, and needs no judgement call.
2. **A deny-with-procedure list for in-session tool calls.** Hard-refuse (not warn) any of:
   `npm install -g @deepseek-ai/dsh…`, `npm i -g/-g @deepseek-ai/dsh`, `npm uninstall -g @deepseek-ai/dsh`,
   `pnpm add -g`, `npm update -g` targeting the host, and any direct copy/rename/delete under the global npm tree or
   `%APPDATA%\npm` — including *repair* attempts after the fact, which are the same trap from the other side. On refusal,
   emit the external procedure from §4.3 instead of executing. Extend the same logic to any package the running host
   depends on, not only the umbrella package.
3. **Keep "can" and "may" separate.** The in-session agent's authority ends at producing a correct procedure; execution
   belongs to the user or to an agent running *outside* the host. Once the host is dead, the in-session agent has no
   path back at all — so a guard that only warns is not enough; it must refuse and hand off.
4. **Treat a mid-upgrade crash as an automatic post-mortem trigger.** A crash during the upgrade is a signature of
   doing it wrong (`SKILL.md:41-42`). On detecting it, run read-only diagnosis and immediately recognise the
   "payload present, `dsh`/`dsh.cmd` shims missing, `dsh.ps1` stale" signature → hand the external pinned re-install
   procedure. Never retry the install in-session, and never "complete" it by hand.
5. **Don't let a read-only investigation create momentum.** Reading the release notes is Mode A and ends in a report
   (`SKILL.md:58-60`). A zero-card, no-op corridor is precisely the case where an agent is most tempted to "just do it".
6. **Record the unknown-outcome problem explicitly.** Because the tool call returned no result
   (`agent-session-log.txt:17-18`), the agent must assume its own last write is in an indeterminate state; the first
   action of any new session must be read-only diagnosis, not a corrective install.

### 5.2 Post-upgrade checklist for this machine (alpha.5 → rc.1)

1. **Verify the install artifacts, not the version string alone.** `dsh --version` → `0.1.2-rc.1` (proves shims *and*
   payload), plus `npm ls -g --depth=0` to confirm npm's own bookkeeping now describes a **standard** install and the
   hand-placed partial tree has been absorbed. Confirm nothing on `PATH` still resolves into a `dsh-old-*` directory.
2. **Clean up the interrupted-install residue — only after confirmation.** Remove/archive the `dsh-old-*` backup
   directories once rc.1 is verified (`repair-notes.md:19-21`); never delete them before the new version is proven, since
   they are the fallback.
3. **Plugin fleet: assert *unchanged*, not re-migrate.** alpha.5→rc.1 is a pure version bump (252 files, all
   `package.json`, zero API changes), so plugins migrated for 0.1.2-alpha.x need no re-migration
   (`repair-notes.md:16-17`). Real-machine verification: `dsh --profile web`, hard-refresh, confirm whale / progress /
   etc. load and show Enabled. Any failure at this point is attributed to the repair/install, not to plugin
   incompatibility (R-06 attribution discipline).
4. **Respect the plane rule when verifying.** Client-half changes show up after a browser hard-refresh; host-half
   changes require a **host restart** (`migration-hygiene.md:17-21`). Do a full restart before judging, and read the
   version from the running process / served artifacts rather than from disk (ghost-host discipline,
   `pre-flight.md:49-87`).
5. **One extra restart against the in-place-upgrade combo gap.** An in-place npm-global upgrade can serve a client combo
   that omits newly added bundle modules — one missing module fails **every** client plugin's registration, and a single
   host restart self-heals it; if it does not, roll back to the previously verified pinned version
   (`references/v0.1.5-alpha.1.md:724`, `:736`, DSH-0.1.5-A1-20). rc.1 adds no modules, so exposure on this edge is low —
   but "restart once more and re-check the roster before blaming plugins" costs nothing.
6. **Windows-specific lock check.** Confirm no stray `node`/dsh host process survives from before the repair (closing
   browser tabs does not release the native-module handles — `troubleshooting.md:19`, S12); otherwise later upgrades will
   fail with `EBUSY` and in-place replaces will half-swap the tree again.
7. **Source-checkout alignment.** If this machine keeps a host-source reference workspace, keep it on the
   `dsh-v0.1.2-rc.1` tag with no local-modification conflicts (`repair-notes.md:13-14`), and record it so the next
   pre-flight pins `from` to the real generation (process, not disk).

---

## Notes on scope and evidence

- Read-only throughout: the fixture directory was inspected and left byte-identical; no migration, install, npm command
  or registry access was executed while writing this report. The report is the only artifact written, under the
  designated `agent-output/S16-self-host-upgrade-trap/` path.
- Every claim above is grounded in the four fixture files or in the plugin-upgrade skill's references (cited inline);
  nothing is derived from paths outside the permitted workspace.
- Known limits of the evidence: the log is an excerpt, so the exact byte at which npm died is inferred from the last log
  line (`linkStuff`, 16:41:31) plus the observed aftermath (payload present, `dsh`/`dsh.cmd` absent, `dsh.ps1` stale) —
  the mechanism stated in §2.2 is the only one consistent with both. The identity of the "partial manual repair attempt
  by the user" (`env-state.txt:12-13`) is not detailed in the fixture, which is why §2.3 argues from principle rather
  than from that attempt's specifics.
