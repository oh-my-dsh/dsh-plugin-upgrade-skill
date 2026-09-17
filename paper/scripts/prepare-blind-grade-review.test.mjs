// paper/scripts/prepare-blind-grade-review.test.mjs
//
// Focused tests for the blinded grading-review packet builder and its leakage
// / integrity validator. Every test runs against synthetic fixtures in
// mkdtemp: no network, no model calls, and no dependence on the committed
// packet's contents beyond determinism re-derivation.
//
// The builder is a pure function of the artifact bytes under repoRoot; most tests call
// buildPackage() directly with a synthetic repo whose three round aggregates
// and per-answer report.md files are written by hand.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ANSWER_COUNT, ARMS, COORDINATOR_MAP_PATH, MANIFEST_PATH, REVIEWER_CSV_COLUMNS,
  REVIEWER_CSV_PATHS, REVIEWER_VISIBLE_DIR, ROUND_PREFERENCE, RUBRIC_PATH,
  SELECTION_SEED, SOURCE_ROOTS, STRATUM_TARGETS, STRATA, TASK_COUNT,
  anonymousId, assignAnonymousIds, buildPackage, chooseAnswers, chooseRound,
  computeTaskDeltas, deterministicShuffle, loadAggregates, median, mulberry32,
  orderKey, randomInt, renderCoordinatorMap, renderManifest, selectTasks,
  sha256, stratumFillOrder, stratumForDelta,
} from './prepare-blind-grade-review.mjs'
import {
  ANSWER_FILE_RE, AUTHORED_LEAKAGE_PATTERNS, EXPLICIT_REVIEW_FLAG,
  LEAKAGE_KEY_PATTERNS, PROVENANCE_PATTERNS, basenameOf, coordinatorMapAllowSet,
  filledRows, findRatingFields, frontMatterLeaks, listFiles, markdownHeaderLines,
  parseCsvTemplate, scanKeys, scanText, validateBlindGradeReview,
  validateCoordinatorMapShape, validateReviewerVisibleLeakage,
} from './validate-blind-grade-review.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')

// ── synthetic fixtures ───────────────────────────────────────────────────────

let fixtureCounter = 0
function tempRoot() {
  fixtureCounter += 1
  return mkdtempSync(join(tmpdir(), `bgr-${fixtureCounter}-`))
}

function writeFile(root, rel, content) {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), content)
}

function sha256Of(text) {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Build a synthetic three-round paired dataset.
 *   tasks: array of { id, deltas: [r1, r2, r3] } — the delta is skill−noskill.
 *   missing: array of "round/arm/task" keys whose report.md is omitted.
 * Round scores are chosen so the round-2 pair can never win a score-based tie
 * break: round 2 is always the LOWEST-scoring round.
 */
function buildFixture({ tasks, missing = [], seedClause = true }) {
  const root = tempRoot()
  const roundRecords = { 1: [], 2: [], 3: [] }
  tasks.forEach((task, taskIndex) => {
    for (const round of [1, 2, 3]) {
      const delta = task.deltas[round - 1]
      const base = 40 + taskIndex * 2
      // The scores encode the delta but NOT the round preference.
      const noskill = base + round * 3
      const skill = noskill + delta
      roundRecords[round].push({ task: task.id, method: 'synthetic', noskill, skill, notes: '' })
      for (const arm of ['noskill', 'skill']) {
        const key = `${round}/${arm}/${task.id}`
        if (missing.includes(key)) continue
        // The answer header deliberately names the task but never the arm or
        // round, so the synthetic packet exercises the same surfaces as the
        // historical reports.
        writeFile(root, `${SOURCE_ROOTS[round]}/${arm}/${task.id}/report.md`, `# ${task.id} inspection report\n\nBody paragraph for the fixture.\n`)
      }
    }
  })
  for (const round of [1, 2, 3]) {
    writeFile(root, `${SOURCE_ROOTS[round]}/aggregate.json`, JSON.stringify(roundRecords[round]))
  }
  if (seedClause) writeFile(root, 'SEED.txt', `${SELECTION_SEED}\n`)
  return root
}

/** 22 tasks: 10 positive, 12 zero, 0 negative — mirrors the historical pool. */
function historicalShape() {
  const tasks = []
  for (let i = 1; i <= 22; i += 1) {
    const delta = i <= 10 ? 20 : 0
    tasks.push({ id: `S${i}-trap`, deltas: [0, delta, delta] })
  }
  return tasks
}

function deltasFor(tasks) {
  const rounds = { 1: new Map(), 2: new Map(), 3: new Map() }
  for (const task of tasks) {
    for (const round of [1, 2, 3]) {
      const delta = task.deltas[round - 1]
      rounds[round].set(task.id, { task: task.id, noskill: 50, skill: 50 + delta })
    }
  }
  return computeTaskDeltas(rounds)
}

function builtFixture(options) {
  const root = buildFixture(options)
  const built = buildPackage({ repoRoot: root })
  return { root, built }
}

function manifestOf(built) {
  return JSON.parse(built.files.get(MANIFEST_PATH))
}

function mapOf(built) {
  return JSON.parse(built.files.get(COORDINATOR_MAP_PATH))
}

// ── deterministic primitives ─────────────────────────────────────────────────

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(SELECTION_SEED)
  const b = mulberry32(SELECTION_SEED)
  for (let i = 0; i < 50; i += 1) {
    const value = a()
    assert.equal(value, b())
    assert.ok(value >= 0 && value < 1)
  }
})

test('randomInt stays in range and rejects a non-positive bound', () => {
  const rand = mulberry32(7)
  const seen = new Set()
  for (let i = 0; i < 500; i += 1) {
    const value = randomInt(rand, 5)
    assert.ok(Number.isInteger(value) && value >= 0 && value < 5)
    seen.add(value)
  }
  assert.equal(seen.size, 5)
  assert.throws(() => randomInt(rand, 0), /bad bound/)
})

