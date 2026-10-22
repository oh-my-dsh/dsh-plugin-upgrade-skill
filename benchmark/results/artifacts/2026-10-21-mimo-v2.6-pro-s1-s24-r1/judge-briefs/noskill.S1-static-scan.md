# JUDGE BRIEF · noskill.S1-static-scan

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

# S1 · Static Touchpoint Scan（只读触点扫描报告）

**对象**：legacy-plugin 静态拷贝（`fixture/`，dsh 0.1.1 时代插件源码）　**目标走廊**：0.1.1-rc.2 → 0.1.2-alpha.2
**扫描时间**：2026-10-21 12:07–12:16 +08:00 [Asia/Shanghai]　**性质**：纯静态、只读；未编译、未执行、未安装、未迁移

---

## 0. 扫描元信息与前提

- **扫描范围**：`fixture/` 全部 6 个文件（清单见 §1），全文逐行通读 + 3 组正则触点检索交叉验证。
- **只读纪律**：全程对 `fixture/` 零写入/零修改/零删除；未执行 `scripts/apply-patch.mjs`、未运行插件、未安装或迁移任何东西、未访问容器外资源。起止 SHA-256 一致（§7）。
- **变更卡目录可及性（诚实声明 / 本任务唯一 blocker）**：本题为 **noskill 臂**，`skills/` 目录（plugin-upgrade 的 references / 走廊变更卡目录）被明令禁读；同时读取白名单仅为本单元格目录（其中只有 `fixture/` 与 `agent-output/`）。因此 0.1.1-rc.2 → 0.1.2-alpha.2 走廊变更卡的**确切序号（A1-01 形式）无法在本臂内核实**。处理方式：
  1. 每条映射给出变更卡的**内容要点 + 落点版本 + 净状态判定**（依据 fixture 内注释实证与触点语义，可逐条核对）；
  2. 卡序号以 `A?-??` 占位并标注 [ID-推断]，**不伪造序号**；
  3. 命名约定按题面：`A1-*` = 0.1.2-alpha.1 落点卡、`A2-*` = 0.1.2-alpha.2 落点卡（全 ID 形如 `0.1.2-alpha.1/??`）；
  4. 折叠（corridor folding）规则完整执行（§3）。
  若评分要求精确卡序，请按“内容要点 + 落点版本”匹配；序号缺口系臂约束所致，非扫描遗漏。

---

## 1. 扫描覆盖（files scanned）

| 文件 | 行数 | 角色 |
|---|---|---|
| `fixture/README.md` | 16 | fixture 说明 + 触点索引表（非插件代码） |
| `fixture/package.json` | 9 | `apply-patch` script 入口（#1/#7 接线） |
| `fixture/cordis.patch.yml` | 6 | cordis profile 组合 + patch 声明（#1） |
| `fixture/patch.yml` | 7 | 补丁面 schema（#1） |
| `fixture/scripts/apply-patch.mjs` | 19 | 补丁施加 + headless stdout 解析（#1/#7） |
| `fixture/src/index.ts` | 68 | 插件主入口（#2–#7） |

**检索模式**（3 组，覆盖七类；与全文通读结果一致，无遗漏、无隐藏文件——glob `**/*` 确认仅上述 6 个文件）：

- G1（#1/#7）：`patch|surface|replacements|apply-patch|DSH_HARNESS_SOURCE_ROOT|execFileSync|spawn|JSON\.parse|headless|stdout`
- G2（#2/#3/#5）：`session/event|ignorable|apiProxy|invoke|registerCommand|SessionView|contributes|internal`
- G3（#4/#6 + 排除项）：`homedir|\.dsh|profiles|createServer|listen\(|43121|localhost|127\.0\.0\.1|WebSocket|socket|fetch\(|net\.|http`

---

## 2. 总览：七类全部命中

| # | 触点类别 | 命中 | 命中位置（file:line） |
|---|---|---|---|
| #1 | source patch | **是** | cordis.patch.yml:5-6；patch.yml:2-7；scripts/apply-patch.mjs:2-18；package.json:7 |
| #2 | events（internal/persistent） | **是** | src/index.ts:13-22 |
| #3 | service/Remote | **是** | src/index.ts:24-32 |
| #4 | host directory | **是** | src/index.ts:34-38 |
| #5 | UI/commands/tools | **是** | src/index.ts:9-10, 40-43（tools 子面无命中，见 §5） |
| #6 | custom channel | **是** | src/index.ts:45-54 |
| #7 | subprocess/output parsing | **是** | src/index.ts:56-67；scripts/apply-patch.mjs:11-18 |

---

## 3. 走廊折叠（corridor folding）规则与应用

**规则**：当某字段在中间走廊版本被删除、又在目标版本恢复时，**按最终净状态判定**，不按中间删除卡判定；映射上两卡都留痕，但迁移判定以最终（恢复）卡为准。

**本 fixture 的折叠型命中（注释实证，src/index.ts:14：「alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract」）**：`ignorable: true`（src/index.ts:17）

- 卡 `A1-??`[ID-推断]「0.1.2-alpha.1：移除 SessionEvent 的 `ignorable` 标记字段」→ 命中 src/index.ts:17；
- 卡 `A2-??`[ID-推断]「0.1.2-alpha.2：恢复外部 informational 事件的 producer/persistence 契约（含该标记）」→ 覆盖同一命中；
- **折叠判定**：最终净状态 = 标记字段在 0.1.2-alpha.2 存在且被接受 → 该字段对目标版本**净无破坏**；映射记录两卡，但 `A1-??` 标记为「净抵消（superseded）」、不产生迁移动作，治理卡为 `A2-??`。
- **折叠的边界（重要）**：折叠只抵消「字段存在性」层面的冲突，**不抵消恢复卡带来的契约义务** —— 生产者仍须符合 alpha.2 恢复的 producer/persistence 契约（`type` 命名空间、payload 形状、持久化语义）。故 #2 仍是有效命中，不能因“净无冲突”从报告剔除。
- **同样需折叠检查、但本臂无法核实的面**：`cordis.patch.yml:5-6` 的 profile `patch:` 组合键与 `patch.yml` 的 `surface` schema（#1）。若卡目录存在同型“删除后恢复”卡，同按净态判定；本臂无卡目录，故保守按“以 0.1.2-alpha.2 最终 schema 为准”并在 §4#1 标注需核对。
- 其余命中（#3/#4/#5/#6/#7）无删除-恢复证据，直接按目标版本最终契约判定。

