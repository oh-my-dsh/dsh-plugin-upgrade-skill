// M4-peer-prerelease-range grading: rewrite the legacy peer bound, then install + cold boot.
//    25 — peer and dev lower bounds rewritten to cover the 0.1.2-alpha.2 cohort;
//    75 — isolated-profile cold boot activates (MISSING_CREDENTIAL without a key), only
//         when the static gate passed (otherwise the changed-but-unfixed case caps at 40);
//    40 — the fixture changed but the ranges were not fixed / the boot still fails;
//    30 — `dsh plugin add` itself failed; 0 — fixture unchanged.
// Boundary declaration: the R-08 #3 "install warnings disappear after rewriting the bound"
// signal cannot be reproduced in this harness — the profile's own pnpm graph never contains
// the host's fallback-provided peers, so pnpm reports unrelated missing peers regardless of
// the rewritten range. The judge therefore scores the rewritten bounds statically plus a real
// cold boot, and does not read the install log.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bootHeadless,
  cleanupProfile,
  createProfile,
  dshAvailable,
  emit,
  FIXTURE_DIR,
  fixtureChanges,
  HEADLESS_ACTIVATED_SIGNAL,
  NEGATIVE_SIGNAL,
  PROFILE,
  localExec,
} from './judge-utils.mjs'

const TASK = 'M4-peer-prerelease-range'
const DEP = '@deepseek-ai/dsh-agent'
const GOOD_RANGE = /^(\^|~)?0\.1\.2-alpha\.2$|^>=0\.1\.2-alpha\.2 <0\.2\.0/
const WILDCARD = /^\*$|^>=0\.1\.0|^>=0\.0\.|^latest$|^$/

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    emit(0, [...reasons, `failed to parse package.json: ${error.message}`])
  }
  const peer = pkg?.peerDependencies?.[DEP]
  const dev = pkg?.devDependencies?.[DEP]
  const staticOk = typeof peer === 'string' && typeof dev === 'string' && GOOD_RANGE.test(peer) && GOOD_RANGE.test(dev)
  const wildcard = WILDCARD.test(peer ?? '') || WILDCARD.test(dev ?? '')

  if (staticOk) reasons.push(`peer/dev bounds rewritten to the target cohort (${peer})`)
  else reasons.push(`bounds not rewritten (peer: ${peer ?? 'none'}; dev: ${dev ?? 'none'})`)
  if (wildcard) reasons.push('bound widened into a meaningless range — caps at 40')

  if (!(await dshAvailable())) {
    emit(0, [...reasons, 'dsh unavailable; runtime verification treated as failed'])
  }

  let score = 0
  const profile = PROFILE(TASK)
  const tmp = '/tmp/bench-m4-peer-prerelease-range'
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    if (!created.ok) reasons.push(created.detail)
    else {
      const added = await localExec(`dsh plugin --profile '${profile}' add 'file:/app/fixture' 2>&1`, { timeout: 240000 })
      if (added.code !== 0) {
        score = 30
        reasons.push(`dsh plugin add failed: ${(added.stdout + added.stderr).trim().slice(-300)} (30-point tier)`)
      } else {
        reasons.push('dsh plugin add succeeded')
        const boot = await bootHeadless(profile)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0] ?? 'plugin tree failed'
          score = 40
          reasons.push(`cold boot failed: ${hit} (changed but still broken; 40-point tier)`)
        } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
          score = staticOk ? 100 : 40
          reasons.push(staticOk
            ? 'cold boot activated successfully (MISSING_CREDENTIAL is expected without a key) and the bounds are rewritten (+100)'
            : 'cold boot activated but the bounds were not fixed; capped at 40')
        } else {
          score = 40
          reasons.push(`cold boot output cannot confirm activation: ${boot.output.trim().slice(0, 200)}`)
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }
  if (wildcard) score = Math.min(score, 40)
  emit(score, reasons)
}
