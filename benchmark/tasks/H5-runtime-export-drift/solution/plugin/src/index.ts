// 0.1.2-alpha.2 写法：命名空间是普通字符串字面量，注册入口做编译期模板校验
// （DSH-0.1.2-A2-10 / API-03）；settingsNamespace() 运行时助手已从
// @deepseek-ai/dsh-settings 移除，不再调用。
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'h5-runtime-drift-fixture'
const NS = 'h5-runtime-drift'

export function apply(ctx: Context) {
  ctx.inject(['settings'], (sctx) => {
    sctx.settings.register(NS, z.object({
      greeting: z.string().default('hello from h5'),
    }))
  })
}
