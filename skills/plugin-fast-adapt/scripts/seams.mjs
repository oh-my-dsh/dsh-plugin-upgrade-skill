#!/usr/bin/env node
// seams.mjs —— 接缝查询：一个包名 / API 符号，在官方指南与本机宿主里的双源结论。
//
// 回答的问题是「这个接缝在我的目标宿主还在不在」：
//   指南源 —— 官方 upgrade-guide 全走廊的锚点表（哪个版本声称移除/改名了它、
//              原文在哪一行、官方修法是什么）。锚点表就是 code-scan 用的那张，
//              不另建知识库，上游发版即刻跟上。
//   宿主源 —— 本机宿主安装目录的一手事实：包看 node_modules 里有没有，
//              符号看宿主包源码文本命中（弱证据，如实标注）。
//
// 诚实边界（与 code-scan 的宿主实测核查同一套判据）：
//   双源都说没有才下「已移除」的结论；指南说没有但宿主里有，报分歧不替人拍板；
//   双源都查不到记录时明说「指南未提及不代表 API 不存在」——这是知识库的
//   absence of evidence，不是宿主里不存在的证据。
//
// 用法：
//   node scripts/seams.mjs <包名或符号> [--guide <guide-root>] [--host <版本>]
//
// 默认零网络：指南根优先 --guide，其次本机宿主版本的缓存（syncGuides 只读缓存），
// 再退回缓存目录里最新的 harness-dsh-v*；都没有就只出宿主侧结论并明说。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { printJson, compareVersions, packageBase } from './lib/scanner.mjs'
import { loadGuides, listGuideVersions } from './lib/guide-parser.mjs'
import { pickMigrationSteps } from './code-scan.mjs'
import { syncGuides } from './guide-sync.mjs'
import { findGlobalDsh } from './env-doctor.mjs'

const CACHE_ROOT = path.join(os.homedir(), '.cache', 'dsh-plugin-fast-adapt')

// ── 指南根解析（零网络）─────────────────────────────────────────────────────

export function resolveGuideRoot({ explicit = null, hostVersion = null } = {}) {
  if (explicit) return { root: explicit, source: '--guide' }
  if (hostVersion) {
    const cached = syncGuides(hostVersion, { localClone: null })
    if (cached.root) return { root: cached.root, source: 'host-cache' }
  }
  // 兜底：缓存目录里最新的 harness-dsh-v*（宿主版本未知/无该版本缓存时）
  let names = []
  try {
    names = fs.readdirSync(CACHE_ROOT)
  } catch {
    return { root: null, source: 'none' }
  }
  const candidates = names
    .filter((n) => /^harness-dsh-v\d/.test(n))
    .map((n) => n.replace(/^harness-dsh-v/, ''))
    .sort((a, b) => compareVersions(b, a))
  for (const version of candidates) {
    const root = path.join(CACHE_ROOT, `harness-dsh-v${version}`, 'docs', 'upgrade-guide')
    if (fs.existsSync(root)) return { root, source: 'cache-latest' }
  }
  return { root: null, source: 'none' }
}

// ── 指南侧：锚点表里找这个查询词 ────────────────────────────────────────────

function matchLevel(anchor, query) {
  return anchor === query || anchor.endsWith(`.${query}`) || query.endsWith(`.${anchor}`)
}

export function searchGuideEvidence(guides, query) {
  const evidence = []
  for (const guide of guides) {
    const pkgHit = guide.anchors.packages.find(
      (p) => p === query || p.startsWith(`${query}/`) || p.endsWith(`/${query}`)
    )
    if (pkgHit) {
      evidence.push({
        kind: 'removed-package',
        symbol: pkgHit,
        version: guide.version,
        topic: guide.topic,
        file: guide.guideFile ?? `${guide.version}/${guide.topic}/guide.md`,
        line: guide.titleLine ?? null,
        title: guide.title,
        migration: pickMigrationSteps(guide, pkgHit),
      })
      continue
    }
    if (guide.anchors.introduced?.some((s) => s === query || s.endsWith(`.${query}`))) {
      evidence.push({
        kind: 'introduced-symbol',
        symbol: query,
        version: guide.version,
        topic: guide.topic,
        file: guide.guideFile ?? `${guide.version}/${guide.topic}/guide.md`,
        line: guide.titleLine ?? null,
        title: guide.title,
        migration: pickMigrationSteps(guide, query),
      })
      continue
    }
    const memberHit = guide.anchors.members.find((m) => matchLevel(m, query))
    if (memberHit) {
      evidence.push({
        kind: 'changed-member',
        symbol: memberHit,
        version: guide.version,
        topic: guide.topic,
        file: guide.guideFile ?? `${guide.version}/${guide.topic}/guide.md`,
        line: guide.titleLine ?? null,
        title: guide.title,
        migration: pickMigrationSteps(guide, memberHit.split('.').pop()),
      })
      continue
    }
    const codeHit = guide.anchors.codes.find((c) => c === query || (query.length >= 6 && c.includes(query)))
    if (codeHit) {
      evidence.push({
        kind: 'changed-constant',
        symbol: codeHit,
        version: guide.version,
        topic: guide.topic,
        file: guide.guideFile ?? `${guide.version}/${guide.topic}/guide.md`,
        line: guide.titleLine ?? null,
        title: guide.title,
        migration: pickMigrationSteps(guide, codeHit),
      })
    }
  }
  // 新版本在前：接缝查询关心的是「最新说法」，先看走廊末端再回溯
  return evidence.sort((a, b) => compareVersions(b.version, a.version))
}

