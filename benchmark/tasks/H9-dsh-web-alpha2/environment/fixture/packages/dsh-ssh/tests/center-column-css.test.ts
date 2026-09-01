/**
 * Center-column takeover CSS guards (issue #100): the hide rule must keep its
 * !important (the rc.6 shell wraps the conversation in a node with an inline
 * `display: contents` that beats a plain stylesheet rule), cover both the
 * pane attribute and the center-column class, and the panel view must stay
 * above the host code-block copy banner (sticky, z-index 6) with an opaque
 * backdrop.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/panel/panel.module.css', import.meta.url), 'utf8')

describe('ssh center-column takeover css', () => {
  it('hides the conversation children with !important', () => {
    const hideBlock = css.match(/>\s*:not\(\[data-dsh-ssh-view\]\)\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(hideBlock).toContain('display: none !important')
  })

  it('targets both the pane attribute and the center-column class', () => {
    expect(css).toContain("[data-pane='conversation'] > :not([data-dsh-ssh-view])")
    expect(css).toContain("[class*='centerCol'] > :not([data-dsh-ssh-view])")
  })

  it('makes both column shapes the positioned anchor of the panel view (issue #243)', () => {
    const anchorBlock = css.match(/\[class\*='centerCol'\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(anchorBlock).toContain('position: relative')
    expect(css.match(/\[data-pane='conversation'\],\s*\[class\*='centerCol'\]\s*\{/)).not.toBeNull()
  })

  it('keeps the panel view above the host banner with an opaque backdrop', () => {
    const viewBlock = css.match(/\[data-dsh-ssh-view\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(viewBlock).toContain('z-index: 60')
    expect(viewBlock).toContain('background: var(--dsw-alias-bg-base)')
  })
})
