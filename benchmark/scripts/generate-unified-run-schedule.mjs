// Generates the 64-cell execution schedule and Harbor job configs for the
// unified GLM-5.3-Flash two-arm run (paper/INVERTED-U-WORKPLAN.zh.md §5).
//
// Design: the 16 selected tasks (selection.json) are split into two halves by
// the seeded PRNG. Each half runs in two repeat rounds. Arms alternate at job
// granularity, and the arm order reverses in round 2 (ABBA-style), so no arm
// is systematically first. Within a job the task order is also seeded-shuffled.
// All outputs are deterministic for a given seed; `--check` verifies drift.
//
// Usage:
//   node benchmark/scripts/generate-unified-run-schedule.mjs            # write schedule + configs
//   node benchmark/scripts/generate-unified-run-schedule.mjs --local    # also write config.local.json with env credentials
//   node benchmark/scripts/generate-unified-run-schedule.mjs --check    # verify committed outputs match
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mulberry32 } from './measure-paired-effect.mjs'

export const SCHEDULE_SEED = 20260915
export const SCHEDULE_SCHEMA = 'unified-run-schedule-v1'
export const RUN_DIR = `benchmark/results/artifacts/${process.env.UNIFIED_RUN_DIR ?? '2026-09-15-glm-5.3-flash-unified-s16'}`
export const MODEL_ID = process.env.UNIFIED_MODEL ?? 'glm-5.3-flash'
export const ARMS = ['no-skill', 'with-skill']
export const REPEATS = 2
export const N_CONCURRENT = 3
const PLACEHOLDER = 'REDACTED-set-via-config-local-or-env'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const ZERO_SKILL_INSTRUCTION = [
  'This is a literal zero-skill evaluation. Do not search for, open, read, quote, or follow any SKILL.md',
  'file, skill catalog entry, or skill-related documentation anywhere in the workspace or host.',
  'Complete the task using only the task prompt and the fixture provided under /app/fixture.',
].join(' ')

export function buildSchedule(seed = SCHEDULE_SEED) {
  const selectionDoc = JSON.parse(readFileSync(join(repoRoot, RUN_DIR, 'selection.json'), 'utf8'))
  const tasks = selectionDoc.selected.map((entry) => entry.task)
  if (tasks.length !== 16) throw new Error(`expected 16 selected tasks, found ${tasks.length}`)
  const rand = mulberry32(seed)

  const shuffled = [...tasks]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const halfA = shuffled.slice(0, 8).sort()
  const halfB = shuffled.slice(8).sort()

  const jobs = []
  const jobSpec = (id, halfLabel, arm, round) => ({ id, half: halfLabel, arm, round, tasks: [...(halfLabel === 'A' ? halfA : halfB)] })
  // Round 1: no-skill → with-skill, half A then half B. Round 2 reverses both
  // the half order and the arm order so neither arm nor half leads consistently.
  jobs.push(jobSpec('r1-noskill-a', 'A', 'no-skill', 1))
  jobs.push(jobSpec('r1-withskill-a', 'A', 'with-skill', 1))
  jobs.push(jobSpec('r1-noskill-b', 'B', 'no-skill', 1))
  jobs.push(jobSpec('r1-withskill-b', 'B', 'with-skill', 1))
  jobs.push(jobSpec('r2-withskill-b', 'B', 'with-skill', 2))
  jobs.push(jobSpec('r2-noskill-b', 'B', 'no-skill', 2))
  jobs.push(jobSpec('r2-withskill-a', 'A', 'with-skill', 2))
  jobs.push(jobSpec('r2-noskill-a', 'A', 'no-skill', 2))
  for (const job of jobs) {
    const taskRand = mulberry32(seed ^ Number([...job.id].reduce((acc, ch) => acc * 31 + ch.codePointAt(0), 7)))
    for (let i = job.tasks.length - 1; i > 0; i--) {
      const j = Math.floor(taskRand() * (i + 1))
      ;[job.tasks[i], job.tasks[j]] = [job.tasks[j], job.tasks[i]]
    }
  }

  const cells = []
  for (const job of jobs) {
    for (const task of job.tasks) {
      cells.push({ task, arm: job.arm, repeat: job.round, job: job.id })
    }
  }
  return {
    schemaVersion: SCHEDULE_SCHEMA,
    seed,
    model: MODEL_ID,
    arms: ARMS,
    repeats: REPEATS,
    totalTrials: cells.length,
    halves: { A: halfA, B: halfB },
    jobOrder: jobs.map((job) => job.id),
    jobs,
    cells,
    armLedger: {
      noSkill: cells.filter((cell) => cell.arm === 'no-skill').length,
      withSkill: cells.filter((cell) => cell.arm === 'with-skill').length,
    },
    budgetPolicy: {
      taskTomlTimeoutSec: 'frozen at pinned commit; pilot must confirm before formal runs',
      pilot: 'run jobs r1-noskill-a and r1-withskill-a first as the pilot; if any trial hits the timeout ceiling, stop, pre-register a raised timeout as a committed task.toml change applied to both arms, then restart the formal run',
    },
  }
}

