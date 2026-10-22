# S8 · Release Routing Trap — 发布工程诊断报告（read-only / Mode A · inspect）

> 证据范围：`/app/fixture/`（静态证据包，逐字节未改动）+ plugin-upgrade skill 参考卡片（只列要点与卡片 ID）。
> 消费者约束：DSH 运行时冻结在 `0.1.1-rc.2`（生产冻结），一切补救必须在该运行时上成立。

## 0. 结论速览

| 项 | 结论 |
|---|---|
| Attempt-1 根因 | **tag 分发缺陷**：`#v0.9.5` 这个 ref 在镜像上根本不存在（镜像 tag 集缺 v0.9.2–v0.9.6），发布同步脚本只推 `HEAD:main`、从不推 tag，且没有任何"文档引用的 tag 必须逐镜像可解析"的门禁。与消费者网络/命令无关。 |
| Attempt-2 根因 | **版本路由缺陷**：最新 tag `v0.9.7` 的 artifact 面向 **DSH 0.1.2-alpha.1** 客户端 API（views/legacy projection + `useConversation` 座）构建；消费者运行时是 **0.1.1-rc.2**（低两个 cohort），其客户端契约没有 `useConversation` 导出 → slot entry 渲染即 `TypeError`，重启无效。方向：**artifact 超前于宿主（plugin v0.9.7 → DSH 0.1.2-alpha.1；消费者 DSH 更旧）**。 |
| 立即补救 | 装面向 rc.1/rc.2 线的 **v0.9.3**（compat 表：rc.2 = rc.1 + additive 图像预处理，兼容）。但 `public-org` 镜像连 v0.9.3 tag 也没有（同一分发缺陷）——**不能裸 `#v0.9.3`**，须用 commit SHA pin、另一面镜像，或让维护者补推 tag（见 §3）。 |
| 维护者修复 | 同步脚本补推 tag + 逐镜像 ref 验证门禁；README 按 DSH cohort 路由安装命令（矩阵化），alpha 期构建永不作默认 pin；声明 peer/compat 让不匹配在安装期 fail-fast（见 §4）。 |

## 1. Attempt-1 根因：`#v0.9.5` 无法解析 —— tag 分发缺陷（release engineering）

**证据链**

1. `fixture/ls-remote-tags.txt`（`git ls-remote --tags https://github.com/public-org/dsh-ui-progress.git`，annotated tag 已解引用、升序）：
   `v0.1.0 … v0.8.0, v0.9.0, v0.9.1, v0.9.7` —— **v0.9.2 / v0.9.3 / v0.9.4 / v0.9.5 / v0.9.6 五个连续 tag 全部缺失**。
   `#v0.9.5` 是一个在镜像 refs 里不存在的 ref：pnpm 走 git fetch `refs/tags/v0.9.5` 立即失败（"couldn't find remote ref" 类错误）。这与网络无关——同一网络路径上 `ls-remote` 本身成功取回了完整 tag 列表，缺失是**远端 ref 集合的事实**，不是传输失败。
2. `fixture/sync-script.sh`（发布同步脚本，每次发布后对每个 mirror 执行）：
   `git push --force-with-lease "$remote" HEAD:main` —— **只推分支 tip，没有任何 tag refspec，没有 `--tags` / `--follow-tags`**。git 的默认 push 行为从不携带 tag；因此 tag 即使在维护者本地/origin 被打出来，也永远不会随发布流水线分发到镜像。观察到的形态与之完全吻合：早期 tag（v0.9.0/v0.9.1）在、中间 v0.9.2–v0.9.6 连续洞、唯一"最新"的 v0.9.7 在（符合"手动补推过一次"的一次性动作）。
3. 零校验：没有任何发布门禁去验证"README/文档引用的 tag 必须在每个镜像可解析"（对照 plugin-upgrade skill `examples/06` §9 的发布纪律："tag → push to every mirror → **verify the remote SHA and tag target on each mirror**"、"every tag the docs reference must exist on every mirror"）。README 的默认安装 pin `#v0.9.5` 从未对 `git ls-remote --tags` 做过逐镜像核对。
4. 次级风险（同一脚本）：`--force-with-lease` 覆写镜像 `main`，镜像分支历史本身可被改写，镜像上的 ref 不可默认信任。

**缺陷定位**：release tooling 的 **tag 分发缺失 + 发布后验证缺失**，叠加 docs 侧"默认 pin 未经解析验证"。不是消费者的网络、pnpm 配置或命令写法问题。

（证据只能证明"镜像上不存在 v0.9.5 这个 ref"；无论该 tag 是从未打出、还是打出后未被分发，根因都落在同一发布工具缺陷上，见 §6 Pending。）

