// Unit tests for the H20-session-events-ledger judge helpers.
// Covers the ten regression controls from the task design:
//   1 untouched (old fixture source)        → behavioral 0, stale+index flags
//   2 stale session.events (partial)        → capped at 30
//   3 fake getEvents rename                 → capped at 15
//   4 ownEvents semantic misuse             → ~0.57, no cap needed
//   5 seq-as-array-index                    → capped at 70
//   6 off-by-one window (end as inclusive)  → ~0.79
//   7 internal/private workaround           → capped at 60
//   8 oracle                                → 100
//   9 honest alternative implementation     → 99
//  10 comments naming the trap APIs only    → 100 (no false positive)
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleScore, capFor, extractNamedFunctions, scanForbidden, scoreCanonical, scoreHygiene, stripComments,
} from './judge-utils.mjs'

// ── control sources ───────────────────────────────────────────────────────────

const ORACLE = `
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session/types'
export function fullVisibleLog(session) { return session.snapshotEvents() }
export function eventAtSeq(session, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0 || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}
export function windowFrom(session, fromSeq) { return session.snapshotEvents(SessionLogOffset(fromSeq)) }
export function eventInWindow(session, fromSeq, seq) {
  if (!Number.isSafeInteger(seq) || seq < fromSeq || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}
export function ownOnlyEvents(session) { return session.ownEvents() }
`

const OLD = `
export function fullVisibleLog(session) { return session.events }
export function eventAtSeq(session, seq) { const events = session.events; return events[seq] ?? null }
export function windowFrom(session, fromSeq) { return session.events.slice(fromSeq) }
export function eventInWindow(session, fromSeq, seq) {
  if (seq < fromSeq) return null
  const events = session.events
  if (seq >= events.length) return null
  return events[seq] ?? null
}
export function ownOnlyEvents(session) {
  const cut = session.header?.seedLength ?? 0
  return session.events.slice(cut)
}
`

const STALE_PARTIAL = `
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session/types'
export function fullVisibleLog(session) { return session.events }
export function eventAtSeq(session, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0 || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}
export function windowFrom(session, fromSeq) { return session.snapshotEvents(SessionLogOffset(fromSeq)) }
export function eventInWindow(session, fromSeq, seq) {
  if (!Number.isSafeInteger(seq) || seq < fromSeq || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}
export function ownOnlyEvents(session) { return session.ownEvents() }
`

const FAKE_GET_EVENTS = `
export function fullVisibleLog(session) { return session.getEvents() }
export function eventAtSeq(session, seq) { return session.getEvents()[seq] ?? null }
export function windowFrom(session, fromSeq) { return session.getEvents().slice(fromSeq) }
export function eventInWindow(session, fromSeq, seq) {
  if (seq < fromSeq) return null
  const events = session.getEvents()
  if (seq >= events.length) return null
  return events[seq] ?? null
}
export function ownOnlyEvents(session) {
  const cut = session.header?.seedLength ?? 0
  return session.getEvents().slice(cut)
}
`

const OWN_EVENTS_MISUSE = `
export function fullVisibleLog(session) { return session.ownEvents() }
export function eventAtSeq(session, seq) { return session.ownEvents()[seq] ?? null }
export function windowFrom(session, fromSeq) { return session.ownEvents().slice(fromSeq) }
export function eventInWindow(session, fromSeq, seq) {
  if (seq < fromSeq) return null
  const events = session.ownEvents()
  if (seq >= events.length) return null
  return events[seq] ?? null
}
export function ownOnlyEvents(session) { return session.ownEvents() }
`

const OFF_BY_ONE = `
export function fullVisibleLog(session) { return session.snapshotEvents() }
export function eventAtSeq(session, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0 || seq >= session.seq) return null
  return session.eventAt(seq) ?? null
}
export function windowFrom(session, fromSeq) { return session.snapshotEvents(fromSeq, session.seq - 1) }
export function eventInWindow(session, fromSeq, seq) {
  if (!Number.isSafeInteger(seq) || seq < fromSeq || seq >= session.seq) return null
  return session.eventAt(seq) ?? null
}
export function ownOnlyEvents(session) { return session.ownEvents() }
`

