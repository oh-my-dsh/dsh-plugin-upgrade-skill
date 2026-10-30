// lib/runlog.mjs —— 运行日志层（Argo 式本地日志，2026-10-25 实测复盘新增）。
//
// 为什么要有日志：本轮适配 taxue-dsh-artisan 时跑了 skills 目录的滞后拷贝，
// 包锚点语义门（真源已修）不在场，产出 4 个本不该出现的 critical 误报——
// 没有运行日志，这类「跑的不是哪版工具」完全不可观测。
//
// 设计取舍（奥卡姆）：
//   - 一次运行一个自包含 JSON + index.jsonl 一行摘要。分析跨运行趋势走 index，
//     复盘单次细节走 run 文件，不引入数据库。
//   - 日志只落 ~/.cache/dsh-plugin-fast-adapt/runs/，不出本机。
//   - 对外反馈用 sanitize() 脱敏：home 前缀、用户名、机器名、插件绝对路径。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// 日志根可注入（DSH_PFA_RUNS_DIR）：self-test 用临时目录，不写真实用户缓存。
export function getLogRoot() {
  return process.env.DSH_PFA_RUNS_DIR || path.join(os.homedir(), '.cache', 'dsh-plugin-fast-adapt', 'runs')
}

function indexFile() {
  return path.join(getLogRoot(), 'index.jsonl')
}

function toolCommit(toolDir) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: toolDir, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// 工具仓是否带未提交改动。version 取自工作树 package.json、commit 取自 HEAD，
// 两者来源不绑定：版本先改后提交时会出现「新版本号 × 旧 commit」的拆对
// （2026-10-25 实录 0.1.0@83bd444）。dirty 标记让这类拆对可识别。
// 非 git 目录返回 null（探测失败不伪造）。
function toolDirty(toolDir) {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: toolDir, encoding: 'utf8' }).trim().length > 0
  } catch {
    return null
  }
}

// 阶段三态摘要：scan/smoke/typecheck/realSmoke 各 ok | skipped | fail | error 之一，
// null = 该阶段信息缺失（realSmoke 默认关，null = 未启用）。有了它，「扫描没跑」
// 不再与「扫描满分」在同一行摘要里混淆（dsh-image-gen 实录：scan skipped、
// auditScore 照记 100）。
function phasesOf(record) {
  return {
    scan: record.scan?.error ? 'error' : record.scan?.skipped ? 'skipped' : record.scan ? 'ok' : null,
    smoke: record.smoke == null ? null : record.smoke.skipped ? 'skipped' : record.smoke.success ? 'ok' : 'fail',
    // --no-typecheck 产生的 { skipped: true } 没有 status 字段，也要归入 skipped
    typecheck: record.typecheck == null ? null : record.typecheck.status ?? (record.typecheck.skipped ? 'skipped' : null),
    realSmoke: record.realSmoke == null ? null : record.realSmoke.skipped ? 'skipped' : (record.realSmoke.status ?? null),
  }
}

// 保留策略：runs/ 只增不减会无限累积；写日志时顺带清掉保留期前的旧运行
// （文件按 mtime 判定，index 同步剔除对应行）。now 可注入供自检。
// 删除动作全部内部 try/catch——清理失败不影响日志写入本身。
const RETENTION_DAYS = 90
// 只清理 writeRunLog 自己写出的记录（<ISO 时间戳>-<插件名>.json）：DSH_PFA_RUNS_DIR
// 可指向任意目录，不能把别人的文件按 mtime 一并删掉。
const RUN_FILE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-.+\.json$/
export function pruneRuns(root = getLogRoot(), { retentionDays = RETENTION_DAYS, now = Date.now() } = {}) {
  const cutoff = now - retentionDays * 86400_000
  let names = []
  try {
    names = fs.readdirSync(root)
  } catch {
    return { pruned: [] }
  }
  const pruned = []
  for (const name of names) {
    if (!RUN_FILE_RE.test(name)) continue
    const file = path.join(root, name)
    try {
      if (fs.statSync(file).mtimeMs < cutoff) {
        fs.rmSync(file)
        pruned.push(name)
      }
    } catch {}
  }
  if (pruned.length) {
    try {
      const index = path.join(root, 'index.jsonl')
      const lines = fs.readFileSync(index, 'utf8').split('\n').filter(Boolean)
      const kept = lines.filter((line) => {
        try {
          return !pruned.includes(JSON.parse(line).file)
        } catch {
          return true
        }
      })
      fs.writeFileSync(index, kept.length ? `${kept.join('\n')}\n` : '')
    } catch {}
  }
  return { pruned }
}

