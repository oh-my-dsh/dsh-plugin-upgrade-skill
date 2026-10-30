# S4 · Legacy Client Runtime Touchpoints — 迁移触点报告（只读扫描）

- 任务：Web Client 插件源码（dsh 0.1.1-rc.2 时代静态副本）→ dsh 0.1.2-alpha.2 的迁移触点盘点
- 扫描对象：`fixture\`（4 个文件：README.md、package.json、src/client/index.ts、src/client/Pet.tsx），**逐字节未改动**（本报告全程只读 fixture）
- 版本走廊：`dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.1` → `dsh-v0.1.2-alpha.2`
  - 边 1：references/v0.1.2-alpha.1.md（from: dsh-v0.1.1-rc.2 / to: dsh-v0.1.2-alpha.1，28 卡，前缀 DSH-0.1.2-A1）
  - 边 2：references/v0.1.2-alpha.2.md（from: dsh-v0.1.2-alpha.1 / to: dsh-v0.1.2-alpha.2，8 卡，前缀 DSH-0.1.2-A2）
  - 走廊按 references/README.md 的 from→to 边连接（未按文件名字典序）；两条边均为 reviewed/curated，**无走廊缺口**
- 走廊净态提示：`SessionEvent.ignorable` 在 alpha.1 移除、alpha.2 恢复（A1-02 → A2-01 revert）；本 fixture 不产生持久化 SessionEvent，按最终态处理、不作删除-回加
- 扫描方法：① 七类触点正则扫描（pre-flight.md / pre-flight-patterns.json 口径）；② 技能自带只读 `plan-migration.mjs`（rc.2→alpha.2）；③ 只读 `inject-lint.mjs`（alpha.2 残留/peer 检查）；④ 人工逐行比对走廊卡片与 API 台账（api-migration-0.1.2-alpha.2.md）
- 证据纪律：每条断言标注卡片 ID + 文档要点出处；卡片/台账未覆盖的结论一律标注 **unconfirmed**，不臆造卡片

## 1. 清单（pre-flight 第 0 步）

| 项 | 观察 |
|---|---|
| 插件版本 / name | 0.1.0 / `dsh-pet-session-bench`（package.json:2-3，`private: true`） |
| 依赖 | **无 dependencies / peerDependencies / devDependencies**（package.json 全文仅 name/version/private/type/dsh 五个键） |
| 清单 / 组合 | `dsh.client` = `{ platform: "web" }`（package.json:6）；无 `dsh-plugin.json`、无 `cordis.patch.yml`、无 lockfile |
| 面 | 纯 Web Client 插件（客户端半），无 Host 侧源码、无子进程/HTTP/文件系统面 |
| 安装轨 | 静态副本，未声明（unconfirmed） |

## 2. 七类触点扫描总表（pre-flight 汇总模板）

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | 0 | — | （无） | 正则 0 命中；无 patch.yml / patchedDependencies / DSH_HARNESS_SOURCE_ROOT |
| #2 events | 0 | — | （无） | 无 SessionEvent / ctx.on / 持久化事件 |
| #3 services/Remote | 1 | src/client/index.ts:11 | DSH-0.1.2-A1-30 + DSH-0.1.2-A1-01（+DSH-0.1.2-A2-02） | 高；目标方法名以目标 tag 生成声明为准（unconfirmed 见 §5） |
| #4 filesystem | 0 | — | （无） | 无 DSH_HOME / readFile / openPath 等 |
| #5 UI/commands/tools | 4 | src/client/index.ts:1、:2/:12-13、:5/:10、:7 | DSH-0.1.2-A1-25 / DSH-0.1.2-A1-27 / DSH-0.1.2-A1-26 / DSH-0.1.2-A1-01 | 高（README:6 维护者提示与之互相印证） |
| #6 channel/DOM | 0 | — | （无） | 无自建 HTTP/WS/DOM 操纵（未命中 A1-28 的 textarea/contenteditable 面） |
| #7 subprocess/output | 0 | — | （无） | 无 child_process / headless 包装 |

特殊面：打包/依赖面命中 1（package.json:1-7，见 TP-6）。
工具佐证：`plan-migration.mjs` 扫描 3 个代码/配置文件，#5 命中 `src/client/index.ts:1`（pattern 2），其余 0；其给出的候选卡为启发式全量交集，已逐条人工收敛（见 §4 排除项）。`inject-lint.mjs` verdict = **FIX-REQUIRED**（`runtimeRefsLeft` 含 src/client/index.ts 的 dsh-client-runtime 引用；`cordisOk: false`，无 cordis peer）。

## 3. 触点明细（每条：文件:行 / 面 / 卡片 ID / 迁移动作）

### TP-1 · `@deepseek-ai/dsh-client-runtime/client` 类型导入（含 ClientContext）
- 文件/行：`src/client/index.ts:1`（并在 :9 的 `apply(ctx: ClientContext)` 签名上生效）
- 面：**Web Client**（插件客户端半）／plugin
- 卡片：**DSH-0.1.2-A1-25**（breaking / required-if-hit）；接口映射据 API-10 台账（api-migration-0.1.2-alpha.2.md）
- 会怎么炸：alpha.1 起 packages/client 已无该包 → 构建/类型缺失模块或缺失导出；运行时不进 boot graph / assembly 行永久 pending，常无显式报错
- 迁移动作：
  1. `ClientContext` → `import type { Context as ClientContext } from '@deepseek-ai/cordis'`；
  2. 按实际用到的面补 type-only 导入激活 Context 增强：`@deepseek-ai/dsh-api-session-controller/client`、`@deepseek-ai/dsh-client-ui-chat/client`；消费 `slots` 服务类型时按 precision-checklist 用 `import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'` 引入 renderer 拥有的 ctx.slots 声明（**仅类型导入，不构成运行时模块边**）；
  3. 全仓清残留：imports / type-only imports / re-exports / package.json / lockfile / 生成清单中不得再有 `dsh-client-runtime`（precision-checklist "Dead references"）；
  4. 对应 owning packages 进直接 dev/peer 依赖（并入 TP-6）。