test('deterministicShuffle is seed-stable, permutation-preserving, non-mutating', () => {
  const input = Array.from({ length: 32 }, (_, i) => `R${i}`)
  const frozen = [...input]
  const first = deterministicShuffle(input, SELECTION_SEED)
  const second = deterministicShuffle(input, SELECTION_SEED)
  assert.deepEqual(first, second)
  assert.deepEqual(input, frozen, 'input must not be mutated')
  assert.deepEqual([...first].sort(), [...input].sort())
  assert.notDeepEqual(deterministicShuffle(input, SELECTION_SEED + 1), first)
})

test('median averages the two middle values for even lengths', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([5]), 5)
  assert.equal(median([]), null)
})

test('orderKey is stable and independent of the delta value', () => {
  assert.equal(orderKey(SELECTION_SEED, 'S1-trap'), orderKey(SELECTION_SEED, 'S1-trap'))
  assert.notEqual(orderKey(SELECTION_SEED, 'S1-trap'), orderKey(SELECTION_SEED + 1, 'S1-trap'))
  // Same task id always orders the same, whatever its delta is.
  const a = deltasFor([{ id: 'S1-trap', deltas: [100, 100, 100] }])
  const b = deltasFor([{ id: 'S1-trap', deltas: [-100, -100, -100] }])
  assert.equal(a.get('S1-trap').perTaskDelta, 100)
  assert.equal(b.get('S1-trap').perTaskDelta, -100)
  assert.equal(orderKey(SELECTION_SEED, 'S1-trap'), orderKey(SELECTION_SEED, 'S1-trap'))
})

// ── stratum classification and fallback order ────────────────────────────────

test('stratumForDelta maps sign to positive/zero/negative', () => {
  assert.equal(stratumForDelta(20), 'positive')
  assert.equal(stratumForDelta(0), 'zero')
  assert.equal(stratumForDelta(-5), 'negative')
  assert.throws(() => stratumForDelta(Number.NaN), /non-finite/)
})

test('stratumFillOrder draws a short stratum from its nearest neighbour first', () => {
  assert.deepEqual(stratumFillOrder('negative'), ['zero', 'positive'])
  assert.deepEqual(stratumFillOrder('positive'), ['zero', 'negative'])
  assert.deepEqual(stratumFillOrder('zero'), ['positive', 'negative'])
})

test('computeTaskDeltas uses the round median, not the last round', () => {
  const deltas = deltasFor([{ id: 'S1-trap', deltas: [0, 20, 60] }])
  assert.equal(deltas.get('S1-trap').perTaskDelta, 20)
  assert.deepEqual(deltas.get('S1-trap').perRound, [0, 20, 60])
})

// ── sampling ─────────────────────────────────────────────────────────────────

test('selection is deterministic for a fixed seed and fixture', () => {
  const tasks = historicalShape()
  const deltas = deltasFor(tasks)
  const ids = tasks.map((task) => task.id)
  const first = selectTasks({ taskIds: ids, deltas })
  const second = selectTasks({ taskIds: ids, deltas })
  assert.deepEqual(first.tasks, second.tasks)
  assert.equal(first.tasks.length, TASK_COUNT)
})

test('a different seed changes the sampled task set', () => {
  const tasks = historicalShape()
  const deltas = deltasFor(tasks)
  const ids = tasks.map((task) => task.id)
  const base = selectTasks({ taskIds: ids, deltas, seed: SELECTION_SEED })
  const other = selectTasks({ taskIds: ids, deltas, seed: SELECTION_SEED + 1 })
  assert.notDeepEqual(base.tasks, other.tasks)
})

test('strata targets are pre-declared and sum to 16', () => {
  const sum = STRATA.reduce((total, name) => total + STRATUM_TARGETS[name], 0)
  assert.equal(sum, TASK_COUNT)
  assert.deepEqual(STRATUM_TARGETS, { positive: 7, zero: 6, negative: 3 })
})

test('all requested strata are represented when the pool has enough of each', () => {
  // 8 positive, 8 zero, 8 negative — every stratum can meet its target exactly.
  const tasks = []
  for (let i = 0; i < 24; i += 1) {
    const delta = i < 8 ? 10 : i < 16 ? 0 : -10
    tasks.push({ id: `T${String(i).padStart(2, '0')}`, deltas: [delta, delta, delta] })
  }
  const selection = selectTasks({ taskIds: tasks.map((task) => task.id), deltas: deltasFor(tasks) })
  assert.deepEqual(selection.achieved, { positive: 7, zero: 6, negative: 3 })
  assert.equal(selection.fallbackApplication?.length ?? selection.draws.filter((draw) => draw.fallback).length, 0)
})

test('a short stratum is filled from the nearest stratum, deterministically', () => {
  // No negative deltas at all: the 3 negative slots must come from "zero",
  // never from "positive" and never by hand-picking.
  const tasks = historicalShape()
  const selection = selectTasks({ taskIds: tasks.map((task) => task.id), deltas: deltasFor(tasks) })
  assert.deepEqual(selection.achieved, { positive: 7, zero: 9, negative: 0 })
  const fallbacks = selection.draws.filter((draw) => draw.fallback)
  assert.equal(fallbacks.length, 3)
  for (const draw of fallbacks) {
    assert.equal(draw.drawTarget, 'negative')
    assert.equal(draw.source, 'zero')
  }
  // Deterministic under repetition.
  const again = selectTasks({ taskIds: tasks.map((task) => task.id), deltas: deltasFor(tasks) })
  assert.deepEqual(selection.tasks, again.tasks)
  assert.deepEqual(selection.draws, again.draws)
})

