import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

export const REPO = "E:\\deepseek-harness\\dsh-plugin-upgrade-skill"
export const ROOT = "E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-20-deepseek-v4-pro-s1-s24-r1"
export const ORCH = "E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-20-deepseek-v4-pro-s1-s24-r1\\_orch"
export const SESSIONS_ROOT = "C:\\Users\\lhh\\.dsh\\sessions"
export const SKILL_DIR = "E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\skills\\plugin-upgrade"

export function sha256(buf) { return createHash('sha256').update(buf).digest('hex') }

export function decodeLog(file) {
  const buf = readFileSync(file)
  const lines = []
  let i = 0
  while (i < buf.length - 3) {
    if (buf[i] === 0x28 && buf[i+1] === 0xB5 && buf[i+2] === 0x2F && buf[i+3] === 0xFD) {
      let j = i + 4
      while (j < buf.length - 3 && !(buf[j]===0x28 && buf[j+1]===0xB5 && buf[j+2]===0x2F && buf[j+3]===0xFD)) j++
      const end = (j === buf.length - 3) ? buf.length : j
      try {
        const out = zstdDecompressSync(buf.subarray(i, end)).toString('utf8')
        for (const ln of out.split('\n')) if (ln.trim()) lines.push(ln.trim())
      } catch { /* torn tail */ }
      i = j
    } else i++
  }
  return lines.map(l => { try { return JSON.parse(l) } catch { return { raw: l.slice(0,120) } } })
}

export function hashDir(dir) {
  const files = {}
  let count = 0
  function walk(d, prefix) {
    if (!existsSync(d)) return
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      const rel = prefix + name
      const st = statSync(p)
      if (st.isDirectory()) { walk(p, rel + '/'); continue }
      files[rel] = sha256(readFileSync(p)); count++
    }
  }
  walk(dir, '')
  return { files, count }
}

export function findSessionLog(subagentId) {
  const names = ['session.v4.jsonl.zstd','session.v3.jsonl.zstd','session.v2.jsonl.zstd','session.v1.jsonl.zstd','session.v0.jsonl.zstd','session.jsonl.zstd','session.jsonl']
  for (const proj of readdirSync(SESSIONS_ROOT)) {
    const d = join(SESSIONS_ROOT, proj, subagentId)
    if (!existsSync(d)) continue
    for (const n of names) { const f = join(d, n); if (existsSync(f)) return f }
  }
  return null
}

