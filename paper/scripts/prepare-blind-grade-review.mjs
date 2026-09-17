// paper/scripts/prepare-blind-grade-review.mjs
//
// Deterministic packet builder for the 第二步 (work-plan §3) human grading
// review of already-scored answers: "已有答案评分复核".
//
// This script PREPARES a reviewer packet. It does not review anything, does
// not call a model, does not touch the network, and does not write any score.
// `humanReviewStatus` stays "not-started" and `humanReviewsSubmitted` stays 0
// until a human reviewer actually submits a filled CSV template.
//
// Source of truth: the historical GLM-5.3-flash S1–S22 paired dataset
// (both arms, three rounds), i.e. the raw per-round aggregates and the
// per-answer `report.md` artifacts under
// benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22{,-round2,-round3}/.
// The unmerged PR #240 (unified 64-trial run) is deliberately NOT an input.
//
// Determinism contract
// --------------------
// No timestamps, no host paths, no locale-dependent sorting, no randomness
// outside mulberry32(SELECTION_SEED). Two runs on the same inputs produce
// byte-identical outputs; `--check` fails on any drift.
//
// Sampling is FROZEN before any human review:
//   * round rule — prefer round 2, else round 1, else round 3 (fixed order,
//     never chosen by score);
//   * stratification — by the sign of the historical per-task delta
//     (median over the three rounds of skill − no-skill), with pre-declared
//     stratum targets and a deterministic nearest-stratum fallback;
//   * anonymous ids — one seeded Fisher–Yates shuffle of the 32 answers.
//
// Usage (from the repo root):
//   node paper/scripts/prepare-blind-grade-review.mjs
//   node paper/scripts/prepare-blind-grade-review.mjs --check
//   node paper/scripts/prepare-blind-grade-review.mjs --dry-run   (print plan)
//   node paper/scripts/prepare-blind-grade-review.mjs <repo-root>

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ── Frozen design constants (declared, not tuned) ─────────────────────────────

/** Seed for every deterministic ordering decision in this packet. */
export const SELECTION_SEED = 20260916
/** Exactly 16 tasks contribute 2 answers each (1 per arm) = 32 answers. */
export const TASK_COUNT = 16
export const ANSWERS_PER_TASK = 2
export const ANSWER_COUNT = TASK_COUNT * ANSWERS_PER_TASK
/** Arms. The order here fixes tie-breaking and CSV column order downstream. */
export const ARMS = ['no-skill', 'with-skill']
/** Round preference rule: prefer round 2, then round 1, then round 3. */
export const ROUND_PREFERENCE = [2, 1, 3]
export const ROUND_IDS = [1, 2, 3]
/** Stratum names, in the fixed reporting order. */
export const STRATA = ['positive', 'zero', 'negative']
/**
 * Pre-declared stratum targets (fixed 2026-09-16, before any human review).
 * They sum to TASK_COUNT. `negative` may be short in the historical data; the
 * deterministic nearest-stratum fallback below fills the deficit rather than
 * hand-picking a task.
 */
export const STRATUM_TARGETS = Object.freeze({ positive: 7, zero: 6, negative: 3 })

export const PACKET_DIR = 'paper/audit/blind-grade-review-v1'
export const REVIEWER_VISIBLE_DIR = `${PACKET_DIR}/reviewer-visible`
export const MANIFEST_PATH = `${PACKET_DIR}/sample-manifest.json`
export const COORDINATOR_MAP_PATH = `${PACKET_DIR}/coordinator-map.json`
export const README_PATH = `${PACKET_DIR}/README.md`
export const RUBRIC_PATH = `${PACKET_DIR}/rubric.md`
export const REVIEWER_README_PATH = `${REVIEWER_VISIBLE_DIR}/README.md`
export const REVIEWER_RUBRIC_PATH = `${REVIEWER_VISIBLE_DIR}/rubric.md`
export const REVIEWER_CSV_PATHS = [`${PACKET_DIR}/reviewer-a.csv`, `${PACKET_DIR}/reviewer-b.csv`]
export const REVIEWER_CSV_COLUMNS = [
  'review_id',
  'correctness_score',
  'critical_error',
  'unsupported_claim',
  'contradiction',
  'citation_issue',
  'confidence',
  'rationale',
  'reviewer_id',
]
export const SCHEMA_VERSION = 1
export const MANIFEST_ID = 'blind-grade-review-v1-manifest'
export const COORDINATOR_MAP_ID = 'blind-grade-review-v1-coordinator-map'

// Historical GLM-5.3-flash S1–S22 sources (relative to the repo root). The
// round-1 directory is the un-suffixed one. Fixed here so the manifest can
// record exactly which artifacts were read.
export const SOURCE_ROOTS = Object.freeze({
  1: 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22',
  2: 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round2',
  3: 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round3',
})
export const AGGREGATE_BASENAME = 'aggregate.json'
export const ANSWER_BASENAME = 'report.md'

