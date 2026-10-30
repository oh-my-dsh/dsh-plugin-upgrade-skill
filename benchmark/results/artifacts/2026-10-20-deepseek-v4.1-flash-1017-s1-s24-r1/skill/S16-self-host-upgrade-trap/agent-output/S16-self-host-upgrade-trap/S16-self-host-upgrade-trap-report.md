# S16 · The Self-Host Upgrade Trap — root cause, broken state, repair, protocol, prevention

Read-only forensic report. Evidence: the four fixture files under [../../fixture/](../../fixture/) (byte-for-byte untouched); method: the plugin-upgrade skill (Mode A discipline, its "Global DSH host upgrades (agent discipline)" section, rollup entries R-08 / R-12, and the DSH-0.1.2-RC1 card set). Nothing was installed, migrated, or executed against a live host.

**摘要（一句话）**：从宿主进程内部执行全局升级是结构性自杀——npm 先移走正在被执行的包树，再生成 shim；宿主先死，工具结果通道随之消失，安装停在 linkStuff，于是“包内容还在、dsh 命令没了”。唯一正确修复是从 dsh 之外重跑同一条 pinned 安装；唯一正确做法是压根不执行，把外部步骤交给用户。

---

## 0. Verdict

The agent did not hit a flaky npm or a slow machine. It asked the host process to delete the filesystem tree that the host process was executing from, using a tool worker that the host itself supervises, and then waited for a result that only that host could have written. Three things had to break, and all three did: the executing package (removed at 16:41:05), the shim set (the link step never completed), and the result channel (the supervisor died before the tool result was persisted). The resulting broken state — rc.1 content present, `dsh` gone — is the exact fingerprint of “installation interrupted between *place* and *link*”, and it is repairable only by the one component that owns both steps: the package manager, re-run from outside.

---

## 1. Structural root cause

### 1.1 Three nested identities, one filesystem path

The log header names the collision ([agent-session-log.txt:3](../../fixture/agent-session-log.txt)): the host process is `node .../node_modules/@deepseek-ai/dsh/...`. So on this machine the following are **the same object**:

| Layer | What it is | Relationship to the upgrade target |
|---|---|---|
| The web GUI / session | an in-process session served by the host on `127.0.0.1:3080` | *is* the host |
| The tool worker | the child process that spawns `pwsh` for each tool call ([agent-session-log.txt:7](../../fixture/agent-session-log.txt)) | child of the host; lifetime owned by the host |
| The `dsh` CLI | `%APPDATA%\npm\dsh{,.cmd,.ps1}` + `node_modules\@deepseek-ai\dsh` ([env-state.txt:5-6](../../fixture/env-state.txt)) | the artifact npm was asked to replace |

Every other upgrade in this skill's scope has the agent standing *outside* the thing being changed (a plugin profile, a plugin source repo). Here the agent, its supervisor, its logger, its only restart mechanism and its only version probe are all inside the payload.

### 1.2 npm's ordering runs directly across the executing tree

The four timestamps are the whole mechanism ([agent-session-log.txt:9-12](../../fixture/agent-session-log.txt)):

1. **16:41:02 `cleaning`** — npm begins vacating the installed tree.
2. **16:41:05 `remove`** — the old package is detached. This npm leaves the displaced tree behind as `<name>-old-<version>`; the fixture shows exactly that artefact from an earlier upgrade (`dsh-old-0.1.1-rc.1`, [agent-session-log.txt:34](../../fixture/agent-session-log.txt)). At this instant the path the running host was launched from **stops existing**.
3. **16:41:09 → 16:41:31 `fetch` … `linkStuff`** — 22 seconds during which the old tree is absent and the host is still alive. That gap proves removal alone is not instantly fatal: node already has its loaded modules in memory. What *is* fatal is the next filesystem need — a lazy `import()` of a not-yet-loaded module, a client-bundle read, a re-spawned tool worker, a session-log write, a native `.node` load.
4. **`linkStuff`** — the step that writes `%APPDATA%\npm\dsh`, `dsh.cmd`, `dsh.ps1` (bin shims) and the hidden install record. It is the **last** step, and it is the step this machine never finished.

So the destruction is not “one bad line”. It is a *sequence in which at least one step must invalidate something the host still needs*, and the reason the crash looks like a timeout is that **which** step lands the fatal blow is timing-dependent. The class is deterministic even though the instant is not.

### 1.3 Why the tool call never returned a result

The result path is inside the casualty. A tool result is produced by the worker, returned to the host, and **durably recorded by the host's session-log writer**. The host was dead before npm finished, so:

