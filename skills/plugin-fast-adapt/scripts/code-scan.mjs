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
import { printJson, scanSource, isDshPackage, compareVersions } from './lib/scanner.mjs'
import { loadGuides, listGuideVersions } from './lib/guide-parser.mjs'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.trash', 'coverage'])
const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

function findSourceFiles(root, { maxDepth = 6 } = {}) {
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

// 优先扫 src/，没有再扫 lib/，都没有才全仓
function pickScanRoots(pluginDir) {
  const src = path.join(pluginDir, 'src')
  if (fs.existsSync(src)) return [src]
  const lib = path.join(pluginDir, 'lib')
  if (fs.existsSync(lib)) return [lib]
  return [pluginDir]
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
function pickMigrationSteps(guide, symbol) {
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

export function scanPlugin(pluginDir, guides, { localVersion = null, targetVersion = null } = {}) {
  const roots = pickScanRoots(pluginDir)
  const files = roots.flatMap((r) => findSourceFiles(r))

  // 只保留「本机版本 → 目标版本」区间内的 guide；没有版本信息就全用
  const relevant = guides.filter((g) => {
    if (!localVersion || !targetVersion) return true
    if (compareVersions(g.version, localVersion) <= 0) return false
    if (compareVersions(g.version, targetVersion) > 0) return false
    return true
  })

  const findings = []
  let scannedFiles = 0
  let scannedLines = 0

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    scannedFiles++
    scannedLines += source.split('\n').length

    const scanned = scanSource(source)
    const relFile = path.relative(pluginDir, file)

    for (const guide of relevant) {
      // 插件用了新符号说明已经适配过，从锚点表里剔除，避免报「已适配」的噪音
      const introduced = new Set(guide.anchors.introduced || [])
      const members = guide.anchors.members.filter((a) => !isIntroduced(introduced, a))
      const codes = guide.anchors.codes.filter((a) => !isIntroduced(introduced, a))

      // 包名命中
      for (const imp of scanned.imports) {
        for (const pkg of guide.anchors.packages) {
          if (imp.source === pkg || imp.source.startsWith(`${pkg}/`) || pkg.startsWith(imp.source)) {
            findings.push({
              file: relFile,
              line: imp.line,
              symbol: imp.source,
              kind: 'package',
              guide: `${guide.version}/${guide.topic}`,
              title: guide.title,
              migration: pickMigrationSteps(guide, pkg),
            })
          }
        }
      }

      // 成员命中：成员访问和裸调用都算（installBundle(...) 是调用不是 a.b 形式）
      const memberHits = [
        ...scanned.memberAccess.map((m) => ({ name: m.member, dotted: `${m.object}.${m.member}`, line: m.line })),
        ...scanned.calls.map((c) => ({ name: c.name, dotted: c.name, line: c.line })),
      ]
      for (const hit of memberHits) {
        for (const anchor of members) {
          if (anchorMatches(anchor, hit.dotted)) {
            findings.push({
              file: relFile,
              line: hit.line,
              symbol: hit.dotted,
              kind: 'member',
              guide: `${guide.version}/${guide.topic}`,
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
              guide: `${guide.version}/${guide.topic}`,
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

  const byGuide = new Map()
  for (const f of unique) {
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
    findingCount: unique.length,
    findingsByGuide: Object.fromEntries([...byGuide.entries()].sort()),
    findings: unique.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
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

  process.stderr.write(
    `\n扫描 ${result.scannedFiles} 个文件 / ${result.scannedLines} 行\n` +
    `参考指南版本: ${result.guideVersionsAvailable.join(', ') || '无'}\n` +
    `纳入考虑的 guide 条目: ${result.guidesConsidered}\n` +
    `命中: ${result.findingCount} 处，涉及 ${Object.keys(result.findingsByGuide).length} 条官方变更\n`
  )
}
