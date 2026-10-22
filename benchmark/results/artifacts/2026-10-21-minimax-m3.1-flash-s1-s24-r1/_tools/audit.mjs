// Transcript audit for one benchmark cell.
//
// Source of truth: the solver subagent's DSH session log (multi-frame zstd JSONL).
// Tool invocations appear in EITHER "tool/ptc-dispatch" (harness-dispatched) or
// "tool/call" (model-called directly); both carry { name, arguments }. We audit
// the union, so no invocation escapes.
//
// Whitelist: the cell directory, for both arms (skills/plugin-upgrade/ is staged
// INSIDE the cell directory, so it needs no separate exemption).
//
// Per the handoff's audit semantics, these are NOT violations:
//   - regex character classes inside a grep/rg pattern (e.g. [/\\], \w+)
//   - path literals quoted inside an argument (a text mention, not an access)
//   - a glob with no path operand whose pattern is an absolute in-cell path
//   - probes with no filesystem access (node --version, --help, pwd)
// Only a real read or write outside the whitelist is invalid:roaming.
//
// Two further quality signals are recorded (they do NOT by themselves imply roaming):
//   - invalid:loop        the solver repeated the same reads in a fixed cycle
//   - hostProbe           the solver mined the live host runtime for facts the
//                         fixture does not contain (a correctness hazard, since the
//                         host runs a different version than the task's target)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, isAbsolute, relative, sep } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xB5, 0x2F, 0xFD])

export function decodeSessionFile(file) {
  if (!existsSync(file)) return []
  const buf = readFileSync(file)
  const positions = []
  let i = 0
  while ((i = buf.indexOf(MAGIC, i)) !== -1) { positions.push(i); i += 4 }
  const chunks = []
  for (let k = 0; k < positions.length; k++) {
    const start = positions[k]
    const end = k + 1 < positions.length ? positions[k + 1] : buf.length
    try { chunks.push(zstdDecompressSync(buf.subarray(start, end))) } catch { /* partial */ }
  }
  const text = Buffer.concat(chunks).toString('utf8')
  const events = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { events.push(JSON.parse(line)) } catch { /* truncated tail */ }
  }
  return events
}

export function readSessionDir(dir) {
  let names
  try { names = readdirSync(dir) } catch { return [] }
  for (const n of names) {
    if (n.endsWith('.jsonl.zstd')) return decodeSessionFile(join(dir, n))
  }
  return []
}

export function collectInvocations(events) {
  const invocations = []
  for (const ev of events) {
    let name = null, args = null, src = null
    if (ev.type === 'tool/ptc-dispatch') {
      name = ev.data?.name; args = ev.data?.arguments; src = 'dispatch'
    } else if (ev.type === 'tool/call') {
      name = ev.data?.name; args = ev.data?.arguments; src = 'call'
    }
    if (!name) continue
    if (typeof args === 'string') {
      try { args = JSON.parse(args) } catch { args = { __raw: args } }
    }
    invocations.push({ name, args: args ?? {}, src })
  }
  return invocations
}

// ---- path extraction -------------------------------------------------------

const ABS_WIN = /[A-Za-z]:[\\/][^"'\s,;()<>|]*/g
const ABS_POSIX = /(?<![\w:\/])\/[\w.-]+(?:\/[\w.-]+)+/g

export function extractAbsolutePaths(text) {
  if (typeof text !== 'string' || !text) return []
  const out = []
  const seen = new Set()
  for (const re of [ABS_WIN, ABS_POSIX]) {
    for (const m of text.matchAll(re)) {
      const p = m[0].replace(/[.,;:]+$/, '')
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }
  return out
}

function isInside(child, parent) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..' + sep) && !isAbsolute(rel))
}

// ---- command segmentation --------------------------------------------------

export function splitSegments(command) {
  return command
    .split(/\r?\n|;|\|\||&&|&|\|/)
    .map(s => s.trim())
    .filter(Boolean)
}

const PS_FS = [
  'Get-Content','Get-Item','Get-ChildItem','Copy-Item','Move-Item','Set-Content','Add-Content',
  'Out-File','Remove-Item','New-Item','Test-Path','Get-FileHash','Rename-Item','Clear-Content',
  'Resolve-Path','Import-Csv','Select-String','WriteAllText','WriteAllLines',
]
const PS_FS_RE = new RegExp('(^|[\\s;|&(])(' + PS_FS.join('|') + ')\\b', 'i')
const PS_WRITE_RE = /\b(?:Set-Content|Add-Content|Out-File|Remove-Item|New-Item|Move-Item|Copy-Item|Rename-Item|Clear-Content|WriteAllText|WriteAllLines)\b/i

const NODE_WRITE = ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','rm','rmSync','copyFile','copyFileSync','rename','renameSync','unlink','unlinkSync','rmdir','rmdirSync','createWriteStream','cp','cpSync']
const NODE_READ = ['readFile','readFileSync','readdir','readdirSync','stat','statSync','lstat','lstatSync','existsSync','realpath','realpathSync','opendir','opendirSync','access','accessSync']
const NODE_FS_RE = new RegExp('\\b(' + [...new Set([...NODE_WRITE, ...NODE_READ])].join('|') + ')\\s*\\(', 'g')

const STRING_LITERAL = /'([^'\\]*)'|"([^"\\]*)"|`([^`\\]*)`/g

