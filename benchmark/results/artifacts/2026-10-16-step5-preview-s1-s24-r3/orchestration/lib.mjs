// r2 benchmark orchestration library (DSH in-session subagents). No backslash/backtick literals in source.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';

export const BS = String.fromCharCode(92);
export const BT = String.fromCharCode(96);
export const REPO = ['E:', 'deepseek-harness', 'dsh-plugin-upgrade-skill'].join(BS);
export const TASKS_DIR = path.join(REPO, 'benchmark', 'tasks');
export const SKILL_DIR = path.join(REPO, 'skills', 'plugin-upgrade');
export const ART = path.join(REPO, 'benchmark', 'results', 'artifacts', '2026-10-16-step5-preview-s1-s24-r3');
export const ORCH = path.join(ART, 'orchestration');
export const SESSIONS_ROOT = path.join('C:', 'Users', 'lhh', '.dsh', 'sessions');
export const SESSIONS_DIR = path.join(SESSIONS_ROOT, '--E-deepseek-harness-test-lhh010--');
export const TASKS = ['S1-static-scan','S2-negative-scan','S3-snapshot-migration','S4-legacy-client-imports','S5-negative-naming','S6-corridor-net-state','S7-unpublished-cohort','S8-release-routing-trap','S9-composer-coordinate-trap','S10-paste-rename-and-version-chip','S11-mermaid-lazyload-trap','S12-global-upgrade-ebusy-trap','S13-peer-range-vs-runtime','S14-link-install-lock-trap','S15-slot-error-boundary-crash','S16-self-host-upgrade-trap','S17-external-ui-plugin-onboarding-trap','S18-terminal-sprite-render-trap','S19-phantom-update-stale-host','S20-msvc-flock-trap','S21-resource-service-unavailable-trap','S22-duplicate-insert-boot-crash-trap','S23-passing-compat-guard-trap','S24-dock-cotenant-crash-trap'];
export const ARMS = ['noskill', 'skill'];

