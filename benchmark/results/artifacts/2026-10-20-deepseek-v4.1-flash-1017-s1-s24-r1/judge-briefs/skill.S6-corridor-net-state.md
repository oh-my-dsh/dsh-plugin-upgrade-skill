# JUDGE BRIEF · skill.S6-corridor-net-state

## Criteria (sealed rubric)
- [corridor-net-state] (25pt) Explain alpha.1 removal followed by alpha.2 restoration of SessionEvent.ignorable retention, applying the final alpha.2 state to produceExternalEvent in src/events.ts. Correct version history is required; bare A1-02/A2-01 card names earn no credit, and equivalent history without card IDs is acceptable.
- [remove-marker-stripping] (25pt) Locate delete (event as any).ignorable and reject the comment prescribing continued stripping on alpha.2. Recommend removing that defense and correcting its obsolete rationale. Distinguish removing the stripping code from removing the marker itself. It is valid to note that the shown literal currently has no marker, so the delete is a no-op, while still rejecting the intended stripping policy.
- [informational-producer] (25pt) Explain that only informational events whose semantics old readers may omit without breaking reconstruction can carry ignorable:true; required events must not be made ignorable. Retention across persistence/reload is not a reader-side filtering instruction: marked events remain in the loaded log. Apply this to the third-party/informational producer while respecting the live append limitation.
- [public-append-gap] (25pt) Identify the public live Session.append capability gap: it has no supported ignorable parameter. Ordinary plugins must not fake an entry with a cast, invented argument or unsupported API. Explicitly defer the exact producer/persistence integration pending target API verification; naming an undocumented successor is not required. Proposed retention/required-event checks are valid but actual execution is not required.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [keep-stripping-marker] ceiling=10 Trigger only when the final recommendation affirmatively keeps the alpha.1 defense or continues deleting the marker on alpha.2. Negating that recommendation, quoting the old code for diagnosis, or removing the delete statement does not trigger it. Read the entire sentence and conclusion, including double negation and later contradictions.

## Candidate report(s)
#### FILE: S6-corridor-net-state/S6-corridor-net-state-report.md

# S6 · Corridor Net-State 判定报告（只读）

- 对象：`fixture/src/events.ts`（`dsh-events-bench` 0.1.0，`private: true`，仅 3 个文件：README.md / package.json / src/events.ts）
- 目标 host：**DSH 0.1.2-alpha.2**
- 任务类型：Mode A（只读评审）→ 给出 Mode C 语义的迁移判定，**未修改 `fixture/` 下任何文件**（全程只用 read/glob/grep）
- 证据来源：本格 `fixture/` + 只读 skill `skills/plugin-upgrade`（SKILL.md、references 卡片、api ledger、examples）。未联网、未执行 git、未安装依赖。

---

## 0. 结论（先给判定）

| 项 | 判定 |
|---|---|
| 这段 alpha.1 时代"防御代码"（`delete (event as any).ignorable`） | **删除（delete）**，且不保留、不改成"条件删除" |
| 判定依据类型 | 走廊净态（remove-then-restore）+ 该 delete 在语义上是**反向**的 |
| 普通插件经公开 `Session.append(...)` 能否写入 `ignorable: true` | **不能**（alpha.2 公开 append 无该参数）→ 记为 **capability gap**，不得用 cast 伪造 |
| 该文件的真实风险 | 不是"少删了 marker"，而是"**多删了 marker + 用对象形状调用 append**"，静默写入 / 冷加载整会话拒载 |

一句话：注释给出的三条理由里，一条只对 alpha.1 成立（已被 alpha.2 回退），另外两条方向错误；防御代码本身就是引入缺陷的那一行。

---

## 1. 走廊历史与净态折叠（fate 的推理）

### 1.1 该语义的走廊轨迹（按 `from → to` 元数据，不按文件名排序）

