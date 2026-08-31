# 触点体检（legacy-plugin，dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2）

扫描范围：`benchmark/tasks/S1-static-scan/fixture/` 全部文件（排除 README，无
node_modules/vendor 可排除）。本报告为只读扫描产物，未修改任何 fixture 文件。

| 触点 | 命中 | 文件/行 | 适用卡 | 说明 |
|---|---|---|---|---|
| #1 patch | ✅ | patch.yml:1；cordis.patch.yml:2；scripts/apply-patch.mjs | DSH-0.1.2-A1-03 | 对宿主会话视图工程做源码 patch，alpha.1 会话视图工程大幅拆分，patch 目标路径会失效 |
| #2 事件 | ✅ | src/index.ts:15-22 | DSH-0.1.2-A1-02 + DSH-0.1.2-A2-01 | producer 写第三方持久事件并带 `ignorable: true`。走廊折叠：A1-02 在 alpha.1 移除该 marker，A2-01 在 alpha.2 恢复保留语义——目标是 alpha.2，净状态 = **保留 producer 与 marker**，不要先删再恢复 |
| #3 服务/Remote | ✅ | src/index.ts:25-32 | DSH-0.1.2-A1-01 | `ctx.get('apiProxy')` 调 `session.rename` 与 `llm.providers`；apiProxy 在 alpha.1 整体移除，宿主平面消费者改注入领域服务（`llm` → `ctx.llm.listProviders()`），客户端平面才走 `ctx.remote.*` |
| #4 宿主文件系统 | ✅ | src/index.ts:35-38 | DSH-0.1.2-A1-04 | 硬编码 `~/.dsh/profiles/default`，alpha.1 起 profile 布局以 `$DSH_HOME/profiles` 与运行时为准 |
| #5 UI/命令/工具 | ✅ | src/index.ts:10、41-43 | DSH-0.1.2-A1-03 | 从会话视图内部路径 import `SessionView` + `contributes.registerCommand`，随会话视图拆分失效，应迁公开 facet |
| #6 自建通道 | ✅ | src/index.ts:47-54 | DSH-0.1.2-A1-08 | loopback HTTP `127.0.0.1:43121/api/legacy` 绕过 Host Gateway 认证模型；alpha.1 起 Web/API 通道用 bootstrap token + 签名 Cookie，自建 route 必须接入 connection auth gate |
| #7 子进程/输出 | ✅ | src/index.ts:57-67；scripts/apply-patch.mjs | DSH-0.1.2-A1-04、DSH-0.1.2-A1-05 | spawn `dsh --profile headless` 并把 stdout 当 JSONL `JSON.parse`——rc.2 起 stdout 就是最终文本，从来不是 JSONL；对 stdout 默认 JSON.parse 是错误假设。另按 A1-04 核对 headless profile 布局 |

未命中说明：七类全部命中，无未命中类。但仍需注意：本次扫描只覆盖静态正则/阅读能
发现的耦合，不证明依赖图与配置面无其他风险——迁移前仍须检查 package.json 依赖与
profile composition，并在目标版本真实挂载验证。

必须验证：build/typecheck、隔离 profile 真实冷启动（无 `pending (waiting for service: ...)`）、
至少一条核心功能路径。