// ── 宿主侧：node_modules 一手事实 ────────────────────────────────────────────

function nodeModulesScope(hostInfo) {
  return hostInfo?.location ? path.dirname(path.dirname(hostInfo.location)) : null
}

// 包是否还在目标宿主的安装目录里（与 code-scan.verifyPackagesAgainstHost 同判据）。
// 裸的 dsh-* 名字按宿主套件惯例归一到 @deepseek-ai/ scope 再查——用户查
// 「dsh-settings」指的就是那个包，不是宿主源码里的某个词。
function checkPackageOnHost(query, hostInfo) {
  const scope = nodeModulesScope(hostInfo)
  if (!scope) return { kind: 'package', status: 'unknown', checkedWhere: null }
  const normalized = query.includes('/') ? query : /^dsh-/.test(query) ? `@deepseek-ai/${query}` : query
  const pkg = packageBase(normalized)
  const dir = path.join(scope, pkg)
  const present = fs.existsSync(path.join(dir, 'package.json'))
  return { kind: 'package', status: present ? 'present' : 'absent', checkedWhere: dir }
}

// 符号在宿主套件源码里有没有文本命中（搜索根 = location 的上一级，即 @deepseek-ai/*
// 套件目录，覆盖 dsh 主包与 dsh-* 子包）。文本证据是弱证据：命中不代表 API 对插件
// 可用（可能是压缩产物里的内部名），零命中也不代表不存在（可能在别处动态挂载）。
function checkSymbolOnHost(query, hostInfo) {
  if (!hostInfo?.location) return { kind: 'symbol', status: 'unknown', checkedWhere: null }
  const pkgDir = path.dirname(hostInfo.location)
  const re = new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  let files = 0
  let hits = 0
  const walk = (dir, depth) => {
    if (depth > 4 || files > 300 || hits > 20) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files > 300 || hits > 20) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        walk(full, depth + 1)
      } else if (/\.(js|mjs|cjs|json)$/.test(entry.name)) {
        files++
        let text = ''
        try {
          const stat = fs.statSync(full)
          if (stat.size > 2 * 1024 * 1024) continue
          text = fs.readFileSync(full, 'utf8')
        } catch {
          continue
        }
        if (re.test(text)) hits++
      }
    }
  }
  walk(pkgDir, 0)
  return {
    kind: 'symbol',
    status: hits > 0 ? 'text-present' : 'text-absent',
    filesScanned: files,
    checkedWhere: pkgDir,
    caveat: '文本命中是弱证据：命中不代表该 API 对插件可用，零命中只覆盖宿主套件源码目录',
  }
}

// ── 双源合成 ────────────────────────────────────────────────────────────────