- the *call* was already durably recorded (written on dispatch) — which is why the log shows the call;
- the *result* was never written ([agent-session-log.txt:17-18](../../fixture/agent-session-log.txt));
- no supervisory layer could fill it in, because the supervisor was the dead process.

This is a diagnostic asymmetry worth naming: **a recorded call with no recorded result means the process died between dispatch and result persistence.** It does not mean “npm is slow” or “the tool timed out” — a timeout would have logged a timeout. The 600 s timeout on the call ([agent-session-log.txt:7](../../fixture/agent-session-log.txt)) never got a chance to fire; the thing that would have enforced or reported it was gone in under 30 s.

Second-order consequence: `npm` itself was a descendant of that host. Its output stops mid-lifecycle with no completion line and no error line — the signature of a shell being torn down with its parent's process tree, not of npm failing.

### 1.4 Why “by construction” and not “by accident”

- **There is no safe ordering of an in-session call.** Any variant — `--force`, `--no-audit`, a longer timeout, retrying after the tab reconnects, backgrounding it and polling — still requires the host to survive the removal of its own package. It cannot.
- **Success would still not be success.** Even had npm completed, the running process would keep executing old code from memory while disk holds rc.1 (the *ghost host* case). The upgrade takes effect only at restart — precisely the action this agent cannot perform on itself.
- **The verification channel is the target.** `dsh --version`, `dsh web`, “did the plugins load” — every instrument the agent would use to confirm the result is part of the artifact being replaced. An operation whose success criterion can only be evaluated by the thing it destroys is unverifiable from inside by construction, regardless of luck.
- **Failure is self-concealing.** The only evidence of what happened is written by the process that stopped existing, and the machine is left with no CLI to investigate it with ([env-state.txt:16-17](../../fixture/env-state.txt) says so outright: only an external tool can repair it).

---

## 2. The broken state afterwards

### 2.1 What the evidence actually says

| Observation | Source | Reading |
|---|---|---|
| package content present, “partially replaced”, “NOT a standard install”, some files placed by hand | [env-state.txt:12-14](../../fixture/env-state.txt) | the tree is a *copy plus a manual touch*, not an npm product |
| `dsh.cmd` MISSING, `dsh` MISSING, `dsh.ps1` stale | [env-state.txt:15](../../fixture/env-state.txt), [agent-session-log.txt:31-32](../../fixture/agent-session-log.txt) | the link step unlinked/never rewrote the trio; the survivor is a dangling pointer |
| `dsh` / `dsh web` → “not recognized” | [agent-session-log.txt:22-28](../../fixture/agent-session-log.txt) | Windows dispatches through the `.cmd` / extensionless entries; both are gone. Even if resolution reached the stale `.ps1`, its embedded relative path points into the tree npm moved away — no launch either way |
| `dsh-old-0.1.1-rc.1` still on disk | [agent-session-log.txt:34](../../fixture/agent-session-log.txt) | proves this npm displaces old trees rather than deleting them — and that a *previous* in-place replacement already happened on this machine |
| host dead, GUI connection lost | [env-state.txt:9](../../fixture/env-state.txt) | the process that could have re-linked or reported is gone |

### 2.2 Why the command vanished while the content stayed

On Windows the `dsh` command is **not** the package. It is a generated triple in `%APPDATA%\npm`:

- `dsh.cmd` — a batch wrapper with the package's bin path baked in as a relative path from the shim to the target;
- `dsh.ps1` — the PowerShell wrapper with the same baked path in `$basedir` form;
- `dsh` — the extensionless shell entry

...all *pointers produced by the install*, computed at generation time from the actual on-disk layout. npm generates them in `linkStuff` / bin-linking — the step at `16:41:31` that never completed. Therefore:

- package **content** = data, installed by the earlier fetch/place phase;
- the **command** = registration, produced by the later link phase.

The install was interrupted precisely between those two phases. Content without registration is a library, not a CLI. And because the old shims had already been unlinked at `remove` while the new ones were never written, the machine ended in the *inconsistent middle*: two entries gone, one stale. That is the interrupted-install signature — not “npm deleted my package”, not “the version is wrong”.

Note the asymmetry the fixture quietly exposes: `dsh --version` is not reporting a version problem at all. There is no `dsh` to ask.

### 2.3 Why hand-swapping or hand-patching directories makes it worse

The user's partial manual repair is the natural instinct and it is the wrong one, for seven independent reasons:

