// benchmark/scripts/validate-task-registry.mjs
//
// Validates that every separately maintained view of the benchmark task set stays in
// sync with the real task directories under benchmark/tasks/:
//
//   A. task inventory     — every benchmark/tasks/* directory must contain task.toml
//                           and instruction.md (the two files the current task format
//                           mandates; file existence only);
//   B. README task table  — one row per real task, no unknown rows, no duplicates;
//   C. README top count   — the canonical "The N plugin-upgrade tasks measure" prose;
//   D. authorization count— the canonical "All N `instruction.md` files carry the
//                           `BENCHMARK-AUTH-v1` marker" prose, plus an inventory-level
//                           check that every instruction.md really carries the marker;
//   E. scoring table      — one row per real task, no unknown rows, no duplicates;
//   F. total points       — the canonical "Total X (N tasks × 100; ...)" declaration
//                           against the fixed 100-points-per-task scoring model;
//   G. written/hands-on   — the canonical "The first N are written exams ... the last
//                           M are hands-on" sentence against the README table's
//                           Static/Hands-on Type column (not task-ID prefixes: H4/H6
//                           are Static despite the H prefix).
//
// This intentionally does NOT duplicate benchmark/scripts/validate-execution-contract.mjs,
// which owns per-task contract semantics (execution modes, authorization clauses,
// task.toml metadata). This script only answers "are the registries in sync".
//
// Usage: node benchmark/scripts/validate-task-registry.mjs [repo-root]
// Exits 0 with an OK line, or 1 with actionable failures.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The benchmark scoring model is fixed at 100 points per task:
// benchmark/docs/scoring.md declares "Total <N> (<N> tasks × 100; ...)".
export const POINTS_PER_TASK = 100

export const FAILURE_PREFIX = '[task-registry]'

// ── discovery ──────────────────────────────────────────────────────────────────

export function discoverTasks(tasksRoot) {
  const ids = []
  const issues = []
  if (!existsSync(tasksRoot)) {
    issues.push(`${FAILURE_PREFIX} benchmark/tasks directory not found: ${tasksRoot}`)
    return { ids, issues }
  }
  for (const entry of readdirSync(tasksRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const id = entry.name
    ids.push(id)
    for (const required of ['task.toml', 'instruction.md']) {
      if (!existsSync(join(tasksRoot, id, required))) {
        issues.push(`${FAILURE_PREFIX} task "${id}" is missing a required file:\n  - ${required}`)
      }
    }
  }
  ids.sort()
  return { ids, issues }
}

// ── Markdown table extraction (minimal, no third-party parser) ─────────────────

export function extractMarkdownTable(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  let headerIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    const cells = splitRow(lines[i])
    if (cells.length >= 2 && cells[0] === 'Task') {
      headerIndex = i
      break
    }
  }
  if (headerIndex < 0) return null
  const rows = []
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const cells = splitRow(lines[i])
    if (cells.length === 0) break
    if (cells.every((cell) => /^[\s:|-]*$/.test(cell))) continue // separator row
    rows.push(cells)
  }
  return rows
}

function splitRow(line) {
  if (!/^\s*\|/.test(line)) return []
  return line.split('|').slice(1, -1).map((cell) => cell.trim())
}

function tableTaskIds(text) {
  const rows = extractMarkdownTable(text)
  if (rows === null) return null
  return rows.filter((cells) => cells[0]).map((cells) => cells[0].replaceAll('`', ''))
}

// ── canonical count parsers ────────────────────────────────────────────────────

export function parseDeclaredTaskCount(text) {
  const match = /The\s+(\d+)\s+plugin-upgrade\s+tasks\s+measure/.exec(text)
  return match ? Number(match[1]) : null
}

export function parseAuthInstructionCount(text) {
  const match = /All\s+(\d+)\s+`instruction\.md`\s+files\s+carry/.exec(text)
  return match ? Number(match[1]) : null
}

export function parseAllTasksCommentCount(text) {
  const match = /#\s*all\s+(\d+)\s+tasks:/.exec(text)
  return match ? Number(match[1]) : null
}

