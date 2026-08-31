# H5 · 运行时导出漂移（本地全绿 ≠ 宿主能启动）

## 无人值守评测授权（BENCHMARK-AUTH-v1）

这是一次在一次性隔离容器中运行的无人值守评测，不会有后续用户消息。本题面即用户
对完成本题所需方案与执行的明确授权和确认：请自行完成必要的分析与计划，并在计划
形成后立即继续执行，不要暂停等待“确认”，也不要向用户追问。该确认持续适用于你
依据适用 skill 产生的具体计划，但仅限以下范围：

- 可以读取 `/app/fixture/`、容器内本地文档和本地工具；可以直接修改
  `/app/fixture/`，并按题面写入指定的 `/app/agent-output/` 目录；
- 可以创建一次性的本地验证 profile、临时文件并运行本地测试、构建和 dsh 命令；
- 不得修改 skill、评测器或参考答案，不得发布、推送、访问外部服务或改动容器外资源；
- 如果无法完成，请如实说明阻塞，但不得仅因为缺少另一轮确认而停止。

我维护一个 DSH 插件（工作目录：`/app/fixture/`）。它的源码按旧版 dsh 时代
（devDependencies 是 0.1.1-rc.2 cohort）编写，在自己的开发环境里
install / typecheck / build / test 全绿。但把它 pack 成 tarball 安装进真实
dsh 0.1.2-alpha.2 宿主后，冷启动直接失败。

请你：

1. 复现失败并定位原因。注意：要用 `pnpm pack` 把插件打成 tarball 再安装验证——
   直接 link 插件目录会把插件自带的旧 node_modules 一起带过去，掩盖真实故障；
2. 按 dsh 0.1.2-alpha.2 的宿主契约迁移源码，**直接改 `/app/fixture/` 里的文件**；
3. 对齐插件声明的依赖 cohort，clean rebuild，跑测试，重新 pack，装进隔离
   profile，真实冷启动证明插件已激活。

目标只有一个：pack 后的插件在 dsh 0.1.2-alpha.2 上成功激活（无 pending、
无 plugin tree failed，启动推进到应用层）。容器里已全局安装 dsh 0.1.2-alpha.2，
你可以自行创建隔离 profile（bundles：`@deepseek-ai/dsh-base` +
`@deepseek-ai/dsh-headless`）做冷启动验证；容器里除 `/app/fixture/` 外的文件
不是本题内容，不要动。fixture 是 private 测试夹具，不得发布。