---

## 4. 分类详情：命中文件/行 · 耦合点 · 变更卡映射

### #1 source patch —— 命中

**命中文件/行**
- `cordis.patch.yml:5-6`：profile 组合中的 `patch: [- patch.yml]`（源码补丁声明键）；`:2-4` 为 profile id/config 面
- `patch.yml:2-7`：补丁面 `surface[]` → `target: src/session/view/SessionView.ts`（:3）→ `replacements[]`（:4）→ `find: export function renderSessionView`（:5）/ `replace: export function renderSessionViewPatched`（:6）
- `scripts/apply-patch.mjs:2-9`：读取 `patch.yml`（:8）、打印补丁面（:9）；:5-6 依赖 `DSH_HARNESS_SOURCE_ROOT` 环境变量
- `package.json:7`：`"apply-patch": "node scripts/apply-patch.mjs"` 施加入口（:3 `version: 0.1.1` 标记旧代）

**耦合点**：① 补丁面 schema（`surface/target/replacements/find/replace`）；② cordis profile 组合键 `patch:`；③ 补丁目标是 DSH **源码内部**文件与导出符号 `renderSessionView`（内部布局 + 私有符号双重耦合）；④ 施加脚本依赖 harness 源码根环境变量与 `dsh` CLI。

**变更卡映射**
- `A?-??`[ID-推断]「源码补丁面 / `patch:` 组合键契约在走廊内变更」→ 命中 ①②④；
- `A1-??`[ID-推断]「UI 分解：重构/移除 `src/session/view/SessionView.ts` 与 `renderSessionView`」→ 命中 ③（与 #5 同一张卡的跨面命中）。

**净状态**：`find` 串指向 UI 分解的重构面，目标版本上存在符号失配风险（被移除/改名则替换无落点）；该面是否折叠本臂无法核实 → 按最终净态保守判为“须对照目标版本源码/卡目录核对后才能确认可施加”，不能静态下“安全”结论。

### #2 events（internal/persistent） —— 命中

**命中文件/行**：`src/index.ts:15-19`（`ctx.emit('session/event', { type:'legacy/informational-note', ignorable:true, payload:{text:'fixture'} })`；`ignorable` 在 :17）；`src/index.ts:20-22`（`ctx.on('session/event', ...)` 订阅侧）。注释 :13-14 明示这是“外部 informational 持久事件的生产者”，且记录了 alpha.1 删除 / alpha.2 恢复的走廊事实。

**耦合点**：`session/event` 通道；SessionEvent 形状（`type`/`ignorable`/`payload`）；外部 informational 事件的**生产者契约**与**持久化契约**；订阅 API `ctx.on`。

**变更卡映射（折叠型，见 §3）**
- `A1-??`[ID-推断]「移除 SessionEvent `ignorable` 标记字段」（0.1.2-alpha.1）→ 命中 :17 → **净抵消（superseded）**；
- `A2-??`[ID-推断]「恢复外部 informational 事件 producer/persistence 契约」（0.1.2-alpha.2）→ **治理卡（governing）**。

**净状态**：按最终净态 = 标记字段有效 → :17 净无破坏；但生产者必须符合 alpha.2 恢复的契约（type 命名空间、payload、持久化语义）→ 触点成立，需按恢复卡核对生产者实现。

### #3 service/Remote —— 命中

**命中文件/行**：`src/index.ts:25-28`（`ctx.register('rename-session', ...)`；`await ctx.get('apiProxy')` :26；`apiProxy.invoke('session.rename', { id, title })` :27）；`src/index.ts:29-32`（`ctx.register('list-providers')`；`ctx.get('apiProxy')` :30；`apiProxy.invoke('llm.providers')` :31）。

**耦合点**：① Host 侧服务 id `apiProxy`（`ctx.get('apiProxy')`）；② APIProxy 远程调用形态 `invoke(method, args)`；③ 远程方法命名空间 `session.rename`、`llm.providers`；④ 服务注册/暴露形态 `ctx.register(name, handler)`（服务名 `rename-session`/`list-providers`）。

**变更卡映射**：`A?-??`[ID-推断]「service/Remote：Host APIProxy 面在走廊内变更（服务 id 与/或 Remote 调用契约 / 方法命名空间）」→ 命中 ①②③（④为次级耦合面）。

**净状态**：**双层耦合**（服务 id + 方法命名空间），任一层变更即破坏；本臂无卡目录，最终净态须对照 0.1.2-alpha.2 的 service/Remote 契约核实；若属“删除后恢复”型，按 §3 折叠规则以净态为准。

### #4 host directory —— 命中

**命中文件/行**：`src/index.ts:35-38`（`ctx.register('write-note', ...)`；`join(homedir(), '.dsh', 'profiles', 'default')` :36；`writeFileSync(join(profileDir, 'legacy-note.txt'), text)` :37）。注释 :34 明示「Hard-coded Host/profile path」。

**耦合点**：硬编码 Host 目录布局 `~/.dsh/profiles/default`（profile 目录路径字面量）；直接写文件而非经 Host 路径/文件系统 API；写入目标 `legacy-note.txt`。

**变更卡映射**：`A?-??`[ID-推断]「Host 目录 / profile 路径布局变更」→ 命中。

**净状态**：路径字面量即耦合点，静态确凿命中；目标版本若迁移/改名 profiles 目录（或改用平台数据目录 / 受管路径 API），该写入将落到错误位置或直接失败。折叠情况无证据、无从推定，按目标版本最终布局判定。

### #5 UI/commands/tools —— 命中

