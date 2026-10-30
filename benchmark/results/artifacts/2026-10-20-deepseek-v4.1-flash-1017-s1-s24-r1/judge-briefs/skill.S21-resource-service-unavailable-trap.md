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

# S21 · 「文件资源服务不可用」的归因报告

> 场景：Windows 11，npm-global 原地升级 0.1.5-alpha.1 → 0.1.5-alpha.2，profile 始建于 0.1.2/0.1.3，六个外部客户端插件以 junction 链接安装。
> 本文只做只读取证与归因，不执行迁移/安装，不修改 `fixture/`。引用卡片刻意只写要点与卡片 ID。

---

## 0. 一句话结论

**坏的不是渲染层，也不是宿主文件系统，而是客户端资源提供者链：`ctx.resources` 里 `file` 类型的 provider（`createFileResourceProvider(remote, changes)`，背后是 `remote.workspaceFiles` 这个 Remote 命名空间）在本轮启动里没有接管。**
标题能画出来 = 标签类型注册与 `canOpen` 已通过；`meta.status` 停在 `'none'` = 请求从未落定、也从没报错 = 读根本没走到宿主 `read()`。「文件资源服务不可用」是"服务缺席"分支的文案，不是"读失败"的文案。

三层判定：

| 层 | 判定 | 决定性证据 |
|---|---|---|
| A 静态产物服务（roster / combo / `/plugins/??`） | **健康** | 逐模块 62/62 = 200；本轮无 `loaded without registering`；roster 里 workspace-files、documentpreview 均在 |
| B 标签类型注册 / 地址认领（tab registry、`canOpen`） | **session 域通过，absolute 域仍坏（另一个缺陷）** | 标题渲染出来了 → 认领成功；absolute 地址仍报 `no registered tab type claims` |
| C 内容读取（资源 provider → workspace-files Remote） | **失败层** | 同一文件另一读者（file-trace 自有 RPC）读得出；本标签 `meta.status` 恒为 `'none'` |

---

## 1. Attribution：到底是哪一层失败

### 1.1 先把"标题"和"内容"拆开

标题 `sidebar-open-test-2.md` 是**从地址解析出来的客户端字符串**，在任何元数据到达之前就已经有了（`parseFileAddress` 侧）。所以"有标题"证明的只有三件事，而且都成立：

1. 点击动作把 `dsh-resource://file/session/<sid>/.dsh/tmp/...` 传进了 `ctx.sidebarRight.openResource`；
2. `ui-sidebar-right` 的 tab-registry 里有某个 `SidebarRightTabDefinition` 的 `patterns`/`canOpen` 认领了该地址（alpha.2 里是 documentpreview，"session 域才收"）；
3. tab body 组件挂载并渲染了。

所以 **A 层和 B 层的"认领"部分不是罪魁**。空内容发生在 tab body 内部，属于第三层。
反过来说：看到"标题正常"就不能再怀疑注册表、slot、`sidebar.right.pane.tab` 渲染——这些都已交付。

### 1.2 两个读者，同一个文件，同一时刻

这是整份证据里唯一的**单变量对照**：被改变的只有"传输 + 服务"这一个变量，其余（文件、路径、会话、权限、宿主进程、时刻）全部锁死。

| 读者 | 传输 | 结果 | 它证明了什么 |
|---|---|---|---|
| file-trace 插件（自有 host RPC，`/dsh-file-trace/*`） | 自己的 HTTP 面 | 原文 / 阅读两模式都读出内容 | 宿主进程活着、磁盘可读、路径规范化对、ACL 放行、`.dsh/tmp` 在 workspace root 内、session→cwd 解析没跑偏、文件不是空/不是编码坏 |

**排除（rule out）**：文件不存在、权限/ACL、路径穿越与规范化、workspace 根归属、`maxFileBytes` 上限、sandbox 读策略、宿主 fs 后端、会话 cwd 解析错误、以及"content 根本没写进去"这一类。也顺带排除"整台宿主坏了"——同一进程的另一条 HTTP 面正常工作。

