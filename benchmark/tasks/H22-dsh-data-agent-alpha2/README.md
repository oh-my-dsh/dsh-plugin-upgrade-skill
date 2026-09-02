# H22-dsh-data-agent-alpha2 · dsh-data-agent真实插件迁移

这道专家级实操题取自MIT项目
[`omdsh-dev/dsh-data-agent`](https://github.com/omdsh-dev/dsh-data-agent)：初始态是完整的
[`v0.1.3`](https://github.com/omdsh-dev/dsh-data-agent/tree/v0.1.3)
（`8e3ab6a3`），目标行为是完整的
[`v0.1.4`](https://github.com/omdsh-dev/dsh-data-agent/tree/v0.1.4)
（`d1bd4381`）。fixture逐字保留v0.1.3的全部Git跟踪文件，包括源码、生成物、
测试、lockfile、双语README与二进制素材；没有把真实插件裁成demo。

题面见[instruction.md](instruction.md)，来源和重建方法见
[provenance/README.md](provenance/README.md)，判分见[tests/judge.mjs](tests/judge.mjs)。
Codex闭卷评测应通过[run-codex-closed-book.sh](run-codex-closed-book.sh)启动；
该入口同时关闭容器网络和服务端网页搜索。

- **完整差异**：保留两个tag之间全部34个变化路径（2609行新增、1514行删除），
  包括依赖cohort、客户端服务/类型图、Session投影、New Session Hero插槽、Workbench
  跨scope握手、Lexical占位符、生成产物、清单、lockfile和上游回归测试。
- **Verifier**：90分语义契约逐面检查真实源码，另10分要求34个目标路径逐字达到上游
  v0.1.4；兼容面外改动封顶90。静态面达到80分后，verifier会从候选源码执行
  frozen-lockfile安装、上游测试、typecheck、build、pack，再用官方CLI把候选tarball
  装入隔离Web profile，并以Chromium执行真实client bundle；测试/构建失败封顶85，
  alpha.2运行门禁失败封顶80。
- **密封**：agent阶段断网且禁用服务端网页搜索；agent结束后只把`/app/fixture`与
  `/app/.git`交给独立的公网verifier。agent镜像不含测试、参考答案或npm下载缓存。
- **Oracle**：把34个v0.1.4目标文件逐字覆盖到v0.1.3完整快照，
  `harbor run -p benchmark/tasks/H22-dsh-data-agent-alpha2 -a oracle`期望reward 1.0。
- **许可证**：fixture保留上游MIT `LICENSE`；来源清单记录完整快照和全部目标文件的
  SHA-256，并由重建脚本断言变化路径集合没有增删。

```text
environment/fixture/       # v0.1.3完整Git跟踪快照
provenance/                # tag、commit、tree与逐文件SHA-256
solution/target/           # 两个tag之间34个目标文件的v0.1.4原文
tests/judge.mjs            # 全兼容面静态契约判分
tests/runtime-smoke.mjs    # 候选tarball + alpha.2 + Chromium真实门禁
tests/Dockerfile           # 与agent隔离的公网verifier镜像
```
