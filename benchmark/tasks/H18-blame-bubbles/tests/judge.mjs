// H18-blame-bubbles grading: the deleted gateway facade + the shrunken RPC
// contract + the projection dual-table declaration, across both planes.
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-01 (3) + DSH-0.1.2-A2-08 (2);
//   50 — static migration contract:
//        dsh-host-apiproxy references gone from deps + import-path form (10)
//        + rpc.handle carries exactly (channel, handler) — no authority
//          option on rpc calls in either half (10)
//        + the deleted dsh-client-runtime gone from inject/peers/deps/sources (10)
//        + the sources declare the SessionProjectionStateMap merge with the
//          autoBlame key (8)
//        + dsh.client.inject recomposed (dsh-client-ui-session present,
//          runtime dropped) (6)
//        + every @deepseek-ai/dsh-* peer floor sits on the 0.1.2-alpha cohort (6);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says to KEEP the third authority
// argument ("the split made it mandatory") and that the SessionProjectionStateMap
// merge is optional — following it caps at 60 (M5-token-auth-smoke/H9 memo precedent);
// the dead dsh-host-apiproxy references retained cap at 40 (H9 precedent); the
// removed dsh-client-runtime module retained in the client inject caps at 20 (the
// web tree cannot compose — H9 precedent); static incomplete → cap 40; fixture
// unchanged → 0.
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

const TASK = 'H18-blame-bubbles'
const PKG = '@bench/dsh-bench-blame-bubbles'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/
const APIPROXY_SURFACE = /import\s*\(\s*['"][^'"]*dsh-host-apiproxy|from\s+['"][^'"]*dsh-host-apiproxy/
const RUNTIME_IMPORT = /from\s+['"][^'"]*dsh-client-runtime|import\(\s*['"][^'"]*dsh-client-runtime/
/** Comment-stripped view of a source file: token checks run on code, not prose
 * (H8 statement-anchored precedent — migration-record comments must not false-hit). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}
const AUTHORITY_OPTION = /authority\s*:/
const POST_INJECT = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-settings',
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

  // Act 2: static migration contract across both planes.
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
  if (act2.authorityRetained) {
    score = Math.min(score, 60)
    reasons.push("rpc.handle still carries the third authority option (the memo's bait) — capped at 60 (M5 precedent)")
  }
  if (act2.apiproxyRetained) {
    score = Math.min(score, 40)
    reasons.push('dsh-host-apiproxy references remain — the gateway facade was deleted in alpha.1, capped at 40 (H9 precedent)')
  }
  if (act2.runtimeRetained) {
    score = Math.min(score, 20)
    reasons.push('the removed dsh-client-runtime module retained — the web tree cannot compose, capped at 20 (H9 precedent)')
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
    reasons.push('no diagnosis report under /app/agent-output/H18-blame-bubbles/')
    return { score, reasons }
  }
  if (text.includes('bench-blame-bubbles')) {
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
  if (text.includes('DSH-0.1.2-A2-08')) {
    score += 2
    reasons.push('diagnosis cites DSH-0.1.2-A2-08 (session-projection declaration requirement) (+2)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A2-08')
  }
  return { score, reasons }
}

/** Act 2: host RPC contract + projection state map + client plane + peer cohort. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let authorityRetained = false
  let apiproxyRetained = false
  let runtimeRetained = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, authorityRetained: true, apiproxyRetained: true, runtimeRetained: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // (a) the dead gateway facade is gone from every dependency block; in sources
  //     only the import-path form (`dsh-host-apiproxy/…`) counts — prose comments
  //     naming the deleted package cannot false-hit (H8 precedent).
  const depBlocks = JSON.stringify({ d: pkg.dependencies ?? {}, p: pkg.peerDependencies ?? {}, pd: pkg.devDependencies ?? {}, m: pkg.peerDependenciesMeta ?? {} })
  if (!depBlocks.includes('dsh-host-apiproxy') && !APIPROXY_SURFACE.test(stripComments(hostSrc) + stripComments(clientSrc))) {
    score += 10
    reasons.push('dsh-host-apiproxy references removed from deps and types (+10)')
  } else {
    apiproxyRetained = true
    allPassed = false
    reasons.push('dsh-host-apiproxy still referenced (the gateway facade was deleted in alpha.1)')
  }

  // (b) the handle call contract.
  if (AUTHORITY_OPTION.test(hostSrc + clientSrc)) {
    authorityRetained = true
    allPassed = false
    reasons.push("rpc calls still carry the third authority option — the memo's bait")
  } else {
    score += 10
    reasons.push('rpc.handle carries exactly (channel, handler) (+10)')
  }

  // (c) the projection dual-table declaration: the plugin's cell appears in a
  //     SessionProjectionStateMap merge (fixtures represent the TS merge as a
  //     comment/JSDoc block).
  if (/interface\s+SessionProjectionStateMap/.test(hostSrc + clientSrc) && /autoBlame\s*:/.test(hostSrc + clientSrc)) {
    score += 8
    reasons.push('SessionProjectionStateMap merge declared with the autoBlame cell (+8)')
  } else {
    allPassed = false
    reasons.push('no SessionProjectionStateMap merge declaring the autoBlame cell (the register generic requires the dual-table declaration)')
  }

  // (d) the deleted runtime module.
  if (!depBlocks.includes('dsh-client-runtime') && !RUNTIME_IMPORT.test(stripComments(hostSrc) + stripComments(clientSrc))) {
    score += 10
    reasons.push('dsh-client-runtime gone from inject, peers, deps and sources (+10)')
  } else {
    runtimeRetained = true
    allPassed = false
    reasons.push('dsh-client-runtime still referenced (the package was removed and split by domain)')
  }

  // (e) the recomposed client inject list.
  const inject = pkg?.dsh?.client?.inject ?? []
  if (inject.length > 0 && JSON.stringify(inject) === JSON.stringify(POST_INJECT)) {
    score += 6
    reasons.push('dsh.client.inject recomposed (runtime dropped, dsh-client-ui-session present) (+6)')
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject does not match the 0.1.2-alpha recomposition (got: ${inject.join(', ') || 'empty'})`)
  }

  // (f) the peer cohort.
  const peers = pkg.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([k]) => k.startsWith('@deepseek-ai/dsh-'))
  const offCohort = dshPeers.filter(([, v]) => !ALPHA_COHORT.test(String(v)))
  if (dshPeers.length > 0 && offCohort.length === 0) {
    score += 6
    reasons.push(`all ${dshPeers.length} @deepseek-ai/dsh-* peer floors sit on the 0.1.2-alpha cohort (+6)`)
  } else {
    allPassed = false
    reasons.push(`peer floors off the 0.1.2-alpha cohort: ${offCohort.map(([k, v]) => `${k}@${v}`).join(', ') || 'no @deepseek-ai/dsh-* peers declared'}`)
  }

  return { score, allPassed, authorityRetained, apiproxyRetained, runtimeRetained, reasons }
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
