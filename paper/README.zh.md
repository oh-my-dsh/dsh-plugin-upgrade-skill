# 面向特定版本插件迁移的 Agent Skill 评估

**预印本**：[arXiv:2609.30120](https://arxiv.org/abs/2609.30120)（cs.SE，2026 年 9 月），源码为 `paper/latex/acl_latex.tex`，计划投稿期刊为 JSS。

2026-09-24 稿件整理为回顾性软件维护研究，按 JSS 读者定位。倒 U 不再作为主结论；本轮新增两种跨模型家族的 LLM 盲化重判，没有新增 solver 实验或独立人工评分。

- [正文](latex/acl_latex.tex)：单栏通用期刊审阅版，沿用旧文件名，不是已核验的 JSS 官方模板。
- [唯一执行清单](INVERTED-U-WORKPLAN.zh.md)：已完成工作、停止规则、作者待确认项。
- [证据映射](audit/claim-evidence-20260917.md)：主张、来源、限制与复算入口。
- [复核说明](audit/output-review-20260917/README.zh.md)：10 份回答、56 项标准，保留原始评分与全部敏感性。
- [投稿材料](submission/README.zh.md)：highlights、cover letter 草稿、作者与声明待办。

## 编译与复算

在仓库根目录运行：

```sh
node paper/scripts/summarize-submission-evidence.mjs --check
node benchmark/scripts/audit-unified-evidence.mjs --check
node paper/scripts/analyze-llm-judge-panel.mjs --check
npm run check:paper-paired
tectonic --outdir output/pdf paper/latex/acl_latex.tex
cp output/pdf/acl_latex.pdf output/pdf/migration-paper-retrospective-review.pdf
```

也可在 `paper/latex` 中使用 pdflatex + bibtex 编译。保留 `latex/` 与 `generated/` 相对路径。历史五组表与 benchmark 元数据通过各自生成脚本维护，不手改。S16 完整性不代表所有历史配置均有原始回答，静态得分不等于修复成功率。

原作者信息保存在 `submission/author-information.tex.txt`，尚需确认；审阅 PDF 不擅自指定通讯作者或声明全员已同意。


2026-09-17 补强：全量 64 报告 / 328 原判契约分层与 10 报告重点复核分开；人工后续确认保留来源，不推算一致率。新增检查：`npm run check:paper-contracts`、`npm run check:paper-glm53`。GLM-5.3 三轮混用 judge，仅作补充。

本轮写作收束：以完整归档的 S16 实验和迁移契约案例为正文主线，历史及补充模型比较移至附录 B；讨论明确 API、边界和进程存活的检查问题，以及尚未验证这些检查能改善后续结果的边界。见 [改稿记录](audit/REVISION-2026-09-17-positioning.zh.md)。

新增离线证据：S11 原谓词边界检查、S18 最小计时器机制对照与三个评分端点的完整符号枚举。运行 `npm run check:paper-mechanisms`；[结果与边界](audit/mechanism-checks-20260917/README.zh.md)。
