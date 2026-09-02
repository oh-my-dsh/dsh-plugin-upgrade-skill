// Node half (0.1.2-alpha.2 bundle shape): the client is mounted by client-modules via
// __ModuleLoader__, so the entry no longer serves it as a page script — the legacy
// page-script loading path (self-executing client served by the entry and injected
// into index.html) is gone (DSH-0.1.1-R1-01). This half keeps only the lifecycle
// hook; it declares no host services, so the boot graph is trivially satisfiable on
// any profile (no `pending (waiting for service: …)`).
export const name = 'bench-repo'

export function apply(ctx) {
  console.error('[bench-repo] host half apply() 执行')
}