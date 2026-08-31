# benchmark v2（Harbor 格式）验证报告 · 2026-08-31

对 2026-08-31 的 Harbor 格式改造（commit `db53236`）做端到端验证：
**oracle 实跑全部 6 题，reward 全部 1.0，0 异常。**

## 环境

- Harbor CLI 0.22.0（`uv tool install harbor`）
- Docker Desktop server 28.5.1（macOS，本机 provider）
- 每题镜像：`node:24-bookworm` + git；容器题（M/H）全局安装
  `pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2`（沿用 v1 报告第六节同款步骤）

## 怎么复现

```sh
uv tool install harbor
harbor run -p benchmark/tasks -a oracle -y
# 期望：6/6 Mean: 1.000
```

## 结果汇总

| 题 | reward | judge 关键证据 |
|---|---|---|
| S1-static-scan | 1.0 | 报告命中全部 6 张期望卡（含走廊折叠 A1-02+A2-01），fixture 零改动 |
| S2-negative-scan | 1.0 | A1-01 映射 + 零命中类交代 + 零命中≠兼容 + 验证声明 |
| M1-host-migration | 1.0 | `dsh plugin add` 成功 → headless 冷启动激活（MISSING_CREDENTIAL 推进到应用层） |
| H1-plane-trap | 1.0 | 未被误导注释带偏（`inject llm`）→ 插件树无 pending 激活 |
| H2-baseline-trap | 1.0 | 报告正确归因预存失败（+60）+ 冷启动激活（+40）+ 预存测试未被偷修 |
| H3-client-plane | 1.0 | `dsh.client` 声明齐（+40）+ add（+10）+ web 冷启动无 pending（+10）+ `__DSH_BOOT__.entries` 含本插件（+40） |

原始 trial 输出（judge 逐条 reasons、verifier 日志）在
`jobs/oracle-verify/2026-08-31__15-35-29/`，可用 `harbor view jobs/oracle-verify`
查看（该目录已 gitignore）。

## 验证覆盖说明

- 本次验证的是 **harness 正确性**（格式转换后环境、判分、oracle 链路是否端到端
  可用），不是 skill 效果；skill 效果仍按 README 的 with/without-skill 对照跑。
- 容器题的真实 dsh 装包、插件激活、web 冷启动、`__DSH_BOOT__` 名册识别都在
  容器内实际执行，非模拟。
- 未覆盖：真实 agent（非 oracle）跑题、多 trial 噪声分布——建议正式评测前
  先用一道容器题（如 M1）跑一轮真实 agent 冒烟。

## 过程中发现并修复的问题

1. **镜像构建失败：git 无身份**。Dockerfile 的基线提交
   `git commit -m "baseline"` 在 build 环境报 "Author identity unknown"。
   修复：`git -c user.email=bench@local -c user.name=bench commit`（6 题统一）。
2. 运行产物目录 `jobs/` 补进 `.gitignore`。

## 结论

**Harbor 格式改造验证通过。** 自包含环境（每题自带 dsh）+ 容器内 judge +
oracle 标准答案链路全部工作，v1 的外部 `dsh-verify` 容器依赖确认移除干净。
