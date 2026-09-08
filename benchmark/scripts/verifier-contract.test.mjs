import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { runVerifier } from './verifier-test-support.mjs'
const tasks = fileURLToPath(new URL('../tasks/', import.meta.url))
const print = packet => `console.log(${JSON.stringify(JSON.stringify(packet))})`
const bad = [
  ['judge exit', `${print({ score: 100, max: 100 })}; process.exit(7)`],
  ['missing JSON', 'console.log("diagnostic only")'],
  ['malformed last packet', `${print({ score: 100, max: 100 })}; console.log('{"score":')`],
  ['trailing stdout log', `${print({ score: 100, max: 100 })}; console.log('late log')`],
  ['NaN', 'console.log(JSON.stringify({score:NaN,max:100}))'],
  ['Infinity', 'console.log(JSON.stringify({score:Infinity,max:100}))'],
  ...[null, '0', -1, 101].map(score => [`invalid score ${score}`, print({ score, max: 100 })]),
  ...[undefined, null, 0, -1, '100'].map(max => [`invalid max ${max}`, print({ score: 0, max })]),
  ['infinite max', 'console.log(\'{"score":0,"max":1e999}\')'],
  ['malformed reasons', print({ score: 0, max: 100, reasons: 'oops' })],
  ['legacy judge error', print({ score: 0, max: 100, reasons: ['judge error: missing verifier dependency'] })],
  ['explicit error', print({ status: 'verifier_error', error: { message: 'broken verifier' } })],
]
for (const [name, source] of bad) test(`verifier rejects ${name} without reward`, () => {
  const result = runVerifier(source)
  assert.notEqual(result.status, 0, result.stdout)
  assert.equal(result.files['reward.txt'], undefined)
  assert.equal(result.files['reward.json'], undefined)
  assert.equal(result.files['grading.json'], undefined)
  const error = JSON.parse(result.files['verifier-error.json'])
  assert.equal(error.status, 'verifier_error')
  assert.equal(typeof error.code, 'string')
  assert.equal(typeof error.message, 'string')
})
for (const reasons of [[], ['no report'], ['fixture unchanged'], ['candidate runtime failed']]) test(`valid zero remains zero: ${reasons}`, () => {
  const packet = { score: 0, max: 10, reasons }
  const result = runVerifier(print(packet))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.files['reward.txt'], '0\n')
  assert.deepEqual(JSON.parse(result.files['grading.json']), packet)
  assert.equal(result.files['verifier-error.json'], undefined)
})
test('normalizes by declared max and tolerates preceding logs and stderr', () => {
  const packet = { score: 3, max: 4, reasons: [], checkpoints: [{ id: 'x' }] }
  const result = runVerifier(`console.log('diagnostic'); ${print(packet)}; console.error('stderr after packet')`)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.files['grading.json']), packet)
  assert.deepEqual(JSON.parse(result.files['reward.json']), { reward: 0.75 })
})
test('all 56 standalone wrappers and helper copies match the source', () => {
  const dirs = readdirSync(tasks).filter(name => existsSync(join(tasks, name, 'tests/test.sh')))
  assert.equal(dirs.length, 56)
  for (const task of dirs) for (const name of ['test.sh', 'verifier.mjs', 'judge-result.mjs']) {
    assert.equal(readFileSync(join(tasks, task, 'tests', name), 'utf8'), readFileSync(new URL(`./verifier/${name}`, import.meta.url), 'utf8'), `${task}/${name} drift`)
  }
})
test('emitError exits nonzero and ordinary emit preserves metadata', () => {
  const failed = runVerifier("import { emitError } from './judge-utils.mjs'; emitError(new Error('fixture gate unavailable'))")
  assert.notEqual(failed.status, 0)
  assert.match(failed.files['judge.out'], /fixture gate unavailable/)
  assert.equal(failed.files['reward.txt'], undefined)
  const passed = runVerifier("import { emit } from './judge-utils.mjs'; emit(25, [], {checkpoints:[{id:'check'}]})")
  assert.equal(passed.status, 0, passed.stderr)
  assert.deepEqual(JSON.parse(passed.files['grading.json']).checkpoints, [{ id: 'check' }])
})

test('emit preserves fractional scores and rejects invalid values', () => {
  const result = runVerifier("import { emit } from './judge-utils.mjs'; emit(95.25, [])")
  assert.equal(result.status, 0)
  assert.equal(JSON.parse(result.files['grading.json']).score, 95.25)
  for (const value of ['NaN', 'Infinity', '-1', '101']) {
    const bad = runVerifier(`import { emit } from './judge-utils.mjs'; emit(${value}, [])`)
    assert.notEqual(bad.status, 0)
    assert.equal(bad.files['reward.txt'], undefined)
  }
})
test('unavailable fixture baseline fails explicitly for generic and H21 helpers', () => {
  for (const task of ['S17-external-ui-plugin-onboarding-trap', 'H21-question-answerer-waterfall']) {
    const result = runVerifier("import { fixtureChanges, emit, emitError } from './judge-utils.mjs'; try { await fixtureChanges('/definitely/missing/fixture-baseline'); emit(0, ['fixture unchanged']) } catch (error) { emitError(error) }", task, { GIT_DIR: '/definitely/missing/git-directory' })
    assert.notEqual(result.status, 0, task)
    assert.match(result.files['judge.out'], /fixture baseline unavailable/)
    assert.equal(result.files['reward.txt'], undefined)
  }
})

test('emit terminates immediately before subsequent judge code', () => {
  const result = runVerifier("import { emit } from './judge-utils.mjs'; emit(0, []); console.log('must never run')")
  assert.equal(result.status, 0, result.stdout)
})

test('emitError terminates immediately before subsequent judge code', () => {
  const result = runVerifier("import { emitError } from './judge-utils.mjs'; emitError(new Error('broken')); console.log('must never run')")
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.files['judge.out'], /must never run/)
  assert.equal(result.files['reward.txt'], undefined)
})
test('every task wrapper executes independently for valid zero and judge failure', () => {
  for (const task of readdirSync(tasks).filter(name => existsSync(join(tasks, name, 'tests/test.sh')))) {
    const good = runVerifier(print({ score: 0, max: 100 }), task)
    assert.equal(good.status, 0, task)
    assert.equal(good.files['reward.txt'], '0\n', task)
    const bad = runVerifier('process.exit(7)', task)
    assert.notEqual(bad.status, 0, task)
    assert.equal(bad.files['reward.txt'], undefined, task)
    assert.equal(JSON.parse(bad.files['verifier-error.json']).exitCode, 7, task)
  }
})
test('emit does not default an explicitly invalid max to 100', () => {
  for (const max of ['null', 'undefined', '0', 'NaN', 'Infinity', "'100'"]) {
    const result = runVerifier(`import { emit } from './judge-utils.mjs'; emit(0, [], { max: ${max} })`)
    assert.notEqual(result.status, 0, `max=${max}`)
    assert.equal(result.files['reward.txt'], undefined)
  }
})
