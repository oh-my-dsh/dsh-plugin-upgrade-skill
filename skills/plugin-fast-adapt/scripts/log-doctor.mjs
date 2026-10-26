#!/usr/bin/env node
// log-doctor.mjs —— 一键解析 ~/.dsh/logs/ 的宿主故障。
//
// 为什么需要它：宿主启动失败（StartupError / 端口占用 / 未声明 inject / 客户端
// 入口死链）目前要人工逐个 grep startup-*.log，再从 300 多行的 JS 字面量里
// 抠出 failedPlugins 与 waitingForServices。本脚本把这条排障路径固化：
// 读日志目录 → 解析每份 startup 日志的头部元信息与错误块 → 抽取信号 → 汇总
// 成一份按根因分组的诊断，给出可执行动作。
//
// 诚实边界：日志是宿主自己写的 JS 字面量（非 JSON），这里只做行级启发式解析；
// 解析不到的字段留 null 而不是猜。信号是「文本命中」，命中不等于定论——
// 动作写的是「去确认/怎么确认」，不替用户拍板。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { printJson } from './lib/scanner.mjs'

export const DEFAULT_LOGS_DIR = path.join(os.homedir(), '.dsh', 'logs')

// 信号表：每条给正则 + 可执行动作。命中即进诊断，动作是「怎么确认/怎么修」的第一步。
const SIGNALS = [
  { id: 'port-in-use', re: /EADDRINUSE/, action: '端口被旧宿主进程占用：lsof -nP -iTCP:<port> -sTCP:LISTEN 找到 PID 后结束它，或换端口重启。' },
  { id: 'undeclared-inject', re: /without inject/, action: '插件访问了未声明 inject 的宿主服务：在该插件入口补 inject 声明，或改用 ctx.get("<服务>") 弱依赖降级。' },
  { id: 'inactive-required-service', re: /cannot get required service .* in inactive context/, action: '强注入的服务在宿主里没有提供方：确认宿主版本确实提供该服务，或改弱依赖。' },
  { id: 'patch-entry-not-found', re: /patch: entry .* not found/, action: 'cordis.patch.yml 挂了不存在的插件条目：从 patch 层移除或修正包名/挂载 id。' },
  { id: 'entry-not-activate', re: /entry did not activate/, action: '客户端入口未激活（常见于 dsh.client.inject 指向已移除/名册外）：核查客户端名册与产物。' },
  { id: 'hmr-disposed', re: /HMR is disposed/, action: '热重载上下文已销毁：重启宿主进程即可，不是插件缺陷。' },
  { id: 'config-reload-failed', re: /config reload .* failed/, action: '配置重载失败：检查对应 cordis.yml 的语法与引用路径。' },
  { id: 'startup-error', re: /StartupError/, action: '宿主启动失败：看本条的 failedPlugins / waitingForServices 段。' },
  { id: 'missing-entry-artifact', re: /client bundles not found|entry_resolution/, action: '插件产物缺失：先构建（pnpm run build）再挂载。' },
]

// ── 文件发现 ────────────────────────────────────────────────────────────────

