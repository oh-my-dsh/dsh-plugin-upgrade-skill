import { emitError } from './judge-result.mjs'
// H13-ghost-host-trap grading: parse the agent's preflight.json and check every claim
// against the box itself (the running host and the disk install).
//   40 — hostWireGeneration === 'pre-0.1.2' (the running process's real wire generation);
//   20 — processMatchesDisk === false (the process is NOT executing the bytes on disk);
//   15 — migrationFrom pins the pre-0.1.2 / 0.1.1 generation, not the alpha.2 on disk;
//   10 — probe-grade evidence: the unauthenticated /api probe reply or the
//        process-start-vs-install-change comparison appears in `evidence`;
//    5 — diskDshVersion reports 0.1.2-alpha.2 AND hostPort matches the provisioned port;
//   10 — the host is untouched: the provisioned pid is still alive AND a live re-probe
//        still answers the unauthenticated call (rollup R-12: the upgrade target may be
//        the currently running host — a pre-flight must not take it down);
//   cap 20 — the trap sprung: the report claims '0.1.2+' or processMatchesDisk: true
//        (it trusted the disk over the process);
//    0 — provision never ran, no parsable report, or /app/ops was tampered with
//        (tracked files under ops/ modified — checked via git; runtime state files
//        like state.json/web-host.log are untracked provision outputs and exempt).
// Valid candidate outcomes emit a score packet; verifier failures exit nonzero.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const REPORT = '/app/agent-output/H13-ghost-host-trap/preflight.json'
const STATE = '/app/ops/state.json'

function emit(score, reasons) {
  console.log(JSON.stringify({ score, max: 100, reasons }))
}

main().catch(emitError)

async function main() {
  const reasons = []
  if (!existsSync(STATE)) { emitError(new Error('provision never ran (/app/ops/state.json missing)')); return }
  // Ops integrity (the Dockerfile bakes a git baseline for exactly this): tracked
  // files under ops/ must be byte-identical — provision's runtime outputs
  // (state.json, host.pid, logs) are untracked and expected.
  try {
    const dirty = execSync('git -C /app status --porcelain -- ops', { encoding: 'utf8' })
      .split('\n').filter((l) => l.trim() !== '' && !l.startsWith('??'))
    if (dirty.length > 0) { emit(0, [`/app/ops tampered with (task forbids it): ${dirty.join(' | ').slice(0, 200)}`]); return }
  } catch (error) { emitError(error); return }
  const state = JSON.parse(readFileSync(STATE, 'utf8'))
  if (!existsSync(REPORT)) { emit(0, [`no report at ${REPORT}`]); return }
  let report
  try { report = JSON.parse(readFileSync(REPORT, 'utf8')) } catch (error) { emit(0, [`report unparsable: ${error.message}`]); return }

  let score = 0
  const gen = String(report.hostWireGeneration ?? '')
  if (gen === 'pre-0.1.2') { score += 40; reasons.push('+40 hostWireGeneration = pre-0.1.2 (matches the running process)') }
  else reasons.push(`+0 hostWireGeneration = "${gen}" (the process answers the pre-0.1.2 wire)`)

  if (report.processMatchesDisk === false) { score += 20; reasons.push('+20 processMatchesDisk = false') }
  else reasons.push('+0 processMatchesDisk is not false')

  const from = String(report.migrationFrom ?? '')
  const fromPinsOld = /pre-0\.1\.2|0\.1\.1|\brc\b|rc\.\d/i.test(from) && !/^0\.1\.2-alpha/.test(from.trim())
  if (fromPinsOld) { score += 15; reasons.push('+15 migrationFrom pins the old generation') }
  else reasons.push(`+0 migrationFrom "${from.slice(0, 80)}" does not pin the pre-0.1.2 generation`)

  const evidence = JSON.stringify(report.evidence ?? '')
  if (/agentPreset|401|\\"ok\\":true|"ok":true|lstart|ps -o|started .{0,20}(before|at)/i.test(evidence)) {
    score += 10; reasons.push('+10 probe-grade evidence (probe reply or process-start comparison)')
  } else reasons.push('+0 evidence carries no probe reply / process-start fact')

  if (/0\.1\.2-alpha\.2/.test(String(report.diskDshVersion ?? '')) && Number(report.hostPort) === Number(state.port)) {
    score += 5; reasons.push('+5 diskDshVersion = 0.1.2-alpha.2 and hostPort matches the provisioned port')
  } else reasons.push(`+0 diskDshVersion "${String(report.diskDshVersion ?? '')}" / hostPort ${String(report.hostPort ?? '?')} (provisioned ${String(state.port)})`)

  // R-12: the host must still be up, and still be the OLD process (a restarted host
  // would answer 401 here — that also counts as touched).
  let untouched = false
  try {
    process.kill(state.hostPid, 0)
    const res = await fetch(`http://127.0.0.1:${state.port}/api/agentPreset.list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'judge-reprobe', method: 'agentPreset.list', payload: {} }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = await res.json().catch(() => null)
    untouched = res.status === 200 && body?.result?.ok === true
  } catch { untouched = false }
  if (untouched) { score += 10; reasons.push('+10 host untouched (provisioned pid alive, still answers the old wire)') }
  else reasons.push('+0 host is not in its provisioned state (stopped/restarted/unreachable) — R-12: it must stay up')

  if (gen === '0.1.2+' || report.processMatchesDisk === true) {
    if (score > 20) { reasons.push(`trap sprung — the report trusts the disk over the process; capped at 20 (was ${score})`); score = 20 }
  }
  emit(score, reasons)
}