test('fallback never draws from a stratum that is not the nearest one first', () => {
  // 7 positive, 10 zero, 0 negative. "negative" is short by 3 and must take
  // them from "zero" (its nearest, since it has no members of its own), never
  // from "positive"; "zero" and "positive" both meet their targets exactly.
  const tasks = []
  for (let i = 0; i < 17; i += 1) {
    const delta = i < 7 ? 10 : 0
    tasks.push({ id: `U${String(i).padStart(2, '0')}`, deltas: [delta, delta, delta] })
  }
  const selection = selectTasks({ taskIds: tasks.map((task) => task.id), deltas: deltasFor(tasks) })
  const fallbacks = selection.draws.filter((draw) => draw.fallback)
  // `achieved` counts sampled tasks by their OWN stratum: 3 zero-delta tasks
  // fill "negative" (borrowed, so they still count as zero) plus 6 seated in
  // "zero", while none of the positive tasks are borrowed.
  assert.deepEqual(selection.achieved, { positive: 7, zero: 9, negative: 0 })
  assert.equal(fallbacks.length, 3)
  assert.ok(fallbacks.every((draw) => `${draw.drawTarget}<-${draw.source}` === 'negative<-zero'))
  // Deterministic under repetition.
  const again = selectTasks({ taskIds: tasks.map((task) => task.id), deltas: deltasFor(tasks) })
  assert.deepEqual(selection.tasks, again.tasks)
  assert.deepEqual(fallbacks, again.draws.filter((draw) => draw.fallback))
})

test('selection rejects stratum targets that do not sum to 16 and duplicate tasks', () => {
  const tasks = historicalShape()
  const deltas = deltasFor(tasks)
  assert.throws(
    () => selectTasks({ taskIds: tasks.map((task) => task.id), deltas, targets: { positive: 1, zero: 1, negative: 1 } }),
    /must sum to 16/,
  )
  assert.throws(() => selectTasks({ taskIds: ['S1-trap', 'S1-trap'], deltas, targets: { positive: 1, zero: 1, negative: 1 } }), /sum to 16|duplicates/)
})

test('selection refuses to fill a deficit that no stratum can cover', () => {
  // Only 2 tasks exist for 16 slots: no feasible assignment exists.
  const tasks = [{ id: 'A', deltas: [0, 0, 0] }, { id: 'B', deltas: [0, 0, 0] }]
  assert.throws(
    () => selectTasks({ taskIds: ['A', 'B'], deltas: deltasFor(tasks) }),
    /no feasible assignment/,
  )
})

// ── round rule ───────────────────────────────────────────────────────────────

test('round rule prefers round 2 and never consults a score', () => {
  assert.deepEqual(ROUND_PREFERENCE, [2, 1, 3])
  const chosen = chooseRound([1, 2, 3])
  assert.equal(chosen.round, 2)
  assert.equal(chosen.fallbackUsed, false)
})

test('round rule falls back deterministically round 1 before round 3', () => {
  assert.deepEqual(chooseRound([1, 3]), { round: 1, fallbackUsed: true })
  assert.deepEqual(chooseRound([3]), { round: 3, fallbackUsed: true })
  assert.deepEqual(chooseRound([1]), { round: 1, fallbackUsed: true })
})

test('round rule throws when no round has an answer', () => {
  assert.throws(() => chooseRound([]), /no answer available/)
  assert.throws(() => chooseRound([9]), /no answer available/)
})

test('chooseAnswers uses round 2 when every round is present', () => {
  const tasks = historicalShape()
  const root = buildFixture({ tasks })
  const { rounds } = loadAggregates(root)
  const answers = chooseAnswers({ repoRoot: root, tasks: ['S1-trap', 'S2-trap'], rounds })
  assert.equal(answers.length, 2 * ARMS.length)
  assert.ok(answers.every((answer) => answer.round === 2))
  assert.ok(answers.every((answer) => answer.roundRuleFallback === false))
})

test('chooseAnswers falls back to round 1 when round 2 is unavailable', () => {
  const tasks = historicalShape()
  const root = buildFixture({ tasks, missing: ['2/noskill/S1-trap', '2/skill/S1-trap'] })
  const { rounds } = loadAggregates(root)
  const answers = chooseAnswers({ repoRoot: root, tasks: ['S1-trap'], rounds })
  assert.ok(answers.every((answer) => answer.round === 1 && answer.roundRuleFallback === true))
})

test('chooseAnswers falls back to round 3 when rounds 1 and 2 are unavailable', () => {
  const tasks = historicalShape()
  const root = buildFixture({
    tasks,
    missing: ['1/noskill/S2-trap', '1/skill/S2-trap', '2/noskill/S2-trap', '2/skill/S2-trap'],
  })
  const { rounds } = loadAggregates(root)
  const answers = chooseAnswers({ repoRoot: root, tasks: ['S2-trap'], rounds })
  assert.ok(answers.every((answer) => answer.round === 3 && answer.roundRuleFallback === true))
})

test('a round is selected by file availability only, so a high-scoring round cannot be preferred', () => {
  // Make round 1 the only available round while giving round 2 a huge score.
  const tasks = historicalShape()
  const root = buildFixture({ tasks, missing: ['2/noskill/S3-trap', '2/skill/S3-trap', '3/noskill/S3-trap', '3/skill/S3-trap'] })
  const { rounds } = loadAggregates(root)
  assert.ok(rounds[2].get('S3-trap').skill > rounds[1].get('S3-trap').skill, 'fixture sanity: round 2 scores higher')
  const answers = chooseAnswers({ repoRoot: root, tasks: ['S3-trap'], rounds })
  assert.ok(answers.every((answer) => answer.round === 1))
})

test('chooseAnswers reports a missing source artifact instead of inventing an answer', () => {
  const tasks = historicalShape()
  const root = buildFixture({
    tasks,
    missing: ['1/noskill/S4-trap', '1/skill/S4-trap', '2/noskill/S4-trap', '2/skill/S4-trap', '3/noskill/S4-trap', '3/skill/S4-trap'],
  })
  const { rounds } = loadAggregates(root)
  assert.throws(() => chooseAnswers({ repoRoot: root, tasks: ['S4-trap'], rounds }), /missing source artifact/)
})

// ── anonymous ids and package shape ──────────────────────────────────────────

