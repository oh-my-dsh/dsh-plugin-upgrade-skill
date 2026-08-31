# S2 参考解法

## 参考报告

见 [solution/report.md](report.md)，期望 judge 得分 100。

## 考点（一句话）

pre-flight 的负面清单：启发式扫描不是兼容性证明。插件只命中 #3（apiProxy →
DSH-0.1.2-A1-01），其余六类零命中；agent 必须说清楚「零命中 ≠ 兼容」——仍须按
走廊逐卡核对依赖/配置，并在目标版本真实挂载验证（build/typecheck、冷启动、功能
烟测），而不是扫完就说“应该没问题”。
