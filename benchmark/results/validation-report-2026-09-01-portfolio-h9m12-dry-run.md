# H9/M6 系列试考报告（4 道最难题 × 4 个子代理，无 skill 裸考）

> **编号映射说明**：本报告成文于任务目录最终定号之前，通篇使用的是当时的内部编号。对应关系为 H9→H14-mineru-api、H10→H15-locale-pack、H11→H16-history-dock、H12→H17-merge-calls、H13→H18-blame-bubbles、H14→H19-workspace-ya（M6-M12 编号不变）；系列名 `H9/M6` 即最终的 `H14/M6` portfolio series。报告正文保留原编号作为历史记录。

日期：2026-09-01 · 环境：本地 dry-run（无 Docker/dsh runtime；Deploy 幕不可执行，判分 0 并单列）
口径：with 容器时满分 100 = 15 诊断 + 50 静态 + 25 部署 + 10 发布；本表 Deploy=0，offline-normalized = 实得 / 75。
判分器：各任务**修后** judge（v2，修复了试考暴露的 4 处锚点误判，见「judge 修复记录」），经 stub harness 以真实 judge 代码执行。

## 分数（judge v2）

| 任务 | Act1 | Act2 | Act4 | RAW(/100) | 生效 cap |
|---|---|---|---|---|---|
| H11-history-dock | 10/15 | 20/50 | 10/10 | **40** | 40（静态未完） |
| H12-merge-calls | 10/15 | 0/50 | 10/10 | **20** | 20（runtime 残留，真 boot 致命） |
| H13-blame-bubbles | 10/15 | 20/50 | 10/10 | **40** | 40（静态未完） |
| H14-workspace-ya | 10/15 | 20/50 | 10/10 | **40** | 40（静态未完） |

四名考生全部：Act1 存在+点名（10/15，无 skill 轮引用不出卡 ID——预期内）；Act4 全对（版本递增 + private 保留）。

## 判分明细（v2，修后 judge）

**H11**（40）：textareaGone ✓（comment-strip 修复后不再被 memo 引文误伤）、listenerInDock ✓（工厂形态等价判定生效）、legacyNodes ✓、runtimeGone ✓；仍败于：keydown 保留 bubble 相（`handler, false`）、无 `data-trigger-menu`、inject 缺 ui-renderer。
**H12**（20，runtime cap）：**真致命错**——inject 加了 ui-chat 却没删 `dsh-client-runtime`（还把已删包 peer "升"到 alpha.2）、bare cordis peer 保留；legacyViewsGone ✓（修后不再被解释性注释误伤）；useChat ✓；block.meta 推导缺（agent 自造 `deriveResultView` 挂在别的调用形态上）；labels/Partial 未做。
**H13**（40）：authority 两参 ✓、apiproxy/runtime 清理 ✓（修后不再被迁移记录注释误伤）、cohort ✓（12 peers）；仍缺：`ConnectionRpcResult` 类型源（自造本地 typedef）、`SessionProjectionStateMap` merge（自造 `stateMap` 字段）、inject 缺 ui-session。
**H14**（20→40 after fix；20 分为 `ACTIONABLE_NODE_MODULES` 拒绝语豁免生效前的旧判）：拒绝 bait 的理由文本不再误判 ✓；真实缺陷暴露：`provideRoot` 接管缺失（自造 `ctx.slots.hook`/`dsh-client-context`/`ctx.navigation`）、inject 缺三个 controller 模块、GlobalStandardProps 声明缺；cohort ✓。

## judge 修复清单（试考暴露 → 已修复 → 双向校验仍全绿）

1. **H14 `noShippedPackageEdit`**：裸子串 `"node_modules"` → 可执行形态锚（`node_modules/<path>` 或 memo 的 patch 指令措辞）；考生的拒绝说明不再误判为致命 bait。
2. **H12 `legacyViewsGone`**：裸 token → 成员访问形态 `block\.resultView|block\.callView`（H8 statement-anchored 先例落实）。
3. **H13 `apiproxyGone`**：只认 JSON 依赖块 + `import()`/`from` 注解形态（`APIPROXY_SURFACE`）；迁移记录注释不再误判。runtimeGone 同步改为 import 形态。
4. **H11 `listenerInDock`**：新增 `__ModuleLoader__.load` 工厂形态等价判定（`stripFunctionBodies` 后顶层无 keydown 注册即视为住在组件作用域内）——修复"考生采用真实构建产物形态即被 punish"的问题。
5. 通用：所有 token 级检查补 `stripComments`（迁移记录注释不再 false-hit）。

修复后 13 题双向校验全绿（PRE 必败 / POST 必过），全仓 .mjs 语法 0 失败。

## 考生行为观察

- 全员诚实执行授权边界（未读判分材料、未拉卡库、卡 ID 如实标 UNRESOLVED 而非编造）。
- H11 明确使用本机 `~/.dsh/source/current`（=alpha.2 源码）作 host 参考——真实容器里等价物是已安装 dsh 的产物代码；严格口径下建议在 instruction 中声明 host 源码可见性。
- 自造 API 率高（H13 两处、H14 三处）：无 skill 时对拆分后包名只能猜——正是该 benchmark 量测的 skill 价值缺口。
- H14 考生拒绝 node_modules bait 的理由写得完全正确（"零 patch 原则 + 重装即失效"），但 v1 judge 的裸子串检查把诚实拒绝也打了 20 分——修复后该 cap 不再触发（仍因真实缺陷 cap 40）。

## 与上游协议的差异（本次试考）

- Deploy 幕未执行（无容器）：stub judge-utils 将 Act3 记 0 并在 reasons 注明。正式跑法：`harbor run -p benchmark/tasks/<id> -a <agent>`。
- 无 skill 轮（卡片未提供）；with-skill 对照轮需先装 `oh-my-dsh/dsh-plugin-upgrade-skill`。
- 判分材料（tests/solution）对考生文件系统级隔离（比上游"同容器+授权契约"更严格）。
- 试考 harness：`benchmark/eval/run/<task>/`（真实 judge + 桩 judge-utils），可复跑。
