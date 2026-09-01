# H6-remote-error-trap 参考解法

## 参考报告

见 [solution/report.md](report.md)，期望 judge 得分 100。

## 考点（一句话）

错误码命名空间迁移（gateway/cancelled + gateway/internal）+ cancel 传播不重试 + internal/未知上报不盲重试 + 拆静默吞错；陷阱注释"错误码别改"照抄封顶 25。