**收窄到（rule in）**：两个读者唯一不同的东西就是 **workspace-files 服务面**（客户端 `ctx.resources` 的 `file` provider → `remote.workspaceFiles` Remote → 宿主 `@deepseek-ai/dsh-api-workspace-files`）。故障必须落在这条桥上，因为文件本身已被另一个读者证明是好的。

注意 contrast-probe 自己给出的两条旁证都指向"不是文件侧"：宿主行确实在 web-app bundle 的 patch 里；读路径按设计**允许 workspace 之外的路径**（A2-02 之后 `outside-workspace` 只约束列目录），所以"`.dsh/tmp` 在 root 内/外"根本不是变量。

### 1.3 `meta.status === 'none'` 说明了什么：读卡在哪一段

这是本题最关键的一个观测，因为它把"哪一段"钉死了。

- `'none'` 是**初始/未附着**状态：快照里既没有数据，也没有错误，也没有"正在取"。它不是 `error`，也不是 `loading`。
- 如果宿主真的执行了 `read()` 并失败，A2-01/A2-02 给了成套**类型化**结局：`workspace-file/unknown-workspace`（absolute 域不再授权宿主调用）、`too-large`、`gateway/lookup-not-found`（scope lookup 解析不出来）。任何一条都会落成错误状态，并至少可能在 F12 留下痕迹。**现在两者都没有。**
- 因此：**没有任何宿主侧读取结果回来**——不是"读到了但拒绝给你看"，也不是"读失败被吞了"，而是**请求在到达宿主 `read()` 之前就没有产生结论**。卡点在 provider 解析 / Remote 命名空间注册这一段，而不是 `locateFile`/`readAll` 内部。
- 与"对话里没有红色报错"互相印证：这条链是 **fail-soft** 的——弱注入拿不到服务时返回 `undefined`，组件直接落到"服务不可用"分支，不打 error。**控制台干净恰恰是这个 bug 的签名，不是健康的证据。**

于是同层内还剩两个候选，且都必须用同一条探针切开（见 §5 取证清单第 5 项）：

- **C1（领先）**：`file` 资源类型**根本没有 provider**。workspace-files 客户端半要 `['resources','remote','remote.workspaceFiles']`（A2-01），只要 `remote.workspaceFiles` 这个命名空间没被广播/注册，模块就会"加载但不激活"，provider 从未注册 → store 永不派发 → 状态永远是 `'none'` → 文案走"服务不可用"。这也正是 fixture 里那句 "the resource-provider chain did not take over"。
- **C2**：provider 在，但派发出去后**永不应答**（gateway 路由缺席/挂起）。区别只在网络面板：有没有发出请求、发出了是否 pending。

两者同属一层（客户端资源服务面），也同属宿主/组合侧，**都不属于插件代码**。

### 1.4 同一句文案，两轮不同因（别把 alpha.1 的诊断搬过来）

- alpha.1 轮：combo 对新加入模块 404 → **所有**客户端插件 `loaded without registering` → 任何地址都"没有人认领"。此时"no registered tab type claims"是**全表缺席**。
- alpha.2 轮：62/62 都 200，模块都注册了；剩下的是 documentpreview 只认 session 域，于是**只有 absolute 域**没人认领。
- 而且 discussion #5999 已经写明：alpha.1 那轮**重启自愈了 roster 之后，内容读取仍然失败**（同一个"文件资源服务不可用"）。也就是说内容缺陷**跨版本、跨重启持续存在**，它既不是 alpha.2 的回归，也不是"再重启一次就好"的瞬态。

结论：**两个缺陷要分开记账**——D1 absolute 域不可认领（地址语义 + 认领范围），D2 内容读取（资源服务面）。把 D2 说成 D1 的后果，或者把 D1 说成 combo 缺模块，都会导致错误的修复动作。

---

## 2. Probe discipline：两个 combo 探针，哪个算测量

