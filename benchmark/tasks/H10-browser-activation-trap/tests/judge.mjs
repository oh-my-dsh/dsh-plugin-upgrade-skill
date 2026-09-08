import { emitError } from './judge-result.mjs'
import {
  addPlugin,
  bootWebInBrowser,
  cleanupProfile,
  createProfile,
  dshAvailable,
  emit,
  FIXTURE_DIR,
  fixtureChanges,
} from './judge-utils.mjs'

const PKG = '@demo/dsh-bench-browser-activation'

main().catch(emitError)

async function main() {
  const reasons = []
  const gate = await fixtureChanges('fixture')
  if (gate.changed === null) emitError(new Error('fixture baseline unavailable'))
  if (gate.changed !== true) emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])

  let score = 0
  if (!(await dshAvailable())) emitError(new Error('dsh unavailable: runtime verification cannot run'))

  const profile = 'bench-h10'
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) reasons.push(created.detail)
    else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) reasons.push(`dsh plugin add failed: ${added.detail}`)
      else {
        score += 10
        reasons.push('dsh plugin add succeeded (+10)')

        const boot = await bootWebInBrowser(profile, PKG)
        if (boot.entryUrl) {
          score += 15
          reasons.push('__DSH_BOOT__.entries contains the plugin (+15)')
        } else {
          reasons.push('__DSH_BOOT__.entries does not contain the plugin (+0)')
        }
        if (boot.bundleStatus === 200) {
          score += 15
          reasons.push('browser fetched the client bundle with HTTP 200 (+15)')
        } else {
          reasons.push(`client bundle status ${boot.bundleStatus ?? 'unavailable'} (+0)`)
        }
        if (boot.active) {
          score += 60
          reasons.push('Chromium observed the client activation marker with no package activation failure (+60)')
        } else {
          reasons.push('Chromium did not observe the client activation marker (+0)')
        }
        if (boot.browserError) reasons.push(`browser check: ${boot.browserError}`)
        if (boot.pageErrors.length) reasons.push(`page errors: ${boot.pageErrors.join(' | ')}`)
        if (boot.consoleErrors.length) reasons.push(`console errors: ${boot.consoleErrors.join(' | ')}`)
      }
    }
  } finally {
    cleanupProfile(profile)
  }

  emit(score, reasons)
}
