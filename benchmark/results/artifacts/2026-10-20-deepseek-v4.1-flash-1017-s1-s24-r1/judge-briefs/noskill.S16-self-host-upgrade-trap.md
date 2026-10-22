# JUDGE BRIEF · noskill.S16-self-host-upgrade-trap

## Criteria (sealed rubric)
- [self-host-failure] (20pt) Use agent-session-log.txt and env-state.txt to connect the session/tool worker to the host installation npm is replacing. The running host dies during replacement, the GUI disconnects and the caller cannot record a completed tool result. Recognize this self-host dependency hazard instead of calling it a random network failure; preserve the log’s unknown final tool outcome. Do not require a universal claim that every in-place upgrade on every platform must crash.
- [interrupted-install-signature] (20pt) Explain env-state.txt: package content exists but dsh/dsh.cmd are missing and dsh.ps1 is stale, so the CLI entry points are broken and content presence does not prove a complete install. Relate the nonstandard/manually swapped tree to the broken shim state and reject hand-swapping directories or hand-writing shims as the repair.
- [external-pinned-repair] (20pt) Ground the remedy in repair-notes.md: rerun npm install -g @deepseek-ai/dsh@0.1.2-rc.1 from an external terminal/tool outside the stopped target host so npm regenerates the shims; verify dsh --version equals rc.1. Account for aligning the reference source checkout to the same tag when used, without demanding unrelated source edits. Describe the recorded repair and proposed verification separately from actions performed by the candidate.
- [handoff-protocol] (20pt) The agent must recognize it is running on the upgrade target and hand off, not execute the global install in that session. The external procedure fully stops the host before the exact-version npm install, then restarts the host, refreshes the browser and verifies. Explain that stop-host-first and exact version pinning are established rules, while refusing execution from inside the target host is the additional self-host rule. An external shell launched as a dependent tool inside the dying host is not an independent handoff.
- [guard-and-postupgrade-checks] (20pt) Describe an agent guard that relates the requested upgrade target to its own runtime/worker path. Use repair-notes.md’s alpha.5→rc.1 version-only diff to avoid needless plugin API migration; check local displayed version markers and actual plugin loading after restart/refresh, with optional backup cleanup only after successful verification. Keep this no-code-change conclusion specific to the supplied tags.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [execute-inside-target] ceiling=20 The agent’s final plan executes or retries the global upgrade from a session/tool worker on the target host, or runs the upgrade while that host is still live. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [manual-shim-repair] ceiling=40 The final fix substitutes manual directory swaps or handmade shims for the formal external pinned installation. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S16-self-host-upgrade-trap/S16-self-host-upgrade-trap-report.md

# S16 · The Self-Host Upgrade Trap — Incident Analysis and Repair Protocol

**Subject:** an agent running *inside* a dsh web session executed a global npm install of
`@deepseek-ai/dsh@0.1.2-rc.1`, killing its own host mid-install and leaving the machine with
no working `dsh` command.

**Evidence used (read-only fixture, unchanged):** `fixture/README.md`,
`fixture/agent-session-log.txt`, `fixture/env-state.txt`, `fixture/repair-notes.md`.

**Verdict in one line:** this was not a flaky install — it was a self-referential kill. The
agent was a child of the artifact it replaced, so the only process able to report the outcome
was destroyed by the operation it was reporting on. The correct action was a structural refusal
plus an external, user-executed procedure; hand-swapping directories afterwards converted a
clean breakage into an ambiguous one, and only a real registry install could restore the
generated artifacts that were actually missing.

---

## 1. Structural root cause: why the in-session global upgrade fails by construction

### 1.1 The process topology (the thing the agent did not model)

The session was hosted **by the package it was upgrading**. Concretely:

| Actor | What it actually is | Fate during the install |
|---|---|---|
| Browser tab at 127.0.0.1:3080 | a *view*: WebSocket/HTTP client only | survives; merely loses the connection |
| dsh web host | a `node` process executing code from `@deepseek-ai/dsh/... (under node_modules)` | **dies first** |
| session / agent loop | in-memory state inside that host process | dies with the host |
| tool worker (the `pwsh` call) | a child/worker **spawned by that same host** | dies with the host |
| session journal / tool-result writer | code inside that same host | dies with the host; never writes the result |
| `npm` installer | the only process that also survives, and it is *not* the observer | completes or aborts against a dead tree |

