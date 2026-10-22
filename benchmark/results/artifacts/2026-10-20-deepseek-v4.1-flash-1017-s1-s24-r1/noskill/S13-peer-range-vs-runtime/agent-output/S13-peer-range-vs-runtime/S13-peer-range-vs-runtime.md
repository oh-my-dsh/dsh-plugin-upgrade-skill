# S13 · Peer Range vs Runtime Reality

**Subject:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` on `@deepseek-ai/dsh@0.1.2-alpha.5`
**Mode:** read-only static analysis of the evidence pack in `fixture/`. No installs, no network, no execution of the plugin, fixture untouched.
**Evidence used:** `fixture/npm-install-output.txt`, `fixture/crash-stack.txt`, `fixture/plugin-source-excerpt.js`, `fixture/dsh-changelog-excerpt.md`, `fixture/README.md`.

---

## 0. Executive answer (one line per question)

1. **What broke, when, replaced by what:** dsh **removed `Session.events`** (the eagerly materialized events array) in **v0.1.2-alpha.4** and replaced it with on-demand read APIs — `session.seq`, `session.eventAt(i)`, `session.snapshotEvents()`. The plugin still does `agent.session.events` → `undefined` → `for…of`/`Array.from` → `TypeError: events is not iterable`.
2. **Why npm was silent:** `^0.1.2-alpha.2` is a **pure numeric predicate** (`>=0.1.2-alpha.2 <0.2.0-0`). alpha.5's version *string* falls inside it, so the metadata check passes. It says nothing about whether any symbol, shape, or behavior still exists — and for **prerelease** versions semver makes no compatibility promise whatsoever.
3. **The principle:** peer-range satisfaction checks **declared intent against version numbers (static metadata)**; runtime compatibility checks **the actual symbols, shapes, and behaviour of the loaded code (dynamic reality)**. Breakage classes that pass the first and crash in the second: symbol removal/rename, value-shape/type change, semantic/lifecycle change, loader/manifest contract change, duplicate-instance/identity failure.
4. **Author's fix:** test the plugin **against the real host at every version the range admits** (matrix CI on alpha.2 → alpha.5 → latest, startup smoke test, changelog watch); make the peer range encode **only the band actually tested** (for a prerelease host: narrow, e.g. `>=0.1.2-alpha.2 <0.1.2-alpha.4`, or exact pin); use `engines` for **Node/platform**, not for dsh API compatibility; and put a **runtime capability probe** (feature detection with a version-agnostic error) in front of `Session.events`.
5. **User's pre-install check:** don't infer compatibility from the range — **probe the installed host for the API the plugin uses, in a throwaway prefix, before touching the real tree**:
   `npm i --prefix ./.probe @deepseek-ai/dsh@<your exact version> @deepseek-harness-tui/dsh-tui@<ver> && ./.probe/node_modules/.bin/dsh-tui --version`
   plus `npm view @deepseek-harness-tui/dsh-tui peerDependencies time` and a `grep` of the tarball for `\.events`. Details in §5.

---

## 1. The exact runtime incompatibility

### 1.1 What was removed

`Session.events` — the **eagerly materialized array** of a session's event log, held as a plain array on the session object and read directly by consumers (`.length`, `.at(-1)`, iteration, `map`).

### 1.2 When

**dsh `v0.1.2-alpha.4`**, under *Other Changes* in the release notes (fixture: `dsh-changelog-excerpt.md`). Two entries in the same release matter:

| Changelog entry (paraphrase, card: `dsh-changelog-excerpt.md`) | Consequence for plugin authors |
|---|---|
| **"Replace `Session.events` with on-demand read APIs: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions."** Marked *"Developers should pay attention to compatibility."* | `session.events` no longer exists. Any read must go through the new accessors; the array is no longer a stable public surface. |
| **"Distinguish `SessionSeq` and `SessionLogOffset` with strong types."** Same *"pay attention to compatibility"* marker. | A nominal-type split in the same release: values that used to be interchangeable sequence numbers are now distinct kinds. A plugin that persisted or compared raw indices across the boundary can be silently wrong even after the `.events` fix. |

The changelog's own phrasing — *"the eagerly materialized events array is removed"* — is the removal notice. It is the **only** channel that announced the break, and npm does not read changelogs.

### 1.3 What replaced it

| Old (≤ alpha.3) | New (alpha.4+) | Semantics |
|---|---|---|
| `session.events` (array, always materialized) | `session.seq` | Current sequence/position of the log — a *cursor*, not a collection. |
| `session.events[i]` | `session.eventAt(i)` | Random access, materialized on demand. |
| `session.events`, `events.length`, `events.at(-1)`, spread/iterate | `session.snapshotEvents()` | Point-in-time array **copy** for replay/transcript use; must be *called*, and the call is a snapshot with its own consistency window. |
| — (implicit integer indices) | strong `SessionSeq` / `SessionLogOffset` types | Prevents accidental index/offset mixing. |

Architectural note: this is a **lazy/streaming redesign**, not a rename. `snapshotEvents()` is a function call that allocates a copy, so a naive mechanical rewrite (`session.events` → `session.snapshotEvents()`) can also change performance characteristics and the freshness of what a long-lived subscriber sees. The adapter must decide *when* to snapshot, not just *how to spell* the call.

### 1.4 Failure mechanism (why the message is so unhelpful)

Chain, reconstructed from `crash-stack.txt` + `plugin-source-excerpt.js`:

1. `dsh-tui` starts; the host loads the plugin tree and calls the loader entry's `apply` (`plugin.js:425`), inside a Cordis fiber reload (`cordis/lib/index.js:1355`).
2. `apply` calls the plugin's `createChannel(ctx, initialAgent, options)`.
3. `channel.js:734`: `const events = liveAgent.session.events;` — on alpha.4/5 this property **does not exist**, so it evaluates to `undefined`. No error is raised here: reading a missing property off a live object is legal JavaScript.
4. The value flows into `replayEvents(agent.session.events)` (`channel.js:6685` region, which is `createChannel` as reported by the stack — the excerpt's line numbers are approximate/overlapping, treat them as *areas* not exact anchors) → `prepareReplayEvents` (`channel.js:623`).
5. `prepareReplayEvents` iterates the value (`for…of`, spread, or `Array.from`). `undefined` is not iterable → `TypeError: events is not iterable` (`at prepareReplayEvents (channel.js:623:25)`).
6. The throw propagates out of `apply`, so the loader reports `dsh: plugin tree failed to load: failed to apply loader entry dsh-tui`. **The whole tree fails**, not just the TUI entry — a single broken entry can take down co-loaded plugins.

Two properties of this failure are worth naming:

* **The stack blames the plugin, the bug is a contract mismatch.** Nothing in the trace mentions `Session` or alpha.4; the removed API is invisible because the access *succeeded* (returning `undefined`). This is the classic "undefined is not iterable" signature of silent property removal in JavaScript — as opposed to a hard `session is undefined` or "not a function".
* **It fails at startup, not at first use.** The replay path runs during channel construction, so the user gets a dead CLI rather than a degraded transcript. Blast radius: the plugin is unusable on alpha.4 and alpha.5 with no partial function.

### 1.5 Blast radius / scope of the fix in the plugin

`plugin-source-excerpt.js` records **42 total references to `.events` on session objects**, across at least `channel.js` lines 657, 734, 2685, 3004, 6685. That has three implications:

* This is not a one-line fix; it is a **surface migration**. Each of the 42 sites must be classified: *random access* → `eventAt(i)`; *cursor/position* → `seq`; *replay/render/copy* → `snapshotEvents()`.
* The correct fix is an **internal adapter** (one module that owns the session-log read API), not 42 inline edits — otherwise the next host refactor breaks 42 places again.
* The plugin was written against a contract that was never guaranteed; the count of touchpoints is the measure of how much unguarded coupling accumulated.

---

## 2. Why `npm install` was silent

### 2.1 What the range actually resolves to

`^0.1.2-alpha.2` (caret on a `0.x` prerelease) expands to:

```
>=0.1.2-alpha.2  <0.2.0-0
```

Two semver rules compose here, and both are routinely misread:

* **Caret on 0.x is patch-scoped.** `^0.1.2` means "compatible within 0.1.x": `>=0.1.2 <0.2.0`. The leading `0.` forbids minor bumps, because semver says a 0.x project may break in a *minor* release.
* **Prerelease comparators only admit prereleases of the same `major.minor.patch` tuple.** A prerelease version satisfies the set only if some comparator *in that set* carries a prerelease **and** shares the tuple. So:
  * `0.1.2-alpha.5` → **satisfies** (same `0.1.2` tuple, prerelease, `> alpha.2`).
  * `0.1.3-alpha.0` → **does not satisfy** (different tuple, and the prerelease-exclusion rule drops it).
  * `0.1.3`, `0.1.4`, … (stable) → **satisfy** (`>0.1.2-alpha.2`, `<0.2.0-0`, not a prerelease).

The user's reading — *"alpha.5 satisfies the range"* — is **correct as a semver statement**. The error is the next step: *"therefore the plugin supports alpha.5."* That inference is not licensed by semver, and §2.3 shows why it is not even close.

### 2.2 What a peer range does and does not guarantee

| `^0.1.2-alpha.2` **does** guarantee | `^0.1.2-alpha.2` **does not** guarantee |
|---|---|
| The installed host version **string** parses and falls inside the numeric interval. | That **any API symbol still exists** (`Session.events` is gone; the range cannot know). |
| A **declaration of author intent**: "I believe I am compatible here." npm only *compares numbers* to that claim. | That the author ever **ran** the plugin against the version you have (alpha.4, alpha.5, or anything but their dev box). |
| That npm will warn **if** the resolved version is outside the interval. | That **values keep their shape**: arrays stay arrays, payload fields keep names, sequence numbers keep meaning. |
| For stable releases only: the semver convention that patch = backwards compatible. | Any promise at all for **prereleases** — semver §9 lets them "introduce incompatible changes at any time"; the "patch = compatible" convention does not apply between `alpha.2` and `alpha.4`. |
| That the peer is *declared* (so npm 7+ may auto-install it if missing). | That a duplicate copy of `@deepseek-ai/dsh-session` will not be hoisted, breaking `instanceof`/identity checks. |
| — | That **behaviour** (ordering, lifecycle, sync/async, error semantics, config schema, loader/manifest contract) is unchanged. |

And the mechanical part: **npm never executes the plugin.** Its peer check is a resolution-time predicate over package metadata. It cannot observe a `TypeError` that happens three frames deep in a Cordis fiber. Even a "no warnings" result is *absence of a numeric mismatch*, not *evidence of compatibility*.

### 2.3 The prerelease trap (the crux of this task)

The task statement's closing sentence is the whole lesson: *`^0.1.2-alpha.2` does NOT guarantee `Session.events` still exists at alpha.4/5 just because alpha.5 > alpha.2 in semver ordering.*

Why the ordering argument is void:

* **`alpha.5 > alpha.2` is an ordering fact, not a compatibility fact.** Semver defines a total order over prerelease identifiers to make *version selection* deterministic. It deliberately attaches **no** compatibility semantics to that order.
* **The "newer" version is exactly where the break landed.** alpha.4 removed the API; alpha.5 inherits the removal. Monotonic version numbers and monotonic API stability are independent axes.
* **The plugin's range was written before the break existed.** A range is a *snapshot of the author's belief at publish time*. It cannot retroactively become true when the host publishes alpha.4 — but nothing in npm re-evaluates it, so the stale claim keeps being honoured forever ("permanently wrong, silently").
* **`0.1.2-alpha.2` → `0.1.2-alpha.4` is a prerelease increment on the same tuple**, i.e. the *most* volatile possible step in semver, and the one step for which the spec explicitly disclaims compatibility. A caret range across it is close to meaningless as a compatibility statement.

### 2.4 The false-inference chain, spelled out

```
install succeeds, no peer warning
        ⇓  (valid)
