# JUDGE BRIEF · skill.S2-negative-scan

## Criteria (sealed rubric)
- [host-break] (40pt) Locate index.js inject/apiProxy.llm.providers and map the breaking Host service to A1-01. Explain llm injection/listProviders and the dead apiproxy dependency in package.json; a card name alone earns zero.
- [negative-coverage] (20pt) Account for each of the other six categories with scanned-file evidence. session-notes.js is a pure string/array utility; cordis.patch.yml is ordinary plugin composition, not a host-source patch. Interpret a negative patch conclusion in its touchpoint-category context: wording such as no patch file/declaration under the source-patch category can correctly mean no host-source patch, especially when the scan scope includes the composition file. Do not deduct solely because an ordinary composition file has patch in its name, or require an extra explanation of that naming distinction when the category conclusion and scan evidence are correct. Still deduct for an explicit denial that the existing composition file itself exists, for misclassifying its insertion as host-source modification, or for unsupported negative conclusions. Do not invent coupling from filenames.
- [inference-boundary] (20pt) Explain why no static hits cannot establish compatibility: scan coverage is limited and dependency/config/runtime behavior needs separate evidence. Distinguish the existing decisive apiProxy break from the six negative categories.
- [verification-plan] (20pt) Specify post-migration build/typecheck, an isolated target-version cold boot with no pending, and an actual provider call. These are proposed checks, not checks supposedly executed inside this non-runnable fixture.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S2-negative-scan/report.md

# S2 · Negative Scan（只读扫描）报告 — `@demo/dsh-minimal-llm` → dsh `0.1.2-alpha.2`

- 模式：Mode A（inspect，只读）。仅扫描静态副本；不迁移、不安装、不构建、不挂载；`/app/fixture/`（本格 fixture\）逐字节未改动（全部访问为 read/glob/grep 与两个只读脚本）。
- 扫描面：fixture 5 个文件全部通读（README.md、cordis.patch.yml、index.js、package.json、src/session-notes.js），并运行 skill 自带只读 `plan-migration.mjs` 与 `inject-lint.mjs` 作交叉验证。
- fixture\README.md 是夹具自述文档，只作背景读取，不作为结论依据。

## 0. 版本走廊与 from 钉定

- 本插件未在元数据中声明 DSH host 依赖区间：package.json 无 `peerDependencies`，唯一的 `@deepseek-ai/*` 依赖是 `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` —— 这是被依赖包自身的版本，不是 host 走廊（插件发布版本 ≠ DSH host 走廊）。
- 源码自述 "0.1.1-rc.2 style"（index.js:2），据此把工作走廊定为 `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2`，按卡片 frontmatter `from→to` 连接两边：rc.2→alpha.1（DSH-0.1.2-A1-*）、alpha.1→alpha.2（DSH-0.1.2-A2-*）。只读 planner 解析出同一条走廊，无 unsupported gap。
- **pending**：from 是推断值。若该插件实际跑在 0.1.1-rc.1 或更老的 host 上，rc.2 之前的边不在本走廊内（unsupported gap），需按 exact-tag 源码补读缺失边再迁移。迁移前请向维护者确认真实 from host 版本。

## 0.5 配置与依赖清单（pre-flight step 0）

| 项 | 现状 | 备注 |
|---|---|---|
| 插件版本 | `0.1.0`（private） | 迁移后单独做 SemVer bump |
| 形态 | ESM，`main: index.js`，`exports` 含 `./cordis.patch.yml` | 无 `dsh.client` → 非 Web Client 插件，面为 Host 平面普通 Cordis 插件 |
| 依赖 | `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` | **alpha.1 删除该包**（DSH-0.1.2-A1-01）→ 必须移除 |
| peers / engines | 无 | inject-lint 判 `FIX-REQUIRED`：缺 `@deepseek-ai/cordis@^4.0.1` peer（precision-checklist 的 alpha.2 队列 peer floor，恰为 `^4.0.1` 不是 `^4.0.2`）|
| 锁文件 | 无 | 依赖解析层无锁可查 |
| 标准清单 | 无 `dsh-plugin.json` | 未采用社区标准清单 |
| 组合 | `cordis.patch.yml`：`- insert: {id: minimal-llm, name: "@demo/dsh-minimal-llm"}`，经 `dsh.bundle.patch` 发布 | 按 API-08 属 Profile/Bundle 组合层，不是源码补丁 |
| 安装轨道 | 静态副本，dsh 未安装 | 无 registry/Git 安装身份可查 |

