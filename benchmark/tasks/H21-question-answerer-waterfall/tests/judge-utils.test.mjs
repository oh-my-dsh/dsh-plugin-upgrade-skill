import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  cohortManifestIntegrity,
  fixtureChanges,
  inspectBranching,
  run,
  stripComments,
  stripStrings,
} from './judge-utils.mjs'

test('comment stripping removes block and line comments before scanning', () => {
  const source = `
    /**
     * Migration note: do not parse 0.1.1-rc.2, do not match ctx.root.
     */
    const event = 'user-questions/request' // rc.2 era event name, comment only
    export function attach(ctx, service) {
      // ctx.root === service.ctx would be a banned comment mention
      return service.registerProvider({ ask: () => null })
    }
  `
  const stripped = stripComments(source)
  assert.ok(!stripped.includes('0.1.1-rc.2'))
  assert.ok(!stripped.includes('rc.2 era'))
  assert.ok(!stripped.includes('ctx.root === service.ctx'))
  assert.ok(stripped.includes("'user-questions/request'"))
  assert.ok(stripped.includes('registerProvider'))
})

test('string literals are ignored for static strategy checks', () => {
  assert.equal(stripStrings("const tag = '0.1.1-rc.2'; const path = \"package.json\""), `const tag = ''; const path = ""`)
})

