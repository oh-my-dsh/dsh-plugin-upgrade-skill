#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// dsh-plugin-auditor.mjs
// 遵循 MECE 原则的 DSH 插件深度性能、稳定性与自举质量审核器。
// 四大正交审核维度：
// 1. 内存与 I/O 防护 (OOM 防护 / 读写上限 / 同步 I/O 阻塞)
// 2. 契约弹性与弱耦合 (ctx.get 弱依赖守卫 / 优雅降级 / SemVer 放行)
// 3. 上下文常驻负载 (工具 Schema 体积 / 冗余枚举与描述)
// 4. 生命周期清理 (ctx.effect 卸载挂载 / 监听器泄漏)

export function auditPluginQuality(pluginDir) {
  const root = path.resolve(pluginDir);
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`找不到 package.json: ${pkgPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const report = {
    plugin: `${pkg.name}@${pkg.version}`,
    root,
    timestamp: new Date().toISOString(),
    scores: {
      performance: 100,
      resilience: 100,
      contextBudget: 100,
      lifecycle: 100,
    },
    findings: [],
  };

  // 遍历扫描所有源码文件
  const files = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) files.push(p);
    }
  }
  walk(root);

  for (const file of files) {
    const rel = path.relative(root, file);
    const content = fs.readFileSync(file, 'utf8');

    // 维度 1: 内存与 I/O 防护
    if (/readFileSync|writeFileSync/.test(content) && !/node:test|tests?|scripts?/.test(rel)) {
      report.findings.push({
        dimension: 'performance',
        severity: 'MEDIUM',
        file: rel,
        title: '生产代码中出现同步文件 I/O (readFileSync/writeFileSync)',
        detail: '高频调用下同步 I/O 会阻塞宿主事件循环，建议改用异步 I/O 或 fire-and-forget 模式。',
      });
      report.scores.performance = Math.max(60, report.scores.performance - 10);
    }

    if (/fs\.(readFile|createReadStream)/.test(content) && !/max.*bytes|sizeLimit|25.*1024.*1024/i.test(content)) {
      report.findings.push({
        dimension: 'performance',
        severity: 'LOW',
        file: rel,
        title: '文件读取缺少显式字节上限防护',
        detail: '建议针对未知来源或大图设置 25MiB 等上限守卫，防止读取超大文件引发宿主进程 OOM。',
      });
      report.scores.performance = Math.max(70, report.scores.performance - 5);
    }

    // 维度 2: 契约弹性与弱耦合
    if (/import.*@deepseek-ai\/dsh-session-query/.test(content)) {
      report.findings.push({
        dimension: 'resilience',
        severity: 'HIGH',
        file: rel,
        title: '强 import 非核心宿主包 (@deepseek-ai/dsh-session-query)',
        detail: '应改用 ctx.get("sessionQuery") 弱依赖探测，并在服务不存在时静默降级，切勿强依赖。',
      });
      report.scores.resilience = Math.max(50, report.scores.resilience - 20);
    }

    // 维度 3: 上下文常驻负载
    if (/registerTool|\.tools\.register|\.tools\.add/.test(content)) {
      if (content.length > 30000 && /description:/.test(content)) {
        report.findings.push({
          dimension: 'contextBudget',
          severity: 'LOW',
          file: rel,
          title: '工具描述可能偏重，建议检查 Schema 体积',
          detail: '单个工具 description 建议精炼，多余的用法背景可放入参考文档或按需返回。',
        });
        report.scores.contextBudget = Math.max(80, report.scores.contextBudget - 5);
      }
    }

    // 维度 4: 生命周期清理
    if (/\.on\(|setInterval|chokidar\.watch/.test(content) && !/ctx\.effect|dispose|clearInterval/.test(content)) {
      report.findings.push({
        dimension: 'lifecycle',
        severity: 'MEDIUM',
        file: rel,
        title: '事件监听或定时器未显式绑定清理逻辑',
        detail: 'Cordis 插件重载时，未清理的监听器与定时器会导致内存泄漏，建议注册在 ctx.effect 或返回 dispose。',
      });
      report.scores.lifecycle = Math.max(65, report.scores.lifecycle - 15);
    }
  }

  // 依赖层 peerDependencies 弹性审核
  if (pkg.peerDependencies) {
    for (const [k, v] of Object.entries(pkg.peerDependencies)) {
      if (k.startsWith('@deepseek-ai/') && !v.includes('-0')) {
        report.findings.push({
          dimension: 'resilience',
          severity: 'HIGH',
          file: 'package.json',
          title: `peerDependencies 缺少 prerelease 兼容区间 (${k})`,
          detail: `当前范围 "${v}" 在 npm/pnpm 下会拒绝 -rc / -alpha 版本的宿主，需规范为包含 -0 放行的范围。`,
        });
        report.scores.resilience = Math.max(60, report.scores.resilience - 15);
      }
    }
  }

  // 综合总分计算
  report.overallScore = Math.round(
    (report.scores.performance + report.scores.resilience + report.scores.contextBudget + report.scores.lifecycle) / 4
  );

  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const targetDir = process.argv[2] || process.cwd();
  console.log(`\n=== DSH 插件工业级质量与性能深度审计 (Plugin-Auditor) ===`);
  console.log(`目标: ${path.resolve(targetDir)}\n`);

  const report = auditPluginQuality(targetDir);
  console.log(`插件: ${report.plugin}`);
  console.log(`总体质量评分: ${report.overallScore} / 100`);
  console.log(`- 性能与内存安全: ${report.scores.performance} 分`);
  console.log(`- 契约弹性与弱耦合: ${report.scores.resilience} 分`);
  console.log(`- 上下文常驻预算: ${report.scores.contextBudget} 分`);
  console.log(`- 生命周期与清理: ${report.scores.lifecycle} 分\n`);

  if (report.findings.length === 0) {
    console.log(`[全项通过] 插件代码质量与性能契约完全达标！`);
  } else {
    console.log(`发现 ${report.findings.length} 项优化建议:`);
    for (const f of report.findings) {
      console.log(`\n* [${f.dimension.toUpperCase()}] [${f.severity}] ${f.title}`);
      console.log(`  位置: ${f.file}`);
      console.log(`  详情: ${f.detail}`);
    }
  }
  console.log();
}
