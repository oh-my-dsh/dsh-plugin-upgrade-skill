# Troubleshooting · 迁移后症状反查

> 按症状反查根因与对应卡片的速查表，供模式 C 迁移后排障使用。它不是决策流程，也
> 不是完整故障典：根因确认仍以卡片配方与目标 tag 源码为准；未列出的症状回到
> pre-flight 触点与分层验证清单逐层排查。

| 症状 | 最可能根因 | 先看哪张卡 |
|---|---|---|
| 面板/悬浮球静默消失，boot 图无此插件，且常无任何报错 | `dsh.client.inject` 残留已拆除的包（幻影依赖）导致行不进图；或注册 id / 装配行名与包名不一致；或插件在 patch 层被 `disabled: true` | [DSH-0.1.2-A1-25](v0.1.2-alpha.1.md)、[DSH-0.1.2-A1-26](v0.1.2-alpha.1.md) |
| 启动断言 `loaded without registering "<id>"` | client bundle 注册 id（`__ModuleLoader__.load` 的 id / tsdown banner `PLUGIN_ID`）≠ package.json `name`，或装配行 `name` 不是裸包名 | [DSH-0.1.2-A1-26](v0.1.2-alpha.1.md) |
| `web boot: N entries did not activate`，`waiting for service: apiProxy` | 0.1.2 移除 ApiProxy 传输层，`require: ['apiProxy']` 的行永久 pending；或 inject 残留已拆除的包 | [DSH-0.1.2-A1-01](v0.1.2-alpha.1.md)、[DSH-0.1.2-A1-25](v0.1.2-alpha.1.md) |
| 插件加载但功能半失效，console 报 factory 错误 | 会话内容读取路径失效（per-session `.nodes` 快照已移除）或 composer DOM 漂移 | [DSH-0.1.2-A1-27](v0.1.2-alpha.1.md)、[DSH-0.1.2-A1-28](v0.1.2-alpha.1.md) |
| 旧宿主上报 `missed the module table` | client bundle 求值期硬 require 目标 cohort 独有的模块（跨 cohort 共存问题） | rollup [R-02](rollup-0.1.2.md) |

- **来源**: dsh-input-history 0.1.1 → 0.2.0 实测迁移（2026-08）；末行来自 [discussion #5120](https://github.com/deepseek-ai/deepseek-harness/discussions/5120)。
