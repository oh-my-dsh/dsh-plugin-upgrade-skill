#!/usr/bin/env node
// code-scan.mjs —— 第 4 步：查本机插件踩了哪些官方破坏性变更。
//
// 输入：插件目录 + 官方指南锚点表
// 输出：命中清单（文件:行 + 命中的符号 + 官方修复动作）
//
// 匹配三类锚点，全部来自官方 guide，不写死任何规则：
//   包名   —— 插件 import 了 guide 提到的已移除/已改名包
//   成员   —— 插件调用了 guide 提到的已移除方法或字段
//   常量   —— 插件字符串里出现 guide 提到的错误码/事件名

import fs from 'node:fs'
import path from 'node:path'
import { printJson, scanSource, isDshPackage, compareVersions, packageBase } from './lib/scanner.mjs'
import { loadGuides, listGuideVersions } from './lib/guide-parser.mjs'
import { findGlobalDsh } from './env-doctor.mjs'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.trash', 'coverage'])
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

export function findSourceFiles(root, { maxDepth = 6 } = {}) {
  const out = []
  const walk = (dir, depth) => {
    if (depth > maxDepth) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (SOURCE_EXT.has(path.extname(entry.name))) out.push(full)
    }
  }
  walk(root, 0)
  return out
}

// 源码根并集：src 优先（client/web 常嵌在 src 内部），同级的 client/web/ui 一并扫。
// lib/dist 是构建产物，与 src 同义——同时扫会把同一处命中按两份文件重复报，
// 所以只在没有任何源码根时才退回构建产物（无 src 的纯构建插件）。
const SOURCE_ROOTS = ['src', 'client', 'web', 'ui']
const BUILD_ROOTS = ['lib', 'dist']

export function pickScanRoots(pluginDir) {
  const sources = SOURCE_ROOTS.map((dir) => path.join(pluginDir, dir)).filter((full) => fs.existsSync(full))
  if (sources.length > 0) return sources
  const builds = BUILD_ROOTS.map((dir) => path.join(pluginDir, dir)).filter((full) => fs.existsSync(full))
  return builds.length > 0 ? builds : [pluginDir]
}

// 锚点 a.b 是否匹配插件里的 x.y：
//   末段必须相同，且对象部分互为后缀。
// 这样 engines.dsh 不会匹配到 result.dsh（对象不同），
// 但 sessionTitle.register 能匹配 ctx.sessionTitle.register（长对象以短对象结尾）。
export function anchorMatches(anchor, dotted) {
  if (dotted === anchor) return true
  const aParts = anchor.split('.')
  const dParts = dotted.split('.')
  if (aParts.length < 2 || dParts.length < 2) return false

  const aLast = aParts[aParts.length - 1]
  const dLast = dParts[dParts.length - 1]
  if (aLast !== dLast) return false
  if (aLast.length < 6) return false

  const aObj = aParts.slice(0, -1).join('.')
  const dObj = dParts.slice(0, -1).join('.')
  return dObj === aObj || dObj.endsWith(`.${aObj}`) || aObj.endsWith(`.${dObj}`)
}

// 预解析锚点：把 split 和末段长度判断提前做掉。
// 匹配逻辑与 anchorMatches 完全一致，只是不再每对重复 split。
function prepareAnchor(anchor) {
  const parts = anchor.split('.')
  const last = parts[parts.length - 1]
  return { anchor, last, obj: parts.slice(0, -1).join('.'), multi: parts.length >= 2, short: last.length < 6 }
}

function preparedAnchorMatches(prep, dotted) {
  if (dotted === prep.anchor) return true
  if (!prep.multi) return false
  const dParts = dotted.split('.')
  if (dParts.length < 2) return false
  if (dParts[dParts.length - 1] !== prep.last) return false
  if (prep.short) return false
  const dObj = dParts.slice(0, -1).join('.')
  return dObj === prep.obj || dObj.endsWith(`.${prep.obj}`) || prep.obj.endsWith(`.${dObj}`)
}

