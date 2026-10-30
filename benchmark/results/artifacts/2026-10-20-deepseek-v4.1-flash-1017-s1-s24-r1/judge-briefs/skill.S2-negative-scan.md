# JUDGE BRIEF · skill.S2-negative-scan

## Criteria (sealed rubric)
- [host-break] (40pt) Locate index.js inject/apiProxy.llm.providers and map the breaking Host service to A1-01. Explain llm injection/listProviders and the dead apiproxy dependency in package.json; a card name alone earns zero.
- [negative-coverage] (20pt) Account for each of the other six categories with scanned-file evidence. session-notes.js is a pure string/array utility; cordis.patch.yml is ordinary plugin composition, not a host-source patch. Interpret a negative patch conclusion in its touchpoint-category context: wording such as no patch file/declaration under the source-patch category can correctly mean no host-source patch, especially when the scan scope includes the composition file. Do not deduct solely because an ordinary composition file has patch in its name, or require an extra explanation of that naming distinction when the category conclusion and scan evidence are correct. Still deduct for an explicit denial that the existing composition file itself exists, for misclassifying its insertion as host-source modification, or for unsupported negative conclusions. Do not invent coupling from filenames.
- [inference-boundary] (20pt) Explain why no static hits cannot establish compatibility: scan coverage is limited and dependency/config/runtime behavior needs separate evidence. Distinguish the existing decisive apiProxy break from the six negative categories.
- [verification-plan] (20pt) Specify post-migration build/typecheck, an isolated target-version cold boot with no pending, and an actual provider call. These are proposed checks, not checks supposedly executed inside this non-runnable fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S2-negative-scan/S2-negative-scan-report.md

# S2 · Negative Scan 报告：@demo/dsh-minimal-llm（0.1.1-rc.2 风格 → 0.1.2-alpha.2）

> 模式：plugin-upgrade skill 的 **Mode A（只读巡检）** + Mode C 的"扫描与计划"阶段。
> 目标版本：`dsh-v0.1.2-alpha.2`（走廊 `rc.2 → alpha.1 → alpha.2`）。
> 本次**未执行任何迁移、构建、安装或运行**；`fixture/` 全程只读，未产生任何写入（5 个文件 SHA256 前缀见 §2）。
> 报告只引卡片 ID 与要点，不复述卡片原文。

---

## 1. 结论先行

| 项目 | 结论 |
|---|---|
| 七类触点命中情况 | **6 类零命中，1 类命中（#3 内部服务/Remote）** |
| 命中点 | `index.js:3` `export const inject = ["apiProxy"]`；`index.js:9` `await ctx.apiProxy.llm.providers()` |
| 主要卡片 | **DSH-0.1.2-A1-01**（APIProxy 移除，required-if-hit）；配套 API-01、A2-02 |
| 七类之外的命中（同样致命） | `package.json:17` 依赖 **已被删除的包** `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1`；无任何 DSH peer/engines 声明 |
| 当前源码在 alpha.2 上的预期表现 | **不是"报错"，而是静默不激活**：硬 `inject: ["apiProxy"]` 的行会永久 `pending (waiting for service: apiProxy)`，插件从不 apply，日志里几乎没有插件相关错误 |
| 是否兼容 0.1.2 | **否，不能称兼容**。必须改 1 处 inject/调用 + 删 1 条依赖 + 补 peer 声明，之后才谈"能否兼容" |
| 对题面核心问题的回答 | **零命中的类别不能证明兼容**（§6，5 条依据 + 本 fixture 本身就是一个反例） |

一句话：这个插件确实"很小"，但小 ≠ 安全；它恰好把两个最危险的形态都占了——**唯一命中的触点属于静默失效类**，而**七类扫不到的依赖/清单面本身是坏的**。

---

## 2. 扫描范围与方法（可复核）

**文件清单（`Get-ChildItem -Force -Recurse`，含隐藏文件，无遗漏、无 `.npmrc`/锁文件/CI 目录）**

