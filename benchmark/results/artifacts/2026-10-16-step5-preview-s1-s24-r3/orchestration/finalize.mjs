// r2 finalize: per-cell closing verification + audit verdict. No backslash/backtick literals.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
import * as R from './runner.mjs';

export function loadCellSessions(cell) {
  const out = [];
  for (const s of (cell.sessions || [])) {
    const dir = path.join(L.SESSIONS_DIR, s.id);
    const f = L.sessionLogFile(dir);
    if (!f) continue;
    let events = [];
    try { events = L.readSessionLog(f); } catch (e) { continue; }
    const head = events.find(e => e.type === 'session') || {};
    let cwd = head.cwd || '';
    for (const e of events) {
      if (e.type === 'working-directory/change' && e.data && e.data.cwd) cwd = e.data.cwd;
    }
    out.push({ id: s.id, file: f, createdAt: head.createdAt || s.createdAt || 0, events: events, cwd: cwd });
  }
  return out;
}

export function finalizeCell(state, cellIdStr) {
  const parts = cellIdStr.split('/');
  const task = parts[0]; const arm = parts[1];
  const cell = state.cells[cellIdStr];
  const cd = L.cellDir(task, arm);
  const src = path.join(L.TASKS_DIR, task, 'environment', 'fixture');
  const dst = path.join(cd, 'fixture');
  const srcH = L.hashTree(src); const dstH = L.hashTree(dst);
  let fixtureOk = true; const fMism = [];
  for (const rel of Object.keys(srcH)) if (dstH[rel] !== srcH[rel]) { fixtureOk = false; fMism.push(rel); }
  const extra = Object.keys(dstH).filter(r => !(r in srcH));
  const reports = R.findReport(task, arm);
  const reportFiles = R.findDeliverable(task, arm);
  const allOutputFiles = reports.filter(f => f.size > 0).map(f => f.rel);
  const sessions = loadCellSessions(cell);
  const ci = { cellDir: cd, arm: arm, skillDir: L.SKILL_DIR, sessionCwd: sessions.length ? sessions[sessions.length - 1].cwd : cd };
  const audit = R.auditCellSessions(sessions, ci);
  const sum = R.summarizeSessions(sessions);
  // per-session spans summed (r1 fixed-duration semantics), first/last across sessions for start/end
  let spanSum = 0;
  for (const s of sessions) {
    let f = null, l = null;
    for (const e of s.events) {
      if (typeof e.time === 'number') { if (f === null || e.time < f) f = e.time; if (l === null || e.time > l) l = e.time; }
    }
    if (typeof s.createdAt === 'number' && (f === null || s.createdAt < f)) f = s.createdAt;
    if (f !== null && l !== null && l > f) spanSum += (l - f);
  }
  let reportText = '';
  if (reportFiles.length) { try { reportText = fs.readFileSync(reportFiles[0].path, 'utf8'); } catch (e) {} }
  const exposure = arm === 'noskill' ? R.exposureAudit(reportText) : null;
  const skillUse = arm === 'skill' ? (R.extractCardIds(reportText).join(',') || 'none') : null;
  let status;
  if (!fixtureOk) status = 'invalid:fixture';
  else if (reportFiles.length === 0) status = 'silent-failure';
  else if (audit.violations.length > 0) status = 'invalid:roaming';
  else if (cell.relaunched) status = 'relaunched';
  else status = 'ok';
  cell.status = status;
  cell.fixturePostOk = fixtureOk;
  cell.fixtureMismatches = fMism;
  cell.reportFiles = reportFiles.map(f => f.rel);
  cell.allOutputFiles = allOutputFiles;
  const vstr = audit.violations.map(v => {
    const sess = (v.ctx || '').split('/')[0];
    return '[' + sess + '] ' + v.reason + ': ' + v.path;
  }).join(' ; ');
  cell.roaming = audit.violations.length ? 'invalid:' + vstr : 'clean';
  cell.roamingDetail = audit;
  cell.exposure = exposure;
  cell.skillUse = skillUse;
  cell.toolcalls = sum.toolcalls;
  cell.tokens = sum.tokens;
  cell.start = sum.first ? R.iso(sum.first) : (cell.dispatchedIso || '');
  cell.end = sum.last ? R.iso(sum.last) : '';
  cell.duration = spanSum > 0 ? R.fmtDur(spanSum) : '';
  cell.models = sum.models;
  const detail = {
    cell: cellIdStr, status: status,
    sessions: sessions.map(s => ({ id: s.id, file: s.file, events: s.events.length, cwd: s.cwd })),
    fixture: { ok: fixtureOk, mismatches: fMism, extra: extra },
    reportFiles: reportFiles.map(f => ({ rel: f.rel, size: f.size })),
    allOutputFiles: allOutputFiles,
    audit: { violations: audit.violations, readmits: audit.readmits, oks: audit.oks, candidates: audit.candidates },
    summary: { toolcalls: sum.toolcalls, tokens: sum.tokens, inputTokens: sum.inputTokens, outputTokens: sum.outputTokens, models: sum.models, start: cell.start, end: cell.end, duration: cell.duration },
    exposure: exposure, skillUse: skillUse,
  };
  fs.writeFileSync(path.join(L.ORCH, 'audit', task + '__' + arm + '.json'), JSON.stringify(detail, null, 2));
  return cell;
}
