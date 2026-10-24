#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

// dsh-hygiene-doctor.mjs
// 1. 巡检 profiles 覆盖层 (~/.dsh/profiles/<profile>/node_modules/@deepseek-ai)
//    对照全局 dsh 安装版本与 mtime，定位旧包残留（防 issue #263 消息写入拒收等问题）。
// 2. 检查运行中的 DSH 幽灵进程 (Ghost Host Process)，提示是否需杀进程重载以消除内存旧投影。
// 3. 检查目标插件代码库中的工具链卫生 (tsbuildinfo 缓存污染、pnpm 10 prepare 脚本拦截风险等)。

function getGlobalDshInfo() {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dshPkgPath = path.join(globalRoot, '@deepseek-ai', 'dsh', 'package.json');
    if (fs.existsSync(dshPkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(dshPkgPath, 'utf8'));
      const stat = fs.statSync(dshPkgPath);
      return {
        installed: true,
        version: pkg.version,
        path: path.dirname(dshPkgPath),
        mtime: stat.mtimeMs,
        mtimeStr: stat.mtime.toISOString(),
      };
    }
  } catch {}
  return { installed: false, version: 'unknown', path: '', mtime: 0, mtimeStr: '' };
}

const DEPRECATED_DSH_PACKAGES = new Set([
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-report',
  '@deepseek-ai/dsh-workflow-worker-thread',
]);

function getGlobalPackageInfo(pkgFullName) {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    // 1. 全局直接安装的包
    let candidate = path.join(globalRoot, ...pkgFullName.split('/'), 'package.json');
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    }
    // 2. 在 @deepseek-ai/dsh 的 node_modules 内
    candidate = path.join(globalRoot, '@deepseek-ai', 'dsh', 'node_modules', ...pkgFullName.split('/'), 'package.json');
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    }
  } catch {}
  return null;
}

function scanProfiles(dshHome, globalDsh) {
  const issues = [];
  const profilesDir = path.join(dshHome, 'profiles');
  if (!fs.existsSync(profilesDir)) return issues;

  const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
  for (const entry of entries) {
    let checkDirs = [];
    if (entry.isDirectory() && entry.name === 'node_modules') {
      checkDirs.push({ profileName: '<root-profiles>', dir: path.join(profilesDir, 'node_modules', '@deepseek-ai') });
    } else if (entry.isDirectory()) {
      const subModules = path.join(profilesDir, entry.name, 'node_modules', '@deepseek-ai');
      if (fs.existsSync(subModules)) {
        checkDirs.push({ profileName: entry.name, dir: subModules });
      }
    }

    for (const { profileName, dir } of checkDirs) {
      if (!fs.existsSync(dir)) continue;
      const pkgs = fs.readdirSync(dir, { withFileTypes: true });
      for (const p of pkgs) {
        if (!p.isDirectory()) continue;
        const subPkgJson = path.join(dir, p.name, 'package.json');
        if (fs.existsSync(subPkgJson)) {
          try {
            const data = JSON.parse(fs.readFileSync(subPkgJson, 'utf8'));
            const stat = fs.statSync(subPkgJson);
            const fullPkgName = `@deepseek-ai/${p.name}`;

            // 1. 废弃包检查
            if (DEPRECATED_DSH_PACKAGES.has(fullPkgName)) {
              issues.push({
                type: 'deprecated_overlay_pkg',
                profile: profileName,
                pkgName: fullPkgName,
                path: path.join(dir, p.name),
                profileVersion: data.version,
                globalVersion: 'DEPRECATED/REMOVED',
                mtimeStr: stat.mtime.toISOString(),
                severity: 'CRITICAL',
                reason: `已废弃的上游宿主包（上游版本已移除该包，留在覆盖层会导致运行时装载冲突）`,
              });
              continue;
            }

            // 2. 对照全局安装包版本
            const globalPkg = getGlobalPackageInfo(fullPkgName);
            if (globalPkg) {
              if (globalPkg.version !== data.version) {
                issues.push({
                  type: 'tainted_overlay',
                  profile: profileName,
                  pkgName: fullPkgName,
                  path: path.join(dir, p.name),
                  profileVersion: data.version,
                  globalVersion: globalPkg.version,
                  mtimeStr: stat.mtime.toISOString(),
                  severity: 'CRITICAL',
                  reason: `覆盖层版本 (${data.version}) 与全局宿主所带版本 (${globalPkg.version}) 不一致，优先被解析会引发接口破坏`,
                });
              }
            } else if (p.name.startsWith('dsh-') && globalDsh.installed && data.version !== globalDsh.version) {
              issues.push({
                type: 'dsh_suite_version_mismatch',
                profile: profileName,
                pkgName: fullPkgName,
                path: path.join(dir, p.name),
                profileVersion: data.version,
                globalVersion: globalDsh.version,
                mtimeStr: stat.mtime.toISOString(),
                severity: 'HIGH',
                reason: `DSH 套件子包版本 (${data.version}) 与全局宿主版本 (${globalDsh.version}) 脱节`,
              });
            }
          } catch {}
        }
      }
    }
  }
  return issues;
}

