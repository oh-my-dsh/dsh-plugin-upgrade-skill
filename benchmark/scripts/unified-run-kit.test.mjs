// Tests for the unified GLM-5.3-Flash run kit: stratified selection, schedule
// generation and paired analysis. Pure functions only — no Docker, Harbor or
// network. Determinism is asserted against the fixed seeds.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inventoryPool, drawSixteen, buildSelectionDoc, SELECTION_SEED, DRAW_SIZE } from './select-unified-sixteen.mjs'
import { buildSchedule, harborJobConfig, SCHEDULE_SEED } from './generate-unified-run-schedule.mjs'
import { analyze, HISTORICAL_ROUND1_REF } from './analyze-unified-paired.mjs'
import { aggregate } from './grade-unified-run.mjs'

test('inventory pool covers exactly the 22 static tasks', () => {
  const pool = inventoryPool()
  assert.equal(pool.length, 22)
  for (const entry of pool) {
    assert.match(entry.task, /^S\d+-/)
    assert.ok(['small', 'medium', 'large'].includes(entry.lengthTercile))
    assert.ok(entry.fixtureBytes > 0)
  }
  const tercileCounts = Object.entries(
    Object.groupBy(pool, (entry) => entry.lengthTercile),
  ).map(([key, members]) => [key, members.length])
  assert.deepEqual(tercileCounts.sort((a, b) => a[0].localeCompare(b[0])), [['large', 7], ['medium', 8], ['small', 7]].sort((a, b) => a[0].localeCompare(b[0])))
})

