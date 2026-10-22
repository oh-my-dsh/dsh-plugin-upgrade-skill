// Lightweight progress monitor for the sweep.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './common.mjs'

const SESS = 'C:\\Users\\lhh\\.dsh\\sessions\\--E-deepseek-harness-test-lhh010--'

export function cellProgress(task, arm) {
  const dir = join(ROOT, arm, task)
  const out = join(dir, 'agent-output')
  const reports = []
  const walk = (d) => {
    let names
    try { names = readdirSync(d) } catch { return }
    for (const n of names) {
      const p = join(d, n)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) walk(p)
      else if (/\.(md|txt)$/i.test(n)) reports.push({ p, bytes: st.size })
    }
  }
  if (existsSync(out)) walk(out)

  let logBytes = 0
  const idFile = join(dir, 'subagent-id.txt')
  let sid = null
  if (existsSync(idFile)) {
    sid = readFileSync(idFile, 'utf8').trim()
    const sdir = join(SESS, sid)
    if (existsSync(sdir)) {
      for (const n of readdirSync(sdir)) {
        if (n.endsWith('.jsonl.zstd')) logBytes = statSync(join(sdir, n)).size
      }
    }
  }
  const metaFile = join(dir, 'cell-meta.json')
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : null
  return { task, arm, dir, sid, logBytes, reports, meta }
}