export function harborJobConfig(schedule, jobId, { model = MODEL_ID, env = {}, localPaths = false } = {}) {
  const job = schedule.jobs.find((entry) => entry.id === jobId)
  if (!job) throw new Error(`unknown job ${jobId}`)
  const skillMount = job.arm === 'with-skill' ? [localPaths ? resolve(repoRoot, 'skills/plugin-upgrade') : '<repo-root>/skills/plugin-upgrade'] : []
  const extra = job.arm === 'no-skill' ? [ZERO_SKILL_INSTRUCTION] : []
  const slug = model.toLowerCase().replace(/[^a-z0-9]/g, '')
  return {
    job_name: `${slug}-unified-${jobId}`,
    jobs_dir: '<local-run>/jobs',
    n_concurrent_trials: N_CONCURRENT,
    n_attempts: 1,
    environment: { type: 'docker', force_build: true },
    agents: [
      {
        name: 'terminus-2',
        model_name: `anthropic/${model}`,
        n_concurrent: N_CONCURRENT,
        skills: skillMount,
        env: {
          ANTHROPIC_BASE_URL: env.ANTHROPIC_BASE_URL ?? PLACEHOLDER,
          ANTHROPIC_AUTH_TOKEN: env.ANTHROPIC_AUTH_TOKEN ?? PLACEHOLDER,
          ANTHROPIC_MODEL: model,
          ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY ?? PLACEHOLDER,
          ANTHROPIC_SMALL_FAST_MODEL: model,
          DISABLE_PROMPT_CACHING: '1',
        },
      },
    ],
    skills: [],
    extra_instructions: extra,
  }
}

function renderJson(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

// Subagent-runner execution order: deterministic interleave of the committed
// job orders so every batch of four carries two no-skill and two with-skill
// cells across four different tasks (arm balance per batch, repeats separated
// by round). Harbor's job-level ABBA design maps onto batch-level balance here.
export function executionOrder(schedule) {
  const byJob = Object.fromEntries(schedule.jobs.map((job) => [job.id, job.tasks]))
  const order = []
  for (const round of [1, 2]) {
    const roundJobs = schedule.jobs.filter((job) => job.round === round)
    const nsA = byJob[`r${round}-noskill-a`]
    const wsA = byJob[`r${round}-withskill-a`]
    const nsB = byJob[`r${round}-noskill-b`]
    const wsB = byJob[`r${round}-withskill-b`]
    for (let i = 0; i < 8; i++) {
      for (const job of roundJobs) {
        const arm = job.arm
        const half = job.half
        const task = (half === 'A' ? (arm === 'no-skill' ? nsA : wsA) : (arm === 'no-skill' ? nsB : wsB))[i]
        order.push({ task, arm, repeat: round, job: job.id })
      }
    }
  }
  return order
}

function writeOutputs({ local = false } = {}) {
  const schedule = buildSchedule()
  const dir = join(repoRoot, RUN_DIR)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(dir, 'harbor'), { recursive: true })
  writeFileSync(join(dir, 'schedule.json'), renderJson(schedule))
  for (const jobId of schedule.jobOrder) {
    writeFileSync(join(dir, 'harbor', `${jobId}.config.json`), renderJson(harborJobConfig(schedule, jobId)))
  }
  if (local) {
    const env = {
      ANTHROPIC_BASE_URL: process.env.ZAI_ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.z.ai/api/anthropic',
      ANTHROPIC_AUTH_TOKEN: process.env.ZAI_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY,
      ANTHROPIC_API_KEY: process.env.ZAI_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    }
    if (!env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_API_KEY) {
      throw new Error('no solver credential found; export ZAI_API_KEY (or ANTHROPIC_AUTH_TOKEN) before --local')
    }
    for (const jobId of schedule.jobOrder) {
      writeFileSync(join(dir, 'harbor', `${jobId}.config.local.json`), renderJson(harborJobConfig(schedule, jobId, { env, localPaths: true })))
    }
    console.log('wrote config.local.json files (gitignored) with credentials from environment')
  }
  return schedule
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const check = process.argv.includes('--check')
  const local = process.argv.includes('--local')
  if (check) {
    const schedule = buildSchedule()
    const committed = JSON.parse(readFileSync(join(repoRoot, RUN_DIR, 'schedule.json'), 'utf8'))
    if (renderJson(committed) !== renderJson(schedule)) {
      console.error('schedule drift: regenerated schedule.json differs from committed file')
      process.exit(1)
    }
    for (const jobId of schedule.jobOrder) {
      const path = join(repoRoot, RUN_DIR, 'harbor', `${jobId}.config.json`)
      if (!existsSync(path) || renderJson(JSON.parse(readFileSync(path, 'utf8'))) !== renderJson(harborJobConfig(schedule, jobId))) {
        console.error(`config drift: ${jobId}.config.json`)
        process.exit(1)
      }
    }
    console.log(`schedule deterministic: ${schedule.totalTrials} cells in ${schedule.jobOrder.length} jobs`)
  } else {
    const schedule = writeOutputs({ local })
    const order = executionOrder(schedule)
    const dir = join(repoRoot, RUN_DIR)
    writeFileSync(join(dir, 'execution-order.json'), renderJson({ schemaVersion: 'unified-execution-order-v1', seed: SCHEDULE_SEED, batchSize: 4, cells: order }))
    console.log(`wrote ${RUN_DIR}/schedule.json, execution-order.json and ${schedule.jobOrder.length} harbor configs`)
    console.log(`arm ledger: ${JSON.stringify(schedule.armLedger)}`)
    console.log(`job order: ${schedule.jobOrder.join(' → ')}`)
    const batchSummary = []
    for (let i = 0; i < order.length; i += 4) {
      const batch = order.slice(i, i + 4)
      batchSummary.push(`${i / 4 + 1}: ${batch.map((c) => `${c.arm === 'no-skill' ? 'NS' : 'WS'}/${c.task.replace(/-.*/, '')}`).join(' ')}`)
    }
    console.log(batchSummary.slice(0, 4).join('\n'))
  }
}
