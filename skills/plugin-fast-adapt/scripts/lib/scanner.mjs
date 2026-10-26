// lib/scanner.mjs
// 词法扫描器与版本工具。零外部依赖，只用 Node 内置能力。
//
// 为什么不用正则：正则会命中注释和字符串里的同名词，产生误报
// （实测：三行注释/字符串被报成「源码契约冲突」）。
// 这里用状态机先给每个字符打上 code/comment/string 标记，
// 再只在 code 区做匹配，string 区单独收集供错误码一类锚点使用。

import { stripTypeScriptTypes } from 'node:module'

// Node 22.13+ 的类型剥离会打 ExperimentalWarning，扫描器不需要它
const originalEmitWarning = process.emitWarning
process.emitWarning = (warning, ...rest) => {
  const text = typeof warning === 'string' ? warning : warning?.message || ''
  if (text.includes('stripTypeScriptTypes')) return
  return originalEmitWarning.call(process, warning, ...rest)
}

export const CODE = 0
export const COMMENT = 1
export const STRING = 2

// 逐字符打标记，返回与源码等长的 Uint8Array
export function maskSource(source) {
  const n = source.length
  const mask = new Uint8Array(n)
  let state = CODE
  let quote = ''
  let i = 0

  while (i < n) {
    const ch = source[i]
    const next = i + 1 < n ? source[i + 1] : ''

    if (state === CODE) {
      if (ch === '/' && next === '/') {
        mask[i] = mask[i + 1] = COMMENT
        i += 2
        state = COMMENT
        quote = '\n'
        continue
      }
      if (ch === '/' && next === '*') {
        mask[i] = mask[i + 1] = COMMENT
        i += 2
        state = COMMENT
        quote = '*/'
        continue
      }
      if (ch === "'" || ch === '"') {
        mask[i] = STRING
        i += 1
        state = STRING
        quote = ch
        continue
      }
      if (ch === '`') {
        mask[i] = STRING
        i += 1
        state = STRING
        quote = '`'
        continue
      }
      mask[i] = CODE
      i += 1
      continue
    }

    if (state === COMMENT) {
      if (quote === '\n' && ch === '\n') {
        mask[i] = CODE
        state = CODE
        i += 1
        continue
      }
      if (quote === '*/' && ch === '*' && next === '/') {
        mask[i] = mask[i + 1] = COMMENT
        i += 2
        state = CODE
        continue
      }
      mask[i] = COMMENT
      i += 1
      continue
    }

    // STRING
    if (ch === '\\') {
      mask[i] = STRING
      if (i + 1 < n) mask[i + 1] = STRING
      i += 2
      continue
    }
    if (ch === quote) {
      mask[i] = STRING
      i += 1
      state = CODE
      continue
    }
    mask[i] = STRING
    i += 1
  }

  return mask
}

// 把注释替换成空格（保持长度），字符串原地保留。
// 这样做的理由：import 的模块路径、require 的参数本身就是字符串，
// 如果把字符串从文本里删掉，`import x from '<这里空了>'` 就永远匹配不到；
// 而保留长度，正则匹配到的下标才能和原文对上行号。
export function splitSource(source) {
  const mask = maskSource(source)
  const chars = [...source]
  const strings = []
  let buffer = ''
  let stringStart = -1

  for (let i = 0; i < source.length; i++) {
    if (mask[i] === COMMENT) {
      chars[i] = ' '
      if (stringStart !== -1) {
        strings.push({ value: unquote(buffer), index: stringStart })
        buffer = ''
        stringStart = -1
      }
      continue
    }
    if (mask[i] === STRING) {
      if (stringStart === -1) {
        stringStart = i
        buffer = ''
      }
      buffer += source[i]
      continue
    }
    // CODE：一段字符串到此结束
    if (stringStart !== -1) {
      strings.push({ value: unquote(buffer), index: stringStart })
      buffer = ''
      stringStart = -1
    }
  }
  if (stringStart !== -1) strings.push({ value: unquote(buffer), index: stringStart })

  return { code: chars.join(''), strings, mask }
}

// 去掉字符串字面量的首尾引号，便于匹配错误码一类内容
function unquote(buffer) {
  if (buffer.length >= 2) {
    const first = buffer[0]
    const last = buffer[buffer.length - 1]
    if (first === last && (first === "'" || first === '"' || first === '`')) {
      return buffer.slice(1, -1)
    }
  }
  return buffer
}

