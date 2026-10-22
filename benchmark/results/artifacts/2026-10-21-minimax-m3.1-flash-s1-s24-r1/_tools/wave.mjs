// Wave runner: launch a wave of cells concurrently, then finalize each.
//
// Each cell: stage -> build prompt -> spawn a fresh solver subagent.
// The solver reports back when it is done; the orchestrator then finalizes it.
//
// Timeout enforcement: the orchestrator interrupts a cell that exceeds the cap.
// The cap is measured from the solver session's "session" event createdAt.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './common.mjs'
import { cellDir } from './stage.mjs'
import { stage } from './stage.mjs'
import { buildPrompt } from './prompt.mjs'
import { finalizeCell, appendLedger } from './finalize.mjs'
import { loadState, saveState, setCell, cellKey } from './state.mjs'
import { resolveWindow } from './session-window.mjs'

const SESSION_DIR = 'C:\\Users\\lhh\\.dsh\\sessions\\--E-deepseek-harness-test-lhh010--'
const PROJCACHE = 'C:\\Users\\lhh\\.dsh\\storages\\session_projcache\\sessions'

export { SESSION_DIR, PROJCACHE }

// Stage a cell and build its prompt. Returns the spawn parameters.
export function prepare(task, arm) {
  const st = stage(task, arm)
  const prompt = buildPrompt(task, arm)
  writeFileSync(join(st.dir, 'solver-prompt.txt'), prompt)
  return { dir: st.dir, prompt, fileCount: st.fileCount }
}

// Record the spawn in run-state.json so an interrupted orchestrator can resume.
export function markSpawned(task, arm, subagentId) {
  const state = loadState()
  setCell(state, task, arm, { status: 'running', subagentId, sessionIds: [subagentId], spawnedAt: new Date().toISOString() })
  return state
}

// Finalize a cell and update the ledger + state.
//
// The window is resolved from the session log rather than taken from the caller,
// because the log's turn/end event can lag the solver's own completion message.
export async function finish({ task, arm, sessionIds, startedAt, endedAt, subagentId, error, stopReason }) {
  const dir = cellDir(task, arm)
  let win = { startedAt, endedAt, durationSec: null, complete: false }
  if (subagentId) {
    win = await resolveWindow(subagentId, { timeoutMs: 20000 })
  }
  // A cell that has not ended is still running. Finalizing it would record a
  // bogus "no report" and steal the row from the cell that is still working.
  if (!win.complete && !stopReason && !error) {
    return { pending: true, task, arm, status: 'running', invalid: [], durationSec: null }
  }
  const rec = finalizeCell({
    task, arm, sessionIds,
    startedAt: win.startedAt ?? startedAt,
    endedAt: win.endedAt ?? endedAt,
    subagentId, error,
  })
  rec.sessionWindow = win
  if (stopReason) {
    rec.stopReason = stopReason
    rec.checks.timeout = { capMinutes: 30, actualMinutes: Math.round(rec.durationSec / 60), exceeded: true, pass: false }
    if (!rec.invalid.includes('timeout:30min-cap-exceeded')) rec.invalid.unshift('timeout:30min-cap-exceeded')
    if (!rec.invalid.includes('invalid:no-report') && !rec.checks.report.pass) rec.invalid.push('invalid:no-report')
    rec.status = rec.invalid.length ? 'timeout' : 'ok'
  }
  appendLedger(rec)
  // finalizeCell wrote cell-meta.json before the timeout adjustment; rewrite it.
  writeFileSync(join(dir, 'cell-meta.json'), JSON.stringify(rec, null, 2) + '\n')
  const state = loadState()
  setCell(state, task, arm, {
    status: rec.status, invalid: rec.invalid, subagentId, sessionIds,
    toolCalls: rec.toolCalls, tokens: rec.tokens.total, durationSec: rec.durationSec,
    startedAt: win.startedAt ?? startedAt, endedAt: win.endedAt ?? endedAt, stopReason: stopReason ?? null,
    loopDetected: rec.loopDetected, hostProbeDetected: rec.hostProbeDetected,
  })
  return rec
}
