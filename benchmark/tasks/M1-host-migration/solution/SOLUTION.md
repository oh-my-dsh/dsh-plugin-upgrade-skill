# M1 参考解法

## 参考改动

见 [solution/plugin/](plugin/)（逐字复制自容器 `/tmp/demo-plugin-v2-migrated`，
已在 2026-08-30 容器验证中实测激活成功），期望 judge 得分 100：

1. `index.js`：`inject: ["apiProxy"]` → `inject: ["llm"]`；
   `await ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`；
2. `package.json`：删除死依赖 `@deepseek-ai/dsh-host-apiproxy`（随 alpha.1 移除）。

## 考点（一句话）

DSH-0.1.2-A1-01 的**宿主平面**迁法：apiProxy 是宿主平面网关门面，被移除后
宿主平面消费者直接注入背后的领域服务（`llm` → `ctx.llm.listProviders()`），
不是换成 `remote`。验证时无 API key → 路由数 0 是预期，调用走通即可激活得分。

## 边界

- judge 用 headless profile 冷启动判定：无 key 时 MISSING_CREDENTIAL 输出即
  证明插件树已激活；这与验证报告的归因原则一致（配置问题不算插件故障）。
- agent 若把宿主平面误迁到 `inject: ["remote"]`，会落在 40 分档
  （`pending (waiting for service: remote)`）——该形态是 H1 的考点，M1 只要求
  最终激活。
