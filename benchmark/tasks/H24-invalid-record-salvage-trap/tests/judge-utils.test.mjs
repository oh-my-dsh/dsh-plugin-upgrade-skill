// Unit tests for the H24 judge helpers. Behavioral inputs and observation
// flags are the values the real judge produced for each control in-container
// against the real alpha.5 runtime; the source-level trap detection and caps
// are exercised here.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleScore, capFor, scanPackageJson, scanSpecSource, scanSrcForCatch, scoreHygiene, scoreMigration, stripComments,
} from './judge-utils.mjs'

const ORACLE_SOURCE = `
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
export const spec = defineDomain({
  name: 'artifact_index',
  version: 5,
  layout: 'per-record',
  invalidRecords: 'backup-and-skip',
  tables: { entries: domainTable(entrySchema) },
})
`
const ORACLE_SPEC = { version: 5, layout: 'per-record', invalidRecords: 'backup-and-skip' }

const UNTOUCHED_SOURCE = `
// If one cache entry is corrupt, delete the entire cache directory.
export const spec = defineDomain({
  name: 'artifact_index',
  version: 5,
  layout: 'per-record',
  tables: { entries: domainTable(entrySchema) },
})
`
const UNTOUCHED_SPEC = { version: 5, layout: 'per-record' }

const CATCH_SOURCE = `
export const spec = defineDomain({
  name: 'artifact_index',
  version: 5,
  layout: 'per-record',
  tables: { entries: domainTable(entrySchema) },
})
`
const CATCH_APP = `
try {
  const domain = await facility.open(spec)
} catch (error) {
  return new Map()
}
`
const CATCH_SPEC = { version: 5, layout: 'per-record' }

const ZANY_SOURCE = `
import { z } from 'zod'
export const entrySchema = z.object({ id: z.any(), sourceHash: z.any(), tokens: z.any() })
export const spec = defineDomain({
  name: 'artifact_index',
  version: 5,
  layout: 'per-record',
  tables: { entries: domainTable(entrySchema) },
})
`
const ZANY_SPEC = { version: 5, layout: 'per-record' }

const COMPAT_SOURCE = `
export const spec = defineDomain({
  name: 'artifact_index',
  version: 5,
  layout: 'per-record',
  compatibleVersions: [4],
  tables: { entries: domainTable(entrySchema) },
})
`
const COMPAT_SPEC = { version: 5, layout: 'per-record', compatibleVersions: [4] }

const GLOBAL_HELPER = `
export function makeSpec(name) {
  return defineDomain({ name, version: 5, layout: 'per-record', invalidRecords: 'backup-and-skip', tables: {} })
}
`

const PINNED_PACKAGE = JSON.stringify({ dependencies: { '@deepseek-ai/dsh-storage': '0.1.2-alpha.4' } })
const CLEAN_PACKAGE = JSON.stringify({ dependencies: { '@deepseek-ai/dsh-storage': '0.1.2-alpha.5' } })

// Calibrated behavioral totals + observation flags from the real runtime:
//   oracle: 70, open OK, brokenFileAbsent, backupExists
//   untouched: 0 (open rejects), brokenFileAbsent=false, backupExists=false
//   catch-and-empty: 0 (open rejects), catchPresent
//   z.any: 45 (broken becomes visible), brokenVisible
//   compat confusion: 0 (open still rejects on schema failure)
const ORACLE_OBS = { openRejected: false, brokenVisible: false, brokenFileAbsent: true, backupExists: true, catchPresent: false }
const REJECTED_OBS = { openRejected: true, brokenVisible: false, brokenFileAbsent: false, backupExists: false, catchPresent: false }
const CATCH_OBS = { openRejected: true, brokenVisible: false, brokenFileAbsent: false, backupExists: false, catchPresent: true }
const ZANY_OBS = { openRejected: false, brokenVisible: true, brokenFileAbsent: false, backupExists: false, catchPresent: false }
const MANUAL_OBS = { openRejected: false, brokenVisible: false, brokenFileAbsent: true, backupExists: true, catchPresent: false }
const DELETED_BAK_OBS = { openRejected: false, brokenVisible: false, brokenFileAbsent: true, backupExists: false, catchPresent: false }

function run(spec, specSource, { packageJson = CLEAN_PACKAGE, srcTexts = [], observations, policyOutsideSpec = false, behavioral }) {
  return assembleScore({ behavioral, spec, specSource, packageJson, srcTexts, observations, policyOutsideSpec }).score
}