// 该锚点是否已被 guide 标为「新符号」（即迁移目标）。
// 是则说明插件若用到它，代表已经适配，不该报。
function isIntroduced(introduced, anchor) {
  if (!introduced.size) return false
  if (introduced.has(anchor)) return true
  const last = anchor.split('.').pop()
  for (const sym of introduced) {
    if (sym === last || sym.endsWith(`.${last}`)) return true
  }
  return false
}

// 从 guide 的 Migration 段落里挑出和命中符号最相关的一两条
export function pickMigrationSteps(guide, symbol) {
  if (!guide.migration) return []
  const steps = guide.migration.split(/\n\s*\d+\.\s+/).map((s) => s.trim()).filter(Boolean)
  const needle = symbol.toLowerCase()
  const scored = steps
    .map((step, index) => {
      const lower = step.toLowerCase()
      let score = 0
      if (lower.includes(needle)) score += 2
      for (const pkg of guide.anchors.packages) {
        if (lower.includes(pkg.toLowerCase())) score += 1
      }
      return { step, index: index + 1, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, 2).map((s) => `步骤 ${s.index}: ${s.step.replace(/\s+/g, ' ').slice(0, 400)}`)
}

// 命中分级（对齐 plugin-audit 的扣分语言，先修排前面的）：
//   critical = package，import 已移除/已改名包，装载必炸
//   high     = member，调用已移除方法或字段，运行时才炸
//   medium   = code，字符串里出现已变更的错误码/事件名，最可能撞同名
const SEVERITY_BY_KIND = { package: 'critical', member: 'high', code: 'medium' }
const KIND_ORDER = { package: 0, member: 1, code: 2 }

// ── 宿主实测核查（2026-10-25 实测复盘新增）──────────────────────────────────
// guide 的「移除」是文本启发式，包到底还在不在，目标宿主的 node_modules 是一手事实。
// taxue-dsh-artisan 实测教训：滞后扫描器把 tool-presentation-mode 报成
// critical「已移除包仍在 import」，而 @deepseek-ai/dsh-tools 在 rc.3 宿主里活得好好的。
//   host-absent   → guide 声称移除且宿主确实没有 → 维持 critical，标注已实测
//   host-present  → 宿主里还在 → 「装载必炸」不成立，降级 info 留给人工核对
//   unknown       → 探测不到宿主安装位 → 不改分级，标未核查（不伪造结论）
export function verifyPackagesAgainstHost(findings, hostInfo = null) {
  const scope =
    hostInfo?.location !== null && hostInfo?.location !== undefined
      ? path.dirname(path.dirname(hostInfo.location)) // …/node_modules/@deepseek-ai/dsh → …/node_modules
      : null
  let checked = 0
  let downgraded = 0
  const verified = findings.map((finding) => {
    if (finding.kind !== 'package') return finding
    const pkg = packageBase(finding.symbol)
    let status = 'unknown'
    if (scope !== null) {
      checked++
      status = fs.existsSync(path.join(scope, pkg, 'package.json')) ? 'host-present' : 'host-absent'
    }
    if (status === 'host-present') {
      downgraded++
      return {
        ...finding,
        severity: 'info',
        verified: status,
        verificationNote: `实测：${pkg} 仍存在于目标宿主安装目录，guide 只是提及并非移除，「装载必炸」不成立。请核对 guide 原文确认真正的变更主体（如配置取值、某方法的行为）。`,
      }
    }
    return { ...finding, verified: status, ...(status === 'host-absent' ? { verificationNote: `实测：${pkg} 在目标宿主安装目录不存在，与 guide 声称一致。` } : {}) }
  })
  return { findings: verified, checked, downgraded }
}

export function scanPlugin(pluginDir, guides, { localVersion = null, targetVersion = null, hostInfo = undefined, verifyHost = true } = {}) {
  const roots = pickScanRoots(pluginDir)
  const files = roots.flatMap((r) => findSourceFiles(r))

  // 只保留「本机版本 → 目标版本」区间内的 guide；没有版本信息就全用
  const relevant = guides.filter((g) => {
    if (!localVersion || !targetVersion) return true
    if (compareVersions(g.version, localVersion) <= 0) return false
    if (compareVersions(g.version, targetVersion) > 0) return false
    return true
  })

  // guide 侧的过滤与锚点预解析只做一次，不随文件数翻倍。
  // 成员锚点按末段分桶：一个成员命中只查自己末段那一桶，
  // 不再对全部锚点做线性扫描（大仓库实测从 23s 降到 1-2s）。
  const guideIndex = relevant.map((guide) => {
    const introduced = new Set(guide.anchors.introduced || [])
    const members = guide.anchors.members.filter((a) => !isIntroduced(introduced, a))
    const codes = guide.anchors.codes.filter((a) => !isIntroduced(introduced, a))

    const memberBuckets = new Map()
    for (const anchor of members) {
      const prep = prepareAnchor(anchor)
      if (!memberBuckets.has(prep.last)) memberBuckets.set(prep.last, [])
      memberBuckets.get(prep.last).push(prep)
    }

    return { guide, memberBuckets, codes }
  })

  const findings = []
  let scannedFiles = 0
  let scannedLines = 0

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    scannedFiles++
    scannedLines += source.split('\n').length
    const sourceLines = source.split('\n')

    // witnesses 式最小复现：命中行原文（trim 后截 160 字符），
    // 报告自含上下文，核对「是不是误报」不用再开文件。
    const evidenceOf = (line) => {
      const text = sourceLines[line - 1]
      if (text === undefined) return null
      const trimmed = text.trim()
      return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed || null
    }

    const scanned = scanSource(source)
    const relFile = path.relative(pluginDir, file)

    // 成员命中：成员访问和裸调用都算（installBundle(...) 是调用不是 a.b 形式）。
    // 清单与 guide 无关，提到指南循环外只构造一次。
    const memberHits = [
      ...scanned.memberAccess.map((m) => ({ name: m.member, dotted: `${m.object}.${m.member}`, line: m.line })),
      ...scanned.calls.map((c) => ({ name: c.name, dotted: c.name, line: c.line })),
    ]

    for (const { guide, memberBuckets, codes } of guideIndex) {
      // 包名命中：只认「等于锚点」或「锚点的子路径」。
      // 不做反向前缀（pkg.startsWith(imp.source)）：官方包名全以 @deepseek-ai/dsh
      // 开头，import 主包 @deepseek-ai/dsh 会因此撞上已移除的 dsh-settings 一类
      // 兄弟包，把没踩雷的插件报成 critical（2026-10-24 复现后去掉）。
      for (const imp of scanned.imports) {
        for (const pkg of guide.anchors.packages) {
          if (imp.source === pkg || imp.source.startsWith(`${pkg}/`)) {
            findings.push({
              file: relFile,
              line: imp.line,
              symbol: imp.source,
              kind: 'package',
              severity: SEVERITY_BY_KIND.package,
              evidence: evidenceOf(imp.line),
              guide: `${guide.version}/${guide.topic}`,
              guideFile: guide.guideFile ?? null,
              guideLine: guide.titleLine ?? null,
              title: guide.title,
              migration: pickMigrationSteps(guide, pkg),
            })
          }
        }
      }

      for (const hit of memberHits) {
        const bucket = memberBuckets.get(hit.name)
        if (!bucket) continue
        for (const prep of bucket) {
          if (preparedAnchorMatches(prep, hit.dotted)) {
            findings.push({
              file: relFile,
              line: hit.line,
              symbol: hit.dotted,
              kind: 'member',
              severity: SEVERITY_BY_KIND.member,
              evidence: evidenceOf(hit.line),
              guide: `${guide.version}/${guide.topic}`,
              guideFile: guide.guideFile ?? null,
              guideLine: guide.titleLine ?? null,
              title: guide.title,
              migration: pickMigrationSteps(guide, hit.name),
            })
          }
        }
      }

      // 常量命中（错误码一类，落在字符串里）
      for (const code of codes) {
        for (const str of scanned.strings) {
          if (str.value.includes(code)) {
            findings.push({
              file: relFile,
              line: str.line,
              symbol: code,
              kind: 'code',
              severity: SEVERITY_BY_KIND.code,
              evidence: evidenceOf(str.line),
              guide: `${guide.version}/${guide.topic}`,
              guideFile: guide.guideFile ?? null,
              guideLine: guide.titleLine ?? null,
              title: guide.title,
              migration: pickMigrationSteps(guide, code),
            })
          }
        }
      }
    }
  }

  // 去重：同一文件同一行同一符号只报一次
  const seen = new Set()
  const unique = findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.symbol}:${f.guide}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 宿主实测：只对 package 命中核查，present 降级 info（装载必炸不成立）
  const resolvedHost = hostInfo === undefined ? findGlobalDsh() : hostInfo
  const hostVerification = verifyHost
    ? verifyPackagesAgainstHost(unique, resolvedHost)
    : { findings: unique, checked: 0, downgraded: 0 }

  const byGuide = new Map()
  for (const f of hostVerification.findings) {
    if (!byGuide.has(f.guide)) byGuide.set(f.guide, [])
    byGuide.get(f.guide).push(f)
  }

  return {
    pluginDir: path.resolve(pluginDir),
    scanRoots: roots.map((r) => path.relative(pluginDir, r) || '.'),
    scannedFiles,
    scannedLines,
    guideVersionsAvailable: [...new Set(guides.map((g) => g.version))].sort(compareVersions),
    guidesConsidered: relevant.length,
    window: { localVersion, targetVersion },
    hostVerification: {
      host: resolvedHost ? { version: resolvedHost.version, source: resolvedHost.source } : null,
      packagesChecked: hostVerification.checked,
      downgradedToInfo: hostVerification.downgraded,
    },
    findingCount: hostVerification.findings.length,
    bySeverity: Object.entries(
      hostVerification.findings.reduce((acc, f) => ((acc[f.severity] = (acc[f.severity] || 0) + 1), acc), {})
    ),
    findingsByGuide: Object.fromEntries([...byGuide.entries()].sort()),
    // 先按 severity（package > member > code），同级别内按文件与行号
    findings: hostVerification.findings.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.file.localeCompare(b.file) ||
        a.line - b.line
    ),
  }
}

