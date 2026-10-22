import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const pad = (n) => String(n).padStart(2, "0");
export const isoFrom = (ms) => {
  const d = new Date(ms + 8 * 3600 * 1000);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + "+08:00";
};
export const nowIso = () => isoFrom(Date.now());

export const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
export const shaFile = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
export const hashTree = (dir) => {
  const m = {};
  for (const f of walk(dir)) m[path.relative(dir, f).replace(/\\/g, "/")] = shaFile(f);
  return m;
};

export function prepareCell(repo, cell) {
  const srcFixture = path.join(repo, "benchmark", "tasks", cell.task, "environment", "fixture");
  fs.mkdirSync(cell.cellDir, { recursive: true });
  const destFixture = path.join(cell.cellDir, "fixture");
  if (!fs.existsSync(destFixture)) fs.cpSync(srcFixture, destFixture, { recursive: true });
  fs.mkdirSync(path.join(cell.cellDir, "agent-output"), { recursive: true });
  const before = hashTree(destFixture);
  const src = hashTree(srcFixture);
  const keys = Object.keys(before);
  if (keys.length === 0) throw new Error("empty fixture for " + cell.task);
  if (JSON.stringify(before) !== JSON.stringify(src)) throw new Error("fixture hash mismatch src vs copy: " + cell.task);
  fs.writeFileSync(path.join(cell.cellDir, "fixture-hash-before.json"), JSON.stringify({ generatedAt: nowIso(), algorithm: "sha256", source: srcFixture, files: before }, null, 2) + "\n");
  cell.fixtureFiles = keys.length;
  cell.fixtureBeforeOk = true;
  return keys.length;
}

export function buildPrompt(skillDir, cell, instruction) {
  const cd = cell.cellDir;
  const armClause = cell.arm === "noskill"
    ? "本格为 noskill 臂：禁止读取 skills/ 目录任何内容；仅凭格内材料与自身知识完成任务。"
    : "本格为 skill 臂：开工前先读 " + skillDir + "\\SKILL.md，" + skillDir + "\\references\\ 目录按需查阅。";
  const wl = cell.arm === "skill" ? " 以及 " + skillDir + "\\ 目录（只读）" : "";
  return [
    "你是 S 系列基准评测的一个解题格（solver），全新实例、单次尝试。本格在无人值守环境下运行：不会有后续用户消息，题面即用户授权（BENCHMARK-AUTH-v1），形成方案后直接执行，不要暂停等待任何确认，不要向用户提问。",
    "",
    "# 一、任务段（题面全文，来自 benchmark/tasks/" + cell.task + "/instruction.md）",
    "",
    "<<<<<<instruction.md begin>>>>>>",
    instruction,
    "<<<<<<instruction.md end>>>>>>",
    "",
    "路径映射（本机为 Windows；题面中的容器路径 /app 即本单元格目录）：",
    "- /app/ = " + cd,
    "- /app/fixture/ = " + cd + "\\fixture\\ （密封任务材料，已就位）",
    "- /app/agent-output/ = " + cd + "\\agent-output\\ （已建好；你的报告与一切临时文件写在这里）",
    "- 最终报告按题面要求写到 " + cd + "\\agent-output\\ 下（题面若指定子目录如 /app/agent-output/" + cell.task + "/，则写 " + cd + "\\agent-output\\" + cell.task + "\\；文件名按题面，未指定则自拟，.md/.txt 均可）。",
    "- 题面提到的“容器内本地文档”，noskill 臂指格内材料本身；skill 臂另见臂条款。",
    "",
    "# 二、边界段",
    "- 你的读取白名单 = 本单元格目录 " + cd + "\\ 下全部内容" + wl + "。",
    "- 禁读：任何任务的 tests\\、solution\\ 目录；benchmark\\results\\ 下任何内容；仓库其他一切目录；也包括 benchmark\\tasks\\" + cell.task + "\\ 原始任务目录（材料已复制进格内，不要回读源头，题面文本以上文为准）。",
    "- 禁止向格目录之外的任何路径写入（含系统 TEMP、仓库其他目录）——临时文件一律写在 " + cd + "\\agent-output\\ 下。",
    "- 禁止任何 git 操作（读写都不行；三会话共享仓库）。",
    "- 除题面明确允许外，不要访问外部网络服务。",
    "- 报告引用变更卡片/reference 时只写要点与卡片 ID，禁止全文粘贴（上下文预算 256k）。",
    "",
    "# 三、臂条款",
    armClause,
    "",
    "# 完成标准",
    "1. 报告（非空）已写到上述指定位置；",
    "2. fixture 遵守题面的只读/修改纪律（S 系列题面若声明只读，则 " + cd + "\\fixture\\ 一个字节都不能变）；",
    "3. 结束时在你的最终回复里简要报告：报告文件绝对路径、完成内容一句话、有无边界偏差（理想为无）。不要粘贴报告全文。"
  ].join("\n");
}

