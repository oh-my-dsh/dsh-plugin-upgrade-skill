# H8 · 真实 dsh-web：v0.3.8 → dsh 0.1.2-alpha.2

## 无人值守评测授权（BENCHMARK-AUTH-v1）

这是一次在一次性隔离容器中运行的无人值守评测，不会有后续用户消息。本题面即用户
对完成本题所需方案与执行的明确授权和确认：请自行完成必要的分析与计划，并在计划
形成后立即继续执行，不要暂停等待“确认”，也不要向用户追问。该确认持续适用于你
依据适用 skill 产生的具体计划，但仅限以下范围：

- 可以读取 `/app/fixture/`、容器内本地文档和本地工具；可以直接修改
  `/app/fixture/`；
- 可以创建一次性的本地验证目录、临时文件并运行本地测试、构建、包管理器和 dsh 命令；
- 不得修改 skill、评测器或参考答案，不得发布、推送、访问外部服务或改动容器外资源；
- 不得使用服务端网页搜索、远程浏览或远程检索工具，也不得从包管理器下载缓存中还原
  目标实现；解题证据仅限题面、适用 skill、`/app/fixture/`及容器内已安装的本地工具；
- 如果无法完成，请如实说明阻塞，但不得仅因为缺少另一轮确认而停止。

`/app/fixture/` 是 dsh-web 发布版 v0.3.8 的真实插件workspace，包含
完整的`packages/`、`scripts/`、`shared/`、`tests/`、`patches/`及迁移相关根配置，
不是最小复现。兼容面内仅排除了两个发布版之间字节完全一致的皮肤、图片等二进制资产
和说明文档；本次兼容迁移未触及的独立market应用及仓库治理文件不属于本题。所有入题
文件保持上游原文。这个版本按 dsh 0.1.2-alpha.1 构建，现在要兼容容器内已经安装的
dsh 0.1.2-alpha.2。

请完成真实仓库级迁移，直接修改 `/app/fixture/`。目前能观察到的故障包括：

- 多个 Host 插件无法再从 `@deepseek-ai/dsh-settings` 导入旧的运行时helper；
- 官方包裁剪peer后，仓库出现Cordis服务增强和客户端类型图断边；
- 旧cohort的本地tarball override/build流程不再适用于目标SDK分发方式；
- 聚合包仍会挂载两个硬导入已删除client runtime面的外部插件，导致整个Web启动中止；
- task-board在alpha.2的网关错误码下不再进入原有启动竞态重试。

要求：

1. 迁移全部受影响包，不得通过兼容shim、删包、删测试或简化实现规避；保留各settings
   consumer原有的schema、entry、hook和生命周期语义。
2. 同步修复直接依赖、类型增强、workspace/lockfile/cohort流程、聚合包契约，以及对应的
   生成文件和契约测试。
3. 保留alpha.1仍可加载的双cohort边界，不要机械抬高现有`engines.dsh`兼容下限。
4. 改动仅限本次0.1.2-alpha.2兼容迁移，不引入目标仓库的其他功能或UI修复。
5. 运行当前fixture能够执行的本地检查。

隐藏verifier会安装、构建并打包当前workspace，再通过官方CLI装入全新Web profile。
所有受测仓库包必须来自当前fixture，不接受外部预构建产物。最终必须能由真实的
dsh 0.1.2-alpha.2冷启动，且Web启动图中出现聚合包、task-board和web-settings客户端。
