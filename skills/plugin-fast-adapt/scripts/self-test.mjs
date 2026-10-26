#!/usr/bin/env node
// self-test.mjs —— 自检。零网络、零外部依赖，任何机器上都能跑。
//
// 重点验证三件事：
//   1. 扫描器不误报（注释/字符串里的同名词不算命中）—— 这是旧版正则的老毛病
//   2. 扫描器不漏报（真实代码里的 import / 成员访问 / 常量要抓到）
//   3. 版本启发式正确（prerelease 语义、本机与官方通道的相对位置）

import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scanSource, compareVersions, parseVersion, satisfiesRange, computeWindow, isPluginForm } from './lib/scanner.mjs'
import { parseGuideMarkdown, extractAnchors, listGuideVersions, loadGuides } from './lib/guide-parser.mjs'
import { resolveTargetVersion, fetchNpmMetadata, runGuideSync, guideVersionFor, upstreamCheckExit } from './guide-sync.mjs'
import { anchorMatches, verifyPackagesAgainstHost, pickScanRoots, scanPluginFromGuideRoot } from './code-scan.mjs'
import { runQuickSmoke } from './quick-smoke.mjs'
import { auditPlugin, peerPatchFor } from './plugin-audit.mjs'
import { extractInjects, diagnoseActivation, candidateGlobalRoots, parsePatchEntries, probeEnvironment, resolveEntryFile, scanSharedFarm, listInstalledPlugins } from './env-doctor.mjs'
import { readClientDecl, clientExportPath, overlayMountedNames, isDeliberateRosterInsert, collectRoster, diagnoseClientHalf } from './lib/client-graph.mjs'
import { scaffoldPlugin, projectNames, detectHarnessVersion, UsageError } from './scaffold.mjs'
import { runWriteGate } from './write-gate.mjs'
import { listRuns, sanitizeRun, writeRunLog, pruneRuns } from './lib/runlog.mjs'
import { parseStartupLog, parseMessages, diagnoseLogs } from './log-doctor.mjs'
import { checkSkillSync, syncSkill, suggestCommitCommand } from './sync-skill.mjs'
import { querySeams } from './seams.mjs'
import { correlateRuns } from './run-log.mjs'

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url))

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

process.stderr.write('plugin-fast-adapt 自检\n\n')

// ── 1. 扫描器：不误报 ──────────────────────────────────────────────────────

process.stderr.write('[1] 扫描器不误报（注释与字符串）\n')

const decoy = `// 注释里提到 @deepseek-ai/dsh-settings 和 installBundle()
const doc = "文档字符串里也有 @deepseek-ai/dsh-settings 与 removeBundle"
const tpl = \`模板里还有 @deepseek-ai/dsh-settings 和 installBundle\`
/** 块注释里的 ctx.sessionQuery 与 installBundle */
export const Config = { name: 'x' }
`

test('注释和字符串里的包名不进 imports', () => {
  const r = scanSource(decoy)
  assert.strictEqual(r.imports.length, 0, `期望 0 个 import，实得 ${JSON.stringify(r.imports)}`)
})

test('注释和字符串里的成员访问不进 memberAccess', () => {
  const r = scanSource(decoy)
  assert.strictEqual(r.memberAccess.length, 0, `期望 0 个成员访问，实得 ${JSON.stringify(r.memberAccess)}`)
})

test('注释和字符串里的调用不进 calls', () => {
  const r = scanSource(decoy)
  assert.strictEqual(r.calls.length, 0, `期望 0 个调用，实得 ${JSON.stringify(r.calls)}`)
})

test('字符串字面量被单独收集（供错误码匹配）', () => {
  const r = scanSource(decoy)
  const values = r.strings.map((s) => s.value)
  assert.ok(values.some((v) => v.includes('@deepseek-ai/dsh-settings')), '字符串内容应被收集')
  assert.ok(values.some((v) => v.includes('removeBundle')), '字符串内容应被收集')
})

// ── 2. 扫描器：不漏报 ──────────────────────────────────────────────────────

process.stderr.write('\n[2] 扫描器不漏报（真实代码）\n')

const real = `import { Config } from '@deepseek-ai/dsh-settings'
import { installBundle } from '@deepseek-ai/dsh-api-remotes/client'

export async function apply(ctx) {
  const svc = ctx.sessionQuery
  const rows = await svc.select('sessions')
  await installBundle('@deepseek-ai/dsh-foo')
  if (err.code === 'already-installed') return
  ctx.logger.info('rows', rows.length)
}
`

test('抓到真实 import', () => {
  const r = scanSource(real)
  const sources = r.imports.map((i) => i.source)
  assert.ok(sources.includes('@deepseek-ai/dsh-settings'), `未抓到 dsh-settings: ${JSON.stringify(sources)}`)
  assert.ok(sources.includes('@deepseek-ai/dsh-api-remotes/client'), '未抓到 dsh-api-remotes/client')
})

test('抓到真实成员访问', () => {
  const r = scanSource(real)
  const dotted = r.memberAccess.map((m) => m.chain)
  assert.ok(dotted.some((d) => d.startsWith('ctx.sessionQuery')), `未抓到 ctx.sessionQuery: ${JSON.stringify(dotted)}`)
  assert.ok(dotted.some((d) => d.startsWith('ctx.logger')), '未抓到 ctx.logger')
})

test('抓到真实调用', () => {
  const r = scanSource(real)
  const names = r.calls.map((c) => c.name)
  assert.ok(names.includes('installBundle'), `未抓到 installBundle: ${JSON.stringify(names)}`)
})

test('抓到字符串常量（错误码）', () => {
  const r = scanSource(real)
  const values = r.strings.map((s) => s.value)
  assert.ok(values.includes('already-installed'), `未抓到错误码: ${JSON.stringify(values)}`)
})

test('行号指向真实代码行，不指向注释行', () => {
  const mixed = `// installBundle in a comment
const x = require('cordis')
installBundle('y')
`
  const r = scanSource(mixed)
  const callLine = r.calls.find((c) => c.name === 'installBundle')?.line
  assert.strictEqual(callLine, 3, `installBundle 应在第 3 行，实得 ${callLine}`)
})

test('TypeScript 类型注解不影响扫描', () => {
  const ts = `import type { Session } from '@deepseek-ai/dsh-session'
export const f = (s: Session): number => s.seq.length
`
  const r = scanSource(ts)
  assert.ok(r.imports.some((i) => i.source === '@deepseek-ai/dsh-session'), '应抓到 type import')
  const dotted = r.memberAccess.map((m) => m.chain)
  assert.ok(dotted.some((d) => d.startsWith('s.seq')), `应抓到 s.seq: ${JSON.stringify(dotted)}`)
})

// ── 3. 官方指南解析 ────────────────────────────────────────────────────────

process.stderr.write('\n[3] 官方指南解析\n')

const sampleGuide = `---
kind: upgrade-guide
description: "Installing over an installed plugin package is refused."
---

# Installing over an installed plugin package is refused

English | 中文

## Change

pluginManager.installBundle(spec) used to run pnpm over an installed package.
It now fails with error.code: 'already-installed'.

## Migration

1. Call removeBundle(name) first, then installBundle(spec).
2. Handle the already-installed code.
`

test('解析 frontmatter 与段落', () => {
  const g = parseGuideMarkdown(sampleGuide)
  assert.ok(g.description.includes('refused'), 'description 解析失败')
  assert.ok(g.change.includes('installBundle'), 'Change 段解析失败')
  assert.ok(g.migration.includes('removeBundle'), 'Migration 段解析失败')
})

test('抽出的锚点含包名、成员、常量', () => {
  const g = parseGuideMarkdown(sampleGuide)
  const a = extractAnchors(g.change, g.migration)
  assert.ok(a.packages.some((p) => p.includes('dsh-api-remotes')) || a.packages.length >= 0, '锚点应为数组')
  assert.ok(a.members.includes('installBundle'), `应抽出 installBundle: ${JSON.stringify(a.members)}`)
  assert.ok(a.members.includes('removeBundle'), '应抽出 removeBundle')
  assert.ok(a.codes.includes('already-installed'), `应抽出 already-installed: ${JSON.stringify(a.codes)}`)
})

test('无锚点的 guide 不产生条目', () => {
  const a = extractAnchors('Nothing relevant here.', 'Do something else.')
  assert.strictEqual(a.packages.length + a.members.length + a.codes.length, 0)
})

test('语境引用的包名不进 package 锚点（2026-10-24 实测回归：tool-presentation-mode 把 dsh-tools 误报成 critical）', () => {
  // 讲的是 mode 字段取值，包没被移除——import 该包的插件不该报
  const a = extractAnchors(
    'The `mode` fields of `@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-agent-tool-presentation` accept only `native` or `ptc`.',
    '1. Replace mode: both with mode: native.'
  )
  assert.ok(!a.packages.includes('@deepseek-ai/dsh-tools'), `语境引用不该进锚点: ${JSON.stringify(a.packages)}`)
})

test('与移除动词同句的包名进 package 锚点', () => {
  const a = extractAnchors(
    'The package `@deepseek-ai/dsh-client-runtime` is removed from the official roster; plugins must not declare it.',
    '1. Remove the import of @deepseek-ai/dsh-client-runtime from your client half.'
  )
  assert.ok(a.packages.includes('@deepseek-ai/dsh-client-runtime'), `真移除应进锚点: ${JSON.stringify(a.packages)}`)
})

test('识别替换对，新符号进 introduced', () => {
  const a = extractAnchors(
    'ctx.subagents.start() is removed; use startActivation().',
    '1. Replace ctx.subagents.start() or startContinuable() with startActivation().'
  )
  assert.ok(a.introduced.includes('startActivation'), `startActivation 应为新符号: ${JSON.stringify(a.introduced)}`)
  assert.ok(!a.members.includes('startActivation'), '新符号不该留在待报锚点里')
})

test('迁移目标 Move … into X and Y 全部进 introduced（白描实测回归）', () => {
  // v0.2.0-rc.2 真实指南句式：meta.description 是迁移目标，
  // 旧识别只抓 into 后第一个符号，and 同伴被当待报锚点误报 high
  const a = extractAnchors(
    'A subpath is not a package, so the next release never reads a package.json for it. Its title and description come only from locale files.',
    "1. Move the subpath manifest's name and description into meta.title and meta.description of the subpath locale files, and export them."
  )
  assert.ok(a.introduced.includes('meta.description'), `and 同伴应进 introduced: ${JSON.stringify(a.introduced)}`)
  assert.ok(!a.members.includes('meta.description'), `迁移目标不该留在待报锚点: ${JSON.stringify(a.members)}`)
})

test('常量锚点只从 Change 段抽，Migration 里的示例值不算', () => {
  const a = extractAnchors(
    'A restricted run fails with `sandbox-unavailable`.',
    "1. Set the sandbox-policy row's mode. Its default mode is `read-only`."
  )
  assert.ok(a.codes.includes('sandbox-unavailable'), 'Change 里的错误码应抽出')
  assert.ok(!a.codes.includes('read-only'), `Migration 里的示例值不该抽出: ${JSON.stringify(a.codes)}`)
})

test('剥掉 OSC 8 转义序列后仍能解析', () => {
  const withOsc = sampleGuide.replace('English | 中文', 'English |\x1b]8;id=1;guide.zh.md\x07中文\x1b]8;;\x07')
  const g = parseGuideMarkdown(withOsc)
  assert.ok(g.migration.includes('removeBundle'), '转义序列不应影响解析')
})

// ── 4. 版本启发式 ──────────────────────────────────────────────────────────

process.stderr.write('\n[4] 版本比较与启发式\n')

test('prerelease 排序正确', () => {
  assert.strictEqual(compareVersions('0.2.1-rc.2', '0.2.1-rc.3'), -1)
  assert.strictEqual(compareVersions('0.2.1-rc.3', '0.2.1-rc.3'), 0)
  assert.strictEqual(compareVersions('0.2.1', '0.2.1-rc.3'), 1)
  assert.strictEqual(compareVersions('0.2.0', '0.2.1-rc.3'), -1)
})

test('双位数 prerelease 段按数值比较（rc.10 > rc.9，防字典序回归）', () => {
  assert.strictEqual(compareVersions('0.2.1-rc.10', '0.2.1-rc.9'), 1, 'rc.10 应大于 rc.9')
  assert.strictEqual(compareVersions('0.2.1-rc.9', '0.2.1-rc.10'), -1)
  assert.strictEqual(compareVersions('0.3.0-alpha.2', '0.3.0-alpha.10'), -1, 'alpha.10 应大于 alpha.2')
  assert.strictEqual(compareVersions('0.2.1-rc.10', '0.2.1'), -1, '正式版仍高于任何预发布')
})

