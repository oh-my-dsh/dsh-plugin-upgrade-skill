// paper/scripts/generate-benchmark-table.test.mjs
//
// Tests for the snapshot → LaTeX benchmark-metadata generator. Each test builds
// a minimal synthetic git repository in mkdtemp (no network): commit A pins the
// snapshot, commit B adds a task and edits the README. The core invariant: a
// snapshot pinned to A produces the same paper metadata while the working tree
// sits at B, and the current checkout's task inventory never leaks into it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildTaskMetadata, escapeLatex, generateFromSnapshot, loadPinnedBenchmarkTable, renderMetadataTex, renderTaskTableTex,
} from './generate-benchmark-table.mjs'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'generate-benchmark-table.mjs')

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), 'paper-gen-test-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root })
  return root
}

function write(root, rel, content = 'placeholder') {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), content)
}

function commitAll(root, message) {
  execFileSync('git', ['add', '-A'], { cwd: root })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: root })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function writeTask(root, id) {
  write(root, `benchmark/tasks/${id}/task.toml`)
  write(root, `benchmark/tasks/${id}/instruction.md`)
}

function writeReadme(root, rows) {
  const lines = ['# benchmark', '', '## Task overview', '', '| Task | Type | What it tests |', '|---|---|---|']
  for (const [id, type, desc] of rows) lines.push(`| ${id} | ${type} | ${desc} |`)
  write(root, 'benchmark/README.md', lines.join('\n') + '\n')
}

function snapshotJson(commit, taskCount, tasks, overrides = {}) {
  return JSON.stringify({
    schemaVersion: 1,
    id: '2026-09-01-test-a',
    createdAt: '2026-09-01',
    repository: 'oh-my-dsh/dsh-plugin-upgrade-skill',
    benchmark: { commit, taskCount, tasks },
    skill: { commit, path: 'skills/plugin-upgrade' },
    protocol: { runsPerTask: 3, aggregation: 'per-task-median', conditions: ['with-skill', 'no-harbor-injected-skill'] },
    notes: ['synthetic test snapshot'],
    ...overrides,
  }, null, 2)
}

// Commit A: two tasks (S1-alpha Static, H2-beta Static — an H-prefixed Static
// task on purpose), skill, README table, snapshot pinned to A.
// Commit B: adds S3-gamma + its README row, and rewrites S1's description.
function buildRepo() {
  const root = initRepo()
  writeTask(root, 'S1-alpha')
  writeTask(root, 'H2-beta')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  writeReadme(root, [
    ['S1-alpha', 'Static', 'Alpha static task.'],
    ['H2-beta', 'Static', 'Beta static task with an H prefix.'],
  ])
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 2, ['S1-alpha', 'H2-beta']))
  const withSnapshot = commitAll(root, 'A-snapshot')
  writeTask(root, 'S3-gamma')
  writeReadme(root, [
    ['S1-alpha', 'Static', 'Alpha static task, description rewritten at B.'],
    ['H2-beta', 'Static', 'Beta static task with an H prefix.'],
    ['S3-gamma', 'Hands-on', 'Gamma hands-on task added at B.'],
  ])
  const commitB = commitAll(root, 'B')
  return { root, commitA, withSnapshot, commitB }
}

function generate(root, snapshotRel = 'benchmark/snapshots/2026-09-01-test-a.json') {
  return generateFromSnapshot({ repoRoot: root, snapshotPath: join(root, snapshotRel) })
}

// ── escapeLatex ───────────────────────────────────────────────────────────────

test('escapeLatex escapes LaTeX specials and transliterates unicode', () => {
  assert.equal(escapeLatex('a_b & c%d'), 'a\\_b \\& c\\%d')
  assert.equal(escapeLatex('a#b{c}$d~e^f'), 'a\\#b\\{c\\}\\$d\\textasciitilde{}e\\textasciicircum{}f')
  assert.equal(escapeLatex('a\\b'), 'a\\textbackslash{}b')
  assert.equal(escapeLatex('x→y'), 'x$\\rightarrow$y')
  assert.equal(escapeLatex('x—y'), 'x---y')
  assert.equal(escapeLatex('x≠y'), 'x$\\neq$y')
  assert.equal(escapeLatex('`code` span'), 'code span')
})

// ── core invariant: pinned commit is the authority ────────────────────────────

