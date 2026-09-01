# H9-dsh-web-alpha2 · dsh-web真实仓库迁移

这道专家级实操题取自Apache-2.0项目
[`zhu1090093659/dsh-web`](https://github.com/zhu1090093659/dsh-web)：初始态锁定
`v0.3.8`（`fa6d2a47`），目标兼容行为锁定`v0.3.9`（`8b0191fe`）。题目不是手写demo；
fixture逐字收录v0.3.8的完整插件workspace（`packages/`、`scripts/`、`shared/`、
`tests/`、`patches/`）和迁移涉及的根配置。该兼容面内只排除了在两个tag之间完全
未变化的二进制媒体资产及Markdown文档；五个兼容提交之外的独立market应用和仓库治理
文件不进入题目，也不进入答案。

题面见[instruction.md](instruction.md)，来源和重建方法见[provenance/README.md](provenance/README.md)，
判分见[tests/judge.mjs](tests/judge.mjs)。Codex闭卷评测应通过
[`run-codex-closed-book.sh`](run-codex-closed-book.sh)启动；该入口会在runner层显式关闭
服务端网页搜索。

- **迁移面**：13个settings consumer、web-settings bridge、全仓SDK/Cordis依赖图、
  npm cohort解析、git-graph显式类型边、聚合包外部插件排除、task-board限定错误码重试。
- **Verifier**：隐藏契约直接检查真实多包源码和清单，并运行上游脚本级回归测试；任何
  与兼容面无关的fixture改动都会把总分封顶为90。静态兼容面达到80分后，verifier还会
  安装并构建候选workspace，把17个`@linxin666/*`依赖全部改写为本地候选tarball，通过
  官方CLI装入隔离profile，再真实启动dsh 0.1.2-alpha.2并检查Web启动图；这道门禁失败
  会把总分封顶为80。
- **密封**：agent执行阶段断网，且Codex闭卷入口关闭服务端网页搜索。agent结束后其容器
  会先停止，`/app/fixture`和基线`/app/.git`作为artifact传入独立verifier容器；只有该
  verifier可联网安装固定第三方依赖。被测的dsh-web家族包全部来自当前fixture构建产物。
- **Oracle**：逐文件复制v0.3.9对应原文并删除上游在v0.3.9移除的cohort构建脚本，
  `harbor run -p benchmark/tasks/H9-dsh-web-alpha2 -a oracle`期望reward 1.0。
- **许可证**：fixture保留上游完整`LICENSE`，来源清单记录每个复制文件的SHA-256。

```text
environment/fixture/       # v0.3.8真实代码/config/test文本面
provenance/                # tag、commit、archive SHA与逐文件清单
solution/target/           # v0.3.9兼容目标原文（Harbor Oracle专用）
tests/judge.mjs            # 多面契约判分
tests/runtime-smoke.mjs    # 本地候选tarball + alpha.2真实Web冷启动门禁
tests/Dockerfile           # 与agent隔离的公网verifier镜像
```
