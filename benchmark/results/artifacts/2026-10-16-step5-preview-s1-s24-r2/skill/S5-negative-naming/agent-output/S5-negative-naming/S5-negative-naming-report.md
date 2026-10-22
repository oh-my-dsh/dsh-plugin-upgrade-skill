# S5 · 社区插件命名四态判定报告（只读）

- **判定对象**：`fixture/package.json`、`fixture/dsh-plugin.naming.json`、`fixture/README.md`
- **报告时间**：2026-10-16T11:45+08:00（容器时间，Asia/Shanghai）
- **执行方式**：纯只读审查。未修改 fixture 任何字节，未构建/安装/迁移任何东西，未执行 npm / dsh / 网络请求。
- **fixture 完整性（本次审查前后）**：

  | 文件 | 字节数 | sha256 |
  |---|---|---|
  | package.json | 67 | `71cd34926a4686d2098c582b93f86305c772f1e7d0bee5be9f1ca64d26ec99bc` |
  | dsh-plugin.naming.json | 573 | `2863bfaf22ab7c9ff69a03b06af2cc1808cec2054987fcf5c6d4c55df61cb6b0` |
  | README.md | 641 | `f27373bc472e94e859b37407eaf5332fcda747a7f55110a4ea9d430644862645` |

- **本地可用依据**：仅 `skills/plugin-upgrade/`（SKILL.md 及其 references/、scripts/、examples/）。**本地材料中不存在 `dsh-plugin-naming/v1` 的策略正文**（全文检索 `dsh-plugin-naming` / `pluginNames` / `loaderIds` / `skillProviders` / `settingsNamespaces` / `coordinate` 均未命中该策略定义）。因此本报告**不能对任何命名面引用规范条文**，只能做「语法形态 + 内部一致性 + 与本地一手事实的交叉比对」。

---

## 一、结论摘要

**判定为「兼容性错误（compatibility error）」的面：0 个。**

这**不意味着没有问题**。原因有二，且都是本次审查无法闭合的硬缺口：

1. **规范缺口**：命名策略 `dsh-plugin-naming/v1` 的正文不在本地任何可用材料中。没有规范条文，就没有「违反规范」可言——0 个错误是「无法判定」，不是「判定为合规」。
2. **注册表缺口**：本次未做任何在线查询（npm view / 插件索引 / 宿主路由表）。因此对「某名字是否已被占用」「某前缀是否被宿主保留」「某名字是否全局可用」**一律不给结论**，全部记为 unknown / needs registry context。

真正需要作者动手的是 **3 个碰撞建议（collision recommendation）** 和 **1 个与命名无关的发布阻断**（`private: true`）。

### 判定总表

| # | 面（surface） | 声明值 | 判定 |
|---|---|---|---|
| 1 | plugin 坐标 / 包名 | `acme/greet` · `dsh-greet` | 无兼容性错误（内部一致）；注册表占用 **unknown** |
| 2 | pluginNames（官方短名） | `greet` | **needs registry context** + 碰撞建议 |
| 3 | loaderIds | `acme-greet` | 无兼容性错误；唯一性 **needs registry context**；与 `package.json name` 不一致 → 碰撞建议 |
| 4 | services | `search` | **碰撞建议**（不是错误）；宿主/他插件撞名 **needs registry context** |
| 5 | tools | `acme_greet_hi` | 无兼容性错误；唯一性 **unknown** |
| 6 | commands | `acme-greet-hi` | 无兼容性错误；唯一性 **unknown** |
| 7 | skills | `greet` | **碰撞建议**（裸短名，且与插件名同串跨面复用）；目录占用 **needs registry context** |
| 8 | skillProviders | `acme-greet-filesystem` | 无兼容性错误；该面在本地材料中的语义 **unknown** |
| 9 | events | `web-search/ready` | **needs registry context**（外来域属主与载荷契约）+ 碰撞建议 |
| 10 | settingsNamespaces | `acme-greet` | 无兼容性错误（语法有本地一手依据）；机制跨版本变更；占用 **unknown** |
| 11 | routes | `/api/plugins/acme-greet/hi`（exact） | **needs registry context**（宿主是否保留该前缀）+ 碰撞建议 |
| — | package.json `private: true` | — | **发布阻断**（非命名判定，见第五节） |

