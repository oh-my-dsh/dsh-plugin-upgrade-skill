# DSH Plugin Upgrade Skill

**DeepSeek Harness 插件生态的 agent skill**，社区共建。提供版本无关的迁移指南、破坏性变更配方和真实迁移示例。

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 是"一切皆插件"的 agent harness。本仓库提供 DSH 插件升级的 agent skill——从检查更新、阅读 changelog，到迁移配置、源码适配、验证结果。

## 特色

- **持续更新** — 每个 DSH 版本对应一张独立的迁移卡片，按序应用即可跨版本升级
- **社区共建** — 基于真实迁移实践（如 [dsh-web #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120)），持续补充痛点与配方
- **结构化数据** — 版本卡片格式统一，支持工具化（未来可自动生成迁移 diff）
- **多 agent 支持** — 兼容 Claude Code、Codex、Gemini CLI、Cursor 等主流 AI 编程工具

## 快速开始

### 使用 skills CLI（推荐）

最快路径——由 [skills CLI](https://github.com/justjavac/skills) 安装到它当前支持的 agent：

```bash
npx skills add oh-my-dsh/dsh-plugin-upgrade-skill
```

### Claude Code

**Marketplace 安装**：

```bash
/plugin marketplace add oh-my-dsh/dsh-plugin-upgrade-skill
/plugin install dsh-plugin-upgrade-skill
```

> **SSH 错误？**如果没有配置 GitHub SSH 密钥，使用 HTTPS URL：
> ```bash
> /plugin marketplace add https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
> /plugin install dsh-plugin-upgrade-skill
> ```
**本地/开发模式**：

```bash
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
claude --plugin-dir /path/to/dsh-plugin-upgrade-skill
```

### Codex

先添加 marketplace，再在 Codex 的插件界面中安装/启用该插件：

```bash
# GitHub marketplace
codex plugin marketplace add oh-my-dsh/dsh-plugin-upgrade-skill

# 本地开发 marketplace
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
codex plugin marketplace add ./dsh-plugin-upgrade-skill
```

当前 Codex CLI 没有直接安装子命令；GitHub 与本地路径都通过 `plugin marketplace add` 注册。

### Gemini CLI

直接从仓库或本地克隆安装：

```bash
# 从仓库
gemini skills install https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git --path skills

# 本地
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
gemini skills install ./dsh-plugin-upgrade-skill/skills/
```

### Cursor

将 `skills/` 复制到 `.cursor/skills/`：

```bash
git clone https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill.git
cp -r dsh-plugin-upgrade-skill/skills/* .cursor/skills/
```

## 使用

### 斜杠命令（Claude / Gemini）

安装后可使用 `/dsh-upgrade` 命令：

```bash
/dsh-upgrade 0.1.2
```

或直接在对话中提问：

```
我需要把插件从 0.1.1 升级到 0.1.2，有哪些破坏性变更？
```

### Skill 调用（任意 agent）

对于没有斜杠命令的 agent，直接引用 skill：

```
使用 plugin-upgrade skill 帮我升级 DSH 插件到 0.1.2
```

## Skill 索引

| Skill | 说明 | 版本覆盖 |
| --- | --- | --- |
| [plugin-upgrade](skills/plugin-upgrade/) | 三模式安全升级：只读检查、已安装插件升级、DSH 宿主兼容迁移；含七类触点、版本卡片与回滚约束 | 0.1.1 → 0.1.2 |
| [plugin-write](skills/plugin-write/) | 按目标 Harness 合约编写 DSH 插件，区分官方单仓包与外部可安装插件 | 按目标 Harness 版本 |
| [plugin-test](skills/plugin-test/) | 为 DSH 插件变更选择最小充分测试层级，覆盖单元测试、覆盖率、真实 API、快照、Web 及真实发布入口 | 跨版本验证 |

## 版本数据现状

| 版本区间 | 状态 | 卡片文件 | 说明 |
| --- | --- | --- | --- |
| 0.1.1 → 0.1.2 alpha.1 | ✅ 完成 | [v0.1.2-alpha.1.md](skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | Alpha 1 破坏性变更 |
| 0.1.1 → 0.1.2 alpha.2 | ✅ 完成 | [v0.1.2-alpha.2.md](skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | Alpha 2 增量变更 |
| 0.1.1 → 0.1.2 走廊 | ✅ 完成（基于 alpha.2） | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | Rollup 层增量：跨 cohort 共存、未发布 cohort 安装、`RemoteResult` 错误流、分层验证 |
| 0.1.1 → 0.1.2 | 🔄 待官方发布 tag | — | 0.1.2 正式版尚未发布（当前最新：alpha.2） |
| 0.1.2 → 0.1.3+ | 📝 待认领 | — | 等待社区贡献（[贡献指南](CONTRIBUTING.md)） |

## 参考资源

- [官方仓库](https://github.com/deepseek-ai/deepseek-harness) — DSH 主仓库
- [Discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) — 社区迁移实践与痛点征集
- [dsh-web 迁移实例](https://github.com/zhu1090093659/dsh-web) — @zhu1090093659 的完整迁移案例

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
scripts/validate.mjs            # Skill 结构校验
scripts/validate-manifests.mjs  # 多 agent manifest 校验
```

## 贡献与验证

1. 按 [skills/README.md](skills/README.md) 编写或更新 Skill；
2. 版本卡遵循 [card schema](skills/plugin-upgrade/references/README.md)；
3. 运行：

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

4. 提 PR，并说明已运行的验证。

## 致谢

- [@ccch1mneyyy](https://github.com/ccch1mneyyy) — issue #1 提案和 alpha 版本卡片
- [@zhu1090093659](https://github.com/zhu1090093659) — [dsh-web](https://github.com/zhu1090093659/dsh-web) 迁移实践与详细痛点记录
- [@tianyicui](https://github.com/tianyicui) — discussion #5120 发起和官方征集

## License

[MIT](LICENSE)
