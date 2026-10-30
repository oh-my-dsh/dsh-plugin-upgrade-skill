# JUDGE BRIEF · noskill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/report.md

# S6 · Corridor Net-State Judgment — Migration Report

**Scope:** Read-only analysis of `fixture/` (target host **alpha.2**). No fixture file was modified.
**Evidence basis:** fixture files only (per the NOSKILL / workspace-boundary rules, the reference cards and the DSH source live outside my allowlist, so any semantics I cannot derive from the fixture is marked *unconfirmed*).

---

## 1. What the defense code actually is (verified from the fixture)

`fixture/src/events.ts`:

```ts
export function produceExternalEvent(session: any, payload: any): void {
  const event = { type: 'third-party/informational', payload }
  // (comment) alpha.1 移除了 SessionEvent.ignorable（DSH-0.1.2-A1-02）…
  // (comment) 迁移到 alpha.2 时这段要继续保留
  delete (event as any).ignorable
  session.append(event)
}
```

Two facts are directly observable in the code, independent of any comment:

1. **The "defense" is a literal no-op.** The event object is constructed as an object
   literal containing only `type` and `payload`. It never has an `ignorable`
   property, so `delete (event as any).ignorable` deletes nothing. It cannot have
   had any protective effect in alpha.1 either — there was never a marker present on
   the object being appended.
2. **`session` is typed `any`.** The code never consults the real
   `Session.append` surface, so it does not actually know whether an
   `ignorable` parameter even exists on the public API.

The comment asserts: alpha.1 removed `SessionEvent.ignorable`; readers reject the
event unless the marker is deleted; the deletion must be kept when migrating to
alpha.2. That assertion is a producer-side rationalization and is contradicted by
the code above (there is no marker to delete) and by the version corridor below.

---

## 2. Fate of the defense code: **DELETE**

**Decision: delete the `delete (event as any).ignorable` line and the surrounding
comment. Keep `session.append(event)` unchanged.**

Reasoning, accounting for the full corridor history:

- **alpha.1 (removal):** `SessionEvent.ignorable` was *temporarily removed*. Whatever
  the original semantics were, the field was not part of the type during alpha.1, so a
  producer could not and did not need to set it. The defense line targets a marker that
  the code itself never creates — in alpha.1 it was already dead code.
- **alpha.2 (restore):** the retention semantics are *restored* (the corridor
  "remove-then-restore" path named in the fixture README: A1-02 removal → A2-01
  restore). The net state across the corridor is therefore **restoration of the
  original semantics**, not a new regime that still requires a workaround. A defense
  written to patch over a *temporary* removal has no reason to survive the restoration.
- **The marker is not the producer's to manage.** `ignorable` is a session/framework
  retention concern, not a field a producer fabricates or strips. The comment inverts
  the producer/consumer relationship: a producer does not "defend" by deleting an
  internal marker; it simply emits the event through the public API and lets the
  session decide retention.

Net conclusion: the line is (a) a no-op, (b) aimed at a state that no longer exists
in the target alpha.2, and (c) based on an inverted model of who owns the marker.
**Delete it.**

---

## 3. Correct producer semantics

- **A producer emits an event through the session's public append API using only the
  public event fields** (`type`, `payload`, and any other documented public fields).
  It does not set, delete, or otherwise manipulate `ignorable`.
- **The public `Session.append(...)` surface does not expose an `ignorable`
  parameter** (per the task hint). Retention/ignorability is a session-internal
  concern that the session derives from the event's nature — not something the calling
  plugin controls. *Unconfirmed: I could not inspect the actual alpha.2
  `Session.append` signature because the DSH checkout / reference cards are outside
  this task's read allowlist.*
- **What an ordinary plugin should do:** just

  ```ts
  session.append({ type: 'third-party/informational', payload })
  ```

  — with no `ignorable` manipulation of any kind. If the plugin's intent is that the
  event be persistent/retained, that intent is expressed by the event type and the
  public append contract, not by hand-editing an internal field.

---

## 4. Verified vs. unconfirmed

**Verified (from the fixture):**
- `src/events.ts` constructs `{ type, payload }` and runs `delete event.ignorable`
  (a no-op), then calls `session.append(event)`.
- The fixture README states the corridor: alpha.1 removed `SessionEvent.ignorable`,
  alpha.2 restored the retention semantics (remove-then-restore), and that the correct
  action is to delete the defense.

**Unconfirmed (outside my allowlist / not derivable from the fixture):**
- Exact contents of the A1-02 / A2-01 reference cards (I did not read them; NOSKILL
  forbids reading the skills/ directory, and the cards are not mounted here).
- Exact `Session.append` signature and the precise internal retention mechanics in
  alpha.2 (including whether `ignorable` is internal-only or also a public event
  field in the restored alpha.2).
- Whether `ignorable` was ever a producer-settable field in pre-alpha.1 versions.

---

## 5. Recommended change (not applied — fixture is read-only)

```diff
  export function produceExternalEvent(session: any, payload: any): void {
    const event = { type: 'third-party/informational', payload }
-   // (comment: "must keep when migrating to alpha.2")
-   delete (event as any).ignorable
    session.append(event)
  }
```

The fixture was left completely unchanged, as required.


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.