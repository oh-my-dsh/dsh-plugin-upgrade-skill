# H22 · 真实 dsh-data-agent：v0.1.3 → dsh 0.1.2-alpha.2

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

`/app/fixture/` 是 `omdsh-dev/dsh-data-agent` 发布版v0.1.3的完整Git跟踪快照，
不是最小复现。源码、生成物、测试、双语README、lockfile和资源文件均保持上游原文。
这个版本面向旧rc cohort，必须迁移成该真实插件随后发布的v0.1.4兼容行为，使它能在
容器内固定的dsh 0.1.2-alpha.2 Web运行时完整工作。

当前兼容断面不是一个依赖版本号问题：旧客户端总入口和类型导出已失效；New Session
页面没有Session scope；预设信息的投影位置和输入框实现发生了变化；从Hero触发配置后，
还必须由宿主创建会话并在正确预设投影出现时把打开请求交给会话内Workbench。插件原有
的Host/TUI、数据库、Catalog、分析报告和会话内Workbench能力都必须保留。

请直接修改 `/app/fixture/`，完成真实仓库级迁移：

1. 对齐0.1.2-alpha.2的完整直接/peer/dev依赖cohort、引擎声明、client注入图、
   workspace策略和lockfile；不要靠旧runtime回装、兼容shim、宽泛版本或删除可选能力绕过。
2. 迁移真实客户端Context与类型边界、Session预设投影和工具结果类型来源；处理目标
   UI组件已经移除的prop，同时保留原有slot、locale、hook与卸载生命周期。
3. 在无Session scope的New Session Hero中保留宿主原有预设seat的完整component/inject
   face，只为暂存的data-agent预设增加配置入口；不得替换宿主导航、复制宿主建会话逻辑
   或吞掉其他插件对同一slot的变化。
4. 实现Hero到新Session Workbench的一次性握手：去重并发点击，等待当前Session的
   data-agent投影，交付后按revision确认，异常回滚并在卸载时退订。
5. 同时支持alpha.2 Lexical composer的编辑器属性与可见占位节点，并保留旧textarea
   回退；清理时只能恢复本插件仍拥有的值，不能破坏宿主或其他插件的后续写入。
6. 同步所有受影响的源码、CSS、清单、生成JS/source map、声明文件、双语说明、
   conformance库存和回归测试。严格限定为v0.1.3→v0.1.4的完整差异，不引入之后的功能，
   不删测试、不删能力、不简化实现。
7. 运行当前fixture在闭卷环境中能够执行的本地检查。

隐藏verifier会核对两个发布tag的完整34路径差异，使用frozen lockfile安装候选依赖，
执行上游测试、typecheck和build，从当前fixture打包候选tarball，通过官方CLI装入全新
Web profile，再用真实dsh 0.1.2-alpha.2和Chromium验证client bundle被发现、送达且执行
时没有该插件的激活失败。外部预构建包、npm上的v0.1.4或只改源码不维护发布产物均不接受。