export const HUMAN_REVIEW_STATUS = 'not-started'

/**
 * Frozen provenance for the historical source dataset. Deliberately a literal,
 * not `git rev-parse HEAD`: every file this builder writes is a pure function
 * of the artifact bytes on disk, so the packet regenerates byte-identically on
 * any checkout and `--check` can never drift with the local commit state. The
 * per-answer source sha256 values in the manifest, not a commit id, are the
 * authoritative content pin.
 */
export const SOURCE_PROVENANCE = Object.freeze({
  dataset: 'glm-5.3-flash-s1-s22',
  modelFamily: 'historical mid-baseline group (S1-S22 static tasks)',
  sourceDate: '2026-09-11',
  rounds: [1, 2, 3],
  arms: ['no-skill', 'with-skill'],
  artifactRoots: [
    'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22',
    'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round2',
    'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round3',
  ],
  note: 'provenance is descriptive; the per-answer sha256 + source path in sources.answers pin the exact bytes',
})


// ── Deterministic primitives ─────────────────────────────────────────────────

/** mulberry32: 32-bit state counter PRNG, public-domain reference. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Unbiased integer in [0, bound) from a uniform float generator (rejection). */
export function randomInt(rand, bound) {
  if (!Number.isInteger(bound) || bound <= 0) throw new Error(`randomInt: bad bound ${bound}`)
  const limit = Math.floor(4294967296 / bound) * bound
  for (;;) {
    const raw = Math.floor(rand() * 4294967296)
    if (raw < limit) return raw % bound
  }
}

