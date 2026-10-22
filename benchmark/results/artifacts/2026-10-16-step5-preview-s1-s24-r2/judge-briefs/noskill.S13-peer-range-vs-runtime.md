# JUDGE BRIEF · noskill.S13-peer-range-vs-runtime

## Criteria (sealed rubric)
- [removed-api-and-crash] (20pt) Locate session.events reads in plugin-source-excerpt.js and the iteration failure in crash-stack.txt; cite dsh-changelog-excerpt.md for removal at 0.1.2-alpha.4 and replacement by seq, eventAt and snapshotEvents. Explain undefined/non-iterable access. A release number or API name without this causal connection earns no credit.
- [peer-check-boundary] (20pt) Use npm-install-output.txt to explain why alpha.5 satisfies the declared ^0.1.2-alpha.2 range while npm only checks declared package-version compatibility, not API existence or runtime behavior. A peer declaration is an author claim, not evidence that any version was tested. Do not require reproducing the fixture comment’s expanded upper bound; the same-base prerelease ordering is sufficient.
- [distinct-breakage-categories] (20pt) Explain at least two genuinely distinct classes that can pass peer validation and still fail at runtime: removed/renamed API and changed behavior/signature such as sync-to-async, argument order or return shape. Equivalent concrete classes are accepted. Two names for the same removal are not two classes; partial credit for one correctly explained class.
- [author-prevention] (20pt) Require testing the actual supported target versions, then an actionable compatibility policy: narrow the declared peer range to exclude the breaking releases, or implement and verify runtime capability detection with correct old/new paths. Explain the role of version metadata versus runtime guards; an engines field does not itself test DSH API behavior. Both testing and a compatibility policy are required for full credit; either alone is partial.
- [user-preinstall-check] (20pt) Give at least one concrete pre-install investigation: inspect breaking changes between the peer floor and installed target, or inspect the plugin’s API usage against target declarations. Tie the check to this Session.events incident and its compatibility boundary. Merely rerunning npm install or inspecting whether the peer range accepts alpha.5 is insufficient.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [peers-prove-runtime] ceiling=20 The final conclusion claims satisfied peer ranges or an install without warnings prove the plugin’s runtime API compatibility, or denies the documented Session.events removal. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S13-peer-range-vs-runtime/S13-peer-range-vs-runtime.md

# S13 · Peer Range vs Runtime Reality

**Subject:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` crashes at startup on `@deepseek-ai/dsh@0.1.2-alpha.5`,
despite `npm install` reporting **no peer dependency warnings**.
**Verdict:** the install was *metadata-correct* and the plugin is *runtime-broken*. Both statements are true
at the same time, and that is the whole lesson of this report.

Evidence used (read-only fixture): `fixture/npm-install-output.txt`, `fixture/crash-stack.txt`,
`fixture/plugin-source-excerpt.js`, `fixture/dsh-changelog-excerpt.md`.

---

## 1. The exact runtime incompatibility

**WHAT was removed:** the `Session.events` **property** — the eagerly materialized, fully-populated array of
session events that lived on every session/agent object.

**WHEN:** in dsh **`0.1.2-alpha.4`**. The plugin's peer range (`^0.1.2-alpha.2`) was authored when alpha.2
was current, and it was never tightened after the alpha.4 breaking change landed.

**WHAT replaced it:** three on-demand read APIs, per the changelog entry quoted below:

- `SessionSeq` (a strong type for a sequence position),
- `Session.eventAt()` (random access to a single event),
- `Session.snapshotEvents()` (a point-in-time copy of the event list).

The changelog entry in the same release also split `SessionSeq` and `SessionLogOffset` into distinct strong types.

**Cited changelog entry** (`fixture/dsh-changelog-excerpt.md`, dsh v0.1.2-alpha.4 release notes):

> ## Other Changes
>
> - **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` — the eagerly
>   materialized events array is removed to reduce memory overhead in long sessions. Developers should pay
>   attention to compatibility. (@kermanx)
>
> - **Distinguish `SessionSeq` and `SessionLogOffset` with strong types** — developers should pay attention
>   to compatibility. (@tianyicui)