export function listLogFiles(logsDir = DEFAULT_LOGS_DIR, { limit = 10, pattern = null } = {}) {
  let entries = []
  try {
    entries = fs.readdirSync(logsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.log'))
    .filter((e) => (pattern ? new RegExp(pattern).test(e.name) : true))
    .map((e) => {
      const full = path.join(logsDir, e.name)
      let stat = null
      try { stat = fs.statSync(full) } catch {}
      return { file: e.name, path: full, mtimeMs: stat?.mtimeMs ?? 0, size: stat?.size ?? 0 }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return limit ? files.slice(0, limit) : files
}

// ── startup 日志解析 ────────────────────────────────────────────────────────

// 头部标量字段：`  key: 'value',`
function parseHeaderMeta(text) {
  const meta = {}
  for (const m of text.matchAll(/^\s{2}(\w+):\s*'([^']*)',?\s*$/gm)) meta[m[1]] = m[2]
  const config = text.match(/configurationPath:\s*'([^']*)'/)
  if (config) meta.configurationPath = config[1]
  return meta
}

// error 字段是多行未加引号的字符串，直到 `at async ... {` 或 `[stack]:` 前一行。
function parseErrorBlock(text) {
  const start = text.search(/^\s{2}error:\s*/m)
  if (start === -1) return null
  const rest = text.slice(start).replace(/^\s{2}error:\s*/, '')
  const lines = rest.split('\n')
  const out = []
  for (const line of lines) {
    if (/^\s*\[stack\]:/.test(line) || /^\s*\[message\]:/.test(line) || /^\s*at async .* \{\s*$/.test(line)) break
    out.push(line)
  }
  return out.join('\n').replace(/\s+$/, '')
}

// Failed plugins 段：`  <name> (required)` + `    Package: ...` + `    Error: ...`
function parseFailedPlugins(errorBlock) {
  if (!errorBlock) return []
  const lines = errorBlock.split('\n')
  const start = lines.findIndex((l) => /Failed plugins \(\d+\):/.test(l))
  if (start === -1) return []
  const out = []
  let cur = null
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/Plugins waiting for services/.test(line)) break
    const name = line.match(/^\s+(\S.*?)( \(required\))?\s*$/)
    if (name && !/Package:|Error:|at /.test(line)) {
      cur = { plugin: name[1].trim(), required: Boolean(name[2]), package: null, error: null }
      out.push(cur)
      continue
    }
    const pkg = line.match(/^\s*Package:\s*(\S+)/)
    if (pkg && cur) { cur.package = pkg[1]; continue }
    const err = line.match(/^\s*Error:\s*(.*)$/)
    if (err && cur && cur.error === null) cur.error = err[1].trim()
  }
  return out
}

// Plugins waiting for services 段：`  <plugin> (required)  <svc>, <svc>`
function parseWaitingForServices(errorBlock) {
  if (!errorBlock) return []
  const lines = errorBlock.split('\n')
  const start = lines.findIndex((l) => /Plugins waiting for services \(\d+\):/.test(l))
  if (start === -1) return []
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*at /.test(line) || /^\s*\.\.\. /.test(line)) break
    if (/^\s*Plugin\s+Missing services\s*$/.test(line)) continue // 表头
    const m = line.match(/^\s+(\S.*?)( \(required\))?\s{2,}(.+)$/)
    if (m) {
      out.push({ plugin: m[1].trim(), required: Boolean(m[2]), missing: m[3].trim() })
    }
  }
  return out
}

// 消息数组：`{ ts, name, type, args: [...] }`。args 用括号深度计数，容忍嵌套。
// 注意：宿主用 `[length]: N` 标记数组真长（不是真数组），括号计数前要剔掉，
// 否则 `args: [ 'x', [length]: 1 ]` 会被当成未闭合的多行数组，把后续整份日志吞进 args。
export function parseMessages(text) {
  // 剔掉 `[length]: N`（宿主标记数组真长的伪字段，不是真数组）
  const lines = text.split('\n').map((l) => l.replace(/\[length\]: \d+/g, '').replace(/\[length\]/g, ''))
  const messages = []
  let cur = null
  let depth = 0
  const net = (line) => (line.match(/\[/g) || []).length - (line.match(/\]/g) || []).length
  for (const line of lines) {
    if (depth === 0) {
      const tsM = line.match(/^\s*ts:\s*(\d+),\s*$/)
      if (tsM) {
        cur = { ts: Number(tsM[1]), name: null, type: null, args: [] }
        messages.push(cur)
        continue
      }
      if (!cur) continue
      const nameM = line.match(/^\s*name:\s*'([^']*)',?\s*$/)
      if (nameM) { cur.name = nameM[1]; continue }
      const typeM = line.match(/^\s*type:\s*'([^']*)',?\s*$/)
      if (typeM) { cur.type = typeM[1]; continue }
      const argsM = line.match(/^\s*args:\s*\[(.*)$/)
      if (argsM) {
        const rest = argsM[1]
        depth = 1 + net(rest)
        const inline = rest.replace(/\]\s*,?\s*$/, '').replace(/:\s*\d+\s*$/, '').trim()
        if (inline) cur.args.push(inline)
        if (depth <= 0) { depth = 0; cur = null; continue }
        continue
      }
      if (/^\s*\},?\s*$/.test(line) && cur.name !== null) { cur = null; continue }
    } else {
      depth += net(line)
      if (depth <= 0) { depth = 0; cur = null; continue }
      const trimmed = line.trim()
      if (!trimmed || /^:\s*\d+$/.test(trimmed)) continue
      cur.args.push(trimmed)
    }
  }
  return messages
}

