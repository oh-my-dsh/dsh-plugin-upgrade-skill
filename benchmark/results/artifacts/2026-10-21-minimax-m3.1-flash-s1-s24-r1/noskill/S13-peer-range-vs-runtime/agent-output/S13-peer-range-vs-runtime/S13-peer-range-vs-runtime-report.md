# S13 - Peer Range vs Runtime Reality

**Case:** `@deepseek-harness-tui/dsh-tui@0.1.0-beta.4` installed on dsh `0.1.2-alpha.5`
**Outcome:** npm install clean (no peer warnings) -> plugin crashes at startup with
`TypeError: events is not iterable`.

Evidence: fixture files in ./fixture/ (read-only, unmodified). All findings below come from the task
brief and that fixture only; no live host introspection was performed.

---

## 0. Summary in one paragraph

The plugin is broken because dsh **removed the `Session.events` array in `0.1.2-alpha.4`**,
replacing it with on-demand read APIs (`seq`, `eventAt()`, `snapshotEvents()`).
The plugin's 42 call sites still read `session.events`, so at runtime the property is
`undefined` and iterating it throws. npm stayed silent because it never looks at package
*contents*: it only compares **version numbers** against the declared peer range, and
`0.1.2-alpha.5` is inside `^0.1.2-alpha.2` (= `>=0.1.2-alpha.2 <0.2.0-0`) - a
purely arithmetic verdict. The breaking release `0.1.2-alpha.4` is *itself inside* the plugin's own
declared peer range, so the range advertised compatibility it could not deliver. **Peer-range satisfaction
is a static metadata check; runtime compatibility is a behavioural fact, and only the latter can catch a
removed API.** Remediation: pin dsh to `0.1.2-alpha.3` (satisfies the range *and* predates the
removal), or use a plugin build that migrated to the new read APIs.

---

## 1. The exact runtime incompatibility

### 1.1 WHAT was removed

`Session.events` - the *eagerly materialized* events array on a dsh session object.

### 1.2 WHEN it was removed

**dsh `v0.1.2-alpha.4`** - the release whose notes carry the breaking entry
(fixture: `dsh-changelog-excerpt.md`, "dsh-v0.1.2-alpha.4 release notes (excerpt)", section
*Other Changes*).

