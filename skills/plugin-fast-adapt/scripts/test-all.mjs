#!/usr/bin/env node
import assert from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import { runDoctor } from './dsh-hygiene-doctor.mjs';
import { scanPluginContracts } from './dsh-contract-diff.mjs';
import { runQuickSmoke } from './quick-smoke.mjs';
import { diagnosePluginActivation } from './dsh-activation-doctor.mjs';
import { auditPluginQuality } from './dsh-plugin-auditor.mjs';
import { healEnvironment } from './dsh-env-healer.mjs';

async function main() {
  console.log('--- 运行 plugin-fast-adapt 工业级自举测试套件 ---');

  const repoRoot = path.resolve(import.meta.dirname, '../../..');
  const sessionDiggerPath = path.join(os.homedir(), 'Documents', 'GPT', 'session-digger', 'dsh-plugin');

  // 1. Doctor 体检自检
  const doctorReport = runDoctor({ targetDir: repoRoot });
  assert.ok(doctorReport.timestamp, 'Doctor 应产出时间戳');
  assert.ok(Array.isArray(doctorReport.overlayIssues), 'Doctor 应包含 overlayIssues 数组');
  console.log('✓ dsh-hygiene-doctor 自检通过');

  // 2. Env Healer 环境自愈自检 (Dry-run)
  const healResult = healEnvironment({ targetDir: repoRoot, healOverlays: false, killGhosts: false, cleanSnapshots: false });
  assert.ok(healResult.postHealReport, 'Healer 应输出后验报告');
  console.log('✓ dsh-env-healer 自检通过');

  // 3. Contract Diff 契约扫描自检
  const diffResult = scanPluginContracts(repoRoot);
  assert.ok(typeof diffResult.scannedFilesCount === 'number', 'Contract diff 应统计文件数');
  assert.ok(Array.isArray(diffResult.hits), 'Contract diff 应产出 hits 数组');
  console.log('✓ dsh-contract-diff 自检通过');

  // 4. Activation Doctor 激活诊断自检
  const activationReport = diagnosePluginActivation(sessionDiggerPath, { profile: 'web' });
  assert.ok(activationReport.verdict, 'Activation 应产出判决');
  console.log('✓ dsh-activation-doctor 自检通过');

  // 5. Plugin Auditor 质量深度审计自检
  const auditReport = auditPluginQuality(repoRoot);
  assert.ok(auditReport.overallScore >= 0 && auditReport.overallScore <= 100, 'Auditor 总分应在 0-100');
  console.log(`✓ dsh-plugin-auditor 自检通过 (评分: ${auditReport.overallScore}/100)`);

  // 6. Quick Smoke 内存沙箱冒烟自检
  const smokeResult = await runQuickSmoke(sessionDiggerPath);
  assert.strictEqual(smokeResult.success, true, 'session-digger 插件沙箱冒烟必须通过');
  assert.strictEqual(smokeResult.registeredToolsCount, 3, '应当成功注册 3 个原生工具');
  assert.ok(smokeResult.durationMs < 100, '冒烟必须在 100ms 内完成');
  console.log(`✓ quick-smoke 毫秒级沙箱自检通过 (${smokeResult.durationMs}ms)`);

  console.log('\n[PASS] 所有 fast-adapt 工业级自举测试全部通过！');
}

main().catch((err) => {
  console.error('[FAIL] 测试失败:', err);
  process.exit(1);
});
