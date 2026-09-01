// M5-token-auth-smoke grading — declarative checkpoints (tests/checkpoints.json).
// Gate layer (environment health, scored before any checkpoint):
//   fixture unchanged -> 0; dsh unavailable -> 0; dsh plugin add failed -> 30;
//   web cold boot negative signal / no boot URL -> 40; smoke not measurable -> 40.
// Checkpoint layer: every checkpoint is measured against BOTH the pristine trap
// fixture (restored from the git baseline) and the agent's patched fixture.
//   fail-to-pass: patched must pass while the pristine baseline must not pass;
//   pass-to-pass: patched must keep passing (pristine passed);
//   cap: declared ceilings that keep the original band semantics.
// A fail-to-pass checkpoint whose pristine baseline already passes means the trap
// fixture has drifted — the judge stops with a baseline-mismatch verdict instead of
// awarding points that no longer mean anything.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addPlugin,
  bootWebAndFetchIndex,
  cleanupProfile,
  createProfile,
  dshAvailable,
  emit,
  evaluateCheckpoints,
  FIXTURE_DIR,
  fixtureChanges,
  localExec,
  NEGATIVE_SIGNAL,
  restorePristine,
} from './judge-utils.mjs'

const TASK = 'M5-token-auth-smoke'
const CHANNEL = '/ping'
const ENDPOINT = 'ping'
const ENVELOPE = JSON.stringify({ type: 'client-request', rpcId: 'bench-m5-smoke', method: ENDPOINT, payload: null })
const RAW_ROUTE_RE = /^\s*(?:ctx\.)?webServer\.register\s*\(/m
const DECL = JSON.parse(readFileSync(join(import.meta.dirname, 'checkpoints.json'), 'utf8'))

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

  const pristine = await restorePristine(TASK)
  if (!pristine.ok) {
    emit(0, [...reasons, `baseline mismatch: cannot restore the pristine fixture (${pristine.detail})`])
  }

  // Pristine run — pins the documented trap state before anything is scored.
  const pristineOutcome = await measure(pristine.dir, 'bench-m5-pristine')
  if (!pristineOutcome.measurable) {
    emit(0, [...reasons, `baseline mismatch: pristine trap state cannot be measured (${pristineOutcome.detail})`])
  }
  const baseline = {
    'authed-200': pristineOutcome.authedStatus === 200 ? 'pass' : 'fail',
    'no-auth-401': pristineOutcome.noAuthStatus === 401 ? 'pass' : 'fail',
    'raw-route-removed': rawRouteIn(pristine.dir) ? 'fail' : 'pass',
  }
  for (const cp of DECL.checkpoints) {
    if (cp.type === 'fail-to-pass' && baseline[cp.id] === 'pass') {
      emit(0, [...reasons, `baseline mismatch: checkpoint ${cp.id} already passes on the pristine trap fixture — the task is broken; fix the fixture before scoring`])
    }
  }
  reasons.push(`pristine baseline: no-auth ${pristineOutcome.noAuthStatus}, authed ${pristineOutcome.authedStatus}, raw route ${rawRouteIn(pristine.dir) ? 'present' : 'absent'}`)

  // Patched run — gates first, then the declared checkpoints.
  const patchedOutcome = await measure(FIXTURE_DIR, 'bench-m5-patched')
  if (patchedOutcome.addFailed) {
    emit(30, [...reasons, `dsh plugin add failed: ${patchedOutcome.addDetail}`])
  }
  if (!patchedOutcome.measurable) {
    emit(40, [...reasons, patchedOutcome.detail])
  }

  const patched = {
    'authed-200': patchedOutcome.authedStatus === 200 ? 'pass' : 'fail',
    'no-auth-401': patchedOutcome.noAuthStatus === 401 ? 'pass' : 'fail',
    'raw-route-removed': rawRouteIn(FIXTURE_DIR) ? 'fail' : 'pass',
  }
  for (const id of Object.keys(patched)) {
    reasons.push(`patched ${id}: ${patched[id]} (no-auth ${patchedOutcome.noAuthStatus}, authed ${patchedOutcome.authedStatus})`)
  }

  const graded = evaluateCheckpoints(DECL.checkpoints, patched, baseline)
  emit(Math.min(100, graded.score), [...reasons, ...graded.reasons], { checkpoints: graded.checkpoints })
}

/** One runtime measurement: add the plugin from `pluginDir` to an isolated profile,
 *  cold-boot the web profile, and smoke the channel. */
async function measure(pluginDir, profile) {
  const tmp = `/tmp/${profile}`
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) return { measurable: false, detail: created.detail }
    const added = await addPlugin(profile, pluginDir)
    if (!added.ok) return { addFailed: true, addDetail: added.detail }
    const boot = await bootWebAndFetchIndex(profile, '@demo/dsh-bench-ping')
    if (NEGATIVE_SIGNAL.test(boot.output)) {
      const hit = boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|did not activate/)?.[0] ?? 'unknown'
      return { measurable: false, detail: `web cold boot shows a negative signal: ${hit}` }
    }
    const url = /dsh web: (\S+)/.exec(boot.output)?.[1]
    if (url === undefined) {
      return { measurable: false, detail: `no boot URL in log (tail: ${boot.output.trim().slice(-160)})` }
    }
    const smoke = await smokeChannel(url)
    if (smoke.noAuthStatus === null || smoke.authedStatus === null) {
      return { measurable: false, detail: `smoke requests failed: ${smoke.error ?? 'fetch failure'}` }
    }
    return { measurable: true, noAuthStatus: smoke.noAuthStatus, authedStatus: smoke.authedStatus }
  } finally {
    await cleanupProfile(profile, tmp)
  }
}

function rawRouteIn(fixtureDir) {
  const text = readText(join(fixtureDir, 'index.js')) ?? ''
  return RAW_ROUTE_RE.test(text)
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
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
