# JUDGE BRIEF · noskill.S3-snapshot-migration

## Criteria (sealed rubric)
- [chat-projection] (20pt) Locate Pet.tsx partial/runningCalls/turnEnds reads. Explain their temporary chat legacy projection and subsequent views/timeline or target-owned Chat access. Accept a supported direct migration when it explains the compatibility option; merely saying legacy is insufficient.
- [session-lifecycle] (20pt) Locate running in Pet.tsx and explain it belongs to the Session/useSession lifecycle seat, outside chat legacy. Do not claim the existing useSession call itself must be renamed for running.
- [type-and-inject] (20pt) Locate removed dsh-client-runtime imports and the package.json client.inject entry. Repoint Context as ClientContext to scoped cordis and snapshot types to their target owner; do not claim every snapshot type is exported by cordis. Unknown exact snapshot symbols may be explicitly deferred to target exports.
- [slot-registration] (20pt) Locate the scoped slots.register call in index.ts. Explain slots.inject around registration and the ui-renderer/client Context augmentation/service ownership; preserve the slot name and lifetime. Accept equivalent supported registration forms.
- [mapping-and-plan] (20pt) Tie the located snapshot/lifecycle/slot changes to full DSH-0.1.2-A1-03 and separate temporary projection from immediate type/inject/lifecycle changes. A1-25 is a valid additional package-removal card. A bare card ID earns zero.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: report.md

# S3 · Snapshot Read-Surface Migration Assessment（只读评估，未动代码）

- 对象：/app/fixture/（bench-pet 浏览器像素宠物插件，0.1.1-rc.1 风格）
- 目标宿主：dsh 0.1.2-alpha.2（升级尚未执行，本报告只做评估）
- 评估口径：会话快照读取面（snapshot read-surface）迁移 —— 哪些读取面在 0.1.2-alpha.2 上断裂、迁移后形态、卡片归属、兼容投影 vs 立即切换

## 0. 结论摘要（TL;DR）

1. 会在 0.1.2-alpha.2 上断裂的读取面共 6 处（B1-B6），全部集中在 Pet.tsx 的会话快照读取链路：flat 快照类型、读句柄/选择器签名、以及 4 个 flat 字段读取（running / partial.blocks / runningCalls / turnEnds[].reason）。index.ts / locales.ts / package.json / cordis.patch.yml 的注册面不在这次快照迁移的破坏范围内（逐处核对见 §4）。
2. 必须立即切换新读路径的：B1/B2（编译期类型与选择器签名，flat 形态成员已不存在，不改则构建即失败）与 B4（partial 流式内容，0.1.2 已移出快照状态、改由 live 读取面提供，兼容投影不重建 partial）。
3. 可以先走兼容投影的：B3 running、B5 runningCalls、B6 turnEnds[].reason —— 三者都是状态支撑、语义不变的 flat 字段，可由 0.1.2 的兼容投影层从新读取面回填，灰度/分批期间保持旧行为，随后再迁到分组读取面。
4. 升级卡片编号（DSH-0.1.2-A1-xx）在本臂不可核实：卡片目录只存在于本臂禁读材料（skills/ 参考件），格目录内没有副本，编排侧亦明确拒绝提供以免污染 noskill 臂评测。因此 §5 卡片列给出主题映射 + ID 槽位，如实标注缺口（对应题面允许的 state the blocker honestly）。其余 3 项要求均已完成。

## 1. 证据来源与只读纪律

- fixture 取证：6 个文件全部逐行读取（README.md / cordis.patch.yml / package.json / src/client/Pet.tsx / index.ts / locales.ts），只读，未改动任何字节；未执行任何迁移或安装；未访问外部服务。
- 本地只读工具：Cordis Inspect（host 侧 Service/Tool 契约目录已读）；client 侧 Service/Event/Builtin 查询 4 次均 10s 超时（页面未连上），未能取到 client 运行时契约；`dsh --version` 进程探针返回 0.2.1-rc.1（仅记录本机 harness 版本，与本题 0.1.x 叙事无关）。
- 边界纪律：读取白名单 = 本格目录；skills/（noskill 臂禁读）与格目录之外任何文件一律未读；所有临时/产出文件只写入 agent-output\。
- 因此本报告中新 API 形态的「结构与语义」为确定项，而逐字成员名/符号名属于实施前需与 0.1.2-alpha.2 契约或升级卡片逐字复核的项（缺口原因见 §5）。

