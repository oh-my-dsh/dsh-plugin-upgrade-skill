// Validates declarative checkpoint manifests (benchmark/tasks/<id>/tests/checkpoints.json)
// for the tasks that opt in. Tasks without the file are unaffected — the checkpoint
// grading model is opt-in per task until the community reaches consensus on it.
//
// Checks per manifest:
//   - schema === 1, task === directory name, dshTarget is a semver-prerelease tag;
//   - checkpoints: non-empty, unique ids, allowed types, integer points in 1..99,
//     points sum to exactly 100, `requires` references earlier ids, `cap` total in
//     1..99 and `cap.when` references existing ids;
//   - every cited card id appears in skills/plugin-upgrade/references;
//   - provenance carries author/date/evidence;
//   - every declared checkpoint id is implemented in the task's judge.mjs.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const FAILURE_PREFIX = '[checkpoints]'
const TYPES = new Set(['fail-to-pass', 'pass-to-pass', 'pass', 'report'])

export function validateCheckpoints(repoRoot) {
  const failures = []
  const fail = (file, message) => failures.push(`${relative(repoRoot, file).replaceAll('\\', '/')}: ${message}`)
  const benchmarkRoot = join(repoRoot, 'benchmark')
  const tasksRoot = join(benchmarkRoot, 'tasks')
  const referencesDir = join(repoRoot, 'skills', 'plugin-upgrade', 'references')
  const referenceCorpus = corpusOf(referencesDir)
  let manifests = 0

  for (const entry of readdirSync(tasksRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const taskId = entry.name
    const manifestPath = join(tasksRoot, taskId, 'tests', 'checkpoints.json')
    if (!existsSync(manifestPath)) continue
    manifests += 1

    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      fail(manifestPath, `invalid JSON: ${error.message}`)
      continue
    }
    if (manifest.schema !== 1) fail(manifestPath, 'schema must be 1')
    if (manifest.task !== taskId) fail(manifestPath, `task must equal the directory name (${taskId})`)
    if (typeof manifest.dshTarget !== 'string' || !/^0\.\d+\.\d+-[0-9A-Za-z.-]+$/.test(manifest.dshTarget)) {
      fail(manifestPath, 'dshTarget must be a semver prerelease tag such as 0.1.2-alpha.2')
    }
    if (!Array.isArray(manifest.checkpoints) || manifest.checkpoints.length === 0) {
      fail(manifestPath, 'checkpoints must be a non-empty array')
      continue
    }

    const ids = new Set()
    let total = 0
    for (const [index, cp] of manifest.checkpoints.entries()) {
      if (typeof cp.id !== 'string' || cp.id.length === 0) fail(manifestPath, `checkpoint #${index + 1}: id must be a non-empty string`)
      if (ids.has(cp.id)) fail(manifestPath, `duplicate checkpoint id: ${cp.id}`)
      ids.add(cp.id)
      if (!TYPES.has(cp.type)) fail(manifestPath, `checkpoint ${cp.id}: type must be one of ${[...TYPES].join('/')}`)
      if (!Number.isInteger(cp.points) || cp.points < 1 || cp.points > 99) {
        fail(manifestPath, `checkpoint ${cp.id}: points must be an integer in 1..99`)
      } else {
        total += cp.points
      }
      for (const req of cp.requires ?? []) {
        const targetIndex = manifest.checkpoints.findIndex((c) => c.id === req)
        if (targetIndex < 0) fail(manifestPath, `checkpoint ${cp.id}: requires unknown id ${req}`)
        else if (targetIndex >= index) fail(manifestPath, `checkpoint ${cp.id}: requires must reference an earlier checkpoint (${req})`)
      }
      if (cp.cap) {
        if (!Number.isInteger(cp.cap.total) || cp.cap.total < 1 || cp.cap.total > 99) {
          fail(manifestPath, `checkpoint ${cp.id}: cap.total must be an integer in 1..99`)
        }
        if (cp.cap.when !== undefined) {
          if (!Array.isArray(cp.cap.when) || cp.cap.when.some((id) => !manifest.checkpoints.some((c) => c.id === id))) {
            fail(manifestPath, `checkpoint ${cp.id}: cap.when must reference existing checkpoint ids`)
          }
        }
      }
    }
    if (total !== 100) fail(manifestPath, `checkpoint points must sum to 100 (current sum: ${total})`)

    for (const card of manifest.cards ?? []) {
      if (!referenceCorpus.includes(card)) fail(manifestPath, `card ${card} is not cited in skills/plugin-upgrade/references`)
    }
    const provenance = manifest.provenance
    if (!provenance || typeof provenance.author !== 'string' || typeof provenance.date !== 'string' || typeof provenance.evidence !== 'string') {
      fail(manifestPath, 'provenance requires author, date, and evidence')
    }

    const judgePath = join(tasksRoot, taskId, 'tests', 'judge.mjs')
    if (!existsSync(judgePath)) {
      fail(manifestPath, 'judge.mjs missing')
    } else {
      const judgeText = readFileSync(judgePath, 'utf8')
      for (const cp of manifest.checkpoints) {
        if (!judgeText.includes(cp.id)) fail(manifestPath, `checkpoint ${cp.id} is not implemented in judge.mjs`)
      }
    }
  }

  return { ok: failures.length === 0, failures, manifests }
}

function corpusOf(referencesDir) {
  try {
    return readdirSync(referencesDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => readFileSync(join(referencesDir, name), 'utf8'))
      .join('\n')
  } catch {
    return ''
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const repoRoot = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
  const result = validateCheckpoints(repoRoot)
  if (result.ok) {
    console.log(`${FAILURE_PREFIX} OK: ${result.manifests} checkpoint manifest(s) valid`)
    process.exit(0)
  }
  for (const failure of result.failures) console.log(`${failure}\n`)
  process.exit(1)
}