- 验证：typecheck 无 dsh-client-runtime 残留；冷启动后 boot graph 含本插件且无 pending 行
- 来源：v0.1.2-alpha.1.md A1-25（符号迁移表 + `dsh.client.inject` 清理 + 依赖归属）；API-10 “Exact mapping / Type composition”（ClientContext → cordis Context + 按包增强）

### TP-2 · `useSession()` 扁平 `nodes` 快照与数组下标读取
- 文件/行：`src/client/index.ts:2`（`import { useSession } from '@deepseek-ai/dsh-client-ui-chat/client'`）、`:12-13`（`const { nodes } = useSession()` / `nodes[0]`）
- 面：**Web Client**（插件客户端半）／plugin
- 卡片：**DSH-0.1.2-A1-27**（breaking / required-if-hit；症状即 `nodes` undefined/空、控制台 factory 报错）；映射补充：API-10 台账（`useSession(session => session?.nodes)` → `useChat(chat => ...)`；`ConversationSnapshot.nodes[]` → `order` + `snapshot.nodes.get(id)` 的 keyed store）；上下文：DSH-0.1.2-A1-03（Session 视图内部分拆，其 field note 记录扁平 ConversationSnapshot 字段面退役）
- 会怎么炸：会话时间线不再以每会话 conversation-node 快照暴露；`nodes` 解构为空/undefined，`nodes[0]` 抛错或读不到内容，功能半残
- 迁移动作：
  1. 转写为 `ctx.useChat((chat) => …)`，按 `order` 顺序 + `chat.nodes.get(id)` 取节点（缺失 id 忽略）；读 assistant 终节点按判别式 `type === 'assistant-step'` → `data.finalNode`；
  2. 若确需用户消息/会话事件内容，走 A1-27 配方：`sessions.binding(id)` → `binding.eventSource.getSnapshot().entries`（`SessionEventLikeEntry` / `SessionBinding` 从 `@deepseek-ai/dsh-api-session-controller/client` 导入），用户文本在 `entry.event.data.content` 的 `{type:'text',text}` 块；
  3. 测试固定数据改用真实 `ChatNodeStore` 形状，禁止 `as unknown as ChatSnapshot` 掩盖旧数组；`snapshot.legacy.nodes` 仅限明确双宿主兼容，不作 alpha.2 主数据面。