| 探针 | 结果 | 有效性 |
|---|---|---|
| Probe 1 单模块 `/plugins/??<one>&rev=...-0` | 200，73 616 B | **有效**（一次一个产物，与 loader 同路由） |
| Probe 3 逐模块 62 次 | 62/62 = 200，零 404 | **有效**，这是"静态产物在不在"的**唯一**可信测量 |
| Probe 2 把 62 个模块 join 成一个 URL | 404，零长度 | **无效**——测的是探针自己的 URL，不是产物 |

Probe 2 为什么无效，四条理由（任一条都足以废掉它）：

1. **它测的是组合路由的聚合上限**：4–5 KB 的查询串 + 62 个模块，触发的是 `/plugins/??` 这条路由的长度/条数/聚合限制。零长度 404 是"路由拒绝了这个请求"，不是"某个产物缺失"。无效测量无法把失败归属到任何一个模块——而这恰好是唯一有用的信息。
2. **不可伪证**：即使 62 个模块全部完美送达，这个 join URL 照样 404。一个"无论真相如何都返回失败"的探针，不产生证据。
3. **它把 62 个独立测量压成 1 个**，丢掉了"是哪一个"的定位能力；而"哪一个"正是本轮需要回答的问题。
4. **它自相矛盾于更好的证据**：Probe 3 已经逐条证明 200；被更好探针直接否证的结论不能反过来引用。

**为什么绝不能拿它当"模块缺失"**：一旦"模块缺失"成立，维护者会去做重装/修复产物/重跑 npm —— 破坏性动作，而且方向完全错（真正的故障在客户端注册面）。更糟的是，它会污染 alpha.1 的**真实**签名：那一轮的缺失表现是"**单个模块、它自己那条 URL、同一个 rev 上 404**"。join 探针的 404 长得一模一样，但含义完全不同；引用了它，"模块缺失"就再也没法被证伪。

**真实 loader 怎么取 roster**：读 `__DSH_BOOT__`，逐条目拿到 `{id, url, rev, inject}`，由客户端模块注册表按条目调用 `fetchBundle(request)`（DSH-0.1.5-A1-16 记的 `ClientModuleRegistry.fetchBundle`），**一个条目一个 URL、同源、按 `rev` 破缓存**，需要哪个取哪个，从不把整张表塞进一个查询串。

两处顺带记下的取证瑕疵（写进上游报告，别当结论）：

- **计数对不上**：boot manifest 摘录说 `Total entries: 60`，探针自称"all 62 manifest entries"。两个集合不是同一个集合，所以 62/62 不能替 60 条 roster 背书。
- **rev 对不上**：roster 行写 `rev=234716e8f7370214-3`，探针用 `...-0`。所以那批 200 也不能证明"**被广播的那个 rev**"服务正确。正确扫法：逐条照抄 entry 自己的 `url`。

---

## 3. Distractor separation：paste-input 与 roster 变化

### 3.1 `dsh-paste-input: fold skipped (parse failed)` —— 无关

- 它做的是**消息气泡里的文本折叠**：解析历史粘贴附件消息中的 `==== DSH_PASTE_INPUT_V1 ====` 标记文本，解析失败就"跳过折叠"。纯客户端渲染/文本处理。
- 与故障路径**零交集**：不碰 `ctx.resources`、不碰 workspace-files Remote、不碰 sidebar tab、不碰任何 Fastify 路由。
- 独立性还有两条硬证据：(a) 警告"每个历史粘贴附件消息重复一次"——数量正比于**聊天历史**，不正比于打开文件；(b) 那次点击在资源路径上**零输出**（连一条 warning 都没有）。两者只是时间上共处一页。
- 结论：**既不是原因，也不是加剧因素**；属于升级前就存在、可另行处理的独立噪声。不要因为"控制台只有它在刷"就去修它——那会把注意力从静默失败的资源链上引开。

### 3.2 roster 里真正变的东西：`ui-sidebar-textpreview` → `ui-sidebar-documentpreview`

同时变化的（按要点记，只引卡片 ID）：

