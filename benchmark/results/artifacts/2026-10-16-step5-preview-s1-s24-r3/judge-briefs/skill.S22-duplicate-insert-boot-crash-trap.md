# JUDGE BRIEF · skill.S22-duplicate-insert-boot-crash-trap

## Criteria (sealed rubric)
- [duplicate-loader-attribution] (20pt) Compare profile-patch-excerpt.txt and web-app-patch-excerpt.txt: both insert id workspace-files, and boot-crash-log.txt locates rejection at Cordis EntryGroup.update during include/compose. Duplicate insertion is fatal to this boot rather than silent merge/last-write-wins. Reject the profile comment’s assertion that keeping the duplicate is harmless redundancy.
- [three-layering-cases] (20pt) Distinguish all three requested operations: config override by existing id is allowed; inserting a genuinely new, otherwise unprovided id is allowed; inserting an already bundle-provided id is fatal. Classify the maintainer’s row as the third case and ground it in the two excerpts. Partial credit for a substantively correct but incomplete comparison.
- [minimal-profile-fix] (20pt) Remove only the redundant workspace-files insert block from the profile cordis.patch.yml, preserving the bundle’s original service and unrelated external plugins/config. If configuration needs adjustment, use an override rather than a second insertion. Renaming the extra instance, deleting the bundle’s service, or adding another insert is not the minimal correct fix.
- [plugin-and-failure-boundary] (20pt) Explain that this boot crash is a profile composition error before plugin execution, so changing the external plugin code cannot resolve the duplicate id. Removing the duplicate restores the possibility of boot; it does not establish that the earlier resource-metadata read failure has been cured. Keep that separate problem subject to verification.
- [author-and-host-prevention] (20pt) Before inserting, inspect/grep the installed web-app bundle’s cordis.patch.yml (and other composing bundles) for the id and distinguish override from insert. Propose a host diagnostic naming workspace-files and both declaration origins, pointing to removal of the redundant profile block. “Check for duplicates” alone without where/how or an actionable host message is incomplete.

## Caps (score ceilings; judge returns each with triggered true/false)
- CAP [retain-or-add-duplicate] ceiling=20 The final advice keeps/adds the duplicate as harmless redundancy, asserts duplicate inserts silently merge, or tries to cure this boot failure by editing the external plugin instead of correcting the profile composition. Apply only to affirmative final advice or conclusions. Quoted, hypothetical or explicitly rejected bad examples do not trigger the cap; read the whole report.

## Candidate report(s)
#### FILE: S22-duplicate-insert-boot-crash-trap/report.md

# S22 · The Duplicate Insert That Crashed the Boot — 诊断报告

**结论一句话**：这不是插件代码缺陷，也不是「profile 缺少 workspace-files 行」——web-app bundle 早已提供该行；崩溃是维护者在 profile 的 `cordis.patch.yml` 里手动 `insert` 了一个 bundle 层已提供的 loader id（`workspace-files`），Cordis 在 loader entry include 应用阶段把重复 insert 判为致命错误，直接中止整个 boot。修复 = 删掉 profile patch 中那条手动 insert 块（含其错误注释），一行不加、一行不改插件代码。

---

## 1. Root cause（根因）

**要点**：碰撞双方是「profile patch 中手写的 `- insert: id: workspace-files`」与「web-app bundle patch 中已有的同一 id 行」；碰撞在 Cordis 的 **loader entry include（`cordis:include`）应用阶段**（plugin tree 组合期）被检出，早于任何插件代码执行。

### 1.1 哪两个声明碰撞

| 层 | 文件 | 声明 | 证据行 |
|---|---|---|---|
| Profile 层（维护者手写） | `C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml` | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` | `profile-patch-excerpt.txt` L16–L20（连同 L17 的注释「如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏」） |
| Bundle 层（npm 安装树自带） | `packages/bundle/web-app/cordis.patch.yml`（安装树内 L110–111） | `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'` | `web-app-patch-excerpt.txt` L4–L8；相邻的 `session-controller`（L13–15）与 `settings-controller`（L16–18）同为 bundle 提供、从未被手工插进 profile patch——反证手工插 bundle 行是反常操作 |

两个声明的 `id` 与 `name` 完全一致，指向同一个包 `@deepseek-ai/dsh-api-workspace-files`——这不是版本冲突，是**同一 id 被两层各声明一次**。

### 1.2 在哪一层被检出

崩溃栈（`boot-crash-log.txt` L8–L16）给出精确层位：

- `dsh-app-boot` 的 `boot()`（L1534）→ `Include._apply`（L240）→ `cordis-plugin-loader` 的 `EntryGroup.update`（L91）抛出 `duplicate loader entry id: workspace-files`；
- 即：**loader entry include 的应用阶段**（把 bundle patch 行并入 profile 组合树时），而非插件加载/激活阶段。整棵 plugin tree 加载失败，`runProfile` → `runCli` 全线中止，`dsh web` 立即退出（Node v24.14.1）。

