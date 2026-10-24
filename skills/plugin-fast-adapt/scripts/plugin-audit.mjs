#!/usr/bin/env node
// plugin-audit.mjs —— 第 6 步（可选）：插件性能与架构审计，升级时顺带做优化。
//
// 四个正交维度，从 100 分往下扣：
//   performance    同步 I/O 阻塞、无上限文件读取（OOM 防护）
//   resilience     强依赖非核心宿主包、peer 范围拒绝 prerelease
//   contextBudget  工具注册的 Schema/描述体积
//   lifecycle      事件监听与定时器缺清理（重载泄漏）
//
// 与第一代裸正则审计的区别：检测全部走 lib/scanner.mjs 的状态机，
// 注释和字符串里的同名词不算命中（实测教训：初版 12 处命中全误报）。
//
// 可选 --guide：接入官方 upgrade-guide 交叉（与 code-scan 同源），
// 把「已移除包强 import」「旧 API 使用」映射成 resilience 建议并附官方修法，
// 实现「升级时顺带审计 + 按新版本给架构建议」。

import fs from 'node:fs'
import path from 'node:path'
import { printJson, scanSource } from './lib/scanner.mjs'
import { findSourceFiles, pickScanRoots, scanPluginFromGuideRoot } from './code-scan.mjs'

// 上游已移除或非核心、不该被普通插件强 import 的包
const RISKY_IMPORTS = new Set([
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-report',
  '@deepseek-ai/dsh-session-query',
])

const SYNC_IO_CALLS = new Set(['readFileSync', 'writeFileSync', 'appendFileSync', 'execFileSync', 'execSync'])
const READ_APIS = new Set(['readFile', 'createReadStream'])

