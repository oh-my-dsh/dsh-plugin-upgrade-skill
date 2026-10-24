# plugin-fast-adapt

[English](README.en.md) | 简体中文

**plugin-fast-adapt** 是针对 DeepSeek Harness（DSH）生态的高性能快速插件适配与破坏性更新自愈衍生套件。

## 为什么需要 fast-adapt？

在传统的 `plugin-upgrade` 实践与基准测试（如 Harbor S/M/H 考题）中，存在三大系统性问题：
1. **人工卡片维护地狱**：面对上游动辄数千 commit 的跃迁（如 `0.2.0-rc.2 → 0.2.1-alpha.5`，8000+ 文件变动），卡片更新严重滞后，极易触发 `unsupported corridor gap`；
2. **上下文过载引发弱模型负迁移**：向 Agent 注入成千上万字的历史卡片散文，不仅消耗大量 token，更使弱模型（DeepSeek V4 Flash、Qwen 27B 等）产生信息竞争、超时频发并在基准中出现净退化；
3. **环境脏状态与重型启动超时**：Issue #263 揭示的覆盖层旧包毒化无法通过读代码解决；Issue #171 揭示的串行宿主冷启超过 3600 秒超时。

**fast-adapt 方案的核心取向**：
- **CLI 确定性收集**：环境体检、激活诊断与 AST 符号扫描由本地 Node 脚本毫秒级搞定，仅输出命中微卡片；
- **微上下文预算**：首轮上下文消耗压至 1000 tokens 内，模型聚焦做「精准代码手术」；
- **纯内存沙箱秒级冒烟**：使用 MockContext 在 15ms 内完成动态模块载入、依赖注入与工具注册校验。
- **工业级自举审计**：按 MECE 原则四维度（性能内存、契约弹性、上下文常驻、生命周期）深度体检插件质量。

## 核心脚本工具箱

| 脚本 | 职责与安全姿态 | 耗时 |
|---|---|---|
| `scripts/dsh-hygiene-doctor.mjs` | **环境卫生门禁（只读）**：巡检 `~/.dsh/profiles/` 覆盖层残留旧包（防 issue #263 消息写面拒收）、探测运行中的 DSH 幽灵进程、检查 `tsbuildinfo` 污染与 `prepare` 脚本陷阱。 | < 50ms |
| `scripts/dsh-env-healer.mjs` | **环境自愈与旧包隔离（写操作）**：自动将覆盖层滞后/废弃旧包安全移至 `~/.dsh/.trash/` 回收站，清理陈旧会话快照与锁文件。 | < 30ms |
| `scripts/dsh-activation-doctor.mjs` | **插件启用专项诊断（只读）**：检查 `inject` 依赖是否在目标 profile 中真正可用（防 Cordis 静默 pending 挂起）、检查 `cordis.patch.yml` 挂载状态与构建产物。 | < 40ms |
| `scripts/dsh-contract-diff.mjs` | **AST 符号契约扫描（只读）**：基于语法树精准定位废弃的 `@deepseek-ai/dsh-settings`、`client-runtime`、Message v4 格式等触点，输出修复微卡片与双平面重载指示。 | < 80ms |
| `scripts/auto-fixer.mjs` | **机械性自愈修复器（写操作）**：自动规范 `package.json` 中的 `peerDependencies`（放行 prerelease）、剥离易受拦截的 `prepare` 脚本、清空构建缓存。 | < 20ms |
| `scripts/quick-smoke.mjs` | **内存沙箱秒级冒烟（只执行目标插件 apply）**：模拟 Cordis/DSH 核心上下文环境，快速断言插件载入、`apply()` 执行与 10+ 工具注册。 | 2~20ms |
| `scripts/dsh-plugin-auditor.mjs` | **深度质量与性能审计器（只读）**：按 MECE 原则四维度全量评估插件内存安全、契约弹性、上下文预算与生命周期清理并打分。 | < 60ms |

## 使用工作流

```sh
# 1. 环境卫生体检与旧包自愈
npm run doctor
npm run env:heal

# 2. 插件启用就绪度排查
node skills/plugin-fast-adapt/scripts/dsh-activation-doctor.mjs /path/to/plugin web

# 3. 扫描破坏性契约触点并自愈
node skills/plugin-fast-adapt/scripts/dsh-contract-diff.mjs /path/to/plugin
node skills/plugin-fast-adapt/scripts/auto-fixer.mjs /path/to/plugin

# 4. 构建与极速沙箱冒烟断言
cd /path/to/plugin && pnpm run clean && pnpm run build
node skills/plugin-fast-adapt/scripts/quick-smoke.mjs /path/to/plugin

# 5. 深度质量与自举审计
node skills/plugin-fast-adapt/scripts/dsh-plugin-auditor.mjs /path/to/plugin
```

## 测试与自检

```sh
npm run test:fast-adapt
```
