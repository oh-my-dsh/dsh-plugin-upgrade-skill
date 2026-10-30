# JUDGE BRIEF · skill.S1-static-scan

## Criteria (sealed rubric)
- [source-patch] (10pt) Locate the source patch declaration/target and script, distinguish source patching from ordinary composition, and explain the private session-view coupling.
- [events] (10pt) Locate the informational event producer/consumer and ignorable:true. Explain alpha.1 removal and alpha.2 restoration: preserve omission-safe informational markers, not a whitelist for required events. Do not claim arbitrary Session.append supports writing the marker.
- [host-services] (10pt) Locate apiProxy usage and its removal. Distinguish Host domain-service injection (llm/listProviders) from Web Client Remote; do not prescribe a nonexistent Host remote service.
- [host-path] (10pt) Locate the fixed homedir/.dsh/profiles/default path and explain using runtime DSH_HOME/profile information. Do not claim --profile was introduced in alpha.1.
- [ui] (10pt) Locate both the private SessionView import and command registration and explain public owner/seam verification after the split.
- [channel] (10pt) Locate the private loopback HTTP server. Explain that loopback does not bypass auth requirements and distinguish host-managed authenticated channels from raw routes.
- [subprocess] (10pt) Locate dsh subprocess calls and stdout JSON.parse. Explain stdout final text vs stderr progress, and that the JSONL assumption was already wrong, rather than inventing an alpha.2 stdout change.
- [mapping] (20pt) Map actual located couplings to A1-01, A1-02+A2-01, A1-03, A1-04, A1-08; A1-05 is a valid additional stdout mapping. A bare card list earns zero. Award half only when the mappings are substantively correct but incomplete.
- [limits] (10pt) Account for all seven hit categories (there are no no-hit categories here), state the scan limits, and propose target-version build/typecheck, isolated boot and a functional path. Never require actually executing this static fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S1-static-scan/report.md

# S1 · 静态触点扫描报告（Read-Only）· legacy-plugin fixture

- 任务模式：plugin-upgrade · Mode A（inspect，只读）；目标为静态拷贝，不执行、不迁移、不安装
- 扫描对象：<格目录>\fixture\（6 个文件，全部逐行读完；fixture 保持逐字节不变）
- 版本走廊（from → to）：dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2
  （按卡片文件 front-matter 的 from→to 元数据连接两条边，非文件名字典序）
- 卡片集合：DSH-0.1.2-A1-*（v0.1.2-alpha.1.md，28 张）＋ DSH-0.1.2-A2-*（v0.1.2-alpha.2.md，8 张）；
  辅助账本 api-migration-0.1.2-alpha.2.md（API-01…API-10，非卡片，作接口细节佐证）
- 面（face）判定：**普通 Cordis 服务端插件（host 平面）** ＋ 一个 CLI 包装脚本 ＋ 两个组合/补丁声明文件。
  依据：src/index.ts 为 `activate(ctx)` 组合入口、经 `ctx.get` 取服务；package.json 无 `dsh.client`、无 client bundle；
  因此 #3 的迁移方向是 host 平面域服务注入，而不是 client 面 `ctx.remote`（见 API-01 核心规则、A1-01 field note）
- 只读纪律：对 fixture 仅使用 read/grep/glob；未运行 patch、安装、构建、迁移；产物仅写入 agent-output\

## 0. 扫描范围与清单

已扫描（全部 6 个 fixture 文件，均逐行读完）：

| 文件 | 行数 | 性质 |
|---|---:|---|
| fixture/README.md | 16 | fixture 自述（含各触点命中位置的自声明） |
| fixture/cordis.patch.yml | 6 | Profile 组合行 ＋ `patch:` 补丁面声明 |
| fixture/package.json | 9 | 包元数据（无 dependencies/peerDependencies/engines） |
| fixture/patch.yml | 6 | 源补丁面（真实 target＋replacements） |
| fixture/scripts/apply-patch.mjs | 19 | 补丁应用脚本（#1、#7） |
| fixture/src/index.ts | 68 | 插件主入口（#2–#7） |

依赖/配置盘点（pre-flight §0）：package.json 未声明任何依赖，但 src/index.ts:10 引用了
`@deepseek-ai/dsh-session-view/internal`（未声明依赖）；无 lockfile、无 dsh-plugin.json、无 agent.cordis.yml；
组合文件为 cordis.patch.yml（id: legacy-plugin，patch: [patch.yml]）。fixture 设计上不可编译，故 build/typecheck
不适用于本步，列入 must-verify。

## 1. 汇总表（七类触点）

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | ✓ | patch.yml:1-6 · cordis.patch.yml:5-6 · scripts/apply-patch.mjs:5-9 · package.json:7 | A1-03（＋API-08 分类规则） | 高：真实 target/replacements 面，非仅文件名含 patch |
| #2 events | ✓ | src/index.ts:15-19（producer）· :20-22（observer） | A1-02 →（走廊折叠）→ **A2-01**（＋API-05 残余） | 高：`ignorable` 删于 alpha.1、复于 alpha.2，按最终净态映射 |
| #3 services/Remote | ✓ | src/index.ts:25-28（session.rename）· :29-32（llm.providers） | A1-01（＋API-01 平面规则；A2-02 条件命中） | 高：rc.2 服务键 apiProxy 在 alpha.1 被删除 |
| #4 filesystem | ✓ | src/index.ts:36-37 · 关联 scripts/apply-patch.mjs:5-8 | A1-04 | 高：硬编码 ~/.dsh/profiles/default |
| #5 UI/commands/tools | ✓ | src/index.ts:10（/internal 导入）· :41-43（registerCommand） | A1-03 | 高：内部包入口＋UI 注册点 |
| #6 custom channel | ✓ | src/index.ts:47-53（listen 127.0.0.1:43121）· :54（未调用） | A1-08 | 高：自建 loopback HTTP、绕过 Gateway 认证 |
| #7 subprocess/output | ✓ | scripts/apply-patch.mjs:12-18 · src/index.ts:57-66 | A1-05 ＋ A1-04（＋API-06 账本） | 高：stdout 当 JSONL 解析＝直接碰撞 |

七类全部命中；无命中类别见 §4。

