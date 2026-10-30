# S13 · Peer Range vs Runtime Reality — analysis report

**Mode:** plugin-upgrade **Mode A · inspect** (read-only investigation, then stop). Nothing outside this
report directory was written; the fixture was read only and left unchanged.
**Subject:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` (community TUI plugin) on host dsh `0.1.2-alpha.5`.
**Verdict:** peer-range satisfaction and runtime compatibility are different properties. The install is
"green" because npm compared two version strings; the plugin is broken because dsh deleted a *member* of
the host API inside the very range the plugin claims to support.

---

## 0. Executive summary (one paragraph)

The plugin declares `^0.1.2-alpha.2` for all 27 of its `@deepseek-ai/dsh-*` peers. The host is
`0.1.2-alpha.5`, and `0.1.2-alpha.5` is inside `>=0.1.2-alpha.2 <0.2.0-0`, so npm's peer check passes
silently — exactly as the fixture's install log shows. But **dsh `0.1.2-alpha.4` removed the
`Session.events` getter** (the eagerly materialized event-log array) and replaced it with on-demand read
APIs (`session.seq`, `session.eventAt()`, `session.snapshotEvents()`, `session.ownEvents()`). The
plugin reads `liveAgent.session.events` in 42 places, so at alpha.4/alpha.5 that read yields
`undefined`, and the plugin's own `prepareReplayEvents()` iterates it →
`TypeError: events is not iterable` during `apply()` at startup. A peer range is a claim about
*version ordering*; runtime compatibility is a fact about *which API members exist and behave*. Semver
ordering cannot express "the API of alpha.2 is a subset of the API of alpha.5", and inside a `0.x`
prerelease stream it is not even supposed to: for `0.x`, semver reserves the *minor* position for
breaking changes, so every breaking removal that happened in the `0.1.2` alpha stream (alpha.4 alone
removed a package, renamed a package, removed a session getter and re-branded its types) is
"semver-legal" *inside the range the plugin declared*. The correct author-side fix is to **narrow the
peer range's upper bound below the removal** (or migrate the code and re-publish), plus a **runtime
feature-detection guard**; the correct user-side pre-install check is to **expand the peer range into
the list of host versions it admits, read those release notes for removals, and grep the plugin's
published source for the removed member names**.

---

## 1. The exact runtime incompatibility

### 1.1 What was removed

| Field | Value |
|---|---|
| Removed API | `Session.events` — the eagerly materialized session event-log array (a getter on the `Session` object) |
| Removed in | **dsh `0.1.2-alpha.4`** (corridor edge `0.1.2-alpha.3 → 0.1.2-alpha.4`) |
| Card | **DSH-0.1.2-A4-03** — "Session.events is removed; read the log through seq / eventAt() / snapshotEvents() / ownEvents()" (`skills/plugin-upgrade/references/v0.1.2-alpha.4.md`) |
| Touchpoints | #2 (persistent events), #3 (Remote `history` requests) |
| User's host | `0.1.2-alpha.5` — one release *after* the removal; alpha.5 itself changed nothing plugin-facing (cards DSH-0.1.2-A5-01…03 are additive storage-domain capabilities plus a host boot fix) |
| Plugin's build target | the `0.1.2-alpha.2` cohort, i.e. **two prereleases before** the removal |

### 1.2 Changelog citation (the fixture's own excerpt)

From `fixture/dsh-changelog-excerpt.md` — *dsh-v0.1.2-alpha.4 release notes (excerpt)*, "Other Changes":

> **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` —
> the eagerly materialized events array is removed to reduce memory overhead in long sessions.
> Developers should pay attention to compatibility. (@kermanx)

The excerpt also carries the companion breaking note "Distinguish `SessionSeq` and `SessionLogOffset`
with strong types — developers should pay attention to compatibility. (@tianyicui)" (card DSH-0.1.2-A4-04).
Both entries are explicit "pay attention to compatibility" warnings — the release that broke this plugin
said so in the notes.

### 1.3 What replaced it (the migration ledger from DSH-0.1.2-A4-03)

