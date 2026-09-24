// paper/scripts/generate-glm-robustness-table.test.mjs
//
// Focused tests for the GLM robustness table generator. It consumes the merged
// #238 authority (benchmark/results/glm-pair-stability.json) and must never
// re-analyse the data: these tests pin the rendering, the input-hash gate, and
// the determinism/drift contract.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INPUT_PATH,
  OUTPUT_PATH,
  fmt,
  fmtInterval,
  fmtSeries,
  generate,
  influenceFromLeaveOneOut,
  loadStability,
  renderTable,
  verifyInputHashes,
} from './generate-glm-robustness-table.mjs'

const REPO_ROOT = resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))

function fixtureDoc(overrides = {}) {
  const doc = {
    schemaVersion: 1,
    id: 'glm-pair-stability',
    inputs: [],
    method: { prng: 'mulberry32', seed: 20260907, bootstrapReplicates: 10000 },
    a1: {
      tasks: 22,
      meanD: 6.2273,
      medianD: 0,
      bootstrapCi95: [2.5909, 10.0455],
      wilcoxon: { n: 12, nZero: 10, pTwoSided: 0.007988586882083037 },
      leaveOneOut: { min: { task: 'S4-legacy-client-imports', meanD: 5.3333 }, max: { task: 'S11-mermaid-lazyload-trap', meanD: 7 } },
    },
    a2: {
      perRoundMeanDelta: {
        'glm-5.3-flash': [
          { round: 'r1', meanDelta: 6.3182, n: 22 },
          { round: 'round2', meanDelta: 8.8182, n: 22 },
          { round: 'round3', meanDelta: 9.8182, n: 22 },
        ],
        'glm-5.2': [
          { round: 'r1', meanDelta: 1.5455, n: 22 },
          { round: 'round2', meanDelta: 1.6364, n: 22 },
          { round: 'round3', meanDelta: 5, n: 22 },
        ],
      },
      meanVsMedianAggregation: {
        'glm-5.3-flash': { mean: 9.2727, median: 0 },
        'glm-5.2': { mean: 3.0455, median: 0 },
      },
      repeatAggregationSensitivity: {
        'glm-5.3-flash': { meanOverRepeats: 8.3182, medianPerArmOverRepeats: 9.2727 },
        'glm-5.2': { meanOverRepeats: 2.7273, medianPerArmOverRepeats: 3.0455 },
      },
      baselineVsGainSpearman: {
        'glm-5.3-flash': { spearmanBaselineVsGain: -0.742 },
        'glm-5.2': { spearmanBaselineVsGain: -0.6406 },
      },
      zeroHandling: { flashNZero: 12, strongNZero: 16 },
    },
  }
  return { ...doc, ...overrides }
}

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), 'glm-robust-'))
  mkdirSync(join(root, 'benchmark/results'), { recursive: true })
  mkdirSync(join(root, 'paper/generated'), { recursive: true })
  return root
}

/** Copy the authority JSON plus every input it hashes, so the input gate can
 *  pass and the drift/write behaviour is what the test actually exercises. */
function materializeAuthority(root, doc = loadStability(REPO_ROOT)) {
  for (const input of doc.inputs ?? []) {
    const target = join(root, input.path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(REPO_ROOT, input.path), target)
  }
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(doc))
  return doc
}

// ── formatting helpers ────────────────────────────────────────────────────────

test('fmt: signed positive values carry +', () => {
  assert.equal(fmt(6.2273, { signed: true }), '+6.23')
})

test('fmt: negative values keep the minus sign', () => {
  assert.equal(fmt(-3.0714, { signed: true }), '-3.07')
})

test('fmt: null renders as the placeholder, never 0', () => {
  assert.equal(fmt(null), '--')
  assert.equal(fmt(undefined, { signed: true }), '--')
})

test('fmtInterval: renders [lo, hi] in order', () => {
  assert.equal(fmtInterval([2.5909, 10.0455]), '[+2.59, +10.05]')
})

test('fmtInterval: malformed interval is the placeholder', () => {
  assert.equal(fmtInterval([1]), '--')
  assert.equal(fmtInterval(null), '--')
})

test('fmtSeries: joins rounds with slashes', () => {
  assert.equal(fmtSeries([6.3182, 8.8182, 9.8182], { signed: true }), '+6.32 / +8.82 / +9.82')
})

// ── authority loading ─────────────────────────────────────────────────────────

test('loadStability: reads the merged #238 authority', () => {
  const doc = loadStability(REPO_ROOT)
  assert.equal(doc.id, 'glm-pair-stability')
  assert.equal(doc.a1.tasks, 22)
  assert.equal(doc.a1.meanD, 6.2273)
})

test('loadStability: missing JSON is a hard error', () => {
  const root = tempRepo()
  assert.throws(() => loadStability(root), /missing benchmark\/results\/glm-pair-stability\.json/)
})

test('loadStability: wrong schemaVersion rejected', () => {
  const root = tempRepo()
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(fixtureDoc({ schemaVersion: 2 })))
  assert.throws(() => loadStability(root), /schemaVersion must be 1/)
})

