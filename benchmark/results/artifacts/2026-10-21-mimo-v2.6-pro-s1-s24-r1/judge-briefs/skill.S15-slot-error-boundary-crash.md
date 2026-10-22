# JUDGE BRIEF · skill.S15-slot-error-boundary-crash

## Criteria (sealed rubric)
- [busy-scope-and-trigger] (20pt) Locate the disabled expression in AttachmentChips: (props.input?.phase ?? plain) !== plain || busy. busy is local to sibling AttachButton and unbound in AttachmentChips. Explain empty occurrences return null before the map, while a present occurrence in plain phase makes the left guard false and evaluates busy, causing ReferenceError. Accept not declared/not in scope and equivalent language.
- [slot-boundary] (20pt) Explain that a render exception is caught by the slot error boundary and removes the whole dock entry, rather than only the remove button; the separate attach-button slot survives. The diagnostic is in the browser console, not a user-facing banner.
- [attribution-and-isolation] (20pt) Use the shipped v0.2.10 expression to establish that busy already occurs in the baseline. Propose a data-present plain-phase baseline mount or rollback/re-add isolation to locate it. Do not force a claim that the hover diff is harmless: feature.diff is inconsistent with the baseline about the old disabled line and places imageItem before the callback-scoped status/record. Credit grounded discussion of these extra defects/inconsistencies. The evidence does not prove exactly when every historical user first exercised the failure.
- [fix-and-hardening] (20pt) Remove the dangling busy reference or explicitly provide properly owned state/props, preserving the phase guard. Harden missing arrays with record?.items ?? [] (or equivalent) and DOM targets with event.target?.closest?.(...) or a safe element/type check. Scope hover lookups to where record/status are defined. Equivalent safe fixes count; do not require an exact patch or executing changes in this read-only task.
- [data-present-regression] (20pt) Propose a render/mount test with a matching occurrence in plain phase, asserting the chip/remove control exists and the error boundary captures no exception. Explain why an empty-state-only test misses the expression and why node --check/parsing cannot resolve free identifiers or execute the component. Assertions using expect/DOM queries and ordinary prose both count. Include a data-present slot smoke in pre-ship checks, without requiring an actual test run here.

## Caps (score ceilings; judge returns each with triggered true/false)
(none)

## Candidate report(s)
#### FILE: S15-slot-error-boundary-crash/report.md

# S15 · Vanishing Dock Chips: the Silent Slot Crash —— 根因分析、修复与回归方案（只读诊断）

- 任务：S15-slot-error-boundary-crash（skill 臂 · plugin-upgrade skill，Mode A · inspect，只读）
- 证据包：fixture/（README.md、plugin-dock-chips.js（v0.2.10 出货摘录）、feature.diff（v0.2.11 hover-preview diff）、user-thread.md），全程只读、逐字节未改动；未执行任何安装/迁移/发布
- 一句话结论：AttachmentChips 在构造 chip 的 remove 按钮时读取自由标识符 busy（busy 只在 AttachButton 内由 useState 绑定），在“有 occurrence 的 chip 渲染”时抛 ReferenceError: busy is not defined；InputZone 槽位的 slot-level error boundary 捕获后卸载整个 dock 槽位条目，错误只出现在浏览器 console —— 所以用户看到“整条 chip/dock 消失”，而不是“x 按钮坏了”。这不是 v0.2.11 hover-preview 新功能写坏的，而是 v0.2.10 hardening pass 留下、被 || 短路一直潜伏的旧悬空引用，第一次被“带数据渲染 chip”的路径踩中。

## 1. 精确根因

### 1.1 抛错的表达式

fixture/plugin-dock-chips.js，AttachmentChips 内 remove 按钮的 disabled 属性（fixture 用 “// <-- ???” 标出的那行）：

~~~js
disabled: (props.input?.phase ?? 'plain') !== 'plain' || busy,
~~~

busy 在 AttachmentChips 的作用域里没有任何绑定。它唯一的声明在同一个文件的另一个函数里：

~~~js
function AttachButton(props) {
  const [busy, setBusy] = React.useState(false);   // <-- busy lives HERE
  ...
}
~~~

JS 的函数作用域不等于文件作用域：AttachButton 的局部量对 AttachmentChips 完全不可见（除非显式传 props）。渲染求值到 busy 时抛 ReferenceError: busy is not defined —— 这是“自由标识符读”级别的崩溃，不是 TypeError；即使在非严格模式下，读一个未声明标识符也抛错（只有不带声明的赋值才会隐式建全局）。

