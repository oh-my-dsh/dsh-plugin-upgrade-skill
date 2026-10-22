// r2 runner v2: audit + state/ledger/manifest management. No backslash/backtick/dollar-brace literals in source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as L from './lib.mjs';

const BS = L.BS;
const BT = L.BT;
const Q = String.fromCharCode(39);
const DQ = String.fromCharCode(34);

const FS_CALLS = ['readFileSync','writeFileSync','appendFileSync','readdirSync','existsSync','statSync','lstatSync','mkdirSync','cpSync','copyFileSync','rmSync','unlinkSync','renameSync','realpathSync','openSync','createWriteStream','createReadStream','readSync','writeSync','symlinkSync','readlinkSync','utimesSync','chmodSync','accessSync','globSync','opendirSync','execSync','execFileSync','spawnSync','execFile','spawn','exec'];
const FS_WRITES = new Set(['writeFileSync','appendFileSync','mkdirSync','cpSync','copyFileSync','rmSync','unlinkSync','renameSync','openSync','createWriteStream','writeSync','symlinkSync','utimesSync','chmodSync']);
const EXEC_CALLS = new Set(['execSync','execFileSync','spawnSync','execFile','spawn','exec']);
const FS_CALL_RE = new RegExp('(?:' + FS_CALLS.join('|') + ')');
const FS_CALL_RE_G = new RegExp('(?:' + FS_CALLS.join('|') + ')', 'g');
const TOOL_FILE_RE = new RegExp('tools' + BS + '.(read|write|edit|glob|grep|ls|list)' + BS + 's*' + BS + '(');
const TOOL_FILE_RE_G = new RegExp('tools' + BS + '.(read|write|edit|glob|grep|ls|list)' + BS + 's*' + BS + '(', 'g');
const PS_WRITE_CMDS = new Set(['set-content','out-file','new-item','add-content','copy-item','move-item','remove-item','rename-item','tee-object']);
const RE_DRIVE = new RegExp('^[A-Za-z]:[' + BS + BS + '/]');
const RE_UNC = new RegExp('^' + BS + BS + BS + BS + '[A-Za-z0-9_.-]+');
const TEMP_RE = new RegExp('(appdata' + BS + BS + 'local' + BS + BS + 'temp|%temp%|' + BS + '$env:temp|process' + BS + '.env' + BS + '.temp|os' + BS + '.tmpdir)', 'gi');
const CLASSY_RE = new RegExp('^[' + BS + BS + '/' + BS + '[' + BS + ']^' + '-' + ']+$');
const JUNK_RE = new RegExp('[' + BS + 's' + BT + '*|#<>{}' + BS + '[' + BS + ']]');
const ASSIGN_RE = new RegExp('(?:const|let|var)' + BS + 's+([A-Za-z_$][' + BS + 'w$]*)' + BS + 's*=' + BS + 's*([' + DQ + Q + BT + '])', 'g');
const REDIRECT_RE = /(>|Set-Content|Out-File|New-Item|Add-Content|Copy-Item|Move-Item|Remove-Item|Tee-Object)/i;
const VARREF_RE = new RegExp(BS + '$' + BS + '{' + 'NAME' + BS + '}|' + BS + 'b' + 'NAME' + BS + 'b');
const META_ESC_RE = /[.*+?^$()|[\]{}]/g;
const LEADSEP_RE = /^[\\/]+/;

export function looksLikePath(s) {
  if (!s || s.length < 2) return false;
  if (RE_DRIVE.test(s)) return true;
  if (RE_UNC.test(s)) return true;
  if (s.charAt(0) === '/' || s.startsWith('./') || s.startsWith('../') || s.startsWith('.' + BS)) return true;
  if (s.indexOf(BS) !== -1 || s.indexOf('/') !== -1) return true;
  return false;
}

