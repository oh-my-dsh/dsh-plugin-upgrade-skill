/**
 * Standalone build config for the dsh-liangshen plugin.
 *
 * Uses the repo's shared client-bundle preset (shared/tsdown.client.ts):
 * the node half (preset sync + announcement) builds to lib/. There is no
 * src/client entry, so no browser bundle is emitted — this plugin is host-only.
 */
import { clientBundle } from '../../shared/tsdown.client.ts'

export default clientBundle('@linxin666/dsh-liangshen', ['src/index.ts'], {
  libExternal: ['@deepseek-ai/dsh-system-prompt'],
})
