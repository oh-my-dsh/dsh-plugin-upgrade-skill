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
#### FILE: S1-static-scan/S1-static-scan-report.md

# S1 · 静态触点扫描报告（只读）

**对象**：`fixture/`（dsh 0.1.1 时代的旧插件源码，静态样例，不可编译/不可执行）
**走廊**：`dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2`（两段边：rc.2→alpha.1 的 28 张 `DSH-0.1.2-A1` 卡 + alpha.1→alpha.2 的 8 张 `DSH-0.1.2-A2` 卡）
**模式**：Mode A/C 的只读准备阶段（仅扫描 + 卡片映射）。**未做**：任何写入 `fixture/`、任何安装/迁移/构建/启动。

---

## 0. 扫描范围、身份与只读证据

### 0.1 实际扫描的文件（全部 6 个，无遗漏）

| 文件 | 行数 | 角色 |
|---|---:|---|
| `README.md` | 16 | 样例说明（非插件代码） |
| `package.json` | 9 | 包清单 |
| `cordis.patch.yml` | 6 | Profile 组合行 |
| `patch.yml` | 6 | 源码 patch 面声明 |
| `src/index.ts` | 68 | 插件主体（七类触点的主要载体） |
| `scripts/apply-patch.mjs` | 19 | patch 应用/headless 包装脚本 |

排除目录：无 `node_modules`/`vendor`/`.git`/生成产物/测试/CI 配置（仓库内不存在）。因此"全量 tracked 源"= 上述 6 个文件。

### 0.2 只读指纹（扫描前后一致，用于证明未修改）

```
README.md                1364  84b8fd89d9e05abcc4543381a5c50d81fd0f57344879d8bf560dcf3495e79800
package.json              161  af1e498ca6f80b65329c7a1dd017d97761391d7032cf7d02f3f44832f920446e
cordis.patch.yml          159  a9feaa3ec0f63cedf8e84416f532b53086a7c4ef508dbc280957e79f16dd9668
patch.yml                 214  de622598fc298f54f2f86ee48734c0c615f02bc9bab6fe9ba234339e6c595b3b
src/index.ts             2562  429979274fe9776e22809e0a2725c88c70b7b3127926a8efcc0e4335d7c086d0
scripts/apply-patch.mjs   752  4d6744baf58fe05524bdcf23a5e289a6292e059bb2272342a5a0448e091221f0
```

### 0.3 身份与清单盘点（结论先说）

- 面：**Host 面 / 普通 Cordis 插件**。理由：`package.json` 无 `dsh.client`、无 `dsh` 清单块、无客户端 bundle；`activate(ctx)` 走宿主 Context。**但**第 5 类命中了一个 `/internal` 的会话视图类，说明它同时借用了 Web Client/Host UI 的内部实现——面必须逐条判定，不能整体按 Host 处理。
- `package.json`：`name: legacy-plugin`、`version: 0.1.1`、`private: true`、`type: module`、一个脚本 `apply-patch`。**无** `peerDependencies`、`engines`、`dsh-plugin.json`、lockfile。
- **版本坐标不要混淆**：`0.1.1` 是插件自身版本；走廊两端的 `0.1.1-rc.2 / 0.1.2-alpha.2` 是 **DSH 宿主**版本。二者不是同一坐标，迁移后也不得把宿主版本当插件发布版本。
- 组合行 `cordis.patch.yml` 的 `id`/`name` 均为裸包名 `legacy-plugin`，与 `package.json#name` 一致——这满足了 `A1-26` 的"三 id 一致"中的第 2 条；由于没有客户端 half，另两条不适用（记作正面证据，不是命中）。

### 0.4 基线（R-06）无法采集，必须明说

样例没有 build/typecheck/test 脚本（只有 `apply-patch`），且其 `README` 明说"不可编译是设计如此"。因此：

- **未采集基线**，不存在"豁免清单"；
- 本报告不给出任何"构建通过/类型检查通过"的结论，也不得据此判断迁移是否引入回归；
- 后续真实迁移必须先在与目标无关的旧依赖状态下自建基线，再谈归因。

---

## 1. 七类触点总览

