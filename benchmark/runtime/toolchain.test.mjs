import assert from 'node:assert/strict'
import test from 'node:test'
import { historicalVendorPins, validatePinnedTree } from './toolchain.mjs'
import { runProcess } from './verify.mjs'

const expected = { '@deepseek-ai/cordis-plugin-hmr': '1.0.16' }
const pinned = () => ({ dependencies: { '@deepseek-ai/cordis-plugin-hmr': { version: '1.0.16' } } })

test('historical pins are limited to the rc.2 source control', () => {
  assert.deepEqual(Object.keys(historicalVendorPins), ['0.1.1-rc.2'])
  assert.equal(Object.keys(historicalVendorPins['0.1.1-rc.2']).length, 10)
  for (const version of Object.values(historicalVendorPins['0.1.1-rc.2'])) {
    assert.match(version, /^\d+\.\d+\.\d+$/)
  }
})

test('accepts the exact pinned dependency', () => {
  assert.doesNotThrow(() => validatePinnedTree(pinned(), expected))
})

test('rejects an absent pin', () => {
  assert.throws(() => validatePinnedTree({ dependencies: {} }, expected), /missing.*hmr@1\.0\.16/)
})

test('a nested-only peer does not satisfy global loader visibility', () => {
  const tree = { dependencies: { '@deepseek-ai/dsh': pinned() } }
  assert.throws(() => validatePinnedTree(tree, expected), /missing top-level.*hmr@1\.0\.16/)
})

test('rejects a newer top-level dependency', () => {
  assert.throws(() => validatePinnedTree({ dependencies: {
    '@deepseek-ai/cordis-plugin-hmr': { version: '1.0.19' },
  } }, expected), /resolved 1\.0\.19, expected 1\.0\.16/)
})

test('rejects nested drift even when a correct top-level pin exists', () => {
  const tree = pinned()
  tree.dependencies['@deepseek-ai/dsh'] = { dependencies: {
    '@deepseek-ai/cordis-plugin-hmr': { version: '1.0.19' },
  } }
  assert.throws(() => validatePinnedTree(tree, expected), /dsh >.*hmr: resolved 1\.0\.19/)
})

test('accepts repeated nested copies only when all match', () => {
  const tree = pinned()
  tree.dependencies['@deepseek-ai/dsh'] = pinned()
  assert.doesNotThrow(() => validatePinnedTree(tree, expected))
})

test('a stalled setup process is bounded and fails explicitly', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 })
  assert.match(result.error?.message, /timed out after 100ms/)
  assert.equal(result.exitCode, null)
})
