// H15-locale-pack grading: the native third-language API replaces the monkey-patch layer.
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-10 (3) + DSH-0.1.2-A1-25 (2);
//   50 — static migration contract:
//        LocaleRuntime lookup monkey-patch residue gone from the sources (10)
//        + ctx.locale.addLanguage({ id, label, fallback }) catalog call present (10)
//        + ctx.locale.register called with the three-argument (ns, language-id, dict)
//          form AND the old two-argument register(NS, { zh, en }) form absent (10)
//        + localStorage read/write references gone (5)
//        + dsh.client.inject slims to exactly [dsh-client-locale] (7)
//        + peers narrowed to exactly {cordis ^4.0.1, dsh-client-locale ^0.1.2-alpha.1,
//          dsh-invariants ^0.1.2-alpha.1} with meta optional ×3 (8);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says to keep the lookup patch AND
// call addLanguage ("belt and braces, the patch takes precedence") — following it caps
// at 60 (M5 precedent: the native API replaces lookup, selection UI, persistence,
// <html lang> sync and per-key fallback, so a retained patch is double registration);
// the removed dsh-client-runtime module retained in the client inject caps at 20 (the
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

const TASK = 'H15-locale-pack'
const PKG = '@bench/dsh-bench-locale-pack'
const LOOKUP_ASSIGNMENT = /\.lookup\s*=/
const PATCH_MACHINERY = /probeLocaleRuntime|installPatch|origLookup/
const ADD_LANGUAGE = /locale\.addLanguage\(\{[^}]*fallback/
const REGISTER_THREE_ARG = /locale\.register\(\s*ns\s*,\s*[\w.$]+\s*,\s*[\w.$]+\s*\)/
const REGISTER_TWO_ARG = /locale\.register\(\s*[^,()]+,\s*\{/
const LOCAL_STORAGE = /localStorage\.(getItem|setItem|removeItem)\(/
const RUNTIME_REF = /dsh-client-runtime/
const POST_INJECT = ['@deepseek-ai/dsh-client-locale']
const POST_PEERS = {
  '@deepseek-ai/cordis': '^4.0.1',
  '@deepseek-ai/dsh-client-locale': '^0.1.2-alpha.1',
  '@deepseek-ai/dsh-invariants': '^0.1.2-alpha.1',
}

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

  // Act 2: static contract checks on the language-pack surface.
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
  if (act2.monkeyPatched) {
    score = Math.min(score, 60)
    reasons.push("the LocaleRuntime lookup monkey-patch is retained alongside addLanguage (the memo's bait: double registration) — capped at 60 (M5 precedent)")
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
    reasons.push('no diagnosis report under /app/agent-output/H15-locale-pack/')
    return { score, reasons }
  }
  if (text.includes('bench-locale-pack')) {
    score += 5
    reasons.push('diagnosis names the plugin (+5)')
  } else {
    reasons.push('diagnosis does not name the plugin')
  }
  if (text.includes('DSH-0.1.2-A1-10')) {
    score += 3
    reasons.push('diagnosis cites DSH-0.1.2-A1-10 (third-party language registration) (+3)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-10')
  }
  if (text.includes('DSH-0.1.2-A1-25')) {
    score += 2
    reasons.push('diagnosis cites DSH-0.1.2-A1-25 (client-runtime removal) (+2)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-25')
  }
  return { score, reasons }
}

/** Act 2: the native-API migration contract (patch removal + register form + inject/peers). */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let monkeyPatched = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, monkeyPatched: true, runtimeRetained: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // The deleted runtime module anywhere — inject list or type surface — is
  // boot-fatal for the web tree (H9 precedent).
  const runtimeRetained = /dsh-client-runtime/.test(JSON.stringify(pkg?.dsh?.client?.inject ?? []))
    || RUNTIME_REF.test(hostSrc + clientSrc)

  // (a) the monkey-patch machinery is gone: no `.lookup =` assignment and no
  //     install/probe residue. The native API replaces the lookup chain —
  //     keeping the patch AND calling addLanguage is double registration.
  if (LOOKUP_ASSIGNMENT.test(hostSrc + clientSrc) || PATCH_MACHINERY.test(hostSrc + clientSrc)) {
    monkeyPatched = true
    allPassed = false
    reasons.push("the locale lookup monkey-patch is still installed (the memo's belt-and-braces bait) — double registration")
  } else {
    score += 10
    reasons.push('LocaleRuntime lookup monkey-patch residue gone (+10)')
  }

  // (b) the native catalog API: addLanguage({ id, label, fallback }).
  if (ADD_LANGUAGE.test(clientSrc)) {
    score += 10
    reasons.push('ctx.locale.addLanguage({ id, label, fallback }) present (+10)')
  } else {
    allPassed = false
    reasons.push('no ctx.locale.addLanguage({ id, label, fallback }) call found')
  }

  // (c) the dictionary register form: the three-argument (ns, language-id, dict)
  //     single-locale form present; the old two-argument (NS, dicts) form absent.
  if (REGISTER_THREE_ARG.test(clientSrc) && !REGISTER_TWO_ARG.test(hostSrc + clientSrc)) {
    score += 10
    reasons.push('ctx.locale.register(ns, language-id, dict) three-argument form present, two-argument form absent (+10)')
  } else {
    allPassed = false
    reasons.push(REGISTER_TWO_ARG.test(hostSrc + clientSrc)
      ? 'the old two-argument register(NS, { zh, en }) form is still present'
      : 'no three-argument ctx.locale.register(ns, language-id, dict) call found')
  }

  // (d) the persistence handover: no localStorage read/write anywhere.
  if (!LOCAL_STORAGE.test(hostSrc + clientSrc)) {
    score += 5
    reasons.push('localStorage persistence removed (the durable locale.preference setting owns it now) (+5)')
  } else {
    allPassed = false
    reasons.push('localStorage read/write still present — persistence moved to the locale preference setting')
  }

  // (e) the client inject list slims to the single locale module.
  const inject = pkg?.dsh?.client?.inject ?? []
  if (JSON.stringify(inject) === JSON.stringify(POST_INJECT)) {
    score += 7
    reasons.push('dsh.client.inject slims to exactly [dsh-client-locale] (+7)')
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject is not the single-module locale list (got: ${JSON.stringify(inject)})`)
  }

  // (f) the peer cohort narrows to exactly the POST set; react/react-dom and
  //     every ui-* peer dropped; meta optional ×3.
  const peers = pkg.peerDependencies ?? {}
  const meta = pkg.peerDependenciesMeta ?? {}
  const peerKeys = Object.keys(peers)
  const exactPeers = peerKeys.length === Object.keys(POST_PEERS).length
    && Object.keys(POST_PEERS).every((k) => peers[k] === POST_PEERS[k])
  const metaOk = Object.keys(POST_PEERS).every((k) => meta[k]?.optional === true)
  if (exactPeers && metaOk) {
    score += 8
    reasons.push('peers narrowed to exactly {cordis ^4.0.1, dsh-client-locale ^0.1.2-alpha.1, dsh-invariants ^0.1.2-alpha.1}, meta optional ×3 (+8)')
  } else {
    allPassed = false
    reasons.push(`peer narrowing incomplete (extra/missing floors or wrong ranges; peers: ${peerKeys.join(', ') || 'none'})`)
  }

  return { score, allPassed, monkeyPatched, runtimeRetained, reasons }
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
