# JUDGE BRIEF · skill.S21-resource-service-unavailable-trap

## Criteria (sealed rubric)
- [metadata-chain-attribution] (20pt) Use symptom-log.txt and contrast-probe.txt: the session-scoped document tab is claimed/titled but meta.status stays none, while file-trace’s own RPC reads the same file. Localize the fault to the workspace-files resource-provider/RPC metadata delivery chain, not disk existence or the external plugin renderer. The workspace-files host row is already declared; static serving does not prove activation. Do not require an exact unseen internal failing function.
- [valid-probes-and-partitioning] (20pt) Use combo-probe.txt to distinguish the per-module 62/62 HTTP 200 sweep from the manually joined 4–5 KB URL’s 404. The real loader partitions combo requests to respect its URL limit (3 KB); the oversized join is not evidence of missing modules. Recognizing bounded partitioning is enough without memorizing the constant or exact byte count. The manifest excerpt says 60 while the probe says 62: accept explicit evidence-bounded treatment of that discrepancy, not invented reconciliation.
- [distractors-and-tab-scope] (20pt) Separate the paste-input fold warnings from the resource read, and use boot-manifest-excerpt.txt to explain textpreview→documentpreview and the new session-only canOpen scope. That scope explains the outside/absolute-address claim failure, not the session tab’s stalled metadata. Do not demand the fold-parser fix version or exact END-marker cause absent from the supplied evidence; acknowledging an independent warning family is sufficient.
- [ordered-mitigation] (20pt) Give restart once → rollback to a known published working version if still broken → upstream follow-up, using discussion-excerpt.txt’s 0.1.3-alpha.2 escape hatch or a clearly verified equivalent. Reject plugin-side rewrite/retry/fallback and duplicate service insertion as cures for this host-chain gap. Explain that the earlier alpha.1 roster mismatch is prior art, not proof the alpha.2 case still has missing bytes. Proposed actions suffice; do not execute a self-host global upgrade.
- [upstream-forensics-and-fail-loud] (20pt) Package versions/profile upgrade history, exact session/absolute address and symptom, roster, valid per-module sweep, same-file contrast and meta.status, plus the invalid-join caveat for upstream. Propose named host diagnostics for module registration/provider or metadata-RPC readiness at boot/first use; roster-versus-served-byte checks are useful but do not by themselves prove this already-served chain works. A specific meaningful failing-chain diagnostic is sufficient; do not require an unseen public health-check API.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [invalid-probe-as-missing-bytes] ceiling=40 The final diagnosis treats the oversized all-in-one 404 as proof modules are missing despite the individually successful sweep. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.
- CAP [plugin-workaround-or-duplicate-insert] ceiling=40 The proposed remedy rewrites the external plugin, adds blind retry/fallback to hide the host failure, or inserts another workspace-files service even though the bundle already provides it. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S21-resource-service-unavailable-trap/report.md

# S21 · The Resource Service That "Unavailable" — 归因与处置报告（read-only）

- 场景：dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 就地 npm-global 升级（Windows 11；profile 建于 0.1.2/0.1.3，六个外部客户端插件 junction 链接）。升级 + 重启后，工作区外文件链接报 "sidebarRight: no registered tab type claims dsh-resource://file/absolute/…"，工作区内文件链接能开 tab、标题正确，内容区只有「文件资源服务不可用。」。
- 证据：fixture/ 七份只读材料（symptom-log / boot-manifest-excerpt / combo-probe / contrast-probe / console-excerpt / discussion-excerpt / README），全程未改动。
- 依据：skills/plugin-upgrade（模式 A 只读诊断）；卡片 DSH-0.1.5-A1-16 / A1-17 / A1-20 / A2-01 / A2-02 / A2-09 / A2-14 / A2-21，troubleshooting 症状表，discussion #5999。

## 0. 结论摘要

1. 真正失败的层是「客户端文件资源读取链」（documentpreview tab 的 useResource<'file'> → createFileResourceProvider(remote, changes) → remote.workspaceFiles → 宿主 workspaceFiles 服务 / workspaceFileScope typert lookup）。meta.status 恒为 'none'：读取卡在元数据握手之前、请求从未被应答；不是渲染失败、不是文件/磁盘问题、不是静态模块产物缺失。
2. 同一文件的两个读取器（file-trace 自有 RPC 读到全文 vs documentpreview tab 的 meta.status 'none'）证明文件本身可读，把故障域夹在 workspace-files/资源链这一条 transport 上；排除文件缺失/锁/ACL/围栏/超限/渲染器。
3. 两个 combo 探针里只有「按 manifest 单条目 URL 形状」的探针（Probe 1/3，62/62 HTTP 200）是静态产物服务的有效测量；把 62 条拼成一条 ~4–5 KB URL 的 Probe 2 是 loader 永远不会构造的合成请求，其 404 只反映请求形状（combo 路由长度/参数上限），绝不能引证为「modules missing」。
4. dsh-paste-input 的 fold skipped (parse failed) 警告是并行的、无关的第三个 bug（历史粘贴附件消息的气泡折叠解析），与内容读取失败无因果。
5. roster 两版之间的变化是 ui-sidebar-textpreview → ui-sidebar-documentpreview 改名 + tab canOpen 只认 session scope（A2-09/A2-01）：解释症状「absolute 链接无人 claim」（设计内变化），不解释「session 链接 tab 开了但内容空」。
6. 处置：不做插件侧 workaround；先一次「全停进程后的冷重启 + A1-20 复验清单」，不愈则回退全局包到上一已发布版本（0.1.3-alpha.2，外部终端、钉精确版本），取证打包上报 discussion #5999。

## 1. 归因（Attribution）

### 1.1 失败在哪一层