// String literals that look like paths, with their kind.
//   'absolute'  - a rooted path on its own
//   'fragment'  - a rooted path concatenated onto something else
//                 (e.g. __dirname + '/semver-check.js'), which is NOT absolute
export function pathLiteralsIn(argText) {
  const out = []
  for (const m of argText.matchAll(STRING_LITERAL)) {
    const s = m[1] ?? m[2] ?? m[3] ?? ''
    if (!s) continue
    const rooted = /^[A-Za-z]:[\\/]/.test(s) || /^\/[\w.-]/.test(s)
    if (!rooted) continue
    // A rooted literal preceded by a concatenation operator is a path fragment.
    const before = argText.slice(Math.max(0, m.index - 3), m.index)
    const isFragment = /\+\s*$/.test(before)
    out.push({ path: s, kind: isFragment ? 'fragment' : 'absolute', index: m.index })
  }
  return out
}

// Relative path literals ('./x', '../x', 'x/y') inside an fs call argument.
export function relativePathLiteralsIn(argText) {
  const out = []
  for (const m of argText.matchAll(STRING_LITERAL)) {
    const s = m[1] ?? m[2] ?? m[3] ?? ''
    if (!s) continue
    if (/^[A-Za-z]:[\\/]/.test(s) || /^\/[\w.-]/.test(s)) continue
    if (/^\.\.?[\\/]/.test(s) || /^[\w.-]+[\\/][\w.\\/-]+$/.test(s)) out.push(s)
  }
  return out
}

// ---- loop detection --------------------------------------------------------

// A cell loops when the solver re-reads the same operands in a fixed cycle,
// producing no new information. Two rules, per the run's recorded policy:
//   R1  one operand read more than 3 times
//   R2  a fixed block of N consecutive read operands recurs 3+ times
export function detectLoop(readOperands) {
  const counts = {}
  for (const r of readOperands) counts[r] = (counts[r] || 0) + 1
  const maxRepeat = Object.values(counts).length ? Math.max(...Object.values(counts)) : 0
  const overThreshold = Object.entries(counts)
    .filter(([, v]) => v > 3)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ operand: k, count: v }))

  // R2: find the longest recurring block of consecutive read operands.
  let best = null
  for (let len = 2; len <= 12 && len < readOperands.length / 3; len++) {
    for (let start = 0; start + len * 3 <= readOperands.length; start++) {
      const block = readOperands.slice(start, start + len)
      let reps = 1
      let pos = start + len
      while (pos + len <= readOperands.length) {
        const next = readOperands.slice(pos, pos + len)
        if (next.every((v, i) => v === block[i])) { reps++; pos += len } else break
      }
      if (reps >= 3 && (!best || len * reps > best.len * best.reps)) {
        best = { len, reps, block }
      }
    }
  }

  // A legitimate re-read (cross-referencing a reference file a few times) is not a
  // loop. A degenerate loop is defined by redundancy: the same operands re-read
  // over and over with no new information. Require a high redundancy ratio over a
  // non-trivial number of reads, or an exact repeating block.
  const redundant = readOperands.length - Object.keys(counts).length
  const redundancyRatio = readOperands.length ? redundant / readOperands.length : 0
  const detected = !!best || (redundancyRatio >= 0.6 && readOperands.length >= 20)
  return {
    detected,
    rule: 'one operand read >3 times, OR a fixed block of N consecutive read operands recurring 3+ times',
    totalReads: readOperands.length,
    uniqueOperands: Object.keys(counts).length,
    maxRepeatOfOneOperand: maxRepeat,
    redundancyRatio: Math.round(redundancyRatio * 100) / 100,
    overThresholdOperands: overThreshold,
    repeatingCycle: best ? { length: best.len, repetitions: best.reps, block: best.block } : null,
    redundantReads: best ? best.len * (best.reps - 1) : Math.max(0, readOperands.length - Object.keys(counts).length),
  }
}

// ---- host probing ----------------------------------------------------------

