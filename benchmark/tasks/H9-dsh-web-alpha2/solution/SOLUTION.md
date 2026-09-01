# H9参考解法

Oracle不手写替代实现：`target/`里的文件逐字来自dsh-web `v0.3.9`，来源清单见
[`../provenance/v0.3.9-target-manifest.json`](../provenance/v0.3.9-target-manifest.json)。

真实兼容面包括：

1. 13个consumer从独立`installSettingsSection`/`settingsNamespace`迁到
   `ctx.inject(['settings'], ...)`和`settingsCtx.settings.installSection(...)`，保持原hooks；
2. web-settings bridge直接把字符串转换为`SettingsNamespace`品牌类型；
3. 全仓SDK cohort升到alpha.2，Cordis统一到4.0.2，git-graph补
   `dsh-client-ui-session`直接类型边；
4. alpha.2已发布到npm，因此删除旧tarball store、override及CI materialize流程；
5. `dsh-better-sidebar@0.15.2`和`@mlgbnb/dsh-archive-manager@1.0.7`硬导入已删除的
   `dsh-client-runtime`，从聚合启动图、依赖和生成patch中同时移除；
6. task-board同时识别旧`service-unavailable`和alpha.2的
   `gateway/service-unavailable`，恢复启动竞态重试。

Oracle判满分还必须经过真实运行时门禁：完整安装/构建当前target，打出全部workspace
tarball，将聚合包的17个家族依赖递归改写为这些本地tarball，通过官方CLI装入隔离
Web profile，并由dsh 0.1.2-alpha.2冷启动；启动页`__DSH_BOOT__.entries`必须包含
聚合包、task-board和web-settings客户端。这里不会用npm上的v0.3.9代替Oracle源码。

对应升级卡：DSH-0.1.2-A2-02、DSH-0.1.2-A2-03、DSH-0.1.2-A2-10。
