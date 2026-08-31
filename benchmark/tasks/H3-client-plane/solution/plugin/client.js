// 浏览器半边（0.1.2-alpha.2）：ctx.remote 调用返回 RemoteResult，按 DSH-0.1.2-A2-02
// 在结果分支里处理业务失败，不要防御性 catch 吞错。
export function apply(ctx) {
  const button = document.createElement('button')
  button.textContent = '📋'
  button.addEventListener('click', async () => {
    const result = await ctx.remote.llm.listProviders()
    if (!result.ok) {
      console.warn('[bench-paste] listProviders 失败:', result.error.code)
      return
    }
    const input = document.querySelector('textarea')
    if (input) input.value += String(result.value?.length ?? '')
  })
  document.body.appendChild(button)
}
