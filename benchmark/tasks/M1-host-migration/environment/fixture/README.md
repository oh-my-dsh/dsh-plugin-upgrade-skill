# M1 fixture · 旧写法宿主插件（0.1.1-rc.2 时代）

测试夹具，**不得发布**。内容逐字复制自历史验证环境的 `/tmp/demo-plugin`
（按 `@deepseek-ai/dsh-host-apiproxy@0.0.1-rc.1` 真实接口编写的旧写法），仅
package.json 增加 `"private": true`、补充本 README。

判活事实（来自 `validation-report-2026-08-30.md`）：

- 本插件挂上 dsh 0.1.2-alpha.2 冷启动即
  `plugin tree failed ... pending (waiting for service: apiProxy)`，exit 1；
- 按 skill 卡片迁移（`inject: ["llm"]` + `ctx.llm.listProviders()` + 删除死依赖）
  后激活成功；容器无 API key 时路由数 0 是预期，调用走通即可。