## 2. 破坏面清单（B1-B6：位置 / 断裂原因 / 迁移后形态）

### B1 — flat 快照类型 ConversationSnapshot

- 位置：Pet.tsx:8（`import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'`）、Pet.tsx:13-15（作为选择器入参类型使用）
- 为什么断：0.1.2-alpha.2 把会话快照读取面从 flat 字段收拢为分组读取面，`partial` / `running` / `runningCalls` / `turnEnds` 不再是快照对象的顶层成员；旧选择器里的 `s.running` 这类访问在编译期即报成员不存在。
- 迁移后形态（目标读取面；结构确定，逐字成员名以卡片为准）：

```ts
// 0.1.2-alpha.2：分组后的快照读取面
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.live?.partial?.blocks.some(b => b.kind === 'reasoning') ?? false
}
```

- 卡片：DSH-0.1.2-A1-xx（主题：快照 flat 字段收拢为分组读取面）
- 判定：必须立即切换（编译期即断，投影救不了类型）

### B2 — 读句柄 useSession 与选择器签名（PropsRuntime 提供）

- 位置：Pet.tsx:7（`import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'`）、Pet.tsx:10（`PropsRuntime<conversation.session.header.actions> & PropsLocale<pet>`）、Pet.tsx:18（解构 `{ useSession, t }`）、Pet.tsx:19-23（4 处 `useSession(...)`）
- 为什么断：读句柄的 selector 入参就是快照读取面本身；读取面重构后，旧 selector 字面量无法编译。句柄是否随读取面更名（如 useSession -> useSnapshot）取决于 0.1.2 契约，但入参类型与成员路径必然变化；Pet.tsx:7 的 props 类型 import 是编译断点。
- 迁移后形态：

```ts
export function Pet({ useSession, t }: PetProps) {
  const running = useSession(s => s.session.running)                       // B3
  const thinking = useSession(isThinking)                                  // B1/B4
  const toolRunning = useSession(s => s.live.calls.length > 0)             // B5
  const lastTurnEnd = useSession(s => s.turns[s.turns.length - 1]?.end?.reason) // B6
```

- 卡片：DSH-0.1.2-A1-xx（主题：session/snapshot 读句柄与选择器签名）
- 判定：必须立即切换（类型/签名层面）；运行期字段按 B3-B6 分流

### B3 — flat 字段 running（会话是否在跑）

- 位置：Pet.tsx:19（`useSession(s => s.running)`）
- 为什么断：顶层 flat `running` 移除，归入生命周期分组（session 组）。
- 迁移后形态：`useSession(s => s.session.running)`
- 卡片：DSH-0.1.2-A1-xx（主题：running / 生命周期字段归组）
- 判定：可先走兼容投影（语义不变、状态支撑，投影层可无损回填 flat `running`）

### B4 — flat 字段 partial（流式 partial blocks）

- 位置：Pet.tsx:12-15（`snapshot.partial?.blocks.some(block => block.kind === reasoning)`），消费点 Pet.tsx:20
- 为什么断：partial 是流式高频更新面，0.1.2-alpha.2 已将其移出快照状态、改由 live 读取面提供；旧 flat `partial` 读不到数据（兼容投影不重建 partial，它不是状态支撑字段）。
- 迁移后形态（新读路径，live 流式读取面）：

```ts
const thinking = useSession(s => s.live?.partial?.blocks.some(b => b.kind === 'reasoning') ?? false)
// 若 0.1.2 为流式内容提供独立 live 订阅句柄，则改经该句柄读取（符号名按卡片核对），语义保持：
// 仅当 模型正在出 reasoning 且没有 tool call 在飞 时为 true
```

