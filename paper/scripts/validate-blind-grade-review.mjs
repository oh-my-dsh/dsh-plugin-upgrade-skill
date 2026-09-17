// paper/scripts/validate-blind-grade-review.mjs
//
// Deterministic leakage + integrity validator for the prepared blinded grading
// review packet (paper/audit/blind-grade-review-v1/). It answers two questions:
//
//   A. LEAKAGE — can a reviewer see anything that unblinds the packet?
//      The reviewer-visible package must carry no arm/condition/skill label,
//      no model identity, no original score or reward, no judge verdict, no
//      delta, and no historical conclusion. Checks are token-aware: a phrase
//      like "conditional" must not trip the condition pattern, the word
//      "scorer" must not trip a naive score substring match, and an answer
//      body mentioning the skill as its subject matter is content, not a leak.
//      Only file names, JSON keys, Markdown headers/metadata, and the two
//      authored reviewer-facing documents are scanned for text leaks.
//
//   B. INTEGRITY — is the packet internally consistent and still unreviewed?
//      16 tasks, 32 answers, strata coverage, per-answer sha256 matching the
//      source artifact byte-for-byte, a bijective coordinator map, blank
//      reviewer CSVs, humanReviewStatus not-started, 0 reviews submitted, and
//      no fabricated rating anywhere.
//
// No model calls, no network. Usage:
//   node paper/scripts/validate-blind-grade-review.mjs [--check] [repo-root]
//   --check exits non-zero on any leak or integrity failure (same behaviour as
//   the default; the flag exists so CI chains can pass it explicitly).

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import {
  ANSWER_COUNT, ARMS, COORDINATOR_MAP_PATH, HUMAN_REVIEW_STATUS, MANIFEST_PATH,
  PACKET_DIR, REVIEWER_CSV_COLUMNS, REVIEWER_CSV_PATHS, REVIEWER_VISIBLE_DIR,
  RUBRIC_PATH, SELECTION_SEED, STRATUM_TARGETS, STRATA, TASK_COUNT, anonymousId,
} from './prepare-blind-grade-review.mjs'

export const FAILURE_PREFIX = '[blind-grade-review]'
export const ANSWER_FILE_RE = /^R[0-9]{3}\.md$/
export const EXPLICIT_REVIEW_FLAG = '--check'

// ── Leakage patterns ─────────────────────────────────────────────────────────

/**
 * Provenance leak patterns: facts about HOW an answer was produced. These are
 * applied to every path segment, every markdown header, and the authored
 * reviewer-facing prose. They are token-aware: the adjective "conditional"
 * never matches the arm pattern, and "scorer" never matches a score pattern.
 */
export const PROVENANCE_PATTERNS = [
  { id: 'condition-label', pattern: /\bwith[-\s_]?skill\b|\bno[-\s_]?skill\b|\bnoskill\b|\bno-injected[-\s_]?skill\b|\bwithout[-\s_]skill\b/i, reason: 'experimental arm / condition label' },
  { id: 'arm-field', pattern: /\b(?:condition|arms?|treatment|control)\b(?!\s+(?:number|code|flow|loop|statement|path)\b)/i, reason: 'arm or condition vocabulary' },
  { id: 'round-marker', pattern: /\bround[-\s_]?[123]\b|\brounds?\b/i, reason: 'round selection metadata' },
  { id: 'original-score', pattern: /\b(?:original|historical|prior|previous|old)\s+(?:score|reward|rating)s?\b/i, reason: 'original score/reward reference' },
  { id: 'score-assignment', pattern: /\b(?:score|reward|rating|grade)\s*[:=]\s*-?[0-9]|\b(?:score|reward|rating|grade)[sd]?\s+(?:of\s+)?[0-9]{1,3}\s*(?:\/\s*100|%)/i, reason: 'concrete score/reward assignment' },
  { id: 'artifact-path', pattern: /benchmark[\/\\]results|artifacts[\/\\]/i, reason: 'source artifact path' },
  { id: 'score-key', pattern: /\b(?:original|historical)[-\s_]?(?:score|reward|rating)s?\b|\b(?:mean|median)[-\s_]?(?:score|reward|rating)s?\b/i, reason: 'outcome metric name' },
  { id: 'outcome-metric', pattern: /\bpass\s*@\s*1\b|\bpass@1\b|\bresolved\s+rate\b|\bmean\s+reward\b|\bmedian\s+reward\b/i, reason: 'outcome metric vocabulary' },
]