### 1.3 为什么拒绝整个 boot 而不是「接受后一行」

Cordis 将 loader entry id 的唯一性视为组合层硬不变量：重复 insert 是**致命错误，不做静默覆盖**（skill `references/troubleshooting.md` 的 `duplicate loader entry id` 症状行，根因栏原话：「Cordis 把重复 insert 视为致命错误（非静默覆盖）」，并指向 discussion #5999）。若改为「后者胜出」，同 id 两行在 config / 依赖 / 注入面上的歧义会被静默吞掉——组合结果不可预测，且真实缺口（compose/artifact 缺失）会被一行手工 insert 伪装成「已修复」。因此 loader 选择 fail-closed：在组合期直接抛错，把矛盾暴露给写 patch 的人。这也解释了为什么该错误**不可能由插件侧代码规避**——它发生在任何插件代码运行之前。

---

## 2. Layering rules（profile patch 作用于 bundle 提供插件时的安全/致命操作）

**要点**：三种操作里两种安全、一种致命；维护者做的正是致命的那种，证据就是 bundle excerpt 里已经存在的同一 id 行。

| 操作 | 安全性 | 说明 |
|---|---|---|
| ① 按 id 改 bundle 已提供插件的 **config** | 安全 | profile 层本来就可对下层已提供的 id 做配置覆盖，不新增 entry，无 id 冲突 |
| ② 为 **bundle 不提供** 的 id 新增 insert 行 | 安全 | 这正是 profile insert 的正当用途——`profile-patch-excerpt.txt` L5–7 的 `dsh-file-trace`、L12–14 的 `@lhh010/dsh-profiles`（六个外部 client 插件）都是此类，bundle 不提供这些 id |
| ③ 为 **bundle 已提供** 的 id 新增 insert 行 | **致命** | 与 bundle 行撞 id → `EntryGroup.update` 抛 `duplicate loader entry id` → 整个 boot 中止（即本案） |

**维护者的操作属于 ③**。证据行：`web-app-patch-excerpt.txt` L6–8（安装树 `packages/bundle/web-app/cordis.patch.yml` L110–111 已有 `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`）对照 `profile-patch-excerpt.txt` L18–20（profile 里手工插入同一 id/name）。维护者自己的注释（L17「如果 web-app bundle 已包含此行则此条为冗余」）已承认这种可能性，却仍选择「保留以确保不遗漏」——把不确定性手动固化成致命行。

背景卡：`workspace-files` 是 0.1.5 系列新增行——DSH-0.1.5-A1-16 明确记载 web-app bundle 的 `cordis.patch.yml` **新增五个 loader 行**（`workspace-files`、`resources`、`ui-sidebar-right`、`ui-sidebar-textpreview`、`ui-sidebar-files`）；DSH-0.1.5-A1-11 记载 `workspace-files` 提供 `workspaceFiles` Remote 文件面（右侧 Sidebar 文档预览的数据来源）。升级到 0.1.5-alpha.2 后这些行**由 bundle 自动提供**，profile 侧无需、也不应补插（troubleshooting 症状行原话：「0.1.5 系列新增的 `workspace-files` / `ui-sidebar-*` 等已由 web-app bundle 自动提供，升级 profile 无需手动补插」）。

---

## 3. Fix（修复）

**要点**：唯一需要的改动是删除 profile patch 中手写的 `workspace-files` insert 块；插件代码无过错，也不存在任何能解决 boot 失败的插件侧改法。

### 3.1 改哪个文件、改什么

- **文件**：`C:\Users\lhh\.dsh\profiles\web\cordis.patch.yml`（仅此一个文件；**不要**动 npm 安装树里的 bundle patch）。
- **改动**：删除 `profile-patch-excerpt.txt` L16–L20 的整块——两行注释（含错误的「冗余」自注）加 `- insert:` / `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`。
- **保留**：L5–14 的外部插件 insert（`dsh-file-trace`、`dsh-profiles` 等）与其余既有内容原样不动。
- **不做**：不改 bundle、不装包、不给该行加 `disabled: true` 之类的补丁式绕过（仍留重复 id，依旧致命）。
- **验证**：删除后重启 `dsh web` 应正常启动；右侧 Sidebar 文档 tab 的 `workspaceFiles` 服务由 bundle 行提供（DSH-0.1.5-A1-11/A1-16），无需 profile 侧任何配合。

### 3.2 插件代码是否有过错

**没有。** `@deepseek-ai/dsh-api-workspace-files` 是宿主 bundle 包，其声明本就正确且已被 bundle 组合；崩溃发生在组合期（`EntryGroup.update`），**任何插件代码都还没开始运行**。因此：

