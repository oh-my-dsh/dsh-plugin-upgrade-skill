# 判官一致性 · GLM-5.3 vs GLM-5.3-Flash · 同一 Astra S1-S24 产物

**双判官重判结论：skill 臂双判官均满分（100/100）；noskill 均分 93.23 vs 93.44（差 0.21）；48 格中仅 5 格出现 ≥10 分差异，且方向分裂（2 格 Flash 更严、2 格 GLM-5.3 更严、1 格小差）——判官代际差异远小于 skill 效应（+6.77）。**

## 结果对照

| 臂 | GLM-5.3 判官 | GLM-5.3-Flash 判官 |
|---|---:|---:|
| skill（24 格） | 100.00 | 100.00 |
| noskill（24 格） | 93.23 | 93.44 |

- 完全一致格：43/48
- ≥10 分差异格：4（noskill.S20、noskill.S23、noskill.S3、noskill.S6）
- 方向：S20/S23 Flash 更严（-12.5/-10），S3/S6 GLM-5.3 更严（-10/-12.5）——无系统性偏移

## ≥10 分差异格明细

| 格 | GLM-5.3 | Flash | 说明 |
|---|---:|---:|---|
| noskill.S20-msvc-flock-trap | 95 | 82.5 | Flash 对 corridor-mapping 要求引用完整 DSH-0.1.3-A1-03 且补 allowBuilds/构建权限要点 |
| noskill.S23-passing-compat-guard-trap | 100 | 90 | Flash 对 pre-ship 验证加严（要求对照 alpha.2 已发布类型） |
| noskill.S3-snapshot-migration | 40 | 50 | Flash 对诚实声明不可编造的候选给了部分认可 |
| noskill.S6-corridor-net-state | 75 | 87.5 | Flash 对 append 缺口的条件式表述给了部分认可 |

## 方法

- 两代判官读**同一批密封简报**（judge-briefs/，各 criterion/cap/candidate report 完整）
- 各自独立裁决 → judge-drive.mjs 按 report-judge-v2 语义聚合（pass=全额/partial=半额/fail、cap 触发封顶）
- GLM-5.3：本会话 6 判官子代理（judge-a..f + 2 重开）；Flash：judge-api 直连 API 通道（judge-out-53f/，温度 0）

## 结论

- skill 效应（+6.77 / +6.56）在两代判官下均稳定成立，方向与量级一致
- 差异格全部落在 noskill 臂的边界评分（partial vs pass 边界），不影响配对结论
- 产物：judge-results-53f.json / judge-out-53f/（48 裁决）/ judge-agree.mjs
