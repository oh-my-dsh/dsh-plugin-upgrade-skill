# 典型迁移示例

示例必须明确运行平面、验证范围和是否可执行。Markdown 片段不能冒充真实产品验证。

| 示例 | 场景 | 验证状态 |
|---|---|---|
| [01-simple-client-plugin.md](01-simple-client-plugin.md) | 历史客户端 SDK 包迁移 | 文档示例，尚未做固定 tag 编译 |
| [02-host-side-plugin.md](02-host-side-plugin.md) | Host APIProxy → owning domain service | 控制流可执行 + alpha.2 容器实测 |
| [03-client-remote-plugin.md](03-client-remote-plugin.md) | Web Client `ctx.remote` / `RemoteResult` | 控制流可执行；产品 Web smoke 待补 |
| [face-contracts/](face-contracts/) | Host/Client 分平面回归守卫 | `node .../check.mjs` |
| `04-dual-cohort-plugin.md`（待补） | 双 cohort 共存 | 未实现 |
| `05-third-party-plugin-patch.md`（待补） | 第三方预构建插件 patch | 未实现 |

## 贡献要求

1. Host、Web Client 与普通 Cordis plugin 必须分开；
2. 可执行代码只保留一个源文件，文档链接它，不复制第二份会漂移的实现；
3. 明确区分控制流测试、固定 tag build、Loader/profile smoke 与完整产品验证；
4. 引用完整卡片 ID和固定一手来源；
5. 不能执行的扫描夹具必须明确标注“不得执行”。
