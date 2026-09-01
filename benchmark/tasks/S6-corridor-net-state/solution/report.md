# S6 走廊净状态裁决（ignorable 一删一复）

分析对象：`/app/fixture/src/events.ts`。只读分析，未修改任何文件。

## 1. 走廊来龙去脉

- DSH-0.1.2-A1-02：alpha.1 暂时移除 `SessionEvent.ignorable`；
- DSH-0.1.2-A2-01：alpha.2 恢复保留语义（envelope/persistence/reload/transport
  原样保留 marker）。

目标版本是 alpha.2——先读完整走廊、按**净状态**折叠：中间版本移除、目标版本
恢复的语义，不应先删再加。

## 2. 防御代码的命运：删除

这段代码是为 alpha.1 的中间态写的防御，目标 alpha.2 已恢复语义。删除第 3 行
`delete` 及第 4-5 行注释，恢复到朴素形态；该段防御不保留、不继续维护。

## 3. 正确 producer 语义

只有「旧 reader 省略语义也不影响重建」的 **informational 事件**才写
`ignorable: true`；marker 不是消费端过滤指令，reload 后事件仍保留在 loaded
events。本 fixture 的 `third-party/informational` 属于 informational 事件，
producer 应显式写 `ignorable: true`，而不是 delete。

## 4. 普通插件走 Session.append(...) 的能力缺口

公开 live `Session.append(...)` **没有** `ignorable` 参数——普通插件只有该 API
时，把 producer seam 标为**能力缺口**，不能靠 cast 假装已有公开入口。需要
marker 的持久事件 producer 走 alpha.2 的 persistence/reload seam。

必须验证：未知且 `ignorable: true` 的事件 reload 后仍存在；未知 required 事件
被拒；SQLite schema 19 被拒、重建后的 schema 20 可启动（升级前先备份/导出）。