## 2. 逐类详情：命中位置、耦合点、卡片映射

### #1 source patch / monkey patch —— 命中

- 命中文件/行：
  - patch.yml:2-6 `surface: target: src/session/view/SessionView.ts`，替换 `export function renderSessionView` → `renderSessionViewPatched`（真实替换面）；
  - cordis.patch.yml:5-6 `patch: [patch.yml]`（把补丁面挂进组合）；
  - scripts/apply-patch.mjs:5-9 要求环境变量 `DSH_HARNESS_SOURCE_ROOT`（host 源码根）并读取 patch.yml；
  - package.json:7 `"apply-patch": "node scripts/apply-patch.mjs"`。
- 具体耦合点：host 源码路径 `src/session/view/SessionView.ts`；符号 `renderSessionView`；`DSH_HARNESS_SOURCE_ROOT` 环境约定；patch.yml 面格式（surface/target/replacements）。
- 卡片映射：**A1-03（Session view internals split up extensively，#1/#5，required-if-hit）**——session view 内部在 alpha.1 被大幅拆分，补丁目标路径/内部导入/注册点失效；逐条对 exact-tag compare 重映射目标文件，找不到对应拥有模块就标 pending confirmation，禁止凭记忆猜路径（card 验证要求：补丁面组合对目标 tag 源码跑通，每个旧 target 都要映射到目标版本文件或写明移除原因；field note：以 DSH_HARNESS_SOURCE_ROOT 指向目标 tag 做组合验证）。
- 分类护栏（API-08，非卡片）：cordis.patch.yml 本身默认是 Profile 组合覆盖，不是源补丁——只有 patch.yml 里真实 target/replacements 属于源补丁迁移；组合行按 id/config 全量替换语义检查（config 是整体替换非深合并），两条验证路径不同，勿把组合行当 hunk rebase。
- 排除项：无 patchedDependencies / patch-package / monkeypatch 字样（grep 证据），即非 npm patch 机制。

### #2 internal events / persistent events —— 命中

- 命中文件/行：
  - src/index.ts:15-19 producer：`ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })`；
  - src/index.ts:20-22 纯观察者：`ctx.on('session/event', …)`。
- 具体耦合点：`session/event` 事件契约与 `SessionEvent` 词表；`SessionEvent.ignorable` 标记字段；外部信息型持久事件的生产/持久化/重载/传输保留语义；事件类型名 `legacy/informational-note`（第三方自定义词表）。
- 卡片映射（含走廊折叠，详见 §3）：**A1-02 ⇄ A2-01，按最终净状态映射为 A2-01（Restore SessionEvent.ignorable，#2，required-if-hit）**。
  - A1-02（alpha.1 临时删除 ignorable）的 recipe（停写未知持久事件/去标记）**仅限目标恰好是 alpha.1**；本走廊目标是 alpha.2，该 recipe 不适用，禁止"先删标记、目标版再加回"。
  - A2-01 净语义要点：标记恢复到 envelope/persistence/reload/transport 的保留语义；只对"老读者省略其语义仍可重建 Session"的信息型事件写 `ignorable: true`；标记不是消费端过滤指令；无标记未知事件仍 required-on-read fail-closed；集成层（JSONL/SQLite/API 传输、生成目录）必须原样保留该字段。
  - 残余不对称（API-05）：alpha.2 的公开 `Session.append()` 仍不接受 `ignorable`（只有 type/data/SurfaceIntent）——恢复是 envelope 级，第三方写缝仍是能力缺口。fixture 的 `ctx.emit('session/event', …)` 属 envelope/集成缝；若迁移把它改走 `Session.append` 将"静默写、冷加载响亮失败"（SessionFormatUnsupportedError），应保持集成缝保留语义或改用插件侧 sidecar 存储。
- 排除项：`tool/code-dispatch*` 等 PTC 词表（A1-06）无出现；session 读取路径（A1-27）未使用。

### #3 internal service probes / Remote —— 命中

- 命中文件/行：
  - src/index.ts:25-28：`await ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', { id, title })`；
  - src/index.ts:29-32：`await ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')`。
- 具体耦合点：rc.2 服务键 `apiProxy`（type ApiProxy，包 `@deepseek-ai/dsh-host-apiproxy`，alpha.1 整包删除）；operation 词表 `session.rename`、`llm.providers`；host 平面调用（普通 Cordis 服务端插件经 ctx.get 取服务）。
- 卡片映射：**A1-01（APIProxy removed, Host/Web Client calls moved to @Remote，#3，required-if-hit）**，迁移按运行平面分流（API-01 核心规则）：
  - host 平面（本 fixture 的情况）：跳过 gateway，直接注入拥有域服务——`llm.providers` → `inject: ['llm']` + `ctx.llm.listProviders()`（API-01 给出可执行契约；client 面同名操作在 A1-01 表里是一拆二：`llm/listProviders` ＋ `llm/listConfigurableProviders`）；
  - `session.rename` 的 host 侧拥有域服务需对目标 tag 逐项确认（pending confirmation），**不得由 client Remote 表反推 host 服务键**；client 面对应 `ctx.remote.session.rename`（注意 `sessionTitle/rename` 只是设计稿，不存在）；
  - 禁忌：机械把 `apiProxy` 换成 `remote`——`remote` 只存在于 client 面，host 会永远 `pending (waiting for service: remote)`。
- 条件卡片：**A2-02（Remote failures become RemoteError…，#3）**仅在迁移落到 client 面 `ctx.remote` 时命中（RemoteResult 调用形状不变，error 变 RemoteError 实例、错误码命名空间化：session/not-found、session/agent-busy、gateway/cancelled、gateway/internal 等；gateway/internal 与未知码不重试、取消不当普通错误）；host 域服务路径则不直接命中。
- 排除项（grep 证据）：无 ctx.remote / @Remote / dsh-client-runtime / connection.api → A1-25、A1-30、API-10 不命中；无 userQuestions.registerProvider（A1-20）、resolveSessionPreset/roots（A1-21）、isTokenDelta（A1-22）、session.getSnapshot().nodes 读取（A1-27）、subagent descriptor（A1-31）、workspaces 导航 connectWorkspace/pickDirectory（A1-32）、pluginInventory/list（A2-05）、$host（A2-06）、settingsNamespace（A2-10）、sessionProjections peer（A2-08）。

