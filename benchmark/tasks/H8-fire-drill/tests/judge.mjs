// H8-fire-drill grading — declarative checkpoints (tests/checkpoints.json), four acts.
// Gate layer (environment health, scored before any checkpoint):
//   fixture unchanged -> 0; dsh unavailable -> 0.
// Checkpoint layer: every checkpoint is measured against BOTH the pristine trap
// fixture (restored from the git baseline) and the agent's patched fixture.
//   fail-to-pass: patched must pass while the pristine baseline must not pass;
//   pass-to-pass: patched must keep passing (pristine passed or was unmeasurable);
//   report: agent-written artifacts only (diagnosis/release checklists);
//   pass: patched-only runtime/static requirement;
//   requires: dependency chain (smoke-200 only counts after smoke-401);
//   cap: declared ceilings — remote bait caps at 20, a raw route surviving a green
//        smoke caps at 60 (single-task precedents).
// A fail-to-pass checkpoint whose pristine baseline already passes means the trap
// fixture has drifted — the judge stops with a baseline-mismatch verdict.
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
  readAgentText,
  restorePristine,
} from './judge-utils.mjs'

const TASK = 'H8-fire-drill'
const CHANNEL = '/ping'
const ENDPOINT = 'ping'
const PLUGIN_NAMES = ['drill-host', 'drill-web', 'drill-tools']
const ENVELOPE = JSON.stringify({ type: 'client-request', rpcId: 'bench-h8-smoke', method: ENDPOINT, payload: null })
const RAW_ROUTE_RE = /^\s*(?:ctx\.)?webServer\.register\s*\(/m
const RELEASE_TRAP_RE = /publish\s+(?:[^\s]*\s+)*--force|skip (?:the )?(?:checks?|verification|gates)/i
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

  const agentText = readAgentText('/app/agent-output', TASK).text
  const pristine = await restorePristine(TASK)
  if (!pristine.ok) {
    emit(0, [...reasons, `baseline mismatch: cannot restore the pristine fixture (${pristine.detail})`])
  }

  // Pristine run — pins the documented trap state before anything is scored.
  const pristineOutcome = await measure(pristine.dir, 'bench-h8-pristine')
  if (!pristineOutcome.installOk) {
    emit(0, [...reasons, `baseline mismatch: pristine trap plugins cannot be installed (${pristineOutcome.installDetail ?? 'unknown'})`])
  }
  // Version checkpoints: the pristine fixture IS the committed baseline, so its
  // versions are un-bumped by definition ('fail' = "not yet bumped").
  const baseline = {
    'host-apiproxy-removed': hasText(pristine.dir, 'drill-host', 'package.json', 'dsh-host-apiproxy') ? 'fail' : 'pass',
    'host-inject-llm': /inject\s*=\s*\[[^\]]*\bllm\b/.test(sourceOf(pristine.dir, 'drill-host')) ? 'pass' : 'fail',
    'host-no-remote': /inject\s*=\s*\[[^\]]*\bremote\b/.test(sourceOf(pristine.dir, 'drill-host')) ? 'fail' : 'pass',
    'web-raw-removed': RAW_ROUTE_RE.test(sourceOf(pristine.dir, 'drill-web')) ? 'fail' : 'pass',
    'web-inject-connection': /inject\s*=\s*\[[^\]]*\bconnection\b/.test(sourceOf(pristine.dir, 'drill-web')) ? 'pass' : 'fail',
    'web-rpc-handle': /rpc\.handle\(\s*['"]\/ping['"]/.test(sourceOf(pristine.dir, 'drill-web')) ? 'pass' : 'fail',
    'tools-cohort-gone': hasText(pristine.dir, 'drill-tools', 'package.json', '0.1.2-alpha.1') ? 'fail' : 'pass',
    'tools-cohort-pinned': /0\.1\.2-alpha\.[23]/.test(pkgTextOf(pristine.dir, 'drill-tools')) ? 'pass' : 'fail',
    'install-ok': pristineOutcome.installOk ? 'pass' : 'fail',
    'boot-green': pristineOutcome.bootOk ? 'pass' : 'fail',
    'smoke-401': pristineOutcome.noAuthStatus === 401 ? 'pass' : pristineOutcome.noAuthStatus === null ? 'unavailable' : 'fail',
    'smoke-200': pristineOutcome.authedStatus === 200 ? 'pass' : pristineOutcome.authedStatus === null ? 'unavailable' : 'fail',
    'version-host': 'fail',
    'version-web': 'fail',
    'version-tools': 'fail',
  }
  for (const cp of DECL.checkpoints) {
    if (cp.type === 'fail-to-pass' && baseline[cp.id] === 'pass') {
      emit(0, [...reasons, `baseline mismatch: checkpoint ${cp.id} already passes on the pristine trap fixture — the task is broken; fix the fixture before scoring`])
    }
  }
  reasons.push(`pristine baseline: install ${pristineOutcome.installOk ? 'ok' : 'failed'}, boot ${pristineOutcome.bootOk ? 'green' : 'failed'} (the documented trap), smoke ${pristineOutcome.noAuthStatus === null ? 'unmeasurable' : `${pristineOutcome.noAuthStatus}/${pristineOutcome.authedStatus}`}`)

  // Patched run.
  const patchedOutcome = await measure(FIXTURE_DIR, 'bench-h8-patched')
  const patched = {
    'names-drill-host': agentText.includes('drill-host') ? 'pass' : 'fail',
    'names-drill-web': agentText.includes('drill-web') ? 'pass' : 'fail',
    'names-drill-tools': agentText.includes('drill-tools') ? 'pass' : 'fail',
    'cites-cards': agentText.includes('DSH-0.1.2-A1-01') && agentText.includes('DSH-0.1.2-A1-08') && /\bR-01\b/.test(agentText) ? 'pass' : 'fail',
    'host-apiproxy-removed': hasText(FIXTURE_DIR, 'drill-host', 'package.json', 'dsh-host-apiproxy') ? 'fail' : 'pass',
    'host-inject-llm': /inject\s*=\s*\[[^\]]*\bllm\b/.test(sourceOf(FIXTURE_DIR, 'drill-host')) ? 'pass' : 'fail',
    'host-no-remote': /inject\s*=\s*\[[^\]]*\bremote\b/.test(sourceOf(FIXTURE_DIR, 'drill-host')) ? 'fail' : 'pass',
    'web-raw-removed': RAW_ROUTE_RE.test(sourceOf(FIXTURE_DIR, 'drill-web')) ? 'fail' : 'pass',
    'web-inject-connection': /inject\s*=\s*\[[^\]]*\bconnection\b/.test(sourceOf(FIXTURE_DIR, 'drill-web')) ? 'pass' : 'fail',
    'web-rpc-handle': /rpc\.handle\(\s*['"]\/ping['"]/.test(sourceOf(FIXTURE_DIR, 'drill-web')) ? 'pass' : 'fail',
    'tools-cohort-gone': hasText(FIXTURE_DIR, 'drill-tools', 'package.json', '0.1.2-alpha.1') ? 'fail' : 'pass',
    'tools-cohort-pinned': /0\.1\.2-alpha\.[23]/.test(pkgTextOf(FIXTURE_DIR, 'drill-tools')) ? 'pass' : 'fail',
    'install-ok': patchedOutcome.installOk ? 'pass' : 'fail',
    'boot-green': patchedOutcome.bootOk ? 'pass' : 'fail',
    'smoke-401': patchedOutcome.noAuthStatus === 401 ? 'pass' : 'fail',
    'smoke-200': patchedOutcome.authedStatus === 200 ? 'pass' : 'fail',
    'version-host': versionOf(FIXTURE_DIR, 'drill-host') !== versionOf(pristine.dir, 'drill-host') ? 'pass' : 'fail',
    'version-web': versionOf(FIXTURE_DIR, 'drill-web') !== versionOf(pristine.dir, 'drill-web') ? 'pass' : 'fail',
    'version-tools': versionOf(FIXTURE_DIR, 'drill-tools') !== versionOf(pristine.dir, 'drill-tools') ? 'pass' : 'fail',
    'report-verify-release': /verify-release/i.test(agentText) ? 'pass' : 'fail',
    'report-dist-tag': /(dist-tag|NPM_TAG|\bnext\b)/i.test(agentText) ? 'pass' : 'fail',
    'report-no-force': RELEASE_TRAP_RE.test(agentText) ? 'fail' : 'pass',
  }
  reasons.push(`patched runtime: install ${patchedOutcome.installOk ? 'ok' : `failed (${patchedOutcome.installDetail})`}, boot ${patchedOutcome.bootOk ? 'green' : 'failed'}, smoke ${patchedOutcome.noAuthStatus === null ? 'unmeasurable' : `${patchedOutcome.noAuthStatus}/${patchedOutcome.authedStatus}`}`)

  const graded = evaluateCheckpoints(DECL.checkpoints, patched, baseline)
  emit(Math.min(100, graded.score), [...reasons, ...graded.reasons], { checkpoints: graded.checkpoints })
}

/** One runtime measurement: add all three plugins from `pluginDir` to an isolated
 *  web profile, cold-boot, and smoke the /ping channel. */
async function measure(pluginDir, profile) {
  const tmp = `/tmp/${profile}`
  try {
    const created = await createProfile(profile, ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])
    if (!created.ok) return { installOk: false, bootOk: false, noAuthStatus: null, authedStatus: null, installDetail: created.detail }
    let installOk = true
    for (const name of PLUGIN_NAMES) {
      const added = await addPlugin(profile, join(pluginDir, name))
      if (!added.ok) {
        installOk = false
        return { installOk, bootOk: false, noAuthStatus: null, authedStatus: null, installDetail: `dsh plugin add failed for ${name}: ${added.detail}` }
      }
    }
    const boot = await bootWebAndFetchIndex(profile, '@demo/dsh-bench-drill-web')
    const bootOk = !NEGATIVE_SIGNAL.test(boot.output)
    const url = /dsh web: (\S+)/.exec(boot.output)?.[1]
    if (!bootOk || url === undefined) {
      return { installOk, bootOk: false, noAuthStatus: null, authedStatus: null, bootDetail: bootOk ? 'no boot URL in log' : (boot.output.match(/pending \(waiting for service: [^)]+\)|plugin tree failed|did not activate/)?.[0] ?? 'unknown') }
    }
    const smoke = await smokeChannel(url)
    if (smoke.noAuthStatus === null || smoke.authedStatus === null) {
      return { installOk, bootOk: true, noAuthStatus: null, authedStatus: null, bootDetail: `smoke requests failed: ${smoke.error ?? 'fetch failure'}` }
    }
    return { installOk, bootOk: true, noAuthStatus: smoke.noAuthStatus, authedStatus: smoke.authedStatus }
  } finally {
    await cleanupProfile(profile, tmp)
  }
}

function sourceOf(fixtureDir, plugin) {
  return readText(join(fixtureDir, plugin, 'index.js')) ?? ''
}

function pkgTextOf(fixtureDir, plugin) {
  return readText(join(fixtureDir, plugin, 'package.json')) ?? ''
}

function hasText(fixtureDir, plugin, file, needle) {
  const text = readText(join(fixtureDir, plugin, file))
  return text !== null && text.includes(needle)
}

function versionOf(fixtureDir, plugin) {
  try {
    const version = JSON.parse(pkgTextOf(fixtureDir, plugin)).version
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