const SEQ_AS_INDEX = `
export function fullVisibleLog(session) { return session.snapshotEvents() }
export function eventAtSeq(session, seq) { return session.snapshotEvents()[seq] ?? null }
export function windowFrom(session, fromSeq) { return session.snapshotEvents(fromSeq) }
export function eventInWindow(session, fromSeq, seq) {
  if (seq < fromSeq) return null
  return session.snapshotEvents(fromSeq)[seq] ?? null
}
export function ownOnlyEvents(session) { return session.ownEvents() }
`

const PRIVATE_BYPASS = `
export function fullVisibleLog(session) { return session.log }
export function eventAtSeq(session, seq) { return session.log[seq] ?? null }
export function windowFrom(session, fromSeq) { return session.log.slice(fromSeq) }
export function eventInWindow(session, fromSeq, seq) {
  if (seq < fromSeq) return null
  if (seq >= session.log.length) return null
  return session.log[seq] ?? null
}
export function ownOnlyEvents(session) { return session.log.slice(session.inheritedEventCount) }
`

const HONEST_ALT = `
export function fullVisibleLog(session) { return session.snapshotEvents() }
export function eventAtSeq(session, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0) return null
  return session.snapshotEvents().find((event) => event.seq === seq) ?? null
}
export function windowFrom(session, fromSeq) { return session.snapshotEvents(fromSeq) }
export function eventInWindow(session, fromSeq, seq) {
  if (seq < fromSeq) return null
  return session.snapshotEvents(fromSeq).find((event) => event.seq === seq) ?? null
}
export function ownOnlyEvents(session) { return session.snapshotEvents(session.inheritedEventCount) }
`

const COMMENT_ONLY = `
// The removed surface was session.events; the invented session.getEvents()
// would be wrong, private session.log / session.eventsSnapshot are off-limits,
// and treating a sequence as an array index (events[seq]) breaks windows.
// Correct: snapshotEvents / eventAt / ownEvents per the alpha.4 types.
export function fullVisibleLog(session) { return session.snapshotEvents() }
export function eventAtSeq(session, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0 || seq >= session.seq) return null
  return session.eventAt(seq) ?? null
}
export function windowFrom(session, fromSeq) { return session.snapshotEvents(fromSeq) }
export function eventInWindow(session, fromSeq, seq) {
  if (!Number.isSafeInteger(seq) || seq < fromSeq || seq >= session.seq) return null
  return session.eventAt(seq) ?? null
}
export function ownOnlyEvents(session) { return session.ownEvents() }
`

const ARROW_STYLE = `
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session/types'
export const fullVisibleLog = (session) => session.snapshotEvents()
export const eventAtSeq = (session, seq) => {
  if (!Number.isSafeInteger(seq) || seq < 0 || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}
export const windowFrom = (session, fromSeq) => session.snapshotEvents(SessionLogOffset(fromSeq))
export const eventInWindow = (session, fromSeq, seq) => {
  if (!Number.isSafeInteger(seq) || seq < fromSeq || seq >= session.seq) return null
  return session.eventAt(SessionSeq(seq)) ?? null
}
export const ownOnlyEvents = (session) => session.ownEvents()
`

// ── stripComments ────────────────────────────────────────────────────────────

test('stripComments removes line and block comments but keeps strings', () => {
  const src = `const a = "http://x" // line // comment\nconst b = '/* not a comment */'\n/* block\ncomment */ const c = 1\nconst d = \`// template\``
  const out = stripComments(src)
  assert.ok(!out.includes('line // comment'))
  assert.ok(!out.includes('block\ncomment'))
  assert.ok(out.includes('"http://x"'))
  assert.ok(out.includes("'/* not a comment */'"))
  assert.ok(out.includes('`// template`'))
})

// ── extractNamedFunctions ────────────────────────────────────────────────────

test('extractNamedFunctions handles function declarations and arrow consts', () => {
  for (const src of [ORACLE, ARROW_STYLE, OLD, FAKE_GET_EVENTS]) {
    const bodies = extractNamedFunctions(stripComments(src))
    for (const name of ['fullVisibleLog', 'eventAtSeq', 'windowFrom', 'eventInWindow', 'ownOnlyEvents']) {
      assert.ok(bodies.has(name), `${name} missing`)
      assert.ok(bodies.get(name).trim().length > 0, `${name} body empty`)
    }
  }
})