### 1.2 为什么只有 chip 渲染时才抛

AttachmentChips 开头的空态短路：

~~~js
const occurrences = (props.input?.occurrences ?? []).filter(item => item.source === SOURCE);
if (occurrences.length === 0) return null;
~~~

- 空 dock：在到达 map / 按钮构造之前就 return null，busy 永不求值 —— 组件完全健康，任何空态检查都是绿的；
- 有一个 pending occurrence：map 回调运行、构造 h('button', { ... disabled: ... || busy ... }) 的实参对象 —— 抛错。

也就是说这是一个“数据在场才炸”的缺陷：空态路径与带数据路径的执行面完全不同。旁证与症状吻合：粘贴本身正常（occurrence 记账与 dock 渲染无关），attach 的 + 按钮正常（那是另一个槽位 input.left、另一个组件 AttachButton —— 那里 busy 是有绑定的）。

### 1.3 为什么 || 短路让它潜伏到 v0.2.10

busy 是 || 的右操作数。JS 只有在左侧 (props.input?.phase ?? 'plain') !== 'plain' 为 falsy（即 phase === 'plain'）时才会求值右操作数。后果：

1. v0.2.10 那次 hardening pass 加这条 phase guard 的目的、手测与关注面都是“非 plain 阶段禁用 x”——那些渲染里左操作数为真，disabled 直接得到 true，busy 根本不执行（dead code on that path）；
2. 空 dock 走 1.2 的 return null，同样碰不到；
3. 发布前唯一的静态关卡 node --check 只查语法，自由标识符完全合法地通过。

于是“空态 return 短路 + || 短路 + 语法级检查”三层漏斗，恰好把唯一会求值 busy 的路径漏掉：plain 阶段下、有 occurrence 的 chip 渲染。这条悬空引用就这样留在 v0.2.10 出货代码里（证据包的 v0.2.10 摘录与 maintainer note 都记载：该行来自 v0.2.10 的 hardening pass）。v0.2.11 的 hover-preview 发布恰好让用户大规模走上这条路径（贴截图 → occurrence 出现 → plain 阶段渲染 chip），旧引用第一次真正被求值、抛错。

### 1.4 为什么症状是“整个 dock 消失”而不是“x 按钮坏了”

抛错发生在 AttachmentChips / AttachmentDock 渲染 InputZone 槽位条目的过程中（构造元素树时），而不是在按钮的事件回调里。框架对该槽位条目挂了 slot-level error boundary：捕获渲染错误 → 卸载整个条目（抛错子树整体卸载，边界处渲染 fallback/null）；错误只在浏览器 console（React render error / slot entry crashed 记录），UI 无横幅、无请求失败。所以：

- 用户看到的是“整条 chip/dock 不见了”；
- x 按钮根本没被创建出来 —— 不是“按钮坏了”，而是元素从未存在、所在条目已被卸载；
- 粘贴、发送、+ 按钮（不同槽位/组件）全部正常，进一步把表面症状伪装成“某个小部件没画出来”，用户与维护者都不会想到去看 console。

skill 参考里有同构先例：DSH-0.1.7-A1-01（references/v0.1.7-alpha.1.md 要点：槽位贡献渲染抛错 → slot 级 error boundary 卸载整个槽位条目 → 用户可见症状是整面静默消失 + 一条压缩的 console 错误、无请求失败；它由缺失导出触发，本例由自由标识符触发，失效形态完全一致）。该卡给出的验证口径（DOM marker 在场 + 零 slot entry crashed console 记录 + 期望请求发生；“CSS 加载了、没报错”式检查有假阴性）直接复用为本报告第 4/5 节的断言标准。

## 2. 为什么先怪 v0.2.11 diff 是错误的第一结论

### 2.1 错误结论及其诱惑

“v0.2.11 的 hover-preview 把槽位搞崩了”看起来顺理成章：回归窗口 = 版本边界 = hover-preview 发布；diff 又恰好改了消失的那个组件（AttachmentChips）；feature.diff 甚至把 disabled 行显示成 “- (…) !== 'plain'” / “+ (…) !== 'plain' || busy”，第一眼像“v0.2.11 引入了会炸的引用”。