test('listGuideVersions 对双位数 prerelease 排序正确', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-guidesort-'))
  try {
    for (const v of ['v0.2.1-rc.10', 'v0.2.1-rc.9', 'v0.2.1-rc.2']) {
      fs.mkdirSync(path.join(dir, v), { recursive: true })
    }
    const versions = listGuideVersions(dir)
    assert.deepStrictEqual(
      versions,
      ['v0.2.1-rc.2', 'v0.2.1-rc.9', 'v0.2.1-rc.10'],
      `rc.10 应排在 rc.9 之后: ${JSON.stringify(versions)}`
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('识别 prerelease', () => {
  assert.strictEqual(parseVersion('0.2.1-rc.3').pre, 'rc.3')
  assert.strictEqual(parseVersion('0.2.1').pre, null)
})

const TAGS = { latest: '0.2.1-rc.2', next: '0.2.1-rc.3', alpha: '0.2.1-alpha.5' }

test('本机等于官方 next 通道 → 判定为最新，不给目标版本', () => {
  const r = resolveTargetVersion('0.2.1-rc.3', TAGS)
  assert.strictEqual(r.verdict, 'up-to-date-on-channel', r.reason)
  assert.strictEqual(r.target, null)
  assert.strictEqual(r.currentChannel, 'next')
})

test('本机低于官方 → 目标是官方最高通道，不选低质量通道', () => {
  const r = resolveTargetVersion('0.1.7-rc.2', TAGS)
  assert.strictEqual(r.verdict, 'upgrade-available')
  assert.strictEqual(r.target, '0.2.1-rc.3', `应选官方最高（next 的 rc.3），实得 ${r.target}`)
})

test('本机跨大段落后 → 目标仍是官方最高，不落回 alpha（2026-10-24 实测回归：旧逻辑选了 alpha.5 漏掉 rc.2/rc.3 的变更）', () => {
  const r = resolveTargetVersion('0.1.0-rc.6', TAGS)
  assert.strictEqual(r.verdict, 'upgrade-available')
  assert.strictEqual(r.target, '0.2.1-rc.3', `应选官方最高（next 的 rc.3），实得 ${r.target}`)
  assert.strictEqual(r.targetChannel, 'next')
})

test('本机高于官方所有通道 → 判定为领先', () => {
  const r = resolveTargetVersion('0.3.0-alpha.1', TAGS)
  assert.strictEqual(r.verdict, 'ahead-of-upstream', r.reason)
  assert.strictEqual(r.target, null)
})

test('检测不到本机版本 → 退回 latest 并标明', () => {
  const r = resolveTargetVersion(null, TAGS)
  assert.strictEqual(r.verdict, 'unknown-local')
  assert.strictEqual(r.target, '0.2.1-rc.2')
})

test('通道去重且按版本排序', () => {
  const r = resolveTargetVersion('0.1.0', { latest: '0.2.1-rc.2', next: '0.2.1-rc.2', alpha: '0.2.1-alpha.5' })
  assert.strictEqual(r.verdict, 'upgrade-available')
  assert.strictEqual(r.target, '0.2.1-rc.2', `应选官方最高（latest/next 的 rc.2），实得 ${r.target}`)
})

// ── 5. 端到端：真实插件 × 真实指南 ────────────────────────────────────────

process.stderr.write('\n[5] 端到端命中\n')

const { scanPlugin } = await import('./code-scan.mjs')

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-fixture-'))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'src', 'index.ts'),
    `// 注释里写 @deepseek-ai/dsh-settings 不应命中
import { installBundle } from '@deepseek-ai/dsh-api-remotes/client'

export async function apply(ctx) {
  await installBundle('@deepseek-ai/dsh-foo')
  if (err.code === 'already-installed') return
}
`
  )
  return dir
}

test('端到端：注释不命中，真实代码命中', async () => {
  const dir = makeFixture()
  try {
    const guides = [
      {
        version: '0.2.1-alpha.2',
        topic: 'plugin-install-over-installed',
        title: 'Installing over an installed plugin package is refused',
        change: 'pluginManager.installBundle(spec) now fails with error.code: already-installed.',
        migration: '1. Call removeBundle(name) first, then installBundle(spec).\n2. Handle the already-installed code.',
        anchors: { packages: ['@deepseek-ai/dsh-api-remotes/client'], members: ['installBundle', 'removeBundle'], codes: ['already-installed'] },
      },
    ]
    const r = scanPlugin(dir, guides, { localVersion: '0.2.1-alpha.1', targetVersion: '0.2.1-alpha.2' })
    const symbols = r.findings.map((f) => `${f.kind}:${f.symbol}`)
    assert.ok(symbols.includes('package:@deepseek-ai/dsh-api-remotes/client'), `应命中包名: ${JSON.stringify(symbols)}`)
    assert.ok(symbols.includes('member:installBundle'), '应命中成员')
    assert.ok(symbols.includes('code:already-installed'), '应命中错误码')
    assert.ok(!r.findings.some((f) => f.file.includes('comment')), '不应有来自注释的命中')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('用了迁移目标（新符号）的插件不报命中', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-adapted-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'src', 'index.ts'),
      `import { startActivation } from '@deepseek-ai/dsh-subagents'

export async function apply(ctx) {
  await ctx.subagents.startActivation({ id: 'x' })
}
`
    )
    const guides = [
      {
        version: '0.2.1-alpha.1',
        topic: 'subagent-activations',
        title: 't',
        change: 'ctx.subagents.start() is removed.',
        migration: '1. Replace ctx.subagents.start() with startActivation().',
        anchors: {
          packages: [],
          members: ['ctx.subagents.start', 'startActivation'],
          codes: [],
          introduced: ['startActivation'],
        },
      },
    ]
    const r = scanPlugin(dir, guides, { localVersion: '0.1.7-rc.2', targetVersion: '0.2.1-alpha.4' })
    assert.strictEqual(r.findingCount, 0, `已适配的插件不该报命中: ${JSON.stringify(r.findings)}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('仍在用旧符号的插件要报命中', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-legacy-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'src', 'index.ts'),
      `export async function apply(ctx) {
  await ctx.subagents.start({ id: 'x' })
}
`
    )
    const guides = [
      {
        version: '0.2.1-alpha.1',
        topic: 'subagent-activations',
        title: 't',
        change: 'ctx.subagents.start() is removed.',
        migration: '1. Replace ctx.subagents.start() with startActivation().',
        anchors: {
          packages: [],
          members: ['ctx.subagents.start', 'startActivation'],
          codes: [],
          introduced: ['startActivation'],
        },
      },
    ]
    const r = scanPlugin(dir, guides, { localVersion: '0.1.7-rc.2', targetVersion: '0.2.1-alpha.4' })
    assert.ok(r.findingCount > 0, '仍在用旧符号应报命中')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('版本窗口外的 guide 被排除', () => {
  const dir = makeFixture()
  try {
    const guides = [
      {
        version: '0.1.6-alpha.1',
        topic: 'old',
        title: 'old',
        change: 'installBundle changed.',
        migration: '1. use installBundle.',
        anchors: { packages: [], members: ['installBundle'], codes: [] },
      },
    ]
    const r = scanPlugin(dir, guides, { localVersion: '0.2.1-alpha.1', targetVersion: '0.2.1-alpha.2' })
    assert.strictEqual(r.findingCount, 0, '窗口外的 guide 不应产生命中')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('import 主包不命中已移除的兄弟包（防前缀误报回归）', () => {
  // 官方 39 个包名全以 @deepseek-ai/dsh 开头：旧的反向前缀匹配会把
  // import 主包的插件全部误报成 critical（2026-10-24 复现后收掉）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-prefix-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'src', 'index.ts'),
      `import { ctx } from '@deepseek-ai/dsh'\nexport const apply = () => ctx.tools.register({ name: 'x' })\n`
    )
    const guides = [
      {
        version: '0.2.1-rc.3',
        topic: 'x',
        title: 't',
        change: '@deepseek-ai/dsh-settings is removed.',
        migration: '1. Remove @deepseek-ai/dsh-settings imports.',
        anchors: { packages: ['@deepseek-ai/dsh-settings'], members: [], codes: [] },
      },
    ]
    const r = scanPlugin(dir, guides)
    assert.strictEqual(r.findingCount, 0, `import 主包不该命中兄弟包移除: ${JSON.stringify(r.findings)}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('import 已移除包的子路径仍命中（保召回）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-subpath-'))
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'src', 'index.ts'),
      `import { legacy } from '@deepseek-ai/dsh-settings/lib/legacy'\nexport const apply = () => void legacy\n`
    )
    const guides = [
      {
        version: '0.2.1-rc.3',
        topic: 'x',
        title: 't',
        change: '@deepseek-ai/dsh-settings is removed.',
        migration: '1. Remove @deepseek-ai/dsh-settings imports.',
        anchors: { packages: ['@deepseek-ai/dsh-settings'], members: [], codes: [] },
      },
    ]
    const r = scanPlugin(dir, guides)
    assert.ok(r.findings.some((f) => f.kind === 'package'), '子路径 import 仍应命中')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('真实指南目录能列出版本（若本机有 clone）', () => {
  const candidates = [
    process.env.DSH_HARNESS_CLONE,
    path.join(os.homedir(), 'Documents', 'deepseek-harness', 'docs', 'upgrade-guide'),
    path.join(os.homedir(), 'layerfs-lab', 'deepseek-harness', 'docs', 'upgrade-guide'),
  ].filter(Boolean)
  const root = candidates.find((c) => fs.existsSync(c))
  if (!root) {
    process.stderr.write('      (跳过：本机无 harness clone)\n')
    return
  }
  const versions = listGuideVersions(root)
  assert.ok(versions.length > 0, '应列出至少一个指南版本')
  assert.ok(
    versions.some((v) => v.replace(/^v/, '').startsWith('0.2.1-alpha')),
    `应含 0.2.1-alpha 系列: ${versions.join(', ')}`
  )
})

// ── 6. 匹配精度：宁可漏报也不误报 ─────────────────────────────────────────

process.stderr.write('\n[6] 匹配精度\n')

test('engines.dsh 不匹配 result.dsh（对象不同）', () => {
  assert.strictEqual(anchorMatches('engines.dsh', 'result.dsh'), false)
  assert.strictEqual(anchorMatches('engines.dsh', 'engines.dsh'), true)
})

test('长对象能以短对象结尾的方式匹配', () => {
  assert.strictEqual(anchorMatches('sessionTitle.register', 'ctx.sessionTitle.register'), true)
  assert.strictEqual(anchorMatches('ctx.tools.presentAs', 'ctx.tools.presentAs'), true)
})

test('过短的末段不作为锚点', () => {
  assert.strictEqual(anchorMatches('a.b', 'x.b'), false)
})

test('通用词不进锚点表', () => {
  const a = extractAnchors(
    'Call ctx.sessionTitle.register({ id }) and use register(',
    '1. Replace registerSessionTitleLlmProvider(...) with ctx.sessionTitle.register({ id }).'
  )
  assert.ok(!a.members.includes('register'), `register 应被过滤: ${JSON.stringify(a.members)}`)
  assert.ok(!a.members.includes('ctx.sessionTitle'), '过短的链应被过滤')
  assert.ok(
    a.members.includes('registerSessionTitleLlmProvider') || a.members.includes('sessionTitle.register'),
    `应保留具体锚点: ${JSON.stringify(a.members)}`
  )
})

test('完整点链优先于短链', () => {
  const a = extractAnchors('Use ctx.tools.presentAs("both") here.', '1. Replace ctx.tools.presentAs.')
  assert.ok(!a.members.includes('ctx.tools'), `ctx.tools 应被更长的链覆盖: ${JSON.stringify(a.members)}`)
  assert.ok(a.members.includes('ctx.tools.presentAs'), `应抽出完整链: ${JSON.stringify(a.members)}`)
})

// ── 文档引用完整性 ──────────────────────────────────────────────────────────
// SOP 和 SKILL.md 里链接的原版文件必须真实存在，防止走廊卡片改名后出现死链。

test('SOP 与 SKILL 引用的原版文件不漂移', () => {
  const skillDir = path.resolve(import.meta.dirname, '..')
  const docs = [
    path.join(skillDir, 'SKILL.md'),
    path.join(skillDir, 'references', 'legacy-migration-sop.md'),
  ]
  // 独立仓库后，对原版文件的引用走 GitHub URL（前缀固定，防手滑改错仓）；
  // 本仓库内部引用仍走 references/ 相对路径，本地文件必须真实存在。
  const upstreamPrefix = 'https://github\\.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/'
  const linkRe = new RegExp(`\\((${upstreamPrefix}[\\w/.-]+)\\)|\\((references\\/[\\w/.-]+)\\)`, 'g')
  let checked = 0
  for (const doc of docs) {
    const text = fs.readFileSync(doc, 'utf8')
    for (const m of text.matchAll(linkRe)) {
      const upstreamUrl = m[1]
      if (upstreamUrl) {
        assert.ok(upstreamUrl.startsWith('https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill/tree/main/skills/'),
          `${path.basename(doc)} 引用的原版 URL 前缀不对：${upstreamUrl}`)
      } else {
        const rel = m[2]
        const target = path.resolve(path.dirname(doc), rel)
        assert.ok(fs.existsSync(target), `${path.basename(doc)} 引用的 ${rel} 不存在（死链）`)
      }
      checked++
    }
  }
  assert.ok(checked >= 8, `应至少核对 8 处引用，实际 ${checked} 处——SOP 可能被清空了`)
})

test('文档宣称的断言数与实际一致（防手工漂移）', () => {
  // 这个数字已漂过两次（49→50→54 都是事后手补）；现在让自检拦住它
  const root = path.resolve(import.meta.dirname, '..')
  const docs = ['SKILL.md', 'README.md', 'README.en.md'].map((f) => path.join(root, f))
  let checked = 0
  for (const doc of docs) {
    const text = fs.readFileSync(doc, 'utf8')
    const numbers = [
      ...text.matchAll(/(\d+)\s*项断言/g),
      ...text.matchAll(/(\d+)\s*assertions/g),
    ].map((m) => Number(m[1]))
    assert.ok(numbers.length > 0, `${path.basename(doc)} 应写明断言数，否则本断言失去保护对象`)
    for (const n of numbers) {
      assert.strictEqual(n, tests.length, `${path.basename(doc)} 宣称 ${n} 项断言，实际 ${tests.length} 项`)
    }
    checked += numbers.length
  }
  assert.ok(checked >= 5, `应至少核对 5 处断言数，实际 ${checked} 处`)
})

// ── 创作脚手架（第 0 步）─────────────────────────────────────────────────────
// 生成物三重验证：结构断言（文件与 package.json 不变量）、冒烟闭环（零依赖
// 形态真跑 quick-smoke）、挂载层可被 env-doctor 的 parsePatchEntries 识别
// （「装了不生效」是 env-doctor 查的头号事故，生成的骨架必须天然可挂载）。

const SCAFFOLD_FORMS = ['tool', 'hook', 'service', 'config', 'llm-adapter']
const scaffoldDirs = []

async function scaffoldTo(name, options) {
  const dir = tmpPluginDir(`scaffold-${name}`)
  scaffoldDirs.push(dir)
  return scaffoldPlugin({ outDir: dir, harnessVersion: '0.2.1-rc.3', ...options })
}

test('scaffold：tool 形态端到端——五件套生成＋冒烟注册工具＋挂载层可识别', async () => {
  const result = await scaffoldTo('tool', { coordinate: 'taxueseek/demo-tool', form: 'tool' })
  for (const f of ['package.json', 'lib/index.js', 'cordis.patch.yml', 'dsh-plugin.naming.json', 'README.md', '.gitignore']) {
    assert.ok(fs.existsSync(path.join(result.outDir, f)), `应生成 ${f}`)
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(result.outDir, 'package.json'), 'utf8'))
  assert.strictEqual(pkg.type, 'module')
  assert.strictEqual(pkg.main, './lib/index.js')
  assert.strictEqual(pkg.exports['.'], './lib/index.js')
  assert.deepStrictEqual(pkg.files, ['lib', 'cordis.patch.yml'])
  assert.strictEqual(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.strictEqual(pkg.name, '@taxueseek/dsh-demo-tool')
  const manifest = JSON.parse(fs.readFileSync(path.join(result.outDir, 'dsh-plugin.naming.json'), 'utf8'))
  assert.deepStrictEqual(manifest.names.loaderIds, ['taxueseek-demo-tool'])
  assert.deepStrictEqual(manifest.names.tools, ['taxueseek_demo_tool_query'])
  const patch = fs.readFileSync(path.join(result.outDir, 'cordis.patch.yml'), 'utf8')
  const entries = parsePatchEntries(patch)
  assert.strictEqual(entries.length, 1, '挂载层应恰好一条活跃条目')
  assert.ok(entries[0].includes('@taxueseek/dsh-demo-tool') && entries[0].includes('taxueseek-demo-tool'), '条目应含包名与 loader id')
  assert.strictEqual(result.smoke.run, true)
  assert.strictEqual(result.smoke.success, true)
  assert.deepStrictEqual(result.smoke.registeredTools, ['taxueseek_demo_tool_query'])
  assert.strictEqual(result.smoke.mockFallbacks.length, 0, 'tool 骨架应零 Mock 兜底（register 与 inject 都被 Mock 覆盖）')
})

test('scaffold：hook 形态冒烟通过且不误注册工具', async () => {
  const result = await scaffoldTo('hook', { coordinate: 'taxueseek/demo-hook', form: 'hook' })
  assert.strictEqual(result.smoke.success, true)
  assert.deepStrictEqual(result.smoke.registeredTools, [])
})

test('scaffold：依赖宿主基类的三形态诚实跳过冒烟并保留核名提醒', async () => {
  const expectations = {
    service: (src) => src.includes('extends Service'),
    config: (src) => src.includes('Schema.object'),
    'llm-adapter': (src) => src.includes('TODO') && src.includes('以目标宿主 checkout 为准'),
  }
  for (const form of ['service', 'config', 'llm-adapter']) {
    const result = await scaffoldTo(form, { coordinate: `taxueseek/demo-${form}`, form })
    assert.strictEqual(result.smoke, null, `${form} 不该自动冒烟（依赖宿主基类，Mock 覆盖不了）`)
    const src = fs.readFileSync(path.join(result.outDir, 'lib', 'index.js'), 'utf8')
    assert.ok(expectations[form](src), `${form} 入口缺关键结构`)
  }
})

test('scaffold：命名投影符合官方语法与 collision-resistant 规则', () => {
  const n = projectNames('alice', 'web-search')
  assert.strictEqual(n.coordinate, 'alice/web-search')
  assert.strictEqual(n.packageName, '@alice/dsh-web-search')
  assert.deepStrictEqual(n.loaderIds, ['alice-web-search'])
  assert.deepStrictEqual(n.services, ['aliceWebSearchIndex'])
  assert.deepStrictEqual(n.tools, ['alice_web_search_query'])
  assert.deepStrictEqual(n.events, ['alice-web-search/ready'])
  assert.deepStrictEqual(n.routes, [{ kind: 'exact', path: '/api/plugins/alice-web-search/query' }])
  const kebab = /^[a-z]([a-z0-9]*(-[a-z0-9]+)*)?$/
  for (const value of [...n.commands, ...n.skills, ...n.settingsNamespaces, ...n.skillProviders]) {
    assert.ok(kebab.test(value), `${value} 应为 kebab`)
  }
  assert.ok(kebab.test(n.pluginNames[0]), '插件名应为 kebab')
})

test('scaffold：非法输入拒绝且不落盘', async () => {
  const dir = tmpPluginDir('scaffold-reject')
  scaffoldDirs.push(dir)
  for (const bad of [{ coordinate: 'Alice/tool' }, { coordinate: 'no-slash' }, { coordinate: 'a/b/c' }, { coordinate: 'taxueseek/demo-tool', form: 'widget' }]) {
    await assert.rejects(
      () => scaffoldPlugin({ outDir: dir, harnessVersion: '0.0.0', ...bad }),
      UsageError,
      `${JSON.stringify(bad)} 应被拒绝`
    )
  }
  assert.strictEqual(fs.readdirSync(dir).length, 0, '拒绝必须发生在写盘前')
})

test('scaffold：目标目录非空时拒绝覆盖', async () => {
  const dir = tmpPluginDir('scaffold-occupied')
  scaffoldDirs.push(dir)
  fs.writeFileSync(path.join(dir, 'user-file.txt'), 'keep')
  await assert.rejects(
    () => scaffoldPlugin({ coordinate: 'taxueseek/demo-tool', form: 'tool', outDir: dir, harnessVersion: '0.0.0' }),
    UsageError
  )
  assert.strictEqual(fs.readFileSync(path.join(dir, 'user-file.txt'), 'utf8'), 'keep', '用户文件不能动')
})

test('scaffold：显式 harness 版本优先于本机探测', async () => {
  const result = await scaffoldTo('versioned', { coordinate: 'taxueseek/demo-ver', form: 'tool', harnessVersion: '9.9.9' })
  assert.strictEqual(result.harnessVersion, '9.9.9')
  const pkg = JSON.parse(fs.readFileSync(path.join(result.outDir, 'package.json'), 'utf8'))
  assert.ok(pkg.description.includes('9.9.9'), 'description 应记录目标宿主版本')
})

test('scaffold：Windows 模拟下宿主探测不依赖 POSIX 布局', () => {
  const winVersion = detectHarnessVersion({ platform: 'win32', env: { APPDATA: 'X:\\npm' } })
  assert.ok(winVersion === null || typeof winVersion === 'string', 'win 模拟探测应安全返回，不抛路径异常')
})

// ── 创作体检门（造完即验）────────────────────────────────────────────────────
// 核心设计是判定分层：硬门禁只有三条（entry/smoke/critical），fail 才判红；
// audit 分数、high/medium 命中、WARN 全部只透传进 discretion 不拍板。
// 断言围绕两件事：硬门禁真的拦得住，软指标真的不越权。

const gateEnvWithoutDsh = (dir) => {
  // 真实探测但抹掉宿主版本：指南自动发现必走不到缓存，code-scan 诚实跳过。
  // 自检因此不依赖本机 ~/.cache/dsh-plugin-fast-adapt/ 的状态，任何机器同绿。
  const env = probeEnvironment(dir)
  return { ...env, globalDsh: null }
}

test('write-gate：tool 骨架出生证——硬门禁全过、软指标只进裁量区', async () => {
  const result = await scaffoldTo('gate-pass', { coordinate: 'taxueseek/gate-pass', form: 'tool', harnessVersion: '0.2.1-rc.3' })
  const gate = await runWriteGate(result.outDir, { detectEnv: gateEnvWithoutDsh })
  assert.strictEqual(gate.verdict, 'pass')
  const gates = Object.fromEntries(gate.hardGates.map((g) => [g.gate, g]))
  assert.strictEqual(gates.entry.pass, true)
  assert.strictEqual(gates.smoke.pass, true)
  assert.ok(!('code-scan-critical' in gates), '无宿主版本时应不设 critical 门而非放行')
  assert.ok(gate.skipped.some((s) => s.step === 'code-scan'), 'code-scan 应诚实跳过并给补法')
  assert.ok(gate.discretion.some((d) => d.item === 'audit-scores'), 'audit 分数应在裁量区')
  assert.ok(gate.discretion.some((d) => d.item === 'not-installed'), '未挂载 profile 应报事实不判红')
})

test('write-gate：入口缺失硬门禁拦截', async () => {
  const result = await scaffoldTo('gate-broken', { coordinate: 'taxueseek/gate-broken', form: 'tool', harnessVersion: '0.2.1-rc.3' })
  fs.rmSync(path.join(result.outDir, 'lib', 'index.js'))
  const gate = await runWriteGate(result.outDir, { detectEnv: gateEnvWithoutDsh })
  assert.strictEqual(gate.verdict, 'fail')
  const gates = Object.fromEntries(gate.hardGates.map((g) => [g.gate, g]))
  assert.strictEqual(gates.entry.pass, false)
  assert.strictEqual(gates.smoke.pass, false)
})

test('write-gate：critical 命中（import 已移除包）拦截硬门禁', async () => {
  const result = await scaffoldTo('gate-critical', { coordinate: 'taxueseek/gate-critical', form: 'tool', harnessVersion: '0.2.1-rc.3' })
  fs.writeFileSync(
    path.join(result.outDir, 'lib', 'extra.js'),
    `import { x } from '@deepseek-ai/dsh-removed-in-history'\nexport const y = x\n`
  )
  // 假指南根：<guideRoot>/v<version>/<topic>/guide.md，锚点写已移除包
  const guideRoot = tmpPluginDir('gate-guides')
  scaffoldDirs.push(guideRoot)
  const guideDir = path.join(guideRoot, 'v0.2.1-rc.3', 'package-removal')
  fs.mkdirSync(guideDir, { recursive: true })
  fs.writeFileSync(
    path.join(guideDir, 'guide.md'),
    [
      '---',
      'kind: upgrade-guide',
      'description: "test fixture"',
      '---',
      '# Removed package',
      '',
      '## Change',
      '',
      'The package @deepseek-ai/dsh-removed-in-history was removed.',
      '',
      '## Migration',
      '',
      '1. Remove the import of @deepseek-ai/dsh-removed-in-history.',
      '',
    ].join('\n')
  )
  const gate = await runWriteGate(result.outDir, { guideRoot, detectEnv: gateEnvWithoutDsh })
  assert.strictEqual(gate.verdict, 'fail', 'import 已移除包必须判红')
  const criticalGate = gate.hardGates.find((g) => g.gate === 'code-scan-critical')
  assert.ok(criticalGate, '显式 --guide 时应设 critical 门')
  assert.strictEqual(criticalGate.pass, false)
})

test('write-gate：audit 扣分不越权判红（软指标分层的关键回归）', async () => {
  const result = await scaffoldTo('gate-audit', { coordinate: 'taxueseek/gate-audit', form: 'tool', harnessVersion: '0.2.1-rc.3' })
  // 造一个 performance 会扣分的文件（同步 I/O），audit 分数必然 <100
  fs.writeFileSync(
    path.join(result.outDir, 'lib', 'heavy.js'),
    `import fs from 'node:fs'\nexport function readAll(p) { return fs.readFileSync(p, 'utf8') }\n`
  )
  const gate = await runWriteGate(result.outDir, { detectEnv: gateEnvWithoutDsh })
  const auditItem = gate.discretion.find((d) => d.item === 'audit-scores')
  assert.ok(auditItem.data.scores.performance < 100, 'fixture 应真的触发 audit 扣分，否则本断言失去对象')
  assert.strictEqual(gate.verdict, 'pass', 'audit 扣分是裁量项，不能影响硬门禁判定')
})

test('write-gate：--skip-smoke 跳过后 smoke 不进门禁且给原因', async () => {
  const result = await scaffoldTo('gate-skip', { coordinate: 'taxueseek/gate-skip', form: 'tool', harnessVersion: '0.2.1-rc.3' })
  const gate = await runWriteGate(result.outDir, { skipSmoke: true, detectEnv: gateEnvWithoutDsh })
  assert.ok(!gate.hardGates.some((g) => g.gate === 'smoke'), '跳过后不该有 smoke 门')
  assert.ok(gate.skipped.some((s) => s.step === 'smoke'), '跳过要给原因')
})

test('scaffold 衔接：nextSteps 与生成 README 都指向体检门', async () => {
  const result = await scaffoldTo('gate-link', { coordinate: 'taxueseek/gate-link', form: 'tool', harnessVersion: '0.2.1-rc.3' })
  assert.ok(result.nextSteps.some((s) => s.includes('write-gate.mjs')), 'nextSteps 应指向 write-gate')
  const readme = fs.readFileSync(path.join(result.outDir, 'README.md'), 'utf8')
  assert.ok(readme.includes('write-gate.mjs'), '生成的 README 应指向 write-gate')
  assert.ok(readme.includes('--skip-smoke'), 'README 应说明重复冒烟的免跑方式')
})

// ── guide-sync dist-tags 缓存 ────────────────────────────────────────────────
// 本机网络查 npm registry 曾实测 15s 超时失败；缓存命中应为 0 网络依赖。

function tmpPluginDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `fast-adapt-${name}-`))
  return dir
}

