# Step 5 Preview r3 · 判分侧 roaming 裁定（partial-run，2026-10-17）

## 裁定（沿用 r1/r2 口径）

| 格 | 编排者标记 | 裁定 | 依据 |
|---|---|---|---|
| S5-negative-naming/skill | invalid:roaming | **re-admit 计分** | 两次 glob 的 path 参数设错（指向 skill 目录父级/仓库根），但两个 pattern 均因反斜杠转义失配返回「No files found」——**零信息获取**（r1 误击先例）；全部成功的内容访问（SKILL.md、references、grep）都在允许的 skills\plugin-upgrade 内；solver 是在够取允许材料时设错参数，无答案物料接触 |
| S11-mermaid-lazyload-trap/noskill | invalid:roaming | **re-admit 计分** | 两次命中均为**纯元数据探针**（realpathSync/existsSync 于仓库根的大小写拼写——测量 GetFinalPathNameByHandleW 行为，即本题诊断的 realpath/fileURLToPath 大小写失配机制的实测）；零内容读取、非答案物料路径（r1 元数据探针先例）；测量结果作为活体证据写入报告 |

## 本轮（partial）计分集合

- **计分格 30**：S1–S14 双臂（含上述 2 个 re-admit）+ S16/skill（relaunched）+ S17/noskill
- **未完成不计**（待 4 天后限额恢复，届时终判）：S15 双臂、S16/noskill、S17/skill（silent-failure）、S18 双臂（in-flight）、S19–S24 双臂（pending）
- 注：本轮先以 glm-5.3 判（面板前置，用户指定）；正典 flash 判分与终算在 r3 完成后统一补齐