| 文件 | 字节 | SHA256(前16) | 角色 |
|---|---:|---|---|
| `package.json` | 361 | `414ADB496685D646` | 包清单（name/version/dsh.bundle.patch/dependencies） |
| `cordis.patch.yml` | 68 | `D50C34AE80E26E0D` | Profile/Bundle 组合叠加层（**不是**源码补丁） |
| `index.js` | 619 | `7306621926891CDF` | 宿主侧入口：`inject` + `apply(ctx)` |
| `src/session-notes.js` | 389 | `7A3219984C595F4C` | 纯工具函数（诱饵：文件名含 session，实际零耦合） |
| `README.md` | 599 | `FDCA9077F0C9FB81` | 夹具说明，非运行时代码 |

**方法**：按 `references/pre-flight.md` 的七类分类逐类跑 `references/pre-flight-patterns.json` 的正则（本环境 grep 工具不支持 lookbehind，第 1 类改用宽匹配 `patch` 后**人工分类**，见 §3 #1），再对每条命中做人工复核（区分"模式命中"与"真实耦合面"）。同时按 pre-flight §0 做配置/依赖盘点，按 API-08 对 `cordis.patch.yml` 做分类。

**面（face）判定**：**Host 面普通 Cordis 插件**。证据：`main: index.js`、ESM、`apply(ctx)` 纯宿主侧、无 `dsh.client` 字段、无浏览器 bundle、无 `__ModuleLoader__`、无 UI/命令注册。这一点决定了 #3 的迁移方向（见 §5）。

**未采集**：Mode C 的 mechanical baseline（build/typecheck/tests）无法采集——该包**没有 `scripts`、没有 devDependencies、没有 TS、没有测试**。这是"基线未采集（not collected）"，不是"基线全绿"。

---

## 3. 七类触点逐项结论（hit / no-hit + 证据）