The changelog entry reads, in key points (entry id: dsh-v0.1.2-alpha.4 / "Replace `Session.events`
with on-demand read APIs", credited to @kermanx):

- `Session.events` was **replaced** by on-demand read APIs: `seq`, `eventAt()`,
  and `snapshotEvents()`.
- The eagerly materialized events array was removed **to reduce memory overhead in long sessions**.
- "Developers should pay attention to compatibility."

Because `alpha.4` is a **pre-release of the same `0.1.2` tuple** as the plugin's peer
floor (`0.1.2-alpha.2`), it was permitted to remove a public API without any change to the
semver *minor* line - and it landed strictly inside the range `^0.1.2-alpha.2` that the plugin
advertises.

The same excerpt lists a second compatibility-relevant alpha.4 entry: **"Distinguish
`SessionSeq` and `SessionLogOffset` with strong types"** (@tianyicui), also flagged
"developers should pay attention to compatibility".

### 1.3 WHAT replaced it

On-demand read APIs, named in the changelog entry:

| New API | Role (as named in the changelog) |
|---|---|
| `seq` | the session's sequence position - a handle for paging, not a materialized array |
| `eventAt()` | read a single event by sequence |
| `snapshotEvents()` | obtain a snapshot of events on demand |

The changelog states the motivation: the eagerly materialized events array was removed *to reduce memory
overhead in long sessions*. This is a **behavioural replacement, not a deprecation shim** - there is no
`Session.events` left on the object to read, not even an empty one. A plugin that still expects
the array cannot degrade gracefully; it must be ported.

### 1.4 How the incompatibility surfaces at runtime

Fixture `plugin-source-excerpt.js` (the plugin's own `channel.js`) shows the pattern:

    export function createChannel(ctx, initialAgent, options) {
        const events = liveAgent.session.events;    // line 734  -> undefined on alpha.4+
        replayEvents(agent.session.events);          // line 6685
    }
    // line 657:  const last = session.events.at(-1);
    // line 2685: const events = agent.session.events;
    // line 3004: const liveEvents = liveSession.events;
    // ... 42 total references to '.events' on session objects

Fixture `crash-stack.txt` shows the failure:

    Error: dsh: plugin tree failed to load: failed to apply loader entry dsh-tui
      (@deepseek-harness-tui/dsh-tui): events is not iterable
    TypeError: events is not iterable
        at prepareReplayEvents (channel.js:623:25)
        at replayEvents (channel.js:6127:33)
        at createChannel (channel.js:6685:5)
        at apply (plugin.js:425:21)
        at async Fiber._reload (cordis/lib/index.js:1355:5)

Chain of causation, precisely:

1. dsh alpha.4 deleted the `events` property from the session object -> `session.events === undefined`.
2. The plugin passes that `undefined` into `replayEvents` -> `prepareReplayEvents`
   iterates/spreads it -> JS throws `TypeError: events is not iterable`. The message names the
   *value*, not the *property*, which is why the error looks so opaque.
3. The throw happens inside the plugin's `createChannel`, which runs during `apply()` -
   i.e. while the host is *loading the plugin tree*, before any user interaction. Hence "crashes at
   startup": this is a **load-time / initialization-contract** failure, not a logic error in a rarely
   taken branch.

### 1.5 Scope of damage

The fixture states **42 total references** to `.events` on session objects. This is not one call
site that could be patched locally: **the whole transcript-replay subsystem** of the plugin depends on an
API that no longer exists. Recovery cannot come from a configuration flag - it requires either an older
dsh or a fixed plugin release.

---

## 2. WHY npm install produced no warnings

### 2.1 What a peer range actually guarantees

A peer range such as `"@deepseek-ai/dsh-session": "^0.1.2-alpha.2"` is a **declaration by the
plugin publisher** of the set of host versions the plugin claims to work with, expressed as an *interval
of version numbers*. It guarantees npm exactly one thing:

> **"The version of this host package that is installed (or that npm resolves) has a version string that
> lies inside the declared interval."**

Concretely, `^0.1.2-alpha.2` expands to `>=0.1.2-alpha.2 <0.2.0-0` (as the fixture's own
note states). The installed host bundles the `dsh-*` packages at `0.1.2-alpha.5`, which
is inside that interval, so npm's peer check **passes silently**. Fixture `npm-install-output.txt`
confirms: 77 packages added, **no peer dependency warnings emitted**.

Note the direction of the guarantee: it is a *numeric containment* statement. npm resolves the peer graph
and compares **version strings**. It does not load, parse, execute, introspect or diff the host packages.

### 2.2 What a peer range does NOT guarantee

- **Not** that the specific API the plugin calls still exists in the installed version (exactly this case:
  `Session.events` is gone).
- **Not** that a version *newer* than the floor is API-compatible with the floor. Semver ordering is a
  total order on *strings*; it is **not** a set-inclusion relation on *APIs*. A later release may remove,
  rename, re-type or re-order what an earlier one exposed.
- **Not** that the plugin was ever executed against that version. npm never runs plugin code.
- **Not** that retained APIs kept their contracts. A method can still exist with a changed signature,
  ordering, units, or type identity.
- **Not** that the *shape of returned values* is unchanged (array vs. handle vs. single element; array vs.
  iterator-only; branded/nominal types).
- **Not** that the host binary the user launches is the resolved version - only that the *resolved package
  version* satisfies the interval.
- **Not** anything about internal or third-party helper packages the plugin reaches indirectly, nor about
  lifecycle/initialization order, event names, plugin-tree contracts, or config schemas.
- **Not** anything about pre-release instability. `0.1.2-alpha.4` is a *pre-release* of the same
  tuple; semver exempts pre-releases from the compatibility promise, and npm's range check encodes no
  "alpha may break anything" signal.

**In one sentence:** a peer range is a *promise made by the publisher*; npm only verifies that the promise is
*arithmetically consistent* with the installed version number - it never verifies that the promise is *true*.

### 2.3 Why this particular range contains the breaking release

`^0.1.2-alpha.2` -> `>=0.1.2-alpha.2 <0.2.0-0`.

`0.1.2-alpha.4` (the removal) and `0.1.2-alpha.5` (your host) are both **inside** that
interval. So the plugin's own metadata, taken at face value, *advertises support for the exact version that
breaks it*. This is the sharpest form of the failure: npm was not merely unable to detect the problem - the
range **expresses the wrong promise**, so no amount of "trusting the peer check" would have helped, because
the check was answering a different question than the one that mattered.


---

## 3. The fundamental principle

### 3.1 "Peer range satisfaction" checks WHAT

- **A static, package-metadata-level property**: *version-string satisfiability*.
- It compares the **declared interval** in `package.json#peerDependencies` with the **resolved
  version string** of each host package. It is a **text/number comparison performed without executing
  anything**.
- Its unit of truth is the **version identifier**, not the **program**.
- It is a **necessary-but-not-sufficient proxy** for compatibility: a proxy *the publisher wrote*, checked
  by a *third party* (npm) that cannot see the code.

### 3.2 "Runtime compatibility" checks WHAT

- **A behavioural, code-level property**: *does the code still work*.
- It requires **loading the plugin into the actual host** and **exercising the API paths the plugin
  actually uses** - either at boot (`apply()`/loader phase, exactly where this crash occurred) or
  through the host's own test surface.
- Its unit of truth is the **call site** (`session.events`) and the **real object's shape** at
  that version.
- It is **version-specific but not version-encodable**: nothing in a semver string can express "this API
  is gone".

> **The gap:** peer-range satisfaction asks *"is my number in your interval?"*; runtime compatibility asks
> *"does the function I call still exist, and does it still mean what I think?"*. A version number is a
> **label on a release**, never a **description of its API surface**. Nothing in the numbering scheme
> prevents an alpha from removing a public property - and the changelog says so explicitly.

### 3.3 Categories of breakage that pass peer-range validation but crash at runtime

**(a) Removed / renamed API surface - the case in this report.**
The property or export is deleted; the plugin's read returns `undefined` and any use of it throws.
`Session.events` removed in alpha.4 -> `TypeError: events is not iterable`.
*Diagnostic fingerprint:* the error names a value (`events is not iterable`, `cannot read
properties of undefined`) rather than a missing import, and the stack points into plugin code at a
line that looks correct in isolation.

**(b) Retained API with a changed contract (semantic / type drift).**
The symbol still exists - so nothing "is missing" - but its behaviour, units, ordering, nullability or type
identity changed. The alpha.4 entry **"Distinguish `SessionSeq` and `SessionLogOffset`
with strong types"** is exactly this shape of change: a value that used to be interchangeable is now a
*branded* type, so passing a `SessionLogOffset` where a `SessionSeq` is expected is no
longer a harmless mismatch - it is a type/assertion error or a silently wrong sequence number.
*Diagnostic fingerprint:* a type-assertion failure or wrong data rather than "undefined is not a
function", and it appears only on particular code paths (e.g. resumption from a log offset).

**(c) Structural / shape change of a value that keeps the right name.**
The property exists but now holds a different *kind* of thing - a handle, a cursor, a single element, or an
object with different keys - so the plugin's iteration, `.at(-1)`, spread, or index access
fails. Note the plugin's own code: `session.events.at(-1)` (line 657) needs both an array *and*
`Array.prototype.at`; `replayEvents` needs an *iterable*. A "replacement API" that
returns a snapshot handle satisfies the peer check and still breaks iteration.
*Diagnostic fingerprint:* `X is not iterable`, `X.map is not a function`,
`X.at is not a function`.

**(d) Lifecycle / initialization-contract change.**
The API is still there, but the host now calls or expects plugin code at a *different point in the
lifecycle* - e.g. the session is not yet materialized when a loader entry's `apply()` runs, or the
loader-entry contract itself changed. The plugin then throws during tree load even though every symbol it
touches exists. Our stack shows precisely this shape: `at apply (plugin.js:425)` ->
`async Fiber._reload` - the failure is in the *loading* phase, before any feature use.
*Diagnostic fingerprint:* the crash happens at plugin-tree load/apply, with a stack that includes the
host's plugin loader.

**(e) Configuration / schema / event-name drift.**
The plugin reads a config key, an event name, or a config schema that the host renamed, re-typed or
dropped. No API is "missing" in the object sense, but the plugin cannot obtain its configuration and fails
on a default/lookup path. Peer ranges say nothing about host *config* or *event* compatibility.

**(f) Transitive / internal dependency drift.**
The plugin imports an internal helper (or a dsh sub-package) whose *default export shape* changed between
the floor and the installed version, while every declared peer range still holds.

### 3.4 Why `alpha.5 > alpha.2` proves nothing

Semver ordering (`0.1.2-alpha.0 < 0.1.2-alpha.1 < ... < 0.1.2-alpha.5`) answers a single
question: *"which release came later?"* It is a **total order on identifiers**, deliberately *decoupled*
from API stability:

- It does **not** mean "superset of the older release's APIs" - that is exactly the assumption alpha.4
  violated by removing `Session.events`.
- Under semver, **pre-releases carry no compatibility promise at all**: an alpha may change anything,
  including removing public API, without being obliged to bump minor/major. The `0.1.2-alpha.4`
  removal was therefore *legal* and, simultaneously, *inside* the plugin's declared range.
- Corollary: **for a `0.x` alpha line, the only meaningful compatibility test is behavioural** -
  the alpha's API is a moving target that the version number cannot describe. The changelog itself flags
  this: *"Developers should pay attention to compatibility."*

---

## 4. What the plugin author should have done

### 4.1 Before publishing (catch it)

1. **Test against the actual target version - the real host, not a mock.**
   This is the decisive fix. A unit test with a *hand-built* session object (`{ events: [] }`)
   encodes the plugin's own assumption and can never detect that the assumption is now wrong. A **CI job
   that installs the plugin into the genuine `@deepseek-ai/dsh` at the exact versions users will
   have, and boots it**, would have failed at alpha.4 - the failure reproduces at *loader/apply* time, so
   even a trivial "start the host with the plugin enabled" smoke test suffices.

2. **Test the range you declare, at both ends.**
   A matrix over the *actual declared peer range* - minimum (`0.1.2-alpha.2`) **and** current
   (`0.1.2-alpha.5`) - is the minimum honest contract for a peer range. If the plugin only works
   on alpha.2-alpha.3, that is what the range must say (see 4.2).

3. **Compile against the installed host's type definitions.**
   `tsc --noEmit` with the peer version pinned to the *newest* supported host would have flagged
   *all 42* `.events` references as `Property 'events' does not exist on type 'Session'`
   at build time, long before publication. Typing the session port properly (instead of `any`) is
   what makes the compiler a compatibility oracle.

4. **Watch the host's release notes / breaking-change channel.**
   Subscribe to the dsh changelog for the alpha line and treat "Remove"/"Replace" entries as release
   blockers for the plugin.

5. **Ship a compatibility smoke script** that boots the plugin against a pinned host version, so
   regressions are caught by a maintainer rather than reported by users.

### 4.2 To help users (encode the right thing in the right place)

| Field | What it can honestly encode | What it must NOT be used for |
|---|---|---|
| `peerDependencies` | the **minimum host version the code genuinely works with** - a *floor* derived from real testing. Since the code needs `Session.events`, the honest range is `>=0.1.2-alpha.2 <0.1.2-alpha.4` (alpha.2/alpha.3 only). If the plugin migrates to `seq`/`eventAt()`/`snapshotEvents()`, the floor becomes `>=0.1.2-alpha.4` and the range must *exclude* older hosts. | it must not span a known breaking host release; a range that includes alpha.4 while the code calls `Session.events` is a false promise - precisely the current bug. |
| `engines` | the **runtime environment** (Node.js version, and optionally the dsh *host binary* floor if it is the same artifact). | it cannot express *API-level* facts. `engines: { node: ">=20" }` says nothing about whether `Session.events` exists. Do not smuggle API compatibility into it, and do not use a non-semver version string to dodge the range check. |
| runtime guard | **capability detection** - the only mechanism that can express "this API may or may not exist". | - |
| README / CHANGELOG | a **compatibility matrix**: last known-good dsh version, the release that removed `Session.events`, and the upgrade note. | - |

**Rule of thumb:** *the peer range declares the floor you tested against; the runtime guard handles
everything above the floor that might still differ.* A version range is a **floor**, not a **ceiling** and
not a **feature matrix** - the moment two host versions inside your declared range behave differently, the
range is wrong and a feature-detection guard is required.

### 4.3 The runtime feature-detection guard (what "helping users" looks like in code)

Detect the **capability**, not the version, and fail loudly and actionably instead of throwing
`events is not iterable`:

    function readEvents(session) {
      // Legacy path: dsh < 0.1.2-alpha.4
      if (Array.isArray(session.events)) return session.events;

      // New path: dsh >= 0.1.2-alpha.4  (Session.events replaced by on-demand read APIs)
      if (typeof session.eventAt === 'function' && typeof session.snapshotEvents === 'function') {
        return session.snapshotEvents();          // adapt to the replacement API
      }

      // Unknown host: fail with an actionable message, not a TypeError
      throw new Error(
        'dsh-tui requires dsh 0.1.2-alpha.2..0.1.2-alpha.5 APIs. ' +
        'Session.events was removed in dsh 0.1.2-alpha.4 (use seq/eventAt()/snapshotEvents()). ' +
        'Installed host: ' + hostVersion + '.'
      );
    }

The same guard should cover the second alpha.4 change: **do not pass a `SessionLogOffset` where a
`SessionSeq` is expected** - the two are now distinct strong types.

With such a guard, one plugin build can support alpha.2-alpha.5, and an unsupported host produces a
*readable* error instead of a stack trace - ideally the plugin keeps working (degraded mode) across the
removal boundary.

---

## 5. What you can do RIGHT NOW, before installing

### 5.1 The concrete pre-install check (a "peer range is not enough" procedure)

A **five-minute, read-only** procedure that would have caught this exact issue:

**Step 1 - read the peer range** (it tells you the author's *claim* and the window you must audit):

    npm view @deepseek-harness-tui/dsh-tui@0.1.0-beta.4 peerDependencies

Note the lower bound (`0.1.2-alpha.2`) and the upper bound (`<0.2.0-0`).

**Step 2 - enumerate every host version inside that range.** For an alpha line this is exactly the set of
releases whose APIs you must assume are *not* stable.

**Step 3 - read the host's changelog for every version in that window and look for removal/replacement
entries.** This is the step that catches the bug: the alpha.4 entry *"Replace `Session.events`
with on-demand read APIs: `seq`, `eventAt()`, and `snapshotEvents()`"*. Any
"Removed", "Replace", "Rename" or "strong types" entry in the range window is a **candidate breaking
release** - mark the range **suspect** and go to Step 4.

**Step 4 - grep the plugin's code for the removed API, without installing it.** Download and unpack the
tarball into a scratch directory and search it:

    npm pack @deepseek-harness-tui/dsh-tui@0.1.0-beta.4
    tar -xzf deepseek-harness-tui-dsh-tui-0.1.0-beta.4.tgz
    grep -rn "\.events" package/ | wc -l          # -> 42 hits on session objects
    grep -rn "session\.events" package/channel.js

**Intersection test:** *does the plugin reference an API that the changelog says was removed at a version
your host is at - or that falls inside the declared peer range?* Here the answer is yes -> **do not
install** against alpha.4+; install only against a host older than alpha.4.

**Step 5 - cross-check the host's type definitions** (if the host ships `.d.ts`). Grepping the
installed host's typings for the properties the plugin uses turns the whole thing into a mechanical check:

    grep -rn "events" <host>/**/*.d.ts | grep -i session      # does Session still declare .events?

**Step 6 - sanity-check the transitive graph, but do not stop there:**

    npm ls @deepseek-harness-tui/dsh-tui @deepseek-ai/dsh
    npm explain @deepseek-ai/dsh-session

This confirms *versions* only. **A green `npm ls` is not evidence of compatibility** - it is exactly
the check that already passed and already misled you.

### 5.2 The immediate remediation for the install you already have

Because the peer range legitimately admits alpha.2/alpha.3, and the plugin's code is valid there:

    npm i -g @deepseek-ai/dsh@0.1.2-alpha.3     # satisfies ^0.1.2-alpha.2 AND predates the removal

Alternatives, in order of preference:

1. **Use a plugin build that has migrated** to `seq`/`eventAt()`/`snapshotEvents()`
   (existence and version of such a build: *unconfirmed from the fixture* - check the plugin's
   releases/changelog).
2. **Keep alpha.5 and patch/override the plugin locally** to use the new read APIs (42 call sites - a real
   port, not a one-line fix).
3. **Await a fixed plugin release**, with the pre-install check of 5.1 applied to it.

### 5.3 The cheapest post-install guard (run once, in a throwaway profile)

Because the failure happens at *plugin-tree load*, one boot with the plugin enabled is a complete test:

    dsh --headless   # or a minimal isolated profile with the plugin enabled

If the host boots the plugin, the load-time contract holds; if it throws `events is not iterable`,
you have your answer in three seconds instead of after a confusing session.

---

## 6. Unconfirmed / not established by the fixture

- The precise **contract** of `seq`, `eventAt()` and `snapshotEvents()`
  (parameter/return types; whether `eventAt` takes a `SessionSeq`; whether
  `snapshotEvents()` returns an array) - the fixture names the APIs only.
- Whether the plugin's `0.1.0-beta.4` was **ever run against alpha.4/alpha.5** by its author -
  no CI evidence in the fixture.
- Whether a **fixed plugin release** exists (a beta using the new read APIs) - not in the fixture.
- Whether the plugin is also affected by the **`SessionSeq`/`SessionLogOffset`**
  strong-type change; the plugin excerpt shows only `.events` usage (42 references), so that
  impact on this plugin is *unconfirmed*.
- The exact **npm peer-resolution mechanism** behind the silent install (auto-installing peers vs. reusing
  an already-global host) - the fixture states only that no warnings were emitted and that npm's peer
  check passed silently; general npm behaviour is not evidence about this specific tree.
- Whether `dsh-tui@0.1.0-beta.4` declares a peer on the `@deepseek-ai/dsh` meta-package
  in addition to the 27 `dsh-*` sub-packages - the fixture lists only the sub-packages.
- The exact set of 27 peer package names beyond the three shown in the fixture excerpt
  (`dsh-llm`, `dsh-agent`, `dsh-session`, plus "24 more") - not enumerated in
  the fixture.

---

## 7. Evidence index

| Fixture file | What it establishes |
|---|---|
| `fixture/README.md` | the pack layout; read-only, must remain unchanged |
| `fixture/npm-install-output.txt` | install succeeded, **no peer warnings**; all 27 `dsh-*` peers declared `^0.1.2-alpha.2`; host bundles those packages at `0.1.2-alpha.5`; the range expands to `>=0.1.2-alpha.2 <0.2.0-0` |
| `fixture/crash-stack.txt` | `TypeError: events is not iterable`; originates in the plugin's own `channel.js`; occurs at loader/`apply()` time |
| `fixture/plugin-source-excerpt.js` | 42 references to `.events` on session objects; `session.events` read at line 734; `replayEvents(agent.session.events)` at 6685; `.events.at(-1)` at 657 |
| `fixture/dsh-changelog-excerpt.md` | **dsh `v0.1.2-alpha.4`**: `Session.events` replaced by `seq`/`eventAt()`/`snapshotEvents()` (memory motivation, compatibility warning); `SessionSeq` vs `SessionLogOffset` strong types |

*All findings above are drawn from the task brief and the fixture in this directory. The fixture was not
modified and no live host introspection was performed.*