| 版本段 | 语义状态 | 卡片 / 出处 |
|---|---|---|
| rc.2（基线，编队内其它插件当前假设） | `SessionEvent.ignorable` 存在，producer 可写 `ignorable: true` | 走廊起点；ledger 以 rc.2→alpha.2 为跨度 |
| **alpha.1** | **临时移除** `SessionEvent.ignorable`：第三方信息性事件无法保留 marker，first-party reader 遇未知持久事件按"必需事件"拒绝 reload | `DSH-0.1.2-A1-02`（v0.1.2-alpha.1.md） |
| **alpha.2（本任务目标）** | **恢复（revert）** 保留语义：envelope / persistence / reload / transport 全链路原样保留该字段；未知事件**不带** marker 仍 required-on-read | `DSH-0.1.2-A2-01`（v0.1.2-alpha.2.md），明确标注"revert of A1-02" |
| alpha.3 / alpha.4 / alpha.5 / rc.1 | 可用卡片中**无再次移除**该语义的条目（alpha.4 动的是 `Session.events` 读接口 → `seq`/`eventAt`/`snapshotEvents`，不是 envelope 保留语义） | 见 §7 证据清单 |
| 0.1.5-alpha.2 及更晚 | `ignorable` 语义仍在，并再次确认"**`Session.append()` 没有 ignorable 通道**"，producer 无法自行标记；新事件因无 marker 导致旧 host 单向不可读 | `DSH-0.1.5-A2-05` |

### 1.2 净态 = "移除后又恢复" ⇒ 终态与起点一致

skill 的规范要求（SKILL.md Step 2 / references/README.md / rollup-0.1.2.md 的跨版本 revert 说明）是：**先把整条走廊折叠成净态，再改源码；中途移除、目标版本恢复的字段，不得"先删再补"**；并明确写了"若最终目标恢复了该语义，则旧版本适配里留下的防御代码应当**删除而不是保留**"。`ignorable` 就是这条规则点名的典型例子（A1-02 → A2-01）。

由此：

- 目标 alpha.2 上，正确的 producer 终态是**照常携带 `ignorable: true`**，与 rc.2 一致；
- 被这一行 delete 掉的 marker，正是 alpha.2 恢复的那部分能力；
- 所以「迁移时继续保留」= 把 alpha.1 的临时退化固化成永久行为，让 alpha.2 上写出的会话在冷加载时被当作必需事件拒绝 → **保留即制造 A2-01 描述的故障**。判定：**删除**。

### 1.3 这段代码在目标版本上其实三重失效（逐条看代码本身）

1. **它是空操作**：事件对象字面量只有 `{ type, payload }`，**从未设置** `ignorable`，`delete` 删的是不存在的属性。即便"删掉 marker"这个动作在 alpha.2 上也不改变任何字节 —— 注释声称的因果链（"不删就会被拒"）在代码里根本不成立。
2. **语义方向相反**：reader 的规则是"未知类型 + 已带 `ignorable: true` → 可跳过；缺字段 → 视为必需并拒绝"。marker 是**放行依据**，不是**拒绝依据**。删 marker 才是触发拒载的动作。
3. **调用形状可疑**：ledger 记录的 alpha.2 公开 `Session.append()` 接受 `type`、`data` 与（仅 surface 事件可用的）`SurfaceIntent`；本文件用**单个对象**调 `session.append(event)`，且 `session: any` 把类型检查绕过了。这条能否在 alpha.2 运行期成立 → §6 标为 **unconfirmed**；但无论成立与否，结论不变：即使写入成功，也**不会**为事件写入 `ignorable`。

---

## 2. 正确的 producer 语义 & 普通插件应做什么

### 2.1 producer 侧语义（A2-01 的要点）

- `ignorable: true` 只用于**信息性**事件：语义可被不认识该类型的旧 reader 省略，且省略后**不改变**会话重建结果；
- 它**不是** consumer 侧的过滤开关：事件 reload 后仍然留在 loaded events 里，消费者用它是自身选择，不能靠它把事件"藏起来"；
- 写 `ignorable` 是**producer 的责任**：缺字段 = 必需事件；reader 遇到未知的必需事件必须 fail-closed（这正是我们想避免的结局，而不是想制造的行为）；
- 持久化/传输层（JSONL、SQLite、API transport、生成的 catalog）必须**原样保留**该字段，不许在读写往返里丢失。

### 2.2 走 `Session.append(...)` 的普通插件（关键的能力缺口）