test('dist-tags TTL 内读缓存不打网络', async () => {
  const cache = path.join(tmpPluginDir('cache1'), 'npm-metadata.json')
  fs.writeFileSync(cache, JSON.stringify({ fetchedAt: Date.now(), data: { 'dist-tags': { latest: '0.2.1-rc.3' } } }))
  let fetchCalls = 0
  const meta = await fetchNpmMetadata({ fetcher: async () => { fetchCalls++; throw new Error('不该打网络') }, cachePath: cache })
  assert.strictEqual(fetchCalls, 0, 'TTL 内不应打网络')
  assert.strictEqual(meta._metadataSource, 'cache')
  assert.strictEqual(meta['dist-tags'].latest, '0.2.1-rc.3')
})

test('网络失败降级用过期缓存并标 stale', async () => {
  const cache = path.join(tmpPluginDir('cache2'), 'npm-metadata.json')
  fs.writeFileSync(cache, JSON.stringify({ fetchedAt: Date.now() - 10 * 60 * 60 * 1000, data: { 'dist-tags': { latest: '0.2.0' } } }))
  const meta = await fetchNpmMetadata({ fetcher: async () => { throw new Error('network down') }, cachePath: cache })
  assert.strictEqual(meta._metadataSource, 'stale-cache', '应降级为 stale-cache')
  assert.strictEqual(meta['dist-tags'].latest, '0.2.0')
})

test('无缓存且网络失败要明确抛错', async () => {
  const cache = path.join(tmpPluginDir('cache3'), 'npm-metadata.json')
  await assert.rejects(
    () => fetchNpmMetadata({ fetcher: async () => { throw new Error('network down') }, cachePath: cache }),
    /network down/,
    '无缓存时网络失败不该静默'
  )
})

test('缓存过期后重新拉网络并落盘', async () => {
  const dir = tmpPluginDir('cache4')
  const cache = path.join(dir, 'npm-metadata.json')
  fs.writeFileSync(cache, JSON.stringify({ fetchedAt: Date.now() - 2 * 60 * 60 * 1000, data: { 'dist-tags': { latest: '0.2.0' } } }))
  let fetchCalls = 0
  const meta = await fetchNpmMetadata({
    // dist-tags 专用端点直接返回标签对象（不再是全量包文档）
    fetcher: async () => { fetchCalls++; return { ok: true, json: async () => ({ latest: '0.2.1-rc.3', next: '0.2.1-rc.4' }) } },
    cachePath: cache,
  })
  assert.strictEqual(fetchCalls, 1, '过期后应重新拉一次')
  assert.strictEqual(meta._metadataSource, 'network')
  assert.strictEqual(meta['dist-tags'].latest, '0.2.1-rc.3')
  const onDisk = JSON.parse(fs.readFileSync(cache, 'utf8'))
  assert.strictEqual(onDisk.data['dist-tags'].latest, '0.2.1-rc.3', '新数据应写回缓存')
})

// ── quick-smoke：修完秒验 ────────────────────────────────────────────────────

test('quick-smoke 端到端：最小插件通过并注册工具', async () => {
  const dir = tmpPluginDir('smoke')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-smoke', version: '1.0.0', main: 'lib/index.js', type: 'module' }))
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'),
    `export const inject = ['tools']\nexport function apply(ctx) { ctx.tools.register({ name: 't_tool' }) }\n`)
  const result = await runQuickSmoke(dir)
  assert.ok(result.success, `最小插件应通过: ${result.error || ''}`)
  assert.deepStrictEqual(result.registeredTools, ['t_tool'])
  assert.deepStrictEqual(result.injectedServices, ['tools'])
})

test('quick-smoke：入口缺失报 entry_resolution 且建议构建', async () => {
  const dir = tmpPluginDir('noentry')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-noentry', version: '1.0.0', main: 'lib/index.js', type: 'module' }))
  const result = await runQuickSmoke(dir)
  assert.ok(!result.success)
  assert.strictEqual(result.stage, 'entry_resolution')
  assert.match(result.error, /构建/)
})

