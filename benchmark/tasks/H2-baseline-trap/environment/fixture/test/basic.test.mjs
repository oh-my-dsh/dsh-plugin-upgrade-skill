// Pure-function test unrelated to the migration (runs directly with node:test).
// Note: this test was already red before the migration — the assertion and the implementation
// disagree semantically; it is a pre-existing failure.
import { test } from 'node:test'
import assert from 'node:assert/strict'

function formatProviderLabel(name) {
  // Implementation: human-readable title
  return String(name).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

test('formatProviderLabel 生成小写短横线形式', () => {
  // Pre-existing failure: the implementation returns Title Case but the test expects kebab-case
  assert.equal(formatProviderLabel('deepseek-official'), 'deepseek-official')
})