test('ordinary collection length and error words are not treated as strategy branches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-scan-legitimate-'))
  try {
    await writeFile(join(root, 'register.js'), `
      export function install(ctx, service, questions) {
        if (questions.length === 0) throw new Error('retry later')
        return service.registerProvider({ ask: () => questions.length })
      }
    `)
    assert.deepEqual(await inspectBranching(root), { ok: true, hits: [] })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('capability detection and the owner/delegate contract are not flagged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-scan-ok-'))
  try {
    await writeFile(join(root, 'register.js'), `
      export function installQuestionAnswerer(ctx, service, owner, answerer) {
        if (typeof service.registerProvider === 'function') {
          return service.registerProvider({ ask: (request) => answerer.ask(request) })
        }
        return ctx.on('user-questions/request', (request, next) => {
          if (request.agent === undefined) return answerer.ask(request)
          if (request.agent.id !== owner.agentId) return next()
          return answerer.ask(request)
        })
      }
    `)
    assert.deepEqual(await inspectBranching(root), { ok: true, hits: [] })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('each retained banned strategy category is still detected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-scan-bad-'))
  try {
    const cases = [
      ['version-literal.js', "export const a = '0.1.1-rc.2'\n"],
      ['tag-literal.js', 'export const tag = "alpha.2"\n'],
      ['version-var.js', 'export const detect = () => hostVersion\n'],
      ['semver-api.js', "import semver from 'semver'\nexport const ok = (v) => semver.valid(v) !== null\n"],
      ['identity.js', 'export function f(ctx, service) { return ctx === service.ctx }\n'],
      ['identity-reverse.js', 'export function g(service, ctx) { return service.ctx !== ctx }\n'],
      ['root-register.js', 'export function h(ctx) { return ctx.root.on("x", () => null) }\n'],
      ['base-url.js', 'export const probe = (ctx) => ctx.baseUrl\n'],
      ['retry-word.js', 'export function t() { retry(attach) }\n'],
      ['env-probe.js', 'import { readFileSync } from "node:fs"\nexport const pkg = JSON.parse(readFileSync("package.json", "utf8"))\n'],
    ]
    for (const [file, source] of cases) await writeFile(join(root, file), source)
    const result = await inspectBranching(root)
    assert.equal(result.ok, false)
    const labels = result.hits.map((hit) => hit.split(': ')[1])
    for (const label of [
      'DSH version literal',
      'DSH tag literal',
      'DSH version variable',
      'version parsing',
      'host/context identity matching',
      'ctx.root registration',
      'host identity probing',
      'explicit retry',
      'environment/package capability probe',
    ]) {
      assert.ok(labels.includes(label), `${label} missing from ${JSON.stringify(result.hits)}`)
    }
    for (const label of ['function arity inspection', 'exception retry/fallback', 'implementation source inspection']) {
      assert.ok(!labels.includes(label), `${label} must no longer fire (${JSON.stringify(result.hits)})`)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('legitimate try/catch, environment reads, lengths, toString and guards are not flagged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-scan-legit-idioms-'))
  try {
    await writeFile(join(root, 'register.js'), `
      export function attach(ctx, service, questions) {
        if (service === null || ctx === undefined) throw new Error('no service')
        try {
          if (questions.length === 0) return null
          if (process.env.DSH_LOG === '1') {
            console.error('questions.length=' + questions.length.toString())
          }
          return service.registerProvider({ ask: (request) => String(request.text).length })
        } catch (error) {
          console.error('retry later: ' + error.toString() + ' (semver policy in package.json)')
          return null
        }
      }
    `)
    assert.deepEqual(await inspectBranching(root), { ok: true, hits: [] })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('helpers reached through local relative imports are scanned transitively', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-scan-nested-'))
  try {
    await mkdir(join(root, 'nested'))
    await writeFile(join(root, 'register.js'), [
      "import { probe } from './nested/helper'",
      "import './nested/missing.js'",
      'export const run = () => probe()',
      '',
    ].join('\n'))
    await writeFile(join(root, 'nested', 'helper.mjs'), "import { deep } from './deep.js'\nexport const probe = (ctx) => deep(ctx)\n")
    await writeFile(join(root, 'nested', 'deep.js'), 'export const deep = (ctx) => ctx.root\n')
    const result = await inspectBranching(root)
    assert.equal(result.ok, false)
    assert.ok(
      result.hits.some((hit) => hit.startsWith('nested/deep.js') && hit.includes('ctx.root registration')),
      JSON.stringify(result.hits),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('imports that escape the source root or name bare packages are not followed', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'h21-scan-external-'))
  const root = join(parent, 'src')
  try {
    await mkdir(root)
    await writeFile(join(root, 'register.js'), [
      "import { probe } from '../outside.js'",
      "import semverLib from 'semver'",
      "import { readFile } from 'node:fs/promises'",
      'export const run = () => probe() && semverLib && readFile',
      '',
    ].join('\n'))
    // Banned code outside the scanned root: must be invisible to the scan.
    await writeFile(join(parent, 'outside.js'), 'export const probe = (ctx) => ctx.root\n')
    assert.deepEqual(await inspectBranching(root), { ok: true, hits: [] })
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test('package.json manifests are never scanned as implementation source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-scan-manifest-'))
  try {
    await writeFile(join(root, 'register.js'), "import manifest from './package.json' with { type: 'json' }\nexport const name = () => manifest.name\n")
    await writeFile(join(root, 'package.json'), '{ "name": "h21-fixture", "version": "0.1.1-rc.2", "description": "alpha.2 tag era" }\n')
    assert.deepEqual(await inspectBranching(root), { ok: true, hits: [] })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the reference solution itself passes the branching scan', async () => {
  const oracle = new URL('../solution/plugin/src/register.js', import.meta.url)
  const root = await mkdtemp(join(tmpdir(), 'h21-scan-oracle-'))
  try {
    await writeFile(join(root, 'register.js'), await readFile(oracle, 'utf8'))
    assert.deepEqual(await inspectBranching(root), { ok: true, hits: [] })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('manifest integrity accepts exact versions and reports mismatches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-manifest-'))
  try {
    const makePkg = async (name, version) => {
      const dir = join(root, 'node_modules', ...name.split('/'))
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version }))
    }
    await makePkg('@deepseek-ai/cordis', '4.0.2')
    await makePkg('@deepseek-ai/dsh-user-questions', '0.1.1-rc.2')
    await makePkg('@deepseek-ai/dsh-scope', '0.1.1-rc.2')
    const cohort = {
      name: 'rc2-fake',
      root,
      expected: {
        '@deepseek-ai/cordis': '4.0.2',
        '@deepseek-ai/dsh-user-questions': '0.1.1-rc.2',
        '@deepseek-ai/dsh-scope': '0.1.1-rc.2',
      },
    }
    assert.deepEqual(await cohortManifestIntegrity(cohort), {
      ok: true,
      detail: 'rc2-fake: manifests intact (@deepseek-ai/cordis, @deepseek-ai/dsh-user-questions, @deepseek-ai/dsh-scope)',
    })
    await makePkg('@deepseek-ai/dsh-scope', '0.1.1-rc.3')
    const result = await cohortManifestIntegrity(cohort)
    assert.equal(result.ok, false)
    assert.ok(result.detail.includes('@deepseek-ai/dsh-scope@0.1.1-rc.3'), result.detail)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fixture changes are detected against a git baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'h21-git-'))
  try {
    await mkdir(join(root, 'fixture'))
    await writeFile(join(root, 'fixture', 'placeholder.txt'), 'baseline\n')
    const author = ['-c', 'user.email=bench@local', '-c', 'user.name=bench']
    assert.equal((await run('git', ['init', '-q'], root)).code, 0)
    assert.equal((await run('git', ['add', '-A'], root)).code, 0)
    assert.equal((await run('git', [...author, 'commit', '-q', '-m', 'baseline'], root)).code, 0)

    assert.deepEqual(await fixtureChanges(root, 'fixture'), {
      ok: false,
      detail: 'fixture unchanged relative to baseline, graded as 0',
    })

    await writeFile(join(root, 'fixture', 'placeholder.txt'), 'changed\n')
    const changed = await fixtureChanges(root, 'fixture')
    assert.equal(changed.ok, true)
    assert.ok(changed.detail.startsWith('fixture changed:'), changed.detail)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