The critical asymmetry: **every participant that could have observed, recorded, or delivered
the tool result lives inside the process that the upgrade replaces.** The client tab is the sole
survivor, and the client is not the recorder — it only displays what the host pushes to it.

The agent could have discovered this from information it already had: its own host is visible
in its own process tree and in the GUI's launch line (a `node .../node_modules/@deepseek-ai/dsh/...`
path, quoted verbatim in `agent-session-log.txt` lines 2–3). The self-relationship was
*inspectable*, not hidden.

### 1.2 Why "self-upgrade" is a structural failure, not a probabilistic one

`npm install -g <pkg>` is not an atomic directory swap. The log shows the real
sequence (`agent-session-log.txt` lines 9–12):

1. `npm warn cleaning node_modules/@deepseek-ai/dsh` — begin clearing the existing tree
2. `npm info remove @deepseek-ai/dsh` — **the live code path is deleted/replaced**
3. `npm info fetch @deepseek-ai/dsh@0.1.2-rc.1` — download to cache
4. `npm info linkStuff @deepseek-ai/dsh@0.1.2-rc.1` — unpack into place, then generate bin shims

Steps 1–2 are destructive against a directory the host process is executing from. A running
`node` process has already-loaded modules resident in memory, but it does **not** have a
snapshot of its own code base. Any of the following, occurring at any time after step 2, resolves
into a tree that is gone or half-replaced:

- a lazy `require()` / dynamic `import()` of a not-yet-loaded module,
- reading a JSON/asset/sourcemap/schema file from the package directory,
- a `spawn` of a helper script or a nested `node` entry inside the package,
- on Windows, any held file handle: the cleaner then hits EBUSY/EPERM and leaves a
  **partially deleted** tree rather than a clean one.

So the outcome set is: (a) host crashes on a vanished dependency; or (b) the cleaner half-fails
and leaves a chimera tree while the host runs on with stale handles; or (c) the install
"succeeds" and the host is still executing **alpha.5 in memory against an rc.1 tree on disk**.
Branch (c) is also a failure: a split-brain version skew between running code and installed code,
which must be resolved by a restart anyway. **There is no branch whose terminal state is "install
finished and my session is healthy."** That is what makes it structural.

Retrying, raising the timeout, adding `--force`, or backgrounding the command changes
nothing: the 600000 ms timeout in the log is irrelevant because the process is **dead, not slow**.
A timeout bounds duration; it cannot bound a self-kill.

### 1.3 What died first, and why the tool call never returned a result

What died first was the **host `node` process** — between log lines 12 and 14, i.e. inside
the `linkStuff` window, after the old tree had been removed. The browser's "connection lost" is
a *symptom* observed by the last surviving actor, not the failure itself.

The tool call returned no result because a tool result is not durable until **all three** of the
following happen:

1. the worker process finishes the command and exits,
2. the host receives that exit and **persists** the captured stdout/stderr/exit code into the
   session journal,
3. the host pushes the result over the WebSocket to the client.

All three are housed in the process being killed. The call was written down *before* execution
(hence it appears in the log) and the result was to be written *after* — the window in which the
host is destroyed is exactly the window in which the record would have been made. The log's
signature is therefore precise and diagnostic (`agent-session-log.txt` lines 17–18):
**call recorded, no result durably recorded, outcome unknown.** That is the fingerprint of an
interrupted self-hosted tool call, and it is categorically different from "npm exited non-zero."
npm was doing its job correctly; the *caller* was deleted.

Consequence worth stating explicitly: the interrupted call's outcome is genuinely **unknown**
and must be reported as unknown. It cannot be reconstructed from inside, and nothing in the
evidence pack establishes whether npm finished or aborted.

---

## 2. The broken state afterwards: content present, command gone

### 2.1 `dsh` is a *generated shim*, not the package

On Windows, a global npm install produces **two independent artifacts** in the npm prefix
(the AppData roaming npm folder, %APPDATA%\npm):

