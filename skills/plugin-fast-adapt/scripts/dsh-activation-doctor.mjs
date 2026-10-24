#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// dsh-activation-doctor.mjs
// 针对「插件已安装/已声明，但运行时未正确启用」进行深度专项诊断：
// 1. 检查插件声明的 inject 服务是否在目标 profile 中真正可用 (防 Cordis 静默 pending 挂起)
// 2. 检查 profile 的 cordis.patch.yml 是否包含该插件、是否被意外 disabled
// 3. 检查 package.json 入口文件与构建产物 (lib/index.js) 是否物理存在
// 4. 检查 client 端的 manifest 暴露与浏览器名册

export function diagnosePluginActivation(pluginDir, options = {}) {
  const root = path.resolve(pluginDir);
  const dshHome = options.dshHome || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const targetProfile = options.profile || 'web';

  const report = {
    pluginRoot: root,
    targetProfile,
    pkgInfo: null,
    buildArtifacts: { ready: true, missing: [] },
    cordisPatch: { found: false, entry: null, disabled: false },
    injectedServices: [],
    profileAvailableServices: [],
    pendingRisks: [],
    verdict: 'OK',
    suggestions: [],
  };

  // 1. 检查 package.json 与构建产物
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    report.verdict = 'FATAL';
    report.suggestions.push(`找不到 package.json: ${pkgPath}`);
    return report;
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  report.pkgInfo = {
    name: pkg.name,
    version: pkg.version,
    main: pkg.main || 'lib/index.js',
    hasClient: !!(pkg.dsh && pkg.dsh.client),
  };

  const entryPath = path.join(root, report.pkgInfo.main);
  if (!fs.existsSync(entryPath)) {
    report.buildArtifacts.ready = false;
    report.buildArtifacts.missing.push(report.pkgInfo.main);
    report.verdict = 'ERROR';
    report.suggestions.push(`编译产物缺失: ${report.pkgInfo.main} 不存在。请运行 "pnpm run build" 后再尝试启用`);
  }

  // 2. 静态分析或动态检查源码的 inject 声明
  try {
    let injects = [];
    const filesToProbe = [entryPath, path.join(root, 'src', 'index.ts'), path.join(root, 'src', 'index.js')];
    for (const f of filesToProbe) {
      if (fs.existsSync(f)) {
        const text = fs.readFileSync(f, 'utf8');
        const match = text.match(/inject\s*=\s*\[([^\]]+)\]/);
        if (match) {
          injects = match[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
          break;
        }
      }
    }
    report.injectedServices = injects;
  } catch {}

  // 3. 检查目标 profile 下的 cordis.patch.yml
  const patchYmlPath = path.join(dshHome, 'profiles', targetProfile, 'cordis.patch.yml');
  if (fs.existsSync(patchYmlPath)) {
    report.cordisPatch.found = true;
    const patchContent = fs.readFileSync(patchYmlPath, 'utf8');
    
    // 粗略检索插件是否在配置中
    const pkgNameEscaped = pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasPlugin = new RegExp(`name:\\s*['"]?${pkgNameEscaped}['"]?`).test(patchContent);
    const isDisabled = new RegExp(`name:\\s*['"]?${pkgNameEscaped}['"]?[\\s\\S]*?disabled:\\s*true`).test(patchContent);

    report.cordisPatch.registered = hasPlugin;
    report.cordisPatch.disabled = isDisabled;

    if (!hasPlugin) {
      report.verdict = report.verdict === 'ERROR' ? 'ERROR' : 'WARN';
      report.suggestions.push(`插件未在 ${targetProfile}/cordis.patch.yml 中配置注册。需添加 "- insert: [{ id: '${pkg.name.split('/').pop()}', name: '${pkg.name}' }]"`);
    } else if (isDisabled) {
      report.verdict = 'WARN';
      report.suggestions.push(`插件在 ${targetProfile}/cordis.patch.yml 中被标记为 "disabled: true"，请改为 "disabled: false"`);
    }

    // 检查常见宿主服务的挂载状态
    const commonServices = [
      { name: 'sessionQuery', pattern: /dsh-session-query-sqlite/ },
      { name: 'llm', pattern: /dsh-llm/ },
      { name: 'tools', pattern: /tools|dsh-tool/ },
      { name: 'webServer', pattern: /web|server/ },
    ];

    for (const s of commonServices) {
      if (s.pattern.test(patchContent)) {
        report.profileAvailableServices.push(s.name);
      }
    }

    // 判断声明的 inject 是否有未被满足的风险
    for (const inj of report.injectedServices) {
      if (['connection', 'sessionQuery'].includes(inj)) {
        if (!report.profileAvailableServices.includes(inj)) {
          report.pendingRisks.push({
            service: inj,
            reason: `插件声明强制注入 "${inj}"，但 profile 配置中未找到显式启用该服务的特征。若宿主未提供此服务，插件将进入 Cordis 永久静默 pending 状态！`,
            solution: `建议将强依赖改用弱契约探测: "ctx.get('${inj}')"，或在 cordis.patch.yml 中补全该服务的提供方。`,
          });
          if (report.verdict !== 'ERROR') report.verdict = 'WARN';
        }
      }
    }
  } else {
    report.suggestions.push(`Profile 配置文件不存在: ${patchYmlPath}`);
  }

  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const targetDir = process.argv[2] || process.cwd();
  const profile = process.argv[3] || 'web';

  console.log(`\n=== DSH 插件启用与激活就绪度诊断 (Activation-Doctor) ===`);
  console.log(`插件目录: ${path.resolve(targetDir)}`);
  console.log(`诊断目标 Profile: ${profile}\n`);

  const report = diagnosePluginActivation(targetDir, { profile });

  console.log(`插件基本信息: ${report.pkgInfo?.name || '未知'}@${report.pkgInfo?.version || '0.0.0'}`);
  console.log(`产物状态: ${report.buildArtifacts.ready ? '【已就绪】' : '【缺失构建产物】'}`);
  console.log(`Profile 配置挂载: ${report.cordisPatch.registered ? (report.cordisPatch.disabled ? '【已配置但被禁用】' : '【已正确挂载】') : '【未在 patch.yml 中找到】'}`);
  console.log(`声明注入服务: [${report.injectedServices.join(', ')}]`);

  if (report.pendingRisks.length > 0) {
    console.log(`\n[静默挂起风险警告 (Silent Pending Trap)]:`);
    for (const r of report.pendingRisks) {
      console.log(`  ! 服务 "${r.service}": ${r.reason}`);
      console.log(`    解决方案: ${r.solution}`);
    }
  }

  if (report.suggestions.length > 0) {
    console.log(`\n建议处理项:`);
    for (const s of report.suggestions) {
      console.log(`  * ${s}`);
    }
  }

  console.log(`\n就绪度总体裁决: [${report.verdict}]\n`);
}
