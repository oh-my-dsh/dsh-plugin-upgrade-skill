// session-ledger.mjs — migrated to dsh 0.1.2-alpha.4.
// alpha.4 removes `session.events`: event access goes through the explicit
// sequence/window ledger surface, with branded positions.
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session/types'

// (1) The complete VISIBLE event log — fork-inherited history included.
export function fullVisibleLog(session) {
  return session.snapshotEvents()
}

// (2) The one event at an exact session sequence number, or null.
export function eventAtSeq(session, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0 || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}

// (3) The visible suffix of the log at and after fromSeq, in log order.
export function windowFrom(session, fromSeq) {
  return session.snapshotEvents(SessionLogOffset(fromSeq))
}

// (4) The event at `seq`, but only when that seq lies inside the window at
//     and after fromSeq; otherwise null.
export function eventInWindow(session, fromSeq, seq) {
  if (!Number.isSafeInteger(seq) || seq < fromSeq || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}

// (5) Only the events this session produced itself — the fork-inherited
//     prefix excluded.
export function ownOnlyEvents(session) {
  return session.ownEvents()
}
