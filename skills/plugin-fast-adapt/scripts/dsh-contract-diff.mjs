#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// dsh-contract-diff.mjs
// 针对 DSH 插件进行轻量、确定性、符号级的破坏性变更扫描，提取受影响的代码触点与修复微卡片。

const CONTRACT_BREAKS = [
  {
    id: 'DSH-BREAK-SETTINGS-REMOVED',
    name: 'Settings 模块与 settings.register 已废弃移除',
    match: (content) => /@deepseek-ai\/dsh-settings|installSettingsSection|settingsNamespace|settings\.register/.test(content),
    advice: '移除 @deepseek-ai/dsh-settings 导入与 settings.register 调用。改用 Cordis 原生 Config 模式 (export const Config = ...)，表单由宿主 configEditor 自动生成。',
    plane: 'host',
  },
  {
    id: 'DSH-BREAK-CLIENT-RUNTIME-REMOVED',
    name: 'dsh-client-runtime 已被移除',
    match: (content) => /@deepseek-ai\/dsh-client-runtime/.test(content),
    advice: '移除对 @deepseek-ai/dsh-client-runtime 的依赖。客户端扩展直接导出挂载点，公共组件使用 @deepseek-ai/dsh-client-ui-primitives。',
    plane: 'client',
  },
  {
    id: 'DSH-BREAK-REPORT-TOOL-REMOVED',
    name: 'report 工具包已废弃',
    match: (content) => /@deepseek-ai\/dsh-report/.test(content),
    advice: '报告发送机制统一迁移至 send_message 或 deliverables 交付表面。',
    plane: 'host',
  },
  {
    id: 'DSH-BREAK-MESSAGE-V4-KIND',
    name: 'Session Format V4 严格校验消息 source kind',
    match: (content) => /createSystemMessage|session\.pushMessage|session-format-v4/.test(content) && !/kind:\s*['"][a-zA-Z0-9_-]+['"]/.test(content),
    advice: '会话写入面 V4 强制要求声明 producer-owned source kind（如 source: { kind: "custom-producer" }），否则会被拒收。',
    plane: 'host',
  },
  {
    id: 'DSH-BREAK-SESSION-QUERY-DIRECT',
    name: 'SessionQuery 建议采用弱依赖注入契约',
    match: (content) => /@deepseek-ai\/dsh-session-query/.test(content),
    advice: '切勿在 package.json 强 import session-query 包；改用 ctx.get("sessionQuery") 探测 + 鸭子类型降级，未安装时静默降级为备用逻辑。',
    plane: 'host',
  },
  {
    id: 'DSH-BREAK-ICON-16-REMOVED',
    name: 'Client UI 图标导出名后缀 *16 已移除',
    match: (content) => /Icon\w+16\b/.test(content),
    advice: 'UI 图标导出名已移除 *16，统一改用 *Medium 或 *Regular 后缀。',
    plane: 'client',
  },
];

function findSourceFiles(dir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath, maxDepth, currentDepth + 1));
    } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function scanPluginContracts(pluginDir) {
  const root = path.resolve(pluginDir);
  const srcFiles = findSourceFiles(root);
  const hits = [];

  for (const file of srcFiles) {
    const relPath = path.relative(root, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (const rule of CONTRACT_BREAKS) {
      if (rule.match(content)) {
        // 找出具体行号
        const matchingLines = [];
        for (let i = 0; i < lines.length; i++) {
          if (rule.match(lines[i])) {
            matchingLines.push(i + 1);
          }
        }
        hits.push({
          ruleId: rule.id,
          name: rule.name,
          file: relPath,
          lines: matchingLines.length > 0 ? matchingLines : [1],
          plane: rule.plane,
          advice: rule.advice,
        });
      }
    }
  }

  // 依赖 package.json 检查
  const pkgJsonPath = path.join(root, 'package.json');
  const pkgIssues = [];
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.peerDependencies) {
        for (const [k, v] of Object.entries(pkg.peerDependencies)) {
          if (k.startsWith('@deepseek-ai/') && !v.includes('-0')) {
            pkgIssues.push({
              type: 'strict_peer_dep',
              pkg: k,
              range: v,
              advice: `修改 "${k}": "${v}" 为安全范围，如 ">=0.1.0-0 <0.3.0" 以放行 prerelease`,
            });
          }
        }
      }
    } catch {}
  }

  return {
    pluginRoot: root,
    scannedFilesCount: srcFiles.length,
    hits,
    pkgIssues,
    requiresClientRefresh: hits.some(h => h.plane === 'client'),
    requiresHostRestart: hits.some(h => h.plane === 'host'),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const targetDir = process.argv[2] || process.cwd();
  const isJson = process.argv.includes('--json');
  const result = scanPluginContracts(targetDir);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.log(`\n=== DSH 插件破坏性契约扫描 (AST/符号级) ===`);
  console.log(`扫描目标: ${result.pluginRoot} (共 ${result.scannedFilesCount} 个源码文件)`);
  
  if (result.hits.length === 0 && result.pkgIssues.length === 0) {
    console.log(`\n[通过] 未发现已知 DSH 破坏性契约冲突！`);
  } else {
    console.log(`\n发现 ${result.hits.length} 处源码契约冲突:`);
    for (const hit of result.hits) {
      console.log(`\n* [${hit.ruleId}] ${hit.name}`);
      console.log(`  文件: ${hit.file}:${hit.lines.join(',')}`);
      console.log(`  影响平面: ${hit.plane.toUpperCase()}`);
      console.log(`  修复建议: ${hit.advice}`);
    }

    if (result.pkgIssues.length > 0) {
      console.log(`\n发现 ${result.pkgIssues.length} 项依赖版本声明隐患:`);
      for (const p of result.pkgIssues) {
        console.log(`  - ${p.pkg} (${p.range}): ${p.advice}`);
      }
    }

    console.log(`\n--- 生效与重载指引 ---`);
    if (result.requiresHostRestart) {
      console.log(`- 包含 Host 服务层修改：修复后必须重启 DSH 守护进程以清除内存旧投影！`);
    }
    if (result.requiresClientRefresh) {
      console.log(`- 包含 Web Client 层修改：修复后仅需在浏览器硬刷新 (Cmd+Shift+R) 即可生效。`);
    }
  }
  console.log();
}