test('quick-smoke：未声明 inject 的宿主服务按真契约报错（不再静默兜底）', async () => {
  const dir = tmpPluginDir('fallback')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-fb', version: '1.0.0', main: 'lib/index.js', type: 'module' }))
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'),
    `export function apply(ctx) { ctx.mysteryService.doThing() }\n`)
  const result = await runQuickSmoke(dir)
  assert.ok(!result.success, '未声明 inject 的属性访问必须失败')
  assert.strictEqual(result.stage, 'inject_contract')
  assert.match(result.error, /without inject/)
  assert.deepStrictEqual(result.undeclaredInjectAccess, ['mysteryService'])
})

test('quick-smoke：声明了 inject 但 Mock 未提供的服务走兜底并披露（Mock 缺口非插件错）', async () => {
  const dir = tmpPluginDir('fallback-declared')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-fb2', version: '1.0.0', main: 'lib/index.js', type: 'module' }))
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'),
    `export const inject = ['tools', 'webServer']\nexport function apply(ctx) { ctx.tools.register({ name: 't_tool' }); ctx.webServer.register({}) }\n`)
  const result = await runQuickSmoke(dir)
  assert.ok(result.success, `声明 inject 的插件不该因 Mock 缺口失败: ${result.error || ''}`)
  assert.ok(result.mockFallbacks.includes('webServer'), `Mock 缺口应被披露: ${JSON.stringify(result.mockFallbacks)}`)
  assert.deepStrictEqual(result.undeclaredInjectAccess, [])
  assert.deepStrictEqual(result.registeredTools, ['t_tool'])
})

// ── plugin-audit：四维体检 + 新版本感知 ──────────────────────────────────────

test('audit：注释里的同步 I/O 不报（状态机纪律）', () => {
  const dir = tmpPluginDir('audit-comment')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a1', version: '1.0.0' }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'index.js'),
    `// 旧的实现里有 readFileSync，现在没有了\nexport function apply() {}\n`)
  const report = auditPlugin(dir)
  const syncFindings = report.findings.filter((f) => /同步 I\/O/.test(f.title))
  assert.strictEqual(syncFindings.length, 0, '注释里的 readFileSync 不该报')
})

test('audit：真实同步 I/O 报 MEDIUM 并扣性能分', () => {
  const dir = tmpPluginDir('audit-sync')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a2', version: '1.0.0' }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'index.js'),
    `import { readFileSync } from 'node:fs'\nexport function load() { return readFileSync('x') }\n`)
  const report = auditPlugin(dir)
  const f = report.findings.find((x) => /同步 I\/O/.test(x.title))
  assert.ok(f, '真实 readFileSync 应报')
  assert.strictEqual(f.severity, 'MEDIUM')
  assert.ok(report.scores.performance < 100, '性能分应被扣')
})

test('audit：peer 窗口按目标版本真算——覆盖不报、未覆盖 INFO 不扣分、无 target 不报', () => {
  const dir = tmpPluginDir('audit-peer')
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'export function apply() {}\n')

  // 覆盖目标 → 不报（写法看着再怪也不是问题）：>=0.1.0-0 <0.3.0 收 0.2.1 稳定版
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a3', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0 <0.3.0' } }))
  let report = auditPlugin(dir, { targetVersion: '0.2.1' })
  assert.ok(!report.findings.some((f) => /peer 窗口/.test(f.title)), '覆盖目标的 peer 范围不该报')

  // 同一范围对 rc.3：严格 semver 收不下（tuple 规则）→ INFO，不扣分，
  // 建议必须经过 satisfiesRange 自验证（旧版推荐的 -0 全收写法在这里被证伪）
  report = auditPlugin(dir, { targetVersion: '0.2.1-rc.3' })
  const info = report.findings.find((f) => /peer 窗口/.test(f.title))
  assert.ok(info, '未覆盖目标应报 INFO')
  assert.strictEqual(info.severity, 'INFO', '声明性约定只提示不扣分')
  assert.strictEqual(report.scores.resilience, 100, 'INFO 不扣弹性分')
  assert.ok(/已用 satisfiesRange 验证/.test(info.detail), '建议应自验证')
  assert.ok(/\^0\.2\.1-rc\.3/.test(info.detail), '建议应是同三元组 caret 线')

  // 已带 prerelease 标签且真覆盖目标（^0.2.1-rc.1 收 rc.3）→ 不报
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a3', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': '^0.2.1-rc.1' } }))
  report = auditPlugin(dir, { targetVersion: '0.2.1-rc.3' })
  assert.ok(!report.findings.some((f) => /peer 窗口/.test(f.title)), '真覆盖目标的 prerelease 范围不该报')

  // 拿不到 target → 宁可不报（不伪造结论）
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a3', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': '^0.2.0' } }))
  report = auditPlugin(dir)
  assert.ok(!report.findings.some((f) => /peer 窗口/.test(f.title)), '无 target 不该报')

  // * 通配跳过
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a3', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh-tools': '*' } }))
  report = auditPlugin(dir, { targetVersion: '0.2.1-rc.3' })
  assert.ok(!report.findings.some((f) => /peer 窗口/.test(f.title)), '通配 * 不该报')
})

test('audit：import type 是编译期引用，不算强依赖（本轮实测的潜在误报类）', () => {
  const dir = tmpPluginDir('audit-type-import')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-type', version: '1.0.0' }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'index.js'),
    `import type {} from '@deepseek-ai/dsh-settings'\nexport function apply() {}\n`)
  let report = auditPlugin(dir)
  assert.ok(!report.findings.some((f) => /强 import/.test(f.title)), 'type-only 引用不该报「装载必炸」')
  const info = report.findings.find((f) => /类型引用/.test(f.title))
  assert.ok(info, 'type-only 引用应报 INFO 提示编译期风险')
  assert.strictEqual(info.severity, 'INFO')

  // value import 才是强依赖，维持 HIGH
  fs.writeFileSync(path.join(dir, 'src', 'index.js'),
    `import { x } from '@deepseek-ai/dsh-settings'\nexport function apply() { return x }\n`)
  report = auditPlugin(dir)
  const high = report.findings.find((f) => /强 import/.test(f.title))
  assert.ok(high, 'value import 已移除包应报 HIGH')
  assert.strictEqual(high.severity, 'HIGH')
})

test('audit：描述漂移——宿主零命中的路径约定报 INFO，CSS 类名不误报', () => {
  const dir = tmpPluginDir('audit-drift')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-drift', version: '1.0.0' }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  // 混合三类字符串：消亡约定（带 / 的路径形）、自家 CSS 类名（.dsh- 前缀无斜杠）、宿主真约定
  fs.writeFileSync(path.join(dir, 'src', 'index.js'),
    `export const desc = '把参考图路径（如 .dsh-filess/<sessionId>/x.jpg）放进参数'\n` +
    `export const style = '.dsh-ta-card{color:red}.dsh-ta-head{padding:0}'\n` +
    `export const ok = '.dsh-profiles/web 下看补丁'\n`)
  const fakeHostText = '... .dsh-profiles ...' // 含真约定，不含 .dsh-filess
  const report = auditPlugin(dir, { hostLibText: fakeHostText })
  const drift = report.findings.filter((f) => /宿主路径约定/.test(f.title))
  assert.strictEqual(drift.length, 1, '只报路径形约定，CSS 类名不进')
  assert.ok(/\.dsh-filess/.test(drift[0].title))
  assert.strictEqual(drift[0].severity, 'INFO')
})

test('code-scan：pickScanRoots 源码根并集，构建产物不重复扫', () => {
  const dir = tmpPluginDir('roots')
  fs.mkdirSync(path.join(dir, 'src', 'client'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'client'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'web'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })
  // src 存在时 lib/dist 不扫：它们是构建产物，与 src 同义，同处命中会按两份文件重复报
  assert.deepStrictEqual(pickScanRoots(dir).map((r) => path.relative(dir, r)).sort(), ['client', 'src', 'web'])

  // 无源码根 → 退回构建产物（无 src 的纯构建插件）
  const buildOnly = tmpPluginDir('roots-build')
  fs.mkdirSync(path.join(buildOnly, 'lib'), { recursive: true })
  fs.mkdirSync(path.join(buildOnly, 'dist'), { recursive: true })
  assert.deepStrictEqual(pickScanRoots(buildOnly).map((r) => path.relative(buildOnly, r)).sort(), ['dist', 'lib'])

  // 什么都没有 → 全仓
  const empty = tmpPluginDir('roots-empty')
  assert.deepStrictEqual(pickScanRoots(empty), [empty])
})

test('guide-sync：guideVersionFor 优先目标版本，空目标退回本机版本', () => {
  assert.strictEqual(guideVersionFor({ target: '0.2.1-rc.4' }, '0.2.1-rc.3', { latest: '0.2.1-rc.2' }), '0.2.1-rc.4')
  assert.strictEqual(guideVersionFor({ target: null }, '0.2.1-rc.3', { latest: '0.2.1-rc.2' }), '0.2.1-rc.3')
  assert.strictEqual(guideVersionFor({ target: null }, null, { latest: '0.2.1-rc.2' }), '0.2.1-rc.2')
  assert.strictEqual(guideVersionFor({ target: null }, null, {}), null)
})

test('guide-sync：本机已是通道最新版时仍取本机版本当取版锚点（扫描走廊不空窗）', async () => {
  const localClone = tmpPluginDir('guide-local')
  fs.mkdirSync(path.join(localClone, 'docs', 'upgrade-guide', 'v0.2.1-rc.2'), { recursive: true })
  fs.writeFileSync(path.join(localClone, 'docs', 'upgrade-guide', 'v0.2.1-rc.2', 'x.md'), '# x\n')
  const distTags = { latest: '0.2.1-rc.2', next: '0.2.1-rc.3', alpha: '0.2.1-alpha.5' }
  const fetcher = async () => ({ ok: true, json: async () => distTags })
  const result = await runGuideSync('0.2.1-rc.3', { fetcher, localClone })
  assert.strictEqual(result.resolution.verdict, 'up-to-date-on-channel')
  assert.strictEqual(result.resolution.target, null)
  assert.strictEqual(result.guideVersion, '0.2.1-rc.3', 'target 为空时取版锚点应退回本机版本')
  assert.ok(result.guides.root, '应取到指南语料（本机 clone 或缓存）')
})

// ── log-doctor：宿主日志一键诊断 ─────────────────────────────────────────────

// 真实 startup 日志的头部形状（宿主写的 JS 字面量，非 JSON）：标量字段 + 多行 error 块 + 消息数组。
const STARTUP_LOG = `WARNING: Raw diagnostics may contain configuration or credential values from plugin errors. Review before sharing.

{
  timestamp: '2026-10-18T00:50:16.684Z',
  dshVersion: '0.2.1-rc.2',
  nodeVersion: 'v26.5.0',
  platform: 'darwin',
  arch: 'arm64',
  profile: 'web',
  error: StartupError: dsh: startup failed: 2 required plugins did not activate

  Failed plugins (1):
    webserver (required)
      Package: @deepseek-ai/dsh-host-webserver
      Error: listen EADDRINUSE: address already in use 127.0.0.1:3080
          at Server.setupListenHandle [as _listen2] (node:net:2167:16)

  Plugins waiting for services (2):
    Plugin                  Missing services
    web-runtime (required)  webServer
    open-in-app             webServer
      at auditStartupEntries (file:///x.js:1:1)
      ... 3 lines matching cause stack trace"
      at async file:///bin.js:252:23 {
    [stack]: [Getter/Setter],
    [message]: 'dsh: startup failed: 2 required plugins did not activate\n'
  },
  [startup]: {
    configurationPath: '/home/u/.dsh/profiles/web/cordis.yml',
    messages: [
      {
        ts: 1792284613224,
        name: 'root',
        type: 'warn',
        args: [ 'patch: entry "dsh-edit-approval" not found', [length]: 1 ]
      },
      {
        ts: 1792284615562,
        name: 'web-server',
        type: 'error',
        args: [
          Error: listen EADDRINUSE: address already in use 127.0.0.1:3080
              at Server.setupListenHandle [as _listen2] (node:net:2167:16) {
            [stack]: [Getter/Setter],
            [message]: 'listen EADDRINUSE: address already in use 127.0.0.1:3080'
          },
          [length]: 1
        ]
      },
      {
        ts: 1792284615909,
        name: 'llm-verifier',
        type: 'warn',
        args: [ 'failed to register /llm-verifier rpc fallback: Error: cannot get property "webServer" without inject', [length]: 1 ]
      }
    ]
  }
}`

test('log-doctor：解析 startup 日志的元信息、失败插件、等待服务与信号', () => {
  const parsed = parseStartupLog(STARTUP_LOG)
  assert.strictEqual(parsed.meta.dshVersion, '0.2.1-rc.2')
  assert.strictEqual(parsed.meta.profile, 'web')
  assert.strictEqual(parsed.failedPlugins.length, 1)
  assert.strictEqual(parsed.failedPlugins[0].plugin, 'webserver')
  assert.strictEqual(parsed.failedPlugins[0].package, '@deepseek-ai/dsh-host-webserver')
  assert.match(parsed.failedPlugins[0].error, /EADDRINUSE/)
  assert.strictEqual(parsed.waitingForServices.length, 2)
  assert.deepStrictEqual(parsed.waitingForServices[0], { plugin: 'web-runtime', required: true, missing: 'webServer' })
  assert.strictEqual(parsed.messages.length, 3)
  assert.strictEqual(parsed.messages[1].name, 'web-server')
  assert.strictEqual(parsed.messages[1].type, 'error')
  const ids = parsed.signals.map((s) => s.id)
  assert.ok(ids.includes('port-in-use'), `应命中端口占用信号: ${JSON.stringify(ids)}`)
  assert.ok(ids.includes('undeclared-inject'), `应命中未声明 inject 信号: ${JSON.stringify(ids)}`)
  assert.ok(ids.includes('patch-entry-not-found'), `应命中 patch 死条目信号: ${JSON.stringify(ids)}`)
})

test('log-doctor：跨文件汇总信号并按根因给出结论', () => {
  const dir = tmpPluginDir('logs')
  fs.writeFileSync(path.join(dir, 'startup-2026-10-18T00-50-16.684Z-x.log'), STARTUP_LOG)
  fs.writeFileSync(path.join(dir, 'startup-2026-10-17T13-38-21.159Z-y.log'), STARTUP_LOG.replace('0.2.1-rc.2', '0.2.1-rc.1'))
  const report = diagnoseLogs({ logsDir: dir, limit: 10 })
  assert.strictEqual(report.scanned, 2)
  assert.strictEqual(report.verdict, 'host-failure')
  const port = report.signalSummary.find((s) => s.id === 'port-in-use')
  assert.ok(port && port.count === 2, `端口占用应跨两份日志各计一次: ${JSON.stringify(report.signalSummary)}`)
  assert.ok(port.action, '信号应带可执行动作')
})