function unescapeSeg(s) {
  return s.split(BS + BS).join(BS).split(BS + Q).join(Q).split(BS + DQ).join(DQ);
}
function quotedSegments(text) {
  const segs = [];
  const quotes = [DQ, Q, BT];
  for (const q of quotes) {
    let i = 0;
    while (i < text.length) {
      const s = text.indexOf(q, i);
      if (s === -1) break;
      let e = -1;
      for (let j = s + 1; j < text.length; j++) {
        if (text.charCodeAt(j) === 92) { j++; continue; }
        if (text.charAt(j) === q) { e = j; break; }
      }
      if (e === -1) break;
      const seg = text.slice(s + 1, e);
      if (seg.length > 1 && seg.length < 800) segs.push({ seg: seg, start: s });
      i = e + 1;
    }
  }
  return segs;
}
function closingQuote(text, from, q) {
  for (let j = from; j < text.length; j++) {
    if (text.charCodeAt(j) === 92) { j++; continue; }
    if (text.charAt(j) === q) return j;
  }
  return -1;
}

function callArgSpan(text, callIndex) {
  const open = text.indexOf('(', callIndex);
  if (open === -1) return null;
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    const ch = text.charCodeAt(j);
    if (ch === 92) { j++; continue; }
    if (ch === 34 || ch === 39 || ch === 96) {
      const q = text.charAt(j);
      let k = j + 1;
      while (k < text.length) {
        if (text.charCodeAt(k) === 92) { k += 2; continue; }
        if (text.charAt(k) === q) break;
        k++;
      }
      j = k;
      continue;
    }
    if (ch === 40) depth++;
    else if (ch === 41) { depth--; if (depth === 0) return { start: open, end: j }; }
  }
  return null;
}

function pushTempCands(text, cands, ctx, spans) {
  let tm;
  TEMP_RE.lastIndex = 0;
  while ((tm = TEMP_RE.exec(text)) !== null) {
    let hit = null;
    for (const s of spans) if (tm.index > s.start && tm.index < s.end) { hit = s; break; }
    const kind = hit ? 'real' : 'literal';
    let write = false;
    if (hit) write = hit.write;
    cands.push({ kind: kind, raw: os.tmpdir(), write: write, tempRef: true, ctx: ctx, source: 'temp-ref' });
  }
}

function extractFromText(text, cands, ctx) {
  if (!text || typeof text !== 'string') return;
  const spans = [];
  FS_CALL_RE_G.lastIndex = 0;
  let cm;
  while ((cm = FS_CALL_RE_G.exec(text)) !== null) {
    const span = callArgSpan(text, cm.index);
    if (span) spans.push({ call: cm[0], start: span.start, end: span.end, write: FS_WRITES.has(cm[0]) });
  }
  TOOL_FILE_RE_G.lastIndex = 0;
  let tm2;
  while ((tm2 = TOOL_FILE_RE_G.exec(text)) !== null) {
    const span = callArgSpan(text, tm2.index);
    if (span) spans.push({ call: 'tools.' + tm2[1], start: span.start, end: span.end, write: (tm2[1] === 'write' || tm2[1] === 'edit') });
  }
  const inSpan = (pos) => {
    for (const s of spans) if (pos > s.start && pos < s.end) return s;
    return null;
  };
  const takenWrite = new Set();
  for (const s of quotedSegments(text)) {
    const seg = unescapeSeg(s.seg);
    if (!looksLikePath(seg)) continue;
    if (JUNK_RE.test(seg)) continue;
    const hit = inSpan(s.start + 1);
    if (hit) {
      let write = hit.write;
      if (write) {
        if (takenWrite.has(hit.start)) write = false;
        else takenWrite.add(hit.start);
      }
      cands.push({ kind: 'real', raw: seg, write: write, ctx: ctx, source: 'text' });
    } else {
      cands.push({ kind: 'literal', raw: seg, write: false, ctx: ctx, source: 'text' });
    }
  }
  const assigns = [];
  ASSIGN_RE.lastIndex = 0;
  let am;
  while ((am = ASSIGN_RE.exec(text)) !== null) {
    const name = am[1];
    const q = am[2];
    const valStart = am.index + am[0].length;
    const e = closingQuote(text, valStart, q);
    if (e === -1) continue;
    const val = unescapeSeg(text.slice(valStart, e));
    if (looksLikePath(val) && !JUNK_RE.test(val)) assigns.push({ name: name, val: val });
  }
  if (assigns.length) {
    for (const a of assigns) {
      const esc = a.name.replace(META_ESC_RE, BS + '$&');
      const nameRe = new RegExp(VARREF_RE.source.split('NAME').join(esc));
      for (const s of spans) {
        const spanText = text.slice(s.start, s.end);
        if (nameRe.test(spanText)) {
          let write = s.write;
          if (!write && EXEC_CALLS.has(s.call) && REDIRECT_RE.test(spanText)) write = true;
          cands.push({ kind: 'real', raw: a.val, write: write, ctx: ctx + ':var', source: 'text-var' });
        }
      }
    }
  }
  pushTempCands(text, cands, ctx, spans);
}