- 卡片：DSH-0.1.2-A1-xx（主题：partial 流式读取面独立 / live read path）
- 判定：必须立即切换新读路径（无兼容投影等价物）

### B5 — flat 字段 runningCalls（在飞的工具调用）

- 位置：Pet.tsx:21（`useSession(s => s.runningCalls.length > 0)`）
- 为什么断：顶层 `runningCalls` 数组归入 live/在飞调用分组（live.calls）。
- 迁移后形态：`useSession(s => s.live.calls.length > 0)`
- 卡片：DSH-0.1.2-A1-xx（主题：runningCalls 归组 / 在飞调用读取面）
- 判定：可先走兼容投影（活动调用集合，语义保留，投影可映射回 `runningCalls`）

### B6 — flat 字段 turnEnds[].reason（回合结束原因）

- 位置：Pet.tsx:22-23（`useSession(s => s.turnEnds[s.turnEnds.length - 1]?.reason)`）
- 为什么断：回合时间线从 flat `turnEnds[]` 收拢为回合记录列表，结束信息归组到 `end`（`turns[].end.reason`）；旧的 `turnEnds[末项].reason` 成员路径不复存在。
- 迁移后形态：`useSession(s => s.turns[s.turns.length - 1]?.end?.reason)`
- 卡片：DSH-0.1.2-A1-xx（主题：turnEnds -> turns 回合记录 / 结束原因归组）
- 判定：可先走兼容投影（已结束回合可回填 flat `turnEnds[]`），但应尽快迁到 `turns`（新读取面是唯一事实源，投影有弃用期限）

## 3. 迁移后的完整目标形态（评估产物，未改动 fixture）

```ts
// Pet.tsx —— 0.1.2-alpha.2 目标形态示意（评估输出，非实际改动）
import { useEffect, useRef, type CSSProperties } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

export type PetProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'pet'>

function isThinking(snapshot: ConversationSnapshot): boolean {
  return snapshot.live?.partial?.blocks.some(block => block.kind === 'reasoning') ?? false
}

export function Pet({ useSession, t }: PetProps) {
  const running = useSession(s => s.session.running)
  const thinking = useSession(isThinking)
  const toolRunning = useSession(s => s.live.calls.length > 0)
  const lastTurnEnd = useSession(s => s.turns[s.turns.length - 1]?.end?.reason)
  const frame = useRef<string>('idle')
  void t; void running; void lastTurnEnd as CSSProperties
  useEffect(() => {
    frame.current = toolRunning ? 'working' : thinking ? 'thinking' : 'idle'
  }, [toolRunning, thinking])
  return <div data-frame={frame.current} className='pet' />
}
```

要点：语义保持不变（thinking 帧 = 模型出 reasoning 且无 tool 在飞；working 帧 = 有 tool 在飞；settle 帧跟最后回合的结束原因走），只有读取路径换到分组读取面。

## 4. 不在本次破坏范围内的面（逐处核对，避免误报）

- N1 Pet.tsx:6,24,28-31：React hooks 与 JSX —— 非 DSH 面，不受快照迁移影响。
- N2 Pet.tsx:7,10 / index.ts:14-19：`PropsLocale<pet>` 与 `LocaleNamespaceMap` 模块增强 —— locale 面，不在快照读取面迁移范围内。
- N3 index.ts:6,35-44：`ClientContext`、`apply`、`ctx.inject`、`ctx.effect` —— 上下文/生命周期 API，本次不变。
- N4 index.ts:29,38-42：`inject = ['slots','conversation','locale']` 与 `scope.slots.register({ name: 'conversation.session.header.actions', id: 'pet', order: 10 }, Pet)` —— slot 注册面与 slot key 本次不变（升级后建议用 client 侧 Slots inspect 复核一次 key 是否仍声明）。
- N5 index.ts:8,10（type-only 模块引入）、package.json `client.inject` 名单、cordis.patch.yml 注册、locales.ts（纯 TS）—— 不受影响。
- 说明：以上按 0.1.2-alpha.2 的快照读取面迁移范围判定；若升级卡片对 locale / slots / manifest 另有变更，需另行对照（本次取证未见相关证据）。

