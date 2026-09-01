import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UUID_POLYFILL_SCRIPT } from '../src/uuid-polyfill.ts'

describe('uuid-polyfill', () => {
  let originalCrypto: unknown

  beforeEach(() => {
    originalCrypto = (globalThis as Record<string, unknown>).crypto
    // Clean up crypto to simulate old browser or HTTP context
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true,
    })
  })

  it('provides UUID_POLYFILL_SCRIPT as a valid self-executing script string', () => {
    expect(typeof UUID_POLYFILL_SCRIPT).toBe('string')
    expect(UUID_POLYFILL_SCRIPT).toContain('randomUUID')
  })

  it('polyfills randomUUID correctly when not present', () => {
    // The script is a self-executing IIFE; run it directly.
    // eslint-disable-next-line no-eval
    ;(0, eval)(UUID_POLYFILL_SCRIPT)

    const cryptoObj = (globalThis as Record<string, unknown>).crypto as Record<string, unknown>
    expect(cryptoObj).toBeDefined()
    expect(typeof cryptoObj.randomUUID).toBe('function')

    // Test the generated UUID format
    const uuid = (cryptoObj.randomUUID as () => string)()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('polyfills randomUUID correctly when crypto exists but lacks randomUUID', () => {
    // Set up a partial crypto object
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256)
          }
          return arr
        },
      },
      writable: true,
      configurable: true,
    })

    // eslint-disable-next-line no-eval
    ;(0, eval)(UUID_POLYFILL_SCRIPT)

    const cryptoObj = (globalThis as Record<string, unknown>).crypto as Record<string, unknown>
    expect(typeof cryptoObj.randomUUID).toBe('function')

    const uuid = (cryptoObj.randomUUID as () => string)()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('does not override existing randomUUID', () => {
    const mockRandomUUID = vi.fn().mockReturnValue('mock-uuid')
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: mockRandomUUID,
      },
      writable: true,
      configurable: true,
    })

    // eslint-disable-next-line no-eval
    ;(0, eval)(UUID_POLYFILL_SCRIPT)

    const cryptoObj = (globalThis as Record<string, unknown>).crypto as Record<string, unknown>
    expect((cryptoObj.randomUUID as () => string)()).toBe('mock-uuid')
    expect(mockRandomUUID).toHaveBeenCalled()
  })
})
