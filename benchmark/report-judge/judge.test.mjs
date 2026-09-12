import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { apiConfig, auditCitations, callJudge, collectFiles, grade, JudgeError, scoreDecisions, sha256, SubmissionError, SYSTEM, writeResult } from './judge.mjs'
import { makePacket, prepare, REPO } from './prepare.mjs'
import { RUBRICS } from './rubrics.mjs'
import { samples } from './calibrate.mjs'

function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'report-judge-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}
function responseFor(packet, verdict = 'pass') {
  return { decisions: packet.rubric.criteria.map(c => ({ id: c.id, verdict, reason: 'Protocol test only, not semantic calibration.' })),
    caps: packet.rubric.caps.map(c => ({ id: c.id, triggered: false, reason: 'No assertion.' })) }
}
const report = { 'report.md': 'candidate evidence' }
const config = { url: 'https://judge.example/v1/chat/completions', key: 'private-test-key', model: 'test-model' }
function apiResponse(content, extra = {}) {
  return new Response(JSON.stringify({ model: 'test-model', id: 'test-request', usage: { total_tokens: 42 },
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], ...extra }), { status: 200 })
}

test('all registered packets use exact source bytes, bounded excerpts and 100-point rubrics', () => {
  for (const task of Object.keys(RUBRICS)) {
    const packet = makePacket(task)
    assert.equal(packet.rubric.criteria.reduce((sum, c) => sum + c.points, 0), 100)
    assert.equal(new Set(packet.rubric.criteria.map(c => c.id)).size, packet.rubric.criteria.length)
    for (const ref of packet.references) {
      assert.ok(ref.text.startsWith('#'))
      assert.equal(ref.source_sha256, sha256(readFileSync(join(REPO, ref.path))))
    }
    for (const [path, file] of Object.entries(packet.fixture)) assert.equal(file.sha256, sha256(readFileSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture', path))))
  }
})

test('aggregation is deterministic: full, half and missing; model totals ignored', () => {
  for (const task of Object.keys(RUBRICS)) {
    const packet = makePacket(task)
    for (const [verdict, score] of [['pass', 100], ['partial', 50], ['missing', 0]]) {
      assert.equal(scoreDecisions(packet, report, { ...responseFor(packet, verdict), score: 100000 }).score, score)
    }
  }
})

test('declared caps use decisions and reasons and apply after aggregation', () => {
  for (const [task, rubric] of Object.entries(RUBRICS)) {
    for (const [index, cap] of (rubric.caps ?? []).entries()) {
      const packet = makePacket(task)
      const response = responseFor(packet)
      response.caps[index].triggered = true
      assert.equal(scoreDecisions(packet, report, response).score, cap.total)
    }
  }
})

test('unknown, duplicate and omitted criteria/caps cannot produce a reward', () => {
  const packet = makePacket('S4-legacy-client-imports')
  for (const mutate of [
    r => r.decisions.pop(), r => r.decisions.push(r.decisions[0]), r => { r.decisions[0].id = 'fake' },
    r => { r.decisions[0].verdict = 'maybe' }, r => r.caps.pop(), r => r.caps.push(r.caps[0]),
  ]) {
    const response = responseFor(packet); mutate(response)
    assert.throws(() => scoreDecisions(packet, report, response), JudgeError)
  }
})

test('grading accepts explanations without quotations but still requires bounded reasons', () => {
  const packet = makePacket('H4-tsbuildinfo-trap')
  const response = responseFor(packet)
  response.decisions[0].reason = 'The answer locates the old emitted import and distinguishes it from the current source.'
  assert.equal(scoreDecisions(packet, { 'report.md': 'A differently formatted report.\n\n| A | B |' }, response).score, 100)
  assert.deepEqual(Object.keys(scoreDecisions(packet, report, response).decisions[0]), ['id', 'verdict', 'reason', 'points', 'awarded'])
  for (const mutate of [
    r => { r.decisions[0].reason = '' }, r => { r.decisions[0].reason = ' '.repeat(3) },
    r => { r.decisions[0].reason = 'x'.repeat(4001) }, r => { delete r.caps[0].reason },
    r => { r.caps[0].reason = 'x'.repeat(4001) }, r => { r.caps[0].triggered = 'yes' },
  ]) {
    const invalid = responseFor(packet); mutate(invalid)
    assert.throws(() => scoreDecisions(packet, report, invalid), JudgeError)
  }
})

test('candidate citations are checked against real paths and line bounds', () => {
  const packet = makePacket('S4-legacy-client-imports')
  const audit = auditCitations({ 'report.md': '/app/fixture/src/client/index.ts:10; Pet.tsx:1; nonexistent.ts:99; src/client/index.ts:9999' }, packet.fixture)
  assert.deepEqual(audit.map(c => c.valid), [true, true, false, false])
})

test('missing reports score zero without credentials or network', async t => {
  const root = sandbox(t); const task = 'S1-static-scan'
  cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
  const result = await grade({ packet: makePacket(task), appRoot: root, env: {}, fetchImpl: () => assert.fail('network') })
  assert.equal(result.score, 0); assert.equal(result.status, 'scored')
})

test('sealed hashes reject modified, deleted and untracked fixture files without trusting git', async t => {
  const task = 'S2-negative-scan'; const packet = makePacket(task)
  for (const mutate of [
    dir => writeFileSync(join(dir, 'index.js'), 'tampered'),
    dir => rmSync(join(dir, 'index.js')),
    dir => writeFileSync(join(dir, '.hidden-extra'), 'extra'),
    dir => writeFileSync(join(dir, '__proto__'), 'extra'),
  ]) {
    const root = sandbox(t)
    cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
    mutate(join(root, 'fixture'))
    const result = await grade({ packet, appRoot: root, env: {}, fetchImpl: () => assert.fail('network') })
    assert.equal(result.score, 0); assert.equal(result.status, 'invalid_submission')
  }
})

test('symlinks, special paths and oversized reports cannot escape or get silently truncated', async t => {
  const root = sandbox(t); const dir = join(root, 'files'); mkdirSync(dir)
  const secret = join(root, 'secret'); writeFileSync(secret, 'do not read')
  symlinkSync(secret, join(dir, 'report.md'))
  assert.throws(() => collectFiles(dir), SubmissionError)
  rmSync(join(dir, 'report.md')); writeFileSync(join(dir, 'report.md'), '12345')
  assert.throws(() => collectFiles(dir, { maxBytes: 4 }), SubmissionError)
  const task = 'S2-negative-scan'
  cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
  symlinkSync(dir, join(root, 'agent-output'))
  await assert.rejects(grade({ packet: makePacket(task), appRoot: root }), SubmissionError)
})

test('transport sends complete reports and validates returned decisions', async () => {
  const packet = makePacket('S2-negative-scan')
  const result = await callJudge(packet, report, config, { fetchImpl: async (url, init) => {
    assert.equal(url, config.url); assert.equal(init.redirect, 'error')
    assert.equal(init.headers.authorization, 'Bearer private-test-key')
    const request = JSON.parse(init.body)
    assert.equal(request.messages[0].content, SYSTEM)
    assert.equal(request.tools, undefined)
    assert.equal(request.response_format.type, 'json_object')
    const input = JSON.parse(request.messages[1].content)
    assert.deepEqual(input.candidate_reports, report)
    assert.equal(input.skill_condition, undefined)
    return apiResponse(responseFor(packet))
  } })
  assert.equal(result.score, 100)
  assert.equal(result.model.usage.total_tokens, 42)
  assert.ok(!JSON.stringify(result).includes(config.key))
})

test('transport fails loudly for HTTP errors, refusals, truncation and malformed JSON', async () => {
  const packet = makePacket('S2-negative-scan')
  for (const fetchImpl of [
    async () => new Response('secret echoed by server', { status: 401 }),
    async () => new Response('not JSON', { status: 200 }),
    async () => apiResponse({}, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    async () => apiResponse({}, { choices: [{ finish_reason: 'stop', message: { refusal: 'no', content: '{}' } }] }),
    async () => { throw new Error('private-test-key') },
  ]) await assert.rejects(callJudge(packet, report, config, { fetchImpl }), error => error instanceof JudgeError && !/secret|private-test-key/.test(error.message))
})

test('config has no implicit provider and never permits credentials in a URL', () => {
  assert.throws(() => apiConfig({}), JudgeError)
  const env = { REPORT_JUDGE_BASE_URL: 'https://judge.example/v1', REPORT_JUDGE_MODEL: 'model', REPORT_JUDGE_API_KEY: 'key' }
  assert.equal(apiConfig(env).url, 'https://judge.example/v1/chat/completions')
  for (const base of ['https://user:pass@judge.example/v1', 'https://judge.example/v1?key=secret', 'http://public.example/v1']) {
    assert.throws(() => apiConfig({ ...env, REPORT_JUDGE_BASE_URL: base }), JudgeError)
  }
})

test('output distinguishes judge errors from genuine zeros and clears stale rewards', t => {
  const dir = sandbox(t)
  writeResult(dir, { status: 'scored', score: 100 })
  assert.equal(readFileSync(join(dir, 'reward.txt'), 'utf8'), '1\n')
  writeFileSync(join(dir, 'reward.json'), '{"reward":1}')
  writeResult(dir, { status: 'judge_error', reason: 'timeout' })
  assert.equal(existsSync(join(dir, 'reward.txt')), false)
  assert.equal(existsSync(join(dir, 'reward.json')), false)
  writeResult(dir, { status: 'invalid_submission', score: 0 })
  assert.equal(readFileSync(join(dir, 'reward.txt'), 'utf8'), '0\n')
})

test('CLI failure produces details and nonzero exit, never a default-zero reward', t => {
  const dir = sandbox(t); const packet = makePacket('S2-negative-scan')
  const app = join(dir, 'app'); mkdirSync(app)
  cpSync(join(REPO, 'benchmark/tasks', packet.task, 'environment/fixture'), join(app, 'fixture'), { recursive: true })
  const reports = join(app, 'agent-output', packet.task); mkdirSync(reports, { recursive: true }); writeFileSync(join(reports, 'report.md'), 'test')
  const packetFile = join(dir, 'packet.json'); writeFileSync(packetFile, JSON.stringify(packet))
  const logs = join(dir, 'logs')
  assert.throws(() => execFileSync(process.execPath, [join(REPO, 'benchmark/report-judge/judge.mjs'), '--app', app, '--packet', packetFile, '--logs', logs],
    { env: { PATH: process.env.PATH }, stdio: 'pipe' }), error => error.status === 1)
  assert.equal(JSON.parse(readFileSync(join(logs, 'details.json'))).status, 'judge_error')
  assert.equal(existsSync(join(logs, 'reward.txt')), false)
})

test('preparation keeps agent prompts/fixtures exact and puts references/keys only in verifier', t => {
  const dir = sandbox(t); const out = join(dir, 'pilot')
  const manifest = prepare(out)
  assert.equal(manifest.tasks.length, 25)
  for (const { task } of manifest.tasks) {
    assert.equal(readFileSync(join(out, task, 'instruction.md'), 'utf8'), readFileSync(join(REPO, 'benchmark/tasks', task, 'instruction.md'), 'utf8'))
    assert.deepEqual(collectFiles(join(out, task, 'environment/fixture')), makePacket(task).fixture)
    const toml = readFileSync(join(out, task, 'task.toml'), 'utf8')
    assert.match(toml, /environment_mode = "separate"/)
    assert.ok(toml.includes(`version = "${RUBRICS[task].taskVersion ?? '4.0.0'}"`))
    assert.match(toml, /\[verifier.env\]/)
    assert.doesNotMatch(toml, /source = "\/app\/\.git"/)
    assert.doesNotMatch(readFileSync(join(out, task, 'environment/Dockerfile'), 'utf8'), /REPORT_JUDGE|packet.json|COPY .*tests/)
    assert.match(readFileSync(join(out, task, 'tests/test.sh'), 'utf8'), /set -euo pipefail/)
  }
  assert.throws(() => prepare(out), /already exists/)
  assert.throws(() => prepare(join(REPO, 'benchmark/tasks/pilot')), /outside benchmark\/tasks/)
})

test('generated standalone entry executes through symlinked paths (including macOS /tmp)', t => {
  const root = sandbox(t); const out = join(root, 'pilot'); prepare(out)
  const task = 'S2-negative-scan'; const app = join(root, 'app'); mkdirSync(app)
  cpSync(join(out, task, 'environment/fixture'), join(app, 'fixture'), { recursive: true })
  const alias = join(root, 'entry.mjs'); symlinkSync(join(out, task, 'tests/judge.mjs'), alias)
  const logs = join(root, 'logs')
  execFileSync(process.execPath, [alias, '--app', app, '--logs', logs], { env: { PATH: process.env.PATH }, stdio: 'pipe' })
  assert.equal(readFileSync(join(logs, 'reward.txt'), 'utf8'), '0\n')
  assert.equal(JSON.parse(readFileSync(join(logs, 'details.json'))).status, 'scored')
})

test('calibration retains keyword, wrong, injection and copied-prompt cases for every semantic task', () => {
  for (const task of Object.keys(RUBRICS)) {
    const cases = samples(task)
    assert.ok(cases.length >= 8)
    assert.equal(new Set(cases.map(c => c.id)).size, cases.length)
    assert.ok(cases.every(c => typeof c.report === 'string' && c.report.trim()))
    assert.deepEqual(cases.find(c => c.id === 'prompt-echo').expected, [0, 0])
    assert.equal(cases.find(c => c.id === 'historical-oracle').expected, null)
  }
})

test('S5-S9 retain bilingual, negated and contradictory reports as live calibration cases', () => {
  for (const task of Object.keys(RUBRICS).filter(task => /^S[5-9]-/.test(task))) {
    const cases = samples(task)
    assert.deepEqual(cases.find(c => c.id === 'paraphrase-zh').expected, [90, 100])
    assert.deepEqual(cases.find(c => c.id === 'correct-negation').expected, [90, 100])
    assert.ok(cases.find(c => c.id === 'contradiction').expected[1] < 100)
  }
})


test('H4 allows only original lib artifact deletion and keeps sealed evidence after clean', async t => {
  const task = 'H4-tsbuildinfo-trap'; const packet = makePacket(task)
  assert.deepEqual(packet.allowedDeletions.sort(), ['lib/index.js', 'lib/tsconfig.tsbuildinfo'])
  for (const mutate of [
    dir => rmSync(join(dir, 'lib'), { recursive: true }),
    dir => rmSync(join(dir, 'lib/tsconfig.tsbuildinfo')),
  ]) {
    const root = sandbox(t)
    cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
    const out = join(root, 'agent-output', task); mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'report.md'), 'Original stale import in lib/index.js:1; clean lib then rebuild, no source migration.')
    mutate(join(root, 'fixture'))
    let called = false
    const result = await grade({ packet, appRoot: root, evaluate: async sealed => {
      called = true
      assert.match(sealed.fixture['lib/index.js'].text, /resolveSessionPreset/)
      return { score: 30 }
    } })
    assert.ok(called); assert.equal(result.status, 'scored')
    assert.equal(result.citation_audit.find(c => c.path === 'lib/index.js')?.valid, true)
  }
  for (const mutate of [
    dir => rmSync(join(dir, 'src/index.ts')),
    dir => writeFileSync(join(dir, 'src/index.ts'), 'changed'),
    dir => writeFileSync(join(dir, 'package.json'), '{}'),
    dir => writeFileSync(join(dir, 'lib/index.js'), 'rewritten artifact'),
    dir => writeFileSync(join(dir, 'lib/new.js'), 'new artifact'),
    dir => writeFileSync(join(dir, 'allowedDeletions.json'), '["src/index.ts"]'),
  ]) {
    const root = sandbox(t)
    cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
    mutate(join(root, 'fixture'))
    const result = await grade({ packet, appRoot: root, evaluate: () => assert.fail('invalid submission must not call model') })
    assert.equal(result.status, 'invalid_submission'); assert.equal(result.score, 0)
  }
})

for (const task of ['H6-remote-error-trap', 'H12-remote-result-boundary-trap']) {
  test(`${task}: fixture mutations fail before model evaluation`, async t => {
    const packet = makePacket(task); assert.equal(packet.allowedDeletions, undefined)
    for (const mutation of ['delete', 'rewrite', 'add']) {
      const root = sandbox(t)
      cpSync(join(REPO, 'benchmark/tasks', task, 'environment/fixture'), join(root, 'fixture'), { recursive: true })
      const file = join(root, 'fixture', mutation === 'add' ? 'extra.txt' : 'package.json')
      if (mutation === 'delete') rmSync(file)
      else writeFileSync(file, 'modified')
      const result = await grade({ packet, appRoot: root, evaluate: () => assert.fail('network') })
      assert.equal(result.status, 'invalid_submission')
    }
  })
}


test('H diagnosis calibration covers contradictions and equivalent code without fake semantic assertions', () => {
  for (const task of ['H4-tsbuildinfo-trap', 'H6-remote-error-trap', 'H12-remote-result-boundary-trap']) {
    const cases = samples(task)
    assert.ok(cases.every(c => typeof c.report === 'string' && c.report.trim()))
    assert.ok(cases.find(c => c.id === 'correct-negation'))
    assert.ok(cases.find(c => c.id === 'contradiction'))
  }
  const sample = samples('H12-remote-result-boundary-trap').find(c => c.id === 'equivalent-success-first')
  assert.match(sample.report, /if \(response.ok\) return response.value/)
})