/** Seeded Fisher–Yates (unbiased, deterministic, does not mutate the input). */
export function deterministicShuffle(items, seed) {
  const out = [...items]
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rand, i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/** sha256 of a Buffer/string, hex. */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

/** sha256 of a file's verbatim bytes, hex. */
export function sha256File(path) {
  return sha256(readFileSync(path))
}

/** Stable per-item ordering key: sha256(seed + '\n' + key). */
export function orderKey(seed, key) {
  return sha256(`${seed}\n${key}`)
}

/** Median of a numeric list (even length → mean of the two middles). */
export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

/** Sign stratum for a historical per-task delta. Zero is its own stratum. */
export function stratumForDelta(delta) {
  if (!Number.isFinite(delta)) throw new Error(`stratumForDelta: non-finite delta ${delta}`)
  if (delta > 0) return 'positive'
  if (delta < 0) return 'negative'
  return 'zero'
}

/** Deterministic nearest-stratum fill order for a short stratum. */
export function stratumFillOrder(shortStratum) {
  return STRATA.filter((name) => name !== shortStratum).sort((a, b) => {
    const distance = Math.abs(STRATA.indexOf(a) - STRATA.indexOf(shortStratum))
      - Math.abs(STRATA.indexOf(b) - STRATA.indexOf(shortStratum))
    return distance !== 0 ? distance : STRATA.indexOf(a) - STRATA.indexOf(b)
  })
}

// ── Loading the historical paired dataset ────────────────────────────────────

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`missing source artifact: ${label} (${path})`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${label}: not valid JSON (${error.message})`)
  }
}

/**
 * Load the three per-round aggregates and index them as
 * rounds[round][task] = { noskill, skill, method }.
 */
export function loadAggregates(repoRoot) {
  const rounds = {}
  const inputs = []
  for (const round of ROUND_IDS) {
    const rel = `${SOURCE_ROOTS[round]}/${AGGREGATE_BASENAME}`
    const abs = join(repoRoot, rel)
    const records = readJson(abs, `round ${round} aggregate`)
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error(`round ${round} aggregate must be a non-empty JSON array`)
    }
    const byTask = new Map()
    for (const record of records) {
      if (typeof record?.task !== 'string' || record.task === '') {
        throw new Error(`round ${round} aggregate: record with empty task id`)
      }
      if (byTask.has(record.task)) throw new Error(`round ${round} aggregate: duplicate task ${record.task}`)
      for (const field of ['noskill', 'skill']) {
        if (!Number.isFinite(record[field])) {
          throw new Error(`round ${round} aggregate: task ${record.task} has non-numeric ${field}`)
        }
      }
      byTask.set(record.task, record)
    }
    rounds[round] = byTask
    inputs.push({ round, path: rel, sha256: sha256File(abs) })
  }
  // Every round must cover the same task set; a task missing from a round is a
  // hard error (the round rule fallback exists for missing *answers*, and a
  // partly-missing round would make the delta definition ambiguous).
  const reference = [...rounds[1].keys()].sort()
  for (const round of ROUND_IDS) {
    const keys = [...rounds[round].keys()].sort()
    if (keys.length !== reference.length || keys.some((key, index) => key !== reference[index])) {
      throw new Error(`round ${round} aggregate task set differs from round 1`)
    }
  }
  return { rounds, taskIds: reference, inputs }
}

/**
 * Historical per-task delta: median over the three rounds of (skill − no-skill).
 * This is the same quantity the paper's paired table reports as a per-task
 * median delta; it is computed here from the raw round aggregates so the
 * stratum definition does not depend on a derived stats file.
 */
export function computeTaskDeltas(rounds) {
  const deltas = new Map()
  for (const task of [...rounds[1].keys()].sort()) {
    const perRound = ROUND_IDS.map((round) => rounds[round].get(task).skill - rounds[round].get(task).noskill)
    deltas.set(task, { perTaskDelta: median(perRound), perRound })
  }
  return deltas
}

// ── Stratified deterministic selection ───────────────────────────────────────

/**
 * Maximum bipartite assignment, used to seat strata without stranding a later
 * one. Nodes: 0 = source, 1..n strata, then one node per task, then the sink.
 * Edges from a stratum to a task exist in `stratumFillOrder` (own stratum
 * first, then nearest), so a feasible assignment always uses the nearest
 * available donor. Deterministic greedy augmenting paths; graph is tiny.
 * Returns stratum index → Set(task) or null when no perfect assignment exists.
 */
function maxFlowAssign({ strata, tasks, demandByStratum, members }) {
  const source = 0
  const stratumNode = new Map(strata.map((name, index) => [name, 1 + index]))
  const taskNode = new Map(tasks.map((task, index) => [task, 1 + strata.length + index]))
  const sink = 1 + strata.length + tasks.length
  const size = sink + 1

  const to = []
  const capacity = []
  const graph = Array.from({ length: size }, () => [])
  const addEdge = (from, target, cap) => {
    graph[from].push(to.length)
    to.push(target)
    capacity.push(cap)
    graph[target].push(to.length)
    to.push(from)
    capacity.push(0)
  }

  let totalDemand = 0
  for (const name of strata) {
    addEdge(source, stratumNode.get(name), demandByStratum[name])
    totalDemand += demandByStratum[name]
    // Own members first, then donors by distance, each in sha256 order.
    const ordered = [name, ...stratumFillOrder(name)].flatMap((donor) => members.get(donor))
    for (const task of ordered) addEdge(stratumNode.get(name), taskNode.get(task), 1)
  }
  for (const task of tasks) addEdge(taskNode.get(task), sink, 1)

  let flow = 0
  while (flow < totalDemand) {
    const parentEdge = new Array(size).fill(-1)
    const visited = new Array(size).fill(false)
    const queue = [source]
    visited[source] = true
    while (queue.length > 0 && !visited[sink]) {
      const node = queue.shift()
      for (const edge of graph[node]) {
        const next = to[edge]
        if (visited[next] || capacity[edge] <= 0) continue
        visited[next] = true
        parentEdge[next] = edge
        queue.push(next)
        if (next === sink) break
      }
    }
    if (!visited[sink]) break
    let edge = parentEdge[sink]
    while (edge !== -1 && to[edge] !== source) {
      capacity[edge] -= 1
      capacity[edge ^ 1] += 1
      edge = parentEdge[to[edge ^ 1]]
    }
    flow += 1
  }
  if (flow !== totalDemand) return null

  // Reconstruct: task→stratum edges were added last, so a forward edge from a
  // stratum to a task is always at an even index; its paired reverse edge
  // carries the flow, and the stratum→task edge is saturated when flow is 1.
  const assignment = new Map(strata.map((name) => [name, []]))
  const owner = new Map()
  for (const name of strata) {
    for (const edge of graph[stratumNode.get(name)]) {
      if (edge % 2 !== 0) continue // reverse edge
      if (capacity[edge ^ 1] !== 1) continue // no flow on this edge
      const task = tasks.find((candidate) => taskNode.get(candidate) === to[edge])
      if (task === undefined || owner.has(task)) continue
      owner.set(task, name)
      assignment.get(name).push(task)
    }
  }
  if (owner.size !== totalDemand) return null
  return assignment
}

/**
 * Assign tasks to strata, then fill each stratum to its pre-declared target.
 *
 * Ordering inside a stratum is a fixed sha256(seed + task id) order, never the
 * delta value or any score. A stratum with fewer members than its target draws
 * the deficit from the nearest stratum (fixed `stratumFillOrder`); the draw is
 * a maximum bipartite assignment, so a feasible seating is found whenever one
 * exists instead of a greedy fill stranding a later stratum. The outcome is a
 * deterministic function of the seed and the data.
 *
 * Each task keeps the stratum its OWN delta puts it in (`stratumOf`, used for
 * the achieved counts); the stratum it was drawn to fill is recorded
 * separately on the draw (`drawTarget`).
 */
export function selectTasks({ taskIds, deltas, seed = SELECTION_SEED, targets = STRATUM_TARGETS }) {
  const targetSum = STRATA.reduce((sum, name) => sum + (targets[name] ?? 0), 0)
  if (targetSum !== TASK_COUNT) {
    throw new Error(`stratum targets must sum to ${TASK_COUNT}, got ${targetSum}`)
  }
  const members = new Map(STRATA.map((name) => [name, []]))
  for (const task of taskIds) {
    const delta = deltas.get(task)?.perTaskDelta
    members.get(stratumForDelta(delta)).push(task)
  }
  // Deterministic in-stratum order: sha256(seed + task id), never the delta
  // value or any score.
  for (const name of STRATA) {
    members.get(name).sort((a, b) => {
      const ka = orderKey(seed, a)
      const kb = orderKey(seed, b)
      if (ka !== kb) return ka < kb ? -1 : 1
      return a < b ? -1 : 1
    })
  }
  const assignment = maxFlowAssign({
    strata: STRATA,
    tasks: [...taskIds].sort(),
    demandByStratum: targets,
    members,
  })
  if (assignment === null) {
    throw new Error(`cannot fill the declared strata from ${taskIds.length} tasks: no feasible assignment`)
  }

  const stratumOf = new Map()
  const drawnToFill = new Map()
  const draws = []
  for (const target of STRATA) {
    // Report draws in the fixed sha256 order of the tasks claimed for each
    // stratum, and strata in their declared order.
    const claimed = members.get(target).filter((task) => assignment.get(target).includes(task))
    for (const task of assignment.get(target)) {
      const source = stratumForDelta(deltas.get(task).perTaskDelta)
      stratumOf.set(task, source)
      drawnToFill.set(task, target)
      draws.push({ task, drawTarget: target, source, fallback: source !== target })
    }
    void claimed
  }
  const tasks = draws.map((draw) => draw.task)
  if (new Set(tasks).size !== tasks.length) throw new Error('selected task list contains duplicates')
  const achieved = Object.fromEntries(STRATA.map((name) => [name, tasks.filter((task) => stratumOf.get(task) === name).length]))
  return { tasks, stratumOf, drawnToFill, achieved, targets: { ...targets }, draws }
}

// ── Round rule ───────────────────────────────────────────────────────────────

/**
 * Round rule: prefer round 2; fall back deterministically round 1 → round 2 →
 * round 3. `available` is the set of rounds that actually have an answer file
 * for this (task, arm). The score is never consulted.
 */
export function chooseRound(available, preference = ROUND_PREFERENCE) {
  const set = available instanceof Set ? available : new Set(available)
  for (const round of preference) {
    if (set.has(round)) return { round, fallbackUsed: round !== preference[0] }
  }
  throw new Error(`no answer available in rounds ${preference.join(', ')}`)
}

function answerRelPath(round, arm, task) {
  return `${SOURCE_ROOTS[round]}/${arm === 'no-skill' ? 'noskill' : 'skill'}/${task}/${ANSWER_BASENAME}`
}

/**
 * Build the frozen answer list: one answer per (task, arm), round chosen by
 * `chooseRound`. Never selects a round by score.
 */
export function chooseAnswers({ repoRoot, tasks, rounds }) {
  const answers = []
  for (const task of tasks) {
    for (const arm of ARMS) {
      const available = ROUND_IDS.filter((round) => existsSync(join(repoRoot, answerRelPath(round, arm, task))))
      if (available.length === 0) throw new Error(`missing source artifact: no round has an answer for ${task} (${arm})`)
      const { round, fallbackUsed } = chooseRound(available)
      const rel = answerRelPath(round, arm, task)
      const abs = join(repoRoot, rel)
      answers.push({
        task,
        arm,
        round,
        roundRuleFallback: fallbackUsed,
        availableRounds: available,
        sourcePath: rel,
        sourceSha256: sha256File(abs),
        body: readFileSync(abs, 'utf8'),
      })
    }
  }
  return answers
}

// ── Anonymous ids ────────────────────────────────────────────────────────────

export function anonymousId(index) {
  return `R${String(index + 1).padStart(3, '0')}`
}

/**
 * One seeded Fisher–Yates shuffle over the 32 answers; ids R001…R032 are then
 * handed out in shuffled order, so the id order carries no task/arm/round
 * signal but is fully reproducible from the seed. The seed is advanced until
 * the permutation is a derangement (no answer keeps its input position), so a
 * seed collision can never leave the packet in the natural task/arm order. The
 * first seed that satisfies this is recorded as `anonymousOrderSeed`.
 */
export function assignAnonymousIds(answers, seed = SELECTION_SEED) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const usedSeed = seed + attempt
    const shuffled = deterministicShuffle(answers, usedSeed)
    const deranged = shuffled.every((answer, index) => answer !== answers[index])
    if (deranged) return { shuffled: shuffled.map((answer, index) => ({ ...answer, reviewId: anonymousId(index) })), seed: usedSeed }
  }
  throw new Error('could not find a deranged anonymous order')
}

/**
 * Convenience wrapper: the answer list with review ids, discarding the seed.
 * Callers that need the effective seed use `assignAnonymousIds` directly.
 */
export function withAnonymousIds(answers, seed = SELECTION_SEED) {
  return assignAnonymousIds(answers, seed).shuffled
}

// ── Rendering ────────────────────────────────────────────────────────────────

// Source dataset attribution is carried by the coordinator-only manifest and
// map, never by reviewer-visible files.
function renderReviewerReadme(answers) {
  return [
    '# Blinded grading review packet',
    '',
    'This directory contains 32 agent answers prepared for independent human',
    'grading. Each answer is one file named by an anonymous id (`R001`--`R032`).',
    'The preparation is described in `../sample-manifest.json` (task-level design',
    'only, no answer key) and `../README.md` (status and limits).',
    '',
    '## What you are asked to do',
    '',
    '1. Read `rubric.md` first.',
    '2. Read each answer file and fill the matching row in the empty template',
    '   `../reviewer-a.csv` (or `../reviewer-b.csv`) that the coordinator gave you.',
    '3. Do not open `../coordinator-map.json`. It links anonymous ids back to the',
    '   answer sources and is coordinator-only.',
    '4. Do not look at another reviewer\'s form before you submit yours.',
    '',
    '## What this packet does not tell you',
    '',
    'No answer is labelled with the assistant or configuration that produced it,',
    'and no original assessment is shown. Answers are numbered in a fixed,',
    'reproducible order that is independent of answer content and of any',
    'assessment. This is metadata blinding only: answer text itself was not',
    'rewritten, and an answer may reveal, through its own content, which',
    'materials the assistant had available. A completely blind review is not',
    'claimed.',
    '',
    '## Answer files',
    '',
    `The ${answers.length} files are R001.md ... R${String(answers.length).padStart(3, '0')}.md. Their text is copied`,
    'verbatim from the frozen source artifacts so that a reviewer sees exactly',
    'what was produced; no editing, truncation, or reordering of content has',
    'been applied.',
    '',
  ].join('\n')
}

function renderReviewerRubric() {
  return [
    '# Review rubric — per-answer dimensions',
    '',
    'Work only from the answer text and the task contract. Grade each answer',
    'independently; the same standard applies to every answer file.',
    '',
    'Record one number per dimension; 0--100 where a percentage is asked. Use the',
    'same scale for every answer. Write the reason for every non-zero error',
    'finding in `rationale`.',
    '',
    '| Dimension | Question | Field | Scale |',
    '|---|---|---|---|',
    '| Diagnostic correctness | Are the identified causes, files, and failure modes factually right for the described problem? | `correctness_score` | 0--100 |',
    '| Migration direction correctness | Is the proposed direction of change (old state to new state) correct, and does it move toward the stated target rather than away from it? | `correctness_score` | part of the same score |',
    '| Critical omission | Is a required step or fact missing, such that acting on the answer would fail? | `critical_error` | `yes` / `no` |',
    '| Unsupported or fabricated claim | Is a claim asserted without evidence in the answer, or asserted about material the answer cannot see? | `unsupported_claim` | `yes` / `no` |',
    '| Contradiction | Does the answer contradict itself, or contradict a fact it states elsewhere? | `contradiction` | `yes` / `no` |',
    '| Citation / card identity | Does the answer cite card or reference identities that exist and match the task material? | `citation_issue` | `yes` / `no` |',
    '| Confidence | How confident are you in this judgement? | `confidence` | `low` / `medium` / `high` |',
    '',
    '## Citation and card identity are a separate axis',
    '',
    '**Citation / card-id compliance is not functional correctness.** An answer',
    'can cite every card correctly and still be wrong about the migration, and an',
    'answer can be functionally right while citing no card. Score',
    '`correctness_score` on the functional diagnosis alone. If the citation',
    'identities are wrong, also say so in `citation_issue`; do not lower',
    '`correctness_score` merely because a citation is missing or misnamed.',
    'Conversely, do not raise `correctness_score` because citations look complete.',
    '',
    '## Authority for "correct"',
    '',
    'The per-task rubric authority is the task instruction, fixture, and verifier',
    'contract as they existed at the historical source dataset recorded in',
    '`../sample-manifest.json`, at the original assessment time. If a case is',
    'genuinely ambiguous under that',
    'contract, mark the ambiguity in `rationale` instead of forcing a hard',
    'call, and record your confidence accordingly.',
    '',
    '## Recording',
    '',
    'Fill only the template you were assigned. Leave a row blank if you have not',
    'reviewed that answer yet; a blank row means "not reviewed", never "no',
    'problem". Do not add columns, do not delete rows, and do not edit the',
    'header. Do not average or summarise across answers here — the coordinator',
    'does that after both reviewers submit.',
    '',
  ].join('\n')
}

export function renderManifest({ answers, selection, deltas, inputs, provenance = SOURCE_PROVENANCE, anonymousOrderSeed = SELECTION_SEED }) {
  const taskEntries = []
  for (const task of selection.tasks) {
    const answersForTask = answers.filter((answer) => answer.task === task)
    taskEntries.push({
      task,
      stratum: selection.stratumOf.get(task),
      drawnToFillStratum: selection.drawnToFill.get(task),
      stratumFallback: selection.stratumOf.get(task) !== selection.drawnToFill.get(task),
      historicalPerTaskDelta: deltas.get(task).perTaskDelta,
      historicalPerRoundDelta: deltas.get(task).perRound,
      answers: answersForTask.map((answer) => ({
        reviewId: answer.reviewId,
        sourcePath: answer.sourcePath,
        sourceSha256: answer.sourceSha256,
        round: answer.round,
        // The arm is recorded here only because this manifest is coordinator
        // metadata, not part of reviewer-visible/; the reviewer-visible packet
        // carries no arm label.
        arm: answer.arm,
      })),
    })
  }
  const sources = answers
    .map((answer) => ({
      reviewId: answer.reviewId,
      path: answer.sourcePath,
      sha256: answer.sourceSha256,
      round: answer.round,
      arm: answer.arm,
    }))
    .sort((a, b) => (a.reviewId < b.reviewId ? -1 : 1))
  return {
    schemaVersion: SCHEMA_VERSION,
    id: MANIFEST_ID,
    packetDate: '2026-09-16',
    provenance,
    seed: SELECTION_SEED,
    taskCount: TASK_COUNT,
    answersPerTask: ANSWERS_PER_TASK,
    answerCount: ANSWER_COUNT,
    roundRule: {
      preference: [...ROUND_PREFERENCE],
      description: 'prefer round 2; if round 2 is unavailable for a chosen answer, fall back deterministically round 1, then round 3; the round is never chosen by score',
      answersUsingPreferredRound: answers.filter((answer) => answer.round === ROUND_PREFERENCE[0]).length,
      answersUsingFallback: answers.filter((answer) => answer.roundRuleFallback).length,
    },
    selectionAlgorithm: {
      name: 'stratified-sha256-order-sampling',
      seed: SELECTION_SEED,
      description: 'tasks are stratified by the sign of the historical per-task delta (median over three rounds of with-skill minus no-skill); inside each stratum they are ordered by sha256(seed + task id); strata are then filled to their pre-declared targets; if a stratum is short the deficit is drawn from the nearest stratum by a fixed fill order',
      prng: 'mulberry32',
      taskOrderingKey: 'sha256(seed + "\\n" + taskId)',
      deltaDefinition: 'median over rounds 1,2,3 of (skill - noskill), computed from the per-round aggregate.json artifacts listed in sources.aggregates',
      anonymousOrdering: 'single deterministic Fisher-Yates shuffle over the 32 answers with mulberry32(anonymousOrderSeed); ids R001...R032 handed out in shuffled order; the seed is advanced until no answer keeps its input position (derangement)',
      anonymousOrderSeed,
    },
    strata: STRATA.map((name) => ({
      stratum: name,
      targetCount: selection.targets[name],
      achievedCount: selection.achieved[name],
      shortfall: selection.targets[name] - selection.achieved[name],
    })),
    fallbackApplication: selection.draws
      .filter((draw) => draw.fallback)
      .map((draw) => ({ task: draw.task, filledStratum: draw.drawTarget, drawnFromStratum: draw.source })),
    sources: {
      aggregates: inputs,
      answers,
    },
    tasks: taskEntries,
    humanReview: {
      humanReviewStatus: HUMAN_REVIEW_STATUS,
      humanReviewsSubmitted: 0,
      reviewerForms: REVIEWER_CSV_PATHS,
      note: 'preparation only: no human review has been performed and no rating exists in this packet; a blank reviewer form means "not reviewed"',
    },
  }
}

export function renderCoordinatorMap({ answers, selection, deltas, provenance = SOURCE_PROVENANCE }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: COORDINATOR_MAP_ID,
    coordinatorOnly: true,
    warning: 'COORDINATOR-ONLY: this file unblinds the packet (arm, model family, source path, round, and original score). Reviewers must not open it.',
    provenance,
    seed: SELECTION_SEED,
    entries: answers
      .map((answer) => ({
        reviewId: answer.reviewId,
        task: answer.task,
        arm: answer.arm,
        stratum: selection.stratumOf.get(answer.task),
        round: answer.round,
        sourcePath: answer.sourcePath,
        sourceSha256: answer.sourceSha256,
        originalScore: answer.originalScore,
        historicalPerTaskDelta: deltas.get(answer.task).perTaskDelta,
      }))
      .sort((a, b) => (a.reviewId < b.reviewId ? -1 : 1)),
  }
}

/**
 * An all-blank CSV template: one blank row per answer, so a reviewer never has
 * to invent review ids and no rating can be pre-filled.
 */
export function renderReviewerCsv(answerCount = ANSWER_COUNT) {
  const blankRow = REVIEWER_CSV_COLUMNS.map(() => '').join(',')
  const rows = Array.from({ length: answerCount }, () => blankRow)
  return `${REVIEWER_CSV_COLUMNS.join(',')}\n${rows.join('\n')}\n`
}

function renderPacketReadme() {
  return [
    '# Blind grading review v1 — prepared packet (human review NOT started)',
    '',
    'This directory is a **prepared, frozen packet** for the human grading review',
    'described in work-plan §3 (*已有答案评分复核*). It exists so that the',
    'sampling and blinding decisions are fixed in advance of any review. It is',
    'not a review, and it reports no findings.',
    '',
    '| Field | Value |',
    '|---|---|',
    '| `humanReviewStatus` | `not-started` |',
    '| `humanReviewsSubmitted` | `0` |',
    '| Tasks sampled | 16 |',
    '| Answers in packet | 32 (1 per task per arm) |',
    '| Seed | `20260916` |',
    '| Round rule | prefer round 2, else deterministic round 1 → round 3 |',
    '| Blinding | **metadata-blinded only — content blinding is imperfect** |',
    '',
    '## What "blinded" means here, exactly',
    '',
    'Reviewer-facing files show anonymous ids (`R001`--`R032`) with no arm or',
    'condition label, no model name, no original score, no judge verdict, no',
    'delta, and no historical interpretation. The anonymous order is fixed by a',
    'seeded shuffle and is independent of answer content and of every',
    'assessment.',
    '',
    '**This is not a double-blind review and must never be described as one.**',
    'Answer text is copied verbatim; an answer can reveal through its own content',
    'which reference material or workflow the assistant had available, and the',
    'same underlying problem appears twice in the packet (once per arm). The',
    'sample is also drawn from tasks already used in the historical analysis, so',
    'a reviewer familiar with the benchmark may recognise a task.',
    '',
    '## Files',
    '',
    '- `sample-manifest.json` — frozen source provenance, sampled task ids, strata,',
    '  the round rule and selection algorithm, seed, and per-answer source path +',
    '  sha256 (the authoritative content pin).',
    '  Carries `humanReviewStatus: "not-started"` and `humanReviewsSubmitted: 0`.',
    '- `reviewer-visible/` — the packet a reviewer may open: 32 answer files',
    '  (`R001.md` ... `R032.md`), a reviewer-facing `README.md`, and `rubric.md`.',
    '- `rubric.md` — reviewer-facing rubric (also copied into',
    '  `reviewer-visible/rubric.md`). Citation/card identity is a separate field',
    '  from functional correctness.',
    '- `coordinator-map.json` — **coordinator-only**; unblinds the packet. It must',
    '  not be given to reviewers.',
    '- `reviewer-a.csv`, `reviewer-b.csv` — empty templates (header only).',
    '  Nothing is pre-filled; no rating exists anywhere in this packet.',
    '',
    '## Scientific boundary',
    '',
    '- The packet was frozen before any human review. It contains no ratings, no',
    '  agreement statistics, and no consensus, and none may be fabricated.',
    '- A completed review is a small-sample check of grading, not an overall',
    '  validity certificate for the benchmark, and a subsample mean must not be',
    '  reported as the population gain.',
    '- Stratified selection by historical gain is a deliberate design choice and',
    '  must be disclosed wherever the resulting review is reported.',
    '- The targeted, non-blind AI review proposed in PR #240 is a separate',
    '  activity. It is **not** human validation and must not be reported as such;',
    '  a second model acting as judge is at best a sensitivity analysis.',
    '- Preparation used no model calls: this packet was generated by a local',
    '  deterministic script from already-committed artifacts.',
    '',
    '## Regenerating / verifying',
    '',
    '```bash',
    'npm run generate:blind-grade-review   # rebuild the packet',
    'npm run validate:blind-grade-review   # leakage + integrity checks',
    'npm run test:blind-grade-review       # focused unit tests',
    '```',
    '',
  ].join('\n')
}