const TOKEN_RE = new RegExp('(?:[A-Za-z]:[' + BS + BS + '/][^' + BS + 's"' + Q + ';|&<>]*|' + BS + BS + '[^' + BS + 's"' + Q + ';|&<>]*)', 'g');
function extractCmdTokens(cmd, cands, ctx) {
  const first = (cmd.trim().split(/\s+/)[0] || '').toLowerCase();
  const isWrite = PS_WRITE_CMDS.has(first) || /^(rm|del|mv|cp|mkdir|touch|rmdir|ri)\b/.test(first) || REDIRECT_RE.test(cmd);
  let m;
  TOKEN_RE.lastIndex = 0;
  const seen = new Set();
  while ((m = TOKEN_RE.exec(cmd)) !== null) {
    const tok = m[0];
    if (!looksLikePath(tok)) continue;
    const key = tok.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cands.push({ kind: 'real', raw: tok, write: isWrite, ctx: ctx + ':cmd-token', source: 'cmd-token' });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

function extractStructured(name, args, cands, ctx) {
  const n = (name || '').toLowerCase();
  const a = typeof args === 'string' ? safeParse(args) : (args || {});
  if (n === 'pwsh' || n === 'bash' || n === 'shell' || n === 'command' || n === 'terminal' || n === 'run_command') {
    const cmd = a.command || a.cmd || a.script || '';
    const cmdText = Array.isArray(cmd) ? cmd.join(' ') : String(cmd);
    extractFromText(cmdText, cands, ctx + ':cmd');
    extractCmdTokens(cmdText, cands, ctx + ':cmd');
    return;
  }
  if (n === 'run_code' || n === 'run' || n === 'code' || n === 'eval') {
    extractFromText(String(a.code || a.program || a.source || ''), cands, ctx + ':code');
    return;
  }
  const fields = ['file_path','path','pattern','dir','directory','file','filename','target','dest','destination','source','src','output'];
  const writeNames = new Set(['write','edit','create','mkdir','move','copy','delete','remove','multiedit','apply_patch','notebookedit']);
  for (const f of fields) {
    const v = a[f];
    if (typeof v === 'string' && v.trim() && looksLikePath(v.trim())) {
      cands.push({ kind: 'real', raw: v.trim(), write: writeNames.has(n), ctx: ctx + ':' + f, source: 'args', isGlobNoPath: (n === 'glob' && !a.path) });
    }
  }
}

export function classify(cand, ci) {
  let p = String(cand.raw || '').trim();
  p = p.replace(/[),;]+$/, '');
  if (!p) return { verdict: 'skip', reason: 'empty' };
  if (p.charAt(0) === '[' || CLASSY_RE.test(p)) return { verdict: 'skip', reason: 'regex character class span' };
  if (/^(node|git|pnpm|npm|npx|python|py)\s+(--version|-v|version|--help)\b/i.test(p)) return { verdict: 'skip', reason: 'version probe (no filesystem access)' };
  if (/^\$PSVersionTable/.test(p) || p === 'process.version') return { verdict: 'skip', reason: 'environment probe (no filesystem access)' };
  let abs = p;
  if (!RE_DRIVE.test(abs) && !RE_UNC.test(abs)) {
    const rel = abs.replace(LEADSEP_RE, '');
    try { abs = path.resolve(ci.sessionCwd, rel); } catch (e) { abs = path.normalize(abs); }
  }
  abs = path.normalize(abs);
  if (cand.isGlobNoPath && L.inside(abs, ci.cellDir)) return { verdict: 'ok', reason: 'glob argument style (cell-absolute pattern, no path param)' };
  if (L.inside(abs, ci.cellDir)) return { verdict: 'ok', reason: 'inside cell directory' };
  if (ci.arm === 'skill' && L.inside(abs, ci.skillDir)) {
    return cand.write ? { verdict: 'violation', reason: 'write to read-only skill directory', path: abs } : { verdict: 'ok', reason: 'skill directory read' };
  }
  if (cand.write) return { verdict: 'violation', reason: 'write outside cell directory', path: abs };
  if (cand.kind === 'literal') return { verdict: 'readmit', reason: 'quoted path literal without filesystem access', path: abs };
  const exists = fs.existsSync(abs);
  if (cand.kind === 'real' && exists) return { verdict: 'violation', reason: 'read of existing path outside allowlist', path: abs };
  return { verdict: 'readmit', reason: 'read of non-existent path (zero information)', path: abs };
}

export function auditCellSessions(sessions, ci) {
  const cands = [];
  for (const s of sessions) {
    for (const e of s.events) {
      if (e.type !== 'tool/call' && e.type !== 'tool/ptc-dispatch') continue;
      const name = e.data && e.data.name;
      const args = e.data && e.data.arguments;
      extractStructured(name, args, cands, (s.id || 'sess') + '/' + (name || '?'));
    }
  }
  const violations = [];
  const readmits = [];
  let oks = 0;
  const vSeen = new Set();
  const rSeen = new Set();
  for (const c of cands) {
    const cls = classify(c, ci);
    if (cls.verdict === 'violation') {
      const key = cls.path + '|' + cls.reason;
      if (vSeen.has(key)) continue;
      vSeen.add(key);
      violations.push({ path: cls.path, reason: cls.reason, ctx: c.ctx, source: c.source });
    } else if (cls.verdict === 'readmit') {
      const key = cls.path + '|' + cls.reason;
      if (rSeen.has(key)) continue;
      rSeen.add(key);
      readmits.push({ path: cls.path, reason: cls.reason, ctx: c.ctx, source: c.source });
    } else if (cls.verdict === 'ok') oks++;
  }
  return { violations: violations, readmits: readmits, oks: oks, candidates: cands.length };
}

export function summarizeSessions(sessions) {
  let toolcalls = 0, tokens = 0, inputTokens = 0, outputTokens = 0;
  let first = null, last = null;
  const models = new Set();
  for (const s of sessions) {
    for (const e of s.events) {
      if (e.type === 'tool/call' || e.type === 'tool/ptc-dispatch') toolcalls++;
      if (e.type === 'assistant/message' && e.data && e.data.usage) {
        tokens += e.data.usage.totalTokens || 0;
        inputTokens += e.data.usage.inputTokens || 0;
        outputTokens += e.data.usage.outputTokens || 0;
      }
      const src = e.data && e.data.message && e.data.message.source;
      if (src && src.model) models.add(src.provider + '/' + src.model);
      const t = e.time;
      if (typeof t === 'number') {
        if (first === null || t < first) first = t;
        if (last === null || t > last) last = t;
      }
    }
    if (typeof s.createdAt === 'number' && (first === null || s.createdAt < first)) first = s.createdAt;
  }
  return { toolcalls: toolcalls, tokens: tokens, inputTokens: inputTokens, outputTokens: outputTokens, first: first, last: last, models: Array.from(models) };
}

export function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h > 0) return h + 'h' + String(m).padStart(2, '0') + 'm' + String(ss).padStart(2, '0') + 's';
  return m + 'm' + String(ss).padStart(2, '0') + 's';
}
export function iso(ms) { return new Date(ms).toISOString().replace('.000Z', 'Z'); }

