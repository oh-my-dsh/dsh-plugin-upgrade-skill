// Wave launcher: spawn 2 cells concurrently, await, finalize, append ledger.
//
// NOTE: the actual spawn must happen through the harness tool, so this module
// exposes the pieces the orchestrator calls from run_code.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './common.mjs'
import { stage, cellDir } from './stage.mjs'
import { buildPrompt } from './prompt.mjs'
import { finalizeCell, appendLedger } from './finalize.mjs'
import { loadState, saveState, setCell, isDone } from './state.mjs'

export function prepareCell(task, arm) {
  const st = stage(task, arm)
  const prompt = buildPrompt(task, arm)
  writeFileSync(join(st.dir, 'solver-prompt.txt'), prompt)
  return { dir: st.dir, prompt, fileCount: st.fileCount }
}

export function finishCell({ task, arm, sessionIds, startedAt, endedAt, subagentId, error }) {
  const rec = finalizeCell({ task, arm, sessionIds, startedAt, endedAt, subagentId, error })
  appendLedger(rec)
  const state = loadState()
  setCell(state, task, arm, {
    status: rec.status,
    invalid: rec.invalid,
    subagentId,
    sessionIds,
    toolCalls: rec.toolCalls,
    tokens: rec.tokens.total,
    durationSec: rec.durationSec,
    startedAt, endedAt,
  })
  return rec
}

export { isDone, loadState };