/** Reviewer-visible Markdown rubric (same text as the packet-level rubric). */
export function renderRubricMarkdown() {
  return renderReviewerRubric()
}

/**
 * Build every output file in memory: relative path → content. Deterministic;
 * the same inputs always produce the same map.
 */
export function buildPackage({ repoRoot }) {
  const { rounds, taskIds, inputs } = loadAggregates(repoRoot)
  const deltas = computeTaskDeltas(rounds)
  const selection = selectTasks({ taskIds, deltas })
  const chosen = chooseAnswers({ repoRoot, tasks: selection.tasks, rounds })
  const { shuffled, seed: anonymousOrderSeed } = assignAnonymousIds(chosen)
  const answers = shuffled.map((answer) => {
    const record = rounds[answer.round].get(answer.task)
    return {
      ...answer,
      originalScore: answer.arm === 'no-skill' ? record.noskill : record.skill,
    }
  })
  if (answers.length !== ANSWER_COUNT) throw new Error(`built ${answers.length} answers, expected ${ANSWER_COUNT}`)
  if (new Set(answers.map((answer) => answer.reviewId)).size !== ANSWER_COUNT) {
    throw new Error('anonymous ids are not unique')
  }

  const files = new Map()
  files.set(MANIFEST_PATH, `${JSON.stringify(renderManifest({ answers, selection, deltas, inputs, anonymousOrderSeed }), null, 2)}\n`)
  files.set(COORDINATOR_MAP_PATH, `${JSON.stringify(renderCoordinatorMap({ answers, selection, deltas }), null, 2)}\n`)
  files.set(README_PATH, renderPacketReadme())
  files.set(RUBRIC_PATH, renderRubricMarkdown())
  files.set(REVIEWER_README_PATH, renderReviewerReadme(answers))
  files.set(REVIEWER_RUBRIC_PATH, renderRubricMarkdown())
  for (const csvPath of REVIEWER_CSV_PATHS) files.set(csvPath, renderReviewerCsv())
  for (const answer of answers) files.set(`${REVIEWER_VISIBLE_DIR}/${answer.reviewId}.md`, answer.body)

  return { files, answers, selection, deltas, inputs, rounds }
}

