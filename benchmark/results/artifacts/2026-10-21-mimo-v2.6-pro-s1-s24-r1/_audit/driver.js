const REPO = "E:/deepseek-harness/dsh-plugin-upgrade-skill";
const ROOT = REPO + "/benchmark/results/artifacts/2026-10-21-mimo-v2.6-pro-s1-s24-r1";
const TASKS_DIR = REPO + "/benchmark/tasks";
const SKILL_DIR = REPO + "/skills/plugin-upgrade";

async function readText(p) { const r = await tools.read({ file_path: p }); return r.lines.map(function (l) { return l.text; }).join("\n"); }
async function readJson(p) { return JSON.parse(await readText(p)); }
async function writeJson(p, o) { await tools.write({ file_path: p, content: JSON.stringify(o, null, 2) + "\n" }); }
async function nowStamp() { const r = await tools.pwsh({ description: "Get current local timestamp", command: "Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz'" }); return r.stdout.text.trim(); }
function hhmmss(iso) { return iso.slice(11, 19); }
function durText(a, b) {
  const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));
  return Math.floor(s / 60) + "m" + String(s % 60).padStart(2, "0") + "s";
}
function norm(s) { return String(s).replace(/\\/g, "/").toLowerCase(); }

async function hashTree(dir) {
  const r = await tools.pwsh({
    description: "SHA-256 hash tree of " + dir,
    command: "Get-ChildItem -Recurse -File '" + dir + "' | ForEach-Object { [pscustomobject]@{ full=$_.FullName; len=$_.Length; hash=(Get-FileHash -Algorithm SHA256 $_.FullName).Hash } } | ConvertTo-Json -Compress",
    workdir: REPO
  });
  const txt = r.stdout.text.trim();
  if (!txt) return [];
  const rows = JSON.parse(txt);
  return Array.isArray(rows) ? rows : [rows];
}
function treeMap(rows, base) {
  const b = norm(base).replace(/\/$/, "");
  const m = {};
  for (const row of rows) {
    const rel = norm(row.full).slice(b.length).replace(/^\//, "");
    m[rel] = { len: row.len, hash: row.hash };
  }
  return m;
}
function compareTrees(srcMap, dstMap) {
  const mismatched = [], missing = [], extra = [], zeroByte = [];
  for (const rel of Object.keys(srcMap)) {
    if (!srcMap[rel].len) zeroByte.push(rel);
    if (!dstMap[rel]) { missing.push(rel); continue; }
    if (srcMap[rel].hash !== dstMap[rel].hash) mismatched.push(rel);
  }
  for (const rel of Object.keys(dstMap)) { if (!srcMap[rel]) extra.push(rel); }
  return { checked: Object.keys(srcMap).length, mismatched, missing, extra, zeroByte };
}

function makeAuditor(cell, arm, task) {
  const cellLow = norm(cell), skillLow = norm(SKILL_DIR), taskLow = task.toLowerCase();
  function classify(p) {
    let s = String(p).trim().replace(/^["']|["']$/g, "").replace(/[",;]+$/, "");
    s = s.replace(/（.*$/, "").replace(/\(.*$/, "").trim();
    s = s.replace(/<cell[^>]*>/gi, cell);
    if (norm(s).indexOf("/app") === 0) s = cell + norm(s).slice(4);
    const low0 = norm(s).replace(/\/+$/, "");
    if (low0 === "" || low0 === "." || low0 === "./") return "in";
    if (low0.indexOf("...") >= 0) {
      const suffix = low0.split("...").pop().replace(/^[\/\\]+/, "");
      if (suffix === taskLow || suffix.indexOf(taskLow + "/") === 0) return "in";
      if (suffix === "plugin-upgrade" || suffix.indexOf("plugin-upgrade/") === 0 || suffix.indexOf("skills/plugin-upgrade") === 0) return "skill";
      return "out";
    }
    const cands = [low0];
    if (!/^[a-z]:\//.test(low0)) { cands.push(cellLow + "/" + low0, norm(REPO) + "/" + low0, skillLow + "/" + low0); }
    for (const c of cands) {
      if (c.indexOf(cellLow) === 0 || cellLow.indexOf(c) === 0) return "in";
      if (arm === "skill" && (c.indexOf(skillLow) === 0 || skillLow.indexOf(c) === 0)) return "skill";
    }
    return "out";
  }
  return function (p, isWrite) {
    const c = classify(p);
    return isWrite ? (c === "in") : (c === "in" || c === "skill");
  };
}

function promptFor(instruction, cell, arm) {
  const cellWin = cell.replace(/\//g, "\\");
  const skillWin = SKILL_DIR.replace(/\//g, "\\");
  const extra = arm === "skill" ? (" + skills\\plugin-upgrade\\ 目录（" + skillWin + "\\ ，只读）") : "";
  const armClause = arm === "skill"
    ? ("本臂为 skill 臂：开工前先读 " + skillWin + "\\SKILL.md，references 按需查阅。你只能读 skills\\plugin-upgrade\\ 这一个技能目录。")
    : "本臂为 noskill 臂：禁止读取 skills/ 目录任何内容（含 SKILL.md、references、examples、scripts）。";
  const lines = [
    "# 任务段",
    "你是本次基准评测的一名 solver（全新实例、单次尝试）。请独立完成下面这道题；本题面即用户授权，按题面自行完成分析与执行，不要等待任何后续确认，不要提反问。题面（instruction.md 全文）如下：",
    "",
    instruction,
    "",
    "本题的产物格目录（报告写到这里）：" + cellWin,
    "路径映射：题面中的容器根 /app/ 即本格目录，也就是 /app/fixture/ = " + cellWin + "\\fixture\\（密封任务材料，只读、必须保持逐字节不变），/app/agent-output/ = " + cellWin + "\\agent-output\\（你的输出与临时文件目录）。",
    "",
    "# 边界段",
    "你的读取白名单 = 本单元格目录" + extra + "。",
    "禁读：tests/、solution/、benchmark/results/ 下除本格目录以外的任何内容、仓库其他任何目录、以及白名单之外的任何文件。",
    "禁止向格目录之外的任何路径写入（含系统 TEMP）——临时文件一律写在格目录内 agent-output\\ 下。",
    "报告引用卡片/reference 时只写要点与卡片 ID，禁止全文粘贴（上下文预算 256k）。",
    "",
    "# 臂条款",
    armClause,
    "",
    "# 收尾自报（必须完成）",
    "1. 报告文件写入格目录内：题面指定的位置/文件名优先（题面中的 /app/agent-output/... 即格目录下 agent-output/...），题面未指定则写 " + cellWin + "\\agent-output\\report.md。报告必须非空。",
    "2. 写 " + cellWin + "\\agent-output\\tool-transcript.txt：每行一次工具调用，格式「序号. 工具名 关键参数（路径或命令）」，覆盖你做过的全部工具调用；单行可截断到 300 字符。",
    "3. 写 " + cellWin + "\\agent-output\\transcript-manifest.txt：每行一个真实发生过文件系统读/写的目标路径，前缀「R 」（读）或「W 」（写）。注意：grep/rg 模式里的正则字符类（如 [/\\]）、引号内的路径字面量参数、无 path 参数的 glob pattern、以及不访问文件系统的探针（如 node --version）不属于文件系统访问，不必列入、也不算违规。",
    "4. 报告末尾含一节「## run-stats」：toolcalls 总数、token 用量（若可见，否则写 n/a）、完成时间。",
    "5. 最终消息用 3-5 行概述：完成内容、报告文件路径、toolcalls、tokens。"
  ];
  return lines.join("\n");
}

async function spawnCell(task, arm) {
  const cell = ROOT + "/" + arm + "/" + task;
  const srcFx = TASKS_DIR + "/" + task + "/environment/fixture";
  const mk = await tools.pwsh({
    description: "Prepare cell dir and copy fixture for " + task + " " + arm,
    command: "New-Item -ItemType Directory -Force -Path '" + cell + "', '" + cell + "/agent-output', '" + cell + "/fixture' | Out-Null; Copy-Item -Recurse -Force '" + srcFx + "/*' '" + cell + "/fixture/'; 'ok'",
    workdir: REPO
  });
  const srcRows = await hashTree(srcFx);
  const dstRows = await hashTree(cell + "/fixture");
  const cmp = compareTrees(treeMap(srcRows, srcFx), treeMap(dstRows, cell + "/fixture"));
  const instruction = await readText(TASKS_DIR + "/" + task + "/instruction.md");
  const prompt = promptFor(instruction, cell, arm);
  const spawned = await tools.subagent({ cwd: cell, description: task + " " + arm + " solver", prompt: prompt });
  const startedAt = await nowStamp();
  const sched = await tools.schedule_create({
    title: task + " " + arm + " 超时检查",
    prompt: "【格超时检查】" + task + "/" + arm + "（subagent " + spawned.subagentId + "，格目录 " + cell + "）已到 30 分钟上限。请用 list_agents 核实：若该 solver 仍在运行，用 interrupt_agent 停止，然后执行收尾五项核验并把该格 status 落为 timeout；若已结束，直接删除本提醒并走正常收尾。",
    after_seconds: 1800
  });
  await writeJson(ROOT + "/_audit/" + task + "-" + arm + "-run.json", {
    task: task, arm: arm, cell: cell, subagentId: spawned.subagentId, startedAt: startedAt,
    fixtureSource: srcFx, fixtureCompare: cmp, promptBytes: prompt.length,
    timeoutScheduleId: ("id" in sched) ? sched.id : "none", status: "running"
  });
  return { task: task, arm: arm, subagentId: spawned.subagentId, startedAt: startedAt, fixtureFiles: cmp.checked, fixtureOk: cmp.mismatched.length === 0 && cmp.missing.length === 0, schedId: ("id" in sched) ? sched.id : "none", mk: mk.stdout.text.trim() };
}

function parseStats(text) {
  const sec = text.split(/##\s*run-stats/i)[1] || "";
  const tc = sec.match(/toolcalls[^\d\n]*?([\d,]+)/i);
  const tk = sec.match(/tokens?[^\n]*?(n\/a|[\d,.]+)/i);
  return { toolcalls: tc ? tc[1] : null, tokens: tk ? tk[1] : null };
}

async function closeoutCell(task, arm, overrides) {
  overrides = overrides || {};
  const cell = ROOT + "/" + arm + "/" + task;
  const run = await readJson(ROOT + "/_audit/" + task + "-" + arm + "-run.json");
  const ok = makeAuditor(cell, arm, task);
  const srcRows = await hashTree(run.fixtureSource);
  const dstRows = await hashTree(cell + "/fixture");
  const cmp = compareTrees(treeMap(srcRows, run.fixtureSource), treeMap(dstRows, cell + "/fixture"));
  const files = await tools.pwsh({
    description: "List cell output files for " + task + " " + arm,
    command: "Get-ChildItem -Recurse -File '" + cell + "/agent-output' -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName + '|' + $_.Length }",
    workdir: REPO
  });
  const endedAt = await nowStamp();

  let reportPath = null, reportBytes = 0, stats = { toolcalls: null, tokens: null };
  let manViol = [], ttViol = [], manCount = 0, ttCount = 0, auditErr = null;
  try {
    const rows = await hashTree(cell + "/agent-output");
    const rep = rows.filter(function (r) { return /report/i.test(r.full) && r.len > 0; });
    if (rep.length) {
      rep.sort(function (a, b) { return b.len - a.len; });
      reportPath = norm(rep[0].full).slice(norm(cell).length + 1);
      reportBytes = rep[0].len;
      stats = parseStats(await readText(rep[0].full));
    }
    const man = (await readText(cell + "/agent-output/transcript-manifest.txt")).split("\n");
    const tt = (await readText(cell + "/agent-output/tool-transcript.txt")).split("\n");
    for (const line of man) {
      const m = line.match(/^\s*([RW])\s+(.+?)\s*$/i);
      if (!m) continue;
      manCount++;
      if (!ok(m[2], /^w$/i.test(m[1]))) manViol.push(line.trim());
    }
    const driveRe = /(?:[A-Za-z]:[\/\\][^\s"'|;&<>]+|\/app\/[^\s"'|;&<>]+)/g;
    const accessRe = /\b(read|write|edit|read_image|glob|grep|get-content|gc |cat |type |copy-item|move-item|remove-item|set-content|out-file|new-item|cmd\/c|spawn|exec)\b/i;
    for (const line of tt) {
      ttCount++;
      const isWrite = /\b(write|edit|set-content|out-file|copy-item|move-item|new-item|remove-item)\b/i.test(line);
      const outside = (line.match(driveRe) || []).map(function (h) { return h.replace(/[.\)\]]+$/, ""); }).filter(function (h) { return !ok(h, isWrite); });
      if (outside.length && accessRe.test(line)) ttViol.push(line.trim().slice(0, 240) + "  ==> " + outside.join(" ; "));
    }
  } catch (e) { auditErr = String((e && e.message) || e); }

  const realViolations = manViol.length + ttViol.length;
  const fixtureOk = cmp.mismatched.length === 0 && cmp.missing.length === 0 && cmp.extra.length === 0;
  let statusValue = "done";
  if (!reportBytes) statusValue = "invalid:report-missing";
  else if (!fixtureOk) statusValue = "invalid:fixture-changed";
  else if (realViolations > 0) statusValue = "invalid:roaming";
  const toolcalls = overrides.toolcalls || stats.toolcalls || "n/a";
  const tokens = overrides.tokens || stats.tokens || "n/a";

  await writeJson(ROOT + "/_audit/" + task + "-" + arm + "-status.json", {
    task: task, arm: arm, cell: cell, subagentId: run.subagentId, status: statusValue,
    startedAt: run.startedAt, endedAt: endedAt, duration: durText(run.startedAt, endedAt),
    report: { path: reportPath, bytes: reportBytes, ok: reportBytes > 0 },
    fixture: { compare: cmp, ok: fixtureOk },
    transcriptAudit: {
      manifestLines: manCount, manifestViolations: manViol.length,
      toolTranscriptLines: ttCount, flaggedLines: ttViol.length,
      realViolations: realViolations, verdict: realViolations === 0 ? "pass" : "invalid:roaming",
      manifestViolationLines: manViol, flaggedTranscriptLines: ttViol, auditErr: auditErr
    },
    runStats: { toolcalls: toolcalls, tokens: tokens },
    notes: overrides.notes || ""
  });
  await writeJson(ROOT + "/_audit/" + task + "-" + arm + "-run.json", Object.assign({}, run, { status: statusValue, endedAt: endedAt }));
  const led = (await readText(ROOT + "/cell-ledger.md")).replace(/\n*$/, "\n");
  await tools.write({
    file_path: ROOT + "/cell-ledger.md",
    content: led + "| " + task + " | " + arm + " | " + statusValue + " | " + hhmmss(run.startedAt) + " | " + hhmmss(endedAt) + " | " + durText(run.startedAt, endedAt) + " | " + toolcalls + " | " + tokens + " |\n"
  });
  if (run.timeoutScheduleId && run.timeoutScheduleId !== "none") {
    try { await tools.schedule_delete({ id: run.timeoutScheduleId }); } catch (e) { }
  }
  return {
    task: task, arm: arm, status: statusValue, duration: durText(run.startedAt, endedAt),
    reportPath: reportPath, reportBytes: reportBytes, fixture: cmp,
    manifestLines: manCount, manifestViolations: manViol.length,
    transcriptLines: ttCount, flagged: ttViol.length, realViolations: realViolations, auditErr: auditErr,
    toolcalls: toolcalls, tokens: tokens,
    cellFiles: files.stdout.text.trim().split("\n").map(function (l) { return l.replace(norm(cell) + "/", ""); }).join(" ; ")
  };
}

async function stateReport() {
  const list = await tools.pwsh({
    description: "List audit state files",
    command: "Get-ChildItem -File '" + ROOT + "/_audit' | Select-Object -ExpandProperty Name",
    workdir: REPO
  });
  return list.stdout.text.trim().split("\n").filter(Boolean);
}

if (args.action === "spawn") {
  const out = [];
  for (const pair of args.cells) {
    try { out.push(await spawnCell(pair[0], pair[1])); }
    catch (e) { out.push({ task: pair[0], arm: pair[1], error: String((e && e.message) || e) }); }
  }
  return out;
} else if (args.action === "closeout") {
  const out = [];
  for (const pair of args.cells) {
    const key = pair[0] + "/" + pair[1];
    try { out.push(await closeoutCell(pair[0], pair[1], (args.stats && args.stats[key]) || {})); }
    catch (e) { out.push({ task: pair[0], arm: pair[1], error: String((e && e.message) || e) }); }
  }
  return out;
} else if (args.action === "state") {
  return await stateReport();
}
return { error: "unknown action" };