installed version ∈ [0.1.2-alpha.2, 0.2.0-0)
        ⇓  (INVALID — semver says nothing about API surface)
plugin is compatible with this host
```

The third line is the bug in the *reasoning*, before it is a bug in the *plugin*. Everything downstream — the crash, the wasted install, the bug report — follows from treating a numeric predicate as a behavioural guarantee.

---

## 3. The fundamental principle

### 3.1 Two different questions

| | **Peer-range satisfaction** | **Runtime compatibility** |
|---|---|---|
| **Question** | "Is the installed version number inside the interval I declared?" | "Does the code I am about to run still find the symbols, shapes and semantics it assumes?" |
| **Nature** | Static · package-metadata level · resolution-time | Behavioural · code level · execution-time |
| **Input** | Version strings + a range expression | Actual exports, prototypes, value shapes, event ordering, config/loader contracts |
| **Evaluated by** | npm/pnpm/yarn resolver | The JS engine, when `undefined` meets `for…of` |
| **Can be satisfied while broken?** | **Yes — trivially.** This fixture is the proof. | No: it either runs or throws. |
| **Who can fix a false positive** | Only the author (by narrowing the range) | Only testing against the real host |

They are **orthogonal**. One is a claim about *labels*; the other is a fact about *behaviour*. No amount of range precision substitutes for executing the plugin against the host version you ship to.

### 3.2 Categories of breakage that pass peer-range validation and crash at runtime

Five, ordered roughly by how often they bite in prerelease-churning ecosystems. **(a) is this fixture**; any two would satisfy the brief, all five are listed because the taxonomy is the useful artefact.

**(a) Symbol removal / rename — the API is gone.**
Passes the range; the property access yields `undefined` and the failure surfaces one frame later as `TypeError: X is not iterable`, `… is not a function`, or `Cannot read properties of undefined`. *This case:* `Session.events` removed in alpha.4; 42 call sites. Diagnostic tell: the error message names a *local variable* (`events`), never the removed member.

**(b) Value-shape / type change — the symbol exists, its contract changed.**
The property still resolves, so the load succeeds and the crash arrives later or is silent. Examples in this very release: if `events` had been kept as a *getter returning a cursor`, iteration would yield wrong objects; `SessionSeq` vs `SessionLogOffset` becoming distinct nominal types means a stored integer that used to index the log now denotes a different quantity — comparisons and `eventAt()` calls return the wrong event, or throw only under specific traffic. No version-range check can see field renames inside an event payload.

