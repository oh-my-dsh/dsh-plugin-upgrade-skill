# S17 参考解法

## 考点（一句话）

**外部 UI 插件接入的三层陷阱**：客户端 bundle 含裸 ESM 时，宿主把全部插件的 bundle
拼成一条经典 `<script>`——一个 import 令整个 combo 编译失败、**零插件注册**，而浏览器
错误只点名第一个被 await 的 entry（无辜的 `dsh-typert-registry`），诊断纪律是二分
insert 行并做静态语法检查、按 `window.__ModuleLoader__.load({id, factory})` +
factory 内 `require("react")` + 导出 `inject`/`apply` 的封装形态重打包；第二个坑是
向其他 entry 声明的 slot 裸 `ctx.slots.register` 会与声明到达顺序竞态，必须以
`ctx.slots.inject(name, () => ctx.slots.register(...))` 包裹且 registrant 只传
name/id/order(/label)；开发环纪律是 combo 仅在宿主启动时组装、改插件必须整体重启宿主，
Windows 下要树杀进程（`taskkill /PID <pid> /T /F`）否则下次启动 EADDRINUSE。

## 参考报告

见 [report.md](report.md)，期望 judge 得分 100。

## 判分要点

只读门禁 + 五要点各 20：combo 全灭根因（一条 ESM 令经典脚本整体编译失败、零注册、
被点名 entry 只是无辜的第一个 await）、诊断纪律（二分 insert / node --check / 正确
封装形态三要素）、slot 声明竞态（inject 包裹 + registrant 字段白名单）、开发环纪律
（boot 组装一次、整体重启、Windows 树杀 EADDRINUSE）、预防（宿主启动静态扫描点名肇事
插件、combo 失败归因、外部插件作者模板与检查单）。

## fixture 出处

真实 2026-09-04 事故：在 dsh-v0.1.3-alpha.1 源码宿主（Windows）上手写外部插件
`@lhh010/dsh-profiles` 接入 web profile，连续踩中 combo 全灭（错误归因误导）与
slot 声明竞态，最终按 ModuleLoader 封装 + 树杀重启完成接入。
