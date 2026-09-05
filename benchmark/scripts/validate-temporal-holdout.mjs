// benchmark/scripts/validate-temporal-holdout.mjs
//
// Deterministic validator for the temporal holdout split definition
// (benchmark/holdouts/temporal-holdout-v1.json).
//
// Every pinned SHA and date is re-verified against LOCAL git objects; the
// post-freeze task universe is re-discovered at the definition's
// candidateInventoryCommit (never at current HEAD), so living-main growth can
// never mutate a frozen split. Silent omissions are hard errors.
//
// Checks:
//   - shape: schemaVersion/id/kind, 40-char freeze + inventory SHAs;
//   - git objects: freeze and inventory commits resolvable; recorded
//     freeze.commitDate / skillTree / skillEntryBlob / inventory date match
//     git metadata;
//   - candidates: no duplicates; every candidate task exists at the
//     inventory commit; firstTaskCommit resolvable, an ancestor of the
//     inventory commit, with benchmark/tasks/<id>/task.toml present, and the
//     recorded firstTaskDate matches the commit date;
//   - cards: every card firstCommit resolvable; the card id appears under
//     skills/ at firstCommit and NOT at its parent (false first-commit
//     declarations fail); recorded firstDate matches; recorded
//     relativeToFreeze/presentAtFreezeTree match the re-derived facts
//     (relativeToFreeze = before iff present in the frozen tree, else after
//     iff the first commit is not an ancestor of the freeze);
//   - policy consistency: clean-holdout requires coreKnowledgeRationale,
//     knowledgeAtFreeze.status === 'absent', no core card with
//     relativeToFreeze 'before', and postFreezeKnowledgeRequired === true;
//     mixed/ineligible require exclusionReason; primaryTasks must equal the
//     set of clean-holdout candidates exactly (no omission, no extras);
//   - completeness: every task present at the inventory commit whose first
//     introduction is not an ancestor of the freeze commit must appear in
//     candidates (no silent omission); tasks added after the inventory
//     commit are ignored and must not appear as candidates.
//
// Usage: node benchmark/scripts/validate-temporal-holdout.mjs [repo-root]
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const FAILURE_PREFIX = '[temporal-holdout]'
const FULL_SHA_RE = /^[0-9a-f]{40}$/

function git(repoRoot, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFailure) return null
    throw new Error(`git ${args.join(' ')} failed: ${String(error.stderr ?? error.message).trim()}`)
  }
}

