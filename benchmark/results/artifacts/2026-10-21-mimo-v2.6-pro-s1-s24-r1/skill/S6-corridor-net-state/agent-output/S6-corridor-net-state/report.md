# S6 · Corridor Net-State Judgment — 第三方持久事件防御代码迁移报告（只读）

- **对象**: `fixture/src/events.ts` 中 `produceExternalEvent()` 的防御代码（写第三方持久事件前 `delete (event as any).ignorable`）
- **目标宿主**: **0.1.2-alpha.2**
- **分析方式**: 只读。`/app/fixture/`（= 格目录 `fixture/`）逐字节未改动、代码未执行；无网络；未安装依赖、未建复现环境。
- **证据来源**: 格目录 fixture + 技能 `skills/plugin-upgrade/` 的走廊卡片与台账（仅引要点与卡片 ID，不全文粘贴）。
- **命中 touchpoint**: pre-flight.md #2（内部事件名与持久事件）；相关卡 `DSH-0.1.2-A1-02`、`DSH-0.1.2-A2-01`、`DSH-0.1.2-A1-06`。

## 1. 结论（fate of the defense code）

**删除（delete）** —— 迁移到 alpha.2 时把 `delete (event as any).ignorable` 连同其注释一并删除。

理由（走廊净态）：`ignorable` 语义在走廊内是 "remove-then-restore"：alpha.1 **临时移除**（`DSH-0.1.2-A1-02`），alpha.2 **恢复**（`DSH-0.1.2-A2-01`，明示 revert of A1-02）。目标是 alpha.2，净态 = 字段在场且端到端保留。alpha.1 时代的"主动丢弃 marker"防御在 alpha.2 是净新增伤害：它把事件降级为"未知且未标记 = 必需事件"，冷加载时第一方读取方 fail-closed，拒绝恢复整个 Session。

注释的因果判断对 alpha.2 是**反的**：不是"不删会被 reader 拒绝"，而是**删了才会被拒绝**。

## 2. 被审代码与注释主张

代码（`fixture/src/events.ts:1-8`）：构造事件字面量 `{ type: 'third-party/informational', payload }` → `delete (event as any).ignorable` → `session.append(event)`。

注释的三条主张及判定：

| # | 注释主张 | 判定 |
|---|---|---|
| a | alpha.1 移除了 `SessionEvent.ignorable` | 历史事实，但只是 `required-if-target-is-alpha.1` 的临时态 |
| b | 不删 marker 会被 reader 拒绝 | 对 alpha.2 不成立，恰好相反（见 `3、`4） |
| c | 迁移到 alpha.2 这段要继续保留 | 错误，与走廊净态规则直接冲突 |

## 3. 该语义跨版本走廊的完整历史（net state）

| 走廊位置 | 语义状态 | 证据（卡片 ID） |
|---|---|---|
| alpha.1 之前（rc.x，如 rc.2） | 事件信封可携带 `ignorable?: true`；读取方遇未知 `type` 时仅当事件**已带** `ignorable: true` 才可继续省略其语义并重建 Session；缺失字段 = 必需 → fail-closed。producer 在信封级写该字段 | `DSH-0.1.2-A2-01`（A1-02 的 revert 定性）；API-05 "envelope semantics ... still in effect"；rc.x 事件契约背景 `DSH-0.1.1-R1-06`（判别式是 `type`）。字段引入的确切版本 **unconfirmed** |
| alpha.1 | 字段**临时移除**：无法保留 marker，未知持久事件被第一方读取方按必需事件拒绝 reload；action level = `required-if-target-is-alpha.1`；其 recipe 自己写明：若最终目标是 alpha.2+，先算走廊净态，"不要先删 producer marker 再加回来" | `DSH-0.1.2-A1-02` |
| **alpha.2（本任务目标）** | `ignorable?: true` **恢复**；envelope / persistence / reload / transport 的**保留语义**恢复（JSONL、SQLite、API transport、生成的 catalog 均按原样保留字段）；**仍在丢 marker 的旧适配器会让读取方拒绝含未知事件的 Session** | `DSH-0.1.2-A2-01`（fix，revert of A1-02） |
| alpha.2 之后（佐证语义未再翻转） | 0.1.5-alpha.2：`storage-contract` 仍拒绝"未知且未标记 ignorable"的事件（refusing to interpret the log）；`Session.append()` 仍无 `ignorable` 通道；0.1.6-alpha.1 的 `image/offload` 等无 marker 的一等事件让旧构建直接拒绝日志 | `DSH-0.1.5-A2-05`；0.1.6-alpha.1 `image/offload` 卡 |