- alpha.2 **只恢复了 envelope/持久化/重载/传输的保留语义**；
- **公开的 `Session.append()` 仍然没有 `ignorable` 参数**，也不会把该字段写进事件 → 仓库外插件用"自定义 `SessionEventMap` + `append()`"持久化状态，会得到**静默写入 / 大声读取**：live append 成功、能落盘，但下次**冷加载**抛 `SessionFormatUnsupportedError`，**整个 Session 拒载**。一次 live smoke 测不出来。
- 正确处置顺序：
  1. **不要**用 cast / 解冻对象 / 手改 JSONL 去伪造一个"公开入口"；`(event as any).ignorable = true` 与本题的 `delete` 属于同一类错误（用类型逃逸掩盖缺口）；
  2. 仓库外插件在 alpha.2 上**不要**用自定义事件 + `append()` 存状态，改用**插件自有 sidecar/store**，以 Session id 为键；
  3. 若要复用已有事件，只能复用其**真实且完全一致**的语义，不得把插件状态伪装成 core / model-visible 事件；
  4. 注册事件名 **不等于** 获得写入 marker 的能力；把"第三方持久事件"这条 seam 明确记为 **capability gap / pending**，等上游提供 `append(..., { ignorable: true })` 之类的正式机制后再评估；
  5. 若确实在自有持久化 seam（自建 envelope、测试夹具、seed）里写 marker，必须做**真实 persist → 进程重启/冷加载**验证，不能只测 live append。

### 2.3 落到本 fixture 的具体动作（描述，不执行）

- 删除 `delete (event as any).ignorable` 整行及那段陷阱注释（注释本身是错误依据，留着会误导下一个迁移者）；
- **不要**顺手补一句 `event.ignorable = true` 再调 `append`：`append` 不会持久化该字段，只会把"静默写入 / 冷加载拒载"从潜在变成必然；
- 该函数若确需持久信息性状态：改为插件自有 sidecar 存储；并在文件/README 里标注 producer-seam 能力缺口与目标版本（alpha.2）；
- 若该函数仅是"第三方持久事件 producer"的示意：保留 `ignorable: true` 的**生产者意图**（作为文档/未来 API 的占位），但必须显式写清"当前公开 append 无法承载，属 pending，不得用 cast 假装"。

---

## 3. 用证据否定注释（Decide by evidence, not by comment）

| 注释主张 | 判定 | 证据 |
|---|---|---|
| "alpha.1 移除了 `SessionEvent.ignorable`（DSH-0.1.2-A1-02）" | **成立，但只对 alpha.1 成立** | A1-02 标题即"temporarily removed"；A2-01 是它的 revert |
| "不删 marker 会被 reader 拒绝" | **错误（方向反了）** | 规则是"未知类型 + 带 marker → 可跳过；缺 marker → 必需并拒绝"（A2-01 / API-05） |
| "迁移到 alpha.2 时这段要继续保留" | **错误，且与 A1-02 自身的指引冲突** | A1-02 的 migration recipe 明写：若最终目标是 alpha.2 或更晚，**先读 A2-01 折叠净态，不要先删 marker 再补**；rollup 进一步要求"目标恢复语义时删除旧版本防御代码" |
| 隐含前提"删了 marker 就能安全写入" | **错误** | 删 marker 只会让事件变成 required-on-read；真正卡住第三方 producer 的是 `append()` 无该参数（A2-01 / API-05 / 0.1.5-A2-05 复述） |

补充证据强度说明：`fixture/README.md` 自身也写明本段属于 "remove-then-restore" 陷阱、正确动作是删除该防御 —— 但**判定不以该 README 的结论为依据**，而是由 A1-02/A2-01 的语义 + 走廊折叠规则 + 代码本身（空操作、方向相反、调用形状无 marker 通道）独立推出；README 只作为交叉校验。

---

## 4. 验证计划（目标 alpha.2，尚未执行 —— 本任务只读）

1. **静态**：删除该行后 typecheck 应更干净（`session: any` 掩盖的问题会显形）；确认仓库内没有第二处 `delete .*ignorable` / `ignorable.*=.*undefined`。
2. **冷加载（关键）**：构造一次真实 "append → 关闭进程 → 冷启动 load Session"；预期：带 `ignorable: true` 的未知事件 reload 后仍在 loaded events 中且可跳过；不带 marker 的未知事件被**明确拒绝**（fail-closed），错误类型为 `SessionFormatUnsupportedError`。
3. **持久化层**：JSONL / SQLite / transport 往返逐层抽查该字段是否原样保留；注意 SQLite provider 只接受 schema 20、不自动迁移 19、其它 schema 直接拒绝 —— 升级前先备份/导出。
4. **回归**：对 `Session.append` 路径只跑 live smoke 是**无效验证**（静默写入），必须覆盖冷加载。
5. 若插件最终保留"第三方持久事件"路径：冷加载失败时按迁移阻断处理（移除该持久化方案），不要吞异常。

---

## 5. 本报告的边界与未改动声明

- `fixture/` 全程只读：3 个文件均以 read/glob 访问，**未写入、未格式化、未执行**；未运行 `git`、未安装依赖、未联网。
- 本报告只写在本格 `agent-output/S6-corridor-net-state/` 下。
- 引用卡片仅记要点与卡片 ID，未整段转抄。