test('draw is deterministic and respects quotas and balance constraints', () => {
  const first = drawSixteen(inventoryPool(), SELECTION_SEED)
  const second = drawSixteen(inventoryPool(), SELECTION_SEED)
  assert.deepEqual(first, second)
  assert.equal(first.selection.length, DRAW_SIZE)
  assert.equal(first.excluded.length, 22 - DRAW_SIZE)
  assert.ok(first.constraints.hard >= 2, 'at least 2 hard tasks')
  assert.ok(first.constraints.chinese >= 2, 'at least 2 chinese-prompt tasks')
  assert.ok(first.constraints.large >= 2, 'at least 2 large-fixture tasks')
  // Stratum quotas stay intact after any constraint repair swaps: every
  // selected task's stratum is a real pool stratum and counts never exceed it.
  const pool = inventoryPool()
  const poolCounts = new Map()
  for (const entry of pool) {
    const key = `${entry.family}|${entry.lengthTercile}`
    poolCounts.set(key, (poolCounts.get(key) ?? 0) + 1)
  }
  const selectedCounts = new Map()
  for (const entry of first.selection) {
    const key = `${entry.family}|${entry.lengthTercile}`
    selectedCounts.set(key, (selectedCounts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of selectedCounts) {
    assert.ok(count <= poolCounts.get(key), `stratum ${key} over-drawn`)
  }
  assert.equal([...selectedCounts.values()].reduce((a, b) => a + b, 0), DRAW_SIZE)
})

test('selection doc is outcome-blind by construction fields', () => {
  const doc = buildSelectionDoc()
  assert.equal(doc.schemaVersion, 'unified-sixteen-selection-v1')
  assert.equal(doc.plannedTrials, 64)
  assert.match(doc.blindness, /no score artifact/)
})

test('schedule yields 64 balanced cells with ABBA arm alternation', () => {
  const schedule = buildSchedule(SCHEDULE_SEED)
  assert.equal(schedule.totalTrials, 64)
  assert.deepEqual(schedule.armLedger, { noSkill: 32, withSkill: 32 })
  const perTask = new Map()
  for (const cell of schedule.cells) {
    const key = `${cell.task}|${cell.arm}`
    perTask.set(key, (perTask.get(key) ?? 0) + 1)
  }
  assert.deepEqual([...perTask.values()], Array(32).fill(2))
  const armsInOrder = schedule.jobs.map((job) => job.arm)
  // Round 1 leads no-skill, round 2 reverses: no arm is systematically first.
  assert.deepEqual(armsInOrder.slice(0, 4), ['no-skill', 'with-skill', 'no-skill', 'with-skill'])
  assert.deepEqual(armsInOrder.slice(4), ['with-skill', 'no-skill', 'with-skill', 'no-skill'])
  assert.equal(new Set(schedule.cells.map((cell) => `${cell.task}|${cell.arm}|${cell.repeat}`)).size, 64)
})

test('harbor configs mount the skill only in the with-skill arm', () => {
  const schedule = buildSchedule(SCHEDULE_SEED)
  const withSkill = JSON.parse(JSON.stringify(harborJobConfig(schedule, 'r1-withskill-a')))
  const noSkill = JSON.parse(JSON.stringify(harborJobConfig(schedule, 'r1-noskill-a')))
  assert.equal(withSkill.agents[0].skills.length, 1)
  assert.match(withSkill.agents[0].skills[0], /skills\/plugin-upgrade$/)
  assert.equal(noSkill.agents[0].skills.length, 0)
  assert.equal(noSkill.extra_instructions.length, 1)
  assert.match(noSkill.extra_instructions[0], /literal zero-skill evaluation/)
  assert.equal(withSkill.extra_instructions.length, 0)
  for (const config of [withSkill, noSkill]) {
    assert.equal(config.agents[0].model_name, 'anthropic/glm-5.3-flash')
    assert.equal(config.n_attempts, 1)
  }
})

test('analysis computes paired estimands with repeat-mean aggregation', () => {
  const aggregate = {
    run: 'test',
    model: 'glm-5.3-flash',
    rows: [
      { task: 'S1-static-scan', noskill: 75, skill: 75, noskillCells: [50, 100], skillCells: [75, 75], unscoredCells: 0 },
      { task: 'S2-negative-scan', noskill: 100, skill: 100, noskillCells: [100, 100], skillCells: [100, 100], unscoredCells: 0 },
      { task: 'S5-negative-naming', noskill: 50, skill: 75, noskillCells: [50, 50], skillCells: [75, 75], unscoredCells: 0 },
      { task: 'S6-corridor-net-state', noskill: 25, skill: 75, noskillCells: [25, 25], skillCells: [75, 75], unscoredCells: 0 },
    ],
  }
  const doc = analyze(aggregate)
  assert.equal(doc.gradedTasks, 4)
  assert.equal(doc.meanDelta, 18.75) // (0 + 0 + 25 + 50) / 4
  assert.equal(doc.saturatedTasks, 1)
  assert.equal(doc.floorTasks, 0)
  assert.ok(doc.bootstrap.ci95[0] <= doc.meanDelta && doc.meanDelta <= doc.bootstrap.ci95[1])
  assert.equal(doc.perTask[0].historicalDeltaRef, -25)
  assert.equal(doc.historicalReference.overlappingTasks, 4)
})

test('aggregate averages repeats per arm and keeps unscored cells visible', () => {
  const schedule = buildSchedule(SCHEDULE_SEED)
  // Synthetic two-task slice: patch a copy of the schedule's cells.
  const slice = {
    ...schedule,
    cells: [
      { task: 'S2-negative-scan', arm: 'no-skill', repeat: 1, job: 'j' },
      { task: 'S2-negative-scan', arm: 'no-skill', repeat: 2, job: 'j' },
      { task: 'S2-negative-scan', arm: 'with-skill', repeat: 1, job: 'j' },
      { task: 'S2-negative-scan', arm: 'with-skill', repeat: 2, job: 'j' },
      { task: 'S5-negative-naming', arm: 'no-skill', repeat: 1, job: 'j' },
      { task: 'S5-negative-naming', arm: 'no-skill', repeat: 2, job: 'j' },
      { task: 'S5-negative-naming', arm: 'with-skill', repeat: 1, job: 'j' },
      { task: 'S5-negative-naming', arm: 'with-skill', repeat: 2, job: 'j' },
    ],
  }
  const dir = mkdtempSync(join(tmpdir(), 'unified-aggregate-'))
  try {
    const writeScore = (task, arm, repeat, score) => {
      mkdirSync(join(dir, 'scores'), { recursive: true })
      writeFileSync(join(dir, 'scores', `${task}__${arm}__r${repeat}.json`), JSON.stringify({ task, arm, repeat, score }))
    }
    writeScore('S2-negative-scan', 'no-skill', 1, 100)
    writeScore('S2-negative-scan', 'no-skill', 2, 100)
    writeScore('S2-negative-scan', 'with-skill', 1, 100)
    writeScore('S2-negative-scan', 'with-skill', 2, 100)
    writeScore('S5-negative-naming', 'no-skill', 1, 60)
    // r2 missing → unscored cell; with-skill r1 infrastructure-error null, r2 90.
    writeScore('S5-negative-naming', 'with-skill', 1, null)
    writeScore('S5-negative-naming', 'with-skill', 2, 90)
    const doc = aggregate(slice, dir)
    assert.equal(doc.totalCells, 8)
    assert.equal(doc.gradedCells, 6)
    const s2 = doc.rows.find((row) => row.task === 'S2-negative-scan')
    assert.equal(s2.noskill, 100)
    assert.equal(s2.skill, 100)
    const s5 = doc.rows.find((row) => row.task === 'S5-negative-naming')
    assert.equal(s5.noskill, 60) // single scored repeat
    assert.equal(s5.skill, 90) // null cell excluded from the mean, not zeroed
    assert.equal(s5.unscoredCells, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('historical reference table matches the committed round-1 totals', () => {
  const totals = Object.values(HISTORICAL_ROUND1_REF.perTask)
  const noSkill = totals.reduce((acc, entry) => acc + entry.noskill, 0)
  const skill = totals.reduce((acc, entry) => acc + entry.skill, 0)
  assert.equal(noSkill, 1716)
  assert.equal(skill, 1855)
  assert.equal(Object.keys(HISTORICAL_ROUND1_REF.perTask).length, 22)
})

// Regression: a correction for one legacy run must never relabel future judges.
import { correctLegacyJudgeModel } from './collect-unified-run-cells.mjs'

test('legacy judge correction is restricted to the affected run and malformed identity', () => {
  const run = '2026-09-15-glm-5.3-flash-unified-s16'
  const broken = { judgeModel: 'apply', judgeTransport: 'zcode-subagent-v1', score: 55 }
  assert.equal(correctLegacyJudgeModel(broken, run).judgeModel, 'GLM-5.3-Flash')
  assert.equal(broken.judgeModel, 'apply')
  assert.deepEqual(correctLegacyJudgeModel(broken, 'future-run'), broken)
  const valid = { ...broken, judgeModel: 'external-judge' }
  assert.deepEqual(correctLegacyJudgeModel(valid, run), valid)
  const other = { ...broken, judgeTransport: 'http' }
  assert.deepEqual(correctLegacyJudgeModel(other, run), other)
})

test('committed configs are portable; execution configs resolve local mount paths', () => {
  const schedule = buildSchedule()
  const portable = harborJobConfig(schedule, 'r1-withskill-a')
  assert.equal(portable.agents[0].skills[0], '<repo-root>/skills/plugin-upgrade')
  const local = harborJobConfig(schedule, 'r1-withskill-a', { localPaths: true })
  assert.ok(local.agents[0].skills[0].startsWith('/'))
  assert.ok(!local.agents[0].skills[0].includes('<repo-root>'))
  assert.deepEqual(harborJobConfig(schedule, 'r1-noskill-a', { localPaths: true }).agents[0].skills, [])
})
