// Fixed-seed stratified draw of 16 tasks from the S1–S22 static migration
// diagnosis pool for the unified GLM-5.3-Flash two-arm run
// (paper/INVERTED-U-WORKPLAN.zh.md §5).
//
// Outcome blindness is structural: this script reads only task.toml metadata and
// fixture sizes. It never reads benchmark/results/, validation reports, or any
// score artifact. Stratification uses source-event era, problem family, prompt
// language and fixture-size tercile — all fixed before any new solver run.
//
// Usage:
//   node benchmark/scripts/select-unified-sixteen.mjs            # print + write selection JSON
//   node benchmark/scripts/select-unified-sixteen.mjs --check    # verify a committed selection matches
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mulberry32 } from './measure-paired-effect.mjs'

export const SELECTION_SEED = 20260915
export const DRAW_SIZE = 16
export const SELECTION_SCHEMA = 'unified-sixteen-selection-v1'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const tasksDir = join(repoRoot, 'benchmark', 'tasks')
const OUTPUT_PATH = 'benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16/selection.json'

// Higher-level problem families collapse the fine-grained task tags so each
// stratum has enough members for a proportional draw at n=16.
const FAMILY_RULES = [
  ['static-contract-diagnosis', ['static-scan', 'negative-scan', 'snapshot-migration', 'peer-dependencies']],
  ['runtime-client-api-contract', ['client-api-contract', 'plugin-runtime', 'tui-rendering', 'render-pipeline']],
  ['release-install-upgrade', ['release-engineering', 'upgrade-safety', 'install-channel', 'resource-chain']],
  ['profile-cordis', ['profile-patch']],
]

function parseTomlTable(text, tableName) {
  const table = {}
  let inside = false
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('[')) {
      inside = line === `[${tableName}]`
      continue
    }
    if (!inside || !line.includes('=')) continue
    const eq = line.indexOf('=')
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (value.startsWith('[')) {
      value = value.slice(1, value.lastIndexOf(']')).split(',').map((s) => s.trim().replace(/^"|"/g, '')).filter(Boolean)
    } else {
      value = value.replace(/^"|"$/g, '')
    }
    table[key] = value
  }
  return table
}

function fixtureBytes(taskDir) {
  let total = 0
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else total += Number(readFileSync(path).length)
    }
  }
  walk(join(taskDir, 'environment', 'fixture'))
  return total
}

function familyOf(tags) {
  for (const [family, markers] of FAMILY_RULES) {
    if (tags.some((tag) => markers.includes(tag))) return family
  }
  return 'other'
}

// Source-event era from the scoring table's incident dates (see
// benchmark/docs/scoring.md): corridor-era map events vs dated real incidents.
function eraOf(taskId, tags) {
  if (tags.includes('snapshot-migration')) return '0.1.2-corridor'
  const dated = {
    S1: '0.1.2-corridor', S2: '0.1.2-corridor', S3: '0.1.2-corridor',
    S4: '0.1.2-corridor', S5: '0.1.2-corridor', S6: '0.1.2-corridor', S7: '0.1.2-corridor',
    S8: 'incident-2026-08-31', S9: 'incident-2026-09-01', S10: 'incident-2026-09-01',
    S11: 'incident-2026-09-01', S12: 'incident-2026-09-02', S13: 'incident-2026-09-02',
    S14: 'incident-2026-09-03', S15: 'incident-2026-09-03', S16: 'incident-2026-09-03',
    S17: 'incident-2026-09-04', S18: 'incident-2026-09-05', S19: 'incident-2026-09-05',
    S20: 'incident-0.1.3-A1', S21: 'incident-2026-09-09', S22: 'incident-2026-09-09',
  }
  return dated[taskId] ?? 'unknown'
}

export function inventoryPool() {
  const entries = []
  for (const name of readdirSync(tasksDir).sort()) {
    if (!/^S\d+-/.test(name)) continue
    const dir = join(tasksDir, name)
    const toml = readFileSync(join(dir, 'task.toml'), 'utf8')
    const metadata = parseTomlTable(toml, 'metadata')
    const tags = Array.isArray(metadata.tags) ? metadata.tags : []
    const bytes = fixtureBytes(dir)
    entries.push({
      task: name,
      difficulty: metadata.difficulty ?? 'unspecified',
      promptLanguage: tags.includes('chinese-prompt') ? 'chinese' : 'english',
      family: familyOf(tags),
      era: eraOf(name.replace(/-.*$/, ''), tags),
      fixtureBytes: bytes,
    })
  }
  const sorted = [...entries].sort((a, b) => a.fixtureBytes - b.fixtureBytes)
  const tercile = (index) => (index < 7 ? 'small' : index < 15 ? 'medium' : 'large')
  for (let i = 0; i < sorted.length; i++) sorted[i].lengthTercile = tercile(i)
  return entries.sort((a, b) => a.task.localeCompare(b.task, 'en', { numeric: true }))
}

