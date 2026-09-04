#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { summarize, renderJson, renderMarkdown } from './summarize-runs.mjs'

export const CONDITIONS = ['oracle', 'nop', 'no-injected-skill', 'upgrade-only', 'all-skills']
export const HARBOR_VERSION = '0.22.0'
const root = fileURLToPath(new URL('../../', import.meta.url))
export const TASKS = JSON.parse(readFileSync(new URL('../skill-evaluation/suite.json', import.meta.url), 'utf8')).tasks

export function evaluationConfig({ condition, model, attempts = 1, output, repoRoot = root }) {
  if (!CONDITIONS.includes(condition)) throw new Error(`Unknown condition: ${condition}`)
  if (![1, 3].includes(attempts)) throw new Error('attempts must be 1 (smoke) or 3 (repeated evaluation)')
  const control = ['oracle', 'nop'].includes(condition)
  if (control && attempts !== 1) throw new Error('Control runs require exactly one attempt')
  if (!control && (typeof model !== 'string' || !/^(anthropic|openai)\/[A-Za-z0-9._:-]+$/.test(model))) {
    throw new Error('Supply an explicit anthropic/<model> or openai/<model>')
  }
  for (const task of TASKS) {
    if (!/^[A-Z][A-Za-z0-9-]+$/.test(task) || !existsSync(join(repoRoot, 'benchmark/tasks', task, 'task.toml'))) {
      throw new Error(`Missing or invalid suite task: ${task}`)
    }
  }
  const skills = condition === 'all-skills'
    ? readdirSync(join(repoRoot, 'skills')).filter((name) => existsSync(join(repoRoot, 'skills', name, 'SKILL.md'))).sort().map((name) => join(repoRoot, 'skills', name))
    : condition === 'upgrade-only' ? [join(repoRoot, 'skills/plugin-upgrade')] : []
  return {
    job_name: condition,
    jobs_dir: join(resolve(output), 'jobs'),
    n_attempts: attempts,
    n_concurrent_trials: 2,
    retry: { max_retries: 0 },
    environment: { type: 'docker' },
    agents: [{ name: control ? condition : 'terminus-2', ...(control ? {} : { model_name: model }), skills }],
    tasks: TASKS.map((task) => ({ path: join(repoRoot, 'benchmark/tasks', task) })),
  }
}

export function checkRecords(records, { condition, tasks, attempts }) {
  const failures = []
  const expected = new Set(tasks)
  if (expected.size !== tasks.length || !tasks.length) throw new Error('Invalid expected task inventory')
  if (!CONDITIONS.includes(condition) || ![1, 3].includes(attempts)) throw new Error('Invalid evaluation manifest')
  for (const task of tasks) {
    const trials = records.filter((record) => record.taskId === task)
    if (trials.length !== attempts) failures.push(`${task}: expected ${attempts} trials, found ${trials.length}`)
  }
  for (const record of records) {
    if (!expected.has(record.taskId)) failures.push(`Unexpected task: ${record.taskId}`)
    if (!record.scored || record.status !== 'completed') failures.push(`${record.taskId}: ${record.status}; result is not a clean scored trial`)
    if (condition === 'oracle' && record.reward !== 1) failures.push(`${record.taskId}: reference answer reward must be 1, got ${record.reward}`)
    if (condition === 'nop' && record.reward !== 0) failures.push(`${record.taskId}: untouched fixture reward must be 0, got ${record.reward}`)
  }
  return failures
}

export function prepare(options) {
  const output = resolve(options.output)
  const config = evaluationConfig({ ...options, output })
  const manifestPath = join(output, 'manifest.json')
  if (existsSync(manifestPath) || existsSync(join(output, 'jobs'))) throw new Error('Use a fresh output directory; never mix or resume different evaluation conditions')
  mkdirSync(output, { recursive: true })
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
  const manifest = {
    schemaVersion: 1, harborVersion: HARBOR_VERSION, sourceCommit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain', '--untracked-files=normal') !== '',
    condition: options.condition, model: config.agents[0].model_name ?? null,
    attempts: config.n_attempts, tasks: TASKS,
    suppliedSkills: config.agents[0].skills.map((path) => path.slice(root.length)),
    // Supply is a configuration fact, not evidence that a Skill was opened.
    skillActivation: 'not-measured',
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(output, 'config.json'), `${JSON.stringify(config, null, 2)}\n`)
  return { config, manifest }
}

export function check(output) {
  const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'))
  const job = join(output, 'jobs', manifest.condition)
  const paths = existsSync(job) ? readdirSync(job, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(job, entry.name, 'result.json')).filter(existsSync).sort() : []
  const summary = summarize([{ label: manifest.condition, paths }])
  const failures = checkRecords(summary.groups[0].records, manifest)
  writeFileSync(join(output, 'summary.json'), `${renderJson(summary)}\n`)
  const usage = { inputTokens: 0, outputTokens: 0, cacheTokens: 0, durationSeconds: 0, missingUsageTrials: 0, missingCacheTrials: 0, missingDurationTrials: 0 }
  for (const path of paths) {
    const trial = JSON.parse(readFileSync(path, 'utf8'))
    const agent = trial.agent_result
    if (!Number.isFinite(agent?.n_input_tokens) || !Number.isFinite(agent?.n_output_tokens)) usage.missingUsageTrials++
    else {
      usage.inputTokens += agent.n_input_tokens
      usage.outputTokens += agent.n_output_tokens
    }
    if (Number.isFinite(agent?.n_cache_tokens)) usage.cacheTokens += agent.n_cache_tokens
    else usage.missingCacheTrials++
    const duration = (Date.parse(trial.finished_at) - Date.parse(trial.started_at)) / 1000
    if (Number.isFinite(duration) && duration >= 0) usage.durationSeconds += duration
    else usage.missingDurationTrials++
  }
  const evidence = { ...manifest, usage, failures, complete: failures.length === 0 }
  writeFileSync(join(output, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  const coverage = manifest.condition === 'oracle' || manifest.condition === 'nop'
    ? 'Control run only; no model was evaluated.'
    : 'Scored outcome evaluation. Skill opening, natural-language routing and absence of semantic conflicts are not established by this report.'
  const text = `${renderMarkdown(summary)}\n\n${coverage}\n\nSource: ${manifest.sourceCommit}; dirty: ${manifest.dirty}.\n\nToken/duration accounting: ${JSON.stringify(usage)}\n\n${failures.length ? failures.map((failure) => `- ${failure}`).join('\n') : 'All expected trials produced clean verifier results.'}\n`
  writeFileSync(join(output, 'summary.md'), text)
  return evidence
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [action, ...args] = process.argv.slice(2)
    const options = {}
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2)
      if (!['output', 'condition', 'model', 'attempts'].includes(key) || !args[i].startsWith('--') || args[i + 1] === undefined) throw new Error('Invalid arguments')
      options[key] = key === 'attempts' ? Number(args[i + 1]) : args[i + 1]
    }
    if (!options.output) throw new Error('--output is required')
    if (action === 'prepare') {
      prepare(options)
      console.log(`Prepared ${options.condition}: ${resolve(options.output)}`)
    } else if (action === 'check') {
      const result = check(resolve(options.output))
      for (const failure of result.failures) console.error(failure)
      if (!result.complete) process.exitCode = 1
    } else throw new Error('Use prepare or check')
  } catch (error) {
    console.error(`[skill-evaluation] ${error.message}`)
    process.exitCode = 1
  }
}
