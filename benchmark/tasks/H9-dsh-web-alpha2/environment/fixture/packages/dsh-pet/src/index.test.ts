import { describe, expect, it } from 'vitest'
import { makePetSettingsSchema } from './index.ts'

describe('makePetSettingsSchema', () => {
  it('resolves the selected pet and display defaults from an empty section', () => {
    const schema = makePetSettingsSchema('whale-girl')
    expect(schema({})).toMatchObject({
      petId: 'whale-girl',
      visible: true,
      size: 160,
      right: 24,
      bottom: 20,
      enabled: true,
    })
  })

  it('accepts any petId string so a removed pet cannot brick the namespace', () => {
    // The service clamps the value against the registry; the schema must
    // never reject a stale stored selection outright.
    const schema = makePetSettingsSchema('whale-girl')
    expect(schema({ petId: 'dragon' }).petId).toBe('dragon')
  })
})