---

## 二、判定框架（四态）与证据分级

### 四态定义（本报告用法）

| 判定 | 含义 | 本报告中的门槛 |
|---|---|---|
| **compatibility error** | 会被宿主/规范拒绝，或几乎必然导致注册/加载失败 | 必须能引用一条本地一手规则，且该名字确定违反它 |
| **collision recommendation** | 合法，但与他人/宿主撞名的概率高，建议改名或加限定 | 有形态或一手事实支撑「可能撞名」，但无「一定撞名」证据 |
| **needs registry context** | 结论取决于外部注册表/索引/他插件声明/目标宿主版本 | 本地无法闭合，且**不猜测** |
| **unknown** | 连形态都无从判断，或该面本身在本地材料中无定义 | 明确标注未确认 |

### 证据分级

- **A 级（本地一手）**：`skills/plugin-upgrade/references/` 下的版本卡与 API 账本。可引用行号。
- **B 级（fixture 自身声明）**：`dsh-plugin.naming.json` 与 `README.md` 的内容。**这是作者的自我声明，不是验证结论。**
- **C 级（缺失）**：注册表状态、宿主路由表、他插件的事件声明、目标宿主版本。**全部未获取。**

本报告的所有结论只由 A 级 + 形态核验推出；B 级仅作为「待验证的主张」列出（见第七节）。

---

## 三、负面能力声明（我做了什么、没做什么、因此不能说什么）

**做了**：读取 3 个 fixture 文件；对 manifest 做机械语法与内部一致性核验（kebab/snake 文法、坐标↔包名↔loaderId↔设置命名空间↔命令↔工具↔skillProvider 的派生关系、路由形态、事件分段）；在 `skills/plugin-upgrade/` 内全文检索命名策略与路由/事件/服务的一手事实；计算 fixture 哈希。

**没做（因此以下结论一律不给）**：

- 未查询 npm / 任何插件索引 → **不能说** `dsh-greet`、`acme/greet`、短名 `greet` 是否已被占用，**不能说**任何名字「全局可用」。
- 未读取 `web-search` 插件的声明 → **不能说** `web-search/ready` 是否是一个已定义、已共享的通道，**不能说**其载荷契约兼容。
- 未启动宿主、未读宿主路由表 → **不能说** `/api/plugins/` 是否被保留，**不能说**该路由可注册。
- 未确认目标 DSH 版本 → **不能说**任何跨版本行为（设置机制、peer 强制、loader id 规则）在当前目标宿主上的实际取值。
- 未找到 `dsh-plugin-naming/v1` 策略正文 → **不能说**任何面「符合规范」，只能说「未发现与本地已知规则冲突」。

**关键自律**：0 个 compatibility error 是「无规范可依 + 无注册表可查」的结果，**不得**被读成「命名健康、可以发布」。

---

## 四、逐面判定

### 1. plugin 坐标 / 包名 —— `acme/greet` · `dsh-greet`

- **形态核验**：`coordinate === namespace + "/" + name` ✓；`packageName === "dsh-" + name` ✓；`package.json name === plugin.packageName`（`dsh-greet`）✓。三处完全自洽。
- **判定**：**无兼容性错误**；`dsh-greet` 在 npm / 插件索引上的占用状态 = **unknown**（未查询）。
- **注意**：坐标 `acme/greet` 走「命名空间/短名」两段式，而包名 `dsh-greet` 走「`dsh-` + 短名」式，**丢掉了 `acme` 段**。这不是错误，但意味着「包名」与「坐标」不是同一字符串的不同编码；若索引按包名去重、按坐标寻址，两条路径的占用必须分别确认。
- **附带**：`skills/plugin-upgrade/SKILL.md:49` 明确「GitHub owner/repo 与 registry scope/package 是独立坐标，不能互相推导」——所以即使作者拥有 GitHub 上的 `acme`，也推不出 `dsh-greet` 可用。

