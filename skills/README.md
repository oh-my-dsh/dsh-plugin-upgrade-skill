# skills/

所有 Skill 都放在这里。**一个 Skill 一个文件夹**，文件夹名使用 kebab-case。

## 编写规范

```text
skills/<skill-name>/
├── SKILL.md          # 必需：触发描述与决策流程
├── scripts/          # 可选：Skill 自有脚本
├── references/       # 可选：按需加载的详细事实
└── examples/         # 可选：静态示例/夹具
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
1: @ours
| [dsh-upgrade-audit](dsh-upgrade-audit/) | 审计两个 DSH 版本间的外部兼容性与回滚：源码检出走 git tag 对比，无源码自动降级下载 npm 双版本；产出标准 upgrade-report 目录（UPGRADE-ADAPTATION + 边界签名表），为版本变更卡片提供证据 | [@oh-my-dsh](https://github.com/oh-my-dsh) |
