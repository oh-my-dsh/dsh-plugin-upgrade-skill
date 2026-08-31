# skills/

所有 Skill 都放在这里。**一个 Skill 一个文件夹**，文件夹名使用 kebab-case。

## 编写规范

```text
skills/<skill-name>/
├── SKILL.md          # 必需：触发描述与决策流程
├── scripts/          # 可选：Skill 自有脚本
├── references/       # 可选：按需加载的详细事实
└── examples/         # 可选：示例代码（只读，不要运行）
```

`SKILL.md` 至少包含：

```markdown
---
name: skill-name
description: 一句话说明做什么、何时触发，以及重要的只读/写入边界。
---
```

要求：

- `name` 与文件夹名一致；
- `description` 同时说明操作和触发场景；
- 主文件只保留决策流程，详细材料放 `references/`；
- 一个 Skill 聚焦一项用户目标；同一目标有只读/写入模式时先显式分流；
- 写操作必须先展示计划并取得确认；
- 新增/修改后运行根目录 `node scripts/validate.mjs`。

## 收录清单

| Skill | 说明 | 作者 |
|---|---|---|
| [plugin-upgrade](plugin-upgrade/) | 只读检查、已安装插件升级、宿主兼容迁移；七类触点 + 版本卡片 + 安全回滚 | [@oh-my-dsh](https://github.com/oh-my-dsh) |
| [plugin-write](plugin-write/) | 编写 DSH 插件，按目标 Harness 版本选择扩展形态，并区分官方单仓与外部插件规则 | [@omdsh-dev](https://github.com/omdsh-dev) |
| [plugin-test](plugin-test/) | 为 DSH 插件变更选择测试层级，并覆盖真实组合、发布产物与目标版本产品入口 | [@omdsh-dev](https://github.com/omdsh-dev) |
| [plugin-release](plugin-release/) | 打包、发布与分发 DSH 插件：发布轨选择、未发布 cohort 安装、CI 门禁与回滚 | [@omdsh-dev](https://github.com/omdsh-dev) |

## 版本兼容审计（独立条目）

**[dsh-upgrade-audit](dsh-upgrade-audit/)**（[@oh-my-dsh](https://github.com/oh-my-dsh)）——审计两个 DSH 版本间的外部兼容与回滚，产出 UPGRADE-ADAPTATION 报告 + 边界签名表，为版本卡片提供证据。独立分节维护，不改收录清单。
