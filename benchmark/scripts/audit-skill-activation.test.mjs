// benchmark/scripts/audit-skill-activation.test.mjs
//
// Tests for the deterministic skill-activation auditor. Every fixture is
// synthetic (mkdtemp), shaped after the verified real format:
// Harbor v0.22.0 trial directories with a Codex CLI 0.152.0 session log
// (agent/sessions/**/rollout-*.jsonl, {"timestamp","ordinal","type","payload"})
// and an optional ATIF-v1.7 agent/trajectory.json. No real trajectories are
// committed, and nothing here depends on the network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditInput, auditTrial, buildAggregate, classifyShellCommand, decodeJsonStringAt,
  extractExecCalls, findSkillsInstructions, loadSessionLog, matchTargetFile,
  normalizePath, parseSkillsInstructions, renderJson, renderMarkdown,
  resolveTargetRoots, shellWords, stripShellComments,
} from './audit-skill-activation.mjs'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'audit-skill-activation.mjs')
const TARGET = { targetName: 'plugin-upgrade', targetPaths: [], condition: 'with-skill', baselineCondition: 'no-target-skill' }

// ── synthetic fixture builders ────────────────────────────────────────────────

function initTrial(name = 'T1-demo__abc123') {
  const root = mkdtempSync(join(tmpdir(), 'skill-audit-'))
  const trialDir = join(root, name)
  mkdirSync(join(trialDir, 'agent', 'sessions', '2026', '09', '01'), { recursive: true })
  return { root, trialDir }
}

function jsonl(...lines) {
  return lines.map((line) => JSON.stringify(line)).join('\n') + '\n'
}

function eventLine(ordinal, type, payload) {
  return { timestamp: '2026-09-01T00:00:00.000Z', ordinal, type, payload }
}

function messageLine(ordinal, role, text) {
  return eventLine(ordinal, 'response_item', { type: 'message', role, content: [{ type: 'input_text', text }] })
}

function execLine(ordinal, cmd, workdir = '/app') {
  const input = `tools.exec_command({cmd:${JSON.stringify(cmd)},workdir:${JSON.stringify(workdir)},yield_time_ms:10000});`
  return eventLine(ordinal, 'response_item', { type: 'custom_tool_call', name: 'exec', input })
}

function outputLine(ordinal, text) {
  return eventLine(ordinal, 'response_item', { type: 'custom_tool_call_output', output: [{ type: 'input_text', text }] })
}

function skillsText({ roots = { r0: '/root/.agents/skills' }, skills = [] } = {}) {
  const rootLines = Object.entries(roots).map(([id, path]) => `- \`${id}\` = \`${path}\``).join('\n')
  const skillLines = skills
    .map((skill) => `- ${skill.name}: ${skill.desc ?? 'some skill'}. (file: ${skill.rootId}/${skill.rel.replace('/SKILL.md', '')}/SKILL.md)`)
    .join('\n')
  return `<skills_instructions>\n## Skills\nA skill is a set of local instructions to follow that is stored in a \`SKILL.md\` file.\n### Skill roots\n${rootLines}\n### Available skills\n${skillLines}\n</skills_instructions>`
}

function withTargetSkills() {
  return skillsText({
    roots: { r0: '/root/.agents/skills', r1: '/tmp/codex-home/skills/.system' },
    skills: [
      { name: 'plugin-upgrade', rootId: 'r0', rel: 'plugin-upgrade/SKILL.md', desc: 'Inspect or upgrade installed DSH plugins' },
      { name: 'imagegen', rootId: 'r1', rel: 'imagegen/SKILL.md', desc: 'Generate images' },
    ],
  })
}

/** Write a session log with system skills + given event lines. */
function writeTrialWithEvents(trialDir, { skills = withTargetSkills(), events = [] } = {}) {
  const lines = [messageLine(0, 'developer', skills), ...events]
  writeFileSync(join(trialDir, 'agent', 'sessions', '2026', '09', '01', 'rollout-test.jsonl'), jsonl(...lines))
}

function runAudit(trialDir, overrides = {}) {
  return auditTrial({ trialDir, ...TARGET, ...overrides })
}

// ── lexical / decoding / shell helpers ────────────────────────────────────────

