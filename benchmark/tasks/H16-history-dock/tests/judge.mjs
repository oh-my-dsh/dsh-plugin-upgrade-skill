// H16-history-dock grading: the composer surface became a Lexical contenteditable
// DIV (card DSH-0.1.2-A1-28) and the session view internals split (card
// DSH-0.1.2-A1-03) — the whole exam is the client plane.
//   15 — diagnosis.md exists (5), names the plugin (5), cites DSH-0.1.2-A1-28 (3) + DSH-0.1.2-A1-03 (2);
//   50 — static migration contract:
//        querySelector('textarea') gone from the sources (6)
//        + keydown listener registered in the CAPTURE phase — third-arg true or
//          { capture: true } — with the bubble-phase form gone (10)
//        + listener placement: the apply body contains no addEventListener call,
//          the registration lives inside the dock component (8)
//        + history collection reads the Chat target's legacy node slice via
//          useChat AND no direct session.nodes read remains (8)
//        + slash/@ menus yielded via the data-trigger-menu marker (6)
//        + dsh-client-runtime gone from inject/peers/deps/sources (6)
//        + dsh.client.inject recomposed for the new module split (6);
//   25 — real container verification: `dsh plugin add` succeeds (8), web cold boot with
//        no negative signal (9), __DSH_BOOT__.entries lists the client entry (8);
//   10 — version bumped vs the git baseline (6) + "private": true preserved (4).
// Caps (single-task precedents): the fixture's memo says the composer is "still a
// <textarea> under the hood — keep querySelector('textarea') and the apply-level
// listener so history works in hero mode too" — keeping the textarea locator OR
// the apply-level listener caps at 60 (H9/M5 memo precedent); the removed
// dsh-client-runtime module retained caps at 20 (the web tree cannot compose —
// H9 precedent); static incomplete → cap 40; fixture unchanged → 0.
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

const TASK = 'H16-history-dock'
const PKG = '@bench/dsh-bench-history-dock'
const POST_INJECT = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-chat',
  '@deepseek-ai/dsh-client-ui-renderer',
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

  // Act 2: static migration contract on the client plane (+ package.json).
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
  if (act2.textareaRetained) {
    score = Math.min(score, 60)
    reasons.push("querySelector('textarea') retained (the memo's bait: the composer is still a textarea under the hood) — capped at 60")
  }
  if (act2.applyListenerRetained) {
    score = Math.min(score, 60)
    reasons.push("the keydown listener still lives in the plugin's apply body (the memo's bait; hero has no session machine) — capped at 60")
  }
  if (act2.runtimeRetained) {
    score = Math.min(score, 20)
    reasons.push('the removed dsh-client-runtime module still referenced — the web tree cannot compose, capped at 20 (H9 precedent)')
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
    reasons.push('no diagnosis report under /app/agent-output/H16-history-dock/')
    return { score, reasons }
  }
  if (text.includes('bench-history-dock')) {
    score += 5
    reasons.push('diagnosis names the plugin (+5)')
  } else {
    reasons.push('diagnosis does not name the plugin')
  }
  if (text.includes('DSH-0.1.2-A1-28')) {
    score += 3
    reasons.push('diagnosis cites DSH-0.1.2-A1-28 (composer surface: textarea -> Lexical contenteditable) (+3)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-28')
  }
  if (text.includes('DSH-0.1.2-A1-03')) {
    score += 2
    reasons.push('diagnosis cites DSH-0.1.2-A1-03 (session view split) (+2)')
  } else {
    reasons.push('diagnosis does not cite DSH-0.1.2-A1-03')
  }
  return { score, reasons }
}

