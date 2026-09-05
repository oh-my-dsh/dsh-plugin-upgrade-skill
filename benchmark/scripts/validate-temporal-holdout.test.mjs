// benchmark/scripts/validate-temporal-holdout.test.mjs
//
// Synthetic-repository tests for the temporal holdout validator. No network,
// no dependency on the real repo's history: each test builds a minimal git
// repository in mkdtemp with a freeze commit, a task universe, and a
// definition JSON, then asserts the validator accepts or rejects it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateHoldout } from './validate-temporal-holdout.mjs'

function initRepo() {
  const root = mkdtempSync(join(tmpdir(), 'holdout-test-'))
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

function writeCard(root, id) {
  write(root, `skills/plugin-upgrade/references/v0.1.2-alpha.1.md`, id)
}

function writeTask(root, id) {
  write(root, `benchmark/tasks/${id}/task.toml`)
  write(root, `benchmark/tasks/${id}/instruction.md`)
}

function gitOut(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function dateOf(root, sha) {
  return gitOut(root, ['show', '-s', '--format=%cI', sha])
}

// Standard repo: freeze (skill tree, no tasks), then two tasks + one card, then inventory.
function buildRepo() {
  const root = initRepo()
  write(root, 'skills/plugin-upgrade/SKILL.md')
  write(root, 'skills/plugin-upgrade/references/rollup-0.1.2.md')
  const freeze = commitAll(root, 'freeze')
  const skillTree = gitOut(root, ['rev-parse', `${freeze}:skills/plugin-upgrade`])
  const skillBlob = gitOut(root, ['rev-parse', `${freeze}:skills/plugin-upgrade/SKILL.md`])
  writeTask(root, 'T1-alpha')
  writeTask(root, 'T2-beta')
  const firstTask = commitAll(root, 'tasks')
  writeCard(root, 'DSH-0.1.2-A1-99')
  const cardCommit = commitAll(root, 'card')
  write(root, 'inventory-marker.txt')
  const inventory = commitAll(root, 'inventory')
  return { root, freeze, skillTree, skillBlob, firstTask, cardCommit, inventory }
}

function baseDef({ root, freeze, skillTree, skillBlob, firstTask, cardCommit, inventory }) {
  return {
    schemaVersion: 1,
    id: 'temporal-holdout-v1',
    kind: 'distillation-time-holdout',
    definitionCommitPolicy: 'outcome-blind provenance-only selection',
    freeze: {
      commit: freeze,
      commitDate: dateOf(root, freeze),
      skillPath: 'skills/plugin-upgrade',
      skillTree,
      skillEntryBlob: skillBlob,
    },
    candidateInventoryCommit: inventory,
    candidateInventoryCommitDate: dateOf(root, inventory),
    candidateInventoryNote: 'synthetic',
    eligibilityPolicy: { 'clean-holdout': [], mixed: '', ineligible: '', relativeToFreeze: '', primary: '' },
    candidates: [
      {
        currentTaskId: 'T1-alpha',
        historicalTaskId: null,
        firstTaskCommit: firstTask,
        firstTaskDate: dateOf(root, firstTask),
        taskPathAtCurrentMain: 'benchmark/tasks/T1-alpha',
        taskPathAtFirstAppearance: 'benchmark/tasks/T1-alpha',
        cards: [{ id: 'DSH-0.1.2-A1-99', firstCommit: cardCommit, firstDate: dateOf(root, cardCommit), relativeToFreeze: 'after', presentAtFreezeTree: false }],
        knowledgeAtFreeze: { status: 'absent', evidence: [{ commit: freeze, path: 'skills/plugin-upgrade', match: 'synthetic' }] },
        coreJudgeDependency: { postFreezeKnowledgeRequired: true, rationale: 'synthetic' },
        coreKnowledgeRationale: 'synthetic post-freeze knowledge',
        classification: 'clean-holdout',
        exclusionReason: null,
      },
      {
        currentTaskId: 'T2-beta',
        historicalTaskId: null,
        firstTaskCommit: firstTask,
        firstTaskDate: dateOf(root, firstTask),
        taskPathAtCurrentMain: 'benchmark/tasks/T2-beta',
        taskPathAtFirstAppearance: 'benchmark/tasks/T2-beta',
        cards: [],
        knowledgeAtFreeze: { status: 'present', evidence: [] },
        coreJudgeDependency: { postFreezeKnowledgeRequired: false, rationale: 'synthetic pre-freeze' },
        classification: 'ineligible',
        exclusionReason: 'synthetic pre-freeze knowledge',
      },
    ],
    primaryTasks: ['T1-alpha'],
  }
}

function run(def, root) {
  return validateHoldout(def, root)
}

test('clean holdout definition validates end-to-end', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  assert.deepEqual(run(def, repo.root), [])
})

test('task after freeze but with only pre-freeze card knowledge cannot be clean', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[1].classification = 'clean-holdout'
  def.candidates[1].exclusionReason = null
  def.candidates[1].coreKnowledgeRationale = 'synthetic'
  def.candidates[1].knowledgeAtFreeze.status = 'absent'
  def.candidates[1].coreJudgeDependency.postFreezeKnowledgeRequired = true
  def.primaryTasks = ['T1-alpha', 'T2-beta']
  const failures = run(def, repo.root)
  // T2-beta has no post-freeze card and no clean rationale for absent knowledge
  assert.ok(failures.some((f) => f.includes('T2-beta')))
})

test('clean candidate with equivalent frozen knowledge recorded present fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[0].knowledgeAtFreeze.status = 'present'
  assert.ok(run(def, repo.root).some((f) => f.includes('knowledgeAtFreeze.status')))
})