| # | 触点类别 | 结论 | 证据（扫描模式 → 实际命中） | 适用卡片 | 该"零命中"的证据强度与盲区 |
|---|---|---|---|---|---|
| 1 | 源码补丁 / monkey patch | **无命中** | `patch` 宽匹配仅 2 条：`package.json:9` `"./cordis.patch.yml"`（exports）与 `:13` `dsh.bundle.patch`。二者都是**组合叠加层声明**，按 API-08 属"公开/负向对照"，不是替换宿主源码 | API-08（分类规则）；A1-03（真源码补丁才适用，#1/#5） | **分类判定型**零命中：不是"没匹配到"，而是"匹配到了但按规则判为非补丁"。盲区：若有人在别处用 `patch-package`/overrides 改动宿主产物，本仓库里看不到（本包无锁文件、无 patch 目录，风险低） |
| 2 | 内部事件名 / 持久化事件 | **无命中** | `SessionEvent` / `session/event` / `ctx.on(` / `subscribe(` / `tool/code-dispatch` / `connection/reset` → 0；全仓无事件生产/消费代码 | A1-02、A1-06、A2-01（均不适用） | **结构性**零命中：源码里根本不存在事件载体（全仓只有 2 个 JS 文件 + 2 个配置 + 1 个说明，均已逐行读完）。这类零命中可信度最高 |
| 3 | 内部服务探针 / Remote | **命中（唯一命中类）** | `inject = ["apiProxy"]`（index.js:3，硬注入）；`ctx.apiProxy.llm.providers()`（index.js:9，点分域调用）；另 2 条为同文件日志字符串 | **DSH-0.1.2-A1-01**（required-if-hit）、API-01；关联 A2-02、R-05 | 命中确定、且是**静默失效**类：rc.2 的服务键 `apiProxy` 在 alpha.1 被删除，硬注入使该行永久 pending，无异常、无退出码 |
| 4 | 直接读写宿主目录 | **无命中** | `DSH_HOME` / `.dsh[/\]` / `profiles[/\]` / `homedir(` / `readFile` / `writeFile` / `mkdir` / `openPath` → 0 | A1-04、A1-13、A1-21（均不适用） | **API 存在性**零命中（连 fs 模块都未 import）。注意 pre-flight 的提醒：行级搜索无法证明数据流；此处的强度来自"无任何文件系统 API"而非"没搜到字符串" |
| 5 | 内部 UI / 命令 / 工具注册 | **无命中** | `registerCommand` / `registerView` / `contributes` / `ctx.tools` / `commands.execute` / `dsh-client-runtime` / `ctx.slots` / `useSession` / `useChat` / `__ModuleLoader__` / `PLUGIN_ID` → 0；`package.json` 无 `dsh.client` | A1-03、A1-25、A1-26、A1-27、A1-28、A1-29、A1-32、API-10（均不适用） | **结构性**零命中：无客户端半边，A1-25/A1-26/A1-10 这一整族卡片按面判定直接出局。★但这一族卡片恰好是最容易被"零命中"掩盖的（客户端插件半失效时不报错） |
| 6 | 自定义 HTTP/WS/RPC/DOM/CSS 通道 | **无命中** | `createServer(` / `WebSocket` / `MutationObserver` / `insertRule` / `127.0.0.1` / `localhost` / `router.(get…)` / `/api/` / `contenteditable` / `setSelectionRange` → 0 | A1-08、A1-28（均不适用） | **结构性**零命中。→ 与 A1-08 的"通道鉴权"迁移无关，这是好消息 |
| 7 | 子进程 / stdout / stderr 解析 | **无命中** | `node:child_process` / `spawn(` / `exec(File)?Sync(` / `execa` / `Bun.spawn` / `headless` / `--profile` → 0 | A1-04、A1-05、A1-06、A1-13、A2-04（均不适用） | **结构性**零命中。附带说明：本插件只 `console.error` 打日志，不解析任何子进程输出，故 A1-05（headless stderr 新增 `dsh: reasoning:` 段）不影响它 |

**summary 模板（pre-flight 要求格式）**

| Touchpoint | Hit | File/line | Applicable card | Confidence note |
|---|---:|---|---|---|
| #1 patch | 否（仅组合声明） | package.json:9,13 | API-08 | 分类判定，非真实补丁 |
| #2 events | 否 | — | — | 结构性无载体 |
| #3 services/Remote | **是** | index.js:3,9 | **A1-01**, API-01（+A2-02） | 确定；静默 pending |
| #4 filesystem | 否 | — | — | 无 fs API |
| #5 UI/commands | 否 | — | — | 无客户端半边 |
| #6 custom channel | 否 | — | — | 无网络/DOM |
| #7 subprocess | 否 | — | — | 无子进程 |

补充判定：`src/session-notes.js` 为**诱饵**，不是 #2/#4 命中。证据：仅 `formatSessionNote()`（字符串 trim/replace/slice）与 `chunk()`（数组切片），无 import、无 ctx、无宿主调用；且 **`index.js` 根本没有 import 它**（当前是不可达代码，连运行时影响都没有）。

---

## 4. 命中项 → 具体变更卡片映射

