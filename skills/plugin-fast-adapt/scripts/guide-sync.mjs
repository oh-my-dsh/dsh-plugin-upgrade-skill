#!/usr/bin/env node
// guide-sync.mjs —— 第 2、3 步：定版本 + 取官方升级指南。
//
// 两件事：
//   A. 从 npm registry 读 @deepseek-ai/dsh 的 dist-tags，启发式判断本机该跟哪个版本。
//   B. 取该版本的官方 upgrade-guide（权威破坏性变更清单），缓存到本地。
//
// 启发式（不盲目取 latest）：
//   本机版本可能跑在 next/alpha 线上，比 latest 还新。
//   所以先判断本机在官方通道里的位置，再决定有没有「下一个」可跟。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { printJson, compareVersions } from './lib/scanner.mjs'
import { listGuideVersions } from './lib/guide-parser.mjs'
import { findGlobalDsh } from './env-doctor.mjs'

// dist-tags 专用端点只回标签对象（实测 67 字节）；全量包文档是 267KB，
// 而这里只用到 dist-tags，网络、解析、缓存落盘全是白付的。
const DIST_TAGS_URL = 'https://registry.npmjs.org/-/package/@deepseek-ai/dsh/dist-tags'
const HARNESS_REPO = 'https://github.com/deepseek-ai/deepseek-harness.git'
const CACHE_ROOT = path.join(os.homedir(), '.cache', 'dsh-plugin-fast-adapt')

// ── A. 版本解析 ────────────────────────────────────────────────────────────

// dist-tags 数天才变一次，没必要每次都打网络。缓存 1 小时；
// 网络失败时有过期缓存也降级用，明确标 stale，绝不静默装作新鲜。
const METADATA_CACHE = path.join(CACHE_ROOT, 'npm-metadata.json')
const METADATA_TTL_MS = 60 * 60 * 1000

export async function fetchNpmMetadata({ fetcher = null, maxAgeMs = METADATA_TTL_MS, cachePath = METADATA_CACHE } = {}) {
  const cached = readCachedMetadata(cachePath)
  if (cached && Date.now() - cached.fetchedAt < maxAgeMs) {
    return { ...cached.data, _metadataSource: 'cache' }
  }

  const doFetch = fetcher || ((url, init) => fetch(url, init))
  try {
    const res = await doFetch(DIST_TAGS_URL, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`npm registry 返回 ${res.status}`)
    const tags = await res.json()
    if (!tags || typeof tags !== 'object' || !Object.keys(tags).length) {
      throw new Error('dist-tags 响应为空')
    }
    // 缓存仍存 {'dist-tags': {...}} 形状，旧版全量文档缓存可直接续用
    const data = { 'dist-tags': tags }
    writeCachedMetadata(cachePath, { fetchedAt: Date.now(), data })
    return { ...data, _metadataSource: 'network' }
  } catch (err) {
    if (cached) return { ...cached.data, _metadataSource: 'stale-cache' }
    throw err
  }
}

function readCachedMetadata(cachePath = METADATA_CACHE) {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    if (typeof raw.fetchedAt === 'number' && raw.data?.['dist-tags']) return raw
  } catch {}
  return null
}

function writeCachedMetadata(cachePath, entry) {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify(entry))
  } catch {
    // 缓存写不进去不影响主流程，下次再试
  }
}

