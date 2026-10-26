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
import { printJson, scanSource, satisfiesRange, packageBase, parseVersion, isDshHostPackage, isPluginForm } from './lib/scanner.mjs'
import { findSourceFiles, pickScanRoots, scanPluginFromGuideRoot } from './code-scan.mjs'
import { findGlobalDsh } from './env-doctor.mjs'

// 上游已移除或非核心、不该被普通插件强 import 的包
const RISKY_IMPORTS = new Set([
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-report',
  '@deepseek-ai/dsh-session-query',
])

const SYNC_IO_CALLS = new Set(['readFileSync', 'writeFileSync', 'appendFileSync', 'execFileSync', 'execSync'])
const READ_APIS = new Set(['readFile', 'createReadStream'])

// 宿主安装目录的 lib 全文（懒加载，一次进程只读一遍）。
// 描述漂移检查用：约定字符串在宿主代码里零命中 → 可能是消亡约定。
// 探测不到宿主或读取失败返回 null（检查静默跳过，不阻塞审计）。
let hostLibTextCache = null
let hostLibTextResolved = false
function getHostLibText() {
  if (hostLibTextResolved) return hostLibTextCache
  hostLibTextResolved = true
  try {
    const host = findGlobalDsh()
    const libDir = host?.location ? path.join(host.location, 'lib') : null
    if (!libDir || !fs.existsSync(libDir)) return (hostLibTextCache = null)
    const parts = []
    let total = 0
    for (const entry of fs.readdirSync(libDir)) {
      if (!entry.endsWith('.js')) continue
      const text = fs.readFileSync(path.join(libDir, entry), 'utf8')
      total += text.length
      if (total > 32 * 1024 * 1024) break // 超大宿主按已读部分判断，避免无界读取
      parts.push(text)
    }
    return (hostLibTextCache = parts.join('\n'))
  } catch {
    return (hostLibTextCache = null)
  }
}

// 宿主版本线只跟随 @deepseek-ai/dsh 及其 dsh-* 套件子包；同 scope 的库
// （@deepseek-ai/schemastery、@deepseek-ai/cordis）有自己的版本线，
// 拿宿主版本去套它们的 peer 范围会给出「^0.2.1-rc.3」这种错到离谱的建议。
// 谓词本体在 lib/scanner.mjs（isDshHostPackage），run.mjs 的窗口计算同源复用。

// peer 修补建议：对每个不含目标宿主的 peer 范围，给出「与目标同三元组的 caret 线」
// 替换写法，且必须先用 satisfiesRange 自验证覆盖目标——验证不过的写法不给
// （旧版推荐的 ">=x.y.z-0" 全收写法就是被自家 tuple 规则证伪的）。
// 只做「生成」，不自动改包：改用户 package.json 是不可逆写，留给用户确认后落。
export function peerPatchFor(pkg, targetVersion) {
  if (!targetVersion || !pkg?.peerDependencies) return []
  const patches = []
  for (const [name, range] of Object.entries(pkg.peerDependencies)) {
    const r = String(range)
    if (!isDshHostPackage(name) || r.includes('*')) continue
    if (satisfiesRange(targetVersion, r)) continue
    const pv = parseVersion(targetVersion)
    const candidate = pv.pre
      ? `^${pv.major}.${pv.minor}.${pv.patch}-${pv.pre}`
      : `^${pv.major}.${pv.minor}.${pv.patch}`
    if (!satisfiesRange(targetVersion, candidate)) continue
    patches.push({ package: name, from: r, to: candidate, verified: true })
  }
  return patches
}

