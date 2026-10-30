# JUDGE BRIEF · skill.S13-peer-range-vs-runtime

## Criteria (sealed rubric)
- [removed-api-and-crash] (20pt) Locate session.events reads in plugin-source-excerpt.js and the iteration failure in crash-stack.txt; cite dsh-changelog-excerpt.md for removal at 0.1.2-alpha.4 and replacement by seq, eventAt and snapshotEvents. Explain undefined/non-iterable access. A release number or API name without this causal connection earns no credit.
- [peer-check-boundary] (20pt) Use npm-install-output.txt to explain why alpha.5 satisfies the declared ^0.1.2-alpha.2 range while npm only checks declared package-version compatibility, not API existence or runtime behavior. A peer declaration is an author claim, not evidence that any version was tested. Do not require reproducing the fixture comment’s expanded upper bound; the same-base prerelease ordering is sufficient.
- [distinct-breakage-categories] (20pt) Explain at least two genuinely distinct classes that can pass peer validation and still fail at runtime: removed/renamed API and changed behavior/signature such as sync-to-async, argument order or return shape. Equivalent concrete classes are accepted. Two names for the same removal are not two classes; partial credit for one correctly explained class.
- [author-prevention] (20pt) Require testing the actual supported target versions, then an actionable compatibility policy: narrow the declared peer range to exclude the breaking releases, or implement and verify runtime capability detection with correct old/new paths. Explain the role of version metadata versus runtime guards; an engines field does not itself test DSH API behavior. Both testing and a compatibility policy are required for full credit; either alone is partial.
- [user-preinstall-check] (20pt) Give at least one concrete pre-install investigation: inspect breaking changes between the peer floor and installed target, or inspect the plugin’s API usage against target declarations. Tie the check to this Session.events incident and its compatibility boundary. Merely rerunning npm install or inspecting whether the peer range accepts alpha.5 is insufficient.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [peers-prove-runtime] ceiling=20 The final conclusion claims satisfied peer ranges or an install without warnings prove the plugin’s runtime API compatibility, or denies the documented Session.events removal. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S13-peer-range-vs-runtime/report.md

# S13 · Peer Range vs Runtime Reality — diagnosis report

**Subject**: `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` on `@deepseek-ai/dsh@0.1.2-alpha.5`
**Mode**: read-only inspection (no installs, no execution, fixture untouched)
**Verdict**: install-time peer satisfaction passed; a **removed runtime API** (`Session.events`) made the plugin fail at activation. The peer range was never evidence of runtime compatibility.

---

## 0. Evidence used

| Evidence | Source |
|---|---|
| npm install + silent peer check | `fixture/npm-install-output.txt` (every `@deepseek-ai/dsh-*` peer on `^0.1.2-alpha.2`, zero warnings) |
| Crash stack | `fixture/crash-stack.txt` (`TypeError: events is not iterable` at `prepareReplayEvents`, reached from `apply` → `createChannel` during plugin-tree load) |
| Crash site | `fixture/plugin-source-excerpt.js` (`const events = liveAgent.session.events`; 42 references to `.events` on session objects) |
| Release note | `fixture/dsh-changelog-excerpt.md` (0.1.2-alpha.4 notes: `Session.events` replaced by on-demand read APIs; `SessionSeq`/`SessionLogOffset` strongly typed) |
| Corridor card | skill reference `references/v0.1.2-alpha.4.md` → **DSH-0.1.2-A4-03** (`Session.events` removal + old→new ledger), **DSH-0.1.2-A4-04** (branded `SessionSeq`/`SessionLogOffset`) |

---

## 1. The exact runtime incompatibility

**What was removed**: the eagerly materialized event array on the `Session` object — `session.events` (and every derived use: `.length`, `[i]`, `.at(-1)`, spread copies).