**(c) Semantic / lifecycle / ordering change — same API, different behaviour.**
No crash on load; broken behaviour later. Events emitted in a different order or at a different phase, a callback that became async (or sync), `dispose` ordering changed, replay now delivering a *snapshot* rather than a live view (so a long-lived subscriber silently stops seeing new events). This is the most expensive class, because it can pass CI smoke tests and corrupt transcripts in production.

**(d) Loading / manifest / config-contract change — the host's plugin ABI moves.**
The loader entry contract (`apply`/`inject`/service names), manifest fields, or config schema validation changes. Peer range still satisfied; the host rejects the entry or hands it an `undefined` service. Here the crash *is* a load failure (`failed to apply loader entry`), which is the same family of symptom as (a) — hence the need to read the changelog rather than the stack trace.

**(e) Identity / duplicate-instance failure — peers satisfied twice.**
npm 7+ auto-installs missing peers, and hoisting can leave a second copy of `@deepseek-ai/dsh-session` nested under the plugin. Every version check passes; `instanceof`, `Symbol`-keyed brands, module-level registries and shared mutable state then fail because the plugin holds a *different* class object than the host. Classic in monorepo/global-install setups, invisible to semver.

A sixth, adjacent case: **platform/engine drift** (Node version, ESM/CJS boundary, native addon ABI) — which `engines` can express, but a peer range cannot.

