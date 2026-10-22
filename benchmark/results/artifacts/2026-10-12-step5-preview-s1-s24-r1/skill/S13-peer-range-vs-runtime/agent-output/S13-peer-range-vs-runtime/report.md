# S13 · Peer Range vs Runtime Reality — Read-Only Diagnosis

**Subject**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed on dsh `0.1.2-alpha.5`
**Mode**: A · inspect (read-only). No fixture, skill, or host files were modified; nothing was installed or executed.
**Evidence**: `npm-install-output.txt`, `crash-stack.txt`, `plugin-source-excerpt.js`, `dsh-changelog-excerpt.md` (fixture, read-only)
**Skill cards cited** (all under `skills/plugin-upgrade/`: `references/v0.1.2-alpha.4.md` → DSH-0.1.2-A4-03 / DSH-0.1.2-A4-04; `references/rollup-0.1.2.md` → R-01, R-02, R-03, R-04, R-06, R-08; `references/precision-checklist.md`; `references/pre-flight.md`; `references/v0.1.2-alpha.5.md`; `references/troubleshooting.md`; `scripts/README.md`; `SKILL.md`)

---

## 1. The exact runtime incompatibility

**Removed API**: the `Session.events` property — the eagerly materialized events array/getter on a `Session` object.
**When**: dsh **0.1.2-alpha.4** (tag `4e84901e64`, 2026-09-01). Still absent at 0.1.2-alpha.5 (tag `db6bdc3576`); alpha.5 changed only the storage layer, so the removal stands at the installed host.
**What replaced it** (on-demand read APIs):

| Old (≤ alpha.3) | New (≥ alpha.4) |
|---|---|
| `session.events.length` | `session.seq` (current log length, a `SessionLogOffset`) |
| `session.events[i]` | `session.eventAt(SessionSeq(i))` (returns one accepted, deeply frozen event) |
| `session.events` (whole log) | `session.snapshotEvents()` (cached frozen snapshot of a range) |
| `session.events.slice(a, b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| "events this session wrote itself" | `session.ownEvents()` |

**Changelog entry (fixture, `dsh-changelog-excerpt.md`, verbatim)**:

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility. (@kermanx)
> — *dsh-v0.1.2-alpha.4 release notes, "Other Changes"*

Governing skill card: **DSH-0.1.2-A4-03** ("`Session.events` is removed; read the log through `seq` / `eventAt()` / `snapshotEvents()` / `ownEvents()`"), breaking, `required-if-hit`, touchpoints #2 (persistent events) and #3 (Remote `history` requests). Companion breaking card **DSH-0.1.2-A4-04** adds that `SessionSeq` / `SessionLogOffset` are now branded numbers with validating constructors (`SessionSeq(n)` / `SessionLogOffset(n)` throw `TypeError` on anything but a non-negative safe integer), so a migrated read site is `session.eventAt(SessionSeq(i))`, not `session.eventAt(i)`.

**How the crash follows from that removal** (fixture, `crash-stack.txt`):

```
Error: dsh: plugin tree failed to load: failed to apply loader entry dsh-tui
TypeError: events is not iterable
    at prepareReplayEvents (channel.js:623:25)
    at replayEvents (channel.js:6127:33)
    at createChannel (channel.js:6685:5)
    at apply (plugin.js:425:21)
    at async Fiber._reload (cordis/lib/index.js:1355:5)
