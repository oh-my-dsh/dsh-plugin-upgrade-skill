import { describe, expect, it } from 'vitest'

import {
  extractSkinBackgroundUserLayer,
  reconcileSkinBackgroundScope,
  serializeSkinBackgroundUserLayer,
  skinBackgroundUserPatch,
} from '../src/core/background-scope.ts'

const current = {
  enabled: true,
  backgroundOpacity: 100,
  backgroundBlurEmpty: 0,
  backgroundBlurContent: 0,
  inputCardBlur: 10,
  bubbleOpacity: 50,
}

describe('skin-background scope reconciliation', () => {
  it('ignores a repeated namespace revision', () => {
    expect(reconcileSkinBackgroundScope(current, { revision: 7, user: undefined }, 7, undefined)).toMatchObject({
      accepted: false,
      revision: 7,
      patch: null,
    })
  })

  it('does not turn resolved defaults into a v2 patch', () => {
    expect(skinBackgroundUserPatch(current, { backgroundBlurEmpty: 4 })).toEqual({
      backgroundBlurEmpty: 4,
    })
    expect(skinBackgroundUserPatch(current, undefined)).toBeNull()
  })

  it('preserves an authoritative opacity when another legacy field is customized', () => {
    const result = reconcileSkinBackgroundScope(
      current,
      { revision: 8, user: { backgroundBlurEmpty: 4 } },
      7,
      undefined,
    )
    expect(result).toMatchObject({
      accepted: true,
      revision: 8,
      patch: { backgroundBlurEmpty: 4 },
    })
    expect({ ...current, ...result.patch }).toMatchObject({
      backgroundOpacity: 100,
      backgroundBlurEmpty: 4,
    })
  })

  it('accepts an explicitly stored default as an intentional user choice', () => {
    expect(skinBackgroundUserPatch(current, { backgroundOpacity: 0 })).toEqual({
      backgroundOpacity: 0,
    })
  })

  it('drops unknown and malformed user fields', () => {
    expect(extractSkinBackgroundUserLayer({ backgroundOpacity: '0', unknown: 1 })).toBeNull()
    expect(extractSkinBackgroundUserLayer({ backgroundOpacity: 0, unknown: 1 })).toEqual({ backgroundOpacity: 0 })
  })
})

describe('scope replay protection (#1109, #1107)', () => {
  it('rejects a revision bump when user layer content has not changed', () => {
    const userLayer = { backgroundOpacity: 0 }
    const prevJson = serializeSkinBackgroundUserLayer(userLayer)
    const result = reconcileSkinBackgroundScope(
      current,
      { revision: 8, user: userLayer },
      7,
      prevJson,
    )
    expect(result.accepted).toBe(false)
    expect(result.patch).toBeNull()
    expect(result.lastUserJson).toBe(prevJson)
  })

  it('rejects consecutive revision bumps as long as user layer stays the same', () => {
    const userLayer = { backgroundOpacity: 0 }
    const prevJson = serializeSkinBackgroundUserLayer(userLayer)
    for (let rev = 8; rev <= 12; rev++) {
      const result = reconcileSkinBackgroundScope(
        current,
        { revision: rev, user: userLayer },
        rev - 1,
        prevJson,
      )
      expect(result.accepted).toBe(false)
      expect(result.patch).toBeNull()
    }
  })

  it('accepts a revision bump when user layer content has actually changed', () => {
    const oldUser = { backgroundOpacity: 0 }
    const newUser = { backgroundOpacity: 60 }
    const prevJson = serializeSkinBackgroundUserLayer(oldUser)
    const result = reconcileSkinBackgroundScope(
      current,
      { revision: 8, user: newUser },
      7,
      prevJson,
    )
    expect(result.accepted).toBe(true)
    expect(result.patch).toEqual({ backgroundOpacity: 60 })
    expect(result.lastUserJson).toBe(serializeSkinBackgroundUserLayer(newUser))
  })

  it('rejects revision bumps when user layer is and remains empty (#1184)', () => {
    // Other plugin (e.g. agent-default-model) bumps revision while skin-background user layer is empty
    const result = reconcileSkinBackgroundScope(
      current,
      { revision: 8, user: undefined },
      7,
      '',
    )
    expect(result.accepted).toBe(false)
    expect(result.patch).toBeNull()
    expect(result.lastUserJson).toBe('')
  })

  it('rejects revision bumps when user layer becomes empty (#1184)', () => {
    const oldUser = { backgroundOpacity: 50 }
    const prevJson = serializeSkinBackgroundUserLayer(oldUser)
    const result = reconcileSkinBackgroundScope(
      current,
      { revision: 8, user: undefined },
      7,
      prevJson,
    )
    expect(result.accepted).toBe(false)
    expect(result.patch).toBeNull()
    expect(result.lastUserJson).toBe('')
  })
})

