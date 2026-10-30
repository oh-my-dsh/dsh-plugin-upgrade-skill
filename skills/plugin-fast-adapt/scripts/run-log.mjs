#!/usr/bin/env node
// run-log.mjs —— 运行日志的查看、交叉核对与脱敏导出。
//
//   node scripts/run-log.mjs list [--limit 20]      最近运行一览（读 index.jsonl）
//   node scripts/run-log.mjs show <id|路径>          单次运行全文
//   node scripts/run-log.mjs sanitize <id|路径|--latest> [--out 文件]
//                                                   脱敏后输出（对外反馈前必跑）
//   node scripts/run-log.mjs doctor [--logs <目录>] [--limit 20]
//                                                   运行日志 × 宿主启动日志交叉核对
//
// 脱敏规则（lib/runlog.mjs sanitizeText）：home 前缀 → ~，用户名 → <user>，
// 机器名 → <host>，邮箱形态 → <email>。目录结构与文件名保留，方便对照排查。
//
// doctor 回答的问题是「插件装了没生效/宿主报错，到底哪边的事」：
// 运行日志（run.mjs 的 phases/命中/体检）说代码侧状态，宿主 startup 日志的
// failedPlugins/waitingForServices 说装载侧状态，两边以前要各跑一个命令再人肉对。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listRuns, resolveRunFile, sanitizeRun, getLogRoot } from './lib/runlog.mjs'
import { diagnoseLogs, DEFAULT_LOGS_DIR } from './log-doctor.mjs'
import { printJson } from './lib/scanner.mjs'

const args = process.argv.slice(2)
const command = args[0]

function findId(argList) {
  const latest = argList.includes('--latest')
  if (latest) {
    const runs = listRuns(1)
    return runs[0]?.file ?? null
  }
  const at = argList.findIndex((a) => !a.startsWith('--') && a !== command)
  return at !== -1 ? argList[at] : null
}

// ── doctor：运行日志 × 宿主启动日志交叉核对 ────────────────────────────────
// runsDir 可注入（自检走 DSH_PFA_RUNS_DIR，listRuns 已读同一环境变量），
// logsDir 可注入（自检传临时目录，线上默认 ~/.dsh/logs）。
export function correlateRuns({ limit = 20, logsDir = DEFAULT_LOGS_DIR } = {}) {
  const runs = listRuns(limit)
  // runs 新的在前；每个插件取最近一次运行
  const latestByPlugin = new Map()
  for (const run of runs) {
    if (!run.plugin || latestByPlugin.has(run.plugin)) continue
    latestByPlugin.set(run.plugin, run)
  }

  const diag = diagnoseLogs({ logsDir, limit: 20, pattern: null })
  const plugins = [...latestByPlugin.entries()].map(([name, run]) => {
    const hits = []
    for (const logRun of diag.runs) {
      for (const fp of logRun.failedPlugins || []) {
        if (fp.plugin === name || fp.package === name) {
          hits.push({ log: logRun.file, what: 'failed-plugin', detail: fp.error || fp.plugin })
        }
      }
      for (const w of logRun.waitingForServices || []) {
        if (w.plugin === name) hits.push({ log: logRun.file, what: 'waiting-services', detail: w.missing })
      }
      for (const em of logRun.errorMessages || []) {
        const text = em.args.join(' ')
        if (text.includes(name)) hits.push({ log: logRun.file, what: 'error-message', detail: text.slice(0, 200) })
      }
    }
    const codeSideClean = run.phases?.scan === 'ok' && !(run.criticalOrHigh > 0)
    const verdict = hits.length === 0
      ? 'host-log-clean'
      : codeSideClean
        ? 'log-hit-scan-clean'
        : 'log-hit-scan-hit'
    return {
      plugin: name,
      latestRun: {
        time: run.time ?? null,
        toolVersion: run.toolVersion ?? null,
        phases: run.phases ?? null,
        findings: run.findings ?? null,
        criticalOrHigh: run.criticalOrHigh ?? null,
        auditScore: run.auditScore ?? null,
      },
      hostLogHits: hits,
      verdict,
      advice:
        verdict === 'host-log-clean'
          ? '宿主日志无该插件的失败记录——状态一致，无事可做'
          : verdict === 'log-hit-scan-clean'
            ? '宿主日志报了它、但最近一次 run 的扫描干净——嫌疑在装载/挂载/环境侧（env-doctor 看 activation 双半），不在代码踩雷'
            : '宿主日志与最近一次 run 都有问题——先按 run 的命中清代码，再回来看宿主日志是否消停',
    }
  })

  return {
    logsDir,
    runsConsidered: runs.length,
    plugins,
    host: { verdict: diag.verdict, signalSummary: diag.signalSummary },
  }
}