function commitResolvable(repoRoot, sha) {
  return git(repoRoot, ['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }) !== null
}

function isAncestor(repoRoot, maybeAncestor, commit) {
  return git(repoRoot, ['merge-base', '--is-ancestor', maybeAncestor, commit], { allowFailure: true }) !== null
}

function commitDate(repoRoot, sha) {
  return git(repoRoot, ['show', '-s', '--format=%cI', sha])
}

function treeOf(repoRoot, spec) {
  return git(repoRoot, ['rev-parse', spec], { allowFailure: true })
}

function cardPresentAt(repoRoot, sha, cardId) {
  return git(repoRoot, ['grep', '-l', '-F', cardId, sha, '--', 'skills/plugin-upgrade/'], { allowFailure: true }) !== null
}

function listTaskDirs(repoRoot, commit) {
  const out = git(repoRoot, ['ls-tree', '--name-only', commit, 'benchmark/tasks/'])
  return out === '' ? [] : out.split('\n').map((line) => line.replace(/^benchmark\/tasks\//, '').replace(/\/$/, '')).sort()
}

function taskFirstTouch(repoRoot, taskId) {
  const out = git(repoRoot, ['log', '--format=%H %cI', '--', `benchmark/tasks/${taskId}/`])
  const lines = out === '' ? [] : out.split('\n')
  const last = lines[lines.length - 1]
  if (last === undefined || last.trim() === '') return null
  const [sha, iso] = last.split(' ', 2)
  return { sha, iso }
}

function shapeFailures(def, file) {
  const failures = []
  const fail = (message) => failures.push(`${FAILURE_PREFIX} ${file}: ${message}`)
  if (def === null || typeof def !== 'object' || Array.isArray(def)) { fail('definition must be a JSON object'); return failures }
  if (def.schemaVersion !== 1) fail(`schemaVersion must be 1, got ${JSON.stringify(def.schemaVersion)}`)
  if (def.id !== 'temporal-holdout-v1') fail(`id must be "temporal-holdout-v1", got ${JSON.stringify(def.id)}`)
  if (def.kind !== 'distillation-time-holdout') fail(`kind must be "distillation-time-holdout", got ${JSON.stringify(def.kind)}`)
  for (const field of ['freeze', 'candidateInventoryCommit', 'eligibilityPolicy', 'candidates', 'primaryTasks']) {
    if (def[field] === undefined) fail(`missing required field: ${field}`)
  }
  if (def.freeze !== undefined && (def.freeze === null || typeof def.freeze !== 'object' || typeof def.freeze.commit !== 'string' || !FULL_SHA_RE.test(def.freeze.commit))) {
    fail('freeze.commit must be a full 40-char lowercase hex SHA')
  }
  if (typeof def.candidateInventoryCommit !== 'string' || !FULL_SHA_RE.test(def.candidateInventoryCommit)) {
    fail('candidateInventoryCommit must be a full 40-char lowercase hex SHA')
  }
  if (!Array.isArray(def.candidates) || def.candidates.length === 0) fail('candidates must be a non-empty array')
  if (!Array.isArray(def.primaryTasks)) fail('primaryTasks must be an array')
  return failures
}

function candidateFailures(def, repoRoot, file) {
  const failures = []
  const fail = (message) => failures.push(`${FAILURE_PREFIX} ${file}: ${message}`)
  const freeze = def.freeze
  const inventory = def.candidateInventoryCommit

  // freeze metadata vs git
  const freezeDate = commitDate(repoRoot, freeze.commit)
  if (freeze.commitDate !== freezeDate) fail(`freeze.commitDate ${freeze.commitDate} does not match git commit date ${freezeDate}`)
  const skillTree = treeOf(repoRoot, `${freeze.commit}:${freeze.skillPath}`)
  if (skillTree !== freeze.skillTree) fail(`freeze.skillTree ${freeze.skillTree} does not match git tree ${skillTree}`)
  const entryBlob = treeOf(repoRoot, `${freeze.commit}:${freeze.skillPath}/SKILL.md`)
  if (entryBlob !== freeze.skillEntryBlob) fail(`freeze.skillEntryBlob ${freeze.skillEntryBlob} does not match git blob ${entryBlob}`)
  const inventoryDate = commitDate(repoRoot, inventory)
  if (def.candidateInventoryCommitDate !== inventoryDate) fail(`candidateInventoryCommitDate ${def.candidateInventoryCommitDate} does not match git commit date ${inventoryDate}`)

  // candidates
  const seen = new Set()
  const classifications = new Map()
  for (const candidate of def.candidates) {
    const id = candidate.currentTaskId
    if (typeof id !== 'string' || id === '') { fail('candidate with empty currentTaskId'); continue }
    if (seen.has(id)) { fail(`duplicate candidate task: ${id}`); continue }
    seen.add(id)
    classifications.set(id, candidate.classification)

    // task exists at inventory commit
    if (git(repoRoot, ['cat-file', '-e', `${inventory}:benchmark/tasks/${id}/task.toml`], { allowFailure: true }) === null) {
      fail(`task "${id}" does not exist at candidateInventoryCommit ${inventory.slice(0, 12)}`)
    }
    if (typeof candidate.historicalTaskId !== 'string' && candidate.historicalTaskId !== null) {
      fail(`task "${id}": historicalTaskId must be a string or null`)
    }

    // firstTaskCommit checks (task directory presence; the earliest tasks
    // predate the Harbor-format migration, so task.toml is not required there)
    if (typeof candidate.firstTaskCommit !== 'string' || !FULL_SHA_RE.test(candidate.firstTaskCommit)) {
      fail(`task "${id}": firstTaskCommit must be a full 40-char SHA`)
    } else {
      if (!commitResolvable(repoRoot, candidate.firstTaskCommit)) {
        fail(`task "${id}": firstTaskCommit ${candidate.firstTaskCommit} not resolvable locally`)
      } else {
        const dirListing = git(repoRoot, ['ls-tree', '--name-only', candidate.firstTaskCommit, `benchmark/tasks/${id}/`], { allowFailure: true })
        if (dirListing === null || dirListing === '') {
          fail(`task "${id}": no files under benchmark/tasks/${id}/ at firstTaskCommit ${candidate.firstTaskCommit.slice(0, 12)}`)
        }
        if (!isAncestor(repoRoot, candidate.firstTaskCommit, inventory)) {
          fail(`task "${id}": firstTaskCommit is not an ancestor of candidateInventoryCommit`)
        }
        if (candidate.firstTaskDate !== commitDate(repoRoot, candidate.firstTaskCommit)) {
          fail(`task "${id}": firstTaskDate does not match the firstTaskCommit date`)
        }
      }
    }

    // cards
    for (const card of candidate.cards ?? []) {
      const cardId = card.id
      if (typeof cardId !== 'string' || cardId === '') { fail(`task "${id}": card with empty id`); continue }
      if (typeof card.firstCommit !== 'string' || !FULL_SHA_RE.test(card.firstCommit)) {
        fail(`task "${id}" card ${cardId}: firstCommit must be a full 40-char SHA`)
        continue
      }
      if (!commitResolvable(repoRoot, card.firstCommit)) {
        fail(`task "${id}" card ${cardId}: firstCommit not resolvable locally`)
        continue
      }
      if (!cardPresentAt(repoRoot, card.firstCommit, cardId)) {
        fail(`task "${id}" card ${cardId}: card id does not appear under skills/ at firstCommit ${card.firstCommit.slice(0, 12)}`)
      }
      const parent = `${card.firstCommit}^`
      if (commitResolvable(repoRoot, parent) && cardPresentAt(repoRoot, parent, cardId)) {
        fail(`task "${id}" card ${cardId}: card id already appears at the parent of the declared firstCommit — firstCommit is not the introduction`)
      }
      if (card.firstDate !== commitDate(repoRoot, card.firstCommit)) {
        fail(`task "${id}" card ${cardId}: firstDate does not match the firstCommit date`)
      }
      // relativeToFreeze re-derived: tree membership is authoritative
      const presentAtFreeze = cardPresentAt(repoRoot, freeze.commit, cardId)
      if (card.presentAtFreezeTree !== presentAtFreeze) {
        fail(`task "${id}" card ${cardId}: presentAtFreezeTree recorded ${card.presentAtFreezeTree}, git says ${presentAtFreeze}`)
      }
      const expectedRelative = presentAtFreeze
        ? 'before'
        : (isAncestor(repoRoot, card.firstCommit, freeze.commit) ? 'before' : 'after')
      if (card.relativeToFreeze !== expectedRelative) {
        fail(`task "${id}" card ${cardId}: relativeToFreeze recorded ${card.relativeToFreeze}, re-derived ${expectedRelative}`)
      }
    }

    // classification consistency
    const cls = candidate.classification
    if (!['clean-holdout', 'mixed', 'ineligible'].includes(cls)) {
      fail(`task "${id}": unknown classification ${JSON.stringify(cls)}`)
      continue
    }
    if (cls === 'clean-holdout') {
      if (typeof candidate.coreKnowledgeRationale !== 'string' || candidate.coreKnowledgeRationale.trim() === '') {
        fail(`task "${id}": clean-holdout requires coreKnowledgeRationale`)
      }
      if (candidate.exclusionReason !== null) fail(`task "${id}": clean-holdout must have exclusionReason null`)
      const kaf = candidate.knowledgeAtFreeze
      if (kaf === undefined || kaf.status !== 'absent') fail(`task "${id}": clean-holdout requires knowledgeAtFreeze.status === 'absent' (recorded ${JSON.stringify(kaf?.status)})`)
      if (candidate.coreJudgeDependency?.postFreezeKnowledgeRequired !== true) fail(`task "${id}": clean-holdout requires coreJudgeDependency.postFreezeKnowledgeRequired === true`)
      for (const card of candidate.cards ?? []) {
        if (card.role !== 'supporting' && card.relativeToFreeze === 'before') {
          fail(`task "${id}": clean-holdout has core card ${card.id} with relativeToFreeze 'before' (only role=supporting pre-freeze citations are allowed)`)
        }
      }
      // post-freeze provenance gate: at least one core card introduced after
      // the freeze, or at least one evidence entry referencing a post-freeze
      // knowledge-authority commit (idless rollup/recipe knowledge).
      const hasPostFreezeCard = (candidate.cards ?? []).some((card) => card.role !== 'supporting' && card.relativeToFreeze === 'after')
      const hasPostFreezeEvidence = (candidate.knowledgeAtFreeze?.evidence ?? []).some((entry) => {
        if (typeof entry?.commit !== 'string' || !FULL_SHA_RE.test(entry.commit)) return false
        return commitResolvable(repoRoot, entry.commit) && !isAncestor(repoRoot, entry.commit, freeze.commit)
      })
      if (!hasPostFreezeCard && !hasPostFreezeEvidence) {
        fail(`task "${id}": clean-holdout has no post-freeze provenance (no core card with relativeToFreeze 'after' and no evidence entry at a post-freeze commit)`)
      }
    } else {
      if (typeof candidate.exclusionReason !== 'string' || candidate.exclusionReason.trim() === '') {
        fail(`task "${id}": ${cls} requires exclusionReason`)
      }
    }
    // evidence entries resolve
    for (const evidence of candidate.knowledgeAtFreeze?.evidence ?? []) {
      if (typeof evidence?.commit !== 'string' || typeof evidence?.path !== 'string' || typeof evidence?.match !== 'string') {
        fail(`task "${id}": malformed knowledgeAtFreeze evidence entry`)
      }
    }
  }

  // primaryTasks === clean set exactly
  const cleanSet = [...classifications.entries()].filter(([, cls]) => cls === 'clean-holdout').map(([task]) => task).sort()
  const primary = [...def.primaryTasks].sort()
  if (JSON.stringify(primary) !== JSON.stringify(cleanSet)) {
    fail(`primaryTasks must be exactly the clean-holdout candidates: expected [${cleanSet.join(', ')}], got [${primary.join(', ')}]`)
  }
  for (const task of def.primaryTasks) if (!seen.has(task)) fail(`primaryTasks contains unknown task ${task}`)

  // completeness: re-discover the post-freeze universe at the INVENTORY commit
  const inventoryTasks = listTaskDirs(repoRoot, inventory)
  for (const task of inventoryTasks) {
    const first = taskFirstTouch(repoRoot, task)
    if (first === null) { fail(`cannot determine first introduction of task "${task}"`); continue }
    const postFreeze = !isAncestor(repoRoot, first.sha, freeze.commit)
    if (postFreeze && !seen.has(task)) {
      fail(`task "${task}" was introduced after the freeze (first touch ${first.sha.slice(0, 12)}) but is not classified in candidates — silent omission is not allowed`)
    }
  }
  for (const task of seen) {
    if (!inventoryTasks.includes(task)) {
      fail(`candidate "${task}" does not exist at candidateInventoryCommit (tasks added after the inventory commit are ignored by this split and must not appear)`)
    }
  }
  return failures
}

export function validateHoldout(def, repoRoot, file = 'benchmark/holdouts/temporal-holdout-v1.json') {
  const failures = shapeFailures(def, file)
  if (failures.length === 0) {
    const freeze = def.freeze
    const inventory = def.candidateInventoryCommit
    if (!commitResolvable(repoRoot, freeze.commit)) {
      failures.push(`${FAILURE_PREFIX} ${file}: freeze commit ${freeze.commit} not resolvable in the local clone`)
      return failures
    }
    if (!commitResolvable(repoRoot, inventory)) {
      failures.push(`${FAILURE_PREFIX} ${file}: candidateInventoryCommit ${inventory} not resolvable in the local clone`)
      return failures
    }
    failures.push(...candidateFailures(def, repoRoot, file))
  }
  return failures
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const repoRoot = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
  const defPath = join(repoRoot, 'benchmark', 'holdouts', 'temporal-holdout-v1.json')
  let def
  try {
    def = JSON.parse(readFileSync(defPath, 'utf8'))
  } catch (error) {
    console.error(`${FAILURE_PREFIX} ${defPath}: not valid JSON (${error.message})`)
    process.exit(1)
  }
  const failures = validateHoldout(def, repoRoot)
  if (failures.length > 0) {
    console.error(`Temporal-holdout validation failed (${failures.length}):`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  const clean = def.primaryTasks.length
  console.log(`${FAILURE_PREFIX} OK: temporal-holdout-v1 valid — ${def.candidates.length} candidates audited, ${clean} clean-holdout primary tasks at inventory commit ${def.candidateInventoryCommit.slice(0, 12)}`)
}