### 2. pluginNames（官方短名）—— `greet`

- **形态核验**：单段 kebab 合法（`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`）✓。
- **判定**：**needs registry context**（短名 `greet` 是否已被他人占用，只能查索引）+ **碰撞建议**。
- **理由**：短名是用户可见的寻址键（本会话的技能目录即以裸 kebab 名寻址，例如 `diagnose-windows-sandbox-acl`）。`greet` 是英语极常用词，撞名概率高。若策略允许「限定名 + 短名别名」双轨，建议至少把 `acme-greet` 作为默认展示名。
- **边界**：**不能**说 `greet` 是「官方保留短名」因而合法——本地没有任何材料定义「官方短名」制度。

### 3. loaderIds —— `acme-greet`

- **形态核验**：`loaderId === namespace + "-" + name` ✓，与坐标一致。
- **判定**：**无兼容性错误**；唯一性 = **needs registry context**；与 `package.json name` 不一致 → **碰撞建议（优先级最高的一处一致性风险）**。
- **一手依据（A 级）**：
  - `references/troubleshooting.md:8`：启动断言 `loaded without registering "<id>"` 的根因是「client bundle 的 registration id（`__ModuleLoader__.load` id / tsdown banner `PLUGIN_ID`）≠ `package.json` `name`，或组装行的 `name` 不是裸包名」。
  - `references/troubleshooting.md:18`：`duplicate loader entry id: <id>` 是 **Cordis 致命错误（非静默覆盖）**，重复 insert 直接让宿主启动崩溃。
- **理由**：本插件声明的 loaderId 是 `acme-greet`，而包名是 `dsh-greet`，两者**不一致**。在 0.1.2 走廊上这条不一致正是上述两类故障的根因形态。目标宿主版本未知，因此**不能**判定为兼容性错误；但这是本次审查中**唯一有 A 级一手故障记录支撑的具体风险点**，建议发布前二选一：(a) 让 loaderId 与 `package.json name` 对齐；(b) 明确目标宿主允许坐标派生 id，并在真机冷启动一次验证。

### 4. services —— `search`

- **形态核验**：单段 kebab 合法 ✓；**无任何命名空间限定**（`search` 不含 `-`/`_`/`:`/`.`）。
- **判定**：**碰撞建议**（**不是**兼容性错误）；是否与宿主或他插件服务名撞名 = **needs registry context**。
- **理由**：Cordis 的服务注册表是单一全局键空间，两个插件提供同一个服务键不会双双生效。`search` 是高度通用词，撞名概率显著高于 `acme-greet-search` 这类限定形。
- **自律边界**：本地材料中**没有**「服务名必须加前缀」的规则条文，也**没有**宿主服务名清单。所以这是建议，不是错误；**不能**声称 `search` 已被宿主占用，也**不能**声称它空着。

### 5. tools —— `acme_greet_hi`

- **形态核验**：snake_case 合法 ✓；`tool === command.replace("-","_")` ✓，与命令面严格对应。
- **判定**：**无兼容性错误**；全局唯一性 = **unknown**。
- **形态依据**：本运行时可见的工具名即 `send_message` / `read_image` / `run_code` 一类 snake_case，`acme_greet_hi` 与之同构。
- **附带风险（非命名判定）**：`references/troubleshooting.md:22` 记录「全局工具层的工具会被**每一个** agent 继承，与 preset 无关」。`acme_greet_hi` 一旦落在全局层，影响面是所有 preset 的模型可见工具表。这与命名对错无关，但决定这个名字的「爆炸半径」，建议随发布一起确认注册平面。

### 6. commands —— `acme-greet-hi`

