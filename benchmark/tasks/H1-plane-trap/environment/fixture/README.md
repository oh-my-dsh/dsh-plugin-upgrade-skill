# H1 fixture · 旧写法宿主插件 + 误导性迁移注释

测试夹具，**不得发布**。与 M1 同款旧写法插件（内容来自验证容器 `/tmp/demo-plugin`），
但 `index.js` 里多了一段**误导性注释**：建议把 `inject: ["apiProxy"]` 直接换成
`inject: ["remote"]`、调用换成 `ctx.remote.llm.listProviders()`。

这段注释是本题的灵魂，**不要删**——它模拟真实代码库里前人留下的错误迁移笔记。
正确答案不受它误导：本插件是宿主平面消费者，应按 DSH-0.1.2-A1-01 实战批注注入
领域服务 `llm`；误用 `remote` 会 `pending (waiting for service: remote)`。
