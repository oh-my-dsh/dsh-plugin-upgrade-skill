// M2-optional-dep-trap grading: fix the dependency contract, then a real cold boot.
//   100 — the dependency moved to `dependencies` with a published range, the top-level
//         import stays intact, and the isolated-profile cold boot activates;
//    40 — the fixture changed but the boot still fails / the import was wrapped
//         (try/catch or dynamic import so the crash disappears) — not the real fix;
//    30 — `dsh plugin add` itself failed;
//     0 — the fixture unchanged.
// Judgment follows validation-report-2026-08-30.md: a headless cold boot without an API
// key must emit MISSING_CREDENTIAL. Results are emitted after try/finally.
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

const TASK = 'M2-optional-dep-trap'
const DEP = '@deepseek-ai/dsh-util-time'

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  // Static gates: dependency contract + intact top-level import.
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    emit(0, [...reasons, `failed to parse package.json: ${error.message}`])
  }
  const opt = pkg?.optionalDependencies?.[DEP]
  const dep = pkg?.dependencies?.[DEP] ?? pkg?.devDependencies?.[DEP]
  const publishedRange = dep !== undefined && dep !== '0.1.2-alpha.1' && dep !== '^0.1.2-alpha.1'
  const staticDepOk = opt === undefined && publishedRange

  let code = ''
  try {
    code = readFileSync(join(FIXTURE_DIR, 'lib', 'index.js'), 'utf8')
  } catch {}
  const topImport = /^import[^;]*dsh-util-time/m.test(code)
  const wrapped = /try\s*\{[\s\S]*import\s*\{|import\(['"]@deepseek-ai\/dsh-util-time/.test(code)
  const importOk = topImport && !wrapped

  let score = staticDepOk && importOk ? 40 : 0
  if (staticDepOk) reasons.push('dependency moved to dependencies with a published range (+40 base)')
  else reasons.push(`dependency contract not fixed (optional: ${opt}; declared: ${dep ?? 'none'}) (+0)`)
  if (importOk) reasons.push('top-level import intact, not wrapped (+0 extra)')
  else reasons.push('top-level import removed or wrapped in try/catch / dynamic import — not the real fix (caps at 40)')

  if (!(await dshAvailable())) {
    emit(score, [...reasons, 'dsh unavailable; runtime verification treated as failed'])
  }

  const profile = PROFILE(TASK)
  const tmp = '/tmp/bench-m2-optional-dep-trap'
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    if (!created.ok) reasons.push(created.detail)
    else {
      const added = await localExec(`dsh plugin --profile '${profile}' add 'file:/app/fixture' 2>&1`, { timeout: 240000 })
      if (added.code !== 0) {
        score = 30
        reasons.push(`dsh plugin add failed: ${(added.stdout + added.stderr).trim().slice(-300)} (30-point tier)`)
      } else {
        reasons.push('dsh plugin add (file:) succeeded')
        const boot = await bootHeadless(profile)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)/)?.[0] ?? 'plugin tree failed'
          score = 40
          reasons.push(`cold boot failed: ${hit} (changed but still broken; 40-point tier)`)
        } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
          score = staticDepOk && importOk ? 100 : 40
          reasons.push(staticDepOk && importOk
            ? 'cold boot activated successfully: startup reached the host application layer (MISSING_CREDENTIAL is expected without a key)'
            : 'cold boot activated but the static gates are not satisfied (wrapped import or wrong dependency placement); capped at 40')
        } else {
          score = 40
          reasons.push(`cold boot output cannot confirm activation: ${boot.output.trim().slice(0, 200)}`)
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }
  emit(score, reasons)
}
