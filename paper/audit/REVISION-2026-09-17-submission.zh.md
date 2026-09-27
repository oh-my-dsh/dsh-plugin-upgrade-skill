# 三项收尾完成记录（2026-09-17）

## 1. 主线与贡献

摘要、引言、研究问题、方法、结果、讨论与局限已重写。定位为迁移 skill 的回顾性软件维护研究：历史五组只作背景，64 输出 Flash S16 为可审计重点，缺少原始回答的 Qwen S16 降为补充。倒 U 不再作为主结论；不把静态 rubric 分数等同于修复成功率。

相关工作明确承认 SkillsBench、SWE-Skills-Bench、SkillLens 与 WebDev-Skills-Bench 已研究异质收益/开销，本稿不主张首次发现。贡献落在版本契约、可追溯输出错误与评分敏感性。旧未执行方案保留为历史文件，停止条件不再包含新跑数百次实验。

## 2. 固定范围输出复核

选择先提交为 `181aef9`；新增两臂覆盖 S6 正增益、S18 负增益、S12 零增益，重复回答透明去重。合并共 10 回答、56 标准、3 标准分歧。所有分歧都保留，既包括降低 with-skill 的 S11，也包括降低 no-skill 的 S6。原始评分未覆盖，三种敏感性全部报告。复核由各插件作者（出题者）人工完成，非盲。

## 3. 数字、证据与投稿材料

新增离线脚本检查报告 hash、rubric hash、评分、去重及敏感性；逐题原始表自动生成。历史资源从记录重算，去掉缺乏依据的 2.2 倍成本表述。证据账本、highlights、投稿信草稿、作者信息与有限待确认事项已整理。

## 验证

- `npm test`：通过（包含完整仓库验证、已有分析及评分测试）。
- `npm run check:paper-paired`：通过。
- `node benchmark/scripts/audit-unified-evidence.mjs --check`：通过；64 原始报告、328 标准与 S11 边界反例。
- `node paper/scripts/summarize-submission-evidence.mjs --check`：通过；10 回答、56 标准、全部敏感性与生成逐题表。
- LaTeX 编译与逐页视觉检查：通过；11 页，零编译警告、无未解析引用，逐题表完整置于附录页，最终 PDF 为 `output/pdf/migration-paper-retrospective-review.pdf`。

尚不能代作者确认署名、经费/利益冲突、全员同意与材料再分发权限。JSS 当前指南端点返回 403，使用通用期刊单栏审阅格式，不宣称已符合全部投稿系统要求。没有外部投稿，没有新增 solver/API judge 调用。
