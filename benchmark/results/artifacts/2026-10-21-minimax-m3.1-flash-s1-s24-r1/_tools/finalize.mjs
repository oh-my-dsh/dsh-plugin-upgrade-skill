// Finalize one cell: run the five closing checks and write the cell record.
//
// 1. report exists and is non-empty
// 2. fixture integrity (post-run SHA-256 vs the sealed source)
// 3. transcript audit (roaming check against the cell whitelist)
// 4. state written to disk (cell-meta.json + ledger row)
// 5. ledger updated
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './common.mjs'
import { verifyFixture, cellDir, findReport } from './stage.mjs'
import { runAudit, tokenUsage, sessionStats, ledgerRow, writeCellMeta } from './runner.mjs'

export function finalizeCell({ task, arm, sessionIds, startedAt, endedAt, subagentId, error }) {
  const dir = cellDir(task, arm)
  const checks = {}

  // 1. report
  const reports = findReport(task, arm)
  const reportPath = reports[0] ?? null
  const reportBytes = reportPath ? readFileSync(reportPath, 'utf8').length : 0
  checks.report = {
    found: reports.length > 0,
    candidates: reports.length,
    path: reportPath ? reportPath.slice(dir.length + 1).split('\\').join('/') : null,
    chars: reportBytes,
    nonEmpty: reportBytes > 0,
    pass: reports.length > 0 && reportBytes > 0,
  }

  // 2. fixture integrity
  const fx = verifyFixture(task, arm)
  checks.fixture = {
    intact: fx.ok,
    drift: fx.drift,
    pass: fx.ok,
  }

  // 3. transcript audit
  const audit = runAudit(task, arm, sessionIds)
  checks.audit = {
    toolCalls: audit.toolCalls,
    toolCounts: audit.toolCounts,
    violations: audit.violations,
    outOfScopeMentions: audit.mentions.slice(0, 40),
    outOfScopeMentionCount: audit.mentions.length,
    pass: audit.violations.length === 0,
  }

  // 3b. loop detection (a quality signal, not a whitelist question)
  checks.loop = {
    detected: audit.loop.detected,
    rule: audit.loop.rule,
    totalReads: audit.loop.totalReads,
    uniqueOperands: audit.loop.uniqueOperands,
    maxRepeatOfOneOperand: audit.loop.maxRepeatOfOneOperand,
    overThresholdOperands: audit.loop.overThresholdOperands,
    repeatingCycle: audit.loop.repeatingCycle,
    redundantReads: audit.loop.redundantReads,
    pass: !audit.loop.detected,
  }

  // 3c. host probing (mining the live host for facts the fixture does not hold)
  checks.hostProbe = {
    detected: audit.hostProbe.detected,
    execProbeCount: audit.hostProbe.count,
    byWhat: audit.hostProbe.byWhat,
    quotedMentions: audit.hostProbe.quotedMentions,
    pass: !audit.hostProbe.detected,
  }

  // 4/5. tokens + record
  const tokens = sessionIds.map(tokenUsage).filter(Boolean)
  const totals = tokens.reduce((a, t) => ({
    uncachedInputTokens: a.uncachedInputTokens + t.uncachedInputTokens,
    outputTokens: a.outputTokens + t.outputTokens,
    cacheReadTokens: a.cacheReadTokens + t.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + t.cacheWriteTokens,
    total: a.total + t.total,
  }), { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, total: 0 })

  const stats = sessionIds.map(sessionStats).filter(Boolean)
  const durationMs = endedAt && startedAt ? new Date(endedAt) - new Date(startedAt) : 0

  const invalid = []
  if (!checks.report.pass) invalid.push('invalid:no-report')
  if (!checks.fixture.pass) invalid.push('invalid:fixture-modified')
  if (!checks.audit.pass) invalid.push('invalid:roaming')
  if (!checks.loop.pass) invalid.push('invalid:loop')
  if (error) invalid.push('error:' + error)

  const status = invalid.length ? 'invalid' : 'ok'
  const record = {
    task, arm, status, invalid,
    loopDetected: audit.loop.detected,
    hostProbeDetected: audit.hostProbe.detected,
    startedAt, endedAt,
    durationMs,
    durationSec: Math.round(durationMs / 1000),
    subagentId, sessionIds,
    toolCalls: audit.toolCalls,
    toolCounts: audit.toolCounts,
    tokens: totals,
    sessionStats: stats,
    checks,
    error: error ?? null,
  }
  writeCellMeta(task, arm, record)
  writeFileSync(join(dir, 'audit.json'), JSON.stringify(checks, null, 2) + '\n')
  return record
}

export function appendLedger(record) {
  const dur = record.durationSec ? (record.durationSec + 's') : '-'
  return ledgerRow({
    task: record.task,
    arm: record.arm,
    status: record.status + (record.invalid.length ? ' [' + record.invalid.join(',') + ']' : ''),
    start: record.startedAt,
    end: record.endedAt,
    duration: dur,
    toolcalls: record.toolCalls,
    tokens: record.tokens.total,
  })
}
