---
name: plugin-upgrade
description: 检查或升级已安装的 DSH（DeepSeek Harness）插件，或让插件源码适配新的 DSH 宿主版本。仅检查时保持只读；任何配置、依赖或源码写入前必须先展示计划并获得确认。
---

# plugin-upgrade

安全完成三类任务：只读更新检查、已安装插件升级、DSH 宿主版本兼容迁移。若用户意图
不明确，先确认模式；不要从“帮我看看更新”自行滑入安装或改代码。

## 第 0 步：选择模式

| 模式 | 用户意图 | 允许的默认动作 |
|---|---|---|
| A · inspect | 检查更新、判断是否受某版 DSH 影响 | 只读调查与报告；完成后停止 |
| B · update | 把已安装插件升级到明确版本 | 先计划和确认，再改 composition/依赖 |
| C · host-migrate | DSH 宿主升级后适配插件源码 | 先建版本走廊和触点清单，再计划和确认 |

本 skill 不负责“只升级 DSH core 且不处理插件”；也不允许修改 DSH core 来掩盖插件兼容
问题。

## 通用只读准备

1. 阅读目标仓库的 `AGENTS.md` / `CLAUDE.md` 等规则；检查 branch、HEAD、working tree、
   submodule。发现陌生修改或未跟踪文件就停止并报告，不自动 stash/reset/clean/checkout。
2. 识别安装轨：registry 包、Git checkout、workspace/junction 或复制安装；记录 declared
   版本、resolved 版本、Git SHA 与当前 DSH/Node 版本。
3. 区分文件所有权：
   - `package.json` / lockfile：包与依赖；
   - `dsh-plugin.json`：社区标准 manifest（若采用）；
   - `cordis.patch.yml` / `agent.cordis.yml` / 历史 `cordis.yml`：profile composition；
   - resolved config：运行时组合结果，只用于核对，不整对象回写。
4. 核对目标版本来源、tag/包名、兼容范围、release notes、安装脚本与已知 breaking changes。
   不读取、打印或提交 token、`.npmrc` 内容、凭据或会话日志。
5. 记录回滚基线：当前 HEAD/包版本、lockfile 与将改配置的 hash/路径；说明失败后如何恢复
   **本次明确路径**，不要承诺回滚第三方安装脚本的任意副作用。

## 模式 A · inspect（只读）

输出：当前/可用版本、来源、兼容范围、breaking changes、建议目标、风险与验证计划。不得
改文件、安装依赖、执行 lifecycle script、`git pull` 或切换版本。用户若决定执行，再进入
模式 B 或 C 并单独确认。

## 模式 B · update（升级已安装插件）

1. 按安装轨选择唯一更新方式；有 lockfile 时只使用对应包管理器，不混用 npm/pnpm/bun。
2. 生成变更计划：精确目标版本、将执行的命令、会改的文件、可能执行的生命周期脚本、
   配置迁移和回滚步骤。
3. **任何写入或安装前取得用户明确确认**；即使没有 breaking change 也一样。
4. 在独立 branch/worktree 中做最小修改；配置用路径级 patch，保留未知字段。Git 来源先
   fetch/比较明确 tag 或 commit，不对脏工作区直接 `git pull`。
5. 按“验证与报告”执行；失败时只恢复本次拥有的路径并报告残留副作用。

## 模式 C · host-migrate（插件随 DSH 升级）

1. 用精确 tag 确认 from/to；按 [references/README.md](references/README.md) 的
   `from → to` 元数据连接版本走廊，禁止按文件名字典序。
2. 先读完整走廊并计算最终净状态。字段在中间版本删除、目标版又恢复时，不先删再加。
3. 按 [pre-flight.md](references/pre-flight.md) 扫描七类触点：源码 patch、事件、服务/
   Remote、宿主文件系统、UI/命令/工具、自建通道、子进程/输出。零命中只是启发式结果，
   仍须检查依赖/导入并跑 build 与真实挂载。
4. 只保留与命中触点和实际 face（Host/Web Client/普通 plugin）相交的卡片。卡片是 curated
   清单，不是完整 API diff；缺走廊边或 API 坐标时标 unsupported/待确认，不凭记忆改。
5. 生成按 seam 分组的源码迁移计划，列命中文件、卡片、目标行为与测试；取得确认后再在
   独立 branch/worktree 实施。`capability` 卡仅建议，不自动采用。

## 安全边界

- 所有写文件、安装、拉取/切换版本、运行包脚本的动作都要先展示并确认；
- 不自动 stash/reset/clean/强制更新，不覆盖用户或其他 Agent 的工作；
- 不泄露凭据；诊断只报告是否配置及非敏感版本/来源；
- 不把未知 `gateway/internal` 或其他失败默认重试；仅在错误可重试、操作幂等且策略允许时重试；
- 迁移方式不能由一手来源或可复现行为高置信确定时，停止自动修改并标「待确认」；
- 本地观察与一手来源冲突时并列记录、复现并上报，不静默选择一方。

## 验证与报告

至少按适用层级验证：

1. 安装/解析：对应包管理器、lockfile 与依赖图只发生预期变化；
2. 静态：build、typecheck、插件测试；
3. 运行时：真实 DSH profile 冷启动、entry activate、依赖/提供的 Cordis service 不停在
   pending；
4. 行为：执行一条插件核心路径；宿主迁移至少完成一次消息→工具→回复，或等价专用流程；
5. 包装器：核对退出码、stdout、stderr、取消与 teardown。

报告固定分为：

- **已完成**：版本、文件、卡片与验证；
- **跳过**：未命中或不适用及依据；
- **待确认/残留风险**：缺来源、未跑平台、生命周期脚本副作用；
- **回滚**：已记录基线与可恢复路径；
- **建议**：可选 capability 和迁到公开 seam 的后续工作。

## 参考材料

| 文件 | 内容 |
|---|---|
| [references/README.md](references/README.md) | 版本走廊、卡片 schema 与维护规则 |
| [references/pre-flight.md](references/pre-flight.md) | 七类触点自查与汇总模板 |
| [references/v0.1.2-alpha.1.md](references/v0.1.2-alpha.1.md) | rc.2→alpha.1：14 张 curated 卡 |
| [references/v0.1.2-alpha.2.md](references/v0.1.2-alpha.2.md) | alpha.1→alpha.2：6 张 curated 卡 |
| [examples/legacy-plugin/](examples/legacy-plugin/) | 七类触点静态夹具（不得执行） |

规范背景：[dsh-community-standard](https://github.com/oh-my-dsh/dsh-community-standard)
负责 manifest、契约坐标与协商；本 skill 处理现有插件的实际升级，引用其分类而不重定义
规范语义。官方征集出处见 [deepseek-harness discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120)。