Note the explicit "developers should pay attention to compatibility" warning in *both* bullets. This is a
**0.x prerelease** line, and dsh told consumers plainly that alpha.4 is a breaking change.

**How it manifests** (`fixture/crash-stack.txt`):

```
Error: dsh: plugin tree failed to load: failed to apply loader entry dsh-tui
  (@deepseek-harness-tui/dsh-tui): events is not iterable
TypeError: events is not iterable
    at prepareReplayEvents (channel.js:623:25)
    at replayEvents (channel.js:6127:33)
    at createChannel (channel.js:6685:5)
    at apply (plugin.js:425:21)
    at async Fiber._reload (cordis/lib/index.js:1355:5)
```

The crash is **inside the plugin's own code**, not inside dsh. `liveAgent.session.events` evaluates to
`undefined` because the property no longer exists on the session object in alpha.4/5; the plugin then hands
that `undefined` to `prepareReplayEvents`, which iterates it, and `undefined` is not iterable.

**Blast radius:** `fixture/plugin-source-excerpt.js` records **42 total references to `.events` on session
objects** (e.g. `channel.js:734` `const events = liveAgent.session.events`, `channel.js:657`
`session.events.at(-1)`, `channel.js:2685`, `channel.js:3004`). So this is not a one-line fix: every read site
must be re-expressed against `eventAt()` / `snapshotEvents()`, and any code that relied on the array being
eagerly materialized and cheap to re-iterate has to be reworked for on-demand reads
(`snapshotEvents()` returns a copy; `eventAt()` is per-item access; there is no longer a live array to hold a
reference to).

---

## 2. Why npm installed without warnings even though the plugin is broken at runtime

**What a peer range actually guarantees — and only this:**

`^0.1.2-alpha.2` is a **pure arithmetic predicate over version strings**. Desugared:

```
^0.1.2-alpha.2   ==   >=0.1.2-alpha.2  <0.2.0-0
```

I verified this desugaring and its satisfiability set with a standalone semver implementation
(prerelease-aware comparison plus the semver prerelease tuple rule):

| installed version | satisfies `^0.1.2-alpha.2`? | why |
|---|---|---|
| `0.1.2-alpha.2` | yes | equals the lower bound |
| `0.1.2-alpha.3` | yes | inside range |
| `0.1.2-alpha.4` | yes | inside range — **the release that removed `Session.events`** |
| `0.1.2-alpha.5` (your install) | yes | inside range |
| `0.1.2`, `0.1.9` | yes | inside range |
| `0.2.0-alpha.1` | no | >= upper bound |
| `0.1.3-alpha.1` | no | prerelease rule: no comparator shares the `0.1.3` tuple |
| `0.1.1` | no | below lower bound |

Two separate mechanisms let this through, and both must be understood:

**(a) The caret is deliberately wide on a 0.x line.** Per semver, `^` pins only the *left-most non-zero*
element. For `0.1.2-alpha.2` the left-most non-zero element is the **minor** (`1`), so `^0.1.2-alpha.2`
accepts the whole `0.1.x` band up to (excluding) `0.2.0-0`. That band contains alpha.4, which is a
breaking release. In other words, the author's range **asserted that every 0.1.x prerelease is
compatible** — an assertion dsh never made and that the author never tested.

**(b) npm's peer check is a version-string check, full stop.** npm compares the declared range against the
*installed version string* of the dependency. It does not, and cannot:

- read, parse, or analyze the plugin's source code;
- diff the plugin's imports against the dependency's actual exports;
- execute anything at install time;
- know anything about API removals, renames, or semantic changes;
- distinguish "this version number is in range" from "this version behaves as we assumed."

