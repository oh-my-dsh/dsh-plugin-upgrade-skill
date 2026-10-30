#!/usr/bin/env node
// write-gate.mjs —— 造完即验：一条命令把「造完之后」该跑的检查全跑完，出出生证报告。
//
// 编排既有四步（quick-smoke → env-doctor 启用就绪 → plugin-audit 体检 →
// code-scan 对官方指南核查），不新增任何判定逻辑。判定分层是本脚本的核心
// 设计，写死在这里不许旁路：
//
//   硬门禁（自动判红绿，fail 即退出码 1）——只有三条，全部客观可测：
//     1. entry   入口产物存在（package.json main 指向的文件在磁盘上）
//     2. smoke   内存冒烟通过（模块可加载、apply 契约可执行；--skip-smoke 跳过）
//     3. critical  code-scan 对官方指南无 critical 命中（import 了已移除的包）
//   软指标（只透传不拍板，标「人工裁量」）——audit 四维分数与 MEDIUM 清单、
//   scan 的 high/medium 命中、mockFallbacks、尚未挂载任何 profile 的事实。
//   plugin-audit 98 分还剩一条「宿主契约下同步是唯一合法写法」这类诚实保留、
//   env-doctor 的 WARN 有的是未决语义不是缺陷——这些替用户说「合格」就是把
//   裁量题伪装成判定题，本脚本宁可不判。
//
// code-scan 的指南自动发现：显式 --guide 优先；否则用本机宿主版本查
// guide-sync 的缓存（syncGuides 走既有缓存目录，零网络）；都没有就标
// skipped 并给出补法，不猜不联网。默认全流程零网络。

import path from 'node:path'
import { printJson } from './lib/scanner.mjs'
import { runQuickSmoke } from './quick-smoke.mjs'
import { probeEnvironment } from './env-doctor.mjs'
import { auditPlugin } from './plugin-audit.mjs'
import { scanPluginFromGuideRoot } from './code-scan.mjs'
import { syncGuides } from './guide-sync.mjs'

// ── 编排 ────────────────────────────────────────────────────────────────────