| 命中点 | 文件:行 | 卡片 | 动作等级 | 迁移要点（摘要，非原文） |
|---|---|---|---|---|
| `apiProxy` 硬注入 | index.js:3 | **DSH-0.1.2-A1-01** | required-if-hit | 先定面：Host 面**不要**把 `apiProxy` 机械换成 `remote`（`remote` 只存在于浏览器面，换了会得到 `pending (waiting for service: remote)`）。Host 面的正解是**跳过网关，直接注入被代理的领域服务** |
| `ctx.apiProxy.llm.providers()` | index.js:9 | **A1-01**（Host 面落点）+ **API-01**（Host/Client 最小正确形态） | required-if-hit | 目标形态约为 `inject: ["llm"]` + `ctx.llm.listProviders()`；旧 `llm.providers` 在客户端面被拆成 `listProviders`/`listConfigurableProviders` 两个方法，**Host 面必须对目标 tag 的 `llm` 服务逐项确认签名与返回形状**，不得从客户端 Remote 表反推 |
| 失败被 `try/catch → console.error` 吞掉 | index.js:7-14 | **A2-02**（错误处理纪律）、A1-01 现场记录 | required-if-hit | 迁移后不要让装配故障被兜底 catch 吞掉：Remote/服务调用应让 `ok:false` 的业务分支与装配缺陷分别可见；`gateway/internal` 及未知码不得自动重试 |
| 依赖 `@deepseek-ai/dsh-host-apiproxy` | package.json:17 | **A1-01**（标识符说明：alpha.1 删除该包）+ **R-05**（移除包消费者清单）+ **R-08**（挂掉的旧版本钉） | required | 该包是 rc.2→alpha.1 删除的 5 个包之一；且钉的 `0.0.1-rc.1` 正是 R-08 记录过的"已从注册表消失"的版本形态。必须删依赖，不是升级依赖 |
| 无 DSH peer / engines 声明 | package.json（无 peerDependencies/engines） | **R-08**（peer 下限与预发布匹配语义）+ **A2-03**（peer 精简/补直依赖）+ **precision-checklist**（peer 下限钉到目标 cohort） | required | 当前包对自己"兼容哪个 DSH"零声明：既无 peer 下限，也无 `@deepseek-ai/cordis` 的 `^4.0.1`；旧式 `^0.1.x` 下限在 semver 预发布语义下**不会**匹配 `0.1.2-alpha.2`，必须显式抬到 `^0.1.2-alpha.2` |
| `dsh.bundle.patch` → `./cordis.patch.yml` | package.json:11-15 | **API-08**（组合 ≠ 补丁；bundle patch 必须真的进 tarball）、**API-07**（export ≠ 产物存在） | conditional | 组合行本身形态正确：`- insert: [{id: minimal-llm, name: "@demo/dsh-minimal-llm"}]`，`name` 是**带 scope 的裸包名**，与 `package.json#name` 一致（符合 A1-26 第 2 条的行名规则）。需要验证的是：该 yml 是否被打进 tarball、以及 profile 是否通过 `dsh.profile.bundles` 真正把这一层拉进来 |
| （不适用，仅记录判定） | cordis.patch.yml:1-3 | API-08 负向对照 | — | 文件名含 `patch` 不构成 #1 命中；不要按"源码补丁"去 rebase 任何 hunk |

---

## 5. 迁移计划（**计划**，本次不执行；执行须在副本/分支 + 用户确认后进行）

> 题面要求只读扫描，以下仅为可执行的最小 diff 计划，未落地。

1. **index.js**：`inject` 由 `["apiProxy"]` 改为 `["llm"]`；`ctx.apiProxy.llm.providers()` 改为 `ctx.llm.listProviders()`（签名/返回形状先对目标 tag 确认）；去掉"吞异常只打日志"的结构，让装配失败显式暴露；`ctx.effect(async () => …)` 的异步回调形态不在任何卡片覆盖范围内，挂载时单独确认。
2. **package.json**：删除 `@deepseek-ai/dsh-host-apiproxy`；新增 `peerDependencies`（`@deepseek-ai/cordis: ^4.0.1` + `@deepseek-ai/dsh-*` 下限 `^0.1.2-alpha.2`，无 `-rc` 残留）；按实际 import 补必要 devDependencies；建议补 `files` 以固定打包内容。
3. **cordis.patch.yml**：**不改**（行 id/name 已合规）。若目标 profile 需要该行生效，把本包加入 profile 的 `dsh.profile.bundles`（API-08 的优先级顺序：bundle patch 层 < profile patch < home patch < CLI `--patch`）。
4. **版本**：插件自身 SemVer 单独决定（破坏性 API 变更 → 建议 `0.1.0 → 0.2.0`），**不得**用宿主版本号当插件版本（SKILL 步骤 6）。
5. **双 cohort 分支（仅当仍需支持 rc.2）**：按 R-02 把服务从硬 inject 移出、在调用点用 `ctx.get('llm')` 弱探测并双向回退；**不要**用"放回 inject 等待"来解决（R-07 明确拒绝该做法，旧 cohort 会永久 pending）。