/** Act 2: the composer-surface migration contract on the client plane. */
function scoreStatic() {
  const reasons = []
  let score = 0
  let allPassed = true
  let textareaRetained = false
  let applyListenerRetained = false
  let runtimeRetained = false

  const hostSrc = readText(join(FIXTURE_DIR, 'index.js')) ?? ''
  const clientSrc = readText(join(FIXTURE_DIR, 'client.js')) ?? ''

  let pkg = null
  try {
    pkg = JSON.parse(readFileSync(join(FIXTURE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    return { score: 0, allPassed: false, textareaRetained: true, applyListenerRetained: true, runtimeRetained: true, reasons: [`failed to parse package.json: ${error.message}`] }
  }

  // (a) the textarea locator is gone — the composer is a Lexical
  //     contenteditable DIV now (card DSH-0.1.2-A1-28).
  if (/querySelector\(\s*'textarea'\s*\)/.test(stripComments(clientSrc) + stripComments(hostSrc))) {
    textareaRetained = true
    allPassed = false
    reasons.push("querySelector('textarea') still present — the composer is a Lexical contenteditable DIV")
  } else {
    score += 6
    reasons.push("querySelector('textarea') gone from the sources (+6)")
  }

  // (b) the navigation listener contract: document-level capture-phase keydown
  //     (third argument true / { capture: true }); the bubble form is gone.
  const keydownArgs = keydownCaptureArgs(clientSrc)
  const isCaptureArg = (arg) => arg === 'true' || /^\{\s*capture\s*:\s*true\s*\}$/.test(arg)
  if (keydownArgs.length > 0 && keydownArgs.every(isCaptureArg)) {
    score += 10
    reasons.push('keydown listener registered in the capture phase (third-arg true / { capture: true }); no bubble-phase keydown remains (+10)')
  } else if (keydownArgs.some(isCaptureHit)) {
    allPassed = false
    reasons.push('capture-phase keydown present but a bubble-phase keydown listener is still registered')
  } else {
    allPassed = false
    reasons.push('no capture-phase document keydown listener (a bubble-phase handler runs after the Lexical keymap)')
  }

  // (c) listener placement: the apply body attaches nothing; the registration
  //     lives inside the dock component (the only session-scoped machine faces).
  const applyBody = functionBody(clientSrc, /export function apply\s*\([^)]*\)\s*\{/)
  const outsideApply = applyBody === null ? clientSrc : clientSrc.replace(applyBody, () => '')
  const factoryForm = /__ModuleLoader__\s*\.\s*load\s*\(/.test(clientSrc)
  const factoryPlacement = factoryForm && applyBody === null && /addEventListener\(\s*'keydown'/.test(stripFunctionBodies(clientSrc)) === false
  if ((applyBody !== null && !/addEventListener/.test(applyBody) && /addEventListener\(\s*'keydown'/.test(outsideApply)) || factoryPlacement) {
    score += 8
    reasons.push('keydown listener registered inside the dock component; the apply body attaches nothing (+8)')
  } else {
    applyListenerRetained = true
    allPassed = false
    reasons.push("the keydown listener still lives in the plugin's apply body (hero/blank mode has no session machine — the listener has nowhere to land)")
  }

  // (d) history collection: the Chat target's legacy node slice via useChat;
  //     the direct conversation-node read is gone.
  if (/useChat/.test(clientSrc) && /legacy\.nodes/.test(clientSrc) && !/session\.nodes/.test(stripComments(clientSrc) + stripComments(hostSrc))) {
    score += 8
    reasons.push('history collection reads the Chat target legacy node slice via useChat (+8)')
  } else {
    allPassed = false
    reasons.push('history collection not moved to useChat(s => s.legacy.nodes) (or a direct session.nodes read remains)')
  }

  // (e) the slash/@ trigger-menu yield.
  if (/data-trigger-menu/.test(clientSrc)) {
    score += 6
    reasons.push('slash/@ menus yielded via the data-trigger-menu marker (+6)')
  } else {
    allPassed = false
    reasons.push('no data-trigger-menu guard found (capture phase cannot read the defaultPrevented heuristic)')
  }

  // (f) the deleted runtime module, gone from every plane.
  const depText = JSON.stringify({ i: pkg.dsh?.client?.inject ?? [], d: pkg.dependencies ?? {}, p: pkg.peerDependencies ?? {}, m: pkg.peerDependenciesMeta ?? {} })
  if (!depText.includes('dsh-client-runtime') && !stripComments(hostSrc).includes('dsh-client-runtime') && !stripComments(clientSrc).includes('dsh-client-runtime')) {
    score += 6
    reasons.push('dsh-client-runtime gone from inject, peers, deps and sources (+6)')
  } else {
    runtimeRetained = true
    allPassed = false
    reasons.push('dsh-client-runtime still referenced (the package was removed and split by domain)')
  }

  // (g) the recomposed inject list.
  const inject = pkg?.dsh?.client?.inject ?? []
  if (inject.length > 0 && JSON.stringify(inject) === JSON.stringify(POST_INJECT)) {
    score += 6
    reasons.push('dsh.client.inject recomposed for the new module split (ui-chat + ui-renderer present) (+6)')
  } else {
    allPassed = false
    reasons.push(`dsh.client.inject does not match the 0.1.2-alpha module split (got: ${inject.join(', ') || 'empty'})`)
  }

  return { score, allPassed, textareaRetained, applyListenerRetained, runtimeRetained, reasons }
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

/** The source span of a function declaration, via brace matching from its header. */
function functionBody(src, header) {
  const match = src.match(header)
  if (match === null) return null
  let depth = 0
  for (let i = match.index + match[0].length - 1; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return src.slice(match.index, i + 1)
    }
  }
  return null
}

/** Last-argument values of every addEventListener('keydown', …) call in the source. */
function keydownCaptureArgs(src) {
  const args = []
  const re = /addEventListener\(\s*'keydown'\s*,/g
  let match
  while ((match = re.exec(src)) !== null) {
    let depth = 1
    let tail = ''
    let i = re.lastIndex
    while (i < src.length && depth > 0) {
      const ch = src[i]
      if (ch === '(') depth += 1
      else if (ch === ')') {
        depth -= 1
        if (depth === 0) break
      }
      tail += ch
      i += 1
    }
    const lastComma = tail.lastIndexOf(',')
    args.push(lastComma === -1 ? '' : tail.slice(lastComma + 1).trim())
  }
  return args
}

/** The file with every function body removed (balanced-brace scan over function
 * headers, including the factory-form apply inside __ModuleLoader__.load), so a
 * keydown registration remaining in the residue sits at module top level. */
function stripFunctionBodies(src) {
  let out = src
  for (let pass = 0; pass < 12; pass++) {
    const m = /(?:function\s*[\w$]*\s*\([^()]*\)\s*\{)|(?:=>\s*\{)/.exec(out)
    if (m === null) break
    const open = out.indexOf('{', m.index)
    let depth = 0
    let end = -1
    for (let i = open; i < out.length; i++) {
      if (out[i] === '{') depth += 1
      else if (out[i] === '}') {
        depth -= 1
        if (depth === 0) { end = i; break }
      }
    }
    if (end < 0) break
    out = out.slice(0, open) + ' ' + out.slice(end + 1)
  }
  return out
}

function isCaptureHit(arg) {
  return arg === 'true' || /^\{\s*capture\s*:\s*true\s*\}$/.test(arg)
}
