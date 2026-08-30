---
description: 升级 DSH 插件 — 由 plugin-upgrade Skill 选择只读检查、插件升级或宿主迁移模式
---

调用 `dsh-plugin-upgrade-skill:plugin-upgrade` Skill，并把 `$ARGUMENTS` 原样作为用户的目标版本或附加要求。

严格遵守该 Skill 当前定义的模式分流、只读/写入边界、七类 pre-flight、版本走廊、确认、验证和报告规则。不要在命令文件中复制、简化或重写工作流；用户意图不明确时先确认模式。