---

## 6. 核心问题：零命中的类别能否说明兼容 0.1.2？

### 判断：不能。而且本 fixture 就是"看起来基本兼容、实际不兼容"的标准反例。

五点依据（逐条都落在本插件身上，不是抽象论证）：

1. **七类扫描在设计上就是启发式，不是证明。** pre-flight 开篇即写明：零命中只意味着"当前模式没检测到"，仍必须查依赖/配置并跑构建、真实挂载、功能冒烟。扫描器能证明的是"存在某类形状"，永远不能证明"不存在语义耦合"。
2. **卡片是 curated（精选），不是完整 API diff。** alpha.2 卡片文件与 references/README 都明说只收录"已确认的、插件可观测的"变更；文件末尾还写：未被卡片覆盖的宿主改动只代表官方材料未声明迁移动作，**不代表没有影响**。所以"没卡片对上" ≠ "没变化"。
3. **本插件最可能坏的地方恰恰不在七类里。** 七类不覆盖**依赖/清单/打包面**，而这里有两个硬伤：依赖了 alpha.1 已删除的包（R-05 清单第 4 项）、依赖钉在被删除且大概率已从注册表消失的 `0.0.1-rc.1`（R-08 记录过这一形态）、以及完全没有 DSH peer 下限。**即使七类全零命中，安装期/解析期就已经不成立。**
4. **零命中的类别，证据强度并不相同，混为一谈会得出错误信心。** 本报告把结论分成三种等级：
   - **结构性零命中**（#2/#5/#6/#7）：源码里根本不存在该类载体（全仓 5 个文件、2 个 JS 文件已逐行读完），可信度最高；
   - **API 存在性零命中**（#4）：靠"没有任何 fs API"成立，强于"字符串没搜到"，但行级搜索无法证明数据流（pre-flight 明确提醒）；
   - **分类判定型零命中**（#1）：是"匹配到了但按 API-08 判为组合层"，属于**解释**，不是**缺席**。三者权重不同，不能统一读作"没问题"。
5. **最主要的失效形态是"静默"，所以"没报错"与"能用"必然分叉。** 硬 `inject: ["apiProxy"]` 在 alpha.1+ 上不是抛错，而是该行永久 `pending (waiting for service: apiProxy)`——启动日志只留下 `web boot: N entries did not activate` 之类的计数（troubleshooting 表首屏即有这一条），插件从不 apply；而且本插件把调用包在 `try/catch → console.error` 里，即便调用真被执行、真失败，退出码和异常面也都是干净的。**这类代码的"绿灯"没有任何信息量。**

### 因此，"兼容"必须分层定义，零命中只对应其中一层

| 层 | 问题 | 零命中能回答吗 | 本插件当前状态 |
|---|---|---|---|
| 声明层 | 包的 peer/依赖是否允许目标 cohort | **不能**（七类不覆盖） | ❌ 依赖已删除包；无 peer 下限 |
| 组合层 | 该行是否真的激活、无 pending | **不能** | ❌ 硬 inject 已删除服务 → 预期 pending |
| API 层 | 调用的服务/方法在目标 tag 是否还存在 | 部分（仅对已收录模式） | ❌ `apiProxy` 已删除 |
| 行为层 | 返回值语义是否仍正确 | **不能**（需真实调用） | 未验证（且日志只截 160 字符，等于没有断言） |

### 在下结论前还需要什么（缺一不可）