test('anonymous ids are deterministic, unique, and cover R001..R032', () => {
  const answers = Array.from({ length: ANSWER_COUNT }, (_, i) => ({ task: `S${i}`, arm: ARMS[i % 2] }))
  const first = assignAnonymousIds(answers)
  const second = assignAnonymousIds(answers)
  assert.deepEqual(first, second)
  assert.equal(typeof first.seed, 'number')
  const ids = first.shuffled.map((answer) => answer.reviewId)
  assert.equal(new Set(ids).size, ANSWER_COUNT)
  assert.deepEqual([...ids].sort(), Array.from({ length: ANSWER_COUNT }, (_, i) => anonymousId(i)))
})

test('the anonymous order is a derangement, never the natural task/arm order', () => {
  const answers = Array.from({ length: ANSWER_COUNT }, (_, i) => ({ task: `S${String(i).padStart(2, '0')}`, arm: ARMS[i % 2] }))
  const { shuffled, seed } = assignAnonymousIds(answers)
  // The derangement is checked on the shuffled sequence itself: shuffled[k] is
  // the answer that took position k, and it may not be the k-th input answer.
  const plain = deterministicShuffle(answers, seed)
  plain.forEach((answer, index) => {
    assert.notEqual(answer, answers[index], `position ${index} kept its input order`)
  })
  const ids = shuffled.map((answer) => answer.reviewId)
  assert.deepEqual(ids, Array.from({ length: ANSWER_COUNT }, (_, i) => anonymousId(i)))
})

test('anonymousId zero-pads to three digits', () => {
  assert.equal(anonymousId(0), 'R001')
  assert.equal(anonymousId(9), 'R010')
  assert.equal(anonymousId(31), 'R032')
})

test('buildPackage emits exactly 16 tasks / 32 answers / 32 answer files', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const manifest = manifestOf(built)
  assert.equal(manifest.taskCount, 16)
  assert.equal(manifest.answerCount, 32)
  const answerFiles = [...built.files.keys()].filter((rel) => ANSWER_FILE_RE.test(basenameOf(rel)))
  assert.equal(answerFiles.length, 32)
})

test('every sampled task contributes exactly one answer per arm', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const manifest = manifestOf(built)
  assert.equal(manifest.tasks.length, 16)
  for (const task of manifest.tasks) {
    assert.deepEqual(task.answers.map((answer) => answer.arm).sort(), [...ARMS].sort())
    assert.equal(new Set(task.answers.map((answer) => answer.reviewId)).size, 2)
  }
})

test('buildPackage is byte-identical across two runs on the same fixture', () => {
  const tasks = historicalShape()
  const root = buildFixture({ tasks })
  const first = buildPackage({ repoRoot: root })
  const second = buildPackage({ repoRoot: root })
  assert.deepEqual([...first.files.keys()].sort(), [...second.files.keys()].sort())
  for (const [rel, content] of first.files) {
    assert.equal(second.files.get(rel), content, `${rel} differs between runs`)
  }
})

test('committed packet regenerates byte-identically from the real dataset', () => {
  const built = buildPackage({ repoRoot: REPO_ROOT })
  for (const [rel, content] of built.files) {
    assert.equal(readFileSync(join(REPO_ROOT, rel), 'utf8'), content, `${rel} is stale; run npm run generate:blind-grade-review`)
  }
  assert.deepEqual([...built.files.keys()].sort(), listFiles(REPO_ROOT, dirname(MANIFEST_PATH)).sort())
})

test('the packet content is independent of the checkout commit', () => {
  // The builder never reads git: no generated file may carry a commit id, so
  // --check cannot drift with HEAD (this is what broke CI before).
  const built = buildPackage({ repoRoot: REPO_ROOT })
  for (const [rel, content] of built.files) {
    assert.ok(!/[0-9a-f]{40}/.test(content) || rel.endsWith('.json'), `${rel} unexpectedly embeds a 40-hex run`)
  }
  const manifest = JSON.parse(built.files.get(MANIFEST_PATH))
  assert.equal(manifest.sourceCommit, undefined)
  assert.equal(manifest.provenance.sourceDate, '2026-09-11')
  assert.equal(manifest.provenance.rounds.join(','), '1,2,3')
})

// ── manifest content ─────────────────────────────────────────────────────────

test('manifest records the seed, frozen provenance, and a frozen round rule', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const manifest = manifestOf(built)
  assert.equal(manifest.seed, SELECTION_SEED)
  assert.equal(manifest.provenance.dataset, 'glm-5.3-flash-s1-s22')
  assert.deepEqual(manifest.roundRule.preference, [2, 1, 3])
  assert.match(manifest.roundRule.description, /never chosen by score/)
  assert.equal(manifest.roundRule.answersUsingFallback, 0)
})

test('manifest records per-answer source path, sha256, and round', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const manifest = manifestOf(built)
  const sourceByHash = new Map(built.answers.map((answer) => [answer.reviewId, answer]))
  for (const task of manifest.tasks) {
    for (const answer of task.answers) {
      const source = sourceByHash.get(answer.reviewId)
      assert.equal(answer.sourceSha256, source.sourceSha256)
      assert.equal(answer.sourcePath, source.sourcePath)
      assert.equal(answer.sourceSha256, sha256Of(source.body))
      assert.ok([1, 2, 3].includes(answer.round))
    }
  }
})

test('manifest declares strata targets, achieved counts, and any fallback application', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const manifest = manifestOf(built)
  const byStratum = Object.fromEntries(manifest.strata.map((entry) => [entry.stratum, entry]))
  assert.equal(byStratum.positive.targetCount, 7)
  assert.equal(byStratum.zero.targetCount, 6)
  assert.equal(byStratum.negative.targetCount, 3)
  assert.equal(manifest.strata.reduce((sum, entry) => sum + entry.achievedCount, 0), 16)
  assert.equal(manifest.fallbackApplication.length, 3)
  assert.ok(manifest.fallbackApplication.every((entry) => entry.filledStratum === 'negative' && entry.drawnFromStratum === 'zero'))
})

