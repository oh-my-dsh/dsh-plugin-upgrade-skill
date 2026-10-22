# S7 · Unpublished Cohort — 安装 / 类型基线方案报告（只读分析）

- 任务格：...\noskill\S7-unpublished-cohort（容器视角 /app/）
- 分析对象：fixture/package.json、fixture/README.md（只读；fixture 全程逐字节未改动）
- 约束遵守：未执行任何 install、未建环境、未联网、未读取 skills/、tests/、solution/ 或其他 benchmark 目录；全部产物写在格目录内 agent-output/ 下
- 时间说明：浏览器时区不可用，时间按 Asia/Shanghai 记录，见文末 run-stats

## 1. 这条声明的真实后果（semver 语义）

### 1.1 声明与已知 registry 现实
- fixture/package.json:5 —— "devDependencies": { "@deepseek-ai/dsh-llm": "^0.1.2-alpha.1" }
- fixture/README.md:3 —— 声称 "npm install gives you the type baseline"
- 题面给定的 registry 事实（本报告按题面给定为真）：@deepseek-ai/* 仅有 0.1.1-rc.1 / 0.1.1-rc.2 / 0.1.2-alpha.2；0.1.2-alpha.1 从未发布。

### 1.2 caret 范围展开
'^0.1.2-alpha.1'（major=0、minor=1，caret 对 0.x 只锁到 minor）展开为：

    >=0.1.2-alpha.1 <0.2.0

### 1.3 预发布匹配规则（关键，决定成败的那一条）
node-semver 默认 includePrerelease=false：带 prerelease 的版本只有在 comparator 集合中存在"同一 [major,minor,patch] 三元组、且自身带 prerelease"的 comparator 时，才允许参与匹配。
'^0.1.2-alpha.1' 展开出的 comparator '>=0.1.2-alpha.1' 三元组为 0.1.2 且带 prerelease，因此 0.1.2-x 系预发布被允许进入比较（0.1.1-rc.x 则被此规则直接排除）。

### 1.4 对三个候选逐一判定
| 候选版本 | >=0.1.2-alpha.1 | <0.2.0 | 同三元组 prerelease 规则 | 结论 |
| --- | --- | --- | --- | --- |
| 0.1.1-rc.1 | 否（0.1.1-rc.1 < 0.1.2-alpha.1） | 是 | 否（无 0.1.1 三元组 comparator） | 不匹配 |
| 0.1.1-rc.2 | 否 | 是 | 否 | 不匹配 |
| 0.1.2-alpha.2 | 是（同为 alpha 前缀，数字 2 > 1） | 是 | 是 | **匹配** |

### 1.5 结论（对题目两问的直接回答）
1. **install 不会失败。** '^0.1.2-alpha.1' 能被 0.1.2-alpha.2 满足（semver.maxSatisfying 取到 0.1.2-alpha.2），npm 不会报 ETARGET / no matching version。
2. **实际安装的是 0.1.2-alpha.2，不是 alpha.1。** 在 alpha.2 存在的前提下，这个范围永远解析不到 alpha.1 —— 即便日后补发 0.1.2-alpha.1，caret 也只会选更高的 alpha.2。
3. 因此 README 的 "npm install gives you the type baseline" 只是"恰好能装出一个类型基线"：装出来的是 **alpha.2 的 .d.ts**，与声明意图（alpha.1）之间是否存在类型漂移属于 unconfirmed（本任务禁止安装，无法比对两版类型内容）。
4. fixture 内无 lockfile（目录中只有 README.md 与 package.json，已核实）→ 解析结果随 registry 演化漂移。例如日后发布 0.1.2 正式版，'^0.1.2-alpha.1' 会解析到 0.1.2 正式版（正式版满足下界，且不带 prerelease 不受三元组限制），此后还会继续漂向 0.1.x 的更高版本，上界到 <0.2.0 为止。

### 1.6 对照：什么情况下 install 才真的会失败
- 范围写成不带 prerelease 的 '^0.1.2'：三个候选全部被 prerelease 规则 / 下界排除 → ETARGET，install 失败。
- 0.1.2-alpha.2 被下架：'^0.1.2-alpha.1' 无任何候选（0.1.1-rc.x 既低于下界、又无同三元组 comparator）→ ETARGET，install 失败。
- 'npm install --omit=dev'（或 NODE_ENV=production 语义下的省 dev 安装）：该包是 devDependency，会被整体跳过 → 类型基线缺失，tsc 报找不到模块类型。
- 细节反例：若有人把范围改成 '^0.1.1-rc.2' 试图"退到 rc.2"，它 **不会** 匹配 0.1.2-alpha.2（comparator 三元组是 0.1.1，与 0.1.2-alpha.2 不同组），只会拿到 0.1.1-rc.2 与将来可能出现的 0.1.2 及以上正式版 —— 说明"范围怎么写"与"装到哪个 cohort"强相关。

### 1.7 这条声明的实质问题
不是"装不上"，而是"装上的不是声明说的那个东西，且没有任何东西把这个差异固定下来"。风险集中在三点：类型基线漂移（alpha.2 ≠ alpha.1？unconfirmed）、无 lockfile 的不可复现、README 措辞误导下个 cohort 的维护者。

## 2. 可行的安装 / 类型基线方案（多路径 + 权衡 + 退出路径）

原则：fixture 必须保持不变；以下均为"给维护者的计划"，本任务不执行任何安装或改动。

### 路径 A —— 声明对齐现实（推荐主线）
把 devDependencies 改为精确版本 "@deepseek-ai/dsh-llm": "0.1.2-alpha.2"（或 '^0.1.2-alpha.2'，若愿意接受后续 0.1.2-x / 0.1.2 正式版），同步把 README 改成"安装即得到 0.1.2-alpha.2 的类型基线"，并提交 lockfile。
- 权衡：+ 诚实、可复现、无隐性漂移；− 需要改 package.json / README（本任务禁止，故仅计划）；− 若 alpha.2 与预期 alpha.1 API 不同，仍需一层适配。
- 退出路径：若下游必须保留 "^0.1.2-alpha.1" 字面，保留范围但在 README / 注释中明确"alpha.1 未发布，基线实际取自 alpha.2"。

### 路径 B —— 不动声明，用 lockfile 钉死（最小改动）
提交 package-lock.json，把 @deepseek-ai/dsh-llm 钉在 0.1.2-alpha.2（含 integrity 与 resolved），团队统一用 'npm ci'。
- 权衡：+ diff 最小、复现性好；− package.json 仍具误导性；− lockfile 丢失或过期后 'npm install' 仍会漂移。
- 退出路径：lockfile 与声明冲突时以 lockfile 为准并在 README 注明；发布 0.1.2 正式版后评估升级（此时该范围会自动漂到正式版，务必先看 lock diff）。

### 路径 C —— overrides / resolutions 强制钉版
npm >= 8.3 用 "overrides": { "@deepseek-ai/dsh-llm": "0.1.2-alpha.2" }；pnpm 用 pnpm.overrides；yarn 用 resolutions。
- 权衡：+ 连传递依赖一起钉；+ 不必改 devDependencies 那一行；− 语义是"强制改写"，掩盖声明本身的问题；− 各包管理器具体行为差异 unconfirmed。
- 退出路径：管理器不支持 overrides 时回落到路径 A 或 B。

### 路径 D —— 不依赖 registry 的类型基线（离线 / 严格复现）
把目标版本的 .d.ts 快照（或一个带 types 字段的 stub 包）vendored 进仓库（例如 types/dsh-llm/），通过 tsconfig paths / typeRoots 或 "file:./types/dsh-llm" 指向它。
- 权衡：+ 完全确定、可离线、彻底绕开"未发布版本"问题；− 类型快照需人工维护，可能与真实包漂移；− 仅解决类型，不解决运行时依赖（若 dsh-llm 还有运行时代码，仍需另装）。
- 退出路径：真实包可稳定获得后，删除 vendored 快照、切回 registry 版本，并做一次类型对比（见 2.5）。

### 路径 E —— 发布侧修复（仅在有发布权且能复刻历史产物时）
补发 0.1.2-alpha.1 使字面声明成立。
- 权衡：+ 不改任何声明；− **并不能恢复"预期基线"**：只要 alpha.2 存在，'^0.1.2-alpha.1' 依旧解析到 alpha.2；− 若无法复刻当年 alpha.1 的真实内容，补发构成更严重的历史欺骗。
- 退出路径：若只是想让 CI 绿，可把 alpha.1 作为 alpha.2 的别名 tag 发布并明确文档化；更推荐直接走 A。无发布权时本路径整体不可用，退到 A/B/D。

### 2.5 通用落地 / 验收步骤（计划项，本任务未执行，执行结果 unconfirmed）
1. 'npm view @deepseek-ai/dsh-llm versions --json' 复核 registry 现状与 dist-tag；
2. 'npm install --dry-run --json'（或安装后 'npm explain @deepseek-ai/dsh-llm'）确认解析结果确为 0.1.2-alpha.2；
3. 安装后 'npx tsc --noEmit' 做类型冒烟，核对插件实际 import 的 API 在该版本 .d.ts 中存在（fixture 内无插件源码，具体 API 清单 unconfirmed）；
4. 提交 lockfile，CI 改用 'npm ci'，把"基线版本"写进 README；
5. 升级 / 换 cohort 前先看 lock diff，防止 caret 静默漂移。

### 2.6 推荐组合
短期：路径 B（lockfile 钉 0.1.2-alpha.2）+ README 勘误；下一版本：路径 A（声明对齐 0.1.2-alpha.2 并保留 lockfile）；若要求完全离线或严格复现，叠加路径 D。路径 E 仅在能复刻历史产物时考虑，否则不采用。

## 3. Unconfirmed（无法在本任务内验证的事项）
- registry 实际内容 / dist-tag 现状：按题面给定为真，但未联网核实 → unconfirmed（假定成立）。
- 0.1.2-alpha.2 与"预期 alpha.1"之间的类型 / API 差异 → unconfirmed（禁止安装，无法比对 .d.ts）。
- npm / pnpm / yarn 对 '^0.1.2-alpha.1' 的实际解析结果：基于 node-semver 标准语义推断（结论见 1.5），未经真实安装验证 → unconfirmed（行为推断）。
- 0.1.2-alpha.2 是否长期可获得（是否会被下架）→ unconfirmed。
- 插件源码实际使用了哪些 dsh-llm API：fixture 内仅有 package.json 与 README.md，无源码 → unconfirmed。
- @deepseek-ai/* 其他包是否存在同类未发布 cohort 问题 → unconfirmed。
- 各包管理器 overrides / resolutions 的具体生效范围差异 → unconfirmed。

## 4. 合规声明
- 未修改 fixture/ 下任何文件（只读取 README.md 与 package.json，并对 fixture 目录做了一次只读列举）；
- 未执行任何 npm / pnpm / yarn install 或其他安装 / 构建 / 迁移动作；
- 未联网、未读取 skills/、tests/、solution/、benchmark 其他目录或任何白名单外路径；
- 产物与临时文件全部位于格目录内 agent-output/ 下。

## run-stats
- toolcalls 总数：9（内层实际工具调用计数；执行器 run_code 4 次 + send_message 1 次。明细：glob 1、working_directory 1、read 2、write 4、send_message 1）
- token 用量：n/a（harness 未向本 agent 暴露用量数值）
- 完成时间：2026年10月21日星期三 GMT+8 14:18:39；UTC：2026-10-21T06:18:39.733Z