## 2. Attempt-2 根因：最新 tag 能装但崩 —— 版本路由缺陷（artifact → DSH 兼容方向）

**兼容性方向（关键）**：**插件 artifact v0.9.7 → 要求 DSH 0.1.2-alpha.1（比消费者运行时更新）**；消费者 DSH = 0.1.1-rc.2，在其下方两个 cohort。即"面向新宿主构建的插件"跑在"旧宿主"上（forward-targeted）。

**证据链**

1. `fixture/dsh-version.txt`：消费者 `dsh --version` = **0.1.1-rc.2**。
2. `fixture/compat-table.md`（插件 README 的兼容表）：
   - **v0.9.3 → npm `@deepseek-ai/dsh@0.1.1-rc.1`**，备注 "rc.1 real-boot verified; **rc.2 is rc.1 + image preprocessing (additive)**" → v0.9.3 对消费者的 rc.2 运行时兼容（rc.2 对 rc.1 纯增量）；
   - **v0.9.7 → `dsh-v0.1.2-alpha.1`**，备注 "Migrated to the alpha.1 client API (**views/legacy projection + useConversation seat**)"。
3. `useConversation` / `useSession` 双座与 `views.get('chat')?.legacy` 投影是 **0.1.2-alpha.1 时代**的客户端 API 形态（skill 侧旁证，只列要点/ID）：
   - `examples/06-real-world-batch-migration` 迁移步骤 3–4：旧扁平快照字段一律经 `views.get('chat')?.legacy` 读取，生命周期字段走 `useSession` 座，组件 props 用 `useSession` + `useConversation` 组合；
   - `references/v0.1.2-alpha.1.md` **DSH-0.1.2-A1-03 / DSH-0.1.2-A1-27** 及其 2026-08-28 field note：旧扁平 `ConversationSnapshot`（nodes/partial/runningCalls/turnEnds）迁入 legacy 投影，生命周期字段必须走座（seat）；
   - 0.1.1-rc.2 的客户端契约没有 `useConversation` 这个函数导出 → 插件 slot entry 渲染时执行 `useConversation(...)` 得到 `undefined` → **`TypeError: useConversation is not a function`**。崩溃点在座调用处，与 slot 注册本身无关。
4. 为什么安装成功、却没有任何拦截：git ref 安装按 ref 取代码，**不按 DSH cohort 路由**；0.1.1-rc.2 的 `dsh plugin add` 路径没有 DSH peer 兼容门禁（DSH 侧在安装/启动期强制 peer range 是更晚版本才有的能力，见 `references/v0.1.7-rc.1` / jump 卡；`rollup-0.1.2` **R-08** 亦记录 peer floor 的 prerelease 匹配语义坑）。README 的"默认安装命令"按 **tag 新旧**（"newest tag"）而不是按 **DSH 版本**路由——这正是 version routing 缺陷。
5. 为什么重启 dsh 无效：缺的是宿主下发的客户端契约导出（**static API absence**），不是运行态/缓存/会话状态；浏览器加载的仍是 0.1.1-rc.2 宿主提供的客户端组合。同类 cross-cohort 形态见 `rollup-0.1.2` **R-02**（旧宿主 + 新 cohort 构建：要么模块求值期 `missed the module table`，要么像本案在座调用处抛 TypeError）。

**两个失败互相独立**：Attempt-1 是"文档 pin 的 tag 没有被分发"（ref 解析层）；Attempt-2 是"能解析的 tag 指向错误的 DSH cohort"（版本路由层）。把 README pin 从 `#v0.9.5` bump 到 `#v0.9.7` 只是把第二类错误暴露给了第一类受众——对 rc.2 用户而言，修复方向本身就是错的。

## 3. 消费者此刻的确切补救（留在 0.1.1-rc.2，不动 DSH）

**目标 artifact = v0.9.3**（唯一面向 `@deepseek-ai/dsh@0.1.1-rc.x` 线、且 rc.2 additive 兼容的构建）。注意：`public-org` 镜像上 **v0.9.3 的 tag 也不存在**（§1 同一分发缺陷），裸 `#v0.9.3` 会以 Attempt-1 完全相同的方式失败。因此：

**Step 0 — 先撤销第二次安装**：从 profile `web` 移除/禁用已装的 v0.9.7 行（`dsh plugin --profile web add` 的逆操作），让崩溃的 slot entry 先从组合里消失。

**Step 1 — 首选：用 commit SHA pin（绕开 tag 分发洞，ref 解析不依赖 tag 存在）**

```
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#<v0.9.3-release-sha>'
```