1. 先完成 §5 的 1–3 步，再谈兼容——**当前源码在 alpha.2 上不可用，"兼容性评估"的前提尚未成立**；
2. 目标 tag 上 `llm` 服务的方法名/参数/返回形状逐项确认（API-01 要求"逐项确认"，禁止从客户端 Remote 表反推）；
3. 依赖解析闸门：隔离目录 + 冻结锁文件安装，全树只有目标 cohort，无 peer 警告，全仓 grep 5 个移除包名（R-05）；
4. 组合闸门：`dsh --profile <isolated> --dump-config` 无 pending、行 id/name 正确、无重复 loader entry（API-08 / A1-26 / troubleshooting）；
5. 运行闸门：隔离 profile 冷启动，确认 entry 激活、无 `waiting for service:`；注意 API-01 的边界——`examples/face-contracts` 之类只能证明注入与控制流边界，**不能**替代 Loader 激活与真实服务装配；
6. 行为闸门：一次真实的 `listProviders()` 成功往返 + 一次失败分支（失败必须可见，不能被 catch 吞成日志）；
7. **负向对照**：保留一个 `inject: ["apiProxy"]` 的对照构建，确认它表现为 pending。没有这个对照，"启动成功"就无法区分于"什么都没发生"——这正是本题要考的那个陷阱。

---

## 7. 迁移后必做的验证清单（本次只写入报告，不执行）

| 层 | 命令/动作（建议） | 通过判据 |
|---|---|---|
| 静态 | `node --check index.js`；若有类型声明再加 `tsc --noEmit`（需要时 `skipLibCheck: false` 一轮） | 语法/类型通过；无 `apiProxy`、`dsh-host-apiproxy`、`dsh-client-runtime` 残留 |
| 打包 | `npm pack --dry-run --json --ignore-scripts` | `cordis.patch.yml` 与入口都在包内（API-07 / API-08 第 4 条）；未知生命周期脚本不执行 |
| 依赖 | 隔离目录、单一包管理器、冻结锁文件安装；`npm ls @deepseek-ai/*` / `pnpm list --depth 0` | 全部指向 `^0.1.2-alpha.2`；无旧 cohort 混入；无 peer 警告（R-08） |
| 组合 | `dsh --profile <isolated> --dump-config` | 行存在、id/name 正确、无 pending、无 `duplicate loader entry id` |
| 运行 | 隔离 profile 冷启动（可用 `scripts/verify-runtime.mjs`） | entry 激活；无 `waiting for service: apiProxy/remote`；无 `entries did not activate` |
| 行为 | 触发一次 `ctx.llm.listProviders()`；再制造一次失败分支 | 成功路径有结构化结果（不是截断字符串）；失败路径显式可见、不自动重试 |
| 负向 | 对照构建（保留旧 inject） | 必须 pending —— 证明观测手段能区分"没激活"与"正常" |
| Node 矩阵 | 若涉及 `dsh web`：24.9 / 24.12+ / 22 LTS（A2-04 的失败窗口 24.0–24.11.1） | 冷启动均正常 |

---

## 8. 风险、未验证项与回滚

**已确认（静态可证）**

- #3 命中：`apiProxy` 硬注入 + 点分域调用（index.js:3,9）——A1-01；
- 依赖了 alpha.1 删除的包，且钉在 `0.0.1-rc.1`——R-05 / R-08；
- 无 DSH peer 下限、无 `@deepseek-ai/cordis` peer、无 engines——R-08 / precision-checklist；
- `cordis.patch.yml` 属组合层，行名合规——API-08 / A1-26。

**未验证 / 待确认（不得当作已通过）**

