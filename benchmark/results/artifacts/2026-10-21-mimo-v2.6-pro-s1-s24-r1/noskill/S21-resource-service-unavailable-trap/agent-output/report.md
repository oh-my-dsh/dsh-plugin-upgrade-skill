# S21 · The Resource Service That "Unavailable" — 诊断报告

- 任务格：`E:\deepseek-harness\dsh-plugin-upgrade-skill\benchmark\results\artifacts\2026-10-21-mimo-v2.6-pro-s1-s24-r1\noskill\S21-resource-service-unavailable-trap`
- 证据包：`fixture/`（只读，7 个文件，未做任何修改）
- 完成时间：2026-10-21T07:44:53.892Z

## 摘要

这是**两处互相独立的主机侧缺陷 + 一处无关噪声**的叠加，不是"文件读不出来"：

1. **声明层回归（claim/scope）**：0.1.5-alpha.2 把 `ui-sidebar-textpreview` 整包换成了 `ui-sidebar-documentpreview`。旧的 "text" tab type 声明 `dsh-resource://file/**`（全 scope）；新的 document tab 的 `canOpen` 只接受 `parseFileAddress(address)?.scope === 'session'`。于是 absolute-scope 的链接无人认领 → `sidebarRight: no registered tab type claims "dsh-resource://file/absolute/…"`。
2. **服务层不可用（本题主症）**：session-scope 的链接能开 tab、标题正确，但内容区只渲染占位符「文件资源服务不可用。」，且 `meta.status` 恒为 `'none'`。文档预览 tab 依赖的 `@deepseek-ai/dsh-api-workspace-files` Remote（即「文件资源服务」）在客户端侧没有解析成功——读请求**根本没有发出去**，不是读失败。
3. **无关噪声**：`dsh-paste-input: fold skipped (parse failed)` 重复告警是聊天消息气泡里历史粘贴附件块的折叠解析失败，与文件读取链路无任何交集。

静态模块服务是**健康的**（62/62 逐条 HTTP 200）；唯一 404 的那条全量拼接 URL 是探针自己造出来的畸形 URL（4–5 KB），与"模块缺失"无关。

---

## 1. Attribution：到底哪一层失败了

**失败层：tab ↔ 文件资源服务（`dsh-api-workspace-files` Remote）之间的服务绑定/解析层**，即客户端 provider 链——不是文件系统、不是静态模块服务、不是 tab 注册、不是 workspace 路径解析。

**两个读取器、同一个文件、同一时刻（contrast-probe.txt）：**

| 读取器 | 传输通道 | 结果 | 结论 |
|---|---|---|---|
| `dsh-file-trace` 插件 | 自己的 host RPC（`/dsh-file-trace/*`） | 读取正常（原文/阅读两种模式都出内容） | **排除**：文件不存在/损坏/被锁/ACL/编码问题、session cwd 与 workspace root 解析错误（该插件走的 `typert lookups.register` → `sessions.get(sessionId)?.header.cwd` 回退 `sandboxPolicy.workspaceRoot` 这条解析路径被正常走通）、`.dsh/tmp` 位置问题 |
| `documentpreview` 侧栏 tab | `api-workspace-files` Remote | **失败**，`meta.status` 停在 `'none'` | **锁定**：故障在 tab 消费的那个服务句柄上——文件资源服务对 tab 不可用 |

- **rule in（坐实）**：故障发生在 documentpreview tab 取用 `api-workspace-files` Remote 的那条服务链上。host 侧并非没有这个模块（cordis.patch.yml 里 workspace-files 行确实存在，boot roster 里也有该行，且 62/62 拉取 200）——**是"服务没有被解析/接管"，不是"文件没有被服务"**。
- **rule out（排除）**：文件内容与权限、workspace root / cwd 解析、`.dsh/tmp` 落点（`index.ts` 的 `read()` 文档明说"files outside it are allowed"，路径根本不是拦路条件）、静态产物缺失、tab type 未注册（tab 都开出来了，标题也对）。
- 单变量对照的要点：两个读取器**只差传输通道**，其余（文件、时刻、session）完全相同，所以故障面被压缩到"通道/服务绑定"这一层。