export function findReport(task, arm) {
  const dir = L.agentOutputDir(task, arm);
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + path.sep + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else {
        const st = fs.statSync(path.join(d, e.name));
        out.push({ rel: r, size: st.size, path: path.join(d, e.name) });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir, '');
  return out;
}

export function findDeliverable(task, arm) {
  // A deliverable = a non-empty file directly under agent-output/<task>/ (depth 0) that is not a
  // scratch/log/script artifact. Nested files (_scratch/, demo dirs) never count. All files remain
  // visible via findReport for transparency.
  const EXCL_NAME = /(run-log|scratch|forensics-run|verdicts|\.log$)/i;
  const EXCL_EXT = new Set(['.mjs', '.js', '.cjs', '.py', '.ps1', '.sh', '.cmd', '.bat', '.zst', '.zstd', '.svg', '.jsonl', '.patch', '.log']);
  const DOC_EXT = new Set(['.md', '.txt', '.json', '.markdown']);
  const all = findReport(task, arm);
  return all.filter(f => {
    if (f.rel.indexOf('\\') !== -1 || f.rel.indexOf('/') !== -1) return false;
    const ext = f.rel.slice(f.rel.lastIndexOf('.')).toLowerCase();
    if (EXCL_EXT.has(ext)) return false;
    if (EXCL_NAME.test(f.rel)) return false;
    if (DOC_EXT.has(ext)) return f.size > 0;
    return f.size > 2000;
  });
}

