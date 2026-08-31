// benchmark/scripts/validate-task-registry.test.mjs
//
// Negative/self-tests for the registry validator. Each case builds a minimal
// synthetic benchmark tree in mkdtemp and asserts that the validator either
// passes (clean fixture) or fails with the specific drift class. The real
// benchmark files are never touched.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateRegistry, FAILURE_PREFIX } from './validate-task-registry.mjs'

function writeTask(root, id, type, { instructionMarker = 'BENCHMARK-AUTH-v1' } = {}) {
  const dir = join(root, 'benchmark', 'tasks', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'task.toml'), 'schema_version = "1.4"\n[task]\nname = "x"\nversion = "1.1.0"\n')
  writeFileSync(join(dir, 'instruction.md'), `# ${id}\n\n${instructionMarker} marker line\n`)
  return { id, type }
}

const README_TEMPLATE = (rows, { top = null, auth = null, all = null, existing = null, split = null } = {}) => {
  const count = rows.length
  const staticCount = rows.filter((row) => row[1] === 'Static').length
  const handsOn = count - staticCount
  const table = rows.map((row) => `| ${row[0]} | ${row[1]} | tests ${row[0]} |`).join('\n')
  const topLine = `The ${top ?? count} plugin-upgrade tasks measure one thing: ...`
  const splitLine = `answer); the last ${split?.handsOn ?? handsOn} are hands-on (run the plugin ...).`
  const writtenLine = `The first ${split?.written ?? staticCount} are written exams (read the code, produce the`
  const authLine = `All ${auth ?? count} \`instruction.md\` files carry the \`BENCHMARK-AUTH-v1\` marker: ...`
  return `# benchmark\n\n${topLine} ${writtenLine}\n${splitLine}\n\n## Task overview\n\n| Task | Type | What it tests |\n|---|---|---|\n${table}\n\n# all ${all ?? count} tasks: dataset batch\n\nlayout of the existing ${existing ?? count} tasks.\n\n### Unattended authorization\n\n${authLine}\n`
}

const SCORING_TEMPLATE = (rows, { total = null, count = null, perTask = null } = {}) => {
  const table = rows.map((row) => `| ${row[0]} | checkpoint | breakdown |`).join('\n')
  return `# Scoring rules\n\nTotal ${total ?? rows.length * 100} (${count ?? rows.length} tasks × ${perTask ?? 100}; ...).\n\n| Task | Checkpoint | Score breakdown |\n|---|---|---|\n${table}\n`
}

function buildTree(rows, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'h6-registry-test-'))
  mkdirSync(join(root, 'benchmark', 'docs'), { recursive: true })
  mkdirSync(join(root, 'benchmark', 'tasks'), { recursive: true })
  for (const row of rows) writeTask(root, row[0], row[1], row[2] ?? {})
  writeFileSync(join(root, 'benchmark', 'README.md'), README_TEMPLATE(rows, options))
  writeFileSync(join(root, 'benchmark', 'docs', 'scoring.md'), SCORING_TEMPLATE(rows, options))
  return root
}

const ROWS = [
  ['A1-static', 'Static'],
  ['B2-hands-on', 'Hands-on'],
]

function failuresOf(result) {
  return result.failures.join('\n')
}

test('clean registry passes', () => {
  const root = buildTree(ROWS)
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, true, failuresOf(result))
  assert.equal(result.taskCount, 2)
})

test('stale README top task count fails with declared/actual', () => {
  const root = buildTree(ROWS, { top: 1 })
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /README task count mismatch:\n  declared: 1\n  actual:   2/)
})

test('stale authorization count fails', () => {
  const root = buildTree(ROWS, { auth: 1 })
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /authorization count mismatch:\n  declared: 1\n  actual:   2/)
})

test('stale "# all N tasks" count fails', () => {
  const root = buildTree(ROWS, { all: 1 })
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /"# all N tasks: comment" count mismatch/)
})

