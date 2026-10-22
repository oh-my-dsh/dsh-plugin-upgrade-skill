import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

export const RUN_ROOT = "E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\results\\artifacts\\2026-10-20-deepseek-v4.1-flash-1017-s1-s24-r1";
export const REPO = "E:\\deepseek-harness\\dsh-plugin-upgrade-skill";
export const TASKS_ROOT = "E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\benchmark\\tasks";
export const SKILL_ROOTS = ["E:\\deepseek-harness\\dsh-plugin-upgrade-skill\\skills\\plugin-upgrade"];
export const SESS_ROOT = "C:\\Users\\lhh\\.dsh\\sessions";
export const RUNNER = path.join(RUN_ROOT, "_runner");
export const STATE = path.join(RUNNER, "state.json");
export const LEDGER = path.join(RUN_ROOT, "cell-ledger.md");

export function listTasks() {
  return fs.readdirSync(TASKS_ROOT)
    .filter(n => /^S\d+-/.test(n) && fs.statSync(path.join(TASKS_ROOT, n)).isDirectory())
    .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
}
export function cellKey(task, arm) { return task + "|" + arm; }
export function cellDir(task, arm) { return path.join(RUN_ROOT, arm, task); }

export function loadState() {
  if (!fs.existsSync(STATE)) {
    const st = { created: new Date().toISOString(), cells: {} };
    for (const t of listTasks()) for (const arm of ["noskill", "skill"]) st.cells[cellKey(t, arm)] = { task: t, arm, status: "pending" };
    fs.mkdirSync(RUNNER, { recursive: true });
    saveState(st);
    return st;
  }
  return JSON.parse(fs.readFileSync(STATE, "utf8"));
}
export function saveState(st) {
  fs.mkdirSync(RUNNER, { recursive: true });
  const tmp = STATE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(st, null, 1), "utf8");
  fs.renameSync(tmp, STATE);
}

export function treeHash(dir) {
  const files = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? rel + "/" + e.name : e.name;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, r);
      else { const b = fs.readFileSync(full); files.push(r + "|" + b.length + "|" + crypto.createHash("sha256").update(b).digest("hex")); }
    }
  };
  walk(dir, "");
  return { hash: crypto.createHash("sha256").update(files.join("\n")).digest("hex"), count: files.length, bytes: files.reduce((a, f) => a + parseInt(f.split("|")[1]), 0) };
}

export function prepCell(task, arm) {
  const dir = cellDir(task, arm);
  const src = path.join(TASKS_ROOT, task, "environment", "fixture");
  fs.mkdirSync(dir, { recursive: true });
  const fx = path.join(dir, "fixture");
  if (!fs.existsSync(fx)) fs.cpSync(src, fx, { recursive: true });
  fs.mkdirSync(path.join(dir, "agent-output", task), { recursive: true });
  const pre = treeHash(fx);
  if (!pre.count || pre.bytes === 0) throw new Error("empty fixture for " + task);
  return { dir, pre };
}

const BOUNDARY = (cell, task, arm) => [
  "## 三、边界（硬约束，必须严格遵守）",
  "1. 读取白名单：仅限 \`" + cell + "\` 目录内的文件（其下 \`fixture\\\\\` 与 \`agent-output\\\\\`）。" +
    (arm === "skill" ? "另加只读白名单：\`" + SKILL_ROOTS[0] + "\` 目录（仅 skill 臂允许）。" : ""),
  "2. 明确禁读：\`tests/\`、\`solution/\`、\`benchmark/results/\`、\`benchmark/tasks/\` 下的任何内容、仓库其他目录、用户主目录、以及任何白名单之外的绝对路径。" + (arm === "noskill" ? "本臂还禁止读取 \`skills/\` 目录的任何内容。" : ""),
  "3. 写入白名单：只能写 \`" + cell + "\` 之内。禁止向格目录之外的任何路径写入（含系统 TEMP/%TEMP%/C:\\\\Users\\\\...\\\\AppData\\\\Local\\\\Temp、/tmp）。需要临时文件就写在 \`" + path.join(cell, "agent-output") + "\` 下。",
  "4. 禁读之外还要禁跑：不要执行 git 命令；不要 npm/pnpm/yarn install；不要联网（curl/wget 等）；不要修改 \`fixture\\\\\` 内的任何文件（保持逐字节不变）。",
  "5. 报告里引用卡片 / reference 内容时，只写要点与卡片 ID，禁止整段粘贴原文（上下文预算 256k）。",
  "6. 无人值守评测：不要向用户提问、不要等待确认，直接做完。" ,
  "7. 收尾硬性要求：最终回复**最多 3 行**（不超过 200 字）：第一行状态（完成/受阻），第二行报告绝对路径，第三行仅在有阻塞时写一句话。禁止粘贴结论、卡片映射、文件列表等细节——报告已经落盘，评审只读文件。",
  "8. 不要调用 send_message 向父会话汇报（一律只用最终回复），也不要再 spawn 子代理。",
].join("\n");