export function findSessionDir(sessionsRoot, sessionId) {
  for (const g of fs.readdirSync(sessionsRoot)) {
    const p = path.join(sessionsRoot, g, sessionId);
    try { if (fs.statSync(p).isDirectory()) return p; } catch {}
  }
  return null;
}

export function decodeSession(file) {
  const buf = fs.readFileSync(file);
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const parts = [];
  let idx = 0;
  let bad = 0;
  while ((idx = buf.indexOf(magic, idx)) !== -1) {
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(idx)).toString("utf8")); } catch { bad++; }
    idx += 4;
  }
  const events = [];
  let unparsed = 0;
  for (const ln of parts.join("").split("\n")) {
    if (!ln.trim()) continue;
    try { events.push(JSON.parse(ln)); } catch { unparsed++; }
  }
  return { events, frames: parts.length, badMagic: bad, unparsed };
}

export function metrics(events) {
  let toolcalls = 0, requests = 0, tokensIn = 0, tokensOut = 0, tokensTotal = 0, lastTime = 0;
  for (const e of events) {
    if (typeof e.time === "number" && e.time > lastTime) lastTime = e.time;
    if (e.type === "tool/ptc-dispatch-start") toolcalls++;
    if (e.type === "tool/call") {
      const nm = e.data && e.data.name;
      if (nm && nm !== "tools") toolcalls++;
      if (nm === "tools") { try { const a = JSON.parse(e.data.arguments || "{}"); if (a && typeof a === "object" && "run_code" in a) toolcalls++; } catch {} }
    }
    if (e.type === "assistant/message" && e.data && e.data.usage) {
      const u = e.data.usage;
      requests++;
      tokensIn += u.inputTokens || 0;
      tokensOut += u.outputTokens || 0;
      tokensTotal += u.totalTokens || (u.inputTokens || 0) + (u.outputTokens || 0);
    }
  }
  return { toolcalls, requests, tokensIn, tokensOut, tokensTotal, lastTime };
}

const PATH_RE = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s"'\x60|;,)\]}<>]*/g;
const TEMP_RE = /[$]env:(TEMP|TMP)\b|%TEMP%|%TMP%|AppData[\\/]+Local[\\/]+Temp\b/gi;
const RELUP_RE = /\.\.[\\/]/g;