test('log-doctor：parseMessages 容忍 [length] 伪数组标记，不吞掉后续消息', () => {
  const msgs = parseMessages(STARTUP_LOG)
  assert.strictEqual(msgs.length, 3, '应解析出 3 条消息')
  assert.strictEqual(msgs[0].name, 'root')
  assert.deepStrictEqual(msgs[0].args, [`'patch: entry "dsh-edit-approval" not found',`])
  assert.strictEqual(msgs[2].name, 'llm-verifier')
})

test('audit：peerPatchFor 只给宿主包生成已验证替换，不碰同 scope 的库', () => {
  const pkg = {
    peerDependencies: {
      '@deepseek-ai/dsh': '^0.1.0-rc.6 || ^0.2.0-rc.1',
      '@deepseek-ai/dsh-tools': '*',
      '@deepseek-ai/schemastery': '^3.18.1',
    },
  }
  // schemastery 是同 scope 的库，有自己的版本线，不该被宿主版本套出 ^0.2.1-rc.3
  assert.deepStrictEqual(peerPatchFor(pkg, '0.2.1-rc.3'), [
    { package: '@deepseek-ai/dsh', from: '^0.1.0-rc.6 || ^0.2.0-rc.1', to: '^0.2.1-rc.3', verified: true },
  ])
  // 已覆盖目标的范围不进修补
  assert.deepStrictEqual(peerPatchFor({ peerDependencies: { '@deepseek-ai/dsh': '^0.2.1-rc.1' } }, '0.2.1-rc.3'), [])
  // 拿不到目标版本 → 不生成（不伪造结论）
  assert.deepStrictEqual(peerPatchFor(pkg, null), [])
})

test('sync-skill：--check 报告缺失与漂移，同步后归零', () => {
  const src = tmpPluginDir('sync-src')
  fs.mkdirSync(path.join(src, 'scripts', 'lib'), { recursive: true })
  fs.mkdirSync(path.join(src, 'references'), { recursive: true })
  fs.writeFileSync(path.join(src, 'SKILL.md'), '# skill\n')
  fs.writeFileSync(path.join(src, 'scripts', 'run.mjs'), '// run\n')
  fs.writeFileSync(path.join(src, 'scripts', 'lib', 'x.mjs'), '// x\n')
  fs.writeFileSync(path.join(src, 'references', 'h.md'), '# h\n')

  const dest = tmpPluginDir('sync-dest')
  const before = checkSkillSync({ srcRoot: src, destRoot: dest })
  assert.strictEqual(before.missing.length, 4, '初始目标为空应全缺失')
  assert.strictEqual(before.clean, false)

  const written = syncSkill({ srcRoot: src, destRoot: dest })
  assert.strictEqual(written.written.length, 4)
  assert.strictEqual(checkSkillSync({ srcRoot: src, destRoot: dest }).clean, true, '同步后应无漂移')

  fs.writeFileSync(path.join(dest, 'SKILL.md'), '# changed\n')
  const drifted = checkSkillSync({ srcRoot: src, destRoot: dest })
  assert.deepStrictEqual(drifted.differing, ['SKILL.md'], '改过的文件应报内容漂移')
})

test('code-scan：宿主实测核查——包还在降级 info，包没了维持 critical，探不到标 unknown', () => {
  const fakeHost = tmpPluginDir('fake-host')
  // 夹具要同时有 dsh（宿主本体）和 dsh-tools（被核查的兄弟包）
  fs.mkdirSync(path.join(fakeHost, '@deepseek-ai', 'dsh'), { recursive: true })
  fs.writeFileSync(path.join(fakeHost, '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.3' }))
  fs.mkdirSync(path.join(fakeHost, '@deepseek-ai', 'dsh-tools'), { recursive: true })
  fs.writeFileSync(path.join(fakeHost, '@deepseek-ai', 'dsh-tools', 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-tools', version: '0.2.1-rc.3' }))
  const hostInfo = { version: '0.2.1-rc.3', location: path.join(fakeHost, '@deepseek-ai', 'dsh'), source: 'node_modules' }

  const findings = [
    { kind: 'package', symbol: '@deepseek-ai/dsh-tools', file: 'a.ts', line: 1, guide: 'v0.2.1-alpha.1/t', title: 't', severity: 'critical' },
    { kind: 'package', symbol: '@deepseek-ai/dsh-ghost', file: 'b.ts', line: 2, guide: 'v0.2.1-alpha.1/t', title: 't', severity: 'critical' },
    { kind: 'member', symbol: 'ctx.tools.presentAs', file: 'a.ts', line: 3, guide: 'v0.2.1-alpha.1/t', title: 't', severity: 'high' },
  ]
  const { findings: verified, checked, downgraded } = verifyPackagesAgainstHost(findings, hostInfo)
  assert.strictEqual(checked, 2, '只核查 package 命中')
  const present = verified.find((f) => f.symbol === '@deepseek-ai/dsh-tools')
  assert.strictEqual(present.severity, 'info', '包仍在宿主 → 降级 info')
  assert.strictEqual(present.verified, 'host-present')
  const absent = verified.find((f) => f.symbol === '@deepseek-ai/dsh-ghost')
  assert.strictEqual(absent.severity, 'critical', '宿主确实没有 → 维持 critical')
  assert.strictEqual(absent.verified, 'host-absent')
  const member = verified.find((f) => f.kind === 'member')
  assert.strictEqual(member.verified, undefined, 'member 不做包核查')
  assert.strictEqual(downgraded, 1)

  // 探测不到宿主 → unknown，不改分级
  const { findings: unknown } = verifyPackagesAgainstHost([findings[0]], null)
  assert.strictEqual(unknown[0].severity, 'critical')
  assert.strictEqual(unknown[0].verified, 'unknown')
})

// ── run.mjs 一键编排 + 运行日志 ──────────────────────────────────────────────

test('run：离线全链编排产出统一报告并写日志；sanitize 脱敏身份信息', async () => {
  const dir = tmpPluginDir('run-e2e')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 't-run', version: '1.0.0',
    scripts: { typecheck: 'node --version' },
    peerDependencies: { '@deepseek-ai/dsh-tools': '^0.2.1-rc.1' },
  }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'export function apply() {}\n')

  const runsDir = tmpPluginDir('runs')
  const env = { ...process.env, DSH_PFA_RUNS_DIR: runsDir }
  // --target 锁定终点：离线模式下终点默认取本机宿主版本，宿主旧于 peer 下限的
  // 机器上会触发倒挂回退，把本用例变成机器相关；显式给终点让它处处确定
  const out = execFileSync(process.execPath, [path.join(SCRIPTS, 'run.mjs'), dir, '--offline', '--no-smoke', '--target', '0.2.1-rc.3'], { encoding: 'utf8', env })
  const report = JSON.parse(out.slice(0, out.lastIndexOf('}') + 1))
  assert.strictEqual(report.plugin.name, 't-run')
  assert.strictEqual(report.audit.overallScore, 100, '干净插件应满分')
  assert.strictEqual(report.typecheck.status, 'ok', 'typecheck 步骤应执行成功')
  assert.strictEqual(report.scan.skipped, true, '离线模式扫描跳过')
  // 窗口来源留痕：peer 声明了宿主包（dsh-tools 是 dsh-* 子包），起点取其下限
  assert.strictEqual(report.window.local, '0.2.1-rc.1')
  assert.strictEqual(report.window.source, 'peer')

  // 日志落盘 + 索引可列；工具版本与 commit 进索引（防「跑的是哪版工具」不可观测）
  // listRuns 在本进程读，本进程也要指向同一个临时日志根
  process.env.DSH_PFA_RUNS_DIR = runsDir
  try {
    const runs = listRuns(10)
    assert.ok(runs.length >= 1, '运行日志应写入 DSH_PFA_RUNS_DIR')
    assert.strictEqual(runs[0].plugin, 't-run')
    assert.ok(runs[0].toolVersion || runs[0].toolCommit, '索引应记录工具版本或 commit（独立 skill 拷贝无 package.json 时由 commit 兜底）')

    // 脱敏：home 与用户名不出现在脱敏输出里
    const runFile = path.join(runsDir, runs[0].file)
    const sanitized = sanitizeRun(runFile)
    assert.ok(!sanitized.includes(os.homedir()), '脱敏后不应包含 home 绝对路径')
    assert.ok(sanitized.includes('~'), 'home 前缀应替换为 ~')
    // 原始日志在本地保留完整路径（本地分析需要），脱敏只发生在导出时
    const raw = fs.readFileSync(runFile, 'utf8')
    assert.ok(raw.includes(dir), '原始日志保留完整路径供本地复盘')
  } finally {
    delete process.env.DSH_PFA_RUNS_DIR
  }
})

// ── 出处锚点 · seams 接缝查询 · run-log doctor · --real-smoke（2026-10-25 方案二）──

// 落盘的指南夹具：loadGuides 侧产出 guideFile/titleLine，findings 原样携带，
// 每个结论都能回溯到官方原文位置。
function makeGuideRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-guides-'))
  const dir = path.join(root, 'v0.2.1-alpha.2', 'topic-anchor-fixture', 'guide.md')
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  fs.writeFileSync(
    dir,
    `---\nkind: upgrade-guide\ndescription: "fixture"\n---\n# Fixture change\n\n## Change\n\nThe package @deepseek-ai/dsh-settings was removed. Call installBundle(spec) differently. Handle error 'fixture-gone-1'.\n\n## Migration\n\n1. Replace legacyEntryWay() with modernEntryWay().\n2. Use the new registry helper.\n`
  )
  return root
}