export function scanPluginFromGuideRoot(pluginDir, guideRoot, options = {}) {
  const versions = listGuideVersions(guideRoot)
  const guides = versions.flatMap((v) => loadGuides(guideRoot, v))
  return scanPlugin(pluginDir, guides, options)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const pluginDir = process.argv[2] || process.cwd()
  const guideRoot = process.argv[3]
  const localVersion = process.argv[4] || null
  const targetVersion = process.argv[5] || null

  if (!guideRoot || !fs.existsSync(path.join(guideRoot))) {
    process.stderr.write('用法: node code-scan.mjs <plugin-dir> <guide-root> [local-version] [target-version]\n')
    process.stderr.write('  guide-root 是官方 upgrade-guide 目录，例如 harness clone 里的 docs/upgrade-guide\n')
    process.exit(1)
  }

  const result = scanPluginFromGuideRoot(pluginDir, guideRoot, { localVersion, targetVersion })
  printJson(result)

  const sev = Object.fromEntries(result.bySeverity.map(([k, v]) => [k, v]))
  process.stderr.write(
    `\n扫描 ${result.scannedFiles} 个文件 / ${result.scannedLines} 行\n` +
    `参考指南版本: ${result.guideVersionsAvailable.join(', ') || '无'}\n` +
    `纳入考虑的 guide 条目: ${result.guidesConsidered}\n` +
    `命中: ${result.findingCount} 处（critical(package) ${sev.critical || 0} / high(member) ${sev.high || 0} / medium(code) ${sev.medium || 0} / info ${sev.info || 0}），涉及 ${Object.keys(result.findingsByGuide).length} 条官方变更\n` +
    `宿主实测: 核查 ${result.hostVerification.packagesChecked} 个包命中，${result.hostVerification.downgradedToInfo} 个因包仍在宿主降级为 info\n`
  )
}
