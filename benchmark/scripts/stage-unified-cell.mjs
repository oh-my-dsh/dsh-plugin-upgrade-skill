// Stages a clean solver workspace for one unified-run cell and prints the
// solver prompt. Both arms get byte-identical prompts and the same layout
// (instruction.md + fixture/ + agent-output/); the with-skill arm additionally
// carries the plugin-upgrade skill as a workspace directory
// (skills/plugin-upgrade/), discoverable like any mounted directory skill.
//
// Usage:
//   node benchmark/scripts/stage-unified-cell.mjs --task S10-... --arm with-skill --repeat 1
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const TRIALS_ROOT = resolve(repoRoot, 'benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/trials')
const SELECTION = 'benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/selection.json'

export function stageCell({ task, arm, repeat, pilot = false }) {
  if (!['no-skill', 'with-skill'].includes(arm)) throw new Error(`unknown arm ${arm}`)
  const selection = JSON.parse(readFileSync(join(repoRoot, SELECTION), 'utf8'))
  const selected = selection.selected.some((entry) => entry.task === task)
  if (!pilot && !selected) throw new Error(`task ${task} is not part of the frozen selection`)
  if (pilot && selected) throw new Error(`pilot cells must use tasks outside the formal selection`)
  const taskDir = join(repoRoot, 'benchmark', 'tasks', task)
  const workspace = join(cellDir(task, arm, repeat, pilot), 'workspace')
  rmSync(workspace, { recursive: true, force: true })
  mkdirSync(join(workspace, 'agent-output', task), { recursive: true })
  cpSync(join(taskDir, 'instruction.md'), join(workspace, 'instruction.md'))
  cpSync(join(taskDir, 'environment', 'fixture'), join(workspace, 'fixture'), { recursive: true })
  if (arm === 'with-skill') {
    cpSync(join(repoRoot, 'skills/plugin-upgrade'), join(workspace, 'skills/plugin-upgrade'), { recursive: true })
  }
  return workspace
}

export function cellDir(task, arm, repeat, pilot = false) {
  const root = pilot ? join(TRIALS_ROOT, 'pilot') : TRIALS_ROOT
  return join(root, `${arm}`, `r${repeat}`, task)
}

export function solverPrompt(workspace, task) {
  return [
    `You are the engineer assigned to an unattended plugin-migration diagnosis task.`,
    ``,
    `Your workspace directory is:`,
    `${workspace}`,
    ``,
    `The workspace stands in for the container path /app: the task's read-only evidence pack /app/fixture is the subdirectory fixture/ inside the workspace, and your report directory /app/agent-output is the subdirectory agent-output/ inside the workspace.`,
    ``,
    `Read instruction.md in the workspace and complete the task it describes, working strictly inside the workspace directory. Do not read, write, search, or execute anything outside the workspace directory. If you consult reference documents that exist inside the workspace, rely on them over your own prior assumptions.`,
    ``,
    `Write your final report exactly where instruction.md specifies (under agent-output/${task}/ in the workspace). When you have written the report, reply with exactly: DONE`,
  ].join('\n')
}

function workspaceManifest(workspace) {
  const manifest = {}
  const walk = (dir, prefix = '') => {
    for (const name of readdirSorted(dir)) {
      const path = join(dir, name)
      const rel = prefix + name
      if (statIsDir(path)) {
        walk(path, `${rel}/`)
        continue
      }
      manifest[rel] = createHash('sha256').update(readFileSync(path)).digest('hex')
    }
  }
  walk(workspace)
  return manifest
}

const readdirSorted = (dir) => readdirSync(dir).sort()
const statIsDir = (path) => statSync(path).isDirectory()

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const args = process.argv.slice(2)
  const opt = (name) => args[args.indexOf(name) + 1]
  const task = opt('--task')
  const arm = opt('--arm')
  const repeat = Number(opt('--repeat'))
  const pilot = args.includes('--pilot')
  const workspace = stageCell({ task, arm, repeat, pilot })
  const manifestPath = join(cellDir(task, arm, repeat, pilot), 'workspace-manifest.json')
  writeFileSync(manifestPath, JSON.stringify({ task, arm, repeat, stagedAt: new Date().toISOString(), files: workspaceManifest(workspace) }, null, 2) + '\n')
  console.log(`WORKSPACE=${workspace}`)
  console.log(`PROMPT_START`)
  console.log(solverPrompt(workspace, task))
  console.log(`PROMPT_END`)
}