test('generates frozen metadata at HEAD=B and ignores the current checkout', () => {
  const { root, withSnapshot } = buildRepo()
  const { meta, metadataTex, taskPoolTex } = generate(root)
  assert.equal(meta.taskCount, 2)
  assert.deepEqual(meta.tasks.map((t) => t.id), ['S1-alpha', 'H2-beta'])
  assert.equal(meta.tasks[0].description, 'Alpha static task.', 'description must come from pinned commit A, not B')
  assert.ok(!taskPoolTex.includes('S3-gamma'), 'task added at B must not appear')
  assert.ok(!taskPoolTex.includes('description rewritten'), 'README edit at B must not appear')
  assert.ok(!metadataTex.includes('S3-gamma'))
})

test('repeated generation is byte-identical', () => {
  const { root } = buildRepo()
  const a = generate(root)
  const b = generate(root)
  assert.equal(a.metadataTex, b.metadataTex)
  assert.equal(a.taskPoolTex, b.taskPoolTex)
})

test('valid snapshot renders the expected macros', () => {
  const { root, commitA } = buildRepo()
  const { meta, metadataTex } = generate(root)
  assert.equal(meta.snapshotId, '2026-09-01-test-a')
  assert.equal(meta.snapshotDate, '2026-09-01')
  assert.equal(meta.commitFull, commitA)
  assert.equal(meta.commitShort, commitA.slice(0, 7))
  assert.equal(meta.runsPerTask, 3)
  assert.equal(meta.aggregation, 'per-task-median')
  assert.equal(meta.conditionCount, 2)
  assert.equal(meta.staticCount, 2)
  assert.equal(meta.handsOnCount, 0)
  assert.equal(meta.prefix.S, 1)
  assert.equal(meta.prefix.H, 1)
  assert.equal(meta.prefix.M, 0)
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkTaskCount}{2}'))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkStaticCount}{2}'))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkHandsOnCount}{0}'))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkPrefixSCount}{1}'))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkPrefixMCount}{0}'))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkPrefixHCount}{1}'))
  assert.ok(metadataTex.includes(`\\newcommand{\\BenchmarkCommitFull}{${commitA}}`))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkCommitShort}{' + commitA.slice(0, 7) + '}'))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkAggregation}{per-task-median}'))
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkConditionCount}{2}'))
})

test('H-prefixed Static task is counted Static, never inferred Hands-on/Hybrid', () => {
  const { root } = buildRepo()
  const { meta } = generate(root)
  assert.equal(meta.staticCount, 2, 'H2-beta is registry-Static and must count as Static')
  assert.equal(meta.handsOnCount, 0)
  assert.equal(meta.prefix.H, 1, 'and it still counts as an H-prefixed task')
})

test('snapshot task order is preserved in the table (not README order)', () => {
  const root = initRepo()
  writeTask(root, 'S1-alpha')
  writeTask(root, 'H2-beta')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  // README lists H2-beta first; the snapshot lists S1-alpha first.
  writeReadme(root, [
    ['H2-beta', 'Static', 'Beta.'],
    ['S1-alpha', 'Static', 'Alpha.'],
  ])
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 2, ['S1-alpha', 'H2-beta']))
  commitAll(root, 'A-snapshot')
  const { meta, taskPoolTex } = generate(root)
  assert.deepEqual(meta.tasks.map((t) => t.id), ['S1-alpha', 'H2-beta'])
  assert.ok(taskPoolTex.indexOf('S1-alpha') < taskPoolTex.indexOf('H2-beta'))
})

test('condition order is preserved', () => {
  const { root } = buildRepo()
  const { meta, metadataTex } = generate(root)
  assert.deepEqual(meta.conditions, ['with-skill', 'no-harbor-injected-skill'])
  assert.ok(metadataTex.includes('% conditions (in order): with-skill, no-harbor-injected-skill'))
})

test('generated TeX is brace-balanced and starts with the AUTO-GENERATED banner', () => {
  const { root } = buildRepo()
  const { metadataTex, taskPoolTex } = generate(root)
  for (const tex of [metadataTex, taskPoolTex]) {
    assert.ok(tex.startsWith('% AUTO-GENERATED. DO NOT EDIT.'))
    const open = (tex.match(/\{/g) ?? []).length
    const close = (tex.match(/\}/g) ?? []).length
    assert.equal(open, close, `brace imbalance:\n${tex}`)
  }
})