test('normalizePath is lexical and resolves dot segments', () => {
  assert.equal(normalizePath('/a/b/../c/./d'), '/a/c/d')
  assert.equal(normalizePath('a//b/./c'), 'a/b/c')
  assert.equal(normalizePath('/a/../../b'), '/b')
  assert.equal(normalizePath('..'), '..')
})

test('shellWords honors quotes and escapes', () => {
  assert.deepEqual(shellWords(`sed -n '1,240p' /app/file`), ['sed', '-n', '1,240p', '/app/file'])
  assert.deepEqual(shellWords('cat "a b" c'), ['cat', 'a b', 'c'])
  assert.deepEqual(shellWords('cat a\\ b'), ['cat', 'a b'])
})

test('stripShellComments removes line comments only', () => {
  assert.equal(stripShellComments('# cat skill/SKILL.md\ncat real.md'), '\ncat real.md')
  assert.equal(stripShellComments('cat real.md # trailing'), 'cat real.md # trailing')
})

test('decodeJsonStringAt decodes escapes', () => {
  const { value } = decodeJsonStringAt('"a\\nb\\"c\\\\d"', 0)
  assert.equal(value, 'a\nb"c\\d')
})

test('extractExecCalls pairs cmd/workdir and flags mismatches', () => {
  const input = 'tools.exec_command({cmd:"cat /a",workdir:"/app"});tools.exec_command({cmd:"ls",workdir:"/tmp"});'
  const { calls, paired } = extractExecCalls(input)
  assert.equal(paired, true)
  assert.deepEqual(calls.map((c) => c.cmd), ['cat /a', 'ls'])
  assert.deepEqual(calls.map((c) => c.workdir), ['/app', '/tmp'])
  const mismatched = extractExecCalls('tools.exec_command({cmd:"cat /a"});')
  assert.equal(mismatched.paired, false)
  assert.equal(mismatched.calls.length, 1)
})

test('classifyShellCommand: content commands and operand extraction', () => {
  assert.deepEqual(classifyShellCommand('cat /a/SKILL.md'), { kind: 'content-read', command: 'cat /a/SKILL.md', files: ['/a/SKILL.md'], recursive: false })
  const sed = classifyShellCommand(`sed -n '1,240p' /app/fixture/src/index.ts`)
  assert.equal(sed.kind, 'content-read')
  assert.deepEqual(sed.files, ['/app/fixture/src/index.ts'])
  const head = classifyShellCommand('head -5 /a/SKILL.md')
  assert.deepEqual(head.files, ['/a/SKILL.md'])
  const tail = classifyShellCommand('tail /a/SKILL.md')
  assert.deepEqual(tail.files, ['/a/SKILL.md'])
  const less = classifyShellCommand('less /a/SKILL.md')
  assert.deepEqual(less.files, ['/a/SKILL.md'])
  const grep = classifyShellCommand(`grep 'pattern' /a/SKILL.md`)
  assert.equal(grep.kind, 'content-read')
  assert.ok(grep.files.includes('/a/SKILL.md'))
  const awk = classifyShellCommand(`awk '{print}' /a/SKILL.md`)
  assert.deepEqual(awk.files, ['/a/SKILL.md'])
  const varPrefix = classifyShellCommand('FOO=bar cat /a/SKILL.md')
  assert.deepEqual(varPrefix.files, ['/a/SKILL.md'])
})

test('classifyShellCommand: discovery, complex, interpreter, none', () => {
  for (const cmd of ['ls skills/', 'find / -name SKILL.md', 'stat /a/SKILL.md', 'test -f /a/SKILL.md', '[ -f /a/SKILL.md ]', 'file /a/SKILL.md', 'glob /a/*']) {
    assert.equal(classifyShellCommand(cmd).kind, 'discovery', cmd)
  }
  assert.equal(classifyShellCommand('cat /a | grep x').kind, 'complex')
  assert.equal(classifyShellCommand('cat /a && ls').kind, 'complex')
  assert.equal(classifyShellCommand('cat $(echo /a)').kind, 'complex')
  assert.equal(classifyShellCommand('python -c "open(\'/a/SKILL.md\')"').kind, 'interpreter')
  assert.equal(classifyShellCommand('echo "cat /a/SKILL.md"').kind, 'none')
  assert.equal(classifyShellCommand('printf "cat /a/SKILL.md"').kind, 'none')
  assert.equal(classifyShellCommand('mkdir -p /x').kind, 'none')
})