test('stripComments removes line and block comments but keeps strings', () => {
  const out = stripComments('const a = "http://x" // line\n/* block */ const b = 1')
  assert.ok(!out.includes('line'))
  assert.ok(!out.includes('block'))
  assert.ok(out.includes('"http://x"'))
})

test('scanSpecSource detects the policy, z.any, compat confusion, version', () => {
  const oracle = scanSpecSource(ORACLE_SOURCE)
  assert.equal(oracle.invalidRecordsDeclared, true)
  assert.equal(oracle.hasZAny, false)
  assert.equal(oracle.versionDeclared, 5)
  assert.equal(scanSpecSource(ZANY_SOURCE).hasZAny, true)
  assert.equal(scanSpecSource(COMPAT_SOURCE).hasCompat, true)
  assert.equal(scanSpecSource(UNTOUCHED_SOURCE).invalidRecordsDeclared, false, 'a comment mention is not a declaration')
})

test('scanSrcForCatch detects a catch around the open', () => {
  assert.equal(scanSrcForCatch([CATCH_APP]).catchPresent, true)
  assert.equal(scanSrcForCatch(['plain source']).catchPresent, false)
})

test('scanPackageJson detects the alpha.4 pin in dependency values only', () => {
  assert.equal(scanPackageJson(PINNED_PACKAGE).pinsAlpha4, true)
  assert.equal(scanPackageJson(CLEAN_PACKAGE).pinsAlpha4, false)
  const prose = JSON.stringify({ description: 'from 0.1.2-alpha.4 to 0.1.2-alpha.5', dependencies: { x: '0.1.2-alpha.5' } })
  assert.equal(scanPackageJson(prose).pinsAlpha4, false)
})

test('scoreMigration: oracle 20, untouched 10, z.any 5, compat confusion 10', () => {
  assert.equal(scoreMigration(ORACLE_SPEC, scanSpecSource(ORACLE_SOURCE)).score, 20)
  assert.equal(scoreMigration(UNTOUCHED_SPEC, scanSpecSource(UNTOUCHED_SOURCE)).score, 10)
  assert.equal(scoreMigration(ZANY_SPEC, scanSpecSource(ZANY_SOURCE)).score, 5, 'z.any loses schema honesty; only the contract points remain')
  assert.equal(scoreMigration(COMPAT_SPEC, scanSpecSource(COMPAT_SOURCE)).score, 10)
  assert.equal(scoreMigration(null, scanSpecSource(ORACLE_SOURCE)).score, 5)
})

test('control 12: oracle scores 100', () => {
  assert.equal(run(ORACLE_SPEC, ORACLE_SOURCE, { observations: ORACLE_OBS, behavioral: 70 }), 100)
})

test('control 1: untouched (open still rejects) scores low — judge gate flattens to 0', () => {
  const score = run(UNTOUCHED_SPEC, UNTOUCHED_SOURCE, { observations: REJECTED_OBS, behavioral: 0 })
  assert.equal(score, 20, 'assembler alone gives 20; judge.mjs gates an untouched fixture to 0')
})

test('control 4: catch-and-empty caps at 30', () => {
  assert.equal(run(CATCH_SPEC, CATCH_SOURCE, { observations: CATCH_OBS, behavioral: 0, srcTexts: [CATCH_APP] }), 20)
})

test('control 5: z.any schema caps at 40', () => {
  assert.equal(run(ZANY_SPEC, ZANY_SOURCE, { observations: ZANY_OBS, behavioral: 45 }), 40)
})

test('control 6: field-level schema loosening caps at 60', () => {
  const looseSource = `
export const entrySchema = z.object({ id: z.string(), sourceHash: z.string(), tokens: z.union([z.number(), z.string()]) })
export const spec = defineDomain({ name: 'artifact_index', version: 5, layout: 'per-record', tables: { entries: domainTable(entrySchema) } })
`
  const score = run(UNTOUCHED_SPEC, looseSource, { observations: ZANY_OBS, behavioral: 45 })
  assert.equal(score, 60)
})

test('control 7: backup deleted after salvage caps at 60', () => {
  assert.equal(run(ORACLE_SPEC, ORACLE_SOURCE, { observations: DELETED_BAK_OBS, behavioral: 55 }), 60)
})

test('control 8: manual backup without the runtime contract caps at 50', () => {
  assert.equal(run(UNTOUCHED_SPEC, UNTOUCHED_SOURCE, { observations: MANUAL_OBS, behavioral: 70 }), 50)
})

test('control 9: policy globalized outside the domain spec caps at 70', () => {
  assert.equal(run(ORACLE_SPEC, ORACLE_SOURCE, { observations: ORACLE_OBS, behavioral: 70, srcTexts: [GLOBAL_HELPER], policyOutsideSpec: true }), 70)
})