test('description special characters are escaped in the table', () => {
  const root = initRepo()
  writeTask(root, 'S1-alpha')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  writeReadme(root, [['S1-alpha', 'Static', 'reads `session.events`; 100%_& #safe → — ≠']])
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 1, ['S1-alpha']))
  commitAll(root, 'A-snapshot')
  const { taskPoolTex } = generate(root)
  assert.ok(taskPoolTex.includes('session.events'))
  assert.ok(taskPoolTex.includes('100\\%\\_\\& \\#safe'))
  assert.ok(taskPoolTex.includes('$\\rightarrow$'))
  assert.ok(taskPoolTex.includes('---'))
  assert.ok(taskPoolTex.includes('$\\neq$'))
})

test('snapshot id and aggregation are escaped by the macro renderer', () => {
  // The snapshot schema forbids underscores in ids (validator), so the
  // escaping is defensive; exercise it at the renderer level directly.
  const tex = renderMetadataTex({
    snapshotId: '2026-09-01-test_a', snapshotDate: '2026-09-01',
    commitFull: 'a'.repeat(40), commitShort: 'a'.repeat(7),
    skillCommitFull: 'b'.repeat(40), skillCommitShort: 'b'.repeat(7),
    taskCount: 1, staticCount: 1, handsOnCount: 0, prefix: { S: 1, M: 0, H: 0 },
    runsPerTask: 3, aggregation: 'per-task-median', conditionCount: 1, conditions: ['with-skill'],
    tasks: [{ id: 'S1-alpha', type: 'Static', description: 'Alpha.' }],
  })
  assert.ok(tex.includes('\\newcommand{\\BenchmarkSnapshotId}{2026-09-01-test\\_a}'))
  assert.ok(tex.includes('\\newcommand{\\BenchmarkAggregation}{per-task-median}'))
  // and the real synthetic snapshot id passes through unchanged
  const { root } = buildRepo()
  const { metadataTex } = generate(root)
  assert.ok(metadataTex.includes('\\newcommand{\\BenchmarkSnapshotId}{2026-09-01-test-a}'))
})

// ── failure modes ─────────────────────────────────────────────────────────────

test('taskCount mismatch fails', () => {
  const { root } = buildRepo()
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(root ? (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()) : '', 3, ['S1-alpha', 'H2-beta']))
  assert.throws(() => generate(root, 'benchmark/snapshots/2026-09-01-test-a.json'), /taskCount \(3\) must equal tasks\.length \(2\)/)
})

test('duplicate task ID fails', () => {
  const { root } = buildRepo()
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(head, 2, ['S1-alpha', 'S1-alpha']))
  assert.throws(() => generate(root, 'benchmark/snapshots/2026-09-01-test-a.json'), /duplicate task ID/)
})

test('referenced benchmark commit missing locally fails', () => {
  const { root } = buildRepo()
  const fake = '0000000000000000000000000000000000000000'
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(fake, 2, ['S1-alpha', 'H2-beta']))
  assert.throws(() => generate(root, 'benchmark/snapshots/2026-09-01-test-a.json'), /cannot resolve benchmark commit/)
})

test('task absent at the pinned commit fails even when it exists at HEAD', () => {
  const { root, commitA } = buildRepo()
  // S3-gamma exists at HEAD (commit B) but not at pinned commit A.
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 3, ['S1-alpha', 'H2-beta', 'S3-gamma']))
  assert.throws(() => generate(root, 'benchmark/snapshots/2026-09-01-test-a.json'), /has no task\.toml at benchmark commit|has no instruction\.md at benchmark commit/)
})

test('task row missing from the pinned README fails', () => {
  const root = initRepo()
  writeTask(root, 'S1-alpha')
  writeTask(root, 'H2-beta')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  writeReadme(root, [['S1-alpha', 'Static', 'Alpha.']]) // no H2-beta row
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 2, ['S1-alpha', 'H2-beta']))
  commitAll(root, 'A-snapshot')
  assert.throws(() => generate(root), /"H2-beta" has no row in the benchmark README task table/)
})

test('duplicate README row fails', () => {
  const root = initRepo()
  writeTask(root, 'S1-alpha')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  writeReadme(root, [
    ['S1-alpha', 'Static', 'Alpha.'],
    ['S1-alpha', 'Static', 'Alpha again.'],
  ])
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 1, ['S1-alpha']))
  commitAll(root, 'A-snapshot')
  assert.throws(() => generate(root), /"S1-alpha" has 2 rows/)
})

