// paper/scripts/validate-blind-grade-review.mjs
//
// Deterministic leakage + integrity validator for the prepared blinded grading
// review packet (paper/audit/blind-grade-review-v1/). It answers two questions:
//
//   A. LEAKAGE — can a reviewer see anything that unblinds the packet?
//      Everything under reviewer-packet/ is reviewer-reachable. Every file in
//      it (answers, task materials, README, rubric, forms) is scanned in full
//      for answer-key material: arm/condition labels, arm/score/source JSON
//      keys, source-artifact paths (…/skill/… or …/noskill/…), original-score
//      references, and unmasked skill identity (skill name, SKILL.md,
//      references/ paths, skill-repo paths). Answers and the authored
//      documents are additionally checked for the bare word "skill" used as a
//      tool reference and for skill mode vocabulary; the authored documents
//      also for model identity, verdict/delta/conclusion vocabulary, and any
//      pointer outside the packet (../, coordinator/, manifest names).
//      Checks are token-aware: "conditional" does not trip the condition
//      pattern, "scorer" does not trip a score pattern, and the plugin-manifest
//      "skill name" / "skill provider" is task content.
//
//   B. INTEGRITY — is the packet internally consistent and still unreviewed?
//      16 tasks, 32 answers, strata coverage, every source artifact matching
//      its recorded sha256, every packet answer equal to the deterministic
//      masking of its source (and NOT byte-identical to it), task materials
//      matching their recorded hashes, a bijective coordinator map, blank
//      reviewer CSVs, humanReviewStatus not-started, 0 reviews submitted, and
//      no fabricated rating anywhere. The coordinator-only files live in
//      coordinator/ and are the only place reviewId↔arm may appear.
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
  MASKING_LOG_PATH, PACKET_DIR, REVIEWER_ANSWERS_DIR, REVIEWER_CSV_COLUMNS,
  REVIEWER_CSV_PATHS, REVIEWER_PACKET_DIR, REVIEWER_README_PATH, REVIEWER_RUBRIC_PATH,
  REVIEWER_TASKS_DIR, SELECTION_SEED, STRATUM_TARGETS, STRATA, TASK_COUNT,
  anonymousId, maskAnswer, maskTaskMaterial, renderAnswerFile,
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

/**
 * Answer-key patterns: applied to the FULL TEXT of every reviewer-reachable
 * file, including frozen answers and task materials. Any hit means the packet
 * carries the key (arm, score, source) or an unmasked skill identity.
 */