/**
 * Content-domain leak patterns: model identity, judge verdicts, effect sizes,
 * and historical conclusions. A frozen answer body is the material under
 * review, so a model name or the word "verdict" inside it is content, not
 * provenance. These patterns are therefore applied only to the reviewer-facing
 * documents this pipeline authors (README, rubric) and to JSON keys.
 */
export const AUTHORED_LEAKAGE_PATTERNS = [
  { id: 'model-identity', pattern: /\bglm(?:[-\s_]?[0-9]|(?:[-\s_]?[a-z]+)?\s+model)\b|\bglm-[0-9]|claude|\bgpt-[0-9]|\bdeepseek\b\s+(?:model|v[0-9]|[0-9])|qwen[0-9]?|gemini|llama|\bcodex\b|\bterminus\b|\bflash\b|\bluna\b|\bterra\b/i, reason: 'model identity' },
  { id: 'judge-verdict', pattern: /\b(?:llm[-\s]?rubric|keyword[-\s]?judge|judge[-\s]?verdict|verdict|grader)\b/i, reason: 'judge or grading-verdict vocabulary' },
  { id: 'delta', pattern: /\bdelta\b|\bmean\s+(?:gain|difference)\b|\bpaired\s+effect\b/i, reason: 'effect-size / delta vocabulary' },
  { id: 'historical-conclusion', pattern: /\binverted[-\s]?u\b|\buplift\b|\bskill\s+gain\b|\boutperform(?:s|ed|ing)?\b|\bbetter\s+than\b|\bworse\s+than\b|\bsignifican(?:t|tly)\b/i, reason: 'historical conclusion vocabulary' },
  { id: 'reward-vocabulary', pattern: /\breward\b/i, reason: 'reward vocabulary' },
]

/** Backwards-compatible union, used by callers that scan a full document. */
export const LEAKAGE_PATTERNS = [...PROVENANCE_PATTERNS, ...AUTHORED_LEAKAGE_PATTERNS]

/** YAML front-matter block, if the file opens with one. */
export function frontMatterBlock(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)
  return match ? match[1] : null
}

/** True when a front-matter block carries provenance/score metadata. */
export function frontMatterLeaks(text) {
  const block = frontMatterBlock(text)
  if (block === null) return []
  const failures = []
  for (const line of block.split('\n')) {
    const key = line.split(':')[0]?.trim()
    for (const { id, pattern, reason } of [...PROVENANCE_PATTERNS, ...AUTHORED_LEAKAGE_PATTERNS]) {
      if (pattern.test(line)) {
        failures.push(`front-matter ${id} (${reason})`)
        break
      }
    }
    if (/^(?:arm|condition|model|score|reward|rating|round|verdict|label)s?$/i.test(key ?? '')) {
      failures.push(`front-matter key "${key}" is provenance metadata`)
    }
  }
  return [...new Set(failures)]
}


/**
 * Key-level leak patterns. These are checked against JSON object KEYS, where
 * "campaign" style names must not be confused with an arm field. Word-bounded
 * so "armour" or "scorer" cannot false-positive.
 */
export const LEAKAGE_KEY_PATTERNS = [
  { id: 'arm-key', pattern: /^(?:arm|condition|arms|conditions|treatment|control)$/i, reason: 'arm/condition metadata key' },
  { id: 'outcome-key', pattern: /^(?:original_?score|historical_?score|reward|rewards|mean_?score|median_?score|judge_?verdict|verdict|delta|mean_?delta)$/i, reason: 'outcome metadata key' },
  { id: 'model-key', pattern: /^(?:model|model_?name|model_?id|provider)$/i, reason: 'model identity metadata key' },
]