| # | 类别 | 是否命中 | 命中位置 | 命中的具体耦合点 | 走廊卡片（终态） |
|---:|---|---|---|---|---|
| 1 | 源码 patch / monkey patch | **命中** | `patch.yml:3-6`；`cordis.patch.yml:5-6`；`scripts/apply-patch.mjs:5-9` | 对宿主源文件 `src/session/view/SessionView.ts` 做函数级替换（`renderSessionView`→`renderSessionViewPatched`），并用 `DSH_HARNESS_SOURCE_ROOT` 定位宿主源码树 | **A1-03**（+ 台账 API-08 分类；清单归属 API-08 §4） |
| 2 | 内部/持久化事件 | **命中** | `src/index.ts:15-19`（生产）；`src/index.ts:20-22`（观察） | 生产第三方持久事件 `legacy/informational-note` 并携带 `ignorable: true`；同时订阅 `session/event` | **A2-01**（终态保留）；**A1-02 已被折叠**（见 §2.1）；写入面缺口见台账 API-05 |
| 3 | 内部服务/Remote | **命中** | `src/index.ts:25-28`；`src/index.ts:29-32` | `ctx.get('apiProxy')` 两次 + `apiProxy.invoke('session.rename')` / `('llm.providers')` | **A1-01**（主）；若真要走 Remote 则 **A2-02** 条件适用；台账 API-01/API-02 |
| 4 | 宿主目录 | **命中** | `src/index.ts:36-37` | `join(homedir(),'.dsh','profiles','default')` 固定路径 + `writeFileSync` 直写 profile 目录 | **A1-04**（主） |
| 5 | 内部 UI/命令/工具 | **命中** | `src/index.ts:10`；`src/index.ts:41-43` | `@deepseek-ai/dsh-session-view/internal` 深路径导入；`ctx.contributes.registerCommand('legacy.openView')` 返回内部 `SessionView` 实例 | **A1-03**（主）；台账 API-07（export≠产物）；公共命令面待确认 |
| 6 | 自定义通道 | **命中** | `src/index.ts:4`；`src/index.ts:47-53`（`:54` 仅 `void` 引用） | 自建 `node:http` 服务器，`listen(43121,'127.0.0.1')`，注释声明 `/api/legacy`，绕过 Host Gateway 鉴权 | **A1-08**（主）；**A1-19**（条件，接受/启动侧） |
| 7 | 子进程/输出解析 | **命中** | `src/index.ts:57-67`；`scripts/apply-patch.mjs:12-18` | `spawn('dsh',['--profile','headless',prompt])` + 把 stdout 当 JSONL 逐行 `JSON.parse` 找 `type:'final'`；`execFileSync` 版同样假设；不看 exit code/stderr/取消 | **A1-05**（主）；**A1-04**（次）；**A2-04** 条件 |

**无命中类别：0 个。** 七类全部命中，因此"空类别三件套（扫描文件/排除项/为何不能反推）"没有直接对象；等价纪律改在**卡片子面**上执行，见 §3。

---

## 2. 逐类详述

### 2.1 走廊折叠：先算终态，再动源码

走廊里唯一构成"中间删除→目标恢复"的字段是 `SessionEvent.ignorable`：

- `DSH-0.1.2-A1-02`（alpha.1，breaking，#2）：alpha.1 短暂移除该标记，适用级别写的是 **required-if-target-is-alpha.1**；
- `DSH-0.1.2-A2-01`（alpha.2，fix，#2）：恢复信封/持久化/重载/传输对标记的保留语义。

**终态处理**：目标就是 alpha.2，所以 `ignorable` 保留，**不得**为 alpha.1 而"先删再补"，也不得因为看过 A1-02 就加"降级分支"。A1-02 在本走廊里只剩历史解释价值，**不计入生效卡片**；生效卡片是 A2-01。

但折叠后的真正边界比"字段回来了"更窄，台账 API-05 写得很清楚：恢复的只是**信封/持久化层对既有标记的保留**，公开的活写入口仍不能写入该字段。所以：

