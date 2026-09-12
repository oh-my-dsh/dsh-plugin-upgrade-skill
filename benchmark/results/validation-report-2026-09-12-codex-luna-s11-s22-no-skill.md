# S11、S13、S14、S16–S22：Codex＋gpt-5.6-luna无skill实跑

10份报告均获得有效评分，合计842.5/1000，平均84.25分，5题满分。
9题完成作答；S17在300秒时限内已写出报告并完成文件检查，但最终回复未结束，Harbor记录为超时。其0分来自语义rubric封顶，不是超时扣分。

## 运行条件

2026-09-12，作答使用Codex CLI 0.153.4、gpt-5.6-luna、xhigh，Harbor 0.22.0的Docker隔离容器，并发3题。S20作答上限900秒，其余300秒。
评分使用独立Codex登录进程、gpt-5.6-luna、high，并发2题。评委禁用工具、skill、记忆和用户配置；本次验证的是Codex评分通道，没有运行Docker verifier的HTTP API通道。

题目和rubric冻结自运行时工作区的任务4.0.0、report-judge-v2，基础HEAD为f32175d46c39fe6dae049834255a25448661d332。提交PR时已基于a43afbe，并将这10题元数据版本升至4.1.0，以区分主线先前已合并的rubric；10份判分packet与实跑快照逐字节一致。模型运行过程中未调整题面、fixture、评分项、权重或封顶。
Harbor关闭内置评分后仍校验HTTP评委环境变量，因此仅在临时任务副本移除未使用的verifier.env声明；原task.toml另存为source-task.toml。所有证据和时限保持原样。

## 分数

| 任务 | 分数/100 | 作答耗时/秒 | 作答状态 | 评委给出的扣分理由 |
|---|---:|---:|---|---|
| [S11](artifacts/2026-09-12-luna-s11-s22-zero-skill/S11/reports/report.md.txt) | 90 | 195.02 | 完成 | 回归矩阵未明确覆盖动态导入失败后的代码块fallback，扣10分。 |
| [S13](artifacts/2026-09-12-luna-s11-s22-zero-skill/S13/reports/report.md.txt) | 100 | 80.98 | 完成 | 全部评分项通过。 |
| [S14](artifacts/2026-09-12-luna-s11-s22-zero-skill/S14/reports/report.md.txt) | 100 | 138.84 | 完成 | 全部评分项通过。 |
| [S16](artifacts/2026-09-12-luna-s11-s22-zero-skill/S16/reports/report.md.txt) | 100 | 128.54 | 完成 | 全部评分项通过。 |
| [S17](artifacts/2026-09-12-luna-s11-s22-zero-skill/S17/reports/report.md.txt) | 0 | 300.15 | 超时，有报告 | 分项80分；最终建议直接注册跨entry slot、遗漏slots.inject，触发0分封顶。 |
| [S18](artifacts/2026-09-12-luna-s11-s22-zero-skill/S18/reports/report.md.txt) | 100 | 205.03 | 完成 | 全部评分项通过。 |
| [S19](artifacts/2026-09-12-luna-s11-s22-zero-skill/S19/reports/report.md.txt) | 100 | 187.83 | 完成 | 全部评分项通过。 |
| [S20](artifacts/2026-09-12-luna-s11-s22-zero-skill/S20/reports/report.md.txt) | 82.5 | 170.21 | 完成 | 补丁项12.5/25：遗漏allowBuilds，且建议调用时throw；卡号写为A1-S20而非A1-03，该项0/5。 |
| [S21](artifacts/2026-09-12-luna-s11-s22-zero-skill/S21/reports/report.md.txt) | 80 | 124.86 | 完成 | 误述loader为逐模块请求而非有界combo分组；未明确拒绝重复插入已有服务，各扣10分。 |
| [S22](artifacts/2026-09-12-luna-s11-s22-zero-skill/S22/reports/report.md.txt) | 90 | 59.24 | 完成 | 未明确区分启动恢复与此前资源读取问题仍待验证，扣10分。 |

