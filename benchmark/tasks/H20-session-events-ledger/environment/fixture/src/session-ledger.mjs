// session-ledger.mjs — plugin-internal session event ledger access.
// Written against dsh 0.1.2-alpha.3: every read goes through the implicit
// whole-event-array surface (`session.events`) and the durable fork boundary
// lives on the session header (`session.header.seedLength`).
//
// This module is the ONLY place the plugin reads the session log. The five
// helpers below are the contracts the rest of the plugin relies on.

// (1) The complete VISIBLE event log — fork-inherited history included.
export function fullVisibleLog(session) {
  return session.events
}

// (2) The one event at an exact session sequence number, or null.
export function eventAtSeq(session, seq) {
  const events = session.events
  return events[seq] ?? null
}

// (3) The visible suffix of the log at and after fromSeq, in log order.
export function windowFrom(session, fromSeq) {
  return session.events.slice(fromSeq)
}

// (4) The event at `seq`, but only when that seq lies inside the window at
//     and after fromSeq; otherwise null.
export function eventInWindow(session, fromSeq, seq) {
  if (seq < fromSeq) return null
  const events = session.events
  if (seq >= events.length) return null
  return events[seq] ?? null
}

// (5) Only the events this session produced itself — the fork-inherited
//     prefix excluded.
export function ownOnlyEvents(session) {
  const cut = session.header?.seedLength ?? 0
  return session.events.slice(cut)
}