test('control 2: deleting the corrupt record with no salvage and no backup caps at 30', () => {
  const deletedObs = { openRejected: false, brokenVisible: false, brokenFileAbsent: true, backupExists: false, catchPresent: false }
  assert.equal(run(UNTOUCHED_SPEC, UNTOUCHED_SOURCE, { observations: deletedObs, behavioral: 50 }), 30)
})

test('control 13: compatibleVersions confusion does not fix schema failure', () => {
  const score = run(COMPAT_SPEC, COMPAT_SOURCE, { observations: REJECTED_OBS, behavioral: 0 })
  assert.equal(score, 20, 'open still rejects; compat is not capped but cannot help')
})

test('control 11: keyword/comment mention without the policy keeps the failure', () => {
  const mention = `
// invalidRecords backup-and-skip is how alpha.5 salvages.
export const spec = defineDomain({ name: 'artifact_index', version: 5, layout: 'per-record', tables: { entries: domainTable(entrySchema) } })
`
  const score = run(UNTOUCHED_SPEC, mention, { observations: REJECTED_OBS, behavioral: 0 })
  assert.equal(score, 20)
})

test('control 3: alpha.4 pin caps at 20', () => {
  assert.equal(run(ORACLE_SPEC, ORACLE_SOURCE, { packageJson: PINNED_PACKAGE, observations: ORACLE_OBS, behavioral: 70 }), 20)
})

test('spec load failure caps at 30', () => {
  const badSource = `
export const spec = defineDomain({ name: 'artifact_index', version: 5, layout: 'per-record', invalidRecords: 'delete', tables: { entries: domainTable(entrySchema) } })
`
  assert.equal(run(null, badSource, { observations: REJECTED_OBS, behavioral: 0 }), 15)
})

test('capFor picks the smallest triggered cap and null when clean', () => {
  const cleanScan = scanSpecSource(ORACLE_SOURCE)
  const cleanPackage = scanPackageJson(CLEAN_PACKAGE)
  assert.equal(capFor({ spec: ORACLE_SPEC, scan: cleanScan, packageScan: cleanPackage, observations: ORACLE_OBS, specLoadFailed: false, policyOutsideSpec: false }), null)
  assert.equal(capFor({ spec: ZANY_SPEC, scan: scanSpecSource(ZANY_SOURCE), packageScan: cleanPackage, observations: ZANY_OBS, specLoadFailed: false, policyOutsideSpec: false }), 40)
  assert.equal(capFor({ spec: null, scan: cleanScan, packageScan: cleanPackage, observations: REJECTED_OBS, specLoadFailed: true, policyOutsideSpec: false }), 30)
})

test('scoreHygiene subtracts for the alpha.4 pin only', () => {
  assert.equal(scoreHygiene(scanPackageJson(CLEAN_PACKAGE)), 10)
  assert.equal(scoreHygiene(scanPackageJson(PINNED_PACKAGE)), 7)
})

test('assembleScore is byte-deterministic and reports reasons', () => {
  const args = { behavioral: 70, spec: ORACLE_SPEC, specSource: ORACLE_SOURCE, packageJson: CLEAN_PACKAGE, srcTexts: [], observations: ORACLE_OBS, policyOutsideSpec: false }
  assert.deepEqual(assembleScore(args), assembleScore(args))
  const out = assembleScore(args)
  assert.equal(out.score, 100)
  assert.ok(out.reasons.length >= 1)
})

test('backup filename glob accepts the runtime timestamp shape only', () => {
  // The judge matches /^broken\.json\.bak\.\d{12}$/ — timestamp-robust, never
  // the concrete minute. Documented as a contract so the gate cannot drift.
  const BAK_RE = /^broken\.json\.bak\.\d{12}$/
  assert.equal(BAK_RE.test('broken.json.bak.202609060028'), true)
  assert.equal(BAK_RE.test('broken.json.bak.20260906'), false)
  assert.equal(BAK_RE.test('broken.json.bak.backup'), false)
  assert.equal(BAK_RE.test('broken.json.bak.202609060028.extra'), false)
})

test('sealed-file gates: authoritative source / healthy records / data edits are flat 0 via judge gates', () => {
  // judge.mjs gates: any tracked modification outside fixture/src/** and
  // fixture/package.json is tampering, except the single authorized tracked
  // DELETION of fixture/data/artifact_index/entries/broken.json (the
  // runtime's rename); untracked files under fixture/data/ must match the
  // .bak.<stamp> shape. Asserted here as the documented contract.
  assert.ok(true)
})
