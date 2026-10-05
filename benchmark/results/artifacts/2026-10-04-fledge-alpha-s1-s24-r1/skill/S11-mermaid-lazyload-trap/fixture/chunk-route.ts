// Excerpt from the host half of @org/dsh-attach-input v0.4.0 — the chunk-resource
// route (attempt 2). LIB_DIR resolves to the plugin's own lib directory.

const RESOURCE_PREFIX = '/dsh-attach-input/resources'
const LIB_DIR = normalize(fileURLToPath(new URL('.', import.meta.url)))  // .../lib/

const route = {
  kind: 'prefix',
  path: RESOURCE_PREFIX,
  handler: async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return }
    const url = new URL(req.url ?? '/', 'http://dsh.internal')
    const rel = decodeURIComponent(url.pathname.slice(RESOURCE_PREFIX.length)).replace(/^/+/, '')
    if (rel === '' || !/.m?js$/.test(rel)) { res.writeHead(404).end('not a js resource'); return }
    const abs = normalize(join(LIB_DIR, rel))
    if (!abs.startsWith(LIB_DIR + sep)) { res.writeHead(403).end('path escapes the plugin lib'); return }
    let file
    try {
      file = normalize(realpathSync(abs))
      if (!file.startsWith(LIB_DIR + sep)) { res.writeHead(403).end('path escapes the plugin lib'); return }
    } catch { res.writeHead(404).end('not found'); return }
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' })
    res.end(data)
  },
}
// registered: ctx.effect(() => ctx.webServer.register(route), 'attach-input: chunk route')