0.1.5-alpha.2 上点开一个文件链接经过五层：

| 层 | 组成 | 本次状态 |
|---|---|---|
| L1 tab 认领/注册 | ui-sidebar-right 的 SidebarRightTabDefinition（patterns/canOpen/priority） | session scope 成功（标题渲染）；absolute scope 被设计性拒认 |
| L2 静态模块产物服务 | /plugins/?? combo 路由 + 每条目 rev 产物 | 成功（62/62 200；documentpreview 的代码确实注册了 tab 类型） |
| L3 客户端文件资源链 | useResource<'file'> → createFileResourceProvider(remote, changes)，inject ['resources','remote','remote.workspaceFiles'] | 失败发生于此处以下 |
| L4 宿主 workspaceFiles 服务 | typert workspaceFileScope lookup（sessions.get(sessionId)?.header.cwd，回退 sandboxPolicy.workspaceRoot），读走 ctx.fs | 未确认（与 L3 的接线是故障域） |
| L5 内容渲染 | documentpreview 的 document registry body（text-paged / bytes-complete） | 从未到达（没有任何内容/元数据） |

- 标题能渲染 ⇒ L1 对 session scope 成功、L2 成功（模块都已注册执行，F12 无 import/registration 错误）。
- 内容区只有「文件资源服务不可用。」且 meta.status 恒 'none' ⇒ 失败夹在 L3/L4 之间：资源元数据快照从未产生，读取根本没走到字节阶段。
- 症状「absolute 链接 no registered tab type claims」是 L1 的 canOpen 策略问题（§3.2），与内容读取分属两层、两个问题，不要合并归因。

### 1.2 两个读取器的对照（contrast-probe）：rule in / rule out

同一文件（E:\deepseek-harness\test-lhh010\.dsh\tmp\sidebar-open-test-2.md）、同一时刻、两条 transport：

