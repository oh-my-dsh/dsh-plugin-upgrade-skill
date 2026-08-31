// Browser half (0.1.2-alpha.2): ctx.remote calls return a RemoteResult; per DSH-0.1.2-A2-02,
// handle business failures in the result branch instead of swallowing errors with a defensive catch.
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