### 2.2 为什么错

判定“谁炸的”靠抛错点，不靠 diff 的视觉重心。抛错表达式是 disabled 行里的 busy，而不是 hover-preview 新增的 imageItem / hover-card / onClick / data-image。v0.2.10 出货摘录（plugin-dock-chips.js，README 注明 as shipped in v0.2.10）与 maintainer note 都记载该行来自 v0.2.10 hardening pass —— 引用早于 diff。

证据冲突记录（按 skill 安全边界“本地观察与一手来源冲突时两者都记录、复现后报告”）：feature.diff 对这行的 -/+ 显示与 v0.2.10 摘录的记载互相矛盾；按 diff 字面会得出“v0.2.11 加了 || busy”。两种读法都改变不了以下事实：抛错表达式是同一条 disabled 行，而不是 hover-preview 代码。裁定手段是最小渲染挂载（2.3）：若复现显示 v0.2.10 带数据渲染也不炸，则说明 || 右操作数的可达性是被 v0.2.11 改动的渲染路径第一次打开的——那仍是“旧地雷 + 新扳机”，修复与回归方案不变。

### 2.3 正确的二分

1. 回滚 / 重加（rollback / re-add bisect）：先回滚 v0.2.11 验证 chip 回来（只证明扳机落在版本边界上，不证明因果）；再把 hover-preview 改动单独重加到 v0.2.10 源上，用“带一个 occurrence 的 dock 渲染”复现。关键判据不是“回滚后好没好”，而是“抛错帧落在哪一行”。
2. 最小渲染挂载（minimal render mount）：不装宿主、不贴截图，直接以 props 喂 AttachmentChips / AttachmentDock 一个 occurrence（{occurrenceId, ref, source: SOURCE, label} + records 里一条记录），plain 阶段渲染。这一步绕开所有 hover-preview 交互，直接指向预存的那行 —— 也是 4.1 的回归用例。
3. 抛错帧证据：console 栈指向 disabled 表达式求值（busy 的读取），从不指向 imageItem / onClick。功能说预言抛错帧在新增代码里 —— 被证伪。
4. 数据触发 vs 功能触发：贴一个非图片附件（纯文本）同样让 chip 消失 → 与“图片 hover 预览”无关；触发条件是“有 occurrence 的 chip 渲染”。
5. 版本边界源码证据：v0.2.10 摘录含该行（含 fixture 的 // <-- ??? 标注），引用早于 diff。

区分两种假说的证据矩阵：

| 证据 | “新功能搞崩槽位” | “旧潜伏缺陷今天才第一次被行使” |
|---|---|---|
| 抛错帧位置 | hover-preview 新增行 | disabled 预存行（busy 读） |
| 非图片附件复现 | 不该复现 | 复现 |
| 最小挂载（无 hover 交互） | 不炸 | 炸 |
| v0.2.10 源码已含该行 | 否 | 是 |
| 回滚 v0.2.11 | 修复 = 定罪 diff | 修复 = 移除扳机，雷未拆 |

结论：v0.2.11 是扳机（trigger），v0.2.10 hardening pass 的悬空 busy 是原因（cause）。“diff 改了同一个组件”是混淆项，不是因果证据；把扳机当原因是回归窗口思维（最近改动偏置）的典型错误。

## 3. 修复

### 3.1 主修：删掉悬空引用（或正确作用域化）

最小正确修复 —— 回到 phase guard 本来的语义：

~~~js
disabled: (props.input?.phase ?? 'plain') !== 'plain',
~~~

若确实需要 chip 级 busy 语义：在 AttachmentChips 内声明 const [busy, setBusy] = React.useState(false)，或由 AttachmentDock / props 显式传入。绝不能引用兄弟函数的局部量 —— 同一文件不同函数的局部量互不可见，这正是本次事故的机理。

### 3.2 diff 还应补的两个硬化（cheap insurance）

1. record?.items ?? [] 式防御读：diff 的 record?.items.find(...) 并不安全 —— record 存在但 items 缺失时，record?.items 得到 undefined，随后 .find 直接 TypeError。写成 (record?.items ?? []).find(...)（或先 const items = record?.items ?? []）把“记录缺失/半缺失”降级为空列表。
2. event.target.closest?.() 选项链：event.target.closest('.remove') 假设 target 一定是带 closest 的 Element；在某些宿主/合成事件里 target 可能是文本节点、SVG 子节点或非 Element。写 event.target.closest?.('.remove')，缺失时按“不在 remove 上”处理。