- 来源：v0.1.2-alpha.1.md A1-27（迁移配方 + 来源链接）；API-10 “Exact mapping”（useChat/keyed 读取最小示例）；fixture README:6 维护者提示与该卡互相印证
- 备注（非走廊项）：`useSession` 在 `apply()` 内调用（非 React 渲染上下文）属既有结构问题，走廊卡片未覆盖 → **unconfirmed**，不在本次迁移动作内

### TP-3 · `__ModuleLoader__.load` 注册 id ≠ package.json name
- 文件/行：`src/client/index.ts:5`（`declare const __ModuleLoader__`）、`:10`（`__ModuleLoader__.load('pet-legacy-bundle', …)`）；对照基线 `package.json:2` 的 `"name": "dsh-pet-session-bench"`
- 面：**Web Client**（客户端模块扫描契约）／plugin（打包）
- 卡片：**DSH-0.1.2-A1-26**（breaking / required-if-hit）
- 会怎么炸：启动断言 `loaded without registering "<id>"`；或更隐蔽：面板静默消失、boot graph 无本插件、日志无报错
- 迁移动作（卡内三 id 一致，以 package.json `name` 为基线）：
  1. 客户端 bundle 注册 id == `dsh-pet-session-bench`（替换 `'pet-legacy-bundle'` 字面量；卡片指出通常由 tsdown banner `PLUGIN_ID` 注入）；
  2. assembly 行（本插件 cordis.patch.yml 或 home patch 的插入行）name 用带 scope 的裸包名，替换 0.1.1 的 `file:///` 字面路径 + 短 id 形式；
  3. `dsh --profile <name> --dump-config` 核对行名与无 pending。
- 验证：`window.__DSH_BOOT__.entries` 含 `"id":"dsh-pet-session-bench"`；combo 路由脚本内含以该包名注册的 `__ModuleLoader__.load`；启动日志无 `loaded without registering` / `entries did not activate`（A1-19 的验收链：boot entry + 资源 200 + 注册 + DOM 挂载，缺一不算通过）
- 来源：v0.1.2-alpha.1.md A1-26（三 id 契约 + 来源：modules/src/client/system.ts 注册断言、manifest.ts）
- unconfirmed：fixture 无 cordis.patch.yml 与构建配置 → 第 2 条 assembly 行、`PLUGIN_ID` banner 用法无法从本静态副本核实；`__ModuleLoader__.load` 在目标 tag 的确切调用形（A1-26 验证段示例为 `load({ id: … }` 对象形，与 fixture 的 `(id: string, fn)` 声明不同）需查目标 tag `packages/client/modules/src/client/system.ts`，本报告不臆造签名

