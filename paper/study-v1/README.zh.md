# 四组候选材料与旧实验兼容性

**保留的可选四条件设计，尚未冻结或执行正式实验。** 当前论文保留历史配置的探索性倒 U；唯一执行清单见 [倒 U 工作建议](../INVERTED-U-WORKPLAN.zh.md)。本目录不是倒 U 三档实验的既有运行协议。

主问题：**有限推理预算下，迁移 skill 相比包含相同关键事实的原始资料，能否提高小模型的版本迁移正确性？** 主比较为 D−C，D−A 和 B−A 作辅助；范围为单生态、回顾性效用研究。

## 本次实际交付

当前版本 **document-only-r2**。已完成 [材料收尾、评分 QC 与预演准备](qc/QC-AND-PILOT.zh.md)：替换原混合段落和版本摘要、同步清理评分导向文字、去除缺失 helper 指令。90 项评分相关测试通过，真实 H25 运行时完成 6 个合成对照。16 格仅完成本地准备，Docker 与实际模型预演尚未通过。

- [候选材料清单](generated/MATERIALS.zh.md)：56 个候选任务、3 个资料版本、每版 A/B/C/D 四组。
- [兼容性清单](generated/COMPATIBILITY.zh.md)：逐份审查 37 份历史报告；详细来源、哈希与输入比较在 [compatibility.json](generated/compatibility.json)。
- [候选材料 ZIP](../../output/study-v1-candidates-20260913-document-r2.zip)：包含实际材料、统一后的任务提示和 manifest，可解压检查；尚不是完整实验 runner。
- [事实覆盖审核底稿](generated/fact-coverage-review.json)：101 个入口正文审核单元，保留机械摘录；实际首轮决策另存 review/entry-review.json，尚未全部通过原子事实审核。
- [产物完整性与隐私清单](ARTIFACTS.md)：只读生成确定性 SHA-256 manifest（相对路径，无时间/主机/用户名），并扫描凭据与用户目录路径；原始产物留在本地，只提交脱敏摘要。

**候选材料可复现，正式实验未冻结。** 本次没有执行 solver、收费 judge 或真人标注；历史判定 JSON 仅做确定性汇总重放，H25 使用合成对照。旧任务、评分器和原始结果未修改。

## 四组内容与边界

| 组 | 实际候选内容 |
|---|---|
| A | 中性入口，说明没有迁移资料 |
| B | 中性入口 + 固定版本 generic-migration 正文 |
| C | 中性索引 + 同源 references（记录适配差异）+ 共享事实补充 |
| D | 中性索引 + 纯文档适配迁移流程 + 与 C 逐字相同的 references 和事实补充 |

沿用已有标注 inventory 的全部 56 个成员，不按成绩挑题；任务内容固定在 config.sourceCommit。H11/H21 分别遵循 task.toml 的历史 skill pin，其余 54 题使用默认版本。三版资料不能任意混用，manifest 已指定每题所属版本。

C/D 的 references 与事实补充逐字一致。新版 D 已移除原入口的版本事实摘要，改为有来源记录的流程适配，47 个原待办单元的处理见 review/entry-resolution-r2.json。它不再是未修改的原 skill；参考资料本身也包含流程，故 D−C 解释为增加入口指导的效用。早期 ZIP 保留，document-r2 ZIP 是当前候选。独立人工认证和运行时可行性不能由文件相同推导。

本次不打包 scripts、examples、答案、裁判或其他 skill。未供应附件的导航链接已去掉，缺失 helper 改用普通工具表述；实际可执行性仍需容器预演。字节数不是 token，实际分词长度和读取量仍需测量。

56 题均附加相同材料权限段；其中 H6、S4–S7 的闭卷冲突句被替换。实际运行必须使用新提示、同一只读挂载路径、相同工具与网络权限，并禁用 native skills。**只能挂载对应 arm 目录，不能把含其他组、任务索引和 manifest 的总包挂给模型。**

## 旧产物怎么用

- GLM 三轮及部分 Luna/Kimi 批次有本地答案，可在核实原始输入与候选完整性后统一重评，用于历史测量审计。逐报告关联共找到 161 份内容不同的答案；这不是独立 trial 数。
- Astra、Qwen 和部分早期实验需要取回原始答案或补丁、fixture、提示、资料和运行配置。只有汇总分数不能重评。
- oracle、裁判校准和部分混杂实验保留为开发证据；不能充当正式模型对照。
- 新主实验更改了提示和材料协议，现有 trial 均不能直接填入新四组主表。仅改评分规则可重评；改模型实际输入、工具或预算，需要重新作答。

## 可复现命令

```bash
python3 paper/scripts/prepare-study-v1.py --check
python3 paper/scripts/audit-study-compatibility.py --check
python3 paper/scripts/prepare-study-v1.py --materialize /tmp/dsh-study-v1-new-candidate
python3 paper/scripts/prepare-study-v1.py --archive /tmp/dsh-study-v1-new-candidate.zip
python3 paper/scripts/prepare-study-v1.py --freeze-check
python3 -m unittest discover -s paper/scripts -p 'test_study_materials.py'
python3 paper/scripts/manifest-study-artifacts.py manifest paper/study-v1 --out /tmp/study-v1.manifest.json
python3 paper/scripts/manifest-study-artifacts.py --privacy-check paper/study-v1
python3 -m unittest discover -s paper/scripts -p 'test_study_artifacts.py'
```

不带 --check 时更新 generated 清单。materialize 和 archive 要求新路径，避免覆盖已分发候选版本。材料目录放在仓库外，ZIP 可以保存在 output。freeze-check 当前应失败并列出真实待办，不能靠修改状态字段绕过。

## 接下来要补什么

1. **运行环境**：恢复 Docker daemon，执行已准备的容器权限探针。材料适配已完成，暴露历史继续公开记录。
2. **评分 QC**：四题优先审查已记录；接下来在最终裁判上运行预定语义校准，并补其他任务的 QC。H25 行为与 helper 形状分开，历史分数不覆盖。
3. **审核记录**：按实际情况记录“贡献者自查 + 维护者复核”。目前没有生成或完成双人评分包。
4. **配置与预演**：固定两个可用便宜模型、scaffold、输入/输出与时间预算、隔离方式、重复次数和统计口径；先在预先选定的开发题上检查四组能否正常运行并估算成本。
5. **冻结后主实验**：N 题 × 2 模型 × 4 组 × R 次，共 8NR 次。R=3 只是待核价方案，N=56 时为 1,344 次；最终 N 由事先约定的 QC 标准决定。正式成绩出来后不能挑题或只追加表现不理想的一组。

没有独立人工标注时，论文应明确其局限，不报告独立标注一致性；独立事件泛化、跨生态与昂贵模型暂不作为主论文必须补的实验。最终模型和总预算仍需由维护者确定，其余材料审核、清单维护和脚本工作可以继续推进。