### #4 direct host directory reads/writes —— 命中

- 命中文件/行：
  - src/index.ts:36-37：`join(homedir(), '.dsh', 'profiles', 'default')` + `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`；
  - 关联 scripts/apply-patch.mjs:5-8（`DSH_HARNESS_SOURCE_ROOT` ＋ cwd 相对读 patch.yml）。
- 具体耦合点：硬编码 DSH home 假设 `~/.dsh`；硬编码 profile 名 `default`；直接向 profile 目录写文件，绕过 DSH_HOME/官方布局。
- 卡片映射：**A1-04（ACP/SDK examples merged into the dsh profile…，#4/#7，required-if-hit）**——直接读 profile 文件/固定 profile 路径的插件与包装器不再匹配；以运行时 `DSH_HOME`、目标 profile、官方 launcher 为准（alpha.1 起 profiles 在 `$DSH_HOME/profiles`）；区分组合文件、包清单与 resolved config，勿硬编码用户目录。
- 条件/相邻：A1-13（平台 shell/目录选择器修复可能使旧 workaround 失效）——本 fixture 无 workaround 分支，不命中；A1-21 触及 #4（agent-presets roots 路径探测）但无相关标识符，不命中；A2-06/API-04（client 面 `ctx.remote.$host.home`）是相邻的 host-home 事实缝，但本插件在 host 平面（应以 `process.env.DSH_HOME` 为准），不直接命中。

### #5 internal UI / commands / tools —— 命中

- 命中文件/行：
  - src/index.ts:10：`import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`（私有 /internal 入口，fixture 注释自认"UI decomposition 删除的私有路径"）；
  - src/index.ts:41-43：`ctx.contributes.registerCommand('legacy.openView', …)` 返回 `new SessionView({ enhanced: true })`。
- 具体耦合点：内部包入口 `@deepseek-ai/dsh-session-view/internal`；`SessionView` 类与构造参数 `{ enhanced }`；`ctx.contributes.registerCommand` 命令注册缝；命令处理器直接返回内部 UI 实例。
- 卡片映射：**A1-03（#1/#5，required-if-hit）**——内部 session-view 路径/注册点失效，按拥有模块重建导入，无稳定公共缝的能力标 pending confirmation，普通插件优先迁公共 facet/service。
  补充边界：命令线协议 `commands/list` / `commands/execute` 在 rc.2 已是 Remote、路径不变（A1-01 表）——本处碰撞不在命令线协议，而在内部 SessionView 消费与 contributes 注册面。
- 排除项（grep 证据）：无 dsh-client-runtime / PropsRuntime / ctx.slots / useSession / useChat / __ModuleLoader__ / PLUGIN_ID → A1-25、A1-26、API-10 不命中；无 composer DOM（A1-28）、MarkdownText/codeLabels（A1-29）、code/PTC 词表（A1-06）；A1-09/A1-10/A1-11 为 capability 建议卡——未命中且按纪律不自动采用。

### #6 custom HTTP / WS / RPC / DOM / CSS channels —— 命中

- 命中文件/行：src/index.ts:47-53 `createServer(...)` + `server.listen(43121, '127.0.0.1')`（注释 URL `http://localhost:43121/api/legacy`）；src/index.ts:54 `void startLegacyBridge`（函数定义未被调用，静态 fixture）。
- 具体耦合点：自建 loopback HTTP 服务；固定端口 43121；自定义 `/api/` 前缀路由；无 Host/Origin 校验、无 Cookie/token 认证、无 teardown（fixture 注释自认"bypasses the Host Gateway authentication model"）。
- 卡片映射：**A1-08（Web/API channels use process-scoped bootstrap tokens and signed cookies，#6，required-if-hit）**——自定义通道须走 bootstrap token（仅用于 `GET /?token=…` 兑换 HttpOnly/SameSite Cookie）；经 `ctx.webServer.register()/registerUpgrade()` 直接注册的自定义路由**不自动继承** auth、Host/Origin fence、CORS、TLS，handler 应先 `ctx.connection.requestRejection(req)` 或改走 Connection 载体；"只听 loopback"不是免认证理由。验证口径：错 Host/Origin→403、缺/坏 Cookie→401、token 同进程内可重复兑换、官方 /api/WS 用 Cookie 调用。
- 排除项：无 WebSocket / MutationObserver / insertRule / contenteditable / setSelectionRange / data-input-scroll（grep 证据）→ A1-28（composer contenteditable，DOM 面）不命中；A1-19（web 验收脚本读 boot manifest/auth URL）无验收脚本、无 `/plugins/` 资源拼接 → 不命中；A1-01 field note 的 /api 线协议（slash 形式 `POST /api/<ns>/<method>`）仅当该桥直接调用 host /api 时适用，本 fixture 只自答 `legacy` 不代理 → 不命中。

### #7 subprocess / stdout / stderr parsing —— 命中

- 命中文件/行：
  - scripts/apply-patch.mjs:3,12-18：`execFileSync('dsh', ['--profile', 'headless', 'ping'])` → 对 stdout 逐行 `JSON.parse`，期望 `{type:'final', text}`（文件注释自认"Deliberately wrong expectation"）；
  - src/index.ts:8,57-66：`spawn('dsh', ['--profile', 'headless', prompt])` → 对 stdout data 逐块 `JSON.parse`，期望 JSONL `final` 事件；
  - 两处均无 exit code / stderr / 取消 / teardown 处理（src/index.ts:65 仅 close 后 resolve）。
- 具体耦合点：launcher 命令名 `dsh`；argv 形状 `['--profile','headless', <task>]`；stdout 形状假设（JSONL）；忽略 stderr；忽略退出码；execFileSync 阻塞式执行。
- 卡片映射：**A1-05（Headless: stderr gains a dsh: reasoning: segment; stdout remains the final text，#7，required-if-hit）**——stdout 从来就是最终助手文本、**不是 JSONL**（rc.2 就如此，唯一变化是 alpha.1 起 stderr 多了 `dsh: reasoning:` 段）；以 exit 0/1 判成败；不要默认 JSON.parse stdout；忽略 stderr 丢 reasoning，"stderr 非空即失败"会误判成功运行。
  **A1-04（#4/#7，required-if-hit）**——包装器硬编码 bin/固定 profile/旧进程树不再匹配：`dsh --profile <name>` rc.2 已有，alpha.1 删了独立 demo bins（dsh-acp-demo、dsh-jsonrpc-agent 等）并把 ACP/SDK 示例并入 dsh profile；以官方 launcher、运行时 DSH_HOME、目标 profile 为准。