test('manifest starts at humanReviewStatus not-started with zero reviews submitted', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const manifest = manifestOf(built)
  assert.equal(manifest.humanReview.status ?? manifest.humanReview.humanReviewStatus, 'not-started')
  assert.equal(manifest.humanReview.humanReviewsSubmitted, 0)
})

test('coordinator map is a bijection over R001..R032 with one entry per task-arm', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const map = mapOf(built)
  const ids = map.entries.map((entry) => entry.reviewId)
  assert.deepEqual([...ids].sort(), Array.from({ length: 32 }, (_, i) => anonymousId(i)))
  const byTask = new Map()
  for (const entry of map.entries) {
    if (!byTask.has(entry.task)) byTask.set(entry.task, [])
    byTask.get(entry.task).push(entry.arm)
  }
  assert.equal(byTask.size, 16)
  for (const arms of byTask.values()) assert.deepEqual(arms.sort(), [...ARMS].sort())
})

test('coordinator map is marked coordinator-only and carries the original scores', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const map = mapOf(built)
  assert.equal(map.coordinatorOnly, true)
  assert.match(map.warning, /COORDINATOR-ONLY/)
  assert.ok(map.entries.every((entry) => Number.isFinite(entry.originalScore)))
  assert.ok(map.entries.every((entry) => typeof entry.sourceSha256 === 'string' && entry.sourceSha256.length === 64))
})

test('renderManifest and renderCoordinatorMap are pure functions of their inputs', () => {
  const { built } = builtFixture({ tasks: historicalShape() })
  const manifest = manifestOf(built)
  const map = mapOf(built)
  assert.deepEqual(
    renderManifest({ answers: built.answers, selection: built.selection, deltas: built.deltas, inputs: built.inputs }),
    renderManifest({ answers: built.answers, selection: built.selection, deltas: built.deltas, inputs: built.inputs }),
  )
  assert.deepEqual(
    renderCoordinatorMap({ answers: built.answers, selection: built.selection, deltas: built.deltas }),
    renderCoordinatorMap({ answers: built.answers, selection: built.selection, deltas: built.deltas }),
  )
  assert.equal(manifest.seed, SELECTION_SEED)
  assert.equal(map.seed, SELECTION_SEED)
})

// ── leakage guard ────────────────────────────────────────────────────────────

test('provenance patterns accept benign prose and reject condition labels', () => {
  // "conditional" must not match the condition pattern.
  assert.deepEqual(scanText('a conditional DSH-0.1.2-A1-04 mapping', 'x'), [])
  assert.deepEqual(scanText('the scorer assigns a rubric band', 'x'), [])
  assert.ok(scanText('arm: no-skill', 'x').some((failure) => failure.includes('condition-label')))
  assert.ok(scanText('this is the with-skill run', 'x').some((failure) => failure.includes('condition-label')))
  assert.ok(scanText('condition 2 results', 'x').some((failure) => failure.includes('arm-field')))
})

test('provenance patterns reject round markers and original-score references', () => {
  assert.ok(scanText('round 2', 'x').some((failure) => failure.includes('round-marker')))
  assert.ok(scanText('original score: 90', 'x').some((failure) => failure.includes('original-score')))
  assert.ok(scanText('score: 100', 'x').some((failure) => failure.includes('score-assignment')))
  assert.ok(scanText('benchmark/results/artifacts/x', 'x').some((failure) => failure.includes('artifact-path')))
})

test('model identity is rejected only on authored surfaces', () => {
  const leaked = 'graded by glm-5.3-flash'
  assert.deepEqual(scanText(leaked, 'x'), [], 'provenance tier must not flag content-domain vocabulary')
  const authored = scanText(leaked, 'x', { tier: 'authored' })
  assert.ok(authored.some((failure) => failure.includes('model-identity')))
  for (const model of ['claude', 'gpt-5.6', 'deepseek v4', 'qwen3', 'terminus', 'luna']) {
    assert.ok(
      scanText(model, 'x', { tier: 'authored', patterns: AUTHORED_LEAKAGE_PATTERNS }).some((f) => f.includes('model-identity')),
      `${model} should be rejected`,
    )
  }
})

test('judge verdicts, deltas, and historical conclusions are rejected on authored surfaces', () => {
  for (const text of ['judge verdict: pass', 'llm-rubric band 3', 'mean delta +6.22', 'the skill gain is inverted-U', 'outperformed the baseline', 'significantly better than']) {
    assert.ok(
      scanText(text, 'x', { tier: 'authored' }).length > 0,
      `${text} should be rejected`,
    )
  }
})

test('leaky JSON keys are rejected but allowed paths can be exempted', () => {
  const map = { entries: [{ reviewId: 'R001', arm: 'no-skill', originalScore: 100 }] }
  const failures = scanKeys(map, 'map.json', { allow: new Set(['entries.0.arm', 'entries.0.originalScore']) })
  assert.deepEqual(failures, [])
  const strict = scanKeys({ arm: 'no-skill' }, 'map.json')
  assert.ok(strict.some((failure) => failure.includes('arm-key')))
  assert.ok(scanKeys({ model: 'glm' }, 'm.json').some((failure) => failure.includes('model-key')))
  assert.ok(LEAKAGE_KEY_PATTERNS.every(({ pattern }) => !pattern.test('armour') && !pattern.test('scorer')))
})

test('front-matter provenance metadata is rejected inside an answer file', () => {
  const clean = '# Report\n\nbody text\n'
  assert.deepEqual(frontMatterLeaks(clean), [])
  const yaml = '---\ncondition: with-skill\nscore: 90\n---\n\n# Report\n'
  const leaks = frontMatterLeaks(yaml)
  assert.ok(leaks.some((leak) => leak.includes('condition-label')), JSON.stringify(leaks))
  assert.ok(leaks.some((leak) => leak.includes('front-matter key')), JSON.stringify(leaks))
  assert.deepEqual(frontMatterLeaks(`---\nround: 2\n---\n# R\n`).length > 0, true)
})