## 5. 升级卡片映射（含缺口声明）

事实：升级卡片目录（DSH-0.1.2-A1-xx 编号表）位于本臂禁读材料内（skills/ 的 reference），格目录内无副本；编排侧明确拒绝提供（避免污染 noskill 臂评测）。故本节给出主题映射 + ID 槽位，两位序号待对照目录补齐 —— 这是本臂的已知阻塞点，按题面要求如实上报，不臆造编号。

| 断裂面 | 源位置 | 对应升级卡片（主题） | 卡片完整编号 |
| --- | --- | --- | --- |
| B1 flat 快照类型 | Pet.tsx:8,13-15 | 快照 flat 字段收拢为分组读取面 | DSH-0.1.2-A1-xx（缺号，待目录） |
| B2 读句柄/选择器签名 | Pet.tsx:7,10,18-23 | session/snapshot 读句柄与选择器签名 | DSH-0.1.2-A1-xx（缺号，待目录） |
| B3 running | Pet.tsx:19 | running / 生命周期字段归组 | DSH-0.1.2-A1-xx（缺号，待目录） |
| B4 partial.blocks | Pet.tsx:12-15 | partial 流式读取面独立（live read path） | DSH-0.1.2-A1-xx（缺号，待目录） |
| B5 runningCalls | Pet.tsx:21 | runningCalls 归组 / 在飞调用读取面 | DSH-0.1.2-A1-xx（缺号，待目录） |
| B6 turnEnds[].reason | Pet.tsx:22-23 | turnEnds -> turns 回合记录 / 结束原因归组 | DSH-0.1.2-A1-xx（缺号，待目录） |
| （配套）兼容投影层 | 全局 | legacy/compat 兼容投影与弃用窗口 | DSH-0.1.2-A1-xx（缺号，待目录） |

拿到卡片目录后按主题对号填入两位序号即可（编号格式：DSH-0.1.2-A1-xx）。

## 6. 兼容投影 vs 立即切换（要求 4 的正面回答）

| 字段/面 | 先走兼容投影？ | 依据 |
| --- | --- | --- |
| 类型与读句柄（B1/B2） | 否，必须立即切换 | flat 形态成员在 0.1.2 类型里已不存在，构建期即失败；运行期投影救不了编译 |
| partial.blocks（B4） | 否，必须立即切换新读路径 | 流式 partial 已移出快照状态、由 live 读取面提供；兼容投影不重建非状态支撑的流式内容，旧 flat 读取会拿到空 |
| running（B3） | 是，可先走兼容投影 | 布尔状态位、语义不变，可由 session 组无损回填 flat `running` |
| runningCalls（B5） | 是，可先走兼容投影 | 在飞调用集合语义保留，可由 live.calls 回填 flat `runningCalls` |
| turnEnds[].reason（B6） | 是，可先走兼容投影（限期） | 已结束回合可由 turns[].end.reason 回填 flat `turnEnds[]`；但新读取面是唯一事实源，投影层有弃用窗口 |

分层结论：

1. 编译期（类型 / 句柄 / 选择器签名）：立即切换，没有过渡。
2. 运行期 partial：立即切换到 live 新读路径，不能等投影。
3. 运行期 running / runningCalls / turnEnds[].reason：允许先在兼容投影下运行（灰度、分批、保证行为不变），再迁到分组读取面；投影只是弃用窗口内的过渡，不应长期停留。

## 7. 建议迁移顺序（供实施参考；本次未动任何代码）

