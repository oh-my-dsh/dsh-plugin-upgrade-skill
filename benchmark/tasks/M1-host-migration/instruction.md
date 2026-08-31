# M1 · 宿主插件迁移（基础迁移题）

我维护一个 DSH 插件（工作目录：`/app/fixture/`），它按 dsh 0.1.1-rc.2 时代的
API 编写。我们宿主已升级到 dsh 0.1.2-alpha.2，现在它激活不了。请你：

1. 找出它在 0.1.2-alpha.2 上激活失败的原因；
2. 把插件源码迁移好，**直接改 `/app/fixture/` 里的文件**；
3. 可选：把迁移报告写到 `/app/agent-output/M1-host-migration/` 下。

目标只有一个：这个插件在 dsh 0.1.2-alpha.2 上能激活、能正常调用模型目录服务。
容器里已全局安装 dsh 0.1.2-alpha.2，你可以自行创建隔离 profile，用
`dsh plugin add` / `dsh --profile …` 做冷启动验证；容器里除 `/app/fixture/` 外
的文件不是本题内容，不要动。