## 1. 七类 touchpoint 命中表

| # | 类别 | 命中 | 证据 |
|---|---|---:|---|
| 1 | 源码补丁 / monkey patch | 否 | 全部文件无 `patchedDependencies`/`patch-package`/`DSH_HARNESS_SOURCE_ROOT`/patch-surface。`cordis.patch.yml` 仅文件名含 "patch"，内容是 `- insert` Loader 行，按 **API-08** 归为组合层，不计命中 |
| 2 | 内部事件 / 持久化事件 | 否 | 无 `SessionEvent`/`ctx.on(`/`subscribe(`/`session/event`/`tool/code-dispatch`。`src/session-notes.js` 文件名带 "session" 但内容纯工具函数（trim/replace/slice、数组分块），无 import、无 ctx —— 零命中成立 |
| 3 | 内部服务探针 / Remote | **是** | index.js:3 `export const inject = ["apiProxy"]`；index.js:9 `ctx.apiProxy.llm.providers()`；index.js:2 注释自述 0.1.1-rc.2 dot-domain 风格；package.json:17 依赖 `dsh-host-apiproxy`。planner 独立确认：#3 唯一命中（index.js，pattern 1），其余六类 0/0 |
| 4 | 直接读写 host 目录 | 否 | 无 `DSH_HOME`/`.dsh`/`profiles/`/`homedir(`/`readFile`/`writeFile`/`mkdir` |
| 5 | 内部 UI / 命令 / 工具注册 | 否 | 无 `registerCommand`/`registerView`/`contributes`/`ctx.tools`/`dsh-client-runtime`/`slots`/`useSession`/`__ModuleLoader__` |
| 6 | 自定义 HTTP/WS/RPC/DOM/CSS 通道 | 否 | 无 `createServer`/`WebSocket`/`router.*`/`/api/`/`127.0.0.1`/`MutationObserver`/`insertRule` |
| 7 | 子进程 / stdout/stderr 解析 | 否 | 无 `node:child_process`/`spawn`/`exec`/`execa`/`headless`/`--profile`。`console.error` 只是插件自身日志，不是解析 host 输出 |

结论：1/7 命中（#3），6/7 零命中。

## 2. 命中 → 变更卡映射（按实际 face 裁剪）

planner 按 touchpoint 类给出 18 张候选卡（#3 类全量），按 skill 第 4 步必须按实际 face 裁剪；本插件是 Host 平面极小 Cordis 插件，真正落到代码上的只有 1 张必改卡 + 依赖/组合两类外围：

| 触点 | 卡 ID | 要点 | 对本插件的动作 |
|---|---|---|---|
| index.js:3 / index.js:9（`apiProxy` 服务、`llm.providers()`）| **DSH-0.1.2-A1-01**（breaking / required-if-hit；配套 ledger **API-01**）| alpha.1 删除 `@deepseek-ai/dsh-host-apiproxy` 与 `apiProxy` 服务键；Host 平面消费者**跳过 Client 网关、直接注入背后领域服务**（字段记录：误改成 `inject: ["remote"]` 会 `pending (waiting for service: remote)` 永久挂起）；`llm.providers` 拆为 `listProviders` + `listConfigurableProviders` | `inject` 改 `['llm']`；`ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`（需要"可配置目录"再补 `listConfigurableProviders`；确切服务键/方法名以目标 tag 实现与声明为准，generated declarations 是权威）；同步删除 `dsh-host-apiproxy` 依赖 |
| package.json 依赖 / peer 队列 | **R-01**（process；凡动依赖队列必引）+ precision-checklist「Peer version floors」 | `@deepseek-ai/cordis` peer 恰为 `^4.0.1`；`@deepseek-ai/dsh-*` peer 落在目标队列；不留旧 provider、不留裸 `cordis` 键 | 补 `peerDependencies: {"@deepseek-ai/cordis": "^4.0.1"}` 及实际触及的 dsh 包；inject-lint 复跑至 `OK` |
| `dsh.bundle.patch` / `exports["./cordis.patch.yml"]` | **API-08**（组合层语义）| `cordis.patch.yml` 是 Profile/Bundle 组合覆盖，不是源码补丁；bundle patch 必须指向包内安全相对路径并真实进 tarball；同 id 的 `config` 是整体替换 | 保持现状；迁移后用 `npm pack --dry-run` 类检查确认 patch 进产物，隔离 profile `--dump-config` 确认 `minimal-llm` 行解析 |
| 错误处理（仅当改走 Client Remote 面）| DSH-0.1.2-A2-02 / API-02 —— **当前不命中** | alpha.2 起 Remote 失败为 `RemoteError`、错误码带命名空间，`result.ok` 分支优先 | Host 平面直连领域服务不经过 `RemoteResult`；列为条件卡，勿顺手改 |

