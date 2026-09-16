// ZCode transport for the sealed report-judge protocol. Same rubric, same
// deterministic aggregation as the endpoint transport in
// benchmark/report-judge/judge.mjs — only the LLM call is replaced: the main
// agent feeds the emitted judge input to a fresh GLM-5.3-Flash subagent and
// applies its verdict here. The pre-evaluate steps mirror grade() exactly
// (fixture integrity gate, report collection, prompt-echo check).
//
// Usage:
//   node benchmark/scripts/zcode-transport-judge.mjs emit --task T --app <gradeRoot> --out <judgeInput.json>
//   node benchmark/scripts/zcode-transport-judge.mjs apply --task T --app <gradeRoot> \
//        --verdict <verdict.json> --logs <dir> --score-path <scores/xxx.json> \
//        [--cell task:arm:repeat] [--judge-model <id>]
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SYSTEM, grade, judgeInput, collectFiles, isOnlyPromptEcho, auditCitations,
  scoreDecisions, writeResult, sha256, JudgeError,
} from '../report-judge/judge.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
export const JUDGE_TRANSPORT = 'zcode-subagent-v1'

// Stages the grading root exactly like the task container: fixture copy with a
// git baseline commit (read-only discipline gate) plus the cell's report.
function stageGradeRoot(task, reportPath, out) {
  const taskDir = join(repoRoot, 'benchmark', 'tasks', task)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(join(out, 'agent-output', task), { recursive: true })
  cpSync(join(taskDir, 'environment', 'fixture'), join(out, 'fixture'), { recursive: true })
  const git = (args) => execFileSync('git', args, { cwd: out })
  git(['init', '-q'])
  git(['add', '-A'])
  git(['-c', 'user.email=bench@local', '-c', 'user.name=bench', 'commit', '-q', '-m', 'baseline'])
  if (!existsSync(reportPath)) throw new JudgeError(`cell report missing: ${reportPath}`)
  cpSync(reportPath, join(out, 'agent-output', task, 'report.md'))
  return out
}

// Mirrors the pre-evaluate section of grade() in report-judge/judge.mjs.
function precheck(packet, appRoot) {
  const fixture = collectFiles(join(appRoot, 'fixture'))
  const allowedDeletions = new Set(packet.allowedDeletions ?? [])
  const changed = Object.keys(fixture).some((p) => !Object.hasOwn(packet.fixture, p) || fixture[p].sha256 !== packet.fixture[p].sha256)
    || Object.keys(packet.fixture).some((p) => !Object.hasOwn(fixture, p) && !allowedDeletions.has(p))
  if (changed) return { status: 'invalid_submission', reason: 'fixture changed outside the sealed deletion allowance' }
  const collected = collectFiles(join(appRoot, 'agent-output', packet.task), { optional: true, maxFiles: 32 })
  const reports = Object.fromEntries(Object.entries(collected).filter(([p]) => /\.(md|txt|json|jsonl|log)$/.test(p)).map(([p, f]) => [p, f.text]))
  if (!Object.values(reports).some((text) => text.trim())) return { status: 'scored', reason: 'no report provided' }
  if (isOnlyPromptEcho(packet.instruction, reports)) return { status: 'scored', reason: 'report only repeats the task prompt' }
  return { status: 'judge', reports }
}

function loadPacket(task) {
  return JSON.parse(readFileSync(join(repoRoot, 'benchmark', 'tasks', task, 'tests', 'packet.json'), 'utf8'))
}

function emit(task, appRoot, out) {
  const packet = loadPacket(task)
  const pre = precheck(packet, appRoot)
  writeFileSync(out, JSON.stringify({
    system: SYSTEM,
    input: pre.status === 'judge' ? judgeInput(packet, pre.reports) : null,
    precheck: { status: pre.status, reason: pre.reason ?? null },
    transport: JUDGE_TRANSPORT,
  }, null, 2) + '\n')
  console.log(JSON.stringify({ status: pre.status, reason: pre.reason ?? null, out }))
  if (pre.status === 'judge') console.log(`JUDGE_INPUT_READY ${out}`)
}

async function apply({ task, appRoot, verdictPath, logs, scorePath, cell, judgeModel }) {
  const packet = loadPacket(task)
  const logsDir = resolve(logs)
  mkdirSync(logsDir, { recursive: true })
  writeResult(logsDir, { status: 'judge_error', reason: 'verification has not completed' })
  let verdict
  try {
    verdict = JSON.parse(readFileSync(verdictPath, 'utf8'))
  } catch {
    throw new JudgeError('verdict file is not JSON')
  }
  const result = await grade({
    packet,
    appRoot: resolve(appRoot),
    evaluate: async (p, reports) => ({
      ...scoreDecisions(p, reports, verdict),
      model: { requested: judgeModel, returned: judgeModel, endpoint: JUDGE_TRANSPORT, transport: JUDGE_TRANSPORT },
    }),
  })
  result.protocol = packet.protocol ?? 'report-judge-v2'
  result.packet_sha256 = sha256(JSON.stringify(packet))
  result.judge_input_sha256 = sha256(readFileSync(verdictPath.replace(/verdict\.json$/, 'judge-input.json'), 'utf8'))
  writeResult(logsDir, result)
  if (scorePath) {
    const [cellTask, cellArm, cellRepeat] = (cell ?? `${task}::`).split(':')
    const record = {
      task: cellTask || task,
      arm: cellArm || 'unknown',
      repeat: Number(cellRepeat) || 0,
      score: result.status === 'scored' ? result.score : null,
      reward: result.status === 'scored' && Number.isFinite(result.score) ? result.score / 100 : null,
      status: result.status,
      reason: result.reason ?? null,
      judgeModel: judgeModel ?? 'GLM-5.3-Flash',
      judgeTransport: JUDGE_TRANSPORT,
      gradedAt: new Date().toISOString(),
      protocol: result.protocol,
      criteria: (result.decisions ?? []).map((d) => ({ id: d.id, verdict: d.verdict, awarded: d.awarded, points: d.points })),
      caps: result.caps ?? [],
      notes: [],
    }
    mkdirSync(dirname(resolve(scorePath)), { recursive: true })
    writeFileSync(resolve(scorePath), JSON.stringify(record, null, 2) + '\n')
  }
  console.log(JSON.stringify({ status: result.status, score: result.score ?? null, reason: result.reason ?? null }))
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const args = process.argv.slice(2)
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const mode = args[0]
  if (mode === 'stage-grade') {
    const root = stageGradeRoot(opt('--task'), resolve(opt('--report')), resolve(opt('--out')))
    console.log(`GRADE_ROOT=${root}`)
  } else if (mode === 'emit') {
    emit(opt('--task'), resolve(opt('--app')), resolve(opt('--out')))
  } else if (mode === 'apply') {
    await apply({
      task: opt('--task'),
      appRoot: resolve(opt('--app')),
      verdictPath: resolve(opt('--verdict')),
      logs: resolve(opt('--logs')),
      scorePath: opt('--score-path') ? resolve(opt('--score-path')) : null,
      cell: opt('--cell'),
      judgeModel: opt('--judge-model') ?? 'GLM-5.3-Flash',
    })
  } else {
    console.error('usage: zcode-transport-judge.mjs stage-grade|emit|apply ...')
    process.exit(1)
  }
}