为什么在槽位组件里这是白菜价的保险：槽位组件里一次抛错的成本是“整个条目静默消失”（见 1.4），不是“某个控件失效”；一个 ?. / ?? 运行时零成本，却把整面消失降级为一次优雅的 undefined / 空数组。槽位组件应当按“抛错即全灭”的标准书写与评审。

### 3.3 顺带记录：diff 里第二处同族作用域风险

按 feature.diff 字面，新增的 const imageItem = status !== 'missing' ? record?.items.find(...) : undefined 被放在 .map 之前，而 status / record 是 map 回调内的局部量 —— 在该位置读它们是自由标识符读（同类缺陷，且求值顺序上排在 busy 之前）。正确做法（即“scope it properly”）：把 imageItem 的计算移进每个 occurrence 的回调内、用该 occurrence 的 record / status 计算，并配合 3.2 的 ?? []。若 diff 仅是摘录排版错位，则此项降级为防御性建议；两种情况下修法一致。

## 4. 发布前就该抓住它的回归测试

### 4.1 形态：带数据的渲染冒烟 + error boundary 探针

- Arrange：props.input.occurrences = [{ occurrenceId:'o1', ref:'r1', source: SOURCE, label:'shot.png' }]，records 内放一条 r1（status present、label）；phase 为 plain。
- Mount：AttachmentDock(props)（或 AttachmentChips(props, 'dock')），外包一个探针 error boundary（记录 componentDidCatch 是否触发 / fallback 是否渲染）。
- Assert（三条全要）：
  1. 探针 boundary 零捕获（chip 渲染不触发 error-boundary capture）；
  2. .chip 元素渲染出来：含文件名文本与 .remove 按钮（元素存在 + 文本断言）；
  3. 零 slot entry crashed console 记录（DSH-0.1.7-A1-01 的验证口径）。

### 4.2 为什么不能只测空态

if (occurrences.length === 0) return null; —— 空 dock 在到达抛错行之前就返回了。空态冒烟在坏代码上也会绿，这正是本次漏测的形态（现有测试/手测只覆盖了空 dock 或 AttachButton）。判据：测试必须让抛错行被执行到，即 occurrence 在场。

### 4.3 变体（把 || 两侧都踩到）

- plain 阶段（左操作数 falsy → 求值 busy）—— 本例必炸路径；
- 非 plain / locked 阶段（左操作数为真 → 短路，顺带断言 .remove 为 disabled）；
- 缺 record 的 occurrence（status 'missing'）；
- 非图片附件（证明与 hover-preview 无关）；
- （可选）v0.2.11 的 hover-card / onClick 路径：带图片项、触发 hover 与 click，覆盖 closest 保护用例。

## 5. 发布流程教训

### 5.1 为什么 “syntax check only” 不够

node --check 只做语法解析。自由标识符（busy，以及 3.3 的 status / record）是完全合法的语法；ReferenceError 是运行期作用域错误，只有语句真正执行才触发。对一个 lib-only 插件（没有可启动的 app，组件只在宿主槽位里渲染）而言，组件只在“运行时 + 有数据”两个条件同时满足时才走到缺陷行 —— 语法检查对渲染正确性是零信号，在本例会给出全绿。

### 5.2 slot 渲染型 lib-only 插件的最小可行发布前检查（按成本排序）

1. 作用域级静态检查（秒级、最便宜、能直接抓住 busy / status / record）：tsc --noEmit（checkJs + JSDoc）或 ESLint no-undef（module 作用域）。把“语法检查”升级为“作用域检查”。
2. 带数据的渲染冒烟（4.1）：每个导出的槽位组件至少一条“occurrence 在场”用例，包探针 boundary，断言 DOM marker + 零 capture + 零 slot entry crashed。
3. 一次真实宿主 / 客户端挂载：在开发 profile 冷启动，证明注册与挂载（skill 校验层 4：prove registration/mount，而不是裸 HTTP 200），并检查浏览器 console —— 这类错误 console-only，UI 不报。
4. 一次功能路径手测：真的贴一张截图/附件，走 chip 出现 → x 移除，同时开着 console（对照 DSH-0.1.7-A1-01 的三件套验证口径）。

