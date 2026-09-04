// benchmark/scripts/audit-skill-activation.mjs
//
// Deterministic skill-activation auditor for benchmark agent trajectories.
//
// The question it answers is NOT "did the agent solve the task" but "did the
// agent actually use the target skill": it separates the activation chain
//
//   skill supplied  →  skill discovered  →  SKILL.md content accessed
//   →  references accessed  →  task solved / reward
//
// into independently measured stages. Primary metric: an observed
// content-bearing access to the target skill's `SKILL.md` in the trajectory
// ("skill opened").
//
// Verified input format (see benchmark/docs/skill-activation-audit.md):
// Harbor v0.22.0 trial directories produced by the Codex CLI 0.152.0 agent:
//   <trial>/agent/sessions/YYYY/MM/DD/rollout-*.jsonl
//     — evidence-bearing session log; lines are
//       {"timestamp", "ordinal", "type", "payload"} where `ordinal` is the
//       0-based event index used for first-open timing.
//   <trial>/agent/trajectory.json
//     — ATIF-v1.7 message-only trajectory (supplied/discovered metadata;
//       carries no tool calls, so content access is not auditable from it).
// Unsupported layouts are hard errors — this tool never guesses schemas.
//
// Evidence model (precision over recall):
//   - structured tool calls first; for the verified Codex schema the only
//     tool is `exec`, so shell commands are classified conservatively;
//   - content-bearing commands (cat/sed/head/tail/less/more/cut/sort, grep/rg,
//     awk) whose file operands fall under the target skill root count as
//     content access; partial reads count (we measure retrieval, not coverage);
//   - discovery-only commands (ls/find/stat/test/file/glob) and prose
//     mentions NEVER count as opened;
//   - complex shell (pipelines, &&, $(...)) that mentions the target path is
//     reported as an ambiguous warning, never silently counted;
//   - comment text, echo/printf of a path, and error-output mentions never
//     count.
//
// Privacy: output never contains absolute machine paths (target files are
// reported relative to the skill root), command text, prompt text, command
// output text, credentials, or environment values. Trials are identified by
// their directory basename only.
//
// Usage:
//   node benchmark/scripts/audit-skill-activation.mjs <trial-or-job-path> \
//     --target-name plugin-upgrade \
//     [--target-path skills/plugin-upgrade]... \
//     [--condition with-skill] [--baseline-condition no-target-skill] \
//     [--json | --markdown]
//
// Exit codes: 0 = audit completed (opened=false is a valid result, never an
// error); 1 = unsupported/malformed input; 2 = invalid usage.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// ── lexical path handling (no filesystem access) ──────────────────────────────

/** Lexically normalize a POSIX-style path without touching the filesystem. */
export function normalizePath(input) {
  let path = String(input).replaceAll('\\', '/')
  const absolute = path.startsWith('/')
  const parts = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
      else if (!absolute) parts.push('..')
      continue
    }
    parts.push(part)
  }
  return (absolute ? '/' : '') + parts.join('/')
}

export function joinLexical(base, rel) {
  return normalizePath(`${base}/${rel}`)
}

// ── JSON string literal decoding (for the JS tool-input snippets) ─────────────

/** Decode a JSON string literal starting at text[i] (text[i] must be '"'). */
export function decodeJsonStringAt(text, i) {
  let out = ''
  let j = i + 1
  for (; j < text.length; j += 1) {
    const ch = text[j]
    if (ch === '"') return { value: out, end: j + 1 }
    if (ch !== '\\') { out += ch; continue }
    const next = text[j + 1]
    if (next === undefined) break
    if (next === 'n') { out += '\n'; j += 1 } else if (next === 't') { out += '\t'; j += 1 }
    else if (next === 'r') { out += '\r'; j += 1 } else if (next === '\\') { out += '\\'; j += 1 }
    else if (next === '"') { out += '"'; j += 1 } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(j + 2, j + 6))) {
      out += String.fromCharCode(parseInt(text.slice(j + 2, j + 6), 16)); j += 5
    } else { out += next; j += 1 }
  }
  return { value: null, end: j }
}