// 本机版本 → 官方通道位置 → 建议目标
export function resolveTargetVersion(localVersion, distTags) {
  const channels = ['latest', 'next', 'alpha'].filter((c) => distTags?.[c])
  const channelEntries = channels.map((c) => ({ channel: c, version: distTags[c] }))

  if (!localVersion) {
    return {
      verdict: 'unknown-local',
      localVersion: null,
      channels: channelEntries,
      target: distTags?.latest || null,
      reason: '未检测到本机 DSH 版本，默认跟随 latest。',
    }
  }

  const newer = channelEntries
    .filter((c) => compareVersions(c.version, localVersion) > 0)
    .sort((a, b) => compareVersions(a.version, b.version))

  const onChannel = channelEntries.find((c) => compareVersions(c.version, localVersion) === 0)

  if (onChannel) {
    return {
      verdict: 'up-to-date-on-channel',
      localVersion,
      channels: channelEntries,
      currentChannel: onChannel.channel,
      target: null,
      reason: `本机 ${localVersion} 已是官方 ${onChannel.channel} 通道的最新版，官方无更高版本可跟。`,
    }
  }

  if (!newer.length) {
    const maxChannel = [...channelEntries].sort((a, b) => compareVersions(b.version, a.version))[0]
    return {
      verdict: 'ahead-of-upstream',
      localVersion,
      channels: channelEntries,
      target: null,
      reason: `本机 ${localVersion} 高于官方所有通道（最高 ${maxChannel?.version}），无需升级。`,
    }
  }

  // target 取官方所有通道的最高版本，不是「比本机新的最低一个」：
  // 后者在多通道场景会选中 alpha 这类低质量通道（实测 0.1.0-rc.6 → alpha.5，
  // 而宿主实际跑的是 next 的 rc.3），适配目标跟着宿主真实版本走才有意义。
  const target = [...channelEntries].sort((a, b) => compareVersions(b.version, a.version))[0]
  return {
    verdict: 'upgrade-available',
    localVersion,
    channels: channelEntries,
    target: target.version,
    targetChannel: target.channel,
    reason: `本机 ${localVersion} → 官方最高 ${target.channel} 通道的 ${target.version}。`,
  }
}

// ── B. 指南获取 ────────────────────────────────────────────────────────────

function cacheDirFor(version) {
  return path.join(CACHE_ROOT, `harness-dsh-v${version}`)
}

// 本机可能已有 harness clone，优先复用，省一次网络
function findLocalClone() {
  const candidates = []
  try {
    for (const entry of fs.readdirSync(path.join(os.homedir(), 'Documents'), { withFileTypes: true })) {
      if (entry.isDirectory()) candidates.push(path.join(os.homedir(), 'Documents', entry.name, 'deepseek-harness'))
    }
  } catch {}
  const envClone = process.env.DSH_HARNESS_CLONE
  if (envClone) candidates.unshift(envClone)

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'docs', 'upgrade-guide'))) return dir
  }
  return null
}

export function syncGuides(targetVersion, { localClone = null } = {}) {
  const cacheDir = cacheDirFor(targetVersion)

  if (fs.existsSync(path.join(cacheDir, 'docs', 'upgrade-guide'))) {
    return {
      source: 'cache',
      root: path.join(cacheDir, 'docs', 'upgrade-guide'),
      versions: listGuideVersions(path.join(cacheDir, 'docs', 'upgrade-guide')),
    }
  }

  if (localClone) {
    const root = path.join(localClone, 'docs', 'upgrade-guide')
    if (fs.existsSync(root)) {
      return { source: 'local-clone', root, versions: listGuideVersions(root) }
    }
  }

  return { source: 'unavailable', root: null, versions: [] }
}

// 取版锚点：优先官方目标版本；本机已在官方通道最新版（resolution.target=null）时
// 退回本机版本——否则扫描走廊 (peerFloor, hostVersion] 拿不到指南语料，run.mjs
// 的 scan 阶段会以「无指南根或无窗口」静默跳过（2026-10-25 实测复盘）。
export function guideVersionFor(resolution, localVersion, distTags) {
  return resolution?.target || localVersion || distTags?.latest || null
}

