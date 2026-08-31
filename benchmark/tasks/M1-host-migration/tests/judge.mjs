// M1-host-migration grading: install the agent-modified fixture into an isolated profile and do a real cold boot.
//   100 — the plugin tree activates as a whole (no pending / plugin tree failed, and startup reaches the host application layer);
//    40 — the fixture was changed but something is still pending / the plugin tree failed to load;
//    30 — `dsh plugin add` itself failed;
//     0 — the fixture was not changed.
// Judgment follows validation-report-2026-08-30.md: a headless cold boot without an API key must emit
// MISSING_CREDENTIAL — seeing that output proves the plugin tree activated and startup passed the plugin layer.
// Note: the result is emitted after try/finally — the process.exit() inside emit() would skip the finally cleanup.
import { addPlugin, bootHeadless, cleanupProfile, createProfile, dshAvailable, emit, fixtureChanges, HEADLESS_ACTIVATED_SIGNAL, NEGATIVE_SIGNAL, PROFILE, FIXTURE_DIR } from './judge-utils.mjs'

const TASK = 'M1-host-migration'

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}); treated as 0 points`])
  }
  reasons.push('fixture was modified by the agent')

  if (!(await dshAvailable())) {
    emit(0, [...reasons, 'dsh unavailable in the container; runtime judgment impossible, treated as 0 points'])
  }

  const profile = PROFILE(TASK)
  const tmp = '/tmp/bench-m1-host-migration'
  let result = { score: 40, reasons }
  try {
    reasons.push(`the judge will install /app/fixture as the plugin directory into the isolated profile ${profile}`)

    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    if (!created.ok) result = { score: 0, reasons: [...reasons, created.detail] }
    else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) result = { score: 30, reasons: [...reasons, `dsh plugin add failed: ${added.detail}`] }
      else {
        reasons.push('dsh plugin add succeeded')

        const boot = await bootHeadless(profile)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0] ?? 'plugin tree failed'
          result = { score: 40, reasons: [...reasons, `cold boot failed: ${hit} (changed but still pending; 40-point tier)`] }
        } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
          result = { score: 100, reasons: [...reasons, 'cold boot activated successfully: no pending in the plugin tree, startup reached the host application layer (MISSING_CREDENTIAL is expected without a key)'] }
        } else {
          result = { score: 40, reasons: [...reasons, `cold boot output cannot confirm activation: ${boot.output.trim().slice(0, 200)}`] }
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }
  emit(result.score, result.reasons)
}
