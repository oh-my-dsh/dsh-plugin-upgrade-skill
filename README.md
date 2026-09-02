# DSH Plugin Upgrade Skill

**简体中文** | [English](README.en.md)

**教 AI 帮你升级 dsh 插件的 skill**，社区共建。

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 是一个"所有功能都以插件形式存在"的 AI 运行框架。麻烦在于：**dsh 每次发新版，老插件就可能启动不了**。本仓库做的事情就是把所有已知的坑写成 AI 看得懂的升级手册，让 AI（Claude Code、Codex、Gemini 等）帮你把插件安全迁到新版本。

## 这个仓库里有什么

- **39 张升级说明卡**：每张卡记录一个真实的坑——什么坏了、为什么坏、怎么修、信息来源是哪个版本。按版本排好序，从 0.1.1 一路到 0.1.2-alpha.3（alpha.2→alpha.3 无插件面变更，0 张卡）。
- **12 条通用对策**：有些坑和版本无关（比如"先备份再动手""新旧版本怎么共存"），这些写成了一份对策清单。
- **8 个 skill**：一个统一工作流负责选择和编排，另外七个分别负责查升级、写新插件、测插件、发插件、对比两个版本的差别、排查运行时故障和给轻量插件接入重依赖。
- **26 道考题（benchmark）**：用来测"AI 装了我们的 skill 之后到底会不会升级插件"，每道题都有自动判分；其中包含 dsh-web v0.3.8 → v0.3.9 的真实迁移。
- **多份验证报告**：我们在 docker 里真的装了两个版本的 dsh，验证了"按卡片做就能修好插件"；此后又用 Codex 等 agent 做了多轮 benchmark 实测。

## 快速开始

### 使用 skills CLI（推荐）

一条命令装到它支持的 agent：

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

## 怎么用

Claude Code 中按名字调用 skill（插件安装后带命名空间）：

```
/plugin-workflow
/dsh-plugin-upgrade-skill:plugin-workflow
/plugin-upgrade 0.1.2
/dsh-plugin-upgrade-skill:plugin-upgrade 0.1.2
```

首次只调用统一入口、尚未说明目标流程时，它会先列出 7 个工作流程和 12 项可选能力，推荐只读
`health-check` 但不会自动执行。回复流程编号或名称，并按需增减能力后，它才会生成阶段账本并开始：

```text
选择 1
选择 compatibility-migration，加上 docker-smoke 和 browser-check
```

也可以直接在对话中提问（任意 agent），skill 按描述自动触发；只读检查直接给结果，升级或迁移会先出计划再等确认：

```
先检查这个 DSH 插件，让我选择要不要升级、测试、查云端命名或发布
我需要把插件从 0.1.1 升级到 0.1.2，有哪些破坏性变更？
帮我把 dsh-ads 这个插件升级到 dsh-v0.1.2-alpha.2
```

## 8 个 skill 各自管什么

| Skill | 干什么用 |
| --- | --- |
| [plugin-workflow](skills/plugin-workflow/) | 统一入口。运行前选择检查、升级、测试、命名注册、打包发布等功能，生成阶段账本并分别确认写入、运行和外部发布 |
| [plugin-upgrade](skills/plugin-upgrade/) | 主角。检查插件要不要升级、执行升级、把老插件适配到新 dsh 版本 |
| [plugin-write](skills/plugin-write/) | 写新插件，附命名规范和查重（避免和别人插件撞名） |
| [plugin-test](skills/plugin-test/) | 测插件改得对不对，含 docker 冒烟测试（装上 dsh 真启动一遍） |
| [plugin-release](skills/plugin-release/) | 打包发布插件，含发布前的自动检查 |
| [dsh-upgrade-audit](skills/dsh-upgrade-audit/) | 对比两个 dsh 版本到底改了什么，给升级卡提供证据 |
| [plugin-runtime-debug](skills/plugin-runtime-debug/) | 排查插件在宿主里的运行时故障（坐标/投影不匹配、版本滞后、幽灵条目等） |
| [plugin-heavy-dep](skills/plugin-heavy-dep/) | 给轻量插件接入重依赖（mermaid 这类），含懒加载接入清单 |

## 升级卡覆盖到哪个版本了

| 版本区间 | 状态 | 说明卡 | 备注 |
| --- | --- | --- | --- |
| 0.1.1-rc.1 → 0.1.1-rc.2 | ✅ 完成 | [v0.1.1-rc.2.md](skills/plugin-upgrade/references/v0.1.1-rc.2.md) | 3 张卡 |
| 0.1.1-rc.2 → 0.1.2-alpha.1 | ✅ 完成 | [v0.1.2-alpha.1.md](skills/plugin-upgrade/references/v0.1.2-alpha.1.md) | 28 张卡 |
| 0.1.2-alpha.1 → 0.1.2-alpha.2 | ✅ 完成 | [v0.1.2-alpha.2.md](skills/plugin-upgrade/references/v0.1.2-alpha.2.md) | 8 张卡 |
| 0.1.2-alpha.2 → 0.1.2-alpha.3 | ✅ 完成 | [v0.1.2-alpha.3.md](skills/plugin-upgrade/references/v0.1.2-alpha.3.md) | 0 张卡（无插件面变更，含核对记录） |
| 跨版本通用对策 | ✅ 完成 | [rollup-0.1.2.md](skills/plugin-upgrade/references/rollup-0.1.2.md) | 12 条（新旧共存、先备份、启动卡死怎么办等） |
| 0.1.1 → 0.1.2 正式版 | 🔄 等官方发版 | — | dsh 0.1.2 还没发正式版（最新是 alpha.4，走廊已核实到 alpha.3），发了之后我们要复核一遍 |
| 0.1.2 → 更新版本 | 📝 等社区认领 | — | 想帮忙写卡？看 [贡献指南](CONTRIBUTING.md) |