1. **Shims are generated, and generated from the tree's real layout.** A hand-written `.cmd`/`.ps1` bakes a path you chose, loses npm's argv pass-through and quoting idioms, and breaks the moment the tree moves. It is invisible to npm — the next real install will overwrite or prune it without knowing it existed.
2. **Content without an install record is “extraneous” to npm.** npm's tree is more than files: it carries the hidden lockfile and the resolved dependency closure. A hand-placed tree makes `npm ls -g`, `prune` and the next `install` reason about a package npm did not install. You lose the ability to even ask “what is installed?”.
3. **The dependency closure is not in the package directory.** `@deepseek-ai/dsh`'s dependencies are resolved and hoisted *by npm at install time*. Copying just the package folder gives you rc.1 code resolving against whatever alpha.5 siblings remain — a mixed cohort that boots far enough to be believable and then fails somewhere unrelated. Same class of error the skill warns about for peer cohorts: a tree that “installs” without a coherent closure is not a migration.
4. **Windows locks make the copy itself unreliable.** Loaded `.node` addons, the npm cache, indexers and AV hold handles; a rename/copy that dies halfway produces a *partially written* tree — strictly worse than a missing one, because it now looks installed. The fixture's “some placed by hand / partially replaced” is exactly that state.
5. **It destroys the rollback.** `dsh-old-*` holds the previous *content* but no shims, so “restore by rename” recreates the identical dangling-shim condition with a different version label.
6. **It converts a clean failure into a misleading one.** A hand-repaired tree can boot, so the first symptom afterwards becomes a plugin error, a module-table miss or a random `ENOENT` — and the incident gets misattributed to the plugins rather than to the install.
7. **It bypasses the source of truth.** The registry is the authority for what `@deepseek-ai/dsh@0.1.2-rc.1` is; hand-edited files inside `%APPDATA%\npm` are unattributable, unauditable and unreproducible on the next machine.

The repair notes reach the same conclusion from the field ([repair-notes.md:4-6](../../fixture/repair-notes.md)): the tree was non-standard precisely *because* it had been swapped by hand.

---

## 3. The repair

### 3.1 What the repair notes actually applied

Two actions, in this order ([repair-notes.md:9-13](../../fixture/repair-notes.md)):

1. **Re-ran the formal pinned install from the registry, from an external CLI outside dsh** — `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`. Result: `dsh`, `dsh.cmd`, `dsh.ps1` all regenerated; `dsh --version` → `0.1.2-rc.1`.
2. **Aligned the source checkout** (host-source reference workspace) from the `alpha.5` tag to `dsh-v0.1.2-rc.1`; no local-modification conflicts.

Action 1 is *not* “reinstall to fix the files”. It is **completing the interrupted install**: the same command, re-run whole, so the phases that never ran (bin linking, install record, closure resolution) run now. Idempotent-by-repetition, not by patching.

Action 2 is a different artifact from action 1 and must not be conflated with it: installation identity (registry package in `%APPDATA%\npm`) vs. source identity (a Git checkout at a tag). The skill separates these on purpose; a machine can be correct in one and wrong in the other, and “version matches” in one says nothing about the other.

### 3.2 Why that form works where the in-session attempt could not

The command is character-for-character the one that failed. Only its *position in the process graph* changed:

- the repairing process is a **different CLI with no dsh ancestor**, so replacing `node_modules\@deepseek-ai\dsh` cannot kill the process doing the replacing;
- therefore the **result channel survives** — the repair's exit code, stdout and `dsh --version` are all observable;
- therefore all four phases run to completion, including the link step that generates the trio and the install record;
- and the precondition “the host is fully stopped” was *already satisfied for free*, because the failed attempt had killed it. That is luck, not method — the procedure in §4 stops hosts deliberately.

The general lesson: for self-replacement, correctness is a property of **who runs the command**, not of the command's flags. No flag makes an in-session global install survivable; an external shell makes even the identical command safe.

### 3.3 How the result is verified — and what is still open

Verified in the notes:

- **link layer**: all three shims regenerated (the step that had never run);
- **resolution layer**: `dsh --version` → `0.1.2-rc.1` — proves shim → package → bin entry resolves end-to-end, which no amount of file presence could prove before;
- **source identity**: checkout at `dsh-v0.1.2-rc.1`, clean, no conflicts.

Left open, and correctly labelled as such ([repair-notes.md:19-22](../../fixture/repair-notes.md)):