export function buildPrompt(task, arm, cell, instruction) {
  const reportDir = path.join(cell, "agent-output", task);
  const head = [
    "你是本次评测的解题 agent（全新实例、单次尝试）。请独立完成下面这道题，并把报告写到指定目录。",
    "",
    "## 一、路径映射（重要：本次是本地运行，不是容器）",
    "题面里的容器路径只是位置说明，请按下面映射落到本机路径：",
    "- 题面 \`/app/fixture/\`  →  \`" + path.join(cell, "fixture") + "\`（只读，不得修改）",
    "- 题面 \`/app/agent-output/\`  →  \`" + path.join(cell, "agent-output") + "\`",
    "- 报告落盘目录（已建好）：\`" + reportDir + "\`（文件名任意，.md 即可）",
    "- 你的工作目录已设为单元格根：\`" + cell + "\`",
    "",
    "## 二、任务（题面全文）",
    "",
    instruction.trim(),
    "",
  ].join("\n");

  const armClause = arm === "skill"
    ? ["## 四、臂条款（skill 臂）",
       "开工前**先读** \`" + SKILL_ROOTS[0] + "\\\\SKILL.md\`，然后按需查阅同目录 references/（只读，不要整段抄写）。该 skill 是本臂唯一允许的额外信息来源。"].join("\n")
    : ["## 四、臂条款（noskill 臂）",
       "**禁止读取 \`skills/\` 目录的任何内容**（不要打开、不要 grep、不要用 glob 列目录、不要间接读取其中任何文件）。本臂只允许：单元格内材料 + 你自身已有的知识。"].join("\n");

  return head + BOUNDARY(cell, task, arm) + "\n\n" + armClause + "\n";
}

// ---------- session log reading ----------
const MAGIC = Buffer.from([0x28, 0xB5, 0x2F, 0xFD]);
export function readSessionLog(file) {
  const raw = fs.readFileSync(file);
  const idx = [];
  for (let i = 0; i + 4 <= raw.length; i++) if (raw[i] === 0x28 && raw[i + 1] === 0xB5 && raw[i + 2] === 0x2F && raw[i + 3] === 0xFD) idx.push(i);
  let out = "";
  for (let k = 0; k < idx.length; k++) {
    const s = idx[k], e = k + 1 < idx.length ? idx[k + 1] : raw.length;
    try { out += zlib.zstdDecompressSync(raw.subarray(s, e)).toString("utf8"); } catch { /* partial trailing frame */ }
  }
  const events = [];
  for (const ln of out.split("\n")) {
    if (!ln.trim()) continue;
    try { events.push(JSON.parse(ln)); } catch { /* truncated tail */ }
  }
  return events;
}

export function sessionFiles() {
  const res = [];
  if (!fs.existsSync(SESS_ROOT)) return res;
  for (const proj of fs.readdirSync(SESS_ROOT)) {
    const pd = path.join(SESS_ROOT, proj);
    let st1; try { st1 = fs.statSync(pd); } catch { continue; }
    if (!st1.isDirectory()) continue;
    for (const s of fs.readdirSync(pd)) {
      const sd = path.join(pd, s);
      let st2; try { st2 = fs.statSync(sd); } catch { continue; }
      if (!st2.isDirectory()) continue;
      const f = fs.readdirSync(sd).find(x => x.endsWith(".jsonl.zstd"));
      if (f) res.push({ dir: sd, file: path.join(sd, f), mtime: st2.mtimeMs });
    }
  }
  return res;
}


