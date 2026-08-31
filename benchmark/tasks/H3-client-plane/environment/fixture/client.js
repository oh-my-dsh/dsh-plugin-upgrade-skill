// 浏览器半边（dsh-paste-input 形态）：往输入框粘贴剪贴板文本的 vanilla lib。
//
// 注意：0.1.1 时代的宿主从 package.json 顶层 client 字段读取浏览器插件声明，
// 这个约定沿用了很久，不要动 package.json —— 动了反而会让老宿主识别不了。
// remote 注入在宿主扫到 client 字段时自动生效，直接用即可。
export function apply(ctx) {
  const button = document.createElement('button')
  button.textContent = '📋'
  button.addEventListener('click', async () => {
    // 旧写法：直接 await 返回值
    const providers = await ctx.remote.llm.listProviders()
    console.log('[bench-paste] providers:', providers)
    const input = document.querySelector('textarea')
    if (input) input.value += String(providers?.length ?? '')
  })
  document.body.appendChild(button)
}
