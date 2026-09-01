/**
 * Browser half of the attach seam: the upload client for the host
 * /describe-image/attach route. The browser sends the picked image as base64
 * text; the host validates magic bytes, persists the bytes in the attachment
 * store, and returns both a durable `[image attachment ...]` note and
 * self-contained Markdown reference. Image bytes never enter the conversation
 * log — only durable reference text does.
 * @module @linxin666/dsh-tool-describe-image/client/attach
 */

/** The host attach endpoint, same-origin with the web shell. */
export const ATTACH_ENDPOINT = '/describe-image/attach'

/**
 * Read a picked file as base64 text (no data-URL prefix).
 * @param file - the file the user picked.
 * @returns the base64 payload, or a structured rejection.
 */
export function readFileAsBase64(file: File): Promise<{ ok: true; base64: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ ok: false, message: 'read-failed' })
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      if (comma < 0) {
        resolve({ ok: false, message: 'read-failed' })
        return
      }
      resolve({ ok: true, base64: result.slice(comma + 1) })
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Upload base64 image bytes to the host attach route.
 * @param base64 - the base64 image payload.
 * @param mediaType - the declared media type (verified against magic bytes on the host).
 * @param name - optional display name.
 * @returns durable note and Markdown reference text, or a structured rejection.
 */
export async function uploadImageForDescribe(
  base64: string,
  mediaType: string,
  name?: string,
): Promise<{ ok: true; note: string; markdown: string } | { ok: false; message: string }> {
  let response: Response
  try {
    response = await fetch(ATTACH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: base64, mediaType, ...name === undefined ? {} : { name } }),
    })
  } catch {
    return { ok: false, message: 'network-failed' }
  }
  let envelope: unknown
  try {
    envelope = await response.json()
  } catch {
    return { ok: false, message: 'bad-response' }
  }
  const record = envelope as { ok?: unknown; value?: unknown; error?: unknown } | null
  if (typeof record !== 'object' || record === null) return { ok: false, message: 'bad-response' }
  if (record.ok === true && typeof record.value === 'object' && record.value !== null) {
    const value = record.value as { note?: unknown; markdown?: unknown }
    if (typeof value.note === 'string' && value.note !== '') {
      return { ok: true, note: value.note, markdown: typeof value.markdown === 'string' ? value.markdown : value.note }
    }
    return { ok: false, message: 'bad-response' }
  }
  const message = (record.error as { message?: unknown } | null)?.message
  return { ok: false, message: typeof message === 'string' && message !== '' ? message : 'server-failed' }
}