function synthesize(query, guideEvidence, hostEvidence) {
  const kinds = new Set(guideEvidence.map((e) => e.kind))
  const removedClaim = kinds.has('removed-package') || kinds.has('changed-member') || kinds.has('changed-constant')
  const introduced = kinds.has('introduced-symbol')

  if (kinds.has('removed-package')) {
    if (hostEvidence?.status === 'absent') return { verdict: 'agree-removed', text: `指南声称移除，宿主实测也没有——按指南迁移（${guideEvidence[0].file}）` }
    if (hostEvidence?.status === 'present') return { verdict: 'disagree-host-present', text: '指南提及移除，但包仍在目标宿主里——装载不炸，核对指南原文语义（常是配置取值或方法行为变了）' }
    return { verdict: 'guide-claim-unverified', text: '指南声称移除，宿主侧未能实测（探不到宿主安装位）——按指南迁移或先装宿主核实' }
  }
  if (introduced) {
    return { verdict: 'introduced', text: `这是迁移目标（新写法），首见于 ${guideEvidence[0].version} 的指南——用它是已适配的标志` }
  }
  if (removedClaim) {
    const statusText = hostEvidence?.status === 'text-present' ? '宿主套件源码仍出现该词（弱证据）' : hostEvidence?.status === 'text-absent' ? '宿主套件源码零命中' : '宿主侧未能实测'
    return { verdict: 'guide-claim-member', text: `指南把它标为已变更的成员/常量，${statusText}——按指南语境判断` }
  }
  if (hostEvidence?.status === 'present') return { verdict: 'host-present-no-guide-record', text: '宿主里有这个包，指南走廊未提及——未提及不等于官方承诺，升级窗口扫一遍 code-scan 更稳' }
  if (hostEvidence?.status === 'absent') return { verdict: 'host-absent-no-guide-record', text: '宿主里没有这个包，指南也未提及——本来就不存在，或名字拼写有误' }
  if (hostEvidence?.status === 'text-present') return { verdict: 'text-present-no-guide-record', text: '宿主源码有该词（弱证据），指南未提及——未提及不代表 API 不存在' }
  if (hostEvidence?.status === 'text-absent') return { verdict: 'no-record', text: '双源均无记录——指南未提及不是「API 不存在」的证据，去官方文档或宿主源码确认' }
  return { verdict: 'unknown', text: '双源都未能取证（无指南根且探不到宿主）——先跑 guide-sync --clone 或 --guide 指定指南根' }
}

export function querySeams(query, { guideRoot = undefined, hostInfo = undefined } = {}) {
  if (!query || typeof query !== 'string') throw new Error('需要查询词：包名或 API 符号')

  let loaded = []
  let rootInfo = { root: null, source: 'none' }
  if (guideRoot) {
    rootInfo = { root: guideRoot, source: 'explicit' }
    loaded = listGuideVersions(guideRoot).flatMap((v) => loadGuides(guideRoot, v))
  }
  const guideEvidence = searchGuideEvidence(loaded, query)

  const isPackageLike =
    query.startsWith('@') || query.includes('/') || /^dsh-/.test(query) || guideEvidence.some((e) => e.kind === 'removed-package')
  const resolvedHost = hostInfo === undefined ? findGlobalDsh() : hostInfo
  const hostEvidence = resolvedHost
    ? isPackageLike
      ? checkPackageOnHost(query, resolvedHost)
      : checkSymbolOnHost(query, resolvedHost)
    : { kind: isPackageLike ? 'package' : 'symbol', status: 'unknown', checkedWhere: null }

  return {
    query,
    guideRoot: rootInfo,
    guideEvidence,
    host: resolvedHost ? { version: resolvedHost.version, source: resolvedHost.source } : null,
    hostEvidence,
    conclusion: synthesize(query, guideEvidence, hostEvidence),
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const flags = { query: null, guide: null, host: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--guide') flags.guide = argv[++i]
    else if (a === '--host') flags.host = argv[++i]
    else if (a.startsWith('--')) throw new Error(`未知参数「${a}」`)
    else if (!flags.query) flags.query = a
    else throw new Error('查询词只要一个')
  }
  return flags
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  let flags
  try {
    flags = parseArgv(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${err.message}\n用法: node scripts/seams.mjs <包名或符号> [--guide <guide-root>] [--host <版本>]\n`)
    process.exit(2)
  }
  if (!flags.query) {
    process.stderr.write('用法: node scripts/seams.mjs <包名或符号> [--guide <guide-root>] [--host <版本>]\n')
    process.exit(2)
  }

  // --host 指定版本时用该版本的缓存指南根；默认用本机宿主版本
  const hostVersion = flags.host || findGlobalDsh()?.version || null
  const rootInfo = flags.guide ? { root: flags.guide, source: '--guide' } : resolveGuideRoot({ hostVersion })
  const report = querySeams(flags.query, { guideRoot: rootInfo.root, hostInfo: undefined })
  report.guideRoot = { ...rootInfo, versions: rootInfo.root ? listGuideVersions(rootInfo.root).length : 0 }
  printJson(report)

  const e = report.guideEvidence
  process.stderr.write(`\n接缝查询: ${flags.query}\n`)
  process.stderr.write(`指南源: ${rootInfo.root ? `${rootInfo.root}（${rootInfo.source}）` : '无（只剩宿主侧结论）'}\n`)
  for (const item of e.slice(0, 5)) {
    process.stderr.write(`  [${item.kind}] ${item.version} ${item.title}\n    ${item.file}${item.line ? `:${item.line}` : ''}\n`)
  }
  if (e.length === 0) process.stderr.write('  指南走廊无记录\n')
  process.stderr.write(`宿主源: ${report.hostEvidence.status}（${report.hostEvidence.checkedWhere ?? '未探测'}）\n`)
  process.stderr.write(`结论: ${report.conclusion.text}\n`)
}
