// Collects finished unified-run cells from the trials tree into the repo
// artifact layout: scores/<task>__<arm>__r<repeat>.json and
// reports/<arm>/r<repeat>/<task>/report.md. Idempotent; prints a coverage table.
//
// Committed report copies get one disclosed transformation: workspace-relative
// skill links (../../skills/plugin-upgrade/...) are re-pointed at the repo's
// byte-identical, hash-pinned skill tree so repository link validation passes.
// The pristine originals stay under trials/ (uncommitted).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const RUN_DIR = join(repoRoot, 'benchmark/results/artifacts', process.env.UNIFIED_RUN_DIR ?? '2026-09-15-glm-5.3-flash-unified-s16')
const TRIALS = process.env.UNIFIED_TRIALS_DIR
  ? resolve(process.env.UNIFIED_TRIALS_DIR)
  : join(RUN_DIR, 'trials')

function findReport(dir) {
  const agentOutput = join(dir, 'agent-output')
  if (!existsSync(agentOutput)) return null
  const walk = (base, prefix = '') => {
    for (const name of readdirSync(base).sort()) {
      const path = join(base, name)
      if (statSync(path).isDirectory()) {
        const hit = walk(path, `${prefix}${name}/`)
        if (hit) return hit
      } else if (/\.(md|txt)$/.test(name) && name !== 'instruction.md') {
        return join(agentOutput, `${prefix}${name}`)
      }
    }
    return null
  }
  return walk(agentOutput)
}

export function rewriteSkillLinks(text, reportDest) {
  const target = relative(dirname(reportDest), join(repoRoot, 'skills/plugin-upgrade')).split('\\').join('/')
  return text.replace(/\]\((?:\.\.\/)+skills\/plugin-upgrade\//g, `](${target}/`)
}

export function correctLegacyJudgeModel(record, runName) {
  if (runName !== '2026-09-15-glm-5.3-flash-unified-s16'
      || record.judgeTransport !== 'zcode-subagent-v1' || record.judgeModel !== 'apply') return record
  return { ...record, judgeModel: 'GLM-5.3-Flash',
    judgeModelNote: "restored from run PROVENANCE: this historical driver wrote argv[0] ('apply'); GLM-5.3-Flash is the declared transport identity, not an independently verified served-model identity" }
}

function collectArm(arm) {
  const armDir = join(TRIALS, arm)
  if (!existsSync(armDir)) return
  for (const repeat of readdirSync(armDir).sort()) {
    if (!/^r\d$/.test(repeat)) continue
    for (const task of readdirSync(join(armDir, repeat)).sort()) {
      const cell = join(armDir, repeat, task)
      const record = join(cell, 'score-record.json')
      if (existsSync(record)) {
        mkdirSync(join(RUN_DIR, 'scores'), { recursive: true })
        // The driver's flag parser recorded 'apply' (argv[0]) as judgeModel; the
        // transport identity is documented and restored here (see PROVENANCE).
        const scored = correctLegacyJudgeModel(JSON.parse(readFileSync(record, 'utf8')), RUN_DIR.split('/').at(-1))
        writeFileSync(join(RUN_DIR, 'scores', `${task}__${arm}__${repeat}.json`), JSON.stringify(scored, null, 2) + '\n')
      }
      const judgeDir = join(RUN_DIR, 'judge', arm, repeat, task)
      for (const [srcName, dstName] of [['verdict.json', 'verdict.json'], [join('grade-logs', 'details.json'), 'details.json']]) {
        const src = join(cell, srcName)
        if (existsSync(src) && !existsSync(join(judgeDir, dstName))) {
          mkdirSync(judgeDir, { recursive: true })
          cpSync(src, join(judgeDir, dstName))
        }
      }
      const dest = join(RUN_DIR, 'reports', arm, repeat, task, 'report.md')
      if (existsSync(dest)) continue
      const report = findReport(join(cell, 'workspace')) ?? findReport(cell)
      if (report) {
        mkdirSync(join(dest, '..'), { recursive: true })
        writeFileSync(dest, rewriteSkillLinks(readFileSync(report, 'utf8'), dest))
      }
    }
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
collectArm('no-skill')
collectArm('with-skill')

const schedule = JSON.parse(readFileSync(join(RUN_DIR, 'schedule.json'), 'utf8'))
let graded = 0
const missing = []
for (const cell of schedule.cells) {
  const scorePath = join(RUN_DIR, 'scores', `${cell.task}__${cell.arm}__r${cell.repeat}.json`)
  if (existsSync(scorePath)) graded += 1
  else missing.push(`${cell.task} ${cell.arm} r${cell.repeat}`)
}
console.log(`collected: ${graded}/${schedule.cells.length} cells scored`)
if (missing.length) console.log(`missing:\n${missing.join('\n')}`)
}
