# 迁移报告（H2-baseline-trap，dsh 0.1.1-rc.2 → 0.1.2-alpha.2）

## Pre-existing（迁移前 baseline，豁免清单）

迁移前先跑了机械测试套件（`node --test test/basic.test.mjs`），记录 baseline：

- **`test/basic.test.mjs` › formatProviderLabel**：期待 kebab-case、实现返回
  Title Case，断言失败。**该失败在迁移前就已存在**（README 已声明测试本来就是
  红的），与本次迁移无关，**非本次迁移引入**；按 R-06 记入豁免清单，本次不改、
  不归因于迁移，留待后续单独修复。

## Completed

- `index.js`：`inject: ["apiProxy"]` → `inject: ["llm"]`（宿主平面直连领域服务，
  DSH-0.1.2-A1-01）；`ctx.apiProxy.llm.providers()` → `ctx.llm.listProviders()`。
- `package.json`：移除随 alpha.1 删除的死依赖 `@deepseek-ai/dsh-host-apiproxy`。
- 验证：隔离 profile 冷启动（dsh 0.1.2-alpha.2），插件树激活成功（无 pending），
  `llm.listProviders()` 调用走通（无 API key 路由数 0 属预期，属 profile 配置
  问题，不计为插件故障）。

## Skipped

- 预存失败的测试用例：按 baseline 豁免，不属本次迁移范围。

## Pending / 残余风险

- 豁免清单中的测试失败需单独排期修复。

## Rollback

- 迁移改动仅限 index.js 与 package.json，`git checkout -- .` 即可回到 baseline。
