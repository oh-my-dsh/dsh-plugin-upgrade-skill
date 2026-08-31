# S7-unpublished-cohort 参考解法

## 参考报告

见 [solution/report.md](report.md)，期望 judge 得分 100。

## 考点（一句话）

registry 查证先行 + 两条合法路径（overrides tarball / 精确 pin + lockfile）+ semver 语义分析（caret 静默解析到 alpha.2）。