- **DSH-0.1.5-A2-09**：包改名 + 右栏新增文档预览；旧 `ui-sidebar-textpreview` 在 alpha.2 树里**已被替换**（boot manifest 中 0 次出现）。
- **认领范围收窄**：alpha.1 的 `text` tab 是 `priority:'fallback'`、覆盖 `dsh-resource://file/**`（A1-16 把它列为参考实现）；alpha.2 的 document tab `canOpen` **只接受 `scope === 'session'`**（fixture 明写）。
- **DSH-0.1.5-A2-01**：`absolute` 域地址**不再授权宿主调用**，一律 `workspace-file/unknown-workspace`；`fileAddressFor()` 改为把 workspace 外的绝对路径**走 session 域**。
- 同时段还有：**A2-14** `client-resources` 去掉 `reload`；**A2-21** `ctx.documentPreviews` + `sidebar.right.tab.document`；**A2-13** `rightbar` 改 root 作用域 + `rightbar.session`；**A2-02** 读不再被 workspace 根围栏。

**它解释了什么、没解释什么**：

- **解释了 D1**：absolute 地址在 alpha.2 里既没有 fallback 认领者，本身也不再是合法的宿主调用域 → 点击必然落到"没有人认领"的对话框。这是**地址构造 + 认领范围**的缺陷（调用方应输出 session 域地址，见 A2-01 的 `fileAddressFor`），不是模块缺失。
- **没解释 D2**：出问题的那个 tab 是 **session 域**、**已经被新类型认领**、**标题都画出来了**——注册层已经交付，空内容在它下游。而且 D2 在 alpha.1（documentpreview 还不存在时）就已经存在，跨版本存活。**一个变化只能解释一个症状；roster 变化解释不了它出生之前就有的病。**
- 六个 junction 插件也同理：file-trace 实测能读，说明它们**代码**没问题；它们在本案里的意义只是**组合变量**（可能带进重复/陈旧的客户端模块实例），不是代码缺陷。

---

## 4. Mitigation decision：不要绕过，按顺序动手

### 4.1 插件侧：不重写、不重试、不兜底

三条理由，任一条都足够：

1. **归属错**：失败层是宿主提供的服务契约，不是插件代码。documentpreview 的 tab 认领、挂载、渲染全部正常；插件"自己修好"等于把 bug 的所有权写错，并把它永久冻结在插件里。
2. **授权语义会被复制**：插件自带兜底读（自有 HTTP 路由 / 直接读盘 / `/api/file`）会绕过 `workspaceFileScope`、`maxFileBytes` 与 sandbox 读策略，造出第二条**未经审计**的文件面——正是 A2-02 警告的那一类。这不是修 bug，是开新洞。
3. **会掩盖回归**：兜底成功之后，同一条服务面还坏着，聊天文件链接、预览、编辑器、`ui-sidebar-files` 全都受影响，而上游报告从此不可伪证。

- **重试**也不对：没有"错误"可重试（状态从未落定），且不是瞬态——它跨重启、跨版本存活。轮询只会泄漏定时器。
- **重写**也不对：这个插件面向的 API 没有变动（tab 认领与挂载都通过了），没有任何证据指向插件代码。

### 4.2 维护者动作顺序

**第 0 步（永远不做）**：不要在会话内执行全局宿主升级（skill 的硬边界：会话就是宿主进程，npm 会替换它自己正在跑的包树）。本案也确实不需要再升级。

**第 1 步｜最便宜的一步（无写入，约 5 分钟）**
完全停掉宿主进程树（`dsh web` 的所有进程；**浏览器刷新不等于停宿主**）→ 重启 `dsh web` → 浏览器硬刷新。然后用**新** roster 做三件事：
(a) 逐条目照抄 entry 自己的 `url`（带自己的 `rev`）请求一遍，确认 200 且注册 id 匹配；
(b) 确认 workspace-files 行在**已解析**的组合里、其宿主服务与客户端 `remote.workspaceFiles` 处于 active 而非 pending（只读校验，用解析结果核对，绝不回写整个配置）；
(c) 重开那个 session 域链接，盯 `meta.status` 与网络面板。
**为什么先做它**：alpha.1 那轮的 roster/combo 错位正是被这一步自愈的，而且它同时能证伪"服务的是陈旧 bundle"这一族。预期它**不会**修好 D2（alpha.1 轮重启自愈后内容依旧失败），但必须先用最低成本排除，再谈昂贵的。

