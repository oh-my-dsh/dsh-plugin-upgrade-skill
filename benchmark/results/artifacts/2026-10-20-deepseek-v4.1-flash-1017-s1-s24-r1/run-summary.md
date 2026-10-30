# 运行汇总 · DeepSeek-V4.1-Flash-1017

- 模型：DeepSeek-V4.1-Flash-1017（provider: paratera）
- 完成格数：48 / 48
- 总时长（48 格串行口径的 agent 耗时之和）：210 分钟
- 总 token：31,701,384（noskill 9,241,952 / skill 22,459,432）
- 总 toolcalls：628（noskill 244 / skill 384）

## 分臂

| 臂 | 完成格 | 平均时长 | 平均 token | 平均 toolcalls | 报告总字节 |
| --- | --- | --- | --- | --- | --- |
| noskill | 24 | 265s | 385,081 | 10 | 601701 |
| skill | 24 | 259s | 935,810 | 16 | 614815 |

## 逐题（时长 / toolcalls / tokens）

| task | noskill | skill | status |
| --- | --- | --- | --- |
| S1-static-scan | 205s / 11 / 460191 | 301s / 27 / 1947611 | done / done |
| S2-negative-scan | 133s / 8 / 228284 | 237s / 36 / 2468751 | done / done |
| S3-snapshot-migration | 155s / 12 / 330567 | 342s / 37 / 3684126 | done / done |
| S4-legacy-client-imports | 141s / 8 / 231148 | 205s / 14 / 925117 | done / done |
| S5-negative-naming | 75s / 4 / 91934 | 118s / 7 / 253371 | done / done |
| S6-corridor-net-state | 84s / 6 / 133599 | 104s / 10 / 395824 | done / done |
| S7-unpublished-cohort | 97s / 6 / 149048 | 178s / 13 / 566744 | done / done |
| S8-release-routing-trap | 157s / 11 / 339257 | 125s / 9 / 343945 | done / done |
| S9-composer-coordinate-trap | 215s / 11 / 359340 | 207s / 17 / 856071 | done / done |
| S10-paste-rename-and-version-chip | 242s / 17 / 733257 | 284s / 19 / 1142869 | done / done |
| S11-mermaid-lazyload-trap | 287s / 12 / 578392 | 231s / 5 / 276009 | done / done |
| S12-global-upgrade-ebusy-trap | 112s / 6 / 148519 | 310s / 15 / 956830 | done / done |
| S13-peer-range-vs-runtime | 122s / 4 / 112407 | 169s / 16 / 797641 | done / done |
| S14-link-install-lock-trap | 295s / 14 / 599458 | 185s / 15 / 760766 | done / done |
| S15-slot-error-boundary-crash | 221s / 8 / 336144 | 214s / 10 / 495402 | done / done |
| S16-self-host-upgrade-trap | 171s / 8 / 264674 | 241s / 15 / 835733 | done / done |
| S17-external-ui-plugin-onboarding-trap | 214s / 12 / 441005 | 221s / 15 / 889385 | done / done |
| S18-terminal-sprite-render-trap | 1559s / 24 / 1204326 | 1310s / 22 / 918006 | done / done |
| S19-phantom-update-stale-host | 1071s / 14 / 633357 | 345s / 28 / 1639635 | done / done |
| S20-msvc-flock-trap | 233s / 15 / 678292 | 95s / 8 / 265191 | done / done |
| S21-resource-service-unavailable-trap | 151s / 8 / 274582 | 189s / 8 / 371646 | done / done |
| S22-duplicate-insert-boot-crash-trap | 71s / 4 / 102220 | 179s / 13 / 565311 | done / done |
| S23-passing-compat-guard-trap | 195s / 13 / 563570 | 202s / 15 / 620790 | done / done |
| S24-dock-cotenant-crash-trap | 148s / 8 / 248381 | 225s / 10 / 482658 | done / done |

## 异常清单

- S18-terminal-sprite-render-trap/skill：status=done；attempts=1

## 说明

- 产物布局：`<arm>/<task>/fixture/`（密封材料副本，前后 SHA-256 一致）+ `<arm>/<task>/agent-output/<task>/`（solver 报告）。
- `cell-ledger.md` 共 49 行数据：48 行成品格 + 1 行 `S18-skill` 首次尝试的 `error:infra-abort`（提供方 APIConnectionError，无报告），重试后该格正常记入。
- `_runner/` 是本轮编排器的内部文件（lib/tick/state/cells 逐格记录/转录审计结果），判分可忽略；每格完整指标见 `_runner/cells/<task>.<arm>.json`。
- 卡片 ID 引用（主报告内去重计数）：noskill 5/24 格引用（30 个 ID），skill 19/24 格引用（159 个 ID）；skill 臂平均 token 是 noskill 的 2.4 倍，主要来自读取 skill references。
