# S21 · “文件资源服务不可用” 归因报告
### dsh 0.1.5-alpha.1 → 0.1.5-alpha.2 就地升级后，右侧 Sidebar 文件页签「有标题、无内容」

> 证据范围：fixture/ 七份材料（symptom-log / boot-manifest-excerpt / combo-probe / contrast-probe /
> console-excerpt / discussion-excerpt / README）。全部结论均可回溯到这些材料中的具体行；无法由材料
> 直接判定的地方，明确标注为**推断**并给出可证伪的判别实验。
> 未读取 skills/、未读取任何 fixture 之外的内容，未修改 fixture。

---

## 0. 结论摘要（TL;DR）

| 问题 | 结论 |
|---|---|
| 哪一层坏了 | **客户端 shell 的资源元数据 / provider 绑定链**（documentpreview 页签 ↔ @deepseek-ai/dsh-api-workspace-files Remote ↔ @deepseek-ai/dsh-client-resources），**不是**文件、不是主机读取能力、不是网络、不是插件本身 |
| 关键判据 | 同一文件、同一时刻，file-trace 自己的 host RPC 读得到；documentpreview 页签的 meta.status 恒为 'none' —— 状态**从未离开初值**，说明读取**根本没发起**，而不是发起后失败/超时 |
| 两个 combo 探针 | 逐模块扫描（62/62 200）是**有效**测量；62 个条目 join 成一个 URL 的 404 是**无效**测量（请求本身非法，且返回零长度），**永远不能**被引用为「模块缺失」 |
| dsh-paste-input 警告 | **无关**。不同模块、不同渲染路径（历史粘贴消息折叠），且在任何页签下都会出现 |
| 是否该让插件绕开 | **不该**。rewrite / retry / fallback 全部无效或有害；正确顺序是「重启+干净 profile 判别 → 取证 → 回滚逃逸 → 上游修复」 |
| 首个廉价动作 | 冷重启 web host + 关缓存强刷，并用**干净 profile**（不挂六个 junction 插件）做一次对照 |
| 逃逸口 | npm i -g @deepseek-ai/dsh@0.1.3-alpha.2（#5999 已验证的上一发布版本回滚） |
| 上游 | 把 alpha.2 的「元数据状态静默停在 none → 渲染空页签」+「canOpen 收窄为 session」两件事分开立项，并附完整取证包 |

一句话：**标题渲染证明「claim 谓词通过」，内容空白证明「资源句柄解析失败」**；这是一次
*壳层资源供给链未接管*，被壳层用一句静态降级文案吞掉了的错误。

---

## 1. 归因（Attribution）

### 1.1 失败点在链路的哪一段

把「点链接 → 出现内容」拆成四段，逐段对照证据：

| # | 环节 | 归属 | 证据 | 判定 |
|---|---|---|---|---|
| 1 | 页签类型 claim（canOpen 谓词） | 客户端 shell 纯谓词 | 绝对地址：报 no registered tab type claims …absolute/…；会话地址：页签**开出来且标题正确** | alpha.2 行为变更（见 §1.4），**worked as designed** |
| 2 | 资源元数据 provider 解析（拿到 meta 句柄） | 客户端 client-resources + 页签 | meta.status 恒为 'none' | **✗ 卡在这里** |
| 3 | Remote 调用 api-workspace-files | 客户端↔host RPC | console 无红错、无 404、无 failed fetch；file-trace 走同 host HTTP 面成功 | 未被执行（因为第 2 段没产出句柄） |
| 4 | host 读文件 | host | file-trace 同一文件读取正常；read() 文档明确「workspace 外的文件也允许」 | **✓ 正常** |

**结论：断点在 2，而不是 3 或 4。** 这不是「读失败」，是「没有读」。

### 1.2 meta.status === 'none' 到底说明了什么（最关键的一条）

元数据对象的状态机是 none → loading → ready | error 这类四态：

- 若是 **in-flight**：应为 loading；
- 若是 **HTTP/权限/路径失败**：应进入 error/failed，并伴随红错或 failed 请求；
- 实测是 **'none'**，即**初始值**。