### TP-4 · `ctx.connection.api.agentPresets.list()`（旧 APIProxy 镜像面）
- 文件/行：`src/client/index.ts:11`
- 面：**Web Client**（插件客户端半）／plugin
- 卡片：**DSH-0.1.2-A1-30**（breaking / required-if-hit：`ctx.connection.api` 面整体移除）＋ **DSH-0.1.2-A1-01**（APIProxy → `@Remote`：`agentPreset.list/select` → `agentPresets/list` / `agentPresets/select`）＋ **DSH-0.1.2-A2-02**（迁移后返回 `RemoteResult<T>`，失败码带 `<domain>/<reason>` 命名空间）
- 会怎么炸：alpha.1 起 `ctx.connection.api` 不存在，client 调用抛错；**若 catch 静默吞错则 UI 永久空白**（A1-30 明示该失败模式，仅"不崩"的 smoke 测不出）
- 迁移动作：
  1. 改为生成投影 `ctx.remote.agentPresets.list()`（具体方法名/参数以目标 tag 生成声明 `lib/typert.remote-client.d.ts` 为准，A1-01 明令不手写 relay/签名）；
  2. 返回值按 `result.ok` 分支、按 `result.error.code` 处理（如 `agent-preset/not-found`、`gateway/cancelled`），不解析 `message`、不用 `instanceof`、不防御性 catch 吞装配错误（A2-02 配方）—— 现有 `.then(presets => …)` 把信封当数据用，必须一并改写；
  3. 客户端不再消费后，从 inject 移除 `connection` 并删除类型镜像，不留死面（A1-30 配方）；
  4. 若业务确需预设列表/选择，同时核对 `agentPresets/list`、`agentPresets/select` 的返回语义（RemoteResult）。
- 验证：成功分支 + 一个业务失败码 + 取消分支；故意断路由时 UI 显示错误态而非空白（A1-30 Verification）
- 来源：v0.1.2-alpha.1.md A1-30、A1-01（迁移表 `agentPreset.list/select` 行 + "Calling plugins declare the needed Remote contributions in inject"）；v0.1.2-alpha.2.md A2-02；API-01 “Web Client consumer ledger”
- unconfirmed：`agentPresets.list()` 在目标 tag 的确切方法名/参数名（台账给 `agentPresets/list` 为线名，方法面以生成声明为准）

### TP-5 · `export const inject = ['slots', 'conversation']` 对目标面不完整
- 文件/行：`src/client/index.ts:7`（与 :11 的 Remote 调用联查）
- 面：**Web Client**（插件客户端半）／plugin
- 卡片：**DSH-0.1.2-A1-01**（Web Client 调用方须在 inject 声明所需 Remote 贡献）；联动 **DSH-0.1.2-A1-30**（`connection` 清理）
- 会怎么炸：迁移后的 `ctx.remote.*` 未声明对应注入 → 组装缺失/挂起或调用面不存在；反向地，遗留 `connection` 会等一个不再需要的服务
- 迁移动作：
  1. 迁移 Remote 调用后在 inject 中声明 `remote` 与实际使用的命名空间（如 `remote.agentPresets`；API-01 最佳实践第 3 条）；
  2. 保留/核对 `slots`、`conversation` 仍是目标 tag 所需服务键（见 §5 unconfirmed）；
  3. 不把仅类型导入推导成运行时 inject 边（inject-lint 契约：不从 imports 推导 inject）；`dsh.client.inject`（package 级）与 export const inject（服务级）分属两层，勿混写。
- 来源：v0.1.2-alpha.1.md A1-01 迁移配方末段；API-01 “Best practice / Minimal correct patterns”（示例 `export const inject = ['remote', 'remote.session']`）

### TP-6 · package.json 依赖/peer 缺失与队列 peer 地板（打包面）
- 文件/行：`package.json:1-7`（整份 manifest 无任何依赖声明）
- 面：**plugin**（packaging / 依赖图）
- 卡片：**DSH-0.1.2-A1-25**（owning packages 必须是直接 type/dev/peer 依赖）＋ **DSH-0.1.2-A2-03**（打包面：被消费的类型包需显式声明；skipLibCheck:true 会把选择器/回调静默变 `any`）；队列级要求引 **R-01**（rollup-0.1.2.md，目标队列依赖未全量上 npm 时的 link:/overrides 路径）与 precision-checklist
- 会怎么炸：typecheck 漏报 → `useChat` 选择器/回调隐式 any（A2-03 field note 实证）；inject-lint `cordisOk: false`；peer ⊄ inject 会在安装/启动期暴露
- 迁移动作（迁移时执行，本次只读不实施）：
  1. 按实际消费面补 peer/devDeps：至少 `@deepseek-ai/cordis`（peer 恰好 `^4.0.1`，非 `^4.0.2`）、`@deepseek-ai/dsh-client-ui-chat`、`@deepseek-ai/dsh-api-session-controller`，消费 slots 类型再加 `@deepseek-ai/dsh-client-ui-renderer`；peer ⊇ inject，**含仅类型依赖**；
  2. 无裸 `cordis` 键、无 `-rc` 后缀、`@deepseek-ai/dsh-*` peer 地板落在目标队列（`^0.1.2-alpha.1` 及以上同队列）；
  3. 迁移后跑一次 `tsc --skipLibCheck false` 定位缺失声明链，再恢复仓库既有策略；新引入的隐式 `any` 视为迁移失败；
  4. 队列未全量发布时按 R-01 处理安装面。