**`meta.status` 恒为 `'none'` 说明读停在哪里：**
- 不是 `'loading'`（请求从未在途）、不是 `'error'`（没有失败响应可回）、不是 `'ready'`——**读停在"发起请求之前"的服务句柄解析处**。
- 佐证：占位文案是**服务级**的「文件资源服务不可用。」，而不是文件级错误（未找到/无权限/解码失败之类）。也就是说 tab 渲染的是"我没有服务"的兜底 UI，而不是一次读的结果。
- 推论：**重试没有对象**——没有在途请求可重试；先修服务绑定才有意义。
- F12 无红字与此自洽：这是优雅降级（兜底占位符）而非抛异常，**"控制台干净"≠"没有故障"**；空 tab 本身才是信号。

---

## 2. Probe discipline：两条 combo 探针，只有一条可采信

**可采信（测量静态产物服务的有效探针）：Probe 3 —— 逐条 per-module sweep：62/62 HTTP 200，零 404**（combo-probe.txt）。
理由：它请求的正是 manifest 自己声明的 URL 形态——每条 roster entry 一个 URL：`/plugins/??<单模块>/client.js&rev=<每条各自的 rev>`（boot-manifest-excerpt.txt），也就是加载器真实会取的东西。它逐条给出状态/字节数，结论可逐项复核。

**不可采信（不是模块清单证据）：Probe 2 —— 把 62 条全部拼进一个 URL → 404，零长度 body，URL 长 4–5 KB。**
- 真实加载器**永远不会构造**这种 URL；这是探针自己造的畸形请求。
- 404 + 零长度 body + 超长 URL 是**"URL 被拒"的签名**（长度/条目数限制：Windows 上 HTTP.sys/IIS 的 URL 长度上限、或 combo 路由自身的条目上限），不是**"产物缺失"的签名**。缺产物应当表现为"逐条查询时该条非 200"。
- **为什么绝不能引作"modules missing"**：它把传输层假象当成了清单事实。一旦据此去重装/重链 6 个外部插件、去怀疑 roster，就会把调查引向完全错误的方向，而 62/62 的逐条证据已经**证伪**了"缺失"。可引作"缺失"的证据必须是**按 manifest 声明 URL 逐条**出现非 200——例如 discussion #5999 第一轮：roster 列了新增 ui-sidebar-* 模块、同一 rev 下 combo 却 404（旧模块该 rev 200），那是逐条/逐行可核的证据，因此可采信。
- 附带教训（进 upstream）：超长 combo URL 应当回 **414 URI Too Long** 而不是 404，否则永远会被误读成"缺文件"。

**真实加载器怎么取 roster：**
1. 启动后同源拉取 `__DSH_BOOT__`（本例 60 条），拿到**每条 entry 自己的 URL + 各自的 rev 标签**；
2. 按 entry 逐条（或按 host 生成的小批量组合）`GET /plugins/??…&rev=…` 加载，并遵守每条的 `inject` 依赖（例：`dsh-api-workspace-files` 的 inject 为 `dsh-api-gateway` + `dsh-client-resources`）；
3. **不做全量拼接、不自造 rev**。因此"加载器的取法" = per-entry URL，而这正是 62/62 全 200 的那条探针的取法。

> 勘误（如实标注）：boot-manifest-excerpt.txt 写"Total entries: 60"，combo-probe.txt 说"all 62 manifest entries"。两份材料计数不一致（可能截取时间点不同或计数口径不同），进 upstream 报告时应当核对并说明，不要替它圆场。

---

## 3. Distractor separation：把无关缺陷分开

**`dsh-paste-input: fold skipped (parse failed)` 与本次内容读取失败无关。**
- 不同插件、不同子系统：它是聊天消息气泡里历史粘贴附件文本块（``` ==== DSH_PASTE_INPUT_V1 ====` 标记协议）的**折叠/解析**告警，按历史消息逐条重复触发，属于渲染期 warning，不碰文件资源服务、不碰 sidebar tab 的读路径。
- 同页面的反证：告警持续刷屏的同时，file-trace **照常把文件读了出来**——若这些告警真在拦读，file-trace 也该失败。
- 处理方式：在 forensics 里记一行"观察到、已排除"，**不要**把它写进因果链、也不要顺手去修（修了对主症没有任何作用）。

**两个版本之间 roster 还变了什么？**
- 只有一处相关变化：`ui-sidebar-textpreview` **消失**（全 HTML 0 次提及），被 `ui-sidebar-documentpreview` **整包替换**（0.1.5-alpha.2 树中 `packages/client/ui-sidebar-textpreview` → `packages/client/ui-sidebar-documentpreview`；`packages/bundle/web-app/cordis.patch.yml` 携带新的 documentpreview 行，旧行删除）。
- 其余稳定：6 个外部客户端插件（含 dsh-file-trace）全部在场、`dsh-profiles` / `dsh-brand-version` 在场、workspace-files host 行在 patch 里。