export function exposureAudit(reportText) {
  const pats = ['skills/plugin-upgrade', 'skills' + BS + 'plugin-upgrade', 'SKILL.md', 'DSH-0.', 'DSH-1.'];
  const found = new Set();
  for (const pat of pats) {
    if (reportText.indexOf(pat) !== -1) found.add(pat);
  }
  return found.size ? 'hit: ' + Array.from(found).join(', ') : 'clean';
}

export function extractCardIds(reportText) {
  const ids = new Set();
  const full = reportText.match(/DSH-0\.\d+(?:\.\d+)?-[A-Za-z0-9-]+/g) || [];
  for (let f of full) {
    f = f.replace(/-+$/, '');
    if (!/^DSH-0\.\d+(?:\.\d+)?-[A-Za-z]+\d*-\d+$/.test(f)) continue;
    const m = f.match(/([A-Z]\d+-\d+)$/);
    ids.add(m ? m[1] : f);
  }
  const short = reportText.match(/\b[A-Z]\d-\d{2}\b/g) || [];
  for (const s of short) ids.add(s);
  return Array.from(ids).sort();
}

export function loadState() {
  const p = path.join(L.ORCH, 'state.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return null;
}
export function saveState(s) { fs.writeFileSync(path.join(L.ORCH, 'state.json'), JSON.stringify(s, null, 2)); }

export function renderLedger(state) {
  const lines = [];
  lines.push('# Cell Ledger — step5-preview S1–S24 r2 (DSH in-session subagents, round 2)');
  lines.push('');
  lines.push('| task | arm | status | start | end | duration | toolcalls | tokens |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const task of L.TASKS) {
    for (const arm of L.ARMS) {
      const c = state.cells[L.cellId(task, arm)];
      if (!c || c.status === 'pending') {
        lines.push('| ' + task + ' | ' + arm + ' | pending | | | | | |');
      } else {
        lines.push('| ' + task + ' | ' + arm + ' | ' + c.status + ' | ' + (c.start || '') + ' | ' + (c.end || '') + ' | ' + (c.duration || '') + ' | ' + (c.toolcalls === undefined ? '' : c.toolcalls) + ' | ' + (c.tokens === undefined ? '' : c.tokens) + ' |');
      }
    }
  }
  const vals = Object.values(state.cells);
  const done = vals.filter(c => c.status && c.status !== 'pending' && c.status !== 'in-flight').length;
  lines.push('');
  lines.push('cells accounted: ' + done + '/48 (pending: ' + (48 - done) + ')');
  fs.writeFileSync(path.join(L.ART, 'cell-ledger.md'), lines.join('\n') + '\n');
}

export function updateManifest(state) {
  const roaming = {}, exposure = {}, skillUse = {};
  const counts = {};
  for (const task of L.TASKS) {
    for (const arm of L.ARMS) {
      const c = state.cells[L.cellId(task, arm)];
      const st = c ? c.status : 'pending';
      counts[st] = (counts[st] || 0) + 1;
      if (st !== 'pending' && st !== 'in-flight') {
        roaming[L.cellId(task, arm)] = c.roaming || 'clean';
        if (arm === 'noskill') exposure[task] = c.exposure || 'clean';
        else skillUse[task] = c.skillUse || 'none';
      }
    }
  }
  const manifest = Object.assign({}, state.manifestBase, {
    roaming_audit: roaming,
    exposure_audit: exposure,
    skill_use: skillUse,
    cell_counts: counts,
    execution_notes: state.executionNotes,
    updated_at: iso(Date.now()),
  });
  fs.writeFileSync(path.join(L.ART, 'run-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
