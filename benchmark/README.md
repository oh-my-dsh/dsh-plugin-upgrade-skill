# dsh 插件迁移考题（benchmark v2 · Harbor 格式）

6 道"插件升级"考题，测一件事：**AI 装了我们的升级 skill 之后，到底会不会真的
升级插件**。前 2 道是笔试（看代码写答案），后 4 道是实操（真的装 dsh、跑插件，
活没活着一眼看穿）。每道题都带自动判分，不用人改卷。

**格式：本 benchmark 采用 [Harbor](https://github.com/harbor-framework/harbor)
任务格式**，每题就是一个标准 Harbor task（目录布局见下），可直接用
`harbor run` 跑在任何 harbor 支持的 agent / provider 上。

每道题考的都是真坑：有的代码里埋了句"试试这样改"的误导注释（照做必死），有的
插件本来就带着一个和升级无关的坏测试（考 AI 会不会如实报告，而不是偷偷修好
装作没事）。

## 题目一览（说人话版）

| 题号 | 类型 | 考什么 |
|---|---|---|
| S1-static-scan | 笔试 | 给你一份老插件代码：能不能找全"哪里会坏"、查对说明书，而且不乱改卷子 |
| S2-negative-scan | 笔试 | 给你一份看着挺干净的代码：会不会傻乎乎说"一切正常"（没发现问题 ≠ 没问题） |
| M1-host-migration | 实操 | 老插件在新版 dsh 上启不来（真实发生过的故障），修好它 |
| H1-plane-trap | 实操 | 最难的坑：代码注释诱导你用一种必死的改法，考会不会被带偏 |
| H2-baseline-trap | 实操 | 插件带着一个本来就红的测试：考会不会如实说"这锅不是升级造成的" |
| H3-client-plane | 实操 | 网页插件少写了一条必需声明：考知不知道补上 |

## 题目格式（Harbor task 布局）

每题目录 `tasks/<题号>/` 是一个自包含的 Harbor task：

```
tasks/<题号>/
├── instruction.md        # 给 agent 的题面（原 task.md）
├── task.toml             # Harbor 配置：名称、超时、资源、网络
├── environment/
│   ├── Dockerfile        # 题目环境：node:24-bookworm + git 基线提交；
│   │                     # 实操题（M/H 开头）还全局安装 dsh 0.1.2-alpha.2
│   └── fixture/          # 题目用的插件代码（private:true，不能真运行、不能发布）
├── tests/
│   ├── test.sh           # harbor verifier 入口：跑 judge 并把 0-100 分归一化
│   │                     # 为 0~1 写入 /logs/verifier/reward.txt
│   ├── judge.mjs         # 判分逻辑（考点、分档、信号判定全在这里）
│   └── judge-utils.mjs   # 判分公共库（profile 生命周期、冷启动信号）
├── solution/
│   ├── solve.sh          # oracle 解法（静态题写报告；实操题把答案拷进 fixture）
│   └── ...               # 标准答案 + 这道题在考什么（SOLUTION.md）
└── README.md             # 本题说明
```

**自包含**：不再需要外部容器。agent 直接在题目环境（容器）里做题——fixture 在
`/app/fixture/`，静态题报告写到 `/app/agent-output/<题号>/`；verifier 与 agent
共用同一容器，实操题 judge 会在容器内真实建隔离 profile、装插件、冷启动判活。

## 前置条件

- Docker（harbor 默认在本机 Docker 跑环境；也可 `--env` 换 Daytona 等云沙箱）。
- Harbor CLI：`uv tool install harbor` 或 `pip install harbor`。
- agent 的模型 API key（如 `ANTHROPIC_API_KEY`，视选用的 agent 而定）。

## 怎么跑

```sh
# oracle 自检（不耗 API）：标准答案必须拿满分 1.0
harbor run -p benchmark/tasks/S1-static-scan -a oracle

# 单题评测某个 agent
harbor run -p benchmark/tasks/M1-host-migration -a claude-code -m anthropic/claude-opus-4-1

# 全部 6 题：-p 指向 tasks/ 目录即按 dataset 批量跑
harbor run -p benchmark/tasks -a claude-code -m anthropic/claude-opus-4-1
```

每题结果在 harbor 的 trial 输出目录里，`/logs/verifier/reward.txt` 是 0~1 分
（对应 judge 的 0-100 分），judge 的逐条 reasons 在 verifier 日志里。

## 怎么给 agent 用（评测协议）

1. **给 agent 的输入**：`instruction.md` 就是用户对 agent 说的话，按题面原样
   投喂即可；题面里已写明工作目录（容器内 `/app`）。
2. **agent 的落点约定**（题面里也已写明）：
   - 静态题（S1/S2）：agent 只读 fixture，把报告写到
     `/app/agent-output/<题号>/` 下（文件名随意，.md/.txt/.json 均可）；
   - 实操题（M1/H1/H2/H3）：agent 直接改 `/app/fixture/` 里的文件；
     H2 另需把迁移报告写到 `/app/agent-output/H2-baseline-trap/` 下。
3. **判分**：harbor 在 agent 跑完后自动执行 `tests/test.sh`，
   各题 judge 输出一行 JSON `{"score": 0-100, "max": 100, "reasons": [...]}`，
   test.sh 汇总成 0~1 reward。评分细则与考点对照见 [docs/scoring.md](docs/scoring.md)。

### with-skill vs without-skill 对照（隔离 skill 效果）

同一批 agent、同一批题，跑两轮：

- **with-skill 轮**：把本仓库 `skills/plugin-upgrade/` 作为 skill 挂给 agent
  （题面不变）；
- **without-skill 轮**：裸 agent，只给题面。

两轮分差即 skill 的净效果。建议每轮跑 3 次取中位数（实操题有环境噪声）。
每个 harbor trial 都是全新容器，两轮之间无需手工恢复 fixture。

## 判分设计要点

- **真激活才算过**：实操题 judge 把 agent 改后的 fixture 装进容器内隔离 profile
  （`bench-<题号>`），冷启动后以 `pending (waiting for service: …)` /
  `plugin tree failed` / 启动推进到应用层作为判活信号；judge 跑完清理自建资产。
- **不依赖固定输出文本**：agent 的插件日志措辞不限，判据是宿主侧信号（如无 key
  时 headless 必输出 `MISSING_CREDENTIAL`，证明插件树已整体激活）。
- **错误容忍**：缺报告、dsh 异常等都按 0 分处理并在 reasons 里说明，judge 自身
  永远 exit 0，test.sh 解析不到 JSON 也按 0 分兜底。

## 历史文档

- `validation-report-2026-08-30.md`：skill 有效性验证报告（v1 时代）。其中第六节
  的 `dsh-verify` 手工容器复现方式已被自包含环境取代——现在每题镜像本身就按
  该节同款步骤（node:24-bookworm + 全局安装 pnpm/dsh 0.1.2-alpha.2）构建。
- 本目录 v1 的自研 harness（`run.mjs` + 外部容器）已删除，历史见 git。

## 给维护者的注意事项（不改题不用看）

- 每道题 `environment/fixture/` 里的假插件，package.json 都写着 `"private": true`，
  它的 README 也注明了"只是考题素材，不许发布"。**新增题目时保持这两条**，
  目的是防止有人不小心把这些假插件发到 npm 上——它们运行不了，发出去只会
  污染环境。
- 新增题目用 `harbor task init` 起骨架，再对照现有 6 题的布局补齐
  judge / solve.sh，并用 `harbor run -p <题> -a oracle` 验证标准答案得 1.0。
- 在 benchmark 的 Markdown 里引用升级卡时，要写完整编号（如
  `DSH-0.1.2-A1-01`，不能简写成"A1-01"）。仓库自检会查两件事：这个编号
  真实存在、链接点得开；写错的话 `node scripts/validate.mjs` 会直接报错。
