// Builds the solver prompt for one cell: task segment + boundary segment + arm clause.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TASKS } from './common.mjs'
import { cellDir } from './stage.mjs'

const B = String.fromCharCode(96)

export function buildPrompt(task, arm) {
  const dir = cellDir(task, arm)
  const instruction = readFileSync(join(TASKS, task, 'instruction.md'), 'utf8')
  const outRel = 'agent-output/' + task + '/'

  const taskSegment = [
    '=== TASK SEGMENT (task brief) ===',
    '',
    'The task brief below is your assignment. It is reproduced verbatim from the sealed task material.',
    '',
    instruction.trim(),
    '',
    '=== END TASK SEGMENT ===',
    '',
    'The brief above is written for a container where /app/fixture is the sealed fixture and',
    '/app/agent-output is the report directory. In THIS environment those paths are mapped to your cell',
    'directory:',
    '',
    '  /app/fixture        ->  ' + dir + '/fixture',
    '  /app/agent-output   ->  ' + dir + '/agent-output',
    '',
    'Your report must be written under:',
    '',
    '  ' + dir + '/' + outRel,
    '',
    '(Any filename ending in .md or .txt is acceptable, as the brief states.)',
  ].join('\n')

  const boundarySegment = [
    '=== BOUNDARY SEGMENT (read whitelist / write scope) ===',
    '',
    'Your READ whitelist is exactly:',
    '',
    '  ' + dir + '/',
    '',
    arm === 'skill'
      ? 'Within that whitelist, skills/plugin-upgrade/ is provided as reference material for you to use.'
      : 'Within that whitelist there is no skills/ directory, and none may be consulted.',
    '',
    'HARD RULES:',
    '',
    '- You MUST NOT read, list, search, or open anything outside ' + dir + '/.',
    '- You MUST NOT read tests/, solution/, benchmark/results/, or any other directory of this repository.',
    '- You MUST NOT write to ANY path outside ' + dir + '/ - including system TEMP, /tmp, the user home,',
    '  the repository, or the fixture source tree. Any temporary file you need must be written under',
    '  ' + dir + '/agent-output/ (a scratch subdirectory there is fine).',
    '- Do not modify, move, or delete anything under ' + dir + '/fixture/ unless the brief explicitly authorizes it.',
    '- Do not modify the skill, any evaluator, or any reference answer.',
    '- Do not publish, push, or contact external services.',
    '- Do NOT probe the live host environment for facts the fixture does not contain: no ' + B + 'dsh --version' + B + ',',
    '  ' + B + 'dsh --help' + B + ', ' + B + 'dsh --dump-config' + B + ', ' + B + 'dsh --dump-config-schema' + B + ',',
    '  ' + B + 'dsh plugin --help' + B + ', ' + B + 'dsh headless --help' + B + ', and no ' + B + 'cordis_inspect_*' + B + ' runtime',
    '  introspection. The installed host runs a DIFFERENT version than the version this task is about, so',
    '  anything you learn from it is out of scope and wrong. Work from the task brief and the fixture only.',
    '- Do not re-read the same file repeatedly. Read each fixture file once, take your notes, and move on;',
    '  a repeated read cycle wastes the run and invalidates the cell.',
    '- If you cannot verify something from the brief and the fixture, mark it as unconfirmed in the report',
    '  instead of guessing or going outside the whitelist to find out.',
    '- When your report cites a card or a reference document, write ONLY the key points and the card ID.',
    '  Do NOT paste the full text of a card or reference into your report or into your reply.',
    '  (Context budget is 256k; full-text pasting is a protocol violation.)',
    '',
    '=== END BOUNDARY SEGMENT ===',
  ].join('\n')

  const armClause = arm === 'skill'
    ? [
        '=== ARM CLAUSE (skill available) ===',
        '',
        'Before you start the analysis, read skills/plugin-upgrade/SKILL.md in your cell directory.',
        'Consult its references/ files as needed for the change cards and API details.',
        'Follow the workflow that skill prescribes. Its bundled scripts under skills/plugin-upgrade/scripts/',
        'are yours to run - run them from the cell-local copy, never from another location.',
        '',
        '=== END ARM CLAUSE ===',
      ].join('\n')
    : [
        '=== ARM CLAUSE (no skill) ===',
        '',
        'There is no skills/ directory for you. You MUST NOT read, open, or consult any file under a',
        'skills/ path anywhere on this machine. Work from the task brief and the fixture alone.',
        '',
        '=== END ARM CLAUSE ===',
      ].join('\n')

  const delivery = [
    '=== DELIVERY ===',
    '',
    'This is an unattended run. Do not ask questions; do not wait for confirmation.',
    '',
    'Budget: you have 25 minutes of wall clock. Plan for that. A good run reads the fixture files once',
    'or twice, writes the report, and finishes. If you find yourself re-reading files or repeating a',
    'probe, stop and write what you have.',
    '',
    'When the report file is written, finish with exactly: DONE',
  ].join('\n')

  return [taskSegment, boundarySegment, armClause, delivery].join('\n\n')
}
