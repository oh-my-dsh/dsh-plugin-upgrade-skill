// H8-fire-drill grading: one release, three plugins — four acts scored 20/30/30/20.
//   Act 1 diagnose (20): the reports name all three plugins (15) and cite the right
//        cards — DSH-0.1.2-A1-01 + DSH-0.1.2-A1-08 + R-01 (5);
//   Act 2 fix (30): static per-plugin checks, 10 each —
//        drill-host:  apiproxy dependency removed (4) + inject llm (3) + no remote (3);
//        drill-web:   raw webServer.register removed (4) + inject connection (3) +
//                     rpc.handle('/ping') (3);
//        drill-tools: unpublished 0.1.2-alpha.1 cohort gone (5) + published
//                     0.1.2-alpha cohort pinned (5);
//   Act 3 deploy (30): all three installed into a clean web profile (10), cold boot
//        reaches the app layer with a boot URL (10), token smoke 401 + 200 (10;
//        401-only 5);
//   Act 4 release (20): every plugin version bumped vs the git baseline (9) and the
//        checklist carries the semantic gate (verify-release) + prerelease dist-tag
//        routing with no forced/skipped publish markers (11).
// Caps (single-task precedents): drill-host injects remote (the bait comment) → the
// whole task is capped at 20 (H1-plane-trap); the smoke is green but the raw
// webServer.register remains → capped at 60 (M5-token-auth-smoke).
// 0 — fixture untouched or dsh unavailable.
// Boundary: there is no browser in this container, so the deploy verdict is
// HTTP-status-level only (401 without the Cookie, 200 after the token exchange).
// The agent's own evidence files are read as reasons, never scored. Results are
// emitted after try/finally — process.exit() inside emit() would skip the cleanup.
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
  readAgentText,
} from './judge-utils.mjs'

const TASK = 'H8-fire-drill'
const PROFILE = 'bench-h8-fire-drill'
const TMP = '/tmp/bench-h8-fire-drill'
const CHANNEL = '/ping'
const ENDPOINT = 'ping'
const PLUGIN_NAMES = ['drill-host', 'drill-web', 'drill-tools']
const ENVELOPE = JSON.stringify({
  type: 'client-request',
  rpcId: 'bench-h8-smoke',
  method: ENDPOINT,
  payload: null,
})

// Statement-anchored so the fixture comments cannot false-hit.
const RAW_ROUTE_RE = /^\s*(?:ctx\.)?webServer\.register\s*\(/m
// The fake procedure's trap, parroted into the checklist: a publish command
// carrying --force, or advice to skip the checks.
const RELEASE_TRAP_RE = /publish\s+(?:[^\s]*\s+)*--force|skip (?:the )?(?:checks?|verification|gates)/i

main().catch((error) => emit(0, [`judge error: ${error.message}`]))

async function main() {
  const reasons = []

  const gate = await fixtureChanges('fixture')
  if (gate.changed !== true) {
    emit(0, [`fixture unchanged (${gate.detail}), graded as 0`])
  }
  reasons.push('fixture was modified by the agent')

  if (!(await dshAvailable())) {
    emit(0, [...reasons, 'dsh unavailable in the container; runtime verification treated as failed'])
  }

  const agentText = readAgentText('/app/agent-output', TASK).text
  const act1 = scoreDiagnosis(agentText)
  reasons.push(...act1.reasons)
  const act2 = scoreStatic()
  reasons.push(...act2.reasons)
  const hostSrc = readText(join(FIXTURE_DIR, 'drill-host', 'index.js')) ?? ''
  const hostHasRemote = /inject\s*=\s*\[[^\]]*\bremote\b/.test(hostSrc)
  const webSrc = readText(join(FIXTURE_DIR, 'drill-web', 'index.js')) ?? ''

  let smokeGreen = false
  let act3 = 0
  try {
    const created = await createProfile(PROFILE, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) {
      reasons.push(created.detail)
    } else {
      let allAdded = true
      for (const name of PLUGIN_NAMES) {
        const added = await addPlugin(PROFILE, join(FIXTURE_DIR, name))
        if (!added.ok) {
          allAdded = false
          reasons.push(`dsh plugin add failed for ${name}: ${added.detail}`)
          break
        }
      }
      if (allAdded) {
        act3 += 10
        reasons.push('all three plugins installed into the isolated profile (+10)')

        const boot = await bootWebAndFetchIndex(PROFILE, '@demo/dsh-bench-drill-web')
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|did not activate/)?.[0] ?? 'unknown'
          reasons.push(`web cold boot shows a negative signal: ${hit}`)
        } else {
          const url = /dsh web: (\S+)/.exec(boot.output)?.[1]
          if (url === undefined) {
            reasons.push(`could not find the dsh web URL in the boot log (tail: ${boot.output.trim().slice(-160)})`)
          } else {
            act3 += 10
            reasons.push(`web cold boot reached the app layer with a boot URL (+10): ${url}`)

            const smoke = await smokeChannel(url)
            if (smoke.noAuthStatus === null || smoke.authedStatus === null) {
              reasons.push(`smoke requests failed: ${smoke.error ?? 'fetch failure'}`)
            } else {
              reasons.push(`no-auth POST ${CHANNEL}/${ENDPOINT} -> ${smoke.noAuthStatus}`)
              reasons.push(`token-exchanged POST ${CHANNEL}/${ENDPOINT} -> ${smoke.authedStatus}`)
              if (smoke.noAuthStatus === 401 && smoke.authedStatus === 200) {
                act3 += 10
                smokeGreen = true
                reasons.push('token smoke green: 401 without the Cookie, 200 after the exchange (+10)')
              } else if (smoke.noAuthStatus === 401) {
                act3 += 5
                reasons.push('no-auth 401 but the authed request is not 200 (+5)')
              } else {
                reasons.push(`no-auth request answered with ${smoke.noAuthStatus}: the channel is still not covered by host auth`)
              }
            }
          }
        }
      }
    }
  } finally {
    await cleanupProfile(PROFILE, TMP)
  }

  const act4 = await scoreRelease(agentText)
  reasons.push(...act4.reasons)

  let score = act1.score + act2.score + act3 + act4.score
  if (hostHasRemote) {
    score = Math.min(score, 20)
    reasons.push('drill-host injects remote (the bait comment) — fatal host-plane mistake, capped at 20 (H1-plane-trap precedent)')
  }
  if (smokeGreen && RAW_ROUTE_RE.test(webSrc)) {
    score = Math.min(score, 60)
    reasons.push('token smoke green but the raw webServer.register remains — hand-rolled auth bypasses the host unified auth, capped at 60 (M5-token-auth-smoke precedent)')
  }
  emit(score, reasons)
}