function detectRunningHosts() {
  const hosts = [];
  try {
    const ps = execSync('ps -axo pid,etime,command', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = ps.split('\n');
    for (const line of lines) {
      if (line.includes('dsh') && !line.includes('ps -axo') && !line.includes('dsh-hygiene-doctor') && !line.includes('grep')) {
        const match = line.trim().match(/^(\d+)\s+([^\s]+)\s+(.*)$/);
        if (match) {
          const [, pid, etime, cmd] = match;
          if (cmd.includes('dsh web') || cmd.includes('dsh desktop') || cmd.includes('@deepseek-ai/dsh') || cmd.endsWith('/dsh')) {
            hosts.push({ pid: parseInt(pid, 10), etime, cmd });
          }
        }
      }
    }
  } catch {}
  return hosts;
}

function auditTargetPlugin(targetDir) {
  const issues = [];
  if (!targetDir || !fs.existsSync(targetDir)) return issues;

  // 1. tsbuildinfo 缓存污染检查
  const tsbuildinfo = path.join(targetDir, 'tsconfig.tsbuildinfo');
  if (fs.existsSync(tsbuildinfo)) {
    issues.push({
      type: 'tsbuildinfo_cache',
      path: tsbuildinfo,
      severity: 'WARN',
      reason: '存在 tsconfig.tsbuildinfo，跨版本构建容易产生 TS2305/TS2614 假阳性，建议执行 clean',
    });
  }

  // 2. package.json 检查
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      // prepare 脚本检查
      if (pkg.scripts && pkg.scripts.prepare) {
        issues.push({
          type: 'pnpm_prepare_trap',
          path: pkgPath,
          severity: 'HIGH',
          reason: 'package.json 含有 "prepare" 脚本。pnpm >= 10 默认拦截第三方 git 依赖运行 lifecycle scripts，导致安装中断',
          suggestion: '在发布或提交时将构建产物 vendor 进 lib/，并移除 prepare 脚本',
        });
      }
      // peerDependencies SemVer 语法检查
      if (pkg.peerDependencies) {
        for (const [name, range] of Object.entries(pkg.peerDependencies)) {
          if (name.startsWith('@deepseek-ai/')) {
            if (/^\^[0-9]+\.[0-9]+\.[0-9]+$/.test(range) || />=[0-9]+\.[0-9]+\.[0-9]+ <[0-9]+\.[0-9]+\.[0-9]+/.test(range)) {
              if (!range.includes('-0') && !range.includes('rc') && !range.includes('alpha')) {
                issues.push({
                  type: 'peer_prerelease_rejection',
                  path: pkgPath,
                  pkgName: name,
                  range,
                  severity: 'HIGH',
                  reason: `peerDependencies "${name}": "${range}" 在 npm/pnpm 下会拒绝 -rc 或 -alpha 预发布版本宿主`,
                  suggestion: `改为含预发布放行的范围，如 ">=0.1.0-0 <0.3.0"`,
                });
              }
            }
          }
        }
      }
    } catch {}
  }

  return issues;
}