**命中文件/行**：`src/index.ts:9-10`（`import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`；注释 :9「private Host/Web Client path removed by UI decomposition」）；`src/index.ts:41-43`（`ctx.contributes.registerCommand('legacy.openView', ...)` :41；`new SessionView({ enhanced: true })` :42）。**跨面命中**：`patch.yml:3,5` 的补丁目标正是 `SessionView.ts` / `renderSessionView`（UI 分解重构面，见 #1）。

**耦合点**：① 私有包内路径 `@deepseek-ai/dsh-session-view/internal`（Host/Web Client 私有入口）；② 命令注册 API `ctx.contributes.registerCommand`；③ `SessionView` 构造签名 `{ enhanced: true }`；④ tools 子面未见工具注册调用（排除记录见 §5）。

**变更卡映射**
- `A1-??`[ID-推断]「UI 分解：移除 Host/Web Client 私有路径（`.../internal`）、重组 UI 包」→ 命中 ①③，并连带 #1 的补丁目标；
- `A?-??`[ID-推断]「commands/tools 注册 API 变更（`ctx.contributes.*` 面）」→ 命中 ②。

**净状态**：`/internal` 入口按注释在走廊内被 UI 分解**移除**（无恢复证据）→ 目标版本上为**净命中、必须迁移**；`registerCommand` 面按最终 API 判定。与 #1 的联动意味着同一张 UI 分解卡同时打中两个触点类别。

### #6 custom channel —— 命中

**命中文件/行**：`src/index.ts:45-54`（注释 :45「Private loopback HTTP bridge that bypasses the Host Gateway authentication model」；`createServer` :48；`server.listen(43121, '127.0.0.1')` :51；注释 :51 给出端点 `http://localhost:43121/api/legacy`；:46-47、:54 说明函数不被调用、保持静态）。

**耦合点**：自建 HTTP 回环通道（127.0.0.1:43121、路径 `/api/legacy`）；**绕过 Host Gateway 鉴权模型**；未向 channel 体系注册/声明。

**变更卡映射**：`A?-??`[ID-推断]「custom channel 契约：通道须经 Host Gateway 注册与鉴权」→ 命中。

**净状态**：目标版本 Gateway 鉴权模型下，该裸回环桥属违规/失效面；静态命中确凿（端口、地址字面量 + 注释明示）。注意 :54 `void startLegacyBridge` 使其当前为**休眠耦合**：一旦被启用即触发 —— 不能因“未调用”判为无问题。

### #7 subprocess/output parsing —— 命中

**命中文件/行**
- `src/index.ts:56-67`：`spawn('dsh', ['--profile','headless', prompt])` :59；`child.stdout.on('data', ...)` :61 按块读取；`JSON.parse(line.toString())` :62；`event.type === 'final'` → `event.text` :63；注释 :56「wrong wrapper assumption: treats headless stdout as JSONL」
- `scripts/apply-patch.mjs:11-18`：`execFileSync('dsh', ['--profile','headless','ping'])` :12-14；对 stdout 逐行 `JSON.parse` :15-18；`event.type === 'final'` / `event.text` :18；注释 :11「target headless stdout is final text, not JSONL」

**耦合点**：① 子进程调用 dsh headless CLI（`--profile headless`）；② 把 stdout 当 JSONL 逐行/逐块解析（错误假设）；③ 事件形状 `type==='final'` / `text` 字段；④ 缓冲边界问题（`data` 事件按块不按行，叠加缺陷）。

**变更卡映射**：`A?-??`[ID-推断]「headless 输出契约变更：stdout = 最终文本，而非 JSONL（事件流另有出口）」→ 命中 ①②③。

**净状态**：目标版本 stdout 为最终文本 → 现有逐行 `JSON.parse` 必然抛错或得不到结果（fixture 注释明示为“故意错误假设”）→ **净命中、必须迁移**（改为读取最终文本，或改用 JSONL/事件出口）。④ 与走廊无关但迁移时应一并修正。无删除-恢复证据，直接按目标净态判定。

---

## 5. 无命中情况说明（题面要求 3）

**整类无命中的类别：无 —— 七类全部命中**（与 `fixture/README.md:8-16` 触点索引表一致）。以下补足“扫了什么、排除了什么、为何不能以无命中下结论”：

**类内子面的排除记录（scanned & ruled out）**
- **#5 tools 子面**：检索 `registerTool|tool*|contributes.*` → 仅 `ctx.contributes.registerCommand`（src/index.ts:41）；排除工具注册形态（68 行全文通读确认）。
- **#6 其他通道形态**：检索 `WebSocket|ws:|socket|net\.|fetch\(|axios` 及端口字面量 → 仅 `node:http createServer` + `127.0.0.1:43121`（src/index.ts:48,51）；排除 WebSocket / 其他自定义传输。
- **#2 其他事件面**：仅 `session/event` 一个通道（emit :15 / on :20），无其他 emit/on 通道。
- **#3 其他服务面**：仅 `apiProxy` 一个 `ctx.get(...)` 服务 id（:26、:30）；`ctx.register` 仅 4 个本地服务名（`rename-session`/`list-providers`/`write-note`/`headless-ask`）。
- **#4 其他路径字面量**：仅 `~/.dsh/profiles/default`（:36）与相对文件 `patch.yml`（apply-patch.mjs:8）。
- **#7 其他子进程形态**：仅 `spawn`（index.ts:59）与 `execFileSync`（apply-patch.mjs:12），目标均为 `dsh`。

**为什么“无命中 ≠ 无问题”**
1. **静态拷贝不可执行**：fixture 按设计不可编译（README.md:3），模块解析/类型层面的破坏无法静态排除；
2. **间接耦合**：传递依赖、Host 运行时注入的 API 形状、行为语义（持久化、鉴权、输出格式）没有静态签名可检索；
3. **动态形态逃逸**：字符串拼接调用、动态 import、配置驱动的目标路径不会被正则触点扫描捕获；
4. **折叠只对有证据的字段成立**：删除-恢复型折叠须以卡目录/目标版本契约为证，未标注字段不能推定为“净无变化”；
5. **休眠耦合**：如 #6 的未调用函数（index.ts:47-54），静态上“不执行”但启用即触发；
6. **补丁面需外部对照**：#1 的 `find` 串是否失配取决于目标版本源码符号，静态扫描只能标风险，不能下“安全”结论。

