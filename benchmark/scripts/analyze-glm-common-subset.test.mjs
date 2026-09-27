// benchmark/scripts/analyze-glm-common-subset.test.mjs
//
// Golden check: the A2 common-subset / headroom analysis reproduces its committed
// numbers from the committed inputs. No network, no Docker.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { analyze, median3, bootstrapMeanDelta, renderMarkdown } from './analyze-glm-common-subset.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

test('median3 returns the middle order statistic', () => {
  assert.equal(median3([5, 1, 9]), 5)
  assert.equal(median3([0, 100, 50]), 50)
})

test('bootstrapMeanDelta is deterministic under the fixed seed', () => {
  const a = bootstrapMeanDelta([1, 2, 3, 4], { replicates: 500 })
  const b = bootstrapMeanDelta([1, 2, 3, 4], { replicates: 500 })
  assert.deepEqual(a, b)
  assert.ok(Math.abs(a.mean - 2.5) < 1e-9)
})

test('analyze: common subset is the full 22-task pool for all three GLM configs', () => {
  const r = analyze(repoRoot)
  assert.equal(r.tasks, 22)
  for (const name of Object.keys(r.configs)) {
    assert.ok(r.configs[name].deltasByTask.length === 22, name)
  }
})

test('analyze: headroom shares and gain gaps match the committed record', () => {
  const r = analyze(repoRoot)
  assert.equal(r.configs['glm-5.3-flash'].meanDelta.toFixed(2), '9.27')
  assert.equal(r.configs['glm-5.2'].meanDelta.toFixed(2), '3.05')
  assert.equal(r.configs['glm-5.3'].meanDelta.toFixed(2), '3.52')
  assert.equal(r.gainGaps.flash_minus_5_2.mean.toFixed(2), '6.23')
  assert.deepEqual(r.gainGaps.flash_minus_5_2.lo.toFixed(2), '2.59')
  assert.equal(r.gainGaps.flash_minus_5_3_std.mean.toFixed(2), '5.75')
})

test('renderMarkdown includes the disclosures', () => {
  const md = renderMarkdown(analyze(repoRoot))
  assert.ok(md.includes('Common subset'))
  assert.ok(md.includes('Event-family limitation'))
})
