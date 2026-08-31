# H3 参考解法

## 参考改动

见 [solution/plugin/](plugin/)，期望 judge 得分 100：

1. `package.json`：把顶层 `client` 字段迁入
   `"dsh": { "client": { "platform": "web", "inject": ["remote"] } }`——alpha 宿主只
   扫描 `dsh.client`（并要求 exports 有 `./client` bundle）；顶层 `client` 是
   0.1.1 旧约定，alpha 静默忽略，注释里「别动 package.json」的说法是错的；
2. `client.js`：按 DSH-0.1.2-A2-02 把直接 await 改为 `RemoteResult` 结果分支
   （`result.ok` 判定）——这步不影响 judge 得分（浏览器面不在容器内执行），
   但属于该走廊的正确迁移。

## 考点（一句话）

客户端平面契约（验证报告第四节）：浏览器插件走 `ctx.remote.*`，且必须在
package.json 声明 `dsh.client` 才会进入浏览器插件名册；漏声明时**症状静默**——
能装、宿主半边能激活，但 `__DSH_BOOT__.entries` 永远没有它。

## 判定边界（重要）

容器内没有浏览器，judge 不执行 client.js 运行时；「浏览器名册真实识别」判据 =
web 冷启动后用 bootstrap token 兑换 Cookie、GET `/`，宿主公告的启动图
（`__DSH_BOOT__`）里出现 `@demo/dsh-bench-paste/client.js` entry。这与
DSH-0.1.2-A1-19 的验收要求一致（单项 200/日志出现 URL 都不能单独证明插件可用，
反过来 entry 缺席则确定未被识别）。`RemoteResult` 错误流与真实浏览器调用属于
未覆盖部分，评分说明里按此边界声明。