人工复核（planner 另列 manual-review）：A1-12 / A1-23（隐私默认值：插件包名上报、telemetry `FEEDBACK_ONLY` —— 部署/组合层决策，插件代码无需改）；A2-03（包裁剪 peer，安装层验证）；A2-08（自组合 profile 缺 `sessionProjections` 会 pending —— 只影响自组合 host，验证时看 `--dump-config`）；A2-04（Node 24.0–24.11.1 loader 缺陷 —— 验证矩阵选点）；A1-24 不命中（无 `@earendil-works/pi-ai` 直接依赖）。能力卡（A1-09/A1-10/A1-11）为建议性，按 skill 规则不自动采纳。

**先行结论：当前源码与 0.1.2-alpha.2 不兼容** —— 单 #3 一命中（`apiProxy` 移除）已是必改的破坏性变更；六类零命中不能把整体结论拉成"兼容"。

## 3. 核心问题：零命中的类别能否证明与 0.1.2 兼容？—— 不能

判断：**七类中的零命中不能作为"本插件与 0.1.2 兼容"的证据**。它们只说明"当前模式没扫到"。兼容结论必须由依赖/配置核对 + 构建/类型检查 + 真实挂载 + 冒烟共同给出。

依据：

1. **skill 自己的定义就是"启发式，不是证明"**：pre-flight.md 开头明确 "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."；plan-migration 的 Limits 同样写明 "zero hits do not prove public-contract-only coupling"。
2. **行级正则看不见数据流与动态面**：pre-flight #4 明说 "A line-level search cannot reveal data flow"；planner 不解析 TypeScript 数据流与动态 import。改名调用、别名转发、模板串拼接的服务键都可能漏报。
3. **卡片是精选清单，不是完整 API diff**：两个卡片文件头部均如此声明；alpha.2 卡文件末尾还写明"没有卡片只代表官方材料未列迁移动作，不代表没有影响"。零命中连"卡片覆盖不到的变更"都证明不了。
4. **本 fixture 自己就是反例**：破坏性事实一半在七类扫描之外 —— `package.json` 里 `dsh-host-apiproxy` 是被删除的包（依赖清单层），peer floor 缺 `@deepseek-ai/cordis@^4.0.1`（inject-lint 直接判 `FIX-REQUIRED`，而当时七类里六类零命中）。两者都不产生任何一类命中，却都必须改。
5. **真正的坑在运行时才爆**：A1-01 字段记录的 `inject: ["remote"]` 误迁移会以 `pending (waiting for service: remote)` 永久挂起（静态与类型检查均无报错）；A2-08 的 pending 服务、A2-04 的 Node loader 缺陷同理。只能靠真实 profile 冷启动 + `--dump-config` 暴露。
6. **from 本身未钉死**（`0）：零命中结论连"对哪一版零命中"都带着未验证前提。

还缺什么才能下兼容结论（= 迁移后必做的验证步骤；本任务只写不跑）：

1. 钉死 from/to 精确 tag（确认真实运行 host；若早于 rc.2，补读缺失边）；
2. 依赖层：移除 `dsh-host-apiproxy`、补 peer floor（R-01、precision-checklist）；有锁文件后全锁扫描无旧队列残留（rollup 分层清单 1）；
3. 静态层：build + typecheck（真实 Context/生成声明，不用 `any`；必要时 `skipLibCheck: false` 做一次诊断）+ inject-lint 至 `OK`（rollup 清单 2）；
4. 命中面单测：`listProviders()` 成功分支 + 一个业务失败 + 取消/超时语义（A1-01 验证要求；rollup 清单 3）；
5. 运行时：隔离 profile 冷启动（或 skill 的 `verify-runtime.mjs`——注意它非只读、会安装并执行插件代码，只在一次性容器里跑），`--dump-config` 无 `minimal-llm` pending、无 `waiting for service: llm`，入口 active（rollup 清单 4）；
6. 行为层：跑通一次"列 providers"核心路径（消息→工具→回复或等价专用流程）；
7. 包装层：exit code、stdout/stderr 归属、取消与 teardown（skill「Validation and reporting」6 层）。

## 4. Skipped / 未做

- 未执行 build/typecheck/test：静态副本、dsh 未安装，任务亦禁止安装与执行（pre-existing 基线：not collected）。
- 未做任何 fixture 写入或迁移（任务限定只读）。
- 未运行 `verify-runtime.mjs`（非只读；且 POSIX-only）。
- 能力卡未采纳（按 skill 规则）。

## 5. Pending / 残余风险

- from-tag 为推断值（`0）；若真实 host 早于 rc.2，走廊存在未卡化缺口。
- `ctx.llm.*` 确切服务键/方法名须在目标 tag 复核（卡片表格自述 generated declarations are authoritative）。
- 无锁文件、无测试、无 CI —— "零测试面"本身是残余风险；`src/session-notes.js` 为纯工具函数但无任何测试覆盖。
- index.js 旧日志文案（"旧 API（apiProxy）路径"）迁移后属文案残留，建议同步（非阻塞）。

