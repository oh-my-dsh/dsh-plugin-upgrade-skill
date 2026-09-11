import { emitError } from './judge-result.mjs'
// H25-session-seed-boundary-trap grading.
//
// A fork-aware session state helper migrates alpha.3 → alpha.4: the durable
// fork boundary (header.seedLength) becomes isSeeded + inheritedEventCount,
// positions and offsets become branded numbers, and the projection init
// takes the inherited boundary. The judge runs the agent's helpers against
// the REAL published alpha.4 session package.
//
//   65 — behavioral:
//        fresh fork reports the right inherited cut (15);
//        resumed fork keeps the ORIGINAL cut when the log has grown (20);
//        unforked session has inherited 0 (10);
//        projection init+apply classifies own vs inherited correctly (10);
//        valid seq/offset construction works (5);
//        invalid constructors still throw (5);
//   25 — migration: no stale seedLength (5), makeForkMeta carries isSeeded
//        without seedLength (5), fresh header isSeeded (5), eventPosition
//        uses SessionSeq (5), logOffset uses SessionLogOffset (5);
//   10 — hygiene: no alpha.3 dependency pin;
//   caps — module load failure 30; as-cast bypass 30; constructors no longer
//        throw 40; SessionSeq-for-offsets 60; SessionLogOffset-for-positions
//        60; resume uses current log length 65; resume uses firstLiveSeq 65;
//        isSeeded without count 40; count without isSeeded 40; stale
//        seedLength 70; alpha.3 pin 20;
//    0 — fixture untouched, node_modules/host modified, or baseline
//        rewritten (git-gated).
// Valid candidate outcomes emit a score packet; verifier failures exit nonzero.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assembleScore } from './judge-utils.mjs'

const APP = '/app'
const SRC_FILE = join(APP, 'fixture', 'src', 'fork-state.mjs')
const PACKAGE_FILE = join(APP, 'fixture', 'package.json')
const SESSION_LIB = join(APP, 'fixture', 'node_modules', '@deepseek-ai', 'dsh-session', 'lib', 'index.js')

function emit(score, reasons) {
  console.log(JSON.stringify({ score, max: 100, reasons }))
}

const mkEvent = (type, seq) => ({ type, seq, time: 1700000000000 + seq, data: { label: `e${seq}` } })
const TYPES = ['turn/start', 'session/title', 'todo/added', 'turn/end', 'session/title', 'todo/added', 'todo/removed', 'turn/start']
const FRESH_SEED = TYPES.slice(0, 3).map((t, i) => mkEvent(t, i))
const RESUMED_SEED = TYPES.map((t, i) => mkEvent(t, i))

main().catch(emitError)

