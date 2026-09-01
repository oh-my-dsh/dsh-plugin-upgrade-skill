/**
 * Browser-half upload client tests against a stubbed fetch. DOM-dependent
 * pieces (FileReader) stay untested here — thin browser glue over the
 * covered paths.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadImageForDescribe } from '../src/client/attach.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadImageForDescribe', () => {
  it('posts base64, type, and name and returns the note', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.data).toBe('QUJD')
      expect(body.mediaType).toBe('image/png')
      expect(body.name).toBe('pic.png')
      return new Response(JSON.stringify({ ok: true, value: { note: '[image attachment {}]', markdown: '![图片](/describe-image/raw/sha256:x)' } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const outcome = await uploadImageForDescribe('QUJD', 'image/png', 'pic.png')
    expect(outcome).toEqual({ ok: true, note: '[image attachment {}]', markdown: '![图片](/describe-image/raw/sha256:x)' })
    expect(fetchMock).toHaveBeenCalledWith('/describe-image/attach', expect.objectContaining({ method: 'POST' }))
  })

  it('omits the name when absent', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, value: { note: 'N' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await uploadImageForDescribe('QUJD', 'image/png')
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>
    expect('name' in body).toBe(false)
  })

  it('surfaces the server rejection message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'rejected', message: 'too big' } }), { status: 422 })))
    const outcome = await uploadImageForDescribe('QUJD', 'image/png')
    expect(outcome).toEqual({ ok: false, message: 'too big' })
  })

  it('maps a network failure to a stable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed to fetch') }))
    const outcome = await uploadImageForDescribe('QUJD', 'image/png')
    expect(outcome).toEqual({ ok: false, message: 'network-failed' })
  })

  it('maps a non-JSON response to a stable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    const outcome = await uploadImageForDescribe('QUJD', 'image/png')
    expect(outcome).toEqual({ ok: false, message: 'bad-response' })
  })

  it('maps an ok envelope without a note to a stable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, value: {} }), { status: 200 })))
    const outcome = await uploadImageForDescribe('QUJD', 'image/png')
    expect(outcome).toEqual({ ok: false, message: 'bad-response' })
  })
})