- 来源：v0.1.2-alpha.1.md A1-25（`package.json` 清理段）、v0.1.2-alpha.2.md A2-03；references/precision-checklist.md（Peer version floors / Peers are a superset of inject）；inject-lint 运行结果
- unconfirmed：fixture 无 lockfile → 仓库实际包管理器/安装轨未知，"单一包管理器"约束待补

## 4. 非命中 / 排除项（附证据）

| 项 | 结论 | 证据 |
|---|---|---|
| A1-25 的 `dsh.client.inject` 清理 | 非命中 | package.json:6 仅有 `platform: "web"`，无 inject 行可删 |
| DSH-0.1.2-A1-28（composer textarea→contenteditable） | 非命中 | 全文无 textarea/setSelectionRange/data-input-scroll |
| DSH-0.1.2-A1-29（MarkdownText labels 嵌套） | 非命中 | 未引用 MarkdownText / ui-primitives |
| DSH-0.1.2-A1-32（IWorkspaces 导航→ctx.uiWorkspace） | 非命中 | 无 workspaces.* / connectWorkspace / pickDirectory |
| DSH-0.1.2-A1-02 / A2-01（ignorable） | 非命中 | 无 SessionEvent 产生/持久化面；且目标为 alpha.2，走廊净态为"已恢复" |
| DSH-0.1.2-A2-05 / A2-06 / A2-08 / A2-10 | 非命中 | 无 pluginInventory / $host / sessionProjections / settings 命名空间消费 |
| DSH-0.1.2-A1-06（Code→PTC）等 #2/#7 类卡 | 非命中 | 七类扫描 0 命中 |
| plan-migration 启发式候选 A1-06/09/10/11/24/28/29/32、A2-05 | 排除 | 逐条核对 fixture 无对应 API/配置使用；其列表为"卡片∩触点类"的保守超集，非命中判定 |
| `src/client/Pet.tsx` | 无走廊触点 | 1 行 `export function Pet() {}`；返回 undefined 属既有质量问题，非版本碰撞（卡片未覆盖 → 不列为触点） |
| README.md / fixture README:6 提示 | 参照 | README 属测试材料说明；其 4 个提示卡与 TP-1~TP-4 一致，另两张（A1-01/A2-02/A2-03）为本报告据卡片正文补充的关联面 |

## 5. Unconfirmed 清单（不臆造，逐条待目标 tag 核实）

1. `__ModuleLoader__.load` 在 0.1.2-alpha.2 的确切调用签名/形参形态（A1-26 验证段示例为 `load({ id: … }`；fixture 声明为 `(id: string, fn: () => void)`）→ 查目标 tag `packages/client/modules/src/client/system.ts`。
2. `agentPresets.list()` 迁移后的精确方法名/参数（线名 `agentPresets/list` 有卡据；方法面以生成声明 `lib/typert.remote-client.d.ts` 为准）。
3. `slots` / `conversation` 服务键与 `useChat` 面在目标 tag 是否还需额外 inject 项（卡片未逐键列清单）。
4. assembly 行（A1-26 第 2 条）与 tsdown banner `PLUGIN_ID` 的实际构建接线 —— fixture 无 cordis.patch.yml/构建配置。
5. package.json `dsh.client.platform: "web"` 键在 0.1.2-alpha.2 的合法性 —— 走廊卡片未断言其破坏，按"无卡不臆造"处理。
6. `useSession` 在目标 tag 是导出被删还是签名变更 —— A1-27/API-10 给行为与映射，未钉死导出清单。
7. 仓库安装轨/包管理器（无 lockfile）。