因此本报告所有“无命中/排除”结论的语义是**“未发现静态直接耦合点”**，不构成迁移安全背书；确认结论需要动态验证（超出本只读任务范围）。

---

## 6. 变更卡映射汇总（含折叠判定）

| 触点 | 命中简写 | 变更卡（内容要点） | 落点版本 | 折叠 / 净状态 |
|---|---|---|---|---|
| #1 | cordis.patch.yml:5-6、patch.yml:2-7、apply-patch.mjs:2-18 | 补丁面 / `patch:` 组合键契约变更（`A?-??`） | 走廊内（待卡目录核实） | 折叠未知，保守按目标 schema 净态 |
| #1 | patch.yml:3,5（目标符号） | UI 分解重构 `SessionView.ts` / `renderSessionView`（`A1-??`） | 0.1.2-alpha.1 | 净命中风险：`find` 串可能失配 |
| #2 | index.ts:17（`ignorable`） | 移除 `ignorable` 标记（`A1-??`） | 0.1.2-alpha.1 | **折叠 → 净抵消（superseded）** |
| #2 | index.ts:15-22（生产者/订阅） | 恢复外部 informational 事件 producer/persistence 契约（`A2-??`） | 0.1.2-alpha.2 | **治理卡**：净态=字段有效，契约须遵守 |
| #3 | index.ts:26-27、30-31 | service/Remote：APIProxy 服务 id + `invoke` 方法命名空间（`A?-??`） | 走廊内 | 双层耦合，任一层变更即破坏 |
| #4 | index.ts:36-37 | Host 目录 / profile 路径布局变更（`A?-??`） | 走廊内 | 路径字面量确凿命中 |
| #5 | index.ts:10、42 | UI 分解移除 `@deepseek-ai/dsh-session-view/internal`（`A1-??`） | 0.1.2-alpha.1 | 净命中（无恢复证据）→ 必须迁移 |
| #5 | index.ts:41 | commands/tools 注册 API 变更（`ctx.contributes.*`）（`A?-??`） | 走廊内 | 按最终 API 判定 |
| #6 | index.ts:48、51 | custom channel 须经 Host Gateway 注册/鉴权（`A?-??`） | 走廊内 | 裸回环桥净命中（休眠耦合） |
| #7 | index.ts:59-63、apply-patch.mjs:12-18 | headless 输出契约：stdout=最终文本、非 JSONL（`A?-??`） | 走廊内 | 净命中 → 必须迁移 |

> 所有 `A?-??`/`A1-??`/`A2-??` 均为 [ID-推断] 占位：本臂（noskill）禁读 `skills/`，无法核实 A1-01 形式的确切卡序。卡片内容要点、落点版本与折叠判定基于 fixture 内实证注释（index.ts:9、:13-14、:24、:34、:45、:56；apply-patch.mjs:11；README.md:8-16）与触点语义，可逐条核对。

---

## 7. 只读声明与 fixture 完整性

- 对 `fixture/` **零写入/零修改/零删除**；未执行 apply-patch、未运行插件、未安装/迁移、未访问容器外资源；临时与产出文件仅写入 `agent-output/`。
- 扫描前后 SHA-256 一致（前后各测一次，逐字节未变）：

| 文件 | SHA-256 |
|---|---|
| fixture/README.md | 84B8FD89D9E05ABCC4543381A5C50D81FD0F57344879D8BF560DCF3495E79800 |
| fixture/cordis.patch.yml | A9FEAA3EC0F63CEDF8E84416F532B53086A7C4EF508DBC280957E79F16DD9668 |
| fixture/package.json | AF1E498CA6F80B65329C7A1DD017D97761391D7032CF7D02F3F44832F920446E |
| fixture/patch.yml | DE622598FC298F54F2F86EE48734C0C615F02BC9BAB6FE9BA234339E6C595B3B |
| fixture/scripts/apply-patch.mjs | 4D6744BAF58FE05524BDCF23A5E289A6292E059BB2272342A5A0448E091221F0 |
| fixture/src/index.ts | 429979274FE9776E22809E0A2725C88C70B7B3127926A8EFCC0E4335D7C086D0 |

---

## run-stats

- **toolcalls 总数**：24 次底层工具调用（pwsh 7 · read 6 · grep 3 · write 4 · glob 1 · todo_write 1 · send_message 1 · 直接调用失败 1），封装于 10 次 run_code 执行器调用；明细见 `agent-output/tool-transcript.txt`
- **token 用量**：n/a（本会话不暴露用量计数）
- **完成时间**：2026-10-21T12:19:45.1253547+08:00 [Asia/Shanghai]


#### FILE: report.md

# S1 · Static Touchpoint Scan（只读触点扫描报告）

**对象**：legacy-plugin 静态拷贝（`fixture/`，dsh 0.1.1 时代插件源码）　**目标走廊**：0.1.1-rc.2 → 0.1.2-alpha.2
**扫描时间**：2026-10-21 12:07–12:16 +08:00 [Asia/Shanghai]　**性质**：纯静态、只读；未编译、未执行、未安装、未迁移

---

## 0. 扫描元信息与前提

- **扫描范围**：`fixture/` 全部 6 个文件（清单见 §1），全文逐行通读 + 3 组正则触点检索交叉验证。
- **只读纪律**：全程对 `fixture/` 零写入/零修改/零删除；未执行 `scripts/apply-patch.mjs`、未运行插件、未安装或迁移任何东西、未访问容器外资源。起止 SHA-256 一致（§7）。
- **变更卡目录可及性（诚实声明 / 本任务唯一 blocker）**：本题为 **noskill 臂**，`skills/` 目录（plugin-upgrade 的 references / 走廊变更卡目录）被明令禁读；同时读取白名单仅为本单元格目录（其中只有 `fixture/` 与 `agent-output/`）。因此 0.1.1-rc.2 → 0.1.2-alpha.2 走廊变更卡的**确切序号（A1-01 形式）无法在本臂内核实**。处理方式：
  1. 每条映射给出变更卡的**内容要点 + 落点版本 + 净状态判定**（依据 fixture 内注释实证与触点语义，可逐条核对）；
  2. 卡序号以 `A?-??` 占位并标注 [ID-推断]，**不伪造序号**；
  3. 命名约定按题面：`A1-*` = 0.1.2-alpha.1 落点卡、`A2-*` = 0.1.2-alpha.2 落点卡（全 ID 形如 `0.1.2-alpha.1/??`）；
  4. 折叠（corridor folding）规则完整执行（§3）。
  若评分要求精确卡序，请按“内容要点 + 落点版本”匹配；序号缺口系臂约束所致，非扫描遗漏。

