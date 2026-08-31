# H3 fixture · 浏览器插件（dsh.client 声明缺失陷阱）

测试夹具，**不得发布**。按 `dsh-paste-input` 形态编写的双平面插件：宿主半边
`index.js` 无耦合，浏览器半边 `client.js` 走 `ctx.remote`。

陷阱在 `package.json`：浏览器插件声明放在**顶层 `client` 字段**（0.1.1 旧约定，
alpha 宿主不读），**缺少 alpha 要求的 `dsh.client` 声明**。症状是静默的：
`dsh plugin add` 成功、宿主半边激活成功，但插件永远不会出现在浏览器
`__DSH_BOOT__.entries` 里。`client.js` 里的注释还在劝阻你别改 package.json。
