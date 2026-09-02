// H17-merge-calls grading: the toolview takeover across the ui-tool/ui-chat split.
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-03 (3) + DSH-0.1.2-A1-29 (2);
//   50 — static migration contract:
//        dsh-client-runtime references gone from JSON blocks + sources (6)
//        + resultView/callView derivations gone from every source token (12)
//        + card derivations anchored on block.meta + call args + result text (8)
//        + in-session reads through useChat (Chat target, merged into
//          SessionStandardProps by ui-chat) (8)
//        + dsh.client.inject recomposed to exactly {dsh-client-locale,
//          dsh-client-ui-renderer, dsh-client-ui-tool, dsh-client-ui-chat,
//          dsh-client-ui-slots, dsh-client-ui-primitives} (8)
//        + the override dicts carry the Partial JSDoc (missing keys fall
//          back to base zh/en) and the base dicts gained the primitives
//          label keys (4)
//        + peer cohort: all @deepseek-ai peers on ^0.1.2-alpha.1 + scoped
//          cordis ^4.0.1, bare cordis peer removed (4);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says resultView/callView were
// "only renamed" — following it (the derivation fields are deleted in ui-tool, not
// renamed) caps at 60 (M5 precedent); the deleted dsh-client-runtime module retained
// caps at 20 (the web tree cannot compose — H9 precedent); static incomplete → cap 40;
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

/** Comment-stripped view of a source file: token checks run on code, not prose
 * (H8 statement-anchored precedent — migration-record comments must not false-hit). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}
const TASK = 'H17-merge-calls'
const PKG = '@bench/dsh-bench-merge-calls'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/
const RUNTIME_REF = /dsh-client-runtime/
const LEGACY_VIEW_FIELDS = /block\.resultView|block\.callView|\.resultView\?\.|\.callView\?\./
const POST_INJECT = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-tool',
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
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

  // Act 2: static contract checks on the toolview plane.
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
  if (act2.legacyDerivations) {
    score = Math.min(score, 60)
    reasons.push('resultView/callView derivations retained — the fields were deleted from the call object in the alpha ui-tool (the memo\'s bait: "only renamed") — capped at 60 (M5 precedent)')
  }
  if (!act2.allPassed) {
    score = Math.min(score, 40)
    reasons.push('static migration incomplete — capped at 40')
  }
  if (act2.runtimeRetained) {
    score = Math.min(score, 20)
    reasons.push('dsh-client-runtime retained — the package was removed, the web tree cannot compose — capped at 20 (H9 precedent)')
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
    reasons.push('no diagnosis report under /app/agent-output/H17-merge-calls/')
    return { score, reasons }
  }
  if (text.includes('bench-merge-calls')) {
    score += 5
    reasons.push('diagnosis names the plugin (+5)')
  } else {
    reasons.push('diagnosis does not name the plugin')
  }
  if (text.includes('DSH-0.1.2-A1-03')) {
    score += 3
    reasons.push('diagnosis cites DSH-0.1.2-A1-03 (session view internals split: useChat + chat node types) (+3)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-03')
  }
  if (text.includes('DSH-0.1.2-A1-29')) {
    score += 2
    reasons.push('diagnosis cites DSH-0.1.2-A1-29 (primitives labels contract) (+2)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-29')
  }
  return { score, reasons }
}

/** Act 2: the ui-tool/ui-chat migration contract. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let legacyDerivations = false
  let runtimeRetained = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, legacyDerivations: true, runtimeRetained: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // (a) the deleted runtime module is gone everywhere (inject list + sources).
  if (/dsh-client-runtime/.test(JSON.stringify(pkg?.dsh?.client?.inject ?? [])) || RUNTIME_REF.test(stripComments(hostSrc) + stripComments(clientSrc))) {
    runtimeRetained = true
    allPassed = false
    reasons.push('dsh-client-runtime still referenced (the package was removed; runtime in the inject is boot-fatal)')
  } else {
    score += 6
    reasons.push('dsh-client-runtime gone from inject + sources (+6)')
  }

  // (b) the legacy per-call view derivations are gone — the bait's payload:
  //     ui-tool deleted its resultView/callView fields, so any surviving
  //     token means the derivation never moved.
  if (LEGACY_VIEW_FIELDS.test(stripComments(hostSrc) + stripComments(clientSrc))) {
    legacyDerivations = true
    allPassed = false
    reasons.push("resultView/callView derivations still present (the memo's bait: they were deleted, not renamed)")
  } else {
    score += 12
    reasons.push('no legacy per-call view derivations remain (+12)')
  }

  // (c) the card model: derivations anchor on block.meta (+ call args +
  //     result text) — the ui-tool rework's new contract.
  if (/block\.meta/.test(stripComments(clientSrc))) {
    score += 8
    reasons.push('card derivations read block.meta (+8)')
  } else {
    allPassed = false
    reasons.push('no block.meta derivation found (the cards must derive from block meta + call args + result text)')
  }

  // (d) the in-session read contract: useChat (the Chat target merged into
  //     SessionStandardProps by ui-chat), absent in the 0.1.1-era fixture.
  if (/useChat\s*\(/.test(clientSrc)) {
    score += 8
    reasons.push('in-session reads go through useChat (+8)')
  } else {
    allPassed = false
    reasons.push('no useChat call found (the chat-flow read must go through the Chat target)')
  }

  // (e) the client inject recomposition: exactly the POST six-module list.
  const inject = pkg?.dsh?.client?.inject ?? []
  if (JSON.stringify(inject) === JSON.stringify(POST_INJECT)) {
    score += 8
    reasons.push('dsh.client.inject recomposed to the six alpha-cohort modules (+8)')
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject is not the POST six-module list (got: ${JSON.stringify(inject)})`)
  }

  // (f) the labels contract: the override dicts relax to Partial (missing
  //     keys fall back to base zh/en) and the base dicts gained the
  //     ReadBlock/SearchBlock/DiffBlock/WebBlock label keys.
  if (/Partial</.test(clientSrc) && !/Record<string, Record<string, string>>/.test(stripComments(clientSrc)) && /'read\.window'/.test(stripComments(clientSrc))) {
    score += 4
    reasons.push('override dicts carry the Partial JSDoc; base dicts gained the primitives label keys (+4)')
  } else {
    allPassed = false
    reasons.push('override dicts not relaxed to Partial / primitives label keys missing from the base dicts')
  }

  // (g) the peer cohort: all dsh peers on the alpha cohort, bare cordis peer removed.
  const peers = pkg.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([k]) => k.startsWith('@deepseek-ai/dsh-'))
  const offCohort = dshPeers.filter(([, v]) => !ALPHA_COHORT.test(String(v)))
  const bareCordis = Object.hasOwn(peers, 'cordis')
  if (dshPeers.length >= 6 && offCohort.length === 0 && !bareCordis && peers['@deepseek-ai/cordis'] === '^4.0.1') {
    score += 4
    reasons.push(`peer cohort rewritten (${dshPeers.length} dsh peers on ^0.1.2-alpha.1, scoped cordis ^4.0.1, bare cordis removed) (+4)`)
  } else {
    allPassed = false
    reasons.push(`peer cohort incomplete (dsh peers: ${dshPeers.length}, off-cohort: ${offCohort.map(([k, v]) => `${k}@${v}`).join(', ') || 'none'}, bare cordis ${bareCordis ? 'retained' : 'removed'}, scoped cordis: ${peers['@deepseek-ai/cordis'] ?? 'missing'})`)
  }

  return { score, allPassed, legacyDerivations, runtimeRetained, reasons }
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