- **形态核验**：kebab 合法 ✓；`command === loaderId + "-hi"` ✓。
- **判定**：**无兼容性错误**；唯一性 = **unknown**（未查询）。

### 7. skills —— `greet`

- **形态核验**：单段 kebab 合法 ✓；**裸名，无命名空间限定**，且与 `plugin.name` / `pluginNames[0]` **字符串完全相同**（跨面复用检测：`"greet" → pluginNames, skills`）。
- **判定**：**碰撞建议**；技能目录中的占用 = **needs registry context**。
- **理由**：(a) 技能目录以裸名寻址，`greet` 这类极短通用名撞名概率高；(b) 同一个字符串同时占据「插件短名」和「技能名」两个全局面，宿主是否允许这种同串跨面复用，本地无据可查 → 该子问题记为 **unknown**。
- **建议**：改为 `acme-greet` 或 `acme-greet-greet` 之类限定形，除非策略显式鼓励「插件名即默认技能名」。

### 8. skillProviders —— `acme-greet-filesystem`

- **形态核验**：kebab 合法 ✓；`skillProvider === loaderId + "-filesystem"` ✓。
- **判定**：**无兼容性错误**；该面本身在本地材料中的语义 = **unknown**。
- **理由**：`skillProviders` 这个面名在 `skills/plugin-upgrade/` 内没有任何定义或使用记录（本地只出现 `settingsNamespace` / 服务 / 事件 / 路由 / 工具 / 技能等面）。因此**不能**判断它是否走全局键空间、是否要求特定后缀、是否与宿主 provider 类型冲突。仅能确认字符串形态合法且与插件坐标自洽。
- **观察**：`-filesystem` 后缀暗示一种能力类型；若宿主按「类型后缀」归类 provider，`acme-greet-filesystem` 可能与任何 `*-filesystem` 归为一类——这是猜测，标 **unknown**。

### 9. events —— `web-search/ready`

- **形态核验**：两段 `domain/event`，两段均 kebab 合法 ✓。
- **判定**：**needs registry context**（主判定）+ **碰撞建议**。
- **一手依据（A 级）**：本地可见的事件域全部是**属主域**——`agent/session-start`、`agent/created`（`references/v0.1.6-alpha.1.md:41,90`）、`deliverables/presented`、`subagent/catalog`（`references/v0.1.5-alpha.2.md:203-206`）、`goal/activation-changed`、`image/offload`。即 `域/事件` 的第一段标识**属主**，不是自由文本。
- **理由**：本插件是 `acme/greet`，却声明 `web-search/ready`——**第一段是外来域**（交叉核验：`event domain !== plugin.namespace`）。两种解释，本地无法分辨：
  1. **有意共享通道**：作者在为 `web-search` 这个（他方或己方另一个）插件贡献/消费一个 `ready` 事件。此时必须核对 `web-search` 是否真的定义了 `ready`、载荷是否兼容——**未核对，标 unknown**。
  2. **无意占用他人命名空间**：若 `web-search` 另有属主，这是在自己的事件流里写入别人域下的事件名，属于命名空间挤占。
- **额外风险（A 级）**：`references/v0.1.5-alpha.2.md:203-206` 记录「非可忽略事件（non-ignorable）」机制——遇到未知且未标可忽略的事件，宿主会**拒绝**而不是跳过。若 `web-search/ready` 被当作非可忽略事件写入会话日志，而读取方宿主不认识它，日志可能不可读。目标宿主版本未知，故仅记为**待验证风险**，不升级为错误。
- **建议**：除非确实要与 `web-search` 互通，改为 `acme-greet/ready`。

### 10. settingsNamespaces —— `acme-greet`

