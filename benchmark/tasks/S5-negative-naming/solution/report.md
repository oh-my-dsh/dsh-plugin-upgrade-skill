# S5 命名兼容性与注册表状态判定（dsh-greet）

审查对象：`/app/fixture/`（package.json、dsh-plugin.naming.json）。只读审查，
未修改任何文件。**未做任何线上注册表查询**——凡涉及占用/可用性/保留状态的
结论一律不下断言。

| 表面 | 判定 | 依据 |
|---|---|---|
| pluginNames `greet` | 官方基线内的合法短名，本表面无错误项 | `greet` 是官方短名之一，官方基线内合法有效；发布者前缀只是碰撞建议，不触发自动改名 |
| services `search` | 碰撞建议（warning） | 无发布者前缀，与其他插件同名概率高；这是建议不是错误，`--strict` 才非零 |
| events `web-search/ready` | 需要注册表上下文（informational） | 事件是共享通道，同名本身不冲突；只有发布者 schema 不兼容才判冲突 |
| 其余表面 | 需要注册表上下文 | 内部自洽，但全局唯一性/占用状态未查询 |

注册表状态：未查询 → **unknown/未检查**。不对任何表面断言占用或可用性——正式
保留只来自 reviewed entry 合入，本次审查没有这类证据。

发布前建议：对 `search`、`greet` 等裸名做注册表核验或改带发布者前缀；events
的发布者 schema 与既有发布者对比后再定。