function isAbs(p) { return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') }

export function extractPaths(str) {
  const out = []
  const re = /(?:[A-Za-z]:\\|\\\\)[^\s"'<>|]+/g
  let m
  while ((m = re.exec(str)) !== null) out.push(m[0])
  return [...new Set(out)]
}

export function extractCodePaths(code) {
  const out = []
  const fsApi = /(?:readFileSync|readFile|writeFileSync|writeFile|appendFileSync|appendFile|readdirSync|readdir|statSync|stat|existsSync|accessSync|cpSync|copyFileSync|mkdirSync|rmSync|unlinkSync|realpathSync|openSync)\s*\(\s*["']([^"']+)["']/g
  let m
  while ((m = fsApi.exec(code)) !== null) if (isAbs(m[1])) out.push(m[1])
  const toolPath = /(?:file_path|path)\s*:\s*["']([^"']+)["']/g
  while ((m = toolPath.exec(code)) !== null) if (isAbs(m[1])) out.push(m[1])
  return [...new Set(out)]
}

export function extractCmdPaths(cmd) {
  const out = []
  const re = /(?:Get-Content|Set-Content|Add-Content|Get-ChildItem|Copy-Item|Move-Item|Remove-Item|Get-FileHash|Test-Path|Set-Location|Push-Location|Out-File)\s+(?:-Path\s+)?["']?([A-Za-z]:[\\/][^"'\s]*|\\\\[^"'\s\\]*\\[^"'\s]*)["']?/gi
  let m
  while ((m = re.exec(cmd)) !== null) out.push(m[1])
  const cd = /(?:^|[;&|]\s*)(?:cd|Set-Location)\s+["']?([A-Za-z]:[\\/][^"'\s]*|\\\\[^"'\s]*)/gi
  while ((m = cd.exec(cmd)) !== null) if (isAbs(m[1])) out.push(m[1])
  return [...new Set(out)]
}

const HARD_FIELDS = { read: ['file_path'], read_image: ['file_path'], write: ['file_path'], edit: ['file_path'], present: ['file_path'], glob: ['path'], grep: ['path'], list: ['path'], working_directory: ['cd'], view_image: ['source'] }

function collectAccesses(accesses, name, args) {
  if (!name || !args || typeof args !== 'object') return
  if (HARD_FIELDS[name]) {
    for (const f of HARD_FIELDS[name]) {
      const v = args[f]
      if (typeof v === 'string') for (const p of extractPaths(v)) accesses.push({ tool: name, field: f, path: p, hard: true })
    }
  }
  if (name === 'pwsh') {
    if (typeof args.workdir === 'string') for (const p of extractPaths(args.workdir)) accesses.push({ tool: 'pwsh', field: 'workdir', path: p, hard: true })
    if (typeof args.command === 'string') for (const p of extractCmdPaths(args.command)) accesses.push({ tool: 'pwsh', field: 'command', path: p, hard: false })
  }
  if (name === 'run_code') {
    if (typeof args.code === 'string') for (const p of extractCodePaths(args.code)) accesses.push({ tool: 'run_code', field: 'code', path: p, hard: false })
  }
}

export function summarize(file) {
  const events = decodeLog(file)
  let usage = null
  let toolCalls = 0
  const accesses = []
  for (const e of events) {
    if (!e || !e.type) continue
    if (e.type === 'assistant/message') {
      const u = (e.data && e.data.usage) || (e.data && e.data.message && e.data.message.usage)
      if (u && typeof u.totalTokens === 'number') usage = { in: u.inputTokens || 0, out: u.outputTokens || 0, cache: u.cacheReadTokens || 0, total: u.totalTokens }
    } else if (e.type === 'tool/call') {
      toolCalls++
      let args = e.data && e.data.arguments
      if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = { __raw: args } } }
      collectAccesses(accesses, e.data && e.data.name, args)
    } else if (e.type === 'tool/ptc-dispatch-start' || e.type === 'tool/ptc-dispatch') {
      collectAccesses(accesses, e.data && e.data.name, e.data && e.data.arguments)
    }
  }
  return { events, usage, toolCalls, accesses }
}

export function norm(p) { return p.replace(/\\+/g, '/').toLowerCase() }

export function isAllowed(p, cellDir, skillAllowed) {
  const n = norm(p)
  if (n.startsWith(norm(cellDir))) return true
  if (skillAllowed && n.startsWith(norm(SKILL_DIR))) return true
  return false
}

export function buildPrompt(task, arm, cellDir) {
  const ins = readFileSync(join(REPO, 'benchmark', 'tasks', task, 'instruction.md'), 'utf8')
  const rewritten = ins.split('/app/fixture').join(cellDir + '\\fixture').split('/app/agent-output').join(cellDir + '\\agent-output')
  const fixDir = cellDir + '\\fixture'
  const outDir = cellDir + '\\agent-output'
  const skillLine = arm === 'skill' ? '  3. ' + SKILL_DIR + '\\   (read-only skill reference)' : ''
  const boundary = [
    '',
    'WORKSPACE BOUNDARY (hard rule - you are running WITHOUT a sandbox, so this prompt is your only constraint):',
    '',
    'Your READ allowlist (the ONLY paths you may read, list, glob, grep, or open):',
    '  1. ' + fixDir,
    '  2. ' + outDir,
    skillLine,
    '',
    'Your WRITE allowlist: ' + outDir + ' ONLY. Do NOT write anywhere else - including the system TEMP / %TEMP% / AppData\\Local\\Temp directories. Any temporary scripts must be written under ' + outDir + '\\' + task + ' and may be deleted afterwards.',
    '',
    'FORBIDDEN (every other path), including but not limited to: the repository root and any file there, the benchmark/ directory tree, benchmark/tasks/**/tests/ and benchmark/tasks/**/solution/, .dsh/, node_modules/, and anything outside the allowlist above. Do not list, glob, or open any parent or sibling directory even "just to look". If something you need is missing from your allowed paths, state that in your report instead of searching elsewhere.',
    '',
    'When citing reference cards in your report, write only the key point and the card ID - do NOT paste full card/reference text (context budget 256k).',
    '',
    'Write your final report to: ' + outDir + '\\' + task + '\\report.md',
    'When the report file is written, reply with exactly one line: DONE'
  ].filter(s => s !== '').join('\n')
  const armClause = arm === 'noskill'
    ? "ARM - NOSKILL: You have no skills available for this task. You must NOT read, search, or cite anything under the repository's skills/ directory (including SKILL.md files and card identifiers such as DSH-0.1.x-xx), nor solution/ or tests/. Work only from the task materials in your cell directory."
    : "ARM - SKILL: Before starting the task, FIRST read " + SKILL_DIR + "\\SKILL.md and follow it as your working methodology; load its references/*.md files on demand exactly as it instructs. You must NOT read the task's solution/ or tests/ directories."
  return rewritten + boundary + '\n\n' + armClause
}

function cardKey(id) { const m = /([A-Z]\d+-\d+)$/.exec(id); return m ? m[1] : id }

export function auditCell(task, arm, subagentId, cellDir, fixtureShaStored) {
  const reportDir = join(cellDir, 'agent-output', task)
  let reportPath = null, reportText = null
  if (existsSync(reportDir)) {
    for (const c of readdirSync(reportDir)) {
      const p = join(reportDir, c)
      try { if (statSync(p).isDirectory()) continue } catch { continue }
      let txt; try { txt = readFileSync(p, 'utf8') } catch { continue }
      if (txt.trim().length > 0 && (reportText == null || txt.length > reportText.length)) { reportPath = p; reportText = txt }
    }
  }
  const reportOk = reportText != null && reportText.trim().length > 0
  const nowHash = hashDir(join(cellDir, 'fixture'))
  const fixtureOk = JSON.stringify(nowHash.files) === fixtureShaStored && nowHash.count > 0
  const log = findSessionLog(subagentId)
  let usage = null, toolCalls = null, violations = [], accesses = [], logFound = false
  if (log) {
    logFound = true
    const s = summarize(log)
    usage = s.usage; toolCalls = s.toolCalls; accesses = s.accesses
    for (const a of s.accesses) {
      if (!a.path || a.path.length < 3) continue
      if (isAllowed(a.path, cellDir, arm === 'skill')) continue
      const n = norm(a.path)
      if (n.includes('/users/lhh/.dsh/') || n.includes('/appdata/local/temp/dsh-spill')) continue
      violations.push(a)
    }
  }
  let exposure = null, cardIds = [], fixtureCardIds = []
  const fixDir = join(cellDir, 'fixture')
  {
    const fc = new Set()
    const walk = (dd) => { if (!existsSync(dd)) return; for (const nm of readdirSync(dd)) { const pp = join(dd, nm); if (statSync(pp).isDirectory()) { walk(pp); continue } let tt; try { tt = readFileSync(pp, 'utf8') } catch { continue } const rr = /\b(?:DSH-\d+\.\d+\.\d+-[A-Z]\d+-\d+|[A-Z]\d+-\d+)\b/g; let mm; while ((mm = rr.exec(tt)) !== null) fc.add(cardKey(mm[0])) } }
    walk(fixDir)
    fixtureCardIds = [...fc]
  }
  if (reportText) {
    const cardRe = /\b(?:DSH-\d+\.\d+\.\d+-[A-Z]\d+-\d+|[A-Z]\d+-\d+)\b/g
    let m; while ((m = cardRe.exec(reportText)) !== null) cardIds.push(m[0])
    cardIds = [...new Set(cardIds)]
    if (arm === 'noskill') {
      const hasSkillPath = /skills\/plugin-upgrade/.test(reportText)
      const leaked = cardIds.filter(c => !fixtureCardIds.includes(cardKey(c)))
      exposure = leaked.length > 0 ? 'hit:cardid:' + leaked.join(',') : (hasSkillPath ? 'hit:skillref' : 'clean')
    }
  }
  return { reportOk, reportPath, reportText, fixtureOk, nowCount: nowHash.count, usage, toolCalls, violations, accesses, exposure, cardIds, fixtureCardIds, logFound }
}
