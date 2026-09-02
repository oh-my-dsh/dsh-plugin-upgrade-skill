# H20-session-events-ledger reference solution

See [solution/src/session-ledger.mjs](src/session-ledger.mjs) — the canonical
alpha.4 migration of the five helpers. Expected judge score 100.

## The change

`dsh-v0.1.2-alpha.4` removes the `Session.events` getter. The alpha.3 implicit
whole-event-array read surface becomes an explicit sequence/window ledger:

| Old (alpha.3) | New (alpha.4) | Helper |
|---|---|---|
| `session.events` | `session.snapshotEvents()` | `fullVisibleLog` (full visible log, inherited prefix included) |
| `events[seq]` | `session.eventAt(SessionSeq(seq))` with a bounds guard | `eventAtSeq`, `eventInWindow` |
| `events.slice(fromSeq)` | `session.snapshotEvents(SessionLogOffset(fromSeq))` (half-open, end exclusive = current `session.seq`) | `windowFrom` |
| `events.slice(header.seedLength ?? 0)` | `session.ownEvents()` | `ownOnlyEvents` |

Key semantics the fixture forces the agent to get right:

- **Visible vs own**: `snapshotEvents()` covers the whole visible log including
  the fork-inherited prefix; `ownEvents()` is `snapshotEvents(inheritedEventCount)`
  and drops that prefix. Swapping them is behaviorally wrong on forked sessions
  (the contract tests build a real seeded session with `inheritedEventCount = 4`).
- **Half-open window**: `snapshotEvents(from, toExclusive)` — the end is
  exclusive and defaults to the current `session.seq`. Treating it as inclusive
  (`snapshotEvents(from, session.seq - 1)`) drops the last event.
- **seq is not an array index**: `snapshotEvents(from)[seq]` indexes the
  windowed slice by a global sequence number and returns the wrong event (or
  none) for any window with `from > 0`; exact lookup is `eventAt(seq)`.
- **Brands and bounds**: `SessionSeq` / `SessionLogOffset` reject non-safe
  integers, negatives and `-0` with a `TypeError`, so the migration must guard
  `seq` before branding it (`eventAtSeq(session, -1)` must return `null`, not
  throw).
- **`header.seedLength` is gone**: the durable fork boundary moved off the
  header (`isSeeded` + `inheritedEventCount`), so the old
  `session.header?.seedLength ?? 0` silently degrades to `0` and returns the
  inherited prefix as "own".

## First-party provenance

- Repository: `deepseek-ai/deepseek-harness`
- `dsh-v0.1.2-alpha.3` = `dd6322d604e00eec1ba5e0c8541159906a21094a`
- `dsh-v0.1.2-alpha.4` = `4e84901e6471b79ec0338099867ebb4606d12bb5`
- `packages/core/session/src/index.ts` (the plugin-facing `Session` class; the
  diff is the `get events()` removal and the `eventAt` / `snapshotEvents` /
  `ownEvents` / `isOwnSeq` additions)
- `packages/core/session/src/types.ts` (`SessionSeq`, `SessionLogOffset` brands
  and their admission guards; `SessionHeader.isSeeded` replacing `seedLength`)
- `packages/core/session/README.md` (own/inherited cut contract for
  `ownEvents()`)
- Published runtime the fixture pins: `@deepseek-ai/dsh-session@0.1.2-alpha.4`
  (exact; lockfile integrity fixed in `environment/fixture/package-lock.json`).

Note: `packages/api/session-controller/src/client/sessions/session.ts` is the
Session Controller's client `Session` (a different class that keeps a *private*
stream field also named `events`) — the removed plugin-facing surface is the
`@deepseek-ai/dsh-session` class above, which is what the fixture exercises.
Release notes were used only as a pointer; the tag source above is the
authority for every API shape in this solution.

## Scoring

75 behavioral (real alpha.4 sessions) + 15 canonical API migration + 12
hygiene, with hard caps for the trap forms (stale read 30, invented
`getEvents()` 15, internal-field access 60, seq-as-array-index 70) and flat 0
for an untouched fixture or a tampered runtime. Full model in
[tests/judge.mjs](../tests/judge.mjs).
