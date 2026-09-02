// M11-sidebar-spur grading: client-plane migration (client-runtime removal + the slots service's move to ui-renderer).
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-25 (3) + R-01 (2);
//   50 — static migration contract:
//        dsh-client-runtime references gone from deps + inject + sources (10)
//        + slots service type source repointed to dsh-client-ui-renderer/client (8)
//        + dock registration intact on the repointed context (8)
//        + dsh.client.inject recomposed to the POST list exactly (10)
//        + every @deepseek-ai/dsh-* peer floor on the 0.1.2-alpha cohort (8)
//        + no bare `cordis` peer and @deepseek-ai/cordis at ^4.0.1 exactly (4)
//        + ctx.locale.register two-arg call retained with the type-level namespace map (2);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says the ctx.slots service still lives in
// dsh-client-runtime on alpha ("only renamed internally; keep the runtime inject entry so the
// dock keeps mounting") — following it retains the deleted package in the client inject, which
// is boot-fatal, caps at 20 (H14-mineru-api precedent); ui-renderer missing from the client
// inject while the dock registration is kept caps at 40 (the dock mounts through the
// ui-renderer SlotRegistry since the split); static incomplete → cap 40; fixture unchanged → 0.
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

const TASK = 'M11-sidebar-spur'
const PKG = '@bench/dsh-bench-sidebar-spur'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/
const RUNTIME_REF = /dsh-client-runtime/
// Import-path form only (`'@deepseek-ai/dsh-client-runtime…`): prose comments
// naming the deleted package cannot false-hit (H8 precedent).
const RUNTIME_IMPORT = /'@deepseek-ai\/dsh-client-runtime(\/|')/
const DOCK_INJECT = /ctx\.slots\.inject\(\s*'conversation\.composer\.dock'/
const DOCK_REGISTER = /ctx\.slots\.register\(\s*\{[^}]*name:\s*'conversation\.composer\.dock'/
const CORDIS_CONTEXT = /import\('@deepseek-ai\/cordis'\)\.Context/
const UI_RENDERER_MERGE = /'@deepseek-ai\/dsh-client-ui-renderer\/client'/
const LOCALE_REGISTER = /ctx\.locale\.register\(\s*NS\s*,\s*\{\s*zh/
const POST_INJECT = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-conversation',
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

  // Act 2: static contract checks on the client plane.
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
    reasons.push('dsh-client-runtime retained in the client inject — the package was deleted; the web tree cannot compose, capped at 20 (H14 precedent)')
  }
  if (act2.uiRendererMissing) {
    score = Math.min(score, 40)
    reasons.push('dsh-client-ui-renderer missing from the client inject while the dock registration is kept — the dock mounts through the ui-renderer SlotRegistry since the split, capped at 40')
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
    reasons.push('no diagnosis report under /app/agent-output/M11-sidebar-spur/')
    return { score, reasons }
  }
  if (text.includes('bench-sidebar-spur')) {
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

/** Act 2: client type surface + inject list + peer cohort. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let runtimeRetained = false
  let uiRendererMissing = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, runtimeRetained: true, uiRendererMissing: true, reasons: [`failed to parse package.json: ${error.message}`] }
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
    reasons.push('dsh-client-runtime still referenced (the package was removed and split by domain)')
  }

  // (b) the slots service type source: the SlotRegistry merge lives in
  // ui-renderer since the split — the client source must carry the type-only
  // dsh-client-ui-renderer/client reference.
  if (UI_RENDERER_MERGE.test(clientSrc)) {
    score += 8
    reasons.push('ctx.slots type source repointed to dsh-client-ui-renderer/client (+8)')
  } else {
    allPassed = false
    reasons.push('no dsh-client-ui-renderer/client type reference found (the slots service moved to ui-renderer)')
  }

  // (c) the dock registration survives on the repointed context: the real
  // call shape (ctx.slots.inject('conversation.composer.dock', …) +
  // ctx.slots.register) with the context typed from @deepseek-ai/cordis.
  const dockShape = DOCK_INJECT.test(clientSrc) && DOCK_REGISTER.test(clientSrc)
  if (dockShape && CORDIS_CONTEXT.test(clientSrc)) {
    score += 8
    reasons.push('conversation.composer.dock registration intact on the @deepseek-ai/cordis Context (+8)')
  } else {
    allPassed = false
    reasons.push(dockShape ? 'dock registration kept but the client context is not typed from @deepseek-ai/cordis' : 'conversation.composer.dock registration shape missing')
  }

  // (d) the client inject list — the POST list exactly.
  if (inject.length === POST_INJECT.length && POST_INJECT.every((m) => inject.includes(m))) {
    score += 10
    reasons.push('dsh.client.inject recomposed to the five surviving platform modules (+10)')
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject mismatch: ${JSON.stringify(inject)}`)
  }

  // (e) the peer cohort.
  const peers = pkg.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([k]) => k.startsWith('@deepseek-ai/'))
  const offCohort = dshPeers.filter(([, v]) => !ALPHA_COHORT.test(String(v)))
  if (dshPeers.length > 0 && offCohort.length === 0) {
    score += 8
    reasons.push(`all ${dshPeers.length} @deepseek-ai peer floors sit on the 0.1.2-alpha cohort (+8)`)
  } else {
    allPassed = false
    reasons.push(`peer floors off the 0.1.2-alpha cohort: ${offCohort.map(([k, v]) => `${k}@${v}`).join(', ') || 'no @deepseek-ai peers declared'}`)
  }

  // (f) no bare `cordis` peer; the scoped cordis peer at ^4.0.1 exactly.
  if (!Object.prototype.hasOwnProperty.call(peers, 'cordis') && peers['@deepseek-ai/cordis'] === '^4.0.1') {
    score += 4
    reasons.push('no bare `cordis` peer; @deepseek-ai/cordis at ^4.0.1 (+4)')
  } else {
    allPassed = false
    reasons.push(`bare 'cordis' key present or @deepseek-ai/cordis not at ^4.0.1 (${peers['@deepseek-ai/cordis'] ?? 'none'})`)
  }

  // (g) the unchanged surface: the two-arg locale.register call + the
  // type-level namespace declaration (LocaleNamespaceMap augmentation).
  if (LOCALE_REGISTER.test(clientSrc) && /LocaleNamespaceMap/.test(clientSrc)) {
    score += 2
    reasons.push('ctx.locale.register two-arg call retained with the type-level namespace map (+2)')
  } else {
    allPassed = false
    reasons.push('locale.register call or the type-level LocaleNamespaceMap declaration missing')
  }

  // Cap bookkeeping: the dock kept but ui-renderer never added to the inject
  // list means the dock cannot mount (its SlotRegistry lives in ui-renderer).
  if (!inject.includes('@deepseek-ai/dsh-client-ui-renderer') && dockShape) {
    uiRendererMissing = true
    allPassed = false
  }

  if (runtimeRetained) allPassed = false
  return { score, allPassed, runtimeRetained, uiRendererMissing, reasons }
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
