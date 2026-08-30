# dsh-plugin-upgrade-skill

DSH 插件生态的 **Skill 合集仓库**，社区共建。

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 是
“Everything is a Plugin”的 agent harness；[oh-my-dsh](https://github.com/LaplaceYoung/oh-my-dsh)
是面向 DSH 的社区插件生态。本仓库收集插件升级、审计、迁移和开发相关 Skill。

## Skill 索引

| Skill | 说明 |
|---|---|
| [plugin-upgrade](skills/plugin-upgrade/) | 三模式安全升级：只读检查、已安装插件升级、DSH 宿主兼容迁移；含七类触点、版本卡片与回滚约束 |

## 安装与触发

项目级使用可把 `skills/plugin-upgrade/` 复制到：

```text
<your-project>/.agents/skills/plugin-upgrade/
```

也可以让 DSH 本地 Skill provider 直接加载本仓库的 `skills/` 根目录。确认目录中保留
`SKILL.md` 与 `references/`，不要只复制主文件。

示例请求：

- `只读检查这个 DSH 插件有没有新版本，不要修改任何文件。`
- `把已安装插件升级到 1.4.0，先给计划，确认后再执行。`
- `把这个插件从 dsh-v0.1.1-rc.2 适配到 dsh-v0.1.2-alpha.2。`

## 目录

```text
skills/<skill-name>/
├── SKILL.md
├── references/     # 按需加载的版本事实与清单
└── examples/       # 静态夹具，不默认执行
scripts/validate.mjs
```

## 贡献与验证

1. 按 [skills/README.md](skills/README.md) 编写或更新 Skill；
2. 版本卡遵循 [card schema](skills/plugin-upgrade/references/README.md)；
3. 运行：

```sh
node scripts/validate.mjs
```

4. 提 PR，并说明已运行的验证。

## License

[MIT](LICENSE)
