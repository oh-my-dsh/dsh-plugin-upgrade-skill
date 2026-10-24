#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { runDoctor } from './dsh-hygiene-doctor.mjs';

// dsh-env-healer.mjs
// 本地 DSH 环境自愈与生命周期维护器：
// 1. 自动隔离/清除 profiles 覆盖层残留毒化包 (移至 ~/.dsh/.trash/YYYY-MM-DD_原包名)
// 2. 终止悬浮幽灵宿主进程，消除内存旧投影
// 3. 回收非正常退出遗留的临时快照目录与锁文件

function ensureTrashDir(dshHome) {
  const trashDir = path.join(dshHome, '.trash');
  if (!fs.existsSync(trashDir)) {
    fs.mkdirSync(trashDir, { recursive: true });
  }
  return trashDir;
}

function healOverlays(report, dshHome) {
  const actions = [];
  const trashDir = ensureTrashDir(dshHome);
  const datePrefix = new Date().toISOString().slice(0, 10);

  for (const issue of report.overlayIssues) {
    if (fs.existsSync(issue.path)) {
      const baseName = path.basename(issue.path);
      const targetTrashName = `${datePrefix}_${issue.profile}_${baseName}`;
      const trashPath = path.join(trashDir, targetTrashName);

      try {
        fs.renameSync(issue.path, trashPath);
        actions.push({
          success: true,
          type: 'isolate_tainted_overlay',
          pkg: issue.pkgName,
          from: issue.path,
          to: trashPath,
        });
      } catch (err) {
        actions.push({
          success: false,
          type: 'isolate_tainted_overlay',
          pkg: issue.pkgName,
          error: err.message,
        });
      }
    }
  }
  return actions;
}

function terminateGhosts(runningHosts) {
  const actions = [];
  for (const h of runningHosts) {
    try {
      process.kill(h.pid, 'SIGTERM');
      actions.push({
        success: true,
        pid: h.pid,
        cmd: h.cmd,
      });
    } catch (err) {
      actions.push({
        success: false,
        pid: h.pid,
        error: err.message,
      });
    }
  }
  return actions;
}

function cleanStaleSnapshots(dshHome) {
  const actions = [];
  // 查找 /tmp 或 ~/.dsh/ 下残留的 dsh-workspace-changes-*
  const candidateDirs = ['/tmp', path.join(os.homedir(), 'tmp'), dshHome];
  for (const parent of candidateDirs) {
    if (!fs.existsSync(parent)) continue;
    try {
      const list = fs.readdirSync(parent);
      for (const item of list) {
        if (item.startsWith('dsh-workspace-changes-')) {
          const fullPath = path.join(parent, item);
          const stat = fs.statSync(fullPath);
          // 超过 1 小时前的残留目录
          if (Date.now() - stat.mtimeMs > 3600000) {
            fs.rmSync(fullPath, { recursive: true, force: true });
            actions.push({
              type: 'clean_stale_snapshot',
              path: fullPath,
            });
          }
        }
      }
    } catch {}
  }
  return actions;
}

export function healEnvironment(options = {}) {
  const dshHome = options.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const targetDir = options.targetDir || process.cwd();
  const doHealOverlays = options.healOverlays ?? true;
  const doKillGhosts = options.killGhosts ?? false;
  const doCleanSnapshots = options.cleanSnapshots ?? true;

  const initialReport = runDoctor({ dshHome, targetDir });
  const results = {
    timestamp: new Date().toISOString(),
    dshHome,
    overlayActions: [],
    ghostActions: [],
    snapshotActions: [],
  };

  if (doHealOverlays && initialReport.overlayIssues.length > 0) {
    results.overlayActions = healOverlays(initialReport, dshHome);
  }

  if (doKillGhosts && initialReport.runningHosts.length > 0) {
    results.ghostActions = terminateGhosts(initialReport.runningHosts);
  }

  if (doCleanSnapshots) {
    results.snapshotActions = cleanStaleSnapshots(dshHome);
  }

  // 自愈后复检
  results.postHealReport = runDoctor({ dshHome, targetDir });
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const doKillGhosts = args.includes('--kill-ghosts');
  const doDryRun = args.includes('--dry-run');

  console.log(`\n=== DSH 环境自愈与生命周期维护 (Env-Healer) ===`);
  const initialDoctor = runDoctor({ targetDir: process.cwd() });

  if (doDryRun) {
    console.log(`[Dry-Run 模式] 待处理项:`);
    console.log(`- 待隔离覆盖层残留: ${initialDoctor.overlayIssues.length} 项`);
    console.log(`- 运行中幽灵宿主进程: ${initialDoctor.runningHosts.length} 项`);
    process.exit(0);
  }

  const result = healEnvironment({ killGhosts: doKillGhosts });
  console.log(`\n自愈动作执行完成:`);
  console.log(`- 覆盖层旧包隔离: ${result.overlayActions.length} 项处理`);
  for (const a of result.overlayActions) {
    if (a.success) console.log(`  + [已移至回收站] ${a.pkg} -> ${a.to}`);
    else console.log(`  ! [隔离失败] ${a.pkg}: ${a.error}`);
  }

  if (result.ghostActions.length > 0) {
    console.log(`- 幽灵宿主终止: ${result.ghostActions.length} 项处理`);
    for (const g of result.ghostActions) {
      if (g.success) console.log(`  + [已发送终止信号] PID ${g.pid}`);
      else console.log(`  ! [终止失败] PID ${g.pid}: ${g.error}`);
    }
  }

  if (result.snapshotActions.length > 0) {
    console.log(`- 临时快照清理: ${result.snapshotActions.length} 处清理`);
    for (const s of result.snapshotActions) {
      console.log(`  + [已清理] ${s.path}`);
    }
  }

  console.log(`\n复检结果: 覆盖层残留降至 ${result.postHealReport.overlayIssues.length} 项`);
  console.log(`环境自愈状态: ${result.postHealReport.overlayIssues.length === 0 ? '【完全健康】' : '【存在需人工核验项】'}\n`);
}
