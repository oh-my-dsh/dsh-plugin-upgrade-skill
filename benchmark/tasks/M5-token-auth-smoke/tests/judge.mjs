// M5-token-auth-smoke grading: install the agent's modified fixture into an isolated
// web profile, really cold-boot it, then run a browserless HTTP smoke against the
// self-built /ping channel.
//   100 — no-auth POST /ping/ping returns 401 AND the token-exchanged POST returns 200
//         (the channel is covered by the host's unified web/API authentication);
//    60 — no-auth 401 but the authenticated request is not 200 (the fix broke the
//         channel); or the smoke is otherwise green but a raw webServer.register is
//         still present (hand-rolled auth bypasses the host's unified auth — capped);
//    40 — the no-auth request is still answered (the channel is still naked), or the
//         web cold boot shows a negative signal, or the smoke cannot run;
//    30 — `dsh plugin add` failed;
//     0 — the fixture is untouched, or dsh is unavailable.
// Boundary: there is no browser in this container, so the verdict is HTTP-status-level
// only (401 without the Cookie, 200 after the token exchange); DOM/page behavior is
// not covered. The agent's own smoke.md is recorded as a reason and does not score.
// Results are emitted after try/finally — process.exit() inside emit() would skip the
// finally cleanup.
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
} from './judge-utils.mjs'

const TASK = 'M5-token-auth-smoke'
const PKG = '@demo/dsh-bench-ping'
const PROFILE = 'bench-m5-token-auth-smoke'
const TMP = '/tmp/bench-m5-token-auth-smoke'
const CHANNEL = '/ping'
const ENDPOINT = 'ping'
// Connection channels dispatch under /<channel>/<endpoint>; the envelope's method
// must equal the endpoint (verified against the alpha.2 rpc-host contract).
const ENVELOPE = JSON.stringify({
  type: 'client-request',
  rpcId: 'bench-m5-smoke',
  method: ENDPOINT,
  payload: null,
})

// The trap's own workaround is a check inside the raw web-server route; only a
// connection-registered channel inherits the host's unified authentication
// (DSH-0.1.2-A1-08). Statement-anchored so the trap comment cannot false-hit.
const RAW_ROUTE_RE = /^\s*(?:ctx\.)?webServer\.register\s*\(/m

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

  const rawRouteStillPresent = fixtureContains(RAW_ROUTE_RE)
  if (rawRouteStillPresent) reasons.push(`static note: ${rawRouteStillPresent} still registers through the raw web-server route`)

  let result = { score: 40, reasons: [...reasons] }
  try {
    const created = await createProfile(PROFILE, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) {
      result = { score: 0, reasons: [...reasons, created.detail] }
    } else {
      const added = await addPlugin(PROFILE, FIXTURE_DIR)
      if (!added.ok) {
        result = { score: 30, reasons: [...reasons, `dsh plugin add failed: ${added.detail}`] }
      } else {
        reasons.push('dsh plugin add succeeded')

        const boot = await bootWebAndFetchIndex(PROFILE, PKG)
        if (NEGATIVE_SIGNAL.test(boot.output)) {
          const hit = boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|did not activate/)?.[0] ?? 'unknown'
          result = { score: 40, reasons: [...reasons, `web cold boot shows a negative signal: ${hit} (40-point band)`] }
        } else {
          const url = /dsh web: (\S+)/.exec(boot.output)?.[1]
          if (url === undefined) {
            result = { score: 40, reasons: [...reasons, `could not find the dsh web URL in the boot log (tail: ${boot.output.trim().slice(-160)})`] }
          } else {
            reasons.push(`boot URL obtained: ${url}`)

            const smoke = await smokeChannel(url)
            if (smoke.noAuthStatus === null || smoke.authedStatus === null) {
              result = { score: 40, reasons: [...reasons, `smoke requests failed: ${smoke.error ?? 'fetch failure'}`] }
            } else {
              reasons.push(`no-auth POST ${CHANNEL}/${ENDPOINT} -> ${smoke.noAuthStatus}`)
              reasons.push(`token-exchanged POST ${CHANNEL}/${ENDPOINT} -> ${smoke.authedStatus}`)

              const evidence = readEvidence()
              if (evidence !== undefined) reasons.push(`agent smoke evidence: ${evidence}`)

              if (smoke.noAuthStatus === 401 && smoke.authedStatus === 200) {
                result = { score: 100, reasons: [...reasons, 'channel sits behind the host unified auth: no-auth 401, authed 200'] }
              } else if (smoke.noAuthStatus === 401) {
                result = { score: 60, reasons: [...reasons, 'no-auth request is 401 but the authenticated request is not 200: the fix broke the channel (60-point band)'] }
              } else {
                result = { score: 40, reasons: [...reasons, `no-auth request answered with ${smoke.noAuthStatus}: the channel is still not covered by host auth (40-point band)`] }
              }
            }
          }
        }
      }
    }
  } finally {
    await cleanupProfile(PROFILE, TMP)
  }

  let score = result.score
  const finalReasons = result.reasons
  if (score === 100 && rawRouteStillPresent) {
    score = 60
    finalReasons.push(`raw webServer.register is still present (${rawRouteStillPresent}) — hand-rolled auth bypasses the host's unified authentication (DSH-0.1.2-A1-08); capped at 60`)
  }
  emit(score, finalReasons)
}

/** True when any fixture source still contains a raw web-server route registration. */
function fixtureContains(regex) {
  for (const name of ['index.js', 'src/index.ts']) {
    try {
      if (regex.test(readFileSync(join(FIXTURE_DIR, name), 'utf8'))) return name
    } catch {
      // no such file — try the next candidate
    }
  }
  return null
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

/** Read the agent's smoke evidence (reason only, not scored). */
function readEvidence() {
  const dir = join('/app/agent-output', TASK)
  for (const name of ['smoke.md', 'report.md']) {
    const path = join(dir, name)
    try {
      const text = readFileSync(path, 'utf8').trim().slice(0, 300)
      return `${name}: ${text}`
    } catch {
      // no such file — try the next candidate
    }
  }
  return undefined
}
