# 贡献指南

感谢你参与 DSH 插件 skill 的共建。请让每个 Pull Request 聚焦一个主题，并确保其中的判断可以被复现和核对。

## 开始之前

- 先搜索现有 Issue 和 Pull Request，避免重复工作。
- 涉及 DSH 版本变化时，以官方 release notes、上游源码和 `.agents/notes/` 为一手来源，不凭记忆补全行为。
- 无法确认的 API 或迁移方式请明确标记为“待确认”，不要把推测写成迁移配方。

## 新增或修改 skill

1. 在 `skills/` 下使用 kebab-case 目录名，并确保它与 `SKILL.md` frontmatter 中的 `name` 一致。
2. 在 `description` 中写清 skill 做什么以及何时触发；正文保持单一职责。
3. 将较长的背景、版本资料和示例分别放入 `references/`、`examples/` 或 `scripts/`，避免让 `SKILL.md` 过度膨胀。
4. 新增 skill 时，同步更新 `skills/README.md` 中的收录清单。

完整的目录结构和 frontmatter 规范见 [`skills/README.md`](skills/README.md)。

## 更新 `plugin-upgrade` 版本卡片

- 按 [`references/README.md`](skills/plugin-upgrade/references/README.md) 的格式为每个 DSH 版本维护独立卡片。
- 每张卡至少引用一条一手来源，并写明类型、影响触点、症状、迁移配方和验证方式。
- 对跨版本反复变化的字段保留前后卡片并交叉引用，不静默改写历史。
- 实际测试与卡片冲突时，以实际行为为准，并在“实战批注”中记录日期、插件和复现条件。
- 修改触点分类或检出模式时，用 `examples/legacy-plugin/` 检查六类触点是否仍能按预期命中。

## 提交前验证

- 检查 Markdown 相对链接和一手来源链接可访问。
- 对改动涉及的示例或脚本运行相应测试，并在 Pull Request 中记录命令和结果。
- 如果无法进行真实 DSH 启动或运行时验证，请在 Pull Request 中明确说明未验证的部分和原因。
- 确认没有夹带无关格式化、生成文件或功能改动。

## Pull Request 说明

请在说明中包含：

- 改了什么，以及为什么需要改；
- 对应的 DSH 版本区间和一手来源（如适用）；
- 已执行的验证及结果；
- 已知风险、待确认项或未覆盖范围。

提交贡献即表示你同意按本仓库的 [MIT License](LICENSE) 授权该贡献。
