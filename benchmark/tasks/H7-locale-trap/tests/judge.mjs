// H7-locale-trap grading: static anchor gates + web cold boot + browser roster recognition.
//    30 — client.js anchors a stable data-slot and the display-text regex is gone;
//    10 — client.js explicitly asserts the injection rendered (silent absence → observable failure);
//    10 — `dsh plugin add` succeeded;
//    10 — host half boots with no pending;
//    40 — __DSH_BOOT__.entries actually contains this plugin (browser roster);
//    cap 40 — a display-text regex (even a multi-language variant) is still present (the trap);
//     0 — fixture unchanged.
// Boundary (same as H3): there is no browser in the container, so client.js runtime behavior
// is not graded; only the host-announced boot graph entry is judged.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addPlugin,
  bootWebAndFetchIndex,
  cleanupProfile,
  createProfile,
  dshAvailable,
  emit,
  FIXTURE_DIR,
  fixtureChanges,
  NEGATIVE_SIGNAL,
} from './judge-utils.mjs'

const TASK = 'H7-locale-trap'
const PKG = '@demo/dsh-bench-locale'

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  let client = ''
  try {
    client = readFileSync(join(FIXTURE_DIR, 'client.js'), 'utf8')
  } catch (error) {
    emit(0, [...reasons, `failed to read client.js: ${error.message}`])
  }
  const textRegexPresent = /session[\\s*()?:|]{0,12}log/i.test(client)
  const slotAnchor = /\[data-slot|data-slot=/.test(client)
  // A guard that silently returns (if (!anchor) return) is the very failure mode
// R-13 warns about — only an explicit throw / assert counts as a render assertion.
const renderAssert = /if\s*\(\s*!\s*(?:anchor|el|node|slot|mount|badge|injected)[^)]*\)\s*throw|assert\(/.test(client)

  let score = 0
  if (slotAnchor && !textRegexPresent) {
    score += 30
    reasons.push('stable data-slot anchor without the display-text regex (+30)')
  } else if (textRegexPresent) {
    reasons.push('display-text regex still present (multi-language variant) — the trap; caps at 40 (+0)')
  } else {
    reasons.push('no stable data-slot anchor detected (+0)')
  }
  if (renderAssert) {
    score += 10
    reasons.push('explicit render assertion present (+10)')
  } else {
    reasons.push('no explicit render assertion (+0)')
  }

  if (!(await dshAvailable())) {
    emit(score, [...reasons, 'dsh unavailable; runtime verification treated as failed'])
  }

  const profile = 'bench-h7'
  const tmp = '/tmp/bench-h7'
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) reasons.push(created.detail)
    else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) reasons.push(`dsh plugin add failed: ${added.detail}`)
      else {
        score += 10
        reasons.push('dsh plugin add succeeded (+10)')

        const boot = await bootWebAndFetchIndex(profile, PKG)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          reasons.push(`web cold boot shows a negative signal: ${boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|ClientPackageCompositionError/)?.[0] ?? 'unknown'}`)
        } else {
          score += 10
          reasons.push('web cold boot: host half has no pending (+10)')
        }
        if (boot.html && boot.html.includes(`${PKG}/client.js`)) {
          score += 40
          reasons.push('__DSH_BOOT__.entries contains this plugin — real recognition in the browser roster (+40)')
        } else if (boot.html) {
          reasons.push('__DSH_BOOT__.entries does not contain this plugin (+0)')
        } else {
          reasons.push(`could not obtain the boot graph page${boot.fetchError ? `: ${boot.fetchError}` : ''} (+0)`)
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }

  if (textRegexPresent) score = Math.min(score, 40)
  emit(score, reasons)
}
