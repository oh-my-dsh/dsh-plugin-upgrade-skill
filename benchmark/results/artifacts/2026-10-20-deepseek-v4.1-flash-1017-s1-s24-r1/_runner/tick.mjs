import fs from "node:fs";
import path from "node:path";
import * as lib from "./lib.mjs";

const MAX_PARALLEL = 2;
const CELL_TIMEOUT_MS = 30 * 60 * 1000;
const ARMS = ["noskill", "skill"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmmss = (t) => new Date(t).toISOString().slice(11, 19);

function reportFiles(cell, task) {
  const dir = path.join(cell, "agent-output", task);
  const out = [];
  const walk = (d, rel) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? rel + "/" + e.name : e.name;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, r);
      else out.push({ name: r, bytes: fs.statSync(full).size });
    }
  };
  walk(dir, "");
  return out;
}

function usedSkill(events) {
  for (const e of events) {
    if (e.type !== "tool/call") continue;
    const a = String(e.data?.arguments ?? "");
    if (/plugin-upgrade[^"']*SKILL\.md/i.test(a) || /SKILL\.md/i.test(a)) return true;
  }
  return false;
}

export async function tick(tools, budgetMs) {
  const st = lib.loadState();
  const tasks = lib.listTasks();
  const order = [];
  for (const t of tasks) for (const arm of ARMS) order.push(lib.cellKey(t, arm));
  const t00 = Date.now();
  const out = [];
  const launched = [], finished = [];

  const running = () => Object.values(st.cells).filter((c) => c.status === "running");

  async function finalize(c) {
    const cell = lib.cellDir(c.task, c.arm);
    let sess = lib.findSessionByAgent(c.agentId);
    for (let i = 0; i < 4 && !sess; i++) { await sleep(3000); sess = lib.findSessionByAgent(c.agentId); }
    const events = sess ? sess.events : [];
    const sum = lib.summarize(events);
    const audit = lib.auditCell(events, cell, c.arm);
    const flags = audit.flags;
    let post = null;
    try { post = lib.treeHash(path.join(cell, "fixture")); } catch (e) { post = { hash: "ERR:" + e.message, count: 0, bytes: 0 }; }
    const fixtureOk = post.hash === c.pre && post.count === c.preCount;
    const reps = reportFiles(cell, c.task);
    const nonEmpty = reps.filter((r) => r.bytes > 0);
    let status = "done";
    let note = "";
    if (!fixtureOk) { status = "invalid:fixture-modified"; note = "pre=" + c.pre.slice(0, 10) + " post=" + post.hash.slice(0, 10) + " count " + c.preCount + "->" + post.count; }
    else if (!nonEmpty.length) { status = "noreport"; note = "no non-empty file in agent-output/" + c.task; }
    else if (c.arm === "skill" && !usedSkill(events)) { status = "invalid:noskill-used"; note = "skill arm never read SKILL.md"; }
    let abortErr = null;
    for (const e of events) if (e.type === "turn/end" && e.data?.reason?.kind === "error") abortErr = String(e.data.reason.error?.message ?? "model error").slice(0, 180);
    if (abortErr && nonEmpty.length === 0) { status = "error:infra-abort"; note = abortErr; }

    c.end = Date.now();
    c.duration = c.end - c.start;
    c.status = status;
    c.note = note;
    c.toolcalls = sum.toolcalls;
    c.tokens = sum.tokens;
    c.inputTokens = sum.inputTokens;
    c.outputTokens = sum.outputTokens;
    c.model = sum.model || "?";
    c.provider = sum.provider || "?";
    c.report = nonEmpty.sort((a, b) => b.bytes - a.bytes).map((r) => r.name + "(" + r.bytes + "B)").join(", ");
    c.reportFiles = reps;
    c.flags = flags;
    c.reads = audit.reads;
    c.writes = audit.writes;
    c.skillRead = usedSkill(events);
    c.postHash = post.hash;
    c.sessionDir = sess ? sess.dir : null;

    lib.saveState(st);
    fs.writeFileSync(path.join(lib.RUNNER, "cells", c.task + "." + c.arm + ".json"),
      JSON.stringify({ key: lib.cellKey(c.task, c.arm), ...c, flags }, null, 1), "utf8");
    const row = "| " + c.task + " | " + c.arm + " | " + status + (note ? " (" + note.replace(/\|/g, "/") + ")" : "") + " | " + hhmmss(c.start) + " | " + hhmmss(c.end) + " | " + Math.round(c.duration / 1000) + "s | " + c.toolcalls + " | " + c.tokens + " |\n";
    fs.appendFileSync(lib.LEDGER, row, "utf8");
    finished.push(c.task + "/" + c.arm + " " + status + " " + Math.round(c.duration / 1000) + "s tc=" + c.toolcalls + " tok=" + c.tokens + " flags=" + flags.length + (c.report ? " rep=" + c.report : ""));
    if (status === "error:infra-abort" && (c.attempts ?? 0) < 1) {
      c.attempts = 1;
      c.status = "pending";
      c.note = "retry 1 after infra abort";
      delete c.agentId; delete c.start; delete c.end; delete c.duration;
      lib.saveState(st);
      finished.push(c.task + "/" + c.arm + " -> rescheduled for one retry");
    }
  }

  // single pass: finalize finished, then fill slots; no polling (notifications drive the next tick)
  let kids = [];
  try { kids = await tools.list_agents({ scope: "children" }); } catch (e) { kids = []; }
  for (const c of running()) {
    const k = kids.find((x) => x.id === c.agentId);
    const elapsed = Date.now() - c.start;
    if (k && k.status === "inactive") { await finalize(c); }
    else if (elapsed > CELL_TIMEOUT_MS) {
      try { await tools.interrupt_agent({ agent_id: c.agentId }); } catch (e) {}
      c.end = Date.now(); c.duration = c.end - c.start; c.status = "timeout"; c.note = ">30min";
      lib.saveState(st);
      fs.appendFileSync(lib.LEDGER, "| " + c.task + " | " + c.arm + " | timeout (>30min) | " + hhmmss(c.start) + " | " + hhmmss(c.end) + " | " + Math.round(c.duration / 1000) + "s | - | - |\n", "utf8");
      finished.push(c.task + "/" + c.arm + " TIMEOUT");
    }
  }

  for (const key of order) {
    if (running().length >= MAX_PARALLEL) break;
    const c = st.cells[key];
    if (c.status !== "pending") continue;
    const prep = lib.prepCell(c.task, c.arm);
    const instruction = fs.readFileSync(path.join(lib.TASKS_ROOT, c.task, "instruction.md"), "utf8");
    const prompt = lib.buildPrompt(c.task, c.arm, prep.dir, instruction);
    c.pre = prep.pre.hash; c.preCount = prep.pre.count;
    c.status = "launching";
    lib.saveState(st);
    const res = await tools.subagent({ cwd: prep.dir, description: c.task + " " + c.arm, prompt });
    c.agentId = res.subagentId; c.start = Date.now(); c.status = "running";
    lib.saveState(st);
    launched.push(c.task + "/" + c.arm + " -> " + res.subagentId.slice(0, 8));
  }

  const done = Object.values(st.cells).filter((c) => c.status !== "pending" && c.status !== "running" && c.status !== "launching").length;
  const inflightNow = running().map((c) => c.task + "/" + c.arm + "@" + Math.round((Date.now() - c.start) / 1000) + "s");
  const pendingLeft = Object.values(st.cells).filter((c) => c.status === "pending").length;
  return { launched, finished, done, pendingLeft, total: order.length, inflight: inflightNow, elapsed: Math.round((Date.now() - t00) / 1000) };
}