Here the 26 `@deepseek-ai/dsh-*` peer declarations are satisfied *incidentally*: the
`@deepseek-ai/dsh@0.1.2-alpha.5` meta-package **bundles** those subpackages at `0.1.2-alpha.5`, so the
version strings line up. npm sees 26 satisfied ranges and stays silent. There is no signal for it to
emit — the metadata genuinely is consistent. The inconsistency is between the metadata and the *code*.

**So what does the peer range NOT guarantee?** It does not guarantee that:

1. the APIs the plugin imports still exist at the installed version;
2. the APIs that do exist still take the same arguments and return the same shapes;
3. behavior, ordering, nullability, or error types are unchanged;
4. the plugin was ever tested above the **bottom** of its own range (it almost certainly was not);
5. `0.1.2-alpha.2` through `0.1.2-alpha.5` contained no breaking changes (it did — see §1);
6. the runtime resolution graph is the same one npm validated (nested copies, duplicated installs, and
   bundled-vs-published subpackages can all diverge).

The peer range is a **statement by the plugin author about what they believed they tested**. It is not a
compatibility contract, and npm is not a validator of one.

---

## 3. The fundamental principle

> **Peer-range satisfaction is a static, package-metadata-level check.**
> **Runtime compatibility is a behavioral, code-level check.**

| | Peer range satisfaction | Runtime compatibility |
|---|---|---|
| **Question asked** | "Does the installed *version string* fall inside the declared semver range?" | "Does this *code* actually work against the code that is actually loaded at runtime?" |
| **When** | at `install` time, once | every time the plugin loads, on every machine, every version |
| **What it inspects** | `package.json` version metadata only | the real objects, exports, call signatures, return values, and control flow |
| **Enforced by** | npm's peer-dependency resolver | nothing, unless the plugin guards for it |
| **Failure mode** | a warning (or, with `--strict-peer-deps`, a hard install failure) — **only when the range is arithmetically unresolvable** | a crash at startup, like this one |
| **Nature of the claim** | "these version numbers are related" | "these symbols and behaviors still exist and behave as assumed" |

The two checks are **orthogonal**: passing the first tells you nothing about the second. A range can be
satisfied by a build that removed the very API the plugin depends on — exactly what happened here.