// 写一次运行日志：返回 { file, index }。失败静默降级（日志是增益不是依赖，
// 磁盘只读时审计流程本身照常出结果）。
export function writeRunLog(payload, { toolDir } = {}) {
  try {
    const root = getLogRoot()
    fs.mkdirSync(root, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    // 作用域包名（@scope/name）含路径分隔符，不转义会写进不存在的子目录而静默失败。
    const plugin = (payload.plugin?.name || 'unknown').replace(/[\\/]/g, '__')
    const file = path.join(root, `${stamp}-${plugin}.json`)
    const record = {
      ...payload,
      tool: {
        name: 'plugin-fast-adapt',
        version: payload.tool?.version ?? null,
        dir: toolDir ?? null,
        commit: toolDir ? toolCommit(toolDir) : null,
        dirty: toolDir ? toolDirty(toolDir) : null,
      },
      machine: { platform: process.platform, node: process.version },
    }
    fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
    const summary = {
      file: path.basename(file),
      time: record.time,
      toolVersion: record.tool.version,
      toolCommit: record.tool.commit,
      toolDirty: record.tool.dirty,
      plugin: record.plugin?.name ?? null,
      pluginVersion: record.plugin?.version ?? null,
      hostVersion: record.host?.version ?? null,
      window: record.window ?? null,
      verdict: record.version?.verdict ?? null,
      phases: phasesOf(record),
      findings: record.scan?.findingCount ?? null,
      criticalOrHigh: record.scan?.criticalOrHigh ?? null,
      auditScore: record.audit?.overallScore ?? null,
      smoke: record.smoke?.success ?? null,
      typecheck: record.typecheck?.status ?? null,
      durationMs: record.durationMs ?? null,
    }
    fs.appendFileSync(indexFile(), `${JSON.stringify(summary)}\n`)
    try {
      pruneRuns(root)
    } catch {}
    return { file, index: indexFile() }
  } catch {
    return null
  }
}

export function listRuns(limit = 20) {
  const index = indexFile()
  if (!fs.existsSync(index)) return []
  const lines = fs.readFileSync(index, 'utf8').split('\n').filter(Boolean)
  return lines.slice(-limit).reverse().map((line) => {
    try {
      return JSON.parse(line)
    } catch {
      return { file: line, parseError: true }
    }
  })
}

// id 可以是索引里的 file 名、完整路径或其前缀
export function resolveRunFile(id) {
  if (path.isAbsolute(id) && fs.existsSync(id)) return id
  const direct = path.join(getLogRoot(), id)
  if (fs.existsSync(direct)) return direct
  if (fs.existsSync(indexFile())) {
    const hit = fs.readFileSync(indexFile(), 'utf8').split('\n').filter(Boolean).find((line) => line.includes(id))
    if (hit) {
      try {
        const name = JSON.parse(hit).file
        const candidate = path.join(getLogRoot(), name)
        if (fs.existsSync(candidate)) return candidate
      } catch {}
    }
  }
  return null
}

// 脱敏：替换 home 前缀、用户名、机器名、用户邮箱形态的 token。
// 规则刻意保守——只动确定是身份信息的部分，目录结构和文件名保留，方便对照。
export function sanitizeText(text) {
  const home = os.homedir()
  const user = path.basename(home)
  let out = String(text)
  out = out.split(home).join('~')
  if (user && user.length > 2) out = out.split(user).join('<user>')
  try {
    const host = os.hostname()
    if (host) out = out.split(host).join('<host>')
  } catch {}
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
  return out
}

export function sanitizeRun(runFile) {
  const raw = fs.readFileSync(runFile, 'utf8')
  return sanitizeText(raw)
}
