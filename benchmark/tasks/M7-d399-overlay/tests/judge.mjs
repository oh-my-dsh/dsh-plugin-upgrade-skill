// M7-d399-overlay grading: client-runtime deletion + client inject recomposition (web plane).
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-25 (3) + R-01 (2);
//   50 — static migration contract:
//        dsh-client-runtime references gone from JSON blocks + sources (10)
//        + dsh.client.inject recomposed to exactly {dsh-client-locale, dsh-api-session-controller} (10)
//        + ISessions type source declared from dsh-api-session-controller/client (10)
//        + every @deepseek-ai/dsh-* peer floor on the 0.1.2-alpha cohort (10)
//        + @deepseek-ai/cordis peer exactly ^4.0.1 with no -rc suffix (10);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says to SKIP the ISessions
// annotation ("the store object is unchanged") — that bait is an omission, so it
// fails the type-source checkpoint and lands in the static-incomplete tier, capped
// at 40 (M4 tier; no separate 60 cap — the omission cannot pass the static gate).
// The deleted dsh-client-runtime module retained in the client inject caps at 20
// (the web tree cannot compose — H14 precedent); static incomplete → cap 40;
// fixture unchanged → 0.
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

const TASK = 'M7-d399-overlay'
const PKG = '@bench/dsh-bench-d399-overlay'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/
const RUNTIME_REF = /dsh-client-runtime/
const POST_INJECT = ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-api-session-controller']

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
    reasons.push('dsh-client-runtime retained in the client inject — the package was removed, the web tree cannot compose — capped at 20 (H14 precedent)')
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
    reasons.push('no diagnosis report under /app/agent-output/M7-d399-overlay/')
    return { score, reasons }
  }
  if (text.includes('bench-d399-overlay')) {
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

/** Act 2: client inject recomposition + sessions type surface + peer cohort. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let runtimeRetained = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, runtimeRetained: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // (a) the deleted client-runtime package is gone from every dependency
  // block and from both sources (bare-name check: the H14 runtimeGone
  // precedent — no `/client` path survives to hide behind).
  const depBlocks = JSON.stringify({ i: pkg.dsh?.client?.inject ?? [], d: pkg.dependencies ?? {}, p: pkg.peerDependencies ?? {}, pd: pkg.devDependencies ?? {}, m: pkg.peerDependenciesMeta ?? {} })
  if (!RUNTIME_REF.test(depBlocks) && !hostSrc.includes('dsh-client-runtime') && !clientSrc.includes('dsh-client-runtime')) {
    score += 10
    reasons.push('dsh-client-runtime references removed from the inject list, deps, and sources (+10)')
  } else {
    runtimeRetained = RUNTIME_REF.test(JSON.stringify(pkg.dsh?.client?.inject ?? []))
    allPassed = false
    reasons.push('dsh-client-runtime still referenced (the package was removed and split by domain)')
  }

  // (b) the client inject list recomposed to exactly the two POST modules.
  const inject = pkg?.dsh?.client?.inject ?? []
  const injectExact = inject.length === POST_INJECT.length && POST_INJECT.every((m) => inject.includes(m))
  if (injectExact && !inject.includes('@deepseek-ai/dsh-client-runtime')) {
    score += 10
    reasons.push(`dsh.client.inject recomposed to exactly the two client platform modules (+10): ${inject.join(', ')}`)
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject is not the POST recomposition (${JSON.stringify(inject)}; need ${JSON.stringify(POST_INJECT)})`)
  }

  // (c) the sessions list store type source: the ISessions annotation from
  // the api-session-controller client module (statement-anchored on the
  // import path + symbol — prose cannot false-hit, H8 precedent).
  if (clientSrc.includes('ISessions') && clientSrc.includes('dsh-api-session-controller/client')) {
    score += 10
    reasons.push('sessions list store typed via ISessions from dsh-api-session-controller/client (+10)')
  } else {
    allPassed = false
    reasons.push('no ISessions / dsh-api-session-controller/client type source found (the in-source memo says to skip it — bait)')
  }

  // (d) the peer cohort (dsh-* packages only; cordis rides its own line).
  const peers = pkg.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([k]) => k.startsWith('@deepseek-ai/dsh-'))
  const offCohort = dshPeers.filter(([, v]) => !ALPHA_COHORT.test(String(v)))
  if (dshPeers.length > 0 && offCohort.length === 0) {
    score += 10
    reasons.push(`all ${dshPeers.length} @deepseek-ai/dsh-* peer floors sit on the 0.1.2-alpha cohort (+10)`)
  } else {
    allPassed = false
    reasons.push(`peer floors off the 0.1.2-alpha cohort: ${offCohort.map(([k, v]) => `${k}@${v}`).join(', ') || 'no @deepseek-ai/dsh-* peers declared'}`)
  }

  // (e) the cordis peer: exactly ^4.0.1, no -rc prerelease suffix anywhere
  // in the peer block.
  const cordis = peers['@deepseek-ai/cordis']
  if (cordis === '^4.0.1' && !/-rc/.test(JSON.stringify(peers))) {
    score += 10
    reasons.push('@deepseek-ai/cordis peer exactly ^4.0.1 with no -rc suffix in the peer block (+10)')
  } else {
    allPassed = false
    reasons.push(`@deepseek-ai/cordis peer not exactly ^4.0.1 (${cordis ?? 'none'}) or a -rc suffix survives in the peer block`)
  }

  return { score, allPassed, runtimeRetained, reasons }
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
