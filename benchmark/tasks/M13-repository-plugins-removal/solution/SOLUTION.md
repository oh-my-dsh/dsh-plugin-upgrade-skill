# M13 Reference Solution

## Reference Changes

See [solution/plugin/](plugin/); expected judge score: 100.

1. `package.json` (root): turn the repository-plugin folder into a **bundle npm
   package** — add `main` → `.dsh-plugin/index.js`, `exports` (`.` → the Node entry,
   `./client` → the client entry, `./cordis.patch.yml`, `./package.json`),
   `dsh.bundle.patch` → `./cordis.patch.yml`, and `dsh.client { platform: "web" }` so
   client-modules enumerates this package and mounts the browser half;
2. `cordis.patch.yml` (root, new): one insert row mounting `@demo/dsh-bench-repo`;
3. `.dsh-plugin/index.js`: keep a minimal Node half, but delete the legacy loading
   path — the `/pet/ui.js` page-script route and its `httpServer.tapIndex` injection
   (the entry no longer serves the client as a page script). The reference half
   declares no host services at all (`inject: []`), so activation cannot pend on any
   service; note the alpha.2 host has renamed `httpServer` → `webServer`
   (DSH-0.1.1-R1-09), but that rename is not part of this task's grading surface — the
   reference simply avoids the service, keeping this task focused on the R1-01
   repository-mechanism removal; **warning**: the grader greps the migrated Node half
   for the legacy route/injection markers, so the migrated source must not mention them
   even in comments (the reference comment avoids the literal tokens for this reason);
4. `.dsh-plugin/client.js`: convert from a self-executing page script to a client
   module — `export const name = 'bench-repo'` + `export function apply(ctx)` that
   renders the same `#bench-pet` element (mounted by client-modules via
   `__ModuleLoader__`, not injected into index.html);
5. **Drop `.dsh-plugin/package.json`** — the repository-shaped manifest. The alpha
   client-modules locates the manifest by walking *up* from the Node entry to the
   nearest package.json (the package root, which carries `dsh.client`); a nested
   manifest without `dsh.client` shadows the root one, and the browser half is silently
   missing from `__DSH_BOOT__.entries` (the R1-01 "drop legacy artifacts" step, and the
   hidden reason why keeping it fails the boot-roster check).

## The Point (in one sentence)

DSH-0.1.1-R1-01: the 0811 host deleted `vendor/loader/src/repository.ts`, so there is
exactly one official installation path for external plugins — an npm package installed
through the profile's bundle layer stack (`dsh plugin --profile web add`, restart to
take effect); the legacy `.dsh-plugin/` loading path (`dsh.entry`, `/pet/ui.js` +
`httpServer.tapIndex`, self-executing client) is gone and must be dropped, not kept.

## Grading Boundary (important)

There is no browser inside the container, so the judge does not execute client.js at
runtime; "real recognition in the browser roster" is judged as: after a web cold boot,
exchange the bootstrap token for a Cookie, GET `/`, and check that the host's announced
boot graph (`__DSH_BOOT__`) contains the `@demo/dsh-bench-repo/client.js` entry. The
`__ModuleLoader__` mount and real DOM behavior are not covered; the legacy-removal
check is a static grep of the Node half for `/pet/ui.js` and `httpServer.tapIndex`.