test('stale "existing N tasks" count fails', () => {
  const root = buildTree(ROWS, { existing: 1 })
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /"existing N tasks note" count mismatch/)
})

test('task missing from the README table fails', () => {
  const root = buildTree(ROWS)
  const readme = join(root, 'benchmark', 'README.md')
  writeFileSync(readme, README_TEMPLATE(ROWS).replace('| A1-static | Static | tests A1-static |\n| B2-hands-on | Hands-on | tests B2-hands-on |', '| A1-static | Static | tests A1-static |'))
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /tasks missing from benchmark\/README.md table:\n  - B2-hands-on/)
})

test('unknown task in the README table fails', () => {
  const root = buildTree(ROWS)
  const readme = join(root, 'benchmark', 'README.md')
  writeFileSync(readme, README_TEMPLATE(ROWS).replace('| B2-hands-on | Hands-on | tests B2-hands-on |', '| B2-hands-on | Hands-on | tests B2-hands-on |\n| Z9-ghost | Static | tests Z9-ghost |'))
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /unknown tasks in benchmark\/README.md table:\n  - Z9-ghost/)
})

test('duplicate task in the README table fails', () => {
  const root = buildTree(ROWS)
  const readme = join(root, 'benchmark', 'README.md')
  writeFileSync(readme, README_TEMPLATE(ROWS).replace('| B2-hands-on | Hands-on | tests B2-hands-on |', '| B2-hands-on | Hands-on | tests B2-hands-on |\n| B2-hands-on | Hands-on | tests B2-hands-on again |'))
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /duplicate tasks in benchmark\/README.md table:\n  - B2-hands-on \(×2\)/)
})

test('task missing from the scoring table fails', () => {
  const root = buildTree(ROWS)
  const scoring = join(root, 'benchmark', 'docs', 'scoring.md')
  writeFileSync(scoring, SCORING_TEMPLATE([ROWS[0]]))
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /tasks missing from benchmark\/docs\/scoring.md table:\n  - B2-hands-on/)
})

test('unknown task in the scoring table fails', () => {
  const root = buildTree(ROWS)
  const scoring = join(root, 'benchmark', 'docs', 'scoring.md')
  writeFileSync(scoring, SCORING_TEMPLATE([...ROWS, ['Z9-ghost', 'Static']]))
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /unknown tasks in benchmark\/docs\/scoring.md table:\n  - Z9-ghost/)
})

test('wrong scoring total fails with declared/expected', () => {
  const root = buildTree(ROWS, { total: 100 })
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /scoring total mismatch:\n  declared: 100\n  expected: 200/)
})

test('instruction.md missing the BENCHMARK-AUTH-v1 marker fails', () => {
  const root = buildTree([['A1-static', 'Static', { instructionMarker: 'NO-MARKER' }], ['B2-hands-on', 'Hands-on']])
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /tasks whose instruction\.md lacks the BENCHMARK-AUTH-v1 marker:\n  - A1-static/)
})

test('written/hands-on split mismatch fails', () => {
  const root = buildTree(ROWS, { split: { written: 2, handsOn: 0 } })
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /written\/hands-on split mismatch:\n  declared: 2 written, 0 hands-on\n  table:    1 Static, 1 Hands-on/)
})

test('task directory missing instruction.md fails the inventory check', () => {
  const root = buildTree(ROWS)
  rmSync(join(root, 'benchmark', 'tasks', 'A1-static', 'instruction.md'))
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /task "A1-static" is missing a required file:\n  - instruction\.md/)
})

test('unknown Type value in the README table fails', () => {
  const root = buildTree(ROWS)
  const readme = join(root, 'benchmark', 'README.md')
  writeFileSync(readme, README_TEMPLATE(ROWS).replace('| A1-static | Static |', '| A1-static | Mixed |'))
  const result = validateRegistry(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(result.ok, false)
  assert.match(failuresOf(result), /unknown Type value in the benchmark\/README.md task table/)
})
