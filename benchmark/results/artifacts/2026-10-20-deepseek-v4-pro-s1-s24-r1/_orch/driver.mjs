import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import * as L from './lib.mjs'

const TASKS = ["S1-static-scan","S2-negative-scan","S3-snapshot-migration","S4-legacy-client-imports","S5-negative-naming","S6-corridor-net-state","S7-unpublished-cohort","S8-release-routing-trap","S9-composer-coordinate-trap","S10-paste-rename-and-version-chip","S11-mermaid-lazyload-trap","S12-global-upgrade-ebusy-trap","S13-peer-range-vs-runtime","S14-link-install-lock-trap","S15-slot-error-boundary-crash","S16-self-host-upgrade-trap","S17-external-ui-plugin-onboarding-trap","S18-terminal-sprite-render-trap","S19-phantom-update-stale-host","S20-msvc-flock-trap","S21-resource-service-unavailable-trap","S22-duplicate-insert-boot-crash-trap","S23-passing-compat-guard-trap","S24-dock-cotenant-crash-trap"]
export const ORDER = []
for (const t of TASKS) { ORDER.push(t + '|noskill'); ORDER.push(t + '|skill') }

export function loadState() { return JSON.parse(readFileSync(join(L.ORCH, 'state.json'), 'utf8')) }
export function saveState(st) { writeFileSync(join(L.ORCH, 'state.json'), JSON.stringify(st, null, 2) + '\n', 'utf8') }
export function loadManifest() { return JSON.parse(readFileSync(join(L.ROOT, 'run-manifest.json'), 'utf8')) }
export function saveManifest(mf) { writeFileSync(join(L.ROOT, 'run-manifest.json'), JSON.stringify(mf, null, 2) + '\n', 'utf8') }

export function renderLedger(st) {
  const rows = []
  for (const key of ORDER) {
    const c = st.cells[key]
    const dur = c.duration != null ? c.duration + 's' : ''
    rows.push('| ' + key.replace('|', ' | ') + ' | ' + c.status + ' | ' + (c.start ?? '') + ' | ' + (c.end ?? '') + ' | ' + dur + ' | ' + (c.toolcalls ?? '') + ' | ' + (c.tokens ?? '') + ' |')
  }
  return '# DeepSeek-V4-Pro S1-S24 r1 — cell ledger\n\n| task | arm | status | start | end | duration | toolcalls | tokens |\n|---|---|---|---|---|---|---|---|\n' + rows.join('\n') + '\n'
}

export function runningCount() { return ORDER.filter(k => loadState().cells[k].status === 'running').length }
export function pendingKeys() { return ORDER.filter(k => loadState().cells[k].status === 'pending') }
export function runningKeys() { return ORDER.filter(k => loadState().cells[k].status === 'running') }

export function stageCell(task, arm) {
  const cellDir = join(L.ROOT, arm, task)
  const fixtureSrc = join(L.REPO, 'benchmark', 'tasks', task, 'environment', 'fixture')
  const fixtureDst = join(cellDir, 'fixture')
  const agentOut = join(cellDir, 'agent-output', task)
  rmSync(fixtureDst, { recursive: true, force: true })
  mkdirSync(agentOut, { recursive: true })
  cpSync(fixtureSrc, fixtureDst, { recursive: true })
  const srcHash = L.hashDir(fixtureSrc)
  const dstHash = L.hashDir(fixtureDst)
  if (JSON.stringify(srcHash.files) !== JSON.stringify(dstHash.files) || dstHash.count === 0) throw new Error('fixture mismatch ' + task + '/' + arm)
  return { cellDir, fixtureSha: JSON.stringify(dstHash.files), count: dstHash.count }
}

export function recordSpawn(task, arm, subagentId, fixtureSha) {
  const st = loadState()
  const key = task + '|' + arm
  st.cells[key] = { status: 'running', subagentId, start: new Date().toISOString(), end: null, duration: null, toolcalls: null, tokens: null, note: null, fixtureSha }
  saveState(st)
  writeFileSync(join(L.ROOT, 'cell-ledger.md'), renderLedger(st), 'utf8')
  return key
}

export function finishCell(task, arm) {
  const st = loadState()
  const key = task + '|' + arm
  const cell = st.cells[key]
  if (!cell || cell.status !== 'running') return { key, skipped: true, status: cell ? cell.status : 'missing' }
  const cellDir = join(L.ROOT, arm, task)
  const aud = L.auditCell(task, arm, cell.subagentId, cellDir, cell.fixtureSha)
  let status = 'ok'
  if (!aud.reportOk) status = 'silent-failure'
  else if (!aud.fixtureOk) status = 'invalid:fixture'
  else if (aud.violations.length > 0) status = 'invalid:roaming'
  const now = new Date().toISOString()
  cell.status = status
  cell.end = now
  cell.duration = Math.round((Date.now() - Date.parse(cell.start)) / 1000)
  cell.toolcalls = aud.toolCalls
  cell.tokens = aud.usage ? aud.usage.total : null
  cell.usage = aud.usage
  cell.reportPath = aud.reportPath
  cell.note = { violations: aud.violations.map(v => v.tool + ':' + v.field + ':' + v.path), exposure: aud.exposure, cardIds: aud.cardIds, logFound: aud.logFound }
  saveState(st)
  writeFileSync(join(L.ROOT, 'cell-ledger.md'), renderLedger(st), 'utf8')
  const mf = loadManifest()
  mf.roaming_audit[key] = aud.violations.length === 0 ? 'clean' : 'invalid:' + aud.violations.map(v => v.path).join(',')
  if (arm === 'noskill') mf.exposure_audit[task] = aud.exposure
  if (arm === 'skill') mf.skill_use[task] = aud.cardIds
  mf.execution_notes.push(now + ' finished ' + key + ' status=' + status + ' toolcalls=' + aud.toolCalls + ' tokens=' + (aud.usage ? aud.usage.total : '?'))
  saveManifest(mf)
  return { key, status, aud }
}