/** Extract every JSON string literal value for a `key:"..."` or `"key":"..."` pattern. */
export function extractKeyedStrings(text, key) {
  const found = []
  const pattern = new RegExp(`(?:[{,]\\s*|^)"?${key}"?\\s*:\\s*"`, 'g')
  for (const match of text.matchAll(pattern)) {
    const quoteAt = match.index + match[0].length - 1
    const decoded = decodeJsonStringAt(text, quoteAt)
    if (decoded.value !== null) found.push({ value: decoded.value, at: match.index })
  }
  return found
}

/**
 * Extract { cmd, workdir } pairs from a Codex `exec` tool input (a JavaScript
 * snippet calling tools.exec_command({...})). Pairing is positional; a count
 * mismatch returns the shorter list plus a warning.
 */
export function extractExecCalls(input) {
  const cmds = extractKeyedStrings(input, 'cmd').map((item) => item.value)
  const workdirs = extractKeyedStrings(input, 'workdir').map((item) => item.value)
  const calls = []
  const n = Math.min(cmds.length, workdirs.length)
  for (let i = 0; i < n; i += 1) calls.push({ cmd: cmds[i], workdir: workdirs[i] })
  if (cmds.length > n) for (let i = n; i < cmds.length; i += 1) calls.push({ cmd: cmds[i], workdir: undefined })
  return { calls, paired: cmds.length === workdirs.length }
}

// ── conservative shell classification ─────────────────────────────────────────

/** Split a command line into words, honoring ' and " quoting and backslashes. */
export function shellWords(command) {
  const words = []
  let current = ''
  let quote = null
  let i = 0
  while (i < command.length) {
    const ch = command[i]
    if (quote !== null) {
      if (ch === '\\' && quote === '"' && i + 1 < command.length) { current += command[i + 1]; i += 2; continue }
      if (ch === quote) quote = null
      else current += ch
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; i += 1; continue }
    if (ch === '\\') { if (i + 1 < command.length) { current += command[i + 1]; i += 2 } else i += 1; continue }
    if (ch === ' ' || ch === '\t' || ch === '\n') { if (current !== '') { words.push(current); current = '' } i += 1; continue }
    current += ch
    i += 1
  }
  if (current !== '') words.push(current)
  return words
}

/** Remove line-level comments from a shell command (conservative; inline comments left alone). */
export function stripShellComments(command) {
  return command.split('\n').map((line) => {
    const trimmed = line.trimStart()
    return trimmed.startsWith('#') ? '' : line
  }).join('\n')
}

const CONTENT_COMMANDS = new Map([
  ['cat', 'files'], ['head', 'files'], ['tail', 'files'], ['less', 'files'],
  ['more', 'files'], ['cut', 'files'], ['sort', 'files'],
  ['sed', 'skip1'], ['awk', 'skip1'], ['grep', 'patternfiles'], ['rg', 'patternfiles'],
])
const DISCOVERY_COMMANDS = new Set(['ls', 'find', 'stat', 'test', '[', 'file', 'glob', 'which', 'whereis', 'type', 'wc', 'du'])
const COMPLEX_INTERPRETERS = new Set(['python', 'python3', 'node', 'bash', 'sh', 'zsh', 'deno'])
const GREP_RECURSIVE = new Set(['-r', '-R', '--recursive'])
const SCRIPT_SENTINEL = '\u0000script'

/**
 * Classify one shell command string.
 * @returns {{ kind: 'content-read'|'discovery'|'none'|'complex'|'interpreter',
 *             command: string, files: string[], recursive: boolean }}
 */