test('extractNamedFunctions captures inline arrow expressions', () => {
  const bodies = extractNamedFunctions(stripComments(ARROW_STYLE))
  assert.ok(/snapshotEvents/.test(bodies.get('fullVisibleLog')))
  assert.ok(/ownEvents/.test(bodies.get('ownOnlyEvents')))
  assert.ok(/snapshotEvents/.test(bodies.get('windowFrom')))
  assert.ok(/eventAt/.test(bodies.get('eventAtSeq')))
})

// ── scanForbidden ────────────────────────────────────────────────────────────

test('scanForbidden flags each trap form and nothing else', () => {
  const oracleScan = scanForbidden(stripComments(ORACLE))
  assert.deepEqual(oracleScan, { staleEvents: false, getEvents: false, privateAccess: false, seqIndex: false })

  const oldScan = scanForbidden(stripComments(OLD))
  assert.deepEqual(oldScan, { staleEvents: true, getEvents: false, privateAccess: false, seqIndex: true })

  assert.equal(scanForbidden(stripComments(FAKE_GET_EVENTS)).getEvents, true)
  assert.equal(scanForbidden(stripComments(OWN_EVENTS_MISUSE)).seqIndex, true)
  assert.equal(scanForbidden(stripComments(SEQ_AS_INDEX)).seqIndex, true)
  assert.equal(scanForbidden(stripComments(PRIVATE_BYPASS)).privateAccess, true)

  // a comment that names the trap APIs must not trigger anything
  assert.deepEqual(scanForbidden(stripComments(COMMENT_ONLY)), { staleEvents: false, getEvents: false, privateAccess: false, seqIndex: false })
})

test('scanForbidden: console.log is not private access; own/snapshot APIs are not stale', () => {
  const src = `
export function demo(session) {
  console.log(session.ownEvents())
  console.log(session.snapshotEvents(0))
  console.log(session.eventAt(1))
  return session.ownEvents().length
}`
  const scan = scanForbidden(stripComments(src))
  assert.equal(scan.privateAccess, false)
  assert.equal(scan.staleEvents, false)
})

test('scanForbidden: bracket field access and destructure count as stale/private', () => {
  assert.equal(scanForbidden(`const x = session['events']`).staleEvents, true)
  assert.equal(scanForbidden(`const { events } = session`).staleEvents, true)
  assert.equal(scanForbidden(`const x = session['log']`).privateAccess, true)
  assert.equal(scanForbidden(`const x = session.eventsSnapshot`).privateAccess, true)
  assert.equal(scanForbidden(`const x = session.eventsSnapshot`).staleEvents, false)
})

// ── scoreCanonical ───────────────────────────────────────────────────────────

test('scoreCanonical: oracle earns full 15, alternatives earn 2s, traps earn 0s', () => {
  const oracle = scoreCanonical(extractNamedFunctions(stripComments(ORACLE)))
  assert.equal(oracle.score, 15, oracle.detail)

  const honest = scoreCanonical(extractNamedFunctions(stripComments(HONEST_ALT)))
  assert.equal(honest.score, 12, honest.detail)

  const offByOne = scoreCanonical(extractNamedFunctions(stripComments(OFF_BY_ONE)))
  assert.equal(offByOne.score, 12, offByOne.detail)
  assert.ok(/windowFrom:0/.test(offByOne.detail), offByOne.detail)

  const ownMisuse = scoreCanonical(extractNamedFunctions(stripComments(OWN_EVENTS_MISUSE)))
  assert.equal(ownMisuse.score, 3, ownMisuse.detail)

  const fake = scoreCanonical(extractNamedFunctions(stripComments(FAKE_GET_EVENTS)))
  assert.equal(fake.score, 0, fake.detail)

  const privateBypass = scoreCanonical(extractNamedFunctions(stripComments(PRIVATE_BYPASS)))
  assert.equal(privateBypass.score, 0, privateBypass.detail)
})

// ── hygiene + caps ───────────────────────────────────────────────────────────

