# 评分细则与考点对照

总分 900（9 题 × 100，harbor reward 为 0~1，由 score/100 归一化）。
所有 judge：exit 0，stdout 末行
`{"score": 0-100, "max": 100, "reasons": [...]}`；`tests/test.sh` 解析末行 JSON，
把 score/100 写入 `/logs/verifier/reward.txt`。

## 题号 → 卡片/R 配方 → 分值构成

| 题号 | 考察点（卡片 / R 配方） | 分值构成 |
|---|---|---|
| S1-static-scan | 七类触点自查（pre-flight.md）；**走廊折叠**：DSH-0.1.2-A1-02 ↔ DSH-0.1.2-A2-01；DSH-0.1.2-A1-01 / A1-03 / A1-04 / A1-08 | 期望卡集 {A1-01, A1-02, A1-03, A1-04, A1-08, A2-01} 每卡 100/6 ≈ 16.7；fixture 被改动直接 0（只读纪律） |
| S2-negative-scan | pre-flight.md 负面清单「扫描不是兼容性证明」；DSH-0.1.2-A1-01 | 命中类映射 A1-01（40）+ 交代零命中类（20）+ 零命中≠兼容（20）+ 声明必须验证（20）；fixture 被改动直接 0 |
| S3-snapshot-migration | DSH-0.1.2-A1-03 会话视图拆分（legacy 投影两步走 / useSession 座 / cordis 类型导入 / slots.inject） | 五要点各 20：legacy 投影、useSession、@deepseek-ai/cordis、slots.inject、卡片 A1-03 引用；fixture 被改动直接 0 |
| H4-tsbuildinfo-trap | migration-hygiene §1（构建缓存假阳性）；DSH-0.1.2-A1-21 实战批注（陷阱反面） | 识别缓存假阳性（30）+ clean 处置（30）+ 源码无需改动结论（40）；src 被改动直接 0（陷阱）；报告含 A1-21 配方式修改（presets/、resolveRecordedPreset）封顶 30 |
| M1-host-migration | DSH-0.1.2-A1-01 宿主平面迁法（inject `llm` + `ctx.llm.listProviders()`）；死依赖清理（#5120 痛点 #2） | 容器冷启动激活 100；改了但仍有 pending / plugin tree failed 40；`dsh plugin add` 失败 30；fixture 未改 0 |
| H1-plane-trap | DSH-0.1.2-A1-01 实战批注「先判平面再选注入名」；验证报告第四节（误换 remote → `pending (waiting for service: remote)`） | 同 M1 分档；另加静态门槛：inject 含 remote 不含 llm → 封顶 20（注释陷阱） |
| H2-baseline-trap | rollup R-06 迁移前 baseline 归因 | 报告含 baseline/预存/豁免归因且与迁移切割（60）+ 容器激活（40）− 偷修预存测试文件（30，保底 0）；fixture 未改 0 |
| H3-client-plane | DSH-0.1.2-A1-01 客户端平面契约（package.json 须声明 `dsh.client`）；DSH-0.1.2-A1-19 验收锚点；DSH-0.1.2-A2-02 RemoteResult（解法内） | `dsh.client` 声明齐（platform=web，40）+ add 成功（10）+ 宿主半边启动无 pending（10）+ `__DSH_BOOT__.entries` 真实出现本插件（40）；fixture 未改 0。注：`dsh.client` 缺 platform 是**响亮失败**（boot 即报 `dsh.client.platform must be a string`），该形态最高 30；完全漏声明（陷阱原状）才是静默隐形 |
| H5-runtime-export-drift | DSH-0.1.2-A2-10 `dsh-settings` 移除运行时 `settingsNamespace` 导出；rollup R-11 类型面导出漂移；API-03 provider-owned lifecycle | judge 走 **pack → tarball → add**（link 安装掩盖漂移，禁用）：pack/add/boot 全绿且无静态问题 100；add 成功但真实 boot 失败（named export / plugin tree failed / pending）40；pack 或 add 失败 30；fixture 未改 0；旧 runtime pin（dependencies/optionalDependencies/peerDependencies/overrides/pnpm.overrides 任一入口把旧 `@deepseek-ai/dsh-settings` 带进 runtime）或自制 settingsNamespace shim **封顶 20（boot 绿也封顶）**；boot 绿但迁移不完整（仍引用 settingsNamespace、或 devDeps cohort 未对齐 alpha.2）**封顶 60**；宿主被降级/篡改（dsh 版本、全局 dsh-settings 导出面）0 |

## 判活信号（容器题统一约定）

| 信号 | 含义 |
|---|---|
| `pending (waiting for service: …)` / `plugin tree failed` / `did not activate` | 插件树未激活 → 失败档（40） |
| named-export 失败（`does not provide an export named …`） | ESM 运行时导出漂移 → 失败档（40，H5 主症状） |
| headless 冷启动出现 `MISSING_CREDENTIAL`（容器无 API key） | 启动已推进到宿主应用层 → 插件树整体激活，通过 |
| web 冷启动后页面启动图含 `<插件>/client.js` | 浏览器名册真实识别（H3 专属） |

exit code 不作为判据：无 API key 时激活成功也是 exit 1，与激活失败相同——
这正是「只看症状行、不看退出码」的考点（验证报告的归因原则）。

## 判定边界声明

- H3：容器内无浏览器，client.js 的运行时不执行；「浏览器面通过」=
  宿主公告的 `__DSH_BOOT__` 启动图包含本插件 entry。`RemoteResult` 错误流分支
  的运行为未覆盖部分。
- M1/H1/H2/H5：只验证「激活 + 服务调用可达」，不跑完整一轮真实对话（无 API key）；
  路由数 0 是预期，不算失败。H5 另外只走 pack → tarball → add 的安装路径
  （link 安装会带进 fixture 自带 node_modules，掩盖 runtime drift）；settings
  namespace 的注册读写不做设置面板往返。
- 容器题 judge 只创建 `bench-*` profile 与 `/tmp/bench-*` 目录，运行结束即清理；
  不触碰环境中其他资产。

## 已知噪声

- pnpm link 安装偶尔 10s+，judge 超时已放宽（add 180s、boot 60s、web 150s），
  task.toml 里 verifier 超时统一 600s。
- 每个 harbor trial 都是全新容器，题间天然隔离，无需手工恢复 fixture；
  同一题反复跑之间 profile 互不影响。
