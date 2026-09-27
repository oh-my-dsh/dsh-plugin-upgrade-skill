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
// Output layout
// -------------
//   reviewer-packet/  the ONLY folder a reviewer receives: README, rubric,
//                     masked answers (answers/R*.md), task materials
//                     (tasks/T*/), blank CSV forms. No arm/score/source link.
//   coordinator/      COORDINATOR-ONLY: sample manifest, id→arm map, masking
//                     log, follow-up notes.
//
// COORDINATOR-ONLY TOOL: the seed and sampler are public, so running this
// script rebuilds the unblinding map. Reviewers must never run it.
//
// Usage (from the repo root):
//   node paper/scripts/prepare-blind-grade-review.mjs
//   node paper/scripts/prepare-blind-grade-review.mjs --check
//   node paper/scripts/prepare-blind-grade-review.mjs --dry-run   (print plan)
//   node paper/scripts/prepare-blind-grade-review.mjs <repo-root>

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
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
/**
 * The ONLY folder a reviewer receives. It is self-contained: README, rubric,
 * masked answers, task materials, and blank forms. Nothing in it links an
 * anonymous id to an arm, a score, or a source path.
 */
export const REVIEWER_PACKET_DIR = `${PACKET_DIR}/reviewer-packet`
/** Backwards-compatible alias (the packet used to be called reviewer-visible). */
export const REVIEWER_VISIBLE_DIR = REVIEWER_PACKET_DIR
export const REVIEWER_ANSWERS_DIR = `${REVIEWER_PACKET_DIR}/answers`
export const REVIEWER_TASKS_DIR = `${REVIEWER_PACKET_DIR}/tasks`
/** Coordinator-only: everything that unblinds the packet lives here. */
export const COORDINATOR_DIR = `${PACKET_DIR}/coordinator`
export const MANIFEST_PATH = `${COORDINATOR_DIR}/sample-manifest.json`
export const COORDINATOR_MAP_PATH = `${COORDINATOR_DIR}/coordinator-map.json`
export const MASKING_LOG_PATH = `${COORDINATOR_DIR}/masking-log.json`
export const COORDINATOR_README_PATH = `${COORDINATOR_DIR}/README.md`
export const README_PATH = `${PACKET_DIR}/README.md`
export const REVIEWER_README_PATH = `${REVIEWER_PACKET_DIR}/README.md`
export const REVIEWER_RUBRIC_PATH = `${REVIEWER_PACKET_DIR}/rubric.md`
/** The reviewer-facing rubric lives only inside the reviewer packet. */
export const RUBRIC_PATH = REVIEWER_RUBRIC_PATH
export const REVIEWER_CSV_PATHS = [`${REVIEWER_PACKET_DIR}/reviewer-a.csv`, `${REVIEWER_PACKET_DIR}/reviewer-b.csv`]
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
export const MASKING_LOG_ID = 'blind-grade-review-v1-masking-log'

// Historical GLM-5.3-flash S1–S22 sources (relative to the repo root). The
// round-1 directory is the un-suffixed one. Fixed here so the manifest can
// record exactly which artifacts were read.
export const SOURCE_ROOTS = Object.freeze({
  1: 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22',
  2: 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round2',
  3: 'benchmark/results/artifacts/2026-09-11-glm-5.3-flash-s1-s22-round3',
})
export const AGGREGATE_BASENAME = 'aggregate.json'
/**
 * Task materials (brief + read-only fixture) are read from git at the commit
 * that published the round-1 source dataset, so reviewers see the contract as
 * it stood when the answers were produced, and later edits to
 * benchmark/tasks/ cannot drift the packet. The task files are byte-identical
 * across the three dataset commits. A fixed commit keeps `--check`
 * checkout-stable (it never reads HEAD).
 */
export const TASK_MATERIAL_REF = 'bfe34febc3e9ad8c9fec75aeefa7437a37c1bb16'
export const TASK_ROOT = 'benchmark/tasks'
export const MASK_TOKEN = '[redacted]'

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
  note: 'provenance is descriptive; the per-answer source path + sha256 in the coordinator map pin the exact bytes',
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
    // Report draws in assignment order, strata in their declared order.
    for (const task of assignment.get(target)) {
      const source = stratumForDelta(deltas.get(task).perTaskDelta)
      stratumOf.set(task, source)
      drawnToFill.set(task, target)
      draws.push({ task, drawTarget: target, source, fallback: source !== target })
    }
  }
  const tasks = draws.map((draw) => draw.task)
  if (new Set(tasks).size !== tasks.length) throw new Error('selected task list contains duplicates')
  const achieved = Object.fromEntries(STRATA.map((name) => [name, tasks.filter((task) => stratumOf.get(task) === name).length]))
  return { tasks, stratumOf, drawnToFill, achieved, targets: { ...targets }, draws }
}