function printDoctorText(report) {
  process.stderr.write(`\n交叉核对: ${report.runsConsidered} 次运行 × ${report.logsDir}\n`)
  process.stderr.write(`宿主日志总判: ${report.host.verdict}\n`)
  for (const p of report.plugins) {
    process.stderr.write(`\n${p.plugin}（最近运行 ${p.latestRun.time ?? '?'}）\n`)
    const ph = p.latestRun.phases
    process.stderr.write(
      `  代码侧: ${ph ? `scan=${ph.scan ?? '?'} smoke=${ph.smoke ?? '?'} typecheck=${ph.typecheck ?? '?'}` : '?'}，命中 ${p.latestRun.findings ?? '?'}，体检 ${p.latestRun.auditScore ?? '?'}\n`
    )
    process.stderr.write(`  宿主侧: ${p.hostLogHits.length === 0 ? '无失败记录' : p.hostLogHits.map((h) => `${h.log} ${h.what}`).join('；')}\n`)
    process.stderr.write(`  判定: ${p.verdict}——${p.advice}\n`)
    for (const h of p.hostLogHits.slice(0, 3)) {
      process.stderr.write(`    ${h.log} [${h.what}] ${h.detail}\n`)
    }
  }
  process.stderr.write('\n边界: 交叉核对只对齐两边的文本记录，不替人拍板；宿主日志无记录不等于装载正常（可能没轮到它启动）。\n')
}

// CLI（带主模块守卫：被 self-test import 时不执行）
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
if (command === 'list') {
  const limitAt = args.indexOf('--limit')
  const limit = limitAt !== -1 ? Number(args[limitAt + 1]) || 20 : 20
  const runs = listRuns(limit)
  if (runs.length === 0) {
    process.stdout.write(`暂无运行日志（${getLogRoot()}）\n`)
    process.exit(0)
  }
  for (const run of runs) {
    // tool 版本后的 * = 工具仓当时有未提交改动（版本号与 commit 可能拆对）
    // phases 三态：scan/smoke/typecheck/realSmoke 各 ok|skipped|fail|error，? = 旧条目无此字段
    const phases = run.phases
      ? `scan=${run.phases.scan ?? '?'} smoke=${run.phases.smoke ?? '?'} typecheck=${run.phases.typecheck ?? '?'}${
          run.phases.realSmoke ? ` real=${run.phases.realSmoke}` : ''
        }`
      : ''
    const line = [
      run.time,
      `tool=${run.toolVersion ?? '?'}${run.toolDirty ? '*' : ''}${run.toolCommit ? `@${run.toolCommit}` : ''}`,
      `${run.plugin ?? '?'}@${run.pluginVersion ?? '?'}`,
      `host=${run.hostVersion ?? '?'}`,
      `命中=${run.findings ?? '?'}${run.criticalOrHigh ? `(c/h ${run.criticalOrHigh})` : ''}`,
      `体检=${run.auditScore ?? '?'}`,
      phases,
      `${run.durationMs ?? '?'}ms`,
    ].filter(Boolean)
    process.stdout.write(`${line.join('  ')}\n    ${run.file}\n`)
  }
  process.exit(0)
}

if (command === 'show') {
  const id = findId(args)
  const file = id && resolveRunFile(id)
  if (!file) {
    process.stderr.write('用法: node scripts/run-log.mjs show <id|路径|--latest>\n')
    process.exit(1)
  }
  process.stdout.write(fs.readFileSync(file, 'utf8'))
  process.exit(0)
}

if (command === 'sanitize') {
  const id = findId(args)
  const file = id && resolveRunFile(id)
  if (!file) {
    process.stderr.write('用法: node scripts/run-log.mjs sanitize <id|路径|--latest> [--out 文件]\n')
    process.exit(1)
  }
  const sanitized = sanitizeRun(file)
  const outAt = args.indexOf('--out')
  if (outAt !== -1 && args[outAt + 1]) {
    fs.writeFileSync(args[outAt + 1], sanitized)
    process.stderr.write(`脱敏完成 → ${args[outAt + 1]}\n`)
  } else {
    process.stdout.write(sanitized)
  }
  process.exit(0)
}

if (command === 'doctor') {
  const logsAt = args.indexOf('--logs')
  const limitAt = args.indexOf('--limit')
  const report = correlateRuns({
    logsDir: logsAt !== -1 && args[logsAt + 1] ? args[logsAt + 1] : DEFAULT_LOGS_DIR,
    limit: limitAt !== -1 ? Number(args[limitAt + 1]) || 20 : 20,
  })
  if (report.plugins.length === 0) {
    process.stderr.write(`暂无运行日志可核对（${getLogRoot()}）\n`)
    process.exit(0)
  }
  printJson(report)
  printDoctorText(report)
  process.exit(0)
}

process.stderr.write('用法: run-log.mjs list | show <id> | sanitize <id|--latest> [--out 文件] | doctor [--logs <目录>]\n')
process.exit(1)
}