- file-trace 自有宿主 RPC（/dsh-file-trace/*）：原文、阅读两模式都读得出内容；
- documentpreview tab（走 api-workspace-files Remote）：meta.status 一直 'none'。

规则成立（rule in）：
- 文件存在、此刻可读、内容可渲染——宿主进程的文件读能力、路径解析、ACL、磁盘都正常；
- 故障对 transport 敏感：唯一变量是读取链（自有 RPC vs workspaceFiles Remote + 资源 provider），故障域因此被夹在 L3→L4 的接线（资源 provider / remote.workspaceFiles / workspaceFileScope lookup）。

规则排除（rule out）：
- 文件缺失、被锁、ACL 拒绝；工作区围栏（A2-02：读不再受限于 workspace root，且该文件本就在 root 之下）；
- maxFileBytes 超限（测试 md 远小于 32 MiB 默认上限；超限会报 too-large 而不是 'none'）；
- 宿主整体不可用 / 六插件失活（其余插件 UI 正常，file-trace 正常）；
- 「渲染器坏了」（file-trace 用另一条链把同一内容渲染得很好）；
- 「session 地址被拒」假说（失败地址本身就是 session scope）。

### 1.3 meta.status 'none' 说明读取卡在哪

- 'none' ≠ 'error'：若是服务端返回失败（gateway/lookup-not-found、too-large、unknown-workspace），快照会带错误状态、界面会有错误文案；'none' 表示元数据从未产生——请求悬置或从未得到应答。
- 配合 F12 无红字、无 documentpreview/resources 错误：失败被静默吞掉（未解析的 promise / 未满足的注入 / 未注册的 lookup），不是抛异常。
- 因此读取卡在「客户端资源 provider ↔ workspaceFiles Remote（含 workspaceFileScope lookup）」的元数据握手之前。证据不足以再细分，候选楔子（属上报上游后要定位的点）：remote.workspaceFiles 注入未满足；typert workspaceFileScope lookup 未注册/未解析（A2-01 预期 gateway/lookup-not-found）；或 provider 把错误吞成 idle('none')。只读定界探针：页面控制台直调 workspaceFiles Remote 的 stat/read，或在宿主日志找 gateway/lookup-not-found。

## 2. 探针纪律（Probe discipline）

combo-probe 里有两个「方向相反」的探针，必须区分：

- 有效测量（静态产物服务）：Probe 1（单条目 URL → 200，73 616 bytes）与 Probe 3（62 条目逐条 GET → 62/62 HTTP 200）。它们请求的正是 loader 会请求的形状：每条 manifest 条目自己声明的 url（/plugins/??<module>&rev=<token>-<n>），逐条、各带自己的 rev 后缀。
- 无效测量：Probe 2（62 条目逗号拼接成一条 ~4–5 KB 的 URL → 404、零长度 body）。真实 loader 从不构造这种请求：boot roster（window.__DSH_BOOT__）是同源读取的清单，loader（ClientModuleRegistry.fetchBundle，A1-16；客户端半经 window.__ModuleLoader__.load 注册）按条目拉取其声明的 url（或按 roster 自身的分组/rev 组合），既不会把全量条目塞进一条 URL，也不会让 62 个条目共用一个 rev。404 测的是「这条合成 URL 的形状」（combo 路由对 URL 长度/参数个数的上限），不是产物存在性。

为什么 Probe 2 的 404 绝不能引证为「modules missing」：

- 证据形状不同。「缺模块」成立的唯一形状是 A1-20 那种逐条对照：同一 rev 下旧条目 200、新条目 404——那才指向 host 的 artifact/rev 缺口。本回合同样形状的测量是 62/62 全 200 ⇒ 静态产物层完好，缺模块假说被排除。
- 把合成 URL 的 404 当缺模块，会把归因从「资源读取链」错误拖回「装载/产物」层——正是本题陷阱；还会诱导错误动作（重装插件、改 manifest、重发 bundle）。
- 纪律：探针必须复现 loader 的请求形状（逐条目、条目自己的 rev token），合成探针只能作为对照实验并显式标注「非 loader 形状」。

## 3. 干扰项分离（Distractor separation）

### 3.1 dsh-paste-input: fold skipped (parse failed) —— 无关

- 来源与域：dsh-paste-input 对历史粘贴附件消息做气泡折叠时解析失败（==== DSH_PASTE_INPUT_V1 === 标记块），随每条历史消息重复刷屏；
- 不同平面：消息气泡渲染 vs 右栏资源读取链；它不触碰 ctx.resources / workspaceFiles / documentpreview；
- 时序与共现：警告与失败 tab 无耦合，F12 里没有任何 documentpreview/resources 错误；
- 结论：同时存在但相互独立的第三个 bug（可能升级前就在），单独记录、单独上报，不得混入资源读取故障的因果链，也不值得在本次处置里顺手「修」。

### 3.2 roster 两版之间还变了什么：textpreview → documentpreview（是否解释症状？）

- boot-manifest 普查：ui-sidebar-textpreview 在页面 HTML 里 0 次提及；alpha.2 树以 packages/client/ui-sidebar-documentpreview 取代 textpreview，bundle 的 cordis.patch.yml 携带 documentpreview 行、旧行消失（A2-09）。
- 连带行为变化：alpha.1 的 text tab（kind='text'，patterns 'dsh-resource://file/**'，canOpen=parseFileAddress!==undefined）两个 scope 都 claim；alpha.2 的 document tab canOpen 只接受 parseFileAddress(address)?.scope === 'session'，且 absolute 地址不再授权宿主调用、fileAddressFor() 把工作区外路径改走 session scope（A2-01）。
- 能解释症状 A（absolute 链接 "no registered tab type claims"）：设计内变化——absolute 形地址在新 tab 类型下无人认领。修法在链接生成侧：改用 fileAddressFor()/session scope（A2-01 迁移配方）。
- 不能解释症状 B（tab 标题正常、内容空）：失败地址本身是 session scope，canOpen 已放行、标题已渲染；改名不触碰读取链。若 profile 组合里还残留 textpreview 旧行，症状会是启动期显式失败（troubleshooting 表：duplicate loader entry id 是致命报错），而不是静默空 tab。
- 如实记录的取证差异：boot-manifest-excerpt 自述 Total entries: 60，combo-probe 扫的是 62 条 manifest 条目，两个计数不一致。按「观察冲突就并列记录」的纪律，上报时两份都附、注明各自来源，不静默取一个、不据此推断缺行。

## 4. 缓解决策（Mitigation decision）

### 4.1 插件要不要绕（rewrite / retry / fallback）？不要

- 失败层是宿主自带链（api-workspace-files + client-resources + ui-sidebar-documentpreview），不在六个外部插件的代码里；在插件里重写读取路径 = 掩盖宿主回归（技能边界：不得用插件或改 core 掩盖不兼容）。
- meta.status 'none' 不是可重试错误：没有瞬态证据；技能安全边界禁止对未知失败默认重试。
- retry/fallback 依赖的旧 API 已被删：alpha.2 的 ResourceSnapshot/ResourceProvider 的 reload、ChangeFeed.requestRestat 均已移除（A2-14）；照旧接口写的刷新/兜底是死代码，还会污染现场。
- 用户层已有可用止损读路径：file-trace 面板的原文/阅读模式——无需改任何代码。
- 唯一合理的插件侧改动（与本故障无关、属正常迁移项）：把生成 absolute 形 dsh-resource://file/absolute/… 链接的地方改用 fileAddressFor()/session scope（A2-01）；它修的是症状 A，不是内容读取。

### 4.2 维护者动作顺序

1. 先取证后动手（§5.1 清单，趁现场还在；本报告即第一份）。
2. 第一个便宜步骤：完全停止所有 dsh 进程（Windows 上运行中的宿主持有文件锁；浏览器刷新/热重载不算停宿主）后冷启动一次 dsh web，再按 A1-20 复验清单逐项打勾：roster 列出 workspace-files / documentpreview 行；按条目 GET 200 且返回的是模块代码；点一个 session scope 链接，看 meta.status 是否到达、内容是否渲染。依据：#5999 round 1 证明该部署的 boot-state 漂移可被一次完整重启自愈——便宜、幂等、可复验。本次现场已是一次 dsh web 重启之后，若冷重启仍不愈，不要再反复重启。
3. 逃生舱：冷重启不愈 → 立即回退全局包：外部终端、先停全部 dsh 进程、钉精确版本 npm install -g @deepseek-ai/dsh@0.1.3-alpha.2（#5999 已验证的回退点；不要裸包名、不要用 latest）。残余风险要写明：0.1.5 起 session 日志为 V3 且 no-downgrade-read（alpha.1 卡），回退前备份 $DSH_HOME，老宿主可能读不了 0.1.5 写过的会话日志。
4. 上游：把 §5.1 取证包附到 deepseek-ai/deepseek-harness discussion #5999（round 3 / 0.1.5-alpha.2；round 2 见 comment 18371079），标题里点明 per-module 62×200、meta.status none、file-trace 对照读取正常；不改 DSH core、不打本地补丁掩盖。

## 5. 预防 / 上游（Prevention / upstream）

### 5.1 完整上游报告需要的取证

1. 环境身份：Windows 11；npm-global 安装渠道；0.1.5-alpha.1 → 0.1.5-alpha.2（注明 profile 建于 0.1.2/0.1.3、Node 版本）；六个 junction 链接插件名称 + 版本 + 安装形态（file-trace v0.3.9 / progress v0.9.15 / whale v0.3.16 / minigames v0.3.17 / input-history v0.1.11 / paste-input v0.1.22）。
2. window.__DSH_BOOT__ roster 摘录原文（id、url、rev 后缀、条目总数），并标注 60 vs 62 的计数差异及来源。
3. 探针三件套，逐条标注请求形状与有效性：单条目 200（73 616 bytes）与逐条 62/62 200（有效）；62 拼一 404（合成 URL ~4–5 KB，非 loader 形状，显式声明「不可作缺模块证据」）。
4. 对照读取表（contrast-probe）：同一文件、两条 transport、两个结果；失败 tab 的 meta.status='none' 观测；session scope 地址原文与 session id。
5. 症状原文与时间线：两个对话框逐字（absolute claim 错误的完整地址串、「文件资源服务不可用。」）、终端 boot 输出、F12 console 摘录（含 dsh-paste-input 警告并标注无关）。
6. 处置史与结果：本现场已是升级 + dsh web 重启之后；round 1 的自愈/回退经过；此后每次冷重启/回退的时间点与复验结果（A1-20 清单逐项）。
7. 最小复现配方：0.1.2/0.1.3 建 profile + junction 六插件 → 就地 npm 升级 → 全停进程冷启动 → 点 session scope 文件链接看 meta.status → 点工作区外链接看 claim 错误。
8. 已排除项及排除方法（两个读取器、62/62 逐条探针、围栏/超限推断），让上游不必重走弯路。

### 5.2 宿主启动期可加的「失败要响」检查（fail loud，而不是空 tab）

- 装载自检：对 roster 每条目按其声明 url 拉取并断言「执行后完成注册」；把 loaded without registering 从浏览器控制台警告升级为启动期显式错误并点名条目（直接把 A1-20 的验证项做成断言）。
- 资源链存活检查：启动时断言每个 dsh-resource:// provider 的 backing Remote 与 typert lookup 已解析（workspaceFiles Remote + workspaceFileScope lookup）；未解析就显式报 waiting for service: remote.workspaceFiles，而不是让 tab 静默空。
- 组合行可解析检查：cordis.patch.yml 每行必须解析到真实包（textpreview→documentpreview 这类改名残留要在 apply 时报错）。先例已存在：duplicate loader entry id 是致命报错——同样的严格度应覆盖「行指向不存在的包」「provider 不可解析」。
- roster / 组合 / 产物三方一致性：启动时比对条目数 vs bundle 行数 vs 可服务产物；升级后首启与上次启动的 roster 快照比对，漂移即告警（A1-20 那一类的自动化）。
- 客户端失败带阶段名：把 meta.status 'none' → 「文件资源服务不可用。」拆成可区分的失败（provider 未注册 / Remote pending / lookup-not-found / too-large / unknown-workspace），请求悬置超时打一条 console warning，让 F12 至少留下痕迹。

## 附 · 证据与卡片索引（要点，不全文）

- fixture/：symptom-log（时间线、两症状）、contrast-probe（双读取器 + meta.status）、combo-probe（三探针）、boot-manifest-excerpt（roster 摘录 + textpreview 普查）、console-excerpt（F12）、discussion-excerpt（#5999 round 1）。
- 卡片（skills/plugin-upgrade/references）：DSH-0.1.5-A1-16（client-resources / ui-sidebar-right tab 注册面、fetchBundle、useResource）、A1-17（openFile→openResource）、A1-20（就地升级 combo 缺新模块：归因探针形状、重启自愈、回退逃生舱、#5999）、A2-01（workspaceFileScope lookup、absolute 不授权、fileAddressFor 走 session scope、gateway/lookup-not-found）、A2-02（读不围栏、maxFileBytes/too-large）、A2-09（textpreview→documentpreview 改名）、A2-14（reload/requestRestat 删除）、A2-21（document registry、text-paged/bytes-complete）。
- troubleshooting 症状表：loaded without registering、duplicate loader entry id、Windows EBUSY/先停进程再升级（本次动作顺序的依据）。

## run-stats

- toolcalls：28 次嵌套工具调用（read 16 / grep 4 / glob 1 / write 6 / send_message 1），封装于 9 次 run_code 调用；
- token 用量：n/a（本 harness 未向 solver 暴露计量）；
- 完成时间：2026-10-21 15:57:43（Asia/Shanghai）。


#### FILE: S21-resource-service-unavailable-trap/tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. glob pattern=**/* path=...\S21-resource-service-unavailable-trap (列格目录)
3. read ...\S21-resource-service-unavailable-trap\fixture\README.md
4. read ...\S21-resource-service-unavailable-trap\fixture\symptom-log.txt
5. read ...\S21-resource-service-unavailable-trap\fixture\boot-manifest-excerpt.txt
6. read ...\S21-resource-service-unavailable-trap\fixture\combo-probe.txt
7. read ...\S21-resource-service-unavailable-trap\fixture\contrast-probe.txt
8. read ...\S21-resource-service-unavailable-trap\fixture\console-excerpt.txt
9. read ...\S21-resource-service-unavailable-trap\fixture\discussion-excerpt.txt
10. grep pattern="A1-20|workspaceFiles|parseFileAddress|documentpreview|textpreview|resource|combo|client-resources|maxFileBytes" path=...\skills\plugin-upgrade\references\v0.1.5-alpha.1.md
11. grep 同上 pattern path=...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md
12. grep 同上 pattern path=...\skills\plugin-upgrade\references\troubleshooting.md
13. grep 同上 pattern path=...\skills\plugin-upgrade\references\pre-flight.md
14. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.1.md offset=575 limit=60 (A1-16)
15. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.1.md offset=715 limit=45 (A1-20+crossing)
16. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=60 limit=80 (A2-01/A2-02)
17. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=310 limit=35 (A2-09)
18. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=445 limit=30 (A2-14)
19. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=630 limit=60 (A2-21)
20. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=740 limit=60 (alpha.2 verification record)
21. read ...\skills\plugin-upgrade\references\troubleshooting.md (全表)
22. write ...\agent-output\S21-resource-service-unavailable-trap\tool-transcript.txt
23. write ...\agent-output\S21-resource-service-unavailable-trap\transcript-manifest.txt
24. write ...\agent-output\tool-transcript.txt
25. write ...\agent-output\transcript-manifest.txt
26. write ...\agent-output\S21-resource-service-unavailable-trap\report.md
27. write ...\agent-output\report.md
28. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e (结果汇报)


