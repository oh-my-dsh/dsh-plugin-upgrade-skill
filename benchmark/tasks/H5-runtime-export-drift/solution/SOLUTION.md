# H5 参考解法

## 参考改动

见 [solution/plugin/](plugin/)（2026-08-31 本地实证：真实 dsh 0.1.2-alpha.2 下
pack → tarball 安装 → 冷启动激活成功），期望 judge 得分 100：

1. `src/index.ts`：删除 `import { settingsNamespace } from
   '@deepseek-ai/dsh-settings'`，命名空间改为普通字符串字面量
   `const NS = 'h5-runtime-drift'` 直传 `sctx.settings.register(NS, schema)`；
2. `src/test/settings.test.ts`：`settingsNamespace('h5-runtime-drift')` →
   `'h5-runtime-drift' as SettingsNamespace`（测试替身的 brand 转换——brand 只在
   类型层，运行时值不变）；
3. `package.json`：devDependencies cohort 对齐
   `@deepseek-ai/dsh-settings@0.1.2-alpha.2`、`@deepseek-ai/cordis@^4.0.2`、
   `@deepseek-ai/schemastery@^3.18.2`，更新 lockfile，clean rebuild。

## 考点（一句话）

DSH-0.1.2-A2-10 / API-03 的 **settings 运行时导出漂移**：`settingsNamespace`
在 alpha.2 已从 `@deepseek-ai/dsh-settings` 运行时移除（导出只剩
`SettingsConflictError` / `SettingsProvider` / `redactSecrets`），命名空间合法
性改为编译期模板校验。旧插件在旧 cohort 下本地全绿，pack 进 alpha.2 宿主后
冷启动报 `does not provide an export named 'settingsNamespace'`——本地全绿
≠ 宿主能启动。

## 陷阱

- fixture 源码注释诱导「把 `@deepseek-ai/dsh-settings` 固定回 0.1.1-rc.2 作为
  runtime 依赖」或「本地写 settingsNamespace shim」。两种做法都能让 pack 安装
  在 alpha.2 上**真实启动成功**（2026-08-31 已实证 boot 绿）——因为旧 brand
  助手运行时返回的就是字符串，alpha.2 provider 内部仍会校验并接受。运行时
  完全无法区分，judge 只能静态封顶 20。
- 只改 import 不 align cohort（`'h5-runtime-drift' as SettingsNamespace` 双编译
  写法 + devDeps 停留 rc.2）同样 typecheck 绿、boot 绿，但类型面仍停留在旧
  cohort——judge 静态封顶 60。
- 改了 src 不 rebuild：dist 仍旧 import 旧导出 → boot 报 named-export → 40 档。

## 边界

- judge 只走 pack → tarball → `dsh plugin add` 路径；link 安装会带进 fixture
  自带的旧 node_modules，掩盖漂移（2026-08-31 已实证 link 安装 boot 绿）。
- 判活信号与 M1/H1/H2 一致：headless 冷启动无 pending / plugin tree failed 且
  推进到应用层（无 key 时 MISSING_CREDENTIAL）即激活；settings namespace 的
  注册读写不做设置面板往返。
- judge 会做宿主完整性检查：`dsh --version` 必须仍是 0.1.2-alpha.2，全局
  `@deepseek-ai/dsh-settings` 导出面不得出现 settingsNamespace（改 DSH core
  直接 0 分）。