**第 2 步｜只读的 profile 取证（同一会话内）**
- 查 profile 的 `cordis.patch.yml` 有没有**手工 insert** 已被 bundle 层提供的行（`workspace-files`、`ui-sidebar-*`）。这是已知的重复 insert 陷阱（troubleshooting 的 `duplicate loader entry id` 行 / #5999）：Cordis 把重复 insert 当致命错误，所以正常会**启动即崩**；本案启动是干净的，因此命中概率低——但检查是零成本的，命中就说明组合里存在第二份来源。
- 扫六个 junction 插件的依赖树，看是否带进**第二份** `@deepseek-ai/dsh-api-workspace-files`（旧 `client.js`、旧 rev）——陈旧客户端模块实例会注册 alpha.1 形状的 provider。
- 核对解析结果里 workspace-files 的行数与客户端 `inject` 图是否闭合。

**第 3 步｜隔离二分（决定"宿主回归"还是"这个 profile"）**
用一个干净的临时 profile（只有内置 web bundle，不装那六个插件），同版本、同样方式打开一个 session 域文件：
- 也失败 ⇒ **宿主回归**，直接上游；
- 正常 ⇒ 触发条件在"六个 junction 插件的存在/组合"，再在临时 profile 上逐行禁用做二分（只动临时 profile，不动用户 profile）。

**第 4 步｜逃生通道（只在用户今天就要用这个面时）**
在**外部**终端、宿主已完全停止的前提下，钉精确版本回退：`npm i -g @deepseek-ai/dsh@<已验证版本>`，即 #5999 里验证过的 `0.1.3-alpha.2`（绝不用裸包名——`latest` 会静默解析到别的线上），然后重启 + 硬刷新。
**必须诚实说明**：内容读取缺陷**早于 alpha.2**（alpha.1 重启自愈后仍然失败），所以回退**能**恢复 alpha.1 的认领行为、消掉 alpha.2 的 absolute 域回归，但**不能承诺**内容读取随之恢复。
期间用户侧临时出路：用 file-trace 面板读（不改任何代码，也不掩盖上游报告）。

**第 5 步｜上游（与 1–4 并行）**
按 §5 打包取证；**插件不发版、不改代码**。

---

## 5. Prevention / upstream

### 5.1 一份完整的上游报告需要什么

1. **身份块**：宿主版本 + 构建/组合 rev（`234716e8f7370214`）、Node、OS build、安装通道（npm -g 原地）、profile 始建于哪个版本（0.1.2/0.1.3）与路径、六个插件的包名+版本+**安装身份**（junction 目标）、解析后的 DSH cohort。源身份与安装身份分开记（skill 要求）。
2. **精确复现**：两个地址原文（absolute 与 session）、session id、文件路径/大小、点击顺序、两句观测文案原文、时间戳。
3. **对照表**：两个读者、同一文件、同一时刻、各自传输与结果。这是整份报告的核心证据。
4. **roster 证据**：`__DSH_BOOT__` 条目数（60）+ workspace-files 行原文（id/url/rev/inject）+ 逐条目按各自 rev 的 200 清单；并**显式记录** 60 vs 62 的计数差与 `-0` vs `-3` 的 rev 差，标为未决问题。
5. **客户端面证据（切开剩余假设的唯一一把刀）**：
   - `file` 资源 provider 注册表：有没有？属于哪个包、哪个 rev？
   - `remote` 命名空间清单：`remote.workspaceFiles` 有没有被广播？
   - `meta.status` 的迁移序列；
   - 网络面板：这次读**有没有发出请求**、发到哪个 URL、状态与耗时。**"没有请求"就等于证明 provider 缺席**；"有请求且 pending"则指向 gateway 派发。