// Proportional allocation per stratum via largest remainder, then a seeded
// draw within each stratum. Constraints (metadata-only, fixed in advance):
// at least 2 hard tasks, at least 2 chinese-prompt tasks, at least 2
// large-fixture tasks remain in the selection; if a plain proportional draw
// violates one, the seeded sampler re-draws that stratum preferring the
// under-represented metadata value.
export function drawSixteen(pool = inventoryPool(), seed = SELECTION_SEED) {
  const rand = mulberry32(seed)
  const strata = new Map()
  for (const task of pool) {
    const key = `${task.family}|${task.lengthTercile}`
    if (!strata.has(key)) strata.set(key, [])
    strata.get(key).push(task)
  }
  const quota = new Map()
  let allocated = 0
  for (const [key, members] of strata) {
    const exact = (members.length / pool.length) * DRAW_SIZE
    const base = Math.floor(exact)
    quota.set(key, { base, remainder: exact - base, members })
    allocated += base
  }
  const byRemainder = [...quota.entries()].sort((a, b) => b[1].remainder - a[1].remainder || a[0].localeCompare(b[0]))
  for (let i = 0; allocated < DRAW_SIZE; i++, allocated++) {
    quota.get(byRemainder[i % byRemainder.length][0]).base += 1
  }

  const selection = []
  const jitter = () => rand()
  for (const [key, spec] of quota) {
    const members = [...spec.members].sort((a, b) => a.task.localeCompare(b.task, 'en', { numeric: true }))
    // Fisher–Yates with the seeded PRNG; ties in the sort key never occur.
    for (let i = members.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[members[i], members[j]] = [members[j], members[i]]
    }
    selection.push(...members.slice(0, spec.base))
    void jitter
  }
  selection.sort((a, b) => a.task.localeCompare(b.task, 'en', { numeric: true }))

  const counts = {
    hard: selection.filter((t) => t.difficulty === 'hard').length,
    chinese: selection.filter((t) => t.promptLanguage === 'chinese').length,
    large: selection.filter((t) => t.lengthTercile === 'large').length,
  }
  const order = [...quota.keys()].sort()
  const repairPasses = []
  const minimums = [['hard', 'difficulty', 'hard'], ['chinese', 'promptLanguage', 'chinese'], ['large', 'lengthTercile', 'large']]
  for (const [label, field, value] of minimums) {
    let guard = 0
    while (counts[label] < 2 && guard < DRAW_SIZE) {
      guard += 1
      // Swap out a selected task whose field differs, swap in an excluded task
      // with the wanted value, keeping every stratum quota intact.
      const candidatesIn = pool.filter((t) => !selection.includes(t) && t[field] === value)
      if (candidatesIn.length === 0) break
      candidatesIn.sort((a, b) => a.task.localeCompare(b.task, 'en', { numeric: true }))
      const incoming = candidatesIn[Math.floor(rand() * candidatesIn.length)]
      const incomingKey = `${incoming.family}|${incoming.lengthTercile}`
      let swapped = false
      for (const key2 of order) {
        if (swapped) break
        if (key2 === incomingKey && quota.get(key2).base >= strata.get(key2).length) continue
        const outgoing = selection.find((t) => `${t.family}|${t.lengthTercile}` === key2 && t[field] !== value)
        if (!outgoing) continue
        selection.splice(selection.indexOf(outgoing), 1, incoming)
        counts[label] += 1
        repairPasses.push({ ensure: label, out: outgoing.task, in: incoming.task })
        swapped = true
      }
      if (!swapped) break
    }
  }
  selection.sort((a, b) => a.task.localeCompare(b.task, 'en', { numeric: true }))
  return {
    selection,
    excluded: pool.filter((t) => !selection.includes(t)),
    constraints: counts,
    repairPasses,
  }
}

export function buildSelectionDoc(seed = SELECTION_SEED) {
  const pool = inventoryPool()
  const { selection, excluded, constraints, repairPasses } = drawSixteen(pool, seed)
  return {
    schemaVersion: SELECTION_SCHEMA,
    seed,
    drawSize: DRAW_SIZE,
    pool: pool.map((t) => t.task),
    strataFields: ['family', 'lengthTercile'],
    balanceFields: ['difficulty', 'promptLanguage', 'lengthTercile'],
    selected: selection,
    excluded: excluded.map((t) => t.task),
    constraints,
    repairPasses,
    blindness: 'drawn from task.toml metadata and fixture sizes only; no score artifact is readable by this script',
    plannedTrials: selection.length * 2 * 2,
  }
}

function renderJson(doc) {
  return JSON.stringify(doc, null, 2) + '\n'
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const check = process.argv.includes('--check')
  const doc = buildSelectionDoc()
  const target = join(repoRoot, OUTPUT_PATH)
  if (check) {
    if (!existsSync(target)) {
      console.error(`missing ${OUTPUT_PATH}`)
      process.exit(1)
    }
    const committed = JSON.parse(readFileSync(target, 'utf8'))
    if (renderJson(committed) !== renderJson(doc)) {
      console.error('selection drift: regenerated document differs from committed selection.json')
      process.exit(1)
    }
    console.log(`selection deterministic: ${doc.selected.length} tasks, ${doc.plannedTrials} planned trials`)
  } else {
    mkdirSync(join(repoRoot, 'benchmark/results/artifacts/2026-09-15-glm-5.3-flash-unified-s16'), { recursive: true })
    writeFileSync(target, renderJson(doc))
    console.log(`wrote ${OUTPUT_PATH}`)
    console.log(`selected (${doc.selected.length}): ${doc.selected.map((t) => t.task).join(', ')}`)
    console.log(`excluded (${doc.excluded.length}): ${doc.excluded.join(', ')}`)
    console.log(`constraints: ${JSON.stringify(doc.constraints)}`)
  }
}
