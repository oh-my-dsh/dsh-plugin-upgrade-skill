// M12-interpreters-card grading: cross-plane client-runtime split migration (snapshot store move + settings type rename).
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-25 (3) + R-01 (2);
//   50 — static migration contract:
//        dsh-client-runtime references gone from deps + inject + sources (10)
//        + createSnapshotStore/SnapshotStore re-anchored to dsh-client-store (10)
//        + the dsh-settings type renamed Settings -> SettingsProvider (10)
//        + dsh.client.inject recomposed to the POST list exactly (10)
//        + every @deepseek-ai peer floor sits on the 0.1.2-alpha cohort (10);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo claims SettingsProvider is "just an alias"
// of the old Settings type and that the snapshot store "still ships in dsh-client-runtime on
// alpha (deprecated but present)" — BOTH false. Keeping the old Settings type import path
// caps at 60 (M5-token-auth-smoke precedent); the removed dsh-client-runtime retained in the
// client inject caps at 20 (the web tree cannot compose; H9 precedent); static incomplete →
// cap 40; fixture unchanged → 0.
// Boundary: there is no browser in this container — the browser-side verdict is the
// boot graph entry only (DSH-0.1.2-A1-19). Results are emitted after try/finally.
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
  localExec,
  NEGATIVE_SIGNAL,
  PROFILE,
  readAgentText,
} from './judge-utils.mjs'

const TASK = 'M12-interpreters-card'
const PKG = '@bench/dsh-bench-interpreters-card'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/
const RUNTIME_REF = /dsh-client-runtime/
// Import-path form only (`'@deepseek-ai/dsh-client-runtime…`): prose comments
// naming the deleted package cannot false-hit (H8 precedent).
const RUNTIME_IMPORT = /'@deepseek-ai\/dsh-client-runtime(\/|')/
// The rename, anchored on the annotation form so the memo's prose mentioning
// "SettingsProvider" cannot false-hit (H8 precedent); the old-type anchor's
// word boundary excludes the Provider spelling.
const OLD_SETTINGS_TYPE = /import\('@deepseek-ai\/dsh-settings'\)\.Settings\b/
const NEW_SETTINGS_TYPE = /import\('@deepseek-ai\/dsh-settings'\)\.SettingsProvider/
const STORE_SOURCE = /'@deepseek-ai\/dsh-client-store'/
const POST_INJECT = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings-plugins',
]

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

  // Act 2: static contract checks on both planes.
  const act2 = scoreStatic()
  reasons.push(...act2.reasons)

  if (!(await dshAvailable())) {
    emit(0, [...reasons, 'dsh unavailable in the container; runtime verification treated as failed'])
  }

  // Act 3: install + web cold boot + browser roster.
  let act3 = 0
  const profile = PROFILE(TASK)
  const tmp = `/tmp/bench-${TASK.toLowerCase()}`
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) {
      reasons.push(created.detail)
    } else {
      const added = await addPlugin(profile, FIXTURE_DIR)
      if (!added.ok) {
        reasons.push(`dsh plugin add failed: ${added.detail}`)
      } else {
        act3 += 8
        reasons.push('dsh plugin add succeeded (+8)')

        const boot = await bootWebAndFetchIndex(profile, PKG)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|ClientPackageCompositionError/i)?.[0] ?? 'unknown'
          reasons.push(`web cold boot shows a negative signal: ${hit}`)
        } else {
          reasons.push('web cold boot: no negative signal in the boot log')
          const url = /dsh web: (\S+)/.exec(boot.output)?.[1]
          if (url !== undefined) {
            act3 += 9
            reasons.push(`web cold boot reached the app layer with a boot URL (+9): ${url}`)
            if (boot.html && boot.html.includes(`${PKG}/client.js`)) {
              act3 += 8
              reasons.push('__DSH_BOOT__.entries lists the client entry — real browser-roster recognition (+8)')
            } else {
              reasons.push('__DSH_BOOT__.entries does not list the client entry (stale dsh.client plane?)')
            }
          } else {
            reasons.push(`could not find the dsh web URL in the boot log (tail: ${boot.output.trim().slice(-160)})`)
          }
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
  if (act2.runtimeRetained) {
    score = Math.min(score, 20)
    reasons.push('dsh-client-runtime retained — the package was removed and split by domain; the web tree cannot compose, capped at 20 (H9 precedent)')
  }
  if (act2.oldSettingsKept) {
    score = Math.min(score, 60)
    reasons.push("the dsh-settings type was renamed Settings -> SettingsProvider (the memo's bait: \"just an alias, keep the old name\") — capped at 60")
  }
  if (!act2.allPassed) {
    score = Math.min(score, 40)
    reasons.push('static migration incomplete — capped at 40')
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
    reasons.push('no diagnosis report under /app/agent-output/M12-interpreters-card/')
    return { score, reasons }
  }
  if (text.includes('bench-interpreters-card')) {
    score += 5
    reasons.push('diagnosis names the plugin (+5)')
  } else {
    reasons.push('diagnosis does not name the plugin')
  }
  if (text.includes('DSH-0.1.2-A1-25')) {
    score += 3
    reasons.push('diagnosis cites DSH-0.1.2-A1-25 (client-runtime removal) (+3)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-25')
  }
  if (/\bR-01\b/.test(text)) {
    score += 2
    reasons.push('diagnosis cites R-01 (+2)')
  } else {
    reasons.push('diagnosis does not cite R-01')
  }
  return { score, reasons }
}

