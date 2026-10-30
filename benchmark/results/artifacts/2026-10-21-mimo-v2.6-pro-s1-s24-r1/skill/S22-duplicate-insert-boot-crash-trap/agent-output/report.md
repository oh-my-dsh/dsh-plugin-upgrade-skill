# S22 · The Duplicate Insert That Crashed the Boot — 只读诊断报告

> 范围：Mode A（只读检查/诊断）。证据包 `fixture/` 逐字节未改动；未执行任何迁移、安装或 `dsh web` 启动。
> 参考卡片只记 ID 与要点（plugin-upgrade skill `references/`）。

## 0. 结论速览

维护者在 profile 的 `cordis.patch.yml` 里手工 `insert` 了 `workspace-files` 行，而该行
web-app bundle 已经提供；两个同 id 的 loader 条目在 Cordis 组合层（`cordis:include` →
`EntryGroup.update`）撞键，被当作**致命组合错误**整树拒绝，`dsh web` 启动即崩。
修法只有一处：删除 profile patch 里那段手工 insert 块。插件代码零过错，插件侧任何改动都救不了这次启动。

## 1. Root cause — 哪两条声明相撞、哪一层检出、为何整树拒绝

**相撞的两条声明（同一 id、同一包名）：**

| 侧 | 文件 | 证据行 | 内容 |
|---|---|---|---|
| A（手工，profile 层） | `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` | profile-patch-excerpt.txt L16-L20 | `- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` |
| B（出厂，bundle 层） | 安装树 `packages/bundle/web-app/cordis.patch.yml` L110-111 | web-app-patch-excerpt.txt L4-L8 | `- insert: - id: workspace-files / name: '@deepseek-ai/dsh-api-workspace-files'` |

两条都是 `insert`（新建条目）操作，声明了同一个 loader entry id `workspace-files`。

**检出层：Cordis 组合/装载层（composition/loader），不是插件运行层。**
栈（boot-crash-log.txt L8-L15）：`dsh web` → `runCli` → `runProfile` → `dsh-app-boot` 的
`boot()` → 应用 loader entry include（`cordis:include`）的 `Include._apply` →
`@deepseek-ai/cordis-plugin-loader` 的 `EntryGroup.update` 抛
`TypeError: duplicate loader entry id: workspace-files`。两个 patch 文件被合并进**同一个按
id 键控的 EntryGroup** 时撞键——此时任何插件代码尚未执行，纯组合期失败。

**为什么整树拒绝，而不是"后写的行覆盖先写的行"：**

1. **`insert` 的语义是"新建条目"，不是"覆盖同 id 条目"。** 按 id 覆盖是另一种显式操作
   （同 id 行 + `config` 整体替换 / `disabled` 开关；API-08 第 5 点：匹配已有 id 时 `config`
   是整体替换而非深合并，后层覆盖前层）。同 id 出现两个 insert，EntryGroup 的键不再唯一，
   条目身份、服务注入、销毁顺序全部歧义。
2. **Cordis 把重复 insert 当作致命组合错误（fail-closed），不是静默合并**
   （troubleshooting 对应症状行：「重启后宿主启动即崩：duplicate loader entry id」）。若静默取
   后行，profile 里手工快照的 `name` 会遮蔽 bundle 的权威行，随下次升级悄悄漂移，而且没人
   知道哪一层的行被丢弃了。
3. **该 0.1.5 期 `EntryGroup.update` 在重复 id 处直接 throw**（同族 loader 的旧行为带整组
   回滚语义，报错文本就是 `duplicate loader entry id: …`），异常沿 `Include._apply → boot →
   runProfile → runCli` 冒出、进程退出。宁可拒绝整棵插件树，也不产出缺行/重行的半成品树。

## 2. Layering rules — profile patch 对 bundle 已提供插件的三种操作

