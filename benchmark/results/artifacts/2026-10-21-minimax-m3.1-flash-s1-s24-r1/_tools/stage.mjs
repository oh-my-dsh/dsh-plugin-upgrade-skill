// Stage one benchmark cell: copy fixture (+ skill tree for the skill arm),
// verify the fixture seal before spawning, and record the pre-spawn state.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { S_TASKS, TASKS, SKILL_SRC, ROOT, sealDir, sealDiff } from './common.mjs'

export const ARMS = ['noskill', 'skill']

export function cellDir(task, arm) {
  return join(ROOT, arm, task)
}

export function stage(task, arm) {
  const dir = cellDir(task, arm)
  const fixtureSrc = join(TASKS, task, 'environment', 'fixture')
  if (!existsSync(fixtureSrc)) throw new Error('missing fixture ' + fixtureSrc)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'fixture'), { recursive: true })
  mkdirSync(join(dir, 'agent-output', task), { recursive: true })
  cpSync(fixtureSrc, join(dir, 'fixture'), { recursive: true })
  cpSync(join(TASKS, task, 'instruction.md'), join(dir, 'instruction.md'))
  if (arm === 'skill') {
    cpSync(SKILL_SRC, join(dir, 'skills', 'plugin-upgrade'), { recursive: true })
  }
  const seal = sealDir(join(dir, 'fixture'))
  const srcSeal = sealDir(fixtureSrc)
  const drift = sealDiff(srcSeal, seal)
  if (drift.length) throw new Error('fixture seal drift at stage time: ' + JSON.stringify(drift))
  const files = Object.keys(seal)
  if (files.length === 0) throw new Error('fixture empty after stage: ' + task)
  writeFileSync(join(dir, 'fixture-seal.pre.json'), JSON.stringify(seal, null, 2) + '\n')
  writeFileSync(join(dir, 'fixture-seal.source.json'), JSON.stringify(srcSeal, null, 2) + '\n')
  return { dir, seal, fileCount: files.length }
}

// Verify the fixture is byte-identical to the sealed source after the solver ran.
export function verifyFixture(task, arm) {
  const dir = cellDir(task, arm)
  const seal = sealDir(join(dir, 'fixture'))
  const srcSeal = sealDir(join(TASKS, task, 'environment', 'fixture'))
  const drift = sealDiff(srcSeal, seal)
  writeFileSync(join(dir, 'fixture-seal.post.json'), JSON.stringify(seal, null, 2) + '\n')
  return { drift, ok: drift.length === 0 }
}

function collectReports(dir, out) {
  let names
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names.sort()) {
    const p = join(dir, n)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) collectReports(p, out)
    else if (/\.(md|txt)$/i.test(n)) out.push(p)
  }
  return out
}

// Locate the solver's report under agent-output/ (recursive; agent-output/<task>/ first).
//
// A solver may also leave scratch notes (.md) beside the report, so rank
// candidates: a file named after the task first, then the largest, so the
// graded artifact is the substantive one rather than a stray probe.
export function findReport(task, arm) {
  const base = join(cellDir(task, arm), 'agent-output')
  const scoped = collectReports(join(base, task), [])
  const pool = scoped.length ? scoped : collectReports(base, [])
  if (!pool.length) return pool
  const scored = pool.map((p) => {
    const name = p.slice(p.replace(/\\/g, '/').lastIndexOf('/') + 1)
    let st
    try { st = statSync(p) } catch { st = { size: 0 } }
    let named = 0
    if (name.toLowerCase().includes(task.toLowerCase())) named = 2
    else if (name.toLowerCase().includes('report')) named = 1
    if (name.startsWith('_')) named = -1
    return { p, size: st.size, named }
  })
  scored.sort((a, b) => (b.named - a.named) || (b.size - a.size))
  return scored.map((s) => s.p)
}

if (process.argv[2] === 'stage') {
  const task = process.argv[3]
  const arm = process.argv[4]
  const r = stage(task, arm)
  console.log(JSON.stringify({ dir: r.dir, fileCount: r.fileCount }))
}