- `<v0.9.3-release-sha>` = 维护者在 release 仓库执行 `git rev-parse v0.9.3^{commit}` 得到的 40 位 SHA（pnpm/dsh 的 git spec 支持 commit SHA 作为 ref）；
- 取到后须确认该 commit 在目标镜像可达（同步脚本会 force-push `main`）：`git fetch https://github.com/public-org/dsh-ui-progress.git <sha>` 成功即可；
- 证据包里没有 SHA，故这是**唯一需要维护者提供的字段**（其余全部由消费者侧命令完成）。
- 注意坐标纪律：包名保持 `@org/dsh-ui-progress` 不变，只替换 git URL/ref（GitHub owner/repo 与 registry scope/package 是独立坐标，不可互相推导）。

**Step 1 替代 A — 若另一面公共镜像 tag 集完整**（本证据包未含其 ls-remote，须先验证）：

```
git ls-remote --tags https://github.com/<mirror2-org>/dsh-ui-progress.git refs/tags/v0.9.3
dsh plugin --profile web add '@org/dsh-ui-progress@github:<mirror2-org>/dsh-ui-progress#v0.9.3'
```

**Step 1 替代 B — 最快解锁（维护者一次推送，之后消费者命令最简）**：

```
git push https://github.com/public-org/dsh-ui-progress.git refs/tags/v0.9.3:refs/tags/v0.9.3
dsh plugin --profile web add '@org/dsh-ui-progress@github:public-org/dsh-ui-progress#v0.9.3'
```

（同时建议把 v0.9.2–v0.9.6 的 tag 一并补推，消掉整个分发洞。）

**Step 2 — 验证（全部在当前运行时）**：`dsh --version` 仍为 0.1.1-rc.2；冷启动 `dsh --profile web` + 浏览器硬刷新；slot entry 正常渲染、无 `useConversation` TypeError；跑一次核心插件路径冒烟（skill 验证层：依赖解析 → 启用解析 → 静态 → 运行时 → 行为）。

**明确不要做的事**：不要为了这个崩溃升级 DSH（生产冻结）；不要把 `#v0.9.7` 留在 profile 里"先用着"（每帧渲染必崩）；不要把 `#v0.9.3` 裸 pin 到 `public-org`（ref 不存在，复现 Attempt-1）。

## 4. 维护者侧修复（让两类缺陷都不能复发）

### A. Release tooling（tag 分发 + 发布门禁）

1. **同步脚本同时推分支和 tag**（每镜像）：
   `git push --force-with-lease "$remote" HEAD:main "refs/tags/v$VER:refs/tags/v$VER"`
   （或补上 `git push "$remote" --tags`；tag 是不可变 ref，任何情况下不 force tag；`--follow-tags` 仅携带 annotated tag，别依赖默认行为）。
2. **发布后逐镜像验证门禁**（`examples/06` §9）：对每个镜像 `git ls-remote --tags <mirror-url> refs/tags/v$VER`（含 `^{}` 解引用）确认 tag 存在且指向预期 SHA；CI 增加"文档引用完整性"作业：解析 README 全部安装 pin 与兼容矩阵的 tag 列 → 逐镜像 `ls-remote` → **任一不可解析即判定发布失败**。
3. **发布顺序纪律**（`examples/06` routine + "version constants baked at build time" 陷阱）：bump 版本 → build → 校验产物内版本常量/更新提示 tag → 提交最终产物 → 打 tag → 推所有镜像 → 逐镜像验证；顺序颠倒会发出自相矛盾的 tag。
4. **插件自身发布的 dist-tag 纪律**（`rollup-0.1.2` **R-04**）：面向 alpha/预发布 cohort 的构建用 prerelease 版本号走 `alpha` dist-tag（或独立 lane），`latest` 永远留给稳定宿主兼容线——"最新"绝不等于"面向未发布 DSH"。

### B. Docs / version routing

5. **README 取消单一"默认安装"pin，改为按 DSH cohort 路由**（`examples/06` §8 version routing、§10 self-sufficient update prompts）：保留兼容矩阵旧行 + 分 cohort 安装命令，例如：
   - `@deepseek-ai/dsh@0.1.1-rc.1 / 0.1.1-rc.2` → `#v0.9.3`
   - `dsh-v0.1.2-alpha.1+` → `#v0.9.7`（显著标注"面向预发布 DSH，稳定宿主勿用"）
   默认 pin 只能指向稳定线构建。
6. **pin 变更必须带校验**：任何改动安装 pin 的 PR 必须重跑"逐镜像可解析 + 矩阵行标注 DSH cohort"检查；禁止仅因"这是最新 tag"而换 pin（本次 README bump 到 `#v0.9.7` 正是对错误受众的"修复"）。

### C. Fail-fast 与发布验证