**这个更名能解释症状吗？——能解释一半，不能全解释：**
- **能解释**：(a) absolute-scope 报错——旧 "text" tab type 声明 `dsh-resource://file/**` 全 scope，新 document tab 的 `canOpen` 只收 `scope === 'session'`，于是 absolute 链接无人认领，弹 `no registered tab type claims`；(b) 为什么 session-scope 能开 tab 且标题正确（标题来自文件名/tab 注册，不需要服务调用）。
- **不能解释**：内容区空白。那是文件资源服务不可用（`meta.status='none'`）造成的，与更名是**两件独立的事**。
- 所以当前观察到的终态 = ①claim/scope 回归（更名导致）+ ②资源服务绑定不可用 + ③paste-input 噪声，三者叠加。若把 ①② 当成一个 bug 修，会修不好任何一半。
- 与 #5999 第一轮（0.1.5-alpha.1）对比：那一轮是第三种形态——roster/combo 不一致导致所有客户端插件 "loaded without registering"（首个未注册项叫 client-hmr，名字极具迷惑性）；重启自愈了 roster/combo 不一致，但**内容读依旧失败**。同一失败家族的三个断面要分三条记录。

---

## 4. Mitigation decision：要不要在插件里绕过这个"服务不可用"

**不要。插件侧不应做 rewrite / retry / fallback 之类的绕行。**
- 故障在 host 的服务链上，插件控制不到：`meta.status='none'` 说明请求从未发出，**没有可重试的对象**；重试循环只会把"服务没绑定"伪装成"慢"。
- rewrite 地址会掩盖 ①（absolute-scope 无人认领的回归），把该 upstream 修的契约问题固化成插件私货。
- 内容 fallback（比如改用别的通道取文本）会静默给出另一份数据、抹掉仅剩的信号（空 tab + 占位符），下次更难定位。
- 会与被更名的包形成版本脆弱耦合（textpreview→documentpreview 这种改名还会再来）。
- 占位符「文件资源服务不可用。」是**设计好的失败信号**，别把它去掉——要改的是"让它更响"，不是"让它闭嘴"。

**维护者动作顺序：**
1. **第一步（最便宜）**：重启一次 `dsh web` 并复测一次 session-scope 点击。成本秒级、非破坏。依据：#5999 第一轮里重启曾自愈过 roster/combo 不一致（in-place npm 升级 + 旧 profile + 六个 junction 链接的外部插件，典型 stale module graph / provider 初始化顺序问题）。注意：第一轮里重启**只**自愈了 roster，内容读仍然失败——所以重启是分诊，不是药。
2. **第二步**：把 6 个外部客户端插件按 alpha.2 重新链接/重装（0.1.2/0.1.3 时代留下的 junction 可能指着旧树），并做**服务级**核验：`__DSH_BOOT__` 全量 roster、workspace-files 服务是否真的被解析（不是只看 HTTP 200），顺带搜 "loaded without registering" 类告警。
3. **逃生舱（escape hatch）**：回滚到最后一个已知可用的已发布版本——`npm i -g @deepseek-ai/dsh@0.1.3-alpha.2`（#5999 已验证可用；也可选本部署最近的 known-good）。**先把 forensics 采齐再回滚**。这是 host 侧 bug，卡在坏版本上换不到任何东西。
4. **进 upstream**：见第 5 节；挂到 #5999 下的 round 2（comment 18371079），让两轮证据在同一处。

---

## 5. Prevention / upstream：完整取证 + 让故障"响起来"

