# H1 参考解法

## 参考改动

见 [solution/plugin/](plugin/)（与 M1 参考解法同款：宿主平面直连领域服务，
`inject: ["llm"]` + `ctx.llm.listProviders()`，删除死依赖），期望 judge 得分 100。
注意参考解法**保留或删除那段误导注释均可**——judge 只看最终 inject 的平面归属。

## 考点（一句话）

源码里的「换成 `inject: ["remote"]` 就省事」注释是陷阱：apiProxy 是宿主平面门面、
`remote` 是客户端平面门面，两者不在同一运行时。宿主平面插件误注 remote 会
`pending (waiting for service: remote)`（DSH-0.1.2-A1-01 实战批注、验证报告第四节）。
agent 必须先判定运行平面再选目标注入名，而不是照抄注释。

## 负测锚点

如果 agent 照注释改成 `inject: ["remote"]`：容器冷启动必然
`pending (waiting for service: remote)` → 40 分档，再被静态门槛封顶到 **20**。