组合优先级（低 → 高，API-08）：bundle patches（按 profile manifest `dsh.profile.bundles` 顺序）
→ `<profile>/cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → CLI `--patch` 覆盖层。

| profile patch 操作（针对 bundle 已提供插件） | 语义 | 判定 |
|---|---|---|
| 按 id 改 config：同 id 行 + `config` 整体替换，或 `disabled` 开关 | 显式覆盖既有条目，后层胜 | **安全**（设计内操作） |
| `insert` 一个**任何 bundle 都未提供**的 id | 新建条目 | **安全**（外部插件标准做法） |
| `insert` 一个 **bundle 已提供**的 id | 重复新建条目 | **致命**：`duplicate loader entry id`，整树拒绝 |

**维护者的动作属于第三种**（fatal）。证据行：web-app-patch-excerpt.txt L6-L8（bundle 已有
`workspace-files` 行，安装树 L110-111）与 profile-patch-excerpt.txt L18-L20（profile 又
`insert` 同一 id）在 EntryGroup 撞键。

同包里的正面对照也一并佐证分层规则：
- profile-patch-excerpt.txt L5-L7（`dsh-file-trace`）、L12-L14（`dsh-profiles`）是 bundle 未提供
  id 的合法 insert（第二种情形）；
- web-app-patch-excerpt.txt L13-L18（`session-controller` / `settings-controller`）同为 bundle
  提供且从未被手工补插——正确模式（bundle 行归 bundle，profile 不重复）。

## 3. Fix — 改什么、改哪个文件

**只改一个文件：`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`** —— 删除末尾手工插入的
`workspace-files` 块（profile-patch-excerpt.txt L16-L20，连同那句错误注释
「如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏」）。
其余行（`dsh-file-trace`、`dsh-profiles` 等外部插件 insert）不动。然后重启 `dsh web` 并硬刷新
浏览器。若确要保留某种"覆盖"，只能写成按 id 的 `config`/`disabled` 覆盖行，不能 insert 同 id。

**原始故障（文件资源服务不可用）也不是靠 insert 行修的。** 按 troubleshooting 对应症状行与
DSH-0.1.5-A1-20（discussion #5999）：原地 npm 全局升级后首次启动可能出现"宿主组合/产物缺口"——
served client combo 漏掉新 bundle 模块、roster 与 combo 不一致（归因探针：旧模块 200 + 新模块
404 即坐实为宿主产物缺口而非插件问题）；一次宿主重启即可自愈，仍不行按精确版本回退并上报上游。
判据先看 `dsh --profile web --dump-config`：`workspace-files` 行已在组合树里（bundle 层提供）
⇒ "资源服务不可用"与"缺 insert 行"无关。

**插件自身代码无过错，任何插件侧改动都无法解决这次启动失败：**
`@deepseek-ai/dsh-api-workspace-files` 是宿主侧、由 web-app bundle 提供的 loader 行；崩溃发生在
插件代码执行**之前**的 `EntryGroup.update`，插件源码根本不会被走到。能恢复启动的唯一改动是
删掉 profile patch 的重复 insert（或改成按 id 的覆盖形态）。

## 4. Prevention — 作者/维护者侧 + 宿主侧

**手工加行之前，维护者应看的（installed bundle 侧）：**

1. 先读**已安装 bundle** 的 `cordis.patch.yml`（web-app / base 等，安装树内），按 id 搜索目标
   id 是否已有行；再用 `dsh --profile <name> --dump-config` 看组合结果里该 id 是否已存在、
   来自哪一层（API-08 的验证法：先看全组合结果，再决定动哪层）。
2. 查升级走廊卡片 / release notes：`workspace-files` 等是 0.1.5 系列新增、随 web-app bundle 自动
   提供（DSH-0.1.5-A1-16 明列 `dsh-web-app` 的五行 loader 行含 `workspace-files`）；升级 profile
   **无需**手动补插。
3. 语义自查：我要做的是"覆盖已有行"还是"新增条目"？前者写同 id 的 `config`/`disabled` 行，
   后者才用 `insert`，且 insert 的 id 必须是任何 bundle 都未提供的（如 `dsh-file-trace`、
   `dsh-profiles`）。
4. 吸取本案错误注释的教训：「如果 bundle 已含此行则冗余；保留以防遗漏」的保险心态正是陷阱——
   重复 insert 不是"无害冗余"而是致命错误。想保险，写 override 形态，别写 insert。

**宿主侧可做什么让这类失败可行动（whom to blame / what to delete）：**

- 现报错只有 `duplicate loader entry id: workspace-files` + loader 栈。应打印：冲突 id、
  **两处声明各自的文件路径与层归属**（如 `.../bundle/web-app/cordis.patch.yml` L110-111（bundle 层）
  与 `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` L18（profile 手工层））、哪层是权威行
  （bundle），以及**删哪里**（"delete the `workspace-files` insert block from <profile patch path>"）。
- 更进一步：在 `EntryGroup.update` 之前做 duplicate-id 预检（`--dump-config` 式 lint），把裸
  栈崩溃变成带文件归属与修复指引的启动诊断；后续 plugin-manager 的 duplicate-id 诊断思路即是
  同一方向（把"重复 id"变成可行动诊断）。
- 上报口径：这是组合层错误，归因标签应是 profile-config（手工 patch 行），不是 plugin-code，
  也不必给 `@deepseek-ai/dsh-api-workspace-files` 开 issue。

## 5. 证据索引

- `fixture/boot-crash-log.txt` L8-L15：报错与栈（`EntryGroup.update` / `Include._apply` / `boot` /
  `runProfile` / `runCli`）；L19-L22：前置上下文（0.1.2/0.1.3 profile 原地升级 → 资源读失败 →
  手工 insert → 崩溃）。
- `fixture/profile-patch-excerpt.txt` L16-L20：手工 `workspace-files` insert 块与错误"冗余"注释。
- `fixture/web-app-patch-excerpt.txt` L4-L8：bundle 已提供同 id 行（安装树 L110-111）。
- 引用卡片（只记 ID/要点）：
  - **DSH-0.1.5-A1-16**：`dsh-web-app` 的 `cordis.patch.yml` 新增五行 loader 行（含
    `workspace-files`）——bundle 自动提供，升级 profile 无需补插。
  - **DSH-0.1.5-A1-20**：原地 npm 升级后 served combo 漏新 bundle 模块（旧 200/新 404 归因探针），
    宿主重启自愈；上游 discussion #5999。
  - **API-08**：`cordis.patch.yml` 是组合层而非源码 patch；匹配已有 id 的行 `config` 整体替换、
    后层覆盖前层；层优先级 bundle → profile → $DSH_HOME → --patch；验证走 `--dump-config`。
  - **troubleshooting 症状行**「重启后宿主启动即崩：`duplicate loader entry id: <id>`」：profile
    手工 insert bundle 已提供 id ⇒ Cordis 判致命（非静默覆盖）；删重复 insert 块即恢复；插件
    不可用时根因是 compose/artifact 缺口而非缺 insert（discussion #5999）。Cordis 组合规则，
    无对应版本卡，跨版本通用。

## 6. skill 报告结构补充

- **pre-existing**：not collected（只读诊断，无基线运行；题面禁执行迁移/安装/启动）。
- **Completed**：只读取证（crash log + 两份 patch 摘要 + 卡片交叉核对）、根因/分层/修法/预防四段
  结论、本报告与工具转录落盘。
- **Skipped**：未执行 `dsh web`/任何安装或迁移（题面禁令）；未修改 `fixture/`（只读密封）；
  未访问白名单外路径。
- **Pending/residual risk**：未在真实宿主复跑修复（容器只读）；"EntryGroup.update 重复 id 直接
  throw 并回滚"依据报错实证 + loader 同族卡片文字，未对照 0.1.5-alpha.2 本机源码逐行核验。
- **Rollback**：fixture 零写入；本目录产物（report/tool-transcript/transcript-manifest）删除即回滚。
- **Recommendations**：宿主补 duplicate-id 预检与带文件归属的启动诊断（见 §4）；profile patch
  维护约定写进团队文档：insert 只用于 bundle 未提供的 id，覆盖一律走同 id config/disabled。

## run-stats

- toolcalls 总数：35（顶层 14 = run_code×11 + todo_write×2（其中 1 次直调失败）+ send_message×1
  实为 run_code 内嵌；嵌套 21 = read×8 + grep×3 + pwsh×2 + write×3 + edit×3 +
  todo_write×1 + send_message×1；逐条明细见 agent-output/tool-transcript.txt）
- token 用量：n/a（本会话未暴露计量）
- 完成时间：2026-10-21T16:04:17.8398036+08:00（Asia/Shanghai）