export function auditPlugin(pluginDir, { scanResult = null } = {}) {
  const root = path.resolve(pluginDir)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`找不到 package.json: ${pkgPath}`)
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const report = {
    plugin: `${pkg.name}@${pkg.version}`,
    root,
    scores: { performance: 100, resilience: 100, contextBudget: 100, lifecycle: 100 },
    findings: [],
  }

  const deduct = (dimension, min, points) => {
    report.scores[dimension] = Math.max(min, report.scores[dimension] - points)
  }

  const roots = pickScanRoots(root)
  const files = roots.flatMap((r) => findSourceFiles(r))

  for (const file of files) {
    const rel = path.relative(root, file)
    const source = fs.readFileSync(file, 'utf8')
    const scanned = scanSource(source)

    const callNames = new Set(scanned.calls.map((c) => c.name))
    const memberNames = new Set(scanned.memberAccess.map((m) => m.member))
    const chainNames = new Set(scanned.memberAccess.map((m) => m.chain))
    const importSources = new Set(scanned.imports.map((i) => i.source))

    // 维度 1：内存与 I/O 防护
    const syncHits = [...callNames].filter((c) => SYNC_IO_CALLS.has(c))
    if (syncHits.length && !/node:test|\.test\.|tests?\/|scripts?\//.test(rel)) {
      report.findings.push({
        dimension: 'performance',
        severity: 'MEDIUM',
        file: rel,
        title: `生产代码出现同步 I/O (${syncHits.join(', ')})`,
        detail: '高频路径上的同步 I/O 会阻塞宿主事件循环，建议改异步 I/O 或移出热路径。',
      })
      deduct('performance', 60, 10)
    }

    if (chainNames.has('fs.readFile') || chainNames.has('fs.createReadStream')) {
      const hasCap = scanned.strings.some((s) => /max.*bytes|sizeLimit|byteLimit|1024\s*\*\s*1024/i.test(s.value))
      if (!hasCap) {
        report.findings.push({
          dimension: 'performance',
          severity: 'LOW',
          file: rel,
          title: '文件读取缺少显式字节上限',
          detail: '读未知来源文件时建议加 maxBytes 一类上限守卫，防止超大文件把宿主进程吃穿。',
        })
        deduct('performance', 70, 5)
      }
    }

    // 维度 2：契约弹性（强依赖已移除/非核心包）
    const risky = [...importSources].filter((s) => RISKY_IMPORTS.has(s))
    if (risky.length) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'HIGH',
        file: rel,
        title: `强 import 已移除或非核心宿主包 (${risky.join(', ')})`,
        detail: '改用 ctx.get("<service>") 弱依赖探测，服务不存在时静默降级；强依赖会在新宿主上直接装载失败。',
      })
      deduct('resilience', 50, 20)
    }

    // 维度 3：上下文常驻预算
    const registersTool = callNames.has('registerTool') || chainNames.has('tools.register') || chainNames.has('tools.add')
    if (registersTool && source.length > 30000) {
      report.findings.push({
        dimension: 'contextBudget',
        severity: 'LOW',
        file: rel,
        title: '工具注册所在文件偏大，Schema 体积值得检查',
        detail: '工具 description 会常驻每轮上下文，建议精炼；长用法说明放参考文档或按需返回。',
      })
      deduct('contextBudget', 80, 5)
    }

    // 维度 4：生命周期清理
    const hasListener = chainNames.has('event.on') || callNames.has('on') || callNames.has('setInterval') || chainNames.has('watch')
    if (hasListener) {
      const hasCleanup = memberNames.has('dispose') || callNames.has('clearInterval') || callNames.has('off') || chainNames.has('effect.dispose')
      // effect 判断走状态机（memberAccess）：注释里写 ctx.effect 不算真用了
      const usesEffect = memberNames.has('effect')
      if (!hasCleanup && !usesEffect) {
        report.findings.push({
          dimension: 'lifecycle',
          severity: 'MEDIUM',
          file: rel,
          title: '事件监听或定时器未绑定清理逻辑',
          detail: 'Cordis 插件重载时未清理的监听器与定时器会泄漏，建议注册进 ctx.effect 或提供 dispose。',
        })
        deduct('lifecycle', 65, 15)
      }
    }
  }

  // peer 范围弹性：不收 prerelease 宿主的写法在 rc/alpha 线上直接装不上
  if (pkg.peerDependencies) {
    for (const [name, range] of Object.entries(pkg.peerDependencies)) {
      if (name.startsWith('@deepseek-ai/') && !String(range).includes('-0')) {
        report.findings.push({
          dimension: 'resilience',
          severity: 'HIGH',
          file: 'package.json',
          title: `peer 范围拒绝 prerelease 宿主 (${name}: "${range}")`,
          detail: 'semver 的 ^0.2.0 不收 0.2.1-alpha.1 一类预发布版；要跟预发布线需写含 -0 放行的范围，如 ">=0.1.0-0 <0.3.0"。',
        })
        deduct('resilience', 60, 15)
      }
    }
  }

  // 新版本感知：有 code-scan 结果时交叉出「适配未完成项 + 官方修法」
  if (scanResult && typeof scanResult === 'object' && scanResult.findingCount > 0) {
    const byKind = { package: [], member: [], code: [] }
    for (const f of scanResult.findings || []) {
      ;(byKind[f.kind] || (byKind[f.kind] = [])).push(f)
    }
    if (byKind.package.length) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'HIGH',
        file: byKind.package.map((f) => f.file).join(', '),
        title: `目标版本已移除的包仍在 import (${[...new Set(byKind.package.map((f) => f.symbol))].join(', ')})`,
        detail: '官方 upgrade-guide 标记为已移除，新宿主上装载必挂；migration 字段里有官方修法。',
      })
      deduct('resilience', 50, 20)
    }
    report.versionAdvice = {
      window: scanResult.window,
      findingCount: scanResult.findingCount,
      unresolved: byKind,
      note: '这些命中是官方指南确认的破坏性变更；升级前先清零，再谈性能与架构优化。',
    }
  } else if (scanResult && typeof scanResult === 'object') {
    report.versionAdvice = { window: scanResult.window, findingCount: 0, note: '目标版本区间内无官方破坏性变更命中，可直接进入性能与架构审计。' }
  }

  report.overallScore = Math.round(
    (report.scores.performance + report.scores.resilience + report.scores.contextBudget + report.scores.lifecycle) / 4
  )
  report.scannedFiles = files.length
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2)
  const guideFlag = args.indexOf('--guide')

  // --guide 后跟 3 个位置参数（root/local/target），不能算插件目录
  const positional = (list) => list.filter((a) => !a.startsWith('--'))
  const targetDir =
    guideFlag === -1
      ? positional(args)[0] || null
      : positional(args.slice(0, guideFlag))[0] || positional(args.slice(guideFlag + 4))[0] || null

  let scanResult = null
  if (guideFlag !== -1) {
    const guideRoot = args[guideFlag + 1]
    const localVersion = args[guideFlag + 2] || null
    const targetVersion = args[guideFlag + 3] || null
    if (!guideRoot || !fs.existsSync(guideRoot)) {
      process.stderr.write('用法: node plugin-audit.mjs <plugin-dir> [--guide <guide-root> <local-ver> <target-ver>]\n')
      process.exit(1)
    }
    scanResult = scanPluginFromGuideRoot(targetDir, guideRoot, { localVersion, targetVersion })
  }

  let report
  try {
    report = auditPlugin(targetDir || process.cwd(), { scanResult })
  } catch (err) {
    process.stderr.write(`执行异常: ${err.message}\n`)
    process.exit(1)
  }
  printJson(report)

  process.stderr.write(
    `\n插件: ${report.plugin}（扫 ${report.scannedFiles} 个文件）\n` +
    `总分: ${report.overallScore}/100 — 性能 ${report.scores.performance} / 弹性 ${report.scores.resilience} / 上下文预算 ${report.scores.contextBudget} / 生命周期 ${report.scores.lifecycle}\n` +
    `发现: ${report.findings.length} 项\n` +
    (report.versionAdvice ? `版本交叉: ${report.versionAdvice.note}\n` : '')
  )
}
