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
    imports.push({ source: modulePath, line: lineOf(match.index) })
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

export function compareVersions(a, b) {
  const va = typeof a === 'string' ? parseVersion(a) : a
  const vb = typeof b === 'string' ? parseVersion(b) : b
  for (const k of ['major', 'minor', 'patch']) {
    if (va[k] !== vb[k]) return va[k] < vb[k] ? -1 : 1
  }
  if (va.pre === vb.pre) return 0
  if (!va.pre) return 1
  if (!vb.pre) return -1
  return va.pre < vb.pre ? -1 : 1
}

export function isPrerelease(v) {
  return parseVersion(v).pre !== null
}

export function sameMajorMinor(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  return va.major === vb.major && va.minor === vb.minor
}

// ── 包名工具 ────────────────────────────────────────────────────────────────

export function isDshPackage(name) {
  return typeof name === 'string' && name.startsWith('@deepseek-ai/')
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
