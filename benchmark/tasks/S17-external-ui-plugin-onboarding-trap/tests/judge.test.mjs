import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { gradeReport } from './report-grading.mjs'

const testsDir = dirname(fileURLToPath(import.meta.url))
const taskDir = dirname(testsDir)
const oracle = readFileSync(join(taskDir, 'solution/report.md'), 'utf8')
const wrongReport = `The raw ESM import causes the whole classic-script combo to fail, leaving zero plugins registered; typert-registry is the innocent first awaited plugin.
Bisect insert rows to locate the faulty client bundle. Keep the top-level imports and switch the combo to type=module; the ModuleLoader wrapper and require(react) are unnecessary.
Call ctx.slots.register directly. slots.inject creates the declaration race and must be removed. Registrants should set kind and scope themselves.
The combo is assembled at boot. Restart is unnecessary because HMR rebuilds the bundle automatically. A browser refresh is sufficient.
For prevention, scan each plugin bundle and name the culprit at startup; provide an authoring checklist for the next onboarding.`
const keywordReport = `An ESM import makes the whole combo fail.
Bisect insert rows to find the client bundle.
Use ctx.slots.inject before register.
The combo is assembled once at boot.
Scan each plugin at startup.`

test('reference report earns 100; empty, wrong and keyword-only answers do not', () => {
  assert.equal(gradeReport(oracle).score, 100, JSON.stringify(gradeReport(oracle)))
  assert.equal(gradeReport('').score, 0)
  assert.equal(gradeReport(wrongReport).score, 0)
  assert.equal(gradeReport(keywordReport).score, 0)
})

test('a separately written complete report also earns full credit', () => {
  const report = `A raw ESM import is a syntax error that fails the whole combo, which is delivered as a classic script. Zero plugins register. The named entry typert-registry is innocent: it is the first awaited import.
Bisect the profile insert rows. Parse each suspect bundle with vm.Script. Use window.__ModuleLoader__.load({ id, factory }); get React with require('react') inside the factory and export inject and apply.
The owner entry declares the slot. Defer registration until the declaration arrives. Use ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'profiles', order: 5 }, ProfilesSection)). Pass only name, id, order, and optional label; kind and scope belong to the declaring entry.
The combo is assembled once per boot, with no HMR rebuild. Every edit requires a full host restart. On Windows, kill the entire process tree with taskkill /PID <pid> /T /F. The old process holds the port, causing EADDRINUSE on the next boot.
At startup, scan each plugin bundle and name the offending plugin. Provide an authoring template and checklist containing the loader wrapper, require-based React, inject/apply exports, deferred registration, and the restart procedure.`
  assert.equal(gradeReport(report).score, 100, JSON.stringify(gradeReport(report)))
})

for (const advice of [
  'Do not register directly; use ctx.slots.inject to register after the declaration.',
  'Avoid direct registration. Use ctx.slots.inject to await the declaration.',
  'Do not skip the full host restart.',
  'Never remove ctx.slots.inject.',
  'Do not keep the top-level imports.',
  'Wrong advice: "no need to restart".',
  '"Restart is unnecessary" is incorrect.',
  '不要直接注册，使用ctx.slots.inject等待声明。',
]) {
  test('correct or explicitly rejected advice stays valid: ' + advice, () => {
    assert.equal(gradeReport(oracle + '\n\n' + advice).score, 100)
  })
}

for (const advice of [
  'Do\nNOT use slots.inject for the registration.',
  "Don't call ctx.slots.inject.",
  'Remove ctx.slots.inject.',
  'slots.inject is unnecessary.',
  'slots.inject must be removed.',
  'Call ctx.slots.register directly.',
  'There is no need to restart the host.',
  'Restart is unnecessary.',
  'The host restart is not required.',
  'Skip the full host restart.',
  'HMR rebuilds the bundle automatically.',
  'Keep the top-level imports.',
  'Registrants should set kind and scope themselves.',
  '不要用slots.inject，无需重启。',
]) {
  test('wrong final advice overrides keyword hits: ' + advice, () => {
    const result = gradeReport(oracle + '\n\n' + advice)
    assert.equal(result.score, 0, JSON.stringify(result))
    assert.match(result.reasons[0], /WRONG CONCLUSION/)
  })
}