一句话：对 slot 渲染型 lib-only 插件，“语法通过”不等于“能渲染”；最小闸门 = 作用域静态检查 + 带数据渲染冒烟 + 一次带 console 观察的真实挂载。

## 附：方法与依据（plugin-upgrade skill）

- 模式：Mode A · inspect（只读诊断 + 报告）。fixture/ 全程只读、未改动；未执行安装/迁移/发布（README 亦注明 fixture 永不执行）。
- 触点类别：UI/commands/tools（pre-flight 七类之一）—— 槽位渲染组件的失效模式即“整条目静默消失”。
- 校验阶梯：static（作用域检查）→ runtime（真实挂载/注册证明）→ behavior（一条核心路径）；第 5.2 节按此设计。
- 冲突记录规则：2.2 的 diff 显示与 v0.2.10 摘录冲突，按“两者都记录 + 给出复现判据”处理，未单方面采信。
- 引用卡片（仅要点）：DSH-0.1.7-A1-01（references/v0.1.7-alpha.1.md）—— 槽位渲染抛错 → slot 级 error boundary 卸载整个条目、整面静默消失 + console-only；其验证三件套复用为 4.1/5.2 的断言口径。

## 残留风险 / 未验证项

- 本环境为静态证据包（README 注明不得执行 fixture），未做真实运行时复现；结论基于源码阅读 + 上文可复现步骤。2.3/4.1 的最小渲染挂载是把结论升级为一手证据的最短路径。
- feature.diff 与 v0.2.10 摘录对 disabled 行的记载冲突（2.2）需由该复现裁定；两种裁定下修复与回归方案一致。
- 未普查插件其余槽位（input.left 等）是否存在同族悬空引用；建议全文件跑一次 no-undef / typecheck 作为普查。

## run-stats

- toolcalls 总数：28（run_code 调用 12 次 + 内部工具调用 16 次）
- token 用量：n/a（本 harness 未向 solver 暴露 token 计数）
- 完成时间：2026-10-21T15:55:07.9561935+08:00（Asia/Shanghai）


#### FILE: tool-transcript.txt

1. run_code 并行执行 pwsh + read（列证据包/技能目录、读 SKILL.md）
2. pwsh Get-ChildItem -Recurse <cell>\fixture; Get-ChildItem E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade
3. run_code 读取技能定义（内部 read）
4. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
5. run_code 读取证据包 README 与 diff（内部 read x2）
6. read <cell>\fixture\README.md
7. read <cell>\fixture\feature.diff
8. run_code 读取组件摘录与用户反馈（内部 read x2）
9. read <cell>\fixture\plugin-dock-chips.js
10. read <cell>\fixture\user-thread.md
11. run_code 枚举 fixture 文件清单（内部 glob）
12. glob pattern=**/* path=<cell>\fixture
13. run_code 读 SKILL.md 后半（内部 read）
14. read E:\...\skills\plugin-upgrade\SKILL.md offset=100 limit=60
15. run_code 检索 references 槽位/error-boundary 线索（内部 grep）
16. grep pattern=error boundary|unmount|vanish|slot entry|ReferenceError|no-undef|render smoke path=...\skills\plugin-upgrade\references
17. run_code 检索 troubleshooting.md 渲染/挂载口径（内部 grep）
18. grep pattern=render|mount|smoke|console path=...\skills\plugin-upgrade\references\troubleshooting.md
19. run_code 定位整槽消失卡片 ID（内部 grep）
20. grep pattern=DSH-0.1.7-A1-0|React #130|whole slot|slot entry path=...\skills\plugin-upgrade\references\v0.1.7-alpha.1.md
21. run_code 取完成时间并写报告（内部 pwsh + write）
22. pwsh Get-Date -Format o（workdir=<cell>）
23. write <cell>\agent-output\S15-slot-error-boundary-crash\report.md
24. run_code 写收尾自报文件（内部 write x2）
25. write <cell>\agent-output\tool-transcript.txt
26. write <cell>\agent-output\transcript-manifest.txt
27. run_code 向父代理回报结果（内部 send_message）
28. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e（自包含结论摘要）


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\fixture\
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\fixture\feature.diff
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\fixture\plugin-dock-chips.js
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\fixture\user-thread.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.7-alpha.1.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\agent-output\S15-slot-error-boundary-crash\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S15-slot-error-boundary-crash\agent-output\transcript-manifest.txt


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.