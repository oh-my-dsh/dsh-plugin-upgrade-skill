import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { defaultFiles, makePacket, REPO, semanticToml, syncDefaults } from './prepare.mjs'
import { grade, isOnlyPromptEcho } from './judge.mjs'
import { RUBRICS } from './rubrics.mjs'

function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'report-default-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

test('registered default tasks are self-contained semantic verifiers with separate secrets and artifacts', () => {
  assert.equal(Object.keys(RUBRICS).length, 25)
  assert.deepEqual(syncDefaults({ check: true }).changed, [])
  for (const task of Object.keys(RUBRICS)) {
    const files = defaultFiles(task)
    assert.equal(semanticToml(files.get('task.toml'), RUBRICS[task].taskVersion), files.get('task.toml'), 'configuration generation is idempotent')
    assert.match(files.get('task.toml'), /environment_mode = "separate"/)
    assert.match(files.get('task.toml'), /\[verifier.env\][\s\S]*REPORT_JUDGE_MODEL = "\$\{REPORT_JUDGE_MODEL\}"/)
    assert.match(files.get('task.toml'), /artifacts = .*\/app\/fixture.*\/app\/agent-output/)
    assert.doesNotMatch(files.get('environment/Dockerfile'), /REPORT_JUDGE|packet\.json|COPY .*tests/)
    assert.doesNotMatch(files.get('task.toml').split('[verifier]')[0], /REPORT_JUDGE/)
    assert.doesNotMatch(files.get('tests/test.sh'), /score\s*=\s*0|catch|reward\.txt/)
    assert.match(files.get('tests/judge.mjs'), /await callJudge/)
    assert.equal(JSON.parse(files.get('tests/packet.json')).source_commit, null)
    for (const name of ['judge-utils.mjs', 'report-claims.mjs', 'report-grading.mjs', 'judge.test.mjs']) {
      assert.equal(existsSync(join(REPO, 'benchmark/tasks', task, 'tests', name)), false, `${task}: retired ${name}`)
    }
  }
})

test('CI detects drift in task material, reference excerpts and deployed judge copies', t => {
  const root = sandbox(t)
  const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); cpSync(from, to, { recursive: true }) }
  copy(join(REPO, 'benchmark/report-judge/judge.mjs'), join(root, 'benchmark/report-judge/judge.mjs'))
  for (const [task, rubric] of Object.entries(RUBRICS)) {
    copy(join(REPO, 'benchmark/tasks', task), join(root, 'benchmark/tasks', task))
    for (const ref of rubric.references) copy(join(REPO, ref.path), join(root, ref.path))
  }
  assert.deepEqual(syncDefaults({ root, check: true }).changed, [])
  for (const path of [
    'benchmark/tasks/S10-paste-rename-and-version-chip/instruction.md',
    'benchmark/tasks/S12-global-upgrade-ebusy-trap/environment/fixture/npm-dist-tags.txt',
    RUBRICS['S1-static-scan'].references[0].path,
    'benchmark/tasks/S15-slot-error-boundary-crash/tests/judge.mjs',
  ]) {
    const file = join(root, path); const original = readFileSync(file, 'utf8')
    writeFileSync(file, original + '\nchanged\n')
    assert.throws(() => syncDefaults({ root, check: true }), /stale default report verifiers/)
    writeFileSync(file, original)
  }
})

for (const task of Object.keys(RUBRICS)) {
  test(`${task}: real standalone shell entry calls the LLM transport and preserves failures`, t => {
    const root = sandbox(t); const app = join(root, 'app'); const tests = join(root, 'tests'); const logs = join(root, 'logs')
    cpSync(join(REPO, 'benchmark/tasks', task, 'tests'), tests, { recursive: true })
    cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(app, 'fixture'), { recursive: true })
    const out = join(app, 'agent-output', task); mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'report.md'), 'independent diagnosis')
    const stub = join(root, 'transport.mjs')
    writeFileSync(stub, `import assert from 'node:assert/strict';
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://judge.invalid/v1/chat/completions');
  assert.equal(options.headers.authorization, 'Bearer protocol-test-secret');
  const request = JSON.parse(options.body), input = JSON.parse(request.messages[1].content);
  assert.equal(request.model, 'protocol-test-model');
  assert.equal(input.task, ${JSON.stringify(task)});
  assert.equal(input.candidate_reports['report.md'], 'independent diagnosis');
  assert.equal(request.tools, undefined);
  if (process.env.PROTOCOL_FAILURE) return new Response('secret must not leak', { status: 503 });
  const response = { decisions: input.rubric.criteria.map(c => ({ id: c.id, verdict: 'partial',
    reason: 'Transport test only; this is not a semantic score.' })),
    caps: input.rubric.caps.map(c => ({ id: c.id, triggered: false, reason: 'No cap' })) };
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(response) } }] }));
};\n`)
    const env = { PATH: process.env.PATH, NODE_OPTIONS: `--import=${stub}`, REPORT_JUDGE_BASE_URL: 'https://judge.invalid/v1',
      REPORT_JUDGE_MODEL: 'protocol-test-model', REPORT_JUDGE_API_KEY: 'protocol-test-secret' }
    const args = [join(tests, 'test.sh'), '--app', app, '--logs', logs]
    execFileSync('bash', args, { env, stdio: 'pipe' })
    assert.equal(readFileSync(join(logs, 'reward.txt'), 'utf8'), '0.5\n')
    assert.equal(JSON.parse(readFileSync(join(logs, 'details.json'))).status, 'scored')
    const failed = spawnSync('bash', args, { env: { ...env, PROTOCOL_FAILURE: 'yes' }, encoding: 'utf8' })
    assert.equal(failed.status, 1)
    assert.equal(existsSync(join(logs, 'reward.txt')), false)
    const details = readFileSync(join(logs, 'details.json'), 'utf8')
    assert.equal(JSON.parse(details).status, 'judge_error')
    assert.doesNotMatch(details + failed.stdout + failed.stderr, /secret must not leak|protocol-test-secret/)
    const missingConfig = spawnSync('bash', args, { env: { PATH: process.env.PATH }, encoding: 'utf8' })
    assert.equal(missingConfig.status, 1)
    assert.equal(existsSync(join(logs, 'reward.txt')), false)
  })

  test(`${task}: prompt copies score zero, while quoted prompts leave independent answers available`, async t => {
    const root = sandbox(t); const packet = makePacket(task)
    cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
    const dir = join(root, 'agent-output', task); mkdirSync(dir, { recursive: true })
    const variants = [packet.instruction, packet.instruction.toUpperCase().replace(/\s+/g, ' ')]
    for (const text of variants) {
      writeFileSync(join(dir, 'report.md'), text)
      const result = await grade({ packet, appRoot: root, evaluate: () => assert.fail('prompt-only report must not request a judgment') })
      assert.equal(result.score, 0); assert.equal(result.status, 'scored')
    }
    const text = packet.instruction + '\n\nIndependent analysis follows: the host still holds the native file.'
    assert.equal(isOnlyPromptEcho(packet.instruction, { 'report.md': text }), false)
    writeFileSync(join(dir, 'report.md'), text)
    let evaluated = false
    await grade({ packet, appRoot: root, evaluate: async (p, reports) => {
      evaluated = true; assert.equal(reports['report.md'], text); return { score: 0 }
    } })
    assert.ok(evaluated)
  })
}