- **artifact A — the package tree:** node_modules/@deepseek-ai/dsh/
- **artifact B — the launcher shims:** `dsh` (sh/extensionless), `dsh.cmd`, `dsh.ps1`,
  each a tiny generated launcher that invokes `node` on an entry script derived from the
  package's bin map.

Only **B** is on PATH. The string `dsh` that the user types resolves to a text file in the
prefix, which then points at A. Therefore "the package is present" and "the command exists" are
**independent facts**, and the `env-state.txt` AFTER block (lines 12–15) states exactly the
combination where A is present and B is not.

### 2.2 The interrupted-install signature

npm's bin-linking phase (log line 12) is where shims are deleted and re-created. The crash landed
**inside** that phase, which explains the precise per-shim state in `env-state.txt`:

- `dsh.cmd` — **missing** (old one removed, new one never written)
- `dsh` (extensionless) — **missing** (same)
- `dsh.ps1` — **present but stale, pointing into the old tree**

A *stale but present* `.ps1` alongside *absent* `.cmd`/extensionless shims is a half-run
bin-link phase — not a corrupt package, and not an antivirus event. It is the single most
diagnostic line in the pack: had the install failed at fetch, all three shims would still be the
old (working alpha.5) ones; had it completed, all three would be new. Missing-plus-stale means
**the metadata upgrade ran and the shim regeneration did not finish.**

### 2.3 The partial manual repair made the state ambiguous

`env-state.txt` lines 12–14 record a hand-placed copy of rc.1 files into the package directory
before the external repair. That produced "rc.1 content, non-standard install": a tree that
*looks* upgraded and is *not* a valid install. Why hand-swapping or hand-patching the directory
is the wrong move:

1. **Shims cannot be hand-authored correctly.** They are *generated* from the package's bin field
   and its resolved path. Hand-writing a `.cmd`, a `.ps1` and an extensionless script means
   authoring three files that must agree with each other, with PATHEXT resolution order, and with
   an interpreter path. Any disagreement produces the worst debugging class: "works in one shell,
   not another," or "runs a different dsh than you think."
2. **It desynchronises the tree from npm's bookkeeping.** node_modules content is a *recorded
   artifact*, not a bag of files: the prefix package-lock.json and node_modules/.package-lock.json
   carry version + resolved URL + integrity hash. Hand-patching the tree while metadata still says
   alpha.5 makes the declared state lie about the actual state. The next `npm install -g`,
   `npm update`, `npm ls` or `npm prune` computes a diff from a false baseline and
   "reconciles" by deleting or replacing the hand-placed files — **re-breaking the CLI, now
   mid-operation and without warning.**
3. **A partial copy can leave a chimera tree.** The cleaner (steps 1–2) may not have emptied the
   directory before the crash; hand-copying on top of the remainder mixes alpha.5 and rc.1 modules.
   package.json then reports one version while some modules are the other. Failures from that state
   surface as apparent *product* bugs, sending the next debugger into the wrong layer entirely.
4. **It destroys the evidence needed to diagnose.** The clean broken state had one obvious reading
   ("install interrupted during bin-link"); the hand-modified state has several, and the repair
   must now reason about two mutations instead of one.
5. **It has no verification step.** A hand repair can only be judged by trying something else and
   watching it fail. There is no equivalent of `dsh --version` that checks *the repair itself*, so
   "looks fixed" and "is fixed" become indistinguishable until the next incident.
6. **The dsh-old-* directories are npm residue, not a rollback mechanism.** They are not
   load-bearing and are not in any lockfile. Hand-promoting one back into place creates an
   un-integrity-checked tree; hand-deleting them first removes state npm would otherwise use.
   Worse, a backup directory named `@deepseek-ai/dsh-old-0.1.1-rc.1` sitting inside
   node_modules/@deepseek-ai/ is resolvable as a real package name and can be swept up by a
   workspace scan or by a loosely-spelled resolution path — producing a second plausible-looking
   dsh on disk.
7. **Windows handle contamination.** Any process still holding the old tree open (an orphaned
   worker, an editor, an AV scanner) makes hand deletes half-fail, leaving EPERM debris that the
   formal install then has to clean up too.