export function parseStartupLog(text) {
  const meta = parseHeaderMeta(text)
  const errorBlock = parseErrorBlock(text)
  const messages = parseMessages(text)
  const signals = []
  for (const s of SIGNALS) {
    if (s.re.test(errorBlock || '') || messages.some((m) => s.re.test(m.args.join(' ')))) {
      signals.push({ id: s.id, action: s.action })
    }
  }
  return {
    meta,
    errorSummary: errorBlock ? errorBlock.split('\n')[0].trim() : null,
    errorBlock,
    failedPlugins: parseFailedPlugins(errorBlock),
    waitingForServices: parseWaitingForServices(errorBlock),
    messages,
    errorMessages: messages.filter((m) => m.type === 'error').map((m) => ({ ts: m.ts, name: m.name, args: m.args })),
    warnMessages: messages.filter((m) => m.type === 'warn').map((m) => ({ ts: m.ts, name: m.name, args: m.args })),
    signals,
  }
}

// ── 汇总诊断 ────────────────────────────────────────────────────────────────

export function diagnoseLogs({ logsDir = DEFAULT_LOGS_DIR, limit = 5, pattern = null } = {}) {
  const files = listLogFiles(logsDir, { limit, pattern })
  const runs = []
  const signalCounts = new Map()
  const signalLogs = new Map()

  for (const file of files) {
    let text = ''
    try { text = fs.readFileSync(file.path, 'utf8') } catch { continue }
    const isStartup = /^startup-/.test(file.file)
    const parsed = isStartup
      ? parseStartupLog(text)
      : { meta: null, errorSummary: null, errorBlock: null, failedPlugins: [], waitingForServices: [], messages: [], signals: [] }
    // 非 startup 日志（maintain/env-sweeper/web-restart）：只按全文扫信号
    if (!isStartup) {
      for (const s of SIGNALS) {
        if (s.re.test(text)) parsed.signals.push({ id: s.id, action: s.action })
      }
    }
    runs.push({ file: file.file, mtimeMs: file.mtimeMs, size: file.size, isStartup, ...parsed })

    for (const sig of parsed.signals) {
      signalCounts.set(sig.id, (signalCounts.get(sig.id) || 0) + 1)
      if (!signalLogs.has(sig.id)) signalLogs.set(sig.id, [])
      signalLogs.get(sig.id).push(file.file)
    }
  }

  const ranked = [...signalCounts.entries()]
    .map(([id, count]) => {
      const def = SIGNALS.find((s) => s.id === id)
      return { id, count, action: def?.action || null, logs: signalLogs.get(id) || [] }
    })
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))

  return {
    logsDir,
    scanned: files.length,
    runs,
    signalSummary: ranked,
    verdict: ranked.length === 0 ? 'clean' : (ranked.some((r) => ['port-in-use', 'undeclared-inject', 'inactive-required-service', 'entry-not-activate'].includes(r.id)) ? 'host-failure' : 'warnings'),
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const flags = { limit: 5, pattern: null, logs: DEFAULT_LOGS_DIR }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--logs') flags.logs = argv[++i]
    else if (a === '--limit') flags.limit = Number(argv[++i]) || 5
    else if (a === '--pattern') flags.pattern = argv[++i]
    else if (a.startsWith('--')) throw new Error(`未知参数「${a}」`)
    else positional.push(a)
  }
  return flags
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const flags = parseArgv(process.argv.slice(2))
  const report = diagnoseLogs(flags)
  printJson(report)

  process.stderr.write(`\n日志目录: ${report.logsDir}（扫 ${report.scanned} 份）\n`)
  process.stderr.write(`结论: ${report.verdict}\n`)
  for (const run of report.runs) {
    if (!run.isStartup) continue
    const when = run.meta?.timestamp || new Date(run.mtimeMs).toISOString()
    process.stderr.write(`\n[${run.file}] ${when} 宿主 ${run.meta?.dshVersion || '?'} @ ${run.meta?.profile || '?'}\n`)
    if (run.errorSummary) process.stderr.write(`  ${run.errorSummary}\n`)
    for (const fp of run.failedPlugins) {
      process.stderr.write(`  失败插件: ${fp.plugin}${fp.required ? ' (required)' : ''}${fp.package ? ` ← ${fp.package}` : ''}\n`)
      if (fp.error) process.stderr.write(`    ${fp.error}\n`)
    }
    for (const w of run.waitingForServices) {
      process.stderr.write(`  等待服务: ${w.plugin}${w.required ? ' (required)' : ''} → ${w.missing}\n`)
    }
  }
  if (report.signalSummary.length) {
    process.stderr.write('\n信号汇总（按出现次数）:\n')
    for (const s of report.signalSummary) {
      process.stderr.write(`  ${s.count}× ${s.id}${s.action ? ` —— ${s.action}` : ''}\n`)
    }
  }
  process.stderr.write('\n边界: 文本命中不等于定论；动作是「怎么确认/怎么修」的第一步，不替你拍板。\n')
}