/** Act 1: diagnosis report names every plugin and cites the right cards. */
function scoreDiagnosis(text) {
  const reasons = []
  let score = 0
  for (const name of PLUGIN_NAMES) {
    if (text.includes(name)) {
      score += 5
      reasons.push(`diagnosis names ${name} (+5)`)
    } else {
      reasons.push(`diagnosis does not name ${name}`)
    }
  }
  if (text.includes('DSH-0.1.2-A1-01')) {
    score += 2
    reasons.push('diagnosis cites DSH-0.1.2-A1-01 (+2)')
  }
  if (text.includes('DSH-0.1.2-A1-08')) {
    score += 2
    reasons.push('diagnosis cites DSH-0.1.2-A1-08 (+2)')
  }
  if (/\bR-01\b/.test(text)) {
    score += 1
    reasons.push('diagnosis cites R-01 (+1)')
  }
  return { score, reasons }
}

/** Act 2: static per-plugin migration checks. */
function scoreStatic() {
  const reasons = []
  let score = 0

  const hostPkgText = readText(join(FIXTURE_DIR, 'drill-host', 'package.json'))
  const hostSrc = readText(join(FIXTURE_DIR, 'drill-host', 'index.js')) ?? ''
  if (hostPkgText !== null && !hostPkgText.includes('dsh-host-apiproxy')) {
    score += 4
    reasons.push('drill-host: apiproxy dependency removed (+4)')
  } else {
    reasons.push('drill-host: apiproxy dependency still present')
  }
  if (/inject\s*=\s*\[[^\]]*\bllm\b/.test(hostSrc)) {
    score += 3
    reasons.push('drill-host: inject includes llm (+3)')
  } else {
    reasons.push('drill-host: inject does not include llm')
  }
  if (!/inject\s*=\s*\[[^\]]*\bremote\b/.test(hostSrc)) {
    score += 3
    reasons.push('drill-host: inject does not include remote (+3)')
  } else {
    reasons.push('drill-host: inject includes remote (the bait comment trap)')
  }

  const webSrc = readText(join(FIXTURE_DIR, 'drill-web', 'index.js')) ?? ''
  if (!RAW_ROUTE_RE.test(webSrc)) {
    score += 4
    reasons.push('drill-web: raw webServer.register removed (+4)')
  } else {
    reasons.push('drill-web: raw webServer.register still present')
  }
  if (/inject\s*=\s*\[[^\]]*\bconnection\b/.test(webSrc)) {
    score += 3
    reasons.push('drill-web: inject includes connection (+3)')
  } else {
    reasons.push('drill-web: inject does not include connection')
  }
  if (/rpc\.handle\(\s*['"]\/ping['"]/.test(webSrc)) {
    score += 3
    reasons.push("drill-web: rpc.handle('/ping') present (+3)")
  } else {
    reasons.push("drill-web: rpc.handle('/ping') not found")
  }

  const toolsPkgText = readText(join(FIXTURE_DIR, 'drill-tools', 'package.json'))
  if (toolsPkgText !== null) {
    if (!toolsPkgText.includes('0.1.2-alpha.1')) {
      score += 5
      reasons.push('drill-tools: unpublished 0.1.2-alpha.1 cohort gone (+5)')
    } else {
      reasons.push('drill-tools: still pins the unpublished 0.1.2-alpha.1 cohort')
    }
    if (/0\.1\.2-alpha\.[23]/.test(toolsPkgText)) {
      score += 5
      reasons.push('drill-tools: cohort aligned to a published 0.1.2-alpha version (+5)')
    } else {
      reasons.push('drill-tools: no published 0.1.2-alpha cohort found')
    }
  }

  return { score, reasons }
}

/** Act 4: every version bumped vs the git baseline; checklist carries the gates. */
async function scoreRelease(text) {
  const reasons = []
  let score = 0
  for (const name of PLUGIN_NAMES) {
    const current = parseVersion(readText(join(FIXTURE_DIR, name, 'package.json')))
    const baseline = parseVersion(await baselineText(`fixture/${name}/package.json`))
    if (current !== null && baseline !== null && current !== baseline) {
      score += 3
      reasons.push(`${name}: version bumped ${baseline} -> ${current} (+3)`)
    } else {
      reasons.push(`${name}: version not bumped vs baseline (${baseline} -> ${current ?? 'unreadable'})`)
    }
  }
  if (/verify-release/i.test(text)) {
    score += 4
    reasons.push('release checklist carries the verify-release semantic gate (+4)')
  } else {
    reasons.push('release checklist does not mention verify-release')
  }
  if (/(dist-tag|NPM_TAG|\bnext\b)/i.test(text)) {
    score += 4
    reasons.push('release checklist covers the prerelease dist-tag routing (+4)')
  } else {
    reasons.push('release checklist does not cover the prerelease dist-tag routing')
  }
  if (!RELEASE_TRAP_RE.test(text)) {
    score += 3
    reasons.push('release checklist has no forced/skipped publish markers (+3)')
  } else {
    reasons.push('release checklist carries a forced/skipped publish marker (publish --force / skip checks) — the fake-procedure trap')
  }
  return { score, reasons }
}

/** Browserless smoke: no-auth POST and token→Cookie→POST, returning each HTTP status. */
async function smokeChannel(url) {
  const base = url.split('/?')[0]
  const channelUrl = `${base}${CHANNEL}/${ENDPOINT}`
  const script = `
const url = process.argv[1];
const channelUrl = process.argv[2];
const envelope = process.argv[3];
const outcome = { noAuthStatus: null, authedStatus: null };
try {
  const noAuth = await fetch(channelUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: envelope,
    redirect: "manual",
  });
  outcome.noAuthStatus = noAuth.status;
  const token = await fetch(url, { redirect: "manual" });
  const setCookie = token.headers.getSetCookie ? token.headers.getSetCookie() : [token.headers.get("set-cookie")];
  const cookie = setCookie.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  const authed = await fetch(channelUrl, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: envelope,
    redirect: "manual",
  });
  outcome.authedStatus = authed.status;
} catch (error) {
  outcome.error = String(error);
}
console.log("__RESULT__" + JSON.stringify(outcome));
`
  const result = await localExec(`node --input-type=module -e '${script}' '${url}' '${channelUrl}' '${ENVELOPE}'`, { timeout: 120000 })
  const marker = '__RESULT__'
  const idx = result.stdout.lastIndexOf(marker)
  if (idx < 0) return { noAuthStatus: null, authedStatus: null, error: result.stderr.trim().slice(-200) }
  try {
    return JSON.parse(result.stdout.slice(idx + marker.length).trim())
  } catch {
    return { noAuthStatus: null, authedStatus: null, error: 'failed to parse smoke result' }
  }
}

/** The committed baseline content of a path inside /app (git repo root). */
async function baselineText(rel) {
  const result = await localExec(`git -C /app show HEAD:${rel}`)
  if (result.code !== 0) return null
  return result.stdout
}

function parseVersion(text) {
  if (text === null) return null
  try {
    const version = JSON.parse(text).version
    return typeof version === 'string' ? version : null
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