#### FILE: S21-resource-service-unavailable-trap/transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\symptom-log.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\boot-manifest-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\combo-probe.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\contrast-probe.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\console-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\discussion-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.5-alpha.1.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.5-alpha.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\S21-resource-service-unavailable-trap\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\S21-resource-service-unavailable-trap\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\S21-resource-service-unavailable-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\report.md


#### FILE: report.md

# S21 · The Resource Service That "Unavailable" — 归因与处置报告（read-only）

- 场景：dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 就地 npm-global 升级（Windows 11；profile 建于 0.1.2/0.1.3，六个外部客户端插件 junction 链接）。升级 + 重启后，工作区外文件链接报 "sidebarRight: no registered tab type claims dsh-resource://file/absolute/…"，工作区内文件链接能开 tab、标题正确，内容区只有「文件资源服务不可用。」。
- 证据：fixture/ 七份只读材料（symptom-log / boot-manifest-excerpt / combo-probe / contrast-probe / console-excerpt / discussion-excerpt / README），全程未改动。
- 依据：skills/plugin-upgrade（模式 A 只读诊断）；卡片 DSH-0.1.5-A1-16 / A1-17 / A1-20 / A2-01 / A2-02 / A2-09 / A2-14 / A2-21，troubleshooting 症状表，discussion #5999。