- 若该事件通过 `Session.append` 一类公开入口落盘 → 活写成功、冷加载整会话被拒（静默写/响亮读，一次 live 冒烟测不出来）；
- 本样例的写面**无法静态确定**（见 2.2）→ 记为**能力缺口 + 待确认**，正确的迁移动作是改用插件自有 sidecar/store，而不是用 cast 伪造 `ignorable`。

其余卡片不构成 remove/restore 复合边：`A2-02` 只改错误的**形态**（`RemoteResult` 的调用形状 rc.2 起就没变），不是"删了又恢复"。

### 2.2 #2 内部/持久化事件 — 命中

**证据**

```ts
// src/index.ts:13-19  生产（第三方持久事件，带 ignorable 标记）
ctx.emit('session/event', {
  type: 'legacy/informational-note',
  ignorable: true,
  payload: { text: 'fixture' },
})
// src/index.ts:20-22  纯观察
ctx.on('session/event', (event: any /* SessionEvent */) => { ... })
```

**耦合点**：事件名 `legacy/informational-note` 不在任何第一方词表内 → 属"未知持久事件"，其可重载性完全取决于信封上的 `ignorable`；字段名用的是 `type`（rc.2 契约已是 `type`，不是 `kind`），这部分**无需**改动（正面证据）。

**会怎么炸**：alpha.1 一代丢失标记 → 老读者把它当强制事件，冷重载整会话被拒；alpha.2 恢复保留后，**仍**存在"生产者写不进去"的缺口（API-05），症状同上，只是触发点从"版本丢字段"变成"写入面不完整"。

**目标写法**：终态保留 `ignorable: true`，仅用于"没有该插件也能正确重建会话"的辅助信息；持久写入改走插件自有 sidecar/store；`ignorable` 不是消费侧过滤指令，事件重载后仍在事件流里。

**卡片**：`DSH-0.1.2-A2-01`（主，required-if-hit）；`DSH-0.1.2-A1-02`（折叠，不生效）；台账 API-05。已排除：`A1-06`（无 `tool/code-dispatch*`、无 PTC 词表）、`A1-14`（未启用 session-log 上传）、`A1-07`（无 web_fetch 策略）。

**待确认**：样例没有出现 `Session.append` 或任何持久化 seam，`ctx.emit` 也不是官方持久化入口 → 真实落盘路径必须到目标 tag 现场确认，不能按"字段还在"就判定通过。

### 2.3 #1 源码 patch — 命中

**证据**

```yaml
# patch.yml:2-6
surface:
  - target: src/session/view/SessionView.ts
    replacements:
      - find: export function renderSessionView
        replace: export function renderSessionViewPatched
```

`cordis.patch.yml:2-6` 用行内 `patch: [- patch.yml]` 把这个面挂到组合行上；`scripts/apply-patch.mjs:5-9` 用 `DSH_HARNESS_SOURCE_ROOT` 定位宿主源码树并读取该面（脚本只打印，未真正替换）。

**分类纪律（关键）**：按 API-08，`cordis.patch.yml` **默认按 Profile 组合覆盖处理，不因文件名含 patch 就算源码 patch**；本样例之所以仍算 #1 命中，是因为 `patch.yml` 的 `target` 明确指向宿主源码文件并替换其导出符号——这是真实的 source patch，不是组合。反过来，行内 `patch:` 键也不属于 alpha.2 组合行的行语义（行只承载 `id/name/config`，bundle 侧由清单的 `dsh.bundle.patch` 指向包内相对路径，且该文件必须真的进产物）。这两件事要用两条不同的验证路径，不能混为一条。

**会怎么炸**：A1-03——alpha.1 起会话视图内部被大幅拆分，`src/session/view/SessionView.ts` 与 `renderSessionView` 未必还存在/同名/同文件；patch 面"应用成功但语义错位"比"应用失败"更危险（替换了同名但语义已变的函数）。组合侧若把 `patch:` 当行字段，会在 `--dump-config` 出现未匹配诊断或被静默忽略。

**目标写法**：逐条拿 alpha.2 精确 tag 的源码重解析 target 路径与符号；找不到等价归属模块就标 **pending confirmation**，**不要猜新路径**。组合侧按 API-08：行只写 `id/name/config`，patch 归属改由清单 `dsh.bundle.patch` 声明并核验打包产物含该文件。