test('loadStability: wrong id rejected', () => {
  const root = tempRepo()
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(fixtureDoc({ id: 'something-else' })))
  assert.throws(() => loadStability(root), /id must be glm-pair-stability/)
})

test('loadStability: missing a1 rejected', () => {
  const root = tempRepo()
  const doc = fixtureDoc()
  delete doc.a1
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(doc))
  assert.throws(() => loadStability(root), /missing a1/)
})

test('loadStability: missing a2 rejected', () => {
  const root = tempRepo()
  const doc = fixtureDoc()
  delete doc.a2
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(doc))
  assert.throws(() => loadStability(root), /missing a2/)
})

test('loadStability: non-numeric meanD rejected', () => {
  const root = tempRepo()
  const doc = fixtureDoc()
  doc.a1.meanD = 'six'
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(doc))
  assert.throws(() => loadStability(root), /a1\.meanD must be a number/)
})

test('loadStability: malformed CI rejected', () => {
  const root = tempRepo()
  const doc = fixtureDoc()
  doc.a1.bootstrapCi95 = [1]
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(doc))
  assert.throws(() => loadStability(root), /bootstrapCi95/)
})

test('loadStability: missing leave-one-out endpoints rejected', () => {
  const root = tempRepo()
  const doc = fixtureDoc()
  doc.a1.leaveOneOut = { min: { task: 'x', meanD: 1 } }
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(doc))
  assert.throws(() => loadStability(root), /leaveOneOut/)
})

// ── input-hash gate ───────────────────────────────────────────────────────────

test('verifyInputHashes: real authority hashes match the working tree', () => {
  const doc = loadStability(REPO_ROOT)
  assert.equal(verifyInputHashes(REPO_ROOT, doc), true)
})

test('verifyInputHashes: empty input list verifies', () => {
  assert.equal(verifyInputHashes(REPO_ROOT, { inputs: [] }), true)
})

test('verifyInputHashes: drifted input is rejected', () => {
  const root = tempRepo()
  const inputPath = 'benchmark/results/paired-effect-stats.json'
  writeFileSync(join(root, inputPath), '{"original":true}')
  const doc = fixtureDoc({ inputs: [{ path: inputPath, sha256: 'a'.repeat(64) }] })
  writeFileSync(join(root, INPUT_PATH), JSON.stringify(doc))
  assert.throws(() => verifyInputHashes(root, doc), /input hash mismatch/)
})

test('verifyInputHashes: missing input file is rejected', () => {
  const doc = fixtureDoc({ inputs: [{ path: 'benchmark/results/nope.json', sha256: 'a'.repeat(64) }] })
  assert.throws(() => verifyInputHashes(REPO_ROOT, doc), /missing input/)
})

test('verifyInputHashes: malformed entry is rejected', () => {
  assert.throws(() => verifyInputHashes(REPO_ROOT, { inputs: [{ path: 'x' }] }), /without path\/sha256/)
})

// ── rendering ─────────────────────────────────────────────────────────────────

test('renderTable: renders the direct contrast and its interval', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /Direct between-group contrast \$\\bar d_t\$ & \+6\.23/)
  assert.match(tex, /95\\% task-bootstrap CI & \[\+\d\.\d\d, \+\d+\.\d\d\]/)
  assert.match(tex, /\[\[?\+2\.59, \+10\.05\]?\]|\[\+2\.59, \+10\.05\]/)
})

test('renderTable: renders the leave-one-out range', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /leave-one-task-out range & \[\+\d\.\d\d, \+\d\.\d\d\]/)
  assert.match(tex, /\[\+5\.33, \+7\.00\]/)
})

test('renderTable: names the upward and downward influence tasks', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /largest upward \/ downward influence & S4-legacy-client-imports \/ S11-mermaid-lazyload-trap/)
})

test('renderTable: renders both groups median-across-repeats and mean-across-repeats', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /glm-5\.3-flash mean paired \$\\Delta\$ \(median-across-repeats\) & \+9\.27/)
  assert.match(tex, /mean-across-repeats sensitivity & \+8\.32/)
  assert.match(tex, /glm-5\.2 mean paired \$\\Delta\$ \(median-across-repeats\) & \+3\.05/)
  assert.match(tex, /mean-across-repeats sensitivity & \+2\.73/)
})

test('renderTable: renders the three round deltas per group', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /rounds 1 \/ 2 \/ 3 & \+6\.32 \/ \+8\.82 \/ \+9\.82/)
  assert.match(tex, /rounds 1 \/ 2 \/ 3 & \+1\.55 \/ \+1\.64 \/ \+5\.00/)
})

test('renderTable: median-of-task-deltas statistic kept visible (ties are not hidden)', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /median-of-task-deltas statistic & 0\.00/)
})

test('renderTable: null Spearman renders the placeholder, not a number', () => {
  const doc = fixtureDoc()
  doc.a2.baselineVsGainSpearman = {}
  const tex = renderTable(doc)
  assert.match(tex, /glm-5\.3-flash & --/)
  assert.match(tex, /glm-5\.2 & --/)
})