// 真正拉取（需要网络）。用 sparse clone 只取 docs/upgrade-guide。
export function cloneGuides(targetVersion) {
  const tag = `dsh-v${targetVersion}`
  const dest = cacheDirFor(targetVersion)

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp-${process.pid}`

  try {
    execFileSync('git', ['clone', '--depth', '1', '--branch', tag, '--filter=blob:none', '--sparse', HARNESS_REPO, tmp], {
      stdio: 'pipe',
      timeout: 120000,
    })
    execFileSync('git', ['sparse-checkout', 'set', 'docs/upgrade-guide'], { cwd: tmp, stdio: 'pipe' })
    fs.renameSync(tmp, dest)
  } catch (err) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {}
    throw new Error(`拉取官方指南失败（tag ${tag}）：${err.message}`)
  }

  return { source: 'clone', root: path.join(dest, 'docs', 'upgrade-guide'), versions: listGuideVersions(path.join(dest, 'docs', 'upgrade-guide')) }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

// 盯梢退出码（--check 模式）：1=上游有新版（cron/launchd/agent 轮询的非零信号，
// 此时新版指南已顺手预取进缓存）；0=无需动作（up-to-date/ahead/unknown-local）。
// 判定失败（网络挂且无缓存）走 CLI catch 的 2，不与「有动作」混淆。
export function upstreamCheckExit(resolution) {
  return resolution?.verdict === 'upgrade-available' ? 1 : 0
}

export async function runGuideSync(localVersion, { clone = false, fetcher = null, localClone = null } = {}) {
  const metadata = await fetchNpmMetadata({ fetcher })
  const resolution = resolveTargetVersion(localVersion, metadata['dist-tags'], Object.keys(metadata.versions || {}))
  const guideVersion = guideVersionFor(resolution, localVersion, metadata['dist-tags'])

  let guides = { source: 'unavailable', root: null, versions: [] }
  if (guideVersion) {
    guides = syncGuides(guideVersion, { localClone: localClone ?? findLocalClone() })
    if (guides.source === 'unavailable' && clone) {
      try {
        guides = cloneGuides(guideVersion)
      } catch (err) {
        guides = { source: 'error', root: null, versions: [], error: err.message }
      }
    }
  }

  return { resolution, guides, guideVersion, metadataSource: metadata._metadataSource || 'network' }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  // --check：盯梢模式。退出码给 cron/agent 轮询用（1=有新版，0=无需动作，2=判定失败），
  // 有新版时顺手预取该版指南进缓存（clone=true），下次 run.mjs 零等待。
  // 版本参数缺省时自动探测本机宿主版本，零参数可直接接定时器。
  const checkMode = process.argv.includes('--check')
  const positional = process.argv.slice(2).find((a) => !a.startsWith('--')) || null
  const local = positional || (checkMode ? findGlobalDsh()?.version ?? null : null)
  const allowClone = process.argv.includes('--clone') || checkMode

  runGuideSync(local, { clone: allowClone })
    .then((result) => {
      printJson(result)
      const r = result.resolution
      process.stderr.write(`\n本机版本: ${r.localVersion || '未检测到'}\n`)
      process.stderr.write(`判定: ${r.verdict}\n`)
      process.stderr.write(`理由: ${r.reason}\n`)
      process.stderr.write(`版本数据来源: ${result.metadataSource}${result.metadataSource === 'stale-cache' ? '（网络失败，降级用过期缓存）' : ''}\n`)
      process.stderr.write(`取版锚点: ${result.guideVersion || '无'}\n`)
      if (result.guides.root) {
        process.stderr.write(`指南来源: ${result.guides.source} (${result.guides.versions.length} 个版本)\n`)
      } else if (result.guides.error) {
        process.stderr.write(`指南获取失败: ${result.guides.error}\n`)
      } else {
        process.stderr.write('指南来源: 无（无目标版本或未拉取）\n')
      }
      if (checkMode) {
        const code = upstreamCheckExit(result.resolution)
        if (code === 1) {
          const prefetched = result.guides.source === 'clone' ? '已预取进缓存' : result.guides.root ? '缓存已就绪' : '预取失败（下次 run.mjs --clone 会补）'
          process.stderr.write(`盯梢: 上游有新版 ${result.resolution.target}（${prefetched}）——逐插件跑 run.mjs 适配\n`)
        } else {
          process.stderr.write('盯梢: 无需动作\n')
        }
        process.exit(code)
      }
    })
    .catch((err) => {
      process.stderr.write(`失败: ${err.message}\n`)
      process.exit(checkMode ? 2 : 1)
    })
}