**卡片**：`DSH-0.1.2-A1-03`（主，breaking，#1+#5）；台账 API-08（分类与优先级：bundle patches → `$DSH_HOME/profiles/<name>/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → CLI `--patch` 顺序叠加，后者胜）。

**待确认**：目标 tag 的会话视图归属（本次只读范围内无目标源码）→ 路径与符号存在性一律 pending；组合行 `patch:` 字段在 alpha.2 的合法性同样 pending。

### 2.4 #3 内部服务/Remote — 命中

**证据**

```ts
// src/index.ts:25-28
ctx.register('rename-session', async ({ id, title }: any) => {
  const apiProxy = await ctx.get('apiProxy')
  await apiProxy.invoke('session.rename', { id, title })
})
// src/index.ts:29-32
ctx.register('list-providers', async () => {
  const apiProxy = await ctx.get('apiProxy')
  return apiProxy.invoke('llm.providers')
})
```

**耦合点**：`apiProxy` 服务键（rc.2：`@deepseek-ai/dsh-host-apiproxy` 的 `ApiProxy`）+ 两个旧 RPC 操作名 `session.rename`、`llm.providers`；且用**弱查找** `ctx.get(...)`（拿不到就 `undefined`，下一行才 `TypeError`），插件又没有声明任何 `inject`。

**会怎么炸**：alpha.1 删除了 `apiProxy` 包与服务，没有同名替代；调用点直接 `undefined.invoke`。**最容易踩的错**是把 `apiProxy` 机械换成 `remote`：`remote` 只在客户端面存在，宿主面会停在 `pending (waiting for service: remote)`，看起来像"插件没生效"而不是"面选错了"。

**目标写法（按面）**：

- 本插件是**宿主面**：跳过 Client 网关，直接注入旧调用背后的域服务（例如清单级 `inject:['llm']` 后 `ctx.llm.listProviders()`；会话重命名走会话控制器的域服务），逐个到目标 tag 确认键与方法，**不要**从客户端 Remote 表反推宿主服务键；
- 只有当它确实是浏览器插件的客户端 half 时，才用生成投影 `ctx.remote.<ns>.<method>`，并声明 `remote` 与用到的 `remote.<ns>`；
- 操作名映射（仅客户端面参考）：`llm.providers` → `llm/listProviders` + `llm/listConfigurableProviders`（一次拆两次）；`session.rename` → `session/rename`；`command.list/execute` 在 rc.2 已是 Remote，与本走廊无关。

**卡片**：`DSH-0.1.2-A1-01`（主，breaking，required-if-hit）；若最终真的落在 `ctx.remote`，`DSH-0.1.2-A2-02` 随之生效（先判 `ok`、错误码带命名空间如 `session/not-found`、`gateway/cancelled` 不得当通用错误重试、禁止跨 realm `instanceof`）。台账 API-01/API-02。

**已排除**：`A1-25`（无 `dsh-client-runtime` 导入）、`A1-27`（无会话内容读取）、`A1-30`（无 `ctx.connection.api`）、`A1-32`（无 `workspaces` 导航）、`A1-20`（无 `userQuestions.registerProvider`）、`A1-21`（无 `resolveSessionPreset`）、`A1-22`（无 `isTokenDelta`）、`A1-31`（无 subagent 描述符）、`A2-05`（无 `pluginInventory`）、`A2-06`（无 `host.describe`/`$host`）、`A2-08`（未自行组合 `tool-todo/tool-subagent/agent` 等包）、`A2-10`（无 settings 命名空间）。

### 2.5 #4 宿主目录 — 命中

```ts
// src/index.ts:34-38
ctx.register('write-note', async ({ text }: any) => {
  const profileDir = join(homedir(), '.dsh', 'profiles', 'default')
  writeFileSync(join(profileDir, 'legacy-note.txt'), text)
})
```

**耦合点**：`homedir()` + 字面 `.dsh`（忽略运行时 `DSH_HOME`）+ 固定 profile 名 `default` + 直写 profile 目录。