test('renderTable: caption states exploratory and the ceiling caveat', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /retrospective, exploratory/)
  assert.match(tex, /partly\s+mechanical/)
  assert.match(tex, /not as a ceiling mechanism/)
})

test('renderTable: caption states the shared pool is not a controlled comparison', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /Sharing a task pool does not make the two executions a controlled comparison/)
})

test('renderTable: caption escapes underscores in the source path', () => {
  const tex = renderTable(fixtureDoc())
  assert.match(tex, /\\texttt\{benchmark\/results\/glm-pair-stability\.json\}/)
  assert.doesNotMatch(tex, /\\texttt\{[^}]*_/)
})

test('renderTable: label is stable for the paper cross-reference', () => {
  assert.match(renderTable(fixtureDoc()), /\\label\{tab:glm-robustness\}/)
})

test('renderTable: contains no timestamps or host paths', () => {
  const tex = renderTable(fixtureDoc())
  assert.doesNotMatch(tex, /\b(19|20)\d{2}-\d{2}-\d{2}\b/)
  assert.doesNotMatch(tex, /\/Users\/|\/home\//)
})

test('renderTable: is deterministic', () => {
  assert.equal(renderTable(fixtureDoc()), renderTable(fixtureDoc()))
})

test('influenceFromLeaveOneOut: removal that lowers the contrast is upward influence', () => {
  const { upward, downward } = influenceFromLeaveOneOut(
    { min: { task: 'up', meanD: 5.3333 }, max: { task: 'down', meanD: 7 } },
    6.2273,
  )
  assert.equal(upward, 'up')
  assert.equal(downward, 'down')
})

test('influenceFromLeaveOneOut: missing endpoints degrade to placeholder', () => {
  const { range } = influenceFromLeaveOneOut(undefined, 6)
  assert.equal(range, '--')
})

// ── generation / drift ────────────────────────────────────────────────────────

test('generate: --check passes against the committed table', () => {
  const result = generate(REPO_ROOT, { check: true })
  assert.equal(result.wrote, false)
  assert.match(result.rendered, /tab:glm-robustness/)
})

test('generate: --check fails when the committed table drifts', () => {
  const root = tempRepo()
  materializeAuthority(root)
  writeFileSync(join(root, OUTPUT_PATH), '% drifted\n')
  assert.throws(() => generate(root, { check: true }), /out of date/)
})

test('generate: --check fails when the table is missing', () => {
  const root = tempRepo()
  materializeAuthority(root)
  assert.throws(() => generate(root, { check: true }), /is missing/)
})

test('generate: write mode creates a byte-identical table', () => {
  const root = tempRepo()
  materializeAuthority(root)
  const result = generate(root, { check: false })
  assert.equal(result.wrote, true)
  assert.equal(readFileSync(join(root, OUTPUT_PATH), 'utf8'), result.rendered)
  assert.equal(readFileSync(join(root, OUTPUT_PATH), 'utf8'), readFileSync(join(REPO_ROOT, OUTPUT_PATH), 'utf8'))
})

test('generate: refuses to render when an input hash drifted', () => {
  const root = tempRepo()
  const doc = materializeAuthority(root)
  // tamper with one consumed input AFTER materialization: its recorded hash no
  // longer matches, so the generator must refuse rather than render stale data
  const first = doc.inputs[0].path
  writeFileSync(join(root, first), readFileSync(join(root, first), 'utf8') + ' ')
  assert.throws(() => generate(root, { check: false }), /input drift/)
})

test('INPUT_PATH pins the merged #238 authority consumed by the paper table', () => {
  assert.equal(INPUT_PATH, 'benchmark/results/glm-pair-stability.json')
  assert.equal(OUTPUT_PATH, 'paper/generated/glm-robustness-table.tex')
})

test('paper GLM-robustness text acknowledges the glm-5.3 run and qualifies its claims', () => {
  const paper = readFileSync(join(REPO_ROOT, 'paper/latex/acl_latex.tex'), 'utf8')
  const start = paper.indexOf('\\label{sec:glm-robustness}')
  const end = paper.indexOf('\\input{../generated/glm-robustness-table.tex}')
  assert.ok(start > 0 && end > start, 'GLM robustness subsection present')
  const section = paper.slice(start, end)
  // The flash vs glm-5.2 pair is no longer the only within-family S1–S22 comparison.
  assert.doesNotMatch(section, /only within-family comparison/)
  assert.match(section, /glm-5\.3 run on the same pool/)
  assert.match(section, /\+1\.59/)
  assert.match(section, /mixed-judge/)
  // 3 of 22 glm-5.2 tasks used keyword judges, so "same-family" is qualified.
  assert.match(section, /19 of the 22 glm-5\.2 tasks/)
  // The mean-reduced contrast is a point estimate with no interval.
  assert.match(section, /\+5\.59/)
  assert.match(section, /point estimate only/)
})
