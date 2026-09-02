# Harbor 任务规范（dsh-plugin-upgrade benchmark v2.3）

Stage 1 / Stage 3 的展开。目标套件：`oh-my-dsh/dsh-plugin-upgrade-skill` 的
`benchmark/`，23 道既有题（S1..S8 静态 / M1..M6 迁移 / H1..H9 陷阱）为参照。

## 任务目录（6 块，缺一不可）

```
tasks/<id>/
├── instruction.md        # agent prompt；BENCHMARK-AUTH-v1 契约（见 contract-clauses.md）
├── task.toml             # Harbor 元数据
├── environment/
│   ├── Dockerfile        # agent 镜像：node:24-bookworm + git + pnpm + dsh alpha.2 + git 基线
│   └── fixture/          # 旧形态插件（private:true + exam-material README）
├── tests/
│   ├── test.sh           # 容器/宿主机 verifier 入口（源码寻找脚本展开）
│   ├── judge.mjs         # 判分（唯一判分逻辑）
│   └── judge-utils.mjs   # 共享判分库（复制既有任务的，勿改签名）
└── solution/
    ├── solve.sh          # oracle 应用脚本
    ├── SOLUTION.md       # 参考解 + Point + Boundary
    └── plugin/           # 迁移后的完整参考文件
```

## task.toml（Schema 1.4）

```toml
schema_version = "1.4"
[task]
name = "dsh-plugin-upgrade/<task-id>"
version = "1.1.0"            # BENCHMARK-AUTH-v1 固件版本，勿改（契约校验要求）
description = "<一句话：从什么迁移到什么>"
keywords = ["dsh", "plugin-migration", ...]

[metadata]
difficulty = "hard"          # 现有题多为 hard
category = "programming"
tags = ["dsh", "plugin-upgrade", ...]
execution_contract = "BENCHMARK-AUTH-v1"   # 必须恰好出现一次

[agent]
timeout_sec = 900.0          # 常规 hands-on；H9 这类真 workspace 题另调

[verifier]
timeout_sec = 600.0          # H9: 900

[environment]
network_mode = "public"      # 需要拉 profile 依赖
cpus = 1
memory_mb = 2048
storage_mb = 4096
```

## environment/Dockerfile（规范性）

```dockerfile
FROM node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.24.0 @deepseek-ai/dsh@0.1.2-alpha.2
WORKDIR /app
COPY fixture /app/fixture
RUN git init -q && git add -A && git -c user.email=bench@local -c user.name=bench commit -q -m "baseline"
```

- **版本钉死**：pnpm@11.24.0 / dsh@0.1.2-alpha.2，与其余任务一致。
- **git 基线**：judge 用 `git status --porcelain -- fixture` 判定"fixture 是否
  被改"（只读题 0 分门禁 / 可变题同样实现）。没有它就失去 strips 门禁。
- 容器内 **无浏览器**：所有 client 运行时判分都不可能，锚只能是宿主宣告。

## 判分信号表（judge 视角，全部来自 judge-utils 与容器日志）

| 信号 | 含义 | 用法 |
|---|---|---|
| `NEGATIVE_SIGNAL` = `/plugin tree failed\|did not activate\|pending \(waiting for service\|FAILED fiber\|ClientPackageCompositionError/i` | 插件树未激活 | 失败带（40 分）或该 check 0 分 |
| headless 冷启动到 `MISSING_CREDENTIAL` / `no API key` / `dsh: AUTH` | 树整体激活（无 key 也走到这） | 通过；出口码不可信 |
| `__DSH_BOOT__.entries` 含 `<pkg>/client.js` | client-modules 识别了浏览器半 | boot 图条目 20~40 分 |
| HTTP 通道 401/200 冒烟（token/cookie） | 受保护通道真死/真活 | M5/H8 类题 |
| `git status --porcelain -- fixture` 空 | fixture 未被改 | gate：0 分 |

boot 图 URL 按 **exports key** 拼（`"exports": {"./client": "..."}` → boot 条目
`<pkg>/client.js`），与文件真实路径无关（实测证据：H3/H9 client 在
`lib/client.js` 或 `.dsh-plugin/client.js`，boot URL 都是 `<pkg>/client.js`）。

## 既有 23 题清单（命名参照）

静态 readonly：S1 static-scan、S2 negative-scan、S3 snapshot-migration、
S4 legacy-client-imports、S5 negative-naming、S6 corridor-net-state、
S7 unpublished-cohort、S8 release-routing-trap（+H4 tsbuildinfo-trap、
H6 remote-error-trap 名义 H 实为静态）。
mutable hands-on：M1 host-migration、M2 optional-dep-trap、
M3 session-projection、M4 peer-prerelease-range、M5 token-auth-smoke、
M6 repository-plugins-removal、H1 plane-trap、H2 baseline-trap、
H3 client-plane、H5 runtime-export-drift、H7 locale-trap、H8 fire-drill、
H9 dsh-web-alpha2。

新任务 id：S9… / M7… / H10…（接续，勿跳号）；命名用连字符描述性词
（`M6-repository-plugins-removal` 风格）。