## 6. Rollback

只读任务，无写入、无回滚需求；fixture 未改动，可复核哈希。

## run-stats

- toolcalls 总数：30（read 12 / grep 3 / glob 1 / pwsh 2 / write 4 / send_message 1，另 1 次空操作 run_code；分布于 19 个 run_code 批次）
- token 用量：n/a（harness 不向 solver 暴露）
- 完成时间：2026-10-21 12:33 +08:00（Asia/Shanghai）


#### FILE: report.md

# S2 · Negative Scan（只读扫描）报告 — `@demo/dsh-minimal-llm` → dsh `0.1.2-alpha.2`

- 模式：Mode A（inspect，只读）。仅扫描静态副本；不迁移、不安装、不构建、不挂载；`/app/fixture/`（本格 fixture\）逐字节未改动（全部访问为 read/glob/grep 与两个只读脚本）。
- 扫描面：fixture 5 个文件全部通读（README.md、cordis.patch.yml、index.js、package.json、src/session-notes.js），并运行 skill 自带只读 `plan-migration.mjs` 与 `inject-lint.mjs` 作交叉验证。
- fixture\README.md 是夹具自述文档，只作背景读取，不作为结论依据。

## 0. 版本走廊与 from 钉定

- 本插件未在元数据中声明 DSH host 依赖区间：package.json 无 `peerDependencies`，唯一的 `@deepseek-ai/*` 依赖是 `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` —— 这是被依赖包自身的版本，不是 host 走廊（插件发布版本 ≠ DSH host 走廊）。
- 源码自述 "0.1.1-rc.2 style"（index.js:2），据此把工作走廊定为 `dsh-v0.1.1-rc.2 → dsh-v0.1.2-alpha.2`，按卡片 frontmatter `from→to` 连接两边：rc.2→alpha.1（DSH-0.1.2-A1-*）、alpha.1→alpha.2（DSH-0.1.2-A2-*）。只读 planner 解析出同一条走廊，无 unsupported gap。
- **pending**：from 是推断值。若该插件实际跑在 0.1.1-rc.1 或更老的 host 上，rc.2 之前的边不在本走廊内（unsupported gap），需按 exact-tag 源码补读缺失边再迁移。迁移前请向维护者确认真实 from host 版本。

## 0.5 配置与依赖清单（pre-flight step 0）