test('classifyShellCommand: grep -r recursive flag', () => {
  assert.equal(classifyShellCommand('grep -r x /root/skills').recursive, true)
  assert.equal(classifyShellCommand('grep x /root/skills').recursive, false)
  assert.equal(classifyShellCommand('rg --recursive x /root/skills').recursive, true)
})

test('parseSkillsInstructions extracts roots and the skill catalog', () => {
  const parsed = parseSkillsInstructions(withTargetSkills())
  assert.equal(parsed.roots.get('r0'), '/root/.agents/skills')
  assert.deepEqual(parsed.skills.map((s) => s.name), ['plugin-upgrade', 'imagegen'])
  assert.equal(parsed.skills[0].rel, 'plugin-upgrade/SKILL.md')
  assert.ok(findSkillsInstructions(['no marker', withTargetSkills()]) !== null)
  assert.equal(findSkillsInstructions(['no marker']), null)
})

// ── target identity ───────────────────────────────────────────────────────────

test('matchTargetFile: absolute, relative-with-workdir, references, root', () => {
  const roots = [{ path: '/root/.agents/skills/plugin-upgrade', source: 'auto' }]
  assert.deepEqual(matchTargetFile('/root/.agents/skills/plugin-upgrade/SKILL.md', '/app', roots).rel, 'SKILL.md')
  assert.equal(matchTargetFile('/root/.agents/skills/plugin-upgrade/references/foo.md', '/app', roots).isReference, true)
  assert.equal(matchTargetFile('/root/.agents/skills/plugin-upgrade', '/app', roots).isRoot, true)
  assert.equal(matchTargetFile('/elsewhere/SKILL.md', '/app', roots), null)
  const relativeRoots = [{ path: 'skills/plugin-upgrade', source: 'explicit' }]
  assert.equal(matchTargetFile('skills/plugin-upgrade/SKILL.md', '/app', relativeRoots).isSkillMd, true)
  assert.equal(matchTargetFile('/app/skills/plugin-upgrade/SKILL.md', '/app', relativeRoots).isSkillMd, true)
})

test('resolveTargetRoots: union of explicit paths and auto runtime roots; hard error when unknown', () => {
  const parsed = parseSkillsInstructions(withTargetSkills())
  const entry = parsed.skills[0]
  const union = resolveTargetRoots({ targetName: 'plugin-upgrade', targetPaths: ['skills/plugin-upgrade'], skillsEntry: entry, roots: parsed.roots })
  assert.equal(union.length, 2)
  assert.deepEqual(union.map((r) => r.path), ['skills/plugin-upgrade', '/root/.agents/skills/plugin-upgrade'])
  assert.throws(
    () => resolveTargetRoots({ targetName: 'plugin-upgrade', targetPaths: [], skillsEntry: undefined, roots: new Map() }),
    /target path unknown/,
  )
})

// ── per-trial audits ──────────────────────────────────────────────────────────

test('valid structured SKILL.md read: opened with count, first event, normalized file', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [
      execLine(3, 'ls /root/.agents/skills', '/app'),
      execLine(5, 'sed -n \'1,200p\' /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
      execLine(9, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
    ],
  })
  const result = runAudit(trialDir)
  const target = result.targetSkill
  assert.equal(target.supplied, true)
  assert.equal(target.opened, true)
  assert.equal(target.openCount, 2)
  assert.equal(target.firstOpenEvent, 5)
  assert.deepEqual(target.openedFiles, ['SKILL.md'])
  assert.equal(target.contentAuditable, true)
  assert.deepEqual(result.evidence.map((e) => e.file), ['SKILL.md', 'SKILL.md'])
  assert.deepEqual(result.evidence.map((e) => e.ordinal), [5, 9])
})

test('discovery only (ls/find/stat + listing output) is NOT an open — the key regression', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [
      execLine(2, 'ls /root/.agents/skills', '/app'),
      outputLine(3, 'plugin-upgrade  imagegen'),
      execLine(4, 'ls /root/.agents/skills/plugin-upgrade', '/app'),
      execLine(6, 'stat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
      execLine(8, 'find /root/.agents -name SKILL.md', '/app'),
      messageLine(10, 'assistant', 'I see plugin-upgrade in the skills catalog'),
    ],
  })
  const target = runAudit(trialDir).targetSkill
  assert.equal(target.supplied, true)
  assert.equal(target.discovered, true)
  assert.equal(target.opened, false)
  assert.equal(target.openCount, 0)
  assert.equal(target.firstOpenEvent, null)
})

