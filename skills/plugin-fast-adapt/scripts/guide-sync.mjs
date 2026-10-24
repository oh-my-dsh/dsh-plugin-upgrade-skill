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
import { printJson, compareVersions, parseVersion } from './lib/scanner.mjs'
import { listGuideVersions } from './lib/guide-parser.mjs'

const NPM_REGISTRY = 'https://registry.npmjs.org/@deepseek-ai/dsh'
const HARNESS_REPO = 'https://github.com/deepseek-ai/deepseek-harness.git'
const CACHE_ROOT = path.join(os.homedir(), '.cache', 'dsh-plugin-fast-adapt')

// ── A. 版本解析 ────────────────────────────────────────────────────────────

async function fetchNpmMetadata() {
  const res = await fetch(NPM_REGISTRY, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`npm registry 返回 ${res.status}`)
  return res.json()
}

// 本机版本 → 官方通道位置 → 建议目标
export function resolveTargetVersion(localVersion, distTags, versions) {
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

  const local = parseVersion(localVersion)
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

  // 取最近的下一个版本，不跨大版本盲升
  const target = newer[0]
  return {
    verdict: 'upgrade-available',
    localVersion,
    channels: channelEntries,
    target: target.version,
    targetChannel: target.channel,
    reason: `本机 ${localVersion} → 建议跟随 ${target.channel} 通道的 ${target.version}。`,
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

export async function runGuideSync(localVersion, { clone = false } = {}) {
  const metadata = await fetchNpmMetadata()
  const resolution = resolveTargetVersion(localVersion, metadata['dist-tags'], Object.keys(metadata.versions || {}))

  let guides = { source: 'unavailable', root: null, versions: [] }
  if (resolution.target) {
    guides = syncGuides(resolution.target, { localClone: findLocalClone() })
    if (guides.source === 'unavailable' && clone) {
      try {
        guides = cloneGuides(resolution.target)
      } catch (err) {
        guides = { source: 'error', root: null, versions: [], error: err.message }
      }
    }
  }

  return { resolution, guides }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const local = process.argv[2] || null
  const allowClone = process.argv.includes('--clone')

  runGuideSync(local, { clone: allowClone })
    .then((result) => {
      printJson(result)
      const r = result.resolution
      process.stderr.write(`\n本机版本: ${r.localVersion || '未检测到'}\n`)
      process.stderr.write(`判定: ${r.verdict}\n`)
      process.stderr.write(`理由: ${r.reason}\n`)
      if (result.guides.root) {
        process.stderr.write(`指南来源: ${result.guides.source} (${result.guides.versions.length} 个版本)\n`)
      } else if (result.guides.error) {
        process.stderr.write(`指南获取失败: ${result.guides.error}\n`)
      } else {
        process.stderr.write('指南来源: 无（无目标版本或未拉取）\n')
      }
    })
    .catch((err) => {
      process.stderr.write(`失败: ${err.message}\n`)
      process.exit(1)
    })
}
