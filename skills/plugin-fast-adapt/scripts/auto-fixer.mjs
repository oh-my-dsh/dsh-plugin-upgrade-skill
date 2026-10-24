#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// auto-fixer.mjs
// 一键自愈与规范化工具：对常见的 DSH 破坏性配置与工具链隐患执行确定性机械修复。

export function applyAutoFix(pluginRoot, options = {}) {
  const root = path.resolve(pluginRoot);
  const pkgPath = path.join(root, 'package.json');
  const changes = [];

  // 1. 清理 tsbuildinfo 缓存
  const tsbuildinfo = path.join(root, 'tsconfig.tsbuildinfo');
  if (fs.existsSync(tsbuildinfo)) {
    fs.unlinkSync(tsbuildinfo);
    changes.push(`已删除缓存文件: tsconfig.tsbuildinfo (消除增量编译伪报错)`);
  }

  // 2. 规范化 package.json 中的 peerDependencies 与 scripts
  if (fs.existsSync(pkgPath)) {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    try {
      const pkg = JSON.parse(raw);
      let pkgModified = false;

      // 移除 prepare 脚本避免 pnpm 10 默认阻断
      if (pkg.scripts && pkg.scripts.prepare) {
        delete pkg.scripts.prepare;
        pkgModified = true;
        changes.push(`移除 package.json 中被 pnpm 10+ 拦截的 "prepare" 脚本 (建议改用 vendor lib/ 构建产物提交)`);
      }

      // 拓宽 peerDependencies 放行 prerelease
      if (pkg.peerDependencies) {
        for (const [k, v] of Object.entries(pkg.peerDependencies)) {
          if (k.startsWith('@deepseek-ai/')) {
            if (/^\^[0-9]+\.[0-9]+\.[0-9]+$/.test(v) || (v.includes('<') && !v.includes('-0') && !v.includes('rc') && !v.includes('alpha'))) {
              const safeRange = '>=0.1.0-0 <0.3.0';
              pkg.peerDependencies[k] = safeRange;
              pkgModified = true;
              changes.push(`调整 peerDependencies["${k}"]: "${v}" -> "${safeRange}" (允许 -rc / -alpha 宿主安装)`);
            }
          }
        }
      }

      if (pkgModified) {
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      }
    } catch (e) {
      changes.push(`package.json 解析失败: ${e.message}`);
    }
  }

  return {
    root,
    appliedChangesCount: changes.length,
    changes,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const targetDir = process.argv[2] || process.cwd();
  console.log(`\n=== DSH 插件自愈与规范化修复 (Auto-Fixer) ===`);
  console.log(`目标: ${path.resolve(targetDir)}`);

  const result = applyAutoFix(targetDir);
  if (result.appliedChangesCount > 0) {
    console.log(`\n成功执行 ${result.appliedChangesCount} 项自愈修复:`);
    for (const c of result.changes) {
      console.log(`  + ${c}`);
    }
  } else {
    console.log(`\n[完成] 未发现需要机械自动修复的项或配置已完全合规。`);
  }
  console.log();
}
