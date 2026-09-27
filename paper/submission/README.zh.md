# 投稿材料（JSS 定位成稿审阅版）

正文与证据收束已完成；这不是已提交或保证录用的声明。

- `highlights.txt`：四条研究要点，每条不超过 85 个英文字符。
- `cover-letter-draft.md`：投稿信正文已写好，未擅自确认原创性、独家投稿或作者同意。
- `author-information.tex.txt`：从原稿保留作者信息，需作者确认顺序、单位与通讯作者。
- `../audit/claim-evidence-20260917.md`：主张—证据映射。
- `../../output/pdf/migration-paper-retrospective-review.pdf`：19 页、6 张图的编译审阅稿（生成文件，不作为原始实验数据）。

## 有限的最后确认

作者确认署名、贡献、经费、利益冲突与提交同意；通读并接受当前克制的结论；最终入口核对格式和匿名要求，确定固定公开版本及材料再分发权限。仓库有 MIT LICENSE，但不因此推定所有外部材料均无额外约束。

官方指南：<https://www.sciencedirect.com/journal/journal-of-systems-and-software/publish/guide-for-authors>。本轮访问返回 403，因此稿件采用通用单栏审阅版，没有声称通过当前 JSS 格式检查。

两种跨模型家族的 LLM judge（Claude Opus 5.5、GPT-5.5）均已对 64 份回答完成未提供条件标签及原始分数的重判（回答正文可能部分透露条件）；这不是独立人工评分。现有材料记录了初始 AI 辅助重点复核及作者报告的后续人工确认；尚无独立逐项人工评分表，因此不能计算人工一致率。64 份回答的契约统计沿用原 judge 判定，跨模型重判作为单独敏感性分析报告，不把任何一个模型结论当作真值。

## 本轮技能评审与图表

- `../audit/supervisor-review-20260924/REVIEW.zh.md`：按 Supervisor-Skills 的投稿前评审和图表设计视角检查，记录修复项与剩余研究局限。
- 两张新增矢量图来自已有归档数据；重建：`node paper/scripts/generate-review-figures.mjs`，漂移检查：追加 `--check`。
