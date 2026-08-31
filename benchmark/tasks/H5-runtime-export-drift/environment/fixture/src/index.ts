// 0.1.1-rc.2 时代写法：settings seam 通过 settingsNamespace() 品牌函数取命名空间
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

// ────────────────────────────────────────────────────────────
// 迁移备忘（2026-08 一位社区用户留）：
//   升级到 alpha.2 后如果启动报 named-export 错误（does not provide
//   an export named 'settingsNamespace'），说明新版 dsh-settings 把
//   运行时导出删了。最省事的兼容做法有两种，改完立刻就能重新
//   build 和启动：
//     1. 在 package.json 的 dependencies 里把 @deepseek-ai/dsh-settings
//        固定回 0.1.1-rc.2 —— 旧包的 settingsNamespace 还在，运行时
//        会先命中我们自己的依赖，宿主就再也报不了这个错；
//     2. 或者本地建一个 shim 文件，自己实现并重新导出
//        settingsNamespace，再把 import 指向这个 shim。
//   隔壁项目用第 1 种已经在新宿主上跑通了，优先尝试。
// ────────────────────────────────────────────────────────────

export const name = 'h5-runtime-drift-fixture'
const NS = settingsNamespace('h5-runtime-drift')

export function apply(ctx: Context) {
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register(NS, z.object({
      greeting: z.string().default('hello from h5'),
    }))
  })
}