- 账本佐证（API-06）：正确形状 `dsh --profile headless "task"`，launcher flags 必须在任务文本之前；stderr 为 `dsh: reasoning: …`/`dsh: <code>: <message>`；SIGINT→130、SIGTERM→0；并发消费双流；验证用 stub 子进程矩阵（成功/带 reasoning/失败/拉起失败）。
- 排除项：A2-04（Node 24.0–24.11.1 空 client graph 修复）仅针对有 Node 版本 workaround 的启动包装器/CI，本 fixture 无 → 不命中；A1-13（平台 shell workaround）无 → 不命中；A1-06（PTC 词表，#7 列入）无 code 标识符 → 不命中；A1-19（web 验收输出格式）无 → 不命中。

## 3. 走廊折叠（corridor folding）

规则：走廊中间版本删除、目标版本又恢复的字段，按**最终净状态**映射——既不按中间态执行删除 recipe，也不"先删后加"。

1. `SessionEvent.ignorable`（本 fixture #2 的核心字段）：
   - alpha.1 删除（A1-02）→ alpha.2 恢复（A2-01，其 Source 明示"revert of DSH-0.1.2-A1-02"）；
   - 最终净态（目标 alpha.2）：**字段存在**，envelope/persistence/reload/transport 保留语义恢复；
   - 映射结论：#2 的命中落卡 **A2-01**；A1-02 仅作历史注记，其"停写/去标记"recipe 折叠出走廊（只在目标恰好为 alpha.1 时才执行）；迁移中保留 src/index.ts:17 的 `ignorable: true` 原样。
   - 折叠后的残余不对称不得被净态掩盖（API-05）：恢复是 envelope 级，公开 `Session.append` 仍写不了该标记——第三方持久事件写缝仍是能力缺口，冷加载会响亮失败；需要持久状态时用插件侧 sidecar，禁止 cast/手改 JSONL 绕过。
2. `RemoteResult<T>` 调用形状（#3 相关）：rc.2/alpha.1/alpha.2 均为 `{ok,value} | {ok:false,error}`（A2-02 明示"alpha.2 does not change the call shape"）——净态：调用形状不变，仅 error 实例与错误码命名空间在 alpha.2 变化；故 #3 的错误处理只落 A2-02，无需按中间版本改写调用形状。
3. 其余命中项均为"净删除/净变更"，无折叠：A1-03（session-view 拆分在目标仍拆分）、A1-01（apiProxy 在目标仍是删除态）、A1-04/A1-05/A1-08（行为/安全面净变更）。

## 4. 无命中类别与"无命中 ≠ 无问题"

- **无命中类别：无**——七类触点在本 fixture 全部命中（fixture/README.md:8-16 的自声明与独立 grep 证据一致）。
- 为完整起见，各类内部被排除的次级信号及证据已在 §2 各"排除项"列出（例如 #6 无 WebSocket/DOM/CSS 子面、#5 无 dsh-client-runtime/client bundle、#3 无 ctx.remote、#1 非 npm patch 机制）。
- 即使某类零命中也不能直接得出"无问题"，理由（pre-flight.md 自身声明＋SKILL 纪律）：
  1. 扫描是**模式启发式**（当前 rg/grep 模式未覆盖即"未检出"，不等于不存在）；
  2. 行级搜索看不见数据流——命中路径构造调用后还需追变量来源与输出去向（#4 尤其）；
  3. 依赖/imports/组合（package.json、lockfile、cordis.patch.yml）须单独盘点——本 fixture 的 `@deepseek-ai/dsh-session-view/internal` 就是未声明依赖；
  4. 静态扫描对运行时无证明力：仍须 build/typecheck、真机 profile 挂载、功能冒烟、包装器验证；卡片是策展清单而非完整 API diff；
  5. 本 fixture 设计上不可编译（README.md:3），故上述机械验证只能列为 must-verify，不能视为已完成。
- 同理，fixture/README.md 的命中表只是被扫描对象的自述，不是证据来源——本报告所有命中均由源码行＋grep 结果独立确认。

## 5. must-verify / 残余风险（留给迁移阶段）

- `session.rename` 在 host 平面的拥有域服务键：pending confirmation，按目标 tag 逐项确认（禁止由 client Remote 表反推）；
- A1-03 的补丁面重映射：以 DSH_HARNESS_SOURCE_ROOT 指向 dsh-v0.1.2-alpha.2 精确 tag 做 patch-surface 组合验证，每个旧 target 映射到目标文件或写明移除理由；
- #2 生产者缝：若最终走 `Session.append` 路线则触发 API-05 冷加载拒绝——迁移时做 persist→冷启动回归；
- #6 迁移需显式接入认证（requestRejection 或 Connection 载体）并补 teardown；
- #7 迁移后验证：stub 子进程矩阵（普通成功/带 reasoning/失败/拉起失败），双流并发、退出码、信号、取消；
- 静态验证层：build/typecheck（fixture 现不可编译属设计使然，真实插件仓库需跑）、`--dump-config` 组合检查、真机冷启动挂载。

## run-stats

- toolcalls 总数：33 次底层工具调用（经 13 次 run_code 包装执行：read 14 · grep 10 · glob 2 · write 4 · edit 2 · send_message 1）
- token 用量：n/a（本环境不暴露计量）
- 完成时间：2026-10-21T04:28:59.620Z（UTC；本地 2026-10-21，Asia/Shanghai）


#### FILE: report.md

# S1 · 静态触点扫描报告（Read-Only）· legacy-plugin fixture

- 任务模式：plugin-upgrade · Mode A（inspect，只读）；目标为静态拷贝，不执行、不迁移、不安装
- 扫描对象：<格目录>\fixture\（6 个文件，全部逐行读完；fixture 保持逐字节不变）
- 版本走廊（from → to）：dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.1 → dsh-v0.1.2-alpha.2
  （按卡片文件 front-matter 的 from→to 元数据连接两条边，非文件名字典序）
