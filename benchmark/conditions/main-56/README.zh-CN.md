# main-56 四条件实验材料

状态：**prepared-not-frozen**。仅完成材料准备，未启动模型、API 或正式实验，也未认证 56 题准入、信息量相等或独立泛化。材料供计划中的 2 配置 × 56 题 × 4 条件首次运行使用；实际挂载与配置仍须预演验证。

| 条件 | 首次注入 | 按需读取 | 含义 |
|---|---|---|---|
| A | A/injection.txt（0 字节，不加占位说明） | 无 | 无注入资料 |
| B | B/injection.md | 无 | 通用软件迁移流程 |
| C | C/injection.md | C/references/、C/facts.md | 原始同源卡片/文档及事实补充 |
| D | D/injection.md | D/references/、D/facts.md | 同源事实范围加实验版 distilled plugin-upgrade 程序 |

D 的入口是从当前 plugin-upgrade/SKILL.md 改编的 12 段程序，不是原 SKILL 的原样复制；原版保存在 audit-only/source/plugin-upgrade/。C 不是把同一 SKILL 改名：它没有这 12 段有序程序入口，保留原 references 和声明式 facts.md。C/D 参考文件及补充逐字节相同。fact-coverage.csv 将每段程序映射到事实补充和原来源，并逐文件登记全部参考语料。该表是作者覆盖映射，独立语义审查仍待做，不能证明所有隐含事实已完全相等。

## 注入和隔离

每次运行只将对应 A/B/C/D 目录挂载为 /experiment/materials，按表注入入口文本；C/D 可用同一文件检索工具按需读取目录内容。不得把整个 benchmark/conditions/main-56、仓库根或 audit-only 挂入任务容器。A 不注入材料路径提示。B 只注入通用文本，不含 DSH 专用 API、卡号、版本或包名。

所有组的工具、上下文上限、时间和资源预算必须在同配置内相同。**本包不向任何组提供 plugin-upgrade helper 脚本**。参考文档保留指向脚本/例题的原链接，但目标不在运行材料中，不允许据链接取回。任务 fixture 自带 build/test 等工具应四组对称可用。这样衡量的是材料效用，不是 D 独有执行器效用。tool-policy.json 只是需落实的规范，尚未改 runner 或证明沙箱隔离。现有自动发现技能、全仓库检索、共享记忆、网络检索都可能污染条件，必须在预演中验证关闭或按统一白名单隔离。

## 来源、暴露与排除

原始 plugin-upgrade 全目录逐文件存入 audit-only/source/，source-manifest.json 记录原路径、保存路径和 SHA-256。来源是本地工作树当时的文件，不能称为上游重新核验；Git HEAD 仅作背景，各文件 hash 是内容身份。原脚本、evals、examples、原始中英文 SKILL 均不挂载，B 也不能读取审计源。

排除整个 examples/、evals/ 和 scripts/，防止专门例题、参考答案及检查实现直接作为材料暴露；不因此宣称无答案泄漏。原 references 已含 migration recipe、真实迁移 field note、扫描模板和可直接帮助答题的补丁示例，precision-checklist.md 还明确讨论 /app/fixture/ 与评分落地。这些原样保留于 C/D，属于开发来源暴露。没有把 reference 中嵌入的例子删掉后伪称原始文档。正式报告必须保留逐题暴露账本，来源重叠题只能支持固定池材料效用，不支持独立未见泛化。尚待对 56 题做人工逐题答案/同源事件重合核查；若发现禁止的测试专属答案，需要对 C/D 对称剔除并重新生成 hash 后才能冻结。

由于 C 本身含 recipe 和检查流程，D−C 表示共享语料上增加显式组织与执行指导的增益，不能称为“所有程序知识有/无”的纯消融。D 额外篇幅也可能影响结果，不能声称可见 token 或信息量相等。

B 为已经接触 DSH 材料的本次助手撰写，仅在表面内容上保持通用；**不是盲生成**。B 的领域中立性与 C/D 覆盖均需独立审核，审核身份与结论在冻结前另行登记。

## hash 与 token

material-manifest.json 列出各组所有实际可见文件的 SHA-256、字节数、Unicode 字符数和空白分词数。组级 aggregate_sha256 是按相对路径排序后，将每项 `path + TAB + sha256 + LF` 拼接为 UTF-8 再 SHA-256。manifest.sha256 校验 material-manifest.json 本身；source-manifest.json 单独记录来源。artifact-checksums.sha256 覆盖包内除其自身外的全部文件，供审计归档校验。

空白分词数**不是模型 token 数**。token_count 为 null，须在两个完整配置确定后使用各自实际 tokenizer/序列化方式计量首注入与可访问上限；真实读取和截断量来自运行轨迹。没有按任意估算把组间长度配平。不同的 corpus 长度是登记的处理差异。

冻结前必须完成：独立 B 审核、C/D 隐含事实和逐题暴露审查、token 计量、两个配置和 K 子集登记、权限/隔离预演、材料 hash 写入正式协议。本目录没有执行正式运行的授权替代作用。
