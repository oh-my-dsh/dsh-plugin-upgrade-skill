# 触点体检（dsh-minimal-llm，dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2）

扫描范围：`/app/fixture/` 全部文件（package.json、
index.js、cordis.patch.yml、src/session-notes.js），只读，未修改任何文件。

| 触点 | 命中 | 文件/行 | 适用卡 | 说明 |
|---|---|---|---|---|
| #1 patch | ❌ | — | — | 无 patch 文件/声明 |
| #2 事件 | ❌ | — | — | 无 SessionEvent/ctx.on |
| #3 服务/Remote | ✅ | index.js:3、8 | DSH-0.1.2-A1-01 | `inject: ["apiProxy"]` + `ctx.apiProxy.llm.providers()`；apiProxy 已在 alpha.1 整体移除，必须迁移（宿主平面注入 `llm` 用 `ctx.llm.listProviders()`；客户端平面才走 `ctx.remote.*`） |
| #4 宿主文件系统 | ❌ | — | — | 无 homedir/.dsh 读写 |
| #5 UI/命令/工具 | ❌ | — | — | 无 registerCommand/contributes |
| #6 自建通道 | ❌ | — | — | 无 createServer/WebSocket |
| #7 子进程/输出 | ❌ | — | — | 无 spawn/stdout 解析 |

`src/session-notes.js` 零命中：纯字符串/数组工具函数，文件名里的 "session" 只是
历史命名，不构成宿主耦合。

## 结论：零命中 ≠ 兼容

- 唯一命中的 #3 就是决定性破坏点（DSH-0.1.2-A1-01）：不迁移的话插件在 0.1.2 上
  会 `pending (waiting for service: apiProxy)` 直接起不来。
- 其余六类零命中**只表示“当前模式没发现”**，不证明没有宿主耦合：本次扫描没有覆盖
  依赖图解析（package.json 还依赖着已随 alpha.1 删除的 `@deepseek-ai/dsh-host-apiproxy`），
  也不能替代真实运行。
- 必须验证：迁移后删除死依赖、build/typecheck、在 0.1.2-alpha.2 隔离 profile 真实
  冷启动确认无 pending，并跑通一次 `llm.listProviders()` 调用。
