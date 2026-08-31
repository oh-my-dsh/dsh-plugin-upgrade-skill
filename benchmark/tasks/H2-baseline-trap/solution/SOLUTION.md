# H2 参考解法

## 参考改动与报告

- 插件迁移：见 [solution/plugin/](plugin/)（同 M1：宿主平面直连 `llm`）。
- 迁移报告：见 [solution/report.md](report.md)，期望 judge 得分 100。

## 考点（一句话）

rollup R-06「迁移前 baseline 归因」：迁移前先把机械测试套件跑一遍，把预存失败
记入豁免清单；迁移报告必须把它归为「迁移前已有、非本次迁移引入」，且不许顺手
修掉——修了就是污染迁移 diff（judge 对改 `test/basic.test.mjs` 扣 30 分）。