/** Markdown header/metadata lines that must not carry provenance. */
export function markdownHeaderLines(text) {
  return text
    .split('\n')
    .filter((line) => /^\s*(?:#{1,6}\s|<!--|\*\*[A-Za-z_ ]+\*\*\s*:|\*[A-Za-z_ ]+\*\s*:)|\|/.test(line))
}

/** First path segment of a repo-relative path (the file name). */
export function basenameOf(relPath) {
  return relPath.split('/').pop()
}

/**
 * Scan a single value string for leaks.
 *   * `tier: 'provenance'` — how the answer was produced; safe on any surface,
 *     including frozen answer content.
 *   * `tier: 'authored'` — content-domain vocabulary; only for the documents
 *     this pipeline authors.
 */
export function scanText(text, where, { tier = 'provenance', patterns } = {}) {
  const table = patterns ?? (tier === 'authored' ? LEAKAGE_PATTERNS : PROVENANCE_PATTERNS)
  const failures = []
  for (const { id, pattern, reason } of table) {
    const match = pattern.exec(text)
    if (match) {
      const start = Math.max(0, match.index - 30)
      failures.push(`${FAILURE_PREFIX} LEAK ${where}: ${id} (${reason}) near "...${text.slice(start, match.index + match[0].length + 30).replaceAll('\n', ' ')}..."`)
    }
  }
  return failures
}

/** Scan JSON keys recursively; `allow` is a set of dotted key paths exempted. */
export function scanKeys(value, where, { allow = new Set(), path = [] } = {}) {
  const failures = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => failures.push(...scanKeys(item, where, { allow, path: [...path, String(index)] })))
    return failures
  }
  if (value === null || typeof value !== 'object') return failures
  for (const [key, child] of Object.entries(value)) {
    const keyPath = [...path, key].join('.')
    const keyName = path.length === 0 ? key : key
    if (!allow.has(keyPath)) {
      for (const { id, pattern, reason } of LEAKAGE_KEY_PATTERNS) {
        if (pattern.test(keyName)) {
          failures.push(`${FAILURE_PREFIX} LEAK ${where}: ${id} (${reason}) at key "${keyPath}"`)
        }
      }
    }
    failures.push(...scanKeys(child, where, { allow, path: [...path, key] }))
  }
  return failures
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Every file under a directory, repo-relative, sorted. */
export function listFiles(root, relDir) {
  const abs = join(root, relDir)
  if (!existsSync(abs)) return []
  const out = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) visit(child)
      else out.push(relative(root, child).split(sep).join('/'))
    }
  }
  visit(abs)
  return out.sort()
}

/** Parse a CSV template into { header, rows } (rows are raw cell arrays). */
export function parseCsvTemplate(text) {
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return { header: null, rows: [] }
  return { header: lines[0].split(',').map((cell) => cell.trim()), rows: lines.slice(1).map((line) => line.split(',').map((cell) => cell.trim())) }
}

/** Rows with any non-empty cell — i.e. a rating a human has actually entered. */
export function filledRows(rows) {
  return rows.filter((row) => row.some((cell) => cell !== ''))
}

// ── A. Leakage ───────────────────────────────────────────────────────────────

/**
 * Validate that the reviewer-visible package leaks nothing. Scans:
 *   * every path inside reviewer-visible/ (each segment, so a directory named
 *     after a condition, model, or round fails even when the file name is
 *     anonymous);
 *   * every answer file's Markdown headers for provenance vocabulary and its
 *     front-matter (if any) for any provenance key or value;
 *   * the full text of the reviewer-facing README and rubric for provenance
 *     AND content-domain vocabulary, because this pipeline authors them.
 */
export function validateReviewerVisibleLeakage(repoRoot) {
  const failures = []
  if (!existsSync(join(repoRoot, REVIEWER_VISIBLE_DIR))) {
    return [`${FAILURE_PREFIX} missing reviewer-visible package: ${REVIEWER_VISIBLE_DIR}`]
  }
  const files = listFiles(repoRoot, REVIEWER_VISIBLE_DIR)
  for (const rel of files) {
    const relInPackage = rel.slice(REVIEWER_VISIBLE_DIR.length + 1)
    for (const segment of relInPackage.split('/')) {
      failures.push(...scanText(segment, `${rel} (path segment)`))
    }
    const abs = join(repoRoot, rel)
    const text = readText(abs)
    const isAnswer = ANSWER_FILE_RE.test(basenameOf(rel))
    // Headers are a metadata surface for every reviewer-visible document.
    for (const line of markdownHeaderLines(text)) {
      failures.push(...scanText(line, `${rel} (markdown header)`))
    }
    for (const leak of frontMatterLeaks(text)) {
      failures.push(`${FAILURE_PREFIX} LEAK ${rel}: ${leak}`)
    }
    if (!isAnswer) {
      // Reviewer-facing prose is authored by this pipeline, so scan it for the
      // content-domain vocabulary too (model names, verdicts, deltas, ...).
      failures.push(...scanText(text, `${rel} (prose)`, { tier: 'authored' }))
    }
  }
  // The reviewer-facing rubric is duplicated at the packet level; that copy
  // must be clean too even though reviewers are not shown it.
  if (existsSync(join(repoRoot, RUBRIC_PATH))) {
    failures.push(...scanText(readText(join(repoRoot, RUBRIC_PATH)), `${RUBRIC_PATH} (prose)`, { tier: 'authored' }))
  }
  return [...new Set(failures)].sort()
}