| Old (alpha.2 style) | New (alpha.4+) |
|---|---|
| `session.events.length` | `session.seq` (current log length, a `SessionLogOffset`) |
| `session.events[i]` | `session.eventAt(SessionSeq(i))` — one accepted, deeply frozen event |
| `session.events` (whole log) | `session.snapshotEvents()` — frozen snapshot of a half-open range |
| `session.events.slice(a, b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| "events this session wrote, not the fork-inherited prefix" | `session.ownEvents()` |
| Remote `history` request | `atSeq` is now validated as a non-negative **safe** integer; violations are rejected with `gateway/bad-request` |

Two extra constraints a migration must honour (same card set): `SessionSeq` / `SessionLogOffset` are
**branded numbers** with throwing constructors (DSH-0.1.2-A4-04), and `seedLength` is gone in favour of
`meta.isSeeded` + `inheritedEventCount`. A snapshot returned by `snapshotEvents()` must not be cached
across appends — re-read `seq` and call again.

### 1.4 How that becomes the observed crash

`fixture/plugin-source-excerpt.js` (plugin `channel.js`) shows 42 references to `.events` on session
objects, e.g. `liveAgent.session.events` (line 734), `agent.session.events` (line 2685),
`liveSession.events` (line 3004), `session.events.at(-1)` (line 657).

`fixture/crash-stack.txt` shows the call chain, all of it inside the plugin's own code:

```
Error: dsh: plugin tree failed to load: failed to apply loader entry dsh-tui
  (@deepseek-harness-tui/dsh-tui): events is not iterable
TypeError: events is not iterable
    at prepareReplayEvents (channel.js:623:25)     <- iterates the undefined value
    at replayEvents (channel.js:6127:33)
    at createChannel (channel.js:6685:5)           <- replayEvents(agent.session.events)
    at apply (plugin.js:425:21)                   <- plugin's apply() during loader apply
    at async Fiber._reload (cordis/lib/index.js:1355:5)