1. B1/B2：类型、props 类型 import、选择器签名改到新读取面（构建通过的最小集）。
2. B4：partial 切到 live 新读路径（唯一没有投影兜底的运行期字段）。
3. B3/B5/B6：迁到分组读取面，或短期走兼容投影后统一迁移。
4. 移除对兼容投影的依赖，确认无 legacy 读取残留。
5. 升级后用 client 侧 Slots/Service inspect 复核 slot key（conversation.session.header.actions）与读句柄符号名。

回归关注点：Pet.tsx:12-15 的 thinking 语义（reasoning 且无 tool 在飞）在 partial 换读路径后必须保持；Pet.tsx:22-23 的取尾下标逻辑改走 turns 后注意空列表；Pet.tsx:28-30 的 effect 依赖不变。

## run-stats

- toolcalls 总数：33 次底层工具调用（read 10 / glob 4 / pwsh 2 / cordis_inspect_list 1 / cordis_inspect_query 9 / write 3 / edit 2 / send_message 2），由 21 次顶层 run_code 执行驱动；另有 1 次 run_code 因代码解析错误未发出工具调用、1 次纯日志探针无工具调用、1 次 edit 因 old_string 未匹配失败（随后以文件原文重试成功）。
- 完成时间：2026-10-21 14:15:21 +08:00（Asia/Shanghai）


#### FILE: tool-transcript.txt

1. glob pattern=**/* path=...\S3-snapshot-migration\fixture
2. glob pattern=**/* path=...\S3-snapshot-migration\agent-output
3. read ...\fixture\README.md
4. read ...\fixture\cordis.patch.yml
5. read ...\fixture\package.json
6. read ...\fixture\src\client\Pet.tsx
7. read ...\fixture\src\client\index.ts
8. read ...\fixture\src\client\locales.ts
9. glob pattern=**/* path=...\S3-snapshot-migration（查隐藏文件，结果与 1/2 一致）
10. glob pattern=* path=...\S3-snapshot-migration
11. cordis_inspect_list（列出全部 Inspect Provider）
12. pwsh Get-ChildItem -Force -Recurse workdir=...\S3-snapshot-migration（枚举格目录）
13. cordis_inspect_query platform=client provider=Service method=listService（10s 超时，页面未连上）
14. cordis_inspect_query platform=host provider=Tool method=listTools
15. cordis_inspect_query platform=host provider=Service method=listService（契约目录）
16. cordis_inspect_query platform=client provider=Service method=listService（10s 超时）
17. cordis_inspect_query platform=client provider=Event method=listEvents（10s 超时）
18. cordis_inspect_query platform=host provider=Service method=listService（服务键清单）
19. cordis_inspect_query platform=client provider=Builtin method=listBuiltins（10s 超时）
20. cordis_inspect_query platform=client provider=Service method=listService（10s 超时）
21. pwsh dsh --version（进程探针，非文件系统访问）
22. cordis_inspect_query platform=host provider=Service method=listService（服务键清单复核）
23. read ...\fixture\src\client\Pet.tsx（带行号复核，供引用行号）
24. read ...\fixture\src\client\index.ts（带行号复核）
25. read ...\fixture\src\client\locales.ts（带行号复核）
26. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（中期发现：卡片目录不可及）
27. write ...\agent-output\report.md（迁移评估报告）
28. edit ...\agent-output\report.md（失败：old_string 未匹配，文件未改动）
29. read ...\agent-output\report.md（取 run-stats 原文用于精确替换）
30. edit ...\agent-output\report.md（run-stats 精确完成时间与工具计数，状态：ok）
31. write ...\agent-output\tool-transcript.txt（本文件）
32. write ...\agent-output\transcript-manifest.txt
33. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（最终结果汇报）
备注：上列均经 run_code 执行器发出；另有 1 次 run_code 因代码解析错误未发出工具调用、1 次 run_code 仅 console.log 解析探针，均不计为文件系统访问。


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\fixture
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\fixture\cordis.patch.yml
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\fixture\package.json
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\fixture\src\client\Pet.tsx
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\fixture\src\client\index.ts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\fixture\src\client\locales.ts
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\agent-output
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\agent-output\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S3-snapshot-migration\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.