// The solver mined the LIVE host runtime (a dsh install, a running Cordis process)
// for facts the fixture does not contain. The host runs a different version than the
// task's target, so such facts are both out of scope and wrong.
const HOST_PROBE_PATTERNS = [
  { re: /\bdsh\s+(--profile\s+\S+\s+)?--dump-config\b/i, what: 'dsh --dump-config' },
  { re: /\bdsh\s+(--profile\s+\S+\s+)?--dump-config-schema\b/i, what: 'dsh --dump-config-schema' },
  { re: /\bdsh\s+--version\b/i, what: 'dsh --version' },
  { re: /\bdsh\s+plugin\s+--help\b/i, what: 'dsh plugin --help' },
  { re: /\bdsh\s+headless\s+--help\b/i, what: 'dsh headless --help' },
  { re: /\bdsh\s+--help\b/i, what: 'dsh --help' },
]

// A "dsh ..." string inside a card quote is NOT a probe. Distinguish execution
// from quotation: the command must sit at the start of a shell segment, or after a
// pipe/separator, and must not be inside a quoted prose span.
const PROBE_EXEC_RE = new RegExp(
  '(^|[;|&\\n]\\s*)dsh\\s+(--profile\\s+\\S+\\s+)?(--dump-config-schema|--dump-config|--version|--help|plugin\\s+--help|headless\\s+--help)\\b',
  'i')

// A run_code body that merely MENTIONS a command is prose, not execution. A probe
// is: a pwsh segment that invokes the binary, or a run_code that spawns/execs it.
const PROBE_SPAWN_RE = new RegExp(
  '\\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|child_process)\\b[^\\n]{0,160}\\bdsh\\b',
  'i')

