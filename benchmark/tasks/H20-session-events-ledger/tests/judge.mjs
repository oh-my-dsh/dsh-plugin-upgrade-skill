// H20-session-events-ledger grading: migrate a plugin-internal session event
// ledger module from alpha.3's removed `session.events` surface to alpha.4's
// sequence/window API. Deterministic judge — no LLM:
//   75 — behavioral contract checks against REAL alpha.4 Session objects
//        (fullVisibleLog 10+10, eventAtSeq 10, windowFrom 20, eventInWindow 10,
//        ownOnlyEvents 15; a forked session makes own/inherited and
//        seq-as-index mistakes observable);
//   15 — canonical ledger-API migration per helper (3 each);
//   12 — migration hygiene (no stale removed-surface read, no invented
//        getEvents(), no runtime-internal field access, no seq-as-array-index);
//   caps — stale removed-surface read → 30; invented getEvents() → 15;
//        runtime-internal access → 60; seq-as-array-index → 70;
//    0 — fixture untouched, tracked files outside fixture/src/session-ledger.mjs
//        modified, the git baseline rewritten (node_modules tampering), or the
//        removed `events` surface patched back (runtime canary).
// The judge always exits 0; the last stdout line is the {score, max, reasons} JSON.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assembleScore } from './judge-utils.mjs'

const APP = '/app'
const LEDGER = join(APP, 'fixture', 'src', 'session-ledger.mjs')
const SESSION_LIB = join(APP, 'fixture', 'node_modules', '@deepseek-ai', 'dsh-session', 'lib', 'index.js')

function emit(score, reasons) {
  console.log(JSON.stringify({ score, max: 100, reasons }))
}

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []
  if (!existsSync(LEDGER)) { emit(0, ['fixture module missing']); return }

  // Git integrity: tracked files outside fixture/src/session-ledger.mjs must be
  // byte-identical, and the baked baseline commit must still be HEAD (an agent
  // that commits its own edits moves HEAD and fails this gate).
  let status = ''
  try {
    status = execSync('git -C /app status --porcelain', { encoding: 'utf8' })
  } catch (error) { emit(0, [`git baseline check failed to run: ${error.message}`]); return }
  const lines = status.split('\n').filter((l) => l.trim() !== '')
  const modified = lines.filter((l) => !l.startsWith('??')).map((l) => l.slice(3))
  const ledgerModified = modified.includes('fixture/src/session-ledger.mjs')
  const tampered = modified.filter((p) => p !== 'fixture/src/session-ledger.mjs')
  let head = ''
  try { head = execSync('git -C /app rev-parse HEAD', { encoding: 'utf8' }).trim() } catch { head = '' }
  let baseline = ''
  try { baseline = readFileSync(join(APP, 'baseline.sha'), 'utf8').trim() } catch { baseline = '' }
  if (tampered.length > 0 || (baseline !== '' && head !== baseline)) {
    const flat = []
    if (tampered.length > 0) flat.push(`tracked files outside fixture/src/session-ledger.mjs modified: ${tampered.join(' | ').slice(0, 200)}`)
    if (baseline !== '' && head !== baseline) flat.push('git history rewritten (baseline commit moved)')
    emit(0, flat)
    return
  }
  if (!ledgerModified) { emit(0, ['fixture untouched — no migration performed']); return }

  // Load the migrated module BEFORE the canary: a prototype monkey-patch runs
  // at module import time and must be caught.
  let ledger
  try {
    ledger = await import(pathToFileURL(LEDGER).href)
  } catch (error) { emit(0, [`module fails to load: ${error.message}`]); return }

  // Runtime canary: alpha.4 Session has no `events` surface. One existing here
  // means the removed API was patched back (node_modules edit or monkey-patch).
  const { Session } = await import(pathToFileURL(SESSION_LIB).href)
  if ('events' in Session.prototype) {
    emit(0, ['runtime canary failed: Session has an `events` surface — the removed API was patched back'])
    return
  }

  // Behavioral checks against real alpha.4 session objects.
  const contract = await import(pathToFileURL(join(APP, 'fixture', 'tests', 'contract.test.mjs')).href)
  const sessions = contract.buildSessions()
  const results = contract.runChecks(ledger, sessions)
  const behavioral = results.reduce((sum, r) => sum + (r.pass ? r.points : 0), 0)
  reasons.push(`behavioral ${behavioral}/75`)
  for (const r of results) reasons.push(`${r.pass ? '  +' : '  -'}${r.points} ${r.id}: ${r.detail}`)

  // Source analysis over every file under fixture/src (new shim files included).
  const sources = []
  for (const name of readdirSync(join(APP, 'fixture', 'src')).sort()) {
    if (/\.(mjs|js|cjs)$/.test(name)) sources.push(readFileSync(join(APP, 'fixture', 'src', name), 'utf8'))
  }
  const { score, reasons: sourceReasons } = assembleScore({ sources, behavioral })
  reasons.push(...sourceReasons)
  emit(score, reasons)
}
