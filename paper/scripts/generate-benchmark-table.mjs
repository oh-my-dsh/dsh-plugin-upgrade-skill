// paper/scripts/generate-benchmark-table.mjs
//
// Deterministic snapshot → LaTeX pipeline for the paper's benchmark metadata.
//
// Source of truth: one frozen evaluation snapshot (benchmark/snapshots/*.json).
// Every task row, Type (Static/Hands-on), and description is resolved from
// git objects AT the snapshot's pinned benchmark commit
// (`git show <commit>:benchmark/README.md` and
// `git cat-file -e <commit>:benchmark/tasks/<id>/task.toml`) — never from the
// current checkout. The living benchmark growing on main must not change the
// paper metadata of an old experiment.
//
// No network, no checkout switching, no worktree mutation. A referenced commit
// that is missing from the local clone is a hard error (fetch it explicitly).
//
// Usage (from the repo root):
//   node paper/scripts/generate-benchmark-table.mjs benchmark/snapshots/2026-09-01-main-23.json
//   node paper/scripts/generate-benchmark-table.mjs benchmark/snapshots/2026-09-01-main-23.json --check
//
// Outputs (committed to the repo):
//   paper/generated/benchmark-metadata.tex   — deterministic count/commit macros
//   paper/generated/task-pool-table.tex      — Task | Type | What it tests table
//
// The output never contains timestamps, host paths, or machine names: the same
// snapshot plus the same local git objects always produces byte-identical files.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateSnapshot } from '../../benchmark/scripts/validate-evaluation-snapshots.mjs'
import { extractMarkdownTable } from '../../benchmark/scripts/validate-task-registry.mjs'

/** Escape one plain-text cell for a LaTeX document body. */
export function escapeLatex(text) {
  // Single pass: each input character is replaced exactly once, so the LaTeX
  // fragments injected here are never re-escaped by a later replacement.
  let out = ''
  for (const ch of String(text)) {
    switch (ch) {
      case '`': break // markdown inline-code quotes
      case '\\': out += '\\textbackslash{}'; break
      case '{': out += '\\{'; break
      case '}': out += '\\}'; break
      case '$': out += '\\$'; break
      case '&': out += '\\&'; break
      case '#': out += '\\#'; break
      case '_': out += '\\_'; break
      case '%': out += '\\%'; break
      case '~': out += '\\textasciitilde{}'; break
      case '^': out += '\\textasciicircum{}'; break
      default: out += ch
    }
  }
  const unicode = [
    ['→', '$\\rightarrow$'],
    ['—', '---'],
    ['–', '--'],
    ['≠', '$\\neq$'],
    ['…', '\\ldots{}'],
    ['×', '$\\times$'],
    ['·', '$\\cdot$'],
  ]
  for (const [from, to] of unicode) out = out.split(from).join(to)
  return out
}