7. **声明兼容契约**：package.json 按 cohort 精确声明 `peerDependencies: { "@deepseek-ai/dsh": ... }`（注意 **R-08** 第 3 条：prerelease 匹配语义要求 comparator 同 tuple 且带 prerelease，否则范围形同虚设），必要处用 `<profile>/compatibility.json` 精确豁免；让"插件超前于宿主"在安装/启动期暴露（DSH 侧 0.1.7-rc.1 起强制 peer range，更早宿主更要靠声明 + 文档提示）。
8. **客户端入口加运行时护栏**：仅当 `typeof useConversation === 'function'` 时调用，否则渲染"本插件需要 DSH 0.1.2-alpha.1+，当前 0.1.1-rc.2 请装 v0.9.3"的提示，而不是抛 TypeError（同一 artifact 跨 cohort 共存的运行时解析/探测模式见 `rollup-0.1.2` **R-02**；亦可在构建期生成双 cohort shim）。
9. **发布验证矩阵**：每个声称支持的 DSH cohort 都要冷启动真宿主 + 一次对话/行为流（skill 验证层 1–5；`scripts/verify-runtime.mjs` 形态），把 v0.9.3 "rc.1 real-boot verified" 的做法制度化并覆盖矩阵每一行。

## 5. 证据清单（只读引用）

- `fixture/ls-remote-tags.txt` — 镜像 tag 集：v0.9.2–v0.9.6 缺失（含 v0.9.5、v0.9.3）
- `fixture/sync-script.sh` — 只推 `HEAD:main`，无 tag 分发、无逐镜像验证
- `fixture/dsh-version.txt` — 消费者 dsh `0.1.1-rc.2`
- `fixture/compat-table.md` — v0.9.3→`@deepseek-ai/dsh@0.1.1-rc.1`（rc.2 additive 兼容）；v0.9.7→`dsh-v0.1.2-alpha.1`（views/legacy projection + useConversation 座）
- skill 引用（只列要点/ID）：`examples/06-real-world-batch-migration` §8/§9/§10 + routine step 6（逐镜像验证 tag、版本路由）；`references/rollup-0.1.2` **R-02**（cross-cohort 形态）、**R-04**（插件发布 dist-tag 纪律）、**R-08**（install-channel 三坑：mirror lag、pnpm 供应链规则、peer floor prerelease 语义）；`references/v0.1.2-alpha.1.md` **DSH-0.1.2-A1-03 / A1-27** 及 2026-08-28 field note（legacy 投影 + useSession/useConversation 座）；`references/v0.1.7-rc.1`（DSH peer range 安装/启动期强制）；`references/troubleshooting.md`（"is not a function" 症状族归因方法）。

## 6. skill 报告结构段

- **pre-existing**：not collected（本次为只读静态诊断，无基线构建）。
- **Completed**：两次失败的根因分离与证据化（§1 tag 分发 / §2 版本路由）；兼容方向判定（v0.9.7 → DSH 0.1.2-alpha.1，消费者 0.1.1-rc.2 更旧）；消费者即时补救命令（§3，含 SHA pin 主路径与两条替代）；维护者 release tooling + docs 修复清单（§4）。
- **Skipped**：不执行任何安装/迁移/push（题面只读授权边界）；不读取 fixture 之外的未授权路径；不验证第二面镜像的实际 tag 集（不在证据包内）。
- **Pending / residual risk**：
  1. `v0.9.3` 的 release commit SHA 不在证据包内，需维护者从 release 仓库 `git rev-parse v0.9.3^{commit}` 提供（§3 Step 1 的唯一外部输入）；
  2. 第二面公共镜像的 tag 集未在证据包内，替代路径 A 须先 `ls-remote` 验证；
  3. 证据只能证明"public-org 镜像不存在 v0.9.5 ref"，无法区分"从未打 tag"与"打了未分发"——两种情形共享同一工具根因（无 tag 分发 + 无验证门禁）；
  4. v0.9.2 / v0.9.4 / v0.9.6 的 DSH cohort 未知（兼容表未列），不得臆测其归属。
- **Rollback**：本次对仓库/fixture 零写入（fixture 逐字节未改动）；唯一写入为 `agent-output/` 下的报告与转录文件。
- **Recommendations**：见 §4（重点：同步脚本补推 tag + 逐镜像 ref 门禁 + README 按 cohort 路由 + peer 声明 fail-fast）。

## run-stats

- toolcalls 总数：37（12 次 run_code 批量包装 + 25 次底层工具调用：read 9、glob 2、grep 10、write 3、send_message 1）
- token 用量：n/a
- 完成时间：2026/10/21 14:34:34（Asia/Shanghai）
