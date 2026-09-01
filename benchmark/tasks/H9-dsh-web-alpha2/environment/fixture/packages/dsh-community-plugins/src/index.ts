/**
 * Host half of the community plugin index data source. The package no longer
 * ships a settings surface: the community index (community.json) is consumed
 * by the Workshop store plugin list and the dsh-market.com plugin
 * manifest. The host half stays as an inert cordis entry so existing
 * profiles and the aggregate keep resolving the row; the row can be removed
 * through the plugin manager.
 * @module @linxin666/dsh-client-ui-community-plugins
 */

import type { Context } from '@deepseek-ai/cordis'
import { mountOnce } from './mount-once.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'ui-community-plugins'

/** Services the inert entry needs: none. */
export const inject = []

/**
 * Inert apply: the data source carries no runtime behavior.
 * @param _ctx - cordis context.
 */
export const apply = mountOnce('@linxin666/dsh-client-ui-community-plugins', (_ctx: Context) => {})