| 项 | 现状 | 备注 |
|---|---|---|
| 插件版本 | `0.1.0`（private） | 迁移后单独做 SemVer bump |
| 形态 | ESM，`main: index.js`，`exports` 含 `./cordis.patch.yml` | 无 `dsh.client` → 非 Web Client 插件，面为 Host 平面普通 Cordis 插件 |
| 依赖 | `@deepseek-ai/dsh-host-apiproxy: 0.0.1-rc.1` | **alpha.1 删除该包**（DSH-0.1.2-A1-01）→ 必须移除 |
| peers / engines | 无 | inject-lint 判 `FIX-REQUIRED`：缺 `@deepseek-ai/cordis@^4.0.1` peer（precision-checklist 的 alpha.2 队列 peer floor，恰为 `^4.0.1` 不是 `^4.0.2`）|
| 锁文件 | 无 | 依赖解析层无锁可查 |
| 标准清单 | 无 `dsh-plugin.json` | 未采用社区标准清单 |
| 组合 | `cordis.patch.yml`：`- insert: {id: minimal-llm, name: "@demo/dsh-minimal-llm"}`，经 `dsh.bundle.patch` 发布 | 按 API-08 属 Profile/Bundle 组合层，不是源码补丁 |
| 安装轨道 | 静态副本，dsh 未安装 | 无 registry/Git 安装身份可查 |

## 1. 七类 touchpoint 命中表

| # | 类别 | 命中 | 证据 |
|---|---|---:|---|
| 1 | 源码补丁 / monkey patch | 否 | 全部文件无 `patchedDependencies`/`patch-package`/`DSH_HARNESS_SOURCE_ROOT`/patch-surface。`cordis.patch.yml` 仅文件名含 "patch"，内容是 `- insert` Loader 行，按 **API-08** 归为组合层，不计命中 |
| 2 | 内部事件 / 持久化事件 | 否 | 无 `SessionEvent`/`ctx.on(`/`subscribe(`/`session/event`/`tool/code-dispatch`。`src/session-notes.js` 文件名带 "session" 但内容纯工具函数（trim/replace/slice、数组分块），无 import、无 ctx —— 零命中成立 |
| 3 | 内部服务探针 / Remote | **是** | index.js:3 `export const inject = ["apiProxy"]`；index.js:9 `ctx.apiProxy.llm.providers()`；index.js:2 注释自述 0.1.1-rc.2 dot-domain 风格；package.json:17 依赖 `dsh-host-apiproxy`。planner 独立确认：#3 唯一命中（index.js，pattern 1），其余六类 0/0 |
| 4 | 直接读写 host 目录 | 否 | 无 `DSH_HOME`/`.dsh`/`profiles/`/`homedir(`/`readFile`/`writeFile`/`mkdir` |
| 5 | 内部 UI / 命令 / 工具注册 | 否 | 无 `registerCommand`/`registerView`/`contributes`/`ctx.tools`/`dsh-client-runtime`/`slots`/`useSession`/`__ModuleLoader__` |
| 6 | 自定义 HTTP/WS/RPC/DOM/CSS 通道 | 否 | 无 `createServer`/`WebSocket`/`router.*`/`/api/`/`127.0.0.1`/`MutationObserver`/`insertRule` |
| 7 | 子进程 / stdout/stderr 解析 | 否 | 无 `node:child_process`/`spawn`/`exec`/`execa`/`headless`/`--profile`。`console.error` 只是插件自身日志，不是解析 host 输出 |

结论：1/7 命中（#3），6/7 零命中。

## 2. 命中 → 变更卡映射（按实际 face 裁剪）

planner 按 touchpoint 类给出 18 张候选卡（#3 类全量），按 skill 第 4 步必须按实际 face 裁剪；本插件是 Host 平面极小 Cordis 插件，真正落到代码上的只有 1 张必改卡 + 依赖/组合两类外围：