**会怎么炸**：目标环境若用 `DSH_HOME` 或非 `default` 的 profile，写入会落到错误的家目录/不存在的 profile（无 `mkdir` → `ENOENT`）；更糟的是 `$DSH_HOME/profiles/<name>` 正是组合覆盖（`cordis.patch.yml`）所在的受管目录，第三方文件写进去会与 Profile 所有权、后续 patch 层叠加混淆。alpha.1 的 profile/launcher 面还新增了 `acp`/`sdk`/`sdk-minimal` 并删掉了若干独立 bin，硬编码路径与进程树更不可靠。

**目标写法**：`DSH_HOME` 与当前 profile 一律从运行时/官方 launcher 取，不拼用户目录；插件自有的持久化放到自己的数据位置（与 §2.2 的 sidecar 结论合流），不写 profile 受管目录。

**卡片**：`DSH-0.1.2-A1-04`（主，behavior，#4+#7，required-if-hit）。已排除：`A1-13`（无 PowerShell/Bash/目录选择器 workaround）、`A1-21`（无 agent-presets `roots`）。部署侧（非源码）：`A1-12/A1-14/A1-23` 属隐私/组合默认值，交部署确认，不在本次源码结论内。

### 2.6 #5 内部 UI/命令/工具 — 命中

```ts
// src/index.ts:9-10
import { SessionView } from '@deepseek-ai/dsh-session-view/internal'
// src/index.ts:40-43
ctx.contributes.registerCommand('legacy.openView', () => new SessionView({ enhanced: true }))
```

**耦合点**：① 深路径 `/internal` 导入一个会话视图类（被拆分的私有实现）；② 通过私有 `ctx.contributes` 注册命令并返回该内部类实例 —— 命令面与视图面同时绑死内部实现。

**会怎么炸**：A1-03——会话视图内部拆分后该模块/类可能不存在或语义已变，编译期 `ERR_PACKAGE_PATH_NOT_EXPORTED`/`ERR_MODULE_NOT_FOUND`，运行期命令触发即崩；即便路径还在，台账 API-07 提醒"export 里有 ≠ 产物里有"，registry 包可能根本不含 `src`/`internal` 目标文件，只有类型能过、实际模块解析失败。

**目标写法**：按归属模块重建（会话/视图能力迁到公开 facet 或 slot/服务），不要新增内部导入；公共接缝不存在的部分按 A1-03 标 **pending confirmation**；命令注册迁到公开命令面（rc.2 起 `commands/list`/`commands/execute` 已是 Remote，宿主侧用 `commands` 服务），`ctx.contributes` 不是公开注册表。

**卡片**：`DSH-0.1.2-A1-03`（主，breaking，#1+#5）；台账 API-07（深子路径风险）、API-10（客户端运行时拆分，仅在该插件确有客户端 half 时相关）。

**已排除（逐条，带理由）**：`A1-25`（导入的是 `dsh-session-view`，不是被删的 `dsh-client-runtime`）、`A1-26`（无客户端 bundle/无 `__ModuleLoader__`/无 `PLUGIN_ID`；且组合行名与包名已一致）、`A1-28`（无 composer DOM 操作）、`A1-29`（无 `MarkdownText`/CodeBlock 渲染）、`A1-06`（无 `tools.mode: code`）、`A1-09/A1-10/A1-11`（capability，未使用这些能力）、`DSH-0.1.1-R2-01/02/03`（rc.2 的图像附件/read_image 变化，本样例无图像路径；且已在 from 端点之内）。

**待确认**：该视图类在 alpha.2 的归属与是否有公开替代面；命令注册在 alpha.2 的公开接缝（卡片未给宿主侧命令注册的完整台账，属知识库缺口，按纪律不改写）。

### 2.7 #6 自定义通道 — 命中

```ts
// src/index.ts:4  import { createServer } from 'node:http'
// src/index.ts:45-54
function startLegacyBridge() {
  const server = createServer((_request, response) => { response.end('legacy') })
  server.listen(43121, '127.0.0.1') // http://localhost:43121/api/legacy
  return server
}
void startLegacyBridge
```