表内耗时为各题选用作答的agent_execution时长，不含环境安装、排队和评分，也不是整批墙钟时间。S17的报告分数纳入上述报告评分均值；成功完成作答的数量单独记为9/10。
S20的warn/no-op回调和allowBuilds要求来自封存的DSH-0.1.3-A1-03参考节录。该节录仅由评委读取，未注入无skill作答环境。所有分数保留模型首次有效判定，没有人工改分或因低分重跑。

## 网络故障与重试

第一批发生DNS/网络中断。S13成功写出原报告；S11、S14在调用模型时持续重连，最终无报告；其余7题在apt依赖安装时因无法解析deb.debian.org失败，未进入模型作答。S13的首次评委调用也因无法解析模型服务地址而超时。

宿主与Docker DNS恢复后，保持相同模型、effort、时限、题目和rubric，重跑上述9个受影响任务；S13不重新作答，只重新评分。因此实际有19个Harbor trial，其中7个只到环境启动阶段，最终每题选用一份报告。初次失败产生的“无报告0分”未当作模型答错或混入选用结果。失败记录完整保存；S17恢复批次的真实作答超时不再重跑。

## 逐轮耗时与用量

下表按Harbor原始job/trial输出计算；输入已包含缓存。第一轮7个环境启动失败样本未调用模型，其余3个有用量记录。评分器用量另存各题judge.details.json，不计入下表。

| 轮次 | Trial数 | 整轮墙钟/秒 | Trial耗时合计/秒 | 输入token | 缓存token | 输出token |
|---|---:|---:|---:|---:|---:|---:|
| 第一轮：网络中断 | 10 | 2374.497 | 6319.814 | 133,425 | 67,584 | 6,495 |
| 第二轮：恢复后重跑 | 9 | 872.507 | 2541.410 | 826,665 | 523,776 | 69,413 |

并发执行使Trial耗时合计大于整轮墙钟。记录见[rounds.json](artifacts/2026-09-12-luna-s11-s22-zero-skill/rounds.json)。

## 无skill和证据边界

- Harbor的agent.skills和顶层skills均为空；关闭skill指令注入、bundled skills、宿主skill发现、skill搜索、记忆、插件和多agent，额外指令明确禁止读取任何skill。
- 10份原生作答轨迹均确认gpt-5.6-luna/xhigh，skill指令块为0。所有skill路径命令匹配均已人工检查，都是排除SKILL.md或skill目录的glob/否定路径，没有实际skill读取。
- 10题fixture与封存哈希完全一致；所有冻结文件复核无漂移。评委轨迹均为gpt-5.6-luna/high，工具调用为0。
- 保留原任务public网络策略，关闭provider web search；不将本次描述为网络强制隔离的闭卷评测。
- 单次、同模型独立进程评分只反映这批报告的判定；不等同于完整对抗校准，也不用于推断skill收益。

选用作答的Harbor记录合计：输入886,047token，其中缓存558,592；输出72,352token。缓存已包含在输入中。Harbor估算费用为$0.163485，不含失败尝试和评委费用，也不是账户实扣金额。

## 可复查证据

[机器可读汇总](artifacts/2026-09-12-luna-s11-s22-zero-skill/summary.json)、[运行配置](artifacts/2026-09-12-luna-s11-s22-zero-skill/config.json)、[冻结文件哈希](artifacts/2026-09-12-luna-s11-s22-zero-skill/provenance.json)、[归档哈希](artifacts/2026-09-12-luna-s11-s22-zero-skill/sha256.json)、[题目与判分器快照](artifacts/2026-09-12-luna-s11-s22-zero-skill/source-snapshot.tar.gz)。

每题目录保存原报告、solver事件与原生轨迹、模型评分输入/输出/原生轨迹、分项详情和审计。原报告只追加.txt扩展名以避免文档检查器将容器路径当仓库链接，内容逐字节保留，原文件名及SHA-256记录在summary.json。
首次网络中断证据位于interrupted-attempts目录；未归档认证文件。

10份报告和所有冻结文件均通过SHA-256复核；25个评分入口同步检查通过。运行时原工作区的文档检查曾被另一个未提交S4实验报告的6处链接阻断；该无关文件未带入PR。

在最新main的独立PR工作区，完整`npm test`通过，包含两个仓库校验器、63题配置检查和106项评分器测试。
