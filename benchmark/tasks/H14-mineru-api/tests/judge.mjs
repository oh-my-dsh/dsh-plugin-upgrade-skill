// H14-mineru-api grading: host RPC contract migration + client plane recognition.
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-01 (3) + DSH-0.1.2-A1-25 (2);
//   50 — static migration contract:
//        dsh-host-apiproxy references gone from deps + types (10)
//        + rpc.handle carries exactly (channel, handler) — no authority option (10)
//        + ConnectionRpcResult type source declared (10)
//        + dsh.client.inject drops dsh-client-runtime (5) and names dsh-client-connection (5)
//        + every @deepseek-ai/dsh-* peer floor sits on the 0.1.2-alpha cohort (10);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says to KEEP the third authority
// argument — following it caps at 60 (M5-token-auth-smoke precedent); the dead
// dsh-host-apiproxy dependency retained caps at 40; the removed dsh-client-runtime
// module retained in the client inject caps at 20 (the web tree cannot compose);
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

const TASK = 'H14-mineru-api'
const PKG = '@bench/dsh-bench-mineru-api'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/
const AUTHORITY_OPTION = /rpc\.handle\([^)]*,\s*\{[^}]*authority/
const APIPROXY_REF = /dsh-host-apiproxy/

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
  let rosterHit = false
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
              rosterHit = true
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
  if (act2.authorityRetained) {
    score = Math.min(score, 60)
    reasons.push("rpc.handle still carries the third authority option (the memo's bait) — capped at 60 (M5 precedent)")
  }
  if (act2.apiproxyRetained) {
    score = Math.min(score, 40)
    reasons.push('dsh-host-apiproxy references remain — the gateway facade was deleted in alpha.1, capped at 40')
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
    reasons.push('no diagnosis report under /app/agent-output/H14-mineru-api/')
    return { score, reasons }
  }
  if (text.includes('bench-mineru-api')) {
    score += 5
    reasons.push('diagnosis names the plugin (+5)')
  } else {
    reasons.push('diagnosis does not name the plugin')
  }
  if (text.includes('DSH-0.1.2-A1-01')) {
    score += 3
    reasons.push('diagnosis cites DSH-0.1.2-A1-01 (APIProxy removal) (+3)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-01')
  }
  if (text.includes('DSH-0.1.2-A1-25')) {
    score += 2
    reasons.push('diagnosis cites DSH-0.1.2-A1-25 (client-runtime removal) (+2)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-25')
  }
  return { score, reasons }
}

/** Act 2: host RPC contract + client plane + peer cohort. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let authorityRetained = false
  let apiproxyRetained = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, authorityRetained: true, apiproxyRetained: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // (a) the dead gateway facade is gone from every dependency block; in sources
  // only the import-path form (`dsh-host-apiproxy/…`) counts — prose comments
  // naming the deleted package cannot false-hit (H8 precedent).
  const depBlocks = JSON.stringify({ d: pkg.dependencies ?? {}, p: pkg.peerDependencies ?? {}, pd: pkg.devDependencies ?? {}, m: pkg.peerDependenciesMeta ?? {} })
  if (!APIPROXY_REF.test(depBlocks) && !/dsh-host-apiproxy\//.test(hostSrc) && !/dsh-host-apiproxy\//.test(clientSrc)) {
    score += 10
    reasons.push('dsh-host-apiproxy references removed from deps and types (+10)')
  } else {
    apiproxyRetained = true
    allPassed = false
    reasons.push('dsh-host-apiproxy still referenced (the gateway facade was deleted in alpha.1)')
  }

  // (b) the handle call contract.
  if (AUTHORITY_OPTION.test(hostSrc)) {
    authorityRetained = true
    allPassed = false
    reasons.push("rpc.handle still carries the third authority option — the memo's bait")
  } else {
    score += 10
    reasons.push('rpc.handle carries exactly (channel, handler) (+10)')
  }

  // (c) the result type source.
  if (clientSrc.includes('dsh-client-connection/client') || /ConnectionRpcResult/.test(hostSrc)) {
    score += 10
    reasons.push('ConnectionRpcResult type source declared from dsh-client-connection (+10)')
  } else {
    allPassed = false
    reasons.push('no ConnectionRpcResult / client-connection type source found')
  }

  // (d) the client inject list.
  const inject = pkg?.dsh?.client?.inject ?? []
  if (inject.includes('@deepseek-ai/dsh-client-runtime')) {
    allPassed = false
    reasons.push('dsh.client.inject still names @deepseek-ai/dsh-client-runtime (the package was removed)')
  } else {
    score += 5
    reasons.push('dsh.client.inject dropped dsh-client-runtime (+5)')
  }
  if (inject.includes('@deepseek-ai/dsh-client-connection')) {
    score += 5
    reasons.push('dsh.client.inject names @deepseek-ai/dsh-client-connection (+5)')
  } else {
    allPassed = false
    reasons.push('dsh.client.inject does not name @deepseek-ai/dsh-client-connection')
  }

  // (e) the peer cohort.
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

  return { score, allPassed, authorityRetained, apiproxyRetained, reasons }
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