test('all required details are necessary, not interchangeable keyword alternatives', () => {
  for (const [name, removed] of [
    ['loader packaging', oracle.replaceAll('__ModuleLoader__', '__MissingLoader__')],
    ['classic parsing', oracle.replaceAll('classic-script', 'module-mode').replaceAll('CLASSIC-script', 'module-mode').replaceAll('vm.Script', 'moduleParse')],
    ['slot wrapper', oracle.replaceAll("ctx.slots.inject('settings.section', () => ctx.slots.register(", "ctx.slots.register(")],
    ['Windows tree kill', oracle.replaceAll('taskkill /PID <pid> /T /F', 'stop the process').replace(/tree/gi, 'process')],
    ['authoring prevention', oracle.replaceAll('template', 'example').replaceAll('checklist', 'note')],
  ]) assert.ok(gradeReport(removed).score < 100, name + ' must be required')
})

function snapshot(dir) {
  return Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name)
      return [path.slice(dir.length), readFileSync(path, 'utf8')]
    }))
}

// Execute the real shell entry point and judge. Only absolute container paths
// are remapped; no grading logic is stubbed and the fixture has a real git baseline.
function runVerifier(t, { filename, report, solution = false, modified = false, missingBaseline = false }) {
  const root = mkdtempSync(join(tmpdir(), 's17-verifier-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const app = join(root, 'app')
  const output = join(app, 'agent-output/S17-external-ui-plugin-onboarding-trap')
  const logs = join(root, 'logs')
  const localTests = join(root, 'tests')
  mkdirSync(output, { recursive: true })
  cpSync(join(taskDir, 'environment/fixture'), join(app, 'fixture'), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: app })
  execFileSync('git', ['add', 'fixture'], { cwd: app })
  execFileSync('git', ['-c', 'user.email=bench@local', '-c', 'user.name=Bench', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline'], { cwd: app })
  if (modified) writeFileSync(join(app, 'fixture/browser-error.txt'), 'changed')
  if (missingBaseline) rmSync(join(app, '.git'), { recursive: true })
  if (filename) {
    mkdirSync(dirname(join(output, filename)), { recursive: true })
    writeFileSync(join(output, filename), report)
  }
  if (solution) cpSync(join(taskDir, 'solution'), join(root, 'solution'), { recursive: true })
  cpSync(testsDir, localTests, { recursive: true })
  const utils = join(localTests, 'judge-utils.mjs')
  writeFileSync(utils, readFileSync(utils, 'utf8').replace("export const APP_ROOT = '/app'", `export const APP_ROOT = ${JSON.stringify(app)}`))
  const script = join(localTests, 'test.sh')
  let shell = readFileSync(script, 'utf8')
  for (const [from, to] of [['/app', app], ['/tests', localTests], ['/solution', join(root, 'solution')], ['/logs', logs], ['/tmp/judge', join(root, 'judge')]]) shell = shell.replaceAll(from, to)
  writeFileSync(script, shell)
  const before = snapshot(output)
  const result = spawnSync('bash', [script], { cwd: app, encoding: 'utf8', env: { ...process.env, VERIFIER_LOG_DIR: join(logs, 'verifier'), PATH: dirname(process.execPath) + ':' + process.env.PATH }, timeout: 15000 })
  if (missingBaseline) {
    assert.notEqual(result.status, 0)
    assert.equal(JSON.parse(readFileSync(join(logs, 'verifier/verifier-error.json'), 'utf8')).status, 'verifier_error')
    assert.equal(existsSync(join(logs, 'verifier/reward.txt')), false)
    assert.deepEqual(snapshot(output), before)
    return 'verifier_error'
  }
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.deepEqual(snapshot(output), before, 'verifier must not create, replace, or delete agent artifacts')
  assert.doesNotMatch(result.stderr, /cp:|No such file/)
  return Number(readFileSync(join(logs, 'verifier/reward.txt'), 'utf8'))
}

for (const solution of [false, true]) {
  test(`empty answer stays zero, solution present=${solution}`, (t) => {
    assert.equal(runVerifier(t, { solution }), 0)
  })
  test(`wrong answer stays zero, solution present=${solution}`, (t) => {
    assert.equal(runVerifier(t, { filename: 'report.md', report: wrongReport, solution }), 0)
  })
}
for (const filename of ['report.md', 'report-wrong.md', 'nested/findings.log']) {
  test('correct answer is preserved under allowed filename: ' + filename, (t) => {
    assert.equal(runVerifier(t, { filename, report: oracle }), 1)
  })
}
for (const field of ['modified', 'missingBaseline']) {
  test('read-only gate fails closed: ' + field, (t) => {
    assert.equal(runVerifier(t, { filename: 'report.md', report: oracle, [field]: true }), field === 'missingBaseline' ? 'verifier_error' : 0)
  })
}