test('prose mention alone is neither discovery evidence nor an open', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [
      messageLine(1, 'user', 'migrate this plugin'),
      messageLine(2, 'assistant', 'I should read skills/plugin-upgrade/SKILL.md to check the card'),
    ],
  })
  const target = runAudit(trialDir).targetSkill
  assert.equal(target.supplied, true)
  assert.equal(target.opened, false)
})

test('target unavailable: no catalog entry, explicit target path, no reads', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    skills: skillsText({ roots: { r1: '/tmp/codex-home/skills/.system' }, skills: [{ name: 'imagegen', rootId: 'r1', rel: 'imagegen/SKILL.md' }] }),
    events: [execLine(1, 'ls /app', '/app')],
  })
  const target = runAudit(trialDir, { targetPaths: ['skills/plugin-upgrade'] }).targetSkill
  assert.equal(target.supplied, false)
  assert.equal(target.opened, false)
})

test('target supplied but unread: supplied=true, opened=false', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, { events: [execLine(1, 'sed -n \'1,200p\' /app/fixture/src/index.ts', '/app')] })
  const target = runAudit(trialDir).targetSkill
  assert.equal(target.supplied, true)
  assert.equal(target.opened, false)
})

test('reference-only access: opened stays false, referenceAccessed true, any content access true', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [execLine(4, 'cat /root/.agents/skills/plugin-upgrade/references/rollup-0.1.2.md', '/app')],
  })
  const target = runAudit(trialDir).targetSkill
  assert.equal(target.opened, false)
  assert.deepEqual(target.referencesOpened, ['references/rollup-0.1.2.md'])
  assert.equal(target.anyTargetSkillContentAccess, true)
})

test('repeated reads: openCount counts every read, firstOpenEvent is the first', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [
      execLine(2, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
      execLine(4, 'head -5 /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
      execLine(6, 'sed -n \'1,10p\' /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
    ],
  })
  const target = runAudit(trialDir).targetSkill
  assert.equal(target.opened, true)
  assert.equal(target.openCount, 3)
  assert.equal(target.firstOpenEvent, 2)
})

test('partial reads count: sed and head are content access', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [execLine(1, 'sed -n \'1,3p\' /root/.agents/skills/plugin-upgrade/SKILL.md', '/app')],
  })
  assert.equal(runAudit(trialDir).targetSkill.opened, true)
  const { trialDir: trial2 } = initTrial('T1-demo__head')
  writeTrialWithEvents(trial2, { events: [execLine(1, 'head /root/.agents/skills/plugin-upgrade/SKILL.md', '/app')] })
  assert.equal(runAudit(trial2).targetSkill.opened, true)
})

test('other skill read: otherSkills.opened with the skill name, target untouched', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [execLine(3, 'cat /tmp/codex-home/skills/.system/imagegen/SKILL.md', '/app')],
  })
  const result = runAudit(trialDir)
  assert.equal(result.targetSkill.opened, false)
  assert.equal(result.otherSkills.opened, true)
  assert.deepEqual(result.otherSkills.skills, ['imagegen'])
})

test('baseline other-skill access is observational, reported only under the baseline condition label', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [execLine(3, 'cat /tmp/codex-home/skills/.system/imagegen/SKILL.md', '/app')],
  })
  const baseline = runAudit(trialDir, { condition: 'no-target-skill' })
  assert.equal(baseline.baselineHasOtherSkillAccess, true)
  assert.equal(baseline.targetSkill.opened, false)
  const withSkill = runAudit(trialDir, { condition: 'with-skill' })
  assert.equal(withSkill.baselineHasOtherSkillAccess, false)
})

test('unrelated SKILL.md with the same basename never counts', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, { events: [execLine(2, 'cat /app/other/SKILL.md', '/app')] })
  const result = runAudit(trialDir)
  assert.equal(result.targetSkill.opened, false)
  assert.equal(result.otherSkills.opened, false)
})

