// benchmark/scripts/validate-evaluation-snapshots.mjs
//
// Validates every benchmark/snapshots/*.json (except schema.json) as an immutable
// evaluation snapshot. A snapshot pins an exact benchmark commit, an explicit
// frozen task list, an exact skill commit/path, and the run protocol — and it is
// checked against the REFERENCED commits via local git objects, never against the
// current living benchmark inventory. Adding tasks to main therefore never
// invalidates an existing snapshot.
//
// Network is never used: if a referenced commit is not present in the local
// clone, the validator fails with an actionable "fetch the referenced commit"
// message instead of fetching anything.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const SNAPSHOT_ID_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/
export const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
export const FULL_SHA_RE = /^[0-9a-f]{40}$/
export const TASK_ID_RE = /^[A-Z][A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
export const SUPPORTED_AGGREGATIONS = ['per-task-median']
export const REPOSITORY = 'oh-my-dsh/dsh-plugin-upgrade-skill'

const PREFIX = '[evaluation-snapshot]'

// ── git plumbing (local only, never fetches) ──────────────────────────────────

export function gitCatFileExists(repoRoot, spec) {
  try {
    execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', spec], { stdio: 'ignore' })
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('git executable not found; evaluation snapshots must be validated inside a git clone')
    }
    return false
  }
}

export function gitCommitResolvable(repoRoot, sha) {
  return gitCatFileExists(repoRoot, `${sha}^{commit}`)
}

// ── per-snapshot validation ───────────────────────────────────────────────────