| 触点 | 卡 ID | 要点 | 对本插件的动作 |
|---|---|---|---|
| index.js:3 / index.js:9（`apiProxy` 服务、`llm.providers()`）| **DSH-0.1.2-A1-01**（breaking / required-if-hit；配套 ledger **API-01**）| alpha.1 删除 `@deepseek-ai/dsh-host-apiproxy` 与 `apiProxy` 服务键；Host 平面消费者**跳过 Client 网关、直接注入背后领域服务**（字段记录：误改成 `inject: ["remote"]` 会 `pending (waiting for service: remote)` 永久挂起）；`llm.providers` 拆为 `listProviders` + `listConfigurableProviders` | `inject` 改 `['llm']`；`ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`（需要"可配置目录"再补 `listConfigurableProviders`；确切服务键/方法名以目标 tag 实现与声明为准，generated declarations 是权威）；同步删除 `dsh-host-apiproxy` 依赖 |
| package.json 依赖 / peer 队列 | **R-01**（process；凡动依赖队列必引）+ precision-checklist「Peer version floors」 | `@deepseek-ai/cordis` peer 恰为 `^4.0.1`；`@deepseek-ai/dsh-*` peer 落在目标队列；不留旧 provider、不留裸 `cordis` 键 | 补 `peerDependencies: {"@deepseek-ai/cordis": "^4.0.1"}` 及实际触及的 dsh 包；inject-lint 复跑至 `OK` |
| `dsh.bundle.patch` / `exports["./cordis.patch.yml"]` | **API-08**（组合层语义）| `cordis.patch.yml` 是 Profile/Bundle 组合覆盖，不是源码补丁；bundle patch 必须指向包内安全相对路径并真实进 tarball；同 id 的 `config` 是整体替换 | 保持现状；迁移后用 `npm pack --dry-run` 类检查确认 patch 进产物，隔离 profile `--dump-config` 确认 `minimal-llm` 行解析 |
| 错误处理（仅当改走 Client Remote 面）| DSH-0.1.2-A2-02 / API-02 —— **当前不命中** | alpha.2 起 Remote 失败为 `RemoteError`、错误码带命名空间，`result.ok` 分支优先 | Host 平面直连领域服务不经过 `RemoteResult`；列为条件卡，勿顺手改 |

人工复核（planner 另列 manual-review）：A1-12 / A1-23（隐私默认值：插件包名上报、telemetry `FEEDBACK_ONLY` —— 部署/组合层决策，插件代码无需改）；A2-03（包裁剪 peer，安装层验证）；A2-08（自组合 profile 缺 `sessionProjections` 会 pending —— 只影响自组合 host，验证时看 `--dump-config`）；A2-04（Node 24.0–24.11.1 loader 缺陷 —— 验证矩阵选点）；A1-24 不命中（无 `@earendil-works/pi-ai` 直接依赖）。能力卡（A1-09/A1-10/A1-11）为建议性，按 skill 规则不自动采纳。

**先行结论：当前源码与 0.1.2-alpha.2 不兼容** —— 单 #3 一命中（`apiProxy` 移除）已是必改的破坏性变更；六类零命中不能把整体结论拉成"兼容"。

## 3. 核心问题：零命中的类别能否证明与 0.1.2 兼容？—— 不能

判断：**七类中的零命中不能作为"本插件与 0.1.2 兼容"的证据**。它们只说明"当前模式没扫到"。兼容结论必须由依赖/配置核对 + 构建/类型检查 + 真实挂载 + 冒烟共同给出。

依据：

