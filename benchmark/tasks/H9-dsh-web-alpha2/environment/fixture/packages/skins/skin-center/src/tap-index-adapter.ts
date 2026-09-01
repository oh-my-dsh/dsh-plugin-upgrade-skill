/**
 * Skin bootstrap adapter (issue #506, contract section 8). Stylesheets use the
 * structured `webserver/index-inject` table introduced in DSH 0.1.1, so the
 * same rows work in served HTML and worker boot payloads. The raw `tapIndex`
 * escape hatch remains only for stamping html[data-dsh-skin], which no
 * structured row can express, and as a compatibility fallback when rows were
 * not rendered ahead of the tap.
 *
 * Fail-closed: any problem yields the stock look plus at most one warning per
 * adapter and reason. Neither the row collector nor the tap throws.
 * @module @linxin666/dsh-client-ui-skin-center/tap-index-adapter
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { findSkin, loadSkinCatalog } from './skin-repo.ts'
import type { SkinCatalog } from './skin-repo.ts'
import { SKIN_CENTER_V2_PREFIX } from './routes-v2.ts'

export interface SkinIndexTapDeps {
  readActiveId: () => string | null
  loadCatalog?: () => SkinCatalog
  /** Defaults to console.warn; tests inject a collector. */
  warn?: (message: string) => void
}

const HTML_TAG = /<html(\s[^>]*)?>/i
const HEAD_CLOSE = /<\/head>/i
const SKIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Stamp or replace data-dsh-skin on the <html> tag. */
export function stampSkinAttribute(html: string, skinId: string): string {
  return html.replace(HTML_TAG, (match, attrs: string | undefined) => {
    const rest = attrs ?? ''
    if (/\sdata-dsh-skin=/.test(rest)) {
      return match.replace(/\sdata-dsh-skin=("[^"]*"|'[^']*'|[^\s>]+)/, ` data-dsh-skin="${skinId}"`)
    }
    return `<html${rest} data-dsh-skin="${skinId}">`
  })
}

/** Build the link tags injected before </head>. */
export function skinLinkTags(skinId: string, hasPatches: boolean): string {
  if (!SKIN_ID.test(skinId)) throw new TypeError(`invalid skin id: ${skinId}`)
  const base = `${SKIN_CENTER_V2_PREFIX}/skins/${skinId}`
  const links = [
    `<link rel="stylesheet" href="${base}/stylesheet" data-dsh-skin-link="stylesheet">`,
  ]
  if (hasPatches) {
    links.push(`<link rel="stylesheet" href="${base}/patches" data-dsh-skin-link="patches">`)
  }
  return links.join('')
}

/** Build the structured rows collected fresh for every index render. */
export function makeSkinIndexRows(deps: SkinIndexTapDeps): () => IndexInjection[] {
  const loadCatalog = deps.loadCatalog ?? (() => loadSkinCatalog())
  const warn = deps.warn ?? ((message: string) => console.warn(`[skin-center] ${message}`))
  const warned = new Set<string>()
  const warnOnce = (reason: string, message: string) => {
    if (warned.has(reason)) return
    warned.add(reason)
    warn(message)
  }

  return (): IndexInjection[] => {
    try {
      const active = deps.readActiveId()
      if (!active) return []
      const entry = findSkin(loadCatalog(), active)
      if (!entry) {
        warnOnce(`missing:${active}`, `active skin "${active}" not in catalog; serving stock look`)
        return []
      }
      return [{
        kind: 'html',
        placement: 'head',
        html: skinLinkTags(active, entry.manifest.contributes.patches !== undefined),
      }]
    } catch (error) {
      warnOnce('row-error', `skin index rows failed closed: ${(error as Error)?.message ?? error}`)
      return []
    }
  }
}

/**
 * Create the raw index tap. Structured rows run before it on DSH 0.1.1; when
 * their marker is present the tap only stamps the html element. Without the
 * marker it also injects links, preserving fail-closed behavior on older hosts.
 */
export function makeSkinIndexTap(deps: SkinIndexTapDeps): (html: string) => string {
  const loadCatalog = deps.loadCatalog ?? (() => loadSkinCatalog())
  const warn = deps.warn ?? ((message: string) => console.warn(`[skin-center] ${message}`))
  const warned = new Set<string>()
  const warnOnce = (reason: string, message: string) => {
    if (warned.has(reason)) return
    warned.add(reason)
    warn(message)
  }

  return (html: string): string => {
    try {
      const active = deps.readActiveId()
      if (!active) return html
      const catalog = loadCatalog()
      const entry = findSkin(catalog, active)
      if (!entry) {
        warnOnce(`missing:${active}`, `active skin "${active}" not in catalog; serving stock look`)
        return html
      }
      if (!HTML_TAG.test(html) || !HEAD_CLOSE.test(html)) {
        warnOnce('malformed-html', 'index.html has no <html>/</head> anchors; skipping skin injection')
        return html
      }
      const stamped = stampSkinAttribute(html, active)
      if (stamped.includes('data-dsh-skin-link=')) return stamped
      const links = skinLinkTags(active, entry.manifest.contributes.patches !== undefined)
      return stamped.replace(HEAD_CLOSE, `${links}</head>`)
    } catch (error) {
      warnOnce('tap-error', `skin index tap failed closed: ${(error as Error)?.message ?? error}`)
      return html
    }
  }
}