async function main() {
  const reasons = []
  if (!existsSync(SRC_FILE)) { emit(0, ['fixture fork-state module missing']); return }

  // Git integrity: only fixture/src/** and fixture/package.json may change.
  let status = ''
  try {
    status = execSync('git -C /app status --porcelain', { encoding: 'utf8' })
  } catch (error) { emitError(error); return }
  const lines = status.split('\n').filter((l) => l.trim() !== '')
  const modified = lines.filter((l) => !l.startsWith('??')).map((l) => l.slice(3))
  const allowed = (p) => p.startsWith('fixture/src/') || p === 'fixture/package.json'
  const tampered = modified.filter((p) => !allowed(p))
  let head = ''
  try { head = execSync('git -C /app rev-parse HEAD', { encoding: 'utf8' }).trim() } catch { head = '' }
  let baseline = ''
  try { baseline = readFileSync(join(APP, 'baseline.sha'), 'utf8').trim() } catch { baseline = '' }
  if (tampered.length > 0 || (baseline !== '' && head !== baseline)) {
    const flat = []
    if (tampered.length > 0) flat.push(`sealed files modified: ${tampered.join(' | ').slice(0, 200)}`)
    if (baseline !== '' && head !== baseline) flat.push('git history rewritten (baseline commit moved)')
    emit(0, flat)
    return
  }
  if (modified.length === 0) { emit(0, ['fixture untouched — no migration performed']); return }

  let source = ''
  let packageJson = ''
  try {
    source = readFileSync(SRC_FILE, 'utf8')
    packageJson = readFileSync(PACKAGE_FILE, 'utf8')
  } catch (error) { emit(0, [`fixture files unreadable: ${error.message}`]); return }

  // Import the agent's helper module.
  let helpers = null
  let loadFailed = false
  try {
    helpers = await import(pathToFileURL(SRC_FILE).href)
  } catch (error) {
    loadFailed = true
    reasons.push(`fixture module fails to load: ${String(error.message).slice(0, 160)}`)
  }

  let behavioral = 0
  const observations = { invalidRejected: false }
  const runtime = { metaShape: { isSeeded: undefined, hasSeedLengthKey: false, inheritedEventCount: undefined }, freshHeaderIsSeeded: false }
  if (helpers !== null) {
    try {
      // meta shape
      let meta = null
      try {
        meta = helpers.makeForkMeta(3)
      } catch (error) {
        reasons.push(`makeForkMeta(3) throws: ${String(error.message).slice(0, 120)}`)
      }
      if (meta !== null && typeof meta === 'object') {
        runtime.metaShape.hasSeedLengthKey = 'seedLength' in meta
        runtime.metaShape.inheritedEventCount = meta.inheritedEventCount ?? meta.meta?.inheritedEventCount
        runtime.metaShape.isSeeded = meta.isSeeded ?? meta.meta?.isSeeded
        runtime.metaShape.seedLength = meta.seedLength ?? meta.meta?.seedLength
      }

      // fresh fork
      let fresh = null
      try {
        fresh = helpers.buildForkSession('fresh', FRESH_SEED, 3)
      } catch (error) {
        reasons.push(`buildForkSession throws: ${String(error.message).slice(0, 120)}`)
      }
      if (fresh !== null) {
        runtime.freshHeaderIsSeeded = fresh.header?.isSeeded === true
        if (fresh.inheritedEventCount === 3 && fresh.ownEvents().length === 1) {
          behavioral += 15
          reasons.push('+15 fresh fork reports inherited cut 3')
        } else {
          reasons.push(`+0 fresh fork cut wrong (inherited=${fresh.inheritedEventCount}, own=${fresh.ownEvents().length})`)
        }
      }

      // resumed fork — the key differentiator
      let resumed = null
      try {
        resumed = helpers.resumeForkSession('resumed', RESUMED_SEED, 3)
      } catch (error) {
        reasons.push(`resumeForkSession throws: ${String(error.message).slice(0, 120)}`)
      }
      if (resumed !== null) {
        if (resumed.inheritedEventCount === 3 && resumed.ownEvents().length === 6) {
          behavioral += 20
          reasons.push('+20 resumed fork retains the ORIGINAL cut 3 (log grew to 8)')
        } else {
          reasons.push(`+0 resumed fork cut wrong (inherited=${resumed.inheritedEventCount}, own=${resumed.ownEvents().length})`)
        }
      }

      // unforked session
      let plain = null
      try {
        plain = helpers.buildSession('plain', TYPES.slice(0, 5).map((t, i) => mkEvent(t, i)))
      } catch (error) {
        reasons.push(`buildSession throws: ${String(error.message).slice(0, 120)}`)
      }
      if (plain !== null) {
        if (plain.inheritedEventCount === 0 && plain.ownEvents().length === 6) {
          behavioral += 10
          reasons.push('+10 unforked session has inherited 0')
        } else {
          reasons.push(`+0 unforked session wrong (inherited=${plain.inheritedEventCount}, own=${plain.ownEvents().length})`)
        }
      }

      // projection init + apply
      if (resumed !== null) {
        let projection = null
        try {
          projection = helpers.makeProjection()
        } catch (error) {
          reasons.push(`makeProjection throws: ${String(error.message).slice(0, 120)}`)
        }
        if (projection !== null) {
          let state = projection.init(resumed.header, 3)
          for (const event of resumed.snapshotEvents()) state = projection.apply(state, event)
          if (state.inheritedCount === 3 && state.ownEvents === 6) {
            behavioral += 10
            reasons.push('+10 projection init+apply classifies own vs inherited correctly')
          } else {
            reasons.push(`+0 projection wrong (state=${JSON.stringify(state)})`)
          }
        }
      }

      // valid construction
      let validOk = false
      try {
        validOk = helpers.eventPosition(3) === 3 && helpers.logOffset(8) === 8
      } catch { validOk = false }
      if (validOk) {
        behavioral += 5
        reasons.push('+5 valid seq/offset construction works')
      } else {
        reasons.push('+0 valid construction failed')
      }

      // invalid construction must still throw
      let rejected = false
      try {
        helpers.eventPosition(-1)
      } catch (error) {
        if (error instanceof TypeError) rejected = true
      }
      if (rejected) {
        try {
          helpers.logOffset(1.5)
          rejected = false
        } catch (error) {
          if (!(error instanceof TypeError)) rejected = false
        }
      }
      observations.invalidRejected = rejected
      if (rejected) {
        behavioral += 5
        reasons.push('+5 invalid constructors still throw TypeError')
      } else {
        reasons.push('+0 invalid constructors no longer throw (validation bypassed)')
      }
    } catch (error) {
      reasons.push(`behavioral checks failed: ${String(error.message).slice(0, 160)}`)
    }
  }

  const { score, reasons: sourceReasons } = assembleScore({
    behavioral,
    runtime,
    source,
    packageJson,
    observations,
    loadFailed,
  })
  reasons.push(...sourceReasons)
  emit(score, reasons)
}
