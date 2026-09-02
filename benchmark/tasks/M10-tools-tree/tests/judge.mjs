// M10-tools-tree grading: client-runtime split migration, slots-service ownership (web two-plane plugin; H9-mineru-api web-profile precedent).
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-25 (3) + R-01 (2);
//   50 — static migration contract:
//        dsh-client-runtime references gone from deps + client inject + import paths (10)
//        + dsh.client.inject recomposed to exactly ui-primitives + ui-slots (10)
//        + slots service source: type-only references to BOTH
//          '@deepseek-ai/dsh-client-ui-renderer/client' (the ctx.slots SlotRegistry
//          merge — the runtime service moved to ui-renderer in the split) AND
//          '@deepseek-ai/dsh-client-ui-settings/client' (the 'settings.section' SlotMap entry) (12)
//        + the settings.section tab registration kept AND the slots service actually
//          wired (ui-renderer in the client inject OR the type-only ui-renderer/client
//          reference in client.js) (10)
//        + every @deepseek-ai/dsh-* peer floor sits on the 0.1.2-alpha cohort (8);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says ctx.slots is provided by
// dsh-client-ui-slots and the ui-renderer import is only cosmetic ("skip it and the
// inject entry") — false: the SlotRegistry Context merge lives in ui-renderer since the
// client-runtime split, so a slots registration kept with NO ui-renderer wiring anywhere
// (client inject list NOR the client source) leaves the slots service absent and the boot
// pends on 'slots' → capped at 40 (H9/M9 cap tier); static incomplete → cap 40;
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

const TASK = 'M10-tools-tree'
const PKG = '@bench/dsh-bench-tools-tree'
const ALPHA_COHORT = /^(\^|~)?0\.1\.2-alpha\.[12]$/
const RUNTIME_REF = /dsh-client-runtime/
// Import-path form only (`'@deepseek-ai/dsh-client-runtime…`): prose comments
// naming the deleted package cannot false-hit (H8 precedent).
const RUNTIME_IMPORT = /'@deepseek-ai\/dsh-client-runtime(\/|')/
const POST_INJECT = [
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
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
  if (act2.slotsBaitFollowed) {
    score = Math.min(score, 40)
    reasons.push("slots registration kept but no ui-renderer wiring anywhere (the memo's bait) — the slots service is absent and the boot pends on 'slots', capped at 40")
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
    reasons.push('no diagnosis report under /app/agent-output/M10-tools-tree/')
    return { score, reasons }
  }
  if (text.includes('bench-tools-tree')) {
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
    reasons.push('diagnosis cites R-01 (backup-first rollup) (+2)')
  } else {
    reasons.push('diagnosis does not cite R-01')
  }
  return { score, reasons }
}

/** Act 2: client inject + slots service source + registration + peer cohort. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let slotsBaitFollowed = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, slotsBaitFollowed: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // (a) the deleted runtime package is gone from every dependency block and the
  // client inject; in sources only the import-path form counts (H8 precedent).
  const depBlocks = JSON.stringify({ d: pkg.dependencies ?? {}, p: pkg.peerDependencies ?? {}, pd: pkg.devDependencies ?? {}, m: pkg.peerDependenciesMeta ?? {} })
  const inject = pkg?.dsh?.client?.inject ?? []
  if (!RUNTIME_REF.test(depBlocks) && !inject.includes('@deepseek-ai/dsh-client-runtime') && !RUNTIME_IMPORT.test(hostSrc) && !RUNTIME_IMPORT.test(clientSrc)) {
    score += 10
    reasons.push('dsh-client-runtime references removed from deps, client inject, and import paths (+10)')
  } else {
    allPassed = false
    reasons.push('dsh-client-runtime still referenced (the package was deleted in alpha.1; the client graph cannot compose)')
  }

  // (b) the client inject recomposition.
  if (inject.length === POST_INJECT.length && POST_INJECT.every((m) => inject.includes(m))) {
    score += 10
    reasons.push('dsh.client.inject recomposed to exactly ui-primitives + ui-slots (+10)')
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject is not exactly [ui-primitives, ui-slots] (got: ${JSON.stringify(inject)})`)
  }

  // (c) the slots service source: type-only references to BOTH the ui-renderer
  // SlotRegistry merge and the ui-settings SlotMap entry.
  const uiRendererTyped = clientSrc.includes("'@deepseek-ai/dsh-client-ui-renderer/client'")
  const uiSettingsTyped = clientSrc.includes("'@deepseek-ai/dsh-client-ui-settings/client'")
  if (uiRendererTyped && uiSettingsTyped) {
    score += 12
    reasons.push('type-only Context merges declared from BOTH dsh-client-ui-renderer/client and dsh-client-ui-settings/client (+12)')
  } else {
    allPassed = false
    reasons.push(`slots service type-only sources incomplete (ui-renderer/client: ${uiRendererTyped}, ui-settings/client: ${uiSettingsTyped})`)
  }

  // (d) the settings.section registration, with the slots service actually wired.
  const injectKept = /ctx\.slots\.inject\(\s*'settings\.section'/.test(clientSrc) && /ctx\.slots\.register\(\s*\{/.test(clientSrc)
  const uiRendererWired = inject.includes('@deepseek-ai/dsh-client-ui-renderer') || uiRendererTyped
  if (injectKept && uiRendererWired) {
    score += 10
    reasons.push("settings.section tab registration kept with the slots service wired from ui-renderer (+10)")
  } else {
    allPassed = false
    if (!injectKept) {
      reasons.push("the settings.section tab registration (ctx.slots.inject + ctx.slots.register) is missing or reshaped")
    }
    if (!uiRendererWired) {
      slotsBaitFollowed = true
      reasons.push("slots registration kept with no ui-renderer wiring — the slots Context merge lives in ui-renderer since the client-runtime split")
    }
  }

  // (e) the peer cohort.
  const peers = pkg.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([k]) => k.startsWith('@deepseek-ai/dsh-'))
  const offCohort = dshPeers.filter(([, v]) => !ALPHA_COHORT.test(String(v)))
  if (dshPeers.length > 0 && offCohort.length === 0) {
    score += 8
    reasons.push(`all ${dshPeers.length} @deepseek-ai/dsh-* peer floors sit on the 0.1.2-alpha cohort (+8)`)
  } else {
    allPassed = false
    reasons.push(`peer floors off the 0.1.2-alpha cohort: ${offCohort.map(([k, v]) => `${k}@${v}`).join(', ') || 'no @deepseek-ai/dsh-* peers declared'}`)
  }

  return { score, allPassed, slotsBaitFollowed, reasons }
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