export function findSessionByAgent(agentId) {
  const cands = sessionFiles().filter(s => s.dir.toLowerCase().endsWith("\\" + agentId.toLowerCase()) || s.dir.toLowerCase().endsWith("session-" + agentId.toLowerCase()));
  if (!cands.length) return null;
  cands.sort((a, b) => b.mtime - a.mtime);
  const f = cands[0];
  const events = readSessionLog(f.file);
  const header = events.find(e => e.type === "session");
  return { dir: f.dir, file: f.file, header, events };
}

const WIN_ABS = /[A-Za-z]:\\\\[^"'\`\r\n]*/g;
const POSIX_ABS = /(?<![\w:\\])\/(?:app|tmp|home|Users|root|etc|opt|mnt)\/[^"'\`\s]*/g;
const FORBIDDEN = [
  [/tests?[\\\/]/, "tests/"],
  [/solution[\\\/]/, "solution/"],
  [/benchmark[\\\/]/, "benchmark/"],
  [/results[\\\/]/, "results/"],
  [/judge\.mjs/, "judge.mjs"],
  [/packet\.json/, "packet.json"],
  [/\bHANDOFF/, "HANDOFF doc"],
  [/\.git[\\\/]/, ".git/"],
];

function collectStrings(v, out) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out);
  else if (v && typeof v === "object") for (const k of Object.keys(v)) collectStrings(v[k], out);
}

const FORBIDDEN_SEG = [
  [/benchmark[\\\/]tasks/i, "benchmark/tasks"],
  [/benchmark[\\\/]books/i, "benchmark/books"],
  [/[\\\/]tests[\\\/]/i, "tests/"],
  [/[\\\/]solution[\\\/]/i, "solution/"],
  [/judge\.mjs/i, "judge.mjs"],
  [/packet\.json/i, "packet.json"],
  [/HANDOFF-new-models/i, "HANDOFF doc"],
];

function walkStrings(v, out) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) walkStrings(x, out);
  else if (v && typeof v === "object") for (const k of Object.keys(v)) walkStrings(v[k], out);
}

