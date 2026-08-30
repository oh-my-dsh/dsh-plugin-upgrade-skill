# references/ · 按需加载的参考材料

> `SKILL.md` 只保留决策流程，版本事实与扫描模式放在这里按需加载。

## 版本走廊索引

按表中 `from → to` 的有向边构造走廊，**不要按文件名排序**；`alpha.10` 的字典序会早于
`alpha.2`。目标跨多版时先读完整走廊并计算最终净状态，再修改源码——例如字段在
alpha.1 删除、alpha.2 恢复时，不应先删再加。

| 顺序 | 卡片文件 | from | to | 卡数 | 状态 / 覆盖 |
|---|---|---|---|---:|---|
| 1 | [v0.1.2-alpha.1.md](v0.1.2-alpha.1.md) | `dsh-v0.1.1-rc.2` | `dsh-v0.1.2-alpha.1` | 14 | reviewed / curated |
| 2 | [v0.1.2-alpha.2.md](v0.1.2-alpha.2.md) | `dsh-v0.1.2-alpha.1` | `dsh-v0.1.2-alpha.2` | 7 | reviewed / curated |
| — | [rollup-0.1.2.md](rollup-0.1.2.md) | `dsh-v0.1.1-rc.2` → `dsh-v0.1.2-alpha.2` 全走廊 | rollup | 非卡片文件：走廊层增量（跨 cohort 共存、未发布 cohort 安装、`RemoteResult` 错误流、分层验证清单）；**基于 alpha.2，正式版需复核** |

`curated` 表示只收录已识别的插件相关变化，**不表示完整 API diff**。走廊缺边时停止
自动迁移，向用户报告缺口；为当前任务做临时上游调研与给本仓库补卡是两件事，后者
不应成为修改用户插件的隐式副作用。

配套材料：

- [pre-flight.md](pre-flight.md)：七类触点自查与迁移任务汇总；
- [pre-flight-patterns.json](pre-flight-patterns.json)：可执行校验使用的正则真源；
- [examples/legacy-plugin/](../examples/legacy-plugin/)：七类触点静态夹具。

## 卡片文件元数据

每个 `vX.Y.Z-<suffix>.md` 以 frontmatter 声明：

```yaml
---
kind: dsh-version-card-set
schema: 1
from: dsh-v0.1.2-alpha.1
to: dsh-v0.1.2-alpha.2
status: reviewed
coverage: curated
cardCount: 4
idPrefix: DSH-0.1.2-A2
verifiedAt: 2026-08-30
---
```

版本顺序由 `from/to` 决定；`cardCount`、ID 前缀与必需字段由仓库校验脚本检查。

## 单张卡片格式

```markdown
### DSH-0.1.2-A2-01 · 标题

- **类型**: breaking | behavior | capability | fix | security | privacy
- **适用对象**: client / server plugin / profile wrapper / packaging 等
- **影响触点**: #1…#7，或“无（打包/隐私面）”
- **操作级别**: required | required-if-hit | required-if-target-is-… | conditional | optional | informational
- **症状**: 升级后什么会坏或变化
- **迁移配方**: 可核对的步骤；旧→新 ledger（如适用）
- **验证**: 如何证明最终行为，而不是只证明安装成功
- **来源**: 固定 release tag / commit 的一手来源
- **实战批注**（可选）: 可复现的真实迁移差异，注明日期、插件、平台与版本
```

规则：

1. ID 必须包含完整宿主版本并在仓库内唯一；
2. 每张卡至少引用一条一手来源，同版本材料存在时优先钉在同一个 tag；
3. release notes 只给出方向、没有 API 坐标时，配方必须要求再查目标 tag 类型，不能自造接口；
4. 跨版本回滚/恢复用完整 ID 交叉引用；
5. 本地观察与一手来源冲突时，先复现并并列记录差异，不静默覆盖任何一方。
