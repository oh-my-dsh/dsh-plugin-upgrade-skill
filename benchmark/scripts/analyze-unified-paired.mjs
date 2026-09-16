// Paired analysis for the unified GLM-5.3-Flash two-arm run: per-task arm
// means from aggregate.json, then Δ = mean(with-skill − no-skill) with a
// task-level bootstrap CI and a Wilcoxon signed-rank check, following the
// estimands in paper/INVERTED-U-WORKPLAN.zh.md §主要分析.
//
// The historical 2026-09-11 GLM-5.3-Flash round is reported alongside as a
// descriptive reference only: its 12 semantic tasks were scored in a different
// rubric era, so the two tables are not mixable and no inference is attached.
//
// Usage: node benchmark/scripts/analyze-unified-paired.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pairedBootstrap, wilcoxonSignedRank, mean, median, round4 } from './measure-paired-effect.mjs'

export const RUN_DIR = `benchmark/results/artifacts/${process.env.UNIFIED_RUN_DIR ?? '2026-09-15-glm-5.3-flash-unified-s16'}`
export const ANALYSIS_SEED = 20260915
export const BOOTSTRAP_REPLICATES = 10000
export const HISTORICAL_ROUND1_REF = {
  report: 'benchmark/results/validation-report-2026-09-11-glm-5.3-flash-s1-s22.md',
  commit: 'f32175d',
  caveat: 'mixed scoring era (12 semantic tasks self-judged by GLM); descriptive reference only, not mixable with the unified table',
  perTask: {
    'S1-static-scan': { noskill: 100, skill: 75 },
    'S10-paste-rename-and-version-chip': { noskill: 100, skill: 100 },
    'S11-mermaid-lazyload-trap': { noskill: 80, skill: 100 },
    'S12-global-upgrade-ebusy-trap': { noskill: 100, skill: 100 },
    'S13-peer-range-vs-runtime': { noskill: 80, skill: 100 },
    'S14-link-install-lock-trap': { noskill: 100, skill: 100 },
    'S15-slot-error-boundary-crash': { noskill: 100, skill: 100 },
    'S16-self-host-upgrade-trap': { noskill: 80, skill: 100 },
    'S17-external-ui-plugin-onboarding-trap': { noskill: 20, skill: 40 },
    'S18-terminal-sprite-render-trap': { noskill: 60, skill: 20 },
    'S19-phantom-update-stale-host': { noskill: 0, skill: 0 },
    'S2-negative-scan': { noskill: 100, skill: 100 },
    'S20-msvc-flock-trap': { noskill: 95, skill: 100 },
    'S21-resource-service-unavailable-trap': { noskill: 60, skill: 60 },
    'S22-duplicate-insert-boot-crash-trap': { noskill: 60, skill: 60 },
    'S3-snapshot-migration': { noskill: 90, skill: 100 },
    'S4-legacy-client-imports': { noskill: 38, skill: 100 },
    'S5-negative-naming': { noskill: 88, skill: 100 },
    'S6-corridor-net-state': { noskill: 75, skill: 100 },
    'S7-unpublished-cohort': { noskill: 100, skill: 100 },
    'S8-release-routing-trap': { noskill: 90, skill: 100 },
    'S9-composer-coordinate-trap': { noskill: 100, skill: 100 },
  },
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function historicalDeltasFor(tasks) {
  const rows = []
  for (const task of tasks) {
    const ref = HISTORICAL_ROUND1_REF.perTask[task]
    if (ref) rows.push({ task, delta: round4(ref.skill - ref.noskill) })
  }
  return rows
}

export function analyze(aggregate) {
  const gradedRows = aggregate.rows.filter((row) => Number.isFinite(row.noskill) && Number.isFinite(row.skill))
  const unscoredTasks = aggregate.rows.length - gradedRows.length
  const deltas = gradedRows.map((row) => round4(row.skill - row.noskill))
  const boot = pairedBootstrap(deltas, { replicates: BOOTSTRAP_REPLICATES, seed: ANALYSIS_SEED })
  const wilcoxon = wilcoxonSignedRank(deltas)
  const saturated = gradedRows.filter((row) => row.noskill === 100 && row.skill === 100).length
  const floorDropped = gradedRows.filter((row) => row.noskill === 0 && row.skill === 0).length
  const historicalOverlapping = historicalDeltasFor(gradedRows.map((row) => row.task))
  return {
    schemaVersion: 'unified-paired-analysis-v1',
    run: aggregate.run,
    model: aggregate.model,
    estimand: 'per-task equal-weight mean of (with-skill − no-skill), arm means first average the two repeats',
    gradedTasks: gradedRows.length,
    unscoredTasks,
    unscoredCells: aggregate.rows.reduce((acc, row) => acc + (row.unscoredCells ?? 0), 0),
    meanNoSkill: round4(mean(gradedRows.map((row) => row.noskill))),
    meanWithSkill: round4(mean(gradedRows.map((row) => row.skill))),
    meanDelta: round4(mean(deltas)),
    medianDelta: round4(median(deltas)),
    positiveDeltas: deltas.filter((delta) => delta > 0).length,
    negativeDeltas: deltas.filter((delta) => delta < 0).length,
    saturatedTasks: saturated,
    floorTasks: floorDropped,
    bootstrap: { replicates: BOOTSTRAP_REPLICATES, seed: ANALYSIS_SEED, ci95: boot.ci95 },
    wilcoxon,
    perTask: gradedRows.map((row) => ({
      task: row.task,
      noskill: row.noskill,
      skill: row.skill,
      delta: round4(row.skill - row.noskill),
      noskillCells: row.noskillCells,
      skillCells: row.skillCells,
      historicalDeltaRef: HISTORICAL_ROUND1_REF.perTask[row.task]
        ? round4(HISTORICAL_ROUND1_REF.perTask[row.task].skill - HISTORICAL_ROUND1_REF.perTask[row.task].noskill)
        : null,
    })),
    historicalReference: {
      ...HISTORICAL_ROUND1_REF,
      meanDelta: round4(mean(historicalOverlapping.map((row) => row.delta))),
      overlappingTasks: historicalOverlapping.length,
    },
    interpretationContract: [
      'retrospective exploratory analysis, not a pre-registered confirmatory test',
      'the historical column is a descriptive reference only; scoring eras differ',
      'no capability-gradient claim: single configuration, two arms',
    ],
  }
}

function renderMarkdown(doc) {
  const lines = [
    `# Unified two-arm paired analysis — ${doc.model}`,
    '',
    `Graded tasks: ${doc.gradedTasks} (unscored tasks: ${doc.unscoredTasks}, unscored cells: ${doc.unscoredCells}).`,
    `Mean no-skill ${doc.meanNoSkill}, mean with-skill ${doc.meanWithSkill}.`,
    `**Mean Δ = ${doc.meanDelta}** (median ${doc.medianDelta}), 95% bootstrap CI [${doc.bootstrap.ci95[0]}, ${doc.bootstrap.ci95[1]}] (${doc.bootstrap.replicates} replicates, seed ${doc.bootstrap.seed}).`,
    `Positive/negative/saturated/floor tasks: ${doc.positiveDeltas}/${doc.negativeDeltas}/${doc.saturatedTasks}/${doc.floorTasks}. Wilcoxon: n=${doc.wilcoxon.n}, p two-sided=${doc.wilcoxon.pTwoSided}.`,
    '',
    `Historical reference (overlapping ${doc.historicalReference.overlappingTasks} tasks, mean Δ ${doc.historicalReference.meanDelta}): ${doc.historicalReference.caveat}.`,
    '',
    '| Task | no-skill | with-skill | Δ (unified) | Δ (hist. ref) |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...doc.perTask.map((row) => `| ${row.task} | ${row.noskill} | ${row.skill} | ${row.delta > 0 ? '+' : ''}${row.delta} | ${row.historicalDeltaRef === null ? '—' : `${row.historicalDeltaRef > 0 ? '+' : ''}${row.historicalDeltaRef}`} |`),
    '',
    ...doc.interpretationContract.map((line) => `- ${line}`),
    '',
  ]
  return lines.join('\n')
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const aggregate = JSON.parse(readFileSync(`${repoRoot}/${RUN_DIR}/aggregate.json`, 'utf8'))
  const doc = analyze(aggregate)
  writeFileSync(`${repoRoot}/${RUN_DIR}/paired-analysis.json`, JSON.stringify(doc, null, 2) + '\n')
  writeFileSync(`${repoRoot}/${RUN_DIR}/paired-analysis.md`, renderMarkdown(doc))
  console.log(`mean Δ ${doc.meanDelta}, CI95 [${doc.bootstrap.ci95[0]}, ${doc.bootstrap.ci95[1]}], wilcoxon p=${doc.wilcoxon.pTwoSided}`)
  console.log(`wrote paired-analysis.json / paired-analysis.md in ${RUN_DIR}`)
}