export function auditCell(events, cell, arm) {
  const norm = (s) => s.replace(/[\\\/]+/g, "\\").toLowerCase().replace(/\\+$/, "");
  const allowed = [norm(cell)];
  if (arm === "skill") for (const s of SKILL_ROOTS) allowed.push(norm(s));
  const isAllowed = (tl) => allowed.some((a) => tl === a || tl.indexOf(a + "\\") === 0 || tl.indexOf(a + "/") === 0);
  const flags = [];
  const reads = new Set(), writes = new Set();
  const skipKeys = new Set(["content", "text", "message", "old_string", "new_string", "description"]);

  const checkPath = (tool, value, mode) => {
    if (typeof value !== "string" || value.length < 4) return;
    const raw = value.replace(/\\\\+/g, "\\").trim();
    const mWin = raw.match(/^[A-Za-z]:\\/);
    const mPosix = raw.match(/^\/(?:app|tmp|home|Users|root|etc|opt|mnt)\//);
    if (!mWin && !mPosix) return;
    const tl = norm(raw).replace(/[,;)\]}"']+$/, "");
    if (isAllowed(tl)) { (mode === "w" ? writes : reads).add(tl); return; }
    flags.push({ kind: mode === "w" ? "write-outside-whitelist" : "read-outside-whitelist", tool, path: raw.slice(0, 200) });
  };

  for (const e of events) {
    if (e.type !== "tool/ptc-dispatch") continue;
    const name = e.data?.name;
    const args = e.data?.arguments ?? {};
    const pruned = {};
    for (const k of Object.keys(args ?? {})) {
      if (skipKeys.has(k)) continue;
      if ((name === "grep" || name === "glob") && (k === "pattern" || k === "include")) continue;
      pruned[k] = args[k];
    }
    const strs = [];
    walkStrings(pruned, strs);
    const joined = strs.join("\n");
    for (const s of strs) {
      if (s.length > 4000) continue;
      if (/["'\x60]/.test(s) && s.length > 200) continue;
      checkPath(name, s, "r");
    }
    if (name === "write" || name === "edit") {
      const fp = args.file_path ?? args.path;
      if (typeof fp === "string") {
        const tl = norm(fp);
        if (isAllowed(tl)) writes.add(tl); else flags.push({ kind: "write-outside-whitelist", tool: name, path: String(fp).slice(0, 200) });
      }
    }
    if (name === "pwsh") {
      const cmd = String(args.command ?? "");
      for (const m of cmd.matchAll(/[A-Za-z]:\\\\[^"'\x60\r\n]*/g)) {
        const tok = m[0].replace(/\\\\+/g, "\\").replace(/[,;)\]}]+$/, "");
        if (tok.length < 6) continue;
        const tl = norm(tok);
        if (!isAllowed(tl)) flags.push({ kind: "pwsh-path-outside", tool: "pwsh", path: tok.slice(0, 200) });
      }
      for (const [re, label] of FORBIDDEN_SEG) if (re.test(cmd)) flags.push({ kind: "pwsh-forbidden:" + label, tool: "pwsh", path: cmd.slice(0, 160) });
    }
    if (name === "grep" || name === "glob") {
      // per audit convention, a pattern that merely contains path literals is not an access;
      // only the explicit path selector counts.
      const p2 = String(args.path ?? "");
      if (p2) checkPath(name, p2, "r");
    }
  }

  // direct fs access inside run_code bodies (bypass of tool dispatch)
  for (const e of events) {
    if (e.type !== "tool/call") continue;
    let obj;
    try { obj = JSON.parse(e.data?.arguments); } catch { continue; }
    const code = typeof obj?.code === "string" ? obj.code : "";
    if (!code) continue;
    const usesFs = /fs\.(readFile|writeFile|readdir|stat|cp|copyFile|existsSync|openSync|createReadStream|createWriteStream|unlink|rm|rename|mkdirSync)/.test(code);
    if (!usesFs) continue;
    for (const [re, label] of FORBIDDEN_SEG) if (re.test(code)) flags.push({ kind: "fs-forbidden:" + label, tool: "run_code", path: label });
    for (const m of code.matchAll(/[A-Za-z]:\\\\[^"'\x60\r\n]*/g)) {
      const tok = m[0].replace(/\\\\+/g, "\\").replace(/[,;)\]}]+$/, "");
      if (tok.length < 6) continue;
      const tl = norm(tok);
      if (!isAllowed(tl)) flags.push({ kind: "fs-path-outside", tool: "run_code", path: tok.slice(0, 200) });
    }
  }

  if (arm === "noskill") {
    for (const f of flags) if (/[\\\/]skills[\\\/]/i.test(String(f.path) + " " + String(f.kind))) f.kind = "noskill-skill-read";
  }

  const uniq = new Map();
  for (const f of flags) uniq.set(f.kind + "|" + f.path, f);
  return { flags: [...uniq.values()], reads: [...reads], writes: [...writes] };
}

export function summarize(events) {
  let toolcalls = 0, tokens = 0, inputTokens = 0, outputTokens = 0, steps = 0;
  let model = null, provider = null;
  for (const e of events) {
    if (e.type === "tool/call") toolcalls++;
    if (e.type === "step/end") steps++;
    if (e.type === "request/header" && e.data?.header?.config) { model = e.data.header.config.model; provider = e.data.header.config.provider; }
    if (e.type === "assistant/message" && e.data?.usage) {
      const u = e.data.usage;
      tokens += u.totalTokens ?? 0; inputTokens += u.inputTokens ?? 0; outputTokens += u.outputTokens ?? 0;
    }
  }
  return { toolcalls, tokens, inputTokens, outputTokens, steps, model, provider };
}