export function validateSnapshot(parsed, filePath, repoRoot) {
  const failures = []
  const fail = (reason) => failures.push(`${PREFIX} ${filePath}: ${reason}`)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('snapshot must be a JSON object')
    return failures
  }

  // Shape checks (no git required).
  if (parsed.schemaVersion !== 1) fail(`schemaVersion must be 1, got ${JSON.stringify(parsed.schemaVersion)}`)
  if (typeof parsed.id !== 'string' || !SNAPSHOT_ID_RE.test(parsed.id)) {
    fail(`id must match YYYY-MM-DD-<lowercase-kebab-slug>, got ${JSON.stringify(parsed.id)}`)
  } else {
    if (basename(filePath) !== `${parsed.id}.json`) fail(`filename must be "${parsed.id}.json", got "${basename(filePath)}"`)
  }
  if (typeof parsed.createdAt !== 'string' || !DATE_RE.test(parsed.createdAt)) {
    fail(`createdAt must be YYYY-MM-DD, got ${JSON.stringify(parsed.createdAt)}`)
  } else if (typeof parsed.id === 'string' && parsed.id.slice(0, 10) !== parsed.createdAt) {
    fail(`createdAt (${parsed.createdAt}) must match the date prefix of id (${parsed.id.slice(0, 10)})`)
  }
  if (parsed.repository !== REPOSITORY) fail(`repository must be "${REPOSITORY}", got ${JSON.stringify(parsed.repository)}`)

  const benchmark = parsed.benchmark
  const skill = parsed.skill
  const protocol = parsed.protocol
  if (benchmark === null || typeof benchmark !== 'object' || Array.isArray(benchmark)) fail('benchmark must be an object')
  if (skill === null || typeof skill !== 'object' || Array.isArray(skill)) fail('skill must be an object')
  if (protocol === null || typeof protocol !== 'object' || Array.isArray(protocol)) fail('protocol must be an object')

  let benchmarkSha = null
  let skillSha = null
  let skillPath = null
  if (benchmark && typeof benchmark === 'object') {
    if (typeof benchmark.commit !== 'string' || !FULL_SHA_RE.test(benchmark.commit)) {
      fail(`benchmark.commit must be a full 40-char lowercase hex SHA, got ${JSON.stringify(benchmark.commit)}`)
    } else {
      benchmarkSha = benchmark.commit
    }
    const tasks = benchmark.tasks
    if (!Array.isArray(tasks) || tasks.length === 0) {
      fail('benchmark.tasks must be a non-empty array of task IDs')
    } else {
      if (typeof benchmark.taskCount !== 'number' || !Number.isInteger(benchmark.taskCount)) {
        fail(`benchmark.taskCount must be an integer, got ${JSON.stringify(benchmark.taskCount)}`)
      } else if (benchmark.taskCount !== tasks.length) {
        fail(`benchmark.taskCount (${benchmark.taskCount}) must equal tasks.length (${tasks.length})`)
      }
      const seen = new Set()
      for (const task of tasks) {
        if (typeof task !== 'string' || !TASK_ID_RE.test(task)) {
          fail(`invalid task ID: ${JSON.stringify(task)} (expected e.g. "S1-static-scan")`)
        } else if (seen.has(task)) {
          fail(`duplicate task ID in the frozen list: ${task}`)
        }
        if (typeof task === 'string') seen.add(task)
      }
    }
  }
  if (skill && typeof skill === 'object') {
    if (typeof skill.commit !== 'string' || !FULL_SHA_RE.test(skill.commit)) {
      fail(`skill.commit must be a full 40-char lowercase hex SHA, got ${JSON.stringify(skill.commit)}`)
    } else {
      skillSha = skill.commit
    }
    if (typeof skill.path !== 'string' || skill.path.trim() === '') {
      fail(`skill.path must be a non-empty path, got ${JSON.stringify(skill.path)}`)
    } else {
      skillPath = skill.path
    }
  }
  if (protocol && typeof protocol === 'object') {
    if (typeof protocol.runsPerTask !== 'number' || !Number.isInteger(protocol.runsPerTask) || protocol.runsPerTask < 1) {
      fail(`protocol.runsPerTask must be an integer >= 1, got ${JSON.stringify(protocol.runsPerTask)}`)
    }
    if (!SUPPORTED_AGGREGATIONS.includes(protocol.aggregation)) {
      fail(`protocol.aggregation must be one of [${SUPPORTED_AGGREGATIONS.join(', ')}], got ${JSON.stringify(protocol.aggregation)}`)
    }
    if (!Array.isArray(protocol.conditions) || protocol.conditions.length === 0) {
      fail('protocol.conditions must be a non-empty array')
    } else {
      const seenConditions = new Set()
      for (const condition of protocol.conditions) {
        if (typeof condition !== 'string' || condition.trim() === '') {
          fail(`invalid condition: ${JSON.stringify(condition)}`)
        } else if (seenConditions.has(condition)) {
          fail(`duplicate condition: ${condition}`)
        }
        if (typeof condition === 'string') seenConditions.add(condition)
      }
    }
  }
  if (parsed.notes !== undefined && (!Array.isArray(parsed.notes) || parsed.notes.some((note) => typeof note !== 'string'))) {
    fail('notes must be an array of strings when present')
  }

  // Git checks: everything below resolves against the REFERENCED commits, so a
  // snapshot stays valid while the living benchmark grows.
  if (benchmarkSha) {
    if (!gitCommitResolvable(repoRoot, benchmarkSha)) {
      fail(`cannot resolve benchmark commit ${benchmarkSha} in the local clone — fetch the referenced commit before validating`)
    } else if (benchmark && Array.isArray(benchmark.tasks) && benchmark.tasks.every((task) => typeof task === 'string' && TASK_ID_RE.test(task))) {
      for (const task of benchmark.tasks) {
        for (const required of ['task.toml', 'instruction.md']) {
          if (!gitCatFileExists(repoRoot, `${benchmarkSha}:benchmark/tasks/${task}/${required}`)) {
            fail(`task "${task}" has no ${required} at benchmark commit ${benchmarkSha}`)
          }
        }
      }
    }
  }
  if (skillSha && skillPath) {
    if (!gitCommitResolvable(repoRoot, skillSha)) {
      fail(`cannot resolve skill commit ${skillSha} in the local clone — fetch the referenced commit before validating`)
    } else if (!gitCatFileExists(repoRoot, `${skillSha}:${skillPath}/SKILL.md`)) {
      fail(`skill path "${skillPath}" has no SKILL.md at skill commit ${skillSha}`)
    }
  }

  return failures
}

// ── directory-level validation ────────────────────────────────────────────────

export function validateSnapshots(snapshotsDir, repoRoot) {
  const failures = []
  let count = 0
  let entries
  try {
    entries = readdirSync(snapshotsDir)
  } catch {
    failures.push(`${PREFIX} snapshots directory not found: ${snapshotsDir}`)
    return { ok: false, failures, count }
  }
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json') || entry === 'schema.json') continue
    const filePath = join(snapshotsDir, entry)
    let parsed
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    } catch (error) {
      failures.push(`${PREFIX} ${filePath}: not valid JSON (${error.message})`)
      continue
    }
    count += 1
    failures.push(...validateSnapshot(parsed, filePath, repoRoot))
  }
  if (count === 0) failures.push(`${PREFIX} no snapshot manifests found under ${snapshotsDir}`)
  return { ok: failures.length === 0, failures, count }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const repoRoot = resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
  const snapshotsDir = join(repoRoot, 'benchmark', 'snapshots')
  const result = validateSnapshots(snapshotsDir, repoRoot)
  if (result.ok) {
    console.log(`${PREFIX} OK: ${result.count} snapshot(s) valid`)
    process.exit(0)
  }
  for (const failure of result.failures) console.log(failure)
  process.exit(1)
}
