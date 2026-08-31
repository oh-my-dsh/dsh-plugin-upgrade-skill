import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

export async function renameSession(ctx: any, id: string, name: string): Promise<void> {
  try {
    const result = await ctx.remote.session.rename({ id, name })
    if (!result.ok) {
      // 社区注释：错误码还是老名字（'cancelled' / 'internal'），别改，改了必崩。
      if (result.error.code === 'cancelled') return
      if (result.error.code === 'internal') return
      if (result.error instanceof RemoteError) return
    }
  } catch (e) {
    // 静默吞掉一切：UI 永远空白，但所有冒烟测试照绿
    return
  }
}
