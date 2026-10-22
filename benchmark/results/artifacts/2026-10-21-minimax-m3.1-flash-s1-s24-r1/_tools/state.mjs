// Resumable run state for the 48-cell sweep.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './common.mjs'

const STATE = join(ROOT, 'run-state.json')

export function loadState() {
  if (!existsSync(STATE)) return { cells: {} }
  try { return JSON.parse(readFileSync(STATE, 'utf8')) } catch { return { cells: {} } }
}

export function saveState(state) {
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n')
}

export function cellKey(task, arm) { return task + '::' + arm }

export function setCell(state, task, arm, patch) {
  const k = cellKey(task, arm)
  state.cells[k] = { ...(state.cells[k] ?? {}), task, arm, ...patch }
  saveState(state)
  return state.cells[k]
}

export function isDone(state, task, arm) {
  const c = state.cells[cellKey(task, arm)]
  return !!c && (c.status === 'ok' || c.status === 'invalid')
}