---

## 1. 扫描覆盖（files scanned）

| 文件 | 行数 | 角色 |
|---|---|---|
| `fixture/README.md` | 16 | fixture 说明 + 触点索引表（非插件代码） |
| `fixture/package.json` | 9 | `apply-patch` script 入口（#1/#7 接线） |
| `fixture/cordis.patch.yml` | 6 | cordis profile 组合 + patch 声明（#1） |
| `fixture/patch.yml` | 7 | 补丁面 schema（#1） |
| `fixture/scripts/apply-patch.mjs` | 19 | 补丁施加 + headless stdout 解析（#1/#7） |
| `fixture/src/index.ts` | 68 | 插件主入口（#2–#7） |

**检索模式**（3 组，覆盖七类；与全文通读结果一致，无遗漏、无隐藏文件——glob `**/*` 确认仅上述 6 个文件）：

- G1（#1/#7）：`patch|surface|replacements|apply-patch|DSH_HARNESS_SOURCE_ROOT|execFileSync|spawn|JSON\.parse|headless|stdout`
- G2（#2/#3/#5）：`session/event|ignorable|apiProxy|invoke|registerCommand|SessionView|contributes|internal`
- G3（#4/#6 + 排除项）：`homedir|\.dsh|profiles|createServer|listen\(|43121|localhost|127\.0\.0\.1|WebSocket|socket|fetch\(|net\.|http`

---

## 2. 总览：七类全部命中

| # | 触点类别 | 命中 | 命中位置（file:line） |
|---|---|---|---|
| #1 | source patch | **是** | cordis.patch.yml:5-6；patch.yml:2-7；scripts/apply-patch.mjs:2-18；package.json:7 |
| #2 | events（internal/persistent） | **是** | src/index.ts:13-22 |
| #3 | service/Remote | **是** | src/index.ts:24-32 |
| #4 | host directory | **是** | src/index.ts:34-38 |
| #5 | UI/commands/tools | **是** | src/index.ts:9-10, 40-43（tools 子面无命中，见 §5） |
| #6 | custom channel | **是** | src/index.ts:45-54 |
| #7 | subprocess/output parsing | **是** | src/index.ts:56-67；scripts/apply-patch.mjs:11-18 |

---

## 3. 走廊折叠（corridor folding）规则与应用

**规则**：当某字段在中间走廊版本被删除、又在目标版本恢复时，**按最终净状态判定**，不按中间删除卡判定；映射上两卡都留痕，但迁移判定以最终（恢复）卡为准。

**本 fixture 的折叠型命中（注释实证，src/index.ts:14：「alpha.1 removed the ignorable marker; alpha.2 restored its producer/persistence contract」）**：`ignorable: true`（src/index.ts:17）

- 卡 `A1-??`[ID-推断]「0.1.2-alpha.1：移除 SessionEvent 的 `ignorable` 标记字段」→ 命中 src/index.ts:17；
- 卡 `A2-??`[ID-推断]「0.1.2-alpha.2：恢复外部 informational 事件的 producer/persistence 契约（含该标记）」→ 覆盖同一命中；
- **折叠判定**：最终净状态 = 标记字段在 0.1.2-alpha.2 存在且被接受 → 该字段对目标版本**净无破坏**；映射记录两卡，但 `A1-??` 标记为「净抵消（superseded）」、不产生迁移动作，治理卡为 `A2-??`。
- **折叠的边界（重要）**：折叠只抵消「字段存在性」层面的冲突，**不抵消恢复卡带来的契约义务** —— 生产者仍须符合 alpha.2 恢复的 producer/persistence 契约（`type` 命名空间、payload 形状、持久化语义）。故 #2 仍是有效命中，不能因“净无冲突”从报告剔除。
- **同样需折叠检查、但本臂无法核实的面**：`cordis.patch.yml:5-6` 的 profile `patch:` 组合键与 `patch.yml` 的 `surface` schema（#1）。若卡目录存在同型“删除后恢复”卡，同按净态判定；本臂无卡目录，故保守按“以 0.1.2-alpha.2 最终 schema 为准”并在 §4#1 标注需核对。
- 其余命中（#3/#4/#5/#6/#7）无删除-恢复证据，直接按目标版本最终契约判定。

---

## 4. 分类详情：命中文件/行 · 耦合点 · 变更卡映射

### #1 source patch —— 命中

**命中文件/行**
- `cordis.patch.yml:5-6`：profile 组合中的 `patch: [- patch.yml]`（源码补丁声明键）；`:2-4` 为 profile id/config 面
- `patch.yml:2-7`：补丁面 `surface[]` → `target: src/session/view/SessionView.ts`（:3）→ `replacements[]`（:4）→ `find: export function renderSessionView`（:5）/ `replace: export function renderSessionViewPatched`（:6）
- `scripts/apply-patch.mjs:2-9`：读取 `patch.yml`（:8）、打印补丁面（:9）；:5-6 依赖 `DSH_HARNESS_SOURCE_ROOT` 环境变量
- `package.json:7`：`"apply-patch": "node scripts/apply-patch.mjs"` 施加入口（:3 `version: 0.1.1` 标记旧代）

**耦合点**：① 补丁面 schema（`surface/target/replacements/find/replace`）；② cordis profile 组合键 `patch:`；③ 补丁目标是 DSH **源码内部**文件与导出符号 `renderSessionView`（内部布局 + 私有符号双重耦合）；④ 施加脚本依赖 harness 源码根环境变量与 `dsh` CLI。

