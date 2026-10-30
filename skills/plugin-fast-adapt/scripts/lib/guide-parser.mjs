// lib/guide-parser.mjs
// 解析 DeepSeek 官方 upgrade-guide，抽出「符号锚点」。
//
// 权威来源是官方仓库 docs/upgrade-guide/<version>/<topic>/guide.md，
// 格式固定为：
//   ---
//   kind: upgrade-guide
//   description: "..."
//   ---
//   # 标题
//   ## Change      —— 破坏性变更描述
//   ## Migration   —— 编号步骤，含「旧符号 → 新符号」
//
// 我们只抽三类锚点：包名、成员/方法、字符串常量（错误码等）。
// 抽不出来没关系，扫描器退化成「无命中」，不会伪造规则。

import fs from 'node:fs'
import path from 'node:path'
import { scanSource, compareVersions } from './scanner.mjs'

export function parseGuideMarkdown(text) {
  const frontmatter = {}
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.*)$/)
      if (m) frontmatter[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }

  const sections = {}
  const normalized = text.replace(/\x1b\]8;[^\x07]*\x07/g, '').replace(/\r/g, '')
  for (const name of ['Change', 'Migration']) {
    const re = new RegExp(`##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|\\n---\\s*$|$)`, 'i')
    const m = normalized.match(re)
    sections[name.toLowerCase()] = m ? m[1].trim() : ''
  }

  const titleMatch = normalized.match(/^#\s+(.+)$/m)

  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    description: frontmatter.description || '',
    change: sections.change,
    migration: sections.migration,
  }
}

// 太通用的名字不能当锚点：register / resolve / readFile 这类词在几乎任何插件里都会出现，
// 拿它们匹配只会制造噪音。宁可不报，也不要报错。
// 实测：session-digger 插件扫出 12 个命中，逐一核对后 12 个全是这类误报。
const GENERIC_MEMBERS = new Set([
  'register', 'unregister', 'tools', 'config', 'session', 'options', 'logger', 'apply',
  'exports', 'imports', 'default', 'params', 'result', 'results', 'context', 'service',
  'provider', 'manager', 'handler', 'schema', 'client', 'server', 'plugin', 'plugins',
  'this', 'super', 'value', 'values', 'target', 'source', 'request', 'response',
  'error', 'errors', 'message', 'messages', 'event', 'events', 'state', 'states',
  'resolve', 'reject', 'readFile', 'writeFile', 'existsSync', 'stringify', 'parse',
  'initialize', 'configure', 'validate', 'normalize', 'serialize', 'deserialize',
  'toString', 'valueOf', 'displayName', 'getInstance', 'setTimeout', 'setInterval',
])

// 带点锚点看末段，裸名看整体：裸名没有对象约束，更容易撞名，所以门槛更高。
const MIN_MEMBER_LEN = 6
const MIN_BARE_LEN = 8

// 从 guide 正文抽锚点。包名用精确匹配，成员名用词边界。
//
// 两条降噪规则，都是实测误报复盘得来的：
//   1. 常量锚点只从 Change 段抽。Migration 里的连字符字符串往往是示例值
//      （mode: 'read-only'、max-tokens），拿它们匹配会大面积误报。
//   2. 识别「旧 → 新」替换对，新符号不再报命中。
//      插件用了新符号说明已经适配过，报了只是噪音。
export function extractAnchors(changeText, migrationText) {
  const blob = `${changeText}\n${migrationText}`
  const anchors = { packages: new Set(), members: new Set(), codes: new Set() }

  // 语义门（2026-10-24 实测误报复盘）：包名只有与「移除/改名」动词同句才进 package 锚点。
  // Change 段大量提及包名只是语境引用——tool-presentation-mode 的
  // 「The mode fields of @deepseek-ai/dsh-tools accept only native or ptc」讲的是字段取值，
  // 包没被移除；无差别抽取会把所有 import 该包的插件误报成 critical。
  const REMOVAL_RE =
    /\b(removed|remove|retired|renamed|deleted|dropped|no longer|replaced by|moved to)\b/i
  const sentenceHasRemoval = (text, pkg) => {
    for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
      if (sentence.includes(pkg) && REMOVAL_RE.test(sentence)) return true
    }
    return false
  }
  for (const m of blob.matchAll(/@deepseek-ai\/[a-z0-9][\w-]*/g)) {
    if (sentenceHasRemoval(changeText, m[0]) || sentenceHasRemoval(migrationText, m[0])) {
      anchors.packages.add(m[0])
    }
  }

  // 完整点链优先：抽 ctx.tools.presentAs 而不是 ctx.tools + tools.presentAs。
  // 短链会被长链覆盖，避免「ctx.tools」这种过于通用的锚点。
  const chains = new Set()
  for (const m of blob.matchAll(/\b([a-z][\w$]*(?:\.[a-z][\w$]*)+)\b/g)) {
    chains.add(m[1])
  }
  // 裸调用：foo(
  for (const m of blob.matchAll(/\b([a-z][\w]+)\s*\(/g)) {
    chains.add(m[1])
  }

  for (const chain of chains) {
    const parts = chain.split('.')
    const last = parts[parts.length - 1]
    const isBare = parts.length === 1
    if (isBare && last.length < MIN_BARE_LEN) continue
    if (!isBare && last.length < MIN_MEMBER_LEN) continue
    if (GENERIC_MEMBERS.has(last) || GENERIC_MEMBERS.has(chain)) continue
    anchors.members.add(chain)
  }

  // 常量锚点：只从 Change 段抽（见上面规则 1）
  for (const m of changeText.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)['"`]/g)) {
    anchors.codes.add(m[1])
  }

  // 替换对：新符号进 introduced，扫描时跳过
  const introduced = new Set()
  for (const [oldRaw, newRaw] of findReplacements(migrationText)) {
    const oldSym = normalizeSymbol(oldRaw)
    const newSym = normalizeSymbol(newRaw)
    if (newSym) introduced.add(newSym)
    if (oldSym) introduced.delete(oldSym)
  }

  // 两条过滤，返回的 members 就是「待报」清单：
  //   1. 父链被更长的链涵盖（ctx.tools 被 ctx.tools.presentAs 涵盖）
  //   2. 迁移目标不算问题（插件用了新符号说明已适配）
  const members = [...anchors.members].sort()
  const introducedSet = new Set(introduced)
  const filtered = members
    .filter((m) => !members.some((other) => other !== m && other.startsWith(`${m}.`)))
    .filter((m) => !isIntroducedSymbol(introducedSet, m))

  return {
    packages: [...anchors.packages].sort(),
    members: filtered,
    codes: [...anchors.codes].sort(),
    introduced: [...introduced].sort(),
  }
}

