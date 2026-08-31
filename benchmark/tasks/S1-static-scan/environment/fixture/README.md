# S1 fixture · 七类触点静态夹具（S1 专用副本）

这是 `skills/plugin-upgrade/examples/legacy-plugin/` 的逐字副本（本 README 除外），
用于 benchmark 任务 S1-static-scan：agent 需要对它做**只读**触点扫描。它不是可
安装插件，是测试夹具，**不得执行、不得发布**；不能编译是设计使然。

- 本题判定要求 fixture 相对 git HEAD 零改动，任何修改/新增/删除文件都会使本题 0 分。
- 本目录不参与仓库 `node scripts/validate.mjs` 的触点正样本校验（校验器只读
  `skills/` 下的原始夹具）。

| 触点 | 命中位置 |
|---|---|
| #1 源码 patch | cordis.patch.yml · patch.yml · scripts/apply-patch.mjs |
| #2 内部/持久事件 | src/index.ts · 外部 informational SessionEvent producer |
| #3 内部服务/Remote | src/index.ts · `ctx.get('apiProxy')` |
| #4 宿主文件系统 | src/index.ts · 固定 `~/.dsh/profiles/default` |
| #5 内部 UI/命令 | src/index.ts · internal import + `registerCommand` |
| #6 自建通道 | src/index.ts · loopback HTTP `/api/legacy` |
| #7 子进程/输出 | src/index.ts · scripts/apply-patch.mjs · 错误假设 stdout 是 JSONL |