### 3.3 The one-sentence formulation

> **A peer range is a promise about numbers; runtime compatibility is a fact about behaviour.** Numbers can be satisfied while behaviour is gone — and in prerelease space, where `alpha.2 → alpha.4` is explicitly allowed to break, the promise is worth almost nothing.

---

## 4. What the plugin author should have done

### 4.1 Before publishing — catch it, don't declare it

1. **Test against the real host, at every version the range admits.** The range `^0.1.2-alpha.2` claims support for `0.1.2-alpha.3`, `alpha.4`, `alpha.5`, and stable `0.1.3+`. A matrix CI job should `npm i @deepseek-ai/dsh@<each>` into a clean prefix and run a **startup smoke test** (load the plugin tree, construct a channel, replay a tiny transcript). The current matrix evidently tested only the author's dev version — the range was wider than the evidence.
2. **Smoke-test the load path specifically.** This bug is a *boot* failure. A test that only exercises pure functions (or a mocked `Session` with `{ events: [] }`) passes forever. Mocks are the direct cause of this class: they encode the author's assumption instead of the host's reality. Test against the real `@deepseek-ai/dsh-session`.
3. **Watch the host's release notes as a build input.** Both alpha.4 entries carry the explicit marker *"Developers should pay attention to compatibility."* That marker is the ecosystem's deprecation channel; a release-watch job (or a canary that runs on every `@deepseek-ai/dsh` prerelease publish) turns a 3-week-late bug report into a same-day failing build.
4. **Pin the surface, not the version.** Keep all session-log reads behind one adapter module (see 4.3) so a host refactor is a one-file change with one test surface. 42 scattered `.events` reads is the root cause of the *severity* here, not just the break.
5. **Add an integration test that asserts the API exists**, e.g. a contract test that fails loudly if `typeof session.snapshotEvents !== "function"` on any supported host — this converts a runtime `TypeError` at a user's terminal into a red build.

