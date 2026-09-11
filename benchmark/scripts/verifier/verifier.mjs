// Standalone Harbor verifier. Keep task copies in sync with sync-verifiers.mjs.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'

const logs = process.env.VERIFIER_LOG_DIR || '/logs/verifier'
mkdirSync(logs, { recursive: true })
const artifact = name => join(logs, name)
for (const name of ['reward.txt', 'reward.json', 'grading.json', 'verifier-error.json']) rmSync(artifact(name), { force: true })
function fail(code, message, details = {}) {
  writeFileSync(artifact('verifier-error.json'), JSON.stringify({ status: 'verifier_error', code, message, ...details }, null, 2) + '\n')
  console.error(`verifier error (${code}): ${message}`)
  process.exitCode = 1
}

try {
  // File descriptors avoid truncating noisy judge output at spawnSync's maxBuffer.
  const stdout = openSync(artifact('judge.out'), 'w')
  const stderr = openSync(artifact('judge.stderr'), 'w')
  let child
  try { child = spawnSync(process.execPath, [process.argv[2]], { stdio: ['ignore', stdout, stderr] }) }
  finally { closeSync(stdout); closeSync(stderr) }
  const output = readFileSync(artifact('judge.out'), 'utf8')
  process.stdout.write(output)
  process.stderr.write(readFileSync(artifact('judge.stderr'), 'utf8'))
  if (child.error || child.status !== 0) {
    fail('judge_process_failed', child.error?.message || `Judge exited with ${child.signal || child.status}`, { exitCode: child.status, signal: child.signal })
  } else {
    // Only the final nonempty stdout line is the packet. Never fall back to an
    // earlier valid score if a later packet or unexpected stdout is malformed.
    const line = output.trim().split('\n').at(-1)
    let packet
    try { packet = JSON.parse(line) } catch { throw new Error('Final stdout line is not a valid JSON grading packet') }
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('Grading packet must be an object')
    if (packet.status === 'verifier_error' || packet.status === 'error' || packet.error != null) throw new Error(`Judge reported a verifier error: ${packet.error?.message || packet.error || packet.status}`)
    if (packet.status !== undefined && packet.status !== 'ok') throw new Error('Unknown grading packet status')
    if (!Number.isFinite(packet.score) || !Number.isFinite(packet.max) || packet.max <= 0 || packet.score < 0 || packet.score > packet.max) throw new Error('Score and max must be finite numbers with 0 <= score <= max and max > 0')
    if (packet.reasons !== undefined && (!Array.isArray(packet.reasons) || packet.reasons.some(reason => typeof reason !== 'string'))) throw new Error('Grading reasons must be an array of strings')
    if (packet.score === 0 && packet.reasons?.some(reason => /^judge error(?:\s*:|\s*$)/i.test(reason.trim()))) throw new Error('Legacy judge error packet cannot be graded')
    const reward = packet.score / packet.max
    writeFileSync(artifact('grading.json'), JSON.stringify(packet, null, 2) + '\n')
    writeFileSync(artifact('reward.json'), JSON.stringify({ reward }) + '\n')
    writeFileSync(artifact('reward.txt'), String(reward) + '\n')
    console.log(`reward: ${reward}`)
  }
} catch (error) {
  for (const name of ['reward.txt', 'reward.json', 'grading.json']) rmSync(artifact(name), { force: true })
  fail('invalid_grading_packet', error instanceof Error ? error.message : String(error))
}