---

## 6. 未确认项（unconfirmed）

1. **fixture 的 `session.append(event)` 单对象调用形状在 alpha.2 运行期是否被接受**：本地无 alpha.2 host/源码，无法实测；ledger 记录的公开签名是 `append(type, data, intent?)`，因此至少可判定"不是公开契约形状"。**未确认**。
2. **alpha.2 源码级的 `delete` 之后字段缺失的确切报错文本/栈**：只能引用卡片描述（`SessionFormatUnsupportedError` 拒绝整个 Session），**未在真实 host 上复现**。
3. **0.1.2-alpha.3 ~ rc.1 各边是否另有涉及 `ignorable` 的未编卡改动**：卡片是 curated 列表而非完整 diff；本报告只声明"在可用卡片中未发现再次移除"。上游 tag 对比**未做**（禁网）。
4. **该插件在真实 profile 中的挂载/启用身份**：fixture 无 `dsh-plugin.json`、无 DSH peer 依赖、`private: true`，无法评估实际安装形态与 peer 兼容性。**未确认**。
5. **fixture 相对 git HEAD 未被改动**：约束要求"保持不变"，我未做任何写操作，但本地禁止执行 git，**无法自证** 字节级一致（仅有"未写入"这一行为保证）。
6. 后续走廊（0.1.5-alpha.2 的非 ignorable 新事件、0.1.6-alpha.1 的 session event 读接口弃用）仅用于说明该语义**至今未被再次移除**，对 alpha.2 目标不构成额外动作。

---

## 7. 证据清单（卡片 ID / 文档要点）

| ID / 文件 | 与本判定的关系 |
|---|---|
| `DSH-0.1.2-A1-02`（references/v0.1.2-alpha.1.md） | alpha.1 临时移除 `ignorable`；**其 recipe 明确指向"若目标 ≥ alpha.2 先折叠净态、不要先删再补"** |
| `DSH-0.1.2-A2-01`（references/v0.1.2-alpha.2.md） | 恢复 envelope/持久化/reload/transport 保留语义；producer 只用信息性事件；公开 `append` 无该参数 → capability gap；SQLite schema 20 |
| `API-05`（references/api-migration-0.1.2-alpha.2.md） | 危险遗留模式：`SessionEventMap` 扩充 + `append()` → live 成功、冷加载 `SessionFormatUnsupportedError` 整会话拒载；禁止 cast/解冻/手改 JSONL；建议 sidecar/store |
| `rollup-0.1.2.md`（跨版本 revert 说明） | 明确点名 `ignorable` 为 remove-then-restore 的典型；"目标恢复语义时，旧版本防御代码应删除而非保留" = 本判定的规范依据 |
| `references/README.md` | 走廊按 `from → to` 连接、先算净态；卡片是 curated 非完整 diff（据此声明 §6.3） |
| `SKILL.md` Mode C Step 2 | "先读整条走廊再算净态；中途移除、目标恢复的字段不要先删再补" |
| `DSH-0.1.5-A2-05`（references/v0.1.5-alpha.2.md） | 该语义至今仍在；再次确认 `Session.append()` 无 ignorable 通道（capability gap 属长期状态，不是本插件的误用） |
| examples/legacy-plugin/src/index.ts | 同一走廊的正确 producer 姿态参照：事件携带 `ignorable: true`，注释说明 alpha.2 恢复了 producer 契约（**静态夹具，未执行**） |

---

### 附：最小 diff 意图（未执行，供维护者落地）

```diff
 export function produceExternalEvent(session: any, payload: any): void {
   const event = { type: 'third-party/informational', payload }
-  // alpha.1 移除了 SessionEvent.ignorable（DSH-0.1.2-A1-02）。不删 marker 会被
-  // reader 拒绝，所以这里先把 marker 删掉再写。迁移到 alpha.2 时这段要继续
-  // 保留。——社区注释（陷阱：alpha.2 已恢复保留语义，这段防御应当删除）
-  delete (event as any).ignorable
   session.append(event)
 }
```

> 注意：仅删这一行只是"停止主动破坏"；`append(event)` 本身仍不是 alpha.2 的公开写入契约，也不能承载 `ignorable`。真正的修复是按 §2.2 改走插件自有 sidecar，或把该路径标为 pending capability gap。**不要把"删掉 delete"误当成"已经支持第三方持久事件"。**


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.