```

`plugin-source-excerpt.js` shows the read sites: `const events = liveAgent.session.events` (line 734) fed into `replayEvents(...)` (line 6685), plus `session.events.at(-1)` (line 657), `const events = agent.session.events` (line 2685), `const liveEvents = liveSession.events` (line 3004), and ~42 `.events` references on session objects in total. The property is gone, so each read yields `undefined`; the first one that is iterated/spread (`prepareReplayEvents`, line 623) throws `TypeError: events is not iterable`. Note the attribution: every frame from the throw down to `apply (plugin.js:425)` is **the plugin's own code** — the host (`Fiber._reload`) is merely the loader reporting that the entry it was applying failed. This is a plugin-code break inside a satisfying peer range, not a host defect.

Note also the failure shape per A4-03: a TypeScript author would have been stopped by `tsc` ("Property 'events' does not exist on type 'Session'"); this plugin is plain JavaScript, so the read silently returned `undefined` and the miss surfaced only at runtime — at the worst possible moment, inside the loader's `apply`.

---

## 2. Why npm installed without a single peer warning

The install output (fixture) is internally consistent and worth reading precisely: 26 `@deepseek-ai/dsh-*` peers, all `^0.1.2-alpha.2`; the installed host bundles those packages at `0.1.2-alpha.5`; `0.1.2-alpha.5` satisfies `>=0.1.2-alpha.2 <0.2.0-0`; "npm's peer check passes silently."

**What npm actually did**: pure version-string arithmetic on `peerDependencies` metadata. It compared the declared *range* against the version numbers of the packages already in the tree. Nothing was imported, nothing was loaded, no module was resolved against the host's module table, no function was called, and no API surface — type-level or runtime — was ever compared. The peer check is a **static, package-metadata-level** gate. "No peer warnings" is therefore exactly what it looks like: it means *the version numbers intersected* and nothing more.

**What a peer range guarantees**

- That the consumer's declared minimum version number is numerically ≤ the version npm found in the tree.
- A *declaration of intent* about which host generation the author believes the package works with.
- Nothing else. It is not a test, not a proof of resolution, and not a statement about anything inside the version numbers.

**What `^0.1.2-alpha.2` does NOT guarantee**

1. **API stability inside the range.** A range is a set of version numbers, not a set of API surfaces. `Session.events` existed at the floor (alpha.2) and was deleted one patch later (alpha.4); the range admits both. Semver's compatibility promise is weakest precisely here: in `0.x` prerelease territory, breaking changes within `0.1.x` are not forbidden by the published version contract, and the changelog itself only warns "developers should pay attention to compatibility."
2. **That the author tested at or above the floor.** A floor left behind at an older cohort is the documented community failure mode — rollup **R-08** (peer-floor rewrite) treats "warning disappears" as the *landed signal* for a deliberate floor bump, and the escape hatch in **R-01** is "explicitly rewrite it to `^0.1.2-alpha.4`". A floor of `^0.1.2-alpha.2` on code written against alpha.2 tells you the author pinned the past, not the present.
3. **That the plugin loads, activates, or boots.** Peer satisfaction is silent about module-table entries (`missed the module table`, R-02/R-03), pending services (`waiting for service: apiProxy`), or whether the entry's `apply` even runs — all of which happen only at load time.
4. **That behavior is identical across the range.** Defaults moved inside the same range (alpha.4 enabled `web_fetch` in the base bundle, DSH-0.1.2-A4-06; dropped the general `workflow` tool from PTC, A4-05).
5. **A one-directional verdict.** Per **R-08**'s third pitfall, prerelease matching can also *refuse* a genuinely compatible host: `^0.1.0-rc.8` does not match `0.1.2-alpha.2` under npm semver's prerelease-tuple rules, regardless of real compatibility. The range is a crude instrument in both directions.

Corollary for the user's mental model: `alpha.5 > alpha.2` in semver ordering, and `alpha.5` is *inside* `^0.1.2-alpha.2` — both statements are true and both are irrelevant to whether `Session.events` exists. Ordering and containment are properties of version numbers; the deleted property is a property of *code at a tag*.

---

## 3. The fundamental principle

> **Peer-range satisfaction checks the version numbers.** **Runtime compatibility checks the behavior when the code actually executes against this host build.**

- *Peer-range satisfaction* — a static, metadata-level check: "do these two version strings intersect?" Performed by npm at install, on declarations, before any of the plugin's JavaScript is ever parsed by Node.
- *Runtime compatibility* — a behavioral, code-level reality: "does the code, when loaded and executed against this exact host build, find every property it reads, every function it calls, every module it requires, with the shape it expects — and get the semantics it assumes?" Verified only by typecheck against that tag's declarations, a real cold boot, and exercising one product path (SKILL.md "Validation and reporting", layers 1–5).

The same asymmetry is the documented reason the rollup insists on layered validation after every migration: **R-06** records that "#5120 proves 'all-green static gates ≠ runtime green'," and precision-checklist.md closes with "`OK` does not prove the inject graph is complete or that a plugin boots." Install-time silence is one more all-green static gate.

**Categories that pass peer validation and still crash (or fail silently) at runtime**

| # | Category | Real instance in this corridor |
|---|---|---|
| 1 | **Removed property / member on a surviving object** | `Session.events` removed at alpha.4 (DSH-0.1.2-A4-03) — *this case*: JS read returns `undefined`, first iteration throws |
| 2 | **Removed export / moved declaration ("static drift")** | R-11: `CallId` → `ToolCallId`, `settingsNamespace()` deleted, `dsh-client-runtime` unbundled — `tsc` fails in bulk while runtime may not break in sync |
| 3 | **Changed signature or type contract** | `ctx.commands.execute(agent, line, signal)` → `(agent, line, images, signal)`; branded `SessionSeq(n)` / `SessionLogOffset(n)` throwing on plain numbers; `seedLength` → `isSeeded` + `inheritedEventCount` (A4-04); tightened session-event payload validation (0.1.5-alpha.1) rejecting previously-accepted values |
| 4 | **Removed package / module-table gap** | A whole package gone while the version still matches: `dsh-client-runtime` (alpha.1), `dsh-tool-subagent-report` (A4-01), `@deepseek-ai/dsh-code-runtime-python` renamed (A4-02); prebuilt plugins hit `missed the module table` on a host that never resolved them (R-02/R-03) |
| 5 | **Service / activation topology** | A row `require: ['apiProxy']` stays `pending (waiting for service: apiProxy)` forever on a host that removed the transport layer — loads "fine", never activates |
| 6 | **Behavioral / default drift** | `web_fetch` enabled by default in the base bundle (A4-06); PTC preset drops the general `workflow` tool (A4-05) — no crash, different product behavior |
| 7 | **Silent lookup failure** | Locale rollout moved host copy to typed seats; plugins anchoring UI by displayed text stop matching, lookups return `null`, and injected items "disappear silently, with no error and no console exception" (R-13) |
| 8 | **Environment / platform reality** | `fs-ext` native build fails on Windows without MSVC (DSH-0.1.3-A1-03); `EBUSY` when a running host holds file locks during an in-place replacement — all invisible to a version-range check |

Even within category 1 the range is powerless: the *same* range admits the version where the property existed and the version where it did not.

---

## 4. What the plugin author should have done

### 4a. To catch this before publishing — test against the actual target version, not the range floor

1. **Pin the target cohort and typecheck against it.** The release notes announce the removal; the author's floor was `^0.1.2-alpha.2`, so the author almost certainly never compiled against alpha.4+ declarations. `tsc --noEmit` against `@deepseek-ai/dsh-session` at `dsh-v0.1.2-alpha.4` fails with "Property 'events' does not exist on type 'Session'" (A4-03 verification) — a 42-reference JS codebase with no typecheck lane had nothing to catch it. The documented cheap lane (R-01 "Verify-only, no install"): checkout the upstream tag and run `tsc --noEmit` with a `paths` mapping to the source — proves the type surface with zero installs.
2. **Read the corridor, not the range.** Build the `from → to` version corridor and read every breaking card in it ([DSH-0.1.2-A4-03] and A4-04 for alpha.4, plus A4-01/A4-02/A4-05/A4-06); or run the read-only planner `node skills/plugin-upgrade/scripts/plan-migration.mjs --root <repo> --from dsh-v0.1.2-alpha.3 --to dsh-v0.1.2-alpha.4` for a first-pass touchpoint/line inventory. A peer range hides all of this; the corridor states it.
3. **Cold-boot a real host before publishing** — SKILL.md layer 4: install the built tarball into an isolated scratch profile and boot it (the mount smoke: `pnpm build && pnpm pack` → pinned CLI installs the tarball into a fresh profile → keyless boot), or use the skill's `verify-runtime.mjs`, which reports failure attribution (plugin-code / dependency-resolution / profile-config / dsh-runtime) — exactly the attribution a crash like this one needs. For a plugin touching touchpoint #2 (persistent events), at least one full product path (replay the transcript) must run, not just load.
4. **Don't leave the floor behind.** Bump the peer floors to the cohort the code is actually written against as part of the release (R-08), and treat the disappearing `Issues with peer dependencies` warning as the landed signal — a *wrong-floor* install is silent, which is the opposite of a safety signal.
5. **Publish prereleases to a prerelease dist-tag** (R-04): an alpha-cohort-adapting version like `0.1.0-beta.4` belongs on the npm `alpha`/`next` tag, never `latest`, so stable-host users are not auto-upgraded into an incompatible peer set.

### 4b. To help users — encode what metadata can express; guard the rest at runtime

**What the peer range / `engines` should encode** (declarative, checkable by npm without running anything):

- The **minimum host version whose API the code is written against** — here `^0.1.2-alpha.4` (A4-03/A4-04-era surfaces), not the stale `^0.1.2-alpha.2`. This is the fix that converts the user's silent install into an explicit, actionable peer warning.
- The **upper bound** where the next breaking edge may land; for experimental packages, prefer an exact/`~` pin of the cohort rather than a caret (A4-02's recipe: "treat it as experimental … pin the exact cohort version rather than a caret range").
- **Completeness**: peers are a superset of everything touched, including type-only imports (precision-checklist.md, "Peers are a superset of inject").
- Corollary discipline: cite **R-01** whenever peer floors or the dependency cohort are touched at all.

**What metadata *cannot* encode — and therefore needs a runtime feature-detection guard:**

- Whether a specific member (`session.events`) or export exists *in this host build at run time*. Only the executing code can answer that. The dual-cohort probe pattern from R-02 is the canonical shape:

  ```ts
  const readLog = (session: any) =>
    typeof session?.snapshotEvents === 'function' ? session.snapshotEvents()
                                                   : session.events          // legacy hosts
  ```

  and for services the cordis proxy throws rather than returning `undefined`, so probe with try/catch:

  ```ts
  let presets
  try { presets = ctx.remote.agentPresets } catch { presets = undefined }
  const roster = presets ?? ctx.connection.api.agentPresets
  ```

- Host-plane composition differences → `!!js` probes in `cordis.patch.yml` (see `host-plane-probes.md`), keeping one artifact across cohorts.
- **The higher-order fix**: `session.events` is an *internal* surface (touchpoint #2). The verified plugin fleets in A4-03/A4-04 had **zero code changes** across alpha.2 → alpha.4 precisely because they stayed on public seams (`defineTool`, the Remote wire). An API the host may delete without notice is not something a peer range or a guard is meant to defend — the durable answer is to migrate the 42 read sites onto `seq` / `eventAt()` / `snapshotEvents()` / `ownEvents()` with `SessionSeq(...)` branding, and keep host-internal reads out of the plugin's steady-state contract.

---

## 5. What you can do RIGHT NOW, before installing anything

**The concrete pre-install check — compare the plugin's peer floor against your host's actual version and read the breaking changes in between, then prove it in a throwaway profile:**

```powershell
# 1) What does the plugin claim, and what is actually installed?
npm view @deepseek-harness-tui/dsh-tui version peerDependencies --json
dsh --version            # your host: 0.1.2-alpha.5