test('markdownHeaderLines collects headers, metadata, and table rows only', () => {
  const lines = markdownHeaderLines('# Title\nplain body line\n**Scope**: x\n| a | b |\n<!-- note -->\n')
  assert.deepEqual(lines, ['# Title', '**Scope**: x', '| a | b |', '<!-- note -->'])
})

test('listFiles and parseCsvTemplate behave deterministically', () => {
  const root = tempRoot()
  writeFile(root, 'reviewer-visible/R002.md', 'b')
  writeFile(root, 'reviewer-visible/R001.md', 'a')
  writeFile(root, 'reviewer-visible/README.md', 'r')
  assert.deepEqual(listFiles(root, 'reviewer-visible').map((rel) => basenameOf(rel)), ['R001.md', 'R002.md', 'README.md'])
  assert.deepEqual(listFiles(root, 'missing-dir'), [])
  assert.deepEqual(parseCsvTemplate(`${REVIEWER_CSV_COLUMNS.join(',')}\n`).rows, [])
  const blank = parseCsvTemplate(`${REVIEWER_CSV_COLUMNS.join(',')}\n,,,\n`)
  assert.deepEqual(blank.rows, [['', '', '', '']])
  assert.deepEqual(filledRows(blank.rows), [])
  assert.equal(parseCsvTemplate('a,b\n1,2\n').rows.length, 1)
  assert.equal(filledRows(parseCsvTemplate('a,b\n,2\n').rows).length, 1)
  rmSync(root, { recursive: true, force: true })
})

// ── validator: acceptance ────────────────────────────────────────────────────

function writePacket(root, built) {
  for (const [rel, content] of built.files) writeFile(root, rel, content)
}

/** Build a complete, valid packet in a fresh temp repo and return its root. */
function validPacketRepo(options = { tasks: historicalShape() }) {
  const root = buildFixture(options)
  const built = buildPackage({ repoRoot: root })
  writePacket(root, built)
  return { root, built }
}

test('validator accepts the committed packet', () => {
  assert.deepEqual(validateBlindGradeReview(REPO_ROOT), [])
})

test('validator accepts a freshly built synthetic packet', () => {
  const { root } = validPacketRepo()
  assert.deepEqual(validateBlindGradeReview(root), [])
  rmSync(root, { recursive: true, force: true })
})

test('reviewer CSVs are all-blank templates with the exact header', () => {
  const { built } = validPacketRepo()
  for (const csvPath of REVIEWER_CSV_PATHS) {
    const parsed = parseCsvTemplate(built.files.get(csvPath))
    assert.deepEqual(parsed.header, REVIEWER_CSV_COLUMNS)
    assert.equal(parsed.rows.length, ANSWER_COUNT, 'one blank row per answer')
    assert.ok(parsed.rows.every((row) => row.length === REVIEWER_CSV_COLUMNS.length))
    assert.deepEqual(filledRows(parsed.rows), [])
  }
  const { root } = validPacketRepo()
  for (const csvPath of REVIEWER_CSV_PATHS) {
    const parsed = parseCsvTemplate(readFileSync(join(root, csvPath), 'utf8'))
    assert.equal(parsed.rows.length, ANSWER_COUNT)
    assert.deepEqual(filledRows(parsed.rows), [])
  }
  rmSync(root, { recursive: true, force: true })
})

test('findRatingFields ignores status blocks and detects fabricated ratings', () => {
  assert.deepEqual(findRatingFields({ humanReview: { humanReviewStatus: 'not-started', humanReviewsSubmitted: 0 } }), [])
  assert.deepEqual(findRatingFields({ rationale: '' }), [], 'an empty rating value is not a fabrication')
  const found = findRatingFields({ rows: [{ review_id: 'R001', correctness_score: 88 }] })
  assert.ok(found.some((path) => path.includes('correctness_score')))
})

test('validateCoordinatorMapShape accepts the built map and rejects a missing warning', () => {
  const { built } = validPacketRepo()
  const map = mapOf(built)
  const allow = coordinatorMapAllowSet(map)
  assert.deepEqual([...validateCoordinatorMapShape(map, { allow })], [])
  // Without the exemption the same map is rejected, proving the exemption is
  // what permits the coordinator-only fields.
  assert.ok(validateCoordinatorMapShape(map).length > 0)
  const stripped = { ...map }
  delete stripped.warning
  assert.ok(validateCoordinatorMapShape(stripped, { allow }).some((failure) => failure.includes('coordinator-only warning')))
  assert.ok(validateCoordinatorMapShape({ ...map, coordinatorOnly: false }, { allow }).some((failure) => failure.includes('coordinatorOnly')))
})

// ── validator: integrity failures ────────────────────────────────────────────

function firstFailure(root, needle) {
  const failures = validateBlindGradeReview(root)
  assert.ok(failures.some((failure) => failure.includes(needle)), `expected a failure containing "${needle}", got ${JSON.stringify(failures)}`)
}