test('echo/printf of the path is not a read', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, { events: [execLine(2, 'echo "cat /root/.agents/skills/plugin-upgrade/SKILL.md"', '/app')] })
  assert.equal(runAudit(trialDir).targetSkill.opened, false)
})

test('shell comment mentioning the read never counts', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [execLine(2, '# cat /root/.agents/skills/plugin-upgrade/SKILL.md\nls /app', '/app')],
  })
  assert.equal(runAudit(trialDir).targetSkill.opened, false)
})

test('find/stat/ls/glob false positives: discovered at most, never opened', () => {
  for (const [cmd, expectDiscovered] of [
    ['find /root/.agents -name SKILL.md', false],
    ['ls /root/.agents/skills/plugin-upgrade', true],
    ['stat /root/.agents/skills/plugin-upgrade/SKILL.md', true],
    ['test -f /root/.agents/skills/plugin-upgrade/SKILL.md', true],
  ]) {
    const { trialDir } = initTrial(`T1-demo__${cmd.split(' ')[0]}`)
    writeTrialWithEvents(trialDir, { events: [execLine(2, cmd, '/app')] })
    const target = runAudit(trialDir).targetSkill
    assert.equal(target.opened, false, cmd)
    assert.equal(target.discovered, expectDiscovered, cmd)
  }
})

test('assistant prose naming SKILL.md does not open; output mention marks discovery only', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [
      messageLine(1, 'assistant', 'Read /root/.agents/skills/plugin-upgrade/SKILL.md next'),
      execLine(2, 'ls /root/.agents/skills', '/app'),
      outputLine(3, 'plugin-upgrade'),
    ],
  })
  const target = runAudit(trialDir).targetSkill
  assert.equal(target.opened, false)
  assert.equal(target.discovered, true)
})

test('ambiguous complex shell mentioning the target warns and never opens', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [execLine(4, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md | grep card', '/app')],
  })
  const result = runAudit(trialDir)
  assert.equal(result.targetSkill.opened, false)
  assert.ok(result.warnings.some((warning) => warning.startsWith('ambiguous-shell-access')))
})

test('grep -r over the skill root opens; plain grep on the root dir does not', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, { events: [execLine(1, 'grep -r card /root/.agents/skills/plugin-upgrade', '/app')] })
  assert.equal(runAudit(trialDir).targetSkill.opened, true)
  const { trialDir: trial2 } = initTrial('T1-demo__norec')
  writeTrialWithEvents(trial2, { events: [execLine(1, 'grep card /root/.agents/skills/plugin-upgrade', '/app')] })
  const target2 = runAudit(trial2).targetSkill
  assert.equal(target2.opened, false)
  assert.equal(target2.discovered, true)
})

test('explicit target path resolves relative commands against workdir', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [execLine(2, 'cat skills/plugin-upgrade/SKILL.md', '/app')],
  })
  const result = runAudit(trialDir, { targetPaths: ['skills/plugin-upgrade'] })
  assert.equal(result.targetSkill.opened, true)
  assert.deepEqual(result.targetSkill.openedFiles, ['SKILL.md'])
})

test('unknown target path without explicit --target-path is a hard error', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    skills: skillsText({ roots: { r1: '/tmp/x' }, skills: [{ name: 'imagegen', rootId: 'r1', rel: 'imagegen/SKILL.md' }] }),
    events: [],
  })
  assert.throws(() => runAudit(trialDir, { targetPaths: [] }), /target path unknown/)
})

test('ATIF-only trial: supplied detectable, opened not auditable, explicit warning', () => {
  const { trialDir } = initTrial()
  writeFileSync(join(trialDir, 'agent', 'trajectory.json'), JSON.stringify({
    schema_version: 'ATIF-v1.7',
    steps: [
      { step_id: 1, source: 'system', message: withTargetSkills() },
      { step_id: 2, source: 'agent', message: 'I will use the plugin-upgrade skill.' },
    ],
  }))
  const result = runAudit(trialDir)
  assert.equal(result.targetSkill.supplied, true)
  assert.equal(result.targetSkill.opened, false)
  assert.equal(result.targetSkill.contentAuditable, false)
  assert.ok(result.warnings.some((warning) => warning.startsWith('content-access-not-auditable')))
})

test('malformed trajectory.json is a hard error', () => {
  const { trialDir } = initTrial()
  writeFileSync(join(trialDir, 'agent', 'trajectory.json'), '{not json')
  assert.throws(() => runAudit(trialDir), /malformed trajectory/)
})