**变更卡映射**
- `A?-??`[ID-推断]「源码补丁面 / `patch:` 组合键契约在走廊内变更」→ 命中 ①②④；
- `A1-??`[ID-推断]「UI 分解：重构/移除 `src/session/view/SessionView.ts` 与 `renderSessionView`」→ 命中 ③（与 #5 同一张卡的跨面命中）。

**净状态**：`find` 串指向 UI 分解的重构面，目标版本上存在符号失配风险（被移除/改名则替换无落点）；该面是否折叠本臂无法核实 → 按最终净态保守判为“须对照目标版本源码/卡目录核对后才能确认可施加”，不能静态下“安全”结论。

### #2 events（internal/persistent） —— 命中

**命中文件/行**：`src/index.ts:15-19`（`ctx.emit('session/event', { type:'legacy/informational-note', ignorable:true, payload:{text:'fixture'} })`；`ignorable` 在 :17）；`src/index.ts:20-22`（`ctx.on('session/event', ...)` 订阅侧）。注释 :13-14 明示这是“外部 informational 持久事件的生产者”，且记录了 alpha.1 删除 / alpha.2 恢复的走廊事实。

**耦合点**：`session/event` 通道；SessionEvent 形状（`type`/`ignorable`/`payload`）；外部 informational 事件的**生产者契约**与**持久化契约**；订阅 API `ctx.on`。

**变更卡映射（折叠型，见 §3）**
- `A1-??`[ID-推断]「移除 SessionEvent `ignorable` 标记字段」（0.1.2-alpha.1）→ 命中 :17 → **净抵消（superseded）**；
- `A2-??`[ID-推断]「恢复外部 informational 事件 producer/persistence 契约」（0.1.2-alpha.2）→ **治理卡（governing）**。

**净状态**：按最终净态 = 标记字段有效 → :17 净无破坏；但生产者必须符合 alpha.2 恢复的契约（type 命名空间、payload、持久化语义）→ 触点成立，需按恢复卡核对生产者实现。

### #3 service/Remote —— 命中

**命中文件/行**：`src/index.ts:25-28`（`ctx.register('rename-session', ...)`；`await ctx.get('apiProxy')` :26；`apiProxy.invoke('session.rename', { id, title })` :27）；`src/index.ts:29-32`（`ctx.register('list-providers')`；`ctx.get('apiProxy')` :30；`apiProxy.invoke('llm.providers')` :31）。

**耦合点**：① Host 侧服务 id `apiProxy`（`ctx.get('apiProxy')`）；② APIProxy 远程调用形态 `invoke(method, args)`；③ 远程方法命名空间 `session.rename`、`llm.providers`；④ 服务注册/暴露形态 `ctx.register(name, handler)`（服务名 `rename-session`/`list-providers`）。

**变更卡映射**：`A?-??`[ID-推断]「service/Remote：Host APIProxy 面在走廊内变更（服务 id 与/或 Remote 调用契约 / 方法命名空间）」→ 命中 ①②③（④为次级耦合面）。

**净状态**：**双层耦合**（服务 id + 方法命名空间），任一层变更即破坏；本臂无卡目录，最终净态须对照 0.1.2-alpha.2 的 service/Remote 契约核实；若属“删除后恢复”型，按 §3 折叠规则以净态为准。

### #4 host directory —— 命中

**命中文件/行**：`src/index.ts:35-38`（`ctx.register('write-note', ...)`；`join(homedir(), '.dsh', 'profiles', 'default')` :36；`writeFileSync(join(profileDir, 'legacy-note.txt'), text)` :37）。注释 :34 明示「Hard-coded Host/profile path」。

**耦合点**：硬编码 Host 目录布局 `~/.dsh/profiles/default`（profile 目录路径字面量）；直接写文件而非经 Host 路径/文件系统 API；写入目标 `legacy-note.txt`。

**变更卡映射**：`A?-??`[ID-推断]「Host 目录 / profile 路径布局变更」→ 命中。

**净状态**：路径字面量即耦合点，静态确凿命中；目标版本若迁移/改名 profiles 目录（或改用平台数据目录 / 受管路径 API），该写入将落到错误位置或直接失败。折叠情况无证据、无从推定，按目标版本最终布局判定。

### #5 UI/commands/tools —— 命中

**命中文件/行**：`src/index.ts:9-10`（`import { SessionView } from '@deepseek-ai/dsh-session-view/internal'`；注释 :9「private Host/Web Client path removed by UI decomposition」）；`src/index.ts:41-43`（`ctx.contributes.registerCommand('legacy.openView', ...)` :41；`new SessionView({ enhanced: true })` :42）。**跨面命中**：`patch.yml:3,5` 的补丁目标正是 `SessionView.ts` / `renderSessionView`（UI 分解重构面，见 #1）。

**耦合点**：① 私有包内路径 `@deepseek-ai/dsh-session-view/internal`（Host/Web Client 私有入口）；② 命令注册 API `ctx.contributes.registerCommand`；③ `SessionView` 构造签名 `{ enhanced: true }`；④ tools 子面未见工具注册调用（排除记录见 §5）。

**变更卡映射**
- `A1-??`[ID-推断]「UI 分解：移除 Host/Web Client 私有路径（`.../internal`）、重组 UI 包」→ 命中 ①③，并连带 #1 的补丁目标；
- `A?-??`[ID-推断]「commands/tools 注册 API 变更（`ctx.contributes.*` 面）」→ 命中 ②。

**净状态**：`/internal` 入口按注释在走廊内被 UI 分解**移除**（无恢复证据）→ 目标版本上为**净命中、必须迁移**；`registerCommand` 面按最终 API 判定。与 #1 的联动意味着同一张 UI 分解卡同时打中两个触点类别。

### #6 custom channel —— 命中

**命中文件/行**：`src/index.ts:45-54`（注释 :45「Private loopback HTTP bridge that bypasses the Host Gateway authentication model」；`createServer` :48；`server.listen(43121, '127.0.0.1')` :51；注释 :51 给出端点 `http://localhost:43121/api/legacy`；:46-47、:54 说明函数不被调用、保持静态）。