- **runtime layer**: `dsh --profile web`, hard refresh, plugins load (whale / progress). This is the layer that decides whether the upgrade is real; version strings are not evidence of a mounted plugin roster;
- **cleanup**: `dsh-old-*` deletion only after rc.1 is confirmed.

I would add three cheap checks before declaring done: `npm ls -g --depth=0` shows exactly one `@deepseek-ai/dsh` and nothing extraneous (proves the hand-touched tree was replaced, not merged); a ghost check that the running host is newer than the install (no supervisor-respawned alpha.5 holding old code in memory); and one real message → tool → response round on the restarted host.

**Residual risk, stated honestly**: the fixture contains no evidence that plugins were mounted on rc.1 yet, and no first-boot log excerpt. Until that round runs, the machine is “CLI repaired and version verified”, not “upgrade validated”.

---

## 4. The protocol the agent should have followed

### 4.1 What it should have recognized about itself

The relevant check is the rollup's **R-12** (“the upgrade target may be the currently running host”) — and its four questions resolve here with unusual clarity, because the target is not a plugin at all:

1. is the target in the current profile? — yes, it *serves* the profile;
2. is the target the preset/runtime the current agent uses? — yes, it is the runtime;
3. does the current Harness depend on the runtime being modified? — **it is the runner**; the log's own line 3 puts the host process inside `node_modules/@deepseek-ai/dsh/`;
4. is anything about to be removed still depended on? — the CLI that would restart it, and the supervisor that would report the result.

One `dsh --version` before acting would have shown that the requested package was the same package serving the request. That is a two-second check that never happened.

### 4.2 Should it execute the global install at all?

**No.** Four independent grounds, any one sufficient:

- **Structural**: §1.4 — no ordering, timeout, retry or flag makes it survivable, and success would still leave a ghost host.
- **Scope**: this is not Mode B (plugin update) or Mode C (plugin-source migration). The skill explicitly carves out “upgrade DSH core only and leave the plugins alone” and routes it to the host-upgrade discipline, whose only in-session output is a **procedure handed to the user**.
- **Authority**: the user authorised *upgrading dsh to v0.1.2-rc.1* — a goal — not the specific means of destroying the GUI that mediates the conversation. R-12's answer to “the target is the running host” is: hand control back, or recover through an external/manual path.
- **Verifiability**: nothing the agent could run afterwards would tell it whether the upgrade worked, because the probe is the payload.

The correct in-session deliverable was a short brief: “I cannot do this from here, and here is why; run these three steps in an external terminal.” That is not refusing the task — it is the only form in which the task is completable.

### 4.3 The external procedure it should have handed over (order is load-bearing)

**Step 0 — read-only preflight (the agent may do this itself).**
Confirm the target exists and which channel it rides (`npm view @deepseek-ai/dsh dist-tags`), and read the corridor. On 2026-09-03 `0.1.2-rc.1` was on `next` and the umbrella's `latest` still pointed at an older line, so a bare install at that moment would have landed on the wrong version (see the DSH-0.1.2-RC1 npm-channel note and R-08). Corridor: alpha.5 → rc.1 carries **zero cards** — pure version bump — so no plugin work is implied.

**Step 1 — stop every dsh process, before npm runs.**
Not a browser refresh: a tab reload only re-opens a WebSocket to the same live process. Enumerate *all* hosts — the interactive one on 3080, any other profile host, and any host started by a supervisor (Task Scheduler / service / `KeepAlive`-style) that would otherwise restart itself and keep old code in memory while lazily importing new files. Verify: no node process whose command line contains the dsh package path; port 3080 free.
*Why it must precede npm*: a live host holds handles on native modules and lazily imports files, so replacement either fails with a lock error or half-succeeds. Stopping first is what converts “crash mid-install” into “impossible to crash mid-install”.