// 行号：把字符下标换算成 1-based 行号。
// scanSource 里每个触点命中都要查一次行号，逐字符从头扫是 O(index)，
// 大文件×密集触点会平方级放大（598 文件实测 23s）。这里预计算行起点
// 数组，查询走二分；导出的 lineAt 保持纯函数语义，单次调用自建数组。
function buildLineStarts(source) {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function lineAtStarts(starts, index) {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= index) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

export function lineAt(source, index) {
  return lineAtStarts(buildLineStarts(source), index)
}

const IMPORT_RE = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
// 完整点链：抓 ctx.subagents.start 整体，而不是拆成 ctx.subagents + start。
// 拆散的后果是锚点 `ctx.subagents.start` 永远匹配不上。
const MEMBER_RE = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\b/g
const CALL_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g

// 扫描单个源文件，返回依赖与符号触点。
// 注释里的同名词不会出现在 code 字段里；字符串字面量单独给 strings 字段。
// stripTypes 默认关闭：`import type { X } from 'pkg'` 是真实的包依赖信号，
// 而类型剥离会把整行删掉，反而漏报。类型注解本身不会产生假的成员访问，
// 所以直接扫原始源码更完整，也避开实验性 API 的告警。
export function scanSource(source, { stripTypes = false } = {}) {
  const prepared = stripTypes ? safeStrip(source) : source
  const { code, strings, mask } = splitSource(prepared)
  const lineStarts = buildLineStarts(prepared)
  const lineOf = (index) => lineAtStarts(lineStarts, index)

  // 匹配起点必须落在代码区：字符串里的 `installBundle()` 不算调用，
  // 但 import 的模块路径本身在字符串里，所以 import 只看关键字位置。
  const inCode = (index) => mask[index] === CODE

  const imports = []
  const memberAccess = []
  const calls = []

  let match
  IMPORT_RE.lastIndex = 0
  while ((match = IMPORT_RE.exec(code)) !== null) {
    if (!inCode(match.index)) continue
    const modulePath = match[1] || match[2]
    if (!modulePath) continue
    // import type / export type 是纯编译期引用，运行时零依赖：
    // 弹性检查（强 import 已移除包）必须区分，否则类型引用会被报成「装载必炸」。
    const kind = /^\s*(?:import|export)\s+type\b/.test(match[0]) ? 'type' : 'value'
    imports.push({ source: modulePath, line: lineOf(match.index), kind })
  }

  MEMBER_RE.lastIndex = 0
  const seenMember = new Set()
  while ((match = MEMBER_RE.exec(code)) !== null) {
    if (!inCode(match.index)) continue
    const chain = match[1]
    const parts = chain.split('.')
    const member = parts[parts.length - 1]
    const object = parts.slice(0, -1).join('.')
    if (seenMember.has(chain)) continue
    seenMember.add(chain)
    memberAccess.push({ object, member, chain, line: lineOf(match.index) })
  }

  CALL_RE.lastIndex = 0
  const seenCall = new Set()
  while ((match = CALL_RE.exec(code)) !== null) {
    if (!inCode(match.index)) continue
    const name = match[1]
    if (seenCall.has(name)) continue
    seenCall.add(name)
    calls.push({ name, line: lineOf(match.index) })
  }

  return {
    imports,
    memberAccess,
    calls,
    strings: strings.map((s) => ({ value: s.value, line: lineOf(s.index) })),
  }
}

function safeStrip(source) {
  try {
    return stripTypeScriptTypes(source, { mode: 'strip' })
  } catch {
    return source
  }
}

// ── 版本比较 ────────────────────────────────────────────────────────────────
// 正确处理 prerelease：0.2.1-rc.3 > 0.2.1-rc.2，0.2.1-rc.3 < 0.2.1

export function parseVersion(v) {
  const cleaned = String(v).trim().replace(/^[=v\s]+/, '')
  const [core, pre] = cleaned.split('-')
  const parts = core.split('.').map((p) => Number.parseInt(p, 10) || 0)
  while (parts.length < 3) parts.push(0)
  return { major: parts[0], minor: parts[1], patch: parts[2], pre: pre || null, raw: cleaned }
}

// prerelease 段按 semver 逐段比：纯数字段按数值比（rc.10 > rc.9，不是字典序），
// 字母段按字典序，数字段低于字母段；段数少者更低（rc.3 < rc.3.1）。
function comparePrerelease(a, b) {
  const as = a.split('.')
  const bs = b.split('.')
  const n = Math.max(as.length, bs.length)
  for (let i = 0; i < n; i++) {
    const x = as[i]
    const y = bs[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNum = /^\d+$/.test(x)
    const yNum = /^\d+$/.test(y)
    if (xNum && yNum) {
      if (x !== y) return Number(x) < Number(y) ? -1 : 1
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

export function compareVersions(a, b) {
  const va = typeof a === 'string' ? parseVersion(a) : a
  const vb = typeof b === 'string' ? parseVersion(b) : b
  for (const k of ['major', 'minor', 'patch']) {
    if (va[k] !== vb[k]) return va[k] < vb[k] ? -1 : 1
  }
  if (va.pre === vb.pre) return 0
  if (!va.pre) return 1
  if (!vb.pre) return -1
  return comparePrerelease(va.pre, vb.pre)
}

export function isPrerelease(v) {
  return parseVersion(v).pre !== null
}

export function sameMajorMinor(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  return va.major === vb.major && va.minor === vb.minor
}

// ── semver 范围判定 ─────────────────────────────────────────────────────────
// 第一性原理（2026-10-25 实测复盘）：判断「某版本是否被某 peer 范围覆盖」，
// 唯一可靠的办法是按 semver 语义真算，而不是看范围字符串长什么样。
// 教训：audit 旧启发式看「有没有 -0」给 HIGH，但它推荐的 ">=0.1.0-0 <0.3.0"
// 按真实语义根本放行不了 0.2.1-rc.3（prerelease tuple 规则）——
// 语法猜出来的判定和建议一起错。这里实现 node-semver 的核心语义：
// || 分支、^ ~ 精确比较器、prerelease tuple 规则。

function caretUpper(v) {
  if (v.major > 0) return { major: v.major + 1, minor: 0, patch: 0, pre: null }
  if (v.minor > 0) return { major: 0, minor: v.minor + 1, patch: 0, pre: null }
  return { major: 0, minor: 0, patch: v.patch + 1, pre: null }
}

function tildeUpper(v) {
  return { major: v.major, minor: v.minor + 1, patch: 0, pre: null }
}

// 单个比较器 token → { op, ver } 列表（^ ~ 会展开成一对）
function parseComparatorToken(token) {
  const m = token.match(/^(>=|<=|>|<|=|\^|~)?\s*v?(\d+|x|X|\*)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!m) return null
  const op = m[1] || ''
  const maj = m[2]
  const min = m[3]
  const pat = m[4]
  const pre = m[5] || null
  const hasX = (t) => t === undefined || t === 'x' || t === 'X' || t === '*'
  const base = { major: hasX(maj) ? 0 : Number(maj), minor: hasX(min) ? 0 : Number(min), patch: hasX(pat) ? 0 : Number(pat), pre }
  // 含 x/* 的裸写法（1.x / 1.2.x / *）按区间展开
  if (op === '' && (hasX(maj) || hasX(min) || hasX(pat))) {
    if (hasX(maj)) return [{ op: '>=', ver: { major: 0, minor: 0, patch: 0, pre: null } }]
    if (hasX(min)) return [{ op: '>=', ver: { ...base, minor: 0, patch: 0, pre: null } }, { op: '<', ver: { major: base.major + 1, minor: 0, patch: 0, pre: null } }]
    return [{ op: '>=', ver: { ...base, patch: 0, pre: null } }, { op: '<', ver: { major: base.major, minor: base.minor + 1, patch: 0, pre: null } }]
  }
  if (op === '^') {
    const lower = { ...base }
    return [{ op: '>=', ver: lower }, { op: '<', ver: caretUpper(base) }]
  }
  if (op === '~') {
    const lower = { ...base }
    return [{ op: '>=', ver: lower }, { op: '<', ver: tildeUpper(base) }]
  }
  if (op === '' || op === '=') return [{ op: '>=', ver: base }, { op: '<', ver: nextPatch(base) }]
  return [{ op, ver: base }]
}

function nextPatch(v) {
  return { major: v.major, minor: v.minor, patch: v.patch + 1, pre: null }
}

function versionTuple(v) {
  return `${v.major}.${v.minor}.${v.patch}`
}

// 一个 || 分支（AND 组合）是否覆盖 version
function comparatorSetSatisfies(v, set) {
  const normalized = set.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').trim()
  if (normalized === '' || normalized === '*' || normalized === 'x' || normalized === 'X') return true

  const comparators = []
  // 连字符区间 1.2.3 - 2.0.0
  const hyphen = normalized.match(/^(\S+)\s+-\s+(\S+)$/)
  const tokens = hyphen ? [`>=${hyphen[1]}`, `<=${hyphen[2]}`] : normalized.split(/\s+/)
  for (const token of tokens) {
    const parsed = parseComparatorToken(token)
    if (!parsed) return false
    comparators.push(...parsed)
  }

  for (const { op, ver } of comparators) {
    const cmp = compareVersions(v, ver)
    if (op === '>=' && cmp < 0) return false
    if (op === '>' && cmp <= 0) return false
    if (op === '<=' && cmp > 0) return false
    if (op === '<' && cmp >= 0) return false
    if (op === '=' && cmp !== 0) return false
  }

  // prerelease tuple 规则（node-semver）：带 prerelease 的版本只有在
  // 某个「同 major.minor.patch 三元组且也带 prerelease」的比较器存在时才可满足。
  // 这就是 ">=0.1.0-0 <0.3.0" 收不下 0.2.1-rc.3 的原因：两个比较器的
  // 三元组分别是 0.1.0 和 0.3.0，都不等于 0.2.1。
  if (v.pre !== null) {
    const allowed = comparators.some(
      ({ ver }) => ver.pre !== null && versionTuple(ver) === versionTuple(v)
    )
    if (!allowed) return false
  }
  return true
}

// 判断 version 是否被 npm 语义的范围覆盖。任何一步解析失败都返回 false
// （宁可报「未覆盖」让人工看一眼，不静默当全通过）。
export function satisfiesRange(version, range) {
  if (typeof version !== 'string' || typeof range !== 'string') return false
  const v = parseVersion(version)
  if (!/^\d+\.\d+\.\d+/.test(v.raw)) return false
  for (const branch of range.split('||')) {
    if (comparatorSetSatisfies(v, branch)) return true
  }
  return false
}

// ── 包名工具 ────────────────────────────────────────────────────────────────

export function isDshPackage(name) {
  return typeof name === 'string' && name.startsWith('@deepseek-ai/')
}

// 宿主版本线判定：只有 @deepseek-ai/dsh 及其 dsh-* 套件子包跟随宿主版本线；
// 同 scope 的 @deepseek-ai/cordis（4.x）、@deepseek-ai/schemastery（3.x）是
// 独立版本线的库，与宿主 0.x 线无关。把它们的 peer 下限算进扫描窗口会把
// 起点顶到 3.18.4 一类的高位，窗口倒挂、扫描静默跳过（2026-10-25
// dsh-image-gen 实录）。
export const isDshHostPackage = (name) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')

// 扫描窗口：起点取插件在宿主包上声明的 peer 下限（适配走廊 (floor, target]），
// 终点由调用方给（--target 或宿主版本）。来源三档：flag（--from 显式指定）
// > peer（宿主包 peer 下限）> host（宿主当前版本）。
// 倒挂（起点高于终点）说明声明或输入有误，回退宿主版本并在 fallback 留痕——
// 不静默，否则下游只看到「无指南根或无窗口」却不知道为什么。
export function computeWindow({ peers = {}, hostVersion = null, from = null, target = null }) {
  const floors = Object.entries(peers)
    .filter(([name]) => isDshHostPackage(name))
    .map(([, range]) => peerFloor(range))
    .filter(Boolean)
    .map((v) => parseVersion(v))
    .sort(compareVersions)
  let local = from || floors[0]?.raw || hostVersion
  let source = from ? 'flag' : floors.length ? 'peer' : 'host'
  let fallback = null
  if (local && target && compareVersions(local, target) > 0) {
    fallback = { rejectedFrom: local, to: hostVersion, reason: '窗口倒挂（起点高于终点），回退宿主版本' }
    local = hostVersion
    source = 'host'
  }
  return { local, target, source, fallback }
}

// 目标形态判定：被查目录是不是 DSH 插件。证据只认生态信号——
// package.json 的 dsh 命名空间（bundle 挂载层 / client 客户端半，scaffold
// 骨架带 bundle、无 peer 也能命中），或 peer/dependencies 里任一
// @deepseek-ai/* 包。main 入口太通用（任何 npm 包都有），不能当证据。
// 非插件目标（纯工具仓）不适用启用就绪检查与 Cordis 生命周期规则
// （2026-10-25 自审实录：工具仓被报 activation=ERROR、对普通脚本建议
// ctx.effect，全是形态错配的误报）。
export function isPluginForm(pkg) {
  if (!pkg || typeof pkg !== 'object') return false
  if (pkg.dsh != null) return true
  const deps = { ...(pkg.peerDependencies || {}), ...(pkg.dependencies || {}) }
  return Object.keys(deps).some(isDshPackage)
}

export function packageBase(name) {
  const parts = String(name).split('/')
  return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0]
}

// 提取 npm 版本范围里的下限，用于判断插件声明的兼容窗口
export function peerFloor(range) {
  if (!range || typeof range !== 'string') return null
  const match = range.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)
  return match ? match[1] : null
}

// ── 输出 ────────────────────────────────────────────────────────────────────

export function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

export function log(message) {
  process.stderr.write(`${message}\n`)
}