- **形态核验**：**这是唯一有本地一手语法规则的面**。`references/api-migration-0.1.2-alpha.2.md:345`：「Namespaces start with a lowercase letter and contain only lowercase letters, digits, and `-` after that; string literals are checked at the TypeScript layer, dynamic strings at runtime.」`acme-greet` 完全符合 ✓。且 `settingsNamespace === loaderId` ✓，与插件坐标自洽。
- **判定**：**无兼容性错误**（语法层面有 A 级依据）；占用 = **unknown**。
- **版本相关风险（A 级，非命名判定）**：`references/v0.1.7-alpha.1.md:27,62-70`：0.1.7-alpha.1 起设置移入当前 Profile 的插件配置，旧 `settings.yaml` 只尝试导入一次，且「不要假定导入覆盖了插件专属命名空间」。若目标宿主 ≥ 0.1.7-alpha.1，`acme-greet` 命名空间的**存储位置与读取路径**都会变，需要单独验证，与命名本身对错无关。

### 11. routes —— `/api/plugins/acme-greet/hi`（`kind: "exact"`）

- **形态核验**：绝对路径（以 `/` 开头）✓；路径内嵌 loaderId ✓；`kind` 取值 `exact`。
- **判定**：**needs registry context**（宿主路由表是否保留 `/api/plugins/`）+ **碰撞建议**。
- **一手依据（A 级）**：本地可见的宿主 API 路由只有 `/api/file`（`references/v0.1.5-alpha.1.md:410`）、`/api/session.export`（`references/api-migration-0.1.2-alpha.2.md:158`）、`/api/agentPreset.list`（`references/pre-flight.md:59` / `ghost-host-check.mjs:133`）。**`/api/plugins/` 在本地材料中零命中**。
- **理由**：宿主确实占用 `/api/*` 命名空间，但 `/api/plugins/` 是否保留给插件管理 API，本地无从确认。若保留，一个 `exact` 路由可能与之冲突或被拒；若不保留，这个路径又与宿主路由风格同构，将来宿主新增 `/api/plugins/...` 时**后到者冲突**。两种方向都指向同一建议：换一个不可能与宿主同构的前缀（例如 `/api/acme-greet/v1/hi`）。
- **附带**：`exact` 只声明了一条路由；若后续加子路径需新增条目（架构观察，非判定）。

---

## 五、与命名无关、但同样阻断「发布」的发现

| 发现 | 依据 | 判定 |
|---|---|---|
| `package.json` 含 `"private": true` | fixture 自身 | **发布阻断**：`npm publish` 对 private 包直接拒绝。发布前必须移除该字段或改用非 npm 通道。fixture README 自称这是「仓库的测试物料纪律，不属于本任务」——即便如此，从「我要发布」的目标看它仍然是一道现实闸门。（npm 的该行为未在本地复跑，属已知文档行为，未经本次执行验证。） |
| 无 `dependencies` / `peerDependencies` / `engines` | fixture 自身 | **unknown**：无法评估 DSH cohort 走廊。A 级参考：`references/v0.1.7-rc.1.md:52`——「没有 DSH peer 的插件永不被拒绝」，即这不是错误，但意味着**没有安装期兼容闸门**，所有不兼容都会推迟到运行时暴露。 |
| 无 `dsh-plugin.json` | fixture 自身 | **unknown**：`skills/plugin-upgrade/SKILL.md` 的文件归属清单把 `dsh-plugin.json` 列为「社区标准 manifest（若采用）」。未采用不是错误；`dsh-plugin.naming.json` 是否被宿主读取，本地无据 → **unknown**。 |

---

## 六、必须在线/注册表上下文才能关闭的问题清单

按关闭优先级排列（**本报告一律未执行**）：

1. `dsh-greet` 与坐标 `acme/greet` 在 npm / 默认插件索引上的占用情况。
2. 短名 `greet`、loaderId `acme-greet`、服务名 `search`、技能名 `greet`、命令 `acme-greet-hi`、工具 `acme_greet_hi` 在各全局键空间中的占用情况（loaderId 重复在 Cordis 是致命错误，`troubleshooting.md:18`）。
3. `web-search` 是否为已发布插件；若是，它是否定义 `ready` 事件及其载荷契约。
4. 宿主路由表中 `/api/plugins/` 是否为保留前缀。
5. 目标 DSH 宿主版本（决定 loaderId 规则、设置机制、peer 强制三件事的实际取值）。
6. `dsh-plugin-naming/v1` 策略正文与 `dsh-plugin.naming.json` 的消费方（本地缺失，需从规范仓库获取）。

