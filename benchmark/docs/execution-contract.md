# 无人值守执行契约（BENCHMARK-AUTH-v1）

本 benchmark 用单轮、无人值守的 Harbor trial 评测 agent。`instruction.md` 是该 trial
唯一的用户消息；agent 执行过程中不会再有真人回复“确认”。如果待测 skill 的正常交互
流程要求“先计划、再确认、再修改”，仅写“请直接修改”不足以表达确认已经存在，容易把
遵守流程的 agent 误判为零分。

`BENCHMARK-AUTH-v1` 因此是题面的一部分，而不是 skill 的特例或修改：用户预先确认
agent 在明确边界内产生的计划，并授权它在计划形成后立即继续。授权块必须同样出现在
with-skill 和 without-skill 两轮中，不得包含某道题的迁移答案。

## 固定语义

- trial 是一次性隔离环境，不会有后续用户消息；
- agent 仍应完成必要的分析和计划，但不得只因缺少第二轮确认而停止；
- 实操题只授权修改 `/app/fixture/`、写入题面指定的 `/app/agent-output/`、创建一次性
  本地验证资产并运行本地命令；
- 静态扫描题保持 `/app/fixture/` 零改动，只授权读取和写报告；若题目专门考察陈旧
  构建产物，可显式授权只清理题面指定的构建产物目录，但源码路径仍须零改动；
- 所有题都禁止修改 skill、评测器或参考答案，禁止发布、推送、访问外部服务或改动
  容器外资源；
- 真实阻塞仍须如实报告。授权不等于要求伪造结果，也不扩大题目的文件和行为边界。

## 维护规则

1. 每道题的 `instruction.md` 必须且只能包含一个 `BENCHMARK-AUTH-v1` 标记。
2. 每道题的 `task.toml` 必须在 `[metadata]` 中声明
   `execution_contract = "BENCHMARK-AUTH-v1"`。
3. 修改契约语义时应创建新版本，不要静默改变已有标记的含义。
4. 新题必须明确归为只读题、限定构建产物可变题或实操题，并使用对应授权边界。
5. 使用下面的命令检查题面和元数据：

   ```sh
   node benchmark/scripts/validate-execution-contract.mjs
   ```

这个契约只解决 benchmark 的交互建模问题。agent runner 自身仍应使用适合无人值守
评测的执行模式；安全性由一次性容器、范围约束和 verifier 共同保证。
