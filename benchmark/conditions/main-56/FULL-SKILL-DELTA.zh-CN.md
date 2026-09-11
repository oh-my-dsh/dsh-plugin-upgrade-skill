# 原旗舰包与实验 D 的差异

**D 是 document-only distilled intervention，不是原旗舰完整 skill 包；结果不能称为 full-skill 效果。**

| 项目 | 原 plugin-upgrade 包 | 本实验 D |
|---|---|---|
| 程序入口 | 英文 SKILL.md，17693 字节，含模式、权限、帮助脚本和例题链接 | D/injection.md，4444 字节，重新组织为 P01–P12；无技能自动发现元数据 |
| 原始事实语料 | references/ | 原样复制 19 个文件；同一份也提供给 C |
| 特有事实 | 部分事实位于 SKILL 主体 | 另写 facts.md 的 P01–P12 声明式补充并同值提供给 C/D |
| 工具 | scripts/ 的 planner、runtime checker、inject lint、ghost host 及其检查文件 | 全部不挂载；不得据链接下载；四臂均无专用 helper |
| 例题/评测 | examples/、evals/ | 全部不挂载；references 内嵌案例仍保留，开发暴露未消失 |
| 中文入口 | SKILL.zh-CN.md | 不挂载，C/D 均只用同源英文 corpus |
| 路径 | 技能根下 references/scripts/examples 相对路径 | D 入口只指本臂 references/；原 reference 内链接不改写，落在挂载外的来源链接不可取回 |
| 权限 | 原 SKILL 多处要求执行前确认 | P01/入口遵循任务既有授权与所有条件共享执行策略，不额外设置 D 独有许可；不能将权限差异解释为材料效果 |
| 加载 | 依赖实际 skill-loader 及按需检索 | 入口注入 + 单臂目录检索；runner 尚未实现/验收 |

procedure-transformation.json 与 fact-coverage.csv 登记每段程序的来源和转换。程序文本经过选择、压缩和重排，因此也不等于逐字移除标题的格式消融。此次差异表描述已准备材料，不表示来源事实已获上游或独立审稿人重新核验。
