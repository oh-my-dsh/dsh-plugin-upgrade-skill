# S22 · The Duplicate Insert That Crashed the Boot — 根因分析、修复与预防报告

> 证据包（只读）：fixture/boot-crash-log.txt、fixture/profile-patch-excerpt.txt、fixture/web-app-patch-excerpt.txt、fixture/README.md
> 环境：Windows 11，npm 全局安装 @deepseek-ai/dsh 0.1.5-alpha.2，profile 由 0.1.2/0.1.3 就地升级而来。

## 1. Root cause（根因）

### 相撞的两条声明

- **A（bundle 行，先到）**：web-app bundle 的 `packages/bundle/web-app/cordis.patch.yml`（npm 安装树内，L110-111）已有
  `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`。
- **B（profile 行，后加）**：profile 的 `C:/Users/lhh/.dsh/profiles/web/cordis.patch.yml` 末尾被维护者手工追加的
  `- insert:` → `- id: workspace-files` / `name: '@deepseek-ai/dsh-api-workspace-files'`（见 profile-patch-excerpt.txt 最后一块）。

两条都是 **insert** 操作，且 loader entry id 同为 `workspace-files` —— 这就是碰撞的两条声明。

### 碰撞在哪个 Cordis 层被检出

栈帧（boot-crash-log.txt）显示：

- 检出点：`@deepseek-ai/cordis-plugin-loader` 的 **`EntryGroup.update`**（`lib/index.js:91:28`）—— 即 Cordis **loader entry（条目组）层**的按 id 唯一性校验；
- 触发路径：`dsh-app-boot` 的 **`Include._apply`**（`lib/index.js:240`）在应用 **`cordis:include`** loader entry 时调用上述更新（错误前缀 `failed to apply loader entry include (cordis:include)`）；
- 时机：`boot`（`lib/index.js:1534`）→ 插件树装载阶段（`dsh: plugin tree failed to load`），**在任何插件代码被加载/执行之前**。

### 为什么 loader 拒绝整次 boot，而不是"接受后一行"

loader entry id 是插件树条目的**唯一键**。同一个 id 出现两条 insert 时语义不确定：哪一行生效、config 归并到哪一行、顺序如何排。loader 因此选择 **fail-fast**：把重复 id 当作配置错误直接抛出 `TypeError: duplicate loader entry id: workspace-files`，而不是 last-wins 静默覆盖。由于 include 的应用是原子的（`Include._apply` 一抛出，`boot` 立即中止），插件树根本构建不出来，于是整次 `dsh web` 启动崩溃。这种"宁可拒绝也不猜"是有意设计：静默覆盖会把 profile 与 bundle 的 ownership 冲突藏起来，把升级问题变成难以追踪的幽灵行为。

## 2. Layering rules（分层规则）

针对"profile patch 作用于 bundle 已提供的插件"，三类操作的安全性：

| 操作（profile patch 层） | 判定 | 理由 |
|---|---|---|
| **按 id 修改插件 config**（config patch keyed by id） | ✅ 安全 | 目标是已存在的声明，属于 patch/modify 语义：按 id 定位并合并配置，不新建 entry，不与 bundle 的 insert 撞键 |
| **为 bundle 未提供的 id 添加 insert 行** | ✅ 安全 | 引入 bundle 没有的新插件（本 profile 的六个 external client plugins、`dsh-file-trace`、`dsh-profiles` 都属此类），id 不冲突 |
| **为 bundle 已提供的 id 添加 insert 行** | ❌ 致命（fatal） | 与 bundle 的 insert 在 `EntryGroup` 按 id 撞车 → `duplicate loader entry id` → 整个 boot 失败 |

**维护者的行为正是第三种（致命）**：手工向 profile patch 插入 `workspace-files` 的 insert 行，而该 id 已由 web-app bundle 提供。

**证明它的证据行**：

1. `profile-patch-excerpt.txt` 末块：`- insert:` → `- id: workspace-files`（维护者手写）；
2. `web-app-patch-excerpt.txt`：`- insert:` → `- id: workspace-files`（安装树 L110-111，bundle 已提供）—— 两行同 id 对撞；
3. 同一 excerpt 里相邻的 `session-controller` / `settings-controller` 两行同样 bundle-provided、却从未被手工插进 profile patch —— 反证"bundle 提供的 id 不应在 profile 层重复 insert"。