- 目标 tag 上 `llm` 服务的 `listProviders()` 签名与返回形状（本任务不允许联网/安装，只能静态推断）；
- `ctx.effect(async () => …)` 的异步回调在 alpha.2 上是否被接受（走廊内无卡片覆盖，属"无卡片 ≠ 无影响"区域）→ 必须靠挂载验证；
- `0.0.1-rc.1` 是否仍可从注册表解析（R-08 只说这类钉会 404/被拒；本次未做注册表查询）→ 由于包已被删除，此项无论结果如何都必须删依赖；
- profile 是否通过 `dsh.profile.bundles` 拉入本 bundle 层（否则 patch 永不生效，且**没有任何错误提示**）；
- Windows/Node 组合、真实 provider 凭据下的行为；
- Mode C baseline：**not collected**（无 scripts/测试/devDeps，无法建立豁免清单）。迁移后若出现红灯，不能归因于基线。

**回滚**：本次未改任何文件（`fixture/` 5 文件哈希已在 §2 记录，可据此校验"逐字节未变"）。将来迁移应在副本/分支进行，先在隔离 profile 验证；回滚只需丢弃该分支 + 删除隔离 profile，不触碰 `fixture/` 与现有 profile。

---

## 9. 建议（非强制能力，不自动采纳）

1. 现在就把"服务是否可达"显式化：不要用 `console.error` 当验收断言；把 `listProviders()` 结果的有效性纳入可观测输出，否则下一次宿主升级仍然是静默失败。
2. 若将来需要同时支持 rc.2 与 alpha.2，按 R-02 用 `ctx.get('llm')` 弱探测 + 回退，而不是硬 inject 双写；并按 R-07 的边界做有界重试（只对可重试、幂等、策略允许的场景）。
3. 若将来加 Web Client 半边，再启用 A1-26 的三 id 一致规则（registration id / 行 name / package.json name）与 A1-25 的 `dsh.client.inject` 重整；当前**不要**预防性地添加 `dsh.client`。
4. `dsh.bundle.patch` 的打包清单校验（API-07/API-08）建议固化成发布前脚本，因为"清单声明了 patch、但 tarball 里没有"是安装成功却启动失败的一类经典缺口。

---

### 附：本报告引用的卡片/条目索引（仅 ID 与用途，不含原文）

- **DSH-0.1.2-A1-01** 主要命中卡片：APIProxy 移除，Host/Web Client 分流迁移（含 `llm.providers` → 两个 Remote 方法；Host 面直接注入领域服务）。
- **DSH-0.1.2-A1-25 / A1-26 / A1-27 / A1-28 / A1-32 / A1-03 / A1-04 / A1-05 / A1-06 / A1-08 / A1-13 / A1-21 / A1-29** 面判定后不适用（客户端半边 / 子进程 / 通道 / 会话视图）。
- **DSH-0.1.2-A1-02 / A2-01** `SessionEvent.ignorable` 先删后复原：无事件生产，不适用（也提醒不要"删了再加"）。
- **DSH-0.1.2-A2-02** Remote 失败语义（`RemoteError`/命名空间化错误码/不要兜底吞异常）：迁移后调用与错误处理纪律。
- **DSH-0.1.2-A2-03 / A2-04 / A2-06 / A2-08** 打包 peer 精简、Node 24 加载器缺陷、`$host` 事实、`sessionProjections` 必需注入：均未命中，仅 A2-03 对依赖面有参考。
- **API-01** Host/Web Client 最小正确形态与"先定面"规则；**API-07** export ≠ 产物存在；**API-08** `cordis.patch.yml` 是组合层及其优先级。
- **rollup R-05** 移除包消费者清单（`dsh-host-apiproxy` 在列）；**R-08** 安装渠道三坑（弃用钉 `0.0.1-rc.1`、peer 预发布匹配语义、镜像/供给链规则）；**R-02 / R-07** 双 cohort 探测与"不要放回 inject 等待"；**R-06** 基线归因（本次 not collected）。
- **pre-flight.md / pre-flight-patterns.json** 七类分类与正则来源；**troubleshooting.md** `waiting for service: apiProxy` 症状行；**precision-checklist.md** peer 下限与落地纪律。


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.