/**
 * Validate that the coordinator map is the only unblinded machine artifact.
 * The map is *allowed* to carry arm and original-score keys, because it is the
 * coordinator-only unblinding record; `allow` (dotted key paths) is how a
 * caller grants that exemption. Everything else is scanned as usual.
 */
export function validateCoordinatorMapShape(map, { allow = new Set() } = {}) {
  const failures = []
  if (map === null || typeof map !== 'object' || Array.isArray(map)) {
    return [`${FAILURE_PREFIX} coordinator-map.json must be a JSON object`]
  }
  if (map.id !== 'blind-grade-review-v1-coordinator-map') failures.push(`${FAILURE_PREFIX} coordinator-map.json: unexpected id ${JSON.stringify(map.id)}`)
  if (map.coordinatorOnly !== true) failures.push(`${FAILURE_PREFIX} coordinator-map.json: coordinatorOnly must be true`)
  if (typeof map.warning !== 'string' || !/coordinator-only/i.test(map.warning)) {
    failures.push(`${FAILURE_PREFIX} coordinator-map.json: missing coordinator-only warning`)
  }
  failures.push(...scanKeys(map, COORDINATOR_MAP_PATH, { allow }))
  return failures
}

/** The coordinator map's expected unblinding-key exemption, derived from it. */
export function coordinatorMapAllowSet(map) {
  const entries = Array.isArray(map?.entries) ? map.entries : []
  return new Set([
    // The map is coordinator-only by design, so it may name the arms and the
    // original score per entry, plus the frozen dataset provenance.
    'provenance.arms',
    ...entries.flatMap((_, index) => [`entries.${index}.arm`, `entries.${index}.originalScore`]),
  ])
}

// ── B. Integrity ─────────────────────────────────────────────────────────────

function loadJson(repoRoot, rel) {
  const abs = join(repoRoot, rel)
  if (!existsSync(abs)) throw new Error(`missing ${rel}`)
  try {
    return JSON.parse(readText(abs))
  } catch (error) {
    throw new Error(`${rel}: not valid JSON (${error.message})`)
  }
}

/**
 * Full packet validation. Returns a deterministic list of failure strings
 * (empty when the packet is sound). Throws only when a required file is
 * missing or unparseable — those become failures too, via the wrapper.
 */