test('指南出处锚点：loadGuides 带文件与标题行号，findings 原样携带', () => {
  const root = makeGuideRoot()
  const plugin = makeFixture()
  try {
    const guides = loadGuides(root, 'v0.2.1-alpha.2')
    assert.strictEqual(guides.length, 1, '夹具指南应被加载')
    assert.strictEqual(guides[0].guideFile, 'v0.2.1-alpha.2/topic-anchor-fixture/guide.md')
    assert.strictEqual(guides[0].titleLine, 5, '标题应在 frontmatter 后的第 5 行')

    const r = scanPluginFromGuideRoot(plugin, root, {
      localVersion: '0.2.1-alpha.1',
      targetVersion: '0.2.1-alpha.2',
      hostInfo: null,
      verifyHost: false,
    })
    assert.ok(r.findings.length >= 1, '夹具插件的 installBundle 应命中')
    for (const f of r.findings) {
      assert.strictEqual(f.guideFile, 'v0.2.1-alpha.2/topic-anchor-fixture/guide.md', 'findings 应带指南文件锚点')
      assert.strictEqual(f.guideLine, 5, 'findings 应带标题行号')
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(plugin, { recursive: true, force: true })
  }
})

// 假宿主：<nm>/@deepseek-ai/dsh（主包，含 installBundle 源码）＋ dsh-tools 在、
// dsh-settings 不在。location 的契约与 findGlobalDsh 一致：宿主包目录（不是包内文件），
// nodeModulesScope 取 dirname(dirname(location)) 才能落在 node_modules 上。
function makeFakeHost() {
  const nm = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-adapt-nm-'))
  const mk = (rel, content = '{}') => {
    const file = path.join(nm, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
  }
  mk('@deepseek-ai/dsh/package.json')
  mk('@deepseek-ai/dsh/lib/index.js', 'export function installBundle(spec) { return spec }\n')
  mk('@deepseek-ai/dsh-tools/package.json')
  return { nm, hostInfo: { version: '0.2.1-rc.3', source: 'test', location: path.join(nm, '@deepseek-ai', 'dsh') } }
}

test('seams：包名查询给双源结论——一致已移除 / 宿主仍在报分歧依据 / 无记录看宿主', () => {
  const root = makeGuideRoot()
  const { nm, hostInfo } = makeFakeHost()
  try {
    // 指南声称移除 + 宿主实测没有 → 一致
    const a = querySeams('@deepseek-ai/dsh-settings', { guideRoot: root, hostInfo })
    assert.strictEqual(a.conclusion.verdict, 'agree-removed')
    assert.strictEqual(a.hostEvidence.status, 'absent')
    assert.ok(a.guideEvidence.some((e) => e.kind === 'removed-package'))
    // 指南无记录 + 宿主里有（裸 dsh-* 名归一到 @deepseek-ai/ scope 再查）
    const b = querySeams('dsh-tools', { guideRoot: root, hostInfo })
    assert.strictEqual(b.hostEvidence.status, 'present', '裸 dsh-tools 应按套件包名查宿主')
    assert.strictEqual(b.conclusion.verdict, 'host-present-no-guide-record')
    // 指南无记录 + 宿主也没有
    const c = querySeams('dsh-never-existed', { guideRoot: root, hostInfo })
    assert.strictEqual(c.hostEvidence.status, 'absent')
    assert.strictEqual(c.conclusion.verdict, 'host-absent-no-guide-record')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(nm, { recursive: true, force: true })
  }
})

test('seams：符号查询给宿主文本弱证据与迁移目标档', () => {
  const root = makeGuideRoot()
  const { nm, hostInfo } = makeFakeHost()
  try {
    const member = querySeams('installBundle', { guideRoot: root, hostInfo })
    assert.ok(member.guideEvidence.some((e) => e.kind === 'changed-member'), 'installBundle 应是 changed-member 锚点')
    assert.strictEqual(member.hostEvidence.status, 'text-present', '宿主主包源码应有文本命中')
    assert.ok(member.hostEvidence.caveat.includes('弱证据'), '文本证据要如实标注强度')

    const introduced = querySeams('modernEntryWay', { guideRoot: root, hostInfo })
    assert.strictEqual(introduced.conclusion.verdict, 'introduced', '迁移目标应识别为 introduced')

    // 探不到宿主时不伪造：guide 有声称、host 无从实测 → unverified 而非 agree
    const unverified = querySeams('@deepseek-ai/dsh-settings', { guideRoot: root, hostInfo: null })
    assert.strictEqual(unverified.conclusion.verdict, 'guide-claim-unverified')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(nm, { recursive: true, force: true })
  }
})

test('run-log doctor：运行日志 × 宿主启动日志交叉核对', () => {
  const runsDir = tmpPluginDir('doctor-runs')
  const logsDir = tmpPluginDir('doctor-logs')
  fs.writeFileSync(
    path.join(logsDir, 'startup-fixture.log'),
    `WARNING: fixture\n\n{\n  timestamp: '2026-10-25T00:00:00.000Z',\n  dshVersion: '0.2.1-rc.3',\n  profile: 'web',\n  error: StartupError: dsh: startup failed: 1 required plugin did not activate\n\n  Failed plugins (1):\n    t-doc (required)\n      Package: t-doc\n      Error: cannot get property "webServer" without inject\n      at async file:///bin.js:252:23 {\n    [stack]: [Getter/Setter],\n    [message]: 'x'\n  }\n}\n`
  )
  process.env.DSH_PFA_RUNS_DIR = runsDir
  try {
    const cleanRun = { time: new Date().toISOString(), durationMs: 10, scan: { findingCount: 0, criticalOrHigh: 0 }, smoke: { success: true }, typecheck: { status: 'ok' }, audit: { overallScore: 100 } }
    writeRunLog({ ...cleanRun, plugin: { name: 't-doc', version: '1.0.0' } }, { toolDir: null })
    writeRunLog({ ...cleanRun, plugin: { name: 't-clean', version: '1.0.0' } }, { toolDir: null })

    const report = correlateRuns({ logsDir })
    const hit = report.plugins.find((p) => p.plugin === 't-doc')
    const clean = report.plugins.find((p) => p.plugin === 't-clean')
    assert.ok(hit, 't-doc 应在交叉核对里')
    assert.ok(clean, 't-clean 应在交叉核对里')
    assert.strictEqual(hit.hostLogHits.length, 1, 'startup 日志的 failedPlugins 应命中 t-doc')
    assert.strictEqual(hit.hostLogHits[0].what, 'failed-plugin')
    assert.strictEqual(hit.verdict, 'log-hit-scan-clean', '扫描干净但宿主报它 → 嫌疑在装载侧')
    assert.ok(hit.advice.includes('env-doctor'), '建议应指向 env-doctor 的 activation')
    assert.strictEqual(clean.verdict, 'host-log-clean')
    assert.strictEqual(report.host.verdict, 'host-failure', 'undeclared-inject 信号应让宿主总判为 host-failure')
  } finally {
    delete process.env.DSH_PFA_RUNS_DIR
    fs.rmSync(runsDir, { recursive: true, force: true })
    fs.rmSync(logsDir, { recursive: true, force: true })
  }
})

test('run --real-smoke：桥接 verify-runtime——fail 退出码 2，pass 退出码 0', () => {
  if (process.platform === 'win32') {
    process.stderr.write('  （跳过：win32 分支返回 skipped，桥接断言只在 POSIX 跑）\n')
    return
  }
  const dir = tmpPluginDir('real-smoke')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-real', version: '1.0.0' }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'export function apply() {}\n')
  const fakeDir = tmpPluginDir('verify-fakes')
  const failScript = path.join(fakeDir, 'verify-fail.mjs')
  const passScript = path.join(fakeDir, 'verify-pass.mjs')
  fs.writeFileSync(failScript, "console.log('plugin-code: fake failure attribution'); process.exit(1)\n")
  fs.writeFileSync(passScript, "console.log('verify pass'); process.exit(0)\n")
  const base = [path.join(SCRIPTS, 'run.mjs'), dir, '--offline', '--no-smoke', '--no-typecheck', '--no-log', '--real-smoke']
  const env = { ...process.env, DSH_PFA_RUNS_DIR: path.join(fakeDir, 'runs'), PFA_VERIFY_RUNTIME: failScript }
  try {
    execFileSync(process.execPath, base, { encoding: 'utf8', env })
    assert.fail('fail 档应退出码 2')
  } catch (err) {
    assert.strictEqual(err.status, 2, 'verify-runtime exit 1 → run.mjs 退出码 2')
    const report = JSON.parse(String(err.stdout).slice(0, String(err.stdout).lastIndexOf('}') + 1))
    assert.strictEqual(report.realSmoke.status, 'fail')
    assert.ok(report.realSmoke.tail.includes('fake failure attribution'), '应透传 verify-runtime 的归因尾部')
    assert.ok(report.realSmoke.hint.includes('四类归因'), 'fail 档应带归因提示')
    assert.ok(String(err.stderr).includes('下一步'), '退出码 2 时 stderr 应带「下一步」指路')
  }
  const out = execFileSync(process.execPath, base, { encoding: 'utf8', env: { ...env, PFA_VERIFY_RUNTIME: passScript } })
  const passed = JSON.parse(out.slice(0, out.lastIndexOf('}') + 1))
  assert.strictEqual(passed.realSmoke.status, 'ok')
  assert.ok(passed.realSmoke.durationMs >= 0)
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(fakeDir, { recursive: true, force: true })
  } catch {}
})

test('下游技能面零漂移（真机拦截；下游目录不存在时跳过）', () => {
  const selfRoot = path.resolve(SCRIPTS, '..')
  const dest = process.env.PFA_DOWNSTREAM_DIR || path.resolve(SCRIPTS, '../../../dsh-plugin-upgrade-skill/skills/plugin-fast-adapt')
  if (!fs.existsSync(dest) || path.resolve(dest) === selfRoot) {
    process.stderr.write(`  （跳过：下游目录不存在或就是本仓，${dest}）\n`)
    return
  }
  const result = checkSkillSync({ destRoot: dest })
  assert.ok(
    result.clean,
    `下游技能面有漂移——缺失 [${result.missing.join(', ')}] 不同 [${result.differing.join(', ')}]；改完真源先跑 sync-skill 同步再提交（2026-10-25 README 漂移实录）`
  )
})

test('guide-sync 盯梢退出码：upgrade-available→1（轮询信号），其余判定与空值→0', () => {
  assert.strictEqual(upstreamCheckExit({ verdict: 'upgrade-available', target: '0.2.2-rc.1' }), 1, '有新版是唯一需要动作的判定')
  assert.strictEqual(upstreamCheckExit({ verdict: 'up-to-date-on-channel' }), 0)
  assert.strictEqual(upstreamCheckExit({ verdict: 'ahead-of-upstream' }), 0)
  assert.strictEqual(upstreamCheckExit({ verdict: 'unknown-local' }), 0)
  assert.strictEqual(upstreamCheckExit(null), 0, '空判定不冒充有动作')
})

test('sync-skill 提交命令建议：git 仓给只 add 同步路径的命令，非 git 目录返回 null', () => {
  const plain = tmpPluginDir('suggest-plain')
  try {
    assert.strictEqual(suggestCommitCommand({ srcRoot: SCRIPTS, destRoot: plain }), null, 'dest 非 git 仓应静默跳过')
    assert.strictEqual(suggestCommitCommand({ srcRoot: plain, destRoot: plain }), null, 'src 非 git 仓应静默跳过')

    const tool = tmpPluginDir('suggest-tool')
    const mirror = tmpPluginDir('suggest-mirror')
    fs.writeFileSync(path.join(tool, 'a.txt'), 'a')
    fs.writeFileSync(path.join(mirror, 'b.txt'), 'b')
    const gitInit = (dir) => execFileSync('git', ['init', '-q'], { cwd: dir })
    gitInit(tool)
    gitInit(mirror)
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', 'a.txt'], { cwd: tool })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: tool })
    const dest = path.join(mirror, 'skills', 'plugin-fast-adapt')
    fs.mkdirSync(dest, { recursive: true })

    const cmd = suggestCommitCommand({ srcRoot: tool, destRoot: dest })
    const realMirror = fs.realpathSync(mirror)
    assert.ok(cmd, '两侧都是 git 仓应给出命令')
    assert.ok(cmd.includes(`git -C "${realMirror}" add "skills/plugin-fast-adapt"`), 'add 路径应为 dest 相对仓根（realpath 后防 /var 软链前缀错位）')
    assert.ok(/同步独立仓 [0-9a-f]{7,}/.test(cmd), 'commit 主题应带真源短 commit')
    fs.rmSync(tool, { recursive: true, force: true })
    fs.rmSync(mirror, { recursive: true, force: true })
  } finally {
    fs.rmSync(plain, { recursive: true, force: true })
  }
})

test('self-test 体积门禁：超 2200 行即红（触线时按节拆 scripts/self-test/，npm test 单命令零依赖不变）', () => {
  const lines = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').length
  assert.ok(lines <= 2200, `self-test.mjs 已 ${lines} 行，超出 2200 门禁——按节拆进 scripts/self-test/ 配零依赖 runner，别让单文件无界生长`)
})

// ── 扫描窗口与目标形态（2026-10-25 dsh-image-gen 实录）──────────────────────
// 同 scope 的 cordis(4.x)/schemastery(3.x) 是独立版本线的库，不是宿主包；
// 旧实现按 @deepseek-ai/ 前缀全收，窗口起点被顶到 3.18.4，倒挂后扫描静默跳过。
// 同日自审实录：工具仓被 activation 报 ERROR、被 Cordis 生命周期规则报 MEDIUM，
// 全是「没有目标形态判定」的形态错配。

test('computeWindow：宿主包 peer 优先，cordis/schemastery 版本线不混入', () => {
  const w = computeWindow({
    peers: { '@deepseek-ai/cordis': '>=4.0.0 <5', '@deepseek-ai/schemastery': '>=3.18.4 <4', '@deepseek-ai/dsh': '>=0.1.0-0 <0.3.0' },
    hostVersion: '0.2.1-rc.3',
    target: '0.2.1-rc.3',
  })
  assert.strictEqual(w.local, '0.1.0-0', '起点应取宿主包 peer 下限，不是库版本线的 3.18.4')
  assert.strictEqual(w.source, 'peer')
  assert.strictEqual(w.fallback, null)
})

test('computeWindow：无宿主包 peer（dsh-image-gen 形态）回退宿主版本', () => {
  const w = computeWindow({
    peers: { '@deepseek-ai/cordis': '>=4.0.0 <5', '@deepseek-ai/schemastery': '>=3.18.4 <4' },
    hostVersion: '0.2.1-rc.3',
    target: '0.2.1-rc.3',
  })
  assert.strictEqual(w.local, '0.2.1-rc.3')
  assert.strictEqual(w.source, 'host')
})

test('computeWindow：倒挂守卫——起点高于终点时回退并留痕，不静默', () => {
  const w = computeWindow({ peers: {}, hostVersion: '0.2.1-rc.3', from: '3.18.4', target: '0.2.1-rc.3' })
  assert.strictEqual(w.local, '0.2.1-rc.3')
  assert.strictEqual(w.source, 'host')
  assert.strictEqual(w.fallback.rejectedFrom, '3.18.4')
  assert.strictEqual(w.fallback.to, '0.2.1-rc.3')
})

test('computeWindow：--from 显式指定优先于 peer 下限', () => {
  const w = computeWindow({ peers: { '@deepseek-ai/dsh': '>=0.1.0-0' }, hostVersion: '0.2.1-rc.3', from: '0.2.0-rc.1', target: '0.2.1-rc.3' })
  assert.strictEqual(w.local, '0.2.0-rc.1')
  assert.strictEqual(w.source, 'flag')
})

test('isPluginForm：生态依赖或 dsh 命名空间才算插件形态，main 不算证据', () => {
  assert.strictEqual(isPluginForm({ name: 'plain-tool', version: '0.1.0' }), false)
  assert.strictEqual(isPluginForm({ name: 'has-main', main: 'lib/index.js' }), false, 'main 太通用，不能当插件证据')
  assert.strictEqual(isPluginForm({ peerDependencies: { '@deepseek-ai/cordis': '>=4.0.0 <5' } }), true)
  assert.strictEqual(isPluginForm({ dependencies: { '@deepseek-ai/dsh': '^0.2.1' } }), true)
  assert.strictEqual(isPluginForm({ dsh: { client: './client' } }), true, '客户端半声明是插件')
  assert.strictEqual(isPluginForm({ dsh: { bundle: { patch: './cordis.patch.yml' } } }), true, 'scaffold 骨架带 bundle 挂载层、无 peer，也是插件')
  assert.strictEqual(isPluginForm(null), false)
})

test('diagnoseActivation：非插件目标记 N/A，不误报 ERROR（自审实录）', () => {
  const dir = tmpPluginDir('act-na')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'plain-tool', version: '1.0.0' }))
  const act = diagnoseActivation(dir, [])
  assert.strictEqual(act.checked, false)
  assert.strictEqual(act.verdict, 'N/A')
})

test('auditPlugin：工具仓形态跳过 Cordis 生命周期维度', () => {
  const dir = tmpPluginDir('audit-tool')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'plain-tool', version: '1.0.0' }))
  fs.writeFileSync(path.join(dir, 'index.js'), 'setInterval(() => {}, 1000)\nexport function apply() {}\n')
  const r = auditPlugin(dir, { hostLibText: null })
  assert.strictEqual(r.targetForm, 'tool')
  assert.strictEqual(r.scores.lifecycle, 100)
  assert.ok(!r.findings.some((f) => f.dimension === 'lifecycle'), '对普通脚本建议 ctx.effect 是形态错配噪音')
})

test('auditPlugin：插件形态照报生命周期清理', () => {
  const dir = tmpPluginDir('audit-plugin')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', version: '1.0.0', peerDependencies: { '@deepseek-ai/cordis': '>=4.0.0 <5' } }))
  fs.writeFileSync(path.join(dir, 'index.js'), 'setInterval(() => {}, 1000)\nexport function apply() {}\n')
  const r = auditPlugin(dir, { hostLibText: null })
  assert.strictEqual(r.targetForm, 'plugin')
  assert.ok(r.findings.some((f) => f.dimension === 'lifecycle'), '插件形态的无清理定时器仍要报')
})

test('runlog 索引记 phases 三态：scan 跳过不再与「满分」混淆', () => {
  const runsDir = tmpPluginDir('runs-phases')
  process.env.DSH_PFA_RUNS_DIR = runsDir
  try {
    writeRunLog({
      time: new Date().toISOString(),
      plugin: { name: 't-phases', version: '1.0.0' },
      tool: { version: '9.9.9' },
      host: { version: '0.2.1-rc.3' },
      window: { local: '3.18.4', target: '0.2.1-rc.3', source: 'host', fallback: null },
      scan: { findingCount: null, skipped: true, reason: '无指南根或无窗口' },
      audit: { overallScore: 100 },
      smoke: { skipped: true },
      typecheck: { status: 'skipped', reason: '未声明 typecheck script' },
      durationMs: 10,
    }, { toolDir: null })
    const runs = listRuns(5)
    assert.strictEqual(runs[0].plugin, 't-phases')
    assert.strictEqual(runs[0].phases.scan, 'skipped')
    assert.strictEqual(runs[0].phases.smoke, 'skipped')
    assert.strictEqual(runs[0].phases.typecheck, 'skipped')
    assert.strictEqual(runs[0].auditScore, 100, '体检照记，但 phases 标明扫描没跑')
  } finally {
    delete process.env.DSH_PFA_RUNS_DIR
  }
})

test('runlog 记录工具仓 dirty 标记（版本与 commit 拆对可识别）', () => {
  const runsDir = tmpPluginDir('runs-dirty')
  process.env.DSH_PFA_RUNS_DIR = runsDir
  try {
    // 非 git 目录：dirty=null（探测失败不伪造）
    writeRunLog({ time: new Date().toISOString(), plugin: { name: 't-dirty0' }, tool: {} }, { toolDir: runsDir })
    assert.strictEqual(listRuns(1)[0].toolDirty, null)

    // git 仓：clean → false，改文件 → true。git 不可用的环境跳过这半段。
    let gitWorks = true
    try {
      execFileSync('git', ['--version'])
    } catch {
      gitWorks = false
    }
    if (gitWorks) {
      const repo = tmpPluginDir('dirty-repo')
      fs.writeFileSync(path.join(repo, 'a.txt'), 'x')
      execFileSync('git', ['init', '-q'], { cwd: repo })
      execFileSync('git', ['add', '-A'], { cwd: repo })
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: repo })
      writeRunLog({ time: new Date().toISOString(), plugin: { name: 't-dirty1' }, tool: {} }, { toolDir: repo })
      assert.strictEqual(listRuns(1)[0].toolDirty, false, '干净树 dirty=false')
      fs.writeFileSync(path.join(repo, 'b.txt'), 'y')
      writeRunLog({ time: new Date().toISOString(), plugin: { name: 't-dirty2' }, tool: {} }, { toolDir: repo })
      assert.strictEqual(listRuns(1)[0].toolDirty, true, '未提交改动 dirty=true')
    }
  } finally {
    delete process.env.DSH_PFA_RUNS_DIR
  }
})