export function parseExistingTasksCount(text) {
  const match = /existing\s+(\d+)\s+tasks/.exec(text)
  return match ? Number(match[1]) : null
}

export function parseWrittenHandsOnCounts(text) {
  const match = /The\s+first\s+(\d+)\s+are\s+written\s+exams[\s\S]{0,400}?the\s+last\s+(\d+)\s+are\s+hands-on/.exec(text)
  return match ? { written: Number(match[1]), handsOn: Number(match[2]) } : null
}

export function parseDeclaredTotalPoints(text) {
  const match = /Total\s+(\d+)\s*\(\s*(\d+)\s+tasks\s*×\s*(\d+)\s*;/.exec(text)
  return match ? { total: Number(match[1]), taskCount: Number(match[2]), perTask: Number(match[3]) } : null
}

// ── registry validation ────────────────────────────────────────────────────────

export function validateRegistry(root) {
  const failures = []
  const tasksRoot = join(root, 'benchmark', 'tasks')
  const readmePath = join(root, 'benchmark', 'README.md')
  const scoringPath = join(root, 'benchmark', 'docs', 'scoring.md')

  const { ids, issues } = discoverTasks(tasksRoot)
  failures.push(...issues)
  const actual = ids.length

  const readme = readText(readmePath)
  const scoring = readText(scoringPath)
  if (readme === null) failures.push(`${FAILURE_PREFIX} benchmark/README.md not found or unreadable`)
  if (scoring === null) failures.push(`${FAILURE_PREFIX} benchmark/docs/scoring.md not found or unreadable`)
  if (readme === null || scoring === null) return { ok: false, failures, taskCount: actual }

  // B. README task table
  const readmeIds = tableTaskIds(readme)
  if (readmeIds === null) {
    failures.push(`${FAILURE_PREFIX} benchmark/README.md has no task table (header cell "Task" not found)`)
  } else {
    failures.push(...tableConsistency(readmeIds, ids, 'benchmark/README.md'))
  }

  // C. README top count
  const declaredCount = parseDeclaredTaskCount(readme)
  if (declaredCount === null) {
    failures.push(`${FAILURE_PREFIX} canonical count sentence not found in benchmark/README.md:\n  expected: "The N plugin-upgrade tasks measure ..."`)
  } else if (declaredCount !== actual) {
    failures.push(`${FAILURE_PREFIX} README task count mismatch:\n  declared: ${declaredCount}\n  actual:   ${actual}`)
  }

  // "all N tasks" and "existing N tasks" counts (same drift class as the top count)
  for (const [parse, label] of [[parseAllTasksCommentCount, '# all N tasks: comment'], [parseExistingTasksCount, 'existing N tasks note']]) {
    const value = parse(readme)
    if (value === null) {
      failures.push(`${FAILURE_PREFIX} canonical "${label}" sentence not found in benchmark/README.md`)
    } else if (value !== actual) {
      failures.push(`${FAILURE_PREFIX} README "${label}" count mismatch:\n  declared: ${value}\n  actual:   ${actual}`)
    }
  }

  // D. authorization instruction count + inventory-level marker completeness
  const authCount = parseAuthInstructionCount(readme)
  if (authCount === null) {
    failures.push(`${FAILURE_PREFIX} canonical authorization sentence not found in benchmark/README.md:\n  expected: "All N \`instruction.md\` files carry the \`BENCHMARK-AUTH-v1\` marker"`)
  } else if (authCount !== actual) {
    failures.push(`${FAILURE_PREFIX} README authorization count mismatch:\n  declared: ${authCount}\n  actual:   ${actual}`)
  }
  const missingMarkers = []
  for (const id of ids) {
    const text = readText(join(tasksRoot, id, 'instruction.md'))
    if (text === null || !text.includes('BENCHMARK-AUTH-v1')) missingMarkers.push(id)
  }
  if (missingMarkers.length > 0) {
    failures.push(`${FAILURE_PREFIX} tasks whose instruction.md lacks the BENCHMARK-AUTH-v1 marker:\n  - ${missingMarkers.join('\n  - ')}`)
  }

  // G. written / hands-on split (derived from the README table Type column)
  if (readmeIds !== null) {
    const rows = extractMarkdownTable(readme)
    const types = new Map()
    for (const cells of rows) {
      if (cells[0]) types.set(cells[0].replaceAll('`', ''), cells[1] ?? '')
    }
    const staticCount = [...types.values()].filter((type) => type === 'Static').length
    const handsOnCount = [...types.values()].filter((type) => type === 'Hands-on').length
    const unknownTypes = [...types.entries()].filter(([, type]) => type !== 'Static' && type !== 'Hands-on')
    if (unknownTypes.length > 0) {
      failures.push(`${FAILURE_PREFIX} unknown Type value in the benchmark/README.md task table (expected "Static" or "Hands-on"):\n  - ${unknownTypes.map(([id, type]) => `${id}: "${type}"`).join('\n  - ')}`)
    }
    const split = parseWrittenHandsOnCounts(readme)
    if (split === null) {
      failures.push(`${FAILURE_PREFIX} canonical written/hands-on sentence not found in benchmark/README.md:\n  expected: "The first N are written exams ... the last M are hands-on"`)
    } else if (split.written !== staticCount || split.handsOn !== handsOnCount) {
      failures.push(`${FAILURE_PREFIX} README written/hands-on split mismatch:\n  declared: ${split.written} written, ${split.handsOn} hands-on\n  table:    ${staticCount} Static, ${handsOnCount} Hands-on`)
    }
  }

  // E. scoring table
  const scoringIds = tableTaskIds(scoring)
  if (scoringIds === null) {
    failures.push(`${FAILURE_PREFIX} benchmark/docs/scoring.md has no task table (header cell "Task" not found)`)
  } else {
    failures.push(...tableConsistency(scoringIds, ids, 'benchmark/docs/scoring.md'))
  }

  // F. total points against the fixed scoring model
  const total = parseDeclaredTotalPoints(scoring)
  if (total === null) {
    failures.push(`${FAILURE_PREFIX} canonical total declaration not found in benchmark/docs/scoring.md:\n  expected: "Total X (N tasks × ${POINTS_PER_TASK}; ...)"`)
  } else {
    if (total.taskCount !== actual) {
      failures.push(`${FAILURE_PREFIX} scoring task count mismatch:\n  declared: ${total.taskCount}\n  actual:   ${actual}`)
    }
    if (total.perTask !== POINTS_PER_TASK) {
      failures.push(`${FAILURE_PREFIX} scoring per-task points changed from the fixed model:\n  declared: ${total.perTask}\n  expected: ${POINTS_PER_TASK}`)
    }
    const expectedTotal = actual * POINTS_PER_TASK
    if (total.total !== expectedTotal) {
      failures.push(`${FAILURE_PREFIX} scoring total mismatch:\n  declared: ${total.total}\n  expected: ${expectedTotal}`)
    }
  }

  return { ok: failures.length === 0, failures, taskCount: actual }
}

function tableConsistency(registeredIds, actualIds, file) {
  const failures = []
  const counts = new Map()
  for (const id of registeredIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => `${id} (×${count})`)
  const missing = actualIds.filter((id) => !counts.has(id))
  const unknown = registeredIds.filter((id) => !actualIds.includes(id))
  if (duplicates.length > 0) {
    failures.push(`${FAILURE_PREFIX} duplicate tasks in ${file} table:\n  - ${duplicates.join('\n  - ')}`)
  }
  if (missing.length > 0) {
    failures.push(`${FAILURE_PREFIX} tasks missing from ${file} table:\n  - ${missing.join('\n  - ')}`)
  }
  if (unknown.length > 0) {
    failures.push(`${FAILURE_PREFIX} unknown tasks in ${file} table:\n  - ${unknown.join('\n  - ')}`)
  }
  return failures
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
  const result = validateRegistry(root)
  if (result.ok) {
    console.log(`${FAILURE_PREFIX} OK: ${result.taskCount} tasks, README/scoring registry consistent`)
    process.exit(0)
  }
  for (const failure of result.failures) console.log(`${failure}\n`)
  process.exit(1)
}
