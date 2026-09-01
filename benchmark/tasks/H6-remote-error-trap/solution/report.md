# H6 Remote 错误流迁移报告

分析对象：`/app/fixture/src/remote-usage.ts`。只读分析，未修改任何文件。

社区注释主张沿用 0.1.1 的裸字符串写法——该主张错误：照抄不会立刻崩，但会让
cancel/internal 分支永不命中、错误全部落入兜底分支被静默丢弃。

## 错误流应这样改

1. **错误码迁移**：alpha.2 的错误码带命名空间——`cancelled` → `gateway/cancelled`、
   `internal` → `gateway/internal`（另见 `session/not-found`、`session/agent-busy`、
   `gateway/bad-request` 等；具体枚举以 `@deepseek-ai/dsh-typert-protocol`
   alpha.2 实际导出为准，本报告引用处按卡片记载）。
2. **`gateway/cancelled` 分支**：终止当前操作或沿调用链**传播取消**，**不重试**、
   不报通用错误；
3. **`gateway/internal` 与未知码**：保留原始 code/details 并**上报**，**不盲重试**
   （gateway/internal 不证明请求未执行）；未知码 fail-closed、显式失败；
4. **拆除静默吞错**：catch 全吞会让 UI 永远空白而所有冒烟照绿——装配缺陷
   （reject）应**暴露**修复；接住主动 `throw result.error` 的值时用
   `isRemoteFailure` 做结构判别，禁止跨 realm 的 `instanceof RemoteError` 判别。

## 验证矩阵

覆盖：成功、`gateway/cancelled`、`session/not-found`、`session/agent-busy`、
`gateway/internal`、未知业务码、本地装配缺陷；取消不得变成通用错误，
internal/未知不得自动重试；空 UI 在验证里视同失败。