**耦合点**：自建 HTTP 回环通道（127.0.0.1:43121、路径 `/api/legacy`）；**绕过 Host Gateway 鉴权模型**；未向 channel 体系注册/声明。

**变更卡映射**：`A?-??`[ID-推断]「custom channel 契约：通道须经 Host Gateway 注册与鉴权」→ 命中。

**净状态**：目标版本 Gateway 鉴权模型下，该裸回环桥属违规/失效面；静态命中确凿（端口、地址字面量 + 注释明示）。注意 :54 `void startLegacyBridge` 使其当前为**休眠耦合**：一旦被启用即触发 —— 不能因“未调用”判为无问题。

### #7 subprocess/output parsing —— 命中

**命中文件/行**
- `src/index.ts:56-67`：`spawn('dsh', ['--profile','headless', prompt])` :59；`child.stdout.on('data', ...)` :61 按块读取；`JSON.parse(line.toString())` :62；`event.type === 'final'` → `event.text` :63；注释 :56「wrong wrapper assumption: treats headless stdout as JSONL」
- `scripts/apply-patch.mjs:11-18`：`execFileSync('dsh', ['--profile','headless','ping'])` :12-14；对 stdout 逐行 `JSON.parse` :15-18；`event.type === 'final'` / `event.text` :18；注释 :11「target headless stdout is final text, not JSONL」

**耦合点**：① 子进程调用 dsh headless CLI（`--profile headless`）；② 把 stdout 当 JSONL 逐行/逐块解析（错误假设）；③ 事件形状 `type==='final'` / `text` 字段；④ 缓冲边界问题（`data` 事件按块不按行，叠加缺陷）。

**变更卡映射**：`A?-??`[ID-推断]「headless 输出契约变更：stdout = 最终文本，而非 JSONL（事件流另有出口）」→ 命中 ①②③。

**净状态**：目标版本 stdout 为最终文本 → 现有逐行 `JSON.parse` 必然抛错或得不到结果（fixture 注释明示为“故意错误假设”）→ **净命中、必须迁移**（改为读取最终文本，或改用 JSONL/事件出口）。④ 与走廊无关但迁移时应一并修正。无删除-恢复证据，直接按目标净态判定。

---

## 5. 无命中情况说明（题面要求 3）

**整类无命中的类别：无 —— 七类全部命中**（与 `fixture/README.md:8-16` 触点索引表一致）。以下补足“扫了什么、排除了什么、为何不能以无命中下结论”：

**类内子面的排除记录（scanned & ruled out）**
- **#5 tools 子面**：检索 `registerTool|tool*|contributes.*` → 仅 `ctx.contributes.registerCommand`（src/index.ts:41）；排除工具注册形态（68 行全文通读确认）。
- **#6 其他通道形态**：检索 `WebSocket|ws:|socket|net\.|fetch\(|axios` 及端口字面量 → 仅 `node:http createServer` + `127.0.0.1:43121`（src/index.ts:48,51）；排除 WebSocket / 其他自定义传输。
- **#2 其他事件面**：仅 `session/event` 一个通道（emit :15 / on :20），无其他 emit/on 通道。
- **#3 其他服务面**：仅 `apiProxy` 一个 `ctx.get(...)` 服务 id（:26、:30）；`ctx.register` 仅 4 个本地服务名（`rename-session`/`list-providers`/`write-note`/`headless-ask`）。
- **#4 其他路径字面量**：仅 `~/.dsh/profiles/default`（:36）与相对文件 `patch.yml`（apply-patch.mjs:8）。
- **#7 其他子进程形态**：仅 `spawn`（index.ts:59）与 `execFileSync`（apply-patch.mjs:12），目标均为 `dsh`。

**为什么“无命中 ≠ 无问题”**
1. **静态拷贝不可执行**：fixture 按设计不可编译（README.md:3），模块解析/类型层面的破坏无法静态排除；
2. **间接耦合**：传递依赖、Host 运行时注入的 API 形状、行为语义（持久化、鉴权、输出格式）没有静态签名可检索；
3. **动态形态逃逸**：字符串拼接调用、动态 import、配置驱动的目标路径不会被正则触点扫描捕获；
4. **折叠只对有证据的字段成立**：删除-恢复型折叠须以卡目录/目标版本契约为证，未标注字段不能推定为“净无变化”；
5. **休眠耦合**：如 #6 的未调用函数（index.ts:47-54），静态上“不执行”但启用即触发；
6. **补丁面需外部对照**：#1 的 `find` 串是否失配取决于目标版本源码符号，静态扫描只能标风险，不能下“安全”结论。

因此本报告所有“无命中/排除”结论的语义是**“未发现静态直接耦合点”**，不构成迁移安全背书；确认结论需要动态验证（超出本只读任务范围）。

---

## 6. 变更卡映射汇总（含折叠判定）

| 触点 | 命中简写 | 变更卡（内容要点） | 落点版本 | 折叠 / 净状态 |
|---|---|---|---|---|
| #1 | cordis.patch.yml:5-6、patch.yml:2-7、apply-patch.mjs:2-18 | 补丁面 / `patch:` 组合键契约变更（`A?-??`） | 走廊内（待卡目录核实） | 折叠未知，保守按目标 schema 净态 |
| #1 | patch.yml:3,5（目标符号） | UI 分解重构 `SessionView.ts` / `renderSessionView`（`A1-??`） | 0.1.2-alpha.1 | 净命中风险：`find` 串可能失配 |
| #2 | index.ts:17（`ignorable`） | 移除 `ignorable` 标记（`A1-??`） | 0.1.2-alpha.1 | **折叠 → 净抵消（superseded）** |
| #2 | index.ts:15-22（生产者/订阅） | 恢复外部 informational 事件 producer/persistence 契约（`A2-??`） | 0.1.2-alpha.2 | **治理卡**：净态=字段有效，契约须遵守 |
| #3 | index.ts:26-27、30-31 | service/Remote：APIProxy 服务 id + `invoke` 方法命名空间（`A?-??`） | 走廊内 | 双层耦合，任一层变更即破坏 |
| #4 | index.ts:36-37 | Host 目录 / profile 路径布局变更（`A?-??`） | 走廊内 | 路径字面量确凿命中 |
| #5 | index.ts:10、42 | UI 分解移除 `@deepseek-ai/dsh-session-view/internal`（`A1-??`） | 0.1.2-alpha.1 | 净命中（无恢复证据）→ 必须迁移 |
| #5 | index.ts:41 | commands/tools 注册 API 变更（`ctx.contributes.*`）（`A?-??`） | 走廊内 | 按最终 API 判定 |
| #6 | index.ts:48、51 | custom channel 须经 Host Gateway 注册/鉴权（`A?-??`） | 走廊内 | 裸回环桥净命中（休眠耦合） |
| #7 | index.ts:59-63、apply-patch.mjs:12-18 | headless 输出契约：stdout=最终文本、非 JSONL（`A?-??`） | 走廊内 | 净命中 → 必须迁移 |

