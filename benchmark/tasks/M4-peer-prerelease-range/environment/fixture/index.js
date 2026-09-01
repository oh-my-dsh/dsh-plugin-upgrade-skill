export const inject = []

export function apply(ctx) {
  ctx.effect(() => {
    console.error('[peer-bench] apply() executed')
  })
}
