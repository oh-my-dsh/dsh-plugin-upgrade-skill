/**
 * Center-column takeover CSS guards (issue #100): the hide rule must keep its
 * !important (the rc.6 shell wraps the conversation in a node with an inline
 * `display: contents` that beats a plain stylesheet rule), cover both the
 * pane attribute and the center-column class, and the board view must stay
 * above the host code-block copy banner (sticky, z-index 6) with an opaque
 * backdrop.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/board.module.css', import.meta.url), 'utf8')

describe('board center-column takeover css', () => {
  it('hides the conversation children with !important', () => {
    const hideBlock = css.match(/>\s*:not\(\[data-dsh-taskboard-view\]\)\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(hideBlock).toContain('display: none !important')
  })

  it('targets both the pane attribute and the center-column class', () => {
    expect(css).toContain("[data-pane='conversation'] > :not([data-dsh-taskboard-view])")
    expect(css).toContain("[class*='centerCol'] > :not([data-dsh-taskboard-view])")
  })

  it('keeps the board view above the host banner with an opaque backdrop', () => {
    const viewBlock = css.match(/\[data-dsh-taskboard-view\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(viewBlock).toContain('z-index: 60')
    expect(viewBlock).toContain('background: var(--dsw-alias-bg-base)')
  })
})