- 卡片集合：DSH-0.1.2-A1-*（v0.1.2-alpha.1.md，28 张）＋ DSH-0.1.2-A2-*（v0.1.2-alpha.2.md，8 张）；
  辅助账本 api-migration-0.1.2-alpha.2.md（API-01…API-10，非卡片，作接口细节佐证）
- 面（face）判定：**普通 Cordis 服务端插件（host 平面）** ＋ 一个 CLI 包装脚本 ＋ 两个组合/补丁声明文件。
  依据：src/index.ts 为 `activate(ctx)` 组合入口、经 `ctx.get` 取服务；package.json 无 `dsh.client`、无 client bundle；
  因此 #3 的迁移方向是 host 平面域服务注入，而不是 client 面 `ctx.remote`（见 API-01 核心规则、A1-01 field note）
- 只读纪律：对 fixture 仅使用 read/grep/glob；未运行 patch、安装、构建、迁移；产物仅写入 agent-output\

## 0. 扫描范围与清单

已扫描（全部 6 个 fixture 文件，均逐行读完）：

| 文件 | 行数 | 性质 |
|---|---:|---|
| fixture/README.md | 16 | fixture 自述（含各触点命中位置的自声明） |
| fixture/cordis.patch.yml | 6 | Profile 组合行 ＋ `patch:` 补丁面声明 |
| fixture/package.json | 9 | 包元数据（无 dependencies/peerDependencies/engines） |
| fixture/patch.yml | 6 | 源补丁面（真实 target＋replacements） |
| fixture/scripts/apply-patch.mjs | 19 | 补丁应用脚本（#1、#7） |
| fixture/src/index.ts | 68 | 插件主入口（#2–#7） |

依赖/配置盘点（pre-flight §0）：package.json 未声明任何依赖，但 src/index.ts:10 引用了
`@deepseek-ai/dsh-session-view/internal`（未声明依赖）；无 lockfile、无 dsh-plugin.json、无 agent.cordis.yml；
组合文件为 cordis.patch.yml（id: legacy-plugin，patch: [patch.yml]）。fixture 设计上不可编译，故 build/typecheck
不适用于本步，列入 must-verify。

## 1. 汇总表（七类触点）

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | ✓ | patch.yml:1-6 · cordis.patch.yml:5-6 · scripts/apply-patch.mjs:5-9 · package.json:7 | A1-03（＋API-08 分类规则） | 高：真实 target/replacements 面，非仅文件名含 patch |
| #2 events | ✓ | src/index.ts:15-19（producer）· :20-22（observer） | A1-02 →（走廊折叠）→ **A2-01**（＋API-05 残余） | 高：`ignorable` 删于 alpha.1、复于 alpha.2，按最终净态映射 |
| #3 services/Remote | ✓ | src/index.ts:25-28（session.rename）· :29-32（llm.providers） | A1-01（＋API-01 平面规则；A2-02 条件命中） | 高：rc.2 服务键 apiProxy 在 alpha.1 被删除 |
| #4 filesystem | ✓ | src/index.ts:36-37 · 关联 scripts/apply-patch.mjs:5-8 | A1-04 | 高：硬编码 ~/.dsh/profiles/default |
| #5 UI/commands/tools | ✓ | src/index.ts:10（/internal 导入）· :41-43（registerCommand） | A1-03 | 高：内部包入口＋UI 注册点 |
| #6 custom channel | ✓ | src/index.ts:47-53（listen 127.0.0.1:43121）· :54（未调用） | A1-08 | 高：自建 loopback HTTP、绕过 Gateway 认证 |
| #7 subprocess/output | ✓ | scripts/apply-patch.mjs:12-18 · src/index.ts:57-66 | A1-05 ＋ A1-04（＋API-06 账本） | 高：stdout 当 JSONL 解析＝直接碰撞 |

七类全部命中；无命中类别见 §4。

## 2. 逐类详情：命中位置、耦合点、卡片映射

### #1 source patch / monkey patch —— 命中

- 命中文件/行：
  - patch.yml:2-6 `surface: target: src/session/view/SessionView.ts`，替换 `export function renderSessionView` → `renderSessionViewPatched`（真实替换面）；
  - cordis.patch.yml:5-6 `patch: [patch.yml]`（把补丁面挂进组合）；
  - scripts/apply-patch.mjs:5-9 要求环境变量 `DSH_HARNESS_SOURCE_ROOT`（host 源码根）并读取 patch.yml；
  - package.json:7 `"apply-patch": "node scripts/apply-patch.mjs"`。
- 具体耦合点：host 源码路径 `src/session/view/SessionView.ts`；符号 `renderSessionView`；`DSH_HARNESS_SOURCE_ROOT` 环境约定；patch.yml 面格式（surface/target/replacements）。
- 卡片映射：**A1-03（Session view internals split up extensively，#1/#5，required-if-hit）**——session view 内部在 alpha.1 被大幅拆分，补丁目标路径/内部导入/注册点失效；逐条对 exact-tag compare 重映射目标文件，找不到对应拥有模块就标 pending confirmation，禁止凭记忆猜路径（card 验证要求：补丁面组合对目标 tag 源码跑通，每个旧 target 都要映射到目标版本文件或写明移除原因；field note：以 DSH_HARNESS_SOURCE_ROOT 指向目标 tag 做组合验证）。
- 分类护栏（API-08，非卡片）：cordis.patch.yml 本身默认是 Profile 组合覆盖，不是源补丁——只有 patch.yml 里真实 target/replacements 属于源补丁迁移；组合行按 id/config 全量替换语义检查（config 是整体替换非深合并），两条验证路径不同，勿把组合行当 hunk rebase。
- 排除项：无 patchedDependencies / patch-package / monkeypatch 字样（grep 证据），即非 npm patch 机制。

### #2 internal events / persistent events —— 命中

- 命中文件/行：
  - src/index.ts:15-19 producer：`ctx.emit('session/event', { type: 'legacy/informational-note', ignorable: true, payload: { text: 'fixture' } })`；
  - src/index.ts:20-22 纯观察者：`ctx.on('session/event', …)`。