**一份完整 upstream 报告需要的 forensics（清单；括号内为本证据包已有的卡）：**
1. **身份信息**：版本对 0.1.5-alpha.1 → 0.1.5-alpha.2、npm global in-place、Windows 11、profile 创建于 0.1.2/0.1.3、六个外部客户端插件 junction-linked（列出各自路径与链接目标）、node/npm/`dsh --version`。（symptom-log.txt 抬头）
2. **时间线与逐字症状**：两段对话框原文、两个地址（absolute + session scope 的完整 URI）、「文件资源服务不可用。」、`meta.status === 'none'`。（symptom-log.txt §Timeline-2/3）
3. **roster 全量**：`__DSH_BOOT__` 全部 60 条（含每条 URL+rev+inject）与 textpreview/documentpreview 普查；并解释 60 vs 62 的计数差。（boot-manifest-excerpt.txt）
4. **探针数据分开呈报**：(a) 逐条 sweep 的每条状态/字节数/rev（**唯一可作清单证据**）；(b) 全量拼接 URL 的 404，**显式标注"URL 长度假象，非清单证据"**，附 URL 长度与零长度 body。（combo-probe.txt Probe 3 / Probe 2）
5. **对照探针**：同文件双读取器表格 + 传输通道 + `meta.status`。（contrast-probe.txt）
6. **控制台**：无红字这一事实 + paste-input 告警并标注"已排除、不同子系统"。（console-excerpt.txt）
7. **host 侧配置事实**：cordis.patch.yml 的 workspace-files 行、documentpreview 行、textpreview 行删除；workspace-files 服务解析路径（typert lookups.register → `sessions.get(sessionId)?.header.cwd` 回退 `sandboxPolicy.workspaceRoot`）；`index.ts` `read()` 的"files outside it are allowed"。（boot-manifest-excerpt.txt / contrast-probe.txt host notes）
8. **前作链接**：discussion #5999 round 1 + 本轮 round 2 comment 18371079。
9. **最小复现 + 负对照**：开会话 → 在 `.dsh/tmp` 写测试文件 → 点链接；负对照 = 同一文件用 file-trace 读取成功。

**host 启动期可以做的检查（让这类失败"响"，而不是渲染空 tab）：**
1. **roster 可服务性自检**：生成 `__DSH_BOOT__` 后对每条 entry 的声明 URL+rev 逐条 HEAD/GET，任何非 200 → 启动期大声报错并点名该条（这一条就能抓住 #5999 第一轮）。
2. **服务依赖闭包检查**：对每个消费 host 服务 Remote 的客户端消费者（documentpreview → api-workspace-files），断言 provider 先于消费者注册且可解析；解析不到 → 抛错/红色 banner，**绝不落静默占位符**。
3. **tab 认领覆盖率检查**：枚举会话内出现的 resource scheme+scope 组合（`dsh-resource://file/absolute/**`、`/session/**`），断言各有 claimer；缺失时在启动期/首次点击时点名"缺哪个 claimer"（把现在的对话框升级成带名字的诊断）。
4. **空 tab 看门狗**：`meta.status` 超时仍为 `'none'` → 升级为显式错误态（重试按钮 + "用 file-trace 打开"兜底），并打**一条结构化事件**（address、scope、服务是否解析、通道、status），让空 tab 可从日志诊断。
5. **升级一致性检查**：识别 junction 链接的客户端插件与 profile 模块图是否指向升级前的 dsh 树，混版时启动期告警。
6. **combo 路由别再伪装成清单问题**：超长 combo URL 返回 **414** 而非 404，杜绝 Probe 2 式误读。

---

## 附录 · 证据索引（卡片，仅要点）

| 卡 | 用途 |
|---|---|
| symptom-log.txt §Timeline-2 | absolute-scope claim 报错原文（更名回归的证据） |
| symptom-log.txt §Timeline-3 | 「文件资源服务不可用。」+ file-trace 读取成功（主症 + 负对照） |
| contrast-probe.txt | 同文件双读取器、`meta.status='none'`、host 侧解析路径与 read() 文档 |
| combo-probe.txt Probe 3 | 62/62 逐条 200（静态服务健康） |
| combo-probe.txt Probe 2 | 全量拼接 404（URL 长度假象，禁止引作缺失） |
| boot-manifest-excerpt.txt | roster 普查：textpreview 消失 / documentpreview 接替 / 六插件在场 |
| console-excerpt.txt | 无红字；paste-input 告警（无关） |
| discussion-excerpt.txt | #5999 round 1 + round 2 comment 18371079；回滚逃生舱已验证 |

## run-stats

- toolcalls 总数：5 次 `run_code` 外层调用，内含 16 次工具调用（1 glob、7 read、5 write、2 edit、1 send_message；5 write 含本报告及其副本、tool-transcript.txt、transcript-manifest.txt，2 edit 为 run-stats 校正）
- token 用量：n/a（本会话不可见）
- 完成时间：2026-10-21T07:44:53.892Z