export function auditPlugin(pluginDir, { scanResult = null, targetVersion = null, hostLibText = undefined } = {}) {
  const root = path.resolve(pluginDir)
  const pkgPath = path.join(root, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`找不到 package.json: ${pkgPath}`)
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  // 目标形态：插件形态才适用 Cordis 生命周期规则；纯工具仓（如本工具自审）
  // 被 Cordis 规则扫会产出「对普通脚本建议 ctx.effect」一类形态错配的噪音。
  const pluginForm = isPluginForm(pkg)
  const report = {
    plugin: `${pkg.name}@${pkg.version}`,
    root,
    targetForm: pluginForm ? 'plugin' : 'tool',
    scores: { performance: 100, resilience: 100, contextBudget: 100, lifecycle: 100 },
    findings: [],
  }

  const deduct = (dimension, min, points) => {
    report.scores[dimension] = Math.max(min, report.scores[dimension] - points)
  }

  const roots = pickScanRoots(root)
  const files = roots.flatMap((r) => findSourceFiles(r))
  const hostLibTextResolved = hostLibText !== undefined ? hostLibText : getHostLibText()

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
    // import type 是纯编译期引用（scanner 已标 kind），运行时零依赖——
    // 「装载必炸」只对 value import 成立，type 引用最多报 info 提示编译期风险。
    const isValueImport = (imp) => imp.kind !== 'type'
    const risky = [...importSources.values()].filter((s) => {
      if (!RISKY_IMPORTS.has(s) && !RISKY_IMPORTS.has(packageBase(s))) return false
      return scanned.imports.some((imp) => imp.source === s && isValueImport(imp))
    })
    const riskyTypeOnly = [...importSources.values()].filter((s) => {
      if (!RISKY_IMPORTS.has(s) && !RISKY_IMPORTS.has(packageBase(s))) return false
      return !risky.includes(s)
    })
    if (risky.length) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'HIGH',
        file: rel,
        title: `强 import 已移除或非核心宿主包 (${risky.join(', ')})`,
        detail: '改用 ctx.get("<service>") 弱依赖探测，服务不存在时静默降级；强依赖会在新宿主上直接装载失败。',
      })
      deduct('resilience', 50, 20)
    } else if (riskyTypeOnly.length) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'INFO',
        file: rel,
        title: `类型引用已移除或非核心宿主包 (${riskyTypeOnly.join(', ')})`,
        detail: 'import type 不参与运行时装载，不会让插件挂掉；但宿主删掉类型导出后 tsc 会红，跟进宿主时顺手把类型改为本地声明或弱类型。',
      })
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

    // 描述漂移提示（2026-10-25 实测新增，INFO 不扣分）：
    // 工具描述里写的宿主路径约定（如 .dsh-filess/...）若在宿主安装目录全文零命中，
    // 很可能是旧版宿主消亡的约定——模型照它传参会全线失败（taxue-dsh-artisan 实测）。
    // 只认「后面跟 / 的路径形约定」：.dsh- 前缀同时是生态通用的 CSS 类名前缀
    // （.dsh-ta-card 一类），无斜杠即收会把插件自己的样式名全误报进来。
    // 宿主可能把约定放在文档层而非代码，所以只提示、要人工确认。
    const conventions = new Set()
    for (const s of scanned.strings) {
      for (const m of s.value.matchAll(/\.dsh-[a-z][\w-]*(?=\/)/g)) conventions.add(m[0])
    }
    if (conventions.size > 0 && hostLibTextResolved !== null) {
      for (const conv of conventions) {
        if (!hostLibTextResolved.includes(conv)) {
          report.findings.push({
            dimension: 'resilience',
            severity: 'INFO',
            file: rel,
            title: `工具描述里的宿主路径约定 ${conv} 在宿主代码零命中`,
            detail: '可能是旧版宿主消亡的约定（照它行动会失败），也可能约定写在宿主文档/指令层而非代码；请到官方仓库或实际宿主确认后再决定改不改描述。',
          })
        }
      }
    }

    // 维度 4：生命周期清理（只对插件形态：重载泄漏是 Cordis 宿主语义）
    const hasListener = chainNames.has('event.on') || callNames.has('on') || callNames.has('setInterval') || chainNames.has('watch')
    if (pluginForm && hasListener) {
      // clearTimeout 与 clearInterval 同样是清理标记：白描插件实测，
      // 子进程超时定时器经 finish() 收口 clearTimeout，旧标记表漏了它仍被报
      const hasCleanup =
        memberNames.has('dispose') || callNames.has('clearInterval') || callNames.has('clearTimeout') || callNames.has('off') || chainNames.has('effect.dispose')
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

  // peer 范围核查（2026-10-25 实测复盘重写）。
  // 旧启发式看「范围里有没有 -0」就报 HIGH，但它推荐的 ">=0.1.0-0 <0.3.0"
  // 按真实 semver 根本收不下 0.2.1-rc.3（prerelease tuple 规则），建议自证其误。
  // 现在的做法：拿到目标宿主版本后用 satisfiesRange 真算——
  //   覆盖了        → 不报（写法看着再怪也不是问题）
  //   没覆盖        → INFO（本生态 bundle 安装不跑 npm peer 解析，官方插件自己的
  //                    范围在严格 semver 下同样收不下 rc 线宿主，这是声明性约定；
  //                    只提示「声明与事实不符」，不扣分），建议先经 satisfiesRange
  //                    自验证再输出，验证不过的写法不给
  //   拿不到 target → 不报（无法判定，宁可沉默不伪造）
  const targetVersionResolved = targetVersion || scanResult?.window?.targetVersion || null
  if (targetVersionResolved && pkg.peerDependencies) {
    const mismatches = []
    let suggested = null
    for (const [name, range] of Object.entries(pkg.peerDependencies)) {
      const r = String(range)
      if (!isDshHostPackage(name) || r.includes('*')) continue
      if (satisfiesRange(targetVersionResolved, r)) continue
      if (suggested === null) {
        // 自验证建议：给出「与目标同三元组的 caret 线」写法，先算再给——
        // 验证不过的写法不给（旧版推荐的 -0 全收写法就是在这里被自家 tuple 知识证伪的）。
        const pv = parseVersion(targetVersionResolved)
        const candidate = pv.pre
          ? `^${pv.major}.${pv.minor}.${pv.patch}-${pv.pre}`
          : `^${pv.major}.${pv.minor}.${pv.patch}`
        if (satisfiesRange(targetVersionResolved, candidate)) suggested = candidate
      }
      mismatches.push(`${name}: "${r}"`)
    }
    if (mismatches.length > 0) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'INFO',
        file: 'package.json',
        title: `${String(mismatches.length)} 个 peer 窗口按严格 semver 不含目标宿主 ${targetVersionResolved}`,
        detail:
          `${mismatches.join('、')}——satisfiesRange("${targetVersionResolved}", 范围) = false，prerelease tuple 规则要求版本与某个带 prerelease 的比较器同三元组。` +
          `本生态 bundle 安装不强制 peer（官方插件自己的范围同样收不下 rc 线宿主），此为声明性提示不扣分。` +
          (suggested
            ? `要精确声明支持线可写 "${suggested}"（已用 satisfiesRange 验证可覆盖 ${targetVersionResolved}）；多代宿主并行走 || 列举，官方惯例见 dsh-plugin-subscriptions。`
            : '未能构造出可验证的替代写法，请人工核对官方插件声明。'),
      })
    }
  }

  // 新版本感知：有 code-scan 结果时交叉出「适配未完成项 + 官方修法」。
  // package 命中若已被宿主实测判为 host-present（包还在），「装载必炸」不成立，
  // 不再按 HIGH 扣分——只把真正 absent/unknown 的当确认项。
  if (scanResult && typeof scanResult === 'object' && scanResult.findingCount > 0) {
    const byKind = { package: [], member: [], code: [] }
    for (const f of scanResult.findings || []) {
      ;(byKind[f.kind] || (byKind[f.kind] = [])).push(f)
    }
    const confirmedPackages = byKind.package.filter((f) => f.verified !== 'host-present')
    const refutedPackages = byKind.package.length - confirmedPackages.length
    if (confirmedPackages.length) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'HIGH',
        file: confirmedPackages.map((f) => f.file).join(', '),
        title: `目标版本已移除的包仍在 import (${[...new Set(confirmedPackages.map((f) => f.symbol))].join(', ')})`,
        detail: '官方 upgrade-guide 声称移除且宿主实测不存在（或无法核实时按声明处理）；migration 字段里有官方修法。',
      })
      deduct('resilience', 50, 20)
    }
    if (refutedPackages > 0) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'INFO',
        file: byKind.package.filter((f) => f.verified === 'host-present').map((f) => f.file).join(', '),
        title: `${String(refutedPackages)} 个包命中经宿主实测证伪（包仍在宿主，guide 只是提及）`,
        detail: '已降级为 info，不扣分；详情见 code-scan 的 verificationNote，建议人工核对 guide 原文的变更主体。',
      })
    }
    report.versionAdvice = {
      window: scanResult.window,
      findingCount: scanResult.findingCount,
      unresolved: byKind,
      note: '命中是官方指南锚点；package 类已叠加宿主实测核查（host-present 证伪项降级 info）。',
    }
  } else if (scanResult && typeof scanResult === 'object') {
    report.versionAdvice = { window: scanResult.window, findingCount: 0, note: '目标版本区间内无官方破坏性变更命中，可直接进入性能与架构审计。' }
  }

  report.overallScore = Math.round(
    (report.scores.performance + report.scores.resilience + report.scores.contextBudget + report.scores.lifecycle) / 4
  )
  report.scannedFiles = files.length
  report.peerPatch = peerPatchFor(pkg, targetVersionResolved)
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2)
  const guideFlag = args.indexOf('--guide')
  const peerPatchFlag = args.includes('--peer-patch')

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

  if (peerPatchFlag) {
    if (!report.peerPatch.length) {
      process.stderr.write('\npeer 修补: 无需改动（所有范围都已覆盖目标宿主）\n')
    } else {
      process.stderr.write('\npeer 修补（已用 satisfiesRange 自验证，人工确认后改 package.json）:\n')
      for (const p of report.peerPatch) {
        process.stderr.write(`  ${p.package}: "${p.from}" → "${p.to}"\n`)
      }
    }
  }

  process.stderr.write(
    `\n插件: ${report.plugin}（扫 ${report.scannedFiles} 个文件）\n` +
    `总分: ${report.overallScore}/100 — 性能 ${report.scores.performance} / 弹性 ${report.scores.resilience} / 上下文预算 ${report.scores.contextBudget} / 生命周期 ${report.scores.lifecycle}\n` +
    (report.targetForm === 'tool' ? '形态: 工具仓（无生态依赖）——生命周期维度按 Cordis 插件语义不适用，未检查\n' : '') +
    `发现: ${report.findings.length} 项\n` +
    (report.versionAdvice ? `版本交叉: ${report.versionAdvice.note}\n` : '')
  )
}