## 0. 结论摘要

1. 真正失败的层是「客户端文件资源读取链」（documentpreview tab 的 useResource<'file'> → createFileResourceProvider(remote, changes) → remote.workspaceFiles → 宿主 workspaceFiles 服务 / workspaceFileScope typert lookup）。meta.status 恒为 'none'：读取卡在元数据握手之前、请求从未被应答；不是渲染失败、不是文件/磁盘问题、不是静态模块产物缺失。
2. 同一文件的两个读取器（file-trace 自有 RPC 读到全文 vs documentpreview tab 的 meta.status 'none'）证明文件本身可读，把故障域夹在 workspace-files/资源链这一条 transport 上；排除文件缺失/锁/ACL/围栏/超限/渲染器。
3. 两个 combo 探针里只有「按 manifest 单条目 URL 形状」的探针（Probe 1/3，62/62 HTTP 200）是静态产物服务的有效测量；把 62 条拼成一条 ~4–5 KB URL 的 Probe 2 是 loader 永远不会构造的合成请求，其 404 只反映请求形状（combo 路由长度/参数上限），绝不能引证为「modules missing」。
4. dsh-paste-input 的 fold skipped (parse failed) 警告是并行的、无关的第三个 bug（历史粘贴附件消息的气泡折叠解析），与内容读取失败无因果。
5. roster 两版之间的变化是 ui-sidebar-textpreview → ui-sidebar-documentpreview 改名 + tab canOpen 只认 session scope（A2-09/A2-01）：解释症状「absolute 链接无人 claim」（设计内变化），不解释「session 链接 tab 开了但内容空」。
6. 处置：不做插件侧 workaround；先一次「全停进程后的冷重启 + A1-20 复验清单」，不愈则回退全局包到上一已发布版本（0.1.3-alpha.2，外部终端、钉精确版本），取证打包上报 discussion #5999。

## 1. 归因（Attribution）

### 1.1 失败在哪一层

0.1.5-alpha.2 上点开一个文件链接经过五层：

| 层 | 组成 | 本次状态 |
|---|---|---|
| L1 tab 认领/注册 | ui-sidebar-right 的 SidebarRightTabDefinition（patterns/canOpen/priority） | session scope 成功（标题渲染）；absolute scope 被设计性拒认 |
| L2 静态模块产物服务 | /plugins/?? combo 路由 + 每条目 rev 产物 | 成功（62/62 200；documentpreview 的代码确实注册了 tab 类型） |
| L3 客户端文件资源链 | useResource<'file'> → createFileResourceProvider(remote, changes)，inject ['resources','remote','remote.workspaceFiles'] | 失败发生于此处以下 |
| L4 宿主 workspaceFiles 服务 | typert workspaceFileScope lookup（sessions.get(sessionId)?.header.cwd，回退 sandboxPolicy.workspaceRoot），读走 ctx.fs | 未确认（与 L3 的接线是故障域） |
| L5 内容渲染 | documentpreview 的 document registry body（text-paged / bytes-complete） | 从未到达（没有任何内容/元数据） |

- 标题能渲染 ⇒ L1 对 session scope 成功、L2 成功（模块都已注册执行，F12 无 import/registration 错误）。
- 内容区只有「文件资源服务不可用。」且 meta.status 恒 'none' ⇒ 失败夹在 L3/L4 之间：资源元数据快照从未产生，读取根本没走到字节阶段。
- 症状「absolute 链接 no registered tab type claims」是 L1 的 canOpen 策略问题（§3.2），与内容读取分属两层、两个问题，不要合并归因。

