/**
 * Cluster execution: run one command concurrently across many hosts (all, or
 * filtered by explicit aliases / environment / tags with ALL semantics).
 */

import type { ClusterResult } from '../protocol.ts'
import { execCommand, type PoolEngine } from './connection-pool.ts'

interface ClusterOptions {
  command: string
  aliases?: string[]
  environment?: string
  tags?: string[]
  timeoutMs?: number
  maxWorkers?: number
}

/** Run one command against many hosts concurrently. */
export async function cluster(engine: PoolEngine, options: ClusterOptions): Promise<ClusterResult[]> {
  let targets = engine.store.list()
  if (options.aliases !== undefined && options.aliases.length > 0) {
    targets = targets.filter(entry => options.aliases!.includes(entry.alias))
  }
  if (options.environment !== undefined && options.environment !== '') {
    targets = targets.filter(entry => entry.environment === options.environment)
  }
  if (options.tags !== undefined && options.tags.length > 0) {
    // ALL semantics (matches the ssh_cluster tool description).
    targets = targets.filter(entry => options.tags!.every(tag => entry.tags.includes(tag)))
  }
  if (targets.length === 0) return []
  if (options.maxWorkers !== undefined && (!Number.isInteger(options.maxWorkers) || options.maxWorkers < 1)) {
    throw new Error('maxWorkers must be a positive integer')
  }
  const workers = Math.min(engine.opts.defaultMaxWorkers, options.maxWorkers ?? engine.opts.defaultMaxWorkers, targets.length)
  const results: ClusterResult[] = []
  const queue = [...targets]
  const run = async (): Promise<void> => {
    while (queue.length > 0) {
      const entry = queue.shift()!
      try {
        const result = await execCommand(engine, entry.alias, options.command, options.timeoutMs)
        results.push({ alias: entry.alias, ok: result.success, exitCode: result.exitCode, timedOut: result.timedOut, stdout: result.stdout, stderr: result.stderr, durationMs: result.durationMs })
      } catch (error) {
        results.push({ alias: entry.alias, ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, () => run()))
  return results
}