# 2) The check that matters: is the peer FLOOR below your host, and what broke
#    between the floor and your host? If floor < host, read the release notes
#    for every edge in between (here: the alpha.4 notes, "Other Changes":
#    "Replace Session.events with on-demand read APIs ... to reduce memory
#    overhead"). A floor far below your host is the warning sign, not the
#    absence of one.
```

```powershell
# 3) Prove it without touching your working setup: install into an ISOLATED
#    scratch profile and cold-boot it there (SKILL.md layer 4). A crash in the
#    scratch profile costs you nothing; a crash in your real profile is this
#    ticket. `--dry-run` is NOT a substitute -- it only resolves the tree, it
#    never executes the plugin.
```

Heuristics that follow from this ticket, in priority order:

1. **A peer floor materially below your host version is the red flag** — `^0.1.2-alpha.2` against a `0.1.2-alpha.5` host spans two breaking-bearing edges. Treat "install succeeded, no warnings" as *no information*, not as a green light.
2. **Prefer prerelease-tagged installs and read the dist-tag**: `npm view <pkg> dist-tags`; a `latest` that lags your host line (rollup R-01 measured `@deepseek-ai/dsh-*` sub-packages with `latest` stuck on `0.0.1-rc.1`/`0.1.0-rc.6`) is another "version numbers lie" signal.
3. **Never first-install into your working profile** — always an isolated scratch profile + cold boot + one product path.
4. **Scan for the removed APIs the corridor documents** (read-only planner): `node skills/plugin-upgrade/scripts/plan-migration.mjs --root <plugin-src> --from <floor-tag> --to dsh-v0.1.2-alpha.5`, or grep the source for the patterns named in the breaking cards (here: `\.events\b` on session objects, ~42 hits per `plugin-source-excerpt.js`).
5. **Glance at the stack trace's attribution** if it does crash: frames below `apply (plugin.js:425)` are the plugin's own code — that distinguishes "plugin needs a new version" (this case) from "host is broken / profile misconfigured" (where the frames are host-side).

**Immediate remedy for this ticket** (for the record, not executed — read-only report): ask the `@deepseek-harness-tui/dsh-tui` author for a build against `dsh-v0.1.2-alpha.4`+ with the 42 `.events` read sites migrated per DSH-0.1.2-A4-03/A4-04 and peer floors raised to `^0.1.2-alpha.4`; until then, either stay on a dsh ≤ 0.1.2-alpha.3 or keep the plugin disabled. Per the skill's safety boundaries, this is a recommendation only — no install, uninstall, version pin, or profile edit is performed here.

---

## Sources

- Fixture (read-only): `npm-install-output.txt` (26 peers at `^0.1.2-alpha.2`, host at `0.1.2-alpha.5`, `>=0.1.2-alpha.2 <0.2.0-0`, silent check), `crash-stack.txt` (`events is not iterable` at `channel.js:623` → `apply (plugin.js:425:21)`), `plugin-source-excerpt.js` (read sites at 657/734/2685/3004, ~42 total), `dsh-changelog-excerpt.md` (alpha.4 "Other Changes": `Session.events` → `seq`/`eventAt()`/`snapshotEvents()`; branded `SessionSeq`/`SessionLogOffset`).
- Skill: `references/v0.1.2-alpha.4.md` (DSH-0.1.2-A4-03 .. A4-06, incl. the field note that plugins on public seams needed zero changes across alpha.2 → alpha.4), `references/rollup-0.1.2.md` (R-01 peer-floor rewrite, R-02/R-03 cross-cohort probes, R-04 dist-tags, R-06 "all-green static gates ≠ runtime green", R-08 peer-floor prerelease semantics), `references/precision-checklist.md` (peers ⊇ inject; `OK` ≠ boots; citation contract), `references/pre-flight.md` (touchpoint #2; zero hits ≠ compatible), `references/v0.1.2-alpha.5.md` (no further session-API change on the installed edge), `SKILL.md` (Mode A; layered validation 1–5), `scripts/README.md` (`plan-migration.mjs` read-only planner, `verify-runtime.mjs` attribution), `references/troubleshooting.md` (symptom → card lookup).
