# S4 迁移触点报告（dsh-pet-session-bench，dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2）

审计对象：`/app/fixture/` 全部文件（package.json、src/client/index.ts、
src/client/Pet.tsx）。本报告为只读分析产物，未修改任何 fixture 文件。

结论：共 **4 个失效触点**，全部为硬破坏或静默失效；Pet.tsx 无触点。

| # | 文件/行 | 失效内容 | 影响面 | 升级卡 |
|---|---|---|---|---|
| 1 | src/client/index.ts:1 | `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'`——该包在 0.1.2 已整体拆除，类型面与运行时入口同时消失 | Web Client / plugin | DSH-0.1.2-A1-25 |
| 2 | src/client/index.ts:5、10 | `__ModuleLoader__.load('pet-legacy-bundle', …)` 注册 id ≠ package.json 的 name（`dsh-pet-session-bench`）——违反 client-modules 扫描契约，boot 会报「loaded without registering」 | Web Client | DSH-0.1.2-A1-26 |
| 3 | src/client/index.ts:12-13 | `useSession()` 平铺 `nodes` 快照已移除，会话内容读取改走 SessionBinding durable 事件窗 | Web Client | DSH-0.1.2-A1-27 |
| 4 | src/client/index.ts:11 | `ctx.connection.api.agentPresets.list()`——客户端 connection.api face 在 alpha.1 整体移除，历史/转录读取改道 | Web Client / plugin | DSH-0.1.2-A1-30 |

迁移动作（按 seam 分组）：

- A1-25：改从目标版本实际 owning 包导入 Context 类型（type-only augmentation），
  不向已删除包回退；
- A1-26：注册 id 与 `package.json` 的 `name` 对齐，并用 alpha.2 的 boot 名册验收；
- A1-27：会话内容经 durable 事件窗/公开 selector 读取，按 alpha.2 快照顺序保序；
- A1-30：改走 alpha.2 的 Remote/公开访问面，未知键名标「待确认」后按目标 tag 类型核对。

未命中说明：fixture 只有 3 个文件、无 node_modules/vendor；扫描覆盖全部受跟踪
文件，但不证明依赖图与配置面无其他风险——迁移前仍需检查依赖与 profile
composition，并在 alpha.2 真实挂载验证。

必须验证：typecheck、隔离 profile 冷启动（无 pending）、boot 名册包含本插件
entry、一条消息→工具→回复路径。
