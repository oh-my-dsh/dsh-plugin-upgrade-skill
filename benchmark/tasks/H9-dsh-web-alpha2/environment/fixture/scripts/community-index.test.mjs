/**
 * community-index script contract: entry validation rejects malformed
 * registrations, and the CLI gate stays green against the committed
 * community.json (the market manifest source).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateEntries } from './community-index'

const VALID = [
  {
    id: 'dsh-a',
    name: 'A',
    nameEn: 'A',
    author: 'author-a',
    description: '描述',
    descriptionEn: 'description',
    repo: 'https://github.com/author-a/dsh-a',
    npm: '@author-a/dsh-a',
    category: 'ui',
    subcategory: 'terminal',
  },
  {
    id: 'dsh-b',
    name: 'B',
    nameEn: 'B',
    author: 'author-b',
    repo: 'https://github.com/author-b/dsh-b',
  },
]

test('validateEntries accepts a well-formed list', () => {
  assert.doesNotThrow(() => validateEntries(VALID))
})

test('validateEntries rejects a non-empty array contract violation', () => {
  assert.throws(() => validateEntries([]), /non-empty array/)
  assert.throws(() => validateEntries({}), /non-empty array/)
  assert.throws(() => validateEntries([null]), /must be an object/)
})

test('validateEntries requires the mandatory fields', () => {
  const broken = structuredClone(VALID)
  delete broken[0].repo
  assert.throws(() => validateEntries(broken), /missing required string field repo/)
})

test('validateEntries rejects duplicate ids', () => {
  const dup = structuredClone(VALID)
  dup[1].id = dup[0].id
  assert.throws(() => validateEntries(dup), /duplicate entry id dsh-a/)
})

test('validateEntries requires an https repository URL', () => {
  const bad = structuredClone(VALID)
  bad[0].repo = 'github.com/author-a/dsh-a'
  assert.throws(() => validateEntries(bad), /must be an https:\/\/ URL/)
})

test('validateEntries rejects an unknown category', () => {
  const bad = structuredClone(VALID)
  bad[0].category = 'unknown'
  assert.throws(() => validateEntries(bad), /category must be one of/)
})

test('validateEntries rejects a subcategory without a category', () => {
  const bad = structuredClone(VALID)
  bad[1].subcategory = 'terminal'
  assert.throws(() => validateEntries(bad), /subcategory requires a category/)
})

test('validateEntries rejects a subcategory outside its category', () => {
  const bad = structuredClone(VALID)
  bad[0].subcategory = 'memory'
  assert.throws(() => validateEntries(bad), /subcategory must be one of/)
  bad[0].subcategory = 'unknown'
  assert.throws(() => validateEntries(bad), /subcategory must be one of/)
})

test('CLI gate passes against the committed community.json', () => {
  const script = fileURLToPath(new URL('./community-index', import.meta.url))
  const out = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' })
  assert.match(out, /community-index: OK/)
})