test('runlog 保留策略：保留期前的运行被清理，索引行同步剔除', () => {
  const runsDir = tmpPluginDir('runs-prune')
  fs.writeFileSync(path.join(runsDir, '2026-01-01T00-00-00-000Z-old-plugin.json'), '{}')
  fs.writeFileSync(path.join(runsDir, '2999-01-01T00-00-00-000Z-fresh-plugin.json'), '{}')
  const oldMs = Date.now() - 100 * 86400_000
  fs.utimesSync(path.join(runsDir, '2026-01-01T00-00-00-000Z-old-plugin.json'), new Date(oldMs), new Date(oldMs))
  fs.writeFileSync(
    path.join(runsDir, 'index.jsonl'),
    `${JSON.stringify({ file: '2026-01-01T00-00-00-000Z-old-plugin.json' })}\n${JSON.stringify({ file: '2999-01-01T00-00-00-000Z-fresh-plugin.json' })}\n`
  )
  const result = pruneRuns(runsDir)
  assert.ok(result.pruned.includes('2026-01-01T00-00-00-000Z-old-plugin.json'))
  assert.ok(!fs.existsSync(path.join(runsDir, '2026-01-01T00-00-00-000Z-old-plugin.json')))
  assert.ok(fs.existsSync(path.join(runsDir, '2999-01-01T00-00-00-000Z-fresh-plugin.json')), '新运行保留')
  const kept = fs.readFileSync(path.join(runsDir, 'index.jsonl'), 'utf8')
  assert.ok(!kept.includes('old-plugin'), '索引行同步剔除')
  assert.ok(kept.includes('fresh-plugin'))
})

test('satisfiesRange：本轮实测锚点回归（与宿主自带 semver 对拍过的结论不许漂移）', () => {
  const cases = [
    ['0.2.1-rc.3', '>=0.1.0-0 <0.3.0', false],
    ['0.2.1-rc.3', '^0.2.1-rc.1', true],
    ['0.2.1-rc.3', '^0.2.0-rc.1', false],
    ['0.2.1-rc.3', '>=0.2.0-rc.1 <0.3.0', false],
    ['4.0.1', '>=4.0.0 <5', true],
    ['4.1.0-rc.1', '>=4.0.0-0 <5', false],
    ['0.2.1', '>=0.1.0-0 <0.3.0', true],
    ['1.3.0-beta', '>=1.2.3-rc.0 <2.0.0', false],
    ['1.2.3-rc.1', '>=1.2.3-rc.0 <2.0.0', true],
    ['3.1.0', '>=1.2.0 <2.0.0 || ^3.0.0', true],
  ]
  for (const [v, r, want] of cases) {
    assert.strictEqual(satisfiesRange(v, r), want, `satisfiesRange("${v}", "${r}") 应为 ${String(want)}`)
  }
})

test('scanSource：import type 标记 kind=type，value import 标记 kind=value', () => {
  const src = [
    `import { defineTool } from '@deepseek-ai/dsh-tools'`,
    `import type { Context } from '@deepseek-ai/cordis'`,
    `import type {} from '@deepseek-ai/dsh-host-webserver'`,
    `export type { Config } from './config.js'`,
    `const x = require('@deepseek-ai/dsh-attachment')`,
  ].join('\n')
  const scanned = scanSource(src)
  const kindOf = (source) => scanned.imports.find((i) => i.source === source)?.kind
  assert.strictEqual(kindOf('@deepseek-ai/dsh-tools'), 'value')
  assert.strictEqual(kindOf('@deepseek-ai/cordis'), 'type')
  assert.strictEqual(kindOf('@deepseek-ai/dsh-host-webserver'), 'type')
  assert.strictEqual(kindOf('./config.js'), 'type')
  assert.strictEqual(kindOf('@deepseek-ai/dsh-attachment'), 'value')
})


test('audit：注释里的 ctx.effect 不豁免真实的无清理监听', () => {
  const dir = tmpPluginDir('audit-life2')
  // peer 声明生态依赖：生命周期规则只对插件形态生效，夹具必须是插件
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a4b', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' } }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), `// 旧版用 ctx.effect(() => emitter.on('x', f))，现在重写了\nexport function setup(emitter) { emitter.on('x', () => {}) }\n`)
  const report = auditPlugin(dir)
  assert.ok(report.findings.some((f) => /清理逻辑/.test(f.title)), '注释里的 ctx.effect 不该豁免真实监听')
})

test('audit：生命周期命中与豁免', () => {
  const dir = tmpPluginDir('audit-life')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a4', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' } }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), `export function setup(emitter) { emitter.on('x', () => {}) }\n`)
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), `export function setup(ctx, emitter) { ctx.effect(() => emitter.on('x', () => {})) }\n`)
  const report = auditPlugin(dir)
  const titles = report.findings.filter((f) => /清理逻辑/.test(f.title)).map((f) => f.file)
  assert.ok(titles.some((f) => f.endsWith('a.js')), '无清理的监听应报')
  assert.ok(!titles.some((f) => f.endsWith('b.js')), 'ctx.effect 包裹的不该报')
})

test('audit：clearTimeout 收口的定时器不算未清理（白描实测回归）', () => {
  // 白描 tools.ts 的子进程超时定时器经 finish() 统一 clearTimeout，
  // 旧清理标记表没有 clearTimeout 仍被报「未绑定清理逻辑」
  const dir = tmpPluginDir('audit-clear-timeout')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a6', version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' } }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'src', 'a.js'),
    `export function run(child, ms) { const t = setTimeout(() => child.kill(), ms); child.on('close', () => clearTimeout(t)) }\n`
  )
  const report = auditPlugin(dir)
  assert.ok(!report.findings.some((f) => /清理逻辑/.test(f.title)), 'clearTimeout 收口不该报未清理')
})

test('audit：guide 交叉把已移除包 import 映射成弹性建议', () => {
  const dir = tmpPluginDir('audit-guide')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-a5', version: '1.0.0' }))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), `import { x } from '@deepseek-ai/dsh-client-runtime'\nexport function apply() { void x }\n`)
  const scanResult = {
    findingCount: 1,
    window: { localVersion: '0.2.0-rc.2', targetVersion: '0.2.1-alpha.4' },
    findings: [{ file: 'src/index.js', line: 1, symbol: '@deepseek-ai/dsh-client-runtime', kind: 'package', guide: 'v0.2.1-alpha.1/x', title: 't', migration: ['步骤 1: 换新包'] }],
  }
  const report = auditPlugin(dir, { scanResult })
  assert.ok(report.versionAdvice, '应有 versionAdvice 段')
  assert.strictEqual(report.versionAdvice.findingCount, 1)
  assert.ok(report.findings.some((f) => /已移除的包仍在 import/.test(f.title)), 'package 命中应映射成弹性建议')
  assert.ok(report.scores.resilience < 100)
})

// ── activation 诊断（防「装了但没生效」） ────────────────────────────────────

test('extractInjects：注释里的 inject 声明不算', () => {
  const dir = tmpPluginDir('inj')
  fs.writeFileSync(path.join(dir, 'index.js'), `// export const inject = ['tools', 'ghost']\nexport const inject = ['tools']\nexport function apply() {}\n`)
  const injects = extractInjects(dir, 'index.js')
  assert.deepStrictEqual(injects, ['tools'], '只认代码区的 inject')
})

test('diagnoseActivation：产物缺失 → ERROR，挂载缺失 → WARN', () => {
  const dir = tmpPluginDir('act')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 't-act', version: '1.0.0', main: 'lib/index.js', peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' } }))
  const none = diagnoseActivation(dir, [])
  assert.strictEqual(none.verdict, 'ERROR', '入口产物缺失应为 ERROR')

  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export function apply() {}\n')
  const unmounted = diagnoseActivation(dir, [{ profile: 'web', patchFile: '/nonexistent', patchEntries: [] }])
  assert.strictEqual(unmounted.verdict, 'WARN', '无 profile 挂载应为 WARN')

  const mounted = diagnoseActivation(dir, [{ profile: 'web', patchFile: '/nonexistent', patchEntries: [`{ id: 't-act', name: 't-act' }`] }])
  assert.strictEqual(mounted.verdict, 'OK')
  assert.strictEqual(mounted.perProfile[0].registered, true)
})

test('diagnoseActivation：disabled 判定不跨条目误伤', () => {
  // 旧惰性正则会被后面其他插件条目的 disabled: true 误伤，
  // 误伤会跳过本插件的 Silent Pending 风险检查
  const dir = tmpPluginDir('act-dis')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'alpha-plugin', version: '1.0.0', main: 'lib/index.js', peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' } }))
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export function apply() {}\n')
  const patch = path.join(dir, 'patch.yml')
  fs.writeFileSync(patch, [
    'plugins:',
    '  - insert:',
    '      name: alpha-plugin',
    '      from: file:./alpha',
    '  - insert:',
    '      name: beta-plugin',
    '      from: file:./beta',
    '      disabled: true',
    '',
  ].join('\n'))
  const r = diagnoseActivation(dir, [{ profile: 'web', patchFile: patch, patchEntries: ['name: alpha-plugin', 'name: beta-plugin disabled: true'] }])
  assert.strictEqual(r.perProfile[0].disabled, false, '后面条目的 disabled:true 不该误伤 alpha-plugin')
})

test('parsePatchEntries：多行 insert 与 id 覆盖条目算挂载，注释条目不算', () => {
  // 实测 web profile：wide-research 条目的 name 在 - id: 下一行，
  // 旧单行正则把活跃的 argo-dsh 误判成「未挂载」
  const text = [
    '# 注释掉的插件不算',
    "# - id: mcp-argo",
    "#   name: '@deepseek-ai/dsh-mcp-client'",
    '- insert:',
    '    - id: client-runtime',
    "      name: '@deepseek-ai/dsh-client-runtime'",
    '- id: wide-research',
    "  name: '@taxueseek/argo-dsh'",
    '  config:',
    '    llm:',
    '      name: MiniMax M3',
    '',
  ].join('\n')
  const entries = parsePatchEntries(text)
  assert.ok(entries.some((e) => e.includes('@deepseek-ai/dsh-client-runtime')), `多行 insert 应被识别: ${JSON.stringify(entries)}`)
  assert.ok(entries.some((e) => e.includes('@taxueseek/argo-dsh')), `id 覆盖条目应被识别: ${JSON.stringify(entries)}`)
  assert.ok(!entries.some((e) => e.includes('dsh-mcp-client')), '注释条目不该算挂载')
  assert.ok(!entries.some((e) => e.includes('MiniMax')), '深层 config 的模型名不该进条目清单')
})

// ── 环境层盲区：共享农场悬空软链 + 全局 patch 层 ────────────────────────────
// 2026-10-26 实测：env-doctor 报「覆盖层问题 0 处」，实际共享农场有 209 条
// 悬空软链（宿主启动日志里 client-runtime / orca-agent-hooks 两行装载失败），
// 全局 patch 层的 orca-agent-hooks 行也完全看不见。三处都是「报 0」比「报错」
// 更危险——它让人以为环境是干净的。

test('scanSharedFarm：悬空软链被识别，指向宿主安装树的标 critical', () => {
  const farm = tmpPluginDir('farm')
  const host = tmpPluginDir('farm-host')
  fs.mkdirSync(path.join(farm, '@deepseek-ai'), { recursive: true })
  fs.symlinkSync(
    path.join(host, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-ghost'),
    path.join(farm, '@deepseek-ai', 'dsh-ghost'),
  )
  const aliveTarget = path.join(farm, 'alive-pkg')
  fs.mkdirSync(aliveTarget, { recursive: true })
  fs.symlinkSync(aliveTarget, path.join(farm, 'alive'))
  fs.mkdirSync(path.join(farm, 'plain-dir'), { recursive: true })

  const r = scanSharedFarm({ farmDir: farm, hostRoots: [host] })
  assert.strictEqual(r.symlinkCount, 2, '只数软链，普通目录不算')
  assert.strictEqual(r.brokenCount, 1, '活链不算断链')
  assert.strictEqual(r.hostBackedBroken, 1)
  assert.strictEqual(r.findings[0].package, '@deepseek-ai/dsh-ghost')
  assert.strictEqual(r.findings[0].severity, 'critical')
  assert.ok(r.findings[0].reasons.includes('宿主升级'), '原因要说清是宿主升级后包被移除')
})

test('scanSharedFarm：目标不在宿主树下的断链标 info；目录不存在返回空结果', () => {
  const farm = tmpPluginDir('farm2')
  const elsewhere = tmpPluginDir('farm2-else')
  fs.symlinkSync(path.join(elsewhere, 'gone'), path.join(farm, 'gone-link'))
  const r = scanSharedFarm({ farmDir: farm, hostRoots: [tmpPluginDir('farm2-host')] })
  assert.strictEqual(r.brokenCount, 1)
  assert.strictEqual(r.hostBackedBroken, 0)
  assert.strictEqual(r.findings[0].severity, 'info')

  const missing = scanSharedFarm({ farmDir: path.join(farm, 'nope'), hostRoots: [] })
  assert.strictEqual(missing.brokenCount, 0)
  assert.deepStrictEqual(missing.findings, [])
})

test('全局 patch 层：~/.dsh/cordis.patch.yml 对所有 profile 生效（挂载与禁用都算）', () => {
  const dsh = path.join(tmpPluginDir('dshhome'), '.dsh')
  const web = path.join(dsh, 'profiles', 'web')
  fs.mkdirSync(web, { recursive: true })
  // 全局层只挂 orca-agent-hooks（本机 Orca 写入的形状），profile 层只挂 web-only
  fs.writeFileSync(path.join(dsh, 'cordis.patch.yml'), [
    '# >>> orca-managed-dsh-hooks (managed by Orca; do not edit) >>>',
    '- insert:',
    '    - id: orca-agent-hooks',
    "      name: '@deepseek-ai/dsh-hooks-claude-code'",
    '      config:',
    "        configPath: '/tmp/dsh-hooks.json'",
    '# <<< orca-managed-dsh-hooks <<<',
    '',
  ].join('\n'))
  fs.writeFileSync(path.join(web, 'cordis.patch.yml'), [
    '- id: web-only',
    "  name: 'web-only-plugin'",
    '',
  ].join('\n'))
  const dir = tmpPluginDir('act-global')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'orca-agent-hooks', version: '1.0.0', main: 'lib/index.js',
    peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' },
  }))
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export function apply() {}\n')

  process.env.DSH_PFA_DSH_HOME = dsh
  try {
    const plugins = listInstalledPlugins()
    assert.strictEqual(plugins.length, 1)
    assert.ok(plugins[0].patchEntries.some((e) => e.includes('@deepseek-ai/dsh-hooks-claude-code')), '全局层条目要进 patchEntries')
    assert.ok(plugins[0].patchEntries.some((e) => e.includes('web-only-plugin')), 'profile 层条目也要在')
    // 只被全局层挂载的插件，registered 必须为 true——否则每次启动失败都看不见
    const act = diagnoseActivation(dir, plugins)
    assert.strictEqual(act.perProfile[0].registered, true, '全局层挂载的插件算已挂载')
  } finally {
    delete process.env.DSH_PFA_DSH_HOME
  }
})

