# When Does a Migration Skill Help?

当前标题：**A Retrospective Study of Version-Pinned Plugin Migration**。

2026-09-15 本轮收束：保留五组历史配置的绝对增益倒 U 作为探索性观察，不主张模型能力导致倒 U，也不把高基线组的小增益解释为不会使用 skill。主贡献是版本迁移 benchmark 与可复算的回顾性配对分析；四条件设计已移入附录，未执行、不作为实证贡献。

当前唯一执行入口：[倒 U 工作建议与投稿前清单](INVERTED-U-WORKPLAN.zh.md)。先做已有数据重分析和评分复核，是否追加统一三档实验由检查结果和预算决定。已删除相互冲突的旧计划。改稿历史见 [修改记录](audit/REVISION-2026-09-15-retrospective.zh.md)。

[English README](README.md)

## 目录结构

- `latex/` — 报告 LaTeX 源码
  - `acl_latex.tex` — 主文件（标题、作者、摘要、全文骨架；基于官方最新模板）
  - `acl.sty` / `acl_natbib.bst` — ACL 官方样式（acl-org/acl-style-files master，2026-06 版）
  - `custom.bib` — 正文使用的参考文献；完整相关工作复核仍待完成
  - `formatting.md` — 官方格式说明

## 编译

```bash
cd latex
pdflatex acl_latex && bibtex acl_latex && pdflatex acl_latex && pdflatex acl_latex
```

使用 [Overleaf](https://www.overleaf.com/) 时，同时上传 `latex/` 和 `generated/` 并保留相对路径，选择 `latex/acl_latex.tex` 为主文件。当前使用 `review` 模式（带行号）。

## 主结果表（生成，勿手改）

论文主结果表来自确定性管线：**勿手改**。

- 数据源：`benchmark/results/paired-effect-stats.json`，由 `benchmark/scripts/measure-paired-effect.mjs` 生成（任务级配对差值，mulberry32 seed 20260907，10000 次 bootstrap，双侧 Wilcoxon；内嵌输入文件 SHA-256）。
- `paper/generated/paired-effect-table.tex`（主表 5 个模型点）与 `paper/generated/paired-effect-sensitivity-table.tex`（luna 污染组）由 `paper/scripts/generate-paired-effect-table.mjs` 从该 JSON 渲染，分别 `\input` 进 Results 章与敏感性附录。

在仓库根目录重新生成 / 校验：

```bash
npm run measure:benchmark-paired   # 重算统计并写 JSON
npm run generate:paper-paired      # 从 JSON 渲染 .tex
npm run check:paper-paired         # CI 门禁：两者字节级漂移检查
npm run test:benchmark-paired      # 统计脚本单元测试 + golden 校验
```

GLM 稳健性表（`paper/generated/glm-robustness-table.tex`）消费已合并的 #238 结果 `benchmark/results/glm-pair-stability.json`，脚本只渲染已提交数字、不重新分析，并在输入哈希漂移时拒绝生成：

```bash
npm run generate:paper-glm-robustness   # 从 #238 JSON 渲染稳健性表
npm run check:paper-glm-robustness      # CI 门禁：表与 JSON 漂移检查
npm run test:paper-glm-robustness       # 渲染/哈希门/漂移单元测试
```

## 当前状态

倒 U 以探索性观察进入主稿；四条件设计仅在附录。统计表可复算，工作稿已编译和检查。评分复核、稳健性分析和投稿材料整理尚未完成，统一在[工作建议](INVERTED-U-WORKPLAN.zh.md)中维护。

## 相关资源

- Benchmark 任务与判分：`../benchmark/`
- Skill 语料：`../skills/`
- 官方样式来源：[acl-org/acl-style-files](https://github.com/acl-org/acl-style-files)
