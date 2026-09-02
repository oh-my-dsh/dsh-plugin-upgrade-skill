// M6-sleep-tool grading: host-only tool plugin cohort migration (M4-peer-prerelease-range precedent).
//   15 — diagnosis.md names the plugin (5) and cites the right cards: DSH-0.1.2-A2-03 (3) + R-01 (2);
//   50 — static migration contract:
//        bare `cordis` peer gone (12) + @deepseek-ai/cordis peer present (10) +
//        dsh-tools peer floor rewritten to the 0.1.2-alpha cohort (12) +
//        dsh-llm peer added (10) + peerDependenciesMeta optional on all three (6);
//   25 — real cold boot in an isolated headless profile: `dsh plugin add` succeeds (10),
//        boot reaches MISSING_CREDENTIAL without a key (15) — the liveness proof;
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's migration memo steers toward keeping bare
// `cordis` ("just a scoped alias") — following it caps at 60 (H1-plane-trap precedent);
// the boot may be green either way (the break is contract-level, not boot-fatal), so an
// unfixed-but-changed fixture caps at 40 (M4 tier); fixture unchanged → 0.
// Results are emitted after try/finally — process.exit() inside emit() would skip cleanup.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addPlugin,
  bootHeadless,
  cleanupProfile,
  createProfile,
  dshAvailable,
  emit,
  FIXTURE_DIR,
  fixtureChanges,
  HEADLESS_ACTIVATED_SIGNAL,
  localExec,
  NEGATIVE_SIGNAL,
  PROFILE,
  readAgentText,
} from './judge-utils.mjs'

const TASK = 'M6-sleep-tool'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  // Act 1: diagnosis report.
  const agentText = readAgentText('/app/agent-output', TASK).text
  const act1 = scoreDiagnosis(agentText)
  reasons.push(...act1.reasons)

  // Act 2: static cohort-contract checks.
  const act2 = scoreStatic()
  reasons.push(...act2.reasons)

  if (!(await dshAvailable())) {
    emit(0, [...reasons, 'dsh unavailable in the container; runtime verification treated as failed'])
  }

  // Act 3: real install + headless cold boot.
  let act3 = 0
  const profile = PROFILE(TASK)
  const tmp = `/tmp/bench-${TASK.toLowerCase()}`
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])
    if (!created.ok) {
      reasons.push(created.detail)
    } else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) {
        reasons.push(`dsh plugin add failed: ${added.detail}`)
      } else {
        act3 += 10
        reasons.push('dsh plugin add succeeded (+10)')

        const boot = await bootHeadless(profile)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed/)?.[0] ?? 'plugin tree failed'
          reasons.push(`cold boot shows a negative signal: ${hit}`)
        } else if (HEADLESS_ACTIVATED_SIGNAL.test(boot.output)) {
          act3 += 15
          reasons.push('headless cold boot activated: MISSING_CREDENTIAL without a key proves the plugin tree reached the host application layer (+15)')
        } else {
          reasons.push(`cold boot output cannot confirm activation: ${boot.output.trim().slice(0, 200)}`)
        }
      }
    }
  } finally {
    await cleanupProfile(profile, tmp)
  }

  // Act 4: release hygiene.
  const act4 = await scoreRelease()
  reasons.push(...act4.reasons)

  let score = act1.score + act2.score + act3 + act4.score
  if (!act2.allPassed) {
    score = Math.min(score, 40)
    reasons.push('static migration incomplete — capped at 40 (M4-peer-prerelease-range tier)')
  }
  if (act2.bareCordisRetained) {
    score = Math.min(score, 60)
    reasons.push('bare `cordis` retained (the migration memo bait: "just a scoped alias") — capped at 60 (H1-plane-trap precedent)')
  }
  emit(score, reasons)
}