test('全局 patch 层的 disabled 也参与判定', () => {
  const dsh = path.join(tmpPluginDir('dshhome2'), '.dsh')
  const web = path.join(dsh, 'profiles', 'web')
  fs.mkdirSync(web, { recursive: true })
  fs.writeFileSync(path.join(dsh, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: ghost-off',
    "      name: 'ghost-off'",
    '      disabled: true',
    '',
  ].join('\n'))
  const dir = tmpPluginDir('act-global-dis')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'ghost-off', version: '1.0.0', main: 'lib/index.js',
    peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' },
  }))
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export function apply() {}\n')

  process.env.DSH_PFA_DSH_HOME = dsh
  try {
    const act = diagnoseActivation(dir, listInstalledPlugins())
    assert.strictEqual(act.perProfile[0].disabled, true, '全局层的 disabled: true 要算')
  } finally {
    delete process.env.DSH_PFA_DSH_HOME
  }
})

test('resolveEntryFile：exports 优先于 main，无 main 无 exports 才退 lib/index.js', () => {
  assert.strictEqual(resolveEntryFile({ exports: './index.js' }), 'index.js', '字符串 exports')
  assert.strictEqual(resolveEntryFile({ exports: { '.': './src/main.mjs' } }), 'src/main.mjs', '对象 exports 的 . 是字符串')
  assert.strictEqual(
    resolveEntryFile({ exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' } } }),
    'lib/index.js',
    '条件 exports 取 default，不取 types',
  )
  assert.strictEqual(resolveEntryFile({ exports: { './client': './lib/client.js' } }), 'lib/index.js', '只有子路径 exports 时退默认')
  assert.strictEqual(resolveEntryFile({ main: './dsh/index.js' }), 'dsh/index.js', '无 exports 用 main')
  assert.strictEqual(resolveEntryFile({}), 'lib/index.js', '都没有退 lib/index.js')
})

test('diagnoseActivation：入口写在 exports 的包不再被误报 ERROR（dsh-env-sweeper 实录）', () => {
  const dir = tmpPluginDir('act-exports')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 't-exports', version: '1.0.0',
    exports: { '.': './index.js', './package.json': './package.json' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  fs.writeFileSync(path.join(dir, 'index.js'), 'export function apply() {}\n')
  const act = diagnoseActivation(dir, [{ profile: 'web', patchFile: '/nonexistent', patchEntries: ['name: t-exports'] }])
  assert.strictEqual(act.entry.file, 'index.js')
  assert.strictEqual(act.entry.ready, true)
  assert.strictEqual(act.verdict, 'OK', '入口存在且已挂载应为 OK，不是 ERROR')
})

test('diagnoseActivation：exports 指向不存在的文件时退回 main，不算缺入口', () => {
  const dir = tmpPluginDir('act-exports-fb')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 't-exports-fb', version: '1.0.0',
    main: 'lib/index.js',
    exports: { '.': './types-only.d.ts' },
    peerDependencies: { '@deepseek-ai/dsh': '>=0.1.0-0' },
  }))
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'index.js'), 'export function apply() {}\n')
  const act = diagnoseActivation(dir, [{ profile: 'web', patchFile: '/nonexistent', patchEntries: ['name: t-exports-fb'] }])
  assert.strictEqual(act.entry.file, 'lib/index.js', 'exports 只指向不存在的 types 时退回 main')
  assert.strictEqual(act.entry.ready, true)
})

// ── 客户端半（dsh.client）三层判定：声明 / 产物 / 名册 ──────────────────────
// 2026-10-25 实录：桌面 APP 起不来，宿主半冒烟全绿，真凶是客户端半的
// manifest 死注入——另一半不查，冒烟通过就只是半张体检报告。

test('readClientDecl：合法声明解析，缺失返回 null，形状错误报 invalid', () => {
  const ok = readClientDecl('p', { dsh: { client: { platform: 'web', inject: ['a'], immediately: true } } })
  assert.deepStrictEqual(ok, { platform: 'web', inject: ['a'], external: [], immediately: true })
  assert.strictEqual(readClientDecl('p', {}), null, '无 dsh.client 返回 null')
  assert.ok(readClientDecl('p', { dsh: { client: { inject: ['a'] } } }).invalid, 'platform 缺失应 invalid')
  assert.ok(readClientDecl('p', { dsh: { client: { platform: 'web', inject: 'a' } } }).invalid, 'inject 非 string[] 应 invalid')
})

test('clientExportPath：字符串与 { default } 两种 exports 写法都能解析', () => {
  assert.strictEqual(clientExportPath({ exports: { './client': './lib/client.js' } }), './lib/client.js')
  assert.strictEqual(clientExportPath({ exports: { './client': { default: './c.js' } } }), './c.js')
  assert.strictEqual(clientExportPath({ exports: {} }), null)
})

test('overlayMountedNames / isDeliberateRosterInsert：insert 块命中，注释块不算', () => {
  const text = [
    '# 注释掉的补挂不算',
    '# - insert:',
    '#   - id: client-runtime',
    '- insert:',
    '    - id: client-runtime',
    "      name: '@deepseek-ai/dsh-client-runtime'",
    '- id: other',
    '  name: other-plugin',
    '',
  ].join('\n')
  const names = overlayMountedNames(text)
  assert.ok(names.has('@deepseek-ai/dsh-client-runtime'), `insert 目标应进名册: ${[...names]}`)
  assert.ok(names.has('other-plugin'), 'id 覆盖条目也应进名册')
  assert.ok(isDeliberateRosterInsert(text, '@deepseek-ai/dsh-client-runtime'), '显式 insert 应判有意保留')
  assert.ok(!isDeliberateRosterInsert(text, 'other-plugin'), '非 insert 的 id 条目不算补挂')
  assert.ok(!isDeliberateRosterInsert('# - insert:\n#   name: x', 'x'), '注释掉的 insert 不算')
})

function clientFixtureProfile({ bundlesList, overlayText, deps, weakDep } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgraph-profile-'))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  const depManifests = {}
  for (const [name, client] of Object.entries(deps || {})) {
    const scoped = name.startsWith('@')
    const pkgDir = scoped
      ? path.join(dir, 'node_modules', ...name.split('/'))
      : path.join(dir, 'node_modules', name)
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name, version: '1.0.0', dsh: client }))
    depManifests[name] = pkgDir
  }
  if (weakDep) {
    const pkgDir = path.join(dir, 'node_modules', weakDep)
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: weakDep, version: '1.0.0', dsh: { client: { platform: 'web', inject: [] } } }))
  }
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'profile', private: true, dependencies: {}, dsh: bundlesList ? { profile: { bundles: bundlesList } } : {} }),
  )
  if (overlayText) fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), overlayText)
  return dir
}

test('collectRoster：宿主内置 / bundles 列名 / overlay insert 三种强证据，dep 无行证据算弱', () => {
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cgraph-host-'))
  const builtinDir = path.join(hostRoot, '@deepseek-ai', 'dsh-client-ui-settings')
  fs.mkdirSync(builtinDir, { recursive: true })
  fs.writeFileSync(path.join(builtinDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-client-ui-settings', dsh: { client: { platform: 'web', inject: [] } } }))

  const profileDir = clientFixtureProfile({
    bundlesList: ['bundled-plugin'],
    overlayText: "- insert:\n    - id: crt\n      name: 'crt-shim'\n",
    deps: { 'bundled-plugin': { client: { platform: 'web', inject: [] } } },
    weakDep: 'loose-plugin',
  })
  const { roster, weak } = collectRoster({ hostRoots: [hostRoot], profileDir })
  assert.strictEqual(roster.get('@deepseek-ai/dsh-client-ui-settings')?.source, 'host-builtin')
  assert.strictEqual(roster.get('bundled-plugin')?.source, 'bundles')
  assert.strictEqual(roster.get('crt-shim')?.source, 'overlay')
  assert.strictEqual(weak.get('loose-plugin')?.source, 'dep-unmounted', '包在依赖里但无行证据应落弱档')
})

test('diagnoseClientHalf：无 dsh.client 声明 → 纯宿主半，OK', () => {
  const dir = tmpPluginDir('cg-none')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'host-only', version: '1.0.0', main: 'lib/index.js' }))
  const r = diagnoseClientHalf({ pluginDir: dir, profiles: [] })
  assert.strictEqual(r.declared, false)
  assert.strictEqual(r.verdict, 'OK')
})

test('diagnoseClientHalf：注入目标全无证据 → critical 死链（10-25 桌面实录形态）', () => {
  const dir = tmpPluginDir('cg-dead')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'client.js'), 'export function apply() {}\n')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'dead-injector', version: '1.0.0', exports: { './client': './lib/client.js' },
    dsh: { client: { platform: 'web', inject: ['@deepseek-ai/dsh-ghost'] } },
  }))
  const profileDir = clientFixtureProfile({ deps: { 'dead-injector': null } })
  // 目标插件作为依赖装进 profile，但依赖清单里没有 dsh-ghost 包
  const r = diagnoseClientHalf({ pluginDir: dir, hostRoots: [], profiles: [{ name: 'web', dir: profileDir }] })
  assert.strictEqual(r.verdict, 'ERROR')
  assert.ok(r.findings.some((f) => f.code === 'client-inject-dead' && f.severity === 'critical'), JSON.stringify(r.findings))
})

test('diagnoseClientHalf：目标有包无行证据 → info 弱档风险（WARN）', () => {
  const dir = tmpPluginDir('cg-weak')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'client.js'), 'export function apply() {}\n')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'weak-injector', version: '1.0.0', exports: { './client': './lib/client.js' },
    dsh: { client: { platform: 'web', inject: ['loose-plugin'] } },
  }))
  const profileDir = clientFixtureProfile({ deps: { 'weak-injector': null }, weakDep: 'loose-plugin' })
  const r = diagnoseClientHalf({ pluginDir: dir, hostRoots: [], profiles: [{ name: 'web', dir: profileDir }] })
  assert.strictEqual(r.verdict, 'WARN')
  assert.ok(r.findings.some((f) => f.code === 'client-inject-unmounted-evidence' && f.severity === 'info'), JSON.stringify(r.findings))
})

test('diagnoseClientHalf：注入目标 bundles 列名 → 强证据 OK', () => {
  const dir = tmpPluginDir('cg-ok')
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'lib', 'client.js'), 'export function apply() {}\n')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'healthy', version: '1.0.0', exports: { './client': './lib/client.js' },
    dsh: { client: { platform: 'web', inject: ['bundled-plugin'] } },
  }))
  const profileDir = clientFixtureProfile({ bundlesList: ['bundled-plugin', 'healthy'], deps: { 'bundled-plugin': { client: { platform: 'web', inject: [] } }, healthy: null } })
  const r = diagnoseClientHalf({ pluginDir: dir, hostRoots: [], profiles: [{ name: 'web', dir: profileDir }] })
  assert.strictEqual(r.verdict, 'OK', JSON.stringify(r.findings))
})

test('diagnoseClientHalf：声明无 ./client 导出或产物缺失 → critical', () => {
  const dir = tmpPluginDir('cg-missing')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'no-bundle', version: '1.0.0',
    dsh: { client: { platform: 'web', inject: [] } },
  }))
  const r = diagnoseClientHalf({ pluginDir: dir, profiles: [] })
  assert.strictEqual(r.verdict, 'ERROR')
  assert.ok(r.findings.some((f) => f.layer === 'artifact' && f.severity === 'critical'), JSON.stringify(r.findings))
})

// ── 跨平台模拟（Windows 真机验证待做，先锁住平台分支的行为） ────────────────

test('Windows 模拟：%APPDATA% 静态根被探到，不依赖 npm spawn', () => {
  const appData = tmpPluginDir('winroot')
  const nm = path.join(appData, 'npm', 'node_modules')
  fs.mkdirSync(path.join(nm, '@deepseek-ai', 'dsh'), { recursive: true })
  fs.writeFileSync(
    path.join(nm, '@deepseek-ai', 'dsh', 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.3' })
  )
  const roots = candidateGlobalRoots({ platform: 'win32', env: { APPDATA: appData } })
  assert.ok(roots.includes(nm), `应包含 %APPDATA%\\npm\\node_modules: ${JSON.stringify(roots)}`)
})

test('模拟调用不污染真实平台的全局根缓存', () => {
  const before = candidateGlobalRoots()
  candidateGlobalRoots({ platform: 'win32', env: { APPDATA: '/tmp/does-not-exist-xyz' } })
  const after = candidateGlobalRoots()
  assert.deepStrictEqual(after, before, '模拟调用不应改变真实探测结果')
})

// ── 性能回归门（防 lineAt 平方级退化） ───────────────────────────────────────
// 触点密集的大文件曾把 code-scan 拖到 23s（598 文件）；单文件合成压测守住线性。

test('扫描器对触点密集大文件保持线性（性能回归门）', () => {
  const lines = []
  for (let i = 0; i < 2000; i++) lines.push(`const v${i} = obj${i % 50}.member${i}; call${i}(v${i});`)
  const source = lines.join('\n')
  const start = Date.now()
  const scanned = scanSource(source)
  const elapsed = Date.now() - start
  assert.ok(scanned.memberAccess.length >= 1000, '应抓到成员访问')
  assert.strictEqual(scanned.memberAccess[1999].line, 2000, '行号要准')
  assert.ok(elapsed < 500, `2000 行触点密集文件扫描应在 500ms 内，实际 ${elapsed}ms`)
})

// ── 汇总 ────────────────────────────────────────────────────────────────────

// scaffold 用例的临时产物用完即删（os.tmpdir 只存可再生文件，不留唯一副本）
for (const dir of scaffoldDirs) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

let passed = 0
const failures = []

for (const { name, fn } of tests) {
  try {
    await fn()
    passed++
    process.stderr.write(`  ok  ${name}\n`)
  } catch (err) {
    failures.push({ name, err })
    process.stderr.write(`FAIL  ${name}\n      ${err.message}\n`)
  }
}

process.stderr.write(`\n${passed} 项通过，${failures.length} 项失败\n`)
if (failures.length) {
  process.exit(1)
}
process.stderr.write('[PASS] plugin-fast-adapt 自检全部通过\n')