test('unknown registry Type fails', () => {
  const root = initRepo()
  writeTask(root, 'S1-alpha')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  writeReadme(root, [['S1-alpha', 'Hybrid', 'Alpha.']])
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 1, ['S1-alpha']))
  commitAll(root, 'A-snapshot')
  assert.throws(() => generate(root), /unknown registry Type "Hybrid"/)
})

test('task ID prefix outside S/M/H fails', () => {
  const root = initRepo()
  writeTask(root, 'X1-other')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  writeReadme(root, [['X1-other', 'Static', 'Other.']])
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 1, ['X1-other']))
  commitAll(root, 'A-snapshot')
  assert.throws(() => generate(root), /ID prefix "X" outside the S\/M\/H set/)
})

test('missing README task table at the pinned commit fails', () => {
  const root = initRepo()
  writeTask(root, 'S1-alpha')
  write(root, 'skills/plugin-upgrade/SKILL.md')
  write(root, 'benchmark/README.md', '# benchmark\n\nno table here\n')
  const commitA = commitAll(root, 'A')
  write(root, 'benchmark/snapshots/2026-09-01-test-a.json', snapshotJson(commitA, 1, ['S1-alpha']))
  commitAll(root, 'A-snapshot')
  assert.throws(() => generate(root), /has no task table/)
})

test('loadPinnedBenchmarkTable reads git objects only (never the working tree)', () => {
  const { root, commitA } = buildRepo()
  // Rewrite the working-tree README to contain only junk; the pinned read must be unaffected.
  write(root, 'benchmark/README.md', 'junk working-tree content\n')
  const rows = loadPinnedBenchmarkTable(root, commitA)
  assert.ok(rows.some((cells) => cells[0] === 'S1-alpha' && cells[1] === 'Static'))
  const { meta } = generate(root)
  assert.equal(meta.taskCount, 2)
})

// ── CLI ───────────────────────────────────────────────────────────────────────

test('CLI writes the two generated files and --check passes; drift fails --check', () => {
  const { root } = buildRepo()
  execFileSync('node', [SCRIPT, 'benchmark/snapshots/2026-09-01-test-a.json'], { cwd: root, encoding: 'utf8' })
  const metaPath = join(root, 'paper', 'generated', 'benchmark-metadata.tex')
  const tablePath = join(root, 'paper', 'generated', 'task-pool-table.tex')
  assert.ok(readFileSync(metaPath, 'utf8').includes('\\newcommand{\\BenchmarkTaskCount}{2}'))
  assert.ok(readFileSync(tablePath, 'utf8').includes('H2-beta'))
  execFileSync('node', [SCRIPT, 'benchmark/snapshots/2026-09-01-test-a.json', '--check'], { cwd: root, encoding: 'utf8' })
  writeFileSync(metaPath, 'drift')
  let failed = false
  try {
    execFileSync('node', [SCRIPT, 'benchmark/snapshots/2026-09-01-test-a.json', '--check'], { cwd: root, encoding: 'utf8' })
  } catch (error) {
    failed = error.status === 1
  }
  assert.ok(failed, '--check must fail on drifted generated files')
})

// ── the real frozen snapshot (requires a full local clone, like the existing snapshot validator) ──

test('real frozen snapshot 2026-09-01-main-23 generates the documented metadata', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const result = generateFromSnapshot({
    repoRoot,
    snapshotPath: join(repoRoot, 'benchmark', 'snapshots', '2026-09-01-main-23.json'),
  })
  const { meta } = result
  assert.equal(meta.snapshotId, '2026-09-01-main-23')
  assert.equal(meta.commitFull, '472e5eae93d165906ddb8cc3861bb529f9b22c3e')
  assert.equal(meta.taskCount, 23)
  assert.equal(meta.staticCount, 10)
  assert.equal(meta.handsOnCount, 13)
  assert.equal(meta.prefix.S, 8)
  assert.equal(meta.prefix.M, 5)
  assert.equal(meta.prefix.H, 10)
  assert.equal(meta.runsPerTask, 3)
  assert.equal(meta.aggregation, 'per-task-median')
  assert.equal(meta.conditionCount, 2)
  assert.equal(meta.tasks[0].id, 'S1-static-scan')
  assert.equal(meta.tasks.at(-1).id, 'H10-browser-activation-trap')
  assert.equal(meta.tasks.filter((t) => t.type === 'Static').length, 10)
})