**Step 2 — from an EXTERNAL terminal, the pinned install.**
`npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
*Why pinned, not bare*: a bare package name resolves the `latest` dist-tag, which is a moving target and may be a different line entirely — a silent downgrade dressed as an upgrade. The pin is also what makes the command idempotent, i.e. reusable as the repair.
*Why external*: the executing shell must not be a descendant of the package being replaced (§3.2).

**Step 3 — let it finish; verify before restarting.**
Confirm all three shims regenerated and `dsh --version` reports the target. Do not interrupt, and do not “check on it” from a dsh session.

**Step 4 — restart and validate for real.**
`dsh web` (or `dsh --profile web`), hard-refresh the browser, confirm the version marker in the client, the plugin roster, and one full message → tool → response round. Version strings alone do not prove the roster mounted.

**Step 5 — separately, if a source checkout is used as reference**, align it to the matching tag; treat it as a second, independent identity (§3.1).

### 4.4 Which parts are already-known upgrade rules, and which part is new

**Already known (this incident only re-proves them):**

- *Stop the host before replacing its runtime, and keep an independent recovery path* — R-12's recipe, including “treat stop → start as one atomic operation”.
- *Pin exact versions; dist-tags move* — R-08's install-channel pitfalls plus the DSH-0.1.2-RC1 channel measurements.
- *Verify by layered evidence, not by an install exit code* — the skill's validation layers: dependency resolution → enablement resolution → boot → real mount. A successful install is not an enabled runtime (Mode B step 5).
- *Keep installation identity and source identity separate* — shared-preparation rule #2.
- *Do not silently pick one side when local observation conflicts with a primary source* — a safety boundary; it is why the fix had to be re-derived from the registry rather than from the files on disk.

**New for this incident (what the corridor did not yet say this sharply):**

1. **The absolute negative.** R-12 said “confirm before affecting the host; hand back to the user”. This incident supplies the stronger claim: for the host's *own* package, in-session execution is not a risk to budget but a structural impossibility — the result channel, the supervisor and the verification CLI are all inside the replaced tree. Consequently **a crash during the upgrade is a signature of doing it wrong**, not a tolerable risk. This reframing is the single most valuable takeaway.
2. **The forensic rule for an interrupted install.** “Package content present + shims missing or stale” identifies the phase boundary (place done, link not) and dictates the repair: *finish the same install*, not *repair the shims*. Nothing in the corridor previously named this signature.
3. **An explicit prohibition list for repair**: never hand-copy the package tree, never hand-write shims, never merge a manual tree into the global prefix.
4. **Supervisor-managed hosts must be enumerated** before “stop all dsh processes”, or the restart silently resurrects old code.

---

## 5. Prevention

### 5.1 An agent-side guard against this class

Design it as a **deny-with-procedure** gate in the tool layer, evaluated before any mutating command runs:

1. **Classify the target, not the verb.** Parse the command; if a package manager is invoked with global/link scope (`-g`, `--global`, `link`, `unlink`, `cache clean`, `prefix -g`), resolve the *effective install prefix* (`npm prefix -g`, i.e. the directory holding `node_modules` and the shims) to a real absolute path.
2. **Compare against the executing ancestry.** Deny if that prefix is an ancestor-or-self of any of: `process.execPath`'s realpath, the host entry's package root, any ancestor process's command line, the shim directory on `PATH` used to launch this session, or the current runtime's module graph.
3. **Broaden from one package to the class**: anything that rewrites the global prefix, the `%APPDATA%\npm` shim directory, the `.dsh` home during a live session, or that stops/restarts the process hosting the session (`taskkill` / `Stop-Process` / `dsh web` / `dsh --profile ...`), is the same class and gets the same treatment.
4. **The refusal must carry the remedy.** A guard that only says “denied” gets routed around; one that emits the exact pinned external command plus the ordered steps is the actual fix. Here, a warning-only guard would have been bypassed exactly as the release notes were.
5. **Two companion rules that generalise beyond npm**:
   - *“restart / kill the thing that hosts me” is a hand-off boundary, never a tool action* — regardless of how the request is phrased;
   - *on “recorded call, no result”, do not retry.* First ask whether the process owning the result channel is still alive. Retrying a self-destructive command from a dead supervisor is how a bad state becomes a worse one.
6. **Journal intent before host-touching actions**: the exact command, the resolved target and the rollback line, written where an *external* repairer will find it — because in this failure mode no in-session record survives to the end.

A cheap version is a static deny-list of patterns; the durable version is the ancestry/prefix comparison in steps 1–2, because it catches rename-and-dance variants that any pattern list will always miss.

### 5.2 Post-upgrade checklist for this machine (alpha.5 → rc.1)

Given the finding that the edge is **252 files, all `package.json` version bumps, zero API changes** ([repair-notes.md:16-17](../../fixture/repair-notes.md), matching the DSH-0.1.2-RC1 card set), the checklist is about *install integrity and boot*, and explicitly **not** about migration:

1. **Install identity** — `dsh --version` = `0.1.2-rc.1`; all three shims present and resolving; `npm ls -g --depth=0` shows exactly one `@deepseek-ai/dsh` and nothing extraneous (proves the hand-touched tree is gone, not merged); the dist-tag of the installed version matches the intended channel.
2. **Ghost check** — the running host process postdates the install; no supervisor-respawned host still executing alpha.5 code from memory. Check *every* host, including ones nobody starts by hand.
3. **Boot** — `dsh --profile web` starts, listens on 3080, prints its token; first-boot log clean; **inspect any `*.json.bak.*` / salvage artefacts rather than deleting them** — alpha.5 added storage read-tolerance and backup-and-skip salvage, so those files are a *finding about old data*, not noise.
4. **Client** — hard refresh; the client reports `0.1.2-rc.1`; zero console errors after load **and** after opening Settings (the roster page is where a half-installed tree shows up).
5. **Plugins** — whale / progress and any link-installed plugins resolve and show Enabled; run one real message → tool → response round. Empty UI counts as failure even if every version string is right.
6. **Sessions** — existing session logs open normally (the log format did not move on this edge).
7. **No re-migration** — treat rc.1 as a no-op corridor. The rc.1 *release notes* summarise the whole 0.1.2 series; reading them as an incremental changelog is how a version bump turns into invented migration work (the coverage matrix in DSH-0.1.2-RC1 exists precisely to prevent this). Also: do **not** “fix” anything by jumping forward to a later line — the 0.1.3-alpha.1 cards record a session-log format migrator that refuses 0.1.2-alpha.x writer logs, which would convert a clean upgrade into an unloadable-history incident.
8. **Cleanup** — delete `dsh-old-*` only after 1–7 pass.
9. **Rollback line (recorded, not executed)** — external shell, host stopped, pinned `@0.1.2-alpha.5`. Never a directory rename.

---

## Appendix A · Evidence ledger

| Claim | Evidence |
|---|---|
| the session ran inside the package being replaced | [agent-session-log.txt:3](../../fixture/agent-session-log.txt), [env-state.txt:4](../../fixture/env-state.txt) |
| the tool call ran in the host's own worker | [agent-session-log.txt:7](../../fixture/agent-session-log.txt) |
| npm removed the tree before placing the new one | [agent-session-log.txt:9-12](../../fixture/agent-session-log.txt) |
| the old tree is displaced, not deleted | `dsh-old-0.1.1-rc.1` at [agent-session-log.txt:34](../../fixture/agent-session-log.txt), [env-state.txt:5](../../fixture/env-state.txt) |
| the host died mid-install, before the tool result | [agent-session-log.txt:14-18](../../fixture/agent-session-log.txt), [env-state.txt:9](../../fixture/env-state.txt) |
| the shims were never generated; one is stale | [agent-session-log.txt:31-32](../../fixture/agent-session-log.txt), [env-state.txt:15](../../fixture/env-state.txt) |
| content hand-modified → non-standard install | [env-state.txt:12-14](../../fixture/env-state.txt), [repair-notes.md:4-6](../../fixture/repair-notes.md) |
| repair = re-run the pinned formal install externally | [repair-notes.md:9-11](../../fixture/repair-notes.md) |
| the source checkout was aligned separately | [repair-notes.md:12-13](../../fixture/repair-notes.md) |
| the rc.1 edge is 252 version-only files | [repair-notes.md:16-17](../../fixture/repair-notes.md) |
| runtime / plugin verification still open | [repair-notes.md:19-22](../../fixture/repair-notes.md) |

## Appendix B · Skill sources used (points only)

- **plugin-upgrade SKILL.md** — mode table (A inspect / B plugin update / C plugin-source migrate); the “Global DSH host upgrades (agent discipline)” section: never execute the global host upgrade from inside a session on that host, hand the user the external procedure, and repair by re-running the pinned install rather than hand-copying trees or hand-writing shims; shared-preparation rule separating source identity from installation identity; validation layers (dependency → enablement → static → runtime → behaviour) and the rule that a successful install is not an enabled runtime.
- **rollup-0.1.2 R-12** — the upgrade target may be the currently running host; the four pre-checks; hand control back or recover through an external path; treat stop → start atomically with an independent recovery path.
- **rollup-0.1.2 R-08** — install-channel pitfalls: dist-tag drift, mirror lag, peer-floor prerelease semantics; pin exact versions, confirm the channel.
- **card set DSH-0.1.2-RC1** (alpha.5 → rc.1) — zero cards; 2 commits, 252 `package.json`-only files, zero source changes; the release notes summarise the whole 0.1.2 series and are not an incremental record of this edge; npm channel measurements around the incident date.
- cited only as a forward-looking hazard, not applied: the **0.1.3-alpha.1** edge (A1-01 / A1-02) — its session-log migrator refuses 0.1.2-alpha.x writer logs.