export function runDoctor(options = {}) {
  const dshHome = options.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const targetDir = options.targetDir ? path.resolve(options.targetDir) : process.cwd();
  const globalDsh = getGlobalDshInfo();

  const overlayIssues = scanProfiles(dshHome, globalDsh);
  const runningHosts = detectRunningHosts();
  const pluginIssues = auditTargetPlugin(targetDir);

  const report = {
    timestamp: new Date().toISOString(),
    globalDsh,
    dshHome,
    targetDir,
    overlayIssues,
    runningHosts,
    pluginIssues,
    isHealthy: overlayIssues.length === 0 && runningHosts.length === 0 && pluginIssues.length === 0,
  };

  return report;
}

// CLI 执行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const targetDir = args[0] || process.cwd();
  const isJson = args.includes('--json');
  const doClean = args.includes('--clean-cache');

  const report = runDoctor({ targetDir });

  if (doClean) {
    const tsbuildinfo = path.join(targetDir, 'tsconfig.tsbuildinfo');
    if (fs.existsSync(tsbuildinfo)) {
      fs.unlinkSync(tsbuildinfo);
      console.log(`[Cleaned] 已删除 ${tsbuildinfo}`);
    }
  }

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.isHealthy ? 0 : 1);
  }

  console.log(`\n=== DSH 环境卫生与适配体检报告 ===`);
  console.log(`全局宿主: @deepseek-ai/dsh@${report.globalDsh.version || '未安装'} (${report.globalDsh.path || 'N/A'})`);
  console.log(`DSH 主目录: ${report.dshHome}`);
  console.log(`检查目标: ${report.targetDir}\n`);

  if (report.runningHosts.length > 0) {
    console.log(`[警告] 正在运行的 DSH 宿主进程 (${report.runningHosts.length} 个):`);
    for (const h of report.runningHosts) {
      console.log(`  - PID: ${h.pid} | 运行时长: ${h.etime} | 进程: ${h.cmd.slice(0, 80)}`);
    }
    console.log(`  提示: 插件 Host 端 (lib/index.js) 修改后必须重启该进程，否则内存投影仍为旧版！\n`);
  } else {
    console.log(`[正常] 未检测到后台常驻 DSH 宿主进程 (无内存投影冲突风险)`);
  }

  if (report.overlayIssues.length > 0) {
    console.log(`[严重] 发现 profiles 覆盖层残留旧包 (${report.overlayIssues.length} 处，易触发 issue #263):`);
    for (const issue of report.overlayIssues) {
      console.log(`  - [${issue.severity}] [Profile: ${issue.profile}] ${issue.pkgName}`);
      console.log(`    路径: ${issue.path}`);
      console.log(`    原因: ${issue.reason}`);
    }
    console.log(`  建议: 将覆盖层旧包删除或移至回收站，回落全局安装。\n`);
  } else {
    console.log(`[正常] Profiles 覆盖层无陈旧或毒化包残留`);
  }

  if (report.pluginIssues.length > 0) {
    console.log(`[注意] 插件项目工具链检查发现 (${report.pluginIssues.length} 项):`);
    for (const issue of report.pluginIssues) {
      console.log(`  - [${issue.severity}] ${issue.type}`);
      console.log(`    原因: ${issue.reason}`);
      if (issue.suggestion) console.log(`    建议: ${issue.suggestion}`);
    }
    console.log();
  } else {
    console.log(`[正常] 插件 package.json 与构建缓存未发现隐患`);
  }

  process.exit(report.isHealthy ? 0 : 0);
}
