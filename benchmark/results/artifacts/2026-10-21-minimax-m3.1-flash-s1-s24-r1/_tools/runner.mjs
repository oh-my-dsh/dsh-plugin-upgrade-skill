// Shared helpers for running one cell end-to-end and recording it.
// The spawn itself happens in the orchestrator (run_code tool); this module
// handles staging, ledger rows, report collection and the post-run audit.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './common.mjs'
import { stage, verifyFixture, findReport, cellDir } from './stage.mjs'
import { auditCell } from './audit.mjs'

const SESSION_DIR = 'C:\\Users\\lhh\\.dsh\\sessions\\--E-deepseek-harness-test-lhh010--'
const PROJCACHE = 'C:\\Users\\lhh\\.dsh\\storages\\session_projcache\\sessions'

export { SESSION_DIR, PROJCACHE, stage, verifyFixture, findReport, cellDir }

export function tokenUsage(sessionId) {
  const pc = join(PROJCACHE, sessionId + '.json')
  if (!existsSync(pc)) return null
  try {
    const j = JSON.parse(readFileSync(pc, 'utf8'))
    const t = j.record?.rows?.tokenUsage?.val?.totals
    if (!t) return null
    return {
      uncachedInputTokens: t.uncachedInputTokens ?? 0,
      outputTokens: t.outputTokens ?? 0,
      cacheReadTokens: t.cacheReadTokens ?? 0,
      cacheWriteTokens: t.cacheWriteTokens ?? 0,
      total: (t.uncachedInputTokens ?? 0) + (t.outputTokens ?? 0) + (t.cacheReadTokens ?? 0) + (t.cacheWriteTokens ?? 0),
    }
  } catch { return null }
}

export function sessionStats(sessionId) {
  const pc = join(PROJCACHE, sessionId + '.json')
  if (!existsSync(pc)) return null
  try {
    const j = JSON.parse(readFileSync(pc, 'utf8'))
    const s = j.record?.rows?.sessionStats?.val
    return s ? { turns: s.turns, steps: s.steps, llmMs: s.llmMs, toolMs: s.toolMs } : null
  } catch { return null }
}

export function reportInfo(task, arm) {
  const hits = findReport(task, arm)
  if (!hits.length) return { found: false }
  const p = hits[0]
  const st = statSync(p)
  const text = readFileSync(p, 'utf8')
  return {
    found: true,
    path: p,
    relative: p.slice(cellDir(task, arm).length + 1).split('\\').join('/'),
    bytes: st.size,
    nonEmpty: st.size > 0,
    chars: text.length,
    lines: text.split('\\n').length,
    candidates: hits.length,
  }
}

export function runAudit(task, arm, sessionIds) {
  const dir = cellDir(task, arm)
  const dirs = sessionIds.map(id => join(SESSION_DIR, id))
  const res = auditCell({
    cellRoot: dir,
    cellDir: dir,
    sessionDirs: dirs,
    arm,
  })
  return res
}

// Upsert one ledger row per (task, arm). Re-finalizing a cell must not
// append a duplicate row, so an existing row is rewritten in place.
export function ledgerRow(row) {
  const file = join(ROOT, 'cell-ledger.md')
  const line = `| ${row.task} | ${row.arm} | ${row.status} | ${row.start} | ${row.end} | ${row.duration} | ${row.toolcalls} | ${row.tokens} |`
  let text = ''
  try { text = readFileSync(file, 'utf8') } catch { text = '' }
  const lines = text.split('\n')
  const key = (l) => {
    const cells = l.split('|').map((s) => s.trim())
    return cells[1] + '::' + cells[2]
  }
  const wanted = row.task + '::' + row.arm
  let replaced = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|') && key(lines[i]) === wanted) {
      lines[i] = line
      replaced = true
      break
    }
  }
  if (!replaced) {
    const at = lines.findIndex((l) => l.trim() === '')
    if (at === -1) lines.push(line)
    else lines.splice(at, 0, line)
  }
  writeFileSync(file, lines.join('\n'))
  return line + '\n'
}

export function writeCellMeta(task, arm, meta) {
  const dir = cellDir(task, arm)
  if (!existsSync(dir)) return
  writeFileSync(join(dir, 'cell-meta.json'), JSON.stringify(meta, null, 2) + '\n')
}