export function auditCandidates(events, opts) {
  const cellDir = opts.cellDir;
  const extraRead = opts.extraRead || [];
  const base = (s) => s.replace(/[\\/]+$/g, "");
  const norm = (p) => p.replace(/\//g, "\\").toLowerCase();
  const cellN = base(norm(cellDir));
  const extraN = extraRead.map((x) => base(norm(x)));
  const out = [];
  let infraSkipped = 0;
  const toolchainRoots = ["c:\\users\\lhh\\appdata\\local\\nvm", "c:\\program files\\nodejs"];
  try { const ex = path.dirname(process.execPath).toLowerCase(); if (toolchainRoots.indexOf(ex) === -1) toolchainRoots.push(ex); } catch {}
  const isDrivePath = (t) => /^[A-Za-z]:[\\/]/.test(t);
  const allowed = (tok) => {
    const n = base(norm(tok.replace(/[.,;:)\]}]+$/g, "").replace(/\\{2,}/g, "\\")));
    if (!isDrivePath(n)) return true;
    if (n === cellN || n.startsWith(cellN + "\\")) return true;
    for (const x of extraN) if (n === x || n.startsWith(x + "\\")) return true;
    return false;
  };
  const snip = (s, i) => s.slice(Math.max(0, i - 70), i + 140).replace(/\s+/g, " ");
  const push = (ev, tool, field, token, snippet, soft) => out.push({ seq: ev.seq, type: ev.type, tool, field, token: String(token).slice(0, 220), snippet: String(snippet).slice(0, 260), soft: !!soft });
  const scanString = (ev, tool, field, s, soft) => {
    if (typeof s !== "string" || !s) return;
    const variants = [s];
    const collapsed = s.replace(/\\\\/g, "\\");
    if (collapsed !== s) variants.push(collapsed);
    const seenTok = new Set();
    for (const v of variants) {
      let m;
      PATH_RE.lastIndex = 0;
      while ((m = PATH_RE.exec(v))) {
        const tok = m[0];
        const key = tool + "|" + field + "|" + tok.toLowerCase();
        if (seenTok.has(key)) continue;
        if (!allowed(tok)) {
          seenTok.add(key);
          const tn = tok.toLowerCase().replace(/\\{2,}/g, "\\").replace(/\//g, "\\");
          if (tn.indexOf("\\temp\\dsh-spill-") !== -1 && tool !== "write" && tool !== "edit" && field.indexOf("command") === -1) { infraSkipped++; continue; }
          if (/[\u3000-\u9fff\uff00-\uffef]/.test(tok)) { push(ev, tool, field + ":prose-cjk", tok, snip(v, m.index), true); continue; }
          const isToolchain = toolchainRoots.some((tc) => tn === tc || tn.startsWith(tc + "\\"));
          push(ev, tool, isToolchain ? field + ":toolchain" : field, tok, snip(v, m.index), soft || isToolchain);
        }
      }
      TEMP_RE.lastIndex = 0;
      while ((m = TEMP_RE.exec(v))) {
        const around = v.slice(m.index, m.index + 60).toLowerCase();
        if (around.indexOf("dsh-spill-") !== -1 && tool !== "write" && tool !== "edit" && field.indexOf("command") === -1) { infraSkipped++; continue; }
        const key2 = tool + "|" + field + "|temp";
        if (!seenTok.has(key2)) { seenTok.add(key2); push(ev, tool, field + ":temp-ref", m[0], snip(v, m.index), soft); }
      }
      if (!soft) {
        RELUP_RE.lastIndex = 0;
        while ((m = RELUP_RE.exec(v))) {
          const before = v.slice(Math.max(0, m.index - 2), m.index);
          if (before.endsWith(".")) continue;
          push(ev, tool, field + ":rel-up", "..(traversal ref)", snip(v, m.index), soft);
        }
      }
    }
  };
  const walkObj = (ev, tool, v, prefix, soft, skipPattern) => {
    if (typeof v === "string") { scanString(ev, tool, prefix, v, soft); return; }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (skipPattern && k === "pattern") continue;
        if (typeof x === "string") scanString(ev, tool, prefix + "." + k, x, soft);
        else if (x && typeof x === "object") scanString(ev, tool, prefix + "." + k, JSON.stringify(x), soft);
      }
    }
  };
  for (const ev of events) {
    const d = ev.data || {};
    if (ev.type === "tool/ptc-dispatch-start") {
      const name = String(d.name || "?");
      if (name === "web_fetch" || name === "web_search") {
        const argJson = JSON.stringify(d.arguments || {});
        const localProbe = name === "web_fetch" && /"url"\s*:\s*"https?:\/\/(127\.0\.0\.1|localhost|\[::1\])([:\/"])/i.test(argJson);
        push(ev, name, localProbe ? "network:local-probe" : "network", argJson.slice(0, 200), "network access event", localProbe);
        continue;
      }
      if (name === "subagent" || name === "subagent_fork") { push(ev, name, "spawn", String((d.arguments || {}).cwd || ""), "solver spawned a subagent", false); continue; }
      const args = d.arguments && typeof d.arguments === "object" ? d.arguments : {};
      const skipPattern = name === "grep" || name === "glob";
      for (const [k, v] of Object.entries(args)) {
        if (skipPattern && k === "pattern") continue;
        walkObj(ev, name, v, k, name === "run_code" || name === "send_message" || k === "content" || k === "old_string" || k === "new_string", skipPattern);
      }
      continue;
    }
    if (ev.type === "tool/call") {
      const name = String(d.name || "?");
      if (name === "tools") {
        let inner = "wrapper";
        try { const a = JSON.parse(d.arguments || "{}"); const ks = Object.keys(a || {}); if (ks.length) inner = ks.join("+"); } catch {}
        scanString(ev, "run_code[" + inner + "]", "arguments", String(d.arguments || ""), true);
      } else {
        let argsObj = null;
        try { argsObj = JSON.parse(d.arguments || "null"); } catch {}
        if (argsObj && typeof argsObj === "object" && !Array.isArray(argsObj)) {
          const skipP = name === "grep" || name === "glob";
          for (const [k2, v2] of Object.entries(argsObj)) {
            if (skipP && k2 === "pattern") continue;
            walkObj(ev, name, v2, k2, name === "run_code" || name === "send_message" || k2 === "content" || k2 === "old_string" || k2 === "new_string", skipP);
          }
        } else {
          scanString(ev, name, "arguments", String(d.arguments || ""), false);
        }
      }
    }
  }
  out.infraSkipped = infraSkipped;
  return out;
}

