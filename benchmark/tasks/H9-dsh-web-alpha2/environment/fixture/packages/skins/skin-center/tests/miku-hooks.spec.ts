/**
 * Focused tests for the miku skin ports (v1 -> v2 skin-center): custom
 * cursor injection, right-panel collapse handling, and the light-theme art
 * asset wiring. Exercises the real skins/miku/hooks.mjs in jsdom.
 */

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import defineSkinHooks from '../skins/miku/hooks.mjs'

/** Locate the miku skin asset dir no matter whether vitest's cwd is the
 *  package root or the monorepo root. */
function mikuSkinDir(): string {
  for (const base of [process.cwd(), path.resolve(process.cwd(), 'packages/skins/skin-center')]) {
    const dir = path.join(base, 'skins', 'miku')
    if (existsSync(path.join(dir, 'skin.json'))) return dir
  }
  throw new Error('cannot locate skins/miku directory')
}

function readManifest() {
  return JSON.parse(readFileSync(path.join(mikuSkinDir(), 'skin.json'), 'utf8')) as {
    contributes: {
      backgroundMedia: { light: { src: string }; dark: { src: string } }
    }
  }
}

function setup() {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  document.documentElement.setAttribute('data-dsh-skin', 'miku')
  const cleanups: Array<() => void> = []
  const ctx = { onCleanup: (fn: () => void) => cleanups.push(fn) }
  const runCleanup = () => {
    for (const fn of cleanups.splice(0)) fn()
  }
  return { ctx, runCleanup, cleanups }
}

function rect(width: number): DOMRect {
  return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
}

describe('miku hooks: custom cursors', () => {
  it('injects a scoped cursor style and retracts it on cleanup', () => {
    const { ctx, runCleanup } = setup()
    defineSkinHooks().apply(ctx)

    const style = document.head.querySelector('style[data-dsh-skin-cursor]') as HTMLStyleElement | null
    expect(style).not.toBeNull()
    expect(style!.textContent).toContain('html[data-dsh-skin="miku"]')
    expect(style!.textContent).toContain('cursor: url("data:image/png;base64,iVBOR')

    runCleanup()
    expect(document.head.querySelector('style[data-dsh-skin-cursor]')).toBeNull()
  })
})

describe('miku hooks: collapse handling', () => {
  it('toggles body[data-dsh-aionui-collapsed] from a collapsed aionui root', () => {
    const { ctx, runCleanup } = setup()
    const collapsed = document.createElement('div')
    collapsed.className = 'aionui-root'
    vi.spyOn(collapsed, 'getBoundingClientRect').mockReturnValue(rect(10))
    document.body.appendChild(collapsed)

    defineSkinHooks().apply(ctx)
    // The poll's initial sync runs once during apply().
    expect(document.body.hasAttribute('data-dsh-aionui-collapsed')).toBe(true)

    runCleanup()
    expect(document.body.hasAttribute('data-dsh-aionui-collapsed')).toBe(false)
  })

  it('leaves the body flag unset when no panel is collapsed', () => {
    const { ctx, runCleanup } = setup()
    const wide = document.createElement('div')
    wide.className = 'aionui-root'
    vi.spyOn(wide, 'getBoundingClientRect').mockReturnValue(rect(400))
    document.body.appendChild(wide)

    defineSkinHooks().apply(ctx)
    expect(document.body.hasAttribute('data-dsh-aionui-collapsed')).toBe(false)
    runCleanup()
  })
})

describe('miku skin: light-theme art', () => {
  it('declares its own light art and ships the asset file', () => {
    const manifest = readManifest()
    const light = manifest.contributes.backgroundMedia.light
    expect(light.src).toBe('assets/miku-art-light.jpg')
    // Keep dark on the shared art untouched.
    expect(manifest.contributes.backgroundMedia.dark.src).toBe('assets/miku-art.webp')
    const assetPath = path.join(mikuSkinDir(), light.src)
    expect(existsSync(assetPath)).toBe(true)
    const head = readFileSync(assetPath)
    // JPEG magic bytes FF D8 FF.
    expect(head[0]).toBe(0xff)
    expect(head[1]).toBe(0xd8)
    expect(head[2]).toBe(0xff)
  })
})
