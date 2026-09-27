# Supervisor-Skills 投稿前评审与修订记录

日期：2026-09-24。对象：`paper/latex/acl_latex.tex` 及其实际引用的生成表格、图形、参考文献和编译 PDF。评审者为参与本轮修订的 Codex；这是 AI 辅助自查，不是独立同行评审，也不是新增的实验 judge 数据。

## 使用的技能与判断口径

按用户指定的 [Supervisor-Skills 仓库](https://github.com/HKUSTDial/Supervisor-Skills) 中以下技能执行，本轮读取远程文档，未安装到本地技能目录：

- [pre-submission-reviewer](https://github.com/HKUSTDial/Supervisor-Skills/blob/main/skills/pre-submission-reviewer/SKILL.md)：研究定位、逻辑和章节结构、实验解释、语言、LaTeX 与图表；同时参考其 logic-and-structure、grammar-rules、latex-rules、forbidden-patterns、section-guides 文档。
- [figure-designer](https://github.com/HKUSTDial/Supervisor-Skills/blob/main/skills/figure-designer/SKILL.md)：参考 design-rules，检查证据、编码、坐标轴、字号、矢量输出及可独立阅读的图注。

本文应按软件维护的回顾性案例研究审阅。核心贡献是将契约、回答、原始评分、复核与机制证据连接起来；当前设计无法支撑一般方法优越性、生产修复成功率或跨模型能力规律。没有为了套用机器学习方法论文模板而补造控制实验。

## 结论

本轮修订后，作为**供作者通读的案例研究审阅稿，完成度 7/10**（主观编辑判断，不是录用概率）。建议：进入作者审阅；若要强化因果归因或一般化主张，则仍需补实验。未发现尚未处理的 CRITICAL 表述/编译问题；保留两组 MAJOR 研究证据限制，见下文。署名、期刊模板和作者声明仍是提交前事项。

## 本轮已修复

| 严重程度 | 位置与原问题 | 修订与核查 |
|---|---|---|
| MAJOR | 摘要、§4.3、§5.3：“blinded”容易被理解为完全盲化；正文仍可能透露条件 | 摘要明确未提供 arm 标签及原分数，但回答文本部分透露条件；方法保留会话结构和暴露记录；明确模型家族与会话结构共同变化，无法分别归因 |
| MAJOR | §5.3：91.8%/95.7% 一致率容易被误读为准确率 | 增加原判 300/328（91.5%）满分的基率背景，与加权 κ 一起解释；强调共享 rubric、没有独立人工真值、每配置只评一次 |
| MAJOR | 图1：过度简化的路径谓词忽略绝对路径条件；复核符号容易暗示完整正确性认证 | 改成非绝对相对路径下的简化条件；明确 literal `..` 被接受；将复核写为 partial credit 和 probe 确认的 parent escape |
| MINOR | 贡献段、图1图注、讨论中的固定章节数字已与现有章节错位 | 增补语义 label，换成 LaTeX ref；扫描无缺失或重复标签 |
| MINOR | 方法与结果中的长段混合协议、暴露、指标、解释 | 分段呈现；修正“analysis plan ... recomputed”的主语；替换两处模糊的 reveal；禁用表达和 em-dash 扫描无命中 |
| MINOR | 原图3：S1 横轴标签遗漏，图例遮挡最高柱的数值 | 显式列出全部16个刻度；图例移到右上，标出42.5；提高刻度和图例字号，重新渲染检查 |
| MINOR | 契约域与跨 judge 敏感性主要靠表格展示 | 新增图4和图6，读取已归档 JSON；保留精确数值表，并明确样本单位、区间含义与依赖关系 |
| MINOR | 相关工作对一致性与有效性的区分可更直接 | 加入 Norman、Rivera、Hughes (2026) 的相关研究，核对题名和作者；只引用定性区分，不移植其数值结果 |

新增文献依据：[Reliability without Validity](https://arxiv.org/abs/2606.19544v1)。已有相关工作的定位核对涉及 SkillsBench、SWE-Skills-Bench、WebDev-Skills-Bench、VersiCode、CODEMENV 及 SkillLens 的原始论文/项目页面；本轮不是系统综述或穷尽性新颖性检索。

## 六张图及其作用

| 图 | 内容 | 证据与设计 |
|---|---|---|
| 1 | S11：契约、缺陷建议、评分落差 | 动机案例；区分原评分、定向复核和可执行反例 |
| 2 | 任务抽取、两组运行、评分与三类分析 | 研究流程；显示16任务、64回答、328判定，不新增实验 |
| 3 | 16任务的平均分变化 | 展示天花板和S1的42.5分增益；完整刻度及直接数值标注 |
| 4（新增） | 六个契约域的满分比例 | `recorded-contracts.json`；0–100%刻度、圆/三角双编码、每组分母；说明它不是正确率 |
| 5 | 定向复核替换判定的敏感性 | 原始与两种部分替换结果，显示跨零/触零区间，不把复核当完整真值 |
| 6（新增） | 三种 judge 配置与两个均值汇总 | `llm-judge-panel.json`；实心标记为单 judge，空心为汇总，虚线分隔；显示 task-bootstrap CI，不宣称 judge 总体不确定性 |

图4各域每组分母依次为12、46、26、10、32、38，合计164；两组合计328。原始满分计数分别为8→12、35→45、24→25、10→10、32→32、31→36。图6的均值汇总与单 judge 共用回答，明确不是额外独立样本。新图为 PGFPlots/TikZ 矢量图，使用形状和颜色共同编码，正文尺寸下刻度约9pt。全稿图形均由 LaTeX 绘制。

## 尚存的研究限制（已写入正文，不能靠文字修复）

1. **MAJOR：干预归因有限。** 技能同时增加资料和程序性指引，没有 raw-document 或 generic-procedure 控制，开发与任务暴露重叠。现有结果只能描述完整技能可用与不可用的差异，不能证明收益来自组织形式。进一步解决需要新的预先固定控制实验。
2. **MAJOR：端点有效性与外推有限。** 16任务、每组两次，任务可能共享事件来源；八个任务处于满分天花板。三个 LLM 共用 rubric，模型与会话协议混杂；作者复核不是独立逐项人工评分；没有完整迁移的端到端执行成功率。独立人工契约判定、事件家族标注及新任务验证才能加强这些结论。当前报告不冒充已完成这些工作。

作者提交事项：确认作者顺序/贡献、经费与利益冲突、AI 声明、固定公开版本及再分发；核对目标期刊当前模板。当前为通用单栏审阅版，未声明满足 JSS 全部格式要求。

## 验证与复现

- Tectonic 编译成功，19页，6张图；未报告未定义引用或编译溢出警告。
- 将全部19页渲染为 PNG 检查整体布局，并单独放大图3、图4、图6及修订后的图3页面；图注、坐标、标记无裁切/遮挡。
- `scan.json` 保存正文及实际 input 文件的扫描范围：禁用表达/长破折号无命中、6个 figure、无缺失引用、无重复标签、无缺失文献键。扫描只是机械辅助，不证明科学结论正确。
- `node paper/scripts/generate-review-figures.mjs --check`
- `node paper/scripts/analyze-contract-coverage.mjs --check`
- `node paper/scripts/summarize-submission-evidence.mjs --check`
- `node paper/scripts/analyze-llm-judge-panel.mjs --check`
- `git diff --check`

新图重建：`node paper/scripts/generate-review-figures.mjs`。编译：`tectonic --outdir output/pdf paper/latex/acl_latex.tex`。稳定交付文件：`output/pdf/migration-paper-retrospective-review.pdf`。本轮不改写原始报告或 judge verdict。