profile patch 里那句注释 `# 如果 web-app bundle 已包含此行则此条为冗余；保留以确保升级 profile 不遗漏` 是错误的自我判断：重复 insert **不是"冗余"而是 hard error**；"确保升级不遗漏"是 bundle patch 的职责，不是 profile 的职责。

## 3. Fix（修复）

**改什么、改哪个文件**：编辑 profile 的 `C:/Users/lhh/.dsh/profiles/web/cordis.patch.yml`，**删除末尾手工添加的整个 `workspace-files` insert 块**（`- insert:` 及其下 `- id: workspace-files`、`name: '@deepseek-ai/dsh-api-workspace-files'`，连同上面那两行注释）。文件其余条目（`dsh-file-trace`、六个 external client plugins、`dsh-profiles` 等）原样保留 —— 它们是 profile 独有 id，不冲突。删除后 `dsh web` 即可正常 boot：`workspace-files` 由 web-app bundle 的 patch（L110-111）提供，profile 层无需任何声明。

**插件本身是否有责任**：**没有**。`@deepseek-ai/dsh-api-workspace-files` 及其 bundle 行都是正确的，bundle 已经把该服务装进插件树。**任何插件侧（plugin-side）改动都无法解决这次 boot 失败**：崩溃发生在 loader 的 entry-id 去重（`EntryGroup.update`），早于插件代码执行；改插件源码、导出、name、打包结构都不影响重复 id 的判定。唯一有效的修复就是删掉 profile patch 里多出来的那一行。

**关于原始症状**：右 Sidebar 文档 tab 的"文件资源服务不可用"是**另一个问题** —— 既然 bundle 已提供 `workspace-files`，profile 组合并非真的"缺服务"。正确顺序是：先删重复行恢复可 boot，再单独排查升级后 tab 读取失败的真实原因（如 service wiring / 版本错位 / 该 tab 指向的读路径），绝不能以"往 profile patch 里塞 insert"来处理读取失败。

## 4. Prevention（预防）

### 作者侧：手工加行之前先看什么

1. **先读已安装 bundle 的 `cordis.patch.yml`**（本例：`node_modules/@deepseek-ai/dsh/.../packages/bundle/web-app/cordis.patch.yml`，安装树 L110-111 附近），确认目标 id 是否已被 bundle insert；顺带看邻近行（`session-controller`、`settings-controller`），建立"哪些 id 是 bundle-provided"的清单感。
2. 若 id 已被 bundle 提供 → **绝不 insert**；要定制只能按 id 改 config。只有 bundle 不提供的 id 才允许在 profile patch insert。
3. 注释不是安全网："如果已包含则冗余"式的猜测注释正是本次事故的来源；一切以实际读到的 bundle patch 为准，而不是以"怕遗漏"为由加行。

### host 侧：boot 时应打印什么，让该失败可行动

`EntryGroup.update` 检出重复 id 时，报错应指出**谁的责任、删什么**：

- 冲突 id + 两条声明的**来源文件绝对路径与行号**（bundle patch vs profile patch）；
- ownership 判定：哪条是 bundle-provided（不可在 profile 层重复 insert）、哪条是用户手写；
- **怪谁**：profile patch 的手写行；
- **删什么**：给出要删除的具体块与替代做法（按 id 的 config patch）。

示例文案：

```text
Error: duplicate loader entry id 'workspace-files'
  declared at   C:/Users/lhh/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/.../packages/bundle/web-app/cordis.patch.yml:110  (bundle-provided)
  re-inserted at C:/Users/lhh/.dsh/profiles/web/cordis.patch.yml:24  (profile, manual insert)
  blame: the profile patch row; bundle-provided ids cannot be re-inserted.
  fix:   delete the whole `- insert: id=workspace-files` block from the profile patch.
         To configure this plugin, patch its config by id instead of inserting a row.
```

## run-stats

- **toolcalls 总数**：13 次内层工具调用（glob ×1、read ×5、write ×6、send_message ×1），经 5 次 run_code 调度执行
- **token 用量**：n/a（本 harness 不向 solver 暴露 token 计数）
- **完成时间**：2026-10-21T15:56:20+08:00 (Asia/Shanghai)