export function fixtureAfter(cellDir) {
  const before = JSON.parse(fs.readFileSync(path.join(cellDir, "fixture-hash-before.json"), "utf8")).files;
  const fdir = path.join(cellDir, "fixture");
  const after = fs.existsSync(fdir) ? hashTree(fdir) : {};
  const changed = [], missing = [], added = [];
  for (const k of Object.keys(before)) { if (!(k in after)) missing.push(k); else if (after[k] !== before[k]) changed.push(k); }
  for (const k of Object.keys(after)) if (!(k in before)) added.push(k);
  const ok = changed.length === 0 && missing.length === 0 && added.length === 0;
  fs.writeFileSync(path.join(cellDir, "fixture-hash-after.json"), JSON.stringify({ generatedAt: nowIso(), algorithm: "sha256", ok, changed, missing, added, files: after }, null, 2) + "\n");
  return { ok, changed, missing, added, count: Object.keys(after).length };
}

export function findReports(cellDir) {
  const ao = path.join(cellDir, "agent-output");
  if (!fs.existsSync(ao)) return [];
  return walk(ao).map((f) => ({ rel: path.relative(cellDir, f), bytes: fs.statSync(f).size }));
}

export function loadState(root) { return JSON.parse(fs.readFileSync(path.join(root, "orchestrator-state.json"), "utf8")); }
export function saveState(root, state) { state.lastUpdated = nowIso(); fs.writeFileSync(path.join(root, "orchestrator-state.json"), JSON.stringify(state, null, 2) + "\n"); }
export function renderLedger(root, state) {
  const lines = ["# cell-ledger · 2026-10-20-qwen3.8-max-s1-s24-r1", "", "| task | arm | status | start | end | duration | toolcalls | tokens |", "|---|---|---|---|---|---|---|---|"];
  for (const c of state.cells) {
    const dur = c.durationSec != null ? Math.round(c.durationSec) + "s" : "";
    lines.push("| " + c.task + " | " + c.arm + " | " + c.status + " | " + (c.start || "") + " | " + (c.end || "") + " | " + dur + " | " + (c.toolcalls != null ? c.toolcalls : "") + " | " + (c.tokensTotal != null ? c.tokensTotal : "") + " |");
  }
  fs.writeFileSync(path.join(root, "cell-ledger.md"), lines.join("\n") + "\n");
}

export function closeout(cell, sessionsRoot, skillDir) {
  const res = { task: cell.task, arm: cell.arm, cellDir: cell.cellDir };
  const reports = findReports(cell.cellDir).filter((r) => r.bytes > 0);
  const isMd = (r) => /[.]md$/i.test(r.rel);
  const isRpt = (r) => /report/i.test(r.rel);
  const pref = reports.find((r) => isMd(r) && isRpt(r)) || reports.find((r) => isMd(r)) || reports.slice().sort((a, b) => b.bytes - a.bytes)[0] || reports[0];
  res.reportOk = reports.length > 0;
  res.reportPath = pref ? path.join(cell.cellDir, pref.rel) : null;
  res.reportFiles = reports;
  res.fixture = fixtureAfter(cell.cellDir);
  const sid = "session-" + cell.subagentId;
  let sfile = null;
  const sdir0 = findSessionDir(sessionsRoot, sid);
  if (sdir0 && fs.existsSync(path.join(sdir0, "session.v4.jsonl.zstd"))) sfile = path.join(sdir0, "session.v4.jsonl.zstd");
  if (!sfile) {
    const mm = findSessionFile(sessionsRoot, cell.cellDir, cell.subagentId, (cell.startMs || Date.now()) - 600000);
    if (mm.length) sfile = mm.slice().sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs)[0].file;
  }
  res.sessionDir = sfile ? path.dirname(sfile) : null;
  res.sessionFile = sfile;
  res.noTranscript = !sfile;
  if (sfile) {
    const f = sfile;
    if (fs.existsSync(f)) {
      const dec = decodeSession(f);
      res.metrics = metrics(dec.events);
      const typeHist = {};
      for (const e of dec.events) typeHist[e.type] = (typeHist[e.type] || 0) + 1;
      res.typeHist = typeHist;
      const extra = cell.arm === "skill" ? [skillDir] : [];
      const cands = auditCandidates(dec.events, { cellDir: cell.cellDir, extraRead: extra });
      res.candidates = cands;
      res.hard = cands.filter((c) => !c.soft).length;
      res.soft = cands.filter((c) => c.soft).length;
      res.infraSkipped = cands.infraSkipped || 0;
      fs.writeFileSync(path.join(cell.cellDir, "audit.json"), JSON.stringify({ generatedAt: nowIso(), sessionFile: f, events: dec.events.length, metrics: res.metrics, hardCandidates: res.hard, softCandidates: res.soft, infraSkipped: res.infraSkipped || 0, verdict: res.hard > 0 ? "review" : res.soft > 0 ? "soft-review" : "clean-auto", candidates: cands.slice(0, 300) }, null, 2) + "\n");
    }
  }
  return res;
}


