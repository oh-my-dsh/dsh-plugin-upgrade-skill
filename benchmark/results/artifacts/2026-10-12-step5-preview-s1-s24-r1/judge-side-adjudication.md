# Step 5 Preview · 判分侧 roaming 重裁定（judge-side adjudication）

日期：2026-10-15 · 裁定人：判分侧（DSH 会话）· 依据：run-manifest.json 的 roaming_audit 与逐格 execution_notes 人工核验记录

## 原则

1. **信息获取为零的访问不构成污染**：审计器命中但目标路径不存在（打错字的 `-s24-r1`/`skills` 双 s）、或命中物是 grep 正则字符类/路径字面量/无文件系统访问的环境探针——实质均未触及任何答案物料，判 **re-admit**。
2. **参数风格问题**：glob 工具未传 `path` 参数但 pattern 本身就是格内绝对路径；`git -C <repo-root> status -- <fixture>` 自检——实际读取范围合法，判 **re-admit**。
3. **真实越界写保留 invalid**：向容器外（系统 TEMP）写探针脚本违反 WORKSPACE BOUNDARY 字面规则——即使无信息泄露、意图良性，按协议硬规则判 **invalid 保留（0 分）**，供论文敏感性分析单独标注。

## 裁定表（20 格）

| 格子 | 违规类别 | 裁定 | 依据 |
|---|---|---|---|
| S1/skill | UNC_RE 字符类（grep `[/\]`） | **re-admit** | 编排者已逐条人工核验为正则字符类，非 UNC 访问 |
| S2/skill | UNC_RE 字符类 ×4 | **re-admit** | 同上（09:54Z 注记） |
| S3/skill | glob 无 path、pattern 为格内绝对路径 | **re-admit** | 参数风格，实际范围合法 |
| S4/skill | 空参数 write（流式残片） | **re-admit** | 10:18Z 注记：流式伪影，随即重试成功 |
| S9/noskill | glob 无 path（已取消的配额中断会话） | **re-admit** | 取消会话的参数风格命中，非完成态违规 |
| S9/skill | `git -C repo-root status` 自检 | **re-admit** | 良性自检，无答案物料接触（09:04Z 注记） |
| S11/noskill | DRIVE_RE 路径字面量 ×10（node -e 参数） | **re-admit** | 09:33Z 注记：全部为探针脚本的路径字面量参数 |
| **S11/skill** | (a) 环境探针 FP + **(b) 真实越界写**（TEMP/s11-probe.js） | **invalid 保留** | 真实容器外写，违反边界字面规则；读全在界内，敏感性分析单独标注 |
| S13/noskill | glob 无 path（绝对 pattern） | **re-admit** | 09:53Z 注记：参数风格 |
| S13/skill | glob 风格 + 不存在路径误击读 + git 自检 | **re-admit** | 误击路径不存在（零信息），其余参数风格 |
| S14/noskill | glob 无 path | **re-admit** | 10:05Z 注记：格内 pattern |
| S15/noskill | node -e 进程内探针 ×3（无 FS 访问） | **re-admit** | 10:19Z 注记：假阳性 |
| S16/skill | 断电被杀会话的不存在路径读；重跑会话干净 | **re-admit** | 11:45Z 注记：违规来自被杀首试；完成态干净 |
| S17/noskill | `git -C repo-root status` ×2 | **re-admit** | 11:45Z 注记：良性自检 |
| S17/skill | 不存在路径读 ×2（双 s / 缺 -s1） | **re-admit** | 零信息获取 |
| S18/noskill | glob 无 path | **re-admit** | 参数风格（同族） |
| S18/skill | bash 引用 repo 根（自检族） | **re-admit**（低置信） | 无独立注记；与 S9/S17 自检同族，标注低置信 |
| **S19/noskill** | **真实越界写**（TEMP/s19_zstd_forensics_check.py） | **invalid 保留** | 容器外写 |
| **S19/skill** | **真实越界写** ×2（TEMP/s19-splice-check.ps1 等，来自 504 中断会话） | **invalid 保留** | 容器外写；报告产出读全在界内 |
| S23/skill | 不存在路径读（`step55` 笔误） | **re-admit** | 08:46Z 注记：零信息获取 |

## 计分集合

- **计分格**：45/48 = ok 25 + relaunched 3 + re-admit 17
- **invalid（0 分）**：3 = S19/noskill、S19/skill、S11/skill（均为真实越界写；无答案物料接触，敏感性分析用）
- 双臂对称性影响：invalid 中 noskill 1 格、skill 2 格——skill 臂损失略大，论文中如实报告。

## 备注

- 本裁定只改判分侧的计分集合；run-manifest.json 与 cell-ledger.md 保持编排者原始记录不动（重裁定在上表留痕）。
- 审计器 UNC_RE/DRIVE_RE/path-less-FSCMDS/glob-argument 四类误报的根治修法已另文记录（.step5-unc-fixup.md），供下一轮基准使用。

## �����ö���2026-10-16��adjudication follow-up��

�������ܣ���д�������ʾ�ʣ�����Ĵ�����

| �� | ���ܽ�� | �ö� |
|---|---|---|
| S11/skill | clean��21m27s���ϲ��ھ��� | **re-admit �Ʒ�**�������ܲ��������зּ��� |
| S19/skill | clean��5m33s��ledger 87m57s Ϊ���� attempt �ĺϲ���Ծʱ�䣩 | **re-admit �Ʒ�** |
| S19/noskill | �� invalid:roaming | **ά�� invalid��0 �֣�**�������ܳ����������� TEMP д��ͬ����Υ�棺solver ���ƴ�� cell Ŀ¼����update��upgrade����� cell �� read/**write**��ע����������������������·�������ڡ���������״̬�ı䣨�� re-admit��������ƴ��Ŀ¼�� **write ����ʵ��������·��**����ʵ��Խ��д�������ھ���ȫ���ϲ� / ���Ự������ invalid����д�������Ч���� TEMP/��Ŀ¼д��̽��ȫ�ڸ��� tmp-probe/���� |

�Ʒּ��ϱ����48 �� = ok 25 + relaunched 3 + rerun 2 + re-admit 17 + invalid **1**��S19/noskill����ԭ��invalid 3 �񡹿ھ���ʣ 1 ��
