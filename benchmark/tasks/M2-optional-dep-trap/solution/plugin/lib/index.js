// Top-level unconditional import of a package that sits in optionalDependencies.
// The community comment in README.md says "optional is harmless, npm always installs it".
import { canonicalClientTimeZone } from '@deepseek-ai/dsh-util-time'

export const inject = []

export function apply(ctx) {
  ctx.effect(() => {
    console.error('[optional-bench] tz:', canonicalClientTimeZone('Asia/Shanghai'))
  })
}
