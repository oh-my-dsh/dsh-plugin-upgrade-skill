# 全量契约分层分析：64 份回答、328 项原始判分

这张表覆盖整个固定实验，不挑选正向或失败案例。分类单位为原 rubric 标准的主要契约领域；同一标准只计一次。**full credit 是原 judge 的判定，不是已执行的正确性验证。** 不将此分析写成 64 份人工或 AI 独立重判。

| 契约领域 | 涉及任务 | 每臂标准数 | 无 Skill 满分标准 | 有 Skill 满分标准 | 无 Skill 加权得分 | 有 Skill 加权得分 |
|---|---:|---:|---:|---:|---:|---:|
| Version and release applicability | 6 | 12 | 8/12 | 12/12 | 92.50% | 100.00% |
| API, data and ownership contracts | 13 | 46 | 35/46 | 45/46 | 90.11% | 98.90% |
| Lifecycle, ordering and deployment | 9 | 26 | 24/26 | 25/26 | 96.30% | 98.15% |
| Safety and boundary handling | 5 | 10 | 10/10 | 10/10 | 100.00% | 100.00% |
| Failure attribution | 11 | 32 | 32/32 | 32/32 | 100.00% | 100.00% |
| Evidence, verification and provenance | 14 | 38 | 31/38 | 36/38 | 90.33% | 97.33% |

各领域含不同题目和权重，不能用领域间均值比较难度；任务可能跨领域，任务数不可相加。每臂含两次重复，标准数也不等于独立样本量。

10 份重点复核的局部替换敏感性保持单独报告。S6 r2 的新增全文检查在 case-notes.md 中记录，不静默扩充原先冻结的 10 份复核样本。

复算：`node paper/scripts/analyze-contract-coverage.mjs --check`。结构化文件保留全部报告、rubric、verdict 的 SHA-256 和逐项原判理由。