export function classifyShellCommand(command) {
  const bare = stripShellComments(command)
  if (/[|;]/.test(bare) || /&&|\|\|/.test(bare) || /\$\(|`/.test(bare)) {
    return { kind: 'complex', command: bare, files: [], recursive: false }
  }
  const words = shellWords(bare).filter((word) => word !== '')
  while (words.length > 0 && /^\w+=/.test(words[0])) words.shift() // VAR=val prefixes
  if (words.length === 0) return { kind: 'none', command: bare, files: [], recursive: false }
  const argv0 = words[0].includes('/') ? words[0].slice(words[0].lastIndexOf('/') + 1) : words[0]
  if (COMPLEX_INTERPRETERS.has(argv0)) {
    return { kind: 'interpreter', command: bare, files: words.slice(1), recursive: false }
  }
  if (DISCOVERY_COMMANDS.has(argv0)) {
    return { kind: 'discovery', command: bare, files: words.slice(1).filter((word) => !word.startsWith('-') && !word.startsWith('#')), recursive: false }
  }
  const rule = CONTENT_COMMANDS.get(argv0)
  if (rule === undefined) return { kind: 'none', command: bare, files: [], recursive: false }
  const args = words.slice(1)
  const files = []
  for (const arg of args) {
    if (arg.startsWith('-')) continue
    if (arg.startsWith('#')) break
    if (rule === 'skip1' && files.length === 0) { files.push(SCRIPT_SENTINEL); continue }
    files.push(arg)
  }
  const realFiles = files.filter((file) => file !== SCRIPT_SENTINEL)
  const recursive = (argv0 === 'grep' || argv0 === 'rg') && args.some((arg) => GREP_RECURSIVE.has(arg))
  return { kind: 'content-read', command: bare, files: realFiles, recursive }
}

// ── skills_instructions parsing (supplied evidence + runtime skill roots) ─────

export function parseSkillsInstructions(text) {
  const roots = new Map()
  const skills = []
  const rootsSection = /### Skill roots([\s\S]*?)(?=### |\n## |$)/.exec(text)?.[1] ?? ''
  for (const match of rootsSection.matchAll(/- `(r\d+)` = `([^`]+)`/g)) {
    roots.set(match[1], match[2])
  }
  for (const match of text.matchAll(/^- ([A-Za-z0-9._-]+):[^\n]*\(file: (r\d+)\/([^/]+)\/SKILL\.md\)/gm)) {
    skills.push({ name: match[1], rootId: match[2], rel: `${match[3]}/SKILL.md` })
  }
  return { roots, skills }
}

/** Find the skills_instructions text across trajectory message steps, or null. */
export function findSkillsInstructions(messages) {
  for (const message of messages) {
    if (typeof message !== 'string') continue
    const marker = '<skills_instructions>'
    const start = message.indexOf(marker)
    if (start < 0) continue
    const end = message.indexOf('</skills_instructions>', start)
    return end < 0 ? message.slice(start) : message.slice(start, end + '</skills_instructions>'.length)
  }
  return null
}

// ── evidence extraction from the Codex session log ────────────────────────────

/** Load and parse one rollout jsonl; invalid lines become warnings, never evidence. */
export function loadSessionLog(file) {
  const events = []
  const warnings = []
  let lineNo = 0
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    lineNo += 1
    const line = raw.trim()
    if (line === '') continue
    try {
      const parsed = JSON.parse(line)
      if (parsed !== null && typeof parsed === 'object' && typeof parsed.ordinal === 'number') events.push(parsed)
    } catch {
      warnings.push(`malformed-trajectory-line:${basename(file)}:${lineNo}`)
    }
  }
  return { events, warnings }
}

/** Extract ordered shell-evidence events plus warnings from parsed session-log events. */
export function extractEvidenceEvents(events) {
  const ordered = [...events].sort((a, b) => a.ordinal - b.ordinal)
  const evidence = []
  const warnings = []
  for (const event of ordered) {
    const payload = event.payload
    if (payload === null || typeof payload !== 'object') continue
    if (payload.type === 'custom_tool_call' && payload.name === 'exec' && typeof payload.input === 'string') {
      const { calls, paired } = extractExecCalls(payload.input)
      if (!paired) warnings.push(`exec-call-pairing-mismatch:event-${event.ordinal}`)
      for (const call of calls) {
        const classification = classifyShellCommand(call.cmd)
        evidence.push({
          ordinal: event.ordinal,
          kind: classification.kind,
          command: classification.command,
          files: classification.files,
          recursive: classification.recursive,
          workdir: call.workdir,
        })
      }
    }
  }
  return { evidence, warnings }
}

// ── target identity resolution ────────────────────────────────────────────────

/**
 * Resolve the target skill identities for one trial: explicit --target-path
 * values plus (when the trajectory's skills catalog declares the target) the
 * runtime mount path from the skill roots table. Union, never basename guesses.
 */
export function resolveTargetRoots({ targetName, targetPaths, skillsEntry, roots }) {
  const out = []
  for (const path of targetPaths) out.push({ path: normalizePath(path), source: 'explicit' })
  if (skillsEntry !== undefined) {
    const root = roots.get(skillsEntry.rootId)
    if (root !== undefined) {
      const runtimePath = normalizePath(`${root}/${skillsEntry.rel.replace(/\/SKILL\.md$/, '')}`)
      if (!out.some((entry) => entry.path === runtimePath)) out.push({ path: runtimePath, source: 'skills-instructions' })
    }
  }
  if (out.length === 0) {
    throw new Error(`target path unknown: no --target-path given and the trajectory has no skills entry for "${targetName}" — pass --target-path explicitly (basename guessing is not supported)`)
  }
  return out
}

/**
 * Classify one operand path against the target roots. Absolute roots match
 * absolute candidates; relative roots (explicit repo-relative --target-path)
 * resolve against the command's workdir, so both forms behave consistently.
 * @returns {{ root: string, rel: string, isSkillMd: boolean, isReference: boolean, isRoot: boolean } | null}
 */
export function matchTargetFile(candidate, workdir, targetRoots) {
  const resolvedPath = candidate.startsWith('/')
    ? normalizePath(candidate)
    : joinLexical(workdir ?? '/', candidate)
  for (const root of targetRoots) {
    const rootPath = root.path.startsWith('/') ? root.path : joinLexical(workdir ?? '/', root.path)
    if (resolvedPath === rootPath) return { root: rootPath, rel: '', isSkillMd: false, isReference: false, isRoot: true }
    if (resolvedPath === joinLexical(rootPath, 'SKILL.md')) return { root: rootPath, rel: 'SKILL.md', isSkillMd: true, isReference: false, isRoot: false }
    if (resolvedPath.startsWith(rootPath + '/')) {
      const rel = resolvedPath.slice(rootPath.length + 1)
      return { root: rootPath, rel, isSkillMd: false, isReference: rel.startsWith('references/'), isRoot: false }
    }
  }
  return null
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── per-trial audit ───────────────────────────────────────────────────────────

function listJsonl(trialDir) {
  const sessionsDir = join(trialDir, 'agent', 'sessions')
  if (!existsSync(sessionsDir)) return []
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsonl')) out.push(full)
    }
  }
  walk(sessionsDir)
  return out.sort()
}