test('validator rejects a missing source artifact', () => {
  const { root, built } = validPacketRepo()
  const victim = built.answers[0]
  rmSync(join(root, victim.sourcePath))
  firstFailure(root, 'missing source artifact')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a source hash mismatch', () => {
  const { root, built } = validPacketRepo()
  const victim = built.answers[0]
  writeFile(root, victim.sourcePath, 'tampered source\n')
  firstFailure(root, 'source hash mismatch')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a reviewer-visible answer that is not a verbatim copy', () => {
  const { root, built } = validPacketRepo()
  const victim = built.answers[0]
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/${victim.reviewId}.md`, 'edited by a human\n')
  firstFailure(root, 'not a verbatim copy')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a missing answer file and a duplicate answer id', () => {
  const { root, built } = validPacketRepo()
  const victim = built.answers[0]
  rmSync(join(root, `${REVIEWER_VISIBLE_DIR}/${victim.reviewId}.md`))
  firstFailure(root, 'missing reviewer-visible answer file')
  rmSync(root, { recursive: true, force: true })

  const second = validPacketRepo()
  // A file that is not one of R001..R032 is rejected outright.
  writeFile(second.root, `${REVIEWER_VISIBLE_DIR}/R033.md`, 'body\n')
  firstFailure(second.root, 'unexpected file in reviewer-visible package')
  rmSync(second.root, { recursive: true, force: true })
})

test('validator rejects a manifest that claims a review was submitted', () => {
  const { root } = validPacketRepo()
  const manifestPath = join(root, MANIFEST_PATH)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.humanReview.humanReviewsSubmitted = 1
  writeFile(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  firstFailure(root, 'humanReviewsSubmitted must be 0')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects humanReviewStatus other than not-started', () => {
  const { root } = validPacketRepo()
  const manifestPath = join(root, MANIFEST_PATH)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.humanReview.humanReviewStatus = 'complete'
  writeFile(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  firstFailure(root, 'humanReviewStatus must be "not-started"')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a partially filled reviewer form', () => {
  const { root } = validPacketRepo()
  const csvPath = join(root, REVIEWER_CSV_PATHS[0])
  writeFile(root, REVIEWER_CSV_PATHS[0], `${REVIEWER_CSV_COLUMNS.join(',')}\nR001,88,no,no,no,no,high,looks right,reviewer-x\n`)
  firstFailure(root, 'every row empty')
  assert.ok(readFileSync(csvPath, 'utf8').includes('R001'))
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects stray text appended to a reviewer form', () => {
  const { root } = validPacketRepo()
  const csvPath = REVIEWER_CSV_PATHS[1]
  const original = readFileSync(join(root, csvPath), 'utf8')
  writeFile(root, csvPath, `${original}looks fine to me\n`)
  // A stray non-empty line is a filled row and is rejected.
  firstFailure(root, 'filled row')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a reviewer form whose column count does not match the header', () => {
  const { root } = validPacketRepo()
  const csvPath = REVIEWER_CSV_PATHS[0]
  // Replace the 9-column blank rows with 4-column blank rows: still blank, but
  // structurally wrong, so a reviewer could not fill them as designed.
  writeFile(root, csvPath, `${REVIEWER_CSV_COLUMNS.join(',')}\n${Array.from({ length: 32 }, () => ',,,').join('\n')}\n`)
  firstFailure(root, 'column')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a fabricated rating embedded in the manifest', () => {
  const { root } = validPacketRepo()
  const manifestPath = join(root, MANIFEST_PATH)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.tasks[0].answers[0].correctness_score = 91
  writeFile(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  firstFailure(root, 'fabricated rating field')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a non-bijective coordinator map', () => {
  const { root } = validPacketRepo()
  const mapPath = join(root, COORDINATOR_MAP_PATH)
  const map = JSON.parse(readFileSync(mapPath, 'utf8'))
  map.entries[1].reviewId = map.entries[0].reviewId
  writeFile(root, COORDINATOR_MAP_PATH, `${JSON.stringify(map, null, 2)}\n`)
  firstFailure(root, 'duplicate review ids')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a coordinator map that omits an answer', () => {
  const { root } = validPacketRepo()
  const mapPath = join(root, COORDINATOR_MAP_PATH)
  const map = JSON.parse(readFileSync(mapPath, 'utf8'))
  map.entries.pop()
  writeFile(root, COORDINATOR_MAP_PATH, `${JSON.stringify(map, null, 2)}\n`)
  firstFailure(root, 'not a bijection')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects an arm label in a reviewer-visible answer header', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/R001.md`, '# Report (with-skill run)\n\nbody\n')
  firstFailure(root, 'condition-label')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a model name in the reviewer-facing README', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/README.md`, '# Packet\n\nAnswers produced by glm-5.3-flash.\n')
  firstFailure(root, 'model-identity')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a condition label in a reviewer-visible FILE NAME', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/with-skill-R001.md`, 'body\n')
  firstFailure(root, 'path segment')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a condition/model/round label in a reviewer-visible directory name', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/noskill/R001.md`, 'body\n')
  firstFailure(root, 'noskill')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a score or reward leak in reviewer-facing prose', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/README.md`, '# Packet\n\nEach answer scored 0-100 with a mean score of 84.\n')
  firstFailure(root, 'score')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a judge-verdict leak in the reviewer rubric', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/rubric.md`, '# Rubric\n\nReproduce the llm-rubric verdict for each answer.\n')
  firstFailure(root, 'judge')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a historical-conclusion leak in the reviewer rubric', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/rubric.md`, '# Rubric\n\nThe inverted-U pattern predicts the middle band wins.\n')
  firstFailure(root, 'historical-conclusion')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a delta leak in the reviewer rubric', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/rubric.md`, '# Rubric\n\nCompare against the mean delta reported in the paper.\n')
  firstFailure(root, 'delta')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects front-matter provenance injected into an answer file', () => {
  const { root } = validPacketRepo()
  const original = readFileSync(join(root, `${REVIEWER_VISIBLE_DIR}/R001.md`), 'utf8')
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/R001.md`, `---\ncondition: with-skill\n---\n\n${original}`)
  firstFailure(root, 'front-matter')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a wrong task or answer count in the manifest', () => {
  const { root } = validPacketRepo()
  const manifestPath = join(root, MANIFEST_PATH)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.taskCount = 12
  manifest.answerCount = 24
  writeFile(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  firstFailure(root, 'taskCount must be 16')
  firstFailure(root, 'answerCount must be 32')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a manifest whose strata counts do not match its tasks', () => {
  const { root } = validPacketRepo()
  const manifestPath = join(root, MANIFEST_PATH)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.strata.find((entry) => entry.stratum === 'zero').achievedCount = 42
  writeFile(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  firstFailure(root, 'achievedCount 42')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a task that contributes only one arm', () => {
  const { root } = validPacketRepo()
  const manifestPath = join(root, MANIFEST_PATH)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.tasks[0].answers = [manifest.tasks[0].answers[0]]
  writeFile(root, MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
  firstFailure(root, 'exactly one answer per arm')
  rmSync(root, { recursive: true, force: true })
})

test('validator rejects a missing coordinator map or manifest outright', () => {
  const { root } = validPacketRepo()
  rmSync(join(root, COORDINATOR_MAP_PATH))
  firstFailure(root, 'missing')
  rmSync(root, { recursive: true, force: true })
})

test('validateReviewerVisibleLeakage reports a missing package', () => {
  const root = tempRoot()
  const failures = validateReviewerVisibleLeakage(root)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /missing reviewer-visible package/)
  rmSync(root, { recursive: true, force: true })
})

// ── validator: determinism and CLI contract ──────────────────────────────────

test('validateBlindGradeReview is deterministic and deduplicated', () => {
  const { root } = validPacketRepo()
  const first = validateBlindGradeReview(root)
  const second = validateBlindGradeReview(root)
  assert.deepEqual(first, second)
  assert.deepEqual(first, [...new Set(first)].sort())
  assert.deepEqual(first, [])
  rmSync(root, { recursive: true, force: true })
})

test('failure lists are sorted and stable when several leaks exist', () => {
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/README.md`, '# Packet\n\nglm-5.3-flash with-skill mean delta\n')
  const failures = validateBlindGradeReview(root)
  assert.ok(failures.length >= 3)
  assert.deepEqual(failures, [...failures].sort())
  rmSync(root, { recursive: true, force: true })
})