test('clean candidate with a core card relativeToFreeze before fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[0].cards[0].relativeToFreeze = 'before'
  def.candidates[0].cards[0].presentAtFreezeTree = true
  assert.ok(run(def, repo.root).some((f) => f.includes("relativeToFreeze 'before'")))
})

test('mixed multi-card task is allowed but requires exclusionReason', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[1].classification = 'mixed'
  def.candidates[1].exclusionReason = 'synthetic mixed'
  assert.deepEqual(run(def, repo.root), [])
  def.candidates[1].exclusionReason = ''
  assert.ok(run(def, repo.root).some((f) => f.includes('requires exclusionReason')))
})

test('card first-commit detection: wrong firstCommit fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[0].cards[0].firstCommit = repo.firstTask // card not present there
  assert.ok(run(def, repo.root).some((f) => f.includes('does not appear under skills/')))
})

test('card first-commit detection: card already present at parent fails', () => {
  const root = initRepo()
  write(root, 'skills/plugin-upgrade/SKILL.md')
  const freeze = commitAll(root, 'freeze')
  writeTask(root, 'T1-alpha')
  const firstTask = commitAll(root, 'tasks')
  writeCard(root, 'DSH-0.1.2-A1-99')
  const cardA = commitAll(root, 'card A')
  write(root, 'skills/plugin-upgrade/references/v0.1.2-alpha.1.md', 'DSH-0.1.2-A1-99\nmore')
  const cardB = commitAll(root, 'card B')
  write(root, 'inventory-marker.txt')
  const inventory = commitAll(root, 'inventory')
  const def = baseDef({ root, freeze, skillTree: gitOut(root, ['rev-parse', `${freeze}:skills/plugin-upgrade`]), skillBlob: gitOut(root, ['rev-parse', `${freeze}:skills/plugin-upgrade/SKILL.md`]), firstTask, cardCommit: cardB, inventory })
  // declared firstCommit = cardB, but the card already exists at cardA (its parent)
  assert.ok(run(def, root).some((f) => f.includes('parent of the declared firstCommit')))
})

test('commit date mismatch fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.freeze.commitDate = '2020-01-01T00:00:00+00:00'
  assert.ok(run(def, repo.root).some((f) => f.includes('freeze.commitDate')))
})

test('duplicate candidate fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates.push({ ...def.candidates[1] })
  assert.ok(run(def, repo.root).some((f) => f.includes('duplicate candidate')))
})

test('duplicate primary task fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.primaryTasks = ['T1-alpha', 'T1-alpha']
  assert.ok(run(def, repo.root).some((f) => f.includes('primaryTasks must be exactly')))
})

test('clean task missing rationale fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  delete def.candidates[0].coreKnowledgeRationale
  assert.ok(run(def, repo.root).some((f) => f.includes('coreKnowledgeRationale')))
})

test('excluded task missing reason fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[1].exclusionReason = null
  assert.ok(run(def, repo.root).some((f) => f.includes('requires exclusionReason')))
})

test('primary list including a mixed task fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[1].classification = 'mixed'
  def.candidates[1].exclusionReason = 'synthetic mixed'
  def.primaryTasks = ['T1-alpha', 'T2-beta']
  assert.ok(run(def, repo.root).some((f) => f.includes('primaryTasks must be exactly')))
})

test('primary list omitting a clean task fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.primaryTasks = []
  assert.ok(run(def, repo.root).some((f) => f.includes('primaryTasks must be exactly')))
})

test('post-freeze task omitted from the candidate universe fails (no silent omission)', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  // Rebuild the universe: T3-omitted is introduced BEFORE the inventory commit,
  // so it belongs to the audited universe and must be classified.
  writeTask(repo.root, 'T3-omitted')
  commitAll(repo.root, 'omitted task pre-inventory')
  write(repo.root, 'inventory-marker2.txt')
  const newInventory = commitAll(repo.root, 'inventory v2')
  def.candidateInventoryCommit = newInventory
  def.candidateInventoryCommitDate = dateOf(repo.root, newInventory)
  const failures = run(def, repo.root)
  // T3-omitted was introduced after the freeze; it must appear in candidates
  assert.ok(failures.some((f) => f.includes('T3-omitted') && f.includes('not classified in candidates')))
})

test('task added after candidateInventoryCommit is ignored by the pinned universe', () => {
  const repo = buildRepo()
  // add a post-inventory task so HEAD has more than the inventory
  writeTask(repo.root, 'T9-post-inventory')
  commitAll(repo.root, 'post-inventory task')
  assert.deepEqual(run(baseDef(repo), repo.root), [])
})

test('renumbered task identity (historicalTaskId) validates', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidates[1].historicalTaskId = 'T2-beta-renamed-from-T2-old'
  assert.deepEqual(run(def, repo.root), [])
})

test('missing freeze git object fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.freeze.commit = '0000000000000000000000000000000000000000'
  assert.ok(run(def, repo.root).some((f) => f.includes('freeze commit')))
})

test('missing candidateInventoryCommit fails', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  def.candidateInventoryCommit = '0000000000000000000000000000000000000000'
  assert.ok(run(def, repo.root).some((f) => f.includes('candidateInventoryCommit')))
})

test('validation output is deterministic across repeated runs', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  assert.deepEqual(run(def, repo.root), run(def, repo.root))
})

test('living main advancing does not mutate the pinned v1 universe', () => {
  const repo = buildRepo()
  const def = baseDef(repo)
  // simulate living-main growth: new task + new card + new commit on top
  writeTask(repo.root, 'T10-living')
  commitAll(repo.root, 'living growth 1')
  writeCard(repo.root, 'DSH-0.1.2-A1-100')
  commitAll(repo.root, 'living growth 2')
  assert.deepEqual(run(def, repo.root), [])
})