/** Act 1: the diagnosis exists, names the plugin, cites the cards. */
function scoreDiagnosis(text) {
  const reasons = []
  let score = 0
  if (text.trim().length > 0) {
    score += 5
    reasons.push('diagnosis report exists (+5)')
  } else {
    reasons.push('no diagnosis report under /app/agent-output/M6-sleep-tool/')
    return { score, reasons }
  }
  if (text.includes('bench-sleep-tool')) {
    score += 5
    reasons.push('diagnosis names the plugin (+5)')
  } else {
    reasons.push('diagnosis does not name the plugin')
  }
  if (text.includes('DSH-0.1.2-A2-03')) {
    score += 3
    reasons.push('diagnosis cites DSH-0.1.2-A2-03 (peer hygiene) (+3)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A2-03')
  }
  if (/\bR-01\b/.test(text)) {
    score += 2
    reasons.push('diagnosis cites R-01 (+2)')
  } else {
    reasons.push('diagnosis does not cite R-01')
  }
  return { score, reasons }
}

/** Act 2: the package.json cohort contract + the type-source repoint. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let bareCordisRetained = false

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, bareCordisRetained: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }
  const peers = pkg.peerDependencies ?? {}
  const meta = pkg.peerDependenciesMeta ?? {}

  if (Object.prototype.hasOwnProperty.call(peers, 'cordis')) {
    bareCordisRetained = true
    allPassed = false
    reasons.push('bare `cordis` peer still declared — the migration memo bait ("just a scoped alias")')
  } else {
    score += 12
    reasons.push('bare `cordis` peer removed (+12)')
  }

  const cordis = peers['@deepseek-ai/cordis']
  if (typeof cordis === 'string' && /^\^?4\.0\.1/.test(cordis)) {
    score += 10
    reasons.push(`@deepseek-ai/cordis peer declared (${cordis}) (+10)`)
  } else {
    allPassed = false
    reasons.push(`@deepseek-ai/cordis peer missing or out of cohort (${cordis ?? 'none'})`)
  }

  const tools = peers['@deepseek-ai/dsh-tools']
  if (typeof tools === 'string' && ALPHA_COHORT.test(tools)) {
    score += 12
    reasons.push(`dsh-tools peer floor rewritten to the 0.1.2-alpha cohort (${tools}) (+12)`)
  } else {
    allPassed = false
    reasons.push(`dsh-tools peer floor not rewritten (${tools ?? 'none'})`)
  }

  const llm = peers['@deepseek-ai/dsh-llm']
  if (typeof llm === 'string' && ALPHA_COHORT.test(llm)) {
    score += 10
    reasons.push(`dsh-llm peer added (${llm}) (+10)`)
  } else {
    allPassed = false
    reasons.push('dsh-llm peer missing (ContentBlock moved to dsh-llm)')
  }

  let optionalCount = 0
  for (const key of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm']) {
    if (meta[key]?.optional === true) optionalCount += 1
  }
  if (optionalCount === 3) {
    score += 6
    reasons.push('peerDependenciesMeta marks all three peers optional (+6)')
  } else {
    allPassed = false
    reasons.push(`peerDependenciesMeta optional count ${optionalCount}/3`)
  }

  if (bareCordisRetained) allPassed = false
  return { score, allPassed, bareCordisRetained, reasons }
}

/** Act 4: version bumped vs the git baseline + private flag preserved. */
async function scoreRelease() {
  const reasons = []
  let score = 0
  const current = readVersion(join(FIXTURE_DIR, 'package.json'))
  const baseline = await baselineVersion()
  if (current !== null && baseline !== null && current !== baseline) {
    score += 6
    reasons.push(`version bumped ${baseline} -> ${current} (+6)`)
  } else {
    reasons.push(`version not bumped vs baseline (${baseline} -> ${current ?? 'unreadable'})`)
  }
  try {
    const pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
    if (pkg.private === true) {
      score += 4
      reasons.push('"private": true preserved (+4)')
    } else {
      reasons.push('"private": true was dropped — publication hazard')
    }
  } catch {
    reasons.push('package.json unreadable for the private check')
  }
  return { score, reasons }
}

function readVersion(path) {
  try {
    const version = JSON.parse(readFileSync(path, 'utf8')).version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

/** The committed baseline content of a path inside /app (git repo root). */
async function baselineText(rel) {
  const result = await localExec(`git -C /app show HEAD:${rel}`)
  if (result.code !== 0) return null
  return result.stdout
}

async function baselineVersion() {
  const text = await baselineText('fixture/package.json')
  if (text === null) return null
  try {
    return JSON.parse(text).version ?? null
  } catch {
    return null
  }
}
