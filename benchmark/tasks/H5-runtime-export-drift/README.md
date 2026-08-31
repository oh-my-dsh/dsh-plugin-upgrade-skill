# H5-runtime-export-drift · settings 运行时导出漂移（hard）

agent 面对一个「本地 install / typecheck / build / test 全绿」的旧 settings 插件：
pack 成 tarball 装进真实 dsh 0.1.2-alpha.2 宿主后冷启动报 named-export 失败
（`@deepseek-ai/dsh-settings` 在 alpha.2 移除了运行时 `settingsNamespace` 导出，
见卡片 [DSH-0.1.2-A2-10](../../../skills/plugin-upgrade/references/v0.1.2-alpha.2.md)
与 ledger [API-03](../../../skills/plugin-upgrade/references/api-migration-0.1.2-alpha.2.md)、
[rollup R-11](../../../skills/plugin-upgrade/references/rollup-0.1.2.md)）。

陷阱：fixture 源码注释诱导「pin 旧版 dsh-settings runtime」或「自制
settingsNamespace shim」——两者 pack 安装后都能**真实 boot 绿**（旧 brand 助手
运行时返回字符串，alpha.2 provider 内部校验照常通过），运行时无法区分，
judge 只能静态封顶。题面见 [instruction.md](instruction.md)，判分逻辑见
[tests/judge.mjs](tests/judge.mjs)。

- **环境**：`node:24-bookworm` + git + 全局 pnpm 11.24.0 / dsh 0.1.2-alpha.2；
  fixture 在镜像构建期按冻结 lockfile 装好 0.1.1-rc.2 旧 cohort，迁移目标
  cohort 同时预热进 pnpm store。
- **Verifier**：judge pack fixture → tarball 装入隔离 profile（dsh-base +
  dsh-headless）→ 真实冷启动；0-100 归一化写 `/logs/verifier/reward.txt`。
- **Oracle**：`harbor run -p benchmark/tasks/H5-runtime-export-drift -a oracle`，
  期望 reward 1.0。

## 分档

| 档 | 条件 |
|---|---|
| 100 | pack/add/boot 全绿，无 pin / shim / 残留引用 / 未对齐 cohort |
| 60 | boot 绿但迁移不完整：仍引用 settingsNamespace，或 devDeps cohort 未对齐 alpha.2 |
| 40 | add 成功但真实 boot 失败（named export / plugin tree failed / pending） |
| 30 | pnpm pack 或 dsh plugin add 失败 |
| 20 | 旧 runtime pin / 自制 settingsNamespace shim（boot 绿也封顶） |
| 0 | fixture 未改，或宿主被降级/篡改 |

## 负控（不依赖模型 API）

| 负控 | 做法 | 期望 reward |
|---|---|---|
| A · untouched | 不动 fixture 跑 verifier | 0 |
| B · old-runtime-pin trap | package.json dependencies 加 `@deepseek-ai/dsh-settings@0.1.1-rc.2`，其余不动 | ≤ 0.20 |
| C · dual/old cohort | 只按参考解法改源码（cast 双编译），devDeps 停留 rc.2 | ≤ 0.60 |
| D · 改了 src 不 rebuild | 只拷贝参考解法 src，不 rebuild（dist 仍旧 import） | ≤ 0.40 |

```
environment/fixture/   # 旧 cohort settings 插件（含诱导注释）+ 冻结 lockfile
tests/                 # judge.mjs + judge-utils.mjs + test.sh
solution/              # 参考迁移（字面量 namespace + alpha.2 cohort）+ solve.sh
```