export function validateBlindGradeReview(repoRoot) {
  const failures = []
  const fail = (message) => failures.push(`${FAILURE_PREFIX} ${message}`)

  let manifest
  let map
  try {
    manifest = loadJson(repoRoot, MANIFEST_PATH)
    map = loadJson(repoRoot, COORDINATOR_MAP_PATH)
  } catch (error) {
    return [`${FAILURE_PREFIX} ${error.message}`]
  }

  // ── manifest status ──
  if (manifest.id !== 'blind-grade-review-v1-manifest') fail(`manifest: unexpected id ${JSON.stringify(manifest.id)}`)
  if (manifest.seed !== SELECTION_SEED) fail(`manifest: seed must be ${SELECTION_SEED}, got ${JSON.stringify(manifest.seed)}`)
  if (manifest.humanReview?.humanReviewStatus !== HUMAN_REVIEW_STATUS) {
    fail(`manifest: humanReviewStatus must be "${HUMAN_REVIEW_STATUS}", got ${JSON.stringify(manifest.humanReview?.humanReviewStatus)}`)
  }
  if (manifest.humanReview?.humanReviewsSubmitted !== 0) {
    fail(`manifest: humanReviewsSubmitted must be 0, got ${JSON.stringify(manifest.humanReview?.humanReviewsSubmitted)}`)
  }
  if (manifest.roundRule?.preference?.join(',') !== '2,1,3') {
    fail(`manifest: round rule preference must be 2,1,3, got ${JSON.stringify(manifest.roundRule?.preference)}`)
  }

  // ── counts ──
  const tasks = Array.isArray(manifest.tasks) ? manifest.tasks : []
  if (manifest.taskCount !== TASK_COUNT) fail(`manifest: taskCount must be ${TASK_COUNT}, got ${JSON.stringify(manifest.taskCount)}`)
  if (manifest.answerCount !== ANSWER_COUNT) fail(`manifest: answerCount must be ${ANSWER_COUNT}, got ${JSON.stringify(manifest.answerCount)}`)
  if (tasks.length !== TASK_COUNT) fail(`manifest: expected ${TASK_COUNT} task entries, got ${tasks.length}`)
  const taskIds = tasks.map((task) => task?.task)
  if (new Set(taskIds).size !== taskIds.length) fail('manifest: duplicate task ids')
  const manifestAnswers = tasks.flatMap((task) => (Array.isArray(task?.answers) ? task.answers : []))
  if (manifestAnswers.length !== ANSWER_COUNT) fail(`manifest: expected ${ANSWER_COUNT} answers, got ${manifestAnswers.length}`)
  const reviewIds = manifestAnswers.map((answer) => answer?.reviewId)
  if (new Set(reviewIds).size !== reviewIds.length) fail('manifest: duplicate review ids')
  const expectedIds = Array.from({ length: ANSWER_COUNT }, (_, index) => anonymousId(index))
  for (const id of expectedIds) {
    if (!reviewIds.includes(id)) fail(`manifest: missing review id ${id}`)
  }

  // ── strata ──
  const strata = Array.isArray(manifest.strata) ? manifest.strata : []
  if (strata.length !== STRATA.length) fail(`manifest: expected ${STRATA.length} strata, got ${strata.length}`)
  let targetSum = 0
  for (const entry of strata) {
    const declared = STRATUM_TARGETS[entry?.stratum]
    if (declared === undefined) {
      fail(`manifest: unknown stratum ${JSON.stringify(entry?.stratum)}`)
      continue
    }
    if (entry.targetCount !== declared) fail(`manifest: stratum ${entry.stratum} target must be ${declared}, got ${JSON.stringify(entry.targetCount)}`)
    targetSum += entry.targetCount ?? 0
    const members = tasks.filter((task) => task.stratum === entry.stratum)
    if (members.length !== entry.achievedCount) {
      fail(`manifest: stratum ${entry.stratum} achievedCount ${entry.achievedCount} does not match ${members.length} task entries`)
    }
  }
  if (targetSum !== TASK_COUNT) fail(`manifest: pre-declared stratum targets must sum to ${TASK_COUNT}, got ${targetSum}`)
  const perStratumSums = STRATA.map((name) => strata.find((entry) => entry.stratum === name)?.achievedCount ?? 0)
  if (perStratumSums.reduce((sum, value) => sum + value, 0) !== TASK_COUNT) {
    fail('manifest: achieved stratum counts do not sum to 16 tasks')
  }

  // ── paired arms per task ──
  for (const task of tasks) {
    const arms = (task.answers ?? []).map((answer) => answer.arm)
    if (arms.length !== ARMS.length || ARMS.some((arm) => !arms.includes(arm))) {
      fail(`manifest: task ${task.task} must contribute exactly one answer per arm, got ${JSON.stringify(arms)}`)
    }
    const rounds = (task.answers ?? []).map((answer) => answer.round)
    for (const round of rounds) {
      if (round !== 2) fail(`manifest: task ${task.task} used round ${round}; every answer must use the preferred round (2) or declare a fallback`)
    }
  }

  // ── round rule consistency ──
  const fallbackCount = manifestAnswers.filter((answer) => answer.round !== 2).length
  if ((manifest.roundRule?.answersUsingFallback ?? 0) !== fallbackCount) {
    fail(`manifest: roundRule.answersUsingFallback ${manifest.roundRule?.answersUsingFallback} does not match ${fallbackCount} non-round-2 answers`)
  }

  // ── coordinator map: shape + bijection ──
  failures.push(...validateCoordinatorMapShape(map, { allow: coordinatorMapAllowSet(map) }))
  const entries = Array.isArray(map.entries) ? map.entries : []
  if (entries.length !== ANSWER_COUNT) fail(`coordinator map: expected ${ANSWER_COUNT} entries, got ${entries.length}`)
  const mapIds = entries.map((entry) => entry.reviewId)
  if (new Set(mapIds).size !== mapIds.length) fail('coordinator map: duplicate review ids')
  const sortedMapIds = [...mapIds].sort()
  const sortedExpected = [...expectedIds].sort()
  if (sortedMapIds.join(',') !== sortedExpected.join(',')) {
    fail('coordinator map: review ids are not exactly R001..R032 (not a bijection)')
  }
  // Each task must appear exactly twice, once per arm.
  const byTask = new Map()
  for (const entry of entries) {
    if (!byTask.has(entry.task)) byTask.set(entry.task, [])
    byTask.get(entry.task).push(entry.arm)
  }
  if (byTask.size !== TASK_COUNT) fail(`coordinator map: covers ${byTask.size} tasks, expected ${TASK_COUNT}`)
  for (const [task, arms] of byTask) {
    if (arms.length !== ARMS.length || ARMS.some((arm) => !arms.includes(arm))) {
      fail(`coordinator map: task ${task} arms are ${JSON.stringify(arms.sort())}, expected one per arm`)
    }
  }
  if ([...byTask.keys()].some((task) => !taskIds.includes(task))) {
    fail('coordinator map: contains a task absent from the manifest')
  }

  // ── reviewer-visible files: existence, hash, verbatim copy ──
  const entriesById = new Map(entries.map((entry) => [entry.reviewId, entry]))
  const expectedVisible = new Set(['README.md', 'rubric.md'])
  for (const answer of manifestAnswers) {
    const rel = `${REVIEWER_VISIBLE_DIR}/${answer.reviewId}.md`
    expectedVisible.add(`${answer.reviewId}.md`)
    const abs = join(repoRoot, rel)
    if (!existsSync(abs)) {
      fail(`missing reviewer-visible answer file: ${rel}`)
      continue
    }
    const entry = entriesById.get(answer.reviewId)
    if (!entry) {
      fail(`answer ${answer.reviewId} has no coordinator-map entry`)
      continue
    }
    if (entry.sourceSha256 !== answer.sourceSha256) {
      fail(`answer ${answer.reviewId}: manifest sha256 ${answer.sourceSha256} does not match coordinator map ${entry.sourceSha256}`)
      continue
    }
    const sourceAbs = join(repoRoot, entry.sourcePath)
    if (!existsSync(sourceAbs)) {
      fail(`missing source artifact for ${answer.reviewId}: ${entry.sourcePath}`)
      continue
    }
    const sourceHash = sha256File(sourceAbs)
    if (sourceHash !== entry.sourceSha256) {
      fail(`source hash mismatch for ${answer.reviewId}: ${entry.sourcePath} is ${sourceHash}, manifest records ${entry.sourceSha256}`)
      continue
    }
    if (sha256File(abs) !== entry.sourceSha256) {
      fail(`answer ${answer.reviewId} is not a verbatim copy of its source artifact`)
    }
  }
  // No orphan files: a re-sample must never leave a stale or injected answer.
  for (const rel of listFiles(repoRoot, REVIEWER_VISIBLE_DIR)) {
    const name = rel.slice(REVIEWER_VISIBLE_DIR.length + 1)
    if (!expectedVisible.has(name)) fail(`unexpected file in reviewer-visible package: ${name}`)
  }

  // ── no fabricated ratings anywhere ──
  for (const [key, value] of [['manifest', manifest], ['coordinator map', map]]) {
    const flagged = findRatingFields(value)
    for (const path of flagged) fail(`${key}: fabricated rating field at ${path}`)
  }
  for (const csvPath of REVIEWER_CSV_PATHS) {
    const abs = join(repoRoot, csvPath)
    if (!existsSync(abs)) {
      fail(`missing reviewer template: ${csvPath}`)
      continue
    }
    const { header, rows } = parseCsvTemplate(readText(abs))
    if (header === null) {
      fail(`${csvPath}: empty template`)
      continue
    }
    if (header.join(',') !== REVIEWER_CSV_COLUMNS.join(',')) {
      fail(`${csvPath}: header must be exactly ${REVIEWER_CSV_COLUMNS.join(',')}`)
    }
    const filled = filledRows(rows)
    if (filled.length > 0) {
      fail(`${csvPath}: template must be blank (every row empty), found ${filled.length} filled row(s)`)
    }
    const wrongShape = rows.filter((row) => row.length !== REVIEWER_CSV_COLUMNS.length)
    if (wrongShape.length > 0) {
      fail(`${csvPath}: ${wrongShape.length} row(s) do not have ${REVIEWER_CSV_COLUMNS.length} columns (column count must match the header)`)
    }
  }

  failures.push(...validateReviewerVisibleLeakage(repoRoot))

  // Deterministic order.
  return [...new Set(failures)].sort()
}