走廊规则（`rollup-0.1.2`，`ignorable` 是其点名的 canonical example）：revert 型变更先折叠净态再动源码；**目标版本恢复语义时，旧版本适配的防御代码应当删除而不是保留**。本例正是该规则的教科书场景。

## 4. 逐条证伪注释（以证据而非注释为准）

- **(a)** 部分为真，但 `DSH-0.1.2-A1-02` 的适用前提是"目标恰好是 alpha.1"；目标为 alpha.2 时该卡的动作不适用。
- **(b)** 对 alpha.2 为假：`DSH-0.1.2-A2-01` Symptoms 明确"还在丢 marker 的旧适配器会让第一方读取方拒绝含未知事件的 Session"；API-05 明确 "a missing field means required"。删除 marker 恰恰制造它声称要防的故障。
- **(c)** 为假：`DSH-0.1.2-A2-01` 与 `rollup-0.1.2` 净态规则要求删除防御；`DSH-0.1.2-A1-02` 的 recipe 也禁止"删了再加回"。

附带观察：该事件字面量从未携带 `ignorable`，这个 `delete` 运行期是 no-op；真正的危害是把"永远剥离 marker"固化为策略并写成迁移指引——一旦事件构造改为携带 `ignorable: true`（正确的 producer 意图），这段防御就会把它剥掉，主动制造故障。

（`fixture/README.md` 亦记载同样结论；本判定独立依据走廊卡片证据得出，不依赖注释与 README 的说法。）

## 5. 正确的 producer 语义（alpha.2）

- `ignorable: true` 只用于**辅助性信息**：缺少该插件的读取方可以省略其语义、仍能正确重建 Session；事件 reload 后仍在 loaded events 中；它**不是**消费端过滤指令。
- 缺失 = 必需：未知且未标记的事件 fail-closed，读取方拒绝解释日志 / 恢复 Session。
- 持久化与传输层（JSONL、SQLite、API transport、生成的 catalog）必须端到端**按原样保留**已有 marker；不得用 cast、对象解冻、手改 JSONL 绕过。
- 若目标恰为 alpha.1（本任务不是）：停止写该未知持久事件，或改用目标版本已知的公共事件词汇；不得把未知事件做成消费端白名单（`DSH-0.1.2-A1-02` recipe）。

## 6. 普通插件走 `Session.append(...)` 应该怎么做

事实（API-05）：alpha.2 的公开 `Session.append()` 只接受 `type`、`data` 与仅面向 surface 事件的 `SurfaceIntent` —— **公开 API 面上没有 `ignorable` 参数**，append 不会把该字段写进事件。因此：

1. **不要**用 cast / 对象展开 / 手写 JSONL 伪造 `ignorable` 再 append：live 写入可能成功，但下一次冷加载抛 `SessionFormatUnsupportedError`、整个 Session 拒绝恢复（silent write / loud read，单次 live smoke 测不出来）。
2. 普通（out-of-repo）插件在 alpha.2 **不应**用自定义 `SessionEventMap` + `Session.append()` 持久化插件状态：改用以 Session id 为键的插件自有 sidecar / store。
3. 若复用已知事件，只允许语义完全一致的复用；不得把插件状态伪装成模型可见 / 核心事件。
4. 不要把 plain `Session.append` 文档化为支持该字段；等上游提供受支持的 `append(..., { ignorable: true })` 或其他能持久化 omission-safety 标记的正式机制后，再重新评估第三方持久事件；仅注册事件名不算机制。
5. 若插件自持持久化 / 传输 seam（本 fixture 没有）：职责是端到端保留 marker + 未知必需事件 fail-closed。