- **不存在能解决 boot 失败的插件侧改法**——插件作者改什么都不能让 loader 接受重复 id；
- 若删除重复行后 `workspaceFiles` 服务**仍然**不可用，那也不是插件代码问题，而是 compose/artifact 缺口（troubleshooting 症状行：「如插件确实不可用，根因是 compose/artifact 缺口而非缺少 insert」）。对本案这种「0.1.2/0.1.3 profile 被 npm 原地升级到 0.1.5-alpha.2」的场景，最可能的缺口是 **DSH-0.1.5-A1-20**（real-host 验证）：原地升级后首个 boot 提供的 client combo 遗漏新增 bundle 模块（boot roster 列了、npm 树里产物在、同 rev 下新模块 404 旧模块 200），表现为 `failed to import loader entry` / 侧栏 tab 不注册；**处置是先把宿主完整重启一次**（实测自愈），重启不愈再按 discussion #5999 的取证流程（同 rev 取一新一旧模块对比 200/404）上报，或回退全局包到上一已验证版本——**而不是手工插行**。

---

## 4. Prevention（预防）

**要点**：作者侧动手前先读安装树里 bundle 的组合事实；宿主侧应把这条错误从「只说撞了谁」升级成「点名文件、点名删除物、分清 blame」。

### 4.1 维护者（profile 作者）侧

1. **先看安装树再动手**：在 `node_modules/@deepseek-ai/dsh`（或 bundle 包 `packages/bundle/web-app/`）里打开该 bundle 的 `cordis.patch.yml`，确认目标 id（`workspace-files` 一类 0.1.5 新增行）是否已被提供——本案证据就是 `web-app-patch-excerpt.txt` L4–8（安装树 L110–111）。
2. **用组合事实而非猜测验证**：通过宿主 dump/解析出的组合视图（如 `dsh --profile web --dump-config`）确认目标 id 已在组合树中；skill 的启用性解析验证层同样要求「目标 profile 组合指向预期包身份，无旧源行、无重复行」。
3. **纪律**：profile patch 只插 bundle 不提供的 id（外部插件），对 bundle 已提供的 id 只做 config 覆盖；不把「以防万一」的注释式插入写进组合文件。升级后首次启动异常时，先按 A1-20 归因（重启一次 / 取证 combo 缺口），再考虑动 patch。

### 4.2 宿主侧（可做的改进）

boot 崩溃时除 `duplicate loader entry id: workspace-files` 外，一并打印可执行信息：

- **blame（怪谁）**：点明撞名的两层来源——「id `workspace-files` 已由 bundle 层 `packages/bundle/web-app/cordis.patch.yml`（安装树 L110–111）提供；profile 层 `…\profiles\web\cordis.patch.yml` 的 insert 行是重复声明」，责任在 profile patch 的手工插入，不在 bundle、不在插件代码；
- **删什么**：给出精确位置与动作——「删除 profile `cordis.patch.yml` 中 `id: workspace-files` 的 insert 块（含其注释）后重启即可恢复」；
- **指路**：附带「若删除后服务仍不可用，按 compose/artifact 缺口归因（同 rev 一新一旧模块 200/404 对比 → 完整重启宿主 → 仍不愈则上报 discussion #5999 / 回退全局包）」的下一步，避免用户再用手工 insert「修」第二次。

---

## 证据与引用

- 证据（只读）：`fixture/boot-crash-log.txt`（L8–L16 栈、L19–L22 前因）、`fixture/profile-patch-excerpt.txt`（L16–L20 手工插入块）、`fixture/web-app-patch-excerpt.txt`（L4–L8 bundle 已有行；L13–L18 相邻行对照）、`fixture/README.md`。
- 技能卡片（仅引用 ID 与要点）：`references/troubleshooting.md` 的 `duplicate loader entry id` 症状行（Cordis 组合规则，跨版本通用，discussion #5999）；`references/v0.1.5-alpha.1.md` 的 DSH-0.1.5-A1-16（web-app bundle 新增五个 loader 行，含 `workspace-files`）、DSH-0.1.5-A1-11（`workspaceFiles` 文件面）、DSH-0.1.5-A1-20（原地升级 combo 遗漏新增模块，重启自愈）；`references/v0.1.5-alpha.2.md` 的 DSH-0.1.5-A2-01（`workspaceFiles` 接口在 alpha.2 的变化，仅说明服务面演进，不改变本组合层结论）；`SKILL.md` 启用性解析验证层（无重复行）与只读诊断纪律。


## Required output (JSON only)
{"decisions":[{"id":"<criterion-id>","verdict":"pass|partial|fail|missing","reason":"short"}],"caps":[{"id":"<cap-id>","triggered":false,"reason":"short"}]}
Every criterion and cap exactly once. pass=full points, partial=half, fail/missing=0; a triggered cap caps the total.