// Export a checkpoint-graded judge result (benchmark/tasks/<id>/…/grading.json, the
// structured ledger emitted by the M5/H8-style judges) into a DeepSWE-shaped report
// so results from the two benchmarks can be compared side by side.
//
// Mapping (documented in benchmark/docs/checkpoint-grading.md):
//   - f2p bucket  = checkpoints of type fail-to-pass / pass / report (must pass);
//   - p2p bucket  = checkpoints of type pass-to-pass (must keep passing);
//   - "reward"    = DeepSWE's binary reward (1 iff every f2p passed and no p2p failed);
//   - "score"     = this benchmark's graded 0-100 score, kept alongside as score/100;
//   - ctrf        = one test row per checkpoint, named "[f2p] <id>" / "[p2p] <id>".
// DeepSWE's "apply_failed" field has no equivalent here (our judges have environment
// gates instead) and is intentionally not invented.
//
// Usage: node benchmark/scripts/export-deepswe-report.mjs <grading.json> [--task <id>] [--out <file>]
// With no --out, the report is written to stdout.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function toDeepsweReport(result, taskId) {
  const checkpoints = Array.isArray(result.checkpoints) ? result.checkpoints : []
  const f2p = checkpoints.filter((cp) => cp.type === 'fail-to-pass' || cp.type === 'pass' || cp.type === 'report')
  const p2p = checkpoints.filter((cp) => cp.type === 'pass-to-pass')
  const passed = (cp) => (cp.awarded ?? 0) > 0
  const f2pPassed = f2p.filter(passed).length
  const p2pPassed = p2p.filter(passed).length
  const p2pFailed = p2p.length - p2pPassed
  const total = f2p.length + p2p.length

  const binaryReward = total > 0 && f2pPassed === f2p.length && p2pFailed === 0 ? 1 : 0
  const ratio = (n, d, emptyValue) => (d > 0 ? n / d : emptyValue)
  const score = Math.max(0, Math.min(100, result.score ?? 0)) / 100

  // DeepSWE's grader emits p2p rows first, then f2p — mirrored for diff-friendliness.
  const tests = [
    ...p2p.map((cp) => ({ name: `[p2p] ${cp.id}`, status: passed(cp) ? 'passed' : 'failed' })),
    ...f2p.map((cp) => ({ name: `[f2p] ${cp.id}`, status: passed(cp) ? 'passed' : 'failed' })),
  ]
  const summary = {
    tests: total,
    passed: f2pPassed + p2pPassed,
    failed: total - f2pPassed - p2pPassed,
    skipped: 0,
    pending: 0,
    other: 0,
  }

  return {
    task: taskId,
    reward: binaryReward,
    score,
    f2p_total: f2p.length,
    f2p_passed: f2pPassed,
    f2p: ratio(f2pPassed, f2p.length, 0),
    p2p_total: p2p.length,
    p2p_passed: p2pPassed,
    p2p: ratio(p2pPassed, p2p.length, 1),
    partial: total > 0 ? (f2pPassed + p2pPassed) / total : 0,
    ctrf: {
      reportFormat: 'CTRF',
      specVersion: '1.0.0',
      results: {
        tool: { name: taskId },
        summary,
        tests,
      },
    },
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const args = process.argv.slice(2)
  const input = args.find((arg) => !arg.startsWith('--') && arg !== '--')
  const taskIdx = args.indexOf('--task')
  const outIdx = args.indexOf('--out')
  if (input === undefined) {
    console.error('usage: node export-deepswe-report.mjs <grading.json> [--task <id>] [--out <file>]')
    process.exit(2)
  }
  const taskId = taskIdx >= 0 ? args[taskIdx + 1] : 'unknown'
  const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined
  let result
  try {
    result = JSON.parse(readFileSync(resolve(input), 'utf8'))
  } catch (error) {
    console.error(`cannot read grading JSON: ${error.message}`)
    process.exit(2)
  }
  const report = toDeepsweReport(result, taskId)
  const text = JSON.stringify(report, null, 2) + '\n'
  if (outPath !== undefined) {
    writeFileSync(resolve(outPath), text)
  } else {
    process.stdout.write(text)
  }
}