Net effect: hand repair can at best produce a directory that *resembles* a correct install, at the
cost of the clean, single-cause diagnosis that made the real fix obvious.

### 2.4 Why the machine needed an external tool at all

`env-state.txt` lines 16–17 state the closed loop: the dsh CLI is unusable, so no dsh session
exists to host an agent, so the repair must come from a different, non-dsh CLI (or a plain shell).
The trap is self-sealing — the tool that would have fixed it is the tool that is broken.

---

## 3. The repair: what was actually done and why that form works

### 3.1 The repair applied

Per `repair-notes.md` lines 9–13, from a **new external session outside dsh**:

1. **Re-ran the formal install from the registry:**
   `npm install -g @deepseek-ai/dsh@0.1.2-rc.1`
   → `dsh` / `dsh.cmd` / `dsh.ps1` all regenerated; `dsh --version` → `0.1.2-rc.1`.
2. **Aligned the source checkout** (the workspace used as host-source reference) from the alpha.5
   tag to the `dsh-v0.1.2-rc.1` tag; no local-modification conflicts.

### 3.2 Why this works where the in-session attempt could not

Four independent reasons, in order of importance:

1. **The caller is not the subject.** The executing process (npm) and the observing shell are
   *not hosted by* `@deepseek-ai/dsh`. Nothing the install mutates is load-bearing for the
   process performing the install. This — not any flag, version pin, or timeout — is the
   structural inversion. The identical command that was fatal from inside is safe from outside
   **because of who is running it.**
2. **It regenerates the artifact that was actually missing.** The failure's real product was not
   "wrong files" but "no shims." Only npm's bin-linking can author artifact B correctly from the
   package's bin map, with the right interpreter path and the right three-file set. Hand repair
   structurally cannot do this (§2.3.1) — so no amount of manual skill substitutes.
3. **It normalises the metadata/tree pair.** A registry install replaces the hand-modified
   directory with an integrity-checked extract and writes truthful lock/metadata state. The
   "non-standard install" is **replaced**, not layered over — which is precisely why the prior
   hand edits did not need to be (and must not be) manually unwound first. npm's own
   reconciliation does that correctly.
4. **It is convergent/idempotent.** `npm install -g <pkg>@<exact-version>` is the standard way to
   re-link bins; re-running it against an equivalent state is a safe converge-to-target, not a
   compounding mutation. This makes it safe to retry, which is exactly what an
   unknown-outcome situation (§1.3) requires.

### 3.3 How the result is verified

Verification must check **both artifacts** and the *functional* path, in this order:

1. **`dsh --version` → `0.1.2-rc.1`** — a single check that proves B (the shim resolves) *and*
   A (the resolved tree is rc.1) simultaneously. This is the highest-value assertion in the whole
   repair: the failure mode was "A present, B absent," so a version answer proves the pair.
2. **Shim set complete:** all three of `dsh`, `dsh.cmd`, `dsh.ps1` exist in the npm prefix;
   `where.exe dsh` / `Get-Command dsh -All` resolves only to that prefix — no shadowing copy
   from a source checkout, a dsh-old-* directory, or a second package manager. No `.ps1` still
   pointing into a removed tree.
3. **Standard-install integrity:** `npm ls -g --depth=0` lists `@deepseek-ai/dsh@0.1.2-rc.1`;
   `npm ls -g @deepseek-ai/dsh` reports no invalid / extraneous / UNMET — i.e. no residue from
   the hand repair.
4. **Source/host parity:** the reference checkout sits on tag `dsh-v0.1.2-rc.1` and reports the
   same version. This matters because the checkout is the *source of truth used when debugging the
   host*; if it stays on alpha.5, every future source-level argument is made against the wrong code.
5. **Functional end-to-end:** `dsh web` / `dsh --profile web` starts and serves
   http://127.0.0.1:3080; **hard-refresh** the browser (a soft reload can pair a cached old client
   bundle with the new host), then confirm plugins load (whale / progress, per `repair-notes.md`
   lines 19–22). This is the check that actually closes the incident, because the incident was
   *observed as* a GUI death — only a GUI that comes back proves the repair.