1. **skill 自己的定义就是"启发式，不是证明"**：pre-flight.md 开头明确 "This is a heuristic scan, not proof of compatibility. Zero hits across the seven classes only means 'not detected by the current patterns'; you must still check dependencies/configuration and run a build, a real mount, and functional smoke tests."；plan-migration 的 Limits 同样写明 "zero hits do not prove public-contract-only coupling"。
2. **行级正则看不见数据流与动态面**：pre-flight #4 明说 "A line-level search cannot reveal data flow"；planner 不解析 TypeScript 数据流与动态 import。改名调用、别名转发、模板串拼接的服务键都可能漏报。
3. **卡片是精选清单，不是完整 API diff**：两个卡片文件头部均如此声明；alpha.2 卡文件末尾还写明"没有卡片只代表官方材料未列迁移动作，不代表没有影响"。零命中连"卡片覆盖不到的变更"都证明不了。
4. **本 fixture 自己就是反例**：破坏性事实一半在七类扫描之外 —— `package.json` 里 `dsh-host-apiproxy` 是被删除的包（依赖清单层），peer floor 缺 `@deepseek-ai/cordis@^4.0.1`（inject-lint 直接判 `FIX-REQUIRED`，而当时七类里六类零命中）。两者都不产生任何一类命中，却都必须改。
5. **真正的坑在运行时才爆**：A1-01 字段记录的 `inject: ["remote"]` 误迁移会以 `pending (waiting for service: remote)` 永久挂起（静态与类型检查均无报错）；A2-08 的 pending 服务、A2-04 的 Node loader 缺陷同理。只能靠真实 profile 冷启动 + `--dump-config` 暴露。
6. **from 本身未钉死**（`0）：零命中结论连"对哪一版零命中"都带着未验证前提。

还缺什么才能下兼容结论（= 迁移后必做的验证步骤；本任务只写不跑）：

1. 钉死 from/to 精确 tag（确认真实运行 host；若早于 rc.2，补读缺失边）；
2. 依赖层：移除 `dsh-host-apiproxy`、补 peer floor（R-01、precision-checklist）；有锁文件后全锁扫描无旧队列残留（rollup 分层清单 1）；
3. 静态层：build + typecheck（真实 Context/生成声明，不用 `any`；必要时 `skipLibCheck: false` 做一次诊断）+ inject-lint 至 `OK`（rollup 清单 2）；
4. 命中面单测：`listProviders()` 成功分支 + 一个业务失败 + 取消/超时语义（A1-01 验证要求；rollup 清单 3）；
5. 运行时：隔离 profile 冷启动（或 skill 的 `verify-runtime.mjs`——注意它非只读、会安装并执行插件代码，只在一次性容器里跑），`--dump-config` 无 `minimal-llm` pending、无 `waiting for service: llm`，入口 active（rollup 清单 4）；
6. 行为层：跑通一次"列 providers"核心路径（消息→工具→回复或等价专用流程）；
7. 包装层：exit code、stdout/stderr 归属、取消与 teardown（skill「Validation and reporting」6 层）。

## 4. Skipped / 未做

- 未执行 build/typecheck/test：静态副本、dsh 未安装，任务亦禁止安装与执行（pre-existing 基线：not collected）。
- 未做任何 fixture 写入或迁移（任务限定只读）。
- 未运行 `verify-runtime.mjs`（非只读；且 POSIX-only）。
- 能力卡未采纳（按 skill 规则）。

## 5. Pending / 残余风险

- from-tag 为推断值（`0）；若真实 host 早于 rc.2，走廊存在未卡化缺口。
- `ctx.llm.*` 确切服务键/方法名须在目标 tag 复核（卡片表格自述 generated declarations are authoritative）。
- 无锁文件、无测试、无 CI —— "零测试面"本身是残余风险；`src/session-notes.js` 为纯工具函数但无任何测试覆盖。
- index.js 旧日志文案（"旧 API（apiProxy）路径"）迁移后属文案残留，建议同步（非阻塞）。

## 6. Rollback

只读任务，无写入、无回滚需求；fixture 未改动，可复核哈希。

## run-stats

- toolcalls 总数：30（read 12 / grep 3 / glob 1 / pwsh 2 / write 4 / send_message 1，另 1 次空操作 run_code；分布于 19 个 run_code 批次）
- token 用量：n/a（harness 不向 solver 暴露）
- 完成时间：2026-10-21 12:33 +08:00（Asia/Shanghai）


#### FILE: tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. run_code（空操作占位，未访问文件系统）
3. glob pattern=**/* path=E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture
4. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\README.md
5. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\cordis.patch.yml
6. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\index.js
7. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\package.json
8. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\src\session-notes.js
9. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
10. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.1.md
11. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.2.md
12. grep pattern=^#+  path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md
13. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md offset=68 limit=121
14. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md offset=535 limit=36
15. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md offset=693 limit=80
16. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\scripts\README.md
17. pwsh node E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\scripts\plan-migration.mjs --root E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture --from dsh-v0.1.1-rc.2 --to dsh-v0.1.2-alpha.2（只读 planner，exit 0）
18. pwsh node E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\scripts\inject-lint.mjs E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture（只读 lint，exit 0，verdict=FIX-REQUIRED）
19. grep pattern=cordisOk|cordisPeer|FIX-REQUIRED path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\scripts\inject-lint.mjs
20. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\precision-checklist.md
21. grep pattern=^#+  path=E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
22. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md offset=92 limit=21
23. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md offset=174 limit=30
24. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md offset=333 limit=30
25. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\tool-transcript.txt
26. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\transcript-manifest.txt
27. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\S2-negative-scan\report.md
28. write E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\report.md（与 27 同内容副本）
29. read E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\S2-negative-scan\report.md（校验非空）
30. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（结果汇报）


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.1.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.2-alpha.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\api-migration-0.1.2-alpha.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\precision-checklist.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\rollup-0.1.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\scripts\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\scripts\plan-migration.mjs
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\scripts\inject-lint.mjs
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight-patterns.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\cordis.patch.yml
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\index.js
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\package.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\fixture\src\session-notes.js
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\S2-negative-scan\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S2-negative-scan\agent-output\report.md


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.