// ── Repo-local helpers ───────────────────────────────────────────────────────
function listFilesRecursive(root) {
  const out = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) visit(abs)
      else out.push(relative(root, abs).split(sep).join('/'))
    }
  }
  visit(root)
  return out.sort()
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const args = process.argv.slice(2)
  const flags = args.filter((arg) => arg.startsWith('--'))
  const positional = args.filter((arg) => !arg.startsWith('--'))
  const unknown = flags.filter((flag) => !['--check', '--dry-run'].includes(flag))
  if (unknown.length > 0 || positional.length > 1) {
    console.error('usage: node paper/scripts/prepare-blind-grade-review.mjs [--check] [--dry-run] [repo-root]')
    process.exit(2)
  }
  const check = flags.includes('--check')
  const dryRun = flags.includes('--dry-run')
  const repoRoot = resolve(positional[0] ?? fileURLToPath(new URL('../../', import.meta.url)))
  let built
  try {
    built = buildPackage({ repoRoot })
  } catch (error) {
    console.error(`error: ${error.message}`)
    process.exit(1)
  }
  const { files, answers, selection } = built

  const report = [
    `seed ${SELECTION_SEED}; ${selection.tasks.length} tasks; ${answers.length} answers`,
    `strata targets ${JSON.stringify(selection.targets)} achieved ${JSON.stringify(selection.achieved)}`,
    `tasks: ${selection.tasks.join(', ')}`,
  ]
  if (dryRun) {
    console.log(report.join('\n'))
    process.exit(0)
  }

  if (check) {
    let stale = false
    for (const [rel, content] of files) {
      const abs = join(repoRoot, rel)
      if (!existsSync(abs)) {
        console.error(`missing generated file: ${rel}`)
        stale = true
      } else if (readFileSync(abs, 'utf8') !== content) {
        console.error(`out of date: ${rel}`)
        stale = true
      }
    }
    if (!stale) {
      // Detect extra files that the builder no longer produces (e.g. a stale
      // reviewer-visible answer after a re-sample).
      const directory = join(repoRoot, REVIEWER_VISIBLE_DIR)
      if (existsSync(directory)) {
        const expected = new Set([...files.keys()].map((rel) => rel.slice(REVIEWER_VISIBLE_DIR.length + 1)))
        for (const rel of listFilesRecursive(directory)) {
          if (!expected.has(rel)) {
            console.error(`unexpected file in reviewer-visible package: ${rel}`)
            stale = true
          }
        }
      }
    }
    if (stale) {
      console.error('Run: npm run generate:blind-grade-review')
      process.exit(1)
    }
    console.log(`${PACKET_DIR} is up to date (${files.size} files)`)
    process.exit(0)
  }

  // Write: clear the reviewer-visible directory first so a re-sample cannot
  // leave an orphaned answer file behind.
  const visibleDir = join(repoRoot, REVIEWER_VISIBLE_DIR)
  if (existsSync(visibleDir)) rmSync(visibleDir, { recursive: true })
  for (const [rel, content] of files) {
    const abs = join(repoRoot, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  console.log(`wrote ${files.size} files under ${PACKET_DIR}`)
  console.log(report.join('\n'))
}