test('the validator CLI accepts --check and exits non-zero only on failure', async () => {
  const { execFileSync } = await import('node:child_process')
  const script = join(HERE, 'validate-blind-grade-review.mjs')
  assert.equal(EXPLICIT_REVIEW_FLAG, '--check')
  const ok = execFileSync('node', [script, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.match(ok, /OK: 16 tasks \/ 32 answers/)
  const { root } = validPacketRepo()
  writeFile(root, `${REVIEWER_VISIBLE_DIR}/README.md`, '# Packet\n\nclaude with-skill\n')
  let exitCode = 0
  try {
    execFileSync('node', [script, root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    exitCode = error.status
  }
  assert.equal(exitCode, 1)
  rmSync(root, { recursive: true, force: true })
})

test('the builder CLI --check and --dry-run agree with buildPackage', async () => {
  const { execFileSync } = await import('node:child_process')
  const script = join(HERE, 'prepare-blind-grade-review.mjs')
  const checked = execFileSync('node', [script, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.match(checked, /up to date \(40 files\)/)
  const dry = execFileSync('node', [script, '--dry-run'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.match(dry, /seed 20260916; 16 tasks; 32 answers/)
  assert.match(dry, /strata targets \{"positive":7,"zero":6,"negative":3\} achieved \{"positive":7,"zero":9,"negative":0\}/)
})

// ── prompt/rubric separation contract ────────────────────────────────────────

test('the rubric keeps citation identity separate from functional correctness', () => {
  const rubric = readFileSync(join(REPO_ROOT, RUBRIC_PATH), 'utf8')
  assert.match(rubric, /citation_issue/)
  assert.match(rubric, /not (?:functional )?correctness|not functional correctness/i)
  assert.match(rubric, /do not lower\s+`?correctness_score/i)
  assert.match(rubric, /Diagnostic correctness/)
  assert.match(rubric, /Migration direction correctness/)
  assert.match(rubric, /Critical omission/)
  assert.match(rubric, /Unsupported or fabricated claim/)
  assert.match(rubric, /Contradiction/)
  assert.match(rubric, /per-task rubric authority is the task instruction/)
})

test('the committed README states preparation-only status and the blinding limit', () => {
  const readme = readFileSync(join(REPO_ROOT, 'paper/audit/blind-grade-review-v1/README.md'), 'utf8')
  assert.match(readme, /humanReviewStatus`? \| `?not-started/)
  assert.match(readme, /humanReviewsSubmitted`? \| `?0/)
  assert.match(readme, /content blinding is imperfect/i)
  assert.match(readme, /not a double-blind review/i)
  assert.match(readme, /frozen before any human review/i)
  assert.match(readme, /PR #240/)
  assert.match(readme, /is \*\*not\*\* human validation/i)
  assert.match(readme, /not a double-blind review and must never be described as one/i)
})

test('the committed reviewer README carries no provenance vocabulary at all', () => {
  const text = readFileSync(join(REPO_ROOT, REVIEWER_VISIBLE_DIR, 'README.md'), 'utf8')
  assert.ok(!/round|arm|skill|glm|delta|verdict|score|reward|judge/i.test(text))
})

test('the committed manifest and coordinator map record the same answer hashes', () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, MANIFEST_PATH), 'utf8'))
  const map = JSON.parse(readFileSync(join(REPO_ROOT, COORDINATOR_MAP_PATH), 'utf8'))
  const byId = new Map(map.entries.map((entry) => [entry.reviewId, entry]))
  for (const task of manifest.tasks) {
    for (const answer of task.answers) {
      assert.equal(byId.get(answer.reviewId).sourceSha256, answer.sourceSha256)
    }
  }
})

test('the committed packet hashes match the committed source artifacts', () => {
  const map = JSON.parse(readFileSync(join(REPO_ROOT, COORDINATOR_MAP_PATH), 'utf8'))
  for (const entry of map.entries) {
    const source = readFileSync(join(REPO_ROOT, entry.sourcePath))
    assert.equal(sha256(source), entry.sourceSha256)
    const visible = readFileSync(join(REPO_ROOT, REVIEWER_VISIBLE_DIR, `${entry.reviewId}.md`))
    assert.deepEqual(visible, source)
  }
})