```

Mechanism: at alpha.4+ `session.events` is `undefined` (the getter no longer exists; the card records
that untyped JavaScript "reads `undefined` and then throws on `.length` / index access"). The plugin
passes that `undefined` into its replay path and iterates it → `TypeError: events is not iterable`.
The host did not throw; the plugin's own code threw while consuming a host member that no longer exists.
This is a **startup crash in `apply()`** — the plugin never reaches a working state, which is why the
user sees "the plugin crashes at startup" rather than a degraded feature.

---

## 2. Why npm install succeeded with no peer warnings

### 2.1 What npm actually checked

npm's peer check is a **version-string comparison in the dependency graph**: for each declared peer, does
a version of that package exist in the tree whose semver satisfies the declared range? Here every peer
is `^0.1.2-alpha.2`, and the installed cohort is `0.1.2-alpha.5`, which lies in
`>=0.1.2-alpha.2 <0.2.0-0` (`fixture/npm-install-output.txt`, lines 14–16). Nothing is missing, no
range is violated, so **npm has no warning to emit**. The absence of a peer warning is npm saying "the
arithmetic of your version claim is consistent" — nothing more.

### 2.2 What `^0.1.2-alpha.2` guarantees

1. A **package with that identity** (e.g. `@deepseek-ai/dsh-session`) is resolvable in the graph at a
   version inside `>=0.1.2-alpha.2 <0.2.0-0`.
2. npm will not **silently substitute** a peer version outside that range; the resolver keeps the cohort
   coherent.
3. The **author's assertion** that "the plugin works with any host whose dsh packages fall in this
   range". npm verifies only that the assertion is *arithmetically well-formed* — it cannot verify that
   the assertion is *true*, because npm never loads the plugin and never inspects an API surface.

### 2.3 What `^0.1.2-alpha.2` does NOT guarantee (the important list)

- **It does not guarantee that any specific export, getter, method, field or event the plugin uses still
  exists.** `Session.events` is the proof: the peer *identity* (`@deepseek-ai/dsh-session`) is right;
  the *member* (`.events`) is gone from alpha.4 onward.
- **It does not guarantee the plugin works on every version inside the range.** The range admits
  alpha.2, alpha.3, alpha.4, alpha.5 and every future `0.1.z`; the plugin only ever worked on the
  bottom of that corridor. A caret range is a *contract about a corridor*, and the author, not npm, is
  responsible for every point in it.
- **It does not guarantee anything at runtime.** Peer validation is a static metadata check performed
  before a single line of plugin code executes. It cannot observe a removed getter, a changed signature,
  a renamed event, a different default, or a missing Cordis service.
- **It does not mean "newer is compatible".** Semver ordering says `alpha.5 > alpha.4 > alpha.2`; it
  says nothing about what was removed in between. "alpha.5 > alpha.2" is a statement about *labels*, not
  about *API containment*.
- **It cannot express "breaking changes inside one range".** For `0.x` versions semver reserves the
  *minor* position for breaking changes, so a `0.1.2-alpha.*` stream is a single "minor" line from
  semver's point of view. dsh nevertheless shipped four breaking cards in alpha.4 alone
  (DSH-0.1.2-A4-01 package removed, -02 package renamed, -03 `Session.events` removed, -04 types
  re-branded) and more in alpha.1/alpha.2 (e.g. the removed `dsh-client-runtime`, DSH-0.1.2-A1-25).
  A caret range over `0.1.2-alpha.2` therefore *spans* breaking removals by construction. This is the
  structural reason the plugin's range was wrong, not an authoring slip of the finger.
- **It says nothing about `engines`.** `engines` is checked by npm (`EBADENGINE`, a warning by
  default) against the **environment** (Node/npm), not the host's API. A custom key such as
  `engines.dsh` is documentation npm does not enforce. *(Unconfirmed detail, standard npm behaviour:
  npm validates only the engine names it knows, e.g. `node`/`npm`.)*
- **It is narrower than it looks in the other direction too.** Under npm's semver prerelease rules a
  prerelease version only satisfies a comparator that shares the same `major.minor.patch` tuple and
  carries a prerelease (documented in rollup entry **R-08**). So `^0.1.2-alpha.2` also *refuses*
  later prerelease cohorts such as `0.1.3-alpha.1`, which are perfectly plausible future hosts.
  *(Derived from the rule as documented in R-08; not measured in this container.)*

### 2.4 The one-sentence form

> npm checked that the **version** in the tree satisfies the **range** in the manifest.
> The plugin was broken because the **API** in that version no longer contained what the plugin calls.
> The first is a metadata fact; the second is a behavioural fact; only the first is machine-checkable
> at install time.

---

## 3. The fundamental principle, and categories of breakage that slip through

### 3.1 The principle

- **"Peer range satisfaction" checks: a *static, package-metadata-level* relation between two version
  strings.** Question asked: *"is the installed version of package P inside the range the manifest
  declares for P?"* It is evaluated once, at install time, without executing plugin code, without
  loading the host, without inspecting a single export. It is a **necessary but not sufficient** condition
  for compatibility. It is also, by design, a *cheap* check — which is exactly why it cannot carry the
  semantic weight people load onto it.
- **"Runtime compatibility" checks: a *behavioural, code-level* relation between the plugin's call
  sites and the host's actual API surface and behaviour.** Question asked: *"every member this code
  touches — does it still exist, with the same shape, semantics, and timing, in the version that will
  actually run, in the configuration that will actually be used?"* It is evaluated per call site, per
  configuration, per data shape, at execution time.
- The formal difference: peer satisfaction is a claim about **ordering**; runtime compatibility is a
  claim about **set membership** ("is member `events` in the API of version V?"). Semver provides an
  order; it provides no containment relation between two releases' API sets. For a `0.x` prerelease
  stream where breaking removals happen *within* one minor line, that gap is not an edge case — it is
  the normal case, and it is the whole reason this install looked clean.
- Corollary for the host ecosystem: DSH later (from `0.1.7-rc.1`, card **DSH-0.1.7-RC1-01** /
  **DSH-0.1.7-J1-01**) started *enforcing* DSH peer ranges at install **and** at startup — refusing an
  install with `incompatible-version`, or disabling the plugin at boot, with exact-version exemptions
  in `<profile>/compatibility.json`. That enforcement is a **stronger version of the same static
  check**: it still only compares the declared range with the running version. It would have turned a
  silent install into a refused one *for a plugin that declares an honest range*, but it cannot detect a
  plugin whose range over-claims — exactly this plugin's failure mode. Enforcement cannot repair an
  incorrect claim; only accurate claims and runtime guards can.

### 3.2 Categories of breakage that pass peer-range validation but crash at runtime

1. **Removed or renamed API member inside the range** — *this incident*. `Session.events` deleted at
   alpha.4 (DSH-0.1.2-A4-03) → `undefined` → `TypeError: events is not iterable` at startup. The
   sibling shapes of the same class: a **package removed** from the cohort (DSH-0.1.2-A4-01,
   `@deepseek-ai/dsh-tool-subagent-report`) → `ERR_MODULE_NOT_FOUND` at import; a **package renamed**
   (DSH-0.1.2-A4-02, `dsh-code-runtime-python` → `dsh-experimental-code-runtime-python`) → the
   dependency no longer resolves. All of them: peer range satisfied, plugin dead.
2. **Changed signature or shape of a surviving member** — the name still exists, so nothing warns, but
   the call site is wrong. Examples in this corridor: `ctx.commands.execute(agent, line, signal)` →
   `ctx.commands.execute(agent, line, images, signal)` (rollup **R-11** static-drift ledger);
   `seedLength` → `meta.isSeeded` + `inheritedEventCount` (DSH-0.1.2-A4-04) — the field is simply
   `undefined` at runtime, so fork seeding silently degrades; `SessionSeq`/`SessionLogOffset`
   re-branding — runtime values are still plain numbers (so it "works"), but every constructed value
   must now go through a throwing constructor.
3. **Behavioural / default change with no removal at all** — the plugin's code is still valid, its
   feature is just gone or different. Examples: `web_fetch` enabled by default in the base bundle
   (DSH-0.1.2-A4-06, a policy change to review); the general `workflow` tool no longer exposed in the
   PTC preset (DSH-0.1.2-A4-05) — a plugin that assumed the tool existed now silently does not get it.
   Peer validation is blind to all of these.
4. **Event / wire contract drift** — internal event names and the Remote/gateway wire changed across
   this corridor (DSH-0.1.2-A1-01/02/06, and the Remote `history` `atSeq` validation tightening in
   A4-03). A listener for an event nobody emits, or a call to a removed Remote method, passes every
   version check and fails at runtime.
5. **Composition / activation-plane breakage** — the plugin installs and version-matches fine, but never
   activates: a required Cordis service is not provided (a `require: ['apiProxy']` row stays pending
   forever once the APIProxy transport was removed — DSH-0.1.2-A1-01), a `dsh.client.inject` list
   still names a removed package (DSH-0.1.2-A1-25) so the client half silently never registers, or a
   composition row name no longer matches the package name (DSH-0.1.2-A1-26). No peer warning, no
   crash — just a plugin that is present and absent at the same time.
6. **Type-level vs runtime-level divergence** — the type declarations a plugin depends on moved or
   vanished while the runtime still works (rollup **R-11**: "runtime does not necessarily break in
   sync — this is *static drift*"). A TypeScript plugin then fails its build, not its boot; a plain
   JavaScript plugin (this one: `channel.js`) gets *no* compile-time signal at all, which is why
   category 1 reached production here.

---

## 4. What the plugin author should have done

### 4.1 Before publishing (catch this class in CI)

1. **Test against the newest version inside the range you declare, or narrow the range to the versions
   you actually tested.** The defect here is exactly this mismatch: the floor was alpha.2, the code
   was written for alpha.2, the range was open all the way to `0.1.2-*`. Either
   (a) run the plugin against **dsh `0.1.2-alpha.5`** — the top of the declared corridor — in CI, or
   (b) declare a range that ends **before** the first release that removed the API you use
   (e.g. `>=0.1.2-alpha.2 <0.1.2-alpha.4`). "Alpha.2" is a floor, not a target: publishing a caret
   range asserts that *every* admitted host works, and CI must therefore test the top of the range,
   not its bottom.
2. **Add the typecheck layer against the real cohort** — this is the check that would have caught
   `Session.events` in one line: DSH-0.1.2-A4-03 records that TypeScript fails with
   *"Property 'events' does not exist on type 'Session'"`. Because the plugin is untyped JavaScript,
   that layer did not exist. Either adopt TypeScript (or JSDoc + `checkJs`) so the target cohort's
   declarations are checked, or accept that a JS plugin has **no** static signal and must lean
   entirely on runtime smoke tests.