- 具体耦合点：`session/event` 事件契约与 `SessionEvent` 词表；`SessionEvent.ignorable` 标记字段；外部信息型持久事件的生产/持久化/重载/传输保留语义；事件类型名 `legacy/informational-note`（第三方自定义词表）。
- 卡片映射（含走廊折叠，详见 §3）：**A1-02 ⇄ A2-01，按最终净状态映射为 A2-01（Restore SessionEvent.ignorable，#2，required-if-hit）**。
  - A1-02（alpha.1 临时删除 ignorable）的 recipe（停写未知持久事件/去标记）**仅限目标恰好是 alpha.1**；本走廊目标是 alpha.2，该 recipe 不适用，禁止"先删标记、目标版再加回"。
  - A2-01 净语义要点：标记恢复到 envelope/persistence/reload/transport 的保留语义；只对"老读者省略其语义仍可重建 Session"的信息型事件写 `ignorable: true`；标记不是消费端过滤指令；无标记未知事件仍 required-on-read fail-closed；集成层（JSONL/SQLite/API 传输、生成目录）必须原样保留该字段。
  - 残余不对称（API-05）：alpha.2 的公开 `Session.append()` 仍不接受 `ignorable`（只有 type/data/SurfaceIntent）——恢复是 envelope 级，第三方写缝仍是能力缺口。fixture 的 `ctx.emit('session/event', …)` 属 envelope/集成缝；若迁移把它改走 `Session.append` 将"静默写、冷加载响亮失败"（SessionFormatUnsupportedError），应保持集成缝保留语义或改用插件侧 sidecar 存储。
- 排除项：`tool/code-dispatch*` 等 PTC 词表（A1-06）无出现；session 读取路径（A1-27）未使用。

### #3 internal service probes / Remote —— 命中

- 命中文件/行：
  - src/index.ts:25-28：`await ctx.get('apiProxy')` → `apiProxy.invoke('session.rename', { id, title })`；
  - src/index.ts:29-32：`await ctx.get('apiProxy')` → `apiProxy.invoke('llm.providers')`。
- 具体耦合点：rc.2 服务键 `apiProxy`（type ApiProxy，包 `@deepseek-ai/dsh-host-apiproxy`，alpha.1 整包删除）；operation 词表 `session.rename`、`llm.providers`；host 平面调用（普通 Cordis 服务端插件经 ctx.get 取服务）。
- 卡片映射：**A1-01（APIProxy removed, Host/Web Client calls moved to @Remote，#3，required-if-hit）**，迁移按运行平面分流（API-01 核心规则）：
  - host 平面（本 fixture 的情况）：跳过 gateway，直接注入拥有域服务——`llm.providers` → `inject: ['llm']` + `ctx.llm.listProviders()`（API-01 给出可执行契约；client 面同名操作在 A1-01 表里是一拆二：`llm/listProviders` ＋ `llm/listConfigurableProviders`）；
  - `session.rename` 的 host 侧拥有域服务需对目标 tag 逐项确认（pending confirmation），**不得由 client Remote 表反推 host 服务键**；client 面对应 `ctx.remote.session.rename`（注意 `sessionTitle/rename` 只是设计稿，不存在）；
  - 禁忌：机械把 `apiProxy` 换成 `remote`——`remote` 只存在于 client 面，host 会永远 `pending (waiting for service: remote)`。
- 条件卡片：**A2-02（Remote failures become RemoteError…，#3）**仅在迁移落到 client 面 `ctx.remote` 时命中（RemoteResult 调用形状不变，error 变 RemoteError 实例、错误码命名空间化：session/not-found、session/agent-busy、gateway/cancelled、gateway/internal 等；gateway/internal 与未知码不重试、取消不当普通错误）；host 域服务路径则不直接命中。
- 排除项（grep 证据）：无 ctx.remote / @Remote / dsh-client-runtime / connection.api → A1-25、A1-30、API-10 不命中；无 userQuestions.registerProvider（A1-20）、resolveSessionPreset/roots（A1-21）、isTokenDelta（A1-22）、session.getSnapshot().nodes 读取（A1-27）、subagent descriptor（A1-31）、workspaces 导航 connectWorkspace/pickDirectory（A1-32）、pluginInventory/list（A2-05）、$host（A2-06）、settingsNamespace（A2-10）、sessionProjections peer（A2-08）。

### #4 direct host directory reads/writes —— 命中

- 命中文件/行：
  - src/index.ts:36-37：`join(homedir(), '.dsh', 'profiles', 'default')` + `writeFileSync(join(profileDir, 'legacy-note.txt'), text)`；
  - 关联 scripts/apply-patch.mjs:5-8（`DSH_HARNESS_SOURCE_ROOT` ＋ cwd 相对读 patch.yml）。
- 具体耦合点：硬编码 DSH home 假设 `~/.dsh`；硬编码 profile 名 `default`；直接向 profile 目录写文件，绕过 DSH_HOME/官方布局。
- 卡片映射：**A1-04（ACP/SDK examples merged into the dsh profile…，#4/#7，required-if-hit）**——直接读 profile 文件/固定 profile 路径的插件与包装器不再匹配；以运行时 `DSH_HOME`、目标 profile、官方 launcher 为准（alpha.1 起 profiles 在 `$DSH_HOME/profiles`）；区分组合文件、包清单与 resolved config，勿硬编码用户目录。
- 条件/相邻：A1-13（平台 shell/目录选择器修复可能使旧 workaround 失效）——本 fixture 无 workaround 分支，不命中；A1-21 触及 #4（agent-presets roots 路径探测）但无相关标识符，不命中；A2-06/API-04（client 面 `ctx.remote.$host.home`）是相邻的 host-home 事实缝，但本插件在 host 平面（应以 `process.env.DSH_HOME` 为准），不直接命中。

### #5 internal UI / commands / tools —— 命中

- 命中文件/行：
  - src/index.ts:10：`import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`（私有 /internal 入口，fixture 注释自认"UI decomposition 删除的私有路径"）；
  - src/index.ts:41-43：`ctx.contributes.registerCommand('legacy.openView', …)` 返回 `new SessionView({ enhanced: true })`。