export function findSessionFile(sessionsRoot, wantCwd, wantIdSubstr, sinceMs) {
  const matches = [];
  let groups = [];
  try { groups = fs.readdirSync(sessionsRoot); } catch { return matches; }
  for (const g of groups) {
    const gp = path.join(sessionsRoot, g);
    let gst; try { gst = fs.statSync(gp); } catch { continue; }
    if (!gst.isDirectory()) continue;
    let subs = []; try { subs = fs.readdirSync(gp); } catch { continue; }
    for (const s of subs) {
      const sp = path.join(gp, s);
      let sst; try { sst = fs.statSync(sp); } catch { continue; }
      if (!sst.isDirectory()) continue;
      const f = path.join(sp, "session.v4.jsonl.zstd");
      let fst; try { fst = fs.statSync(f); } catch { continue; }
      if (sinceMs && fst.mtimeMs < sinceMs) continue;
      if (wantIdSubstr && s.indexOf(wantIdSubstr) !== -1) { matches.push({ file: f, dir: sp, by: "id" }); continue; }
      try {
        const buf = fs.readFileSync(f);
        const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
        const i = buf.indexOf(magic);
        if (i < 0) continue;
        const t = zlib.zstdDecompressSync(buf.subarray(i)).toString("utf8");
        const h = JSON.parse(t.split("\n")[0]);
        if (h && h.type === "session" && wantCwd && String(h.cwd || "").toLowerCase() === String(wantCwd).toLowerCase()) {
          matches.push({ file: f, dir: sp, by: "cwd", id: h.id, depth: h.delegationDepth });
        }
      } catch {}
    }
  }
  return matches;
}


export function finalizeCell(cell, r) {
  const endMs = r.metrics && r.metrics.lastTime ? r.metrics.lastTime : Date.now();
  cell.end = isoFrom(endMs);
  cell.durationSec = Math.round((endMs - (cell.startMs || Date.now())) / 1000);
  if (r.metrics) { cell.toolcalls = r.metrics.toolcalls; cell.tokensIn = r.metrics.tokensIn; cell.tokensOut = r.metrics.tokensOut; cell.tokensTotal = r.metrics.tokensTotal; }
  cell.reportPath = r.reportPath;
  cell.fixtureAfterOk = r.fixture ? r.fixture.ok : null;
  cell.sessionDir = r.sessionDir || null;
  if (r.noTranscript) cell.auditVerdict = "no-transcript";
  else if ((r.hard || 0) > 0) cell.auditVerdict = "review";
  else cell.auditVerdict = (r.soft || 0) > 0 ? "clean-with-soft-notes" : "clean-auto";
  cell.auditHard = r.hard != null ? r.hard : null;
  cell.auditSoft = r.soft != null ? r.soft : null;
  cell.status = !r.reportOk ? "no-report"
    : cell.auditVerdict === "no-transcript" ? "done:no-transcript"
    : cell.auditVerdict === "review" ? "review"
    : (r.fixture && r.fixture.ok ? "done" : "done:fixture-changed");
  fs.writeFileSync(path.join(cell.cellDir, "status.json"), JSON.stringify({ cell: cell, closeout: { reportOk: r.reportOk, reportPath: r.reportPath, reportFiles: r.reportFiles, fixture: r.fixture ? { ok: r.fixture.ok, changed: r.fixture.changed, missing: r.fixture.missing, added: r.fixture.added, count: r.fixture.count } : null, metrics: r.metrics || null, sessionDir: r.sessionDir, sessionFile: r.sessionFile, noTranscript: !!r.noTranscript, hardCandidates: r.hard != null ? r.hard : null, softCandidates: r.soft != null ? r.soft : null, verdict: cell.auditVerdict } }, null, 2) + "\n");
  return cell;
}
