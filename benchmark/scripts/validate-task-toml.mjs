// benchmark/scripts/validate-task-toml.mjs
//
// Validates the TOML *string syntax* of every benchmark/tasks/*/task.toml.
//
// Why this exists: an unescaped backslash inside a basic string (H7's
// `/session\s*log/i`, fixed in #105) is invalid TOML. Harbor fails to parse the
// file and silently drops the whole task from the dataset, so a full
// `harbor run -p benchmark/tasks` schedules fewer tasks than the registry
// declares — and nothing in the validate chain noticed, because
// validate-execution-contract.mjs and validate-task-registry.mjs read task.toml
// line-by-line without parsing it as TOML.
//
// Node has no built-in TOML parser and this repo is dependency-free, so this is
// deliberately NOT a full TOML parser. It is a string-syntax scanner that walks
// each file character-by-character, tracks every TOML string context (basic,
// literal, and their multiline forms, plus comments), and reports exactly the
// class of defect that can knock a task out of the dataset:
//
//   A. invalid escape sequences in basic strings ("\s", "\d", "\p", ...) —
//      TOML basic strings only allow \b \t \n \f \r \e \" \\ \xHH \uXXXX \UXXXXXXXX,
//      plus a trailing line-ending backslash in multiline basic strings;
//   B. malformed \x / \u / \U escapes (too few hex digits);
//   C. unterminated single-line strings (a quote still open at end-of-line).
//
// Anything this scanner accepts can still be invalid TOML in other ways; the
// point is that the known-dangerous class — the one that has already cost the
// benchmark a task — is caught in CI instead of at harbor-run time.
//
// Usage: node benchmark/scripts/validate-task-toml.mjs [repo-root]
// Exits 0 with an OK line, or 1 with actionable failures.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const FAILURE_PREFIX = '[task-toml]'

const SIMPLE_ESCAPES = new Set(['b', 't', 'n', 'f', 'r', 'e', '"', '\\'])
const HEX_ESCAPES = { x: 2, u: 4, U: 8 }
const isHex = (ch) => /[0-9a-fA-F]/.test(ch)

// Scans one TOML document and returns a list of string-syntax failures.
// Each failure: { line, column, message }.
export function scanTomlStrings(text) {
  const failures = []
  let line = 1
  let column = 0
  // mode: null | 'comment' | 'basic' | 'literal' | 'ml-basic' | 'ml-literal'
  let mode = null
  let openLine = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    column++
    if (ch === '\n') {
      if (mode === 'comment') mode = null
      if (mode === 'basic' || mode === 'literal') {
        failures.push({
          line: openLine,
          column,
          message: `unterminated ${mode} string opened on line ${openLine}`,
        })
        mode = null
      }
      line++
      column = 0
      continue
    }

    switch (mode) {
      case 'comment':
        break
      case 'literal':
        if (ch === "'") mode = null
        break
      case 'ml-literal':
        if (ch === "'" && text.startsWith("'''", i)) {
          mode = null
          i += 2
          column += 2
        }
        break
      case 'basic':
      case 'ml-basic': {
        if (ch === '"' && mode === 'basic') {
          mode = null
          break
        }
        if (ch === '"' && mode === 'ml-basic' && text.startsWith('"""', i)) {
          mode = null
          i += 2
          column += 2
          break
        }
        if (ch !== '\\') break
        const next = text[i + 1]
        if (next === undefined) {
          failures.push({ line, column, message: 'dangling backslash at end of file' })
          break
        }
        if (SIMPLE_ESCAPES.has(next)) {
          i++
          column++
          break
        }
        if (next in HEX_ESCAPES) {
          const digits = text.slice(i + 2, i + 2 + HEX_ESCAPES[next])
          if (digits.length === HEX_ESCAPES[next] && [...digits].every(isHex)) {
            i += 1 + HEX_ESCAPES[next]
            column += 1 + HEX_ESCAPES[next]
          } else {
            failures.push({
              line,
              column,
              message: `malformed \\${next} escape (expected ${HEX_ESCAPES[next]} hex digits)`,
            })
            i++
            column++
          }
          break
        }
        // A multiline basic string may end a line with a backslash (line-ending
        // backslash); whitespace between the backslash and the newline is allowed.
        if (mode === 'ml-basic' && /^[ \t]*(\r?\n)/.test(text.slice(i + 1))) break
        failures.push({
          line,
          column,
          message:
            `invalid escape "\\${next}" in basic string ` +
            '(TOML allows \\b \\t \\n \\f \\r \\e \\" \\\\ \\xHH \\uXXXX \\UXXXXXXXX; ' +
            `write "\\\\${next}" for a literal backslash, or use a literal '...' string)`,
        })
        i++
        column++
        break
      }
      default: {
        // Outside any string. Only quotes and comment markers change mode; TOML
        // structure (tables, keys, dates, numbers) is out of scope here.
        if (ch === '#') {
          mode = 'comment'
        } else if (ch === '"') {
          if (text.startsWith('"""', i)) {
            mode = 'ml-basic'
            i += 2
            column += 2
          } else {
            mode = 'basic'
            openLine = line
          }
        } else if (ch === "'") {
          if (text.startsWith("'''", i)) {
            mode = 'ml-literal'
            i += 2
            column += 2
          } else {
            mode = 'literal'
            openLine = line
          }
        }
        break
      }
    }
  }
  if (mode === 'basic' || mode === 'literal') {
    failures.push({
      line: openLine,
      column,
      message: `unterminated ${mode} string opened on line ${openLine}`,
    })
  }
  return failures
}

export function validateTaskTomls(repoRoot) {
  const tasksDir = join(repoRoot, 'benchmark', 'tasks')
  const failures = []
  const taskDirs = readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const task of taskDirs) {
    const tomlPath = join(tasksDir, task, 'task.toml')
    if (!existsSync(tomlPath)) continue // inventory completeness is validate-task-registry's job
    const text = readFileSync(tomlPath, 'utf8')
    for (const failure of scanTomlStrings(text)) {
      failures.push(
        `${FAILURE_PREFIX} ${task}/task.toml:${failure.line}:${failure.column} ${failure.message}`,
      )
    }
  }
  return { nTasks: taskDirs.length, failures }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const repoRoot = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  )
  const { nTasks, failures } = validateTaskTomls(repoRoot)
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure)
    process.exit(1)
  }
  console.log(`Task-toml string-syntax validation OK: ${nTasks} task.toml files scanned`)
}
