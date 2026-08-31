# S1 参考解法

## 参考报告

见 [solution/report.md](report.md)——按七类触点逐类列出命中文件/行、卡片映射与
未命中说明，期望 judge 得分 100。

## 考点（一句话）

七类触点全埋的静态夹具上，考「扫描完整 + 卡片映射准确 + 只读纪律」；
其中 `ignorable` 事件 producer 是 **A1-02（alpha.1 移除）↔ A2-01（alpha.2 恢复）
的走廊折叠**：目标 alpha.2 的净状态是保留 `ignorable: true`，只报 A1-02 或
只报 A2-01 都算没算清净状态（judge 要求两张卡都出现）。
