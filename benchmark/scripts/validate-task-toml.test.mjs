// benchmark/scripts/validate-task-toml.test.mjs
//
// Self-tests for the TOML string-syntax scanner. The H7 regression case is the
// anchor: the exact description string that shipped broken must fail, and the
// #105 fix must pass.
//
// Usage: node --test benchmark/scripts/validate-task-toml.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanTomlStrings, validateTaskTomls } from './validate-task-toml.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('H7 regression: the shipped broken description fails, the #105 fix passes', () => {
  const broken = 'description = "display text (/session\\s*log/i) anchor"\n'
  const fixed = 'description = "display text (/session\\\\s*log/i) anchor"\n'
  const brokenFailures = scanTomlStrings(broken)
  assert.equal(brokenFailures.length, 1)
  assert.match(brokenFailures[0].message, /invalid escape "\\s"/)
  assert.deepEqual(scanTomlStrings(fixed), [])
})

test('all valid TOML 1.0 escapes are accepted', () => {
  const doc =
    'a = "\\b\\t\\n\\f\\r\\"\\\\"\n' +
    'b = "\\u0041\\U0001F600"\n'
  assert.deepEqual(scanTomlStrings(doc), [])
})

test('TOML 1.1-only escapes are rejected (Harbor parses with tomllib / TOML 1.0)', () => {
  const failures = scanTomlStrings('a = "\\e\\x41"\n')
  assert.equal(failures.length, 2)
  assert.match(failures[0].message, /invalid escape "\\e"/)
  assert.match(failures[1].message, /invalid escape "\\x"/)
})

test('malformed hex escapes are reported', () => {
  const failures = scanTomlStrings('a = "\\u12"\n')
  assert.equal(failures.length, 1)
  assert.match(failures[0].message, /malformed \\u escape/)
})

test('literal strings and comments never produce escape failures', () => {
  const doc =
    "a = '/session\\s*log/i'\n" +
    'b = 1 # comment with "\\s" and an unmatched quote "\n' +
    "c = '''raw \\d block'''\n"
  assert.deepEqual(scanTomlStrings(doc), [])
})

test('multiline basic strings allow line-ending backslash but not bad escapes', () => {
  const ok = 'a = """line one \\\n  line two"""\n'
  assert.deepEqual(scanTomlStrings(ok), [])
  const bad = 'a = """regex \\d here"""\n'
  const failures = scanTomlStrings(bad)
  assert.equal(failures.length, 1)
  assert.match(failures[0].message, /invalid escape "\\d"/)
})

test('unterminated single-line strings are reported with the opening line', () => {
  const failures = scanTomlStrings('a = "no closing quote\nb = 1\n')
  assert.equal(failures.length, 1)
  assert.equal(failures[0].line, 1)
  assert.match(failures[0].message, /unterminated basic string/)
})

test('the real benchmark/tasks tree passes clean', () => {
  const { nTasks, failures } = validateTaskTomls(repoRoot)
  assert.equal(failures.length, 0, failures.join('\n'))
  assert.ok(nTasks >= 23, `expected at least 23 task dirs, saw ${nTasks}`)
})