test('trajectory.json without a steps array is unsupported', () => {
  const { trialDir } = initTrial()
  writeFileSync(join(trialDir, 'agent', 'trajectory.json'), JSON.stringify({ something: 'else' }))
  assert.throws(() => runAudit(trialDir), /unsupported trajectory schema/)
})

test('unsupported trial layout (no agent artifacts) is a hard error', () => {
  const { root } = initTrial('empty-dir')
  assert.throws(() => auditTrial({ trialDir: join(root, 'empty-dir'), ...TARGET }), /unsupported trial layout/)
})

test('invalid trailing jsonl lines warn without killing the audit', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, { events: [execLine(2, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app')] })
  const file = join(trialDir, 'agent', 'sessions', '2026', '09', '01', 'rollout-test.jsonl')
  writeFileSync(file, readFileSync(file, 'utf8') + '{"truncated": tr')
  const result = runAudit(trialDir)
  assert.equal(result.targetSkill.opened, true)
  assert.ok(result.warnings.some((warning) => warning.startsWith('malformed-trajectory-line')))
})

test('exec pairing mismatch warns', () => {
  const { trialDir } = initTrial()
  const input = 'tools.exec_command({cmd:"cat /root/.agents/skills/plugin-upgrade/SKILL.md"});'
  writeFileSync(
    join(trialDir, 'agent', 'sessions', '2026', '09', '01', 'rollout-test.jsonl'),
    jsonl(messageLine(0, 'developer', withTargetSkills()), eventLine(2, 'response_item', { type: 'custom_tool_call', name: 'exec', input })),
  )
  const result = runAudit(trialDir)
  assert.equal(result.targetSkill.opened, true, 'cmd without workdir still audits with workdir undefined')
  assert.ok(result.warnings.some((warning) => warning.startsWith('exec-call-pairing-mismatch')))
})

// ── multi-trial, aggregation, determinism, privacy ────────────────────────────

test('job directory expands all trials and aggregates', () => {
  const { root } = initTrial('T1-demo__a')
  const trial1 = join(root, 'T1-demo__a')
  const trial2 = join(root, 'T2-demo__b')
  mkdirSync(join(trial2, 'agent', 'sessions', '2026', '09', '01'), { recursive: true })
  writeTrialWithEvents(trial1, { events: [execLine(1, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app')] })
  writeTrialWithEvents(trial2, { events: [execLine(1, 'ls /app', '/app')] })
  const audit = auditInput({ inputPath: root, ...TARGET })
  assert.equal(audit.results.length, 2)
  assert.equal(audit.aggregate.trials, 2)
  assert.equal(audit.aggregate.targetSupplied, '2/2')
  assert.equal(audit.aggregate.targetSkillOpened, '1/2')
  assert.equal(audit.aggregate.activationRateEligible, 0.5)
  assert.equal(audit.aggregate.anyTargetSkillContentAccess, '1/2')
})

test('condition grouping and baseline counts in the aggregate', () => {
  const synthetic = [
    { trial: { condition: 'with-skill' }, targetSkill: { supplied: true, opened: true, anyTargetSkillContentAccess: true }, otherSkills: { opened: false }, baselineHasOtherSkillAccess: false },
    { trial: { condition: 'with-skill' }, targetSkill: { supplied: true, opened: false, anyTargetSkillContentAccess: false }, otherSkills: { opened: false }, baselineHasOtherSkillAccess: false },
    { trial: { condition: 'no-target-skill' }, targetSkill: { supplied: false, opened: false, anyTargetSkillContentAccess: false }, otherSkills: { opened: true }, baselineHasOtherSkillAccess: true },
  ]
  const aggregate = buildAggregate(synthetic, 'no-target-skill')
  assert.equal(aggregate.trials, 3)
  assert.equal(aggregate.targetSupplied, '2/3')
  assert.equal(aggregate.targetSkillOpened, '1/3')
  assert.equal(aggregate.byCondition['with-skill'].opened, '1/2')
  assert.equal(aggregate.byCondition['no-target-skill'].otherSkillAccess, '1/1')
  assert.equal(aggregate.baselineHasOtherSkillAccess, '1/3')
})

test('first event index is the 0-based session-log ordinal', () => {
  const { trialDir } = initTrial()
  writeTrialWithEvents(trialDir, {
    events: [
      execLine(0, 'ls /app', '/app'),
      execLine(7, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
      execLine(11, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
    ],
  })
  assert.equal(runAudit(trialDir).targetSkill.firstOpenEvent, 7)
})

test('JSON output is byte-deterministic across repeated runs', () => {
  const { root } = initTrial('T1-demo__det')
  const trialDir = join(root, 'T1-demo__det')
  writeTrialWithEvents(trialDir, { events: [execLine(2, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app')] })
  const audit = auditInput({ inputPath: root, ...TARGET })
  assert.equal(renderJson(audit), renderJson(auditInput({ inputPath: root, ...TARGET })))
})

test('Markdown output is byte-deterministic across repeated runs', () => {
  const { root } = initTrial('T1-demo__det')
  const trialDir = join(root, 'T1-demo__det')
  writeTrialWithEvents(trialDir, { events: [execLine(2, 'head /root/.agents/skills/plugin-upgrade/SKILL.md', '/app')] })
  const audit = auditInput({ inputPath: root, ...TARGET })
  assert.equal(renderMarkdown(audit), renderMarkdown(auditInput({ inputPath: root, ...TARGET })))
})

test('paths are normalized skill-relative and no absolute/private path leaks into output', () => {
  const { root } = initTrial('T1-demo__priv')
  const trialDir = join(root, 'T1-demo__priv')
  writeTrialWithEvents(trialDir, {
    events: [
      execLine(2, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md', '/app'),
      execLine(3, 'cat /root/.agents/skills/plugin-upgrade/references/private/notes.md', '/app'),
    ],
  })
  const audit = auditInput({ inputPath: root, ...TARGET })
  const json = renderJson(audit)
  assert.ok(!json.includes('/root/.agents/skills'), 'runtime absolute path leaked')
  assert.ok(!json.includes(root), 'local tmp path leaked')
  assert.ok(json.includes('"SKILL.md"'))
  assert.ok(json.includes('references/private/notes.md'))
})

test('command text and output text never leak into the output', () => {
  const { root } = initTrial('T1-demo__secret')
  const trialDir = join(root, 'T1-demo__secret')
  writeTrialWithEvents(trialDir, {
    events: [
      execLine(2, 'cat /root/.agents/skills/plugin-upgrade/SKILL.md && curl -H "Authorization: sk-secret-123"', '/app'),
      outputLine(3, 'API_KEY=sk-super-secret environment secret'),
    ],
  })
  const audit = auditInput({ inputPath: root, ...TARGET })
  const json = renderJson(audit)
  assert.ok(!json.includes('sk-secret-123'))
  assert.ok(!json.includes('sk-super-secret'))
  assert.ok(!json.includes('curl'))
  assert.ok(!json.includes('Authorization'))
})

// ── CLI behavior ──────────────────────────────────────────────────────────────

test('CLI: opened=false is exit 0; markdown renders; unknown option and bad input exit non-zero', () => {
  const { root } = initTrial('T1-demo__cli')
  const trialDir = join(root, 'T1-demo__cli')
  writeTrialWithEvents(trialDir, { events: [execLine(1, 'ls /app', '/app')] })
  const base = [SCRIPT, trialDir, '--target-name', 'plugin-upgrade', '--target-path', 'skills/plugin-upgrade']
  const out = execFileSync('node', [...base, '--condition', 'with-skill', '--markdown'], { cwd: root, encoding: 'utf8' })
  assert.ok(out.includes('SKILL.md opened: false'))
  const jsonOut = execFileSync('node', [...base, '--json'], { cwd: root, encoding: 'utf8' })
  assert.ok(JSON.parse(jsonOut).trials.length === 1)
  let exitCode = 0
  try { execFileSync('node', [SCRIPT, trialDir, '--target-name', 'x', '--bogus'], { cwd: root, encoding: 'utf8' }) } catch (error) { exitCode = error.status }
  assert.equal(exitCode, 2)
  let badInput = 0
  try { execFileSync('node', [SCRIPT, join(root, 'nope'), '--target-name', 'x'], { cwd: root, encoding: 'utf8' }) } catch (error) { badInput = error.status }
  assert.equal(badInput, 1)
})