### 4.2 What the metadata should encode

| Field | Should encode | Should **not** be expected to encode |
|---|---|---|
| `peerDependencies` | **The band you actually tested**, honestly narrow. For a prerelease host that is a moving target: `">=0.1.2-alpha.2 <0.1.2-alpha.4"` (explicitly excluding the release that removed the API), or an exact `"0.1.2-alpha.2"` if you only ever ran that. Widen only after the matrix is green. | API presence, data shapes, behaviour. A wide caret over prereleases is a *claim you cannot back*. |
| `peerDependenciesMeta` | `optional: true` for genuinely soft peers, so npm does not auto-install a second copy (§3.2e). | Compatibility information. |
| `engines` | **Node/runtime/platform** constraints (`node >= 20`, ESM/CJS expectations). | dsh API compatibility — `engines` names the *engine*, not your host's exports. Do not try to smuggle a dsh range into it; use the peer field for the host, `engines` for Node. |
| README / plugin manifest | The **supported host versions** and the migration note ("`Session.events` removed in alpha.4 — this build targets ≤ alpha.3"). | — |
| Deprecation path | Publish a fixed build for alpha.4+ and mark the old one deprecated / `peerDependencies` narrowed, so npm *does* start warning for new installs. | — |

The honest answer to "should the peer range have prevented this?" is **no** — but an honest, narrow range would have made npm warn on alpha.5, which is exactly the protection the user expected and did not get.

### 4.3 What needs a runtime feature-detection guard

Version arithmetic cannot decide this; a **capability probe** can. Guard at the boundary, once, and fail with an actionable message instead of a `TypeError`:

```js
// session-log adapter: the only place in the plugin that touches Session internals
export function readLog(session) {
  // alpha.4+ on-demand read APIs
  if (typeof session.snapshotEvents === "function") {
    return { kind: "snapshot", events: session.snapshotEvents(), seq: session.seq };
  }
  // alpha.2/alpha.3 materialized array
  if (Array.isArray(session.events)) {
    return { kind: "live", events: session.events };
  }
  throw new Error(
    "dsh-tui@0.1.0-beta.4 is incompatible with this dsh release: " +
    "Session.events was removed in dsh 0.1.2-alpha.4 and neither " +
    "snapshotEvents() nor events is available. " +
    "Upgrade to dsh-tui >= <fixed version>, or pin @deepseek-ai/dsh to 0.1.2-alpha.3."
  );
}
```

Principles for the guard:

