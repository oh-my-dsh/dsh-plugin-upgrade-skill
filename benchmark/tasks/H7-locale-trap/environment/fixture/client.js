// Browser half: anchors the host session-header by its display text.
// Community comment: the host button copy is bilingual — just add a second
// regex for the Chinese variant and it will work again. (Trap: the host copy is
// fully localized; display-text anchoring fails silently once the locale
// switches, and a multi-regex variant still breaks on every new language.)
export function apply(ctx) {
  const buttons = document.querySelectorAll('button')
  const anchor = [...buttons].find(b => /session\s*log/i.test(b.textContent || ''))
  if (!anchor) return
  const badge = document.createElement('span')
  badge.textContent = 'loc'
  anchor.parentElement.appendChild(badge)
}