/** Recursively find rating-shaped fields (a value present for a rating key). */
export function findRatingFields(value, path = '$') {
  const found = []
  if (Array.isArray(value)) {
    value.forEach((item, index) => found.push(...findRatingFields(item, `${path}[${index}]`)))
    return found
  }
  if (value === null || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    const isRatingKey = /^(?:correctness_?score|critical_?error|unsupported_?claim|contradiction|citation_?issue|confidence|rationale|reviewer_?id|rating|ratings|scores|judgement|judgment)$/i.test(key)
    const isReviewContainer = key === 'humanReview'
    if (isRatingKey && child !== null && child !== '' && !(Array.isArray(child) && child.length === 0)) {
      found.push(childPath)
    } else if (isReviewContainer) {
      // The humanReview block records status and counts only; a rating field
      // appearing inside it would be a fabricated review.
      for (const [innerKey, innerValue] of Object.entries(child ?? {})) {
        if (isRatingKey && innerValue !== null && innerValue !== '') found.push(`${childPath}.${innerKey}`)
      }
    }
    found.push(...findRatingFields(child, childPath))
  }
  return found
}

/** Deterministic human-readable report. */
export function renderReport(repoRoot) {
  const failures = validateBlindGradeReview(repoRoot)
  const manifest = existsSync(join(repoRoot, MANIFEST_PATH)) ? JSON.parse(readText(join(repoRoot, MANIFEST_PATH))) : null
  const lines = [
    `${FAILURE_PREFIX} report`,
    `  packet: ${PACKET_DIR}`,
    `  tasks: ${manifest?.taskCount ?? 'n/a'}`,
    `  answers: ${manifest?.answerCount ?? 'n/a'}`,
    `  seed: ${manifest?.seed ?? 'n/a'}`,
    `  humanReviewStatus: ${manifest?.humanReview?.humanReviewStatus ?? 'n/a'}`,
    `  humanReviewsSubmitted: ${manifest?.humanReview?.humanReviewsSubmitted ?? 'n/a'}`,
    `  failures: ${failures.length}`,
  ]
  for (const failure of failures) lines.push(`  - ${failure}`)
  return lines.join('\n')
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const args = process.argv.slice(2)
  const flags = args.filter((arg) => arg.startsWith('--'))
  const positional = args.filter((arg) => !arg.startsWith('--'))
  const unknown = flags.filter((flag) => flag !== EXPLICIT_REVIEW_FLAG)
  if (unknown.length > 0 || positional.length > 1) {
    console.error(`usage: node paper/scripts/validate-blind-grade-review.mjs [${EXPLICIT_REVIEW_FLAG}] [repo-root]`)
    process.exit(2)
  }
  const repoRoot = resolve(positional[0] ?? fileURLToPath(new URL('../../', import.meta.url)))
  let failures
  try {
    failures = validateBlindGradeReview(repoRoot)
  } catch (error) {
    console.error(`${FAILURE_PREFIX} ${error.message}`)
    process.exit(1)
  }
  console.log(renderReport(repoRoot))
  if (failures.length > 0) {
    console.error(`Blind grading review validation failed (${failures.length}):`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log(`${FAILURE_PREFIX} OK: 16 tasks / 32 answers, metadata-blinded, coordinator map bijective, reviewer forms blank, humanReviewStatus=not-started, 0 reviews submitted`)
}
