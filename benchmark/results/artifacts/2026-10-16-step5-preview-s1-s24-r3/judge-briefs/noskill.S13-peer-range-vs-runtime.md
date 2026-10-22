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
#### FILE: S13-peer-range-vs-runtime/S13-peer-range-vs-runtime-report.md

# S13 · Peer Range vs Runtime Reality — Analysis Report

**Subject:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` crashes at startup on dsh `0.1.2-alpha.5`,
despite `npm install -g` succeeding with **zero peer-dependency warnings**.

**Scope note:** this analysis is derived exclusively from the read-only evidence pack in `fixture/`
(5 files, indexed in Appendix A). No repository, skill, solution, test, `node_modules`, or
system-temporary path was read, and nothing outside `agent-output/` was written. The fixture directory
was not modified.

---

## 0. One-paragraph verdict

The plugin is broken because dsh **removed the `Session.events` array** in release **`0.1.2-alpha.4`**
and replaced it with the on-demand read APIs `seq`, `eventAt()` and `snapshotEvents()`. The plugin reads
`session.events` in 42 places and iterates it, so on alpha.5 it receives a non-iterable value and dies
with `TypeError: events is not iterable` while the dsh plugin tree is still loading. npm said nothing
because npm's peer check is a **static version-string comparison**, not a code check: it only asks
*is the version number `0.1.2-alpha.5` inside the range `^0.1.2-alpha.2`?* — and it is. A semver range is
a **span of version numbers**, and a breaking change shipped anywhere inside that span passes the check
silently. Peer-range satisfaction is a *packaging* contract about version identity; runtime
compatibility is a *behavioral* reality about the actual symbols your code touches.

---

## 1. The exact runtime incompatibility

| Question | Answer |
|---|---|
| **WHAT API was removed** | `Session.events` — the eagerly materialized, iterable **events array** exposed on the session object that dsh hands to plugins |
| **WHEN (which release)** | **dsh `0.1.2-alpha.4`** |
| **Replaced by** | On-demand read APIs: **`seq`**, **`eventAt()`**, **`snapshotEvents()`** |
| **User's installed version** | dsh `0.1.2-alpha.5` → already contains the removal |
| **Failure mode** | `TypeError: events is not iterable` thrown during plugin-tree load, before the plugin can do anything |

### 1.1 Changelog citation

From `fixture/dsh-changelog-excerpt.md` (lines 1–8), the release notes of **dsh v0.1.2-alpha.4**:

> - **Replace `Session.events` with on-demand read APIs**: `seq`, `eventAt()`, and `snapshotEvents()` —
>   the eagerly materialized events array is removed to reduce memory overhead in long sessions.
>   Developers should pay attention to compatibility. (@kermanx)

The stated *reason* matters: the array was removed deliberately, to reduce memory overhead in long
sessions. This was not an accident or a regression — it is an intentional, documented, **breaking** API
change, published in an alpha release, carrying an explicit *pay attention to compatibility* warning
that only a changelog reader would ever see.

### 1.2 The crash, traced to the plugin's own code

`fixture/crash-stack.txt`:

```
Error: dsh: plugin tree failed to load: failed to apply loader entry dsh-tui
  (@deepseek-harness-tui/dsh-tui): events is not iterable
TypeError: events is not iterable
    at prepareReplayEvents (channel.js:623:25)            <- plugin: iterates the value
    at replayEvents (channel.js:6127:33)                  <- plugin: transcript replay
    at createChannel (channel.js:6685:5)                  <- plugin: entry point
    at apply (plugin.js:425:21)                           <- plugin: loader entry 'apply'
    at async Fiber._reload (cordis/lib/index.js:1355:5)   <- host: plugin tree reload
