# 贡献指南

欢迎贡献版本卡片、实测证据、示例和校验工具。开始前先搜索现有 Issue/PR，避免与正在
认领的版本或文件重复；发现并行工作时先协调，不覆盖他人分支。

## 开发流程

1. Fork 仓库并从最新 `main` 创建 `feat/`、`fix/` 或 `docs/` 分支；
2. 阅读目标目录的 `SKILL.md` 与 `references/README.md`；
3. 只改当前 PR 拥有的路径，不自动 stash/reset/clean 用户工作；
4. 运行根目录校验并在 PR 中如实列出结果；
5. 一个 PR 只解决一个逻辑主题。

## 新增 DSH 版本卡片

卡片的唯一规范是
[`skills/plugin-upgrade/references/README.md`](skills/plugin-upgrade/references/README.md)。
不要在本文件复制另一套 schema。

### 1. 认领与确定版本走廊

- 建 Issue：`[版本跟踪] DSH <from> → <to>`；
- 使用精确官方 tag/commit，不用 `latest` 或记忆推断；
- 确认 `references/README.md` 中不存在同一条 `from → to` 边；
- 先读完整走廊，折叠中间删除、目标版本恢复等净变化。

### 2. 创建 card-set 文件

在 `skills/plugin-upgrade/references/` 创建 `vX.Y.Z[-suffix].md`，并按 card schema 添加：

- `kind/schema/from/to/status/coverage/cardCount/idPrefix/verifiedAt` frontmatter；
- 完整且全仓唯一的 ID，例如 `DSH-X.Y.Z-A1-01`（落地时把版本占位符替换为真实坐标）；
- `类型/适用对象/影响触点/操作级别/症状/迁移配方/验证/来源` 全部字段；
- 固定 tag/commit 的一手来源；同 tag 可取得源码时，不只引用 release notes。

触点编号使用 [pre-flight](skills/plugin-upgrade/references/pre-flight.md) 的 **#1–#7**。
`curated` 表示精选清单，不得描述成完整 API diff。来源没有具体 API 坐标时，配方应要求
查目标 tag，而不是自造调用形状。

### 3. 更新索引与交叉引用

- 更新 `references/README.md` 的有向走廊表和精确卡数；
- 更新 `plugin-upgrade/SKILL.md` 的参考表；
- 使用完整卡片 ID 做交叉引用；
- 若改了触点模式，同步 `pre-flight.md`、`pre-flight-patterns.json` 与静态 fixture。

### 4. 示例和实测证据

- 可执行示例必须声明精确 DSH tag、安装方式和实际运行命令；
- 仅用于扫描的夹具必须明显标为“静态、不得执行”；
- 区分 Host、Web Client 和普通 Cordis plugin，不把不同 face 的 API 对号替换；
- 报告只声称实际验证的范围，列出未跑的平台、密钥、浏览器和产品入口；
- 本地观察与一手来源冲突时并列记录、复现并上报，不静默覆盖。

## 信息来源优先级

1. 固定 tag/commit 的官方源码、类型、测试和架构决策；
2. 同一 tag 的 release notes 与包文档；
3. 可复现的社区迁移记录；
4. 个人经验（必须附版本、平台和复现步骤）。

禁止提交凭记忆猜测的 API、无法说明适用 face 的代码片段，或把安装成功当作运行验证。

## 本地验证

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

修改 Skill、命令、manifest、版本卡或示例时，两条都运行。示例有自己的 build/test 时，
还要运行对应命令。没运行或受凭据/平台限制的检查必须在 PR 中注明。

## PR 检查清单

- [ ] 与现有 Issue/PR 无重复或已完成协调
- [ ] card schema、完整 ID、七类触点和索引一致
- [ ] 配方引用固定一手来源并说明适用 face
- [ ] 示例/报告没有扩大验证结论
- [ ] 两个仓库校验器通过
- [ ] PR 描述包含验证命令、未覆盖边界和致谢

卡片错误请附一手证据提 Issue；新版本需求可创建版本跟踪 Issue。