export function detectHostProbes(invocations) {
  const probes = []
  const quotations = []
  for (const inv of invocations) {
    let text = ''
    let executable = false
    if (inv.name === 'pwsh') { text = String(inv.args?.command ?? ''); executable = true }
    else if (inv.name === 'run_code') {
      text = String(inv.args?.code ?? '')
      executable = PROBE_SPAWN_RE.test(text)
    } else if (inv.name === 'cordis_inspect_query' || inv.name === 'cordis_inspect_list') {
      probes.push({ tool: inv.name, what: 'live Cordis runtime inspection', detail: JSON.stringify(inv.args ?? {}).slice(0, 200) })
      continue
    }
    if (!text) continue
    if (!executable) {
      // Prose mention: record it as a quotation, never as a probe.
      for (const p of HOST_PROBE_PATTERNS) {
        if (p.re.test(text)) quotations.push({ tool: inv.name, what: p.what, snippet: text.slice(0, 140) })
      }
      continue
    }
    for (const seg of splitSegments(text)) {
      // A segment that starts a quoted prose span is a quotation, not a command.
      const trimmed = seg.trim()
      const isProse = /^['"`]/.test(trimmed) && /[a-z]\s+[a-z]/.test(trimmed.slice(1, 120))
      for (const p of HOST_PROBE_PATTERNS) {
        if (!p.re.test(seg)) continue
        if (isProse) { quotations.push({ tool: inv.name, what: p.what, snippet: trimmed.slice(0, 140) }); continue }
        if (PROBE_EXEC_RE.test(seg)) { probes.push({ tool: inv.name, what: p.what }) }
        else { quotations.push({ tool: inv.name, what: p.what, snippet: trimmed.slice(0, 140) }) }
      }
    }
  }
  const byWhat = {}
  for (const p of probes) byWhat[p.what] = (byWhat[p.what] || 0) + 1
  return {
    detected: probes.length > 0,
    count: probes.length,
    byWhat,
    samples: probes.slice(0, 12),
    quotedMentions: quotations.length,
    quotedSamples: quotations.slice(0, 6),
  }
}

// ---- the audit -------------------------------------------------------------

export function auditCell({ cellRoot, cellDir, sessionDirs, arm }) {
  const violations = []
  const mentions = []
  const toolCounts = {}
  const readOperands = []
  let toolCalls = 0
  const seen = new Set()

  const charge = (kind, tool, raw, detail) => {
    let resolved
    try { resolved = isAbsolute(raw) ? resolve(raw) : resolve(cellDir, raw) } catch { resolved = raw }
    if (isInside(resolved, cellRoot)) return
    const key = kind + '|' + tool + '|' + raw + '|' + detail
    if (seen.has(key)) return
    seen.add(key)
    violations.push({ kind, tool, raw, resolved, verdict: 'invalid:roaming', detail })
  }

  const note = (kind, tool, raw, noteText) => {
    let resolved
    try { resolved = resolve(raw) } catch { resolved = raw }
    if (isInside(resolved, cellRoot)) return
    const key = kind + '|' + tool + '|' + raw
    if (seen.has(key)) return
    seen.add(key)
    mentions.push({ kind, tool, raw, resolved, note: noteText })
  }

  for (const sdir of sessionDirs) {
    const events = readSessionDir(sdir)
    for (const inv of collectInvocations(events)) {
      const { name: tool, args } = inv
      toolCalls++
      toolCounts[tool] = (toolCounts[tool] || 0) + 1

      // --- 1. tools with a direct path operand -----------------------------
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        const operand = args.file_path ?? args.path ?? args.directory ?? args.target ?? args.dir
        if (typeof operand === 'string' && operand.trim()) {
          const isWrite = tool === 'write' || tool === 'edit'
          if (tool === 'read') readOperands.push(operand)
          charge(isWrite ? 'write' : 'read', tool, operand,
            'direct path operand outside the cell whitelist')
        }
        if (tool === 'working_directory' && typeof args.cd === 'string' && args.cd.trim()) {
          charge('read', tool, args.cd, 'working directory changed outside the cell whitelist')
        }
        if ((tool === 'glob' || tool === 'grep') && typeof args.pattern === 'string') {
          const pat = args.pattern
          if (/^[A-Za-z]:[\\/]/.test(pat) || /^\/[\w.-]+/.test(pat)) {
            note('pattern', tool, pat, tool === 'grep'
              ? 'regex pattern that happens to look like an absolute path'
              : 'glob pattern that happens to look like an absolute path')
          }
        }
      }

      // --- 2. pwsh: segment-scoped cmdlet/path pairing ---------------------
      if (tool === 'pwsh' && args && typeof args.command === 'string') {
        for (const seg of splitSegments(args.command)) {
          if (!PS_FS_RE.test(seg)) continue
          const isWrite = PS_WRITE_RE.test(seg)
          for (const p of extractAbsolutePaths(seg)) {
            charge(isWrite ? 'write' : 'read', 'pwsh', p,
              'filesystem cmdlet segment with an absolute path operand outside the cell whitelist')
          }
        }
        for (const seg of splitSegments(args.command)) {
          if (PS_FS_RE.test(seg)) continue
          for (const p of extractAbsolutePaths(seg)) {
            note('literal', 'pwsh', p, 'path literal in a non-filesystem command segment')
          }
        }
      }

      // --- 3. run_code: fs API call sites and their own arguments -----------
      if (tool === 'run_code' && args && typeof args.code === 'string') {
        const code = args.code
        NODE_FS_RE.lastIndex = 0
        let m
        let anyFs = false
        while ((m = NODE_FS_RE.exec(code)) !== null) {
          anyFs = true
          const api = m[1]
          const isWrite = NODE_WRITE.includes(api)
          const open = code.indexOf('(', m.index + m[0].length - 1)
          let depth = 0, end = open
          for (let i = open; i < code.length; i++) {
            if (code[i] === '(') depth++
            else if (code[i] === ')') { depth--; if (depth === 0) { end = i; break } }
          }
          const argText = code.slice(open + 1, end)
          for (const lit of pathLiteralsIn(argText)) {
            if (lit.kind === 'fragment') {
              // __dirname + '/x' resolves against the script's own directory, which
              // is inside the cell. Not a whitelist question.
              const abs = resolve(cellDir, lit.path.replace(/^[\\/]/, ''))
              if (!isInside(abs, cellRoot)) {
                charge(isWrite ? 'write' : 'read', 'run_code', abs,
                  'node fs API ' + api + '() with a concatenated path fragment outside the cell whitelist')
              }
              continue
            }
            charge(isWrite ? 'write' : 'read', 'run_code', lit.path,
              'node fs API ' + api + '() with an absolute path literal outside the cell whitelist')
          }
          // A RELATIVE fs path resolves against the process working directory, which
          // the cell sets to the cell directory. Only flag it if it escapes the cell.
          for (const p of relativePathLiteralsIn(argText)) {
            const abs = resolve(cellDir, p)
            if (!isInside(abs, cellRoot)) {
              charge(isWrite ? 'write' : 'read', 'run_code', abs,
                'node fs API ' + api + '() with a relative path that resolves outside the cell whitelist')
            }
          }
        }
        if (anyFs) {
          for (const p of extractAbsolutePaths(code)) {
            note('literal', 'run_code', p, 'absolute path literal in a run_code body that also calls fs APIs')
          }
        }
      }
    }
  }

  const loop = detectLoop(readOperands)
  const hostProbe = detectHostProbes(collectInvocations(
    sessionDirs.flatMap((d) => readSessionDir(d))
  ))

  return { toolCalls, toolCounts, violations, mentions, loop, hostProbe }
}