**耦合点**：自建 HTTP 服务器 + 固定端口 43121 + 环回绑定 + 自定义 `/api/legacy` 语义；不经过 Host Gateway，因此不继承鉴权、Host/Origin 围栏、CORS/TLS。

**会怎么炸**：A1-08——alpha.2 的 Web/API 通道是"进程级 bootstrap token + 签名 Cookie"，官方 `/api`/`remote.mux` 走 Connection 鉴权门；直接用 `ctx.webServer.register()`/`registerUpgrade()` 注册的自定义路由**不会自动**获得鉴权与围栏，旧通道要么被 401/403 拒绝，要么成为无鉴权的洞。**"只监听环回"不是免鉴权理由**。另有生命周期问题：固定端口无 `close`/冲突处理，`dsh web` 自身还要占端口。

**目标写法**：token 只用于 `GET /?token=...` 换 HttpOnly/SameSite Cookie，绝不放进 `/api` URL 或 Authorization；自定义路由在 handler 首行调用 `ctx.connection.requestRejection(req)`，或整体迁到 Connection 拥有的载体/接缝；保留既有协议语义（本例只有 `legacy` 文本，无复杂协议）；补 teardown 与端口冲突处理。

**卡片**：`DSH-0.1.2-A1-08`（主，security，required-if-hit）；`DSH-0.1.2-A1-19`（条件：仅当存在浏览器接受脚本/硬编码 web 根 URL 或启动日志解析时；本仓库无此类脚本，故不计为命中，但 `/api/legacy` 这类路由名说明部署侧可能踩）。已排除：`A1-28`（`#6` 的 DOM 分支，无 contenteditable/selection 操作）。

### 2.8 #7 子进程/输出解析 — 命中

```ts
// src/index.ts:56-67
const child = spawn('dsh', ['--profile', 'headless', prompt])
let result = ''
child.stdout.on('data', (line: Buffer) => {
  const event = JSON.parse(line.toString())      // 期待 JSONL
  if (event.type === 'final') result = event.text
})
child.on('close', () => resolve(result))         // 不看 exit code/signal/stderr
```

```js
// scripts/apply-patch.mjs:11-19
const output = execFileSync('dsh', ['--profile', 'headless', 'ping'], { encoding: 'utf8' })
for (const line of output.split('\n')) {
  if (!line.trim()) continue
  const event = JSON.parse(line)                 // 同一错误假设
  if (event.type === 'final') console.log('[legacy] headless ok:', event.text)
}
```

**耦合点**：headless argv 形态、stdout 的**格式假设**（JSONL + `type:'final'` 信封）、按 `data` 块而非行边界解析（chunk 会切断 JSON）、只用 `close` 不看 exit code/signal、不消费 stderr、无超时/取消/teardown。

**会怎么炸**：`dsh --profile headless "<task>"` 的 stdout 是**最终助手文本**，从来不是 JSONL（这一点在 rc.2 就已如此，不是 alpha.2 新引入的回归）；因此 `JSON.parse` 在正常成功路径上直接抛错。alpha.1 的**真实增量**是：stderr 会出现 `dsh: reasoning:` 段落（rc.2 成功时 stderr 为空），`dsh: <code>: <message>` 走 stderr，成功与否以 exit code 为准（0 完成 / 1 失败、中止或无完成回合；SIGINT→130，SIGTERM→0）。把"stderr 非空"当失败会误判所有带推理的成功运行；忽略 exit code 会把"没有完成回合"当成功。

**目标写法**：`spawn`/`execFile` 传 argv 数组，launcher 参数在任务之前（`--patch` 必须在任务文本前）；stdout 按最终文本处理（或该入口自有的结构化契约），stderr 作为推理/诊断流单独处理，exit code 作为唯一成功判据；并发读取两条管道，补 spawn error、信号、取消与清理。