- 具体耦合点：内部包入口 `@deepseek-ai/dsh-session-view/internal`；`SessionView` 类与构造参数 `{ enhanced }`；`ctx.contributes.registerCommand` 命令注册缝；命令处理器直接返回内部 UI 实例。
- 卡片映射：**A1-03（#1/#5，required-if-hit）**——内部 session-view 路径/注册点失效，按拥有模块重建导入，无稳定公共缝的能力标 pending confirmation，普通插件优先迁公共 facet/service。
  补充边界：命令线协议 `commands/list` / `commands/execute` 在 rc.2 已是 Remote、路径不变（A1-01 表）——本处碰撞不在命令线协议，而在内部 SessionView 消费与 contributes 注册面。
- 排除项（grep 证据）：无 dsh-client-runtime / PropsRuntime / ctx.slots / useSession / useChat / __ModuleLoader__ / PLUGIN_ID → A1-25、A1-26、API-10 不命中；无 composer DOM（A1-28）、MarkdownText/codeLabels（A1-29）、code/PTC 词表（A1-06）；A1-09/A1-10/A1-11 为 capability 建议卡——未命中且按纪律不自动采用。

### #6 custom HTTP / WS / RPC / DOM / CSS channels —— 命中

- 命中文件/行：src/index.ts:47-53 `createServer(...)` + `server.listen(43121, '127.0.0.1')`（注释 URL `http://localhost:43121/api/legacy`）；src/index.ts:54 `void startLegacyBridge`（函数定义未被调用，静态 fixture）。
- 具体耦合点：自建 loopback HTTP 服务；固定端口 43121；自定义 `/api/` 前缀路由；无 Host/Origin 校验、无 Cookie/token 认证、无 teardown（fixture 注释自认"bypasses the Host Gateway authentication model"）。
- 卡片映射：**A1-08（Web/API channels use process-scoped bootstrap tokens and signed cookies，#6，required-if-hit）**——自定义通道须走 bootstrap token（仅用于 `GET /?token=…` 兑换 HttpOnly/SameSite Cookie）；经 `ctx.webServer.register()/registerUpgrade()` 直接注册的自定义路由**不自动继承** auth、Host/Origin fence、CORS、TLS，handler 应先 `ctx.connection.requestRejection(req)` 或改走 Connection 载体；"只听 loopback"不是免认证理由。验证口径：错 Host/Origin→403、缺/坏 Cookie→401、token 同进程内可重复兑换、官方 /api/WS 用 Cookie 调用。
- 排除项：无 WebSocket / MutationObserver / insertRule / contenteditable / setSelectionRange / data-input-scroll（grep 证据）→ A1-28（composer contenteditable，DOM 面）不命中；A1-19（web 验收脚本读 boot manifest/auth URL）无验收脚本、无 `/plugins/` 资源拼接 → 不命中；A1-01 field note 的 /api 线协议（slash 形式 `POST /api/<ns>/<method>`）仅当该桥直接调用 host /api 时适用，本 fixture 只自答 `legacy` 不代理 → 不命中。

### #7 subprocess / stdout / stderr parsing —— 命中

- 命中文件/行：
  - scripts/apply-patch.mjs:3,12-18：`execFileSync('dsh', ['--profile', 'headless', 'ping'])` → 对 stdout 逐行 `JSON.parse`，期望 `{type:'final', text}`（文件注释自认"Deliberately wrong expectation"）；
  - src/index.ts:8,57-66：`spawn('dsh', ['--profile', 'headless', prompt])` → 对 stdout data 逐块 `JSON.parse`，期望 JSONL `final` 事件；
  - 两处均无 exit code / stderr / 取消 / teardown 处理（src/index.ts:65 仅 close 后 resolve）。
- 具体耦合点：launcher 命令名 `dsh`；argv 形状 `['--profile','headless', <task>]`；stdout 形状假设（JSONL）；忽略 stderr；忽略退出码；execFileSync 阻塞式执行。
- 卡片映射：**A1-05（Headless: stderr gains a dsh: reasoning: segment; stdout remains the final text，#7，required-if-hit）**——stdout 从来就是最终助手文本、**不是 JSONL**（rc.2 就如此，唯一变化是 alpha.1 起 stderr 多了 `dsh: reasoning:` 段）；以 exit 0/1 判成败；不要默认 JSON.parse stdout；忽略 stderr 丢 reasoning，"stderr 非空即失败"会误判成功运行。
  **A1-04（#4/#7，required-if-hit）**——包装器硬编码 bin/固定 profile/旧进程树不再匹配：`dsh --profile <name>` rc.2 已有，alpha.1 删了独立 demo bins（dsh-acp-demo、dsh-jsonrpc-agent 等）并把 ACP/SDK 示例并入 dsh profile；以官方 launcher、运行时 DSH_HOME、目标 profile 为准。
- 账本佐证（API-06）：正确形状 `dsh --profile headless "task"`，launcher flags 必须在任务文本之前；stderr 为 `dsh: reasoning: …`/`dsh: <code>: <message>`；SIGINT→130、SIGTERM→0；并发消费双流；验证用 stub 子进程矩阵（成功/带 reasoning/失败/拉起失败）。
- 排除项：A2-04（Node 24.0–24.11.1 空 client graph 修复）仅针对有 Node 版本 workaround 的启动包装器/CI，本 fixture 无 → 不命中；A1-13（平台 shell workaround）无 → 不命中；A1-06（PTC 词表，#7 列入）无 code 标识符 → 不命中；A1-19（web 验收输出格式）无 → 不命中。

## 3. 走廊折叠（corridor folding）

规则：走廊中间版本删除、目标版本又恢复的字段，按**最终净状态**映射——既不按中间态执行删除 recipe，也不"先删后加"。

