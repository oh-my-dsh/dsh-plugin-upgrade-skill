# H5 fixture · 旧 cohort 的 settings 插件（0.1.1-rc.2 时代）

测试夹具，**private:true，benchmark only，不得发布**。插件按 0.1.1-rc.2
cohort 的 settings seam 编写（`settingsNamespace()` 品牌函数 + 测试替身两个
调用点，镜像 Better Sidebar 迁移前的形态），在自己的旧开发依赖环境下
install / typecheck / build / test 全绿。

判活事实（2026-08-31 本地实证 + npm 发布包一手对比）：

- pack 成 tarball 安装进 dsh 0.1.2-alpha.2 profile 后冷启动即
  `plugin tree failed to load: … The requested module '@deepseek-ai/dsh-settings'
  does not provide an export named 'settingsNamespace'`（SyntaxError）——
  alpha.2 运行时导出只剩 `SettingsConflictError` / `SettingsProvider` /
  `redactSecrets`；
- 直接 link 安装会掩盖故障（插件自带 node_modules 里旧包导出还在）；
- 按 DSH-0.1.2-A2-10 迁移（字面量 namespace + 对齐 alpha.2 cohort +
  clean rebuild）后 pack 安装激活成功。
