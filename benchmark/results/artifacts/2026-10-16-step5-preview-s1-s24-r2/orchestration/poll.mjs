// r2 poll driver: finalize finished cells, relaunch once on no-report, top up to 3, enforce 30m timeout.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
import * as R from './runner.mjs';
import * as F from './finalize.mjs';

const CELL_TIMEOUT_MS = 30 * 60 * 1000;
const CONCURRENCY = 3;

export async function poll(tools) {
  const state = R.loadState();
  const now = Date.now();
  const order = [];
  for (const task of L.TASKS) for (const arm of L.ARMS) order.push(L.cellId(task, arm));
  const agents = await tools.list_agents({ scope: 'children' });
  const amap = {};
  for (const a of agents) amap[a.id] = a.status;
  const log = [];
  const notes = [];

  // 1. finalize / relaunch finished cells
  for (const id of order) {
    const cell = state.cells[id];
    if (cell.status !== 'in-flight') continue;
    const lastSessId = (cell.sessions && cell.sessions.length) ? cell.sessions[cell.sessions.length - 1].id : cell.subagentId;
    const agentStatus = amap[lastSessId];
    const timedOut = (now - cell.dispatchedAt) > CELL_TIMEOUT_MS;
    if (agentStatus !== 'inactive' && !timedOut) continue;
    if (timedOut && agentStatus !== 'inactive') {
      try { await tools.interrupt_agent({ agent_id: lastSessId }); } catch (e) {}
      notes.push(R.iso(now) + ': ' + id + ' attempt ' + cell.attempt + ' exceeded the 30-minute per-cell timeout and was interrupted (subagent ' + lastSessId + ').');
      log.push(id + ' TIMEOUT-INTERRUPTED');
    }
    // gather report state before deciding
    const parts = id.split('/');
    const reports = R.findDeliverable(parts[0], parts[1]);
    if (reports.length === 0 && !cell.relaunched) {
      // one relaunch per protocol
      cell.relaunched = true;
      const prompt = fs.readFileSync(path.join(L.ORCH, 'prompts', parts[0] + '__' + parts[1] + '.md'), 'utf8');
      try {
        const res = await tools.subagent({ cwd: L.cellDir(parts[0], parts[1]), description: parts[0] + ' ' + parts[1] + ' solver (relaunch)', prompt: prompt });
        cell.sessions.push({ id: res.subagentId, createdAt: now });
        cell.attempt = (cell.attempt || 1) + 1;
        cell.dispatchedAt = now;
        cell.dispatchedIso = R.iso(now);
        notes.push(R.iso(now) + ': ' + id + ' attempt produced no report (subagent ' + lastSessId + ', agent status ' + agentStatus + '); one relaunch dispatched per protocol (subagent ' + res.subagentId + ').');
        log.push(id + ' RELAUNCHED -> ' + res.subagentId);
      } catch (e) {
        notes.push(R.iso(now) + ': ' + id + ' relaunch dispatch failed: ' + e.message);
        log.push(id + ' RELAUNCH-FAILED');
      }
      continue;
    }
    F.finalizeCell(state, id);
    log.push(id + ' FINALIZED ' + cell.status + (cell.relaunched ? ' (relaunched)' : ''));
  }

  // 2. top up to concurrency
  let inFlight = order.filter(id => state.cells[id].status === 'in-flight').length;
  for (const id of order) {
    if (inFlight >= CONCURRENCY) break;
    const cell = state.cells[id];
    if (cell.status !== 'pending') continue;
    const parts = id.split('/');
    const prompt = fs.readFileSync(path.join(L.ORCH, 'prompts', parts[0] + '__' + parts[1] + '.md'), 'utf8');
    try {
      const res = await tools.subagent({ cwd: L.cellDir(parts[0], parts[1]), description: parts[0] + ' ' + parts[1] + ' solver', prompt: prompt });
      cell.status = 'in-flight';
      cell.subagentId = res.subagentId;
      cell.sessions = [{ id: res.subagentId, createdAt: now }];
      cell.dispatchedAt = now;
      cell.dispatchedIso = R.iso(now);
      cell.attempt = 1;
      inFlight++;
      log.push(id + ' DISPATCHED -> ' + res.subagentId);
    } catch (e) {
      notes.push(R.iso(now) + ': ' + id + ' dispatch failed: ' + e.message);
      log.push(id + ' DISPATCH-FAILED');
      break;
    }
  }

  for (const n of notes) state.executionNotes.push(n);
  R.saveState(state);
  R.renderLedger(state);
  R.updateManifest(state);
  const done = order.filter(id => state.cells[id].status !== 'pending' && state.cells[id].status !== 'in-flight').length;
  const inflight = order.filter(id => state.cells[id].status === 'in-flight').map(id => id + '(' + state.cells[id].attempt + ')');
  return { log: log, done: done, total: 48, inFlight: inflight, notes: notes };
}