// 识别 Migration 里的「旧 → 新」写法。
// 两条路都走：完整替换对（拿旧符号），以及 with/using/by 之后的符号（拿新符号）。
// 后面这条更宽松，因为真实 guide 常写成
//   Replace A or B with C.
// 用严格配对会漏掉 C。
function findReplacements(migrationText) {
  const pairs = []
  const strictPatterns = [
    /\b[Rr]eplace\s+(?:the\s+)?`?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)*(?:\([^)]*\))?)`?\s+(?:with|by|using)\s+`?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)*(?:\([^)]*\))?)/g,
    /`?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)*(?:\([^)]*\))?)`?\s*(?:→|->|becomes?|is\s+renamed\s+to|now\s+becomes)\s+`?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)*(?:\([^)]*\))?)/g,
  ]
  for (const re of strictPatterns) {
    for (const m of migrationText.matchAll(re)) {
      if (m[1] && m[2] && m[1] !== m[2]) pairs.push([m[1], m[2]])
    }
  }

  // 宽松：with/using/by/into 后面的符号一律视为新符号，随后的「and Y」同伴
  // 也是新符号。实测教训（白描插件，v0.2.0-rc.2 指南）："Move … into
  // meta.title and meta.description" 的 meta.description 是迁移目标，
  // 只抓 into 后第一个符号会漏掉 and 同伴，把新写法当待报锚点误报 high。
  const LOOSE_NEW =
    /\b(?:with|using|by|into)\s+`?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)*)`?(?:\s+and\s+`?([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)*)`?)?/g
  for (const m of migrationText.matchAll(LOOSE_NEW)) {
    if (m[1]) pairs.push([null, m[1]])
    if (m[2]) pairs.push([null, m[2]])
  }

  return pairs
}

function isIntroducedSymbol(introducedSet, anchor) {
  if (!introducedSet.size) return false
  if (introducedSet.has(anchor)) return true
  const last = anchor.split('.').pop()
  for (const sym of introducedSet) {
    if (sym === last || sym.endsWith(`.${last}`)) return true
  }
  return false
}

// 去掉参数列表和包裹符号，只留符号名：installBundle(spec) → installBundle
function normalizeSymbol(raw) {
  return String(raw)
    .replace(/[`'"]/g, '')
    .replace(/\s*\(.*$/, '')
    .trim()
}

// 读一个版本目录下的全部 guide，返回带版本与主题的锚点表
export function loadGuides(guideRoot, version) {
  const versionDir = path.join(guideRoot, version)
  if (!fs.existsSync(versionDir)) return []

  const guides = []
  for (const topic of fs.readdirSync(versionDir)) {
    const guidePath = path.join(versionDir, topic, 'guide.md')
    if (!fs.existsSync(guidePath)) continue

    const raw = fs.readFileSync(guidePath, 'utf8')
    const parsed = parseGuideMarkdown(raw)
    const anchors = extractAnchors(parsed.change, parsed.migration)
    if (!anchors.packages.length && !anchors.members.length && !anchors.codes.length) continue

    // 出处锚点：指南内相对路径 + 标题行号。findings 带上它们，
    // 每个结论都能回溯到官方原文位置，不用在指南目录里再搜标题。
    let titleLine = null
    for (const [i, line] of raw.split('\n').entries()) {
      if (/^#\s+/.test(line.replace(/\r$/, ''))) {
        titleLine = i + 1
        break
      }
    }

    guides.push({ version, topic, guideFile: `${version}/${topic}/guide.md`, titleLine, ...parsed, anchors })
  }
  return guides
}

// 官方指南目录下的全部版本，按 semver 升序。
// 目录名带 v 前缀（v0.2.1-alpha.2），比较时剥掉。
// 排序复用 scanner 的 compareVersions：这里曾自带一份字典序实现，
// rc.10 会排到 rc.9 前面，两处必须同源。
export function listGuideVersions(guideRoot) {
  if (!fs.existsSync(guideRoot)) return []
  const bare = (name) => name.replace(/^v/, '')
  return fs
    .readdirSync(guideRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^v?\d+\.\d+\.\d+/.test(name))
    .sort((a, b) => compareVersions(bare(a), bare(b)))
}

// 供自检使用：确认解析器不会把注释里的同名词当成锚点
export function parserSelfCheck() {
  const sample = `---\nkind: upgrade-guide\ndescription: "test"\n---\n# T\n\n## Change\n\nUse \`@deepseek-ai/dsh-settings\` and call installBundle(spec).\n\n## Migration\n\n1. Replace installBundle(spec) with removeBundle(name) then installBundle(spec).\n2. Handle error.code 'already-installed'.\n`
  const parsed = parseGuideMarkdown(sample)
  const anchors = extractAnchors(parsed.change, parsed.migration)
  return { parsed, anchors, scan: scanSource(sample) }
}
