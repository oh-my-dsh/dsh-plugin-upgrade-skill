import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let libCache = null;
async function getLib(root) {
  if (!libCache) libCache = await import(pathToFileURL(path.join(root, "_orch", "lib.mjs")).href);
  return libCache;
}

export async function processTurn(root, repo, sessionsRoot, skillDir, opts) {
  const lib = await getLib(root);
  const state = lib.loadState(root);
  const finished = ((opts && opts.finished) || []).slice();
  const closed = [];
  const now = Date.now();

  for (const cell of state.cells) {
    if (cell.status === "running" && cell.interruptRequested && now - (cell.startMs || now) > 32 * 60 * 1000) {
      finished.push({ id: cell.subagentId, note: "force-closed after interrupt (no finish notification)", timeout: true });
    }
  }

  for (const f of finished) {
    const cell = state.cells.find((c) => c.subagentId === f.id && (c.status === "running" || c.status === "review" || c.status === "soft-review"));
    if (!cell) { closed.push({ id: f.id, error: "cell not found or not running" }); continue; }
    const r = lib.closeout(cell, sessionsRoot, skillDir);
    if (f.note) cell.notes = f.note;
    lib.finalizeCell(cell, r);
    if (f.timeout) {
      cell.status = "timeout";
      cell.notes = (cell.notes || "") + " [closed by 30-min timeout rule]";
      fs.writeFileSync(path.join(cell.cellDir, "status.json"), JSON.stringify({ cell: cell, timeout: true }, null, 2) + "\n");
    }
    closed.push({ task: cell.task, arm: cell.arm, status: cell.status, verdict: cell.auditVerdict, hard: cell.auditHard, soft: cell.auditSoft, reportOk: r.reportOk, reportPath: r.reportPath, fixture: r.fixture ? { ok: r.fixture.ok, changed: r.fixture.changed, missing: r.fixture.missing, added: r.fixture.added } : null, durationSec: cell.durationSec, toolcalls: cell.toolcalls, tokensTotal: cell.tokensTotal, candidates: (r.candidates || []).slice(0, 15) });
  }

  const toInterrupt = [];
  for (const cell of state.cells) {
    if (cell.status === "running" && now - (cell.startMs || now) > 30 * 60 * 1000 && !cell.interruptRequested) {
      cell.interruptRequested = true;
      toInterrupt.push({ subagentId: cell.subagentId, task: cell.task, arm: cell.arm, elapsedMin: Math.round((now - (cell.startMs || now)) / 60000) });
    }
  }

  const spawns = [];
  const limit = (opts && opts.concurrency) || 2;
  const runningCount = () => state.cells.filter((c) => c.status === "running").length;
  while (runningCount() + spawns.length < limit) {
    const next = state.cells.find((c) => c.status === "pending");
    if (!next) break;
    const n = lib.prepareCell(repo, next);
    const instruction = fs.readFileSync(path.join(repo, "benchmark", "tasks", next.task, "instruction.md"), "utf8");
    spawns.push({ cellKey: next.task + "|" + next.arm, cwd: next.cellDir, description: next.task.split("-")[0] + " " + next.arm + " solver", prompt: lib.buildPrompt(skillDir, next, instruction), fixtureFiles: n });
    next.status = "spawning";
  }
  lib.saveState(root, state);
  lib.renderLedger(root, state);
  return { closed: closed, toInterrupt: toInterrupt, spawns: spawns };
}

export async function commitSpawn(root, cellKey, subagentId) {
  const lib = await getLib(root);
  const state = lib.loadState(root);
  const i = cellKey.indexOf("|");
  const task = cellKey.slice(0, i), arm = cellKey.slice(i + 1);
  const cell = state.cells.find((c) => c.task === task && c.arm === arm);
  if (!cell) throw new Error("no cell " + cellKey);
  cell.status = "running";
  cell.subagentId = subagentId;
  cell.start = lib.nowIso();
  cell.startMs = Date.now();
  lib.saveState(root, state);
  lib.renderLedger(root, state);
  return cell.task + "/" + cell.arm;
}

export async function abortSpawn(root, cellKey) {
  const lib = await getLib(root);
  const state = lib.loadState(root);
  const i = cellKey.indexOf("|");
  const task = cellKey.slice(0, i), arm = cellKey.slice(i + 1);
  const cell = state.cells.find((c) => c.task === task && c.arm === arm);
  if (cell && cell.status === "spawning") cell.status = "pending";
  lib.saveState(root, state);
  lib.renderLedger(root, state);
}

export async function snapshot(root) {
  const lib = await getLib(root);
  const state = lib.loadState(root);
  const by = {};
  for (const c of state.cells) by[c.status] = (by[c.status] || 0) + 1;
  return {
    statuses: by,
    running: state.cells.filter((c) => c.status === "running").map((c) => c.task + "/" + c.arm + " since " + c.start + " (age " + Math.round((Date.now() - (c.startMs || Date.now())) / 60000) + "m)"),
    needReview: state.cells.filter((c) => c.status === "review" || c.status === "soft-review").map((c) => c.task + "/" + c.arm),
    anomalies: state.cells.filter((c) => ["timeout", "no-report", "done:fixture-changed", "done:no-transcript"].includes(c.status)).map((c) => c.task + "/" + c.arm + "=" + c.status)
  };
}