// ── Round rule ───────────────────────────────────────────────────────────────

/**
 * Round rule: prefer round 2; if round 2 is unavailable fall back
 * deterministically to round 1, then round 3 (ROUND_PREFERENCE = [2, 1, 3]). `available` is the set of rounds that actually have an answer file
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

// ── Lexical masking of arm-revealing content ─────────────────────────────────

/**
 * Deterministic lexical masking, applied identically to EVERY answer (both
 * arms). Each rule replaces an explicit reference to the injected skill — its
 * name, its reference-file paths, its mode vocabulary, a local checkout path
 * that contains the skill repository name, or the bare word "skill" used as a
 * tool reference — with MASK_TOKEN. The plugin-manifest sense of "skill"
 * (`skill name`, `skill provider`, plural `skills`, a `(skill)` surface label)
 * is task content and is
 * left alone. Rules run in order; no rule may span a newline, so the line
 * numbers recorded in the coordinator-only masking log stay valid.
 *
 * This is word-level masking only. Style, structure, and paraphrased
 * references can still hint at the arm; the packet never claims full blinding.
 */
export const MASK_RULES = Object.freeze([
  {
    id: 'skill-repo-path',
    pattern: /(?:[A-Za-z]:)?[^\s`'"()<>[\]]*dsh-plugin-upgrade-skill[^\s`'"()<>[\]]*/g,
    description: 'absolute/local path containing the skill repository folder name',
  },
  {
    id: 'skill-reference-path',
    pattern: /(?:[\w.-]+\/)*references\/[\w./-]*/g,
    description: 'path into the skill references/ folder',
  },
  {
    id: 'skill-entry-file',
    pattern: /\bSKILL(?:\.zh-CN)?\.md\b/g,
    description: 'skill entry-point file name',
  },
  {
    id: 'skill-reference-file',
    pattern: /\b(?:v0\.\d+\.\d+-(?:alpha|beta|rc)\.\d+|rollup-\d+\.\d+(?:\.\d+)?|api-migration-[\w.-]+?|troubleshooting|pre-flight|precision-checklist|migration-hygiene|host-plane-probes|rc-0\.1\.3-runtime-verification)\.md\b/g,
    description: 'bare file name of a skill reference card file',
  },
  {
    id: 'skill-name',
    pattern: /`?\b(?:dsh-)?plugin-upgrade\b`?(?:[ \t]+skill(?:'s|’s)?\b)?/gi,
    description: 'skill name (dsh-plugin-upgrade / plugin-upgrade), with a trailing "skill" if present',
  },
  {
    id: 'skill-mode',
    pattern: /\bMode[ \t]+[A-D](?:\/[A-D])*\b(?:[ \t]*·[ \t]*[a-z-]+)?|\b[A-D][ \t]*·[ \t]*(?:inspect|update|author-migrate)\b/g,
    description: 'skill operating-mode vocabulary (Mode A/B/C, "A · inspect")',
  },
  {
    id: 'skill-word',
    pattern: /\bskill(?:'s|’s)?\b(?![ \t]+(?:name|provider)s?\b)(?!(?<=\(skill)\))/gi,
    description: 'the word "skill" used as a tool reference (not "skill name"/"skill provider"/"skills"/"(skill)" surface labels)',
  },
])

/**
 * Apply MASK_RULES to one answer body. Returns the masked text and the list of
 * replacements (rule id, 1-based line, original text), in application order.
 */
export function maskAnswer(text, rules = MASK_RULES) {
  let current = text
  const replacements = []
  for (const { id, pattern } of rules) {
    const regex = new RegExp(pattern.source, pattern.flags)
    current = current.replace(regex, (match, ...rest) => {
      const offset = rest[rest.length - 2]
      const line = current.slice(0, offset).split('\n').length
      replacements.push({ rule: id, line, original: match })
      return MASK_TOKEN
    })
  }
  return { text: current, replacements }
}

/**
 * Task materials are the same for both arms, so only the skill-IDENTITY rules
 * apply to them (the brief's generic "the applicable skill" wording is shown
 * to both arms and stays).
 */
export const TASK_MATERIAL_MASK_RULE_IDS = Object.freeze(['skill-repo-path', 'skill-reference-path', 'skill-entry-file', 'skill-reference-file', 'skill-name'])

export function maskTaskMaterial(text) {
  return maskAnswer(text, MASK_RULES.filter((rule) => TASK_MATERIAL_MASK_RULE_IDS.includes(rule.id)))
}

/** Serialisable description of the masking rules (coordinator-only record). */
export function describeMaskRules(rules = MASK_RULES) {
  return rules.map(({ id, pattern, description }) => ({ id, pattern: pattern.source, flags: pattern.flags, description }))
}

// ── Task materials ───────────────────────────────────────────────────────────

function git(repoRoot, args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Read each sampled task's brief (instruction.md) and read-only fixture.
 * `ref` is a git commit (default: the pinned dataset commit); `ref: null`
 * reads the working tree instead (used by synthetic test fixtures).
 * Returns Map(task → [{ rel, sourcePath, content }]) with `rel` relative to
 * the task's packet folder (instruction.md, fixture/...).
 */
export function loadTaskMaterials({ repoRoot, tasks, ref = TASK_MATERIAL_REF }) {
  const out = new Map()
  for (const task of [...tasks].sort()) {
    const base = `${TASK_ROOT}/${task}`
    const fixtureBase = `${base}/environment/fixture`
    let fixturePaths
    const read = (rel) => {
      if (ref === null) {
        const abs = join(repoRoot, rel)
        if (!existsSync(abs)) throw new Error(`missing task material: ${rel}`)
        return readFileSync(abs, 'utf8')
      }
      try {
        return git(repoRoot, ['show', `${ref}:${rel}`])
      } catch {
        throw new Error(`missing task material at ${ref}: ${rel}`)
      }
    }
    if (ref === null) {
      const abs = join(repoRoot, fixtureBase)
      fixturePaths = existsSync(abs) ? listFilesRecursive(abs).map((rel) => `${fixtureBase}/${rel}`) : []
    } else {
      fixturePaths = git(repoRoot, ['ls-tree', '-r', '--name-only', ref, '--', `${fixtureBase}/`])
        .split('\n')
        .filter((line) => line !== '')
        .sort()
    }
    const files = [{ rel: 'instruction.md', sourcePath: `${base}/instruction.md`, content: read(`${base}/instruction.md`) }]
    for (const sourcePath of fixturePaths) {
      files.push({ rel: `fixture/${sourcePath.slice(fixtureBase.length + 1)}`, sourcePath, content: read(sourcePath) })
    }
    out.set(task, files)
  }
  return out
}

/**
 * Neutral task labels T01..T16, assigned in order of each task's smallest
 * anonymous answer id, so the label order inherits the seeded shuffle and
 * carries no stratum or task-id signal.
 */
export function assignTaskLabels(answers) {
  const firstId = new Map()
  for (const answer of answers) {
    const seen = firstId.get(answer.task)
    if (seen === undefined || answer.reviewId < seen) firstId.set(answer.task, answer.reviewId)
  }
  const ordered = [...firstId.entries()].sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([task]) => task)
  return new Map(ordered.map((task, index) => [task, `T${String(index + 1).padStart(2, '0')}`]))
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** Reviewer-facing answer file: neutral header + masked answer body. */
export function renderAnswerFile({ reviewId, taskLabel, maskedBody }) {
  return [
    `# Answer ${reviewId}`,
    '',
    `Task: ${taskLabel} (brief and input files in \`tasks/${taskLabel}/\`)`,
    '',
    '---',
    '',
    maskedBody,
  ].join('\n')
}

// Everything a reviewer needs is inside the reviewer packet; this README never
// points outside it.
function renderReviewerReadme(answers, taskLabels) {
  const last = String(answers.length).padStart(3, '0')
  const lastTask = String(taskLabels.size).padStart(2, '0')
  return [
    '# Grading packet',
    '',
    'This folder is everything you need for the review. It is self-contained:',
    'you do not need, and should not look for, any other file.',
    '',
    '## Contents',
    '',
    '- `rubric.md` — how to grade. Read it first.',
    `- \`answers/R001.md\` ... \`answers/R${last}.md\` — ${answers.length} anonymous agent answers. The first`,
    '  lines of each file name the answer id and the task it responds to.',
    `- \`tasks/T01/\` ... \`tasks/T${lastTask}/\` — for each task, the brief the agent was given`,
    '  (`instruction.md`) and the read-only input files it could inspect',
    '  (`fixture/`). Every task has exactly two answers in this packet.',
    '- `reviewer-a.csv`, `reviewer-b.csv` — blank forms. Fill only the one the',
    '  coordinator assigned to you.',
    '',
    '## What you are asked to do',
    '',
    '1. Read `rubric.md`.',
    '2. For each answer, read its task folder and then the answer, and fill one',
    '   row of your form: the answer id (for example `R001`) in `review_id`, your',
    '   own reviewer id in `reviewer_id`, and the rubric fields.',
    '3. Work alone. Do not look at another reviewer\'s form before you submit yours.',
    '4. Grade only from this folder. Do not search the project repository or the',
    '   web for these answers, and do not run any tooling to rebuild how this',
    '   packet was assembled. The coordinator keeps the key that links ids to',
    '   their origin and will not share it until both forms are in.',
    '',
    '## What was hidden, and how',
    '',
    'No answer is labelled with the assistant or configuration that produced it,',
    'and no earlier assessment is shown. Answer ids follow a fixed shuffled order',
    'that is unrelated to answer content.',
    '',
    'Where an answer named the specific tooling or reference files that were',
    'available to the assistant that wrote it (for example a named procedure, its',
    'reference file names, or local folder paths that include its name), those',
    `words were replaced with the neutral token \`${MASK_TOKEN}\`. The same replacement`,
    'procedure was applied to every answer. Do not guess what a token stood for,',
    'do not infer anything from how many tokens an answer contains, and do not',
    'credit or penalise an answer for containing one: grade the substance that',
    'remains.',
    '',
    'The masking is word-level only. Answers may still differ in style, structure,',
    'or in how they refer to reference material, and that may hint at how they',
    'were produced, so this review is not claimed to be fully blind. If you think',
    'you can tell how an answer was produced, say so in `rationale` and grade it',
    'on its merits anyway.',
    '',
  ].join('\n')
}

function renderReviewerRubric() {
  return [
    '# Review rubric — per-answer dimensions',
    '',
    'Work only from the answer text and the task materials. Grade each answer',
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
    'The card catalogue is not part of this folder; if you need to check whether a',
    'cited card id exists, ask the coordinator for it (it is the same for every',
    'answer).',
    '',
    `## Masked words (\`${MASK_TOKEN}\`)`,
    '',
    `A \`${MASK_TOKEN}\` token replaces a name or file path that could identify how an`,
    'answer was produced. Treat it as neutral: it is not an error, not a missing',
    'citation, and not evidence of anything.',
    '',
    '## Authority for "correct"',
    '',
    'The per-task rubric authority is the task instruction and fixture in',
    '`tasks/<task>/`, exactly as they stood when the answers were produced. If a',
    'case is genuinely ambiguous under that contract, mark the ambiguity in',
    '`rationale` instead of forcing a hard call, and record your confidence',
    'accordingly.',
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

/**
 * Design disclosures computed from the data (never hand-entered): how the
 * short negative stratum was filled and which per-round sign the sampled pairs
 * carry. The round-2 rule means no sampled pair comes from a round in which
 * the with-skill answer scored lower whenever round 2 has no negative delta.
 */
export function computeDesignDisclosures({ answers, selection, deltas, rounds }) {
  const pairRounds = new Map()
  for (const answer of answers) pairRounds.set(answer.task, answer.round)
  const signs = { withSkillHigher: 0, tie: 0, withSkillLower: 0 }
  for (const [task, round] of pairRounds) {
    const record = rounds[round].get(task)
    const delta = record.skill - record.noskill
    if (delta > 0) signs.withSkillHigher += 1
    else if (delta < 0) signs.withSkillLower += 1
    else signs.tie += 1
  }
  const pool = [...deltas.values()]
  return {
    poolTaskCount: pool.length,
    poolTasksWithNegativeMedianDelta: pool.filter((entry) => entry.perTaskDelta < 0).length,
    negativeStratumFilledFrom: [...new Set(selection.draws.filter((draw) => draw.fallback).map((draw) => draw.source))].sort(),
    sampledPairsBySignOfSelectedRoundDelta: signs,
    note: 'no task in the pool has a negative median delta, so the 3 pre-declared negative slots were filled by zero-delta tasks; with the round-2 rule no sampled pair comes from a round in which the with-skill answer scored lower than the no-skill answer. The review therefore cannot observe grading of skill-arm regressions and must say so when reported.',
  }
}

export function renderManifest({ answers, selection, deltas, inputs, rounds, taskLabels, taskMaterialFiles, taskMaterialRef = TASK_MATERIAL_REF, provenance = SOURCE_PROVENANCE, anonymousOrderSeed = SELECTION_SEED }) {
  const taskEntries = selection.tasks.map((task) => ({
    task,
    taskLabel: taskLabels.get(task),
    stratum: selection.stratumOf.get(task),
    drawnToFillStratum: selection.drawnToFill.get(task),
    stratumFallback: selection.stratumOf.get(task) !== selection.drawnToFill.get(task),
    historicalPerTaskDelta: deltas.get(task).perTaskDelta,
    historicalPerRoundDelta: deltas.get(task).perRound,
  }))
  return {
    schemaVersion: SCHEMA_VERSION,
    id: MANIFEST_ID,
    coordinatorOnly: true,
    warning: 'COORDINATOR-ONLY: sampling design with per-task strata and historical deltas. Reviewers receive only reviewer-packet/.',
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
      taskLabelOrdering: 'T01...T16 assigned in order of each task\'s smallest anonymous answer id',
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
    designDisclosures: computeDesignDisclosures({ answers, selection, deltas, rounds }),
    masking: {
      token: MASK_TOKEN,
      appliedToEveryAnswer: true,
      rules: describeMaskRules(),
      log: MASKING_LOG_PATH,
      limitation: 'word-level only; style, structure, paraphrased references and token density can still hint at the arm',
    },
    taskMaterials: {
      gitRef: taskMaterialRef,
      note: 'brief + read-only fixture per task, read from git at the pinned round-1 dataset commit (identical at the round-2 and round-3 commits); identical for both arms, so only the skill-identity masking rules are applied',
      maskRuleIds: [...TASK_MATERIAL_MASK_RULE_IDS],
      files: taskMaterialFiles,
    },
    sources: {
      aggregates: inputs,
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

export function renderCoordinatorMap({ answers, selection, deltas, rounds, taskLabels, provenance = SOURCE_PROVENANCE }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: COORDINATOR_MAP_ID,
    coordinatorOnly: true,
    warning: 'COORDINATOR-ONLY: this file unblinds the packet (arm, model family, source path, round, and original score). Reviewers must not open it.',
    provenance,
    seed: SELECTION_SEED,
    entries: answers
      .map((answer) => {
        const record = rounds[answer.round].get(answer.task)
        return {
          reviewId: answer.reviewId,
          task: answer.task,
          taskLabel: taskLabels.get(answer.task),
          arm: answer.arm,
          stratum: selection.stratumOf.get(answer.task),
          round: answer.round,
          sourcePath: answer.sourcePath,
          sourceSha256: answer.sourceSha256,
          packetPath: answer.packetPath,
          packetSha256: answer.packetSha256,
          maskReplacementCount: answer.maskReplacements.length,
          originalScore: answer.originalScore,
          selectedRoundDelta: record.skill - record.noskill,
          historicalPerTaskDelta: deltas.get(answer.task).perTaskDelta,
        }
      })
      .sort((a, b) => (a.reviewId < b.reviewId ? -1 : 1)),
  }
}

export function renderMaskingLog({ answers }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: MASKING_LOG_ID,
    coordinatorOnly: true,
    warning: 'COORDINATOR-ONLY: the original text of every masked span. Replacement density differs by arm, so this file unblinds the packet.',
    token: MASK_TOKEN,
    rules: describeMaskRules(),
    entries: answers
      .map((answer) => ({ reviewId: answer.reviewId, replacements: answer.maskReplacements }))
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

/**
 * Coordinator-only notes, generated from the masking log: every no-skill answer
 * on which a skill-reference rule fired is listed for follow-up, because a
 * no-skill run should not know the skill's name, files, or vocabulary.
 */
function renderCoordinatorReadme({ answers, disclosures }) {
  const noSkillHits = answers
    .filter((answer) => answer.arm === 'no-skill' && answer.maskReplacements.length > 0)
    .sort((a, b) => (a.reviewId < b.reviewId ? -1 : 1))
  const perArm = Object.fromEntries(ARMS.map((arm) => {
    const armAnswers = answers.filter((answer) => answer.arm === arm)
    return [arm, {
      answers: armAnswers.filter((answer) => answer.maskReplacements.length > 0).length,
      replacements: armAnswers.reduce((sum, answer) => sum + answer.maskReplacements.length, 0),
    }]
  }))
  const lines = [
    '# Coordinator-only notes (DO NOT give to reviewers)',
    '',
    'Everything in this folder unblinds the packet. Reviewers receive only',
    '`../reviewer-packet/` (for example as a zip), never repository access, and',
    'must not run `paper/scripts/prepare-blind-grade-review.mjs`: the seed and',
    'script are committed, so anyone who runs it can rebuild the id-to-arm map.',
    '',
    '- `sample-manifest.json` — sampling design, strata, per-task historical',
    '  deltas, masking rules, pinned task-material ref, design disclosures.',
    '- `coordinator-map.json` — review id → task, arm, round, source path,',
    '  source sha256, packet sha256, original score.',
    '- `masking-log.json` — every masked span (rule, line, original text).',
    '',
    '## Masking summary',
    '',
    '| Arm | Answers with ≥1 replacement | Replacements |',
    '|---|---|---|',
    ...ARMS.map((arm) => `| ${arm} | ${perArm[arm].answers} / ${TASK_COUNT} | ${perArm[arm].replacements} |`),
    '',
    'Token density differs strongly by arm, so the number of masked tokens is',
    'itself a residual cue; the reviewer README asks reviewers not to use it.',
    '',
    '## No-skill answers on which a masking rule fired (follow-up required)',
    '',
    'A no-skill run should not know the skill\'s name, reference files, or mode',
    'vocabulary. Each row below needs a coordinator check of the run environment',
    '(was the skill reachable from the working directory?) before the review is',
    'reported; a local checkout path alone is weaker evidence than a citation of',
    'skill content.',
    '',
    '| Review id | Task | Rules fired | Original text (distinct spans) |',
    '|---|---|---|---|',
    ...noSkillHits.map((answer) => {
      const rulesFired = [...new Set(answer.maskReplacements.map((entry) => entry.rule))].join(', ')
      const spans = [...new Set(answer.maskReplacements.map((entry) => entry.original))]
        .map((span) => `\`${span.replaceAll('|', '\\|')}\``)
        .join('; ')
      return `| ${answer.reviewId} | ${answer.task} | ${rulesFired} | ${spans} |`
    }),
    '',
    '## Design disclosures',
    '',
    `- Pool: ${disclosures.poolTaskCount} tasks, ${disclosures.poolTasksWithNegativeMedianDelta} with a negative median delta. The 3 pre-declared`,
    `  negative slots were filled from: ${disclosures.negativeStratumFilledFrom.join(', ') || 'n/a'}.`,
    `- Sign of (with-skill − no-skill) in the round each sampled pair came from:`,
    `  higher ${disclosures.sampledPairsBySignOfSelectedRoundDelta.withSkillHigher}, tie ${disclosures.sampledPairsBySignOfSelectedRoundDelta.tie}, lower ${disclosures.sampledPairsBySignOfSelectedRoundDelta.withSkillLower}.`,
    '- Consequently the review cannot observe how skill-arm regressions were',
    '  graded; this must be disclosed wherever the review is reported.',
    '',
  ]
  return lines.join('\n')
}

function renderPacketReadme({ disclosures }) {
  const signs = disclosures.sampledPairsBySignOfSelectedRoundDelta
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
    '| Blinding | **metadata-blinded + word-level masking — content blinding is imperfect** |',
    '',
    '## Layout: what reviewers get vs. what stays with the coordinator',
    '',
    '- `reviewer-packet/` — **the only thing a reviewer receives** (hand it over',
    '  as a zip; do not give repository access). Self-contained: `README.md`,',
    '  `rubric.md`, `answers/R001.md` ... `answers/R032.md` (masked), `tasks/T01/`',
    '  ... `tasks/T16/` (brief + read-only fixture, pinned to the dataset commit),',
    '  and blank `reviewer-a.csv` / `reviewer-b.csv`. It contains no arm, score,',
    '  round, source path, or source hash, and never points outside itself.',
    '- `coordinator/` — **coordinator-only; unblinds the packet**:',
    '  `sample-manifest.json` (design, strata, deltas, masking rules, task-material',
    '  pin), `coordinator-map.json` (review id → arm, round, source path + sha256,',
    '  packet sha256, original score), `masking-log.json` (every masked span), and',
    '  `README.md` (masking summary, no-skill cue follow-ups, design disclosures).',
    '',
    'Reviewers must not run `npm run generate:blind-grade-review` or the script',
    'behind it: the seed and sampler are committed, so running it rebuilds the',
    'unblinding map. Likewise a reviewer with repository access could locate an',
    'answer\'s source by text search; blinding assumes they only have',
    '`reviewer-packet/`.',
    '',
    '## What "blinded" means here, exactly',
    '',
    'Reviewer-facing files show anonymous ids (`R001`--`R032`) and neutral task',
    'labels (`T01`--`T16`) with no arm or condition label, no model name, no',
    'original score, no judge verdict, no delta, and no historical interpretation.',
    'The anonymous order is fixed by a seeded shuffle and is independent of answer',
    'content and of every assessment.',
    '',
    'Answer text is **masked, not verbatim**: a deterministic set of lexical rules',
    '(`coordinator/sample-manifest.json` → `masking.rules`) replaces explicit',
    'references to the injected skill — its name, `SKILL.md` / `references/` card',
    'file paths and names, its mode vocabulary ("Mode A · inspect"), local',
    'checkout paths containing the skill repository name, and the word "skill"',
    'used as a tool reference — with `[redacted]`. The same rules run on both',
    'arms; the plugin-manifest sense of "skill name" / "skill provider" is task',
    'content and is kept. Every replacement is logged per answer in',
    '`coordinator/masking-log.json`, and packet hashes are recorded next to the',
    'source hashes in `coordinator/coordinator-map.json`.',
    '',
    '**This is not a double-blind review and must never be described as one.**',
    'Masking is word-level: style, structure, paraphrased references to reference',
    'material, and the density of `[redacted]` tokens can still reveal the arm.',
    'The same underlying problem appears twice in the packet (once per arm), and',
    'the sample is drawn from tasks already used in the historical analysis, so a',
    'reviewer familiar with the benchmark may recognise a task.',
    '',
    '## Design disclosures',
    '',
    `- **No regression stratum in practice.** ${disclosures.poolTasksWithNegativeMedianDelta} of ${disclosures.poolTaskCount} pool tasks have a`,
    '  negative median delta, so the 3 pre-declared "negative" slots were filled',
    '  by the fixed nearest-stratum rule with zero-delta tasks (achieved strata:',
    '  positive 7 / zero 9 / negative 0).',
    `- **No sampled pair comes from a round the skill arm lost.** In the round`,
    `  each pair was taken from, with-skill scored higher in ${signs.withSkillHigher}, tied in ${signs.tie},`,
    `  and scored lower in ${signs.withSkillLower} pairs. The review can therefore not check how`,
    '  skill-arm regressions were graded, and must say so when reported.',
    '- **Possible no-skill contamination.** Some no-skill answers trip the',
    '  masking rules (e.g. one cites "the skill\'s version index", another a',
    '  "plugin-upgrade pre-flight procedure"; two quote a local checkout path',
    '  containing the skill repository name). They are masked like every other',
    '  answer and listed in `coordinator/README.md` for coordinator follow-up',
    '  before any result is reported.',
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
    '## Regenerating / verifying (coordinator / maintainers only)',
    '',
    '```bash',
    'npm run generate:blind-grade-review   # rebuild the packet',
    'npm run validate:blind-grade-review   # leakage + integrity checks',
    'npm run test:blind-grade-review       # focused unit tests',
    '```',
    '',
  ].join('\n')
}

/** Reviewer-visible Markdown rubric. */
export function renderRubricMarkdown() {
  return renderReviewerRubric()
}

/**
 * Build every output file in memory: relative path → content. Deterministic;
 * the same inputs always produce the same map. `taskMaterialRef: null` reads
 * task materials from the working tree (synthetic fixtures).
 */
export function buildPackage({ repoRoot, taskMaterialRef = TASK_MATERIAL_REF }) {
  const { rounds, taskIds, inputs } = loadAggregates(repoRoot)
  const deltas = computeTaskDeltas(rounds)
  const selection = selectTasks({ taskIds, deltas })
  const chosen = chooseAnswers({ repoRoot, tasks: selection.tasks, rounds })
  const { shuffled, seed: anonymousOrderSeed } = assignAnonymousIds(chosen)
  const taskLabels = assignTaskLabels(shuffled)
  const answers = shuffled.map((answer) => {
    const record = rounds[answer.round].get(answer.task)
    const masked = maskAnswer(answer.body)
    const packetBody = renderAnswerFile({ reviewId: answer.reviewId, taskLabel: taskLabels.get(answer.task), maskedBody: masked.text })
    return {
      ...answer,
      originalScore: answer.arm === 'no-skill' ? record.noskill : record.skill,
      maskReplacements: masked.replacements,
      packetBody,
      packetPath: `${REVIEWER_ANSWERS_DIR}/${answer.reviewId}.md`,
      packetSha256: sha256(packetBody),
    }
  })
  if (answers.length !== ANSWER_COUNT) throw new Error(`built ${answers.length} answers, expected ${ANSWER_COUNT}`)
  if (new Set(answers.map((answer) => answer.reviewId)).size !== ANSWER_COUNT) {
    throw new Error('anonymous ids are not unique')
  }
  for (const answer of answers) {
    if (answer.packetSha256 === answer.sourceSha256) throw new Error(`${answer.reviewId}: packet copy is byte-identical to its source`)
  }

  const materials = loadTaskMaterials({ repoRoot, tasks: selection.tasks, ref: taskMaterialRef })
  const taskMaterialFiles = []
  const materialOutputs = []
  for (const task of [...selection.tasks].sort((a, b) => (taskLabels.get(a) < taskLabels.get(b) ? -1 : 1))) {
    const label = taskLabels.get(task)
    for (const file of materials.get(task)) {
      const path = `${REVIEWER_TASKS_DIR}/${label}/${file.rel}`
      const masked = maskTaskMaterial(file.content)
      taskMaterialFiles.push({
        taskLabel: label,
        task,
        path,
        sourcePath: file.sourcePath,
        sourceSha256: sha256(file.content),
        sha256: sha256(masked.text),
        maskReplacements: masked.replacements,
      })
      materialOutputs.push([path, masked.text])
    }
  }

  const disclosures = computeDesignDisclosures({ answers, selection, deltas, rounds })
  const files = new Map()
  files.set(README_PATH, renderPacketReadme({ disclosures }))
  files.set(MANIFEST_PATH, `${JSON.stringify(renderManifest({ answers, selection, deltas, inputs, rounds, taskLabels, taskMaterialFiles, taskMaterialRef, anonymousOrderSeed }), null, 2)}\n`)
  files.set(COORDINATOR_MAP_PATH, `${JSON.stringify(renderCoordinatorMap({ answers, selection, deltas, rounds, taskLabels }), null, 2)}\n`)
  files.set(MASKING_LOG_PATH, `${JSON.stringify(renderMaskingLog({ answers }), null, 2)}\n`)
  files.set(COORDINATOR_README_PATH, renderCoordinatorReadme({ answers, disclosures }))
  files.set(REVIEWER_README_PATH, renderReviewerReadme(answers, taskLabels))
  files.set(REVIEWER_RUBRIC_PATH, renderRubricMarkdown())
  for (const csvPath of REVIEWER_CSV_PATHS) files.set(csvPath, renderReviewerCsv())
  for (const answer of answers) files.set(answer.packetPath, answer.packetBody)
  for (const [path, content] of materialOutputs) files.set(path, content)

  return { files, answers, selection, deltas, inputs, rounds, taskLabels, taskMaterialFiles }
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
    // Detect extra files the builder no longer produces anywhere in the packet
    // (a stale answer after a re-sample, or a legacy unmasked copy).
    const packetAbs = join(repoRoot, PACKET_DIR)
    if (existsSync(packetAbs)) {
      for (const rel of listFilesRecursive(packetAbs)) {
        if (!files.has(`${PACKET_DIR}/${rel}`)) {
          console.error(`unexpected file in packet: ${PACKET_DIR}/${rel}`)
          stale = true
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

  // Write: clear the whole packet directory first so a re-sample (or the
  // pre-masking layout) cannot leave an orphaned file behind.
  const packetDir = join(repoRoot, PACKET_DIR)
  if (existsSync(packetDir)) rmSync(packetDir, { recursive: true })
  for (const [rel, content] of files) {
    const abs = join(repoRoot, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  console.log(`wrote ${files.size} files under ${PACKET_DIR}`)
  console.log(report.join('\n'))
}