test('scoreHygiene subtracts 3 per trap form', () => {
  assert.equal(scoreHygiene({ staleEvents: false, getEvents: false, privateAccess: false, seqIndex: false }), 12)
  assert.equal(scoreHygiene({ staleEvents: true, getEvents: false, privateAccess: false, seqIndex: false }), 9)
  assert.equal(scoreHygiene({ staleEvents: true, getEvents: true, privateAccess: true, seqIndex: true }), 0)
})

test('capFor picks the smallest triggered cap', () => {
  assert.equal(capFor({ staleEvents: true, getEvents: true, privateAccess: false, seqIndex: false }), 15)
  assert.equal(capFor({ staleEvents: true, getEvents: false, privateAccess: true, seqIndex: true }), 30)
  assert.equal(capFor({ staleEvents: false, getEvents: false, privateAccess: true, seqIndex: false }), 60)
  assert.equal(capFor({ staleEvents: false, getEvents: false, privateAccess: false, seqIndex: true }), 70)
  assert.equal(capFor({ staleEvents: false, getEvents: false, privateAccess: false, seqIndex: false }), null)
})

// ── assembleScore over the ten controls ──────────────────────────────────────

// Behavioral values measured against the real published package
// (see the task's validation notes): the numbers are inputs here because the
// unit tests must stay dependency-free.
const BEHAVIORAL = {
  oracle: 75,
  old: 0,
  stalePartial: 55,
  fakeGetEvents: 0,
  ownEventsMisuse: 45,
  offByOne: 55,
  seqAsIndex: 65,
  privateBypass: 75,
  honestAlt: 75,
  commentOnly: 75,
}

function controlScore(source, behavioral) {
  return assembleScore({ sources: [source], behavioral }).score
}

test('control 1: untouched old fixture scores 0 behaviorally and carries stale+index flags', () => {
  const { score } = assembleScore({ sources: [OLD], behavioral: BEHAVIORAL.old })
  assert.equal(score, 6, 'assembler alone gives the old source only residual hygiene; the judge gates untouched fixtures at 0 before this')
})

test('control 2: stale session.events read caps at 30', () => {
  assert.equal(controlScore(STALE_PARTIAL, BEHAVIORAL.stalePartial), 30)
})

test('control 3: invented getEvents() caps at 15', () => {
  const score = controlScore(FAKE_GET_EVENTS, BEHAVIORAL.fakeGetEvents)
  assert.ok(score <= 15 && score > 0, `got ${score}`)
  assert.equal(score, 6, 'getEvents + seq-index flags leave only 6 hygiene points; well below the 15 cap')
})

test('control 4: ownEvents semantic misuse lands in 0.4–0.7', () => {
  const score = controlScore(OWN_EVENTS_MISUSE, BEHAVIORAL.ownEventsMisuse)
  assert.ok(score >= 40 && score <= 70, `got ${score}`)
  assert.equal(score, 57)
})

test('control 5: seq-as-array-index caps at 70', () => {
  assert.equal(controlScore(SEQ_AS_INDEX, BEHAVIORAL.seqAsIndex), 70)
})

test('control 6: off-by-one window lands in 0.5–0.8', () => {
  const score = controlScore(OFF_BY_ONE, BEHAVIORAL.offByOne)
  assert.ok(score >= 50 && score <= 80, `got ${score}`)
  assert.equal(score, 79)
})

test('control 7: internal/private workaround caps at 60', () => {
  assert.equal(controlScore(PRIVATE_BYPASS, BEHAVIORAL.privateBypass), 60)
})

test('control 8: oracle scores 100', () => {
  assert.equal(controlScore(ORACLE, BEHAVIORAL.oracle), 100)
})

test('control 9: honest alternative implementation stays near-perfect', () => {
  assert.equal(controlScore(HONEST_ALT, BEHAVIORAL.honestAlt), 99)
})

test('control 10: comments naming trap APIs do not penalize correct code', () => {
  assert.equal(controlScore(COMMENT_ONLY, BEHAVIORAL.commentOnly), 100)
})

test('assembleScore clamps to 0..100 and reports reasons', () => {
  const { score, reasons } = assembleScore({ sources: [ORACLE], behavioral: 75 })
  assert.equal(score, 100)
  assert.ok(reasons.length >= 1)
  const negative = assembleScore({ sources: [OLD], behavioral: 0 })
  assert.equal(negative.score, 6)
})