## 考题（benchmark）

[benchmark/](benchmark/) 目录下有 29 道升级考题和自动判分，采用 [Harbor](https://github.com/harbor-framework/harbor) 任务格式：每题一个自包含任务（自带 dsh 环境的容器 + 自动 verifier），`harbor run -p benchmark/tasks/<题号> -a <agent>` 即可出 0~1 分。同一只 AI 装 skill 做一遍、不装做一遍，分差就是 skill 的实际效果。详见 [benchmark/README.md](benchmark/README.md)。同目录还有多份验证报告：[validation-report-2026-08-30.md](benchmark/results/validation-report-2026-08-30.md)（此前的迁移/benchmark 验证记录）、[validation-report-2026-08-31.md](benchmark/results/validation-report-2026-08-31.md)（Harbor 格式改造后的端到端验证）、[validation-report-2026-08-31-auth-v1.md](benchmark/results/validation-report-2026-08-31-auth-v1.md)（BENCHMARK-AUTH-v1 无人值守授权验证），以及四份 2026-09-01 的 Codex + `gpt-5.6-luna` 实测报告（[带 skill 的其余 18 题](benchmark/results/validation-report-2026-09-01-codex-gpt-5.6-luna-other-18.md)、[不带 skill 的其余 18 题](benchmark/results/validation-report-2026-09-01-codex-gpt-5.6-luna-other-18-no-injected-skill.md)、[带 skill 的真实仓库题](benchmark/results/validation-report-2026-09-01.md)、[不带 skill 的真实仓库题](benchmark/results/validation-report-2026-09-01-h8-dsh-web-alpha2-no-skill.md)）。

## 参考资源

- [官方仓库](https://github.com/deepseek-ai/deepseek-harness) — DSH 主仓库
- [Discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120) — 社区迁移踩坑征集（本仓库的起点）
- [dsh-web 迁移实例](https://github.com/zhu1090093659/dsh-web) — @zhu1090093659 的完整迁移案例

## 项目里直接用

使用统一工作流时，把整个 `skills/` 目录复制到项目里，因为 `plugin-workflow` 会把每个阶段交给另外五个 owning Skill。只需要升级能力时，也可以单独复制 `skills/plugin-upgrade/`：

```text
<your-project>/.agents/skills/
├── plugin-workflow/
├── plugin-upgrade/
├── plugin-write/
├── plugin-test/
├── plugin-release/
└── dsh-upgrade-audit/
```

注意保留里面的 `SKILL.md` 和 `references/` 文件夹，别只复制一个文件。也可以让 DSH 本地的 skill 加载方式直接指向本仓库的 `skills/` 目录。

## 仓库目录

```text
skills/<skill-name>/
├── SKILL.md        # skill 的说明书（怎么触发、怎么干活）
├── references/     # 升级说明卡和详细资料
├── scripts/        # 可执行的小工具（含迁移规划器、工作流计划器和运行时验证器）
└── examples/       # 示例代码（只读，不要运行）
scripts/validate.mjs            # 仓库自检
scripts/validate-manifests.mjs  # 多 agent 清单自检
benchmark/                      # 29 道考题 + 判分 + 验证报告
```

## 想贡献？

1. 按 [skills/README.md](skills/README.md) 的规范写；
2. 升级卡按 [卡片格式](skills/plugin-upgrade/references/README.md) 填；
3. 跑两条自检命令，全绿再提 PR：

```sh
node scripts/validate.mjs
node scripts/validate-manifests.mjs
```

## 致谢

- [@hikariming](https://github.com/hikariming) — 仓库维护与 dsh 技能检索站 [dshfind.com](https://dshfind.com)
- [@ccch1mneyyy](https://github.com/ccch1mneyyy) — issue #1 提案和 alpha 版本卡片
- [@zhu1090093659](https://github.com/zhu1090093659) — [dsh-web](https://github.com/zhu1090093659/dsh-web) 迁移实践与详细痛点记录
- [@huiliyi37](https://github.com/huiliyi37) — [dsh-tui](https://github.com/huiliyi37/dsh-tianshu-tui) 0.1.2-alpha.2 迁移实测
- [@tianyicui](https://github.com/tianyicui) — discussion #5120 发起和官方征集

## License

[MIT](LICENSE)