6. **控制台 + HAR（带时间戳）**，并明确写出"资源路径上**零** error"这一事实——静默 fail-soft 本身就是 bug 的签名，不能当成健康证据。
7. **负证据清单**：逐条目 62/62；paste-input 无关（附独立性论证）；file-trace 读出内容（排除文件/权限/scope）；无 duplicate-insert 启动崩溃。
8. **已归因的版本增量**：textpreview→documentpreview 的认领范围、`client-resources` 去 `reload`、`workspaceFiles` 的 scope 重构——每条标注"解释 D1 / 不解释 D2"。

### 5.2 宿主在启动时该检查什么，才能"响一声"而不是渲染空标签

- **B1 逐条目产物断言**：启动时对 roster 每一条目，用**它自己的 url 和 rev** 取一次，要求 200 **且**脚本执行后注册了声明的 id。不匹配 ⇒ 启动即报错并点名条目。这一条能把 alpha.1 那一整类（roster 列了、combo 没服务）在几秒内杀掉。
- **B2 客户端激活断言**：apply 之后逐个检查客户端模块的 `inject` 是否闭合，**包括命名空间化的 remote**（`remote.workspaceFiles`）。今天是弱注入拿到 `undefined` 就静默降级；应该输出 `loaded without activating: <id> — missing remote.workspaceFiles`，而不是让 UI 去猜。
- **B3 提供者在场断言**：注册 tab 类型时，凡 `canOpen` 能认领的**资源类型**都必须已有活着的 provider；没有就拒绝注册该 tab（点开显示"无查看器"），或者标成 degraded 并带上缺失的服务名。今天的顺序反了：tab 先注册成功，provider 后缺席，于是空标签。
- **B4 版本偏斜断言**：被服务的客户端 bundle rev/版本必须等于宿主包版本；新旧客户端模块混装是**启动错误**，不是静默降级。这一条正对"原地升级"这一族。
- **B5 UI 降级契约**：绝不用同一句文案同时表示"provider 缺席"和"读失败"。`status === 'none'` 超过一个期限就升级为 timeout error，并在控制台打出服务名 + 包 id——让下一轮不需要证据包就能看见失败。
- **B6 服务 pending 审计**：沿用 skill 的运行时规则——required/provided 的 Cordis 服务不得停留在 pending，启动摘要要把 pending 行摆出来（A2-01 的宿主 `inject` 含 `sessions`，正是这类会被审计到的依赖）。

---

## 6. 明确不成立的假设（避免误修）

| 假设 | 否证 |
|---|---|
| 模块产物缺失 / 需要重装 | 逐条目 62/62 = 200；join 探针无效（§2） |
| 文件不可读 / 权限 / 路径越界 | 同一文件用 file-trace 读得出；A2-02 之后读本就不受 root 围栏约束 |
| 标签类型没注册 / slot 渲染坏了 | 标题渲染成功 ⇒ 认领 + 挂载 + 渲染均已完成 |
| paste-input 折叠失败导致 | 代码路径零交集、数量正比于聊天历史、资源路径零输出 |
| documentpreview 改名导致内容空 | 出问题的 tab 是 session 域且已被新类型认领；D2 在改名之前（alpha.1）就存在 |
| 插件 API 变了需要改插件 | 该插件用到的认领与挂载面全部通过；无类型/签名证据 |
| 再重启一次就好 | alpha.1 轮重启自愈 roster 后 D2 仍在；D2 跨重启、跨版本存活 |

## 7. 未决（需要现场补一条探针）

1. `remote.workspaceFiles` 是否被宿主广播/在客户端注册（决定 C1 vs C2）。
2. 六个 junction 插件是否带入第二份 workspace-files / client-resources 客户端模块。
3. 为什么 roster 60 而探针 62，以及 `-0`/`-3` rev 差异。
4. 「文件资源服务不可用」这句在 documentpreview 里究竟由"provider 缺席"还是"provider 抛错"触发——读该版本源码即可定案（本条不影响归因层，只影响文案归属）。


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.