## 7. 对本 fixture 的处置建议（只读任务，未改动）

- **删除** `delete (event as any).ignorable` 及整段误导注释；
- 更稳妥：不要经 `session.append` 写第三方持久事件（能力缺口），把 `third-party/informational` 挪到插件自有 sidecar；
- 若写入发生在插件自持的持久化 seam，则事件写 `ignorable: true`，绝不删除。

## 8. 验证要点（卡片 Verification 要点，落地时执行）

- 冷加载而非 live：persist → 进程重启 / 冷加载；带 `ignorable: true` 的未知事件 reload 后仍在 loaded events，旧读取方可省略其语义；
- 未知必需事件必须被显式拒绝（fail-closed 不放松）；
- 不得把 "plain `Session.append` 支持该字段" 当作验收项；
-（相邻非命中）`DSH-0.1.2-A2-01` 的 SQLite schema 20 说明：本 fixture 无持久化后端，不适用。

## 9. unconfirmed（不可核实项，按要求标注）

- 上游是否已在被查卡片覆盖范围（至 0.2.0-rc.2）之外提供 `append(..., { ignorable: true })` 或等价正式机制：**unconfirmed**（走廊卡片无记载；本任务禁网核实）。
- fixture 的 `session.append(event)`（对象式）与真实 alpha.2 `append(type, data)` 是否同构：**unconfirmed**（合成测试材料，`session: any`；不影响 marker 判定）。
- alpha.2 恢复决策原文 / release notes 未直接抓取（禁网），仅经 `DSH-0.1.2-A2-01` 的 Source 记录二手引用（决策文档 `2026-08-30-retain-ignorable-external-session-events.md`）。
- `ignorable` 字段的确切引入版本：**unconfirmed**（卡片自 rc.x 事件契约 `DSH-0.1.1-R1-06` 起描述契约，未记载该字段引入点）。
- fixture 代码未执行（README 标注 test material, do not execute）；"delete 运行期 no-op"为源码静态读出，未运行验证。

## 10. 报告结构收尾（skill 模板）

- **pre-existing**: not collected（只读审阅，无基线运行）
- **Completed**: 走廊净态判定（`DSH-0.1.2-A1-02` → `DSH-0.1.2-A2-01` remove-then-restore）；注释 (a)(b)(c) 逐条证伪；producer 语义（辅助性信息才标 `ignorable: true`，缺失 = 必需 fail-closed，持久化层端到端保留）；`Session.append` 无 `ignorable` 参数的能力缺口与 sidecar 替代方案；验证要点。卡片：`DSH-0.1.2-A1-02`、`DSH-0.1.2-A2-01`、API-05（`api-migration-0.1.2-alpha.2`）、`rollup-0.1.2` 走廊规则、`DSH-0.1.5-A2-05`（后走廊佐证）
- **Skipped**: touchpoint #1/#3/#4/#5/#6/#7 本 fixture 非命中；SQLite schema 20 非命中；capability 类无建议
- **Pending / residual risk**: 见 `9 unconfirmed 项
- **Rollback**: 不适用（全程只读；fixture 零写入，唯一写入是 agent-output 下的报告文件）
- **Recommendations**: 按 `7 删除防御并 sidecar 化；待上游 append 能力落地后再评估第三方持久事件

## run-stats

- toolcalls 总数: 34（run_code 12 次 + send_message 1 次 + 内嵌 read/grep/glob/write 21 次）
- token 用量: n/a（本会话不可见）
- 完成时间: 2026-10-21T14:14:46+08:00 [Asia/Shanghai]