**卡片**：`DSH-0.1.2-A1-05`（主，behavior，#7，required-if-hit）；`DSH-0.1.2-A1-04`（次，#4+#7：profile/launcher 与已删 bin 的假设）。台账 API-06（argv 与通道契约、最小 stub 矩阵）。条件未命中：`A2-04`（Node 24.0–24.11.1 空客户端图；本仓库无 Node 版本 workaround、也无 `dsh web` 启动路径 → 不构成命中，但若部署侧曾为它钉 Node 22 需重评）、`A1-06`（无 code-mode dispatch 事件）、`A1-13`（无平台 shell workaround）、`A1-19`（无启动日志解析）。

---

## 3. 无命中类别与"无命中 ≠ 无问题"

七类**全部命中**，所以严格意义上不存在"无命中类别"。等价纪律落在两处：

### 3.1 逐类排除记录（扫描覆盖已在上表逐条给出）

被检查并排除的子面/卡片：`A1-06/07/09/10/11/12/13/14/19/20/21/22/23/24/25/26/27/28/29/30/31/32`、`A2-03/04/05/06/08/10`、`R2-01/02/03`。排除依据是**逐条比对导入、调用点、配置键**（见 §2 各类"已排除"），不是"没搜到关键字就算了"。

### 3.2 为什么排除/无命中不能反推"没问题"

1. **卡片是 curated，不是完整 API diff**（走廊索引明确声明）。目标 tag 上完全可能有未成卡的行为变化，本报告无法据此断言不存在影响。
2. **样例不可编译是设计如此**，且无 build/typecheck/test 脚本 → 没有任何静态绿可以证明"没接缝"；类型检查、产物解析、真实挂载三层全部缺席。
3. **多数断点是运行期才现形**：`inject` 停在 `pending (waiting for service: ...)`（`A2-08`/`A1-01` 的宿主面误用）、`__DSH_BOOT__.entries` 为空（`A2-04`）、冷加载整会话被拒（API-05）——静态扫描看不见。
4. **死代码会伪装成"无影响"**：`startLegacyBridge` 从未被调用（`void startLegacyBridge`）、`apply-patch.mjs` 在扫描中不执行；`#6`/`#1` 的耦合是**设计级**的，一旦接线即生效。"没运行过"既不能证明安全，也不能证明有问题。
5. **依赖面是空的**：无 `peerDependencies`、无 lockfile、无 `dsh-plugin.json` → `A2-03`（peer 修剪/新增）、`R-05`（被删包消费者清单）、`R-08`（安装通道）无法闭合，必须在真实依赖状态建立后才能判定。
6. **面未钉死**：无 `dsh.client` 说明当前按 Host 面处理；但 `/internal` 的会话视图类暗示 UI 侧依赖。若它其实还有客户端 half，则 `A1-25/26/27/28/29/30/32`、`A2-06`、API-10 全部重新打开。
7. **目标 tag 坐标离线不可核**（本次只读范围内没有目标版源码）：所有"目标路径/符号/服务键仍然存在"的判断按纪律标 **pending**，不得按记忆改写。

---

## 4. 卡片映射总表（走廊 0.1.1-rc.2 → 0.1.2-alpha.2 终态）

| 卡片 | 类型 | 面/适用 | 触点 | 级别 | 本仓库命中理由（一句） |
|---|---|---|---|---|---|
| `DSH-0.1.2-A1-01` | breaking | Host 集成/Web Client | #3（间接 #1） | required-if-hit | `ctx.get('apiProxy')` 两处 + `session.rename`/`llm.providers`：服务与包已删除；宿主面须改为注入域服务，禁止换成 `remote` |
| `DSH-0.1.2-A1-02` | breaking | 事件生产者 | #2 | required-if-target-is-alpha.1 → **目标 alpha.2，不生效** | 被 A2-01 折叠：只作 alpha.1 一代的历史解释，不得先删后补 |
| `DSH-0.1.2-A2-01` | fix | 事件生产者/持久化 | #2 | required-if-hit | 终态保留 `ignorable`；真实边界是写入面缺口（API-05），须换 sidecar |
| `DSH-0.1.2-A1-03` | breaking | patch 宿主源/内部会话视图 | #1、#5 | required-if-hit | `patch.yml` 打 `src/session/view/SessionView.ts` + `/internal` 导入 + 私有命令返回内部视图类 |
| `DSH-0.1.2-A1-04` | behavior | launcher/profile 读写 | #4、#7 | required-if-hit | 硬编码 `~/.dsh/profiles/default` 直写；headless 包装依赖 profile/launcher 假设 |
| `DSH-0.1.2-A1-05` | behavior | headless 包装/输出解析 | #7 | required-if-hit | 两处把 stdout 当 JSONL 找 `type:'final'`；不看 exit code，未消费 stderr 推理段 |
| `DSH-0.1.2-A1-08` | security | 自定义 HTTP/WS/RPC | #6 | required-if-hit | 自建 `node:http` 环回服务 + `/api/legacy`，绕过 Gateway 鉴权与 Host/Origin 围栏 |
| `DSH-0.1.2-A2-02` | breaking | Remote 消费者 | #3 | required-if-hit（仅当改走 `ctx.remote`） | 目前无 Remote 调用点；一旦按客户端面迁移即生效（`RemoteResult`/`RemoteError`/命名空间错误码） |
| `DSH-0.1.2-A1-19` | behavior | 浏览器接受/启动解析 | #6、#7 | 条件，**未构成命中** | 仓库内无接受脚本；仅作部署侧风险提示 |

