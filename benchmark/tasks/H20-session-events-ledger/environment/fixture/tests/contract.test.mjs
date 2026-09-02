// Behavioral contract for the session event ledger module.
// Builds real dsh 0.1.2-alpha.4 session objects and checks only the public
// behavior of the five helpers — no assumption about how they are implemented.
import { Session } from '@deepseek-ai/dsh-session'
import { SessionId, SessionLogOffset, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session/types'

const mkEvent = (type, seq) => ({ type, seq, time: 1700000000000 + seq, data: { label: `e${seq}` } })

const PLAIN_TYPES = ['turn/start', 'assistant/turn-outline', 'todo/added', 'turn/end', 'session/title', 'todo/added']
const FORK_TYPES = ['turn/start', 'session/title', 'todo/added', 'turn/end', 'session/title', 'todo/added', 'todo/removed', 'turn/start']
const FORK_INHERITED = 4

export function buildPlainSession() {
  return Session.create(SessionId('plain-1'), PLAIN_TYPES.map((type, i) => mkEvent(type, i)))
}

export function buildForkSession() {
  return Session.create(
    SessionId('fork-1'),
    FORK_TYPES.map((type, i) => mkEvent(type, i)),
    { version: SESSION_FORMAT_VERSION, id: SessionId('fork-1'), createdAt: 1700000000000, isSeeded: true },
    SessionLogOffset(FORK_INHERITED),
  )
}

export function buildSessions() {
  return { plain: buildPlainSession(), fork: buildForkSession() }
}

const seqsOf = (events) => events.map((e) => e?.seq)

// Each check: { id, points, run(ledger, sessions) -> { pass, detail } }
export function defineChecks() {
  return [
    {
      id: 'fullVisibleLog/plain',
      points: 10,
      run: (ledger, { plain }) => {
        const got = ledger.fullVisibleLog(plain)
        const ok = Array.isArray(got) && got.length === plain.seq && seqsOf(got).every((s, i) => s === i)
        return { pass: ok, detail: ok ? `length ${got.length}` : `expected seqs 0..${plain.seq - 1}, got ${JSON.stringify(seqsOf(Array.isArray(got) ? got : []))}` }
      },
    },
    {
      id: 'fullVisibleLog/fork-inherited',
      points: 10,
      run: (ledger, { fork }) => {
        const got = ledger.fullVisibleLog(fork)
        const ok = Array.isArray(got) && got.length === fork.seq && seqsOf(got).every((s, i) => s === i)
        return { pass: ok, detail: ok ? `length ${got.length} (inherited prefix kept)` : `expected seqs 0..${fork.seq - 1} incl. inherited 0..3, got ${JSON.stringify(seqsOf(Array.isArray(got) ? got : []))}` }
      },
    },
    {
      id: 'eventAtSeq/bounds',
      points: 10,
      run: (ledger, { plain, fork }) => {
        const exact = ledger.eventAtSeq(plain, 3)
        const forkOwn = ledger.eventAtSeq(fork, 6)
        const forkInherited = ledger.eventAtSeq(fork, 0)
        const over = ledger.eventAtSeq(plain, 99)
        const negative = ledger.eventAtSeq(plain, -1)
        const nan = ledger.eventAtSeq(plain, Number.NaN)
        const ok = exact?.seq === 3 && exact?.type === 'turn/end'
          && forkOwn?.seq === 6 && forkOwn?.type === 'todo/removed'
          && forkInherited?.seq === 0
          && over === null && negative === null && nan === null
        return { pass: ok, detail: ok ? 'exact hit (plain + fork own/inherited) + out-of-range/negative/NaN → null' : `seq3=${seqsOf([exact])[0]}, fork6=${seqsOf([forkOwn])[0]}, fork0=${seqsOf([forkInherited])[0]}, 99=${String(over)}, -1=${String(negative)}, NaN=${String(nan)}` }
      },
    },
    {
      id: 'windowFrom/half-open',
      points: 20,
      run: (ledger, { plain }) => {
        const from3 = ledger.windowFrom(plain, 3)
        const full = ledger.windowFrom(plain, 0)
        const pastEnd = ledger.windowFrom(plain, plain.seq)
        const ok = Array.isArray(from3) && seqsOf(from3).join(',') === [3, 4, 5, 6].join(',')
          && Array.isArray(full) && full.length === plain.seq
          && Array.isArray(pastEnd) && pastEnd.length === 0
        return { pass: ok, detail: ok ? `from=3 → seqs 3..6; from=0 full; from=end empty` : `from3=${JSON.stringify(seqsOf(Array.isArray(from3) ? from3 : []))}, full=${Array.isArray(full) ? full.length : '?'}, pastEnd=${Array.isArray(pastEnd) ? pastEnd.length : '?'}` }
      },
    },
    {
      id: 'eventInWindow/seq-lookup',
      points: 10,
      run: (ledger, { fork }) => {
        const inside = ledger.eventInWindow(fork, 4, 6)
        const below = ledger.eventInWindow(fork, 4, 2)
        const pastEnd = ledger.eventInWindow(fork, 4, 99)
        const atEnd = ledger.eventInWindow(fork, 0, 8)
        const ok = inside?.seq === 6 && inside?.type === 'todo/removed' && below === null && pastEnd === null && atEnd?.seq === 8
        return { pass: ok, detail: ok ? 'in-window exact hit; below/over/at-end handled' : `(4,6)=${seqsOf([inside])[0]}, (4,2)=${String(below)}, (4,99)=${String(pastEnd)}, (0,8)=${seqsOf([atEnd])[0]}` }
      },
    },
    {
      id: 'ownOnlyEvents/inherited-cut',
      points: 15,
      run: (ledger, { plain, fork }) => {
        const forkOwn = ledger.ownOnlyEvents(fork)
        const plainOwn = ledger.ownOnlyEvents(plain)
        const ok = Array.isArray(forkOwn) && seqsOf(forkOwn).join(',') === [4, 5, 6, 7, 8].join(',')
          && Array.isArray(plainOwn) && plainOwn.length === plain.seq
        return { pass: ok, detail: ok ? `fork → seqs 4..8; plain → full` : `fork=${JSON.stringify(seqsOf(Array.isArray(forkOwn) ? forkOwn : []))}, plain=${Array.isArray(plainOwn) ? plainOwn.length : '?'}` }
      },
    },
  ]
}

export function runChecks(ledger, sessions) {
  const results = []
  for (const check of defineChecks()) {
    try {
      const { pass, detail } = check.run(ledger, sessions)
      results.push({ id: check.id, points: check.points, pass, detail })
    } catch (error) {
      results.push({ id: check.id, points: check.points, pass: false, detail: `threw: ${error.message}` })
    }
  }
  return results
}

const isMain = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const ledger = await import('../src/session-ledger.mjs')
  const sessions = buildSessions()
  const results = runChecks(ledger, sessions)
  let failed = 0
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.detail}`)
    if (!r.pass) failed += 1
  }
  const total = results.reduce((s, r) => s + (r.pass ? r.points : 0), 0)
  console.log(`behavioral score: ${total}/75 (${failed} failing)`)
  process.exit(failed > 0 ? 1 : 0)
}