```

The stack is decisive: **every frame above `Fiber._reload` is the plugin's own code.** The host is
behaving exactly as designed — it found the plugin, called its loader entry `apply`, and the plugin then
failed on its own assumptions. Nothing in dsh is *broken* here; the plugin is running against a host
that no longer provides the shape it was written against.

`fixture/plugin-source-excerpt.js` shows the offending reads:

```js
export function createChannel(ctx, initialAgent, options) {
    const events = liveAgent.session.events;    // <- line 734  (reads the removed API)
    replayEvents(agent.session.events);         // <- line 6685 (passes it to an iterator)
}
// line 657:   const last = session.events.at(-1);      // also needs an array (.at)
// line 2685:  const events = agent.session.events;
// line 3004:  const liveEvents = liveSession.events;
// ... 42 total references to '.events' on session objects
```

Two things follow:

1. **`events is not iterable` is exactly the predicted symptom.** The plugin expects an *eagerly
   materialized array* — it calls `.at(-1)` on it, spreads it, iterates it. After alpha.4 that property
   no longer yields an array, so iteration throws. This is the signature of a **removal**, not of a
   value that is merely empty or late.
2. **The blast radius is the whole transcript-replay feature, not one line.** 42 references to `.events`
   on session objects means the plugin's core UI path is built on the removed shape. This is not a
   one-line patch; the plugin needs a port to `seq` / `eventAt()` / `snapshotEvents()`.

### 1.3 A second, latent incompatibility from the same release

The same changelog excerpt (lines 10–11) carries a companion change:

> - **Distinguish `SessionSeq` and `SessionLogOffset` with strong types** — developers should pay
>   attention to compatibility. (@tianyicui)

This is worth flagging because it will bite the port. Even after the author migrates to `eventAt()`, the
*meaning and type* of the argument has changed: a session sequence number and a log-file offset are now
distinct nominal types where they used to be interchangeable plain numbers. A naive mechanical port that
feeds an offset into an `eventAt(seq)` call will run fine in JavaScript, pass every semver check, and
silently replay the wrong events. The fix must be a semantic port, not a textual one.

---

## 2. Why npm installed without warnings

### 2.1 What the peer check actually is

npm's peer-dependency check is a **static, package-metadata-level comparison of version strings**. At
install time it does exactly one thing: take the `version` field of the package that is present and test
it against the declared range. It does **not** load either package, does not resolve a single import,
does not enumerate a single export or property, and never executes any code. It is a check on *names and
numbers*, performed by the package manager, with no knowledge of what either package contains.

Because npm 7+ auto-installs peers and only raises `ERESOLVE` when a range is **unsatisfiable**, a
satisfied range produces no output whatsoever. Silence here means *the version number is inside the
span* — nothing more. (`--legacy-peer-deps` / `--force` go further and suppress even the unsatisfiable
case; but they were not needed here, because nothing was unsatisfiable.)

### 2.2 Why the range is satisfied

`^0.1.2-alpha.2` expands to `>=0.1.2-alpha.2 <0.2.0-0`. Verified computationally (self-contained semver
comparator, Appendix B):

| Candidate version | `^0.1.2-alpha.2` accepts? |
|---|---|
| `0.1.2-alpha.1` | rejected (below floor) |
| `0.1.2-alpha.2` | **satisfies** (the floor itself) |
| `0.1.2-alpha.3` | **satisfies** |
| `0.1.2-alpha.4` ← **the breaking release** | **satisfies** |
| `0.1.2-alpha.5` ← **your installed dsh** | **satisfies** |
| `0.1.2-beta.1`, `0.1.2` | **satisfies** |
| `0.1.3`, `0.1.99` | **satisfies** |
| `0.2.0-0`, `0.2.0-alpha.1`, `0.1.1` | rejected |

This matches the note in `fixture/npm-install-output.txt` line 15: *The installed
`@deepseek-ai/dsh@0.1.2-alpha.5` bundles these packages at `0.1.2-alpha.5`, which satisfies
`>=0.1.2-alpha.2 <0.2.0-0` in semver. npm's peer check passes silently.*

**The range is a span, not a pin.** It admits alpha.2, alpha.3, **alpha.4 (where the break happened)**,
alpha.5, and every future `0.1.x` release up to `0.2.0-0`. Any breaking change shipped anywhere inside
that span passes the check. That is not a bug in npm — it is the entire semantic content of a range:
*I claim to work with this interval of version numbers.*

Two extra aggravating factors in this specific case:

- **`0.x` means *anything may change*.** By semver convention a major version of `0` declares that the
  API is unstable and may change at any time. The alpha tag compounds this: prerelease versions are
  explicitly *not necessarily safe or functional*. A peer range of `^0.1.2-alpha.2` against a `0.x`
  prerelease host is close to the weakest contract expressible in package metadata.
- **The peers point at packages that are *bundled*, not resolved.** The plugin declares peers on
  `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-session` and 25 more — but per
  `npm-install-output.txt` line 14, `@deepseek-ai/dsh` *bundles* these at its own version. So the version
  string npm validated is not even guaranteed to identify the module instance the plugin ends up talking
  to at runtime. (Duplicate or bundled module instances are their own runtime-hazard class: singletons,
  `instanceof`, and plugin-context registration all break when two copies of a module coexist — again,
  invisible to semver.)

### 2.3 What a peer range does and does not guarantee

| A peer range `^0.1.2-alpha.2` **DOES** guarantee | It does **NOT** guarantee |
|---|---|
| The installed version string falls inside the declared interval | That any particular API, export, property or method still **exists** |
| The package manager will (or did) resolve without `ERESOLVE` | That a surviving name kept the same **arity, signature, or return type** |
| A rough statement of the author's *intended* compatibility span | That the author actually **tested** against any version in that span |
| A machine-checkable constraint npm can act on at install time | That the code **runs** — no code is loaded, resolved, or executed |
| Nothing about which module instance the plugin will import | That the module instance the plugin imports is the one the host runs |
| Nothing about ordering, timing, or semantics | That behavior, units, ordering, or sync/async character is unchanged |

The one-sentence form: **a peer range is a claim about version numbers; it is not a claim about code.**
`alpha.5 > alpha.2` in semver ordering is true and completely irrelevant to whether `Session.events`
exists.

---

## 3. The fundamental principle

> **Peer-range satisfaction checks *version identity* — a static, package-metadata-level, syntactic
> question answered by the package manager without running anything.**
>
> **Runtime compatibility checks *behavioral reality* — a dynamic, code-level question answered only by
> executing the actual code against the actual host and observing whether the symbols it touches exist,
> with the expected shape, arity, and semantics.**

Concretely:

- **Peer-range satisfaction** asks: *does the string `0.1.2-alpha.5` sort inside the interval
  `>=0.1.2-alpha.2 <0.2.0-0`?* It is evaluated **once, at install time**, by npm, on metadata
  (`package.json`), with zero execution. Its answer is a boolean about **numbers**.
- **Runtime compatibility** asks: *when this plugin's `createChannel` actually runs on this host, does
  `session.events` still exist, is it still an array, can it still be iterated, does `.at(-1)` still work,
  and do the new APIs `seq` / `eventAt()` / `snapshotEvents()` return what the plugin assumes?* It is
  evaluated **every time the code runs**, by the JavaScript engine, on live objects. Its answer is a
  **behavior**.

The gap between them is where this bug lives. Semver ordering (`alpha.5 > alpha.2`) says nothing about
API surface, and the whole point of an alpha line is that the API surface moves.

### 3.1 Categories of breakage that pass peer-range validation but crash at runtime

1. **API removal or rename inside the span** ← *this case.* `Session.events` deleted in alpha.4 while
   `^0.1.2-alpha.2` still admits alpha.5. The version check passes; the symbol is simply gone.
2. **Signature / arity / return-type change on a surviving name.** Same function name, different
   parameters or a different return shape — e.g. a method that used to return an array now returns a lazy
   iterator or a Promise. The name resolves, the call succeeds, the result is wrong.
3. **Semantic drift — same name, same signature, different meaning.** Sync becomes async; eager becomes
   lazy; a numeric field changes unit or epoch; an ordering guarantee is dropped. Everything type-checks
   and installs cleanly; the logic is silently wrong.
4. **Nominal / strong-type splits invisible to JavaScript** ← *also live here.* The `SessionSeq` vs
   `SessionLogOffset` change: two concepts that were both plain numbers are now distinct types. A peer
   range cannot express this; TypeScript catches it, plain JavaScript does not.
5. **Bundled or duplicated module instances.** The peer range is satisfied by a *bundled* copy of
   `@deepseek-ai/dsh-*` rather than by the instance the host actually runs. Singletons, `instanceof`, and
   plugin-context registration all fail while npm reports a clean install.
6. **Environment-gated or optional capabilities.** A feature behind a host flag, a platform check, or an
   optional native dependency; plus plain `engines` drift (Node version, host version). Present in the
   author's environment, absent in yours — no semver range involved.

Any one of these is enough to produce *npm is happy, the plugin is dead*.

---

## 4. What the plugin author should have done

### 4.1 Before publishing — test against the actual target version

1. **Run the plugin against the real host, in CI, on a version matrix.** The supported range spans
   alpha.2 to `0.2.0-0`. CI must install the real `@deepseek-ai/dsh` at the **oldest** supported version
   (`0.1.2-alpha.2`) *and* the **newest** (`0.1.2-alpha.5` at the time), and boot the plugin in both. A
   matrix across the declared range is the only thing that makes the range meaningful.
2. **Smoke-test the load path, not just the pure functions.** The crash is in
   `apply()` → `createChannel()` → `replayEvents()`. Unit tests of `prepareReplayEvents` with a
   hand-made fake session object would have passed forever, because the fake still had `.events`. A test
   double that mirrors the *old* host is worse than no test: it certifies the removed API.
3. **Treat host changelog entries as CI gates.** The alpha.4 note literally says *Developers should pay
   attention to compatibility.* Subscribe to host releases and fail the build on
   removed / renamed / BREAKING / *compatibility* entries affecting any API the plugin touches.
4. **Verify the peer surface is real.** Confirm that `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-agent`,
   `@deepseek-ai/dsh-session` and the other 25 peers are actually resolvable as packages rather than
   bundled inside the host. If they are bundled, those 28 peer ranges are decorative — they validate
   version strings that do not correspond to the modules the plugin imports.
5. **Pin in development, widen deliberately.** Develop against an exact host version in the lockfile;
   widen the declared range only after actually running the matrix.

### 4.2 To help users — encode what a range can, guard what it cannot

**What metadata should encode (declarative, static):**

- **A tightened, honest peer range.** Once the author has tested against alpha.4+, the range should
  become `^0.1.2-alpha.4`; until the port lands it must be constrained to exclude the breaking release
  (`<0.1.2-alpha.4`, or an explicit upper bound). A range should encode **the span I have actually
  verified**, not *everything that sorts above my floor*. This is a statement of verified intent — it
  cannot be a guarantee, because it is still only numbers.
- **`engines`** for the host / Node requirement, as a machine-readable hint. Caveat: `engines` is
  advisory unless `engine-strict=true`; npm warns rather than fails by default.
- **A compatibility matrix in the README** — plugin version × dsh version × status. This is the artifact
  users actually check, and it is the only place where *0.1.2-alpha.4 removed `Session.events`* is legible
  without reading host release notes.

**What must be a runtime guard (because no metadata field can express it):**

The existence, shape, and semantics of `session.events` are **code-level facts**. No `peerDependencies`
entry, no range, and no `engines` field can say *this property exists and is an array*. That information
only exists at runtime, so it must be checked at runtime — **feature detection**, once, at load time:

```js
// adapter / shim: the single place that knows about the host's event API
function readEvents(session) {
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents();  // dsh >= alpha.4
  if (Array.isArray(session.events))            return session.events;               // dsh <  alpha.4
  throw new UnsupportedHostError(
    'dsh-tui needs a session event API: found neither snapshotEvents() nor events[]. ' +
    'Requires dsh >= 0.1.2-alpha.2; this build changed the event API in 0.1.2-alpha.4. ' +
    'Detected host: ' + (ctx.host && ctx.host.version));
}
```

Three properties make this effective:

- **Detect capability, not version.** `typeof x === 'function'` survives version renumbering,
  re-releases, and bundled-copy weirdness that version-string checks cannot.
- **Fail fast, at load, with an actionable message.** Compare the current failure —
  `TypeError: events is not iterable` at `channel.js:623`, five stack frames deep — with an error that
  names the missing API, the release that changed it, and the required host version. The first is a bug
  report; the second is a solvable problem.
- **Isolate the volatile surface behind one adapter.** With 42 references to `.events`, a single
  `readEvents()` seam converts a rewrite into a one-file port, and confines all future host churn to one
  place. This is also where the `SessionSeq` vs `SessionLogOffset` distinction gets handled explicitly
  rather than by accident.

---

## 5. What you (the user) can do RIGHT NOW — a concrete pre-install check

**The concrete pre-install check: read the declared contract, then diff the host changelog across every
release the range admits, then probe capabilities in a throwaway directory before the global install.**

**Step 1 — read the peer ranges before installing** (read-only, no install, no side effects):

```bash
npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies
npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 engines
```

If you see `^0.1.2-alpha.2` on `@deepseek-ai/dsh-*`, you now know the claim covers `0.1.2-alpha.2` to
`0.2.0-0` — i.e. **every** alpha in that line, including ones not yet released when the plugin was
written. Treat that as *unverified across most of this span*, not *compatible*.

**Step 2 — enumerate what the range actually admits, and read the release notes for all of it:**

```bash
npm view @deepseek-ai/dsh versions     # what exists in the 0.1.x line
dsh --version                          # what you actually run
```

Then read the release notes for each release inside the span, grepping specifically for `removed`,
`Replace`, `BREAKING`, and `compatibility`. In this case that surfaces the alpha.4 entry **Replace
`Session.events` with on-demand read APIs … Developers should pay attention to compatibility** in about
ten seconds, before a single package is installed. This is the check that would have predicted this
exact crash.

**Step 3 — behavioral dry run in a throwaway directory, before installing globally.** A semver check is
static, so counter it with something dynamic. Install into a scratch directory (or inspect the resolved
tree with `npm install --dry-run`) and probe the *actual installed host* for the capabilities the plugin
needs:

```bash
mkdir -p probe && cd probe && npm install @deepseek-ai/dsh@0.1.2-alpha.5
node -e "const dsh=require('@deepseek-ai/dsh');
console.log('events present?      ', 'events' in dsh.Session.prototype);
console.log('snapshotEvents fn?   ', typeof dsh.Session.prototype.snapshotEvents);
console.log('eventAt fn?          ', typeof dsh.Session.prototype.eventAt);"
```

`'events' in ... === false` is the answer you want *before* the plugin is on your system. Then run the
plugin's load path (`dsh-tui`) from the scratch install rather than installing it globally.

**Step 4 — after installing, verify what the peers actually resolved to:**

```bash
npm ls -g        # is the peer a real package, or a bundled copy inside @deepseek-ai/dsh?
```

**The habit to build:** for any plugin that peers into a `0.x` or prerelease host, *npm installed
cleanly* is not evidence of anything. A peer range is the author's *claim*; the only evidence is the host
changelog read across the span, plus one capability probe against the host you actually run.

---

## Appendix A — Evidence index

| File | Lines | What it establishes |
|---|---|---|
| `fixture/README.md` | 1–9 | Pack contents; fixture is read-only |
| `fixture/npm-install-output.txt` | 1–16 | Install succeeded with **no peer warnings**; peer ranges are `^0.1.2-alpha.2` on 28 `@deepseek-ai/dsh-*` packages (lines 9–12); dsh bundles them (line 14); `0.1.2-alpha.5` satisfies `>=0.1.2-alpha.2 <0.2.0-0` (line 15); *npm's peer check passes silently* (line 16) |
| `fixture/crash-stack.txt` | 1–14 | `TypeError: events is not iterable`; frames `prepareReplayEvents` → `replayEvents` → `createChannel` → `apply` → `Fiber._reload`; the crash is **inside the plugin's own code** (lines 13–14) |
| `fixture/plugin-source-excerpt.js` | 1–14 | Reads `liveAgent.session.events` (line 734) and `agent.session.events` (line 6685); uses `.at(-1)` (line 657); **42 total references** to `.events` on session objects (line 14) |
| `fixture/dsh-changelog-excerpt.md` | 1–11 | **The breaking change**: `Session.events` replaced by `seq`, `eventAt()`, `snapshotEvents()` in **v0.1.2-alpha.4** (lines 5–8); companion `SessionSeq` / `SessionLogOffset` strong-type split (lines 10–11) |

## Appendix B — Verification method

The range expansion `^0.1.2-alpha.2` → `>=0.1.2-alpha.2 <0.2.0-0` and the per-version results in §2.2 were
confirmed with a self-contained semver comparator (numeric prerelease identifiers compared numerically,
alphanumeric lexically, any prerelease sorts below its release), executed in this session with no
third-party dependency and no file written to disk. No `node_modules`, repository, or system-temporary
path was read at any point; the fixture directory is byte-for-byte unchanged.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.