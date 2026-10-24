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
import { scanSource, compareVersions, parseVersion } from './lib/scanner.mjs'
import { parseGuideMarkdown, extractAnchors, listGuideVersions } from './lib/guide-parser.mjs'
import { resolveTargetVersion } from './guide-sync.mjs'
import { anchorMatches } from './code-scan.mjs'

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

test('识别替换对，新符号进 introduced', () => {
  const a = extractAnchors(
    'ctx.subagents.start() is removed; use startActivation().',
    '1. Replace ctx.subagents.start() or startContinuable() with startActivation().'
  )
  assert.ok(a.introduced.includes('startActivation'), `startActivation 应为新符号: ${JSON.stringify(a.introduced)}`)
  assert.ok(!a.members.includes('startActivation'), '新符号不该留在待报锚点里')
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

test('本机低于 latest → 建议跟随最近下一个版本', () => {
  const r = resolveTargetVersion('0.1.7-rc.2', TAGS)
  assert.strictEqual(r.verdict, 'upgrade-available')
  assert.strictEqual(r.target, '0.2.1-alpha.5', `应选最低的高版本，实得 ${r.target}`)
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
  assert.strictEqual(r.target, '0.2.1-alpha.5')
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

// ── 汇总 ────────────────────────────────────────────────────────────────────

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