**When**: in **`dsh-v0.1.2-alpha.4`** (tag `dsh-v0.1.2-alpha.4`, commit `4e84901e64`, 2026-09-01). It still existed at alpha.2 **and** alpha.3 — the alpha.2→alpha.3 edge carries no session-read card, so the break is a *single-step* cliff at alpha.4, not a gradual deprecation. alpha.5 inherits it. So the plugin's declared floor (`^0.1.2-alpha.2`) was *true when written* and false by the time the user installed it: alpha.4/5 sit inside the same declared range as the version the author tested.

**What replaced it** — read-on-demand, no live array:

| Old | New |
|---|---|
| `session.events.length` | `session.seq` |
| `session.events[i]` | `session.eventAt(SessionSeq(i))` |
| `session.events` (whole log) | `session.snapshotEvents()` |
| `session.events.slice(a, b)` | `session.snapshotEvents(SessionLogOffset(a), SessionLogOffset(b))` |
| "events this session appended, not the forked prefix" | `session.ownEvents()` |

Changelog citation (fixture, "Other Changes"): *"Replace `Session.events` with on-demand read APIs: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly materialized events array is removed to reduce memory overhead in long sessions. Developers should pay attention to compatibility."* Map to card **DSH-0.1.2-A4-03**.

**Why it crashes the way it does** (mechanism, not just the missing name): the plugin is plain JavaScript (`channel.js`), so there is no `tsc` error to catch the removal. `session.events` now evaluates to `undefined`; `prepareReplayEvents` iterates it → `events is not iterable`. The throw happens inside `apply()` → `createChannel()`, i.e. **during loader entry activation**, which is why the failure surfaces as `dsh: plugin tree failed to load` and takes the whole plugin down instead of degrading one feature. The message names a data shape (`events`) and hides the real cause (an API that no longer exists), which is exactly the kind of error a runtime contract check exists to pre-empt.

**Companion break in the same release — the naive fix is not enough.** Card **DSH-0.1.2-A4-04**: at alpha.4 `SessionSeq` / `SessionLogOffset` became branded numbers whose constructors throw `TypeError` on anything but a non-negative safe integer; `meta.seedLength` became `isSeeded` + `inheritedEventCount`. A migration that only renames `.events` → `snapshotEvents()` but keeps passing plain numbers into `eventAt()` / `snapshotEvents(a, b)` crashes a second time, one call deeper. Both fixes belong to the *same* corridor edge, so they must be verified together against alpha.4/alpha.5 — not one at a time against the old host.

---

## 2. Why npm was silent

**What `^0.1.2-alpha.2` actually means.** Desugared: `>=0.1.2-alpha.2 <0.2.0-0`. Semver's prerelease rule is that a prerelease version only matches a comparator that (a) carries a prerelease and (b) sits on the **same `major.minor.patch` tuple**. `0.1.2-alpha.5` shares the `0.1.2` tuple and is `>` `alpha.2`, so it matches — the range is behaving exactly as specified. This is not an npm bug or a semver edge case; **the range honestly means "any 0.1.2 prerelease at or above alpha.2, plus any 0.1.x release below 0.2.0"**, which is the whole window in which the host was free to delete `Session.events`.

**What it guarantees**: only that *declared version numbers* are ordered consistently with *declared ranges*. Concretely, npm read the `peerDependencies` strings from the plugin's manifest, read the resolved host cohort (`0.1.2-alpha.5` for every `@deepseek-ai/dsh-*` package), and evaluated a pure string/number predicate. Nothing was loaded, imported, type-checked, or booted. Zero warnings therefore means "the metadata is self-consistent", not "the code can run".

**What it does NOT guarantee**:

1. that any symbol the plugin touches still exists (`Session.events` is gone);
2. that surviving symbols keep their shape/arity/semantics (A4-04 brands numbers and makes constructors throw);
3. that packages still exist under the same name (A4-01 drops the `report` tool package; A4-02 renames the Python runtime package);
4. that a module is *composed/activated* in the host's plugin tree even when its types are installed — types can resolve while the runtime service stays pending;
5. that defaults, presets, event payload validation and wire contracts did not change (A4-05 drops `workflow` from the `ptc` preset; A4-06 enables `web_fetch`).

A peer range is a **promise about a version number**, and versions are integers-plus-labels; APIs are code. No amount of range arithmetic can be evidence about code that neither side loaded.