/** Act 2: type-surface migrations + client inject list + peer cohort. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let runtimeRetained = false
  let oldSettingsKept = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, runtimeRetained: true, oldSettingsKept: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // (a) the deleted runtime is gone from every dependency block and the client
  // inject; in sources only the import-path form counts — prose comments
  // naming the deleted package cannot false-hit (H8 precedent).
  const depBlocks = JSON.stringify({ d: pkg.dependencies ?? {}, p: pkg.peerDependencies ?? {}, pd: pkg.devDependencies ?? {}, m: pkg.peerDependenciesMeta ?? {} })
  const inject = pkg?.dsh?.client?.inject ?? []
  if (!RUNTIME_REF.test(depBlocks) && !inject.includes('@deepseek-ai/dsh-client-runtime') && !RUNTIME_IMPORT.test(hostSrc) && !RUNTIME_IMPORT.test(clientSrc)) {
    score += 10
    reasons.push('dsh-client-runtime references removed from deps, inject, and types (+10)')
  } else {
    runtimeRetained = true
    allPassed = false
    reasons.push('dsh-client-runtime still referenced (the package was removed; the snapshot store moved to dsh-client-store)')
  }

  // (b) the snapshot store's new source.
  if (STORE_SOURCE.test(hostSrc) || STORE_SOURCE.test(clientSrc)) {
    score += 10
    reasons.push('createSnapshotStore/SnapshotStore re-anchored to @deepseek-ai/dsh-client-store (+10)')
  } else {
    allPassed = false
    reasons.push('no dsh-client-store type source found (the snapshot store moved there in the split)')
  }

  // (c) the settings type rename (API unchanged): the new annotation present,
  // the old import-path form absent — the memo's prose cannot false-hit.
  if (NEW_SETTINGS_TYPE.test(hostSrc) && !OLD_SETTINGS_TYPE.test(hostSrc) && !OLD_SETTINGS_TYPE.test(clientSrc)) {
    score += 10
    reasons.push('dsh-settings type renamed to SettingsProvider in the annotations (+10)')
  } else {
    oldSettingsKept = OLD_SETTINGS_TYPE.test(hostSrc) || OLD_SETTINGS_TYPE.test(clientSrc)
    allPassed = false
    reasons.push('the dsh-settings Settings -> SettingsProvider rename is missing or incomplete')
  }

  // (d) the client inject list — the POST list exactly.
  if (inject.length === POST_INJECT.length && POST_INJECT.every((m) => inject.includes(m))) {
    score += 10
    reasons.push('dsh.client.inject recomposed to the four surviving platform modules (+10)')
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject mismatch: ${JSON.stringify(inject)}`)
  }

  // (e) the peer cohort.
  const peers = pkg.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([k]) => k.startsWith('@deepseek-ai/'))
  const offCohort = dshPeers.filter(([, v]) => !ALPHA_COHORT.test(String(v)))
  if (dshPeers.length > 0 && offCohort.length === 0) {
    score += 10
    reasons.push(`all ${dshPeers.length} @deepseek-ai peer floors sit on the 0.1.2-alpha cohort (+10)`)
  } else {
    allPassed = false
    reasons.push(`peer floors off the 0.1.2-alpha cohort: ${offCohort.map(([k, v]) => `${k}@${v}`).join(', ') || 'no @deepseek-ai peers declared'}`)
  }

  if (runtimeRetained) allPassed = false
  return { score, allPassed, runtimeRetained, oldSettingsKept, reasons }
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

async function baselineVersion() {
  const result = await localExec('git -C /app show HEAD:fixture/package.json')
  if (result.code !== 0) return null
  try {
    return JSON.parse(result.stdout).version ?? null
  } catch {
    return null
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}