* **Detect capability, not version string.** `typeof fn === "function"` survives backports, forks and re-numbered releases; `semver.satisfies(hostVersion, ...)` just moves the same broken assumption into code. If you *must* branch on version, use it only to choose a message, never to choose a code path.
* **Fail fast, at load, with the remedy in the message.** The current failure costs the user a debugging session because the error names an internal variable. A guarded failure names the host release, the removed API, and the upgrade/pin options — turning a support ticket into a self-service fix.
* **Guard every optional surface you touch**, including the `SessionSeq`/`SessionLogOffset` split (assert the value you hold is the kind you think it is at the boundary), and prefer feature detection over duck-typing one property.
* **Centralize.** One adapter, one guard, 42 call sites behind it. `session.events.at(-1)` becomes `log.last()`; `session.events[i]` becomes `log.at(i)`; `for (const e of session.events)` becomes `for (const e of log.snapshot())` — and the "snapshot vs live view" decision becomes explicit instead of accidental.

---

## 5. What the user can do right now — concrete pre-install checks

### 5.1 The single best check: probe the real host in a throwaway prefix

Do not test on the tree you care about. Install the *exact* pair into a scratch prefix **inside the workspace** (never the global tree, never outside it), and boot it:

```powershell
# pick a scratch dir you own; <VER> = your exact host version, e.g. 0.1.2-alpha.5
npm i --prefix ./.probe "@deepseek-ai/dsh@<VER>" "@deepseek-harness-tui/dsh-tui@<PLUGIN_VER>"
./.probe/node_modules/.bin/dsh-tui --version     # or the plugin's load/doctor command
```

* If the plugin's startup crashes, **you have reproduced it without touching your install.** This is the only check that observes the *behaviour*, which is the thing the range cannot tell you about.
* A `--version`/load-only invocation is enough because this failure class is a **boot** failure. If the host exposes a plugin-tree validation command (`dsh plugin doctor`, `--check`, `--dry-run`), prefer it: it loads entries without starting the UI.

### 5.2 The cheap metadata + changelog check (30 seconds, no install)

```powershell
npm view "@deepseek-harness-tui/dsh-tui" peerDependencies time
```

Compare the plugin's **publish `time`** against the host's release timeline:

* Plugin published **before** the host's alpha.4 → treat the range as **stale by construction**: it cannot have been tested against the version you run. This one timestamp comparison would have flagged this exact install.
* The declared range's **lower bound** tells you the oldest host the author tested; anything newer than their dev version is unverified, regardless of what the caret admits.

Then read the host's release notes for the versions **between** those two points and grep for the words the ecosystem uses to announce breaks: *removed*, *replaced*, *no longer*, *"pay attention to compatibility"*. That is precisely where `Session.events` appears.

### 5.3 The source-level check: does the plugin use a symbol your host still has?

```powershell
# 1) what does the plugin actually touch?
npm pack "@deepseek-harness-tui/dsh-tui@<PLUGIN_VER>" --dry-run           # list files, no install
# (or download the tarball into the scratch dir and inspect it read-only)
Select-String -Path .\channel.js -Pattern '\.events\b'                     # the 42 sites

# 2) does the installed host still expose it?
node -e "import('@deepseek-ai/dsh-session').then(m => { const S = m.Session;
  console.log(Object.getOwnPropertyNames(S.prototype)); })"
```

Decision rule: **every host member the plugin reads must appear in that prototype/export list.** `events` absent + `snapshotEvents`/`eventAt`/`seq` present → the plugin predates alpha.4 and will crash exactly as in `fixture/crash-stack.txt`. This is a *static* check that beats the peer range because it compares against the **actual installed object**, not a declared number.

### 5.4 Supporting habits

