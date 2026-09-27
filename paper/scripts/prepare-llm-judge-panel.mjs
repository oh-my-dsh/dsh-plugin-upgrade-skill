// Cross-family LLM judge panel v1: builds blinded judge items for all 64 focal
// reports. Offline, no model calls. --check is read-only and exits 1 on drift.
// Each item carries exactly the original report-judge-v2 SYSTEM prompt and
// judgeInput(); arm, repeat, original verdicts and review outcomes are never
// written into items/. The cell mapping lives only in unblinding/key.json.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { SYSTEM, judgeInput, sha256 } from '../../benchmark/report-judge/judge.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const run = 'benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16'
const out = 'paper/audit/llm-judge-panel-v1'
const SEED = 'llm-judge-panel-v1:20260924'
const BATCHES = 16
const read = (p) => fs.readFileSync(join(root, p), 'utf8')

const cells = JSON.parse(read(`${run}/schedule.json`)).cells
  .map(({ task, arm, repeat }) => ({ task, arm, repeat }))
  .sort((a, b) => a.task.localeCompare(b.task) || a.arm.localeCompare(b.arm) || a.repeat - b.repeat)
assert.equal(cells.length, 64)

const files = {}
const key = []
cells.forEach((cell, index) => {
  const id = 'J' + sha256(`${SEED}:${cell.task}:${cell.arm}:${cell.repeat}`).slice(0, 10)
  const reportPath = `${run}/reports/${cell.arm}/r${cell.repeat}/${cell.task}/report.md`
  const report = read(reportPath)
  const packetPath = `${run}/packets/${cell.task}.json` // run-time packet snapshot
  const packet = JSON.parse(read(packetPath))
  const item = { id, protocol: 'report-judge-v2', system: SYSTEM, input: judgeInput(packet, { 'report.md': report }) }
  files[`items/${id}.json`] = JSON.stringify(item, null, 2) + '\n'
  // Cells are task-sorted, so index % BATCHES spreads a task's four cells over
  // four different batches: no batch judges two answers to the same task.
  key.push({ id, ...cell, batch: index % BATCHES, report: reportPath, reportSha256: sha256(report),
    packetSha256: sha256(read(packetPath)), itemSha256: sha256(files[`items/${id}.json`]) })
})
assert.equal(new Set(key.map((k) => k.id)).size, 64)
key.sort((a, b) => a.id.localeCompare(b.id))
files['unblinding/key.json'] = JSON.stringify({ seed: SEED, run, cells: key }, null, 2) + '\n'
const batches = Array.from({ length: BATCHES }, (_, b) => key.filter((k) => k.batch === b).map((k) => k.id))
for (const ids of batches) assert.equal(new Set(ids.map((id) => key.find((k) => k.id === id).task)).size, ids.length)
files['manifest.json'] = JSON.stringify({
  protocol: 'report-judge-v2', system_sha256: sha256(SYSTEM), itemCount: key.length,
  keySha256: sha256(files['unblinding/key.json']),
  items: key.map((k) => ({ id: k.id, sha256: k.itemSha256 })), batches,
}, null, 2) + '\n'

const check = process.argv.includes('--check')
for (const [rel, text] of Object.entries(files)) {
  const path = join(root, out, rel)
  if (check) assert.equal(fs.readFileSync(path, 'utf8'), text, `drift: ${rel}`)
  else { fs.mkdirSync(join(path, '..'), { recursive: true }); fs.writeFileSync(path, text) }
}
console.log(JSON.stringify({ items: key.length, batches: batches.map((b) => b.length), check }))