The corollary that matters for 0.x lines: under `^0.1.2` the **minor** digit is the breaking axis (`0.1.2` → `<0.2.0`), so a caret there explicitly opts the plugin into every future 0.1.x breaking change. Prerelease labels (`-alpha.4`) add no extra protection either: the label is ordering metadata, not a stability contract.

---

## 3. The fundamental principle

| | Peer range satisfaction | Runtime compatibility |
|---|---|---|
| **Question asked** | "Is the resolved version number inside the declared string range?" | "Do the plugin's behavioral assumptions hold against the host actually loaded in this process?" |
| **Input** | Two strings in `package.json` + a resolved version | The loaded module graph: exports, object shapes, service registry, event payloads, slot trees, lifecycle order |
| **When it runs** | Install / publish time (static, offline, code never executed) | Boot and behavior time (dynamic, needs a real mount and a real flow) |
| **Fails how** | Warning / refusal at install | Throw at activation, or silent misbehavior later |
| **Blind to** | Everything that is not a version string: deleted exports, signatures, defaults, composition, protocols | Nothing in principle — but only if you actually boot the target and exercise a path |
| **Cost of being wrong** | User installs a broken plugin (this case) | A few minutes of CI |

**Two different predicates, not two strengths of the same predicate.** Peer satisfaction is a *closed-world arithmetic check over metadata*; runtime compatibility is an *open-world behavioral check over code*. Tightening the first (exact pins, narrower carets) can only shrink the window in which the second is wrong — it can never replace it, because a version string cannot encode which symbols a plugin reads.

**Categories of breakage that pass peer-range validation but crash at runtime** (at least two required; five are visible in this very corridor):

- **C1 · Removed / renamed API surface** — the symbol or the package itself is gone. `Session.events` (A4-03); the `report` tool package removed in favour of `send_message` (A4-01); `dsh-code-runtime-python` renamed (A4-02); in other edges, `dsh-client-runtime` removed and `codeRuntime` → `ptcRuntime`. Signature: `undefined is not a function` / `X is not iterable`.
- **C2 · Same name, changed shape / signature / type discipline** — the property still exists but its contract changed. Branded `SessionSeq`/`SessionLogOffset` accepting only non-negative safe integers and throwing otherwise; `seedLength` → `isSeeded` + `inheritedEventCount`; async splits such as `resolve`/`run`; a parameter moved into an options object. Signature: `TypeError` from a validator, `NaN` cursor, silently wrong values.
- **C3 · Declared-but-not-composed (type/declaration vs activation)** — `node_modules` resolves the types, but the module is not mounted in the profile's plugin tree, or the exported service is never provided. Static typecheck passes; the service stays *pending* and the first `inject` consumer hangs or throws. Signature: a boot that never finishes, or "service not available".
- **C4 · Behavioral / default / policy changes** — no symbol moved, the world did: a preset stops publishing `workflow` (A4-05), the base bundle turns `web_fetch` on (A4-06), event payload validation tightens, a projection `stateVersion` bumps, a channel protocol version changes. Signature: loads fine, then wrong output, rejected payloads, or a UI that renders nothing.
- **C5 · Composition / manifest / client-plane registration** — `cordis.patch.yml` rows, loader entry keys, injection names, UI slot names, capability registries. The plugin is *installed* and *enabled* yet never mounts, or mounts and its slot entry vanishes. Signature: silent no-op in Settings → Plugins, empty panel, React error at registration.

The lesson is not "use tighter ranges". It is: **metadata checks bound the risk; only a real boot against the target version resolves it.**

---

## 4. What the plugin author should have done

**Before publishing — test the actual target, not the floor.** The bug is that the peer range was written as a *hope* (the version the author had) instead of a *result* (the versions the author booted). Concretely:

1. **Version matrix in CI, not a single pin.** Boot the plugin against the exact cohort of every host version the range admits — at minimum the floor (`0.1.2-alpha.2`) and the head (`0.1.2-alpha.5`), ideally each alpha edge in between — with a **real cold start**: load the plugin tree, activate the entry, open a session, replay a transcript.
2. **Make the crash path a test.** The failing line is a transcript replay on a freshly created channel. A one-line smoke test — "create a channel, replay two events, assert the channel is live" — fails on alpha.4 with `events is not iterable` and passes on alpha.2/alpha.3. That single test is the whole regression gate; unit tests that mock `session` (with a hand-written `{ events: [...] }` fake) would have *hidden* the break, because the fake outlives the real API.
3. **Typecheck the real declarations.** This plugin is JS; running `tsc --noEmit` with `checkJs` + `skipLibCheck: false` against the target `@deepseek-ai/dsh-session` would have produced "Property `events` does not exist on type `Session`" for free. Untyped JS is precisely how a compile-time signal became a runtime `TypeError`.
4. **Read the corridor, not just the version.** The alpha.4 notes flag the change with "Developers should pay attention to compatibility"; a changelog scan across `floor..head` (cards DSH-0.1.2-A4-03/-04 here) is cheap and would have caught it before the range was even written.

**For users — what belongs in metadata vs what belongs in a guard.**

- **`peerDependencies` should encode a *bounded, tested* corridor**, not an open caret on a 0.x minor. Something like `>=0.1.2-alpha.2 <0.1.2-alpha.4` (which cleanly excludes the breaking alpha.4 while still admitting alpha.3), or an exact cohort pin per release (`0.1.2-alpha.2` / `0.1.2-alpha.3`) — the honest statement is "I tested exactly these". The range must be re-derived, re-tested and re-published for each host cohort; the mistake to avoid is `^0.1.2-alpha.2`, which silently promises the future.
- **`engines` is for the runtime the plugin executes on** — the **Node floor** (e.g. `node: ">=22"`) — plus, in the dsh ecosystem, the host-compatibility metadata carried by the community manifest (`dsh-plugin.json`) and the declared DSH cohort. `engines` is *not* a place to smuggle an API-compatibility claim: npm does not validate a custom `dsh` key, so it would be decoration, not enforcement. Keep the DSH corridor in `peerDependencies` (bounded by test) and the Node floor in `engines`; do not duplicate either.
- **Runtime feature detection is the only thing that catches a *removed API* inside an already-admitted range.** A guard at activation, before any channel is built:

```js
// capability probe — activation-time, before createChannel
const canReadLog =
  typeof session.snapshotEvents === 'function' && typeof session.eventAt === 'function';
if (!canReadLog && Array.isArray(session.events)) {
  // legacy host (<= alpha.3): tolerated fallback path
} else if (!canReadLog) {
  throw new Error(
    'dsh-tui 0.1.0-beta.4 requires dsh 0.1.2-alpha.2..alpha.3: Session.events is gone and ' +
      'the snapshotEvents API is unavailable. Upgrade dsh-tui or pin dsh to 0.1.2-alpha.3.'
  );
}
```

  Two properties make this worth the ten lines: it fails **at the plugin boundary with a version-named, actionable message** instead of `events is not iterable` six frames deep in a replay helper; and it makes the plugin *forward-compatible by construction* — when a future host removes `snapshotEvents` too, the probe degrades to the same clean error rather than a new mystery stack. Detection must be **behavioral, not version-compared**: a `semver.satisfies` call inside the plugin reproduces the exact blindness that let this bug ship. Treat a failed probe as a load-time refusal (declared incompatible), never as a silent feature-off, so the failure is loud and diagnosable.

---

## 5. What the user can do right now — a concrete pre-install check

**Do this before `npm install`, in this order. Step 1 is the one that would have caught this exact bug:**

**Check 1 (primary) — grep the *published tarball* for APIs your host no longer has.** You already know your host version (`dsh --version` → `0.1.2-alpha.5`) and the plugin's declared floor (`^0.1.2-alpha.2`). The corridor between them is the *only* place a break can hide, and the changelog tells you what to look for:

```sh
# 1. what does the plugin claim, and what will it actually run against?
npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies engines version

# 2. fetch the published code WITHOUT installing it, and grep it for the
#    APIs the changelog says were removed in that corridor
npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 --pack-destination ./_probe
tar -xzf ./_probe/*.tgz -C ./_probe
grep -rn "session\.events\|\.events\.at(\|\.events\.length" ./_probe/package
```

Zero hits → no evidence of this class of break; don't take it as proof of compatibility (C2–C5 are invisible to grep). **Any hit is a stop sign**: the plugin reads a `Session.events`-shaped field, that field was removed in `0.1.2-alpha.4`, and your alpha.5 will crash exactly as the stack trace in the evidence pack shows. Generalise the pattern: for each entry in the changelog between your host version and the plugin's floor that says "removed" / "replaced" / "renamed" / "developers should pay attention to compatibility", grep the tarball for that name.

**Check 2 — read the range as a claim, then look for the author's evidence.** `npm view … peerDependencies` printing `^0.1.2-alpha.2` on a 0.x host is a red flag on its own: the caret spans `0.1.2 … <0.2.0`, i.e. every future 0.1.x break. Ask (or check the repo/CHANGELOG) which *exact* host versions the maintainer booted. A caret floor across a whole cohort is a declaration, not a test report.

**Check 3 — boot it in a throwaway profile first, never in yours.** Install into an isolated profile (separate `$DSH_HOME` / profile dir), cold-start the host, confirm the entry activates and no required service stays pending, then run one real flow (here: open a session, replay history). The `plugin-upgrade` skill ships this as an offline runtime-contract check (`scripts/verify-runtime.mjs`), which reports failure attribution (plugin code / dependency resolution / profile config / host runtime) instead of a raw stack. A plugin that cannot survive this never touches your real profile.

**What does *not* help**, so you don't waste a step: `npm install --dry-run`, `npm ls`/`npm explain`, and reading the absence of peer warnings all re-evaluate the *same* metadata predicate — they are the mechanism that already failed to warn you. Likewise `npm audit` (CVEs) and `engines` checks (Node version) answer different questions.

**Forward note**: from `0.1.7-rc.1` dsh itself enforces DSH peer ranges at install and at startup, with exact-version exemptions in `<profile>/compatibility.json` (card DSH-0.1.7-RC1-01) — that turns a silent install into a refusal, but it still only compares *version strings*. It would not have saved you from a plugin that declared a range the host satisfies while its code reads a deleted API; only Check 1/Check 3 do that.

---

## 6. Limits of this report

Read-only and offline by design: nothing was installed, executed, or fetched; `fixture/` was read only. Findings 1–4 are grounded in the evidence pack plus the corridor card **DSH-0.1.2-A4-03/-04** (which records the removal as *source-derived, not field-hit* for this particular API — so the crash stack here is the field confirmation of that card, and the card's old→new ledger is the migration recipe). The `0.1.7-rc.1` enforcement note comes from a later corridor card and is marked as forward-looking, not as a property of alpha.5. No claim is made about whether this plugin has other undiscovered incompatibilities beyond the 42 `.events` references and the A4-04 seq-branding surface; a real mount would be needed to settle that.

---

### Card / reference index (IDs only, no text reproduced)

- **DSH-0.1.2-A4-03** — `Session.events` removed; `seq` / `eventAt()` / `snapshotEvents()` / `ownEvents()` — the primary citation for §1.
- **DSH-0.1.2-A4-04** — branded `SessionSeq` / `SessionLogOffset`; `seedLength` → `isSeeded` + `inheritedEventCount` — the companion break that a naive `.events` fix still hits.
- **DSH-0.1.2-A4-01 / -02 / -05 / -06** — package removal (`report` → `send_message`), package rename, preset/default changes — the C1/C4 exemplars cited in §3.
- **DSH-0.1.7-RC1-01** — peer ranges enforced at install and startup + `compatibility.json` exact-version exemptions (forward note, §5).
- Skill scripts: `scripts/verify-runtime.mjs` (offline runtime contract check), `scripts/plan-migration.mjs` (heuristic touchpoint planner) — the tooling behind Check 3.

## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.