因此可推断：**请求从未被派发**。documentpreview 页签在「拿到资源元数据句柄」这一步就没走通，
于是渲染路径落到静态降级文案「文件资源服务不可用。」。这同时解释了三件本来看起来互相矛盾的事：

1. 为什么 F12 **没有任何红错**——降级文案是**设计内空态**，不是异常；
2. 为什么**没有 404 / failed 请求**——host 根本没被问过；
3. 为什么 file-trace **同时读得通**——它走的是自己的 HTTP 面，完全绕开了这条断掉的绑定。

> 「no error」+「no content」+「status 不动」三者同时成立，只可能指向**供给链未接管**
> （provider/RPC binding 没建立），而不是**传输失败**（传输失败一定会留下痕迹）。

这与 #5999 里 alpha.1 轮的描述完全同构：「重启自愈了 roster，但 resource-provider chain
did not take over」——**同一个家族，第二轮更窄**。

### 1.3 两个读者 rule in / rule out 了什么

同一文件、同一时刻、同一 host 进程，两个读者结果相反。这是本次证据里信息量最大的一次对照：

| | file-trace 自有 RPC | documentpreview 页签 |
|---|---|---|
| 传输 | /dsh-file-trace/*，自己的 HTTP face | api-workspace-files Remote |
| 结果 | **读取成功**（原文/阅读两模式均有内容） | 失败，meta.status='none' |

**被 rule OUT（可排除）的：**

- ✗ 文件层：路径、文件名、编码、大小、是否存在 —— 同一份字节，一个人读到了；
- ✗ 权限 / ACL / 沙箱：能读的人就在同一个 host 进程里；
- ✗ workspace 根归属：.dsh/tmp 本就在 workspace root 下；且 read() 文档说明**workspace 外也允许**，所以「包含关系」不是阻塞点；
- ✗ 整个 host 挂掉 / HTTP 面挂掉 / 整个 RPC 栈挂掉 —— file-trace 的 RPC 就跑在同一个 host 上；
- ✗ documentpreview 包崩溃或抛异常 —— 页签**标题正常渲染**、console 无红错；
- ✗ 全局网络 / 代理 / 证书 —— 同源请求，且 62/62 静态资源 200。

**被 rule IN（锁定）的：**

- ✓ 失败被限定在**「documentpreview 页签 → workspace-files Remote」这一段特定绑定**上：只影响这条路径，同一 host 上其它路径都通；
- ✓ 该绑定**没建立**（而不是建立了但调用失败）：状态停在 none，没有请求发出；
- ✓ host 侧的 workspace-files **行是存在的**（cordis.patch.yml 里有
  - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'），所以问题不在「host 没装这个服务」，而在**客户端侧消费方拿不到它**。

### 1.4 关于「绝对地址打不开」：它是**另一件事**，不是本次空白的成因

boot-manifest 明确写着：alpha.2 里 ui-sidebar-documentpreview 取代了
ui-sidebar-textpreview，新页签的 canOpen **只接受 parseFileAddress(address)?.scope === 'session'**。

- alpha.1 的 text 页签 claim 的是 dsh-resource://file/**（含 absolute）；
- alpha.2 的 document 页签只 claim session。

所以第 2 步的对话框（absolute 无 claim 者）是**能力收窄**（regression in capability，需要上游确认
是否有意为之），而第 3 步的空白是**供给链未接管**（regression in wiring）。两者：

- **同一版本引入、同一次点击体验、但根因不同、修复动作不同**；
- 不能用「canOpen 收窄」解释空白：会话地址**已经被 claim 了**（否则不会有标题）。

**标题是分水岭**：claim 是纯谓词、客户端求值，过了就有标题；内容要的是**已解析的资源句柄**。
标题在、内容空 → 谓词过、句柄无。这一条把「新包设计变更」和「绑定失败」干净地切开了。

### 1.5 为什么是「in-place upgrade + junction 插件」这个组合（推断，可证伪）

__DSH_BOOT__ 里 workspace-files 那一行长这样：

```
{"id":"@deepseek-ai/dsh-api-workspace-files",
 "inject":["@deepseek-ai/dsh-api-gateway","@deepseek-ai/dsh-client-resources"]}
```

它**依赖另外两个模块先就位**才可能完成 Remote 注册。就地升级 + 六个 junction 外部插件会改变
客户端模块的**装配顺序与 rev 一致性**；一旦 client-resources / api-gateway 在其之前未完成注册，
workspace-files 的 Remote 注册就会**静默失败**（不抛错——于是 console 干净），页签侧表现为
「没有 provider」→ status='none' → 静态空态文案。这与 #5999 alpha.1 轮「roster 与 combo 不一致
导致 loaded without registering」是同一失效模式的轻症版本：**注册缺失被吞掉，只留下症状**。

**判别实验（见 §4.2 T2）**：在**干净 profile**（同样 alpha.2，不挂六个 junction 插件）里点同一个
session 地址。空白复现 → 包自身缺陷，纯上游；不复现 → 插件集合/顺序是触发器，仍属上游但需附插件清单。

---

## 2. 探针纪律（Probe discipline）

### 2.1 两个 combo 探针，哪个算数

| 探针 | 形态 | 结果 | 有效性 |
|---|---|---|---|
| Probe 1 | 单模块：/plugins/??@deepseek-ai/dsh-api-gateway/client.js&rev=…-0 | 200 / 73 616 B | **有效**（最小可判定单元） |
| Probe 2 | **62 个模块逗号 join 成一个 URL**（~4–5 KB） | **404，零长度** | **无效** |
| Probe 3 | 逐条目扫描（每个模块单独取） | **62/62 200，零 404** | **有效**（这才是全量普查） |

### 2.2 为什么 Probe 2 从测量学上就是废的

1. **请求本身非法**：/plugins/?? 组合路由的语法是**按条目分段**——
   ??modA/client.js&modB/client.js&…，且 **rev 是按条目下标带后缀**的（roster 里可见
   rev=234716e8f7370214-3、…-N）。Probe 2 用**逗号 join** + 单一 rev=…-0 去请求 62 个模块，
   等于**用一个 rev 号去覆盖 62 个条目**，请求在格式层就已经不是加载器会发出的那个请求。
2. **长度越界**：4–5 KB 的 URL 超出组合路由/前置处理的合理长度，返回零长度 404 是**路由层拒绝**的
   典型形态，与「产物不存在」在响应上不可区分——这正是最危险的地方。
3. **零长度 404 是无信息响应**：没有 body、没有 diagnostic，无法归因到「模块缺失」；它只说明
   **这个请求被拒了**。
4. **它与 Probe 3 直接冲突且 Probe 3 更强**：同一个 host、同一 rev 家族，逐条 200、零 404。
   当两个探针冲突时，**粒度更细、请求形态更接近真实加载器的那个胜出**。

### 2.3 为什么它**永远不能**被引用为「模块缺失」

- 「缺失」是一个**关于产物库存**的断言；Probe 2 只观测到**一个畸形请求被拒**。
- 用 Probe 2 下结论会立刻导致**错误的修复方向**：去重装/重打包/重建 bundle（昂贵、破坏现场），
  而真正的问题是客户端绑定（廉价、可重启验证）。
- 事实上 Probe 1/3 已经**反证**了缺失：单模块取回 73 616 字节且 62/62 = 200，产物是**齐的**。
- 纪律一句话：**探针必须先证明自己发的是加载器会发的那个请求，才有资格对库存发言。**

### 2.4 真实加载器怎么取 roster

不是「猜一个 join 再祈祷」，而是**以 roster 为唯一真相源、逐条目按自带 URL 取**：

1. 同源取 __DSH_BOOT__（boot manifest），拿到**条目清单**；
2. 每个条目自带完整 url（含**自己的** rev=hash-index）与 inject 依赖表；
3. 按条目（或小批量分段）请求各自 URL，**rev 逐条对齐**，不做跨条目共享；
4. 因此「一致性」是**逐条目**成立的——这也正是为什么「62 个模块合成一个 URL」在语义上就不成立：
   它把 62 个各自独立的 (url, rev) 对折叠成了一个。

顺带一条取证价值：boot manifest 写 **Total entries: 60**，而 combo 普查口径是 **62**。这个
**60 vs 62 的口径差**本身就是就地升级后 roster 可能处于**半更新状态**的旁证，应原样写进上游报告
（§5），但**不要**据此下「缺两个模块」的结论——它同样没被逐条验证过。

---

## 3. 干扰项隔离（Distractor separation）

### 3.1 dsh-paste-input: fold skipped (parse failed) —— 无关

| 判据 | 事实 |
|---|---|
| 模块 | dsh-paste-input（client.js:1010），与 sidebar / documentpreview / workspace-files **无调用关系** |
| 触发条件 | 解析**历史消息**里的 ==== DSH_PASTE_INPUT_V1 ==== 附件协议标记，属于**聊天消息气泡渲染**路径 |
| 频率特征 | 「repeats for every historical paste-attachment message」——**与页签是否打开、打开哪个文件无关** |
| 严重性 | 是**降级**（fold skipped → 退回显示原始文本块），不是失败；不会阻断任何读取 |
| 反证 | 即使 documentpreview 完全正常，这些警告也会照常出现；反之把它们全部修掉，空白页签**依然空白** |
| 时序 | 它们在页面加载后即出现，而 meta.status 是从头到尾不动——两者没有共同的状态变量 |

**结论：纯粹的时间相关性（同一屏 console）。** 它最多是一条**独立的低优先级 bug**（旧附件格式解析
不兼容），应单独记录，**不得**混入本次归因，否则会把「壳层资源供给」和「消息渲染」两条线搅在一起，
让上游拿到一份自相矛盾的报告。

### 3.2 roster 在两个版本之间变了什么，是否解释症状

| 变化 | 证据 | 能解释什么 | 不能解释什么 |
|---|---|---|---|
| ui-sidebar-textpreview **改名/替换**为 ui-sidebar-documentpreview | boot-manifest 普查：textpreview 命中 0 次；cordis.patch.yml 换行 | **症状的形状**：新页签走**元数据驱动**的内容路径（因此才会依赖 workspace-files Remote），失败表现从「打不开」变成「打开了但空」 | **症状的成因**：包在不在、注册成没成 |
| canOpen 收窄为 session only | boot-manifest 注记 | **第一个对话框**（absolute 无 claim 者） | **第二个对话框**（session 地址已被 claim，标题都在） |
| 组合路由 rev 后缀（-3、-N） | boot-manifest 两行 | 说明 rev 是**逐条目**的，佐证 §2.2 | 与空白无直接关系 |
| roster 口径 60 vs 62 | 两份材料对照 | 提示 roster 可能半更新（待验证） | 不能推「缺模块」（见 §2.4） |

**一句话**：改名解释了**为什么坏的是这个组件、这个代码路径**；它**不解释为什么这条路径没被接上**。
把「改名」当根因，会得出「等下一个版本修」的错误结论；真正的可动变量是**装配/注册**，而它是
**重启即可复验**的。

### 3.3 还有哪些「像原因但其实不是」的东西

- **绝对路径打不开** → 是设计变更，不是绑定失败（§1.4）；
- **62/62 全 200** → 只证明静态产物齐，**不证明**任何运行时注册（静态面与运行时面是两套）；
- **console 干净** → 不是「没问题」，是「错误被降级成空态文案吞掉了」（这正是 §5 要上游改的地方）；
- **.dsh/tmp 在 workspace 内** → 也不是原因：read() 明确允许 workspace 外（§1.3）。

---

## 4. 处置决策（Mitigation decision）

### 4.1 插件**不该**绕开这个服务

明确判定：**不 rewrite、不 retry、不 fallback**。理由是四条独立的、每条都足以否决：

1. **层错了**：失败在**壳层自有**的 documentpreview 页签 + api-workspace-files Remote + client-resources
   这一串，**不归插件所有**。插件既不能注册这个 Remote，也不能替壳层解析资源句柄，改写自己的代码
   对这条链**零作用**。
2. **retry 无对象**：status='none' 意味着**请求从未发出**（§1.2）。没有 in-flight 请求，就没有可重试
   的东西；加退避与重试只会把一个静态空态变成一个**转圈的空态**，把症状伪装得更久。
3. **fallback 有害**：让插件用自己的 RPC 把内容塞进壳层页签，等于**在别人的页签里实现一个私有的
   资源通道**——它会（a）掩盖真实缺陷，（b）与壳层未来的资源契约**静默分叉**，（c）在下次升级时
   变成第二处需要维护的兼容层。插件已经有一条可用的自有通道（file-trace 面板），**那才是它该待的地方**。
4. **成本错配**：这是**就地升级**产物，重启/干净 profile/回滚三种手段都是分钟级；为它写兼容层是
   小时级且**不可回收**的技术债。

> 可接受的「临时用户体验缓解」只有一种，且**不写进插件代码**：在 issue 里指引用户**先用 file-trace
> 面板读文件**（已验证可用），并说明这是 alpha.2 的已知缺陷。这属于文档，不属于 workaround。

### 4.2 维护者的动作顺序（严格按序，先取证后破坏现场）

**T0 — 冻结现场（5 分钟，先做，因为后面步骤会毁掉它）**
截屏（页签标题 + 空态文案）、存 console 全文、存 __DSH_BOOT__ 原文 JSON、存 dsh --version / 全局包
路径 / profile 目录清单（六个 junction 插件的 id、路径、是否 junction）、存 cordis.patch.yml 相关行、
导出 Network 面板（**重点是「缺失」**：documentpreview 页签打开时，对 workspace-files 的请求
**一条都没有**——这条「没有请求」本身就是最强证据）。

**T1 — 第一个廉价动作：冷重启 + 强刷（分钟级，先试这个）**
不是刷新页面，是**停掉 dsh web 进程再起**，然后**关缓存硬刷新**（或 DevTools 勾 Disable cache）。
依据：#5999 记录过「一次 host 重启自愈了 roster/combo 不一致」。就地升级后，进程内的旧 bundle、
旧 rev、旧 roster 都可能还活着；冷启动是**唯一**能让装配顺序重来一遍的廉价动作。
→ 若好了：记录「重启即愈」这个事实（它本身是上游的重要线索：**非确定性装配**）。

**T2 — 判别归属：干净 profile 对照（十分钟级，决定后面是修还是报）**
用**同样的 alpha.2** 起一个**全新 profile**（不挂六个 junction 插件），点同一个 session 地址：

- **仍空白** → 包自身缺陷，与插件无关，直接进 T4，走上游；
- **正常** → 触发器是插件集合/装配顺序（inject 依赖，§1.5），仍属上游，但报告必须附**插件清单**，
  并给出「逐个加回插件」的最小复现序列。

这一步的性价比最高：它把「我们环境的问题」和「产品的问题」一刀切开，避免上游来回问。

**T3 — 逃逸口：版本回滚（已由 #5999 验证过的那条路）**
npm i -g @deepseek-ai/dsh@0.1.3-alpha.2，重启。这是**已被验证**的 escape hatch；注意 alpha.1 并不能
算安全落脚点（它有自己的 roster/combo 404 家族问题）。回滚后核对：页签是否正常、六个插件是否仍
junction 链接有效、profile 是否需要按 0.1.3 的布局重扫。

> 回滚是**逃逸**，不是**修复**：它只买时间，不消除缺陷；且回滚后**不要再就地升级到同一版本**，
> 直到 T4 的结论回来。

**T4 — 上游（与 T1–T3 并行，不要等）**
把 §5 的取证包发到 #5999（作为 round 2，接 comment 18371079）或新开 issue，并**明确分成两个条目**：
(a) 元数据 status='none' 静默降级为空页签（**主缺陷**）；
(b) canOpen 收窄为 session-only 导致 absolute 地址无 claim 者（**能力回归，需产品确认是否有意**）。
两者**不要**混在一条里——它们的负责方和修法都不同。

---

## 5. 预防 / 上游（Prevention / upstream）

### 5.1 一份**完整**的上游报告需要的取证（缺一项上游就得来回一轮）

**A. 环境与版本指纹**

- dsh --version 前后两版；npm ls -g 的包路径；安装方式（npm i -g，就地）；
- OS/终端（Windows 11）、shell、Node 版本；
- **profile 的年龄与出身**：created under 0.1.2/0.1.3（这是关键变量，必须写明）；
- **插件清单**：六个 external client plugin 的 id / 路径 / **是否 junction** / 各自版本 / 是否在
  __DSH_BOOT__ 里出现。

**B. roster 取证（两份快照 + diff）**

- 升级**前**与**后**的完整 __DSH_BOOT__（条目数、id、url、**每条 rev 后缀**、inject 表）；
- 与上个版本 roster 的 **id 级 diff**（哪些行新增/消失/改名）；
- 特别标注：ui-sidebar-textpreview 消失、ui-sidebar-documentpreview 出现、api-workspace-files 的
  inject 依赖两项；
- 记录 **60 vs 62** 的口径差（§2.4），并说明各自的采集口径，不要下结论。

**C. 产物服务取证（有效探针 + 反例）**

- 逐条目探测的**完整表格**：URL、rev、HTTP 状态、**字节数**（62/62 200 的证据力来自字节数）；
- **一条无效探针的原样记录**（4–5 KB join → 404 零长度），并注明「**此为反例，不作为库存证据**」——
  这条本身对上游客服/文档有价值：它说明用户很容易做出这个错误探针。

**D. 双读者对照（最强证据，务必成对给出）**

- 同一文件的**完整地址字符串**（session-scoped 那条，逐字）；
- file-trace 读取**成功**的截图/输出；
- documentpreview **失败**的截图（标题 + 「文件资源服务不可用。」）；
- **meta.status 的观测值 'none'** 及其观测方式（哪个面板/哪行代码/什么时机多看几次）；
- 一句结论式陈述：**同一 host、同一时刻、同一字节，一条通一条不通**。

**E. 运行时注册状态（证明「没注册」而不是「调失败」）**

- Network 面板证据：页签打开期间**没有任何**发往 workspace-files 的请求（**「没有请求」要显式写出来**，
  它比「请求失败」更说明问题）；
- 若可得：客户端服务注册表 / Remote 绑定表的 dump（workspace-files 是否 registered、由谁注册、
  注册时机相对于 client-resources/api-gateway 的先后）；
- 模块加载时序（Performance / performance entries），用于验证 §1.5 的 inject 顺序假设。

**F. 排除项（写清楚「不是什么」，省上游一轮）**

- 文件存在、可读、在 workspace 内；read() 允许 workspace 外；
- console 无 sidebar/resource 红错；无 404；静态产物 62/62 200；
- dsh-paste-input 警告已确认**无关**（附理由），不构成干扰。

**G. 最小复现**

- 干净 profile + alpha.2 + 无外部插件 → 结果（T2）；
- 逐个加回插件 → 首次复现的插件与顺序；
- 重启是否改变结果（T1）——**「重启即愈」必须单独记录**，它是非确定性装配的直接指纹。

**H. 对 alpha.1 轮（#5999 round 1）的对照**

- 说明是**同一 family、更窄的一轮**：alpha.1 是「roster 与 combo 不一致 → 全部 loaded without
  registering」；alpha.2 是「产物齐、roster 齐、**单个 Remote 未接管**」；
- 附上 alpha.1 那次「重启自愈 roster 但内容仍失败」的记录——它证明**绑定失败可以独立于 roster 存在**。

### 5.2 host 在 boot 时该检查什么，才能让这类失败**响亮地失败**而不是渲染空页签

按「能在多早期抓到」排序，五条都可以做成 boot 断言：

1. **roster × 产物 自检**：装配完 roster 后，对每个条目的 url 各做一次取（HEAD 或小 GET），
   断言 **200 且非空**，并校验 rev 后缀与条目下标一致。不一致 → **拒绝起服务并点名模块**。
   （这条直接拦住 alpha.1 那一整类「roster 列了但 combo 404」。）
2. **依赖闭包自检**：对每个模块的 inject 列表，断言被依赖项**都在 roster 内**且**已被标记加载完成**；
   缺失或顺序未满足 → 启动时报 module X requires Y which is not registered，**而不是继续启动**。
   （这条正是 §1.5 假设的正面拦截。）
3. **注册断言（关键）**：boot 完成后做一次**资源链路的冒烟**——用一个**合成的 session 作用域地址**，
   走一遍「资源注册表 → provider 解析 → 元数据句柄」；要求 **status 能离开 'none'**。
   拿不到句柄 → 启动即失败并打印：缺的是哪个 provider、哪个模块该注册它、该模块的加载状态。
4. **页签类型覆盖面自检**：枚举资源 scheme 能产生的**所有作用域**（session / absolute / workspace …），
   断言每个作用域**至少有一个 tab type 的 canOpen 命中**；有缺口 → boot 期 WARN 并列出
   「无 claim 者的 scope 清单」。（这条能提前暴露 alpha.2 的 canOpen 收窄这类能力回归。）
5. **空态必须可诊断**：`文件资源服务不可用。` 这种静态降级文案，要么**带上**
   （地址、期望的 provider、最后一次状态迁移、一个诊断 id / ?debug=resource 开关），
   要么在 dev/CI 构建里**直接 throw**。原则是：**渲染空内容必须是一个有日志的事件，
   不能让「没有异常」和「没有内容」同时成立。** 当前这种「静默空态」是本案最该被修掉的
   放大因子——它把一个可诊断的装配失败，变成了一个只能靠人肉双读者对照才能定位的黑洞。

---

## 6. 置信度与可证伪点

| 结论 | 置信度 | 怎么证伪 |
|---|---|---|
| 断点在资源元数据 provider 解析，不在 host 读取 | **高**（双读者 + status='none' + console 静默，三条独立同向） | 若能证明页签在 none 时**已发出**请求（抓到 packet），则本结论改为「传输层失败」 |
| Probe 2 无效、Probe 3 有效 | **高**（请求形态与 roster 的逐条目 rev 直接矛盾） | 若发现加载器确实会发逗号 join 的组合 URL，则需重估 |
| paste-input 无关 | **高**（不同模块、不同数据、频率与页签无关） | 若禁用 paste-input 后空白消失，则需重估 |
| 改名解释了形状而非成因 | **高** | 若回滚到 alpha.1 后**无** canOpen 收窄却**同样**空白，则说明绑定失败独立于改名（与 #5999 round 1 一致，本报告已兼容此情形） |
| inject 装配顺序是触发器 | **中**（推断，缺时序/注册表 dump） | T2 干净 profile 对照 + 插件逐个加回；或抓模块加载时序 |

---

### 附：一页速查

- 坏在哪：**documentpreview 页签 → workspace-files Remote 的绑定**（客户端供给链），不是文件、不是 host、不是网络。
- 凭什么：**同一文件两个读者，一成一败；meta.status 恒 'none' = 请求从未发出**。
- 探针：**逐条 200 算数，62 合 1 的 404 不算数**（语法/长度/rev 全错，零长度无信息）。
- 干扰：**paste-input 折叠警告与本故障无关**；absolute 打不开是 canOpen 收窄，另一件事。
- 处置：**冷重启 + 干净 profile 判别 → 取证 → 0.1.3-alpha.2 回滚逃逸 → 上游双条目立项**。
- 上游：要 **roster diff / 逐条字节数 / 双读者成对证据 / status='none' / 「没有请求」的 Network / 干净 profile 复现**。
- 预防：**roster×产物自检、inject 闭包自检、资源链冒烟、scope 覆盖面自检、空态可诊断**——让它在 boot 时就响。
