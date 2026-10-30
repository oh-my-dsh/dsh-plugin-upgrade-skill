// Resolve a solver cell's start and end times from its session log.
//
// The session log is flushed asynchronously: a solver can report "done" to the
// parent before its turn/end event reaches disk. A single read at that moment
// finds no turn/end, leaving the end time undefined and the duration 0s.
// So wait for the flush, bounded, and report whether the window was complete.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { decodeSessionFile } from './audit.mjs'

const SESSION_DIR = 'C:\\Users\\lhh\\.dsh\\sessions\\--E-deepseek-harness-test-lhh010--'

export function sessionDirFor(subagentId) {
  return join(SESSION_DIR, subagentId)
}

function eventsFor(subagentId) {
  const dir = sessionDirFor(subagentId)
  if (!existsSync(dir)) return []
  let names
  try { names = readdirSync(dir) } catch { return [] }
  for (const n of names) {
    if (n.endsWith('.jsonl.zstd')) return decodeSessionFile(join(dir, n))
  }
  return []
}

/**
 * @param {string} subagentId
 * @param {{timeoutMs?: number, intervalMs?: number}} [options]
 * @returns {Promise<{startedAt: string|null, endedAt: string|null, durationSec: number|null, flushWaitMs: number, complete: boolean}>}
 */
export async function resolveWindow(subagentId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20000
  const intervalMs = options.intervalMs ?? 500
  const deadline = Date.now() + timeoutMs
  const began = Date.now()
  for (;;) {
    const events = eventsFor(subagentId)
    const created = events.find((e) => e.type === 'session')
    const ended = events.filter((e) => e.type === 'turn/end').pop()
    if (created && ended) {
      return {
        startedAt: new Date(created.createdAt).toISOString(),
        endedAt: new Date(ended.time).toISOString(),
        durationSec: Math.round((ended.time - created.createdAt) / 1000),
        flushWaitMs: Date.now() - began,
        complete: true,
      }
    }
    if (Date.now() >= deadline) {
      return {
        startedAt: created ? new Date(created.createdAt).toISOString() : null,
        endedAt: null,
        durationSec: null,
        flushWaitMs: Date.now() - began,
        complete: false,
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
