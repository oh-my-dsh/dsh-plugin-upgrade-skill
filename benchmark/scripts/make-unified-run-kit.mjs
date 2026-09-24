// Derives a unified two-arm run kit for another model configuration from a
// completed kit's frozen selection/schedule. The workplan §5 requires the
// SAME task pool and interleaving across configurations, so selection.json,
// schedule.json and execution-order.json are copied byte-identical from the
// source kit; only the model identity and harbor configs are regenerated.
//
// Usage:
//   node benchmark/scripts/make-unified-run-kit.mjs --model GLM-5.2 \
//     --run 2026-09-16-glm-5.2-unified-s16 \
//     --source 2026-09-15-glm-5.3-flash-unified-s16
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { harborJobConfig } from './generate-unified-run-schedule.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const ARTIFACTS = join(repoRoot, 'benchmark/results/artifacts')

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const model = arg('--model')
const run = arg('--run')
const source = arg('--source')
if (!model || !run || !source) {
  console.error('usage: make-unified-run-kit.mjs --model <id> --run <slug> --source <source-slug>')
  process.exit(1)
}

const srcDir = join(ARTIFACTS, source)
const dstDir = join(ARTIFACTS, run)
if (!existsSync(join(srcDir, 'selection.json'))) throw new Error(`source kit missing selection.json: ${srcDir}`)
mkdirSync(join(dstDir, 'harbor'), { recursive: true })

for (const name of ['selection.json', 'schedule.json', 'execution-order.json']) {
  cpSync(join(srcDir, name), join(dstDir, name))
}
const schedule = JSON.parse(readFileSync(join(dstDir, 'schedule.json'), 'utf8'))
schedule.model = model
writeFileSync(join(dstDir, 'schedule.json'), JSON.stringify(schedule, null, 2) + '\n')

for (const jobId of schedule.jobOrder) {
  const config = harborJobConfig(schedule, jobId, { model })
  writeFileSync(join(dstDir, 'harbor', `${jobId}.config.json`), JSON.stringify(config, null, 2) + '\n')
}

const provenance = `# PROVENANCE — unified ${model} two-arm run (16 tasks × 2 arms × 2 repeats)

Status: **kit frozen, solver runs not started.** Derived from the completed
[${source} kit](../${source}/PROVENANCE.md): the 16-task selection, interleaving
schedule and execution order are byte-identical (workplan §5 requires the same
task pool across configurations); only the solver model differs.

- Source kit commit: see [${source}/PROVENANCE.md](../${source}/PROVENANCE.md)
- Solver model: **${model}** — endpoint/credential NOT available on the kit
  author's machine; the operator launching trials must record the served-model
  identity per workplan §5 before running
- Judge: same sealed report-judge-v2 pipeline as the ${source} run
  (GLM-5.3-Flash subagent judge, arm-blind) for cross-config judge consistency
- Trials: 64 = 16 tasks × 2 arms × 2 reps, ABBA job interleave (see schedule.json)

## To be recorded at run time

| Field | Value |
|---|---|
| Solver endpoint / provider | _(fill at launch)_ |
| Server-side model identifier | _(fill at launch — workplan: cannot trust alias alone)_ |
| Weights revision / quantization | _(fill at launch)_ |
| Per-cell tokens, wall time, stop reason | _(fill after run)_ |

## Execution

Follow [the unified run book](../../../docs/unified-glm53flash-run.zh.md) with
this directory in place of the flash run dir. Reports go to
reports/<arm>/r<repeat>/<task>/report.md, then:

    node benchmark/scripts/collect-unified-run-cells.mjs   # adapt RUN_DIR constants per run
    node benchmark/scripts/analyze-unified-paired.mjs      # adapt RUN_DIR constants per run
`
writeFileSync(join(dstDir, 'PROVENANCE.md'), provenance)
console.log(`kit written: benchmark/results/artifacts/${run}`)
console.log(`model: ${model}; pool/schedule copied byte-identical from ${source}`)
console.log(`jobs: ${schedule.jobOrder.join(' → ')}`)