3. **Add a boot/mount smoke test against a real host**, exercising the code path the plugin claims:
   the failure is a crash inside `apply()` — a cold-boot smoke in a scratch profile on the target
   cohort finds it in seconds (the skill's layered validation: dependency resolution → static →
   card-level unit tests → real cold boot with one message→tool→reply round → headless). The skill's
   `scripts/verify-runtime.mjs` automates exactly this (it installs the plugin into an isolated
   profile and cold-boots it with failure attribution) — note it is **not** read-only and runs plugin
   code, so it belongs in a disposable container for third-party plugins.
4. **Grep the plugin's own source against the corridor's removal ledgers in CI.** The authoritative
   lists are the version cards, not generic heuristics: DSH-0.1.2-A4-03 (`Session.events`),
   DSH-0.1.2-A4-04 (`seedLength`, branded seq types), DSH-0.1.2-A1-25 (`dsh-client-runtime`),
   DSH-0.1.2-A1-32 (`connectWorkspace`/`pickDirectory`), DSH-0.1.2-A2-* (type/export drift).
   A one-line CI rule ("this plugin must not reference `session.events` while the target cohort is
   ≥ alpha.4") is a dependency-free guard.
   *Honest caveat found while checking:* the skill's own heuristic pre-flight patterns
   (`references/pre-flight-patterns.json`, class #2) match `SessionEvent|session/event|ctx.on(|subscribe(`
   — a bare `session.events` read matches **none** of them, so the generic scanner alone would report
   zero hits for this very bug. `references/pre-flight.md` states the rule that saves you here: "zero
   hits across the seven classes only means *not detected by the current patterns*". The card ledgers
   must be applied by hand.
5. **Track the host's release notes for the cohort you claim to support.** The alpha.4 notes explicitly
   wrote "Developers should pay attention to compatibility" — a plugin author who declares support for
   the `0.1.2` alpha stream owes it a release-notes subscription.
6. **Publish the plugin on a matching dist-tag** (prerelease plugin versions → npm `alpha` tag, stable
   line → `latest`, per rollup **R-08**) so that alpha-host users are not silently upgraded to a
   build made for a different cohort.

### 4.2 Helping users (what a manifest can and cannot encode)

**What the peer range / `engines` field CAN encode (and should):**

- The **host cohort corridor the plugin was actually built and tested against**, with the *upper* bound
  as meaningful as the floor. This is the heart of the fix: the range must **exclude every host version
  in which the API the plugin uses is gone**. For this plugin, before a code migration, the honest
  declaration is `>=0.1.2-alpha.2 <0.1.2-alpha.4` (or the exact tested alpha.2/alpha.3 versions); a
  caret range over a `0.1.2` prerelease stream cannot express that, because it necessarily spans the
  removal at alpha.4. If the author also migrates the code to `seq`/`eventAt`/`snapshotEvents`,
  the floor moves up to the first host that has the new API (alpha.4) and the range must again exclude
  any later host that removes *that*.
- The **environment floor** (Node version) via `engines` — and only that: `engines` is about the
  environment, not about the host's API surface, and npm's `EBADENGINE` is a warning, not a gate.
- **Optional vs required peers** via `peerDependenciesMeta.optional`, so a host that legitimately
  lacks one optional package does not produce a false conflict.
- The **plugin's own release line** vs the host cohort, so users can see at a glance which host
  generation a build was made for (dist-tag discipline above).

**What CANNOT be encoded statically and therefore needs a runtime feature-detection guard:**

- The **presence of a specific member on a host object**. No version range, `engines` entry, or
  manifest field can assert "this host has `session.snapshotEvents`". The only honest mechanism is to
  **ask the object at runtime** and branch:

  ```js
  // feature-detect the current API, fall back to the legacy one
  function readSessionEvents(session) {
    if (typeof session.snapshotEvents === 'function') return session.snapshotEvents()
    if (Array.isArray(session.events)) return session.events
    return []
  }
  ```

  With 42 call sites in one plugin, the right shape is **one adapter function** in front of the session
  log, so the rest of the code never touches `session.events` directly; the adapter is also the single
  place to re-read `seq` and re-call `snapshotEvents()` instead of caching a snapshot across appends.
  The same guard pattern covers the branded types (check `typeof session.eventAt === 'function'` before
  constructing `SessionSeq(i)`) and the `seedLength` → `isSeeded`/`inheritedEventCount` rename.
- **A clear failure instead of a `TypeError`.** When the required API is absent, say so in the
  plugin's own words — "this build needs a host with the on-demand session-log API (dsh ≥ 0.1.2-alpha.4)
  or one that still exposes `Session.events`; your host exposes neither" — instead of letting
  `events is not iterable` escape from `prepareReplayEvents`. A diagnosable error is what turns a
  crash report into a resolved issue.
- **Per-capability detection, not per-version detection.** Detecting "the host has the new session-log
  API" is durable across future releases in a way that "the host version is ≥ X" is not. Version checks
  inside plugin code re-introduce exactly the brittleness that peer ranges were supposed to remove.

---

## 5. What you can do RIGHT NOW to catch this class of issue before installing

### 5.1 The flagship pre-install check — "range → corridor → removal grep" (three steps, minutes, no install)

**Step 1 — expand the declared range into the exact list of host versions it admits, and read the release
notes of exactly those versions.** The range is a corridor; the danger lives in the middle of the
corridor, not at its endpoints.

```sh
npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies --json
# -> every "@deepseek-ai/dsh-*": "^0.1.2-alpha.2"
#    corridor admitted: 0.1.2-alpha.2 .. 0.1.2-alpha.5 (and every later 0.1.z)
```

Then read the release notes of **alpha.3, alpha.4, alpha.5** and look for *removed / replaced /
renamed / breaking*. For this plugin the corridor contains alpha.4, whose notes carry:
"Replace `Session.events` with on-demand read APIs … Developers should pay attention to compatibility."
**That single line is the pre-install alarm.** Rule of thumb: *a peer range that spans a release whose
notes mention a removal is a range you must not trust before reading the plugin's source.*

**Step 2 — grep the plugin's published source for the removed member names (before installing it).**
You do not need to run the plugin to see the breakage; you need its source.

```sh
mkdir -p scratch && cd scratch
npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 --pack-destination .
tar -xzf deepseek-harness-tui-dsh-tui-0.1.0-beta.4.tgz
rg -n "session\.events|\.events\.at\(|\.events\.length|\.events\[" package/
# -> 42 hits in this plugin; every one of them is a call site that dies on alpha.4+
```

(`npm pack` downloads the tarball **without** executing the plugin's code or its install scripts —
safe as a pre-install inspection step. Keep it in a scratch directory outside your live profile.)

**Step 3 — cross-check the hits against the corridor's removal ledgers**, i.e. the known removed/renamed
members for the versions inside the range: DSH-0.1.2-A4-03 (`Session.events` → `seq`/`eventAt`/
`snapshotEvents`/`ownEvents`), DSH-0.1.2-A4-04 (`seedLength`, branded `SessionSeq`),
DSH-0.1.2-A1-25 (`dsh-client-runtime`), DSH-0.1.2-A1-32 (`connectWorkspace`/`pickDirectory`),
DSH-0.1.2-A2-* (export/type drift). A hit on a removed member = guaranteed runtime breakage, whatever
npm said.

**Single-command summary:** *range → corridor → release notes for removals → grep the tarball for those
names.* That is a complete, concrete pre-install check for this class, and it is exactly the check the
plugin author should have run in CI.

### 5.2 Supporting checks, in increasing cost

| # | Check | Cost | Catches |
|---|---|---|---|
| 1 | Expand the peer range, read the release notes of every version inside it, flag any "removed/replaced" entry | seconds, no install | the whole class before downloading anything |
| 2 | `npm pack` + `tar -xzf` + `rg` the removed member names from the corridor cards | seconds, no code executed | the specific broken call sites (42 here) |
| 3 | Typecheck the plugin against the **target** cohort's declarations (`tsc --noEmit` with `@deepseek-ai/dsh-session@0.1.2-alpha.5` installed) | minutes | "Property 'events' does not exist on type 'Session'" — for JS plugins, use JSDoc/`checkJs` or the grep above |
| 4 | Cold-boot the plugin in a throwaway profile on the exact host you run (one message→tool→reply round) | minutes, executes third-party code (use a container) | anything the static layers miss — this is the definitive check |
| 5 | Ask whether the host *enforces* peer ranges | seconds | on dsh ≥ 0.1.7-rc.1 the host refuses incompatible installs itself and disables mismatched plugins at startup (DSH-0.1.7-RC1-01 / DSH-0.1.7-J1-01). **On your `0.1.2-alpha.5` host that enforcement does not exist, so you must do the check yourself** — and note it is still only a range check, so it would not have caught this plugin either, because the plugin's range was simply wrong. |

### 5.3 For your currently broken install

- **Do not** try to restore `Session.events` by patching the host. The skill's own rule: this skill
  "must not modify DSH core to conceal plugin incompatibility".
- The choice is: **wait for / use a plugin release migrated to the new API** (the durable fix), or
  **pin the host down to a version that still has `Session.events`** (`0.1.2-alpha.3` and earlier) as
  a temporary measure — and understand that a downgraded host is a *host* rollback, not a plugin fix.
- The plugin-author-side correction to demand upstream: a peer range whose **upper bound excludes
  alpha.4+** until the code is migrated, plus a runtime feature-detection guard and a clear error
  message.
- When you report it, the precise wording that makes it actionable: "the plugin reads
  `Session.events`, removed in dsh `0.1.2-alpha.4` (DSH-0.1.2-A4-03) and replaced by
  `seq`/`eventAt()`/`snapshotEvents()`/`ownEvents()`; the declared peer floor `^0.1.2-alpha.2`
  admits hosts where that member no longer exists."

---

## 6. Evidence, sources, and confidence

### 6.1 Fixture evidence used (all read-only, unchanged)

| File | What it established |
|---|---|
| `fixture/npm-install-output.txt` | install succeeded, 0 peer warnings, 27 peers at `^0.1.2-alpha.2`, host cohort `0.1.2-alpha.5`, satisfies `>=0.1.2-alpha.2 <0.2.0-0` |
| `fixture/crash-stack.txt` | `TypeError: events is not iterable` at `prepareReplayEvents (channel.js:623)` ← `replayEvents` ← `createChannel` ← `apply` ← `Fiber._reload`; the failure is inside the plugin's own code |
| `fixture/plugin-source-excerpt.js` | 42 `.events` reads on session objects (`liveAgent.session.events` l.734, `agent.session.events` l.2685, `liveSession.events` l.3004, `session.events.at(-1)` l.657) |
| `fixture/dsh-changelog-excerpt.md` | dsh `0.1.2-alpha.4` release notes: "Replace `Session.events` with on-demand read APIs: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed … Developers should pay attention to compatibility. (@kermanx)" |

### 6.2 Skill reference material used (card IDs + key points only)

| Reference | Key points used |
|---|---|
| `skills/plugin-upgrade/SKILL.md` | Mode A · inspect is read-only; the skill must not modify DSH core to conceal plugin incompatibility; layered validation; report structure |
| `references/v0.1.2-alpha.4.md` — **DSH-0.1.2-A4-03** | `Session.events` removed at alpha.4; replacement API and old→new ledger; symptom "untyped JavaScript reads `undefined` and then throws"; touchpoints #2/#3 |
| **DSH-0.1.2-A4-04** | branded `SessionSeq`/`SessionLogOffset`; `seedLength` → `isSeeded` + `inheritedEventCount` |
| **DSH-0.1.2-A4-01 / A4-02 / A4-05 / A4-06** | sibling breakage classes: package removed, package renamed, preset default changed, bundle default changed |
| `references/v0.1.2-alpha.5.md` — **DSH-0.1.2-A5-01…03** | alpha.5 itself is additive + a host boot fix ⇒ the break is inherited from alpha.4 |
| `references/rollup-0.1.2.md` — **R-08**, **R-11** | npm prerelease tuple rule for peer floors; static-drift ledger (signature changes that pass range checks) |
| `references/jump-0.1.5-rc.2-to-0.1.7-rc.1.md` — **DSH-0.1.7-J1-01** / DSH-0.1.7-RC1-01 | later host versions *enforce* DSH peer ranges at install and startup; still only a range check |
| `references/pre-flight.md`, `references/pre-flight-patterns.json` | touchpoint classes; the explicit caveat that zero heuristic hits ≠ no breakage (and the observed pattern gap for `session.events`) |
| `references/precision-checklist.md` | peer-floor discipline, inject/peer completeness, "a bootable plugin with an imprecise static migration is not done" |
| `references/troubleshooting.md`, `references/v0.1.2-rc.1.md` | symptom→root-cause lookup and the rc.1 coverage matrix row mapping `Session.events` → DSH-0.1.2-A4-03 |
| `scripts/README.md` | `verify-runtime.mjs` (installs + cold-boots; not read-only) and `plan-migration.mjs` (read-only planner) roles and limits |

### 6.3 Marked as unconfirmed (not derivable from the brief + fixture)

- The exact npm warning mechanics for *other* peer configurations, and npm's treatment of unknown
  `engines` keys — standard npm behaviour, not measured here.
- That `^0.1.2-alpha.2` refuses a later prerelease cohort such as `0.1.3-alpha.1` — derived from the
  prerelease tuple rule as documented in R-08, not measured in this container.
- Whether a newer `dsh-tui` release has since migrated off `Session.events` — unknown; no network
  access and no registry lookups were performed.
- The plugin's upstream repository location, issue tracker, and whether the maintainer is aware — not in
  the evidence pack.
- The plugin's package name/version as installed (`@deepseek-harness-tui/dsh-tui@0.1.0-beta.4`) comes
  from the task brief; the fixture's install log shows the install command without the version specifier.
- The fixture's line numbers for the crash frames (`channel.js:623`, `6127`, `6685`) and for the
  source excerpt (`734`, `657`, `2685`, `3004`) refer to different functions in the same file; the
  fixture does not provide the full file, so the relative order of those lines could not be cross-checked.
  The causal chain (apply → createChannel → replayEvents → prepareReplayEvents → iterate `undefined`)
  is fully determined by the stack itself.

---

## 7. Bottom line

- **WHAT broke:** dsh `0.1.2-alpha.4` removed the `Session.events` getter (DSH-0.1.2-A4-03; release
  notes: "Replace `Session.events` with on-demand read APIs"), replacing it with `seq` / `eventAt()` /
  `snapshotEvents()` / `ownEvents()`. The plugin's 42 `.events` reads became `undefined` reads and
  crashed in `apply()`.
- **WHY npm was silent:** a peer range compares *version strings*; it guarantees a version inside the
  range exists, and nothing else. `alpha.5 > alpha.2` is an ordering fact, not an API-containment fact.
- **THE principle:** peer-range satisfaction = static metadata check; runtime compatibility = behavioural
  code-level fact. At least four independent breakage classes (removed/renamed members, changed
  signatures, changed defaults/behaviour, event & wire drift, composition-plane failures) pass the first
  and fail the second.
- **THE author's job:** test the top of the range you declare (or bound the range below the removal),
  add a typecheck and a real cold-boot smoke to CI, grep against the corridor's removal ledgers, and
  ship a runtime feature-detection guard for the members you need.
- **THE user's job, right now:** expand the peer range into the corridor it admits → read those release
  notes for removals → `npm pack` the plugin and grep its source for the removed names. Three minutes,
  no installation, and it would have caught this before the first launch.
