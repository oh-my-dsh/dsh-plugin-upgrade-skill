// benchmark/tasks/H12-remote-result-boundary-trap/tests/parse-sections.test.mjs
//
// Regression tests for the six-section Markdown parser. Only level-2 headings
// (`## ...`) start or switch a canonical section; `###` / `####` sub-headings and
// `#` level-1 headings never end the enclosing section, so scorable content below
// a sub-heading keeps counting toward its section.
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSections } from './judge.mjs'

test('### sub-heading does not end the enclosing canonical section', () => {
  const sections = parseSections([
    '## Root Cause',
    'ordinary failures resolve as ok: false and do not reject',
    '### Detail',
    'the promise never enters catch for business failures',
  ].join('\n'))
  const root = sections.get('Root Cause')
  assert.match(root, /ok: false/)
  assert.match(root, /never enters catch/)
  assert.equal(sections.get('Problems in the Current Code'), '')
})

test('#### sub-heading does not end the enclosing canonical section', () => {
  const sections = parseSections([
    '## Root Cause',
    'business failures land in ok: false',
    '#### Evidence',
    'RemoteResult has the failure branch since rc.2',
  ].join('\n'))
  const root = sections.get('Root Cause')
  assert.match(root, /ok: false/)
  assert.match(root, /since rc\.2/)
})

test('the next ## canonical heading switches the section', () => {
  const sections = parseSections([
    '## Root Cause',
    'failure -> ok: false',
    '### Detail',
    'more root cause content',
    '## Problems in the Current Code',
    'reads result.value without checking ok',
  ].join('\n'))
  assert.match(sections.get('Root Cause'), /failure -> ok: false/)
  assert.doesNotMatch(sections.get('Root Cause'), /reads result\.value/)
  assert.match(sections.get('Problems in the Current Code'), /reads result\.value/)
  assert.doesNotMatch(sections.get('Problems in the Current Code'), /more root cause content/)
})

test('an unrecognized ## heading switches to an unscored block deterministically', () => {
  const sections = parseSections([
    '## Root Cause',
    'failure -> ok: false',
    '## Appendix',
    'appendix content must not leak into Root Cause',
    '## Problems in the Current Code',
    'reads result.value without checking ok',
  ].join('\n'))
  assert.doesNotMatch(sections.get('Root Cause'), /appendix content/)
  assert.match(sections.get('Problems in the Current Code'), /reads result\.value/)
})

test('# level-1 heading does not end the enclosing section', () => {
  const sections = parseSections([
    '# Title',
    '## Root Cause',
    'failure -> ok: false',
    '# Subtitle',
    'still root cause content',
  ].join('\n'))
  assert.match(sections.get('Root Cause'), /failure -> ok: false/)
  assert.match(sections.get('Root Cause'), /still root cause content/)
})

test('a canonical heading spelled in Chinese alias switches sections', () => {
  const sections = parseSections([
    '## Root Cause',
    'failure -> ok: false',
    '## 当前代码的问题',
    'reads result.value without checking ok',
  ].join('\n'))
  assert.match(sections.get('Problems in the Current Code'), /reads result\.value/)
})

test('catchBodies matches nested blocks and honors rethrow-after-nested-block', async () => {
  const { catchBodies } = await import('./judge.mjs')
  const code = [
    'try { await run() } catch (e) {',
    '  if (debug) { log(e) }',
    '  throw e',
    '}',
    'try { await other() } catch {',
    '  return fallback()',
    '}',
  ].join('\n')
  const bodies = catchBodies(code)
  assert.equal(bodies.length, 2)
  assert.match(bodies[0], /throw e/)
  assert.doesNotMatch(bodies[1], /throw|reject/)
})