6. Note that steps 2 and 5 are the ones `repair-notes.md` explicitly leaves to the user; the
   notes verify steps 1 and 4 and leave the human-facing end-to-end confirmation open. That gap
   should be closed before the incident is declared resolved.

---

## 4. The protocol the agent should have followed instead

### 4.1 What it should have recognised about itself

Before any mutating command, the agent should have classified the **target against its own host**:

- "Am I, my tool worker, and my session journal all **hosted by** the artifact this command
  replaces?" Here: **yes** — host executable path under node_modules/@deepseek-ai/dsh/, worker
  spawned by it, journal written by it.
- Consequently this is **self-modification of the running runtime**, a *structural* failure class,
  not an operation that can be retried, forced, backgrounded, or timed out.
- Consequently even a *successful* install leaves the running host on the old code in memory — a
  restart is mandatory — so **there is no in-session success path at all.**
- Consequently the tool result cannot be trusted to exist: the reporter dies with the subject. A
  missing result here is not "npm was slow."

This reasoning needs no privilege and no out-of-band knowledge: the host path is in the agent's
own process tree and in its own GUI launch line.

### 4.2 Should it execute the global install? No.

Hard boundary: **the agent must not run the global install against its own runtime.** It should do
the analysis, produce the exact external procedure, and hand it to the user to run in a shell that
is not a descendant of the dsh host.

Two anti-patterns to name explicitly, because both are the natural "helpful" reflex:

- **Asking for confirmation is not the fix.** The user might well say yes — the user's mental model
  of "run npm on my machine" does not include "kill your own server." Consent does not fix a
  structurally impossible operation; the refusal must be about the structure, not about permission.
- **"Do it in the background so I survive" is not the fix either.** The cleaner still deletes the
  live tree; backgrounding merely removes the last witness.

### 4.3 The exact external procedure to hand the user (order matters)

**Phase 0 — before npm runs (this is the part that makes the install survivable)**

0.1. **Constraint statement.** This must run in a terminal that is **not** a dsh session and
     **not** a child of the dsh host process. Exit the dsh web session; **quit the dsh host
     entirely** so nothing holds handles into the tree. (A live process with the tree open is what
     converts a clean replace into EBUSY/EPERM half-deletion on Windows — the exact mechanism of
     §1.2.)
0.2. **Confirm it is really down:** no `node .../node_modules/@deepseek-ai/dsh/...` process
     remains, and nothing is listening on 3080.
0.3. **Record the before-state** so the result is verifiable: `dsh --version`, `where.exe dsh`,
     `npm ls -g --depth=0`, and the list of shim filenames in the npm prefix. This baseline is
     what proves the repair later (§3.3).
0.4. **Fix the rollback target now, not later:** the previous known-good is `0.1.2-alpha.5`, so
     rollback is `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`. Do **not** use directory
     copying/moving as the backup strategy (§2.3); if extra insurance is wanted, copy the prefix
     aside **while dsh is fully stopped**.
