import assert from 'node:assert/strict'
import { readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildWorkflowPlan, CAPABILITY_IDS, SELECTION_SCHEMA_VERSION, WORKFLOW_IDS } from '../../skills/plugin-workflow/scripts/plan-workflow.mjs'

const selection = (workflow, overrides = {}) => ({ schemaVersion: SELECTION_SCHEMA_VERSION, workflow, ...overrides })
const cases = [
  ['read-only health check', 'health-check', {}, ['plugin-workflow', 'plugin-upgrade']],
  ['installed version update', 'upgrade-target', {}, ['plugin-workflow', 'plugin-upgrade', 'plugin-test']],
  ['Web Client source migration', 'compatibility-migration', { surfaces: ['web-client'] }, ['plugin-workflow', 'dsh-upgrade-audit', 'plugin-upgrade', 'plugin-test']],
  ['new plugin lifecycle', 'full-lifecycle', { pluginState: 'new' }, ['plugin-workflow', 'dsh-upgrade-audit', 'plugin-upgrade', 'plugin-write', 'plugin-test', 'plugin-release']],
  ['runtime repair', 'runtime-debug', { surfaces: ['web-client'] }, ['plugin-workflow', 'plugin-runtime-debug', 'plugin-test', 'plugin-upgrade']],
  ['heavy dependency integration', 'heavy-dependency', { surfaces: ['web-client'] }, ['plugin-workflow', 'plugin-heavy-dep', 'plugin-test', 'plugin-upgrade', 'plugin-release']],
  ['explicit registry registration', 'naming-registry', { include: ['registry-register'] }, ['plugin-workflow', 'plugin-write']],
  ['explicit publication', 'package-release', { include: ['release'] }, ['plugin-workflow', 'plugin-test', 'plugin-release']],
  ['test-only scope', 'test-only', {}, ['plugin-workflow', 'plugin-test']],
]

for (const [name, workflow, options, owners] of cases) {
  test(`composition: ${name}`, () => {
    const plan = buildWorkflowPlan(selection(workflow, options))
    assert.deepEqual([...new Set(plan.ledger.map((phase) => phase.owner))].sort(), [...owners].sort())
    if (!options.include?.includes('release')) assert(!plan.ledger.some((phase) => phase.capability === 'release'))
    if (!options.include?.includes('registry-register')) assert(!plan.ledger.some((phase) => phase.capability === 'registry-register'))
    if (workflow === 'health-check') assert.deepEqual(plan.confirmations, [])
    if (workflow === 'test-only') assert(!plan.ledger.some((phase) => phase.confirmations.includes('repository-writes')))
  })
}

test('every installed Skill has an exercised phase owner; new Skills require coverage', () => {
  const root = fileURLToPath(new URL('../../skills/', import.meta.url))
  const installed = readdirSync(root).filter((name) => existsSync(`${root}/${name}/SKILL.md`)).sort()
  const exercised = new Set(cases.flatMap(([, workflow, options]) => buildWorkflowPlan(selection(workflow, options)).ledger.map((phase) => phase.owner)))
  assert.deepEqual([...exercised].sort(), installed)
})

test('all eight owners compose without duplicating phases or silently publishing', () => {
  const plan = buildWorkflowPlan(selection('full-lifecycle', {
    surfaces: ['web-client'], include: ['runtime-debug', 'heavy-dependency', 'registry-query'],
  }))
  assert.equal(new Set(plan.ledger.map((phase) => phase.owner)).size, 8)
  assert.equal(new Set(plan.ledger.map((phase) => phase.capability)).size, plan.ledger.length)
  assert(!plan.ledger.some((phase) => ['release', 'registry-register'].includes(phase.capability)))
  const index = (id) => plan.ledger.findIndex((phase) => phase.capability === id)
  assert(index('source-migration') < index('runtime-debug'))
  assert(index('runtime-debug') < index('heavy-dependency'))
  assert(index('heavy-dependency') < index('static-tests'))
  assert(index('static-tests') < index('package-artifact'))
})

test('Web-specific owners reject incompatible surfaces and missing proof', () => {
  for (const workflow of ['runtime-debug', 'heavy-dependency']) {
    assert.throws(() => buildWorkflowPlan(selection(workflow)), /requires surface web-client/)
    for (const excluded of [workflow, 'static-tests', 'functional-probe', 'browser-check', 'rollback']) {
      assert.throws(() => buildWorkflowPlan(selection(workflow, { surfaces: ['web-client'], exclude: [excluded] })), /requires excluded capability/)
    }
  }
})

test('pairwise capability combinations preserve ownership, scope, gates and order in every workflow', () => {
  // Pairwise coverage is cheap enough for every PR; it is not a model-use test.
  const before = [['naming-local', 'registry-query'], ['registry-query', 'registry-register'],
    ['static-tests', 'package-artifact'], ['package-artifact', 'release'], ['functional-probe', 'release'],
    ['rollback', 'release'], ['runtime-debug', 'static-tests'], ['heavy-dependency', 'static-tests']]
  for (const workflow of WORKFLOW_IDS) {
    for (let a = 0; a < CAPABILITY_IDS.length; a++) {
      for (let b = a + 1; b < CAPABILITY_IDS.length; b++) {
        const include = [CAPABILITY_IDS[a], CAPABILITY_IDS[b]]
        const plan = buildWorkflowPlan(selection(workflow, { include, surfaces: ['web-client'] }))
        const ids = plan.ledger.map((phase) => phase.capability)
        const context = `${workflow}: ${include.join(', ')}`
        assert.equal(new Set(ids).size, ids.length, context)
        for (const id of include) assert(ids.includes(id), context)
        for (const entry of plan.capabilities) assert.equal(ids.includes(entry.id), entry.selected, context)
        for (const [prerequisite, dependent] of before) {
          if (ids.includes(prerequisite) && ids.includes(dependent)) assert(ids.indexOf(prerequisite) < ids.indexOf(dependent), context)
        }
        if (!include.includes('release')) assert(!ids.includes('release'), context)
        if (!include.includes('registry-register')) assert(!ids.includes('registry-register'), context)
        assert(plan.confirmations.every((boundary) => boundary.granted === false), context)
        // An explicit exclusion must either be honored or fail on a required gate.
        try {
          const excluded = buildWorkflowPlan(selection(workflow, { include: [include[0]], exclude: [include[1]], surfaces: ['web-client'] }))
          assert(!excluded.ledger.some((phase) => phase.capability === include[1]), context)
        } catch (error) {
          assert.match(error.message, /requires excluded capability/, context)
        }
      }
    }
  }
})