export async function runWriteGate(pluginDir, { guideRoot = null, localVersion = null, targetVersion = null, skipSmoke = false, detectEnv = probeEnvironment } = {}) {
  const root = path.resolve(pluginDir)
  const hardGates = []
  const discretion = []
  const skipped = []

  // 第一步：环境探测（启用就绪度 + 宿主版本，供指南发现与报告用）。
  // detectEnv 可注入：自检传 stub 控制 globalDsh，不依赖本机缓存状态。
  const env = detectEnv(root)
  const activation = env.activation
  const harnessVersion = env.globalDsh?.version || null

  hardGates.push({
    gate: 'entry',
    pass: Boolean(activation?.checked && activation.entry.ready),
    detail: activation?.checked
      ? `main=${activation.entry.file} ${activation.entry.ready ? '存在' : '不存在（先构建或生成产物）'}`
      : activation?.reason || '未检查',
  })

  // 第二步：冒烟（与 scaffold 的出生冒烟重复时用 --skip-smoke 跳过；冒烟幂等只读）
  if (skipSmoke) {
    skipped.push({ step: 'smoke', reason: '--skip-smoke：刚由 scaffold 出生冒烟过，或用户自行跳过' })
  } else {
    const smoke = await runQuickSmoke(root)
    hardGates.push({
      gate: 'smoke',
      pass: smoke.success === true,
      detail: smoke.success
        ? `${smoke.durationMs}ms，注册工具 ${smoke.registeredToolsCount} 个${smoke.registeredTools.length ? `（${smoke.registeredTools.join(', ')}）` : ''}`
        : `${smoke.stage}: ${smoke.error}`,
    })
    if (smoke.mockFallbacks?.length) {
      discretion.push({
        item: 'mock-fallbacks',
        note: '人工裁量：插件摸到 Mock 未提供的宿主面，冒烟可信度随列表变长而降低',
        data: smoke.mockFallbacks,
      })
    }
  }

  // 第三步：官方指南核查（critical 是硬门禁，high/medium 透传；指南找不到就诚实跳过）
  let scanResult = null
  let resolvedGuide = guideRoot
  let scanPair = { localVersion, targetVersion }
  if (!resolvedGuide && harnessVersion) {
    const synced = syncGuides(harnessVersion, { localClone: null })
    if (synced.root) {
      resolvedGuide = synced.root
      // 新插件的核查面是全部历史走廊（localVersion=null → 窗口过滤放行全部）：
      // 新代码不该 import 任何已被移除的包，不管它是哪个版本移除的。
      // 升级场景的 (local, target] 窄窗口语义属于 code-scan 六步，不在这里。
      scanPair = { localVersion: null, targetVersion: harnessVersion }
    }
  }
  if (resolvedGuide) {
    scanResult = scanPluginFromGuideRoot(root, resolvedGuide, scanPair)
    const sev = Object.fromEntries(scanResult.bySeverity.map(([k, v]) => [k, v]))
    hardGates.push({
      gate: 'code-scan-critical',
      pass: (sev.critical || 0) === 0,
      detail: `指南 ${scanResult.guidesConsidered} 条，命中 critical ${sev.critical || 0} / high ${sev.high || 0} / medium ${sev.medium || 0}`,
    })
    if ((sev.high || 0) + (sev.medium || 0) > 0) {
      discretion.push({
        item: 'scan-high-medium',
        note: '人工裁量：high=运行时才炸的成员访问，medium=字符串撞同名，逐条核对 evidence 再定',
        data: scanResult.findingsByGuide,
      })
    }
  } else {
    skipped.push({
      step: 'code-scan',
      reason: `未提供 --guide 且指南缓存里没有本机宿主 dsh-v${harnessVersion || '?'} 的指南；跑 guide-sync --clone 后重跑可补`,
    })
  }

  // 第四步：四维体检（纯软指标，分数与清单原样透传）
  const audit = auditPlugin(root, scanResult ? { scanResult } : {})
  discretion.push({
    item: 'audit-scores',
    note: '人工裁量：四维分数与 MEDIUM 清单照抄自 plugin-audit，本脚本不设及格线',
    data: { scores: audit.scores, findings: audit.findings },
  })

  // 尚未挂载任何 profile 是「造完还没装」的常态，报事实不判红
  if (activation?.checked && (activation.perProfile?.length === 0 || activation.perProfile.every((p) => !p.registered))) {
    discretion.push({
      item: 'not-installed',
      note: '事实：本机 profiles 的 cordis.patch.yml 均未提及本插件（还没装，不是缺陷）',
      data: null,
    })
  }
  if (activation?.pendingRisks?.length) {
    discretion.push({
      item: 'pending-risks',
      note: '人工裁量：强注入的服务在该 profile 无提供方特征（Cordis 静默 pending），env-doctor 的判定原样透传',
      data: activation.pendingRisks,
    })
  }

  const verdict = hardGates.every((g) => g.pass) ? 'pass' : 'fail'
  return {
    plugin: root,
    harnessVersion,
    guideRoot: resolvedGuide,
    verdict,
    hardGates,
    discretion,
    skipped,
    caveat: '硬门禁仅三条（entry/smoke/critical），pass 不等于插件合格；软指标全部在 discretion 区待人工裁量',
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--guide') {
      flags.guide = argv[++i]
      // 惯例与 code-scan 对齐：<guide-root> [local-version] [target-version]
      flags.localVersion = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : null
      flags.targetVersion = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : null
    } else if (arg === '--skip-smoke') {
      flags.skipSmoke = true
    } else if (arg.startsWith('--')) {
      throw new Error(`未知参数「${arg}」，支持 --guide/--skip-smoke`)
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { positional, flags } = parseArgv(process.argv.slice(2))
  if (!positional.length) {
    process.stderr.write('用法: node scripts/write-gate.mjs <插件目录> [--guide <guide-root> [本机版本 目标版本]] [--skip-smoke]\n')
    process.exit(2)
  }
  runWriteGate(positional[0], {
    guideRoot: flags.guide || null,
    localVersion: flags.localVersion || null,
    targetVersion: flags.targetVersion || null,
    skipSmoke: flags.skipSmoke === true,
  })
    .then((result) => {
      printJson(result)
      process.stderr.write(`\n[出生证] ${result.plugin}\n`)
      process.stderr.write(`判定: ${result.verdict === 'pass' ? '硬门禁全过' : '硬门禁有 fail'}\n`)
      for (const g of result.hardGates) {
        process.stderr.write(`  门禁 ${g.gate}: ${g.pass ? '通过' : '未过'}——${g.detail}\n`)
      }
      for (const s of result.skipped) {
        process.stderr.write(`  跳过 ${s.step}: ${s.reason}\n`)
      }
      for (const d of result.discretion) {
        process.stderr.write(`  裁量 ${d.item}: ${d.note}\n`)
      }
      process.stderr.write(`边界: ${result.caveat}\n`)
      process.exit(result.verdict === 'pass' ? 0 : 1)
    })
    .catch((err) => {
      process.stderr.write(`失败: ${err.stack || err.message}\n`)
      process.exit(1)
    })
}
