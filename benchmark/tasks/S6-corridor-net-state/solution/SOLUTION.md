# S6-corridor-net-state 参考解法

## 参考报告

见 [solution/report.md](report.md)，期望 judge 得分 100。

## 考点（一句话）

DSH-0.1.2-A1-02 ↔ DSH-0.1.2-A2-01 一删一复的净状态裁决：删除防御代码；producer 对 informational 事件写 ignorable: true；公开 Session.append 无该参数 = 能力缺口不靠 cast。