> 所有 `A?-??`/`A1-??`/`A2-??` 均为 [ID-推断] 占位：本臂（noskill）禁读 `skills/`，无法核实 A1-01 形式的确切卡序。卡片内容要点、落点版本与折叠判定基于 fixture 内实证注释（index.ts:9、:13-14、:24、:34、:45、:56；apply-patch.mjs:11；README.md:8-16）与触点语义，可逐条核对。

---

## 7. 只读声明与 fixture 完整性

- 对 `fixture/` **零写入/零修改/零删除**；未执行 apply-patch、未运行插件、未安装/迁移、未访问容器外资源；临时与产出文件仅写入 `agent-output/`。
- 扫描前后 SHA-256 一致（前后各测一次，逐字节未变）：

| 文件 | SHA-256 |
|---|---|
| fixture/README.md | 84B8FD89D9E05ABCC4543381A5C50D81FD0F57344879D8BF560DCF3495E79800 |
| fixture/cordis.patch.yml | A9FEAA3EC0F63CEDF8E84416F532B53086A7C4EF508DBC280957E79F16DD9668 |
| fixture/package.json | AF1E498CA6F80B65329C7A1DD017D97761391D7032CF7D02F3F44832F920446E |
| fixture/patch.yml | DE622598FC298F54F2F86EE48734C0C615F02BC9BAB6FE9BA234339E6C595B3B |
| fixture/scripts/apply-patch.mjs | 4D6744BAF58FE05524BDCF23A5E289A6292E059BB2272342A5A0448E091221F0 |
| fixture/src/index.ts | 429979274FE9776E22809E0A2725C88C70B7B3127926A8EFCC0E4335D7C086D0 |

---

## run-stats

- **toolcalls 总数**：24 次底层工具调用（pwsh 7 · read 6 · grep 3 · write 4 · glob 1 · todo_write 1 · send_message 1 · 直接调用失败 1），封装于 10 次 run_code 执行器调用；明细见 `agent-output/tool-transcript.txt`
- **token 用量**：n/a（本会话不暴露用量计数）
- **完成时间**：2026-10-21T12:19:45.1253547+08:00 [Asia/Shanghai]


#### FILE: tool-transcript.txt

1. pwsh Get-ChildItem -Force | Select-Object Mode,Length,Name（列单元格目录 E:\...\S1-static-scan）
2. pwsh Get-ChildItem -Recurse -Force fixture | Select-Object FullName,Length（列 fixture 树）
3. pwsh Get-ChildItem -Recurse -Force agent-output | Select-Object FullName,Length（列输出目录，当时为空）
4. pwsh Get-ChildItem -Recurse -Force fixture | ForEach-Object { 相对路径 + Length }（fixture 相对路径清单）
5. read E:\...\S1-static-scan\fixture\README.md（全 16 行）
6. read E:\...\S1-static-scan\fixture\package.json（全 9 行）
7. read E:\...\S1-static-scan\fixture\cordis.patch.yml（全 6 行）
8. read E:\...\S1-static-scan\fixture\patch.yml（全 7 行）
9. read E:\...\S1-static-scan\fixture\scripts\apply-patch.mjs（全 19 行）
10. read E:\...\S1-static-scan\fixture\src\index.ts（全 68 行）
11. todo_write 六项任务清单（直接调用失败：unknown tool，仅 run_code 可直接调用）
12. todo_write 六项任务清单（经 run_code 调用，成功）
13. grep pattern="patch|surface|replacements|apply-patch|DSH_HARNESS_SOURCE_ROOT|execFileSync|spawn|JSON\.parse|headless|stdout" path=fixture
14. grep pattern="session/event|ignorable|apiProxy|invoke|registerCommand|SessionView|contributes|internal" path=fixture
15. grep pattern="homedir|\.dsh|profiles|createServer|listen\(|43121|localhost|127\.0\.0\.1|WebSocket|socket|fetch\(|net\.|http" path=fixture
16. glob pattern="**/*" path=E:\...\S1-static-scan（确认仅 fixture 下 6 个文件）
17. pwsh Get-ChildItem -Recurse -File fixture | Get-FileHash -Algorithm SHA256; Get-Date -Format o（fixture 完整性基线 + 时间）
18. pwsh New-Item -ItemType Directory -Force -Path agent-output\S1-static-scan; Get-Date -Format o
19. write E:\...\S1-static-scan\agent-output\S1-static-scan\report.md（触点扫描报告，12756 字符）
20. write E:\...\S1-static-scan\agent-output\report.md（同内容镜像副本）
21. write E:\...\S1-static-scan\agent-output\tool-transcript.txt
22. write E:\...\S1-static-scan\agent-output\transcript-manifest.txt
23. pwsh Get-FileHash -Algorithm SHA256 fixture 6 文件对比 + Get-Item 报告大小校验 + Get-Date -Format o（收尾校验）
24. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e <结果摘要：七类全命中/折叠判定/卡序号 blocker/报告路径>


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\cordis.patch.yml
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\package.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\patch.yml
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\scripts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\scripts\apply-patch.mjs
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\src
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\fixture\src\index.ts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output\report.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output\S1-static-scan\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output\S1-static-scan
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output\S1-static-scan\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S1-static-scan\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.