台账（非卡片，用于精确定义，不单独计为卡片）：API-01/API-02（APIProxy 按面迁移、RemoteResult/RemoteError）、API-05（`ignorable` 写入面缺口）、API-06（headless argv/通道契约）、API-07（export ≠ 产物）、API-08（`cordis.patch.yml` 是组合、组合优先级与 `dsh.bundle.patch`）。Rollup 级：R-05（被删包消费者清单，本例 `apiProxy`、`dsh-session-view/internal` 都在其中）、R-06（基线不可采集）、R-11（类型面漂移，本例由导入清单排除）。

**折叠后的生效卡片集（净态）**：`A1-01、A1-03、A1-04、A1-05、A1-08、A2-01`，加一张条件卡 `A2-02`。`A1-02` 只出现在"已完成折叠"的解释里，**不是**待办项。

---

## 5. 完成 / 跳过 / 待确认

**已完成**
- 6/6 源文件逐行扫描，七类触点全部定位到文件:行；
- 走廊按 `from → to` 边构建（rc.2→alpha.1 28 卡，alpha.1→alpha.2 8 卡），并完成 `ignorable` 的 net-state 折叠；
- 每条命中映射到具体卡片 ID，并记录被折叠与被排除的卡片及理由；
- 只读纪律：未修改任何 fixture 文件（§0.2 指纹），未执行 git、未安装、未联网、未运行迁移。

**跳过（附证据）**
- 构建/类型检查/单测：样例无对应脚本且按设计不可编译（`README:3`，`package.json:6-8`）→ 无法提供静态绿，也不做替代性结论；
- 真实 Profile 挂载 / 冷启动 / 行为链路：任务为静态只读扫描，且样例不可执行；
- 依赖解析与 lockfile 审计：无 `peerDependencies`、无 lockfile、无 `dsh-plugin.json` → 无对象可审。

**待确认 / 残余风险**
1. `patch.yml:3-4` 的 target 文件与符号在 alpha.2 是否存在（无等价模块则 pending，不得猜路径）；
2. `cordis.patch.yml:5` 行内 `patch:` 键在 alpha.2 组合行 schema 下是否合法，以及 patch 是否应改由清单 `dsh.bundle.patch` 承载并核验进产物；
3. `@deepseek-ai/dsh-session-view` 在 alpha.2 的归属包与公开替代面（公共命令注册接缝同样缺卡片，属知识库缺口）；
4. 事件真实落盘路径（`Session.append` 还是别处）→ 决定 `A2-01` 是"保持原样"还是"必须换 sidecar"；
5. `apiProxy` 两个操作在宿主面的域服务键/方法名（目标 tag 现场确认）；
6. 部署侧隐私/组合默认值（`A1-12/A1-14/A1-23`）与安装通道（`R-01/R-08`）、跨代共存（`R-02`）不在源码扫描范围，需另开判定。

**回滚基线（只读记录）**：上述 6 个文件的 SHA-256（§0.2）；本次无任何写入，故无需回滚动作。


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.