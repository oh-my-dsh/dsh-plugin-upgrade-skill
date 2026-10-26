#!/usr/bin/env node
// env-heal.mjs —— 覆盖层旧包自愈。
//
// 起因是 issue #263 那一类事故：DSH 宿主升级后，profiles 覆盖层里残留旧包，
// 宿主只更新主安装不刷覆盖层，旧包优先解析导致运行时装载冲突。
//
// 安全姿态：
//   - 默认 dry-run，只报告不动手
//   - 真要动手就把包「移动」到回收站，不删除
//   - 移动后必须提示重启宿主，只换文件不重载无效（issue #263 的实测结论）

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { printJson } from './lib/scanner.mjs'
import { probeEnvironment } from './env-doctor.mjs'

const DSH_DIR = path.join(os.homedir(), '.dsh')

function trashDir() {
  const stamp = new Date().toISOString().slice(0, 10)
  return path.join(DSH_DIR, '.trash', stamp)
}

export function healOverlays({ dryRun = true } = {}) {
  const report = probeEnvironment(process.cwd())
  const findings = report.overlayFindings

  const actions = []
  for (const f of findings) {
    if (f.severity !== 'critical') continue
    const dest = path.join(trashDir(), f.profile, path.basename(f.path))
    actions.push({ from: f.path, to: dest, package: f.package, version: f.version, dryRun })
  }

  if (!dryRun) {
    for (const action of actions) {
      fs.mkdirSync(path.dirname(action.to), { recursive: true })
      fs.renameSync(action.from, action.to)
    }
  }

  return {
    mode: dryRun ? 'dry-run' : 'healed',
    findings: findings.length,
    criticalCount: findings.filter((f) => f.severity === 'critical').length,
    moved: actions.length,
    actions,
    nextStep: actions.length
      ? '覆盖层已清理。必须完全退出并重启 DSH 宿主，只换文件不重载时内存里的旧投影仍在。'
      : '没有需要处理的 critical 覆盖层包。',
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const apply = process.argv.includes('--apply')
  const result = healOverlays({ dryRun: !apply })
  printJson(result)

  process.stderr.write(
    `\n模式: ${result.mode}\n` +
    `覆盖层问题: ${result.findings} 处（critical ${result.criticalCount}）\n` +
    `已处理: ${result.moved}\n` +
    `${result.nextStep}\n`
  )
  if (!apply && result.moved) {
    process.stderr.write('\n这是 dry-run。加 --apply 才会真的移动文件。\n')
  }
}