### 1.2 两个读取器的对照（contrast-probe）：rule in / rule out

同一文件（E:\deepseek-harness\test-lhh010\.dsh\tmp\sidebar-open-test-2.md）、同一时刻、两条 transport：

- file-trace 自有宿主 RPC（/dsh-file-trace/*）：原文、阅读两模式都读得出内容；
- documentpreview tab（走 api-workspace-files Remote）：meta.status 一直 'none'。

规则成立（rule in）：
- 文件存在、此刻可读、内容可渲染——宿主进程的文件读能力、路径解析、ACL、磁盘都正常；
- 故障对 transport 敏感：唯一变量是读取链（自有 RPC vs workspaceFiles Remote + 资源 provider），故障域因此被夹在 L3→L4 的接线（资源 provider / remote.workspaceFiles / workspaceFileScope lookup）。

规则排除（rule out）：
- 文件缺失、被锁、ACL 拒绝；工作区围栏（A2-02：读不再受限于 workspace root，且该文件本就在 root 之下）；
- maxFileBytes 超限（测试 md 远小于 32 MiB 默认上限；超限会报 too-large 而不是 'none'）；
- 宿主整体不可用 / 六插件失活（其余插件 UI 正常，file-trace 正常）；
- 「渲染器坏了」（file-trace 用另一条链把同一内容渲染得很好）；
- 「session 地址被拒」假说（失败地址本身就是 session scope）。

### 1.3 meta.status 'none' 说明读取卡在哪

- 'none' ≠ 'error'：若是服务端返回失败（gateway/lookup-not-found、too-large、unknown-workspace），快照会带错误状态、界面会有错误文案；'none' 表示元数据从未产生——请求悬置或从未得到应答。
- 配合 F12 无红字、无 documentpreview/resources 错误：失败被静默吞掉（未解析的 promise / 未满足的注入 / 未注册的 lookup），不是抛异常。
- 因此读取卡在「客户端资源 provider ↔ workspaceFiles Remote（含 workspaceFileScope lookup）」的元数据握手之前。证据不足以再细分，候选楔子（属上报上游后要定位的点）：remote.workspaceFiles 注入未满足；typert workspaceFileScope lookup 未注册/未解析（A2-01 预期 gateway/lookup-not-found）；或 provider 把错误吞成 idle('none')。只读定界探针：页面控制台直调 workspaceFiles Remote 的 stat/read，或在宿主日志找 gateway/lookup-not-found。

## 2. 探针纪律（Probe discipline）

combo-probe 里有两个「方向相反」的探针，必须区分：

- 有效测量（静态产物服务）：Probe 1（单条目 URL → 200，73 616 bytes）与 Probe 3（62 条目逐条 GET → 62/62 HTTP 200）。它们请求的正是 loader 会请求的形状：每条 manifest 条目自己声明的 url（/plugins/??<module>&rev=<token>-<n>），逐条、各带自己的 rev 后缀。
- 无效测量：Probe 2（62 条目逗号拼接成一条 ~4–5 KB 的 URL → 404、零长度 body）。真实 loader 从不构造这种请求：boot roster（window.__DSH_BOOT__）是同源读取的清单，loader（ClientModuleRegistry.fetchBundle，A1-16；客户端半经 window.__ModuleLoader__.load 注册）按条目拉取其声明的 url（或按 roster 自身的分组/rev 组合），既不会把全量条目塞进一条 URL，也不会让 62 个条目共用一个 rev。404 测的是「这条合成 URL 的形状」（combo 路由对 URL 长度/参数个数的上限），不是产物存在性。

为什么 Probe 2 的 404 绝不能引证为「modules missing」：

- 证据形状不同。「缺模块」成立的唯一形状是 A1-20 那种逐条对照：同一 rev 下旧条目 200、新条目 404——那才指向 host 的 artifact/rev 缺口。本回合同样形状的测量是 62/62 全 200 ⇒ 静态产物层完好，缺模块假说被排除。
- 把合成 URL 的 404 当缺模块，会把归因从「资源读取链」错误拖回「装载/产物」层——正是本题陷阱；还会诱导错误动作（重装插件、改 manifest、重发 bundle）。
- 纪律：探针必须复现 loader 的请求形状（逐条目、条目自己的 rev token），合成探针只能作为对照实验并显式标注「非 loader 形状」。

## 3. 干扰项分离（Distractor separation）

### 3.1 dsh-paste-input: fold skipped (parse failed) —— 无关

- 来源与域：dsh-paste-input 对历史粘贴附件消息做气泡折叠时解析失败（==== DSH_PASTE_INPUT_V1 === 标记块），随每条历史消息重复刷屏；
- 不同平面：消息气泡渲染 vs 右栏资源读取链；它不触碰 ctx.resources / workspaceFiles / documentpreview；
- 时序与共现：警告与失败 tab 无耦合，F12 里没有任何 documentpreview/resources 错误；
- 结论：同时存在但相互独立的第三个 bug（可能升级前就在），单独记录、单独上报，不得混入资源读取故障的因果链，也不值得在本次处置里顺手「修」。

### 3.2 roster 两版之间还变了什么：textpreview → documentpreview（是否解释症状？）

- boot-manifest 普查：ui-sidebar-textpreview 在页面 HTML 里 0 次提及；alpha.2 树以 packages/client/ui-sidebar-documentpreview 取代 textpreview，bundle 的 cordis.patch.yml 携带 documentpreview 行、旧行消失（A2-09）。
- 连带行为变化：alpha.1 的 text tab（kind='text'，patterns 'dsh-resource://file/**'，canOpen=parseFileAddress!==undefined）两个 scope 都 claim；alpha.2 的 document tab canOpen 只接受 parseFileAddress(address)?.scope === 'session'，且 absolute 地址不再授权宿主调用、fileAddressFor() 把工作区外路径改走 session scope（A2-01）。
- 能解释症状 A（absolute 链接 "no registered tab type claims"）：设计内变化——absolute 形地址在新 tab 类型下无人认领。修法在链接生成侧：改用 fileAddressFor()/session scope（A2-01 迁移配方）。
- 不能解释症状 B（tab 标题正常、内容空）：失败地址本身是 session scope，canOpen 已放行、标题已渲染；改名不触碰读取链。若 profile 组合里还残留 textpreview 旧行，症状会是启动期显式失败（troubleshooting 表：duplicate loader entry id 是致命报错），而不是静默空 tab。
- 如实记录的取证差异：boot-manifest-excerpt 自述 Total entries: 60，combo-probe 扫的是 62 条 manifest 条目，两个计数不一致。按「观察冲突就并列记录」的纪律，上报时两份都附、注明各自来源，不静默取一个、不据此推断缺行。

## 4. 缓解决策（Mitigation decision）

### 4.1 插件要不要绕（rewrite / retry / fallback）？不要

- 失败层是宿主自带链（api-workspace-files + client-resources + ui-sidebar-documentpreview），不在六个外部插件的代码里；在插件里重写读取路径 = 掩盖宿主回归（技能边界：不得用插件或改 core 掩盖不兼容）。
- meta.status 'none' 不是可重试错误：没有瞬态证据；技能安全边界禁止对未知失败默认重试。
- retry/fallback 依赖的旧 API 已被删：alpha.2 的 ResourceSnapshot/ResourceProvider 的 reload、ChangeFeed.requestRestat 均已移除（A2-14）；照旧接口写的刷新/兜底是死代码，还会污染现场。
- 用户层已有可用止损读路径：file-trace 面板的原文/阅读模式——无需改任何代码。
- 唯一合理的插件侧改动（与本故障无关、属正常迁移项）：把生成 absolute 形 dsh-resource://file/absolute/… 链接的地方改用 fileAddressFor()/session scope（A2-01）；它修的是症状 A，不是内容读取。

### 4.2 维护者动作顺序

1. 先取证后动手（§5.1 清单，趁现场还在；本报告即第一份）。
2. 第一个便宜步骤：完全停止所有 dsh 进程（Windows 上运行中的宿主持有文件锁；浏览器刷新/热重载不算停宿主）后冷启动一次 dsh web，再按 A1-20 复验清单逐项打勾：roster 列出 workspace-files / documentpreview 行；按条目 GET 200 且返回的是模块代码；点一个 session scope 链接，看 meta.status 是否到达、内容是否渲染。依据：#5999 round 1 证明该部署的 boot-state 漂移可被一次完整重启自愈——便宜、幂等、可复验。本次现场已是一次 dsh web 重启之后，若冷重启仍不愈，不要再反复重启。
3. 逃生舱：冷重启不愈 → 立即回退全局包：外部终端、先停全部 dsh 进程、钉精确版本 npm install -g @deepseek-ai/dsh@0.1.3-alpha.2（#5999 已验证的回退点；不要裸包名、不要用 latest）。残余风险要写明：0.1.5 起 session 日志为 V3 且 no-downgrade-read（alpha.1 卡），回退前备份 $DSH_HOME，老宿主可能读不了 0.1.5 写过的会话日志。
4. 上游：把 §5.1 取证包附到 deepseek-ai/deepseek-harness discussion #5999（round 3 / 0.1.5-alpha.2；round 2 见 comment 18371079），标题里点明 per-module 62×200、meta.status none、file-trace 对照读取正常；不改 DSH core、不打本地补丁掩盖。

## 5. 预防 / 上游（Prevention / upstream）

### 5.1 完整上游报告需要的取证

1. 环境身份：Windows 11；npm-global 安装渠道；0.1.5-alpha.1 → 0.1.5-alpha.2（注明 profile 建于 0.1.2/0.1.3、Node 版本）；六个 junction 链接插件名称 + 版本 + 安装形态（file-trace v0.3.9 / progress v0.9.15 / whale v0.3.16 / minigames v0.3.17 / input-history v0.1.11 / paste-input v0.1.22）。
2. window.__DSH_BOOT__ roster 摘录原文（id、url、rev 后缀、条目总数），并标注 60 vs 62 的计数差异及来源。
3. 探针三件套，逐条标注请求形状与有效性：单条目 200（73 616 bytes）与逐条 62/62 200（有效）；62 拼一 404（合成 URL ~4–5 KB，非 loader 形状，显式声明「不可作缺模块证据」）。
4. 对照读取表（contrast-probe）：同一文件、两条 transport、两个结果；失败 tab 的 meta.status='none' 观测；session scope 地址原文与 session id。
5. 症状原文与时间线：两个对话框逐字（absolute claim 错误的完整地址串、「文件资源服务不可用。」）、终端 boot 输出、F12 console 摘录（含 dsh-paste-input 警告并标注无关）。
6. 处置史与结果：本现场已是升级 + dsh web 重启之后；round 1 的自愈/回退经过；此后每次冷重启/回退的时间点与复验结果（A1-20 清单逐项）。
7. 最小复现配方：0.1.2/0.1.3 建 profile + junction 六插件 → 就地 npm 升级 → 全停进程冷启动 → 点 session scope 文件链接看 meta.status → 点工作区外链接看 claim 错误。
8. 已排除项及排除方法（两个读取器、62/62 逐条探针、围栏/超限推断），让上游不必重走弯路。

### 5.2 宿主启动期可加的「失败要响」检查（fail loud，而不是空 tab）

- 装载自检：对 roster 每条目按其声明 url 拉取并断言「执行后完成注册」；把 loaded without registering 从浏览器控制台警告升级为启动期显式错误并点名条目（直接把 A1-20 的验证项做成断言）。
- 资源链存活检查：启动时断言每个 dsh-resource:// provider 的 backing Remote 与 typert lookup 已解析（workspaceFiles Remote + workspaceFileScope lookup）；未解析就显式报 waiting for service: remote.workspaceFiles，而不是让 tab 静默空。
- 组合行可解析检查：cordis.patch.yml 每行必须解析到真实包（textpreview→documentpreview 这类改名残留要在 apply 时报错）。先例已存在：duplicate loader entry id 是致命报错——同样的严格度应覆盖「行指向不存在的包」「provider 不可解析」。
- roster / 组合 / 产物三方一致性：启动时比对条目数 vs bundle 行数 vs 可服务产物；升级后首启与上次启动的 roster 快照比对，漂移即告警（A1-20 那一类的自动化）。
- 客户端失败带阶段名：把 meta.status 'none' → 「文件资源服务不可用。」拆成可区分的失败（provider 未注册 / Remote pending / lookup-not-found / too-large / unknown-workspace），请求悬置超时打一条 console warning，让 F12 至少留下痕迹。

## 附 · 证据与卡片索引（要点，不全文）

- fixture/：symptom-log（时间线、两症状）、contrast-probe（双读取器 + meta.status）、combo-probe（三探针）、boot-manifest-excerpt（roster 摘录 + textpreview 普查）、console-excerpt（F12）、discussion-excerpt（#5999 round 1）。
- 卡片（skills/plugin-upgrade/references）：DSH-0.1.5-A1-16（client-resources / ui-sidebar-right tab 注册面、fetchBundle、useResource）、A1-17（openFile→openResource）、A1-20（就地升级 combo 缺新模块：归因探针形状、重启自愈、回退逃生舱、#5999）、A2-01（workspaceFileScope lookup、absolute 不授权、fileAddressFor 走 session scope、gateway/lookup-not-found）、A2-02（读不围栏、maxFileBytes/too-large）、A2-09（textpreview→documentpreview 改名）、A2-14（reload/requestRestat 删除）、A2-21（document registry、text-paged/bytes-complete）。
- troubleshooting 症状表：loaded without registering、duplicate loader entry id、Windows EBUSY/先停进程再升级（本次动作顺序的依据）。

## run-stats

- toolcalls：28 次嵌套工具调用（read 16 / grep 4 / glob 1 / write 6 / send_message 1），封装于 9 次 run_code 调用；
- token 用量：n/a（本 harness 未向 solver 暴露计量）；
- 完成时间：2026-10-21 15:57:43（Asia/Shanghai）。


#### FILE: tool-transcript.txt

1. read E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
2. glob pattern=**/* path=...\S21-resource-service-unavailable-trap (列格目录)
3. read ...\S21-resource-service-unavailable-trap\fixture\README.md
4. read ...\S21-resource-service-unavailable-trap\fixture\symptom-log.txt
5. read ...\S21-resource-service-unavailable-trap\fixture\boot-manifest-excerpt.txt
6. read ...\S21-resource-service-unavailable-trap\fixture\combo-probe.txt
7. read ...\S21-resource-service-unavailable-trap\fixture\contrast-probe.txt
8. read ...\S21-resource-service-unavailable-trap\fixture\console-excerpt.txt
9. read ...\S21-resource-service-unavailable-trap\fixture\discussion-excerpt.txt
10. grep pattern="A1-20|workspaceFiles|parseFileAddress|documentpreview|textpreview|resource|combo|client-resources|maxFileBytes" path=...\skills\plugin-upgrade\references\v0.1.5-alpha.1.md
11. grep 同上 pattern path=...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md
12. grep 同上 pattern path=...\skills\plugin-upgrade\references\troubleshooting.md
13. grep 同上 pattern path=...\skills\plugin-upgrade\references\pre-flight.md
14. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.1.md offset=575 limit=60 (A1-16)
15. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.1.md offset=715 limit=45 (A1-20+crossing)
16. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=60 limit=80 (A2-01/A2-02)
17. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=310 limit=35 (A2-09)
18. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=445 limit=30 (A2-14)
19. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=630 limit=60 (A2-21)
20. read ...\skills\plugin-upgrade\references\v0.1.5-alpha.2.md offset=740 limit=60 (alpha.2 verification record)
21. read ...\skills\plugin-upgrade\references\troubleshooting.md (全表)
22. write ...\agent-output\S21-resource-service-unavailable-trap\tool-transcript.txt
23. write ...\agent-output\S21-resource-service-unavailable-trap\transcript-manifest.txt
24. write ...\agent-output\tool-transcript.txt
25. write ...\agent-output\transcript-manifest.txt
26. write ...\agent-output\S21-resource-service-unavailable-trap\report.md
27. write ...\agent-output\report.md
28. send_message agent_id=session-5d3ebe0e-127d-4dc4-a3b9-cb2199b04f8e (结果汇报)


#### FILE: transcript-manifest.txt

R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\SKILL.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\README.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\symptom-log.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\boot-manifest-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\combo-probe.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\contrast-probe.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\console-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\fixture\discussion-excerpt.txt
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.5-alpha.1.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\v0.1.5-alpha.2.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\troubleshooting.md
R E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\references\pre-flight.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\S21-resource-service-unavailable-trap\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\S21-resource-service-unavailable-trap\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\tool-transcript.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\transcript-manifest.txt
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\S21-resource-service-unavailable-trap\report.md
W E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\skill\S21-resource-service-unavailable-trap\agent-output\report.md


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.