0.5. **Check PATH ordering:** the npm global prefix must be on PATH and **ahead of** any other dsh
     copy (source checkout, dsh-old-*, a second package manager's shim). Otherwise a "repaired"
     install still resolves to a stale launcher.

**Phase 1 — the install command, and why it must look exactly like that**

    npm install -g @deepseek-ai/dsh@0.1.2-rc.1

Every element is load-bearing:

| Element | Why it must be there |
|---|---|
| exact version `0.1.2-rc.1` | `latest` / dist-tags will **not** select a prerelease, and a floating range may land elsewhere. The goal is to reproduce a known, named artifact. |
| `-g` | The failure was about the **global prefix's shims being on PATH**. A local install would create no `dsh` command at all. |
| full scoped name `@deepseek-ai/dsh` | Unambiguous resolution; avoids picking up dsh-old-* residue. |
| **from the registry** (no local path, no tarball, no hand-assembled dir) | Only a registry install gives integrity-checked content **plus** npm-generated bin links. |
| **no** `--ignore-scripts` / `--no-bin-links` / omit shortcuts | These would reproduce the exact "content but no shims" state — i.e. re-create the incident. |
| **no** `--force` by default | Only if npm reports a concrete conflict, and only with the user accepting the consequence. |
| **foreground, one command, watched** | Run in the *user's own* terminal so the exit code and full output are visible to the user — the agent cannot be the observer here (§1.3). Do not background it inside any agent session. |

Then, **as a separate step after npm exits 0**: start dsh again (`dsh web` /
`dsh --profile web`) and **hard-refresh** the browser tab. Restart is not optional bookkeeping
— it is how the running host stops being alpha.5 (§1.2, branch c).

**Phase 2 — verification.** Run the full checklist in §5.2 before declaring the incident closed.

### 4.4 Which parts are known upgrade rules, and which are new for this incident

**Already standard upgrade discipline (would have applied to any service, any package):**

- Pin the exact version; install from the authoritative registry.
- **Stop the service before replacing its files**; never overwrite a running process's code.
- **Restart afterwards**, then re-verify version *and* functionality.
- Record a before-state and keep a rollback target.
- Never hand-edit inside node_modules/vendor trees; let the package manager own generated artifacts.
- Verify with a real check (`--version`, functional smoke), not just "exit code 0."
- A missing tool result means **unknown outcome**, not "probably fine."

**New, specific to this incident (the genuinely hard-won parts):**

- **The agent-relative rule itself:** an agent must compare the upgrade target against **its own
  host process** and refuse when the target is (or contains) its own runtime. This is
  agent-discipline, not package-management knowledge — no npm documentation contains it.
- **The external-handoff form:** the procedure must *name the required caller*, i.e. "a shell that
  is not a child of the dsh host," plus "quit the host first," plus the recognition that **the GUI
  dying is the expected signal** because the observer is inside the observed.
- **The Windows shim-trio diagnostic:** that `dsh` / `dsh.cmd` / `dsh.ps1` *are* "the dsh
  command," and that **missing `.cmd` + stale `.ps1` = interrupted bin-link phase** (§2.2). This
  is the signature that turns "dsh is gone" into a precise diagnosis.
- **dsh-old-* handling:** recognise them as npm residue, never hand-promote or hand-delete them,
  and expect them to be resolvable as real packages (§2.3.6).
- **For this version pair specifically:** alpha.5 → rc.1 is 252 files, **all** package.json version
  bumps, **zero** API/feature changes (`repair-notes.md` lines 16–17). So a plugin
  **re-migration** step is *not* required after this upgrade — but the runtime load check still is.

---

## 5. Prevention

### 5.1 Agent-side guard against this failure class

The guard must be **preventive**, because the failure destroys the reporter — you cannot detect it
from inside, and a post-hoc error handler will never run. Minimum viable design:

1. **Target classification (resolve, don't string-match).** Resolve the npm global prefix
   (`npm prefix -g` / `npm root -g`) and compare the command's target against: (a) the global
   prefix, (b) the running host's own install root (derivable from process.execPath and the parent
   process command line), (c) the current implementation checkout path. If the target is inside any
   of them → **self-upgrade**.
2. **Command-shape deny rules.** Block, from inside a session:
   - `npm|pnpm|yarn (install|update|uninstall|link|rebuild)` that touch the global prefix (`-g`,
     or an explicit path under it);
   - any delete / move / rename inside the global prefix or the running package tree;
   - any process kill / service stop / restart targeting the session's **own** process or its
     ancestors.
3. **Cheap and deterministic.** The check is a path comparison plus a small pattern set — it must
   not depend on network, registry metadata, or user confirmation. It must fire *before* the tool
   call is dispatched.
4. **Refusal must ship the deliverable.** When the guard fires, it should emit the §4.3 procedure
   pre-filled (exact version, verification commands, rollback command). **A guard that only says
   "I can't" is a worse user outcome than the crash.** The refusal is a handoff, not a wall.
5. **Do not rely on timeouts or retries.** The 600000 ms timeout in the log did nothing. Timeouts
   cover *slow*; they cannot cover *dead*.
6. **Harness-level hardening (for the diagnostic blind spot, not the crash).** Put the tool-result
   recorder somewhere that is not inside the mutable tree (external supervisor / append-only
   journal on a separate path), so an interrupted call always leaves a durable, explicitly
   unknown/interrupted record rather than silence. The log already does this partially (lines
   17–18) — that behaviour should be a guarantee, not a fortunate accident.
7. **Encode the boundary as documentation.** Make "never self-upgrade the running runtime; hand off
   instead" a first-class, named rule, so it is recalled rather than re-derived under time
   pressure — and so it holds even when the user says "just do it."

### 5.2 Post-upgrade checklist for this machine

Derived from the repair notes' alpha.5 → rc.1 findings; run in order, do not skip 3, 6 or 7:

1. **Ordering respected:** host was fully down during the install; new host started only after npm
   exited 0.
2. **`dsh --version` → `0.1.2-rc.1`** (proves shim *and* tree together).
3. **Shim integrity:** `dsh`, `dsh.cmd`, `dsh.ps1` all present in the npm prefix;
   `where.exe dsh` / `Get-Command dsh -All` shows only that prefix; no stale `.ps1` aimed at a
   removed tree; no shadowing copy from a checkout or dsh-old-*.
4. **Install integrity:** `npm ls -g --depth=0` → `@deepseek-ai/dsh@0.1.2-rc.1`;
   `npm ls -g @deepseek-ai/dsh` reports no invalid / extraneous / UNMET (no residue from the
   earlier hand repair).
5. **Source/host parity:** reference checkout on tag `dsh-v0.1.2-rc.1` and reporting the same
   version, so source-level debugging matches the installed runtime.
6. **Functional smoke:** `dsh web` starts, serves 127.0.0.1:3080, **hard refresh** the browser,
   GUI loads.
7. **Plugins:** whale / progress load and behave. Because alpha.5 → rc.1 is 252 files of pure
   package.json version bumps with **zero** API/feature changes, **no plugin re-migration is
   needed** — so any plugin failure here is a *config/environment* problem, **not** a migration
   gap. Do not spend time on a migration audit; do spend it on the load check.
8. **Backup hygiene:** leave dsh-old-* alone until rc.1 is confirmed good, then optionally remove
   them. **Never hand-promote one back into place** — rollback is
   `npm install -g @deepseek-ai/dsh@0.1.2-alpha.5`, run externally like any other install.
9. **Rollback readiness recorded:** the exact rollback command, plus the note that it too must run
   from outside a dsh session.
10. **Close the loop honestly:** state that the interrupted in-session tool call's outcome is
    **unknown** (§1.3) and that any session state in flight at the crash is unrecoverable. Do not
    present a reconstructed outcome as fact.

---

## 6. Summary table

| Question | Answer |
|---|---|
| Root cause class | Self-referential: the observer, the executor and the recorder were all hosted by the artifact being replaced. Structural, not flaky. |
| What died first | The dsh host node process, inside the clean/remove → linkStuff window. |
| Why no tool result | Result durability required the host to persist and push it; the host was the thing being killed. The outcome is genuinely unknown. |
| Why dsh vanished | `dsh` is a *generated shim* (artifact B) in the npm prefix, distinct from the package tree (artifact A). The crash landed inside bin-linking: `.cmd` and extensionless missing, `.ps1` stale. |
| Why hand-repair worsens it | Shims are generated, not authored; hand-patching desyncs tree from lockfile integrity, invites npm to reconcile destructively, can leave a chimera tree, and removes all verification. |
| Why the applied repair worked | It ran *outside* the subject, regenerated the missing generated artifact, and normalised the metadata/tree pair — idempotently. |
| Verification | `dsh --version` (shim + tree), shim trio present and unshadowed, `npm ls -g` clean, checkout tag aligned, `dsh web` + hard refresh + plugin load. |
| Correct agent behaviour | Refuse to execute (a structural boundary, not a permission one); hand the user the external procedure: host down → baseline → rollback target → PATH check → exact pinned global registry install → restart → verify. |
| Known vs new | Known: stop-before-replace, exact pin, registry install, restart, verify, rollback. New: the agent-relative self-host rule, the caller-qualified handoff, the Windows shim-trio signature, dsh-old-* hygiene, and "no plugin re-migration needed for alpha.5→rc.1." |
| Prevention | Pre-dispatch target-classification guard with command-shape rules that *ships the handoff*; external/durable tool-result journal; and the machine checklist in §5.2. |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.