1. `SessionEvent.ignorable`（本 fixture #2 的核心字段）：
   - alpha.1 删除（A1-02）→ alpha.2 恢复（A2-01，其 Source 明示"revert of DSH-0.1.2-A1-02"）；
   - 最终净态（目标 alpha.2）：**字段存在**，envelope/persistence/reload/transport 保留语义恢复；
   - 映射结论：#2 的命中落卡 **A2-01**；A1-02 仅作历史注记，其"停写/去标记"recipe 折叠出走廊（只在目标恰好为 alpha.1 时才执行）；迁移中保留 src/index.ts:17 的 `ignorable: true` 原样。
   - 折叠后的残余不对称不得被净态掩盖（API-05）：恢复是 envelope 级，公开 `Session.append` 仍写不了该标记——第三方持久事件写缝仍是能力缺口，冷加载会响亮失败；需要持久状态时用插件侧 sidecar，禁止 cast/手改 JSONL 绕过。
2. `RemoteResult<T>` 调用形状（#3 相关）：rc.2/alpha.1/alpha.2 均为 `{ok,value} | {ok:false,error}`（A2-02 明示"alpha.2 does not change the call shape"）——净态：调用形状不变，仅 error 实例与错误码命名空间在 alpha.2 变化；故 #3 的错误处理只落 A2-02，无需按中间版本改写调用形状。
3. 其余命中项均为"净删除/净变更"，无折叠：A1-03（session-view 拆分在目标仍拆分）、A1-01（apiProxy 在目标仍是删除态）、A1-04/A1-05/A1-08（行为/安全面净变更）。

## 4. 无命中类别与"无命中 ≠ 无问题"

- **无命中类别：无**——七类触点在本 fixture 全部命中（fixture/README.md:8-16 的自声明与独立 grep 证据一致）。
- 为完整起见，各类内部被排除的次级信号及证据已在 §2 各"排除项"列出（例如 #6 无 WebSocket/DOM/CSS 子面、#5 无 dsh-client-runtime/client bundle、#3 无 ctx.remote、#1 非 npm patch 机制）。
- 即使某类零命中也不能直接得出"无问题"，理由（pre-flight.md 自身声明＋SKILL 纪律）：
  1. 扫描是**模式启发式**（当前 rg/grep 模式未覆盖即"未检出"，不等于不存在）；
  2. 行级搜索看不见数据流——命中路径构造调用后还需追变量来源与输出去向（#4 尤其）；
  3. 依赖/imports/组合（package.json、lockfile、cordis.patch.yml）须单独盘点——本 fixture 的 `@deepseek-ai/dsh-session-view/internal` 就是未声明依赖；
  4. 静态扫描对运行时无证明力：仍须 build/typecheck、真机 profile 挂载、功能冒烟、包装器验证；卡片是策展清单而非完整 API diff；
  5. 本 fixture 设计上不可编译（README.md:3），故上述机械验证只能列为 must-verify，不能视为已完成。
- 同理，fixture/README.md 的命中表只是被扫描对象的自述，不是证据来源——本报告所有命中均由源码行＋grep 结果独立确认。

## 5. must-verify / 残余风险（留给迁移阶段）

- `session.rename` 在 host 平面的拥有域服务键：pending confirmation，按目标 tag 逐项确认（禁止由 client Remote 表反推）；
- A1-03 的补丁面重映射：以 DSH_HARNESS_SOURCE_ROOT 指向 dsh-v0.1.2-alpha.2 精确 tag 做 patch-surface 组合验证，每个旧 target 映射到目标文件或写明移除理由；
- #2 生产者缝：若最终走 `Session.append` 路线则触发 API-05 冷加载拒绝——迁移时做 persist→冷启动回归；
- #6 迁移需显式接入认证（requestRejection 或 Connection 载体）并补 teardown；
- #7 迁移后验证：stub 子进程矩阵（普通成功/带 reasoning/失败/拉起失败），双流并发、退出码、信号、取消；
- 静态验证层：build/typecheck（fixture 现不可编译属设计使然，真实插件仓库需跑）、`--dump-config` 组合检查、真机冷启动挂载。

## run-stats

- toolcalls 总数：33 次底层工具调用（经 13 次 run_code 包装执行：read 14 · grep 10 · glob 2 · write 4 · edit 2 · send_message 1）
- token 用量：n/a（本环境不暴露计量）
- 完成时间：2026-10-21T04:28:59.620Z（UTC；本地 2026-10-21，Asia/Shanghai）


#### FILE: tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
3. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
4. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
5. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\README.md
6. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\cordis.patch.yml
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\package.json
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\patch.yml
9. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\scripts\apply-patch.mjs
10. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\src\index.ts
11. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.1.md
12. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.1.md offset=434
13. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.2.md
14. grep pattern=^#+ .*API- path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md
15. grep pattern=patch path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md
16. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md offset=405 limit=100
17. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md offset=87 limit=102
18. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md offset=535 limit=55
19. grep pattern=(^|[^.])patch\.yml|patchedDependencies|patch-package path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
20. grep pattern=DSH_HARNESS_SOURCE_ROOT|patch-surface|monkeypatch|monkey-patch path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
21. grep pattern=SessionEvent|session/event|ctx\.on\(|subscribe\( path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
22. grep pattern=APIProxy|apiProxy|ctx\.get\(|ctx\.remote|@Remote path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
23. grep pattern=DSH_HOME|\.dsh[/\\]|profiles[/\\]|homedir\(|readFile|writeFile|mkdir|openPath path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
24. grep pattern=registerCommand|registerView|contributes|ctx\.tools|commands\.execute|dsh-client-runtime|PropsRuntime|ctx\.slots|useSession|useChat|/internal|__ModuleLoader__|PLUGIN_ID path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
25. grep pattern=createServer\(|WebSocket|MutationObserver|insertRule|127\.0\.0\.1|localhost|router\.(get|post|put|delete)\(|/api/|contenteditable|setSelectionRange|data-input-scroll path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
26. grep pattern=node:child_process|spawn\(|exec(File)?Sync\(|execa|Bun\.spawn|headless|--profile path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
27. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\S1-static-scan\report.md（触点扫描报告，主产物）
28. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\report.md（同内容副本，兼容收尾路径约定）
29. edit E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\S1-static-scan\report.md（run-stats 计数修正）
30. edit E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\report.md（run-stats 计数修正）
31. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\tool-transcript.txt
32. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\transcript-manifest.txt
33. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（向父代理回报结果）


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\cordis.patch.yml
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\package.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\patch.yml
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\scripts\apply-patch.mjs
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\fixture\src\index.ts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.1.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\S1-static-scan\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S1-static-scan\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.