---

## 七、对 fixture 自带 README 四项声明的核验状态

README 是本任务的 B 级材料（作者自述），逐条核对如下——**我同意其结论方向，但不能替它升级为已验证事实**：

| README 主张 | 我的核验状态 |
|---|---|
| 「官方短名 `greet` 有效（前缀只是碰撞建议）」 | **部分未确认**：短名 `greet` 未违反任何我能在本地找到的规则 ✓；但「官方短名制度」本身在本地无定义，「有效」二字 **unknown**。 |
| 「未加前缀的服务 `search` 是 warning 不是 error」 | **方向同意，措辞未确认**：本地无「服务必须加前缀」规则，故不是 error ✓；但「宿主会发 warning」未经确认 → 我记的是**碰撞建议**，不是「已确认的 warning」。 |
| 「事件 `web-search/ready` 是共享通道（informational）」 | **未确认**：`web-search` 域属谁、`ready` 是否已定义、载荷是否兼容，全部 **needs registry context**。我不把它降级为纯 informational。 |
| 「未查询的注册表是 unknown」 | **完全同意**，这正是本报告第三节的立场。 |

---

## 八、给作者的下一步（仅建议，本次未执行）

1. 先关第五节：删 `private: true`（或改走非 npm 发布通道），并声明目标 DSH 版本的 peer 范围。
2. 再关第三节/第六节：查索引占用，确认 `web-search/ready` 的属主与契约，确认 `/api/plugins/` 是否保留。
3. 命名侧三个低成本改动：服务 `search` → 限定形；技能 `greet` → 限定形；事件 `web-search/ready` → `acme-greet/ready`（除非确需互通）。
4. loaderId `acme-greet` 与包名 `dsh-greet` 的不一致，按 `troubleshooting.md:8/18` 的两类故障形态做一次真机冷启动验证后再发布。

---

## 附录 · 证据索引（均为 `E:\deepseek-harness\dsh-plugin-upgrade-skill\skills\plugin-upgrade\` 下相对路径）

| 引用 | 内容 |
|---|---|
| `references/api-migration-0.1.2-alpha.2.md:345` | 设置命名空间文法（小写字母开头，其后仅小写字母/数字/`-`） |
| `references/troubleshooting.md:8` | registration id ≠ `package.json name` → `loaded without registering "<id>"` |
| `references/troubleshooting.md:18` | `duplicate loader entry id` 为 Cordis 致命错误（非静默覆盖） |
| `references/troubleshooting.md:22` | 全局工具层工具被每个 agent 继承（爆炸半径） |
| `references/v0.1.5-alpha.1.md:410` | 宿主路由 `/api/file` |
| `references/api-migration-0.1.2-alpha.2.md:158` | 宿主路由 `/api/session.export` |
| `references/pre-flight.md:59` / `scripts/ghost-host-check.mjs:133` | 宿主路由 `/api/agentPreset.list` |
| `references/v0.1.6-alpha.1.md:41,90` | 事件域 `agent/*`（属主域） |
| `references/v0.1.5-alpha.2.md:203-206` | 非可忽略事件机制（未知事件导致拒绝） |
| `references/v0.1.7-alpha.1.md:27,62-70` | 设置移入 Profile 插件配置；`settings.yaml` 仅一次性导入 |
| `references/v0.1.7-rc.1.md:52` | 无 DSH peer 的插件永不被拒绝 |
| `SKILL.md:49` | GitHub owner/repo 与 registry scope/package 是独立坐标 |

**未引用**：`dsh-plugin-naming/v1` 策略正文、任何注册表/索引数据、任何宿主路由表——本地均不可得，故全部结论保持 unknown / needs registry context。