**Categories of breakage that pass peer-range validation but crash at runtime** (at least two required;
here are seven, all live in this case's neighborhood):

1. **Removed / renamed APIs.** The API is simply gone; the reference resolves to `undefined`.
   *This case:* `Session.events` removed in alpha.4 → `TypeError: events is not iterable`.
2. **Changed signatures and arity.** The symbol exists, but its parameter list, order, or optionality
   changed. Callers pass through fine at load and throw (or silently misbehave) at the call site.
3. **Changed semantics of surviving APIs — the "still-exists but means something else" trap.** Same name,
   same shape, different contract. *Directly relevant here:* the same alpha.4 release split
   `SessionSeq` and `SessionLogOffset` into distinct strong types. Code that stored "an offset" in a plain
   variable and passed it back still *loads fine*, but the value is now interpreted in the other
   coordinate system. This is the most dangerous category, because it does not throw — it corrupts.
4. **Changed return shape / nullability.** A function that returned an array now returns a lazy iterator or
   a `{ value, done }` handle; a field that was always present is now `undefined` under some condition.
   *This case:* an eagerly materialized array became on-demand reads.
5. **Changed event names, payloads, or emission timing.** A plugin that subscribes to a channel name that
   was renamed never fires; one that assumed an emit was synchronous now races.
6. **Changed error/exception behavior.** The plugin catches one error class; the dependency now throws
   another, so the guard silently stops guarding and the exception escapes.
7. **Structural / resolution mismatch.** The declared peer graph is satisfied on paper but the runtime
   module graph is different: a nested `node_modules` copy shadows the validated one, a meta-package
   bundles a subpackage at a version npm never resolved independently, or a "peer" that was optional in
   practice is missing and is only discovered at load. *This case has a flavor of this too:* all 26
   `@deepseek-ai/dsh-*` peers are satisfied by the *bundled* copies inside the dsh meta-package, not by
   26 independently resolved packages.

Common thread: **semver ordering is not API compatibility.** `0.1.2-alpha.5 > 0.1.2-alpha.2` in
version-string order says *nothing* about whether `Session.events` survived the trip.

---

## 4. What the plugin author should have done

### 4a. To catch this before publishing — test against the actual target version

- **Test against the top of the range, not the bottom.** `^0.1.2-alpha.2` claims compatibility with
  everything up to `0.2.0-0`; the plugin was evidently only ever run against alpha.2 (or earlier). A range
  that was never exercised above its lower bound is a guess, not a guarantee.
- **CI matrix over real dsh releases.** Run the plugin against, at minimum: the current stable dsh, the
  current **prerelease** dsh (`0.1.2-alpha.5`, and later alphas/betas/rcs as they ship), and the oldest
  version the range claims to support. On a 0.x line, track the prerelease channel specifically — that is
  where the breaking changes are landing.
- **A real load/smoke test, not just unit tests.** The failure here is a *plugin-tree load* failure
  (`apply (plugin.js:425)` → `Fiber._reload (cordis/lib/index.js:1355)`). The author's CI must actually boot
  dsh with the plugin installed and assert that the plugin applies cleanly. Unit tests that mock the session
  object would never have caught a removed property on the real one.
- **Consume dsh's release notes as a build input.** The alpha.4 notes said "developers should pay attention
  to compatibility" in bold. Subscribing to the dsh release feed (or a scheduled changelog-diff job) and
  treating every such entry as a mandatory review item would have flagged this on the day alpha.4 shipped.
- **Static symbol check in CI.** A cheap guard: import the plugin's entry and assert the specific symbols it
  relies on still exist on the real dsh session object. This is the automated version of "grep our own
  source for `.events`" — and the author should run that grep: 42 references is a measurable
  compatibility debt that should have been tracked.

### 4b. To help users — encode what is *knowable* in metadata, and guard what is not

**Metadata should encode the versions actually tested, not an optimistic sweep.**

- **Tighten the peer range to the tested set.** Instead of `^0.1.2-alpha.2`, declare something like
  `">=0.1.2-alpha.4 <0.1.2"` (or an exact `0.1.2-alpha.4` / `0.1.2-alpha.5` while the line is in
  prerelease). On a prerelease line, **`^` is the wrong operator**: by semver's own definition a 0.x caret
  permits minor-level changes, and dsh is shipping breaking minor-level changes. Pin to what you tested and
  bump the pin when you test again.
- **Consider `engines`** for the runtime (e.g. the Node version, and a dsh version floor if dsh is invoked
  as a runtime rather than a library). Caveat: npm only enforces `engines` when `engine-strict` is set, so
  it is documentation-with-teeth, not a guarantee — it belongs alongside the peer range, not instead of the
  guard below.
- **State the supported range in the README and in a plugin manifest field** if dsh exposes one, so users
  can check *before* installing rather than after.

**What metadata can never encode, and therefore needs a runtime feature-detection guard:**

Metadata cannot express "I call `session.events` and require it to be an eagerly materialized array."
That is a *code-level* fact, so it needs a *code-level* check at plugin load:

```js
// At plugin apply() time — fail fast with an actionable message, not a TypeError deep in a stack trace.
function assertCompatible(session, dshVersion) {
  if (typeof session.snapshotEvents === 'function' && typeof session.eventAt === 'function') return;
  throw new Error(
    '@deepseek-harness-tui/dsh-tui requires dsh >= 0.1.2-alpha.4 ' +
    '(Session.events was replaced by snapshotEvents()/eventAt()). ' +
    'Detected dsh ' + dshVersion + '. Upgrade dsh, or downgrade dsh-tui below 0.1.0-beta.4.'
  );
}
```

Better still, **support both shapes with an adapter** so the plugin works across the breaking change
instead of pinning users to one side of it:

```js
// One place, instead of 42 scattered `.events` reads.
const readEvents = (session) =>
  (typeof session.events !== 'undefined')
    ? session.events            // dsh < 0.1.2-alpha.4 (eager array)
    : session.snapshotEvents(); // dsh >= 0.1.2-alpha.4 (on-demand API)
```

The rule of thumb: **peer range / `engines` = "which versions I claim to work with" (static, checked once at
install); feature detection = "the specific symbols and behaviors I actually call" (dynamic, checked every
load).** The author needs both, and had neither.

---

## 5. What the user can do RIGHT NOW, before installing

The concrete pre-install check — **diff dsh's changelog across the span the peer range actually permits,**
**and look for breaking changes inside it.**

The peer range `^0.1.2-alpha.2` is a promise that *everything* from `0.1.2-alpha.2` to `0.2.0-0` works. So
do not ask "is my version in the range?" — ask "**what changed inside the range?**":

```bash
# 1) What does the plugin claim? (metadata-level; necessary but not sufficient)
npm view @deepseek-harness-tui/dsh-tui peerDependencies --json

# 2) What dsh do I actually have?
dsh --version

# 3) THE CHECK: what changed in dsh between the peer range's LOWER BOUND and my version?
#    Read the release notes for 0.1.2-alpha.3, -alpha.4, -alpha.5 and grep them for:
#      removed | replaced | breaking | 'pay attention to compatibility'
#    -> alpha.4 entry: 'Replace Session.events with on-demand read APIs ... the eagerly
#       materialized events array is removed'  <-- found before installing anything
```

That third step is the one that would have caught this. A grep of the alpha.4 notes for
"removed"/"replaced" returns `Session.events` immediately — before a single package is installed.

Three supporting habits, in order of strength:

- **Boot the plugin in a scratch directory before installing it globally.** `npm install` into a throwaway
  prefix (`npm install --prefix /tmp/try @deepseek-harness-tui/dsh-tui`) and run it there. This converts the
  question from "does the metadata resolve?" to "does the code load?" — which is the question that
  actually matters. Cheapest possible version of "try before you buy."
- **Grep the plugin's published source for the APIs it touches.** `npm pack` the tarball, unpack it, and
  grep for the dsh APIs it uses (`grep -rn "session\.events" .`), then check each one against the
  installed dsh's exports. This catches exactly the class of failure seen here: a removed property
  referenced 42 times.
- **Read the plugin's own compatibility statement** (README "requires dsh >= ...", plugin manifest).
  Treat a peer range as a *claim by the author*, and treat silence about tested versions as a red flag —
  it usually means "we set the range once and never looked again."

The generalizable rule: **a peer range tells you the author *believed* the versions were compatible; it is
a claim, not a proof. On any 0.x / prerelease line, assume `^` is too wide and verify behavior, not version
strings.**

---

## Summary

| Question | Answer |
|---|---|
| What broke? | `Session.events` (the eagerly materialized events array) was removed from the session object |
| When? | dsh `0.1.2-alpha.4` — the same release split `SessionSeq` / `SessionLogOffset` into strong types |
| Replaced by? | `SessionSeq`, `Session.eventAt()`, `Session.snapshotEvents()` (on-demand reads) |
| Why no npm warning? | `^0.1.2-alpha.2` `==` `>=0.1.2-alpha.2 <0.2.0-0` and `0.1.2-alpha.5` is inside it; npm checks version strings, never code |
| What does a peer range check? | whether the installed *version string* satisfies a semver predicate — nothing more |
| What does runtime compatibility check? | whether the actual symbols, signatures, and behaviors the code calls still exist and behave as assumed |
| The fix (author) | test against the top of the range incl. prereleases; tighten the range to what was tested; add a load-time feature-detection guard or a dual-shape adapter |
| The check (user) | diff dsh's changelog across the peer range's span before installing; boot the plugin in a scratch dir first |


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.