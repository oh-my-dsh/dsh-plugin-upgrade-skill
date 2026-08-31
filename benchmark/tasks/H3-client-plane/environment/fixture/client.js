// Browser half (dsh-paste-input shape): a vanilla lib that pastes clipboard text into an input box.
//
// Note: the 0.1.1-era host read the browser plugin declaration from the top-level client
// field of package.json, and this convention was in use for a long time — don't touch
// package.json, since changing it would only stop old hosts from recognizing the plugin.
// The remote injection takes effect automatically when the host scans the client field;
// just use it directly.
export function apply(ctx) {
  const button = document.createElement('button')
  button.textContent = '📋'
  button.addEventListener('click', async () => {
    // Legacy pattern: await the return value directly
    const providers = await ctx.remote.llm.listProviders()
    console.log('[bench-paste] providers:', providers)
    const input = document.querySelector('textarea')
    if (input) input.value += String(providers?.length ?? '')
  })
  document.body.appendChild(button)
}