## 6. 验证计划（本任务为只读，未执行；实施迁移后按此验收）

1. 静态：`tsc --skipLibCheck false` 无缺失声明/隐式 any；全仓无 `dsh-client-runtime` 残留；inject-lint verdict → OK；
2. 依赖：锁文件无旧队列/被移除包；peer 地板符合 precision-checklist（cordis `^4.0.1` 等）；
3. 组装：`dsh --profile <p> --dump-config` 无 pending；boot graph 含 `dsh-pet-session-bench`；
4. Web 链（A1-19 验收）：token URL → Cookie → `window.__DSH_BOOT__.entries` 按 package name 命中 → 请求宿主advertised 资源 → `__ModuleLoader__.load` 注册 + DOM 挂载 + 页面无错误；
5. 行为：一条会话读取路径（useChat keyed 读取 / A1-27 事件窗）与一条 `ctx.remote.agentPresets` 调用（成功 + 业务失败 + 取消）；断路由时显示错误态而非空白（A1-30）；
6. 打包：tarball 名与清单版本一致（插件自身版本 0.1.x，勿误用宿主版本）。

## 7. Baseline / Rollback

- pre-existing 失败清单：**not collected**（只读任务，按题面禁止构建复现环境/安装依赖/跑包脚本）；
- 回滚：不适用 —— fixture 未做任何修改（只读纪律保持）；本报告与两份 transcript 为唯一写入物，位于 `agent-output/\`。

## 8. 摘要表

| Hit location | Old interface | Typical symptom | Target interface | Card(s) | Required change |
|---|---|---|---|---|---|
| src/client/index.ts:1,9 | `@deepseek-ai/dsh-client-runtime/client` ClientContext | 缺失模块/导出；boot graph 缺行 | `@deepseek-ai/cordis` Context + 按包 type-only 增强 | DSH-0.1.2-A1-25 | 必改 |
| src/client/index.ts:2,12-13 | `useSession()` 扁平 `nodes` | nodes undefined、功能半残 | `ctx.useChat` + `order`/`nodes.get(id)`（或 A1-27 事件窗） | DSH-0.1.2-A1-27（+API-10；A1-03 上下文） | 必改 |
| src/client/index.ts:5,10 | `__ModuleLoader__.load('pet-legacy-bundle', …)` | registered-without-id 断言/面板静默消失 | 注册 id == `dsh-pet-session-bench` | DSH-0.1.2-A1-26 | 必改 |
| src/client/index.ts:11 | `ctx.connection.api.agentPresets.list()` | 面不存在抛错/吞错后永久空白 | `ctx.remote.agentPresets.list()`（RemoteResult） | DSH-0.1.2-A1-30 + DSH-0.1.2-A1-01 + DSH-0.1.2-A2-02 | 必改 |
| src/client/index.ts:7 | `inject = ['slots','conversation']` | Remote 面未声明 → 挂起/缺失 | 声明 `remote`+命名空间；清 `connection` | DSH-0.1.2-A1-01（联动 A1-30） | 必改 |
| package.json:1-7 | 无依赖声明 | 隐式 any、类型链缺失、peer 不全 | 按消费面补 peer/devDeps（cordis ^4.0.1 等） | DSH-0.1.2-A1-25 + DSH-0.1.2-A2-03（+R-01） | 必改 |

## run-stats

- toolcalls 总数：顶层 run_code 19 次；嵌套工具调用 35 次（read 15、grep 10、glob 2、pwsh 3、write 3、working_directory 1、send_message 1）
- token 用量：n/a（本会话不可见）
- 完成时间：2026-10-21T06:11:36.050Z  /  2026/10/21 14:11:36
