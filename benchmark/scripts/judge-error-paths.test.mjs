import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const tasks = fileURLToPath(new URL('../tasks/', import.meta.url))
// Run the actual judge/helper in a disposable directory. Only container absolute
// paths are relocated; no scoring, git result, candidate or host tool is mocked.
function runJudge(t, task, { baseline = true, modified = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'judge-error-path-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const app = join(root, 'app'), tests = join(root, 'tests')
  mkdirSync(app, { recursive: true })
  cpSync(join(tasks, task, 'environment/fixture'), join(app, 'fixture'), { recursive: true, filter: path => !path.includes('/node_modules') })
  cpSync(join(tasks, task, 'tests'), tests, { recursive: true })
  for (const name of readdirSync(tests)) {
    if (!name.endsWith('.mjs')) continue
    const file = join(tests, name)
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('/app', app).replaceAll('/opt/h23-verifier/baseline.sha', join(root, 'protected-baseline.sha')))
  }
  if (baseline) {
    for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=test', '-c', 'user.email=test@local', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline']]) {
      execFileSync('git', args, { cwd: app, stdio: 'pipe' })
    }
  }
  if (modified) writeFileSync(join(app, 'fixture/agent-change.txt'), 'candidate modification\n')
  const run = spawnSync(process.execPath, [join(tests, 'judge.mjs')], { cwd: app, encoding: 'utf8', timeout: 10000 })
  assert.equal(run.error, undefined, run.error?.message)
  const last = run.stdout.trim().split('\n').at(-1)
  let packet
  try { packet = JSON.parse(last) } catch { assert.fail(`judge did not emit JSON: ${run.stdout}\n${run.stderr}`) }
  return { ...run, packet }
}

for (const task of ['S8-release-routing-trap', 'S17-external-ui-plugin-onboarding-trap', 'H9-dsh-web-alpha2']) {
  test(`${task}: unavailable git baseline is evaluator error, not zero score`, t => {
    const r = runJudge(t, task, { baseline: false })
    assert.notEqual(r.status, 0)
    assert.equal(r.packet.status, 'verifier_error')
    assert.equal(r.packet.score, undefined)
  })
}
test('H13: absent provision is evaluator error', t => {
  const r = runJudge(t, 'H13-ghost-host-trap')
  assert.notEqual(r.status, 0)
  assert.equal(r.packet.status, 'verifier_error')
})
test('H23: missing protected verifier baseline is evaluator error', t => {
  const r = runJudge(t, 'H23-storage-domain-version-compat-trap')
  assert.notEqual(r.status, 0)
  assert.equal(r.packet.status, 'verifier_error')
})
for (const task of ['S8-release-routing-trap', 'S17-external-ui-plugin-onboarding-trap', 'M1-host-migration']) {
  test(`${task}: valid empty/untouched candidate remains scored zero`, t => {
    const r = runJudge(t, task)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.packet.score, 0)
    assert.notEqual(r.packet.status, 'verifier_error')
  })
}

for (const fault of ['baseline restore', 'profile creation']) {
  test(`M5: ${fault} prerequisite failure never becomes a candidate zero`, t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'm5-prerequisite-')))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const stage = join(root, 'tests')
    cpSync(join(tasks, 'M5-token-auth-smoke/tests'), stage, { recursive: true })
    const source = readFileSync(join(stage, 'judge.mjs'), 'utf8')
    const imports = /import\s*{([^}]+)}\s*from '\.\/judge-utils.mjs'/.exec(source)[1].split(',').map(s => s.trim()).filter(Boolean)
    // Fault injection at the host boundary: real M5 main, emit and verifier run;
    // external host setup is unavailable in this unit test and is not executed.
    const defined = new Map([
      ['fixtureChanges', 'async () => ({changed:true})'], ['dshAvailable', 'async () => true'],
      ['restorePristine', `async () => ({ok:${fault !== 'baseline restore'},dir:${JSON.stringify(root)},detail:'injected restoration failure'})`],
      ['createProfile', "async () => ({ok:false,detail:'injected profile creation failure'})"],
      ['cleanupProfile', 'async () => {}'], ['FIXTURE_DIR', JSON.stringify(root)],
    ])
    const stub = imports.map(name => ['emit', 'emitError'].includes(name)
      ? `export {${name}} from './judge-result.mjs'`
      : `export const ${name} = ${defined.get(name) ?? '() => { throw new Error("unexpected host call") }'}`).join('\n')
    writeFileSync(join(stage, 'judge-utils.mjs'), stub)
    const logs = join(root, 'logs')
    const run = spawnSync('bash', [join(stage, 'test.sh')], { cwd: root, encoding:'utf8', env:{...process.env,VERIFIER_LOG_DIR:logs},timeout:10000 })
    assert.notEqual(run.status, 0, run.stdout)
    assert.equal(JSON.parse(readFileSync(join(logs, 'verifier-error.json'), 'utf8')).status,'verifier_error')
    assert.ok(!readdirSync(logs).some(n => n.startsWith('reward.')))
  })
}
