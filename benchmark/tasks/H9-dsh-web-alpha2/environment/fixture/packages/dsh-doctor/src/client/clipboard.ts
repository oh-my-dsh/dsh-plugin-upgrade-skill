/**
 * Clipboard write shared by the recovery console surfaces (the send-to-Harness
 * dialog copy button and the failed-plugin row copy). Never rejects and never
 * throws: an unavailable clipboard degrades to a false result instead of
 * breaking the console.
 * @module @linxin666/dsh-doctor/client
 */

/** Copy text to the clipboard; resolves to whether it landed. */
export function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      return navigator.clipboard.writeText(value).then(() => true, () => false)
    }
    if (typeof document !== 'undefined') {
      const area = document.createElement('textarea')
      area.value = value
      document.body.appendChild(area)
      area.select()
      let ok = false
      try {
        ok = document.execCommand('copy') === true
      } catch {
        ok = false
      }
      document.body.removeChild(area)
      return Promise.resolve(ok)
    }
    return Promise.resolve(false)
  } catch {
    return Promise.resolve(false)
  }
}
