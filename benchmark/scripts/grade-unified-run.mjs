// Grades all 64 cell reports of the unified GLM-5.3-Flash run with the repo's
// unified report-judge (one grader, one rubric per task, both arms identical
// treatment). Arm-blind by construction: the judge sees a single staged report
// per invocation and never the cell's arm label.
//
// Staging replicates each task's environment/Dockerfile: fixture copied to
// <stage>/fixture with a git baseline commit, the cell's report at
// <stage>/agent-output/<task-id>/report.md. Requires REPORT_JUDGE_BASE_URL,
// REPORT_JUDGE_MODEL and REPORT_JUDGE_API_KEY in the environment.
//
// Usage:
//   node benchmark/scripts/grade-unified-run.mjs                    # grade missing cells, then aggregate
//   node benchmark/scripts/grade-unified-run.mjs --cell <task> <arm> <repeat>
//   node benchmark/scripts/grade-unified-run.mjs --aggregate-only   # rebuild aggregate.json from scores/
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const RUN_DIR = `benchmark/results/artifacts/${process.env.UNIFIED_RUN_DIR ?? '2026-09-15-glm-5.3-flash-unified-s16'}`
export const GRADE_SEED = 20260915

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const runDir = join(repoRoot, RUN_DIR)

function requireJudgeEnv() {
  const required = ['REPORT_JUDGE_BASE_URL', 'REPORT_JUDGE_MODEL', 'REPORT_JUDGE_API_KEY']
  const missing = required.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`grading needs ${missing.join(', ')} exported (unified judge endpoint)`)
  }
}

function loadSchedule() {
  return JSON.parse(readFileSync(join(runDir, 'schedule.json'), 'utf8'))
}

function reportPath(runDir, task, arm, repeat) {
  return join(runDir, 'reports', `${arm}`, `r${repeat}`, task, 'report.md')
}

function scorePath(runDir, task, arm, repeat) {
  return join(runDir, 'scores', `${task}__${arm}__r${repeat}.json`)
}

function stageAndGrade(task, cellReport) {
  const taskDir = join(repoRoot, 'benchmark', 'tasks', task)
  const stage = mkdtempSync(join(tmpdir(), `unified-grade-${task}-`))
  try {
    cpSync(join(taskDir, 'environment', 'fixture'), join(stage, 'fixture'), { recursive: true })
    const git = (args) => execFileSync('git', args, { cwd: stage })
    git(['init', '-q'])
    git(['add', '-A'])
    git(['-c', 'user.email=bench@local', '-c', 'user.name=bench', 'commit', '-q', '-m', 'baseline'])
    mkdirSync(join(stage, 'agent-output', task), { recursive: true })
    cpSync(cellReport, join(stage, 'agent-output', task, 'report.md'))
    const logs = join(stage, 'verifier-logs')
    mkdirSync(logs, { recursive: true })
    execFileSync(process.execPath, [join(taskDir, 'tests', 'judge.mjs'), '--app', stage, '--logs', logs], {
      cwd: stage,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const reward = readFileSync(join(logs, 'reward.txt'), 'utf8').trim()
    const details = existsSync(join(logs, 'details.json')) ? JSON.parse(readFileSync(join(logs, 'details.json'), 'utf8')) : null
    return { reward, details }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

function gradeCell(schedule, task, arm, repeat) {
  const report = reportPath(runDir, task, arm, repeat)
  if (!existsSync(report)) throw new Error(`missing report for cell ${task}/${arm}/r${repeat}: ${report}`)
  requireJudgeEnv()
  const { reward, details } = stageAndGrade(task, report)
  const scoreOutOfHundred = Number(reward) * 100
  const record = {
    task,
    arm,
    repeat,
    score: Math.round(scoreOutOfHundred * 100) / 100,
    reward: Number(reward),
    judgeModel: process.env.REPORT_JUDGE_MODEL,
    gradedAt: new Date().toISOString(),
    protocol: details?.protocol ?? null,
    criteria: details?.criteria ?? details?.scores ?? null,
    notes: [],
  }
  mkdirSync(join(runDir, 'scores'), { recursive: true })
  writeFileSync(scorePath(runDir, task, arm, repeat), JSON.stringify(record, null, 2) + '\n')
  return record
}

// Per workplan §主要分析: average the two repeats per arm per task first, then
// pair tasks equally. Unscored/error cells are carried as null and excluded
// from means with an explicit count — never silently turned into zeros.
export function aggregate(schedule, dir = runDir) {
  const perCell = []
  for (const cell of schedule.cells) {
    const path = scorePath(dir, cell.task, cell.arm, cell.repeat)
    perCell.push(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { task: cell.task, arm: cell.arm, repeat: cell.repeat, score: null })
  }
  const byTask = new Map()
  for (const cell of perCell) {
    if (!byTask.has(cell.task)) byTask.set(cell.task, { noSkill: [], withSkill: [] })
    byTask.get(cell.task)[cell.arm === 'no-skill' ? 'noSkill' : 'withSkill'].push(cell)
  }
  const rows = []
  for (const task of [...byTask.keys()].sort()) {
    const arms = byTask.get(task)
    const meanOf = (cells) => {
      const scored = cells.filter((cell) => Number.isFinite(cell.score))
      if (scored.length === 0) return null
      return scored.reduce((acc, cell) => acc + cell.score, 0) / scored.length
    }
    const noSkill = meanOf(arms.noSkill)
    const withSkill = meanOf(arms.withSkill)
    rows.push({
      task,
      method: 'llm-rubric',
      noskill: noSkill === null ? null : Math.round(noSkill * 100) / 100,
      skill: withSkill === null ? null : Math.round(withSkill * 100) / 100,
      noskillCells: arms.noSkill.map((cell) => cell.score),
      skillCells: arms.withSkill.map((cell) => cell.score),
      unscoredCells: [...arms.noSkill, ...arms.withSkill].filter((cell) => !Number.isFinite(cell.score)).length,
      notes: [],
    })
  }
  const graded = perCell.filter((cell) => Number.isFinite(cell.score)).length
  return {
    schemaVersion: 'unified-paired-aggregate-v1',
    run: RUN_DIR,
    model: schedule.model,
    gradedCells: graded,
    totalCells: perCell.length,
    rows,
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const schedule = loadSchedule()
  const args = process.argv.slice(2)
  if (args.includes('--aggregate-only')) {
    const doc = aggregate(schedule)
    writeFileSync(join(runDir, 'aggregate.json'), JSON.stringify(doc, null, 2) + '\n')
    console.log(`aggregate rebuilt: ${doc.gradedCells}/${doc.totalCells} cells graded`)
  } else if (args.includes('--cell')) {
    const index = args.indexOf('--cell')
    const [task, arm, repeat] = args.slice(index + 1, index + 4)
    const record = gradeCell(schedule, task, arm, Number(repeat))
    console.log(`${task} ${arm} r${repeat}: ${record.score}/100`)
  } else {
    let done = 0
    for (const cell of schedule.cells) {
      if (existsSync(scorePath(runDir, cell.task, cell.arm, cell.repeat))) {
        done += 1
        continue
      }
      const record = gradeCell(schedule, cell.task, cell.arm, cell.repeat)
      console.log(`[${done + 1}/${schedule.totalCells}] ${record.task} ${record.arm} r${record.repeat}: ${record.score}/100`)
      done += 1
    }
    const doc = aggregate(schedule)
    writeFileSync(join(runDir, 'aggregate.json'), JSON.stringify(doc, null, 2) + '\n')
    console.log(`graded ${doc.gradedCells}/${doc.totalCells} cells; aggregate.json written`)
  }
}