* **Read the range as a claim, not a test.** `^0.1.2-alpha.2` on a prerelease is a nearly unbounded claim in the most volatile corner of semver. Discount it accordingly; prefer plugins that pin narrowly or publish a compatibility table.
* **Check the plugin's CI matrix / recent issues** for the host versions it actually builds against, and whether anyone reports it on alpha.4+.
* **Prefer a pinned host.** Pinning `@deepseek-ai/dsh` to a known-good `0.1.2-alpha.3` makes the plugin work *today*, and staging a host upgrade (probe first, then promote) is the discipline that prevents this class of surprise.
* **For this specific broken install:** either pin the host to `0.1.2-alpha.3` (last release with `Session.events`), or patch the plugin locally with the `readLog()` adapter from §4.3 (`snapshotEvents()` for replay, `eventAt()` for random access, `seq` for the cursor). Verify with the probe in 5.1 before using it for real; and report it upstream with the alpha.4 changelog entry as evidence, so the published range gets narrowed and future users *do* get the npm warning.

---

## 6. Summary table

| | Value |
|---|---|
| **Removed API** | `Session.events` (eagerly materialized events array) |
| **Release** | dsh **v0.1.2-alpha.4** (*"Replace `Session.events` with on-demand read APIs"* / *"Developers should pay attention to compatibility"*) |
| **Replacement** | `session.seq`, `session.eventAt(i)`, `session.snapshotEvents()`; plus `SessionSeq` vs `SessionLogOffset` strong typing in the same release |
| **Crash** | `TypeError: events is not iterable` at `prepareReplayEvents (channel.js:623)`, via `replayEvents` → `createChannel` → loader entry `apply` (`plugin.js:425`); whole plugin tree fails to load |
| **Why npm was silent** | `^0.1.2-alpha.2` = `>=0.1.2-alpha.2 <0.2.0-0`; alpha.5's number is inside it; npm never executes the plugin; prereleases carry no compatibility promise |
| **Peer range checks** | static metadata predicate over version numbers |
| **Runtime compatibility checks** | actual symbols, shapes, semantics of the loaded code |
| **Pass-range / crash classes** | (a) symbol removed · (b) shape/type changed · (c) semantics/lifecycle changed · (d) loader/manifest contract changed · (e) duplicate-instance identity failure |
| **Author fix** | matrix-test the real host across the admitted band + narrow the peer range to tested versions + `engines` for Node + capability probe with actionable error + one adapter module |
| **User check** | probe the exact pair in a throwaway prefix and boot it; compare plugin publish time vs host release; confirm every host member the plugin reads exists on the installed object |

## Appendix · Method, evidence anchors, limits

**Anchors used (fixture, read-only):**
* `npm-install-output.txt` — 27 `dsh-*` peers at `^0.1.2-alpha.2`; "no peer dependency warnings"; host bundles them at `0.1.2-alpha.5`.
* `crash-stack.txt` — `events is not iterable` at `prepareReplayEvents (channel.js:623:25)` ← `replayEvents (6127)` ← `createChannel (6685)` ← `apply (plugin.js:425)` ← `Fiber._reload (cordis/lib/index.js:1355)`; loader message "plugin tree failed to load: failed to apply loader entry dsh-tui".
* `plugin-source-excerpt.js` — `liveAgent.session.events` (line 734 area), `replayEvents(agent.session.events)`, other reads at 657 / 2685 / 3004, "42 total references to `.events`".
* `dsh-changelog-excerpt.md` — alpha.4 *Other Changes*: `Session.events` → `seq`/`eventAt()`/`snapshotEvents()`; `SessionSeq` vs `SessionLogOffset` strong types; both marked "pay attention to compatibility".

**What I did not do (per authorization):** no installs, no network, no execution of the plugin or the dsh binary, no writes outside `agent-output/`, no modification of `fixture/`. Line numbers in the crash trace and the source excerpt are internally inconsistent by a constant factor (the excerpt says "line 734 area", the stack reports 623/6127/6685); they are treated as *locations in the replay path*, not exact anchors, and no conclusion depends on the exact numbers. The claim that alpha.2/alpha.3 still expose `Session.events` is inferred from the changelog's phrasing (*alpha.4 removes it*), not from executing those versions — it is the only reading consistent with the evidence, but it is an inference.

**Residual risk:** I cannot verify whether the host provides other, undocumented compatibility shims (e.g. a deprecated `events` getter behind a flag); the crash evidence shows the plugin's access yielded a non-iterable, which rules out a working shim on this install.