/** Read the canonical task table from the README at the pinned commit (git objects only). */
export function loadPinnedBenchmarkTable(repoRoot, commit) {
  let text
  try {
    text = execFileSync('git', ['show', `${commit}:benchmark/README.md`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const detail = typeof error.stderr === 'string' ? error.stderr.trim() : error.message
    throw new Error(`cannot read benchmark/README.md at pinned commit ${commit}: ${detail}`)
  }
  const rows = extractMarkdownTable(text)
  if (rows === null) throw new Error(`benchmark/README.md at pinned commit ${commit} has no task table (header cell "Task" not found)`)
  return rows
}

/**
 * Resolve per-task Type/description from the pinned README rows, in the
 * snapshot's task order. The snapshot task list is the sole task-inventory
 * authority; the pinned README supplies Type and description.
 */
export function buildTaskMetadata(snapshot, tableRows, commit) {
  const byId = new Map()
  for (const cells of tableRows) {
    const id = String(cells[0] ?? '').replaceAll('`', '').trim()
    if (id === '') continue
    if (cells.length !== 3) throw new Error(`pinned README task table row for "${id}" has ${cells.length} cells (expected 3)`)
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push({ type: String(cells[1] ?? '').trim(), description: String(cells[2] ?? '').trim() })
  }
  const tasks = []
  const prefix = { S: 0, M: 0, H: 0 }
  for (const id of snapshot.benchmark.tasks) {
    const rows = byId.get(id) ?? []
    if (rows.length === 0) {
      throw new Error(`task "${id}" has no row in the benchmark README task table at pinned commit ${commit}`)
    }
    if (rows.length > 1) {
      throw new Error(`task "${id}" has ${rows.length} rows in the benchmark README task table at pinned commit ${commit} (expected exactly one)`)
    }
    const { type, description } = rows[0]
    if (type !== 'Static' && type !== 'Hands-on') {
      throw new Error(`task "${id}" has unknown registry Type "${type}" at pinned commit ${commit} (expected Static | Hands-on)`)
    }
    if (description === '') {
      throw new Error(`task "${id}" has an empty description in the benchmark README task table at pinned commit ${commit}`)
    }
    const prefixChar = /^([A-Za-z])/.exec(id)?.[1] ?? ''
    if (prefixChar !== 'S' && prefixChar !== 'M' && prefixChar !== 'H') {
      throw new Error(`task "${id}" has an ID prefix "${prefixChar}" outside the S/M/H set`)
    }
    prefix[prefixChar] += 1
    tasks.push({ id, type, description })
  }
  const staticCount = tasks.filter((task) => task.type === 'Static').length
  const handsOnCount = tasks.length - staticCount
  return { tasks, staticCount, handsOnCount, prefix }
}

export function renderMetadataTex(meta) {
  const esc = escapeLatex
  return [
    '% AUTO-GENERATED. DO NOT EDIT.',
    `% Source snapshot: benchmark/snapshots/${meta.snapshotId}.json`,
    `% Pinned benchmark commit: ${meta.commitFull}`,
    '% Generated from pinned git objects; current checkout task inventory is ignored.',
    `% conditions (in order): ${meta.conditions.map(esc).join(', ')}`,
    '',
    `\\newcommand{\\BenchmarkSnapshotId}{${esc(meta.snapshotId)}}`,
    `\\newcommand{\\BenchmarkSnapshotDate}{${esc(meta.snapshotDate)}}`,
    '',
    `\\newcommand{\\BenchmarkTaskCount}{${meta.taskCount}}`,
    '',
    `\\newcommand{\\BenchmarkStaticCount}{${meta.staticCount}}`,
    `\\newcommand{\\BenchmarkHandsOnCount}{${meta.handsOnCount}}`,
    '',
    `\\newcommand{\\BenchmarkPrefixSCount}{${meta.prefix.S}}`,
    `\\newcommand{\\BenchmarkPrefixMCount}{${meta.prefix.M}}`,
    `\\newcommand{\\BenchmarkPrefixHCount}{${meta.prefix.H}}`,
    '',
    `\\newcommand{\\BenchmarkRunsPerTask}{${meta.runsPerTask}}`,
    '',
    `\\newcommand{\\BenchmarkAggregation}{${esc(meta.aggregation)}}`,
    '',
    `\\newcommand{\\BenchmarkConditionCount}{${meta.conditionCount}}`,
    '',
    `\\newcommand{\\BenchmarkCommitFull}{${meta.commitFull}}`,
    `\\newcommand{\\BenchmarkCommitShort}{${meta.commitShort}}`,
    '',
    `\\newcommand{\\BenchmarkSkillCommitFull}{${meta.skillCommitFull}}`,
    `\\newcommand{\\BenchmarkSkillCommitShort}{${meta.skillCommitShort}}`,
    '',
  ].join('\n')
}

export function renderTaskTableTex(meta) {
  const esc = escapeLatex
  const rows = meta.tasks
    .map((task) => `  ${esc(task.id)} & ${esc(task.type)} & ${esc(task.description)} \\\\`)
    .join('\n')
  return [
    '% AUTO-GENERATED. DO NOT EDIT.',
    `% Source snapshot: benchmark/snapshots/${meta.snapshotId}.json`,
    '% Generated from pinned git objects; current checkout task inventory is ignored.',
    '% Requires the macros from paper/generated/benchmark-metadata.tex.',
    '',
    '\\begin{table*}[t]',
    '\\centering',
    '\\small',
    '\\begin{tabular}{llp{0.72\\linewidth}}',
    '\\hline',
    'Task & Type & What it tests \\\\',
    '\\hline',
    rows,
    '\\hline',
    '\\end{tabular}',
    `\\caption{Task pool of the frozen evaluation snapshot \\BenchmarkSnapshotId{} (\\BenchmarkTaskCount{} tasks: \\BenchmarkStaticCount{} static, \\BenchmarkHandsOnCount{} hands-on; ID prefixes \\BenchmarkPrefixSCount{} S / \\BenchmarkPrefixMCount{} M / \\BenchmarkPrefixHCount{} H), pinned to benchmark commit \\texttt{\\BenchmarkCommitShort{}}. Generated from git objects at the pinned commit; do not edit by hand.}`,
    '\\label{tab:frozen-task-pool}',
    '\\end{table*}',
    '',
  ].join('\n')
}

/**
 * Full pipeline for one snapshot. Returns byte-stable LaTeX plus structured
 * metadata. Throws on any schema/git-object/registry inconsistency.
 */
export function generateFromSnapshot({ repoRoot, snapshotPath }) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  } catch (error) {
    throw new Error(`snapshot ${snapshotPath}: not valid JSON (${error.message})`)
  }
  // Reuse the evaluation-snapshot validator: shape, taskCount vs tasks.length,
  // duplicate task IDs, SHA formats, referenced-commit resolvability, and
  // per-task presence at the pinned benchmark commit are all enforced here.
  const failures = validateSnapshot(parsed, snapshotPath, repoRoot)
  if (failures.length > 0) {
    throw new Error(`snapshot ${snapshotPath} failed validation:\n${failures.join('\n')}`)
  }
  const commit = parsed.benchmark.commit
  const tableRows = loadPinnedBenchmarkTable(repoRoot, commit)
  const built = buildTaskMetadata(parsed, tableRows, commit)
  const meta = {
    snapshotId: parsed.id,
    snapshotDate: parsed.createdAt,
    commitFull: commit,
    commitShort: commit.slice(0, 7),
    skillCommitFull: parsed.skill.commit,
    skillCommitShort: parsed.skill.commit.slice(0, 7),
    taskCount: parsed.benchmark.taskCount,
    staticCount: built.staticCount,
    handsOnCount: built.handsOnCount,
    prefix: built.prefix,
    runsPerTask: parsed.protocol.runsPerTask,
    aggregation: parsed.protocol.aggregation,
    conditionCount: parsed.protocol.conditions.length,
    conditions: parsed.protocol.conditions,
    tasks: built.tasks,
  }
  return {
    meta,
    metadataTex: renderMetadataTex(meta),
    taskPoolTex: renderTaskTableTex(meta),
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--check')
  const check = process.argv.slice(2).includes('--check')
  if (args.length !== 1) {
    console.error('usage: node paper/scripts/generate-benchmark-table.mjs <snapshot.json> [--check]')
    console.error('  <snapshot.json>  path relative to the repo root, e.g. benchmark/snapshots/2026-09-01-main-23.json')
    process.exit(2)
  }
  let repoRoot
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8' }).trim()
  } catch {
    console.error('error: not inside a git repository (the generator resolves everything from local git objects)')
    process.exit(2)
  }
  const snapshotPath = resolve(process.cwd(), args[0])
  let result
  try {
    result = generateFromSnapshot({ repoRoot, snapshotPath })
  } catch (error) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
  const generatedDir = join(repoRoot, 'paper', 'generated')
  const targets = [
    ['benchmark-metadata.tex', result.metadataTex],
    ['task-pool-table.tex', result.taskPoolTex],
  ]
  if (check) {
    let stale = false
    for (const [name, content] of targets) {
      const file = join(generatedDir, name)
      if (!existsSync(file)) {
        console.error(`missing generated file: paper/generated/${name}`)
        stale = true
      } else if (readFileSync(file, 'utf8') !== content) {
        console.error(`out of date: paper/generated/${name}`)
        stale = true
      }
    }
    if (stale) {
      console.error('Run: npm run generate:paper-benchmark')
      process.exit(1)
    }
    console.log(`paper benchmark metadata is up to date (snapshot ${result.meta.snapshotId}, ${result.meta.taskCount} tasks)`)
    process.exit(0)
  }
  mkdirSync(generatedDir, { recursive: true })
  for (const [name, content] of targets) writeFileSync(join(generatedDir, name), content)
  console.log(`wrote paper/generated/benchmark-metadata.tex and paper/generated/task-pool-table.tex (snapshot ${result.meta.snapshotId}, ${result.meta.taskCount} tasks)`)
}