export function cellDir(task, arm) { return path.join(ART, arm, task); }
export function cellId(task, arm) { return task + '/' + arm; }
export function fixtureDir(task, arm) { return path.join(cellDir(task, arm), 'fixture'); }
export function agentOutputDir(task, arm) { return path.join(cellDir(task, arm), 'agent-output', task); }
export function low(p) { return path.normalize(p).toLowerCase(); }
export function inside(child, parent) {
  const c = low(child); const p = low(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

export function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
export function hashTree(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + path.sep + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else out[r] = sha256File(path.join(d, e.name));
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
}

export function readSessionLog(file) {
  const buf = fs.readFileSync(file);
  const starts = [];
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i+1] === 0xb5 && buf[i+2] === 0x2f && buf[i+3] === 0xfd) starts.push(i);
  }
  const chunks = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k]; const e = k + 1 < starts.length ? starts[k+1] : buf.length;
    try { chunks.push(zlib.zstdDecompressSync(buf.subarray(s, e))); } catch (err) { /* trailing partial frame */ }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const events = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { events.push(JSON.parse(t)); } catch (err) { /* partial trailing line */ }
  }
  return events;
}
export function sessionLogFile(dir) {
  let best = null; let bestM = -1;
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch (err) { return null; }
  for (const f of entries) {
    if (/^session.*\.jsonl\.zstd$/.test(f)) {
      const p = path.join(dir, f);
      let m = -1;
      try { m = fs.statSync(p).mtimeMs; } catch (err) { continue; }
      if (m > bestM) { bestM = m; best = p; }
    }
  }
  return best;
}
export function findCellSessions(cellDirAbs, sinceMs, sessionsDir) {
  const root = sessionsDir || SESSIONS_DIR;
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch (err) { return out; }
  for (const d of dirs) {
    const full = path.join(root, d);
    let st = null;
    try { st = fs.statSync(full); } catch (err) { continue; }
    if (!st.isDirectory()) continue;
    const f = sessionLogFile(full);
    if (!f) continue;
    let m = -1;
    try { m = fs.statSync(f).mtimeMs; } catch (err) { continue; }
    if (m < sinceMs) continue;
    let events = [];
    try { events = readSessionLog(f); } catch (err) { continue; }
    const head = events.find(e => e.type === 'session');
    if (!head) continue;
    if ((head.delegationDepth || 0) < 1) continue;
    if ((head.cwd || '').toLowerCase() !== low(cellDirAbs)) continue;
    out.push({ dir: full, file: f, id: head.id, createdAt: head.createdAt, events });
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

export function buildPrompt(task, arm) {
  const cd = cellDir(task, arm);
  const ao = path.join(cd, 'agent-output', task);
  let ins = fs.readFileSync(path.join(TASKS_DIR, task, 'instruction.md'), 'utf8');
  ins = ins.split('/app/agent-output/' + task + '/').join(ao + path.sep);
  ins = ins.split('/app/agent-output/' + task).join(ao);
  ins = ins.split('/app/agent-output/').join(path.join(cd, 'agent-output') + path.sep);
  ins = ins.split('/app/fixture/').join(path.join(cd, 'fixture') + path.sep);
  ins = ins.split('/app/fixture').join(path.join(cd, 'fixture'));
  if (ins.indexOf('/app/') !== -1) throw new Error('unrewritten /app/ path remains in ' + task);
  const skillLine = arm === 'skill' ? '  3. ' + SKILL_DIR + path.sep + ' (read-only skill reference)\n' : '';
  const tempPath = ['AppData', 'Local', 'Temp'].join(BS);
  const boundary = [
    'WORKSPACE BOUNDARY (hard rule — you are running inside a benchmark harness):',
    'The ONLY paths you may read, list, glob, grep, or open are:',
    '  1. ' + path.join(cd, 'fixture') + path.sep + '        (your task evidence)',
    '  2. ' + path.join(cd, 'agent-output') + path.sep + '   (write your report here)',
    skillLine + 'Every other path is FORBIDDEN — including but not limited to: the repository',
    'root and any file there (README, docs, drafts), the benchmark/ directory',
    'tree, solution/ and tests/ subdirectories, .dsh/, node_modules/, system',
    'temporary directories (the Windows TEMP / %TEMP% / ' + tempPath,
    'directories), and anything outside the paths listed above. You MUST NOT',
    'write to ANY path outside your own cell directory — not even a temporary',
    'or scratch file. If you need a temporary script, write it inside',
    ao + path.sep + ' and delete it when you are done.',
    'Do not list, glob, or open any parent or sibling directory even "just to',
    'look". If something you need is missing from your allowed paths, state',
    'that in your report instead of searching elsewhere.',
  ].join('\n');
  const q = BT;
  const armClause = arm === 'skill'
    ? 'You may additionally consult the plugin-upgrade skill (read-only) at ' + q + SKILL_DIR + path.sep + q + '. You must not read the task' + String.fromCharCode(39) + 's ' + q + 'solution/' + q + ' or ' + q + 'tests/' + q + ' directories.'
    : 'You have no skills available for this task. You must not read, search, or cite anything under the repository' + String.fromCharCode(39) + 's ' + q + 'skills/' + q + ' directory (including SKILL.md files and card identifiers such as ' + q + 'DSH-0.1.x-xx' + q + '), nor ' + q + 'solution/' + q + ' or ' + q + 'tests/' + q + '. Work only from the task materials in this directory.';
  return ins + '\n\n' + boundary + '\n\n' + armClause + '\n';
}

export function prepareCell(task, arm) {
  const cd = cellDir(task, arm);
  const src = path.join(TASKS_DIR, task, 'environment', 'fixture');
  const dst = path.join(cd, 'fixture');
  fs.mkdirSync(agentOutputDir(task, arm), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  const srcHashes = hashTree(src);
  const dstHashes = hashTree(dst);
  const mismatches = [];
  for (const rel of Object.keys(srcHashes)) {
    if (dstHashes[rel] !== srcHashes[rel]) mismatches.push(rel);
  }
  const prompt = buildPrompt(task, arm);
  const promptFile = path.join(ORCH, 'prompts', task + '__' + arm + '.md');
  fs.writeFileSync(promptFile, prompt, 'utf8');
  return {
    task, arm, cellDir: cd,
    fixtureFiles: Object.keys(dstHashes).length,
    fixtureVerified: mismatches.length === 0 && Object.keys(dstHashes).length > 0,
    mismatches,
    promptFile,
  };
}