export function auditTrial({ trialDir, targetName, targetPaths, condition, baselineCondition }) {
  const sessionFiles = listJsonl(trialDir)
  const atifFile = join(trialDir, 'agent', 'trajectory.json')
  const hasAtif = existsSync(atifFile)

  if (sessionFiles.length === 0 && !hasAtif) {
    throw new Error(`unsupported trial layout: ${basename(trialDir)} has neither agent/sessions/**/*.jsonl nor agent/trajectory.json (verified format: Harbor v0.22.0 + Codex CLI 0.152.0)`)
  }

  const warnings = []
  const messages = []
  const evidence = []

  if (sessionFiles.length > 0) {
    for (const file of sessionFiles) {
      const { events, warnings: loadWarnings } = loadSessionLog(file)
      warnings.push(...loadWarnings)
      for (const event of events) {
        const payload = event.payload
        if (payload === null || typeof payload !== 'object' || payload.type !== 'message') continue
        if (typeof payload.content === 'string') messages.push(payload.content)
        else if (Array.isArray(payload.content)) {
          for (const block of payload.content) {
            if (block !== null && typeof block === 'object' && typeof block.text === 'string') messages.push(block.text)
          }
        }
      }
      const extracted = extractEvidenceEvents(events)
      warnings.push(...extracted.warnings)
      evidence.push(...extracted.evidence)
    }
  } else {
    // ATIF fallback: message-only metadata (no tool calls in this format).
    let atif
    try {
      atif = JSON.parse(readFileSync(atifFile, 'utf8'))
    } catch (error) {
      throw new Error(`malformed trajectory ${basename(atifFile)}: ${error.message}`)
    }
    if (atif === null || typeof atif !== 'object' || !Array.isArray(atif.steps)) {
      throw new Error(`unsupported trajectory schema in ${basename(atifFile)}: expected an ATIF object with a steps array`)
    }
    for (const step of atif.steps) if (typeof step?.message === 'string') messages.push(step.message)
    warnings.push('content-access-not-auditable: ATIF trajectory carries no tool calls; opened/references/otherSkills cannot be observed from this artifact')
  }

  // Supplied: the skills catalog in the trajectory declares the target skill.
  const skillsText = findSkillsInstructions(messages)
  let supplied = false
  let skillsEntry
  let parsedSkills = { roots: new Map(), skills: [] }
  if (skillsText !== null) {
    parsedSkills = parseSkillsInstructions(skillsText)
    skillsEntry = parsedSkills.skills.find((skill) => skill.name === targetName)
    supplied = skillsEntry !== undefined
  }

  let targetRoots
  try {
    targetRoots = resolveTargetRoots({ targetName, targetPaths, skillsEntry, roots: parsedSkills.roots })
  } catch (error) {
    throw new Error(`${error.message} (trial ${basename(trialDir)})`)
  }

  let discovered = false
  const openedFiles = new Set()
  const referencesOpened = new Set()
  const otherSkillFiles = new Map() // skill name -> set of rel file paths
  const skillEvidence = []
  let openCount = 0
  let firstOpenEvent = null

  for (const item of evidence) {
    if (item.kind === 'content-read') {
      for (const candidate of item.files) {
        if (candidate === SCRIPT_SENTINEL || candidate.startsWith('#')) continue
        const targetMatch = matchTargetFile(candidate, item.workdir, targetRoots)
        if (targetMatch !== null) {
          if (targetMatch.isRoot) {
            if (item.recursive) { // grep/rg -r over the skill tree reads SKILL.md among others
              openCount += 1
              openedFiles.add('SKILL.md')
              if (firstOpenEvent === null || item.ordinal < firstOpenEvent) firstOpenEvent = item.ordinal
              skillEvidence.push({ ordinal: item.ordinal, kind: 'content-read', file: 'SKILL.md', source: 'shell-exec-recursive' })
            } else {
              discovered = true // listing/reading the root dir itself
            }
          } else if (targetMatch.isSkillMd) {
            openCount += 1
            openedFiles.add('SKILL.md')
            if (firstOpenEvent === null || item.ordinal < firstOpenEvent) firstOpenEvent = item.ordinal
            skillEvidence.push({ ordinal: item.ordinal, kind: 'content-read', file: 'SKILL.md', source: 'shell-exec' })
          } else if (targetMatch.isReference) {
            referencesOpened.add(targetMatch.rel)
            skillEvidence.push({ ordinal: item.ordinal, kind: 'content-read', file: targetMatch.rel, source: 'shell-exec' })
          } else {
            openedFiles.add(targetMatch.rel)
            skillEvidence.push({ ordinal: item.ordinal, kind: 'content-read', file: targetMatch.rel, source: 'shell-exec' })
          }
          continue
        }
        // Other skill roots from the same catalog (excluding the target root).
        const resolved = candidate.startsWith('/') ? normalizePath(candidate) : joinLexical(item.workdir ?? '/', candidate)
        for (const [rootId, rootPath] of parsedSkills.roots) {
          const normalizedRoot = normalizePath(rootPath)
          const isTargetRoot = targetRoots.some((root) => root.path === normalizedRoot || normalizedRoot.startsWith(root.path + '/') || root.path.startsWith(normalizedRoot + '/'))
          if (isTargetRoot) continue
          if (resolved.startsWith(normalizedRoot + '/')) {
            const name = resolved.slice(normalizedRoot.length + 1).split('/')[0]
            if (!otherSkillFiles.has(name)) otherSkillFiles.set(name, new Set())
            otherSkillFiles.get(name).add(resolved.slice(normalizedRoot.length + 1))
          }
        }
      }
    } else if (item.kind === 'discovery') {
      for (const candidate of item.files) {
        if (matchTargetFile(candidate, item.workdir, targetRoots) !== null || candidate.includes(targetName)) discovered = true
      }
    } else if (item.kind === 'complex' || item.kind === 'interpreter') {
      const mentionsTarget = targetRoots.some((root) => item.command.includes(root.path)) || item.command.includes(targetName)
      if (mentionsTarget) warnings.push(`ambiguous-shell-access:event-${item.ordinal}`)
    }
  }

  // Tool output text mentioning the target name marks discovery (e.g. an ls
  // listing showing the skill directory), never an open.
  if (sessionFiles.length > 0) {
    const targetNamePattern = new RegExp(`\\b${escapeRegExp(targetName)}\\b`)
    for (const file of sessionFiles) {
      const { events } = loadSessionLog(file)
      for (const event of events) {
        const payload = event.payload
        if (payload === null || typeof payload !== 'object' || payload.type !== 'custom_tool_call_output') continue
        for (const block of Array.isArray(payload.output) ? payload.output : []) {
          if (block !== null && typeof block === 'object' && typeof block.text === 'string' && targetNamePattern.test(block.text)) {
            discovered = true
          }
        }
      }
    }
  }

  const opened = openCount > 0
  if (opened) discovered = true

  const otherSkillNames = [...otherSkillFiles.keys()].sort()
  const otherOpened = otherSkillNames.length > 0
  const baselineHasOtherSkillAccess = otherOpened && condition !== undefined && condition === baselineCondition

  return {
    schemaVersion: 1,
    trial: {
      id: basename(trialDir),
      task: basename(trialDir).split('__')[0],
      condition: condition ?? null,
    },
    targetSkill: {
      name: targetName,
      supplied,
      discovered,
      opened,
      openCount,
      firstOpenEvent,
      openedFiles: [...openedFiles].sort(),
      referencesOpened: [...referencesOpened].sort(),
      anyTargetSkillContentAccess: opened || referencesOpened.size > 0 || openedFiles.size > 0,
      contentAuditable: sessionFiles.length > 0,
    },
    otherSkills: {
      opened: otherOpened,
      skills: otherSkillNames,
      files: [...otherSkillFiles.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, files]) => ({ skill: name, files: [...files].sort() })),
    },
    baselineHasOtherSkillAccess,
    evidence: skillEvidence,
    warnings,
  }
}

