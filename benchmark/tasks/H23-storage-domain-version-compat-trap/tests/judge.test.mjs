// End-to-end regressions against the pinned alpha.5 packages and real git gates.
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const task = fileURLToPath(new URL('../', import.meta.url))
const judgeUrl = new URL('./judge.mjs', import.meta.url).href
const oracle = readFileSync(join(task, 'solution/src/domain-spec.mjs'), 'utf8')
const fixture = readFileSync(join(task, 'environment/fixture/src/domain-spec.mjs'), 'utf8')
let app
let root
let baseline
let baselineFile
const git = (...args) => execFileSync('git', ['-C', app, ...args], { encoding: 'utf8' })
const commit = (message) => git('-c', 'user.name=benchmark', '-c', 'user.email=benchmark@local', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', message)

before(() => {
  root = mkdtempSync(join(tmpdir(), 'h23-judge-'))
  app = join(root, 'app')
  baselineFile = join(root, 'verifier-baseline.sha')
  cpSync(join(task, 'environment/fixture'), join(app, 'fixture'), { recursive: true })
  git('init', '-q')
  git('add', '-f', 'fixture')
  commit('baseline')
  baseline = git('rev-parse', 'HEAD').trim()
})

beforeEach(() => {
  git('reset', '--hard', '-q', baseline)
  git('clean', '-fdq')
  writeFileSync(baselineFile, baseline)
})
after(() => { if (root) rmSync(root, { recursive: true, force: true }) })

function grade(source, prepare = () => {}, expectVerifierError = false) {
  if (source !== null) writeFileSync(join(app, 'fixture/src/domain-spec.mjs'), source)
  prepare()
  let output
  try { output = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { grade } from ${JSON.stringify(judgeUrl)}; await grade(${JSON.stringify(app)}, ${JSON.stringify(baselineFile)});`,
  ], { encoding: 'utf8', timeout: 30000 }) } catch (error) {
    if (!expectVerifierError) throw error
    assert.equal(error.status, 1)
    const packet = JSON.parse(error.stdout.trim().split('\n').at(-1))
    assert.equal(packet.status, 'verifier_error')
    return packet
  }
  assert.equal(expectVerifierError, false, 'verifier failure must not exit successfully')
  return JSON.parse(output.trim().split('\n').at(-1))
}

for (const [name, source] of [
  ['oracle', oracle],
  ['constant compatibility version', 'const PREVIOUS_VERSION = 4;\n' + oracle.replace('[4]', '[PREVIOUS_VERSION]')],
  ['computed compatibility version', oracle.replace('[4]', '[2 + 2]')],
  ['spread compatibility version', oracle.replace('[4]', '[...[4]]')],
]) {
  test(`${name} earns 100 against the real runtime`, () => {
    assert.equal(grade(source).score, 100)
  })
}

for (const field of ['id', 'title', 'pinned']) {
  test(`removing ${field} loses record-preservation points`, () => {
    const source = oracle.replace(new RegExp(`^  ${field}:.*\\n`, 'm'), '')
    const result = grade(source)
    assert.ok(result.score < 100)
    assert.ok(result.reasons.some((reason) => reason.startsWith('+0 v5 record')))
    assert.ok(result.reasons.some((reason) => reason.startsWith('+0 reopen')))
    if (field !== 'pinned') {
      assert.ok(result.reasons.some((reason) => reason.startsWith('+0 v4 record')))
      if (field === 'id') assert.ok(result.reasons.some((reason) => reason.startsWith('+0 write')))
    }
  })
}

for (const name of ['direct any', 'aliased any', 'imported any', 'aliased unknown']) {
  test(`${name} cannot earn more than 70`, () => {
    const schema = name.includes('unknown') ? 'unknown' : 'any'
    let source = oracle.replace('id: z.string()', `id: z.${schema}()`)
      .replace('title: z.string()', `title: z.${schema}()`)
    if (name.startsWith('aliased')) source = source.replace('import { z }', 'import { z as schema }').replaceAll('z.', 'schema.')
    const prepare = () => {
      if (name !== 'imported any') return
      writeFileSync(join(app, 'fixture/src/shared-schema.mjs'), "import { z } from 'zod'; export const field = z.any();\n")
    }
    if (name === 'imported any') source = "import { field } from './shared-schema.mjs';\n" + source.replaceAll('z.any()', 'field')
    const result = grade(source, prepare)
    assert.equal(result.score, 70)
    assert.ok(result.reasons.some((reason) => reason.includes('schema fails')))
  })
}

for (const [name, source, expected] of [
  ['untouched', null, 0],
  ['comment-only migration', fixture + '\n// compatibleVersions: [4]\n', 40],
  ['version downgrade', oracle.replace('version: 5,', 'version: 4,').replace('  compatibleVersions: [4],\n', ''), 20],
  ['backup-and-skip without compatibility', oracle.replace('compatibleVersions: [4]', "invalidRecords: 'backup-and-skip'"), 40],
  ['invalid current-version compatibility', oracle.replace('[4]', '[5]'), 10],
  ['invalid negative compatibility', oracle.replace('[4]', '[-1]'), 10],
]) {
  test(`${name} retains its negative control`, () => { assert.equal(grade(source).score, expected) })
}

test('alpha.4 dependency pin remains capped at 20', () => {
  assert.equal(grade(oracle, () => {
    const file = join(app, 'fixture/package.json')
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('0.1.2-alpha.5', '0.1.2-alpha.4'))
  }).score, 20)
})

for (const target of ['data/migration_summaries/summaries/A.json', 'node_modules/zod/index.js']) {
  test(`editing sealed ${target} remains a flat zero`, () => {
    const result = grade(oracle, () => writeFileSync(join(app, 'fixture', target), '{}\n'))
    assert.equal(result.score, 0)
    assert.ok(result.reasons.some((reason) => reason.includes('sealed files modified')))
  })
}

test('deleting a persisted record remains a flat zero', () => {
  assert.equal(grade(oracle, () => rmSync(join(app, 'fixture/data/migration_summaries/summaries/B.json'))).score, 0)
})

const fsImport = "import { rmSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';\n"
const deleteForeign = "rmSync(new URL('../data/migration_summaries/summaries/D.json', import.meta.url), { force: true });"
for (const [name, source] of [
  ['delete a foreign record at import', fsImport + oracle + deleteForeign],
  ['rewrite old stamps at import instead of declaring compatibility', fsImport + fixture + `
    for (const key of ['A', 'B']) {
      const file = new URL('../data/migration_summaries/summaries/' + key + '.json', import.meta.url);
      const document = JSON.parse(readFileSync(file, 'utf8'));
      document.version = 5;
      writeFileSync(file, JSON.stringify(document));
    }
  `],
  ['patch an installed package at import', fsImport + oracle + "appendFileSync(new URL('../node_modules/zod/index.js', import.meta.url), '\\n// patched');"],
  ['add a persisted record at import', fsImport + oracle + "writeFileSync(new URL('../data/migration_summaries/summaries/E.json', import.meta.url), '{}');"],
  ['delete during initial schema parsing', fsImport + oracle.replace('\n})', `\n}).transform((record) => { ${deleteForeign} return record; })`)],
  ['delete then throw during schema parsing', fsImport + oracle.replace('\n})', `\n}).transform(() => { ${deleteForeign} throw new Error('parse failed'); })`)],
  ['change the judge-written record on reopen', fsImport + oracle.replace('\n})', `\n}).transform((record) => {
    if (record.title === 'judge-updated') appendFileSync(new URL('../data/migration_summaries/summaries/A.json', import.meta.url), '\\n');
    return record;
  })`)],
  ['delete during final schema probes', fsImport + oracle + `
    const originalSafeParse = summarySchema.safeParse.bind(summarySchema);
    summarySchema.safeParse = (...args) => { ${deleteForeign} return originalSafeParse(...args); };
  `],
]) {
  test(`${name} is a flat zero`, () => {
    const result = grade(source)
    assert.equal(result.score, 0)
    assert.ok(result.reasons.some((reason) => reason.includes('sealed files modified')))
  })
}

for (const value of [null, '', 'not-a-sha', '0'.repeat(40)]) {
  test(`unavailable verifier baseline (${String(value)}) fails closed`, () => {
    const result = grade(oracle, () => {
      if (value === null) rmSync(baselineFile)
      else writeFileSync(baselineFile, value)
      writeFileSync(join(app, 'baseline.sha'), git('rev-parse', 'HEAD'))
    }, true)
    assert.equal(result.score, undefined)
    assert.equal(result.status, 'verifier_error')
    assert.ok(result.error.message.length > 0)
  })
}

for (const forgeWorkspaceAnchor of [false, true]) {
  test(`committed data deletion cannot reset the baseline (workspace anchor: ${forgeWorkspaceAnchor})`, () => {
    const result = grade(oracle, () => {
      rmSync(join(app, 'fixture/data/migration_summaries/summaries/D.json'))
      git('add', 'fixture/data')
      commit('delete persisted record')
      if (forgeWorkspaceAnchor) writeFileSync(join(app, 'baseline.sha'), git('rev-parse', 'HEAD'))
    })
    assert.equal(result.score, 0)
    assert.ok(result.reasons.some((reason) => reason.includes('git history rewritten')))
  })
}

const mutatePackage = (mutate) => {
  const file = join(app, 'fixture/package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  mutate(pkg)
  writeFileSync(file, JSON.stringify(pkg, null, 2))
}
for (const [name, mutate] of [
  ['all runtime dependencies deleted', (pkg) => { delete pkg.dependencies }],
  ['required dependency deleted', (pkg) => { delete pkg.dependencies['@deepseek-ai/cordis'] }],
  ['required dependency changed', (pkg) => { pkg.dependencies.zod = '3.25.0' }],
  ['target version loosened', (pkg) => { pkg.dependencies['@deepseek-ai/dsh-storage'] = '^0.1.2-alpha.5' }],
  ['runtime dependencies moved to devDependencies', (pkg) => { pkg.devDependencies = pkg.dependencies; delete pkg.dependencies }],
]) {
  test(`${name} cannot hide behind installed node_modules`, () => {
    const result = grade(oracle, () => mutatePackage(mutate))
    assert.equal(result.score, 20)
    assert.ok(result.reasons.some((reason) => reason.includes('required runtime dependencies missing or changed')))
  })
}

test('manifest description edits preserve the full score', () => {
  assert.equal(grade(oracle, () => mutatePackage((pkg) => { pkg.description = 'Migrated from 0.1.2-alpha.4' })).score, 100)
})

test('candidate cannot remove dependencies after the manifest was inspected', () => {
  const result = grade(fsImport + oracle + `
    const file = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    delete pkg.dependencies;
    writeFileSync(file, JSON.stringify(pkg));
  `)
  assert.equal(result.score, 0)
  assert.ok(result.reasons.some((reason) => reason.includes('package.json changed during verification')))
})