export const ANSWER_KEY_PATTERNS = [
  { id: 'condition-label', pattern: /\bwith[-_]?skill\b|\bno[-_]skill\b|\bnoskill\b|\bwithout[-_]skill\b/i, reason: 'experimental arm / condition label' },
  { id: 'arm-json-key', pattern: /"(?:arm|arms|condition|originalScore|original_score|sourcePath|sourceSha256|packetSha256|selectedRoundDelta|historicalPerTaskDelta|maskReplacementCount)"\s*:/, reason: 'answer-key JSON field' },
  { id: 'arm-source-path', pattern: /(?:^|[\/\\])(?:no)?skill[\/\\]S[0-9]+-/im, reason: 'source path naming an arm folder' },
  { id: 'artifact-path', pattern: /benchmark[\/\\]results|results[\/\\]artifacts/i, reason: 'source artifact path' },
  { id: 'original-score', pattern: /\b(?:original|historical)[-\s_]?(?:score|reward|rating)s?\b/i, reason: 'original score/reward reference' },
  { id: 'skill-identity', pattern: /dsh-plugin-upgrade|\bplugin-upgrade\b|\bSKILL(?:\.zh-CN)?\.md\b|(?:^|[\s`'"(/])references\//i, reason: 'unmasked skill name, entry file, or reference path' },
]

/**
 * Unmasked skill-mention patterns: applied to answer files and to the authored
 * reviewer documents (not to task materials, whose brief legitimately says
 * "the applicable skill" identically for both arms). Mirrors the masking
 * rules: the plugin-manifest "skill name" / "skill provider" / "skills" and a
 * "(skill)" surface label are task content.
 */
export const UNMASKED_SKILL_PATTERNS = [
  { id: 'unmasked-skill-mention', pattern: /\bskill(?:'s|’s)?\b(?![ \t]+(?:name|provider)s?\b)(?!(?<=\(skill)\))/i, reason: 'unmasked "skill" tool reference' },
  { id: 'unmasked-skill-mode', pattern: /\bMode[ \t]+[A-D]\b|\b[A-D][ \t]*·[ \t]*(?:inspect|update|author-migrate)\b/, reason: 'unmasked skill mode vocabulary' },
]

/** Authored reviewer documents must never point outside the packet. */
export const OUTSIDE_POINTER_PATTERNS = [
  { id: 'outside-pointer', pattern: /\.\.\/|\bcoordinator\/|coordinator-map|sample-manifest|masking-log|prepare-blind-grade-review|reviewer-visible/i, reason: 'pointer to a file outside the reviewer packet' },
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

/** Classify a reviewer-packet file by its role. */
export function packetFileKind(rel) {
  if (rel === REVIEWER_README_PATH || rel === REVIEWER_RUBRIC_PATH) return 'authored'
  if (REVIEWER_CSV_PATHS.includes(rel)) return 'form'
  if (rel.startsWith(`${REVIEWER_ANSWERS_DIR}/`)) return 'answer'
  if (rel.startsWith(`${REVIEWER_TASKS_DIR}/`)) return 'task-material'
  return 'other'
}

/**
 * Validate that the reviewer packet leaks nothing. Everything under
 * reviewer-packet/ is reviewer-reachable. Scans:
 *   * every path segment (a directory named after a condition, model, or
 *     round fails even when the file name is anonymous);
 *   * the full text of every file for answer-key material
 *     (ANSWER_KEY_PATTERNS);
 *   * answers and authored documents for unmasked skill mentions;
 *   * Markdown headers and front-matter of answers/authored documents for
 *     provenance vocabulary;
 *   * JSON keys of any JSON file in the packet outside task materials;
 *   * the authored README and rubric for provenance AND content-domain
 *     vocabulary and for pointers outside the packet.
 */
export function validateReviewerPacketLeakage(repoRoot) {
  const failures = []
  if (!existsSync(join(repoRoot, REVIEWER_PACKET_DIR))) {
    return [`${FAILURE_PREFIX} missing reviewer packet: ${REVIEWER_PACKET_DIR}`]
  }
  const files = listFiles(repoRoot, REVIEWER_PACKET_DIR)
  for (const rel of files) {
    const relInPackage = rel.slice(REVIEWER_PACKET_DIR.length + 1)
    for (const segment of relInPackage.split('/')) {
      failures.push(...scanText(segment, `${rel} (path segment)`))
    }
    const text = readText(join(repoRoot, rel))
    const kind = packetFileKind(rel)
    failures.push(...scanText(text, `${rel} (answer key)`, { patterns: ANSWER_KEY_PATTERNS }))
    if (kind === 'answer' || kind === 'authored' || kind === 'other') {
      failures.push(...scanText(text, `${rel} (unmasked)`, { patterns: UNMASKED_SKILL_PATTERNS }))
      for (const line of markdownHeaderLines(text)) {
        failures.push(...scanText(line, `${rel} (markdown header)`))
      }
      for (const leak of frontMatterLeaks(text)) {
        failures.push(`${FAILURE_PREFIX} LEAK ${rel}: ${leak}`)
      }
    }
    if (kind !== 'task-material' && rel.endsWith('.json')) {
      try {
        failures.push(...scanKeys(JSON.parse(text), rel))
      } catch {
        failures.push(`${FAILURE_PREFIX} ${rel}: not valid JSON`)
      }
    }
    if (kind === 'authored' || kind === 'other') {
      // Reviewer-facing prose is authored by this pipeline, so scan it for the
      // content-domain vocabulary too (model names, verdicts, deltas, ...),
      // and make sure it never sends the reviewer outside the packet.
      failures.push(...scanText(text, `${rel} (prose)`, { tier: 'authored' }))
      failures.push(...scanText(text, `${rel} (prose)`, { patterns: OUTSIDE_POINTER_PATTERNS }))
    }
  }
  return [...new Set(failures)].sort()
}

/** Backwards-compatible name. */
export const validateReviewerVisibleLeakage = validateReviewerPacketLeakage

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
  let maskingLog
  try {
    manifest = loadJson(repoRoot, MANIFEST_PATH)
    map = loadJson(repoRoot, COORDINATOR_MAP_PATH)
    maskingLog = loadJson(repoRoot, MASKING_LOG_PATH)
  } catch (error) {
    return [`${FAILURE_PREFIX} ${error.message}`]
  }

  // ── coordinator-only files must live outside the reviewer packet ──
  for (const rel of [MANIFEST_PATH, COORDINATOR_MAP_PATH, MASKING_LOG_PATH]) {
    if (rel.startsWith(`${REVIEWER_PACKET_DIR}/`)) fail(`${rel} is coordinator-only but sits inside the reviewer packet`)
  }
  for (const [label, doc] of [['manifest', manifest], ['masking log', maskingLog]]) {
    if (doc.coordinatorOnly !== true) fail(`${label}: coordinatorOnly must be true`)
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
  const taskLabels = tasks.map((task) => task?.taskLabel)
  if (new Set(taskLabels).size !== taskLabels.length || taskLabels.some((label) => !/^T[0-9]{2}$/.test(label ?? ''))) {
    fail('manifest: task labels must be unique T01..T16 values')
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

  // ── coordinator map: shape + bijection ──
  failures.push(...validateCoordinatorMapShape(map, { allow: coordinatorMapAllowSet(map) }))
  const entries = Array.isArray(map.entries) ? map.entries : []
  if (entries.length !== ANSWER_COUNT) fail(`coordinator map: expected ${ANSWER_COUNT} entries, got ${entries.length}`)
  const mapIds = entries.map((entry) => entry.reviewId)
  if (new Set(mapIds).size !== mapIds.length) fail('coordinator map: duplicate review ids')
  const expectedIds = Array.from({ length: ANSWER_COUNT }, (_, index) => anonymousId(index))
  if ([...mapIds].sort().join(',') !== expectedIds.join(',')) {
    fail('coordinator map: review ids are not exactly R001..R032 (not a bijection)')
  }
  // Each task must appear exactly twice, once per arm, under one task label.
  const byTask = new Map()
  for (const entry of entries) {
    if (!byTask.has(entry.task)) byTask.set(entry.task, [])
    byTask.get(entry.task).push(entry)
  }
  if (byTask.size !== TASK_COUNT) fail(`coordinator map: covers ${byTask.size} tasks, expected ${TASK_COUNT}`)
  for (const [task, taskEntries] of byTask) {
    const arms = taskEntries.map((entry) => entry.arm)
    if (arms.length !== ARMS.length || ARMS.some((arm) => !arms.includes(arm))) {
      fail(`coordinator map: task ${task} must contribute exactly one answer per arm, got ${JSON.stringify(arms.sort())}`)
    }
    const manifestTask = tasks.find((candidate) => candidate.task === task)
    if (!manifestTask) fail(`coordinator map: task ${task} is absent from the manifest`)
    else if (taskEntries.some((entry) => entry.taskLabel !== manifestTask.taskLabel)) {
      fail(`coordinator map: task ${task} label disagrees with the manifest`)
    }
  }

  // ── round rule consistency ──
  for (const entry of entries) {
    if (entry.round !== 2) fail(`coordinator map: ${entry.reviewId} used round ${entry.round}; every answer must use the preferred round (2) or declare a fallback`)
  }
  const fallbackCount = entries.filter((entry) => entry.round !== 2).length
  if ((manifest.roundRule?.answersUsingFallback ?? 0) !== fallbackCount) {
    fail(`manifest: roundRule.answersUsingFallback ${manifest.roundRule?.answersUsingFallback} does not match ${fallbackCount} non-round-2 answers`)
  }

  // ── answers: source hash, deterministic masking, not a verbatim copy ──
  const expectedPacket = new Set([REVIEWER_README_PATH, REVIEWER_RUBRIC_PATH, ...REVIEWER_CSV_PATHS])
  const logById = new Map((Array.isArray(maskingLog.entries) ? maskingLog.entries : []).map((entry) => [entry.reviewId, entry]))
  const sourceHashes = new Set(entries.map((entry) => entry.sourceSha256))
  for (const entry of entries) {
    const rel = `${REVIEWER_ANSWERS_DIR}/${entry.reviewId}.md`
    expectedPacket.add(rel)
    if (entry.packetPath !== rel) fail(`coordinator map: ${entry.reviewId} packetPath must be ${rel}`)
    const abs = join(repoRoot, rel)
    if (!existsSync(abs)) {
      fail(`missing reviewer packet answer file: ${rel}`)
      continue
    }
    const packetText = readText(abs)
    const packetHash = sha256File(abs)
    if (sourceHashes.has(packetHash)) fail(`answer ${entry.reviewId} is byte-identical to a source artifact (hash lookup would unblind it)`)
    if (packetHash !== entry.packetSha256) fail(`answer ${entry.reviewId}: packet sha256 ${packetHash} does not match coordinator map ${entry.packetSha256}`)
    const sourceAbs = join(repoRoot, entry.sourcePath ?? '')
    if (typeof entry.sourcePath !== 'string' || !existsSync(sourceAbs)) {
      fail(`missing source artifact for ${entry.reviewId}: ${entry.sourcePath}`)
      continue
    }
    const sourceHash = sha256File(sourceAbs)
    if (sourceHash !== entry.sourceSha256) {
      fail(`source hash mismatch for ${entry.reviewId}: ${entry.sourcePath} is ${sourceHash}, map records ${entry.sourceSha256}`)
      continue
    }
    const masked = maskAnswer(readText(sourceAbs))
    const expected = renderAnswerFile({ reviewId: entry.reviewId, taskLabel: entry.taskLabel, maskedBody: masked.text })
    if (packetText !== expected) fail(`answer ${entry.reviewId} is not the deterministic masked copy of its source artifact`)
    const logged = logById.get(entry.reviewId)
    if (!logged) fail(`masking log: no entry for ${entry.reviewId}`)
    else if (JSON.stringify(logged.replacements) !== JSON.stringify(masked.replacements)) {
      fail(`masking log: ${entry.reviewId} replacements do not match the masking rules`)
    }
    if (entry.maskReplacementCount !== masked.replacements.length) {
      fail(`coordinator map: ${entry.reviewId} maskReplacementCount does not match the masking rules`)
    }
  }

  // ── task materials: recorded hash, no stray files ──
  const materialFiles = Array.isArray(manifest.taskMaterials?.files) ? manifest.taskMaterials.files : []
  const labelsWithBrief = new Set()
  for (const file of materialFiles) {
    if (typeof file?.path !== 'string' || !file.path.startsWith(`${REVIEWER_TASKS_DIR}/`)) {
      fail(`manifest: task material path ${JSON.stringify(file?.path)} is outside ${REVIEWER_TASKS_DIR}`)
      continue
    }
    expectedPacket.add(file.path)
    if (file.path.endsWith('/instruction.md')) labelsWithBrief.add(file.taskLabel)
    const abs = join(repoRoot, file.path)
    if (!existsSync(abs)) {
      fail(`missing task material: ${file.path}`)
      continue
    }
    if (sha256File(abs) !== file.sha256) fail(`task material hash mismatch: ${file.path}`)
    if (maskTaskMaterial(readText(abs)).replacements.length > 0) fail(`task material ${file.path} still contains unmasked skill identity`)
  }
  for (const label of taskLabels) {
    if (!labelsWithBrief.has(label)) fail(`task ${label} has no instruction.md in the reviewer packet`)
  }

  // No orphan files: a re-sample must never leave a stale or injected file.
  for (const rel of listFiles(repoRoot, REVIEWER_PACKET_DIR)) {
    if (!expectedPacket.has(rel)) fail(`unexpected file in reviewer packet: ${rel.slice(REVIEWER_PACKET_DIR.length + 1)}`)
  }

  // ── no fabricated ratings anywhere ──
  for (const [key, value] of [['manifest', manifest], ['coordinator map', map], ['masking log', maskingLog]]) {
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

  failures.push(...validateReviewerPacketLeakage(repoRoot))

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
  console.log(`${FAILURE_PREFIX} OK: 16 tasks / 32 answers, reviewer packet leak-free and masked, coordinator map bijective, reviewer forms blank, humanReviewStatus=not-started, 0 reviews submitted`)
}