// ── input expansion + aggregation ─────────────────────────────────────────────

function isTrialDir(dir) {
  return existsSync(join(dir, 'agent'))
}

function listTrialDirs(inputPath) {
  const stat = statSync(inputPath)
  if (!stat.isDirectory()) throw new Error(`input is not a directory: ${inputPath}`)
  if (isTrialDir(inputPath)) return [inputPath]
  const trials = readdirSync(inputPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isTrialDir(join(inputPath, entry.name)))
    .map((entry) => join(inputPath, entry.name))
    .sort()
  if (trials.length === 0) {
    throw new Error(`unsupported job layout: ${basename(inputPath)} contains no trial directories (a trial directory has an agent/ subdirectory; verified format: Harbor v0.22.0)`)
  }
  return trials
}

export function auditInput({ inputPath, targetName, targetPaths, condition, baselineCondition }) {
  const trials = listTrialDirs(inputPath)
  const results = trials.map((trialDir) => auditTrial({ trialDir, targetName, targetPaths, condition, baselineCondition }))
  const aggregate = buildAggregate(results, baselineCondition)
  return { results, aggregate }
}

export function buildAggregate(results, baselineCondition) {
  const total = results.length
  const supplied = results.filter((result) => result.targetSkill.supplied).length
  const opened = results.filter((result) => result.targetSkill.opened).length
  const anyContent = results.filter((result) => result.targetSkill.anyTargetSkillContentAccess).length
  const eligible = supplied
  const byCondition = new Map()
  for (const result of results) {
    const label = result.trial.condition ?? 'unlabeled'
    if (!byCondition.has(label)) byCondition.set(label, [])
    byCondition.get(label).push(result)
  }
  const conditionGroups = {}
  for (const [label, group] of [...byCondition.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    conditionGroups[label] = {
      trials: group.length,
      supplied: `${group.filter((result) => result.targetSkill.supplied).length}/${group.length}`,
      opened: `${group.filter((result) => result.targetSkill.opened).length}/${group.length}`,
      otherSkillAccess: `${group.filter((result) => result.otherSkills.opened).length}/${group.length}`,
    }
  }
  return {
    trials: total,
    targetSupplied: `${supplied}/${total}`,
    targetSkillOpened: `${opened}/${total}`,
    activationRateEligible: eligible > 0 ? opened / eligible : null,
    eligibilityDefinition: 'trials where the trajectory declares the target skill (supplied)',
    anyTargetSkillContentAccess: `${anyContent}/${total}`,
    byCondition: conditionGroups,
    baselineHasOtherSkillAccess: `${results.filter((result) => result.baselineHasOtherSkillAccess).length}/${total}`,
    baselineCondition,
  }
}

// ── rendering (fixed key order = deterministic output) ────────────────────────

export function renderJson(audit) {
  return JSON.stringify({
    schemaVersion: 1,
    trials: audit.results.map((result) => ({
      schemaVersion: result.schemaVersion,
      trial: result.trial,
      targetSkill: result.targetSkill,
      otherSkills: result.otherSkills,
      baselineHasOtherSkillAccess: result.baselineHasOtherSkillAccess,
      evidence: result.evidence,
      warnings: result.warnings,
    })),
    aggregate: audit.aggregate,
  }, null, 2) + '\n'
}

export function renderMarkdown(audit) {
  const lines = ['# Skill activation audit', '']
  for (const result of audit.results) {
    const target = result.targetSkill
    lines.push(`## ${result.trial.id}`)
    lines.push('')
    lines.push(`- condition: ${result.trial.condition ?? 'unlabeled'}`)
    lines.push(`- supplied: ${target.supplied}`)
    lines.push(`- discovered: ${target.discovered}`)
    lines.push(`- SKILL.md opened: ${target.opened}${target.opened ? ` (count ${target.openCount}, first event ${target.firstOpenEvent})` : ''}`)
    lines.push(`- references accessed: ${target.referencesOpened.length > 0 ? target.referencesOpened.join(', ') : 'none'}`)
    lines.push(`- other skills accessed: ${result.otherSkills.opened ? result.otherSkills.skills.join(', ') : 'none'}`)
    if (result.warnings.length > 0) lines.push(`- warnings: ${result.warnings.join(', ')}`)
    lines.push('')
  }
  const aggregate = audit.aggregate
  lines.push('## Aggregate')
  lines.push('')
  lines.push(`- trials: ${aggregate.trials}`)
  lines.push(`- target supplied: ${aggregate.targetSupplied}`)
  lines.push(`- target SKILL.md opened: ${aggregate.targetSkillOpened}`)
  lines.push(`- activation rate (eligible = supplied): ${aggregate.activationRateEligible === null ? 'n/a' : aggregate.activationRateEligible.toFixed(4)}`)
  lines.push(`- any target skill content access: ${aggregate.anyTargetSkillContentAccess}`)
  lines.push('')
  for (const [label, group] of Object.entries(aggregate.byCondition)) {
    lines.push(`- ${label}: supplied ${group.supplied}, opened ${group.opened}, other-skill-access ${group.otherSkillAccess}`)
  }
  lines.push('')
  return lines.join('\n') + '\n'
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const args = process.argv.slice(2)
  const positional = []
  const targetPaths = []
  let targetName
  let condition
  let baselineCondition = 'no-target-skill'
  let format = 'json'
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--target-name') { targetName = args[++i]; continue }
    if (arg === '--target-path') { targetPaths.push(args[++i]); continue }
    if (arg === '--condition') { condition = args[++i]; continue }
    if (arg === '--baseline-condition') { baselineCondition = args[++i]; continue }
    if (arg === '--json') { format = 'json'; continue }
    if (arg === '--markdown') { format = 'markdown'; continue }
    if (arg.startsWith('--')) { console.error(`unknown option: ${arg}`); process.exit(2) }
    positional.push(arg)
  }
  if (positional.length !== 1 || targetName === undefined || targetPaths.includes(undefined)) {
    console.error('usage: node benchmark/scripts/audit-skill-activation.mjs <trial-or-job-path> --target-name <name> [--target-path <path>]... [--condition <label>] [--baseline-condition <label>] [--json|--markdown]')
    process.exit(2)
  }
  let audit
  try {
    audit = auditInput({
      inputPath: resolve(process.cwd(), positional[0]),
      targetName,
      targetPaths,
      condition,
      baselineCondition,
    })
  } catch (error) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
  process.stdout.write(format === 'markdown' ? renderMarkdown(audit) : renderJson(audit))
}
